/* ===================== ANAGRAFICA OPERATORI: IMPORT DA EXCEL ===================== */
/* Importa comune e provincia di residenza da un export aziendale tipo "Anagrafica
   dipendenti" (colonne: Dipendente, Indirizzo residenza, civico, CAP, Comune residenza,
   Provincia residenza, Sede di riferimento). Aggiorna solo i due campi gia' usati/mostrati
   in anagrafica operatore (op.comune_residenza, op.provincia): gli altri campi del file
   (indirizzo, civico, CAP, sede) non sono modellati e vengono ignorati.

   Stesso schema degli altri import aziendali (registro attestati, ferie): abbinamento per
   nome tramite pwFerieMatchOperatore (tollerante a Nome/Cognome invertiti e piccoli refusi),
   riepilogo di conferma prima di applicare, nessun impatto su chi non e' nel pool. */

/* Normalizza la provincia del file (sigla con spazi di padding, es. "PG        ", o a volte
   il nome esteso) nella sigla usata da PROVINCE_ITALIA. Stringa vuota se non riconosciuta. */
function anagNormProvincia(v) {
  const s = ('' + (v === null || v === undefined ? '' : v)).trim().toUpperCase();
  if (!s) return '';
  if (provinciaInfo(s)) return s;
  const trovata = PROVINCE_ITALIA.find(p => p.nome.toUpperCase() === s);
  return trovata ? trovata.sigla : '';
}

/* Il file arriva tutto maiuscolo ("PERUGIA"): pwTitleCase lo rende presentabile
   ("Perugia") senza dover mantenere un elenco dei comuni italiani. */
function anagNormComune(v) {
  const s = ('' + (v === null || v === undefined ? '' : v)).replace(/\s+/g, ' ').trim();
  return s ? pwTitleCase(s) : '';
}

/* Isolata dal resto per essere testabile senza DOM/XLSX (stesso approccio di
   attImportParseWorkbook). Ritorna { perDip, errore }: `errore` valorizzato = file non
   riconosciuto (manca la colonna "Dipendente"). perDip: chiave nome normalizzata -> voce. */
function anagImportParseWorkbook(wb) {
  const perDip = new Map();
  const wsMain = wb.Sheets[wb.SheetNames[0]];
  if (!wsMain) {
    return { perDip: perDip, errore: 'Il file Excel non contiene fogli leggibili.' };
  }
  const rows = XLSX.utils.sheet_to_json(wsMain, { header: 1, defval: null, raw: true });
  let hIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some(c => /dipendent/i.test('' + (c || '')))) { hIdx = i; break; }
  }
  if (hIdx < 0) {
    return { perDip: perDip,
      errore: 'Intestazione "Dipendente" non trovata nel file.\n\nVerifica di aver selezionato il file corretto (export anagrafica dipendenti).' };
  }
  const header = (rows[hIdx] || []).map(h => ('' + (h || '')).toLowerCase().replace(/[^a-z]/g, ''));
  const iNome = header.findIndex(h => h.indexOf('dipendent') === 0);
  const iComune = header.findIndex(h => h.indexOf('comune') === 0);
  const iProvincia = header.findIndex(h => h.indexOf('provincia') === 0);
  if (iNome < 0) {
    return { perDip: perDip, errore: 'Colonna "Dipendente" non trovata nel file.' };
  }

  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const cellaNome = row[iNome];
    const nomeDip = ('' + (cellaNome === null || cellaNome === undefined ? '' : cellaNome)).replace(/\s+/g, ' ').trim();
    if (!nomeDip || /^totale$/i.test(nomeDip)) continue;
    const chiave = pwFerieNormTokens(nomeDip).sort().join(' ');
    if (!chiave) continue;
    const comune = iComune >= 0 ? anagNormComune(row[iComune]) : '';
    const provincia = iProvincia >= 0 ? anagNormProvincia(row[iProvincia]) : '';
    if (!comune && !provincia) continue;
    perDip.set(chiave, { nome: nomeDip, comune_residenza: comune, provincia: provincia });
  }
  return { perDip: perDip, errore: '' };
}

async function anagImportFile(file) {
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

  const parsed = anagImportParseWorkbook(wb);
  if (parsed.errore) { showAlertModal(parsed.errore); return; }
  const perDip = parsed.perDip;
  if (perDip.size === 0) {
    showAlertModal('Nessuna riga con Comune o Provincia di residenza leggibile trovata nel file.\n\nVerifica che sia l’export "Anagrafica dipendenti".');
    return;
  }

  /* --- abbinamento con il pool operatori --- */
  const operatori = getOperatoriAttivi();
  const matched = [], unmatched = [], ambiguous = [];
  const daApplicare = [];

  perDip.forEach(d => {
    const res = pwFerieMatchOperatore(d.nome, operatori);
    const localita = [d.comune_residenza, d.provincia].filter(Boolean).join(' (') + (d.comune_residenza && d.provincia ? ')' : '');
    if (res.match) {
      matched.push({ nome: d.nome, nota: (localita || '—') + ' → ' + (res.match.nome_esteso || res.match.nome) });
      daApplicare.push({ op: res.match, comune: d.comune_residenza, provincia: d.provincia });
    } else if (res.ambiguous) {
      ambiguous.push({ nome: d.nome, nota: (res.candidates || []).map(c => c.nome_esteso || c.nome).join(', ') });
    } else {
      unmatched.push({ nome: d.nome, nota: localita });
    }
  });

  const ok = await anagImportShowConfirm({
    fileName: file.name, nRighe: perDip.size,
    matched: matched, unmatched: unmatched, ambiguous: ambiguous,
  });
  if (!ok) return;

  /* --- applicazione: solo comune/provincia, e solo se il file ne porta un valore --- */
  daApplicare.forEach(d => {
    if (d.comune) d.op.comune_residenza = d.comune;
    if (d.provincia) d.op.provincia = d.provincia;
  });

  await saveState('Import anagrafica dipendenti', { file: file.name, operatori: daApplicare.length }, true);
  renderAll();
  showAlertModal('✓ Import completato: ' + daApplicare.length + ' operatori del pool aggiornati su ' + perDip.size + ' righe lette.');
}

function anagImportPick(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ''; // consente di riselezionare lo stesso file dopo una correzione
  if (file) anagImportFile(file);
}

/* Riepilogo pre-import: stesso schema del modal attestati/ferie (elenchi scrollabili +
   ricerca), perche' anche qui il file copre tutta l'azienda e non solo il pool rilievi. */
function anagImportShowConfirm(info) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');

    function anagListBox(items, titolo, colorClass) {
      if (items.length === 0) return '';
      const righe = items.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(it => {
        const nota = it.nota ? ' <span class="text-slate-400">(' + esc(it.nota) + ')</span>' : '';
        return '<div class="ani-row px-2 py-1 border-b border-slate-100 last:border-b-0" data-nome="' +
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
          '<div class="font-semibold text-slate-900 text-sm">Importazione anagrafica dipendenti</div>' +
          '<div class="text-xs text-slate-500 mt-0.5">' + esc(info.fileName) + '</div>' +
        '</div>' +
        '<div class="px-5 py-4 text-sm text-slate-700" style="overflow-y:auto;">' +
          '<ul class="text-xs space-y-1 text-slate-600">' +
            '<li>• <b>' + info.nRighe + '</b> dipendenti letti dal file con comune e/o provincia di residenza</li>' +
            '<li>• <b>' + info.matched.length + '</b> abbinati a operatori del pool: le loro schede verranno aggiornate</li>' +
            (info.ambiguous.length > 0 ? '<li>• ' + info.ambiguous.length + ' ambigui, saltati (nessuna corrispondenza univoca)</li>' : '') +
            (info.unmatched.length > 0 ? '<li>• ' + info.unmatched.length + ' non trovati nel pool operatori, saltati</li>' : '') +
          '</ul>' +
          (nElencati > 0 ?
            '<div class="relative mt-3">' +
              '<input type="text" id="ani-search" placeholder="Cerca un nominativo negli elenchi qui sotto…" ' +
              'class="w-full text-xs border border-slate-300 rounded px-2 py-1.5 pr-16 focus:outline-none focus:border-teal-400" ' +
              'oninput="anagImportFilter(this.value)">' +
              '<span id="ani-search-count" class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></span>' +
            '</div>' : '') +
          anagListBox(info.matched, '✓ Abbinati al pool operatori', 'text-emerald-700') +
          anagListBox(info.ambiguous, '⚠ Ambigui, più operatori corrispondenti (saltati)', 'text-amber-700') +
          anagListBox(info.unmatched, 'Non nel pool operatori (saltati)', 'text-slate-600') +
          '<div class="text-xs text-slate-500 mt-3">Vengono aggiornati solo comune e provincia di residenza; gli altri campi della scheda operatore restano invariati.</div>' +
        '</div>' +
        '<div class="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">' +
          '<button id="ani-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button>' +
          '<button id="ani-confirm" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Importa</button>' +
        '</div>' +
      '</div></div>';

    root.innerHTML = html;
    document.getElementById('ani-cancel').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('ani-confirm').onclick = () => { closeModal(); resolve(true); };
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) { closeModal(); resolve(false); }
    });
  });
}

function anagImportFilter(query) {
  const q = (query || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#modal-root .ani-row');
  let shown = 0;
  rows.forEach(row => {
    const match = !q || row.dataset.nome.includes(q);
    row.classList.toggle('hidden', !match);
    if (match) shown++;
  });
  const countEl = document.getElementById('ani-search-count');
  if (countEl) countEl.textContent = q ? shown + '/' + rows.length : '';
}
