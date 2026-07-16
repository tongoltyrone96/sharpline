"""add is_available to sports; mark NHL and NBL unavailable

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-14

Adds sports.is_available (default True) so the UI and Quota Governor
can filter out sports that are not in the current odds feed without
hard-deleting them. Setting is_available=True later is the only change
needed to bring a newly-supported sport back to life.

NHL and NBL are set to is_available=False here because The Odds API
does not carry either sport at all (confirmed against the full 57-key
/sports response, 2026-07-13).

NBA is left is_available=True — the sport key will go live in October.
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sports",
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.execute(
        "UPDATE sports SET is_available = false WHERE key IN "
        "('icehockey_nhl', 'basketball_nbl')"
    )
    # Pickle Bet bookmaker already has is_available=False from seed. No change needed.


def downgrade() -> None:
    op.drop_column("sports", "is_available")
