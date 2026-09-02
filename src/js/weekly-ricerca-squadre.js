/* ==================== RICERCA SQUADRE (GEO + SKILL MATCHING) ==================== */
/* Tab "Ricerca Squadre" della Pianificazione settimanale: propone squadre per nuovi
   cantieri in base a distanza geografica, disponibilità settimanale, e skill matching.
   - Geocodifica via Nominatim (riusa la cache di Mappa squadre)
   - Calcola distanze medie con OSRM
   - Ranking: distanza (primaria) + disponibilità + skill/strumento matching
   - NO persistenza Supabase: stato locale in RAM (sessione) */

let _ricercaSquadre = {
  anno: null,
  week: null,
  tappe: [],
  risultati: {}
};
let _ricercaSquadreMap = null;

/* ---------- utility ---------- */
function _rsStatus(msg, isError) {
  const el = document.getElementById('rs-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'text-xs mt-2 ' + (isError ? 'text-rose-600 font-medium' : 'text-slate-500');
}

function _rsKm(metri) {
  if (metri == null || isNaN(metri)) return '—';
  return (metri / 1000).toFixed(1).replace('.', ',') + ' km';
}

function _rsDur(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

/* ---------- geocodifica tappe ---------- */
async function rsAddTappa() {
  const nomeEl = document.getElementById('rs-tappa-nome');
  const skillEl = document.getElementById('rs-tappa-skills');
  const strumentiEl = document.getElementById('rs-tappa-strumenti');
  if (!nomeEl) return;
  const nome = nomeEl.value.trim();
  if (!nome) {
    showAlertModal('Inserisci il nome di un comune.');
    return;
  }
  _rsStatus('Geocodifica in corso…');
  const geo = await geocodifica(nome);
  _rsStatus('');
  if (!geo) {
    showAlertModal('Comune non trovato. Prova con un nome diverso.');
    return;
  }
  const skills = (skillEl.value || '').split(',').map(s => s.trim()).filter(s => s);
  const strumenti = (strumentiEl.value || '').split(',').map(s => s.trim()).filter(s => s);
  _ricercaSquadre.tappe.push({ nome, lat: geo.lat, lng: geo.lng, skills, strumenti });
  nomeEl.value = '';
  skillEl.value = '';
  strumentiEl.value = '';
  rsRenderTappe();
}

function rsRemoveTappa(idx) {
  _ricercaSquadre.tappe.splice(idx, 1);
  rsRenderTappe();
}

function rsRenderTappe() {
  const container = document.getElementById('rs-tappe-list');
  if (!container) return;
  if (_ricercaSquadre.tappe.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 italic">Nessuna tappa aggiunta.</div>';
    return;
  }
  container.innerHTML = _ricercaSquadre.tappe.map((t, i) => `
    <div class="bg-slate-50 border border-slate-200 rounded p-2 mb-2 text-xs">
      <div class="flex justify-between items-start mb-1">
        <div class="font-medium text-slate-700">${esc(t.nome)}</div>
        <button onclick="rsRemoveTappa(${i})"
          class="text-rose-500 hover:text-rose-700 font-bold">×</button>
      </div>
      <div class="text-slate-500 mb-1">${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}</div>
      ${t.skills.length > 0 ? `<div class="text-slate-600">Skills: ${esc(t.skills.join(', '))}</div>` : ''}
      ${t.strumenti.length > 0 ? `<div class="text-slate-600">Strumenti: ${esc(t.strumenti.join(', '))}</div>` : ''}
    </div>
  `).join('');
}

/* ---------- ricerca e ranking ---------- */
/* Calcola la distanza media fra un punto e una lista di punti via OSRM */
async function _rsCalcDistMedia(puntoDiPartenza, tappe) {
  if (!tappe || tappe.length === 0) return 0;
  const punti = [puntoDiPartenza, ...tappe];
  try {
    const url = 'https://router.project-osrm.org/table/v1/driving/' +
      punti.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';') +
      '?annotations=distance';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.code !== 'Ok' || !data.distances) throw new Error('Risposta non valida');
    const dist = data.distances[0]; // distanze dal punto 0 agli altri
    let somma = 0;
    for (let i = 1; i < dist.length; i++) somma += dist[i];
    return tappe.length > 0 ? somma / tappe.length : 0;
  } catch (e) {
    console.warn('Errore OSRM:', e);
    return null; // null = errore di calcolo
  }
}

/* Estrae skills unici dal pool operatori */
function _rsGetSkillsPool() {
  const skills = new Set();
  (state.operatori || []).forEach(op => {
    (op.skills || []).forEach(s => skills.add(s));
  });
  return Array.from(skills).sort();
}

/* Ricerca squadre disponibili per la settimana */
async function rsCalcola() {
  if (_ricercaSquadre.tappe.length === 0) {
    showAlertModal('Aggiungi almeno una tappa.');
    return;
  }
  _ricercaSquadre.anno = pwAnno;
  _ricercaSquadre.week = pwWeek;
  _ricercaSquadre.risultati = {};
  _rsStatus('Calcolo ranking squadre…');
  const weekData = pwGetWeekData();
  const ferie = pwFerie[pwAnno] && pwFerie[pwAnno][pwWeek] ? pwFerie[pwAnno][pwWeek] : [];
  const dw = pwDw[pwAnno] && pwDw[pwAnno][pwWeek] ? pwDw[pwAnno][pwWeek] : [];

  /* Raccoglie tutte le squadre della settimana con i loro operatori */
  const squadreMap = {};
  weekData.forEach(bc => {
    (bc.squadre || []).forEach((sq, sqIdx) => {
      const key = (bc.commessa || 'unknown') + '_' + sqIdx;
      if (!squadreMap[key]) {
        squadreMap[key] = {
          commessa: bc.commessa,
          squadra: sq,
          operatori: sq.operatori || []
        };
      }
    });
  });

  /* Per ogni squadra, calcola il ranking */
  const squadreArray = [];
  for (const [key, sqData] of Object.entries(squadreMap)) {
    const sq = sqData.squadra;
    const ops = sqData.operatori;

    /* 1. Calcola distanza media squadra */
    let distMedia = null;
    if (ops.length > 0) {
      const opLocations = ops.map(op => {
        const opPool = (state.operatori || []).find(o => o.nome_esteso === op.nome);
        if (!opPool) return { lat: 42.5, lng: 12.5 }; // fallback Italia centro
        const prov = opPool.provincia || '';
        const provKey = prov.toLowerCase().trim().replace(/\s+/g, ' ');
        const geoCached = _geoCache[provKey];
        if (geoCached) return { lat: geoCached.lat, lng: geoCached.lng };
        return null;
      }).filter(l => l);

      if (opLocations.length > 0) {
        const mediaLat = opLocations.reduce((s, l) => s + l.lat, 0) / opLocations.length;
        const mediaLng = opLocations.reduce((s, l) => s + l.lng, 0) / opLocations.length;
        distMedia = await _rsCalcDistMedia({ lat: mediaLat, lng: mediaLng }, _ricercaSquadre.tappe);
      }
    }

    /* 2. Conta giorni disponibili */
    let giorniDisponibili = 6;
    const opIndices = [];
    ops.forEach((op, idx) => {
      const opPoolIdx = (state.operatori || []).findIndex(o => o.nome_esteso === op.nome);
      if (opPoolIdx >= 0) opIndices.push(opPoolIdx);
    });
    for (let g = 0; g < 6; g++) {
      for (const opIdx of opIndices) {
        if (ferie[opIdx] && ferie[opIdx][g]) { giorniDisponibili--; break; }
        if (dw[opIdx] && dw[opIdx][g]) { giorniDisponibili--; break; }
      }
    }

    /* 3. Skill matching */
    const skillsRichieste = Array.from(new Set(_ricercaSquadre.tappe.flatMap(t => t.skills)));
    const skillsDisponibili = new Set();
    ops.forEach(op => {
      const opPool = (state.operatori || []).find(o => o.nome_esteso === op.nome);
      if (opPool) (opPool.skills || []).forEach(s => skillsDisponibili.add(s));
    });
    const skillMatching = {
      richieste: skillsRichieste.length,
      coperte: skillsRichieste.filter(s => skillsDisponibili.has(s)).length,
      pct: skillsRichieste.length > 0 ? Math.round(100 * skillsRichieste.filter(s => skillsDisponibili.has(s)).length / skillsRichieste.length) : 100
    };

    /* 4. Strumento matching */
    const strumentiRichiesti = Array.from(new Set(_ricercaSquadre.tappe.flatMap(t => t.strumenti)));
    const strumentiDisponibili = new Set();
    ops.forEach(op => {
      const opPool = (state.operatori || []).find(o => o.nome_esteso === op.nome);
      if (opPool) (opPool.strumenti || []).forEach(s => strumentiDisponibili.add(s));
    });
    const strumentiMatching = {
      richiesti: strumentiRichiesti.length,
      disponibili: strumentiRichiesti.filter(s => strumentiDisponibili.has(s)).length,
      pct: strumentiRichiesti.length > 0 ? Math.round(100 * strumentiRichiesti.filter(s => strumentiDisponibili.has(s)).length / strumentiRichiesti.length) : 100
    };

    squadreArray.push({
      key,
      commessa: sqData.commessa,
      squadra: sq,
      operatori: ops,
      distMedia: distMedia,
      giorniDisponibili,
      skillMatching,
      strumentiMatching,
      score: (() => {
        if (distMedia === null) return Infinity;
        let s = distMedia / 1000; // distanza in km come base
        s -= giorniDisponibili * 50; // bonus disponibilità (50 km equivalente per giorno)
        s -= skillMatching.pct * 10; // bonus skill (fino a 1000 km)
        s -= strumentiMatching.pct * 5; // bonus strumento (fino a 500 km)
        return s;
      })()
    });
  }

  /* Ordina per score (distanza primaria + bonus) */
  squadreArray.sort((a, b) => a.score - b.score);
  squadreArray.forEach(sq => {
    _ricercaSquadre.risultati[sq.key] = {
      commessa: sq.commessa,
      squadra: sq.squadra,
      operatori: sq.operatori,
      distMedia: sq.distMedia,
      giorniDisponibili: sq.giorniDisponibili,
      skillMatching: sq.skillMatching,
      strumentiMatching: sq.strumentiMatching
    };
  });

  _rsStatus('');
  rsRenderRisultati();
  rsRenderMappa(squadreArray.slice(0, 10)); // mappa dei top 10
}

/* ---------- render risultati ---------- */
function rsRenderRisultati() {
  const container = document.getElementById('rs-risultati');
  if (!container) return;
  const risultati = Object.values(_ricercaSquadre.risultati);
  if (risultati.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 italic text-center py-8">Nessun risultato. Usa il pulsante "Calcola" per avviare la ricerca.</div>';
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:1px solid #cbd5e1;">
            <th style="padding:8px;text-align:left;font-weight:600;color:#334155;">Commessa</th>
            <th style="padding:8px;text-align:left;font-weight:600;color:#334155;">Squadra</th>
            <th style="padding:8px;text-align:right;font-weight:600;color:#334155;">Dist. media</th>
            <th style="padding:8px;text-align:center;font-weight:600;color:#334155;">Giorni</th>
            <th style="padding:8px;text-align:center;font-weight:600;color:#334155;">Skills</th>
            <th style="padding:8px;text-align:center;font-weight:600;color:#334155;">Strumenti</th>
          </tr>
        </thead>
        <tbody>
          ${risultati.map((r, i) => `
            <tr style="border-bottom:1px solid #e2e8f0;${i % 2 === 0 ? 'background:#f8fafc;' : ''}">
              <td style="padding:8px;color:#334155;">${esc(r.commessa || '—')}</td>
              <td style="padding:8px;color:#334155;">${esc(r.squadra.nome || 'Squadra senza nome')}</td>
              <td style="padding:8px;text-align:right;color:#334155;">
                ${r.distMedia === null ? '❌' : _rsKm(r.distMedia)}
              </td>
              <td style="padding:8px;text-align:center;color:#334155;">
                <span style="background:#teal;color:white;padding:2px 6px;border-radius:3px;display:inline-block;">
                  ${r.giorniDisponibili}/6
                </span>
              </td>
              <td style="padding:8px;text-align:center;color:#334155;">
                <span style="background:${r.skillMatching.pct === 100 ? '#10b981' : r.skillMatching.pct >= 50 ? '#f59e0b' : '#ef4444'};color:white;padding:2px 6px;border-radius:3px;display:inline-block;font-weight:600;">
                  ${r.skillMatching.coperte}/${r.skillMatching.richieste} (${r.skillMatching.pct}%)
                </span>
              </td>
              <td style="padding:8px;text-align:center;color:#334155;">
                <span style="background:${r.strumentiMatching.pct === 100 ? '#10b981' : r.strumentiMatching.pct >= 50 ? '#f59e0b' : '#ef4444'};color:white;padding:2px 6px;border-radius:3px;display:inline-block;font-weight:600;">
                  ${r.strumentiMatching.disponibili}/${r.strumentiMatching.richiesti} (${r.strumentiMatching.pct}%)
                </span>
              </td>
            </tr>
            <tr style="background:#f0fdf4;display:none;" id="rs-detail-${i}">
              <td colspan="6" style="padding:12px;color:#334155;">
                <div class="text-xs mb-2"><strong>Operatori:</strong> ${esc((r.operatori || []).map(o => o.nome).join(', '))}</div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* Mappa mostrante le tappe e i marker delle squadre top */
function rsRenderMappa(topSquadre) {
  const container = document.getElementById('rs-mappa-container');
  if (!container) return;
  container.innerHTML = '<div id="rs-mappa" style="height:400px;width:100%;"></div>';
  setTimeout(() => {
    if (!_ricercaSquadreMap) {
      _ricercaSquadreMap = L.map('rs-mappa').setView([42.5, 12.5], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(_ricercaSquadreMap);
    }
    _ricercaSquadreMap.invalidateSize();
    /* Marker tappe */
    _ricercaSquadre.tappe.forEach((t, i) => {
      L.circleMarker([t.lat, t.lng], {
        radius: 6,
        fillColor: '#0d9488',
        color: '#0f766e',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).bindPopup(`<strong>${esc(t.nome)}</strong><br/>Tappa ${i+1}`).addTo(_ricercaSquadreMap);
    });
    /* Marker squadre top */
    topSquadre.slice(0, 5).forEach((sq, i) => {
      const ops = sq.operatori || [];
      const mediaLat = ops.reduce((s, op) => {
        const opPool = (state.operatori || []).find(o => o.nome_esteso === op.nome);
        return s + (opPool && _geoCache[(opPool.provincia || '').toLowerCase()] ? _geoCache[(opPool.provincia || '').toLowerCase()].lat : 42.5);
      }, 0) / (ops.length || 1);
      const mediaLng = ops.reduce((s, op) => {
        const opPool = (state.operatori || []).find(o => o.nome_esteso === op.nome);
        return s + (opPool && _geoCache[(opPool.provincia || '').toLowerCase()] ? _geoCache[(opPool.provincia || '').toLowerCase()].lng : 12.5);
      }, 0) / (ops.length || 1);
      const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
      L.circleMarker([mediaLat, mediaLng], {
        radius: 5,
        fillColor: colors[i % colors.length],
        color: '#1e293b',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
      }).bindPopup(`<strong>${esc(sq.squadra.nome || 'Squadra')}</strong><br/>${esc(sq.commessa || '—')}`).addTo(_ricercaSquadreMap);
    });
  }, 100);
}

/* ---------- init tab ---------- */
function rsInit() {
  _ricercaSquadre.anno = pwAnno;
  _ricercaSquadre.week = pwWeek;
  rsRenderTappe();
}
