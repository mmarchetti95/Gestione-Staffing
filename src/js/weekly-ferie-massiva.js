/* ===== FERIE: MODIFICA MASSIVA, ORDINAMENTO, RICERCA ===== */
// Strumenti della vista Ferie & Permessi per lavorare su molte righe insieme:
// - selezione righe (casella accanto al nome, Maiusc+click = intervallo) e barra azioni
//   che imposta Ferie / Non disponibile o rimuove l'assenza sui giorni scelti;
// - ordinamento per "Cognome Nome" (A→Z, Z→A, oppure prima chi ha assenze);
// - ricerca che porta al primo operatore che corrisponde (Invio = risultato successivo).
// La selezione vale per la settimana aperta: cambiando week si azzera, per non applicare
// per sbaglio un'azione a righe selezionate in un'altra settimana e non più visibili.

const PW_FERIE_SORT_KEY = 'pw_ferie_sort_v1';
const PW_FERIE_TIPO_LABEL = { ferie: '🏖 Ferie', non_disponibile: '🚫 Non disponibile' };

let _pwFerieSel = new Set();          // nomi (nome_esteso) selezionati
let _pwFerieSelWeek = '';             // "anno-week" a cui si riferisce la selezione
let _pwFerieLastIdx = -1;             // ultima riga cliccata, per Maiusc+click
let _pwFerieBulkGiorni = [true, true, true, true, true, true];
let _pwFerieBulkSoloAssenti = true;   // Ferie/Non disp. solo sui giorni che hanno già un'assenza
let _pwFerieSearch = { q: '', idx: 0 };
let _pwFerieOrdine = [];              // nomi nell'ordine mostrato (intervalli e ricerca)
let _pwFerieLabel = {};               // nome -> etichetta "Cognome Nome"

function pwFerieSortMode() {
  try {
    const v = localStorage.getItem(PW_FERIE_SORT_KEY);
    if (v === 'za' || v === 'assenti') return v;
  } catch (e) {}
  return 'az';
}

function pwFerieSetSort(v) {
  try { localStorage.setItem(PW_FERIE_SORT_KEY, v); } catch (e) {}
  pwFerieRender();
}

// Etichetta "Cognome Nome". In anagrafica nome_esteso è quasi sempre già "Cognome Nome",
// ma alcuni operatori sono scritti "Nome Cognome": se il campo cognome è compilato e il
// nome esteso finisce con esso, lo si porta davanti. In ogni altro caso (cognome vuoto o
// che non torna con il nome esteso) si lascia il nome esteso com'è.
function pwFerieCognomeNome(op) {
  const esteso = ((op && (op.nome_esteso || op.nome)) || '').trim().replace(/\s+/g, ' ');
  const cogn = ((op && op.cognome) || '').trim().replace(/\s+/g, ' ');
  if (!cogn || !esteso) return esteso;
  const e = esteso.toLowerCase(), c = cogn.toLowerCase();
  if (e === c || e.startsWith(c + ' ')) return esteso;
  if (e.endsWith(' ' + c)) return cogn + ' ' + esteso.slice(0, esteso.length - cogn.length).trim();
  return esteso;
}

function _pwFerieHaAssenze(fw, nome) {
  const r = fw[nome] || {};
  return [0, 1, 2, 3, 4, 5].some(i => !!pwFerieTipo(r[i]));
}

// Operatori attivi nell'ordine scelto: [{ nome, label }]. Aggiorna anche _pwFerieOrdine e
// _pwFerieLabel, usati da selezione a intervallo e ricerca.
function pwFerieOperatoriOrdinati(fw) {
  const mode = pwFerieSortMode();
  const ops = getOperatoriAttivi()
    .map(o => ({ nome: o.nome_esteso || o.nome, label: pwFerieCognomeNome(o) }))
    .filter(o => o.nome);
  ops.sort((a, b) => {
    if (mode === 'assenti') {
      const d = Number(_pwFerieHaAssenze(fw, b.nome)) - Number(_pwFerieHaAssenze(fw, a.nome));
      if (d) return d;
    }
    const c = a.label.localeCompare(b.label, 'it', { sensitivity: 'base' });
    return mode === 'za' ? -c : c;
  });
  _pwFerieOrdine = ops.map(o => o.nome);
  _pwFerieLabel = {};
  ops.forEach(o => { _pwFerieLabel[o.nome] = o.label; });
  return ops;
}

// Chiamata all'inizio di pwFerieRender: azzera la selezione se è cambiata la settimana.
function pwFerieSelCheckWeek() {
  const k = pwAnno + '-' + pwWeek;
  if (k === _pwFerieSelWeek) return;
  _pwFerieSel.clear();
  _pwFerieSelWeek = k;
  _pwFerieLastIdx = -1;
}

/* ----- Selezione righe ----- */
function pwFerieSelClick(ev, cb) {
  const nome = cb.dataset.op;
  const idx = _pwFerieOrdine.indexOf(nome);
  const val = cb.checked;
  if (ev && ev.shiftKey && _pwFerieLastIdx >= 0 && idx >= 0) {
    const a = Math.min(idx, _pwFerieLastIdx), b = Math.max(idx, _pwFerieLastIdx);
    for (let i = a; i <= b; i++) {
      if (val) _pwFerieSel.add(_pwFerieOrdine[i]);
      else _pwFerieSel.delete(_pwFerieOrdine[i]);
    }
  } else if (val) {
    _pwFerieSel.add(nome);
  } else {
    _pwFerieSel.delete(nome);
  }
  _pwFerieLastIdx = idx;
  pwFerieSelSync();
}

function pwFerieSelAll(val) {
  _pwFerieSel.clear();
  if (val) _pwFerieOrdine.forEach(n => _pwFerieSel.add(n));
  _pwFerieLastIdx = -1;
  pwFerieSelSync();
}

// Seleziona tutti i risultati della ricerca (aggiungendoli alla selezione esistente).
function pwFerieSelRisultati() {
  _pwFerieSearchMatches().forEach(n => _pwFerieSel.add(n));
  pwFerieSelSync();
}

// Allinea caselle, evidenziazione righe, casella "tutti" e barra azioni alla selezione,
// senza ri-renderizzare la griglia.
function pwFerieSelSync() {
  const grid = document.getElementById('pw-ferie-grid');
  if (grid) {
    grid.querySelectorAll('.pw-ferie-row[data-op]').forEach(row => {
      const on = _pwFerieSel.has(row.dataset.op);
      row.classList.toggle('selezionata', on);
      const cb = row.querySelector('.pw-ferie-sel-cb');
      if (cb) cb.checked = on;
    });
    const all = grid.querySelector('.pw-ferie-sel-all');
    if (all) {
      const n = _pwFerieOrdine.filter(x => _pwFerieSel.has(x)).length;
      all.checked = n > 0 && n === _pwFerieOrdine.length;
      all.indeterminate = n > 0 && n < _pwFerieOrdine.length;
    }
  }
  pwFerieBulkBarRender();
}

/* ----- Barra azioni massive ----- */
function pwFerieBulkBarRender() {
  const bar = document.getElementById('pw-ferie-bulkbar');
  if (!bar) return;
  const n = _pwFerieOrdine.filter(x => _pwFerieSel.has(x)).length;
  if (!n) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  const NOMI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const chips = NOMI.map((g, i) => '<button type="button" class="pw-ferie-day-chip' + (_pwFerieBulkGiorni[i] ? ' on' : '') +
    '" onclick="pwFerieBulkToggleGiorno(' + i + ')">' + g + '</button>').join('');
  bar.innerHTML =
    '<span class="font-semibold text-rose-800">' + n + ' operator' + (n === 1 ? 'e' : 'i') + ' selezionat' + (n === 1 ? 'o' : 'i') + '</span>' +
    '<span class="text-slate-300">|</span>' +
    '<span class="flex items-center gap-1">Giorni ' + chips + '</span>' +
    '<label class="flex items-center gap-1 cursor-pointer" title="Se attivo, Ferie / Non disponibile cambiano solo il tipo dei giorni che hanno già un\'assenza, senza aggiungerne di nuove">' +
      '<input type="checkbox" ' + (_pwFerieBulkSoloAssenti ? 'checked' : '') + ' onchange="pwFerieBulkSetSoloAssenti(this.checked)">solo giorni già assenti</label>' +
    '<span class="text-slate-300">|</span>' +
    '<button type="button" class="pw-ferie-bulk-btn pw-write-action" onclick="pwFerieBulkApply(\'ferie\')">🏖 Ferie</button>' +
    '<button type="button" class="pw-ferie-bulk-btn nd pw-write-action" onclick="pwFerieBulkApply(\'non_disponibile\')">🚫 Non disponibile</button>' +
    '<button type="button" class="pw-ferie-bulk-btn rm pw-write-action" onclick="pwFerieBulkApply(null)">✕ Rimuovi assenza</button>' +
    '<button type="button" class="pw-ferie-bulk-btn ghost ml-auto" onclick="pwFerieSelAll(false)">Deseleziona</button>';
}

function pwFerieBulkToggleGiorno(i) {
  _pwFerieBulkGiorni[i] = !_pwFerieBulkGiorni[i];
  pwFerieBulkBarRender();
}

function pwFerieBulkSetSoloAssenti(v) {
  _pwFerieBulkSoloAssenti = !!v;
}

// tipo: 'ferie' | 'non_disponibile' | null (rimuove l'assenza).
async function pwFerieBulkApply(tipo) {
  if (!sbGuardWrite()) return;
  const nomi = _pwFerieOrdine.filter(n => _pwFerieSel.has(n));
  const giorni = [0, 1, 2, 3, 4, 5].filter(i => _pwFerieBulkGiorni[i]);
  if (!nomi.length) return;
  if (!giorni.length) { showAlertModal('Scegli almeno un giorno su cui applicare la modifica.'); return; }
  const fw = pwGetFerieWeek();
  const celle = [];
  nomi.forEach(n => giorni.forEach(d => {
    const att = pwFerieTipo((fw[n] || {})[d]);
    if (tipo ? att === tipo : !att) return;            // già nello stato richiesto
    if (tipo && _pwFerieBulkSoloAssenti && !att) return; // non aggiunge assenze nuove
    celle.push({ n, d });
  }));
  if (!celle.length) {
    showAlertModal(tipo
      ? 'Nessun giorno da modificare: i giorni scelti sono già "' + PW_FERIE_TIPO_LABEL[tipo].slice(2).trim() + '"' +
        (_pwFerieBulkSoloAssenti ? ' oppure non hanno assenze (togli "solo giorni già assenti" per aggiungerle).' : '.')
      : 'Nessuna assenza da rimuovere nei giorni scelti.');
    return;
  }
  const nOp = new Set(celle.map(c => c.n)).size;
  const azione = tipo ? 'Impostare ' + PW_FERIE_TIPO_LABEL[tipo] + ' su' : 'Rimuovere l\'assenza da';
  const ok = await showConfirmAsync(azione + ' ' + celle.length + ' giorn' + (celle.length === 1 ? 'o' : 'i') +
    ' di ' + nOp + ' operator' + (nOp === 1 ? 'e' : 'i') + '?', tipo ? 'Applica' : 'Rimuovi');
  if (!ok) return;
  const dw = pwGetFerieDettagliWeek();
  celle.forEach(({ n, d }) => {
    if (!fw[n]) fw[n] = {};
    fw[n][d] = tipo || false;
    // Come pwSetFeriaTipo: togliendo l'assenza si scarta anche il dettaglio importato.
    if (!tipo && dw[n]) delete dw[n][d];
  });
  await pwFerieSave();
  pwFerieRender();
}

/* ----- Ricerca ----- */
function _pwFerieSearchMatches() {
  const q = pwFerieNormTokens(_pwFerieSearch.q);
  if (!q.length) return [];
  return _pwFerieOrdine.filter(n => {
    const t = pwFerieNormTokens(_pwFerieLabel[n] || n);
    return q.every(x => t.some(y => y.startsWith(x)));
  });
}

function pwFerieSearchInput(v) {
  _pwFerieSearch = { q: v || '', idx: 0 };
  pwFerieSearchApply(true);
}

// Invio = risultato successivo, Maiusc+Invio = precedente, Esc = cancella.
function pwFerieSearchKey(ev) {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    const n = _pwFerieSearchMatches().length;
    if (!n) return;
    _pwFerieSearch.idx = (_pwFerieSearch.idx + (ev.shiftKey ? -1 : 1) + n) % n;
    pwFerieSearchApply(true);
  } else if (ev.key === 'Escape') {
    ev.target.value = '';
    pwFerieSearchInput('');
  }
}

// Evidenzia i risultati e il risultato corrente; con scroll=true porta in vista quello corrente.
function pwFerieSearchApply(scroll) {
  const grid = document.getElementById('pw-ferie-grid');
  const countEl = document.getElementById('pw-ferie-search-count');
  const selBtn = document.getElementById('pw-ferie-search-sel');
  const matches = _pwFerieSearchMatches();
  if (_pwFerieSearch.idx >= matches.length) _pwFerieSearch.idx = 0;
  const cur = matches[_pwFerieSearch.idx];
  const set = new Set(matches);
  let curRow = null;
  if (grid) {
    grid.querySelectorAll('.pw-ferie-row[data-op]').forEach(row => {
      const n = row.dataset.op;
      row.classList.toggle('search-hit', set.has(n));
      row.classList.toggle('search-current', n === cur);
      if (n === cur) curRow = row;
    });
  }
  if (countEl) {
    if (!_pwFerieSearch.q.trim()) countEl.textContent = '';
    else if (!matches.length) countEl.innerHTML = '<span class="text-rose-600">nessun risultato</span>';
    else countEl.textContent = (_pwFerieSearch.idx + 1) + ' di ' + matches.length + (matches.length > 1 ? ' · Invio = successivo' : '');
  }
  if (selBtn) selBtn.classList.toggle('hidden', !matches.length);
  if (scroll && curRow) curRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
