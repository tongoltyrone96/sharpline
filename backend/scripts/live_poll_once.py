"""
One-shot live poll for Phase 3 Stage B verification.
Polls all in-season sports, writes to DB, then prints diagnostics.
Run from backend/:  python scripts/live_poll_once.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import SessionLocal
from app.adapters.odds_theoddsapi import TheOddsApiAdapter
from app.models import Bookmaker, Odds, Sport
from app.services.normalise import normalise_payload, record_quota
from sqlalchemy import text

IN_SEASON_SPORTS = {
    "rugbyleague_nrl": "NRL",
    "aussierules_afl": "AFL",
    "americanfootball_nfl": "NFL",
    "baseball_mlb": "MLB",
}


def main():
    if not settings.ODDS_API_KEY:
        print("ERROR: ODDS_API_KEY is not set in .env")
        sys.exit(1)

    adapter = TheOddsApiAdapter(settings.ODDS_API_KEY)
    db = SessionLocal()

    try:
        for sport_key, title in IN_SEASON_SPORTS.items():
            sport = db.query(Sport).filter_by(key=sport_key).first()
            if not sport:
                print(f"  SKIP {title}: sport not in DB")
                continue

            print(f"\nPolling {title} ({sport_key})…")
            try:
                payload, quota = adapter.fetch_odds(sport_key)
            except Exception as exc:
                print(f"  ERROR fetching {title}: {exc}")
                continue

            print(f"  events returned: {len(payload)}")
            print(f"  remaining={quota.get('x-requests-remaining')}  "
                  f"used={quota.get('x-requests-used')}  "
                  f"cost={quota.get('x-requests-last')}")

            record_quota(db, "theoddsapi", quota)

            if not payload:
                print(f"  Empty response — sport may be between rounds. Skipping.")
                continue

            # Check for unknown team names
            teams_in_db = {
                r[0] for r in db.execute(
                    text("SELECT name FROM teams WHERE sport_id = :sid"),
                    {"sid": sport.id}
                ).fetchall()
            }
            unknown = set()
            for ev in payload:
                for nm in (ev["home_team"], ev["away_team"]):
                    if nm not in teams_in_db:
                        unknown.add(nm)
            if unknown:
                print(f"  *** UNKNOWN TEAM NAMES (feed changed?): {sorted(unknown)}")
            else:
                print(f"  All team names matched — OK")

            # Check for bookmakers not yet in our table
            bm_in_db = {r[0] for r in db.execute(text("SELECT key FROM bookmakers")).fetchall()}
            new_books = set()
            for ev in payload:
                for bm in ev.get("bookmakers", []):
                    if bm["key"] not in bm_in_db:
                        new_books.add((bm["key"], bm["title"]))
            if new_books:
                print(f"  New bookmakers (will be auto-inserted): {new_books}")

            # Market coverage
            events_no_spreads = sum(
                1 for ev in payload
                if not any(
                    any(m["key"] == "spreads" for m in bm["markets"])
                    for bm in ev.get("bookmakers", [])
                )
            )
            events_no_totals = sum(
                1 for ev in payload
                if not any(
                    any(m["key"] == "totals" for m in bm["markets"])
                    for bm in ev.get("bookmakers", [])
                )
            )
            print(f"  events without spreads: {events_no_spreads}/{len(payload)}")
            print(f"  events without totals:  {events_no_totals}/{len(payload)}")

            stats = normalise_payload(db, payload, sport.id)
            print(f"  Normalised: {stats}")

        # ── REQ-8 verification query ──────────────────────────────────────
        print("\n" + "="*60)
        print("REQ-8 CHECK — spreads point per bookmaker (first 40 rows):")
        print("="*60)
        rows = db.execute(text("""
            SELECT b.title, o.event_id, o.outcome, o.point
            FROM odds o
            JOIN bookmakers b ON b.id = o.bookmaker_id
            WHERE o.market = 'spreads'
            ORDER BY o.event_id, b.title
            LIMIT 40
        """)).fetchall()

        if not rows:
            print("  No spreads rows in DB yet.")
        else:
            # Group by event_id to see divergence
            by_event: dict[str, list] = {}
            for title, event_id, outcome, point in rows:
                by_event.setdefault(event_id, []).append((title, outcome, point))

            shown = 0
            for event_id, entries in by_event.items():
                # Check if all books have same point — that would indicate a bug
                points = {pt for _, _, pt in entries if pt is not None}
                flag = "  *** ALL SAME — CHECK NORMALISER" if len(points) == 1 else ""
                print(f"\n  event {event_id[:12]}…{flag}")
                for title, outcome, point in sorted(entries):
                    print(f"    {title:25} {outcome:30} point={point}")
                shown += 1
                if shown >= 5:
                    print(f"  … (showing first 5 events of {len(by_event)} total)")
                    break

    finally:
        db.close()


if __name__ == "__main__":
    main()
