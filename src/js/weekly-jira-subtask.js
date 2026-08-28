/* ==================== SOTTOTASK JIRA DA GRIGLIA SETTIMANALE ====================
   Flusso: bottone "🎫 Sottotask Jira" nell'header di ogni blocco commessa in
   Griglia -> pwJiraSubtaskInit(cIdx). Richiede che la commessa abbia "Codice
   progetto Jira" ed "Epic Jira" configurati in anagrafica (dashboard-commessa-attiva.js).
   Per ogni comune/cantiere pianificato questa settimana si sceglie un Task Jira
   (sotto l'Epic della commessa, scelta da rifare ogni volta, non cacheata), poi
   si seleziona puntualmente quali dei sottotask proposti creare davvero (per
   operatore/comune, non solo per comune intero), poi si compilano gli eventuali
   campi extra obbligatori in creazione su quel progetto (Data scadenza, Stima
   originale, Activity Type, Target Production, Start date pianificato, Tempo
   Team — vedi pwJiraFetchExtraFields), infine si crea un sottotask per ogni
   operatore assegnato: "[Attività] - [Comune] - [Cognome]".
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

async function pwJiraCreateSubtasks(items, dryRun, extraFields) {
  if (!_sbClient || !_sbUser) throw new Error('Non connesso a Supabase.');
  const { data, error } = await _sbClient.functions.invoke('jira-create-subtask', { body: { items, dryRun: !!dryRun, extraFields: extraFields || {} } });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-create-subtask'));
  if (data && data.error) throw new Error(data.error);
  return Array.isArray(data && data.results) ? data.results : [];
}

// Campi extra (Data scadenza, Stima originale, Activity Type, Target
// Production, Start date pianificato, Tempo Team) che su alcuni progetti
// Jira sono obbligatori in creazione senza che l'API createmeta lo segnali
// correttamente (verificato empiricamente sull'istanza Jira di Eagleprojects:
// createmeta li marca required=false ma la creazione fallisce con "Inserire:
// <campo>"). Restituisce solo i campi che esistono per quel progetto.
async function pwJiraFetchExtraFields(projectKey) {
  if (!_sbClient || !_sbUser) throw new Error('Non connesso a Supabase.');
  const { data, error } = await _sbClient.functions.invoke('jira-create-subtask', { body: { mode: 'fields', projectKey } });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-create-subtask'));
  if (data && data.error) throw new Error(data.error);
  return Array.isArray(data && data.fields) ? data.fields : [];
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

/* ----- Badge persistente in Griglia (stato "sottotask già esistente/creato") -----
   Il dato vive in bc.jiraSubtask (oggetto sibling di `squadre` sul blocco
   commessa), chiave "<comune>|||<operatore>" -> {status, key, url, ts}.
   Volutamente NON dentro giorni/cantieri della cella, per due motivi:
   - rinominare il cantiere in una cella fa sparire da solo il vecchio badge:
      la chiave vecchia non è più referenziata da nessuna cella (vedi
      pwJiraSubtaskApplyBadgesToDom, richiamata da pwUpdateCantiere).
   - copia/incolla di una cella o dell'intera settimana di un operatore
      (weekly-clipboard-cantiere.js) copia solo {cantieri, attivita}, mai
      bc.jiraSubtask: il badge non segue mai il copia/incolla su un altro
      operatore/cantiere. */
function pwJiraSubtaskMarkBadge(cIdx, comune, operatoreNome, status, key, url) {
  const bc = pwGetWeekData()[cIdx];
  if (!bc || !comune || !operatoreNome) return;
  if (!bc.jiraSubtask) bc.jiraSubtask = {};
  bc.jiraSubtask[comune + '|||' + operatoreNome] = { status, key: key || '', url: url || '', ts: new Date().toISOString() };
  pwSave();
  pwJiraSubtaskApplyBadgesToDom();
}

function pwJiraSubtaskBadgeRemove(cIdx, mapKey) {
  const bc = pwGetWeekData()[cIdx];
  if (!bc || !bc.jiraSubtask) return;
  delete bc.jiraSubtask[mapKey];
  pwSave();
  pwJiraSubtaskApplyBadgesToDom();
}

// includeCreated=false per le verifiche dryRun (Step 1 per-comune e Step 2
// anteprima): marcano solo gli "already_exists" già trovati su Jira, mai i
// "would_create" (non ancora creati per davvero). includeCreated=true solo
// dopo la creazione reale (Step 3), dove va marcato anche "created".
function pwJiraSubtaskApplyResultsToBadges(cIdx, items, results, includeCreated) {
  (results || []).forEach((r, i) => {
    const item = items[i];
    if (!item) return;
    if (r.status === 'already_exists' || (includeCreated && r.status === 'created')) {
      pwJiraSubtaskMarkBadge(cIdx, item._comune, item._operatore, r.status, r.key, r.url);
    }
  });
}

function pwJiraSubtaskBadgeInnerHtml(cIdx, bc, operatoreNome, cantiere) {
  const c = (cantiere || '').trim();
  if (!c || !operatoreNome || !bc || !bc.jiraSubtask) return '';
  const mapKey = c + '|||' + operatoreNome;
  const entry = bc.jiraSubtask[mapKey];
  if (!entry) return '';
  const label = entry.status === 'created' ? 'creato' : 'già esistente';
  const title = `Sottotask Jira ${label}${entry.key ? ': ' + entry.key : ''}`;
  const body = '🎫' + (entry.key ? ' ' + esc(entry.key) : '');
  const linkHtml = entry.url
    ? `<a href="${esc(entry.url)}" target="_blank" rel="noopener" class="pw-jira-sub-link" title="${esc(title)}" onclick="event.stopPropagation()">${body}</a>`
    : `<span class="pw-jira-sub-link" title="${esc(title)}">${body}</span>`;
  return `${linkHtml}<button type="button" class="pw-jira-sub-remove" title="Rimuovi indicatore sottotask Jira" onclick="event.stopPropagation();pwJiraSubtaskBadgeRemove(${cIdx},'${jsAttr(mapKey)}')">✕</button>`;
}

// Wrapper con data-* usato in pwRender() (weekly-operatore-modal.js): stesso
// pattern del badge meteo (pwWeatherBadgeHtml/pwApplyMeteoBadgesToDom in
// weekly-meteo.js), per poter aggiornare il singolo badge senza un pwRender()
// completo (che farebbe perdere il focus a un input cantiere/attività).
function pwJiraSubtaskBadgeHtml(cIdx, sIdx, oIdx, dKey, ci, bc, operatoreNome, cantiere) {
  return `<span class="pw-jira-sub-slot" data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-idx="${ci}">${pwJiraSubtaskBadgeInnerHtml(cIdx, bc, operatoreNome, cantiere)}</span>`;
}

function pwJiraSubtaskApplyBadgesToDom() {
  const data = pwGetWeekData();
  document.querySelectorAll('.pw-jira-sub-slot').forEach(slot => {
    const cIdx = Number(slot.dataset.cidx), sIdx = Number(slot.dataset.sidx), oIdx = Number(slot.dataset.oidx), dKey = Number(slot.dataset.day), ci = Number(slot.dataset.idx);
    const bc = data[cIdx];
    const op = bc && bc.squadre && bc.squadre[sIdx] && bc.squadre[sIdx].operatori[oIdx];
    if (!bc || !op) { slot.innerHTML = ''; return; }
    const cantieri = pwCellCantieriRaw(op.giorni && op.giorni[dKey]);
    slot.innerHTML = pwJiraSubtaskBadgeInnerHtml(cIdx, bc, op.nome, cantieri[ci] || '');
  });
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
  // Ogni comune viene inoltre attribuito alla prima squadra in cui compare, per
  // poter raggruppare la UI per squadra (vedi pwJiraSubtaskOpenComuniModal).
  const comuni = {};
  const comuneSquadra = {}; // comune -> nome squadra
  const squadreOrder = []; // ordine di comparsa delle squadre che hanno almeno un comune
  (bc.squadre || []).forEach(sq => {
    const sqNome = sq.nome || 'Squadra';
    (sq.operatori || []).forEach(op => {
      if (!op.nome) return;
      const giorni = op.giorni || {};
      Object.keys(giorni).forEach(dKey => {
        const attivita = (giorni[dKey] || {}).attivita || '';
        pwCellCantieri(giorni[dKey]).forEach(cantiere => {
          if (!comuni[cantiere]) {
            comuni[cantiere] = {};
            comuneSquadra[cantiere] = sqNome;
            if (!squadreOrder.includes(sqNome)) squadreOrder.push(sqNome);
          }
          if (!(op.nome in comuni[cantiere]) || (!comuni[cantiere][op.nome] && attivita)) {
            comuni[cantiere][op.nome] = attivita;
          }
        });
      });
    });
  });

  const comuneNames = Object.keys(comuni);
  if (comuneNames.length === 0) { showAlertModal('Nessun cantiere pianificato questa settimana per questa commessa.'); return; }

  pwJiraSubtaskOpenComuniModal(cIdx, bc.commessa, meta, comuneNames, comuni, comuneSquadra, squadreOrder);
}

/* ----- Step 1: scelta, per ciascun comune, dell'Epic e poi del Task Jira sotto quell'Epic -----
   Una commessa può avere più Epic (aree/lotti diversi), quindi non è fissato in
   anagrafica: si sceglie qui, comune per comune, a cascata (prima Epic poi Task,
   il Task si azzera se si cambia Epic). I comuni sono raggruppati per squadra
   (accordion collassabile) per ridurre il rumore visivo quando ci sono molti
   comuni/squadre nella stessa commessa. Appena si sceglie il Task per un comune
   parte in automatico una verifica dryRun che mostra, riga per riga, quanti
   sottotask sono già presenti su Jira — senza dover arrivare fino all'anteprima
   finale (vedi pwJiraSubtaskCheckExisting). */
function pwJiraSubtaskOpenComuniModal(cIdx, commessaNome, meta, comuneNames, comuni, comuneSquadra, squadreOrder) {
  const root = document.getElementById('modal-root');

  // Comuni per cui TUTTI gli operatori hanno già un sottotask (creato o già
  // esistente, vedi bc.jiraSubtask) partono con "salta" pre-selezionato e i
  // trigger Epic/Task disattivati: non ha senso riproporre la scelta
  // Epic/Task per un comune già completamente coperto solo per poi doverlo
  // saltare a mano. Resta comunque deselezionabile per rifare la verifica.
  const bcForBadges = pwGetWeekData()[cIdx];
  const jiraMap = (bcForBadges && bcForBadges.jiraSubtask) || {};

  const bySquadra = {};
  (squadreOrder || []).forEach(sq => { bySquadra[sq] = []; });
  comuneNames.forEach(comune => {
    const sq = (comuneSquadra && comuneSquadra[comune]) || 'Squadra';
    if (!bySquadra[sq]) bySquadra[sq] = [];
    bySquadra[sq].push(comune);
  });
  const squadreNames = (squadreOrder && squadreOrder.length) ? squadreOrder : Object.keys(bySquadra);

  function rowHtml(comune, i) {
    const operatori = Object.keys(comuni[comune]);
    const doneOperatori = operatori.filter(op => jiraMap[comune + '|||' + op]);
    const allDone = operatori.length > 0 && doneOperatori.length === operatori.length;
    const someDone = doneOperatori.length > 0 && !allDone;
    const operatoriNote = someDone ? ` <span class="text-blue-600">(${doneOperatori.length}/${operatori.length} già con sottotask)</span>` : '';
    const doneNote = allDone ? '<div class="text-[11px] text-blue-700 mb-1">🎫 Sottotask già presenti per tutti gli operatori — "salta" pre-selezionato, deseleziona per rifare la verifica.</div>' : '';
    return `<div class="border border-slate-200 rounded p-2 mb-2" data-comune-idx="${i}">
      <div class="flex items-center justify-between gap-2 mb-1">
        <div class="text-sm font-medium text-slate-800">${esc(comune)}</div>
        <label class="text-[11px] text-slate-500 flex items-center gap-1 cursor-pointer">
          <input type="checkbox" class="pw-jira-skip-comune" data-idx="${i}"${allDone ? ' checked' : ''}> salta
        </label>
      </div>
      <div class="text-[11px] text-slate-500 mb-1">Operatori: ${operatori.map(esc).join(', ')}${operatoriNote}</div>
      ${doneNote}
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="pw-jira-panel-trigger pw-jira-epic-trigger w-full text-left border border-slate-300 rounded px-2 py-1.5 text-sm bg-white hover:bg-slate-50 truncate block" data-idx="${i}"${allDone ? ' disabled style="opacity:0.5;"' : ''}>— scegli Epic —</button>
        <button type="button" class="pw-jira-panel-trigger pw-jira-task-trigger w-full text-left border border-slate-300 rounded px-2 py-1.5 text-sm bg-white hover:bg-slate-50 truncate block" data-idx="${i}" disabled style="opacity:0.5;">— scegli prima l'Epic —</button>
      </div>
      <div class="pw-jira-comune-status text-[11px] mt-1.5 min-h-[14px]" data-idx="${i}"></div>
    </div>`;
  }

  const groupsHtml = squadreNames.map((sqNome, gi) => {
    const list = bySquadra[sqNome] || [];
    if (!list.length) return '';
    const rows = list.map(comune => rowHtml(comune, comuneNames.indexOf(comune))).join('');
    return `<div class="pw-jira-squadra-group border border-slate-200 rounded mb-2 overflow-hidden">
      <div class="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-50 hover:bg-slate-100">
        <button type="button" class="pw-jira-squadra-toggle flex items-center gap-1.5 text-sm font-medium text-slate-700 flex-1 min-w-0 text-left" data-squadra-idx="${gi}">
          <span class="pw-jira-squadra-arrow text-slate-400 shrink-0">▾</span>
          <span class="truncate">${esc(sqNome)} <span class="text-slate-400 font-normal">(${list.length} comun${list.length === 1 ? 'e' : 'i'})</span></span>
        </button>
        <div class="flex gap-2 shrink-0 text-[11px]">
          <button type="button" class="pw-jira-squadra-skip-all text-slate-500 hover:underline whitespace-nowrap" data-squadra-idx="${gi}">salta tutti</button>
          <button type="button" class="pw-jira-squadra-skip-none text-teal-700 hover:underline whitespace-nowrap" data-squadra-idx="${gi}">includi tutti</button>
        </div>
      </div>
      <div class="pw-jira-squadra-body px-2.5 pt-2 pb-1" data-squadra-idx="${gi}">${rows}</div>
    </div>`;
  }).join('');

  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-1">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs text-slate-500">Per ciascun comune scegli Epic e Task Jira, oppure spunta "salta".</p>
      <div class="flex gap-2 shrink-0">
        <button type="button" id="pw-jira-expand-all" class="text-[11px] text-teal-700 hover:underline whitespace-nowrap">Espandi tutto</button>
        <button type="button" id="pw-jira-collapse-all" class="text-[11px] text-slate-500 hover:underline whitespace-nowrap">Comprimi tutto</button>
      </div>
    </div>
    <div id="pw-jira-comuni-list">${groupsHtml}</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="pw-jira-continua" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Continua</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  root.querySelectorAll('.pw-jira-squadra-toggle').forEach(btn => {
    btn.onclick = () => {
      const gi = btn.dataset.squadraIdx;
      const body = root.querySelector(`.pw-jira-squadra-body[data-squadra-idx="${gi}"]`);
      const arrow = btn.querySelector('.pw-jira-squadra-arrow');
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      if (arrow) arrow.textContent = collapsed ? '▾' : '▸';
    };
  });
  document.getElementById('pw-jira-expand-all').onclick = () => {
    root.querySelectorAll('.pw-jira-squadra-body').forEach(b => { b.style.display = ''; });
    root.querySelectorAll('.pw-jira-squadra-arrow').forEach(a => { a.textContent = '▾'; });
  };
  document.getElementById('pw-jira-collapse-all').onclick = () => {
    root.querySelectorAll('.pw-jira-squadra-body').forEach(b => { b.style.display = 'none'; });
    root.querySelectorAll('.pw-jira-squadra-arrow').forEach(a => { a.textContent = '▸'; });
  };

  const chosenEpics = {}; // idx -> {key, summary}
  const chosenTasks = {}; // idx -> {key, summary}
  const existingReqIds = {}; // idx -> ultimo numero di richiesta (per scartare risposte superate)

  function taskTriggerFor(idx) {
    return root.querySelector(`.pw-jira-task-trigger[data-idx="${idx}"]`);
  }
  function statusElFor(idx) {
    return root.querySelector(`.pw-jira-comune-status[data-idx="${idx}"]`);
  }

  // Verifica dryRun immediata (senza campi extra: non servono per determinare
  // se il sottotask esiste già) dei sottotask che risulterebbero da questo
  // comune con il Task appena scelto. Puramente informativa: eventuali errori
  // qui non bloccano il flusso, l'utente li rivede comunque nell'anteprima finale.
  async function pwJiraSubtaskCheckExisting(idx) {
    const statusEl = statusElFor(idx);
    // Ogni chiamata invalida subito qualunque richiesta precedente ancora in
    // volo per lo stesso idx, anche quando questa esce da un ramo che non fa
    // fetch (task/email mancante) — altrimenti una risposta tardiva di una
    // verifica precedente potrebbe sovrascrivere uno stato già azzerato qui.
    const myReq = (existingReqIds[idx] || 0) + 1;
    existingReqIds[idx] = myReq;
    const task = chosenTasks[idx];
    if (!task) { if (statusEl) statusEl.innerHTML = ''; return; }
    const comune = comuneNames[idx];
    const items = [];
    Object.keys(comuni[comune]).forEach(nomeOp => {
      const built = pwJiraBuildSubtaskItem(meta, task, comune, nomeOp, comuni[comune][nomeOp]);
      if (built) items.push(built);
    });
    if (items.length === 0) {
      if (statusEl) statusEl.innerHTML = '<span class="text-amber-600">Nessuna email operatore trovata in anagrafica.</span>';
      return;
    }
    if (statusEl) statusEl.innerHTML = '<span class="text-slate-400">⏳ verifica su Jira…</span>';
    try {
      const results = await pwJiraCreateSubtasks(items, true, {});
      if (existingReqIds[idx] !== myReq) return; // superata da una scelta più recente
      pwJiraSubtaskApplyResultsToBadges(cIdx, items, results, false);
      const already = results.filter(r => r.status === 'already_exists').length;
      const toCreate = results.filter(r => r.status === 'would_create').length;
      const errors = results.filter(r => r.status === 'error').length;
      let html = '';
      if (already) html += `<span class="text-blue-700">🔵 ${already} già esistenti</span>&nbsp; `;
      if (toCreate) html += `<span class="text-emerald-700">🟢 ${toCreate} da creare</span>&nbsp; `;
      if (errors) html += `<span class="text-red-700">⚠️ ${errors} errori</span>`;
      if (statusEl) statusEl.innerHTML = html || '<span class="text-slate-400">—</span>';
    } catch (e) {
      if (existingReqIds[idx] !== myReq) return;
      if (statusEl) statusEl.innerHTML = `<span class="text-red-600">Errore verifica: ${esc(e.message || String(e))}</span>`;
    }
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
          pwJiraSubtaskCheckExisting(idx);
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
          pwJiraSubtaskCheckExisting(idx);
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

  // "salta tutti"/"includi tutti" per squadra: riusa il change handler dei
  // singoli checkbox appena registrato sopra (dispatchEvent), invece di
  // duplicare la logica di disabilitazione dei trigger Epic/Task.
  function setSquadraSkip(gi, val) {
    const body = root.querySelector(`.pw-jira-squadra-body[data-squadra-idx="${gi}"]`);
    if (!body) return;
    body.querySelectorAll('.pw-jira-skip-comune').forEach(chk => {
      if (chk.checked !== val) { chk.checked = val; chk.dispatchEvent(new Event('change')); }
    });
  }
  root.querySelectorAll('.pw-jira-squadra-skip-all').forEach(btn => {
    btn.onclick = () => setSquadraSkip(btn.dataset.squadraIdx, true);
  });
  root.querySelectorAll('.pw-jira-squadra-skip-none').forEach(btn => {
    btn.onclick = () => setSquadraSkip(btn.dataset.squadraIdx, false);
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
    pwJiraSubtaskOpenSelectItemsModal(cIdx, commessaNome, meta, items, skipped);
  };
}

/* ----- Step 1.4: selezione puntuale di quali sottotask creare -----
   La scelta "salta" dello step precedente esclude un intero comune; qui si
   sceglie invece a livello di singolo operatore/comune/task, utile quando
   solo alcuni degli operatori pianificati in un comune necessitano davvero
   del sottotask. Selezionato di default, tranne le righe già coperte da un
   sottotask esistente (vedi bc.jiraSubtask), che partono deselezionate. */
function pwJiraSubtaskOpenSelectItemsModal(cIdx, commessaNome, meta, items, skippedComuni) {
  const root = document.getElementById('modal-root');
  const bcForBadges = pwGetWeekData()[cIdx];
  const jiraMap = (bcForBadges && bcForBadges.jiraSubtask) || {};
  // Un operatore/comune che ha già un sottotask (creato o già esistente) parte
  // deselezionato: inutile riproporlo per poi doverlo scartare a mano. Resta
  // comunque visibile e riselezionabile (es. per rifare la verifica).
  const rows = items.map((item, i) => {
    const already = jiraMap[(item._comune || '') + '|||' + (item._operatore || '')];
    const noteHtml = already ? ` <span class="text-blue-600">🎫 già presente${already.key ? ' · ' + esc(already.key) : ''}</span>` : '';
    return `<label class="flex items-center gap-2 border-b border-slate-100 py-1.5 text-sm cursor-pointer${already ? ' opacity-70' : ''}">
      <input type="checkbox" class="pw-jira-select-item" data-idx="${i}"${already ? '' : ' checked'}>
      <div class="min-w-0">
        <div class="truncate">${esc(item._comune || '')} — ${esc(item._operatore || '')} <span class="text-[11px] text-slate-400">(${esc(item.taskKey || '')})</span>${noteHtml}</div>
        <div class="text-[11px] text-slate-400 truncate">${esc(item.summary || '')}</div>
      </div>
    </label>`;
  }).join('');

  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-1">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <div class="flex items-center justify-between mb-2">
      <p class="text-xs text-slate-500">Seleziona i sottotask da creare (${items.length} totali).</p>
      <div class="flex gap-2">
        <button type="button" id="pw-jira-select-all" class="text-[11px] text-teal-700 hover:underline">Seleziona tutti</button>
        <button type="button" id="pw-jira-select-none" class="text-[11px] text-slate-500 hover:underline">Deseleziona tutti</button>
      </div>
    </div>
    <div id="pw-jira-select-list">${rows}</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="pw-jira-select-continua" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Continua</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  document.getElementById('pw-jira-select-all').onclick = () => root.querySelectorAll('.pw-jira-select-item').forEach(chk => chk.checked = true);
  document.getElementById('pw-jira-select-none').onclick = () => root.querySelectorAll('.pw-jira-select-item').forEach(chk => chk.checked = false);

  document.getElementById('pw-jira-select-continua').onclick = () => {
    const selected = [];
    root.querySelectorAll('.pw-jira-select-item').forEach(chk => {
      if (chk.checked) selected.push(items[parseInt(chk.dataset.idx)]);
    });
    if (selected.length === 0) { showAlertModal('Seleziona almeno un sottotask da creare.'); return; }
    pwJiraSubtaskOpenExtraFieldsModal(cIdx, commessaNome, meta, selected, skippedComuni);
  };
}

/* ----- Step 1.5: campi extra spesso obbligatori in creazione (Data scadenza,
   Stima originale, Activity Type, Target Production, Start date pianificato,
   Tempo Team) — vedi commento su pwJiraFetchExtraFields. Un solo form per
   l'intero batch (si applica a tutti i sottotask creati in questa sessione),
   con un valore di esempio precompilato ma sempre modificabile. Se il
   progetto non ha nessuno di questi campi si salta direttamente all'anteprima. */
async function pwJiraSubtaskOpenExtraFieldsModal(cIdx, commessaNome, meta, items, skippedComuni) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
    <div class="text-sm text-slate-600">⏳ Verifica campi obbligatori Jira…</div>
  </div></div>`;

  let fields;
  try {
    fields = await pwJiraFetchExtraFields(meta.jira_project_code);
  } catch (e) {
    // Non blocca il flusso: si procede senza campi extra, l'eventuale errore
    // di creazione reale su Jira resterà comunque visibile nel riepilogo finale.
    fields = [];
  }

  if (fields.length === 0) {
    pwJiraSubtaskPreview(cIdx, commessaNome, items, skippedComuni, {});
    return;
  }

  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const saturday = new Date(monday); saturday.setUTCDate(monday.getUTCDate() + 5);
  const defaults = {
    duedate: saturday.toISOString().slice(0, 10),
    originalEstimate: '8h',
    activityType: '',
    targetProduction: '',
    startDatePianificato: monday.toISOString().slice(0, 10),
    tempoTeam: '',
  };

  const rowsHtml = fields.map(f => {
    const val = defaults[f.extraKey] !== undefined ? defaults[f.extraKey] : '';
    let inputHtml;
    if (f.allowedValues && f.allowedValues.length) {
      const preselect = f.allowedValues.length === 1 ? f.allowedValues[0].id : '';
      const opts = f.allowedValues.map(v => `<option value="${esc(String(v.id))}"${String(v.id) === String(preselect) ? ' selected' : ''}>${esc(v.value)}</option>`).join('');
      inputHtml = `<select data-extra-key="${esc(f.extraKey)}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"><option value="">— seleziona —</option>${opts}</select>`;
    } else if (f.type === 'date') {
      inputHtml = `<input type="date" data-extra-key="${esc(f.extraKey)}" value="${esc(val)}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">`;
    } else if (f.type === 'number' || f.key === 'customfield_11280') {
      inputHtml = `<input type="number" data-extra-key="${esc(f.extraKey)}" value="${esc(val)}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">`;
    } else {
      inputHtml = `<input type="text" data-extra-key="${esc(f.extraKey)}" value="${esc(val)}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">`;
    }
    return `<div class="mb-2">
      <label class="block text-[11px] text-slate-500 mb-0.5">${esc(f.name)}</label>
      ${inputHtml}
    </div>`;
  }).join('');

  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-1">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <p class="text-xs text-slate-500 mb-3">Alcuni campi possono essere obbligatori in creazione su questo progetto Jira. Valori di esempio precompilati, modificabili o lasciabili vuoti.</p>
    <div id="pw-jira-extra-fields">${rowsHtml}</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
      <button id="pw-jira-extra-continua" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Continua</button>
    </div>
  </div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });

  document.getElementById('pw-jira-extra-continua').onclick = () => {
    const extraFields = {};
    root.querySelectorAll('[data-extra-key]').forEach(el => {
      const key = el.dataset.extraKey;
      if (el.value !== '') extraFields[key] = el.value;
    });
    pwJiraSubtaskPreview(cIdx, commessaNome, items, skippedComuni, extraFields);
  };
}

/* ----- Step 2: anteprima (dryRun) ----- */
async function pwJiraSubtaskPreview(cIdx, commessaNome, items, skippedComuni, extraFields) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-3">Crea sottotask Jira — ${esc(commessaNome)}</h3>
    <div id="pw-jira-preview-body" class="text-sm text-slate-500">⏳ Verifica su Jira in corso…</div>
  </div></div>`;

  let results;
  try {
    results = await pwJiraCreateSubtasks(items, true, extraFields);
  } catch (e) {
    const body = document.getElementById('pw-jira-preview-body');
    if (body) body.innerHTML = `<div class="text-red-600 text-sm">Errore durante il controllo su Jira: ${esc(e.message || String(e))}</div><div class="flex justify-end mt-4"><button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Chiudi</button></div>`;
    return;
  }

  pwJiraSubtaskApplyResultsToBadges(cIdx, items, results, false);
  pwJiraSubtaskRenderPreview(cIdx, commessaNome, items, results, skippedComuni, extraFields);
}

function pwJiraSubtaskRenderPreview(cIdx, commessaNome, items, results, skippedComuni, extraFields) {
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
    document.getElementById('pw-jira-confirm-create').onclick = () => pwJiraSubtaskConfirmCreate(cIdx, commessaNome, items, extraFields);
  }
}

/* ----- Step 3: creazione reale + riepilogo ----- */
async function pwJiraSubtaskConfirmCreate(cIdx, commessaNome, items, extraFields) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
    <div class="text-sm text-slate-600">⏳ Creazione sottotask su Jira in corso…</div>
  </div></div>`;

  let results;
  try {
    results = await pwJiraCreateSubtasks(items, false, extraFields);
  } catch (e) {
    showAlertModal('Errore durante la creazione: ' + (e.message || e));
    return;
  }

  pwJiraSubtaskApplyResultsToBadges(cIdx, items, results, true);

  const created = results.filter(r => r.status === 'created');
  const already = results.filter(r => r.status === 'already_exists');
  const errors = results.filter(r => r.status === 'error');

  let msg = `Sottotask creati: ${created.length}`;
  if (already.length) msg += `\nGià esistenti (non ricreati): ${already.length}`;
  if (errors.length) msg += `\nErrori: ${errors.length}\n` + errors.map(e => `• ${e.taskKey} / ${e.operatorEmail}: ${e.message}`).join('\n');
  showAlertModal(msg);
}
