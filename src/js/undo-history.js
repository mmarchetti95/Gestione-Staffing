/* ==================== INDIETRO / AVANTI · MOTORE COMUNE ====================
   Cronologia annulla/ripristina condivisa da Pianificazione settimanale (weekly-undo.js) e
   Dashboard (dashboard-undo.js): ognuna crea la sua con undoCreaCronologia() e ha la sua pila.
   Non si strumentano le singole azioni: ogni modulo chiama registra() dal suo punto unico di
   salvataggio e fornisce snapshot(), cioè lo stato attuale come Map chiave -> { j: json, ... }
   a grana fine (una settimana, un operatore, una chiave di stato). Ad ogni salvataggio il
   motore confronta lo snapshot con l'ultimo noto e mette nella pila solo le chiavi cambiate,
   con il json prima e dopo. Salvataggi ravvicinati (es. Auto-pianifica che salva ferie +
   griglia) diventano un solo passo (debounce).
   - Pull da Supabase / rilettura locale: il modulo chiama flush() PRIMA di sostituire i dati
     (la modifica locale in attesa diventa un passo) e rebase() DOPO (nessun passo): le
     modifiche dei colleghi non si annullano.
   - Se una chiave da ripristinare è cambiata dopo il passo (un collega), si chiede conferma.
   - flush/rebase passano da una coda: gli snapshot possono essere asincroni (Dashboard).
   - Solo in memoria, per sessione: con un refresh la cronologia riparte da zero.
   Opzioni: snapshot(), scrivi(changes, campo) che scrive c[campo] per ogni change e salva,
   label(changes), dove(changes) per il messaggio di conflitto, dopo(passo) per ridisegnare,
   attiva() = schermata visibile (scorciatoie), btnUndo/btnRedo = id dei bottoni. */

const _undoIstanze = [];

function undoCreaCronologia(o) {
  const max = o.max || 50;
  const debounce = o.debounce || 250;
  const st = { base: null, undo: [], redo: [], timer: null, applicando: false, occupato: false, coda: Promise.resolve() };

  function inCoda(fn) {
    const p = st.coda.then(fn);
    st.coda = p.catch(e => console.warn('Indietro/Avanti:', e));
    return p;
  }

  function diff(prima, dopo) {
    const changes = [];
    new Set([...prima.keys(), ...dopo.keys()]).forEach(k => {
      const a = prima.get(k), b = dopo.get(k);
      const ja = a ? a.j : undefined, jb = b ? b.j : undefined;
      if (ja !== jb) changes.push({ k, info: a || b, prima: ja, dopo: jb });
    });
    return changes;
  }

  function registra() {
    clearTimeout(st.timer);
    st.timer = setTimeout(flush, debounce);
  }

  function flush() {
    clearTimeout(st.timer);
    st.timer = null;
    return inCoda(async () => {
      const cur = await o.snapshot();
      const base = st.base;
      st.base = cur;
      if (!base || st.applicando) return;
      const changes = diff(base, cur);
      if (!changes.length) return;
      st.undo.push({ ts: Date.now(), label: o.label(changes), changes });
      if (st.undo.length > max) st.undo.shift();
      st.redo = [];
      updateUI();
    });
  }

  function rebase() {
    clearTimeout(st.timer);
    st.timer = null;
    return inCoda(async () => { st.base = await o.snapshot(); updateUI(); });
  }

  async function applica(daPila, aPila, verso) {
    if (st.occupato) return;
    st.occupato = true;
    try { await applicaPasso(daPila, aPila, verso); }
    finally { st.occupato = false; }
  }

  async function applicaPasso(daPila, aPila, verso) {
    await flush();
    const passo = daPila[daPila.length - 1];
    if (!passo) return;
    if (!sbGuardWrite()) return;
    const atteso = verso === 'undo' ? 'dopo' : 'prima';
    const nuovo  = verso === 'undo' ? 'prima' : 'dopo';
    const cur = await o.snapshot();
    const cambiate = passo.changes.filter(c => { const e = cur.get(c.k); return (e ? e.j : undefined) !== c[atteso]; });
    if (cambiate.length) {
      const msg = (verso === 'undo' ? 'Tornare indietro' : 'Andare avanti') + ' su «' + passo.label + '»?\n\n' +
        '⚠ ' + o.dove(cambiate) + ': modificato dopo questo passo (da un collega o da un\'altra azione). ' +
        'Proseguendo torna com\'era e quelle modifiche successive vanno perse.';
      if (!await showConfirmAsync(msg, verso === 'undo' ? 'Indietro comunque' : 'Avanti comunque')) return;
    }
    daPila.pop();
    st.applicando = true;
    try {
      await o.scrivi(passo.changes, nuovo);
      await flush();
    } finally {
      st.applicando = false;
    }
    aPila.push(passo);
    if (o.dopo) await o.dopo(passo);
    updateUI();
    undoToast((verso === 'undo' ? '↶ Annullato: ' : '↷ Ripristinato: ') + passo.label);
  }

  function ora(ts) {
    return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  function updateUI() {
    const bu = document.getElementById(o.btnUndo);
    const br = document.getElementById(o.btnRedo);
    const u = st.undo[st.undo.length - 1];
    const r = st.redo[st.redo.length - 1];
    if (bu) {
      bu.disabled = !u;
      bu.title = u ? 'Indietro: ' + u.label + ' (' + ora(u.ts) + ') — Ctrl+Z' : 'Niente da annullare';
    }
    if (br) {
      br.disabled = !r;
      br.title = r ? 'Avanti: ' + r.label + ' (' + ora(r.ts) + ') — Ctrl+Y' : 'Niente da ripristinare';
    }
  }

  const istanza = {
    registra, flush, rebase, updateUI,
    undo: () => applica(st.undo, st.redo, 'undo'),
    redo: () => applica(st.redo, st.undo, 'redo'),
    attiva: o.attiva,
    stato: st,
  };
  _undoIstanze.push(istanza);
  return istanza;
}

function undoToast(msg) {
  let el = document.getElementById('undo-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undo-toast';
    el.className = 'no-print';
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9000;' +
      'background:#1e293b;color:#fff;font-size:13px;padding:8px 14px;border-radius:8px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;transition:opacity .2s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// Un modal aperto (overlay fisso a tutto schermo) tiene in mano indici/stato dei dati:
// la scorciatoia non deve cambiarglieli sotto.
function undoModalAperto() {
  const mr = document.getElementById('modal-root');
  if (mr && mr.children.length) return true;
  const cand = document.querySelectorAll('body > *, [style*="position:fixed"], [style*="position: fixed"], .fixed');
  for (const el of cand) {
    if (el.id === 'undo-toast') continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.offsetWidth >= window.innerWidth * 0.9 && el.offsetHeight >= window.innerHeight * 0.9) return true;
  }
  return false;
}

// Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z sulla schermata visibile. Dentro un campo di testo resta
// l'annulla nativo del browser; con un modal aperto non si interviene.
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = (e.key || '').toLowerCase();
  const isUndo = k === 'z' && !e.shiftKey;
  const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
  if (!isUndo && !isRedo) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const ist = _undoIstanze.find(i => i.attiva());
  if (!ist || undoModalAperto()) return;
  e.preventDefault();
  if (isUndo) ist.undo(); else ist.redo();
});
