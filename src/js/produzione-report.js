/* ==================== CARICA REPORT PRODUZIONE (per squadra) ==================== */

// Converte "HH:MM" in minuti dall'inizio giornata. Null se non valido.
function cpHmToMin(hm) {
  const mm = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!mm) return null;
  return parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
}

// Divide una riga CSV rispettando le virgolette (gestisce "" come virgoletta
// letterale). Ritorna i campi già trimmati.
function cpSplitCsvLine(line, delim) {
  const out = [];
  let cur = '', inq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inq) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inq = false;
      } else cur += ch;
    } else {
      if (ch === '"') inq = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Parsa il CSV del report produzione. Rileva il delimitatore (; o ,), mappa le
// colonne dall'intestazione (con fallback posizionale) e aggrega per
// (username, dataISO): { startMin, endMin, lenM (somma metri sui layer diversi da "Note") }.
// Le righe del layer "Note" contribuiscono solo a Inizio/Fine (orario), mai alla Lunghezza:
// sono annotazioni puntuali senza un percorso reale associato, sommarle gonfierebbe il Km/Cad.
function cpParseReportCsv(text) {
  const MESI = {
    gennaio:1, febbraio:2, marzo:3, aprile:4, maggio:5, giugno:6,
    luglio:7, agosto:8, settembre:9, ottobre:10, novembre:11, dicembre:12,
  };
  text = String(text || '').replace(/^\ufeff/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { agg: {}, rows: 0 };

  // Delimitatore: quello più frequente nella prima riga tra ; e ,
  const h0 = lines[0];
  const delim = ((h0.match(/;/g) || []).length >= (h0.match(/,/g) || []).length) ? ';' : ',';

  // Intestazione → indici colonna (per nome, robusto al riordino)
  const header = cpSplitCsvLine(lines[0], delim).map(s => s.toLowerCase());
  const findCol = (...names) => {
    for (const n of names) {
      const idx = header.findIndex(h => h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  let iAnno = findCol('anno'), iMese = findCol('mese'), iGiorno = findCol('giorno');
  let iOp = findCol('operatore', 'utente'), iIn = findCol('inizio'), iFin = findCol('fine');
  let iLen = findCol('lunghezza', 'lungh'), iLayer = findCol('layer');
  const hasHeader = (iAnno >= 0 && iMese >= 0 && iGiorno >= 0 && iOp >= 0);
  // Fallback posizionale (formato noto: Layer;Anno;Mese;Giorno;Operatore;Inizio;Fine;Prod;Ore;Lunghezza;Attivita)
  if (!hasHeader) { iAnno=1; iMese=2; iGiorno=3; iOp=4; iIn=5; iFin=6; iLen=9; iLayer=0; }

  const agg = {};
  let rows = 0;
  const startRow = hasHeader ? 1 : 0;
  for (let li = startRow; li < lines.length; li++) {
    const f = cpSplitCsvLine(lines[li], delim);
    if (f.length <= Math.max(iAnno, iMese, iGiorno, iOp, iLen)) continue;
    const anno = String(f[iAnno] || '').trim();
    if (!/^\d{4}$/.test(anno)) continue;
    const meseNum = MESI[String(f[iMese] || '').trim().toLowerCase()];
    if (!meseNum) continue;
    const gg   = String(f[iGiorno] || '').trim().padStart(2, '0');
    const user = String(f[iOp] || '').trim().toLowerCase();
    if (!user) continue;
    const dateISO = `${anno}-${String(meseNum).padStart(2, '0')}-${gg}`;
    const startMin = iIn  >= 0 ? cpHmToMin(f[iIn])  : null;
    const endMin   = iFin >= 0 ? cpHmToMin(f[iFin]) : null;
    const isNoteLayer = iLayer >= 0 && String(f[iLayer] || '').trim().toLowerCase() === 'note';
    const lenM = (!isNoteLayer && iLen >= 0) ? (parseFloat(String(f[iLen] || '').replace(',', '.')) || 0) : 0;
    const key = `${user}|||${dateISO}`;
    if (!agg[key]) agg[key] = { startMin: Infinity, endMin: -Infinity, lenM: 0 };
    // Il layer "Note" contribuisce solo a Inizio/Fine, mai alla Lunghezza (vedi commento in cima alla funzione).
    if (startMin != null && startMin < agg[key].startMin) agg[key].startMin = startMin;
    if (endMin   != null && endMin   > agg[key].endMin)   agg[key].endMin   = endMin;
    agg[key].lenM += lenM;
    rows++;
  }
  Object.values(agg).forEach(a => {
    if (a.startMin === Infinity)  a.startMin = 0;
    if (a.endMin   === -Infinity) a.endMin   = 0;
  });
  return { agg, rows };
}

// Ritorna, per la commessa+squadra indicate, gli operatori pianificati per giorno
// (stessa logica di inclusione del render: cantiere assegnato e non in ferie).
function cpGetSquadraOpsByDay(commessa, squadra) {
  const data = pwGetWeekData();
  const fw = pwGetFerieWeek();
  const perDay = {};
  data.forEach(bc => {
    if (bc.commessa !== commessa) return;
    (bc.squadre || []).forEach(sq => {
      const sqNome = sq.nome || 'Squadra';
      if (sqNome !== squadra) return;
      for (let g = 0; g < 6; g++) {
        const ops = [];
        (sq.operatori || []).forEach(op => {
          if (!op.nome || !op.nome.trim()) return;
          const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
          if (!opG.cantiere || !opG.cantiere.trim()) return;
          if (fw[op.nome] && fw[op.nome][g] === true) return;
          ops.push({ nome: op.nome, cantiere: opG.cantiere || '', attivita: opG.attivita || '' });
        });
        if (ops.length > 0) perDay[g] = ops;
      }
    });
  });
  return perDay;
}

// Handler del bottone: apre il selettore file (CSV) per la squadra indicata.
async function cpCaricaReportSquadra(commessa, squadra) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.csv,text/csv,text/plain';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.onchange = async () => {
    const file = inp.files && inp.files[0];
    if (inp.parentNode) inp.parentNode.removeChild(inp);
    if (!file) return;
    const st = document.getElementById('cp-status');
    if (st) st.textContent = '⏳ Lettura report…';
    try {
      let text;
      if (typeof file.text === 'function') {
        text = await file.text();
      } else {
        text = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(new Error('lettura fallita'));
          fr.readAsText(file);
        });
      }
      await cpProcessReport(text, commessa, squadra);
    } catch (e) {
      console.error('cpCaricaReportSquadra error:', e);
      showAlertModal('Errore durante il caricamento del report:\n' + (e && e.message ? e.message : String(e)));
    } finally {
      if (st) st.textContent = '';
    }
  };
  inp.click();
}

// Elabora il CSV e compila Ore Report Prod. + KM/Cad per la squadra/settimana.
async function cpProcessReport(csvText, commessa, squadra) {
  const { agg: parsed, rows } = cpParseReportCsv(csvText);
  if (rows === 0) {
    showAlertModal('Il file non contiene righe valide.\nAtteso un CSV report produzione con colonne Anno, Mese, Giorno, Operatore, Inizio, Fine, Lunghezza.');
    return;
  }

  const opsByDay = cpGetSquadraOpsByDay(commessa, squadra);
  const days = Object.keys(opsByDay).map(Number).sort((a, b) => a - b);
  if (days.length === 0) {
    showAlertModal(`La squadra "${squadra}" non ha operatori pianificati questa settimana.`);
    return;
  }

  // Date ISO Lun..Sab della settimana corrente
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const isoDates = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    isoDates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
  }

  // Mappa nome operatore -> email (stessa logica del sync Jira)
  const emailByNome = {};
  (state.operatori || []).forEach(o => {
    const n = o.nome_esteso || o.nome_breve || o.nome;
    if (n && o.email && o.email.trim()) emailByNome[n] = o.email.trim();
  });

  // Comuni (Epic) disponibili nei ticket della squadra questa settimana
  const comuneSet = new Set();
  for (const g of days) {
    for (const op of opsByDay[g]) {
      const k = `${commessa}|||${squadra}|||${op.nome}|||${g}`;
      const tks = (_cpData[k] && Array.isArray(_cpData[k].jira_tickets)) ? _cpData[k].jira_tickets : [];
      tks.forEach(t => { if (t.epic && t.epic.name) comuneSet.add(t.epic.name); });
    }
  }
  const comuni = [...comuneSet].sort();
  if (comuni.length === 0) {
    showAlertModal('Nessun ticket trovato per questa squadra in questa settimana.\nEsegui prima "Sincronizza con Jira" per portare i ticket, poi ricarica il report.');
    return;
  }

  // Selezione manuale del comune a cui si riferisce il report
  const comuneSel = await cpSelectModal(
    'Comune del report',
    `A quale comune si riferisce questo report per la squadra "${squadra}"?\nIl valore Km/Cad verrà scritto sul ticket di quel comune.`,
    comuni.map(c => ({ value: c, label: c })));
  if (!comuneSel) return;

  // Costruisci l'elenco delle celle da aggiornare
  const updates = [];
  const opsNoEmail = new Set();
  let daysWithData = 0, daysZero = 0, noTicket = 0;

  for (const g of days) {
    const ops = opsByDay[g];
    const N = ops.length;
    const dateISO = isoDates[g];

    let source = null;
    ops.forEach(op => {
      const email = emailByNome[op.nome];
      if (!email) { opsNoEmail.add(op.nome); return; }
      const user = email.split('@')[0].toLowerCase();
      const rec = parsed[`${user}|||${dateISO}`];
      if (rec && (!source || rec.lenM > source.lenM)) source = rec;
    });

    let oreVal = 0, kmVal = 0;
    if (source) {
      daysWithData++;
      const oreSpan = Math.max(0, source.endMin - source.startMin) / 60;
      oreVal = Math.round(oreSpan * 100) / 100;
      kmVal  = Math.round(((source.lenM / 1000) / N) * 1000) / 1000;
    } else {
      daysZero++;
    }

    ops.forEach(op => {
      const k = `${commessa}|||${squadra}|||${op.nome}|||${g}`;
      const tks = (_cpData[k] && Array.isArray(_cpData[k].jira_tickets)) ? _cpData[k].jira_tickets : [];
      const ticket = tks.find(t => t.epic && t.epic.name === comuneSel);
      if (source && !ticket) noTicket++;
      updates.push({
        operatore: op.nome, giorno: g, dataISO: dateISO,
        cantiere: op.cantiere, attivita: op.attivita,
        ore: oreVal, km: kmVal, ticketKey: ticket ? ticket.key : null,
      });
    });
  }

  if (daysWithData === 0) {
    const range = (() => {
      const ds = Object.keys(parsed).map(k => k.split('|||')[1]).sort();
      return ds.length ? `${ds[0]} … ${ds[ds.length-1]}` : '—';
    })();
    const ok0 = await showConfirmAsync(
      `Nessun dato trovato nel report per gli operatori di "${squadra}" in questa settimana ` +
      `(${isoDates[days[0]]} … ${isoDates[days[days.length-1]]}).\n\nIl report copre il periodo ${range}.\n\n` +
      `Vuoi comunque azzerare le ore per questi giorni?`,
      'Azzera comunque');
    if (!ok0) return;
  } else {
    const ok = await showConfirmAsync(
      `Comune "${comuneSel}" — squadra "${squadra}": verranno compilati "Ore Report Prod." e il "Km/Cad" del ticket di quel comune ` +
      `(${daysWithData} giorni con dati, ${daysZero} a zero` + (noTicket > 0 ? `, ${noTicket} senza ticket del comune` : ``) + `). ` +
      `I valori esistenti per quel ticket saranno sovrascritti. Procedere?`,
      'Carica Report');
    if (!ok) return;
  }

  // Applica: aggiorna cache locale (ore per cella, km sul ticket del comune) e persisti
  const touched = new Map();
  updates.forEach(u => {
    const k = `${commessa}|||${squadra}|||${u.operatore}|||${u.giorno}`;
    if (!_cpData[k]) _cpData[k] = {};
    _cpData[k].ore_report = u.ore;
    if (u.ticketKey) {
      if (!_cpData[k].km_by_ticket || typeof _cpData[k].km_by_ticket !== 'object') _cpData[k].km_by_ticket = {};
      _cpData[k].km_by_ticket[u.ticketKey] = u.km;
      _cpData[k].km_cad = cpSumKm(_cpData[k].km_by_ticket);
    }
    touched.set(k, u);
  });

  const records = [...touched.values()].map(u => cpBuildRecord(commessa, squadra, u.operatore, u.giorno, u.dataISO, u.cantiere, u.attivita));

  if (_sbClient && _sbUser && records.length > 0) {
    try {
      const { error } = await _sbClient
        .from('controllo_produzione')
        .upsert(records, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
      if (error) throw error;
    } catch (e) {
      console.error('cpProcessReport upsert error:', e);
      showAlertModal('Errore durante il salvataggio: ' + (e.message || e));
      return;
    }
  }

  pwControlloRender();
  pwApplyProduzioneColors();

  let msg = `✅ Comune "${comuneSel}" — squadra "${squadra}": aggiornate ${records.length} celle ` +
            `(${daysWithData} giorni con dati, ${daysZero} a zero).`;
  if (noTicket > 0) {
    msg += `\n\n⚠ ${noTicket} operatore/giorno con dati nel report ma senza ticket del comune "${comuneSel}" (KM non assegnato). Verifica di aver sincronizzato Jira.`;
  }
  if (opsNoEmail.size > 0) {
    msg += `\n\n⚠ Operatori senza email assegnata (non abbinabili al report): ${[...opsNoEmail].join(', ')}.`;
  }
  showAlertModal(msg);
}

function pwControlloExport() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non disponibile.'); return; }
  const data    = pwGetWeekData();
  const monday  = isoWeekToMonday(pwAnno, pwWeek);
  const DAY_NAMES = ['Lun','Mar','Mer','Gio','Ven','Sab'];
  const dates = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`);
  }

  const headers = ['Commessa','Squadra','Operatore','Verificato','Giorno','Data','Cantiere','Attività',
                   'Ore Jira','Ticket','Epic','Ore Report Prod.','Δ Ore','Km / Cad','Note'];
  const wsData = [headers];

  // Stesso ordine del render: commessa → squadra → giorno → operatori
  data.forEach(bc => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => {
      const sqNome = sq.nome || 'Squadra';
      for (let g = 0; g < 6; g++) {
        (sq.operatori || []).forEach(op => {
          if (!op.nome || !op.nome.trim()) return;
          const opG   = op.giorni && op.giorni[g] ? op.giorni[g] : {};
          const k     = `${bc.commessa}|||${sqNome}|||${op.nome}|||${g}`;
          const saved = _cpData[k] || {};
          const jVal  = saved.ore_jira   != null ? saved.ore_jira   : '';
          const rVal  = saved.ore_report != null ? saved.ore_report : '';
          const jNum  = parseFloat(String(jVal)), rNum = parseFloat(String(rVal));
          const delta = (!isNaN(jNum) && !isNaN(rNum)) ? jNum - rNum : '';
          const ticketStr = Array.isArray(saved.jira_tickets)
            ? saved.jira_tickets.map(t => t.key).join(', ') : '';
          const epicStr = Array.isArray(saved.jira_tickets)
            ? [...new Set(saved.jira_tickets.filter(t => t.epic && t.epic.name).map(t => t.epic.name))].join(', ') : '';
          wsData.push([
            bc.commessa, sqNome, op.nome,
            saved.verificato === true ? 'Sì' : '',
            DAY_NAMES[g], dates[g],
            opG.cantiere || '', opG.attivita || '',
            jVal === '' ? '' : jVal,
            ticketStr,
            epicStr,
            rVal === '' ? '' : rVal,
            delta === '' ? '' : delta,
            saved.km_cad != null ? saved.km_cad : '',
            saved.note || '',
          ]);
        });
      }
    });
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{wch:35},{wch:15},{wch:22},{wch:10},{wch:6},{wch:8},
                 {wch:20},{wch:22},{wch:10},{wch:22},{wch:30},{wch:16},{wch:8},{wch:10},{wch:28}];

  const hStyle = { font:{bold:true,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'0F766E'}}, alignment:{horizontal:'center'} };
  const eStyle = { fill:{fgColor:{rgb:'FEFCE8'}} };
  headers.forEach((_, ci) => {
    const ref = XLSX.utils.encode_cell({r:0, c:ci});
    if (!ws[ref]) ws[ref] = {};
    ws[ref].s = hStyle;
  });
  for (let ri = 1; ri < wsData.length; ri++) {
    [8,11,13,14].forEach(ci => {
      const ref = XLSX.utils.encode_cell({r:ri, c:ci});
      if (!ws[ref]) ws[ref] = {t:'z'};
      ws[ref].s = eStyle;
    });
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Controllo Produzione');
  XLSX.writeFile(wb, `Report_Controllo_W${pwWeek}_${pwAnno}.xlsx`);
}

/* ----- Colore RGB (per PDF) della cella Ore Jira, stessa metrica dell'app.
   Ritorna [r,g,b] oppure null (nessun colore) per 0/vuoto. ----- */
function cpOreJiraRGB(jVal, giornoIdx) {
  const h = parseFloat(String(jVal));
  if (isNaN(h) || h === 0) return null;
  const isLunVen = (giornoIdx === 0 || giornoIdx === 4);
  if (h > 8.5) return [254, 249, 195];            // giallo
  if (isLunVen) return h < 5 ? [255, 237, 213]    // arancione
                             : [220, 252, 231];   // verde
  if (h < 5) return [254, 226, 226];              // rosso
  if (h < 7) return [255, 237, 213];              // arancione
  return [220, 252, 231];                         // verde
}

/* ----- Export PDF: report per giornata (da inviare al PM) ----- */
function pwControlloExportPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showAlertModal('Libreria PDF non disponibile.'); return; }
  const { jsPDF } = window.jspdf;

  const data      = pwGetWeekData();
  const monday    = isoWeekToMonday(pwAnno, pwWeek);
  const DAY_NAMES = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const dates = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`);
  }

  // Raggruppa per giorno -> operatori.
  // Righe normali: operatori con cantiere assegnato (non in ferie).
  // Righe speciali: operatori SENZA cantiere quel giorno ma in ferie o con attività
  //   -> compaiono con le sole "Altre informazioni" compilate.
  const fw = pwGetFerieWeek();
  const rowsByDay = [[],[],[],[],[],[]];
  const anyCantiereByDay = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];

  // FASE 1: righe normali + traccia chi ha un cantiere quel giorno
  data.forEach(bc => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => {
      const sqNome = sq.nome || 'Squadra';
      for (let g = 0; g < 6; g++) {
        (sq.operatori || []).forEach(op => {
          if (!op.nome || !op.nome.trim()) return;
          const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
          const cant = (opG.cantiere || '').trim();
          if (cant) anyCantiereByDay[g].add(op.nome);
          const isFerie = fw[op.nome] && fw[op.nome][g] === true;
          if (!cant || isFerie) return; // righa normale solo se cantiere e non ferie
          const k = `${bc.commessa}|||${sqNome}|||${op.nome}|||${g}`;
          const saved = _cpData[k] || {};
          const tickets = Array.isArray(saved.jira_tickets) ? saved.jira_tickets : [];
          const ticketStr = tickets.length ? tickets.map(t => t.key).join('\n') : '—';
          const epicStr = tickets.length
            ? ([...new Set(tickets.filter(t => t.epic && t.epic.name).map(t => t.epic.name))].join('\n') || '—')
            : '—';
          rowsByDay[g].push({
            operatore: op.nome,
            cantiere:  cant,
            oreJira:   saved.ore_jira != null ? saved.ore_jira : null,
            oreReport: saved.ore_report != null ? saved.ore_report : null,
            ticketStr, epicStr,
            altre: '',
          });
        });
      }
    });
  });

  // FASE 2: righe speciali (ferie / solo attività), senza cantiere quel giorno, dedup per operatore
  const specialSeen = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
  data.forEach(bc => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => {
      for (let g = 0; g < 6; g++) {
        (sq.operatori || []).forEach(op => {
          if (!op.nome || !op.nome.trim()) return;
          const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
          const cant = (opG.cantiere || '').trim();
          const att  = (opG.attivita || '').trim();
          const isFerie = fw[op.nome] && fw[op.nome][g] === true;
          if (cant) return;                              // questa cella ha cantiere -> non speciale
          if (anyCantiereByDay[g].has(op.nome)) return;  // ha cantiere altrove quel giorno
          if (!isFerie && !att) return;                  // niente da mostrare
          if (specialSeen[g].has(op.nome)) return;       // dedup per operatore/giorno
          specialSeen[g].add(op.nome);
          const altre = isFerie ? ('🌴 Ferie' + (att ? ' · ' + att : '')) : att;
          rowsByDay[g].push({
            operatore: op.nome,
            cantiere:  '—',
            oreJira:   null,
            oreReport: null,
            ticketStr: '—', epicStr: '—',
            altre,
          });
        });
      }
    });
  });

  if (rowsByDay.every(r => r.length === 0)) {
    showAlertModal('Nessun operatore pianificato da esportare per questa settimana.');
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Intestazione documento
  doc.setFontSize(15); doc.setFont(undefined, 'bold'); doc.setTextColor(15, 118, 110);
  doc.text(`Report Controllo Produzione — Settimana ${pwWeek} / ${pwAnno}`, 14, 14);
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(`Periodo: ${dates[0]} – ${dates[5]}   ·   Generato il ${new Date().toLocaleDateString('it-IT')}`, 14, 20);
  doc.setTextColor(0, 0, 0);

  let y = 27;

  DAY_NAMES.forEach((dn, g) => {
    const rows = rowsByDay[g];
    if (!rows.length) return;

    // Titolo giornata (con controllo spazio residuo)
    if (y > pageH - 30) { doc.addPage(); y = 15; }
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 41, 59);
    doc.text(`${dn.toUpperCase()}  ${dates[g]}`, 14, y);
    doc.setTextColor(0, 0, 0);

    doc.autoTable({
      startY: y + 2,
      head: [['Operatore', 'Cantiere', 'Ore Jira', 'Ore Report Prod.', 'Ticket', 'Epic', 'Altre informazioni']],
      body: rows.map(r => [
        r.operatore,
        r.cantiere || '—',
        (r.oreJira != null ? String(r.oreJira) : '—'),
        (r.oreReport != null ? String(r.oreReport) : '—'),
        r.ticketStr,
        r.epicStr,
        r.altre || '',
      ]),
      styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', halign: 'left' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 44 },
        1: { cellWidth: 44 },
        2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 38 },
        5: { cellWidth: 46 },
        6: { cellWidth: 'auto' },
      },
      margin: { left: 14, right: 14 },
      didParseCell: function (hookData) {
        if (hookData.section === 'body' && hookData.column.index === 2) {
          const rec = rows[hookData.row.index];
          const rgb = rec ? cpOreJiraRGB(rec.oreJira, g) : null;
          if (rgb) hookData.cell.styles.fillColor = rgb;
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;
  });

  // Numeri di pagina
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8); doc.setTextColor(148, 163, 184);
    doc.text(`Pagina ${p} / ${pages}`, pageW - 14, pageH - 8, { align: 'right' });
  }

  doc.save(`Report_Produzione_W${pwWeek}_${pwAnno}.pdf`);
}
