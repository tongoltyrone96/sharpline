"""
odds_history volume control — the de-duplication filter and the retention
window guard. Both are pure functions, so no database is needed.
"""

import pytest

from app.services.normalise import changed_history_rows
from app.tasks.prune_history import _DEFAULT_RETENTION_DAYS, _retention_days


def _row(price: float, point=None, outcome="Home", bm=1, market="h2h", ev="e1") -> dict:
    return {
        "event_id": ev, "bookmaker_id": bm, "market": market,
        "outcome": outcome, "price": price, "point": point,
        "recorded_at": "2026-08-31T00:00:00+00:00",
    }


KEY = ("e1", 1, "h2h", "Home")


# ---------------------------------------------------------------------------
# changed_history_rows
# ---------------------------------------------------------------------------

class TestChangedHistoryRows:
    def test_records_a_price_never_seen_before(self):
        assert changed_history_rows([_row(1.90)], {}) == [_row(1.90)]

    def test_drops_a_price_that_has_not_moved(self):
        assert changed_history_rows([_row(1.90)], {KEY: (1.90, None)}) == []

    def test_keeps_a_price_that_moved(self):
        out = changed_history_rows([_row(1.95)], {KEY: (1.90, None)})
        assert len(out) == 1 and out[0]["price"] == 1.95

    def test_keeps_a_line_move_at_an_unchanged_price(self):
        prev = {("e1", 1, "spreads", "Home"): (1.90, -4.5)}
        out = changed_history_rows([_row(1.90, point=-5.5, market="spreads")], prev)
        assert len(out) == 1 and out[0]["point"] == -5.5

    def test_drops_an_unchanged_spread(self):
        prev = {("e1", 1, "spreads", "Home"): (1.90, -4.5)}
        assert changed_history_rows([_row(1.90, point=-4.5, market="spreads")], prev) == []

    def test_treats_a_point_appearing_or_vanishing_as_a_change(self):
        assert len(changed_history_rows([_row(1.90, point=-4.5)], {KEY: (1.90, None)})) == 1
        assert len(changed_history_rows([_row(1.90, point=None)], {KEY: (1.90, -4.5)})) == 1

    def test_each_bookmaker_and_outcome_is_tracked_separately(self):
        prev = {
            ("e1", 1, "h2h", "Home"): (1.90, None),
            ("e1", 1, "h2h", "Away"): (2.00, None),
        }
        rows = [
            _row(1.90, outcome="Home"),            # unchanged  -> dropped
            _row(2.10, outcome="Away"),            # moved      -> kept
            _row(1.90, outcome="Home", bm=2),      # other book -> kept (unseen)
        ]
        out = changed_history_rows(rows, prev)
        assert [(r["outcome"], r["bookmaker_id"]) for r in out] == [("Away", 1), ("Home", 2)]

    def test_a_full_unchanged_sweep_writes_nothing(self):
        # The production case: every book polled, nothing moved.
        prev, rows = {}, []
        for bm in range(1, 7):
            for outcome, price in (("Home", 1.5), ("Away", 2.5)):
                prev[("e1", bm, "h2h", outcome)] = (price, None)
                rows.append(_row(price, outcome=outcome, bm=bm))
        assert changed_history_rows(rows, prev) == []
        assert len(rows) == 12          # 12 rows offered, 0 written


# ---------------------------------------------------------------------------
# retention window
# ---------------------------------------------------------------------------

class _Param:
    def __init__(self, value): self.value = value


class _DB:
    """Minimal stand-in for the one query _retention_days makes."""
    def __init__(self, param): self._param = param
    def query(self, *_): return self
    def filter(self, *_): return self
    def first(self): return self._param


@pytest.mark.parametrize("stored,expected", [
    (None, _DEFAULT_RETENTION_DAYS),        # no row seeded
    (30.0, 30),                             # admin-tuned
    (7.0, 7),                               # minimum accepted
    (0.0, _DEFAULT_RETENTION_DAYS),         # would wipe the table — refused
    (-5.0, _DEFAULT_RETENTION_DAYS),        # nonsense — refused
    (3.0, _DEFAULT_RETENTION_DAYS),         # under the floor — refused
])
def test_retention_days_guards_against_a_table_wipe(stored, expected):
    db = _DB(None if stored is None else _Param(stored))
    assert _retention_days(db) == expected
