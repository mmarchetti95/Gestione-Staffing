/* ===== CONTROLLO PRODUZIONE: WORKLOG MANCANTI DALLE TRANSIZIONI (cpTw*) ===== */
// Dalla v18.313.0. Il worklog di un sottotask lo crea un'automazione Jira/Tempo quando il
// sottotask esce da IN PROGRESS. Il 23/11/2026 Jira era instabile e le uscite verso DONE non
// l'hanno creato: 25 sottotask chiusi senza ore, ~70 h perse (bonificate a mano il 24/11).
// A ogni «Sincronizza» (squadra o settimana) si leggono i periodi IN PROGRESS dei sottotask
// della Griglia e dei ticket delle righe (jira-task-status con "tratti") e si cercano le ore
// perse. Si scrive su Jira solo con «Inserisci», dopo una conferma, con jira-worklog-edit
// (autore = assegnatario del sottotask, activity_log).
// Regole (v18.319.0, dopo i falsi allarmi del 25/11 su worklog corretti a mano):
//  1. un tratto la cui uscita ha creato il worklog (tratto.wlUscita, dallo storico del tempo
//     speso) non si propone MAI: se oggi le ore sono diverse le ha corrette qualcuno, apposta;
//  2. dal tratto si tolgono tutti i worklog dell'operatore, anche su altri sottotask: se in
//     quell'orario lavorava su un altro sottotask il tempo non è perso;
//  3. prima di «Inserisci» si rileggono da Jira il sottotask e la giornata dell'operatore.
// Il calcolo dei buchi (cpTwBuchi) è puro: tratti e worklog in, intervalli scoperti out.

const CPTW_SOGLIA_MIN = 5;      // buchi più corti: arrotondamenti di Tempo, clic veloci
const CPTW_ATTESA_MIN = 15;     // tratti chiusi da meno: Tempo può ancora scrivere il worklog
const CPTW_MAX_CHIAVI = 450;    // jira-task-status ne accetta 500 per chiamata
const CPTW_IGN_LS = 'cp_tw_ignorati_v1';
const CPTW_VERSO_ANNULLO = /^(to do|created)$/i;

let _cpTw = {
  aperto: false,
  scope: null,          // { commessa, squadra } della sincronizzazione (null = settimana intera)
  anno: null, week: null,
  voci: [],             // [{ id, key, url, summary, operatore, email, commessa, squadra, data, inizio, fine, trDa, trA, presenti, daAutore, aAutore, verso, sel, esito, nota }]
  salvando: false,
  finito: false,
  inseriti: new Set(),  // id già inseriti in questa sessione: Tempo li mostra in ritardo, non riproporli
};

function _cpTwMs(iso) {
  const t = Date.parse(String(iso || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(t) ? null : t;
}

/* Puro. tratti [{ da, a, verso, wlUscita }] (ISO; a = null se ancora aperto), worklogs [{ started, seconds }]
   = tutti quelli da sottrarre (del sottotask e dell'operatore su altri sottotask),
   opz { sogliaMin, attesaMin, oraMs } → [{ inizioMs, fineMs, minuti, tratto }]: le parti dei tratti
   IN PROGRESS chiusi, la cui uscita NON ha creato il worklog, non coperte da nessun worklog,
   lunghe almeno la soglia. */
function cpTwBuchi(tratti, worklogs, opz) {
  opz = opz || {};
  const soglia = (opz.sogliaMin == null ? CPTW_SOGLIA_MIN : opz.sogliaMin) * 60000;
  const limite = (opz.oraMs == null ? Date.now() : opz.oraMs) - (opz.attesaMin == null ? CPTW_ATTESA_MIN : opz.attesaMin) * 60000;
  const wl = (worklogs || []).map(w => {
    const s = _cpTwMs(w && w.started);
    return s == null ? null : [s, s + (Number(w.seconds) || 0) * 1000];
  }).filter(Boolean);
  const out = [];
  (tratti || []).forEach(t => {
    if (!t || t.wlUscita === true) return;   // l'automazione il worklog l'ha creato: ciò che c'è oggi è voluto
    const da = _cpTwMs(t.da), a = _cpTwMs(t.a);
    if (da == null || a == null || a <= da || a > limite) return;
    // Rimesso in TO DO (attivato per sbaglio, annullato dall'ufficio o dall'operatore): quel tempo
    // non è lavoro su questo sottotask, e l'automazione stessa cancella il suo worklog.
    if (CPTW_VERSO_ANNULLO.test(String(t.verso || '').trim())) return;
    let pezzi = [[da, a]];
    wl.forEach(([s, e]) => {
      pezzi = pezzi.flatMap(([x, y]) => (e <= x || s >= y) ? [[x, y]]
        : [[x, Math.min(s, y)], [Math.max(e, x), y]].filter(([p, q]) => q > p));
    });
    pezzi.forEach(([x, y]) => {
      if (y - x >= soglia) out.push({ inizioMs: x, fineMs: y, minuti: Math.round((y - x) / 60000), tratto: t });
    });
  });
  return out;
}

function _cpTwIgnorati() {
  try { return JSON.parse(localStorage.getItem(CPTW_IGN_LS) || '{}') || {}; } catch (_) { return {}; }
}
function _cpTwIgnoraSalva(id) {
  try {
    const m = _cpTwIgnorati();
    m[id] = Date.now();
    // Si tengono gli ultimi 500: bastano per le settimane che si risincronizzano
    const ids = Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 500);
    const out = {};
    ids.forEach(k => { out[k] = m[k]; });
    localStorage.setItem(CPTW_IGN_LS, JSON.stringify(out));
  } catch (_) { /* solo comodità di questo browser */ }
}

/* Sottotask da controllare: quelli della Griglia (giornalieri del giorno o settimanali) e i ticket
   letti sulle righe. → { key: { operatore, email, commessa, squadra } } */
function _cpTwChiavi(anno, week, blocchi, cells, celle) {
  const out = {};
  const add = (key, c) => { if (key && !out[key]) out[key] = { operatore: c.operatore, email: c.email || '', commessa: c.commessa, squadra: c.squadra }; };
  const mappe = {};
  (blocchi || []).forEach(bc => { if (bc && bc.commessa) mappe[bc.commessa] = pwJiraSubtaskMappa(bc, anno, week); });
  const ctx = cpCtxTicketCommessa();
  (cells || []).forEach(c => {
    Object.values(mappe[c.commessa] || {}).forEach(e => {
      if (e && e.key && e.operatore === c.operatore && (e.giorno == null || Number(e.giorno) === c.giorno)) add(e.key, c);
    });
    const cell = celle[c.k] || {};
    cpTicketsPropri(cell.jira_tickets, c.commessa, c.operatore, c.giorno, ctx).forEach(t => { if (t && t.key) add(t.key, c); });
  });
  return out;
}

/* Tutti i worklog di ogni operatore nella settimana, su qualunque sottotask e commessa, dalla
   lettura appena fatta da «Sincronizza» (ogni riga porta tutti i worklog del giorno
   dell'operatore: si uniscono per id). → { operatore: [{ key, started, seconds }] } */
function _cpTwWorklogOperatori(cells, celle) {
  const out = {}, visti = {};
  (cells || []).forEach(c => {
    const lista = out[c.operatore] || (out[c.operatore] = []);
    const v = visti[c.operatore] || (visti[c.operatore] = new Set());
    ((celle[c.k] || {}).jira_tickets || []).forEach(t => {
      (t && Array.isArray(t.worklogs) ? t.worklogs : []).forEach(w => {
        const id = (w && w.id) || (t.key + '|' + (w && w.started));
        if (!w || v.has(id)) return;
        v.add(id);
        lista.push({ key: t.key, started: w.started, seconds: Number(w.seconds) || 0 });
      });
    });
  });
  return out;
}

/* Ore già presenti (worklog in [daMs, aMs]) ritagliate sul periodo, in minuti del giorno */
function _cpTwPresenti(worklogs, daMs, aMs) {
  return (worklogs || []).map(w => {
    const s0 = _cpTwMs(w.started);
    if (s0 == null) return null;
    const e0 = s0 + (Number(w.seconds) || 0) * 1000;
    if (e0 <= daMs || s0 >= aMs) return null;
    const x = _cpOjParti(new Date(Math.max(s0, daMs)).toISOString());
    const y = _cpOjParti(new Date(Math.min(e0, aMs)).toISOString());
    return x && y ? { key: w.key, inizio: x.min, fine: y.data === x.data ? y.min : 1439 } : null;
  }).filter(Boolean).sort((m, n) => m.inizio - n.inizio);
}

/* Chiamata da pwControlloSyncJira dopo la lettura dei worklog. Sola lettura.
   → { voci, controllati, errore } */
async function cpTwRileva(anno, week, blocchi, cells, celle, isoDates) {
  const chiavi = _cpTwChiavi(anno, week, blocchi, cells, celle);
  const keys = Object.keys(chiavi);
  const res = { voci: [], controllati: keys.length, errore: '' };
  if (!keys.length) return res;
  const ign = _cpTwIgnorati();
  const wlOp = _cpTwWorklogOperatori(cells, celle);
  const parti = [];
  for (let i = 0; i < keys.length; i += CPTW_MAX_CHIAVI) parti.push(keys.slice(i, i + CPTW_MAX_CHIAVI));
  try {
    const risposte = await Promise.all(parti.map(async parte => {
      const { data, error } = await _sbClient.functions.invoke('jira-task-status', {
        body: { subtaskKeys: parte, soloSottotask: true, tratti: true },
      });
      if (error) throw new Error(await _cpEdgeErr(error, 'jira-task-status'));
      if (data && data.error) throw new Error(data.error);
      return data;
    }));
    risposte.forEach(data => Object.values((data && data.subtasks) || {}).forEach(s => {
      if (!s || !Array.isArray(s.trattiIP) || !s.trattiIP.length) return;   // mai attivato, o Edge Function vecchia
      const info = chiavi[s.key] || {};
      const propri = (s.worklogs || []).map(w => ({ key: s.key, started: w.started, seconds: w.seconds }));
      const tutti = propri.concat((wlOp[info.operatore] || []).filter(w => w.key !== s.key));
      cpTwBuchi(s.trattiIP, tutti).forEach(b => {
        const p = _cpOjParti(new Date(b.inizioMs).toISOString());
        const q = _cpOjParti(new Date(b.fineMs).toISOString());
        if (!p || !q || !isoDates.includes(p.data)) return;
        const id = s.key + '|' + b.inizioMs;
        if (ign[id] || _cpTw.inseriti.has(id)) return;
        const fine = q.data === p.data ? q.min : 1439;
        if (fine - p.min < CPTW_SOGLIA_MIN) return;
        const trDa = _cpOjParti(b.tratto.da), trA = _cpOjParti(b.tratto.a);
        res.voci.push({
          id, key: s.key, url: s.url || '', summary: s.summary || '',
          operatore: info.operatore || '', email: info.email || '', commessa: info.commessa || '', squadra: info.squadra || '',
          data: p.data, inizio: p.min, fine,
          trDa: trDa && trDa.data === p.data ? trDa.min : null, trA: trA && trA.data === p.data ? trA.min : null,
          presenti: _cpTwPresenti(tutti, _cpTwMs(b.tratto.da), _cpTwMs(b.tratto.a)),
          daAutore: b.tratto.daAutore || '', aAutore: b.tratto.aAutore || '', verso: b.tratto.verso || '',
          sel: true, esito: '', nota: '',
        });
      });
    }));
  } catch (e) {
    res.errore = (e && e.message) || String(e);
  }
  res.voci.sort((a, b) => (a.data + a.operatore + String(a.inizio).padStart(4, '0')).localeCompare(b.data + b.operatore + String(b.inizio).padStart(4, '0'), 'it'));
  return res;
}

/* Riga per il riepilogo della sincronizzazione */
function cpTwMessaggio(tw) {
  if (!tw) return '';
  if (tw.errore) return '\n\n⚠ Controllo delle ore non registrate da Jira non riuscito: ' + tw.errore + '.';
  if (!tw.voci.length) return '';
  const min = tw.voci.reduce((s, v) => s + (v.fine - v.inizio), 0);
  const n = tw.voci.length;
  return '\n\n⏱ ' + n + (n === 1 ? ' periodo di lavoro senza ore' : ' periodi di lavoro senza ore') + ' su Jira (' + _cpOjDurata(min) + ' in tutto): ' +
    'il sottotask è stato chiuso ma Jira non ha creato il worklog. ' +
    (cpTlWlPuo() ? 'Li trovi nella finestra «⏱ Ore non registrate da Jira», dietro questo messaggio.'
      : 'Li trovi nella finestra «⏱ Ore non registrate da Jira»: per inserirli serve un admin o un responsabile.');
}

function cpTwApri(tw, scope, anno, week) {
  if (!tw || !tw.voci.length) return;
  Object.assign(_cpTw, { aperto: true, scope: scope || null, anno, week, voci: tw.voci, salvando: false, finito: false });
  _cpTwRender();
}

function cpTwChiudi() {
  if (_cpTw.salvando) return;
  _cpTw.aperto = false;
  const m = document.getElementById('cptw-modal');
  if (m) m.style.display = 'none';
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_cpTw.aperto) return;
  const mr = document.getElementById('modal-root');
  if (mr && mr.children.length) return;   // c'è una conferma/avviso aperto sopra
  cpTwChiudi();
});

function _cpTwHHMM(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function _cpTwDaHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function _cpTwGiorno(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][d.getUTCDay()] + ' ' + iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

function cpTwSel(el) {
  const v = _cpTw.voci[Number(el.getAttribute('data-i'))];
  if (!v || _cpTw.salvando) return;
  v.sel = !!el.checked;
  _cpTwRender();
}
function cpTwOra(el) {
  const v = _cpTw.voci[Number(el.getAttribute('data-i'))];
  if (!v || _cpTw.salvando) return;
  const m = _cpTwDaHHMM(el.value);
  if (m == null) return;
  v[el.getAttribute('data-c') === 'fine' ? 'fine' : 'inizio'] = m;
  const d = document.getElementById('cptw-dur-' + el.getAttribute('data-i'));
  if (d) d.textContent = v.fine > v.inizio ? _cpOjDurata(v.fine - v.inizio) : '—';
  _cpTwPiede();
}
async function cpTwIgnora(el) {
  const i = Number(el.getAttribute('data-i')), v = _cpTw.voci[i];
  if (!v || _cpTw.salvando) return;
  if (!await showConfirmAsync('Ignorare il tratto ' + _cpTwHHMM(v.inizio) + '–' + _cpTwHHMM(v.fine) + ' di ' + v.key + ' (' + (v.operatore || '') + ')?\n\n' +
    'Non verrà più proposto alle prossime sincronizzazioni, solo in questo browser. Su Jira non cambia niente.', 'Ignora')) return;
  _cpTwIgnoraSalva(v.id);
  _cpTw.voci.splice(i, 1);
  if (!_cpTw.voci.length) { cpTwChiudi(); return; }
  _cpTwRender();
}

function _cpTwValide() {
  return _cpTw.voci.filter(v => v.sel && !v.esito && v.fine > v.inizio);
}

function _cpTwPiede() {
  const btn = document.getElementById('cptw-inserisci');
  if (!btn) return;
  const n = _cpTwValide().length;
  btn.disabled = !n || _cpTw.salvando;
  btn.style.opacity = btn.disabled ? '.5' : '';
  btn.textContent = 'Inserisci ' + n + ' worklog su Jira';
}

/* «Cosa è successo su Jira» di una riga: il periodo IN PROGRESS e le ore che ci sono già dentro */
function _cpTwSpiegazione(v) {
  const periodo = (v.trDa != null ? _cpTwHHMM(v.trDa) : '…') + ' → ' + (v.trA != null ? _cpTwHHMM(v.trA) : '…');
  let h = '<div>▶ In corso ' + periodo + ', chiuso in <b>' + esc(v.verso || '?') + '</b>' + (v.aAutore ? ' da ' + esc(v.aAutore) : '') + '</div>';
  h += '<div style="color:#b45309;">✕ Jira non ha creato il worklog alla chiusura</div>';
  if (v.presenti && v.presenti.length) {
    h += '<div style="color:#64748b;">Già registrate in quel periodo: ' + v.presenti.map(x =>
      _cpTwHHMM(x.inizio) + '–' + _cpTwHHMM(x.fine) + ' ' + (x.key === v.key ? 'su questo sottotask' : 'su ' + esc(x.key))).join(', ') +
      '. Si propone solo il resto.</div>';
  } else {
    h += '<div style="color:#64748b;">Nessuna ora registrata in quel periodo, su nessun sottotask.</div>';
  }
  return h;
}

function _cpTwRender() {
  const modal = document.getElementById('cptw-modal');
  const root = document.getElementById('cptw-root');
  if (!modal || !root) return;
  modal.style.display = _cpTw.aperto ? 'flex' : 'none';
  if (!_cpTw.aperto) return;
  const T = _cpTw, puo = cpTlWlPuo();
  const scope = T.scope && T.scope.commessa ? esc(T.scope.commessa) + ' · 👥 ' + esc(T.scope.squadra) : 'tutta la settimana';
  let h = '<div style="padding:16px 20px 8px;">' +
    '<div style="font-weight:700;font-size:15px;color:#0f172a;font-family:var(--font-display);">⏱ Ore non registrate da Jira</div>' +
    '<div class="text-xs text-slate-500 mt-0.5">' + scope + ' · Week ' + T.week + ' ' + T.anno + '</div>' +
    '<div class="text-xs text-slate-600 mt-2" style="line-height:1.55;">' +
    'Quando un operatore chiude un sottotask (esce da <b>IN PROGRESS</b>), Jira crea da solo il worklog con le ore. ' +
    'Per queste righe <b>non l\'ha fatto</b> (succede quando Jira è instabile) e in quell\'orario l\'operatore non ha ore su nessun altro sottotask: quel tempo oggi manca.</div>' +
    '<div class="text-xs text-slate-500 mt-1" style="line-height:1.55;">Qui non compaiono le chiusure in cui il worklog Jira l\'aveva creato, anche se poi è stato corretto a mano, né gli orari già coperti da altri worklog dell\'operatore. ' +
    'Se l\'ha chiuso l\'ufficio, la fine proposta è l\'ora del clic: correggila se serve.</div></div>';
  h += '<div style="padding:0 20px 8px;overflow:auto;"><table class="w-full text-xs" style="border-collapse:collapse;"><thead><tr class="text-left text-slate-500" style="border-bottom:1px solid #e2e8f0;">' +
    '<th style="padding:4px;"></th><th style="padding:4px;">Giorno</th><th style="padding:4px;">Operatore</th><th style="padding:4px;">Sottotask</th>' +
    '<th style="padding:4px;">Ore da inserire</th><th style="padding:4px;">Cosa è successo su Jira</th><th style="padding:4px;"></th></tr></thead><tbody>';
  T.voci.forEach((v, i) => {
    const blocc = T.salvando || !!v.esito || !puo;
    const esito = v.esito === 'ok' ? '<span style="color:#047857;">✓ inserito' + (v.nota ? ' · ' + esc(v.nota) : '') + '</span>'
      : v.esito === 'ko' ? '<span style="color:#b91c1c;">✕ ' + esc(v.nota) + '</span>'
      : v.esito === 'salto' ? '<span style="color:#b45309;">⚠ saltato: ' + esc(v.nota) + '</span>'
      : v.esito === 'corso' ? '<span style="color:#64748b;">⏳ in corso…</span>' : '';
    h += '<tr style="border-bottom:1px solid #f1f5f9;vertical-align:top;">' +
      '<td style="padding:6px 4px;"><input type="checkbox" data-i="' + i + '"' + (v.sel ? ' checked' : '') + (blocc ? ' disabled' : '') + ' onchange="cpTwSel(this)"></td>' +
      '<td style="padding:6px 4px;white-space:nowrap;">' + esc(_cpTwGiorno(v.data)) + '</td>' +
      '<td style="padding:6px 4px;">' + esc(v.operatore) + '</td>' +
      '<td style="padding:6px 4px;"><a href="' + esc(v.url) + '" target="_blank" rel="noopener" title="' + esc(v.summary) + '" style="color:#2563eb;">' + esc(v.key) + '</a></td>' +
      '<td style="padding:6px 4px;white-space:nowrap;">' +
      '<input type="time" step="60" data-i="' + i + '" data-c="inizio" value="' + _cpTwHHMM(v.inizio) + '"' + (blocc ? ' disabled' : '') + ' oninput="cpTwOra(this)" class="border border-slate-300 rounded px-1"> – ' +
      '<input type="time" step="60" data-i="' + i + '" data-c="fine" value="' + _cpTwHHMM(v.fine) + '"' + (blocc ? ' disabled' : '') + ' oninput="cpTwOra(this)" class="border border-slate-300 rounded px-1">' +
      '<div style="margin-top:2px;"><b id="cptw-dur-' + i + '">' + (v.fine > v.inizio ? _cpOjDurata(v.fine - v.inizio) : '—') + '</b></div></td>' +
      '<td style="padding:6px 4px;color:#475569;line-height:1.45;">' + _cpTwSpiegazione(v) + (esito ? '<div style="margin-top:2px;">' + esito + '</div>' : '') + '</td>' +
      '<td style="padding:6px 4px;white-space:nowrap;">' + (blocc ? '' : '<button type="button" data-i="' + i + '" data-help-key="cp-tw-ignora" onclick="cpTwIgnora(this)" style="font-size:11px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:1px 6px;cursor:pointer;">🗄 Ignora</button>') + '</td>' +
      '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="flex flex-wrap items-center gap-2" style="padding:10px 20px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
    '<div class="text-xs text-slate-500" style="flex:1;min-width:200px;">' +
    (!puo ? 'Solo admin e responsabili possono inserire i worklog.'
      : T.finito ? 'Fatto. Le ore nuove compaiono in «Ore Jira» alla prossima sincronizzazione (Tempo le copia su Jira con qualche minuto di ritardo).'
      : 'I worklog vanno su Jira a nome dell\'assegnatario del sottotask. Prima di scrivere rileggo da Jira il sottotask e la giornata dell\'operatore: se nel frattempo in quell\'orario ci sono ore, su qualunque sottotask, la riga viene saltata.') + '</div>' +
    '<button type="button" onclick="cpTwChiudi()" style="font-size:12px;font-weight:600;border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;">Chiudi</button>' +
    (puo && T.finito ? '<button type="button" data-help-key="cp-tw-risincronizza" onclick="cpTwRisincronizza()" style="font-size:12px;font-weight:600;border:none;background:#4f46e5;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;">🔄 Risincronizza</button>' : '') +
    (puo && !T.finito ? '<button type="button" id="cptw-inserisci" class="pw-write-action" data-help-key="cp-tw-inserisci" onclick="cpTwInserisci()" style="font-size:12px;font-weight:600;border:none;background:#0d9488;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;"></button>' : '') +
    '</div>';
  root.innerHTML = h;
  _cpTwPiede();
}

/* Rilettura prima di scrivere: worklog di ogni operatore nei giorni delle righe (su qualunque
   sottotask, una sola chiamata) e di ogni sottotask (in parallelo).
   → { perOp: { 'email|data': [{ key, inizio, fine }] }, perKey: { key: { ok, errore, wl: [{ data, inizio, fine }] } }, errori: { email: msg } } */
async function _cpTwRileggi(voci) {
  const emails = [...new Set(voci.map(v => (v.email || '').toLowerCase()).filter(Boolean))];
  const date = voci.map(v => v.data).sort();
  const intervallo = (started, seconds) => {
    const p = _cpOjParti(started);
    return p ? { data: p.data, inizio: p.min, fine: p.min + Math.round((Number(seconds) || 0) / 60) } : null;
  };
  const [giornate, sottotask] = await Promise.all([
    emails.length ? _sbClient.functions.invoke('jira-sync-worklogs', { body: { emails, startDate: date[0], endDate: date[date.length - 1] } }) : Promise.resolve({ data: { results: {} } }),
    Promise.all([...new Set(voci.map(v => v.key))].map(async key => [key, await _cpTlWlInvoca({ action: 'giornata', issueKey: key })])),
  ]);
  if (giornate.error) throw new Error(await _cpEdgeErr(giornate.error, 'jira-sync-worklogs'));
  const perOp = {};
  Object.entries((giornate.data && giornate.data.results) || {}).forEach(([email, giorni]) => {
    Object.entries(giorni || {}).forEach(([data, g]) => {
      const lista = perOp[email.toLowerCase() + '|' + data] = [];
      ((g && g.tickets) || []).forEach(t => (t.worklogs || []).forEach(w => {
        const x = intervallo(w.started, w.seconds);
        if (x) lista.push({ key: t.key, inizio: x.inizio, fine: x.fine });
      }));
    });
  });
  const errori = {};
  Object.entries((giornate.data && giornate.data.errors) || {}).forEach(([email, msg]) => { errori[email.toLowerCase()] = String(msg || 'errore'); });
  const perKey = {};
  sottotask.forEach(([key, g]) => {
    perKey[key] = (g && g.ok && !g.errore)
      ? { ok: true, wl: (g.worklogs || []).map(w => intervallo(w.started, w.seconds)).filter(Boolean) }
      : { ok: false, errore: (g && g.errore) || 'rilettura non riuscita' };
  });
  return { perOp, perKey, errori };
}

async function cpTwInserisci() {
  const T = _cpTw;
  if (T.salvando || !cpTlWlPuo()) return;
  const voci = _cpTwValide();
  if (!voci.length) return;
  const errOra = voci.find(v => v.fine <= v.inizio);
  if (errOra) { showAlertModal(errOra.key + ': la fine deve essere dopo l\'inizio.'); return; }
  const min = voci.reduce((s, v) => s + (v.fine - v.inizio), 0);
  const ok = await showConfirmAsync('Inserisco su Jira ' + voci.length + ' worklog (' + _cpOjDurata(min) + ' in tutto):\n\n• ' +
    voci.map(v => v.key + ' ' + v.operatore + ', ' + _cpTwGiorno(v.data) + ' ' + _cpTwHHMM(v.inizio) + '–' + _cpTwHHMM(v.fine)).join('\n• ') +
    '\n\nA nome dell\'assegnatario del sottotask; la stima residua non cambia. Da qui non si torna indietro con «Indietro»: per togliere un worklog usa la Timeline worklog.', 'Inserisci');
  if (!ok || !T.aperto) return;
  T.salvando = true;
  voci.forEach(v => { v.esito = 'corso'; });
  _cpTwRender();
  let fatti = 0;
  let letti;
  try {
    letti = await _cpTwRileggi(voci);
  } catch (e) {
    voci.forEach(v => { v.esito = ''; });
    T.salvando = false;
    _cpTwRender();
    showAlertModal('Non riesco a rileggere i worklog da Jira, non ho scritto niente: ' + ((e && e.message) || e));
    return;
  }
  for (const v of voci) {
    try {
      const sub = letti.perKey[v.key];
      if (!sub || !sub.ok) { v.esito = 'ko'; v.nota = (sub && sub.errore) || 'rilettura non riuscita'; continue; }
      const errOp = letti.errori[(v.email || '').toLowerCase()];
      if (errOp) { v.esito = 'ko'; v.nota = 'giornata dell\'operatore non riletta (' + errOp + ')'; continue; }
      const giorno = (letti.perOp[(v.email || '').toLowerCase() + '|' + v.data] || []);
      const propri = sub.wl.filter(w => w.data === v.data).map(w => ({ key: v.key, inizio: w.inizio, fine: w.fine }));
      const sovr = propri.concat(giorno).find(w => w.inizio < v.fine && w.fine > v.inizio);
      if (sovr) {
        v.esito = 'salto';
        v.nota = 'su Jira ci sono già ore ' + _cpTwHHMM(sovr.inizio) + '–' + _cpTwHHMM(Math.min(sovr.fine, 1439)) + (sovr.key === v.key ? ' su questo sottotask' : ' su ' + sovr.key);
        _cpTwRender();
        continue;
      }
      _cpTwRender();
      const r = await _cpTlWlInvoca({
        action: 'create', issueKey: v.key, data: v.data, inizioMin: v.inizio, durataMin: v.fine - v.inizio, operatore: v.operatore,
        commento: 'Ricostruito dalle transizioni di stato (IN PROGRESS ' + _cpTwHHMM(v.inizio) + '-' + _cpTwHHMM(v.fine) + '): Jira non aveva creato il worklog',
      });
      if (r.ok) {
        v.esito = 'ok'; v.nota = r.avviso || ''; T.inseriti.add(v.id); fatti++;
        // Le righe successive dello stesso operatore non devono sovrapporsi a questa
        const k = (v.email || '').toLowerCase() + '|' + v.data;
        (letti.perOp[k] || (letti.perOp[k] = [])).push({ key: v.key, inizio: v.inizio, fine: v.fine });
      } else { v.esito = 'ko'; v.nota = r.errore || 'non riuscito'; }
    } catch (e) {
      v.esito = 'ko'; v.nota = (e && e.message) || String(e);
    }
    _cpTwRender();
  }
  T.salvando = false;
  T.finito = true;
  _cpTwRender();
  if (typeof undoToast === 'function') undoToast('⏱ ' + fatti + '/' + voci.length + ' worklog inseriti su Jira');
}

function cpTwRisincronizza() {
  const s = _cpTw.scope;
  cpTwChiudi();
  if (s && s.commessa) pwControlloSyncJira(s.commessa, s.squadra, null, { senzaConferma: true });
  else pwControlloSyncJira(null, null, null, { senzaConferma: true });
}

HELP_TEXTS['cp-tw-inserisci'] = 'Scrive SU JIRA un worklog per ogni riga spuntata, con gli orari mostrati (modificabili), a nome dell\'assegnatario del sottotask, come «＋» nella Timeline worklog. Prima di scrivere rilegge da Jira il sottotask e la giornata dell\'operatore: se in quell\'intervallo ci sono già ore, su qualunque sottotask, la riga viene saltata (niente doppioni).\n\nServe quando Jira ha registrato la chiusura del sottotask (IN PROGRESS → DONE/IN PENDING) ma non ha creato il worklog (succede quando Jira è instabile). Le chiusure in cui il worklog era stato creato e poi corretto a mano non vengono mai proposte. Non si annulla con «Indietro»: un worklog sbagliato si toglie dalla Timeline worklog. Riservato ad admin e responsabili.';
HELP_TEXTS['cp-tw-ignora'] = 'Toglie questo tratto dall\'elenco e non lo propone più alle prossime sincronizzazioni, solo in questo browser (es. un tratto già coperto da ore messe su un altro sottotask). Su Jira non cambia niente.';
HELP_TEXTS['cp-tw-risincronizza'] = 'Rilancia «Sincronizza» sulla stessa squadra (o settimana) senza la domanda iniziale, per leggere in «Ore Jira» i worklog appena inseriti. Tempo li copia su Jira con qualche minuto di ritardo: se non compaiono ancora, riprova poco dopo.';
