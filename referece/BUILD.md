# BUILD.md — Instructions for Claude Code

**Read this together with `DESIGN.md` and `sharpline.html`.**

- `DESIGN.md` — *what* to build and *why*. The requirements, the schema, the maths.
- `sharpline.html` — the **visual specification**. A working single-file implementation of the approved UI. Open it, read its CSS and JS, match it.
- `BUILD.md` (this file) — the *order* of work, and **what must be true before moving on**.

---

## The three rules

**1. Never invent data.**
Team names, bookmaker keys, sport keys, market availability — all of it comes from the live API in Phase 0. If you find yourself typing a team name from memory, stop. It is almost certainly wrong, and a wrong string means events never match teams.

**2. Never break `REQ-8`.**
Each bookmaker carries **its own line** (`point`). TAB may say `-4.5` while Betfair says `-5.5`. These are different bets. Store `point` per bookmaker, compute a fair price *at each book's own line*, and show each book's own line in the UI. This is the client's most-repeated requirement. Every schema change, every normalisation step, every UI table must preserve it.

**3. Never claim what the data cannot support.**
If the API plan cannot refresh every 5 seconds, say so in the README. If there is no track record yet, the Model Performance panel shows "Awaiting results" — not a fabricated ROI. If a bookmaker is not in the feed, grey it out with an explanation. **Honesty is a feature here; the client is betting real money on these numbers.**

---

## Phase 0 — Reconnaissance ★ do this before writing any application code

**Goal:** replace every assumption with an observed fact.

```bash
export ODDS_API_KEY="<the key the client supplied>"
pip install requests
python scripts/recon.py
```

This costs roughly 3 credits per in-season sport. It is the price of certainty, and it is paid once.

**Then read `recon/RECON.md`.** It tells you:

| Question | Where the answer lands |
|---|---|
| Which plan is the key on? Is live refresh even possible? | §1 — sets the Quota Governor mode |
| Which sports actually exist and are in season? | §2 |
| Which of the 7 bookmakers are really in the feed? | §3 — some will be missing |
| Do NRL/AFL really return `spreads` and `totals`? | §4 |
| Do bookmakers really disagree on the line? | §5 — the `REQ-8` proof |
| What are the **exact** team-name strings? | §6 → `recon/teams_seed.py` |

**Gate — do not proceed until all are true:**

- [ ] `recon/RECON.md` exists and has been read end to end.
- [ ] The plan verdict in §1 is understood, and the Quota Governor's default mode is chosen accordingly.
- [ ] Any bookmaker marked **NO** in §3 has been written down to report to the client.
- [ ] Any missing market in §4 has been written down to report to the client.
- [ ] `recon/odds_*.json` copied to `backend/tests/fixtures/` — the test suite must **never** burn a credit.
- [ ] `recon/teams_seed.py` copied to `backend/app/data/` — the `name` fields are **not** to be edited.

**If the recon contradicts `DESIGN.md`, the recon wins.** Update the design doc and tell the human.

---

## Phase 1 — Scaffold

```
sharpline/
├── backend/          FastAPI + Celery + SQLAlchemy + Alembic
├── frontend/         Vite + React + TS + Tailwind
├── docker-compose.yml   Postgres + Redis
└── .gitignore        ← must contain `.env` IN THE FIRST COMMIT
```

**The API key is compromised** (the client pasted it in plain text over chat). Treat it accordingly: `.env` only, never in code, never committed. Add a README note telling the client to regenerate it after deployment.

**Gate:**
- [ ] `docker compose up` brings up Postgres and Redis.
- [ ] `GET /health` returns 200.
- [ ] `git status` shows `.env` is ignored.

---

## Phase 2 — Schema and seed

Implement the tables in `DESIGN.md` §4, plus `model_performance` and `alerts` from §9.0.

Seed from **real** data:
- sports → from `recon/sports.json` (only those actually found)
- teams → from `recon/teams_seed.py` (**names untouched**; fill in colours, venue lat/lon, `indoor`)
- bookmakers → from `recon/bookmakers.json`, with `is_available` set truthfully
- `model_params` → the sigma table in `DESIGN.md` §5.3, plus the adjustment coefficients

**Venue coordinates:** the recon script leaves these `None`. Fill them in by hand for the venues that matter (home grounds). Mark all NBA/NHL/NBL arenas `indoor=True` — those skip the weather call entirely.

**Gate:**
- [ ] `alembic upgrade head` runs clean.
- [ ] `python scripts/seed.py` runs clean, twice in a row (idempotent).
- [ ] `SELECT count(*) FROM teams` matches the number in `RECON.md` §6.
- [ ] Bookmakers absent from the feed exist as rows with `is_available = false`.

---

## Phase 3 — Odds adapter ★ the `REQ-8` foundation

Parse the payload into `events` + `odds`, **one row per (event, bookmaker, market, outcome)**.

```python
for bm in event["bookmakers"]:
    for market in bm["markets"]:
        for outcome in market["outcomes"]:
            upsert_odds(
                event_id     = event["id"],
                bookmaker_id = lookup(bm["key"]),
                market       = market["key"],       # h2h | spreads | totals
                outcome      = outcome["name"],     # team name, or Over/Under
                price        = outcome["price"],
                point        = outcome.get("point"),  # ★ NEVER drop, NEVER average
                last_update  = bm["last_update"],
            )
```

Also write every row to `odds_history` — that is what feeds the line-movement chart and, later, model training.

Parse `x-requests-remaining` / `x-requests-used` on **every** response into `api_quota`.

**Handle failure honestly:** `429` → backoff + retry. `401` → serve cache, raise an alert, set a UI banner. `5xx` → retry ×3 then cache. Empty `[]` → not charged; the sport is between rounds.

**Gate:**
- [ ] Running the poller against `backend/tests/fixtures/odds_nrl.json` produces rows in Postgres.
- [ ] ★ `SELECT bookmaker_id, point FROM odds WHERE market='spreads'` returns **different `point` values for different bookmakers**. If they are all the same, the normaliser is broken — fix it before going further.
- [ ] A team name in the feed that is missing from `teams` raises a loud error, not a silent skip.

---

## Phase 4 — Quota Governor

`DESIGN.md` §6. Default mode comes from the Phase 0 verdict.

The rule that matters most: **`poll_odds` fires every 30 s, but the governor decides whether it may actually call the API.** This is what keeps the code identical between a free key and a paid one.

**Gate:**
- [ ] With a simulated lean budget, out-of-season sports are never polled.
- [ ] Games kicking off in > 24 h are not polled in lean mode.
- [ ] `GET /api/v1/status` reports credits used, remaining, mode, and projected runway.

---

## Phase 5 — Model engine ★ the product

`DESIGN.md` §5. **Unit-test this before writing a single line of UI.**

Order: de-vig (§5.1) → projected margin/total (§5.2) → **fair price at each book's own line (§5.3)** → weather/lineup adjustments (§5.4) → rationale string.

**The `REQ-8` regression test — write this first:**

```python
def test_fair_price_differs_by_book_line():
    """TAB at -4.5 and Betfair at -5.5 are DIFFERENT BETS."""
    mu, sigma = -6.5, 13.0                      # model: home by 6.5, NRL sigma
    p_tab, fair_tab = fair_price_spread(mu, -4.5, sigma, "home")
    p_bf,  fair_bf  = fair_price_spread(mu, -5.5, sigma, "home")

    assert fair_tab != fair_bf                  # different lines, different fair prices
    assert p_tab > p_bf                         # easier line = more likely to cover
    assert fair_tab < fair_bf                   # more likely = shorter price

    # Same offered price, different lines => different edge. This is the whole product.
    assert edge_pct(1.90, fair_tab) != edge_pct(1.90, fair_bf)
```

Verified reference values (`mu=-6.5`, `sigma=13`): fair at `-4.5` ≈ **1.782**, fair at `-5.5` ≈ **1.884**. Both priced at 1.90 → edges of **+6.62%** and **+0.82%**.

**Gate:**
- [ ] De-vigged probabilities sum to 1.0 ± 1e-9.
- [ ] The test above passes.
- [ ] `P(Over) + P(Under) == 1` for any total.
- [ ] High wind lowers `projected_total`. A star ruled out shifts `projected_margin` toward the opponent.
- [ ] `factors_json` records every input that moved a number; `rationale` mentions each one.
- [ ] Same inputs → same outputs (deterministic).

---

## Phase 6 — Weather and lineups

**Weather** (`DESIGN.md` §3.2): OpenWeatherMap free tier. **Indoor venues are never called.** Convert `wind.speed` from m/s to km/h (× 3.6).

**Lineups** (`DESIGN.md` §3.3): this is the messiest part of the project. Build the **manual fallback first** — it is what guarantees the feature ships.

1. `lineups` table + admin CRUD. A human can always enter ins and outs. `source='manual'`, and manual **always overrides** auto.
2. Then attempt the automatic adapters, best-effort, each wrapped in try/except:
   - AFL → Squiggle API (free, public, no key)
   - NRL → scrape the official team lists
   - NBA/NFL/MLB/NHL → ESPN public JSON, or BallDontLie free tier
   - NBL → manual only; no free feed exists

**A scraper that fails must log and return `[]`. It must never crash a poll cycle.** Respect `robots.txt`, use a descriptive User-Agent, rate-limit to ≤ 1 req/min per site.

**Gate:**
- [ ] Indoor venues produce zero weather API calls.
- [ ] Killing every scraper still leaves a working app — lineups come from the admin panel.
- [ ] A manual row overrides an auto row for the same player.

---

## Phase 7 — API and WebSocket

`DESIGN.md` §7.1. The response shape there is exactly what the frontend consumes — match it.

**The browser must never call The Odds API.** Only the Celery poller does. Everything the browser sees comes from Postgres/Redis.

Recompute + push on **any** input change: odds, weather, lineup, or a model parameter edit.

**Gate:**
- [ ] `GET /api/v1/events/{id}` returns `spreads` with a **different `point` and `fair_price` per bookmaker**.
- [ ] A price change in the DB arrives in a connected browser in under a second.
- [ ] The WebSocket reconnects with backoff after a dropped connection.

---

## Phase 8 — Frontend

**Port `sharpline.html` to React.** It is the visual spec: colours, spacing, typography, component structure and interaction behaviour are all already decided. Read its CSS and JS before writing components.

**Build `MarketComparison` first.** It is the product; everything else is supporting cast.

- Three tabs: **Head to Head · Line · Totals**
- An **AI Fair Price** row in **all three** tabs — this is the client's message *"shows ai prices for h2h and lines and total points"* `REQ-5`
- ★ The **Line** tab shows **each bookmaker's own line**. TAB `-4.5`, Betfair `-5.5`, PointsBet `-1.5`. Each row's fair price is computed at **that** line. `REQ-8`
- The **Totals** tab likewise: each book's own total.
- Edge % on every cell. `REQ-7`
- Best price highlighted green. Cells flash green on a rise, red on a fall.

Then `WhyThisIsValue` — the second most important component. It plots the model's number and the bookmaker's number **on the same axis** and fills the gap between them. *The gap is the value, made visible.* This is `REQ-14`, the thing that stops this being a commodity green/red light.

**Gate:**
- [ ] Side-by-side with `sharpline.html`, the React build is visually indistinguishable.
- [ ] Switching to the Line tab shows differing lines across bookmakers.
- [ ] Real iOS Safari: no horizontal overflow, sidebar collapses, table scrolls with the bookmaker column sticky.
- [ ] `prefers-reduced-motion` disables the flashes.

---

## Phase 9 — Admin panel

`DESIGN.md` §10. Five tabs: Bookmakers · Model Parameters · Lineups · Teams · System.

Two of these are contractual deliverables — *"admin panel for adding new bookmakers or tweaking model parameters"* — so they must genuinely work, not just render.

**Gate:**
- [ ] Adding a bookmaker makes it appear in the comparison table.
- [ ] Editing `sigma_margin` triggers a recompute and the dashboard's fair prices visibly change.
- [ ] Entering a lineup change recomputes `projected_margin` and updates the rationale text.

---

## Phase 10 — Tests

`DESIGN.md` §11. Three suites, because the client asked for exactly three:

1. **Data ingestion** (pytest, using the Phase 0 fixtures — never the live API)
2. **Model outputs** (pytest — including the `REQ-8` test from Phase 5)
3. **UI critical paths** (Playwright)

**Gate:**
- [ ] `pytest` green. `vitest` green. `playwright` green.
- [ ] CI runs all three on push.
- [ ] The test suite consumes **zero** API credits.

---

## Phase 11 — Deploy and document

**Deploy** (`DESIGN.md` §12): Vercel (frontend) · Fly.io (backend + worker — it must not sleep, or Celery Beat dies) · Supabase Postgres · Upstash Redis. All free tier.

**README** (`DESIGN.md` §13) — six sections, and it must be honest:

1. Data sources — every provider, what it gives, its limits, its cost
2. Model methodology — de-vig consensus + adjustments now; XGBoost once history accrues. **Say that plainly.**
3. Environment setup
4. **The quota reality** — paste the arithmetic from `RECON.md` §1. This protects both parties.
5. Swapping in a paid feed — which adapter changes (nothing else does)
6. Adding real team logos — set `teams.logo_url`; the generated jersey is the fallback

---

## Things that will go wrong — and what to do

| Symptom | Likely cause | Fix |
|---|---|---|
| Events exist but have no teams | `teams.name` doesn't byte-match the feed string | Re-seed from `recon/teams_seed.py`. Never hand-type team names. |
| Every bookmaker shows the same line | The normaliser dropped or averaged `point` | **Stop.** This breaks `REQ-8`. Fix Phase 3 before anything else. |
| `401` after a few hours | Monthly credits exhausted | Governor should have prevented this. Lower the mode, raise the reserve floor. |
| Spreads/totals empty for NRL/AFL | The feed may not carry them for that sport | Check `RECON.md` §4. Degrade gracefully — show what exists. **Never invent a line.** |
| Weather returns nonsense for an arena | Indoor venue was polled anyway | Set `is_indoor=true`; skip the call. |
| NRL scraper returns nothing | The site changed its HTML | Expected. Log it, fall back to manual entry, carry on. |
| Model Performance shows a made-up ROI | No settled results yet | Show "Awaiting results". **Do not fabricate a track record.** |
| Fair price looks inverted | Spread sign convention | Home favourite = negative `point`. Re-run the Phase 5 test. |

---

## Ambiguities — resolve these with the human, do not guess

1. **TABtouch and Pickle Bet may not be in the feed.** `RECON.md` §3 gives the truth. If absent: show them greyed with "Not covered by the current odds feed", keep the admin able to add them later, and **tell the client**. Do not silently drop them, and do not fake prices.

2. **The free tier cannot do 5-second refresh.** The client's brief asked for it. If `RECON.md` §1 says free tier, the WebSocket push to the browser is still instant — but the *upstream* poll is not. Document the distinction precisely. Do not quietly fail the requirement.

3. **There is no historical data to train on.** The client never supplied any. Layer 1 (de-vig consensus + weather/lineup adjustments) is a legitimate, widely used method and works from day one. XGBoost activates once `odds_history` has accumulated enough settled events. **Say this in the README rather than implying a trained model exists.**

4. **Sigma values are estimates, not facts.** They are seeded, admin-tunable, and flagged as provisional. Recalibrate from `odds_history` once results accrue.

5. **Real club logos are trademarked.** Ship the generated jerseys from `sharpline.html`. `teams.logo_url` accepts licensed files the moment the client supplies them, with no code change.

6. **Player `importance` (0..1) drives the lineup adjustment** and has no free data source. Default everyone to 0.5 and let the client tune stars upward in the admin panel. Do not pretend it is derived.

---

## Definition of done

Every line of `DESIGN.md` §15 is ticked, plus:

- [ ] Phase 0 recon findings reported to the client (missing books, missing markets, the plan's refresh reality).
- [ ] The `REQ-8` test passes and the Line tab visibly shows different lines per bookmaker.
- [ ] Nothing in the app displays a number the data cannot support.
