"""fix bookmaker keys seeded with wrong feed keys

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-14

Renames three bookmaker rows whose keys were derived from the recon
title strings rather than the actual feed keys observed in the API
response. Odds table is empty at this point so no FK repair needed.
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE bookmakers SET key = 'betr_au'  WHERE key = 'betr'")
    op.execute("UPDATE bookmakers SET key = 'dabble_au' WHERE key = 'dabble'")
    op.execute("UPDATE bookmakers SET key = 'unibet'   WHERE key = 'unibet_au'")


def downgrade() -> None:
    op.execute("UPDATE bookmakers SET key = 'betr'     WHERE key = 'betr_au'")
    op.execute("UPDATE bookmakers SET key = 'dabble'   WHERE key = 'dabble_au'")
    op.execute("UPDATE bookmakers SET key = 'unibet_au' WHERE key = 'unibet'")
