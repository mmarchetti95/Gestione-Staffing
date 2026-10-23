/* ==================== CONTROLLO ANOMALIE · EXPORT PDF ====================
   "📄 Esporta PDF" nella barra del modal: esporta le anomalie APERTE della linguetta
   mostrata (Tutte = una sezione per controllo), escluse ignorate e già corrette, pronte da
   mandare ai controller. Una tabella per controllo con colonne sue (CPA_PDF_COLONNE), la
   barretta a sinistra di ogni riga ha il colore della gravità. jsPDF + autoTable come il
   Report Controllo Produzione; i font standard non hanno emoji né frecce: ogni testo passa
   da _cpaPdfTxt. */

const CPA_PDF_GRAVITA = { alta: [220, 38, 38], media: [217, 119, 6], bassa: [148, 163, 184] };

/* Solo caratteri della codifica dei font standard di jsPDF (Latin-1 + qualche tipografico) */
function _cpaPdfTxt(s) {
  return String(s == null ? '' : s)
    .replace(/→/g, '->').replace(/[−‐‑]/g, '-')
    .replace(/[^\n\t\x20-\x7E\xA0-\xFF—–‘’“”•…€‹›]/g, '')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

function _cpaPdfH(n) { return _cpaFmt(n) + ' h'; }

function _cpaPdfSegno(n) { return (n > 0 ? '+' : n < 0 ? '-' : '') + _cpaFmt(Math.abs(n)) + ' h'; }

function _cpaPdfVoce(v) {
  return v.cantiere + (v.attivita ? ' (' + v.attivita + ')' : '') + (v.subtask ? ' · ' + v.subtask.key : '');
}

function _cpaPdfTicket(t) {
  return t.key + ' ' + _cpaPdfH(t.hours) + (t.summary ? ' · ' + t.summary : '') +
    (t.dove ? '\n  -> ' + t.dove.cantiere + ' (' + t.dove.commessa + ')' : '');
}

/* Correzione proposta + stato del sollecito, se già inviato */
function _cpaPdfCorrezione(a) {
  let s = (a.correzione || '').replace('(proposta sotto)', '(colonna "Cella proposta")');
  if (a.meteo && a.meteo.testo && a.tipo !== 'ore_scoperte_maltempo') s += '\n' + a.meteo.testo;
  if (a.solleciti && a.solleciti.length) {
    const inv = _cpaSollInviati(_cpa.anno, _cpa.week);
    const fatti = a.solleciti.filter(x => inv[x.operatore] && (inv[x.operatore].giorni || []).includes(x.giorno));
    if (fatti.length) s += '\nSollecitato il ' + new Date(inv[fatti[0].operatore].ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
      (a.solleciti.length > 1 ? ' (' + fatti.map(x => x.operatore).join(', ') + ')' : '');
  }
  return s;
}

/* Colonne per controllo: titolo, larghezza (mm, 'auto' = il resto) e valore della riga */
const CPA_PDF_COLONNE = {
  pianificato_senza_worklog: [
    ['Operatore', 34, a => a.operatore],
    ['Commessa / squadra', 40, a => [a.commessa, a.squadra].filter(Boolean).join('\n')],
    ['Pianificato in Griglia', 62, a => ((a.confronto || {}).griglia || []).map(_cpaPdfVoce).join('\n')],
    ['Ore Jira', 16, a => _cpaPdfH((a.confronto || {}).oreJira || 0)],
  ],
  worklog_senza_pianificazione: [
    ['Operatore', 32, a => a.operatore],
    ['In Griglia', 24, a => { const x = (a.confronto || {}).assenza; return x === 'ferie' ? 'In ferie' : x ? 'Non disponibile' : 'Nessun cantiere'; }],
    ['Su Jira', 66, a => { const C = a.confronto || {}; return _cpaPdfH(C.oreJira) + '\n' + (C.jira || []).map(_cpaPdfTicket).join('\n'); }],
    ['Cella proposta', 46, a => {
      const voci = _cpaPropVoci(a).filter(v => v.commessa || v.cantiere);
      const cert = (CPA_CERTEZZA[(a.azione || {}).certezza] || CPA_CERTEZZA.nessuna).testo;
      return (voci.length ? voci.map(v => v.cantiere + (v.attivita ? ' (' + v.attivita + ')' : '') + '\n  ' + v.commessa).join('\n') : '—') + '\n[' + cert + ']';
    }],
  ],
  epic_diverso: [
    ['Operatore', 32, a => a.operatore],
    ['Commessa / squadra / cantiere', 46, a => [a.commessa, a.squadra, a.cantiere].filter(Boolean).join('\n')],
    ['Epic in Griglia', 40, a => [...new Set(((a.confronto || {}).griglia || []).filter(v => v.epic).map(v => v.epic.name))].join('\n') || '—'],
    ['Ore su altro Epic', 54, a => ((a.confronto || {}).jira || []).filter(t => t.fuori)
      .map(t => t.key + ' ' + _cpaPdfH(t.hours) + '\n  -> Epic ' + ((t.epic && (t.epic.name || t.epic.key)) || '?')).join('\n')],
  ],
  ore_squadra: [
    ['Commessa / squadra', 38, a => [a.commessa, a.squadra].filter(Boolean).join('\n')],
    ['Cantieri', 36, a => a.cantiere],
    ['Ore Jira per operatore', 62, a => { const C = a.confronto || {}; return (C.membri || []).map(m => m.operatore + ': ' +
      (m.piuSquadre ? 'su più squadre, escluso' : m.escluso ? '0 h' : _cpaPdfH(m.ore) + (m.basso ? '  (' + _cpaPdfSegno(m.ore - C.max) + ')' : ''))).join('\n'); }],
    ['Scarto', 16, a => { const C = a.confronto || {}; return _cpaPdfH(Math.round((C.max - C.min) * 100) / 100); }],
  ],
  mysond_diverso: [
    ['Operatore', 32, a => a.operatore],
    ['Commessa / cantiere', 40, a => [a.commessa, a.cantiere].filter(Boolean).join('\n')],
    ['MySond lavoro', 17, a => _cpaPdfH(a.confronto.mysond.lavoro)],
    ['Viaggio', 15, a => a.confronto.mysond.viaggio ? _cpaPdfH(a.confronto.mysond.viaggio) : '—'],
    ['Non lav.', 15, a => a.confronto.mysond.nonLavorate ? _cpaPdfH(a.confronto.mysond.nonLavorate) : '—'],
    ['Jira', 22, a => _cpaPdfH(a.confronto.oreJira) + ((a.confronto.jira || []).length ? '\n' + a.confronto.jira.map(t => t.key).join('\n') : '')],
    ['Atteso su Jira', 19, a => { const C = a.confronto; return C.attesoMax > C.attesoMin ? _cpaFmt(C.attesoMin) + ' – ' + _cpaPdfH(C.attesoMax) : _cpaPdfH(C.attesoMin); }],
    ['Scarto', 15, a => { const C = a.confronto; return _cpaPdfSegno(Math.round((C.oreJira - (C.oreJira < C.attesoMin ? C.attesoMin : C.attesoMax)) * 100) / 100); }],
  ],
  ore_scoperte_maltempo: [
    ['Operatore', 32, a => a.operatore],
    ['Commessa / squadra / cantiere', 46, a => [a.commessa, a.squadra, a.cantiere].filter(Boolean).join('\n')],
    ['Ore Jira', 16, a => _cpaPdfH(a.confronto.oreJira)],
    ['Ore scoperte', 18, a => _cpaPdfH(a.meteo.oreScoperte)],
    ['Evidenza maltempo', 70, a => _cpaPdfMeteo(a.meteo)],
  ],
};

/* Evidenza meteo per il PDF: pioggia nelle ore di lavoro e allerta, ora per ora in breve */
function _cpaPdfMeteo(ev) {
  if (!ev) return '';
  const righe = ['Cantiere ' + ev.cantiere];
  if (ev.orePioggia) righe.push('Pioggia in ' + ev.orePioggia + (ev.orePioggia === 1 ? ' ora' : ' ore') + ' di lavoro: ' + ev.fasce + ' (' + _cpaFmt(ev.mmFascia) + ' mm)');
  if (ev.mmGiorno != null) righe.push('Totale giorno: ' + _cpaFmt(ev.mmGiorno) + ' mm');
  if (ev.pc) righe.push('Allerta Protezione Civile ' + ev.pc);
  const bagnate = (ev.orario || []).filter(x => x.maltempo).sort((x, y) => x.ora - y.ora);
  if (bagnate.length) righe.push('Ora per ora: ' + bagnate.map(x => x.ora + '-' + (x.ora + 1) + ' ' + _cpaFmt(x.mm) + ' mm').join(', '));
  return righe.join('\n');
}

/* Soglia in uso, citata nel sottotitolo della sezione */
function _cpaPdfSoglia(tipo) {
  const p = _cpaPref();
  if (tipo === 'ore_squadra') return 'Scarto minimo segnalato: ' + _cpaPdfH(Number(p.diffOreSquadra)) + '.';
  if (tipo === 'mysond_diverso') return 'Scarto minimo segnalato: ' + _cpaPdfH(Number(p.diffOreMysond)) + '.';
  return '';
}

function cpaEsportaPdf() {
  const r = _cpa.risultato;
  if (!r || _cpa.anno !== pwAnno || _cpa.week !== pwWeek) { showAlertModal('Nessun controllo per questa settimana: avvialo prima di esportare.'); return; }
  if (!window.jspdf || !window.jspdf.jsPDF) { showAlertModal('Libreria PDF non disponibile.'); return; }
  const ign = _cpaIgnorate();
  const tipi = _cpa.filtro ? [_cpa.filtro] : Object.keys(CPA_TIPI);
  const inTipo = r.anomalie.filter(a => tipi.includes(a.tipo) && !_cpa.risolte.has(a.id));
  const lista = inTipo.filter(a => !ign[a.id]);
  if (!lista.length) { showAlertModal('Nessuna anomalia aperta da esportare in questa linguetta.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  const titolo = _cpa.filtro ? CPA_TIPI[_cpa.filtro].etichetta : 'Tutti i controlli';
  const periodo = r.ddmm[0] + ' – ' + r.ddmm[5] + '/' + _cpa.anno;
  const ora = d => d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.setTextColor(180, 83, 9);
  doc.text(_cpaPdfTxt('Controllo anomalie produzione — ' + titolo), M, 15);
  doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text(_cpaPdfTxt('Settimana ' + _cpa.week + ' · ' + periodo + ' · ' + lista.length + (lista.length === 1 ? ' anomalia aperta' : ' anomalie aperte')), M, 21);
  const fonti = [
    r.quando ? 'Ore Jira lette il ' + ora(r.quando) : '',
    tipi.includes('mysond_diverso') ? (r.mysondCaricato ? 'ore MySond caricate' : 'ore MySond non caricate: confronto non fatto') : '',
    'generato il ' + ora(new Date()) + ((_sbUser && _sbUser.email) ? ' da ' + _sbUser.email : ''),
  ].filter(Boolean).join(' · ');
  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text(_cpaPdfTxt(fonti.charAt(0).toUpperCase() + fonti.slice(1)), M, 26);
  const nIgn = inTipo.length - lista.length;
  doc.text(_cpaPdfTxt('Barretta a sinistra: rosso = priorità alta, arancio = da verificare, grigio = lieve.' +
    (nIgn ? ' Escluse ' + nIgn + (nIgn === 1 ? ' anomalia ignorata.' : ' anomalie ignorate.') : '') +
    (_cpa.risolte.size ? ' ' + _cpa.risolte.size + ' già corrette in Griglia non incluse.' : '')), M, 30.5);

  let y = 37;
  tipi.forEach(tipo => {
    const voci = lista.filter(a => a.tipo === tipo);
    if (!voci.length) return;
    const T = CPA_TIPI[tipo];
    if (y > pageH - 40) { doc.addPage(); y = 15; }
    if (!_cpa.filtro) {
      doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.setTextColor(30, 41, 59);
      doc.text(_cpaPdfTxt(T.etichetta + ' (' + voci.length + ')'), M, y);
      y += 5;
    }
    doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
    const desc = doc.splitTextToSize(_cpaPdfTxt(T.descrizione + ' ' + _cpaPdfSoglia(tipo)), pageW - 2 * M);
    doc.text(desc, M, y);
    y += desc.length * 3.6 + 1;

    const colonne = CPA_PDF_COLONNE[tipo];
    const head = ['Giorno'].concat(colonne.map(c => c[0]), ['Correzione proposta']);
    const body = voci.map(a => [r.giorniLabel[a.giorno] || ''].concat(colonne.map(c => c[2](a)), [_cpaPdfCorrezione(a)]).map(_cpaPdfTxt));
    const columnStyles = { 0: { cellWidth: 19, fontStyle: 'bold' } };
    colonne.forEach((c, i) => { columnStyles[i + 1] = { cellWidth: c[1] }; });
    columnStyles[colonne.length + 1] = { cellWidth: 'auto', textColor: [15, 118, 110] };

    doc.autoTable({
      startY: y, head: [head], body,
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: { top: 1.6, bottom: 1.6, left: 2.4, right: 1.6 }, overflow: 'linebreak', valign: 'top', lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      rowPageBreak: 'avoid',
      margin: { left: M, right: M, bottom: 14 },
      didDrawCell: h => {
        if (h.section !== 'body' || h.column.index !== 0) return;
        const g = CPA_PDF_GRAVITA[voci[h.row.index].gravita] || CPA_PDF_GRAVITA.bassa;
        doc.setFillColor(g[0], g[1], g[2]);
        doc.rect(h.cell.x, h.cell.y, 1.1, h.cell.height, 'F');
      },
    });
    y = doc.lastAutoTable.finalY + 9;
  });

  const pagine = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text(_cpaPdfTxt('Controllo anomalie · ' + titolo + ' · Settimana ' + _cpa.week + '/' + _cpa.anno), M, pageH - 7);
    doc.text('Pagina ' + p + ' / ' + pagine, pageW - M, pageH - 7, { align: 'right' });
  }

  const slug = titolo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  doc.save('Anomalie_' + slug + '_W' + _cpa.week + '_' + _cpa.anno + '.pdf');
  sbLogActivity('Controllo anomalie: export PDF', { anno: _cpa.anno, week: _cpa.week, tipo: _cpa.filtro || 'tutte', anomalie: lista.length });
}
