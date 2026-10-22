/* ==================== DASHBOARD · INDIETRO / AVANTI ====================
   Bottoni "↶ Indietro" / "↷ Avanti" nell'header (visibili solo sulla Dashboard), Ctrl+Z /
   Ctrl+Y sulla Dashboard. Motore in undo-history.js; pila separata da quella della
   Pianificazione. Copre le chiavi del dominio core che saveState() salva, più
   commesse_attive_extra (scritta a parte, prima di saveState, e quindi letta dallo storage).
   saveState chiama dbUndoRegistra(); sbPull chiama dbUndoFlush() prima di sostituire i dati,
   loadState chiama dbUndoRebase() alla fine (avvio, pull, e dopo un Indietro/Avanti).
   Grana: le liste con id univoco (operatori, pipeline…) elemento per elemento più l'ordine
   degli id; gli oggetti (commesse_attive_meta, registri…) proprietà per proprietà; il resto
   (staffing, che non ha id) per intero. Così annullare la modifica di un operatore non
   tocca quelli cambiati nel frattempo da un collega.
   Il ripristino riscrive state e storage e passa da saveState() + loadState(): i valori
   derivati (commesse_attive, alloc_mensile/saturazione) si ricalcolano come al caricamento. */

// chiave di storage -> campo di state (null = solo storage) e nome mostrato nel passo
const DB_UNDO_CHIAVI = {
  commesse_pipeline:     { campo: 'pipeline',             nome: 'Pipeline' },
  operatori:             { campo: 'operatori',            nome: 'Operatori' },
  assegnazioni:          { campo: 'assegnazioni',         nome: 'Assegnazioni' },
  staffing_modificato:   { campo: 'staffing',             nome: 'Staffing' },
  commesse_chiuse:       { campo: 'commesse_chiuse',      nome: 'Commesse chiuse' },
  commesse_attive_meta:  { campo: 'commesse_attive_meta', nome: 'Commesse' },
  commesse_escluse:      { campo: 'commesse_escluse',     nome: 'Commesse' },
  commesse_attive_extra: { campo: null,                   nome: 'Commesse' },
  attestati_registro:    { campo: 'attestati_registro',   nome: 'Attestati' },
  dpi_disponibili:       { campo: 'dpi_disponibili',      nome: 'DPI' },
  dpi_catalogo:          { campo: 'dpi_catalogo',         nome: 'DPI' },
  limitazioni_registro:  { campo: 'limitazioni_registro', nome: 'Limitazioni' },
  limitazioni_catalogo:  { campo: 'limitazioni_catalogo', nome: 'Limitazioni' },
  fornitori:             { campo: 'fornitori',            nome: 'Fornitori' },
};

// alloc_mensile/saturazione degli operatori sono derivati dallo staffing (ricalcolati in
// loadState): fuori dallo snapshot, altrimenti ogni modifica di staffing toccherebbe anche
// gli operatori.
function _dbUndoPulisci(k, el) {
  if (k !== 'operatori') return el;
  const c = Object.assign({}, el);
  delete c.alloc_mensile;
  delete c.saturazione;
  return c;
}

function _dbUndoConId(v) {
  if (!Array.isArray(v)) return false;
  if (!v.every(e => e && typeof e === 'object' && e.id !== undefined && e.id !== null && e.id !== '')) return false;
  return new Set(v.map(e => String(e.id))).size === v.length;
}

function _dbUndoAppiattisci(out, k, v) {
  if (_dbUndoConId(v)) {
    out.set(k + '@', { k, modo: 'ordine', j: JSON.stringify(v.map(e => String(e.id))) });
    v.forEach(e => out.set(k + '#' + e.id, { k, modo: 'el', j: JSON.stringify(_dbUndoPulisci(k, e)) }));
  } else if (v && typeof v === 'object' && !Array.isArray(v)) {
    out.set(k + '{}', { k, modo: 'obj', j: '1' });
    Object.keys(v).forEach(p => out.set(k + '.' + p, { k, modo: 'prop', p, j: JSON.stringify(v[p]) }));
  } else {
    out.set(k, { k, modo: 'tutto', j: JSON.stringify(v === undefined ? null : v) });
  }
}

async function _dbUndoSnapshot() {
  const out = new Map();
  for (const k of Object.keys(DB_UNDO_CHIAVI)) {
    const campo = DB_UNDO_CHIAVI[k].campo;
    _dbUndoAppiattisci(out, k, campo ? state[campo] : await sget(k));
  }
  return out;
}

// Ricostruisce il valore di una chiave dalle sue voci (Map chiave-voce -> { modo, j, p })
function _dbUndoRicostruisci(voci) {
  const lista = [...voci.values()];
  const ordine = lista.find(v => v.modo === 'ordine');
  if (ordine) {
    const perId = new Map();
    lista.filter(v => v.modo === 'el').forEach(v => { const e = JSON.parse(v.j); perId.set(String(e.id), e); });
    const arr = [];
    JSON.parse(ordine.j).forEach(id => { if (perId.has(id)) { arr.push(perId.get(id)); perId.delete(id); } });
    perId.forEach(e => arr.push(e));  // aggiunti da altri dopo il passo: restano, in coda
    return arr;
  }
  const tutto = lista.find(v => v.modo === 'tutto');
  if (tutto) return JSON.parse(tutto.j);
  if (lista.some(v => v.modo === 'obj' || v.modo === 'prop')) {
    const obj = {};
    lista.filter(v => v.modo === 'prop').forEach(v => { obj[v.p] = JSON.parse(v.j); });
    return obj;
  }
  return null;
}

function _dbUndoLabel(changes) {
  const gruppi = new Map();
  changes.forEach(c => {
    const nome = DB_UNDO_CHIAVI[c.info.k].nome;
    if (!gruppi.has(nome)) gruppi.set(nome, new Set());
    let d = null;
    if (c.info.modo === 'el') {
      const e = JSON.parse(c.dopo !== undefined ? c.dopo : c.prima);
      d = e.nome_esteso || e.progetto || e.nome || e.id;
    } else if (c.info.modo === 'prop' && c.info.k === 'commesse_attive_meta') {
      d = c.info.p;
    }
    if (d) gruppi.get(nome).add(String(d));
  });
  return [...gruppi].map(([n, s]) =>
    !s.size ? n : s.size <= 2 ? n + ': ' + [...s].join(', ') : n + ' (' + s.size + ')'
  ).join(' · ');
}

const _dbUndo = undoCreaCronologia({
  btnUndo: 'db-undo-btn',
  btnRedo: 'db-redo-btn',
  attiva: () => { const el = document.querySelector('main'); return !!el && !el.classList.contains('hidden'); },
  snapshot: _dbUndoSnapshot,
  label: _dbUndoLabel,
  dove: _dbUndoLabel,
  scrivi: async (changes, campo) => {
    const cur = await _dbUndoSnapshot();
    const perChiave = new Map();
    changes.forEach(c => {
      if (!perChiave.has(c.info.k)) perChiave.set(c.info.k, []);
      perChiave.get(c.info.k).push(c);
    });
    for (const [k, lista] of perChiave) {
      const voci = new Map();
      cur.forEach((v, kv) => { if (v.k === k) voci.set(kv, v); });
      lista.forEach(c => {
        if (c[campo] === undefined) voci.delete(c.k);
        else voci.set(c.k, Object.assign({}, c.info, { j: c[campo] }));
      });
      const valore = _dbUndoRicostruisci(voci);
      if (DB_UNDO_CHIAVI[k].campo) state[DB_UNDO_CHIAVI[k].campo] = valore;
      else await sset(k, valore || []);
    }
    await saveState(campo === 'prima' ? 'Indietro (annulla)' : 'Avanti (ripristina)', { passo: _dbUndoLabel(changes) });
    await loadState();
  },
  dopo: () => { renderAll(); },
});

function dbUndoRegistra() { _dbUndo.registra(); }
function dbUndoFlush() { return _dbUndo.flush(); }
function dbUndoRebase() { return _dbUndo.rebase(); }
function dbUndo() { return _dbUndo.undo(); }
function dbRedo() { return _dbUndo.redo(); }
