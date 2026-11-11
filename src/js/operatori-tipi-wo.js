/* ===================== OPERATORI · SENIORITY PER TIPO DI WO ===================== */
/* Un operatore può essere senior su un tipo di WO (es. WO Fognatura) e junior su un altro
   (es. WO I.P). Since v18.256.0.
   - Elenco dei tipi: state.wo_tipi = [{ nome, parole: [] }] (dominio core, condiviso),
     modificabile da «⚙️ Tipi WO» nella scheda operatore. Partenza: WO_TIPI_DEFAULT.
   - Livello sull'operatore: op.seniorita_wo = { 'WO Fognatura': 'senior', 'WO I.P': 'junior' }.
     Un tipo senza livello eredita la seniority generale (op.seniorita).
   - Tipo di una voce di Griglia: dall'attività. Prima il campo wo_tipo della voce del
     catalogo attività della commessa (caTrova), poi il nome del tipo o le sue parole chiave
     nel testo; due tipi trovati insieme = nessun tipo (non si tira a indovinare).
   Chi legge la seniority "per un'attività" passa da opSenioritaPer(nome, tipo), mai da
   op.seniorita_wo direttamente. */

function woTipi() {
  return Array.isArray(state.wo_tipi) ? state.wo_tipi : WO_TIPI_DEFAULT;
}
function woTipoValido(nome) {
  return !!nome && woTipi().some(t => t.nome === nome);
}

// Testo normalizzato con spazi ai lati: "WO - I.P." -> " wo i p ", così le parole chiave
// si confrontano a parola intera (" ip " non trova "zip").
function woNorm(s) {
  const n = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return n ? ' ' + n + ' ' : '';
}

// Tipo di WO citato in un testo libero ('' = nessuno o più di uno).
function woTipoDaTesto(testo) {
  const n = woNorm(testo);
  if (!n) return '';
  const perNome = woTipi().filter(t => woNorm(t.nome) && n.includes(woNorm(t.nome)));
  if (perNome.length === 1) return perNome[0].nome;
  const perParole = woTipi().filter(t => (t.parole || []).some(p => woNorm(p) && n.includes(woNorm(p))));
  return perParole.length === 1 ? perParole[0].nome : '';
}

// Tipo di WO di un'attività di Griglia per una commessa ('' = non è un tipo di WO noto).
function woTipoDiAttivita(commessa, attivita) {
  if (!attivita) return '';
  const voce = commessa && typeof caTrova === 'function' ? caTrova(commessa, attivita) : null;
  if (voce && voce.servizio) return '';
  if (voce && woTipoValido(voce.wo_tipo)) return voce.wo_tipo;
  return (voce ? woTipoDaTesto(voce.nome) : '') || woTipoDaTesto(attivita);
}

// Tipo più frequente fra più attività ('' se nessuna è un tipo di WO; a pari merito il
// primo dell'elenco dei tipi).
function woTipoPrevalente(commessa, attivitaElenco) {
  const conta = {};
  (attivitaElenco || []).forEach(a => {
    const t = woTipoDiAttivita(commessa, a);
    if (t) conta[t] = (conta[t] || 0) + 1;
  });
  let best = '', bestN = 0;
  woTipi().forEach(t => { if ((conta[t.nome] || 0) > bestN) { best = t.nome; bestN = conta[t.nome]; } });
  return best;
}

function woOperatore(nome) {
  if (!nome) return null;
  return (state.operatori || []).find(o => (o.nome_esteso || o.nome_breve) === nome) || null;
}

// Livello scritto per quel tipo sull'operatore ('' = non impostato).
function opSenioritaWo(op, tipo) {
  const s = op && tipo && op.seniorita_wo ? op.seniorita_wo[tipo] : '';
  return SENIORITA[s] ? s : '';
}

// Seniority di un operatore per un tipo di WO: il livello del tipo se impostato, altrimenti
// la seniority generale. tipo '' = seniority generale.
function opSenioritaPer(nome, tipo) {
  const s = tipo ? opSenioritaWo(woOperatore(nome), tipo) : '';
  return s || opSeniorita(nome);
}

// Badge della seniority riferita a un tipo: con il nome del tipo solo se il livello è
// proprio di quel tipo (se è ereditato dalla generale, badge normale).
function woSenioritaBadgeHtml(nome, tipo) {
  const specifico = tipo ? opSenioritaWo(woOperatore(nome), tipo) : '';
  return specifico ? senioritaBadgeHtml(specifico, tipo) : senioritaBadgeHtml(opSeniorita(nome));
}

// Chip compatti per la card del Pool operatori: "WO Fognatura 🎖".
function woBadgesHtml(op) {
  const sw = (op && op.seniorita_wo) || {};
  return woTipi().filter(t => SENIORITA[sw[t.nome]]).map(t => {
    const sen = sw[t.nome] === 'senior';
    return '<span class="text-[9px] ' + (sen ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-lime-50 text-lime-700 border-lime-200') +
      ' border px-1 rounded" title="' + esc(t.nome + ': ' + SENIORITA[sw[t.nome]]) + '">' + esc(t.nome) + ' ' + (sen ? '🎖' : '🌱') + '</span>';
  }).join('');
}

// Tutti i livelli di un operatore (generale + per tipo), senza ripetizioni.
function woLivelliOperatore(nome) {
  const op = woOperatore(nome);
  const out = new Set();
  if (op && SENIORITA[op.seniorita]) out.add(op.seniorita);
  Object.values((op && op.seniorita_wo) || {}).forEach(v => { if (SENIORITA[v]) out.add(v); });
  return [...out];
}

// Chip della finestra di scelta operatore in Griglia: seniority generale (detta «generale»
// se ci sono anche livelli per tipo) + un chip per ogni tipo di WO con un livello proprio;
// il tipo della squadra (tipoEvid) è contornato.
function woChipOperatoreHtml(nome, tipoEvid) {
  const op = woOperatore(nome);
  if (!op) return '';
  const sw = op.seniorita_wo || {};
  const tipi = woTipi().filter(t => SENIORITA[sw[t.nome]]);
  let html = '';
  if (SENIORITA[op.seniorita]) {
    const sen = op.seniorita === 'senior';
    html += '<span class="text-[9px] ' + (sen ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-lime-50 text-lime-700 border-lime-200') +
      ' border px-1 rounded" title="Seniority generale: vale dove non c\'è un livello per tipo">' + (sen ? '🎖 ' : '🌱 ') + SENIORITA[op.seniorita] +
      (tipi.length ? ' generale' : '') + '</span>';
  }
  tipi.forEach(t => {
    const sen = sw[t.nome] === 'senior';
    const evid = t.nome === tipoEvid;
    html += '<span class="text-[9px] ' + (sen ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-lime-50 text-lime-700 border-lime-200') +
      ' border px-1 rounded' + (evid ? ' font-bold ring-1 ring-indigo-400' : '') + '" title="' +
      esc(SENIORITA[sw[t.nome]] + ' su ' + t.nome + (evid ? ' (tipo delle attività della squadra)' : '')) + '">' +
      (sen ? '🎖 ' : '🌱 ') + esc(t.nome) + '</span>';
  });
  return html;
}

/* ---- Scheda operatore: riquadro «Seniority per tipo di WO» ----
   Ogni tipo mostra il livello che vale davvero: «come generale: Junior» finché non se ne
   sceglie uno proprio (riga evidenziata). Il riquadro si vede solo con la skill WO spuntata
   (o se l'operatore ha già dei livelli per tipo); nascosto, i valori restano e si salvano. */

function woEtichettaGenerale(generale) {
  return 'come generale: ' + (SENIORITA[generale] ? SENIORITA[generale] : 'non definita');
}

function woRigheModaleHtml(valori, generale) {
  const tipi = woTipi();
  if (!tipi.length) return '<div class="text-[10px] text-slate-400 italic">Nessun tipo di WO definito: aggiungili da «⚙️ Tipi WO».</div>';
  return tipi.map(t => {
    const v = (valori || {})[t.nome] || '';
    const proprio = !!SENIORITA[v];
    return '<label class="mo-wo-riga flex items-center justify-between gap-2 text-xs rounded px-2 py-1 border ' +
      (proprio ? 'bg-indigo-100 border-indigo-300 font-medium' : 'bg-white border-indigo-100') + '">' +
      '<span class="truncate" title="' + esc(t.nome) + '">' + esc(t.nome) + '</span>' +
      '<select class="mo-wo border border-slate-300 rounded px-1 py-0.5 text-xs" data-tipo="' + esc(t.nome) + '">' +
      '<option value="">' + esc(woEtichettaGenerale(generale)) + '</option>' +
      Object.keys(SENIORITA).map(k => '<option value="' + k + '"' + (v === k ? ' selected' : '') + '>' + (k === 'senior' ? '🎖 ' : '🌱 ') + SENIORITA[k] + '</option>').join('') +
      '</select></label>';
  }).join('');
}

function woSezioneModaleHtml(op) {
  const visibile = (op.skills || []).includes('WO') || Object.keys(op.seniorita_wo || {}).length > 0;
  return '<div id="mo-wo-sezione"' + (visibile ? '' : ' class="hidden"') + '>' +
    '<div class="flex items-center justify-between mb-1">' +
    '<div class="text-xs text-slate-600 font-medium">Seniority per tipo di WO</div>' +
    '<button type="button" id="mo-wo-tipi" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-300 hover:bg-slate-200">⚙️ Tipi WO</button>' +
    '</div>' +
    '<div class="text-[10px] text-slate-500 mb-1">Da cambiare solo dove l\'operatore è più o meno esperto rispetto alla seniority generale. ' +
    'In Griglia, sui cantieri con un\'attività di quel tipo, vale questo livello al posto di quello generale.</div>' +
    '<div id="mo-wo-righe" class="grid grid-cols-2 gap-1 p-2 bg-indigo-50 rounded border border-indigo-200">' + woRigheModaleHtml(op.seniorita_wo, op.seniorita) + '</div>' +
    '</div>';
}

function woLeggiModale() {
  const out = {};
  document.querySelectorAll('#mo-wo-righe .mo-wo').forEach(sel => {
    if (SENIORITA[sel.value]) out[sel.dataset.tipo] = sel.value;
  });
  return out;
}

function woGeneraleModale() {
  return (document.getElementById('mo-seniorita') || {}).value || '';
}

// Aggiorna etichette ed evidenziazione senza ridisegnare (le scelte restano).
function woAggiornaRigheModale() {
  const generale = woGeneraleModale();
  document.querySelectorAll('#mo-wo-righe .mo-wo').forEach(sel => {
    if (sel.options[0]) sel.options[0].textContent = woEtichettaGenerale(generale);
    const riga = sel.closest('.mo-wo-riga');
    if (!riga) return;
    const proprio = !!SENIORITA[sel.value];
    riga.classList.toggle('bg-indigo-100', proprio);
    riga.classList.toggle('border-indigo-300', proprio);
    riga.classList.toggle('font-medium', proprio);
    riga.classList.toggle('bg-white', !proprio);
    riga.classList.toggle('border-indigo-100', !proprio);
  });
}

// Collega il riquadro: seniority generale e skill WO aggiornano etichette e visibilità;
// «⚙️ Tipi WO» ridisegna dopo il salvataggio dell'elenco tenendo le scelte non ancora
// salvate (rinominate se il tipo ha cambiato nome).
function woBindModale() {
  const gen = document.getElementById('mo-seniorita');
  if (gen) gen.addEventListener('change', woAggiornaRigheModale);
  const box = document.getElementById('mo-wo-righe');
  if (box) box.addEventListener('change', woAggiornaRigheModale);
  const skillWo = document.querySelector('.mo-skill[value="WO"]');
  const sez = document.getElementById('mo-wo-sezione');
  if (skillWo && sez) skillWo.addEventListener('change', () => {
    if (skillWo.checked) sez.classList.remove('hidden');
    else if (!Object.keys(woLeggiModale()).length) sez.classList.add('hidden');
  });
  const btn = document.getElementById('mo-wo-tipi');
  if (!btn) return;
  btn.onclick = () => woOpenEditor(rinomina => {
    const correnti = woLeggiModale();
    const nuovi = {};
    Object.keys(correnti).forEach(k => {
      const n = Object.prototype.hasOwnProperty.call(rinomina, k) ? rinomina[k] : k;
      if (n && woTipoValido(n)) nuovi[n] = correnti[k];
    });
    const righe = document.getElementById('mo-wo-righe');
    if (righe) righe.innerHTML = woRigheModaleHtml(nuovi, woGeneraleModale());
  });
}

/* ---- Editor dell'elenco dei tipi (sopra la scheda operatore) ----
   Salva subito (saveState): rinominare un tipo rinomina il livello su tutti gli operatori
   e sulle voci del catalogo attività che lo indicano; togliere un tipo toglie i livelli.
   onSalvato(rinomina) riceve { vecchioNome: nuovoNome | '' (tolto) }. */
function woOpenEditor(onSalvato) {
  let lista = woTipi().map(t => ({ orig: t.nome, nome: t.nome, parole: (t.parole || []).join(', ') }));
  const root = document.getElementById('modal-root');
  const layer = document.createElement('div');
  layer.className = 'modal-backdrop';
  const chiudi = () => layer.remove();

  function woEdLeggi() {
    layer.querySelectorAll('[data-wo-idx]').forEach(row => {
      const t = lista[Number(row.dataset.woIdx)];
      if (!t) return;
      t.nome = row.querySelector('.wo-nome').value.trim();
      t.parole = row.querySelector('.wo-parole').value;
    });
  }
  function woEdRender() {
    layer.querySelector('#wo-righe').innerHTML = lista.length ? lista.map((t, i) =>
      '<div data-wo-idx="' + i + '" class="grid gap-1 items-center py-1 border-b border-slate-100" style="grid-template-columns: minmax(0,1fr) minmax(0,2fr) 22px;">' +
      '<input class="wo-nome border border-slate-300 rounded px-1.5 py-1 text-xs" value="' + esc(t.nome) + '" placeholder="Es: WO Gas">' +
      '<input class="wo-parole border border-slate-300 rounded px-1.5 py-1 text-xs" value="' + esc(t.parole) + '" placeholder="parole chiave nel nome dell\'attività, separate da virgola">' +
      '<button type="button" class="wo-del text-slate-400 hover:text-red-600 text-sm" data-del="' + i + '" title="Togli">✕</button>' +
      '</div>').join('')
      : '<div class="text-xs text-slate-400 italic py-2">Nessun tipo di WO.</div>';
    layer.querySelectorAll('.wo-del').forEach(b => b.onclick = () => { woEdLeggi(); lista.splice(Number(b.dataset.del), 1); woEdRender(); });
  }

  layer.innerHTML = '<div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">' +
    '<h3 class="font-semibold text-slate-900 mb-1">Tipi di WO</h3>' +
    '<p class="text-xs text-slate-500 mb-3">Per ogni tipo si può dare a un operatore una seniority diversa da quella generale. ' +
    'In Griglia il tipo si ricava dall\'attività del cantiere: dal campo «Tipo WO» del catalogo attività della commessa, altrimenti dal nome del tipo o dalle <b>parole chiave</b> trovate nel nome dell\'attività (a parola intera, maiuscole e accenti non contano). ' +
    'Rinominare un tipo lo rinomina anche sugli operatori; toglierlo cancella i livelli dati per quel tipo.</p>' +
    '<div class="grid gap-1 text-[10px] text-slate-500 uppercase font-medium border-b border-slate-200 pb-1" style="grid-template-columns: minmax(0,1fr) minmax(0,2fr) 22px;"><span>Tipo</span><span>Parole chiave</span><span></span></div>' +
    '<div id="wo-righe"></div>' +
    '<button type="button" id="wo-add" class="mt-2 text-xs px-2 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded hover:bg-slate-200">+ Tipo</button>' +
    '<div class="flex justify-end gap-2 mt-4">' +
    '<button type="button" id="wo-annulla" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>' +
    '<button type="button" id="wo-ok" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva</button>' +
    '</div></div>';
  root.appendChild(layer);
  woEdRender();

  layer.querySelector('#wo-add').onclick = () => { woEdLeggi(); lista.push({ orig: '', nome: '', parole: '' }); woEdRender(); };
  layer.querySelector('#wo-annulla').onclick = chiudi;
  layer.querySelector('#wo-ok').onclick = async () => {
    if (!sbGuardWrite()) return;
    woEdLeggi();
    const pulita = lista.filter(t => t.nome);
    const visti = new Set();
    for (const t of pulita) {
      const k = t.nome.toLowerCase();
      if (visti.has(k)) { showAlertModal('Il tipo «' + t.nome + '» compare due volte.'); return; }
      visti.add(k);
    }
    const rinomina = {};
    woTipi().forEach(t => {
      const nuovo = pulita.find(x => x.orig === t.nome);
      rinomina[t.nome] = nuovo ? nuovo.nome : '';
    });
    const tolti = Object.keys(rinomina).filter(k => !rinomina[k]);
    if (tolti.length) {
      const nOp = (state.operatori || []).filter(o => o.seniorita_wo && tolti.some(k => o.seniorita_wo[k])).length;
      if (nOp && !await showConfirmAsync('Togli ' + tolti.join(', ') + ': si cancellano i livelli dati a ' + nOp + ' operatori per ' + (tolti.length > 1 ? 'questi tipi' : 'questo tipo') + '. Procedere?', 'Togli')) return;
    }
    state.wo_tipi = pulita.map(t => ({
      nome: t.nome,
      parole: String(t.parole || '').split(',').map(s => s.trim()).filter(Boolean),
    }));
    const mappa = k => Object.prototype.hasOwnProperty.call(rinomina, k) ? rinomina[k] : (woTipoValido(k) ? k : '');
    (state.operatori || []).forEach(o => {
      if (!o.seniorita_wo) return;
      const nuovo = {};
      Object.keys(o.seniorita_wo).forEach(k => { const n = mappa(k); if (n && SENIORITA[o.seniorita_wo[k]]) nuovo[n] = o.seniorita_wo[k]; });
      o.seniorita_wo = nuovo;
    });
    Object.values(state.commesse_attive_meta || {}).forEach(meta => {
      (meta && Array.isArray(meta.attivita) ? meta.attivita : []).forEach(a => {
        if (a.wo_tipo) a.wo_tipo = mappa(a.wo_tipo);
      });
    });
    await saveState('Tipi WO modificati', { tipi: state.wo_tipi.map(t => t.nome).join(', ') }, true);
    chiudi();
    if (typeof onSalvato === 'function') onSalvato(rinomina);
    if (typeof renderOperatori === 'function') renderOperatori();
  };
}

/* ---- Filtro «Tipo WO» del Pool operatori ---- */

// Riallinea le opzioni della tendina all'elenco corrente (che può cambiare da un pull).
function woFiltroPoolSync() {
  const sel = document.getElementById('op-filter-wo');
  if (!sel) return;
  const tipi = woTipi().map(t => t.nome);
  if (state.filters.wo_tipo && !tipi.includes(state.filters.wo_tipo)) state.filters.wo_tipo = '';
  const firma = tipi.join('|');
  if (sel.dataset.firma !== firma) {
    sel.innerHTML = '<option value="">Seniority generale</option>' + tipi.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
    sel.dataset.firma = firma;
  }
  sel.value = state.filters.wo_tipo || '';
}

// Filtro del Pool: con un tipo scelto il filtro Seniority guarda il livello per quel tipo
// (ereditato dalla generale se non impostato); con il solo tipo restano gli operatori che
// hanno un livello proprio per quel tipo.
function woPassaFiltroPool(op, filtroSen, tipo) {
  if (!tipo) {
    if (!filtroSen) return true;
    const sen = SENIORITA[op.seniorita] ? op.seniorita : 'nd';
    return sen === filtroSen;
  }
  if (!filtroSen) return !!opSenioritaWo(op, tipo);
  const sen = opSenioritaWo(op, tipo) || (SENIORITA[op.seniorita] ? op.seniorita : '') || 'nd';
  return sen === filtroSen;
}
