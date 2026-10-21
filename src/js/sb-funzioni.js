/* ===================== FUNZIONI NASCOSTE (admin) ===================== */
// L'admin può nascondere pagine e pulsanti ai non-admin dal pannello "🧩 Funzioni".
// Stato condiviso nella tabella Supabase app_funzioni_nascoste (riga presente =
// funzione nascosta; RLS: tutti leggono, solo admin inserisce/cancella), con canale
// Realtime proprio. È un nascondimento di interfaccia, non un controllo di sicurezza:
// i permessi veri restano quelli dei ruoli/RLS.
// Le pagine usano le stesse chiavi di sbCanSeePage()/PW_TAB_KEYS, che le esclude
// anche dalla navigazione; i pulsanti sono nascosti con un foglio di stile generato
// (#sb-fn-style), così vale anche per gli elementi ricreati dai render.
const SB_FN_TABLE = 'app_funzioni_nascoste';

const SB_FN_FUNZIONI = [
  { gruppo: 'Schermate', chiave: 'dashboard', label: '📊 Dashboard', sel: '#nav-dashboard' },
  { gruppo: 'Schermate', chiave: 'mappa', label: '🗺 Mappa (vista live)', sel: '#nav-mappa' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:griglia', label: '📋 Griglia settimanale', sel: '#pw-tab-griglia' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:ferie', label: '🏖 Ferie / Permessi', sel: '#pw-tab-ferie' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:mappa', label: '🗺 Mappa squadre', sel: '#pw-tab-mappa' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:spostamenti', label: '🧭 Pianifica spostamenti', sel: '#pw-tab-spostamenti' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:ricerca-squadre', label: '🔍 Ricerca Squadre', sel: '#pw-tab-ricerca-squadre' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:autoplan', label: '🤖 Auto-pianifica', sel: '#pw-tab-autoplan' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:controllo', label: '📊 Controllo produzione', sel: '#pw-tab-controllo' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:meteo-storico', label: '🌦️ Storico meteo', sel: '#pw-tab-meteo-storico' },
  { gruppo: 'Pianificazione settimanale', chiave: 'weekly:doppia', label: '🔁 Doppia Week', sel: '#pw-tab-doppia' },
  { gruppo: 'Griglia', chiave: 'griglia:strumenti', label: '🔧 Aggiorna strumenti Jira', sel: '#pw-strumenti-refresh, #pw-strumenti-status' },
  { gruppo: 'Griglia', chiave: 'griglia:meteo-settimana', label: '⛈️ Meteo settimana', sel: '#pw-weather-week-btn' },
  { gruppo: 'Griglia', chiave: 'griglia:note-variazioni', label: '📝 Note/Variazioni', sel: '#pw-nv-btn' },
  { gruppo: 'Griglia', chiave: 'griglia:controllo-sottotask', label: '🎫 Controllo sottotask', sel: '#pw-jchk-btn' },
  { gruppo: 'Griglia', chiave: 'griglia:sottotask-jira', label: '🎫 Crea sottotask Jira (per commessa)', sel: '[data-help-key="pw-sottotask-jira"]' },
  { gruppo: 'Griglia', chiave: 'griglia:genera-mail', label: '📧 Genera mail', sel: '#pw-gen-mail' },
  { gruppo: 'Ferie', chiave: 'ferie:import', label: '📥 Importa Excel ferie', sel: '#pw-ferie-import-btn' },
  { gruppo: 'Controllo produzione', chiave: 'controllo:anomalie', label: '🔍 Controllo anomalie', sel: '#cpa-toggle, #cpa-modal' },
  { gruppo: 'Controllo produzione', chiave: 'controllo:sync-jira', label: '🔄 Sincronizza da Jira', sel: '#cp-sync-jira' },
  { gruppo: 'Controllo produzione', chiave: 'controllo:mysond', label: '📥 Carica MySond', sel: '#cp-mysond-btn' },
  { gruppo: 'Auto-pianifica', chiave: 'autoplan:assistente', label: '✦ Assistente pianificazione', sel: '.apc-toggle, #apc-panel' },
  { gruppo: 'Auto-pianifica', chiave: 'autoplan:imprevisti', label: '⚡ Imprevisti', sel: '.ap-imprevisti-box' },
  { gruppo: 'Dashboard', chiave: 'dashboard:kpi', label: 'KPI', sel: '#section-kpi' },
  { gruppo: 'Dashboard', chiave: 'dashboard:gantt', label: 'Vista mensile commesse', sel: '#section-gantt' },
  { gruppo: 'Dashboard', chiave: 'dashboard:fornitori', label: '🏢 Fornitori', sel: '#section-fornitori' },
  { gruppo: 'Dashboard', chiave: 'dashboard:attestati', label: 'Attestati', sel: '#section-attestati' },
  { gruppo: 'Dashboard', chiave: 'dashboard:limitazioni', label: 'Limitazioni', sel: '#section-limitazioni' },
  { gruppo: 'Dashboard', chiave: 'dashboard:dpi', label: 'DPI', sel: '#section-dpi' },
  { gruppo: 'Dashboard', chiave: 'dashboard:gap', label: 'Gap risorse & raccomandazioni', sel: '#section-gap' },
  { gruppo: 'Generale', chiave: 'generale:assistente-ai', label: '🤖 Assistente AI (pulsante flottante)', sel: '#ai-assistant-btn, #ai-assistant-panel' },
];

const _sbFn = { nascoste: {}, channel: null, anteprima: false };

function sbFnNascosta(chiave) {
  return !!_sbFn.nascoste[chiave];
}

// True se le funzioni nascoste vanno davvero tolte all'utente corrente: sempre per i
// non-admin, per l'admin solo in modalità "anteprima come non-admin".
function sbFnApplicaNascoste() {
  return !sbIsAdmin() || _sbFn.anteprima;
}

// Usata da sbCanSeePage(): una pagina nascosta sparisce dalla navigazione.
function sbFnPaginaVisibile(chiave) {
  return !(sbFnApplicaNascoste() && sbFnNascosta(chiave));
}

async function sbFnLoad() {
  if (!_sbClient) return;
  try {
    const { data, error } = await _sbClient.from(SB_FN_TABLE).select('chiave, nascosta_da, nascosta_il');
    if (error) throw error;
    const m = {};
    (data || []).forEach(r => { m[r.chiave] = { da: r.nascosta_da, il: r.nascosta_il }; });
    _sbFn.nascoste = m;
  } catch (e) {
    // Tabella assente o errore di rete: nessuna funzione nascosta (l'app resta usabile).
    console.warn('Funzioni nascoste: caricamento fallito', e);
  }
}

function sbFnApply() {
  let st = document.getElementById('sb-fn-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'sb-fn-style';
    document.head.appendChild(st);
  }
  const sel = SB_FN_FUNZIONI.filter(f => sbFnNascosta(f.chiave)).map(f => f.sel).join(', ');
  if (!sel) st.textContent = '';
  else if (sbFnApplicaNascoste()) st.textContent = sel + ' { display: none !important; }';
  else st.textContent = sel + ' { outline: 2px dashed #f59e0b !important; outline-offset: 2px; }';
  const btn = document.getElementById('sb-btn-funzioni');
  if (btn) btn.textContent = _sbFn.anteprima ? '🧩 Funzioni (anteprima)' : '🧩 Funzioni';
  if (typeof sbApplyPageVisibility === 'function') sbApplyPageVisibility();
}

function sbFnSubscribe() {
  if (_sbFn.channel || !_sbClient) return;
  try {
    _sbFn.channel = _sbClient.channel('app-funzioni-nascoste')
      .on('postgres_changes', { event: '*', schema: 'public', table: SB_FN_TABLE }, async () => {
        await sbFnLoad();
        sbFnApply();
        if (document.getElementById('sb-fn-modal')?.style.display === 'flex') sbFnRender();
      })
      .subscribe();
  } catch (e) { console.warn('Realtime funzioni nascoste:', e); }
}

function sbFnUnsubscribe() {
  if (!_sbFn.channel) return;
  try { _sbClient.removeChannel(_sbFn.channel); } catch (e) {}
  _sbFn.channel = null;
  _sbFn.nascoste = {};
  _sbFn.anteprima = false;
  sbFnApply();
}

async function sbFnShow() {
  if (!sbIsAdmin()) return;
  document.getElementById('sb-fn-modal').style.display = 'flex';
  sbFnRender();
  await sbFnLoad();
  sbFnRender();
}

function sbFnClose() {
  document.getElementById('sb-fn-modal').style.display = 'none';
}

function sbFnRender() {
  const box = document.getElementById('sb-fn-list');
  if (!box) return;
  const ant = document.getElementById('sb-fn-anteprima');
  if (ant) ant.checked = _sbFn.anteprima;
  const fmt = ts => { try { return new Date(ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } };
  let html = '';
  let gruppo = null;
  SB_FN_FUNZIONI.forEach(f => {
    if (f.gruppo !== gruppo) {
      if (gruppo !== null) html += '</div>';
      gruppo = f.gruppo;
      html += '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;">' + esc(gruppo) + '</div><div>';
    }
    const n = _sbFn.nascoste[f.chiave];
    html += '<label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;' + (n ? 'background:#fffbeb;' : '') + '">' +
      '<input type="checkbox" data-chiave="' + esc(f.chiave) + '" onchange="sbFnToggle(this)"' + (n ? '' : ' checked') + ' style="width:16px;height:16px;">' +
      '<span style="font-size:13px;color:#0f172a;flex:1;">' + esc(f.label) + '</span>' +
      (n ? '<span style="font-size:11px;color:#b45309;">nascosta' + (n.da ? ' da ' + esc(n.da) : '') + (n.il ? ' · ' + esc(fmt(n.il)) : '') + '</span>'
         : '<span style="font-size:11px;color:#94a3b8;">visibile a tutti</span>') +
      '</label>';
  });
  if (gruppo !== null) html += '</div>';
  box.innerHTML = html;
}

async function sbFnToggle(input) {
  if (!sbIsAdmin()) return;
  const chiave = input.dataset.chiave;
  const nascondi = !input.checked;
  const f = SB_FN_FUNZIONI.find(x => x.chiave === chiave);
  input.disabled = true;
  try {
    const q = nascondi
      ? _sbClient.from(SB_FN_TABLE).upsert({ chiave }, { onConflict: 'chiave', ignoreDuplicates: true })
      : _sbClient.from(SB_FN_TABLE).delete().eq('chiave', chiave);
    const { error } = await q;
    if (error) throw error;
    if (nascondi) _sbFn.nascoste[chiave] = { da: _sbUser?.email, il: new Date().toISOString() };
    else delete _sbFn.nascoste[chiave];
    sbLogActivity(nascondi ? 'Funzione nascosta' : 'Funzione resa visibile', { funzione: f ? f.label : chiave });
  } catch (e) {
    input.checked = !nascondi;
    showAlertModal('Impossibile salvare: ' + (e.message || e));
  }
  input.disabled = false;
  sbFnApply();
  sbFnRender();
}

function sbFnSetAnteprima(on) {
  if (!sbIsAdmin()) return;
  _sbFn.anteprima = !!on;
  sbFnApply();
}
