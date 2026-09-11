/* ===================== LIMITAZIONI OPERATORI: IDONEITA' MEDICHE ===================== */
/* Mappa le limitazioni riportate nelle idoneita' mediche periodiche (file "EP - Elenco
   dipendenti con limitazioni") sugli operatori del pool, alimentando due consumatori:

   1. la sezione "Operatori con limitazioni" della dashboard, fra Attestati e DPI;
   2. un alert in Griglia settimanale quando si assegna a un cantiere un operatore che
      ne ha (vedi pwConfirmOpModal in weekly-operatore-modal.js).

   MODELLO DATI (dominio "core", nessuna modifica allo schema Supabase):
   - op.limitazioni_dett  { tipo_visita, data_visita, scadenza_visita, voci: [{tipo, nota}],
                            fonte } — UN solo record per operatore (una persona ha
                            un'idoneita' medica alla volta, a differenza degli attestati che
                            sono tanti e indipendenti). fonte = 'import' | 'manuale'.
   - state.limitazioni_catalogo  vocabolario dei "tipo limitazione" visti finora (seed in
                            LIMITAZIONI_TIPI_DEFAULT, si auto-estende con l'import).
   - state.limitazioni_registro  archivio grezzo dell'ultimo import, copre anche i
                            dipendenti fuori dal pool. Consultazione + riabbinamento futuro.

   Per chi e' nel pool, un import successivo SOSTITUISCE l'intero record (e' la fonte
   autorevole, come un'idoneita' medica reale che si rinnova): chi non compare piu' nel
   file semplicemente non viene toccato, la correzione manuale sulla scheda operatore resta. */

/* ------------------------------------------------------- stato scadenza ----- */

/* Stato della scadenza di una visita: 'valido' | 'scadenza' | 'scaduto' | 'senza-data'.
   Riusa attGiorniAllaScadenza (dashboard-attestati.js): e' una pura funzione di date,
   non specifica degli attestati. */
function limStatoVisita(reg) {
  if (!reg || !reg.scadenza_visita) return 'senza-data';
  const gg = attGiorniAllaScadenza(reg.scadenza_visita);
  if (gg === null) return 'senza-data';
  if (gg < 0) return 'scaduto';
  if (gg <= LIMITAZIONI_PREAVVISO_GG) return 'scadenza';
  return 'valido';
}

/* Record limitazioni di un operatore, o null se non ne ha (nessuna voce). */
function limRegistroOperatore(op) {
  const reg = op && op.limitazioni_dett;
  if (!reg || !Array.isArray(reg.voci) || reg.voci.length === 0) return null;
  return reg;
}

/* Usata dal picker Griglia (pwConfirmOpModal) per l'alert di assegnazione: cerca
   l'operatore per nome_esteso/nome, ritorna il suo record limitazioni o null. */
function limVociOperatore(nomeOperatore) {
  const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome) === nomeOperatore);
  return limRegistroOperatore(op);
}

/* Descrizione testuale multi-riga di un record, per l'alert di assegnazione e i tooltip. */
function limDescrizioneRegistro(reg) {
  if (!reg) return '';
  const righe = [];
  const meta = [];
  if (reg.tipo_visita) meta.push(reg.tipo_visita);
  if (reg.data_visita) meta.push('visita del ' + fmtDate(reg.data_visita));
  if (reg.scadenza_visita) {
    const st = limStatoVisita(reg);
    meta.push(st === 'scaduto' ? 'SCADUTA il ' + fmtDate(reg.scadenza_visita) : 'scade il ' + fmtDate(reg.scadenza_visita));
  }
  if (meta.length) righe.push(meta.join(' · '));
  (reg.voci || []).forEach(v => righe.push('- ' + v.tipo + (v.nota ? ' (' + v.nota + ')' : '')));
  return righe.join('\n');
}

/* Tutti i record (pool + fuori pool) in un'unica lista { nome, op, reg, inPool }. */
function limRigheRegistro() {
  const righe = [];
  const nomiPool = new Set();

  (state.operatori || []).forEach(op => {
    if (op.licenziato || isOperatoreScaduto(op)) return;
    const nome = op.nome_esteso || op.nome || '';
    if (!nome) return;
    nomiPool.add(pwFerieNormTokens(nome).sort().join(' '));
    const reg = limRegistroOperatore(op);
    if (!reg) return;
    righe.push({ nome: nome, op: op, reg: reg, inPool: true });
  });

  const registro = state.limitazioni_registro || {};
  (registro.dipendenti || []).forEach(d => {
    const chiave = pwFerieNormTokens(d.nome || '').sort().join(' ');
    if (!chiave || nomiPool.has(chiave)) return;
    if (!d.voci || d.voci.length === 0) return;
    righe.push({ nome: d.nome, op: null, reg: d, inPool: false });
  });

  return righe;
}

/* Badge di avviso per la card operatore nel Pool (dashboard-operatori.js). */
function limBadgeOpCard(op) {
  const reg = limRegistroOperatore(op);
  if (!reg) return '';
  const st = limStatoVisita(reg);
  const cls = st === 'scaduto' ? 'bg-red-100 text-red-700' : st === 'scadenza' ? 'bg-amber-100 text-amber-700' : 'bg-orange-50 text-orange-700';
  return '<span class="text-[9px] ' + cls + ' px-1 rounded" title="' + esc(limDescrizioneRegistro(reg)) + '">⚠ limitazioni</span>';
}

/* Riga editabile di una voce { tipo, nota } nella scheda operatore: input di testo con
   suggerimenti dal catalogo (datalist, non <select>: il medico competente puo' sempre
   scrivere una dicitura nuova, il catalogo e' un aiuto non un vincolo rigido) + nota +
   rimozione. Costruita per concatenazione, non template literal (vedi convenzione del
   file: niente template literal annidati). */
function limRigaModaleOperatoreHtml(voce) {
  const tipo = (voce && voce.tipo) || '';
  const nota = (voce && voce.nota) || '';
  return '<div class="mo-lim-riga flex items-center gap-1.5">' +
    '<input type="text" class="mo-lim-tipo flex-1 border border-slate-300 rounded px-1.5 py-1 text-xs" list="mo-lim-catalogo-dl" placeholder="Tipo limitazione…" value="' + tipo.replace(/"/g, '&quot;') + '">' +
    '<input type="text" class="mo-lim-nota flex-1 border border-slate-300 rounded px-1.5 py-1 text-xs" placeholder="Nota (facolt.)" value="' + nota.replace(/"/g, '&quot;') + '">' +
    '<button type="button" class="mo-lim-remove text-[11px] text-red-400 hover:text-red-600 px-1" title="Rimuovi">✕</button>' +
  '</div>';
}

const _limFiltri = { search: '', tipo: '', stato: '', soloPool: false, ordine: 'nome' };

function limSetFiltro(chiave, valore) {
  _limFiltri[chiave] = valore;
  renderLimitazioni();
}

/* ------------------------------------------------------------- render vista ----- */

function renderLimitazioni() {
  const box = document.getElementById('lim-matrix');
  const badge = document.getElementById('lim-summary-badges');

  const tutte = limRigheRegistro();
  const nScaduti = tutte.filter(r => limStatoVisita(r.reg) === 'scaduto').length;
  const nInScadenza = tutte.filter(r => limStatoVisita(r.reg) === 'scadenza').length;
  if (badge) {
    let b = '<span class="att-pill">' + tutte.length + ' operator' + (tutte.length === 1 ? 'e' : 'i') + '</span>';
    if (nScaduti > 0) b += '<span class="att-pill ko">' + nScaduti + ' visita/e scadut' + (nScaduti === 1 ? 'a' : 'e') + '</span>';
    if (nInScadenza > 0) b += '<span class="att-pill warn">' + nInScadenza + ' in scadenza</span>';
    badge.innerHTML = b;
  }

  if (!box) return;
  const det = document.getElementById('lim-details');
  if (det && !det.open) { box.innerHTML = ''; return; }

  const registro = state.limitazioni_registro || {};
  const metaEl = document.getElementById('lim-meta');
  if (metaEl) {
    metaEl.textContent = registro.aggiornato_il
      ? 'Ultimo import: ' + fmtDate(registro.aggiornato_il) + (registro.file ? ' — ' + registro.file : '') + (registro.da ? ' (' + registro.da + ')' : '')
      : 'Nessun import effettuato: la lista mostra solo le limitazioni inserite a mano nelle schede operatore.';
  }

  const selTipo = document.getElementById('lim-filter-tipo');
  if (selTipo) {
    const valorePrec = selTipo.value;
    selTipo.innerHTML = '<option value="">Tutti i tipi</option>' +
      (state.limitazioni_catalogo || []).map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
    selTipo.value = valorePrec;
  }

  const q = (_limFiltri.search || '').trim().toLowerCase();

  let righe = tutte.filter(r => {
    if (_limFiltri.soloPool && !r.inPool) return false;
    if (q && !r.nome.toLowerCase().includes(q)) return false;
    if (_limFiltri.tipo && !(r.reg.voci || []).some(v => v.tipo === _limFiltri.tipo)) return false;
    if (_limFiltri.stato && limStatoVisita(r.reg) !== _limFiltri.stato) return false;
    return true;
  });

  const countEl = document.getElementById('lim-count');
  if (countEl) countEl.textContent = righe.length + ' dipendenti';

  if (righe.length === 0) {
    box.innerHTML = '<div class="text-center text-sm text-slate-400 py-6">Nessun dipendente con limitazioni corrisponde ai filtri.</div>';
    return;
  }

  if (_limFiltri.ordine === 'scadenza') {
    righe = righe.slice().sort((a, b) => {
      const ga = attGiorniAllaScadenza(a.reg.scadenza_visita), gb = attGiorniAllaScadenza(b.reg.scadenza_visita);
      const va = ga === null ? 999999 : ga, vb = gb === null ? 999999 : gb;
      return va - vb || a.nome.localeCompare(b.nome);
    });
  } else {
    righe = righe.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  }

  let html = '<table class="att-matrix" style="width:100%;"><thead><tr>';
  html += '<th class="att-nome" style="text-align:left;">Dipendente</th>';
  html += '<th>Tipo visita</th><th>Data visita</th><th>Scadenza</th><th style="text-align:left;">Limitazioni</th></tr></thead><tbody>';

  righe.forEach(r => {
    const st = limStatoVisita(r.reg);
    const tagPool = r.inPool ? '' : '<span class="att-fuoripool" title="Presente nel file limitazioni ma non nel pool operatori del reparto">fuori pool</span>';
    const vociHtml = (r.reg.voci || []).map(v =>
      '<div>' + esc(v.tipo) + (v.nota ? ' <span class="text-slate-400">(' + esc(v.nota) + ')</span>' : '') + '</div>'
    ).join('');
    html += '<tr>' +
      '<td class="att-nome">' + esc(r.nome) + ' ' + tagPool + '</td>' +
      '<td>' + esc(r.reg.tipo_visita || '—') + '</td>' +
      '<td>' + (r.reg.data_visita ? esc(fmtDate(r.reg.data_visita)) : '—') + '</td>' +
      '<td><span class="att-cell"><span class="att-dot ' + attClasseStato(st) + '"></span>' +
        (r.reg.scadenza_visita ? esc(fmtDate(r.reg.scadenza_visita)) : '—') + '</span></td>' +
      '<td style="text-align:left;white-space:normal;">' + vociHtml + '</td>' +
    '</tr>';
  });
  html += '</tbody></table>';
  box.innerHTML = html;
}

function limToggleSezione() {
  renderLimitazioni();
}

/* -------------------------------------------------------------------- import ----- */

function limFoglio(wb) {
  // Il file ha un solo foglio dati; se in futuro venisse rinominato si prende comunque
  // il primo. Nessun nome fisso da cercare (a differenza degli attestati, che hanno
  // piu' fogli con nomi convenzionali).
  return wb.Sheets[wb.SheetNames[0]];
}

/* Estrae dal workbook { perDip, errore }: perDip e' una Map chiave-nome-normalizzata ->
   { nome, tipo_visita, data_visita, scadenza_visita, voci }. errore valorizzato = file
   non riconosciuto (intestazione non trovata). */
function limImportParseWorkbook(wb) {
  const perDip = new Map();
  const ws = limFoglio(wb);
  if (!ws) return { perDip: perDip, errore: 'Nessun foglio leggibile nel file.' };

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const norm = h => ('' + (h || '')).toLowerCase().replace(/[^a-z0-9]/g, '');

  let hIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some(c => norm(c) === 'nome')) { hIdx = i; break; }
  }
  if (hIdx < 0) {
    return { perDip: perDip,
      errore: 'Colonna "Nome" non trovata nel file.\n\nVerifica di aver selezionato il file corretto ("EP - Elenco dipendenti con limitazioni").' };
  }

  const header = (rows[hIdx] || []).map(norm);
  const iNome = header.findIndex(h => h === 'nome');
  const iTipoVisita = header.findIndex(h => h === 'tipovisita');
  const iDataVisita = header.findIndex(h => h === 'datavisita');
  const iScadVisita = header.findIndex(h => h === 'scadenzavisita');
  const iTipo1 = header.findIndex(h => h === 'tipolimitazione1');
  const iNota1 = header.findIndex(h => h === 'notespecifiche');
  const iTipo2 = header.findIndex(h => h === 'tipolimitazione2');
  const iNota2 = header.findIndex(h => h === 'notespecifiche2');
  if (iTipo1 < 0) {
    return { perDip: perDip, errore: 'Colonna "Tipo limitazione 1" non trovata nel file.\n\nVerifica di aver selezionato il file corretto.' };
  }

  const cella = (row, i) => i < 0 ? '' : ('' + (row[i] === null || row[i] === undefined ? '' : row[i])).replace(/\s+/g, ' ').trim();

  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const nomeDip = cella(row, iNome);
    if (!nomeDip || /^totale$/i.test(nomeDip) || /^legenda/i.test(nomeDip)) continue;

    const voci = [];
    const tipo1 = cella(row, iTipo1);
    if (tipo1) voci.push({ tipo: tipo1, nota: cella(row, iNota1) });
    const tipo2 = cella(row, iTipo2);
    if (tipo2) voci.push({ tipo: tipo2, nota: cella(row, iNota2) });
    if (voci.length === 0) continue;

    const chiave = pwFerieNormTokens(nomeDip).sort().join(' ');
    if (!chiave) continue;
    perDip.set(chiave, {
      nome: nomeDip,
      tipo_visita: cella(row, iTipoVisita),
      data_visita: iDataVisita >= 0 ? attExcelData(row[iDataVisita]) : '',
      scadenza_visita: iScadVisita >= 0 ? attExcelData(row[iScadVisita]) : '',
      voci: voci,
    });
  }

  return { perDip: perDip, errore: '' };
}

function limImportPick(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if (file) limImportFile(file);
}

function limImportShowConfirm(info) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');

    function limListBox(items, titolo, colorClass) {
      if (items.length === 0) return '';
      const righe = items.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(it => {
        const nota = it.nota ? ' <span class="text-slate-400">(' + esc(it.nota) + ')</span>' : '';
        return '<div class="lni-row px-2 py-1 border-b border-slate-100 last:border-b-0" data-nome="' +
          esc(it.nome.toLowerCase()) + '">' + esc(it.nome) + nota + '</div>';
      }).join('');
      return '<div class="mt-3"><div class="text-xs font-semibold ' + colorClass + ' mb-1">' + titolo +
        ' (' + items.length + ')</div><div class="border border-slate-200 rounded text-xs" style="max-height:160px;overflow-y:auto;">' +
        righe + '</div></div>';
    }

    const nElencati = info.matched.length + info.unmatched.length + info.ambiguous.length;
    const html =
      '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col" style="max-height:85vh;">' +
        '<div class="px-5 py-4 border-b border-slate-100">' +
          '<div class="font-semibold text-slate-900 text-sm">Importazione limitazioni operatori</div>' +
          '<div class="text-xs text-slate-500 mt-0.5">' + esc(info.fileName) + '</div>' +
        '</div>' +
        '<div class="px-5 py-4 text-sm text-slate-700" style="overflow-y:auto;">' +
          '<ul class="text-xs space-y-1 text-slate-600">' +
            '<li>• <b>' + info.nDipendenti + '</b> dipendenti con limitazioni letti dal file</li>' +
            '<li>• <b>' + info.matched.length + '</b> abbinati a operatori del pool: le loro schede verranno aggiornate</li>' +
            '<li>• ' + (info.nDipendenti - info.matched.length) + ' resteranno solo nel registro consultabile</li>' +
          '</ul>' +
          (nElencati > 0 ?
            '<div class="relative mt-3">' +
              '<input type="text" id="lni-search" placeholder="Cerca un nominativo negli elenchi qui sotto…" ' +
              'class="w-full text-xs border border-slate-300 rounded px-2 py-1.5 pr-16 focus:outline-none focus:border-teal-400" ' +
              'oninput="limImportFilter(this.value)">' +
              '<span id="lni-search-count" class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></span>' +
            '</div>' : '') +
          limListBox(info.matched, '✓ Abbinati al pool operatori', 'text-emerald-700') +
          limListBox(info.ambiguous, '⚠ Ambigui, più operatori corrispondenti (solo registro)', 'text-amber-700') +
          limListBox(info.unmatched, 'Non nel pool operatori (solo registro)', 'text-slate-600') +
          '<div class="text-xs text-slate-500 mt-3">Per gli operatori abbinati, un record di un import precedente viene sostituito da quello del nuovo file; le limitazioni inserite a mano per chi non compare in questo file restano invariate.</div>' +
        '</div>' +
        '<div class="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">' +
          '<button id="lni-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button>' +
          '<button id="lni-confirm" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Importa</button>' +
        '</div>' +
      '</div></div>';

    root.innerHTML = html;
    document.getElementById('lni-cancel').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('lni-confirm').onclick = () => { closeModal(); resolve(true); };
  });
}

function limImportFilter(query) {
  const q = (query || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#modal-root .lni-row');
  let shown = 0;
  rows.forEach(row => {
    const match = !q || row.dataset.nome.includes(q);
    row.classList.toggle('hidden', !match);
    if (match) shown++;
  });
  const countEl = document.getElementById('lni-search-count');
  if (countEl) countEl.textContent = q ? shown + '/' + rows.length : '';
}

async function limImportFile(file) {
  if (!sbGuardWrite()) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }

  let wb;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  } catch (err) {
    showAlertModal('Errore nella lettura del file:\n\n' + err.message);
    return;
  }

  const parsed = limImportParseWorkbook(wb);
  if (parsed.errore) { showAlertModal(parsed.errore); return; }
  const perDip = parsed.perDip;

  if (perDip.size === 0) {
    showAlertModal('Nessuna limitazione leggibile trovata nel file.\n\nVerifica che sia l\'export "Elenco dipendenti con limitazioni".');
    return;
  }

  const operatori = getOperatoriAttivi();
  const matched = [], unmatched = [], ambiguous = [];
  const dipendenti = [];

  perDip.forEach(d => {
    const res = pwFerieMatchOperatore(d.nome, operatori);
    let opId = null;
    if (res.match) {
      opId = res.match.id;
      matched.push({ nome: d.nome, nota: d.voci.length + ' limitazion' + (d.voci.length === 1 ? 'e' : 'i') + ' → ' + (res.match.nome_esteso || res.match.nome) });
    } else if (res.ambiguous) {
      ambiguous.push({ nome: d.nome, nota: (res.candidates || []).map(c => c.nome_esteso || c.nome).join(', ') });
    } else {
      unmatched.push({ nome: d.nome, nota: d.voci.length + ' limitazion' + (d.voci.length === 1 ? 'e' : 'i') });
    }
    dipendenti.push({ nome: d.nome, op_id: opId, tipo_visita: d.tipo_visita, data_visita: d.data_visita, scadenza_visita: d.scadenza_visita, voci: d.voci });
  });

  const ok = await limImportShowConfirm({
    fileName: file.name, nDipendenti: perDip.size,
    matched: matched, unmatched: unmatched, ambiguous: ambiguous,
  });
  if (!ok) return;

  state.limitazioni_registro = {
    aggiornato_il: attOggiIso(),
    file: file.name,
    da: (typeof _sbUser !== 'undefined' && _sbUser) ? _sbUser.email : '',
    dipendenti: dipendenti,
  };

  // Auto-estende il catalogo con eventuali nuove diciture incontrate nel file.
  const catalogoSet = new Set(state.limitazioni_catalogo || []);
  dipendenti.forEach(d => (d.voci || []).forEach(v => catalogoSet.add(v.tipo)));
  state.limitazioni_catalogo = [...catalogoSet];

  let nOpAggiornati = 0;
  dipendenti.forEach(d => {
    if (!d.op_id) return;
    const op = state.operatori.find(o => o.id === d.op_id);
    if (!op) return;
    op.limitazioni_dett = {
      tipo_visita: d.tipo_visita || '', data_visita: d.data_visita || '', scadenza_visita: d.scadenza_visita || '',
      voci: d.voci, fonte: 'import',
    };
    nOpAggiornati++;
  });

  await saveState('Import limitazioni', { file: file.name, dipendenti: perDip.size, operatori: nOpAggiornati }, true);
  const det = document.getElementById('lim-details');
  if (det) det.open = true;
  renderAll();
  showAlertModal('✓ Import completato: ' + perDip.size + ' dipendenti nel registro, ' + nOpAggiornati + ' operatori del pool aggiornati.');
}

/* -------------------------------------------------------------------- export ----- */

function exportLimitazioniXlsx() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }
  const header = ['Dipendente', 'Nel pool operatori', 'Tipo visita', 'Data visita', 'Scadenza visita', 'Stato', 'Tipo limitazione', 'Note specifiche', 'Fonte'];
  const etichettaStato = { valido: 'Valida', scadenza: 'In scadenza', scaduto: 'Scaduta', 'senza-data': 'Scadenza non nota' };
  const righe = [header];
  limRigheRegistro()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach(r => {
      const inPool = r.inPool ? 'Sì' : 'No';
      const stato = etichettaStato[limStatoVisita(r.reg)] || '';
      (r.reg.voci || []).forEach(v => {
        righe.push([r.nome, inPool, r.reg.tipo_visita || '', r.reg.data_visita || '', r.reg.scadenza_visita || '', stato, v.tipo, v.nota || '', r.reg.fonte || '']);
      });
    });
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 45 }, { wch: 20 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Limitazioni');
  XLSX.writeFile(wb, 'limitazioni_operatori_' + attOggiIso() + '.xlsx');
}
