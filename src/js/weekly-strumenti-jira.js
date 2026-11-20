/* ==================== STRUMENTI SQUADRA ↔ ASSEGNATARIO JIRA (GAR, v18.302.0) ====================
   Su Jira ogni strumento GAR ha un assegnatario (chi lo ha in mano) e uno stato
   (IN USO / DISPONIBILE / KO / MANUTENZIONE …). jira-list-strumenti li restituisce insieme
   all'elenco, quindi pwStrumenti = [{ key, name, tipo, stato, statoCat, assignee }].

   - Aggiunta automatica: quando un operatore entra in una squadra (o all'aggiornamento
     dell'elenco), gli strumenti IN USO che ha su Jira vanno negli strumenti della sua
     squadra, se non sono già in un'altra squadra della settimana e se non sono stati tolti
     a mano da quella squadra (sq.strumentiEsclusi). Mai nelle settimane passate.
   - Assegnazione: scegliendo uno strumento in tendina (o dal «👤» accanto) si sceglie a
     quale operatore della squadra assegnarlo su Jira; jira-strumento-assegna cambia
     l'assegnatario e lo porta IN USO. Togliere uno strumento dalla squadra non scrive Jira.
   - Operatore ↔ assegnatario Jira: email dell'anagrafica (opEmailMappa) uguale a quella
     dell'assegnatario, oppure accountId risolto dall'email (cache _pwStrJ.acc in
     localStorage; gli accountId non cambiano). Mai per nome. */

const PW_STR_TTL_MS = 30 * 60 * 1000;               // elenco più vecchio: riletto da solo aprendo la Griglia
const PW_STR_RIPROVA_MS = 5 * 60 * 1000;            // dopo un tentativo automatico fallito
const PW_STR_ACC_KEY = 'pw_jira_account_v1';        // { email: { id: accountId|null, ts } }
const PW_STR_ACC_NULL_TTL = 7 * 24 * 3600 * 1000;   // email senza utente Jira: si riprova dopo una settimana
const PW_STR_FN_ASSEGNA = 'jira-strumento-assegna';

let _pwStrJ = { ts: 0, inCorso: null, ultimoTentativo: 0, acc: {}, mappa: null, mappaT: 0, assegnando: false };
try { _pwStrJ.ts = parseInt(localStorage.getItem('pw_strumenti_cache_ts'), 10) || 0; } catch (_) {}
try { _pwStrJ.acc = JSON.parse(localStorage.getItem(PW_STR_ACC_KEY) || '{}') || {}; } catch (_) { _pwStrJ.acc = {}; }

HELP_TEXTS['pwStrAssegnaApri'] = 'Mostra chi ha questo strumento su Jira (assegnatario e stato del ticket GAR).\n\nVerde: lo ha un operatore della squadra ed è IN USO. Giallo: su Jira lo ha qualcun altro, nessuno, oppure non è IN USO. Rosso: su Jira è KO o in manutenzione.\n\nCliccando scegli a quale operatore della squadra assegnarlo: SU JIRA cambia l\'assegnatario e lo stato passa a IN USO (per uno strumento KO o in manutenzione chiede conferma). Non si annulla con Indietro: per rimediare si riassegna. Serve il ruolo admin o responsabile.';

function pwStrInUso(s) { return !!s && /^IN USO$/i.test(String(s.stato || '').trim()); }
function pwStrBloccato(s) { return !!s && /^(KO|MANUTENZIONE)/i.test(String(s.stato || '').trim()); }
function pwStrDaChiave(key) {
  if (!key || key.indexOf('forn:') === 0) return null;
  return pwStrumenti.find(s => s.key === key) || null;
}
function pwStrNomiSquadra(sq) {
  const out = [];
  ((sq && sq.operatori) || []).forEach(o => { const n = (o && o.nome || '').trim(); if (n && !out.includes(n)) out.push(n); });
  return out;
}

// nome -> email minuscola (memo breve: viene chiamata per ogni strumento di ogni squadra)
function _pwStrEmailMappa() {
  const ora = Date.now();
  if (_pwStrJ.mappa && ora - _pwStrJ.mappaT < 2000) return _pwStrJ.mappa;
  const m = {};
  const src = opEmailMappa();
  Object.keys(src).forEach(n => { m[n] = String(src[n] || '').trim().toLowerCase(); });
  _pwStrJ.mappa = m; _pwStrJ.mappaT = ora;
  return m;
}

// Fra i nomi indicati (default: tutti quelli con email) chi ha lo strumento su Jira, '' se nessuno.
function pwStrDetentore(s, nomi) {
  if (!s || !s.assignee || !s.assignee.accountId) return '';
  const a = s.assignee;
  const mappa = _pwStrEmailMappa();
  const elenco = nomi || Object.keys(mappa);
  for (const nome of elenco) {
    const em = mappa[nome];
    if (!em) continue;
    if (a.email && a.email === em) return nome;
    const c = _pwStrJ.acc[em];
    if (c && c.id && c.id === a.accountId) return nome;
  }
  return '';
}

function pwStrSettimanaPassata(anno, week) {
  const sab = isoWeekToMonday(anno, week);
  sab.setUTCDate(sab.getUTCDate() + 5);
  return sab.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10);
}

/* ---------- Lettura elenco + assegnatari ---------- */

function _pwStrSalvaAcc() {
  try { localStorage.setItem(PW_STR_ACC_KEY, JSON.stringify(_pwStrJ.acc)); } catch (_) {}
}

async function pwStrCarica() {
  if (_pwStrJ.inCorso) return _pwStrJ.inCorso;
  _pwStrJ.inCorso = (async () => {
    _pwStrJ.ultimoTentativo = Date.now();
    const ora = Date.now();
    const emails = [...new Set(Object.values(_pwStrEmailMappa()).filter(e => e && e.includes('@')))]
      .filter(e => { const c = _pwStrJ.acc[e]; return !c || (!c.id && ora - (c.ts || 0) > PW_STR_ACC_NULL_TTL); })
      .slice(0, 300);
    const { data, error } = await _sbClient.functions.invoke('jira-list-strumenti', { body: emails.length ? { emails } : {} });
    if (error) throw new Error(await _cpEdgeErr(error, 'jira-list-strumenti'));
    if (data && data.error) throw new Error(data.error);
    pwStrumenti = Array.isArray(data && data.strumenti) ? data.strumenti : [];
    if (data && data.accountByEmail && typeof data.accountByEmail === 'object') {
      Object.keys(data.accountByEmail).forEach(e => { _pwStrJ.acc[e] = { id: data.accountByEmail[e] || null, ts: ora }; });
      _pwStrSalvaAcc();
    }
    _pwStrJ.ts = ora;
    try {
      localStorage.setItem('pw_strumenti_cache', JSON.stringify(pwStrumenti));
      localStorage.setItem('pw_strumenti_cache_ts', String(ora));
    } catch (_) {}
    return pwStrumenti;
  })();
  try { return await _pwStrJ.inCorso; } finally { _pwStrJ.inCorso = null; }
}

/* Chiamata in fondo a pwRender: se l'elenco è vecchio lo rilegge in background, poi
   aggiunge alle squadre gli strumenti che hanno su Jira e ridisegna. */
function pwStrAutoRefresh() {
  if (typeof _sbClient === 'undefined' || !_sbClient || !_sbUser || _pwStrJ.inCorso) return;
  const vg = document.getElementById('pw-view-griglia');
  if (!vg || vg.classList.contains('hidden')) return;
  const ora = Date.now();
  if (ora - _pwStrJ.ts < PW_STR_TTL_MS || ora - _pwStrJ.ultimoTentativo < PW_STR_RIPROVA_MS) return;
  pwStrCarica().then(async () => {
    const n = pwStrAutoSettimana();
    if (n) { await pwSave(); _pwStrStato('🔧 ' + n + (n === 1 ? ' strumento aggiunto' : ' strumenti aggiunti') + ' dalle assegnazioni Jira'); }
    _pwStrRidisegna();
  }).catch(e => console.warn('pwStrAutoRefresh', e));
}

// pwRender appena l'utente non sta scrivendo in un campo (perderebbe focus e cursore).
function _pwStrRidisegna(tentativi) {
  const ae = document.activeElement;
  const scrive = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'pw-str-search';
  if (scrive && (tentativi || 0) < 60) { setTimeout(() => _pwStrRidisegna((tentativi || 0) + 1), 2000); return; }
  pwRender();
}

function _pwStrStato(testo) {
  const st = document.getElementById('pw-strumenti-status');
  if (!st) return;
  st.textContent = testo;
  setTimeout(() => { if (st.textContent === testo) st.textContent = ''; }, 6000);
}

/* ---------- Aggiunta automatica ---------- */

// Aggiunge a sq gli strumenti IN USO che i suoi operatori hanno su Jira. Ritorna quanti.
function pwStrAutoSquadra(sq, settimana) {
  if (!sq || !pwStrumenti.length) return 0;
  const nomi = pwStrNomiSquadra(sq);
  if (!nomi.length) return 0;
  const usati = new Set();
  (settimana || []).forEach(bc => ((bc && bc.squadre) || []).forEach(s2 => pwSqStrumentiJira(s2).forEach(k => { if (k) usati.add(k); })));
  const esclusi = new Set(Array.isArray(sq.strumentiEsclusi) ? sq.strumentiEsclusi : []);
  const arr = pwSqStrumentiJira(sq);
  let n = 0;
  pwStrumenti.forEach(s => {
    if (!pwStrInUso(s) || usati.has(s.key) || esclusi.has(s.key)) return;
    if (!pwStrDetentore(s, nomi)) return;
    const vuoto = arr.indexOf('');
    if (vuoto >= 0) arr[vuoto] = s.key; else arr.push(s.key);
    usati.add(s.key);
    n++;
  });
  if (n) pwSetSqStrumentiJira(sq, arr);
  return n;
}

// Tutte le squadre della settimana mostrata (non passata). Non salva: lo fa il chiamante.
function pwStrAutoSettimana() {
  if (!sbCanWrite() || pwStrSettimanaPassata(pwAnno, pwWeek)) return 0;
  const data = pwGetWeekData();
  let n = 0;
  data.forEach(bc => ((bc && bc.squadre) || []).forEach(sq => { n += pwStrAutoSquadra(sq, data); }));
  return n;
}

// Dopo aver messo un operatore in una squadra (prima del pwSave del chiamante).
function pwStrAutoDopoOperatore(cidx, sidx) {
  if (!sbCanWrite() || pwStrSettimanaPassata(pwAnno, pwWeek)) return 0;
  const data = pwGetWeekData();
  const sq = data[cidx] && data[cidx].squadre && data[cidx].squadre[sidx];
  const n = pwStrAutoSquadra(sq, data);
  if (n) _pwStrStato('🔧 ' + n + (n === 1 ? ' strumento aggiunto' : ' strumenti aggiunti') + ' alla squadra: assegnati su Jira ai suoi operatori');
  return n;
}

// Uno strumento tolto o sostituito a mano non torna da solo in quella squadra.
function pwStrEscludi(sq, key) {
  if (!sq || !key || key.indexOf('forn:') === 0) return;
  const ex = Array.isArray(sq.strumentiEsclusi) ? sq.strumentiEsclusi : [];
  if (!ex.includes(key)) ex.push(key);
  sq.strumentiEsclusi = ex;
}
function pwStrRiammetti(sq, key) {
  if (!sq || !Array.isArray(sq.strumentiEsclusi)) return;
  sq.strumentiEsclusi = sq.strumentiEsclusi.filter(k => k !== key);
  if (!sq.strumentiEsclusi.length) delete sq.strumentiEsclusi;
}

/* ---------- Badge «👤» accanto allo strumento in Griglia ---------- */

function pwStrBadgeHtml(key, sq, cidx, sidx, idx) {
  const s = pwStrDaChiave(key);
  if (!s) return '';
  const det = pwStrDetentore(s, pwStrNomiSquadra(sq));
  const a = s.assignee;
  let bg = '#fef3c7', fg = '#92400e', bd = '#fcd34d';
  if (pwStrBloccato(s)) { bg = '#fee2e2'; fg = '#991b1b'; bd = '#fca5a5'; }
  else if (det && pwStrInUso(s)) { bg = '#dcfce7'; fg = '#166534'; bd = '#86efac'; }
  const chi = a ? (a.displayName || 'utente Jira') : 'nessuno';
  let tit = 'Su Jira: ' + chi + ' · ' + (s.stato || 'stato ?');
  if (a && !det) tit += '\nNon è un operatore di questa squadra';
  if (sbCanWrite()) tit += '\nClicca per assegnarlo su Jira a un operatore della squadra';
  const stile = 'font-size:10px;border:1px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:9px;padding:0 6px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const testo = '👤 ' + esc(chi) + (pwStrInUso(s) ? '' : ' · ' + esc(s.stato || '?'));
  if (!sbCanWrite()) return '<span title="' + esc(tit) + '" style="' + stile + '">' + testo + '</span>';
  return '<button type="button" class="pw-str-jira pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-idx="' + idx + '" onclick="pwStrAssegnaApri(this)" title="' + esc(tit) + '" style="' + stile + 'cursor:pointer;">' + testo + '</button>';
}

function pwStrAssegnaApri(btn) {
  if (!sbGuardWrite()) return;
  const { cidx, sidx } = btn.dataset;
  const idx = parseInt(btn.dataset.idx, 10);
  const sq = pwGetWeekData()[cidx]?.squadre[sidx];
  const key = sq ? pwSqStrumentiJira(sq)[idx] : '';
  if (!pwStrDaChiave(key)) return;
  pwStrEnsurePanel();
  _pwStrTarget = { cidx, sidx, idx };
  pwStrPosiziona(btn);
  pwStrRenderAssegna(key);
}

/* ---------- Secondo passo della tendina: a chi assegnarlo su Jira ---------- */

// true se dopo la scelta in tendina serve chiedere a chi assegnarlo su Jira
function pwStrServeAssegnare(key, sq) {
  const s = pwStrDaChiave(key);
  if (!s || !sbCanWrite()) return false;
  return !(pwStrInUso(s) && pwStrDetentore(s, pwStrNomiSquadra(sq)));
}

function pwStrRenderAssegna(key) {
  const p = pwStrEnsurePanel();
  const list = p.querySelector('#pw-str-list');
  const cerca = p.querySelector('.pw-str-panel-search');
  if (cerca) cerca.style.display = 'none';
  const t = _pwStrTarget;
  const sq = t && pwGetWeekData()[t.cidx]?.squadre[t.sidx];
  const s = pwStrDaChiave(key);
  if (!sq || !s || !list) { pwStrClose(); return; }
  const nomi = pwStrNomiSquadra(sq);
  const det = pwStrDetentore(s, nomi);
  const mappa = _pwStrEmailMappa();
  const proposto = det || nomi.find(n => mappa[n]) || '';
  const ordinati = proposto ? [proposto, ...nomi.filter(n => n !== proposto)] : nomi;

  let html = '<div style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px;">'
    + '<div><b>' + esc(s.key) + '</b> · ' + esc(s.name) + '</div>'
    + '<div style="font-size:11px;color:#64748b;margin-top:2px;">Ora su Jira: ' + esc(s.assignee ? (s.assignee.displayName || 'utente Jira') : 'nessun assegnatario') + ' · ' + esc(s.stato || '?') + '</div>'
    + (pwStrBloccato(s) ? '<div style="font-size:11px;color:#b91c1c;margin-top:4px;">⚠ Su Jira è ' + esc(s.stato) + ': assegnandolo verrà rimesso IN USO (chiede conferma).</div>' : '')
    + '</div>';
  if (!nomi.length) {
    html += '<div style="padding:8px;font-size:11px;color:#92400e;">La squadra non ha ancora operatori: assegnalo su Jira più tardi dal «👤» accanto allo strumento.</div>';
  } else {
    html += '<div style="padding:4px 8px;font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Assegna su Jira a (e metti IN USO)</div>';
    ordinati.forEach(n => {
      const haEmail = !!mappa[n];
      const nota = n === det ? (pwStrInUso(s) ? ' · ce l\'ha già' : ' · ce l\'ha già, metti IN USO') : (n === proposto ? ' · proposto' : '');
      html += haEmail
        ? '<div class="pw-str-item" data-nome="' + esc(n) + '" data-help-key="pwStrAssegnaApri">👤 ' + esc(n) + '<span style="color:#64748b;font-size:11px;">' + esc(nota) + '</span></div>'
        : '<div class="pw-str-item empty" style="cursor:default;" title="Manca l\'email in anagrafica: impossibile trovarlo su Jira">👤 ' + esc(n) + ' <span style="font-size:11px;">(senza email)</span></div>';
    });
  }
  html += '<div class="pw-str-item empty" data-solo="1" data-help-key="pw-str-voce">Solo in Griglia (Jira non cambia)</div>';
  list.innerHTML = html;
  list.querySelectorAll('.pw-str-item[data-nome]').forEach(el => {
    el.onclick = () => pwStrAssegnaJira(key, el.dataset.nome);
  });
  const solo = list.querySelector('[data-solo]');
  if (solo) solo.onclick = () => pwStrClose();
}

async function _pwStrInvoca(body) {
  const { data, error } = await _sbClient.functions.invoke(PW_STR_FN_ASSEGNA, { body });
  if (!error) return data || {};
  let j = null;
  try { if (error.context && typeof error.context.clone === 'function') j = await error.context.clone().json(); } catch (_) {}
  return { errore: (j && j.error) || await _cpEdgeErr(error, PW_STR_FN_ASSEGNA), codice: j && j.codice, stato: j && j.stato };
}

async function pwStrAssegnaJira(key, nome, forza) {
  if (!sbGuardWrite() || _pwStrJ.assegnando) return;
  if (typeof _sbClient === 'undefined' || !_sbClient || !_sbUser) { showAlertModal('Non connesso: impossibile contattare Jira.'); return; }
  const t = _pwStrTarget;
  const bc = t ? pwGetWeekData()[t.cidx] : null;
  const sq = bc && bc.squadre ? bc.squadre[t.sidx] : null;
  const email = opEmailDi(nome);
  if (!email) { showAlertModal(nome + ' non ha un\'email in anagrafica: impossibile trovarlo su Jira.'); return; }
  const list = document.getElementById('pw-str-list');
  if (list) list.innerHTML = '<div style="padding:12px;font-size:12px;color:#475569;">⏳ Assegno ' + esc(key) + ' a ' + esc(nome) + ' su Jira…</div>';
  _pwStrJ.assegnando = true;
  let res;
  try {
    res = await _pwStrInvoca({
      key, email, operatore: nome, forza: !!forza,
      contesto: { anno: pwAnno, week: pwWeek, commessa: (bc && bc.commessa) || '', squadra: (sq && sq.nome) || '' },
    });
  } catch (e) {
    res = { errore: String((e && e.message) || e) };
  } finally {
    _pwStrJ.assegnando = false;
  }
  pwStrClose();
  if (res.errore) {
    if (res.codice === 'stato_bloccato' && !forza) {
      const ok = await showConfirmAsync(key + ' su Jira è in stato ' + (res.stato || '?') + '.\n\nRimetterlo IN USO e assegnarlo a ' + nome + '?', 'Rimetti IN USO');
      if (ok) { _pwStrTarget = t; await pwStrAssegnaJira(key, nome, true); }
      return;
    }
    showAlertModal('Strumento non assegnato su Jira: ' + res.errore);
    return;
  }
  // Aggiorna la cache locale con quanto restituito da Jira
  const s = pwStrDaChiave(key);
  if (s) {
    if (res.assignee) s.assignee = res.assignee;
    if (res.stato) { s.stato = res.stato; s.statoCat = res.statoCat || s.statoCat; }
    try { localStorage.setItem('pw_strumenti_cache', JSON.stringify(pwStrumenti)); } catch (_) {}
  }
  const em = email.trim().toLowerCase();
  if (res.assignee && res.assignee.accountId) { _pwStrJ.acc[em] = { id: res.assignee.accountId, ts: Date.now() }; _pwStrSalvaAcc(); }
  const fatto = res.cambiatoAssegnatario || res.cambiatoStato
    ? '✓ ' + key + ' assegnato a ' + nome + ' su Jira' + (res.cambiatoStato ? ' · IN USO' : '')
    : '✓ ' + key + ': su Jira era già a ' + nome + ' e IN USO';
  _pwStrStato(fatto);
  if (res.avviso) showAlertModal(fatto + '\n\nAttenzione: ' + res.avviso);
  pwRender();
}
