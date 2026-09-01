/* ===================== ASSEGNAZIONI ===================== */
async function assegnaOperatore(commessaId, operatoreId) {
  const c = state.pipeline.find(p => p.id === commessaId);
  const op = state.operatori.find(o => o.id === operatoreId);
  if (!c || !op) return;
  // già assegnato?
  if (state.assegnazioni.some(a => a.commessa_id === commessaId && a.operatore_id === operatoreId)) {
    showAlertModal('Operatore già assegnato a questa commessa.');
    return;
  }
  // verifica skill
  const skillMancanti = c.skills.filter(s => !op.skills.includes(s));
  // verifica attestati richiesti (coerente con il pannello Raccomandazioni)
  const attestatiRichiesti = c.attestati_richiesti || [];
  const attestatiMancanti = attNonCoperti(op, attestatiRichiesti);
  // verifica saturazione
  const mesi = monthsBetween(c.inizio, c.fine);
  const sat = operatoreSatPeriodo(op, mesi);
  const saturo = sat >= 1.0;

  let forzata = false;
  if (skillMancanti.length > 0 || attestatiMancanti.length > 0 || saturo) {
    const msg = [];
    if (skillMancanti.length>0) msg.push(`⚠ Skill mancanti: ${skillMancanti.join(', ')}`);
    if (attestatiMancanti.length>0) msg.push('⚠ Attestati mancanti o scaduti: ' + attestatiMancanti.map(a => attEtichettaMancanza(op, a)).join(', '));
    if (saturo) msg.push(`⚠ Operatore saturo (${(sat*100).toFixed(0)}%) nella finestra della commessa`);
    msg.push('\nConfermi comunque l\'assegnazione?');
    // flash
    const card = document.querySelector(`[data-cid="${commessaId}"]`);
    if (card) { card.classList.add('flash-red'); setTimeout(()=>card.classList.remove('flash-red'),1200); }
    if (!await showConfirmAsync(msg.join('\n'))) return;
    forzata = true;
  }

  state.assegnazioni.push({ commessa_id: commessaId, operatore_id: operatoreId, forzata });
  await saveState(); renderAll();
}

async function rimuoviAssegnazione(cid, oid) {
  const c = state.pipeline.find(p => p.id === cid);
  const op = state.operatori.find(o => o.id === oid);
  const msg = (c && op) ? `Rimuovere l'assegnazione di "${op.nome_esteso}" su "${c.progetto}"?` : 'Rimuovere questa assegnazione?';
  if (!await showConfirmAsync(msg, 'Rimuovi assegnazione')) return;
  state.assegnazioni = state.assegnazioni.filter(a => !(a.commessa_id === cid && a.operatore_id === oid));
  await saveState(); renderAll();
}

async function spostaAssegnazione(cidFrom, oid, cidTo) {
  if (cidFrom === cidTo) return;
  state.assegnazioni = state.assegnazioni.filter(a => !(a.commessa_id === cidFrom && a.operatore_id === oid));
  await assegnaOperatore(cidTo, oid);
}

/* ===================== CHIUSURA / RIPRISTINO COMMESSE ATTIVE ===================== */
async function eliminaCommessaChiusa(idx) {
  const cc = state.commesse_chiuse[idx];
  if (!cc) return;
  if (!await showConfirmAsync(`Eliminare definitivamente "${cc.progetto}" dall'archivio?\n\nL'operazione è irreversibile.`, 'Elimina definitivamente')) return;
  const nome = cc.progetto;
  state.commesse_chiuse.splice(idx, 1);
  // NOTA: non si tocca state.commesse_escluse qui — l'eliminazione dall'archivio
  // rimuove solo il record restaurabile, NON l'esclusione permanente. Come rete
  // di sicurezza per commesse chiuse prima di questo fix, assicuriamoci che il
  // nome sia comunque presente nella lista di esclusione permanente.
  if (!state.commesse_escluse) state.commesse_escluse = [];
  const nomeTrim = (nome || '').trim();
  if (!state.commesse_escluse.some(n => (n||'').trim() === nomeTrim)) {
    state.commesse_escluse.push(nome);
  }
  // pulizia residua: rimuovi da commesse_attive e meta se ancora presenti
  state.commesse_attive = (state.commesse_attive || []).filter(ca => (ca.progetto||ca.nome) !== nome);
  if (state.commesse_attive_meta && state.commesse_attive_meta[nome]) delete state.commesse_attive_meta[nome];
  // Rete di sicurezza: rimuovi anche da commesse_attive_extra (caso commesse promosse da pipeline
  // chiuse prima del fix che già puliva questa chiave)
  const extra = (await sget('commesse_attive_extra')) || [];
  const extraFiltrato = extra.filter(e => (e.progetto||e.nome) !== nome);
  await sset('commesse_attive_extra', extraFiltrato);
  await saveState(null, null, true);
  renderAll();
}

/* ===================== STIMA FABBISOGNO COMMESSA ATTIVA =====================
   Logica: la commessa ha N righe staffing, ognuna con 12 mesi di gg-uomo.
   - Per ogni mese, sommo i gg-uomo totali → carico_mese
   - Per ogni mese attivo, l'FTE necessario = carico_mese / giorni_lavorativi_mese
   - Operatori distinti attualmente assegnati = N
   - FTE picco = max(carico_mese / gl_mese) sui mesi attivi
   - Confronto N vs ceil(FTE picco): se N > ceil(FTE picco) → surplus
*/
function calcolaFabbisognoCommessa(commessaNome) {
  const righe = state.staffing.filter(r => r.commessa === commessaNome);
  if (righe.length === 0) return null;
  const mc = meseCorrente();
  const meta = state.commesse_attive_meta[commessaNome] || {};

  // Calcola i mesi nel range della commessa (se date definite)
  const rangeInizio = meta.inizio ? new Date(meta.inizio) : null;
  const rangeFine   = meta.fine   ? new Date(meta.fine)   : null;
  const mesiInRange = new Array(12).fill(true).map((_, i) => {
    if (!rangeInizio && !rangeFine) return true; // nessun range: tutti validi
    const meseStart = new Date(ANNO, i, 1);
    const meseEnd   = new Date(ANNO, i + 1, 0);
    const fuoriRange = (rangeInizio && meseEnd < rangeInizio) || (rangeFine && meseStart > rangeFine);
    return !fuoriRange;
  });

  const caricoMese = new Array(12).fill(0);
  const opPerMese  = new Array(12).fill(null).map(() => new Set());
  righe.forEach(r => {
    r.mesi.forEach((v, i) => {
      if (!mesiInRange[i]) return; // ignora mesi fuori range
      const n = Number(v) || 0;
      caricoMese[i] += n;
      if (n > 0) opPerMese[i].add(r.risorsa);
    });
  });
  const risorseTotali = new Set(righe.map(r => r.risorsa));
  let ftePicco = 0, mesePicco = -1, mesiAttiviFuturi = 0, mesiAttiviStorici = 0;
  let totGG = 0, totGGFuturo = 0;
  for (let i = 0; i < 12; i++) {
    if (!mesiInRange[i]) continue; // ignora mesi fuori range
    totGG += caricoMese[i];
    if (caricoMese[i] > 0) {
      if (i >= mc) {
        mesiAttiviFuturi++;
        totGGFuturo += caricoMese[i];
        const fte = caricoMese[i] / (INITIAL_DATA.giorni_lavorativi[i] || 20);
        if (fte > ftePicco) { ftePicco = fte; mesePicco = i; }
      } else { mesiAttiviStorici++; }
    }
  }
  const fteNec = Math.ceil(ftePicco);
  const risDichiarate = (meta.risorse_necessarie !== undefined && meta.risorse_necessarie !== null) ? meta.risorse_necessarie : null;
  const nNecessari = risDichiarate !== null ? risDichiarate : fteNec;
  let fteMesePeggiore = null, surplusFinale, mesePeggioreFuturo = -1;
  if (risDichiarate !== null && mesiAttiviFuturi > 0) {
    let minFte = Infinity;
    for (let i = mc; i < 12; i++) {
      if (!mesiInRange[i]) continue; // ignora mesi fuori range
      if (caricoMese[i] > 0 || opPerMese[i].size > 0) {
        const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
        const fte = caricoMese[i] / gl;
        if (fte < minFte) { minFte = fte; mesePeggioreFuturo = i; }
      }
    }
    fteMesePeggiore = minFte === Infinity ? 0 : minFte;
    surplusFinale = fteMesePeggiore - risDichiarate;
  } else {
    const risorseResidue = new Set();
    righe.forEach(r => { if (r.mesi.some((v, i) => i >= mc && mesiInRange[i] && Number(v) > 0)) risorseResidue.add(r.risorsa); });
    fteMesePeggiore = risorseResidue.size;
    surplusFinale = fteMesePeggiore - nNecessari;
  }
  return {
    fteMesePeggiore, nTotali: risorseTotali.size,
    ftePicco, fteNec, nNecessari, risDichiarate,
    surplus: surplusFinale, mesePicco, mesePeggioreFuturo,
    mesiAttivi: mesiAttiviFuturi, mesiAttiviStorici,
    totGG, totGGFuturo, caricoMese, opPerMese, mesiInRange,
    completata: mesiAttiviFuturi === 0 && mesiAttiviStorici > 0,
  };
}

/* ===================== CONFRONTO PREVENTIVATO / EFFETTIVO (da Griglia settimanale) =====================
   Confronta i gg preventivati nello staffing (state.staffing) con i giorni
   effettivamente lavorati risultanti dalla Griglia settimanale (pwData), per una
   commessa e un mese specifici. Un giorno di Griglia conta come "lavorato" con la
   stessa regola usata in produzione-report.js (cpGetSquadraOpsByDay): cantiere
   valorizzato e operatore non in ferie quel giorno.
*/
function calcolaConfrontoCommessa(commessaNome, meseIdx) {
  const preventivato = {};
  state.staffing.filter(r => r.commessa === commessaNome).forEach(r => {
    const v = Number(r.mesi[meseIdx]) || 0;
    if (v > 0) preventivato[r.risorsa] = (preventivato[r.risorsa] || 0) + v;
  });

  const settimane = pwMonthWeeks(ANNO, meseIdx);
  const effettivo = {};
  let trovatoBlocco = false;
  settimane.forEach(({ anno: wa, week: ww }) => {
    const blocchi = (pwData[wa] && pwData[wa][ww]) || [];
    const monday = isoWeekToMonday(wa, ww);
    blocchi.forEach(bc => {
      if (bc.commessa !== commessaNome) return;
      trovatoBlocco = true;
      (bc.squadre || []).forEach(sq => {
        (sq.operatori || []).forEach(op => {
          const nome = (op.nome || '').trim();
          if (!nome) return;
          for (let g = 0; g < 6; g++) {
            const d = new Date(monday);
            d.setUTCDate(d.getUTCDate() + g);
            if (d.getUTCFullYear() !== ANNO || d.getUTCMonth() !== meseIdx) continue; // giorno fuori dal mese target (settimana a cavallo)
            const opG = (op.giorni && op.giorni[g]) || {};
            if (pwCellCantieri(opG).length === 0) continue;
            const inFerie = !!(pwFerie[wa] && pwFerie[wa][ww] && pwFerie[wa][ww][nome] && pwFerieTipo(pwFerie[wa][ww][nome][g]));
            if (inFerie) continue;
            effettivo[nome] = (effettivo[nome] || 0) + 1;
          }
        });
      });
    });
  });

  const nomi = new Set([...Object.keys(preventivato), ...Object.keys(effettivo)]);
  const righe = [...nomi].map(nome => {
    const prev = preventivato[nome] || 0;
    const eff = effettivo[nome] || 0;
    const delta = eff - prev;
    let stato;
    if (prev === 0 && eff > 0) stato = 'extra';
    else if (prev > 0 && eff === 0) stato = 'assente';
    else if (Math.abs(delta) <= 1) stato = 'ok';
    else stato = 'scostamento';
    return { nome, prev, eff, delta, stato };
  });

  const ordinePeso = { assente: 0, scostamento: 1, extra: 2, ok: 3 };
  righe.sort((a, b) => (ordinePeso[a.stato] - ordinePeso[b.stato]) || a.nome.localeCompare(b.nome));

  return { righe, datiGrigliaAssenti: !trovatoBlocco };
}

/* Scansiona l'intera Griglia settimanale dell'anno corrente e restituisce, per
   ciascuna commessa in cui l'operatore risulta impiegato (cantiere valorizzato
   e non in ferie), i gg effettivi mese per mese. Usata per far emergere, nella
   vista operatore, le commesse "solo Griglia" mai preventivate nello staffing. */
function calcolaImpegniEffettiviAnnoOperatore(nomeOperatore) {
  const perCommessa = {};
  for (let meseIdx = 0; meseIdx < 12; meseIdx++) {
    pwMonthWeeks(ANNO, meseIdx).forEach(({ anno: wa, week: ww }) => {
      const blocchi = (pwData[wa] && pwData[wa][ww]) || [];
      const monday = isoWeekToMonday(wa, ww);
      blocchi.forEach(bc => {
        if (!bc.commessa) return;
        (bc.squadre || []).forEach(sq => {
          (sq.operatori || []).forEach(op => {
            const nome = (op.nome || '').trim();
            if (nome !== nomeOperatore) return;
            for (let g = 0; g < 6; g++) {
              const d = new Date(monday);
              d.setUTCDate(d.getUTCDate() + g);
              if (d.getUTCFullYear() !== ANNO || d.getUTCMonth() !== meseIdx) continue;
              const opG = (op.giorni && op.giorni[g]) || {};
              if (!opG.cantiere || !opG.cantiere.trim()) continue;
              const inFerie = !!(pwFerie[wa] && pwFerie[wa][ww] && pwFerie[wa][ww][nome] && pwFerieTipo(pwFerie[wa][ww][nome][g]));
              if (inFerie) continue;
              if (!perCommessa[bc.commessa]) perCommessa[bc.commessa] = new Array(12).fill(0);
              perCommessa[bc.commessa][meseIdx] += 1;
            }
          });
        });
      });
    });
  }
  return perCommessa;
}

async function rimuoviRigaStaffing(idx) {
  const r = state.staffing[idx];
  if (!r) return;
  const tot = r.mesi.reduce((s,v) => s + (Number(v)||0), 0);
  if (!await showConfirmAsync(`Rimuovere l'allocazione di "${r.risorsa}" su "${r.commessa}" (${tot} gg-uomo totali)?\n\nL'operatore tornerà disponibile per i mesi interessati.`, 'Rimuovi allocazione')) return;
  state.staffing.splice(idx, 1);
  ricalcolaAllocOperatori();
  await saveState();
  renderAll();
}

async function rimuoviMeseAllocazione(idx, meseIdx) {
  const r = state.staffing[idx];
  if (!r) return;
  const val = r.mesi[meseIdx];
  if (val && !await showConfirmAsync(`Rimuovere ${val} gg-uomo di "${r.risorsa}" su "${r.commessa}" in ${MESI_LONG[meseIdx]}?`, 'Rimuovi')) return;
  r.mesi[meseIdx] = 0;
  // se la riga è tutta vuota, la rimuoviamo
  if (r.mesi.every(v => !v)) state.staffing.splice(idx, 1);
  ricalcolaAllocOperatori();
  await saveState();
  renderAll();
}

/* ===================== MODALE AGGIUNGI ALLOCAZIONE (con tempo) ===================== */
function openAddAllocazioneModal(commessaNome, opts = {}) {
  // opts: { mesiSuggeriti: [indici], commessaPipeline: obj, skillRichieste: [...], attestatiRichiesti: [...] }
  const mesiSuggeriti = opts.mesiSuggeriti || [];
  const skillReq = opts.skillRichieste || [];
  const attReq = opts.attestatiRichiesti || [];
  const provinciaCommessa = opts.provincia || opts.commessaPipeline?.provincia || '';
  const regioneCommessa = opts.regione || opts.commessaPipeline?.regione || '';
  const distanzaDi = op => distanzaLavorazione(regioneCommessa, provinciaCommessa, op.provincia, op.regione);

  // ordinamento operatori: prima i validi (hanno tutte le skill+attestati richiesti),
  // poi - a parita' di validita' - chi e' della provincia/regione della commessa o il
  // piu' vicino, infine in generale ordine alfabetico come criterio finale
  const validoOp = op => (skillReq.length === 0 || skillReq.every(s => op.skills.includes(s)))
    && (attReq.length === 0 || attReq.every(s => attIsValido(op, s)));
  const ops = [...getOperatoriAttivi()].sort((a, b) => {
    const validoA = validoOp(a), validoB = validoOp(b);
    if (validoA !== validoB) return validoA ? -1 : 1;
    const distA = distanzaDi(a), distB = distanzaDi(b);
    if (distA !== distB) {
      if (distA === null) return 1;
      if (distB === null) return -1;
      if (distA !== distB) return distA - distB;
    }
    return a.nome_esteso.localeCompare(b.nome_esteso);
  });

  const opOptions = ops.map(op => {
    const hasAllSkill = skillReq.length === 0 || skillReq.every(s => op.skills.includes(s));
    const hasAllAtt = attReq.length === 0 || attReq.every(s => attIsValido(op, s));
    const valido = hasAllSkill && hasAllAtt;
    const sat = mesiSuggeriti.length > 0 ? operatoreSatPeriodo(op, mesiSuggeriti) : 0;
    const satTag = mesiSuggeriti.length > 0 ? ` [sat ${(sat*100).toFixed(0)}%]` : '';
    let tag = '';
    if (skillReq.length > 0 || attReq.length > 0) {
      if (hasAllSkill && hasAllAtt) tag = ' ✓';
      else if (!hasAllSkill && !hasAllAtt) tag = ' ⚠⚠';
      else tag = ' ⚠';
    }
    const dist = distanzaDi(op);
    const geoTag = dist === null ? '' : dist === 0 ? (provinciaCommessa ? ' 📍stessa provincia' : ' 📍stessa regione') : ` 📍~${Math.round(dist)}km`;
    // Colore leggero: verde chi ha tutti i requisiti, ambra chi ne manca almeno uno
    // (solo se sono stati richiesti skill/attestati — altrimenti nessuna distinzione).
    const colorStyle = (skillReq.length > 0 || attReq.length > 0)
      ? (valido ? 'color:#15803d;' : 'color:#b45309;')
      : '';
    return `<option value="${op.id}" style="${colorStyle}">${op.nome_esteso}${tag}${geoTag}${satTag}</option>`;
  }).join('');

  const mesiInputs = MESI.map((m, i) => {
    const isSuggerito = mesiSuggeriti.includes(i);
    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
    return `
      <div class="flex flex-col items-center ${isSuggerito ? '' : 'opacity-50'}">
        <label class="text-[10px] text-slate-500">${m}</label>
        <input type="number" min="0" max="31" step="0.5" data-mese="${i}" class="mese-input w-12 px-1 py-0.5 text-xs border border-slate-300 rounded text-center" value="0" placeholder="0">
        <span class="text-[9px] text-slate-400">/${gl} gg</span>
      </div>
    `;
  }).join('');

  openModal(`
    <h3 class="font-semibold text-slate-900 mb-1">Aggiungi allocazione</h3>
    <div class="text-xs text-slate-500 mb-3">Commessa: <span class="font-medium text-slate-700">${commessaNome}</span>${skillReq.length>0?`<div class="mt-1">Skill richieste: ${skillReq.map(s=>`<span class="skill-badge req">${s}</span>`).join(' ')}</div>`:''}${attReq.length>0?`<div class="mt-1">Attestati richiesti: ${attReq.map(s=>`<span class="att-badge req">${s}</span>`).join(' ')}</div>`:''}</div>

    <div class="space-y-3">
      <div>
        <label class="text-xs text-slate-600">Operatore</label>
        <select id="alloc-op" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">${opOptions}</select>
        <div id="alloc-op-info" class="text-[10px] text-slate-500 mt-1"></div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs text-slate-600">Giorni-uomo per mese</label>
          <div class="flex gap-1">
            <button id="alloc-fill-suggeriti" type="button" class="text-[10px] px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100" title="Riempi i mesi della finestra con giorni lavorativi pieni">Full-time finestra</button>
            <button id="alloc-fill-half" type="button" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200" title="Metà giorni lavorativi sulla finestra">Half-time finestra</button>
            <button id="alloc-fill-zero" type="button" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200">Azzera</button>
          </div>
        </div>
        <div id="qf-bar" class="flex flex-wrap items-center gap-2 mb-2 p-2 bg-indigo-50 border border-indigo-200 rounded">
          <span class="text-[11px] text-indigo-700 font-medium">Riempimento rapido:</span>
          <select id="qf-da" class="text-xs border border-indigo-300 rounded px-1 py-0.5 bg-white"></select>
          <span class="text-[11px] text-indigo-600">→</span>
          <select id="qf-a" class="text-xs border border-indigo-300 rounded px-1 py-0.5 bg-white"></select>
          <input id="qf-gg" type="number" min="0" max="31" step="0.5" placeholder="gg" class="w-14 text-xs border border-indigo-300 rounded px-1 py-0.5 text-center bg-white">
          <button id="qf-apply" type="button" class="text-[11px] px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700">Applica</button>
          <button id="qf-full" type="button" class="text-[11px] px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-300 rounded hover:bg-indigo-200">Full-time</button>
        </div>
        <div class="grid grid-cols-6 sm:grid-cols-12 gap-1 p-2 bg-slate-50 rounded">${mesiInputs}</div>
        ${mesiSuggeriti.length>0 ? `<p class="text-[10px] text-slate-500 mt-1">I mesi suggeriti (evidenziati) sono quelli della finestra ${MESI[mesiSuggeriti[0]]} \u2192 ${MESI[mesiSuggeriti[mesiSuggeriti.length-1]]} della commessa.</p>`:''}
      </div>

      <div class="text-xs">
        Totale: <span id="alloc-totale" class="font-semibold text-slate-900">0</span> giorni-uomo
      </div>
    </div>

    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="alloc-save" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva allocazione</button>
    </div>
  `);

  // Live update info operatore + totale
  const inputs = [...document.querySelectorAll('.mese-input')];
  const updateTotale = () => {
    const tot = inputs.reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
    document.getElementById('alloc-totale').textContent = tot;
  };
  inputs.forEach(inp => inp.addEventListener('input', updateTotale));

  const opSelect = document.getElementById('alloc-op');
  const opInfo = document.getElementById('alloc-op-info');
  const updateOpInfo = () => {
    const op = state.operatori.find(o => o.id === opSelect.value);
    if (!op) { opInfo.innerHTML = ''; return; }
    const skillHtml = op.skills.length > 0 ? op.skills.map(s => `<span class="skill-badge">${s}</span>`).join('') : '<i>nessuna skill</i>';
    const skillMancanti = skillReq.filter(s => !op.skills.includes(s));
    const attMancanti = attNonCoperti(op, attReq);
    const warns = [];
    if (skillMancanti.length > 0) warns.push(`<span class="text-red-600">⚠ Skill mancanti: ${skillMancanti.join(', ')}</span>`);
    if (attMancanti.length > 0) warns.push('<span class="text-red-600">⚠ Attestati mancanti o scaduti: ' + esc(attMancanti.map(a => attEtichettaMancanza(op, a)).join(', ')) + '</span>');
    const attHtml = attBadgesHtml(op, '<i>nessun attestato</i>');
    opInfo.innerHTML = `<div>Skill: ${skillHtml}</div><div class="mt-1">Attestati: ${attHtml}</div>${warns.length>0?'<div class="mt-1">'+warns.join('<br>')+'</div>':''}`;
  };
  opSelect.addEventListener('change', updateOpInfo);
  updateOpInfo();

  // Fill helpers
  document.getElementById('alloc-fill-suggeriti').onclick = () => {
    inputs.forEach(inp => {
      const i = parseInt(inp.dataset.mese);
      if (mesiSuggeriti.includes(i)) inp.value = INITIAL_DATA.giorni_lavorativi[i] || 20;
      else inp.value = 0;
    });
    updateTotale();
  };
  document.getElementById('alloc-fill-half').onclick = () => {
    inputs.forEach(inp => {
      const i = parseInt(inp.dataset.mese);
      if (mesiSuggeriti.includes(i)) inp.value = Math.round((INITIAL_DATA.giorni_lavorativi[i] || 20) / 2);
      else inp.value = 0;
    });
    updateTotale();
  };
  document.getElementById('alloc-fill-zero').onclick = () => {
    inputs.forEach(inp => inp.value = 0);
    updateTotale();
  };

  // Popola i select da/a con i nomi dei mesi
  const qfDaEl = document.getElementById('qf-da');
  const qfAEl  = document.getElementById('qf-a');
  MESI.forEach((m, i) => {
    const o1 = document.createElement('option'); o1.value = i; o1.textContent = m; qfDaEl.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = i; o2.textContent = m; qfAEl.appendChild(o2);
  });
  // Pre-seleziona range dai mesi suggeriti o dal mese corrente
  qfDaEl.value = mesiSuggeriti.length > 0 ? mesiSuggeriti[0]                          : meseCorrente();
  qfAEl.value  = mesiSuggeriti.length > 0 ? mesiSuggeriti[mesiSuggeriti.length - 1]   : 11;

  document.getElementById('qf-apply').onclick = () => {
    const da = parseInt(qfDaEl.value);
    const a  = parseInt(qfAEl.value);
    const gg = parseFloat(document.getElementById('qf-gg').value) || 0;
    if (da > a) { showAlertModal('Il mese di inizio deve essere prima del mese di fine.'); return; }
    inputs.forEach(inp => {
      const i = parseInt(inp.dataset.mese);
      if (i >= da && i <= a) inp.value = gg;
    });
    updateTotale();
  };
  document.getElementById('qf-full').onclick = () => {
    const da = parseInt(qfDaEl.value);
    const a  = parseInt(qfAEl.value);
    if (da > a) { showAlertModal('Il mese di inizio deve essere prima del mese di fine.'); return; }
    inputs.forEach(inp => {
      const i = parseInt(inp.dataset.mese);
      if (i >= da && i <= a) inp.value = INITIAL_DATA.giorni_lavorativi[i] || 20;
    });
    updateTotale();
  };

  document.getElementById('alloc-save').onclick = async () => {
    const op = state.operatori.find(o => o.id === opSelect.value);
    if (!op) return;
    const mesi = new Array(12).fill(0);
    inputs.forEach(inp => { mesi[parseInt(inp.dataset.mese)] = parseFloat(inp.value) || 0; });
    if (mesi.every(v => v === 0)) { showAlertModal('Specifica almeno un giorno-uomo in un mese.'); return; }
    // warning skill e attestati mancanti
    const skillMancanti = skillReq.filter(s => !op.skills.includes(s));
    const attMancanti = attNonCoperti(op, attReq);
    if (skillMancanti.length > 0 || attMancanti.length > 0) {
      const msg = [];
      if (skillMancanti.length > 0) msg.push(`⚠ Skill mancanti: ${skillMancanti.join(', ')}`);
      if (attMancanti.length > 0) msg.push('⚠ Attestati mancanti o scaduti: ' + attMancanti.map(a => attEtichettaMancanza(op, a)).join(', '));
      msg.push('\nConfermare comunque l\'allocazione?');
      if (!await showConfirmAsync(msg.join('\n'))) return;
    }
    // warning saturazione: controlla che nessun mese vada oltre giorni lavorativi
    const overload = [];
    for (let i = 0; i < 12; i++) {
      if (mesi[i] > 0) {
        const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
        const carico = op.alloc_mensile[i] + mesi[i];
        if (carico > gl) overload.push(`${MESI_LONG[i]}: ${carico}/${gl} gg (${Math.round(carico/gl*100)}%)`);
      }
    }
    if (overload.length > 0) {
      if (!await showConfirmAsync(`⚠ L'operatore risulterà sovrallocato in:\n\n${overload.join('\n')}\n\nConfermare comunque?`)) return;
    }

    // Inserisco la riga in state.staffing. Se esiste già una riga per questa coppia (risorsa, commessa) la mergio
    const idxEsistente = state.staffing.findIndex(r => r.risorsa === op.nome_esteso && r.commessa === commessaNome);
    if (idxEsistente >= 0) {
      for (let i=0; i<12; i++) state.staffing[idxEsistente].mesi[i] = (state.staffing[idxEsistente].mesi[i] || 0) + mesi[i];
    } else {
      // copio metadati (societa/area/team) da un'altra riga dello stesso operatore se esiste
      const refRow = state.staffing.find(r => r.risorsa === op.nome_esteso);
      state.staffing.push({
        risorsa: op.nome_esteso,
        societa: refRow ? refRow.societa : 'Eagleprojects',
        area: refRow ? refRow.area : 'Rilievi',
        team: refRow ? refRow.team : 'Rilievi',
        team_leader: refRow ? refRow.team_leader : null,
        commessa: commessaNome,
        sotto_progetto: null,
        mesi,
      });
    }
    ricalcolaAllocOperatori();
    await saveState();
    closeModal();
    renderAll();
  };
}

/* ===================== MODALE MODIFICA SINGOLA CELLA STAFFING ===================== */
function openEditCellModal(staffingIdx, meseIdx) {
  const r = state.staffing[staffingIdx];
  if (!r) return;
  const valoreAttuale = Number(r.mesi[meseIdx]) || 0;
  const gl = INITIAL_DATA.giorni_lavorativi[meseIdx] || 20;
  openModal(`
    <h3 class="font-semibold text-slate-900 mb-2">Modifica allocazione</h3>
    <div class="text-xs text-slate-600 mb-3">
      <b>${esc(r.risorsa)}</b> su <b>${r.commessa}</b><br>
      ${MESI_LONG[meseIdx]} · Giorni lavorativi disponibili: ${gl}
    </div>
    <label class="block text-xs">
      <span class="text-slate-600">Giorni-uomo</span>
      <input id="edit-cell-val" type="number" min="0" max="31" step="0.5" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${valoreAttuale}">
    </label>
    <div class="text-[10px] text-slate-500 mt-1">Imposta 0 per rimuovere l'allocazione di questo mese.</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="edit-cell-save" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva</button>
    </div>
  `);
  setTimeout(() => document.getElementById('edit-cell-val').focus(), 100);
  document.getElementById('edit-cell-save').onclick = async () => {
    const nuovo = parseFloat(document.getElementById('edit-cell-val').value) || 0;
    state.staffing[staffingIdx].mesi[meseIdx] = nuovo;
    // se l'intera riga è azzerata, la rimuovo
    if (state.staffing[staffingIdx].mesi.every(v => !v)) state.staffing.splice(staffingIdx, 1);
    ricalcolaAllocOperatori();
    await saveState();
    closeModal();
    renderAll();
  };
}

/* ===================== MODALE IMPEGNI OPERATORE ===================== */
function openOperatoreImpegniModal(opId) {
  const op = state.operatori.find(o => o.id === opId);
  if (!op) return;

  // Impegni dallo staffing (commesse attive)
  const impegniStaffing = state.staffing
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter(r => r.risorsa === op.nome_esteso && r.mesi.some(v => Number(v) > 0));

  // Impegni dalla pipeline (assegnazioni manuali)
  const impegniPipeline = state.assegnazioni
    .filter(a => a.operatore_id === op.id)
    .map(a => state.pipeline.find(p => p.id === a.commessa_id))
    .filter(Boolean);

  // Saturazione 12 mesi (già calcolata)
  const satRowHtml = MESI.map((m, i) => {
    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
    // includi anche le assegnazioni pipeline (full-time virtuale)
    let extra = 0;
    impegniPipeline.forEach(c => {
      if (monthsBetween(c.inizio, c.fine).includes(i)) extra += gl;
    });
    const tot = op.alloc_mensile[i] + extra;
    const sat = gl > 0 ? tot/gl : 0;
    const colorCls = satColorClass(sat);
    return `<td class="text-center p-1">
      <div class="text-[10px] text-slate-500">${m}</div>
      <div class="text-xs font-semibold text-slate-700">${tot}</div>
      <div class="h-1 ${colorCls} rounded mt-0.5" title="${(sat*100).toFixed(0)}%"></div>
    </td>`;
  }).join('');

  // Tabella impegni staffing dettagliata
  const staffingRows = impegniStaffing.map(r => {
    const ggTot = r.mesi.reduce((s,v) => s + (Number(v)||0), 0);
    const mesiCells = r.mesi.map((v, i) => {
      const val = Number(v) || 0;
      if (val === 0) return `<td class="text-center text-slate-300 p-1">·</td>`;
      return `<td class="text-center p-1">
        <button class="del-mese-staffing text-xs font-medium text-slate-700 hover:text-red-600 hover:line-through" data-idx="${r._idx}" data-mese="${i}" title="Click per rimuovere ${val} gg in ${MESI_LONG[i]}">${val}</button>
      </td>`;
    }).join('');
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-1 text-xs">${r.commessa}</td>
        ${mesiCells}
        <td class="text-center text-xs font-medium text-slate-600 p-1">${ggTot}</td>
        <td class="p-1 text-right">
          <button class="del-impegno-modal text-xs text-slate-400 hover:text-red-600" data-idx="${r._idx}" title="Rimuovi tutta l'allocazione">🗑</button>
        </td>
      </tr>
    `;
  }).join('');

  const pipelineRows = impegniPipeline.map(c => {
    const a = state.assegnazioni.find(x => x.operatore_id === op.id && x.commessa_id === c.id);
    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="p-1 text-xs"><span class="industry-pill mr-1">pipeline</span>${esc(c.cliente)} — ${c.progetto}</td>
        <td class="p-1 text-[10px] text-slate-500">${fmtDate(c.inizio)} → ${fmtDate(c.fine)}</td>
        <td class="p-1 text-[10px] text-slate-500">${c.skills.join(', ')||'—'}</td>
        <td class="p-1 text-[10px] ${a.forzata?'text-red-600 font-medium':'text-slate-500'}">${a.forzata?'forzata':'ok'}</td>
        <td class="p-1 text-right">
          <button class="del-pipeline-modal text-xs text-slate-400 hover:text-red-600" data-cid="${c.id}" data-oid="${op.id}" title="Rimuovi assegnazione">🗑</button>
        </td>
      </tr>
    `;
  }).join('');

  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between mb-3">
          <div>
            <h3 class="font-semibold text-slate-900 text-lg">Impegni di ${op.nome_esteso}</h3>
            <div class="text-xs text-slate-500 mt-1">
              <div>Skill: ${op.skills.length ? op.skills.map(s => `<span class="skill-badge">${s}</span>`).join('') : '<i>nessuna skill censita</i>'}</div>
              <div class="mt-1">Attestati: ${attBadgesHtml(op, '<i>nessun attestato censito</i>')}</div>
            </div>
          </div>
          <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div class="bg-slate-50 rounded p-3 mb-4">
          <div class="text-[11px] text-slate-600 font-medium mb-2">Saturazione mensile (giorni-uomo / giorni lavorativi)</div>
          <table class="w-full">
            <tr>${satRowHtml}</tr>
          </table>
        </div>

        ${impegniStaffing.length > 0 ? `
          <div class="mb-4">
            <h4 class="font-semibold text-sm text-slate-900 mb-2">Allocazioni nello Staffing attuale (${impegniStaffing.length})</h4>
            <div class="overflow-x-auto border border-slate-200 rounded">
              <table class="w-full text-[11px]">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="text-left p-1 font-medium text-slate-500">Commessa</th>
                    ${(() => {
                  const metaK = state.commesse_attive_meta[k] || {};
                  const risDichK = (metaK.risorse_necessarie !== undefined && metaK.risorse_necessarie !== null) ? metaK.risorse_necessarie : null;
                  if (isOreNonLav || risDichK === null) return MESI.map(m => '<th class="text-center px-1 font-medium text-slate-500">'+m+'</th>').join('');
                  // Range date commessa
                  let mIniK = -1, mFinK = -1;
                  if (metaK.inizio) { const dpK = new Date(metaK.inizio); if (dpK.getFullYear()===ANNO) mIniK = dpK.getMonth(); }
                  if (metaK.fine)   { const dpK = new Date(metaK.fine);   if (dpK.getFullYear()===ANNO) mFinK = dpK.getMonth(); }
                  return MESI.map((m, i) => {
                    const inRngK = (mIniK < 0 || i >= mIniK) && (mFinK < 0 || i <= mFinK);
                    if (!inRngK) return '<th class="text-center px-0.5 font-medium text-slate-300" title="' + m + ': fuori finestra">' + m + '</th>';
                    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
                    const ggM = ass.reduce((s, a) => s + (Number(a.mesi[i]) || 0), 0);
                    const fte = ggM / gl;
                    const diff = fte - risDichK;
                    const fteS = fte.toFixed(2).replace('.00','').replace(/(\.[1-9])0$/,'$1');
                    let cls, title, icon = '';
                    if (i < mc) {
                      cls = Math.abs(diff) < 0.1 ? 'text-slate-400' : (diff > 0 ? 'text-amber-600' : 'text-red-500');
                      title = m + ' (storico): ' + fteS + ' FTE / ' + risDichK + ' richiesti';
                      return '<th class="text-center px-0.5 font-medium ' + cls + '" title="' + title + '">' + m + '</th>';
                    }
                    if (Math.abs(diff) < 0.05) {
                      return '<th class="text-center px-0.5 font-medium text-emerald-700 bg-emerald-50 rounded" title="' + m + ': ' + fteS + ' FTE ✓" style="cursor:pointer" onclick="apriDettaglioMeseCommessa(event,\'' + encodeURIComponent(k) + '\',' + i + ')">' + m + '</th>';
                    } else if (diff > 0) {
                      return '<th class="text-center px-0.5 font-medium text-amber-700 bg-amber-50 rounded" title="' + m + ': surplus +' + diff.toFixed(2) + ' FTE" style="cursor:pointer" onclick="apriDettaglioMeseCommessa(event,\'' + encodeURIComponent(k) + '\',' + i + ')">' + m + '<span style=\"font-size:8px\">▲</span></th>';
                    } else {
                      return '<th class="text-center px-0.5 font-medium text-red-700 bg-red-50 rounded" title="' + m + ': deficit ' + Math.abs(diff).toFixed(2) + ' FTE" style="cursor:pointer" onclick="apriDettaglioMeseCommessa(event,\'' + encodeURIComponent(k) + '\',' + i + ')">' + m + '<span style=\"font-size:8px\">▼</span></th>';
                    }
                  }).join('');
                })()}
                    <th class="text-center p-1 font-medium text-slate-500">Tot</th>
                    <th class="p-1"></th>
                  </tr>
                </thead>
                <tbody>${staffingRows}</tbody>
              </table>
            </div>
            <p class="text-[10px] text-slate-500 mt-1">💡 Click su un numero in tabella per azzerare quel singolo mese. Il cestino rimuove l'intera allocazione.</p>
          </div>
        ` : '<div class="text-xs text-slate-500 mb-4 italic">Nessuna allocazione attiva nello staffing.</div>'}

        ${impegniPipeline.length > 0 ? `
          <div>
            <h4 class="font-semibold text-sm text-slate-900 mb-2">Assegnazioni manuali sulla Pipeline (${impegniPipeline.length})</h4>
            <div class="overflow-x-auto border border-slate-200 rounded">
              <table class="w-full text-[11px]">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="text-left p-1 font-medium text-slate-500">Commessa</th>
                    <th class="text-left p-1 font-medium text-slate-500">Periodo</th>
                    <th class="text-left p-1 font-medium text-slate-500">Skill</th>
                    <th class="text-left p-1 font-medium text-slate-500">Stato</th>
                    <th class="p-1"></th>
                  </tr>
                </thead>
                <tbody>${pipelineRows}</tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <div class="flex justify-end mt-4">
          <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Chiudi</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  // binding
  root.querySelectorAll('.del-mese-staffing').forEach(b => {
    b.onclick = async () => {
      const idx = parseInt(b.dataset.idx);
      const mese = parseInt(b.dataset.mese);
      await rimuoviMeseAllocazione(idx, mese);
      openOperatoreImpegniModal(opId); // riapri per aggiornare
    };
  });
  root.querySelectorAll('.del-impegno-modal').forEach(b => {
    b.onclick = async () => {
      const idx = parseInt(b.dataset.idx);
      await rimuoviRigaStaffing(idx);
      // ricontrolla che l'operatore esista ancora
      if (state.operatori.find(o => o.id === opId)) openOperatoreImpegniModal(opId);
      else closeModal();
    };
  });
  root.querySelectorAll('.del-pipeline-modal').forEach(b => {
    b.onclick = async () => {
      await rimuoviAssegnazione(b.dataset.cid, b.dataset.oid);
      openOperatoreImpegniModal(opId);
    };
  });
}

