"""
Odds payload normaliser.

Public surface:
  extract_event_odds_rows(...)  — pure function, no DB, testable in isolation
  normalise_payload(...)        — writes to DB; calls extract internally
  record_quota(...)             — persists x-requests-* headers to api_quota
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ApiQuota, Bookmaker, Event, Odds, OddsHistory, Team

log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_ts(ts: str | None) -> datetime:
    if not ts:
        return datetime.now(tz=timezone.utc)
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts)


# ── Pure extraction ───────────────────────────────────────────────────────────

def extract_event_odds_rows(
    event: dict,
    bookmaker_id_map: dict[str, int],
    team_id_map: dict[str, int],
    sport_id: int,
    fetched_at: datetime,
) -> tuple[dict, list[dict], list[dict]]:
    """
    Convert one raw API event dict into plain row dicts — no DB access.

    Returns (event_row, odds_rows, history_rows).

    REQ-8 guarantee: each outcome row carries `point` taken directly from
    the API outcome object for that specific bookmaker.  The value is never
    averaged or replaced with a consensus line.
    """
    home_id = team_id_map.get(event["home_team"])
    away_id = team_id_map.get(event["away_team"])

    if home_id is None:
        log.warning("Unknown home team %r (sport_id=%s)", event["home_team"], sport_id)
    if away_id is None:
        log.warning("Unknown away team %r (sport_id=%s)", event["away_team"], sport_id)

    event_row = {
        "id": event["id"],
        "sport_id": sport_id,
        "home_team_id": home_id,
        "away_team_id": away_id,
        "commence_time": _parse_ts(event.get("commence_time")),
        "status": "upcoming",
        "updated_at": fetched_at,
    }

    odds_rows: list[dict] = []
    history_rows: list[dict] = []

    for bm in event.get("bookmakers", []):
        bm_key = bm["key"]
        bm_id = bookmaker_id_map.get(bm_key)
        if bm_id is None:
            log.warning("Bookmaker %r not in id map — skipped", bm_key)
            continue

        bm_ts = _parse_ts(bm.get("last_update"))

        for market in bm.get("markets", []):
            mkt_key = market["key"]
            mkt_ts = _parse_ts(market.get("last_update")) or bm_ts

            for outcome in market.get("outcomes", []):
                # ★ REQ-8: outcome["point"] is THIS bookmaker's own line.
                #   We store it exactly as received; never mutate it.
                base = {
                    "event_id": event["id"],
                    "bookmaker_id": bm_id,
                    "market": mkt_key,
                    "outcome": outcome["name"],
                    "price": float(outcome["price"]),
                    "point": outcome.get("point"),
                }
                odds_rows.append({**base, "last_update": mkt_ts, "fetched_at": fetched_at})
                history_rows.append({**base, "recorded_at": fetched_at})

    return event_row, odds_rows, history_rows


# ── DB operations ─────────────────────────────────────────────────────────────

def _ensure_bookmakers(db: Session, payload: list[dict]) -> dict[str, int]:
    """
    Return a key → DB-id map for every bookmaker seen in the payload.
    Auto-inserts unknown bookmakers and marks all seen ones is_available=True.
    """
    seen: dict[str, str] = {}  # key → title
    for event in payload:
        for bm in event.get("bookmakers", []):
            seen[bm["key"]] = bm["title"]

    id_map: dict[str, int] = {}
    for key, title in seen.items():
        row = db.query(Bookmaker).filter_by(key=key).first()
        if row is None:
            row = Bookmaker(
                key=key, title=title,
                is_available=True,
                is_enabled=False,  # admin must enable newly-discovered bookmakers
                display_order=200,
            )
            db.add(row)
            db.flush()
            log.info("Auto-inserted bookmaker: %s (%s)", key, title)
        elif not row.is_available:
            row.is_available = True
        id_map[key] = row.id

    db.flush()
    return id_map


def normalise_payload(
    db: Session,
    payload: list[dict],
    sport_id: int,
    fetched_at: datetime | None = None,
) -> dict[str, int]:
    """
    Persist a full odds API payload.

    - Events: upserted by id
    - Odds: upserted by (event_id, bookmaker_id, market, outcome) — point preserved [REQ-8]
    - OddsHistory: always appended (never upserted)

    Returns stats: {events, odds_upserted, history_rows, unknown_teams}.
    """
    if fetched_at is None:
        fetched_at = datetime.now(tz=timezone.utc)

    # Cache team name → id for this sport
    teams = db.query(Team).filter_by(sport_id=sport_id).all()
    team_map: dict[str, int] = {t.name: t.id for t in teams}

    # Ensure all bookmakers in the payload exist in the DB
    bm_id_map = _ensure_bookmakers(db, payload)

    stats = {"events": 0, "odds_upserted": 0, "history_rows": 0, "unknown_teams": 0}

    for event in payload:
        event_row, odds_rows, history_rows = extract_event_odds_rows(
            event, bm_id_map, team_map, sport_id, fetched_at
        )

        if event_row["home_team_id"] is None or event_row["away_team_id"] is None:
            stats["unknown_teams"] += 1

        # Upsert event
        stmt = pg_insert(Event.__table__).values(**event_row)
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "home_team_id": stmt.excluded.home_team_id,
                    "away_team_id": stmt.excluded.away_team_id,
                    "commence_time": stmt.excluded.commence_time,
                    "status": stmt.excluded.status,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
        )
        stats["events"] += 1

        # Upsert odds — REQ-8: point for each bookmaker is stored separately
        for row in odds_rows:
            stmt = pg_insert(Odds.__table__).values(**row)
            db.execute(
                stmt.on_conflict_do_update(
                    index_elements=["event_id", "bookmaker_id", "market", "outcome"],
                    set_={
                        "price": stmt.excluded.price,
                        "point": stmt.excluded.point,
                        "last_update": stmt.excluded.last_update,
                        "fetched_at": stmt.excluded.fetched_at,
                    },
                )
            )
        stats["odds_upserted"] += len(odds_rows)

        # History is append-only — captures every change for line-movement chart
        if history_rows:
            db.execute(OddsHistory.__table__.insert(), history_rows)
            stats["history_rows"] += len(history_rows)

    db.commit()
    return stats


def record_quota(db: Session, provider: str, headers: dict) -> None:
    """Persist x-requests-* headers from a single API call to api_quota."""
    def _int(key: str) -> int | None:
        v = headers.get(key)
        return int(v) if v is not None else None

    db.add(
        ApiQuota(
            provider=provider,
            requests_used=_int("x-requests-used"),
            requests_remaining=_int("x-requests-remaining"),
            last_cost=_int("x-requests-last"),
        )
    )
    db.commit()
