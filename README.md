# Sharpline

Real-time sports betting analytics dashboard. Fetches live odds from 10+ Australian bookmakers, de-vigs them to a consensus fair price, flags positive-edge opportunities, and overlays model projections, weather, and lineup data.

Live sports: **NRL, AFL, MLB** (in season). NBA returns October 2026.

---

## 1. Data sources

| Provider | What it supplies | Limit / cost |
|---|---|---|
| [The Odds API](https://the-odds-api.com) | Live odds — h2h, spreads, totals — from Sportsbet, Betfair, TAB, Neds, PointsBet AU, and others | Free tier: 500 requests/month. Paid starter: ~500 credits/$0; scales to ~$79/month for 100 k credits. This app uses ~4 requests per 30-second poll cycle. |
| [OpenWeatherMap](https://openweathermap.org/api) | Current conditions (temp, wind, rain probability) at venue lat/lng | Free tier: 60 calls/minute, 1 M/month. Current plan. |
| [Squiggle API](https://api.squiggle.com.au) | AFL team data and lineup hints | No key required. Free. |
| ESPN API (unofficial) | NRL lineup data | Unofficial scrape endpoint. No key required. Free but fragile. |
| NRL.com (unofficial) | NRL official lineup confirmation | Unofficial scrape. Free but fragile. |

No paid lineup feed is used. Lineup data is best-effort; it may be stale or absent for some matches.

---

## 2. Model methodology

### What runs today

**De-vig consensus model** (`backend/app/services/devig.py`, `model.py`)

1. Collect raw decimal odds from every configured bookmaker for each market (h2h, spreads, totals).
2. Remove bookmaker margin using the **Shin method** — produces implied win probabilities per outcome.
3. **Consensus probability** = average across all books after de-vig.
4. Apply **weather adjustment** (outdoor sports only) — wind speed and rain probability shift the projected margin and total via coefficients in `model_params`.
5. Apply **lineup adjustment** — confirmed absences (by position) apply an injury-severity penalty to the relevant side's win probability.
6. Convert adjusted probability back to a fair decimal price.
7. **Edge** = `(fair_price / bookmaker_price − 1) × 100 %`. Positive edge = the bookmaker is paying more than the fair price.

### What does not run yet

**XGBoost trained model**: The `ModelPerformance` panel shows *"Awaiting results — trained model activates once sufficient settled events accumulate."* The training pipeline exists (`services/recompute.py`, `tasks/recompute.py`) but requires historical `odds_history` rows with known outcomes. No events have settled yet. The trained model will activate automatically once enough settled rows exist.

**Sigma values** (projection confidence intervals shown in the UI) are provisional defaults seeded via `scripts/seed.py`. They are admin-tunable at `/admin` → Model Parameters without a redeploy.

> This tool identifies when a bookmaker's price exceeds the de-vigged consensus fair price. It does not predict match outcomes from first principles.

---

## 3. Environment setup

### Prerequisites

- Python 3.11+
- Node 20+
- PostgreSQL 15+ (local) or Supabase (production)
- Redis 7+ (local) or Upstash (production)

### Local development

```bash
# 1. Copy env template and fill in your keys
cp .env.example .env

# 2. Start all services (requires Docker)
docker-compose up

# OR start backend only and use Supabase/Upstash directly
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# In a second terminal — Celery worker (Linux/Mac)
celery -A app.tasks.celery_app worker --loglevel=info

# In a third terminal — Celery beat
celery -A app.tasks.celery_app beat --loglevel=info

# Windows: Celery requires --pool=solo
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo

# 3. Initialise the database (first time only)
cd backend
alembic upgrade head
python scripts/seed.py
python scripts/live_poll_once.py   # populates initial odds so the dashboard is not empty

# 4. Start the frontend
cd frontend
npm install
npm run dev

# Frontend: http://localhost:5173
# Backend docs: http://localhost:8000/api/docs
```

### Deploy — Backend (Fly.io)

Fly.io runs three process groups from the same Docker image: `web` (FastAPI), `worker` (Celery), and `beat` (Celery Beat). All three stay up permanently — no auto-stop.

```bash
# Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
cd backend

# Create the app (once)
fly launch --no-deploy --name sharpline-api --region syd

# Set all secrets — never commit these values
fly secrets set \
  ODDS_API_KEY="<your-key>" \
  OPENWEATHER_API_KEY="<your-key>" \
  DATABASE_URL="postgresql://...@pooler.supabase.com:6543/postgres?sslmode=require" \
  REDIS_URL="rediss://default:<password>@<host>.upstash.io:6379" \
  ADMIN_PASSWORD="<choose-a-strong-password>" \
  CORS_ORIGINS="https://<your-app>.vercel.app"

# Deploy (alembic upgrade head + seed.py run automatically via release_command)
fly deploy

# Start exactly one worker and one beat machine
fly scale count worker=1 beat=1

# Trigger an initial odds poll so the dashboard shows data on first load
fly ssh console -C "python scripts/live_poll_once.py"
```

The Fly.io app URL will be `https://sharpline-api.fly.dev` (or your chosen app name + `.fly.dev`).

**Confirm WebSocket works over wss://**

```bash
# From any browser console on the live Vercel URL:
# Open DevTools → Network → WS — you should see a connection to wss://sharpline-api.fly.dev/ws
# Status should show "101 Switching Protocols"
```

### Deploy — Frontend (Vercel)

Vercel rewrites `/api/*` and `/admin/*` to the Fly.io backend server-side, so no CORS issue for HTTP calls. WebSocket connects directly to Fly.io over `wss://`.

```bash
# Option A: Vercel CLI
cd frontend
npm i -g vercel
vercel --prod

# Option B: Connect GitHub repo in Vercel dashboard
# Root Directory:    frontend
# Build Command:     npm run build      (auto-detected)
# Output Directory:  dist               (auto-detected)
# Framework Preset:  Vite               (auto-detected)
```

**Required environment variable in Vercel dashboard:**

| Variable | Value |
|---|---|
| `VITE_WS_URL` | `wss://sharpline-api.fly.dev/ws` |

If you used a different Fly.io app name, update both `VITE_WS_URL` and the `destination` URLs in `frontend/vercel.json` to match.

**After deploy, verify:**
1. Open the live Vercel URL — fixture cards load with real odds data.
2. DevTools → Network → WS — connection to `wss://sharpline-api.fly.dev/ws` shows status 101.
3. Tap a fixture card — detail panel populates without errors.

---

## 4. Quota reality

The Odds API **paid starter plan** provides approximately 20,000 requests.

| Polling mode | Requests per poll | Polls per day | Credits per day |
|---|---|---|---|
| `rich` (h2h + spreads + totals) | ~4 | 2,880 | ~11,520 |
| `lean` (h2h only) | ~2 | 2,880 | ~5,760 |

At `rich` mode, 20k credits last roughly **1.7 days**. At `lean` mode, roughly **3.5 days**.

Set `ODDS_POLL_MODE=lean` in production to halve consumption. The admin panel and `/health` endpoint show remaining quota.

For a sustained deployment, upgrade to a higher-credit plan (~$19/month for 10k credits/day) or reduce polling frequency in `backend/app/tasks/beat_schedule.py`.

---

## 5. Swapping in a paid feed

Replace `backend/app/adapters/odds_theoddsapi.py` with your new adapter. Implement the same interface defined in `backend/app/adapters/base.py`:

```python
class OddsAdapter:
    def fetch_events(self, sport_key: str) -> list[dict]: ...
```

The returned dicts must match the schema that `backend/app/tasks/poll_odds.py` expects (same field names as The Odds API response). Wire your new class in `poll_odds.py` where `OddsTheOddsAPI` is instantiated. No other files change.

---

## 6. Adding real team logos

1. Upload team logo PNGs to a CDN or object storage.
2. Set `teams.logo_url` in the database — via the admin panel at `/admin` → Teams, or directly:
   ```sql
   UPDATE teams SET logo_url = 'https://cdn.example.com/logos/gws.png' WHERE abbr = 'GWS';
   ```
3. The `TeamJersey` SVG component (`frontend/src/components/TeamJersey.tsx`) is the automatic fallback when `logo_url` is `null`. Jersey colour and pattern come from `teams.primary_color` / `teams.secondary_color`, editable in the admin panel.

---

## Known limitations

| Item | Status |
|---|---|
| **NHL** | Removed — not present in The Odds API Australian feed. Retained in DB with `is_available = false`; will return automatically if a feed appears. |
| **NBL** | Same as NHL. |
| **Pickle Bet** | Removed — no supported feed. |
| **NBA** | Off-season. Returns October 2026; model will activate then. |
| **Model Performance panel** | Shows *"Awaiting results"* until enough events have settled and been recorded in `odds_history`. No synthetic or back-filled results are used. |
| **Sigma / confidence intervals** | Provisional defaults seeded at deploy time. Admin-tunable without redeployment. |
| **Lineup data** | Best-effort unofficial scrape from ESPN and NRL.com. May be incomplete or delayed. |
| **Weather** | OpenWeatherMap free tier; venue conditions updated every 30 minutes. |
| **XGBoost model** | Infrastructure present but not yet trained. De-vig consensus is the active model. |
