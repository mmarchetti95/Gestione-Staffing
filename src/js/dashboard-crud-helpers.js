/* ===================== CRUD ===================== */
function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">${html}</div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function openCommessaModal(id) {
  const c = id ? state.pipeline.find(p => p.id === id) : { id:'p_new_'+Date.now(), cliente:'', progetto:'', industry: INDUSTRIES[0], inizio:'', fine:'', risorse_necessarie:1, skills:[], attestati_richiesti:[], email_referente:'', regione:'', provincia:'' };
  const regioneIniziale = c.regione || (c.provincia && provinciaInfo(c.provincia)?.regione) || '';
  const cAttReq = c.attestati_richiesti || [];
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-3">${id?'Modifica':'Nuova'} commessa pipeline</h3>
    <div class="space-y-2">
      <label class="block text-xs"><span class="text-slate-600">Cliente</span><input id="m-cliente" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(c.cliente||'').replace(/"/g, '&quot;')}"></label>
      <label class="block text-xs"><span class="text-slate-600">Progetto</span><input id="m-progetto" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(c.progetto||'').replace(/"/g, '&quot;')}"></label>
      <label class="block text-xs"><span class="text-slate-600">Email referente tecnico <span class="text-red-500">*</span> <span class="text-slate-400 font-normal">(una o più, separate da virgola)</span></span><input id="m-email-ref" type="text" placeholder="mario.rossi@cliente.it, luigi.bianchi@cliente.it" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(c.email_referente||'').replace(/"/g, '&quot;')}"></label>
      <label class="block text-xs"><span class="text-slate-600">Industry</span>
        <select id="m-industry" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
          ${INDUSTRIES.map(i => `<option ${i===c.industry?'selected':''}>${i}</option>`).join('')}
        </select>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Data inizio</span><input id="m-inizio" type="date" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${c.inizio?c.inizio.slice(0,10):''}"></label>
        <label class="block text-xs"><span class="text-slate-600">Data fine</span><input id="m-fine" type="date" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${c.fine?c.fine.slice(0,10):''}"></label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Regione di lavorazione <span class="text-slate-400 font-normal">(usata per suggerire gli operatori più vicini)</span></span>
          <select id="m-regione" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
            <option value="">(non specificata)</option>
            ${REGIONI_ITALIA.map(r => `<option value="${esc(r)}" ${r===regioneIniziale?'selected':''}>${esc(r)}</option>`).join('')}
          </select>
        </label>
        <label class="block text-xs"><span class="text-slate-600">Provincia <span class="text-slate-400 font-normal">(facoltativa)</span></span>
          <select id="m-provincia" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"></select>
        </label>
      </div>
      <label class="block text-xs"><span class="text-slate-600">Risorse necessarie</span>
        <div class="flex items-center gap-2 mt-0.5">
          <input id="m-risorse" type="number" min="1" class="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm" value="${c.risorse_necessarie||1}">
          <button type="button" id="m-btn-fabbisogno" class="px-2 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 whitespace-nowrap" title="Definisci quanti operatori per skill">🎯 Dettaglio skill</button>
        </div>
        ${(c.fabbisogno_dettagliato||[]).length > 0 ? `<div class="mt-1 text-[10px] text-teal-700 bg-teal-50 rounded px-2 py-1 border border-teal-100">Fabbisogno dettagliato: ${(c.fabbisogno_dettagliato||[]).map(r => `${r.quantita}× ${r.skills.length?r.skills.join('+'):'qualsiasi'}`).join(', ')}</div>` : ''}
      </label>
      <div>
        <div class="text-xs text-slate-600 mb-1 font-medium">Skill richieste</div>
        <div class="grid grid-cols-3 gap-1 p-2 bg-slate-50 rounded border border-slate-200">
          ${SKILLS.map(s => `<label class="flex items-center gap-1 text-xs hover:bg-white rounded px-1 cursor-pointer"><input type="checkbox" class="m-skill" value="${s}" ${c.skills.includes(s)?'checked':''}>${s}</label>`).join('')}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs text-slate-600 font-medium">Attestati e certificazioni richiesti</div>
          <div class="flex gap-1">
            <button type="button" id="m-att-all" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200">Tutti</button>
            <button type="button" id="m-att-none" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200">Nessuno</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1 p-2 bg-purple-50 rounded border border-purple-200 max-h-56 overflow-y-auto">
          ${ATTESTATI.map(a => `<label class="flex items-center gap-1 text-xs hover:bg-white rounded px-1 cursor-pointer"><input type="checkbox" class="m-att" value="${a.replace(/"/g, '&quot;')}" ${cAttReq.includes(a)?'checked':''}><span>${a}</span></label>`).join('')}
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="m-save" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  function rebuildProvinciaOptionsCommessa(preselect) {
    const regioneSel = document.getElementById('m-regione').value;
    const provSel = document.getElementById('m-provincia');
    if (!regioneSel) {
      provSel.innerHTML = '<option value="">(seleziona prima una regione)</option>';
      provSel.disabled = true;
      return;
    }
    provSel.disabled = false;
    const value = preselect !== undefined ? preselect : provSel.value;
    provSel.innerHTML = '<option value="">(non specificata)</option>' +
      provinceDiRegione(regioneSel).map(p => `<option value="${p.sigla}" ${p.sigla===value?'selected':''}>${esc(p.nome)} (${p.sigla})</option>`).join('');
  }
  rebuildProvinciaOptionsCommessa(c.provincia || '');
  document.getElementById('m-regione').onchange = () => rebuildProvinciaOptionsCommessa('');

  document.getElementById('m-att-all').onclick = () => document.querySelectorAll('.m-att').forEach(x => x.checked = true);
  document.getElementById('m-att-none').onclick = () => document.querySelectorAll('.m-att').forEach(x => x.checked = false);
  document.getElementById('m-btn-fabbisogno').onclick = () => {
    // Salva in bozza i dati correnti prima di aprire il sub-modal
    const tempC = state.pipeline.find(p => p.id === c.id);
    const cid = c.id;
    closeModal();
    // Riapre dopo chiusura
    setTimeout(() => openFabbisognoModal(cid, null), 50);
  };

  document.getElementById('m-save').onclick = async () => {
    const emailRefList = parseEmailList(document.getElementById('m-email-ref').value);
    if (!emailRefList) { showAlertModal('Email referente tecnico obbligatoria: inserisci una o più email valide separate da virgola.'); return; }
    const newC = {
      id: c.id,
      cliente: document.getElementById('m-cliente').value.trim(),
      progetto: document.getElementById('m-progetto').value.trim(),
      email_referente: emailRefList.join(', '),
      industry: document.getElementById('m-industry').value,
      inizio: document.getElementById('m-inizio').value,
      fine: document.getElementById('m-fine').value,
      regione: document.getElementById('m-regione').value,
      provincia: document.getElementById('m-provincia').value,
      risorse_necessarie: parseInt(document.getElementById('m-risorse').value)||0,
      skills: [...document.querySelectorAll('.m-skill:checked')].map(x => x.value),
      attestati_richiesti: [...document.querySelectorAll('.m-att:checked')].map(x => x.value),
    };
    if (!newC.progetto || !newC.cliente) { showAlertModal('Cliente e Progetto sono obbligatori.'); return; }
    if (id) { Object.assign(state.pipeline.find(p => p.id === id), newC); await saveState('Modifica commessa pipeline', {commessa: newC.progetto, cliente: newC.cliente}); }
    else { state.pipeline.push(newC); await saveState('Nuova commessa pipeline', {commessa: newC.progetto, cliente: newC.cliente}); }
    renderAll(); closeModal();
  };
}

/* ===================== FABBISOGNO DETTAGLIATO PER SKILL =====================
   Funzione condivisa tra commesse pipeline e commesse attive.
   - commessaId: id della commessa pipeline (stringa) OPPURE null se attiva
   - commessaNome: nome della commessa attiva (stringa) OPPURE null se pipeline
*/
function openFabbisognoModal(commessaId, commessaNome) {
  // Recupera oggetto commessa e fabbisogno corrente
  let tipoCommessa, nomeDisplay, fabbisognoCorrente, inizio, fine, attestatiRichiesti, provinciaCommessa, regioneCommessa;
  if (commessaId) {
    tipoCommessa = 'pipeline';
    const c = state.pipeline.find(p => p.id === commessaId);
    if (!c) return;
    nomeDisplay = `${c.cliente} — ${c.progetto}`;
    fabbisognoCorrente = c.fabbisogno_dettagliato || [];
    inizio = c.inizio; fine = c.fine;
    attestatiRichiesti = c.attestati_richiesti || [];
    provinciaCommessa = c.provincia || '';
    regioneCommessa = c.regione || '';
  } else {
    tipoCommessa = 'attiva';
    const m = state.commesse_attive_meta[commessaNome] || {};
    nomeDisplay = commessaNome;
    fabbisognoCorrente = m.fabbisogno_dettagliato || [];
    inizio = m.inizio; fine = m.fine;
    attestatiRichiesti = m.attestati_richiesti || [];
    provinciaCommessa = m.provincia || '';
    regioneCommessa = m.regione || '';
  }

  // Clona fabbisogno in locale per editing
  let righe = fabbisognoCorrente.map(r => ({...r}));
  if (righe.length === 0) righe.push({ quantita: 1, skills: [] });

  function totaleRighe() { return righe.reduce((s, r) => s + (parseInt(r.quantita)||0), 0); }

  function suggestOperatoriPerRiga(riga) {
    const mesiC = inizio && fine ? monthsBetween(inizio, fine) : [];
    return getOperatoriAttivi().map(op => {
      const matchSkill = riga.skills.length === 0 || riga.skills.every(s => op.skills.includes(s));
      const sat = mesiC.length ? operatoreSatPeriodo(op, mesiC) : 0;
      const skillMancanti = riga.skills.filter(s => !op.skills.includes(s));
      const attestatiMancanti = attNonCoperti(op, attestatiRichiesti);
      const matchCompleto = matchSkill && attestatiMancanti.length === 0;
      // null = ne' regione ne' provincia della commessa (o provincia dell'operatore) note,
      // nessun criterio di vicinanza applicabile
      const distanza = distanzaLavorazione(regioneCommessa, provinciaCommessa, op.provincia, op.regione);
      return { op, matchSkill, matchCompleto, sat, skillMancanti, attestatiMancanti, distanza };
    })
    .filter(x => x.sat < 1.0 || x.matchCompleto) // mostra anche saturi se idonei al 100% (skill+attestati)
    .sort((a, b) => {
      // prima i validi (tutte le skill+attestati richiesti)
      if (a.matchCompleto !== b.matchCompleto) return a.matchCompleto ? -1 : 1;
      // poi chi e' nella stessa provincia/regione (o comunque piu' vicino) viene prima;
      // chi ha provincia sconosciuta va dopo chi e' geolocalizzato ma lontano
      if (a.distanza !== b.distanza) {
        if (a.distanza === null) return 1;
        if (b.distanza === null) return -1;
        if (a.distanza !== b.distanza) return a.distanza - b.distanza;
      }
      // infine, in generale, ordine alfabetico
      return a.op.nome_esteso.localeCompare(b.op.nome_esteso);
    })
    .slice(0, 6);
  }

  function renderRighe() {
    const wrap = document.getElementById('fb-righe');
    if (!wrap) return;
    const tot = totaleRighe();
    wrap.innerHTML = righe.map((riga, idx) => {
      const candidati = suggestOperatoriPerRiga(riga);
      const skillsLabel = riga.skills.length > 0
        ? riga.skills.map(s => `<span class="skill-badge req text-[9px]">${s}</span>`).join('')
        : '<span class="text-[10px] text-slate-400 italic">nessuna skill specifica</span>';

      const candidatiHtml = candidati.length === 0
        ? `<div class="text-[10px] text-red-600 mt-1 pl-1">⚠ Nessun operatore disponibile — valuta assunzione</div>`
        : candidati.map(({op, matchSkill, matchCompleto, sat, skillMancanti, attestatiMancanti, distanza}) => {
            const satPct = Math.round(sat*100);
            const satCls = sat < 0.5 ? 'text-emerald-700' : sat < 0.85 ? 'text-amber-600' : 'text-red-600';
            const skillBadge = matchSkill
              ? `<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">✓ skill OK</span>`
              : `<span class="text-[9px] bg-red-100 text-red-700 px-1 rounded">manca skill: ${skillMancanti.join(', ')}</span>`;
            const attBadge = attestatiMancanti.length > 0
              ? '<span class="text-[9px] bg-purple-100 text-purple-700 px-1 rounded" title="Attestati richiesti dalla commessa, mancanti o scaduti">manca attestato: ' + esc(attestatiMancanti.map(a => attEtichettaMancanza(op, a)).join(', ')) + '</span>'
              : '';
            const geoBadge = distanza === null ? '' : distanza === 0
              ? (provinciaCommessa
                  ? `<span class="text-[9px] bg-sky-100 text-sky-700 px-1 rounded" title="Stessa provincia della commessa">📍 stessa provincia</span>`
                  : `<span class="text-[9px] bg-sky-100 text-sky-700 px-1 rounded" title="Stessa regione della commessa">📍 stessa regione</span>`)
              : `<span class="text-[9px] bg-sky-50 text-sky-700 px-1 rounded" title="Distanza dalla zona di lavorazione della commessa">📍 ~${Math.round(distanza)} km</span>`;
            // Colore leggero del riquadro: verde chi ha tutti i requisiti, ambra chi no —
            // per distinguerli a colpo d'occhio senza appesantire la lista.
            const cardCls = matchCompleto ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200';
            return `<div class="flex items-center justify-between px-2 py-1 ${cardCls} rounded border text-[10px]">
              <span class="font-medium text-slate-800">${esc(op.nome_esteso)}</span>
              <span class="flex items-center gap-1 flex-wrap justify-end">${skillBadge} ${attBadge} ${geoBadge} <span class="${satCls} font-medium">${satPct}% sat</span></span>
            </div>`;
          }).join('');

      return `<div class="fb-riga border border-slate-200 rounded-lg p-2.5 bg-slate-50" data-idx="${idx}">
        <div class="flex items-start gap-2 mb-2">
          <div class="flex flex-col items-center gap-1">
            <label class="text-[9px] text-slate-500 uppercase">N°</label>
            <input type="number" min="1" max="200" value="${riga.quantita||1}"
              class="w-14 text-center border border-slate-300 rounded px-1 py-1 text-sm font-bold bg-white fb-qty"
              data-idx="${idx}">
          </div>
          <div class="flex-1">
            <div class="text-[9px] text-slate-500 uppercase mb-1">operatori con skill</div>
            <div class="grid grid-cols-3 gap-1 p-1.5 bg-white rounded border border-slate-200">
              ${SKILLS.map(s => `<label class="flex items-center gap-1 text-[10px] cursor-pointer hover:bg-slate-50 rounded px-0.5">
                <input type="checkbox" class="fb-skill" data-idx="${idx}" value="${s}" ${(riga.skills||[]).includes(s)?'checked':''}>${s}
              </label>`).join('')}
            </div>
          </div>
          <button class="fb-del-riga text-slate-300 hover:text-red-500 text-lg leading-none mt-0.5" data-idx="${idx}" title="Rimuovi riga">×</button>
        </div>
        <div class="mt-1.5">
          <div class="text-[9px] text-slate-500 uppercase mb-1 font-medium">
            ${riga.skills.length > 0 ? '🎯 Operatori suggeriti · skill: ' + skillsLabel : '🎯 Operatori suggeriti (qualsiasi skill)'}
            ${attestatiRichiesti.length > 0 ? ' · attestati richiesti: <span class="text-purple-700 font-semibold">' + attestatiRichiesti.join(', ') + '</span>' : ''}
          </div>
          <div class="space-y-0.5">${candidatiHtml}</div>
        </div>
      </div>`;
    }).join('');

    // Totale
    const totEl = document.getElementById('fb-totale');
    if (totEl) totEl.textContent = `Totale: ${tot} operatori`;

    // Re-bind eventi
    wrap.querySelectorAll('.fb-qty').forEach(inp => {
      inp.oninput = () => { righe[parseInt(inp.dataset.idx)].quantita = parseInt(inp.value)||1; renderRighe(); };
    });
    wrap.querySelectorAll('.fb-skill').forEach(cb => {
      cb.onchange = () => {
        const idx = parseInt(cb.dataset.idx);
        const s = cb.value;
        if (cb.checked) { if (!righe[idx].skills.includes(s)) righe[idx].skills.push(s); }
        else { righe[idx].skills = righe[idx].skills.filter(x => x !== s); }
        renderRighe();
      };
    });
    wrap.querySelectorAll('.fb-del-riga').forEach(btn => {
      btn.onclick = () => { if (righe.length > 1) { righe.splice(parseInt(btn.dataset.idx), 1); renderRighe(); } };
    });
  }

  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-1">
      <div>
        <h3 class="font-semibold text-slate-900">Fabbisogno dettagliato per skill</h3>
        <p class="text-xs text-slate-500">${nomeDisplay}</p>
      </div>
      <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700 text-xl">×</button>
    </div>
    <p class="text-[11px] text-blue-800 mb-3 bg-blue-50 border border-blue-100 rounded px-2 py-1.5">
      Definisci quanti operatori ti servono per ogni combinazione di skill. Per ogni riga vedrai i candidati interni ordinati per saturazione.
    </p>
    <div id="fb-righe" class="space-y-2 mb-3"></div>
    <div class="flex items-center justify-between">
      <button id="fb-add-riga" class="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100">+ Aggiungi riga</button>
      <span id="fb-totale" class="text-sm font-semibold text-slate-700"></span>
    </div>
    <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="fb-save" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva fabbisogno</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  renderRighe();

  document.getElementById('fb-add-riga').onclick = () => {
    righe.push({ quantita: 1, skills: [] });
    renderRighe();
  };

  document.getElementById('fb-save').onclick = async () => {
    const tot = totaleRighe();
    if (commessaId) {
      const c = state.pipeline.find(p => p.id === commessaId);
      if (c) {
        c.fabbisogno_dettagliato = righe;
        c.risorse_necessarie = tot; // aggiorna automaticamente il totale
      }
    } else {
      if (!state.commesse_attive_meta[commessaNome]) state.commesse_attive_meta[commessaNome] = {};
      state.commesse_attive_meta[commessaNome].fabbisogno_dettagliato = righe;
      state.commesse_attive_meta[commessaNome].risorse_necessarie = tot;
    }
    await saveState(); renderAll(); closeModal();
  };
}

async function deleteCommessa(id) {
  if (!await showConfirmAsync('Eliminare la commessa? Le assegnazioni verranno rimosse.', 'Elimina commessa')) return;
  const delC = state.pipeline.find(p => p.id === id);
  state.pipeline = state.pipeline.filter(p => p.id !== id);
  state.assegnazioni = state.assegnazioni.filter(a => a.commessa_id !== id);
  await saveState('Eliminazione commessa pipeline', {commessa: delC?.progetto||id}); renderAll();
}

async function promuoviCommessa(id) {
  const c = state.pipeline.find(p => p.id === id);
  if (!c) return;
  if (!await showConfirmAsync(`Promuovere "${c.progetto}" a commessa attiva?`, 'Promuovi')) return;

  const nuovaAttiva = { id: 'ca_'+Date.now(), progetto: c.progetto, cliente: c.cliente };
  state.commesse_attive.push(nuovaAttiva);

  // Salva anche nei meta così pwGetCommesseValide() la trova subito
  if (!state.commesse_attive_meta[c.progetto]) {
    state.commesse_attive_meta[c.progetto] = {
      cliente: c.cliente || '',
      industry: c.industry || '',
      inizio: c.inizio || '',
      fine: c.fine || '',
      note: '',
      skills: c.skills || [],
      attestati_richiesti: c.attestati_richiesti || []
    };
  }

  const extra = (await sget('commesse_attive_extra')) || [];
  extra.push({ progetto: c.progetto, cliente: c.cliente });
  await sset('commesse_attive_extra', extra);

  state.pipeline = state.pipeline.filter(p => p.id !== id);
  state.assegnazioni = state.assegnazioni.filter(a => a.commessa_id !== id);
  await saveState();
  renderAll();
}

function openOperatoreModal(id) {
  const op = id ? state.operatori.find(o => o.id === id) : { id:'op_new_'+Date.now(), nome_breve:'', nome_esteso:'', nome:'', cognome:'', email:'', regione:'', provincia:'', contratto_tipo:'indeterminato', data_inizio_rapporto:'', data_fine_rapporto:'', skills:[], attestati:[], attestati_dett:{}, alloc_mensile:new Array(12).fill(0), data_aggiunta: new Date().toISOString().slice(0,10) };
  const opAtt = op.attestati || [];
  const regioneIniziale = op.regione || (op.provincia && provinciaInfo(op.provincia)?.regione) || '';
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-3">${id?'Modifica':'Nuovo'} operatore</h3>
    <div class="space-y-3">
      <label class="block text-xs"><span class="text-slate-600">Nome esteso</span><input id="mo-esteso" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(op.nome_esteso||'').replace(/"/g, '&quot;')}"></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Nome <span class="text-slate-400 font-normal">(facolt., per sottotask Jira)</span></span>
          <input id="mo-nome" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(op.nome||'').replace(/"/g, '&quot;')}"></label>
        <label class="block text-xs"><span class="text-slate-600">Cognome <span class="text-slate-400 font-normal">(facolt., per sottotask Jira)</span></span>
          <input id="mo-cognome" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(op.cognome||'').replace(/"/g, '&quot;')}"></label>
      </div>
      <label class="block text-xs"><span class="text-slate-600">Email aziendale</span><input id="mo-email" type="email" placeholder="nome@eagleprojects.it" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(op.email||'').replace(/"/g, '&quot;')}"></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Regione di provenienza</span>
          <select id="mo-regione" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
            <option value="">— non specificata —</option>
            ${REGIONI_ITALIA.map(r => `<option value="${esc(r)}" ${r===regioneIniziale?'selected':''}>${esc(r)}</option>`).join('')}
          </select>
        </label>
        <label class="block text-xs"><span class="text-slate-600">Provincia <span class="text-slate-400 font-normal">(facoltativa)</span></span>
          <select id="mo-provincia" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"></select>
        </label>
      </div>
      <div>
        <div class="text-xs text-slate-600 mb-1 font-medium">Tipo di rapporto</div>
        <div class="flex gap-4 text-xs mb-1.5">
          <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="mo-contratto" id="mo-contratto-indet" value="indeterminato" ${op.contratto_tipo!=='determinato'?'checked':''}> Tempo indeterminato</label>
          <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="mo-contratto" id="mo-contratto-det" value="determinato" ${op.contratto_tipo==='determinato'?'checked':''}> A termine (data inizio/fine)</label>
        </div>
        <div id="mo-contratto-date" class="grid grid-cols-2 gap-2 ${op.contratto_tipo==='determinato'?'':'hidden'}">
          <label class="block text-xs"><span class="text-slate-500">Data inizio</span><input id="mo-data-inizio" type="date" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${op.data_inizio_rapporto||''}"></label>
          <label class="block text-xs"><span class="text-slate-500">Data fine</span><input id="mo-data-fine" type="date" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${op.data_fine_rapporto||''}"></label>
        </div>
      </div>
      <div>
        <div class="text-xs text-slate-600 mb-1 font-medium">Skill</div>
        <div class="grid grid-cols-3 gap-1 p-2 bg-slate-50 rounded border border-slate-200">
          ${SKILLS.map(s => `<label class="flex items-center gap-1 text-xs hover:bg-white rounded px-1 cursor-pointer"><input type="checkbox" class="mo-skill" value="${s}" ${op.skills.includes(s)?'checked':''}>${s}</label>`).join('')}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs text-slate-600 font-medium">Attestati e certificazioni posseduti</div>
          <div class="flex gap-1">
            <button type="button" id="mo-att-all" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200">Tutti</button>
            <button type="button" id="mo-att-none" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200">Nessuno</button>
          </div>
        </div>
        <div class="space-y-0.5 p-2 bg-purple-50 rounded border border-purple-200 max-h-56 overflow-y-auto">
          <div class="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider px-1 pb-0.5">
            <span class="w-3"></span><span class="flex-1">Attestato</span><span class="w-[118px]">Data del corso</span><span class="w-[86px] text-right">Scadenza</span>
          </div>
          ${ATTESTATI.map(a => attRigaModaleOperatore(op, a)).join('') || '<div class="text-[10px] text-slate-400 italic">Nessun attestato definito nel sistema.</div>'}
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="mo-save" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  function rebuildProvinciaOptionsOperatore(preselect) {
    const regioneSel = document.getElementById('mo-regione').value;
    const provSel = document.getElementById('mo-provincia');
    if (!regioneSel) {
      provSel.innerHTML = '<option value="">(seleziona prima una regione)</option>';
      provSel.disabled = true;
      return;
    }
    provSel.disabled = false;
    const value = preselect !== undefined ? preselect : provSel.value;
    provSel.innerHTML = '<option value="">(non specificata)</option>' +
      provinceDiRegione(regioneSel).map(p => `<option value="${p.sigla}" ${p.sigla===value?'selected':''}>${esc(p.nome)} (${p.sigla})</option>`).join('');
  }
  rebuildProvinciaOptionsOperatore(op.provincia || '');
  document.getElementById('mo-regione').onchange = () => rebuildProvinciaOptionsOperatore('');

  document.getElementById('mo-att-all').onclick = () => document.querySelectorAll('.mo-att').forEach(x => x.checked = true);
  document.getElementById('mo-att-none').onclick = () => document.querySelectorAll('.mo-att').forEach(x => x.checked = false);

  // Compilando la data del corso l'attestato si spunta da solo e la scadenza calcolata
  // compare subito accanto: evita la combinazione incoerente "data valorizzata, spunta no".
  document.querySelectorAll('.mo-att-corso').forEach(inp => {
    inp.addEventListener('change', () => {
      const riga = inp.closest('.mo-att-riga');
      if (!riga) return;
      const cb = riga.querySelector('.mo-att');
      const out = riga.querySelector('.mo-att-scad');
      if (inp.value && cb) cb.checked = true;
      const scad = attScadenzaDaCorso(inp.dataset.att, inp.value);
      if (out) out.textContent = scad ? fmtDate(scad) : (inp.value ? 'senza scadenza' : '');
    });
  });

  const contrattoDateBox = document.getElementById('mo-contratto-date');
  document.querySelectorAll('input[name="mo-contratto"]').forEach(r => {
    r.onchange = () => contrattoDateBox.classList.toggle('hidden', !document.getElementById('mo-contratto-det').checked);
  });

  document.getElementById('mo-save').onclick = async () => {
    const nomeEsteso = document.getElementById('mo-esteso').value.trim();
    if (!nomeEsteso) { showAlertModal('Nome obbligatorio.'); return; }
    const skills = [...document.querySelectorAll('.mo-skill:checked')].map(x => x.value);
    const attestati = [...document.querySelectorAll('.mo-att:checked')].map(x => x.value);
    // Dettaglio date: una voce gia' presente e non modificata conserva la sua fonte
    // (tipicamente 'import'); se la data viene cambiata a mano diventa 'manuale' e da quel
    // momento sopravvive ai reimport del file aziendale.
    const dettPrec = op.attestati_dett || {};
    const attestatiDett = {};
    document.querySelectorAll('.mo-att-riga').forEach(riga => {
      const cb = riga.querySelector('.mo-att');
      if (!cb || !cb.checked) return;
      const nomeAtt = cb.value;
      const inpCorso = riga.querySelector('.mo-att-corso');
      const corso = inpCorso ? inpCorso.value : '';
      const prec = dettPrec[nomeAtt];
      if (!corso) { if (prec) attestatiDett[nomeAtt] = prec; return; }
      if (prec && prec.corso === corso) { attestatiDett[nomeAtt] = prec; return; }
      attestatiDett[nomeAtt] = { corso: corso, scad: attScadenzaDaCorso(nomeAtt, corso), fonte: 'manuale' };
    });
    const nome = (document.getElementById('mo-nome')?.value || '').trim();
    const cognome = (document.getElementById('mo-cognome')?.value || '').trim();
    const email = (document.getElementById('mo-email')?.value || '').trim();
    const regione = document.getElementById('mo-regione')?.value || '';
    const provincia = document.getElementById('mo-provincia')?.value || '';
    const contrattoTipo = document.getElementById('mo-contratto-det').checked ? 'determinato' : 'indeterminato';
    const dataInizio = document.getElementById('mo-data-inizio')?.value || '';
    const dataFine = document.getElementById('mo-data-fine')?.value || '';
    if (contrattoTipo === 'determinato' && dataInizio && dataFine && dataFine < dataInizio) {
      showAlertModal('La data di fine non può essere precedente alla data di inizio.'); return;
    }
    const dataInizioRapporto = contrattoTipo === 'determinato' ? dataInizio : '';
    const dataFineRapporto = contrattoTipo === 'determinato' ? dataFine : '';
    if (id) { Object.assign(op, { nome_esteso: nomeEsteso, nome, cognome, email, regione, provincia, contratto_tipo: contrattoTipo, data_inizio_rapporto: dataInizioRapporto, data_fine_rapporto: dataFineRapporto, skills, attestati, attestati_dett: attestatiDett }); await saveState('Modifica operatore', {operatore: nomeEsteso}, true); }
    else { state.operatori.push({ ...op, nome_esteso: nomeEsteso, nome_breve: nomeEsteso, nome, cognome, email, regione, provincia, contratto_tipo: contrattoTipo, data_inizio_rapporto: dataInizioRapporto, data_fine_rapporto: dataFineRapporto, skills, attestati, attestati_dett: attestatiDett }); await saveState('Nuovo operatore', {operatore: nomeEsteso}, true); }
    renderAll(); closeModal();
  };
}

// esc() globale per HTML escaping — usata da showAlertModal, showConfirmAsync e tutti i render
const esc = v => (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Escape sicuro per una stringa passata dentro un onclick="...'VALORE'...":
// gestisce backslash e apice (contesto JS a virgolette singole) e doppio apice
// (contesto attributo HTML). Usare per QUALSIASI dato dinamico dentro un onclick.
const jsAttr = v => String(v == null ? '' : v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');

// Valida una stringa di una o più email separate da virgola (formato base).
// Ritorna l'array di email pulite, o null se vuota o con almeno una voce non valida.
function parseEmailList(str) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const parts = String(str || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some(p => !emailRe.test(p))) return null;
  return [...new Set(parts)];
}

function showConfirm(htmlMsg, onConfirm) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5"><div class="mb-4">' + htmlMsg + '</div><div class="flex justify-end gap-2"><button id="sc-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button><button id="sc-confirm" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">Conferma eliminazione</button></div></div></div>';
  document.getElementById('sc-cancel').onclick = () => closeModal();
  document.getElementById('sc-confirm').onclick = () => { closeModal(); onConfirm(); };
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
}

function showAlertModal(msg) {
  const root = document.getElementById('modal-root');
  const safeMsg = typeof msg === 'string' ? esc(msg).replace(/\n/g, '<br>') : String(msg);
  root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5"><div class="mb-4 whitespace-pre-line">' + safeMsg + '</div><div class="flex justify-end"><button id="sa-ok" class="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">OK</button></div></div></div>';
  document.getElementById('sa-ok').onclick = () => closeModal();
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
}

function showConfirmAsync(msg, btnLabel) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const safeMsg = typeof msg === 'string' ? esc(msg).replace(/\n/g, '<br>') : String(msg);
    const label = btnLabel || 'Conferma';
    root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5"><div class="mb-4 whitespace-pre-line">' + safeMsg + '</div><div class="flex justify-end gap-2"><button id="sca-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button><button id="sca-confirm" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">' + esc(label) + '</button></div></div></div>';
    document.getElementById('sca-cancel').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('sca-confirm').onclick = () => { closeModal(); resolve(true); };
    root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) { closeModal(); resolve(false); } });
  });
}

/* Vero se il rapporto a termine e' scaduto (data fine gia' passata rispetto a oggi).
   Calcolato, non persistito: basta correggere/rimuovere la data fine per "riattivare"
   l'operatore, senza dover disfare un flag manuale. */
function isOperatoreScaduto(op) {
  if (!op || op.contratto_tipo !== 'determinato' || !op.data_fine_rapporto) return false;
  return op.data_fine_rapporto < new Date().toISOString().slice(0, 10);
}

function getOperatoriAttivi() {
  return (state.operatori || []).filter(o => !o.licenziato && !isOperatoreScaduto(o));
}

/* Indice mese (0-11) di fine rapporto entro l'ANNO visualizzato:
   -1 se il rapporto e' terminato in un anno precedente (tutti i mesi dell'ANNO contano come "dopo"),
   12 se termina in un anno successivo (nessun mese dell'ANNO conta come "dopo"). */
function meseFineRapportoInAnno(op) {
  if (!op || !op.data_fine_rapporto) return null;
  const d = new Date(op.data_fine_rapporto + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < ANNO) return -1;
  if (y > ANNO) return 12;
  return d.getUTCMonth();
}

// Modale di selezione: mostra una tendina di opzioni e risolve col valore scelto (o null).
// options: array di { value, label }.
function cpSelectModal(title, message, options) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const opts = (options || []).map(o => `<option value="${esc(String(o.value))}">${esc(String(o.label))}</option>`).join('');
    const safeMsg = message ? ('<div class="mb-3 text-sm whitespace-pre-line">' + esc(message).replace(/\n/g,'<br>') + '</div>') : '';
    root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">' +
      '<div class="mb-3 font-semibold">' + esc(title || 'Seleziona') + '</div>' + safeMsg +
      '<select id="csm-sel" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-4">' + opts + '</select>' +
      '<div class="flex justify-end gap-2"><button id="csm-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button>' +
      '<button id="csm-ok" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Conferma</button></div></div></div>';
    document.getElementById('csm-cancel').onclick = () => { closeModal(); resolve(null); };
    document.getElementById('csm-ok').onclick = () => { const v = document.getElementById('csm-sel').value; closeModal(); resolve(v); };
    root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) { closeModal(); resolve(null); } });
  });
}

function isOperatoreLicenziato(nome) {
  if (!nome) return false;
  return (state.operatori || []).some(o => (o.nome_esteso || o.nome) === nome && (o.licenziato || isOperatoreScaduto(o)));
}

async function deleteOperatore(id) {
  const op = state.operatori.find(o => o.id === id);
  if (!op) return;
  const mc = meseCorrente();

  const righeOp = state.staffing.filter(r => r.risorsa === op.nome_esteso);
  const impegniFuturi = righeOp
    .map(r => ({ commessa: r.commessa, gg: r.mesi.slice(mc).reduce((s,v) => s+(Number(v)||0), 0) }))
    .filter(x => x.gg > 0 && x.commessa !== 'ORE NON LAVORATE');
  const impegniPassati = righeOp.some(r => r.mesi.slice(0, mc).some(v => (Number(v)||0) > 0));
  const assegnazioniPipeline = state.assegnazioni
    .filter(a => a.operatore_id === id)
    .map(a => state.pipeline.find(p => p.id === a.commessa_id))
    .filter(Boolean);

  let msg = '<div class="text-sm font-semibold text-slate-900 mb-2">Eliminare <span class="text-red-600">' + op.nome_esteso + '</span> dal pool operatori?</div>';

  if (impegniFuturi.length > 0 || assegnazioniPipeline.length > 0) {
    msg += '<div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">';
    msg += '<div class="font-semibold mb-1">&#9888; Impegni futuri che verranno rimossi:</div>';
    impegniFuturi.forEach(x => {
      msg += '<div class="ml-2">&#8226; ' + x.commessa + ' &mdash; <b>' + x.gg + ' gg-uomo</b> futuri</div>';
    });
    assegnazioniPipeline.forEach(c => {
      msg += '<div class="ml-2">&#8226; ' + (c.progetto||c.nome||'') + ' <span style="color:#7c3aed">(pipeline)</span></div>';
    });
    msg += '</div>';
    msg += '<div class="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 mb-2">';
    msg += '&#10003; Le allocazioni gi&agrave; lavorate (mesi passati) verranno mantenute nelle commesse.<br>';
    msg += '&#10007; Le allocazioni future verranno azzerate.';
    msg += '</div>';
  } else if (impegniPassati) {
    msg += '<div class="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 mb-2">L&#39;operatore non ha impegni futuri. Lo storico allocazioni rimarr&agrave; nelle commesse.</div>';
  }

  showConfirm(msg, async () => {
    state.staffing = state.staffing.map(r => {
      if (r.risorsa !== op.nome_esteso) return r;
      return { ...r, mesi: r.mesi.map((v, i) => i < mc ? v : 0) };
    }).filter(r => r.risorsa !== op.nome_esteso || r.mesi.some(v => (Number(v)||0) > 0));
    state.operatori = state.operatori.filter(o => o.id !== id);
    state.assegnazioni = state.assegnazioni.filter(a => a.operatore_id !== id);
    ricalcolaAllocOperatori();
    await saveState('Eliminazione operatore', {operatore: op.nome_esteso}, true);
    renderAll();
  });
}

function openLicenziaModal(id) {
  const op = state.operatori.find(o => o.id === id);
  if (!op) return;
  const root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-backdrop">' +
    '<div class="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">' +
      '<div class="text-sm font-semibold text-slate-900 mb-1">Gestisci operatore</div>' +
      '<div class="text-xs text-slate-500 mb-4">Cosa vuoi fare con <span class="font-semibold text-slate-800">' + op.nome_esteso + '</span>?</div>' +
      '<div class="flex flex-col gap-2">' +
        '<button id="lic-ex" class="flex items-start gap-3 text-left px-3 py-2.5 border border-slate-200 rounded-md hover:bg-amber-50 hover:border-amber-300 transition-colors">' +
          '<span class="text-lg leading-none mt-0.5">\u{1F6AA}</span>' +
          '<div><div class="text-sm font-semibold text-slate-800">Segna come Ex Collega</div><div class="text-[11px] text-slate-500 mt-0.5">Rimosso dai nuovi incarichi \u00b7 Lo storico viene preservato con badge <span class=\'font-semibold text-red-500\'>ex</span></div></div>' +
        '</button>' +
        '<button id="lic-del" class="flex items-start gap-3 text-left px-3 py-2.5 border border-slate-200 rounded-md hover:bg-red-50 hover:border-red-300 transition-colors">' +
          '<span class="text-lg leading-none mt-0.5">\u{1F5D1}</span>' +
          '<div><div class="text-sm font-semibold text-red-700">Elimina definitivamente</div><div class="text-[11px] text-slate-500 mt-0.5">Rimozione completa dal sistema (es. utenti di test)</div></div>' +
        '</button>' +
        '<button id="lic-cancel" class="text-sm text-slate-500 hover:text-slate-700 text-center py-1.5 mt-1">Annulla</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.getElementById('lic-ex').onclick = () => { closeModal(); licenziaOperatore(id); };
  document.getElementById('lic-del').onclick = () => { closeModal(); deleteOperatore(id); };
  document.getElementById('lic-cancel').onclick = () => closeModal();
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
}

async function licenziaOperatore(id) {
  const op = state.operatori.find(o => o.id === id);
  if (!op) return;
  op.licenziato = true;
  ricalcolaAllocOperatori();
  await saveState('Licenziamento operatore', {operatore: op.nome_esteso}, true);
  renderAll();
}

