/* ==================== MAPPA LEAFLET + NOMINATIM ==================== */
const MAP_COLORS = ['#0d9488','#6366f1','#f59e0b','#ef4444','#10b981','#8b5cf6','#ec4899','#0ea5e9','#f97316','#84cc16'];
let _mapColors = {};
function _mapColor(commessa) {
  if (!_mapColors[commessa]) {
    _mapColors[commessa] = MAP_COLORS[Object.keys(_mapColors).length % MAP_COLORS.length];
  }
  return _mapColors[commessa];
}

/* Rubrica luoghi persistente */
let _geoCache = {};
async function _geoCacheLoad() {
  try { const r = await sget('geo_cache_v1'); if (r) _geoCache = r; } catch(e) {}
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
    await _geoCacheSave();
    if (statusEl) statusEl.textContent = '';
    return val;
  } catch(e) {
    if (statusEl) statusEl.textContent = '';
    return null;
  }
}

/* Istanza Leaflet */
let _map = null;
let _mapMarkers = [];
let _mapDay = 0;

function pwMapInit() {
  if (!_map) {
    _map = L.map('pw-map', { preferCanvas: true }).setView([42.5, 12.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(_map);
    setTimeout(() => _map.invalidateSize(), 200);
  }
  pwMapRender(_mapDay);
}

async function pwMapRender(dayIdx) {
  _mapDay = dayIdx;
  if (!_map) return;
  _mapColors = {};

  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }
  const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
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
      return `<button class="pw-map-day-btn ${active} ${today}" data-di="${i}">${DAY_SHORT[i]} ${formatDate(d)}</button>`;
    }).join('');
    daysEl.querySelectorAll('.pw-map-day-btn').forEach(b => {
      b.onclick = () => pwMapRender(parseInt(b.dataset.di));
    });
  }

  /* Rimuovi marker precedenti */
  _mapMarkers.forEach(m => _map.removeLayer(m));
  _mapMarkers = [];

  /* Raccoglie squadre attive oggi */
  const data = pwGetWeekData();
  const items = []; // { commessa, squadra, operatori, cantiere, attivita, cantierePrev, color }

  data.forEach(bc => {
    if (!bc.commessa) return;
    const color = _mapColor(bc.commessa);
    (bc.squadre || []).forEach(sq => {
      const ops = (sq.operatori || []).filter(o => o.nome && o.nome.trim());
      const cantieriOggi = new Set();
      const attvOggi = new Set();
      ops.forEach(op => {
        const g = (op.giorni || {})[dayIdx] || {};
        if (g.cantiere && g.cantiere.trim()) cantieriOggi.add(g.cantiere.trim());
        if (g.attivita && g.attivita.trim()) attvOggi.add(g.attivita.trim());
      });
      if (!cantieriOggi.size) return;

      const cantieriPrec = new Set();
      if (dayIdx > 0) {
        ops.forEach(op => {
          const g = (op.giorni || {})[dayIdx - 1] || {};
          if (g.cantiere && g.cantiere.trim()) cantieriPrec.add(g.cantiere.trim());
        });
      }

      [...cantieriOggi].forEach(cantiere => {
        items.push({
          commessa: bc.commessa, squadra: sq.nome || 'Squadra',
          operatori: ops.map(o => o.nome),
          cantiere,
          attivita: [...attvOggi].join(', '),
          cantierePrev: cantieriPrec.size ? [...cantieriPrec].join('/') : null,
          color
        });
      });
    });
  });

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

    const dotStyle = missing
      ? `width:22px;height:22px;border-radius:50%;background:${item.color};border:3px dashed white;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;`
      : `width:18px;height:18px;border-radius:50%;background:${item.color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);`;

    const iconHtml = missing
      ? `<div style="${dotStyle}">⚠</div>`
      : `<div style="${dotStyle}"></div>`;

    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });

    const popup = `<div style="font-family:system-ui;min-width:170px;font-size:12px;">
      <div style="font-weight:700;margin-bottom:3px;">${item.squadra}</div>
      <div style="color:#475569;font-size:11px;">📋 ${esc(item.commessa)}</div>
      <div style="color:var(--accent);font-weight:600;margin:2px 0;">📍 ${item.cantiere}</div>
      <div style="color:#64748b;font-size:11px;">👷 ${item.operatori.join(', ')}</div>
      ${item.attivita ? `<div style="color:#64748b;font-style:italic;font-size:10px;">${item.attivita}</div>` : ''}
      ${missing ? `<div style="color:#ea580c;font-weight:600;font-size:10px;margin-top:3px;">⚠ Luogo non trovato</div>` : ''}
    </div>`;

    const marker = L.marker([lat, lng], { icon }).addTo(_map).bindPopup(popup);
    _mapMarkers.push(marker);
  });

  /* Fit bounds */
  if (bounds.length === 1) _map.setView(bounds[0], 11);
  else if (bounds.length > 1) _map.fitBounds(bounds, { padding: [50, 50] });
  setTimeout(() => _map.invalidateSize(), 100);

  /* Legenda */
  const legendEl = document.getElementById('pw-map-legend');
  if (legendEl) {
    const uniq = [...new Set(items.map(i => i.commessa))];
    if (!uniq.length) {
      legendEl.innerHTML = '<div class="text-slate-400 italic" style="font-size:11px">Nessuna commessa attiva oggi</div>';
    } else {
      legendEl.innerHTML = uniq.map(c => `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#334155;">
          <div style="width:10px;height:10px;border-radius:50%;background:${_mapColor(c)};flex-shrink:0;"></div>
          <span>${c}</span>
        </div>`).join('');
    }
  }

  /* Riepilogo squadre */
  const sumEl = document.getElementById('pw-map-summary');
  if (sumEl) {
    if (!items.length) {
      sumEl.innerHTML = '<div class="text-slate-400 italic" style="font-size:11px">Nessuna squadra per questo giorno</div>';
    } else {
      sumEl.innerHTML = items.map((item, i) => {
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
        const warnHtml = missing ? `
          <div class="sq-warn">⚠ Luogo non trovato
            <input class="pw-fix-input" type="text" placeholder="Cerca alternativo (Invio)"
              data-original="${item.cantiere.replace(/"/g,'&quot;')}"
              onkeydown="if(event.key==='Enter')pwMapFixLuogo(this)">
          </div>` : '';
        return `<div class="pw-squad-card ${missing ? 'not-found' : ''}">
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${item.color};flex-shrink:0;"></div>
            <span class="sq-name">${item.squadra}</span>
            <span class="sq-commessa">· ${item.commessa}</span>
          </div>
          <div class="sq-cantiere">📍 ${item.cantiere}</div>
          <div class="sq-ops">👷 ${item.operatori.join(' · ')}</div>
          ${warnHtml}${moveHtml}
        </div>`;
      }).join('');
    }
  }
}

/* Ricerca manuale per luogo non trovato */
async function pwMapFixLuogo(inp) {
  const query = inp.value.trim();
  const original = inp.dataset.original;
  if (!query || !original) return;
  const key = original.toLowerCase().trim().replace(/\s+/g, ' ');
  inp.disabled = true; inp.value = 'Ricerca…';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'StaffingDashboard/1.0' } });
    const data = await res.json();
    if (data && data.length > 0) {
      _geoCache[key] = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
      await _geoCacheSave();
      pwMapRender(_mapDay);
    } else {
      inp.disabled = false; inp.value = ''; inp.style.borderColor = '#ef4444';
      inp.placeholder = 'Non trovato, riprova…';
    }
  } catch(e) { inp.disabled = false; inp.placeholder = 'Errore rete'; }
}

