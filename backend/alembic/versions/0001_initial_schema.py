"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-14

Creates all 14 tables for Sharpline (DESIGN.md §4 + §9).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.Text(), nullable=False, unique=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("in_season", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("poll_priority", sa.Integer(), nullable=False, server_default="5"),
    )

    op.create_table(
        "bookmakers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.Text(), nullable=False, unique=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_sharp", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("devig_weight", sa.Double(), nullable=False, server_default="1.0"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("color", sa.Text()),
    )

    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sport_id", sa.Integer(), sa.ForeignKey("sports.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("abbreviation", sa.Text(), nullable=False),
        sa.Column("primary_color", sa.Text(), nullable=False, server_default="'#333333'"),
        sa.Column("secondary_color", sa.Text(), nullable=False, server_default="'#888888'"),
        sa.Column("logo_url", sa.Text()),
        sa.Column("venue_name", sa.Text()),
        sa.Column("venue_lat", sa.Double()),
        sa.Column("venue_lon", sa.Double()),
        sa.Column("is_indoor", sa.Boolean(), nullable=False, server_default="false"),
        sa.UniqueConstraint("sport_id", "name"),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("sport_id", sa.Integer(), sa.ForeignKey("sports.id"), nullable=False),
        sa.Column("home_team_id", sa.Integer(), sa.ForeignKey("teams.id")),
        sa.Column("away_team_id", sa.Integer(), sa.ForeignKey("teams.id")),
        sa.Column("commence_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="'upcoming'"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_events_commence_time", "events", ["commence_time"])
    op.create_index("ix_events_sport_status", "events", ["sport_id", "status"])

    op.create_table(
        "odds",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bookmaker_id", sa.Integer(), sa.ForeignKey("bookmakers.id"), nullable=False),
        sa.Column("market", sa.Text(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column("price", sa.Double(), nullable=False),
        sa.Column("point", sa.Double()),
        sa.Column("last_update", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("event_id", "bookmaker_id", "market", "outcome"),
    )
    op.create_index("ix_odds_event_market", "odds", ["event_id", "market"])

    op.create_table(
        "odds_history",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("bookmaker_id", sa.Integer(), nullable=False),
        sa.Column("market", sa.Text(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column("price", sa.Double(), nullable=False),
        sa.Column("point", sa.Double()),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_odds_history_event_market_recorded",
        "odds_history",
        ["event_id", "market", "recorded_at"],
    )

    op.create_table(
        "weather",
        sa.Column("event_id", sa.Text(), sa.ForeignKey("events.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("temp_c", sa.Double()),
        sa.Column("wind_kmh", sa.Double()),
        sa.Column("rain_prob", sa.Double()),
        sa.Column("humidity", sa.Double()),
        sa.Column("condition", sa.Text()),
        sa.Column("is_indoor", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "lineups",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("player_name", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text()),
        sa.Column("importance", sa.Double(), nullable=False, server_default="0.5"),
        sa.Column("source", sa.Text(), nullable=False, server_default="'auto'"),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_lineups_event_id", "lineups", ["event_id"])

    op.create_table(
        "model_outputs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("market", sa.Text(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column("bookmaker_id", sa.Integer(), sa.ForeignKey("bookmakers.id")),
        sa.Column("point", sa.Double()),
        sa.Column("fair_prob", sa.Double()),
        sa.Column("fair_price", sa.Double()),
        sa.Column("book_price", sa.Double()),
        sa.Column("edge_pct", sa.Double()),
        sa.Column("is_best", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("event_id", "market", "outcome", "bookmaker_id"),
    )

    op.create_table(
        "model_summary",
        sa.Column("event_id", sa.Text(), sa.ForeignKey("events.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("home_win_prob", sa.Double()),
        sa.Column("away_win_prob", sa.Double()),
        sa.Column("confidence", sa.Double()),
        sa.Column("projected_margin", sa.Double()),
        sa.Column("projected_total", sa.Double()),
        sa.Column("fair_home_price", sa.Double()),
        sa.Column("fair_away_price", sa.Double()),
        sa.Column("rationale", sa.Text()),
        sa.Column("factors_json", JSONB()),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "model_params",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("sport_key", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "api_quota",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("requests_used", sa.Integer()),
        sa.Column("requests_remaining", sa.Integer()),
        sa.Column("last_cost", sa.Integer()),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "model_performance",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("recorded_on", sa.Date(), nullable=False, unique=True),
        sa.Column("roi_30d", sa.Double()),
        sa.Column("win_rate", sa.Double()),
        sa.Column("avg_edge", sa.Double()),
        sa.Column("equity", sa.Double()),
    )

    op.create_table(
        "alerts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("model_performance")
    op.drop_table("api_quota")
    op.drop_table("model_params")
    op.drop_table("model_summary")
    op.drop_table("model_outputs")
    op.drop_index("ix_lineups_event_id", "lineups")
    op.drop_table("lineups")
    op.drop_table("weather")
    op.drop_index("ix_odds_history_event_market_recorded", "odds_history")
    op.drop_table("odds_history")
    op.drop_index("ix_odds_event_market", "odds")
    op.drop_table("odds")
    op.drop_index("ix_events_sport_status", "events")
    op.drop_index("ix_events_commence_time", "events")
    op.drop_table("events")
    op.drop_table("teams")
    op.drop_table("bookmakers")
    op.drop_table("sports")
