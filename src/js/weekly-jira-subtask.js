/* ==================== SOTTOTASK JIRA DA GRIGLIA SETTIMANALE ====================
   Flusso: bottone "🎫 Sottotask Jira" nell'header di ogni blocco commessa in
   Griglia -> pwJiraSubtaskInit(cIdx). Richiede che la commessa abbia "Codice
   progetto Jira" ed "Epic Jira" configurati in anagrafica (dashboard-commessa-attiva.js).
   Per ogni comune/cantiere pianificato questa settimana si sceglie un Task Jira
   (sotto l'Epic della commessa, scelta da rifare ogni volta, non cacheata), poi si
   crea un sottotask per ogni operatore assegnato: "[Attività] - [Comune] - [Cognome]".
   Anteprima obbligatoria (dryRun) prima di ogni creazione reale — vedi jira-create-subtask
   Edge Function per il contratto e il check di idempotenza per assignee/Task.
*/

/* ----- Pannello di ricerca condiviso (Epic/Task Jira) -----
   Clone parametrico del pattern "tendina custom" di weekly-strumenti.js
   (pw-str-panel), qui riusato per liste caricate on-demand da Jira invece che
   da una cache statica. */
let _pwJiraPanelTarget = null;
let _pwJiraPanelReqId = 0;

function pwJiraSearchPanelEnsure() {
  let p = document.getElementById('pw-jira-panel');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'pw-jira-panel';
  p.className = 'pw-str-panel';
  p.style.cssText = 'position:fixed;z-index:9999;width:320px;display:none;overflow:hidden;';
  p.innerHTML = '<div class="pw-str-panel-search"><input id="pw-jira-panel-search" type="text" placeholder="Cerca…"></div><div id="pw-jira-panel-list" style="overflow-y:auto;"></div>';
  document.body.appendChild(p);
  let debounceTimer = null;
  p.querySelector('#pw-jira-panel-search').addEventListener('input', e => {
    clearTimeout(debounceTimer);
    const val = e.target.value;
    debounceTimer = setTimeout(() => pwJiraSearchPanelLoad(val), 300);
  });
  document.addEventListener('mousedown', e => {
    const pan = document.getElementById('pw-jira-panel');
    if (pan && pan.style.display !== 'none' && !pan.contains(e.target) && !(e.target.classList && e.target.classList.contains('pw-jira-panel-trigger'))) pwJiraSearchPanelClose();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pwJiraSearchPanelClose(); });
  return p;
}

function pwJiraSearchPanelClose() {
  const p = document.getElementById('pw-jira-panel');
  if (p) p.style.display = 'none';
  _pwJiraPanelTarget = null;
}

// triggerBtn: elemento che apre il pannello (posizionato subito sotto).
// opts.fetchItems(search): Promise<[{key,summary}]>. opts.onPick(item|null).
function pwJiraSearchPanel(triggerBtn, opts) {
  const p = pwJiraSearchPanelEnsure();
  _pwJiraPanelTarget = { fetchItems: opts.fetchItems, onPick: opts.onPick, emptyLabel: opts.emptyLabel || '— nessuno —' };
  const r = triggerBtn.getBoundingClientRect();
  p.style.display = 'block';
  p.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 330)) + 'px';
  p.style.top = (r.bottom + 2) + 'px';
  const avail = window.innerHeight - r.bottom - 16;
  const list = p.querySelector('#pw-jira-panel-list');
  list.style.maxHeight = Math.max(120, Math.min(320, avail)) + 'px';
  const search = p.querySelector('#pw-jira-panel-search');
  search.value = '';
  pwJiraSearchPanelLoad('');
  setTimeout(() => search.focus(), 0);
}

async function pwJiraSearchPanelLoad(filter) {
  const list = document.getElementById('pw-jira-panel-list');
  const target = _pwJiraPanelTarget;
  if (!list || !target) return;
  const reqId = ++_pwJiraPanelReqId;
  list.innerHTML = '<div style="padding:8px;font-size:11px;color:#94a3b8;">⏳ Ricerca…</div>';
  let items = [];
  try {
    items = await target.fetchItems(filter);
  } catch (e) {
    if (reqId !== _pwJiraPanelReqId) return; // superata da una ricerca più recente
    list.innerHTML = `<div style="padding:8px;font-size:11px;color:#b91c1c;">Errore: ${esc(e.message || String(e))}</div>`;
    return;
  }
  if (reqId !== _pwJiraPanelReqId) return;
  let html = `<div class="pw-str-item empty" data-idx="-1">${esc(target.emptyLabel)}</div>`;
  if (!items || items.length === 0) {
    html += '<div style="padding:8px;font-size:11px;color:#94a3b8;">Nessun risultato.</div>';
  } else {
    items.forEach((it, i) => {
      const typeTag = it.issuetype ? `<span style="color:#94a3b8;">[${esc(it.issuetype)}]</span> ` : '';
      html += `<div class="pw-str-item" data-idx="${i}">${typeTag}<b>${esc(it.key)}</b> · ${esc(it.summary)}</div>`;
    });
  }
  list.innerHTML = html;
  list.querySelectorAll('.pw-str-item').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.idx);
      target.onPick(idx >= 0 ? items[idx] : null);
      pwJiraSearchPanelClose();
    };
  });
}

/* ----- Chiamate alle Edge Function Jira (stesso schema di errore di pwFetchStrumenti) ----- */
async function pwJiraFetchEpics(projectKey, search) {
  if (!_sbClient || !_sbUser) throw new Error('Non connesso a Supabase.');
  const { data, error } = await _sbClient.functions.invoke('jira-list-epics', { body: { projectKey, search } });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-list-epics'));
  if (data && data.error) throw new Error(data.error);
  return Array.isArray(data && data.epics) ? data.epics : [];
}

async function pwJiraFetchTasks(epicKey, search) {
  if (!_sbClient || !_sbUser) throw new Error('Non connesso a Supabase.');
  const { data, error } = await _sbClient.functions.invoke('jira-list-tasks', { body: { epicKey, search } });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-list-tasks'));
  if (data && data.error) throw new Error(data.error);
  return Array.isArray(data && data.tasks) ? data.tasks : [];
}

async function pwJiraCreateSubtasks(items, dryRun) {
  if (!_sbClient || !_sbUser) throw new Error('Non connesso a Supabase.');
  const { data, error } = await _sbClient.functions.invoke('jira-create-subtask', { body: { items, dryRun: !!dryRun } });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-create-subtask'));
  if (data && data.error) throw new Error(data.error);
  return Array.isArray(data && data.results) ? data.results : [];
}

/* ----- Costruzione item da griglia ----- */
// Cognome per il summary del sottotask: usa il nuovo campo dedicato se compilato,
// altrimenti ricade sull'euristica già usata altrove nel codice (primo token di
// nome_esteso, dashboard-operatori.js).
function pwJiraResolveCognome(op) {
  if (op.cognome && op.cognome.trim()) return op.cognome.trim();
  const esteso = (op.nome_esteso || '').trim();
  return esteso ? esteso.split(/\s+/)[0] : '';
}

function pwJiraBuildSubtaskItem(meta, task, comune, nomeOperatore, attivita) {
  const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome_breve) === nomeOperatore);
  const email = op && op.email && op.email.trim() ? op.email.trim() : '';
  if (!email) return null;
  const cognome = op ? pwJiraResolveCognome(op) : '';
  const summary = [attivita, comune, cognome].filter(Boolean).join(' - ');
  return {
    projectKey: meta.jira_project_code,
    taskKey: task.key,
    operatorEmail: email,
    summary,
    _comune: comune,
    _operatore: nomeOperatore,
  };
}

/* ----- Entry point dal bottone in Griglia ----- */
function pwJiraSubtaskInit(cIdx) {
  const data = pwGetWeekData();
  const bc = data[cIdx];
  if (!bc || !bc.commessa) { showAlertModal('Seleziona prima una commessa per questo blocco.'); return; }

  const meta = (state.commesse_attive_meta && state.commesse_attive_meta[bc.commessa]) || {};
  if (!meta.jira_project_code) {
    showAlertModal('Configura prima il "Codice progetto Jira" nell\'anagrafica della commessa attiva (Dashboard → Commesse attive → Modifica commessa).');
    return;
  }

  // Comuni distinti pianificati questa settimana per questa commessa, con gli
  // operatori distinti assegnati e la prima attività non vuota trovata per coppia.
  const comuni = {};
  (bc.squadre || []).forEach(sq => {
    (sq.operatori || []).forEach(op => {
      if (!op.nome) return;
      const giorni = op.giorni || {};
      Object.keys(giorni).forEach(dKey => {
        const cantiere = (giorni[dKey] || {}).cantiere || '';
        if (!cantiere) return;
        const attivita = (giorni[dKey] || {}).attivita || '';
        if (!comuni[cantiere]) comuni[cantiere] = {};
        if (!(op.nome in comuni[cantiere]) || (!comuni[cantiere][op.nome] && attivita)) {
          comuni[cantiere][op.nome] = attivita;
        }
      });
    });
  });

  const comuneNames = Object.keys(comuni);
  if (comuneNames.length === 0) { showAlertModal('Nessun cantiere pianificato questa settimana per questa commessa.'); return; }

  pwJiraSubtaskOpenComuniModal(bc.commessa, meta, comuneNames, comuni);
}

/* ----- Step 1: scelta, per ciascun comune, dell'Epic e poi del Task Jira sotto quell'Epic -----
   Una commessa può avere più Epic (aree/lotti diversi), quindi non è fissato in
   anagrafica: si sceglie qui, comune per comune, a cascata (prima Epic poi Task,
   il Task si azzera se si cambia Epic). */
function pwJiraSubtaskOpenComuniModal(commessaNome, meta, comuneNames, comuni) {
  const root = document.getElementById('modal-root');
  const rows = comuneNames.map((comune, i) => {
    const operatori = Object.keys(comuni[comune]);
    return `<div class="border border-slate-200 rounded p-2 mb-2" data-comune-idx="${i}">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="text-sm font-medium text-slate-800">${esc(comune)}</div>
        <label class="text-[11px] text-slate-500 flex items-center gap-1 cursor-pointer">
          <input type="checkbox" class="pw-jira-skip-comune" data-idx="${i}"> salta
        </label>
      </div>
      <div class="text-[11px] text-slate-500 mb-1">Operatori: ${operatori.map(esc).join(', ')}</div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="pw-jira-panel-trigger pw-jira-epic-trigger w-full text-left border border-slate-300 rounded px-2 py-1.5 text-sm bg-white hover:bg-slate-50 truncate block" data-idx="${i}">— scegli Epic —</button>
        <button type="button" class="pw-jira-panel-trigger pw-jira-task-trigger w-full text-left border border-slate-300 rounded px-2 py-1.5 text-sm bg-white hover:bg-slate-50 truncate block" data-idx="${i}" disabled style="opacity:0.5;">— scegli prima l'Epic —</button>
      </div>
    </div>`;
  }).join('');

  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-1">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <p class="text-xs text-slate-500 mb-3">Per ciascun comune scegli Epic e Task Jira sotto cui creare i sottotask, oppure spunta "salta".</p>
    <div id="pw-jira-comuni-list">${rows}</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="pw-jira-continua" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Continua</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  const chosenEpics = {}; // idx -> {key, summary}
  const chosenTasks = {}; // idx -> {key, summary}

  function taskTriggerFor(idx) {
    return root.querySelector(`.pw-jira-task-trigger[data-idx="${idx}"]`);
  }

  // NB: il bottone va catturato in una variabile locale (non letto da
  // e.currentTarget dentro onPick) perché onPick scatta in modo asincrono,
  // ben dopo che il click originale è terminato — a quel punto
  // e.currentTarget è già tornato null per specifica DOM.
  root.querySelectorAll('.pw-jira-epic-trigger').forEach(btn => {
    btn.onclick = (e) => {
      const triggerEl = e.currentTarget;
      const idx = triggerEl.dataset.idx;
      pwJiraSearchPanel(triggerEl, {
        fetchItems: (search) => pwJiraFetchEpics(meta.jira_project_code, search),
        onPick: (item) => {
          const taskTrigger = taskTriggerFor(idx);
          delete chosenTasks[idx];
          if (item) {
            chosenEpics[idx] = { key: item.key, summary: item.summary };
            triggerEl.textContent = item.key + ' · ' + item.summary;
            if (taskTrigger) { taskTrigger.disabled = false; taskTrigger.style.opacity = '1'; taskTrigger.textContent = '— scegli Task —'; }
          } else {
            delete chosenEpics[idx];
            triggerEl.textContent = '— scegli Epic —';
            if (taskTrigger) { taskTrigger.disabled = true; taskTrigger.style.opacity = '0.5'; taskTrigger.textContent = '— scegli prima l\'Epic —'; }
          }
        },
        emptyLabel: '— nessun Epic —',
      });
    };
  });

  root.querySelectorAll('.pw-jira-task-trigger').forEach(btn => {
    btn.onclick = (e) => {
      const triggerEl = e.currentTarget;
      const idx = triggerEl.dataset.idx;
      const epic = chosenEpics[idx];
      if (!epic) return; // disabilitato finché non si sceglie l'Epic
      pwJiraSearchPanel(triggerEl, {
        fetchItems: (search) => pwJiraFetchTasks(epic.key, search),
        onPick: (item) => {
          if (item) {
            chosenTasks[idx] = { key: item.key, summary: item.summary };
            triggerEl.textContent = item.key + ' · ' + item.summary;
          } else {
            delete chosenTasks[idx];
            triggerEl.textContent = '— scegli Task —';
          }
        },
        emptyLabel: '— nessun Task —',
      });
    };
  });

  root.querySelectorAll('.pw-jira-skip-comune').forEach(chk => {
    chk.onchange = (e) => {
      const idx = e.target.dataset.idx;
      const row = root.querySelector(`[data-comune-idx="${idx}"]`);
      row.querySelectorAll('.pw-jira-epic-trigger, .pw-jira-task-trigger').forEach(trigger => {
        if (trigger.classList.contains('pw-jira-task-trigger') && !chosenEpics[idx]) return; // resta disabilitato dalla cascata
        trigger.disabled = e.target.checked;
        trigger.style.opacity = e.target.checked ? '0.5' : '1';
      });
    };
  });

  document.getElementById('pw-jira-continua').onclick = () => {
    const missing = [];
    comuneNames.forEach((comune, i) => {
      const skipChk = root.querySelector(`.pw-jira-skip-comune[data-idx="${i}"]`);
      if (skipChk && skipChk.checked) return;
      if (!chosenTasks[i]) missing.push(comune);
    });
    if (missing.length) { showAlertModal('Scegli Epic e Task per: ' + missing.join(', ') + ' (oppure spunta "salta").'); return; }

    const items = [];
    const skipped = [];
    comuneNames.forEach((comune, i) => {
      const skipChk = root.querySelector(`.pw-jira-skip-comune[data-idx="${i}"]`);
      if (skipChk && skipChk.checked) { skipped.push(comune); return; }
      const task = chosenTasks[i];
      Object.keys(comuni[comune]).forEach(nomeOp => {
        const built = pwJiraBuildSubtaskItem(meta, task, comune, nomeOp, comuni[comune][nomeOp]);
        if (built) items.push(built); else skipped.push(`${comune} / ${nomeOp} (email non trovata in anagrafica)`);
      });
    });
    if (items.length === 0) { showAlertModal('Nessun sottotask da creare' + (skipped.length ? ':\n' + skipped.join('\n') : '.')); return; }
    closeModal();
    pwJiraSubtaskPreview(commessaNome, items, skipped);
  };
}

/* ----- Step 2: anteprima (dryRun) ----- */
async function pwJiraSubtaskPreview(commessaNome, items, skippedComuni) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-3">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <div id="pw-jira-preview-body" class="text-sm text-slate-500">⏳ Verifica su Jira in corso…</div>
  </div></div>`;

  let results;
  try {
    results = await pwJiraCreateSubtasks(items, true);
  } catch (e) {
    const body = document.getElementById('pw-jira-preview-body');
    if (body) body.innerHTML = `<div class="text-red-600 text-sm">Errore durante il controllo su Jira: ${esc(e.message || String(e))}</div><div class="flex justify-end mt-4"><button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Chiudi</button></div>`;
    return;
  }

  pwJiraSubtaskRenderPreview(commessaNome, items, results, skippedComuni);
}

function pwJiraSubtaskRenderPreview(commessaNome, items, results, skippedComuni) {
  const root = document.getElementById('modal-root');
  const wouldCreate = results.filter(r => r.status === 'would_create').length;

  const rows = results.map((r, i) => {
    const item = items[i] || {};
    let statusHtml;
    if (r.status === 'would_create') {
      statusHtml = '<span class="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded whitespace-nowrap">Da creare</span>';
    } else if (r.status === 'already_exists') {
      statusHtml = `<a href="${esc(r.url || '#')}" target="_blank" rel="noopener" class="text-[11px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded whitespace-nowrap hover:underline">Già esistente${r.key ? ' · ' + esc(r.key) : ''}</a>`;
    } else {
      statusHtml = `<span class="text-[11px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded whitespace-nowrap" title="${esc(r.message || '')}">Errore</span>`;
    }
    return `<div class="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm">
      <div class="min-w-0">
        <div class="truncate">${esc(item._comune || '')} — ${esc(item._operatore || '')}</div>
        <div class="text-[11px] text-slate-400 truncate">${esc(item.summary || '')}</div>
      </div>
      ${statusHtml}
    </div>`;
  }).join('');

  const skippedHtml = skippedComuni && skippedComuni.length
    ? `<div class="text-[11px] text-amber-600 mt-2">Esclusi: ${skippedComuni.map(esc).join(', ')}</div>` : '';

  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-1">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <p class="text-xs text-slate-500 mb-3">${wouldCreate} da creare su ${results.length} totali.</p>
    <div>${rows}</div>
    ${skippedHtml}
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="pw-jira-confirm-create" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50" ${wouldCreate === 0 ? 'disabled' : ''}>Crea ${wouldCreate} sottotask</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  if (wouldCreate > 0) {
    document.getElementById('pw-jira-confirm-create').onclick = () => pwJiraSubtaskConfirmCreate(commessaNome, items);
  }
}

/* ----- Step 3: creazione reale + riepilogo ----- */
async function pwJiraSubtaskConfirmCreate(commessaNome, items) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
    <div class="text-sm text-slate-600">⏳ Creazione sottotask su Jira in corso…</div>
  </div></div>`;

  let results;
  try {
    results = await pwJiraCreateSubtasks(items, false);
  } catch (e) {
    showAlertModal('Errore durante la creazione: ' + (e.message || e));
    return;
  }

  const created = results.filter(r => r.status === 'created');
  const already = results.filter(r => r.status === 'already_exists');
  const errors = results.filter(r => r.status === 'error');

  let msg = `Sottotask creati: ${created.length}`;
  if (already.length) msg += `\nGià esistenti (non ricreati): ${already.length}`;
  if (errors.length) msg += `\nErrori: ${errors.length}\n` + errors.map(e => `• ${e.taskKey} / ${e.operatorEmail}: ${e.message}`).join('\n');
  showAlertModal(msg);
}
