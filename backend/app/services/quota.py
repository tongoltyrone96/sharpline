"""
Quota Governor — controls when and how often the odds poller calls The Odds API.

Design rules (DESIGN.md §6):
1. Never poll a sport with in_season=False or is_available=False.
2. Only poll a sport that has an event in the active window [now-3h, now+24h].
3. Adaptive interval by time-to-nearest-kickoff.
4. Mode (rich / lean / critical) derived from credits_remaining.
5. Reserve floor: never spend the last 10% of the monthly budget.
6. Always request all 3 markets in one call — cost is 3 credits either way.
7. One region only (au). Adding a second doubles every cost.
8. Dashboard is served from Redis cache; the browser never triggers an API call.

External state:
  - credits_remaining  read from api_quota table (last row per provider)
  - last_polled_at     stored in Redis (key: sharpline:last_polled:{sport_key})
  - budget_monthly     read from model_params (key: "budget_monthly", default 20000)
"""

import calendar
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ApiQuota, Event, ModelParam, Sport

log = logging.getLogger(__name__)

# Interval table: (rich_seconds, lean_seconds | None)
#   None in lean mode means "don't poll at all for this time horizon"
_INTERVALS = [
    (1,   30,    1800),   # live / < 1 h
    (6,   300,   7200),   # 1 – 6 h
    (24,  1800,  21600),  # 6 – 24 h
    (None, 21600, None),  # > 24 h  (rich: 6 h, lean: skip)
]

RESERVE_FLOOR_PCT = 0.10
LEAN_CREDITS_PER_DAY = 50


class QuotaGovernor:
    def __init__(self, db: Session, redis_client) -> None:
        self._db = db
        self._redis = redis_client

    # ── Credits / budget ──────────────────────────────────────────────────────

    def credits_remaining(self) -> int:
        row = (
            self._db.query(ApiQuota)
            .filter_by(provider="theoddsapi")
            .order_by(ApiQuota.recorded_at.desc())
            .first()
        )
        return int(row.requests_remaining) if row and row.requests_remaining else 0

    def budget_monthly(self) -> float:
        row = self._db.query(ModelParam).filter_by(key="budget_monthly").first()
        return row.value if row else 20000.0

    def days_until_reset(self) -> float:
        today = datetime.now(tz=timezone.utc).date()
        last_day = calendar.monthrange(today.year, today.month)[1]
        return max(last_day - today.day + 1, 1)

    def credits_per_day(self) -> float:
        return self.credits_remaining() / self.days_until_reset()

    # ── Mode ──────────────────────────────────────────────────────────────────

    def mode(self) -> str:
        """
        rich     — poll at full speed
        lean     — poll only imminent games, long intervals
        critical — poll only live games; approaching the reserve floor
        """
        if settings.ODDS_POLL_MODE in ("rich", "lean"):
            return settings.ODDS_POLL_MODE

        remaining = self.credits_remaining()
        floor = self.budget_monthly() * RESERVE_FLOOR_PCT
        if remaining <= floor:
            return "critical"
        if self.credits_per_day() < LEAN_CREDITS_PER_DAY:
            return "lean"
        return "rich"

    # ── Nearest-event helpers ─────────────────────────────────────────────────

    def _nearest_hours(self, sport: Sport) -> float | None:
        """
        Hours until the nearest upcoming / live event for this sport.
        Negative values mean the event is already underway.
        Returns None if there are no events in the [now-3h, now+24h] window.
        """
        now = datetime.now(tz=timezone.utc)
        window_open = now - timedelta(hours=3)
        window_close = now + timedelta(hours=24)

        row = (
            self._db.query(Event.commence_time)
            .filter(
                Event.sport_id == sport.id,
                Event.status.in_(["upcoming", "live"]),
                Event.commence_time >= window_open,
                Event.commence_time <= window_close,
            )
            .order_by(Event.commence_time)
            .first()
        )
        if row is None:
            return None
        delta_h = (row.commence_time - now).total_seconds() / 3600
        return delta_h

    # ── Public API ────────────────────────────────────────────────────────────

    def may_poll(self, sport: Sport) -> bool:
        """
        True iff the governor permits an API call for this sport right now.

        Blocks on:
          - sport.in_season is False
          - sport.is_available is False
          - no event in active window (between rounds)
          - critical mode with no live game
          - lean mode with >24 h to next game
        """
        if not sport.in_season:
            log.debug("may_poll %s → False (not in season)", sport.key)
            return False
        if not sport.is_available:
            log.debug("may_poll %s → False (not in feed)", sport.key)
            return False

        hours = self._nearest_hours(sport)
        if hours is None:
            log.debug("may_poll %s → False (no event in window)", sport.key)
            return False

        current_mode = self.mode()
        if current_mode == "critical" and hours >= 0.5:
            log.debug("may_poll %s → False (critical mode, no live game)", sport.key)
            return False
        if current_mode == "lean" and hours > 24:
            log.debug("may_poll %s → False (lean mode, >24 h)", sport.key)
            return False

        return True

    def interval_seconds(self, sport: Sport) -> int:
        """
        How many seconds should elapse between polls for this sport,
        given its nearest upcoming event and current mode.
        """
        hours = self._nearest_hours(sport)
        current_mode = self.mode()

        if hours is None:
            return 21600  # 6 h — nothing upcoming, check back later

        for threshold, rich_s, lean_s in _INTERVALS:
            if threshold is None or hours < threshold:
                if current_mode == "rich" or current_mode == "critical":
                    return rich_s
                return lean_s if lean_s is not None else 21600

        return 21600

    def should_poll_now(self, sport: Sport) -> bool:
        """
        True iff may_poll AND enough time has elapsed since the last successful poll.
        Uses Redis to track last_polled_at per sport key.
        """
        if not self.may_poll(sport):
            return False

        interval = self.interval_seconds(sport)
        redis_key = f"sharpline:last_polled:{sport.key}"
        last_bytes = self._redis.get(redis_key)

        if last_bytes is None:
            return True  # never polled this sport

        try:
            last_str = last_bytes.decode()
            last_dt = datetime.fromisoformat(last_str)
            elapsed = (datetime.now(tz=timezone.utc) - last_dt).total_seconds()
            return elapsed >= interval
        except Exception:
            return True  # corrupt entry — poll to be safe

    def record_poll(self, sport: Sport) -> None:
        """Call immediately after a successful API response."""
        redis_key = f"sharpline:last_polled:{sport.key}"
        self._redis.set(
            redis_key,
            datetime.now(tz=timezone.utc).isoformat(),
            ex=86400 * 7,  # expire after 7 days so stale keys self-clean
        )

    # ── Status (admin panel / status ribbon) ──────────────────────────────────

    def status(self) -> dict:
        remaining = self.credits_remaining()
        days = self.days_until_reset()
        budget = self.budget_monthly()
        cpd = remaining / max(days, 1)
        # Approximate: 4 active sports × 3 credits = 12 credits per sweep
        sweeps_per_day = cpd / 12 if cpd else 0
        return {
            "credits_remaining": remaining,
            "credits_used_this_cycle": int(budget - remaining),
            "days_until_reset": days,
            "credits_per_day": round(cpd, 1),
            "mode": self.mode(),
            "projected_runway_days": round(remaining / max(cpd, 1), 1) if cpd else None,
            "sweeps_per_day_estimate": round(sweeps_per_day, 1),
        }
