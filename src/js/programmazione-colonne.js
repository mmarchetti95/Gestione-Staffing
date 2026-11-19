/* ==================== PROGRAMMAZIONE · TIPI E COLONNE ====================
   Tipi di colonna della Programmazione e editor «⚙️ Colonne» (admin/responsabile).
   La definizione sta in prg_board.colonne: [{ id, titolo, tipo, larghezza, opzioni?, unita?,
   riepilogo?, da?, fonte? }]. config.gruppo = id della colonna di tipo «stato» che raggruppa
   le righe (i gruppi di Monday). Valori per tipo, in prg_elemento.valori[id]:
     testo/testo_lungo/email/telefono  stringa
     numero      number
     stato       id dell'etichetta (opzioni: [{ id, label, colore }])
     data        'AAAA-MM-GG'          data_ora   'AAAA-MM-GGTHH:MM'
     timeline    { inizio, fine } in 'AAAA-MM-GG'
     check       true (assente = non spuntato)
     settimane   nessun valore: «W41 – W47» calcolato dalla timeline `da`
   Cambiando tipo i valori esistenti vengono convertiti (prgConverti); quelli non convertibili
   si svuotano, dopo conferma, e restano nello storico dell'elemento. */

const PRG_TIPI = {
  testo:       { label: 'Testo',                      w: 160 },
  testo_lungo: { label: 'Testo lungo / note',         w: 220 },
  stato:       { label: 'Stato / etichetta',          w: 150 },
  numero:      { label: 'Numero',                     w: 100 },
  data:        { label: 'Data',                       w: 110 },
  data_ora:    { label: 'Data e ora',                 w: 140 },
  timeline:    { label: 'Timeline (dal – al)',        w: 180 },
  settimane:   { label: 'Settimane (dalla timeline)', w: 110 },
  check:       { label: 'Spunta',                     w: 80 },
  email:       { label: 'Email',                      w: 210 },
  telefono:    { label: 'Telefono',                   w: 140 },
};

// Colori delle etichette, sulla falsariga di quelli di Monday.
const PRG_PALETTE = ['#00c875', '#fdab3d', '#e2445c', '#579bfc', '#a25ddc', '#0086c0', '#ffcb00', '#9cd326',
  '#ff7575', '#66ccff', '#7f5347', '#ff158a', '#037f4c', '#bb3354', '#784bd1', '#c4c4c4'];

function prgLarghezzaTipo(t) { return (PRG_TIPI[t] || PRG_TIPI.testo).w; }
function prgEtichettaTipo(t) { return (PRG_TIPI[t] || { label: t }).label; }

/* Colore proposto per un'etichetta dal suo significato (stati di avanzamento, esiti), altrimenti
   a rotazione sulla palette. È solo una proposta: si cambia da «⚙️ Colonne». */
function prgColoreEtichetta(label, i, opzioni) {
  const s = String(label || '').toLowerCase();
  const usati = new Set((opzioni || []).map(o => String(o.colore || '').toLowerCase()));
  const regole = [
    [/non conform|no doc|bloccat|stuck|annullat|rifiutat|problem/, '#e2445c'],
    [/consegnat|chius|done/, '#00c875'],
    [/complet|fatto|conform|ok$|approvat/, '#037f4c'],
    [/backlog|da pianific|da fare|^nuov/, '#c4c4c4'],
    [/elaboraz/, '#0086c0'],
    [/revision|verific|controll/, '#784bd1'],
    [/condivis|inviat/, '#66ccff'],
    [/pending|attesa|sospes/, '#ffcb00'],
    [/progress|in corso|working/, '#fdab3d'],
    [/fissat|pianific|programmat/, '#579bfc'],
    [/caricat|ricevut/, '#a25ddc'],
  ];
  for (const [re, col] of regole) if (re.test(s)) return col;
  // A rotazione, saltando i colori già usati dalla colonna e, finché si può, quelli che hanno
  // un significato (rosso, verdi, grigio), lasciati alle etichette riconosciute sopra.
  const riservati = new Set(['#e2445c', '#00c875', '#037f4c', '#c4c4c4']);
  const liberi = PRG_PALETTE.filter(c => !usati.has(c) && !riservati.has(c));
  if (liberi.length) return liberi[0];
  const altri = PRG_PALETTE.filter(c => !usati.has(c));
  return altri.length ? altri[0] : PRG_PALETTE[(i || 0) % PRG_PALETTE.length];
}

function prgColonneDefault() {
  const stato = { id: prgNuovoId('c'), titolo: 'Stato', tipo: 'stato', opzioni: [
    { id: prgNuovoId('o'), label: 'Da pianificare', colore: '#c4c4c4' },
    { id: prgNuovoId('o'), label: 'Pianificato', colore: '#579bfc' },
    { id: prgNuovoId('o'), label: 'In corso', colore: '#fdab3d' },
    { id: prgNuovoId('o'), label: 'Completato', colore: '#00c875' },
  ] };
  const tl = { id: prgNuovoId('c'), titolo: 'Timeline', tipo: 'timeline' };
  return [
    stato,
    { id: prgNuovoId('c'), titolo: 'Regione', tipo: 'testo' },
    tl,
    { id: prgNuovoId('c'), titolo: 'Settimane', tipo: 'settimane', da: tl.id },
    { id: prgNuovoId('c'), titolo: 'Scadenza', tipo: 'data' },
    { id: prgNuovoId('c'), titolo: 'Note', tipo: 'testo_lungo' },
  ];
}

/* ---------- conversione dei valori al cambio di tipo ---------- */
function prgParseData(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return null;
}

/* { ok, v }: v = nuovo valore (null = vuoto). nuova.opzioni può essere arricchita (testo -> stato). */
function prgConverti(v, vecchia, nuova, el) {
  if (v === undefined || v === null || v === '') return { ok: true, v: null };
  const da = vecchia.tipo, a = nuova.tipo;
  if (da === a) return { ok: true, v };
  const testo = prgTesto(vecchia, v, el);
  switch (a) {
    case 'testo': case 'testo_lungo': case 'email': case 'telefono':
      return { ok: true, v: testo || null };
    case 'stato': {
      if (!testo) return { ok: true, v: null };
      nuova.opzioni = nuova.opzioni || [];
      const k = testo.trim().toLowerCase();
      let o = nuova.opzioni.find(x => x.label.trim().toLowerCase() === k);
      if (!o) {
        o = { id: prgNuovoId('o'), label: testo.trim().slice(0, 60), colore: prgColoreEtichetta(testo, nuova.opzioni.length, nuova.opzioni) };
        nuova.opzioni.push(o);
      }
      return { ok: true, v: o.id };
    }
    case 'numero': {
      const n = typeof v === 'number' ? v : Number(String(testo).replace(/\s/g, '').replace(',', '.'));
      return isFinite(n) && String(testo).trim() !== '' ? { ok: true, v: n } : { ok: false };
    }
    case 'check': return { ok: true, v: true };
    case 'data': {
      if (da === 'timeline') return { ok: true, v: v.fine || v.inizio || null };
      if (da === 'data_ora') return { ok: true, v: String(v).slice(0, 10) };
      const d = prgParseData(testo);
      return d ? { ok: true, v: d } : { ok: false };
    }
    case 'data_ora': {
      if (da === 'data') return { ok: true, v: String(v).slice(0, 10) + 'T00:00' };
      const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(String(v));
      if (m) return { ok: true, v: m[1] + 'T' + m[2] };
      const d = prgParseData(testo);
      return d ? { ok: true, v: d + 'T00:00' } : { ok: false };
    }
    case 'timeline': {
      if (da === 'data' || da === 'data_ora') { const d = String(v).slice(0, 10); return { ok: true, v: { inizio: d, fine: d } }; }
      const parti = String(testo).split(/\s*[–-]\s*(?=\d)/);
      const i = prgParseData(parti[0]), f = prgParseData(parti[1] || parti[0]);
      return i && f ? { ok: true, v: { inizio: i, fine: f } } : { ok: false };
    }
    case 'settimane': return { ok: true, v: null };
    default: return { ok: false };
  }
}

/* ---------- editor «⚙️ Colonne» ---------- */
const _prgCe = { boardId: null, colonne: [], gruppo: null };

function prgColonneApri() {
  const b = prgBoard();
  if (!b || !sbGuardWrite()) return;
  _prgCe.boardId = b.id;
  _prgCe.colonne = JSON.parse(JSON.stringify(prgCols(b)));
  _prgCe.gruppo = (b.config && b.config.gruppo) || null;
  const m = prgModalApri('Colonne · ' + b.nome, '', '<button class="prg-btn" id="prg-ce-annulla">Annulla</button>'
    + '<button class="prg-btn prg-btn-pri" id="prg-ce-salva" data-help-key="prg-colonne-salva">Salva colonne</button>', true);
  document.getElementById('prg-ce-annulla').onclick = prgModalChiudi;
  document.getElementById('prg-ce-salva').onclick = prgColonneSalva;
  const body = document.getElementById('prg-modal-body');
  body.addEventListener('click', prgCeClick);
  body.addEventListener('change', prgCeChange);
  body.addEventListener('input', prgCeInput);
  prgCeRender();
  return m;
}

function prgCeRender() {
  const body = document.getElementById('prg-modal-body');
  if (!body) return;
  const cols = _prgCe.colonne;
  const timeline = cols.filter(c => c.tipo === 'timeline');
  let h = '<p class="text-xs text-slate-500 mb-3">Valgono per tutti. «Raggruppa» sceglie la colonna di stato che divide la board in gruppi; '
    + 'l\'ordine delle sue etichette è l\'ordine dei gruppi. Cambiando tipo, i valori già inseriti vengono convertiti.</p>';
  cols.forEach((c, i) => {
    h += '<div class="prg-ce-col" data-i="' + i + '">'
      + '<div class="prg-ce-row">'
      + '<button class="prg-ce-mini" data-ce="su" title="Sposta su"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button class="prg-ce-mini" data-ce="giu" title="Sposta giù"' + (i === cols.length - 1 ? ' disabled' : '') + '>↓</button>'
      + '<input class="prg-f-inp prg-ce-tit" data-cf="titolo" value="' + prgEsc(c.titolo) + '" placeholder="Titolo colonna">'
      + '<select class="prg-f-inp prg-ce-tipo" data-cf="tipo">' + Object.keys(PRG_TIPI).map(t =>
        '<option value="' + t + '"' + (t === c.tipo ? ' selected' : '') + '>' + prgEsc(PRG_TIPI[t].label) + '</option>').join('') + '</select>'
      + '<input class="prg-f-inp prg-ce-w" type="number" min="60" max="600" step="10" data-cf="larghezza" value="' + (c.larghezza || prgLarghezzaTipo(c.tipo)) + '" title="Larghezza in pixel">'
      + (c.tipo === 'stato' ? '<label class="prg-ce-grp" title="Raggruppa la board per questa colonna"><input type="radio" name="prg-ce-gruppo" data-cf="gruppo"'
        + (_prgCe.gruppo === c.id ? ' checked' : '') + '> Raggruppa</label>' : '')
      + '<button class="prg-ce-mini prg-ce-del" data-ce="del" title="Elimina colonna">🗑</button>'
      + '</div>';
    if (c.tipo === 'stato') {
      h += '<div class="prg-ce-opz">' + (c.opzioni || []).map((o, j) =>
        '<div class="prg-ce-opt" data-j="' + j + '">'
        + '<input type="color" data-of="colore" value="' + prgEsc(o.colore || '#c4c4c4') + '" title="Colore">'
        + '<input class="prg-f-inp" data-of="label" value="' + prgEsc(o.label) + '">'
        + '<button class="prg-ce-mini" data-ce="osu"' + (j === 0 ? ' disabled' : '') + '>↑</button>'
        + '<button class="prg-ce-mini" data-ce="ogiu"' + (j === c.opzioni.length - 1 ? ' disabled' : '') + '>↓</button>'
        + '<button class="prg-ce-mini" data-ce="odel" title="Togli etichetta">✕</button>'
        + '</div>').join('')
        + '<button class="prg-btn prg-ce-add-opt" data-ce="oadd">＋ Etichetta</button></div>';
    } else if (c.tipo === 'numero') {
      h += '<div class="prg-ce-opz flex gap-2 items-center"><label class="text-xs text-slate-500">Unità <input class="prg-f-inp prg-ce-w" data-cf="unita" value="' + prgEsc(c.unita || '') + '"></label>'
        + '<label class="text-xs text-slate-500">Riepilogo gruppo <select class="prg-f-inp" data-cf="riepilogo">'
        + [['somma', 'Somma'], ['media', 'Media'], ['nessuno', 'Nessuno']].map(x =>
          '<option value="' + x[0] + '"' + ((c.riepilogo || 'somma') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('')
        + '</select></label></div>';
    } else if (c.tipo === 'settimane') {
      h += '<div class="prg-ce-opz"><label class="text-xs text-slate-500">Calcolate dalla timeline <select class="prg-f-inp" data-cf="da">'
        + (timeline.length ? timeline.map(t => '<option value="' + prgEsc(t.id) + '"' + (t.id === c.da ? ' selected' : '') + '>' + prgEsc(t.titolo) + '</option>').join('')
          : '<option value="">— nessuna colonna timeline —</option>')
        + '</select></label></div>';
    }
    h += '</div>';
  });
  h += '<button class="prg-btn mt-2" data-ce="add">＋ Aggiungi colonna</button>';
  body.innerHTML = h;
}

function _prgCeCol(t) {
  const box = t.closest('.prg-ce-col');
  return box ? { i: Number(box.dataset.i), c: _prgCe.colonne[Number(box.dataset.i)] } : null;
}

function prgCeClick(e) {
  const a = e.target.closest('[data-ce]');
  if (!a) return;
  const az = a.dataset.ce;
  const cols = _prgCe.colonne;
  if (az === 'add') {
    cols.push({ id: prgNuovoId('c'), titolo: 'Nuova colonna', tipo: 'testo' });
    prgCeRender();
    const ins = document.querySelectorAll('#prg-modal-body .prg-ce-tit');
    if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); }
    return;
  }
  const x = _prgCeCol(a);
  if (!x) return;
  const { i, c } = x;
  const opt = a.closest('.prg-ce-opt');
  const j = opt ? Number(opt.dataset.j) : -1;
  if (az === 'su' && i > 0) { cols.splice(i - 1, 0, cols.splice(i, 1)[0]); }
  else if (az === 'giu' && i < cols.length - 1) { cols.splice(i + 1, 0, cols.splice(i, 1)[0]); }
  else if (az === 'del') { cols.splice(i, 1); if (_prgCe.gruppo === c.id) _prgCe.gruppo = null; }
  else if (az === 'oadd') { c.opzioni = c.opzioni || []; c.opzioni.push({ id: prgNuovoId('o'), label: 'Nuova etichetta', colore: PRG_PALETTE[c.opzioni.length % PRG_PALETTE.length] }); }
  else if (az === 'osu' && j > 0) { c.opzioni.splice(j - 1, 0, c.opzioni.splice(j, 1)[0]); }
  else if (az === 'ogiu' && j < c.opzioni.length - 1) { c.opzioni.splice(j + 1, 0, c.opzioni.splice(j, 1)[0]); }
  else if (az === 'odel' && j >= 0) { c.opzioni.splice(j, 1); }
  prgCeRender();
}

function prgCeInput(e) {
  const t = e.target;
  const x = _prgCeCol(t);
  if (!x) return;
  if (t.dataset.cf === 'titolo') x.c.titolo = t.value;
  else if (t.dataset.cf === 'unita') x.c.unita = t.value.trim() || undefined;
  else if (t.dataset.of) {
    const j = Number(t.closest('.prg-ce-opt').dataset.j);
    x.c.opzioni[j][t.dataset.of] = t.value;
  }
}

function prgCeChange(e) {
  const t = e.target;
  const x = _prgCeCol(t);
  if (!x) return;
  const c = x.c;
  const f = t.dataset.cf;
  if (f === 'tipo') {
    c.tipo = t.value;
    delete c.larghezza;
    if (c.tipo === 'stato' && !(c.opzioni && c.opzioni.length)) c.opzioni = [];
    if (c.tipo === 'settimane') { const tl = _prgCe.colonne.find(k => k.tipo === 'timeline'); c.da = tl ? tl.id : ''; }
    if (c.tipo !== 'stato' && _prgCe.gruppo === c.id) _prgCe.gruppo = null;
    prgCeRender();
  } else if (f === 'larghezza') c.larghezza = Math.max(60, Math.min(600, Number(t.value) || prgLarghezzaTipo(c.tipo)));
  else if (f === 'gruppo') _prgCe.gruppo = c.id;
  else if (f === 'riepilogo') c.riepilogo = t.value;
  else if (f === 'da') c.da = t.value;
}

async function prgColonneSalva() {
  const b = _prg.boards.find(x => x.id === _prgCe.boardId);
  if (!b || !sbGuardWrite()) return;
  const nuove = _prgCe.colonne;
  if (nuove.some(c => !String(c.titolo || '').trim())) { showAlertModal('Ogni colonna deve avere un titolo.'); return; }
  nuove.forEach(c => {
    c.titolo = c.titolo.trim();
    if (c.opzioni) c.opzioni = c.opzioni.filter(o => String(o.label || '').trim()).map(o => Object.assign(o, { label: o.label.trim() }));
  });
  const els = prgEls(b.id);
  const vecchie = prgCols(b);
  // Colonne eliminate con valori, etichette tolte ancora usate, tipi cambiati da convertire.
  const avvisi = [];
  const modifiche = new Map();   // elemento -> { campo: valore }
  const imposta = (el, campo, v) => { if (!modifiche.has(el)) modifiche.set(el, {}); modifiche.get(el)[campo] = v; };
  vecchie.forEach(vc => {
    const nc = nuove.find(c => c.id === vc.id);
    const usati = els.filter(el => el.valori && el.valori[vc.id] !== undefined && el.valori[vc.id] !== null && el.valori[vc.id] !== '');
    if (!nc) { if (usati.length) avvisi.push('la colonna «' + vc.titolo + '» viene eliminata (' + usati.length + ' valori compilati)'); return; }
    if (nc.tipo !== vc.tipo) {
      let persi = 0;
      usati.forEach(el => {
        const r = prgConverti(el.valori[vc.id], vc, nc, el);
        if (!r.ok) { persi++; imposta(el, vc.id, null); }
        else if (JSON.stringify(r.v) !== JSON.stringify(el.valori[vc.id])) imposta(el, vc.id, r.v);
      });
      if (persi) avvisi.push('«' + nc.titolo + '»: ' + persi + ' valori non convertibili in ' + prgEtichettaTipo(nc.tipo).toLowerCase() + ' verranno svuotati');
    } else if (nc.tipo === 'stato') {
      const ids = new Set((nc.opzioni || []).map(o => o.id));
      const orfani = usati.filter(el => !ids.has(el.valori[vc.id]));
      if (orfani.length) {
        avvisi.push('«' + nc.titolo + '»: ' + orfani.length + ' elementi hanno un\'etichetta tolta e restano senza valore');
        orfani.forEach(el => imposta(el, vc.id, null));
      }
    }
  });
  if (avvisi.length && !(await showConfirmAsync('Attenzione:\n• ' + avvisi.join('\n• ') + '\n\nI valori di prima restano nello storico di ogni elemento. Procedere?', 'Salva colonne'))) return;
  const btn = document.getElementById('prg-ce-salva');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }
  try {
    const gruppo = nuove.some(c => c.id === _prgCe.gruppo && c.tipo === 'stato') ? _prgCe.gruppo : null;
    const config = Object.assign({}, b.config, { gruppo });
    const { data, error } = await _sbClient.from(PRG_T.board).update({ colonne: nuove, config }).eq('id', b.id).select().single();
    if (error) throw error;
    _prgUpsertBoard(data);
    const errori = await prgApplicaValori(modifiche);
    sbLogActivity('Programmazione: colonne modificate', { board: b.nome, valori_convertiti: modifiche.size });
    prgModalChiudi();
    prgRender();
    if (errori) showAlertModal('Colonne salvate, ma ' + errori + ' elementi non sono stati aggiornati: riprova a salvare o correggili a mano.');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Salva colonne'; }
    showAlertModal('Colonne non salvate: ' + (e.message || String(e)));
  }
}

/* Scrive in blocco valori su più elementi, un campo alla volta (prg_imposta), 6 alla volta. */
async function prgApplicaValori(modifiche) {
  const lavori = [];
  modifiche.forEach((campi, el) => Object.keys(campi).forEach(k => lavori.push({ el, k, v: campi[k] })));
  let errori = 0, idx = 0;
  const elErr = new Set();
  async function worker() {
    while (idx < lavori.length) {
      const l = lavori[idx++];
      try {
        const { data, error } = await _sbClient.rpc('prg_imposta', { p_id: l.el.id, p_campo: l.k, p_valore: l.v });
        if (error) throw error;
        if (data && data[0]) _prgAggiornaCache(data[0]);
      } catch (e) { elErr.add(l.el.id); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  errori = elErr.size;
  return errori;
}
