#!/usr/bin/env python3
"""
Sharpline - Phase 0: RECONNAISSANCE

Run this BEFORE writing any application code.

Purpose
-------
Every important unknown in this project is answered by the live API, not by guesswork:

  * Which plan is the key on?  (decides whether "live odds" is even possible)
  * Which of the 7 sports actually exist and are in season?
  * Which of the 7 requested bookmakers are really in the `au` feed?
  * Do NRL / AFL actually return `spreads` and `totals`, or only `h2h`?
  * What are the EXACT team-name strings?  (our DB must match them byte for byte)

Guessing any of these produces a broken build. So we look.

Usage
-----
    export ODDS_API_KEY="..."          # the key the client supplied
    python scripts/recon.py            # full live run (costs credits)
    python scripts/recon.py --analyse-only   # re-analyse saved JSONs, no credits

Outputs (all under ./recon/)
----------------------------
    recon/RECON.md             human-readable findings  <- read this, then plan
    recon/quota.json           plan + remaining credits
    recon/sports.json          raw /sports response
    recon/odds_<sport>.json    raw odds payload per sport  <- becomes test fixtures
    recon/teams_seed.py        REAL team names, ready to seed  <- never invented
    recon/bookmakers.json      which books exist, which are missing

Credit cost
-----------
    /sports                          FREE
    /sports/{k}/odds  (3 markets)    3 credits per sport in season

Worst case, 7 sports in season = 21 credits. That is the price of certainty.
Run it ONCE. The saved JSON is then reused forever as offline test fixtures.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

API = "https://api.the-odds-api.com/v4"
KEY = os.environ.get("ODDS_API_KEY", "").strip()
REGION = "au"               # NEVER add a second region: it doubles every cost
MARKETS = "h2h,spreads,totals"   # one call, all three markets

# What the client asked for. We are about to find out what actually exists.
WANTED_SPORTS = {
    "NRL": "rugbyleague_nrl",
    "AFL": "aussierules_afl",
    "NBL": "basketball_nbl",
    "NBA": "basketball_nba",
    "MLB": "baseball_mlb",
    "NFL": "americanfootball_nfl",
    "NHL": "icehockey_nhl",
}
WANTED_BOOKS = [
    "TAB", "Betfair", "Sportsbet", "Ladbrokes",
    "TABtouch", "PointsBet", "Pickle Bet",
]

# Sport keys that signal an outrights/futures market rather than a game feed.
# A fallback match to one of these would be dangerously wrong.
OUTRIGHTS_TERMS = ("winner", "championship")

OUT = Path("recon")
OUT.mkdir(exist_ok=True)

quota: dict = {"remaining": None, "used": None, "last_cost": None}


# ---------------------------------------------------------------------------
# Fix 1: all file writes use UTF-8 with a safe fallback for unencodable chars.
# ---------------------------------------------------------------------------
def _write(path: Path, text: str) -> None:
    """Write text to path as UTF-8, replacing any unencodable characters."""
    path.write_text(text, encoding="utf-8", errors="replace")


def _read_quota(resp) -> None:
    h = resp.headers
    for src, dst in (
        ("x-requests-remaining", "remaining"),
        ("x-requests-used", "used"),
        ("x-requests-last", "last_cost"),
    ):
        if src in h:
            try:
                quota[dst] = int(float(h[src]))
            except ValueError:
                pass


def get(path: str, **params):
    """GET with the key attached; records quota headers; returns (data, status)."""
    params["apiKey"] = KEY
    r = requests.get(f"{API}{path}", params=params, timeout=30)
    _read_quota(r)
    if r.status_code == 200:
        return r.json(), 200
    return None, r.status_code


def abbrev(name: str) -> str:
    """Best-effort 2-3 letter abbreviation. A human should review these once."""
    words = [w for w in re.split(r"\s+", name) if w]
    if len(words) == 1:
        return words[0][:3].upper()
    return words[0][:3].upper()


def norm(s: str) -> str:
    """Reduce to lowercase letters only, for fuzzy comparison."""
    return re.sub(r"[^a-z]", "", s.lower())


# ---------------------------------------------------------------------------
# Fix 3: exclude outrights/futures keys from the sport fallback search.
# ---------------------------------------------------------------------------
def _is_outrights_key(key: str, entry: dict) -> bool:
    """
    Return True if this sport entry should be excluded from the fuzzy fallback.

    Excluded when:
      - the key contains 'winner' or 'championship' (e.g. basketball_nba_championship_winner)
      - OR the entry has has_outrights=True (futures market, not a game feed)
    """
    if any(term in key for term in OUTRIGHTS_TERMS):
        return True
    if entry.get("has_outrights"):
        return True
    return False


def resolve_sports(by_key: dict) -> dict[str, dict]:
    """
    Match each wanted sport to the feed.
    Exact key match first; safe fuzzy fallback second (outrights excluded).
    """
    resolved: dict[str, dict] = {}
    for label, wanted_key in WANTED_SPORTS.items():
        entry = by_key.get(wanted_key)
        if entry is None:
            # Exact key not found. Try a fuzzy match, but never pick an outrights key.
            candidates = [
                v for k, v in by_key.items()
                if (label.lower() in v.get("title", "").lower() or label.lower() in k)
                and not _is_outrights_key(k, v)
            ]
            if candidates:
                entry = candidates[0]
                print(f"  ! {label}: '{wanted_key}' not found -- using '{entry['key']}' instead")
            else:
                print(
                    f"  x {label}: NOT FOUND in the feed "
                    f"(or only outrights/futures available). Flag to the client."
                )
                resolved[label] = {"key": wanted_key, "found": False, "active": False}
                continue

        resolved[label] = {
            "key": entry["key"],
            "title": entry.get("title"),
            "found": True,
            "active": bool(entry.get("active")),
            "has_outrights": bool(entry.get("has_outrights")),
        }
        state = "IN SEASON" if entry.get("active") else "out of season"
        print(f"  ok {label:4} -> {entry['key']:40} {state}")

    return resolved


# ---------------------------------------------------------------------------
# Fix 2: bookmaker matching uses substring containment, not exact equality.
# ---------------------------------------------------------------------------
def book_match(want: str, seen_norm_map: dict[str, tuple]) -> tuple | None:
    """
    Find a bookmaker in the feed that matches the requested name.

    Strategy:
      1. Exact normalised match  (e.g. 'TAB' -> 'tab' == 'tab')
      2. Requested name is a substring of the feed title after normalisation
         (e.g. 'PointsBet' -> 'pointsbet' in 'pointsbetau' from 'PointsBet (AU)')

    This handles parentheticals and suffixes in feed titles without false positives.
    """
    want_n = norm(want)

    # Exact match.
    if want_n in seen_norm_map:
        return seen_norm_map[want_n]

    # Substring match: the requested name appears inside the feed's normalised title.
    for feed_n, (feed_key, feed_title) in seen_norm_map.items():
        if want_n in feed_n:
            return (feed_key, feed_title)

    return None


def analyse(payloads: dict[str, list], resolved: dict[str, dict]) -> None:
    """Run the full analysis on loaded payloads and write all output files."""
    print("\n[3/4] Analysing payloads")

    books_seen: dict[str, str] = {}        # feed key -> feed title
    markets_by_sport: dict[str, set] = {}
    teams_by_sport: dict[str, set] = {}
    spread_lines_example = None

    for label, events in payloads.items():
        markets_by_sport.setdefault(label, set())
        teams_by_sport.setdefault(label, set())
        for ev in events:
            teams_by_sport[label].add(ev["home_team"])
            teams_by_sport[label].add(ev["away_team"])
            for bm in ev.get("bookmakers", []):
                books_seen[bm["key"]] = bm.get("title", bm["key"])
                for mk in bm.get("markets", []):
                    markets_by_sport[label].add(mk["key"])

            # Capture a real REQ-8 example: bookmakers disagree on the spread line.
            if spread_lines_example is None:
                pts = {}
                for bm in ev.get("bookmakers", []):
                    for mk in bm.get("markets", []):
                        if mk["key"] == "spreads":
                            for o in mk["outcomes"]:
                                if o["name"] == ev["home_team"]:
                                    pts[bm.get("title", bm["key"])] = o.get("point")
                if len({v for v in pts.values() if v is not None}) > 1:
                    spread_lines_example = {
                        "event": f'{ev["home_team"]} v {ev["away_team"]}',
                        "sport": label,
                        "home_lines": pts,
                    }

    # Build a map from normalised-title to (feed_key, feed_title).
    seen_norm_map: dict[str, tuple] = {
        norm(title): (key, title) for key, title in books_seen.items()
    }

    book_report = []
    for want in WANTED_BOOKS:
        hit = book_match(want, seen_norm_map)
        book_report.append({
            "requested": want,
            "available": bool(hit),
            "feed_key": hit[0] if hit else None,
            "feed_title": hit[1] if hit else None,
        })

    # Books in the feed that were not matched to any requested bookmaker.
    matched_keys = {r["feed_key"] for r in book_report if r["feed_key"]}
    extra = sorted(t for k, t in books_seen.items() if k not in matched_keys)

    _write(
        OUT / "bookmakers.json",
        json.dumps({"requested": book_report, "also_in_feed": extra}, indent=2),
    )

    print("\n  Bookmakers requested by the client:")
    for b in book_report:
        mark = "ok" if b["available"] else "NOT IN FEED"
        feed_info = f"{b['feed_key']} ({b['feed_title']})" if b["feed_key"] else ""
        print(f"    {mark:14} {b['requested']:12} {feed_info}")
    if extra:
        print(f"  Also present (not requested): {', '.join(extra)}")

    print("\n  Markets actually returned per sport:")
    for label in payloads:
        got = markets_by_sport[label]
        missing = {"h2h", "spreads", "totals"} - got
        note = "" if not missing else f"   <- MISSING: {', '.join(sorted(missing))}"
        print(f"    {label:4} {', '.join(sorted(got)) or '(none)'}{note}")

    if spread_lines_example:
        print("\n  REQ-8 CONFIRMED - bookmakers really do disagree on the line:")
        print(f"    {spread_lines_example['event']} ({spread_lines_example['sport']})")
        for bk, pt in spread_lines_example["home_lines"].items():
            print(f"      {bk:16} {pt}")
    else:
        print("\n  ! No differing spread lines observed in this sample.")
        print("    Either spreads are absent, or all books currently agree.")
        print("    Re-check nearer a matchday before concluding anything.")

    # -----------------------------------------------------------------------
    # Write the REAL team seed. Never invent team names.
    # -----------------------------------------------------------------------
    print("\n[4/4] Writing recon/teams_seed.py from REAL feed names")
    seed_lines = [
        '"""',
        "AUTO-GENERATED by scripts/recon.py -- do not hand-edit team `name` values.",
        "",
        "`name` MUST match the exact string The Odds API returns, or events will",
        "fail to match teams. Colours, abbreviations, venues and indoor flags are",
        "placeholders: a human should review them once, then they are stable.",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        '"""',
        "",
        "TEAMS = {",
    ]
    for label in sorted(teams_by_sport):
        names = sorted(teams_by_sport[label])
        if not names:
            continue
        seed_lines.append(f'    "{label}": [')
        for n in names:
            seed_lines.append(
                f"        dict(name={n!r}, abbr={abbrev(n)!r}, "
                f'primary="#333333", secondary="#888888", '
                f"venue=None, lat=None, lon=None, indoor=False),"
            )
        seed_lines.append("    ],")
    seed_lines.append("}")
    _write(OUT / "teams_seed.py", "\n".join(seed_lines) + "\n")
    total_teams = sum(len(v) for v in teams_by_sport.values())
    print(f"  ok {total_teams} real team names captured")

    # -----------------------------------------------------------------------
    # Write RECON.md - the ground truth document for the whole build.
    # -----------------------------------------------------------------------
    rem = quota["remaining"]
    if rem is None:
        plan = "unknown"
        verdict = "Could not read the quota header. Investigate before proceeding."
    elif rem <= 600:
        plan = "FREE / Starter (~500 credits per month)"
        verdict = (
            "LIVE REFRESH IS NOT POSSIBLE on this key.\n"
            "  A full sweep of every in-season sport costs 3 credits per sport.\n"
            "  With ~500 credits a month, that is roughly 20-25 full refreshes A MONTH.\n"
            "  -> Build exactly as designed, but set the Quota Governor to `lean`.\n"
            "  -> Poll ONLY games kicking off soon. Cache everything.\n"
            "  -> Say so plainly in the README. Do NOT promise 5-second odds.\n"
            "  -> Upgrading the key alone fixes this. No code changes required."
        )
    else:
        plan = f"PAID (~{rem} credits remaining)"
        verdict = (
            f"Live polling is viable. {rem} credits remaining.\n"
            "  -> Quota Governor can run in `rich` mode: poll every 30s near kickoff.\n"
            "  -> Still never poll out-of-season sports, and never add a 2nd region."
        )

    md = [
        "# Sharpline - Phase 0 Recon Findings",
        "",
        f"_Generated {datetime.now(timezone.utc).isoformat()}_",
        "",
        "**This file is ground truth. The build plan must obey it, not the other way round.**",
        "",
        "## 1. The key and its plan",
        "",
        f"- `x-requests-remaining`: **{quota['remaining']}**",
        f"- `x-requests-used`: {quota['used']}",
        f"- Cost of this recon run: {quota['last_cost']} (last call)",
        f"- **Assessed plan: {plan}**",
        "",
        "### Verdict",
        "",
        "```",
        verdict,
        "```",
        "",
        "## 2. Sports",
        "",
        "| Requested | Feed key | Found | In season |",
        "|---|---|---|---|",
    ]
    for label, r in resolved.items():
        found_str = "yes" if r["found"] else "**NO**"
        active_str = "yes" if r.get("active") else "no"
        md.append(f"| {label} | `{r['key']}` | {found_str} | {active_str} |")

    md += [
        "",
        "## 3. Bookmakers  `REQ-2`",
        "",
        "| Requested by client | In the `au` feed? | Feed key | Feed title |",
        "|---|---|---|---|",
    ]
    for b in book_report:
        status = "**yes**" if b["available"] else "**NO -- tell the client**"
        md.append(
            f"| {b['requested']} | {status} "
            f"| `{b['feed_key'] or '--'}` | {b['feed_title'] or '--'} |"
        )
    if extra:
        md += ["", f"Also available but not requested: {', '.join(extra)}", ""]

    md += [
        "",
        "## 4. Markets actually available  `REQ-3`",
        "",
        "| Sport | Markets returned | Missing |",
        "|---|---|---|",
    ]
    for label in payloads:
        got = sorted(markets_by_sport[label])
        missing = sorted({"h2h", "spreads", "totals"} - set(got))
        md.append(
            f"| {label} | {', '.join(got) or '--'} | "
            f"{', '.join(missing) if missing else 'none'} |"
        )

    md += ["", "## 5. `REQ-8` - do bookmakers really disagree on the line?", ""]
    if spread_lines_example:
        md += [
            "**Yes. Confirmed on a live event.**",
            "",
            f"`{spread_lines_example['event']}` ({spread_lines_example['sport']})",
            "",
            "| Bookmaker | Home line |",
            "|---|---|",
        ]
        for bk, pt in spread_lines_example["home_lines"].items():
            md.append(f"| {bk} | `{pt}` |")
        md += [
            "",
            "This is the client's most-repeated requirement, and the feed supports it.",
            "The `point` field **must** be stored per bookmaker and never averaged.",
        ]
    else:
        md += [
            "**Not observed in this sample.** Either `spreads` are absent for the",
            "sports currently in season, or every book happens to agree right now.",
            "Re-run this script close to a matchday before drawing any conclusion.",
            "Do NOT remove per-book `point` storage on the strength of one quiet sample.",
        ]

    md += [
        "",
        "## 6. Team names",
        "",
        f"- **{total_teams}** real team names written to `recon/teams_seed.py`.",
        "- These strings are what the feed returns. The database `teams.name` column",
        "  **must** match them exactly, or events will not link to teams.",
        "- Colours / abbreviations / venue coordinates in that file are placeholders.",
        "  A human reviews them once; after that they are stable.",
        "",
        "## 7. What to do next",
        "",
        "1. Read the verdict in Section 1 and set the Quota Governor mode accordingly.",
        "2. Tell the client about any bookmaker marked **NO** in Section 3.",
        "3. Tell the client about any missing market in Section 4.",
        "4. Copy `recon/odds_*.json` into `backend/tests/fixtures/` -- these become",
        "   the offline test fixtures, so the test suite never burns a credit.",
        "5. Copy `recon/teams_seed.py` into `backend/app/data/`, fill in colours and",
        "   venue coordinates, then proceed to Phase 1 of BUILD.md.",
        "",
    ]
    _write(OUT / "RECON.md", "\n".join(md) + "\n")

    print("\n" + "=" * 66)
    print("  DONE. Read recon/RECON.md before writing any code.")
    print("=" * 66)
    print(f"\n  Credits remaining : {quota['remaining']}")
    print(f"  Fixtures saved    : recon/odds_*.json  ({len(payloads)} sport(s))")
    print(f"  Real team seed    : recon/teams_seed.py  ({total_teams} teams)")
    print()


def main() -> None:
    analyse_only = "--analyse-only" in sys.argv

    if not analyse_only and not KEY:
        sys.exit("ERROR: ODDS_API_KEY is not set.\n  export ODDS_API_KEY='...'")

    print("\n" + "=" * 66)
    if analyse_only:
        print("  SHARPLINE - PHASE 0 RECONNAISSANCE (offline re-analysis)")
    else:
        print("  SHARPLINE - PHASE 0 RECONNAISSANCE")
    print("=" * 66)

    if analyse_only:
        # Load everything from disk; no API calls, no credits spent.
        sports_path = OUT / "sports.json"
        if not sports_path.exists():
            sys.exit(
                "ERROR: recon/sports.json not found.\n"
                "Run without --analyse-only first to fetch from the API."
            )
        sports = json.loads(sports_path.read_text(encoding="utf-8"))

        saved_quota = OUT / "quota.json"
        if saved_quota.exists():
            quota.update(json.loads(saved_quota.read_text(encoding="utf-8")))

        print(f"\n[1/4] Loaded {len(sports)} sports from recon/sports.json (no API call)")
        print(f"  -> plan check: x-requests-remaining = {quota['remaining']}")

        by_key = {s["key"]: s for s in sports}
        resolved = resolve_sports(by_key)

        print("\n[2/4] Loading saved odds fixtures (no API call)")
        payloads: dict[str, list] = {}
        for label, r in resolved.items():
            if not r.get("active"):
                continue
            path = OUT / f"odds_{label.lower()}.json"
            if path.exists():
                payloads[label] = json.loads(path.read_text(encoding="utf-8"))
                print(f"  ok {label:4} {len(payloads[label]):3} events loaded from {path.name}")
            else:
                print(f"  ! {label}: no saved fixture at {path.name} -- skipping")

    else:
        # Live fetch path.
        print("\n[1/4] GET /sports  (free)")
        sports, status = get("/sports/")
        if status == 401:
            sys.exit("  x 401 -- the key is invalid or its quota is exhausted. Stop here.")
        if status != 200:
            sys.exit(f"  x HTTP {status}. Stop here.")

        _write(OUT / "sports.json", json.dumps(sports, indent=2))
        by_key = {s["key"]: s for s in sports}
        print(f"  ok {len(sports)} sports returned by the API")
        print(f"  -> plan check: x-requests-remaining = {quota['remaining']}")

        resolved = resolve_sports(by_key)

        in_season = [(lbl, r) for lbl, r in resolved.items() if r.get("active")]
        cost = len(in_season) * 3
        print(f"\n[2/4] GET odds for {len(in_season)} in-season sport(s)  (~{cost} credits)")

        if not in_season:
            print("  ! Nothing is in season right now. No odds to inspect.")
            print("    The build can still proceed; re-run when a season starts.")

        payloads = {}
        for label, r in in_season:
            data, status = get(
                f"/sports/{r['key']}/odds/",
                regions=REGION,
                markets=MARKETS,
                oddsFormat="decimal",
            )
            if status != 200:
                print(f"  x {label}: HTTP {status}")
                continue
            payloads[label] = data
            _write(OUT / f"odds_{label.lower()}.json", json.dumps(data, indent=2))
            print(f"  ok {label:4} {len(data):3} events  (cost so far: used={quota['used']})")

        _write(OUT / "quota.json", json.dumps(quota, indent=2))

    analyse(payloads, resolved)


if __name__ == "__main__":
    main()
