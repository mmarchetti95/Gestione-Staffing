/* ==================== PROGRAMMAZIONE (board tipo Monday) ====================
   Quarto screen top-level («📋 Programmazione», #screen-programmazione), prefisso prg*.
   Gestisce la fase che precede la partenza operativa dei rilievi (ODL, contatti col comune,
   documenti, sopralluoghi, qualità del dato, stato) e sostituisce Monday, che si teneva
   allineato a mano con Jira e con la dashboard.

   Dati in tabelle Supabase dedicate (supabase/migrations/20261119_programmazione.sql), NON in
   staffing_state: centinaia di elementi modificati da più persone in contemporanea.
     prg_board     board con la definizione delle colonne (jsonb `colonne`, `config.gruppo` =
                   colonna di tipo stato che raggruppa le righe, come i gruppi di Monday)
     prg_elemento  righe; `valori` = { id colonna: valore }. Si scrive UN campo alla volta con
                   l'RPC prg_imposta, così due colleghi su celle diverse non si sovrascrivono
     prg_commento  aggiornamenti per elemento (anche quelli importati da Monday)
     prg_storico   chi ha cambiato cosa (scritto da un trigger, qui solo letto)
   Scrittura: admin/responsabile (sbCanWrite + RLS). Lettura: tutti.
   Realtime su un canale proprio: la board aperta si aggiorna quando scrive un collega; se si
   sta modificando una cella il ridisegno aspetta la fine della modifica.
   Indietro/Avanti non copre questi dati (come Note/Variazioni e sottotask): c'è lo storico
   per elemento con «↶ ripristina».
   Colonne e tipi: src/js/programmazione-colonne.js. Import da Excel di Monday:
   src/js/programmazione-import.js. */

const PRG_T = { board: 'prg_board', el: 'prg_elemento', com: 'prg_commento', sto: 'prg_storico' };
const PRG_PREF_KEY = 'prg_pref_v1';
// Larghezze: automatiche dal testo più lungo della colonna (intestazione su max 2 righe),
// salvo larghezza fissata da «⚙️ Colonne» (per tutti) o trascinata a mano (solo questo browser).
const PRG_LARG_MIN = 70;
const PRG_LARG_MAX = 520;          // oltre, il testo resta tagliato (intero nel tooltip e nel pannello)
const PRG_LARG_NOME = [180, 440];  // min/max della prima colonna

const _prg = {
  boards: [],
  elementi: {},       // boardId -> [elemento]
  caricate: {},       // boardId -> true quando gli elementi sono in memoria
  commenti: {},       // boardId -> Map(idCommento -> elemento_id), per il contatore 💬
  boardId: null,
  pronto: false,
  caricando: null,
  errore: null,
  channel: null,
  editing: null,      // { id, col } della cella in modifica
  renderPending: false,
  drawer: null,       // { id, tab: 'dettagli'|'commenti'|'storico', commenti, storico }
  pref: (function () { try { return JSON.parse(localStorage.getItem(PRG_PREF_KEY) || '{}') || {}; } catch (_) { return {}; } })(),
};

/* ---------- utilità ---------- */
function prgEsc(v) { return esc(v === null || v === undefined ? '' : String(v)); }
function prgBoard() { return _prg.boards.find(b => b.id === _prg.boardId) || null; }
function prgCols(b) { return (b && Array.isArray(b.colonne)) ? b.colonne : []; }
function prgCol(b, id) { return prgCols(b).find(c => c.id === id) || null; }
function prgEls(boardId) { return _prg.elementi[boardId] || []; }
function prgEl(id) {
  for (const k in _prg.elementi) { const e = _prg.elementi[k].find(x => x.id === id); if (e) return e; }
  return null;
}
function prgPrefB(id) {
  const p = _prg.pref.boards || (_prg.pref.boards = {});
  if (!p[id]) p[id] = { nascoste: [], ord: null, chiusi: [], cerca: '' };
  if (!p[id].larg) p[id].larg = {};     // larghezze trascinate a mano: { idColonna|'__nome': px }
  return p[id];
}
function prgSalvaPref() { try { localStorage.setItem(PRG_PREF_KEY, JSON.stringify(_prg.pref)); } catch (_) {} }

function prgTestoSuColore(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#fff';
  const l = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
  return l > 0.68 ? '#1e293b' : '#fff';
}

function _prgYmd(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
function prgFmtData(s) { const p = _prgYmd(s); return p ? String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0') + '/' + p[0] : (s ? String(s) : ''); }
function prgFmtDataOra(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : prgFmtData(s);
}
function prgDataBreve(s, conAnno) {
  const p = _prgYmd(s);
  if (!p) return '';
  const o = { day: 'numeric', month: 'short' };
  if (conAnno) o.year = '2-digit';
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('it-IT', o);
}
function prgSettimanaDi(s) { const p = _prgYmd(s); return p ? isoWeekYear(new Date(p[0], p[1] - 1, p[2])).week : null; }
function prgSettimane(tl) {
  if (!tl || !tl.inizio) return '';
  const a = prgSettimanaDi(tl.inizio), b = prgSettimanaDi(tl.fine || tl.inizio);
  return 'W' + a + (b !== a ? ' – W' + b : '');
}
function prgOggiYmd() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function prgNomeDaEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  const op = (state.operatori || []).find(o => o.email && o.email.trim().toLowerCase() === e);
  if (op && op.nome_esteso) return op.nome_esteso;
  return e.split('@')[0].split(/[._]/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join(' ');
}
function prgDataOraTs(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function prgNuovoId(pref) { return (pref || 'c') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function prgCommesse() {
  return Object.keys((state && state.commesse_attive_meta) || {}).sort((a, b) => a.localeCompare(b, 'it'));
}

/* ---------- gruppi (righe raggruppate per la colonna di stato, come i gruppi di Monday) ---------- */
/* Colonna che raggruppa: quella della board (config.gruppo), salvo scelta «Raggruppa per» di
   questo browser (pref.gruppo: id di una colonna stato, '__nessuno' = nessun raggruppamento). */
function prgColonnaGruppoBoard(b) {
  const c = prgCol(b, (b && b.config && b.config.gruppo) || '');
  return c && c.tipo === 'stato' ? c : null;
}
function prgColonnaGruppo(b) {
  if (!b) return null;
  const scelta = prgPrefB(b.id).gruppo;
  if (scelta === '__nessuno') return null;
  const c = scelta ? prgCol(b, scelta) : null;
  return c && c.tipo === 'stato' ? c : prgColonnaGruppoBoard(b);
}
function prgGruppi(b) {
  const gc = prgColonnaGruppo(b);
  if (!gc) return [{ id: '__tutti', label: 'Tutti gli elementi', colore: '#579bfc' }];
  const g = (gc.opzioni || []).map(o => ({ id: o.id, label: o.label, colore: o.colore || '#c4c4c4' }));
  g.push({ id: '__nessuno', label: 'Senza ' + String(gc.titolo || 'stato').toLowerCase(), colore: '#c4c4c4' });
  return g;
}
function prgGruppoDi(b, el) {
  const gc = prgColonnaGruppo(b);
  if (!gc) return '__tutti';
  const v = el.valori && el.valori[gc.id];
  return (gc.opzioni || []).some(o => o.id === v) ? v : '__nessuno';
}

/* ---------- caricamento ---------- */
async function prgCarica(forza) {
  if (_prg.caricando) return _prg.caricando;
  if (_prg.pronto && !forza) return;
  if (!_sbClient || !_sbUser) return;
  _prg.caricando = (async () => {
    try {
      const { data, error } = await _sbClient.from(PRG_T.board).select('*').order('ordine').order('id');
      if (error) throw error;
      _prg.boards = data || [];
      _prg.errore = null;
      if (forza) { _prg.elementi = {}; _prg.caricate = {}; _prg.commenti = {}; }
      const pref = _prg.pref.board;
      _prg.boardId = _prg.boards.some(b => b.id === pref) ? pref : (_prg.boards[0] ? _prg.boards[0].id : null);
      if (_prg.boardId) await prgCaricaBoard(_prg.boardId);
      _prg.pronto = true;
    } catch (e) {
      _prg.errore = e.message || String(e);
    } finally {
      _prg.caricando = null;
    }
  })();
  return _prg.caricando;
}

async function _prgLeggiTutto(tabella, colonne, filtro) {
  const out = [];
  for (let da = 0; ; da += 1000) {
    let q = _sbClient.from(tabella).select(colonne);
    q = filtro(q).range(da, da + 999);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function prgCaricaBoard(id, forza) {
  if (_prg.caricate[id] && !forza) return;
  const els = await _prgLeggiTutto(PRG_T.el, '*', q => q.eq('board_id', id).order('ordine').order('id'));
  _prg.elementi[id] = els;
  const com = await _prgLeggiTutto(PRG_T.com, 'id,elemento_id', q => q.eq('board_id', id).order('id'));
  _prg.commenti[id] = new Map(com.map(c => [c.id, c.elemento_id]));
  _prg.caricate[id] = true;
}

function prgNumCommenti(boardId, elId) {
  const m = _prg.commenti[boardId];
  if (!m) return 0;
  let n = 0;
  m.forEach(v => { if (v === elId) n++; });
  return n;
}

/* ---------- ingresso nello screen ---------- */
function prgEnter() {
  const root = document.getElementById('prg-root');
  if (!root) return;
  if (!_prg.pronto) root.innerHTML = '<div class="text-sm text-slate-400 py-16 text-center">Caricamento della programmazione…</div>';
  if (!_sbClient || !_sbUser) return;   // si riparte da prgDopoLogin
  prgSubscribe();
  prgCarica().then(() => prgRender());
}

async function prgScegliBoard(id) {
  if (id === _prg.boardId) return;
  _prg.boardId = id;
  _prg.pref.board = id;
  prgSalvaPref();
  prgChiudiDrawer();
  prgRender();
  if (!_prg.caricate[id]) {
    try { await prgCaricaBoard(id); } catch (e) { _prg.errore = e.message || String(e); }
    prgRender();
  }
}

/* ---------- render ---------- */
function prgRender() {
  const root = document.getElementById('prg-root');
  if (!root) return;
  if (_prg.errore) {
    const manca = /prg_board|does not exist|schema cache/i.test(_prg.errore);
    root.innerHTML = '<div class="bg-white border border-red-200 rounded-lg p-6 text-sm text-red-700">'
      + (manca ? 'Le tabelle della Programmazione non sono ancora presenti su Supabase: va applicata la migrazione <code>supabase/migrations/20261119_programmazione.sql</code>.'
        : 'Errore nel caricamento: ' + prgEsc(_prg.errore))
      + ' <button class="ml-2 underline" data-prg-azione="ricarica">Riprova</button></div>';
    return;
  }
  root.innerHTML = '<div id="prg-testa"></div><div id="prg-corpo"></div>';
  prgRenderTesta();
  prgRenderTabella();
}

function prgRenderTesta() {
  const box = document.getElementById('prg-testa');
  if (!box) return;
  const b = prgBoard();
  const w = sbCanWrite();
  const tabs = _prg.boards.map(x =>
    '<button class="prg-board-tab' + (x.id === _prg.boardId ? ' on' : '') + '" data-prg-board="' + x.id + '" title="'
    + prgEsc(x.commessa ? 'Commessa: ' + x.commessa : 'Nessuna commessa collegata') + '">' + prgEsc(x.nome) + '</button>').join('');
  const pb = b ? prgPrefB(b.id) : null;
  box.innerHTML =
    '<div class="flex items-center gap-2 flex-wrap mb-3">'
    + '<h2 class="text-lg font-semibold text-slate-800 mr-2">📋 Programmazione</h2>'
    + '<div class="flex items-center gap-1 flex-wrap">' + tabs
    + (w ? '<button class="prg-board-tab prg-board-add" data-prg-azione="nuova-board" data-help-key="prg-nuova-board" title="Crea una board vuota">＋ Board</button>' : '')
    + '</div>'
    + '<div class="ml-auto flex items-center gap-2 flex-wrap">'
    + (w ? '<button class="prg-btn" data-prg-azione="importa" data-help-key="prg-importa">📥 Importa da Monday</button>' : '')
    + '</div></div>'
    + (b ? '<div class="flex items-center gap-2 flex-wrap mb-3">'
      + '<input id="prg-cerca" type="search" class="prg-cerca" placeholder="🔍 Cerca in questa board…" value="' + prgEsc(pb.cerca) + '" data-help-key="prg-cerca">'
      + '<span id="prg-conta" class="text-xs text-slate-500"></span>'
      + '<div class="ml-auto flex items-center gap-2 flex-wrap">'
      + '<button class="prg-btn" data-prg-azione="vista" data-help-key="prg-vista">👁 Colonne visibili</button>'
      + prgRaggruppaHtml(b)
      + '<button class="prg-btn" data-prg-azione="comprimi" data-help-key="prg-comprimi" title="Chiude tutti i gruppi">⊟ Comprimi tutti</button>'
      + '<button class="prg-btn" data-prg-azione="espandi" data-help-key="prg-espandi" title="Apre tutti i gruppi">⊞ Espandi tutti</button>'
      + (Object.keys(pb.larg).length ? '<button class="prg-btn" data-prg-azione="larghezze" data-help-key="prg-larghezze">↔ Larghezze automatiche</button>' : '')
      + '<button class="prg-btn" data-prg-azione="esporta" data-help-key="prg-esporta">📤 Esporta Excel</button>'
      + (w ? '<button class="prg-btn" data-prg-azione="colonne" data-help-key="prg-colonne">⚙️ Colonne</button>'
        + '<button class="prg-btn" data-prg-azione="board" data-help-key="prg-board">✎ Board</button>' : '')
      + '</div></div>' : '');
}

function prgRaggruppaHtml(b) {
  const stati = prgCols(b).filter(c => c.tipo === 'stato');
  if (!stati.length) return '';
  const gc = prgColonnaGruppo(b);
  const cur = gc ? gc.id : '__nessuno';
  const def = prgColonnaGruppoBoard(b);
  return '<label class="prg-raggr" data-help-key="prg-raggruppa">Raggruppa per '
    + '<select id="prg-raggruppa" class="prg-f-inp">'
    + stati.map(c => '<option value="' + prgEsc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>'
      + prgEsc(c.titolo) + (def && def.id === c.id ? ' (board)' : '') + '</option>').join('')
    + '<option value="__nessuno"' + (cur === '__nessuno' ? ' selected' : '') + '>— nessun gruppo —</option>'
    + '</select></label>';
}

function prgElementiFiltrati(b) {
  const pb = prgPrefB(b.id);
  const q = (pb.cerca || '').trim().toLowerCase();
  const cols = prgCols(b);
  let els = prgEls(b.id);
  if (q) {
    els = els.filter(el => {
      if (String(el.nome || '').toLowerCase().includes(q)) return true;
      return cols.some(c => prgTesto(c, el.valori && el.valori[c.id], el).toLowerCase().includes(q));
    });
  }
  return els;
}

function prgOrdina(b, els) {
  const pb = prgPrefB(b.id);
  const ord = pb.ord;
  if (!ord || !ord.col) return els;
  const dir = ord.dir === 'desc' ? -1 : 1;
  const col = ord.col === '__nome' ? null : prgCol(b, ord.col);
  if (ord.col !== '__nome' && !col) return els;
  const chiave = el => {
    if (!col) return String(el.nome || '').toLowerCase();
    const v = el.valori && el.valori[col.id];
    switch (col.tipo) {
      case 'numero': return typeof v === 'number' ? v : null;
      case 'stato': { const i = (col.opzioni || []).findIndex(o => o.id === v); return i < 0 ? null : i; }
      case 'check': return v ? 1 : 0;
      case 'timeline': return v && v.inizio ? v.inizio : null;
      case 'settimane': { const t = el.valori && el.valori[col.da]; return t && t.inizio ? t.inizio : null; }
      default: return v === undefined || v === null || v === '' ? null : String(v).toLowerCase();
    }
  };
  return els.slice().sort((x, y) => {
    const a = chiave(x), c = chiave(y);
    if (a === null && c === null) return 0;
    if (a === null) return 1;      // vuoti sempre in fondo
    if (c === null) return -1;
    if (typeof a === 'number' && typeof c === 'number') return (a - c) * dir;
    return String(a).localeCompare(String(c), 'it', { numeric: true }) * dir;
  });
}

function prgRenderTabella() {
  const box = document.getElementById('prg-corpo');
  if (!box) return;
  if (_prg.editing) { _prg.renderPending = true; return; }
  _prg.renderPending = false;
  const b = prgBoard();
  if (!b) {
    box.innerHTML = '<div class="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">'
      + 'Nessuna board ancora.' + (sbCanWrite()
        ? ' Importa l\'Excel esportato da Monday con «📥 Importa da Monday», oppure crea una board vuota con «＋ Board».'
        : ' Chi ha il ruolo admin o responsabile può crearne una.') + '</div>';
    return;
  }
  if (!_prg.caricate[b.id]) { box.innerHTML = '<div class="text-sm text-slate-400 py-16 text-center">Caricamento…</div>'; return; }
  const vecchio = document.getElementById('prg-scroll');
  const scroll = vecchio ? { t: vecchio.scrollTop, l: vecchio.scrollLeft } : null;
  const w = sbCanWrite();
  const pb = prgPrefB(b.id);
  const cols = prgCols(b).filter(c => !pb.nascoste.includes(c.id));
  const gruppi = prgGruppi(b);
  const tutti = prgElementiFiltrati(b);
  const cerca = !!(pb.cerca || '').trim();
  const perGruppo = {};
  gruppi.forEach(g => { perGruppo[g.id] = []; });
  prgOrdina(b, tutti).forEach(el => { const g = prgGruppoDi(b, el); (perGruppo[g] || (perGruppo[g] = [])).push(el); });

  const ord = pb.ord || {};
  const freccia = id => ord.col === id ? (ord.dir === 'desc' ? ' ▼' : ' ▲') : '';
  const larg = prgLarghezze(b, cols);
  const totW = cols.reduce((s, c) => s + larg[c.id], larg.__nome);
  const titoloNome = (b.config && b.config.titoloNome) || 'Elemento';
  const rs = id => '<span class="prg-rs" data-prg-rs="' + prgEsc(id) + '" title="Trascina per cambiare la larghezza · doppio clic: torna automatica"></span>';
  // Intestazione delle colonne ripetuta in ogni gruppo (come Monday), appiccicata in alto mentre
  // si scorre il gruppo: quella del gruppo successivo la copre quando arriva.
  const intestazione = '<tr class="prg-grp-cols"><th class="prg-sticky" data-prg-sort="__nome"><span class="prg-th-t">' + prgEsc(titoloNome) + freccia('__nome') + '</span>' + rs('__nome') + '</th>'
    + cols.map(c => '<th data-prg-sort="' + prgEsc(c.id) + '" title="' + prgEsc(c.titolo + ' · ' + prgEtichettaTipo(c.tipo) + ' · clic per ordinare') + '">'
      + '<span class="prg-th-t">' + prgEsc(c.titolo) + freccia(c.id) + '</span>' + rs(c.id) + '</th>').join('')
    + '</tr>';
  let h = '<div id="prg-scroll" class="prg-scroll"><table class="prg-table" style="width:' + totW + 'px">'
    + '<colgroup><col data-col="__nome" style="width:' + larg.__nome + 'px">'
    + cols.map(c => '<col data-col="' + prgEsc(c.id) + '" style="width:' + larg[c.id] + 'px">').join('') + '</colgroup>';
  let mostrati = 0;
  gruppi.forEach(g => {
    const els = perGruppo[g.id] || [];
    if (g.id === '__nessuno' && !els.length) return;
    if (cerca && !els.length) return;
    mostrati++;
    const chiuso = pb.chiusi.includes(g.id);
    h += '<tbody class="prg-grp' + (chiuso ? ' chiuso' : '') + '" style="--g:' + prgEsc(g.colore) + '">'
      + (mostrati > 1 ? '<tr class="prg-grp-gap"><td colspan="' + (cols.length + 1) + '"></td></tr>' : '')
      + '<tr class="prg-grp-head"><td colspan="' + (cols.length + 1) + '">'
      + '<div class="prg-grp-head-in" data-prg-grp="' + prgEsc(g.id) + '" title="' + (chiuso ? 'Espandi' : 'Comprimi') + ' il gruppo">'
      + '<span class="prg-grp-tog">' + (chiuso ? '▸' : '▾') + '</span>'
      + '<span class="prg-grp-tit">' + prgEsc(g.label) + '</span>'
      + '<span class="prg-grp-n">' + els.length + ' element' + (els.length === 1 ? 'o' : 'i') + '</span>'
      + '</div></td></tr>';
    if (!chiuso) {
      h += intestazione;
      els.forEach(el => { h += prgRigaHtml(b, cols, el, g.colore, w); });
      if (w && !cerca) {
        h += '<tr class="prg-add"><td class="prg-sticky"><input class="prg-add-inp" placeholder="＋ Aggiungi elemento" data-prg-add="' + prgEsc(g.id) + '">'
          + '</td><td colspan="' + cols.length + '"></td></tr>';
      }
      if (els.length) h += prgRiepilogoHtml(cols, els);
    }
    h += '</tbody>';
  });
  h += '</table></div>';
  if (!mostrati) h = '<div class="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">'
    + (cerca ? 'Nessun elemento corrisponde alla ricerca.' : 'La board non ha ancora elementi.') + '</div>';
  box.innerHTML = h;
  const conta = document.getElementById('prg-conta');
  if (conta) {
    const tot = prgEls(b.id).length;
    conta.textContent = cerca ? tutti.length + ' di ' + tot + ' elementi' : tot + ' elementi';
  }
  const sc = document.getElementById('prg-scroll');
  if (sc && scroll) { sc.scrollTop = scroll.t; sc.scrollLeft = scroll.l; }
}

/* ---------- larghezze delle colonne ---------- */
const _prgMis = { ctx: null, font: '', cache: new Map() };
// Larghezza in px di un testo col font della tabella (canvas; senza canvas, stima sui caratteri).
function prgMisuraTesto(testo, peso, px) {
  const s = String(testo === null || testo === undefined ? '' : testo);
  if (!s) return 0;
  const k = peso + '|' + px + '|' + s;
  if (_prgMis.cache.has(k)) return _prgMis.cache.get(k);
  if (_prgMis.ctx === null) {
    try { const cv = document.createElement('canvas'); _prgMis.ctx = (cv.getContext && cv.getContext('2d')) || false; } catch (_) { _prgMis.ctx = false; }
    try { _prgMis.font = getComputedStyle(document.body).fontFamily || ''; } catch (_) {}
    if (!_prgMis.font) _prgMis.font = "'Inter', system-ui, sans-serif";
  }
  let w;
  if (_prgMis.ctx) { _prgMis.ctx.font = peso + ' ' + px + 'px ' + _prgMis.font; w = _prgMis.ctx.measureText(s).width; }
  else w = s.length * px * 0.58;
  if (_prgMis.cache.size > 30000) _prgMis.cache.clear();
  _prgMis.cache.set(k, w);
  return w;
}
// Riga più lunga di un testo su più righe.
function _prgMisuraRighe(s, peso, px) {
  return String(s).split('\n').reduce((m, r) => Math.max(m, prgMisuraTesto(r.trim(), peso, px)), 0);
}
// Intestazione: va a capo su al massimo due righe, quindi basta metà testo (o la parola più lunga).
function _prgLargIntestazione(titolo) {
  const t = String(titolo || '');
  const tot = prgMisuraTesto(t, '600', 12);
  const parola = t.split(/\s+/).reduce((m, p) => Math.max(m, prgMisuraTesto(p, '600', 12)), 0);
  const unaRiga = tot <= 150;   // titoli corti restano su una riga
  return Math.ceil((unaRiga ? tot : Math.max(parola, tot / 2 + 14)) + 32);  // padding + freccia + maniglia
}

/* Larghezza automatica di una colonna: il valore più lungo fra tutti gli elementi della board
   (non solo quelli filtrati o nei gruppi aperti, così non cambia mentre si cerca). */
function prgLarghezzaAuto(c, els) {
  let max = 0;
  const mis = (s, peso, px) => { const x = _prgMisuraRighe(s, peso || '400', px || 13); if (x > max) max = x; };
  let extra = 16;   // padding della cella + margine
  switch (c.tipo) {
    case 'check': max = 20; break;
    case 'stato': {
      const usati = new Set(els.map(e => e.valori && e.valori[c.id]).filter(Boolean));
      const opz = (c.opzioni || []).filter(o => !usati.size || usati.has(o.id));
      opz.forEach(o => mis(o.label, '500', 12.5));
      extra = 22;
      break;
    }
    case 'timeline':
      els.forEach(e => { const t = prgTimelineTesto(e.valori && e.valori[c.id]); if (t) mis(t, '400', 12); });
      extra = 34;
      break;
    case 'settimane':
      els.forEach(e => mis(prgSettimane(e.valori && e.valori[c.da])));
      break;
    case 'numero': {
      let tot = 0;
      els.forEach(e => {
        const v = e.valori && e.valori[c.id];
        if (v === undefined || v === null || v === '') return;
        if (typeof v === 'number') tot += Math.abs(v);
        mis(prgFmtNumero(v) + (c.unita ? ' ' + c.unita : ''));
      });
      if (tot) mis(prgFmtNumero(tot) + (c.unita ? ' ' + c.unita : ''), '600', 12);   // riepilogo del gruppo
      break;
    }
    case 'email': case 'telefono':
      els.forEach(e => { const v = e.valori && e.valori[c.id]; if (v) mis(v); });
      extra = 40;   // icona ✉ / ☎
      break;
    default:
      els.forEach(e => { const v = e.valori && e.valori[c.id]; if (v !== undefined && v !== null && v !== '') mis(prgTesto(c, v, e)); });
  }
  const w = Math.max(_prgLargIntestazione(c.titolo), Math.ceil(max + extra));
  return Math.max(PRG_LARG_MIN, Math.min(PRG_LARG_MAX, w));
}

function prgLarghezzaNomeAuto(b, els) {
  let max = 0;
  els.forEach(e => { const x = _prgMisuraRighe(e.nome || '', '500', 13); if (x > max) max = x; });
  const w = Math.max(_prgLargIntestazione((b.config && b.config.titoloNome) || 'Elemento'), Math.ceil(max + 70));  // bordo colore + 💬 n
  return Math.max(PRG_LARG_NOME[0], Math.min(PRG_LARG_NOME[1], w));
}

/* Larghezze in uso: trascinata a mano (questo browser) > fissata in «⚙️ Colonne» > automatica. */
function prgLarghezze(b, cols) {
  const pb = prgPrefB(b.id);
  const els = prgEls(b.id);
  const out = {};
  out.__nome = Number(pb.larg.__nome) || prgLarghezzaNomeAuto(b, els);
  cols.forEach(c => { out[c.id] = Number(pb.larg[c.id]) || Number(c.larghezza) || prgLarghezzaAuto(c, els); });
  return out;
}

/* Trascinamento del bordo destro di un'intestazione: allarga/stringe la colonna dal vivo e la
   ricorda in questo browser. Tutte le intestazioni ripetute nei gruppi condividono il <colgroup>. */
function prgRidimensiona(h, ev) {
  const b = prgBoard();
  const tab = document.querySelector('#prg-corpo .prg-table');
  if (!b || !tab) return;
  const id = h.dataset.prgRs;
  const col = tab.querySelector('col[data-col="' + CSS.escape(id) + '"]');
  if (!col) return;
  const w0 = parseFloat(col.style.width) || 100, tw0 = parseFloat(tab.style.width) || 0, x0 = ev.clientX;
  let w = w0;
  document.body.classList.add('prg-ridim');
  const muovi = e => {
    w = Math.max(50, Math.min(1200, Math.round(w0 + e.clientX - x0)));
    col.style.width = w + 'px';
    tab.style.width = (tw0 + w - w0) + 'px';
  };
  const fine = () => {
    document.removeEventListener('mousemove', muovi);
    document.removeEventListener('mouseup', fine);
    document.body.classList.remove('prg-ridim');
    _prg.ridimFine = Date.now();
    if (w === w0) return;
    prgPrefB(b.id).larg[id] = w;
    prgSalvaPref();
    prgRenderTesta();    // compare «↔ Larghezze automatiche»
  };
  document.addEventListener('mousemove', muovi);
  document.addEventListener('mouseup', fine);
}

function prgRigaHtml(b, cols, el, colore, w) {
  const nCom = prgNumCommenti(b.id, el.id);
  let h = '<tr class="prg-row" data-id="' + el.id + '">'
    + '<td class="prg-sticky prg-nome" style="--g:' + prgEsc(colore) + '" data-prg-apri="' + el.id + '" title="Apri l\'elemento">'
    + '<span class="prg-nome-t">' + (el.nome ? prgEsc(el.nome) : '<i class="text-slate-400">senza nome</i>') + '</span>'
    + '<span class="prg-com' + (nCom ? ' on' : '') + '" title="' + (nCom ? nCom + ' aggiornamenti' : 'Nessun aggiornamento') + '">💬' + (nCom ? ' ' + nCom : '') + '</span>'
    + '</td>';
  cols.forEach(c => {
    const v = el.valori ? el.valori[c.id] : undefined;
    h += '<td class="prg-c prg-c-' + c.tipo + (w && c.tipo !== 'settimane' ? ' prg-ed' : '') + '" data-col="' + prgEsc(c.id) + '">' + prgCellaHtml(c, v, el) + '</td>';
  });
  return h + '</tr>';
}

function prgEtichettaHtml(o, extra) {
  const col = (o && o.colore) || '#c4c4c4';
  return '<span class="prg-lbl' + (extra || '') + '" style="background:' + prgEsc(col) + ';color:' + prgTestoSuColore(col) + '">' + prgEsc(o ? o.label : '') + '</span>';
}

function prgCellaHtml(c, v, el) {
  const vuoto = v === undefined || v === null || v === '';
  switch (c.tipo) {
    case 'stato': {
      if (vuoto) return '<span class="prg-lbl prg-lbl-vuota"></span>';
      const o = (c.opzioni || []).find(x => x.id === v);
      return o ? prgEtichettaHtml(o) : '<span class="prg-lbl" style="background:#94a3b8;color:#fff" title="Etichetta non più presente fra quelle della colonna">?</span>';
    }
    case 'check': return v ? '<span class="prg-chk on">✓</span>' : '<span class="prg-chk"></span>';
    case 'numero': return vuoto ? '' : prgEsc(prgFmtNumero(v)) + (c.unita ? ' <span class="text-slate-400">' + prgEsc(c.unita) + '</span>' : '');
    case 'data': {
      if (vuoto) return '';
      return '<span title="' + prgEsc(prgFmtData(v)) + '">' + prgEsc(prgFmtData(v)) + '</span>';
    }
    case 'data_ora': return vuoto ? '' : prgEsc(prgFmtDataOra(v));
    case 'timeline': return prgTimelineHtml(v, el);
    case 'settimane': return prgEsc(prgSettimane(el.valori && el.valori[c.da]));
    case 'email': return vuoto ? '' : '<span class="prg-trunc">' + prgEsc(v) + '</span>'
      + '<a class="prg-link" href="mailto:' + prgEsc(String(v).split(/[\s,;]+/)[0]) + '" title="Scrivi una mail" target="_blank" rel="noopener">✉</a>';
    case 'telefono': return vuoto ? '' : '<span class="prg-trunc">' + prgEsc(v) + '</span>'
      + '<a class="prg-link" href="tel:' + prgEsc(String(v).replace(/[^\d+]/g, '').slice(0, 15)) + '" title="Chiama">☎</a>';
    case 'testo_lungo': return vuoto ? '' : '<span class="prg-trunc" title="' + prgEsc(v) + '">' + prgEsc(v) + '</span>';
    default: return vuoto ? '' : '<span class="prg-trunc" title="' + prgEsc(v) + '">' + prgEsc(v) + '</span>';
  }
}

/* '' -> null (svuota), «1.234,5» / «12,5» / «12.5» -> number, testo non numerico -> undefined. */
function prgParseNumero(s) {
  let t = String(s === null || s === undefined ? '' : s).trim().replace(/\s/g, '');
  if (t === '') return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t.replace(',', '.'));
  return isFinite(n) ? n : undefined;
}

function prgFmtNumero(v) {
  return typeof v === 'number' ? v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : String(v);
}

function prgTimelineTesto(v) {
  if (!v || !v.inizio || !_prgYmd(v.inizio)) return '';
  const fine = _prgYmd(v.fine) ? v.fine : v.inizio;
  const anni = _prgYmd(v.inizio)[0] !== _prgYmd(fine)[0] || _prgYmd(fine)[0] !== new Date().getFullYear();
  return v.inizio === fine ? prgDataBreve(v.inizio, anni) : prgDataBreve(v.inizio, anni) + ' – ' + prgDataBreve(fine, anni);
}

function prgTimelineHtml(v) {
  const txt = prgTimelineTesto(v);
  if (!txt) return '';
  const fine = _prgYmd(v.fine) ? v.fine : v.inizio;
  const oggi = prgOggiYmd();
  const t0 = new Date(v.inizio).getTime(), t1 = new Date(fine).getTime(), tn = new Date(oggi).getTime();
  const pct = t1 > t0 ? Math.max(0, Math.min(100, Math.round((tn - t0) / (t1 - t0) * 100))) : (tn >= t0 ? 100 : 0);
  return '<div class="prg-tl" title="' + prgEsc(prgFmtData(v.inizio) + ' – ' + prgFmtData(fine)) + '"><div class="prg-tl-fill" style="width:' + pct + '%"></div><span>' + prgEsc(txt) + '</span></div>';
}

/* Testo semplice di un valore: ricerca, export, storico. */
function prgTesto(c, v, el) {
  if (!c) return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (c.tipo === 'settimane') return prgSettimane(el && el.valori && el.valori[c.da]);
  if (v === undefined || v === null || v === '') return '';
  switch (c.tipo) {
    case 'stato': { const o = (c.opzioni || []).find(x => x.id === v); return o ? o.label : '?'; }
    case 'check': return v ? '✓' : '';
    case 'numero': return prgFmtNumero(v);
    case 'data': return prgFmtData(v);
    case 'data_ora': return prgFmtDataOra(v);
    case 'timeline': return v && v.inizio ? prgFmtData(v.inizio) + (v.fine && v.fine !== v.inizio ? ' – ' + prgFmtData(v.fine) : '') : '';
    default: return String(v);
  }
}

function prgRiepilogoHtml(cols, els) {
  let h = '<tr class="prg-sum"><td class="prg-sticky"></td>';
  cols.forEach(c => {
    let x = '';
    if (c.tipo === 'numero' && (c.riepilogo || 'somma') !== 'nessuno') {
      const nums = els.map(e => e.valori && e.valori[c.id]).filter(v => typeof v === 'number');
      if (nums.length) {
        const s = nums.reduce((a, n) => a + n, 0);
        x = '<span title="' + (c.riepilogo === 'media' ? 'Media' : 'Somma') + ' su ' + nums.length + ' elementi">'
          + prgEsc(prgFmtNumero(c.riepilogo === 'media' ? s / nums.length : s)) + (c.unita ? ' ' + prgEsc(c.unita) : '') + '</span>';
      }
    } else if (c.tipo === 'check') {
      x = els.filter(e => e.valori && e.valori[c.id]).length + '/' + els.length;
    } else if (c.tipo === 'stato') {
      const cnt = new Map();
      els.forEach(e => { const v = e.valori && e.valori[c.id]; if (v) cnt.set(v, (cnt.get(v) || 0) + 1); });
      const tot = els.length;
      if (cnt.size) {
        x = '<div class="prg-distr">' + (c.opzioni || []).filter(o => cnt.has(o.id)).map(o =>
          '<span style="flex:' + cnt.get(o.id) + ';background:' + prgEsc(o.colore || '#c4c4c4') + '" title="' + prgEsc(o.label + ': ' + cnt.get(o.id) + '/' + tot) + '"></span>').join('')
          + (tot - [...cnt.values()].reduce((a, n) => a + n, 0) > 0
            ? '<span style="flex:' + (tot - [...cnt.values()].reduce((a, n) => a + n, 0)) + ';background:#e2e8f0" title="Vuoti"></span>' : '')
          + '</div>';
      }
    } else if (c.tipo === 'timeline') {
      const tl = els.map(e => e.valori && e.valori[c.id]).filter(v => v && v.inizio);
      if (tl.length) {
        const a = tl.map(v => v.inizio).sort()[0];
        const z = tl.map(v => v.fine || v.inizio).sort().pop();
        x = '<span class="text-slate-500">' + prgEsc(prgDataBreve(a, true) + ' – ' + prgDataBreve(z, true)) + '</span>';
      }
    }
    h += '<td>' + x + '</td>';
  });
  return h + '</tr>';
}

/* ---------- salvataggio di un campo ---------- */
async function prgSalvaValore(el, campo, valore) {
  if (!sbGuardWrite()) return false;
  if (valore === '' || valore === undefined) valore = null;
  const prima = campo === '__nome' ? el.nome : (el.valori || {})[campo];
  if (JSON.stringify(prima === undefined ? null : prima) === JSON.stringify(valore)) return true;
  // ottimistico: si vede subito, si torna indietro se il server rifiuta
  if (campo === '__nome') el.nome = valore || '';
  else {
    el.valori = Object.assign({}, el.valori);
    if (valore === null) delete el.valori[campo]; else el.valori[campo] = valore;
  }
  prgRenderTabella();
  try {
    const { data, error } = await _sbClient.rpc('prg_imposta', { p_id: el.id, p_campo: campo, p_valore: valore });
    if (error) throw error;
    if (!data || !data.length) throw new Error('modifica non consentita o elemento eliminato');
    _prgAggiornaCache(data[0]);
    return true;
  } catch (e) {
    if (campo === '__nome') el.nome = prima || '';
    else {
      el.valori = Object.assign({}, el.valori);
      if (prima === undefined || prima === null) delete el.valori[campo]; else el.valori[campo] = prima;
    }
    prgRenderTabella();
    showAlertModal('Modifica non salvata: ' + (e.message || String(e)));
    return false;
  }
}

function _prgAggiornaCache(riga) {
  if (!riga || !_prg.caricate[riga.board_id]) return;
  const arr = _prg.elementi[riga.board_id];
  const i = arr.findIndex(x => x.id === riga.id);
  if (i >= 0) arr[i] = Object.assign(arr[i], riga);
  else arr.push(riga);
}

/* ---------- modifica in tabella ---------- */
function prgCellaClick(td) {
  if (!sbCanWrite()) return;
  const tr = td.closest('tr[data-id]');
  const b = prgBoard();
  if (!tr || !b) return;
  const el = prgEl(Number(tr.dataset.id));
  const c = prgCol(b, td.dataset.col);
  if (!el || !c) return;
  const v = el.valori ? el.valori[c.id] : undefined;
  switch (c.tipo) {
    case 'settimane': return;
    case 'check': prgSalvaValore(el, c.id, v ? null : true); return;
    case 'stato': prgPopStato(td, el, c); return;
    case 'testo_lungo': prgPopTesto(td, el, c); return;
    case 'timeline': prgPopTimeline(td, el, c); return;
    default: prgInlineInput(td, el, c, v);
  }
}

function prgInlineInput(td, el, c, v) {
  // Numeri in un campo di testo: un <input type=number> scarta «12,5» e il valore si perderebbe.
  const tipi = { data: 'date', data_ora: 'datetime-local' };
  const inp = document.createElement('input');
  inp.type = tipi[c.tipo] || 'text';
  inp.className = 'prg-inline';
  if (c.tipo === 'numero') inp.inputMode = 'decimal';
  inp.value = v === undefined || v === null ? '' : (c.tipo === 'data_ora' ? String(v).slice(0, 16)
    : (c.tipo === 'numero' && typeof v === 'number' ? String(v).replace('.', ',') : String(v)));
  _prg.editing = { id: el.id, col: c.id };
  td.innerHTML = '';
  td.appendChild(inp);
  inp.focus();
  if (inp.select && inp.type === 'text') inp.select();
  let fatto = false;
  const fine = salva => {
    if (fatto) return;
    fatto = true;
    _prg.editing = null;
    if (!salva) { prgRenderTabella(); return; }
    let nv = inp.value.trim();
    if (c.tipo === 'numero') {
      nv = prgParseNumero(nv);
      if (nv === undefined) { prgRenderTabella(); showAlertModal('«' + inp.value.trim() + '» non è un numero: valore non cambiato.'); return; }
    }
    prgSalvaValore(el, c.id, nv === '' ? null : nv);
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); fine(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fine(false); }
  });
  inp.addEventListener('blur', () => fine(true));
}

/* Popover unico, ancorato alla cella; si chiude cliccando fuori o con Esc. */
function prgPopApri(anchor, html, onClose) {
  prgPopChiudi();
  const pop = document.createElement('div');
  pop.id = 'prg-pop';
  pop.className = 'prg-pop';
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left + window.scrollX;
  if (left + pw > window.scrollX + window.innerWidth - 8) left = window.scrollX + window.innerWidth - pw - 8;
  let top = r.bottom + window.scrollY + 4;
  if (r.bottom + ph + 8 > window.innerHeight && r.top - ph - 4 > 0) top = r.top + window.scrollY - ph - 4;
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.top = top + 'px';
  pop._onClose = onClose;
  return pop;
}
function prgPopChiudi() {
  const p = document.getElementById('prg-pop');
  if (!p) return;
  const cb = p._onClose;
  p.remove();
  if (cb) cb();
}
document.addEventListener('mousedown', e => {
  const p = document.getElementById('prg-pop');
  if (p && !p.contains(e.target)) prgPopChiudi();
});

function prgPopStato(td, el, c) {
  const v = el.valori ? el.valori[c.id] : undefined;
  const html = '<div class="prg-pop-stato">' + (c.opzioni || []).map(o =>
    '<button data-prg-opt="' + prgEsc(o.id) + '" class="prg-pop-opt' + (o.id === v ? ' on' : '') + '">' + prgEtichettaHtml(o) + '</button>').join('')
    + '<button data-prg-opt="" class="prg-pop-opt"><span class="prg-lbl prg-lbl-vuota">— vuoto —</span></button></div>';
  _prg.editing = { id: el.id, col: c.id };
  const pop = prgPopApri(td, html, () => { _prg.editing = null; if (_prg.renderPending) prgRenderTabella(); });
  pop.addEventListener('click', e => {
    const bt = e.target.closest('[data-prg-opt]');
    if (!bt) return;
    _prg.editing = null;
    pop._onClose = null;
    prgPopChiudi();
    prgSalvaValore(el, c.id, bt.dataset.prgOpt || null);
  });
}

function prgPopTesto(td, el, c) {
  const v = el.valori ? el.valori[c.id] : '';
  _prg.editing = { id: el.id, col: c.id };
  const pop = prgPopApri(td, '<div class="prg-pop-form"><div class="prg-pop-tit">' + prgEsc(c.titolo) + '</div>'
    + '<textarea rows="6" class="prg-ta">' + prgEsc(v || '') + '</textarea>'
    + '<div class="flex justify-end gap-2 mt-2"><button class="prg-btn" data-prg-pop="annulla">Annulla</button>'
    + '<button class="prg-btn prg-btn-pri" data-prg-pop="salva">Salva</button></div></div>',
    () => { _prg.editing = null; if (_prg.renderPending) prgRenderTabella(); });
  const ta = pop.querySelector('textarea');
  ta.focus();
  const salva = () => { const nv = ta.value.trim(); pop._onClose = null; _prg.editing = null; prgPopChiudi(); prgSalvaValore(el, c.id, nv || null); };
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-prg-pop]');
    if (!a) return;
    if (a.dataset.prgPop === 'salva') salva(); else prgPopChiudi();
  });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salva(); });
}

function prgPopTimeline(td, el, c) {
  const v = (el.valori && el.valori[c.id]) || {};
  _prg.editing = { id: el.id, col: c.id };
  const pop = prgPopApri(td, '<div class="prg-pop-form"><div class="prg-pop-tit">' + prgEsc(c.titolo) + '</div>'
    + '<label class="prg-pop-lab">Dal <input type="date" data-tl="inizio" value="' + prgEsc(v.inizio || '') + '"></label>'
    + '<label class="prg-pop-lab">Al <input type="date" data-tl="fine" value="' + prgEsc(v.fine || '') + '"></label>'
    + '<div class="flex justify-between gap-2 mt-2"><button class="prg-btn" data-prg-pop="svuota">Svuota</button>'
    + '<span><button class="prg-btn" data-prg-pop="annulla">Annulla</button> '
    + '<button class="prg-btn prg-btn-pri" data-prg-pop="salva">Salva</button></span></div></div>',
    () => { _prg.editing = null; if (_prg.renderPending) prgRenderTabella(); });
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-prg-pop]');
    if (!a) return;
    const azione = a.dataset.prgPop;
    if (azione === 'annulla') { prgPopChiudi(); return; }
    let nv = null;
    if (azione === 'salva') {
      const i = pop.querySelector('[data-tl="inizio"]').value, f = pop.querySelector('[data-tl="fine"]').value;
      if (i || f) {
        nv = { inizio: i || f, fine: f || i };
        if (nv.fine < nv.inizio) { showAlertModal('La data di fine è prima di quella di inizio.'); return; }
      }
    }
    pop._onClose = null;
    _prg.editing = null;
    prgPopChiudi();
    prgSalvaValore(el, c.id, nv);
  });
}

/* ---------- nuovo elemento ---------- */
async function prgAggiungiElemento(inp) {
  if (!sbGuardWrite()) return;
  const b = prgBoard();
  const nome = inp.value.trim();
  if (!b || !nome) return;
  const gc = prgColonnaGruppo(b);
  const g = inp.dataset.prgAdd;
  const valori = {};
  if (gc && g && g !== '__nessuno' && g !== '__tutti') valori[gc.id] = g;
  const ordine = prgEls(b.id).reduce((m, e) => Math.max(m, Number(e.ordine) || 0), 0) + 1;
  inp.disabled = true;
  try {
    const { data, error } = await _sbClient.from(PRG_T.el).insert({ board_id: b.id, nome, valori, ordine }).select().single();
    if (error) throw error;
    _prgAggiornaCache(data);
    prgRenderTabella();
    const nuovo = document.querySelector('#prg-corpo [data-prg-add="' + CSS.escape(g) + '"]');
    if (nuovo) nuovo.focus();
  } catch (e) {
    inp.disabled = false;
    showAlertModal('Elemento non creato: ' + (e.message || String(e)));
  }
}

/* ---------- pannello elemento (drawer) ---------- */
function prgApriDrawer(id, tab) {
  _prg.drawer = { id, tab: tab || (_prg.drawer && _prg.drawer.id === id ? _prg.drawer.tab : 'dettagli'), commenti: null, storico: null };
  let d = document.getElementById('prg-drawer');
  if (!d) {
    d = document.createElement('div');
    d.id = 'prg-drawer';
    d.className = 'prg-drawer';
    document.body.appendChild(d);
    d.addEventListener('click', prgDrawerClick);
    d.addEventListener('change', prgDrawerChange);
  }
  d.style.display = 'flex';
  document.querySelectorAll('#prg-corpo tr.prg-row.sel').forEach(r => r.classList.remove('sel'));
  const tr = document.querySelector('#prg-corpo tr.prg-row[data-id="' + id + '"]');
  if (tr) tr.classList.add('sel');
  prgRenderDrawer();
  if (_prg.drawer.tab === 'commenti') prgCaricaCommenti();
  if (_prg.drawer.tab === 'storico') prgCaricaStorico();
}

function prgChiudiDrawer() {
  _prg.drawer = null;
  const d = document.getElementById('prg-drawer');
  if (d) d.style.display = 'none';
  document.querySelectorAll('#prg-corpo tr.prg-row.sel').forEach(r => r.classList.remove('sel'));
}

function prgRenderDrawer() {
  const d = document.getElementById('prg-drawer');
  if (!d || !_prg.drawer) return;
  const el = prgEl(_prg.drawer.id);
  const b = el ? _prg.boards.find(x => x.id === el.board_id) : null;
  if (!el || !b) {
    d.innerHTML = '<div class="p-6 text-sm text-slate-500">Elemento non più presente (eliminato da un collega?). '
      + '<button class="underline" data-prg-d="chiudi">Chiudi</button></div>';
    return;
  }
  const w = sbCanWrite();
  const tab = _prg.drawer.tab;
  const nCom = prgNumCommenti(b.id, el.id);
  const g = prgGruppi(b).find(x => x.id === prgGruppoDi(b, el)) || {};
  let h = '<div class="prg-dr-head" style="--g:' + prgEsc(g.colore || '#c4c4c4') + '">'
    + '<div class="flex items-start gap-2">'
    + (w ? '<input class="prg-dr-nome" data-prg-dcol="__nome" value="' + prgEsc(el.nome) + '" placeholder="Nome elemento">'
      : '<div class="prg-dr-nome">' + prgEsc(el.nome) + '</div>')
    + '<button class="prg-dr-x" data-prg-d="chiudi" title="Chiudi (Esc)">✕</button></div>'
    + '<div class="text-xs text-slate-500 mt-1">' + prgEsc(b.nome) + (g.label ? ' · ' + prgEsc(g.label) : '') + '</div>'
    + '<div class="prg-dr-tabs">'
    + '<button data-prg-dtab="dettagli" class="' + (tab === 'dettagli' ? 'on' : '') + '">Dettagli</button>'
    + '<button data-prg-dtab="commenti" class="' + (tab === 'commenti' ? 'on' : '') + '">💬 Aggiornamenti' + (nCom ? ' (' + nCom + ')' : '') + '</button>'
    + '<button data-prg-dtab="storico" class="' + (tab === 'storico' ? 'on' : '') + '">🕘 Storico</button>'
    + '</div></div><div class="prg-dr-body">';
  if (tab === 'dettagli') h += prgDrawerDettagliHtml(b, el, w);
  else if (tab === 'commenti') h += prgDrawerCommentiHtml(el, w);
  else h += prgDrawerStoricoHtml(b, el, w);
  h += '</div>';
  d.innerHTML = h;
}

function prgDrawerDettagliHtml(b, el, w) {
  let h = '<div class="prg-dr-campi">';
  prgCols(b).forEach(c => {
    const v = el.valori ? el.valori[c.id] : undefined;
    h += '<div class="prg-dr-campo"><div class="prg-dr-lab" title="' + prgEsc(prgEtichettaTipo(c.tipo)) + '">' + prgEsc(c.titolo) + '</div><div class="prg-dr-val">';
    if (!w || c.tipo === 'settimane') {
      h += '<div class="prg-dr-ro">' + (prgCellaHtml(c, v, el) || '<span class="text-slate-300">—</span>') + '</div>';
    } else {
      const a = ' data-prg-dcol="' + prgEsc(c.id) + '"';
      const vs = v === undefined || v === null ? '' : String(v);
      switch (c.tipo) {
        case 'stato':
          h += '<select class="prg-dr-inp"' + a + '><option value="">—</option>' + (c.opzioni || []).map(o =>
            '<option value="' + prgEsc(o.id) + '"' + (o.id === v ? ' selected' : '') + '>' + prgEsc(o.label) + '</option>').join('') + '</select>'
            + (v ? ' ' + prgCellaHtml(c, v, el).replace('class="prg-lbl', 'class="prg-lbl prg-lbl-mini') : '');
          break;
        case 'check':
          h += '<input type="checkbox"' + a + (v ? ' checked' : '') + '>';
          break;
        case 'testo_lungo':
          h += '<textarea rows="3" class="prg-dr-inp"' + a + '>' + prgEsc(vs) + '</textarea>';
          break;
        case 'timeline': {
          const t = v || {};
          h += '<input type="date" class="prg-dr-inp prg-dr-half" data-prg-dcol="' + prgEsc(c.id) + '" data-tl="inizio" value="' + prgEsc(t.inizio || '') + '"> – '
            + '<input type="date" class="prg-dr-inp prg-dr-half" data-prg-dcol="' + prgEsc(c.id) + '" data-tl="fine" value="' + prgEsc(t.fine || '') + '">';
          break;
        }
        case 'numero':
          h += '<input type="text" inputmode="decimal" class="prg-dr-inp prg-dr-half"' + a + ' value="' + prgEsc(typeof v === 'number' ? String(v).replace('.', ',') : vs) + '">'
            + (c.unita ? ' <span class="text-xs text-slate-400">' + prgEsc(c.unita) + '</span>' : '');
          break;
        case 'data':
          h += '<input type="date" class="prg-dr-inp"' + a + ' value="' + prgEsc(vs.slice(0, 10)) + '">';
          break;
        case 'data_ora':
          h += '<input type="datetime-local" class="prg-dr-inp"' + a + ' value="' + prgEsc(vs.slice(0, 16)) + '">';
          break;
        default:
          h += '<input type="text" class="prg-dr-inp"' + a + ' value="' + prgEsc(vs) + '">';
          if (c.tipo === 'email' && vs) h += ' <a class="prg-link" href="mailto:' + prgEsc(vs.split(/[\s,;]+/)[0]) + '" target="_blank" rel="noopener">✉</a>';
          if (c.tipo === 'telefono' && vs) h += ' <a class="prg-link" href="tel:' + prgEsc(vs.replace(/[^\d+]/g, '').slice(0, 15)) + '">☎</a>';
      }
    }
    h += '</div></div>';
  });
  h += '</div><div class="prg-dr-foot">'
    + '<div>Creato ' + prgEsc(prgDataOraTs(el.created_at)) + (el.updated_by ? ' · ultima modifica ' + prgEsc(prgDataOraTs(el.updated_at)) + ' da ' + prgEsc(prgNomeDaEmail(el.updated_by)) : '') + '</div>'
    + (el.monday_id ? '<div>Importato da Monday (item ' + prgEsc(el.monday_id) + ')</div>' : '')
    + (w ? '<button class="prg-btn prg-btn-del mt-3" data-prg-d="elimina" data-help-key="prg-elimina-elemento">🗑 Elimina elemento</button>' : '')
    + '</div>';
  return h;
}

function prgDrawerChange(e) {
  const t = e.target;
  if (!t.dataset || !t.dataset.prgDcol || !_prg.drawer) return;
  const el = prgEl(_prg.drawer.id);
  if (!el) return;
  const b = _prg.boards.find(x => x.id === el.board_id);
  const campo = t.dataset.prgDcol;
  if (campo === '__nome') { prgSalvaValore(el, '__nome', t.value.trim()).then(() => prgRenderDrawer()); return; }
  const c = prgCol(b, campo);
  if (!c) return;
  let nv;
  if (c.tipo === 'check') nv = t.checked ? true : null;
  else if (c.tipo === 'numero') {
    nv = prgParseNumero(t.value);
    if (nv === undefined) { showAlertModal('«' + t.value.trim() + '» non è un numero: valore non cambiato.'); prgRenderDrawer(); return; }
  }
  else if (c.tipo === 'timeline') {
    const box = t.parentElement;
    const i = box.querySelector('[data-tl="inizio"]').value, f = box.querySelector('[data-tl="fine"]').value;
    nv = (i || f) ? { inizio: i || f, fine: f || i } : null;
    if (nv && nv.fine < nv.inizio) { showAlertModal('La data di fine è prima di quella di inizio.'); return; }
  } else nv = t.value.trim() || null;
  prgSalvaValore(el, campo, nv).then(() => { if (c.tipo === 'stato') prgRenderDrawer(); });
}

async function prgDrawerClick(e) {
  const tabBtn = e.target.closest('[data-prg-dtab]');
  if (tabBtn && _prg.drawer) {
    _prg.drawer.tab = tabBtn.dataset.prgDtab;
    prgRenderDrawer();
    if (_prg.drawer.tab === 'commenti') prgCaricaCommenti();
    if (_prg.drawer.tab === 'storico') prgCaricaStorico();
    return;
  }
  const a = e.target.closest('[data-prg-d]');
  if (!a || !_prg.drawer) return;
  const az = a.dataset.prgD;
  const el = prgEl(_prg.drawer.id);
  if (az === 'chiudi') { prgChiudiDrawer(); return; }
  if (!el) return;
  if (az === 'elimina') prgEliminaElemento(el);
  else if (az === 'pubblica') prgPubblicaCommento(el);
  else if (az === 'del-com') prgEliminaCommento(Number(a.dataset.id));
  else if (az === 'ripristina') {
    const r = (_prg.drawer.storico || []).find(x => x.id === Number(a.dataset.id));
    if (!r) return;
    const b = _prg.boards.find(x => x.id === el.board_id);
    const c = prgCol(b, r.campo);
    const nomeCampo = r.campo === '__nome' ? 'Nome' : (c ? c.titolo : r.campo);
    if (!(await showConfirmAsync('Riportare «' + nomeCampo + '» al valore «' + (prgTesto(c, r.prima, el) || 'vuoto') + '»?', 'Ripristina'))) return;
    const ok = await prgSalvaValore(el, r.campo, r.prima === undefined ? null : r.prima);
    if (ok) prgCaricaStorico();
  }
}

async function prgEliminaElemento(el) {
  if (!sbGuardWrite()) return;
  if (!(await showConfirmAsync('Eliminare «' + (el.nome || 'senza nome') + '» con i suoi aggiornamenti e il suo storico? Non si può annullare.', 'Elimina'))) return;
  try {
    const { data, error } = await _sbClient.from(PRG_T.el).delete().eq('id', el.id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('eliminazione non consentita');
    _prgRimuoviElemento(el.id);
    sbLogActivity('Programmazione: elemento eliminato', { board: el.board_id, elemento: el.nome, valori: el.valori });
    prgChiudiDrawer();
    prgRenderTabella();
  } catch (e) {
    showAlertModal('Elemento non eliminato: ' + (e.message || String(e)));
  }
}

function _prgRimuoviElemento(id) {
  for (const k in _prg.elementi) {
    const i = _prg.elementi[k].findIndex(x => x.id === id);
    if (i >= 0) _prg.elementi[k].splice(i, 1);
  }
}

/* ---------- aggiornamenti (commenti) ---------- */
async function prgCaricaCommenti() {
  const dr = _prg.drawer;
  if (!dr) return;
  try {
    const { data, error } = await _sbClient.from(PRG_T.com).select('*').eq('elemento_id', dr.id);
    if (error) throw error;
    if (_prg.drawer !== dr) return;
    const quando = r => r.data_originale || r.created_at;
    dr.commenti = (data || []).sort((a, b) => String(quando(b)).localeCompare(String(quando(a))));
  } catch (e) {
    if (_prg.drawer === dr) dr.commenti = { errore: e.message || String(e) };
  }
  if (_prg.drawer === dr && dr.tab === 'commenti') prgRenderDrawer();
}

function prgDrawerCommentiHtml(el, w) {
  const dr = _prg.drawer;
  let h = '';
  if (w) {
    h += '<div class="prg-com-comp"><textarea id="prg-com-testo" rows="3" class="prg-dr-inp" placeholder="Scrivi un aggiornamento… (Ctrl+Invio per pubblicare)"></textarea>'
      + '<div class="flex justify-end mt-2"><button class="prg-btn prg-btn-pri" data-prg-d="pubblica" data-help-key="prg-pubblica">Pubblica</button></div></div>';
  }
  const rows = dr.commenti;
  if (!rows) return h + '<div class="text-sm text-slate-400 py-6 text-center">Caricamento…</div>';
  if (rows.errore) return h + '<div class="text-sm text-red-600 py-6 text-center">Errore: ' + prgEsc(rows.errore) + '</div>';
  if (!rows.length) return h + '<div class="text-sm text-slate-400 py-6 text-center">Nessun aggiornamento.</div>';
  const mio = (_sbUser && _sbUser.id) || '';
  return h + rows.map(r => {
    const monday = r.origine === 'monday';
    const autore = monday ? (r.autore_nome || prgNomeDaEmail(r.autore_originale)) : (r.autore_nome || prgNomeDaEmail(r.autore_email));
    const puo = w && (r.user_id === mio || sbIsAdmin());
    return '<div class="prg-com-card">'
      + '<div class="flex items-center gap-2 mb-1"><span class="font-semibold text-slate-700 text-sm">' + prgEsc(autore) + '</span>'
      + '<span class="text-xs text-slate-400">' + prgEsc(prgDataOraTs(r.data_originale || r.created_at)) + '</span>'
      + (monday ? '<span class="prg-badge" title="Importato da Monday">Monday</span>' : '')
      + (puo ? '<button class="ml-auto prg-com-del" data-prg-d="del-com" data-id="' + r.id + '" title="Elimina">🗑</button>' : '')
      + '</div><div class="prg-com-testo">' + prgEsc(r.testo) + '</div></div>';
  }).join('');
}

async function prgPubblicaCommento(el) {
  if (!sbGuardWrite()) return;
  const ta = document.getElementById('prg-com-testo');
  const testo = ta ? ta.value.trim() : '';
  if (!testo) { if (ta) ta.focus(); return; }
  try {
    const { data, error } = await _sbClient.from(PRG_T.com).insert({
      elemento_id: el.id, board_id: el.board_id, testo, autore_nome: _pwNvNomeUtente(),
    }).select('id,elemento_id').single();
    if (error) throw error;
    if (_prg.commenti[el.board_id]) _prg.commenti[el.board_id].set(data.id, data.elemento_id);
    await prgCaricaCommenti();
    prgRenderTabella();
  } catch (e) {
    showAlertModal('Aggiornamento non pubblicato: ' + (e.message || String(e)));
  }
}

async function prgEliminaCommento(id) {
  if (!id || !sbGuardWrite()) return;
  if (!(await showConfirmAsync('Eliminare questo aggiornamento?', 'Elimina'))) return;
  try {
    const { data, error } = await _sbClient.from(PRG_T.com).delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('puoi eliminare solo i tuoi aggiornamenti');
    for (const k in _prg.commenti) _prg.commenti[k].delete(id);
    await prgCaricaCommenti();
    prgRenderTabella();
  } catch (e) {
    showAlertModal('Aggiornamento non eliminato: ' + (e.message || String(e)));
  }
}

/* ---------- storico ---------- */
async function prgCaricaStorico() {
  const dr = _prg.drawer;
  if (!dr) return;
  try {
    const { data, error } = await _sbClient.from(PRG_T.sto).select('*').eq('elemento_id', dr.id)
      .order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    if (_prg.drawer === dr) dr.storico = data || [];
  } catch (e) {
    if (_prg.drawer === dr) dr.storico = { errore: e.message || String(e) };
  }
  if (_prg.drawer === dr && dr.tab === 'storico') prgRenderDrawer();
}

function prgDrawerStoricoHtml(b, el, w) {
  const rows = _prg.drawer.storico;
  if (!rows) return '<div class="text-sm text-slate-400 py-6 text-center">Caricamento…</div>';
  if (rows.errore) return '<div class="text-sm text-red-600 py-6 text-center">Errore: ' + prgEsc(rows.errore) + '</div>';
  if (!rows.length) return '<div class="text-sm text-slate-400 py-6 text-center">Nessuna modifica registrata dopo la creazione.</div>';
  return rows.map(r => {
    const c = r.campo === '__nome' ? null : prgCol(b, r.campo);
    const titolo = r.campo === '__nome' ? 'Nome' : (c ? c.titolo : r.campo + ' (colonna eliminata)');
    const val = x => {
      const t = r.campo === '__nome' ? (x || '') : prgTesto(c, x, el);
      return t ? prgEsc(t) : '<i class="text-slate-400">vuoto</i>';
    };
    return '<div class="prg-sto-row">'
      + '<div class="text-xs text-slate-400">' + prgEsc(prgDataOraTs(r.created_at)) + ' · ' + prgEsc(prgNomeDaEmail(r.autore_email) || 'sistema') + '</div>'
      + '<div class="text-sm"><b>' + prgEsc(titolo) + '</b>: ' + val(r.prima) + ' → ' + val(r.dopo)
      + (w && (c || r.campo === '__nome') ? ' <button class="prg-sto-rip" data-prg-d="ripristina" data-id="' + r.id + '" title="Riporta il campo al valore di prima" data-help-key="prg-ripristina">↶ ripristina</button>' : '')
      + '</div></div>';
  }).join('');
}

/* ---------- board: nuova / modifica / elimina ---------- */
function prgModalApri(titolo, corpo, piede, largo) {
  let m = document.getElementById('prg-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'prg-modal';
    m.className = 'prg-modal-bg';
    m.addEventListener('mousedown', e => { if (e.target === m) prgModalChiudi(); });
    document.body.appendChild(m);
  }
  m.innerHTML = '<div class="prg-modal' + (largo ? ' largo' : '') + '"><div class="prg-modal-head"><span>' + prgEsc(titolo) + '</span>'
    + '<button class="prg-dr-x" data-prg-m="chiudi" title="Chiudi">✕</button></div>'
    + '<div class="prg-modal-body" id="prg-modal-body">' + corpo + '</div>'
    + '<div class="prg-modal-foot" id="prg-modal-foot">' + (piede || '') + '</div></div>';
  m.style.display = 'flex';
  m.querySelector('[data-prg-m="chiudi"]').onclick = prgModalChiudi;
  return m;
}
function prgModalChiudi() {
  const m = document.getElementById('prg-modal');
  if (m) { m.style.display = 'none'; m.innerHTML = ''; }
}

function prgOpzioniCommessa(sel) {
  return '<option value="">— nessuna —</option>' + prgCommesse().map(c =>
    '<option value="' + prgEsc(c) + '"' + (c === sel ? ' selected' : '') + '>' + prgEsc(c) + '</option>').join('');
}

function prgNuovaBoard() {
  if (!sbGuardWrite()) return;
  const m = prgModalApri('Nuova board',
    '<label class="prg-f-lab">Nome<input id="prg-nb-nome" class="prg-f-inp" placeholder="es. SINFI MMS/PEDESTRIAN"></label>'
    + '<label class="prg-f-lab">Commessa<select id="prg-nb-comm" class="prg-f-inp">' + prgOpzioniCommessa('') + '</select></label>'
    + '<p class="text-xs text-slate-500 mt-2">Parte con le colonne Stato, Regione, Timeline, Settimane, Scadenza e Note; le cambi poi da «⚙️ Colonne». '
    + 'Per ricreare una board di Monday usa invece «📥 Importa da Monday».</p>',
    '<button class="prg-btn" data-prg-m="chiudi2">Annulla</button><button class="prg-btn prg-btn-pri" id="prg-nb-ok">Crea</button>');
  m.querySelector('[data-prg-m="chiudi2"]').onclick = prgModalChiudi;
  document.getElementById('prg-nb-nome').focus();
  document.getElementById('prg-nb-ok').onclick = async () => {
    const nome = document.getElementById('prg-nb-nome').value.trim();
    if (!nome) { document.getElementById('prg-nb-nome').focus(); return; }
    const colonne = prgColonneDefault();
    try {
      const { data, error } = await _sbClient.from(PRG_T.board).insert({
        nome, commessa: document.getElementById('prg-nb-comm').value || null, colonne,
        config: { gruppo: colonne[0].id }, ordine: _prg.boards.reduce((mx, x) => Math.max(mx, x.ordine || 0), 0) + 1,
      }).select().single();
      if (error) throw error;
      _prgUpsertBoard(data);
      _prg.elementi[data.id] = []; _prg.commenti[data.id] = new Map(); _prg.caricate[data.id] = true;
      sbLogActivity('Programmazione: board creata', { board: nome });
      prgModalChiudi();
      _prg.boardId = null;
      prgScegliBoard(data.id);
    } catch (e) { showAlertModal('Board non creata: ' + (e.message || String(e))); }
  };
}

function prgImpostazioniBoard() {
  const b = prgBoard();
  if (!b || !sbGuardWrite()) return;
  const m = prgModalApri('Board «' + b.nome + '»',
    '<label class="prg-f-lab">Nome<input id="prg-bs-nome" class="prg-f-inp" value="' + prgEsc(b.nome) + '"></label>'
    + '<label class="prg-f-lab">Commessa della dashboard<select id="prg-bs-comm" class="prg-f-inp">' + prgOpzioniCommessa(b.commessa || '') + '</select></label>'
    + '<label class="prg-f-lab">Titolo della prima colonna<input id="prg-bs-tn" class="prg-f-inp" value="' + prgEsc((b.config && b.config.titoloNome) || 'Elemento') + '"></label>'
    + '<div class="mt-5 pt-4 border-t border-slate-200"><button class="prg-btn prg-btn-del" id="prg-bs-del" data-help-key="prg-elimina-board">🗑 Elimina board</button>'
    + '<p class="text-xs text-slate-500 mt-1">Elimina la board con tutti gli elementi, gli aggiornamenti e lo storico.</p></div>',
    '<button class="prg-btn" data-prg-m="chiudi2">Annulla</button><button class="prg-btn prg-btn-pri" id="prg-bs-ok">Salva</button>');
  m.querySelector('[data-prg-m="chiudi2"]').onclick = prgModalChiudi;
  document.getElementById('prg-bs-ok').onclick = async () => {
    const nome = document.getElementById('prg-bs-nome').value.trim();
    if (!nome) return;
    const config = Object.assign({}, b.config, { titoloNome: document.getElementById('prg-bs-tn').value.trim() || 'Elemento' });
    try {
      const { data, error } = await _sbClient.from(PRG_T.board).update({ nome, commessa: document.getElementById('prg-bs-comm').value || null, config })
        .eq('id', b.id).select().single();
      if (error) throw error;
      _prgUpsertBoard(data);
      prgModalChiudi();
      prgRender();
    } catch (e) { showAlertModal('Board non salvata: ' + (e.message || String(e))); }
  };
  document.getElementById('prg-bs-del').onclick = async () => {
    const n = prgEls(b.id).length;
    if (!(await showConfirmAsync('Eliminare la board «' + b.nome + '» con ' + n + ' elementi, i loro aggiornamenti e lo storico? Non si può annullare.', 'Elimina board'))) return;
    try {
      const { data, error } = await _sbClient.from(PRG_T.board).delete().eq('id', b.id).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('eliminazione non consentita');
      sbLogActivity('Programmazione: board eliminata', { board: b.nome, elementi: n });
      _prgRimuoviBoard(b.id);
      prgModalChiudi();
      prgRender();
    } catch (e) { showAlertModal('Board non eliminata: ' + (e.message || String(e))); }
  };
}

function _prgUpsertBoard(riga) {
  const i = _prg.boards.findIndex(x => x.id === riga.id);
  if (i >= 0) _prg.boards[i] = riga; else _prg.boards.push(riga);
  _prg.boards.sort((a, b) => (a.ordine || 0) - (b.ordine || 0) || a.id - b.id);
}
function _prgRimuoviBoard(id) {
  _prg.boards = _prg.boards.filter(x => x.id !== id);
  delete _prg.elementi[id]; delete _prg.caricate[id]; delete _prg.commenti[id];
  if (_prg.boardId === id) {
    _prg.boardId = _prg.boards[0] ? _prg.boards[0].id : null;
    if (_prg.boardId && !_prg.caricate[_prg.boardId]) prgCaricaBoard(_prg.boardId).then(() => prgRender()).catch(() => {});
  }
  if (_prg.drawer) { const el = prgEl(_prg.drawer.id); if (!el) prgChiudiDrawer(); }
}

/* ---------- vista: colonne visibili (solo questo browser) ---------- */
function prgVista() {
  const b = prgBoard();
  if (!b) return;
  const pb = prgPrefB(b.id);
  const m = prgModalApri('Colonne visibili · ' + b.nome,
    '<p class="text-xs text-slate-500 mb-3">Vale solo per te, in questo browser. Per cambiare le colonne della board per tutti usa «⚙️ Colonne».</p>'
    + '<div class="prg-vista-list">' + prgCols(b).map(c =>
      '<label class="prg-vista-it"><input type="checkbox" data-prg-vis="' + prgEsc(c.id) + '"' + (pb.nascoste.includes(c.id) ? '' : ' checked') + '> '
      + prgEsc(c.titolo) + ' <span class="text-xs text-slate-400">' + prgEsc(prgEtichettaTipo(c.tipo)) + '</span></label>').join('') + '</div>',
    '<button class="prg-btn" id="prg-vis-tutte">Mostra tutte</button><button class="prg-btn prg-btn-pri" data-prg-m="chiudi2">Fatto</button>');
  m.querySelector('[data-prg-m="chiudi2"]').onclick = prgModalChiudi;
  m.querySelectorAll('[data-prg-vis]').forEach(cb => cb.addEventListener('change', () => {
    const id = cb.dataset.prgVis;
    pb.nascoste = pb.nascoste.filter(x => x !== id);
    if (!cb.checked) pb.nascoste.push(id);
    prgSalvaPref();
    prgRenderTabella();
  }));
  document.getElementById('prg-vis-tutte').onclick = () => {
    pb.nascoste = [];
    prgSalvaPref();
    m.querySelectorAll('[data-prg-vis]').forEach(cb => { cb.checked = true; });
    prgRenderTabella();
  };
}

/* ---------- export Excel (tutti i ruoli) ---------- */
function prgEsporta() {
  const b = prgBoard();
  if (!b || typeof XLSX === 'undefined') return;
  const cols = prgCols(b);
  const gruppi = prgGruppi(b);
  const righe = [['Gruppo', (b.config && b.config.titoloNome) || 'Elemento'].concat(cols.map(c => c.titolo))];
  gruppi.forEach(g => {
    prgOrdina(b, prgEls(b.id).filter(el => prgGruppoDi(b, el) === g.id)).forEach(el => {
      righe.push([g.label, el.nome].concat(cols.map(c => {
        const v = el.valori && el.valori[c.id];
        return c.tipo === 'numero' && typeof v === 'number' ? v : prgTesto(c, v, el);
      })));
    });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), b.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Board');
  XLSX.writeFile(wb, b.nome.replace(/[\\/?*:"<>|]/g, '_') + '_' + prgOggiYmd() + '.xlsx');
}

/* ---------- eventi dello screen (delegati: niente onclick inline con stringhe dinamiche) ---------- */
function prgBind() {
  const root = document.getElementById('prg-root');
  if (!root || root._prgBound) return;
  root._prgBound = true;
  root.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('a[href]') || t.closest('input.prg-inline')) return;
    // fine di un trascinamento della larghezza: non è un clic per ordinare
    if (t.closest('[data-prg-rs]') || Date.now() - (_prg.ridimFine || 0) < 300) return;
    let x;
    if ((x = t.closest('[data-prg-board]'))) { prgScegliBoard(Number(x.dataset.prgBoard)); return; }
    if ((x = t.closest('[data-prg-azione]'))) { prgAzione(x.dataset.prgAzione); return; }
    if ((x = t.closest('[data-prg-grp]'))) {
      const b = prgBoard(); if (!b) return;
      const pb = prgPrefB(b.id), id = x.dataset.prgGrp;
      pb.chiusi = pb.chiusi.includes(id) ? pb.chiusi.filter(g => g !== id) : pb.chiusi.concat(id);
      prgSalvaPref(); prgRenderTabella(); return;
    }
    if ((x = t.closest('[data-prg-sort]'))) {
      const b = prgBoard(); if (!b) return;
      const pb = prgPrefB(b.id), col = x.dataset.prgSort;
      const o = pb.ord && pb.ord.col === col ? pb.ord : null;
      pb.ord = !o ? { col, dir: 'asc' } : (o.dir === 'asc' ? { col, dir: 'desc' } : null);
      prgSalvaPref(); prgRenderTabella(); return;
    }
    if ((x = t.closest('[data-prg-apri]'))) { prgApriDrawer(Number(x.dataset.prgApri)); return; }
    if ((x = t.closest('td.prg-ed'))) { prgCellaClick(x); return; }
  });
  root.addEventListener('input', e => {
    if (e.target.id !== 'prg-cerca') return;
    const b = prgBoard(); if (!b) return;
    prgPrefB(b.id).cerca = e.target.value;
    prgSalvaPref();
    prgRenderTabella();
  });
  root.addEventListener('keydown', e => {
    if (e.target.dataset && e.target.dataset.prgAdd !== undefined && e.key === 'Enter') { e.preventDefault(); prgAggiungiElemento(e.target); }
  });
  root.addEventListener('change', e => {
    if (e.target.id !== 'prg-raggruppa') return;
    const b = prgBoard(); if (!b) return;
    const def = prgColonnaGruppoBoard(b);
    const v = e.target.value;
    prgPrefB(b.id).gruppo = def && v === def.id ? null : v;
    prgSalvaPref();
    prgRenderTabella();
  });
  root.addEventListener('mousedown', e => {
    const h = e.target.closest && e.target.closest('[data-prg-rs]');
    if (!h || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    prgRidimensiona(h, e);
  });
  root.addEventListener('dblclick', e => {
    const h = e.target.closest && e.target.closest('[data-prg-rs]');
    if (!h) return;
    const b = prgBoard(); if (!b) return;
    delete prgPrefB(b.id).larg[h.dataset.prgRs];
    prgSalvaPref();
    prgRenderTesta();
    prgRenderTabella();
  });
}

function prgAzione(a) {
  const b = prgBoard();
  if (a === 'ricarica') { _prg.errore = null; _prg.pronto = false; prgEnter(); }
  else if (a === 'nuova-board') prgNuovaBoard();
  else if (a === 'importa') prgImpScegliFile();
  else if (a === 'vista') prgVista();
  else if (a === 'esporta') prgEsporta();
  else if (a === 'colonne') prgColonneApri();
  else if (a === 'board') prgImpostazioniBoard();
  else if ((a === 'comprimi' || a === 'espandi') && b) {
    const pb = prgPrefB(b.id);
    const ids = prgGruppi(b).map(g => g.id);
    pb.chiusi = a === 'comprimi' ? Array.from(new Set(pb.chiusi.concat(ids))) : pb.chiusi.filter(id => !ids.includes(id));
    prgSalvaPref(); prgRenderTabella();
  }
  else if (a === 'larghezze' && b) {
    prgPrefB(b.id).larg = {};
    prgSalvaPref(); prgRenderTesta(); prgRenderTabella();
  }
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const mr = document.getElementById('modal-root');
  if (mr && mr.innerHTML) return;               // conferma/avviso aperti sopra
  if (document.getElementById('prg-pop')) { prgPopChiudi(); return; }
  const m = document.getElementById('prg-modal');
  if (m && m.style.display === 'flex') { prgModalChiudi(); return; }
  if (_prg.drawer && !(e.target && e.target.closest && e.target.closest('input, textarea, select'))) prgChiudiDrawer();
});

/* ---------- Realtime ---------- */
let _prgRtTimer = null;
function _prgRtRender() {
  clearTimeout(_prgRtTimer);
  _prgRtTimer = setTimeout(() => {
    const scr = document.getElementById('screen-programmazione');
    if (!scr || scr.classList.contains('hidden')) return;
    if (_prg.boardId && !_prg.boards.some(x => x.id === _prg.boardId)) { prgRender(); return; }
    prgRenderTesta();
    prgRenderTabella();
    if (_prg.drawer) {
      const d = document.getElementById('prg-drawer');
      // non ridisegnare il pannello mentre si scrive in un suo campo
      if (!(d && d.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) prgRenderDrawer();
    }
  }, 150);
}

function prgSubscribe() {
  if (_prg.channel || !_sbClient) return;
  try {
    _prg.channel = _sbClient.channel('prg-programmazione')
      .on('postgres_changes', { event: '*', schema: 'public', table: PRG_T.board }, p => {
        if (p.eventType === 'DELETE') { if (p.old && p.old.id) _prgRimuoviBoard(p.old.id); }
        else if (p.new) _prgUpsertBoard(p.new);
        _prgRtRender();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: PRG_T.el }, p => {
        if (p.eventType === 'DELETE') { if (p.old && p.old.id) _prgRimuoviElemento(p.old.id); }
        else if (p.new) _prgAggiornaCache(p.new);
        _prgRtRender();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: PRG_T.com }, p => {
        if (p.eventType === 'INSERT' && p.new && _prg.commenti[p.new.board_id]) _prg.commenti[p.new.board_id].set(p.new.id, p.new.elemento_id);
        if (p.eventType === 'DELETE' && p.old) for (const k in _prg.commenti) _prg.commenti[k].delete(p.old.id);
        if (_prg.drawer && _prg.drawer.tab === 'commenti') prgCaricaCommenti();
        _prgRtRender();
      })
      .subscribe();
  } catch (e) { console.warn('Realtime programmazione:', e); }
}

/* Chiamata a fine login (sb-admin.js): se all'avvio è stata ripristinata la Programmazione,
   il primo prgEnter è partito senza utente e va rifatto ora. */
function prgDopoLogin() {
  const scr = document.getElementById('screen-programmazione');
  if (scr && !scr.classList.contains('hidden')) prgEnter();
}

function prgUnsubscribe() {
  if (_prg.channel) { try { _sbClient.removeChannel(_prg.channel); } catch (_) {} }
  _prg.channel = null;
  _prg.pronto = false;
  _prg.boards = []; _prg.elementi = {}; _prg.caricate = {}; _prg.commenti = {};
  prgChiudiDrawer();
}

/* ---------- guida col click destro (helpKeysFor: data-help-key) ---------- */
HELP_TEXTS['prg-nav'] = 'Apre la Programmazione: le board tipo Monday per la fase che precede la partenza dei rilievi (ODL, contatti col comune, documenti, sopralluoghi, qualità del dato, stato).\n\nI dati sono condivisi con i colleghi in tempo reale. Modificano admin e responsabili; gli altri ruoli consultano.';
HELP_TEXTS['prg-nuova-board'] = 'Crea una board vuota con le colonne Stato, Regione, Timeline, Settimane, Scadenza e Note, collegata se vuoi a una commessa della dashboard.\n\nLa board è condivisa con tutti. Colonne ed etichette si cambiano poi da «⚙️ Colonne».';
HELP_TEXTS['prg-importa'] = 'Ricrea una board di Monday dall\'Excel esportato (in Monday: menu della board → Esporta in Excel). Prima di importare mostra un\'anteprima con le colonne e i tipi proposti, che puoi correggere.\n\nCrea una nuova board o aggiorna una esistente: gli elementi si riconoscono dall\'Item ID di Monday, quindi reimportare non crea doppioni e le colonne aggiunte a mano restano. Importa anche gli aggiornamenti (foglio «updates») con autore e data originali.';
HELP_TEXTS['prg-importa-conferma'] = 'Scrive la board e i suoi elementi nella Programmazione condivisa.\n\nI valori delle colonne del file sostituiscono quelli già presenti negli stessi elementi (i valori di prima restano nello storico di ogni elemento). Gli elementi della board che non sono nel file non vengono toccati.';
HELP_TEXTS['prg-cerca'] = 'Filtra gli elementi della board: cerca nel nome e in tutte le colonne (etichette, contatti, note, date).\n\nSolo visualizzazione: la ricerca resta in questo browser.';
HELP_TEXTS['prg-vista'] = 'Sceglie quali colonne vedere nella tabella. Vale solo per te, in questo browser: i colleghi continuano a vederle tutte.\n\nNel pannello dell\'elemento le colonne nascoste restano visibili.';
HELP_TEXTS['prg-comprimi'] = 'Chiude tutti i gruppi: di ognuno resta solo la barra con il titolo e il numero di elementi. Un gruppo si apre e si chiude anche cliccando la sua barra.\n\nSolo visualizzazione, ricordata da questo browser.';
HELP_TEXTS['prg-espandi'] = 'Apre tutti i gruppi. Un gruppo si apre e si chiude anche cliccando la sua barra.\n\nSolo visualizzazione, ricordata da questo browser.';
HELP_TEXTS['prg-raggruppa'] = 'Sceglie la colonna di stato che divide le righe in gruppi (Stato, Regione, Priorità…), o nessun gruppo. «(board)» è quella impostata per tutti in «⚙️ Colonne».\n\nVale solo per te, in questo browser.';
HELP_TEXTS['prg-larghezze'] = 'Riporta tutte le colonne alla larghezza automatica, calcolata sul testo più lungo di ogni colonna. Le larghezze trascinate a mano (bordo destro dell\'intestazione) valgono solo in questo browser.';
HELP_TEXTS['prg-esporta'] = 'Scarica la board in un file Excel: una riga per elemento, con il gruppo e tutte le colonne come testo leggibile (i numeri restano numeri).\n\nNon modifica nulla.';
HELP_TEXTS['prg-colonne'] = 'Modifica le colonne della board per tutti: titolo, tipo, larghezza, ordine, etichette e colori delle colonne di stato, colonna che raggruppa la board.\n\nCambiando tipo i valori già inseriti vengono convertiti; quelli non convertibili si svuotano dopo una conferma e restano nello storico di ogni elemento.';
HELP_TEXTS['prg-colonne-salva'] = 'Salva le colonne per tutti i colleghi. Se elimini colonne con valori, togli etichette in uso o cambi tipo, prima ti chiede conferma e ti dice quanti valori vengono toccati.';
HELP_TEXTS['prg-board'] = 'Rinomina la board, la collega a una commessa della dashboard, cambia il titolo della prima colonna o elimina la board.\n\nEliminare la board cancella anche elementi, aggiornamenti e storico: non si può annullare.';
HELP_TEXTS['prg-elimina-board'] = 'Elimina la board con tutti i suoi elementi, gli aggiornamenti e lo storico, per tutti i colleghi. Non si può annullare.';
HELP_TEXTS['prg-elimina-elemento'] = 'Elimina l\'elemento con i suoi aggiornamenti e il suo storico, per tutti i colleghi. Non si può annullare (resta traccia nel registro attività dell\'admin).';
HELP_TEXTS['prg-pubblica'] = 'Pubblica l\'aggiornamento sull\'elemento, firmato con il tuo nome e l\'ora. I colleghi lo vedono subito. Puoi eliminare solo i tuoi (l\'admin tutti).';
HELP_TEXTS['prg-ripristina'] = 'Riporta il campo al valore che aveva prima di questa modifica. Il ripristino è a sua volta una modifica: finisce nello storico e si può ripristinare di nuovo.';
