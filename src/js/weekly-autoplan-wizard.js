/* ==================== AUTO-PIANIFICA · INSERIMENTO GUIDATO (apw*) ==================== */
/* Colonna sinistra della tab Auto-pianifica e inserimento di un cantiere a domande e
   risposte: COMMESSA → ATTIVITÀ (dal catalogo della commessa) → CANTIERE (con geocoding)
   → GIORNI. È solo un altro adapter delle fonti: produce una riga con apNormRiga e la
   aggiunge alla lista locale (_ap.righe), come incolla/file/settimana precedente. Non
   tocca pwData; l'unica scrittura condivisa è la posizione scelta del cantiere in
   geo_cache (come la correzione dalla Mappa Squadre), e solo se l'utente ne sceglie una
   diversa da quella già nota.
   La casella di testo a sinistra manda la frase all'Assistente pianificazione
   (weekly-autoplan-chat.js), che ha già gli strumenti per aggiungere/modificare righe. */

const APW_PASSI = [
  { id: 'commessa', t: 'Commessa' },
  { id: 'attivita', t: 'Attività' },
  { id: 'cantiere', t: 'Cantiere' },
  { id: 'giorni', t: 'Giorni' }
];
const APW_NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=it&accept-language=it&q=';
const APW_COMUNI = ['city', 'town', 'village', 'municipality', 'hamlet', 'suburb', 'locality'];

let _apw = null;   // stato del modale aperto (null = chiuso)
let _apwCercaTimer = null;
let _apwCercaSeq = 0;

function _apwNuovoStato(base) {
  return Object.assign({
    passo: 0,
    commessa: '',
    attivita: '',
    cantiere: '',
    geo: null,          // { lat, lng, label } scelto o già noto
    geoScelto: false,   // true = scelto ora dall'elenco (da salvare in geo_cache se diverso)
    risultati: [],      // risultati Nominatim dell'ultima ricerca
    cercando: false,
    erroreCerca: '',
    giorni: '',
    nOp: null,          // null = quello del catalogo / 2
    filtro: '',
    aggiunti: 0
  }, base || {});
}

/* ---------- colonna sinistra ---------- */

function apwColonnaHtml() {
  return '<div class="xl:col-span-1 apw-col no-print">' +
    '<div class="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">🤖 Auto-pianifica</div>' +
    '<div class="text-[11px] text-slate-500 leading-snug mb-3">Inserisci i cantieri, poi calcola una bozza: la Griglia cambia solo quando premi <b>Applica</b>.</div>' +
    '<button type="button" onclick="apwApri()" class="apw-nuovo">＋ Nuovo cantiere</button>' +
    '<div class="apw-nl">' +
      '<label for="apw-nl-testo" class="block text-xs font-semibold text-slate-600 mb-1">✦ Dillo all\'assistente</label>' +
      '<textarea id="apw-nl-testo" data-help-key="apw-nl" rows="5" placeholder="Es: aggiungi Moena e Predazzo per SINFI, rilievo acquedotto, 3 giorni ciascuno. Rossi non deve andare a Moena." onkeydown="apwNlTasto(event)"></textarea>' +
      '<button type="button" onclick="apwInviaTesto()" class="apw-nl-invia">Invia all\'assistente ↑</button>' +
      '<div class="text-[10px] text-slate-400 mt-1">Invio per mandare · Maiusc+Invio per andare a capo</div>' +
    '</div>' +
  '</div>';
}

function apwNlTasto(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); apwInviaTesto(); }
}

/* La frase va all'Assistente pianificazione: si apre la chat (a destra) e il messaggio
   parte da lì, così risposta, modifiche e «annulla» stanno nello stesso posto. */
function apwInviaTesto() {
  const ta = document.getElementById('apw-nl-testo');
  const testo = ta ? ta.value.trim() : '';
  if (!testo) { if (ta) ta.focus(); return; }
  if (typeof apcInvia !== 'function') { showAlertModal('Assistente non disponibile.'); return; }
  if (ta) ta.value = '';
  if (!apcAperta()) apcToggle(true);
  apcInvia(testo);
}

/* ---------- menu «⋯ Altre fonti» ---------- */

function apwAltreFontiHtml() {
  return '<details class="apw-menu no-print" data-help-key="apw-altre-fonti">' +
    '<summary>⋯ Altre fonti</summary>' +
    '<div class="apw-menu-lista">' +
      '<button type="button" onclick="apwIncollaApri()">📋 Incolla da Excel / CSV</button>' +
      '<button type="button" onclick="apwMenuChiudi(); document.getElementById(\'ap-file\').click()" data-help-key="#ap-file">📂 Da file .xlsx / .csv</button>' +
      '<button type="button" onclick="apwMenuChiudi(); apDaSettimanaPrecedente()">↩ Cantieri della settimana precedente</button>' +
      '<button type="button" onclick="apwMenuChiudi(); apAggiungiRiga()">＋ Riga vuota in tabella</button>' +
      '<button type="button" onclick="apwMenuChiudi(); apScaricaModello()" class="apw-menu-sec">Scarica il modello Excel</button>' +
    '</div></details>';
}

function apwMenuChiudi() {
  document.querySelectorAll('details.apw-menu[open]').forEach(d => d.removeAttribute('open'));
}

document.addEventListener('click', e => {
  if (!e.target.closest || e.target.closest('details.apw-menu')) return;
  apwMenuChiudi();
});

/* ---------- modale (contenitore unico: inserimento guidato o incolla) ---------- */

function _apwModale() {
  let m = document.getElementById('apw-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'apw-modal';
    m.className = 'apw-bg no-print';
    m.addEventListener('mousedown', e => { if (e.target === m) apwChiudi(); });
    m.addEventListener('click', _apwClick);
    m.addEventListener('input', _apwInput);
    m.addEventListener('keydown', _apwTasto);
    document.body.appendChild(m);
  }
  return m;
}

function apwChiudi() {
  clearTimeout(_apwCercaTimer);
  _apwDistruggiMappa();
  const m = document.getElementById('apw-modal');
  if (m) { m.style.display = 'none'; m.innerHTML = ''; }
  const n = _apw ? _apw.aggiunti : 0;
  _apw = null;
  if (n) _apStatus(n === 1 ? '1 cantiere aggiunto.' : n + ' cantieri aggiunti.');
}

function apwIncollaApri() {
  apwMenuChiudi();
  const m = _apwModale();
  _apw = null;
  m.innerHTML = '<div class="apw-box" role="dialog" aria-label="Incolla da Excel">' +
    '<div class="apw-head"><div class="apw-titolo">📋 Incolla da Excel / CSV</div>' +
      '<button type="button" class="apw-x" data-apw="chiudi" title="Chiudi">✕</button></div>' +
    '<div class="apw-corpo">' +
      '<textarea id="ap-incolla" rows="9" placeholder="Cantiere&#9;Commessa&#9;Attività&#9;Km&#9;Giorni&#9;Operatori&#9;Priorità" class="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono"></textarea>' +
      '<div class="text-[11px] text-slate-500 mt-2 leading-snug">Celle copiate direttamente da Excel, oppure CSV con ; o ,. Colonne riconosciute: Cantiere, Commessa, Attività, Km, Giorni, Operatori, Priorità (P1/P2/P3), Scadenza, Dal, Skill, Preferiti, Esclusi, Note. Serve almeno il cantiere.</div>' +
    '</div>' +
    '<div class="apw-piede"><div class="flex-1"></div>' +
      '<button type="button" class="apw-btn" data-apw="chiudi">Annulla</button>' +
      '<button type="button" class="apw-btn apw-primario" data-apw="incolla" data-help-key="apImportaTesto">⬇ Importa righe</button>' +
    '</div></div>';
  m.style.display = 'flex';
  setTimeout(() => { const t = document.getElementById('ap-incolla'); if (t) t.focus(); }, 30);
}

function apwApri() {
  apwMenuChiudi();
  if (!_ap.anno) apInit();
  /* Ripropone commessa e attività dell'ultimo inserimento: di solito si caricano più
     comuni della stessa commessa uno dopo l'altro. */
  const ultima = _ap.righe.length ? _ap.righe[_ap.righe.length - 1] : null;
  _apw = _apwNuovoStato();
  if (ultima && ultima.fonte === 'guidato' && pwGetCommesseValide().includes(ultima.commessa)) {
    _apw.commessaSuggerita = ultima.commessa;
  }
  _apwModale().style.display = 'flex';
  _apwRender();
}

/* ---------- dati per i passi ---------- */

/* Commesse attive: prima quelle già in Griglia questa settimana o la precedente */
function _apwCommesse() {
  const tutte = pwGetCommesseValide().slice().sort((a, b) => a.localeCompare(b));
  const recenti = new Set();
  const prev = pwWeekAdd(_ap.anno, _ap.week, -1);
  [[_ap.anno, _ap.week], [prev.anno, prev.week]].forEach(([a, w]) =>
    (((pwData[a] || {})[w]) || []).forEach(bc => { if (bc && bc.commessa) recenti.add(bc.commessa); }));
  return tutte.map(c => ({ nome: c, recente: recenti.has(c) }))
    .sort((x, y) => (y.recente - x.recente) || x.nome.localeCompare(y.nome));
}

/* Attività proponibili per la commessa: il catalogo (solo voci produttive) se c'è,
   altrimenti i nomi usati in Griglia per quella commessa e poi tutti gli altri noti. */
function _apwAttivita(commessa) {
  if (caHaCatalogo(commessa)) {
    return {
      catalogo: true,
      voci: caCatalogo(commessa).filter(a => a.nome && a.produttiva !== false).map(a => ({
        nome: a.nome,
        nOp: caOperatoriSquadra(commessa, a.nome),
        info: a.kpi_target ? 'KPI ' + caFmtNum(a.kpi_target) + (a.unita ? ' ' + a.unita : '') + '/sq/gg' : ''
      }))
    };
  }
  const visti = new Set();
  const voci = [];
  caNomiUsatiInGriglia(commessa).forEach(x => {
    if (CA_ATTIVITA_SERVIZIO.some(s => caNorm(s) === caNorm(x.nome))) return;
    visti.add(caNorm(x.nome));
    voci.push({ nome: x.nome, nOp: null, info: 'usata ' + x.n + (x.n === 1 ? ' volta' : ' volte') });
  });
  _apAttivitaCatalogo().forEach(n => {
    if (visti.has(caNorm(n)) || CA_ATTIVITA_SERVIZIO.some(s => caNorm(s) === caNorm(n))) return;
    visti.add(caNorm(n));
    voci.push({ nome: n, nOp: null, info: '', altra: true });
  });
  return { catalogo: false, voci };
}

function _apwNOp() {
  if (_apw.nOp) return { n: _apw.nOp, fonte: 'scelto qui' };
  const c = caOperatoriSquadra(_apw.commessa, _apw.attivita);
  return c ? { n: c, fonte: 'dal catalogo attività' } : { n: 2, fonte: 'regola normale' };
}

/* ---------- render ---------- */

function _apwRender() {
  if (!_apw) return;
  const m = _apwModale();
  const passo = APW_PASSI[_apw.passo].id;
  const valori = { commessa: _apw.commessa, attivita: _apw.attivita, cantiere: _apw.cantiere, giorni: _apw.giorni ? apFmtNum(Number(_apw.giorni)) + ' gg' : '' };
  const stepper = APW_PASSI.map((p, i) => {
    const cls = i === _apw.passo ? ' on' : (i < _apw.passo ? ' fatto' : '');
    return '<button type="button" class="apw-step' + cls + '"' + (i < _apw.passo ? ' data-apw="vai" data-i="' + i + '"' : ' disabled') + ' data-help-key="apw-step">' +
      '<span class="apw-step-n">' + (i < _apw.passo ? '✓' : (i + 1)) + '</span>' +
      '<span class="apw-step-t">' + _apE(p.t) + (i < _apw.passo && valori[p.id] ? '<span class="apw-step-v">' + _apE(valori[p.id]) + '</span>' : '') + '</span></button>';
  }).join('');

  let corpo = '';
  if (passo === 'commessa') corpo = _apwCommessaHtml();
  else if (passo === 'attivita') corpo = _apwAttivitaHtml();
  else if (passo === 'cantiere') corpo = _apwCantiereHtml();
  else corpo = _apwGiorniHtml();

  let piede = '<div class="apw-piede">' +
    (_apw.passo > 0 ? '<button type="button" class="apw-btn" data-apw="indietro" data-help-key="apw-indietro">‹ Indietro</button>' : '') +
    (_apw.aggiunti ? '<span class="apw-contatore">✓ ' + _apw.aggiunti + (_apw.aggiunti === 1 ? ' aggiunto' : ' aggiunti') + '</span>' : '') +
    '<div class="flex-1"></div>';
  if (passo === 'cantiere') {
    piede += '<button type="button" class="apw-btn apw-primario" data-apw="avanti" data-help-key="apw-avanti"' + (_apw.cantiere.trim() ? '' : ' disabled') + '>Avanti ›</button>';
  } else if (passo === 'giorni') {
    const ok = Number(String(_apw.giorni).replace(',', '.')) > 0;
    piede += '<button type="button" class="apw-btn" data-apw="aggiungi-altro" data-help-key="apw-aggiungi-altro"' + (ok ? '' : ' disabled') + ' title="Invio">Aggiungi e inserisci un altro</button>' +
      '<button type="button" class="apw-btn apw-primario" data-apw="aggiungi" data-help-key="apw-aggiungi"' + (ok ? '' : ' disabled') + ' title="Ctrl+Invio">Aggiungi</button>';
  } else {
    piede += '<button type="button" class="apw-btn" data-apw="chiudi" data-help-key="apw-chiudi">' + (_apw.aggiunti ? 'Fine' : 'Annulla') + '</button>';
  }
  piede += '</div>';

  _apwDistruggiMappa();
  m.innerHTML = '<div class="apw-box" role="dialog" aria-label="Nuovo cantiere">' +
    '<div class="apw-head"><div class="apw-titolo">＋ Nuovo cantiere <span>· Settimana ' + _apE(_ap.week) + ' · ' + _apE(_ap.anno) + '</span></div>' +
      '<button type="button" class="apw-x" data-apw="chiudi" title="Chiudi">✕</button></div>' +
    '<div class="apw-steps">' + stepper + '</div>' +
    '<div class="apw-corpo">' + corpo + '</div>' +
    piede + '</div>';
  if (passo === 'cantiere') _apwMappa();
  setTimeout(() => {
    const f = m.querySelector('[data-apw-focus]');
    if (f) { f.focus(); if (f.select && f.tagName === 'INPUT' && f.type !== 'number') { const v = f.value; f.value = ''; f.value = v; } }
  }, 20);
}

function _apwFiltra(voci, campo) {
  const q = caNorm(_apw.filtro);
  return q ? voci.filter(v => caNorm(campo(v)).includes(q)) : voci;
}

function _apwCommessaHtml() {
  const voci = _apwFiltra(_apwCommesse(), v => v.nome);
  const sugg = _apw.commessaSuggerita;
  /* Invio sceglie la voce evidenziata: la prima filtrata, o l'ultima commessa usata */
  const iPrimo = !_apw.filtro && sugg && voci.some(v => v.nome === sugg) ? voci.findIndex(v => v.nome === sugg) : 0;
  return '<div class="apw-domanda">Per quale <b>commessa</b>?</div>' +
    '<input type="search" class="apw-input" data-apw-in="filtro" data-apw-focus placeholder="Cerca la commessa…" value="' + _apE(_apw.filtro) + '">' +
    '<div class="apw-lista">' +
    (voci.length ? voci.map((v, i) =>
      '<button type="button" class="apw-voce' + (i === iPrimo ? ' primo' : '') + '" data-apw="commessa" data-v="' + _apE(v.nome) + '" data-help-key="apw-scelta">' +
        '<span class="apw-voce-t">' + _apE(v.nome) + '</span>' +
        (v.nome === sugg ? '<span class="apw-tag">ultima usata</span>' : (v.recente ? '<span class="apw-tag">in Griglia</span>' : '')) +
        (caHaCatalogo(v.nome) ? '' : '<span class="apw-tag grigio" title="Senza catalogo attività: attività a testo libero, squadre da 2">senza catalogo</span>') +
      '</button>').join('')
      : '<div class="apw-vuoto">Nessuna commessa attiva con questo nome.</div>') +
    '</div>';
}

function _apwAttivitaHtml() {
  const att = _apwAttivita(_apw.commessa);
  const voci = _apwFiltra(att.voci, v => v.nome);
  const q = _apw.filtro.trim();
  const esatta = q && att.voci.some(v => caNorm(v.nome) === caNorm(q));
  let h = '<div class="apw-domanda">Quale <b>attività</b> su <b>' + _apE(_apw.commessa) + '</b>?</div>' +
    '<input type="search" class="apw-input" data-apw-in="filtro" data-apw-focus placeholder="' + (att.catalogo ? 'Cerca nel catalogo…' : 'Cerca o scrivi l\'attività…') + '" value="' + _apE(_apw.filtro) + '">';
  if (!att.catalogo) {
    h += '<div class="apw-nota">Questa commessa non ha il catalogo attività: le squadre sono da 2. Per dire, ad esempio, che PEDESTRIAN va fatto da 1 persona: Dashboard → Commesse attive → ✏️ → «🏷️ Attività e KPI», colonna «Op/sq».</div>';
  }
  h += '<div class="apw-lista">';
  if (!att.catalogo && q && !esatta) {
    h += '<button type="button" class="apw-voce primo" data-apw="attivita" data-v="' + _apE(q) + '" data-help-key="apw-scelta"><span class="apw-voce-t">Usa «' + _apE(q) + '»</span><span class="apw-tag">nuova</span></button>';
  }
  h += voci.map((v, i) =>
    '<button type="button" class="apw-voce' + (i === 0 && (att.catalogo || !q || esatta) ? ' primo' : '') + (v.altra ? ' altra' : '') + '" data-apw="attivita" data-v="' + _apE(v.nome) + '" data-help-key="apw-scelta">' +
      '<span class="apw-voce-t">' + _apE(v.nome) + '</span>' +
      (v.info ? '<span class="apw-voce-i">' + _apE(v.info) + '</span>' : '') +
      '<span class="apw-tag' + (v.nOp ? '' : ' grigio') + '" title="Persone per squadra">👥 ' + (v.nOp || 2) + '</span>' +
    '</button>').join('');
  if (!voci.length && (att.catalogo || !q)) {
    h += '<div class="apw-vuoto">' + (att.catalogo ? 'Nessuna attività del catalogo con questo nome.' : 'Scrivi il nome dell\'attività.') + '</div>';
  }
  return h + '</div>';
}

function _apwCantiereHtml() {
  const noto = _apw.cantiere.trim() ? meteoGeoFor(_apw.cantiere) : null;
  let h = '<div class="apw-domanda">In quale <b>cantiere</b> (comune o località)?</div>' +
    '<input type="text" class="apw-input" data-apw-in="cantiere" data-apw-focus placeholder="Es: Moena" value="' + _apE(_apw.cantiere) + '" autocomplete="off">';
  h += '<div class="apw-geo">';
  if (_apw.geo) {
    h += '<div class="apw-geo-ok">📍 ' + _apE(_apw.geo.label || '') + '</div>';
  } else if (_apw.cantiere.trim()) {
    h += '<div class="apw-geo-ko">Non ancora localizzato: scegli la località giusta fra i risultati.</div>';
  }
  if (_apw.cercando) h += '<div class="apw-geo-stato">Cerco…</div>';
  else if (_apw.erroreCerca) h += '<div class="apw-geo-ko">' + _apE(_apw.erroreCerca) + '</div>';
  const ris = _apw.risultati.filter(r => !_apw.geo || Math.abs(r.lat - _apw.geo.lat) > 1e-4 || Math.abs(r.lng - _apw.geo.lng) > 1e-4);
  if (ris.length) {
    h += '<div class="apw-lista apw-lista-geo">' + ris.map(r =>
      '<button type="button" class="apw-voce" data-apw="geo" data-lat="' + r.lat + '" data-lng="' + r.lng + '" data-nome="' + _apE(r.nome) + '" data-label="' + _apE(r.label) + '" data-help-key="apw-geo">' +
        '<span class="apw-voce-t">' + _apE(r.nome) + '</span><span class="apw-voce-i">' + _apE(r.dove) + '</span></button>').join('') + '</div>';
  }
  if (_apw.geoScelto && noto && _apw.geo && (Math.abs(noto.lat - _apw.geo.lat) > 1e-4 || Math.abs(noto.lng - _apw.geo.lng) > 1e-4)) {
    h += '<div class="apw-nota">La posizione di «' + _apE(_apw.cantiere.trim()) + '» era già nota in un altro punto: proseguendo viene corretta per tutti (come dalla Mappa Squadre).</div>';
  }
  h += '</div><div id="apw-mappa" class="apw-mappa"' + (_apw.geo ? '' : ' style="display:none;"') + '></div>';
  return h;
}

function _apwGiorniHtml() {
  const sq = _apwNOp();
  const doppione = _ap.righe.find(r => _apNorm(r.commessa) === _apNorm(_apw.commessa) &&
    _apNorm(r.cantiere) === _apNorm(_apw.cantiere) && _apNorm(r.attivita) === _apNorm(_apw.attivita));
  const giorni = String(_apw.giorni || '');
  return '<div class="apw-domanda">Quanti <b>giorni di lavoro</b> servono a <b>' + _apE(_apw.cantiere) + '</b>?</div>' +
    '<div class="apw-sotto">Giorni-squadra: una squadra da ' + sq.n + (sq.n === 1 ? ' persona' : ' persone') + ' per quanti giorni.</div>' +
    '<div class="apw-giorni">' +
      '<input type="text" inputmode="decimal" class="apw-input apw-input-gg" data-apw-in="giorni" data-apw-focus placeholder="es. 3" value="' + _apE(giorni) + '">' +
      [1, 2, 3, 4, 5].map(n => '<button type="button" class="apw-chip' + (giorni === String(n) ? ' on' : '') + '" data-apw="gg" data-v="' + n + '" data-help-key="apw-gg">' + n + '</button>').join('') +
    '</div>' +
    '<div class="apw-squadra">' +
      '<span>👥 Squadra da</span>' +
      '<button type="button" class="apw-chip" data-apw="nop" data-d="-1" data-help-key="apw-nop"' + (sq.n <= 1 ? ' disabled' : '') + '>−</button>' +
      '<b>' + sq.n + '</b>' +
      '<button type="button" class="apw-chip" data-apw="nop" data-d="1" data-help-key="apw-nop"' + (sq.n >= 6 ? ' disabled' : '') + '>＋</button>' +
      '<span class="apw-sotto">' + _apE(sq.fonte) + '</span>' +
    '</div>' +
    '<div class="apw-riepilogo">' + _apE(_apw.commessa) + ' · ' + _apE(_apw.attivita) + ' · ' + _apE(_apw.cantiere) +
      (_apw.geo ? ' · 📍' : ' · ⚠️ non localizzato') + '</div>' +
    (doppione ? '<div class="apw-nota">C\'è già una riga per questo cantiere con la stessa commessa e attività: aggiungendo ne fai una seconda.</div>' : '');
}

/* ---------- mini mappa ---------- */

let _apwMap = null;
function _apwDistruggiMappa() {
  if (_apwMap) { try { _apwMap.remove(); } catch (_) {} _apwMap = null; }
}

function _apwMappa() {
  if (!_apw || !_apw.geo || typeof L === 'undefined') return;
  const el = document.getElementById('apw-mappa');
  if (!el) return;
  _apwDistruggiMappa();
  _apwMap = L.map(el, { zoomControl: true, attributionControl: false }).setView([_apw.geo.lat, _apw.geo.lng], 11);
  const strada = mapStreetLayer();
  strada.addTo(_apwMap);
  if (typeof mapAddSatelliteToggle === 'function') mapAddSatelliteToggle(_apwMap, strada);
  L.marker([_apw.geo.lat, _apw.geo.lng]).addTo(_apwMap);
  setTimeout(() => { if (_apwMap) _apwMap.invalidateSize(); }, 50);
}

/* ---------- geocoding ---------- */

function _apwCercaPresto() {
  clearTimeout(_apwCercaTimer);
  const q = _apw.cantiere.trim();
  if (q.length < 3) { _apw.risultati = []; _apw.cercando = false; return; }
  /* Una richiesta ogni pausa di battitura (regole d'uso di Nominatim: max 1/s) */
  _apwCercaTimer = setTimeout(() => _apwCerca(q), 700);
}

async function _apwCerca(q) {
  if (!_apw) return;
  const seq = ++_apwCercaSeq;
  _apw.cercando = true;
  _apw.erroreCerca = '';
  _apwAggiornaGeo();
  let ris = [];
  try {
    const res = await fetch(APW_NOMINATIM + encodeURIComponent(q), { headers: { 'Accept-Language': 'it' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    ris = (Array.isArray(data) ? data : []).map(r => {
      const a = r.address || {};
      const nome = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || r.name || q;
      const dove = [a.county || a.province || '', a.state || ''].filter(Boolean).join(', ');
      return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), nome, dove: dove || r.display_name, label: r.display_name, comune: APW_COMUNI.indexOf(r.addresstype) >= 0 };
    }).filter(r => isFinite(r.lat) && isFinite(r.lng));
    ris.sort((x, y) => y.comune - x.comune);
  } catch (e) {
    if (seq === _apwCercaSeq && _apw) _apw.erroreCerca = 'Ricerca non riuscita (' + (e.message || e) + '): puoi proseguire, il calcolo riproverà col nome.';
  }
  if (seq !== _apwCercaSeq || !_apw) return;
  _apw.cercando = false;
  _apw.risultati = ris;
  /* Nessuna posizione ancora scelta e un solo comune col nome scritto: lo si propone già */
  if (!_apw.geo) {
    const esatti = ris.filter(r => r.comune && caNorm(r.nome) === caNorm(q));
    if (esatti.length === 1 && _apw.cantiere.trim() === q) {
      _apw.geo = { lat: esatti[0].lat, lng: esatti[0].lng, label: esatti[0].label };
      _apw.geoScelto = true;
      /* Scritto in minuscolo: si prende la grafia del comune */
      if (_apw.cantiere.trim() !== esatti[0].nome) {
        _apw.cantiere = esatti[0].nome;
        const inp = document.querySelector('[data-apw-in="cantiere"]');
        if (inp) inp.value = _apw.cantiere;
      }
    }
  }
  _apwAggiornaGeo();
}

/* Ridisegna solo il pezzo del geocoding, senza togliere il fuoco alla casella */
function _apwAggiornaGeo() {
  if (!_apw || APW_PASSI[_apw.passo].id !== 'cantiere') return;
  const m = document.getElementById('apw-modal');
  if (!m) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _apwCantiereHtml();
  const geo = m.querySelector('.apw-geo');
  const nuovo = tmp.querySelector('.apw-geo');
  if (geo && nuovo) geo.replaceWith(nuovo);
  const mappa = document.getElementById('apw-mappa');
  if (mappa) mappa.style.display = _apw.geo ? '' : 'none';
  const av = m.querySelector('[data-apw="avanti"]');
  if (av) av.disabled = !_apw.cantiere.trim();
  if (_apw.geo) {
    if (_apwMap) { _apwMap.setView([_apw.geo.lat, _apw.geo.lng], 11); _apwMap.eachLayer(l => { if (l instanceof L.Marker) l.setLatLng([_apw.geo.lat, _apw.geo.lng]); }); _apwMap.invalidateSize(); }
    else _apwMappa();
  }
}

/* Salva la posizione scelta nella rubrica condivisa (geo_cache), solo se è nuova o
   diversa da quella nota: il calcolo legge i cantieri da lì (meteoGeoFor). */
async function _apwSalvaGeo() {
  if (!_apw.geo || !_apw.geoScelto) return;
  const key = _apNorm(_apw.cantiere);
  const noto = meteoGeoFor(_apw.cantiere);
  if (noto && Math.abs(noto.lat - _apw.geo.lat) < 1e-4 && Math.abs(noto.lng - _apw.geo.lng) < 1e-4) return;
  _geoCache[key] = { lat: _apw.geo.lat, lng: _apw.geo.lng, label: _apw.geo.label };
  try { await _geoCacheSaveSingle(key, _geoCache[key]); } catch (_) {}
  try { await _geoCacheSave(); } catch (_) {}
}

/* ---------- eventi ---------- */

function _apwScegli(campo, valore) {
  _apw[campo] = valore;
  _apw.filtro = '';
  if (campo === 'commessa') { _apw.attivita = ''; _apw.nOp = null; }
  if (campo === 'attivita') _apw.nOp = null;
  _apw.passo++;
  if (APW_PASSI[_apw.passo].id === 'cantiere' && _apw.cantiere.trim() && !_apw.geo) {
    const noto = meteoGeoFor(_apw.cantiere);
    if (noto) { _apw.geo = noto; _apw.geoScelto = false; }
  }
  _apwRender();
}

async function _apwAggiungi(altro) {
  const gg = Number(String(_apw.giorni).replace(',', '.'));
  if (!(gg > 0)) return;
  await _apwSalvaGeo();
  const sq = _apwNOp();
  const r = apNormRiga({
    cantiere: _apw.cantiere.trim(),
    commessa: _apw.commessa,
    attivita: _apw.attivita,
    giorni: Math.round(gg * 2) / 2,
    /* Il numero di persone si scrive sulla riga solo se scelto qui a mano: altrimenti la
       riga segue il catalogo (anche se cambia dopo) */
    nOp: _apw.nOp || null
  }, 'guidato');
  _ap.righe.push(r);
  _apInvalidaBozza();
  _apSalvaLocale();
  _ap.toccate = new Set([r.id]);
  apRender();
  _apw.aggiunti++;
  if (!altro) { apwChiudi(); return; }
  /* Stessa commessa e attività, nuovo cantiere */
  const tieni = { commessa: _apw.commessa, attivita: _apw.attivita, nOp: sq.fonte === 'scelto qui' ? _apw.nOp : null, aggiunti: _apw.aggiunti };
  _apw = _apwNuovoStato(Object.assign(tieni, { passo: 2 }));
  _apwRender();
}

function _apwClick(e) {
  const b = e.target.closest('[data-apw]');
  if (!b || b.disabled) return;
  const az = b.dataset.apw;
  if (az === 'chiudi') { apwChiudi(); return; }
  if (az === 'incolla') {
    const prima = _ap.righe.length;
    apImportaTesto();
    if (_ap.righe.length > prima) apwChiudi();
    return;
  }
  if (!_apw) return;
  if (az === 'commessa') _apwScegli('commessa', b.dataset.v);
  else if (az === 'attivita') _apwScegli('attivita', b.dataset.v);
  else if (az === 'vai') { _apw.passo = parseInt(b.dataset.i, 10); _apw.filtro = ''; _apwRender(); }
  else if (az === 'indietro') { _apw.passo = Math.max(0, _apw.passo - 1); _apw.filtro = ''; _apwRender(); }
  else if (az === 'geo') {
    _apw.geo = { lat: parseFloat(b.dataset.lat), lng: parseFloat(b.dataset.lng), label: b.dataset.label };
    _apw.geoScelto = true;
    /* Scritto in minuscolo o abbreviato: si prende il nome del comune trovato */
    if (caNorm(_apw.cantiere) === caNorm(b.dataset.nome) || caNorm(b.dataset.nome).startsWith(caNorm(_apw.cantiere))) {
      _apw.cantiere = b.dataset.nome;
      const inp = document.querySelector('[data-apw-in="cantiere"]');
      if (inp) inp.value = _apw.cantiere;
    }
    _apwAggiornaGeo();
  }
  else if (az === 'avanti') {
    if (!_apw.cantiere.trim()) return;
    _apw.passo++;
    _apwRender();
  }
  else if (az === 'gg') { _apw.giorni = b.dataset.v; _apwRender(); }
  else if (az === 'nop') {
    const n = Math.min(6, Math.max(1, _apwNOp().n + parseInt(b.dataset.d, 10)));
    const cat = caOperatoriSquadra(_apw.commessa, _apw.attivita) || 2;
    _apw.nOp = n === cat ? null : n;
    _apwRender();
  }
  else if (az === 'aggiungi') _apwAggiungi(false);
  else if (az === 'aggiungi-altro') _apwAggiungi(true);
}

function _apwInput(e) {
  const t = e.target;
  if (!_apw || !t.dataset || !t.dataset.apwIn) return;
  const campo = t.dataset.apwIn;
  if (campo === 'filtro') {
    _apw.filtro = t.value;
    const passo = APW_PASSI[_apw.passo].id;
    const tmp = document.createElement('div');
    tmp.innerHTML = passo === 'commessa' ? _apwCommessaHtml() : _apwAttivitaHtml();
    const lista = document.querySelector('#apw-modal .apw-lista');
    const nuova = tmp.querySelector('.apw-lista');
    if (lista && nuova) lista.replaceWith(nuova);
  } else if (campo === 'cantiere') {
    _apw.cantiere = t.value;
    _apw.geo = null;
    _apw.geoScelto = false;
    _apw.risultati = [];
    const noto = t.value.trim() ? meteoGeoFor(t.value) : null;
    if (noto) _apw.geo = noto;
    _apwAggiornaGeo();
    _apwCercaPresto();
  } else if (campo === 'giorni') {
    _apw.giorni = t.value.trim();
    const ok = Number(_apw.giorni.replace(',', '.')) > 0;
    document.querySelectorAll('#apw-modal [data-apw="aggiungi"], #apw-modal [data-apw="aggiungi-altro"]').forEach(x => { x.disabled = !ok; });
    document.querySelectorAll('#apw-modal [data-apw="gg"]').forEach(x => x.classList.toggle('on', x.dataset.v === _apw.giorni));
  }
}

function _apwTasto(e) {
  if (e.key === 'Escape') { e.preventDefault(); apwChiudi(); return; }
  if (!_apw || e.key !== 'Enter' || e.isComposing) return;
  const passo = APW_PASSI[_apw.passo].id;
  if (e.target.tagName === 'BUTTON') return;   // Invio su un bottone = il suo clic
  e.preventDefault();
  if (passo === 'commessa' || passo === 'attivita') {
    const primo = document.querySelector('#apw-modal .apw-voce.primo') || document.querySelector('#apw-modal .apw-voce');
    if (primo) primo.click();
  } else if (passo === 'cantiere') {
    /* Invio: prende il primo risultato se non c'è ancora una posizione, poi avanti */
    if (!_apw.geo) {
      const primo = document.querySelector('#apw-modal [data-apw="geo"]');
      if (primo) { primo.click(); return; }
    }
    const av = document.querySelector('#apw-modal [data-apw="avanti"]');
    if (av && !av.disabled) av.click();
  } else if (passo === 'giorni') {
    const ok = Number(String(_apw.giorni).replace(',', '.')) > 0;
    if (ok) _apwAggiungi(!e.ctrlKey);   // Invio = aggiungi e un altro; Ctrl+Invio = aggiungi e chiudi
  }
}
