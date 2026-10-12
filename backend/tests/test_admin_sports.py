"""
Admin sports on/off switch — GET/PATCH /admin/sports.

Runs the real routes against an in-memory SQLite database holding just the
tables they touch (sports, teams, events).
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.admin import router
from app.config import settings
from app.db import get_db
from app.models import Base, Event, Sport, Team


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[Sport.__table__, Team.__table__, Event.__table__])
    Session = sessionmaker(bind=engine)

    db = Session()
    now = datetime.now(tz=timezone.utc)
    db.add_all([
        Sport(id=1, key="basketball_nba", title="NBA", in_season=False, is_available=True, poll_priority=5),
        Sport(id=2, key="icehockey_nhl", title="NHL", in_season=True, is_available=True, poll_priority=7),
        Event(id="e1", sport_id=2, commence_time=now + timedelta(days=1)),
        Event(id="e2", sport_id=2, commence_time=now + timedelta(days=9)),   # outside 7 days
        Event(id="e3", sport_id=2, commence_time=now - timedelta(days=1)),   # already played
    ])
    db.commit()
    db.close()

    app = FastAPI()
    app.include_router(router)

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    c = TestClient(app)
    c.auth = ("admin", settings.ADMIN_PASSWORD)
    c.Session = Session
    return c


def test_requires_admin_password(client):
    assert client.get("/admin/sports", auth=("admin", "wrong")).status_code == 401


def test_lists_sports_with_upcoming_games(client):
    rows = {r["key"]: r for r in client.get("/admin/sports").json()}
    # NBA is off because in_season is False, even though is_available is True
    assert rows["basketball_nba"]["is_on"] is False
    assert rows["icehockey_nhl"]["is_on"] is True
    assert rows["icehockey_nhl"]["upcoming_games"] == 1
    assert rows["basketball_nba"]["upcoming_games"] == 0


def test_switch_off_clears_is_available_only(client):
    r = client.patch("/admin/sports/2", json={"is_on": False})
    assert r.status_code == 200 and r.json()["is_on"] is False
    s = client.Session().get(Sport, 2)
    assert s.is_available is False and s.in_season is True


def test_switch_on_sets_both_flags(client):
    r = client.patch("/admin/sports/1", json={"is_on": True})
    assert r.status_code == 200 and r.json()["is_on"] is True
    s = client.Session().get(Sport, 1)
    assert s.is_available is True and s.in_season is True


def test_unknown_sport_is_404(client):
    assert client.patch("/admin/sports/99", json={"is_on": True}).status_code == 404
