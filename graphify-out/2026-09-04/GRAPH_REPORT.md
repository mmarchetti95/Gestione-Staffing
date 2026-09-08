# Graph Report - Gestione-Staffing  (2026-09-04)

## Corpus Check
- 48 files · ~216,081 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 750 nodes · 1271 edges · 60 communities (39 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2aaf76fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sb-admin.js
- weekly-ricerca-squadre.js
- weekly-mappa.js
- weekly-mail-core.js
- Attestati Dashboard
- weekly-meteo.js
- Gestione-Staffing App Overview
- weekly-jira-subtask.js
- dashboard-crud-helpers.js
- weekly-spostamenti.js
- new-project
- produzione-core.js
- weekly-strumenti.js
- config.js
- dashboard-dpi-admin.js
- dashboard-operatori.js
- New-Project Skill
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
- dashboard-anagrafica-import.js
- weekly-collapse-cp.js
- weekly-doppiaweek.js
- dashboard-import-export.js
- smoke_test.py
- SETUP_SUPABASE_GITHUB.md
- dashboard-commesse.js
- weekly-nav.js
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

## God Nodes (most connected - your core abstractions)
1. `pwMapRenderCantieri()` - 14 edges
2. `new-project` - 14 edges
3. `pwJiraSubtaskOpenComuniModal()` - 12 edges
4. `esc()` - 12 edges
5. `sbOnLoggedIn()` - 11 edges
6. `rsCalcola()` - 11 edges
7. `pwGetFerieWeek()` - 11 edges
8. `renderAttestati()` - 11 edges
9. `pwSpostDrawMap()` - 11 edges
10. `renderDpi()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Creative North Star: The Site Foreman's Whiteboard` --semantically_similar_to--> `Principle: information density over whitespace`  [INFERRED] [semantically similar]
  DESIGN.md → PRODUCT.md
- `Auth and Roles` --conceptually_related_to--> `Role Hierarchy (Admin/Responsabile/Operatore/Guest)`  [AMBIGUOUS]
  CLAUDE.md → README.md
- `rowHtml()` --indirect_call--> `esc()`  [INFERRED]
  src/js/weekly-jira-subtask.js → src/js/dashboard-crud-helpers.js
- `listBox()` --indirect_call--> `esc()`  [INFERRED]
  src/js/weekly-ferie-import.js → src/js/dashboard-crud-helpers.js
- `Single-Use Checkpoint Design` --semantically_similar_to--> `New-Project Skill`  [INFERRED] [semantically similar]
  .claude/skills/checkpoint/SKILL.md → .claude/skills/new-project/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jira custom-field cluster templates A-D grouping Eagleprojects projects** — docs_jira_custom_fields_template_a_rilievi_classico, docs_jira_custom_fields_template_b_rilievi_task_onp, docs_jira_custom_fields_template_c_task_iniziativa, docs_jira_custom_fields_template_d_gar_asset_management, docs_jira_custom_fields_epickey_field [EXTRACTED 0.95]
- **Shared Nominatim/OSRM Geocache Across Location Features** — claude_geocoding_mapping, readme_mappa_squadre, readme_pianifica_spostamenti, readme_ricerca_squadre [EXTRACTED 1.00]
- **New-Project Scaffolding Artifacts** — claude_skills_new_project_skill_new_project_skill, claude_skills_new_project_skill_agents_md_scaffold, claude_skills_new_project_skill_claude_md_scaffold, claude_skills_new_project_skill_license_default, claude_skills_new_project_references_gitignore_templates_base_block [EXTRACTED 1.00]
- **Admin Role Hierarchy and Guest-Page Access Control** — readme_ruoli_gerarchia, src_head_role_hierarchy_ui, claude_auth_roles, readme_gestione_utenti [INFERRED 0.85]

## Communities (60 total, 21 thin omitted)

### Community 0 - "sb-admin.js"
Cohesion: 0.07
Nodes (53): checkForNewVersion(), PW_TAB_KEYS, SB_PAGE_LABELS, sbAllPageKeys(), sbApplyPageVisibility(), sbApplyReadOnlyBanner(), sbApplyUserRole(), sbCallAdminUsers() (+45 more)

### Community 1 - "weekly-ricerca-squadre.js"
Cohesion: 0.10
Nodes (48): _ricercaSquadre, RS_STATI, rsAddTappa(), _rsBadgeHtml(), _rsBuildSquadre(), rsCalcola(), _rsChipsHtml(), _rsCloseDropdowns() (+40 more)

### Community 2 - "weekly-mappa.js"
Cohesion: 0.09
Nodes (41): commessaRegione(), _geoCache, _geoCacheSaveSingle(), geocodifica(), MAP_COLORS, _mapCollapsedCommesse, _mapCollapsedRegioniOp, _mapColor() (+33 more)

### Community 3 - "weekly-mail-core.js"
Cohesion: 0.11
Nodes (37): formatDate(), isoWeekToMonday(), isoWeekYear(), pwCellCantieri(), pwData, pwDoppiaWeek, pwDwCount(), pwDwLoad() (+29 more)

### Community 4 - "Attestati Dashboard"
Cohesion: 0.12
Nodes (33): attBadgeHtml(), attBadgesHtml(), attClasseStato(), attDataBreve(), attEtichettaMancanza(), attExcelData(), _attFiltri, attFoglio() (+25 more)

### Community 5 - "weekly-meteo.js"
Cohesion: 0.12
Nodes (29): METEO_FASCE, METEO_ICONS, _meteoCache, _meteoCacheSave(), _pcCache, _pcCacheSave(), pcColorePeggiore(), pcColorFromLabel() (+21 more)

### Community 6 - "Gestione-Staffing App Overview"
Cohesion: 0.10
Nodes (29): Auth and Roles, scripts/build.py, Key Data Structures (pwData/state.operatori/pwFerie/_geoCache), Deploy Workflow, Geocoding and Mapping Services, Hard-Won Conventions, Jira Edge Function Integration, Gestione-Staffing App Overview (+21 more)

### Community 7 - "weekly-jira-subtask.js"
Cohesion: 0.14
Nodes (26): pwJiraBuildSubtaskItem(), pwJiraCreateSubtasks(), pwJiraFetchEpics(), pwJiraFetchExtraFields(), pwJiraFetchTasks(), pwJiraResolveCognome(), pwJiraSearchPanel(), pwJiraSearchPanelClose() (+18 more)

### Community 8 - "dashboard-crud-helpers.js"
Cohesion: 0.16
Nodes (24): closeModal(), cpSelectModal(), deleteCommessa(), deleteOperatore(), esc(), getOperatoriAttivi(), isOperatoreLicenziato(), isOperatoreScaduto() (+16 more)

### Community 9 - "weekly-spostamenti.js"
Cohesion: 0.18
Nodes (25): _pwSpost, _pwSpost2opt(), _pwSpostBuildOrder(), pwSpostCalcola(), pwSpostClear(), _pwSpostCoordString(), _pwSpostCost(), pwSpostDrawMap() (+17 more)

### Community 10 - "new-project"
Cohesion: 0.08
Nodes (22): Base (sempre incluso), Go (indicatore: go.mod), Java (indicatori: pom.xml, build.gradle), .NET (indicatori: *.csproj, *.sln), Node (indicatore: package.json), Python (indicatori: requirements.txt, pyproject.toml, Pipfile), Rust (indicatore: Cargo.toml), Template .gitignore per stack (+14 more)

### Community 11 - "produzione-core.js"
Cohesion: 0.18
Nodes (22): cpBuildRecord(), _cpCollapsedComm, _cpCollapsedSq, _cpData, cpDataISO(), _cpEdgeErr(), cpJiraFlagClick(), cpJiraFlagTicketClick() (+14 more)

### Community 12 - "weekly-strumenti.js"
Cohesion: 0.14
Nodes (14): pwAddSquadra(), pwAddStrumento(), pwRemoveSquadra(), pwRemoveStrumento(), pwRinumeraSquadreDefault(), pwSetSqStrumentiJira(), pwSqStrumentiJira(), pwStrClose() (+6 more)

### Community 13 - "config.js"
Cohesion: 0.13
Nodes (21): ANNO, ATTESTATI_COLONNE, ATTESTATI_DURATA, distanzaLavorazione(), distanzaProvince(), DPI_DEFAULT, haversineKm(), INDUSTRIES (+13 more)

### Community 14 - "dashboard-dpi-admin.js"
Cohesion: 0.19
Nodes (19): dpiBindModaleOperatore(), dpiDurataMesi(), _dpiFiltri, dpiIsValido(), dpiNonCoperti(), dpiRichiestiPerOperatore(), dpiRigaModaleOperatore(), dpiRigheMatrice() (+11 more)

### Community 15 - "dashboard-operatori.js"
Cohesion: 0.19
Nodes (14): aggiornaGgOpVistaCommessa(), apriVistaOperatore(), checkCoerenzaOperatori(), EMAIL_SEED, renderAttestatiFilters(), renderEmailOperatori(), renderOperatori(), renderProvinciaFilterOptions() (+6 more)

### Community 16 - "New-Project Skill"
Cohesion: 0.14
Nodes (16): checkpoint, Gotchas, Resume flow, Save flow, Single-Use Checkpoint Design, Storage, Gitignore Base Block, Gitignore Node Block (+8 more)

### Community 17 - "Categorical Color System (colori categorici)"
Cohesion: 0.19
Nodes (13): Alarm Rose (gap risorse/alert), Categorical Color System (colori categorici), Circuit Indigo (operatori/Jira sync), Creative North Star: The Site Foreman's Whiteboard, Foreman Amber (saturazione/carico), KPI Tile component, Ledger Blue (commesse attive), Modale canonico (Tailwind shadow-xl family) (+5 more)

### Community 18 - "dashboard-assegnazioni.js"
Cohesion: 0.21
Nodes (6): assegnaOperatore(), openOperatoreImpegniModal(), rimuoviAssegnazione(), rimuoviMeseAllocazione(), rimuoviRigaStaffing(), spostaAssegnazione()

### Community 19 - "weekly-operatore-modal.js"
Cohesion: 0.28
Nodes (11): pwCloseOpModal(), pwConfirmOpModal(), pwOpenOpModal(), buildList(), passaFiltroGeo(), pwOperatoreGeoLabel(), pwPopulateWeekSelect(), pwRender() (+3 more)

### Community 20 - "Atlante Campi Jira (Eagleprojects)"
Cohesion: 0.20
Nodes (12): Atlante Campi Jira Claude Artifact (live version), Atlante Campi Jira (Eagleprojects), Jira createmeta / field-metadata API, Eccezione 1: Tempo Team assente su T02P e ASR0, Eccezione 2: ONP_prg senza campo Team, EPICKEY custom field (customfield_10432), jira-custom-fields.html (standalone shareable copy), Template A - Rilievi classico (14 progetti) (+4 more)

### Community 21 - "storage-utils.js"
Cohesion: 0.24
Nodes (7): loadState(), monthsBetween(), operatoreSatPeriodo(), ricalcolaAllocOperatori(), saveState(), sget(), sset()

### Community 22 - "weekly-ferie-import.js"
Cohesion: 0.23
Nodes (8): PW_FERIE_ACCENTI, PW_FERIE_MESI, pwFerieImportFile(), pwFerieImportPick(), pwFerieImportShowConfirm(), listBox(), pwFerieMatchOperatore(), pwFerieNormTokens()

### Community 23 - "dashboard-commessa-attiva.js"
Cohesion: 0.24
Nodes (6): _CONFRONTO_STATO_BADGE, _confrontoBodyHtml(), _confrontoTableHtml(), getCommessaAttivaMeta(), openCommessaAttivaModal(), renderConfrontoBox()

### Community 24 - "weekly-popover-stats.js"
Cohesion: 0.27
Nodes (7): pwAddCantiereField(), pwCantiereCellOf(), pwRemoveCantiereField(), pwTitleCase(), pwToggleStatPopover(), pwUpdateCantiere(), pwUpdateCell()

### Community 25 - "produzione-report.js"
Cohesion: 0.33
Nodes (8): cpCaricaReportSquadra(), cpGetSquadraOpsByDay(), cpHmToMin(), cpOreJiraRGB(), cpParseReportCsv(), cpProcessReport(), cpSplitCsvLine(), pwControlloExportPDF()

### Community 26 - "weekly-clipboard-cantiere.js"
Cohesion: 0.40
Nodes (9): pwCellCtxMenu(), _pwCloseCtxMenu(), pwCopyCell(), pwCopyRow(), _pwCtxMenuEsc(), pwPasteCell(), pwPasteRow(), pwRowCtxMenu() (+1 more)

### Community 27 - "dashboard-anagrafica-import.js"
Cohesion: 0.36
Nodes (6): anagImportFile(), anagImportParseWorkbook(), anagImportPick(), anagImportShowConfirm(), anagNormComune(), anagNormProvincia()

### Community 28 - "weekly-collapse-cp.js"
Cohesion: 0.39
Nodes (8): cpApplyCollapse(), cpCollapseAllToggle(), cpToggleComm(), cpToggleSq(), pwApplyCollapseState(), pwCollapseAllToggle(), pwToggleComm(), pwToggleSq()

### Community 29 - "weekly-doppiaweek.js"
Cohesion: 0.32
Nodes (6): PW_MESI_IT, pwDoppiaWeekRender(), pwDwMonth, pwDwMonthNav(), pwDwToggle(), pwDwYear

### Community 30 - "dashboard-import-export.js"
Cohesion: 0.48
Nodes (5): importXlsx(), normalizeForMatch(), parseDateCell(), parseXlsxToData(), riconcilia()

### Community 31 - "smoke_test.py"
Cohesion: 0.47
Nodes (5): _find_eslint(), main(), Cerca l'eseguibile eslint in vari percorsi noti; None se assente., Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)., _run_eslint_noundef()

### Community 32 - "SETUP_SUPABASE_GITHUB.md"
Cohesion: 0.33
Nodes (5): Legacy sessionStorage keys migration, GitHub Pages deployment steps, RLS policies allow_read/allow_write, SB_URL/SB_ANON_KEY setup instructions, Guide: create staffing_state table

### Community 33 - "dashboard-commesse.js"
Cohesion: 0.53
Nodes (5): _confrontoMeseSel, getNomiCommesseAttive(), renderCommessaPipelineCard(), renderCommesse(), renderCommesseAttive()

### Community 34 - "weekly-nav.js"
Cohesion: 0.47
Nodes (5): mapAddSatelliteToggle(), _pwActiveTab, _pwScrollY, pwSwitchTab(), switchScreen()

### Community 35 - "dashboard-staffing-celle.js"
Cohesion: 0.60
Nodes (3): _commitInlineCell(), _refreshFabbisognoBox(), _showInlineAlert()

### Community 36 - "build_bytes"
Cohesion: 0.67
Nodes (3): build_bytes(), main(), Ritorna il contenuto di index.html così come lo produrrebbe la build, senza…

## Ambiguous Edges - Review These
- `Auth and Roles` → `Role Hierarchy (Admin/Responsabile/Operatore/Guest)`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **116 isolated node(s):** `PW_TAB_KEYS`, `SB_PAGE_LABELS`, `_sbDirty`, `_sbRemoteTs`, `_ricercaSquadre` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Auth and Roles` and `Role Hierarchy (Admin/Responsabile/Operatore/Guest)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `esc()` connect `dashboard-crud-helpers.js` to `weekly-ferie-import.js`, `weekly-jira-subtask.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `pwJiraSubtaskRenderPreview()` connect `weekly-jira-subtask.js` to `dashboard-crud-helpers.js`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `listBox()` connect `weekly-ferie-import.js` to `dashboard-crud-helpers.js`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `esc()` (e.g. with `listBox()` and `rowHtml()`) actually correct?**
  _`esc()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PW_TAB_KEYS`, `SB_PAGE_LABELS`, `_sbDirty` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `sb-admin.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._