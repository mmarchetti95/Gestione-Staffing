/* ===================== FORNITORI ===================== */
// Registro dei fornitori esterni: anagrafica + dipendenti e strumenti che mettono
// a disposizione di volta in volta per la programmazione settimanale. Lista
// separata da state.operatori (vedi domanda utente v18.171.0): questi dipendenti
// e strumenti sono selezionabili in Griglia (weekly-operatore-modal.js,
// weekly-strumenti.js) ma restano fuori da KPI, gap risorse & raccomandazioni
// assunzione, coerenza attestati e mappatura email Jira, che lavorano solo sul
// pool interno.
// Dalla v18.251.0 la lista si sincronizza su Supabase (chiave core 'fornitori', prima
// restava solo nel browser) e un dipendente può avere l'email Jira: con l'email ha i
// sottotask come gli interni e i worklog copiati dal collega Eagle in squadra
// (produzione-fornitori-worklog.js). «🏢 Sposta in un fornitore» nella gestione
// dell'operatore lo toglie dal pool tenendo nome, email, provincia e skill.

function fornGenId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Fornitore e dipendente di un nome della Griglia (null se è del pool interno o sconosciuto).
function fornitoreDiNome(nome) {
  if (!nome) return null;
  for (const f of (state.fornitori || [])) {
    const d = (f.dipendenti || []).find(d => d.nome_esteso === nome);
    if (d) return { fornitore: f, dipendente: d };
  }
  return null;
}

// Riga della Griglia di un dipendente fornitore: col flag op.fornitore (scelto dalla
// tendina) o perché il nome è fra i dipendenti (es. operatore spostato dal pool).
function pwRigaFornitore(op) {
  return !!(op && (op.fornitore || fornitoreDiNome(op.nome)));
}

// Email Jira di un nome della Griglia: pool interno, poi dipendenti dei fornitori. '' se non c'è.
function opEmailDi(nome) {
  if (!nome) return '';
  const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome_breve || o.nome) === nome);
  if (op) return op.email && op.email.trim() ? op.email.trim() : '';
  const fd = fornitoreDiNome(nome);
  return fd && fd.dipendente.email && fd.dipendente.email.trim() ? fd.dipendente.email.trim() : '';
}

// nome -> email di tutti quelli che ce l'hanno (pool interno + dipendenti fornitore).
function opEmailMappa() {
  const m = {};
  (state.fornitori || []).forEach(f => (f.dipendenti || []).forEach(d => {
    if (d.nome_esteso && d.email && d.email.trim()) m[d.nome_esteso] = d.email.trim();
  }));
  (state.operatori || []).forEach(o => {
    const n = o.nome_esteso || o.nome_breve || o.nome;
    if (n && o.email && o.email.trim()) m[n] = o.email.trim();
  });
  return m;
}

function renderFornitori() {
  const list = document.getElementById('fornitori-list');
  if (!list) return;
  const countEl = document.getElementById('fornitori-count');
  if (countEl) countEl.textContent = `(${state.fornitori.length})`;

  // Ogni azione (aggiungi/rimuovi dipendente o strumento, modifica campo) richiama
  // renderFornitori() e ricostruisce tutte le card da zero: senza questo, le
  // <details> già aperte si richiuderebbero ad ogni click. Si salva quali sono
  // aperte prima di riscrivere l'HTML e si riapplica dopo.
  const openIds = new Set(
    [...list.querySelectorAll('details.fornitore-card[open]')].map(d => d.dataset.fid)
  );

  const q = (state.searchFornitori || '').toLowerCase().trim();
  const filtered = q
    ? state.fornitori.filter(f => ((f.nome||'') + ' ' + (f.referente||'')).toLowerCase().includes(q))
    : state.fornitori;

  list.innerHTML = filtered
    .slice()
    .sort((a, b) => (a.nome||'').localeCompare(b.nome||''))
    .map(f => renderFornitoreCard(f)).join('')
    || `<div class="text-center text-sm text-slate-400 py-6">${q ? 'Nessun fornitore corrisponde alla ricerca.' : 'Nessun fornitore registrato. Clicca "+ Nuovo fornitore" per aggiungerne uno.'}</div>`;

  list.querySelectorAll('details.fornitore-card').forEach(d => { if (openIds.has(d.dataset.fid)) d.open = true; });

  wireFornitoriEvents(list);
}

function renderFornitoreCard(f) {
  const dipHtml = (f.dipendenti || []).map(d => renderFornitoreDipendenteRow(f.id, d)).join('')
    || '<div class="text-[11px] text-slate-400 italic px-1 py-1">Nessun dipendente.</div>';
  const strHtml = (f.strumenti || []).map(s => renderFornitoreStrumentoRow(f.id, s)).join('')
    || '<div class="text-[11px] text-slate-400 italic px-1 py-1">Nessuno strumento.</div>';

  return `<details class="fornitore-card border border-slate-200 rounded-lg" data-fid="${esc(f.id)}">
    <summary class="flex items-center justify-between px-3 py-2 cursor-pointer select-none">
      <div class="flex items-center gap-2 min-w-0">
        <span class="chevron text-slate-400 text-xs">▶</span>
        <span class="font-medium text-sm text-slate-800 truncate">${esc(f.nome || '(senza nome)')}</span>
        <span class="text-[10px] text-slate-400 whitespace-nowrap">👷 ${(f.dipendenti||[]).length} · 🔧 ${(f.strumenti||[]).length}</span>
      </div>
      <button class="del-fornitore text-xs text-red-400 hover:text-red-600 px-1" data-fid="${esc(f.id)}" title="Elimina fornitore">🗑</button>
    </summary>
    <div class="px-3 pb-3 pt-1 space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <input class="forn-field text-xs border border-slate-300 rounded px-2 py-1" data-fid="${esc(f.id)}" data-field="nome" placeholder="Nome fornitore" value="${esc(f.nome||'')}">
        <input class="forn-field text-xs border border-slate-300 rounded px-2 py-1" data-fid="${esc(f.id)}" data-field="referente" placeholder="Referente" value="${esc(f.referente||'')}">
        <input class="forn-field text-xs border border-slate-300 rounded px-2 py-1" data-fid="${esc(f.id)}" data-field="telefono" placeholder="Telefono" value="${esc(f.telefono||'')}">
        <input class="forn-field text-xs border border-slate-300 rounded px-2 py-1" data-fid="${esc(f.id)}" data-field="email" placeholder="Email" value="${esc(f.email||'')}">
        <textarea class="forn-field col-span-2 text-xs border border-slate-300 rounded px-2 py-1" data-fid="${esc(f.id)}" data-field="note" placeholder="Note" rows="2">${esc(f.note||'')}</textarea>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] uppercase tracking-wider text-slate-500 font-medium">👷 Dipendenti</span>
          <button class="add-forn-dip text-[11px] px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100" data-fid="${esc(f.id)}">+ Aggiungi</button>
        </div>
        <div class="space-y-1">${dipHtml}</div>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] uppercase tracking-wider text-slate-500 font-medium">🔧 Strumenti</span>
          <button class="add-forn-str text-[11px] px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 hover:bg-teal-100" data-fid="${esc(f.id)}">+ Aggiungi</button>
        </div>
        <div class="space-y-1">${strHtml}</div>
      </div>
    </div>
  </details>`;
}

function renderFornitoreDipendenteRow(fid, d) {
  const skillChips = SKILLS.map(s => {
    const on = (d.skills||[]).includes(s);
    return `<button type="button" class="forn-dip-skill text-[9px] px-1.5 py-0.5 rounded border ${on?'bg-teal-100 border-teal-400 text-teal-800':'bg-white border-slate-300 text-slate-500'}"
      data-fid="${esc(fid)}" data-did="${esc(d.id)}" data-skill="${esc(s)}">${s}</button>`;
  }).join('');
  return `<div class="border border-slate-200 rounded px-2 py-1.5 space-y-1" data-fid="${esc(fid)}" data-did="${esc(d.id)}">
    <div class="flex items-center gap-1">
      <input class="forn-dip-field flex-1 text-xs border border-slate-300 rounded px-1.5 py-0.5" data-fid="${esc(fid)}" data-did="${esc(d.id)}" data-field="nome_esteso" placeholder="Nome e cognome" value="${esc(d.nome_esteso||'')}">
      <select class="forn-dip-field text-xs border border-slate-300 rounded px-1 py-0.5" data-fid="${esc(fid)}" data-did="${esc(d.id)}" data-field="provincia">
        <option value="">Provincia…</option>
        ${PROVINCE_ITALIA.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(p => `<option value="${p.sigla}" ${d.provincia===p.sigla?'selected':''}>${esc(p.nome)} (${p.sigla})</option>`).join('')}
      </select>
      <button class="del-forn-dip text-red-400 hover:text-red-600 text-xs px-1" data-fid="${esc(fid)}" data-did="${esc(d.id)}" title="Rimuovi dipendente">✕</button>
    </div>
    <input class="forn-dip-field w-full text-xs border border-slate-300 rounded px-1.5 py-0.5" data-fid="${esc(fid)}" data-did="${esc(d.id)}" data-field="email" type="email"
      placeholder="Email Jira (facoltativa: con l'email ha i sottotask e i worklog copiati dal collega Eagle)" value="${esc(d.email||'')}">
    <div class="flex flex-wrap gap-1">${skillChips}</div>
  </div>`;
}

function renderFornitoreStrumentoRow(fid, s) {
  return `<div class="flex items-center gap-1" data-fid="${esc(fid)}" data-sid="${esc(s.id)}">
    <input class="forn-str-field flex-1 text-xs border border-slate-300 rounded px-1.5 py-0.5" data-fid="${esc(fid)}" data-sid="${esc(s.id)}" data-field="nome" placeholder="Nome strumento" value="${esc(s.nome||'')}">
    <input class="forn-str-field w-28 text-xs border border-slate-300 rounded px-1.5 py-0.5" data-fid="${esc(fid)}" data-sid="${esc(s.id)}" data-field="tipo" placeholder="Tipo" value="${esc(s.tipo||'')}">
    <button class="del-forn-str text-red-400 hover:text-red-600 text-xs px-1" data-fid="${esc(fid)}" data-sid="${esc(s.id)}" title="Rimuovi strumento">✕</button>
  </div>`;
}

function wireFornitoriEvents(list) {
  list.querySelectorAll('.del-fornitore').forEach(b => b.onclick = () => deleteFornitore(b.dataset.fid));
  list.querySelectorAll('.add-forn-dip').forEach(b => b.onclick = () => addFornitoreDipendente(b.dataset.fid));
  list.querySelectorAll('.del-forn-dip').forEach(b => b.onclick = () => removeFornitoreDipendente(b.dataset.fid, b.dataset.did));
  list.querySelectorAll('.add-forn-str').forEach(b => b.onclick = () => addFornitoreStrumento(b.dataset.fid));
  list.querySelectorAll('.del-forn-str').forEach(b => b.onclick = () => removeFornitoreStrumento(b.dataset.fid, b.dataset.sid));

  list.querySelectorAll('.forn-dip-skill').forEach(b => b.onclick = () => toggleFornitoreDipendenteSkill(b.dataset.fid, b.dataset.did, b.dataset.skill));

  list.querySelectorAll('.forn-field').forEach(el => {
    el.addEventListener('blur', () => updateFornitoreField(el.dataset.fid, el.dataset.field, el.value, el));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') el.blur(); });
  });
  list.querySelectorAll('.forn-dip-field').forEach(el => {
    const evt = el.tagName === 'SELECT' ? 'change' : 'blur';
    el.addEventListener(evt, () => updateFornitoreDipendenteField(el.dataset.fid, el.dataset.did, el.dataset.field, el.value));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  });
  list.querySelectorAll('.forn-str-field').forEach(el => {
    el.addEventListener('blur', () => updateFornitoreStrumentoField(el.dataset.fid, el.dataset.sid, el.dataset.field, el.value));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  });
}

async function addFornitore() {
  if (!sbGuardWrite()) return;
  const f = { id: fornGenId('forn'), nome: 'Nuovo fornitore', referente: '', telefono: '', email: '', note: '', dipendenti: [], strumenti: [] };
  state.fornitori.push(f);
  await saveState('Nuovo fornitore', {fornitore: f.nome}, true);
  renderFornitori();
  const det = document.querySelector(`details[data-fid="${CSS.escape(f.id)}"]`);
  if (det) { det.open = true; det.querySelector('.forn-field')?.focus(); det.querySelector('.forn-field')?.select(); }
}

async function deleteFornitore(fid) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  if (!f) return;
  if (!await showConfirmAsync(`Eliminare il fornitore "${f.nome}" con tutti i suoi ${((f.dipendenti||[]).length)} dipendenti e ${((f.strumenti||[]).length)} strumenti? Le assegnazioni già fatte in Griglia per i suoi dipendenti/strumenti resteranno com'erano, ma non saranno più modificabili dalla tendina.`, 'Elimina fornitore')) return;
  state.fornitori = state.fornitori.filter(f => f.id !== fid);
  await saveState('Eliminazione fornitore', {fornitore: f.nome}, true);
  renderFornitori();
}

async function updateFornitoreField(fid, field, value, el) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  if (!f) return;
  const v = (value || '').trim();
  if (f[field] === v) return;
  f[field] = v;
  await saveState();
  if (field === 'nome') renderFornitori();
}

async function addFornitoreDipendente(fid) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  if (!f) return;
  f.dipendenti = f.dipendenti || [];
  f.dipendenti.push({ id: fornGenId('dip'), nome_esteso: '', skills: [], provincia: '', telefono: '', note: '' });
  await saveState('Nuovo dipendente fornitore', {fornitore: f.nome});
  renderFornitori();
}

async function removeFornitoreDipendente(fid, did) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  if (!f) return;
  const d = (f.dipendenti||[]).find(d => d.id === did);
  if (!await showConfirmAsync(`Rimuovere "${d?.nome_esteso || 'questo dipendente'}" dal fornitore "${f.nome}"?`, 'Rimuovi dipendente')) return;
  f.dipendenti = (f.dipendenti||[]).filter(d => d.id !== did);
  await saveState('Rimozione dipendente fornitore', {fornitore: f.nome});
  renderFornitori();
}

async function updateFornitoreDipendenteField(fid, did, field, value) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  const d = f && (f.dipendenti||[]).find(d => d.id === did);
  if (!d) return;
  const v = (value || '').trim();
  if (d[field] === v) return;
  d[field] = v;
  await saveState();
}

async function toggleFornitoreDipendenteSkill(fid, did, skill) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  const d = f && (f.dipendenti||[]).find(d => d.id === did);
  if (!d) return;
  d.skills = d.skills || [];
  const i = d.skills.indexOf(skill);
  if (i >= 0) d.skills.splice(i, 1); else d.skills.push(skill);
  await saveState();
  renderFornitori();
}

async function addFornitoreStrumento(fid) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  if (!f) return;
  f.strumenti = f.strumenti || [];
  f.strumenti.push({ id: fornGenId('str'), nome: '', tipo: '', note: '' });
  await saveState('Nuovo strumento fornitore', {fornitore: f.nome});
  renderFornitori();
}

async function removeFornitoreStrumento(fid, sid) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  if (!f) return;
  const s = (f.strumenti||[]).find(s => s.id === sid);
  if (!await showConfirmAsync(`Rimuovere lo strumento "${s?.nome || ''}" dal fornitore "${f.nome}"? Se è assegnato in una Griglia della settimana, l'assegnazione resterà ma non sarà più selezionabile dalla tendina.`, 'Rimuovi strumento')) return;
  f.strumenti = (f.strumenti||[]).filter(s => s.id !== sid);
  await saveState('Rimozione strumento fornitore', {fornitore: f.nome});
  renderFornitori();
}

async function updateFornitoreStrumentoField(fid, sid, field, value) {
  if (!sbGuardWrite()) return;
  const f = state.fornitori.find(f => f.id === fid);
  const s = f && (f.strumenti||[]).find(s => s.id === sid);
  if (!s) return;
  const v = (value || '').trim();
  if (s[field] === v) return;
  s[field] = v;
  await saveState();
}

/* ----- Sposta un operatore del pool in un fornitore (v18.251.0) -----
   Per chi in realtà lavora per un fornitore esterno: esce dal pool (KPI, gap risorse,
   attestati, staffing futuro azzerato come in deleteOperatore) e diventa dipendente del
   fornitore con lo STESSO nome, così Griglia, sottotask Jira (pw_jira_subtask) e storico del
   Controllo Produzione continuano a riconoscerlo. Email, provincia, skill e cognome passano
   al dipendente; nelle righe della Griglia dalla settimana corrente in poi si scrive
   op.fornitore (badge 🏢). Le settimane passate restano com'erano. */
function apriSpostaInFornitore(opId) {
  const op = (state.operatori || []).find(o => o.id === opId);
  if (!op) return;
  if (!(state.fornitori || []).length) {
    showAlertModal('Non ci sono fornitori: crealo prima in Dashboard → Fornitori («+ Nuovo fornitore»).');
    return;
  }
  const opzioni = state.fornitori.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
    .map(f => '<option value="' + esc(f.id) + '">' + esc(f.nome || '(senza nome)') + '</option>').join('');
  const root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-backdrop">' +
    '<div class="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">' +
      '<div class="text-sm font-semibold text-slate-900 mb-1">🏢 Sposta in un fornitore</div>' +
      '<div class="text-xs text-slate-500 mb-3"><span class="font-semibold text-slate-800">' + esc(op.nome_esteso || '') + '</span> esce dal pool operatori e diventa dipendente del fornitore, con lo stesso nome, email, provincia e skill.</div>' +
      '<select id="spf-forn" class="w-full text-sm border border-slate-300 rounded px-2 py-1.5 mb-3">' + opzioni + '</select>' +
      '<div class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 mb-3">' +
        '✓ Griglia, sottotask Jira e Controllo Produzione lo riconoscono ancora (stesso nome).<br>' +
        (op.email ? '✓ Con l\'email ' + esc(op.email) + ' avrà i sottotask e i worklog copiati dal collega Eagle in squadra.<br>' : '⚠ Senza email non avrà sottotask Jira.<br>') +
        '✗ Esce da KPI, gap risorse e attestati; le allocazioni future dello staffing vengono azzerate.' +
      '</div>' +
      '<div class="flex justify-end gap-2">' +
        '<button id="spf-annulla" class="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">Annulla</button>' +
        '<button id="spf-ok" class="text-sm bg-teal-600 hover:bg-teal-700 text-white rounded px-3 py-1.5">Sposta</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.getElementById('spf-annulla').onclick = () => closeModal();
  document.getElementById('spf-ok').onclick = () => {
    const fid = document.getElementById('spf-forn').value;
    closeModal();
    spostaOperatoreInFornitore(opId, fid);
  };
}

async function spostaOperatoreInFornitore(opId, fid) {
  if (!sbGuardWrite()) return;
  const op = (state.operatori || []).find(o => o.id === opId);
  const f = (state.fornitori || []).find(f => f.id === fid);
  if (!op || !f) return;
  const nome = op.nome_esteso;
  f.dipendenti = f.dipendenti || [];
  let d = f.dipendenti.find(x => x.nome_esteso === nome);
  if (!d) {
    d = { id: fornGenId('dip'), nome_esteso: nome, skills: [], provincia: '', telefono: '', note: '' };
    f.dipendenti.push(d);
  }
  d.email = (op.email || '').trim() || d.email || '';
  d.provincia = op.provincia || d.provincia || '';
  d.skills = [...new Set([...(d.skills || []), ...(op.skills || [])])];
  if (op.nome) d.nome = op.nome;
  if (op.cognome) d.cognome = op.cognome;
  d.da_pool = { id: op.id, il: new Date().toISOString().slice(0, 10) };

  // Stessa pulizia di deleteOperatore: staffing futuro azzerato, passato tenuto
  const mc = meseCorrente();
  state.staffing = state.staffing.map(r => {
    if (r.risorsa !== nome) return r;
    return { ...r, mesi: r.mesi.map((v, i) => i < mc ? v : 0) };
  }).filter(r => r.risorsa !== nome || r.mesi.some(v => (Number(v) || 0) > 0));
  state.operatori = state.operatori.filter(o => o.id !== opId);
  state.assegnazioni = state.assegnazioni.filter(a => a.operatore_id !== opId);
  ricalcolaAllocOperatori();
  await saveState('Operatore spostato in un fornitore', { operatore: nome, fornitore: f.nome }, true);

  // Badge fornitore sulle righe della Griglia dalla settimana corrente in poi
  const oggi = isoWeekYear(new Date());
  const da = oggi.year * 100 + oggi.week;
  let righe = 0;
  Object.keys(pwData || {}).forEach(anno => {
    if (!/^\d+$/.test(anno)) return;
    Object.keys(pwData[anno] || {}).forEach(week => {
      const data = pwData[anno][week];
      if (!Array.isArray(data) || Number(anno) * 100 + Number(week) < da) return;
      data.forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(o => {
        if (o && o.nome === nome && o.fornitore !== f.nome) { o.fornitore = f.nome; righe++; }
      })));
    });
  });
  if (righe) await pwSave();

  renderAll();
  showAlertModal(nome + ' è ora dipendente di «' + f.nome + '»' + (righe ? ' (' + righe + (righe === 1 ? ' riga' : ' righe') + ' della Griglia aggiornate).' : '.'));
}
