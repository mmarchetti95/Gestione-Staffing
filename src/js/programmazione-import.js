/* ==================== PROGRAMMAZIONE · IMPORT DA MONDAY (Excel) ====================
   «📥 Importa da Monday»: legge l'Excel esportato da una board Monday (Export board to Excel)
   e la ricrea in Programmazione. Formato del foglio 1: riga 1 = nome board; poi per ogni gruppo
   una riga col solo titolo del gruppo, la riga di intestazione (prima cella «Name»), gli
   elementi e una riga di riepilogo senza nome. Foglio «updates» (se c'è): gli aggiornamenti
   per Item ID, importati come commenti con autore e data originali.
   I tipi delle colonne si ricavano da nomi e valori (prgImpTipo) e si possono correggere
   nell'anteprima prima di importare. Reimportare lo stesso file (o uno più recente) nella
   stessa board aggiorna gli elementi per Item ID senza doppioni: i valori delle colonne del
   file sostituiscono quelli presenti, le colonne aggiunte a mano restano. Gli elementi non più
   nel file non vengono toccati (sono elencati nel resoconto).
   Le date si leggono dai numeri seriali di Excel (XLSX.SSF.parse_date_code), non con
   cellDates: niente sfasamenti di fuso orario. */

const PRG_IMP_SALTA = /^(sotto ?elementi|subitems|item id.*|monday doc.*|doc\b.*v2|creation log|last updated)$/i;
const _prgImp = { file: null, analisi: null };

function prgImpScegliFile() {
  if (!sbGuardWrite()) return;
  let inp = document.getElementById('prg-imp-file');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'prg-imp-file';
    inp.accept = '.xlsx,.xls';
    inp.className = 'hidden';
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.value = ''; if (f) prgImpLeggiFile(f); });
    document.body.appendChild(inp);
  }
  inp.click();
}

async function prgImpLeggiFile(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellNF: true });
    const an = prgImpAnalizza(wb);
    if (!an.elementi.length) { showAlertModal('Nel file non ho trovato elementi di una board Monday (manca la riga di intestazione con «Name»).'); return; }
    _prgImp.file = file.name;
    _prgImp.analisi = an;
    prgImpAnteprima();
  } catch (e) {
    showAlertModal('File non leggibile: ' + (e.message || String(e)));
  }
}

/* ---------- lettura del foglio ---------- */
function _prgImpCella(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return null;
  if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (d) return { _data: true, y: d.y, m: d.m, d: d.d, H: d.H, M: d.M };
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    const x = cell.v;
    return { _data: true, y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate(), H: x.getHours(), M: x.getMinutes() };
  }
  if (typeof cell.v === 'string') { const s = cell.v.trim(); return s === '' ? null : s; }
  return cell.v;
}

function _prgImpEIntestazione(riga) {
  const p = String(riga[0] || '').trim().toLowerCase();
  return (p === 'name' || p === 'nome' || p === 'item' || p === 'elemento') && riga.filter(v => v !== null).length >= 3;
}

function prgImpAnalizza(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rng = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const righe = [];
  for (let r = rng.s.r; r <= rng.e.r; r++) {
    const riga = [];
    for (let c = rng.s.c; c <= rng.e.c; c++) riga.push(_prgImpCella(ws, r, c));
    righe.push(riga);
  }
  const nomeBoard = String((righe[0] && righe[0][0]) || wb.SheetNames[0] || 'Board Monday').trim();
  const elementi = [];
  const gruppi = [];
  let intest = null, gruppo = null;
  for (let r = 1; r < righe.length; r++) {
    const riga = righe[r];
    const pieni = riga.filter(v => v !== null).length;
    if (!pieni) continue;
    if (_prgImpEIntestazione(riga)) { intest = riga.map(v => v === null ? '' : String(v).trim()); continue; }
    // titolo di gruppo: una sola cella piena in prima colonna, seguita dall'intestazione
    if (pieni === 1 && riga[0] !== null && righe[r + 1] && _prgImpEIntestazione(righe[r + 1])) {
      gruppo = String(riga[0]).trim();
      if (!gruppi.includes(gruppo)) gruppi.push(gruppo);
      continue;
    }
    if (!intest || riga[0] === null) continue;   // righe di riepilogo (senza nome)
    const celle = {};
    intest.forEach((h, i) => { if (h) celle[h] = riga[i]; });
    elementi.push({ nome: String(riga[0]).trim(), gruppo: gruppo || '', celle });
  }
  const intestazioni = intest || [];
  const colonne = prgImpColonne(intestazioni.slice(1), elementi, gruppi);
  const idCol = intestazioni.find(h => /^item id/i.test(h));
  elementi.forEach(el => {
    const v = idCol ? el.celle[idCol] : null;
    el.mondayId = v !== null && v !== undefined ? String(v) : 'nome:' + el.nome.toLowerCase();
  });
  return { nomeBoard, gruppi, elementi, colonne, aggiornamenti: prgImpAggiornamenti(wb) };
}

/* ---------- colonne e tipi ---------- */
function _prgImpEData(v) {
  return (v && v._data) || (typeof v === 'string' && (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)));
}
function _prgImpHaOra(v) {
  if (v && v._data) return !!(v.H || v.M);
  return typeof v === 'string' && /[ T](\d{2}):(\d{2})/.test(v) && !/[ T]00:00/.test(v);
}

function prgImpTipo(titolo, valori, haTimeline) {
  const t = String(titolo).toLowerCase();
  const vs = valori.filter(v => v !== null && v !== undefined && v !== '');
  if (/^(stato|status)$/.test(t)) return 'stato';
  if (!vs.length) return /note?|nota/.test(t) ? 'testo_lungo' : 'testo';
  if (vs.every(v => typeof v === 'string' && /^W\d{1,2}\s*-\s*W\d{1,2}$/i.test(v)) && haTimeline) return 'settimane';
  if (vs.every(v => v === true || (typeof v === 'string' && /^(v|x|✓|✔|si|sì|yes)$/i.test(v)))) return 'check';
  if (vs.every(_prgImpEData)) return vs.some(_prgImpHaOra) ? 'data_ora' : 'data';
  if (/mail/.test(t) && vs.some(v => /@/.test(String(v)))) return 'email';
  if (/telefono|\btel\b|cellulare|n° tel|phone/.test(t)) return 'telefono';
  if (vs.every(v => typeof v === 'number' || (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v)))) return 'numero';
  const testi = vs.map(v => String(v));
  const distinti = new Set(testi.map(s => s.toLowerCase())).size;
  const maxLen = Math.max(...testi.map(s => s.length));
  const conCifre = testi.filter(s => /\d/.test(s)).length;
  if (/^not[ae]/.test(t) || maxLen > 100) return 'testo_lungo';
  if (distinti <= 15 && vs.length >= 3 && distinti <= vs.length / 2 && maxLen <= 40 && conCifre <= vs.length / 2) return 'stato';
  return 'testo';
}

function prgImpColonne(intestazioni, elementi, gruppi) {
  const val = h => elementi.map(e => e.celle[h]);
  const usate = new Set();
  const colonne = [];
  // Timeline: coppie «X - Start» / «X - End»
  intestazioni.forEach(h => {
    const m = /^(.*)\s+-\s+start$/i.exec(h);
    if (!m) return;
    const fine = intestazioni.find(x => x.toLowerCase() === (m[1] + ' - end').toLowerCase());
    if (!fine) return;
    usate.add(h); usate.add(fine);
    colonne.push({ fonte: m[1].trim(), fonti: [h, fine], titolo: m[1].trim(), tipo: 'timeline' });
  });
  const haTimeline = colonne.length > 0;
  intestazioni.forEach(h => {
    if (!h || usate.has(h) || PRG_IMP_SALTA.test(h)) return;
    const vs = val(h);
    // colonne separatore di Monday (es. «E.F.» con solo «-->»)
    const pieni = vs.filter(v => v !== null);
    if (pieni.length && pieni.every(v => typeof v === 'string' && !/[\p{L}\p{N}]/u.test(v))) return;
    colonne.push({ fonte: h, fonti: [h], titolo: h, tipo: prgImpTipo(h, vs, haTimeline) });
  });
  // Rimettere le timeline al posto della loro colonna Start
  colonne.sort((a, b) => intestazioni.indexOf(a.fonti[0]) - intestazioni.indexOf(b.fonti[0]));
  // Colonna che raggruppa: «Stato»/«Status», altrimenti una colonna creata dai titoli dei gruppi
  if (!colonne.some(c => c.tipo === 'stato' && /^(stato|status)$/i.test(c.titolo)) && gruppi.length) {
    colonne.unshift({ fonte: '__gruppo', fonti: [], titolo: 'Gruppo', tipo: 'stato', daGruppo: true });
  }
  colonne.forEach(c => {
    const vs = c.daGruppo ? elementi.map(e => e.gruppo) : (c.fonti.length ? val(c.fonti[0]).filter(v => v !== null) : []);
    c.compilati = c.daGruppo ? elementi.length : vs.length;
    c.esempi = [...new Set(vs.map(v => _prgImpTestoGrezzo(v)))].slice(0, 4);
  });
  return colonne;
}

function _prgImpTestoGrezzo(v) {
  if (v === null || v === undefined) return '';
  if (v && v._data) return String(v.d).padStart(2, '0') + '/' + String(v.m).padStart(2, '0') + '/' + v.y + (v.H || v.M ? ' ' + String(v.H).padStart(2, '0') + ':' + String(v.M).padStart(2, '0') : '');
  return String(v);
}

function _prgImpYmd(v) {
  if (v && v._data) return v.y + '-' + String(v.m).padStart(2, '0') + '-' + String(v.d).padStart(2, '0');
  return prgParseData(v);
}
function _prgImpYmdHm(v) {
  if (v && v._data) return _prgImpYmd(v) + 'T' + String(v.H || 0).padStart(2, '0') + ':' + String(v.M || 0).padStart(2, '0');
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(String(v));
  if (m) return m[1] + 'T' + m[2] + ':' + m[3];
  const d = prgParseData(v);
  return d ? d + 'T00:00' : null;
}

/* Etichetta leggibile da un valore Monday: niente virgolette attorno, iniziale maiuscola. */
function _prgImpLabel(v) {
  let s = String(v).trim().replace(/^["“”']+|["“”']+$/g, '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* Valore per la colonna di destinazione `dest` (definizione board) dalla colonna del file `src`. */
function prgImpValore(src, dest, el) {
  if (src.daGruppo) return _prgImpOpzione(dest, el.gruppo);
  const grezzi = src.fonti.map(h => el.celle[h]);
  const v = grezzi[0];
  if (dest.tipo === 'timeline') {
    const i = _prgImpYmd(grezzi[0]), f = _prgImpYmd(grezzi.length > 1 ? grezzi[1] : grezzi[0]);
    if (!i && !f) return null;
    return { inizio: i || f, fine: f || i };
  }
  if (v === null || v === undefined || v === '') return null;
  switch (dest.tipo) {
    case 'settimane': return null;
    case 'stato': return _prgImpOpzione(dest, v);
    case 'check': return true;
    case 'numero': { const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
    case 'data': return _prgImpYmd(v);
    case 'data_ora': return _prgImpYmdHm(v);
    default: return _prgImpTestoGrezzo(v);
  }
}

function _prgImpOpzione(dest, v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const label = _prgImpLabel(v);
  const k = label.toLowerCase();
  dest.opzioni = dest.opzioni || [];
  let o = dest.opzioni.find(x => x.label.trim().toLowerCase() === k);
  if (!o) {
    o = { id: prgNuovoId('o'), label, colore: prgColoreEtichetta(label, dest.opzioni.length, dest.opzioni) };
    dest.opzioni.push(o);
  }
  return o.id;
}

/* Etichette della colonna che raggruppa nell'ordine dei gruppi di Monday: per ogni gruppo i
   valori di stato dei suoi elementi; un gruppo vuoto (es. «In revisione») diventa
   un'etichetta col suo titolo, così nessuno stato di Monday va perso. */
function prgImpSeminaGruppi(src, dest, an) {
  if (src.daGruppo) { an.gruppi.forEach(g => _prgImpOpzione(dest, g)); return; }
  if (!/^(stato|status)$/i.test(src.titolo) || !src.fonti.length) return;
  an.gruppi.forEach(g => {
    const els = an.elementi.filter(e => e.gruppo === g);
    if (!els.length) { _prgImpOpzione(dest, g); return; }
    els.forEach(e => _prgImpOpzione(dest, e.celle[src.fonti[0]]));
  });
}

/* ---------- aggiornamenti (foglio «updates») ---------- */
const _PRG_MESI_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function _prgImpDataMonday(v) {
  if (v && v._data) return new Date(v.y, v.m - 1, v.d, v.H || 0, v.M || 0).toISOString();
  const m = /(\d{1,2})\/([A-Za-z]+)\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(String(v || ''));
  if (!m) return null;
  let h = Number(m[4]);
  if (m[7]) { const pm = m[7].toUpperCase() === 'PM'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  const mese = _PRG_MESI_EN[m[2].toLowerCase()];
  if (!mese) return null;
  return new Date(Number(m[3]), mese - 1, Number(m[1]), h, Number(m[5]), Number(m[6] || 0)).toISOString();
}

function prgImpAggiornamenti(wb) {
  const nome = wb.SheetNames.find(n => /update/i.test(n));
  if (!nome) return [];
  const ws = wb.Sheets[nome];
  const rng = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  let intest = null;
  const out = [];
  for (let r = rng.s.r; r <= rng.e.r; r++) {
    const riga = [];
    for (let c = rng.s.c; c <= rng.e.c; c++) riga.push(_prgImpCella(ws, r, c));
    if (!intest) {
      if (riga.some(v => typeof v === 'string' && /^item id$/i.test(v))) intest = riga.map(v => String(v || '').trim().toLowerCase());
      continue;
    }
    const get = n => { const i = intest.indexOf(n); return i >= 0 ? riga[i] : null; };
    const testo = get('update content');
    const item = get('item id');
    if (!testo || !item) continue;
    const parent = get('parent post id');
    out.push({
      itemId: String(item),
      testo: (parent ? '↳ ' : '') + String(testo),
      autore: String(get('user') || ''),
      data: _prgImpDataMonday(get('created at')),
      postId: get('post id') !== null ? String(get('post id')) : null,
    });
  }
  return out;
}

/* ---------- anteprima ---------- */
function prgImpAnteprima() {
  const an = _prgImp.analisi;
  const omonima = _prg.boards.find(b => b.nome.trim().toLowerCase() === an.nomeBoard.toLowerCase());
  const comm = prgCommesse().find(c => an.nomeBoard.toLowerCase().includes(c.toLowerCase())) || '';
  const perGruppo = {};
  an.elementi.forEach(e => { perGruppo[e.gruppo] = (perGruppo[e.gruppo] || 0) + 1; });
  let h = '<div class="text-sm text-slate-600 mb-3">File <b>' + prgEsc(_prgImp.file) + '</b>: board <b>' + prgEsc(an.nomeBoard) + '</b>, '
    + an.elementi.length + ' elementi in ' + an.gruppi.length + ' gruppi' + (an.aggiornamenti.length ? ', ' + an.aggiornamenti.length + ' aggiornamenti' : '') + '.</div>'
    + '<div class="flex flex-wrap gap-1 mb-4">' + an.gruppi.map(g => '<span class="prg-badge">' + prgEsc(g) + ' · ' + (perGruppo[g] || 0) + '</span>').join('') + '</div>'
    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">'
    + '<label class="prg-f-lab">Destinazione<select id="prg-imp-dest" class="prg-f-inp"><option value="">Nuova board</option>'
    + _prg.boards.map(b => '<option value="' + b.id + '"' + (omonima && omonima.id === b.id ? ' selected' : '') + '>Aggiorna «' + prgEsc(b.nome) + '»</option>').join('') + '</select></label>'
    + '<label class="prg-f-lab" id="prg-imp-nome-box">Nome nuova board<input id="prg-imp-nome" class="prg-f-inp" value="' + prgEsc(an.nomeBoard) + '"></label>'
    + '<label class="prg-f-lab">Commessa<select id="prg-imp-comm" class="prg-f-inp">' + prgOpzioniCommessa(omonima ? (omonima.commessa || '') : comm) + '</select></label>'
    + '</div>'
    + '<div class="text-xs text-slate-500 mb-2">Tipi proposti per le colonne: correggi quelli sbagliati prima di importare (per una board esistente valgono i tipi già impostati).</div>'
    + '<div id="prg-imp-colonne"></div>';
  prgModalApri('Importa da Monday', h,
    '<button class="prg-btn" id="prg-imp-annulla">Annulla</button><button class="prg-btn prg-btn-pri" id="prg-imp-ok" data-help-key="prg-importa-conferma">Importa ' + an.elementi.length + ' elementi</button>', true);
  document.getElementById('prg-imp-annulla').onclick = prgModalChiudi;
  document.getElementById('prg-imp-ok').onclick = prgImpEsegui;
  const dest = document.getElementById('prg-imp-dest');
  dest.onchange = () => {
    const b = _prg.boards.find(x => x.id === Number(dest.value));
    document.getElementById('prg-imp-nome-box').style.display = b ? 'none' : '';
    if (b) document.getElementById('prg-imp-comm').innerHTML = prgOpzioniCommessa(b.commessa || '');
    prgImpRenderColonne();
  };
  dest.onchange();
}

function _prgImpBersaglio(src, b) {
  if (!b) return null;
  const k = String(src.fonte).toLowerCase();
  return prgCols(b).find(c => String(c.fonte || '').toLowerCase() === k)
    || prgCols(b).find(c => String(c.titolo || '').toLowerCase() === String(src.titolo).toLowerCase()) || null;
}

function prgImpRenderColonne() {
  const an = _prgImp.analisi;
  const b = _prg.boards.find(x => x.id === Number(document.getElementById('prg-imp-dest').value)) || null;
  const box = document.getElementById('prg-imp-colonne');
  box.innerHTML = '<table class="prg-imp-tab"><thead><tr><th>Colonna Monday</th><th>Tipo</th><th>Compilati</th><th>Esempi</th></tr></thead><tbody>'
    + an.colonne.map((c, i) => {
      const esistente = _prgImpBersaglio(c, b);
      return '<tr><td><b>' + prgEsc(c.titolo) + '</b>' + (c.daGruppo ? ' <span class="text-xs text-slate-400">(dai gruppi)</span>' : '') + '</td><td>'
        + (esistente ? '<span class="text-xs text-slate-500">già nella board: ' + prgEsc(prgEtichettaTipo(esistente.tipo)) + '</span>'
          : '<select class="prg-f-inp" data-imp-tipo="' + i + '">' + Object.keys(PRG_TIPI).filter(t => t !== 'timeline' || c.fonti.length === 2).map(t =>
            '<option value="' + t + '"' + (t === c.tipo ? ' selected' : '') + '>' + prgEsc(PRG_TIPI[t].label) + '</option>').join('') + '</select>')
        + '</td><td class="text-right">' + c.compilati + '/' + an.elementi.length + '</td>'
        + '<td class="text-xs text-slate-500">' + c.esempi.map(prgEsc).join(' · ') + '</td></tr>';
    }).join('') + '</tbody></table>';
  box.querySelectorAll('[data-imp-tipo]').forEach(s => s.addEventListener('change', () => { an.colonne[Number(s.dataset.impTipo)].tipo = s.value; }));
}

/* ---------- esecuzione ---------- */
async function prgImpEsegui() {
  if (!sbGuardWrite()) return;
  const an = _prgImp.analisi;
  const btn = document.getElementById('prg-imp-ok');
  const destId = Number(document.getElementById('prg-imp-dest').value) || null;
  const commessa = document.getElementById('prg-imp-comm').value || null;
  let b = destId ? _prg.boards.find(x => x.id === destId) : null;
  const nome = b ? b.nome : document.getElementById('prg-imp-nome').value.trim();
  if (!nome) { document.getElementById('prg-imp-nome').focus(); return; }
  btn.disabled = true;
  const passo = t => { btn.textContent = t; };
  try {
    // 1. Definizione colonne: esistenti per fonte/titolo, nuove in coda
    const colonne = b ? JSON.parse(JSON.stringify(prgCols(b))) : [];
    const mappa = [];   // [{ src, dest }]
    const nuove = [];
    an.colonne.forEach(src => {
      let dest = b ? colonne.find(c => c.id === (_prgImpBersaglio(src, b) || {}).id) : null;
      if (!dest) {
        dest = { id: prgNuovoId('c'), titolo: src.titolo, tipo: src.tipo, fonte: src.fonte };
        if (src.tipo === 'stato') dest.opzioni = [];
        if (src.tipo === 'numero' && /week|settiman|anno|n°|numero/i.test(src.titolo)) dest.riepilogo = 'nessuno';
        nuove.push(dest);
      }
      mappa.push({ src, dest });
    });
    colonne.push(...nuove);
    mappa.forEach(({ src, dest }) => { if (dest.tipo === 'stato') prgImpSeminaGruppi(src, dest, an); });
    const primaTl = colonne.find(c => c.tipo === 'timeline');
    colonne.forEach(c => { if (c.tipo === 'settimane' && !c.da && primaTl) c.da = primaTl.id; });
    // Etichette nell'ordine dei gruppi del file (così l'ordine dei gruppi segue Monday)
    const ordinati = an.gruppi.length ? an.gruppi.flatMap(g => an.elementi.filter(e => e.gruppo === g)).concat(an.elementi.filter(e => !an.gruppi.includes(e.gruppo))) : an.elementi;
    const valori = new Map();
    ordinati.forEach(el => {
      const v = {};
      mappa.forEach(({ src, dest }) => { const x = prgImpValore(src, dest, el); if (x !== null && x !== undefined) v[dest.id] = x; });
      valori.set(el, v);
    });
    const gruppoCol = (b && b.config && b.config.gruppo && colonne.some(c => c.id === b.config.gruppo)) ? b.config.gruppo
      : ((mappa.find(m => m.dest.tipo === 'stato' && (/^(stato|status)$/i.test(m.src.titolo) || m.src.daGruppo)) || {}).dest || {}).id || null;

    // 2. Board
    passo('Salvataggio board…');
    if (b) {
      const { data, error } = await _sbClient.from(PRG_T.board).update({ colonne, commessa, config: Object.assign({}, b.config, { gruppo: gruppoCol }) })
        .eq('id', b.id).select().single();
      if (error) throw error;
      b = data;
    } else {
      const { data, error } = await _sbClient.from(PRG_T.board).insert({
        nome, commessa, colonne, config: { gruppo: gruppoCol, origine: 'monday' },
        ordine: _prg.boards.reduce((mx, x) => Math.max(mx, x.ordine || 0), 0) + 1,
      }).select().single();
      if (error) throw error;
      b = data;
    }
    _prgUpsertBoard(b);

    // 3. Elementi (upsert per Item ID)
    passo('Lettura elementi esistenti…');
    await prgCaricaBoard(b.id, true);
    const esistenti = new Map(prgEls(b.id).filter(e => e.monday_id).map(e => [e.monday_id, e]));
    const colDelFile = new Set(mappa.map(m => m.dest.id));
    let ordine = prgEls(b.id).reduce((mx, e) => Math.max(mx, Number(e.ordine) || 0), 0);
    const righe = [];
    let nuovi = 0, aggiornati = 0, invariati = 0;
    ordinati.forEach(el => {
      const v = valori.get(el);
      const ex = esistenti.get(el.mondayId);
      if (ex) {
        const merged = {};
        Object.keys(ex.valori || {}).forEach(k => { if (!colDelFile.has(k)) merged[k] = ex.valori[k]; });
        Object.assign(merged, v);
        if (ex.nome === el.nome && JSON.stringify(_prgOrdinaChiavi(merged)) === JSON.stringify(_prgOrdinaChiavi(ex.valori || {}))) { invariati++; return; }
        aggiornati++;
        righe.push({ board_id: b.id, monday_id: el.mondayId, nome: el.nome, valori: merged, ordine: ex.ordine });
      } else {
        nuovi++;
        righe.push({ board_id: b.id, monday_id: el.mondayId, nome: el.nome, valori: v, ordine: ++ordine });
      }
    });
    for (let i = 0; i < righe.length; i += 200) {
      passo('Elementi ' + Math.min(i + 200, righe.length) + '/' + righe.length + '…');
      const { error } = await _sbClient.from(PRG_T.el).upsert(righe.slice(i, i + 200), { onConflict: 'board_id,monday_id' });
      if (error) throw error;
    }
    await prgCaricaBoard(b.id, true);

    // 4. Aggiornamenti come commenti (senza doppioni per Post ID)
    let commenti = 0, commentiSaltati = 0;
    if (an.aggiornamenti.length) {
      const perMonday = new Map(prgEls(b.id).filter(e => e.monday_id).map(e => [e.monday_id, e.id]));
      const rows = [];
      an.aggiornamenti.forEach(u => {
        const elId = perMonday.get(u.itemId);
        if (!elId) { commentiSaltati++; return; }
        rows.push({
          elemento_id: elId, board_id: b.id, testo: u.testo.slice(0, 10000), origine: 'monday',
          autore_nome: prgNomeDaEmail(u.autore), autore_originale: u.autore || null, data_originale: u.data, monday_post_id: u.postId,
        });
      });
      for (let i = 0; i < rows.length; i += 200) {
        passo('Aggiornamenti ' + Math.min(i + 200, rows.length) + '/' + rows.length + '…');
        const { data, error } = await _sbClient.from(PRG_T.com).upsert(rows.slice(i, i + 200), { onConflict: 'board_id,monday_post_id', ignoreDuplicates: true }).select('id');
        if (error) throw error;
        commenti += (data || []).length;
      }
      await prgCaricaBoard(b.id, true);
    }
    const nelFile = new Set(an.elementi.map(e => e.mondayId));
    const mancanti = prgEls(b.id).filter(e => e.monday_id && !nelFile.has(e.monday_id));
    sbLogActivity('Programmazione: import da Monday', { board: b.nome, file: _prgImp.file, nuovi, aggiornati, invariati, commenti });
    prgModalChiudi();
    _prg.boardId = null;
    await prgScegliBoard(b.id);
    prgRender();
    if (typeof prgOnGrigliaSalvata === 'function') prgOnGrigliaSalvata();   // collegamenti certi e stati dalla Griglia
    showAlertModal('Import completato nella board «' + b.nome + '».\n'
      + '• ' + nuovi + ' elementi nuovi, ' + aggiornati + ' aggiornati, ' + invariati + ' già uguali\n'
      + (an.aggiornamenti.length ? '• ' + commenti + ' aggiornamenti importati' + (an.aggiornamenti.length - commenti - commentiSaltati > 0 ? ' (' + (an.aggiornamenti.length - commenti - commentiSaltati) + ' già presenti)' : '') + '\n' : '')
      + (mancanti.length ? '• ' + mancanti.length + ' elementi della board non sono nel file e sono rimasti com\'erano: ' + mancanti.slice(0, 8).map(e => e.nome).join(', ') + (mancanti.length > 8 ? '…' : '') : ''));
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Riprova import';
    showAlertModal('Import non completato: ' + (e.message || String(e)) + '\n\nQuello che era già stato salvato resta; reimportando lo stesso file non si creano doppioni.');
  }
}

function _prgOrdinaChiavi(o) {
  const out = {};
  Object.keys(o).sort().forEach(k => { out[k] = o[k]; });
  return out;
}
