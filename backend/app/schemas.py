"""
Pydantic schemas for the Sharpline REST API (Phase 7).

Matches DESIGN.md §7.1 exactly.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


# ── Team ──────────────────────────────────────────────────────────────────────

class TeamBrief(BaseModel):
    name: str
    abbr: str
    logo_url: str | None = None
    primary_color: str = "#333333"
    secondary_color: str = "#888888"

    model_config = {"from_attributes": True}


# ── Event Info ────────────────────────────────────────────────────────────────

class EventInfo(BaseModel):
    id: str
    sport: str               # sport.title string
    commence_time: datetime
    status: str
    home: TeamBrief
    away: TeamBrief

    model_config = {"from_attributes": True}


# ── Model Output ──────────────────────────────────────────────────────────────

class ModelOut(BaseModel):
    home_win_prob: float | None = None
    away_win_prob: float | None = None
    confidence: float | None = None
    projected_margin: float | None = None
    projected_total: float | None = None
    fair_home_price: float | None = None
    fair_away_price: float | None = None
    rationale: str | None = None
    factors: dict[str, Any] | None = None

    model_config = {"from_attributes": True}


# ── Market Row ────────────────────────────────────────────────────────────────

class MarketRow(BaseModel):
    bookmaker: str           # bookmaker.title
    outcome: str
    price: float             # offered price (book_price from model_outputs)
    point: float | None = None
    fair_price: float | None = None
    edge_pct: float | None = None
    is_best: bool = False

    model_config = {"from_attributes": True}


# ── Weather ───────────────────────────────────────────────────────────────────

class WeatherOut(BaseModel):
    temp_c: float | None = None
    wind_kmh: float | None = None
    rain_prob: float | None = None
    humidity: float | None = None
    condition: str | None = None
    is_indoor: bool = False

    model_config = {"from_attributes": True}


# ── Lineup Row ────────────────────────────────────────────────────────────────

class LineupRow(BaseModel):
    team: str                # team abbreviation
    player: str
    status: str
    reason: str | None = None
    confirmed: bool = False

    model_config = {"from_attributes": True}


# ── Event Detail Response ─────────────────────────────────────────────────────

class EventDetailResponse(BaseModel):
    event: EventInfo
    model: ModelOut | None = None
    markets: dict[str, list[MarketRow]] = {}
    weather: WeatherOut | None = None
    lineups: list[LineupRow] = []

    model_config = {"from_attributes": True}


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardEvent(BaseModel):
    id: str
    commence_time: datetime
    status: str
    home: TeamBrief
    away: TeamBrief
    sport: str               # sport.title
    best_edge_pct: float | None = None
    projected_margin: float | None = None
    projected_total: float | None = None
    home_h2h_price: float | None = None
    away_h2h_price: float | None = None
    home_win_prob: float | None = None
    away_win_prob: float | None = None
    confidence: float | None = None
    has_weather: bool = False
    has_lineups: bool = False

    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    events: list[DashboardEvent]

    model_config = {"from_attributes": True}


class OpportunityRow(BaseModel):
    event_id: str
    event_label: str          # "Home vs Away (Sport)"
    bookmaker: str
    market: str               # h2h | spreads | totals
    outcome: str
    price: float
    fair_price: float | None = None
    edge_pct: float
    point: float | None = None

    model_config = {"from_attributes": True}


class OpportunitiesResponse(BaseModel):
    rows: list[OpportunityRow]
    total_scanned: int        # number of model_output rows checked


# ── Sport ─────────────────────────────────────────────────────────────────────

class SportOut(BaseModel):
    id: int
    key: str
    title: str
    in_season: bool
    is_available: bool

    model_config = {"from_attributes": True}


# ── Status ────────────────────────────────────────────────────────────────────

class AdapterStatus(BaseModel):
    healthy: bool = True
    last_error: str | None = None


class StatusResponse(BaseModel):
    credits_remaining: int
    mode: str
    days_until_reset: float
    credits_per_day: float
    last_poll: datetime | None = None
    adapters: dict[str, AdapterStatus] = {}


# ── Odds History ──────────────────────────────────────────────────────────────

class HistoryPoint(BaseModel):
    recorded_at: datetime
    price: float
    point: float | None = None

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    event_id: str
    market: str
    outcome: str
    bookmaker: str
    history: list[HistoryPoint]
