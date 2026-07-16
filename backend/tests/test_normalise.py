"""
Phase 3 normaliser tests — zero API credits consumed.

All tests run against real saved fixtures from backend/tests/fixtures/.
The extract_event_odds_rows() function is pure (no DB), so the REQ-8
tests do not need a database connection.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.services.normalise import extract_event_odds_rows, _parse_ts

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def _load(name: str) -> list[dict]:
    return json.loads((FIXTURE_DIR / name).read_text())


def _fake_book_map(events: list[dict]) -> dict[str, int]:
    """Assign sequential IDs to every bookmaker key seen in the payload."""
    keys: dict[str, int] = {}
    i = 1
    for ev in events:
        for bm in ev.get("bookmakers", []):
            if bm["key"] not in keys:
                keys[bm["key"]] = i
                i += 1
    return keys


def _fake_team_map(events: list[dict]) -> dict[str, int]:
    names: dict[str, int] = {}
    i = 1
    for ev in events:
        for name in (ev["home_team"], ev["away_team"]):
            if name not in names:
                names[name] = i
                i += 1
    return names


def _extract_all(
    events: list[dict],
    sport_id: int = 1,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Run extract_event_odds_rows over every event; return merged lists."""
    bm_map = _fake_book_map(events)
    team_map = _fake_team_map(events)
    ts = datetime.now(tz=timezone.utc)
    ev_rows, odds_rows, hist_rows = [], [], []
    for ev in events:
        e, o, h = extract_event_odds_rows(ev, bm_map, team_map, sport_id, ts)
        ev_rows.append(e)
        odds_rows.extend(o)
        hist_rows.extend(h)
    return ev_rows, odds_rows, hist_rows


# ── REQ-8 ─────────────────────────────────────────────────────────────────────

class TestReq8PointPerBookmaker:
    """
    The `point` field must survive per bookmaker — never averaged, never
    collapsed to one consensus line.  REQ-8 is what Phase 3 lives or dies on.
    """

    def test_pointsbet_differs_from_tab_penrith_brisbane(self):
        """
        Fixture: Penrith Panthers vs Brisbane Broncos (NRL round fixture).
        PointsBet returns 13.5; TAB returns 14.5 for the Brisbane Broncos side.
        Both values must land in odds_rows as separate rows — not averaged.
        """
        events = _load("odds_nrl.json")
        bm_map = _fake_book_map(events)
        team_map = _fake_team_map(events)
        ts = datetime.now(tz=timezone.utc)
        inv_bm = {v: k for k, v in bm_map.items()}

        penrith_brisbane = next(
            e for e in events
            if e["home_team"] == "Penrith Panthers"
            and e["away_team"] == "Brisbane Broncos"
        )
        _, odds_rows, _ = extract_event_odds_rows(
            penrith_brisbane, bm_map, team_map, sport_id=1, fetched_at=ts
        )

        spreads = {
            inv_bm[r["bookmaker_id"]]: r["point"]
            for r in odds_rows
            if r["market"] == "spreads" and r["outcome"] == "Brisbane Broncos"
        }

        assert "pointsbetau" in spreads, "PointsBet AU missing from spreads rows"
        assert "tab" in spreads, "TAB missing from spreads rows"
        assert spreads["pointsbetau"] == 13.5, f"PointsBet point={spreads['pointsbetau']}, expected 13.5"
        assert spreads["tab"] == 14.5, f"TAB point={spreads['tab']}, expected 14.5"
        assert spreads["pointsbetau"] != spreads["tab"], (
            f"REQ-8 FAIL: PointsBet and TAB have identical point {spreads['pointsbetau']}"
        )

    def test_point_none_for_h2h(self):
        """H2H outcomes carry no spread; point must be None, not 0."""
        events = _load("odds_nrl.json")
        _, odds_rows, _ = _extract_all(events)
        h2h_rows = [r for r in odds_rows if r["market"] == "h2h"]
        assert h2h_rows, "No h2h rows extracted"
        for row in h2h_rows:
            assert row["point"] is None, (
                f"h2h row has non-None point={row['point']} for {row['outcome']}"
            )

    def test_every_bookmaker_gets_own_row_per_outcome(self):
        """Each (event, bookmaker, market, outcome) is its own row."""
        events = _load("odds_nrl.json")
        _, odds_rows, _ = _extract_all(events)
        seen = set()
        for r in odds_rows:
            key = (r["event_id"], r["bookmaker_id"], r["market"], r["outcome"])
            assert key not in seen, f"Duplicate odds row: {key}"
            seen.add(key)

    def test_totals_point_preserved(self):
        """Over/Under point (the line) is preserved per bookmaker."""
        events = _load("odds_nrl.json")
        _, odds_rows, _ = _extract_all(events)
        totals = [r for r in odds_rows if r["market"] == "totals"]
        assert totals, "No totals rows"
        for r in totals:
            assert r["point"] is not None, (
                f"totals row missing point for {r['outcome']} bm_id={r['bookmaker_id']}"
            )


# ── Structural correctness ────────────────────────────────────────────────────

class TestEventRow:
    def test_event_id_preserved(self):
        events = _load("odds_nrl.json")
        ev_rows, _, _ = _extract_all(events)
        api_ids = {e["id"] for e in events}
        row_ids = {r["id"] for r in ev_rows}
        assert api_ids == row_ids

    def test_home_away_team_ids_resolved(self):
        events = _load("odds_nrl.json")
        ev_rows, _, _ = _extract_all(events)
        for row in ev_rows:
            assert row["home_team_id"] is not None
            assert row["away_team_id"] is not None

    def test_commence_time_is_aware(self):
        events = _load("odds_nrl.json")
        ev_rows, _, _ = _extract_all(events)
        for row in ev_rows:
            assert row["commence_time"].tzinfo is not None


class TestOddsRows:
    def test_price_is_float(self):
        events = _load("odds_nrl.json")
        _, odds_rows, _ = _extract_all(events)
        for r in odds_rows:
            assert isinstance(r["price"], float), f"price type={type(r['price'])}"

    def test_history_rows_match_odds_count(self):
        """History must mirror odds exactly — same number of rows."""
        events = _load("odds_nrl.json")
        _, odds_rows, hist_rows = _extract_all(events)
        assert len(odds_rows) == len(hist_rows)


# ── Missing markets (must not crash) ─────────────────────────────────────────

class TestMissingMarkets:
    def test_nfl_events_without_spreads_do_not_crash(self):
        """54 of 75 NFL events have no spreads/totals — extractor must not crash."""
        events = _load("odds_nfl.json")
        ev_rows, odds_rows, hist_rows = _extract_all(events, sport_id=2)
        assert len(ev_rows) == 75
        # Should produce h2h rows even for events with no spreads
        assert any(r["market"] == "h2h" for r in odds_rows)

    def test_afl_events_without_totals_do_not_crash(self):
        events = _load("odds_afl.json")
        ev_rows, odds_rows, _ = _extract_all(events, sport_id=3)
        assert len(ev_rows) == 9

    def test_ladbrokes_h2h_only_event(self):
        """
        Ladbrokes in the NRL fixture returns only h2h for some events.
        No spreads/totals rows should appear for that bookmaker — but
        h2h must still be extracted.
        """
        events = _load("odds_nrl.json")
        bm_map = _fake_book_map(events)
        team_map = _fake_team_map(events)
        ts = datetime.now(tz=timezone.utc)

        # The Penrith/Brisbane event has Ladbrokes with h2h only
        ev = next(
            e for e in events
            if e["home_team"] == "Penrith Panthers"
            and e["away_team"] == "Brisbane Broncos"
        )
        _, odds_rows, _ = extract_event_odds_rows(ev, bm_map, team_map, 1, ts)

        ladbrokes_id = bm_map["ladbrokes_au"]
        ladbrokes_rows = [r for r in odds_rows if r["bookmaker_id"] == ladbrokes_id]
        assert all(r["market"] == "h2h" for r in ladbrokes_rows)
        assert ladbrokes_rows, "Ladbrokes h2h rows missing"


# ── Quota header parsing ──────────────────────────────────────────────────────

class TestParseTs:
    def test_z_suffix_parses(self):
        dt = _parse_ts("2026-07-13T09:37:39Z")
        assert dt.tzinfo is not None
        assert dt.year == 2026

    def test_none_returns_now(self):
        dt = _parse_ts(None)
        assert dt.tzinfo is not None
