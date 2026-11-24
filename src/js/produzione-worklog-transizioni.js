/* ===== CONTROLLO PRODUZIONE: WORKLOG MANCANTI DALLE TRANSIZIONI (cpTw*) ===== */
// Dalla v18.313.0. Il worklog di un sottotask lo crea un'automazione Jira/Tempo quando il
// sottotask esce da IN PROGRESS. Il 23/11/2026 Jira era instabile e le uscite verso DONE non
// l'hanno creato: 25 sottotask chiusi senza ore, ~70 h perse (bonificate a mano il 24/11).
// A ogni «Sincronizza» (squadra o settimana) si leggono i periodi IN PROGRESS di ogni sottotask
// della Griglia e dei ticket delle righe (jira-task-status con "tratti") e si confrontano con i
// worklog: i tratti chiusi che restano scoperti compaiono nel modal #cptw-modal, con la proposta
// di worklog (orari modificabili). Si scrive su Jira solo con «Inserisci», dopo una conferma,
// con jira-worklog-edit (autore = assegnatario del sottotask, activity_log), rileggendo prima i
// worklog del sottotask per non duplicare ore comparse nel frattempo.
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
  voci: [],             // [{ id, key, url, summary, operatore, commessa, squadra, data, inizio, fine, daAutore, aAutore, verso, sel, esito, nota }]
  salvando: false,
  finito: false,
  inseriti: new Set(),  // id già inseriti in questa sessione: Tempo li mostra in ritardo, non riproporli
};

function _cpTwMs(iso) {
  const t = Date.parse(String(iso || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(t) ? null : t;
}

/* Puro. tratti [{ da, a, ... }] (ISO; a = null se ancora aperto), worklogs [{ started, seconds }],
   opz { sogliaMin, attesaMin, oraMs } → [{ inizioMs, fineMs, minuti, tratto }]: le parti dei tratti
   IN PROGRESS chiusi non coperte da nessun worklog del sottotask, lunghe almeno la soglia. */
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
    const da = _cpTwMs(t && t.da), a = _cpTwMs(t && t.a);
    if (da == null || a == null || a <= da || a > limite) return;
    // Rimesso in TO DO (attivato per sbaglio, annullato dall'ufficio o dall'operatore): quel tempo
    // non è lavoro su questo sottotask, e l'automazione stessa cancella il suo worklog.
    if (CPTW_VERSO_ANNULLO.test(String((t && t.verso) || '').trim())) return;
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
   letti sulle righe. → { key: { operatore, commessa, squadra } } */
function _cpTwChiavi(anno, week, blocchi, cells, celle) {
  const out = {};
  const add = (key, c) => { if (key && !out[key]) out[key] = { operatore: c.operatore, commessa: c.commessa, squadra: c.squadra }; };
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

/* Chiamata da pwControlloSyncJira dopo la lettura dei worklog. Sola lettura.
   → { voci, controllati, errore } */
async function cpTwRileva(anno, week, blocchi, cells, celle, isoDates) {
  const chiavi = _cpTwChiavi(anno, week, blocchi, cells, celle);
  const keys = Object.keys(chiavi);
  const res = { voci: [], controllati: keys.length, errore: '' };
  if (!keys.length) return res;
  const ign = _cpTwIgnorati();
  try {
    for (let i = 0; i < keys.length; i += CPTW_MAX_CHIAVI) {
      const { data, error } = await _sbClient.functions.invoke('jira-task-status', {
        body: { subtaskKeys: keys.slice(i, i + CPTW_MAX_CHIAVI), soloSottotask: true, tratti: true },
      });
      if (error) throw new Error(await _cpEdgeErr(error, 'jira-task-status'));
      if (data && data.error) throw new Error(data.error);
      Object.values((data && data.subtasks) || {}).forEach(s => {
        if (!s || !Array.isArray(s.trattiIP)) return;   // Edge Function non aggiornata: niente controllo
        const info = chiavi[s.key] || {};
        cpTwBuchi(s.trattiIP, s.worklogs).forEach(b => {
          const p = _cpOjParti(new Date(b.inizioMs).toISOString());
          const q = _cpOjParti(new Date(b.fineMs).toISOString());
          if (!p || !q || !isoDates.includes(p.data)) return;
          const id = s.key + '|' + b.inizioMs;
          if (ign[id] || _cpTw.inseriti.has(id)) return;
          const fine = q.data === p.data ? q.min : 1439;
          if (fine - p.min < CPTW_SOGLIA_MIN) return;
          res.voci.push({
            id, key: s.key, url: s.url || '', summary: s.summary || '',
            operatore: info.operatore || '', commessa: info.commessa || '', squadra: info.squadra || '',
            data: p.data, inizio: p.min, fine,
            daAutore: b.tratto.daAutore || '', aAutore: b.tratto.aAutore || '', verso: b.tratto.verso || '',
            sel: true, esito: '', nota: '',
          });
        });
      });
    }
  } catch (e) {
    res.errore = (e && e.message) || String(e);
  }
  res.voci.sort((a, b) => (a.data + a.operatore + String(a.inizio).padStart(4, '0')).localeCompare(b.data + b.operatore + String(b.inizio).padStart(4, '0'), 'it'));
  return res;
}

/* Riga per il riepilogo della sincronizzazione */
function cpTwMessaggio(tw) {
  if (!tw) return '';
  if (tw.errore) return '\n\n⚠ Controllo dei tratti IN PROGRESS senza worklog non riuscito: ' + tw.errore + '.';
  if (!tw.voci.length) return '';
  const min = tw.voci.reduce((s, v) => s + (v.fine - v.inizio), 0);
  return '\n\n⏱ ' + tw.voci.length + ' tratt' + (tw.voci.length === 1 ? 'o' : 'i') + ' IN PROGRESS senza worklog su Jira (' + _cpOjDurata(min) + ' in tutto): ' +
    'Jira ha registrato il cambio di stato ma non le ore. ' +
    (cpTlWlPuo() ? 'Li trovi nella finestra «⏱ Worklog mancanti», dietro questo messaggio: controlla gli orari e inseriscili.'
      : 'Li trovi nella finestra «⏱ Worklog mancanti»: per inserirli serve un admin o un responsabile.');
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

function _cpTwRender() {
  const modal = document.getElementById('cptw-modal');
  const root = document.getElementById('cptw-root');
  if (!modal || !root) return;
  modal.style.display = _cpTw.aperto ? 'flex' : 'none';
  if (!_cpTw.aperto) return;
  const T = _cpTw, puo = cpTlWlPuo();
  const scope = T.scope && T.scope.commessa ? esc(T.scope.commessa) + ' · 👥 ' + esc(T.scope.squadra) : 'tutta la settimana';
  let h = '<div style="padding:16px 20px 8px;">' +
    '<div style="font-weight:700;font-size:15px;color:#0f172a;font-family:var(--font-display);">⏱ Worklog mancanti dalle transizioni</div>' +
    '<div class="text-xs text-slate-500 mt-0.5">' + scope + ' · Week ' + T.week + ' ' + T.anno + '</div>' +
    '<div class="text-xs text-slate-600 mt-2" style="line-height:1.5;">Su Jira questi sottotask sono stati in <b>IN PROGRESS</b> ma per quel tempo non c\'è nessun worklog: il cambio di stato è registrato, le ore no. ' +
    'La proposta va dall\'ingresso all\'uscita da IN PROGRESS; se l\'uscita l\'ha fatta l\'ufficio, la fine è l\'ora del clic: correggila se serve.</div></div>';
  h += '<div style="padding:0 20px 8px;overflow:auto;"><table class="w-full text-xs" style="border-collapse:collapse;"><thead><tr class="text-left text-slate-500" style="border-bottom:1px solid #e2e8f0;">' +
    '<th style="padding:4px;"></th><th style="padding:4px;">Giorno</th><th style="padding:4px;">Operatore</th><th style="padding:4px;">Sottotask</th>' +
    '<th style="padding:4px;">Dalle</th><th style="padding:4px;">Alle</th><th style="padding:4px;">Durata</th><th style="padding:4px;">Uscita da IN PROGRESS</th><th style="padding:4px;"></th></tr></thead><tbody>';
  T.voci.forEach((v, i) => {
    const blocc = T.salvando || !!v.esito || !puo;
    const esito = v.esito === 'ok' ? '<span style="color:#047857;">✓ inserito</span>'
      : v.esito === 'ko' ? '<span style="color:#b91c1c;">✕ ' + esc(v.nota) + '</span>'
      : v.esito === 'salto' ? '<span style="color:#b45309;">⚠ ' + esc(v.nota) + '</span>'
      : v.esito === 'corso' ? '<span style="color:#64748b;">⏳ in corso…</span>' : '';
    h += '<tr style="border-bottom:1px solid #f1f5f9;">' +
      '<td style="padding:4px;"><input type="checkbox" data-i="' + i + '"' + (v.sel ? ' checked' : '') + (blocc ? ' disabled' : '') + ' onchange="cpTwSel(this)"></td>' +
      '<td style="padding:4px;white-space:nowrap;">' + esc(_cpTwGiorno(v.data)) + '</td>' +
      '<td style="padding:4px;">' + esc(v.operatore) + '</td>' +
      '<td style="padding:4px;"><a href="' + esc(v.url) + '" target="_blank" rel="noopener" title="' + esc(v.summary) + '" style="color:#2563eb;">' + esc(v.key) + '</a></td>' +
      '<td style="padding:4px;"><input type="time" step="60" data-i="' + i + '" data-c="inizio" value="' + _cpTwHHMM(v.inizio) + '"' + (blocc ? ' disabled' : '') + ' oninput="cpTwOra(this)" class="border border-slate-300 rounded px-1"></td>' +
      '<td style="padding:4px;"><input type="time" step="60" data-i="' + i + '" data-c="fine" value="' + _cpTwHHMM(v.fine) + '"' + (blocc ? ' disabled' : '') + ' oninput="cpTwOra(this)" class="border border-slate-300 rounded px-1"></td>' +
      '<td style="padding:4px;white-space:nowrap;" id="cptw-dur-' + i + '">' + (v.fine > v.inizio ? _cpOjDurata(v.fine - v.inizio) : '—') + '</td>' +
      '<td style="padding:4px;color:#475569;">' + esc((v.verso || '?') + (v.aAutore ? ' · ' + v.aAutore : '')) + '</td>' +
      '<td style="padding:4px;white-space:nowrap;">' + (esito || (blocc ? '' : '<button type="button" data-i="' + i + '" data-help-key="cp-tw-ignora" onclick="cpTwIgnora(this)" style="font-size:11px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:1px 6px;cursor:pointer;">🗄 Ignora</button>')) + '</td>' +
      '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="flex flex-wrap items-center gap-2" style="padding:10px 20px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
    '<div class="text-xs text-slate-500" style="flex:1;min-width:200px;">' +
    (!puo ? 'Solo admin e responsabili possono inserire i worklog.'
      : T.finito ? 'Fatto. Le ore nuove compaiono in «Ore Jira» alla prossima sincronizzazione (Tempo le copia su Jira con qualche minuto di ritardo).'
      : 'I worklog vanno su Jira a nome dell\'assegnatario del sottotask. Prima di ognuno rileggo il sottotask: se nel frattempo ci sono ore in quell\'intervallo lo salto.') + '</div>' +
    '<button type="button" onclick="cpTwChiudi()" style="font-size:12px;font-weight:600;border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;">Chiudi</button>' +
    (puo && T.finito ? '<button type="button" data-help-key="cp-tw-risincronizza" onclick="cpTwRisincronizza()" style="font-size:12px;font-weight:600;border:none;background:#4f46e5;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;">🔄 Risincronizza</button>' : '') +
    (puo && !T.finito ? '<button type="button" id="cptw-inserisci" class="pw-write-action" data-help-key="cp-tw-inserisci" onclick="cpTwInserisci()" style="font-size:12px;font-weight:600;border:none;background:#0d9488;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;"></button>' : '') +
    '</div>';
  root.innerHTML = h;
  _cpTwPiede();
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
  _cpTwRender();
  let fatti = 0;
  for (const v of voci) {
    v.esito = 'corso';
    _cpTwRender();
    try {
      // Rilettura: ore comparse nel frattempo nello stesso intervallo (operatore, collega, Tempo in ritardo)
      const g = await _cpTlWlInvoca({ action: 'giornata', issueKey: v.key });
      if (g.errore || !g.ok) { v.esito = 'ko'; v.nota = g.errore || 'rilettura non riuscita'; continue; }
      const sovr = (g.worklogs || []).some(w => {
        const p = _cpOjParti(w.started);
        if (!p || p.data !== v.data) return false;
        const f = p.min + Math.round((Number(w.seconds) || 0) / 60);
        return p.min < v.fine && f > v.inizio;
      });
      if (sovr) { v.esito = 'salto'; v.nota = 'nel frattempo su Jira ci sono ore in quell\'intervallo'; continue; }
      const r = await _cpTlWlInvoca({
        action: 'create', issueKey: v.key, data: v.data, inizioMin: v.inizio, durataMin: v.fine - v.inizio, operatore: v.operatore,
        commento: 'Ricostruito dalle transizioni di stato (IN PROGRESS ' + _cpTwHHMM(v.inizio) + '-' + _cpTwHHMM(v.fine) + '): Jira non aveva creato il worklog',
      });
      if (r.ok) { v.esito = 'ok'; v.nota = r.avviso || ''; T.inseriti.add(v.id); fatti++; }
      else { v.esito = 'ko'; v.nota = r.errore || 'non riuscito'; }
    } catch (e) {
      v.esito = 'ko'; v.nota = (e && e.message) || String(e);
    }
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

HELP_TEXTS['cp-tw-inserisci'] = 'Scrive SU JIRA un worklog per ogni riga spuntata, con gli orari mostrati (modificabili), a nome dell\'assegnatario del sottotask, come «＋» nella Timeline worklog. Prima di ognuno rilegge il sottotask: se nel frattempo ci sono ore in quell\'intervallo, la riga viene saltata.\n\nServe quando Jira ha registrato il passaggio IN PROGRESS → DONE/IN PENDING ma non ha creato il worklog (succede quando Jira è instabile). Non si annulla con «Indietro»: un worklog sbagliato si toglie dalla Timeline worklog. Riservato ad admin e responsabili.';
HELP_TEXTS['cp-tw-ignora'] = 'Toglie questo tratto dall\'elenco e non lo propone più alle prossime sincronizzazioni, solo in questo browser (es. un tratto già coperto da ore messe su un altro sottotask). Su Jira non cambia niente.';
HELP_TEXTS['cp-tw-risincronizza'] = 'Rilancia «Sincronizza» sulla stessa squadra (o settimana) senza la domanda iniziale, per leggere in «Ore Jira» i worklog appena inseriti. Tempo li copia su Jira con qualche minuto di ritardo: se non compaiono ancora, riprova poco dopo.';
