"""
Lineup merge service.

Rule: manual entries (source='manual') always override auto entries for
the same (event_id, team_id, player_name). The merged list is what the
model uses for factor calculations.

Public surface:
  merged_lineups(db, event_id)  — returns list of Lineup ORM objects
  upsert_auto(db, event_id, team_id, rows)  — write auto rows without
                                              touching manual entries
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Lineup

log = logging.getLogger(__name__)


def merged_lineups(db: Session, event_id: str) -> list[Lineup]:
    """
    Return the effective lineup for an event.

    For each (team_id, player_name) pair, the manual entry wins over any
    auto entry. All other auto entries are included unchanged.
    """
    all_rows = (
        db.query(Lineup)
        .filter(Lineup.event_id == event_id)
        .all()
    )

    # Build a keyed dict; manual overwrites auto for same key
    merged: dict[tuple[int, str], Lineup] = {}
    for row in all_rows:
        key = (row.team_id, row.player_name)
        existing = merged.get(key)
        if existing is None or row.source == "manual":
            merged[key] = row

    return list(merged.values())


def upsert_auto(
    db: Session,
    event_id: str,
    team_id: int,
    rows: list[dict],
) -> int:
    """
    Refresh auto-sourced lineup rows for one team.

    Strategy:
      1. Delete all existing auto rows for this (event_id, team_id).
      2. Insert fresh rows, but skip players that have a manual entry
         (manual entries for the same player always take priority).

    Returns the count of new auto rows inserted.
    """
    # Step 1: clear old auto rows for this team/event
    db.query(Lineup).filter(
        Lineup.event_id == event_id,
        Lineup.team_id == team_id,
        Lineup.source == "auto",
    ).delete()

    if not rows:
        db.commit()
        return 0

    # Step 2: find players covered by a manual entry
    manual_names: set[str] = {
        r.player_name
        for r in db.query(Lineup.player_name)
        .filter(
            Lineup.event_id == event_id,
            Lineup.team_id == team_id,
            Lineup.source == "manual",
        )
        .all()
    }

    now = datetime.now(tz=timezone.utc)
    written = 0
    for row in rows:
        if row["player_name"] in manual_names:
            log.debug("lineup: skipping %s — manual entry exists", row["player_name"])
            continue
        db.add(Lineup(
            event_id=event_id,
            team_id=team_id,
            player_name=row["player_name"],
            status=row["status"],
            reason=row.get("reason"),
            importance=row.get("importance", 0.5),
            source="auto",
            confirmed=False,
            updated_at=now,
        ))
        written += 1

    db.commit()
    return written
