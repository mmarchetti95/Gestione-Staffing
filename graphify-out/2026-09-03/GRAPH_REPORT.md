# Graph Report - Gestione-Staffing  (2026-09-03)

## Corpus Check
- 48 files · ~205,473 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 741 nodes · 1243 edges · 59 communities (39 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2a825102`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Griglia Settimanale Tab
- weekly-mappa.js
- weekly-mail-core.js
- sb-admin.js
- dashboard-attestati.js
- weekly-jira-subtask.js
- CLAUDE.md
- dashboard-crud-helpers.js
- weekly-spostamenti.js
- produzione-core.js
- weekly-strumenti.js
- config.js
- dashboard-operatori.js
- weekly-meteo.js
- weekly-ricerca-squadre.js
- Categorical Color System (colori categorici)
- dashboard-assegnazioni.js
- weekly-operatore-modal.js
- Atlante Campi Jira (Eagleprojects)
- storage-utils.js
- weekly-ferie-import.js
- dashboard-commessa-attiva.js
- weekly-popover-stats.js
- produzione-report.js
- weekly-clipboard-cantiere.js
- weekly-collapse-cp.js
- weekly-doppiaweek.js
- dashboard-import-export.js
- smoke_test.py
- dashboard-commesse.js
- dashboard-staffing-celle.js
- weekly-nav.js
- build_bytes
- apriDettaglioMeseCommessa
- dashboard-gantt.js
- dashboard-kpi.js
- dashboard-alerts-render.js
- La Regola del Bagliore Vietato
- Capabilities and Constraints
- dashboard-dpi-admin.js
- Deep Teal accent (#0d9488)
- No side-tab colored border rule
- Start date pianificato custom field (customfield_13093)
- Target Production custom field (customfield_11280)
- Accessibility & Inclusion (no formal WCAG requirement)
- Brand Commitments (nessun vincolo stringente)
- Evidence on Hand (index.html/head.html as visual reference)
- Operating Context (GitHub Pages + Supabase + iframe)
- Product Positioning (strumento interno mono-tenant)
- Principle: data correctness before aesthetics
- Principle: incremental consistency (no build step)
- Principle: optimize for internal expert audience
- Product Purpose (staffing + pipeline commerciale)
- Product Users (staff ufficio Eagleprojects rilievi)
- dashboard-anagrafica-import.js
- new-project
- checkpoint
- sbPush

## God Nodes (most connected - your core abstractions)
1. `pwMapRenderCantieri()` - 14 edges
2. `new-project` - 14 edges
3. `pwJiraSubtaskOpenComuniModal()` - 12 edges
4. `esc()` - 12 edges
5. `rsCalcola()` - 11 edges
6. `pwGetFerieWeek()` - 11 edges
7. `renderAttestati()` - 11 edges
8. `pwSpostDrawMap()` - 11 edges
9. `Griglia Settimanale Tab` - 11 edges
10. `renderDpi()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `Legacy sessionStorage keys migration` --semantically_similar_to--> `INITIAL_DATA fallback constant`  [INFERRED] [semantically similar]
  SETUP_SUPABASE_GITHUB.md → CLAUDE.md
- `listBox()` --indirect_call--> `esc()`  [INFERRED]
  src/js/weekly-ferie-import.js → src/js/dashboard-crud-helpers.js
- `rowHtml()` --indirect_call--> `esc()`  [INFERRED]
  src/js/weekly-jira-subtask.js → src/js/dashboard-crud-helpers.js
- `src/head.html (app shell source)` --implements--> `index.html (generated Gestione-Staffing app)`  [INFERRED]
  src/head.html → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Escaping & Modal Safety Conventions** — claude_showalertmodal, claude_showconfirmasync, claude_jsattr, claude_esc_function, claude_hard_won_conventions [EXTRACTED 1.00]
- **Four Independent Supabase Sync Domains** — index_core_domain, index_planning_domain, index_ferie_domain, index_dw_domain [EXTRACTED 1.00]
- **Four Independent Sync Domains** — claude_four_sync_domains, claude_staffing_state_table, claude_sbpush, claude_sbpull [EXTRACTED 1.00]
- **Jira Edge Function Suite** — index_jira_list_strumenti, index_jira_sync_worklogs, index_jira_update_production, index_jira_list_epics, index_jira_list_tasks, index_jira_create_subtask [EXTRACTED 1.00]
- **Jira Integration Edge Functions** — claude_delta_model [EXTRACTED 1.00]
- **Pianificazione Settimanale Tab Group** — index_griglia_tab, index_ferie_tab, index_mappa_tab, index_controllo_produzione_tab, index_doppia_week_tab, index_pianifica_spostamenti_tab [EXTRACTED 1.00]

## Communities (59 total, 20 thin omitted)

### Community 0 - "Griglia Settimanale Tab"
Cohesion: 0.07
Nodes (42): Delta model for KM/production sync, index.html (generated Gestione-Staffing app), Active Sessions Panel (Admin), Activity Log (Admin Panel), Attestati & Scadenze Feature, Auth & Roles (Supabase Auth), Confronto Preventivo/Effettivo, Controllo Produzione Tab (+34 more)

### Community 1 - "weekly-mappa.js"
Cohesion: 0.09
Nodes (41): commessaRegione(), _geoCache, _geoCacheSaveSingle(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapCollapsedRegioniOp, _mapColor() (+33 more)

### Community 2 - "weekly-mail-core.js"
Cohesion: 0.11
Nodes (37): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellCantieri(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad() (+29 more)

### Community 3 - "sb-admin.js"
Cohesion: 0.09
Nodes (30): checkForNewVersion(), sbChangePwd(), sbClosePwdModal(), _sbDirty, sbGenerateSessionId(), sbInit(), sbInitAndCheck(), sbIsAdmin() (+22 more)

### Community 4 - "dashboard-attestati.js"
Cohesion: 0.12
Nodes (33): attBadgeHtml(), attBadgesHtml(), attClasseStato(), attDataBreve(), attEtichettaMancanza(), attExcelData(), _attFiltri, attFoglio() (+25 more)

### Community 5 - "weekly-jira-subtask.js"
Cohesion: 0.14
Nodes (26): pwJiraBuildSubtaskItem(), pwJiraCreateSubtasks(), pwJiraFetchEpics(), pwJiraFetchExtraFields(), pwJiraFetchTasks(), pwJiraResolveCognome(), pwJiraSearchPanel(), pwJiraSearchPanelClose() (+18 more)

### Community 6 - "CLAUDE.md"
Cohesion: 0.10
Nodes (25): Supabase table active_sessions, Supabase table activity_log, scripts/build.py, esc(), Four independent sync domains design, Hard-won conventions (safety rules), INITIAL_DATA fallback constant, jsAttr() (+17 more)

### Community 7 - "dashboard-crud-helpers.js"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 8 - "weekly-spostamenti.js"
Cohesion: 0.18
Nodes (25): _pwSpost, _pwSpost2opt(), _pwSpostBuildOrder(), pwSpostCalcola(), pwSpostClear(), _pwSpostCoordString(), _pwSpostCost(), pwSpostDrawMap() (+17 more)

### Community 9 - "produzione-core.js"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 10 - "weekly-strumenti.js"
Cohesion: 0.14
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 11 - "config.js"
Cohesion: 0.13
Nodes (21): ANNO, ATTESTATI_COLONNE, ATTESTATI_DURATA, distanzaLavorazione(), distanzaProvince(), DPI_DEFAULT, haversineKm(), INDUSTRIES (+13 more)

### Community 12 - "dashboard-operatori.js"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 13 - "weekly-meteo.js"
Cohesion: 0.20
Nodes (16): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), pwApplyMeteoBadgesToDom(), pwFasceOrarieFor(), pwFetchMeteoRange(), pwMeteoIconFor() (+8 more)

### Community 14 - "weekly-ricerca-squadre.js"
Cohesion: 0.10
Nodes (48): _ricercaSquadre, RS_STATI, rsAddTappa(), _rsBadgeHtml(), _rsBuildSquadre(), rsCalcola(), _rsChipsHtml(), _rsCloseDropdowns() (+40 more)

### Community 15 - "Categorical Color System (colori categorici)"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 16 - "dashboard-assegnazioni.js"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 17 - "weekly-operatore-modal.js"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 18 - "Atlante Campi Jira (Eagleprojects)"
Cohesion: 0.20
Nodes (12): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Template A - Rilievi classico (14 progetti) (+4 more)

### Community 19 - "storage-utils.js"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 20 - "weekly-ferie-import.js"
Cohesion: 0.23
Nodes (8): PW_FERIE_ACCENTI, PW_FERIE_MESI, pwFerieImportFile(), pwFerieImportPick(), pwFerieImportShowConfirm(), listBox(), pwFerieMatchOperatore(), pwFerieNormTokens()

### Community 21 - "dashboard-commessa-attiva.js"
Cohesion: 0.24
Nodes (6): _CONFRONTO_STATO_BADGE, _confrontoBodyHtml(), _confrontoTableHtml(), getCommessaAttivaMeta(), openCommessaAttivaModal(), renderConfrontoBox()

### Community 22 - "weekly-popover-stats.js"
Cohesion: 0.27
Nodes (7): pwAddCantiereField(), pwCantiereCellOf(), pwRemoveCantiereField(), pwTitleCase(), pwToggleStatPopover(), pwUpdateCantiere(), pwUpdateCell()

### Community 23 - "produzione-report.js"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 24 - "weekly-clipboard-cantiere.js"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 25 - "weekly-collapse-cp.js"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 26 - "weekly-doppiaweek.js"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 27 - "dashboard-import-export.js"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 28 - "smoke_test.py"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 29 - "dashboard-commesse.js"
Cohesion: 0.53
Nodes (5): _confrontoMeseSel, getNomiCommesseAttive(), renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 30 - "dashboard-staffing-celle.js"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 31 - "weekly-nav.js"
Cohesion: 0.47
Nodes (5): mapAddSatelliteToggle(), _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 32 - "build_bytes"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

### Community 40 - "dashboard-dpi-admin.js"
Cohesion: 0.19
Nodes (19): dpiBindModaleOperatore(), dpiDurataMesi(), _dpiFiltri, dpiIsValido(), dpiNonCoperti(), dpiRichiestiPerOperatore(), dpiRigaModaleOperatore(), dpiRigheMatrice() (+11 more)

### Community 55 - "dashboard-anagrafica-import.js"
Cohesion: 0.36
Nodes (6): anagImportFile(), anagImportParseWorkbook(), anagImportPick(), anagImportShowConfirm(), anagNormComune(), anagNormProvincia()

### Community 56 - "new-project"
Cohesion: 0.08
Nodes (22): Base (sempre incluso), Go (indicatore: go.mod), Java (indicatori: pom.xml, build.gradle), .NET (indicatori: *.csproj, *.sln), Node (indicatore: package.json), Python (indicatori: requirements.txt, pyproject.toml, Pipfile), Rust (indicatore: Cargo.toml), Template .gitignore per stack (+14 more)

### Community 57 - "checkpoint"
Cohesion: 0.33
Nodes (5): checkpoint, Gotchas, Resume flow, Save flow, Storage

### Community 58 - "sbPush"
Cohesion: 0.60
Nodes (6): Core Sync Domain (state.*, row 1), Doppia Week Sync Domain (row 4), Ferie Sync Domain (pwFerie, row 3), Four-Domain Supabase Sync Architecture, Planning Sync Domain (pwData, row 2), sbPush()

## Knowledge Gaps
- **108 isolated node(s):** `_ricercaSquadre`, `_rsMapLayers`, `_rsSelSkills`, `_rsSelStrumenti`, `RS_STATI` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `esc()` connect `dashboard-crud-helpers.js` to `weekly-ferie-import.js`, `weekly-jira-subtask.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `pwJiraSubtaskRenderPreview()` connect `weekly-jira-subtask.js` to `dashboard-crud-helpers.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `esc()` (e.g. with `listBox()` and `rowHtml()`) actually correct?**
  _`esc()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_ricercaSquadre`, `_rsMapLayers`, `_rsSelSkills` to the rest of the system?**
  _108 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Griglia Settimanale Tab` be split into smaller, more focused modules?**
  _Cohesion score 0.07188160676532769 - nodes in this community are weakly interconnected._
- **Should `weekly-mappa.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08686868686868687 - nodes in this community are weakly interconnected._
- **Should `weekly-mail-core.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1091753774680604 - nodes in this community are weakly interconnected._