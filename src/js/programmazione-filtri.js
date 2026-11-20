/* ==================== PROGRAMMAZIONE · FILTRI E VISTE (come Monday) ====================
   «▽ Filtro» nella barra della board apre un pannello con due modalità sullo STESSO modello:
     - filtri rapidi: una colonna per ogni colonna della board con i valori presenti e il loro
       conteggio (date e timeline con valori relativi: Oggi, Questa settimana, Scaduti…);
       cliccare un valore aggiunge/toglie quel valore alla regola «è» della colonna;
     - filtri avanzati: righe Colonna / Condizione / Valore unite da «e» oppure «o», più
       sottogruppi (un livello, come Monday) con il loro «e/o».
   Modello, per board, in _prg.pref.boards[id].filtro (solo questo browser):
     { op: 'e'|'o', regole: [ { id, col, cond, val } | { id, gruppo: true, op, regole: [...] } ] }
   Una regola incompleta (colonna/condizione/valore mancanti) è ignorata. Valori per condizione:
     e / non_e        array di chiavi (le stesse dei filtri rapidi, prgFChiavi)
     contiene / non_contiene   testo
     gt gte lt lte    numero (testo, letto con prgParseNumero)   tra (numero) [da, a]
     il prima dopo, inizia_*, finisce_*   'AAAA-MM-GG'            *tra (date) [da, a]
     vuoto / non_vuoto  nessun valore
   Viste personali (pref.viste, pref.vista = id attiva): filtro + ricerca + ordinamento +
   raggruppamento + colonne nascoste, salvate solo in questo browser. Nessuna scrittura su
   Supabase: filtri e viste non toccano i dati condivisi. */

const PRG_F_VUOTO = '__vuoto';
const PRG_F_REL_DATA = [
  ['oggi', 'Oggi'], ['domani', 'Domani'], ['ieri', 'Ieri'], ['sett', 'Questa settimana'],
  ['sett_prec', 'La settimana scorsa'], ['sett_succ', 'La prossima settimana'], ['mese', 'Questo mese'],
  ['passate', 'Date passate'], ['future', 'Date future'],
];
const PRG_F_REL_TL = [
  ['attuale', 'Attuale'], ['oggi', 'Da consegnare oggi'], ['sett', 'In corso questa settimana'],
  ['sett_succ', 'In corso la prossima settimana'], ['futuro', 'Futuro'], ['scaduto', 'Scaduti'],
];
const PRG_F_COND = {
  e: 'è', non_e: 'non è', contiene: 'contiene', non_contiene: 'non contiene',
  vuoto: 'è vuoto', non_vuoto: 'non è vuoto',
  gt: 'maggiore di', gte: 'maggiore o uguale a', lt: 'minore di', lte: 'minore o uguale a', tra: 'tra',
  il: 'è il', prima: 'prima del', dopo: 'dopo il',
  inizia_il: 'inizia il', inizia_prima: 'inizia prima del', inizia_dopo: 'inizia dopo il', inizia_tra: 'inizia tra',
  finisce_il: 'finisce il', finisce_prima: 'finisce prima del', finisce_dopo: 'finisce dopo il', finisce_tra: 'finisce tra',
};

const _prgF = { lista: null, nuovaVista: false, chiusoTs: 0, timer: null, rif: { k: '', v: null } };

/* ---------- colonne filtrabili: il nome + tutte le colonne (anche quelle della dashboard) ---------- */
function prgFCols(b) {
  return [{ id: '__nome', titolo: (b.config && b.config.titoloNome) || 'Elemento', tipo: 'nome' }].concat(prgColsTutte(b));
}
function prgFCol(b, id) { return prgFCols(b).find(c => c.id === id) || null; }
function _prgFTestuale(t) { return !['stato', 'numero', 'data', 'data_ora', 'timeline', 'check'].includes(t); }

function prgFCondizioni(c) {
  if (!c) return [];
  const vv = ['vuoto', 'non_vuoto'];
  switch (c.tipo) {
    case 'check': return ['e'];
    case 'stato': return ['e', 'non_e', 'contiene', 'non_contiene'].concat(vv);
    case 'numero': return ['e', 'non_e', 'gt', 'gte', 'lt', 'lte', 'tra'].concat(vv);
    case 'data': case 'data_ora': return ['e', 'non_e', 'il', 'prima', 'dopo', 'tra'].concat(vv);
    case 'timeline': return ['e', 'non_e', 'inizia_il', 'inizia_prima', 'inizia_dopo', 'inizia_tra',
      'finisce_il', 'finisce_prima', 'finisce_dopo', 'finisce_tra'].concat(vv);
    default: return ['e', 'non_e', 'contiene', 'non_contiene'].concat(vv);
  }
}
/* Che valore chiede una condizione: lista, testo, num, num2, data, data2, nessuno. */
function prgFTipoValore(c, cond) {
  if (cond === 'e' || cond === 'non_e') return 'lista';
  if (cond === 'contiene' || cond === 'non_contiene') return 'testo';
  if (cond === 'vuoto' || cond === 'non_vuoto' || !cond) return 'nessuno';
  if (c && c.tipo === 'numero') return cond === 'tra' ? 'num2' : 'num';
  return /tra$/.test(cond) ? 'data2' : 'data';
}

/* ---------- date di riferimento (oggi, settimana ISO lun–dom), ricalcolate al cambio di giorno ---------- */
function _prgFYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function prgFRif() {
  const oggi = prgOggiYmd();
  if (_prgF.rif.k === oggi) return _prgF.rif.v;
  const g = off => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return _prgFYmd(d); };
  const dow = (new Date().getDay() + 6) % 7;      // 0 = lunedì
  const v = {
    oggi, domani: g(1), ieri: g(-1), mese: oggi.slice(0, 7),
    lun: g(-dow), dom: g(6 - dow), lunPrec: g(-dow - 7), domPrec: g(-dow - 1), lunSucc: g(7 - dow), domSucc: g(13 - dow),
  };
  _prgF.rif = { k: oggi, v };
  return v;
}
function _prgFData(s) { return _prgYmd(s) ? String(s).slice(0, 10) : ''; }

/* ---------- valori di un elemento ---------- */
function prgFValore(b, c, el) {
  if (c.id === '__nome') return el.nome;
  return el.valori ? el.valori[c.id] : undefined;
}
function prgFTesto(b, c, el) {
  if (c.id === '__nome') return String(el.nome || '');
  return prgTesto(c, prgFValore(b, c, el), el);
}
/* Chiavi di un elemento per i filtri rapidi e la condizione «è»: un elemento può averne più
   d'una sulle date (es. «Oggi» e «Questa settimana»). */
function prgFChiavi(b, c, el) {
  const v = prgFValore(b, c, el);
  switch (c.tipo) {
    case 'stato': return v && (c.opzioni || []).some(o => o.id === v) ? [v] : [PRG_F_VUOTO];
    case 'check': return [v ? '1' : '0'];
    case 'numero': return typeof v === 'number' ? [String(v)] : [PRG_F_VUOTO];
    case 'data': case 'data_ora': {
      const d = _prgFData(v);
      if (!d) return [PRG_F_VUOTO];
      const r = prgFRif(), k = [];
      if (d === r.oggi) k.push('oggi');
      if (d === r.domani) k.push('domani');
      if (d === r.ieri) k.push('ieri');
      if (d >= r.lun && d <= r.dom) k.push('sett');
      if (d >= r.lunPrec && d <= r.domPrec) k.push('sett_prec');
      if (d >= r.lunSucc && d <= r.domSucc) k.push('sett_succ');
      if (d.slice(0, 7) === r.mese) k.push('mese');
      k.push(d < r.oggi ? 'passate' : d > r.oggi ? 'future' : '');
      return k.filter(Boolean);
    }
    case 'timeline': {
      const i = _prgFData(v && v.inizio);
      if (!i) return [PRG_F_VUOTO];
      const f = _prgFData(v.fine) || i;
      const r = prgFRif(), k = [];
      if (i <= r.oggi && f >= r.oggi) k.push('attuale');
      if (f === r.oggi) k.push('oggi');
      if (i <= r.dom && f >= r.lun) k.push('sett');
      if (i <= r.domSucc && f >= r.lunSucc) k.push('sett_succ');
      if (i > r.oggi) k.push('futuro');
      if (f < r.oggi) k.push('scaduto');
      return k;
    }
    default: {
      const s = prgFTesto(b, c, el).trim();
      return s ? [s] : [PRG_F_VUOTO];
    }
  }
}

/* Valori proponibili di una colonna, con il conteggio sugli elementi della board:
   [{ k, label, colore?, n }]. */
function prgFOpzioni(b, c, els) {
  const conta = new Map();
  els.forEach(el => prgFChiavi(b, c, el).forEach(k => conta.set(k, (conta.get(k) || 0) + 1)));
  const n = k => conta.get(k) || 0;
  let out;
  if (c.tipo === 'stato') out = (c.opzioni || []).map(o => ({ k: o.id, label: o.label, colore: o.colore || '#c4c4c4' }));
  else if (c.tipo === 'check') out = [{ k: '1', label: 'Spuntato' }, { k: '0', label: 'Non spuntato' }];
  else if (c.tipo === 'data' || c.tipo === 'data_ora') out = PRG_F_REL_DATA.map(x => ({ k: x[0], label: x[1] }));
  else if (c.tipo === 'timeline') out = PRG_F_REL_TL.map(x => ({ k: x[0], label: x[1] }));
  else {
    const ks = [...conta.keys()].filter(k => k !== PRG_F_VUOTO);
    if (c.tipo === 'numero') ks.sort((a, z) => Number(a) - Number(z));
    else ks.sort((a, z) => a.localeCompare(z, 'it', { numeric: true, sensitivity: 'base' }));
    out = ks.map(k => ({ k, label: c.tipo === 'numero' ? prgFmtNumero(Number(k)) + (c.unita ? ' ' + c.unita : '') : k }));
  }
  if (c.tipo !== 'check' && n(PRG_F_VUOTO)) out.push({ k: PRG_F_VUOTO, label: 'Vuoto', colore: c.tipo === 'stato' ? '#e2e8f0' : '' });
  out.forEach(o => { o.n = n(o.k); });
  return out;
}

/* ---------- modello del filtro ---------- */
function prgFFiltro(pb) {
  if (!pb.filtro || !Array.isArray(pb.filtro.regole)) pb.filtro = { op: 'e', regole: [] };
  return pb.filtro;
}
function prgFRegolaCompleta(b, r) {
  if (!r || r.gruppo) return false;
  const c = prgFCol(b, r.col);
  if (!c || !prgFCondizioni(c).includes(r.cond)) return false;
  const tv = prgFTipoValore(c, r.cond), v = r.val;
  switch (tv) {
    case 'lista': return Array.isArray(v) && v.length > 0;
    case 'testo': return typeof v === 'string' && v.trim() !== '';
    case 'num': return typeof prgParseNumero(v) === 'number';
    case 'num2': return Array.isArray(v) && typeof prgParseNumero(v[0]) === 'number' && typeof prgParseNumero(v[1]) === 'number';
    case 'data': return !!_prgFData(v);
    case 'data2': return Array.isArray(v) && !!_prgFData(v[0]) && !!_prgFData(v[1]);
    default: return true;
  }
}
/* Solo le regole che filtrano davvero (complete; gruppi senza regole complete tolti), senza id:
   serve a contare i filtri attivi e a capire se una vista è stata modificata. */
function prgFPulito(b, f) {
  const pul = lista => lista.map(r => {
    if (r.gruppo) {
      const sub = pul(r.regole || []);
      return sub.length ? { op: r.op === 'o' ? 'o' : 'e', regole: sub } : null;
    }
    return prgFRegolaCompleta(b, r) ? { col: r.col, cond: r.cond, val: r.val === undefined ? null : r.val } : null;
  }).filter(Boolean);
  return { op: f && f.op === 'o' ? 'o' : 'e', regole: pul((f && f.regole) || []) };
}
function prgFNumRegole(b) {
  const conta = l => l.reduce((s, r) => s + (r.regole ? conta(r.regole) : 1), 0);
  return conta(prgFPulito(b, prgFFiltro(prgPrefB(b.id))).regole);
}
function prgFiltroAttivo(b) { return !!b && prgFNumRegole(b) > 0; }

function _prgFRegolaPassa(b, r, el) {
  const c = prgFCol(b, r.col);
  const tv = prgFTipoValore(c, r.cond);
  const chiavi = () => prgFChiavi(b, c, el);
  switch (r.cond) {
    case 'vuoto': return c.tipo === 'check' ? !prgFValore(b, c, el) : chiavi().includes(PRG_F_VUOTO);
    case 'non_vuoto': return c.tipo === 'check' ? !!prgFValore(b, c, el) : !chiavi().includes(PRG_F_VUOTO);
    case 'e': return chiavi().some(k => r.val.includes(k));
    case 'non_e': return !chiavi().some(k => r.val.includes(k));
    case 'contiene': return prgFTesto(b, c, el).toLowerCase().includes(r.val.trim().toLowerCase());
    case 'non_contiene': return !prgFTesto(b, c, el).toLowerCase().includes(r.val.trim().toLowerCase());
  }
  if (tv === 'num' || tv === 'num2') {
    const v = prgFValore(b, c, el);
    if (typeof v !== 'number') return false;
    if (tv === 'num2') {
      const a = prgParseNumero(r.val[0]), z = prgParseNumero(r.val[1]);
      return v >= Math.min(a, z) && v <= Math.max(a, z);
    }
    const n = prgParseNumero(r.val);
    return r.cond === 'gt' ? v > n : r.cond === 'gte' ? v >= n : r.cond === 'lt' ? v < n : v <= n;
  }
  // date: per la timeline il giorno è l'inizio o la fine secondo la condizione
  const v = prgFValore(b, c, el);
  let d;
  if (c.tipo === 'timeline') {
    const i = _prgFData(v && v.inizio);
    d = /^finisce/.test(r.cond) ? (i ? _prgFData(v.fine) || i : '') : i;
  } else d = _prgFData(v);
  if (!d) return false;
  const tipo = r.cond.replace(/^(inizia|finisce)_/, '');
  if (tipo === 'tra') {
    const a = _prgFData(r.val[0]), z = _prgFData(r.val[1]);
    return d >= (a < z ? a : z) && d <= (a < z ? z : a);
  }
  const x = _prgFData(r.val);
  return tipo === 'il' ? d === x : tipo === 'prima' ? d < x : d > x;
}
function _prgFGruppoPassa(b, f, el) {
  const esiti = [];
  (f.regole || []).forEach(r => {
    if (r.gruppo) {
      if (prgFPulito(b, { regole: r.regole || [] }).regole.length) esiti.push(() => _prgFGruppoPassa(b, r, el));
    } else if (prgFRegolaCompleta(b, r)) esiti.push(() => _prgFRegolaPassa(b, r, el));
  });
  if (!esiti.length) return true;
  return f.op === 'o' ? esiti.some(fn => fn()) : esiti.every(fn => fn());
}
/* Usata da prgElementiFiltrati (programmazione.js), dopo la ricerca. */
function prgFiltroPassa(b, el) { return _prgFGruppoPassa(b, prgFFiltro(prgPrefB(b.id)), el); }

function prgFTrova(lista, id, padre) {
  for (const r of lista) {
    if (r.id === id) return { r, lista, padre: padre || null };
    if (r.gruppo) { const x = prgFTrova(r.regole || [], id, r); if (x) return x; }
  }
  return null;
}
function _prgFNuovaRegola() { return { id: prgNuovoId('f'), col: '', cond: '', val: null }; }

/* Filtro rapido: aggiunge/toglie il valore k alla regola «è» di primo livello della colonna. */
function prgFRapidoToggle(b, colId, k) {
  const f = prgFFiltro(prgPrefB(b.id));
  let r = f.regole.find(x => !x.gruppo && x.col === colId && x.cond === 'e');
  if (!r) { r = { id: prgNuovoId('f'), col: colId, cond: 'e', val: [] }; f.regole.push(r); }
  if (!Array.isArray(r.val)) r.val = [];
  r.val = r.val.includes(k) ? r.val.filter(x => x !== k) : r.val.concat(k);
  if (!r.val.length) f.regole = f.regole.filter(x => x !== r);
}
function prgFRapidoAttivo(f, colId, k) {
  const r = f.regole.find(x => !x.gruppo && x.col === colId && x.cond === 'e');
  return !!(r && Array.isArray(r.val) && r.val.includes(k));
}

/* ---------- barra della board ---------- */
function prgFiltroBarraHtml(b) {
  const pb = prgPrefB(b.id);
  const n = prgFNumRegole(b);
  let h = '<button id="prg-filtro-btn" class="prg-btn' + (n ? ' prg-btn-on' : '') + '" data-prg-azione="filtro" data-help-key="prg-filtro">▽ Filtro'
    + (n ? ' <span class="prg-f-badge">' + n + '</span>' : '') + '</button>';
  if (n) h += '<button class="prg-btn prg-btn-mini" data-prg-azione="filtro-via" data-help-key="prg-filtro-via" title="Togli tutti i filtri">✕</button>';
  const viste = pb.viste || [];
  if (viste.length) {
    const att = viste.find(v => v.id === pb.vista);
    h += '<select id="prg-vista-sel" class="prg-f-inp" data-help-key="prg-viste" title="Viste salvate in questo browser">'
      + '<option value="">Vista: tutti gli elementi</option>'
      + viste.map(v => '<option value="' + prgEsc(v.id) + '"' + (att === v ? ' selected' : '') + '>Vista: ' + prgEsc(v.nome)
        + (att === v && prgFVistaModificata(b) ? ' (modificata)' : '') + '</option>').join('')
      + '</select>';
  }
  return h;
}
function prgFiltroCancella(b) {
  const pb = prgPrefB(b.id);
  pb.filtro = { op: 'e', regole: [] };
  _prgF.lista = null;
  prgSalvaPref();
  prgFDopo(true, 0);
}

/* ---------- viste personali ---------- */
function _prgFSnap(b, pb) {
  return { filtro: prgFPulito(b, prgFFiltro(pb)), cerca: (pb.cerca || '').trim(), ord: pb.ord || null, gruppo: pb.gruppo || null, nascoste: (pb.nascoste || []).slice().sort() };
}
function prgFVistaModificata(b) {
  const pb = prgPrefB(b.id);
  const v = (pb.viste || []).find(x => x.id === pb.vista);
  if (!v) return false;
  const salvata = { filtro: prgFPulito(b, v.filtro), cerca: (v.cerca || '').trim(), ord: v.ord || null, gruppo: v.gruppo || null, nascoste: (v.nascoste || []).slice().sort() };
  return JSON.stringify(salvata) !== JSON.stringify(_prgFSnap(b, pb));
}
function _prgFCopiaFiltro(f) { return JSON.parse(JSON.stringify(f || { op: 'e', regole: [] })); }
function _prgFDatiVista(pb) {
  return { filtro: _prgFCopiaFiltro(pb.filtro), cerca: pb.cerca || '', ord: pb.ord || null, gruppo: pb.gruppo || null, nascoste: (pb.nascoste || []).slice() };
}
function prgFVistaSalva(b, nome) {
  const pb = prgPrefB(b.id);
  nome = String(nome || '').trim();
  if (!nome) return false;
  pb.viste = pb.viste || [];
  let v = pb.viste.find(x => x.nome.toLowerCase() === nome.toLowerCase());
  if (!v) { v = { id: prgNuovoId('v'), nome }; pb.viste.push(v); }
  Object.assign(v, _prgFDatiVista(pb));
  pb.vista = v.id;
  prgSalvaPref();
  return true;
}
function prgFVistaAggiorna(b) {
  const pb = prgPrefB(b.id);
  const v = (pb.viste || []).find(x => x.id === pb.vista);
  if (!v) return;
  Object.assign(v, _prgFDatiVista(pb));
  prgSalvaPref();
}
/* id '' = nessuna vista: toglie filtri e ricerca, lascia ordinamento, gruppi e colonne. */
function prgFVistaApplica(b, id) {
  const pb = prgPrefB(b.id);
  const v = (pb.viste || []).find(x => x.id === id);
  if (!v) {
    pb.vista = null;
    pb.filtro = { op: 'e', regole: [] };
    pb.cerca = '';
  } else {
    pb.vista = v.id;
    pb.filtro = _prgFCopiaFiltro(v.filtro);
    pb.cerca = v.cerca || '';
    pb.ord = v.ord || null;
    pb.gruppo = v.gruppo || null;
    pb.nascoste = (v.nascoste || []).slice();
  }
  _prgF.lista = null;
  prgSalvaPref();
  prgPopChiudi();
  prgRenderTesta();
  prgRenderTabella();
}
async function prgFVistaElimina(b) {
  const pb = prgPrefB(b.id);
  const v = (pb.viste || []).find(x => x.id === pb.vista);
  if (!v) return;
  if (!await showConfirmAsync('Eliminare la vista «' + v.nome + '»? I filtri attivi restano; la vista salvata in questo browser viene tolta.', 'Elimina')) return;
  pb.viste = pb.viste.filter(x => x !== v);
  pb.vista = null;
  prgSalvaPref();
  prgRenderTesta();
}

/* ---------- pannello ---------- */
function prgFiltroApri() {
  const b = prgBoard();
  const btn = document.getElementById('prg-filtro-btn');
  if (!b || !btn) return;
  const aperto = document.getElementById('prg-pop');
  if (aperto && aperto._prgFiltro) { prgPopChiudi(); return; }
  if (Date.now() - _prgF.chiusoTs < 300) return;     // il mousedown sul pulsante l'ha appena chiuso
  _prgF.lista = null;
  _prgF.nuovaVista = false;
  const pop = prgPopApri(btn, prgFPannelloHtml(b), () => { _prgF.chiusoTs = Date.now(); _prgF.lista = null; });
  pop._prgFiltro = true;
  pop.addEventListener('click', prgFClick);
  pop.addEventListener('change', prgFChange);
  pop.addEventListener('input', prgFInput);
  pop.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-prgf-nomevista]')) { e.preventDefault(); _prgFSalvaVistaDaInput(pop); }
  });
}

function _prgFConta(b) {
  const tot = prgEls(b.id).length;
  return prgFiltroAttivo(b) || (prgPrefB(b.id).cerca || '').trim()
    ? 'Mostra ' + prgElementiFiltrati(b).length + ' di ' + tot + ' elementi'
    : 'Mostra tutti i ' + tot + ' elementi';
}

function prgFPannelloHtml(b) {
  const pb = prgPrefB(b.id);
  const avanzati = pb.filtroModo === 'avanzati';
  const vista = (pb.viste || []).find(x => x.id === pb.vista);
  let testa = '<div class="prg-fpan-head"><b>' + (avanzati ? 'Filtri avanzati' : 'Filtri rapidi') + '</b>'
    + '<span class="prg-fpan-conta">' + prgEsc(_prgFConta(b)) + '</span>'
    + '<span class="prg-fpan-azioni">'
    + '<button class="prg-btn prg-btn-mini" data-prgf="cancella" data-help-key="prg-filtro-via"' + (prgFFiltro(pb).regole.length ? '' : ' disabled') + '>Cancella tutto</button>';
  if (vista && prgFVistaModificata(b)) testa += '<button class="prg-btn prg-btn-mini" data-prgf="aggiorna-vista" data-help-key="prg-vista-aggiorna">💾 Aggiorna «' + prgEsc(vista.nome) + '»</button>';
  if (vista) testa += '<button class="prg-btn prg-btn-mini prg-btn-del" data-prgf="elimina-vista" data-help-key="prg-vista-elimina">🗑 Elimina vista</button>';
  testa += _prgF.nuovaVista
    ? '<input class="prg-f-inp" data-prgf-nomevista placeholder="Nome della vista" maxlength="60" style="width:170px">'
      + '<button class="prg-btn prg-btn-mini prg-btn-pri" data-prgf="salva-vista" data-help-key="prg-vista-salva">Salva</button>'
    : '<button class="prg-btn prg-btn-mini" data-prgf="nuova-vista" data-help-key="prg-vista-salva">Salva come nuova vista</button>';
  testa += '</span></div>';
  const corpo = avanzati ? prgFAvanzatiHtml(b) : prgFRapidiHtml(b);
  return '<div class="prg-fpan">' + testa + corpo
    + '<div class="prg-fpan-foot"><button class="prg-fpan-link" data-prgf="modo">'
    + (avanzati ? 'Passa ai filtri rapidi' : 'Passa ai filtri avanzati') + '</button></div></div>';
}

function prgFRapidiHtml(b) {
  const f = prgFFiltro(prgPrefB(b.id));
  const els = prgEls(b.id);
  const cols = prgFCols(b);
  const altre = prgFPulito(b, f).regole.filter(r => r.regole || r.cond !== 'e').length;
  let h = (altre ? '<div class="prg-fq-nota">Ci sono anche ' + altre + ' filtri avanzati attivi: si vedono con «Passa ai filtri avanzati».</div>' : '')
    + (f.op === 'o' ? '<div class="prg-fq-nota">I filtri sono uniti con «o»: basta che un elemento ne soddisfi uno.</div>' : '')
    + '<div class="prg-fq">';
  cols.forEach(c => {
    const opz = prgFOpzioni(b, c, els);
    if (!opz.length) return;
    h += '<div class="prg-fq-col"><div class="prg-fq-tit" title="' + prgEsc(c.titolo) + '">' + prgEsc(c.titolo) + '</div><div class="prg-fq-list">'
      + opz.map(o => '<button class="prg-fq-chip' + (prgFRapidoAttivo(f, c.id, o.k) ? ' on' : '') + '" data-prgf-q="' + prgEsc(c.id) + '" data-k="' + prgEsc(o.k) + '" title="' + prgEsc(o.label) + '">'
        + (o.colore ? '<span class="prg-fq-dot" style="background:' + prgEsc(o.colore) + '"></span>' : '')
        + '<span class="prg-fq-l">' + prgEsc(o.label) + '</span><span class="prg-fq-n">' + (o.n || '–') + '</span></button>').join('')
      + '</div></div>';
  });
  return h + '</div>';
}

function _prgFOpSel(gid, op) {
  return '<select class="prg-f-inp prg-fa-op" data-prgf-op="' + prgEsc(gid) + '">'
    + '<option value="e"' + (op !== 'o' ? ' selected' : '') + '>e</option><option value="o"' + (op === 'o' ? ' selected' : '') + '>o</option></select>';
}
function _prgFPrefisso(i, gid, op) {
  if (i === 0) return '<span class="prg-fa-pre">Dove</span>';
  if (i === 1) return '<span class="prg-fa-pre">' + _prgFOpSel(gid, op) + '</span>';
  return '<span class="prg-fa-pre prg-fa-pre-t">' + (op === 'o' ? 'o' : 'e') + '</span>';
}

function prgFAvanzatiHtml(b) {
  const f = prgFFiltro(prgPrefB(b.id));
  if (!f.regole.length) f.regole.push(_prgFNuovaRegola());
  let h = '<div class="prg-fa">';
  f.regole.forEach((r, i) => {
    if (r.gruppo) {
      if (!r.regole || !r.regole.length) r.regole = [_prgFNuovaRegola()];
      h += '<div class="prg-fa-riga prg-fa-riga-g">' + _prgFPrefisso(i, '', f.op)
        + '<div class="prg-fa-gruppo">'
        + r.regole.map((s, j) => _prgFRigaHtml(b, s, j, r.id, r.op)).join('')
        + '<div class="prg-fa-add"><button class="prg-fpan-link" data-prgf="nuova-regola" data-g="' + prgEsc(r.id) + '">+ Nuovo filtro</button></div>'
        + '</div><button class="prg-fa-del" data-prgf-del="' + prgEsc(r.id) + '" title="Togli il gruppo">✕</button></div>';
    } else h += _prgFRigaHtml(b, r, i, '', f.op);
  });
  return h + '<div class="prg-fa-add"><button class="prg-fpan-link" data-prgf="nuova-regola" data-g="">+ Nuovo filtro</button>'
    + '<button class="prg-fpan-link" data-prgf="nuovo-gruppo" data-help-key="prg-filtro-gruppo">+ Nuovo gruppo</button></div></div>';
}

function _prgFRigaHtml(b, r, i, gid, op) {
  const c = prgFCol(b, r.col);
  const cols = prgFCols(b);
  let h = '<div class="prg-fa-riga">' + _prgFPrefisso(i, gid, op)
    + '<select class="prg-f-inp prg-fa-col" data-prgf-col="' + prgEsc(r.id) + '"><option value="">Colonna</option>'
    + cols.map(x => '<option value="' + prgEsc(x.id) + '"' + (x.id === r.col ? ' selected' : '') + '>' + prgEsc(x.titolo) + '</option>').join('')
    + '</select>'
    + '<select class="prg-f-inp prg-fa-cond" data-prgf-cond="' + prgEsc(r.id) + '"' + (c ? '' : ' disabled') + '><option value="">Condizione</option>'
    + prgFCondizioni(c).map(k => '<option value="' + k + '"' + (k === r.cond ? ' selected' : '') + '>' + prgEsc(PRG_F_COND[k]) + '</option>').join('')
    + '</select>'
    + '<span class="prg-fa-val">' + _prgFValoreHtml(b, c, r) + '</span>'
    + '<button class="prg-fa-del" data-prgf-del="' + prgEsc(r.id) + '" title="Togli il filtro">✕</button></div>';
  if (_prgF.lista === r.id && c && prgFTipoValore(c, r.cond) === 'lista') {
    const sel = Array.isArray(r.val) ? r.val : [];
    h += '<div class="prg-fa-check">' + prgFOpzioni(b, c, prgEls(b.id)).map(o =>
      '<label class="prg-fa-ck"><input type="checkbox" data-prgf-chk="' + prgEsc(r.id) + '" value="' + prgEsc(o.k) + '"' + (sel.includes(o.k) ? ' checked' : '') + '>'
      + (o.colore ? '<span class="prg-fq-dot" style="background:' + prgEsc(o.colore) + '"></span>' : '')
      + '<span class="prg-fq-l">' + prgEsc(o.label) + '</span><span class="prg-fq-n">' + (o.n || '–') + '</span></label>').join('')
      + '</div>';
  }
  return h;
}

function _prgFValoreHtml(b, c, r) {
  const tv = c ? prgFTipoValore(c, r.cond) : 'nessuno';
  const id = prgEsc(r.id);
  const inp = (v, i, tipo, ph) => '<input class="prg-f-inp" type="' + tipo + '" data-prgf-val="' + id + '"' + (i !== null ? ' data-i="' + i + '"' : '')
    + ' value="' + prgEsc(v === null || v === undefined ? '' : v) + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '>';
  const due = (tipo, ph) => { const v = Array.isArray(r.val) ? r.val : ['', '']; return inp(v[0], 0, tipo, ph) + '<span class="text-slate-400">e</span>' + inp(v[1], 1, tipo, ph); };
  switch (tv) {
    case 'lista': {
      const sel = Array.isArray(r.val) ? r.val : [];
      const opz = prgFOpzioni(b, c, prgEls(b.id));
      const nomi = sel.map(k => { const o = opz.find(x => x.k === k); return o ? o.label : k; });
      return '<button class="prg-f-inp prg-fa-lista' + (_prgF.lista === r.id ? ' on' : '') + '" data-prgf-lista="' + id + '" title="' + prgEsc(nomi.join(', ')) + '">'
        + '<span class="prg-fq-l">' + (nomi.length ? prgEsc(nomi.join(', ')) : '<span class="text-slate-400">Valore</span>') + '</span> ▾</button>';
    }
    case 'testo': return inp(r.val, null, 'text', 'Testo');
    case 'num': return inp(r.val, null, 'text', 'Numero');
    case 'num2': return due('text', 'Numero');
    case 'data': return inp(r.val, null, 'date');
    case 'data2': return due('date');
    default: return '<span class="prg-fa-vuoto">' + (c && r.cond ? '' : 'Valore') + '</span>';
  }
}

/* ---------- eventi del pannello ---------- */
/* Dopo una modifica: salva, ridisegna il pannello se serve, ridisegna barra e tabella
   (in ritardo mentre si scrive, per non rifare la tabella a ogni tasto). */
function prgFDopo(ridisegnaPannello, ritardo) {
  const b = prgBoard();
  if (!b) return;
  prgSalvaPref();
  const pop = document.getElementById('prg-pop');
  if (ridisegnaPannello && pop && pop._prgFiltro) pop.innerHTML = prgFPannelloHtml(b);
  clearTimeout(_prgF.timer);
  _prgF.timer = setTimeout(() => {
    prgRenderTesta();
    prgRenderTabella();
    const p = document.getElementById('prg-pop');
    const conta = p && p._prgFiltro && p.querySelector('.prg-fpan-conta');
    if (conta) conta.textContent = _prgFConta(b);
  }, ritardo || 0);
}

function _prgFSalvaVistaDaInput(pop) {
  const b = prgBoard();
  const inp = pop.querySelector('[data-prgf-nomevista]');
  if (!b || !inp) return;
  if (!prgFVistaSalva(b, inp.value)) { inp.focus(); return; }
  _prgF.nuovaVista = false;
  prgFDopo(true, 0);
}

function prgFClick(e) {
  const b = prgBoard();
  if (!b) return;
  const pb = prgPrefB(b.id);
  const f = prgFFiltro(pb);
  const t = e.target;
  let x;
  if ((x = t.closest('[data-prgf-q]'))) { prgFRapidoToggle(b, x.dataset.prgfQ, x.dataset.k); prgFDopo(true, 0); return; }
  if ((x = t.closest('[data-prgf-lista]'))) { _prgF.lista = _prgF.lista === x.dataset.prgfLista ? null : x.dataset.prgfLista; prgFDopo(true, 0); return; }
  if ((x = t.closest('[data-prgf-del]'))) {
    const tr = prgFTrova(f.regole, x.dataset.prgfDel);
    if (tr) {
      tr.lista.splice(tr.lista.indexOf(tr.r), 1);
      if (tr.padre && !tr.padre.regole.length) f.regole = f.regole.filter(r => r !== tr.padre);
    }
    prgFDopo(true, 0); return;
  }
  if (!(x = t.closest('[data-prgf]'))) return;
  const a = x.dataset.prgf;
  if (a === 'modo') { pb.filtroModo = pb.filtroModo === 'avanzati' ? 'rapidi' : 'avanzati'; _prgF.lista = null; prgFDopo(true, 0); }
  else if (a === 'cancella') prgFiltroCancella(b);
  else if (a === 'nuova-regola') {
    const g = x.dataset.g ? prgFTrova(f.regole, x.dataset.g) : null;
    (g ? g.r.regole : f.regole).push(_prgFNuovaRegola());
    prgFDopo(true, 0);
  }
  else if (a === 'nuovo-gruppo') { f.regole.push({ id: prgNuovoId('g'), gruppo: true, op: 'e', regole: [_prgFNuovaRegola()] }); prgFDopo(true, 0); }
  else if (a === 'nuova-vista') {
    _prgF.nuovaVista = true;
    prgFDopo(true, 0);
    const inp = document.querySelector('#prg-pop [data-prgf-nomevista]');
    if (inp) inp.focus();
  }
  else if (a === 'salva-vista') _prgFSalvaVistaDaInput(document.getElementById('prg-pop'));
  else if (a === 'aggiorna-vista') { prgFVistaAggiorna(b); prgFDopo(true, 0); }
  else if (a === 'elimina-vista') prgFVistaElimina(b);
}

function prgFChange(e) {
  const b = prgBoard();
  if (!b) return;
  const f = prgFFiltro(prgPrefB(b.id));
  const t = e.target, d = t.dataset;
  if (d.prgfOp !== undefined) {
    const g = d.prgfOp ? prgFTrova(f.regole, d.prgfOp) : null;
    (g ? g.r : f).op = t.value === 'o' ? 'o' : 'e';
    prgFDopo(true, 0); return;
  }
  if (d.prgfCol) {
    const tr = prgFTrova(f.regole, d.prgfCol);
    if (!tr) return;
    tr.r.col = t.value;
    const conds = prgFCondizioni(prgFCol(b, t.value));
    tr.r.cond = conds[0] || '';
    tr.r.val = null;
    _prgF.lista = prgFTipoValore(prgFCol(b, t.value), tr.r.cond) === 'lista' ? tr.r.id : null;
    prgFDopo(true, 0); return;
  }
  if (d.prgfCond) {
    const tr = prgFTrova(f.regole, d.prgfCond);
    if (!tr) return;
    const c = prgFCol(b, tr.r.col);
    const prima = prgFTipoValore(c, tr.r.cond);
    tr.r.cond = t.value;
    const dopo = prgFTipoValore(c, tr.r.cond);
    if (prima !== dopo) tr.r.val = null;
    _prgF.lista = dopo === 'lista' && !(Array.isArray(tr.r.val) && tr.r.val.length) ? tr.r.id : null;
    prgFDopo(true, 0); return;
  }
  if (d.prgfChk) {
    const tr = prgFTrova(f.regole, d.prgfChk);
    if (!tr) return;
    const v = Array.isArray(tr.r.val) ? tr.r.val : [];
    tr.r.val = t.checked ? (v.includes(t.value) ? v : v.concat(t.value)) : v.filter(k => k !== t.value);
    prgFDopo(true, 0);
  }
}

function prgFInput(e) {
  const t = e.target, d = t.dataset;
  if (!d.prgfVal) return;
  const b = prgBoard();
  if (!b) return;
  const tr = prgFTrova(prgFFiltro(prgPrefB(b.id)).regole, d.prgfVal);
  if (!tr) return;
  if (d.i !== undefined) {
    const v = Array.isArray(tr.r.val) ? tr.r.val.slice() : ['', ''];
    v[Number(d.i)] = t.value;
    tr.r.val = v;
  } else tr.r.val = t.value;
  prgFDopo(false, t.type === 'date' ? 0 : 250);
}

/* ---------- guida col click destro ---------- */
HELP_TEXTS['prg-filtro'] = 'Filtra gli elementi della board, come in Monday.\n\nFiltri rapidi: per ogni colonna i valori presenti con quanti elementi li hanno (date e timeline con Oggi, Questa settimana, Scaduti…); un clic sul valore lo aggiunge o lo toglie. Più valori della stessa colonna = basta uno; colonne diverse = tutte.\n\nFiltri avanzati: righe Colonna / Condizione / Valore unite da «e» o «o», con sottogruppi.\n\nSolo visualizzazione, ricordato da questo browser: i colleghi continuano a vedere tutto.';
HELP_TEXTS['prg-filtro-via'] = 'Toglie tutti i filtri della board (la ricerca resta). Solo visualizzazione, in questo browser.';
HELP_TEXTS['prg-filtro-gruppo'] = 'Aggiunge un sottogruppo di condizioni con il suo «e/o», come le parentesi: per esempio Stato è «Da pianificare» e (Regione è Lombardia o Regione è Piemonte).';
HELP_TEXTS['prg-viste'] = 'Viste salvate da te in questo browser: ognuna ricorda filtri, ricerca, ordinamento, raggruppamento e colonne visibili. «Tutti gli elementi» toglie filtri e ricerca.\n\nLe viste non sono condivise con i colleghi.';
HELP_TEXTS['prg-vista-salva'] = 'Salva filtri, ricerca, ordinamento, raggruppamento e colonne visibili come vista con un nome, in questo browser. Con un nome già usato aggiorna quella vista.';
HELP_TEXTS['prg-vista-aggiorna'] = 'Sovrascrive la vista attiva con filtri, ricerca, ordinamento, raggruppamento e colonne visibili di adesso. Solo in questo browser.';
HELP_TEXTS['prg-vista-elimina'] = 'Elimina la vista attiva da questo browser. I filtri che stai usando restano.';
