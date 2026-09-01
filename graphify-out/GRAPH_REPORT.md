# Graph Report - Gestione-Staffing  (2026-09-01)

## Corpus Check
- 23 files · ~171,210 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 609 nodes · 995 edges · 54 communities (34 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.7)
- Token cost: 0 input · 126,494 output

## Community Hubs (Navigation)
- App Feature Overview
- Weekly Mail Generation
- Attestati & Scadenze Module
- Supabase Admin & Sync
- Team Map & Geocoding
- Jira Subtask Creation
- Project Conventions (CLAUDE.md)
- Operator/Commessa CRUD
- Route Planning (OSRM)
- Production Control Core
- Team & Tools Grid
- App Configuration & Constants
- Operator Pool Rendering
- Weather Integration
- Design System Tokens
- Staffing Assignment Logic
- Operator Picker Modal
- Jira Custom Fields Docs
- State Persistence Utilities
- Leave Import from Excel
- Active Commessa Detail
- Stats Popover
- Production CSV Report
- Cell Copy/Paste (Griglia)
- Collapse/Expand State
- Double Week Assignments
- Excel Import/Export (Operatori)
- Supabase Sync Domains
- Build Smoke Test
- Commesse Rendering
- Staffing Cell Editing
- Screen/Tab Navigation
- Build Script
- Monthly Detail View
- Gantt Chart
- KPI Dashboard
- Alerts Rendering
- Design Rules (Shadows)
- Product Principles (Regression)
- Design Accent Color
- Design Rule (No Side Tab)
- Jira Start Date Field
- Jira Target Production Field
- Product Accessibility
- Brand Commitments
- Product Evidence
- Operating Context
- Product Positioning
- Data Correctness Principle
- Incremental Consistency Principle
- Internal Expert Audience
- Product Purpose
- Product Users

## God Nodes (most connected - your core abstractions)
1. `esc()` - 12 edges
2. `pwJiraSubtaskOpenComuniModal()` - 12 edges
3. `renderAttestati()` - 11 edges
4. `pwGetFerieWeek()` - 11 edges
5. `pwSpostDrawMap()` - 11 edges
6. `Griglia Settimanale Tab` - 11 edges
7. `closeModal()` - 10 edges
8. `attStatoVoce()` - 9 edges
9. `pwApplyProduzioneColors()` - 9 edges
10. `sbOnLoggedIn()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Legacy sessionStorage keys migration` --semantically_similar_to--> `INITIAL_DATA fallback constant`  [INFERRED] [semantically similar]
  SETUP_SUPABASE_GITHUB.md → CLAUDE.md
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `jira-update-production Edge Function` --implements--> `Delta model for KM/production sync`  [EXTRACTED]
  index.html → CLAUDE.md
- `listBox()` --indirect_call--> `esc()`  [INFERRED]
  src/js/weekly-ferie-import.js → src/js/dashboard-crud-helpers.js
- `rowHtml()` --indirect_call--> `esc()`  [INFERRED]
  src/js/weekly-jira-subtask.js → src/js/dashboard-crud-helpers.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pianificazione Settimanale Tab Group** — index_griglia_tab, index_ferie_tab, index_mappa_tab, index_controllo_produzione_tab, index_doppia_week_tab, index_pianifica_spostamenti_tab [EXTRACTED 1.00]
- **Four Independent Supabase Sync Domains** — index_core_domain, index_planning_domain, index_ferie_domain, index_dw_domain [EXTRACTED 1.00]
- **Jira Edge Function Suite** — index_jira_list_strumenti, index_jira_sync_worklogs, index_jira_update_production, index_jira_list_epics, index_jira_list_tasks, index_jira_create_subtask [EXTRACTED 1.00]
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Escaping & Modal Safety Conventions** — claude_showalertmodal, claude_showconfirmasync, claude_jsattr, claude_esc_function, claude_hard_won_conventions [EXTRACTED 1.00]
- **Four Independent Sync Domains** — claude_four_sync_domains, claude_staffing_state_table, claude_sbpush, claude_sbpull [EXTRACTED 1.00]
- **Jira Integration Edge Functions** — claude_delta_model [EXTRACTED 1.00]

## Communities (54 total, 20 thin omitted)

### Community 0 - "App Feature Overview"
Cohesion: 0.07
Nodes (42): Delta model for KM/production sync, index.html (generated Gestione-Staffing app), Active Sessions Panel (Admin), Activity Log (Admin Panel), Attestati & Scadenze Feature, Auth & Roles (Supabase Auth), Confronto Preventivo/Effettivo, Controllo Produzione Tab (+34 more)

### Community 1 - "Weekly Mail Generation"
Cohesion: 0.11
Nodes (37): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellCantieri(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad() (+29 more)

### Community 2 - "Attestati & Scadenze Module"
Cohesion: 0.12
Nodes (33): attBadgeHtml(), attBadgesHtml(), attClasseStato(), attDataBreve(), attEtichettaMancanza(), attExcelData(), _attFiltri, attFoglio() (+25 more)

### Community 3 - "Supabase Admin & Sync"
Cohesion: 0.11
Nodes (28): checkForNewVersion(), sbChangePwd(), sbClosePwdModal(), _sbDirty, sbGenerateSessionId(), sbInit(), sbInitAndCheck(), sbIsAdmin() (+20 more)

### Community 4 - "Team Map & Geocoding"
Cohesion: 0.12
Nodes (28): commessaRegione(), _geoCache, _geoCacheSave(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapCollapsedRegioniOp, _mapColor() (+20 more)

### Community 5 - "Jira Subtask Creation"
Cohesion: 0.14
Nodes (26): pwJiraBuildSubtaskItem(), pwJiraCreateSubtasks(), pwJiraFetchEpics(), pwJiraFetchExtraFields(), pwJiraFetchTasks(), pwJiraResolveCognome(), pwJiraSearchPanel(), pwJiraSearchPanelClose() (+18 more)

### Community 6 - "Project Conventions (CLAUDE.md)"
Cohesion: 0.10
Nodes (25): Supabase table active_sessions, Supabase table activity_log, scripts/build.py, esc(), Four independent sync domains design, Hard-won conventions (safety rules), INITIAL_DATA fallback constant, jsAttr() (+17 more)

### Community 7 - "Operator/Commessa CRUD"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 8 - "Route Planning (OSRM)"
Cohesion: 0.18
Nodes (25): _pwSpost, _pwSpost2opt(), _pwSpostBuildOrder(), pwSpostCalcola(), pwSpostClear(), _pwSpostCoordString(), _pwSpostCost(), pwSpostDrawMap() (+17 more)

### Community 9 - "Production Control Core"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 10 - "Team & Tools Grid"
Cohesion: 0.14
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 11 - "App Configuration & Constants"
Cohesion: 0.14
Nodes (20): ANNO, ATTESTATI_COLONNE, ATTESTATI_DURATA, distanzaLavorazione(), distanzaProvince(), haversineKm(), INDUSTRIES, INITIAL_DATA (+12 more)

### Community 12 - "Operator Pool Rendering"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 13 - "Weather Integration"
Cohesion: 0.20
Nodes (16): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), pwApplyMeteoBadgesToDom(), pwFasceOrarieFor(), pwFetchMeteoRange(), pwMeteoIconFor() (+8 more)

### Community 14 - "Design System Tokens"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 15 - "Staffing Assignment Logic"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 16 - "Operator Picker Modal"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 17 - "Jira Custom Fields Docs"
Cohesion: 0.20
Nodes (12): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Template A - Rilievi classico (14 progetti) (+4 more)

### Community 18 - "State Persistence Utilities"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 19 - "Leave Import from Excel"
Cohesion: 0.23
Nodes (8): PW_FERIE_ACCENTI, PW_FERIE_MESI, pwFerieImportFile(), pwFerieImportPick(), pwFerieImportShowConfirm(), listBox(), pwFerieMatchOperatore(), pwFerieNormTokens()

### Community 20 - "Active Commessa Detail"
Cohesion: 0.24
Nodes (6): _CONFRONTO_STATO_BADGE, _confrontoBodyHtml(), _confrontoTableHtml(), getCommessaAttivaMeta(), openCommessaAttivaModal(), renderConfrontoBox()

### Community 21 - "Stats Popover"
Cohesion: 0.27
Nodes (7): pwAddCantiereField(), pwCantiereCellOf(), pwRemoveCantiereField(), pwTitleCase(), pwToggleStatPopover(), pwUpdateCantiere(), pwUpdateCell()

### Community 22 - "Production CSV Report"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 23 - "Cell Copy/Paste (Griglia)"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 24 - "Collapse/Expand State"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 25 - "Double Week Assignments"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 26 - "Excel Import/Export (Operatori)"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 27 - "Supabase Sync Domains"
Cohesion: 0.60
Nodes (6): Core Sync Domain (state.*, row 1), Doppia Week Sync Domain (row 4), Ferie Sync Domain (pwFerie, row 3), Four-Domain Supabase Sync Architecture, Planning Sync Domain (pwData, row 2), sbPush()

### Community 28 - "Build Smoke Test"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 29 - "Commesse Rendering"
Cohesion: 0.60
Nodes (4): _confrontoMeseSel, renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 30 - "Staffing Cell Editing"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 31 - "Screen/Tab Navigation"
Cohesion: 0.50
Nodes (4): _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 32 - "Build Script"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

## Knowledge Gaps
- **75 isolated node(s):** `_CONFRONTO_STATO_BADGE`, `PW_MESI_IT`, `pwDwMonth`, `pwDwYear`, `_confrontoMeseSel` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `esc()` connect `Operator/Commessa CRUD` to `Leave Import from Excel`, `Jira Subtask Creation`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `pwJiraSubtaskRenderPreview()` connect `Jira Subtask Creation` to `Operator/Commessa CRUD`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `esc()` (e.g. with `listBox()` and `rowHtml()`) actually correct?**
  _`esc()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_CONFRONTO_STATO_BADGE`, `PW_MESI_IT`, `pwDwMonth` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Feature Overview` be split into smaller, more focused modules?**
  _Cohesion score 0.07188160676532769 - nodes in this community are weakly interconnected._
- **Should `Weekly Mail Generation` be split into smaller, more focused modules?**
  _Cohesion score 0.1091753774680604 - nodes in this community are weakly interconnected._
- **Should `Attestati & Scadenze Module` be split into smaller, more focused modules?**
  _Cohesion score 0.12380952380952381 - nodes in this community are weakly interconnected._