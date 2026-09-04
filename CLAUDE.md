# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web app (`index.html`, ~475KB, all HTML/CSS/JS inline) for staffing and commercial-pipeline management at Eagleprojects (rilievi/surveying department). Hosted on GitHub Pages, backed by Supabase (Postgres + Auth + Realtime + Edge Functions). No bundler, no package.json — `index.html` is still the deployed artifact, but it is now a **generated file**, not the source of truth (see "Source layout" below).

Live app: https://mmarchetti95.github.io/Gestione-Staffing/

## Source layout (since the `refactor/split-files` split)

`index.html` used to be hand-edited directly. It is now assembled by `scripts/build.py` from:
- `src/head.html` — everything from `<!DOCTYPE html>` up to and including the `<script>` opening tag (head, CSS, body markup, CDN `<script src>` tags).
- `src/js/*.js` — the app's JS, cut at the pre-existing `/* ===== ... ===== */` section banners, one file per section/group of sections. **Order matters**: `scripts/build.py` concatenates them in the exact order listed in its `JS_FILES` array, which reproduces the original top-to-bottom order of the single `<script>` block — this preserves the relative registration order of the two `DOMContentLoaded` listeners (dashboard init, then weekly-planning init).
- `src/tail.html` — `</script>` through `</html>`.

**Edit `src/js/*.js`, never `index.html` directly.** After editing, regenerate with:

```bash
python3 scripts/build.py
```

`scripts/smoke_test.py` now checks (as its first, blocking check) that `index.html` is byte-identical to what `scripts/build.py` would produce from current `src/` — if you edit `src/` and forget to rebuild, or hand-edit `index.html` and let it drift from `src/`, the smoke test fails with an explicit message telling you to rebuild.

## Commands

There is no test/lint toolchain beyond the smoke test (no npm scripts, no CI). Before every commit that touches `index.html` or `src/`:

```bash
python3 scripts/build.py                    # regenerate index.html from src/
python3 scripts/smoke_test.py index.html [--expect-version X.Y.Z] [--prev-version X.Y.Z]
```

The smoke test requires `node` on PATH (JS syntax check via `node --check`) and optionally `eslint@8` (`npm i eslint@8`) for a `no-undef` pass. It checks:
- `index.html` is in sync with `src/` (see above)
- version string bump in the header (`>vX.Y.Z<`)
- inline `<script>` blocks parse as valid JS
- no native `alert()`/`confirm()`/`prompt()` (must use `showAlertModal`/`showConfirmAsync` custom modals — `window.confirm()` doesn't work when the app runs in an iframe)
- no duplicate top-level `function` names
- no unescaped dynamic strings inside `onclick="...'${expr}'..."` (must go through `jsAttr()`/`esc()`)

Exit code 0 = pass, 1 = fail. Always run this before considering a change done.

## Deploy workflow

1. Copy current `index.html` into `backups/index_vX.Y.Z.html` (one backup per released version — see `backups/`).
2. Make the change in the relevant `src/js/*.js` file(s), bump the version string in `src/head.html`.
3. Run `python3 scripts/build.py` to regenerate `index.html`.
4. Run the smoke test above.
5. Commit/push both the changed `src/` file(s) and the regenerated `index.html` to `main` — GitHub Pages deploys automatically, no CI. Never commit an `index.html` that doesn't match a `python3 scripts/build.py` run against the `src/` in the same commit.
6. Add an entry to the top of `README.md`'s changelog (Italian, terse, describes user-visible behavior and any required Supabase schema/Edge Function change).

There's no local dev server needed — open `index.html` directly in a browser, or push and reload the Pages URL. Supabase URL/anon key are hardcoded in `index.html` (`SB_URL`/`SB_ANON_KEY`, around line 1305); this repo is private specifically because of that.

## Architecture

### Two "screens", one file
`switchScreen('dashboard'|'weekly')` toggles between two top-level views inside the same DOM/state:
- **Dashboard** (`state.*`): commercial pipeline, operatori (staff registry with skills/certs), monthly staffing allocation (gg-uomo), Gantt, KPIs, map of active sites, Jira tools email mapping, admin log/reconciliation panels.
- **Pianificazione Settimanale** (`pw*` namespace, `#screen-weekly`): a weekly team-planning module with its own tab bar (`pwSwitchTab`): **Griglia** (team/site/tool assignment grid), **Ferie** (leave), **Mappa** (site map), **Controllo Produzione** (`cp*` — production tracking synced with Jira worklogs/production fields), **Doppia Week** (`dw*` — consecutive double-week away assignments).

Function names are prefixed by module: `pw*` (weekly planning), `cp*` (production control), `dw*` (double week), `sb*` (Supabase/sync/auth), plus generic dashboard render functions (`renderOperatori`, `renderCommesse`, `renderGantt`, etc.).

### State & persistence — four independent sync domains
State is split into four domains, each its own row in Supabase table `staffing_state` (`payload` jsonb), each with independent dirty-tracking, remote timestamp, and conflict detection — NOT one big blob:

| Domain | Row id | Dashboard state | Push debounce |
|---|---|---|---|
| core | `SB_ROW_CORE` (1) | `state.*` (pipeline, operatori, staffing, commesse) via `saveState()`/`loadState()` | 3s (`sbScheduleAutoPush`) |
| planning | `SB_ROW_PLANNING` (2) | `pwData` via `pwSave()`/`pwLoad()` | 500ms (`_sbPwPushTimer`) |
| ferie | `SB_ROW_FERIE` (3) | `pwFerie` | 500ms |
| dw | `SB_ROW_DW` (4) | double-week assignments | 500ms |

`_sbDirty{core,planning,ferie,dw}` and `_sbRemoteTs{1..4}` track push state and detect remote-vs-local conflicts per domain independently. Supabase Realtime subscribes to `staffing_state` and auto-pulls when another user saves. Reads/writes go through `sget`/`sset` (wrap `window.storage` if present, else `sessionStorage`), not directly against Supabase, except in `sbPush`/the domain load functions.

Some local-only UI state (last active tab, last viewed week/year, scroll position per tab, tools cache) lives in `localStorage`, separate from the synced domains above — it's per-browser convenience state, not shared data.

### Jira integration (Edge Functions, read side does not write back except for production KM)
Supabase Edge Functions (server-side, not in this repo) bridge to Jira:
- `jira-list-strumenti` — lists "Strumentazione" issues (project GAR) for the tools dropdown in Griglia; cached in `localStorage` (`pw_strumenti_cache`). Read-only.
- `jira-sync-worklogs` — pulls real worklog hours + ticket/epic links into Controllo Produzione's "Ore Jira" column.
- `jira-update-production` — writes/reads the "Actual Production" custom field on subtasks. Uses a **delta model**: each cell tracks the last value it wrote (`km_jira_last`); sync applies only `km_cad - km_jira_last` (can be negative) so the app's contribution is replaced rather than re-summed, and values written by other sources are preserved. Operates **per ticket**, since one operator can have production on multiple tickets/comuni the same day.
- `jira-list-epics`, `jira-list-tasks`, `jira-create-subtask` — used by Griglia's "🎫 Sottotask Jira" feature to create subtasks for planned sites.

When touching this area, read the version history in `README.md` (v18.28–v18.32) — the KM/production-sync design went through several iterations and the delta/per-ticket model replaced an earlier single-cell model; don't regress to summing absolute values.

### Geocoding & Mapping
Two public, free services power location-based features (no API key needed):
- **Nominatim** (OpenStreetMap Geocoding, `https://nominatim.openstreetmap.org`) — converts site/city names → lat/lng coordinates. Results cached in `_geoCache` (key: lowercase trimmed name) and persisted in `localStorage` (`geo_cache_v1`) to avoid re-querying. Used by Mappa Squadre (weekly map), Pianifica Spostamenti (route planner), and upcoming "Ricerca Dipendente-Cantiere" feature. When a geocoded location does not match expectation, users can manually correct it in Mappa Squadre (pencil icon ✏️ on each listed site) — corrections are applied to the shared cache, affecting all weeks where that site name appears.
- **OSRM** (Open Source Routing Machine, `https://router.project-osrm.org`) — real-world driving distances/times (road network) and route geometries. Used only by Pianifica Spostamenti (`/table` for distance matrix, `/route` for polyline to draw on map). Queries are not cached; results are stored locally in `localStorage` (`pw_spost_v1`, per-browser state).
- **Open-Meteo** (Weather API, `https://open-meteo.com`) — fetches daily and hourly weather for planned sites. Called on-demand when rendering a Griglia day, with 1-hour TTL cache (in-memory, not persistent).

### Data types & structures
Key data structures to know when working with different modules:

- **`pwData[anno][week]`** — Weekly planning grid (Griglia). Structure: array of commessa blocks, each `{ commessa, commessaId, squadre: [{ nome, operatori: [{ nome, giorni: {0..5: {cantieri: string[], attivita: string}} }] }] }`. Synced to Supabase `staffing_state` row `SB_ROW_PLANNING` (row id 2), domain key `pw_data`.

- **`state.operatori[]`** — Operator pool (Dashboard → Pool operatori). Structure: `{ id, nome_esteso, email, skills: string[], attestati: [...], provincia, regione, contratto_tipo, contratto_inizio, contratto_fine, ... }`. Skills and provincial origin are used for matching when assigning to sites.

- **`state.pipeline[]` / `state.commesse_attive[]` / `state.commesse_attive_meta{}`** — Project pipeline and active commesses (projects). Structure: `{ id, progetto, cliente, skills: [], attestati_richiesti: [], regione, provincia, codice_progetto_jira, ... }`. Region/province are used for geographic distance calculation ("📍 operatori più vicini").

- **`pwFerie[anno][week]`** — Weekly absences (leave, unavailability). Structure: array of arrays, `[operatore_idx][giorno]` = `'ferie'` | `'non_disponibile'` | undefined. Synced to Supabase `staffing_state` row `SB_ROW_FERIE` (row id 3), domain key `pw_ferie`.

- **`_geoCache`** — Persistent geocoding results. Structure: `{ 'lowercase name': { lat, lng, label } | null }`. Null entries mark sites that were searched but not found by Nominatim; they are still cached to avoid re-querying. Persisted in `localStorage` as `geo_cache_v1`.

### Auth & roles
Supabase Auth (email+password). Role is read from `auth.jwt() -> 'user_metadata' ->> 'role'` / `_sbUser.user_metadata.role`; `sbIsAdmin()` checks for `'admin'`. Admin-only: activity log (`activity_log` table, via `sbLogActivity`), active-sessions panel (`active_sessions` table, heartbeat every 45s, stale sessions >5min pruned), name-reconciliation debug section. Assigning admin is a manual SQL statement against `auth.users` (documented in `README.md`).

### Hard-won conventions (violating these has caused real regressions — see changelog v18.13–v18.18, v18.41)
- **Never use native `alert()`/`confirm()`/`prompt()`** — use `showAlertModal(msg)` / `await showConfirmAsync(msg, label)`. Native `confirm()` silently fails inside an iframe.
- **Escape all dynamic strings in `onclick="..."` attributes** with `jsAttr()` (for the attribute string) or `esc()` (for HTML content) — names with apostrophes (e.g. "D'Ivrea") break unescaped inline handlers. This is enforced by the smoke test.
- **Avoid nested template literals** — they've caused JS parse errors in this codebase; prefer string concatenation + `data-*` attributes for building HTML with dynamic attributes.
- **No duplicate top-level function names** — also enforced by the smoke test; this file is edited by hand/by search-replace often enough that duplicates have slipped in before.
- `INITIAL_DATA` is a minimal/empty fallback, not real data (real data lives only in Supabase since v18.17) — don't reintroduce a large hardcoded seed blob.
- **Confirm/alert modals must always render on top of every other modal.** `showConfirmAsync`/`showAlertModal` render into `#modal-root` with class `.modal-backdrop` (z-index kept as the highest of any fixed-position modal/overlay in the app — currently 100050). Any new modal (`position:fixed` + its own `z-index`, e.g. a new `sb-*-modal` panel) must stay below it, otherwise a confirm/alert triggered from inside that modal renders invisibly behind it (happened with "Elimina utente" behind "Gestione utenti", fix v18.137.0). Enforced by the smoke test (check 8) — bumping any modal's z-index to/above `.modal-backdrop`'s fails the build; raise `.modal-backdrop`'s z-index instead if a new modal genuinely needs to sit higher than the current ceiling.
