/* ==================== AUTO-PIANIFICA (tab Pianificazione settimanale) ==================== */
/* Da una lista di cantieri con priorità produce una BOZZA della Griglia della settimana
   mostrata, la fa rivedere e solo su conferma la scrive in pwData (annullabile).
   Il calcolo sta in autoplan-solver.js (modulo puro); qui ci sono:
   - gli ADAPTER delle fonti: incolla da Excel/CSV, file .xlsx, riga manuale, cantieri
     della settimana precedente. Tutti producono le stesse righe (apNormRiga), così una
     fonte nuova (Jira, agente AI) è solo un altro adapter.
   - la stima dell'impegno dallo storico di controllo_produzione (cache localStorage 12h)
   - il contesto della settimana (disponibilità, posizioni, attestati, staffing)
   - la scrittura in Griglia e l'annullamento.
   La lista e la bozza sono locali (localStorage per settimana): nessun nuovo dominio di
   sync. In pwData arriva solo quello che l'utente applica, con un unico pwSave(). */

let _ap = {
  anno: null,
  week: null,
  righe: [],
  bozza: null,          // { anno, week, risultato, righeSolver, creata }
  modello: null,
  modelloInfo: '',
  opzioni: { sabato: false, maxKm: 250, meteo: true },
  precedenze: [],       // [[primaId, dopoId]] scelte dall'utente dai suggerimenti
  stato: { msg: '', err: false }
};
let _apSeq = 0;
const AP_STORAGE_KEY = 'ap_righe_v1';
const AP_UNDO_KEY = 'ap_undo_v1';
const AP_STORICO_KEY = 'ap_storico_v1';
const AP_STORICO_TTL_MS = 12 * 3600 * 1000;

const _apE = v => esc(v == null ? '' : String(v));
function _apNorm(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function _apWkKey(anno, week) { return anno + '-' + week; }

/* Ogni modifica a righe o opzioni rende vecchia la bozza: via lei e il suo messaggio */
function _apInvalidaBozza() {
  _ap.bozza = null;
  _ap.stato = { msg: '', err: false };
}

function _apStatus(msg, isError) {
  _ap.stato = { msg: msg || '', err: !!isError };
  const el = document.getElementById('ap-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#e11d48' : '#64748b';
}

/* ---------- persistenza locale (per settimana) ---------- */
function _apSalvaLocale() {
  try {
    const raw = localStorage.getItem(AP_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[_apWkKey(_ap.anno, _ap.week)] = { righe: _ap.righe, opzioni: _ap.opzioni, precedenze: _ap.precedenze, ts: Date.now() };
    // Tiene solo le 8 settimane toccate più di recente
    const keys = Object.keys(all).sort((a, b) => (all[b].ts || 0) - (all[a].ts || 0));
    keys.slice(8).forEach(k => delete all[k]);
    localStorage.setItem(AP_STORAGE_KEY, JSON.stringify(all));
  } catch (_) { /* storage pieno o bloccato: la lista resta in memoria */ }
}

function _apCaricaLocale() {
  _ap.righe = [];
  _ap.precedenze = [];
  try {
    const raw = localStorage.getItem(AP_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const s = all[_apWkKey(_ap.anno, _ap.week)];
    if (s) {
      _ap.righe = Array.isArray(s.righe) ? s.righe : [];
      if (s.opzioni) _ap.opzioni = Object.assign({ sabato: false, maxKm: 250, meteo: true }, s.opzioni);
      if (Array.isArray(s.precedenze)) _ap.precedenze = s.precedenze;
    }
  } catch (_) {}
  _ap.righe.forEach(r => { const n = parseInt(String(r.id).replace('r', ''), 10); if (n > _apSeq) _apSeq = n; });
}

/* ---------- ingresso nella tab ---------- */
function apInit() {
  if (_ap.anno !== pwAnno || _ap.week !== pwWeek) {
    _ap.anno = pwAnno;
    _ap.week = pwWeek;
    _ap.bozza = null;
    _apCaricaLocale();
  }
  apRender();
  if (!_ap.modello) apCaricaStorico(false);
}

/* ================= ADAPTER DELLE FONTI ================= */

/* Intestazioni riconosciute (minuscole, senza accenti). La prima che combacia vince. */
const AP_COLONNE = {
  cantiere: ['cantiere', 'comune', 'sito', 'localita', 'luogo'],
  commessa: ['commessa', 'progetto', 'cliente/progetto'],
  attivita: ['attivita', 'attività', 'lavorazione', 'tipo attivita'],
  km: ['km', 'km da rilevare', 'km rilevare', 'quantita', 'estensione', 'lunghezza'],
  giorni: ['giorni', 'gg', 'gg squadra', 'giorni squadra', 'giorni-squadra', 'durata'],
  nOp: ['operatori', 'n operatori', 'persone', 'n. operatori', 'op'],
  priorita: ['priorita', 'priorità', 'p', 'prio'],
  scadenza: ['scadenza', 'entro', 'deadline', 'data priorita'],
  dal: ['dal', 'non prima di', 'inizio', 'da'],
  skills: ['skill', 'skills', 'competenze'],
  preferiti: ['preferiti', 'squadra preferita', 'operatori preferiti'],
  esclusi: ['esclusi', 'operatori esclusi'],
  note: ['note', 'nota']
};

function _apHeaderCampo(h) {
  const k = _apNorm(h).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.:]/g, '');
  for (const campo of Object.keys(AP_COLONNE)) {
    if (AP_COLONNE[campo].some(x => x.normalize('NFD').replace(/[̀-ͯ]/g, '') === k)) return campo;
  }
  return null;
}

/* Converte una tabella (array di array, la prima riga può essere l'intestazione) in righe.
   Senza intestazione riconosciuta si usa l'ordine del modello scaricabile. */
function _apDaTabella(tab, fonte) {
  const rows = (tab || []).filter(r => Array.isArray(r) && r.some(c => String(c == null ? '' : c).trim()));
  if (!rows.length) return [];
  let mappa = rows[0].map(_apHeaderCampo);
  let dati = rows;
  if (mappa.filter(Boolean).length >= 2) {
    dati = rows.slice(1);
  } else {
    mappa = ['cantiere', 'commessa', 'attivita', 'km', 'giorni', 'nOp', 'priorita', 'scadenza', 'dal', 'skills', 'preferiti', 'esclusi', 'note'];
  }
  return dati.map(r => {
    const o = {};
    mappa.forEach((campo, i) => { if (campo && r[i] != null && String(r[i]).trim() !== '') o[campo] = r[i]; });
    return apNormRiga(o, fonte);
  }).filter(r => r.cantiere);
}

function _apNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function _apPriorita(v) {
  const s = _apNorm(v);
  if (!s) return 3;
  if (/^p?1$|critic|urgent|massima/.test(s)) return 1;
  if (/^p?2$|alta|high/.test(s)) return 2;
  return 3;
}

/* Data da testo gg/mm/aaaa, aaaa-mm-gg o numero seriale Excel -> ISO */
function _apData(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? parseInt(m[3], 10) : (_ap.anno || new Date().getFullYear());
    if (y < 100) y += 2000;
    return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return '';
}

function _apLista(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v || '').split(/[,;|]/).map(x => x.trim()).filter(Boolean);
}

/* Riconduce il nome di commessa scritto nella fonte a quello esatto usato in Griglia */
function _apCommessaCanonica(nome) {
  const n = _apNorm(nome);
  if (!n) return '';
  const valide = pwGetCommesseValide();
  const esatta = valide.find(c => _apNorm(c) === n);
  if (esatta) return esatta;
  const parziale = valide.filter(c => _apNorm(c).includes(n) || n.includes(_apNorm(c)));
  return parziale.length === 1 ? parziale[0] : String(nome).trim();
}

/* Nomi operatori scritti a mano -> nome esteso del pool (match su cognome o nome intero) */
function _apOperatoriCanonici(lista) {
  const pool = getOperatoriAttivi().map(o => o.nome_esteso || o.nome_breve).filter(Boolean);
  return _apLista(lista).map(x => {
    const n = _apNorm(x);
    const esatto = pool.find(p => _apNorm(p) === n);
    if (esatto) return esatto;
    const parz = pool.filter(p => _apNorm(p).split(' ').includes(n) || _apNorm(p).includes(n));
    return parz.length === 1 ? parz[0] : x;
  });
}

/* Forma unica di una riga, qualunque sia la fonte */
function apNormRiga(o, fonte) {
  return {
    id: 'r' + (++_apSeq),
    cantiere: String(o.cantiere || '').trim(),
    commessa: _apCommessaCanonica(o.commessa),
    attivita: String(o.attivita || '').trim(),
    km: _apNum(o.km),
    giorniManuali: _apNum(o.giorni),
    nOp: _apNum(o.nOp) ? Math.max(1, Math.round(_apNum(o.nOp))) : null,
    priorita: typeof o.priorita === 'number' && o.priorita >= 1 && o.priorita <= 3 ? o.priorita : _apPriorita(o.priorita),
    scadenza: _apData(o.scadenza),
    dal: _apData(o.dal),
    skills: _apLista(o.skills),
    preferiti: _apOperatoriCanonici(o.preferiti),
    esclusi: _apOperatoriCanonici(o.esclusi),
    note: String(o.note || '').trim(),
    fonte: fonte || 'manuale',
    includi: true
  };
}

function _apAggiungiRighe(nuove, fonte) {
  if (!nuove.length) { showAlertModal('Nessuna riga riconosciuta: serve almeno la colonna del cantiere.'); return; }
  _ap.righe = _ap.righe.concat(nuove);
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
  _apStatus(nuove.length + ' righe aggiunte da ' + fonte + '.');
}

/* Fonte 1: testo incollato (celle copiate da Excel = TAB; CSV con ; o ,) */
function apImportaTesto() {
  const ta = document.getElementById('ap-incolla');
  const txt = ta ? ta.value : '';
  if (!txt.trim()) { showAlertModal('Incolla prima le righe (anche copiate direttamente da Excel).'); return; }
  const linee = txt.split(/\r?\n/).filter(l => l.trim());
  const sep = linee[0].includes('\t') ? '\t' : (linee[0].includes(';') ? ';' : ',');
  const tab = linee.map(l => l.split(sep));
  _apAggiungiRighe(_apDaTabella(tab, 'incolla'), 'testo incollato');
  if (ta) ta.value = '';
}

/* Fonte 2: file .xlsx/.csv (primo foglio) */
function apImportaFile(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const tab = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      _apAggiungiRighe(_apDaTabella(tab, 'file'), 'file ' + f.name);
    } catch (err) {
      showAlertModal('File non leggibile: ' + (err.message || err));
    }
  };
  reader.readAsArrayBuffer(f);
}

/* Fonte 3: riga vuota da compilare */
function apAggiungiRiga() {
  _ap.righe.push(apNormRiga({}, 'manuale'));
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

/* Fonte 4: cantieri pianificati la settimana precedente (da completare: km residui) */
function apDaSettimanaPrecedente() {
  const prev = pwWeekAdd(pwAnno, pwWeek, -1);
  const wk = (pwData[prev.anno] && pwData[prev.anno][prev.week]) || [];
  const visti = new Set(_ap.righe.map(r => _apNorm(r.commessa) + '|' + _apNorm(r.cantiere) + '|' + _apNorm(r.attivita)));
  const nuove = [];
  wk.forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
    for (let d = 0; d < 6; d++) {
      pwCellVoci((op.giorni || {})[d]).forEach(v => {
        const k = _apNorm(bc.commessa) + '|' + _apNorm(v.cantiere) + '|' + _apNorm(v.attivita);
        if (visti.has(k)) return;
        visti.add(k);
        nuove.push(apNormRiga({ cantiere: v.cantiere, commessa: bc.commessa, attivita: v.attivita }, 'settimana ' + prev.week));
      });
    }
  })));
  if (!nuove.length) { showAlertModal('La settimana ' + prev.week + ' non ha cantieri nuovi da riportare.'); return; }
  _apAggiungiRighe(nuove, 'settimana ' + prev.week);
}

function apScaricaModello() {
  const intest = ['Cantiere', 'Commessa', 'Attività', 'Km', 'Giorni', 'Operatori', 'Priorità', 'Scadenza', 'Dal', 'Skill', 'Preferiti', 'Esclusi', 'Note'];
  const es = ['Ivrea', pwGetCommesseValide()[0] || 'Nome commessa', 'Rilievo WO Fognatura', 12, '', 2, 'P1', '', '', '', '', '', 'giorni vuoto = stima dallo storico'];
  const ws = XLSX.utils.aoa_to_sheet([intest, es]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cantieri');
  XLSX.writeFile(wb, 'auto-pianifica-modello.xlsx');
}

/* ================= STORICO PRODUZIONE -> MODELLO DI STIMA ================= */

async function apCaricaStorico(forza) {
  if (!forza) {
    try {
      const raw = localStorage.getItem(AP_STORICO_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.savedAt && Date.now() - c.savedAt < AP_STORICO_TTL_MS && Array.isArray(c.righe)) {
          _apImpostaModello(c.righe.map(_apStoricoDaArr), c.savedAt);
          return;
        }
      }
    } catch (_) {}
  }
  if (!_sbClient || !_sbUser) { _ap.modelloInfo = 'Storico non disponibile offline: stima a 1 giorno.'; apRender(); return; }
  _ap.modelloInfo = '⏳ Carico lo storico di produzione…';
  apRender();
  const PAGE = 1000, MAX_PAGES = 40;
  const righe = [];
  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const { data, error } = await _sbClient
        .from('controllo_produzione')
        .select('anno,week,giorno,commessa,squadra,cantiere,operatore,attivita,km_cad')
        .range(p * PAGE, p * PAGE + PAGE - 1);
      if (error) throw error;
      (data || []).forEach(r => righe.push(r));
      if (!data || data.length < PAGE) break;
    }
    try {
      localStorage.setItem(AP_STORICO_KEY, JSON.stringify({ savedAt: Date.now(), righe: righe.map(_apStoricoInArr) }));
    } catch (_) { /* troppo grande per lo storage: si riscarica al prossimo accesso */ }
    _apImpostaModello(righe, Date.now());
  } catch (e) {
    console.error('apCaricaStorico', e);
    _ap.modelloInfo = '⚠ Storico non caricato (' + (e.message || e) + '): stima a 1 giorno.';
    apRender();
  }
}

/* Forma compatta per localStorage (le chiavi ripetute pesano più dei dati) */
function _apStoricoInArr(r) { return [r.anno, r.week, r.giorno, r.commessa, r.squadra, r.cantiere, r.operatore, r.attivita, r.km_cad]; }
function _apStoricoDaArr(a) {
  return { anno: a[0], week: a[1], giorno: a[2], commessa: a[3], squadra: a[4], cantiere: a[5], operatore: a[6], attivita: a[7], km_cad: a[8] };
}

function _apImpostaModello(righe, ts) {
  _ap.modello = apBuildModello(righe);
  const nFam = Object.keys(_ap.modello.famiglie).filter(f => _ap.modello.famiglie[f].campioni >= AP_MIN_CAMPIONI).length;
  const d = new Date(ts);
  _ap.modelloInfo = 'Storico: ' + righe.length + ' righe, ' + nFam + ' famiglie di attività con stima · aggiornato ' +
    d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  apRender();
}

/* ================= CONTESTO DELLA SETTIMANA ================= */

function _apGiornoISO(d) {
  const mon = isoWeekToMonday(_ap.anno, _ap.week);
  const x = new Date(mon);
  x.setUTCDate(mon.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

/* Indice del giorno (0=Lun) di una data ISO nella settimana: <0 se prima, >5 se dopo */
function _apIndiceGiorno(iso) {
  if (!iso) return null;
  const mon = isoWeekToMonday(_ap.anno, _ap.week).getTime();
  const t = new Date(iso + 'T00:00:00Z').getTime();
  if (isNaN(t)) return null;
  return Math.round((t - mon) / 86400000);
}

/* Primo giorno pianificabile: nella settimana in corso da domani (oggi è già partito),
   per le settimane future da lunedì. Le settimane passate non si pianificano. */
function _apPrimoGiorno() {
  const oggi = new Date();
  const iso = isoWeekYear(oggi);
  if (iso.year === _ap.anno && iso.week === _ap.week) return ((oggi.getDay() + 6) % 7) + 1;
  const monCorr = isoWeekToMonday(iso.year, iso.week).getTime();
  const monSel = isoWeekToMonday(_ap.anno, _ap.week).getTime();
  return monSel < monCorr ? 99 : 0;
}

function _apAttestatiValidi(op) {
  return (nome, iso) => {
    const voce = attVoceOperatore(op, nome);
    if (!voce) return false;
    if (!iso || !voce.scad) return true;
    return voce.scad >= iso;
  };
}

function apBuildContesto() {
  const primo = _apPrimoGiorno();
  const data = pwGetWeekData();
  const prev = pwWeekAdd(pwAnno, pwWeek, -1);

  /* Doppia week: il flag in tab Doppia Week spesso è solo la DISPONIBILITÀ data
     dall'operatore a una trasferta lunga, messa prima di sapere dove andrà. Finché non
     è impiegato in Griglia è quindi pianificabile come gli altri, e in più anche il
     sabato (la doppia week lo comprende). Diventa indisponibile solo quando la doppia
     week è reale, cioè quando l'operatore ha già celle in Griglia: nella settimana di
     inizio (via tutta la settimana) o nella precedente (rientro giovedì, via Lun-Mer). */
  const dwStato = nome => {
    const viaTutta = pwIsDwEffettiva(pwAnno, pwWeek, nome);
    return {
      viaTutta,
      viaInizio: pwIsDwEffettiva(prev.anno, prev.week, nome),
      disponibile: pwIsDwStart(pwAnno, pwWeek, nome) && !viaTutta
    };
  };
  const conDwDisponibile = getOperatoriAttivi().some(op => dwStato(op.nome_esteso || op.nome_breve).disponibile);

  /* Il sabato entra nei giorni se richiesto, oppure se c'è qualcuno in doppia week
     disponibile (solo lui potrà lavorarci, vedi disp più sotto). */
  const ultimo = (_ap.opzioni.sabato || conDwDisponibile) ? 5 : 4;
  const giorni = [];
  for (let d = Math.max(0, primo); d <= ultimo; d++) giorni.push(d);
  const giorniISO = {};
  giorni.forEach(d => { giorniISO[d] = _apGiornoISO(d); });

  const ferieWk = (pwFerie[pwAnno] && pwFerie[pwAnno][pwWeek]) || {};
  const mese = isoWeekToMonday(pwAnno, pwWeek).getUTCMonth();

  const commessaSettimana = {};
  const occupato = {};
  const posizione = {};
  data.forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
    const n = (op.nome || '').trim();
    if (!n) return;
    if (!commessaSettimana[n] && bc.commessa) commessaSettimana[n] = bc.commessa;
    for (let d = 0; d < 6; d++) {
      const cs = pwCellCantieri((op.giorni || {})[d]);
      if (!cs.length) continue;
      if (!occupato[n]) occupato[n] = {};
      occupato[n][d] = true;
      const g = cs.map(meteoGeoFor).find(Boolean);
      if (g) {
        if (!posizione[n]) posizione[n] = {};
        posizione[n][d] = { lat: g.lat, lng: g.lng, label: cs[0] };
      }
    }
  })));

  const staffing = {};
  (state.staffing || []).forEach(r => {
    if (!r.risorsa || !r.commessa || !((Number((r.mesi || [])[mese]) || 0) > 0)) return;
    if (!staffing[r.risorsa]) staffing[r.risorsa] = new Set();
    staffing[r.risorsa].add(r.commessa);
  });

  const operatori = [];
  const disp = {};
  getOperatoriAttivi().forEach(op => {
    const nome = op.nome_esteso || op.nome_breve;
    if (!nome) return;
    let base = null;
    const res = op.comune_residenza ? meteoGeoFor(op.comune_residenza) : null;
    if (res) base = { lat: res.lat, lng: res.lng, label: op.comune_residenza };
    else {
      const p = provinciaInfo(op.provincia);
      if (p) base = { lat: p.lat, lng: p.lng, label: p.nome };
    }
    operatori.push({
      nome,
      skills: new Set(op.skills || []),
      attestatiValidi: _apAttestatiValidi(op),
      fineRapporto: op.contratto_tipo === 'determinato' ? (op.data_fine_rapporto || null) : null,
      base,
      commessaSettimana: commessaSettimana[nome] || null,
      staffing: staffing[nome] || new Set(),
      dwDisponibile: false
    });
    const dw = dwStato(nome);
    operatori[operatori.length - 1].dwDisponibile = dw.disponibile;
    disp[nome] = {};
    for (let d = 0; d < 6; d++) {
      let st = 'libero';
      if (dw.viaTutta || (dw.viaInizio && d <= 2)) st = 'dw';
      else if (ferieWk[nome] && pwFerieTipo(ferieWk[nome][d])) st = 'ferie';
      else if (occupato[nome] && occupato[nome][d]) st = 'occupato';
      else if (d === 5 && !_ap.opzioni.sabato && !dw.disponibile) st = 'sabato'; // sabato solo per la doppia week
      disp[nome][d] = st;
    }
  });

  return {
    giorni, giorniISO, operatori, disp, posizione,
    modello: _ap.modello,
    pesi: { maxKmTrasferta: _ap.opzioni.maxKm || 250 }
  };
}

/* ================= DISTANZE STRADALI (OSRM) ================= */

/* Km stradali fra coppie di punti ("lat,lng>lat,lng" a 4 decimali), null = nessun percorso.
   In memoria per la sessione: ricalcolare dopo una modifica non rifà le chiamate. */
const _apDistCache = {};
const AP_OSRM_MAX_PUNTI = 90;  // il server pubblico rifiuta tabelle troppo grandi

function _apPuntoKey(p) { return p.lat.toFixed(4) + ',' + p.lng.toFixed(4); }

function _apUnici(punti) {
  const out = {};
  punti.forEach(p => { if (p && p.lat != null && p.lng != null) out[_apPuntoKey(p)] = p; });
  return Object.values(out);
}

/* Una chiamata OSRM /table per blocco di origini, tutte le destinazioni in colonna. Se il
   servizio non risponde si prosegue: le coppie mancanti ricadono sulla linea d'aria x 1,3
   dentro il solver, e la bozza dice che quelle distanze sono stimate. */
async function _apCaricaDistanze(origini, destinazioni) {
  const dest = _apUnici(destinazioni);
  const orig = _apUnici(origini).filter(o => dest.some(d => !((_apPuntoKey(o) + '>' + _apPuntoKey(d)) in _apDistCache)));
  if (!dest.length) return { info: 'nessun cantiere localizzato: distanze non valutate' };
  if (dest.length > AP_OSRM_MAX_PUNTI - 10) return { info: 'troppi cantieri per il calcolo stradale: distanze stimate in linea d\'aria' };
  const passo = AP_OSRM_MAX_PUNTI - dest.length;
  let falliti = 0;
  for (let i = 0; i < orig.length; i += passo) {
    const blocco = orig.slice(i, i + passo);
    const punti = blocco.concat(dest);
    const url = 'https://router.project-osrm.org/table/v1/driving/' +
      punti.map(p => p.lng.toFixed(5) + ',' + p.lat.toFixed(5)).join(';') +
      '?annotations=distance' +
      '&sources=' + blocco.map((_, k) => k).join(';') +
      '&destinations=' + dest.map((_, k) => blocco.length + k).join(';');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || data.code !== 'Ok' || !Array.isArray(data.distances)) throw new Error('risposta non valida');
      data.distances.forEach((row, a) => row.forEach((v, b) => {
        _apDistCache[_apPuntoKey(blocco[a]) + '>' + _apPuntoKey(dest[b])] = v == null ? null : v / 1000;
      }));
    } catch (e) {
      console.warn('OSRM non disponibile per un blocco di distanze:', e);
      falliti++;
    }
    if (i + passo < orig.length) await new Promise(res => setTimeout(res, 250));
  }
  if (falliti) return { info: 'servizio stradale non raggiungibile per parte dei punti: quelle distanze sono stimate in linea d\'aria' };
  return { info: 'distanze stradali (OSRM)' };
}

/* ================= METEO ================= */

/* Penalità/blocchi per cantiere e giorno, dal meteo già usato in Griglia:
   - allerta arancione/rossa del bollettino Protezione Civile -> giorno escluso (il
     bollettino copre solo oggi e domani);
   - previsione Open-Meteo di severità "alta" (pioggia intensa, temporali) -> forte
     penalità: il cantiere si sposta se c'è un altro giorno, altrimenti resta con avviso;
   - severità "media" o allerta gialla -> penalità lieve.
   Oltre l'orizzonte delle previsioni (15 giorni) non si considera nulla, e lo si dice. */
const AP_METEO_PEN_ALTA = 250;
const AP_METEO_PEN_MEDIA = 80;

async function _apPreparaMeteo(righeSolver, ctx) {
  if (!_ap.opzioni.meteo) return { meteo: {}, info: 'meteo non considerato' };
  const oggi = meteoTodayISO();
  const max = new Date(); max.setUTCDate(max.getUTCDate() + METEO_MAX_FORECAST_DAYS);
  const maxISO = max.toISOString().slice(0, 10);
  const giorni = ctx.giorni.filter(d => ctx.giorniISO[d] >= oggi && ctx.giorniISO[d] <= maxISO);
  if (!giorni.length) return { meteo: {}, info: 'settimana oltre l\'orizzonte delle previsioni: meteo non considerato' };
  const startISO = ctx.giorniISO[giorni[0]];
  const endISO = ctx.giorniISO[giorni[giorni.length - 1]];

  const viste = new Set();
  for (const r of righeSolver) {
    const geo = meteoGeoFor(r.cantiere);
    if (!geo) continue;
    const pk = meteoPosKey(geo);
    if (viste.has(pk)) continue;
    viste.add(pk);
    const c = _meteoCache[pk + '|' + startISO];
    if (c && Date.now() - c.fetchedAt < METEO_TTL_MS && _meteoCache[pk + '|' + endISO]) continue;
    await pwFetchMeteoRange(geo.lat, geo.lng, startISO, endISO);
  }
  try { await pcRefreshBollettino(); } catch (_) { /* bollettino facoltativo */ }

  const meteo = {};
  let conPrevisione = 0, allerte = 0, sfavorevoli = 0;
  righeSolver.forEach(r => {
    const perGiorno = {};
    let haDati = false;
    giorni.forEach(d => {
      const iso = ctx.giorniISO[d];
      const info = pwMeteoInfoFor(r.cantiere, iso);
      if (info) haDati = true;
      const sev = pwMeteoSeverityFor(info);
      const pc = pcColorePeggiore(pcInfoFor(r.cantiere, iso));
      const pioggia = info && info.pop != null ? ' ' + Math.round(info.pop) + '%' : '';
      if (pc === 'arancione' || pc === 'rossa') {
        perGiorno[d] = { blocco: true, pen: 0, motivo: 'allerta ' + pc + ' Protezione Civile' };
        allerte++;
      } else if (sev === 'alta') {
        perGiorno[d] = { pen: AP_METEO_PEN_ALTA, motivo: 'maltempo forte' + pioggia };
        sfavorevoli++;
      } else if (sev === 'media' || pc === 'gialla') {
        perGiorno[d] = { pen: AP_METEO_PEN_MEDIA, motivo: pc === 'gialla' ? 'allerta gialla' : 'pioggia probabile' + pioggia };
        sfavorevoli++;
      }
    });
    if (haDati) conPrevisione++;
    if (Object.keys(perGiorno).length) meteo[r.id] = perGiorno;
  });
  const info = 'meteo: previsioni per ' + conPrevisione + '/' + righeSolver.length + ' cantieri' +
    (allerte ? ', ' + allerte + ' giorni esclusi per allerta' : '') +
    (sfavorevoli ? ', ' + sfavorevoli + ' giorni sfavorevoli' : '') +
    (giorni.length < ctx.giorni.length ? ' (previsioni disponibili solo fino al ' + endISO.slice(8, 10) + '/' + endISO.slice(5, 7) + ')' : '');
  return { meteo, info };
}

/* ================= PRECEDENZE (dai suggerimenti) ================= */

function apApplicaSuggerimento(el) {
  const b = _ap.bozza;
  const i = parseInt(el.dataset.sugg, 10);
  const sg = b && b.risultato.suggerimenti[i];
  if (!sg) return;
  /* Una precedenza opposta fra le stesse due righe viene sostituita */
  _ap.precedenze = _ap.precedenze.filter(([a, c]) => !(a === sg.primaDi && c === sg.rigaId) && !(a === sg.rigaId && c === sg.primaDi));
  _ap.precedenze.push([sg.rigaId, sg.primaDi]);
  _apSalvaLocale();
  apCalcola();
}

function apRimuoviPrecedenza(el) {
  const i = parseInt(el.dataset.prec, 10);
  if (isNaN(i)) return;
  _ap.precedenze.splice(i, 1);
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

/* ================= CALCOLO BOZZA ================= */

function _apRigaCompleta(r) {
  return r.cantiere && r.commessa;
}

async function apCalcola() {
  const righe = _ap.righe.filter(r => r.includi && _apRigaCompleta(r));
  if (!righe.length) { showAlertModal('Serve almeno una riga inclusa con cantiere e commessa.'); return; }
  if (_apPrimoGiorno() > (_ap.opzioni.sabato ? 5 : 4)) {
    showAlertModal('Questa settimana è già passata (o non ha più giorni utili): scegli una settimana futura.');
    return;
  }
  const btn = document.getElementById('ap-calcola-btn');
  if (btn) btn.disabled = true;
  try {
    const daLocalizzare = Array.from(new Set(righe.map(r => r.cantiere)))
      .filter(c => !(_apNorm(c) in _geoCache));
    for (let i = 0; i < daLocalizzare.length; i++) {
      _apStatus('Localizzo cantieri… (' + (i + 1) + '/' + daLocalizzare.length + ') ' + daLocalizzare[i]);
      await geocodifica(daLocalizzare[i]);
      await new Promise(res => setTimeout(res, 300));
    }
    const ctx = apBuildContesto();
    const righeSolver = righe.map(r => {
      const stima = apStimaImpegno(r, _ap.modello);
      const meta = (state.commesse_attive_meta || {})[r.commessa] || {};
      const geo = meteoGeoFor(r.cantiere);
      const sg = _apIndiceGiorno(r.scadenza);
      const dg = _apIndiceGiorno(r.dal);
      return {
        id: r.id,
        cantiere: r.cantiere,
        commessa: r.commessa,
        attivita: r.attivita,
        famiglia: stima.famiglia,
        geo: geo ? { lat: geo.lat, lng: geo.lng } : null,
        giorni: stima.giorni,
        stimaFonte: stima.fonte,
        nOp: stima.nOp,
        priorita: r.priorita || 3,
        scadenzaGiorno: sg == null ? null : (sg > 5 ? null : sg),
        dalGiorno: dg == null ? 0 : Math.max(0, dg),
        /* Skill della riga + quelle dell'anagrafica commessa: solo preferenza (la squadra
           che le copre è favorita, se mancano c'è un avviso), mai motivo di esclusione */
        skills: Array.from(new Set((r.skills || []).concat(meta.skills || []))),
        attestati: meta.attestati_richiesti || [],
        preferiti: r.preferiti || [],
        esclusi: r.esclusi || []
      };
    });

    /* Distanze stradali: origini = residenze, posizioni già in Griglia e gli stessi cantieri
       (dopo un cantiere l'operatore riparte da lì); destinazioni = i cantieri da pianificare. */
    const destinazioni = righeSolver.map(r => r.geo).filter(Boolean);
    const origini = destinazioni.slice();
    ctx.operatori.forEach(o => { if (o.base) origini.push(o.base); });
    Object.values(ctx.posizione).forEach(pp => Object.values(pp).forEach(p => origini.push(p)));
    _apStatus('Calcolo le distanze stradali…');
    const dist = await _apCaricaDistanze(origini, destinazioni);
    ctx.distanzaKm = (a, b) => {
      const v = _apDistCache[_apPuntoKey(a) + '>' + _apPuntoKey(b)];
      return v == null ? null : v;
    };

    _apStatus('Controllo il meteo…');
    const met = await _apPreparaMeteo(righeSolver, ctx);
    ctx.meteo = met.meteo;

    const ids = new Set(righeSolver.map(r => r.id));
    ctx.precedenze = _ap.precedenze.filter(([a, b]) => ids.has(a) && ids.has(b));

    _apStatus('Calcolo la bozza…');
    await new Promise(res => setTimeout(res, 0)); // lascia disegnare lo stato prima del calcolo
    const risultato = apRisolvi(ctx, righeSolver);
    _ap.bozza = { anno: _ap.anno, week: _ap.week, risultato, righeSolver, ctxGiorni: ctx.giorni, creata: Date.now(),
      infoDistanze: dist.info, infoMeteo: met.info,
      dwDisponibili: ctx.operatori.filter(o => o.dwDisponibile).map(o => o.nome) };
    const es = Object.values(risultato.esiti);
    apRender();
    _apStatus('Bozza pronta: ' + es.filter(e => e.stato === 'assegnato').length + ' assegnati, ' +
      es.filter(e => e.stato === 'parziale').length + ' parziali, ' +
      es.filter(e => e.stato === 'non_assegnato').length + ' non assegnati.');
  } catch (e) {
    console.error('apCalcola', e);
    _apStatus('Errore nel calcolo: ' + (e.message || e), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ================= APPLICAZIONE IN GRIGLIA ================= */

/* Riga operatore dove scrivere: quella già presente nella commessa; altrimenti si
   aggiunge nella squadra (della stessa commessa) di un compagno della stessa
   assegnazione; altrimenti in una squadra nuova. */
function _apRigaOperatore(bc, nome, compagni) {
  for (const sq of bc.squadre) {
    const op = (sq.operatori || []).find(o => (o.nome || '').trim() === nome);
    if (op) return op;
  }
  let sq = bc.squadre.find(s => (s.operatori || []).some(o => compagni.includes((o.nome || '').trim())));
  if (!sq) {
    /* Una squadra vuota lasciata dall'utente (solo righe senza nome) viene riusata */
    sq = bc.squadre.find(s => !(s.operatori || []).some(o => (o.nome || '').trim()));
    if (!sq) {
      sq = { nome: 'Squadra ' + (bc.squadre.length + 1), operatori: [] };
      bc.squadre.push(sq);
    }
  }
  const vuota = (sq.operatori || []).find(o => !(o.nome || '').trim() && !Object.keys(o.giorni || {}).length);
  if (vuota) { vuota.nome = nome; vuota.giorni = vuota.giorni || {}; return vuota; }
  const nuovo = { nome, giorni: {} };
  sq.operatori.push(nuovo);
  return nuovo;
}

function _apScriviCella(op, d, cantiere, attivita) {
  const g = op.giorni[d] || {};
  const voci = pwCellVoci(g);
  if (voci.some(v => _apNorm(v.cantiere) === _apNorm(cantiere) && _apNorm(v.attivita) === _apNorm(attivita))) return false;
  voci.push({ cantiere, attivita: attivita || '' });
  g.cantieri = voci.map(v => v.cantiere);
  g.attivitaCantieri = voci.map(v => v.attivita);
  delete g.cantiere;
  pwCellSyncAttivita(g);
  op.giorni[d] = g;
  return true;
}

/* Operatore ancora libero quel giorno, secondo i dati ATTUALI (non quelli del calcolo):
   un collega può aver modificato Griglia o ferie nel frattempo (Realtime). */
function _apAncoraLibero(data, nome, d) {
  const ferieWk = (pwFerie[pwAnno] && pwFerie[pwAnno][pwWeek]) || {};
  if (ferieWk[nome] && pwFerieTipo(ferieWk[nome][d])) return false;
  for (const bc of data) for (const sq of (bc.squadre || [])) for (const op of (sq.operatori || [])) {
    if ((op.nome || '').trim() === nome && pwCellCantieri((op.giorni || {})[d]).length) return false;
  }
  return true;
}

async function apApplica() {
  if (!sbGuardWrite()) return;
  const b = _ap.bozza;
  if (!b || !b.risultato.assegnazioni.length) { showAlertModal('Non c\'è una bozza da applicare.'); return; }
  if (b.anno !== pwAnno || b.week !== pwWeek) { showAlertModal('La bozza è di un\'altra settimana: ricalcola.'); return; }
  const incluse = new Set(_ap.righe.filter(r => r.includi).map(r => r.id));
  const ass = b.risultato.assegnazioni.filter(a => incluse.has(a.rigaId));
  const nCelle = ass.reduce((n, a) => n + a.operatori.length, 0);
  const ok = await showConfirmAsync('Scrivere in Griglia ' + nCelle + ' celle (settimana ' + pwWeek + ')? Le celle già compilate non vengono toccate e l\'operazione si può annullare.', 'Applica');
  if (!ok) return;

  const data = pwGetWeekData();
  const snapshot = JSON.stringify(data);
  const righeById = {};
  b.righeSolver.forEach(r => { righeById[r.id] = r; });
  const giorniOccupatiDaBozza = new Set();
  let scritte = 0;
  const saltate = [];
  const toccate = new Set();
  ass.forEach(a => {
    const r = righeById[a.rigaId];
    let bc = data.find(x => _apNorm(x.commessa) === _apNorm(r.commessa));
    if (!bc) { bc = { commessa: r.commessa, squadre: [] }; data.push(bc); }
    if (!Array.isArray(bc.squadre)) bc.squadre = [];
    a.operatori.forEach(nome => {
      /* Una cella scritta da questa stessa bozza (mezza giornata + altro cantiere) non è un conflitto */
      const kGiorno = nome + '|' + a.giorno;
      if (!giorniOccupatiDaBozza.has(kGiorno) && !_apAncoraLibero(data, nome, a.giorno)) {
        saltate.push(nome + ' ' + PW_MAP_DAY_SHORT[a.giorno] + ' (' + r.cantiere + ')');
        return;
      }
      const op = _apRigaOperatore(bc, nome, a.operatori);
      if (_apScriviCella(op, a.giorno, r.cantiere, r.attivita)) { scritte++; giorniOccupatiDaBozza.add(kGiorno); toccate.add(bc); }
    });
  });
  data.forEach((bc, i) => { if (toccate.has(bc)) pwRinumeraSquadreDefault(i); });

  try {
    localStorage.setItem(AP_UNDO_KEY, JSON.stringify({ anno: pwAnno, week: pwWeek, snapshot, ts: Date.now(), celle: scritte }));
  } catch (_) {}
  await pwSave();
  sbLogActivity('Auto-pianifica: bozza applicata', { anno: pwAnno, week: pwWeek, celle: scritte, cantieri: new Set(ass.map(a => a.rigaId)).size, saltate: saltate.length });
  _ap.bozza = null;
  apRender();
  showAlertModal('Scritte ' + scritte + ' celle in Griglia.' +
    (saltate.length ? '\n\nSaltate perché nel frattempo occupate o in ferie:\n' + saltate.join('\n') : ''));
}

async function apAnnulla() {
  if (!sbGuardWrite()) return;
  let u = null;
  try { u = JSON.parse(localStorage.getItem(AP_UNDO_KEY) || 'null'); } catch (_) {}
  if (!u || u.anno !== pwAnno || u.week !== pwWeek) { showAlertModal('Nessuna applicazione da annullare per questa settimana (su questo browser).'); return; }
  const quando = new Date(u.ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const ok = await showConfirmAsync('Riportare la Griglia della settimana ' + pwWeek + ' a com\'era prima dell\'applicazione del ' + quando + '? Anche le modifiche fatte a mano DOPO quel momento su questa settimana andranno perse.', 'Annulla applicazione');
  if (!ok) return;
  if (!pwData[pwAnno]) pwData[pwAnno] = {};
  pwData[pwAnno][pwWeek] = JSON.parse(u.snapshot);
  try { localStorage.removeItem(AP_UNDO_KEY); } catch (_) {}
  await pwSave();
  sbLogActivity('Auto-pianifica: applicazione annullata', { anno: pwAnno, week: pwWeek, celle: u.celle });
  apRender();
  _apStatus('Applicazione annullata.');
}

/* ================= MODIFICA RIGHE ================= */

function _apRigaDaEl(el) {
  const id = el && el.closest('[data-ap-id]') && el.closest('[data-ap-id]').dataset.apId;
  return _ap.righe.find(r => r.id === id) || null;
}

function apSetCampo(el) {
  const r = _apRigaDaEl(el);
  if (!r) return;
  const campo = el.dataset.campo;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  if (campo === 'km' || campo === 'giorniManuali') r[campo] = _apNum(v);
  else if (campo === 'nOp') r.nOp = _apNum(v) ? Math.max(1, Math.round(_apNum(v))) : null;
  else if (campo === 'priorita') r.priorita = parseInt(v, 10) || 3;
  else if (campo === 'commessa') r.commessa = _apCommessaCanonica(v);
  else if (campo === 'skills') r.skills = _apLista(v);
  else if (campo === 'preferiti' || campo === 'esclusi') r[campo] = _apOperatoriCanonici(v);
  else r[campo] = v;
  /* La spunta "includi" decide solo cosa applicare: la bozza resta valida */
  if (campo !== 'includi') _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

function apRimuoviRiga(el) {
  const r = _apRigaDaEl(el);
  if (!r) return;
  _ap.righe = _ap.righe.filter(x => x !== r);
  _ap.precedenze = _ap.precedenze.filter(([x, y]) => x !== r.id && y !== r.id);
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

async function apSvuota() {
  if (!_ap.righe.length) return;
  const ok = await showConfirmAsync('Svuotare la lista dei cantieri di questa settimana? La Griglia non viene toccata.', 'Svuota');
  if (!ok) return;
  _ap.righe = [];
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

function apSetOpzione(el) {
  const k = el.dataset.opz;
  _ap.opzioni[k] = el.type === 'checkbox' ? el.checked : (parseInt(el.value, 10) || 250);
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

/* ================= RENDER ================= */

const AP_STATO_STILE = {
  assegnato:     { bg: '#dcfce7', fg: '#15803d', t: 'Assegnato', icona: '✓' },
  parziale:      { bg: '#fef3c7', fg: '#b45309', t: 'Parziale', icona: '◐' },
  non_assegnato: { bg: '#fee2e2', fg: '#b91c1c', t: 'Non assegnato', icona: '✕' }
};

function apRender() {
  const root = document.getElementById('ap-root');
  if (!root) return;
  /* Un ridisegno (es. storico appena caricato) sostituisce il bottone a cui è agganciato
     il menu aperto: lo si chiude tenendo le scelte già fatte. */
  if (_apDd) {
    const el = document.getElementById('ap-dd');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    root.style.paddingBottom = '';
    if (_apDd.modificato) { _ap.bozza = null; _apSalvaLocale(); }
    _apDd = null;
  }
  const giorniLabel = _ap.anno ? ('Settimana ' + _ap.week + ' · ' + _ap.anno) : '';
  let undo = null;
  try { undo = JSON.parse(localStorage.getItem(AP_UNDO_KEY) || 'null'); } catch (_) {}
  const puoAnnullare = undo && undo.anno === pwAnno && undo.week === pwWeek;

  root.innerHTML =
    '<div class="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">' +
      _apPannelloFontiHtml() +
      '<div class="xl:col-span-4 space-y-4" style="min-width:0;">' +
        '<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">' +
          '<div class="flex flex-wrap items-center gap-2 mb-2">' +
            '<div class="text-xs font-semibold text-slate-700 uppercase tracking-wide">📋 Cantieri da pianificare · ' + _apE(giorniLabel) + '</div>' +
            '<div class="flex-1"></div>' +
            '<label class="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" data-opz="sabato" onchange="apSetOpzione(this)"' + (_ap.opzioni.sabato ? ' checked' : '') + '> anche sabato</label>' +
            '<label class="text-xs text-slate-600 flex items-center gap-1" title="Evita i giorni con allerta Protezione Civile e sposta, se possibile, quelli con maltempo previsto"><input type="checkbox" data-opz="meteo" onchange="apSetOpzione(this)"' + (_ap.opzioni.meteo ? ' checked' : '') + '> considera meteo</label>' +
            '<label class="text-xs text-slate-600 flex items-center gap-1">max km trasferta <input type="number" min="20" step="10" data-opz="maxKm" onchange="apSetOpzione(this)" value="' + _apE(_ap.opzioni.maxKm) + '" class="w-16 border border-slate-300 rounded px-1 py-0.5 text-xs"></label>' +
            '<button type="button" onclick="apSvuota()" class="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">Svuota</button>' +
            '<button type="button" id="ap-calcola-btn" onclick="apCalcola()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:var(--accent,#0d9488);">🤖 Calcola bozza</button>' +
          '</div>' +
          '<div class="text-[11px] text-slate-500 mb-2">' + _apE(_ap.modelloInfo) +
            ' <button type="button" onclick="apCaricaStorico(true)" class="underline">aggiorna</button></div>' +
          _apTabellaRigheHtml() +
          _apPrecedenzeHtml() +
          '<div id="ap-status" class="text-xs mt-2" style="color:' + (_ap.stato.err ? '#e11d48' : '#64748b') + ';">' + _apE(_ap.stato.msg) + '</div>' +
        '</div>' +
        _apBozzaHtml(puoAnnullare) +
      '</div>' +
    '</div>';
}

function _apPannelloFontiHtml() {
  /* Colonna a sinistra da 1280px in su; sotto, sta sopra la tabella e si dispone su due
     colonne (incolla | altre fonti) per non occupare mezza pagina in altezza. */
  return '<div class="xl:col-span-1 bg-white border border-slate-200 rounded-lg p-3 shadow-sm no-print">' +
    '<div class="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">🤖 Auto-pianifica</div>' +
    '<div class="text-[11px] text-slate-500 leading-snug mb-3">Carica i cantieri da una o più fonti, controlla stima e priorità, poi calcola una bozza: la Griglia cambia solo quando premi <b>Applica</b>.</div>' +
    '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3">' +
      '<div>' +
        '<label class="block text-xs font-semibold text-slate-600 mb-1">Incolla da Excel / CSV</label>' +
        '<textarea id="ap-incolla" rows="4" placeholder="Cantiere&#9;Commessa&#9;Attività&#9;Km&#9;…&#9;Priorità" class="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono"></textarea>' +
        '<button type="button" onclick="apImportaTesto()" class="mt-1 w-full text-xs px-2 py-1.5 border border-slate-300 rounded hover:bg-slate-50">⬇ Importa righe incollate</button>' +
      '</div>' +
      '<div>' +
        '<div class="grid grid-cols-1 gap-1">' +
          '<button type="button" onclick="document.getElementById(\'ap-file\').click()" class="text-xs px-2 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-left">📂 Da file .xlsx / .csv</button>' +
          '<button type="button" onclick="apDaSettimanaPrecedente()" class="text-xs px-2 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-left">↩ Cantieri della settimana precedente</button>' +
          '<button type="button" onclick="apAggiungiRiga()" class="text-xs px-2 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-left">＋ Riga manuale</button>' +
          '<button type="button" onclick="apScaricaModello()" class="text-xs px-2 py-1.5 text-slate-500 hover:text-slate-800 text-left underline">Scarica il modello Excel</button>' +
        '</div>' +
        '<div class="text-[10px] text-slate-400 leading-snug mt-2">Colonne riconosciute: Cantiere, Commessa, Attività, Km, Giorni, Operatori, Priorità (P1/P2/P3), Scadenza, Dal, Skill, Preferiti, Esclusi, Note. Giorni vuoto = stima dallo storico di produzione.</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ---------- cataloghi per i menu a tendina ---------- */

const AP_ATT_CUSTOM_KEY = 'ap_attivita_custom';

/* Attività proponibili: quelle dello storico di produzione, quelle già scritte in Griglia
   quest'anno e quelle aggiunte a mano da questa tab. In Griglia l'attività è testo libero
   (non c'è un catalogo condiviso): una nuova attività diventa "di tutti" appena la bozza
   viene applicata, perché da lì in poi la si ritrova in pwData. */
function _apAttivitaCatalogo() {
  const byNorm = {};
  const add = a => { const t = String(a || '').trim(); if (t && !byNorm[_apNorm(t)]) byNorm[_apNorm(t)] = t; };
  try { (JSON.parse(localStorage.getItem(AP_ATT_CUSTOM_KEY) || '[]') || []).forEach(add); } catch (_) {}
  if (_ap.modello) Object.values(_ap.modello.famiglie).forEach(F => F.varianti.forEach(add));
  Object.values(pwData[_ap.anno] || {}).forEach(wk => (Array.isArray(wk) ? wk : []).forEach(bc =>
    (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
      for (let d = 0; d < 6; d++) pwCellVoci((op.giorni || {})[d]).forEach(v => add(v.attivita));
    }))));
  _ap.righe.forEach(r => add(r.attivita));
  return Object.values(byNorm).sort((a, b) => a.localeCompare(b));
}

function _apAttivitaAggiungi(testo) {
  try {
    const arr = JSON.parse(localStorage.getItem(AP_ATT_CUSTOM_KEY) || '[]') || [];
    if (!arr.some(a => _apNorm(a) === _apNorm(testo))) arr.push(testo);
    localStorage.setItem(AP_ATT_CUSTOM_KEY, JSON.stringify(arr));
  } catch (_) {}
}

function _apSkillCatalogo() {
  const s = new Set(SKILLS);
  getOperatoriAttivi().forEach(o => (o.skills || []).forEach(k => s.add(k)));
  Object.values(state.commesse_attive_meta || {}).forEach(m => (m.skills || []).forEach(k => s.add(k)));
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function _apOperatoriCatalogo() {
  return getOperatoriAttivi().map(o => o.nome_esteso || o.nome_breve).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function _apSkillCommessa(commessa) {
  return ((state.commesse_attive_meta || {})[commessa] || {}).skills || [];
}

/* ---------- menu a tendina con ricerca (unico per tutta la tab) ----------
   Un solo popover #ap-dd agganciato al <body> in position:fixed, così non viene tagliato
   dalla tabella. Si apre sotto il bottone della cella; per i campi a scelta multipla le
   spunte aggiornano solo l'array della riga e l'etichetta del bottone, senza ricostruire
   la lista sotto il cursore: il ridisegno della tab avviene alla chiusura. */
const AP_DD_MULTI = { skills: true, preferiti: true, esclusi: true };
let _apDd = null;   // { rigaId, campo, btn, modificato }

function _apDdOpzioni(campo) {
  if (campo === 'commessa') return pwGetCommesseValide();
  if (campo === 'attivita') return _apAttivitaCatalogo();
  if (campo === 'skills') return _apSkillCatalogo();
  return _apOperatoriCatalogo();
}

function _apDdEl() {
  let el = document.getElementById('ap-dd');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'ap-dd';
  el.style.cssText = 'position:fixed;z-index:1000;display:none;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 10px 25px rgba(15,23,42,.15);font-size:12px;';
  document.body.appendChild(el);
  el.addEventListener('click', _apDdClick);
  el.addEventListener('input', e => { if (e.target.id === 'ap-dd-cerca') _apDdFiltra(e.target.value); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { apDdChiudi(); return; }
    if (e.key === 'Enter' && e.target.id === 'ap-dd-cerca' && _apDd && !AP_DD_MULTI[_apDd.campo]) {
      const primo = el.querySelector('.ap-dd-item:not([style*="display: none"])');
      if (primo) primo.click();
    }
  });
  document.addEventListener('mousedown', e => {
    if (!_apDd) return;
    if (el.contains(e.target) || (_apDd.btn && _apDd.btn.contains(e.target))) return;
    apDdChiudi();
  });
  /* Resize (anche la tastiera che si apre su tablet) e scroll: il menu segue il suo
     bottone invece di chiudersi o restare sospeso nel punto di prima. */
  window.addEventListener('resize', () => { if (_apDd) _apDdPosiziona(); });
  window.addEventListener('scroll', () => { if (_apDd) _apDdPosiziona(); }, true);
  return el;
}

function apDdApri(btn) {
  const r = _apRigaDaEl(btn);
  if (!r) return;
  const campo = btn.dataset.dd;
  if (_apDd && _apDd.btn === btn) { apDdChiudi(); return; }
  if (_apDd) apDdChiudi();
  const el = _apDdEl();
  const multi = !!AP_DD_MULTI[campo];
  const selezionati = new Set(multi ? (r[campo] || []) : [r[campo]]);
  const opzioni = _apDdOpzioni(campo);
  /* Un valore già presente ma fuori catalogo (es. commessa importata con un nome non
     riconosciuto) resta visibile e selezionato, invece di sparire in silenzio. */
  selezionati.forEach(v => { if (v && !opzioni.includes(v)) opzioni.unshift(v); });

  let nota = '';
  if (campo === 'skills') {
    const sc = _apSkillCommessa(r.commessa);
    nota = sc.length ? 'Già preferite dalla commessa: ' + sc.join(', ') : 'La commessa non indica skill.';
  } else if (campo === 'preferiti') nota = 'Favoriti nella scelta (se liberi e idonei).';
  else if (campo === 'esclusi') nota = 'Mai assegnati a questo cantiere.';

  el.innerHTML =
    '<div style="padding:6px;border-bottom:1px solid #e2e8f0;">' +
      '<input id="ap-dd-cerca" type="text" autocomplete="off" placeholder="Cerca' + (campo === 'attivita' ? ' o scrivi una nuova attività' : '') + '…" ' +
      'style="width:100%;border:1px solid #cbd5e1;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;">' +
    '</div>' +
    (campo === 'attivita' ? '<div class="ap-dd-item ap-dd-nuova" data-nuova="1" style="display:none;padding:5px 8px;cursor:pointer;color:#0f766e;font-weight:600;border-bottom:1px solid #f1f5f9;"></div>' : '') +
    '<div id="ap-dd-lista" style="max-height:260px;overflow-y:auto;">' +
      (!multi && campo !== 'commessa' ? '<div class="ap-dd-item" data-val="" style="padding:5px 8px;cursor:pointer;color:#94a3b8;font-style:italic;">— nessuna —</div>' : '') +
      opzioni.map(v =>
        '<div class="ap-dd-item" data-val="' + _apE(v) + '" style="padding:5px 8px;cursor:pointer;display:flex;align-items:center;gap:6px;' + (!multi && selezionati.has(v) ? 'background:#f0fdfa;font-weight:600;' : '') + '">' +
          (multi ? '<input type="checkbox" tabindex="-1" style="pointer-events:none;"' + (selezionati.has(v) ? ' checked' : '') + '>' : '') +
          '<span>' + _apE(v) + '</span></div>').join('') +
      (opzioni.length ? '' : '<div style="padding:8px;color:#94a3b8;font-style:italic;">Nessuna voce</div>') +
    '</div>' +
    (nota ? '<div style="padding:5px 8px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;">' + _apE(nota) + '</div>' : '') +
    (multi ? '<div style="padding:5px 8px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">' +
      '<button type="button" data-azione="nessuno" style="font-size:11px;color:#64748b;text-decoration:underline;">Deseleziona tutto</button>' +
      '<button type="button" data-azione="chiudi" style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px;background:#0d9488;color:#fff;">Fatto</button></div>' : '');

  el.style.display = 'block';
  _apDd = { rigaId: r.id, campo, btn, modificato: false };
  _apDdPosiziona();
  const cerca = document.getElementById('ap-dd-cerca');
  if (cerca) cerca.focus();
}

/* Il menu si apre SEMPRE sotto il suo campo, come ci si aspetta da una tendina. Se sotto
   non c'è abbastanza spazio, prima si fa scorrere la pagina (una volta per apertura) e
   poi si accorcia la lista, che scorre al suo interno. Le misure usano l'area visibile
   (clientWidth/Height), non innerWidth, che include la barra di scorrimento: altrimenti il
   menu del campo più a destra finisce in parte fuori schermo. */
const AP_DD_LISTA_MIN = 100;
const AP_DD_LISTA_MAX = 260;

function _apDdPosiziona() {
  const el = document.getElementById('ap-dd');
  if (!el || !_apDd || !_apDd.btn || !_apDd.btn.isConnected) return;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const lista = document.getElementById('ap-dd-lista');
  const cornice = lista ? el.offsetHeight - lista.offsetHeight : 0; // ricerca + note + pulsanti
  let b = _apDd.btn.getBoundingClientRect();
  const serve = cornice + Math.min(AP_DD_LISTA_MAX, lista ? lista.scrollHeight : AP_DD_LISTA_MAX) + 12;
  if (!_apDd.scrollato && vh - b.bottom < serve) {
    _apDd.scrollato = true;
    const manca = Math.min(serve - (vh - b.bottom), Math.max(0, b.top - 80));
    /* Pagina troppo corta per scorrere (es. una sola riga e niente sotto): spazio
       temporaneo in fondo alla tab, tolto alla chiusura del menu. */
    const se = document.scrollingElement || document.documentElement;
    const scorribile = se.scrollHeight - vh - se.scrollTop;
    const root = document.getElementById('ap-root');
    if (root && scorribile < manca) root.style.paddingBottom = Math.ceil(manca - scorribile + 8) + 'px';
    window.scrollBy(0, manca);
    b = _apDd.btn.getBoundingClientRect();
  }
  const w = Math.min(Math.max(b.width, 240), vw - 16);
  el.style.width = w + 'px';
  el.style.left = Math.max(8, Math.min(b.left, vw - w - 8)) + 'px';
  el.style.top = (b.bottom + 4) + 'px';
  if (lista) {
    const spazio = vh - b.bottom - 4 - cornice - 8;
    lista.style.maxHeight = Math.max(AP_DD_LISTA_MIN, Math.min(AP_DD_LISTA_MAX, spazio)) + 'px';
  }
}

function _apDdFiltra(q) {
  const el = document.getElementById('ap-dd');
  if (!el) return;
  const n = _apNorm(q);
  let esatta = false;
  el.querySelectorAll('#ap-dd-lista .ap-dd-item').forEach(it => {
    const v = it.dataset.val || '';
    if (n && _apNorm(v) === n) esatta = true;
    it.style.display = !n || _apNorm(v).includes(n) ? '' : 'none';
  });
  const nuova = el.querySelector('.ap-dd-nuova');
  if (nuova) {
    const t = String(q || '').trim();
    nuova.style.display = t && !esatta ? '' : 'none';
    nuova.dataset.val = t;
    nuova.textContent = '＋ Aggiungi nuova attività «' + t + '»';
  }
  _apDdPosiziona(); // la lista filtrata cambia altezza: se il menu sta sopra il bottone va riallineato
}

function _apDdClick(e) {
  if (!_apDd) return;
  const r = _ap.righe.find(x => x.id === _apDd.rigaId);
  if (!r) { apDdChiudi(); return; }
  const campo = _apDd.campo;
  const azione = e.target.closest('[data-azione]');
  if (azione) {
    if (azione.dataset.azione === 'nessuno') {
      r[campo] = [];
      _apDd.modificato = true;
      document.querySelectorAll('#ap-dd-lista input[type=checkbox]').forEach(c => { c.checked = false; });
      _apDdAggiornaBottone(r, campo);
    } else apDdChiudi();
    return;
  }
  const it = e.target.closest('.ap-dd-item');
  if (!it) return;
  const val = it.dataset.val || '';
  if (AP_DD_MULTI[campo]) {
    const arr = (r[campo] || []).slice();
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    r[campo] = arr;
    /* Lo stesso operatore non può essere insieme preferito ed escluso */
    const altro = campo === 'preferiti' ? 'esclusi' : (campo === 'esclusi' ? 'preferiti' : null);
    if (altro && i < 0) r[altro] = (r[altro] || []).filter(n => n !== val);
    const cb = it.querySelector('input[type=checkbox]');
    if (cb) cb.checked = i < 0;
    _apDd.modificato = true;
    _apDdAggiornaBottone(r, campo);
    return;
  }
  if (it.dataset.nuova) _apAttivitaAggiungi(val);
  r[campo] = campo === 'commessa' ? _apCommessaCanonica(val) : val;
  _apDd.modificato = true;
  apDdChiudi();
}

function _apDdAggiornaBottone(r, campo) {
  if (!_apDd || !_apDd.btn) return;
  const lbl = _apDd.btn.querySelector('.ap-dd-lbl');
  if (lbl) lbl.innerHTML = _apDdEtichetta(r, campo);
}

function apDdChiudi() {
  const el = document.getElementById('ap-dd');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  const root = document.getElementById('ap-root');
  if (root) root.style.paddingBottom = '';
  const d = _apDd;
  _apDd = null;
  if (d && d.modificato) {
    _apInvalidaBozza();
    _apSalvaLocale();
    apRender();
  }
}

/* Testo mostrato nel bottone della cella */
function _apDdEtichetta(r, campo) {
  const vuoto = t => '<span style="color:#94a3b8;">' + t + '</span>';
  if (campo === 'commessa') return r.commessa ? _apE(r.commessa) : vuoto('Scegli…');
  if (campo === 'attivita') return r.attivita ? _apE(r.attivita) : vuoto('Scegli…');
  const arr = r[campo] || [];
  if (campo === 'skills') {
    const sc = _apSkillCommessa(r.commessa).filter(s => !arr.includes(s));
    if (!arr.length) return sc.length ? vuoto('commessa (' + sc.length + ')') : vuoto('—');
    return _apE(arr.join(', ')) + (sc.length ? ' <span style="color:#94a3b8;">+' + sc.length + '</span>' : '');
  }
  if (!arr.length) return vuoto('—');
  /* Solo il cognome (prima parola del nome esteso), per stare nella colonna */
  return _apE(arr.map(n => String(n).split(' ')[0]).join(', '));
}

function _apDdBottone(r, campo, titolo) {
  return '<button type="button" data-dd="' + campo + '" onclick="apDdApri(this)" title="' + _apE(titolo) + '" ' +
    'class="ap-cell w-full border border-slate-200 rounded px-1 py-0.5 text-xs text-left bg-white hover:bg-slate-50 flex items-center gap-1">' +
    '<span class="ap-dd-lbl truncate flex-1" style="min-width:0;">' + _apDdEtichetta(r, campo) + '</span>' +
    '<span class="text-slate-400" style="font-size:9px;">▾</span></button>';
}

/* ---------- tabella dei cantieri (una riga per cantiere, niente scroll orizzontale) ---------- */

function _apTabellaRigheHtml() {
  if (!_ap.righe.length) {
    return '<div class="text-xs text-slate-400 italic text-center py-8">Nessun cantiere: usa una delle fonti a sinistra.</div>';
  }
  const commesse = pwGetCommesseValide();
  const pool = new Set(_apOperatoriCatalogo());
  const esiti = _ap.bozza ? _ap.bozza.risultato.esiti : {};
  /* table-layout:fixed + larghezze in %: la tabella occupa sempre la larghezza del
     riquadro e ogni campo si stringe (testo troncato con il valore intero nel tooltip)
     invece di spingere fuori le ultime colonne. */
  const COLS = [
    ['', '2.5%'], ['Cantiere', '10.5%'], ['Commessa', '12.5%'], ['Attività', '12%'], ['Km', '5%'],
    ['Gg', '5.5%', 'Giorni-squadra: vuoto = stima dallo storico (mostrata in grigio)'], ['Op', '4%', 'Operatori per squadra'],
    ['P', '5%', 'Priorità'], ['Scadenza', '9%'], ['Dal', '9%', 'Non prima di'], ['Skill', '7%'], ['Preferiti', '6.5%'],
    ['Esclusi', '6.5%'], ['Esito', '3.5%'], ['', '1.5%']
  ];
  const inp = (campo, val, extra) => '<input data-campo="' + campo + '" onchange="apSetCampo(this)" value="' + _apE(val) + '"' +
    ' class="ap-cell w-full border border-slate-200 rounded px-1 py-0.5 text-xs"' + (extra || '') + '>';

  let html = '<div class="ap-tabella-wrap"><table class="ap-tabella text-xs" style="table-layout:fixed;width:100%;border-collapse:collapse;">' +
    '<colgroup>' + COLS.map(c => '<col style="width:' + c[1] + '">').join('') + '</colgroup>' +
    '<thead class="bg-slate-50"><tr>' + COLS.map(c =>
      '<th class="px-1 py-1 text-left font-semibold text-slate-600 truncate"' + (c[2] ? ' title="' + _apE(c[2]) + '"' : '') + '>' + c[0] + '</th>').join('') +
    '</tr></thead><tbody>';

  _ap.righe.forEach(r => {
    const stima = apStimaImpegno(r, _ap.modello);
    const ignoti = r.preferiti.concat(r.esclusi).filter(n => !pool.has(n));
    const commessaOk = !r.commessa || commesse.includes(r.commessa);
    const es = esiti[r.id];
    let esitoHtml;
    if (es) {
      const st = AP_STATO_STILE[es.stato];
      const tip = st.t + (es.giorniAssegnati ? ' ' + apFmtNum(es.giorniAssegnati) + '/' + apFmtNum(es.richiesti) + ' gg' : '') +
        ([].concat(es.motivi, es.avvisi).length ? ' — ' + [].concat(es.motivi, es.avvisi).join(' · ') : '');
      esitoHtml = '<span title="' + _apE(tip) + '" style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;background:' + st.bg + ';color:' + st.fg + ';font-weight:700;">' +
        st.icona + '</span>' + (es.avvisi.length ? '<span title="' + _apE(es.avvisi.join(' · ')) + '" style="font-size:10px;">⚠️</span>' : '');
    } else if (!_apRigaCompleta(r)) {
      esitoHtml = '<span title="Manca ' + (r.cantiere ? 'la commessa' : 'il cantiere') + '" class="text-rose-500">●</span>';
    } else {
      esitoHtml = '<span class="text-slate-300">—</span>';
    }
    const warn = 'border-color:#f59e0b;background:#fffbeb;';
    html += '<tr data-ap-id="' + _apE(r.id) + '" class="border-t border-slate-100' + (r.includi ? '' : ' opacity-50') + '">' +
      '<td class="px-1 py-1"><input type="checkbox" data-campo="includi" onchange="apSetCampo(this)"' + (r.includi ? ' checked' : '') + ' title="Includi nel calcolo e nell\'applicazione"></td>' +
      '<td class="px-1 py-1">' + inp('cantiere', r.cantiere, ' placeholder="Comune / sito" title="' + _apE(r.cantiere + (r.fonte ? ' · fonte: ' + r.fonte : '')) + '"') + '</td>' +
      '<td class="px-1 py-1"' + (commessaOk ? '' : ' title="Commessa non trovata fra quelle attive"') + '>' +
        _apDdBottone(r, 'commessa', r.commessa || 'Scegli la commessa').replace('class="ap-cell', commessaOk ? 'class="ap-cell' : 'style="' + warn + '" class="ap-cell') + '</td>' +
      '<td class="px-1 py-1">' + _apDdBottone(r, 'attivita', r.attivita || 'Scegli o aggiungi l\'attività') + '</td>' +
      '<td class="px-1 py-1">' + inp('km', r.km, ' inputmode="decimal"') + '</td>' +
      '<td class="px-1 py-1">' + inp('giorniManuali', r.giorniManuali, ' inputmode="decimal" placeholder="' + _apE(apFmtNum(stima.giorni)) + '" title="' + _apE(r.giorniManuali > 0 ? 'Inserito a mano (svuota per usare la stima)' : 'Stima: ' + stima.fonte) + '"') + '</td>' +
      '<td class="px-1 py-1">' + inp('nOp', r.nOp, ' inputmode="numeric" placeholder="' + _apE(stima.nOp) + '"') + '</td>' +
      '<td class="px-1 py-1"><select data-campo="priorita" onchange="apSetCampo(this)" class="ap-cell w-full border border-slate-200 rounded text-xs py-0.5">' +
        [1, 2, 3].map(p => '<option value="' + p + '"' + (r.priorita === p ? ' selected' : '') + '>P' + p + '</option>').join('') + '</select></td>' +
      '<td class="px-1 py-1"><input type="date" data-campo="scadenza" onchange="apSetCampo(this)" value="' + _apE(r.scadenza) + '" class="ap-cell w-full border border-slate-200 rounded px-0.5 py-0.5 text-xs"></td>' +
      '<td class="px-1 py-1"><input type="date" data-campo="dal" onchange="apSetCampo(this)" value="' + _apE(r.dal) + '" class="ap-cell w-full border border-slate-200 rounded px-0.5 py-0.5 text-xs"></td>' +
      '<td class="px-1 py-1">' + _apDdBottone(r, 'skills', 'Skill richieste: ' + (r.skills.concat(_apSkillCommessa(r.commessa).filter(s => !r.skills.includes(s))).join(', ') || 'nessuna')) + '</td>' +
      '<td class="px-1 py-1"' + (ignoti.length ? ' title="Non riconosciuti (ambigui o fuori organico), ignorati: ' + _apE(ignoti.join(', ')) + '"' : '') + '>' +
        _apDdBottone(r, 'preferiti', 'Preferiti: ' + (r.preferiti.join(', ') || 'nessuno')).replace('class="ap-cell', ignoti.some(n => r.preferiti.includes(n)) ? 'style="' + warn + '" class="ap-cell' : 'class="ap-cell') + '</td>' +
      '<td class="px-1 py-1">' +
        _apDdBottone(r, 'esclusi', 'Esclusi: ' + (r.esclusi.join(', ') || 'nessuno')).replace('class="ap-cell', ignoti.some(n => r.esclusi.includes(n)) ? 'style="' + warn + '" class="ap-cell' : 'class="ap-cell') + '</td>' +
      '<td class="px-0.5 py-1 text-center whitespace-nowrap">' + esitoHtml + '</td>' +
      '<td class="px-0 py-1 text-center"><button type="button" onclick="apRimuoviRiga(this)" title="Rimuovi" class="text-rose-500 hover:bg-rose-50 rounded px-0.5">✕</button></td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

/* Nome breve di una riga della bozza, per i messaggi: "P1 Ivrea" */
function _apNomeRiga(b, id) {
  const r = (b ? b.righeSolver : []).find(x => x.id === id) || _ap.righe.find(x => x.id === id);
  return r ? 'P' + (r.priorita || 3) + ' ' + r.cantiere : '?';
}

/* "Ivrea 0 → 3 gg, Chivasso 5 → 3 gg (oltre la scadenza)" */
function _apEffettiTesto(b, effetti) {
  return effetti.map(e => {
    let t = _apNomeRiga(b, e.rigaId).replace(/^P\d /, '') + ' ' + apFmtNum(e.prima) + ' → ' + apFmtNum(e.dopo) + ' gg';
    if (e.oltreScadenzaDopo && !e.oltreScadenzaPrima) t += ' (oltre la scadenza)';
    if (!e.oltreScadenzaDopo && e.oltreScadenzaPrima) t += ' (ora entro la scadenza)';
    return t;
  }).join(', ');
}

function _apMiglioramentiHtml(b) {
  const res = b.risultato;
  let html = '';
  if (res.miglioramenti.length) {
    html += '<div class="mb-3 rounded border border-teal-200 bg-teal-50 px-2 py-1.5 text-[11px] text-teal-900">' +
      '<div class="font-semibold mb-0.5">🔧 Migliorie trovate dal calcolo</div>' +
      res.miglioramenti.map(m => '<div>' + _apE(_apNomeRiga(b, m.rigaId)) + ' pianificato prima di ' + _apE(_apNomeRiga(b, m.primaDi)) +
        ': ' + _apE(_apEffettiTesto(b, m.effetti)) + '</div>').join('') +
      '</div>';
  }
  if (res.suggerimenti.length) {
    html += '<div class="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">' +
      '<div class="font-semibold mb-0.5">💡 Si può fare spazio, a un costo</div>' +
      res.suggerimenti.map((sg, i) => '<div class="flex items-center gap-2 py-0.5">' +
        '<div class="flex-1">' + _apE(_apNomeRiga(b, sg.rigaId)) + ' entra (+' + apFmtNum(sg.guadagno) + ' gg) se passa davanti a ' + _apE(_apNomeRiga(b, sg.primaDi)) +
        ': ' + _apE(_apEffettiTesto(b, sg.effetti)) + '</div>' +
        '<button type="button" data-sugg="' + i + '" onclick="apApplicaSuggerimento(this)" class="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 font-semibold whitespace-nowrap">Applica e ricalcola</button>' +
        '</div>').join('') +
      '</div>';
  }
  return html;
}

/* Precedenze scelte dai suggerimenti: restano (per settimana) finché non si tolgono */
function _apPrecedenzeHtml() {
  const ids = new Set(_ap.righe.map(r => r.id));
  const valide = _ap.precedenze.map((p, i) => ({ p, i })).filter(x => ids.has(x.p[0]) && ids.has(x.p[1]));
  if (!valide.length) return '';
  return '<div class="mt-2 flex flex-wrap items-center gap-1 text-[11px]"><span class="text-slate-500">Precedenze scelte:</span>' +
    valide.map(x => '<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5">' +
      _apE(_apNomeRiga(null, x.p[0])) + ' prima di ' + _apE(_apNomeRiga(null, x.p[1])) +
      '<button type="button" data-prec="' + x.i + '" onclick="apRimuoviPrecedenza(this)" title="Togli" class="text-slate-400 hover:text-rose-600">✕</button></span>').join('') +
    '</div>';
}

function _apBozzaHtml(puoAnnullare) {
  const annullaBtn = puoAnnullare
    ? '<button type="button" onclick="apAnnulla()" class="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">↶ Annulla ultima applicazione</button>'
    : '';
  const b = _ap.bozza;
  if (!b) {
    return annullaBtn ? '<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-end">' + annullaBtn + '</div>' : '';
  }
  const res = b.risultato;
  const righeById = {};
  b.righeSolver.forEach(r => { righeById[r.id] = r; });
  const incluse = new Set(_ap.righe.filter(r => r.includi).map(r => r.id));

  /* Anteprima: operatori coinvolti × giorni, celle esistenti in grigio e proposte tratteggiate */
  const perOp = {};
  res.assegnazioni.forEach(a => {
    if (!incluse.has(a.rigaId)) return;
    const r = righeById[a.rigaId];
    a.operatori.forEach(n => {
      if (!perOp[n]) perOp[n] = {};
      if (!perOp[n][a.giorno]) perOp[n][a.giorno] = [];
      perOp[n][a.giorno].push({ r, quota: a.quota, compagni: a.operatori.filter(x => x !== n) });
    });
  });
  const esistenti = {};
  pwGetWeekData().forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
    const n = (op.nome || '').trim();
    if (!n || !perOp[n]) return;
    for (let d = 0; d < 6; d++) {
      const cs = pwCellCantieri((op.giorni || {})[d]);
      if (cs.length) { if (!esistenti[n]) esistenti[n] = {}; esistenti[n][d] = cs; }
    }
  })));
  const giorni = b.ctxGiorni.slice();
  const nomi = Object.keys(perOp).sort();
  const mon = isoWeekToMonday(b.anno, b.week);
  const giornoLbl = d => { const x = new Date(mon); x.setUTCDate(mon.getUTCDate() + d); return PW_MAP_DAY_SHORT[d] + ' ' + formatDate(x); };

  let tab = '<div style="overflow-x:auto;"><table class="w-full text-[11px]"><thead class="bg-slate-50"><tr><th class="px-2 py-1 text-left">Operatore</th>' +
    giorni.map(d => '<th class="px-2 py-1 text-left whitespace-nowrap">' + _apE(giornoLbl(d)) + '</th>').join('') + '</tr></thead><tbody>';
  nomi.forEach(n => {
    tab += '<tr class="border-t border-slate-100"><td class="px-2 py-1 font-semibold whitespace-nowrap">' + _apE(n) +
      (res.operatoriSuPiuCommesse.includes(n) ? ' <span title="In Griglia comparirà su più commesse">⚠️</span>' : '') +
      ((b.dwDisponibili || []).includes(n) ? ' <span title="Doppia week: disponibilità data ma non ancora impiegato in Griglia, pianificabile anche il sabato" style="background:#f3e8ff;color:#7e22ce;font-size:9px;font-weight:700;padding:0 4px;border-radius:3px;">DW</span>' : '') + '</td>';
    giorni.forEach(d => {
      const ex = (esistenti[n] || {})[d] || [];
      const pr = (perOp[n] || {})[d] || [];
      tab += '<td class="px-1 py-1 align-top">' +
        ex.map(c => '<div style="background:#f1f5f9;color:#64748b;border-radius:3px;padding:1px 4px;margin-bottom:2px;">' + _apE(c) + '</div>').join('') +
        pr.map(p => '<div title="' + _apE(p.r.commessa + ' · ' + (p.r.attivita || '') + (p.compagni.length ? ' · con ' + p.compagni.join(', ') : '')) + '" style="border:1.5px dashed #0d9488;background:#f0fdfa;color:#0f766e;border-radius:3px;padding:1px 4px;margin-bottom:2px;font-weight:600;">' +
          _apE(p.r.cantiere) + (p.quota < 1 ? ' <span style="font-weight:400;">(½)</span>' : '') + ' <span style="font-weight:400;color:#64748b;">P' + p.r.priorita + '</span></div>').join('') +
        '</td>';
    });
    tab += '</tr>';
  });
  tab += '</tbody></table></div>';

  /* Elenco per cantiere: quando, con chi, perché */
  const es = res.esiti;
  const ordinate = b.righeSolver.slice().sort((x, y) => x.priorita - y.priorita);
  let lista = '<div class="space-y-1">';
  ordinate.forEach(r => {
    const e = es[r.id];
    const st = AP_STATO_STILE[e.stato];
    const ass = res.assegnazioni.filter(a => a.rigaId === r.id);
    const quando = ass.map(a => PW_MAP_DAY_SHORT[a.giorno] + (a.quota < 1 ? '½' : '') + ': ' + a.operatori.join(' + ')).join(' · ');
    lista += '<div class="text-[11px] border-l-4 pl-2 py-0.5" style="border-color:' + st.fg + ';' + (incluse.has(r.id) ? '' : 'opacity:.5;') + '">' +
      '<b>P' + r.priorita + ' · ' + _apE(r.cantiere) + '</b> <span class="text-slate-500">' + _apE(r.commessa) + (r.attivita ? ' · ' + _apE(r.attivita) : '') + '</span> ' +
      '<span style="color:' + st.fg + ';font-weight:700;">' + st.t + '</span>' +
      (e.kmMedi != null ? ' <span class="text-slate-500">· ~' + Math.round(e.kmMedi) + ' km di spostamento medio</span>' : '') +
      (quando ? '<div class="text-slate-700">' + _apE(quando) + '</div>' : '') +
      ([].concat(e.motivi, e.avvisi).length ? '<div class="text-amber-700">' + _apE([].concat(e.motivi, e.avvisi).join(' · ')) + '</div>' : '') +
      '<div class="text-slate-400">stima: ' + apFmtNum(r.giorni) + ' gg × ' + r.nOp + ' op — ' + _apE(r.stimaFonte) + '</div>' +
      '</div>';
  });
  lista += '</div>';

  const nCelle = res.assegnazioni.filter(a => incluse.has(a.rigaId)).reduce((n, a) => n + a.operatori.length, 0);
  return '<div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">' +
    '<div class="flex flex-wrap items-center gap-2 mb-3">' +
      '<div class="text-xs font-semibold text-slate-700 uppercase tracking-wide">📝 Bozza · ' + nCelle + ' celle proposte</div>' +
      '<div class="flex-1"></div>' + annullaBtn +
      '<button type="button" onclick="apApplica()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#15803d;"' + (nCelle ? '' : ' disabled') + '>✓ Applica alla Griglia</button>' +
    '</div>' +
    '<div class="text-[11px] text-slate-500 mb-2">Grigio = già in Griglia (non viene toccato) · tratteggiato = proposta. Togli la spunta a una riga della lista per escluderla dall\'applicazione.</div>' +
    '<div class="text-[11px] text-slate-500 mb-3">📏 ' + _apE(b.infoDistanze || '') + ' · 🌦️ ' + _apE(b.infoMeteo || '') + '</div>' +
    _apMiglioramentiHtml(b) +
    tab +
    '<div class="text-xs font-semibold text-slate-700 uppercase tracking-wide mt-4 mb-2">Per cantiere</div>' +
    lista +
  '</div>';
}
