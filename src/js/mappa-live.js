
/* ==================== MAPPA (screen "Mappa") ====================
   Vista d'insieme "chi sta lavorando e dove", terzo screen top-level accanto a
   Dashboard e Pianificazione Settimanale. Prefisso funzioni/variabili: ml*.

   È una vista di SOLA LETTURA costruita sui domini di sync già esistenti — non
   introduce un quinto dominio in staffing_state:
     - pwData[anno][week]         chi/dove/quando (dominio "planning")
     - state.commesse_attive_meta metadati commessa (dominio "core")
     - _geoCache                  coordinate cantieri, condivisa con Mappa squadre
                                  (comprese le correzioni manuali fatte lì)
     - _meteoCache / _pcCache     meteo Open-Meteo e criticità Protezione Civile
     - controllo_produzione       ore/km reali (query dedicata, vedi mlLoadProduzione)
     - bc.jiraSubtask             sottotask Jira creati -> stato del Task padre

   Conseguenza voluta: quando un altro utente modifica la Griglia, il Realtime su
   staffing_state aggiorna pwData e la mappa si ridisegna da sola (vedi
   mlOnDataChanged), senza polling. Il polling serve solo a Jira, che non ha push.

   Settimana/giorno mostrati sono indipendenti da quelli della Griglia: _mlAnno e
   _mlWeek sono variabili proprie e NON toccano pwAnno/pwWeek, così navigare nella
   Mappa non sposta la settimana di lavoro di chi poi torna in Pianificazione
   Settimanale. */

const ML_DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const ML_WEEK = -1;                       // "tutta la settimana" (nessun giorno selezionato)
const ML_ALL  = -2;                       // "tutto lo storico" (tutte le settimane in pwData)
const ML_REFRESH_MS = 120000;             // polling Jira: 2 min (vedi mlStartAutoRefresh)

/* La Edge Function jira-task-status accetta al massimo 500 sottotask per chiamata.
   In vista storico le chiavi possono essere molte di più, quindi si spezza in
   blocchi; il tetto sul numero di blocchi evita che una commessa enorme faccia
   partire decine di chiamate a Jira in sequenza. Oltre il tetto la vista resta
   utilizzabile, con alcuni cantieri senza stato e un avviso in toolbar. */
const ML_JIRA_CHUNK = 400;
const ML_JIRA_MAX_CHUNKS = 12;

/* Nuovi cantieri geocodificati per render. Nominatim va interrogato in sequenza e
   con pausa (rate limit), quindi in vista storico — dove i cantieri mai visti
   possono essere centinaia — un ciclo completo bloccherebbe la schermata per
   minuti. Se ne fa un blocco per volta e si riprende da soli poco dopo. */
const ML_GEO_MAX_PER_RENDER = 25;

/* Regione di un cantiere non ancora geocodificato (vedi mlRegioneCantiere): non
   compare come chip, fa mostrare "in caricamento" nella colonna Regione. */
const ML_REGIONE_PENDING = '__pending__';
let _mlGeoCacheReady = false;       // rubrica geo_cache caricata da Supabase
const _mlGeoFailed = new Set();     // ricerche fallite per errore di rete in questa sessione

/* Cache persistenti (localStorage, per browser). Sono solo acceleratori: se
   mancano o sono scadute la Mappa funziona identica, solo più lenta al primo giro.
   Il TTL lungo sugli stati Jira è sostenibile perché la vista giorno/settimana li
   rilegge comunque ad ogni refresh, e "🔄 Aggiorna" forza la rilettura ovunque. */
const ML_JIRA_CACHE_KEY = 'ml_jira_task_cache_v1';
const ML_JIRA_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ML_JIRA_CACHE_MAX_TASKS = 4000;
const ML_CP_CACHE_KEY = 'ml_cp_storico_v1';
const ML_CP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/* Il colore dello stato viene dalla CATEGORIA Jira (new/indeterminate/done), non
   dal nome dello stato: i workflow cambiano da progetto a progetto ("To Do" /
   "Da fare" / "Backlog" sono tutti categoria "new"), la categoria no. */
const ML_STATUS_COLORS = { new: '#64748b', indeterminate: '#f59e0b', done: '#10b981' };
const ML_STATUS_LABELS = { new: 'Da fare', indeterminate: 'In corso', done: 'Completato' };
const ML_STATUS_NOTA = 'Stato non disponibile: nessun sottotask Jira creato per questo cantiere.';

/* Voci del filtro "Stato", nell'ordine in cui interessano a chi guarda la mappa:
   prima quello che si sta facendo, poi quello che resta da fare. La chiave 'nd'
   non esiste in Jira: è il segnaposto locale per "nessun sottotask, stato ignoto",
   e va tenuta filtrabile perché è proprio l'elenco che si vuole bonificare. */
const ML_STATI_FILTRO = [
  { v: 'indeterminate', l: 'In corso' },
  { v: 'new',           l: 'Da fare' },
  { v: 'done',          l: 'Completato' },
  { v: 'nd',            l: 'Stato n/d' },
];

/* Elenco delle 20 regioni italiane, derivato da PROVINCE_ITALIA (config.js, carica
   PRIMA di questo file — vedi JS_FILES in scripts/build.py) invece di duplicarlo. */
const ML_REGIONI = (typeof PROVINCE_ITALIA !== 'undefined') ? [...new Set(PROVINCE_ITALIA.map(p => p.regione))] : [];

let _mlMap = null;
let _mlLayer = null;                      // LayerGroup dei marker, svuotato ad ogni render
let _mlInited = false;
let _mlAnno = null;
let _mlWeek = null;
let _mlDay = 0;

let _mlFiltroCommesse = new Set();        // vuoto = nessun filtro (tutte)
let _mlFiltroOperatori = new Set();       // nomi degli operatori selezionati
let _mlFiltroStati = new Set();           // 'new' | 'indeterminate' | 'done' | 'nd'
let _mlFiltroRegioni = new Set();         // regione del cantiere (da geocoding), 'n/d' se ignota
let _mlFiltroCantieri = new Set();        // nomi esatti dei cantieri selezionati
let _mlSearchCommesse = '';               // ricerca DENTRO l'elenco chip, non sui dati
let _mlSearchOperatori = '';
let _mlSearchRegioni = '';
let _mlSearchCantieri = '';

let _mlSideTab = 'cantieri';              // elenco laterale: 'cantieri' | 'commesse'

let _mlCp = {};                           // "commessa|||squadra|||operatore|||giorno" -> riga controllo_produzione (vista giorno/settimana)
let _mlCpCantiere = {};                   // "commessa|||squadra|||cantiere" -> { ore, km } cumulati (vista storico)
let _mlCpAllLoaded = false;               // la tabella completa è già stata scaricata in questa sessione

/* Cache degli stati Jira. Sono CUMULATIVE e non vengono mai azzerate: ogni fetch
   ci scrive dentro con Object.assign. Serve perché le chiavi dei sottotask
   arrivano un pezzo per volta (la settimana mostrata, poi una commessa aperta nel
   drawer, poi un'altra): azzerandole ad ogni render, un cantiere già risolto
   sarebbe tornato "Stato n/d" appena uscito dalla settimana visibile. */
let _mlTaskBySubtask = {};                // chiave sottotask -> chiave Task padre
let _mlTasks = {};                        // chiave Task -> { key, summary, status, statusCategory, url, ... }
let _mlGroups = [];                       // gruppi cantiere dell'ultimo render (indice = data-idx del marker)
let _mlItems = [];                        // voci filtrate dell'ultimo render, usate dai pannelli dei riquadri KPI
let _mlSelCantiere = null;                // cantiere aperto nel drawer, per ridisegnarlo dopo un refresh
let _mlTimer = null;
let _mlAuto = true;
let _mlBusyJira = false;
let _mlRendering = false;

/* ----- Settimana/giorno ----- */

/* Giorno ISO (0=Lun … 5=Sab) e settimana di "oggi". La domenica non esiste nella
   griglia Lun-Sab: si passa al lunedì successivo, che è il giorno lavorativo più
   vicino e quello che di domenica interessa davvero guardare. */
function mlTodayRef() {
  const now = new Date();
  let ref = now;
  let day = now.getDay() - 1;             // 0=Lun … 5=Sab, -1 se domenica
  if (day < 0) {
    ref = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    day = 0;
  }
  const iso = isoWeekYear(ref);
  return { anno: iso.year, week: iso.week, day };
}

function mlGoToday() {
  const t = mlTodayRef();
  _mlAnno = t.anno;
  _mlWeek = t.week;
  _mlDay = t.day;
}

/* Dati pianificazione della settimana mostrata dalla Mappa. Volutamente NON
   pwGetWeekData(), che legge pwAnno/pwWeek (la settimana della Griglia). */
function mlWeekData() {
  if (!pwData[_mlAnno]) return [];
  return pwData[_mlAnno][_mlWeek] || [];
}

function mlDates() {
  const monday = isoWeekToMonday(_mlAnno, _mlWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

/* Data del giorno selezionato, o null per gli scope aggregati (settimana/storico),
   dove una data singola non esiste. Il confronto è < 0 e non === ML_WEEK: con
   ML_ALL = -2 un controllo sul solo ML_WEEK farebbe mlDates()[-2] === undefined. */
function mlDateISO(dayIdx) {
  if (dayIdx < 0) return null;
  return mlDates()[dayIdx].toISOString().slice(0, 10);
}

/* Etichetta leggibile di una settimana, usata per la colonna "Settimane". */
function mlWeekLabel(anno, week) {
  return anno + '/W' + (Number(week) < 10 ? '0' + Number(week) : week);
}

/* ----- Costruzione dati ----- */

/* Voci pianificate del giorno (o dell'intera settimana con ML_WEEK), una per
   combinazione commessa/squadra/cantiere. Forma simile a pwMapBuildSquadItems()
   della Mappa squadre, ma con in più cIdx, i giorni coperti e le chiavi dei
   sottotask Jira degli operatori su quel cantiere — da cui si risale al Task. */
/* Le settimane su cui lavora lo scope richiesto: una sola (quella mostrata) per
   giorno/settimana, tutte quelle presenti in pwData per ML_ALL. */
function mlScopeWeeks(scope) {
  if (scope !== ML_ALL) {
    return [{ blocchi: mlWeekData(), label: mlWeekLabel(_mlAnno, _mlWeek), anno: _mlAnno, week: _mlWeek }];
  }
  const out = [];
  Object.keys(pwData).sort().forEach(anno => {
    if (!/^\d{4}$/.test(anno)) return;    // pwData ospita anche chiavi non-anno (es. noteGenerali)
    const perWeek = pwData[anno] || {};
    Object.keys(perWeek).sort((a, b) => Number(a) - Number(b)).forEach(week => {
      const blocchi = perWeek[week];
      if (Array.isArray(blocchi) && blocchi.length) {
        out.push({ blocchi, label: mlWeekLabel(anno, week), anno, week });
      }
    });
  });
  return out;
}

/* Memoizzazione degli item costruiti. mlBuildItems(ML_ALL) scorre TUTTE le
   settimane di pwData ed è invocata ad ogni render — cambio filtro, cambio giorno,
   refresh automatico, ripresa della geocodifica a blocchi — quindi senza cache la
   vista storico ricalcola l'intero storico più volte al secondo mentre si naviga.
   pwData cambia solo per pull Realtime o rientrando nello screen: basta invalidare lì.
   Gli item, una volta costruiti, non vengono mai mutati dai render (stato e filtri
   sono ricalcolati a parte), quindi condividerli fra render è sicuro. */
let _mlItemsCache = { scope: null, rev: -1, items: null };
let _mlDataRev = 0;

function mlInvalidateItems() {
  _mlDataRev++;
}

function mlBuildItemsCached(scope) {
  const c = _mlItemsCache;
  if (c.items && c.scope === scope && c.rev === _mlDataRev) return c.items;
  const items = mlBuildItems(scope);
  _mlItemsCache = { scope, rev: _mlDataRev, items };
  return items;
}

function mlBuildItems(scope) {
  const items = [];
  const byKey = {};
  // Negli scope aggregati si scorrono tutti i giorni; nello scope giorno solo quello.
  const giorniDaScorrere = scope < 0 ? [0, 1, 2, 3, 4, 5] : [scope];

  mlScopeWeeks(scope).forEach(blk => {
    blk.blocchi.forEach((bc, cIdx) => {
      if (!bc.commessa) return;
      const color = _mapColor(bc.commessa);
      const jiraMap = bc.jiraSubtask || {};

      (bc.squadre || []).forEach((sq, sIdx) => {
        const squadra = sq.nome || 'Squadra';
        // Indice nell'array ORIGINALE (non filtrato): serve per ritrovare la cella in Griglia.
        const ops = (sq.operatori || []).map((o, oIdx) => ({ o, oIdx })).filter(x => x.o.nome && x.o.nome.trim());
        const strumenti = (typeof pwSqStrumentiJira === 'function') ? pwSqStrumentiJira(sq).filter(k => k) : [];

        giorniDaScorrere.forEach(d => {
          ops.forEach(({ o: op, oIdx }) => {
            const g = (op.giorni || {})[d] || {};
            const attivita = (g.attivita || '').trim();
            pwCellCantieri(g).forEach(cantiere => {
              // Chiave sul NOME della commessa, non sull'indice del blocco: in vista
              // storico lo stesso indice appartiene a commesse diverse in settimane diverse.
              const key = bc.commessa + '|||' + squadra + '|||' + cantiere;
              if (!byKey[key]) {
                byKey[key] = {
                  commessa: bc.commessa, squadra, cantiere, color, strumenti,
                  operatori: [], attivita: new Set(), giorni: new Set(),
                  weeks: new Set(), subtaskKeys: new Set(),
                };
                items.push(byKey[key]);
              }
              const it = byKey[key];
              // Cella della Griglia a cui porta "Apri in Griglia": la prima (giorno più
              // basso) della settimana più recente in cui compare la voce.
              if (!it.loc || it.loc.label !== blk.label) {
                it.loc = { anno: blk.anno, week: blk.week, label: blk.label, cIdx, sIdx, oIdx, day: d };
              }
              if (!it.operatori.includes(op.nome)) it.operatori.push(op.nome);
              if (attivita) it.attivita.add(attivita);
              it.giorni.add(d);
              it.weeks.add(blk.label);
              const sub = jiraMap[cantiere + '|||' + op.nome];
              if (sub && sub.key) it.subtaskKeys.add(sub.key);
            });
          });
        });
      });
    });
  });

  items.forEach(it => {
    it.attivita = [...it.attivita].join(', ');
    it.giorni = [...it.giorni].sort((a, b) => a - b);
    it.weeks = [...it.weeks].sort();
    it.subtaskKeys = [...it.subtaskKeys];
  });
  return items;
}

/* Regione di un CANTIERE (non della commessa: i metadati commessa quasi non
   sono mai compilati, vedi changelog v18.177.0/v18.177.1 — tentativo precedente
   e insufficiente). Si usa lo stesso identico dato già scaricato per posizionare
   il pin sulla mappa: _geoCache, letto tramite mlGeo() per scartare le righe
   sentinella "non trovato" (vedi commento sopra mlGeo). Il campo `label` è il
   display_name restituito da Nominatim — una stringa tipo "Comune, Provincia,
   Regione, CAP, Italia" — in cui basta cercare il nome di una delle 20 regioni
   italiane. Un cantiere non ancora geocodificato (o non trovato) resta 'n/d',
   la stessa condizione già mostrata dal riquadro KPI "Non localizzati". */
function mlRegioneCantiere(cantiere) {
  const key = (cantiere || '').toLowerCase().trim().replace(/\s+/g, ' ');
  // Non ancora cercato: la regione non è "ignota", è in arrivo. Va distinto da
  // 'n/d', altrimenti all'apertura tutti i cantieri finirebbero sotto 'n/d'
  // finché la geocodifica non ha finito.
  if (mlGeoPending(key)) return ML_REGIONE_PENDING;
  const g = mlGeo(key);
  if (!g || !g.label) return 'n/d';
  return ML_REGIONI.find(r => g.label.indexOf(r) !== -1) || 'n/d';
}

/* Filtri combinati: AND fra le dimensioni, OR all'interno di ciascuna.
   Una voce sopravvive al filtro operatore se ALMENO UNO dei suoi operatori è
   selezionato, e resta intera: la domanda a cui risponde è "dove lavora X", e
   nascondere i colleghi che sono con lui sullo stesso cantiere la falserebbe.
   Lo stato NON si filtra qui: è una proprietà del cantiere (gruppo), non della
   singola coppia commessa/squadra — vedi mlApplyFiltroStato. */
function mlApplyFilters(items) {
  return items.filter(it => {
    if (_mlFiltroCommesse.size && !_mlFiltroCommesse.has(it.commessa)) return false;
    if (_mlFiltroOperatori.size && !it.operatori.some(o => _mlFiltroOperatori.has(o))) return false;
    if (_mlFiltroRegioni.size && !_mlFiltroRegioni.has(mlRegioneCantiere(it.cantiere))) return false;
    if (_mlFiltroCantieri.size && !_mlFiltroCantieri.has(it.cantiere)) return false;
    return true;
  });
}

/* Filtro sullo stato del cantiere. Va applicato ai gruppi e solo DOPO
   mlRefreshTaskStatus: prima di quella chiamata g.stato riflette ancora i Task del
   render precedente, e filtrare lì farebbe sparire cantieri il cui stato era
   semplicemente non ancora scaricato. */
function mlApplyFiltroStato(groups) {
  if (!_mlFiltroStati.size) return groups;
  return groups.filter(g => _mlFiltroStati.has(g.stato || 'nd'));
}

/* Un marker per cantiere: più squadre/commesse sullo stesso cantiere finiscono
   nello stesso pin, perché è il cantiere il luogo fisico, non la squadra. */
function mlGroupByCantiere(items) {
  const byName = {};
  const groups = [];
  items.forEach(it => {
    const key = it.cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!byName[key]) {
      byName[key] = { key, cantiere: it.cantiere, items: [], operatori: new Set(), commesse: new Set(), squadre: new Set() };
      groups.push(byName[key]);
    }
    const g = byName[key];
    g.items.push(it);
    it.operatori.forEach(o => g.operatori.add(o));
    g.commesse.add(it.commessa);
    g.squadre.add(it.squadra);
  });
  groups.forEach(g => {
    g.nOperatori = g.operatori.size;
    g.color = g.items[0].color;
    g.stato = mlStatoGruppo(g);
  });
  return groups;
}

/* Stato complessivo di un cantiere: il meno avanzato fra i Task dei suoi item.
   Se nessun item ha un sottotask (quindi nessun Task risolvibile) lo stato resta
   null -> pin grigio "stato non disponibile", mai un'ipotesi inventata. */
function mlStatoGruppo(g) {
  const cats = [];
  g.items.forEach(it => {
    mlTasksOf(it).forEach(t => { if (t.statusCategory) cats.push(t.statusCategory); });
  });
  if (!cats.length) return null;
  if (cats.includes('indeterminate')) return 'indeterminate';
  if (cats.includes('new')) return 'new';
  return 'done';
}

/* Task Jira (deduplicati) collegati a una voce, risalendo dai suoi sottotask. */
function mlTasksOf(it) {
  const out = [];
  const seen = new Set();
  (it.subtaskKeys || []).forEach(sk => {
    const tk = _mlTaskBySubtask[sk];
    if (!tk || seen.has(tk)) return;
    seen.add(tk);
    if (_mlTasks[tk]) out.push(_mlTasks[tk]);
  });
  return out;
}

/* Coordinate utilizzabili per una chiave della rubrica luoghi, o null.
   Serve un filtro e non la lettura diretta di _geoCache perché
   _geoCacheSaveSingle(key, null) salva su Supabase una riga SENTINELLA
   lat 0 / lng 0 / label "[non trovato]": in memoria il valore è null, ma dopo un
   refresh _geoCacheLoad() la rilegge come oggetto valido. Senza questo controllo
   un cantiere non geocodificabile verrebbe disegnato al largo dell'Africa (0,0) e
   sparirebbe dal conteggio "Non localizzati" invece di essere segnalato. */
/* Cantiere la cui geocodifica non è ancora avvenuta: rubrica non ancora caricata
   da Supabase, oppure nome mai cercato. Un nome la cui ricerca è fallita per
   errore di rete (geocodifica() in quel caso non scrive nulla in _geoCache) non
   conta come in attesa, o la colonna Regione resterebbe "in caricamento" per sempre. */
function mlGeoPending(key) {
  if (!_mlGeoCacheReady) return true;
  return !(key in _geoCache) && !_mlGeoFailed.has(key);
}

function mlGeo(key) {
  const g = _geoCache[key];
  if (!g) return null;
  if (g.label === '[non trovato]') return null;
  if (!g.lat && !g.lng) return null;
  return g;
}

/* ----- Cache persistenti (localStorage) ----- */

function mlJiraCacheLoad() {
  try {
    const raw = localStorage.getItem(ML_JIRA_CACHE_KEY);
    if (!raw) return;
    const c = JSON.parse(raw);
    if (!c || !c.savedAt || (Date.now() - c.savedAt) > ML_JIRA_CACHE_TTL_MS) return;
    if (c.bySubtask) Object.assign(_mlTaskBySubtask, c.bySubtask);
    if (c.tasks) Object.assign(_mlTasks, c.tasks);
  } catch (_) { /* cache illeggibile: si riparte da Jira */ }
}

let _mlJiraCacheTimer = null;
function mlJiraCacheSave() {
  clearTimeout(_mlJiraCacheTimer);
  _mlJiraCacheTimer = setTimeout(() => {
    try {
      const keys = Object.keys(_mlTasks);
      let tasks = _mlTasks;
      if (keys.length > ML_JIRA_CACHE_MAX_TASKS) {
        tasks = {};
        keys.slice(-ML_JIRA_CACHE_MAX_TASKS).forEach(k => { tasks[k] = _mlTasks[k]; });
      }
      localStorage.setItem(ML_JIRA_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), bySubtask: _mlTaskBySubtask, tasks }));
    } catch (_) { /* quota piena: è un acceleratore, non un dato da preservare */ }
  }, 800);
}

/* ----- Caricamento dati esterni ----- */

/* Ore/km reali della settimana mostrata. Query dedicata e non riuso di _cpData,
   che è legato alla settimana del Controllo Produzione (pwAnno/pwWeek) e verrebbe
   sovrascritto navigando qui. */
async function mlLoadProduzione() {
  if (!_sbClient || !_sbUser) return;
  if (_mlDay === ML_ALL) { await mlLoadProduzioneStorico(); return; }
  _mlCp = {};
  try {
    const { data, error } = await _sbClient
      .from('controllo_produzione')
      .select('commessa,squadra,operatore,giorno,cantiere,ore_jira,ore_report,km_cad,verificato')
      .eq('anno', _mlAnno)
      .eq('week', _mlWeek);
    if (error) throw error;
    (data || []).forEach(r => {
      _mlCp[r.commessa + '|||' + r.squadra + '|||' + r.operatore + '|||' + r.giorno] = r;
    });
  } catch (e) {
    console.error('mlLoadProduzione error:', e);
  }
}

/* Vista storico: ore/km cumulati per commessa+squadra+cantiere su TUTTE le
   settimane. Va paginato a mano — PostgREST tronca a 1000 righe per risposta e
   controllo_produzione ha una riga per operatore/giorno, quindi le supera presto.
   Scaricato una volta per sessione (_mlCpAllLoaded): è un dato storico, che cambia
   solo per la settimana in corso, già coperta dalla vista settimana. */
async function mlLoadProduzioneStorico() {
  if (_mlCpAllLoaded) return;
  // Cache su localStorage: senza, ogni refresh della pagina rifà fino a 30 query
  // paginate prima di poter disegnare la vista storico.
  try {
    const raw = localStorage.getItem(ML_CP_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.savedAt && (Date.now() - c.savedAt) < ML_CP_CACHE_TTL_MS && c.agg) {
        _mlCpCantiere = c.agg;
        _mlCpAllLoaded = true;
        return;
      }
    }
  } catch (_) { /* cache illeggibile: si scarica da Supabase */ }

  const PAGE = 1000;
  const MAX_PAGES = 30;
  const agg = {};
  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const { data, error } = await _sbClient
        .from('controllo_produzione')
        .select('commessa,squadra,cantiere,ore_jira,km_cad')
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      rows.forEach(r => {
        if (!r.cantiere) return;
        const k = r.commessa + '|||' + r.squadra + '|||' + r.cantiere;
        if (!agg[k]) agg[k] = { ore: 0, km: 0 };
        if (r.ore_jira != null) agg[k].ore += Number(r.ore_jira) || 0;
        if (r.km_cad != null) agg[k].km += Number(r.km_cad) || 0;
      });
      if (rows.length < PAGE) break;
    }
    _mlCpCantiere = agg;
    _mlCpAllLoaded = true;
    try { localStorage.setItem(ML_CP_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), agg })); } catch (_) {}
  } catch (e) {
    console.error('mlLoadProduzioneStorico error:', e);
  }
}

/* Stato dei Task Jira dei cantieri visibili. Parte dalle chiavi dei sottotask
   salvate in bc.jiraSubtask e lascia alla Edge Function il salto sottotask->Task
   (campo "parent"): è l'unico legame certo cantiere->Task, vedi il commento in
   supabase/functions/jira-task-status/index.ts. */
async function mlRefreshTaskStatus(items, force) {
  if (_mlBusyJira) return;
  if (!_sbClient || !_sbUser) return;
  const keys = [...new Set(items.flatMap(it => it.subtaskKeys || []))];
  if (!keys.length) { mlSetJiraStatus('Nessun sottotask Jira nei cantieri visibili.'); return; }

  // Vista storico: si riempiono solo i buchi. Rileggere ad ogni giro le migliaia di
  // sottotask di tutto lo storico significherebbe decine di chiamate a Jira per un
  // dato che, per le settimane passate, non cambia più. Nella vista giorno/settimana
  // l'insieme è piccolo e conviene rileggerlo sempre, per cogliere i cambi di stato.
  const daChiedere = (_mlDay === ML_ALL && !force) ? keys.filter(k => !(k in _mlTaskBySubtask)) : keys;
  if (!daChiedere.length) { mlSetJiraStatus('Stato Jira già aggiornato per lo storico.'); return; }

  _mlBusyJira = true;
  mlSetJiraStatus('⏳ Aggiornamento stato Jira…');
  try {
    const completo = await mlFetchTaskStatus(daChiedere);
    const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    mlSetJiraStatus(completo
      ? 'Jira aggiornato alle ' + ora
      : '⚠ Troppi sottotask: stato parziale (' + ora + ')');
  } catch (e) {
    console.error('mlRefreshTaskStatus error:', e);
    mlSetJiraStatus('⚠ Jira non raggiungibile');
  } finally {
    _mlBusyJira = false;
  }
}

/* Riempie SOLO i buchi: chiavi di cui non si conosce ancora il Task padre. Usata
   quando si apre una commessa nel drawer, che porta con sé i sottotask di tutte le
   sue settimane — comprese quelle mai visitate, che altrimenti resterebbero
   "Stato n/d" pur avendo un Task Jira con uno stato ben definito. */
async function mlEnsureTaskStatus(keys) {
  if (!_sbClient || !_sbUser) return true;
  const mancanti = [...new Set(keys)].filter(k => k && !(k in _mlTaskBySubtask));
  if (!mancanti.length) return true;
  try {
    return await mlFetchTaskStatus(mancanti);
  } catch (e) {
    console.error('mlEnsureTaskStatus error:', e);
    return false;
  }
}

/* Scarica gli stati a blocchi da ML_JIRA_CHUNK chiavi e li FONDE nelle cache
   (mai sostituirle: vedi il commento su _mlTaskBySubtask).
   Ritorna false se ha dovuto troncare per il tetto sul numero di blocchi. */
async function mlFetchTaskStatus(keys) {
  const chunks = [];
  for (let i = 0; i < keys.length; i += ML_JIRA_CHUNK) chunks.push(keys.slice(i, i + ML_JIRA_CHUNK));
  let completo = true;
  if (chunks.length > ML_JIRA_MAX_CHUNKS) { chunks.length = ML_JIRA_MAX_CHUNKS; completo = false; }

  for (const c of chunks) {
    const { data, error } = await _sbClient.functions.invoke('jira-task-status', { body: { subtaskKeys: c } });
    if (error) throw new Error(await _cpEdgeErr(error, 'jira-task-status'));
    if (data && data.error) throw new Error(data.error);
    Object.assign(_mlTaskBySubtask, (data && data.bySubtask) || {});
    Object.assign(_mlTasks, (data && data.tasks) || {});
  }
  mlJiraCacheSave();
  return completo;
}

function mlSetJiraStatus(txt) {
  const el = document.getElementById('ml-jira-status');
  if (el) el.textContent = txt;
}

/* Meteo dei cantieri della settimana mostrata. Stessa logica di pwRefreshMeteoWeek()
   ma sulla settimana della Mappa: geocodifica e cache meteo sono le stesse strutture
   condivise, quindi il lavoro fatto da una vista vale anche per l'altra. */
async function mlRefreshMeteo(groups) {
  // In vista storico il meteo non ha significato (cantieri di settimane diverse,
  // molte già passate e fuori dall'orizzonte di previsione): si salta del tutto.
  if (_mlDay === ML_ALL) return;
  const days = mlDates();
  const startISO = days[0].toISOString().slice(0, 10);
  const endISO = days[5].toISOString().slice(0, 10);

  // Giorno passato selezionato: meteo osservato (meteo-storico.js). Si attende solo la
  // lettura da Supabase; l'eventuale recupero dall'archivio gira in coda e, se aggiunge
  // qualcosa, ridisegna — così un giorno mai recuperato non blocca il disegno dei pin.
  const dayISO = mlDateISO(_mlDay);
  if (dayISO && dayISO < meteoTodayISO()) {
    await msLoadRange(dayISO, dayISO, { hourly: true });
    const anno = _mlAnno, week = _mlWeek, day = _mlDay;
    const pairs = groups.map(g => ({ cantiere: g.cantiere, dateISO: dayISO }));
    msRun(() => msEnsurePast(pairs)).then(changed => {
      if (changed && mlIsActive() && _mlAnno === anno && _mlWeek === week && _mlDay === day) {
        mlRender({ reloadJira: false, reloadProduzione: false, keepView: true });
      }
    });
    return;
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(); maxDate.setUTCDate(maxDate.getUTCDate() + METEO_MAX_FORECAST_DAYS);
  const maxISO = maxDate.toISOString().slice(0, 10);
  if (endISO < todayISO || startISO > maxISO) return;   // settimana fuori dall'orizzonte di previsione

  const fetchStartISO = startISO < todayISO ? todayISO : startISO;
  const fetchEndISO = endISO > maxISO ? maxISO : endISO;

  const now = Date.now();
  const seenPos = new Set();
  for (const g of groups) {
    const geo = mlGeo(g.key);
    if (!geo) continue;
    const posKey = geo.lat.toFixed(2) + ',' + geo.lng.toFixed(2);
    if (seenPos.has(posKey)) continue;
    seenPos.add(posKey);
    const cached = _meteoCache[posKey + '|' + fetchStartISO];
    const isFresh = cached && Array.isArray(cached.hourly) && cached.hourly.length && (now - cached.fetchedAt) < METEO_TTL_MS;
    if (isFresh) continue;
    await pwFetchMeteoRange(geo.lat, geo.lng, fetchStartISO, fetchEndISO);
  }
  await pcRefreshBollettino();
}

/* ----- Render ----- */

function mlInit() {
  if (_mlInited) return;
  _mlInited = true;
  _mlMap = L.map('ml-map', { preferCanvas: true }).setView([42.5, 12.5], 6);
  const street = mapStreetLayer().addTo(_mlMap);
  mapAddSatelliteToggle(_mlMap, street);
  _mlLayer = L.layerGroup().addTo(_mlMap);
  setTimeout(() => _mlMap.invalidateSize(), 200);
}

async function mlRender(opts) {
  if (!_mlMap) return;
  if (_mlRendering) return;
  _mlRendering = true;
  const o = opts || {};
  const loading = document.getElementById('ml-loading');
  try {
    mlRenderToolbar();
    mlRenderDays();

    // mlRenderFiltri() va PRIMA di filtrare: è lì che i filtri rimasti su voci non
    // più presenti (tipico dopo un cambio settimana) vengono scartati. Chiamandola
    // dopo, quel render uscirebbe vuoto e solo il successivo tornerebbe corretto.
    // Costruito una volta sola e riusato: in vista storico questa scansione tocca
    // tutte le settimane di pwData, non conviene farla due volte per render.
    const tutti = mlBuildItemsCached(_mlDay);
    mlRenderFiltri(tutti);
    let items = mlApplyFilters(tutti);

    let groups = mlGroupByCantiere(items);

    if (loading) loading.style.display = 'flex';

    // All'apertura dell'app la rubrica luoghi si sta ancora scaricando da Supabase:
    // senza attenderla ogni cantiere risulterebbe non localizzato (regione 'n/d')
    // e verrebbe ricercato di nuovo su Nominatim.
    if (!_mlGeoCacheReady) {
      if (!_geoCacheLoading) _geoCacheLoad();
      await _geoCacheLoading;
      _mlGeoCacheReady = true;
    }

    // Geocodifica sequenziale dei cantieri non ancora in rubrica (rate-limit Nominatim),
    // a blocchi: quelli che avanzano vengono ripresi dal render di coda qui sotto.
    // Si scorrono TUTTI i cantieri dello scope, non solo quelli filtrati: con un
    // filtro Regione attivo un cantiere non ancora localizzato verrebbe escluso e
    // così non verrebbe mai localizzato, restando fuori per sempre.
    let geocodificati = 0;
    let daGeocodificare = 0;
    for (const g of mlGroupByCantiere(tutti)) {
      if (!mlGeoPending(g.key)) continue;
      if (geocodificati >= ML_GEO_MAX_PER_RENDER) { daGeocodificare++; continue; }
      await geocodifica(g.cantiere);
      if (!(g.key in _geoCache)) _mlGeoFailed.add(g.key);
      await new Promise(r => setTimeout(r, 300));
      geocodificati++;
    }

    // Le regioni dipendono dalla geocodifica appena fatta: filtri ed elenco vanno
    // ricalcolati adesso, non al prossimo cambio data (prima restavano 'n/d').
    mlRenderFiltri(tutti);
    items = mlApplyFilters(tutti);
    groups = mlGroupByCantiere(items);

    if (o.reloadProduzione !== false) await mlLoadProduzione();
    if (o.reloadJira !== false) await mlRefreshTaskStatus(items, o.forceJira === true);
    await mlRefreshMeteo(groups);

    // Lo stato dei gruppi va ricalcolato DOPO mlRefreshTaskStatus: alla prima
    // costruzione _mlTasks è ancora quello del render precedente.
    groups.forEach(g => { g.stato = mlStatoGruppo(g); });

    // Solo ora lo stato è attendibile: si può applicare il filtro e riallineare
    // gli item (usati da elenco commesse, riepilogo e pannelli KPI) ai soli
    // cantieri superstiti, altrimenti i conteggi contraddirebbero la mappa.
    if (_mlFiltroStati.size) {
      groups = mlApplyFiltroStato(groups);
      items = groups.reduce((acc, g) => acc.concat(g.items), []);
    }

    _mlGroups = groups;
    _mlItems = items;
    mlDrawMarkers(groups, o.keepView === true);
    mlRenderLista(groups, items);
    mlRenderRiepilogo(groups, items);

    // Se il drawer era aperto su un cantiere ancora visibile, lo ridisegna aggiornato.
    // Quando è aperta una commessa _mlSelCantiere è null, così la vista commessa
    // non viene sostituita dal dettaglio cantiere al primo refresh.
    if (_mlSelCantiere) {
      const still = groups.findIndex(g => g.key === _mlSelCantiere);
      if (still >= 0) mlOpenDettaglio(still, true); else mlCloseDrawer();
    }

    // Restano cantieri da localizzare: si riprende fra poco, senza bloccare l'interfaccia.
    if (daGeocodificare > 0) {
      setTimeout(() => {
        if (mlIsActive()) mlRender({ reloadJira: false, reloadProduzione: false, keepView: true });
      }, 1200);
    }
  } finally {
    if (loading) loading.style.display = 'none';
    _mlRendering = false;
  }
}

function mlRenderToolbar() {
  const annoSel = document.getElementById('ml-anno');
  if (annoSel) annoSel.value = String(_mlAnno);
  const weekSel = document.getElementById('ml-week');
  if (weekSel) {
    const nw = weeksInYear(_mlAnno);
    weekSel.innerHTML = '';
    for (let w = 1; w <= nw; w++) {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = w < 10 ? '0' + w : String(w);
      if (w === _mlWeek) opt.selected = true;
      weekSel.appendChild(opt);
    }
  }
  const days = mlDates();
  const lbl = document.getElementById('ml-header-dates');
  if (lbl) {
    lbl.textContent = _mlDay === ML_ALL
      ? '🗂 Tutto lo storico · ' + mlScopeWeeks(ML_ALL).length + ' settimane pianificate'
      : 'WEEK ' + _mlWeek + ' · ' + formatDate(days[0]) + ' — ' + formatDate(days[5]) + ' ' + _mlAnno;
  }
  const auto = document.getElementById('ml-auto');
  if (auto) auto.checked = _mlAuto;

  // In vista storico i selettori di settimana non governano più nulla: si
  // disabilitano, invece di lasciarli attivi e apparentemente senza effetto.
  const storico = _mlDay === ML_ALL;
  ['ml-prev', 'ml-next', 'ml-today', 'ml-anno', 'ml-week'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = storico;
    el.style.opacity = storico ? '.45' : '';
    el.style.pointerEvents = storico ? 'none' : '';
  });
}

function mlRenderDays() {
  const el = document.getElementById('ml-days');
  if (!el) return;
  const days = mlDates();
  const todayStr = new Date().toISOString().slice(0, 10);
  let html = days.map((d, i) => {
    const ds = d.toISOString().slice(0, 10);
    const cls = ['ml-day-btn'];
    if (i === _mlDay) cls.push('active');
    if (ds === todayStr) cls.push('is-today');
    return '<button class="' + cls.join(' ') + '" data-di="' + i + '">' + ML_DAY_SHORT[i] + ' ' + formatDate(d) + '</button>';
  }).join('');
  html += '<button class="ml-day-btn ml-week-btn' + (_mlDay === ML_WEEK ? ' active' : '') + '" data-di="' + ML_WEEK + '">📅 Tutta la settimana</button>';
  html += '<button class="ml-day-btn ml-all-btn' + (_mlDay === ML_ALL ? ' active' : '') + '" data-di="' + ML_ALL + '">🗂 Tutto lo storico</button>';
  el.innerHTML = html;
  el.querySelectorAll('.ml-day-btn').forEach(b => {
    b.onclick = () => {
      const nuovo = parseInt(b.dataset.di, 10);
      const cambiaScope = (nuovo === ML_ALL) !== (_mlDay === ML_ALL);
      _mlDay = nuovo;
      // Entrando o uscendo dallo storico cambiano sia l'insieme dei cantieri sia
      // la fonte della produzione, quindi vanno ricaricati; fra giorni della stessa
      // settimana no, sarebbero query identiche.
      mlRender({ reloadJira: cambiaScope, reloadProduzione: cambiaScope, keepView: !cambiaScope });
    };
  });
}

/* Chip filtro: le opzioni derivano SEMPRE dalla settimana/giorno correnti senza
   applicare i filtri, altrimenti selezionare una commessa farebbe sparire le
   altre dall'elenco e non si potrebbe più deselezionare. */
function mlRenderFiltri(tutti) {
  const all = tutti || mlBuildItemsCached(_mlDay);
  const commesse = [...new Set(all.map(i => i.commessa))].sort((a, b) => a.localeCompare(b));
  const operatori = [...new Set(all.reduce((acc, i) => acc.concat(i.operatori), []))]
    .sort((a, b) => a.localeCompare(b));
  const cantieri = [...new Set(all.map(i => i.cantiere))].sort((a, b) => a.localeCompare(b));
  // Regione dedotta dal cantiere (geocoding), non dalla commessa — vedi mlRegioneCantiere.
  // 'n/d' sempre in fondo: è un ripiego, non una regione vera, e mischiata in
  // ordine alfabetico (tra "Molise" e "Piemonte") sembrerebbe una svista.
  const regioniCantieri = cantieri.map(c => mlRegioneCantiere(c));
  const regioniInCaricamento = regioniCantieri.includes(ML_REGIONE_PENDING);
  const regioni = [...new Set(regioniCantieri.filter(r => r !== ML_REGIONE_PENDING))]
    .sort((a, b) => (a === 'n/d') - (b === 'n/d') || a.localeCompare(b));

  // Un filtro su una voce non più presente (cambio settimana) va scartato, altrimenti
  // resterebbe attivo e invisibile, filtrando via tutto senza spiegazione.
  [..._mlFiltroCommesse].forEach(c => { if (!commesse.includes(c)) _mlFiltroCommesse.delete(c); });
  [..._mlFiltroOperatori].forEach(o => { if (!operatori.includes(o)) _mlFiltroOperatori.delete(o); });
  // Mentre la geocodifica è in corso una regione selezionata può non comparire
  // ancora solo perché i suoi cantieri non sono stati localizzati: non la si scarta.
  if (!regioniInCaricamento) {
    [..._mlFiltroRegioni].forEach(r => { if (!regioni.includes(r)) _mlFiltroRegioni.delete(r); });
  }
  [..._mlFiltroCantieri].forEach(c => { if (!cantieri.includes(c)) _mlFiltroCantieri.delete(c); });

  mlRenderChips('ml-filtro-commesse', commesse, _mlFiltroCommesse, _mlSearchCommesse, 'nessuna commessa pianificata', true);
  mlRenderChips('ml-filtro-operatori', operatori, _mlFiltroOperatori, _mlSearchOperatori, 'nessun operatore pianificato', false);
  mlRenderChips('ml-filtro-regioni', regioni, _mlFiltroRegioni, _mlSearchRegioni,
    regioniInCaricamento ? '⏳ in caricamento…' : 'nessuna regione nota', false);
  // Chip già disponibili ma altri cantieri ancora da localizzare: lo si dice in coda,
  // così l'elenco parziale non sembra definitivo.
  if (regioniInCaricamento && regioni.length) {
    const elReg = document.getElementById('ml-filtro-regioni');
    if (elReg) elReg.insertAdjacentHTML('beforeend', '<span class="ml-empty">⏳ in caricamento…</span>');
  }
  mlRenderChips('ml-filtro-cantieri', cantieri, _mlFiltroCantieri, _mlSearchCantieri, 'nessun cantiere pianificato', false);
  mlRenderChipsStato();

  mlSetFiltroCount('ml-n-commesse', _mlFiltroCommesse.size);
  mlSetFiltroCount('ml-n-operatori', _mlFiltroOperatori.size);
  mlSetFiltroCount('ml-n-regioni', _mlFiltroRegioni.size);
  mlSetFiltroCount('ml-n-cantieri', _mlFiltroCantieri.size);
  mlSetFiltroCount('ml-n-stati', _mlFiltroStati.size);

  const nAttivi = _mlFiltroCommesse.size + _mlFiltroOperatori.size + _mlFiltroRegioni.size +
    _mlFiltroCantieri.size + _mlFiltroStati.size;
  const btnClear = document.getElementById('ml-filtro-clear');
  if (btnClear) btnClear.style.display = nAttivi ? '' : 'none';
}

/* Una colonna di chip. `ricerca` è il testo della casella di quella colonna e
   nasconde le voci che non corrispondono, ma MAI quelle già selezionate: sparendo
   dall'elenco diventerebbero un filtro attivo e invisibile, impossibile da togliere
   senza svuotare il campo di ricerca. */
function mlRenderChips(elId, valori, sel, ricerca, vuoto, colorate) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!valori.length) { el.innerHTML = '<span class="ml-empty">' + esc(vuoto) + '</span>'; return; }
  const q = (ricerca || '').toLowerCase().trim();
  const visibili = q ? valori.filter(v => sel.has(v) || v.toLowerCase().indexOf(q) !== -1) : valori;
  if (!visibili.length) { el.innerHTML = '<span class="ml-empty">nessun risultato</span>'; return; }
  el.innerHTML = visibili.map(v => {
    const style = colorate ? ' style="--chip:' + esc(_mapColor(v)) + '"' : '';
    return '<button class="ml-chip' + (sel.has(v) ? ' active' : '') + '"' + style +
      ' data-v="' + esc(v) + '" title="' + esc(v) + '">' + esc(v) + '</button>';
  }).join('');
  el.querySelectorAll('.ml-chip').forEach(b => {
    b.onclick = () => { mlToggleSet(sel, b.dataset.v); mlRender({ reloadJira: false, reloadProduzione: false, keepView: true }); };
  });
}

/* Colonna "Stato": voci fisse, non derivate dai dati — devono restare selezionabili
   anche quando nessun cantiere è in quello stato, altrimenti non si potrebbe mai
   chiedere "mostrami solo i completati" partendo da una settimana senza completati. */
function mlRenderChipsStato() {
  const el = document.getElementById('ml-filtro-stati');
  if (!el) return;
  el.innerHTML = ML_STATI_FILTRO.map(s => {
    const col = ML_STATUS_COLORS[s.v] || '#cbd5e1';
    const tit = s.v === 'nd' ? ML_STATUS_NOTA : 'Cantieri nello stato "' + s.l + '"';
    return '<button class="ml-chip' + (_mlFiltroStati.has(s.v) ? ' active' : '') +
      '" style="--chip:' + col + '" data-v="' + s.v + '" title="' + esc(tit) + '">' + esc(s.l) + '</button>';
  }).join('');
  el.querySelectorAll('.ml-chip').forEach(b => {
    b.onclick = () => { mlToggleSet(_mlFiltroStati, b.dataset.v); mlRender({ reloadJira: false, reloadProduzione: false, keepView: true }); };
  });
}

/* Pastiglia col numero di selezioni attive accanto al titolo della colonna. */
function mlSetFiltroCount(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n ? String(n) : '';
  el.style.display = n ? '' : 'none';
}

function mlToggleSet(set, v) {
  if (set.has(v)) set.delete(v); else set.add(v);
}

function mlClearFiltri() {
  _mlFiltroCommesse.clear();
  _mlFiltroOperatori.clear();
  _mlFiltroStati.clear();
  _mlFiltroRegioni.clear();
  _mlFiltroCantieri.clear();
  _mlSearchCommesse = '';
  _mlSearchOperatori = '';
  _mlSearchRegioni = '';
  _mlSearchCantieri = '';
  ['ml-search-commesse', 'ml-search-operatori', 'ml-search-regioni', 'ml-search-cantieri'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) inp.value = '';
  });
  mlRender({ reloadJira: false, reloadProduzione: false, keepView: true });
}

/* Pin: cerchio colorato come la commessa, anello colorato dallo stato del Task,
   icona meteo in alto a destra e numero di operatori al centro. */
function mlMarkerHtml(g, dateISO) {
  const stato = g.stato;
  const ring = stato ? ML_STATUS_COLORS[stato] : '#cbd5e1';
  const info = dateISO ? pwMeteoInfoFor(g.cantiere, dateISO) : null;
  const pcCol = dateISO ? pcColorePeggiore(pcInfoFor(g.cantiere, dateISO)) : null;
  const meteoEl = info ? '<span class="ml-pin-meteo">' + pwMeteoIconFor(info.code) + '</span>' : '';
  const allerta = pcCol ? '<span class="ml-pin-alert ml-pc-' + esc(pcCol) + '">▲</span>' : '';
  return '<div class="ml-pin" style="background:' + esc(g.color) + ';border-color:' + esc(ring) + '">' +
    '<span class="ml-pin-n">' + g.nOperatori + '</span>' + meteoEl + allerta + '</div>';
}

function mlDrawMarkers(groups, keepView) {
  _mlLayer.clearLayers();
  const dateISO = mlDateISO(_mlDay);
  const bounds = [];

  groups.forEach((g, idx) => {
    const geo = mlGeo(g.key);
    if (!geo) return;
    const icon = L.divIcon({
      className: 'ml-pin-wrap',
      html: mlMarkerHtml(g, dateISO),
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
    const m = L.marker([geo.lat, geo.lng], { icon, title: g.cantiere });
    m.on('click', () => mlOpenDettaglio(idx));
    m.addTo(_mlLayer);
    bounds.push([geo.lat, geo.lng]);
  });

  if (!keepView && bounds.length) {
    _mlMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
  }
}

/* Riepilogo in testa: quante persone, quanti cantieri, quante commesse, e quanti
   cantieri non si sono potuti posizionare (geocoding fallito) o restano senza
   stato Jira — due numeri che spiegano da soli i pin grigi e i cantieri assenti. */
function mlRenderRiepilogo(groups, items) {
  const el = document.getElementById('ml-riepilogo');
  if (!el) return;
  const operatori = new Set();
  items.forEach(it => it.operatori.forEach(o => operatori.add(o)));
  const commesse = new Set(items.map(i => i.commessa));
  const senzaGeo = groups.filter(g => !mlGeo(g.key)).length;
  const senzaStato = groups.filter(g => !g.stato).length;

  const box = (v, l, kind, titolo) =>
    '<button class="ml-kpi" data-ml-kpi="' + kind + '" title="' + esc(titolo) + '">' +
      '<span class="ml-kpi-v">' + v + '</span><span class="ml-kpi-l">' + esc(l) + '</span></button>';

  let html =
    box(operatori.size, 'Operatori', 'operatori', 'Elenco degli operatori pianificati e dove sono') +
    box(groups.length, 'Cantieri', 'cantieri', "Mostra l'elenco dei cantieri") +
    box(commesse.size, 'Commesse', 'commesse', "Mostra l'elenco delle commesse");
  if (senzaGeo) html += box(senzaGeo, 'Non localizzati', 'nogeo', 'Cantieri assenti dalla mappa: clicca per correggerne la posizione');
  if (senzaStato) html += box(senzaStato, 'Senza stato Jira', 'nostato', 'Cantieri senza stato: clicca per vedere quali e perché');
  el.innerHTML = html;
  el.querySelectorAll('[data-ml-kpi]').forEach(b => { b.onclick = () => mlOpenKpi(b.dataset.mlKpi); });
}

/* ----- Pannelli aperti dai riquadri di riepilogo -----
   I riquadri non sono solo numeri: sono la via più diretta per arrivare ai
   cantieri problematici — "Non localizzati" in particolare apre direttamente il
   pannello di correzione della posizione, senza passare da Mappa squadre (che è
   legata a una singola settimana, mentre qui i cantieri possono venire da
   settimane diverse, soprattutto in vista storico). */
function mlOpenKpi(kind) {
  // Questi due non aprono un pannello: portano all'elenco laterale corrispondente,
  // chiudendo il drawer così l'elenco resta effettivamente visibile anche quando la
  // scheda era già quella attiva.
  if (kind === 'cantieri' || kind === 'commesse') {
    mlCloseDrawer();
    mlSwitchSideTab(kind);
    return;
  }

  const d = document.getElementById('ml-drawer');
  const body = document.getElementById('ml-drawer-body');
  const title = document.getElementById('ml-drawer-title');
  if (!d || !body) return;
  _mlSelCantiere = null;                  // così un refresh non sostituisce questo pannello
  d.classList.remove('hidden');

  if (kind === 'operatori') {
    if (title) title.textContent = 'Operatori pianificati';
    body.innerHTML = mlKpiOperatoriHtml();
  } else if (kind === 'nogeo') {
    if (title) title.textContent = 'Cantieri non localizzati';
    body.innerHTML = mlKpiNoGeoHtml();
    mlBindGeoFix(body);
  } else if (kind === 'nostato') {
    if (title) title.textContent = 'Cantieri senza stato Jira';
    body.innerHTML = mlKpiNoStatoHtml();
    mlBindGriglia(body);
  }
  body.scrollTop = 0;
}

function mlKpiOperatoriHtml() {
  const byOp = {};
  _mlItems.forEach(it => {
    it.operatori.forEach(nome => {
      if (!byOp[nome]) byOp[nome] = { nome, cantieri: new Set(), commesse: new Set(), squadre: new Set() };
      byOp[nome].cantieri.add(it.cantiere);
      byOp[nome].commesse.add(it.commessa);
      byOp[nome].squadre.add(it.squadra);
    });
  });
  const lista = Object.values(byOp).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!lista.length) return '<div class="ml-note">Nessun operatore pianificato con i filtri attivi.</div>';
  return lista.map(o =>
    '<div class="ml-sec">' +
      '<div class="ml-sec-t">👷 ' + esc(o.nome) + '</div>' +
      '<div class="ml-kv"><span>Squadra</span><b>' + esc([...o.squadre].join(', ')) + '</b></div>' +
      '<div class="ml-kv"><span>Commessa</span><b>' + esc([...o.commesse].join(', ')) + '</b></div>' +
      '<div class="ml-kv"><span>Cantieri</span><b>' + esc([...o.cantieri].sort().join(', ')) + '</b></div>' +
    '</div>').join('');
}

function mlKpiNoGeoHtml() {
  const mancanti = _mlGroups.filter(g => !mlGeo(g.key));
  if (!mancanti.length) return '<div class="ml-note">Tutti i cantieri visibili sono localizzati.</div>';

  let html = '<div class="ml-note" style="margin-bottom:9px;">Questi cantieri non compaiono sulla mappa: il nome non è stato riconosciuto dal servizio di geocodifica. ' +
    'Scrivi il nome del comune corretto oppure le coordinate nella forma <b>45.123, 7.456</b> e premi Applica. ' +
    'La correzione entra nella rubrica luoghi condivisa, quindi vale per tutte le settimane e per tutti gli utenti.</div>';

  html += mancanti.map(g =>
    '<div class="ml-sec">' +
      '<div class="ml-sec-t">📍 ' + esc(g.cantiere) + '</div>' +
      '<div class="ml-kv"><span>Commessa</span><b>' + esc([...g.commesse].join(', ')) + '</b></div>' +
      '<div class="ml-fix">' +
        '<input type="text" class="ml-fix-input pw-write-action" data-cantiere="' + esc(g.cantiere) + '" placeholder="Comune oppure lat, lng">' +
        '<button class="ml-fix-btn pw-write-action" data-cantiere="' + esc(g.cantiere) + '">Applica</button>' +
      '</div>' +
    '</div>').join('');
  return html;
}

function mlBindGeoFix(root) {
  root.querySelectorAll('.ml-fix-btn').forEach(b => {
    b.onclick = () => {
      const inp = b.parentElement.querySelector('.ml-fix-input');
      if (inp) mlGeoFixSubmit(b.dataset.cantiere, inp);
    };
  });
  root.querySelectorAll('.ml-fix-input').forEach(inp => {
    inp.onkeydown = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); mlGeoFixSubmit(inp.dataset.cantiere, inp); }
    };
  });
}

/* Applica una correzione di posizione alla rubrica luoghi condivisa. Stessa
   semantica di pwMapGeoEditSubmit in Mappa squadre (coordinate diritte o nome da
   geocodificare, conferma esplicita perché la modifica è condivisa), riscritta qui
   perché quella è legata al markup e al re-render della Mappa squadre. */
async function mlGeoFixSubmit(cantiere, inp) {
  if (!sbGuardWrite()) return;
  const query = (inp.value || '').trim();
  if (!cantiere || !query) return;
  const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');

  let result = pwMapParseCoords(query);
  if (result) {
    result = { lat: result.lat, lng: result.lng, label: 'Coordinate manuali (' + result.lat + ', ' + result.lng + ')' };
  } else {
    inp.disabled = true;
    const precedente = inp.value;
    inp.value = 'Ricerca…';
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
      const res = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'StaffingDashboard/1.0' } });
      const data = await res.json();
      inp.disabled = false;
      inp.value = precedente;
      if (!data || !data.length) {
        inp.style.borderColor = '#ef4444';
        inp.placeholder = 'Non trovato, riprova…';
        return;
      }
      result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
      inp.style.borderColor = '';
    } catch (e) {
      inp.disabled = false;
      inp.value = precedente;
      inp.placeholder = 'Errore rete';
      return;
    }
  }

  const msg = 'Impostare la posizione di "' + cantiere + '" su:\n' + result.label +
              '\n(' + result.lat.toFixed(5) + ', ' + result.lng.toFixed(5) + ')?\n\n' +
              'La correzione vale per tutte le settimane e per tutti gli utenti.';
  if (!await showConfirmAsync(msg, 'Correggi posizione')) return;

  _geoCache[key] = result;
  await _geoCacheSaveSingle(key, result);
  await mlRender({ reloadJira: false, reloadProduzione: false, keepView: true });
  mlOpenKpi('nogeo');                      // riapre il pannello aggiornato (il cantiere corretto sparisce dall'elenco)
}

function mlKpiNoStatoHtml() {
  const senza = _mlGroups.filter(g => !g.stato);
  if (!senza.length) return '<div class="ml-note">Tutti i cantieri visibili hanno uno stato Jira.</div>';

  // Due cause diverse, e due rimedi diversi: vale la pena distinguerle invece di
  // presentare un unico elenco indistinto.
  const conSub = [];
  const senzaSub = [];
  senza.forEach(g => {
    const n = g.items.reduce((acc, it) => acc + (it.subtaskKeys || []).length, 0);
    (n ? conSub : senzaSub).push(g);
  });

  // Pulsante "Apri in Griglia" per ogni squadra del cantiere: per quelli senza
  // sottotask la Griglia è proprio il posto dove crearlo. Indici su _mlGroups
  // (non su `senza`) perché l'handler li risolve da lì, vedi mlBindGriglia.
  const puoGriglia = typeof sbCanSeePage !== 'function' || sbCanSeePage('weekly:griglia');
  const bottoni = g => {
    if (!puoGriglia) return '';
    const gi = _mlGroups.indexOf(g);
    return '<span class="ml-griglia-btns">' + g.items.map((it, ii) => it.loc
      ? '<button class="ml-link ml-griglia-link" data-ml-griglia-g="' + gi + '" data-ml-griglia="' + ii + '"' +
        ' title="Apri la Griglia settimanale su questa cella (' + esc(it.loc.label) + ')">📅 ' +
        (g.items.length > 1 ? esc(it.squadra) : 'Apri in Griglia') + '</button>'
      : '').join('') + '</span>';
  };
  const elenco = arr => '<div class="ml-cant-list">' + arr.map(g =>
    '<div class="ml-cant"><div class="ml-cant-h"><b>' + esc(g.cantiere) + '</b>' + bottoni(g) + '</div>' +
    '<div class="ml-cant-m">' + esc([...g.commesse].join(', ')) + '</div></div>').join('') + '</div>';

  let html = '';
  if (senzaSub.length) {
    html += '<div class="ml-sec">' +
      '<div class="ml-sec-t">Nessun sottotask Jira (' + senzaSub.length + ')</div>' +
      '<div class="ml-note" style="margin-bottom:7px;">Lo stato di un cantiere viene letto dal Task Jira, che si raggiunge solo passando dal sottotask. ' +
      'Per questi cantieri non ne è mai stato creato uno: si fa dalla Griglia in Pianificazione settimanale, pulsante "🎫 Sottotask Jira" della commessa.</div>' +
      elenco(senzaSub) + '</div>';
  }
  if (conSub.length) {
    html += '<div class="ml-sec">' +
      '<div class="ml-sec-t">Sottotask presente, stato non letto (' + conSub.length + ')</div>' +
      '<div class="ml-note" style="margin-bottom:7px;">Il sottotask esiste ma Jira non ha restituito il Task padre: il ticket può essere stato spostato o cancellato, ' +
      'oppure non è visibile all\'utenza Jira usata dall\'integrazione. Prova con "🔄 Aggiorna".</div>' +
      elenco(conSub) + '</div>';
  }
  return html;
}

/* Elenco laterale sinistro, allineato ai marker: cliccando una riga la mappa
   centra il cantiere e apre il drawer, come cliccando il pin. */
function mlRenderLista(groups, items) {
  const el = document.getElementById('ml-lista');
  if (!el) return;
  const tc = document.getElementById('ml-side-cantieri');
  const tm = document.getElementById('ml-side-commesse');
  if (tc) tc.classList.toggle('active', _mlSideTab !== 'commesse');
  if (tm) tm.classList.toggle('active', _mlSideTab === 'commesse');
  if (_mlSideTab === 'commesse') { mlRenderCommesseList(items); return; }
  if (!groups.length) {
    el.innerHTML = '<div class="ml-empty" style="padding:14px;">Nessun cantiere pianificato con i filtri attivi.</div>';
    return;
  }
  el.innerHTML = groups.map((g, idx) => {
    const geo = mlGeo(g.key);
    const stato = g.stato;
    const col = stato ? ML_STATUS_COLORS[stato] : '#cbd5e1';
    const lbl = stato ? ML_STATUS_LABELS[stato] : 'Stato non disponibile';
    const warn = geo ? '' : '<span class="ml-warn" title="Cantiere non localizzato da Nominatim">📍?</span>';
    return '<button class="ml-row" data-idx="' + idx + '">' +
      '<span class="ml-row-dot" style="background:' + esc(g.color) + '"></span>' +
      '<span class="ml-row-main">' +
        '<span class="ml-row-t">' + esc(g.cantiere) + ' ' + warn + '</span>' +
        '<span class="ml-row-s">' + esc([...g.commesse].join(', ')) + '</span>' +
      '</span>' +
      '<span class="ml-row-n" title="Operatori">' + g.nOperatori + '</span>' +
      '<span class="ml-row-st" style="background:' + esc(col) + '" title="' + esc(lbl) + '"></span>' +
    '</button>';
  }).join('');
  el.querySelectorAll('.ml-row').forEach(b => {
    b.onclick = () => mlFocusGruppo(parseInt(b.dataset.idx, 10));
  });
}

/* Scheda "Commesse" dell'elenco laterale: accesso diretto all'andamento di una
   commessa senza dover prima trovare e cliccare un suo cantiere sulla mappa.
   Ogni riga porta il conteggio dei cantieri e una barra con la ripartizione per
   stato; il click apre la stessa vista commessa del drawer. */
function mlRenderCommesseList(items) {
  const el = document.getElementById('ml-lista');
  if (!el) return;

  const byComm = {};
  const ordine = [];
  items.forEach(it => {
    if (!byComm[it.commessa]) {
      byComm[it.commessa] = { nome: it.commessa, color: it.color, cantieri: {}, operatori: new Set() };
      ordine.push(byComm[it.commessa]);
    }
    const c = byComm[it.commessa];
    const ck = it.cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!c.cantieri[ck]) c.cantieri[ck] = [];
    c.cantieri[ck].push(it);
    it.operatori.forEach(o => c.operatori.add(o));
  });

  if (!ordine.length) {
    el.innerHTML = '<div class="ml-empty" style="padding:14px;">Nessuna commessa con i filtri attivi.</div>';
    return;
  }
  ordine.sort((a, b) => a.nome.localeCompare(b.nome));

  const seg = (n, col) => n ? '<span class="ml-bar-seg" style="flex:' + n + ';background:' + col + '"></span>' : '';

  el.innerHTML = ordine.map(c => {
    const chiavi = Object.keys(c.cantieri);
    const cnt = { done: 0, indeterminate: 0, new: 0, nd: 0 };
    chiavi.forEach(ck => { cnt[mlStatoGruppo({ items: c.cantieri[ck] }) || 'nd']++; });
    const titolo = chiavi.length + ' cantieri · ' + cnt.done + ' completati · ' + cnt.indeterminate + ' in corso · ' +
                   cnt.new + ' da fare · ' + cnt.nd + ' senza stato';
    return '<button class="ml-row ml-row-comm" data-comm="' + esc(c.nome) + '" title="' + esc(titolo) + '">' +
      '<span class="ml-row-dot" style="background:' + esc(c.color) + '"></span>' +
      '<span class="ml-row-main">' +
        '<span class="ml-row-t">' + esc(c.nome) + '</span>' +
        '<span class="ml-row-s">' + chiavi.length + ' cantieri · ' + c.operatori.size + ' operatori</span>' +
        '<span class="ml-bar">' +
          seg(cnt.done, ML_STATUS_COLORS.done) + seg(cnt.indeterminate, ML_STATUS_COLORS.indeterminate) +
          seg(cnt.new, ML_STATUS_COLORS.new) + seg(cnt.nd, '#cbd5e1') +
        '</span>' +
      '</span>' +
    '</button>';
  }).join('');

  el.querySelectorAll('.ml-row-comm').forEach(b => {
    b.onclick = () => mlOpenCommessa(b.dataset.comm);
  });
}

function mlSwitchSideTab(tab) {
  if (_mlSideTab === tab) return;
  _mlSideTab = tab;
  try { localStorage.setItem('ml_side_tab', tab); } catch (_) {}
  mlRender({ reloadJira: false, reloadProduzione: false, keepView: true });
}

function mlFocusGruppo(idx) {
  const g = _mlGroups[idx];
  if (!g) return;
  const geo = mlGeo(g.key);
  if (geo) _mlMap.setView([geo.lat, geo.lng], Math.max(_mlMap.getZoom(), 11), { animate: true });
  mlOpenDettaglio(idx);
}

/* ----- Drawer dettaglio cantiere ----- */

function mlCloseDrawer() {
  _mlSelCantiere = null;
  const d = document.getElementById('ml-drawer');
  if (d) d.classList.add('hidden');
}

function mlOpenDettaglio(idx, silent) {
  const g = _mlGroups[idx];
  if (!g) return;
  _mlSelCantiere = g.key;
  const d = document.getElementById('ml-drawer');
  const body = document.getElementById('ml-drawer-body');
  const title = document.getElementById('ml-drawer-title');
  if (!d || !body) return;
  d.classList.remove('hidden');
  if (title) title.textContent = g.cantiere;
  body.innerHTML = mlDettaglioHtml(g);
  // Handler agganciati via addEventListener e non con onclick="..." inline: i nomi
  // di commessa contengono apostrofi (vedi convenzione jsAttr/esc in CLAUDE.md) e
  // qui il valore viaggia in un data-attribute, mai dentro codice JS interpolato.
  // Per questo l'escape è esc() e NON jsAttr(): jsAttr trasforma "D'Ivrea" in
  // "D\'Ivrea" — corretto dentro una stringa JS, ma qui il browser restituirebbe
  // la barra rovescia in dataset e il confronto col nome originale fallirebbe.
  body.querySelectorAll('[data-ml-commessa]').forEach(b => {
    b.onclick = () => mlOpenCommessa(b.dataset.mlCommessa);
  });
  body.querySelectorAll('[data-ml-griglia]').forEach(b => {
    b.onclick = () => { const it = g.items[parseInt(b.dataset.mlGriglia, 10)]; if (it) mlGoToGriglia(it.loc); };
  });
  body.querySelectorAll('[data-ml-storico]').forEach(b => {
    b.onclick = () => msOpenStoricoCantiere(g.cantiere);
  });
  if (!silent) body.scrollTop = 0;
  mlEnsureStrumenti(g.items.reduce((acc, it) => acc.concat(it.strumenti || []), []));
}

/* Pulsanti "Apri in Griglia" dei pannelli KPI: gruppo e voce arrivano come indici
   su _mlGroups / g.items, mai come nomi, così nessun apostrofo passa per un handler. */
function mlBindGriglia(root) {
  root.querySelectorAll('[data-ml-griglia-g]').forEach(b => {
    b.onclick = () => {
      const g = _mlGroups[parseInt(b.dataset.mlGrigliaG, 10)];
      const it = g && g.items[parseInt(b.dataset.mlGriglia, 10)];
      if (it) mlGoToGriglia(it.loc);
    };
  });
}

/* Porta alla Griglia settimanale sulla cella (commessa/squadra/operatore/giorno)
   della voce. È una scelta esplicita dell'utente, quindi qui — e solo qui — la
   settimana della Griglia viene spostata su quella della Mappa. switchScreen()
   ricarica pwData e ridisegna in asincrono: si attende che la cella compaia e poi
   si riusa pwGoToSearchCell (espande commessa/squadra collassate, scrolla, evidenzia). */
function mlGoToGriglia(loc) {
  if (!loc) return;
  pwAnno = Number(loc.anno);
  pwWeek = Number(loc.week);
  _pwActiveTab = 'griglia';
  switchScreen('weekly');
  const sel = '#pw-view-griglia .pw-day-cell[data-cidx="' + loc.cIdx + '"][data-sidx="' + loc.sIdx +
    '"][data-oidx="' + loc.oIdx + '"][data-day="' + loc.day + '"]';
  let tentativi = 0;
  const attendi = () => {
    const vg = document.getElementById('pw-view-griglia');
    const pronta = vg && !vg.classList.contains('hidden') && pwAnno === Number(loc.anno) && pwWeek === Number(loc.week);
    if (pronta && document.querySelector(sel)) { pwGoToSearchCell(loc.cIdx, loc.sIdx, loc.oIdx, loc.day); return; }
    if (++tentativi < 40) setTimeout(attendi, 100);
  };
  setTimeout(attendi, 100);
}

/* Nomi degli strumenti (GAR-190 -> "GAR-190 · Mavic 3"): vengono dalla cache
   pw_strumenti_cache, che si riempie solo premendo "aggiorna strumenti" in Griglia.
   Se nel browser manca qualche chiave la si scarica in silenzio una volta per
   sessione e si ridisegna il pannello; se fallisce restano le sole chiavi. */
let _mlStrumentiFetched = false;
async function mlEnsureStrumenti(keys) {
  if (_mlStrumentiFetched || typeof _sbClient === 'undefined' || !_sbClient || !_sbUser) return;
  const manca = keys.some(k => k && k.indexOf('forn:') !== 0 && !pwStrumenti.some(s => s.key === k));
  if (!manca) return;
  _mlStrumentiFetched = true;
  try {
    const { data, error } = await _sbClient.functions.invoke('jira-list-strumenti', { body: {} });
    if (error || !data || data.error || !Array.isArray(data.strumenti)) return;
    pwStrumenti = data.strumenti;
    try { localStorage.setItem('pw_strumenti_cache', JSON.stringify(pwStrumenti)); } catch (_) {}
    if (_mlSelCantiere && mlIsActive()) {
      const i = _mlGroups.findIndex(x => x.key === _mlSelCantiere);
      if (i >= 0) mlOpenDettaglio(i, true);
    }
  } catch (_) {}
}

function mlDettaglioHtml(g) {
  const dateISO = mlDateISO(_mlDay);
  let html = '<div class="ml-sec"><div class="ml-sec-t">Meteo</div>' + mlMeteoHtml(g, dateISO) + '</div>';

  const puoGriglia = typeof sbCanSeePage !== 'function' || sbCanSeePage('weekly:griglia');
  g.items.forEach((it, i) => {
    html += '<div class="ml-sec">';
    html += '<div class="ml-sec-t"><span class="ml-row-dot" style="background:' + esc(it.color) + '"></span>' + esc(it.squadra) +
      (puoGriglia && it.loc ? '<button class="ml-link ml-griglia-link" data-ml-griglia="' + i + '" title="Apri la Griglia settimanale su questa cella (' + esc(it.loc.label) + ')">📅 Apri in Griglia</button>' : '') +
      '</div>';
    html += '<div class="ml-kv"><span>Commessa</span><b><button class="ml-link" data-ml-commessa="' + esc(it.commessa) + '">' + esc(it.commessa) + '</button></b></div>';
    if (it.attivita) html += '<div class="ml-kv"><span>Attività</span><b>' + esc(it.attivita) + '</b></div>';
    html += '<div class="ml-kv"><span>Operatori</span><b>' + esc(it.operatori.join(', ')) + '</b></div>';
    if (_mlDay === ML_ALL && it.weeks.length) {
      html += '<div class="ml-kv"><span>Settimane</span><b>' + esc(it.weeks.join(', ')) + '</b></div>';
    } else if (_mlDay === ML_WEEK && it.giorni.length) {
      html += '<div class="ml-kv"><span>Giorni</span><b>' + it.giorni.map(d => ML_DAY_SHORT[d]).join(' · ') + '</b></div>';
    }
    if (it.strumenti && it.strumenti.length) {
      html += '<div class="ml-kv"><span>Strumenti</span><b>' + it.strumenti.map(k => esc(pwStrLabel(k))).join('<br>') + '</b></div>';
    }
    html += mlProduzioneHtml(it);
    html += mlTaskHtml(mlTasksOf(it));
    html += '</div>';
  });

  return html;
}

function mlMeteoHtml(g, dateISO) {
  const puoStorico = typeof sbCanSeePage !== 'function' || sbCanSeePage('weekly:meteo-storico');
  const linkStorico = puoStorico
    ? '<button class="ml-link" data-ml-storico="1" title="Meteo osservato di questo cantiere in tutti i giorni in cui è stato pianificato">🌦️ Storico meteo del cantiere</button>'
    : '';
  if (!dateISO) return '<div class="ml-note">Seleziona un giorno per vedere la previsione.</div>' + linkStorico;
  const info = pwMeteoInfoFor(g.cantiere, dateISO);
  if (!info) return '<div class="ml-note">' + esc(pwMeteoMissingReason(g.cantiere, dateISO)) + '</div>' + linkStorico;

  let html = '<div class="ml-meteo-head">' +
    '<span class="ml-meteo-ico">' + pwMeteoIconFor(info.code) + '</span>' +
    '<span class="ml-meteo-t">' + (info.tmin != null ? Math.round(info.tmin) + '° / ' : '') +
      (info.tmax != null ? Math.round(info.tmax) + '°' : '') + '</span>' +
    (pwMeteoRainLabel(info) ? '<span class="ml-meteo-p">' + pwMeteoRainLabel(info) + '</span>' : '') +
    (info.storico ? '<span class="ml-note" style="margin-left:6px;">osservato</span>' : '') +
  '</div>';

  const fasce = pwFasceOrarieFor(info);
  if (fasce.length) {
    html += '<div class="ml-meteo-fasce">' + fasce.map(h =>
      '<div class="ml-fascia"><div class="ml-fascia-h">' + esc(h.hour) + '</div>' +
      '<div class="ml-fascia-i">' + pwMeteoIconFor(h.code) + '</div>' +
      '<div class="ml-fascia-t">' + (h.temp != null ? Math.round(h.temp) + '°' : '—') + '</div></div>'
    ).join('') + '</div>';
  }

  const pcCol = pcColorePeggiore(pcInfoFor(g.cantiere, dateISO));
  if (pcCol) {
    html += '<div class="ml-alert ml-pc-' + esc(pcCol) + '">▲ Allerta Protezione Civile: ' + esc(pcCol) + '</div>';
  }
  return html + linkStorico;
}

/* Ore e km realmente registrati in Controllo Produzione per gli operatori di
   questa voce. In vista settimana somma i giorni coperti dalla voce. */
function mlProduzioneHtml(it) {
  // Vista storico: totale cumulato per cantiere, già aggregato da mlLoadProduzioneStorico
  // (la chiave per operatore/giorno non è utilizzabile, i giorni appartengono a settimane diverse).
  if (_mlDay === ML_ALL) {
    const agg = _mlCpCantiere[it.commessa + '|||' + it.squadra + '|||' + it.cantiere];
    if (!agg) return '';
    return '<div class="ml-kv"><span>Produzione</span><b>' +
      (Math.round(agg.ore * 10) / 10) + ' h · ' + (Math.round(agg.km * 10) / 10) + ' km/cad <i style="color:#94a3b8;font-weight:400;">(totale)</i></b></div>';
  }
  const giorni = _mlDay === ML_WEEK ? it.giorni : [_mlDay];
  let ore = 0, km = 0, trovati = 0;
  it.operatori.forEach(nome => {
    giorni.forEach(d => {
      const r = _mlCp[it.commessa + '|||' + it.squadra + '|||' + nome + '|||' + d];
      if (!r) return;
      trovati++;
      if (r.ore_jira != null) ore += Number(r.ore_jira) || 0;
      if (r.km_cad != null) km += Number(r.km_cad) || 0;
    });
  });
  if (!trovati) return '';
  return '<div class="ml-kv"><span>Produzione</span><b>' +
    (Math.round(ore * 10) / 10) + ' h · ' + (Math.round(km * 10) / 10) + ' km/cad</b></div>';
}

function mlTaskHtml(tasks) {
  if (!tasks.length) return '<div class="ml-note">' + esc(ML_STATUS_NOTA) + '</div>';
  return tasks.map(t => {
    const col = ML_STATUS_COLORS[t.statusCategory] || '#94a3b8';
    const lbl = t.status || ML_STATUS_LABELS[t.statusCategory] || 'n/d';
    let h = '<div class="ml-task">' +
      '<a class="ml-task-k" href="' + esc(t.url || '') + '" target="_blank" rel="noopener">' + esc(t.key) + '</a>' +
      '<span class="ml-badge" style="background:' + esc(col) + '">' + esc(lbl) + '</span>' +
      '<div class="ml-task-s">' + esc(t.summary || '') + '</div>';
    if (t.epicKey) h += '<div class="ml-task-e">🟣 ' + esc(t.epicName || t.epicKey) + '</div>';
    if (t.targetProduction != null) h += '<div class="ml-task-e">🎯 Target ' + esc(String(t.targetProduction)) + '</div>';
    if (t.assignee) h += '<div class="ml-task-e">👤 ' + esc(t.assignee) + '</div>';
    return h + '</div>';
  }).join('');
}

/* ----- Drawer commessa ----- */

/* Dati della commessa attualmente aperta nel drawer, tenuti a parte perché
   l'elenco dei cantieri si ri-filtra e si riordina senza rileggere nulla: Jira e
   controllo_produzione vengono interrogati una volta sola, all'apertura. */
let _mlComm = null;                       // { nome, meta, cantieri, prod, statoCompleto }
let _mlCommFiltro = { q: '', stati: new Set(), sort: 'nome' };
/* Le due letture remote di mlOpenCommessa durano secondi: se nel frattempo si apre
   un'altra commessa, la risposta lenta della prima non deve sovrascrivere la seconda. */
let _mlCommSeq = 0;

const ML_COMM_SORT = [
  { v: 'nome',       l: 'Nome A-Z' },
  { v: 'nome-desc',  l: 'Nome Z-A' },
  { v: 'stato',      l: 'Stato' },
  { v: 'settimana',  l: 'Settimana (recenti)' },
  { v: 'produzione', l: 'Produzione (km)' },
];

/* Vista commessa: anagrafica completa, documenti allegati e tutti i cantieri di
   quella commessa presenti in pwData (tutte le settimane, non solo quella mostrata),
   con stato Jira dove noto e produzione totale. Risponde a "quali cantieri sono
   attivi e quali già fatti". La produzione viene riletta da controllo_produzione
   senza filtro di settimana. */
async function mlOpenCommessa(nome) {
  const d = document.getElementById('ml-drawer');
  const body = document.getElementById('ml-drawer-body');
  const title = document.getElementById('ml-drawer-title');
  if (!d || !body) return;
  // Azzera il cantiere selezionato: altrimenti il primo mlRender() successivo
  // rimpiazzerebbe questa vista commessa col dettaglio del cantiere aperto prima.
  _mlSelCantiere = null;
  d.classList.remove('hidden');
  if (title) title.textContent = nome;
  body.innerHTML = '<div class="ml-note">⏳ Caricamento…</div>';

  const seq = ++_mlCommSeq;
  const meta = (typeof getCommessaAttivaMeta === 'function') ? getCommessaAttivaMeta(nome) : {};

  // Primo giro solo per raccogliere le chiavi dei sottotask di TUTTE le settimane
  // della commessa, non solo di quella a video: senza questa chiamata un cantiere
  // lavorato in una settimana mai aperta resterebbe "Stato n/d" pur avendo un Task
  // Jira con stato noto. Poi si ricostruisce l'elenco con gli stati appena scaricati.
  const statoCompleto = await mlEnsureTaskStatus(mlCantieriDiCommessa(nome).flatMap(c => c.subtaskKeys));
  const cantieri = mlCantieriDiCommessa(nome);
  const prod = await mlLoadProduzioneCommessa(nome);
  if (seq !== _mlCommSeq) return;         // nel frattempo è stata aperta un'altra commessa

  _mlComm = { nome, meta, cantieri, prod, statoCompleto };
  _mlCommFiltro = { q: '', stati: new Set(), sort: 'nome' };
  body.innerHTML = mlCommessaHtml();
  mlBindCommessa(body);
  body.scrollTop = 0;
}

function mlCommessaHtml() {
  const c = _mlComm;
  if (!c) return '';
  let html = mlCommessaMetaHtml(c.meta, c.cantieri.length);
  html += mlCommessaDocsHtml(c.meta);

  html += '<div class="ml-sec"><div class="ml-sec-t">Cantieri</div>';
  if (!c.statoCompleto) {
    html += '<div class="ml-note">Commessa molto grande: lo stato Jira è stato caricato solo in parte, alcuni cantieri restano "Stato n/d".</div>';
  }
  if (!c.cantieri.length) {
    html += '<div class="ml-note">Nessun cantiere pianificato per questa commessa.</div></div>';
    return html;
  }
  html += '<div class="ml-comm-tools">' +
    '<input id="ml-comm-q" type="text" placeholder="cerca cantiere&hellip;">' +
    '<select id="ml-comm-sort" title="Ordinamento dei cantieri">' +
      ML_COMM_SORT.map(o => '<option value="' + o.v + '">' + esc(o.l) + '</option>').join('') +
    '</select>' +
  '</div>';
  html += '<div id="ml-comm-stati" class="ml-chips" style="margin-bottom:6px;"></div>';
  html += '<div id="ml-comm-n" class="ml-comm-n"></div>';
  html += '<div id="ml-comm-cant"></div>';
  html += '</div>';
  return html;
}

/* Anagrafica: gli stessi campi del modal "Modifica commessa attiva" del Dashboard,
   in sola lettura. Le voci vuote non vengono stampate, così una commessa con pochi
   metadati non produce una colonna di righe vuote. */
function mlCommessaMetaHtml(meta, nCantieri) {
  const m = meta || {};
  const kv = (label, val) => val ? '<div class="ml-kv"><span>' + esc(label) + '</span><b>' + esc(String(val)) + '</b></div>' : '';
  const dt = v => (v && typeof fmtDate === 'function') ? fmtDate(String(v).slice(0, 10)) : (v || '');
  const tags = (label, arr) => (arr && arr.length)
    ? '<div class="ml-kv"><span>' + esc(label) + '</span><b class="ml-tags">' +
      arr.map(x => '<span class="ml-tag">' + esc(String(x)) + '</span>').join('') + '</b></div>'
    : '';

  let html = '<div class="ml-sec">';
  html += kv('Cliente', m.cliente);
  html += kv('Codice', m.codice_commessa);
  html += kv('Industry', m.industry);
  html += kv('Progetto Jira', m.jira_project_code);
  html += kv('Luogo', [m.provincia, m.regione].filter(x => x).join(' · '));
  html += kv('Periodo', [dt(m.inizio), dt(m.fine)].filter(x => x).join(' → '));
  if (m.risorse_necessarie != null && m.risorse_necessarie !== '') {
    html += kv('Risorse', m.risorse_necessarie + ' previste' + (m._risorseAttuali != null ? ' · ' + m._risorseAttuali + ' allocate' : ''));
  } else if (m._risorseAttuali) {
    html += kv('Risorse allocate', m._risorseAttuali);
  }
  html += kv('Referente', m.email_referente);
  html += tags('Skills', m.skills);
  html += tags('Attestati', m.attestati_richiesti);
  html += tags('DPI', m.dpi_richiesti);
  html += kv('Note', m.note);
  html += '<div class="ml-kv"><span>Cantieri</span><b>' + nCantieri + '</b></div>';
  if (m._dedotto) {
    html += '<div class="ml-note" style="margin-top:5px;">Anagrafica dedotta dallo staffing: questa commessa non ha ancora metadati salvati nel Dashboard.</div>';
  }
  html += '</div>';
  return html;
}

/* Documenti allegati alla commessa (bucket privato "commesse-docs"): qui solo in
   lettura — caricamento ed eliminazione restano nel Dashboard, che è la schermata
   di modifica. Il link viene firmato al click e non generato ora: gli URL firmati
   di Supabase Storage scadono dopo 60 secondi. */
function mlCommessaDocsHtml(meta) {
  const docs = (meta && meta.documenti) || [];
  if (!docs.length) return '';
  let html = '<div class="ml-sec"><div class="ml-sec-t">📎 Documenti <span class="ml-note">(' + docs.length + ')</span></div>';
  html += docs.map(d => {
    const info = [
      (typeof _cmFmtFileSize === 'function' && d.size != null) ? _cmFmtFileSize(d.size) : '',
      d.caricato_da || '',
      (d.caricato_il && typeof fmtDate === 'function') ? fmtDate(String(d.caricato_il).slice(0, 10)) : '',
    ].filter(x => x).join(' · ');
    return '<div>' +
      '<button class="ml-doc" data-ml-doc="' + esc(d.path || '') + '" title="Scarica ' + esc(d.nome_file || '') + '">📄 ' + esc(d.nome_file || d.path || '') + '</button>' +
      (info ? '<div class="ml-doc-m">' + esc(info) + '</div>' : '') +
    '</div>';
  }).join('');
  return html + '</div>';
}

function mlBindCommessa(body) {
  // Handler via addEventListener e mai con onclick="..." inline: nomi di file e di
  // commessa contengono apostrofi (vedi convenzione jsAttr/esc in CLAUDE.md).
  // Il percorso viaggia in un data-attribute riletto via dataset, quindi esc().
  body.querySelectorAll('[data-ml-doc]').forEach(b => {
    b.onclick = () => {
      if (typeof cmDownloadDocumento === 'function') cmDownloadDocumento(b.dataset.mlDoc);
      else showAlertModal('Download documenti non disponibile.');
    };
  });

  const q = document.getElementById('ml-comm-q');
  if (q) {
    let t = null;
    q.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => { _mlCommFiltro.q = q.value || ''; mlRenderCommessaCantieri(); }, 180);
    };
  }
  const sort = document.getElementById('ml-comm-sort');
  if (sort) {
    sort.value = _mlCommFiltro.sort;
    sort.onchange = () => { _mlCommFiltro.sort = sort.value; mlRenderCommessaCantieri(); };
  }
  mlRenderCommessaStati();
  mlRenderCommessaCantieri();
}

/* Chip di stato del drawer commessa: indipendenti da quelle della toolbar (che
   filtrano la mappa) e con il conteggio dei cantieri, calcolato sempre sul totale
   della commessa così i numeri non ballano mentre si filtra. */
function mlRenderCommessaStati() {
  const el = document.getElementById('ml-comm-stati');
  if (!el || !_mlComm) return;
  const cnt = { new: 0, indeterminate: 0, done: 0, nd: 0 };
  _mlComm.cantieri.forEach(c => { cnt[c.stato || 'nd']++; });
  el.innerHTML = ML_STATI_FILTRO.map(s => {
    const col = ML_STATUS_COLORS[s.v] || '#cbd5e1';
    return '<button class="ml-chip' + (_mlCommFiltro.stati.has(s.v) ? ' active' : '') +
      '" style="--chip:' + col + '" data-v="' + s.v + '">' + esc(s.l) +
      '<span class="ml-chip-n">' + cnt[s.v] + '</span></button>';
  }).join('');
  el.querySelectorAll('.ml-chip').forEach(b => {
    b.onclick = () => {
      mlToggleSet(_mlCommFiltro.stati, b.dataset.v);
      mlRenderCommessaStati();
      mlRenderCommessaCantieri();
    };
  });
}

function mlRenderCommessaCantieri() {
  const el = document.getElementById('ml-comm-cant');
  if (!el || !_mlComm) return;
  const f = _mlCommFiltro;
  const prod = _mlComm.prod || {};
  const q = (f.q || '').toLowerCase().trim();
  const lista = _mlComm.cantieri.filter(c => {
    if (q && c.cantiere.toLowerCase().indexOf(q) === -1) return false;
    if (f.stati.size && !f.stati.has(c.stato || 'nd')) return false;
    return true;
  });

  // "In corso" prima di "Da fare" e "Completato" per ultimo: l'ordinamento per stato
  // serve a vedere subito su cosa si sta lavorando, non a raggruppare alfabeticamente.
  const rank = { indeterminate: 0, new: 1, done: 2, nd: 3 };
  const km = c => ((prod[c.key] || {}).km) || 0;
  const ultimaWeek = c => (c.weeks && c.weeks.length) ? c.weeks[c.weeks.length - 1] : '';
  lista.sort((a, b) => {
    if (f.sort === 'nome-desc') return b.cantiere.localeCompare(a.cantiere);
    if (f.sort === 'stato') {
      const d = rank[a.stato || 'nd'] - rank[b.stato || 'nd'];
      if (d) return d;
    } else if (f.sort === 'settimana') {
      const d = ultimaWeek(b).localeCompare(ultimaWeek(a));
      if (d) return d;
    } else if (f.sort === 'produzione') {
      const d = km(b) - km(a);
      if (d) return d;
    }
    return a.cantiere.localeCompare(b.cantiere);
  });

  const n = document.getElementById('ml-comm-n');
  if (n) {
    n.textContent = lista.length === _mlComm.cantieri.length
      ? _mlComm.cantieri.length + ' cantieri'
      : lista.length + ' di ' + _mlComm.cantieri.length + ' cantieri';
  }

  if (!lista.length) {
    el.innerHTML = '<div class="ml-note">Nessun cantiere con i filtri attivi.</div>';
    return;
  }
  el.innerHTML = lista.map(c => {
    const col = c.stato ? ML_STATUS_COLORS[c.stato] : '#cbd5e1';
    const lbl = c.stato ? ML_STATUS_LABELS[c.stato] : 'Stato n/d';
    const p = prod[c.key];
    let h = '<div class="ml-cant">' +
      '<div class="ml-cant-h"><span class="ml-badge" style="background:' + esc(col) + '">' + esc(lbl) + '</span>' +
      '<b>' + esc(c.cantiere) + '</b></div>';
    h += '<div class="ml-cant-m">Settimane: ' + esc(c.weeks.join(', ')) + '</div>';
    if (p) h += '<div class="ml-cant-m">' + (Math.round(p.ore * 10) / 10) + ' h · ' + (Math.round(p.km * 10) / 10) + ' km/cad</div>';
    return h + '</div>';
  }).join('');
}

/* Tutti i cantieri di una commessa in pwData, con le settimane in cui compaiono e
   lo stato del Task quando risolvibile. Usa _mlTasks/_mlTaskBySubtask popolati dal
   render corrente: i cantieri di settimane non ancora visitate compaiono comunque,
   ma senza stato finché non li si guarda. */
function mlCantieriDiCommessa(nome) {
  const byKey = {};
  const out = [];
  Object.keys(pwData).forEach(anno => {
    if (!/^\d{4}$/.test(anno)) return;    // pwData ospita anche chiavi non-anno (es. noteGenerali)
    const perWeek = pwData[anno] || {};
    Object.keys(perWeek).forEach(week => {
      (perWeek[week] || []).forEach(bc => {
        if (bc.commessa !== nome) return;
        const jiraMap = bc.jiraSubtask || {};
        (bc.squadre || []).forEach(sq => {
          (sq.operatori || []).forEach(op => {
            for (let d = 0; d < 6; d++) {
              pwCellCantieri((op.giorni || {})[d]).forEach(cantiere => {
                const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
                if (!byKey[key]) {
                  byKey[key] = { key, cantiere, weeks: new Set(), cats: new Set(), subtaskKeys: new Set() };
                  out.push(byKey[key]);
                }
                byKey[key].weeks.add(mlWeekLabel(anno, week));
                const sub = jiraMap[cantiere + '|||' + op.nome];
                if (!sub || !sub.key) return;
                byKey[key].subtaskKeys.add(sub.key);
                const tk = _mlTaskBySubtask[sub.key];
                const t = tk ? _mlTasks[tk] : null;
                if (t && t.statusCategory) byKey[key].cats.add(t.statusCategory);
              });
            }
          });
        });
      });
    });
  });

  out.forEach(c => {
    const cats = c.cats;
    c.weeks = [...c.weeks].sort();
    c.subtaskKeys = [...c.subtaskKeys];
    c.stato = cats.has('indeterminate') ? 'indeterminate'
            : cats.has('new') ? 'new'
            : cats.has('done') ? 'done' : null;
    delete c.cats;
  });
  out.sort((a, b) => a.cantiere.localeCompare(b.cantiere));
  return out;
}

/* Ore/km cumulati per cantiere di una singola commessa, su tutte le settimane.
   Paginato come mlLoadProduzioneStorico: una commessa lunga supera agevolmente
   il tetto di 1000 righe per risposta di PostgREST, e senza paginazione i totali
   risulterebbero silenziosamente troncati. */
async function mlLoadProduzioneCommessa(nome) {
  const prod = {};
  if (!_sbClient || !_sbUser) return prod;
  const PAGE = 1000;
  const MAX_PAGES = 20;
  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const { data, error } = await _sbClient
        .from('controllo_produzione')
        .select('cantiere,ore_jira,km_cad')
        .eq('commessa', nome)
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      rows.forEach(r => {
        const k = (r.cantiere || '').toLowerCase().trim().replace(/\s+/g, ' ');
        if (!k) return;
        if (!prod[k]) prod[k] = { ore: 0, km: 0 };
        if (r.ore_jira != null) prod[k].ore += Number(r.ore_jira) || 0;
        if (r.km_cad != null) prod[k].km += Number(r.km_cad) || 0;
      });
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    console.error('mlLoadProduzioneCommessa error:', e);
  }
  return prod;
}

/* ----- Auto-refresh ----- */

/* Il polling riguarda solo Jira e la produzione: la pianificazione arriva già via
   Realtime (vedi mlOnDataChanged). Si ferma quando la tab del browser non è
   visibile o quando non si è sullo screen Mappa, per non consumare rate-limit Jira
   a vuoto. */
function mlStartAutoRefresh() {
  mlStopAutoRefresh();
  if (!_mlAuto) return;
  _mlTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!mlIsActive()) return;
    mlRender({ keepView: true });
  }, ML_REFRESH_MS);
}

function mlStopAutoRefresh() {
  if (_mlTimer) { clearInterval(_mlTimer); _mlTimer = null; }
}

function mlIsActive() {
  const el = document.getElementById('screen-mappa');
  return !!el && !el.classList.contains('hidden');
}

function mlToggleAuto(on) {
  _mlAuto = !!on;
  try { localStorage.setItem('ml_auto', _mlAuto ? '1' : '0'); } catch (_) {}
  if (_mlAuto) mlStartAutoRefresh(); else mlStopAutoRefresh();
}

/* Chiamata quando pwData cambia (pull Realtime da un altro utente): ridisegna
   senza rifare le chiamate Jira, che non c'entrano con quella modifica. */
function mlOnDataChanged() {
  mlInvalidateItems();
  if (!mlIsActive()) return;
  mlRender({ reloadJira: false, keepView: true });
}

/* ----- Ingresso nello screen ----- */

function mlEnter() {
  try { _mlAuto = localStorage.getItem('ml_auto') !== '0'; } catch (_) { _mlAuto = true; }
  try { _mlSideTab = localStorage.getItem('ml_side_tab') === 'commesse' ? 'commesse' : 'cantieri'; } catch (_) {}
  // pwData può essere cambiato mentre si era su un altro screen (modifiche in Griglia).
  mlInvalidateItems();
  mlJiraCacheLoad();
  if (_mlAnno == null || _mlWeek == null) mlGoToday();
  mlInit();
  setTimeout(() => {
    _mlMap.invalidateSize();
    mlRender({});
    mlStartAutoRefresh();
  }, 60);
}

/* Handler della toolbar, agganciati una sola volta all'avvio (vedi il primo
   DOMContentLoaded in dashboard-alerts-render.js). */
function mlBindToolbar() {
  const prev = document.getElementById('ml-prev');
  const next = document.getElementById('ml-next');
  const today = document.getElementById('ml-today');
  const anno = document.getElementById('ml-anno');
  const week = document.getElementById('ml-week');
  const clear = document.getElementById('ml-filtro-clear');
  const auto = document.getElementById('ml-auto');
  const refresh = document.getElementById('ml-refresh');
  const closeBtn = document.getElementById('ml-drawer-close');

  if (prev) prev.onclick = () => mlShiftWeek(-1);
  if (next) next.onclick = () => mlShiftWeek(1);
  if (today) today.onclick = () => { mlGoToday(); mlRender({}); };
  if (anno) anno.onchange = () => { _mlAnno = parseInt(anno.value, 10); mlRender({}); };
  if (week) week.onchange = () => { _mlWeek = parseInt(week.value, 10); mlRender({}); };
  if (clear) clear.onclick = () => mlClearFiltri();
  if (auto) auto.onchange = () => mlToggleAuto(auto.checked);
  // "Aggiorna" forza la rilettura da Jira anche in vista storico, dove il ciclo
  // normale si limita a riempire i buchi usando la cache.
  if (refresh) refresh.onclick = () => mlRender({ keepView: true, forceJira: true });
  if (closeBtn) closeBtn.onclick = () => mlCloseDrawer();

  const sideC = document.getElementById('ml-side-cantieri');
  const sideM = document.getElementById('ml-side-commesse');
  if (sideC) sideC.onclick = () => mlSwitchSideTab('cantieri');
  if (sideM) sideM.onclick = () => mlSwitchSideTab('commesse');

  // Le ricerche di colonna restringono solo l'elenco delle chip: nulla cambia sulla
  // mappa finché non si seleziona qualcosa, quindi basta ridisegnare i filtri —
  // un mlRender() completo qui rifarebbe geocodifica e meteo a ogni tasto premuto.
  mlBindSearchColonna('ml-search-commesse', v => { _mlSearchCommesse = v; });
  mlBindSearchColonna('ml-search-operatori', v => { _mlSearchOperatori = v; });
  mlBindSearchColonna('ml-search-regioni', v => { _mlSearchRegioni = v; });
  mlBindSearchColonna('ml-search-cantieri', v => { _mlSearchCantieri = v; });
}

function mlBindSearchColonna(id, setter) {
  const inp = document.getElementById(id);
  if (!inp) return;
  let t = null;
  inp.oninput = () => {
    clearTimeout(t);
    t = setTimeout(() => { setter(inp.value || ''); mlRenderFiltri(); }, 180);
  };
}

function mlShiftWeek(delta) {
  let w = _mlWeek + delta;
  let a = _mlAnno;
  if (w < 1) { a -= 1; w = weeksInYear(a); }
  else if (w > weeksInYear(a)) { a += 1; w = 1; }
  _mlAnno = a;
  _mlWeek = w;
  mlRender({});
}
