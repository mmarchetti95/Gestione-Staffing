/* ==================== STORICO METEO (giorni passati, meteo osservato) ====================
   Le previsioni (weekly-meteo.js) coprono solo da oggi in avanti e vivono nella cache del
   browser: passata la giornata il meteo non restava da nessuna parte. Qui, per ogni
   cantiere+giorno GIÀ TRASCORSO pianificato in Griglia, si salva su Supabase il meteo
   realmente osservato, condiviso tra tutti gli utenti:
     - meteo_storico (pos_key "lat,lon" 2 decimali + data): archivio Open-Meteo
       (archive-api.open-meteo.com, gratuito, senza API key) — condizione, min/max, pioggia
       caduta in mm, dettaglio orario. I giorni degli ultimi MS_DEFINITIVO_GIORNI sono
       "provvisori" (l'archivio si consolida nei giorni successivi) e vengono riscaricati
       una volta diventati definitivi; dopo non cambiano più.
     - pc_storico (data + cantiere): criticità del bollettino Protezione Civile DI QUEL
       GIORNO (sezione "oggi"), dal repo GitHub pcm-dpc che conserva tutti i bollettini
       dal 2020. Salvata già abbinata al cantiere (null = comune non trovato), così non
       serve riscaricare il topojson (~1 MB/giorno) ad ogni consultazione.
   Non essendo possibile recuperare "la previsione che si vedeva allora", per il passato
   si mostra sempre l'osservato. Il recupero parte da solo: priorità alla settimana/giorno
   visibile (Griglia, Mappa, tab Storico meteo), poi in background tutta la pianificazione
   dal primo inserimento (msStartBackfill). Tutte le scritture sono upsert idempotenti:
   più utenti che recuperano lo stesso giorno in contemporanea non creano problemi. */

const MS_DEFINITIVO_GIORNI = 7;           // sotto questa età il dato archivio è provvisorio
const MS_PROVVISORIO_TTL_MS = 12 * 60 * 60 * 1000;
const MS_PC_MIN_DATE = '2020-01-01';      // primo bollettino nel repo pcm-dpc
const MS_PC_MAX_GIORNI_SESSIONE = 60;     // tetto download bollettini per il recupero in background
const MS_MAX_RIGHE_TABELLA = 1500;

/* "lat,lon|data" -> { code, tmax, tmin, precip, hourly: [{hour,temp,code,precip}] | null
   (null = righe lette senza dettaglio orario), definitivo, at } */
let _meteoStorico = {};
/* data -> { cantiereKey: {zona, idraulico, temporali, idrogeologico} | null } */
let _pcStorico = {};

/* Data odierna LOCALE (non UTC): tra mezzanotte e le 2 toISOString() darebbe ancora ieri. */
function meteoTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function msKeyOf(cantiere) {
  return cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
}
function msAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function msIsDefinitivo(dateISO) {
  return dateISO <= msAddDays(meteoTodayISO(), -MS_DEFINITIVO_GIORNI);
}
function msSleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
function msCanSync() {
  return typeof _sbClient !== 'undefined' && !!_sbClient && typeof _sbUser !== 'undefined' && !!_sbUser;
}

/* Coda: un recupero alla volta, così Griglia, Mappa, tab Storico e backfill non scaricano
   in parallelo gli stessi giorni. Il backfill accoda una settimana per volta, quindi una
   richiesta della vista corrente aspetta al massimo una settimana di backfill. */
let _msQueue = Promise.resolve();
function msRun(fn) {
  const p = _msQueue.then(fn, fn);
  _msQueue = p.catch(() => {});
  return p;
}

/* ----- Lettura da Supabase ----- */

const _msLoaded = new Set();   // "start|end|h" già letti in questa sessione
function msRowToEntry(r, prev) {
  return {
    code: r.code, tmax: r.tmax, tmin: r.tmin, precip: r.precip_mm,
    // una lettura senza orario non deve cancellare l'orario già in memoria
    hourly: Array.isArray(r.hourly) ? r.hourly : (prev ? prev.hourly : null),
    definitivo: !!r.definitivo,
    at: r.updated_at ? Date.parse(r.updated_at) : 0,
  };
}

async function msSelectAll(buildQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* Carica in memoria lo storico di un intervallo di date. Con hourly:false non scarica il
   dettaglio orario (il tab Storico può coprire mesi: basta l'aggregato giornaliero). */
async function msLoadRange(startISO, endISO, opts) {
  if (!msCanSync() || !startISO || !endISO || startISO > endISO) return;
  const hourly = !opts || opts.hourly !== false;
  if (_msLoaded.has(startISO + '|' + endISO + '|h') || (!hourly && _msLoaded.has(startISO + '|' + endISO + '|'))) return;
  try {
    const cols = 'pos_key,data,code,tmax,tmin,precip_mm,definitivo,updated_at' + (hourly ? ',hourly' : '');
    const meteo = await msSelectAll(() => _sbClient.from('meteo_storico').select(cols)
      .gte('data', startISO).lte('data', endISO).order('data').order('pos_key'));
    meteo.forEach(r => {
      const mk = r.pos_key + '|' + r.data;
      _meteoStorico[mk] = msRowToEntry(r, _meteoStorico[mk]);
    });
    const pc = await msSelectAll(() => _sbClient.from('pc_storico').select('data,cantiere_key,info')
      .gte('data', startISO).lte('data', endISO).order('data').order('cantiere_key'));
    pc.forEach(r => {
      if (!_pcStorico[r.data]) _pcStorico[r.data] = {};
      _pcStorico[r.data][r.cantiere_key] = r.info || null;
    });
    _msLoaded.add(startISO + '|' + endISO + '|' + (hourly ? 'h' : ''));
  } catch (e) {
    console.warn('[storico meteo] lettura Supabase fallita', e);
  }
}

async function msUpsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 200) {
    try {
      const { error } = await _sbClient.from(table).upsert(rows.slice(i, i + 200), { onConflict });
      if (error) throw error;
    } catch (e) {
      console.warn('[storico meteo] salvataggio ' + table + ' fallito', e);
    }
  }
}

/* ----- Recupero dalle fonti ----- */

async function msFetchArchive(lat, lng, startISO, endISO) {
  const out = {};
  try {
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lng +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum' +
      '&hourly=temperature_2m,weathercode,precipitation' +
      '&timezone=Europe%2FRome&start_date=' + startISO + '&end_date=' + endISO;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const d = data && data.daily;
    const h = data && data.hourly;
    if (!d || !Array.isArray(d.time)) return out;
    const hourlyByDate = {};
    if (h && Array.isArray(h.time)) {
      h.time.forEach((ts, i) => {
        const dateISO = ts.slice(0, 10);
        if (!hourlyByDate[dateISO]) hourlyByDate[dateISO] = [];
        hourlyByDate[dateISO].push({
          hour: ts.slice(11, 16),
          temp: h.temperature_2m[i],
          code: h.weathercode[i],
          precip: (h.precipitation || [])[i] ?? null,
        });
      });
    }
    d.time.forEach((dateISO, i) => {
      // Giorno non ancora presente in archivio: non si salva nulla, si riprova più avanti.
      if (d.weathercode[i] == null && d.temperature_2m_max[i] == null) return;
      out[dateISO] = {
        code: d.weathercode[i],
        tmax: d.temperature_2m_max[i],
        tmin: d.temperature_2m_min[i],
        precip: (d.precipitation_sum || [])[i] ?? null,
        hourly: hourlyByDate[dateISO] || [],
      };
    });
  } catch (e) {
    console.warn('[storico meteo] archivio Open-Meteo non raggiungibile per', lat, lng, e);
  }
  return out;
}

/* Elenco bollettini del repo PC: "YYYYMMDD" -> nome file dell'ultima edizione del giorno.
   Due chiamate API GitHub (limite anonimo 60/ora), fatte una volta l'ora al massimo. */
let _msPcFiles = null, _msPcFilesAt = 0, _msPcDisabled = false;
const _msPcNoFile = new Set();
let _msPcBudgetUsed = 0;
async function msPcFiles() {
  if (_msPcFiles && Date.now() - _msPcFilesAt < 60 * 60 * 1000) return _msPcFiles;
  const rootRes = await fetch('https://api.github.com/repos/' + PC_REPO + '/contents/');
  if (!rootRes.ok) throw new Error('HTTP ' + rootRes.status);
  const filesDir = ((await rootRes.json()) || []).find(e => e.name === 'files' && e.type === 'dir');
  if (!filesDir) throw new Error('cartella files/ non trovata');
  const treeRes = await fetch('https://api.github.com/repos/' + PC_REPO + '/git/trees/' + filesDir.sha);
  if (!treeRes.ok) throw new Error('HTTP ' + treeRes.status);
  const map = {};
  ((await treeRes.json()).tree || []).map(t => t.path).filter(p => /^\d{8}_\d{4}\.json$/.test(p)).sort()
    .forEach(p => { map[p.slice(0, 8)] = p; });   // ordinati: resta l'ultima edizione del giorno
  _msPcFiles = map;
  _msPcFilesAt = Date.now();
  return map;
}

/* Criticità per comune del bollettino pubblicato nel giorno dateISO (sezione "oggi"). */
async function msPcGiorno(dateISO) {
  const files = await msPcFiles();
  const name = files[dateISO.replace(/-/g, '')];
  if (!name) return null;
  const idxRes = await fetch('https://raw.githubusercontent.com/' + PC_REPO + '/master/files/' + name);
  if (!idxRes.ok) throw new Error('HTTP ' + idxRes.status);
  const index = await idxRes.json();
  const sez = index && index.today;
  if (!sez || !sez.topo_json) return null;
  return { name, byComune: await pcParseGiorno(sez.topo_json) };
}

/* Serve (ri)scaricare il meteo di questa posizione/giorno? Sì se manca, o se era
   provvisorio ed è diventato definitivo / è vecchio di oltre 12 ore. */
function msMeteoNeeded(posKey, dateISO) {
  const e = _meteoStorico[posKey + '|' + dateISO];
  if (!e) return true;
  if (e.definitivo) return false;
  return msIsDefinitivo(dateISO) || (Date.now() - (e.at || 0)) > MS_PROVVISORIO_TTL_MS;
}

/* Recupera e salva tutto ciò che manca per le coppie {cantiere, dateISO} passate.
   Restituisce true se ha aggiunto qualcosa (per decidere se ridisegnare). */
async function msEnsurePast(pairs, opts) {
  const o = opts || {};
  if (!msCanSync()) return false;
  const today = meteoTodayISO();
  pairs = pairs.filter(p => p && p.cantiere && p.dateISO && p.dateISO < today);
  if (!pairs.length) return false;
  let changed = false;

  // 1. Geocodifica dei cantieri mai cercati (rate-limit Nominatim: 1 richiesta/secondo)
  const visti = new Set();
  for (const p of pairs) {
    const k = msKeyOf(p.cantiere);
    if (visti.has(k)) continue;
    visti.add(k);
    if (!(k in _geoCache)) { await geocodifica(p.cantiere); await msSleep(1100); }
  }

  // 2. Meteo osservato: una chiamata archivio per posizione, sull'intervallo dei giorni mancanti
  const byPos = new Map();
  pairs.forEach(p => {
    const geo = meteoGeoFor(p.cantiere);
    if (!geo) return;
    const pk = meteoPosKey(geo);
    if (!msMeteoNeeded(pk, p.dateISO)) return;
    if (!byPos.has(pk)) byPos.set(pk, { lat: geo.lat, lng: geo.lng, dates: new Set() });
    byPos.get(pk).dates.add(p.dateISO);
  });
  for (const [pk, e] of byPos) {
    const dates = [...e.dates].sort();
    const got = await msFetchArchive(e.lat, e.lng, dates[0], dates[dates.length - 1]);
    const nowIso = new Date().toISOString();
    const rows = [];
    dates.forEach(d => {
      const x = got[d];
      if (!x) return;
      const definitivo = msIsDefinitivo(d);
      _meteoStorico[pk + '|' + d] = Object.assign({}, x, { definitivo, at: Date.now() });
      rows.push({ pos_key: pk, data: d, lat: e.lat, lng: e.lng, code: x.code, tmax: x.tmax, tmin: x.tmin,
        precip_mm: x.precip, hourly: x.hourly, definitivo, updated_at: nowIso });
    });
    if (rows.length) { await msUpsert('meteo_storico', rows, 'pos_key,data'); changed = true; }
    await msSleep(150);
  }

  // 3. Bollettino Protezione Civile del giorno, abbinato a ciascun cantiere
  const byDate = new Map();
  pairs.forEach(p => {
    if (p.dateISO < MS_PC_MIN_DATE || _msPcNoFile.has(p.dateISO)) return;
    const k = msKeyOf(p.cantiere);
    const g = _pcStorico[p.dateISO];
    if (g && k in g) return;
    if (!byDate.has(p.dateISO)) byDate.set(p.dateISO, new Set());
    byDate.get(p.dateISO).add(k);
  });
  const dateOrdinate = [...byDate.keys()].sort().reverse();   // prima i giorni più recenti
  for (const d of dateOrdinate) {
    if (_msPcDisabled) break;
    if (o.pcBudget && _msPcBudgetUsed >= MS_PC_MAX_GIORNI_SESSIONE) break;
    let res;
    try {
      res = await msPcGiorno(d);
    } catch (e) {
      // GitHub filtrato dalla rete aziendale o limite orario superato: stop per la sessione,
      // il meteo Open-Meteo resta comunque disponibile.
      console.warn('[storico meteo] bollettino PC non recuperabile, sospeso per questa sessione', e);
      _msPcDisabled = true;
      break;
    }
    if (o.pcBudget) _msPcBudgetUsed++;
    if (!res) { _msPcNoFile.add(d); continue; }
    if (!_pcStorico[d]) _pcStorico[d] = {};
    const nowIso = new Date().toISOString();
    const rows = [...byDate.get(d)].map(k => {
      const info = pcMatchComune(res.byComune, k) || null;
      _pcStorico[d][k] = info;
      return { data: d, cantiere_key: k, info, bollettino: res.name, updated_at: nowIso };
    });
    await msUpsert('pc_storico', rows, 'data,cantiere_key');
    changed = true;
  }
  return changed;
}

/* Entry point usato da Griglia e Mappa: legge da Supabase l'intervallo visibile, poi
   accoda il recupero di quanto manca. */
async function msEnsureAndLoad(pairs, startISO, endISO) {
  await msLoadRange(startISO, endISO, { hourly: true });
  return msRun(() => msEnsurePast(pairs));
}

/* ----- Cantiere+giorno pianificati (tutta la pianificazione) ----- */

/* Una riga per giorno+commessa+squadra+cantiere nei giorni passati dell'intervallo, con gli
   operatori coinvolti e la prima cella di Griglia (per "Apri in Griglia"). */
function msBuildRows(dalISO, alISO) {
  const today = meteoTodayISO();
  const byKey = new Map();
  Object.keys(pwData || {}).forEach(anno => {
    const weeks = pwData[anno] || {};
    Object.keys(weeks).forEach(week => {
      const data = weeks[week];
      if (!Array.isArray(data) || !data.length) return;
      const monday = isoWeekToMonday(Number(anno), Number(week));
      for (let di = 0; di < 6; di++) {
        const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + di);
        const dateISO = d.toISOString().slice(0, 10);
        if (dateISO >= today || (dalISO && dateISO < dalISO) || (alISO && dateISO > alISO)) continue;
        data.forEach((bc, cIdx) => (bc.squadre || []).forEach((sq, sIdx) => (sq.operatori || []).forEach((op, oIdx) => {
          pwCellCantieri((op.giorni || {})[di]).forEach(cantiere => {
            const commessa = bc.commessa || '(senza commessa)';
            const squadra = sq.nome || '';
            const k = dateISO + '|' + commessa + '|' + squadra + '|' + msKeyOf(cantiere);
            let r = byKey.get(k);
            if (!r) {
              r = { dateISO, commessa, squadra, cantiere, operatori: [],
                loc: { anno: Number(anno), week: Number(week), cIdx, sIdx, oIdx, day: di } };
              byKey.set(k, r);
            }
            if (op.nome && r.operatori.indexOf(op.nome) === -1) r.operatori.push(op.nome);
          });
        })));
      }
    });
  });
  return [...byKey.values()];
}

function msPairsOf(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach(r => {
    const k = r.dateISO + '|' + msKeyOf(r.cantiere);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ cantiere: r.cantiere, dateISO: r.dateISO });
  });
  return out;
}

function msPrimaData() {
  let min = null;
  msBuildRows(null, null).forEach(r => { if (!min || r.dateISO < min) min = r.dateISO; });
  return min;
}

/* ----- Recupero in background dal primo inserimento ----- */

let _msBackfillStarted = false;
let _msProgress = { running: false, done: 0, total: 0 };
async function msStartBackfill(tentativo) {
  if (_msBackfillStarted) return;
  const n = tentativo || 0;
  const riprova = () => { if (n < 20) setTimeout(() => msStartBackfill(n + 1), 15000); };
  // Serve essere loggati e avere la pianificazione in memoria: all'avvio arrivano dopo
  // (login + primo pull Supabase), quindi si riprova ogni 15 s per qualche minuto.
  if (!msCanSync()) { riprova(); return; }
  const ieri = msAddDays(meteoTodayISO(), -1);
  // pwLoad() solo se la pianificazione non è ancora in memoria: ricaricarla sotto i piedi
  // di chi sta modificando la Griglia non serve (pwData è già quello aggiornato).
  if (!msBuildRows(null, ieri).length) { try { await pwLoad(); } catch (_) {} }
  const righe = msBuildRows(null, ieri);
  if (!righe.length) { riprova(); return; }
  if (_msBackfillStarted) return;
  _msBackfillStarted = true;
  if (typeof _geoCacheLoading !== 'undefined' && _geoCacheLoading) { try { await _geoCacheLoading; } catch (_) {} }
  const prima = righe.reduce((m, r) => (r.dateISO < m ? r.dateISO : m), ieri);
  await msLoadRange(prima, ieri, { hourly: false });

  // Una settimana (lunedì ISO) alla volta, dalla più recente alla prima pianificata.
  const perSettimana = new Map();
  msPairsOf(righe).forEach(p => {
    const d = new Date(p.dateISO + 'T00:00:00Z');
    const lun = msAddDays(p.dateISO, -((d.getUTCDay() + 6) % 7));
    if (!perSettimana.has(lun)) perSettimana.set(lun, []);
    perSettimana.get(lun).push(p);
  });
  const settimane = [...perSettimana.keys()].sort().reverse();
  _msProgress = { running: true, done: 0, total: settimane.length };
  msUpdateStatus();
  for (const lun of settimane) {
    const changed = await msRun(() => msEnsurePast(perSettimana.get(lun), { pcBudget: true }));
    _msProgress.done++;
    msUpdateStatus();
    if (changed) msOnStoricoChanged();
    await msSleep(500);
  }
  _msProgress.running = false;
  msUpdateStatus();
}

/* Dopo un recupero riuscito: aggiorna ciò che è aperto (badge Griglia, tab Storico). */
function msOnStoricoChanged() {
  const weeklyEl = document.getElementById('screen-weekly');
  if (!weeklyEl || weeklyEl.classList.contains('hidden')) return;
  if (_pwActiveTab === 'griglia') pwApplyMeteoBadgesToDom();
  else if (_pwActiveTab === 'meteo-storico') msScheduleRender();
}

/* ==================== TAB "STORICO METEO" (Pianificazione Settimanale) ==================== */

const METEO_DESCR = {
  0: 'Sereno', 1: 'Prevalentemente sereno', 2: 'Parzialmente nuvoloso', 3: 'Coperto',
  45: 'Nebbia', 48: 'Nebbia con brina',
  51: 'Pioviggine debole', 53: 'Pioviggine', 55: 'Pioviggine intensa', 56: 'Pioviggine gelata', 57: 'Pioviggine gelata intensa',
  61: 'Pioggia debole', 63: 'Pioggia moderata', 65: 'Pioggia forte', 66: 'Pioggia gelata', 67: 'Pioggia gelata forte',
  71: 'Neve debole', 73: 'Neve moderata', 75: 'Neve forte', 77: 'Nevischio',
  80: 'Rovesci deboli', 81: 'Rovesci', 82: 'Rovesci violenti', 85: 'Rovesci di neve', 86: 'Rovesci di neve forti',
  95: 'Temporale', 96: 'Temporale con grandine', 99: 'Temporale con grandine forte',
};
function msMeteoDescr(code) {
  return METEO_DESCR[code] || (code != null ? 'Codice ' + code : '');
}

let _msFiltri = { dal: null, al: null, q: '' };
/* Filtri per colonna, combinabili tra loro (AND tra colonne, OR tra i valori scelti di una
   stessa colonna): col -> Set(valori ammessi) per le colonne a elenco, {min, max} per quelle
   numeriche. Colonna assente = nessun filtro. */
let _msColFiltri = {};
/* Ordinamento multiplo: click sull'intestazione = ordina solo per quella colonna (secondo
   click inverte), Maiusc+click = aggiunge/inverte un criterio successivo. */
let _msSort = [{ col: 'data', dir: 'desc' }];
let _msAllRows = [];         // righe del periodo + ricerca libera, con meteo/PC calcolati
let _msRows = [];            // dopo i filtri di colonna e l'ordinamento (tabella + export)
let _msUiInited = false;
let _msFillKey = null;       // intervallo per cui è già stato avviato il recupero
let _msRenderTimer = null;

function msScheduleRender() {
  clearTimeout(_msRenderTimer);
  _msRenderTimer = setTimeout(() => { if (_pwActiveTab === 'meteo-storico') msRender(); }, 400);
}

function msDefaultRange() {
  const ieri = msAddDays(meteoTodayISO(), -1);
  return { dal: msAddDays(ieri, -29), al: ieri };
}

const MS_SEV_LABEL = { alta: 'Alto', media: 'Medio' };
const MS_PC_RANK = { rossa: 3, arancione: 2, gialla: 1 };

/* Colonne della tabella: val = valore usato da filtro (e ordinamento, salvo sortVal),
   lbl = come mostrarlo nell'elenco del filtro, order = ordine dell'elenco del filtro. */
const MS_COLS = [
  { key: 'data', label: 'Data', type: 'cat', val: r => r.dateISO, lbl: v => msFormatData(v), order: (a, b) => b.localeCompare(a) },
  { key: 'commessa', label: 'Commessa', type: 'cat', val: r => r.commessa },
  { key: 'squadra', label: 'Squadra', type: 'cat', val: r => r.squadra || '(senza nome)' },
  { key: 'cantiere', label: 'Cantiere', type: 'cat', val: r => r.cantiere },
  { key: 'meteo', label: 'Meteo', type: 'cat', val: r => (r.info ? msMeteoDescr(r.info.code) : 'Non disponibile'),
    sortVal: r => (r.info ? r.info.code : null) },
  { key: 'tmin', label: 'Min', type: 'num', unit: '°C', val: r => (r.info ? r.info.tmin : null) },
  { key: 'tmax', label: 'Max', type: 'num', unit: '°C', val: r => (r.info ? r.info.tmax : null) },
  { key: 'pioggia', label: 'Pioggia', type: 'num', unit: 'mm', val: r => (r.info ? r.info.precip : null),
    presets: [{ label: '≥ 1 mm', min: 1 }, { label: '≥ 8 mm', min: 8 }, { label: '≥ 20 mm', min: 20 }, { label: 'Asciutto (< 1 mm)', max: 0.9 }] },
  { key: 'maltempo', label: 'Maltempo', type: 'cat', val: r => MS_SEV_LABEL[r.severity] || 'Nessuno',
    sortVal: r => (r.severity === 'alta' ? 2 : r.severity === 'media' ? 1 : 0),
    order: (a, b) => ['Alto', 'Medio', 'Nessuno'].indexOf(a) - ['Alto', 'Medio', 'Nessuno'].indexOf(b) },
  { key: 'pc', label: 'Allerta PC', type: 'cat', val: r => r.pcColor || 'Nessuna', sortVal: r => MS_PC_RANK[r.pcColor] || 0,
    lbl: v => (v === 'Nessuna' ? v : 'Allerta ' + v), order: (a, b) => (MS_PC_RANK[b] || 0) - (MS_PC_RANK[a] || 0) },
  { key: 'operatori', label: 'Operatori', type: 'cat', multi: true, val: r => (r.operatori.length ? r.operatori : ['(nessuno)']),
    sortVal: r => r.operatori.join(', ') },
];
function msCol(key) {
  return MS_COLS.find(c => c.key === key);
}

function msInitUi() {
  if (_msUiInited) return;
  _msUiInited = true;
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('ms-dal', 'change', e => { _msFiltri.dal = e.target.value || null; msRender(); });
  on('ms-al', 'change', e => { _msFiltri.al = e.target.value || null; msRender(); });
  on('ms-q', 'input', e => { _msFiltri.q = e.target.value; msScheduleRender(); });
  on('ms-export', 'click', () => msExportExcel());
  document.querySelectorAll('[data-ms-range]').forEach(b => b.addEventListener('click', () => msSetRange(b.dataset.msRange)));

  // Un solo listener per tabella, riquadri e chip: il contenuto viene ridisegnato spesso.
  const table = document.getElementById('ms-table');
  if (table) {
    table.addEventListener('click', e => {
      const f = e.target.closest('[data-ms-filter]');
      if (f) { e.stopPropagation(); msOpenPop(f.dataset.msFilter, f); return; }
      const s = e.target.closest('[data-ms-sort]');
      if (s) { msToggleSort(s.dataset.msSort, e.shiftKey); return; }
      const tr = e.target.closest('[data-ms-row]');
      if (tr) msOpenDettaglio(parseInt(tr.dataset.msRow, 10));
    });
    table.addEventListener('scroll', () => msClosePop());
  }
  on('ms-kpi', 'click', e => { const t = e.target.closest('[data-ms-kpi]'); if (t) msKpiFilter(t.dataset.msKpi); });
  on('ms-chips', 'click', e => {
    const c = e.target.closest('[data-ms-chip]');
    if (!c) return;
    const k = c.dataset.msChip;
    if (k === '*') { _msColFiltri = {}; _msFiltri.q = ''; const q = document.getElementById('ms-q'); if (q) q.value = ''; msRender(); return; }
    if (k === 'q') { _msFiltri.q = ''; const q = document.getElementById('ms-q'); if (q) q.value = ''; msRender(); return; }
    delete _msColFiltri[k];
    msApply();
  });
  window.addEventListener('resize', () => msClosePop());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') msClosePop(); });
}

function msSetRange(kind) {
  const ieri = msAddDays(meteoTodayISO(), -1);
  if (kind === 'all') _msFiltri.dal = msPrimaData() || ieri;
  else _msFiltri.dal = msAddDays(ieri, -(Number(kind) - 1));
  _msFiltri.al = ieri;
  msRender();
}

/* Aperto dal dettaglio cantiere della Mappa: tutto lo storico di quel cantiere. */
function msOpenStoricoCantiere(cantiere) {
  _msFiltri = { dal: msPrimaData() || msDefaultRange().dal, al: msAddDays(meteoTodayISO(), -1), q: '' };
  _msColFiltri = cantiere ? { cantiere: new Set([cantiere]) } : {};
  _pwActiveTab = 'meteo-storico';
  switchScreen('weekly');
}

function msUpdateStatus() {
  const el = document.getElementById('ms-status');
  if (!el) return;
  if (_msProgress.running) {
    el.textContent = '⏳ Recupero storico dal primo inserimento: settimana ' + _msProgress.done + ' di ' + _msProgress.total + '…';
  } else if (_msProgress.total) {
    el.textContent = '✓ Storico aggiornato' + (_msPcDisabled ? ' (bollettino PC non raggiungibile in questa sessione)' : '');
  } else {
    el.textContent = '';
  }
}

function msRowSeverity(r) {
  const sev = pwMeteoSeverityFor(r.info);
  const pcSev = r.pcColor === 'gialla' ? 'media' : (r.pcColor ? 'alta' : null);
  return sev === 'alta' || pcSev === 'alta' ? 'alta' : (sev || pcSev);
}

function msFormatData(dateISO) {
  const d = new Date(dateISO + 'T00:00:00Z');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
function msFormatDataLunga(dateISO) {
  const d = new Date(dateISO + 'T00:00:00Z');
  const s = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ----- Filtri, ordinamento ----- */

function msPassCol(r, col, f) {
  const v = col.val(r);
  if (col.type === 'num') {
    if (f.min != null && (v == null || v < f.min)) return false;
    if (f.max != null && (v == null || v > f.max)) return false;
    return true;
  }
  return col.multi ? v.some(x => f.has(x)) : f.has(v);
}

/* Righe che passano tutti i filtri di colonna, eventualmente ignorando quello di una colonna
   (serve all'elenco valori del filtro stesso: mostra ciò che resta con gli ALTRI filtri). */
function msApplyColFilters(rows, exceptKey) {
  const attivi = MS_COLS.filter(c => c.key !== exceptKey && _msColFiltri[c.key]);
  if (!attivi.length) return rows.slice();
  return rows.filter(r => attivi.every(c => msPassCol(r, c, _msColFiltri[c.key])));
}

function msSortVal(col, r) {
  if (col.sortVal) return col.sortVal(r);
  const v = col.val(r);
  return col.multi ? v.join(', ') : v;
}

function msComparator(a, b) {
  for (const s of _msSort) {
    const col = msCol(s.col);
    if (!col) continue;
    const va = msSortVal(col, a), vb = msSortVal(col, b);
    const na = va == null || va === '', nb = vb == null || vb === '';
    if (na && nb) continue;
    if (na) return 1;          // valori mancanti sempre in fondo, in entrambi i versi
    if (nb) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'it', { sensitivity: 'base', numeric: true });
    if (c) return s.dir === 'desc' ? -c : c;
  }
  return b.dateISO.localeCompare(a.dateISO) || a.commessa.localeCompare(b.commessa) || a.cantiere.localeCompare(b.cantiere);
}

function msToggleSort(key, add) {
  const col = msCol(key);
  if (!col) return;
  const defDir = col.type === 'num' || key === 'data' || key === 'maltempo' || key === 'pc' ? 'desc' : 'asc';
  const i = _msSort.findIndex(s => s.col === key);
  if (add) {
    if (i === -1) _msSort.push({ col: key, dir: defDir });
    else _msSort[i].dir = _msSort[i].dir === 'asc' ? 'desc' : 'asc';
  } else if (i === 0 && _msSort.length === 1) {
    _msSort[0].dir = _msSort[0].dir === 'asc' ? 'desc' : 'asc';
  } else {
    _msSort = [{ col: key, dir: i === -1 ? defDir : _msSort[i].dir }];
  }
  msApply();
}

function msKpiFilter(kind) {
  if (kind === 'all') _msColFiltri = {};
  else if (kind === 'pioggia') _msColFiltri.pioggia = { min: 1, max: null };
  else if (kind === 'maltempo') _msColFiltri.maltempo = new Set(['Alto', 'Medio']);
  else if (kind === 'pc') _msColFiltri.pc = new Set(['gialla', 'arancione', 'rossa']);
  msApply();
}

/* ----- Render ----- */

async function msRender() {
  const view = document.getElementById('pw-view-meteo-storico');
  if (!view) return;
  msInitUi();
  if (!_msFiltri.dal || !_msFiltri.al) Object.assign(_msFiltri, msDefaultRange());
  if (_msFiltri.dal > _msFiltri.al) { const t = _msFiltri.dal; _msFiltri.dal = _msFiltri.al; _msFiltri.al = t; }
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && el.value !== v) el.value = v; };
  setVal('ms-dal', _msFiltri.dal);
  setVal('ms-al', _msFiltri.al);
  setVal('ms-q', _msFiltri.q || '');

  await msLoadRange(_msFiltri.dal, _msFiltri.al, { hourly: false });
  if (_pwActiveTab !== 'meteo-storico') return;

  const q = (_msFiltri.q || '').toLowerCase().trim();
  let rows = msBuildRows(_msFiltri.dal, _msFiltri.al);
  if (q) rows = rows.filter(r => (r.cantiere + ' ' + r.squadra + ' ' + r.commessa + ' ' + r.operatori.join(' ')).toLowerCase().indexOf(q) !== -1);
  rows.forEach(r => {
    r.info = pwMeteoInfoFor(r.cantiere, r.dateISO);
    r.pcInfo = pcInfoFor(r.cantiere, r.dateISO);
    r.pcColor = pcColorePeggiore(r.pcInfo);
    r.severity = msRowSeverity(r);
  });
  _msAllRows = rows;
  msApply();
  msUpdateStatus();

  // Recupero di quanto manca nell'intervallo mostrato (tutti i cantieri, non solo i filtrati)
  const fillKey = _msFiltri.dal + '|' + _msFiltri.al;
  if (_msFillKey !== fillKey) {
    _msFillKey = fillKey;
    const pairs = msPairsOf(msBuildRows(_msFiltri.dal, _msFiltri.al));
    msRun(() => msEnsurePast(pairs)).then(changed => {
      if (changed && _pwActiveTab === 'meteo-storico') msRender();
    });
  }
}

/* Riapplica filtri di colonna e ordinamento sulle righe già calcolate (nessuna lettura). */
function msApply() {
  const rows = msApplyColFilters(_msAllRows, null);
  rows.sort(msComparator);
  _msRows = rows;
  msRenderKpi();
  msRenderChips();
  msRenderTable(rows);
  if (_msPop) msRenderPopList();
}

function msRenderKpi() {
  const el = document.getElementById('ms-kpi');
  if (!el) return;
  const rows = _msRows;
  const conMeteo = rows.filter(r => r.info).length;
  const pioggia = rows.filter(r => r.info && r.info.precip != null && r.info.precip >= 1).length;
  const maltempo = rows.filter(r => r.severity).length;
  const allerte = rows.filter(r => r.pcColor).length;
  const f = _msColFiltri;
  const attivo = {
    all: !Object.keys(f).length,
    pioggia: !!(f.pioggia && f.pioggia.min === 1 && f.pioggia.max == null),
    maltempo: !!(f.maltempo && f.maltempo.size === 2 && f.maltempo.has('Alto') && f.maltempo.has('Medio')),
    pc: !!(f.pc && f.pc.size === 3 && !f.pc.has('Nessuna')),
  };
  const tile = (kind, label, val, sub, tone) =>
    '<button type="button" data-ms-kpi="' + kind + '" class="ms-kpi ms-kpi-' + tone + (attivo[kind] ? ' ms-kpi-on' : '') + '" title="' +
      (kind === 'all' ? 'Rimuovi i filtri di colonna' : 'Mostra solo queste righe') + '">' +
      '<span class="ms-kpi-l">' + label + '</span><span class="ms-kpi-v">' + val + '</span>' +
      (sub ? '<span class="ms-kpi-s">' + sub + '</span>' : '') +
    '</button>';
  const pct = n => (rows.length ? Math.round(n / rows.length * 100) + '% dei giorni' : '');
  const tot = _msAllRows.length;
  el.innerHTML =
    tile('all', 'Giorni-cantiere', rows.length + (rows.length !== tot ? '<span class="ms-kpi-of"> / ' + tot + '</span>' : ''),
      conMeteo < rows.length ? (rows.length - conMeteo) + ' senza meteo (in recupero o non localizzati)' : 'tutti con meteo', 'slate') +
    tile('pioggia', '🌧️ Con pioggia (≥ 1 mm)', pioggia, pct(pioggia), 'sky') +
    tile('maltempo', '⚠️ Maltempo', maltempo, 'pioggia ≥ 8 mm, neve, temporali o allerta', 'amber') +
    tile('pc', '▲ Allerte Protezione Civile', allerte, 'bollettino del giorno', 'red');
}

function msFiltroTesto(col, f) {
  if (col.type === 'num') {
    const u = ' ' + col.unit;
    if (f.min != null && f.max != null) return 'tra ' + f.min + ' e ' + f.max + u;
    return f.min != null ? '≥ ' + f.min + u : '≤ ' + f.max + u;
  }
  const lbl = col.lbl || (v => v);
  const vals = [...f].map(lbl);
  if (!vals.length) return 'nessun valore';
  return vals.slice(0, 2).join(', ') + (vals.length > 2 ? ' +' + (vals.length - 2) : '');
}

function msRenderChips() {
  const el = document.getElementById('ms-chips');
  if (!el) return;
  const chips = [];
  if (_msFiltri.q) chips.push('<span class="ms-chip">Ricerca: <b>' + esc(_msFiltri.q) + '</b><button data-ms-chip="q" title="Rimuovi">✕</button></span>');
  MS_COLS.forEach(c => {
    const f = _msColFiltri[c.key];
    if (f) chips.push('<span class="ms-chip">' + esc(c.label) + ': <b>' + esc(msFiltroTesto(c, f)) + '</b><button data-ms-chip="' + c.key + '" title="Rimuovi">✕</button></span>');
  });
  if (chips.length > 1) chips.push('<button class="ms-chip-clear" data-ms-chip="*">Azzera tutti i filtri</button>');
  const sortTxt = _msSort.map((s, i) => (i ? ', poi ' : '') + msCol(s.col).label + (s.dir === 'asc' ? ' ↑' : ' ↓')).join('');
  el.innerHTML = (chips.length ? chips.join('') : '<span class="ms-chip-none">Nessun filtro di colonna — usa ⏷ nelle intestazioni</span>') +
    '<span class="ms-sort-txt">Ordinato per ' + esc(sortTxt) + ' · Maiusc+click su un\'intestazione per aggiungere un criterio</span>';
}

function msRainHtml(v) {
  if (v == null) return '<span class="ms-muted">—</span>';
  const mm = Math.round(v * 10) / 10;
  const cls = v >= 20 ? 'ms-rain-4' : v >= 8 ? 'ms-rain-3' : v >= 1 ? 'ms-rain-2' : v > 0 ? 'ms-rain-1' : 'ms-rain-0';
  return '<span class="ms-rain ' + cls + '">' + (v > 0 ? mm + ' mm' : '0') + '</span>';
}

function msPcCellHtml(r) {
  if (!r.pcColor) return '<span class="ms-muted">—</span>';
  return '<span class="ms-pc ms-pc-' + esc(r.pcColor) + '">▲ ' + esc(r.pcColor) + '</span>';
}

function msOperatoriHtml(ops) {
  if (!ops.length) return '<span class="ms-muted">—</span>';
  const vis = ops.slice(0, 2).map(esc).join(', ');
  return '<span title="' + esc(ops.join(', ')) + '">' + vis + (ops.length > 2 ? ' <span class="ms-more">+' + (ops.length - 2) + '</span>' : '') + '</span>';
}

function msThHtml(col, extraCls) {
  const i = _msSort.findIndex(s => s.col === col.key);
  const ind = i === -1 ? '<span class="ms-sort-ind ms-sort-off">↕</span>'
    : '<span class="ms-sort-ind">' + (_msSort[i].dir === 'asc' ? '▲' : '▼') + (_msSort.length > 1 ? '<sup>' + (i + 1) + '</sup>' : '') + '</span>';
  const fOn = !!_msColFiltri[col.key];
  return '<th class="' + (extraCls || '') + '"><div class="ms-th">' +
    '<button type="button" class="ms-th-sort" data-ms-sort="' + col.key + '" title="Ordina (Maiusc+click: aggiungi criterio)">' + esc(col.label) + ind + '</button>' +
    '<button type="button" class="ms-th-f' + (fOn ? ' ms-th-f-on' : '') + '" data-ms-filter="' + col.key + '" title="Filtra ' + esc(col.label) + '">⏷</button>' +
  '</div></th>';
}

function msRenderTable(rows) {
  const el = document.getElementById('ms-table');
  if (!el) return;
  if (!_msAllRows.length) {
    el.innerHTML = '<div class="ms-empty">Nessun cantiere pianificato nei giorni passati di questo intervallo' + (_msFiltri.q ? ' con la ricerca attiva' : '') + '.</div>';
    return;
  }
  const shown = rows.slice(0, MS_MAX_RIGHE_TABELLA);
  const NUM = { tmin: 1, tmax: 1, pioggia: 1 };
  let html = '<table class="ms-tbl"><thead><tr>' + MS_COLS.map(c => msThHtml(c, NUM[c.key] ? 'ms-num' : '')).join('') + '</tr></thead><tbody>';
  if (!rows.length) {
    html += '<tr><td colspan="' + MS_COLS.length + '" class="ms-empty">Nessuna riga con i filtri attivi.</td></tr>';
  }
  // Ordinamento principale per data: righe raggruppate per giorno sotto un'intestazione
  // con il riepilogo, e la data non si ripete su ogni riga.
  const perGiorno = _msSort[0] && _msSort[0].col === 'data';
  let lastDate = null;
  shown.forEach((r, i) => {
    if (perGiorno && r.dateISO !== lastDate) {
      lastDate = r.dateISO;
      const gruppo = rows.filter(x => x.dateISO === r.dateISO);
      const nPioggia = gruppo.filter(x => x.info && x.info.precip != null && x.info.precip >= 1).length;
      const nMal = gruppo.filter(x => x.severity).length;
      html += '<tr class="ms-day"><td colspan="' + MS_COLS.length + '"><span class="ms-day-d">' + esc(msFormatDataLunga(r.dateISO)) + '</span>' +
        '<span class="ms-day-s">' + gruppo.length + (gruppo.length === 1 ? ' cantiere' : ' cantieri') +
        (nPioggia ? ' · 🌧️ ' + nPioggia + ' con pioggia' : '') + (nMal ? ' · ⚠️ ' + nMal + ' con maltempo' : '') + '</span></td></tr>';
    }
    const i0 = r.info;
    html += '<tr class="ms-row' + (r.severity ? ' ms-sev-' + r.severity : '') + '" data-ms-row="' + i + '" title="Clicca per il dettaglio orario e il bollettino">' +
      '<td class="ms-c-data">' + (perGiorno ? '<span class="ms-muted">' + esc(msFormatData(r.dateISO).split(' ')[0]) + '</span>' : esc(msFormatData(r.dateISO))) + '</td>' +
      '<td class="ms-c-comm" title="' + esc(r.commessa) + '">' + esc(r.commessa) + '</td>' +
      '<td class="ms-c-sq">' + esc(r.squadra) + '</td>' +
      '<td class="ms-c-cant">' + esc(r.cantiere) + '</td>' +
      '<td class="ms-c-meteo">' + (i0
        ? '<span class="ms-ico">' + pwMeteoIconFor(i0.code) + '</span>' + esc(msMeteoDescr(i0.code))
        : '<span class="ms-muted">' + esc(pwMeteoMissingReason(r.cantiere, r.dateISO)) + '</span>') + '</td>' +
      '<td class="ms-num ms-tmin">' + (i0 && i0.tmin != null ? Math.round(i0.tmin) + '°' : '') + '</td>' +
      '<td class="ms-num ms-tmax">' + (i0 && i0.tmax != null ? Math.round(i0.tmax) + '°' : '') + '</td>' +
      '<td class="ms-num">' + msRainHtml(i0 ? i0.precip : null) + '</td>' +
      '<td>' + (r.severity ? '<span class="ms-sev ms-sev-b-' + r.severity + '">' + (r.severity === 'alta' ? '🔴 Alto' : '🟠 Medio') + '</span>' : '<span class="ms-muted">—</span>') + '</td>' +
      '<td>' + msPcCellHtml(r) + '</td>' +
      '<td class="ms-c-ops">' + msOperatoriHtml(r.operatori) + '</td>' +
    '</tr>';
  });
  html += '</tbody></table>';
  if (rows.length > shown.length) {
    html += '<div class="ms-foot">Mostrate le prime ' + shown.length + ' righe di ' + rows.length +
      ': restringi periodo o filtri (l\'export Excel le contiene tutte).</div>';
  }
  el.innerHTML = html;
}

/* ----- Popover filtro di colonna (stile Excel) ----- */

let _msPop = null;
let _msPopSearch = '';
function msClosePop() {
  if (!_msPop) return;
  _msPop.remove();
  _msPop = null;
  document.removeEventListener('mousedown', msPopOutside, true);
}
function msPopOutside(e) {
  if (_msPop && !_msPop.contains(e.target) && !e.target.closest('[data-ms-filter]')) msClosePop();
}

function msOpenPop(key, anchor) {
  if (_msPop && _msPop.dataset.key === key) { msClosePop(); return; }
  msClosePop();
  const col = msCol(key);
  if (!col) return;
  _msPopSearch = '';
  const pop = document.createElement('div');
  pop.className = 'ms-pop';
  pop.dataset.key = key;
  const ord = col.type === 'num' || key === 'data' ? ['↑ Dal più basso', '↓ Dal più alto'] : ['↑ A → Z', '↓ Z → A'];
  if (key === 'data') { ord[0] = '↑ Dal più vecchio'; ord[1] = '↓ Dal più recente'; }
  let html = '<div class="ms-pop-h">' + esc(col.label) + '</div>' +
    '<div class="ms-pop-sort"><button type="button" data-pop-sort="asc">' + ord[0] + '</button><button type="button" data-pop-sort="desc">' + ord[1] + '</button></div>';
  if (col.type === 'num') {
    const f = _msColFiltri[key] || {};
    html += '<div class="ms-pop-num">' +
      '<label>Da <input type="number" step="0.1" data-pop-min value="' + (f.min != null ? f.min : '') + '"></label>' +
      '<label>a <input type="number" step="0.1" data-pop-max value="' + (f.max != null ? f.max : '') + '"></label>' +
      '<span>' + esc(col.unit) + '</span></div>' +
      (col.presets ? '<div class="ms-pop-presets">' + col.presets.map((p, i) => '<button type="button" data-pop-preset="' + i + '">' + esc(p.label) + '</button>').join('') + '</div>' : '');
  } else {
    html += '<input type="text" class="ms-pop-search" placeholder="Cerca valori…" data-pop-search>' +
      '<div class="ms-pop-bulk"><button type="button" data-pop-bulk="all">Seleziona tutti</button><button type="button" data-pop-bulk="none">Deseleziona tutti</button></div>' +
      '<div class="ms-pop-list" data-pop-list></div>';
  }
  html += '<div class="ms-pop-foot"><button type="button" data-pop-clear>Rimuovi filtro</button><button type="button" data-pop-close class="ms-pop-ok">Chiudi</button></div>';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const rc = anchor.getBoundingClientRect();
  const w = pop.offsetWidth || 280;
  pop.style.left = Math.max(8, Math.min(rc.right - w, window.innerWidth - w - 8)) + 'px';
  const h = pop.offsetHeight || 360;
  pop.style.top = (rc.bottom + 4 + h > window.innerHeight ? Math.max(8, rc.top - h - 4) : rc.bottom + 4) + 'px';
  _msPop = pop;
  msBindPop(pop, col);
  if (col.type !== 'num') msRenderPopList();
  document.addEventListener('mousedown', msPopOutside, true);
  const first = pop.querySelector('[data-pop-search], [data-pop-min]');
  if (first) first.focus();
}

/* Valori dell'elenco: quelli presenti nelle righe che passano gli ALTRI filtri (con il
   conteggio), più quelli già selezionati rimasti senza righe, così restano deselezionabili. */
function msPopValues(col) {
  const counts = new Map();
  msApplyColFilters(_msAllRows, col.key).forEach(r => {
    const v = col.val(r);
    (col.multi ? v : [v]).forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
  });
  const f = _msColFiltri[col.key];
  if (f) f.forEach(v => { if (!counts.has(v)) counts.set(v, 0); });
  const vals = [...counts.keys()];
  vals.sort(col.order || ((a, b) => String(a).localeCompare(String(b), 'it', { sensitivity: 'base', numeric: true })));
  return vals.map(v => ({ v, n: counts.get(v) }));
}

function msUniverse(col) {
  const s = new Set();
  _msAllRows.forEach(r => { const v = col.val(r); (col.multi ? v : [v]).forEach(x => s.add(x)); });
  return s;
}

function msRenderPopList() {
  if (!_msPop) return;
  const col = msCol(_msPop.dataset.key);
  const list = _msPop.querySelector('[data-pop-list]');
  if (!col || !list) return;
  const f = _msColFiltri[col.key];
  const lbl = col.lbl || (v => v);
  const q = _msPopSearch.toLowerCase().trim();
  const vals = msPopValues(col).filter(x => !q || String(lbl(x.v)).toLowerCase().indexOf(q) !== -1);
  const st = list.scrollTop;
  list.innerHTML = vals.length ? vals.map((x, i) =>
    '<label class="ms-pop-item' + (x.n ? '' : ' ms-pop-zero') + '"><input type="checkbox" data-pop-i="' + i + '"' + (!f || f.has(x.v) ? ' checked' : '') + '>' +
      '<span class="ms-pop-v">' + esc(lbl(x.v)) + '</span><span class="ms-pop-n">' + x.n + '</span></label>').join('')
    : '<div class="ms-pop-emptyl">Nessun valore</div>';
  list._vals = vals.map(x => x.v);
  list.scrollTop = st;
}

function msBindPop(pop, col) {
  pop.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.popSort) { _msSort = [{ col: col.key, dir: b.dataset.popSort }]; msApply(); return; }
    if (b.hasAttribute('data-pop-clear')) { delete _msColFiltri[col.key]; msClosePop(); msApply(); return; }
    if (b.hasAttribute('data-pop-close')) { msClosePop(); return; }
    if (b.dataset.popPreset != null) {
      const p = col.presets[Number(b.dataset.popPreset)];
      _msColFiltri[col.key] = { min: p.min != null ? p.min : null, max: p.max != null ? p.max : null };
      pop.querySelector('[data-pop-min]').value = p.min != null ? p.min : '';
      pop.querySelector('[data-pop-max]').value = p.max != null ? p.max : '';
      msApply();
      return;
    }
    if (b.dataset.popBulk) {
      // Agisce sui valori visibili (quindi anche solo su quelli trovati con "Cerca valori")
      const visibili = pop.querySelector('[data-pop-list]')._vals || [];
      const sel = _msColFiltri[col.key] ? new Set(_msColFiltri[col.key]) : msUniverse(col);
      visibili.forEach(v => (b.dataset.popBulk === 'all' ? sel.add(v) : sel.delete(v)));
      msSetCatFilter(col, sel);
    }
  });
  pop.addEventListener('change', e => {
    const cb = e.target.closest('[data-pop-i]');
    if (!cb) return;
    const v = pop.querySelector('[data-pop-list]')._vals[Number(cb.dataset.popI)];
    const sel = _msColFiltri[col.key] ? new Set(_msColFiltri[col.key]) : msUniverse(col);
    if (cb.checked) sel.add(v); else sel.delete(v);
    msSetCatFilter(col, sel);
  });
  let t = null;
  pop.addEventListener('input', e => {
    if (e.target.hasAttribute('data-pop-search')) { _msPopSearch = e.target.value; msRenderPopList(); return; }
    if (e.target.hasAttribute('data-pop-min') || e.target.hasAttribute('data-pop-max')) {
      clearTimeout(t);
      t = setTimeout(() => {
        const num = s => (s === '' || isNaN(Number(s)) ? null : Number(s));
        const min = num(pop.querySelector('[data-pop-min]').value);
        const max = num(pop.querySelector('[data-pop-max]').value);
        if (min == null && max == null) delete _msColFiltri[col.key];
        else _msColFiltri[col.key] = { min, max };
        msApply();
      }, 350);
    }
  });
}

/* Tutti i valori selezionati = nessun filtro (le righe nuove in arrivo dal recupero non
   vengono escluse per il solo fatto di non essere state spuntate). */
function msSetCatFilter(col, sel) {
  const uni = msUniverse(col);
  if ([...uni].every(v => sel.has(v))) delete _msColFiltri[col.key];
  else _msColFiltri[col.key] = sel;
  msApply();
}

/* Dettaglio di una riga: meteo per fasce orarie (scaricato su richiesta, la tabella legge
   solo l'aggregato giornaliero), bollettino PC per rischio, operatori, Apri in Griglia. */
async function msOpenDettaglio(i) {
  const r = _msRows[i];
  if (!r) return;
  const geo = meteoGeoFor(r.cantiere);
  if (geo) {
    const e = _meteoStorico[meteoPosKey(geo) + '|' + r.dateISO];
    if (e && !Array.isArray(e.hourly)) {
      try {
        const { data } = await _sbClient.from('meteo_storico').select('hourly')
          .eq('pos_key', meteoPosKey(geo)).eq('data', r.dateISO).maybeSingle();
        if (data && Array.isArray(data.hourly)) e.hourly = data.hourly;
      } catch (_) {}
    }
  }
  const info = pwMeteoInfoFor(r.cantiere, r.dateISO);
  let meteoHtml;
  if (!info) {
    meteoHtml = '<div class="pw-meteo-modal-missing">' + esc(pwMeteoMissingReason(r.cantiere, r.dateISO)) + '</div>';
  } else {
    const fasce = pwFasceOrarieFor(info);
    meteoHtml = '<div class="pw-meteo-modal-info">' + pwMeteoIconFor(info.code) + ' ' + esc(msMeteoDescr(info.code)) + ' · ' +
      Math.round(info.tmin) + '° / ' + Math.round(info.tmax) + '°' + (pwMeteoRainLabel(info) ? ' · ' + pwMeteoRainLabel(info) + ' nel giorno' : '') + '</div>';
    if (fasce.length) {
      meteoHtml += '<div class="pw-meteo-fasce">' + fasce.map(h =>
        '<div class="pw-meteo-fascia"><div class="pw-meteo-fascia-ora">' + esc(h.hour) + '</div>' +
        '<div class="pw-meteo-fascia-icon">' + pwMeteoIconFor(h.code) + '</div>' +
        '<div class="pw-meteo-fascia-temp">' + Math.round(h.temp) + '°</div>' +
        (pwMeteoRainLabel(h) ? '<div class="pw-meteo-fascia-pop">' + pwMeteoRainLabel(h) + '</div>' : '') +
        '</div>').join('') + '</div>';
    }
  }
  let pcHtml = '<div class="text-xs text-slate-400">Nessuna allerta per questo cantiere nel bollettino del giorno (o comune non riconosciuto).</div>';
  if (r.pcInfo) {
    const riga = (label, c) => '<div class="text-sm">' + label + ': <b>' + (c ? esc(c) : 'nessuna') + '</b></div>';
    pcHtml = (r.pcInfo.zona ? '<div class="text-xs text-slate-500 mb-1">Zona di allerta: ' + esc(r.pcInfo.zona) + '</div>' : '') +
      riga('Rischio idraulico', r.pcInfo.idraulico) + riga('Rischio temporali', r.pcInfo.temporali) + riga('Rischio idrogeologico', r.pcInfo.idrogeologico);
  }
  const puoGriglia = typeof sbCanSeePage !== 'function' || sbCanSeePage('weekly:griglia');
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-8 p-5">' +
    '<h3 class="font-semibold text-slate-900 mb-1">🌦️ ' + esc(r.cantiere) + '</h3>' +
    '<p class="text-xs text-slate-500 mb-3">' + esc(msFormatData(r.dateISO)) + ' · ' + esc(r.commessa) + (r.squadra ? ' · ' + esc(r.squadra) : '') + ' · meteo osservato</p>' +
    '<div class="pw-meteo-modal-block">' + meteoHtml + '</div>' +
    '<div class="pw-meteo-modal-block"><div class="pw-meteo-modal-cantiere">📋 Bollettino Protezione Civile</div>' + pcHtml + '</div>' +
    '<div class="text-xs text-slate-500 mt-2">Operatori: ' + esc(r.operatori.join(', ') || '—') + '</div>' +
    '<div class="flex justify-end gap-2 mt-4">' +
      (puoGriglia ? '<button id="ms-dett-griglia" class="px-3 py-1.5 text-sm border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50">📅 Apri in Griglia</button>' : '') +
      '<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Chiudi</button>' +
    '</div>' +
  '</div></div>';
  const btn = document.getElementById('ms-dett-griglia');
  if (btn) btn.onclick = () => { closeModal(); mlGoToGriglia(r.loc); };
}

function msExportExcel() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria Excel non disponibile.'); return; }
  const rows = _msRows;
  if (!rows.length) { showAlertModal('Nessuna riga da esportare con i filtri attuali.'); return; }
  const aoa = [['Data', 'Commessa', 'Squadra', 'Cantiere', 'Operatori', 'Condizione', 'T min (°C)', 'T max (°C)', 'Pioggia (mm)',
    'Maltempo', 'Allerta PC', 'Zona PC', 'Rischio idraulico', 'Rischio temporali', 'Rischio idrogeologico']];
  rows.forEach(r => {
    const i = r.info, p = r.pcInfo;
    aoa.push([r.dateISO, r.commessa, r.squadra, r.cantiere, r.operatori.join(', '),
      i ? msMeteoDescr(i.code) : '', i && i.tmin != null ? Math.round(i.tmin * 10) / 10 : '', i && i.tmax != null ? Math.round(i.tmax * 10) / 10 : '',
      i && i.precip != null ? Math.round(i.precip * 10) / 10 : '', MS_SEV_LABEL[r.severity] || '', r.pcColor || '',
      p ? p.zona || '' : '', p ? p.idraulico || '' : '', p ? p.temporali || '' : '', p ? p.idrogeologico || '' : '']);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0].map((_, ci) => ({ wch: [11, 28, 16, 28, 36, 22, 9, 9, 11, 10, 10, 26, 14, 14, 18][ci] || 12 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Storico meteo');
  XLSX.writeFile(wb, 'storico_meteo_' + _msFiltri.dal + '_' + _msFiltri.al + '.xlsx');
}
