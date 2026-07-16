"""
Idempotent seed script — safe to run multiple times.

Usage (from backend/):
    python scripts/seed.py

Inserts or updates: sports, teams, bookmakers, model_params.
Never deletes existing rows.
"""

import sys
from pathlib import Path

# Allow running from repo root or backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import SessionLocal
from app.models import Bookmaker, ModelParam, Sport, Team
from app.data.teams_seed import TEAMS
from app.data.venues import VENUES


# ── Sports ───────────────────────────────────────────────────────────────────

SPORTS = [
    # 4 active sports — in feed, in season
    dict(key="rugbyleague_nrl",      title="NRL", in_season=True,  is_available=True,  poll_priority=1),
    dict(key="aussierules_afl",      title="AFL", in_season=True,  is_available=True,  poll_priority=2),
    dict(key="americanfootball_nfl", title="NFL", in_season=True,  is_available=True,  poll_priority=3),
    dict(key="baseball_mlb",         title="MLB", in_season=True,  is_available=True,  poll_priority=4),
    # Off-season: in feed, key exists, activates automatically in October
    dict(key="basketball_nba",       title="NBA", in_season=False, is_available=True,  poll_priority=5),
    # Not in this feed at all — seeded so they can be enabled if a data source
    # ever adds them. Flip is_available=True in the DB to surface them in the UI.
    # dict(key="basketball_nbl", ...),   # not in The Odds API — omitted from seed
    # dict(key="icehockey_nhl",  ...),   # not in The Odds API — omitted from seed
]

# ── Bookmakers ────────────────────────────────────────────────────────────────
# feed_key / title / is_available / is_sharp / devig_weight / display_order

BOOKMAKERS = [
    # 6 client-selected bookmakers present in the au feed (recon 2026-07-13)
    dict(key="tab",           title="TAB",            is_available=True, is_sharp=False, devig_weight=1.0, display_order=10),
    dict(key="betfair_ex_au", title="Betfair",        is_available=True, is_sharp=True,  devig_weight=2.0, display_order=20),
    dict(key="sportsbet",     title="SportsBet",      is_available=True, is_sharp=False, devig_weight=1.0, display_order=30),
    dict(key="ladbrokes_au",  title="Ladbrokes",      is_available=True, is_sharp=False, devig_weight=1.0, display_order=40),
    dict(key="tabtouch",      title="TABtouch",       is_available=True, is_sharp=False, devig_weight=1.0, display_order=50),
    dict(key="pointsbetau",   title="PointsBet (AU)", is_available=True, is_sharp=False, devig_weight=1.0, display_order=60),
    # Pickle Bet requested by client but not in feed — omitted from seed.
    # The DB row (is_available=False) was inserted in Phase 2; it stays there.
    # If Pickle Bet ever joins The Odds API, the normaliser auto-inserts it
    # with is_available=True and the UI picks it up immediately.
]

# ── Model params ──────────────────────────────────────────────────────────────
# key format: "{sport_key}.{param}" for sport-specific, "{param}" for global.
# Values are provisional estimates from DESIGN.md §5.3; admin panel tunes them.

_SIGMA = [
    ("americanfootball_nfl", 13.5, 10.0),
    ("basketball_nba",       11.5, 13.0),
    ("rugbyleague_nrl",      13.0, 11.0),
    ("aussierules_afl",      28.0, 22.0),
    ("baseball_mlb",          4.2,  3.0),
]

_ADJUSTMENT_DEFAULTS = [
    ("wind_total_penalty",    1.5, "Points subtracted per 10 km/h above 25 km/h"),
    ("rain_total_penalty",    2.0, "Points subtracted when rain probability > 40%"),
    ("cold_total_penalty",    1.0, "Points subtracted when temp < 5 C"),
    ("lineup_impact_coef",    3.0, "Margin shift per unit of lineup importance"),
]

MODEL_PARAMS: list[dict] = []

for sport_key, sigma_m, sigma_t in _SIGMA:
    MODEL_PARAMS.append(dict(
        key=f"{sport_key}.sigma_margin",
        value=sigma_m,
        sport_key=sport_key,
        description=f"Margin std-dev for {sport_key} (provisional)",
    ))
    MODEL_PARAMS.append(dict(
        key=f"{sport_key}.sigma_total",
        value=sigma_t,
        sport_key=sport_key,
        description=f"Total std-dev for {sport_key} (provisional)",
    ))
    for param_name, default_value, description in _ADJUSTMENT_DEFAULTS:
        MODEL_PARAMS.append(dict(
            key=f"{sport_key}.{param_name}",
            value=default_value,
            sport_key=sport_key,
            description=description,
        ))

# Global flags
MODEL_PARAMS += [
    dict(key="devig_method", value=0.0, sport_key=None,
         description="0=multiplicative, 1=shin"),
    dict(key="use_xgb", value=0.0, sport_key=None,
         description="1=use XGBoost model (only after calibration; see §5.5)"),
    dict(key="budget_monthly", value=20000.0, sport_key=None,
         description="Total API credits in the billing cycle (used by Quota Governor)"),
]


# ── Seed helpers ──────────────────────────────────────────────────────────────

def _upsert_sport(db, data: dict) -> Sport:
    obj = db.query(Sport).filter_by(key=data["key"]).first()
    if obj is None:
        obj = Sport(**data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    return obj


def _upsert_team(db, sport: Sport, data: dict) -> Team:
    name = data["name"]
    obj = db.query(Team).filter_by(sport_id=sport.id, name=name).first()
    venue_info = VENUES.get(name, {})
    row = dict(
        sport_id=sport.id,
        name=name,
        abbreviation=data["abbr"],
        primary_color=data["primary"],
        secondary_color=data["secondary"],
        logo_url=None,
        venue_name=venue_info.get("venue"),
        venue_lat=venue_info.get("lat"),
        venue_lon=venue_info.get("lon"),
        is_indoor=venue_info.get("indoor", False),
    )
    if obj is None:
        obj = Team(**row)
        db.add(obj)
    else:
        for k, v in row.items():
            setattr(obj, k, v)
    return obj


def _upsert_bookmaker(db, data: dict) -> Bookmaker:
    obj = db.query(Bookmaker).filter_by(key=data["key"]).first()
    if obj is None:
        obj = Bookmaker(**data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    return obj


def _upsert_param(db, data: dict) -> ModelParam:
    obj = db.query(ModelParam).filter_by(key=data["key"]).first()
    if obj is None:
        obj = ModelParam(**data)
        db.add(obj)
    else:
        # Preserve admin-set value; only update description/sport_key metadata
        for k, v in data.items():
            if k != "value":
                setattr(obj, k, v)
    return obj


# ── Map TEAMS keys to sport db keys ──────────────────────────────────────────

_SPORT_KEY_MAP = {
    "NRL": "rugbyleague_nrl",
    "AFL": "aussierules_afl",
    "NFL": "americanfootball_nfl",
    "MLB": "baseball_mlb",
    "NBA": "basketball_nba",
    "NBL": "basketball_nbl",
    "NHL": "icehockey_nhl",
}


# ── Main ──────────────────────────────────────────────────────────────────────

def seed() -> None:
    db = SessionLocal()
    try:
        print("Seeding sports…")
        sport_objs: dict[str, Sport] = {}
        for s in SPORTS:
            obj = _upsert_sport(db, s)
            db.flush()
            sport_objs[s["key"]] = obj
        db.commit()
        print(f"  {len(SPORTS)} sports upserted")

        print("Seeding teams…")
        team_count = 0
        for sport_label, team_list in TEAMS.items():
            sport_key = _SPORT_KEY_MAP[sport_label]
            sport = sport_objs[sport_key]
            for t in team_list:
                _upsert_team(db, sport, t)
                team_count += 1
        db.commit()
        print(f"  {team_count} teams upserted")

        print("Seeding bookmakers…")
        for b in BOOKMAKERS:
            _upsert_bookmaker(db, b)
        db.commit()
        print(f"  {len(BOOKMAKERS)} bookmakers upserted")

        print("Seeding model_params…")
        for p in MODEL_PARAMS:
            _upsert_param(db, p)
        db.commit()
        print(f"  {len(MODEL_PARAMS)} model_params upserted")

        # Verification
        actual_teams = db.query(Team).count()
        available_books = db.query(Bookmaker).filter_by(is_available=True).count()
        unavailable_books = db.query(Bookmaker).filter_by(is_available=False).count()
        print("\nVerification:")
        print(f"  teams.count = {actual_teams} (expected 68)")
        print(f"  bookmakers available = {available_books}, unavailable = {unavailable_books}")
        print(f"  model_params.count = {db.query(ModelParam).count()}")

        if actual_teams != 68:
            print(f"  WARNING: expected 68 teams, got {actual_teams}")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
