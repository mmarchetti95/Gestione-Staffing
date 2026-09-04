/* ===================== EXPORT XLSX ===================== */
function exportXlsx() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }

  const wb = XLSX.utils.book_new();

  // --- Foglio 1: Elenco commesse NEW ---
  const headerPipeline = ['Cliente','Progetto/commessa','Industry','inizio','fine','RISORSE NECESSARIE (numero per il tempo richiesto)', ...SKILLS, ...ATTESTATI];
  const rowsPipeline = state.pipeline.map(p => {
    const row = [p.cliente, p.progetto, p.industry, p.inizio ? new Date(p.inizio) : null, p.fine ? new Date(p.fine) : null, p.risorse_necessarie];
    SKILLS.forEach(s => row.push(p.skills.includes(s) ? 'SI' : null));
    ATTESTATI.forEach(a => row.push((p.attestati_richiesti||[]).includes(a) ? 'SI' : null));
    return row;
  });
  const wsPipeline = XLSX.utils.aoa_to_sheet([headerPipeline, ...rowsPipeline], { cellDates: true });
  wsPipeline['!cols'] = [{wch:20},{wch:45},{wch:18},{wch:12},{wch:12},{wch:18}, ...SKILLS.map(()=>({wch:8})), ...ATTESTATI.map(()=>({wch:12}))];
  XLSX.utils.book_append_sheet(wb, wsPipeline, 'Elenco commesse NEW');

  // --- Foglio 2: OPERATORI ---
  const headerOp = ['OPERATORE', ...SKILLS];
  const rowsOp = getOperatoriAttivi()
    .filter(op => !op.orphan) // le 4 risorse "orphan" non erano nel foglio OPERATORI originale
    .map(op => {
      const row = [op.nome_breve || op.nome_esteso];
      SKILLS.forEach(s => row.push(op.skills.includes(s) ? 'SI' : 'NO'));
      return row;
    });
  const wsOp = XLSX.utils.aoa_to_sheet([headerOp, ...rowsOp]);
  wsOp['!cols'] = [{wch:35}, ...SKILLS.map(()=>({wch:12}))];
  XLSX.utils.book_append_sheet(wb, wsOp, 'OPERATORI');

  // --- Foglio 3: Staffing attuale ---
  // ricalcolo saturazione per riga 3
  const allocByMese = new Array(12).fill(0);
  state.staffing.forEach(r => r.mesi.forEach((v, i) => { allocByMese[i] += Number(v) || 0; }));
  const nOp = getOperatoriAttivi().length;
  const satRow = allocByMese.map((v, i) => {
    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
    return nOp > 0 && gl > 0 ? v / (gl * nOp) : 0;
  });

  const aoa = [];
  // Riga 1 vuota
  aoa.push(new Array(19).fill(null));
  // Riga 2: giorni lavorativi
  const row2 = new Array(19).fill(null);
  row2[5] = 'Giorni lavorativi mese';
  INITIAL_DATA.giorni_lavorativi.forEach((g, i) => { row2[7+i] = g; });
  aoa.push(row2);
  // Riga 3: saturazione
  const row3 = new Array(19).fill(null);
  row3[5] = 'Saturazione reparto';
  satRow.forEach((s, i) => { row3[7+i] = s; });
  aoa.push(row3);
  // Riga 4: header
  aoa.push(['Risorsa','Società di appartenenza','Area di competenza','Team di appartenza','Team leader','Commessa cliente/commessa interna ','Sotto-progetto', ...MESI_LONG]);
  // Righe dati
  state.staffing.forEach(r => {
    const row = [r.risorsa, r.societa, r.area, r.team, r.team_leader, r.commessa, r.sotto_progetto];
    for (let i=0; i<12; i++) row.push(Number(r.mesi[i]) || null);
    aoa.push(row);
  });
  const wsStaff = XLSX.utils.aoa_to_sheet(aoa);
  // Format saturazione come percentuale
  for (let i=0; i<12; i++) {
    const cellRef = XLSX.utils.encode_cell({r:2, c:7+i});
    if (wsStaff[cellRef]) wsStaff[cellRef].z = '0.00%';
  }
  wsStaff['!cols'] = [{wch:32},{wch:18},{wch:18},{wch:20},{wch:14},{wch:38},{wch:14}, ...MESI_LONG.map(()=>({wch:11}))];
  XLSX.utils.book_append_sheet(wb, wsStaff, 'Staffing attuale');

  // --- Foglio 4: commesse (elenco anagrafico) ---
  const commesseUniche = [...new Set(state.staffing.map(r => r.commessa).filter(Boolean))].sort();
  const aoaC = [['Commesse'], ...commesseUniche.map(c => [c])];
  const wsC = XLSX.utils.aoa_to_sheet(aoaC);
  wsC['!cols'] = [{wch:50}];
  XLSX.utils.book_append_sheet(wb, wsC, 'commesse');

  // --- Foglio: Attestati e Certificazioni ---
  // Replica la struttura del file originale: riga 1 titolo, riga 2 header, riga 3+ dati, ultima col "Totale attestati"
  const aoaAtt = [];
  // Riga 1: titolo
  const titleRow = new Array(ATTESTATI.length + 2).fill(null);
  titleRow[0] = 'Matrice attestati e certificazioni per operatore';
  aoaAtt.push(titleRow);
  // Riga 2: header
  aoaAtt.push(['Operatore', ...ATTESTATI, 'Totale attestati']);
  // Righe dati: solo operatori non orphan
  state.operatori.filter(op => !op.orphan).forEach(op => {
    const possesso = ATTESTATI.map(a => (op.attestati||[]).includes(a) ? 'Sì' : 'No');
    const tot = possesso.filter(v => v === 'Sì').length;
    aoaAtt.push([op.nome_esteso, ...possesso, tot]);
  });
  const wsAtt = XLSX.utils.aoa_to_sheet(aoaAtt);
  wsAtt['!cols'] = [{wch:35}, ...ATTESTATI.map(()=>({wch:18})), {wch:12}];
  XLSX.utils.book_append_sheet(wb, wsAtt, 'Attestati e Certificazioni');

  // --- Foglio 5: Pipeline assegnazioni manuali (nuovo, per documentare le scelte) ---
  const aoaA = [['Commessa', 'Cliente', 'Operatore assegnato', 'Skill operatore', 'Skill richieste', 'Attestati operatore', 'Attestati richiesti', 'Forzata?', 'Data inizio', 'Data fine']];
  state.assegnazioni.forEach(a => {
    const c = state.pipeline.find(p => p.id === a.commessa_id);
    const op = state.operatori.find(o => o.id === a.operatore_id);
    if (!c || !op) return;
    aoaA.push([
      c.progetto, c.cliente, op.nome_esteso,
      op.skills.join(', '), c.skills.join(', '),
      (op.attestati||[]).join(', '), (c.attestati_richiesti||[]).join(', '),
      a.forzata ? 'SI' : 'NO',
      c.inizio ? new Date(c.inizio) : null, c.fine ? new Date(c.fine) : null,
    ]);
  });
  const wsA = XLSX.utils.aoa_to_sheet(aoaA, { cellDates: true });
  wsA['!cols'] = [{wch:42},{wch:20},{wch:30},{wch:25},{wch:25},{wch:35},{wch:35},{wch:10},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsA, 'Pipeline assegnazioni');

  // Nome file con timestamp
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const filename = `Pipeline_Commerciale_aggiornato_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/* ===================== IMPORT XLSX ===================== */
function normalizeForMatch(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z]/g, '');
}

function riconcilia(operatoriBrevi, risorseEstese) {
  // operatoriBrevi: array di nomi brevi (dal foglio OPERATORI)
  // risorseEstese: Set di nomi estesi (dal foglio Staffing)
  const recon = [];
  operatoriBrevi.forEach(nb => {
    const nbN = normalizeForMatch(nb);
    if (!nbN) { recon.push({breve: nb, esteso: null, status: 'missing', alternative: []}); return; }
    const matches = [];
    risorseEstese.forEach(re => { if (normalizeForMatch(re).includes(nbN)) matches.push(re); });
    if (matches.length === 1) {
      recon.push({breve: nb, esteso: matches[0], status: 'ok', alternative: matches});
    } else if (matches.length > 1) {
      const starts = matches.filter(m => normalizeForMatch(m).startsWith(nbN));
      if (starts.length === 1) recon.push({breve: nb, esteso: starts[0], status: 'ok', alternative: matches});
      else recon.push({breve: nb, esteso: matches[0], status: 'ambiguous', alternative: matches});
    } else {
      recon.push({breve: nb, esteso: null, status: 'missing', alternative: []});
    }
  });
  return recon;
}

function parseXlsxToData(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const need = ['Elenco commesse NEW', 'OPERATORI', 'Staffing attuale'];
  for (const sn of need) {
    if (!wb.SheetNames.includes(sn)) throw new Error(`Foglio mancante: "${sn}"`);
  }

  // === Elenco commesse NEW ===
  const wsP = wb.Sheets['Elenco commesse NEW'];
  const pipelineRows = XLSX.utils.sheet_to_json(wsP, { header: 1, defval: null, raw: true });
  // Header riga 0 (index 0); dati da riga 1
  const headerP = pipelineRows[0] || [];
  // Verifica colonne attese
  const expectedColsP = ['Cliente','Progetto/commessa','Industry','inizio','fine'];
  const missingP = expectedColsP.filter(c => !headerP.some(h => (h||'').toString().trim().toLowerCase() === c.toLowerCase()));
  if (missingP.length > 0) throw new Error(`Colonne mancanti in "Elenco commesse NEW": ${missingP.join(', ')}`);

  // Indici colonna skill: ultime 9 colonne dopo "RISORSE NECESSARIE"
  // Robustezza: cerco per nome
  const colIdx = name => headerP.findIndex(h => (h||'').toString().trim().toLowerCase() === name.toLowerCase());
  const iCliente = colIdx('Cliente');
  const iProg = colIdx('Progetto/commessa');
  const iInd = colIdx('Industry');
  const iIni = colIdx('inizio');
  const iFine = colIdx('fine');
  // "RISORSE NECESSARIE..." inizia con "RISORSE"
  const iRis = headerP.findIndex(h => (h||'').toString().toUpperCase().startsWith('RISORSE NECESSARIE'));
  const skillIdx = {};
  SKILLS.forEach(s => { skillIdx[s] = headerP.findIndex(h => (h||'').toString().trim().toUpperCase() === s.toUpperCase()); });

  const pipeline = [];
  for (let r = 1; r < pipelineRows.length; r++) {
    const row = pipelineRows[r];
    if (!row || !row[iCliente]) continue;
    const ini = row[iIni];
    const fine = row[iFine];
    const skills = SKILLS.filter(s => skillIdx[s] >= 0 && ('' + (row[skillIdx[s]]||'')).trim().toUpperCase() === 'SI');
    // Cerco anche colonne attestati in pipeline (extra rispetto alle skill)
    // Le colonne attestati sono quelle che corrispondono a un nome attestato del foglio Attestati
    // (le rileveremo dopo: per ora lascio array vuoto, poi popolo se serve)
    pipeline.push({
      id: 'p' + (r+1),
      cliente: row[iCliente],
      progetto: row[iProg],
      industry: row[iInd],
      inizio: parseDateCell(ini),
      fine: parseDateCell(fine),
      risorse_necessarie: Number(row[iRis]) || 0,
      skills,
      attestati_richiesti: [],
      _rowIdx: r, // tengo l'indice per il post-process attestati
    });
  }

  // === OPERATORI ===
  const wsO = wb.Sheets['OPERATORI'];
  const opRows = XLSX.utils.sheet_to_json(wsO, { header: 1, defval: null, raw: false });
  const headerO = opRows[0] || [];
  const iOpName = headerO.findIndex(h => (h||'').toString().trim().toUpperCase() === 'OPERATORE');
  if (iOpName < 0) throw new Error('Colonna "OPERATORE" non trovata nel foglio OPERATORI');
  const skillIdxO = {};
  SKILLS.forEach(s => { skillIdxO[s] = headerO.findIndex(h => (h||'').toString().trim().toUpperCase() === s.toUpperCase()); });

  const operatoriBrevi = [];
  for (let r = 1; r < opRows.length; r++) {
    const row = opRows[r];
    if (!row || !row[iOpName]) continue;
    const nome = ('' + row[iOpName]).trim();
    const skills = SKILLS.filter(s => skillIdxO[s] >= 0 && ('' + (row[skillIdxO[s]]||'')).trim().toUpperCase() === 'SI');
    operatoriBrevi.push({ nome_breve: nome, skills });
  }

  // === Attestati e Certificazioni (opzionale, ma supportato se presente) ===
  let attestati_disponibili = [];
  const attestati_per_op = {}; // nome esteso -> [attestati]
  const attestatiSheetName = wb.SheetNames.find(n =>
    /attestat/i.test(n) || /certificazion/i.test(n)
  );
  if (attestatiSheetName) {
    const wsAtt = wb.Sheets[attestatiSheetName];
    const attRows = XLSX.utils.sheet_to_json(wsAtt, { header: 1, defval: null, raw: false });
    // Cerco la riga header: contiene "Operatore" come primo non-null
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(5, attRows.length); i++) {
      const r = attRows[i] || [];
      const v = (r[0] || '').toString().trim().toLowerCase();
      if (v === 'operatore' || v === 'operator') { headerRowIdx = i; break; }
    }
    if (headerRowIdx >= 0) {
      const headerAtt = attRows[headerRowIdx];
      // Estraggo i nomi attestati dalle colonne (col 0 = Operatore, ultima = Totale, escludo entrambi)
      attestati_disponibili = [];
      for (let c = 1; c < headerAtt.length; c++) {
        const h = (headerAtt[c] || '').toString().trim();
        if (!h) continue;
        if (/^totale/i.test(h)) continue; // salto "Totale attestati"
        attestati_disponibili.push(h);
      }
      // Riempio attestati_per_op (chiave = nome esteso, come da foglio originale)
      for (let r = headerRowIdx + 1; r < attRows.length; r++) {
        const row = attRows[r];
        if (!row || !row[0]) continue;
        const nomeEsteso = ('' + row[0]).trim();
        const posseduti = [];
        let colIdx = 1;
        attestati_disponibili.forEach(attName => {
          // Riallineo colonne in caso l'header avesse colonne vuote che ho saltato
          while (colIdx < headerAtt.length && (!headerAtt[colIdx] || /^totale/i.test((headerAtt[colIdx]||'').toString()))) colIdx++;
          const v = ('' + (row[colIdx]||'')).trim().toLowerCase();
          if (v === 'sì' || v === 'si') posseduti.push(attName);
          colIdx++;
        });
        attestati_per_op[nomeEsteso] = posseduti;
      }
    }
  }

  // === Staffing attuale ===
  const wsS = wb.Sheets['Staffing attuale'];
  const stRows = XLSX.utils.sheet_to_json(wsS, { header: 1, defval: null, raw: false });
  // Riga indice 1 = giorni lavorativi (riga 2 Excel), indice 2 = saturazione baseline, indice 3 = header dati, da indice 4 = dati
  const giorniRow = stRows[1] || [];
  const giorni_lavorativi = [];
  for (let i = 7; i < 19; i++) {
    const v = giorniRow[i];
    giorni_lavorativi.push(Number(v) || 20);
  }
  const satBaselineRow = stRows[2] || [];
  const saturazione_baseline = [];
  for (let i = 7; i < 19; i++) {
    const v = satBaselineRow[i];
    saturazione_baseline.push(Number(v) || 0);
  }

  const staffing = [];
  const risorseEstese = new Set();
  for (let r = 4; r < stRows.length; r++) {
    const row = stRows[r];
    if (!row || !row[0]) continue;
    const nome = ('' + row[0]).trim();
    risorseEstese.add(nome);
    const mesi = [];
    for (let i = 7; i < 19; i++) mesi.push(Number(row[i]) || 0);
    if (mesi.every(v => v === 0) && !row[5]) continue;
    staffing.push({
      risorsa: nome,
      societa: row[1] || null,
      area: row[2] || null,
      team: row[3] || null,
      team_leader: row[4] || null,
      commessa: row[5] || null,
      sotto_progetto: row[6] || null,
      mesi,
    });
  }

  // === Riconciliazione ===
  const recon = riconcilia(operatoriBrevi.map(o => o.nome_breve), risorseEstese);

  // === Costruisco operatori arricchiti ===
  const reconMap = {};
  recon.forEach(r => { reconMap[r.breve] = r.esteso; });
  const operatori = [];
  operatoriBrevi.forEach(op => {
    const nomeEsteso = reconMap[op.nome_breve] || op.nome_breve;
    operatori.push({
      id: 'op_' + op.nome_breve.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      nome_breve: op.nome_breve,
      nome_esteso: nomeEsteso,
      skills: op.skills,
      attestati: attestati_per_op[nomeEsteso] || [],
      alloc_mensile: new Array(12).fill(0),
      saturazione: new Array(12).fill(0),
    });
  });
  // Operatori "orphan" (presenti in staffing ma non in OPERATORI)
  const operatoriEstesi = new Set(operatori.map(o => o.nome_esteso));
  [...risorseEstese].sort().forEach(re => {
    if (!operatoriEstesi.has(re)) {
      operatori.push({
        id: 'op_' + re.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        nome_breve: re,
        nome_esteso: re,
        skills: [],
        attestati: attestati_per_op[re] || [],
        orphan: true,
        alloc_mensile: new Array(12).fill(0),
        saturazione: new Array(12).fill(0),
      });
    }
  });

  // === Post-process pipeline: cerco colonne attestati richiesti ===
  // Per ogni attestato disponibile, cerco se c'è una colonna omonima nell'header pipeline
  if (attestati_disponibili.length > 0) {
    const pipelineAttIdx = {};
    attestati_disponibili.forEach(att => {
      const idx = headerP.findIndex(h => (h||'').toString().trim().toLowerCase() === att.toLowerCase());
      if (idx >= 0) pipelineAttIdx[att] = idx;
    });
    if (Object.keys(pipelineAttIdx).length > 0) {
      pipeline.forEach(p => {
        const r = p._rowIdx;
        const row = pipelineRows[r];
        Object.entries(pipelineAttIdx).forEach(([att, idx]) => {
          const v = ('' + (row[idx]||'')).trim().toLowerCase();
          if (v === 'sì' || v === 'si') p.attestati_richiesti.push(att);
        });
      });
    }
  }
  pipeline.forEach(p => delete p._rowIdx);

  // === Commesse attive (raggruppate dallo staffing) ===
  const grouped = {};
  staffing.forEach(r => {
    if (!r.commessa) return;
    if (!grouped[r.commessa]) grouped[r.commessa] = [];
    grouped[r.commessa].push({ risorsa: r.risorsa, mesi: r.mesi });
  });
  const commesse_attive = Object.keys(grouped).map((c, i) => ({
    id: 'ca_' + i,
    progetto: c,
    allocazioni: grouped[c],
  }));

  return {
    pipeline,
    operatori,
    staffing,
    commesse_attive,
    giorni_lavorativi,
    saturazione_baseline,
    riconciliazione: recon,
    attestati_disponibili,
  };
}

function parseDateCell(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth()+1).padStart(2,'0'), d = String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  // Excel serial number
  if (typeof v === 'number' && v > 25569 && v < 100000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return parseDateCell(d);
  }
  const s = ('' + v).trim();
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  // M/D/YY o M/D/YYYY o D/M/YYYY
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    // espandi anno a 2 cifre
    if (c.length === 2) c = (parseInt(c) >= 70 ? '19' : '20') + c;
    // euristica: se primo blocco > 12, è giorno
    if (parseInt(a) > 12) return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    // altrimenti assumo M/D/Y (formato US, default di SheetJS)
    return `${c}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
  }
  return s;
}

async function importXlsx(file) {
  if (!sbGuardWrite()) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }
  if (!await showConfirmAsync(`Importare "${file.name}"?\n\nLo stato corrente (commesse, operatori, assegnazioni manuali, modifiche allo staffing) verrà sostituito con i dati del file.`, 'Importa')) return;

  try {
    const buf = await file.arrayBuffer();
    const parsed = parseXlsxToData(buf);

    // Sostituisco il riferimento globale INITIAL_DATA (per i calcoli giorni_lavorativi etc.)
    INITIAL_DATA.pipeline = parsed.pipeline;
    INITIAL_DATA.operatori = parsed.operatori;
    INITIAL_DATA.staffing = parsed.staffing;
    INITIAL_DATA.commesse_attive = parsed.commesse_attive;
    INITIAL_DATA.giorni_lavorativi = parsed.giorni_lavorativi;
    INITIAL_DATA.saturazione_baseline = parsed.saturazione_baseline;
    INITIAL_DATA.riconciliazione = parsed.riconciliazione;
    INITIAL_DATA.attestati_disponibili = parsed.attestati_disponibili || [];
    // Aggiorno la lista globale degli attestati con quella del file importato
    ATTESTATI = INITIAL_DATA.attestati_disponibili;

    // Resetto lo stato runtime con i nuovi dati
    state.pipeline = JSON.parse(JSON.stringify(parsed.pipeline));
    state.operatori = JSON.parse(JSON.stringify(parsed.operatori));
    state.staffing = JSON.parse(JSON.stringify(parsed.staffing));
    state.commesse_attive = parsed.commesse_attive;
    state.assegnazioni = [];
    state.commesse_chiuse = [];
    state.filters = { search:'', skills:new Set(), attestati:new Set(), lowSat:false };

    // Pulisco lo storage e salvo il nuovo stato come baseline
    if (hasStorage) {
      for (const k of ['commesse_pipeline','operatori','assegnazioni','commesse_attive_extra','staffing_modificato','commesse_chiuse']) {
        try { await window.storage.delete(k); } catch{}
      }
    } else {
      sessionStorage.clear();
    }

    ricalcolaAllocOperatori();
    await saveState();
    renderRiconciliazione();
    renderAttestatiFilters(); // ricarica filtri attestati con i nuovi
    renderAll();

    // Report di importazione
    const reconWarn = parsed.riconciliazione.filter(r => r.status !== 'ok').length;
    let msg = `✓ Importazione completata\n\n`;
    msg += `• ${parsed.pipeline.length} commesse pipeline\n`;
    msg += `• ${parsed.operatori.length} operatori (di cui ${parsed.operatori.filter(o=>o.orphan).length} senza skill matrix)\n`;
    msg += `• ${parsed.staffing.length} righe staffing\n`;
    msg += `• ${parsed.commesse_attive.length} commesse attive (dallo staffing)\n`;
    if (reconWarn > 0) msg += `\n⚠ ${reconWarn} riconciliazioni nomi da verificare nella sezione "Riconciliazione nomi operatori"`;
    showAlertModal(msg);
  } catch (err) {
    console.error(err);
    showAlertModal(`Errore durante l'importazione:\n\n${err.message}\n\nVerifica che il file abbia la stessa struttura del Pipeline_Commerciale (fogli "Elenco commesse NEW", "OPERATORI", "Staffing attuale").`);
  }
}

