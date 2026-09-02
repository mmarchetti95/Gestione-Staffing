/* ==================== PIANIFICA SPOSTAMENTI (OSRM) ==================== */
/* Tab "Pianifica spostamenti" della Pianificazione settimanale: data una lista di
   comuni/tappe e un comune di partenza, calcola l'ordine di visita più efficiente
   sugli spostamenti in auto.
   - Distanze e tempi REALI su strada dal servizio pubblico OSRM (/table per la
     matrice, /route per la geometria da disegnare sulla mappa).
   - Geocodifica: riusa geocodifica()/_geoCache della Mappa squadre (Nominatim),
     quindi i luoghi già cercati altrove non vengono ri-interrogati.
   - Persistenza: SOLO localStorage (per-browser, come tab attivo/settimana), più
     export Excel/PDF. Nessun dominio di sync Supabase coinvolto. */

const PW_SPOST_OSRM   = 'https://router.project-osrm.org';
const PW_SPOST_LS_KEY = 'pw_spost_v1';
const PW_SPOST_MAX    = 40;   // limite tappe: la demo OSRM regge matrici piccole

let _pwSpostMap = null;
let _pwSpostLayers = [];

/* Stato del pianificatore. Indice 0 delle matrici = partenza, 1..n = tappe. */
let _pwSpost = {
  partenza: null,   // { nome, lat, lng }
  tappe: [],        // [{ nome, lat, lng }]
  dist: null,       // matrice metri [n][n]
  dur: null,        // matrice secondi [n][n]
  order: [],        // indici 1..n nell'ordine di visita
  chiuso: false,
  strategia: 'lontano',
  nonTrovati: []
};

/* ---------- utility ---------- */
function _pwSpostStatus(msg, isError) {
  const el = document.getElementById('pw-spost-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'text-xs mt-2 ' + (isError ? 'text-rose-600 font-medium' : 'text-slate-500');
}

function _pwSpostKm(metri) {
  if (metri == null || isNaN(metri)) return '—';
  return (metri / 1000).toFixed(1).replace('.', ',') + ' km';
}

function _pwSpostDur(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

function _pwSpostSave() {
  try {
    localStorage.setItem(PW_SPOST_LS_KEY, JSON.stringify(_pwSpost));
  } catch (_) {}
}

function _pwSpostLoad() {
  try {
    const raw = localStorage.getItem(PW_SPOST_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && typeof o === 'object') {
      _pwSpost = Object.assign(_pwSpost, o);
      if (!Array.isArray(_pwSpost.tappe)) _pwSpost.tappe = [];
      if (!Array.isArray(_pwSpost.order)) _pwSpost.order = [];
      if (!Array.isArray(_pwSpost.nonTrovati)) _pwSpost.nonTrovati = [];
    }
  } catch (_) {}
}

/* ---------- OSRM ---------- */
function _pwSpostCoordString(punti) {
  return punti.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
}

/* Matrice distanze/tempi su strada fra tutti i punti */
async function _pwSpostOsrmTable(punti) {
  const url = PW_SPOST_OSRM + '/table/v1/driving/' + _pwSpostCoordString(punti) +
              '?annotations=duration,distance';
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.code !== 'Ok' || !data.distances || !data.durations) {
    throw new Error('OSRM: risposta non valida' + (data && data.message ? ' (' + data.message + ')' : ''));
  }
  return { dist: data.distances, dur: data.durations };
}

/* Geometria del percorso nell'ordine dato (per il tracciato sulla mappa) */
async function _pwSpostOsrmRoute(punti) {
  const url = PW_SPOST_OSRM + '/route/v1/driving/' + _pwSpostCoordString(punti) +
              '?overview=full&geometries=geojson';
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) return null;
  const coords = data.routes[0].geometry.coordinates || [];
  return coords.map(c => [c[1], c[0]]); // GeoJSON [lng,lat] -> Leaflet [lat,lng]
}

/* ---------- ottimizzazione ---------- */
/* Costo di un ordinamento: somma delle tratte partendo dall'indice 0.
   Se `chiuso`, aggiunge il rientro alla partenza. */
function _pwSpostCost(order, D, chiuso) {
  let tot = 0, prev = 0;
  for (let i = 0; i < order.length; i++) { tot += D[prev][order[i]]; prev = order[i]; }
  if (chiuso) tot += D[prev][0];
  return tot;
}

/* Nearest neighbour: catena sempre la tappa più vicina a quella corrente.
   `first`, se valorizzato, forza la prima tappa (usato dalle strategie "verso"). */
function _pwSpostNearest(D, n, first) {
  const rimasti = [];
  for (let i = 1; i < n; i++) rimasti.push(i);
  const order = [];
  let cur = 0;
  if (first != null) {
    order.push(first);
    rimasti.splice(rimasti.indexOf(first), 1);
    cur = first;
  }
  while (rimasti.length) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < rimasti.length; k++) {
      const d = D[cur][rimasti[k]];
      if (d < bd) { bd = d; best = k; }
    }
    cur = rimasti[best];
    order.push(cur);
    rimasti.splice(best, 1);
  }
  return order;
}

/* Raffinamento 2-opt: inverte segmenti finché il costo cala. Con `pinFirst`
   la prima tappa resta bloccata (serve a non perdere il "verso" scelto). */
function _pwSpost2opt(order, D, chiuso, pinFirst) {
  const start = pinFirst ? 1 : 0;
  let best = order.slice();
  let bestCost = _pwSpostCost(best, D, chiuso);
  let migliorato = true, guard = 0;
  while (migliorato && guard++ < 80) {
    migliorato = false;
    for (let i = start; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i)
          .concat(best.slice(i, k + 1).reverse())
          .concat(best.slice(k + 1));
        const c = _pwSpostCost(cand, D, chiuso);
        if (c < bestCost - 1) { best = cand; bestCost = c; migliorato = true; }
      }
    }
  }
  return best;
}

/* Costruisce l'ordine secondo la strategia scelta:
   - 'lontano' : prima tappa = la più distante dalla partenza, poi ci si avvicina
   - 'vicino'  : prima tappa = la più vicina alla partenza, poi ci si allontana
   - 'ottimale': nessun vincolo di verso, minimizza i km totali */
function _pwSpostBuildOrder(D, n, strategia, chiuso) {
  if (n <= 2) {
    const o = [];
    for (let i = 1; i < n; i++) o.push(i);
    return o;
  }
  let first = null;
  if (strategia === 'lontano' || strategia === 'vicino') {
    let bd = (strategia === 'lontano') ? -Infinity : Infinity;
    for (let i = 1; i < n; i++) {
      const d = D[0][i];
      if (strategia === 'lontano' ? d > bd : d < bd) { bd = d; first = i; }
    }
  }
  const nn = _pwSpostNearest(D, n, first);
  return _pwSpost2opt(nn, D, chiuso, first != null);
}

/* ---------- calcolo ---------- */
async function pwSpostCalcola() {
  const pEl = document.getElementById('pw-spost-partenza');
  const tEl = document.getElementById('pw-spost-tappe');
  const sEl = document.getElementById('pw-spost-strategia');
  const cEl = document.getElementById('pw-spost-chiuso');
  if (!pEl || !tEl) return;

  const partenzaNome = (pEl.value || '').trim();
  const righe = (tEl.value || '').split('\n').map(s => s.trim()).filter(s => s);
  const visti = {}, tappeNomi = [];
  righe.forEach(r => {
    const k = r.toLowerCase().replace(/\s+/g, ' ');
    if (!visti[k]) { visti[k] = 1; tappeNomi.push(r); }
  });

  if (!partenzaNome) { showAlertModal('Indica il comune di partenza.'); return; }
  if (tappeNomi.length < 2) { showAlertModal('Servono almeno 2 tappe da ordinare.'); return; }
  if (tappeNomi.length > PW_SPOST_MAX) {
    showAlertModal('Massimo ' + PW_SPOST_MAX + ' tappe per calcolo (limite del servizio di routing).');
    return;
  }

  const btn = document.getElementById('pw-spost-calcola');
  if (btn) { btn.disabled = true; btn.classList.add('opacity-50'); }

  try {
    _pwSpostStatus('Geocodifica partenza: ' + partenzaNome + '…');
    let gp = await geocodifica(partenzaNome);
    if (!gp) gp = await geocodifica(partenzaNome + ', Italia');
    if (!gp) {
      _pwSpostStatus('Comune di partenza non trovato: ' + partenzaNome, true);
      showAlertModal('Comune di partenza non trovato: ' + partenzaNome);
      return;
    }
    const punti = [{ nome: partenzaNome, lat: gp.lat, lng: gp.lng }];
    const nonTrovati = [];

    for (let i = 0; i < tappeNomi.length; i++) {
      _pwSpostStatus('Geocodifica tappa ' + (i + 1) + '/' + tappeNomi.length + ': ' + tappeNomi[i] + '…');
      let g = await geocodifica(tappeNomi[i]);
      if (!g) g = await geocodifica(tappeNomi[i] + ', Italia');
      if (g) punti.push({ nome: tappeNomi[i], lat: g.lat, lng: g.lng });
      else nonTrovati.push(tappeNomi[i]);
      await new Promise(r => setTimeout(r, 300)); // rate limit Nominatim
    }

    if (punti.length < 3) {
      _pwSpostStatus('Tappe geocodificate insufficienti (servono almeno 2 tappe valide).', true);
      showAlertModal('Non sono state trovate abbastanza tappe valide. Controlla i nomi dei comuni.');
      return;
    }

    _pwSpostStatus('Calcolo distanze stradali su ' + punti.length + ' punti…');
    const m = await _pwSpostOsrmTable(punti);

    const strategia = sEl ? sEl.value : 'lontano';
    const chiuso    = !!(cEl && cEl.checked);
    const order     = _pwSpostBuildOrder(m.dist, punti.length, strategia, chiuso);

    _pwSpost.partenza   = punti[0];
    _pwSpost.tappe      = punti.slice(1);
    _pwSpost.dist       = m.dist;
    _pwSpost.dur        = m.dur;
    _pwSpost.order      = order;
    _pwSpost.chiuso     = chiuso;
    _pwSpost.strategia  = strategia;
    _pwSpost.nonTrovati = nonTrovati;
    _pwSpostSave();

    _pwSpostStatus(nonTrovati.length
      ? 'Percorso calcolato. Non trovati: ' + nonTrovati.join(', ')
      : 'Percorso calcolato su ' + _pwSpost.tappe.length + ' tappe.', nonTrovati.length > 0);

    pwSpostRenderResult();
    pwSpostDrawMap();
  } catch (e) {
    _pwSpostStatus('Errore nel calcolo del percorso: ' + (e && e.message ? e.message : e) +
                   ' — il servizio di routing OSRM potrebbe non essere raggiungibile.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('opacity-50'); }
  }
}

/* ---------- tratte / totali ---------- */
/* Ritorna le tratte del percorso corrente: [{ da, a, idx, metri, sec, cumM, cumS }] */
function _pwSpostLegs() {
  const s = _pwSpost;
  const out = [];
  if (!s.dist || !s.order || !s.order.length) return out;
  const nome = i => (i === 0 ? (s.partenza ? s.partenza.nome : 'Partenza') : (s.tappe[i - 1] ? s.tappe[i - 1].nome : '?'));
  let prev = 0, cumM = 0, cumS = 0;
  s.order.forEach(i => {
    const metri = s.dist[prev][i], sec = s.dur[prev][i];
    cumM += metri; cumS += sec;
    out.push({ da: nome(prev), a: nome(i), idx: i, metri: metri, sec: sec, cumM: cumM, cumS: cumS, rientro: false });
    prev = i;
  });
  if (s.chiuso) {
    const metri = s.dist[prev][0], sec = s.dur[prev][0];
    cumM += metri; cumS += sec;
    out.push({ da: nome(prev), a: nome(0), idx: 0, metri: metri, sec: sec, cumM: cumM, cumS: cumS, rientro: true });
  }
  return out;
}

/* ---------- render ---------- */
function pwSpostRenderResult() {
  const box = document.getElementById('pw-spost-result');
  if (!box) return;
  const s = _pwSpost;
  const totEl = document.getElementById('pw-spost-totali');
  if (!s.partenza || !s.dist || !s.order || !s.order.length) {
    box.innerHTML = '<div class="bg-white border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">' +
      'Inserisci il comune di partenza e l&#39;elenco delle tappe, poi premi <b>Calcola percorso</b>.</div>';
    if (totEl) totEl.innerHTML = '';
    return;
  }

  const legs = _pwSpostLegs();
  const totM = legs.length ? legs[legs.length - 1].cumM : 0;
  const totS = legs.length ? legs[legs.length - 1].cumS : 0;

  const STRAT_LABEL = {
    lontano:  'Più lontano → rientro',
    vicino:   'Più vicino → allontanamento',
    ottimale: 'Percorso più breve',
    manuale:  'Ordine modificato a mano'
  };

  if (totEl) {
    totEl.innerHTML =
      '<span class="px-2 py-1 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">' +
        'Totale ' + _pwSpostKm(totM) + '</span>' +
      '<span class="px-2 py-1 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold">' +
        'Guida ' + _pwSpostDur(totS) + '</span>' +
      '<span class="px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-200">' +
        s.order.length + ' tappe · ' + esc(STRAT_LABEL[s.strategia] || s.strategia) +
        (s.chiuso ? ' · giro chiuso' : '') + '</span>';
  }

  let html = '<div class="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">' +
    '<table class="w-full text-sm">' +
    '<thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">' +
    '<tr>' +
      '<th class="px-2 py-2 text-left w-10">#</th>' +
      '<th class="px-2 py-2 text-left">Tappa</th>' +
      '<th class="px-2 py-2 text-right">Tratta</th>' +
      '<th class="px-2 py-2 text-right">Tempo</th>' +
      '<th class="px-2 py-2 text-right">Progressivi</th>' +
      '<th class="px-2 py-2 text-right no-print w-24">Ordine</th>' +
    '</tr></thead><tbody>';

  html += '<tr class="border-t border-slate-100 bg-emerald-50">' +
    '<td class="px-2 py-2 text-center">🏁</td>' +
    '<td class="px-2 py-2 font-semibold text-slate-700">' + esc(s.partenza.nome) +
      '<span class="text-xs text-slate-400 font-normal"> · partenza</span></td>' +
    '<td class="px-2 py-2 text-right text-slate-400">—</td>' +
    '<td class="px-2 py-2 text-right text-slate-400">—</td>' +
    '<td class="px-2 py-2 text-right text-slate-400">—</td>' +
    '<td class="px-2 py-2 no-print"></td></tr>';

  legs.forEach((leg, n) => {
    if (leg.rientro) {
      html += '<tr class="border-t border-slate-100 bg-emerald-50">' +
        '<td class="px-2 py-2 text-center">🏠</td>' +
        '<td class="px-2 py-2 font-semibold text-slate-700">' + esc(leg.a) +
          '<span class="text-xs text-slate-400 font-normal"> · rientro</span></td>' +
        '<td class="px-2 py-2 text-right">' + _pwSpostKm(leg.metri) + '</td>' +
        '<td class="px-2 py-2 text-right">' + _pwSpostDur(leg.sec) + '</td>' +
        '<td class="px-2 py-2 text-right text-slate-500">' + _pwSpostKm(leg.cumM) + ' · ' + _pwSpostDur(leg.cumS) + '</td>' +
        '<td class="px-2 py-2 no-print"></td></tr>';
      return;
    }
    html += '<tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onclick="pwSpostFocus(' + n + ')">' +
      '<td class="px-2 py-2 text-center font-bold text-teal-700">' + (n + 1) + '</td>' +
      '<td class="px-2 py-2 font-medium text-slate-700">' + esc(leg.a) +
        '<span class="text-xs text-slate-400 font-normal"> ← da ' + esc(leg.da) + '</span></td>' +
      '<td class="px-2 py-2 text-right">' + _pwSpostKm(leg.metri) + '</td>' +
      '<td class="px-2 py-2 text-right">' + _pwSpostDur(leg.sec) + '</td>' +
      '<td class="px-2 py-2 text-right text-slate-500">' + _pwSpostKm(leg.cumM) + ' · ' + _pwSpostDur(leg.cumS) + '</td>' +
      '<td class="px-2 py-2 text-right no-print whitespace-nowrap">' +
        '<button class="px-1 text-slate-400 hover:text-teal-600" title="Sposta su" onclick="event.stopPropagation();pwSpostMove(' + n + ',-1)">▲</button>' +
        '<button class="px-1 text-slate-400 hover:text-teal-600" title="Sposta giù" onclick="event.stopPropagation();pwSpostMove(' + n + ',1)">▼</button>' +
        '<button class="px-1 text-slate-400 hover:text-rose-600" title="Rimuovi tappa" onclick="event.stopPropagation();pwSpostRemove(' + n + ')">✕</button>' +
      '</td></tr>';
  });

  html += '</tbody></table></div>';

  if (s.nonTrovati && s.nonTrovati.length) {
    html += '<div class="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">' +
      '⚠ Non geocodificati (esclusi dal percorso): ' + esc(s.nonTrovati.join(', ')) + '</div>';
  }
  box.innerHTML = html;
}

/* Riordino manuale: le matrici restano valide, si ricalcolano solo le tratte */
function pwSpostMove(pos, delta) {
  const o = _pwSpost.order;
  const to = pos + delta;
  if (!o || pos < 0 || pos >= o.length || to < 0 || to >= o.length) return;
  const tmp = o[pos]; o[pos] = o[to]; o[to] = tmp;
  _pwSpost.strategia = 'manuale';
  _pwSpostSave();
  pwSpostRenderResult();
  pwSpostDrawMap();
}

function pwSpostRemove(pos) {
  const o = _pwSpost.order;
  if (!o || pos < 0 || pos >= o.length) return;
  o.splice(pos, 1);
  _pwSpostSave();
  pwSpostRenderResult();
  pwSpostDrawMap();
}

/* ---------- mappa ---------- */
function pwSpostFocus(pos) {
  const s = _pwSpost;
  if (!_pwSpostMap || !s.order || pos < 0 || pos >= s.order.length) return;
  const p = s.tappe[s.order[pos] - 1];
  if (p) _pwSpostMap.setView([p.lat, p.lng], 11);
}

function _pwSpostMarker(lat, lng, label, colore) {
  const icon = L.divIcon({
    className: '',
    html: '<div style="background:' + colore + ';color:#fff;border:2px solid #fff;border-radius:50%;' +
          'width:26px;height:26px;line-height:22px;text-align:center;font-size:12px;font-weight:700;' +
          'box-shadow:0 1px 4px rgba(0,0,0,.4)">' + label + '</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
  return L.marker([lat, lng], { icon: icon });
}

async function pwSpostDrawMap() {
  if (!_pwSpostMap) return;
  _pwSpostLayers.forEach(l => _pwSpostMap.removeLayer(l));
  _pwSpostLayers = [];

  const s = _pwSpost;
  if (!s.partenza || !s.order || !s.order.length) return;

  const seq = [s.partenza].concat(s.order.map(i => s.tappe[i - 1]).filter(Boolean));
  if (s.chiuso) seq.push(s.partenza);

  const bounds = [];
  const mk0 = _pwSpostMarker(s.partenza.lat, s.partenza.lng, '🏁', '#059669');
  mk0.bindPopup('<b>Partenza</b><br>' + esc(s.partenza.nome));
  mk0.addTo(_pwSpostMap);
  _pwSpostLayers.push(mk0);
  bounds.push([s.partenza.lat, s.partenza.lng]);

  const legs = _pwSpostLegs();
  s.order.forEach((idx, pos) => {
    const p = s.tappe[idx - 1];
    if (!p) return;
    const mk = _pwSpostMarker(p.lat, p.lng, String(pos + 1), '#0d9488');
    mk.bindPopup('<b>' + (pos + 1) + '. ' + esc(p.nome) + '</b><br>' +
                 'Tratta: ' + _pwSpostKm(legs[pos] ? legs[pos].metri : null) +
                 ' · ' + _pwSpostDur(legs[pos] ? legs[pos].sec : null));
    mk.addTo(_pwSpostMap);
    _pwSpostLayers.push(mk);
    bounds.push([p.lat, p.lng]);
  });

  // Tracciato provvisorio in linea d'aria, sostituito dal percorso stradale
  const dritta = L.polyline(seq.map(p => [p.lat, p.lng]),
    { color: '#94a3b8', weight: 2, dashArray: '4,6', opacity: 0.8 }).addTo(_pwSpostMap);
  _pwSpostLayers.push(dritta);

  if (bounds.length > 1) _pwSpostMap.fitBounds(bounds, { padding: [30, 30] });
  else _pwSpostMap.setView(bounds[0], 10);

  try {
    const geo = await _pwSpostOsrmRoute(seq);
    if (geo && geo.length && _pwSpostMap) {
      _pwSpostMap.removeLayer(dritta);
      _pwSpostLayers = _pwSpostLayers.filter(l => l !== dritta);
      const linea = L.polyline(geo, { color: '#0d9488', weight: 4, opacity: 0.85 }).addTo(_pwSpostMap);
      _pwSpostLayers.push(linea);
    }
  } catch (_) { /* resta la linea d'aria tratteggiata */ }
}

/* ---------- export ---------- */
function pwSpostExportXlsx() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non disponibile.'); return; }
  const legs = _pwSpostLegs();
  if (!legs.length) { showAlertModal('Nessun percorso da esportare.'); return; }
  const rows = [['#', 'Tappa', 'Da', 'Km tratta', 'Tempo tratta (min)', 'Km progressivi', 'Tempo progressivo (min)']];
  rows.push(['', _pwSpost.partenza.nome + ' (partenza)', '', '', '', '', '']);
  legs.forEach((leg, n) => {
    rows.push([
      leg.rientro ? '' : (n + 1),
      leg.a + (leg.rientro ? ' (rientro)' : ''),
      leg.da,
      Number((leg.metri / 1000).toFixed(1)),
      Math.round(leg.sec / 60),
      Number((leg.cumM / 1000).toFixed(1)),
      Math.round(leg.cumS / 60)
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Spostamenti');
  XLSX.writeFile(wb, 'spostamenti_' + String(_pwSpost.partenza.nome || 'percorso').replace(/[^\w]+/g, '_') + '.xlsx');
}

function pwSpostExportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showAlertModal('Libreria PDF non disponibile.'); return; }
  const legs = _pwSpostLegs();
  if (!legs.length) { showAlertModal('Nessun percorso da esportare.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const totM = legs[legs.length - 1].cumM, totS = legs[legs.length - 1].cumS;

  doc.setFontSize(14);
  doc.text('Pianificazione spostamenti', 14, 16);
  doc.setFontSize(10);
  doc.text('Partenza: ' + _pwSpost.partenza.nome + '   ·   Totale: ' +
           _pwSpostKm(totM) + '   ·   Guida: ' + _pwSpostDur(totS), 14, 23);

  const body = [['', _pwSpost.partenza.nome + ' (partenza)', '', '', '']];
  legs.forEach((leg, n) => {
    body.push([
      leg.rientro ? '' : String(n + 1),
      leg.a + (leg.rientro ? ' (rientro)' : ''),
      _pwSpostKm(leg.metri),
      _pwSpostDur(leg.sec),
      _pwSpostKm(leg.cumM) + ' · ' + _pwSpostDur(leg.cumS)
    ]);
  });

  doc.autoTable({
    startY: 28,
    head: [['#', 'Tappa', 'Tratta', 'Tempo', 'Progressivi']],
    body: body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136] },
    columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
  });
  doc.save('spostamenti_' + String(_pwSpost.partenza.nome || 'percorso').replace(/[^\w]+/g, '_') + '.pdf');
}

/* ---------- pulizia ---------- */
async function pwSpostClear() {
  const ok = await showConfirmAsync('Vuoi cancellare tappe e percorso calcolato?', 'Cancella');
  if (!ok) return;
  _pwSpost = { partenza: null, tappe: [], dist: null, dur: null, order: [],
               chiuso: false, strategia: 'lontano', nonTrovati: [] };
  _pwSpostSave();
  const pEl = document.getElementById('pw-spost-partenza');
  const tEl = document.getElementById('pw-spost-tappe');
  if (pEl) pEl.value = '';
  if (tEl) tEl.value = '';
  _pwSpostStatus('');
  pwSpostRenderResult();
  pwSpostDrawMap();
}

/* ---------- entry point del tab ---------- */
function pwSpostRender() {
  _pwSpostLoad();
  const pEl = document.getElementById('pw-spost-partenza');
  const tEl = document.getElementById('pw-spost-tappe');
  const sEl = document.getElementById('pw-spost-strategia');
  const cEl = document.getElementById('pw-spost-chiuso');
  if (pEl && !pEl.value && _pwSpost.partenza) pEl.value = _pwSpost.partenza.nome;
  if (tEl && !tEl.value && _pwSpost.tappe.length) {
    tEl.value = _pwSpost.tappe.map(t => t.nome).join('\n');
  }
  if (sEl && _pwSpost.strategia && _pwSpost.strategia !== 'manuale') sEl.value = _pwSpost.strategia;
  if (cEl) cEl.checked = !!_pwSpost.chiuso;

  setTimeout(() => {
    if (!_pwSpostMap) {
      _pwSpostMap = L.map('pw-spost-map', { preferCanvas: true }).setView([42.5, 12.5], 6);
      const _pwSpostMapStreet = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(_pwSpostMap);
      mapAddSatelliteToggle(_pwSpostMap, _pwSpostMapStreet);
    }
    _pwSpostMap.invalidateSize();
    pwSpostRenderResult();
    pwSpostDrawMap();
  }, 60);
}
