"""
Odds payload normaliser.

Public surface:
  extract_event_odds_rows(...)  — pure function, no DB, testable in isolation
  changed_history_rows(...)     — pure function; drops unchanged history rows
  normalise_payload(...)        — writes to DB; calls extract internally
  record_quota(...)             — persists x-requests-* headers to api_quota
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ApiQuota, Bookmaker, Event, Odds, OddsHistory, Team
from app.services.standings_service import _ALIASES, _norm

log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_ts(ts: str | None) -> datetime:
    if not ts:
        return datetime.now(tz=timezone.utc)
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts)


def _resolve_team_id(team_name: str, team_map: dict[str, int]) -> int | None:
    """Look up team id with normalization + alias fallback.

    Handles feed variants like "Parramatta" vs "Parramatta Eels", or
    "Sydney" vs "Sydney Swans" - the alias table already lives in
    standings_service and covers both NRL and AFL short/long forms.
    """
    if not team_name:
        return None

    normalized_lookup = {_norm(name): tid for name, tid in team_map.items()}

    key = _norm(team_name)
    if key in normalized_lookup:
        return normalized_lookup[key]

    alias = _ALIASES.get(key)
    if alias and alias in normalized_lookup:
        return normalized_lookup[alias]

    # Reverse alias: feed returned canonical, alias table maps a short form to it
    for short, canonical in _ALIASES.items():
        if canonical == key and short in normalized_lookup:
            return normalized_lookup[short]

    # Loose contains match as last resort (e.g. feed "Parramatta" vs DB "Parramatta Eels")
    for name_key, tid in normalized_lookup.items():
        if key and (key in name_key or name_key in key):
            return tid

    return None


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
    home_id = _resolve_team_id(event["home_team"], team_id_map)
    away_id = _resolve_team_id(event["away_team"], team_id_map)

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


# ── History de-duplication ────────────────────────────────────────────────────

# Prices are doubles that round-trip unchanged, so an exact compare would do;
# the epsilon just guards against a float that took a different path.
_PRICE_EPS = 1e-9

HistoryKey = tuple[str, int, str, str]  # event_id, bookmaker_id, market, outcome


def changed_history_rows(
    history_rows: list[dict],
    current: dict[HistoryKey, tuple[float, float | None]],
) -> list[dict]:
    """
    Keep only the history rows whose price or point actually moved.

    odds_history is append-only and exists to chart line movement. Writing a
    row on every poll regardless of whether anything changed is what grew the
    table to 8.8 M rows / 1.4 GB in seven weeks — the overwhelming majority of
    them identical to the row before. A bookmaker that has not moved its price
    since the last poll carries no new information, so it is not recorded.

    `current` maps each key to the (price, point) already stored in `odds`,
    which is by definition the last value we saw for it.
    """
    out: list[dict] = []
    for r in history_rows:
        key: HistoryKey = (r["event_id"], r["bookmaker_id"], r["market"], r["outcome"])
        prev = current.get(key)
        if prev is None:
            out.append(r)                      # first sighting — always record
            continue
        prev_price, prev_point = prev
        if abs(prev_price - r["price"]) > _PRICE_EPS or prev_point != r["point"]:
            out.append(r)
    return out


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


def _chunks(rows: list[dict], size: int):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


# Postgres param limit is 65535. With ~10 columns per odds row, 500 rows
# per statement stays well under the limit and keeps each statement fast
# enough to fit inside Supabase's statement_timeout.
_CHUNK_SIZE = 500


def normalise_payload(
    db: Session,
    payload: list[dict],
    sport_id: int,
    fetched_at: datetime | None = None,
) -> dict[str, int]:
    """
    Persist a full odds API payload.

    - Events: bulk upserted by id (no horizon filter — the set is bounded
      by the season size and rows are idempotent under upsert).
    - Odds: bulk upserted by (event_id, bookmaker_id, market, outcome),
      per-bookmaker point preserved verbatim [REQ-8].
    - OddsHistory: append-only, bounded to events kicking off in
      [now-3d, now+30d] so the table doesn't balloon with duplicate
      rows for events months away that nobody will ever chart.

    Returns stats: {events, odds_upserted, history_rows, history_skipped,
    unknown_teams}.
    """
    if fetched_at is None:
        fetched_at = datetime.now(tz=timezone.utc)

    teams = db.query(Team).filter_by(sport_id=sport_id).all()
    team_map: dict[str, int] = {t.name: t.id for t in teams}
    bm_id_map = _ensure_bookmakers(db, payload)

    stats = {"events": 0, "odds_upserted": 0, "history_rows": 0,
             "history_skipped": 0, "unknown_teams": 0}

    # Snapshot what we already hold for these events, so history can record
    # only genuine movement. Read before the odds upsert overwrites it.
    event_ids = [e["id"] for e in payload if e.get("id")]
    current: dict[HistoryKey, tuple[float, float | None]] = {}
    for id_chunk in _chunks(event_ids, _CHUNK_SIZE):
        rows = (
            db.query(Odds.event_id, Odds.bookmaker_id, Odds.market, Odds.outcome,
                     Odds.price, Odds.point)
            .filter(Odds.event_id.in_(id_chunk))
            .all()
        )
        for ev_id, bm_id, market, outcome, price, point in rows:
            current[(ev_id, bm_id, market, outcome)] = (price, point)

    # History is append-only, so bound its growth to a practical window.
    # Events / odds are upserted and stay bounded regardless of window.
    history_start = fetched_at - timedelta(days=3)
    history_end = fetched_at + timedelta(days=30)

    all_event_rows: list[dict] = []
    all_odds_rows: list[dict] = []
    all_history_rows: list[dict] = []

    for event in payload:
        event_row, odds_rows, history_rows = extract_event_odds_rows(
            event, bm_id_map, team_map, sport_id, fetched_at
        )

        if event_row["home_team_id"] is None or event_row["away_team_id"] is None:
            stats["unknown_teams"] += 1

        all_event_rows.append(event_row)
        all_odds_rows.extend(odds_rows)

        ct = event_row["commence_time"]
        if ct is not None and history_start <= ct <= history_end:
            all_history_rows.extend(history_rows)

    # Bulk upsert events (chunked)
    for chunk in _chunks(all_event_rows, _CHUNK_SIZE):
        stmt = pg_insert(Event.__table__).values(chunk)
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
    stats["events"] = len(all_event_rows)

    # Bulk upsert odds (chunked) — REQ-8: per-bookmaker point preserved
    for chunk in _chunks(all_odds_rows, _CHUNK_SIZE):
        stmt = pg_insert(Odds.__table__).values(chunk)
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
    stats["odds_upserted"] = len(all_odds_rows)

    # Bulk insert history (append-only, horizon-filtered above, and reduced to
    # rows that actually moved — see changed_history_rows).
    moved = changed_history_rows(all_history_rows, current)
    stats["history_skipped"] = len(all_history_rows) - len(moved)
    for chunk in _chunks(moved, _CHUNK_SIZE * 2):
        db.execute(OddsHistory.__table__.insert(), chunk)
    stats["history_rows"] = len(moved)

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
