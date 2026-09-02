/* ==================== MAPPA LEAFLET + NOMINATIM ==================== */
const MAP_COLORS = ['#0d9488','#6366f1','#f59e0b','#ef4444','#10b981','#8b5cf6','#ec4899','#0ea5e9','#f97316','#84cc16'];
const MAP_COLOR_SCONOSCIUTA = '#94a3b8';
let _mapColors = {};
function _mapColor(commessa) {
  if (!_mapColors[commessa]) {
    _mapColors[commessa] = MAP_COLORS[Object.keys(_mapColors).length % MAP_COLORS.length];
  }
  return _mapColors[commessa];
}

/* Colore per regione (mappa Residenze operatori: raggruppa/colora per regione,
   non per commessa, dato che la commessa è già distinguibile sulla mappa Cantieri
   sopra). Le regioni ignote condividono un grigio neutro fisso, fuori dal ciclo. */
let _mapColorsRegione = {};
function _mapColorRegione(regione) {
  if (!regione) return MAP_COLOR_SCONOSCIUTA;
  if (!_mapColorsRegione[regione]) {
    _mapColorsRegione[regione] = MAP_COLORS[Object.keys(_mapColorsRegione).length % MAP_COLORS.length];
  }
  return _mapColorsRegione[regione];
}

/* Colore per strumento (mappa Cantieri in modalità Strumenti: raggruppa/colora
   per strumento invece che per commessa, per leggere a colpo d'occhio dove si
   trova un dato strumento). */
let _mapColorsStrumento = {};
function _mapColorStrumento(key) {
  if (!key) return MAP_COLOR_SCONOSCIUTA;
  if (!_mapColorsStrumento[key]) {
    _mapColorsStrumento[key] = MAP_COLORS[Object.keys(_mapColorsStrumento).length % MAP_COLORS.length];
  }
  return _mapColorsStrumento[key];
}

/* Rubrica luoghi persistente (sincronizzata su Supabase) */
let _geoCache = {};
async function _geoCacheLoad() {
  try {
    const { data, error } = await _sbClient.from('geo_cache').select('key, lat, lng, label');
    if (error) throw error;
    if (data) {
      _geoCache = {};
      data.forEach(row => {
        _geoCache[row.key] = { lat: row.lat, lng: row.lng, label: row.label };
      });
    }
  } catch(e) {
    console.warn('Errore caricamento geo_cache da Supabase:', e);
  }
}
async function _geoCacheSaveSingle(key, value) {
  try {
    if (value === null) {
      await _sbClient.from('geo_cache').upsert({ key, lat: 0, lng: 0, label: '[non trovato]' }, { onConflict: 'key' });
    } else {
      await _sbClient.from('geo_cache').upsert({ key, lat: value.lat, lng: value.lng, label: value.label }, { onConflict: 'key' });
    }
  } catch(e) {
    console.warn('Errore salvataggio geo_cache su Supabase:', e);
  }
}
async function _geoCacheSave() {
  try { await sset('geo_cache_v1', _geoCache); } catch(e) {}
}

/* Geocodifica singolo nome via Nominatim */
async function geocodifica(nome) {
  const key = nome.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!key) return null;
  if (key in _geoCache) return _geoCache[key]; // null = non trovato
  const statusEl = document.getElementById('pw-map-geocoding-status');
  if (statusEl) statusEl.textContent = 'Ricerca: ' + nome + '…';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(nome);
    const res = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'StaffingDashboard/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const val = (data && data.length > 0) ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name } : null;
    _geoCache[key] = val;
    await _geoCacheSaveSingle(key, val);
    if (statusEl) statusEl.textContent = '';
    return val;
  } catch(e) {
    if (statusEl) statusEl.textContent = '';
    return null;
  }
}

/* Istanza Leaflet cantieri */
let _map = null;
let _mapMarkers = [];
let _mapDay = 0;
let _mapCollapsedCommesse = new Set();

/* Modalità mappa Cantieri: 'operatori' (default) oppure 'strumenti' (pannello
   destro e colore marker riorganizzati per evidenziare dove si trova ogni
   strumento). */
let _mapCantieriMode = 'operatori';
/* Filtro multi-strumento (checkbox), attivo solo in modalità 'strumenti'.
   Set vuoto = nessun filtro (mostra tutti gli strumenti assegnati). */
let _mapStrumentiFilter = new Set();

/* Istanza Leaflet residenze operatori */
let _mapOp = null;
let _mapOpMarkers = [];
let _mapCollapsedRegioniOp = new Set();

/* Filtro regione, condiviso dalle due mappe */
let _mapRegioneFilter = '';

function pwMapInit() {
  if (!_map) {
    _map = L.map('pw-map', { preferCanvas: true }).setView([42.5, 12.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(_map);
    setTimeout(() => _map.invalidateSize(), 200);
  }
  if (!_mapOp) {
    _mapOp = L.map('pw-map-op', { preferCanvas: true }).setView([42.5, 12.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(_mapOp);
    setTimeout(() => _mapOp.invalidateSize(), 200);
  }
  pwMapRender(_mapDay);
}

/* Popola (una tantum) la select del filtro regione, condivisa dalle due mappe */
function pwMapPopulateRegioneFilter() {
  const sel = document.getElementById('pw-map-regione-filter');
  if (!sel) return;
  if (sel.options.length <= 1) {
    sel.innerHTML = '<option value="">Tutte le regioni</option>' +
      REGIONI_ITALIA.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    sel.onchange = () => { _mapRegioneFilter = sel.value; pwMapRender(_mapDay); };
  }
  sel.value = _mapRegioneFilter;
}

/* Bottone + pannello a checkbox per il filtro multi-strumento della mappa
   Cantieri, visibile (in modalità Strumenti) accanto allo switch Operatori/
   Strumenti. Il bottone resta nel DOM anche in modalità Operatori (solo
   visibility:hidden, non display:none) così lo spazio riservato non cambia
   e il layout non "salta" passando da una modalità all'altra. */
function pwMapRenderStrumentoFilterButton() {
  const btn = document.getElementById('pw-map-strumento-filter-btn');
  if (!btn) return;
  const show = _mapCantieriMode === 'strumenti';
  btn.style.visibility = show ? 'visible' : 'hidden';
  btn.onclick = () => pwMapStrFilterOpen(btn);
  pwMapStrFilterUpdateBtnLabel();
  const panel = document.getElementById('pw-map-str-filter-panel');
  if (panel && panel.style.display !== 'none') pwMapStrFilterRenderList();
}

function pwMapStrFilterUpdateBtnLabel() {
  const btn = document.getElementById('pw-map-strumento-filter-btn');
  if (!btn) return;
  const n = _mapStrumentiFilter.size;
  btn.textContent = n ? `🔧 Strumenti: ${n} selezionat${n === 1 ? 'o' : 'i'}` : '🔧 Strumenti: tutti';
  btn.classList.toggle('active', n > 0);
}

function pwMapStrFilterEnsurePanel() {
  let p = document.getElementById('pw-map-str-filter-panel');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'pw-map-str-filter-panel';
  p.className = 'pw-str-panel';
  p.style.cssText = 'position:fixed;z-index:9999;width:260px;display:none;overflow:hidden;';
  p.innerHTML = `
    <div style="padding:6px 8px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;font-weight:700;color:#334155;">Filtra per strumento</span>
      <button type="button" id="pw-map-str-filter-clear" style="font-size:10px;color:#0d9488;font-weight:600;background:none;border:none;cursor:pointer;padding:0;">Nessun filtro</button>
    </div>
    <div id="pw-map-str-filter-list" style="max-height:240px;overflow-y:auto;"></div>`;
  document.body.appendChild(p);
  p.querySelector('#pw-map-str-filter-clear').onclick = () => {
    _mapStrumentiFilter.clear();
    pwMapStrFilterRenderList();
    pwMapRenderCantieri(pwMapBuildSquadItems(_mapDay), _mapDay);
  };
  document.addEventListener('mousedown', e => {
    const pan = document.getElementById('pw-map-str-filter-panel');
    if (pan && pan.style.display !== 'none' && !pan.contains(e.target) && e.target.id !== 'pw-map-strumento-filter-btn') pwMapStrFilterClose();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pwMapStrFilterClose(); });
  return p;
}
function pwMapStrFilterClose() {
  const p = document.getElementById('pw-map-str-filter-panel');
  if (p) p.style.display = 'none';
}
function pwMapStrFilterOpen(btn) {
  const p = pwMapStrFilterEnsurePanel();
  const r = btn.getBoundingClientRect();
  p.style.display = 'block';
  p.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 270)) + 'px';
  p.style.top = (r.bottom + 2) + 'px';
  pwMapStrFilterRenderList();
}
function pwMapStrFilterRenderList() {
  const list = document.getElementById('pw-map-str-filter-list');
  if (!list) return;
  const counts = pwStrumentoCounts();
  const keys = Object.keys(counts).sort((a, b) => pwStrLabel(a).localeCompare(pwStrLabel(b)));
  if (!keys.length) {
    list.innerHTML = '<div style="padding:8px;font-size:11px;color:#94a3b8;">Nessuno strumento assegnato questa settimana.</div>';
  } else {
    list.innerHTML = keys.map(k => `
      <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:12px;cursor:pointer;">
        <input type="checkbox" data-key="${esc(k)}" ${_mapStrumentiFilter.has(k) ? 'checked' : ''}>
        <span>${esc(pwStrLabel(k))} <span style="color:#94a3b8;">(${counts[k]})</span></span>
      </label>`).join('');
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) _mapStrumentiFilter.add(cb.dataset.key); else _mapStrumentiFilter.delete(cb.dataset.key);
        pwMapStrFilterUpdateBtnLabel();
        pwMapRenderCantieri(pwMapBuildSquadItems(_mapDay), _mapDay);
      };
    });
  }
  pwMapStrFilterUpdateBtnLabel();
}

/* Sottoinsieme di strumenti di un item da mostrare (marker, popup, legenda,
   riepilogo) in modalità Strumenti: se un filtro è attivo, solo gli strumenti
   selezionati; altrimenti tutti quelli della squadra. In modalità Operatori
   ritorna sempre l'elenco completo (il filtro non si applica lì). */
function pwMapDisplayStrumenti(item) {
  if (_mapCantieriMode !== 'strumenti') return item.strumenti;
  return _mapStrumentiFilter.size ? item.strumenti.filter(k => _mapStrumentiFilter.has(k)) : item.strumenti;
}

/* Regione "di lavorazione" di una commessa, con lo stesso fallback provincia→regione
   usato per gli operatori (operatoreRegione) */
function commessaRegione(nomeCommessa) {
  const meta = state.commesse_attive_meta[nomeCommessa];
  if (!meta) return '';
  return meta.regione || (meta.provincia && provinciaInfo(meta.provincia)?.regione) || '';
}

/* Etichette brevi dei giorni, usate sia dai bottoni vista sia dai chip giorno
   della vista "Tutta la settimana". */
const PW_MAP_DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

/* dayIdx === PW_MAP_WEEK indica la vista aggregata sull'intera settimana
   (nessun giorno selezionato) invece del singolo giorno 0..5. */
const PW_MAP_WEEK = -1;

/* Chip "Lun Mar Gio…" con i giorni in cui la squadra/operatore è su quel cantiere.
   Reso solo in vista settimana: nella vista giorno l'informazione è implicita. */
function pwMapGiorniChips(giorni) {
  if (!giorni || !giorni.length) return '';
  return '<div class="sq-days">' +
    giorni.map(d => '<span class="sq-day-chip">' + PW_MAP_DAY_SHORT[d] + '</span>').join('') +
    '</div>';
}

/* Costruisce la lista delle squadre attive per il giorno indicato, con relativo
   cantiere/attività/colore. Condivisa dalla mappa Cantieri e dalla mappa Residenze.
   Con dayIdx === PW_MAP_WEEK aggrega l'intera settimana. */
function pwMapBuildSquadItems(dayIdx) {
  if (dayIdx === PW_MAP_WEEK) return pwMapBuildSquadItemsWeek();
  const data = pwGetWeekData();
  const items = []; // { commessa, squadra, operatori, cantiere, attivita, cantierePrev, color }

  data.forEach(bc => {
    if (!bc.commessa) return;
    const color = _mapColor(bc.commessa);
    (bc.squadre || []).forEach(sq => {
      const ops = (sq.operatori || []).filter(o => o.nome && o.nome.trim());
      const strumenti = pwSqStrumentiJira(sq).filter(k => k);
      const cantieriOggi = new Set();
      const attvOggi = new Set();
      ops.forEach(op => {
        const g = (op.giorni || {})[dayIdx] || {};
        pwCellCantieri(g).forEach(c => cantieriOggi.add(c));
        if (g.attivita && g.attivita.trim()) attvOggi.add(g.attivita.trim());
      });
      if (!cantieriOggi.size) return;

      const cantieriPrec = new Set();
      if (dayIdx > 0) {
        ops.forEach(op => {
          const g = (op.giorni || {})[dayIdx - 1] || {};
          pwCellCantieri(g).forEach(c => cantieriPrec.add(c));
        });
      }

      [...cantieriOggi].forEach(cantiere => {
        items.push({
          commessa: bc.commessa, squadra: sq.nome || 'Squadra',
          operatori: ops.map(o => o.nome),
          cantiere,
          attivita: [...attvOggi].join(', '),
          cantierePrev: cantieriPrec.size ? [...cantieriPrec].join('/') : null,
          color, strumenti
        });
      });
    });
  });

  return items;
}

/* Variante "Tutta la settimana": stessa forma di item di pwMapBuildSquadItems(),
   ma una sola voce per (commessa, squadra, cantiere) con l'elenco dei giorni in
   `giorni`. Lo spostamento giorno-precedente (`cantierePrev`) non ha senso qui:
   la sequenza dei cantieri della squadra si legge dai chip dei giorni. */
function pwMapBuildSquadItemsWeek() {
  const data = pwGetWeekData();
  const order = [];
  const byKey = {};

  data.forEach(bc => {
    if (!bc.commessa) return;
    const color = _mapColor(bc.commessa);
    (bc.squadre || []).forEach(sq => {
      const ops = (sq.operatori || []).filter(o => o.nome && o.nome.trim());
      const squadra = sq.nome || 'Squadra';
      const strumenti = pwSqStrumentiJira(sq).filter(k => k);

      for (let d = 0; d < 6; d++) {
        const cantieriGiorno = new Set();
        const attvGiorno = new Set();
        ops.forEach(op => {
          const g = (op.giorni || {})[d] || {};
          pwCellCantieri(g).forEach(c => cantieriGiorno.add(c));
          if (g.attivita && g.attivita.trim()) attvGiorno.add(g.attivita.trim());
        });
        if (!cantieriGiorno.size) continue;

        cantieriGiorno.forEach(cantiere => {
          const key = bc.commessa + ' ' + squadra + ' ' + cantiere;
          if (!byKey[key]) {
            byKey[key] = {
              commessa: bc.commessa, squadra, operatori: [], cantiere,
              _attivita: new Set(), attivita: '', cantierePrev: null, color, giorni: [],
              strumenti
            };
            order.push(key);
          }
          const it = byKey[key];
          if (!it.giorni.includes(d)) it.giorni.push(d);
          attvGiorno.forEach(a => it._attivita.add(a));
          ops.forEach(o => { if (!it.operatori.includes(o.nome)) it.operatori.push(o.nome); });
        });
      }
    });
  });

  return order.map(k => {
    const it = byKey[k];
    it.giorni.sort((a, b) => a - b);
    it.attivita = [...it._attivita].join(', ');
    delete it._attivita;
    return it;
  });
}

async function pwMapRender(dayIdx) {
  _mapDay = dayIdx;
  if (!_map || !_mapOp) return;
  _mapColors = {};
  _mapColorsRegione = {};
  _mapColorsStrumento = {};

  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }
  const todayStr = new Date().toISOString().slice(0, 10);

  /* Aggiorna label settimana */
  const mapWeekLabel = document.getElementById('pw-map-week-label');
  if (mapWeekLabel) mapWeekLabel.textContent = `WEEK ${pwWeek} · ${formatDate(days[0])} — ${formatDate(days[5])} ${pwAnno}`;

  /* Aggiorna bottoni giorni */
  const daysEl = document.getElementById('pw-map-days');
  if (daysEl) {
    daysEl.innerHTML = days.map((d, i) => {
      const ds = d.toISOString().slice(0, 10);
      const isToday = ds === todayStr;
      const active = i === dayIdx ? 'active' : '';
      const today = isToday ? 'is-today' : '';
      return `<button class="pw-map-day-btn ${active} ${today}" data-di="${i}">${PW_MAP_DAY_SHORT[i]} ${formatDate(d)}</button>`;
    }).join('') +
      `<button class="pw-map-day-btn pw-map-week-btn ${dayIdx === PW_MAP_WEEK ? 'active' : ''}" data-di="${PW_MAP_WEEK}">📅 Tutta la settimana</button>`;
    daysEl.querySelectorAll('.pw-map-day-btn').forEach(b => {
      b.onclick = () => pwMapRender(parseInt(b.dataset.di));
    });
  }

  pwMapPopulateRegioneFilter();

  const items = pwMapBuildSquadItems(dayIdx);
  await pwMapRenderCantieri(items, dayIdx);
  await pwMapRenderResidenze(items, dayIdx);
}

/* ==================== MAPPA CANTIERI ==================== */

/* Bottoni "👷 Operatori / 🔧 Strumenti": scelgono cosa evidenziare sulla sola
   mappa Cantieri (Residenze operatori non è toccata, non ha senso lì). */
function pwMapRenderCantieriModeButtons() {
  const el = document.getElementById('pw-map-cantieri-mode');
  if (!el) return;
  el.innerHTML = `
    <button class="pw-map-mode-btn ${_mapCantieriMode === 'operatori' ? 'active' : ''}" data-mode="operatori">👷 Operatori</button>
    <button class="pw-map-mode-btn ${_mapCantieriMode === 'strumenti' ? 'active' : ''}" data-mode="strumenti">🔧 Strumenti</button>`;
  el.querySelectorAll('.pw-map-mode-btn').forEach(b => {
    b.onclick = () => {
      if (_mapCantieriMode === b.dataset.mode) return;
      _mapCantieriMode = b.dataset.mode;
      pwMapRenderCantieri(pwMapBuildSquadItems(_mapDay), _mapDay);
    };
  });
  pwMapRenderStrumentoFilterButton();
}

async function pwMapRenderCantieri(itemsAll, dayIdx) {
  pwMapRenderCantieriModeButtons();

  const loadingEl = document.getElementById('pw-map-loading');
  if (loadingEl) loadingEl.style.display = 'flex';

  const itemsRegione = _mapRegioneFilter
    ? itemsAll.filter(it => commessaRegione(it.commessa) === _mapRegioneFilter)
    : itemsAll;
  /* In modalità Strumenti mostra solo i cantieri della squadra a cui è
     assegnato almeno uno strumento Jira (eventualmente ristretto agli
     strumenti selezionati via _mapStrumentiFilter): gli strumenti sono legati
     alla squadra (non al singolo cantiere), quindi uno strumento compare su
     tutti i cantieri toccati dalla sua squadra nel periodo mostrato. */
  const items = _mapCantieriMode === 'strumenti'
    ? itemsRegione.filter(it => it.strumenti && it.strumenti.length && (!_mapStrumentiFilter.size || it.strumenti.some(k => _mapStrumentiFilter.has(k))))
    : itemsRegione;

  const sumTitleEl = document.getElementById('pw-map-summary-title');
  if (sumTitleEl) sumTitleEl.textContent = _mapCantieriMode === 'strumenti' ? '🔧 Strumenti: dove sono' : 'Squadre & spostamenti';

  /* Rimuovi marker precedenti */
  _mapMarkers.forEach(m => _map.removeLayer(m));
  _mapMarkers = [];

  /* Geocodifica (sequenziale per rispettare rate limit Nominatim) */
  const coords = [];
  for (const item of items) {
    const g = await geocodifica(item.cantiere);
    coords.push(g);
    await new Promise(r => setTimeout(r, 300)); // rate limit
  }

  /* Aggiungi marker */
  const posCount = {};
  const bounds = [];

  items.forEach((item, i) => {
    const geo = coords[i];
    const missing = !geo;
    let lat, lng;

    if (missing) {
      // Posizione di fallback: centro Italia + offset per non sovrapporre
      lat = 42.5 + (i % 5) * 0.6;
      lng = 12.5 + Math.floor(i / 5) * 0.8;
    } else {
      lat = geo.lat; lng = geo.lng;
      // Sfalsamento per marker sovrapposti
      const pk = lat.toFixed(2) + '_' + lng.toFixed(2);
      posCount[pk] = (posCount[pk] || 0) + 1;
      const offset = posCount[pk] - 1;
      if (offset > 0) {
        lat += Math.cos(offset * 1.1) * 0.009;
        lng += Math.sin(offset * 1.1) * 0.009;
      }
      bounds.push([lat, lng]);
    }

    const itemStrumenti = pwMapDisplayStrumenti(item);

    /* In modalità Strumenti il colore riflette il primo strumento mostrato
       (invece della commessa), per leggerlo a colpo d'occhio insieme alla
       legenda "per strumento" qui sotto. */
    const dotColor = (_mapCantieriMode === 'strumenti' && itemStrumenti.length)
      ? _mapColorStrumento(itemStrumenti[0])
      : item.color;
    const dotStyle = missing
      ? `width:22px;height:22px;border-radius:50%;background:${dotColor};border:3px dashed white;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;`
      : `width:18px;height:18px;border-radius:50%;background:${dotColor};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);`;

    const iconHtml = missing
      ? `<div style="${dotStyle}">⚠</div>`
      : `<div style="${dotStyle}"></div>`;

    const icon = L.divIcon({ html: iconHtml, className: 'pw-map-marker', iconSize: [22, 22], iconAnchor: [11, 11] });

    const strumentiHtml = itemStrumenti.length
      ? `<div style="color:#0d9488;font-weight:600;margin:2px 0;">🔧 ${itemStrumenti.map(k => esc(pwStrLabel(k))).join(', ')}</div>`
      : '';
    const popup = `<div style="font-family:system-ui;min-width:170px;font-size:12px;">
      <div style="font-weight:700;margin-bottom:3px;">${item.squadra}</div>
      <div style="color:#475569;font-size:11px;">📋 ${esc(item.commessa)}</div>
      <div style="color:var(--accent);font-weight:600;margin:2px 0;">📍 ${item.cantiere}</div>
      ${strumentiHtml}
      <div style="color:#64748b;font-size:11px;">👷 ${item.operatori.join(', ')}</div>
      ${item.attivita ? `<div style="color:#64748b;font-style:italic;font-size:10px;">${item.attivita}</div>` : ''}
      ${dayIdx === PW_MAP_WEEK && item.giorni ? `<div style="color:#4f46e5;font-weight:600;font-size:10px;margin-top:2px;">📅 ${item.giorni.map(d => PW_MAP_DAY_SHORT[d]).join(' · ')}</div>` : ''}
      ${missing ? `<div style="color:#ea580c;font-weight:600;font-size:10px;margin-top:3px;">⚠ Luogo non trovato</div>` : ''}
    </div>`;

    const marker = L.marker([lat, lng], { icon }).addTo(_map).bindPopup(popup);
    marker.on('click', () => pwMapFocusItem(i));
    _mapMarkers.push(marker);
  });

  /* Fit bounds */
  if (bounds.length === 1) _map.setView(bounds[0], 11);
  else if (bounds.length > 1) _map.fitBounds(bounds, { padding: [50, 50] });
  setTimeout(() => _map.invalidateSize(), 100);

  if (loadingEl) loadingEl.style.display = 'none';

  /* Legenda: per commessa in modalità Operatori, per strumento in modalità Strumenti */
  const legendEl = document.getElementById('pw-map-legend');
  if (legendEl) {
    if (_mapCantieriMode === 'strumenti') {
      const uniqStr = [...new Set(items.flatMap(i => pwMapDisplayStrumenti(i)))].sort((a, b) => pwStrLabel(a).localeCompare(pwStrLabel(b)));
      if (!uniqStr.length) {
        legendEl.innerHTML = `<div class="text-slate-400 italic" style="font-size:11px">Nessuno strumento assegnato ${dayIdx === PW_MAP_WEEK ? 'questa settimana' : 'oggi'}</div>`;
      } else {
        legendEl.innerHTML = uniqStr.map(k => `
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;">
            <div style="width:10px;height:10px;border-radius:50%;background:${_mapColorStrumento(k)};flex-shrink:0;"></div>
            <span>${esc(pwStrLabel(k))}</span>
          </div>`).join('');
      }
    } else {
      const uniq = [...new Set(items.map(i => i.commessa))];
      if (!uniq.length) {
        legendEl.innerHTML = `<div class="text-slate-400 italic" style="font-size:11px">Nessuna commessa attiva ${dayIdx === PW_MAP_WEEK ? 'questa settimana' : 'oggi'}</div>`;
      } else {
        legendEl.innerHTML = uniq.map(c => `
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;">
            <div style="width:10px;height:10px;border-radius:50%;background:${_mapColor(c)};flex-shrink:0;"></div>
            <span>${c}</span>
          </div>`).join('');
      }
    }
  }

  /* Riepilogo: raggruppato per commessa. In modalità Operatori, una card per
     squadra/cantiere (comportamento storico, con l'eventuale strumento
     assegnato indicato in una riga). In modalità Strumenti, il pannello
     cambia focus: per ogni commessa elenca gli strumenti usati e, per
     ciascuno, dove si trova (cantiere/squadra) — la vista squadra-centrica
     lascia il posto a una vista strumento-centrica. */
  const sumEl = document.getElementById('pw-map-summary');
  if (sumEl) {
    if (!items.length) {
      const emptyLabel = _mapCantieriMode === 'strumenti' ? 'Nessuno strumento assegnato' : 'Nessuna squadra';
      sumEl.innerHTML = `<div class="text-slate-400 italic" style="font-size:11px">${emptyLabel} per ${dayIdx === PW_MAP_WEEK ? 'questa settimana' : 'questo giorno'}</div>`;
    } else if (_mapCantieriMode === 'strumenti') {
      const commessaOrder = [];
      const byCommessa = {};
      items.forEach((item, i) => {
        if (!byCommessa[item.commessa]) { byCommessa[item.commessa] = {}; commessaOrder.push(item.commessa); }
        const byStr = byCommessa[item.commessa];
        pwMapDisplayStrumenti(item).forEach(k => {
          if (!byStr[k]) byStr[k] = [];
          byStr[k].push(i);
        });
      });

      sumEl.innerHTML = commessaOrder.map(commessa => {
        const byStr = byCommessa[commessa];
        const strKeys = Object.keys(byStr).sort((a, b) => pwStrLabel(a).localeCompare(pwStrLabel(b)));
        const collapsed = _mapCollapsedCommesse.has(commessa);
        const bodyHtml = strKeys.map(k => {
          const locHtml = byStr[k].map(i => {
            const item = items[i];
            const missing = !coords[i];
            return `<div class="pw-squad-card ${missing ? 'not-found' : ''}" data-idx="${i}">
              ${pwMapCantiereRowHtml(item, missing)}
              <div class="sq-ops">👷 ${esc(item.squadra)} · ${item.operatori.join(' · ')}</div>
              ${dayIdx === PW_MAP_WEEK ? pwMapGiorniChips(item.giorni) : ''}
            </div>`;
          }).join('');
          return `<div style="margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#0d9488;margin-bottom:3px;">
              <div style="width:8px;height:8px;border-radius:50%;background:${_mapColorStrumento(k)};flex-shrink:0;"></div>
              🔧 ${esc(pwStrLabel(k))}
            </div>
            ${locHtml}
          </div>`;
        }).join('');
        return `<div class="pw-squad-group">
          <div class="pw-squad-group-header${collapsed ? ' collapsed' : ''}" data-commessa="${esc(commessa)}">
            <span class="pw-squad-group-arrow">${collapsed ? '▸' : '▾'}</span>
            <div class="pw-squad-group-dot" style="background:${_mapColor(commessa)}"></div>
            <span class="pw-squad-group-name">${esc(commessa)}</span>
            <span class="pw-squad-group-count">${strKeys.length}</span>
          </div>
          <div class="pw-squad-group-body" style="${collapsed ? 'display:none;' : ''}">${bodyHtml}</div>
        </div>`;
      }).join('');

      sumEl.querySelectorAll('.pw-squad-group-header').forEach(h => {
        h.onclick = () => pwMapToggleGroup(h);
      });
      sumEl.querySelectorAll('.pw-squad-card').forEach(card => {
        card.onclick = () => pwMapFocusItem(parseInt(card.dataset.idx, 10));
      });
    } else {
      const groupOrder = [];
      const groups = {};
      items.forEach((item, i) => {
        if (!groups[item.commessa]) { groups[item.commessa] = []; groupOrder.push(item.commessa); }
        groups[item.commessa].push(i);
      });

      sumEl.innerHTML = groupOrder.map(commessa => {
        const idxs = groups[commessa];
        const collapsed = _mapCollapsedCommesse.has(commessa);
        const cardsHtml = idxs.map(i => {
          const item = items[i];
          const geo = coords[i];
          const missing = !geo;
          let moveHtml = '';
          if (dayIdx > 0 && item.cantierePrev) {
            if (item.cantierePrev === item.cantiere) {
              moveHtml = '<div class="sq-same">↔ stessa sede</div>';
            } else {
              moveHtml = `<div class="sq-move">↗ ${item.cantierePrev} → ${item.cantiere}</div>`;
            }
          }
          const strumentiLine = (item.strumenti && item.strumenti.length)
            ? `<div class="sq-ops" style="color:#0d9488;">🔧 ${item.strumenti.map(k => esc(pwStrLabel(k))).join(' · ')}</div>` : '';
          return `<div class="pw-squad-card ${missing ? 'not-found' : ''}" data-idx="${i}">
            <div style="display:flex;align-items:center;gap:5px;">
              <div style="width:8px;height:8px;border-radius:50%;background:${item.color};flex-shrink:0;"></div>
              <span class="sq-name">${item.squadra}</span>
            </div>
            ${pwMapCantiereRowHtml(item, missing)}
            ${strumentiLine}
            <div class="sq-ops">👷 ${item.operatori.join(' · ')}</div>
            ${moveHtml}${dayIdx === PW_MAP_WEEK ? pwMapGiorniChips(item.giorni) : ''}
          </div>`;
        }).join('');
        return `<div class="pw-squad-group">
          <div class="pw-squad-group-header${collapsed ? ' collapsed' : ''}" data-commessa="${esc(commessa)}">
            <span class="pw-squad-group-arrow">${collapsed ? '▸' : '▾'}</span>
            <div class="pw-squad-group-dot" style="background:${_mapColor(commessa)}"></div>
            <span class="pw-squad-group-name">${esc(commessa)}</span>
            <span class="pw-squad-group-count">${idxs.length}</span>
          </div>
          <div class="pw-squad-group-body" style="${collapsed ? 'display:none;' : ''}">${cardsHtml}</div>
        </div>`;
      }).join('');

      sumEl.querySelectorAll('.pw-squad-group-header').forEach(h => {
        h.onclick = () => pwMapToggleGroup(h);
      });
      sumEl.querySelectorAll('.pw-squad-card').forEach(card => {
        card.onclick = () => pwMapFocusItem(parseInt(card.dataset.idx, 10));
      });
    }
  }
}

/* Centra la mappa cantieri su una squadra/cantiere e la evidenzia, in sync con la card cliccata */
function pwMapFocusItem(idx) {
  if (!_map || !_mapMarkers[idx]) return;
  const marker = _mapMarkers[idx];
  const latlng = marker.getLatLng();
  _map.setView(latlng, Math.max(_map.getZoom(), 15), { animate: true });
  marker.openPopup();

  _mapMarkers.forEach(m => { const el = m.getElement(); if (el) el.classList.remove('active'); });
  const markerEl = marker.getElement();
  if (markerEl) markerEl.classList.add('active');

  document.querySelectorAll('#pw-map-summary .pw-squad-card.active').forEach(c => c.classList.remove('active'));
  const card = document.querySelector('#pw-map-summary .pw-squad-card[data-idx="' + idx + '"]');
  if (card) card.classList.add('active');
}

/* Espande/comprime il gruppo squadre di una commessa nella colonna Squadre & spostamenti */
function pwMapToggleGroup(headerEl) {
  const commessa = headerEl.dataset.commessa;
  const body = headerEl.nextElementSibling;
  const arrow = headerEl.querySelector('.pw-squad-group-arrow');
  if (_mapCollapsedCommesse.has(commessa)) {
    _mapCollapsedCommesse.delete(commessa);
    headerEl.classList.remove('collapsed');
    if (body) body.style.display = '';
    if (arrow) arrow.textContent = '▾';
  } else {
    _mapCollapsedCommesse.add(commessa);
    headerEl.classList.add('collapsed');
    if (body) body.style.display = 'none';
    if (arrow) arrow.textContent = '▸';
  }
}

/* Correzione manuale della posizione di un cantiere: apre/chiude la riga con
   l'input dedicato (vedi pwMapCantiereRowHtml). Chiude anche ogni altra riga
   già aperta, per evitare più correzioni in sospeso contemporaneamente. */
function pwMapGeoEditToggle(btn) {
  const wrap = btn.closest('.pw-geo-wrap');
  const row = wrap ? wrap.querySelector('.pw-geo-edit-row') : null;
  if (!row) return;
  document.querySelectorAll('.pw-geo-edit-row').forEach(r => { if (r !== row) r.style.display = 'none'; });
  const opening = row.style.display === 'none';
  row.style.display = opening ? 'block' : 'none';
  if (opening) {
    const inp = row.querySelector('input');
    if (inp) {
      inp.value = ''; inp.disabled = false; inp.style.borderColor = '';
      inp.placeholder = 'Comune o "lat, lng" (Invio)';
      setTimeout(() => inp.focus(), 0);
    }
  }
}

/* Riconosce "lat, lng" (o "lat lng"/"lat;lng", con decimali e segno) come
   coordinate dirette; altrimenti l'input va trattato come nome da geocodificare. */
function pwMapParseCoords(text) {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* Applica la correzione di posizione digitata (nome comune o coordinate
   dirette) all'input `data-cantiere` corrispondente. Aggiorna la rubrica
   luoghi condivisa (geo_cache_v1) solo dopo conferma esplicita dell'utente,
   perché la modifica vale per tutte le settimane in cui compare quel nome
   cantiere, non solo per la card corrente. */
async function pwMapGeoEditSubmit(inp) {
  const cantiere = inp.dataset.cantiere;
  const query = inp.value.trim();
  if (!cantiere || !query) return;
  const key = cantiere.toLowerCase().trim().replace(/\s+/g, ' ');

  let result = pwMapParseCoords(query);
  if (result) {
    result = { lat: result.lat, lng: result.lng, label: `Coordinate manuali (${result.lat}, ${result.lng})` };
  } else {
    inp.disabled = true; inp.value = 'Ricerca…';
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
      const res = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'StaffingDashboard/1.0' } });
      const data = await res.json();
      if (!data || !data.length) {
        inp.disabled = false; inp.value = ''; inp.style.borderColor = '#ef4444';
        inp.placeholder = 'Non trovato, riprova…';
        return;
      }
      result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
      inp.disabled = false; inp.value = query; inp.style.borderColor = '';
    } catch (e) {
      inp.disabled = false; inp.placeholder = 'Errore rete';
      return;
    }
  }

  const msg = `Impostare la posizione di "${cantiere}" su:\n${result.label}\n(${result.lat.toFixed(5)}, ${result.lng.toFixed(5)})?`;
  if (!await showConfirmAsync(msg, 'Correggi posizione')) {
    inp.disabled = false; inp.value = query;
    return;
  }
  _geoCache[key] = result;
  await _geoCacheSaveSingle(key, result);
  pwMapRender(_mapDay);
}

/* Riga "📍 cantiere" con icona ✏️ per correggere manualmente la posizione
   (nome comune, ri-geocodificato, oppure coordinate dirette "lat, lng"),
   condivisa dalla vista Operatori e dalla vista Strumenti del riepilogo.
   Se il luogo non è stato geocodificato l'input è già aperto e in evidenza,
   dato che in quel caso la posizione mostrata è solo un fallback approssimato. */
function pwMapCantiereRowHtml(item, missing) {
  const cantiereAttr = item.cantiere.replace(/"/g, '&quot;');
  const editInput = `<input type="text" class="pw-fix-input" placeholder='Comune o "lat, lng" (Invio)'
        data-cantiere="${cantiereAttr}"
        onkeydown="if(event.key==='Enter'){event.stopPropagation();pwMapGeoEditSubmit(this)}" onclick="event.stopPropagation()">`;
  return `<div class="pw-geo-wrap">
    <div class="sq-cantiere">📍 ${esc(item.cantiere)} <span class="pw-geo-edit-btn" onclick="event.stopPropagation();pwMapGeoEditToggle(this)" title="Correggi posizione">✏️</span></div>
    ${missing
      ? `<div class="sq-warn">⚠ Luogo non trovato, posizione approssimata<div class="pw-geo-edit-row" style="display:block;">${editInput}</div></div>`
      : `<div class="pw-geo-edit-row" style="display:none;">${editInput}</div>`}
  </div>`;
}

/* ==================== MAPPA RESIDENZE OPERATORI ==================== */
/* Deriva dagli item-squadra una lista per-operatore con relativa posizione di
   residenza (provincia se nota, altrimenti centroide regione, altrimenti "non trovato") */
/* Con weekMode = true l'operatore compare una sola volta, con commesse/cantieri
   della settimana accorpati: la sua residenza è una sola, quindi più marker sullo
   stesso punto non aggiungerebbero informazione, solo rumore. */
function pwMapBuildOperatorItems(itemsAll, weekMode) {
  const out = []; // { operatore, commessa, squadra, cantiere, regione, provincia, geo, color }
  const byOp = {};
  itemsAll.forEach(item => {
    item.operatori.forEach(nome => {
      const op = state.operatori.find(o => (o.nome_esteso || o.nome_breve) === nome);
      const regione = op ? operatoreRegione(op) : '';
      if (_mapRegioneFilter && regione !== _mapRegioneFilter) return;
      let geo = null;
      if (op && op.provincia) {
        const p = provinciaInfo(op.provincia);
        if (p) geo = { lat: p.lat, lng: p.lng, label: `${p.nome} (${p.sigla})` };
      } else if (regione) {
        const c = regioneCentroid(regione);
        if (c) geo = { lat: c.lat, lng: c.lng, label: regione };
      }

      if (weekMode) {
        let e = byOp[nome];
        if (!e) {
          e = {
            operatore: nome, commessa: '', squadra: item.squadra, cantiere: '',
            regione, provincia: op ? op.provincia : '', geo, color: _mapColorRegione(regione),
            _commesse: [], _cantieri: [], giorni: []
          };
          byOp[nome] = e;
          out.push(e);
        }
        if (!e._commesse.includes(item.commessa)) e._commesse.push(item.commessa);
        if (!e._cantieri.includes(item.cantiere)) e._cantieri.push(item.cantiere);
        (item.giorni || []).forEach(d => { if (!e.giorni.includes(d)) e.giorni.push(d); });
      } else {
        out.push({
          operatore: nome, commessa: item.commessa, squadra: item.squadra, cantiere: item.cantiere,
          regione, provincia: op ? op.provincia : '', geo, color: _mapColorRegione(regione)
        });
      }
    });
  });

  if (weekMode) {
    out.forEach(e => {
      e.giorni.sort((a, b) => a - b);
      e.commessa = e._commesse.join(', ');
      e.cantiere = e._cantieri.join(' · ');
      delete e._commesse;
      delete e._cantieri;
    });
  }
  return out;
}

async function pwMapRenderResidenze(itemsAll, dayIdx) {
  const items = pwMapBuildOperatorItems(itemsAll, dayIdx === PW_MAP_WEEK);

  /* Rimuovi marker precedenti */
  _mapOpMarkers.forEach(m => _mapOp.removeLayer(m));
  _mapOpMarkers = [];

  /* Aggiungi marker */
  const posCount = {};
  const bounds = [];

  items.forEach((item, i) => {
    const missing = !item.geo;
    let lat, lng;

    if (missing) {
      lat = 42.5 + (i % 5) * 0.6;
      lng = 12.5 + Math.floor(i / 5) * 0.8;
    } else {
      lat = item.geo.lat; lng = item.geo.lng;
      const pk = lat.toFixed(2) + '_' + lng.toFixed(2);
      posCount[pk] = (posCount[pk] || 0) + 1;
      const offset = posCount[pk] - 1;
      if (offset > 0) {
        lat += Math.cos(offset * 1.1) * 0.009;
        lng += Math.sin(offset * 1.1) * 0.009;
      }
      bounds.push([lat, lng]);
    }

    const dotStyle = missing
      ? `width:22px;height:22px;border-radius:50%;background:${item.color};border:3px dashed white;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;`
      : `width:18px;height:18px;border-radius:50%;background:${item.color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);`;

    const iconHtml = missing
      ? `<div style="${dotStyle}">⚠</div>`
      : `<div style="${dotStyle}"></div>`;

    const icon = L.divIcon({ html: iconHtml, className: 'pw-map-marker', iconSize: [22, 22], iconAnchor: [11, 11] });

    const provinciaLabel = item.geo && !missing ? item.geo.label : (item.regione || 'provenienza sconosciuta');
    const popup = `<div style="font-family:system-ui;min-width:170px;font-size:12px;">
      <div style="font-weight:700;margin-bottom:3px;">👷 ${esc(item.operatore)}</div>
      <div style="color:#475569;font-size:11px;">📋 ${esc(item.commessa)} · ${esc(item.squadra)}</div>
      <div style="color:var(--accent);font-weight:600;margin:2px 0;">🏠 ${esc(provinciaLabel)}</div>
      <div style="color:#64748b;font-size:11px;">📍 cantiere: ${esc(item.cantiere)}</div>
      ${dayIdx === PW_MAP_WEEK && item.giorni ? `<div style="color:#4f46e5;font-weight:600;font-size:10px;margin-top:2px;">📅 ${item.giorni.map(d => PW_MAP_DAY_SHORT[d]).join(' · ')}</div>` : ''}
      ${missing ? `<div style="color:#ea580c;font-weight:600;font-size:10px;margin-top:3px;">⚠ Regione/provincia non impostata</div>` : ''}
    </div>`;

    const marker = L.marker([lat, lng], { icon }).addTo(_mapOp).bindPopup(popup);
    marker.on('click', () => pwMapOpFocusItem(i));
    _mapOpMarkers.push(marker);
  });

  if (bounds.length === 1) _mapOp.setView(bounds[0], 11);
  else if (bounds.length > 1) _mapOp.fitBounds(bounds, { padding: [50, 50] });
  setTimeout(() => _mapOp.invalidateSize(), 100);

  /* Legenda per regione (non per commessa: la commessa è già distinguibile
     sulla mappa Cantieri sopra) */
  const legendEl = document.getElementById('pw-map-op-legend');
  if (legendEl) {
    const uniq = [...new Set(items.map(i => i.regione))].sort((a,b) => (a||'zzz').localeCompare(b||'zzz'));
    if (!uniq.length) {
      legendEl.innerHTML = `<div class="text-slate-400 italic" style="font-size:11px">Nessun operatore assegnato ${dayIdx === PW_MAP_WEEK ? 'questa settimana' : 'oggi'}</div>`;
    } else {
      legendEl.innerHTML = uniq.map(r => `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;">
          <div style="width:10px;height:10px;border-radius:50%;background:${_mapColorRegione(r)};flex-shrink:0;"></div>
          <span>${esc(r || 'Provenienza non impostata')}</span>
        </div>`).join('');
    }
  }

  /* Riepilogo operatori, raggruppato per regione di provenienza (espandibile/comprimibile) */
  const sumEl = document.getElementById('pw-map-op-summary');
  if (sumEl) {
    if (!items.length) {
      sumEl.innerHTML = `<div class="text-slate-400 italic" style="font-size:11px">Nessun operatore per ${dayIdx === PW_MAP_WEEK ? 'questa settimana' : 'questo giorno'}</div>`;
    } else {
      const groupOrder = [];
      const groups = {};
      items.forEach((item, i) => {
        const key = item.regione || '';
        if (!(key in groups)) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(i);
      });
      groupOrder.sort((a,b) => (a||'zzz').localeCompare(b||'zzz'));

      sumEl.innerHTML = groupOrder.map(regione => {
        const idxs = groups[regione];
        const collapsed = _mapCollapsedRegioniOp.has(regione);
        const cardsHtml = idxs.map(i => {
          const item = items[i];
          const missing = !item.geo;
          const provinciaLabel = item.geo && !missing ? item.geo.label : '';
          const warnHtml = missing ? `<div class="sq-warn">⚠ Regione/provincia non impostata</div>` : '';
          return `<div class="pw-squad-card ${missing ? 'not-found' : ''}" data-idx="${i}">
            <div style="display:flex;align-items:center;gap:5px;">
              <div style="width:8px;height:8px;border-radius:50%;background:${item.color};flex-shrink:0;"></div>
              <span class="sq-name">${esc(item.operatore)}</span>
            </div>
            ${provinciaLabel ? `<div class="sq-cantiere">🏠 ${esc(provinciaLabel)}</div>` : ''}
            <div class="sq-ops">📋 ${esc(item.commessa)} · 📍 ${esc(item.cantiere)}</div>
            ${warnHtml}${dayIdx === PW_MAP_WEEK ? pwMapGiorniChips(item.giorni) : ''}
          </div>`;
        }).join('');
        return `<div class="pw-squad-group">
          <div class="pw-squad-group-header${collapsed ? ' collapsed' : ''}" data-group="${esc(regione)}">
            <span class="pw-squad-group-arrow">${collapsed ? '▸' : '▾'}</span>
            <div class="pw-squad-group-dot" style="background:${_mapColorRegione(regione)}"></div>
            <span class="pw-squad-group-name">${esc(regione || 'Provenienza non impostata')}</span>
            <span class="pw-squad-group-count">${idxs.length}</span>
          </div>
          <div class="pw-squad-group-body" style="${collapsed ? 'display:none;' : ''}">${cardsHtml}</div>
        </div>`;
      }).join('');

      sumEl.querySelectorAll('.pw-squad-group-header').forEach(h => {
        h.onclick = () => pwMapOpToggleGroup(h);
      });
      sumEl.querySelectorAll('.pw-squad-card').forEach(card => {
        card.onclick = () => pwMapOpFocusItem(parseInt(card.dataset.idx, 10));
      });
    }
  }
}

/* Centra la mappa residenze su un operatore e lo evidenzia, in sync con la card cliccata */
function pwMapOpFocusItem(idx) {
  if (!_mapOp || !_mapOpMarkers[idx]) return;
  const marker = _mapOpMarkers[idx];
  const latlng = marker.getLatLng();
  _mapOp.setView(latlng, Math.max(_mapOp.getZoom(), 15), { animate: true });
  marker.openPopup();

  _mapOpMarkers.forEach(m => { const el = m.getElement(); if (el) el.classList.remove('active'); });
  const markerEl = marker.getElement();
  if (markerEl) markerEl.classList.add('active');

  document.querySelectorAll('#pw-map-op-summary .pw-squad-card.active').forEach(c => c.classList.remove('active'));
  const card = document.querySelector('#pw-map-op-summary .pw-squad-card[data-idx="' + idx + '"]');
  if (card) card.classList.add('active');
}

/* Espande/comprime il gruppo operatori di una regione nella colonna Operatori & provenienza */
function pwMapOpToggleGroup(headerEl) {
  const regione = headerEl.dataset.group;
  const body = headerEl.nextElementSibling;
  const arrow = headerEl.querySelector('.pw-squad-group-arrow');
  if (_mapCollapsedRegioniOp.has(regione)) {
    _mapCollapsedRegioniOp.delete(regione);
    headerEl.classList.remove('collapsed');
    if (body) body.style.display = '';
    if (arrow) arrow.textContent = '▾';
  } else {
    _mapCollapsedRegioniOp.add(regione);
    headerEl.classList.add('collapsed');
    if (body) body.style.display = 'none';
    if (arrow) arrow.textContent = '▸';
  }
}
