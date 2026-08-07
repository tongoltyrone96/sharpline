"""
Dashboard endpoint.

GET /api/v1/dashboard?sport=AFL&status=upcoming
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from sqlalchemy import func

from app.db import get_db
from app.models import Event, Lineup, ModelOutput, ModelSummary, Sport, Weather
from app.models import Bookmaker
from app.schemas import DashboardEvent, DashboardResponse, OpportunitiesResponse, OpportunityRow, TeamBrief

router = APIRouter(prefix="/api/v1", tags=["dashboard"])
log = logging.getLogger(__name__)


def _dedup_events(db: Session, events: list[Event]) -> list[Event]:
    """Drop duplicate events for the same matchup within 48h.

    The Odds API can return the same fixture twice under different IDs when a
    game is rescheduled or dual-listed. Group by (sport, home_team, away_team);
    for events in the group whose kickoffs are within 48 hours, keep the one
    with the most odds rows in the database (the "richer" copy). Events with
    unresolved teams (TBD) are never grouped.
    """
    if not events:
        return events

    ids = [e.id for e in events]
    odds_counts = dict(
        db.query(ModelOutput.event_id, func.count(ModelOutput.id))
        .filter(ModelOutput.event_id.in_(ids))
        .group_by(ModelOutput.event_id)
        .all()
    )

    groups: dict[tuple, list[Event]] = defaultdict(list)
    keep: list[Event] = []
    for ev in events:
        if ev.home_team_id is None or ev.away_team_id is None:
            keep.append(ev)
            continue
        key = (ev.sport_id, ev.home_team_id, ev.away_team_id)
        groups[key].append(ev)

    window = timedelta(hours=48)
    for group in groups.values():
        group.sort(key=lambda e: e.commence_time)
        cluster: list[Event] = [group[0]]
        for ev in group[1:]:
            if ev.commence_time - cluster[-1].commence_time <= window:
                cluster.append(ev)
            else:
                keep.append(max(cluster, key=lambda e: odds_counts.get(e.id, 0)))
                cluster = [ev]
        keep.append(max(cluster, key=lambda e: odds_counts.get(e.id, 0)))

    return sorted(keep, key=lambda e: e.commence_time)


def _team_brief(team) -> TeamBrief:
    if team is None:
        return TeamBrief(name="TBD", abbr="TBD")
    return TeamBrief(
        name=team.name,
        abbr=team.abbreviation,
        logo_url=team.logo_url,
        primary_color=team.primary_color or "#333333",
        secondary_color=team.secondary_color or "#888888",
    )


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    sport: str | None = Query(None, description="Filter by sport title or key"),
    status: str | None = Query(None, description="Filter by event status"),
    db: Session = Depends(get_db),
) -> DashboardResponse:
    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(days=7)
    # Keep in-progress and just-finished games on the dashboard so the
    # client can still see all the data through the whole game — AFL is
    # ~2.5h, NRL ~2h, so a 4-hour post-kickoff buffer covers live plus a
    # short review window after full time.
    window_start = now - timedelta(hours=4)

    q = (
        db.query(Event)
        .options(
            joinedload(Event.home_team),
            joinedload(Event.away_team),
            joinedload(Event.sport),
        )
        .join(Event.sport)
        .filter(
            Event.commence_time >= window_start,
            Event.commence_time <= cutoff,
        )
    )

    if sport:
        q = q.filter(
            (Sport.title.ilike(f"%{sport}%")) | (Sport.key.ilike(f"%{sport}%"))
        )

    if status:
        q = q.filter(Event.status == status)

    events = q.order_by(Event.commence_time.asc()).all()

    # Deduplicate: The Odds API occasionally returns the same matchup under
    # two different event IDs (e.g. rescheduled game, dual listings). Prefer
    # the copy with more odds data so the dashboard doesn't show a blank
    # duplicate card next to the real one.
    events = _dedup_events(db, events)

    # Collect event IDs for batch lookups
    event_ids = [e.id for e in events]

    # Load all model summaries for these events
    summaries = (
        db.query(ModelSummary)
        .filter(ModelSummary.event_id.in_(event_ids))
        .all()
    )
    summary_map = {s.event_id: s for s in summaries}

    # Check which events have weather
    weather_event_ids: set[str] = set(
        row[0]
        for row in db.query(Weather.event_id)
        .filter(Weather.event_id.in_(event_ids))
        .all()
    )

    # Check which events have lineups
    lineup_event_ids: set[str] = set(
        row[0]
        for row in db.query(Lineup.event_id)
        .filter(Lineup.event_id.in_(event_ids))
        .distinct()
        .all()
    )

    # Batch: best edge_pct per event
    edge_rows = (
        db.query(ModelOutput.event_id, func.max(ModelOutput.edge_pct))
        .filter(ModelOutput.event_id.in_(event_ids))
        .group_by(ModelOutput.event_id)
        .all()
    )
    best_edge_map: dict[str, float] = {r[0]: r[1] for r in edge_rows if r[1] is not None}

    # Batch: best H2H price per (event_id, outcome=team_name) from model_outputs
    h2h_price_rows = (
        db.query(
            ModelOutput.event_id,
            ModelOutput.outcome,
            func.max(ModelOutput.book_price),
        )
        .filter(
            ModelOutput.event_id.in_(event_ids),
            ModelOutput.market == "h2h",
        )
        .group_by(ModelOutput.event_id, ModelOutput.outcome)
        .all()
    )
    # {(event_id, team_name): best_price}
    h2h_by_team: dict[tuple[str, str], float] = {}
    for eid, outcome, price in h2h_price_rows:
        if price is not None:
            h2h_by_team[(eid, outcome)] = price

    home_h2h_map: dict[str, float] = {}
    away_h2h_map: dict[str, float] = {}
    for event in events:
        eid = event.id
        if event.home_team:
            p = h2h_by_team.get((eid, event.home_team.name))
            if p is not None:
                home_h2h_map[eid] = p
        if event.away_team:
            p = h2h_by_team.get((eid, event.away_team.name))
            if p is not None:
                away_h2h_map[eid] = p

    # Batch: average book spread on the home side and average total line —
    # so the fixture strip can show the actual market number alongside
    # the model's projected margin.
    spread_rows = (
        db.query(ModelOutput.event_id, ModelOutput.outcome, func.avg(ModelOutput.point))
        .filter(
            ModelOutput.event_id.in_(event_ids),
            ModelOutput.market == "spreads",
            ModelOutput.point != None,
        )
        .group_by(ModelOutput.event_id, ModelOutput.outcome)
        .all()
    )
    book_home_spread_map: dict[str, float] = {}
    for eid, outcome, avg_pt in spread_rows:
        if avg_pt is None:
            continue
        # Match to the home team name of this event
        ev = next((e for e in events if e.id == eid), None)
        if ev and ev.home_team and outcome == ev.home_team.name:
            book_home_spread_map[eid] = round(float(avg_pt), 1)

    total_rows = (
        db.query(ModelOutput.event_id, func.avg(ModelOutput.point))
        .filter(
            ModelOutput.event_id.in_(event_ids),
            ModelOutput.market == "totals",
            ModelOutput.outcome.ilike("over"),
            ModelOutput.point != None,
        )
        .group_by(ModelOutput.event_id)
        .all()
    )
    book_total_map: dict[str, float] = {eid: round(float(pt), 1) for eid, pt in total_rows if pt is not None}

    result_events: list[DashboardEvent] = []
    for event in events:
        summary = summary_map.get(event.id)

        result_events.append(DashboardEvent(
            id=event.id,
            commence_time=event.commence_time,
            status=event.status,
            home=_team_brief(event.home_team),
            away=_team_brief(event.away_team),
            sport=event.sport.title if event.sport else "",
            best_edge_pct=best_edge_map.get(event.id),
            projected_margin=summary.projected_margin if summary else None,
            projected_total=summary.projected_total if summary else None,
            book_home_spread=book_home_spread_map.get(event.id),
            book_total_line=book_total_map.get(event.id),
            home_h2h_price=home_h2h_map.get(event.id),
            away_h2h_price=away_h2h_map.get(event.id),
            home_win_prob=summary.home_win_prob if summary else None,
            away_win_prob=summary.away_win_prob if summary else None,
            confidence=summary.confidence if summary else None,
            has_weather=event.id in weather_event_ids,
            has_lineups=event.id in lineup_event_ids,
        ))

    return DashboardResponse(events=result_events)


@router.get("/opportunities", response_model=OpportunitiesResponse)
def get_opportunities(
    limit: int = Query(6, ge=1, le=50),
    min_edge: float = Query(0.0, description="Minimum edge_pct to include"),
    max_edge: float = Query(20.0, description="Maximum edge_pct — anything above is suspect data"),
    max_h2h_odds: float = Query(6.0, description="H2H longshot cutoff: odds above this are de-vig-unreliable"),
    db: Session = Depends(get_db),
) -> OpportunitiesResponse:
    """Return top positive-edge bets across all upcoming events.

    Deduplicates by (event_id, market, outcome) — shows best bookmaker per bet.

    Longshot filter: H2H bets with book_price > max_h2h_odds are excluded because
    plain multiplicative de-vig over-corrects on extreme longshots, producing
    unrealistically large edges. Spreads and totals are not affected.

    Edge cap: rows with edge_pct > max_edge are also excluded. A genuine 20%+ edge
    almost never exists — values above this almost always indicate stale or corrupt
    feed data.
    """
    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(days=7)

    upcoming_ids = [
        r[0]
        for r in db.query(Event.id)
        .filter(Event.commence_time >= now, Event.commence_time <= cutoff)
        .all()
    ]

    total_scanned = (
        db.query(func.count(ModelOutput.id))
        .filter(ModelOutput.event_id.in_(upcoming_ids), ModelOutput.edge_pct != None)
        .scalar()
        or 0
    )

    # Pull all positive-edge rows within the plausible range, sorted best-first
    from sqlalchemy import or_
    raw_rows = (
        db.query(ModelOutput, Event, Bookmaker)
        .join(Event, ModelOutput.event_id == Event.id)
        .join(Bookmaker, ModelOutput.bookmaker_id == Bookmaker.id)
        .options(joinedload(Event.home_team), joinedload(Event.away_team), joinedload(Event.sport))
        .filter(
            ModelOutput.event_id.in_(upcoming_ids),
            ModelOutput.edge_pct > min_edge,
            ModelOutput.edge_pct <= max_edge,
            # Longshot filter: H2H odds above threshold are de-vig-unreliable
            or_(
                ModelOutput.market != "h2h",
                ModelOutput.book_price <= max_h2h_odds,
            ),
        )
        .order_by(ModelOutput.edge_pct.desc())
        .all()
    )

    # Deduplicate: keep best-edge row per (event_id, market, outcome)
    seen: set[tuple[str, str, str]] = set()
    result: list[OpportunityRow] = []
    for mo, ev, bm in raw_rows:
        key = (ev.id, mo.market, mo.outcome)
        if key in seen:
            continue
        seen.add(key)
        home_name = ev.home_team.name if ev.home_team else "?"
        away_name = ev.away_team.name if ev.away_team else "?"
        sport_title = ev.sport.title if ev.sport else ""
        result.append(OpportunityRow(
            event_id=ev.id,
            event_label=f"{home_name} vs {away_name} ({sport_title})",
            bookmaker=bm.title,
            market=mo.market,
            outcome=mo.outcome,
            price=mo.book_price or 0.0,
            fair_price=mo.fair_price,
            edge_pct=mo.edge_pct,
            point=mo.point,
        ))
        if len(result) >= limit:
            break

    return OpportunitiesResponse(rows=result, total_scanned=total_scanned)
