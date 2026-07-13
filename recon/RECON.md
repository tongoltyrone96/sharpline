# Sharpline - Phase 0 Recon Findings

_Generated 2026-07-13T10:02:26.368245+00:00_

**This file is ground truth. The build plan must obey it, not the other way round.**

## 1. The key and its plan

- `x-requests-remaining`: **19937**
- `x-requests-used`: 63
- Cost of this recon run: 3 (last call)
- **Assessed plan: PAID (~19937 credits remaining)**

### Verdict

```
Live polling is viable. 19937 credits remaining.
  -> Quota Governor can run in `rich` mode: poll every 30s near kickoff.
  -> Still never poll out-of-season sports, and never add a 2nd region.
```

## 2. Sports

| Requested | Feed key | Found | In season |
|---|---|---|---|
| NRL | `rugbyleague_nrl` | yes | yes |
| AFL | `aussierules_afl` | yes | yes |
| NBL | `basketball_nbl` | **NO** | no |
| NBA | `basketball_nba_summer_league` | yes | yes |
| MLB | `baseball_mlb` | yes | yes |
| NFL | `americanfootball_nfl` | yes | yes |
| NHL | `icehockey_nhl` | **NO** | no |

## 3. Bookmakers  `REQ-2`

| Requested by client | In the `au` feed? | Feed key | Feed title |
|---|---|---|---|
| TAB | **yes** | `tab` | TAB |
| Betfair | **yes** | `betfair_ex_au` | Betfair |
| Sportsbet | **yes** | `sportsbet` | SportsBet |
| Ladbrokes | **yes** | `ladbrokes_au` | Ladbrokes |
| TABtouch | **yes** | `tabtouch` | TABtouch |
| PointsBet | **yes** | `pointsbetau` | PointsBet (AU) |
| Pickle Bet | **NO -- tell the client** | `--` | -- |

Also available but not requested: Bet Right, Betr, Dabble AU, Neds, PlayUp, Unibet


## 4. Markets actually available  `REQ-3`

| Sport | Markets returned | Missing |
|---|---|---|
| NRL | h2h, h2h_lay, spreads, totals | none |
| AFL | h2h, h2h_lay, spreads, totals | none |
| MLB | h2h, spreads, totals | none |
| NFL | h2h, spreads, totals | none |

## 5. `REQ-8` - do bookmakers really disagree on the line?

**Yes. Confirmed on a live event.**

`Penrith Panthers v Brisbane Broncos` (NRL)

| Bookmaker | Home line |
|---|---|
| SportsBet | `-14.5` |
| TAB | `-14.5` |
| PointsBet (AU) | `-13.5` |
| PlayUp | `-14.5` |
| Betr | `-14.5` |
| TABtouch | `-14.5` |
| Unibet | `-14.5` |
| Bet Right | `-14.5` |
| Dabble AU | `-13.5` |

This is the client's most-repeated requirement, and the feed supports it.
The `point` field **must** be stored per bookmaker and never averaged.

## 6. Team names

- **68** real team names written to `recon/teams_seed.py`.
- These strings are what the feed returns. The database `teams.name` column
  **must** match them exactly, or events will not link to teams.
- Colours / abbreviations / venue coordinates in that file are placeholders.
  A human reviews them once; after that they are stable.

## 7. What to do next

1. Read the verdict in Section 1 and set the Quota Governor mode accordingly.
2. Tell the client about any bookmaker marked **NO** in Section 3.
3. Tell the client about any missing market in Section 4.
4. Copy `recon/odds_*.json` into `backend/tests/fixtures/` -- these become
   the offline test fixtures, so the test suite never burns a credit.
5. Copy `recon/teams_seed.py` into `backend/app/data/`, fill in colours and
   venue coordinates, then proceed to Phase 1 of BUILD.md.

