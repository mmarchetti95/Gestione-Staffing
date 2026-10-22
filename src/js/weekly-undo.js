/* ==================== PIANIFICAZIONE · INDIETRO / AVANTI ====================
   Bottoni "↶ Indietro" / "↷ Avanti" nella toolbar della Griglia, Ctrl+Z / Ctrl+Y ovunque nella
   Pianificazione Settimanale. Motore in undo-history.js. Copre pwData, pwFerie,
   pwFerieDettagli e pwDoppiaWeek: pwSave, pwFerieSave e pwDwSave chiamano pwUndoRegistra(),
   sbPull e pwLoad chiamano pwUndoFlush() prima di sostituire i dati e pwUndoRebase() dopo.
   Grana: i dati appiattiti a due livelli ([anno][week], oppure [noteGenerali][anno] ecc.),
   quindi un passo è "queste settimane, com'erano prima e dopo". Se il passo non riguarda la
   settimana mostrata, ci si sposta sulla prima toccata. */

// Radice dei dati e nome mostrato nell'etichetta del passo
const PW_UNDO_DOMINI = {
  data:      { get: () => pwData,          nome: 'Griglia' },
  ferie:     { get: () => pwFerie,         nome: 'Ferie' },
  ferieDett: { get: () => pwFerieDettagli, nome: 'Ferie' },
  dw:        { get: () => pwDoppiaWeek,    nome: 'Doppia week' },
};

// Settimana vuota = settimana assente: pwGetWeekData()/pwGetFerieWeek() creano [] / {}
// solo guardando una settimana, e non deve diventare un passo.
function _pwUndoJson(v) {
  if (v === undefined || v === null) return undefined;
  const j = JSON.stringify(v);
  return (j === '[]' || j === '{}') ? undefined : j;
}

function _pwUndoSnapshot() {
  const out = new Map();
  Object.keys(PW_UNDO_DOMINI).forEach(dom => {
    const root = PW_UNDO_DOMINI[dom].get();
    if (!root || typeof root !== 'object') return;
    Object.keys(root).forEach(k1 => {
      const v1 = root[k1];
      if (v1 && typeof v1 === 'object' && !Array.isArray(v1)) {
        Object.keys(v1).forEach(k2 => {
          const j = _pwUndoJson(v1[k2]);
          if (j !== undefined) out.set(dom + '\u0001' + k1 + '\u0001' + k2, { dom, p: [k1, k2], j });
        });
      } else {
        const j = _pwUndoJson(v1);
        if (j !== undefined) out.set(dom + '\u0001' + k1, { dom, p: [k1], j });
      }
    });
  });
  return out;
}

function _pwUndoScrivi(info, json) {
  const root = PW_UNDO_DOMINI[info.dom].get();
  const k1 = info.p[0];
  if (info.p.length === 1) {
    if (json === undefined) delete root[k1]; else root[k1] = JSON.parse(json);
    return;
  }
  const k2 = info.p[1];
  if (json === undefined) { if (root[k1]) delete root[k1][k2]; return; }
  if (!root[k1] || typeof root[k1] !== 'object') root[k1] = {};
  root[k1][k2] = JSON.parse(json);
}

// Settimane { anno, week } toccate da un passo (solo chiavi [anno][week] numeriche)
function _pwUndoSettimane(changes) {
  const out = [];
  const visti = new Set();
  changes.forEach(c => {
    const p = c.info.p;
    if (p.length !== 2 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1])) return;
    const k = p[0] + '|' + p[1];
    if (visti.has(k)) return;
    visti.add(k);
    out.push({ anno: Number(p[0]), week: Number(p[1]) });
  });
  return out.sort((a, b) => a.anno - b.anno || a.week - b.week);
}

function _pwUndoLabel(changes) {
  const nomi = [];
  changes.forEach(c => {
    let n = PW_UNDO_DOMINI[c.info.dom].nome;
    if (c.info.dom === 'data' && !/^\d+$/.test(c.info.p[0])) n = 'Note';
    if (nomi.indexOf(n) < 0) nomi.push(n);
  });
  const sett = _pwUndoSettimane(changes);
  let s = nomi.join(', ');
  if (sett.length === 1) s += ' · W' + sett[0].week + '/' + sett[0].anno;
  else if (sett.length > 1 && sett.length <= 3) s += ' · ' + sett.map(w => 'W' + w.week).join(', ') + '/' + sett[sett.length - 1].anno;
  else if (sett.length > 3) s += ' · ' + sett.length + ' settimane';
  return s;
}

const _pwUndo = undoCreaCronologia({
  btnUndo: 'pw-undo-btn',
  btnRedo: 'pw-redo-btn',
  attiva: () => { const el = document.getElementById('screen-weekly'); return !!el && !el.classList.contains('hidden'); },
  snapshot: _pwUndoSnapshot,
  label: _pwUndoLabel,
  dove: changes => {
    const sett = _pwUndoSettimane(changes);
    return sett.length ? sett.map(w => 'W' + w.week + '/' + w.anno).join(', ') : _pwUndoLabel(changes);
  },
  scrivi: async (changes, campo) => {
    const domini = new Set();
    changes.forEach(c => { _pwUndoScrivi(c.info, c[campo]); domini.add(c.info.dom); });
    if (domini.has('data')) await pwSave();
    if (domini.has('ferie') || domini.has('ferieDett')) await pwFerieSave();
    if (domini.has('dw')) await pwDwSave();
  },
  dopo: passo => {
    const sett = _pwUndoSettimane(passo.changes);
    if (sett.length && !sett.some(w => w.anno === pwAnno && w.week === pwWeek)) {
      pwAnno = sett[0].anno; pwWeek = sett[0].week;
    }
    const weeklyEl = document.getElementById('screen-weekly');
    if (weeklyEl && !weeklyEl.classList.contains('hidden')) pwSwitchTab(_pwActiveTab || 'griglia');
    if (typeof mlOnDataChanged === 'function') mlOnDataChanged();
  },
});

function pwUndoRegistra() { _pwUndo.registra(); }
function pwUndoFlush() { return _pwUndo.flush(); }
function pwUndoRebase() { return _pwUndo.rebase(); }
function pwUndo() { return _pwUndo.undo(); }
function pwRedo() { return _pwUndo.redo(); }
