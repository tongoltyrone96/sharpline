"""
demo_model.py — run the model against the real Melbourne Demons vs North Melbourne
AFL event stored in the database, and print each bookmaker's own line, fair price,
and edge side by side.

Usage:
  cd backend
  python scripts/demo_model.py
"""

from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import settings
from app.services.model import compute_model_outputs

engine = create_engine(settings.DATABASE_URL)

QUERY = text("""
    SELECT
        e.id          AS event_id,
        ht.name       AS home_team,
        at.name       AS away_team,
        e.commence_time,
        b.key         AS bookmaker_key,
        b.title       AS bookmaker_title,
        b.devig_weight,
        o.market,
        o.outcome,
        o.price,
        o.point
    FROM odds o
    JOIN events e    ON e.id = o.event_id
    JOIN bookmakers b ON b.id = o.bookmaker_id
    JOIN teams ht    ON ht.id = e.home_team_id
    JOIN teams at    ON at.id = e.away_team_id
    JOIN sports s    ON s.id = e.sport_id
    WHERE s.key = 'aussierules_afl'
      AND (ht.name ILIKE '%Melbourne Demons%' OR at.name ILIKE '%Melbourne Demons%')
      AND b.is_available = true
    ORDER BY o.market, b.display_order, o.outcome
""")

SIGMA_MARGIN = 28.0
SIGMA_TOTAL  = 22.0


def main() -> None:
    with Session(engine) as db:
        rows = db.execute(QUERY).mappings().all()

    if not rows:
        print("No AFL rows found for Melbourne Demons — run a poll first.")
        return

    home_team = rows[0]["home_team"]
    away_team = rows[0]["away_team"]
    event_id  = rows[0]["event_id"]
    commence  = rows[0]["commence_time"]

    print(f"\nEvent : {home_team} vs {away_team}")
    print(f"ID    : {event_id}")
    print(f"Start : {commence}")
    print(f"Sigma : margin={SIGMA_MARGIN}, total={SIGMA_TOTAL}")
    print()

    input_rows = [
        {
            "bookmaker_key": r["bookmaker_key"],
            "market":        r["market"],
            "outcome":       r["outcome"],
            "price":         float(r["price"]),
            "point":         float(r["point"]) if r["point"] is not None else None,
            "devig_weight":  float(r["devig_weight"]),
        }
        for r in rows
    ]

    outputs = compute_model_outputs(input_rows, SIGMA_MARGIN, SIGMA_TOTAL)

    # Print by market
    for market in ("spreads", "totals", "h2h"):
        mkt_outputs = [o for o in outputs if o["market"] == market]
        if not mkt_outputs:
            continue

        print("-" * 70)
        print(f"  Market: {market.upper()}")
        print("-" * 70)
        header = f"  {'Bookmaker':<18} {'Outcome':<22} {'Line':>6}  {'Offered':>7}  {'Fair':>7}  {'Edge':>7}"
        print(header)
        print(f"  {'-'*66}")

        for o in sorted(mkt_outputs, key=lambda x: (x["outcome"], x["bookmaker_key"])):
            line_str = f"{o['point']:+.1f}" if o["point"] is not None else "     -"
            edge_str = f"{o['edge_pct']:+.2f}%"
            print(
                f"  {o['bookmaker_key']:<18} "
                f"{o['outcome']:<22} "
                f"{line_str:>6}  "
                f"{o['offered_price']:>7.4f}  "
                f"{o['fair_price']:>7.4f}  "
                f"{edge_str:>7}"
            )
        print()

    # Highlight REQ-8: TABtouch vs TAB spread for the favoured team (negative point)
    # Melbourne Demons is the away team but was the heavy favourite — negative point
    spread_fav = {
        o["bookmaker_key"]: o
        for o in outputs
        if o["market"] == "spreads" and o["point"] is not None and o["point"] < 0
    }
    if "tabtouch" in spread_fav and "tab" in spread_fav:
        t = spread_fav["tabtouch"]
        ta = spread_fav["tab"]
        print("REQ-8 check (TABtouch vs TAB, home spread):")
        print(f"  TABtouch  line={t['point']:+.1f}  fair={t['fair_price']:.4f}  edge={t['edge_pct']:+.2f}%")
        print(f"  TAB       line={ta['point']:+.1f}  fair={ta['fair_price']:.4f}  edge={ta['edge_pct']:+.2f}%")
        if t["fair_price"] != ta["fair_price"]:
            print("  PASS - different lines yield different fair prices.")
        else:
            print("  FAIL - fair prices are identical! REQ-8 is broken.")
    print()


if __name__ == "__main__":
    main()
