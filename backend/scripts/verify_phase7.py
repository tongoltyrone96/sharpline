import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.config import settings
from app.services.recompute import recompute_event

engine = create_engine(settings.DATABASE_URL)

AFL_EVENT = "084ae8d6d0d000e014b32ebc6876de6c"  # North Melbourne vs Melbourne Demons

with Session(engine) as db:
    result = recompute_event(db, AFL_EVENT)

if result is None:
    print("FAIL: recompute returned None")
    sys.exit(1)

print(f"projected_margin: {result.get('projected_margin')}")
print(f"home_win_prob: {result.get('home_win_prob')}")
print()

# Now query model_outputs for the spreads market
from sqlalchemy import text
engine2 = create_engine(settings.DATABASE_URL)
with Session(engine2) as db:
    rows = db.execute(text("""
        SELECT b.title, mo.outcome, mo.point, mo.fair_price, mo.edge_pct
        FROM model_outputs mo
        JOIN bookmakers b ON b.id = mo.bookmaker_id
        WHERE mo.event_id = :eid AND mo.market = 'spreads'
        ORDER BY b.display_order, mo.outcome
    """), {"eid": AFL_EVENT}).fetchall()

print("SPREADS market_outputs:")
print(f"  {'Bookmaker':<20} {'Outcome':<25} {'Line':>6}  {'Fair':>7}  {'Edge':>7}")
for r in rows:
    print(f"  {r[0]:<20} {r[1]:<25} {r[2]:>+6.1f}  {r[3]:>7.4f}  {r[4]:>+7.2f}%")

# REQ-8 check
tabtouch = next((r for r in rows if r[0] == "TABtouch" and r[2] is not None and r[2] < 0), None)
tab      = next((r for r in rows if r[0] == "TAB" and r[2] is not None and r[2] < 0), None)

if tabtouch and tab:
    print()
    if tabtouch[3] != tab[3]:
        print(f"REQ-8 PASS: TABtouch fair={tabtouch[3]:.4f} != TAB fair={tab[3]:.4f}")
    else:
        print("REQ-8 FAIL: fair prices are identical!")
        sys.exit(1)
