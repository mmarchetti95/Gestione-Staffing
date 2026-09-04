/* ==================== METEO CANTIERI (Open-Meteo, gratuito senza API key) ====================
   Badge meteo per squadra/giorno nella Griglia settimanale, basato sui cantieri pianificati
   quel giorno. Riusa il geocoder Nominatim + _geoCache già presenti in weekly-mappa.js: un
   cantiere non geocodificabile semplicemente non genera nessun badge (nessun errore bloccante).
   Refresh in background ogni ora mentre l'app è aperta sul tab Griglia. */

const METEO_TTL_MS = 60 * 60 * 1000;       // 1 ora
const METEO_MAX_FORECAST_DAYS = 15;        // limite forecast giornaliero Open-Meteo

/* Fasce orarie mostrate nel modal di dettaglio (copertura del tipico orario di cantiere). */
const METEO_FASCE = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];

/* Cache meteo persistente: chiave "lat,lon|dataISO" ->
   { code, tmax, tmin, pop, hourly: [{hour,temp,code,pop}], fetchedAt } */
let _meteoCache = {};
async function _meteoCacheLoad() {
  try { const r = await sget('meteo_cache_v1'); if (r) _meteoCache = r; } catch(e) {}
}
async function _meteoCacheSave() {
  try { await sset('meteo_cache_v1', _meteoCache); } catch(e) {}
}

const METEO_ICONS = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️', 56: '🌦️', 57: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '🌧️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};
function pwMeteoIconFor(code) {
  return METEO_ICONS[code] || '🌡️';
}

/* Cantieri distinti in uso da una squadra in un giorno: unisce i cantieri di TUTTI gli
   operatori (ciascuno può averne più di uno, vedi pwCellCantieri). */
function pwSquadraCantieriGiorno(squadra, dayIdx) {
  const set = new Set();
  (squadra.operatori || []).forEach(op => {
    pwCellCantieri((op.giorni || {})[dayIdx]).forEach(c => set.add(c));
  });
  return [...set];
}

/* Legge dalla cache il meteo di un cantiere in una data, sfruttando il geocoding già
   disponibile in _geoCache (condivisa con la Mappa). null se non geocodificato/non ancora
   scaricato. */
function pwMeteoInfoFor(cantiere, dateISO) {
  const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
  const geo = _geoCache[key];
  if (!geo) return null;
  const mk = geo.lat.toFixed(2) + ',' + geo.lng.toFixed(2) + '|' + dateISO;
  const m = _meteoCache[mk];
  if (!m) return null;
  return { cantiere, code: m.code, tmax: m.tmax, tmin: m.tmin, pop: m.pop, hourly: m.hourly || [] };
}

/* Motivo per cui pwMeteoInfoFor ha restituito null, per mostrare nel modal un messaggio
   diagnostico invece del generico "Meteo non disponibile" — utile per distinguere un
   cantiere non geocodificabile da un servizio meteo momentaneamente irraggiungibile. */
function pwMeteoMissingReason(cantiere) {
  const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!(key in _geoCache)) return 'Localizzazione in corso…';
  if (!_geoCache[key]) return 'Località non riconosciuta (geocoding non riuscito)';
  return 'Servizio meteo momentaneamente non raggiungibile';
}

/* Sottoinsieme di ore rappresentative (METEO_FASCE) dal dettaglio orario di un cantiere. */
function pwFasceOrarieFor(info) {
  if (!info || !Array.isArray(info.hourly) || !info.hourly.length) return [];
  const byHour = {};
  info.hourly.forEach(h => { byHour[h.hour] = h; });
  return METEO_FASCE.map(hh => byHour[hh]).filter(Boolean);
}

/* Una chiamata Open-Meteo per località, copre l'intero intervallo richiesto (tipicamente
   l'intera settimana visibile) — popola _meteoCache per ciascun giorno restituito, sia con
   l'aggregato giornaliero (per il badge) sia con il dettaglio orario (per il modal). */
async function pwFetchMeteoRange(lat, lon, startISO, endISO) {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&hourly=temperature_2m,weathercode,precipitation_probability' +
      '&timezone=Europe%2FRome&start_date=' + startISO + '&end_date=' + endISO;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const d = data && data.daily;
    const h = data && data.hourly;
    if (!d || !Array.isArray(d.time)) return;
    const now = Date.now();

    // Raggruppa le ore per data (YYYY-MM-DD), per associarle al rispettivo giorno.
    const hourlyByDate = {};
    if (h && Array.isArray(h.time)) {
      h.time.forEach((ts, i) => {
        const dateISO = ts.slice(0, 10);
        const hour = ts.slice(11, 16); // "HH:MM"
        if (!hourlyByDate[dateISO]) hourlyByDate[dateISO] = [];
        hourlyByDate[dateISO].push({
          hour,
          temp: h.temperature_2m[i],
          code: h.weathercode[i],
          pop: (h.precipitation_probability || [])[i] ?? null,
        });
      });
    }

    d.time.forEach((dateISO, i) => {
      const mk = lat.toFixed(2) + ',' + lon.toFixed(2) + '|' + dateISO;
      _meteoCache[mk] = {
        code: d.weathercode[i],
        tmax: d.temperature_2m_max[i],
        tmin: d.temperature_2m_min[i],
        pop: (d.precipitation_probability_max || [])[i] ?? null,
        hourly: hourlyByDate[dateISO] || [],
        fetchedAt: now,
      };
    });
    await _meteoCacheSave();
  } catch (e) {
    // Meteo non essenziale: nessun blocco, ma logghiamo per poter diagnosticare
    // un servizio Open-Meteo irraggiungibile (es. bloccato da proxy/firewall aziendale)
    // invece di far sparire il badge senza traccia.
    console.warn('[meteo] fetch Open-Meteo fallita per', lat, lon, e);
  }
}

/* Entry point periodico: geocodifica i cantieri della settimana visibile (sequenziale, stesso
   throttling Nominatim già usato dalla Mappa), scarica il meteo mancante/scaduto e aggiorna
   i badge già in pagina. */
let _pwMeteoRefreshing = false;
async function pwRefreshMeteoWeek() {
  if (_pwMeteoRefreshing) return;
  _pwMeteoRefreshing = true;
  try {
    const monday = isoWeekToMonday(pwAnno, pwWeek);
    const saturday = new Date(monday); saturday.setUTCDate(monday.getUTCDate() + 5);
    const startISO = monday.toISOString().slice(0, 10);
    const endISO = saturday.toISOString().slice(0, 10);

    const todayISO = new Date().toISOString().slice(0, 10);
    const maxDate = new Date(); maxDate.setUTCDate(maxDate.getUTCDate() + METEO_MAX_FORECAST_DAYS);
    const maxISO = maxDate.toISOString().slice(0, 10);
    if (endISO < todayISO || startISO > maxISO) return; // settimana fuori dal range forecast

    const fetchStartISO = startISO < todayISO ? todayISO : startISO;
    const fetchEndISO = endISO > maxISO ? maxISO : endISO;

    const data = pwGetWeekData();
    const cantieriSet = new Set();
    data.forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
      for (let di = 0; di < 6; di++) pwCellCantieri((op.giorni || {})[di]).forEach(c => cantieriSet.add(c));
    })));
    if (!cantieriSet.size) return;

    // Geocodifica sequenziale (rate-limit Nominatim), riusa _geoCache condivisa con la Mappa
    for (const cantiere of cantieriSet) {
      const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
      if (!(key in _geoCache)) {
        await geocodifica(cantiere);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Una fetch meteo per località distinta non ancora fresca in cache
    const now = Date.now();
    const seenPos = new Set();
    for (const cantiere of cantieriSet) {
      const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
      const geo = _geoCache[key];
      if (!geo) continue; // non geocodificabile: niente meteo per questo cantiere
      const posKey = geo.lat.toFixed(2) + ',' + geo.lng.toFixed(2);
      if (seenPos.has(posKey)) continue;
      seenPos.add(posKey);
      // "Fresca" solo se anche il dettaglio orario è presente: un'entry con solo l'aggregato
      // giornaliero (es. per un errore transitorio Open-Meteo su una singola fetch) altrimenti
      // resterebbe bloccata senza dettaglio orario per l'intera durata del TTL.
      const cached = _meteoCache[posKey + '|' + fetchStartISO];
      const isFresh = cached && Array.isArray(cached.hourly) && cached.hourly.length && (now - cached.fetchedAt) < METEO_TTL_MS;
      if (isFresh) continue;
      await pwFetchMeteoRange(geo.lat, geo.lng, fetchStartISO, fetchEndISO);
    }

    await pcRefreshBollettino();
    pwApplyMeteoBadgesToDom();
  } finally {
    _pwMeteoRefreshing = false;
  }
}

/* ----- Rendering badge ----- */
// Sempre cliccabile (a prescindere dal numero di cantieri): apre il modal col dettaglio
// meteo per fasce orarie, per cantiere.
function pwWeatherBadgeInnerHtml(cIdx, sIdx, squadra, dayIdx, dateISO) {
  const cantieri = pwSquadraCantieriGiorno(squadra, dayIdx);
  if (!cantieri.length) return '';
  const infos = cantieri.map(c => pwMeteoInfoFor(c, dateISO)).filter(Boolean);
  if (!infos.length) {
    // Cantieri pianificati ma meteo non ancora disponibile (geocoding/fetch in corso o
    // falliti): badge segnaposto cliccabile invece di sparire senza lasciare traccia,
    // il modal spiega il motivo per ciascun cantiere.
    return `<span class="pw-weather-badge pw-weather-badge-pending" title="Clicca per il dettaglio meteo per fasce orarie"
      onclick="event.stopPropagation();pwOpenMeteoModal(${cIdx},${sIdx},${dayIdx})">🌡️ …</span>`;
  }
  const main = infos[0];
  const icon = pwMeteoIconFor(main.code);
  const tempTxt = Math.round(main.tmax) + '°';
  const countBadge = cantieri.length > 1 ? ` <span class="pw-weather-badge-count">+${cantieri.length - 1}</span>` : '';
  return `<span class="pw-weather-badge" title="Clicca per il dettaglio meteo per fasce orarie"
    onclick="event.stopPropagation();pwOpenMeteoModal(${cIdx},${sIdx},${dayIdx})">${icon} ${tempTxt}${countBadge}</span>`;
}

function pwWeatherBadgeHtml(cIdx, sIdx, squadra, dayIdx, dateISO) {
  return `<div class="pw-weather-slot" data-cidx="${cIdx}" data-sidx="${sIdx}" data-day="${dayIdx}" data-date="${dateISO}">${pwWeatherBadgeInnerHtml(cIdx, sIdx, squadra, dayIdx, dateISO)}</div>`;
}

/* Aggiorna i badge già renderizzati SENZA un pwRender() completo (eviterebbe di far perdere
   il focus/cursore agli input cantiere/attività mentre l'utente sta digitando). */
function pwApplyMeteoBadgesToDom() {
  const data = pwGetWeekData();
  document.querySelectorAll('.pw-weather-slot').forEach(slot => {
    const cIdx = Number(slot.dataset.cidx), sIdx = Number(slot.dataset.sidx), dayIdx = Number(slot.dataset.day);
    const dateISO = slot.dataset.date;
    const squadra = data[cIdx] && data[cIdx].squadre && data[cIdx].squadre[sIdx];
    if (!squadra) return;
    slot.innerHTML = pwWeatherBadgeInnerHtml(cIdx, sIdx, squadra, dayIdx, dateISO);
  });
  pwUpdateWeatherWidget();
}

/* ----- Modal dettaglio meteo per fasce orarie (uno o più cantieri) ----- */
function pwOpenMeteoModal(cIdx, sIdx, dayIdx) {
  const data = pwGetWeekData();
  const squadra = data[cIdx] && data[cIdx].squadre && data[cIdx].squadre[sIdx];
  if (!squadra) return;

  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + dayIdx);
  const dateISO = d.toISOString().slice(0, 10);
  const DAY_NAMES_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

  const cantieri = pwSquadraCantieriGiorno(squadra, dayIdx);
  const blocks = cantieri.map(cantiere => {
    const info = pwMeteoInfoFor(cantiere, dateISO);
    if (!info) {
      return `<div class="pw-meteo-modal-block">
        <div class="pw-meteo-modal-cantiere">${esc(cantiere)}</div>
        <div class="pw-meteo-modal-missing">${esc(pwMeteoMissingReason(cantiere))}</div>
      </div>`;
    }
    const fasce = pwFasceOrarieFor(info);
    const fasceHtml = fasce.length
      ? `<div class="pw-meteo-fasce">
          ${fasce.map(h => `<div class="pw-meteo-fascia">
            <div class="pw-meteo-fascia-ora">${h.hour}</div>
            <div class="pw-meteo-fascia-icon">${pwMeteoIconFor(h.code)}</div>
            <div class="pw-meteo-fascia-temp">${Math.round(h.temp)}°</div>
            ${h.pop != null ? `<div class="pw-meteo-fascia-pop">💧${Math.round(h.pop)}%</div>` : ''}
          </div>`).join('')}
        </div>`
      : `<div class="pw-meteo-modal-info">${pwMeteoIconFor(info.code)} ${Math.round(info.tmax)}° / ${Math.round(info.tmin)}° <span class="pw-meteo-modal-missing">(dettaglio orario non disponibile)</span></div>`;
    return `<div class="pw-meteo-modal-block">
      <div class="pw-meteo-modal-cantiere">${esc(cantiere)}</div>
      ${fasceHtml}
    </div>`;
  }).join('');

  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-8 p-5">
    <h3 class="font-semibold text-slate-900 mb-1">Meteo — ${esc(squadra.nome || 'Squadra')}</h3>
    <p class="text-xs text-slate-500 mb-3">${DAY_NAMES_FULL[dayIdx]} ${formatDate(d)}</p>
    <div>${blocks || '<div class="text-slate-400 text-sm">Nessun cantiere pianificato.</div>'}</div>
    <div class="flex justify-end mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Chiudi</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}

/* ==================== BOLLETTINO PROTEZIONE CIVILE (criticità idrogeologica/idraulica) ====================
   Fonte ufficiale, gratuita, senza API key: repo GitHub pcm-dpc/DPC-Bollettini-Criticita-
   Idrogeologica-Idraulica (CC-BY-4.0), un bollettino/giorno pubblicato di norma entro le 16:00,
   con orizzonte di "oggi" + "domani" soltanto (non copre l'intera settimana come Open-Meteo).
   Ogni zona di allerta nel topojson del bollettino porta già sia l'elenco dei comuni che ne
   fanno parte sia il livello di allerta (gialla/arancione/rossa) per rischio idraulico,
   temporali e idrogeologico: il matching cantiere→zona è quindi un confronto testuale sul nome
   del comune, senza bisogno di librerie di geometria (topojson-client/turf). */

const PC_REPO = 'pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica';
const PC_TTL_MS = 3 * 60 * 60 * 1000; // 3 ore: il bollettino esce ~1 volta/giorno, con eventuali aggiornamenti pomeridiani

/* Cache persistente: { dateISO (giorno del bollettino corrente), fetchedAt, bollettino (nome file),
   byDate: { 'YYYY-MM-DD': { 'nome comune normalizzato': {zona, idraulico, temporali, idrogeologico} } } } */
let _pcCache = { dateISO: null, fetchedAt: 0, byDate: {} };
async function _pcCacheLoad() {
  try { const r = await sget('pc_bollettino_cache_v1'); if (r) _pcCache = r; } catch(e) {}
}
async function _pcCacheSave() {
  try { await sset('pc_bollettino_cache_v1', _pcCache); } catch(e) {}
}

/* Estrae il colore (gialla/arancione/rossa) da una stringa tipo "Ordinaria / ALLERTA GIALLA";
   null per "Assenza di fenomeni significativi prevedibili / NESSUNA ALLERTA". */
function pcColorFromLabel(label) {
  const m = /ALLERTA\s+(GIALLA|ARANCIONE|ROSSA)/i.exec(label || '');
  return m ? m[1].toLowerCase() : null;
}

/* Scarica il topojson di un giorno del bollettino (today/tomorrow) e ne ricava una mappa
   comune→criticità, ignorando del tutto la geometria (arcs/coordinate) — servono solo le
   proprietà di ciascuna zona. */
async function pcParseGiorno(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const topo = await res.json();
  const objName = Object.keys(topo.objects || {})[0];
  const geoms = (objName && topo.objects[objName].geometries) || [];
  const out = {};
  geoms.forEach(g => {
    const props = g.properties || {};
    const info = {
      zona: props['Nome zona'] || '',
      idraulico: pcColorFromLabel(props['Per rischio idraulico']),
      temporali: pcColorFromLabel(props['Per rischio temporali']),
      idrogeologico: pcColorFromLabel(props['Per rischio idrogeologico']),
    };
    (props['Comuni'] || []).forEach(comune => {
      out[comune.toLowerCase().trim().replace(/\s+/g, ' ')] = info;
    });
  });
  return out;
}

/* Trova e scarica il bollettino pubblicato in un dato giorno (prefisso "YYYYMMDD"): la cartella
   files/ del repo contiene un file per giorno nominato "YYYYMMDD_HHMM.json" con orario di
   pubblicazione variabile, quindi va individuato — un'unica chiamata alla Git Trees API elenca
   l'intero contenuto della cartella senza incorrere nel limite di 1000 elementi/pagina della
   Contents API. */
async function pcFetchIndice(datePrefix) {
  const rootRes = await fetch('https://api.github.com/repos/' + PC_REPO + '/contents/');
  if (!rootRes.ok) throw new Error('HTTP ' + rootRes.status);
  const rootEntries = await rootRes.json();
  const filesDir = (rootEntries || []).find(e => e.name === 'files' && e.type === 'dir');
  if (!filesDir) return null;

  const treeRes = await fetch('https://api.github.com/repos/' + PC_REPO + '/git/trees/' + filesDir.sha);
  if (!treeRes.ok) throw new Error('HTTP ' + treeRes.status);
  const tree = await treeRes.json();
  const candidati = (tree.tree || [])
    .map(t => t.path)
    .filter(p => new RegExp('^' + datePrefix + '_\\d{4}\\.json$').test(p))
    .sort(); // l'ultimo in ordine cronologico è l'edizione più recente (aggiornamento/errata corrige)
  if (!candidati.length) return null;
  const name = candidati[candidati.length - 1];

  const idxRes = await fetch('https://raw.githubusercontent.com/' + PC_REPO + '/master/files/' + name);
  if (!idxRes.ok) throw new Error('HTTP ' + idxRes.status);
  return { name, index: await idxRes.json() };
}

/* Il bollettino di oggi esce di norma entro le 16:00: prima di allora non è ancora su GitHub.
   In quella finestra usiamo il bollettino di ieri, la cui sezione "domani" copre esattamente
   oggi (stesso bollettino che un operatore avrebbe consultato ieri pomeriggio per pianificare
   la giornata odierna) — così il widget non resta "cieco" sul lato PC per metà giornata. */
async function pcFetchBollettinoUtile() {
  const todayPrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const oggi = await pcFetchIndice(todayPrefix);
  if (oggi) return { found: oggi, campoPerOggi: 'today', campoPerDomani: 'tomorrow' };

  const yesterdayPrefix = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const ieri = await pcFetchIndice(yesterdayPrefix);
  if (ieri) return { found: ieri, campoPerOggi: 'tomorrow', campoPerDomani: null };

  return null;
}

/* Entry point periodico: aggiorna la cache solo se scaduta o se è cambiato il giorno. Nessun
   blocco in caso di errore (rete aziendale che filtra GitHub, rate limit orario superato, ecc.):
   pcInfoFor tornerà semplicemente null, il widget mostra solo il segnale Open-Meteo. */
let _pcRefreshing = false;
async function pcRefreshBollettino() {
  if (_pcRefreshing) return;
  const todayISO = new Date().toISOString().slice(0, 10);
  if (_pcCache.dateISO === todayISO && (Date.now() - _pcCache.fetchedAt) < PC_TTL_MS) return;
  _pcRefreshing = true;
  try {
    const risultato = await pcFetchBollettinoUtile();
    const byDate = {};
    if (risultato) {
      const { found, campoPerOggi, campoPerDomani } = risultato;
      const tomorrowISO = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const sezOggi = found.index[campoPerOggi];
      const sezDomani = campoPerDomani && found.index[campoPerDomani];
      if (sezOggi && sezOggi.topo_json) byDate[todayISO] = await pcParseGiorno(sezOggi.topo_json);
      if (sezDomani && sezDomani.topo_json) byDate[tomorrowISO] = await pcParseGiorno(sezDomani.topo_json);
    }
    _pcCache = { dateISO: todayISO, fetchedAt: Date.now(), bollettino: risultato && risultato.found.name, byDate };
    await _pcCacheSave();
  } catch (e) {
    console.warn('[bollettino PC] refresh fallito', e);
  } finally {
    _pcRefreshing = false;
  }
}

/* Criticità del bollettino per un cantiere in una data, o null se: giorno fuori dall'orizzonte
   oggi/domani del bollettino, comune non riconosciuto, o dati non ancora scaricati. Oltre al
   match esatto sul nome comune prova un contains, per cantieri scritti come "Cantiere - Comune". */
function pcInfoFor(cantiere, dateISO) {
  const byComune = _pcCache.byDate && _pcCache.byDate[dateISO];
  if (!byComune) return null;
  const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
  if (byComune[key]) return byComune[key];
  const found = Object.keys(byComune).find(c => key.indexOf(c) !== -1 || c.indexOf(key) !== -1);
  return found ? byComune[found] : null;
}

/* Colore peggiore tra i tre rischi (idraulico/temporali/idrogeologico) di una criticità PC. */
function pcColorePeggiore(pcInfo) {
  if (!pcInfo) return null;
  const RANK = { rossa: 3, arancione: 2, gialla: 1 };
  let best = null, bestRank = 0;
  ['idraulico', 'temporali', 'idrogeologico'].forEach(k => {
    const c = pcInfo[k];
    if (c && RANK[c] > bestRank) { bestRank = RANK[c]; best = c; }
  });
  return best;
}

/* ----- Widget "criticità meteo settimana" (header Griglia, accanto ad Aggiorna strumenti) -----
   Combina due segnali: soglie sulle previsioni Open-Meteo (tutta la settimana) e, quando
   disponibile, il bollettino ufficiale Protezione Civile (solo oggi/domani) — vince il peggiore
   dei due, ma il modal di dettaglio mostra sempre entrambe le fonti separatamente. */

/* Severità di un giorno/cantiere dal suo aggregato Open-Meteo, o null se nessuna criticità. */
function pwMeteoSeverityFor(info) {
  if (!info) return null;
  const CODICI_ALTA = [65, 66, 67, 82, 86, 95, 96, 99];   // pioggia intensa/gelata, neve intensa, temporali
  const CODICI_MEDIA = [56, 57, 63, 73, 75, 77, 81];      // pioggia gelata leggera, pioggia/neve moderate
  if (CODICI_ALTA.includes(info.code) || (info.pop != null && info.pop >= 80)) return 'alta';
  if (CODICI_MEDIA.includes(info.code) || (info.pop != null && info.pop >= 55)) return 'media';
  return null;
}

/* Scansiona la settimana corrente (tutti i cantieri pianificati) e restituisce sia la copertura
   (quanti cantiere+data distinti hanno già un meteo in cache) sia le criticità trovate — una per
   ogni combinazione commessa/squadra/cantiere/giorno (non deduplicate tra squadre diverse, perché
   ciascuna va poi collegata alla propria cella nella Griglia), ordinate per giorno poi severità
   poi commessa — usato sia dal badge nell'header sia dal modal di dettaglio. */
function pwWeatherWeekStatus() {
  const data = pwGetWeekData();
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const SEV_RANK = { alta: 0, media: 1 };
  const seenGeo = new Set();
  let total = 0, covered = 0;
  const crit = [];
  data.forEach((bc, cIdx) => (bc.squadre || []).forEach((sq, sIdx) => {
    for (let dayIdx = 0; dayIdx < 6; dayIdx++) {
      const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + dayIdx);
      const dateISO = d.toISOString().slice(0, 10);
      pwSquadraCantieriGiorno(sq, dayIdx).forEach(cantiere => {
        const geoKey = cantiere.toLowerCase().trim() + '|' + dateISO;
        if (!seenGeo.has(geoKey)) {
          seenGeo.add(geoKey);
          total++;
          if (pwMeteoInfoFor(cantiere, dateISO)) covered++;
        }
        const info = pwMeteoInfoFor(cantiere, dateISO);
        const meteoSeverity = pwMeteoSeverityFor(info);
        const pcInfo = pcInfoFor(cantiere, dateISO);
        const pcColor = pcColorePeggiore(pcInfo);
        const pcSeverity = pcColor === 'gialla' ? 'media' : (pcColor ? 'alta' : null);
        const severity = pcSeverity === 'alta' || meteoSeverity === 'alta' ? 'alta' : (pcSeverity || meteoSeverity);
        if (severity) {
          crit.push({
            cIdx, sIdx,
            commessa: bc.commessa || '(senza commessa)',
            squadraNome: sq.nome || '',
            cantiere, dayIdx, dateISO, severity, info, pcInfo, pcColor
          });
        }
      });
    }
  }));
  crit.sort((a, b) => a.dayIdx - b.dayIdx || SEV_RANK[a.severity] - SEV_RANK[b.severity]
    || a.commessa.localeCompare(b.commessa) || a.cantiere.localeCompare(b.cantiere));
  return { total, covered, crit };
}

/* Aggiorna aspetto/testo del bottone nell'header in base allo stato corrente (nessun cantiere,
   dati ancora in caricamento, nessuna criticità, o N criticità). Va richiamata sia subito in
   pwRender (riflette la cache già presente) sia a fine pwRefreshMeteoWeek (dati freschi). */
function pwUpdateWeatherWidget() {
  const btn = document.getElementById('pw-weather-week-btn');
  if (!btn) return;
  const { total, covered, crit } = pwWeatherWeekStatus();
  const BASE = 'px-3 py-1.5 text-sm border rounded no-print whitespace-nowrap ';
  if (!total) {
    btn.className = BASE + 'border-slate-200 bg-slate-50 text-slate-400';
    btn.textContent = '⛈️ Meteo settimana…';
    btn.title = 'Nessun cantiere pianificato questa settimana';
  } else if (covered < total) {
    btn.className = BASE + 'border-slate-200 bg-slate-50 text-slate-400';
    btn.textContent = '⛈️ Meteo settimana…';
    btn.title = 'Caricamento previsioni meteo in corso…';
  } else if (!crit.length) {
    btn.className = BASE + 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
    btn.textContent = '✅ Nessuna criticità meteo';
    btn.title = 'Clicca per il dettaglio (nessuna criticità rilevata nei cantieri pianificati questa settimana)';
  } else {
    const alta = crit.filter(c => c.severity === 'alta').length;
    const cls = alta ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100';
    btn.className = BASE + cls;
    btn.textContent = '⚠️ ' + crit.length + (crit.length === 1 ? ' criticità meteo' : ' criticità meteo');
    btn.title = 'Clicca per il dettaglio delle criticità meteo nei cantieri pianificati questa settimana';
  }
}

/* Modal di dettaglio: elenco per giorno -> commessa delle criticità trovate (severità, condizione,
   temperature, probabilità di pioggia). Ogni riga è cliccabile e riporta alla cella corrispondente
   nella Griglia (pwGoToWeatherCell). Apribile anche quando non ci sono criticità, per confermare
   che il controllo è stato fatto invece di lasciare solo un badge silenzioso. */
function pwOpenWeatherWeekModal() {
  const { crit } = pwWeatherWeekStatus();
  const DAY_NAMES_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const root = document.getElementById('modal-root');
  if (!root) return;

  const infoLine = c => {
    const meteoLine = c.info
      ? `${pwMeteoIconFor(c.info.code)} ${Math.round(c.info.tmax)}°/${Math.round(c.info.tmin)}°${c.info.pop != null ? ' · 💧' + Math.round(c.info.pop) + '%' : ''}`
      : '';
    const pcLine = c.pcColor
      ? `📋 Bollettino PC: allerta ${c.pcColor}${c.pcInfo && c.pcInfo.zona ? ' — zona ' + esc(c.pcInfo.zona) : ''}`
      : '';
    return [meteoLine, pcLine].filter(Boolean).join(' · ');
  };

  /* Raggruppa: giorno -> commessa, in modo che la prima cosa che si veda sia "cosa succede oggi/
     domani" e sotto, per ogni giorno, quali commesse sono coinvolte (una commessa con più squadre
     a rischio lo stesso giorno compare una volta sola, con una riga cliccabile per squadra). */
  const byDay = new Map();
  crit.forEach(c => {
    if (!byDay.has(c.dayIdx)) byDay.set(c.dayIdx, []);
    byDay.get(c.dayIdx).push(c);
  });

  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const sections = [...byDay.keys()].sort((a, b) => a - b).map(dayIdx => {
    const items = byDay.get(dayIdx);
    const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + dayIdx);
    const [, mm, dd] = d.toISOString().slice(0, 10).split('-');
    const byCommessa = new Map();
    items.forEach(c => {
      if (!byCommessa.has(c.commessa)) byCommessa.set(c.commessa, []);
      byCommessa.get(c.commessa).push(c);
    });
    const blocks = [...byCommessa.entries()].map(([commessa, entries]) => `
      <div class="pw-meteo-modal-block">
        <div class="pw-meteo-modal-cantiere">${esc(commessa)}</div>
        ${entries.map(c => {
          const sevIcon = c.severity === 'alta' ? '🔴' : '🟠';
          const sqLabel = c.squadraNome ? ` <span class="pw-meteo-modal-sq">(${esc(c.squadraNome)})</span>` : '';
          return `<div class="pw-meteo-modal-giorno pw-meteo-modal-clickable" onclick="pwGoToWeatherCell(${c.cIdx}, ${c.sIdx}, ${c.dayIdx})" title="Vai alla cella nella Griglia">
            ${sevIcon} <span class="pw-meteo-modal-giorno-label">${esc(c.cantiere)}</span>${sqLabel} — ${infoLine(c)}
          </div>`;
        }).join('')}
      </div>`).join('');
    return `<div class="pw-meteo-modal-section">
      <div class="pw-meteo-modal-day-header">${DAY_NAMES_FULL[dayIdx]} ${dd}/${mm}</div>
      ${blocks}
    </div>`;
  });

  const rows = sections.length
    ? sections.join('')
    : `<div class="text-slate-400 text-sm">Nessuna criticità meteo rilevata nei cantieri pianificati questa settimana.</div>`;
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-8 p-5">
    <h3 class="font-semibold text-slate-900 mb-1">⛈️ Criticità meteo — settimana</h3>
    <p class="text-xs text-slate-500 mb-3">Soglie sulle previsioni Open-Meteo (tutta la settimana) + bollettino ufficiale Protezione Civile quando disponibile (solo oggi/domani). Clicca una riga per andare alla cella corrispondente nella Griglia.</p>
    <div>${rows}</div>
    <div class="flex justify-end mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Chiudi</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}

/* Chiude il modal criticità meteo e porta l'utente esattamente alla cella (commessa/squadra/
   giorno) della Griglia che ha generato quella riga: espande commessa/squadra se collassate,
   scrolla la cella al centro e la evidenzia per un paio di secondi. Il bottone che apre il modal
   vive solo dentro il tab Griglia (#pw-view-griglia), quindi qui siamo già sul tab giusto. */
function pwGoToWeatherCell(cIdx, sIdx, dayIdx) {
  closeModal();
  const commKey = String(cIdx);
  const sqKey = cIdx + '-' + sIdx;
  let changed = false;
  if (_pwCollapsedComm.has(commKey)) { _pwCollapsedComm.delete(commKey); changed = true; }
  if (_pwCollapsedSq.has(sqKey)) { _pwCollapsedSq.delete(sqKey); changed = true; }
  if (changed) pwApplyCollapseState();
  setTimeout(() => {
    const cell = document.querySelector('.pw-day-cell[data-cidx="' + cIdx + '"][data-sidx="' + sIdx + '"][data-day="' + dayIdx + '"]');
    const target = cell || document.querySelector('.pw-squadra-block[data-collapse-key="' + sqKey + '"]');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('pw-weather-cell-flash');
    setTimeout(() => target.classList.remove('pw-weather-cell-flash'), 2000);
  }, 50);
}

/* ----- Refresh periodico (avviato una volta al caricamento dell'app) ----- */
function pwStartMeteoTimer() {
  setInterval(() => {
    const weeklyEl = document.getElementById('screen-weekly');
    if (weeklyEl && !weeklyEl.classList.contains('hidden') && _pwActiveTab === 'griglia') {
      pwRefreshMeteoWeek();
    }
  }, METEO_TTL_MS);
}
