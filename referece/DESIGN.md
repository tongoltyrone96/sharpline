# Sharpline — Engineering Design Document

**Version 2.0 — definitive build spec**
**Audience:** Claude Code. This is the single source of truth.
**Inputs in hand:** Odds API key received from client. All other feeds must be free.

---

## STEP ZERO — Reconnaissance. Run this before writing any code.

The client has supplied the Odds API key and owns that account — we do not buy or manage the plan, we implement against whatever he gives us. But **almost every important unknown in this project is answered by the live API, not by planning.** So we look first.

```bash
export ODDS_API_KEY="<the key the client supplied>"
python scripts/recon.py          # ships alongside this document
```

`recon.py` costs ~3 credits per in-season sport, runs once, and writes `recon/RECON.md` plus reusable offline test fixtures. It answers:

| Unknown | Why it decides the build |
|---|---|
| **Which plan is the key on?** | Determines whether "live odds" is physically possible at all (see below) |
| **Which sports actually exist / are in season?** | Polling an out-of-season sport is pure waste |
| **Which of the 7 bookmakers are really in the `au` feed?** | TABtouch and Pickle Bet may simply not be there |
| **Do NRL/AFL really return `spreads` and `totals`?** | AU coverage is strongest on `h2h` |
| **Do books really disagree on the line?** | The `REQ-8` proof, from live data |
| **What are the EXACT team-name strings?** | `teams.name` must byte-match, or events never link to teams |

**`recon/RECON.md` is ground truth. If it contradicts this document, the recon wins — update this document.**

### The credit arithmetic — why the plan matters

The Odds API bills in **credits, not requests**:

```
cost = (number of markets) × (number of regions)
```

3 markets (`h2h`, `spreads`, `totals`) × 1 region (`au`) = **3 credits per sport per poll.**
All 7 sports in one sweep = **21 credits.**

| `x-requests-remaining` ≈ | Plan | Full sweeps/month | Consequence |
|---|---|---|---|
| **500** | Free / Starter | **≈ 23** | Live refresh **is not possible**. One sweep every ~31 hours. |
| **20,000+** | Paid | ~950+ | Polling every 30–60 s is comfortable. |

**This does not block the build.** Polling frequency is a **runtime config value**, never an assumption in the code. The **Quota Governor** (§6) spends whatever budget exists, intelligently: on a lean key it refreshes only imminent games; on a rich key the *same code* polls every 30 seconds. Nothing is rewritten when the key is upgraded.

**Record the observed limit in `README.md`.** If it is the free tier, say so plainly and note that upgrading the key alone raises the refresh rate. **Never claim sub-5-second odds on a key that cannot deliver it.**

### Security — first commit

The client pasted the key in plain text over chat. It is compromised by definition.

1. `.env` only. Never in code. Never in git.
2. `.gitignore` must contain `.env` **in the first commit**.
3. Tell the client to regenerate the key once the app is deployed.

---

## 1. Scope

### 1.1 The five deliverables (client's exact list)

| # | Deliverable | Section |
|---|---|---|
| 1 | Full source code, responsive on iOS Safari + Windows Chrome/Edge | §9 |
| 2 | Live demo URL; sub-5s odds, sub-60s player/weather updates | §12 + Step Zero |
| 3 | Documented data sources, model methodology, environment setup | §13 |
| 4 | Admin panel: add bookmakers, tweak model parameters | §10 |
| 5 | Automated tests: ingestion, model outputs, UI critical paths | §11 |

### 1.2 Functional requirements, traced

| ID | Requirement | Origin |
|---|---|---|
| `REQ-1` | 7 sports: NRL, AFL, NBL, MLB, NBA, NFL, NHL | brief |
| `REQ-2` | 7 bookmakers: TAB, Betfair, Sportsbet, Ladbrokes, TABtouch, PointsBet, Pickle Bet | brief |
| `REQ-3` | 3 markets: H2H, Line, Total Points | brief |
| `REQ-4` | Model implied win probability | brief |
| `REQ-5` | Model recommended (fair) price — **in all three markets** | brief + *"shows ai prices for h2h and lines and total points"* |
| `REQ-6` | Projected line + expected total points | brief |
| `REQ-7` | % edge versus **every** bookmaker on screen, in every market | brief |
| `REQ-8` | **Each bookmaker's own line must show** — most may have -3.5, some -1.5 | client, stated twice, emphatically |
| `REQ-9` | Weather quick-view: temperature, wind, rain | brief |
| `REQ-10` | Confirmed line-ups beside each matchup | brief |
| `REQ-11` | **Team logos for all teams** | client, explicit |
| `REQ-12` | Real-time sync of odds + lineups + weather; model recalcs on any change | brief |
| `REQ-13` | Minimalist UI, clean typography, quick filters, value gaps obvious | brief |
| `REQ-14` | In-depth analysis, **not** a green/red light — show **why** | brief, emphasised |

### 1.3 Agreed constraints

- **Single user.** The client's personal tool. No signup, no multi-tenancy, no billing.
- **Every feed except The Odds API must be free.** The client will not pay for SportRadar.
- **Free-tier polling is slower than 5 s.** The client has accepted this.
- **Logos:** generated crests until licensed files are supplied.

### 1.4 Out of scope

User accounts · placing bets · native apps · anything not listed in §1.1–1.2.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ React SPA (Vite + TS + Tailwind)                           │
│ Dashboard · Admin · iOS Safari / Chrome / Edge             │
└──────────────┬────────────────────────┬────────────────────┘
               │ REST (first paint)     │ WebSocket (live push)
┌──────────────▼────────────────────────▼────────────────────┐
│ FastAPI    /api/v1/*    /ws    /admin/*                    │
└──────────────┬─────────────────────────────────────────────┘
   ┌───────────┼────────────┬───────────────┐
┌──▼─────┐ ┌───▼────┐ ┌─────▼─────┐ ┌───────▼─────┐
│Postgres│ │ Redis  │ │  Celery   │ │ Celery Beat │
│ state  │ │cache + │ │  workers  │ │  scheduler  │
└────────┘ │ pubsub │ └─────┬─────┘ └─────────────┘
           └────────┘       │
      ┌──────────────┬──────┴───────┬──────────────┐
 ┌────▼────┐   ┌─────▼─────┐  ┌─────▼─────┐
 │  Odds   │   │  Weather  │  │  Lineups  │
 │ adapter │   │  adapter  │  │ adapters  │
 └────┬────┘   └─────┬─────┘  └─────┬─────┘
      └──────────────┼──────────────┘
              ┌──────▼───────┐
              │ Model Engine │  devig → fair price → per-book edge
              └──────────────┘
```

**Cycle:** Beat fires → Quota Governor decides what may be fetched → adapters fetch → normalise into Postgres → Model Engine recomputes → cache in Redis → publish to Redis pub/sub → FastAPI relays over WebSocket → React updates the cell in place with a flash.

**The browser never calls The Odds API.** Only the Celery poller does. This is what protects the quota.

### 2.1 Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI, Python 3.11+ |
| Queue + scheduler | Celery + Celery Beat, Redis broker |
| Cache + pub/sub | Redis |
| Database | PostgreSQL |
| Model | NumPy + SciPy (core maths) · XGBoost (calibration, later) |
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| Charts | Recharts |
| Tests | pytest · Vitest · Playwright |

---

## 3. Data Sources

Every source sits behind an **adapter**. Swapping a free source for a paid one must touch nothing outside its adapter file.

### 3.1 Odds — The Odds API (key in hand)

Base: `https://api.the-odds-api.com/v4`

| Endpoint | Cost | Purpose |
|---|---|---|
| `GET /sports` | **free** | discover which sports are in season |
| `GET /sports/{key}/odds?regions=au&markets=h2h,spreads,totals&oddsFormat=decimal` | markets × regions | the real fetch |

**Sport keys** — verify each against `/sports` on first run; log and skip any that 404. Do not trust this table blindly.

| Sport | `sport_key` |
|---|---|
| NRL | `rugbyleague_nrl` |
| AFL | `aussierules_afl` |
| NBL | `basketball_nbl` |
| NBA | `basketball_nba` |
| MLB | `baseball_mlb` |
| NFL | `americanfootball_nfl` |
| NHL | `icehockey_nhl` |

**Response shape — this drives the entire data model:**

```json
[{
  "id": "bda33adca828c09dc3cac3a856aef176",
  "sport_key": "rugbyleague_nrl",
  "commence_time": "2026-07-20T09:50:00Z",
  "home_team": "Brisbane Broncos",
  "away_team": "Melbourne Storm",
  "bookmakers": [{
    "key": "tab", "title": "TAB", "last_update": "2026-07-20T08:33:18Z",
    "markets": [
      {"key":"h2h","outcomes":[
        {"name":"Brisbane Broncos","price":1.78},
        {"name":"Melbourne Storm","price":2.20}]},
      {"key":"spreads","outcomes":[
        {"name":"Brisbane Broncos","price":1.90,"point":-4.5},
        {"name":"Melbourne Storm","price":1.90,"point":4.5}]},
      {"key":"totals","outcomes":[
        {"name":"Over","price":1.88,"point":38.5},
        {"name":"Under","price":1.92,"point":38.5}]}
    ]}]
}]
```

> ### ★ The `point` field IS `REQ-8`
> Every bookmaker carries **its own `point`**. TAB returns `-4.5`; Betfair may return `-5.5`.
> **Store `point` per bookmaker, per market. Never average it into one consensus line.**
> This single field is the client's most-repeated requirement. If normalisation loses it, the product fails.

**Quota headers** — parse on *every* response, persist to `api_quota`:
`x-requests-remaining` · `x-requests-used` · `x-requests-last`

**Failure handling:**

| Status | Action |
|---|---|
| `429` | exponential backoff + jitter, retry |
| `401` | quota exhausted or bad key → serve cache, raise alert, set UI banner |
| `5xx` | retry ×3, then serve cache |
| empty `[]` | not charged; sport is between rounds → mark and back off |

#### Bookmaker coverage — handle honestly `REQ-2`

The `au` region reliably returns **Sportsbet, TAB, Ladbrokes, Betfair, PointsBet, Neds, Unibet**.
**TABtouch and Pickle Bet may not be covered.** Do not fake data. Do this:

1. On the first successful poll, collect every distinct `bookmakers[].key`.
2. Upsert into `bookmakers` with `is_available = true`.
3. Requested-but-absent books (TABtouch, Pickle Bet) → insert with `is_available = false`.
4. UI renders them greyed, tooltip: *"Not covered by the current odds feed."*
5. The admin panel can add a bookmaker manually, so a future feed needs no code change.

### 3.2 Weather — OpenWeatherMap `REQ-9`

Free tier: 60 calls/min, 1M/month. Far more than needed.

```
GET https://api.openweathermap.org/data/2.5/weather
    ?lat={lat}&lon={lon}&units=metric&appid={key}
```

Extract: `main.temp` (°C) · `wind.speed` (m/s → **× 3.6** for km/h) · `rain.1h` or `pop` · `main.humidity` · `weather[0].main`.

**Venue coordinates must be seeded** — `backend/app/data/venues.py`: team → venue name, lat, lon, `is_indoor`.

**Indoor venues** (all NBA, NHL, NBL; some others) → **skip the API call entirely.** Set `is_indoor = true`. UI shows *"Indoor venue — weather not modelled."* This is correct behaviour, not a gap.

Refresh every 30 min, only for venues with an event inside the active window.

### 3.3 Lineups / player ins & outs `REQ-10`

No single free feed covers all seven sports. One adapter per sport, each implementing `LineupAdapter`.

| Sport | Source | Reliability |
|---|---|---|
| AFL | **Squiggle API** (`api.squiggle.com.au`) — free, public, no key | good |
| NRL | Official NRL site team lists (scrape) | fragile |
| NBA / NFL / MLB / NHL | **ESPN public JSON** endpoints, or **BallDontLie** free tier | good for teams/games; injury depth varies |
| NBL | *no free feed exists* | manual only |

#### ★ The universal fallback — what makes REQ-10 deliverable

The `lineups` table is the single source of truth. It can be filled by **any adapter, or by a human via the admin panel**. Every row carries:

- `source` — `auto` | `manual`
- `confirmed` — boolean

**Manual always overrides auto.** The UI shows a green *Confirmed* badge when `confirmed = true`, else an amber *Provisional*.

Consequence: **even if every scraper breaks, the client types in the ins and outs and the model recalculates instantly. The feature never hard-fails.** This is the design decision that converts an impossible requirement into a shippable one.

**Scraping discipline:** honour `robots.txt` · descriptive User-Agent · ≤ 1 req/min per site · cache aggressively · wrap every scraper in try/except. A scraper failure is logged and degrades gracefully — it never kills a poll cycle.

### 3.4 Team logos `REQ-11`

Real club logos are trademarked. **Do not scrape or bundle them.**

- Ship **generated SVG crests** — circular badge, team colours, abbreviation. Already validated in the approved mockup.
- `teams.logo_url` is nullable. **If set, the UI renders that image instead of the crest.**
- The admin panel exposes `logo_url` per team.

Every team has a logo from day one, and licensed files drop in with zero code change. State this plainly in the README.

---

## 4. Database Schema

```sql
CREATE TABLE sports (
  id            SERIAL PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,        -- 'rugbyleague_nrl'
  title         TEXT NOT NULL,               -- 'NRL'
  in_season     BOOLEAN DEFAULT TRUE,
  poll_priority INT DEFAULT 5
);

CREATE TABLE teams (
  id              SERIAL PRIMARY KEY,
  sport_id        INT REFERENCES sports(id),
  name            TEXT NOT NULL,             -- MUST match the feed string exactly
  abbreviation    TEXT NOT NULL,
  primary_color   TEXT DEFAULT '#333333',
  secondary_color TEXT DEFAULT '#888888',
  logo_url        TEXT,                      -- NULL → generated crest   [REQ-11]
  venue_name      TEXT,
  venue_lat       DOUBLE PRECISION,
  venue_lon       DOUBLE PRECISION,
  is_indoor       BOOLEAN DEFAULT FALSE,
  UNIQUE (sport_id, name)
);

CREATE TABLE bookmakers (
  id            SERIAL PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  is_available  BOOLEAN DEFAULT TRUE,        -- present in the feed?     [REQ-2]
  is_enabled    BOOLEAN DEFAULT TRUE,        -- admin toggle
  is_sharp      BOOLEAN DEFAULT FALSE,       -- Betfair = exchange = sharp
  devig_weight  DOUBLE PRECISION DEFAULT 1.0,
  display_order INT DEFAULT 100,
  color         TEXT
);

CREATE TABLE events (
  id            TEXT PRIMARY KEY,            -- The Odds API event id
  sport_id      INT REFERENCES sports(id),
  home_team_id  INT REFERENCES teams(id),
  away_team_id  INT REFERENCES teams(id),
  commence_time TIMESTAMPTZ NOT NULL,
  status        TEXT DEFAULT 'upcoming',     -- upcoming | live | completed
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON events (commence_time);
CREATE INDEX ON events (sport_id, status);

-- ★ One row per (event, bookmaker, market, outcome).
--   `point` holds THAT BOOKMAKER'S OWN LINE.   [REQ-8]
CREATE TABLE odds (
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT REFERENCES events(id) ON DELETE CASCADE,
  bookmaker_id INT  REFERENCES bookmakers(id),
  market       TEXT NOT NULL,                -- 'h2h' | 'spreads' | 'totals'
  outcome      TEXT NOT NULL,                -- team name, or 'Over' / 'Under'
  price        DOUBLE PRECISION NOT NULL,    -- decimal odds
  point        DOUBLE PRECISION,             -- -4.5 / +4.5 / 38.5 ; NULL for h2h
  last_update  TIMESTAMPTZ NOT NULL,
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, bookmaker_id, market, outcome)
);
CREATE INDEX ON odds (event_id, market);

CREATE TABLE odds_history (        -- line-movement chart + future model training
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT NOT NULL,
  bookmaker_id INT  NOT NULL,
  market       TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  price        DOUBLE PRECISION NOT NULL,
  point        DOUBLE PRECISION,
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON odds_history (event_id, market, recorded_at);

CREATE TABLE weather (
  event_id   TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  temp_c     DOUBLE PRECISION,
  wind_kmh   DOUBLE PRECISION,
  rain_prob  DOUBLE PRECISION,               -- 0..1
  humidity   DOUBLE PRECISION,
  condition  TEXT,
  is_indoor  BOOLEAN DEFAULT FALSE,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lineups (
  id          BIGSERIAL PRIMARY KEY,
  event_id    TEXT REFERENCES events(id) ON DELETE CASCADE,
  team_id     INT  REFERENCES teams(id),
  player_name TEXT NOT NULL,
  status      TEXT NOT NULL,                 -- 'in' | 'out' | 'doubtful'
  reason      TEXT,
  importance  DOUBLE PRECISION DEFAULT 0.5,  -- 0..1 → drives model impact
  source      TEXT DEFAULT 'auto',           -- 'auto' | 'manual' (manual wins)
  confirmed   BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON lineups (event_id);

-- ★ THE dashboard table. One row per (event, market, outcome, bookmaker).
CREATE TABLE model_outputs (
  id           BIGSERIAL PRIMARY KEY,
  event_id     TEXT REFERENCES events(id) ON DELETE CASCADE,
  market       TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  bookmaker_id INT REFERENCES bookmakers(id),  -- NULL = the model's own fair row
  point        DOUBLE PRECISION,             -- the book's own line       [REQ-8]
  fair_prob    DOUBLE PRECISION,             --                          [REQ-4]
  fair_price   DOUBLE PRECISION,             --                          [REQ-5]
  book_price   DOUBLE PRECISION,
  edge_pct     DOUBLE PRECISION,             --                          [REQ-7]
  is_best      BOOLEAN DEFAULT FALSE,
  computed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, market, outcome, bookmaker_id)
);

CREATE TABLE model_summary (
  event_id         TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  home_win_prob    DOUBLE PRECISION,         -- [REQ-4]
  away_win_prob    DOUBLE PRECISION,
  confidence       DOUBLE PRECISION,
  projected_margin DOUBLE PRECISION,         -- [REQ-6]
  projected_total  DOUBLE PRECISION,         -- [REQ-6]
  fair_home_price  DOUBLE PRECISION,
  fair_away_price  DOUBLE PRECISION,
  rationale        TEXT,                     -- [REQ-14] plain-English why
  factors_json     JSONB,                    -- [REQ-14] the inputs used
  computed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE model_params (                  -- admin-tunable   [Deliverable 4]
  key         TEXT PRIMARY KEY,
  value       DOUBLE PRECISION NOT NULL,
  sport_key   TEXT,                          -- NULL = global
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_quota (
  id                 SERIAL PRIMARY KEY,
  provider           TEXT NOT NULL,
  requests_used      INT,
  requests_remaining INT,
  last_cost          INT,
  recorded_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Model Engine — the product itself

`REQ-4` `REQ-5` `REQ-6` `REQ-7` `REQ-8` `REQ-14`

**Hard constraint:** there is **no historical training data.** The client never supplied any. A model that cannot be trained cannot honestly be called AI. So the engine is layered — layer 1 works on day one; layers 2–4 improve it as data accrues.

### 5.1 Layer 1 — de-vigged consensus

Bookmaker prices contain the market's collective estimate **plus a margin** (the vig). Strip the margin and you recover the market's true implied probability. Industry standard, and genuinely useful immediately.

```python
# backend/app/services/devig.py
import numpy as np

def devig_multiplicative(prices: list[float]) -> list[float]:
    """Decimal odds → fair probabilities that sum to 1.0."""
    raw = np.array([1.0 / p for p in prices])
    return (raw / raw.sum()).tolist()          # overround removed


def devig_shin(prices: list[float], z: float = 0.02) -> list[float]:
    """Shin's method — more accurate for longshots. Admin-selectable."""
    raw = np.array([1.0 / p for p in prices])
    s = raw.sum()
    adj = (np.sqrt(z**2 + 4 * (1 - z) * raw**2 / s) - z) / (2 * (1 - z))
    return (adj / adj.sum()).tolist()


def consensus_probability(book_probs: dict[str, float],
                          weights: dict[str, float]) -> float:
    """Weighted mean of each book's de-vigged probability for one outcome."""
    num = sum(p * weights.get(b, 1.0) for b, p in book_probs.items())
    den = sum(weights.get(b, 1.0) for b in book_probs)
    return num / den if den else 0.0
```

**Weighting:** Betfair is an exchange — lowest overround, sharpest prices. Default `devig_weight`: **Betfair 2.0, all others 1.0.** Stored in `model_params`, so the admin panel tunes them `[Deliverable 4]`.

### 5.2 Layer 2 — projected margin and total `REQ-6`

Bootstrap the model's own line and total from the market, then move them with our own adjustments.

```
projected_margin ← weighted median of every book's spreads `point` (home side)
projected_total  ← weighted median of every book's totals  `point`
```

Then apply weather + lineup adjustments (§5.4). **This is what makes the number ours rather than a mirror of the market** — and it is exactly the "why" the client demanded in `REQ-14`.

### 5.3 Layer 3 — ★ fair price **at each bookmaker's own line** `REQ-8`

**The core insight of the whole product.**

TAB offers `-4.5`. Betfair offers `-5.5`. These are **different bets.** Comparing both against one number is simply wrong. Instead, compute a fair price *at each book's own line*.

Model the match margin as a normal distribution around our projection:

```
margin ~ Normal(μ = projected_margin, σ = sigma_margin[sport])

P(home covers spread s) = Φ((μ − s) / σ)       # s = THAT book's own point
fair_price              = 1 / P
edge_pct                = (book_price / fair_price − 1) × 100
```

Totals work identically:

```
total ~ Normal(μ = projected_total, σ = sigma_total[sport])

P(Over T)  = 1 − Φ((T − μ) / σ)                # T = THAT book's own point
P(Under T) = Φ((T − μ) / σ)
```

```python
# backend/app/services/model.py
from scipy.stats import norm

EPS = 1e-6

def fair_price_spread(projected_margin: float, book_point: float,
                      sigma: float, side: str) -> tuple[float, float]:
    """
    Fair probability + price for covering a spread AT THIS BOOK'S OWN LINE.

    projected_margin : model's expected (home_score - away_score).
                       Negative when the home side is favoured, e.g. -6.5
    book_point       : this bookmaker's line for that side, e.g. -4.5
    side             : 'home' | 'away'
    """
    if side == "home":
        # home covers when the actual margin is more negative than the line
        prob = norm.cdf((book_point - projected_margin) / sigma)
    else:
        prob = 1.0 - norm.cdf((-book_point - projected_margin) / sigma)
    prob = min(max(prob, EPS), 1 - EPS)
    return prob, 1.0 / prob


def fair_price_total(projected_total: float, book_point: float,
                     sigma: float, side: str) -> tuple[float, float]:
    """side: 'Over' | 'Under'. book_point is THIS book's total, e.g. 174.5"""
    z = (book_point - projected_total) / sigma
    prob = (1.0 - norm.cdf(z)) if side == "Over" else norm.cdf(z)
    prob = min(max(prob, EPS), 1 - EPS)
    return prob, 1.0 / prob


def edge_pct(book_price: float, fair_price: float) -> float:
    return (book_price / fair_price - 1.0) * 100.0
```

> **Verify the sign convention against real data on day one.** Push a live payload through and sanity-check that a favourite at a shorter line receives a shorter fair price. Write the §11.2 unit test **before** trusting it.

**Result:** every bookmaker gets its own fair price and its own edge, computed at its own line. TAB's `-4.5` and Betfair's `-5.5` each receive a correct, directly comparable edge %. `REQ-7` + `REQ-8`, satisfied properly.

#### Sigma defaults — seeded to `model_params`, admin-tunable, **provisional**

| Sport | `sigma_margin` | `sigma_total` |
|---|---|---|
| NFL | 13.5 | 10.0 |
| NBA | 11.5 | 13.0 |
| NBL | 12.0 | 13.0 |
| NRL | 13.0 | 11.0 |
| AFL | 28.0 | 22.0 |
| MLB | 4.2 | 3.0 |
| NHL | 2.0 | 1.8 |

> **These are starting estimates, not established facts.** The README must say so. The admin panel exists precisely so they can be tuned. Recalibrate empirically from `odds_history` + results once data accrues (§5.5).

### 5.4 Adjustments — ★ the explainability layer `REQ-14`

Each adjustment nudges `projected_margin` / `projected_total` **and writes itself into `factors_json`**, so the UI can show exactly what the model used. This is the difference between this product and a commodity green/red light — the thing the client cared about most in his brief.

**Weather** — skipped entirely when `is_indoor`:

| Condition | Effect on `projected_total` |
|---|---|
| wind > 25 km/h | `-= wind_total_penalty × ((wind − 25) / 10)` |
| rain probability > 40% | `-= rain_total_penalty` |
| temp < 5 °C | `-= cold_total_penalty` |

**Lineups:**

```python
impact = sum(p.importance * lineup_impact_coef
             for p in lineup if p.status == "out")
projected_margin += (away_impact - home_impact)
```

`importance` ∈ 0..1 per player (star ≈ 0.9, squad player ≈ 0.2), editable in the admin panel.
Every coefficient is a per-sport `model_params` row. **Start conservative.**

**Rationale** — build a plain-English sentence from whichever factors actually moved a number:

> *"Model lifts Brisbane after Melbourne rule out Hughes and Munster. Wind at 24 km/h trims the expected total. Best value on the home line at Pickle Bet."*

Store in `model_summary.rationale`; render in the UI callout exactly as the approved mockup does.

### 5.5 Layer 4 — XGBoost calibration (activates once history exists)

`odds_history` accumulates from day one. Once ≈ 500+ completed events per sport:

- **Features:** consensus de-vigged probability · line movement (open → current) · each book's deviation from consensus · weather vector · lineup impact score · rest days · home/away.
- **Targets:** binary outcome (h2h) · actual margin · actual total.
- **Models:** `XGBClassifier` (calibrated — Platt or isotonic) for win probability; `XGBRegressor` for margin and total.
- **Purpose:** correct *systematic bias* in the market consensus. This is the model's real alpha.
- **Validation:** **time-series split only.** Never random — random splits leak the future. Track log-loss and Brier score.
- **Promotion rule:** only prefer XGBoost over the consensus baseline **if it beats it out-of-sample.** Champion flag lives in `model_params.use_xgb`.

Ship `scripts/train_model.py` and `scripts/backfill_history.py`.

**The README must state honestly** that until history accrues the system runs on de-vig consensus + adjustments — a legitimate, widely used method — and not a pretend AI.

### 5.6 Recompute trigger `REQ-12`

Recompute an event whenever **any** input changes: new odds · new weather · new lineup · a changed model parameter. Push over WebSocket immediately.

---

## 6. Quota Governor — `backend/app/services/quota.py`

The component that makes a constrained key survivable. Treat it as a feature, not a workaround.

```python
class QuotaGovernor:
    def credits_remaining(self) -> int: ...
    def days_until_reset(self) -> float: ...
    def mode(self) -> str:                    # 'rich' | 'lean' | 'critical'
        ...
    def may_poll(self, sport) -> bool: ...
    def interval_seconds(self, sport) -> int: ...
```

**Rules:**

1. **Never poll an out-of-season sport.** `/sports` is free — use it to keep `sports.in_season` honest. This alone removes most waste.
2. **Only poll a sport with an active window** — at least one event with `commence_time` in `[now − 3h, now + 12h]`.
3. **Adaptive interval by time-to-kickoff:**

| Time to kickoff | rich | lean |
|---|---|---|
| live / < 1 h | 30 s | 30 min |
| 1–6 h | 5 min | 2 h |
| 6–24 h | 30 min | 6 h |
| > 24 h | 6 h | off |

4. **Auto mode selection.** `credits_per_day = remaining / days_until_reset`. Below threshold → `lean`. Below the reserve floor → `critical` (live games only).
5. **Reserve floor:** hold back 10% of the monthly budget so the app never goes fully dark.
6. **Always request all 3 markets in one call.** Cost is `3 × 1` either way; one call = one round trip, one `last_update`.
7. **One region only (`au`).** A second region **doubles every cost.** Never add one.
8. **Serve the dashboard from Redis.** A browser request must never trigger an upstream call.

**Surface it.** The status ribbon and admin panel show credits used / remaining · current mode · projected runway in days. The client always knows where he stands.

---

## 7. Backend Layout

```
backend/
├── app/
│   ├── main.py                 # FastAPI, CORS, routers, WS
│   ├── config.py               # pydantic-settings; ALL secrets from env
│   ├── db.py
│   ├── models.py               # SQLAlchemy ORM (§4)
│   ├── schemas.py              # Pydantic response models
│   ├── api/
│   │   ├── routes_dashboard.py
│   │   ├── routes_events.py
│   │   ├── routes_admin.py     # §10
│   │   ├── routes_status.py    # quota + feed health
│   │   └── ws.py               # /ws — Redis pubsub → WebSocket
│   ├── adapters/
│   │   ├── base.py             # OddsAdapter / WeatherAdapter / LineupAdapter ABCs
│   │   ├── odds_theoddsapi.py
│   │   ├── weather_openweather.py
│   │   └── lineups/
│   │       ├── afl_squiggle.py
│   │       ├── nrl_scrape.py
│   │       ├── us_sports.py
│   │       └── manual.py       # ← the fallback that guarantees REQ-10
│   ├── services/
│   │   ├── quota.py            # §6
│   │   ├── normalise.py        # payload → DB rows (PRESERVE `point`)
│   │   ├── devig.py            # §5.1
│   │   ├── model.py            # §5.2–5.4  ← the engine
│   │   ├── rationale.py        # §5.4
│   │   └── publisher.py        # Redis pub/sub
│   ├── tasks/
│   │   ├── celery_app.py
│   │   ├── beat_schedule.py
│   │   ├── poll_odds.py
│   │   ├── poll_weather.py
│   │   ├── poll_lineups.py
│   │   └── recompute.py
│   └── data/
│       ├── venues.py           # team → venue lat/lon/indoor
│       └── teams_seed.py       # names, abbreviations, colours   [REQ-11]
├── scripts/ { seed.py, train_model.py, backfill_history.py }
├── tests/                      # §11
├── alembic/
├── pyproject.toml
└── .env.example
```

### 7.1 API contract

```
GET  /api/v1/sports
GET  /api/v1/dashboard?sport=NRL            → everything the board needs, one call
GET  /api/v1/events/{id}                    → full detail (shape below)
GET  /api/v1/events/{id}/history?market=h2h → line-movement chart data
GET  /api/v1/status                         → quota, mode, last sync, feed health
WS   /ws                                    → {type: odds_update | model_update |
                                               lineup_update | weather_update, payload}
```

**`GET /api/v1/events/{id}` — the shape the UI consumes:**

```json
{
  "event": {
    "id": "...", "sport": "NRL", "commence_time": "...", "status": "live",
    "home": {"name":"Brisbane Broncos","abbr":"BRI","logo_url":null,
             "primary_color":"#6B1420","secondary_color":"#C79A3A"},
    "away": {"name":"Melbourne Storm","abbr":"MEL","logo_url":null,
             "primary_color":"#3E2670","secondary_color":"#2E9E9E"}
  },
  "model": {
    "home_win_prob": 0.61, "away_win_prob": 0.39, "confidence": 0.89,
    "projected_margin": -6.5, "projected_total": 178.5,
    "fair_home_price": 1.64, "fair_away_price": 2.56,
    "rationale": "Model lifts Brisbane after Melbourne rule out Hughes and Munster…",
    "factors": {"weather": {...}, "lineups": {...}, "market_movement": "toward BRI"}
  },
  "markets": {
    "h2h": [
      {"bookmaker":"TAB","outcome":"Brisbane Broncos","price":1.78,"point":null,
       "fair_price":1.64,"edge_pct":8.54,"is_best":false},
      {"bookmaker":"Pickle Bet","outcome":"Brisbane Broncos","price":1.83,"point":null,
       "fair_price":1.64,"edge_pct":11.59,"is_best":true}
    ],
    "spreads": [
      {"bookmaker":"TAB","outcome":"Brisbane Broncos","price":1.90,"point":-4.5,
       "fair_price":1.84,"edge_pct":3.26,"is_best":false},
      {"bookmaker":"Betfair","outcome":"Brisbane Broncos","price":1.90,"point":-5.5,
       "fair_price":1.95,"edge_pct":-2.56,"is_best":false}
    ],
    "totals": [
      {"bookmaker":"TAB","outcome":"Over","price":1.88,"point":174.5,
       "fair_price":1.82,"edge_pct":3.30,"is_best":false}
    ]
  },
  "weather": {"temp_c":22,"wind_kmh":16,"rain_prob":0.20,"humidity":68,
              "condition":"Partly Cloudy","is_indoor":false},
  "lineups": [
    {"team":"MEL","player":"Hughes","status":"out","reason":"hamstring","confirmed":true}
  ]
}
```

Note the `spreads` array: **a different `point` and a different `fair_price` per bookmaker.**
That is `REQ-8`, satisfied end to end — from feed, through model, to pixel.

---

## 8. Celery Schedule

```python
beat_schedule = {
  "poll-odds":      {"task": "tasks.poll_odds",      "schedule": 30.0},
  "poll-weather":   {"task": "tasks.poll_weather",   "schedule": 1800.0},   # 30 min
  "poll-lineups":   {"task": "tasks.poll_lineups",   "schedule": 900.0},    # 15 min
  "refresh-sports": {"task": "tasks.refresh_sports", "schedule": 21600.0},  # 6 h, free
  "prune-history":  {"task": "tasks.prune_history",  "schedule": 86400.0},
}
```

`poll_odds` *fires* every 30 s, but the **Quota Governor decides whether it may actually call the API.** On a lean budget it returns immediately most of the time. This is exactly what keeps the code identical between a free key and a paid one.

---

## 9. Frontend

Port the **approved Sharpline mockup** to React.

> **`sharpline.html` (shipped alongside this document) is the visual specification.**
> It is a complete, working, single-file implementation of the approved design: exact colours,
> spacing, typography, component structure, and interaction behaviour. **Match it.**
> Open it in a browser and read its CSS/JS before writing any component.

```
frontend/src/
├── pages/       { Dashboard.tsx, Admin.tsx }
├── components/
│   ├── Sidebar.tsx             # nav · Bookmarks · Model Status · Last updated
│   ├── TopBar.tsx              # search · Live pill · Updated Ns ago · bell · user
│   ├── FilterBar.tsx           # sport tabs · All Markets · All Bookmakers · Value only
│   │                           #                                     [REQ-13]
│   ├── FixtureCarousel.tsx     # horizontal scroller + arrows
│   ├── FixtureCard.tsx         # league chip · time/LIVE · edge% · jerseys ·
│   │                           # prices · Line + Total Pts footer
│   ├── AIInsightsPanel.tsx     # Top value opportunities + Market movers
│   ├── WhyThisIsValue.tsx      # ★ model-vs-book gauge cards        [REQ-14]
│   ├── ModelPerformance.tsx    # 30D ROI · sparkline · Win Rate · Avg Edge
│   ├── AlertsPanel.tsx         # Line movement / Value threshold / Team news
│   ├── MarketComparison.tsx    # ★ H2H / Line / Totals   [REQ-5][REQ-7][REQ-8]
│   ├── WeatherPanel.tsx        # temp / wind / rain                 [REQ-9]
│   ├── LineupPanel.tsx         # ins & outs, confirmed badge        [REQ-10]
│   ├── LineMovementChart.tsx   # Recharts, from /history
│   └── TeamJersey.tsx          # generated jersey, or logo_url      [REQ-11]
├── hooks/       { useWebSocket.ts, useDashboard.ts }
└── lib/         { api.ts, format.ts, colors.ts }
```

### 9.0 New components introduced by the approved mock

**`WhyThisIsValue`** — ★ *this is the visual answer to `REQ-14`.*
Each card names a bookmaker + selection, then states the model's number against the
bookmaker's number in plain English, e.g.
*"Our model projects **Penrith by -3.42**. You're getting **-2.5**."*
Beneath it a horizontal gauge plots **both points on the same axis** — the model's value (blue)
and the price you can actually take (green) — with the span between them filled and the edge %
badged on the right. The gap *is* the value, made visible. Three cards, one per top opportunity.
Data source: `model_summary.projected_margin` / `projected_total` / `home_win_prob` versus the
best `odds.point` / `odds.price`. Supports three gauge modes: **spread**, **total**, and
**win-probability** (the third card uses a % axis).

**`ModelPerformance`** — 30-day ROI, an equity sparkline, win rate, average edge.
Backed by a new table:

```sql
CREATE TABLE model_performance (
  id           BIGSERIAL PRIMARY KEY,
  recorded_on  DATE NOT NULL,
  roi_30d      DOUBLE PRECISION,
  win_rate     DOUBLE PRECISION,
  avg_edge     DOUBLE PRECISION,
  equity       DOUBLE PRECISION,     -- cumulative, drives the sparkline
  UNIQUE (recorded_on)
);
```

Computed nightly by settling completed events against the fair prices the model published at the
time. **Until enough settled events exist this panel shows "Awaiting results" rather than a
fabricated number.** Do not invent a track record.

**`AlertsPanel`** — counts by alert type. Backed by:

```sql
CREATE TABLE alerts (
  id         BIGSERIAL PRIMARY KEY,
  event_id   TEXT REFERENCES events(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- 'line_movement' | 'value_threshold' | 'team_news'
  message    TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`FixtureCard`** — note the footer shows **Line** and **Total Pts** for upcoming games, and
switches to **Score** + period for live ones. The top-right edge % is the best available edge
across all bookmakers for that fixture.

### 9.1 `MarketComparison` — the single most important component

Three tabs: **Head to Head · Line · Totals.**

- The top row is always **AI Fair Price**, highlighted in accent blue, and it is present in **all three tabs**. This is precisely the client's message *"shows ai prices for h2h and lines and total points"*. `REQ-5`
- One row per bookmaker.
- **The Line tab renders each bookmaker's own `point` in its own column.** TAB `-4.5`, Betfair `-5.5`. Each row's fair price is computed *at that book's line* (§5.3), and the edge column reflects it. `REQ-8`
- The Totals tab likewise: each book's own total, its own over/under prices, its own edge.
- Best available price per outcome → green highlight.
- Every cell carries its edge %. `REQ-7`
- Cells flash green on a rise, red on a fall, driven by the WebSocket.

**This table is the product. Everything else is supporting cast.**

### 9.2 Responsive `REQ-1`

- Verify on **real iOS Safari** and **Windows Chrome/Edge**.
- Sidebar collapses below 980 px. The comparison table scrolls horizontally on mobile with the bookmaker column sticky.
- `viewport-fit=cover` + safe-area insets for the iPhone notch.
- Honour `prefers-reduced-motion` — disable the flash animations.

---

## 10. Admin Panel `Deliverable 4`

`/admin`, gated by one shared password (`ADMIN_PASSWORD`). Single-user tool; nothing more is warranted.

| Tab | Contents |
|---|---|
| **Bookmakers** | Add a bookmaker (key, title, colour). Toggle `is_enabled`. Set `devig_weight`, `is_sharp`. Reorder. → *"adding new bookmakers"* |
| **Model Parameters** | Every `model_params` row, grouped by sport, inline editor: `sigma_margin`, `sigma_total`, `wind_total_penalty`, `rain_total_penalty`, `cold_total_penalty`, `lineup_impact_coef`, `devig_method`, `use_xgb`. **Saving triggers a full recompute + WebSocket push.** → *"tweaking model parameters"* |
| **Lineups** | Manual entry per event: player, status, reason, importance, confirmed. **The fallback that guarantees `REQ-10`.** |
| **Teams** | Name, abbreviation, colours, **`logo_url`** `REQ-11`, venue lat/lon, indoor flag. |
| **System** | Credits used / remaining · governor mode · projected runway · per-adapter health and last error · **force refresh** button. |

---

## 11. Testing `Deliverable 5`

### 11.1 Data ingestion — pytest
- Parse a **saved real payload** fixture → assert events, bookmakers, **and that `point` survives per bookmaker** ← the `REQ-8` guard.
- A missing market (NRL may lack `spreads`) → no crash, graceful degradation.
- A requested bookmaker absent from the feed → `is_available = false`, never silently dropped.
- `429` → backoff + retry. `401` → serve cache + alert.
- Quota headers parsed and persisted.
- Weather: indoor venues are **never** called.
- Lineups: a scraper exception degrades gracefully; **manual rows override auto rows.**

### 11.2 Model outputs — pytest
- De-vig: a known overround → probabilities sum to 1.0 ± 1e-9.
- ★ **Fair price at differing lines.** Given `projected_margin = -6.5`, assert `fair_price(-4.5) ≠ fair_price(-5.5)`, and that the *shorter* line yields the *shorter* price.
  **This is the `REQ-8` regression test — write it first, before any UI exists.**
- Edge sign: a book priced above fair → positive edge; below → negative.
- Totals: `P(Over) + P(Under) = 1`.
- Adjustments: high wind lowers `projected_total`; a star ruled out shifts `projected_margin` toward the opponent.
- Rationale mentions every factor that actually moved a number.
- Determinism: identical inputs → identical outputs.

### 11.3 UI critical paths — Playwright
- Dashboard loads; fixtures render; a fixture is selectable.
- **The Line tab shows differing `point` values across bookmakers.** `REQ-8`
- **The AI Fair Price row is present in all three market tabs.** `REQ-5`
- Weather and lineups render beside the selected matchup. `REQ-9` `REQ-10`
- A simulated WebSocket price update flashes the correct cell.
- Admin: changing a model parameter triggers a recompute and the dashboard value changes.
- Mobile viewport 390 × 844 with an iOS Safari UA: sidebar collapses, table scrolls, nothing overflows.

CI: GitHub Actions — `pytest` + `vitest` + `playwright` on every push.

---

## 12. Deployment `Deliverable 2`

All free tier:

| Component | Host | Note |
|---|---|---|
| Frontend | **Vercel** | free |
| Backend + worker | **Fly.io** (preferred) or Railway | must not sleep — Celery Beat has to keep running |
| Postgres | **Supabase** free | 500 MB |
| Redis | **Upstash** free | serverless |

> **Do not use Render's free web service.** It sleeps on inactivity, which kills Celery Beat. If it must be used, add an external cron ping.

**State plainly in the README:** WebSocket push to the browser is effectively instant (far under 5 s). The **upstream** odds refresh interval is bounded by the Odds API plan. On the free tier it is minutes-to-hours; on a paid tier the identical code polls every 30 s. **Never claim sub-5-second odds on a free key.**

---

## 13. Documentation `Deliverable 3`

`README.md` must contain:

1. **Data sources** — every provider, endpoint, what it returns, its limits, its cost.
2. **Model methodology** — §5 in plain English. State honestly: layer 1 is a de-vigged market consensus plus weather/lineup adjustments; sigma values are initial estimates pending calibration; XGBoost activates once history accrues.
3. **Environment setup** — clone → `.env` → `docker compose up` → `alembic upgrade head` → `python scripts/seed.py` → run.
4. **The quota reality** — Step Zero, with the arithmetic shown. This protects both parties.
5. **Swapping in a paid feed** — which adapter file changes. Nothing else does.
6. **Adding real team logos** — set `teams.logo_url`; the generated crest is the fallback.

`.env.example`:

```
ODDS_API_KEY=
OPENWEATHER_API_KEY=
DATABASE_URL=postgresql://user:pass@host:5432/sharpline
REDIS_URL=redis://localhost:6379/0
ADMIN_PASSWORD=
ODDS_POLL_MODE=auto            # auto | rich | lean
CORS_ORIGINS=http://localhost:5173
```

---

## 14. Build Order

**See `BUILD.md`** — it carries the phase-by-phase instructions and, critically, the **verification gate** that must pass before each phase is considered done.

Summary:

| Phase | Work | The gate that matters |
|---|---|---|
| **0** | **Recon** — `scripts/recon.py` | `RECON.md` read; fixtures + real team names captured |
| 1 | Scaffold | `docker compose up` works; `.env` is gitignored |
| 2 | Schema + seed from **real** recon data | `teams.name` byte-matches the feed |
| 3 | Odds adapter | ★ different `point` per bookmaker lands in the DB |
| 4 | Quota Governor | out-of-season sports are never polled |
| 5 | **Model engine** | ★ the `REQ-8` fair-price test passes |
| 6 | Weather + lineups (manual fallback **first**) | killing every scraper still leaves a working app |
| 7 | REST + WebSocket | `spreads` returns a different `point` and `fair_price` per book |
| 8 | Frontend — port `sharpline.html` | Line tab shows differing lines; iOS Safari clean |
| 9 | Admin panel | editing `sigma_margin` visibly changes fair prices |
| 10 | Tests | three suites green; **zero** API credits consumed |
| 11 | Deploy + README | live URL; quota reality documented honestly |

---

## 15. Ambiguities — resolve with the human, never guess

These are the places where an autonomous agent would plausibly invent something. Do not.

1. **TABtouch and Pickle Bet may not exist in the feed.** `RECON.md` §3 gives the truth. If absent: render them greyed with *"Not covered by the current odds feed"*, keep the admin able to add them later, and **tell the client**. Never silently drop them; never fabricate a price.

2. **The free tier cannot do 5-second refresh.** The brief asked for it. The WebSocket push to the browser *is* instant — but the upstream poll is bounded by the plan. Document the distinction precisely rather than quietly failing the requirement.

3. **There is no historical data to train on.** The client never supplied any. Layer 1 (de-vig consensus + weather/lineup adjustments) is legitimate, widely used, and works from day one. XGBoost activates once `odds_history` accumulates settled results. **Say this in the README** rather than implying a trained model already exists.

4. **Sigma values are estimates, not facts.** Seeded, admin-tunable, flagged provisional. Recalibrate empirically once results accrue.

5. **Real club logos are trademarked.** Ship the generated jerseys from `sharpline.html`. `teams.logo_url` accepts licensed files the moment the client supplies them — no code change.

6. **Player `importance` (0..1) has no free data source.** Default everyone to 0.5; let the client raise it for stars in the admin panel. Do not pretend it is derived from data.

7. **Model Performance (ROI / win rate) cannot exist before results do.** Show *"Awaiting results"* until enough events have settled. **Never fabricate a track record** — the client will bet real money on this.

---

## 16. Failure modes — what will go wrong, and the fix

| Symptom | Cause | Fix |
|---|---|---|
| Events exist but link to no team | `teams.name` doesn't byte-match the feed | Re-seed from `recon/teams_seed.py`. Never hand-type team names. |
| **Every bookmaker shows the same line** | The normaliser dropped or averaged `point` | **Stop everything.** This breaks `REQ-8`. Fix Phase 3 first. |
| `401` mid-month | Credits exhausted | The Governor should have prevented it. Lower the mode; raise the reserve floor. |
| `spreads`/`totals` empty for NRL or AFL | The feed may not carry them for that sport | Check `RECON.md` §4. Degrade gracefully. **Never invent a line.** |
| Weather looks wrong for an arena | An indoor venue was polled | Set `is_indoor=true`; skip the call entirely. |
| NRL scraper returns nothing | The site changed its HTML | Expected. Log, fall back to manual entry, carry on. |
| Fair price looks inverted | Spread sign convention | Home favourite ⇒ negative `point`. Re-run the §5.3 test. |

---

## 17. Acceptance Criteria

- [ ] All 7 sports appear; out-of-season handled gracefully. `REQ-1`
- [ ] All 7 bookmakers appear; any absent from the feed are greyed with an explanation, never silently dropped. `REQ-2`
- [ ] **H2H, Line, and Totals tabs each carry an AI Fair Price row.** `REQ-3` `REQ-5`
- [ ] ★ **Each bookmaker shows its own line** (TAB `-4.5`, Betfair `-5.5`) with its own fair price and its own edge, computed at that line. `REQ-8`
- [ ] Win probability, projected line, expected total shown per game. `REQ-4` `REQ-6`
- [ ] Edge % against every bookmaker, in every market. `REQ-7`
- [ ] Temperature, wind, rain beside each matchup; indoor venues stated as such. `REQ-9`
- [ ] Lineups beside each matchup with a confirmed/provisional badge; manual entry works. `REQ-10`
- [ ] Every team has a logo — crest, or `logo_url` when supplied. `REQ-11`
- [ ] Rationale explains **why**, citing weather and lineups. `REQ-14`
- [ ] Any input change (odds / weather / lineup / parameter) recomputes and pushes to the browser. `REQ-12`
- [ ] Admin panel adds bookmakers and tunes model parameters, live. `Deliverable 4`
- [ ] Tests cover ingestion, model outputs, UI critical paths; CI green. `Deliverable 5`
- [ ] Verified on iOS Safari and Windows Chrome/Edge. `REQ-1`
- [ ] Live demo URL works. `Deliverable 2`
- [ ] README documents sources, methodology, setup, and the quota reality. `Deliverable 3`

---


*End of document.*
