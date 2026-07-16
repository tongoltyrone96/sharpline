"""
Build a plain-English rationale string from a model summary dict.

Public surface:
  build_rationale(summary) -> str
"""

from __future__ import annotations


def build_rationale(summary: dict) -> str:
    """
    Return a concise English sentence describing the model's recommendation.

    summary keys:
      home_team, away_team, projected_margin, projected_total,
      best_edge_pct, best_market, best_outcome, best_bookmaker, factors
    """
    home = summary.get("home_team", "Home")
    away = summary.get("away_team", "Away")
    mu   = summary.get("projected_margin", 0.0)
    tot  = summary.get("projected_total")
    edge = summary.get("best_edge_pct", 0.0)
    bk   = summary.get("best_bookmaker", "")
    mkt  = summary.get("best_market", "")
    outcome = summary.get("best_outcome", "")

    # Margin description
    if mu < 0:
        margin_text = f"{home} favoured by {abs(mu):.1f} points"
    elif mu > 0:
        margin_text = f"{away} favoured by {abs(mu):.1f} points"
    else:
        margin_text = f"{home} vs {away} is a pick-em"

    # Total description
    total_text = f"projected total {tot:.1f}" if tot is not None else ""

    # Best edge sentence
    if edge > 0:
        mkt_label = {"spreads": "spread", "h2h": "head-to-head", "totals": "totals"}.get(mkt, mkt)
        edge_text = (
            f"Best value: {outcome} {mkt_label} at {bk} "
            f"({edge:+.2f}% edge)."
        )
    else:
        edge_text = "No positive edge found at current prices."

    parts = [margin_text]
    if total_text:
        parts.append(total_text)
    sentence = ", ".join(parts) + ". " + edge_text

    # Append factor notes if any
    factors = summary.get("factors", [])
    if factors:
        sentence += " Factors: " + "; ".join(str(f) for f in factors) + "."

    return sentence
