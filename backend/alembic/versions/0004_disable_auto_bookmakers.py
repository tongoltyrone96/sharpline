"""disable bookmakers not explicitly seeded

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-14

The live poll auto-discovered 6 additional bookmakers (Bet Right, Betr,
Dabble AU, Neds, PlayUp, Unibet) and inserted them with is_enabled=True.
The client ships with 6 bookmakers. Auto-discovered ones go to
is_enabled=False so the admin panel controls their activation.
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_CLIENT_KEYS = ("tab", "betfair_ex_au", "sportsbet", "ladbrokes_au", "tabtouch", "pointsbetau")


def upgrade() -> None:
    placeholders = ", ".join(f"'{k}'" for k in _CLIENT_KEYS)
    op.execute(
        f"UPDATE bookmakers SET is_enabled = false "
        f"WHERE key NOT IN ({placeholders})"
    )


def downgrade() -> None:
    op.execute("UPDATE bookmakers SET is_enabled = true")
