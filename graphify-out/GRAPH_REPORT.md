# Graph Report - Gestione-Staffing  (2026-08-18)

## Corpus Check
- 34 files · ~99,385 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 342 nodes · 536 edges · 28 communities (22 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.78)
- Token cost: 0 input · 116,214 output

## Community Hubs (Navigation)
- Docs & Architecture Overview
- Weekly Mail & Ferie Core
- Supabase Auth & Sync Admin
- Produzione (Controllo) Core
- Dashboard CRUD & Modal Helpers
- Weekly Strumenti Management
- Operatori Registry & Views
- Storage & State Utilities
- Weekly Site Map
- Staffing Assignments
- App Configuration Constants
- Produzione Reporting & Export
- Weekly Grid Collapse State
- Weekly Operatore Modal
- Doppia Week Module
- Dashboard Import/Export (XLSX)
- Smoke Test Script
- Commessa Lifecycle
- Weekly Popover Stats
- Weekly/Dashboard Navigation
- Build Script
- Commesse Pipeline Rendering
- Monthly Detail Modal
- Gantt Chart Rendering
- KPI Dashboard
- Staffing Grid Cells
- Dashboard Alerts Rendering

## God Nodes (most connected - your core abstractions)
1. `closeModal()` - 10 edges
2. `pwApplyProduzioneColors()` - 9 edges
3. `sbOnLoggedIn()` - 9 edges
4. `pwGeneraMail()` - 8 edges
5. `pwGetFerieWeek()` - 8 edges
6. `pwControlloRender()` - 7 edges
7. `cpRereadTicket()` - 7 edges
8. `sbPull()` - 7 edges
9. `openFabbisognoModal()` - 6 edges
10. `cpSumKm()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Legacy sessionStorage keys migration` --semantically_similar_to--> `INITIAL_DATA fallback constant`  [INFERRED] [semantically similar]
  SETUP_SUPABASE_GITHUB.md → CLAUDE.md
- `Note tecniche per sviluppo futuro` --semantically_similar_to--> `Hard-won conventions (safety rules)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `#sb-banner sync status banner` --shares_data_with--> `sbIsAdmin()`  [INFERRED]
  src/head.html → CLAUDE.md
- `Dashboard main section (KPI grid, Gantt, operatori pool, commesse)` --shares_data_with--> `switchScreen('dashboard'|'weekly')`  [INFERRED]
  src/head.html → CLAUDE.md
- `#screen-weekly (Griglia/Ferie/Mappa/Controllo/Doppia Week tabs)` --shares_data_with--> `pwSwitchTab() weekly-planning tab bar`  [INFERRED]
  src/head.html → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Four Independent Sync Domains** — claude_four_sync_domains, claude_staffing_state_table, claude_sbpush, claude_sbpull [EXTRACTED 1.00]
- **Jira Integration Edge Functions** — claude_jira_list_strumenti, claude_jira_sync_worklogs, claude_jira_update_production, claude_delta_model [EXTRACTED 1.00]
- **Escaping & Modal Safety Conventions** — claude_showalertmodal, claude_showconfirmasync, claude_jsattr, claude_esc_function, claude_hard_won_conventions [EXTRACTED 1.00]

## Communities (28 total, 6 thin omitted)

### Community 0 - "Docs & Architecture Overview"
Cohesion: 0.06
Nodes (50): Supabase table active_sessions, Supabase table activity_log, scripts/build.py, Delta model for KM/production sync, esc(), Four independent sync domains design, Hard-won conventions (safety rules), INITIAL_DATA fallback constant (+42 more)

### Community 1 - "Weekly Mail & Ferie Core"
Cohesion: 0.12
Nodes (30): formatDate(), isoWeekToMonday(), isoWeekYear(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad(), pwFerie (+22 more)

### Community 2 - "Supabase Auth & Sync Admin"
Cohesion: 0.12
Nodes (25): sbChangePwd(), sbClosePwdModal(), _sbDirty, sbGenerateSessionId(), sbInit(), sbInitAndCheck(), sbIsAdmin(), sbLoadLog() (+17 more)

### Community 3 - "Produzione (Controllo) Core"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 4 - "Dashboard CRUD & Modal Helpers"
Cohesion: 0.19
Nodes (20): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), licenziaOperatore(), openCommessaModal() (+12 more)

### Community 5 - "Weekly Strumenti Management"
Cohesion: 0.16
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 6 - "Operatori Registry & Views"
Cohesion: 0.24
Nodes (11): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderSkillFilters() (+3 more)

### Community 7 - "Storage & State Utilities"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 8 - "Weekly Site Map"
Cohesion: 0.26
Nodes (10): _geoCache, _geoCacheSave(), geocodifica(), MAP_COLORS, _mapColor(), _mapColors, _mapMarkers, pwMapFixLuogo() (+2 more)

### Community 9 - "Staffing Assignments"
Cohesion: 0.25
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 10 - "App Configuration Constants"
Cohesion: 0.22
Nodes (9): ANNO, INDUSTRIES, INITIAL_DATA, meseCorrente(), MESI, MESI_LONG, SKILLS, soloFuturi() (+1 more)

### Community 11 - "Produzione Reporting & Export"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 12 - "Weekly Grid Collapse State"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 13 - "Weekly Operatore Modal"
Cohesion: 0.42
Nodes (8): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), pwPopulateWeekSelect(), pwRender(), pwRenderOpDropdown(), pwRenderStats()

### Community 14 - "Doppia Week Module"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 15 - "Dashboard Import/Export (XLSX)"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 16 - "Smoke Test Script"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 19 - "Weekly/Dashboard Navigation"
Cohesion: 0.50
Nodes (4): _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 20 - "Build Script"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

### Community 21 - "Commesse Pipeline Rendering"
Cohesion: 0.83
Nodes (3): renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 25 - "Staffing Grid Cells"
Cohesion: 0.83
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

## Knowledge Gaps
- **39 isolated node(s):** `INITIAL_DATA`, `SKILLS`, `MESI`, `MESI_LONG`, `INDUSTRIES` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `INITIAL_DATA`, `SKILLS`, `MESI` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Docs & Architecture Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `Weekly Mail & Ferie Core` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Should `Supabase Auth & Sync Admin` be split into smaller, more focused modules?**
  _Cohesion score 0.12315270935960591 - nodes in this community are weakly interconnected._