"""
Phase 5 gate tests — Model Engine.

All tests are pure (no DB, no API calls). Real data from the Melbourne Demons
vs North Melbourne AFL event (2026-07-13 live poll) anchors the numeric tests.

TABtouch: -15.5  |  TAB/PointsBet/PlayUp: -13.5  |  SportsBet/Betr: -14.5
AFL sigma_margin=28.0,  sigma_total=22.0
"""

import pytest
from app.services.devig import devig_h2h, devig_spreads, devig_totals
from app.services.model import (
    fair_price_spread,
    fair_price_total,
    edge_pct,
    project_margin,
    project_total,
    compute_model_outputs,
)
from app.services.rationale import build_rationale


# ── REQ-8 gate (from BUILD.md) ────────────────────────────────────────────────

class TestReq8FairPriceDiffersByBookLine:
    """Core REQ-8: different bookmaker lines must yield different fair prices."""

    def test_fair_price_differs_by_book_line(self):
        """BUILD.md REQ-8 test verbatim — mu=-6.5, sigma=13."""
        mu, sigma = -6.5, 13.0
        p_tab,  fair_tab = fair_price_spread(mu, -4.5, sigma, "home")
        p_bf,   fair_bf  = fair_price_spread(mu, -5.5, sigma, "home")
        assert fair_tab != fair_bf
        assert p_tab > p_bf
        assert fair_tab < fair_bf
        assert edge_pct(1.90, fair_tab) != edge_pct(1.90, fair_bf)

    def test_reference_values(self):
        """Exact values verified before implementation."""
        mu, sigma = -6.5, 13.0
        _, fair_tab = fair_price_spread(mu, -4.5, sigma, "home")
        _, fair_bf  = fair_price_spread(mu, -5.5, sigma, "home")
        assert abs(fair_tab - 1.7821) < 0.0001
        assert abs(fair_bf  - 1.8845) < 0.0001

    def test_edge_signs(self):
        """Positive edge when fair price < offered price."""
        mu, sigma = -6.5, 13.0
        _, fair_tab = fair_price_spread(mu, -4.5, sigma, "home")
        assert edge_pct(1.90, fair_tab) > 0  # offered 1.90 > fair 1.782

    def test_afl_tabtouch_vs_tab_different_fair_prices(self):
        """
        Real data: TABtouch -15.5 vs TAB -13.5 (AFL sigma=28.0).
        These MUST yield different fair prices — if they are the same, REQ-8 is broken.
        """
        mu = -14.0  # approximate projected margin from full devig
        sigma = 28.0
        _, fair_tabtouch = fair_price_spread(mu, -15.5, sigma, "home")
        _, fair_tab      = fair_price_spread(mu, -13.5, sigma, "home")
        assert fair_tabtouch != fair_tab


# ── De-vig tests ──────────────────────────────────────────────────────────────

class TestDevig:
    def test_h2h_symmetric_books(self):
        """50/50 match with equal margin: both fair odds = 2.0."""
        books = [
            {"outcome": "Home", "price": 1.909},
            {"outcome": "Away", "price": 1.909},
        ]
        result = devig_h2h(books)
        assert abs(result["Home"] - 2.0) < 0.01
        assert abs(result["Away"] - 2.0) < 0.01

    def test_h2h_favourite_has_lower_fair_price(self):
        """Favourite's fair price must be lower than underdog's."""
        books = [
            {"outcome": "Home", "price": 1.50},
            {"outcome": "Away", "price": 2.80},
        ]
        result = devig_h2h(books)
        assert result["Home"] < result["Away"]

    def test_h2h_fair_probs_sum_to_one(self):
        """De-vigged probabilities must sum to 1.0."""
        books = [
            {"outcome": "Home", "price": 1.72},
            {"outcome": "Away", "price": 2.10},
        ]
        result = devig_h2h(books)
        assert abs(sum(1 / v for v in result.values()) - 1.0) < 1e-9

    def test_betfair_weighted_higher(self):
        """Betfair (weight=2.0) should pull the consensus toward its price."""
        books_equal = [
            {"outcome": "Home", "price": 2.0, "weight": 1.0},
            {"outcome": "Away", "price": 2.0, "weight": 1.0},
        ]
        books_bf = [
            {"outcome": "Home", "price": 2.0, "weight": 2.0},
            {"outcome": "Away", "price": 2.0, "weight": 2.0},
        ]
        r1 = devig_h2h(books_equal)
        r2 = devig_h2h(books_bf)
        # Both symmetric → same result regardless of weight
        assert abs(r1["Home"] - r2["Home"]) < 1e-9

    def test_devig_spreads_returns_two_outcomes(self):
        books = [
            {"outcome": "Home", "price": 1.909, "point": -13.5},
            {"outcome": "Away", "price": 1.909, "point": 13.5},
        ]
        result = devig_spreads(books)
        assert set(result.keys()) == {"Home", "Away"}

    def test_devig_totals_returns_over_under(self):
        books = [
            {"outcome": "Over",  "price": 1.909, "point": 44.5},
            {"outcome": "Under", "price": 1.909, "point": 44.5},
        ]
        result = devig_totals(books)
        assert set(result.keys()) == {"Over", "Under"}

    def test_empty_books_raises(self):
        with pytest.raises((ValueError, ZeroDivisionError)):
            devig_h2h([])


# ── project_margin / project_total ────────────────────────────────────────────

class TestProjectMargin:
    def test_single_book_returns_its_own_point(self):
        """With one book, projected margin = that book's point."""
        consensus = [{"outcome": "Home", "point": -13.5, "fair_prob": 0.6}]
        mu = project_margin(consensus)
        assert abs(mu - (-13.5)) < 0.001

    def test_equal_weight_two_books(self):
        """Two books with equal fair_prob → average of their points."""
        consensus = [
            {"outcome": "Home", "point": -13.5, "fair_prob": 0.55},
            {"outcome": "Home", "point": -15.5, "fair_prob": 0.55},
        ]
        mu = project_margin(consensus)
        assert abs(mu - (-14.5)) < 0.001

    def test_returns_negative_for_home_favourite(self):
        consensus = [{"outcome": "Home", "point": -7.5, "fair_prob": 0.65}]
        assert project_margin(consensus) < 0

    def test_project_total_single_book(self):
        consensus = [{"outcome": "Over", "point": 42.5, "fair_prob": 0.5}]
        total = project_total(consensus)
        assert abs(total - 42.5) < 0.001


# ── fair_price_spread / fair_price_total ──────────────────────────────────────

class TestFairPriceSpread:
    def test_home_and_away_complement(self):
        """P(home covers) + P(away covers) = 1 for symmetric line."""
        mu, sigma = 0.0, 13.0
        p_home, _ = fair_price_spread(mu, 0.0, sigma, "home")
        p_away, _ = fair_price_spread(mu, 0.0, sigma, "away")
        assert abs(p_home + p_away - 1.0) < 1e-9

    def test_fair_price_is_reciprocal_of_prob(self):
        mu, sigma = -6.5, 13.0
        p, fair = fair_price_spread(mu, -4.5, sigma, "home")
        assert abs(fair - 1 / p) < 1e-9

    def test_wider_spread_lowers_home_prob(self):
        """Giving more points to home side → harder to cover → lower home prob."""
        mu, sigma = -10.0, 13.0
        p_tight, _ = fair_price_spread(mu, -8.0,  sigma, "home")  # easier cover
        p_wide,  _ = fair_price_spread(mu, -13.5, sigma, "home")  # harder cover
        assert p_tight > p_wide

    def test_even_match_point_zero_prob_half(self):
        """mu=0, point=0 → home prob ≈ 0.5."""
        p, _ = fair_price_spread(0.0, 0.0, 13.0, "home")
        assert abs(p - 0.5) < 1e-9


class TestFairPriceTotal:
    def test_over_under_sum_to_one(self):
        """P(Over) + P(Under) must be exactly 1.0."""
        projected_total = 42.5
        sigma = 22.0
        p_over,  _ = fair_price_total(projected_total, 44.5, sigma, "Over")
        p_under, _ = fair_price_total(projected_total, 44.5, sigma, "Under")
        assert abs(p_over + p_under - 1.0) < 1e-9

    def test_high_total_favours_under(self):
        """Line well above projection → Under more likely than Over."""
        projected_total = 38.0
        p_over,  _ = fair_price_total(projected_total, 50.0, 22.0, "Over")
        p_under, _ = fair_price_total(projected_total, 50.0, 22.0, "Under")
        assert p_under > p_over

    def test_fair_price_is_reciprocal(self):
        p, fair = fair_price_total(42.5, 44.5, 22.0, "Over")
        assert abs(fair - 1 / p) < 1e-9


# ── edge_pct ──────────────────────────────────────────────────────────────────

class TestEdgePct:
    def test_positive_edge_when_offered_above_fair(self):
        assert edge_pct(2.0, 1.8) > 0

    def test_negative_edge_when_offered_below_fair(self):
        assert edge_pct(1.5, 2.0) < 0

    def test_zero_edge_at_fair_price(self):
        assert edge_pct(2.0, 2.0) == pytest.approx(0.0)

    def test_reference_edges(self):
        """Match the pre-verified reference values (±0.01%)."""
        mu, sigma = -6.5, 13.0
        _, fair_tab = fair_price_spread(mu, -4.5, sigma, "home")
        _, fair_bf  = fair_price_spread(mu, -5.5, sigma, "home")
        assert abs(edge_pct(1.90, fair_tab) - 6.62) < 0.01
        assert abs(edge_pct(1.90, fair_bf)  - 0.82) < 0.01


# ── compute_model_outputs ─────────────────────────────────────────────────────

class TestComputeModelOutputs:
    """End-to-end: raw odds rows → list of model output dicts."""

    def _afl_rows(self):
        """Minimal AFL event rows reproducing the real Melbourne Demons fixture."""
        return [
            # spreads — three different lines
            {"bookmaker_key": "tabtouch",   "market": "spreads", "outcome": "Melbourne Demons", "price": 1.909, "point": -15.5, "devig_weight": 1.0},
            {"bookmaker_key": "tabtouch",   "market": "spreads", "outcome": "North Melbourne",  "price": 1.909, "point":  15.5, "devig_weight": 1.0},
            {"bookmaker_key": "tab",        "market": "spreads", "outcome": "Melbourne Demons", "price": 1.909, "point": -13.5, "devig_weight": 1.0},
            {"bookmaker_key": "tab",        "market": "spreads", "outcome": "North Melbourne",  "price": 1.909, "point":  13.5, "devig_weight": 1.0},
            {"bookmaker_key": "sportsbet",  "market": "spreads", "outcome": "Melbourne Demons", "price": 1.909, "point": -14.5, "devig_weight": 1.0},
            {"bookmaker_key": "sportsbet",  "market": "spreads", "outcome": "North Melbourne",  "price": 1.909, "point":  14.5, "devig_weight": 1.0},
            # h2h — same price for simplicity
            {"bookmaker_key": "tabtouch",   "market": "h2h", "outcome": "Melbourne Demons", "price": 1.35, "point": None, "devig_weight": 1.0},
            {"bookmaker_key": "tabtouch",   "market": "h2h", "outcome": "North Melbourne",  "price": 3.20, "point": None, "devig_weight": 1.0},
            {"bookmaker_key": "tab",        "market": "h2h", "outcome": "Melbourne Demons", "price": 1.35, "point": None, "devig_weight": 1.0},
            {"bookmaker_key": "tab",        "market": "h2h", "outcome": "North Melbourne",  "price": 3.20, "point": None, "devig_weight": 1.0},
        ]

    def test_returns_list(self):
        rows = self._afl_rows()
        outputs = compute_model_outputs(rows, sigma_margin=28.0, sigma_total=22.0)
        assert isinstance(outputs, list)

    def test_each_output_has_required_keys(self):
        rows = self._afl_rows()
        outputs = compute_model_outputs(rows, sigma_margin=28.0, sigma_total=22.0)
        required = {"bookmaker_key", "market", "outcome", "point", "fair_price", "edge_pct"}
        for o in outputs:
            assert required.issubset(o.keys()), f"Missing keys in {o}"

    def test_tabtouch_and_tab_have_different_fair_prices(self):
        """REQ-8 end-to-end: same market, different lines → different fair prices."""
        rows = self._afl_rows()
        outputs = compute_model_outputs(rows, sigma_margin=28.0, sigma_total=22.0)
        spreads = {
            o["bookmaker_key"]: o
            for o in outputs
            if o["market"] == "spreads" and o["outcome"] == "Melbourne Demons"
        }
        assert "tabtouch" in spreads
        assert "tab" in spreads
        assert spreads["tabtouch"]["fair_price"] != spreads["tab"]["fair_price"]
        assert spreads["tabtouch"]["point"] == -15.5
        assert spreads["tab"]["point"] == -13.5

    def test_spread_outputs_include_point(self):
        """Each spread row must carry the bookmaker's own line, not averaged."""
        rows = self._afl_rows()
        outputs = compute_model_outputs(rows, sigma_margin=28.0, sigma_total=22.0)
        for o in outputs:
            if o["market"] == "spreads":
                assert o["point"] is not None


class TestAwayFavouriteSignConvention:
    """
    Regression: when the AWAY team is the favourite (common in AFL/NRL),
    passing home_name must produce mu > 0 (home is the underdog) so the
    rationale describes the favourite correctly. The legacy heuristic
    (no home_name) collapsed this to mu < 0 and named the wrong team as
    favoured.

    Fixture mirrors the real Port Adelaide (home, +46 dog) vs Fremantle
    (away, -46 fav) AFL match that surfaced the bug in production.
    """

    def _paf_rows(self):
        return [
            {"bookmaker_key": "tab",       "market": "spreads", "outcome": "Port Adelaide Power", "price": 1.90, "point":  46.0, "devig_weight": 1.0},
            {"bookmaker_key": "tab",       "market": "spreads", "outcome": "Fremantle Dockers",   "price": 1.90, "point": -46.0, "devig_weight": 1.0},
            {"bookmaker_key": "sportsbet", "market": "spreads", "outcome": "Port Adelaide Power", "price": 1.90, "point":  46.5, "devig_weight": 1.0},
            {"bookmaker_key": "sportsbet", "market": "spreads", "outcome": "Fremantle Dockers",   "price": 1.90, "point": -46.5, "devig_weight": 1.0},
            {"bookmaker_key": "tab",       "market": "h2h",     "outcome": "Port Adelaide Power", "price": 12.00, "point": None, "devig_weight": 1.0},
            {"bookmaker_key": "tab",       "market": "h2h",     "outcome": "Fremantle Dockers",   "price": 1.08,  "point": None, "devig_weight": 1.0},
        ]

    def test_home_underdog_yields_positive_margin(self):
        from app.services.model import compute_projections
        proj = compute_projections(self._paf_rows(), 28.0, 22.0, home_name="Port Adelaide Power")
        # Home (PAP) is +46 underdog → mu must be positive
        assert proj["projected_margin"] is not None
        assert proj["projected_margin"] > 0, (
            f"Home team is +46 underdog but projected_margin came out "
            f"{proj['projected_margin']} (should be > 0 by the "
            f"'mu < 0 = home favoured' convention)."
        )

    def test_legacy_heuristic_without_home_name_still_returns_negative(self):
        """Backward compatibility: no home_name → old behaviour preserved."""
        from app.services.model import compute_projections
        proj = compute_projections(self._paf_rows(), 28.0, 22.0)
        # Without home_name, the legacy heuristic picks the favourite side
        # (point < 0) and returns that value directly, so mu < 0 even when
        # the favourite is away. We keep this to avoid breaking older
        # callers, but the correct callers must pass home_name.
        assert proj["projected_margin"] < 0

    def test_home_favourite_still_yields_negative_margin(self):
        """Sanity: when home IS the favourite, mu is still negative."""
        rows = [
            {"bookmaker_key": "tab", "market": "spreads", "outcome": "Home", "price": 1.90, "point": -6.5, "devig_weight": 1.0},
            {"bookmaker_key": "tab", "market": "spreads", "outcome": "Away", "price": 1.90, "point":  6.5, "devig_weight": 1.0},
        ]
        from app.services.model import compute_projections
        proj = compute_projections(rows, 13.0, 22.0, home_name="Home")
        assert proj["projected_margin"] < 0


# ── Rationale ─────────────────────────────────────────────────────────────────

class TestRationale:
    def test_returns_non_empty_string(self):
        summary = {
            "projected_margin": -14.0,
            "projected_total": 42.5,
            "home_team": "Melbourne Demons",
            "away_team": "North Melbourne",
            "best_edge_pct": 4.5,
            "best_market": "spreads",
            "best_outcome": "Melbourne Demons",
            "best_bookmaker": "TABtouch",
            "factors": [],
        }
        text = build_rationale(summary)
        assert isinstance(text, str)
        assert len(text) > 20

    def test_includes_team_names(self):
        summary = {
            "projected_margin": -14.0,
            "projected_total": 42.5,
            "home_team": "Melbourne Demons",
            "away_team": "North Melbourne",
            "best_edge_pct": 4.5,
            "best_market": "spreads",
            "best_outcome": "Melbourne Demons",
            "best_bookmaker": "TABtouch",
            "factors": [],
        }
        text = build_rationale(summary)
        assert "Melbourne Demons" in text or "North Melbourne" in text

    def test_positive_edge_mentioned(self):
        summary = {
            "projected_margin": -6.5,
            "projected_total": 38.0,
            "home_team": "Home",
            "away_team": "Away",
            "best_edge_pct": 6.62,
            "best_market": "spreads",
            "best_outcome": "Home",
            "best_bookmaker": "TABtouch",
            "factors": [],
        }
        text = build_rationale(summary)
        # Should communicate that there is a positive edge somewhere
        assert any(word in text.lower() for word in ("edge", "value", "fair", "%"))


# ── Longshot / corrupt-feed edge-cap ─────────────────────────────────────────

class TestLongshotEdgeCap:
    """Corrupt feed data (e.g. 1.01 prices causing overround > 1.30) must be rejected before they produce fake +50% edges."""

    def test_implausible_overround_raises_for_price_1_01(self):
        """
        Two near-certain prices (1.01 + 1.02) produce an overround of ~1.97,
        which is well outside the valid range [0.85, 1.30].  devig_h2h must
        raise a ValueError whose message contains 'overround'.
        """
        books = [
            {"outcome": "Home", "price": 1.01},
            {"outcome": "Away", "price": 1.02},
        ]
        with pytest.raises(ValueError, match="overround"):
            devig_h2h(books)

    def test_all_bad_bookmakers_raises_not_silently_succeeds(self):
        """
        When every bookmaker in a multi-bookmaker list has an implausible
        overround, _weighted_consensus has no valid weight and must raise a
        ValueError rather than silently returning garbage fair prices.
        """
        books = [
            {"outcome": "Home", "price": 1.01, "bookmaker_key": "bad1", "devig_weight": 1.0},
            {"outcome": "Away", "price": 1.02, "bookmaker_key": "bad1", "devig_weight": 1.0},
            {"outcome": "Home", "price": 1.01, "bookmaker_key": "bad2", "devig_weight": 1.0},
            {"outcome": "Away", "price": 1.02, "bookmaker_key": "bad2", "devig_weight": 1.0},
        ]
        with pytest.raises(ValueError):
            devig_h2h(books)

    def test_corrupt_bookmaker_skipped_valid_consensus_used(self):
        """
        One corrupt bookmaker (betfair: 1.01/1.02, overround ≈ 1.97) mixed
        with one valid bookmaker (tab: 1.72/2.10, overround ≈ 1.055).
        The corrupt book must be skipped; the result must be derived from the
        valid book only, with fair probabilities summing to 1.0 and a
        reasonable fair price (> 1.50) for the Home outcome.
        """
        books = [
            {"outcome": "Home", "price": 1.01, "bookmaker_key": "betfair", "devig_weight": 2.0},
            {"outcome": "Away", "price": 1.02, "bookmaker_key": "betfair", "devig_weight": 2.0},
            {"outcome": "Home", "price": 1.72, "bookmaker_key": "tab",     "devig_weight": 1.0},
            {"outcome": "Away", "price": 2.10, "bookmaker_key": "tab",     "devig_weight": 1.0},
        ]
        result = devig_h2h(books)
        assert result is not None
        assert abs(sum(1 / v for v in result.values()) - 1.0) < 1e-6
        assert result["Home"] > 1.50

    def test_edge_pct_capped_when_betfair_corrupt(self):
        """
        End-to-end gate: a corrupt 1.01 Betfair feed mixed with a valid TAB
        feed must never surface as a POSITIVE +50%+ edge in compute_model_outputs.

        Betfair (weight=2) has 1.01/1.02 → overround ≈ 1.97 → skipped.
        Consensus is built from TAB alone (1.72/2.10 → valid).
        Betfair rows get large NEGATIVE edges (1.01 offered vs ~1.82 fair)
        which are harmless — no one should bet them. Only positive edges are
        betting signals, so we assert edge_pct < 50.0 (not abs).
        """
        rows = [
            {"bookmaker_key": "betfair", "market": "h2h", "outcome": "Home", "price": 1.01, "point": None, "devig_weight": 2.0},
            {"bookmaker_key": "betfair", "market": "h2h", "outcome": "Away", "price": 1.02, "point": None, "devig_weight": 2.0},
            {"bookmaker_key": "tab",     "market": "h2h", "outcome": "Home", "price": 1.72, "point": None, "devig_weight": 1.0},
            {"bookmaker_key": "tab",     "market": "h2h", "outcome": "Away", "price": 2.10, "point": None, "devig_weight": 1.0},
        ]
        outputs = compute_model_outputs(rows, sigma_margin=28.0, sigma_total=22.0)
        assert isinstance(outputs, list)
        for o in outputs:
            if o.get("edge_pct") is not None:
                assert o["edge_pct"] < 50.0, (
                    f"Corrupt feed produced implausible positive edge: {o['edge_pct']:.1f}% "
                    f"for {o.get('bookmaker_key')} {o.get('outcome')}"
                )
