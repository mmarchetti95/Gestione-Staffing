/* ==================== RICERCA SQUADRE (GEO + SKILL MATCHING) ==================== */
/* Tab "Ricerca Squadre" della Pianificazione settimanale: dato uno o più cantieri nuovi
   da coprire, propone le squadre della settimana ordinate per VICINANZA REALE, cioè la
   distanza stradale dal punto in cui la squadra sta già lavorando questa settimana (non
   dalla residenza: a metà settimana conta da dove si sposta, non da dove abita).
   - Geocodifica via Nominatim, riusando la rubrica condivisa _geoCache (weekly-mappa.js)
   - Distanze in UNA sola chiamata OSRM /table (sources=squadre, destinations=tappe),
     con fallback su haversine se OSRM non risponde
   - Disponibilità giorno per giorno: libero / occupato / ferie / doppia week
   - NO persistenza: stato locale in RAM (sessione), come Pianifica spostamenti */

let _ricercaSquadre = {
  anno: null,
  week: null,
  tappe: [],
  risultati: []
};
let _ricercaSquadreMap = null;
let _rsMapLayers = [];
let _rsSelSkills = new Set();
let _rsSelStrumenti = new Set();   // chiavi Jira, non label
let _rsSoloCompatibili = false;
let _rsBound = false;

/* Stati di disponibilità di una squadra in un giorno, con colore e label del chip */
const RS_STATI = {
  libero:   { bg: '#dcfce7', fg: '#15803d', t: 'Libero' },
  occupato: { bg: '#e0e7ff', fg: '#4338ca', t: 'Su cantiere' },
  ferie:    { bg: '#fef3c7', fg: '#b45309', t: 'Ferie / non disponibile' },
  dw:       { bg: '#f3e8ff', fg: '#7e22ce', t: 'Doppia week (fuori sede)' }
};

/* ---------- utility ---------- */
function _rsStatus(msg, isError) {
  const el = document.getElementById('rs-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'text-xs mt-2 ' + (isError ? 'text-rose-600 font-medium' : 'text-slate-500');
}

/* Stessa normalizzazione usata da geocodifica(): le chiavi di _geoCache devono coincidere */
function _rsNorm(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function _rsKm(metri) {
  if (metri == null || isNaN(metri)) return '—';
  const km = metri / 1000;
  if (km < 10) return km.toFixed(1).replace('.', ',') + ' km';
  return Math.round(km) + ' km';
}

function _rsOpPool(nome) {
  return (state.operatori || []).find(o => (o.nome_esteso || o.nome_breve) === nome) || null;
}

/* Primo giorno della settimana (0=Lun) da cui proporre un invio: se la settimana
   mostrata è quella in corso, non ha senso consigliare un giorno già passato (es. lunedì
   se oggi è mercoledì), quindi si parte da oggi. Per una settimana diversa da quella
   attuale (passata o futura) non c'è alcun vincolo: si parte da lunedì (0). */
function _rsStartDay() {
  const oggi = new Date();
  const iso = isoWeekYear(oggi);
  if (iso.year !== pwAnno || iso.week !== pwWeek) return 0;
  return (oggi.getDay() + 6) % 7; // Lun=0 … Dom=6
}

/* ---------- raccolta dati della settimana ---------- */
/* Una voce per squadra della settimana, con i cantieri giorno per giorno, le skill
   dei suoi operatori e gli strumenti Jira assegnati. */
function _rsBuildSquadre() {
  const out = [];
  pwGetWeekData().forEach(bc => {
    (bc.squadre || []).forEach((sq, si) => {
      const ops = (sq.operatori || []).filter(o => o.nome && o.nome.trim());
      if (!ops.length) return;
      const nomi = ops.map(o => o.nome.trim());

      const cantieriByDay = {};
      const cantieriSet = new Set();
      for (let d = 0; d < 6; d++) {
        const giorno = new Set();
        ops.forEach(op => {
          pwCellCantieri((op.giorni || {})[d]).forEach(c => { giorno.add(c); cantieriSet.add(c); });
        });
        cantieriByDay[d] = Array.from(giorno);
      }

      const skills = new Set();
      nomi.forEach(n => {
        const p = _rsOpPool(n);
        if (p) (p.skills || []).forEach(s => skills.add(s));
      });

      out.push({
        key: (bc.commessa || '?') + '§' + si,
        commessa: bc.commessa || '—',
        nome: sq.nome || 'Squadra',
        operatori: nomi,
        cantieriByDay,
        cantieri: Array.from(cantieriSet),
        strumenti: pwSqStrumentiJira(sq).filter(Boolean),
        skills
      });
    });
  });
  return out;
}

/* True se la squadra è coinvolta in un blocco doppia week che tocca questa settimana
   (iniziato ora, oppure la settimana scorsa e quindi ancora in corso). */
function _rsInDoppiaWeek(sq) {
  const prev = pwWeekAdd(pwAnno, pwWeek, -1);
  return sq.operatori.some(n =>
    pwIsDwStart(pwAnno, pwWeek, n) || pwIsDwStart(prev.anno, prev.week, n));
}

/* Giorni da considerare per una squadra: il sabato è un giorno lavorativo solo in
   doppia week (trasferta lunga). Per le altre squadre mostrarlo come "libero" sarebbe
   fuorviante — non ci si va comunque. Resta però visibile se in Griglia c'è davvero
   del lavoro programmato di sabato, per non nascondere dati reali. */
function _rsNumGiorni(sq) {
  if ((sq.cantieriByDay[5] || []).length) return 6;
  return _rsInDoppiaWeek(sq) ? 6 : 5;
}

/* Stato giorno per giorno. La doppia week copre la settimana di inizio (fuori tutta
   la settimana) e la successiva (rientro giovedì): vedi pwSetDwStart/pwIsDwStart. */
function _rsDisponibilita(sq) {
  const prev = pwWeekAdd(pwAnno, pwWeek, -1);
  const ferieWk = (pwFerie[pwAnno] && pwFerie[pwAnno][pwWeek]) || {};
  const stati = [];
  const nGiorni = _rsNumGiorni(sq);
  for (let d = 0; d < nGiorni; d++) {
    let away = false;
    let inFerie = 0;
    sq.operatori.forEach(n => {
      if (pwIsDwStart(pwAnno, pwWeek, n)) away = true;
      else if (pwIsDwStart(prev.anno, prev.week, n) && d <= 2) away = true;
      const wk = ferieWk[n];
      if (wk && pwFerieTipo(wk[d])) inFerie++;
    });
    if (away) stati.push('dw');
    else if (inFerie >= sq.operatori.length) stati.push('ferie');
    else if ((sq.cantieriByDay[d] || []).length) stati.push('occupato');
    else stati.push('libero');
  }
  return stati;
}

/* Giorno in cui conviene mandare la squadra, dedotto dalla programmazione della
   Griglia: si individua il giorno lavorato in cui la squadra è più vicina in assoluto
   ai comuni del giro (min su tutti i cantieri della settimana, non solo quelli
   adiacenti a un giorno libero), poi fra i giorni liberi utili (da `startDay` in poi,
   per non consigliare un giorno già passato) si sceglie quello cronologicamente più
   vicino a quel giorno di riferimento — prima o dopo, a parità vince il più presto.
   `distByLuogo` mappa un nome cantiere normalizzato sulla sua distanza minima da una
   tappa. Se la squadra non ha nessun cantiere in settimana non c'è alcun riferimento
   geografico da cui dedurre un giorno migliore di un altro: si propone semplicemente
   il primo giorno libero utile. */
function _rsGiornoConsigliato(sq, stati, distByLuogo, startDay) {
  const nGiorni = stati.length;
  const liberi = [];
  for (let d = Math.max(0, startDay || 0); d < nGiorni; d++) if (stati[d] === 'libero') liberi.push(d);
  if (!liberi.length) return null;

  /* Distanza minima dalla tappa per ciascun giorno lavorato: in un giorno la squadra
     può stare su più cantieri, tiene quello da cui partirebbe davvero lo spostamento. */
  const giornoDist = {};
  for (let d = 0; d < nGiorni; d++) {
    let min = null, tappa = null, luogo = null;
    (sq.cantieriByDay[d] || []).forEach(c => {
      const e = distByLuogo[_rsNorm(c)];
      if (e && (min == null || e.dist < min)) { min = e.dist; tappa = e.tappa; luogo = c; }
    });
    if (min != null) giornoDist[d] = { dist: min, tappa, luogo };
  }

  const giorniRif = Object.keys(giornoDist).map(Number);
  let best;
  if (!giorniRif.length) {
    best = { giorno: liberi[0], dist: null, tappa: null, rifGiorno: null, rifCantiere: null };
  } else {
    const refGiorno = giorniRif.reduce((b, d) => giornoDist[d].dist < giornoDist[b].dist ? d : b, giorniRif[0]);
    const info = giornoDist[refGiorno];
    let scelto = liberi[0], gap = Math.abs(liberi[0] - refGiorno);
    liberi.forEach(d => {
      const g = Math.abs(d - refGiorno);
      if (g < gap) { gap = g; scelto = d; }
    });
    best = { giorno: scelto, dist: info.dist, tappa: info.tappa, rifGiorno: refGiorno, rifCantiere: info.luogo };
  }

  let run = 0;
  for (let d = best.giorno; d < nGiorni && stati[d] === 'libero'; d++) run++;
  best.consecutivi = run;
  return best;
}

/* ---------- skill / strumenti disponibili nella settimana ---------- */
function _rsGetSkillsWeek() {
  const skills = new Set();
  _rsBuildSquadre().forEach(sq => sq.skills.forEach(s => skills.add(s)));
  return Array.from(skills).sort();
}

function _rsGetStrumentiWeek() {
  const keys = new Set();
  _rsBuildSquadre().forEach(sq => sq.strumenti.forEach(k => keys.add(k)));
  return Array.from(keys)
    .map(key => ({ key, label: pwStrLabel(key) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ---------- dropdown selettori ----------
   La lista viene costruita SOLO all'apertura e mai ricostruita mentre è aperta: la
   selezione vive nei Set _rsSelSkills/_rsSelStrumenti e il toggle di una checkbox
   aggiorna il Set e la sola label del bottone. Ricostruire l'HTML dentro l'onchange
   (come faceva la versione precedente) rimescolava il DOM sotto il cursore. */
function _rsCloseDropdowns(except) {
  ['rs-skills-dropdown', 'rs-strumenti-dropdown'].forEach(id => {
    if (id === except) return;
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function rsToggleSkillsDropdown() {
  const dd = document.getElementById('rs-skills-dropdown');
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  _rsCloseDropdowns('rs-skills-dropdown');
  if (!opening) { dd.classList.add('hidden'); return; }
  rsRenderSkillsDropdown();
  dd.classList.remove('hidden');
  const s = document.getElementById('rs-skills-search');
  if (s) { s.value = ''; rsFilterSkills(''); s.focus(); }
}

function rsToggleStrumentiDropdown() {
  const dd = document.getElementById('rs-strumenti-dropdown');
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  _rsCloseDropdowns('rs-strumenti-dropdown');
  if (!opening) { dd.classList.add('hidden'); return; }
  rsRenderStrumentiDropdown();
  dd.classList.remove('hidden');
  const s = document.getElementById('rs-strumenti-search');
  if (s) { s.value = ''; rsFilterStrumenti(''); s.focus(); }
}

/* Nasconde/mostra le righe non corrispondenti. Va rimesso esplicitamente 'flex'
   (non ''): svuotare la proprietà cancellerebbe il display:flex inline della riga,
   che tornerebbe 'inline' impilando le voci in orizzontale invece che una per riga. */
function _rsFilterList(containerId, val) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const q = (val || '').toLowerCase();
  container.querySelectorAll('label[data-val]').forEach(item => {
    item.style.display = item.getAttribute('data-val').toLowerCase().includes(q) ? 'flex' : 'none';
  });
}

function rsFilterSkills(val) { _rsFilterList('rs-skills-list', val); }
function rsFilterStrumenti(val) { _rsFilterList('rs-strumenti-list', val); }

function _rsOptionRowHtml(value, label, checked) {
  const vAttr = esc(value);
  const mark = checked ? ' checked' : '';
  return '<label data-val="' + vAttr + '" title="' + esc(label) + '" ' +
    'style="display:flex;align-items:center;gap:7px;width:100%;padding:6px 9px;cursor:pointer;' +
    'font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;box-sizing:border-box;">' +
    '<input type="checkbox" data-val="' + vAttr + '"' + mark + ' style="flex:none;margin:0;">' +
    '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
    esc(label) + '</span></label>';
}

function rsRenderSkillsDropdown() {
  const container = document.getElementById('rs-skills-list');
  if (!container) return;
  const disponibili = _rsGetSkillsWeek();
  if (!disponibili.length) {
    container.innerHTML = '<div style="padding:8px;font-size:11px;color:#94a3b8;">Nessuna skill fra gli operatori di questa settimana.</div>';
    return;
  }
  container.innerHTML = disponibili
    .map(s => _rsOptionRowHtml(s, s, _rsSelSkills.has(s)))
    .join('');
  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      const v = cb.dataset.val;
      if (cb.checked) _rsSelSkills.add(v); else _rsSelSkills.delete(v);
      _rsUpdateSkillsLabel();
    };
  });
}

function rsRenderStrumentiDropdown() {
  const container = document.getElementById('rs-strumenti-list');
  if (!container) return;
  const disponibili = _rsGetStrumentiWeek();
  if (!disponibili.length) {
    container.innerHTML = '<div style="padding:8px;font-size:11px;color:#94a3b8;">Nessuno strumento assegnato alle squadre di questa settimana.</div>';
    return;
  }
  container.innerHTML = disponibili
    .map(s => _rsOptionRowHtml(s.key, s.label, _rsSelStrumenti.has(s.key)))
    .join('');
  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = () => {
      const v = cb.dataset.val;
      if (cb.checked) _rsSelStrumenti.add(v); else _rsSelStrumenti.delete(v);
      _rsUpdateStrumentiLabel();
    };
  });
}

function _rsUpdateSkillsLabel() {
  const label = document.getElementById('rs-skills-label');
  if (!label) return;
  const n = _rsSelSkills.size;
  label.textContent = n ? n + (n === 1 ? ' skill selezionata' : ' skill selezionate') : 'Seleziona skills…';
  label.style.color = n ? '#0f172a' : '#64748b';
}

function _rsUpdateStrumentiLabel() {
  const label = document.getElementById('rs-strumenti-label');
  if (!label) return;
  const n = _rsSelStrumenti.size;
  label.textContent = n ? n + (n === 1 ? ' strumento selezionato' : ' strumenti selezionati') : 'Seleziona strumenti…';
  label.style.color = n ? '#0f172a' : '#64748b';
}

/* ---------- tappe ---------- */
async function rsAddTappa() {
  const nomeEl = document.getElementById('rs-tappa-nome');
  if (!nomeEl) return;
  const nome = nomeEl.value.trim();
  if (!nome) {
    showAlertModal('Inserisci il nome di un comune/cantiere oppure coordinate "lat, lng".');
    return;
  }
  /* "lat, lng" (o "lat lng"/"lat;lng") va trattato come coordinate dirette,
     senza passare da Nominatim: stessa logica di pwMapParseCoords (Mappa Squadre) */
  const coords = pwMapParseCoords(nome);
  let geo;
  if (coords) {
    geo = coords;
  } else {
    _rsStatus('Localizzo "' + nome + '"…');
    geo = await geocodifica(nome);
    _rsStatus('');
    if (!geo) {
      showAlertModal('Località "' + nome + '" non trovata. Prova con un nome diverso (es. "Comune (PROV)") oppure con coordinate "lat, lng".');
      return;
    }
  }
  _ricercaSquadre.tappe.push({
    nome,
    lat: geo.lat,
    lng: geo.lng,
    skills: Array.from(_rsSelSkills),
    strumenti: Array.from(_rsSelStrumenti)
  });
  nomeEl.value = '';
  _rsSelSkills.clear();
  _rsSelStrumenti.clear();
  _rsUpdateSkillsLabel();
  _rsUpdateStrumentiLabel();
  _rsCloseDropdowns(null);
  rsRenderTappe();
}

function rsRemoveTappa(idx) {
  _ricercaSquadre.tappe.splice(idx, 1);
  rsRenderTappe();
}

function rsPulisci() {
  _ricercaSquadre.tappe = [];
  _ricercaSquadre.risultati = [];
  _rsSelSkills.clear();
  _rsSelStrumenti.clear();
  _rsUpdateSkillsLabel();
  _rsUpdateStrumentiLabel();
  rsRenderTappe();
  rsRenderRisultati();
  rsRenderMappa();
  _rsStatus('');
}

function rsRenderTappe() {
  const container = document.getElementById('rs-tappe-list');
  if (!container) return;
  if (!_ricercaSquadre.tappe.length) {
    container.innerHTML = '<div class="text-xs text-slate-400 italic">Nessuna tappa aggiunta.</div>';
    _rsSyncAltezze();
    return;
  }
  container.innerHTML = _ricercaSquadre.tappe.map((t, i) => {
    const skillsLine = t.skills.length
      ? '<div style="color:#475569;margin-top:2px;">🎓 ' + esc(t.skills.join(', ')) + '</div>' : '';
    const strLine = t.strumenti.length
      ? '<div style="color:#0d9488;margin-top:2px;">🔧 ' + esc(t.strumenti.map(k => pwStrLabel(k)).join(', ')) + '</div>' : '';
    return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-bottom:6px;font-size:11px;">' +
      '<div style="display:flex;justify-content:space-between;gap:6px;">' +
        '<span style="font-weight:600;color:#0f172a;">📍 ' + esc(t.nome) + '</span>' +
        '<button type="button" data-rm="' + i + '" style="color:#f43f5e;font-weight:700;background:none;border:none;cursor:pointer;line-height:1;">×</button>' +
      '</div>' + skillsLine + strLine + '</div>';
  }).join('');
  container.querySelectorAll('button[data-rm]').forEach(b => {
    b.onclick = () => rsRemoveTappa(parseInt(b.dataset.rm, 10));
  });
  /* Aggiungere o togliere tappe cambia l'altezza del pannello: riallinea i risultati */
  _rsSyncAltezze();
}

/* ---------- distanze ---------- */
/* Geocodifica i nomi non ancora in rubrica, rispettando il rate limit di Nominatim
   solo quando serve davvero una chiamata di rete (i nomi già in cache non aspettano). */
async function _rsGeocodeMancanti(nomi) {
  const daFare = nomi.filter(n => !(_rsNorm(n) in _geoCache));
  for (let i = 0; i < daFare.length; i++) {
    _rsStatus('Localizzo cantieri… (' + (i + 1) + '/' + daFare.length + ') ' + daFare[i]);
    await geocodifica(daFare[i]);
    await new Promise(r => setTimeout(r, 300));
  }
}

/* Matrice distanze origini × tappe in metri. Una sola chiamata OSRM /table con
   sources/destinations; se fallisce (o è troppo grande) ripiega su haversine, che è
   sempre meglio di un "—": l'ordine per vicinanza resta sostanzialmente lo stesso. */
async function _rsMatriceDistanze(origini, tappe) {
  const n = origini.length, m = tappe.length;
  const haversineMatrix = () => origini.map(o => tappe.map(t => haversineKm(o.lat, o.lng, t.lat, t.lng) * 1000));
  if (!n || !m) return [];
  if (n + m > 90) return haversineMatrix();
  try {
    const punti = origini.concat(tappe);
    const url = 'https://router.project-osrm.org/table/v1/driving/' +
      punti.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';') +
      '?annotations=distance' +
      '&sources=' + origini.map((_, i) => i).join(';') +
      '&destinations=' + tappe.map((_, j) => n + j).join(';');
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.code !== 'Ok' || !Array.isArray(data.distances)) throw new Error('risposta non valida');
    return data.distances.map((row, i) => row.map((v, j) =>
      (v == null ? haversineKm(origini[i].lat, origini[i].lng, tappe[j].lat, tappe[j].lng) * 1000 : v)));
  } catch (e) {
    console.warn('OSRM non disponibile, uso distanze in linea d\'aria:', e);
    return haversineMatrix();
  }
}

/* ---------- calcolo ---------- */
async function rsCalcola() {
  if (!_ricercaSquadre.tappe.length) {
    showAlertModal('Aggiungi almeno una tappa da coprire.');
    return;
  }
  const btn = document.getElementById('rs-calcola-btn');
  if (btn) btn.disabled = true;

  try {
    _ricercaSquadre.anno = pwAnno;
    _ricercaSquadre.week = pwWeek;
    const squadre = _rsBuildSquadre();
    if (!squadre.length) {
      _ricercaSquadre.risultati = [];
      _rsStatus('Nessuna squadra pianificata in questa settimana.', true);
      rsRenderRisultati();
      rsRenderMappa();
      return;
    }

    /* Localizza i cantieri già pianificati: sono le origini degli spostamenti */
    const tuttiCantieri = Array.from(new Set(squadre.flatMap(s => s.cantieri)));
    await _rsGeocodeMancanti(tuttiCantieri);

    /* Un punto di origine per ogni cantiere della squadra. Una squadra senza nessun
       cantiere in settimana non ha un punto di partenza reale: non si ripiega più
       sulla residenza degli operatori, perché una settimana "tutta libera" quasi
       sempre significa che la squadra semplicemente non risulta pianificata (dati
       mancanti), non che sia davvero disponibile — usare la residenza le avrebbe
       dato una priorità ingiustificata solo perché abitano vicino alla tappa. */
    const origini = [];
    squadre.forEach((sq, si) => {
      sq.cantieri.forEach(c => {
        const g = _geoCache[_rsNorm(c)];
        if (g && g.lat != null) origini.push({ si, label: c, lat: g.lat, lng: g.lng });
      });
    });

    _rsStatus('Calcolo distanze stradali…');
    const matrice = await _rsMatriceDistanze(origini, _ricercaSquadre.tappe);

    /* Distanza minima di ogni luogo già programmato da una delle tappe: serve a
       valutare da quale giorno della Griglia conviene far partire lo spostamento. */
    const distByLuogo = {};
    origini.forEach((o, oi) => {
      const k = _rsNorm(o.label);
      (matrice[oi] || []).forEach((dist, ti) => {
        if (dist == null || isNaN(dist)) return;
        if (!distByLuogo[k] || dist < distByLuogo[k].dist) {
          distByLuogo[k] = { dist, tappa: _ricercaSquadre.tappe[ti].nome };
        }
      });
    });

    /* Requisiti: unione di quanto richiesto su tutte le tappe */
    const skillsRichieste = Array.from(new Set(_ricercaSquadre.tappe.flatMap(t => t.skills)));
    const strumentiRichiesti = Array.from(new Set(_ricercaSquadre.tappe.flatMap(t => t.strumenti)));
    const startDay = _rsStartDay();

    const risultati = squadre.map((sq, si) => {
      /* Origine migliore = il punto della squadra più vicino a una delle tappe */
      let best = null;
      origini.forEach((o, oi) => {
        if (o.si !== si) return;
        (matrice[oi] || []).forEach((dist, ti) => {
          if (dist == null || isNaN(dist)) return;
          if (!best || dist < best.dist) {
            best = { dist, origine: o.label, tappa: _ricercaSquadre.tappe[ti].nome };
          }
        });
      });

      const skillsCoperte = skillsRichieste.filter(s => sq.skills.has(s));
      const strCoperti = strumentiRichiesti.filter(k => sq.strumenti.includes(k));
      const stati = _rsDisponibilita(sq);

      return {
        sq,
        stati,
        consiglio: _rsGiornoConsigliato(sq, stati, distByLuogo, startDay),
        dist: best ? best.dist : null,
        origine: best ? best.origine : null,
        tappaVicina: best ? best.tappa : null,
        skills: {
          richieste: skillsRichieste.length,
          coperte: skillsCoperte.length,
          mancanti: skillsRichieste.filter(s => !sq.skills.has(s))
        },
        strumenti: {
          richiesti: strumentiRichiesti.length,
          coperti: strCoperti.length,
          mancanti: strumentiRichiesti.filter(k => !sq.strumenti.includes(k))
        }
      };
    });

    /* Ordinamento: la vicinanza è il criterio, punto. Skill e strumenti restano
       visibili come badge (ed eventualmente filtrano), senza bonus opachi che
       ribaltavano l'ordine rendendolo incomprensibile. */
    risultati.sort((a, b) => {
      if (a.dist == null && b.dist == null) return 0;
      if (a.dist == null) return 1;
      if (b.dist == null) return -1;
      return a.dist - b.dist;
    });

    _ricercaSquadre.risultati = risultati;
    _rsStatus(risultati.length + ' squadre valutate.');
    rsRenderRisultati();
    rsRenderMappa();
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- render risultati ---------- */
function _rsChipsHtml(stati, consigliato) {
  return '<div style="display:flex;gap:2px;">' + stati.map((s, d) => {
    const c = RS_STATI[s];
    const isCons = consigliato != null && d === consigliato;
    const ring = isCons ? ';outline:2px solid #0d9488;outline-offset:1px' : '';
    const tip = PW_MAP_DAY_SHORT[d] + ': ' + c.t + (isCons ? ' — consigliato' : '');
    return '<span title="' + esc(tip) + '" style="background:' + c.bg + ';color:' + c.fg +
      ';font-size:9px;font-weight:700;padding:2px 4px;border-radius:3px;line-height:1.2' + ring + ';">' +
      PW_MAP_DAY_SHORT[d] + '</span>';
  }).join('') + '</div>';
}

/* "Mer–Ven · dopo Prato (Mar) · 18 km" — il quando, con il perché */
function _rsConsiglioHtml(r) {
  const c = r.consiglio;
  if (!c) {
    return '<span style="color:#94a3b8;font-size:11px;font-style:italic;">nessun giorno libero</span>';
  }
  const fine = c.giorno + c.consecutivi - 1;
  const label = c.consecutivi > 1
    ? PW_MAP_DAY_SHORT[c.giorno] + '–' + PW_MAP_DAY_SHORT[fine]
    : PW_MAP_DAY_SHORT[c.giorno];

  let motivo;
  if (c.rifCantiere != null) {
    const prep = c.rifGiorno <= c.giorno ? 'dopo ' : 'prima di ';
    motivo = prep + esc(c.rifCantiere) + ' (' + PW_MAP_DAY_SHORT[c.rifGiorno] + ')' +
      (c.dist != null ? ' · ' + _rsKm(c.dist) : '');
  } else {
    motivo = 'settimana libera';
  }

  return '<div style="font-weight:700;color:#0f172a;font-size:12px;">📅 ' + label + '</div>' +
    '<div style="font-size:10px;color:#64748b;">' + motivo + '</div>' +
    (c.consecutivi > 1 ? '<div style="font-size:10px;color:#15803d;font-weight:600;">' +
      c.consecutivi + ' gg consecutivi</div>' : '');
}

function _rsBadgeHtml(coperti, richiesti, mancanti, icona, cosa) {
  if (!richiesti) return '<span title="Nessun ' + esc(cosa) + ' richiesto" style="color:#cbd5e1;font-size:11px;">' + icona + '—</span>';
  const pct = Math.round(100 * coperti / richiesti);
  const bg = pct === 100 ? '#10b981' : (pct > 0 ? '#f59e0b' : '#ef4444');
  const tip = mancanti.length
    ? 'Mancano: ' + mancanti.join(', ')
    : 'Copre tutti i ' + cosa + ' richiesti';
  return '<span title="' + esc(tip) + '" style="background:' + bg + ';color:white;padding:2px 5px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap;">' +
    icona + ' ' + coperti + '/' + richiesti + '</span>';
}

/* Cantieri della squadra con i giorni in cui ci sta: "Prato (Lun·Mar)" */
function _rsSitiHtml(sq) {
  const byCantiere = {};
  const nGiorni = _rsNumGiorni(sq);
  for (let d = 0; d < nGiorni; d++) {
    (sq.cantieriByDay[d] || []).forEach(c => {
      if (!byCantiere[c]) byCantiere[c] = [];
      byCantiere[c].push(PW_MAP_DAY_SHORT[d]);
    });
  }
  const nomi = Object.keys(byCantiere);
  if (!nomi.length) return '<span style="color:#94a3b8;font-style:italic;font-size:11px;">nessun cantiere</span>';
  return nomi.map(c =>
    '<div style="font-size:11px;color:#0f172a;">📍 ' + esc(c) +
    ' <span style="color:#94a3b8;">(' + esc(byCantiere[c].join('·')) + ')</span></div>'
  ).join('');
}

function rsRenderRisultati() {
  _rsRenderRisultatiBody();
  _rsSyncAltezze();
}

function _rsRenderRisultatiBody() {
  const container = document.getElementById('rs-risultati');
  if (!container) return;

  let risultati = _ricercaSquadre.risultati || [];
  if (!risultati.length) {
    container.innerHTML = '<div class="text-xs text-slate-400 italic text-center py-8">Aggiungi almeno una tappa e clicca "Calcola ranking".</div>';
    return;
  }
  if (_rsSoloCompatibili) {
    risultati = risultati.filter(r =>
      r.skills.coperte === r.skills.richieste && r.strumenti.coperti === r.strumenti.richiesti);
  }
  if (!risultati.length) {
    container.innerHTML = '<div class="text-xs text-amber-600 italic text-center py-8">Nessuna squadra copre tutti i requisiti. Togli il filtro per vedere le più vicine.</div>';
    return;
  }

  const righe = risultati.map((r, i) => {
    const distHtml = r.dist == null
      ? '<span style="color:#cbd5e1;">—</span>'
      : '<div style="font-weight:700;color:#0f172a;font-size:13px;">' + _rsKm(r.dist) + '</div>' +
        '<div style="font-size:10px;color:#64748b;">da ' + esc(r.origine || '') + '</div>' +
        (_ricercaSquadre.tappe.length > 1 ? '<div style="font-size:10px;color:#94a3b8;">→ ' + esc(r.tappaVicina || '') + '</div>' : '');

    const rank = i === 0
      ? '<span style="background:#0d9488;color:white;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;">1</span>'
      : '<span style="color:#94a3b8;font-size:11px;font-weight:600;">' + (i + 1) + '</span>';

    return '<tr style="border-bottom:1px solid #e2e8f0;' + (i % 2 ? '' : 'background:#f8fafc;') + '">' +
      '<td style="padding:8px 6px;text-align:center;vertical-align:top;">' + rank + '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;">' +
        '<div style="font-weight:700;color:#0f172a;font-size:12px;">' + esc(r.sq.nome) + '</div>' +
        '<div style="font-size:10px;color:#94a3b8;">' + esc(r.sq.commessa) + '</div>' +
      '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;font-size:11px;color:#334155;">👷 ' +
        esc(r.sq.operatori.join(' · ')) + '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;">' + _rsSitiHtml(r.sq) + '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;text-align:right;">' + distHtml + '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;">' + _rsConsiglioHtml(r) + '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;">' +
        _rsChipsHtml(r.stati, r.consiglio ? r.consiglio.giorno : null) + '</td>' +
      '<td style="padding:8px 6px;vertical-align:top;text-align:center;white-space:nowrap;">' +
        _rsBadgeHtml(r.skills.coperte, r.skills.richieste, r.skills.mancanti, '🎓', 'skill') + ' ' +
        _rsBadgeHtml(r.strumenti.coperti, r.strumenti.richiesti,
          r.strumenti.mancanti.map(k => pwStrLabel(k)), '🔧', 'strumenti') + '</td>' +
    '</tr>';
  }).join('');

  const th = 'padding:8px 6px;text-align:left;font-weight:700;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.03em;';
  const legenda = Object.keys(RS_STATI).map(k =>
    '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;">' +
    '<span style="width:9px;height:9px;border-radius:2px;background:' + RS_STATI[k].bg + ';border:1px solid ' + RS_STATI[k].fg + ';"></span>' +
    RS_STATI[k].t + '</span>').join('') +
    '<span style="display:inline-flex;align-items:center;gap:4px;">' +
    '<span style="width:9px;height:9px;border-radius:2px;background:#dcfce7;outline:2px solid #0d9488;outline-offset:1px;margin:2px;"></span>' +
    'Giorno consigliato</span>';

  container.innerHTML =
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;">' +
        '<th style="' + th + 'text-align:center;">#</th>' +
        '<th style="' + th + '">Squadra</th>' +
        '<th style="' + th + '">Operatori</th>' +
        '<th style="' + th + '">Dove sono questa settimana</th>' +
        '<th style="' + th + 'text-align:right;">Distanza</th>' +
        '<th style="' + th + '">Quando andare</th>' +
        '<th style="' + th + '">Settimana</th>' +
        '<th style="' + th + 'text-align:center;">Requisiti</th>' +
      '</tr></thead><tbody>' + righe + '</tbody></table></div>' +
    '<div style="font-size:10px;color:#64748b;margin-top:8px;">' + legenda + '</div>';
}

/* Allinea l'altezza della card dei risultati a quella del pannello di ricerca, così
   le due colonne finiscono alla stessa quota invece di lasciare un vuoto accanto a una
   tabella lunga. Il limite è un max-height: se le squadre sono poche la card resta
   corta, se sono tante scorre. Sotto il breakpoint lg le card sono impilate e il
   vincolo va tolto, altrimenti comprimerebbe la tabella senza motivo. */
function _rsSyncAltezze() {
  const panel = document.getElementById('rs-input-panel');
  const card = document.getElementById('rs-risultati-card');
  const body = document.getElementById('rs-risultati');
  if (!panel || !card || !body) return;

  if (window.innerWidth < 1024) {
    body.style.maxHeight = '';
    body.style.overflowY = '';
    return;
  }
  const h = panel.offsetHeight;
  if (!h) return; // pannello non ancora visibile (tab nascosto)
  /* Spazio occupato dalla card oltre al corpo tabella (titolo, filtro, padding).
     Resta stabile anche a chiamate ripetute, perché entrambe le misure scendono
     insieme quando il corpo è già limitato. */
  const chrome = card.offsetHeight - body.offsetHeight;
  body.style.maxHeight = Math.max(180, h - chrome) + 'px';
  body.style.overflowY = 'auto';
}

/* ---------- mappa ---------- */
/* Mostra le tappe da coprire (verdi) e i cantieri dove le squadre proposte stanno
   già lavorando (colorati), con una linea che collega la squadra più vicina alla
   sua tappa: è la risposta visiva a "chi ho già in zona?". */
function rsRenderMappa() {
  const container = document.getElementById('rs-mappa-container');
  if (!container) return;
  if (!document.getElementById('rs-mappa')) {
    container.innerHTML = '<div id="rs-mappa" style="height:100%;width:100%;border-radius:6px;"></div>';
  }

  setTimeout(() => {
    if (!_ricercaSquadreMap) {
      _ricercaSquadreMap = L.map('rs-mappa', { preferCanvas: true }).setView([42.5, 12.5], 6);
      const _rsMapStreet = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(_ricercaSquadreMap);
      mapAddSatelliteToggle(_ricercaSquadreMap, _rsMapStreet);
    }
    _ricercaSquadreMap.invalidateSize();

    _rsMapLayers.forEach(l => _ricercaSquadreMap.removeLayer(l));
    _rsMapLayers = [];

    const bounds = [];

    /* Tappe da coprire */
    _ricercaSquadre.tappe.forEach(t => {
      const icon = L.divIcon({
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.45);"></div>',
        className: 'pw-map-marker', iconSize: [20, 20], iconAnchor: [10, 10]
      });
      const m = L.marker([t.lat, t.lng], { icon }).addTo(_ricercaSquadreMap)
        .bindPopup('<div style="font-family:system-ui;font-size:12px;"><b>🎯 ' + esc(t.nome) + '</b><br>' +
          '<span style="color:#64748b;">Cantiere da coprire</span></div>');
      _rsMapLayers.push(m);
      bounds.push([t.lat, t.lng]);
    });

    /* Cantieri delle squadre proposte (prime 8 per vicinanza) */
    const top = (_ricercaSquadre.risultati || []).slice(0, 8);
    top.forEach((r, i) => {
      const color = MAP_COLORS[i % MAP_COLORS.length];
      let ancora = null;

      r.sq.cantieri.forEach(c => {
        const g = _geoCache[_rsNorm(c)];
        if (!g || g.lat == null) return;
        if (!ancora || c === r.origine) ancora = { lat: g.lat, lng: g.lng };
        const icon = L.divIcon({
          html: '<div style="width:15px;height:15px;border-radius:50%;background:' + color + ';border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>',
          className: 'pw-map-marker', iconSize: [15, 15], iconAnchor: [7, 7]
        });
        const popup = '<div style="font-family:system-ui;font-size:12px;min-width:160px;">' +
          '<b>👥 ' + esc(r.sq.nome) + '</b>' +
          '<div style="color:#0d9488;font-weight:600;margin:2px 0;">📍 ' + esc(c) + '</div>' +
          '<div style="color:#64748b;font-size:11px;">👷 ' + esc(r.sq.operatori.join(', ')) + '</div>' +
          '<div style="color:#475569;font-size:11px;">📋 ' + esc(r.sq.commessa) + '</div>' +
          (r.dist != null ? '<div style="color:#4f46e5;font-weight:600;font-size:11px;margin-top:3px;">↗ ' +
            _rsKm(r.dist) + ' da ' + esc(r.tappaVicina || '') + '</div>' : '') +
          '</div>';
        const m = L.marker([g.lat, g.lng], { icon }).addTo(_ricercaSquadreMap).bindPopup(popup);
        _rsMapLayers.push(m);
        bounds.push([g.lat, g.lng]);
      });

      /* Collegamento squadra → tappa più vicina, solo per le prime 3 */
      if (i < 3 && ancora && r.tappaVicina) {
        const t = _ricercaSquadre.tappe.find(x => x.nome === r.tappaVicina);
        if (t) {
          const line = L.polyline([[ancora.lat, ancora.lng], [t.lat, t.lng]], {
            color, weight: 2, opacity: 0.55, dashArray: '5,6'
          }).addTo(_ricercaSquadreMap);
          _rsMapLayers.push(line);
        }
      }
    });

    if (bounds.length === 1) _ricercaSquadreMap.setView(bounds[0], 11);
    else if (bounds.length > 1) _ricercaSquadreMap.fitBounds(bounds, { padding: [40, 40] });
  }, 80);
}

/* ---------- init tab ---------- */
function rsInit() {
  _ricercaSquadre.anno = pwAnno;
  _ricercaSquadre.week = pwWeek;

  /* Cambiando settimana i risultati non valgono più: la settimana è il contesto */
  if (_ricercaSquadre.risultati.length &&
      (_ricercaSquadre.anno !== pwAnno || _ricercaSquadre.week !== pwWeek)) {
    _ricercaSquadre.risultati = [];
  }

  _rsUpdateSkillsLabel();
  _rsUpdateStrumentiLabel();
  rsRenderTappe();
  rsRenderRisultati();
  rsRenderMappa();
  /* Il pannello è appena diventato visibile: le misure sono attendibili solo dopo
     che il browser ha completato il layout. */
  setTimeout(_rsSyncAltezze, 80);

  if (!_rsBound) {
    _rsBound = true;
    window.addEventListener('resize', _rsSyncAltezze);
    document.addEventListener('mousedown', e => {
      const inSkills = e.target.closest && (e.target.closest('#rs-skills-dropdown') || e.target.closest('#rs-tappa-skills-btn'));
      const inStr = e.target.closest && (e.target.closest('#rs-strumenti-dropdown') || e.target.closest('#rs-tappa-strumenti-btn'));
      if (!inSkills) {
        const d = document.getElementById('rs-skills-dropdown');
        if (d) d.classList.add('hidden');
      }
      if (!inStr) {
        const d = document.getElementById('rs-strumenti-dropdown');
        if (d) d.classList.add('hidden');
      }
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _rsCloseDropdowns(null); });

    const nomeEl = document.getElementById('rs-tappa-nome');
    if (nomeEl) nomeEl.addEventListener('keydown', e => { if (e.key === 'Enter') rsAddTappa(); });

    const filtro = document.getElementById('rs-solo-compatibili');
    if (filtro) filtro.addEventListener('change', () => {
      _rsSoloCompatibili = filtro.checked;
      rsRenderRisultati();
    });
  }
}
