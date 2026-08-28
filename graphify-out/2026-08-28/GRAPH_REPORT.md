# Graph Report - Gestione-Staffing  (2026-08-28)

## Corpus Check
- 38 files · ~135,773 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 532 nodes · 743 edges · 70 communities (33 shown, 37 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `88b88838`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- weekly-mail-core.js
- Persistence Architecture & Conventions
- Atlante Campi Jira (Eagleprojects)
- sb-admin.js
- dashboard-crud-helpers.js
- produzione-core.js
- weekly-strumenti.js
- config.js
- weekly-jira-subtask.js
- dashboard-operatori.js
- Dashboard Staffing (Eagleprojects app)
- weekly-meteo.js
- weekly-mappa.js
- sbPush
- Categorical Color System (colori categorici)
- dashboard-assegnazioni.js
- weekly-operatore-modal.js
- storage-utils.js
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
- Section: CONTROLLO PRODUZIONE
- v18.13.0 - Sostituiti confirm()/alert() nativi con modali custom
- dashboard-alerts-render.js
- La Regola del Bagliore Vietato
- jira-list-epics Edge Function (invocation)
- jira-list-strumenti Edge Function (invocation)
- jira-list-tasks Edge Function (invocation)
- pwJiraResolveCognome(op)
- sbLogin
- Section: PIANIFICAZIONE SETTIMANALE (JS)
- switchScreen(screen)
- Capabilities and Constraints
- v18.0.0 - Migrazione a Supabase + GitHub Pages
- v18.15.0 - Sync multi-dominio core/planning/ferie con conflict detection
- Inter font actually loaded via Google Fonts link (v18.69.0 fix)
- Deep Teal accent (#0d9488)
- No side-tab colored border rule
- pwSwitchTab(tab)
- sbSetLocal(k, v)
- showAlertModal(msg)
- showConfirmAsync(msg, btnLabel)
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
- v18.91.0 - Meteo cantieri e più cantieri per giorno in Griglia
- v18.92.0 - Copia/incolla cantiere e attività tra operatori in Griglia
- v18.94.0 - Conferma su azioni distruttive
- v18.96.0 - Mappa Squadre colonna raggruppata per commessa

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
10. `pwMapRender()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Legacy sessionStorage keys migration` --semantically_similar_to--> `INITIAL_DATA fallback constant`  [INFERRED] [semantically similar]
  SETUP_SUPABASE_GITHUB.md → CLAUDE.md
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `Atlante Campi Jira (Eagleprojects)` --semantically_similar_to--> `Sottotask Jira flow: extra required-fields discovery step`  [INFERRED] [semantically similar]
  docs/jira-custom-fields.md → index.html
- `sbPush()` --rationale_for--> `v18.50.0 - Fix bug sincronizzazione multi-utente sbPush conflitti`  [INFERRED]
  index.html → README.md
- `Sottotask Jira flow: extra required-fields discovery step` --conceptually_related_to--> `Jira createmeta / field-metadata API`  [INFERRED]
  index.html → docs/jira-custom-fields.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Jira subtask creation flow: epic/task selection, selective checkbox, extra required fields, preview, create** — index_html_pwjirafetchepics, index_html_pwjirafetchtasks, index_html_pwjirafetchextrafields, index_html_pwjirasubtaskopenextrafieldsmodal, index_html_pwjirasubtaskpreview, index_html_pwjiracreatesubtasks, readme_v18_88_0_creazione_sottotask_jira_griglia, readme_v18_93_0_fix_sottotask_jira_campi_obbligatori, readme_v18_95_0_selezione_sottotask [EXTRACTED 0.95]
- **Escaping & Modal Safety Conventions** — claude_showalertmodal, claude_showconfirmasync, claude_jsattr, claude_esc_function, claude_hard_won_conventions [EXTRACTED 1.00]
- **Four Independent Sync Domains** — claude_four_sync_domains, claude_staffing_state_table, claude_sbpush, claude_sbpull [EXTRACTED 1.00]
- **Jira Integration Edge Functions** — claude_jira_list_strumenti, claude_jira_sync_worklogs, claude_jira_update_production, claude_delta_model [EXTRACTED 1.00]
- **Four independent sync domains sharing the staffing_state Supabase table pattern** — claudemd_domain_core, claudemd_domain_planning, claudemd_domain_ferie, claudemd_domain_dw, index_html_sbpush, index_html_sbpull [INFERRED 0.85]

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

### Community 3 - "sb-admin.js"
Cohesion: 0.12
Nodes (25): sbChangePwd(), sbClosePwdModal(), _sbDirty, sbGenerateSessionId(), sbInit(), sbInitAndCheck(), sbIsAdmin(), sbLoadLog() (+17 more)

### Community 4 - "dashboard-crud-helpers.js"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 5 - "produzione-core.js"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 6 - "weekly-strumenti.js"
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

### Community 10 - "Dashboard Staffing (Eagleprojects app)"
Cohesion: 0.12
Nodes (16): sbLogActivity(action, details), Section: MAPPA LEAFLET + NOMINATIM, README Changelog, Dashboard Staffing (Eagleprojects app), Log attività admin panel, Mappa cantieri feature, Operatori (anagrafica) feature, Pianificazione settimanale feature (+8 more)

### Community 11 - "weekly-meteo.js"
Cohesion: 0.20
Nodes (16): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), pwApplyMeteoBadgesToDom(), pwFasceOrarieFor(), pwFetchMeteoRange(), pwMeteoIconFor() (+8 more)

### Community 12 - "weekly-mappa.js"
Cohesion: 0.21
Nodes (13): _geoCache, _geoCacheSave(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapColor(), _mapColors, _mapMarkers (+5 more)

### Community 13 - "sbPush"
Cohesion: 0.14
Nodes (9): Sync domain: core (SB_ROW_CORE / staffing_state row 1), Sync domain: dw (SB_ROW_DW / double-week), Sync domain: ferie (SB_ROW_FERIE / pwFerie), Sync domain: planning (SB_ROW_PLANNING / pwData), sbPush(), Section: DOPPIA WEEK (prospetto mensile), v18.47.2 - Fix sbPull non scriveva in local storage (griglia/ferie), v18.49.2 - Fix Doppia Week nessuna cache locale (+1 more)

### Community 14 - "Categorical Color System (colori categorici)"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 15 - "dashboard-assegnazioni.js"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 16 - "weekly-operatore-modal.js"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 17 - "storage-utils.js"
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

### Community 22 - "weekly-collapse-cp.js"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 23 - "weekly-doppiaweek.js"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 24 - "dashboard-import-export.js"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 25 - "smoke_test.py"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 26 - "dashboard-commesse.js"
Cohesion: 0.60
Nodes (4): _confrontoMeseSel, renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 27 - "dashboard-staffing-celle.js"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 28 - "weekly-nav.js"
Cohesion: 0.50
Nodes (4): _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 29 - "build_bytes"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

### Community 33 - "Section: CONTROLLO PRODUZIONE"
Cohesion: 0.67
Nodes (3): Section: CARICA REPORT PRODUZIONE (per squadra), Section: CONTROLLO PRODUZIONE, Controllo Produzione table styles (.cp-table)

## Ambiguous Edges - Review These
- `pwJiraResolveCognome(op)` → `Operator selection modal styles (.op-modal, .op-trigger-btn)`  [AMBIGUOUS]
  src/head.html · relation: conceptually_related_to

## Knowledge Gaps
- **103 isolated node(s):** `METEO_FASCE`, `_meteoCache`, `METEO_ICONS`, `pwData`, `pwDoppiaWeek` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `pwJiraResolveCognome(op)` and `Operator selection modal styles (.op-modal, .op-trigger-btn)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `esc()` connect `dashboard-crud-helpers.js` to `weekly-jira-subtask.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `pwJiraSubtaskOpenComuniModal()` connect `weekly-jira-subtask.js` to `dashboard-crud-helpers.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `esc()` (e.g. with `pwJiraSubtaskOpenComuniModal()` and `pwJiraSubtaskRenderPreview()`) actually correct?**
  _`esc()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `METEO_FASCE`, `_meteoCache`, `METEO_ICONS` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `weekly-mail-core.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1126984126984127 - nodes in this community are weakly interconnected._
- **Should `Persistence Architecture & Conventions` be split into smaller, more focused modules?**
  _Cohesion score 0.0846774193548387 - nodes in this community are weakly interconnected._