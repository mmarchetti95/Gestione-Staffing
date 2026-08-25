/* ===================== ALERT SOVRA-ALLOCAZIONE E CARENZE ===================== */
function renderAlerts() {
  const mc = meseCorrente();
  const errori = [];

  // Operatori sovra-allocati (mesi futuri)
  getOperatoriAttivi().forEach(op => {
    const mesiKO = [];
    for (let i = mc; i < 12; i++) {
      const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
      const gg = op.alloc_mensile[i] || 0;
      if (gg > gl) mesiKO.push(MESI[i] + ' (+' + (gg - gl) + 'gg)');
    }
    if (mesiKO.length) errori.push({ tipo: 'sovra', testo: '<b>' + op.nome_esteso + '</b>: sovra-allocato in ' + mesiKO.join(', ') });
  });

  // Commesse con FTE insufficienti (mesi futuri)
  Object.keys(state.commesse_attive_meta).forEach(k => {
    const m = state.commesse_attive_meta[k];
    if (!m || m.risorse_necessarie == null) return;
    const risDich = m.risorse_necessarie;
    const righe = state.staffing.filter(r => r.commessa === k);
    if (!righe.length) return;
    const mesiKO = [];
    for (let i = mc; i < 12; i++) {
      const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
      const ggTot = righe.reduce((s, r) => s + (Number(r.mesi[i]) || 0), 0);
      if (ggTot === 0) continue;
      const fte = ggTot / gl;
      if (fte < risDich - 0.05) mesiKO.push(MESI[i] + ' (' + fte.toFixed(1) + '/' + risDich + ' FTE)');
    }
    if (mesiKO.length) errori.push({ tipo: 'carenza', testo: '<b>' + k + '</b>: carenza FTE in ' + mesiKO.join(', ') });
  });

  // Operatori con contratto a termine scaduto ma ancora impiegati su commesse
  // nei mesi successivi alla fine rapporto (probabile errore di pianificazione/anagrafica)
  const oggiStr = new Date().toISOString().slice(0, 10);
  (state.operatori || []).forEach(op => {
    if (op.contratto_tipo !== 'determinato' || !op.data_fine_rapporto) return;
    if (op.data_fine_rapporto >= oggiStr) return;
    const meseFine = meseFineRapportoInAnno(op);
    if (meseFine === null || meseFine >= 12) return;
    const righeOp = state.staffing.filter(r => r.risorsa === op.nome_esteso && r.commessa !== 'ORE NON LAVORATE');
    const mesiKO = [];
    for (let i = Math.max(0, meseFine + 1); i < 12; i++) {
      const gg = righeOp.reduce((s, r) => s + (Number(r.mesi[i]) || 0), 0);
      if (gg > 0) mesiKO.push(MESI[i] + ' (' + gg + 'gg)');
    }
    if (mesiKO.length) errori.push({ tipo: 'exImpiegato', testo: '<b>' + op.nome_esteso + '</b> (rapporto terminato il ' + fmtDate(op.data_fine_rapporto) + '): ancora impiegato in ' + mesiKO.join(', ') });
  });

  const el = document.getElementById('alert-box');
  if (!el) return;
  if (!errori.length) { el.innerHTML = ''; return; }

  const sovra       = errori.filter(e => e.tipo === 'sovra');
  const carenze     = errori.filter(e => e.tipo === 'carenza');
  const exImpiegati = errori.filter(e => e.tipo === 'exImpiegato');
  let inner = '';
  if (sovra.length)       inner += '<div class="text-xs font-semibold text-red-700 mb-1">Sovra-allocazioni (' + sovra.length + '):</div>'   + sovra.map(e   => '<div class="text-xs text-red-700 pl-2 mb-0.5">• ' + e.testo + '</div>').join('');
  if (carenze.length)     inner += '<div class="text-xs font-semibold text-orange-700 mb-1 mt-2">Carenze FTE (' + carenze.length + '):</div>' + carenze.map(e => '<div class="text-xs text-orange-700 pl-2 mb-0.5">• ' + e.testo + '</div>').join('');
  if (exImpiegati.length) inner += '<div class="text-xs font-semibold text-purple-700 mb-1 mt-2">🚪 Ex collega ancora impiegato (' + exImpiegati.length + '):</div>' + exImpiegati.map(e => '<div class="text-xs text-purple-700 pl-2 mb-0.5">• ' + e.testo + '</div>').join('');

  el.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4"><div class="flex items-center justify-between mb-2"><span class="font-semibold text-red-800 text-sm">⚠ ' + errori.length + ' problema/i rilevato/i</span><button onclick="this.closest(\'.bg-red-50\').querySelector(\'.ab-body\').classList.toggle(\'hidden\')" class="text-xs text-red-600 hover:underline">mostra/nascondi</button></div><div class="ab-body">' + inner + '</div></div>';
}

/* ===================== RENDER ALL ===================== */
function renderAll() {
  renderKPI();
  renderAlerts();
  renderGantt();
  renderSkillFilters();
  renderAttestatiFilters();
  renderOperatori();
  renderCommesse();
  renderGap();
  // Se la vista operatore è aperta, aggiornala
  if (_vistaOpId && !document.getElementById('op-vista-container')?.classList.contains('hidden')) {
    renderVistaOperatore(_vistaOpId);
  }
}

/* ===================== EVENT BINDING ===================== */
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  renderRiconciliazione();
  renderAll();

  // Inizializza Supabase sync
  await sbInitAndCheck();

  document.getElementById('op-search').addEventListener('input', e => {
    state.filters.search = e.target.value;
    renderOperatori();
  });
  document.getElementById('filter-low-sat').addEventListener('change', e => {
    state.filters.lowSat = e.target.checked;
    renderOperatori();
  });
  document.getElementById('op-filter-regione').addEventListener('change', e => {
    state.filters.regione = e.target.value;
    state.filters.provincia = '';
    renderOperatori();
  });
  document.getElementById('op-filter-provincia').addEventListener('change', e => {
    state.filters.provincia = e.target.value;
    renderOperatori();
  });
  document.getElementById('filter-show-ex').addEventListener('change', e => {
    state.filters.showEx = e.target.checked;
    renderOperatori();
  });
  document.getElementById('commesse-search').addEventListener('input', e => {
    state.searchCommesse = e.target.value;
    renderCommesse();
  });
  // Gantt controls
  const gPipeline = document.getElementById('gantt-pipeline');
  const gHistoric = document.getElementById('gantt-historic');
  const gSort = document.getElementById('gantt-sort');
  if (gPipeline) gPipeline.addEventListener('change', e => { _ganttCfg.pipeline = e.target.checked; renderGantt(); });
  if (gHistoric) gHistoric.addEventListener('change', e => { _ganttCfg.historic = e.target.checked; renderGantt(); });
  if (gSort) gSort.addEventListener('change', e => { _ganttCfg.sort = e.target.value; renderGantt(); });

  const _dashTabBtns = '#pw-tab-griglia, #pw-tab-ferie, #pw-tab-mappa, #pw-tab-controllo, #pw-tab-doppia';
  document.querySelectorAll(`.tab-btn:not(#pw-tab-griglia):not(#pw-tab-ferie):not(#pw-tab-mappa):not(#pw-tab-controllo):not(#pw-tab-doppia)`).forEach(b => {
    b.onclick = () => {
      document.querySelectorAll(`.tab-btn:not(#pw-tab-griglia):not(#pw-tab-ferie):not(#pw-tab-mappa):not(#pw-tab-doppia)`).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.activeTab = b.dataset.tab;
      renderCommesse();
    };
  });

  document.getElementById('btn-add-commessa').onclick = () => openCommessaModal(null);
  const btnExpandAll = document.getElementById('btn-expand-all-commesse');
  const btnCollapseAll = document.getElementById('btn-collapse-all-commesse');
  if (btnExpandAll) btnExpandAll.onclick = () => document.querySelectorAll('.commessa-card').forEach(d => d.open = true);
  if (btnCollapseAll) btnCollapseAll.onclick = () => document.querySelectorAll('.commessa-card').forEach(d => d.open = false);
  document.getElementById('btn-add-op').onclick = () => openOperatoreModal(null);
  document.getElementById('op-tab-pool').onclick = () => switchOpTab('pool');
  document.getElementById('op-tab-email').onclick = () => switchOpTab('email');
  document.getElementById('op-tab-vista').onclick = () => { if (_vistaOpId) switchOpTab('vista'); };
  // Anno selector
  const annoSel = document.getElementById('anno-selector');
  if (annoSel) {
    // Genera opzioni dinamicamente: anno corrente -1 fino a +3
    const annoBase = new Date().getFullYear();
    annoSel.innerHTML = '';
    for (let a = annoBase - 1; a <= annoBase + 3; a++) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      opt.style.background = '#1a1a1a';
      opt.style.color = '#f9fafb';
      annoSel.appendChild(opt);
    }
    annoSel.value = String(ANNO);
    // Se l'anno salvato non è più nelle opzioni, usa l'anno corrente
    if (!annoSel.value) { ANNO = annoBase; annoSel.value = String(annoBase); }
    annoSel.addEventListener('change', () => {
      ANNO = parseInt(annoSel.value);
      localStorage.setItem('dashboard_anno', ANNO);
      renderAll();
    });
  }
  // btn-export-xlsx e btn-print (Esporta PDF via stampa browser) rimossi in v18.37.0
  document.getElementById('btn-presentation').onclick = () => {
    document.body.classList.toggle('present-mode');
    const btn = document.getElementById('btn-presentation');
    btn.textContent = document.body.classList.contains('present-mode') ? '↩ Esci modalità presentazione' : '📊 Modalità presentazione';
  };

  // ===== NAVIGAZIONE SCHERMATA =====
  const mainEl   = document.querySelector('main');
  const weeklyEl = document.getElementById('screen-weekly');

  // switchScreen è definita globalmente più avanti
  document.getElementById('nav-dashboard').onclick = () => switchScreen('dashboard');
  document.getElementById('nav-weekly').onclick = () => switchScreen('weekly');

  // Tab griglia / ferie / mappa
  document.getElementById('pw-tab-griglia').onclick = () => pwSwitchTab('griglia');
  document.getElementById('pw-tab-ferie').onclick   = () => pwSwitchTab('ferie');
  document.getElementById('pw-tab-mappa').onclick   = () => pwSwitchTab('mappa');
  document.getElementById('pw-tab-controllo').onclick = () => pwSwitchTab('controllo');
  document.getElementById('pw-tab-doppia').onclick = () => pwSwitchTab('doppia');

  // Carica rubrica geocoding
  _geoCacheLoad();

  // Ripristina l'ultima schermata (Dashboard / Pianificazione Settimanale) visualizzata,
  // fatto qui e non nel secondo DOMContentLoaded (init pianificazione) perché richiede
  // che state/Supabase siano già pronti (loadState + sbInitAndCheck sopra).
  try {
    if (localStorage.getItem('last_screen') === 'weekly') switchScreen('weekly');
  } catch (_) {}
});

