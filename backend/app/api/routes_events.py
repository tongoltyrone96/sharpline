"""
Event detail and odds history endpoints.

GET /api/v1/events/{event_id}
GET /api/v1/events/{event_id}/history
"""

from __future__ import annotations

import logging
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Bookmaker, Event, ModelOutput, ModelSummary, Odds, OddsHistory
from app.schemas import (
    EventDetailResponse,
    EventInfo,
    HistoryPoint,
    HistoryResponse,
    LineupRow,
    MarketRow,
    ModelOut,
    TeamBrief,
    WeatherOut,
)
from app.services.lineup_merge import merged_lineups
from app.services.recompute import recompute_event

router = APIRouter(prefix="/api/v1", tags=["events"])
log = logging.getLogger(__name__)


def _team_brief(team) -> TeamBrief | None:
    if team is None:
        return None
    return TeamBrief(
        name=team.name,
        abbr=team.abbreviation,
        logo_url=team.logo_url,
        primary_color=team.primary_color or "#333333",
        secondary_color=team.secondary_color or "#888888",
    )


@router.get("/events/{event_id}", response_model=EventDetailResponse)
def get_event_detail(
    event_id: str,
    db: Session = Depends(get_db),
) -> EventDetailResponse:
    # Step 1: load event with teams and sport
    event = (
        db.query(Event)
        .options(
            joinedload(Event.home_team),
            joinedload(Event.away_team),
            joinedload(Event.sport),
            joinedload(Event.weather),
        )
        .filter(Event.id == event_id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id!r} not found")

    home_brief = _team_brief(event.home_team)
    away_brief = _team_brief(event.away_team)

    event_info = EventInfo(
        id=event.id,
        sport=event.sport.title if event.sport else "",
        commence_time=event.commence_time,
        status=event.status,
        home=home_brief or TeamBrief(name="TBD", abbr="TBD"),
        away=away_brief or TeamBrief(name="TBD", abbr="TBD"),
    )

    # Step 2: load model_summary
    summary = (
        db.query(ModelSummary)
        .filter(ModelSummary.event_id == event_id)
        .first()
    )

    # Step 3: load model_outputs with bookmaker join
    mo_rows = (
        db.query(ModelOutput, Bookmaker)
        .join(Bookmaker, ModelOutput.bookmaker_id == Bookmaker.id)
        .filter(ModelOutput.event_id == event_id)
        .all()
    )

    # Step 4: if no model_outputs, trigger inline recompute
    if not mo_rows:
        log.info("No model_outputs for %s — triggering inline recompute", event_id)
        recompute_event(db, event_id)
        # Refresh summary
        summary = (
            db.query(ModelSummary)
            .filter(ModelSummary.event_id == event_id)
            .first()
        )
        mo_rows = (
            db.query(ModelOutput, Bookmaker)
            .join(Bookmaker, ModelOutput.bookmaker_id == Bookmaker.id)
            .filter(ModelOutput.event_id == event_id)
            .all()
        )

    # Build ModelOut from summary
    model_out: ModelOut | None = None
    if summary:
        model_out = ModelOut(
            home_win_prob=summary.home_win_prob,
            away_win_prob=summary.away_win_prob,
            confidence=summary.confidence,
            projected_margin=summary.projected_margin,
            projected_total=summary.projected_total,
            fair_home_price=summary.fair_home_price,
            fair_away_price=summary.fair_away_price,
            rationale=summary.rationale,
            factors=summary.factors_json or {},
        )

    # Build markets dict grouped by market key, sorted by edge_pct desc
    markets: dict[str, list[MarketRow]] = defaultdict(list)
    for mo, bm in mo_rows:
        row = MarketRow(
            bookmaker=bm.title,
            outcome=mo.outcome,
            price=mo.book_price or 0.0,
            point=mo.point,
            fair_price=mo.fair_price,
            edge_pct=mo.edge_pct,
            is_best=mo.is_best,
        )
        markets[mo.market].append(row)

    # Sort each market list by edge_pct descending
    for market_key in markets:
        markets[market_key].sort(
            key=lambda r: r.edge_pct if r.edge_pct is not None else float("-inf"),
            reverse=True,
        )

    # Step 5: build weather
    weather_out: WeatherOut | None = None
    if event.weather:
        w = event.weather
        weather_out = WeatherOut(
            temp_c=w.temp_c,
            wind_kmh=w.wind_kmh,
            rain_prob=w.rain_prob,
            humidity=w.humidity,
            condition=w.condition,
            is_indoor=w.is_indoor,
        )

    # Step 6: build lineups using merged_lineups
    lineup_rows: list[LineupRow] = []
    lineups = merged_lineups(db, event_id)
    for lineup in lineups:
        team = lineup.team
        abbr = team.abbreviation if team else "UNK"
        lineup_rows.append(LineupRow(
            team=abbr,
            player=lineup.player_name,
            status=lineup.status,
            reason=lineup.reason,
            confirmed=lineup.confirmed,
        ))

    return EventDetailResponse(
        event=event_info,
        model=model_out,
        markets=dict(markets),
        weather=weather_out,
        lineups=lineup_rows,
    )


@router.get("/events/{event_id}/history", response_model=HistoryResponse)
def get_event_history(
    event_id: str,
    market: str = Query(..., description="Market key (h2h, spreads, totals)"),
    outcome: str | None = Query(None),
    bookmaker_id: int | None = Query(None),
    db: Session = Depends(get_db),
) -> HistoryResponse:
    # Verify event exists
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id!r} not found")

    q = (
        db.query(OddsHistory)
        .filter(
            OddsHistory.event_id == event_id,
            OddsHistory.market == market,
        )
        .order_by(OddsHistory.recorded_at.asc())
    )

    if outcome is not None:
        q = q.filter(OddsHistory.outcome == outcome)
    if bookmaker_id is not None:
        q = q.filter(OddsHistory.bookmaker_id == bookmaker_id)

    rows = q.all()

    # Determine bookmaker name for display
    bm_name = ""
    if bookmaker_id is not None:
        bm = db.query(Bookmaker).filter(Bookmaker.id == bookmaker_id).first()
        bm_name = bm.title if bm else str(bookmaker_id)

    history = [
        HistoryPoint(
            recorded_at=r.recorded_at,
            price=r.price,
            point=r.point,
        )
        for r in rows
    ]

    return HistoryResponse(
        event_id=event_id,
        market=market,
        outcome=outcome or "",
        bookmaker=bm_name,
        history=history,
    )
