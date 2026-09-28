/* ===================== MODIFICA COMMESSA ATTIVA ===================== */
function getCommessaAttivaMeta(nome) {
  const stored = state.commesse_attive_meta[nome] || {};
  const righe = state.staffing.filter(r => r.commessa===nome);
  let p=-1, u=-1;
  righe.forEach(r => r.mesi.forEach((v,i) => { if(Number(v)>0){ if(p<0||i<p) p=i; if(i>u) u=i; } }));
  const pad2 = n => String(n).padStart(2,'0');
  const lday = u>=0 ? new Date(ANNO,u+1,0).getDate() : 1;
  // risorse_necessarie: se non dichiarato si usa il numero di risorse distinte attualmente allocate
  const risorseAttuali = new Set(righe.map(r=>r.risorsa)).size;
  return {
    cliente: stored.cliente||'',
    codice_commessa: stored.codice_commessa||'',
    industry: stored.industry||'',
    inizio: stored.inizio||(p>=0?`${ANNO}-${pad2(p+1)}-01`:''),
    fine: stored.fine||(u>=0?`${ANNO}-${pad2(u+1)}-${pad2(lday)}`:''),
    note: stored.note||'',
    email_referente: stored.email_referente||'',
    regione: stored.regione||'',
    provincia: stored.provincia||'',
    skills: stored.skills||[],
    attestati_richiesti: stored.attestati_richiesti||[],
    dpi_richiesti: stored.dpi_richiesti||[],
    risorse_necessarie: stored.risorse_necessarie !== undefined ? stored.risorse_necessarie : null,
    jira_project_code: stored.jira_project_code||'',
    documenti: stored.documenti || [],
    _risorseAttuali: risorseAttuali,
    _dedotto: !state.commesse_attive_meta[nome],
  };
}

function openCommessaAttivaModal(nome) {
  const m = getCommessaAttivaMeta(nome);
  const regioneIniziale = m.regione || (m.provincia && provinciaInfo(m.provincia)?.regione) || '';
  const nRis = new Set(state.staffing.filter(r=>r.commessa===nome).map(r=>r.risorsa)).size;
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
    <h3 class="font-semibold text-slate-900 mb-1">Modifica commessa attiva</h3>
    <p class="text-xs text-slate-500 mb-3">${nome} · ${nRis} risorse${m._dedotto?' · <span class=\'text-amber-600\'>dati dedotti dallo staffing — compilali per salvarli</span>':''}</p>
    <div class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Cliente</span>
          <input id="ma-cli" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(m.cliente||'').replace(/"/g,'&quot;')}"></label>
        <label class="block text-xs"><span class="text-slate-600">Industry</span>
          <select id="ma-ind" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
            <option value="">(non specificata)</option>
            ${INDUSTRIES.map(x=>`<option ${x===m.industry?'selected':''}>${x}</option>`).join('')}
          </select></label>
      </div>
      <label class="block text-xs"><span class="text-slate-600">Codice commessa</span>
        <input id="ma-cod" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Es: C-2026-0123" value="${(m.codice_commessa||'').replace(/"/g,'&quot;')}"></label>
      <label class="block text-xs"><span class="text-slate-600">Codice progetto Jira <span class="text-slate-400 font-normal">(per creazione sottotask da Griglia — l'Epic e il Task si scelgono per comune al momento della creazione)</span></span>
        <input id="ma-jira-project" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Es: W07R" value="${(m.jira_project_code||'').replace(/"/g,'&quot;')}"></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Data inizio</span>
          <input id="ma-ini" type="date" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${m.inizio?m.inizio.slice(0,10):''}"></label>
        <label class="block text-xs"><span class="text-slate-600">Data fine <span class="text-[10px] text-slate-400">(modifica per proroga)</span></span>
          <input id="ma-fin" type="date" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${m.fine?m.fine.slice(0,10):''}"></label>
      </div>
      <label class="block text-xs"><span class="text-slate-600">Note / proroga / specifiche aggiuntive</span>
        <textarea id="ma-note" rows="3" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Es: Proroga al 31/12. Variante aggiunta area 5. Note interne...">${(m.note||'').replace(/</g,'&lt;')}</textarea></label>
      <label class="block text-xs"><span class="text-slate-600">Email referente tecnico <span class="text-red-500">*</span> <span class="text-slate-400 font-normal">(una o più, separate da virgola)</span></span>
        <input id="ma-email-ref" type="text" placeholder="mario.rossi@cliente.it, luigi.bianchi@cliente.it" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" value="${(m.email_referente||'').replace(/"/g,'&quot;')}"></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block text-xs"><span class="text-slate-600">Regione di lavorazione <span class="text-slate-400 font-normal">(usata per suggerire gli operatori più vicini)</span></span>
          <select id="ma-regione" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
            <option value="">(non specificata)</option>
            ${REGIONI_ITALIA.map(r => `<option value="${esc(r)}" ${r===regioneIniziale?'selected':''}>${esc(r)}</option>`).join('')}
          </select>
        </label>
        <label class="block text-xs"><span class="text-slate-600">Provincia <span class="text-slate-400 font-normal">(facoltativa)</span></span>
          <select id="ma-provincia" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"></select>
        </label>
      </div>
      <div>
        <div class="text-xs font-medium text-slate-600 mb-1">Fabbisogno risorse</div>
        <div class="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-200">
          <div class="flex-1">
            <label class="text-xs text-slate-600">
              Risorse necessarie dichiarate
              <span class="text-[10px] text-slate-400 ml-1">(sovrascrive la stima automatica)</span>
            </label>
            <div class="flex items-center gap-2 mt-1">
              <input id="ma-ris" type="number" min="0" max="100" step="1"
                class="w-24 border border-slate-300 rounded px-2 py-1.5 text-sm text-center"
                placeholder="auto"
                value="${m.risorse_necessarie !== null ? m.risorse_necessarie : ''}">
              <span class="text-[11px] text-slate-500">
                (attualmente: <b>${m._risorseAttuali}</b> risorse allocate)
              </span>
              <button type="button" id="ma-btn-fabbisogno" class="ml-auto px-2 py-1.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 whitespace-nowrap">🎯 Dettaglio skill</button>
            </div>
            <div class="text-[10px] text-slate-500 mt-1">
              Lascia vuoto per usare la stima automatica dai gg-uomo dello staffing.
              Se imposti un numero, il box fabbisogno lo usa come riferimento diretto.
            </div>
            ${(m.fabbisogno_dettagliato||[]).length > 0 ? `<div class="mt-1 text-[10px] text-teal-700 bg-teal-50 rounded px-2 py-1 border border-teal-100">Fabbisogno dettagliato: ${(m.fabbisogno_dettagliato||[]).map(r => r.quantita+'× '+(r.skills.length?r.skills.join('+'):'qualsiasi')).join(', ')}</div>` : ''}
          </div>
        </div>
      </div>
      <div>
        <div class="text-xs font-medium text-slate-600 mb-1">Skill richieste</div>
        <div class="grid grid-cols-3 gap-1 p-2 bg-slate-50 rounded border border-slate-200">
          ${SKILLS.map(s=>`<label class="flex items-center gap-1 text-xs cursor-pointer hover:bg-white rounded px-1"><input type="checkbox" class="ma-sk" value="${s}" ${m.skills.includes(s)?'checked':''}>${s}</label>`).join('')}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs font-medium text-slate-600">Attestati richiesti</div>
          <div class="flex gap-1">
            <button type="button" id="ma-att-all" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-300">Tutti</button>
            <button type="button" id="ma-att-none" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-300">Nessuno</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1 p-2 bg-purple-50 rounded border border-purple-200 max-h-48 overflow-y-auto">
          ${ATTESTATI.map(a=>`<label class="flex items-center gap-1 text-xs cursor-pointer hover:bg-white rounded px-1"><input type="checkbox" class="ma-at" value="${a.replace(/"/g,'&quot;')}" ${(m.attestati_richiesti||[]).includes(a)?'checked':''}>${a}</label>`).join('')||'<div class="text-[10px] text-slate-400 italic col-span-2">Nessun attestato nel sistema.</div>'}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs font-medium text-slate-600">DPI richiesti</div>
          <div class="flex gap-1">
            <button type="button" id="ma-dpi-all" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-300">Tutti</button>
            <button type="button" id="ma-dpi-none" class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-300">Nessuno</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1 p-2 bg-yellow-50 rounded border border-yellow-200 max-h-48 overflow-y-auto">
          ${(state.dpi_disponibili||[]).map(d=>`<label class="flex items-center gap-1 text-xs cursor-pointer hover:bg-white rounded px-1"><input type="checkbox" class="ma-dpi" value="${esc(d)}" ${(m.dpi_richiesti||[]).includes(d)?'checked':''}><span>${esc(d)}</span></label>`).join('')}
          ${(state.dpi_disponibili||[]).length===0?'<div class="text-[10px] text-yellow-700 italic col-span-2">Catalogo DPI vuoto: aggiungi i tipi di DPI dalla sezione “🦺 DPI &amp; scadenze”.</div>':''}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs font-medium text-slate-600">Documenti</div>
          <div class="flex items-center gap-2">
            <span id="ma-docs-status" class="text-[10px] text-slate-400"></span>
            <button type="button" id="ma-docs-upload-btn" class="text-[10px] px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100">📎 Carica</button>
            <input type="file" id="ma-docs-file" class="hidden" multiple>
          </div>
        </div>
        <div class="p-2 bg-slate-50 rounded border border-slate-200 max-h-48 overflow-y-auto" id="ma-docs-list">${_cmDocsListHtml(m.documenti)}</div>
        <div class="text-[10px] text-slate-400 mt-1">Max 20 MB per file. Contratti, planimetrie, verbali e altri allegati restano associati a questa commessa e scaricabili da chiunque abbia accesso all'app.</div>
      </div>
    </div>
    <div class="flex justify-between mt-4 gap-2">
      <button id="ma-reset" class="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded hover:bg-slate-50">Reset metadati</button>
      <div class="flex gap-2">
        <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>
        <button id="ma-save" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Salva</button>
      </div>
    </div>
  </div></div>`;
  function rebuildProvinciaOptionsCommessaAttiva(preselect) {
    const regioneSel = document.getElementById('ma-regione').value;
    const provSel = document.getElementById('ma-provincia');
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
  rebuildProvinciaOptionsCommessaAttiva(m.provincia || '');
  document.getElementById('ma-regione').onchange = () => rebuildProvinciaOptionsCommessaAttiva('');
  document.getElementById('ma-att-all').onclick = () => document.querySelectorAll('.ma-at').forEach(x => x.checked=true);
  document.getElementById('ma-att-none').onclick = () => document.querySelectorAll('.ma-at').forEach(x => x.checked=false);
  document.getElementById('ma-dpi-all').onclick = () => document.querySelectorAll('.ma-dpi').forEach(x => x.checked=true);
  document.getElementById('ma-dpi-none').onclick = () => document.querySelectorAll('.ma-dpi').forEach(x => x.checked=false);
  document.getElementById('ma-docs-upload-btn').onclick = () => {
    if (!sbGuardWrite()) return;
    document.getElementById('ma-docs-file').click();
  };
  document.getElementById('ma-docs-file').onchange = (e) => cmUploadDocumenti(nome, e.target);
  cmDocsBindListHandlers(nome);
  document.getElementById('ma-btn-fabbisogno').onclick = () => {
    const n = nome;
    closeModal();
    setTimeout(() => openFabbisognoModal(null, n), 50);
  };
  document.getElementById('ma-reset').onclick = async () => {
    if (!sbGuardWrite()) return;
    const nDocs = (state.commesse_attive_meta[nome]?.documenti || []).length;
    const msg = nDocs > 0
      ? `Rimuovere i metadati salvati? Include ${nDocs} document${nDocs===1?'o':'i'} caricat${nDocs===1?'o':'i'}: i riferimenti verranno persi (i file restano nello storage ma non più raggiungibili da qui).`
      : 'Rimuovere i metadati salvati?';
    if(!await showConfirmAsync(msg, 'Rimuovi')) return;
    delete state.commesse_attive_meta[nome]; await saveState(null, null, true); renderAll(); closeModal();
  };
  document.getElementById('ma-save').onclick = async () => {
    if (!sbGuardWrite()) return;
    const risRaw = document.getElementById('ma-ris').value.trim();
    const risDichiarate = risRaw !== '' ? parseInt(risRaw) : null;
    // Validazione: se specificato deve essere >= 0
    if (risDichiarate !== null && (isNaN(risDichiarate) || risDichiarate < 0)) {
      showAlertModal('Il numero di risorse necessarie deve essere un numero intero ≥ 0, oppure lascialo vuoto per la stima automatica.');
      return;
    }
    const emailRefList = parseEmailList(document.getElementById('ma-email-ref').value);
    if (!emailRefList) { showAlertModal('Email referente tecnico obbligatoria: inserisci una o più email valide separate da virgola.'); return; }
    state.commesse_attive_meta[nome] = {
      cliente: document.getElementById('ma-cli').value.trim(),
      codice_commessa: document.getElementById('ma-cod').value.trim(),
      jira_project_code: document.getElementById('ma-jira-project').value.trim(),
      industry: document.getElementById('ma-ind').value,
      inizio: document.getElementById('ma-ini').value,
      fine: document.getElementById('ma-fin').value,
      note: document.getElementById('ma-note').value,
      email_referente: emailRefList.join(', '),
      regione: document.getElementById('ma-regione').value,
      provincia: document.getElementById('ma-provincia').value,
      skills: [...document.querySelectorAll('.ma-sk:checked')].map(x=>x.value),
      attestati_richiesti: [...document.querySelectorAll('.ma-at:checked')].map(x=>x.value),
      dpi_richiesti: [...document.querySelectorAll('.ma-dpi:checked')].map(x=>x.value),
      risorse_necessarie: risDichiarate,
    };
    await saveState('Modifica commessa attiva', {commessa: nome}, true); renderAll(); closeModal();
  };
}

/* ===================== DOCUMENTI COMMESSA (Supabase Storage, bucket "commesse-docs") =====================
   Metadati persistiti in state.commesse_attive_meta[nome].documenti (dominio "core", già
   sincronizzato); il file binario vive solo nello Storage bucket, mai nel payload jsonb.
   Bucket privato: download tramite URL firmato temporaneo (createSignedUrl), non pubblico. */
const CM_DOC_MAX_SIZE = 20 * 1024 * 1024; // coerente col file_size_limit del bucket

function _cmFmtFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

function _cmDocSanitizeNome(nome) {
  return (nome || 'commessa').replace(/[^\w.-]+/g, '_').slice(0, 80);
}

function _cmDocsListHtml(documenti) {
  if (!documenti || !documenti.length) {
    return '<div class="text-[11px] text-slate-400 italic py-1">Nessun documento caricato.</div>';
  }
  return documenti.map(d => `
    <div class="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
      <div class="min-w-0">
        <button type="button" class="cm-doc-download text-xs text-teal-700 hover:underline truncate text-left" data-path="${esc(d.path)}" title="Scarica ${esc(d.nome_file)}">📄 ${esc(d.nome_file)}</button>
        <div class="text-[10px] text-slate-400">${_cmFmtFileSize(d.size)} · ${esc(d.caricato_da||'')} · ${d.caricato_il ? fmtDate(d.caricato_il.slice(0,10)) : ''}</div>
      </div>
      <button type="button" class="cm-doc-delete text-xs text-slate-400 hover:text-red-600 flex-shrink-0" data-id="${esc(d.id)}" title="Elimina documento">🗑</button>
    </div>`).join('');
}

// Rigenera solo la lista documenti dentro il modal aperto, senza toccare gli altri campi
// (che potrebbero avere modifiche non ancora salvate con "Salva").
function cmDocsRefresh(nome) {
  const container = document.getElementById('ma-docs-list');
  if (!container) return;
  const meta = state.commesse_attive_meta[nome] || {};
  container.innerHTML = _cmDocsListHtml(meta.documenti || []);
  cmDocsBindListHandlers(nome);
}

function cmDocsBindListHandlers(nome) {
  const container = document.getElementById('ma-docs-list');
  if (!container) return;
  container.querySelectorAll('.cm-doc-download').forEach(b => b.onclick = () => cmDownloadDocumento(b.dataset.path));
  container.querySelectorAll('.cm-doc-delete').forEach(b => b.onclick = () => cmDeleteDocumento(nome, b.dataset.id));
}

// Alert bloccante come showConfirmAsync: showAlertModal/showConfirmAsync scrivono
// entrambi su #modal-root, lo stesso nodo dove vive il modal "Modifica commessa attiva"
// — mostrarli lo sostituisce, non lo sovrappone. Qui dentro serve sempre atteso
// (await) prima di riaprire il modal sottostante, altrimenti l'alert sparirebbe subito
// o il modal risulterebbe "chiuso" (root vuoto) finché non lo si riapre esplicitamente.
function _cmAlertAsync(msg) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const safeMsg = typeof msg === 'string' ? esc(msg).replace(/\n/g, '<br>') : String(msg);
    root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5"><div class="mb-4 whitespace-pre-line">' + safeMsg + '</div><div class="flex justify-end"><button id="cm-alert-ok" class="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">OK</button></div></div></div>';
    document.getElementById('cm-alert-ok').onclick = () => { closeModal(); resolve(); };
  });
}

async function cmUploadDocumenti(nome, inputEl) {
  const files = Array.from(inputEl.files || []);
  inputEl.value = '';
  if (!files.length) return;
  if (!sbCanWrite()) { await _cmAlertAsync('Il tuo ruolo è di sola lettura: le modifiche non vengono salvate.'); openCommessaAttivaModal(nome); return; }
  if (!_sbClient || !_sbUser) { await _cmAlertAsync('Non connesso: impossibile caricare documenti in modalità offline.'); openCommessaAttivaModal(nome); return; }
  const tooBig = files.filter(f => f.size > CM_DOC_MAX_SIZE);
  if (tooBig.length) {
    await _cmAlertAsync(`File troppo grande (max 20 MB): ${tooBig.map(f=>f.name).join(', ')}`);
    openCommessaAttivaModal(nome);
    return;
  }
  const statusEl = document.getElementById('ma-docs-status');
  // Se la commessa non ha ancora metadati propri (solo dedotti dallo staffing), li
  // persiste ora: senza un record in commesse_attive_meta i documenti non avrebbero dove vivere.
  if (!state.commesse_attive_meta[nome]) {
    const dedotti = getCommessaAttivaMeta(nome);
    delete dedotti._dedotto;
    delete dedotti._risorseAttuali;
    state.commesse_attive_meta[nome] = dedotti;
  }
  const meta = state.commesse_attive_meta[nome];
  if (!Array.isArray(meta.documenti)) meta.documenti = [];
  const erroriUpload = [];
  for (const file of files) {
    if (statusEl) statusEl.textContent = `Carico "${file.name}"…`;
    const safeName = file.name.replace(/[^\w.-]+/g, '_');
    const path = `${_cmDocSanitizeNome(nome)}/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${safeName}`;
    const { error } = await _sbClient.storage.from('commesse-docs').upload(path, file, { upsert: false });
    if (error) { erroriUpload.push(`${file.name}: ${error.message}`); continue; }
    meta.documenti.push({
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      nome_file: file.name,
      path,
      size: file.size,
      caricato_da: _sbUser?.email || '',
      caricato_il: new Date().toISOString(),
    });
  }
  await saveState('Caricamento documenti commessa', {commessa: nome}, true);
  if (erroriUpload.length) {
    // L'alert sostituisce comunque #modal-root: riaprire il modal dopo è l'unico modo
    // di tornarci, la lista aggiornata (documenti già caricati con successo) arriva
    // gratis dalla rilettura di state.commesse_attive_meta in openCommessaAttivaModal.
    await _cmAlertAsync('Alcuni file non sono stati caricati:\n' + erroriUpload.join('\n'));
    openCommessaAttivaModal(nome);
  } else {
    // Nessun dialog mostrato in questo ramo: il DOM del modal è intatto, basta
    // rigenerare la sola lista invece di riaprire tutto il modal (preserva eventuali
    // altri campi non ancora salvati con "Salva").
    cmDocsRefresh(nome);
  }
}

async function cmDownloadDocumento(path) {
  if (!_sbClient) { showAlertModal('Non connesso: impossibile scaricare il documento in modalità offline.'); return; }
  const { data, error } = await _sbClient.storage.from('commesse-docs').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) { showAlertModal('Errore nella generazione del link di download: ' + (error?.message||'')); return; }
  window.open(data.signedUrl, '_blank');
}

async function cmDeleteDocumento(nome, docId) {
  if (!sbCanWrite()) { await _cmAlertAsync('Il tuo ruolo è di sola lettura: le modifiche non vengono salvate.'); openCommessaAttivaModal(nome); return; }
  const meta = state.commesse_attive_meta[nome];
  const doc = (meta?.documenti || []).find(d => d.id === docId);
  if (!doc) return;
  // showConfirmAsync scrive anch'esso su #modal-root: qualunque sia l'esito, il modal
  // "Modifica commessa attiva" va sempre riaperto esplicitamente dopo, altrimenti resta
  // vuoto (sembra "chiuso da solo" — comportamento segnalato e da evitare).
  const ok = await showConfirmAsync(`Eliminare il documento "${doc.nome_file}"? L'operazione non è reversibile.`, 'Elimina');
  if (!ok) { openCommessaAttivaModal(nome); return; }
  const { error } = await _sbClient.storage.from('commesse-docs').remove([doc.path]);
  if (error) { await _cmAlertAsync('Errore nell\'eliminazione del file: ' + error.message); openCommessaAttivaModal(nome); return; }
  meta.documenti = meta.documenti.filter(d => d.id !== docId);
  await saveState('Eliminazione documento commessa', {commessa: nome}, true);
  openCommessaAttivaModal(nome);
}

/* ===================== CHIUDI / RIPRISTINA COMMESSA ===================== */
async function chiudiCommessa(nome) {
  if (!sbGuardWrite()) return;
  const righe = state.staffing.filter(r => r.commessa===nome);
  const risorse = [...new Set(righe.map(r=>r.risorsa))];
  const tot = righe.reduce((s,r) => s+r.mesi.reduce((a,b)=>a+(Number(b)||0),0), 0);
  const msg = righe.length
    ? `Chiudere "${nome}"?\n\u2022 ${risorse.length} risorse liberate\n\u2022 ${righe.length} righe archiviate (${tot} gg-uomo)\n\nRipristinabile dall'archivio.`
    : `Chiudere "${nome}"?\n(Nessuna allocazione staffing)\n\nRipristinabile dall'archivio.`;
  if (!await showConfirmAsync(msg)) return;
  state.commesse_chiuse.push({
    progetto: nome,
    dataChiusura: new Date().toISOString().slice(0,10),
    staffingArchiviato: JSON.parse(JSON.stringify(righe)),
  });
  state.staffing = state.staffing.filter(r => r.commessa !== nome);
  state.commesse_attive = (state.commesse_attive || []).filter(ca => (ca.progetto||ca.nome) !== nome);
  if (state.commesse_attive_meta && state.commesse_attive_meta[nome]) delete state.commesse_attive_meta[nome];
  // Esclusione PERMANENTE: a differenza di commesse_chiuse (archivio restaurabile,
  // può essere svuotato dall'utente), questa lista non si svuota mai automaticamente.
  // Garantisce che la commessa non torni mai a comparire, anche se in futuro
  // l'utente elimina la voce corrispondente dall'archivio visivo.
  if (!state.commesse_escluse) state.commesse_escluse = [];
  const nomeTrim = (nome || '').trim();
  if (!state.commesse_escluse.some(n => (n||'').trim() === nomeTrim)) {
    state.commesse_escluse.push(nome);
  }
  // Pulizia fondamentale: rimuove anche dalla chiave di storage "commesse_attive_extra",
  // altrimenti la commessa promossa da pipeline torna a comparire al prossimo loadState()
  const extra = (await sget('commesse_attive_extra')) || [];
  const extraFiltrato = extra.filter(e => (e.progetto||e.nome) !== nome);
  await sset('commesse_attive_extra', extraFiltrato);
  ricalcolaAllocOperatori();
  await saveState('Chiusura commessa', {commessa: nome}, true); renderAll();
}

async function ripristinaCommessa(idx) {
  if (!sbGuardWrite()) return;
  const cc = state.commesse_chiuse[idx];
  if (!cc) return;
  if (!await showConfirmAsync(`Ripristinare "${cc.progetto}"?\n${cc.staffingArchiviato.length} righe staffing reinserite.`, 'Ripristina')) return;
  cc.staffingArchiviato.forEach(r => state.staffing.push(JSON.parse(JSON.stringify(r))));
  state.commesse_chiuse.splice(idx,1);
  // Rimuove anche dalla lista di esclusione permanente: ripristinare significa
  // farla tornare visibile esattamente come prima della chiusura.
  const nomeTrim = (cc.progetto || '').trim();
  state.commesse_escluse = (state.commesse_escluse || []).filter(n => (n||'').trim() !== nomeTrim);
  ricalcolaAllocOperatori();
  await saveState(null, null, true); renderAll();
}
function renderArchivioCommesseChiuse() {
  if (!state.commesse_chiuse || !state.commesse_chiuse.length) return '';
  const q = (state.searchCommesse||'').toLowerCase();
  const lista = state.commesse_chiuse
    .map((cc,i) => ({...cc,_i:i}))
    .filter(cc => !q || cc.progetto.toLowerCase().includes(q));
  if (!lista.length) return '';
  const items = lista.map(cc => {
    const tot = cc.staffingArchiviato.reduce((s,r)=>s+r.mesi.reduce((a,b)=>a+(Number(b)||0),0),0);
    const ris = [...new Set(cc.staffingArchiviato.map(r=>r.risorsa))].length;
    return `<div class="bg-slate-50 border border-slate-300 rounded-md p-2 opacity-70 flex items-center justify-between gap-2">
      <div>
        <div class="text-xs font-medium text-slate-700">✓ ${cc.progetto}</div>
        <div class="text-[10px] text-slate-500">Chiusa ${cc.dataChiusura} · ${ris} risorse · ${tot} gg-uomo</div>
      </div>
      <div class="flex gap-1">
        <button class="restore-commessa text-xs px-2 py-1 bg-white text-slate-700 rounded border border-slate-300 hover:bg-slate-100" data-idx="${cc._i}">↺ Ripristina</button>
        <button class="delete-commessa-chiusa text-xs text-slate-400 hover:text-red-600" data-idx="${cc._i}">🗑</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="mt-4 pt-4 border-t-2 border-dashed border-slate-200">
    <details ${lista.length<=3?'open':''}>
      <summary class="text-xs font-semibold text-slate-600 cursor-pointer mb-2">📁 Archivio chiuse (${state.commesse_chiuse.length})</summary>
      <div class="space-y-2 mt-1">${items}</div>
    </details>
  </div>`;
}

/* ===================== CONFRONTO PREVENTIVATO / EFFETTIVO — UI =====================
   Box collassabile con tabella Risorsa|Prev|Eff|Δ|Stato per il mese selezionato.
   La parte che cambia al cambio mese (select + tabella) è isolata in .confronto-body
   così _refreshConfrontoBox (dashboard-staffing-celle.js) può rigenerarla senza
   toccare il <details> esterno, preservandone lo stato aperto/chiuso.
*/
const _CONFRONTO_STATO_BADGE = {
  ok: '<span class="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded whitespace-nowrap">✓ ok</span>',
  scostamento: '<span class="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded whitespace-nowrap">⚠ scostamento</span>',
  assente: '<span class="text-[10px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded whitespace-nowrap">🔴 assente in Griglia</span>',
  extra: '<span class="text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded whitespace-nowrap">⚡ extra</span>',
};

// Tabella Risorsa|Prev|Eff|Δ|Stato a partire da un confronto giÃ  calcolato
// (calcolaConfrontoCommessa). Condivisa tra il box nelle card "Attive" e il
// popup di dettaglio mese della Vista mensile (Gantt), per un rendering coerente.
function _confrontoTableHtml(confronto) {
  if (confronto.righe.length === 0) {
    return confronto.datiGrigliaAssenti
      ? `<div class="text-[11px] text-slate-400 italic text-center py-1">Nessuna risorsa preventivata e nessun dato dalla Griglia settimanale per questo mese.</div>`
      : `<div class="text-[11px] text-slate-400 italic text-center py-1">Nessuna risorsa preventivata o rilevata in Griglia per questo mese.</div>`;
  }
  const notaGriglia = confronto.datiGrigliaAssenti
    ? `<div class="text-[10px] text-slate-400 italic mb-1">Nessun dato dalla Griglia settimanale per questo mese — sotto solo i gg preventivati.</div>`
    : '';
  const rows = confronto.righe.map(r => `
    <tr class="border-b border-slate-100">
      <td class="p-1 text-[11px] text-slate-800">${esc(r.nome)}</td>
      <td class="text-center text-[11px] text-slate-600">${r.prev || '—'}</td>
      <td class="text-center text-[11px] text-slate-600">${r.eff || '—'}</td>
      <td class="text-center text-[11px] font-medium ${r.delta<0?'text-red-600':(r.delta>0?'text-blue-600':'text-slate-400')}">${r.delta>0?'+':''}${r.delta}</td>
      <td class="text-center p-1">${_CONFRONTO_STATO_BADGE[r.stato]}</td>
    </tr>`).join('');
  return notaGriglia + `<table class="w-full text-[10px]">
    <thead><tr class="text-slate-400">
      <th class="text-left font-medium p-1">Risorsa</th>
      <th class="font-medium">Prev</th>
      <th class="font-medium">Eff</th>
      <th class="font-medium">Δ</th>
      <th class="font-medium">Stato</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _confrontoBodyHtml(commessaNome, meseSel) {
  const meseOptions = MESI_LONG.map((m, i) => `<option value="${i}" ${i===meseSel?'selected':''}>${m}</option>`).join('');
  const selectHtml = `<div class="flex justify-end mb-1">
    <select class="confronto-mese-sel text-[10px] border border-slate-300 rounded px-1 py-0.5" data-commessa="${encodeURIComponent(commessaNome)}">${meseOptions}</select>
  </div>`;
  const confronto = calcolaConfrontoCommessa(commessaNome, meseSel);
  return selectHtml + _confrontoTableHtml(confronto);
}

function renderConfrontoBox(commessaNome, meseSel) {
  return `<details class="confronto-box my-2 p-2 rounded border border-slate-200 bg-slate-50" data-commessa="${encodeURIComponent(commessaNome)}">
    <summary class="cursor-pointer text-[11px] font-semibold text-slate-600">🔍 Confronto Preventivo/Effettivo</summary>
    <div class="confronto-body mt-2">${_confrontoBodyHtml(commessaNome, meseSel)}</div>
  </details>`;
}

