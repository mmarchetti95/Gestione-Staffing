# Graph Report - Gestione-Staffing  (2026-08-27)

## Corpus Check
- 26 files · ~135,341 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 531 nodes · 741 edges · 70 communities (33 shown, 37 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.84)
- Token cost: 0 input · 121,519 output

## Community Hubs (Navigation)
- weekly-mail-core.js
- Persistence Architecture & Conventions
- Atlante Campi Jira (Eagleprojects)
- Supabase Admin & Sessions
- dashboard-crud-helpers.js
- Controllo Produzione Core
- Griglia Squadre & Strumenti
- config.js
- weekly-jira-subtask.js
- dashboard-operatori.js
- Product Overview & Admin Log
- weekly-meteo.js
- weekly-mappa.js
- Sync Domains (core/planning/ferie/dw)
- Categorical Color System & Brand Metaphors
- dashboard-assegnazioni.js
- weekly-operatore-modal.js
- Storage Utils & Saturazione
- dashboard-commessa-attiva.js
- weekly-popover-stats.js
- produzione-report.js
- weekly-clipboard-cantiere.js
- Collapse/Expand UI State
- Doppia Week Feature
- Excel Import/Export
- Build Smoke Test ESLint
- Commesse Rendering
- Inline Cell Editing & Refresh
- Screen/Tab Navigation
- scripts/build.py
- Dettaglio Mese Modal
- Vista Mensile Gantt
- Dashboard KPI Rendering
- Controllo Produzione - Sezioni & Stili
- Security Hardening History
- Alerts & Full Render
- Shadow Vocabulary & Bagliore Vietato Rule
- Jira Epics Fetch (jira-list-epics)
- Jira Strumenti Fetch (jira-list-strumenti)
- Jira Tasks Fetch (jira-list-tasks)
- Operator Modal Styles & Cognome Resolve
- Supabase Login Screen
- Pianificazione Settimanale - Grid Styles
- Screen Navigation Styling
- Capabilities & Constraints Principle
- Supabase Migration History
- Multi-Domain Sync History
- Design Tokens & Font Fix
- Deep Teal Accent Color
- No Side-Tab Border Rule
- pwSwitchTab()
- sbSetLocal()
- showAlertModal()
- showConfirmAsync()
- Accessibility Stance
- Brand Commitments
- Evidence on Hand
- Operating Context
- Product Positioning
- Data Correctness Principle
- No-Build-Step Principle
- Expert Audience Principle
- Product Purpose
- Product Users
- v18.91.0 - Meteo Cantieri
- v18.92.0 - Copia/Incolla Cantiere
- v18.94.0 - Conferme Azioni Distruttive
- v18.96.0 - Mappa Squadre per Commessa

## God Nodes (most connected - your core abstractions)
1. `esc()` - 11 edges
2. `closeModal()` - 10 edges
3. `Dashboard Staffing (Eagleprojects app)` - 10 edges
4. `sbOnLoggedIn()` - 9 edges
5. `pwApplyProduzioneColors()` - 9 edges
6. `pwJiraSubtaskOpenComuniModal()` - 9 edges
7. `pwGeneraMail()` - 8 edges
8. `pwGetFerieWeek()` - 8 edges
9. `Atlante Campi Jira (Eagleprojects)` - 8 edges
10. `sbPull()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Legacy sessionStorage keys migration` --semantically_similar_to--> `INITIAL_DATA fallback constant`  [INFERRED] [semantically similar]
  SETUP_SUPABASE_GITHUB.md → CLAUDE.md
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `Atlante Campi Jira (Eagleprojects)` --semantically_similar_to--> `Sottotask Jira flow: extra required-fields discovery step`  [INFERRED] [semantically similar]
  docs/jira-custom-fields.md → index.html
- `sbPush()` --rationale_for--> `v18.50.0 - Fix bug sincronizzazione multi-utente sbPush conflitti`  [INFERRED]
  index.html → README.md
- `Sottotask Jira flow: extra required-fields discovery step` --references--> `Start date pianificato custom field (customfield_13093)`  [INFERRED]
  index.html → docs/jira-custom-fields.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Four independent sync domains sharing the staffing_state Supabase table pattern** — claudemd_domain_core, claudemd_domain_planning, claudemd_domain_ferie, claudemd_domain_dw, index_html_sbpush, index_html_sbpull [INFERRED 0.85]
- **Jira subtask creation flow: epic/task selection, selective checkbox, extra required fields, preview, create** — index_html_pwjirafetchepics, index_html_pwjirafetchtasks, index_html_pwjirafetchextrafields, index_html_pwjirasubtaskopenextrafieldsmodal, index_html_pwjirasubtaskpreview, index_html_pwjiracreatesubtasks, readme_v18_88_0_creazione_sottotask_jira_griglia, readme_v18_93_0_fix_sottotask_jira_campi_obbligatori, readme_v18_95_0_selezione_sottotask [EXTRACTED 0.95]
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Escaping & Modal Safety Conventions** — claude_showalertmodal, claude_showconfirmasync, claude_jsattr, claude_esc_function, claude_hard_won_conventions [EXTRACTED 1.00]
- **Four Independent Sync Domains** — claude_four_sync_domains, claude_staffing_state_table, claude_sbpush, claude_sbpull [EXTRACTED 1.00]
- **Jira Integration Edge Functions** — claude_jira_list_strumenti, claude_jira_sync_worklogs, claude_jira_update_production, claude_delta_model [EXTRACTED 1.00]

## Communities (70 total, 37 thin omitted)

### Community 0 - "weekly-mail-core.js"
Cohesion: 0.11
Nodes (31): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellCantieri(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad() (+23 more)

### Community 1 - "Persistence Architecture & Conventions"
Cohesion: 0.08
Nodes (29): Supabase table active_sessions, Supabase table activity_log, scripts/build.py, Delta model for KM/production sync, esc(), Four independent sync domains design, Hard-won conventions (safety rules), INITIAL_DATA fallback constant (+21 more)

### Community 2 - "Atlante Campi Jira (Eagleprojects)"
Cohesion: 0.08
Nodes (29): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Start date pianificato custom field (customfield_13093) (+21 more)

### Community 3 - "Supabase Admin & Sessions"
Cohesion: 0.12
Nodes (25): sbChangePwd(), sbClosePwdModal(), _sbDirty, sbGenerateSessionId(), sbInit(), sbInitAndCheck(), sbIsAdmin(), sbLoadLog() (+17 more)

### Community 4 - "dashboard-crud-helpers.js"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 5 - "Controllo Produzione Core"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 6 - "Griglia Squadre & Strumenti"
Cohesion: 0.14
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 7 - "config.js"
Cohesion: 0.16
Nodes (18): ANNO, distanzaLavorazione(), distanzaProvince(), haversineKm(), INDUSTRIES, INITIAL_DATA, meseCorrente(), MESI (+10 more)

### Community 8 - "weekly-jira-subtask.js"
Cohesion: 0.22
Nodes (17): pwJiraBuildSubtaskItem(), pwJiraCreateSubtasks(), pwJiraFetchEpics(), pwJiraFetchExtraFields(), pwJiraFetchTasks(), pwJiraResolveCognome(), pwJiraSearchPanel(), pwJiraSearchPanelClose() (+9 more)

### Community 9 - "dashboard-operatori.js"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 10 - "Product Overview & Admin Log"
Cohesion: 0.12
Nodes (16): sbLogActivity(action, details), Section: MAPPA LEAFLET + NOMINATIM, README Changelog, Dashboard Staffing (Eagleprojects app), Log attività admin panel, Mappa cantieri feature, Operatori (anagrafica) feature, Pianificazione settimanale feature (+8 more)

### Community 11 - "weekly-meteo.js"
Cohesion: 0.21
Nodes (15): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), pwApplyMeteoBadgesToDom(), pwFasceOrarieFor(), pwFetchMeteoRange(), pwMeteoIconFor() (+7 more)

### Community 12 - "weekly-mappa.js"
Cohesion: 0.21
Nodes (13): _geoCache, _geoCacheSave(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapColor(), _mapColors, _mapMarkers (+5 more)

### Community 13 - "Sync Domains (core/planning/ferie/dw)"
Cohesion: 0.14
Nodes (9): Sync domain: core (SB_ROW_CORE / staffing_state row 1), Sync domain: dw (SB_ROW_DW / double-week), Sync domain: ferie (SB_ROW_FERIE / pwFerie), Sync domain: planning (SB_ROW_PLANNING / pwData), sbPush(), Section: DOPPIA WEEK (prospetto mensile), v18.47.2 - Fix sbPull non scriveva in local storage (griglia/ferie), v18.49.2 - Fix Doppia Week nessuna cache locale (+1 more)

### Community 14 - "Categorical Color System & Brand Metaphors"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 15 - "dashboard-assegnazioni.js"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 16 - "weekly-operatore-modal.js"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 17 - "Storage Utils & Saturazione"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 18 - "dashboard-commessa-attiva.js"
Cohesion: 0.24
Nodes (6): _CONFRONTO_STATO_BADGE, _confrontoBodyHtml(), _confrontoTableHtml(), getCommessaAttivaMeta(), openCommessaAttivaModal(), renderConfrontoBox()

### Community 19 - "weekly-popover-stats.js"
Cohesion: 0.27
Nodes (7): pwAddCantiereField(), pwCantiereCellOf(), pwRemoveCantiereField(), pwTitleCase(), pwToggleStatPopover(), pwUpdateCantiere(), pwUpdateCell()

### Community 20 - "produzione-report.js"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 21 - "weekly-clipboard-cantiere.js"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 22 - "Collapse/Expand UI State"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 23 - "Doppia Week Feature"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 24 - "Excel Import/Export"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 25 - "Build Smoke Test ESLint"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 26 - "Commesse Rendering"
Cohesion: 0.60
Nodes (4): _confrontoMeseSel, renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 27 - "Inline Cell Editing & Refresh"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 28 - "Screen/Tab Navigation"
Cohesion: 0.50
Nodes (4): _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 29 - "scripts/build.py"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

### Community 33 - "Controllo Produzione - Sezioni & Stili"
Cohesion: 0.67
Nodes (3): Section: CARICA REPORT PRODUZIONE (per squadra), Section: CONTROLLO PRODUZIONE, Controllo Produzione table styles (.cp-table)

## Ambiguous Edges - Review These
- `Operator selection modal styles (.op-modal, .op-trigger-btn)` → `pwJiraResolveCognome(op)`  [AMBIGUOUS]
  src/head.html · relation: conceptually_related_to

## Knowledge Gaps
- **103 isolated node(s):** `PW_MESI_IT`, `pwDwMonth`, `pwDwYear`, `_sbDirty`, `_sbRemoteTs` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Operator selection modal styles (.op-modal, .op-trigger-btn)` and `pwJiraResolveCognome(op)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `esc()` connect `dashboard-crud-helpers.js` to `weekly-jira-subtask.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `pwJiraSubtaskOpenComuniModal()` connect `weekly-jira-subtask.js` to `dashboard-crud-helpers.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `esc()` (e.g. with `pwJiraSubtaskOpenComuniModal()` and `pwJiraSubtaskRenderPreview()`) actually correct?**
  _`esc()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PW_MESI_IT`, `pwDwMonth`, `pwDwYear` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `weekly-mail-core.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1126984126984127 - nodes in this community are weakly interconnected._
- **Should `Persistence Architecture & Conventions` be split into smaller, more focused modules?**
  _Cohesion score 0.0846774193548387 - nodes in this community are weakly interconnected._