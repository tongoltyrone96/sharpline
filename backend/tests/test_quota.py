"""
Phase 4 gate tests — Quota Governor.

All tests are pure (no DB, no Redis, no API calls). The governor's
logic is exercised by injecting fakes for every external dependency.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.quota import QuotaGovernor, RESERVE_FLOOR_PCT


# ── Fakes ─────────────────────────────────────────────────────────────────────

def _sport(in_season=True, is_available=True, key="rugbyleague_nrl", id=1):
    s = MagicMock()
    s.in_season = in_season
    s.is_available = is_available
    s.key = key
    s.id = id
    return s


@contextmanager
def _governor(
    credits_remaining=15000,
    budget_monthly=20000.0,
    hours_to_nearest=2.0,
    poll_mode="auto",
    last_polled=None,
):
    """Build a governor with all external state injected as mocks."""
    db = MagicMock()
    redis = MagicMock()

    # credits_remaining from api_quota table
    quota_row = MagicMock()
    quota_row.requests_remaining = credits_remaining
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = quota_row

    # budget_monthly from model_params
    param_row = MagicMock()
    param_row.value = budget_monthly

    gov = QuotaGovernor(db, redis)

    # Patch internal helpers
    gov.credits_remaining = lambda: credits_remaining
    gov.budget_monthly = lambda: budget_monthly
    gov.days_until_reset = lambda: 15  # mid-month

    if hours_to_nearest is not None:
        gov._nearest_hours = lambda sport: hours_to_nearest
    else:
        gov._nearest_hours = lambda sport: None

    # Redis: last_polled
    redis.get.return_value = (
        last_polled.isoformat().encode() if last_polled else None
    )

    with patch("app.services.quota.settings") as mock_settings:
        mock_settings.ODDS_POLL_MODE = poll_mode
        yield gov, mock_settings


# ── Mode tests ────────────────────────────────────────────────────────────────

class TestMode:
    def test_explicit_rich_mode(self):
        with _governor(poll_mode="rich") as (gov, _):
            assert gov.mode() == "rich"

    def test_explicit_lean_mode(self):
        with _governor(poll_mode="lean") as (gov, _):
            assert gov.mode() == "lean"

    def test_auto_rich_when_credits_healthy(self):
        # 15000 remaining / 15 days = 1000/day — well above lean threshold
        with _governor(credits_remaining=15000, poll_mode="auto") as (gov, _):
            assert gov.mode() == "rich"

    def test_auto_lean_when_low_credits_per_day(self):
        # budget=1000 → floor=100. remaining=300 is above floor (300>100)
        # but 300/15 days = 20/day < 50 lean threshold → lean
        with _governor(credits_remaining=300, budget_monthly=1000.0, poll_mode="auto") as (gov, _):
            assert gov.mode() == "lean"

    def test_critical_when_below_reserve_floor(self):
        # Reserve floor = 10% of 20000 = 2000. 1500 < 2000 → critical
        with _governor(credits_remaining=1500, budget_monthly=20000.0, poll_mode="auto") as (gov, _):
            assert gov.mode() == "critical"


# ── may_poll gate tests ───────────────────────────────────────────────────────

class TestMayPoll:
    def test_blocks_off_season_sport(self):
        sport = _sport(in_season=False)
        with _governor() as (gov, _):
            assert gov.may_poll(sport) is False

    def test_blocks_unavailable_sport(self):
        sport = _sport(is_available=False)
        with _governor() as (gov, _):
            assert gov.may_poll(sport) is False

    def test_blocks_when_no_events_in_window(self):
        sport = _sport()
        with _governor(hours_to_nearest=None) as (gov, _):
            assert gov.may_poll(sport) is False

    def test_allows_rich_mode_with_event_2h_away(self):
        sport = _sport()
        with _governor(hours_to_nearest=2.0, poll_mode="rich") as (gov, _):
            assert gov.may_poll(sport) is True

    def test_blocks_lean_mode_event_over_24h(self):
        sport = _sport()
        with _governor(hours_to_nearest=30.0, poll_mode="lean") as (gov, _):
            assert gov.may_poll(sport) is False

    def test_allows_lean_mode_event_under_24h(self):
        sport = _sport()
        with _governor(hours_to_nearest=12.0, poll_mode="lean") as (gov, _):
            assert gov.may_poll(sport) is True

    def test_critical_mode_blocks_non_live(self):
        sport = _sport()
        # 2 h to kickoff — not live (< 0.5 h threshold)
        with _governor(credits_remaining=1500, hours_to_nearest=2.0, poll_mode="auto") as (gov, _):
            assert gov.may_poll(sport) is False

    def test_critical_mode_allows_live_game(self):
        sport = _sport()
        # -0.5 h means game started 30 min ago
        with _governor(credits_remaining=1500, hours_to_nearest=-0.5, poll_mode="auto") as (gov, _):
            assert gov.may_poll(sport) is True

    def test_nba_off_season_never_polled(self):
        """The Phase 4 gate: NBA (in_season=False) must never be polled."""
        nba = _sport(in_season=False, key="basketball_nba")
        with _governor(poll_mode="rich") as (gov, _):
            assert gov.may_poll(nba) is False


# ── Interval tests ────────────────────────────────────────────────────────────

class TestIntervalSeconds:
    def test_rich_live_game(self):
        sport = _sport()
        with _governor(hours_to_nearest=0.3, poll_mode="rich") as (gov, _):
            assert gov.interval_seconds(sport) == 30

    def test_rich_1_to_6h(self):
        sport = _sport()
        with _governor(hours_to_nearest=3.0, poll_mode="rich") as (gov, _):
            assert gov.interval_seconds(sport) == 300

    def test_rich_6_to_24h(self):
        sport = _sport()
        with _governor(hours_to_nearest=12.0, poll_mode="rich") as (gov, _):
            assert gov.interval_seconds(sport) == 1800

    def test_rich_over_24h(self):
        sport = _sport()
        with _governor(hours_to_nearest=30.0, poll_mode="rich") as (gov, _):
            assert gov.interval_seconds(sport) == 21600

    def test_lean_live_game(self):
        sport = _sport()
        with _governor(hours_to_nearest=0.3, poll_mode="lean") as (gov, _):
            assert gov.interval_seconds(sport) == 1800

    def test_lean_1_to_6h(self):
        sport = _sport()
        with _governor(hours_to_nearest=3.0, poll_mode="lean") as (gov, _):
            assert gov.interval_seconds(sport) == 7200

    def test_no_events_returns_long_interval(self):
        sport = _sport()
        with _governor(hours_to_nearest=None, poll_mode="rich") as (gov, _):
            assert gov.interval_seconds(sport) == 21600


# ── should_poll_now ───────────────────────────────────────────────────────────

class TestShouldPollNow:
    def test_polls_when_never_polled_before(self):
        sport = _sport()
        with _governor(last_polled=None, hours_to_nearest=2.0, poll_mode="rich") as (gov, _):
            assert gov.should_poll_now(sport) is True

    def test_skips_when_interval_not_elapsed(self):
        sport = _sport()
        # Polled 10 seconds ago, interval is 30s
        recent = datetime.now(tz=timezone.utc) - timedelta(seconds=10)
        with _governor(last_polled=recent, hours_to_nearest=0.3, poll_mode="rich") as (gov, _):
            assert gov.should_poll_now(sport) is False

    def test_polls_when_interval_elapsed(self):
        sport = _sport()
        # Polled 60 seconds ago, interval is 30s
        old = datetime.now(tz=timezone.utc) - timedelta(seconds=60)
        with _governor(last_polled=old, hours_to_nearest=0.3, poll_mode="rich") as (gov, _):
            assert gov.should_poll_now(sport) is True

    def test_skips_when_may_poll_false(self):
        off_season = _sport(in_season=False)
        with _governor(last_polled=None, poll_mode="rich") as (gov, _):
            assert gov.should_poll_now(off_season) is False


# ── Status dict ───────────────────────────────────────────────────────────────

class TestStatus:
    def test_status_contains_required_keys(self):
        with _governor(credits_remaining=15000) as (gov, _):
            s = gov.status()
            for key in ("credits_remaining", "mode", "days_until_reset", "credits_per_day"):
                assert key in s, f"status missing key: {key}"

    def test_status_mode_matches(self):
        with _governor(poll_mode="rich") as (gov, _):
            assert gov.status()["mode"] == "rich"
