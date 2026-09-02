/* ===================== COMMESSE ===================== */
// Mese selezionato per il box "Confronto Preventivo/Effettivo" di ogni commessa attiva
// (nomeCommessa -> indice mese 0-11). Solo stato di vista, non persistito.
let _confrontoMeseSel = {};

/* Nomi univoci delle commesse attive: unione di quelle con righe staffing, quelle
   promosse/create in commesse_attive e quelle presenti solo nei meta, esclusi
   "ORE NON LAVORATE" e le commesse chiuse (state.commesse_escluse). Fonte unica per
   il badge del tab, la KPI "Commesse attive" e il relativo modal di dettaglio: prima
   ognuno rifaceva il conteggio a modo suo e potevano non coincidere (es. il modal
   leggeva solo state.commesse_attive, che copre solo le commesse promosse esplicitamente
   e non quelle con semplici righe di staffing). */
function getNomiCommesseAttive() {
  const set = new Set();
  state.staffing.forEach(r => { if (r.commessa && r.commessa !== 'ORE NON LAVORATE') set.add(r.commessa); });
  state.commesse_attive.forEach(ca => { const n = ca.progetto||ca.nome; if (n && n !== 'ORE NON LAVORATE') set.add(n); });
  Object.keys(state.commesse_attive_meta||{}).forEach(n => { if (n && n !== 'ORE NON LAVORATE') set.add(n); });
  const nomiChiuse = new Set((state.commesse_escluse||[]).map(n => (n||'').trim()).filter(Boolean));
  return [...set].filter(n => !nomiChiuse.has(n.trim())).sort((a,b) => a.localeCompare(b));
}

function renderCommesse() {
  const list = document.getElementById('commesse-list');

  document.getElementById('count-pipeline').textContent = `(${state.pipeline.length})`;
  document.getElementById('count-attive').textContent = `(${getNomiCommesseAttive().length})`;

  if (state.activeTab === 'pipeline') {
    // NOTA: a differenza della vista Attive, qui NON si filtra per state.commesse_escluse.
    // Quella lista esclude per NOME ed è pensata per le commesse attive (derivate da righe
    // staffing senza id proprio); le commesse pipeline hanno invece un id univoco e un ciclo
    // di vita esplicito (creazione/eliminazione via CRUD). Filtrarle per nome può nascondere
    // per sempre un'opportunità pipeline del tutto legittima che riusa il nome di una vecchia
    // commessa attiva chiusa — causando un conteggio "in partenza" disallineato dalla lista
    // visibile (v18.78.0).
    const q = state.searchCommesse.toLowerCase();
    const filtered = q
      ? state.pipeline.filter(c => ((c.cliente||'') + ' ' + (c.progetto||'') + ' ' + (c.industry||'')).toLowerCase().includes(q))
      : state.pipeline;
    list.innerHTML = filtered.map(c => renderCommessaPipelineCard(c)).join('') ||
      `<div class="text-center text-sm text-slate-400 py-6">${q ? 'Nessuna commessa corrisponde alla ricerca.' : 'Nessuna commessa in pipeline.'}</div>`;
  } else {
    list.innerHTML = renderCommesseAttive();
  }

  // drop handlers per pipeline
  list.querySelectorAll('.drop-zone').forEach(dz => {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.type === 'operatore') assegnaOperatore(dz.dataset.commessaId, data.id);
        else if (data.type === 'assegnazione') spostaAssegnazione(data.commessa_id, data.operatore_id, dz.dataset.commessaId);
      } catch(err) { console.error(err); }
    });
  });
  // chip rimozione
  list.querySelectorAll('.chip-remove').forEach(b => b.onclick = () => rimuoviAssegnazione(b.dataset.cid, b.dataset.oid));
  // chip drag (sposta tra commesse)
  list.querySelectorAll('.chip-drag').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type:'assegnazione', commessa_id: chip.dataset.cid, operatore_id: chip.dataset.oid }));
    });
  });
  list.querySelectorAll('.edit-c').forEach(b => b.onclick = () => openCommessaModal(b.dataset.id));
  list.querySelectorAll('.del-c').forEach(b => b.onclick = () => deleteCommessa(b.dataset.id));
  list.querySelectorAll('.promote-c').forEach(b => b.onclick = () => promuoviCommessa(b.dataset.id));
  // rimozione riga staffing
  list.querySelectorAll('.del-staffing').forEach(b => b.onclick = () => rimuoviRigaStaffing(parseInt(b.dataset.idx)));
  // modifica cella singola staffing (click sul numero) — legacy per card pipeline
  list.querySelectorAll('.edit-cell-staffing').forEach(b => b.onclick = () => openEditCellModal(parseInt(b.dataset.idx), parseInt(b.dataset.mese)));

  // INPUT INLINE — tab Attive: validazione e salvataggio on-blur/Enter
  list.querySelectorAll('.inline-cell-input').forEach(inp => {
    const origVal = inp.value;
    // Validazione live mentre si digita
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      const gl = parseInt(inp.dataset.gl) || 20;
      inp.classList.remove('over-limit', 'modified');
      if (inp.value !== '' && inp.value !== origVal) inp.classList.add('modified');
      if (!isNaN(v) && v > gl) {
        inp.classList.add('over-limit');
        inp.title = `⚠ ${v} gg supera i ${gl} giorni lavorativi di ${MESI_LONG[parseInt(inp.dataset.mese)]}`;
      }
    });
    // Salvataggio on-blur
    inp.addEventListener('blur', () => _commitInlineCell(inp));
    // Salvataggio su Enter, focus cella successiva su Tab
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = origVal; inp.blur(); }
    });
  });
  // aggiungi risorsa su commessa pipeline
  list.querySelectorAll('.add-risorsa-pipeline').forEach(b => b.onclick = () => {
    const c = state.pipeline.find(p => p.id === b.dataset.cid);
    if (!c) return;
    const mesi = monthsBetween(c.inizio, c.fine);
    openAddAllocazioneModal(c.progetto, { mesiSuggeriti: mesi, commessaPipeline: c, skillRichieste: c.skills, attestatiRichiesti: c.attestati_richiesti || [], provincia: c.provincia || '', regione: c.regione || '' });
  });
  // aggiungi risorsa su commessa attiva
  list.querySelectorAll('.add-risorsa-attiva').forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const commessa = decodeURIComponent(b.dataset.commessa);
    // determina i mesi in cui ci sono già allocazioni come "suggeriti"
    const mesiAttivi = new Set();
    state.staffing.filter(r => r.commessa === commessa).forEach(r => {
      r.mesi.forEach((v, i) => { if (Number(v) > 0) mesiAttivi.add(i); });
    });
    const metaAttiva = state.commesse_attive_meta[commessa] || {};
    openAddAllocazioneModal(commessa, { mesiSuggeriti: [...mesiAttivi].sort((a,b)=>a-b), provincia: metaAttiva.provincia || '', regione: metaAttiva.regione || '' });
  });
  // modifica dettagli commessa attiva
  list.querySelectorAll('.edit-attiva').forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    openCommessaAttivaModal(decodeURIComponent(b.dataset.commessa));
  });
  // chiudi commessa attiva
  list.querySelectorAll('.close-commessa').forEach(b => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    chiudiCommessa(decodeURIComponent(b.dataset.commessa));
  });
  // ripristina commessa chiusa
  list.querySelectorAll('.restore-commessa').forEach(b => b.onclick = () => ripristinaCommessa(parseInt(b.dataset.idx)));
  list.querySelectorAll('.delete-commessa-chiusa').forEach(b => b.onclick = () => eliminaCommessaChiusa(parseInt(b.dataset.idx)));
  // cambio mese nel box "Confronto Preventivo/Effettivo" — refresh mirato, non renderCommesse()
  // completo, per non richiudere i <details> aperti (stesso motivo di _refreshFabbisognoBox)
  list.querySelectorAll('.confronto-mese-sel').forEach(sel => sel.onchange = () => {
    const nome = decodeURIComponent(sel.dataset.commessa);
    _confrontoMeseSel[nome] = parseInt(sel.value, 10);
    _refreshConfrontoBox(nome);
  });
}

function renderCommessaPipelineCard(c) {
  const assegnati = state.assegnazioni.filter(a => a.commessa_id === c.id);
  // righe staffing già esistenti per questa commessa (assegnazioni con tempo specifico)
  const staffingRows = state.staffing
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter(r => r.commessa === c.progetto && r.mesi.some(v => Number(v) > 0));
  // risorse uniche tra entrambe le fonti
  const risorseDaStaffing = new Set(staffingRows.map(r => r.risorsa));
  const risorseDaAssegnazioni = new Set(assegnati.map(a => {
    const op = state.operatori.find(o => o.id === a.operatore_id);
    return op ? op.nome_esteso : null;
  }).filter(Boolean));
  const totRisorseDistinte = new Set([...risorseDaStaffing, ...risorseDaAssegnazioni]).size;
  const pct = c.risorse_necessarie > 0 ? Math.min(100, (totRisorseDistinte/c.risorse_necessarie)*100) : 0;
  const statusColor = pct >= 100 ? 'bg-emerald-500' : (pct >= 50 ? 'bg-amber-500' : 'bg-red-500');

  const chips = assegnati.map(a => {
    const op = state.operatori.find(o => o.id === a.operatore_id);
    if (!op) return '';
    return `<span class="chip chip-drag ${a.forzata?'forzata':''}" draggable="true" data-cid="${c.id}" data-oid="${op.id}" title="${a.forzata?'Assegnazione forzata: skill non presente o operatore saturo':'Assegnazione drag&drop (full-time per tutta la finestra)'}">
      ${op.nome_esteso}
      <button class="chip-remove" data-cid="${c.id}" data-oid="${op.id}" aria-label="Rimuovi">×</button>
    </span>`;
  }).join('');
  const skillBadges = c.skills.map(s => `<span class="skill-badge req">${s}</span>`).join('');
  const attReq = c.attestati_richiesti || [];
  const attBadges = attReq.map(a => `<span class="att-badge req" title="Attestato richiesto: ${a}">${a.length>14 ? a.substring(0,13)+'…' : a}</span>`).join('');

  // tabella allocazioni dettagliate (gg per mese)
  let staffingTable = '';
  if (staffingRows.length > 0) {
    const rows = staffingRows.map(r => {
      const ggTot = r.mesi.reduce((s,v)=>s+(Number(v)||0), 0);
      const mesiHtml = r.mesi.map((v, i) => {
        const val = Number(v) || 0;
        if (val === 0) return `<td class="text-center text-slate-300 px-0.5">·</td>`;
        return `<td class="text-center p-0.5">
          <button class="edit-cell-staffing font-medium text-slate-700 hover:text-teal-700 hover:underline" data-idx="${r._idx}" data-mese="${i}" title="${MESI_LONG[i]}: ${val} gg · click per modificare">${val}</button>
        </td>`;
      }).join('');
      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="p-0.5 text-[10px]">${esc(r.risorsa)}${isOperatoreLicenziato(r.risorsa) ? '<span class="text-[9px] font-semibold bg-red-100 text-red-400 rounded px-1 ml-1">ex</span>' : ''}</td>
          ${mesiHtml}
          <td class="text-center text-[10px] font-medium text-slate-600 px-0.5">${ggTot}</td>
          <td class="p-0.5 text-right">
            <button class="del-staffing text-[10px] text-slate-400 hover:text-red-600" data-idx="${r._idx}" title="Rimuovi">🗑</button>
          </td>
        </tr>`;
    }).join('');
    staffingTable = `
      <div class="mt-2 overflow-x-auto border border-slate-200 rounded">
        <table class="w-full text-[9px]">
          <thead class="bg-slate-50">
            <tr>
              <th class="text-left p-0.5 font-medium text-slate-500">Risorsa</th>
              ${MESI.map(m => `<th class="text-center px-0.5 font-medium text-slate-500">${m}</th>`).join('')}
              <th class="text-center px-0.5 font-medium text-slate-500">Tot</th>
              <th class="p-0.5"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="commessa-card bg-white border border-slate-200 rounded-md p-3" data-cid="${c.id}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="industry-pill">${esc(c.industry || '—')}</span>
            ${pct >= 100 ? '<span class="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">✓ coperta</span>':''}
          </div>
          <div class="font-medium text-sm text-slate-900 truncate" title="${c.progetto}">${esc(c.progetto)}</div>
          <div class="text-xs text-slate-500">${esc(c.cliente)}</div>
          <div class="text-[11px] text-slate-500 mt-1">📅 ${fmtDate(c.inizio)} → ${fmtDate(c.fine)}</div>
          ${!c.email_referente ? '<div class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">⚠ referente tecnico non impostato</div>' : ''}
        </div>
        <div class="flex items-center gap-1">
          <button class="promote-c text-xs text-slate-400 hover:text-teal-700" data-id="${c.id}" title="Promuovi a commessa attiva">↗</button>
          <button class="edit-c text-xs text-slate-400 hover:text-teal-700" data-id="${c.id}" title="Modifica">✎</button>
          <button class="del-c text-xs text-slate-400 hover:text-red-600" data-id="${c.id}" title="Elimina">🗑</button>
        </div>
      </div>
      <div class="mb-2">${skillBadges || '<span class="text-[10px] text-slate-400">nessuna skill</span>'}${attBadges ? '<div class="mt-1">'+attBadges+'</div>' : ''}</div>
      <div class="flex items-center justify-between text-xs text-slate-600 mb-1">
        <span class="font-medium">${totRisorseDistinte}/${c.risorse_necessarie} risorse</span>
        <span class="text-[10px] text-slate-400">${Math.round(pct)}%</span>
      </div>
      <div class="h-1.5 bg-slate-100 rounded mb-2 overflow-hidden">
        <div class="h-full ${statusColor}" style="width:${pct}%"></div>
      </div>
      <div class="drop-zone p-2" data-commessa-id="${c.id}">
        ${chips || '<div class="text-[11px] text-slate-400 text-center py-1">Trascina qui un operatore (full-time per tutta la finestra)</div>'}
      </div>
      ${staffingTable}
      <div class="mt-2 text-right">
        <button class="add-risorsa-pipeline text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100" data-cid="${c.id}">+ Aggiungi con tempo specifico</button>
      </div>
    </div>
  `;
}

function renderCommesseAttive() {
  // raggruppa state.staffing per commessa (live, modificabile)
  const grouped = {};
  state.staffing.forEach((r, idx) => {
    if (!r.commessa) return;
    if (!grouped[r.commessa]) grouped[r.commessa] = [];
    grouped[r.commessa].push({ ...r, _idx: idx });
  });

  // Aggiungi anche le commesse attive promosse/create che NON hanno righe staffing
  state.commesse_attive.forEach(ca => {
    const nome = ca.progetto || ca.nome;
    if (!nome) return;
    if (!grouped[nome]) grouped[nome] = []; // card vuota ma visibile
  });
  // Aggiungi quelle presenti solo nei meta
  Object.keys(state.commesse_attive_meta || {}).forEach(nome => {
    if (!nome) return;
    if (!grouped[nome]) grouped[nome] = [];
  });

  // nomi commesse escluse permanentemente — escluse sempre dalla vista e dalla ricerca
  const nomiChiuse = new Set((state.commesse_escluse || []).map(n => (n||'').trim()).filter(Boolean));

  let keys = Object.keys(grouped).filter(k => !nomiChiuse.has(k.trim())).sort((a,b) => {
    if (a === 'ORE NON LAVORATE') return 1;
    if (b === 'ORE NON LAVORATE') return -1;
    return a.localeCompare(b);
  });
  // applica filtro ricerca
  const q = (state.searchCommesse || '').toLowerCase();
  if (q) keys = keys.filter(k => k.toLowerCase().includes(q));
  if (keys.length === 0) return `<div class="text-center text-sm text-slate-400 py-6">${q ? 'Nessuna commessa corrisponde alla ricerca.' : 'Nessuna commessa attiva.'}</div>`;

  const cardsHtml = keys.map(k => {
    const ass = grouped[k];
    const risorse = [...new Set(ass.map(a => a.risorsa))];
    const isOreNonLav = k === 'ORE NON LAVORATE';
    const totGG = ass.reduce((sum, a) => sum + a.mesi.reduce((s,v)=>s+(Number(v)||0), 0), 0);
    const mc = meseCorrente();

    // Commessa senza staffing: mostra card semplice con invito ad aggiungere risorse
    if (ass.length === 0) {
      const meta = state.commesse_attive_meta[k] || {};
      const meseSelVuota = _confrontoMeseSel[k] !== undefined ? _confrontoMeseSel[k] : mc;
      return `
        <div class="bg-white border border-teal-200 rounded-md p-3">
          <div class="flex items-start justify-between mb-1 gap-2">
            <div>
              <div class="font-medium text-sm text-slate-900">${k}</div>
              <div class="text-[11px] text-slate-400">${esc(meta.cliente || '')} · Nessuna risorsa allocata ancora</div>
              ${!meta.email_referente ? '<div class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">⚠ referente tecnico non impostato</div>' : ''}
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <button class="edit-attiva text-xs px-2 py-1 bg-white text-slate-700 rounded border border-slate-300 hover:bg-slate-50" data-commessa="${encodeURIComponent(k)}" title="Modifica dettagli">✎</button>
              <button class="add-risorsa-attiva text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100" data-commessa="${encodeURIComponent(k)}">+ Aggiungi risorsa</button>
              <button class="close-commessa text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100" data-commessa="${encodeURIComponent(k)}" title="Chiudi commessa">✓ Chiudi</button>
            </div>
          </div>
          <div class="text-[10px] text-teal-600 italic">Commessa attiva — aggiungi le risorse con "+ Aggiungi risorsa"</div>
          ${renderConfrontoBox(k, meseSelVuota)}
        </div>`;
    }

    const rows = ass.map(a => {
      const ggTot = a.mesi.reduce((s,v)=>s+(Number(v)||0), 0);
      const mesiHtml = a.mesi.map((v, i) => {
        const val = Number(v) || 0;
        const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
        const isPast = i < mc;
        const bgCls = isPast ? 'bg-slate-50' : (val > gl ? 'bg-red-50' : 'bg-white');
        const inputCls = val > gl
          ? 'border-red-400 text-red-700 font-bold'
          : (val > 0 ? 'border-slate-300 text-slate-800 font-medium' : 'border-slate-200 text-slate-400');
        const title = isPast
          ? `${MESI_LONG[i]} (mese storico) · ${gl} gg lavorativi`
          : `${MESI_LONG[i]} · ${gl} gg lavorativi disponibili`;
        return `<td class="p-0.5 ${bgCls}" title="${title}">
          <input type="number" min="0" max="99" step="0.5"
            class="inline-cell-input w-10 text-center text-[11px] border rounded py-0.5 ${inputCls} ${isPast?'opacity-50':''}"
            data-idx="${a._idx}" data-mese="${i}" data-gl="${gl}"
            value="${val || ''}" placeholder="·"
            ${isPast ? 'title="Mese storico — modifica comunque se necessario"' : ''}>
        </td>`;
      }).join('');
      return `
        <tr class="border-b border-slate-100 staffing-row" data-idx="${a._idx}">
          <td class="p-1 text-xs font-medium text-slate-800 sticky left-0 bg-white">${esc(a.risorsa)}${isOperatoreLicenziato(a.risorsa) ? '<span class="text-[9px] font-semibold bg-red-100 text-red-400 rounded px-1 ml-1">ex</span>' : ''}</td>
          ${mesiHtml}
          <td class="text-center text-xs font-semibold text-slate-700 px-1 row-total" data-idx="${a._idx}">${ggTot || '—'}</td>
          <td class="p-1 text-right">
            <button class="del-staffing text-xs text-slate-400 hover:text-red-600" data-idx="${a._idx}" title="Rimuovi tutta questa riga">🗑</button>
          </td>
        </tr>`;
    }).join('');

    // Stima fabbisogno
    let fabbisognoBox = '';
    if (!isOreNonLav) {
      const f = calcolaFabbisognoCommessa(k);
      if (f) {
        if (f.completata) {
          fabbisognoBox = `<div class="fabbisogno-box my-2 p-2 rounded border bg-slate-100 border-slate-300 text-[11px] text-slate-600">
            <b>⓵ Nessun carico futuro</b> · Tutte le ${f.mesiAttiviStorici} mesi allocati sono nel passato.
            Valuta di <b>chiudere</b> questa commessa per liberare formalmente le risorse.
          </div>`;
        } else if (f.mesiAttivi > 0) {
          const sr = Math.round(f.surplus * 100) / 100;
          let sLabel, sCls, sIcon;
          if (sr > 0.05)  { sLabel='+'+sr.toFixed(2)+' FTE surplus'; sCls='bg-amber-100 text-amber-800 border-amber-300'; sIcon='⚠'; }
          else if (sr < -0.05) { sLabel=Math.abs(sr).toFixed(2)+' FTE carenza'; sCls='bg-red-100 text-red-800 border-red-300'; sIcon='🔴'; }
          else { sLabel='ottimale'; sCls='bg-emerald-100 text-emerald-800 border-emerald-300'; sIcon='✓'; }
          const storico = f.mesiAttiviStorici > 0 ? ' <span class="text-[9px] text-slate-400">(+'+f.mesiAttiviStorici+' storici)</span>' : '';
          const fabbSrc = f.risDichiarate !== null ? '<span class="text-[9px] font-medium bg-blue-100 text-blue-700 px-1 rounded ml-1">📋 dichiarato</span>' : '<span class="text-[9px] text-slate-400 ml-1">(stimato)</span>';
          const meseRif = f.risDichiarate !== null && f.mesePeggioreFuturo >= 0 ? MESI_LONG[f.mesePeggioreFuturo] : null;
          const fteLabel = f.risDichiarate !== null
            ? '<b>'+(f.fteMesePeggiore||0).toFixed(2)+' FTE</b> nel mese più scoperto'+(meseRif?' <b>('+meseRif+')</b>':'')+' su <b>'+f.nNecessari+'</b> richiesti '+fabbSrc
            : f.fteNec+' FTE stimati (picco '+f.ftePicco.toFixed(2)+' a '+(f.mesePicco>=0?MESI_LONG[f.mesePicco]:'—')+') '+fabbSrc;
          fabbisognoBox = '<div class="fabbisogno-box my-2 p-2 rounded border '+sCls+'"><div class="flex items-center justify-between gap-2 flex-wrap"><div class="text-[11px]"><span class="font-semibold">Fabbisogno:</span> '+fteLabel+' · '+f.totGGFuturo+' gg-uomo'+storico+'</div><span class="text-[10px] font-bold px-2 py-0.5 rounded '+sCls.replace('-100','-200')+'">'+sIcon+' '+sLabel+'</span></div>'+(sr>0.05?'<div class="text-[10px] mt-1 text-amber-700">Surplus FTE in <b>'+(meseRif||'alcuni mesi')+'</b>. Clicca il mese ▲ per dettagli.</div>':'')+(sr<-0.05?'<div class="text-[10px] mt-1 text-red-700">Mancano FTE in <b>'+(meseRif||'alcuni mesi')+'</b>. Clicca il mese ▼ per suggerimenti.</div>':'')+'</div>';
        }
      }
    }
    const meta = state.commesse_attive_meta[k] || {};
    const meseSelConfronto = _confrontoMeseSel[k] !== undefined ? _confrontoMeseSel[k] : mc;
    const confrontoInfo = isOreNonLav ? null : calcolaConfrontoCommessa(k, meseSelConfronto);
    const nScostamentiConfronto = (confrontoInfo && !confrontoInfo.datiGrigliaAssenti)
      ? confrontoInfo.righe.filter(r => r.stato !== 'ok').length : 0;
    return `
      <details class="commessa-card bg-white border ${isOreNonLav?'border-slate-300 bg-slate-50':'border-slate-200'} rounded-md p-3">
        <summary class="flex items-start justify-between mb-0 gap-2 cursor-pointer list-none">
          <div class="flex items-start gap-2">
            <span class="chevron text-slate-400 text-xs mt-0.5 transition-transform">▸</span>
            <div>
              <div class="font-medium text-sm text-slate-900">${k}</div>
              <div class="text-[11px] text-slate-500">${risorse.length} risorse · ${ass.length} righe · ${totGG} gg-uomo totali</div>
              ${(!isOreNonLav && !meta.email_referente) ? '<div class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">⚠ referente tecnico non impostato</div>' : ''}
              ${nScostamentiConfronto > 0 ? `<div class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 inline-block">⚠ ${nScostamentiConfronto} scostamenti Griglia (${MESI[meseSelConfronto]})</div>` : ''}
            </div>
          </div>
          ${isOreNonLav ? '' : `
            <div class="flex items-center gap-1 flex-shrink-0">
              <button class="edit-attiva text-xs px-2 py-1 bg-white text-slate-700 rounded border border-slate-300 hover:bg-slate-50" data-commessa="${encodeURIComponent(k)}" title="Modifica dettagli, date, proroga, note">✎</button>
              <button class="add-risorsa-attiva text-xs px-2 py-1 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100" data-commessa="${encodeURIComponent(k)}">+ Aggiungi</button>
              <button class="close-commessa text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100" data-commessa="${encodeURIComponent(k)}" title="Chiudi commessa e libera personale">✓ Chiudi</button>
            </div>
          `}
        </summary>
        <div class="mt-2">
          ${fabbisognoBox}
          ${meta.attestati_richiesti && meta.attestati_richiesti.length > 0 ? `<div class="mb-2 flex flex-wrap gap-1">${meta.attestati_richiesti.map(a => `<span class="att-badge req text-[10px] font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded" title="Attestato richiesto: ${a}">${a.length>14 ? a.substring(0,13)+'…' : a}</span>`).join('')}</div>` : ''}
          ${meta.dpi_richiesti && meta.dpi_richiesti.length > 0 ? `<div class="mb-2 flex flex-wrap gap-1">${meta.dpi_richiesti.map(d => `<span class="dpi-badge req text-[10px] font-medium bg-yellow-100 text-yellow-700 px-2 py-1 rounded" title="DPI richiesto: ${d}">${d}</span>`).join('')}</div>` : ''}
          <div class="overflow-x-auto">
            <table class="w-full text-[10px]">
              <thead class="bg-slate-50">
                <tr>
                  <th class="text-left text-xs font-semibold text-slate-600 p-1 sticky left-0 bg-slate-50">Risorsa</th>
                  ${MESI.map((m,i)=>`<th class="text-center text-[8px] font-medium ${i<mc?'text-slate-300':'text-slate-500'} px-0.5">${m}</th>`).join('')}
                  <th class="text-center text-[8px] font-medium text-slate-500 px-1">TOT</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${isOreNonLav ? '' : renderConfrontoBox(k, meseSelConfronto)}
        </div>
      </details>`;
  }).join('');

  // Archivio commesse chiuse in fondo
  const archivioHtml = renderArchivioCommesseChiuse();

  return `<div class="space-y-3">${cardsHtml}</div>${archivioHtml}`;
}

