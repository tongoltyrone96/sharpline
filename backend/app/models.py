from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Sport(Base):
    __tablename__ = "sports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    in_season: Mapped[bool] = mapped_column(Boolean, default=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    poll_priority: Mapped[int] = mapped_column(Integer, default=5)

    teams: Mapped[list["Team"]] = relationship(back_populates="sport")
    events: Mapped[list["Event"]] = relationship(back_populates="sport")


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("sport_id", "name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sport_id: Mapped[int] = mapped_column(ForeignKey("sports.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    abbreviation: Mapped[str] = mapped_column(Text, nullable=False)
    primary_color: Mapped[str] = mapped_column(Text, default="#333333")
    secondary_color: Mapped[str] = mapped_column(Text, default="#888888")
    logo_url: Mapped[str | None] = mapped_column(Text)
    venue_name: Mapped[str | None] = mapped_column(Text)
    venue_lat: Mapped[float | None] = mapped_column(Double)
    venue_lon: Mapped[float | None] = mapped_column(Double)
    is_indoor: Mapped[bool] = mapped_column(Boolean, default=False)

    sport: Mapped["Sport"] = relationship(back_populates="teams")


class Bookmaker(Base):
    __tablename__ = "bookmakers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sharp: Mapped[bool] = mapped_column(Boolean, default=False)
    devig_weight: Mapped[float] = mapped_column(Double, default=1.0)
    display_order: Mapped[int] = mapped_column(Integer, default=100)
    color: Mapped[str | None] = mapped_column(Text)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_commence_time", "commence_time"),
        Index("ix_events_sport_status", "sport_id", "status"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    sport_id: Mapped[int] = mapped_column(ForeignKey("sports.id"))
    home_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    commence_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(Text, default="upcoming")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    sport: Mapped["Sport"] = relationship(back_populates="events")
    home_team: Mapped["Team | None"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team | None"] = relationship(foreign_keys=[away_team_id])
    odds: Mapped[list["Odds"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    weather: Mapped["Weather | None"] = relationship(back_populates="event", cascade="all, delete-orphan", uselist=False)
    lineups: Mapped[list["Lineup"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    model_summary: Mapped["ModelSummary | None"] = relationship(back_populates="event", cascade="all, delete-orphan", uselist=False)
    model_outputs: Mapped[list["ModelOutput"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class Odds(Base):
    __tablename__ = "odds"
    __table_args__ = (
        UniqueConstraint("event_id", "bookmaker_id", "market", "outcome"),
        Index("ix_odds_event_market", "event_id", "market"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    bookmaker_id: Mapped[int] = mapped_column(ForeignKey("bookmakers.id"))
    market: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Double, nullable=False)
    point: Mapped[float | None] = mapped_column(Double)
    last_update: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="odds")
    bookmaker: Mapped["Bookmaker"] = relationship()


class OddsHistory(Base):
    __tablename__ = "odds_history"
    __table_args__ = (
        Index("ix_odds_history_event_market_recorded", "event_id", "market", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[str] = mapped_column(Text, nullable=False)
    bookmaker_id: Mapped[int] = mapped_column(Integer, nullable=False)
    market: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Double, nullable=False)
    point: Mapped[float | None] = mapped_column(Double)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Weather(Base):
    __tablename__ = "weather"

    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    temp_c: Mapped[float | None] = mapped_column(Double)
    wind_kmh: Mapped[float | None] = mapped_column(Double)
    rain_prob: Mapped[float | None] = mapped_column(Double)
    humidity: Mapped[float | None] = mapped_column(Double)
    condition: Mapped[str | None] = mapped_column(Text)
    is_indoor: Mapped[bool] = mapped_column(Boolean, default=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="weather")


class Lineup(Base):
    __tablename__ = "lineups"
    __table_args__ = (Index("ix_lineups_event_id", "event_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    player_name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    importance: Mapped[float] = mapped_column(Double, default=0.5)
    source: Mapped[str] = mapped_column(Text, default="auto")
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="lineups")
    team: Mapped["Team"] = relationship()


class ModelOutput(Base):
    __tablename__ = "model_outputs"
    __table_args__ = (
        UniqueConstraint("event_id", "market", "outcome", "bookmaker_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    market: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)
    bookmaker_id: Mapped[int | None] = mapped_column(ForeignKey("bookmakers.id"))
    point: Mapped[float | None] = mapped_column(Double)
    fair_prob: Mapped[float | None] = mapped_column(Double)
    fair_price: Mapped[float | None] = mapped_column(Double)
    book_price: Mapped[float | None] = mapped_column(Double)
    edge_pct: Mapped[float | None] = mapped_column(Double)
    is_best: Mapped[bool] = mapped_column(Boolean, default=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="model_outputs")
    bookmaker: Mapped["Bookmaker | None"] = relationship()


class ModelSummary(Base):
    __tablename__ = "model_summary"

    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    home_win_prob: Mapped[float | None] = mapped_column(Double)
    away_win_prob: Mapped[float | None] = mapped_column(Double)
    confidence: Mapped[float | None] = mapped_column(Double)
    projected_margin: Mapped[float | None] = mapped_column(Double)
    projected_total: Mapped[float | None] = mapped_column(Double)
    fair_home_price: Mapped[float | None] = mapped_column(Double)
    fair_away_price: Mapped[float | None] = mapped_column(Double)
    rationale: Mapped[str | None] = mapped_column(Text)
    factors_json: Mapped[dict | None] = mapped_column(JSONB)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="model_summary")


class ModelParam(Base):
    __tablename__ = "model_params"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[float] = mapped_column(Double, nullable=False)
    sport_key: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiQuota(Base):
    __tablename__ = "api_quota"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    requests_used: Mapped[int | None] = mapped_column(Integer)
    requests_remaining: Mapped[int | None] = mapped_column(Integer)
    last_cost: Mapped[int | None] = mapped_column(Integer)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ModelPerformance(Base):
    __tablename__ = "model_performance"
    __table_args__ = (UniqueConstraint("recorded_on"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    recorded_on: Mapped[date] = mapped_column(Date, nullable=False)
    roi_30d: Mapped[float | None] = mapped_column(Double)
    win_rate: Mapped[float | None] = mapped_column(Double)
    avg_edge: Mapped[float | None] = mapped_column(Double)
    equity: Mapped[float | None] = mapped_column(Double)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="alerts")
