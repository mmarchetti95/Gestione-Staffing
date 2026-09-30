# Graph Report - Gestione-Staffing  (2026-09-29)

## Corpus Check
- 43 files · ~306,255 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1227 nodes · 2171 edges · 98 communities (61 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.78)
- Token cost: 164,143 input · 0 output

## Community Hubs (Navigation)
- Storico meteo
- Auth e sync Supabase
- Funzionalità app (README)
- Mail squadre e ferie
- Sottotask Jira da Griglia
- Ricerca squadre
- Mappa squadre settimanale
- Helper modali e CRUD
- Meteo Griglia
- Attestati operatori
- Assistente AI
- Mappa live stato Task
- Strumenti Jira squadra
- Pianifica spostamenti
- Skill new-project gitignore
- Controllo Produzione
- Distanze e province
- DPI operatori
- Commessa attiva e documenti
- Limitazioni visite mediche
- Edge Function sottotask
- Anagrafica operatori
- Skill checkpoint e new-project
- Fornitori
- Render Griglia e modale operatore
- Mappa live toolbar filtri
- Mappa live marker dettaglio
- Domini sync e dati
- Modifica celle Griglia
- Sistema colori categorici
- Assegnazioni operatori
- Atlante campi Jira
- Struttura index.html
- Storage e stato locale
- Collapse Controllo Produzione
- Report produzione CSV
- Copia incolla celle
- Modali e ruoli
- Edge Function Jira (doc)
- Import anagrafica
- Edge Function stato Task
- Build smoke test deploy
- Schermate e navigazione
- Mappa live meteo e date
- Mappa live auto-refresh
- Doppia Week
- Tab e layer mappa
- Geocoding e routing
- Import export xlsx
- Mappa live costruzione item
- Mappa live dettaglio cantiere
- Backup e ripristino
- Smoke test ESLint
- Setup Supabase GitHub
- Render commesse
- Mappa live commesse
- Stack tecnico
- Celle staffing inline
- Script build
- Dettaglio mese commessa
- Gantt
- KPI dashboard
- Alert dashboard
- Regole ombre design
- Vincoli e principi
- Skill checkpoint
- Accento teal
- Regola bordo laterale
- Campo Start date pianificato
- Campo Target Production
- Accessibilità
- Impegni di brand
- Evidenze design
- Contesto operativo
- Posizionamento prodotto
- Principio correttezza dati
- Principio coerenza incrementale
- Principio uso interno
- Scopo del prodotto
- Utenti del prodotto
- Mappa squadre (doc)
- v18.137 modali confirm alert
- v18.114 z-index modali
- v18.125 cursore drag
- v18.13 niente dialoghi nativi
- v18.142 scritture disabilitate
- v18.147 pulsanti Griglia
- v18.14 switch duplicato
- v18.15 sync multi-dominio
- v18.16 Realtime
- v18.17 niente INITIAL_DATA
- v18.18 escaping esc
- v18.25 report produzione
- v18.41 jsAttr smoke test
- v18.69 restyle impeccable
- v18.99 avviso nuova versione

## God Nodes (most connected - your core abstractions)
1. `mlRender()` - 29 edges
2. `pwJiraSubtaskOpenComuniModal()` - 17 edges
3. `Dashboard Staffing Eagleprojects` - 17 edges
4. `esc()` - 15 edges
5. `pwGeneraMail()` - 15 edges
6. `new-project` - 14 edges
7. `pwMapRenderCantieri()` - 14 edges
8. `msEnsurePast()` - 13 edges
9. `msRender()` - 13 edges
10. `msApply()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `scripts/smoke_test.py` --references--> `#app-version (v18.182.1)`  [INFERRED]
  CLAUDE.md → src/head.html
- `#screen-weekly markup (pw tab bar)` --implements--> `Pianificazione Settimanale screen (pw*)`  [INFERRED]
  src/head.html → CLAUDE.md
- `#screen-mappa markup` --implements--> `Mappa screen (ml*, mappa-live.js)`  [INFERRED]
  src/head.html → CLAUDE.md
- `AI assistant widget (button + panel)` --references--> `Modal z-index ceiling (.modal-backdrop 100050)`  [EXTRACTED]
  src/head.html → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Integrazione Jira via Edge Functions** — readme_jira_create_subtask, readme_jira_list_epics_tasks, readme_jira_task_status, readme_jira_sync_worklogs, readme_jira_update_production, readme_jira_list_strumenti [EXTRACTED 1.00]
- **Meteo cantieri (previsioni, criticita', storico)** — readme_open_meteo, readme_bollettino_protezione_civile, readme_widget_criticita_meteo, readme_storico_meteo, readme_schermata_mappa [EXTRACTED 1.00]
- **Stack cartografico e geocoding** — readme_geo_cache, readme_nominatim, readme_carto_voyager_tiles, readme_satellite_default, readme_sentinella_non_trovato [INFERRED 0.85]
- **Four staffing_state sync domains (core, planning, ferie, dw)** — claude_state_pipeline, claude_state_operatori, claude_pwdata, claude_pwferie, claude_doppia_week, claude_staffing_state_table [EXTRACTED 1.00]
- **Modal layering under the .modal-backdrop ceiling** — src_head_modal_backdrop, src_head_modal_root, src_head_sb_admin_modals, src_head_ai_assistant_widget, src_head_ml_drawer_css, claude_modal_zindex_ceiling [INFERRED 0.85]
- **Build and release pipeline** — claude_build_py, claude_smoke_test, claude_deploy_workflow, claude_github_pages, src_head [EXTRACTED 1.00]
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **New-Project Scaffolding Artifacts** — claude_skills_new_project_skill_new_project_skill, claude_skills_new_project_skill_agents_md_scaffold, claude_skills_new_project_skill_claude_md_scaffold, claude_skills_new_project_skill_license_default, claude_skills_new_project_references_gitignore_templates_base_block [EXTRACTED 1.00]

## Communities (98 total, 37 thin omitted)

### Community 0 - "Storico meteo"
Cohesion: 0.06
Nodes (74): METEO_DESCR, _meteoStorico, meteoTodayISO(), MS_COLS, MS_PC_RANK, MS_SEV_LABEL, msAddDays(), _msAllRows (+66 more)

### Community 1 - "Auth e sync Supabase"
Cohesion: 0.06
Nodes (60): checkForNewVersion(), PW_TAB_KEYS, SB_PAGE_LABELS, sbAllPageKeys(), sbApplyPageVisibility(), sbApplyReadOnlyBanner(), sbApplyUserRole(), sbCallAdminUsers() (+52 more)

### Community 2 - "Funzionalità app (README)"
Cohesion: 0.05
Nodes (59): admin-users Edge Function (service_role, create/list/delete users), Assistente AI in-app, Attestati & scadenze, Backup notturno pg_cron (run_nightly_backup / data_backups), Bollettino Protezione Civile, Tile stradali CARTO Voyager (mapStreetLayer), Documenti commesse (bucket commesse-docs), Controllo Produzione (+51 more)

### Community 3 - "Mail squadre e ferie"
Cohesion: 0.08
Nodes (50): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellAttivitaAt(), pwCellAttivitaElenco(), pwCellAttivitaRaw(), pwCellCantieri(), pwCellCantieriRaw() (+42 more)

### Community 4 - "Sottotask Jira da Griglia"
Cohesion: 0.09
Nodes (50): PW_JIRA_EXTRA_FIELD_LABELS, _pwExtraFieldsByKey, pwExtraFieldSelectOpen(), pwExtraFieldSelectPick(), pwJiraActivityTypeGuess(), pwJiraBackButtonHtml(), pwJiraBuildSubtaskItem(), pwJiraComputeOriginalEstimate() (+42 more)

### Community 5 - "Ricerca squadre"
Cohesion: 0.10
Nodes (48): _ricercaSquadre, RS_STATI, rsAddTappa(), _rsBadgeHtml(), _rsBuildSquadre(), rsCalcola(), _rsChipsHtml(), _rsCloseDropdowns() (+40 more)

### Community 6 - "Mappa squadre settimanale"
Cohesion: 0.09
Nodes (41): commessaRegione(), _geoCache, _geoCacheSaveSingle(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapCollapsedRegioniOp, _mapColor() (+33 more)

### Community 7 - "Helper modali e CRUD"
Cohesion: 0.08
Nodes (35): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), HELP_TEXTS, isOperatoreLicenziato() (+27 more)

### Community 8 - "Meteo Griglia"
Cohesion: 0.11
Nodes (33): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), meteoGeoFor(), meteoPosKey(), _pcCache, _pcCacheSave() (+25 more)

### Community 9 - "Attestati operatori"
Cohesion: 0.12
Nodes (33): attBadgeHtml(), attBadgesHtml(), attClasseStato(), attDataBreve(), attEtichettaMancanza(), attExcelData(), _attFiltri, attFoglio() (+25 more)

### Community 10 - "Assistente AI"
Cohesion: 0.11
Nodes (28): AI_PROVIDER_DEFAULT_MODEL, aiAppendMessage(), aiCheckStatus(), aiConfigCall(), aiConfigMsg(), aiConfigOpen(), aiConfigPopulate(), aiConfigRevokeKey() (+20 more)

### Community 11 - "Mappa live stato Task"
Cohesion: 0.08
Nodes (29): ML_COMM_SORT, ML_DAY_SHORT, ML_STATI_FILTRO, ML_STATUS_COLORS, ML_STATUS_LABELS, mlCommessaDocsHtml(), mlCommessaHtml(), mlCommessaMetaHtml() (+21 more)

### Community 12 - "Strumenti Jira squadra"
Cohesion: 0.11
Nodes (17): pwAddSquadra(), pwAddStrumento(), pwFornStrFromKey(), pwFornStrKey(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira() (+9 more)

### Community 13 - "Pianifica spostamenti"
Cohesion: 0.18
Nodes (25): _pwSpost, _pwSpost2opt(), _pwSpostBuildOrder(), pwSpostCalcola(), pwSpostClear(), _pwSpostCoordString(), _pwSpostCost(), pwSpostDrawMap() (+17 more)

### Community 14 - "Skill new-project gitignore"
Cohesion: 0.08
Nodes (22): Base (sempre incluso), Go (indicatore: go.mod), Java (indicatori: pom.xml, build.gradle), .NET (indicatori: *.csproj, *.sln), Node (indicatore: package.json), Python (indicatori: requirements.txt, pyproject.toml, Pipfile), Rust (indicatore: Cargo.toml), Template .gitignore per stack (+14 more)

### Community 15 - "Controllo Produzione"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 16 - "Distanze e province"
Cohesion: 0.12
Nodes (22): ANNO, ATTESTATI_COLONNE, ATTESTATI_DURATA, distanzaLavorazione(), distanzaProvince(), DPI_DEFAULT, haversineKm(), INDUSTRIES (+14 more)

### Community 17 - "DPI operatori"
Cohesion: 0.19
Nodes (19): dpiBindModaleOperatore(), dpiDurataMesi(), _dpiFiltri, dpiIsValido(), dpiNonCoperti(), dpiRichiestiPerOperatore(), dpiRigaModaleOperatore(), dpiRigheMatrice() (+11 more)

### Community 18 - "Commessa attiva e documenti"
Cohesion: 0.19
Nodes (15): _cmAlertAsync(), cmDeleteDocumento(), _cmDocSanitizeNome(), cmDocsBindListHandlers(), _cmDocsListHtml(), cmDocsRefresh(), cmDownloadDocumento(), _cmFmtFileSize() (+7 more)

### Community 19 - "Limitazioni visite mediche"
Cohesion: 0.18
Nodes (16): exportLimitazioniXlsx(), limBadgeOpCard(), limDescrizioneRegistro(), _limFiltri, limFoglio(), limImportFile(), limImportParseWorkbook(), limImportPick() (+8 more)

### Community 20 - "Edge Function sottotask"
Cohesion: 0.19
Nodes (15): collectTempoTeams(), CORS_HEADERS, fetchKnownExtraFields(), fetchTempoTeamValues(), findExistingSubtask(), JIRA_BASE_URL, jiraAuthHeader(), jiraGet() (+7 more)

### Community 21 - "Anagrafica operatori"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 22 - "Skill checkpoint e new-project"
Cohesion: 0.14
Nodes (16): checkpoint, Gotchas, Resume flow, Save flow, Single-Use Checkpoint Design, Storage, Gitignore Base Block, Gitignore Node Block (+8 more)

### Community 23 - "Fornitori"
Cohesion: 0.29
Nodes (16): addFornitore(), addFornitoreDipendente(), addFornitoreStrumento(), deleteFornitore(), fornGenId(), removeFornitoreDipendente(), removeFornitoreStrumento(), renderFornitoreCard() (+8 more)

### Community 24 - "Render Griglia e modale operatore"
Cohesion: 0.21
Nodes (13): fornDipendenteByNome(), pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), passaFiltroSkillAttestati(), pwOperatoreGeoLabel() (+5 more)

### Community 25 - "Mappa live toolbar filtri"
Cohesion: 0.21
Nodes (16): mlApplyFilters(), mlApplyFiltroStato(), mlBindSearchColonna(), mlBindToolbar(), mlClearFiltri(), mlCloseDrawer(), mlGeoPending(), mlRegioneCantiere() (+8 more)

### Community 26 - "Mappa live marker dettaglio"
Cohesion: 0.18
Nodes (15): mlBindGeoFix(), mlBindGriglia(), mlDrawMarkers(), mlFocusGruppo(), mlGeo(), mlGeoFixSubmit(), mlGoToGriglia(), mlKpiNoGeoHtml() (+7 more)

### Community 27 - "Domini sync e dati"
Cohesion: 0.15
Nodes (14): Mappa screen (ml*, mappa-live.js), mlOnDataChanged, pwData[anno][week], pwFerie[anno][week], sbPull (Realtime auto-pull), staffing_state table, state.operatori[], state.pipeline / commesse_attive / commesse_attive_meta (+6 more)

### Community 28 - "Modifica celle Griglia"
Cohesion: 0.22
Nodes (10): pwAddCantiereField(), pwCantiereCellOf(), pwOpenSearchResultsModal(), pwRemoveCantiereField(), _pwSearchMatches, pwSearchOp(), pwTitleCase(), pwToggleStatPopover() (+2 more)

### Community 29 - "Sistema colori categorici"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 30 - "Assegnazioni operatori"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 31 - "Atlante campi Jira"
Cohesion: 0.20
Nodes (12): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Template A - Rilievi classico (14 progetti) (+4 more)

### Community 32 - "Struttura index.html"
Cohesion: 0.17
Nodes (12): Unified --accent design token (teal) replacing two divergent hex teals, App version v18.147.0, Dashboard Staffing — Pipeline Commerciale (app), index.html as generated build artifact, pw-tab-controllo (Controllo Produzione tab), pw-tab-doppia (Doppia Week tab), pw-tab-ferie (Ferie / Permessi tab), pw-tab-griglia (Griglia settimanale tab) (+4 more)

### Community 33 - "Storage e stato locale"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 34 - "Collapse Controllo Produzione"
Cohesion: 0.33
Nodes (10): cpApplyCollapse(), cpCollapseAllToggle(), cpGoToFirstMatch(), cpSearchOp(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle() (+2 more)

### Community 35 - "Report produzione CSV"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 36 - "Copia incolla celle"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 37 - "Modali e ruoli"
Cohesion: 0.22
Nodes (9): Supabase Auth roles (sbIsAdmin), Modal z-index ceiling (.modal-backdrop 100050), No native alert/confirm/prompt convention, Mappa ml-* CSS (drawer position:absolute), .modal-backdrop CSS class, #modal-root, body.pw-readonly .pw-write-action CSS, sb-* admin modals (pwd, log, sessions, backups, users, guestpages) (+1 more)

### Community 38 - "Edge Function Jira (doc)"
Cohesion: 0.28
Nodes (9): Controllo Produzione (cp*), jira-list-epics / jira-list-tasks / jira-create-subtask, Jira Edge Functions bridge, jira-list-strumenti, jira-sync-worklogs, jira-task-status, jira-update-production (delta model, per ticket), v18.31.0 modello delta KM/Cad (write only diff vs last written value) (+1 more)

### Community 39 - "Import anagrafica"
Cohesion: 0.36
Nodes (6): anagImportFile(), anagImportParseWorkbook(), anagImportPick(), anagImportShowConfirm(), anagNormComune(), anagNormProvincia()

### Community 40 - "Edge Function stato Task"
Cohesion: 0.36
Nodes (8): chunked(), CORS_HEADERS, JIRA_BASE_URL, jiraAuthHeader(), jiraPost(), jiraSearch(), jqlEscape(), json()

### Community 41 - "Build smoke test deploy"
Cohesion: 0.32
Nodes (8): scripts/build.py (index.html generator), Deploy workflow (backup, build, smoke test, push to Pages), GitHub Pages hosting, Avoid nested template literals, Escape onclick strings via jsAttr()/esc(), scripts/smoke_test.py, src/head.html (head, CSS, body markup), #app-version (v18.182.1)

### Community 42 - "Schermate e navigazione"
Cohesion: 0.25
Nodes (8): Dashboard screen, Doppia Week (dw*), Open-Meteo weather API, switchScreen (dashboard/weekly/mappa), Pianificazione Settimanale screen (pw*), v18.33.0 Doppia Week tab (consecutive double-week away assignments), AI assistant widget (button + panel), #screen-weekly markup (pw tab bar)

### Community 43 - "Mappa live meteo e date"
Cohesion: 0.29
Nodes (8): mlDateISO(), mlDates(), mlEnsureStrumenti(), mlInvalidateItems(), mlIsActive(), mlOnDataChanged(), mlRefreshMeteo(), mlRenderDays()

### Community 44 - "Mappa live auto-refresh"
Cohesion: 0.29
Nodes (8): mlEnter(), mlGoToday(), mlInit(), mlJiraCacheLoad(), mlStartAutoRefresh(), mlStopAutoRefresh(), mlTodayRef(), mlToggleAuto()

### Community 45 - "Doppia Week"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 46 - "Tab e layer mappa"
Cohesion: 0.39
Nodes (7): mapAddSatelliteToggle(), mapPreferredBase(), mapStreetLayer(), _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 47 - "Geocoding e routing"
Cohesion: 0.29
Nodes (7): _geoCache / geo_cache table, Geocoding not-found sentinel (0,0 '[non trovato]'), mlGeo (geo sentinel filter), OSRM routing, Nominatim geocoding, v18.111.0 Pianifica spostamenti tab (route optimizer via OSRM), Ricerca Squadre feature (team proposal by distance/skill, issue #6)

### Community 48 - "Import export xlsx"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 49 - "Mappa live costruzione item"
Cohesion: 0.29
Nodes (7): mlBuildItems(), mlBuildItemsCached(), mlCantieriDiCommessa(), mlRenderToolbar(), mlScopeWeeks(), mlWeekData(), mlWeekLabel()

### Community 50 - "Mappa live dettaglio cantiere"
Cohesion: 0.29
Nodes (7): mlDettaglioHtml(), mlGroupByCantiere(), mlMeteoHtml(), mlProduzioneHtml(), mlStatoGruppo(), mlTaskHtml(), mlTasksOf()

### Community 51 - "Backup e ripristino"
Cohesion: 0.40
Nodes (6): Backup e ripristino dati section, v18.116.0 Backup dati — ripristino da UI admin, data_backups table (30-day retention snapshots), nightly_staffing_backup pg_cron job (02:00 UTC), restore_backup(backup_id, include_cp) RPC, run_nightly_backup() function

### Community 52 - "Smoke test ESLint"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 53 - "Setup Supabase GitHub"
Cohesion: 0.33
Nodes (5): Legacy sessionStorage keys migration, GitHub Pages deployment steps, RLS policies allow_read/allow_write, SB_URL/SB_ANON_KEY setup instructions, Guide: create staffing_state table

### Community 54 - "Render commesse"
Cohesion: 0.53
Nodes (5): _confrontoMeseSel, getNomiCommesseAttive(), renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 55 - "Mappa live commesse"
Cohesion: 0.40
Nodes (6): mlBindCommessa(), mlLoadProduzioneCommessa(), mlOpenCommessa(), mlRenderCommessaCantieri(), mlRenderCommessaStati(), mlRenderCommesseList()

### Community 56 - "Stack tecnico"
Cohesion: 0.40
Nodes (5): Gestione Staffing web app (index.html), mapAddSatelliteToggle (Esri default), mapStreetLayer (CARTO Voyager tiles), Supabase backend (Postgres, Auth, Realtime, Edge Functions), CDN libraries (Tailwind, SheetJS, jsPDF, Leaflet, supabase-js)

### Community 57 - "Celle staffing inline"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 58 - "Script build"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

## Ambiguous Edges - Review These
- `Stack tecnico (Tailwind, Chart.js, Leaflet.js, Supabase, GitHub Pages)` → `v18.58.0 removed unused sortablejs/chart.js CDN references`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **221 isolated node(s):** `Base (sempre incluso)`, `Go (indicatore: go.mod)`, `Java (indicatori: pom.xml, build.gradle)`, `.NET (indicatori: *.csproj, *.sln)`, `Node (indicatore: package.json)` (+216 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Stack tecnico (Tailwind, Chart.js, Leaflet.js, Supabase, GitHub Pages)` and `v18.58.0 removed unused sortablejs/chart.js CDN references`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `esc()` connect `Helper modali e CRUD` to `Storico meteo`, `Sottotask Jira da Griglia`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `msOperatoriHtml()` connect `Storico meteo` to `Helper modali e CRUD`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `pwJiraSubtaskRenderPreview()` connect `Sottotask Jira da Griglia` to `Helper modali e CRUD`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `esc()` (e.g. with `msOperatoriHtml()` and `listBox()`) actually correct?**
  _`esc()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Base (sempre incluso)`, `Go (indicatore: go.mod)`, `Java (indicatori: pom.xml, build.gradle)` to the rest of the system?**
  _221 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Storico meteo` be split into smaller, more focused modules?**
  _Cohesion score 0.0645045045045045 - nodes in this community are weakly interconnected._