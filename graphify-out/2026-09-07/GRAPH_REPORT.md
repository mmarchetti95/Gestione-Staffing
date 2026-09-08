# Graph Report - Gestione-Staffing  (2026-09-07)

## Corpus Check
- 15 files · ~220,531 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 861 nodes · 1381 edges · 81 communities (53 shown, 28 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.82)
- Token cost: 0 input · 253,786 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79

## God Nodes (most connected - your core abstractions)
1. `new-project` - 14 edges
2. `pwMapRenderCantieri()` - 14 edges
3. `pwJiraSubtaskOpenComuniModal()` - 13 edges
4. `rsCalcola()` - 11 edges
5. `renderAttestati()` - 11 edges
6. `pwSpostDrawMap()` - 11 edges
7. `sbOnLoggedIn()` - 11 edges
8. `pwGeneraMail()` - 11 edges
9. `pwGetFerieWeek()` - 11 edges
10. `renderDpi()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `Operator selection modal (.op-modal, stato-based coloring)` --references--> `Griglia tab (team/site/tool assignment grid)`  [INFERRED]
  src/head.html → CLAUDE.md
- `.pw-ctx-menu context menu (copy/paste cantiere/attività, right-click)` --references--> `Griglia tab (team/site/tool assignment grid)`  [INFERRED]
  src/head.html → CLAUDE.md
- `#sb-login-screen Supabase login overlay` --references--> `Supabase Auth & role system (user_metadata.role)`  [INFERRED]
  src/head.html → CLAUDE.md
- `#sb-pwd-modal change password modal` --references--> `Supabase Auth & role system (user_metadata.role)`  [INFERRED]
  src/head.html → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Jira integration Edge Functions bridge** — claude_jira_list_strumenti, claude_jira_sync_worklogs, claude_jira_update_production, claude_jira_list_epics, claude_jira_list_tasks, claude_jira_create_subtask [EXTRACTED 1.00]
- **New-Project Scaffolding Artifacts** — claude_skills_new_project_skill_new_project_skill, claude_skills_new_project_skill_agents_md_scaffold, claude_skills_new_project_skill_claude_md_scaffold, claude_skills_new_project_skill_license_default, claude_skills_new_project_references_gitignore_templates_base_block [EXTRACTED 1.00]
- **Hard-won conventions enforced by smoke_test.py** — claude_no_native_alert, claude_escape_onclick, claude_no_nested_template_literals, claude_no_duplicate_function_names, claude_smoke_test_py [EXTRACTED 1.00]
- **Four Supabase staffing_state sync domains (core/planning/ferie/dw)** — claude_sb_row_core, claude_sb_row_planning, claude_sb_row_ferie, claude_sb_row_dw, claude_staffing_state_table, claude_four_sync_domains [EXTRACTED 1.00]

## Communities (81 total, 28 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (53): checkForNewVersion(), PW_TAB_KEYS, SB_PAGE_LABELS, sbAllPageKeys(), sbApplyPageVisibility(), sbApplyReadOnlyBanner(), sbApplyUserRole(), sbCallAdminUsers() (+45 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (48): _ricercaSquadre, RS_STATI, rsAddTappa(), _rsBadgeHtml(), _rsBuildSquadre(), rsCalcola(), _rsChipsHtml(), _rsCloseDropdowns() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (41): commessaRegione(), _geoCache, _geoCacheSaveSingle(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapCollapsedRegioniOp, _mapColor() (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (39): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellCantieri(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad() (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (33): attBadgeHtml(), attBadgesHtml(), attClasseStato(), attDataBreve(), attEtichettaMancanza(), attExcelData(), _attFiltri, attFoglio() (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (29): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), _pcCache, _pcCacheSave(), pcColorePeggiore(), pcColorFromLabel() (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (29): pwJiraBuildSubtaskItem(), pwJiraCreateSubtasks(), pwJiraFetchEpics(), pwJiraFetchExtraFields(), pwJiraFetchTasks(), pwJiraOperatorEmail(), pwJiraResolveCognome(), pwJiraSearchPanel() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (25): _pwSpost, _pwSpost2opt(), _pwSpostBuildOrder(), pwSpostCalcola(), pwSpostClear(), _pwSpostCoordString(), _pwSpostCost(), pwSpostDrawMap() (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (22): Base (sempre incluso), Go (indicatore: go.mod), Java (indicatori: pom.xml, build.gradle), .NET (indicatori: *.csproj, *.sln), Node (indicatore: package.json), Python (indicatori: requirements.txt, pyproject.toml, Pipfile), Rust (indicatore: Cargo.toml), Template .gitignore per stack (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (22): scripts/build.py (assembles index.html), esc() escaping helper (HTML content), Escape dynamic strings in onclick attributes (apostrophes break inline handlers), index.html (generated deploy artifact), jsAttr() escaping helper (onclick attribute strings), scripts/smoke_test.py (pre-deploy checks), src/head.html (head/CSS/body markup source), src/js/*.js (JS_FILES ordered sections) (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (21): ANNO, ATTESTATI_COLONNE, ATTESTATI_DURATA, distanzaLavorazione(), distanzaProvince(), DPI_DEFAULT, haversineKm(), INDUSTRIES (+13 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (19): dpiBindModaleOperatore(), dpiDurataMesi(), _dpiFiltri, dpiIsValido(), dpiNonCoperti(), dpiRichiestiPerOperatore(), dpiRigaModaleOperatore(), dpiRigheMatrice() (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (16): checkpoint, Gotchas, Resume flow, Save flow, Single-Use Checkpoint Design, Storage, Gitignore Base Block, Gitignore Node Block (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (10): pwAddCantiereField(), pwCantiereCellOf(), pwOpenSearchResultsModal(), pwRemoveCantiereField(), _pwSearchMatches, pwSearchOp(), pwTitleCase(), pwToggleStatPopover() (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 20 - "Community 20"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (12): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Template A - Rilievi classico (14 progetti) (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (12): Unified --accent design token (teal) replacing two divergent hex teals, App version v18.147.0, Dashboard Staffing — Pipeline Commerciale (app), index.html as generated build artifact, pw-tab-controllo (Controllo Produzione tab), pw-tab-doppia (Doppia Week tab), pw-tab-ferie (Ferie / Permessi tab), pw-tab-griglia (Griglia settimanale tab) (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 24 - "Community 24"
Cohesion: 0.23
Nodes (8): PW_FERIE_ACCENTI, PW_FERIE_MESI, pwFerieImportFile(), pwFerieImportPick(), pwFerieImportShowConfirm(), listBox(), pwFerieMatchOperatore(), pwFerieNormTokens()

### Community 25 - "Community 25"
Cohesion: 0.24
Nodes (6): _CONFRONTO_STATO_BADGE, _confrontoBodyHtml(), _confrontoTableHtml(), getCommessaAttivaMeta(), openCommessaAttivaModal(), renderConfrontoBox()

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (8): Four independent sync domains pattern (not one big blob), pwData[anno][week] structure (Griglia), pwFerie[anno][week] structure, SB_ROW_FERIE (row 3, pwFerie, 500ms debounce), SB_ROW_PLANNING (row 2, pwData, 500ms debounce), v18.105/106 Ferie 'Non disponibile' type distinct from 'Ferie', v18.104.0 Import ferie da Excel (ORE NON LAVORATE), v18.15.0 multi-domain sync split (core/planning/ferie) with granular conflict detection

### Community 29 - "Community 29"
Cohesion: 0.36
Nodes (6): anagImportFile(), anagImportParseWorkbook(), anagImportPick(), anagImportShowConfirm(), anagNormComune(), anagNormProvincia()

### Community 30 - "Community 30"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (8): Doppia Week (dw*), Ferie tab (leave), Mappa tab (site map), SB_ROW_DW (row 4, double-week, 500ms debounce), Pianificazione Settimanale screen (pw* namespace), v18.33.0 Doppia Week tab (consecutive double-week away assignments), Mappa Squadre feature (Cantieri/Residenze dual map), Leaflet.js + CSS CDN (maps)

### Community 32 - "Community 32"
Cohesion: 0.32
Nodes (8): Griglia tab (team/site/tool assignment grid), jira-create-subtask Edge Function, jira-list-epics Edge Function, jira-list-strumenti Edge Function, jira-list-tasks Edge Function, Sottotask Jira feature (create subtasks from Griglia), Operator selection modal (.op-modal, stato-based coloring), .pw-ctx-menu context menu (copy/paste cantiere/attività, right-click)

### Community 33 - "Community 33"
Cohesion: 0.32
Nodes (8): Confirm/alert modal must render above all other modals (.modal-backdrop z-index ceiling, currently 100050), Never use native alert()/confirm()/prompt() (fails inside iframe), showAlertModal(), showConfirmAsync(), v18.137.0 generic confirm/alert modal z-index fix (behind Gestione utenti), v18.114.0 confirm/alert modal z-index bumped to 10050 above Leaflet controls, v18.13.0 replaced all native confirm()/alert() with custom modals (31 spots), .modal-backdrop CSS class (z-index 100050)

### Community 34 - "Community 34"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (6): Supabase Auth & role system (user_metadata.role), sbLogActivity() / activity_log table, #sb-log-modal Log attività modal (admin), #sb-login-screen Supabase login overlay, #sb-pwd-modal change password modal, #sb-sessions-modal Sessioni attive modal (admin)

### Community 36 - "Community 36"
Cohesion: 0.29
Nodes (6): Dashboard screen (state.*), SB_ROW_CORE (row 1, state.*, 3s debounce), sbScheduleAutoPush (3s debounce, core), state.pipeline[] / commesse_attive[] structure, switchScreen() dashboard/weekly toggle, v18.14.0 removed duplicate switchScreen, unified global function

### Community 37 - "Community 37"
Cohesion: 0.43
Nodes (7): _geoCache / localStorage geo_cache_v1 (persistent geocoding cache), Nominatim (OpenStreetMap geocoding), Open-Meteo weather API (1h in-memory TTL), OSRM (Open Source Routing Machine), Pianifica Spostamenti route planner, v18.111.0 Pianifica spostamenti tab (route optimizer via OSRM), Ricerca Squadre feature (team proposal by distance/skill, issue #6)

### Community 38 - "Community 38"
Cohesion: 0.29
Nodes (7): state.operatori[] structure (operator pool), Attestati & scadenze feature (certification tracking, Excel import), DPI & scadenze feature (PPE tracking), .att-matrix Attestati & scadenze sticky matrix, .skill-badge/.att-badge consolidated (were identical structure duplicated twice, incl. shared 'miss' state), .dpi-badge/.dpi-taglia DPI status styling (reuses .att-matrix/.att-dot/.att-pill), .op-ex-tag 'ex dipendente' badge — identical style rule duplicated verbatim in dashboard-operatori.js, produzione-core.js, weekly-operatore-modal.js, consolidated to one CSS rule

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (7): Backup e ripristino dati section, v18.116.0 Backup dati — ripristino da UI admin, data_backups table (30-day retention snapshots), nightly_staffing_backup pg_cron job (02:00 UTC), restore_backup(backup_id, include_cp) RPC, run_nightly_backup() function, #sb-backups-modal Backup dati modal (admin)

### Community 40 - "Community 40"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (6): sbPush/sbPull + Supabase Realtime auto-pull, sget/sset storage wrapper (window.storage or sessionStorage), Supabase table staffing_state (payload jsonb), v18.16.0 Supabase Realtime auto-pull when another user saves, #sb-banner Supabase sync status banner, @supabase/supabase-js CDN script

### Community 42 - "Community 42"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (5): Legacy sessionStorage keys migration, GitHub Pages deployment steps, RLS policies allow_read/allow_write, SB_URL/SB_ANON_KEY setup instructions, Guide: create staffing_state table

### Community 44 - "Community 44"
Cohesion: 0.53
Nodes (5): _confrontoMeseSel, getNomiCommesseAttive(), renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 45 - "Community 45"
Cohesion: 0.47
Nodes (5): mapAddSatelliteToggle(), _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 46 - "Community 46"
Cohesion: 0.50
Nodes (5): Controllo Produzione (cp*), Delta model for Jira production sync (write only km_cad - km_jira_last, per ticket, replaces app contribution instead of re-summing), jira-sync-worklogs Edge Function, jira-update-production Edge Function (delta model, per-ticket), v18.31.0 modello delta KM/Cad (write only diff vs last written value)

### Community 47 - "Community 47"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (3): v18.25.0 Controllo Produzione Report PDF (jsPDF+autotable), jsPDF-autotable CDN script, jsPDF CDN script

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (3): v18.69.0 /impeccable-guided restyling (unified accent teal, Inter font actually loaded), :root CSS custom properties — unified accent teal, radius/shadow/backdrop tokens replacing repeated magic values, Inter font declared but never actually loaded — fixed by adding Google Fonts link

## Ambiguous Edges - Review These
- `Stack tecnico (Tailwind, Chart.js, Leaflet.js, Supabase, GitHub Pages)` → `v18.58.0 removed unused sortablejs/chart.js CDN references`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **163 isolated node(s):** `_ricercaSquadre`, `RS_STATI`, `_rsMapLayers`, `_rsSelSkills`, `_rsSelStrumenti` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Stack tecnico (Tailwind, Chart.js, Leaflet.js, Supabase, GitHub Pages)` and `v18.58.0 removed unused sortablejs/chart.js CDN references`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Pianificazione Settimanale screen (pw* namespace)` connect `Community 31` to `Community 46`, `Community 32`, `Community 28`, `Community 36`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `Dashboard screen (state.*)` connect `Community 36` to `Community 38`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `switchScreen() dashboard/weekly toggle` connect `Community 36` to `Community 31`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `_ricercaSquadre`, `RS_STATI`, `_rsMapLayers` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10034013605442177 - nodes in this community are weakly interconnected._