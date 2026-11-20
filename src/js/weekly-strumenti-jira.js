/* ==================== STRUMENTI SQUADRA ↔ ASSEGNATARIO JIRA (GAR, v18.302.0 / v18.304.0) ====================
   Su Jira ogni strumento GAR ha un assegnatario (chi lo ha in mano) e uno stato
   (IN USO / DISPONIBILE / KO / MANUTENZIONE …). jira-list-strumenti li restituisce insieme
   all'elenco, quindi pwStrumenti = [{ key, name, tipo, stato, statoCat, assignee }].

   - Chi ha cosa (v18.304.0): nella cella di ogni operatore i chip «🔧» degli strumenti che
     ha su Jira (verde = già negli strumenti della squadra, tratteggiato = proposto, grigio =
     in un'altra squadra della settimana); nella riga Strumenti ogni strumento dice a chi è
     assegnato su Jira.
   - Solo proposte, mai aggiunte automatiche (v18.304.0: un drone non serve a chi fa un
     rilievo walkout): gli strumenti IN USO dei membri della squadra, non già in un'altra
     squadra della settimana, compaiono come «💡» da confermare (✓) o scartare (✕ →
     sq.strumentiEsclusi, non più proposti a quella squadra). Mai nelle settimane passate.
   - Assegnazione: scegliendo uno strumento in tendina (o dal «👤») si sceglie a quale
     operatore della squadra assegnarlo su Jira; jira-strumento-assegna cambia l'assegnatario
     e lo porta IN USO. Togliere uno strumento dalla squadra non scrive Jira.
   - Operatore ↔ assegnatario Jira: email dell'anagrafica (opEmailMappa) uguale a quella
     dell'assegnatario, oppure accountId risolto dall'email (cache _pwStrJ.acc in
     localStorage; gli accountId non cambiano). Mai per nome. */

const PW_STR_TTL_MS = 30 * 60 * 1000;               // elenco più vecchio: riletto da solo aprendo la Griglia
const PW_STR_RIPROVA_MS = 5 * 60 * 1000;            // dopo un tentativo automatico fallito
const PW_STR_ACC_KEY = 'pw_jira_account_v1';        // { email: { id: accountId|null, ts } }
const PW_STR_ACC_NULL_TTL = 7 * 24 * 3600 * 1000;   // email senza utente Jira: si riprova dopo una settimana
const PW_STR_FN_ASSEGNA = 'jira-strumento-assegna';

let _pwStrJ = { ts: 0, inCorso: null, ultimoTentativo: 0, acc: {}, indice: null, indiceT: 0, assegnando: false };
try { _pwStrJ.ts = parseInt(localStorage.getItem('pw_strumenti_cache_ts'), 10) || 0; } catch (_) {}
try { _pwStrJ.acc = JSON.parse(localStorage.getItem(PW_STR_ACC_KEY) || '{}') || {}; } catch (_) { _pwStrJ.acc = {}; }

HELP_TEXTS['pwStrAssegnaApri'] = 'Mostra a chi è assegnato questo strumento su Jira (ticket GAR) e in che stato è.\n\nVerde: lo ha un operatore della squadra ed è IN USO. Giallo: su Jira lo ha qualcun altro, nessuno, oppure non è IN USO. Rosso: su Jira è KO o in manutenzione.\n\nCliccando scegli a quale operatore della squadra assegnarlo: SU JIRA cambia l\'assegnatario e lo stato passa a IN USO (per uno strumento KO o in manutenzione chiede conferma). Non si annulla con Indietro: per rimediare si riassegna. Serve il ruolo admin o responsabile.';
HELP_TEXTS['pwStrAccetta'] = 'Strumento che su Jira è assegnato (IN USO) a questo operatore e che non è ancora fra gli strumenti di nessuna squadra della settimana. Cliccando lo metti fra gli strumenti della squadra.\n\nSi salva nella Griglia condivisa; su Jira non cambia nulla (lo ha già lui). Serve il ruolo admin o responsabile.';
HELP_TEXTS['pwStrRifiuta'] = 'Scarta la proposta: lo strumento non viene più proposto a questa squadra in questa settimana (per esempio un drone a chi fa un rilievo walkout). Si può sempre aggiungere a mano con «+ Strumento».\n\nSi salva nella Griglia condivisa; su Jira non cambia nulla.';
HELP_TEXTS['pwStrAccettaTutti'] = 'Mette fra gli strumenti della squadra tutti quelli proposti (assegnati IN USO su Jira ai suoi operatori). Si salva nella Griglia condivisa; su Jira non cambia nulla.';

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
function _pwStrCognome(nome) {
  const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome) === nome);
  return (op && op.cognome) ? op.cognome : String(nome || '').split(' ')[0];
}

/* Indice chi-ha-cosa: perKey[key] = nome operatore che lo ha su Jira, perNome[nome] = [strumenti].
   Memo breve: viene letto per ogni operatore e ogni strumento a ogni pwRender. */
function _pwStrIndice() {
  const ora = Date.now();
  const ix = _pwStrJ.indice;
  if (ix && ix.lista === pwStrumenti && ora - _pwStrJ.indiceT < 1500) return ix;
  const src = opEmailMappa();
  const perEmail = {}, perAcc = {}, email = {};
  Object.keys(src).forEach(n => {
    const em = String(src[n] || '').trim().toLowerCase();
    if (!em) return;
    email[n] = em;
    if (!perEmail[em]) perEmail[em] = n;
    const c = _pwStrJ.acc[em];
    if (c && c.id && !perAcc[c.id]) perAcc[c.id] = n;
  });
  const perKey = {}, perNome = {};
  pwStrumenti.forEach(s => {
    const a = s.assignee;
    if (!a || !a.accountId) return;
    const n = (a.email && perEmail[a.email]) || perAcc[a.accountId] || '';
    if (!n) return;
    perKey[s.key] = n;
    (perNome[n] = perNome[n] || []).push(s);
  });
  _pwStrJ.indice = { lista: pwStrumenti, perKey, perNome, email };
  _pwStrJ.indiceT = ora;
  return _pwStrJ.indice;
}
function _pwStrInvalidaIndice() { _pwStrJ.indice = null; }

// Fra i nomi indicati (default: chiunque in anagrafica) chi ha lo strumento su Jira, '' se nessuno.
function pwStrDetentore(s, nomi) {
  if (!s) return '';
  const n = _pwStrIndice().perKey[s.key] || '';
  return n && (!nomi || nomi.includes(n)) ? n : '';
}

function pwStrSettimanaPassata(anno, week) {
  const sab = isoWeekToMonday(anno, week);
  sab.setUTCDate(sab.getUTCDate() + 5);
  return sab.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10);
}

// chiave -> nome della squadra della settimana che lo ha fra i suoi strumenti
function _pwStrUsatiSettimana(settimana) {
  const m = {};
  (settimana || []).forEach(bc => ((bc && bc.squadre) || []).forEach(sq => pwSqStrumentiJira(sq).forEach(k => {
    if (k && !m[k]) m[k] = (bc.commessa ? bc.commessa + ' · ' : '') + (sq.nome || 'squadra');
  })));
  return m;
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
    const src = opEmailMappa();
    const emails = [...new Set(Object.values(src).map(e => String(e || '').trim().toLowerCase()).filter(e => e.includes('@')))]
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
    _pwStrInvalidaIndice();
    _pwStrJ.ts = ora;
    try {
      localStorage.setItem('pw_strumenti_cache', JSON.stringify(pwStrumenti));
      localStorage.setItem('pw_strumenti_cache_ts', String(ora));
    } catch (_) {}
    return pwStrumenti;
  })();
  try { return await _pwStrJ.inCorso; } finally { _pwStrJ.inCorso = null; }
}

/* Chiamata in fondo a pwRender: se l'elenco è vecchio lo rilegge in background e
   ridisegna (solo lettura: nessuna modifica alla Griglia). */
function pwStrAutoRefresh() {
  if (typeof _sbClient === 'undefined' || !_sbClient || !_sbUser || _pwStrJ.inCorso) return;
  const vg = document.getElementById('pw-view-griglia');
  if (!vg || vg.classList.contains('hidden')) return;
  const ora = Date.now();
  if (ora - _pwStrJ.ts < PW_STR_TTL_MS || ora - _pwStrJ.ultimoTentativo < PW_STR_RIPROVA_MS) return;
  pwStrCarica().then(() => _pwStrRidisegna()).catch(e => console.warn('pwStrAutoRefresh', e));
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

/* ---------- Proposte (mai aggiunte da sole) ---------- */

// [{ s, nome }]: strumenti IN USO dei membri di sq, non già in una squadra della settimana
// né scartati per quella squadra. Vuoto nelle settimane passate o per chi non può scrivere.
function pwStrProposte(sq, settimana) {
  if (!sq || !pwStrumenti.length || !sbCanWrite() || pwStrSettimanaPassata(pwAnno, pwWeek)) return [];
  const ix = _pwStrIndice();
  const usati = _pwStrUsatiSettimana(settimana);
  const esclusi = new Set(Array.isArray(sq.strumentiEsclusi) ? sq.strumentiEsclusi : []);
  const out = [];
  pwStrNomiSquadra(sq).forEach(nome => (ix.perNome[nome] || []).forEach(s => {
    if (pwStrInUso(s) && !usati[s.key] && !esclusi.has(s.key)) out.push({ s, nome });
  }));
  return out;
}

function _pwStrSquadraDa(el) {
  const { cidx, sidx } = el.dataset;
  return pwGetWeekData()[cidx]?.squadre[sidx] || null;
}
function _pwStrAggiungi(sq, key) {
  const arr = pwSqStrumentiJira(sq);
  if (arr.includes(key)) return false;
  const vuoto = arr.indexOf('');
  if (vuoto >= 0) arr[vuoto] = key; else arr.push(key);
  pwSetSqStrumentiJira(sq, arr);
  pwStrRiammetti(sq, key);
  return true;
}

async function pwStrAccetta(btn) {
  if (!sbGuardWrite()) return;
  const sq = _pwStrSquadraDa(btn);
  if (!sq || !btn.dataset.key) return;
  if (_pwStrAggiungi(sq, btn.dataset.key)) { await pwSave(); pwRender(); }
}
async function pwStrAccettaTutti(btn) {
  if (!sbGuardWrite()) return;
  const sq = _pwStrSquadraDa(btn);
  if (!sq) return;
  let n = 0;
  pwStrProposte(sq, pwGetWeekData()).forEach(p => { if (_pwStrAggiungi(sq, p.s.key)) n++; });
  if (n) { await pwSave(); pwRender(); }
}
async function pwStrRifiuta(btn) {
  if (!sbGuardWrite()) return;
  const sq = _pwStrSquadraDa(btn);
  if (!sq || !btn.dataset.key) return;
  pwStrEscludi(sq, btn.dataset.key);
  await pwSave();
  pwRender();
}

// Scartato, tolto o sostituito a mano: non più proposto a quella squadra.
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

/* ---------- Cella operatore: strumenti che ha su Jira ---------- */

function pwStrOperatoreHtml(nome, sq, cidx, sidx, settimana) {
  if (!nome || !pwStrumenti.length) return '';
  const lista = (_pwStrIndice().perNome[nome] || []).filter(s => !pwStrBloccato(s));
  if (!lista.length) return '';
  const inSquadra = new Set(pwSqStrumentiJira(sq));
  const usati = _pwStrUsatiSettimana(settimana);
  const esclusi = new Set(Array.isArray(sq.strumentiEsclusi) ? sq.strumentiEsclusi : []);
  const puo = sbCanWrite() && !pwStrSettimanaPassata(pwAnno, pwWeek);
  const chip = lista.map(s => {
    const base = 'display:inline-block;font-size:9px;line-height:14px;border-radius:7px;padding:0 5px;margin:1px 2px 0 0;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top;';
    const tit0 = s.key + ' · ' + s.name + '\nSu Jira: assegnato a ' + nome + ' · ' + (s.stato || '?');
    if (inSquadra.has(s.key)) {
      return '<span title="' + esc(tit0 + '\nÈ fra gli strumenti di questa squadra') + '" style="' + base + 'background:#dcfce7;color:#166534;border:1px solid #86efac;font-weight:600;">🔧 ' + esc(s.name) + '</span>';
    }
    if (usati[s.key]) {
      return '<span title="' + esc(tit0 + '\nQuesta settimana è fra gli strumenti di ' + usati[s.key]) + '" style="' + base + 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">🔧 ' + esc(s.name) + ' · altra squadra</span>';
    }
    if (puo && pwStrInUso(s) && !esclusi.has(s.key)) {
      return '<button type="button" class="pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-key="' + esc(s.key) + '" onclick="pwStrAccetta(this)" title="' + esc(tit0 + '\nNon è ancora fra gli strumenti della squadra: clicca per aggiungerlo') + '" style="' + base + 'background:#fffbeb;color:#92400e;border:1px dashed #f59e0b;cursor:pointer;">🔧 ' + esc(s.name) + ' ＋</button>';
    }
    return '<span title="' + esc(tit0 + '\nNon è fra gli strumenti della squadra') + '" style="' + base + 'background:#fff;color:#94a3b8;border:1px dashed #cbd5e1;">🔧 ' + esc(s.name) + '</span>';
  }).join('');
  return '<div style="max-width:100%;">' + chip + '</div>';
}

/* ---------- Riga «🔧 Strumenti» della squadra ---------- */

function pwStrRigaHtml(sq, cidx, sidx, conteggi) {
  const strumenti = pwSqStrumentiJira(sq);
  const nomi = pwStrNomiSquadra(sq);
  let html = '<div class="pw-strumenti-row no-print" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 10px;background:#fffbeb;border-top:1px solid #fde68a;">'
    + '<span style="font-size:10px;color:#92400e;font-weight:700;white-space:nowrap;">🔧 Strumenti:</span>';
  strumenti.forEach((k, idx) => {
    const dup = k && conteggi[k] > 1;
    const s = pwStrDaChiave(k);
    const titolo = k ? (s ? s.name : pwStrLabel(k)) : '— strumento —';
    const sotto = s ? s.key : (k && k.indexOf('forn:') === 0 ? 'fornitore' : '');
    html += '<span style="display:inline-flex;align-items:stretch;border:1px solid ' + (dup ? '#dc2626' : '#d1d5db') + ';border-radius:6px;background:' + (dup ? '#fef2f2' : '#fff') + ';overflow:hidden;">'
      + '<button type="button" class="pw-str-trigger pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-idx="' + idx + '" onclick="pwStrOpen(this)"'
      + ' title="' + esc(dup ? 'Attenzione: questo strumento è assegnato a più squadre in questa settimana' : 'Clicca per cercare e scegliere lo strumento') + '"'
      + ' style="font-size:11px;text-align:left;padding:1px 6px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent;cursor:pointer;line-height:1.2;">'
      + '<b>' + esc(titolo) + '</b>' + (sotto ? ' <span style="font-size:9px;color:#94a3b8;">' + esc(sotto) + '</span>' : '') + ' ▾</button>'
      + pwStrDetentoreHtml(k, nomi, cidx, sidx, idx)
      + (dup ? '<span title="Doppia assegnazione" style="color:#dc2626;font-size:12px;padding:0 3px;align-self:center;">⚠</span>' : '')
      + '<button class="pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-idx="' + idx + '" onclick="pwRemoveStrumento(this)" title="Rimuovi strumento" style="color:#b91c1c;font-size:12px;line-height:1;padding:0 5px;border-left:1px solid #e5e7eb;">✕</button>'
      + '</span>';
  });
  html += '<button class="pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" onclick="pwAddStrumento(this)" style="font-size:10px;font-weight:600;background:#fde68a;color:#92400e;border-radius:4px;padding:2px 7px;white-space:nowrap;">+ Strumento</button>';
  if (pwStrumenti.length === 0) html += '<span style="font-size:9px;color:#b45309;">(clicca "🔧 Strumenti" in alto per caricare l\'elenco da Jira)</span>';

  const proposte = pwStrProposte(sq, pwGetWeekData());
  if (proposte.length) {
    html += '<span style="flex-basis:100%;height:0;"></span>'
      + '<span style="font-size:10px;color:#92400e;white-space:nowrap;" title="Strumenti IN USO su Jira agli operatori di questa squadra, non ancora in nessuna squadra della settimana">💡 Su Jira hanno anche:</span>';
    proposte.forEach(p => {
      html += '<span style="display:inline-flex;align-items:center;border:1px dashed #f59e0b;border-radius:6px;background:#fff;font-size:11px;overflow:hidden;">'
        + '<span style="padding:1px 6px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(p.s.key + ' · ' + p.s.name + '\nSu Jira: ' + p.nome + ' · ' + (p.s.stato || '?')) + '"><b>' + esc(p.s.name) + '</b> <span style="color:#64748b;">· ' + esc(_pwStrCognome(p.nome)) + '</span></span>'
        + '<button class="pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-key="' + esc(p.s.key) + '" onclick="pwStrAccetta(this)" title="Aggiungi agli strumenti della squadra" style="padding:1px 6px;color:#166534;font-weight:700;border-left:1px solid #fde68a;">✓</button>'
        + '<button class="pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-key="' + esc(p.s.key) + '" onclick="pwStrRifiuta(this)" title="Non serve: non proporlo più a questa squadra" style="padding:1px 6px;color:#94a3b8;border-left:1px solid #fde68a;">✕</button>'
        + '</span>';
    });
    if (proposte.length > 1) {
      html += '<button class="pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" onclick="pwStrAccettaTutti(this)" style="font-size:10px;color:#166534;text-decoration:underline;">✓ aggiungi tutti</button>';
    }
  }
  return html + '</div>';
}

// Parte «👤 a chi è su Jira» dentro la pillola dello strumento.
function pwStrDetentoreHtml(key, nomi, cidx, sidx, idx) {
  const s = pwStrDaChiave(key);
  if (!s) return '';
  const det = pwStrDetentore(s, nomi);
  const a = s.assignee;
  let bg = '#fef3c7', fg = '#92400e', testo;
  if (pwStrBloccato(s)) { bg = '#fee2e2'; fg = '#991b1b'; testo = (s.stato || 'KO'); }
  else if (det && pwStrInUso(s)) { bg = '#dcfce7'; fg = '#166534'; testo = '👤 ' + _pwStrCognome(det); }
  else if (det) { testo = '👤 ' + _pwStrCognome(det) + ' · ' + (s.stato || '?'); }
  else if (a) { testo = 'su Jira: ' + (a.displayName || 'altro utente'); }
  else { testo = 'su Jira: nessuno'; }
  let tit = 'Su Jira: ' + (a ? (a.displayName || 'utente Jira') : 'nessun assegnatario') + ' · ' + (s.stato || 'stato ?');
  if (a && !det) tit += '\nNon è un operatore di questa squadra';
  if (sbCanWrite()) tit += '\nClicca per assegnarlo su Jira a un operatore della squadra';
  const stile = 'font-size:10px;background:' + bg + ';color:' + fg + ';padding:0 6px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:1px solid #e5e7eb;display:inline-flex;align-items:center;';
  if (!sbCanWrite()) return '<span title="' + esc(tit) + '" style="' + stile + '">' + esc(testo) + '</span>';
  return '<button type="button" class="pw-str-jira pw-write-action" data-cidx="' + cidx + '" data-sidx="' + sidx + '" data-idx="' + idx + '" onclick="pwStrAssegnaApri(this)" title="' + esc(tit) + '" style="' + stile + 'cursor:pointer;">' + esc(testo) + '</button>';
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

/* ---------- Tendina: voci raggruppate per chi ce l'ha ---------- */

function pwStrVociJiraHtml(f) {
  const t = _pwStrTarget;
  const sq = t ? pwGetWeekData()[t.cidx]?.squadre[t.sidx] : null;
  const nomiSq = sq ? pwStrNomiSquadra(sq) : [];
  const ix = _pwStrIndice();
  const usati = _pwStrUsatiSettimana(pwGetWeekData());
  const testoDi = s => (s.key + ' ' + s.name + ' ' + ((s.assignee && s.assignee.displayName) || '') + ' ' + (ix.perKey[s.key] || '')).toLowerCase();
  const items = pwStrumenti.filter(s => !f || testoDi(s).includes(f));
  const gruppi = { squadra: [], liberi: [], altri: [], fuori: [] };
  items.forEach(s => {
    if (pwStrBloccato(s)) gruppi.fuori.push(s);
    else if (ix.perKey[s.key] && nomiSq.includes(ix.perKey[s.key])) gruppi.squadra.push(s);
    else if (!s.assignee || /^DISPONIBILE$/i.test(String(s.stato || '').trim())) gruppi.liberi.push(s);
    else gruppi.altri.push(s);
  });
  const voce = (s, chi, colChi) => {
    const usato = usati[s.key] ? '<span style="color:#b91c1c;"> · già in ' + esc(usati[s.key]) + '</span>' : '';
    return '<div class="pw-str-item" data-key="' + esc(s.key) + '"' + (pwStrBloccato(s) ? ' style="opacity:.5;"' : '') + '>'
      + '<b>' + esc(s.name) + '</b> <span style="font-size:10px;color:#94a3b8;">' + esc(s.key) + '</span>'
      + '<div style="font-size:10px;color:' + colChi + ';">' + chi + usato + '</div></div>';
  };
  const titolo = (t, col) => '<div style="padding:5px 8px 3px;font-size:10px;font-weight:700;color:' + col + ';text-transform:uppercase;background:#f8fafc;border-bottom:1px solid #f1f5f9;">' + t + '</div>';
  const chiDi = s => {
    const n = ix.perKey[s.key];
    return n ? n : (s.assignee ? (s.assignee.displayName || 'utente Jira') : 'nessuno');
  };
  let html = '', fuori = '';
  if (gruppi.squadra.length) {
    html += titolo('Ce l\'hanno operatori di questa squadra', '#166534');
    gruppi.squadra.forEach(s => { html += voce(s, '👤 <b>' + esc(chiDi(s)) + '</b> · ' + esc(s.stato || '?'), '#166534'); });
  }
  if (gruppi.liberi.length) {
    html += titolo('Disponibili', '#0369a1');
    gruppi.liberi.forEach(s => { html += voce(s, s.assignee ? 'DISPONIBILE · ultimo: ' + esc(chiDi(s)) : 'DISPONIBILE · nessun assegnatario', '#0369a1'); });
  }
  if (gruppi.altri.length) {
    html += titolo('In uso ad altri', '#92400e');
    gruppi.altri.forEach(s => { html += voce(s, '👤 ' + esc(chiDi(s)) + ' · ' + esc(s.stato || '?'), '#92400e'); });
  }
  if (gruppi.fuori.length) {
    fuori += titolo('KO / manutenzione', '#991b1b');
    gruppi.fuori.forEach(s => { fuori += voce(s, esc(s.stato || '?') + (s.assignee ? ' · ' + esc(chiDi(s)) : ''), '#991b1b'); });
  }
  if (!items.length) html += '<div style="padding:6px 8px;font-size:11px;color:#94a3b8;">Nessun risultato.</div>';
  // KO/manutenzione vanno in fondo, dopo gli strumenti dei fornitori
  return { html, fuori };
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
  const email = _pwStrIndice().email;
  const proposto = det || nomi.find(n => email[n]) || '';
  const ordinati = proposto ? [proposto, ...nomi.filter(n => n !== proposto)] : nomi;

  let html = '<div style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px;">'
    + '<div><b>' + esc(s.name) + '</b> <span style="font-size:10px;color:#94a3b8;">' + esc(s.key) + '</span></div>'
    + '<div style="font-size:11px;color:#64748b;margin-top:2px;">Ora su Jira: ' + esc(s.assignee ? (s.assignee.displayName || 'utente Jira') : 'nessun assegnatario') + ' · ' + esc(s.stato || '?') + '</div>'
    + (pwStrBloccato(s) ? '<div style="font-size:11px;color:#b91c1c;margin-top:4px;">⚠ Su Jira è ' + esc(s.stato) + ': assegnandolo verrà rimesso IN USO (chiede conferma).</div>' : '')
    + '</div>';
  if (!nomi.length) {
    html += '<div style="padding:8px;font-size:11px;color:#92400e;">La squadra non ha ancora operatori: assegnalo su Jira più tardi dal «👤» accanto allo strumento.</div>';
  } else {
    html += '<div style="padding:4px 8px;font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Assegna su Jira a (e metti IN USO)</div>';
    ordinati.forEach(n => {
      const nota = n === det ? (pwStrInUso(s) ? ' · ce l\'ha già' : ' · ce l\'ha già, metti IN USO') : (n === proposto ? ' · proposto' : '');
      html += email[n]
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
  _pwStrInvalidaIndice();
  const fatto = res.cambiatoAssegnatario || res.cambiatoStato
    ? '✓ ' + key + ' assegnato a ' + nome + ' su Jira' + (res.cambiatoStato ? ' · IN USO' : '')
    : '✓ ' + key + ': su Jira era già a ' + nome + ' e IN USO';
  _pwStrStato(fatto);
  if (res.avviso) showAlertModal(fatto + '\n\nAttenzione: ' + res.avviso);
  pwRender();
}
