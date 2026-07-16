"""
Admin API — lineup CRUD and admin panel operations.

Auth: HTTP Basic, password = settings.ADMIN_PASSWORD (username ignored).
source='manual' entries always take priority over auto in the model.
"""

import secrets
import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import ApiQuota, Bookmaker, Event, Lineup, ModelOutput, ModelParam, Team

router = APIRouter(prefix="/admin", tags=["admin"])
_security = HTTPBasic()


def _require_admin(creds: HTTPBasicCredentials = Security(_security)) -> None:
    ok = secrets.compare_digest(
        creds.password.encode("utf-8"),
        settings.ADMIN_PASSWORD.encode("utf-8"),
    )
    if not ok:
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Basic"})


# ---------------------------------------------------------------------------
# Background recompute helper
# ---------------------------------------------------------------------------

def _bg_recompute_all(event_ids: list[str]) -> None:
    """Run recompute_event for each event ID in a background thread."""
    from app.db import SessionLocal
    from app.services.recompute import recompute_event

    db = SessionLocal()
    try:
        for eid in event_ids:
            try:
                recompute_event(db, eid)
            except Exception:
                pass
    finally:
        db.close()


def _upcoming_event_ids(db: Session, limit: int = 30) -> list[str]:
    """Return IDs of upcoming events within the next 7 days, capped at limit."""
    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(days=7)
    rows = (
        db.query(Event.id)
        .filter(Event.commence_time >= now, Event.commence_time <= cutoff)
        .order_by(Event.commence_time)
        .limit(limit)
        .all()
    )
    return [r.id for r in rows]


# ---------------------------------------------------------------------------
# Lineup schemas (preserved exactly)
# ---------------------------------------------------------------------------

class LineupIn(BaseModel):
    event_id: str
    team_id: int
    player_name: str
    status: str = Field(..., pattern="^(in|out|doubtful|questionable)$")
    reason: str | None = None
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    confirmed: bool = False


class LineupPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(in|out|doubtful|questionable)$")
    reason: str | None = None
    importance: float | None = Field(default=None, ge=0.0, le=1.0)
    confirmed: bool | None = None


class LineupOut(BaseModel):
    id: int
    event_id: str
    team_id: int
    player_name: str
    status: str
    reason: str | None
    importance: float
    source: str
    confirmed: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Bookmaker schemas
# ---------------------------------------------------------------------------

class BookmakerOut(BaseModel):
    id: int
    key: str
    title: str
    is_available: bool
    is_enabled: bool
    is_sharp: bool
    devig_weight: float
    display_order: int
    color: str | None

    model_config = {"from_attributes": True}


class BookmakerIn(BaseModel):
    key: str
    title: str
    is_enabled: bool = True
    is_sharp: bool = False
    devig_weight: float = 1.0
    display_order: int = 100
    color: str | None = None


class BookmakerPatch(BaseModel):
    title: str | None = None
    is_enabled: bool | None = None
    is_sharp: bool | None = None
    devig_weight: float | None = None
    display_order: int | None = None
    color: str | None = None


# ---------------------------------------------------------------------------
# Model parameter schemas
# ---------------------------------------------------------------------------

class ParamOut(BaseModel):
    key: str
    value: float
    sport_key: str | None
    description: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class ParamPatch(BaseModel):
    value: float


# ---------------------------------------------------------------------------
# Team schemas
# ---------------------------------------------------------------------------

class TeamOut(BaseModel):
    id: int
    sport_id: int
    name: str
    abbreviation: str
    primary_color: str
    secondary_color: str
    logo_url: str | None
    venue_name: str | None
    venue_lat: float | None
    venue_lon: float | None
    is_indoor: bool

    model_config = {"from_attributes": True}


class TeamPatch(BaseModel):
    name: str | None = None
    abbreviation: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    logo_url: str | None = None
    venue_name: str | None = None
    venue_lat: float | None = None
    venue_lon: float | None = None
    is_indoor: bool | None = None


# ---------------------------------------------------------------------------
# Event brief schema
# ---------------------------------------------------------------------------

class EventBrief(BaseModel):
    id: str
    sport: str
    home_name: str
    away_name: str
    commence_time: str  # ISO 8601 string

    model_config = {"from_attributes": True}


# ===========================================================================
# Lineup endpoints (preserved exactly)
# ===========================================================================

@router.get("/lineups", response_model=list[LineupOut])
def list_lineups(
    event_id: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    q = db.query(Lineup)
    if event_id:
        q = q.filter(Lineup.event_id == event_id)
    if source:
        q = q.filter(Lineup.source == source)
    return q.order_by(Lineup.event_id, Lineup.team_id, Lineup.player_name).all()


@router.post("/lineups", response_model=LineupOut, status_code=201)
def create_lineup(
    body: LineupIn,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    if not db.get(Event, body.event_id):
        raise HTTPException(status_code=404, detail=f"Event {body.event_id!r} not found")
    if not db.get(Team, body.team_id):
        raise HTTPException(status_code=404, detail=f"Team {body.team_id!r} not found")

    lineup = Lineup(
        event_id=body.event_id,
        team_id=body.team_id,
        player_name=body.player_name,
        status=body.status,
        reason=body.reason,
        importance=body.importance,
        source="manual",
        confirmed=body.confirmed,
        updated_at=datetime.now(tz=timezone.utc),
    )
    db.add(lineup)
    db.commit()
    db.refresh(lineup)
    return lineup


@router.patch("/lineups/{lineup_id}", response_model=LineupOut)
def update_lineup(
    lineup_id: int,
    body: LineupPatch,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    lineup = db.get(Lineup, lineup_id)
    if not lineup:
        raise HTTPException(status_code=404, detail="Lineup entry not found")
    if lineup.source != "manual":
        raise HTTPException(status_code=403, detail="Only manual entries can be edited via admin")

    if body.status is not None:
        lineup.status = body.status
    if body.reason is not None:
        lineup.reason = body.reason
    if body.importance is not None:
        lineup.importance = body.importance
    if body.confirmed is not None:
        lineup.confirmed = body.confirmed
    lineup.updated_at = datetime.now(tz=timezone.utc)

    db.commit()
    db.refresh(lineup)
    return lineup


@router.delete("/lineups/{lineup_id}", status_code=204)
def delete_lineup(
    lineup_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    lineup = db.get(Lineup, lineup_id)
    if not lineup:
        raise HTTPException(status_code=404, detail="Lineup entry not found")
    if lineup.source != "manual":
        raise HTTPException(status_code=403, detail="Only manual entries can be deleted via admin")
    db.delete(lineup)
    db.commit()


@router.delete("/lineups/event/{event_id}", status_code=204)
def clear_event_manual_lineups(
    event_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Delete all manual lineups for one event (reset to auto-only)."""
    db.query(Lineup).filter(
        Lineup.event_id == event_id,
        Lineup.source == "manual",
    ).delete()
    db.commit()


# ===========================================================================
# Tab 1: Bookmakers
# ===========================================================================

@router.get("/bookmakers", response_model=list[BookmakerOut])
def list_bookmakers(
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """List all bookmakers ordered by display_order."""
    return db.query(Bookmaker).order_by(Bookmaker.display_order, Bookmaker.id).all()


@router.post("/bookmakers", response_model=BookmakerOut, status_code=201)
def create_bookmaker(
    body: BookmakerIn,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Create a new bookmaker record. The next scheduled poll will pick it up."""
    existing = db.query(Bookmaker).filter(Bookmaker.key == body.key).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Bookmaker with key {body.key!r} already exists")

    bm = Bookmaker(
        key=body.key,
        title=body.title,
        is_available=True,
        is_enabled=body.is_enabled,
        is_sharp=body.is_sharp,
        devig_weight=body.devig_weight,
        display_order=body.display_order,
        color=body.color,
    )
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return bm


@router.patch("/bookmakers/{bookmaker_id}", response_model=BookmakerOut)
def update_bookmaker(
    bookmaker_id: int,
    body: BookmakerPatch,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Update bookmaker fields. Recompute runs on schedule — no immediate trigger needed."""
    bm = db.get(Bookmaker, bookmaker_id)
    if not bm:
        raise HTTPException(status_code=404, detail="Bookmaker not found")

    if body.title is not None:
        bm.title = body.title
    if body.is_enabled is not None:
        bm.is_enabled = body.is_enabled
    if body.is_sharp is not None:
        bm.is_sharp = body.is_sharp
    if body.devig_weight is not None:
        bm.devig_weight = body.devig_weight
    if body.display_order is not None:
        bm.display_order = body.display_order
    if body.color is not None:
        bm.color = body.color

    db.commit()
    db.refresh(bm)
    return bm


# ===========================================================================
# Tab 2: Model Parameters
# ===========================================================================

@router.get("/params", response_model=list[ParamOut])
def list_params(
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """List all model parameter rows."""
    return db.query(ModelParam).order_by(ModelParam.sport_key, ModelParam.key).all()


@router.patch("/params/{key}", response_model=dict)
def update_param(
    key: str,
    body: ParamPatch,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Update a model parameter value, then trigger background recompute of upcoming events."""
    param = db.get(ModelParam, key)
    if not param:
        raise HTTPException(status_code=404, detail=f"Parameter {key!r} not found")

    param.value = body.value
    param.updated_at = datetime.now(tz=timezone.utc)
    db.commit()

    # Collect upcoming event IDs (next 7 days, max 30) for background recompute
    event_ids = _upcoming_event_ids(db, limit=30)

    if event_ids:
        threading.Thread(target=_bg_recompute_all, args=(event_ids,), daemon=True).start()

    return {"detail": f"Parameter updated. Recomputing {len(event_ids)} events in background."}


# ===========================================================================
# Tab 3: Teams
# ===========================================================================

@router.get("/teams", response_model=list[TeamOut])
def list_teams(
    sport_key: str | None = None,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """List all teams, optionally filtered by ?sport_key=."""
    from app.models import Sport

    q = db.query(Team)
    if sport_key:
        q = q.join(Sport, Team.sport_id == Sport.id).filter(Sport.key == sport_key)
    return q.order_by(Team.sport_id, Team.name).all()


@router.patch("/teams/{team_id}", response_model=TeamOut)
def update_team(
    team_id: int,
    body: TeamPatch,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Update team metadata fields."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if body.name is not None:
        team.name = body.name
    if body.abbreviation is not None:
        team.abbreviation = body.abbreviation
    if body.primary_color is not None:
        team.primary_color = body.primary_color
    if body.secondary_color is not None:
        team.secondary_color = body.secondary_color
    if body.logo_url is not None:
        team.logo_url = body.logo_url
    if body.venue_name is not None:
        team.venue_name = body.venue_name
    if body.venue_lat is not None:
        team.venue_lat = body.venue_lat
    if body.venue_lon is not None:
        team.venue_lon = body.venue_lon
    if body.is_indoor is not None:
        team.is_indoor = body.is_indoor

    db.commit()
    db.refresh(team)
    return team


# ===========================================================================
# Tab 4: System status
# ===========================================================================

@router.get("/system")
def get_system_status(
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Return current system status snapshot."""
    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(days=7)

    # Latest API quota row
    quota_row = (
        db.query(ApiQuota)
        .order_by(ApiQuota.recorded_at.desc())
        .first()
    )
    api_quota = {
        "requests_used": quota_row.requests_used if quota_row else None,
        "requests_remaining": quota_row.requests_remaining if quota_row else None,
    }

    # Count upcoming events in next 7 days
    upcoming_count = (
        db.query(Event)
        .filter(Event.commence_time >= now, Event.commence_time <= cutoff)
        .count()
    )

    # Count total model output rows
    model_outputs_count = db.query(ModelOutput).count()

    return {
        "api_quota": api_quota,
        "upcoming_events": upcoming_count,
        "model_outputs_computed": model_outputs_count,
        "governor_mode": settings.ODDS_POLL_MODE,
        "admin_password_set": settings.ADMIN_PASSWORD != "changeme",
    }


@router.post("/system/force-refresh")
def force_refresh(
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """Trigger background recompute of all upcoming events (next 7 days, max 30)."""
    event_ids = _upcoming_event_ids(db, limit=30)

    if event_ids:
        threading.Thread(target=_bg_recompute_all, args=(event_ids,), daemon=True).start()

    return {"detail": f"Recomputing {len(event_ids)} events in background."}


# ===========================================================================
# Tab 5: Events (for lineup tab dropdown)
# ===========================================================================

@router.get("/events", response_model=list[EventBrief])
def list_upcoming_events(
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin),
):
    """List upcoming events (next 7 days) with team names and sport, ordered by commence_time."""
    from sqlalchemy.orm import joinedload

    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(days=7)

    events = (
        db.query(Event)
        .options(
            joinedload(Event.sport),
            joinedload(Event.home_team),
            joinedload(Event.away_team),
        )
        .filter(Event.commence_time >= now, Event.commence_time <= cutoff)
        .order_by(Event.commence_time)
        .all()
    )

    result: list[EventBrief] = []
    for ev in events:
        result.append(EventBrief(
            id=ev.id,
            sport=ev.sport.key if ev.sport else "",
            home_name=ev.home_team.name if ev.home_team else "",
            away_name=ev.away_team.name if ev.away_team else "",
            commence_time=ev.commence_time.isoformat(),
        ))
    return result
