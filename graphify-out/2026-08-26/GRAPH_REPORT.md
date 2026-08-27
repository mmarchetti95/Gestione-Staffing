# Graph Report - Gestione-Staffing  (2026-08-26)

## Corpus Check
- 36 files · ~127,375 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 489 nodes · 690 edges · 61 communities (32 shown, 29 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `77ca3639`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- weekly-mail-core.js
- Persistence Architecture & Conventions
- Supabase Admin & Sessions
- Categorical Color System (colori categorici)
- Controllo Produzione Core
- Griglia Squadre & Strumenti
- dashboard-crud-helpers.js
- weekly-meteo.js
- dashboard-operatori.js
- v18.33.0 feature Doppia Week (tab trasferte consecutive)
- dashboard-assegnazioni.js
- Storage Utils & Saturazione
- Mappa Squadre Geocoding
- config.js
- dashboard-commessa-attiva.js
- Report CSV Import (Produzione)
- Collapse/Expand UI State
- weekly-operatore-modal.js
- Doppia Week Feature
- Excel Import/Export
- Build Smoke Test ESLint
- weekly-popover-stats.js
- Security Hardening History
- Jira Actual Production Sync
- Commesse Rendering
- Inline Cell Editing & Refresh
- Screen/Tab Navigation
- build_bytes
- Dettaglio Mese Modal
- Vista Mensile Gantt
- Dashboard KPI Rendering
- v18.72 Confronto Prev/Effettivo Feature
- Genera Mail Recipients History
- Alerts & Full Render
- Email Sempre Incluse History
- No Side-Tab Border Rule
- Accessibility Stance
- Brand Commitments
- Product Positioning
- Data Correctness Principle
- No-Build-Step Principle
- Expert Audience Principle
- Product Users
- Carica Report CSV Feature
- Ore Report Prod Column
- Export Buttons Removal
- Last Tab/Week Memory
- Week Select Fix
- Last Screen Memory
- Esclusione Operatore Fix
- Cantieri Dedup in Mail
- Mail Escaping Fix
- Squadra Naming Fix
- Codice Commessa Field
- Mail Orari Persistence
- Dead Code Cleanup
- Drone Tool Type
- Griglia Commesse Reorder
- Login Screen Overlay
- weekly-jira-subtask.js

## God Nodes (most connected - your core abstractions)
1. `esc()` - 11 edges
2. `closeModal()` - 10 edges
3. `pwApplyProduzioneColors()` - 9 edges
4. `pwJiraSubtaskOpenComuniModal()` - 9 edges
5. `sbOnLoggedIn()` - 9 edges
6. `pwGeneraMail()` - 8 edges
7. `pwGetFerieWeek()` - 8 edges
8. `pwControlloRender()` - 7 edges
9. `cpRereadTicket()` - 7 edges
10. `sbPull()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Legacy sessionStorage keys migration` --semantically_similar_to--> `INITIAL_DATA fallback constant`  [INFERRED] [semantically similar]
  SETUP_SUPABASE_GITHUB.md → CLAUDE.md
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `Product Purpose (staffing + pipeline commerciale)` --references--> `Pianificazione Settimanale screen (#screen-weekly)`  [EXTRACTED]
  PRODUCT.md → src/head.html
- `:root CSS design tokens (--accent, --shadow-*, --radius-*)` --shares_data_with--> `Deep Teal accent (#0d9488)`  [EXTRACTED]
  src/head.html → DESIGN.md
- `index.html generated build artifact` --shares_data_with--> `:root CSS design tokens (--accent, --shadow-*, --radius-*)`  [EXTRACTED]
  index.html → src/head.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Escaping & Modal Safety Conventions** — claude_showalertmodal, claude_showconfirmasync, claude_jsattr, claude_esc_function, claude_hard_won_conventions [EXTRACTED 1.00]
- **Four Independent Sync Domains** — claude_four_sync_domains, claude_staffing_state_table, claude_sbpush, claude_sbpull [EXTRACTED 1.00]
- **Jira Integration Edge Functions** — claude_jira_list_strumenti, claude_jira_sync_worklogs, claude_jira_update_production, claude_delta_model [EXTRACTED 1.00]
- **Genera Mail recipient-handling evolution** — readme_v18_49_0_apri_outlook, readme_v18_51_referente_tecnico, readme_v18_52_email_sempre_incluse, readme_v18_53_email_sempre_cc_fix, readme_v18_56_mailto_recipients_reorder [INFERRED 0.85]
- **Multi-domain sync persistence bug-fix cluster** — readme_v18_15_multi_domain_sync, readme_v18_47_2_sbpull_localstorage_bug, readme_v18_49_2_doppia_week_local_cache_fix, readme_v18_50_sbpush_conflict_bug_fix [INFERRED 0.85]
- **Jira Actual Production delta-model pipeline** — readme_v18_29_jira_actual_production_write, readme_v18_30_jira_read_before_upload, readme_v18_31_delta_model, readme_v18_32_km_per_ticket_model [INFERRED 0.90]

## Communities (61 total, 29 thin omitted)

### Community 0 - "weekly-mail-core.js"
Cohesion: 0.11
Nodes (31): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellCantieri(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad() (+23 more)

### Community 1 - "Persistence Architecture & Conventions"
Cohesion: 0.08
Nodes (29): Supabase table active_sessions, Supabase table activity_log, scripts/build.py, Delta model for KM/production sync, esc(), Four independent sync domains design, Hard-won conventions (safety rules), INITIAL_DATA fallback constant (+21 more)

### Community 2 - "Supabase Admin & Sessions"
Cohesion: 0.12
Nodes (25): sbChangePwd(), sbClosePwdModal(), _sbDirty, sbGenerateSessionId(), sbInit(), sbInitAndCheck(), sbIsAdmin(), sbLoadLog() (+17 more)

### Community 3 - "Categorical Color System (colori categorici)"
Cohesion: 0.07
Nodes (31): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Deep Teal accent (#0d9488), Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive) (+23 more)

### Community 4 - "Controllo Produzione Core"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 5 - "Griglia Squadre & Strumenti"
Cohesion: 0.14
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 6 - "dashboard-crud-helpers.js"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 7 - "weekly-meteo.js"
Cohesion: 0.21
Nodes (15): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), pwApplyMeteoBadgesToDom(), pwFasceOrarieFor(), pwFetchMeteoRange(), pwMeteoIconFor() (+7 more)

### Community 8 - "dashboard-operatori.js"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 9 - "v18.33.0 feature Doppia Week (tab trasferte consecutive)"
Cohesion: 0.08
Nodes (25): Operating Context (GitHub Pages + Supabase + iframe), v18.0.0 migrazione a Supabase + GitHub Pages, v18.15.0 sync multi-dominio (core/planning/ferie) con conflict detection, v18.17.0 rimozione INITIAL_DATA hardcoded, v18.20.0 tab Email/operatore (mapping email aziendale), v18.21.0 sync worklog Jira in Controllo Produzione, v18.33.0 feature Doppia Week (tab trasferte consecutive), v18.34.2 header sticky Doppia Week (+17 more)

### Community 10 - "dashboard-assegnazioni.js"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 11 - "Storage Utils & Saturazione"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 12 - "Mappa Squadre Geocoding"
Cohesion: 0.26
Nodes (10): _geoCache, _geoCacheSave(), geocodifica(), MAP_COLORS, _mapColor(), _mapColors, _mapMarkers, pwMapFixLuogo() (+2 more)

### Community 13 - "config.js"
Cohesion: 0.16
Nodes (18): ANNO, distanzaLavorazione(), distanzaProvince(), haversineKm(), INDUSTRIES, INITIAL_DATA, meseCorrente(), MESI (+10 more)

### Community 14 - "dashboard-commessa-attiva.js"
Cohesion: 0.24
Nodes (6): _CONFRONTO_STATO_BADGE, _confrontoBodyHtml(), _confrontoTableHtml(), getCommessaAttivaMeta(), openCommessaAttivaModal(), renderConfrontoBox()

### Community 15 - "Report CSV Import (Produzione)"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 16 - "Collapse/Expand UI State"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 17 - "weekly-operatore-modal.js"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 18 - "Doppia Week Feature"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 19 - "Excel Import/Export"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 20 - "Build Smoke Test ESLint"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 21 - "weekly-popover-stats.js"
Cohesion: 0.27
Nodes (7): pwAddCantiereField(), pwCantiereCellOf(), pwRemoveCantiereField(), pwTitleCase(), pwToggleStatPopover(), pwUpdateCantiere(), pwUpdateCell()

### Community 22 - "Security Hardening History"
Cohesion: 0.50
Nodes (5): Capabilities and Constraints, Principle: no regression on hard-won constraints, v18.13.0 sostituzione confirm()/alert() nativi con modali custom, v18.18.0 escaping HTML completo (esc() su 25+ template literal), v18.41.0 hardening escaping jsAttr() + smoke test

### Community 23 - "Jira Actual Production Sync"
Cohesion: 0.40
Nodes (5): v18.29.0 scrittura KM/CAD su Actual Production Jira, v18.30.0 lettura Actual Production prima dell'upload KM, v18.31.0 modello delta per Actual Production su Jira, v18.32.0 modello KM/Cad per singolo ticket, v18.45.0 bottone rilettura Actual Production per ticket

### Community 24 - "Commesse Rendering"
Cohesion: 0.60
Nodes (4): _confrontoMeseSel, renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 25 - "Inline Cell Editing & Refresh"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 26 - "Screen/Tab Navigation"
Cohesion: 0.50
Nodes (4): _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 27 - "build_bytes"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

### Community 31 - "v18.72 Confronto Prev/Effettivo Feature"
Cohesion: 0.67
Nodes (3): index.html header version marker v18.72.0, v18.72.0 Confronto Preventivo/Effettivo (Commesse attive), v18.72.0 Confronto Preventivo/Effettivo in Gantt mensile

### Community 32 - "Genera Mail Recipients History"
Cohesion: 0.67
Nodes (3): v18.49.0 pulsante Apri Outlook (mailto destinatari), v18.51.0 campo Email referente tecnico obbligatorio, v18.56.0 riordino destinatari mailto (To/CC)

### Community 60 - "weekly-jira-subtask.js"
Cohesion: 0.26
Nodes (14): pwJiraBuildSubtaskItem(), pwJiraCreateSubtasks(), pwJiraFetchEpics(), pwJiraFetchTasks(), pwJiraResolveCognome(), pwJiraSearchPanel(), pwJiraSearchPanelClose(), pwJiraSearchPanelEnsure() (+6 more)

## Knowledge Gaps
- **87 isolated node(s):** `_cpData`, `_pwCollapsedComm`, `_pwCollapsedSq`, `_cpCollapsedComm`, `_cpCollapsedSq` (+82 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Pianificazione Settimanale screen (#screen-weekly)` connect `v18.33.0 feature Doppia Week (tab trasferte consecutive)` to `Categorical Color System (colori categorici)`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Top navigation Dashboard/Weekly (.topnav-btn)` connect `Categorical Color System (colori categorici)` to `v18.33.0 feature Doppia Week (tab trasferte consecutive)`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `esc()` (e.g. with `pwJiraSubtaskOpenComuniModal()` and `pwJiraSubtaskRenderPreview()`) actually correct?**
  _`esc()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_cpData`, `_pwCollapsedComm`, `_pwCollapsedSq` to the rest of the system?**
  _87 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `weekly-mail-core.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1126984126984127 - nodes in this community are weakly interconnected._
- **Should `Persistence Architecture & Conventions` be split into smaller, more focused modules?**
  _Cohesion score 0.0846774193548387 - nodes in this community are weakly interconnected._
- **Should `Supabase Admin & Sessions` be split into smaller, more focused modules?**
  _Cohesion score 0.12315270935960591 - nodes in this community are weakly interconnected._