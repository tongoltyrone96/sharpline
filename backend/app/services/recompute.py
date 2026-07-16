"""
Recompute service — reads odds from DB, runs the model, writes model_outputs
and model_summary, then publishes a Redis update.

Public surface:
  recompute_event(db, event_id, redis_client=None) -> dict | None
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.models import Bookmaker, Event, ModelOutput, ModelParam, ModelSummary, Odds
from app.services.model import compute_model_outputs, compute_projections
from app.services.rationale import build_rationale

log = logging.getLogger(__name__)

# Defaults used when model_params has no row for this sport
_DEFAULT_SIGMA_MARGIN = 14.0
_DEFAULT_SIGMA_TOTAL = 22.0


def recompute_event(db: Session, event_id: str, redis_client=None) -> dict | None:
    """
    Read odds from DB → run model → write model_outputs + model_summary → publish.

    Returns the summary dict, or None if the event has no odds.
    """
    # Step 1: load event with related objects
    event = (
        db.query(Event)
        .options(
            joinedload(Event.home_team),
            joinedload(Event.away_team),
            joinedload(Event.sport),
        )
        .filter(Event.id == event_id)
        .first()
    )
    if event is None:
        log.warning("recompute_event: event %s not found", event_id)
        return None

    # Step 2: load odds for this event (enabled bookmakers only)
    odds_rows_q = (
        db.query(Odds, Bookmaker)
        .join(Bookmaker, Odds.bookmaker_id == Bookmaker.id)
        .filter(
            Odds.event_id == event_id,
            Bookmaker.is_enabled == True,
        )
        .all()
    )

    # Step 3: return None if no odds
    if not odds_rows_q:
        log.info("recompute_event: no enabled odds for %s", event_id)
        return None

    # Step 4: build input rows for the model
    input_rows: list[dict] = []
    bookmaker_id_map: dict[str, int] = {}  # bookmaker_key → bookmaker_id

    for odds, bm in odds_rows_q:
        bookmaker_id_map[bm.key] = bm.id
        input_rows.append({
            "bookmaker_key": bm.key,
            "market": odds.market,
            "outcome": odds.outcome,
            "price": odds.price,
            "point": odds.point,
            "devig_weight": bm.devig_weight,
        })

    # Step 5: look up sigma parameters
    sport_key = event.sport.key if event.sport else None

    def _get_param(key: str, default: float) -> float:
        row = None
        if sport_key:
            row = (
                db.query(ModelParam)
                .filter(ModelParam.key == key, ModelParam.sport_key == sport_key)
                .first()
            )
        if row is None:
            row = (
                db.query(ModelParam)
                .filter(ModelParam.key == key, ModelParam.sport_key == None)  # noqa: E711
                .first()
            )
        return row.value if row else default

    sigma_margin = _get_param("sigma_margin", _DEFAULT_SIGMA_MARGIN)
    sigma_total = _get_param("sigma_total", _DEFAULT_SIGMA_TOTAL)

    # Step 6: compute model outputs (one row per bookmaker × outcome, priced)
    try:
        outputs = compute_model_outputs(input_rows, sigma_margin, sigma_total)
    except Exception as exc:
        log.warning("compute_model_outputs failed for %s: %s", event_id, exc)
        outputs = []

    # Step 7: compute projections and h2h consensus
    try:
        projections = compute_projections(input_rows, sigma_margin, sigma_total)
    except Exception as exc:
        log.warning("compute_projections failed for %s: %s", event_id, exc)
        projections = {"projected_margin": None, "projected_total": None, "h2h_probs": {}}

    projected_margin = projections.get("projected_margin")
    projected_total = projections.get("projected_total")
    h2h_probs = projections.get("h2h_probs", {})

    # Step 8: write model_outputs to DB
    db.query(ModelOutput).filter(ModelOutput.event_id == event_id).delete()

    # Determine which bookmaker IDs provided odds (for confidence)
    enabled_bm_count = len(set(bm.id for _, bm in odds_rows_q))

    # Find best row per (market, outcome) — highest edge_pct
    best_key: dict[tuple[str, str], float] = {}
    for o in outputs:
        key = (o["market"], o["outcome"])
        ep = o.get("edge_pct", 0.0) or 0.0
        if key not in best_key or ep > best_key[key]:
            best_key[key] = ep

    now = datetime.now(tz=timezone.utc)
    for o in outputs:
        bm_key = o["bookmaker_key"]
        bm_id = bookmaker_id_map.get(bm_key)
        if bm_id is None:
            continue

        key = (o["market"], o["outcome"])
        ep = o.get("edge_pct", 0.0) or 0.0
        fair_p = o.get("fair_price")
        fair_prob = (1.0 / fair_p) if fair_p else None

        is_best = (ep == best_key.get(key))

        db.add(ModelOutput(
            event_id=event_id,
            market=o["market"],
            outcome=o["outcome"],
            bookmaker_id=bm_id,
            point=o.get("point"),
            fair_prob=fair_prob,
            fair_price=fair_p,
            book_price=o.get("offered_price"),
            edge_pct=ep,
            is_best=is_best,
            computed_at=now,
        ))

    # Step 9: build model_summary
    home_name = event.home_team.name if event.home_team else ""
    away_name = event.away_team.name if event.away_team else ""

    home_win_prob = h2h_probs.get(home_name)
    away_win_prob = (1.0 - home_win_prob) if home_win_prob is not None else None
    fair_home_price = (1.0 / home_win_prob) if home_win_prob else None
    fair_away_price = (1.0 / away_win_prob) if away_win_prob else None

    confidence = min(enabled_bm_count / 10.0, 1.0)

    # Find the best edge across all outputs
    best_output = max(outputs, key=lambda x: x.get("edge_pct", 0.0) or 0.0) if outputs else None

    rationale_summary = {
        "home_team": home_name,
        "away_team": away_name,
        "projected_margin": projected_margin or 0.0,
        "projected_total": projected_total,
        "best_edge_pct": best_output.get("edge_pct", 0.0) if best_output else 0.0,
        "best_market": best_output.get("market", "") if best_output else "",
        "best_outcome": best_output.get("outcome", "") if best_output else "",
        "best_bookmaker": best_output.get("bookmaker_key", "") if best_output else "",
        "factors": [],
    }
    rationale = build_rationale(rationale_summary)

    summary_dict = {
        "event_id": event_id,
        "home_win_prob": home_win_prob,
        "away_win_prob": away_win_prob,
        "confidence": confidence,
        "projected_margin": projected_margin,
        "projected_total": projected_total,
        "fair_home_price": fair_home_price,
        "fair_away_price": fair_away_price,
        "rationale": rationale,
        "factors_json": {},
    }

    # Step 10: upsert model_summary
    existing = db.query(ModelSummary).filter(ModelSummary.event_id == event_id).first()
    if existing is None:
        db.add(ModelSummary(
            event_id=event_id,
            home_win_prob=home_win_prob,
            away_win_prob=away_win_prob,
            confidence=confidence,
            projected_margin=projected_margin,
            projected_total=projected_total,
            fair_home_price=fair_home_price,
            fair_away_price=fair_away_price,
            rationale=rationale,
            factors_json={},
            computed_at=now,
        ))
    else:
        existing.home_win_prob = home_win_prob
        existing.away_win_prob = away_win_prob
        existing.confidence = confidence
        existing.projected_margin = projected_margin
        existing.projected_total = projected_total
        existing.fair_home_price = fair_home_price
        existing.fair_away_price = fair_away_price
        existing.rationale = rationale
        existing.factors_json = {}
        existing.computed_at = now

    db.commit()

    # Step 11: publish Redis update
    if redis_client is not None:
        from app.services.publisher import publish_model_update
        publish_model_update(redis_client, event_id)

    return summary_dict
