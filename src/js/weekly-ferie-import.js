/* ===== IMPORT FERIE/PERMESSI DA EXCEL ===== */
// Importa un export "ORE NON LAVORATE" (pivot Dipendente x giorno x descrizione, tipicamente
// generato dal gestionale presenze) e popola pwFerie (flag booleano per operatore/giorno,
// usato ovunque nell'app per capire chi è disponibile) + pwFerieDettagli (ore e descrizione
// del tipo di assenza, mostrati come badge/tooltip nella Vista Ferie).
// Copre TUTTE le settimane presenti nel file, non solo quella aperta in griglia.

const PW_FERIE_MESI = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
};

const PW_FERIE_ACCENTI = { 'à':'a', 'á':'a', 'è':'e', 'é':'e', 'ì':'i', 'í':'i', 'ò':'o', 'ó':'o', 'ù':'u', 'ú':'u' };

function pwFerieNormTokens(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .replace(/[àáèéìíòóùú]/g, ch => PW_FERIE_ACCENTI[ch] || ch)
    // Il gestionale presenze traslittera i nomi con vocale accentata finale in ASCII +
    // apostrofo (es. "Nicolò" -> "Nicolo'", "Calò" -> "Calo'"): rimuovendo l'apostrofo
    // il token torna identico a quello ottenuto dal nome_esteso con l'accento vero.
    .replace(/['’]/g, '')
    .replace(/[_,.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Abbina il nome "Dipendente" dell'export (spesso "Cognome Nome", a volte con refusi tipo
// underscore/spazi doppi) al nome_esteso di un operatore attivo, confrontando gli insiemi di
// parole così da non dipendere dall'ordine Nome/Cognome usato nell'anagrafica operatori.
function pwFerieMatchOperatore(nomeExcel, operatori) {
  const tokEx = pwFerieNormTokens(nomeExcel);
  if (tokEx.length === 0) return { match: null, ambiguous: false };
  const setEx = new Set(tokEx);

  const exact = operatori.filter(op => {
    const tokOp = pwFerieNormTokens(op.nome_esteso || op.nome);
    return tokOp.length === setEx.size && tokOp.every(t => setEx.has(t));
  });
  if (exact.length === 1) return { match: exact[0], ambiguous: false };
  if (exact.length > 1) return { match: null, ambiguous: true, candidates: exact };

  // Fallback: un insieme di parole è incluso nell'altro (nomi composti/parziali)
  const partial = operatori.filter(op => {
    const tokOp = new Set(pwFerieNormTokens(op.nome_esteso || op.nome));
    return tokEx.every(t => tokOp.has(t)) || [...tokOp].every(t => setEx.has(t));
  });
  if (partial.length === 1) return { match: partial[0], ambiguous: false };
  if (partial.length > 1) return { match: null, ambiguous: true, candidates: partial };

  return { match: null, ambiguous: false };
}

// Handler onchange dell'<input type=file>: estrae il file e resetta subito il campo per
// permettere di riselezionare lo stesso file (es. dopo aver corretto un'anagrafica) senza
// che il browser ignori il change perché il value non è cambiato.
function pwFerieImportPick(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if (file) pwFerieImportFile(file);
}

// Riepilogo pre-import in un modal dedicato (invece di showConfirmAsync): un file con molti
// nominativi non riconosciuti — normale, capita spesso di importare l'intero elenco dipendenti
// anche di chi non è del reparto — produceva un testo lunghissimo dentro il modal generico
// (senza scroll interno), che finiva per uscire dallo schermo. Qui il corpo scorre e i due
// elenchi nominativi (non riconosciuti/ambigui) hanno ciascuno un riquadro con scrollbar
// propria, un nome per riga, invece di una singola riga di testo con la virgola.
function pwFerieImportShowConfirm({ fileName, righeLette, batchLength, nOpCoinvolti, nSettimane, righeDomenica, righeSenzaData, unmatched, ambiguous }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');

    function listBox(map, title, colorClass) {
      if (map.size === 0) return '';
      const righe = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const items = righe.map(([nome, extra]) => {
        const nota = Array.isArray(extra)
          ? ` <span class="text-slate-400">(${extra.map(esc).join(', ')})</span>` // ambigui: candidati
          : (extra > 1 ? ` <span class="text-slate-400">×${extra}</span>` : '');   // non riconosciuti: n. righe
        return `<div class="pfi-row px-2 py-1 border-b border-slate-100 last:border-b-0" data-nome="${esc(nome.toLowerCase())}">${esc(nome)}${nota}</div>`;
      }).join('');
      return `
        <div class="mt-3">
          <div class="text-xs font-semibold ${colorClass} mb-1">⚠ ${map.size} ${title}</div>
          <div class="border border-slate-200 rounded text-xs" style="max-height:160px;overflow-y:auto;">${items}</div>
        </div>`;
    }

    const nNomiTotali = unmatched.size + ambiguous.size;
    const html = `
      <div class="modal-backdrop">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col" style="max-height:85vh;">
          <div class="px-5 py-4 border-b border-slate-100">
            <div class="font-semibold text-slate-900 text-sm">Importazione ferie/permessi</div>
            <div class="text-xs text-slate-500 mt-0.5">${esc(fileName)}</div>
          </div>
          <div class="px-5 py-4 text-sm text-slate-700" style="overflow-y:auto;">
            <ul class="text-xs space-y-1 text-slate-600">
              <li>• ${righeLette} righe lette dal file</li>
              <li>• <b>${batchLength}</b> giorni di assenza applicabili, per <b>${nOpCoinvolti}</b> operatori, su ${nSettimane} settiman${nSettimane === 1 ? 'a' : 'e'}</li>
              ${righeDomenica > 0 ? `<li>• ${righeDomenica} righe ignorate (domenica, non gestita nella griglia Ferie)</li>` : ''}
              ${righeSenzaData > 0 ? `<li>• ${righeSenzaData} righe ignorate (data non valida)</li>` : ''}
            </ul>
            ${nNomiTotali > 0 ? `
            <div class="relative mt-3">
              <input type="text" id="pfi-search" placeholder="Cerca un nominativo nell'elenco qui sotto…"
                class="w-full text-xs border border-slate-300 rounded px-2 py-1.5 pr-16 focus:outline-none focus:border-teal-400"
                oninput="pwFerieImportFilter(this.value)">
              <span id="pfi-search-count" class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></span>
            </div>` : ''}
            ${listBox(unmatched, 'nominativi NON riconosciuti (righe saltate)', 'text-amber-700')}
            ${listBox(ambiguous, 'nominativi ambigui, più operatori corrispondenti (righe saltate)', 'text-amber-700')}
            <div class="text-xs text-slate-500 mt-3">Per gli operatori riconosciuti verranno spuntati i giorni di assenza indicati nel file (i giorni già segnati manualmente e non presenti nel file restano invariati).</div>
          </div>
          <div class="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
            <button id="pfi-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button>
            <button id="pfi-confirm" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Importa</button>
          </div>
        </div>
      </div>`;

    root.innerHTML = html;
    document.getElementById('pfi-cancel').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('pfi-confirm').onclick = () => { closeModal(); resolve(true); };
    root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) { closeModal(); resolve(false); } });
  });
}

// Filtra dal vivo le righe degli elenchi "non riconosciuti"/"ambigui" del modal di conferma
// import — utile per verificare al volo se un nominativo specifico compare tra quelli
// scartati, senza dover scorrere a mano centinaia di righe (es. import dell'intero elenco
// dipendenti aziendale, di cui solo una parte è del reparto).
function pwFerieImportFilter(query) {
  const q = (query || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#modal-root .pfi-row');
  let shown = 0;
  rows.forEach(row => {
    const match = !q || row.dataset.nome.includes(q);
    row.classList.toggle('hidden', !match);
    if (match) shown++;
  });
  const countEl = document.getElementById('pfi-search-count');
  if (countEl) countEl.textContent = q ? `${shown}/${rows.length}` : '';
}

async function pwFerieImportFile(file) {
  if (!sbGuardWrite()) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }

  let rows;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  } catch (err) {
    showAlertModal('Errore nella lettura del file:\n\n' + err.message);
    return;
  }

  // L'header vero e proprio non è detto sia in riga 1: il file ha spesso una riga
  // "Filtri applicati: ..." e una vuota prima della tabella dati. Lo cerco per contenuto.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some(c => ('' + (c || '')).trim().toLowerCase() === 'dipendente')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) { showAlertModal('Colonna "Dipendente" non trovata nel file.\n\nVerifica che sia l\'export corretto (ore non lavorate/ferie).'); return; }

  const header = rows[headerIdx].map(h => ('' + (h || '')).trim().toLowerCase());
  const col = name => header.indexOf(name.toLowerCase());
  const iDip = col('Dipendente');
  const iCommessa = col('commessa');
  const iDescr = col('descrizione');
  const iAnno = col('dataintervento - Anno');
  const iMese = col('dataintervento - Mese');
  const iGiorno = col('dataintervento - Giorno');
  const iDurata = col('Somma di durata');
  if (iDip < 0 || iAnno < 0 || iMese < 0 || iGiorno < 0) {
    showAlertModal('Colonne attese non trovate ("Dipendente", "dataintervento - Anno/Mese/Giorno").');
    return;
  }

  const operatori = getOperatoriAttivi();
  const unmatched = new Map();  // nome excel -> n. righe
  const ambiguous = new Map();  // nome excel -> nomi candidati
  let righeLette = 0, righeDomenica = 0, righeSenzaData = 0;
  const batch = []; // { nome, anno, week, day, ore, descrizione }
  const settimaneCoinvolte = new Set();

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[iDip]) continue;
    // Filtro difensivo: importiamo solo righe di "ore non lavorate" (ferie/permessi/104/
    // congedi/chiusura aziendale...), non voci di produzione — se la colonna "commessa" è
    // presente e non lo indica, la riga viene saltata.
    if (iCommessa >= 0 && row[iCommessa] && !/non lavorat/i.test('' + row[iCommessa])) continue;

    righeLette++;
    const nomeExcel = ('' + row[iDip]).trim();
    const anno = parseInt(row[iAnno], 10);
    const meseNome = ('' + (row[iMese] || '')).trim().toLowerCase();
    const meseIdx = PW_FERIE_MESI[meseNome];
    const giorno = parseInt(row[iGiorno], 10);
    if (!anno || meseIdx === undefined || !giorno) { righeSenzaData++; continue; }

    const data = new Date(Date.UTC(anno, meseIdx, giorno));
    const dow = data.getUTCDay(); // 0 = domenica
    if (dow === 0) { righeDomenica++; continue; }
    const day = dow - 1; // Lun=0 ... Sab=5, come nella griglia Ferie

    const { match, ambiguous: isAmbig, candidates } = pwFerieMatchOperatore(nomeExcel, operatori);
    if (!match) {
      if (isAmbig) ambiguous.set(nomeExcel, (candidates || []).map(c => c.nome_esteso || c.nome));
      else unmatched.set(nomeExcel, (unmatched.get(nomeExcel) || 0) + 1);
      continue;
    }

    const { week, year } = isoWeekYear(data);
    const nome = match.nome_esteso || match.nome;
    const ore = Number(row[iDurata]) || 0;
    const descrizione = (iDescr >= 0 && row[iDescr]) ? ('' + row[iDescr]).trim() : '';

    batch.push({ nome, anno: year, week, day, ore, descrizione });
    settimaneCoinvolte.add(year + '-W' + week);
  }

  if (batch.length === 0) {
    let msg = 'Nessuna riga applicabile trovata nel file.';
    if (unmatched.size > 0) {
      const nomi = [...unmatched.keys()].sort();
      const preview = nomi.slice(0, 20).join(', ') + (nomi.length > 20 ? `, … e altri ${nomi.length - 20}` : '');
      msg += `\n\n${unmatched.size} nominativi non riconosciuti:\n` + preview;
    }
    showAlertModal(msg);
    return;
  }

  const nOpCoinvolti = new Set(batch.map(b => b.nome)).size;
  const ok = await pwFerieImportShowConfirm({
    fileName: file.name, righeLette, batchLength: batch.length, nOpCoinvolti,
    nSettimane: settimaneCoinvolte.size, righeDomenica, righeSenzaData, unmatched, ambiguous,
  });
  if (!ok) return;

  // Rimpiazza (invece di accodare) il dettaglio delle celle toccate in QUESTA importazione,
  // così un reimport dello stesso file (o di un file corretto) non raddoppia ore/descrizioni;
  // celle non toccate da questo file restano invece invariate.
  const celleReimportate = new Set();
  batch.forEach(({ nome, anno, week, day, ore, descrizione }) => {
    if (!pwFerie[anno]) pwFerie[anno] = {};
    if (!pwFerie[anno][week]) pwFerie[anno][week] = {};
    if (!pwFerie[anno][week][nome]) pwFerie[anno][week][nome] = {};
    pwFerie[anno][week][nome][day] = 'ferie'; // il tipo "Non disponibile" è una scelta solo manuale (click destro)

    if (!pwFerieDettagli[anno]) pwFerieDettagli[anno] = {};
    if (!pwFerieDettagli[anno][week]) pwFerieDettagli[anno][week] = {};
    if (!pwFerieDettagli[anno][week][nome]) pwFerieDettagli[anno][week][nome] = {};
    const cellKey = anno + '|' + week + '|' + nome + '|' + day;
    if (!celleReimportate.has(cellKey)) {
      celleReimportate.add(cellKey);
      pwFerieDettagli[anno][week][nome][day] = [];
    }
    pwFerieDettagli[anno][week][nome][day].push({ ore, descrizione });
  });

  await pwFerieSave();
  if (typeof _pwActiveTab !== 'undefined' && _pwActiveTab === 'ferie') pwFerieRender();

  showAlertModal(`✓ Importazione completata: ${batch.length} giorni di assenza applicati su ${settimaneCoinvolte.size} settiman${settimaneCoinvolte.size === 1 ? 'a' : 'e'}.`);
}

/* ----- Badge/popover dettaglio (ore + descrizione) nella cella Ferie ----- */
function pwFerieDettaglioBadge(nome, day, dett) {
  const totOre = dett.reduce((s, d) => s + (Number(d.ore) || 0), 0);
  const tip = dett.map(d => `${d.descrizione || '—'}${d.ore ? ' (' + d.ore + 'h)' : ''}`).join(' · ');
  return `<button type="button" class="pw-ferie-badge" title="${esc(tip)}"
    onclick="event.stopPropagation(); pwFerieDettaglioPopover('${jsAttr(nome)}', ${day}, this)">${esc(String(totOre))}h</button>`;
}

function pwFerieDettaglioPopover(nome, day, btnEl) {
  const existing = document.getElementById('pw-ferie-dett-popover');
  const key = nome + '|' + day;
  if (existing) {
    const sameKey = existing.dataset.key === key;
    existing.remove();
    if (sameKey) return; // click sullo stesso badge già aperto → chiudi e basta
  }

  const dw = pwGetFerieDettagliWeek();
  const dett = (dw[nome] && dw[nome][day]) || [];
  const DAY_NAMES_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

  const rect = btnEl.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.id = 'pw-ferie-dett-popover';
  pop.className = 'pw-popover';
  pop.dataset.key = key;
  pop.style.cssText = [
    'position:fixed',
    `top:${rect.bottom + 6}px`,
    `left:${Math.min(rect.left, window.innerWidth - 330)}px`,
    'z-index:9999',
  ].join(';');

  const totOre = dett.reduce((s, d) => s + (Number(d.ore) || 0), 0);
  pop.innerHTML = `
    <div class="pw-popover-header">
      <span class="pw-popover-title">${esc(nome)} · ${DAY_NAMES_FULL[day] || ''}</span>
      <span class="pw-popover-count">${esc(String(totOre))}h</span>
    </div>
    <div class="pw-popover-body">
      ${dett.length === 0 ? '<div class="pw-popover-empty">Nessun dettaglio</div>' : dett.map(d => `
        <div class="psp-row">
          <span class="psp-nome">${esc(d.descrizione || '—')}</span>
          <span class="psp-tags"><span class="psp-tag rosso">${esc(String(d.ore || 0))}h</span></span>
        </div>`).join('')}
    </div>`;

  document.body.appendChild(pop);

  setTimeout(() => {
    document.addEventListener('click', function _pfdClose(e) {
      if (!pop.contains(e.target) && e.target !== btnEl) {
        pop.remove();
        document.removeEventListener('click', _pfdClose);
      }
    });
  }, 0);
}
