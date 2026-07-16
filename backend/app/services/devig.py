"""
De-vig: strip bookmaker margin to recover fair probabilities.

Method: multiplicative (divide each raw probability by the overround).
Betfair is weighted 2.0 by default (exchange price = sharpest signal).

Public surface:
  devig_h2h(books)      — returns {outcome: fair_decimal_price}
  devig_spreads(books)  — same, for spread markets
  devig_totals(books)   — same, for over/under markets
"""

from __future__ import annotations


_OVERROUND_MIN = 0.85
_OVERROUND_MAX = 1.30


def _multiplicative(books: list[dict]) -> dict[str, float]:
    """Strip overround via multiplicative method; return {outcome: fair_price}."""
    if not books:
        raise ValueError("books list is empty")

    raw_probs = {b["outcome"]: 1.0 / b["price"] for b in books}
    overround = sum(raw_probs.values())
    if not (_OVERROUND_MIN <= overround <= _OVERROUND_MAX):
        raise ValueError(
            f"Implausible overround {overround:.3f} — data likely corrupt "
            f"(expected {_OVERROUND_MIN}–{_OVERROUND_MAX})"
        )
    fair_probs = {k: v / overround for k, v in raw_probs.items()}
    return {k: 1.0 / v for k, v in fair_probs.items()}


def _weighted_consensus(
    books_by_bm: list[list[dict]],
    weights: list[float],
) -> dict[str, float]:
    """
    Weighted mean of fair prices across bookmakers.

    Each bookmaker's books list is de-vigged independently; results are then
    combined as a probability-space weighted mean.
    """
    if not books_by_bm:
        raise ValueError("books_by_bm is empty")

    outcomes = [b["outcome"] for b in books_by_bm[0]]
    weighted_probs: dict[str, float] = {o: 0.0 for o in outcomes}
    valid_weight = 0.0

    for bm_books, w in zip(books_by_bm, weights):
        try:
            fair_prices = _multiplicative(bm_books)
        except ValueError:
            continue  # Skip bookmaker with implausible overround (bad feed data)
        for outcome, fp in fair_prices.items():
            weighted_probs[outcome] += (1.0 / fp) * w
        valid_weight += w

    if valid_weight == 0.0:
        raise ValueError("All bookmakers had implausible overrounds — no valid data to consensus")

    return {o: valid_weight / p for o, p in weighted_probs.items()}


def _group_by_bookmaker(books: list[dict]) -> tuple[list[list[dict]], list[float]]:
    """Split a flat list of outcome dicts into per-bookmaker groups + weights."""
    seen: dict[str, list[dict]] = {}
    weights: dict[str, float] = {}
    for b in books:
        key = b.get("bookmaker_key", "__single__")
        if key not in seen:
            seen[key] = []
            weights[key] = float(b.get("devig_weight", 1.0))
        seen[key].append(b)
    return list(seen.values()), list(weights.values())


# If books already carry bookmaker_key + devig_weight, use weighted consensus.
# If they don't (just a plain list for one book), fall back to multiplicative.

def devig_h2h(books: list[dict]) -> dict[str, float]:
    if any("bookmaker_key" in b for b in books):
        groups, weights = _group_by_bookmaker(books)
        return _weighted_consensus(groups, weights)
    return _multiplicative(books)


def devig_spreads(books: list[dict]) -> dict[str, float]:
    if any("bookmaker_key" in b for b in books):
        groups, weights = _group_by_bookmaker(books)
        return _weighted_consensus(groups, weights)
    return _multiplicative(books)


def devig_totals(books: list[dict]) -> dict[str, float]:
    if any("bookmaker_key" in b for b in books):
        groups, weights = _group_by_bookmaker(books)
        return _weighted_consensus(groups, weights)
    return _multiplicative(books)
