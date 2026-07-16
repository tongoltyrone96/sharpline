"""
Model engine — fair price computation.

Layer 1: De-vig (in devig.py) → consensus fair probability per outcome.
Layer 2: Project margin / total from de-vigged spread/totals markets.
Layer 3: Fair price at EACH bookmaker's OWN line (REQ-8).
Layer 4: Edge as (offered / fair - 1) * 100.

Public surface:
  fair_price_spread(mu, book_point, sigma, side) -> (prob, fair_price)
  fair_price_total(projected_total, book_point, sigma, side) -> (prob, fair_price)
  project_margin(consensus_rows)   -> float
  project_total(consensus_rows)    -> float
  edge_pct(offered, fair)          -> float
  compute_model_outputs(rows, sigma_margin, sigma_total) -> list[dict]
"""

from __future__ import annotations

import logging

from scipy.stats import norm

from app.services.devig import devig_h2h, devig_spreads, devig_totals

log = logging.getLogger(__name__)


# ── Primitives ────────────────────────────────────────────────────────────────

def fair_price_spread(
    projected_margin: float,
    book_point: float,
    sigma: float,
    side: str,  # "home" or "away"
) -> tuple[float, float]:
    """
    Return (prob, fair_decimal_price) for a spread bet.

    Sign convention: projected_margin is negative when home is favoured
    (e.g. -14.0 = home favoured by 14). book_point follows the same sign
    (e.g. -15.5 = home giving 15.5 points).

    P(home covers spread s) = Φ((s − μ) / σ)
    """
    if side.lower() == "home":
        z = (book_point - projected_margin) / sigma
        prob = float(norm.cdf(z))
    else:
        # Away covers when home DOESN'T; home point = -book_point
        z = (-book_point - projected_margin) / sigma
        prob = float(1.0 - norm.cdf(z))
    return prob, 1.0 / prob


def fair_price_total(
    projected_total: float,
    book_point: float,
    sigma: float,
    side: str,  # "Over" or "Under"
) -> tuple[float, float]:
    """Return (prob, fair_decimal_price) for an over/under bet."""
    z = (book_point - projected_total) / sigma
    if side.lower() == "over":
        prob = float(1.0 - norm.cdf(z))
    else:
        prob = float(norm.cdf(z))
    return prob, 1.0 / prob


def edge_pct(offered: float, fair: float) -> float:
    """Return edge as a percentage: (offered/fair - 1) * 100."""
    return (offered / fair - 1.0) * 100.0


# ── Projection ────────────────────────────────────────────────────────────────

def project_margin(consensus_rows: list[dict]) -> float:
    """
    Weighted mean of giving-points (negative-point) spread rows, weighted by fair_prob.

    consensus_rows must contain only the favourite side rows (point < 0).
    Returns negative float when the favourite is giving points.
    """
    if not consensus_rows:
        raise ValueError("No rows for margin projection")
    total_w = sum(r["fair_prob"] for r in consensus_rows)
    return sum(r["point"] * r["fair_prob"] for r in consensus_rows) / total_w


def project_total(consensus_rows: list[dict]) -> float:
    """Weighted mean of Over-side total points, weighted by fair_prob."""
    over_rows = [r for r in consensus_rows if r["outcome"].lower() == "over"]
    if not over_rows:
        raise ValueError("No Over rows for total projection")
    total_w = sum(r["fair_prob"] for r in over_rows)
    return sum(r["point"] * r["fair_prob"] for r in over_rows) / total_w


# ── Main entry point ──────────────────────────────────────────────────────────

def compute_model_outputs(
    rows: list[dict],
    sigma_margin: float,
    sigma_total: float,
) -> list[dict]:
    """
    Convert a flat list of odds rows (one row per bookmaker × outcome) into
    model output dicts, one per input row that can be priced.

    Each input row must have:
      bookmaker_key, market, outcome, price, point (None for h2h), devig_weight

    Returns a list of dicts with:
      bookmaker_key, market, outcome, point, fair_price, edge_pct, factors_json
    """
    # Partition by market
    h2h_rows     = [r for r in rows if r["market"] == "h2h"]
    spread_rows  = [r for r in rows if r["market"] == "spreads"]
    total_rows   = [r for r in rows if r["market"] == "totals"]

    # ── Step 1: build consensus fair probs for projection ───────────────────

    # Spreads consensus (for project_margin)
    spread_consensus: list[dict] = []
    if spread_rows:
        # Group by bookmaker to de-vig per book, then weight-average
        bm_groups: dict[str, list[dict]] = {}
        for r in spread_rows:
            bk = r["bookmaker_key"]
            bm_groups.setdefault(bk, []).append(r)

        for bk, bm_rows in bm_groups.items():
            w = bm_rows[0].get("devig_weight", 1.0)
            try:
                fair_prices = devig_spreads(bm_rows)
            except ValueError:
                log.warning("Skipping bookmaker %s for spreads consensus — implausible overround", bk)
                continue
            for r in bm_rows:
                # Only feed the giving-points side (negative point) into project_margin
                # so the consensus reflects: "home/favourite gives X points"
                if r["point"] is not None and r["point"] < 0:
                    spread_consensus.append({
                        "outcome": r["outcome"],
                        "point": r["point"],
                        "fair_prob": 1.0 / fair_prices[r["outcome"]],
                        "weight": w,
                    })

    # Totals consensus (for project_total)
    total_consensus: list[dict] = []
    if total_rows:
        bm_groups2: dict[str, list[dict]] = {}
        for r in total_rows:
            bm_groups2.setdefault(r["bookmaker_key"], []).append(r)

        for bk, bm_rows in bm_groups2.items():
            w = bm_rows[0].get("devig_weight", 1.0)
            try:
                fair_prices = devig_totals(bm_rows)
            except ValueError:
                log.warning("Skipping bookmaker %s for totals consensus — implausible overround", bk)
                continue
            for r in bm_rows:
                if r["point"] is not None and r["outcome"].lower() == "over":
                    total_consensus.append({
                        "outcome": r["outcome"],
                        "point": r["point"],
                        "fair_prob": 1.0 / fair_prices[r["outcome"]],
                        "weight": w,
                    })

    projected_margin = project_margin(spread_consensus) if spread_consensus else None
    projected_total  = project_total(total_consensus)   if total_consensus  else None

    # ── Step 2: price each row at its own bookmaker's line (REQ-8) ──────────

    outputs: list[dict] = []

    for r in spread_rows:
        if projected_margin is None or r["point"] is None:
            continue
        side = "home" if _is_home_side(r["outcome"], spread_rows) else "away"
        prob, fair = fair_price_spread(projected_margin, r["point"], sigma_margin, side)
        outputs.append({
            "bookmaker_key": r["bookmaker_key"],
            "market": r["market"],
            "outcome": r["outcome"],
            "point": r["point"],
            "offered_price": r["price"],
            "fair_price": round(fair, 4),
            "edge_pct": round(edge_pct(r["price"], fair), 4),
            "factors_json": {},
        })

    for r in total_rows:
        if projected_total is None or r["point"] is None:
            continue
        prob, fair = fair_price_total(projected_total, r["point"], sigma_total, r["outcome"])
        outputs.append({
            "bookmaker_key": r["bookmaker_key"],
            "market": r["market"],
            "outcome": r["outcome"],
            "point": r["point"],
            "offered_price": r["price"],
            "fair_price": round(fair, 4),
            "edge_pct": round(edge_pct(r["price"], fair), 4),
            "factors_json": {},
        })

    for r in h2h_rows:
        # H2H: de-vig gives consensus fair price; each book's offered vs that fair
        # Group all h2h by bookmaker, de-vig per book, report per book
        pass  # h2h outputs added below

    # H2H: de-vig per bookmaker, then compute edge vs offered
    h2h_bm_groups: dict[str, list[dict]] = {}
    for r in h2h_rows:
        h2h_bm_groups.setdefault(r["bookmaker_key"], []).append(r)

    # Build cross-book consensus fair for h2h
    all_h2h_fair: dict[str, list[tuple[float, float]]] = {}  # outcome -> [(prob, weight)]
    for bk, bm_rows in h2h_bm_groups.items():
        w = bm_rows[0].get("devig_weight", 1.0)
        try:
            fair_prices = devig_h2h(bm_rows)
        except ValueError:
            log.warning("Skipping bookmaker %s for H2H consensus — implausible overround", bk)
            continue
        for outcome, fp in fair_prices.items():
            all_h2h_fair.setdefault(outcome, []).append((1.0 / fp, w))

    consensus_h2h: dict[str, float] = {}
    for outcome, pw_list in all_h2h_fair.items():
        total_w = sum(w for _, w in pw_list)
        wp = sum(p * w for p, w in pw_list)
        consensus_h2h[outcome] = 1.0 / (wp / total_w)

    for r in h2h_rows:
        fair = consensus_h2h.get(r["outcome"])
        if fair is None:
            continue
        outputs.append({
            "bookmaker_key": r["bookmaker_key"],
            "market": r["market"],
            "outcome": r["outcome"],
            "point": None,
            "offered_price": r["price"],
            "fair_price": round(fair, 4),
            "edge_pct": round(edge_pct(r["price"], fair), 4),
            "factors_json": {},
        })

    return outputs


def compute_projections(
    rows: list[dict],
    sigma_margin: float,
    sigma_total: float,
) -> dict:
    """
    Returns a dict with keys:
      projected_margin  — float or None
      projected_total   — float or None
      h2h_probs         — dict[str, float]  outcome_name → de-vigged consensus probability

    rows have: bookmaker_key, market, outcome, price, point, devig_weight.
    """
    h2h_rows    = [r for r in rows if r["market"] == "h2h"]
    spread_rows = [r for r in rows if r["market"] == "spreads"]
    total_rows  = [r for r in rows if r["market"] == "totals"]

    # ── Projected margin from spreads consensus ───────────────────────────────
    spread_consensus: list[dict] = []
    if spread_rows:
        bm_groups: dict[str, list[dict]] = {}
        for r in spread_rows:
            bm_groups.setdefault(r["bookmaker_key"], []).append(r)

        for bk, bm_rows in bm_groups.items():
            w = bm_rows[0].get("devig_weight", 1.0)
            fair_prices = devig_spreads(bm_rows)
            for r in bm_rows:
                if r["point"] is not None and r["point"] < 0:
                    spread_consensus.append({
                        "outcome": r["outcome"],
                        "point": r["point"],
                        "fair_prob": 1.0 / fair_prices[r["outcome"]],
                        "weight": w,
                    })

    projected_margin = project_margin(spread_consensus) if spread_consensus else None

    # ── Projected total from totals consensus ─────────────────────────────────
    total_consensus: list[dict] = []
    if total_rows:
        bm_groups2: dict[str, list[dict]] = {}
        for r in total_rows:
            bm_groups2.setdefault(r["bookmaker_key"], []).append(r)

        for bk, bm_rows in bm_groups2.items():
            w = bm_rows[0].get("devig_weight", 1.0)
            try:
                fair_prices = devig_totals(bm_rows)
            except ValueError:
                log.warning("Skipping bookmaker %s for totals consensus — implausible overround", bk)
                continue
            for r in bm_rows:
                if r["point"] is not None and r["outcome"].lower() == "over":
                    total_consensus.append({
                        "outcome": r["outcome"],
                        "point": r["point"],
                        "fair_prob": 1.0 / fair_prices[r["outcome"]],
                        "weight": w,
                    })

    projected_total = project_total(total_consensus) if total_consensus else None

    # ── H2H consensus probability ─────────────────────────────────────────────
    h2h_bm_groups: dict[str, list[dict]] = {}
    for r in h2h_rows:
        h2h_bm_groups.setdefault(r["bookmaker_key"], []).append(r)

    all_h2h_fair: dict[str, list[tuple[float, float]]] = {}
    for bk, bm_rows in h2h_bm_groups.items():
        w = bm_rows[0].get("devig_weight", 1.0)
        try:
            fair_prices = devig_h2h(bm_rows)
        except ValueError:
            log.warning("Skipping bookmaker %s for H2H projections — implausible overround", bk)
            continue
        for outcome, fp in fair_prices.items():
            all_h2h_fair.setdefault(outcome, []).append((1.0 / fp, w))

    h2h_probs: dict[str, float] = {}
    for outcome, pw_list in all_h2h_fair.items():
        total_w = sum(w for _, w in pw_list)
        wp = sum(p * w for p, w in pw_list)
        h2h_probs[outcome] = wp / total_w  # consensus probability

    return {
        "projected_margin": projected_margin,
        "projected_total": projected_total,
        "h2h_probs": h2h_probs,
    }


def _is_home_side(outcome: str, spread_rows: list[dict]) -> bool:
    """
    Heuristic: the team with a negative point (giving points) is the home favourite.
    If the outcome name matches the team on the negative side, it's the home side.
    """
    for r in spread_rows:
        if r["outcome"] == outcome and r["point"] is not None:
            return r["point"] < 0
    # Fallback: assume any ambiguous case is home
    return True
