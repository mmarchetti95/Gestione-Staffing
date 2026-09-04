/* ===================== ACTIVITY LOG ===================== */
/* ===================== RUOLI & PERMESSI ===================== */
// Gerarchia: admin (tutto) / responsabile (RW, no funzioni admin-only) /
// operatore (sola lettura su tutto) / guest (sola lettura, solo sulle pagine
// in user_metadata.guest_pages). Il blocco in scrittura per operatore/guest è
// applicato anche via RLS su staffing_state (non è solo un vincolo client-side).
function sbRole() {
  return _sbUser?.user_metadata?.role || 'responsabile';
}
function sbIsAdmin() {
  return sbRole() === 'admin';
}
function sbCanWrite() {
  return sbRole() === 'admin' || sbRole() === 'responsabile';
}
function sbGuestPages() {
  return Array.isArray(_sbUser?.user_metadata?.guest_pages) ? _sbUser.user_metadata.guest_pages : [];
}
function sbCanSeePage(pageKey) {
  return sbRole() !== 'guest' || sbGuestPages().includes(pageKey);
}
// Guard da chiamare in cima alle azioni di modifica: blocca l'azione se il ruolo
// corrente è di sola lettura. Il messaggio viene mostrato una sola volta per sessione
// (non ad ogni chiamata): alcuni chokepoint sono agganciati a listener 'input' che
// scattano ad ogni tasto premuto, e un modale ad ogni carattere sarebbe inutilizzabile.
let _sbGuardWriteWarned = false;
function sbGuardWrite() {
  if (sbCanWrite()) return true;
  if (!_sbGuardWriteWarned) {
    _sbGuardWriteWarned = true;
    showAlertModal('Il tuo ruolo è di sola lettura: le modifiche non vengono salvate.');
  }
  return false;
}

// Chiavi pagina della Pianificazione Settimanale, stesso ordine/id dei tab in src/head.html
const PW_TAB_KEYS = ['griglia', 'ferie', 'mappa', 'spostamenti', 'ricerca-squadre', 'controllo', 'doppia'];

// Mostra/nasconde nav Dashboard/Pianificazione e le singole tab in base alle pagine
// visibili per il ruolo corrente (rilevante solo per il ruolo 'guest'); se lo schermo/tab
// attualmente aperto non è più visibile, sposta su uno consentito.
function sbApplyPageVisibility() {
  const navDash = document.getElementById('nav-dashboard');
  const navWk = document.getElementById('nav-weekly');
  const canDash = sbCanSeePage('dashboard');
  const anyWeekly = PW_TAB_KEYS.some(k => sbCanSeePage('weekly:' + k));
  if (navDash) navDash.style.display = canDash ? '' : 'none';
  if (navWk) navWk.style.display = anyWeekly ? '' : 'none';
  PW_TAB_KEYS.forEach(k => {
    const el = document.getElementById('pw-tab-' + k);
    if (el) el.style.display = sbCanSeePage('weekly:' + k) ? '' : 'none';
  });
  const weeklyEl = document.getElementById('screen-weekly');
  const onWeekly = weeklyEl && !weeklyEl.classList.contains('hidden');
  if (onWeekly && !anyWeekly && canDash) switchScreen('dashboard');
  else if (!onWeekly && !canDash && anyWeekly) switchScreen('weekly');
  if (onWeekly && typeof _pwActiveTab !== 'undefined' && !sbCanSeePage('weekly:' + _pwActiveTab)) {
    const allowed = PW_TAB_KEYS.find(k => sbCanSeePage('weekly:' + k));
    if (allowed) pwSwitchTab(allowed);
  }
}

// Banner "sola lettura" in header + badge ruolo accanto al nome utente
function sbApplyReadOnlyBanner() {
  const banner = document.getElementById('readonly-banner');
  if (banner) banner.style.display = sbCanWrite() ? 'none' : '';
  const badge = document.getElementById('sb-role-badge');
  if (badge) {
    const labels = { admin: 'Admin', responsabile: 'Responsabile', operatore: 'Operatore · sola lettura', guest: 'Guest · sola lettura' };
    badge.textContent = labels[sbRole()] || '';
  }
}

async function sbLogActivity(action, details = {}) {
  if (!_sbClient || !_sbUser) return;
  try {
    await _sbClient.from('activity_log').insert({
      user_email: _sbUser.email,
      action,
      details
    });
  } catch(e) {
    console.warn('Log error:', e);
  }
}

async function sbShowLog() {
  document.getElementById('sb-log-modal').style.display = 'flex';
  await sbLoadLog();
}

function sbCloseLog() {
  document.getElementById('sb-log-modal').style.display = 'none';
}

async function sbLoadLog() {
  const tbody = document.getElementById('sb-log-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Caricamento…</td></tr>';
  try {
    const { data, error } = await _sbClient
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Nessuna attività registrata.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(row => {
      const dt = new Date(row.created_at);
      const dateStr = dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
      const details = row.details ? Object.entries(row.details).map(([k,v]) => k+': '+v).join(', ') : '';
      return '<tr style="border-bottom:1px solid #f1f5f9;">' +
        '<td style="padding:7px 12px;white-space:nowrap;color:#64748b;">' + dateStr + '</td>' +
        '<td style="padding:7px 12px;color:#374151;">' + (row.user_email||'') + '</td>' +
        '<td style="padding:7px 12px;font-weight:500;color:#0f172a;">' + (row.action||'') + '</td>' +
        '<td style="padding:7px 12px;color:#64748b;font-size:11px;">' + details + '</td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#ef4444;">Errore: ' + e.message + '</td></tr>';
  }
}

/* ===================== SESSIONI ATTIVE (admin) ===================== */
let _sbSessionId = null;
let _sbHeartbeatTimer = null;

function sbGenerateSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

async function sbStartHeartbeat() {
  if (!_sbUser || !_sbClient) return;
  // Riusa lo stesso session_id se già presente in sessionStorage (stessa tab,
  // anche dopo un refresh) — solo l'apertura di una tab/dispositivo realmente
  // nuovo genera un session_id diverso, e quindi una riga distinta in tabella.
  try {
    _sbSessionId = sessionStorage.getItem('dashboard_session_id');
    if (!_sbSessionId) {
      _sbSessionId = sbGenerateSessionId();
      sessionStorage.setItem('dashboard_session_id', _sbSessionId);
    }
  } catch(e) {
    _sbSessionId = sbGenerateSessionId();
  }

  // Pulizia: rimuove sessioni "morte" (nessun heartbeat da 5+ minuti) — evita
  // che vecchie tab/refresh senza logout esplicito si accumulino per sempre.
  try {
    const sogliaStale = new Date(Date.now() - 5*60*1000).toISOString();
    await _sbClient.from('active_sessions').delete().lt('last_seen', sogliaStale);
  } catch(e) { console.warn('sbStartHeartbeat cleanup error:', e); }

  try {
    await _sbClient.from('active_sessions').upsert({
      session_id: _sbSessionId,
      user_email: _sbUser.email,
      login_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    });
  } catch(e) { console.warn('sbStartHeartbeat insert error:', e); }

  clearInterval(_sbHeartbeatTimer);
  _sbHeartbeatTimer = setInterval(async () => {
    if (!_sbUser || !_sbSessionId) return;
    try {
      await _sbClient.from('active_sessions')
        .update({ last_seen: new Date().toISOString() })
        .eq('session_id', _sbSessionId);
    } catch(e) { console.warn('sbHeartbeat update error:', e); }
  }, 45000);
}

async function sbStopHeartbeat() {
  clearInterval(_sbHeartbeatTimer);
  _sbHeartbeatTimer = null;
  if (_sbSessionId && _sbClient) {
    try { await _sbClient.from('active_sessions').delete().eq('session_id', _sbSessionId); }
    catch(e) { console.warn('sbStopHeartbeat delete error:', e); }
  }
  _sbSessionId = null;
  try { sessionStorage.removeItem('dashboard_session_id'); } catch(e) {}
}

async function sbShowSessions() {
  document.getElementById('sb-sessions-modal').style.display = 'flex';
  await sbLoadSessions();
}

function sbCloseSessions() {
  document.getElementById('sb-sessions-modal').style.display = 'none';
}

async function sbLoadSessions() {
  const tbody = document.getElementById('sb-sessions-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Caricamento…</td></tr>';
  try {
    // Pulizia sessioni morte anche all'apertura del pannello, per un effetto immediato
    const sogliaStale = new Date(Date.now() - 5*60*1000).toISOString();
    await _sbClient.from('active_sessions').delete().lt('last_seen', sogliaStale);
  } catch(e) { console.warn('sbLoadSessions cleanup error:', e); }
  try {
    const { data, error } = await _sbClient
      .from('active_sessions')
      .select('*')
      .order('last_seen', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Nessuna sessione registrata.</td></tr>';
      return;
    }
    const now = Date.now();
    tbody.innerHTML = data.map(row => {
      const login = new Date(row.login_at);
      const lastSeen = new Date(row.last_seen);
      const secondsAgo = (now - lastSeen.getTime()) / 1000;
      const isOnline = secondsAgo < 90;
      const dotColor = isOnline ? '#22c55e' : '#94a3b8';
      const loginStr = login.toLocaleDateString('it-IT') + ' ' + login.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
      let lastSeenStr;
      if (secondsAgo < 60) lastSeenStr = 'pochi secondi fa';
      else if (secondsAgo < 3600) lastSeenStr = Math.floor(secondsAgo/60) + ' min fa';
      else lastSeenStr = lastSeen.toLocaleDateString('it-IT') + ' ' + lastSeen.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
      return '<tr style="border-bottom:1px solid #f1f5f9;">' +
        '<td style="padding:7px 12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';"></span></td>' +
        '<td style="padding:7px 12px;color:#374151;">' + (row.user_email||'') + '</td>' +
        '<td style="padding:7px 12px;white-space:nowrap;color:#64748b;">' + loginStr + '</td>' +
        '<td style="padding:7px 12px;white-space:nowrap;color:#64748b;">' + lastSeenStr + '</td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#ef4444;">Errore: ' + e.message + ' — verifica che la tabella active_sessions e le policy RLS siano state create.</td></tr>';
  }
}


/* ===================== BACKUP DATI (admin) ===================== */
// Snapshot notturni (tabella data_backups, popolata da run_nightly_backup() via
// pg_cron lato Supabase) — qui solo lettura dell'elenco e chiamata alla RPC di
// ripristino restore_backup(), che fa il controllo ruolo admin lato server (non
// fidarsi del solo nascondere il bottone in UI).
async function sbShowBackups() {
  document.getElementById('sb-backups-modal').style.display = 'flex';
  document.getElementById('sb-backups-error').style.display = 'none';
  document.getElementById('sb-backups-success').style.display = 'none';
  await sbLoadBackups();
}

function sbCloseBackups() {
  document.getElementById('sb-backups-modal').style.display = 'none';
}

async function sbLoadBackups() {
  const sel = document.getElementById('sb-backup-select');
  const errEl = document.getElementById('sb-backups-error');
  errEl.style.display = 'none';
  sel.innerHTML = '<option value="">Caricamento…</option>';
  try {
    const { data, error } = await _sbClient
      .from('data_backups_list')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    if (!data || data.length === 0) {
      sel.innerHTML = '<option value="">Nessuno snapshot disponibile</option>';
      return;
    }
    sel.innerHTML = data.map(row => {
      const dt = new Date(row.created_at);
      const label = dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) +
        ' — ' + row.righe_staffing + ' righe staffing, ' + row.righe_cp + ' righe produzione';
      return '<option value="' + row.id + '">' + esc(label) + '</option>';
    }).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">—</option>';
    errEl.textContent = 'Errore caricamento elenco backup: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function sbRestoreBackup() {
  const sel = document.getElementById('sb-backup-select');
  const errEl = document.getElementById('sb-backups-error');
  const okEl = document.getElementById('sb-backups-success');
  const btn = document.getElementById('sb-backup-restore-btn');
  const includeCp = document.getElementById('sb-backup-include-cp').checked;
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  const backupId = sel.value;
  if (!backupId) { errEl.textContent = 'Seleziona uno snapshot.'; errEl.style.display = 'block'; return; }

  const label = sel.options[sel.selectedIndex].textContent;
  const conferma = await showConfirmAsync(
    'Ripristinare lo snapshot "' + label + '"?\n\nQuesta operazione SOSTITUISCE i dati attuali (Griglia, Ferie, Doppia Week, Pipeline/Operatori/Staffing' +
    (includeCp ? ', Controllo Produzione' : '') + ') con quelli dello snapshot scelto. Le modifiche fatte dopo quello snapshot andranno perse. Azione irreversibile.',
    'Ripristina'
  );
  if (!conferma) return;

  btn.textContent = 'Ripristino in corso…'; btn.disabled = true;
  try {
    const { error } = await _sbClient.rpc('restore_backup', { p_backup_id: Number(backupId), p_include_cp: includeCp });
    if (error) throw error;
    okEl.textContent = '✓ Backup ripristinato. Ricarica la pagina per vedere i dati aggiornati (tutti gli altri utenti collegati devono fare lo stesso).';
    okEl.style.display = 'block';
    setTimeout(() => location.reload(), 2500);
  } catch(e) {
    errEl.textContent = 'Errore durante il ripristino: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Ripristina questo backup'; btn.disabled = false;
  }
}

/* ===================== GESTIONE UTENTI (admin) ===================== */
// Crea/elenca/modifica ruolo/elimina utenti Supabase Auth. Passa sempre dalla
// Edge Function 'admin-users' (service_role key, mai esposta al client): il
// client anon non ha e non deve avere accesso all'Admin API di Supabase Auth.
async function sbCallAdminUsers(action, extra) {
  const { data, error } = await _sbClient.functions.invoke('admin-users', {
    body: { action, ...extra }
  });
  if (error) {
    // Il body dell'errore (messaggio custom della function, es. 403/400) arriva
    // in error.context; senza questo fallback si vedrebbe solo "FunctionsHttpError".
    let msg = error.message || 'Errore chiamata funzione';
    try { const body = await error.context.json(); if (body?.error) msg = body.error; } catch(e) {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// Etichette e chiavi delle pagine assegnabili ad hoc a un utente Guest (stesse
// chiavi usate da sbCanSeePage()/PW_TAB_KEYS per il gating lato client).
const SB_PAGE_LABELS = {
  'dashboard': 'Dashboard',
  'weekly:griglia': 'Griglia',
  'weekly:ferie': 'Ferie',
  'weekly:mappa': 'Mappa',
  'weekly:spostamenti': 'Spostamenti',
  'weekly:ricerca-squadre': 'Ricerca Squadre',
  'weekly:controllo': 'Controllo Produzione',
  'weekly:doppia': 'Doppia Week',
};
function sbAllPageKeys() {
  return ['dashboard', ...PW_TAB_KEYS.map(k => 'weekly:' + k)];
}
function sbGuestPagesChecksHtml(checked) {
  return sbAllPageKeys().map(k =>
    '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;">' +
      '<input type="checkbox" class="sb-guestpage-check" value="' + jsAttr(k) + '"' + ((checked||[]).includes(k) ? ' checked' : '') + '>' +
      esc(SB_PAGE_LABELS[k] || k) +
    '</label>'
  ).join('');
}
// Mostra/nasconde il blocco checkbox "pagine visibili" nel form di creazione utente,
// in base al ruolo selezionato nella select.
function sbToggleGuestPagesUI(containerId, role) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (role === 'guest') {
    box.style.display = '';
    const checksEl = box.querySelector('.sb-guestpages-checks');
    if (checksEl) checksEl.innerHTML = sbGuestPagesChecksHtml([]);
  } else {
    box.style.display = 'none';
  }
}
// Modal secondario per scegliere le pagine di un utente Guest esistente (o appena
// impostato a Guest dalla select di riga).
let _sbGuestPagesEditorCtx = null;
function sbOpenGuestPagesEditor(userId, email, currentPagesJson) {
  let currentPages = [];
  try { currentPages = JSON.parse(currentPagesJson || '[]'); } catch(e) {}
  _sbGuestPagesEditorCtx = { userId, email };
  document.getElementById('sb-guestpages-modal-email').textContent = email;
  document.getElementById('sb-guestpages-modal-checks').innerHTML = sbGuestPagesChecksHtml(currentPages);
  document.getElementById('sb-guestpages-modal').style.display = 'flex';
}
function sbCloseGuestPagesEditorCancel() {
  document.getElementById('sb-guestpages-modal').style.display = 'none';
  _sbGuestPagesEditorCtx = null;
  sbLoadUsers(); // ripristina la select del ruolo al valore realmente salvato
}
async function sbSaveGuestPagesEditor() {
  if (!_sbGuestPagesEditorCtx) return;
  const pages = [...document.querySelectorAll('#sb-guestpages-modal-checks .sb-guestpage-check:checked')].map(c => c.value);
  document.getElementById('sb-guestpages-modal').style.display = 'none';
  await sbApplyUserRole(_sbGuestPagesEditorCtx.userId, 'guest', _sbGuestPagesEditorCtx.email, pages);
  _sbGuestPagesEditorCtx = null;
}

async function sbShowUsers() {
  document.getElementById('sb-users-modal').style.display = 'flex';
  document.getElementById('sb-users-error').style.display = 'none';
  document.getElementById('sb-users-success').style.display = 'none';
  document.getElementById('sb-users-new-email').value = '';
  document.getElementById('sb-users-new-password').value = '';
  document.getElementById('sb-users-new-role').value = 'responsabile';
  sbToggleGuestPagesUI('sb-users-new-guestpages', 'responsabile');
  await sbLoadUsers();
}

function sbCloseUsers() {
  document.getElementById('sb-users-modal').style.display = 'none';
}

function sbUsersMsg(errText, okText) {
  const errEl = document.getElementById('sb-users-error');
  const okEl = document.getElementById('sb-users-success');
  if (errText) { errEl.textContent = errText; errEl.style.display = 'block'; } else { errEl.style.display = 'none'; }
  if (okText) { okEl.textContent = okText; okEl.style.display = 'block'; } else { okEl.style.display = 'none'; }
}

async function sbLoadUsers() {
  const tbody = document.getElementById('sb-users-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">Caricamento…</td></tr>';
  try {
    const data = await sbCallAdminUsers('list');
    const users = data.users || [];
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">Nessun utente.</td></tr>';
      return;
    }
    const fmt = iso => {
      if (!iso) return '—';
      const dt = new Date(iso);
      return dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
    };
    tbody.innerHTML = users.map(u => {
      const isSelf = _sbUser && u.id === _sbUser.id;
      const pagesJson = jsAttr(JSON.stringify(u.guest_pages || []));
      return '<tr style="border-bottom:1px solid #f1f5f9;">' +
        '<td style="padding:7px 12px;color:#374151;">' + esc(u.email || '') + (isSelf ? ' <span style="color:#94a3b8;font-size:10.5px;">(tu)</span>' : '') + '</td>' +
        '<td style="padding:7px 12px;">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
          '<select onchange="sbUpdateUserRole(\'' + jsAttr(u.id) + '\', this.value, \'' + jsAttr(u.email) + '\')" ' +
            (isSelf ? 'disabled title="Non puoi modificare il tuo stesso ruolo"' : '') +
            ' style="border:1px solid #dde3ea;border-radius:6px;padding:4px 8px;font-size:11.5px;outline:none;">' +
            '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
            '<option value="responsabile"' + (u.role === 'responsabile' ? ' selected' : '') + '>Responsabile</option>' +
            '<option value="operatore"' + (u.role === 'operatore' ? ' selected' : '') + '>Operatore</option>' +
            '<option value="guest"' + (u.role === 'guest' ? ' selected' : '') + '>Guest</option>' +
          '</select>' +
          (u.role === 'guest' ? '<button onclick="sbOpenGuestPagesEditor(\'' + jsAttr(u.id) + '\', \'' + jsAttr(u.email) + '\', \'' + pagesJson + '\')" title="Scegli le pagine visibili" style="padding:3px 8px;font-size:10.5px;border:1px solid #dde3ea;border-radius:6px;background:#f8fafc;cursor:pointer;color:#475569;white-space:nowrap;">📄 Pagine (' + (u.guest_pages||[]).length + ')</button>' : '') +
          '</div>' +
        '</td>' +
        '<td style="padding:7px 12px;white-space:nowrap;color:#64748b;">' + fmt(u.created_at) + '</td>' +
        '<td style="padding:7px 12px;white-space:nowrap;color:#64748b;">' + fmt(u.last_sign_in_at) + '</td>' +
        '<td style="padding:7px 12px;text-align:right;">' +
          (isSelf ? '' : '<button onclick="sbDeleteUser(\'' + jsAttr(u.id) + '\', \'' + jsAttr(u.email) + '\')" style="padding:4px 10px;font-size:11px;border:1px solid #fecaca;color:#dc2626;background:white;border-radius:6px;cursor:pointer;">Elimina</button>') +
        '</td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#ef4444;">Errore: ' + esc(e.message) + '</td></tr>';
  }
}

async function sbCreateUser() {
  const emailEl = document.getElementById('sb-users-new-email');
  const pwdEl = document.getElementById('sb-users-new-password');
  const roleEl = document.getElementById('sb-users-new-role');
  const btn = document.getElementById('sb-users-add-btn');
  const email = emailEl.value.trim();
  const password = pwdEl.value;
  const role = roleEl.value;
  sbUsersMsg(null, null);

  if (!email || !password) { sbUsersMsg('Inserisci email e password.'); return; }
  if (password.length < 6) { sbUsersMsg('La password deve essere di almeno 6 caratteri.'); return; }

  const guestPages = role === 'guest'
    ? [...document.querySelectorAll('#sb-users-new-guestpages .sb-guestpage-check:checked')].map(c => c.value)
    : [];

  btn.textContent = 'Creazione…'; btn.disabled = true;
  try {
    await sbCallAdminUsers('create', { email, password, role, guestPages });
    emailEl.value = ''; pwdEl.value = ''; roleEl.value = 'responsabile';
    sbToggleGuestPagesUI('sb-users-new-guestpages', 'responsabile');
    sbUsersMsg(null, 'Utente ' + email + ' creato con successo.');
    sbLogActivity('Creazione utente', { email, role });
    await sbLoadUsers();
  } catch(e) {
    sbUsersMsg('Errore creazione utente: ' + e.message);
  } finally {
    btn.textContent = '+ Aggiungi utente'; btn.disabled = false;
  }
}

// Chiamata dalla select di riga. Per il ruolo Guest non salva subito: apre l'editor
// pagine (senza pagine pre-selezionate, essendo un cambio da un altro ruolo) e salva
// solo alla conferma — per un Guest già esistente si usa invece il bottone "📄 Pagine".
async function sbUpdateUserRole(userId, role, email) {
  if (role === 'guest') { sbOpenGuestPagesEditor(userId, email, '[]'); return; }
  await sbApplyUserRole(userId, role, email, []);
}

async function sbApplyUserRole(userId, role, email, guestPages) {
  sbUsersMsg(null, null);
  const roleLabels = { admin: 'Admin', responsabile: 'Responsabile', operatore: 'Operatore', guest: 'Guest' };
  try {
    await sbCallAdminUsers('updateRole', { userId, role, guestPages });
    sbUsersMsg(null, 'Ruolo di ' + email + ' aggiornato a "' + (roleLabels[role] || role) + '".');
    sbLogActivity('Modifica ruolo utente', { email, role });
    await sbLoadUsers();
  } catch(e) {
    sbUsersMsg('Errore aggiornamento ruolo: ' + e.message);
    await sbLoadUsers(); // ripristina la select al valore reale
  }
}

async function sbDeleteUser(userId, email) {
  const conferma = await showConfirmAsync(
    'Eliminare definitivamente l\'utente "' + email + '"?\n\nNon potrà più accedere alla dashboard. Azione irreversibile.',
    'Elimina utente'
  );
  if (!conferma) return;
  sbUsersMsg(null, null);
  try {
    await sbCallAdminUsers('delete', { userId });
    sbUsersMsg(null, 'Utente ' + email + ' eliminato.');
    sbLogActivity('Eliminazione utente', { email });
    await sbLoadUsers();
  } catch(e) {
    sbUsersMsg('Errore eliminazione utente: ' + e.message);
  }
}

const SB_URL = 'https://ypbuleyropgoqalwioqb.supabase.co';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwYnVsZXlyb3Bnb3FhbHdpb3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjYyNTAsImV4cCI6MjA5Nzk0MjI1MH0.FMcI8lvGcuEQEJJLPFBt4BloyTzLPOQ4UZGBGd5G7WM';

let _sbClient = null;
let _sbUser   = null;
let _sbSyncing = false;
let _sbRealtimeChannel = null;
let _sbAutoPushTimer = null;
let _sbPwPushTimer = null; // timer dedicato per pwData/pwFerie
// _sbLastRemoteUpdatedAt rimosso: sostituito da _sbRemoteTs per dominio // timestamp dell'ultimo payload scaricato, per rilevare conflitti

const SB_TABLE = 'staffing_state';
const SB_ROW_ID = 1;
const SB_ROW_CORE = 1;
const SB_ROW_PLANNING = 2;
const SB_ROW_FERIE = 3;
const SB_ROW_DW = 4;
const _sbRemoteTs = { 1: null, 2: null, 3: null, 4: null };
const _sbDirty = { core: false, planning: false, ferie: false, dw: false };

function sbInit() {
  try {
    _sbClient = supabase.createClient(SB_URL, SB_ANON_KEY);
  } catch(e) {
    console.error('Supabase init error:', e);
  }
}

function sbUpdateUI(stato, msg, extra) {
  const dot  = document.getElementById('sb-status-dot');
  const text = document.getElementById('sb-status-text');
  const last = document.getElementById('sb-last-sync');
  const banner = document.getElementById('sb-banner');
  if (!dot) return;
  const colors = { ok:'#22c55e', error:'#ef4444', idle:'#94a3b8', syncing:'#3b82f6', conflict:'#f59e0b' };
  dot.style.background = colors[stato] || colors.idle;
  text.textContent = msg || '';
  if (extra && last) { last.textContent = extra; last.classList.remove('hidden'); }
  else if (last) last.classList.add('hidden');
  if (banner) banner.style.display = 'flex';
}

async function sbLogin() {
  const email = document.getElementById('sb-email').value.trim();
  const pwd   = document.getElementById('sb-password').value;
  const errEl = document.getElementById('sb-login-error');
  const btn   = document.getElementById('sb-login-btn');

  if (!email || !pwd) { errEl.textContent = 'Inserisci email e password.'; errEl.style.display='block'; return; }
  btn.textContent = 'Accesso in corso…'; btn.disabled = true;
  errEl.style.display = 'none';

  try {
    const { data, error } = await _sbClient.auth.signInWithPassword({ email, password: pwd });
    if (error) throw error;
    _sbUser = data.user;
    await sbOnLoggedIn();
  } catch(e) {
    errEl.textContent = e.message || 'Errore di accesso.';
    errEl.style.display = 'block';
    btn.textContent = 'Accedi'; btn.disabled = false;
  }
}

async function sbOnLoggedIn() {
  document.getElementById('sb-login-screen').style.display = 'none';
  const emailEl = document.getElementById('sb-user-email');
  if (emailEl) emailEl.textContent = _sbUser.email;
  // Rilegge utente da Supabase per avere user_metadata aggiornati
  try {
    const { data: { user } } = await _sbClient.auth.getUser();
    if (user) _sbUser = user;
  } catch(e) { console.warn('getUser error:', e); }
  // Mostra pulsante log/sessioni e sezione riconciliazione solo agli admin
  const btnLog = document.getElementById('sb-btn-log');
  const btnSessions = document.getElementById('sb-btn-sessions');
  const btnBackups = document.getElementById('sb-btn-backups');
  const btnUsers = document.getElementById('sb-btn-users');
  const secRecon = document.getElementById('section-riconciliazione');
  if (sbIsAdmin()) {
    if (btnLog) btnLog.style.visibility = 'visible';
    if (btnSessions) btnSessions.style.visibility = 'visible';
    if (btnBackups) btnBackups.style.visibility = 'visible';
    if (btnUsers) btnUsers.style.visibility = 'visible';
    if (secRecon) secRecon.style.display = '';
  } else {
    if (btnLog) btnLog.style.visibility = 'hidden';
    if (btnSessions) btnSessions.style.visibility = 'hidden';
    if (btnBackups) btnBackups.style.visibility = 'hidden';
    if (btnUsers) btnUsers.style.visibility = 'hidden';
    if (secRecon) secRecon.style.display = 'none';
  }
  sbApplyPageVisibility();
  sbApplyReadOnlyBanner();
  sbUpdateUI('syncing', 'Sync: caricamento dati…');
  await sbPull();
  sbLogActivity('Login', { email: _sbUser.email });
  sbStartHeartbeat();
  sbSubscribeRealtime();
}

function sbSubscribeRealtime() {
  if (_sbRealtimeChannel) return; // già sottoscritto
  try {
    _sbRealtimeChannel = _sbClient
      .channel('staffing-sync')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: SB_TABLE },
        (payload) => {
          // Ignora i propri salvataggi (stesso utente)
          const changedRow = payload.new;
          if (changedRow && changedRow.payload && changedRow.payload._savedBy === _sbUser?.email) return;
          console.log('Realtime: aggiornamento da altro utente, pull…');
          sbUpdateUI('syncing', 'Sync: aggiornamento ricevuto…');
          sbPull();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('Realtime: connesso');
        if (status === 'CHANNEL_ERROR') console.warn('Realtime: errore canale');
      });
  } catch(e) { console.warn('Realtime subscribe error:', e); }
}

async function sbLogout() {
  if (_sbRealtimeChannel) {
    try { _sbClient.removeChannel(_sbRealtimeChannel); } catch(e) {}
    _sbRealtimeChannel = null;
  }
  await sbStopHeartbeat();
  await _sbClient.auth.signOut();
  _sbUser = null;
  document.getElementById('sb-login-screen').style.display = 'flex';
  document.getElementById('sb-banner').style.display = 'none';
}

function sbShowChangePwd() {
  const modal = document.getElementById('sb-pwd-modal');
  document.getElementById('sb-pwd-new').value = '';
  document.getElementById('sb-pwd-confirm').value = '';
  document.getElementById('sb-pwd-error').style.display = 'none';
  document.getElementById('sb-pwd-success').style.display = 'none';
  document.getElementById('sb-pwd-btn').textContent = 'Salva';
  document.getElementById('sb-pwd-btn').disabled = false;
  modal.style.display = 'flex';
}

function sbClosePwdModal() {
  document.getElementById('sb-pwd-modal').style.display = 'none';
}

async function sbChangePwd() {
  const newPwd     = document.getElementById('sb-pwd-new').value;
  const confirmPwd = document.getElementById('sb-pwd-confirm').value;
  const errEl      = document.getElementById('sb-pwd-error');
  const okEl       = document.getElementById('sb-pwd-success');
  const btn        = document.getElementById('sb-pwd-btn');

  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  if (newPwd.length < 6) {
    errEl.textContent = 'La password deve essere di almeno 6 caratteri.';
    errEl.style.display = 'block'; return;
  }
  if (newPwd !== confirmPwd) {
    errEl.textContent = 'Le password non coincidono.';
    errEl.style.display = 'block'; return;
  }

  btn.textContent = 'Salvataggio…'; btn.disabled = true;
  try {
    const { error } = await _sbClient.auth.updateUser({ password: newPwd });
    if (error) throw error;
    okEl.textContent = 'Password aggiornata con successo!';
    okEl.style.display = 'block';
    setTimeout(() => sbClosePwdModal(), 1800);
  } catch(e) {
    errEl.textContent = e.message || 'Errore durante il cambio password.';
    errEl.style.display = 'block';
    btn.textContent = 'Salva'; btn.disabled = false;
  }
}

async function sbPull() {
  if (_sbSyncing) return;
  _sbSyncing = true;
  sbUpdateUI('syncing', 'Sync: caricamento…');
  try {
    const { data, error } = await _sbClient
      .from(SB_TABLE)
      .select('id, payload, updated_at')
      .in('id', [SB_ROW_CORE, SB_ROW_PLANNING, SB_ROW_FERIE, SB_ROW_DW]);

    if (error) throw error;

    const rows = {};
    (data || []).forEach(r => { rows[r.id] = r; });

    // Migrazione: se row 1 contiene ancora pw_data/pw_ferie (formato pre-v18.15)
    let needsMigration = false;
    if (rows[SB_ROW_CORE] && rows[SB_ROW_CORE].payload) {
      const p = rows[SB_ROW_CORE].payload;
      if (p.pw_data && !rows[SB_ROW_PLANNING]) {
        rows[SB_ROW_PLANNING] = { payload: { pw_data: p.pw_data }, updated_at: rows[SB_ROW_CORE].updated_at };
        delete p.pw_data;
        needsMigration = true;
      }
      if (p.pw_ferie && !rows[SB_ROW_FERIE]) {
        rows[SB_ROW_FERIE] = { payload: { pw_ferie: p.pw_ferie }, updated_at: rows[SB_ROW_CORE].updated_at };
        delete p.pw_ferie;
        needsMigration = true;
      }
    }

    // Applica core
    if (rows[SB_ROW_CORE] && rows[SB_ROW_CORE].payload) {
      const snap = rows[SB_ROW_CORE].payload;
      const keys = ['commesse_pipeline','operatori','assegnazioni','commesse_attive_extra',
                    'staffing_modificato','commesse_chiuse','commesse_attive_meta','commesse_escluse',
                    'attestati_registro','dpi_disponibili','dpi_catalogo'];
      keys.forEach(k => { if (snap[k] !== undefined) sbSetLocal(k, snap[k]); });
      await loadState();
      renderAll();
    }

    // Applica planning (anche in locale: pwLoad() rilegge pw_data dal local storage ad ogni
    // refresh/apertura della Pianificazione Settimanale — senza questo sbSetLocal, quella
    // rilettura sovrascriverebbe silenziosamente i dati appena scaricati con l'ultima copia
    // locale obsoleta, "perdendo" le modifiche di un altro utente dopo un refresh).
    if (rows[SB_ROW_PLANNING] && rows[SB_ROW_PLANNING].payload && rows[SB_ROW_PLANNING].payload.pw_data) {
      pwData = rows[SB_ROW_PLANNING].payload.pw_data;
      sbSetLocal('pw_data', pwData);
    }
    // Applica ferie (stesso motivo: pwFerieLoad() rilegge pw_ferie dal local storage)
    if (rows[SB_ROW_FERIE] && rows[SB_ROW_FERIE].payload && rows[SB_ROW_FERIE].payload.pw_ferie) {
      pwFerie = rows[SB_ROW_FERIE].payload.pw_ferie;
      sbSetLocal('pw_ferie', pwFerie);
    }
    if (rows[SB_ROW_FERIE] && rows[SB_ROW_FERIE].payload && rows[SB_ROW_FERIE].payload.pw_ferie_dettagli) {
      pwFerieDettagli = rows[SB_ROW_FERIE].payload.pw_ferie_dettagli;
      sbSetLocal('pw_ferie_dettagli', pwFerieDettagli);
    }
    // Applica doppia week (stesso motivo di planning/ferie: senza sbSetLocal, un reload
    // prima che sbPull() finisca mostrerebbe doppia-week vuota invece dell'ultima copia nota)
    if (rows[SB_ROW_DW] && rows[SB_ROW_DW].payload && rows[SB_ROW_DW].payload.pw_doppia_week) {
      pwDoppiaWeek = rows[SB_ROW_DW].payload.pw_doppia_week;
      sbSetLocal('pw_doppia_week', pwDoppiaWeek);
    }

    // Aggiorna timestamp per dominio
    [SB_ROW_CORE, SB_ROW_PLANNING, SB_ROW_FERIE, SB_ROW_DW].forEach(id => {
      if (rows[id] && rows[id].updated_at) _sbRemoteTs[id] = rows[id].updated_at;
    });

    const weeklyEl = document.getElementById('screen-weekly');
    if (weeklyEl && !weeklyEl.classList.contains('hidden')) {
      pwSwitchTab(typeof _pwActiveTab !== 'undefined' ? _pwActiveTab : 'griglia');
    }

    const ora = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
    sbUpdateUI('ok', 'Sync: aggiornato ✓', 'Ultimo sync: ' + ora);

    // Migrazione automatica (solo se il ruolo può scrivere: un ruolo di sola lettura
    // non deve marcare dirty né innescare un push automatico)
    if (needsMigration && sbCanWrite()) {
      _sbDirty.core = true; _sbDirty.planning = true; _sbDirty.ferie = true;
      setTimeout(() => sbPush(), 1500);
    }
  } catch(e) {
    console.error('sbPull error:', e);
    sbUpdateUI('error', 'Sync: errore — ' + e.message);
  }
  _sbSyncing = false;
}

async function sbSync() { await sbPull(); }

async function sbPush() {
  if (!_sbUser) return false;
  // Backstop: un ruolo di sola lettura non deve mai arrivare a scrivere su Supabase,
  // nemmeno tramite un push automatico (debounce/heartbeat) innescato da un percorso
  // che non passa dai guard nei singoli chokepoint (es. migrazioni automatiche).
  // Silenzioso (nessun modale): l'utente non ha compiuto un'azione diretta qui.
  if (!sbCanWrite()) { _sbDirty.core = _sbDirty.planning = _sbDirty.ferie = _sbDirty.dw = false; return false; }
  try {
    const domains = [];
    if (_sbDirty.core) {
      const keys = ['commesse_pipeline','operatori','assegnazioni','commesse_attive_extra',
                    'staffing_modificato','commesse_chiuse','commesse_attive_meta','commesse_escluse',
                    'attestati_registro','dpi_disponibili','dpi_catalogo'];
      const snap = { _savedAt: new Date().toISOString(), _version: '18', _savedBy: _sbUser.email };
      for (const k of keys) { try { snap[k] = await sget(k); } catch{} }
      domains.push({ id: SB_ROW_CORE, payload: snap, key: 'core' });
    }
    if (_sbDirty.planning) {
      domains.push({ id: SB_ROW_PLANNING, payload: { pw_data: pwData, _savedBy: _sbUser.email }, key: 'planning' });
    }
    if (_sbDirty.ferie) {
      domains.push({ id: SB_ROW_FERIE, payload: { pw_ferie: pwFerie, pw_ferie_dettagli: pwFerieDettagli, _savedBy: _sbUser.email }, key: 'ferie' });
    }
    if (_sbDirty.dw) {
      domains.push({ id: SB_ROW_DW, payload: { pw_doppia_week: pwDoppiaWeek, _savedBy: _sbUser.email }, key: 'dw' });
    }
    if (domains.length === 0) return true;

    // Controllo conflitti per dominio. NON usciamo alla prima collisione: un conflitto
    // su un dominio non deve far perdere le modifiche locali di altri domini dirty nello
    // stesso batch (es. planning+ferie salvati insieme per via del debounce condiviso).
    const conflicting = [];
    const clean = [];
    for (const d of domains) {
      const { data: remote, error: checkErr } = await _sbClient
        .from(SB_TABLE).select('updated_at').eq('id', d.id).single();
      if (checkErr && checkErr.code !== 'PGRST116') throw checkErr;
      if (remote && remote.updated_at && _sbRemoteTs[d.id] && remote.updated_at !== _sbRemoteTs[d.id]) {
        conflicting.push(d);
      } else {
        clean.push(d);
      }
    }

    // Scrittura dei domini senza conflitto SUBITO, prima di un eventuale sbPull(): così le
    // modifiche locali arrivano sul server prima che sbPull() sovrascriva lo stato in memoria.
    for (const d of clean) {
      const ts = new Date().toISOString();
      const { data: pushed, error } = await _sbClient
        .from(SB_TABLE)
        .upsert({ id: d.id, payload: d.payload, updated_at: ts })
        .select('updated_at')
        .single();
      if (error) throw error;
      _sbRemoteTs[d.id] = (pushed && pushed.updated_at) ? pushed.updated_at : ts;
      _sbDirty[d.key] = false;
      // Log attività per Griglia/Ferie/Doppia Week: questi domini non passano da saveState()
      // (che logga solo le azioni "core"), quindi finora un cambio qui non lasciava traccia
      // nel Log Attività admin — vedi anche pwAnno/pwWeek, la settimana attualmente aperta.
      if (d.key === 'planning') sbLogActivity('Modifica Griglia', { anno: pwAnno, week: pwWeek });
      else if (d.key === 'ferie') sbLogActivity('Modifica Ferie', { anno: pwAnno, week: pwWeek });
      else if (d.key === 'dw') sbLogActivity('Modifica Doppia Week', { anno: pwAnno, week: pwWeek });
    }

    if (conflicting.length > 0) {
      const nomi = conflicting.map(d => d.key).join(', ');
      conflicting.forEach(d => console.warn('sbPush: conflitto su dominio ' + d.key));
      sbUpdateUI('conflict', 'Sync: conflitto su ' + nomi + ' — ricarico…');
      await sbPull();
      sbUpdateUI('conflict', '⚠ Dati ricaricati: un altro utente ha modificato ' + nomi + '. Riprova.');
      return false;
    }

    const ora = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
    sbUpdateUI('ok', 'Sync: salvato ✓', 'Ultimo salvataggio: ' + ora);
    return true;
  } catch(e) {
    console.error('sbPush error:', e);
    sbUpdateUI('error', 'Sync: errore salvataggio — ' + e.message);
    return false;
  }
}

function sbScheduleAutoPush() {
  if (!_sbUser) return;
  clearTimeout(_sbAutoPushTimer);
  _sbAutoPushTimer = setTimeout(() => sbPush(), 3000);
}

function sbSetLocal(k, v) {
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch{}
  if (typeof window.storage !== 'undefined') {
    try { window.storage.set(k, JSON.stringify(v)); } catch{}
  }
}

/* ===================== CONTROLLO NUOVA VERSIONE ===================== */
// Le schede già aperte quando viene pubblicata una nuova versione continuano
// a eseguire il JS vecchio finché non ricaricano: questo poll periodico
// confronta la versione nell'header con quella del file pubblicato e avvisa
// l'utente con un banner, invece di lasciare che scopra di essere disallineato
// solo quando qualcosa si comporta in modo strano.
let _versionCheckTimer = null;
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function checkForNewVersion() {
  try {
    const current = document.getElementById('app-version')?.textContent.trim();
    if (!current) return;
    const res = await fetch(location.pathname + '?_v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/id="app-version"[^>]*>\s*([^<]+?)\s*</);
    const remote = m && m[1];
    if (remote && remote !== current) showVersionBanner(remote);
  } catch(e) { console.warn('checkForNewVersion error:', e); }
}

function showVersionBanner(remoteVersion) {
  const el = document.getElementById('version-banner');
  if (!el || el.dataset.shown === '1') return;
  el.dataset.shown = '1';
  const txt = document.getElementById('version-banner-text');
  if (txt) txt.textContent = '🔄 È disponibile una nuova versione (' + remoteVersion + ') — aggiorna quando vuoi.';
  el.style.display = 'flex';
}

function reloadForNewVersion() { location.reload(); }

function startVersionCheck() {
  if (_versionCheckTimer) return;
  checkForNewVersion();
  _versionCheckTimer = setInterval(checkForNewVersion, VERSION_CHECK_INTERVAL_MS);
}

async function sbInitAndCheck() {
  startVersionCheck();
  // Mostra sempre il login screen come primo step
  document.getElementById('sb-login-screen').style.display = 'flex';

  // Se le credenziali non sono ancora configurate, mostra avviso
  if (SB_URL === 'INSERISCI_SUPABASE_URL' || SB_ANON_KEY === 'INSERISCI_SUPABASE_ANON_KEY') {
    const errEl = document.getElementById('sb-login-error');
    if (errEl) {
      errEl.textContent = '⚠️ Credenziali Supabase non configurate. Inserisci SB_URL e SB_ANON_KEY nel file HTML.';
      errEl.style.display = 'block';
    }
    const btn = document.getElementById('sb-login-btn');
    if (btn) btn.disabled = true;
    return;
  }

  sbInit();
  if (!_sbClient) return;

  // Controlla se esiste già una sessione attiva
  try {
    const { data: { session } } = await _sbClient.auth.getSession();
    if (session && session.user) {
      _sbUser = session.user;
      await sbOnLoggedIn();
    }
  } catch(e) {
    console.warn('Supabase session check failed:', e);
  }
}

