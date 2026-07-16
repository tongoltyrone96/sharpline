"""
NRL lineup adapter.

No reliable free NRL lineup API exists at time of writing. This adapter
returns [] immediately so the manual admin panel is always the authority.

When a reliable source becomes available, replace _fetch() — the interface
contract (never raise, return []) stays the same.
"""

import logging
from datetime import datetime

from app.adapters.base import LineupAdapter

log = logging.getLogger(__name__)


class NRLAdapter(LineupAdapter):
    def fetch(
        self,
        home_team: str,
        away_team: str,
        commence_time: datetime,
    ) -> list[dict]:
        log.debug("NRLAdapter: no automated source — using admin panel lineups only")
        return []
