# Graph Report - Gestione-Staffing  (2026-09-29)

## Corpus Check
- 56 files · ~309,154 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1240 nodes · 2212 edges · 97 communities (60 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f3a73568`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- meteo-storico.js
- sb-admin.js
- Dashboard Staffing Eagleprojects
- Mail squadre e ferie
- weekly-jira-subtask.js
- weekly-ricerca-squadre.js
- weekly-mappa.js
- Helper modali e CRUD
- weekly-meteo.js
- dashboard-attestati.js
- ai-assistant.js
- mappa-live.js
- weekly-strumenti.js
- weekly-spostamenti.js
- new-project
- produzione-core.js
- config.js
- dashboard-dpi-admin.js
- dashboard-commessa-attiva.js
- dashboard-limitazioni.js
- jira-create-subtask/index.ts
- dashboard-operatori.js
- New-Project Skill
- dashboard-fornitori.js
- weekly-operatore-modal.js
- mlRender
- mlOpenKpi
- Mappa screen (ml*, mappa-live.js)
- weekly-popover-stats.js
- Categorical Color System (colori categorici)
- dashboard-assegnazioni.js
- Atlante Campi Jira (Eagleprojects)
- Dashboard Staffing — Pipeline Commerciale (app)
- storage-utils.js
- weekly-collapse-cp.js
- produzione-report.js
- weekly-clipboard-cantiere.js
- Modal z-index ceiling (.modal-backdrop 100050)
- Jira Edge Functions bridge
- dashboard-anagrafica-import.js
- jira-task-status/index.ts
- scripts/smoke_test.py
- Pianificazione Settimanale screen (pw*)
- mlDates
- mlEnter
- weekly-doppiaweek.js
- weekly-nav.js
- _geoCache / geo_cache table
- dashboard-import-export.js
- mlRangeBounds
- mlDettaglioHtml
- Backup e ripristino dati section
- smoke_test.py
- SETUP_SUPABASE_GITHUB.md
- dashboard-commesse.js
- Supabase backend (Postgres, Auth, Realtime, Edge Functions)
- dashboard-staffing-celle.js
- build_bytes
- apriDettaglioMeseCommessa
- dashboard-gantt.js
- dashboard-kpi.js
- dashboard-alerts-render.js
- La Regola del Bagliore Vietato
- Capabilities and Constraints
- Checkpoint Skill
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
- Mappa Squadre feature (Cantieri/Residenze dual map)
- v18.137.0 generic confirm/alert modal z-index fix (behind Gestione utenti)
- v18.114.0 confirm/alert modal z-index bumped to 10050 above Leaflet controls
- v18.125.0 op-card drag cursor made visible via inline SVG
- v18.13.0 replaced all native confirm()/alert() with custom modals (31 spots)
- v18.142.0 disabled/greyed write buttons for Operatore/Guest roles
- v18.147.0 Griglia action buttons moved next to Collassa, sticky bar
- v18.14.0 removed duplicate switchScreen, unified global function
- v18.15.0 multi-domain sync split (core/planning/ferie) with granular conflict detection
- v18.16.0 Supabase Realtime auto-pull when another user saves
- v18.17.0 removed hardcoded INITIAL_DATA seed (52KB to 0.5KB)
- v18.18.0/18.1 esc() HTML escaping across 25+ template literals
- v18.25.0 Controllo Produzione Report PDF (jsPDF+autotable)
- v18.41.0 jsAttr() hardening + smoke test introduced
- v18.69.0 /impeccable-guided restyling (unified accent teal, Inter font actually loaded)
- v18.99.0 'new version available' notification banner

## God Nodes (most connected - your core abstractions)
1. `mlRender()` - 31 edges
2. `pwJiraSubtaskOpenComuniModal()` - 17 edges
3. `Dashboard Staffing Eagleprojects` - 17 edges
4. `pwGeneraMail()` - 15 edges
5. `esc()` - 15 edges
6. `pwMapRenderCantieri()` - 14 edges
7. `new-project` - 14 edges
8. `msApply()` - 13 edges
9. `msEnsurePast()` - 13 edges
10. `msRender()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `#screen-mappa markup` --implements--> `Mappa screen (ml*, mappa-live.js)`  [INFERRED]
  src/head.html → CLAUDE.md
- `sb-* admin modals (pwd, log, sessions, backups, users, guestpages)` --conceptually_related_to--> `Modal z-index ceiling (.modal-backdrop 100050)`  [INFERRED]
  src/head.html → CLAUDE.md
- `AI assistant widget (button + panel)` --references--> `Modal z-index ceiling (.modal-backdrop 100050)`  [EXTRACTED]
  src/head.html → CLAUDE.md
- `scripts/smoke_test.py` --references--> `#app-version (v18.182.1)`  [INFERRED]
  CLAUDE.md → src/head.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Build and release pipeline** — claude_build_py, claude_smoke_test, claude_deploy_workflow, claude_github_pages, src_head [EXTRACTED 1.00]
- **Four staffing_state sync domains (core, planning, ferie, dw)** — claude_state_pipeline, claude_state_operatori, claude_pwdata, claude_pwferie, claude_doppia_week, claude_staffing_state_table [EXTRACTED 1.00]
- **New-Project Scaffolding Artifacts** — claude_skills_new_project_skill_new_project_skill, claude_skills_new_project_skill_agents_md_scaffold, claude_skills_new_project_skill_claude_md_scaffold, claude_skills_new_project_skill_license_default, claude_skills_new_project_references_gitignore_templates_base_block [EXTRACTED 1.00]
- **Integrazione Jira via Edge Functions** — readme_jira_create_subtask, readme_jira_list_epics_tasks, readme_jira_task_status, readme_jira_sync_worklogs, readme_jira_update_production, readme_jira_list_strumenti [EXTRACTED 1.00]
- **Meteo cantieri (previsioni, criticita', storico)** — readme_open_meteo, readme_bollettino_protezione_civile, readme_widget_criticita_meteo, readme_storico_meteo, readme_schermata_mappa [EXTRACTED 1.00]
- **Modal layering under the .modal-backdrop ceiling** — src_head_modal_backdrop, src_head_modal_root, src_head_sb_admin_modals, src_head_ai_assistant_widget, src_head_ml_drawer_css, claude_modal_zindex_ceiling [INFERRED 0.85]
- **Stack cartografico e geocoding** — readme_geo_cache, readme_nominatim, readme_carto_voyager_tiles, readme_satellite_default, readme_sentinella_non_trovato [INFERRED 0.85]

## Communities (97 total, 37 thin omitted)

### Community 0 - "meteo-storico.js"
Cohesion: 0.06
Nodes (74): METEO_DESCR, _meteoStorico, meteoTodayISO(), MS_COLS, MS_PC_RANK, MS_SEV_LABEL, msAddDays(), _msAllRows (+66 more)

### Community 1 - "sb-admin.js"
Cohesion: 0.06
Nodes (60): checkForNewVersion(), PW_TAB_KEYS, SB_PAGE_LABELS, sbAllPageKeys(), sbApplyPageVisibility(), sbApplyReadOnlyBanner(), sbApplyUserRole(), sbCallAdminUsers() (+52 more)

### Community 2 - "Dashboard Staffing Eagleprojects"
Cohesion: 0.05
Nodes (59): admin-users Edge Function (service_role, create/list/delete users), Assistente AI in-app, Attestati & scadenze, Backup notturno pg_cron (run_nightly_backup / data_backups), Bollettino Protezione Civile, Tile stradali CARTO Voyager (mapStreetLayer), Documenti commesse (bucket commesse-docs), Controllo Produzione (+51 more)

### Community 3 - "Mail squadre e ferie"
Cohesion: 0.08
Nodes (50): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellAttivitaAt(), pwCellAttivitaElenco(), pwCellAttivitaRaw(), pwCellCantieri(), pwCellCantieriRaw() (+42 more)

### Community 4 - "weekly-jira-subtask.js"
Cohesion: 0.09
Nodes (50): PW_JIRA_EXTRA_FIELD_LABELS, _pwExtraFieldsByKey, pwExtraFieldSelectOpen(), pwExtraFieldSelectPick(), pwJiraActivityTypeGuess(), pwJiraBackButtonHtml(), pwJiraBuildSubtaskItem(), pwJiraComputeOriginalEstimate() (+42 more)

### Community 5 - "weekly-ricerca-squadre.js"
Cohesion: 0.10
Nodes (48): _ricercaSquadre, RS_STATI, rsAddTappa(), _rsBadgeHtml(), _rsBuildSquadre(), rsCalcola(), _rsChipsHtml(), _rsCloseDropdowns() (+40 more)

### Community 6 - "weekly-mappa.js"
Cohesion: 0.09
Nodes (41): commessaRegione(), _geoCache, _geoCacheSaveSingle(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapCollapsedRegioniOp, _mapColor() (+33 more)

### Community 7 - "Helper modali e CRUD"
Cohesion: 0.08
Nodes (35): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), HELP_TEXTS, isOperatoreLicenziato() (+27 more)

### Community 8 - "weekly-meteo.js"
Cohesion: 0.11
Nodes (33): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), meteoGeoFor(), meteoPosKey(), _pcCache, _pcCacheSave() (+25 more)

### Community 9 - "dashboard-attestati.js"
Cohesion: 0.12
Nodes (33): attBadgeHtml(), attBadgesHtml(), attClasseStato(), attDataBreve(), attEtichettaMancanza(), attExcelData(), _attFiltri, attFoglio() (+25 more)

### Community 10 - "ai-assistant.js"
Cohesion: 0.11
Nodes (28): AI_PROVIDER_DEFAULT_MODEL, aiAppendMessage(), aiCheckStatus(), aiConfigCall(), aiConfigMsg(), aiConfigOpen(), aiConfigPopulate(), aiConfigRevokeKey() (+20 more)

### Community 11 - "mappa-live.js"
Cohesion: 0.08
Nodes (35): ML_COMM_SORT, ML_DAY_SHORT, ML_STATI_FILTRO, ML_STATUS_COLORS, ML_STATUS_LABELS, mlBindCommessa(), mlCantieriDiCommessa(), mlCommessaDocsHtml() (+27 more)

### Community 12 - "weekly-strumenti.js"
Cohesion: 0.11
Nodes (17): pwAddSquadra(), pwAddStrumento(), pwFornStrFromKey(), pwFornStrKey(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira() (+9 more)

### Community 13 - "weekly-spostamenti.js"
Cohesion: 0.18
Nodes (25): _pwSpost, _pwSpost2opt(), _pwSpostBuildOrder(), pwSpostCalcola(), pwSpostClear(), _pwSpostCoordString(), _pwSpostCost(), pwSpostDrawMap() (+17 more)

### Community 14 - "new-project"
Cohesion: 0.08
Nodes (22): Base (sempre incluso), Go (indicatore: go.mod), Java (indicatori: pom.xml, build.gradle), .NET (indicatori: *.csproj, *.sln), Node (indicatore: package.json), Python (indicatori: requirements.txt, pyproject.toml, Pipfile), Rust (indicatore: Cargo.toml), Template .gitignore per stack (+14 more)

### Community 15 - "produzione-core.js"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 16 - "config.js"
Cohesion: 0.12
Nodes (22): ANNO, ATTESTATI_COLONNE, ATTESTATI_DURATA, distanzaLavorazione(), distanzaProvince(), DPI_DEFAULT, haversineKm(), INDUSTRIES (+14 more)

### Community 17 - "dashboard-dpi-admin.js"
Cohesion: 0.19
Nodes (19): dpiBindModaleOperatore(), dpiDurataMesi(), _dpiFiltri, dpiIsValido(), dpiNonCoperti(), dpiRichiestiPerOperatore(), dpiRigaModaleOperatore(), dpiRigheMatrice() (+11 more)

### Community 18 - "dashboard-commessa-attiva.js"
Cohesion: 0.19
Nodes (15): _cmAlertAsync(), cmDeleteDocumento(), _cmDocSanitizeNome(), cmDocsBindListHandlers(), _cmDocsListHtml(), cmDocsRefresh(), cmDownloadDocumento(), _cmFmtFileSize() (+7 more)

### Community 19 - "dashboard-limitazioni.js"
Cohesion: 0.18
Nodes (16): exportLimitazioniXlsx(), limBadgeOpCard(), limDescrizioneRegistro(), _limFiltri, limFoglio(), limImportFile(), limImportParseWorkbook(), limImportPick() (+8 more)

### Community 20 - "jira-create-subtask/index.ts"
Cohesion: 0.19
Nodes (15): collectTempoTeams(), CORS_HEADERS, fetchKnownExtraFields(), fetchTempoTeamValues(), findExistingSubtask(), JIRA_BASE_URL, jiraAuthHeader(), jiraGet() (+7 more)

### Community 21 - "dashboard-operatori.js"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 22 - "New-Project Skill"
Cohesion: 0.14
Nodes (16): checkpoint, Gotchas, Resume flow, Save flow, Single-Use Checkpoint Design, Storage, Gitignore Base Block, Gitignore Node Block (+8 more)

### Community 23 - "dashboard-fornitori.js"
Cohesion: 0.29
Nodes (16): addFornitore(), addFornitoreDipendente(), addFornitoreStrumento(), deleteFornitore(), fornGenId(), removeFornitoreDipendente(), removeFornitoreStrumento(), renderFornitoreCard() (+8 more)

### Community 24 - "weekly-operatore-modal.js"
Cohesion: 0.21
Nodes (13): fornDipendenteByNome(), pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), passaFiltroSkillAttestati(), pwOperatoreGeoLabel() (+5 more)

### Community 25 - "mlRender"
Cohesion: 0.18
Nodes (19): mlApplyFilters(), mlApplyFiltroStato(), mlBindSearchColonna(), mlBindToolbar(), mlClearFiltri(), mlCloseDrawer(), mlGeoPending(), mlRangeSave() (+11 more)

### Community 26 - "mlOpenKpi"
Cohesion: 0.17
Nodes (16): mlBindGeoFix(), mlBindGriglia(), mlDrawMarkers(), mlFocusGruppo(), mlGeo(), mlGeoFixSubmit(), mlGoToGriglia(), mlKpiNoGeoHtml() (+8 more)

### Community 27 - "Mappa screen (ml*, mappa-live.js)"
Cohesion: 0.15
Nodes (14): Mappa screen (ml*, mappa-live.js), mlOnDataChanged, pwData[anno][week], pwFerie[anno][week], sbPull (Realtime auto-pull), staffing_state table, state.operatori[], state.pipeline / commesse_attive / commesse_attive_meta (+6 more)

### Community 28 - "weekly-popover-stats.js"
Cohesion: 0.22
Nodes (10): pwAddCantiereField(), pwCantiereCellOf(), pwOpenSearchResultsModal(), pwRemoveCantiereField(), _pwSearchMatches, pwSearchOp(), pwTitleCase(), pwToggleStatPopover() (+2 more)

### Community 29 - "Categorical Color System (colori categorici)"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 30 - "dashboard-assegnazioni.js"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 31 - "Atlante Campi Jira (Eagleprojects)"
Cohesion: 0.20
Nodes (12): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Template A - Rilievi classico (14 progetti) (+4 more)

### Community 32 - "Dashboard Staffing — Pipeline Commerciale (app)"
Cohesion: 0.17
Nodes (12): Unified --accent design token (teal) replacing two divergent hex teals, App version v18.147.0, Dashboard Staffing — Pipeline Commerciale (app), index.html as generated build artifact, pw-tab-controllo (Controllo Produzione tab), pw-tab-doppia (Doppia Week tab), pw-tab-ferie (Ferie / Permessi tab), pw-tab-griglia (Griglia settimanale tab) (+4 more)

### Community 33 - "storage-utils.js"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 34 - "weekly-collapse-cp.js"
Cohesion: 0.33
Nodes (10): cpApplyCollapse(), cpCollapseAllToggle(), cpGoToFirstMatch(), cpSearchOp(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle() (+2 more)

### Community 35 - "produzione-report.js"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 36 - "weekly-clipboard-cantiere.js"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 37 - "Modal z-index ceiling (.modal-backdrop 100050)"
Cohesion: 0.22
Nodes (9): Supabase Auth roles (sbIsAdmin), Modal z-index ceiling (.modal-backdrop 100050), No native alert/confirm/prompt convention, Mappa ml-* CSS (drawer position:absolute), .modal-backdrop CSS class, #modal-root, body.pw-readonly .pw-write-action CSS, sb-* admin modals (pwd, log, sessions, backups, users, guestpages) (+1 more)

### Community 38 - "Jira Edge Functions bridge"
Cohesion: 0.28
Nodes (9): Controllo Produzione (cp*), jira-list-epics / jira-list-tasks / jira-create-subtask, Jira Edge Functions bridge, jira-list-strumenti, jira-sync-worklogs, jira-task-status, jira-update-production (delta model, per ticket), v18.31.0 modello delta KM/Cad (write only diff vs last written value) (+1 more)

### Community 39 - "dashboard-anagrafica-import.js"
Cohesion: 0.36
Nodes (6): anagImportFile(), anagImportParseWorkbook(), anagImportPick(), anagImportShowConfirm(), anagNormComune(), anagNormProvincia()

### Community 40 - "jira-task-status/index.ts"
Cohesion: 0.36
Nodes (8): chunked(), CORS_HEADERS, JIRA_BASE_URL, jiraAuthHeader(), jiraPost(), jiraSearch(), jqlEscape(), json()

### Community 41 - "scripts/smoke_test.py"
Cohesion: 0.32
Nodes (8): scripts/build.py (index.html generator), Deploy workflow (backup, build, smoke test, push to Pages), GitHub Pages hosting, Avoid nested template literals, Escape onclick strings via jsAttr()/esc(), scripts/smoke_test.py, src/head.html (head, CSS, body markup), #app-version (v18.182.1)

### Community 42 - "Pianificazione Settimanale screen (pw*)"
Cohesion: 0.25
Nodes (8): Dashboard screen, Doppia Week (dw*), Open-Meteo weather API, switchScreen (dashboard/weekly/mappa), Pianificazione Settimanale screen (pw*), v18.33.0 Doppia Week tab (consecutive double-week away assignments), AI assistant widget (button + panel), #screen-weekly markup (pw tab bar)

### Community 43 - "mlDates"
Cohesion: 0.29
Nodes (8): mlDateISO(), mlDates(), mlEnsureStrumenti(), mlInvalidateItems(), mlIsActive(), mlOnDataChanged(), mlRefreshMeteo(), mlRenderDays()

### Community 44 - "mlEnter"
Cohesion: 0.25
Nodes (9): mlEnter(), mlGoToday(), mlInit(), mlJiraCacheLoad(), mlRangeLoad(), mlStartAutoRefresh(), mlStopAutoRefresh(), mlTodayRef() (+1 more)

### Community 45 - "weekly-doppiaweek.js"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 46 - "weekly-nav.js"
Cohesion: 0.39
Nodes (7): mapAddSatelliteToggle(), mapPreferredBase(), mapStreetLayer(), _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 47 - "_geoCache / geo_cache table"
Cohesion: 0.29
Nodes (7): _geoCache / geo_cache table, Geocoding not-found sentinel (0,0 '[non trovato]'), mlGeo (geo sentinel filter), OSRM routing, Nominatim geocoding, v18.111.0 Pianifica spostamenti tab (route optimizer via OSRM), Ricerca Squadre feature (team proposal by distance/skill, issue #6)

### Community 48 - "dashboard-import-export.js"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 49 - "mlRangeBounds"
Cohesion: 0.24
Nodes (12): mlIsoFmt(), mlIsoToLocalDate(), mlLoadProduzione(), mlLoadProduzioneRange(), mlLoadProduzioneStorico(), mlRangeBounds(), mlRangeDays(), mlRangeDaysOfWeek() (+4 more)

### Community 50 - "mlDettaglioHtml"
Cohesion: 0.20
Nodes (10): mlBuildItems(), mlBuildItemsCached(), mlDettaglioHtml(), mlGroupByCantiere(), mlMeteoHtml(), mlProduzioneHtml(), mlScopeKey(), mlStatoGruppo() (+2 more)

### Community 51 - "Backup e ripristino dati section"
Cohesion: 0.40
Nodes (6): Backup e ripristino dati section, v18.116.0 Backup dati — ripristino da UI admin, data_backups table (30-day retention snapshots), nightly_staffing_backup pg_cron job (02:00 UTC), restore_backup(backup_id, include_cp) RPC, run_nightly_backup() function

### Community 52 - "smoke_test.py"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 53 - "SETUP_SUPABASE_GITHUB.md"
Cohesion: 0.33
Nodes (5): Legacy sessionStorage keys migration, GitHub Pages deployment steps, RLS policies allow_read/allow_write, SB_URL/SB_ANON_KEY setup instructions, Guide: create staffing_state table

### Community 54 - "dashboard-commesse.js"
Cohesion: 0.53
Nodes (5): _confrontoMeseSel, getNomiCommesseAttive(), renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 56 - "Supabase backend (Postgres, Auth, Realtime, Edge Functions)"
Cohesion: 0.40
Nodes (5): Gestione Staffing web app (index.html), mapAddSatelliteToggle (Esri default), mapStreetLayer (CARTO Voyager tiles), Supabase backend (Postgres, Auth, Realtime, Edge Functions), CDN libraries (Tailwind, SheetJS, jsPDF, Leaflet, supabase-js)

### Community 57 - "dashboard-staffing-celle.js"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 58 - "build_bytes"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

## Ambiguous Edges - Review These
- `Stack tecnico (Tailwind, Chart.js, Leaflet.js, Supabase, GitHub Pages)` → `v18.58.0 removed unused sortablejs/chart.js CDN references`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **222 isolated node(s):** `ML_DAY_SHORT`, `_mlGeoFailed`, `ML_STATUS_COLORS`, `ML_STATUS_LABELS`, `ML_STATI_FILTRO` (+217 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Stack tecnico (Tailwind, Chart.js, Leaflet.js, Supabase, GitHub Pages)` and `v18.58.0 removed unused sortablejs/chart.js CDN references`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `esc()` connect `Helper modali e CRUD` to `meteo-storico.js`, `weekly-jira-subtask.js`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `msOperatoriHtml()` connect `meteo-storico.js` to `Helper modali e CRUD`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `Mappa screen (ml*, mappa-live.js)` connect `Mappa screen (ml*, mappa-live.js)` to `Pianificazione Settimanale screen (pw*)`, `Jira Edge Functions bridge`, `_geoCache / geo_cache table`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `esc()` (e.g. with `msOperatoriHtml()` and `listBox()`) actually correct?**
  _`esc()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ML_DAY_SHORT`, `_mlGeoFailed`, `ML_STATUS_COLORS` to the rest of the system?**
  _222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `meteo-storico.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0645045045045045 - nodes in this community are weakly interconnected._