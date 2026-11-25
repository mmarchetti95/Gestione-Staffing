/* ==================== MAPPA: DISTANZE IN AUTO (Ctrl+clic sui pin) ====================
   Stima al volo di quanto sono distanti, su strada, i comuni della Mappa e quanto ci
   mette una squadra a spostarsi dall'uno all'altro. Prefisso mlPer*.
   - Ctrl+clic (Cmd+clic su Mac) su un pin, o su una riga dell'elenco laterale, aggiunge
     il comune in coda alla catena; un secondo Ctrl+clic lo toglie. Il clic normale resta
     il dettaglio del cantiere.
   - La catena è nell'ordine dei clic: tratta per tratta km e tempo di guida, più i
     progressivi. «⚡ Ordine più breve» riordina tenendo fermo il primo comune; «Ritorno
     al primo» chiude il giro.
   - Distanze e tempi dal servizio OSRM, con le stesse funzioni di «Pianifica spostamenti»
     (_pwSpostOsrmTable/_pwSpostOsrmRoute in weekly-spostamenti.js): la matrice si rilegge
     solo quando entra un comune nuovo, riordinare o togliere non fa chiamate per i km.
   - Coordinate da mlGeo() (rubrica condivisa, sentinella «non trovato» esclusa).
   - Solo memoria della sessione: non scrive nulla, né Supabase né Jira. «↗ Pianifica
     spostamenti» copia la catena in quel tab (localStorage pw_spost_v1, come lì). */

const ML_PER_MAX = 40;            // stesso limite di Pianifica spostamenti (demo OSRM)
const ML_PER_RITARDO_MS = 350;    // Ctrl+clic in rapida successione = una sola chiamata OSRM

let _mlPer = {
  tappe: [],        // [{ key, nome, lat, lng }] nell'ordine della catena
  mat: null,        // { keys: [], dist: [][] metri, dur: [][] secondi } — può contenere comuni già tolti
  chiuso: false,
  calcolo: false,
  errore: '',
  gen: 0,
  rotta: null,      // [[lat,lng]] del percorso stradale
  rottaSig: ''      // sequenza di chiavi a cui si riferisce `rotta`
};
let _mlPerLayer = null;
let _mlPerTimer = null;

/* ---------- ingresso dai pin e dall'elenco ---------- */
/* true = il clic era un Ctrl/Cmd+clic ed è stato gestito qui (niente dettaglio). */
function mlPerClic(ev, g) {
  if (!ev || !(ev.ctrlKey || ev.metaKey)) return false;
  if (ev.preventDefault) ev.preventDefault();
  if (g) mlPerToggle(g);
  return true;
}

function mlPerToggle(g) {
  const i = _mlPer.tappe.findIndex(t => t.key === g.key);
  if (i >= 0) {
    _mlPer.tappe.splice(i, 1);
  } else {
    const geo = mlGeo(g.key);
    if (!geo) {
      showAlertModal('«' + g.cantiere + '» non è localizzato sulla mappa: correggine la posizione prima di calcolare le distanze.');
      return;
    }
    if (_mlPer.tappe.length >= ML_PER_MAX) {
      showAlertModal('Massimo ' + ML_PER_MAX + ' comuni per catena (limite del servizio di routing).');
      return;
    }
    _mlPer.tappe.push({ key: g.key, nome: g.cantiere, lat: geo.lat, lng: geo.lng });
  }
  mlPerAggiorna();
}

/* Ridisegna subito (pannello, numeri sui pin, linea d'aria) e ricalcola poco dopo. */
function mlPerAggiorna() {
  _mlPerRender();
  _mlPerDisegna();
  clearTimeout(_mlPerTimer);
  _mlPerTimer = setTimeout(_mlPerCalcola, ML_PER_RITARDO_MS);
}

function mlPerSvuota() {
  clearTimeout(_mlPerTimer);
  _mlPer.tappe = [];
  _mlPer.errore = '';
  _mlPer.calcolo = false;
  _mlPer.gen++;
  _mlPerRender();
  _mlPerDisegna();
}

/* ---------- matrice ---------- */
function _mlPerIdx(key) {
  const m = _mlPer.mat;
  if (!m) return -1;
  return m.keys.indexOf(key);
}

/* Tratta fra due comuni: { m, s } (null se OSRM non conosce il collegamento). */
function _mlPerTratta(a, b) {
  const i = _mlPerIdx(a.key), j = _mlPerIdx(b.key);
  if (i < 0 || j < 0) return { m: null, s: null };
  const m = _mlPer.mat.dist[i] ? _mlPer.mat.dist[i][j] : null;
  const s = _mlPer.mat.dur[i] ? _mlPer.mat.dur[i][j] : null;
  return { m: (m == null || isNaN(m)) ? null : m, s: (s == null || isNaN(s)) ? null : s };
}

/* Sotto-matrice nell'ordine della catena (indice 0 = primo comune), null se incompleta. */
function _mlPerSotto(campo) {
  const t = _mlPer.tappe;
  if (!_mlPer.mat || t.some(p => _mlPerIdx(p.key) < 0)) return null;
  const M = _mlPer.mat[campo];
  return t.map(a => t.map(b => {
    const v = M[_mlPerIdx(a.key)][_mlPerIdx(b.key)];
    return v == null || isNaN(v) ? null : v;
  }));
}

function _mlPerSequenza() {
  const t = _mlPer.tappe;
  return (_mlPer.chiuso && t.length >= 2) ? t.concat([t[0]]) : t.slice();
}

/* Tratte della catena: [{ da, a, m, s, cumM, cumS, rientro }]; i progressivi
   diventano null dalla prima tratta sconosciuta in poi. */
function _mlPerTratte() {
  const seq = _mlPerSequenza();
  const out = [];
  let cumM = 0, cumS = 0;
  for (let i = 1; i < seq.length; i++) {
    const tr = _mlPerTratta(seq[i - 1], seq[i]);
    cumM = (cumM == null || tr.m == null) ? null : cumM + tr.m;
    cumS = (cumS == null || tr.s == null) ? null : cumS + tr.s;
    out.push({ da: seq[i - 1], a: seq[i], m: tr.m, s: tr.s, cumM, cumS, rientro: i === seq.length - 1 && _mlPer.chiuso });
  }
  return out;
}

/* ---------- calcolo OSRM ---------- */
async function _mlPerCalcola() {
  const gen = ++_mlPer.gen;
  const tappe = _mlPer.tappe.slice();
  if (tappe.length < 2) { _mlPer.calcolo = false; _mlPerRender(); _mlPerDisegna(); return; }

  if (tappe.some(t => _mlPerIdx(t.key) < 0)) {
    _mlPer.calcolo = true;
    _mlPerRender();
    try {
      const m = await _pwSpostOsrmTable(tappe);
      if (gen !== _mlPer.gen) return;
      _mlPer.mat = { keys: tappe.map(t => t.key), dist: m.dist, dur: m.dur };
      _mlPer.errore = '';
    } catch (e) {
      if (gen !== _mlPer.gen) return;
      _mlPer.calcolo = false;
      _mlPer.errore = 'Servizio di routing OSRM non raggiungibile (' + (e && e.message ? e.message : e) + ').';
      _mlPerRender();
      return;
    }
  }
  _mlPer.calcolo = false;
  _mlPerRender();

  const seq = _mlPerSequenza();
  const sig = seq.map(t => t.key).join('|');
  if (sig !== _mlPer.rottaSig) {
    try {
      const geo = await _pwSpostOsrmRoute(seq);
      if (gen !== _mlPer.gen) return;
      _mlPer.rotta = geo;
      _mlPer.rottaSig = geo ? sig : '';
    } catch (_) {
      if (gen !== _mlPer.gen) return;
      _mlPer.rotta = null;
      _mlPer.rottaSig = '';
    }
  }
  _mlPerDisegna();
}

/* ---------- azioni del pannello ---------- */
function mlPerSposta(pos, delta) {
  const t = _mlPer.tappe, to = pos + delta;
  if (pos < 0 || pos >= t.length || to < 0 || to >= t.length) return;
  const x = t[pos]; t[pos] = t[to]; t[to] = x;
  mlPerAggiorna();
}

function mlPerTogli(pos) {
  if (pos < 0 || pos >= _mlPer.tappe.length) return;
  _mlPer.tappe.splice(pos, 1);
  mlPerAggiorna();
}

/* Ordine più breve tenendo fermo il primo comune (stesso algoritmo di Pianifica
   spostamenti, strategia «Percorso più breve»). */
function mlPerOttimizza() {
  const t = _mlPer.tappe;
  if (t.length < 3) return;
  const D = _mlPerSotto('dist');
  if (!D) { showAlertModal('Attendi la fine del calcolo delle distanze.'); return; }
  const Dn = D.map(r => r.map(v => v == null ? 1e12 : v));
  const ordine = _pwSpostBuildOrder(Dn, t.length, 'ottimale', _mlPer.chiuso);
  _mlPer.tappe = [t[0]].concat(ordine.map(i => t[i]));
  mlPerAggiorna();
}

/* Copia la catena in «Pianifica spostamenti» (ordine attuale, «Ordine inserito») e ci va. */
function mlPerApriSpostamenti() {
  const t = _mlPer.tappe;
  if (t.length < 2) return;
  const D = _mlPerSotto('dist'), T = _mlPerSotto('dur');
  if (!D || !T) { showAlertModal('Attendi la fine del calcolo delle distanze.'); return; }
  const punto = p => {
    const g = mlGeo(p.key);
    return { nome: p.nome, lat: p.lat, lng: p.lng, label: g && g.label ? g.label : '' };
  };
  const ordine = [];
  for (let i = 1; i < t.length; i++) ordine.push(i);
  _pwSpost = {
    partenza: punto(t[0]),
    tappe: t.slice(1).map(punto),
    dist: D.map(r => r.map(v => v == null ? 0 : v)),
    dur: T.map(r => r.map(v => v == null ? 0 : v)),
    order: ordine,
    chiuso: _mlPer.chiuso,
    strategia: 'inserito',
    nonTrovati: []
  };
  _pwSpostSave();
  const pEl = document.getElementById('pw-spost-partenza');
  const tEl = document.getElementById('pw-spost-tappe');
  const sEl = document.getElementById('pw-spost-strategia');
  if (pEl) pEl.value = t[0].nome;
  if (tEl) tEl.value = t.slice(1).map(p => p.nome).join('\n');
  if (sEl) sEl.value = 'inserito';
  _pwActiveTab = 'spostamenti';
  switchScreen('weekly');
}

/* ---------- pannello ---------- */
function _mlPerBox() {
  let box = document.getElementById('ml-per');
  if (box) return box;
  const wrap = document.querySelector('#screen-mappa .ml-map-wrap');
  if (!wrap) return null;
  box = document.createElement('div');
  box.id = 'ml-per';
  box.className = 'ml-per hidden';
  wrap.appendChild(box);
  box.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ml-per]');
    if (!b) return;
    const az = b.getAttribute('data-ml-per');
    const pos = parseInt(b.getAttribute('data-pos'), 10);
    if (az === 'chiudi') mlPerSvuota();
    else if (az === 'su') mlPerSposta(pos, -1);
    else if (az === 'giu') mlPerSposta(pos, 1);
    else if (az === 'togli') mlPerTogli(pos);
    else if (az === 'ottimizza') mlPerOttimizza();
    else if (az === 'apri') mlPerApriSpostamenti();
    else if (az === 'vai') {
      const p = _mlPer.tappe[pos];
      if (p && _mlMap) _mlMap.setView([p.lat, p.lng], Math.max(_mlMap.getZoom(), 10));
    }
  });
  box.addEventListener('change', ev => {
    if (ev.target && ev.target.getAttribute('data-ml-per') === 'chiuso') {
      _mlPer.chiuso = !!ev.target.checked;
      mlPerAggiorna();
    }
  });
  return box;
}

function _mlPerRender() {
  const box = _mlPerBox();
  if (!box) return;
  const t = _mlPer.tappe;
  box.classList.toggle('hidden', !t.length);
  if (!t.length) { box.innerHTML = ''; return; }

  const tratte = _mlPerTratte();
  const ultima = tratte.length ? tratte[tratte.length - 1] : null;
  const km = v => (v == null ? '—' : _pwSpostKm(v));
  const dur = v => (v == null ? '—' : _pwSpostDur(v));
  const calcolo = _mlPer.calcolo;

  let html = '<div class="ml-per-head"><b>🚐 Distanze in auto</b>' +
    '<button data-ml-per="chiudi" title="Svuota la catena e chiudi">✕</button></div>';

  if (t.length >= 2) {
    html += '<div class="ml-per-tot">' +
      '<span class="ml-per-chip km">' + (calcolo ? '⏳' : km(ultima && ultima.cumM)) + '</span>' +
      '<span class="ml-per-chip t">🚗 ' + (calcolo ? '⏳' : dur(ultima && ultima.cumS)) + '</span>' +
      '<span class="ml-per-chip n">' + t.length + ' comuni' + (_mlPer.chiuso ? ' · giro chiuso' : '') + '</span></div>';
  }

  html += '<div class="ml-per-list"><table class="ml-per-tab"><thead><tr>' +
    '<th>#</th><th>Comune</th><th class="r">Tratta</th><th class="r">Progressivo</th><th></th></tr></thead><tbody>';
  t.forEach((p, i) => {
    const tr = i > 0 ? tratte[i - 1] : null;
    html += '<tr>' +
      '<td class="n">' + (i + 1) + '</td>' +
      '<td class="c"><button class="ml-per-nome" data-ml-per="vai" data-pos="' + i + '" title="Centra la mappa su questo comune">' + esc(p.nome) + '</button></td>' +
      '<td class="r">' + (tr ? (calcolo ? '⏳' : km(tr.m) + '<span>' + dur(tr.s) + '</span>') : '<span>partenza</span>') + '</td>' +
      '<td class="r">' + (tr ? (calcolo ? '' : km(tr.cumM) + '<span>' + dur(tr.cumS) + '</span>') : '') + '</td>' +
      '<td class="a">' +
        '<button data-ml-per="su" data-pos="' + i + '" title="Sposta prima"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button data-ml-per="giu" data-pos="' + i + '" title="Sposta dopo"' + (i === t.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '<button data-ml-per="togli" data-pos="' + i + '" title="Togli dalla catena">✕</button>' +
      '</td></tr>';
  });
  if (_mlPer.chiuso && ultima && ultima.rientro) {
    html += '<tr class="rientro"><td class="n">↩</td><td class="c">' + esc(t[0].nome) + ' <span>rientro</span></td>' +
      '<td class="r">' + (calcolo ? '⏳' : km(ultima.m) + '<span>' + dur(ultima.s) + '</span>') + '</td>' +
      '<td class="r">' + (calcolo ? '' : km(ultima.cumM) + '<span>' + dur(ultima.cumS) + '</span>') + '</td><td></td></tr>';
  }
  html += '</tbody></table></div>';

  if (_mlPer.errore) html += '<div class="ml-per-err">⚠ ' + esc(_mlPer.errore) + '</div>';

  if (t.length === 1) {
    html += '<div class="ml-per-hint">Ctrl+clic su un altro comune per vedere la distanza.</div>';
  } else {
    const puoSpost = typeof sbCanSeePage !== 'function' || sbCanSeePage('weekly:spostamenti');
    html += '<div class="ml-per-opz">' +
      '<label title="Aggiunge il ritorno dall\'ultimo comune al primo"><input type="checkbox" data-ml-per="chiuso"' + (_mlPer.chiuso ? ' checked' : '') + '> Ritorno al primo</label>' +
      (t.length >= 3 ? '<button data-ml-per="ottimizza" title="Riordina i comuni per fare meno km, tenendo fermo il primo">⚡ Ordine più breve</button>' : '') +
      (puoSpost ? '<button data-ml-per="apri" title="Copia la catena nel tab «Pianifica spostamenti» (export Excel/PDF, strategie di ordinamento)">↗ Pianifica spostamenti</button>' : '') +
      '</div>' +
      '<div class="ml-per-hint">Ctrl+clic su un pin per aggiungere o togliere un comune. Km e tempi di guida su strada (OSRM), indicativi.</div>';
  }
  box.innerHTML = html;
}

/* ---------- disegno sulla mappa ---------- */
/* Layer proprio, separato da _mlLayer: i render della Mappa (refresh Jira, Realtime,
   cambio giorno) non cancellano la catena. */
function _mlPerDisegna() {
  if (!_mlMap) return;
  if (!_mlPerLayer) _mlPerLayer = L.layerGroup().addTo(_mlMap);
  _mlPerLayer.clearLayers();
  const t = _mlPer.tappe;
  if (!t.length) return;

  if (t.length >= 2) {
    const seq = _mlPerSequenza();
    const sig = seq.map(p => p.key).join('|');
    if (_mlPer.rotta && _mlPer.rottaSig === sig) {
      L.polyline(_mlPer.rotta, { color: '#4f46e5', weight: 4, opacity: 0.85, interactive: false }).addTo(_mlPerLayer);
    } else {
      L.polyline(seq.map(p => [p.lat, p.lng]),
        { color: '#4f46e5', weight: 2, opacity: 0.8, dashArray: '4,6', interactive: false }).addTo(_mlPerLayer);
    }
  }
  t.forEach((p, i) => {
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: 'ml-per-badge-wrap',
        html: '<div class="ml-per-badge">' + (i + 1) + '</div>',
        iconSize: [20, 20],
        iconAnchor: [26, 26]
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000
    }).addTo(_mlPerLayer);
  });
}
