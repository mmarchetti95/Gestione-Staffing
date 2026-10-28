/* ==================== CONTROLLO PRODUZIONE · TIMELINE: CORREZIONE WORKLOG ====================
   Editor dei worklog Jira dalla "🕘 Timeline worklog" (v18.230.0), per admin e responsabili.
   Serve quando un operatore non fa bene le transizioni del sottotask: l'automazione Jira crea il
   worklog quando il sottotask esce da IN PROGRESS, quindi orari e durata sbagliati (o un worklog
   mancante) finiscono su Jira e bisogna correggerli a mano.
   - Clic su un segmento con l'id Jira (worklog letti dalla v18.230.0): correggi giorno, inizio,
     fine e commento, oppure elimina. «＋» sulla riga: nuovo worklog per quell'operatore.
   - Scrive SOLO tramite l'Edge Function jira-worklog-edit (account di servizio Jira, stima del
     ticket invariata, prima/dopo in activity_log lato server), sempre dopo una conferma.
   - Prima di modificare/eliminare manda "atteso" (started + seconds visti qui): se su Jira il
     worklog è cambiato nel frattempo la funzione non tocca nulla e si rilegge l'operatore.
   - Dopo ogni scrittura rilegge da Jira (sola lettura) i worklog della settimana dell'operatore.
     Non aggiorna controllo_produzione: la colonna «Ore Jira» si aggiorna con «🔄 Sincronizza
     da Jira», come per ogni correzione fatta direttamente su Jira.
   Modal #cptl-wl-modal (z-index 99995: sopra la timeline, sotto conferme e avvisi). */

const CPTL_WL_FN = 'jira-worklog-edit';
const CPTL_WL_FN_NASCOSTA = 'controllo:timeline-modifica';
const CPTL_WL_LUNGO_MIN = 10 * 60;   // oltre: avviso "durata lunga"

let _cpTlWl = {
  aperto: false,
  modo: '',             // 'modifica' | 'nuovo'
  nome: '', g: 0,
  k: '', d: null,       // settimana ('anno|week') e date su cui è stato aperto
  t: null, w: null,     // ticket e worklog originali (modifica)
  inizio: 0, fine: 0,   // minuti dalla mezzanotte del giorno della riga (originali o proposti)
  salvando: false,
};

/* Admin/responsabile collegato, e funzione non nascosta dall'admin ("🧩 Funzioni") */
function cpTlWlPuo() {
  if (!_sbClient || !_sbUser || !sbCanWrite()) return false;
  return !(sbFnApplicaNascoste() && sbFnNascosta(CPTL_WL_FN_NASCOSTA));
}

function cpTlWlAperto() { return _cpTlWl.aperto; }

function _cpTlWlHHMM(min) {
  min = Math.max(0, Math.min(1439, Math.round(min)));
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

function _cpTlWlMin(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* Riga operatore/giorno della timeline, senza filtri, con interventi e commesse calcolati */
function _cpTlWlRiga(nome, g) {
  const d = _cpaDateSettimana(), oggi = _cpaOggiISO();
  const x = _cpTlRaccogli(d).find(r => r.nome === nome && Number(r.g) === g);
  if (!x) return null;
  _cpTlCalcola(x, { indice: _cpaIndiceSottotask(), progetti: _cpTlProgetti(), inGriglia: _cpTlInGriglia() }, oggi);
  return x;
}

/* Ticket proposti per un nuovo worklog: i sottotask della Griglia dell'operatore (prima quelli
   del giorno) e i ticket su cui ha già worklog questa settimana. */
function _cpTlWlTicketProposti(nome, g) {
  const out = [], visti = new Set();
  const add = (key, testo, delGiorno) => {
    if (!key || visti.has(key)) return;
    visti.add(key);
    out.push({ key, testo, delGiorno });
  };
  const celle = _cpaCelleSettimana().celle.filter(c => c.operatore === nome && !c.ferie);
  celle.slice().sort((a, b) => (a.giorno === g ? 0 : 1) - (b.giorno === g ? 0 : 1) || a.giorno - b.giorno).forEach(c => {
    c.voci.forEach(v => {
      if (v.subtask) add(v.subtask.key, CPA_GIORNI[c.giorno] + ' · ' + c.commessa + ' · ' + v.cantiere + (v.attivita ? ' · ' + v.attivita : ''), c.giorno === g);
    });
  });
  _cpTlRaccogli(_cpaDateSettimana()).filter(r => r.nome === nome).forEach(r => {
    r.tickets.forEach(t => add(t.key, t.summary || 'ticket con worklog questa settimana', false));
  });
  return out;
}

/* ---------- Apertura ---------- */

function cpTlWlApri(el) {
  if (!cpTlWlPuo()) return;
  const nome = el.dataset.op, g = Number(el.dataset.g), key = el.dataset.k, id = el.dataset.wl;
  const x = _cpTlWlRiga(nome, g);
  const iv = x && x.interventi.find(v => !v.inCorso && v.w && String(v.w.id) === id && v.t.key === key);
  if (!iv) { showAlertModal('Questo worklog non è più tra quelli letti: usa «↻ Rileggi da Jira» e riprova.'); return; }
  Object.assign(_cpTlWl, {
    aperto: true, modo: 'modifica', nome, g, k: _cpaKey(pwAnno, pwWeek), d: _cpaDateSettimana(),
    t: iv.t, w: iv.w, inizio: iv.inizio, fine: iv.fine, salvando: false,
  });
  _cpTlWlRender();
}

function cpTlWlNuovo(el) {
  if (!cpTlWlPuo()) return;
  const nome = el.dataset.op, g = Number(el.dataset.g);
  const x = _cpTlWlRiga(nome, g);
  const ultimi = x ? x.interventi.filter(v => !v.inCorso) : [];
  const inizio = ultimi.length ? Math.min(1380, Math.max(...ultimi.map(v => v.fine))) : 8 * 60;
  Object.assign(_cpTlWl, {
    aperto: true, modo: 'nuovo', nome, g, k: _cpaKey(pwAnno, pwWeek), d: _cpaDateSettimana(),
    t: null, w: null, inizio, fine: Math.min(1439, inizio + 60), salvando: false,
  });
  _cpTlWlRender();
}

function cpTlWlChiudi() {
  _cpTlWl.aperto = false;
  const m = document.getElementById('cptl-wl-modal');
  if (m) m.style.display = 'none';
}

/* ---------- Form ---------- */

function _cpTlWlRender() {
  const modal = document.getElementById('cptl-wl-modal');
  const root = document.getElementById('cptl-wl-root');
  if (!modal || !root) return;
  modal.style.display = _cpTlWl.aperto ? 'flex' : 'none';
  if (!_cpTlWl.aperto) return;
  const W = _cpTlWl, d = W.d, mod = W.modo === 'modifica';
  const inp = 'border border-slate-300 rounded px-2 py-1 text-sm bg-white';
  const lab = 'block text-[11px] font-semibold text-slate-500 mb-0.5';

  let ticket;
  if (mod) {
    ticket = '<div class="text-sm"><b>' + esc(W.t.key) + '</b>' + (W.t.summary ? ' — ' + esc(W.t.summary) : '') +
      (W.t.url ? ' <a href="' + esc(W.t.url) + '" target="_blank" rel="noopener" class="text-xs text-teal-700 underline whitespace-nowrap">Apri su Jira ↗</a>' : '') + '</div>';
  } else {
    const prop = _cpTlWlTicketProposti(W.nome, W.g);
    const delGiorno = prop.filter(p => p.delGiorno);
    ticket = '<input id="cptl-wl-ticket" list="cptl-wl-tickets" class="' + inp + ' w-full" placeholder="es. AI029-1234" autocomplete="off" value="' +
        esc(delGiorno.length === 1 ? delGiorno[0].key : '') + '" oninput="cpTlWlControlla()">' +
      '<datalist id="cptl-wl-tickets">' + prop.map(p => '<option value="' + esc(p.key) + '">' + esc(p.testo) + '</option>').join('') + '</datalist>' +
      '<div class="text-[11px] text-slate-500 mt-0.5">' + (prop.length ? 'Proposti: i sottotask della Griglia dell\'operatore (prima quelli del giorno) e i ticket su cui ha già worklog.' :
        'Nessun sottotask in Griglia per questo operatore: scrivi la chiave del ticket.') + '</div>';
  }

  let giorni = '';
  for (let g = 0; g < 6; g++) {
    giorni += '<option value="' + g + '"' + (g === W.g ? ' selected' : '') + (d.iso[g] > _cpaOggiISO() ? ' disabled' : '') + '>' + esc(d.label[g]) + '</option>';
  }
  const orig = mod ? '<div class="text-xs text-slate-500 mb-3">Ora su Jira: <b>' + esc(d.label[W.g]) + ' ' + _cpOjOra(W.inizio) + '–' + _cpOjOra(W.fine) +
    '</b> (' + _cpOjDurata(W.fine - W.inizio) + ')</div>' : '';
  const commento = mod ? (W.w.comment || '') : '';

  root.innerHTML =
    '<div style="padding:16px 20px 6px;">' +
      '<div style="font-weight:700;font-size:15px;color:#0f172a;font-family:var(--font-display);">' + (mod ? '✎ Correggi worklog Jira' : '＋ Nuovo worklog Jira') + '</div>' +
      '<div class="text-xs text-slate-500 mt-0.5 mb-3">' + esc(W.nome) + ' · settimana ' + esc(W.k.split('|')[1]) + '/' + esc(W.k.split('|')[0]) + '</div>' +
      orig +
      '<div class="mb-3"><span class="' + lab + '">Ticket</span>' + ticket + '</div>' +
      '<div class="flex flex-wrap gap-3 mb-3">' +
        '<label><span class="' + lab + '">Giorno</span><select id="cptl-wl-giorno" class="' + inp + '" onchange="cpTlWlControlla()">' + giorni + '</select></label>' +
        '<label><span class="' + lab + '">Inizio</span><input id="cptl-wl-inizio" type="time" step="60" class="' + inp + '" value="' + _cpTlWlHHMM(W.inizio) + '" oninput="cpTlWlControlla()"></label>' +
        '<label><span class="' + lab + '">Fine</span><input id="cptl-wl-fine" type="time" step="60" class="' + inp + '" value="' + _cpTlWlHHMM(W.fine) + '" oninput="cpTlWlControlla()"></label>' +
      '</div>' +
      '<label class="block mb-2"><span class="' + lab + '">Commento</span>' +
        '<textarea id="cptl-wl-commento" rows="2" maxlength="2000" class="' + inp + ' w-full" oninput="cpTlWlControlla()">' + esc(commento) + '</textarea></label>' +
      (mod && commento.length >= 299 ? '<div class="text-[11px] text-slate-500 -mt-1 mb-2">Qui il commento è accorciato: se non lo tocchi, su Jira resta quello completo.</div>' : '') +
      '<div id="cptl-wl-check" class="text-xs mb-1" style="min-height:18px;"></div>' +
    '</div>' +
    '<div class="flex flex-wrap items-center gap-2" style="padding:10px 20px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
      (mod ? '<button type="button" onclick="cpTlWlElimina()" class="text-xs px-3 py-1.5 rounded border" style="color:#b91c1c;border-color:#fca5a5;background:#fff;">🗑 Elimina da Jira</button>' : '') +
      '<div class="flex-1"></div>' +
      '<button type="button" onclick="cpTlWlChiudi()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white">Annulla</button>' +
      '<button type="button" id="cptl-wl-salva" onclick="cpTlWlSalva()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#0f766e;">Salva su Jira</button>' +
    '</div>';
  cpTlWlControlla();
}

/* Valori del form + errori (bloccano il salvataggio) e avvisi */
function _cpTlWlLeggi() {
  const W = _cpTlWl, val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const g = Number(val('cptl-wl-giorno'));
  const r = {
    key: W.modo === 'modifica' ? W.t.key : val('cptl-wl-ticket').trim().toUpperCase(),
    g, iso: W.d.iso[g], inizio: _cpTlWlMin(val('cptl-wl-inizio')), fine: _cpTlWlMin(val('cptl-wl-fine')),
    commento: val('cptl-wl-commento'), errori: [], avvisi: [],
  };
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(r.key)) r.errori.push('Indica la chiave del ticket (es. AI029-1234).');
  if (r.inizio == null || r.fine == null) r.errori.push('Indica ora di inizio e di fine.');
  else if (r.fine <= r.inizio) r.errori.push('La fine deve essere dopo l\'inizio (stesso giorno).');
  if (r.errori.length) return r;
  r.durata = r.fine - r.inizio;
  const ora = cpOraRoma();
  if (ora && (r.iso > ora.data || (r.iso === ora.data && r.fine > ora.min))) r.errori.push('Il worklog non può finire nel futuro.');
  if (r.durata > CPTL_WL_LUNGO_MIN) r.avvisi.push('Durata lunga (' + _cpOjDurata(r.durata) + '): controlla gli orari.');
  // Sovrapposizioni con gli altri worklog dell'operatore in quel giorno
  const x = _cpTlWlRiga(W.nome, g);
  (x ? x.interventi : []).forEach(iv => {
    if (iv.inCorso || (W.w && iv.w === W.w) || (W.w && iv.w && iv.w.id && String(iv.w.id) === String(W.w.id))) return;
    if (iv.inizio < r.fine && iv.fine > r.inizio) r.avvisi.push('Si sovrappone a ' + iv.t.key + ' ' + _cpOjOra(iv.inizio) + '–' + _cpOjOra(iv.fine) + '.');
  });
  if (W.modo === 'nuovo' && r.key && !_cpTlWlTicketProposti(W.nome, W.g).some(p => p.key === r.key)) {
    r.avvisi.push('Il ticket non è tra i sottotask o i ticket dell\'operatore di questa settimana.');
  }
  return r;
}

function cpTlWlControlla() {
  const box = document.getElementById('cptl-wl-check'), btn = document.getElementById('cptl-wl-salva');
  if (!box) return;
  const r = _cpTlWlLeggi();
  const righe = [];
  if (r.durata != null && !r.errori.length) righe.push('<span class="text-slate-600">Durata: <b>' + _cpOjDurata(r.durata) + '</b></span>');
  r.errori.forEach(e => righe.push('<span class="text-red-700">✕ ' + esc(e) + '</span>'));
  r.avvisi.forEach(a => righe.push('<span class="text-amber-700">⚠ ' + esc(a) + '</span>'));
  box.innerHTML = righe.join('<br>');
  if (btn) {
    const off = !!r.errori.length || _cpTlWl.salvando;
    btn.disabled = off;
    btn.style.opacity = off ? '.5' : '';
  }
}

/* ---------- Scrittura su Jira ---------- */

async function _cpTlWlInvoca(body) {
  const { data, error } = await _sbClient.functions.invoke(CPTL_WL_FN, { body });
  if (!error) return data || {};
  let j = null;
  try { if (error.context && typeof error.context.clone === 'function') j = await error.context.clone().json(); } catch (_) {}
  return { errore: (j && j.error) || await _cpEdgeErr(error, CPTL_WL_FN), codice: j && j.codice };
}

/* Rilegge da Jira (sola lettura) la settimana dell'operatore e aggiorna la timeline */
async function _cpTlWlRileggiOperatore(nome, k, d, esito) {
  const lett = _cpTl.letture[k];
  if (!lett || _cpTl.inCorso) {
    _cpTl.msg = esito;
    if (!lett && k === _cpaKey(pwAnno, pwWeek)) { await cpTlRileggi(); _cpTl.msg = esito + (_cpTl.msg ? ' ' + _cpTl.msg : ''); }
    cpTlRender();
    return;
  }
  _cpTl.inCorso = true;
  let avviso = '';
  try {
    const r = await _cpTlLeggiWorklog([nome], d);
    if (r.verificati.includes(nome)) {
      lett.worklog[nome] = r.worklog[nome] || {};
      if (!lett.verificati.includes(nome)) lett.verificati.push(nome);
    } else avviso = ' ⚠ ' + r.avvisi.join(' ');
  } catch (e) {
    avviso = ' ⚠ Rilettura non riuscita: ' + (e && e.message ? e.message : e) + '. Usa «↻ Rileggi da Jira».';
  } finally {
    _cpTl.inCorso = false;
    _cpTl.msg = esito + avviso;
    cpTlRender();
  }
}

async function _cpTlWlEsegui(body, esito) {
  const W = _cpTlWl, nome = W.nome, k = W.k, d = W.d;
  W.salvando = true;
  cpTlWlControlla();
  try {
    let res = await _cpTlWlInvoca(body);
    if (res.codice === 'assegnatario_diverso') {
      const ok = await showConfirmAsync(res.errore + '\n\nAggiungerlo comunque?', 'Aggiungi comunque');
      if (!ok) return;
      res = await _cpTlWlInvoca(Object.assign({}, body, { forza: true }));
    }
    if (res.codice === 'cambiato') {
      cpTlWlChiudi();
      showAlertModal(res.errore);
      await _cpTlWlRileggiOperatore(nome, k, d, '⚠ Il worklog era cambiato su Jira: riletto ' + nome + ', controlla e riprova.');
      return;
    }
    if (res.errore || !res.ok) { showAlertModal('Jira non ha accettato la modifica.\n\n' + (res.errore || 'Risposta non valida.')); return; }
    cpTlWlChiudi();
    await _cpTlWlRileggiOperatore(nome, k, d, '✓ ' + esito + ' Per aggiornare «Ore Jira» del Controllo Produzione usa «🔄 Sincronizza da Jira».');
  } finally {
    W.salvando = false;
    cpTlWlControlla();
  }
}

async function cpTlWlSalva() {
  const W = _cpTlWl;
  if (W.salvando || !cpTlWlPuo()) return;
  const r = _cpTlWlLeggi();
  if (r.errori.length) { cpTlWlControlla(); return; }
  const dove = W.d.label[r.g] + ' ' + _cpOjOra(r.inizio) + '–' + _cpOjOra(r.fine) + ' (' + _cpOjDurata(r.durata) + ')';
  const mod = W.modo === 'modifica';
  const commentoCambiato = mod ? r.commento.trim() !== (W.w.comment || '').trim() : !!r.commento.trim();
  let msg;
  if (mod) {
    const prima = W.d.label[W.g] + ' ' + _cpOjOra(W.inizio) + '–' + _cpOjOra(W.fine) + ' (' + _cpOjDurata(W.fine - W.inizio) + ')';
    msg = 'Correggo su Jira il worklog di ' + W.nome + ' su ' + r.key + ':\n\nprima: ' + prima + '\ndopo: ' + dove +
      (commentoCambiato ? '\n\nAnche il commento viene sostituito.' : '');
  } else {
    msg = 'Aggiungo su Jira un worklog su ' + r.key + ' per ' + W.nome + ':\n\n' + dove;
  }
  msg += '\n\nLa stima residua del ticket non cambia.' + (r.avvisi.length ? '\n\n⚠ ' + r.avvisi.join('\n⚠ ') : '');
  if (!await showConfirmAsync(msg, 'Salva su Jira')) return;
  const email = _cpTlEmailPerNome()[W.nome] || '';
  const body = {
    action: mod ? 'update' : 'create', issueKey: r.key, data: r.iso, inizioMin: r.inizio, durataMin: r.durata,
    operatore: W.nome, email,
  };
  if (mod) Object.assign(body, { worklogId: String(W.w.id), atteso: { started: W.w.started, seconds: W.w.seconds } });
  if (commentoCambiato) body.commento = r.commento.trim();
  await _cpTlWlEsegui(body, mod ? 'Worklog di ' + W.nome + ' su ' + r.key + ' corretto su Jira (' + dove + ').'
    : 'Worklog aggiunto su Jira: ' + r.key + ', ' + W.nome + ', ' + dove + '.');
}

async function cpTlWlElimina() {
  const W = _cpTlWl;
  if (W.salvando || !cpTlWlPuo() || W.modo !== 'modifica') return;
  const dove = W.d.label[W.g] + ' ' + _cpOjOra(W.inizio) + '–' + _cpOjOra(W.fine) + ' (' + _cpOjDurata(W.fine - W.inizio) + ')';
  const ok = await showConfirmAsync('Elimino da Jira il worklog di ' + W.nome + ' su ' + W.t.key + ':\n\n' + dove +
    '\n\nLe ore spariscono dal ticket. Da qui non si può annullare: per rimetterlo bisogna aggiungerlo di nuovo.', 'Elimina da Jira');
  if (!ok) return;
  await _cpTlWlEsegui({
    action: 'delete', issueKey: W.t.key, worklogId: String(W.w.id), operatore: W.nome,
    atteso: { started: W.w.started, seconds: W.w.seconds },
  }, 'Worklog di ' + W.nome + ' su ' + W.t.key + ' (' + dove + ') eliminato da Jira.');
}
