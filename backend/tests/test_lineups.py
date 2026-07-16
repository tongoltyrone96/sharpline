"""
Phase 6 gate tests — Lineup adapters and merge service.

KEY GATE: killing every scraper must still leave a working app.
Manual lineups written via the admin panel must survive.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.adapters.lineups.nrl import NRLAdapter
from app.adapters.lineups.squiggle import SquiggleAdapter, _our_to_squiggle, _parse_squiggle_date
from app.adapters.lineups.espn import ESPNAdapter, _match_side

_NOW = datetime(2026, 7, 18, 6, 15, 0, tzinfo=timezone.utc)
HOME = "Melbourne Demons"
AWAY = "North Melbourne Kangaroos"


# ── Gate: scrapers-down resilience ────────────────────────────────────────────

class TestScraperDownGate:
    """If every auto adapter raises, manual lineups are untouched."""

    def test_squiggle_exception_returns_empty_list(self):
        adapter = SquiggleAdapter()
        with patch("httpx.get", side_effect=Exception("network down")):
            result = adapter.fetch(HOME, AWAY, _NOW)
        assert result == []

    def test_espn_exception_returns_empty_list(self):
        adapter = ESPNAdapter("americanfootball_nfl")
        with patch("httpx.get", side_effect=Exception("timeout")):
            result = adapter.fetch("Kansas City Chiefs", "Baltimore Ravens", _NOW)
        assert result == []

    def test_nrl_always_returns_empty_list(self):
        adapter = NRLAdapter()
        result = adapter.fetch("Brisbane Broncos", "Penrith Panthers", _NOW)
        assert result == []

    def test_espn_404_returns_empty_list(self):
        mock_resp = MagicMock()
        mock_resp.is_success = False
        mock_resp.status_code = 404
        adapter = ESPNAdapter("americanfootball_nfl")
        with patch("httpx.get", return_value=mock_resp):
            result = adapter.fetch("Kansas City Chiefs", "Baltimore Ravens", _NOW)
        assert result == []

    def test_squiggle_500_returns_empty_list(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception("500 server error")
        adapter = SquiggleAdapter()
        with patch("httpx.get", return_value=mock_resp):
            result = adapter.fetch(HOME, AWAY, _NOW)
        assert result == []


# ── Manual lineup survival ─────────────────────────────────────────────────────

class TestManualLineupsPreserved:
    """
    upsert_auto must not delete or overwrite manual entries.
    After all scrapers go down, the admin panel data must remain intact.
    """

    def _make_manual_row(self, player_name: str):
        row = MagicMock()
        row.player_name = player_name
        row.source = "manual"
        row.status = "out"
        row.team_id = 1
        row.event_id = "evt-1"
        return row

    def test_manual_entries_not_deleted_by_upsert_auto(self):
        from app.services.lineup_merge import upsert_auto

        db = MagicMock()
        # Simulate: no manual entries exist for this team (query returns [])
        db.query.return_value.filter.return_value.all.return_value = []
        db.query.return_value.filter.return_value.delete.return_value = 0

        auto_rows = [
            {"player_name": "Christian Petracca", "status": "in", "importance": 0.8},
        ]

        # Should not raise
        upsert_auto(db, "evt-1", 1, auto_rows)
        # db.commit called once
        db.commit.assert_called()

    def test_upsert_auto_skips_players_with_manual_entries(self):
        """If admin already marked a player as 'out', auto 'in' must not overwrite."""
        from app.services.lineup_merge import upsert_auto

        db = MagicMock()

        # Simulate: "Christian Petracca" has a manual entry
        manual_player = MagicMock()
        manual_player.player_name = "Christian Petracca"

        # query(Lineup.source=='auto') delete → mock
        db.query.return_value.filter.return_value.delete.return_value = 1
        # query(Lineup.player_name, source='manual') → returns manual player
        db.query.return_value.filter.return_value.all.return_value = [manual_player]

        auto_rows = [
            {"player_name": "Christian Petracca", "status": "in", "importance": 0.8},
            {"player_name": "Clayton Oliver",     "status": "in", "importance": 0.75},
        ]

        upsert_auto(db, "evt-1", 1, auto_rows)

        # Only Clayton Oliver should be added (Petracca is manual)
        added_names = [
            call.args[0].player_name
            for call in db.add.call_args_list
        ]
        assert "Clayton Oliver" in added_names
        assert "Christian Petracca" not in added_names

    def test_empty_rows_only_clears_auto(self):
        """Empty auto result clears old auto rows but never touches manual."""
        from app.services.lineup_merge import upsert_auto

        db = MagicMock()
        db.query.return_value.filter.return_value.delete.return_value = 5
        db.query.return_value.filter.return_value.all.return_value = []

        result = upsert_auto(db, "evt-1", 1, [])

        assert result == 0
        db.add.assert_not_called()


# ── Merge: manual wins ─────────────────────────────────────────────────────────

class TestMergedLineups:
    def _make_row(self, player_name, source, status):
        r = MagicMock()
        r.team_id = 1
        r.player_name = player_name
        r.source = source
        r.status = status
        return r

    def test_manual_overrides_auto_for_same_player(self):
        from app.services.lineup_merge import merged_lineups

        db = MagicMock()
        auto_row   = self._make_row("Christian Petracca", "auto",   "in")
        manual_row = self._make_row("Christian Petracca", "manual", "out")

        db.query.return_value.filter.return_value.all.return_value = [auto_row, manual_row]

        result = merged_lineups(db, "evt-1")

        petracca = next(r for r in result if r.player_name == "Christian Petracca")
        assert petracca.source == "manual"
        assert petracca.status == "out"

    def test_auto_included_when_no_manual_override(self):
        from app.services.lineup_merge import merged_lineups

        db = MagicMock()
        auto_row = self._make_row("Clayton Oliver", "auto", "in")
        db.query.return_value.filter.return_value.all.return_value = [auto_row]

        result = merged_lineups(db, "evt-1")

        assert any(r.player_name == "Clayton Oliver" and r.source == "auto" for r in result)

    def test_no_duplicates_when_both_sources_present(self):
        from app.services.lineup_merge import merged_lineups

        db = MagicMock()
        auto_row   = self._make_row("Player A", "auto",   "in")
        manual_row = self._make_row("Player A", "manual", "out")
        db.query.return_value.filter.return_value.all.return_value = [auto_row, manual_row]

        result = merged_lineups(db, "evt-1")

        player_a_rows = [r for r in result if r.player_name == "Player A"]
        assert len(player_a_rows) == 1


# ── Squiggle internals ─────────────────────────────────────────────────────────

class TestSquiggleHelpers:
    def test_our_name_to_squiggle(self):
        assert _our_to_squiggle("Melbourne Demons") == "Melbourne"
        assert _our_to_squiggle("North Melbourne Kangaroos") == "North Melbourne"
        assert _our_to_squiggle("Greater Western Sydney Giants") == "Greater Western Sydney"
        assert _our_to_squiggle("West Coast Eagles") == "West Coast"

    def test_parse_squiggle_date(self):
        dt = _parse_squiggle_date("2026-07-18 16:15:00")
        assert dt is not None
        assert dt.year == 2026
        assert dt.month == 7
        assert dt.day == 18

    def test_parse_squiggle_date_invalid(self):
        assert _parse_squiggle_date("") is None
        assert _parse_squiggle_date("not-a-date") is None
        assert _parse_squiggle_date(None) is None

    def test_squiggle_games_matched_correctly(self):
        """Full fetch: game found → lineup returned."""
        games_payload = {
            "games": [
                {
                    "id": 99,
                    "hteam": "Melbourne",
                    "ateam": "North Melbourne",
                    "date": "2026-07-18 06:15:00",
                }
            ]
        }
        lineup_payload = {
            "lineups": [
                {"player": "Christian Petracca", "gameid": 99, "hq": 10, "squadpos": "MID", "hteam": "Melbourne"},
                {"player": "Jack Viney",         "gameid": 99, "hq": 5,  "squadpos": "MID", "hteam": "Melbourne"},
            ]
        }

        responses = [
            _mock_resp(games_payload),
            _mock_resp(lineup_payload),
        ]

        adapter = SquiggleAdapter()
        with patch("httpx.get", side_effect=responses):
            result = adapter.fetch(HOME, AWAY, _NOW)

        assert len(result) == 2
        names = {r["player_name"] for r in result}
        assert "Christian Petracca" in names
        assert all(r["status"] == "in" for r in result)
        assert all(r["team_side"] == "home" for r in result)

    def test_squiggle_no_game_match_returns_empty(self):
        games_payload = {"games": [{"id": 1, "hteam": "Geelong", "ateam": "Carlton", "date": "2026-07-18 06:15:00"}]}
        adapter = SquiggleAdapter()
        with patch("httpx.get", return_value=_mock_resp(games_payload)):
            result = adapter.fetch(HOME, AWAY, _NOW)
        assert result == []


# ── ESPN internals ─────────────────────────────────────────────────────────────

class TestESPNHelpers:
    def test_match_side_exact(self):
        assert _match_side("Kansas City Chiefs", "Kansas City Chiefs", "Baltimore Ravens") == "home"
        assert _match_side("Baltimore Ravens",   "Kansas City Chiefs", "Baltimore Ravens") == "away"

    def test_match_side_partial(self):
        assert _match_side("Chiefs", "Kansas City Chiefs", "Baltimore Ravens") == "home"

    def test_match_side_no_match(self):
        assert _match_side("Green Bay Packers", "Kansas City Chiefs", "Baltimore Ravens") is None

    def test_espn_parses_injuries(self):
        payload = {
            "items": [
                {
                    "team": {"displayName": "Kansas City Chiefs"},
                    "injuries": [
                        {
                            "athlete":      {"displayName": "Patrick Mahomes"},
                            "status":       "Questionable",
                            "shortComment": "ankle",
                        }
                    ],
                }
            ]
        }
        mock_resp = MagicMock()
        mock_resp.is_success = True
        mock_resp.json.return_value = payload

        adapter = ESPNAdapter("americanfootball_nfl")
        with patch("httpx.get", return_value=mock_resp):
            result = adapter.fetch("Kansas City Chiefs", "Baltimore Ravens", _NOW)

        assert len(result) == 1
        assert result[0]["player_name"] == "Patrick Mahomes"
        assert result[0]["status"] == "questionable"
        assert result[0]["team_side"] == "home"
        assert result[0]["reason"] == "ankle"

    def test_espn_unknown_sport_key_returns_empty(self):
        adapter = ESPNAdapter("baseball_mlb")  # not in _ESPN_PATHS
        result = adapter.fetch("Team A", "Team B", _NOW)
        assert result == []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mock_resp(payload: dict):
    r = MagicMock()
    r.raise_for_status.return_value = None
    r.is_success = True
    r.status_code = 200
    r.json.return_value = payload
    return r
