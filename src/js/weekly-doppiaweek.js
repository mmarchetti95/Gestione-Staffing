/* ==================== DOPPIA WEEK (prospetto mensile) ==================== */
let pwDwYear  = new Date().getUTCFullYear();
let pwDwMonth = new Date().getUTCMonth();
const PW_MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function pwDwMonthNav(delta) {
  pwDwMonth += delta;
  while (pwDwMonth > 11) { pwDwMonth -= 12; pwDwYear++; }
  while (pwDwMonth < 0)  { pwDwMonth += 12; pwDwYear--; }
  pwDoppiaWeekRender();
}

function pwDoppiaWeekRender() {
  const jsesc = v => (v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const label = document.getElementById('pw-dw-month-label');
  if (label) label.textContent = `${PW_MESI_IT[pwDwMonth]} ${pwDwYear}`;
  const grid = document.getElementById('pw-dw-grid');
  if (!grid) return;

  const weeks = pwMonthWeeks(pwDwYear, pwDwMonth);
  const ops = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean).sort();
  if (ops.length === 0) { grid.innerHTML = '<div style="padding:20px;color:#94a3b8;font-size:13px;">Nessun operatore attivo.</div>'; return; }

  const colW = 84; // larghezza minima colonna settimana
  const cols = `180px repeat(${weeks.length}, minmax(${colW}px, 1fr))`;
  const minW = 180 + weeks.length * colW;

  // Header (riga sticky in alto durante lo scroll verticale)
  let html = `<div style="display:grid;grid-template-columns:${cols};min-width:${minW}px;position:sticky;top:0;z-index:5;">`;
  html += `<div style="position:sticky;left:0;z-index:6;background:#eef2ff;font-size:10px;font-weight:700;color:#3730a3;text-transform:uppercase;padding:8px;border-bottom:1px solid #e2e8f0;">Operatore</div>`;
  weeks.forEach(wk => {
    const mon = isoWeekToMonday(wk.anno, wk.week);
    const sat = new Date(mon); sat.setUTCDate(mon.getUTCDate() + 5);
    html += `<div style="text-align:center;font-size:11px;font-weight:700;color:#3730a3;background:#eef2ff;padding:6px 2px;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0;">W${wk.week}<div style="font-size:9px;font-weight:400;color:#6366f1;">${formatDate(mon)}–${formatDate(sat)}</div></div>`;
  });
  html += `</div>`;

  // Righe operatori
  ops.forEach(nome => {
    const cnt = pwDwCount(nome, weeks, pwDwYear);
    html += `<div style="display:grid;grid-template-columns:${cols};min-width:${minW}px;">`;
    html += `<div style="position:sticky;left:0;z-index:1;background:#fff;padding:4px 8px;border-bottom:1px solid #f1f5f9;overflow:hidden;" title="${esc(nome)}">
      <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nome)}</div>
      <div style="font-size:9px;color:#6366f1;white-space:nowrap;" title="Doppie week nel mese e nell'anno">🔁 ${cnt.mese} mese · ${cnt.anno} anno</div>
    </div>`;
    weeks.forEach(wk => {
      const ferie    = pwHasFeriaWeek(wk.anno, wk.week, nome);
      const isStart  = pwIsDwStart(wk.anno, wk.week, nome);
      const prev     = pwWeekAdd(wk.anno, wk.week, -1);
      const isSecond = pwIsDwStart(prev.anno, prev.week, nome);
      const inDouble = isStart || isSecond;
      // "di fila": un blocco inizia qui e la settimana precedente era già in doppia
      const p2 = pwWeekAdd(wk.anno, wk.week, -2);
      const diFila = isStart && (pwIsDwStart(prev.anno, prev.week, nome) || pwIsDwStart(p2.anno, p2.week, nome));

      let bg = '#fff', color = '#334155', lbl = '', sub = '', cursor = 'pointer';
      let title = 'Clicca per assegnare una doppia week (questa settimana + la successiva)';
      if (ferie && inDouble) {
        bg = '#f59e0b'; color = '#fff'; lbl = '🏖🔁';
        title = 'Conflitto: assegnato in doppia week ma risulta in ferie in questa settimana';
      } else if (ferie) {
        bg = '#fca5a5'; color = '#7f1d1d'; lbl = '🏖'; cursor = 'not-allowed';
        title = 'In ferie/permesso: non assegnabile';
      } else if (isStart) {
        bg = '#6366f1'; color = '#fff'; lbl = '🔁 ➊';
        title = 'Doppia week (1ª settimana). Clicca per rimuovere il blocco.';
      } else if (isSecond) {
        bg = '#818cf8'; color = '#fff'; lbl = '➋'; sub = '<div style="font-size:8px;line-height:1;margin-top:1px;">↩ gio · rip. ven</div>';
        title = 'Doppia week (2ª settimana) — rientro giovedì, riposo compensativo venerdì. Clicca per rimuovere.';
      }
      const warn = diFila ? '<span style="position:absolute;top:1px;right:2px;font-size:10px;" title="Doppia week di fila (sconsigliato)">⚠</span>' : '';
      html += `<div onclick="pwDwToggle('${jsesc(nome)}',${wk.anno},${wk.week})" title="${esc(title)}" style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:36px;background:${bg};color:${color};font-size:11px;font-weight:600;cursor:${cursor};border-bottom:1px solid #f1f5f9;border-left:1px solid #f1f5f9;">${lbl}${sub}${warn}</div>`;
    });
    html += `</div>`;
  });

  // Footer: conteggio operatori in doppia week per settimana
  html += `<div style="display:grid;grid-template-columns:${cols};min-width:${minW}px;">`;
  html += `<div style="position:sticky;left:0;z-index:1;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;padding:6px 8px;border-top:2px solid #e2e8f0;text-transform:uppercase;">In doppia week</div>`;
  weeks.forEach(wk => {
    let cnt = 0;
    ops.forEach(nome => {
      const prev = pwWeekAdd(wk.anno, wk.week, -1);
      if (pwIsDwStart(wk.anno, wk.week, nome) || pwIsDwStart(prev.anno, prev.week, nome)) cnt++;
    });
    html += `<div style="text-align:center;font-size:12px;font-weight:700;color:${cnt>0?'#4f46e5':'#cbd5e1'};background:#f8fafc;padding:6px 2px;border-top:2px solid #e2e8f0;border-left:1px solid #f1f5f9;">${cnt}</div>`;
  });
  html += `</div>`;

  grid.innerHTML = html;
}

async function pwDwToggle(nome, anno, week) {
  const prev = pwWeekAdd(anno, week, -1);
  const isStart  = pwIsDwStart(anno, week, nome);
  const isSecond = pwIsDwStart(prev.anno, prev.week, nome);

  if (isStart) {
    pwSetDwStart(anno, week, nome, false);           // rimuove il blocco che inizia qui
  } else if (isSecond) {
    pwSetDwStart(prev.anno, prev.week, nome, false);  // rimuove il blocco di cui questa è la 2ª settimana
  } else {
    // Nuovo blocco: valida ferie su entrambe le settimane coperte
    if (pwHasFeriaWeek(anno, week, nome)) { showAlertModal(`${nome} è in ferie in questa settimana (W${week}): non assegnabile.`); return; }
    const next = pwWeekAdd(anno, week, 1);
    if (pwHasFeriaWeek(next.anno, next.week, nome)) {
      showAlertModal(`${nome} è in ferie nella settimana successiva (W${next.week}): la doppia week (che copre W${week} e W${next.week}) non è assegnabile.`);
      return;
    }
    pwSetDwStart(anno, week, nome, true);
  }

  _sbDirty.dw = true;
  try { await sset('pw_doppia_week', pwDoppiaWeek); } catch(e) { console.warn('pwDwToggle sset error', e); }
  // Push su Supabase con debounce breve (500ms), come per le ferie, per non perdere il dato al refresh
  if (typeof _sbUser !== 'undefined' && _sbUser) {
    clearTimeout(_sbPwPushTimer);
    _sbPwPushTimer = setTimeout(() => sbPush(), 500);
  }
  pwDoppiaWeekRender();
}

// Esporta la griglia Doppia Week del mese in un PDF orizzontale, colorato e
// leggibile in una sola pagina (per condivisione).
function pwDoppiaWeekExportPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showAlertModal('Libreria PDF non disponibile.'); return; }
  const { jsPDF } = window.jspdf;

  const weeks = pwMonthWeeks(pwDwYear, pwDwMonth);
  const ops = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean).sort();
  if (ops.length === 0) { showAlertModal('Nessun operatore attivo da esportare.'); return; }

  // Stato per ogni cella
  const stateGrid = ops.map(nome => weeks.map(wk => {
    const ferie    = pwHasFeriaWeek(wk.anno, wk.week, nome);
    const isStart  = pwIsDwStart(wk.anno, wk.week, nome);
    const prev     = pwWeekAdd(wk.anno, wk.week, -1);
    const isSecond = pwIsDwStart(prev.anno, prev.week, nome);
    if (ferie && (isStart || isSecond)) return 'conflict';
    if (ferie) return 'ferie';
    if (isStart) return 'start';
    if (isSecond) return 'second';
    return 'empty';
  }));

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.setTextColor(55, 48, 163);
  doc.text(`Doppia Week — ${PW_MESI_IT[pwDwMonth]} ${pwDwYear}`, 14, 13);
  doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, 14, 18);
  doc.setTextColor(0, 0, 0);

  // Font ridotto in base al numero di righe, per stare in una sola pagina
  const totalRows = ops.length + 1;
  const availH = pageH - 22 - 14; // sotto l'intestazione, sopra la legenda
  let fs = 8.5;
  const rowH = () => (fs * 0.42) + 2.4;
  while (rowH() * totalRows > availH && fs > 4) fs -= 0.5;

  const head = [['Operatore', ...weeks.map(wk => {
    const mon = isoWeekToMonday(wk.anno, wk.week);
    return `W${wk.week}\n${String(mon.getUTCDate()).padStart(2,'0')}/${String(mon.getUTCMonth()+1).padStart(2,'0')}`;
  })]];
  const LBL = { start: 'DOPPIA 1', second: 'DOPPIA 2\n(rientro gio/ven)', ferie: 'FERIE', conflict: 'DOPPIA+FERIE', empty: '' };
  const body = ops.map((nome, ri) => [nome, ...weeks.map((wk, ci) => LBL[stateGrid[ri][ci]])]);

  const opColW = 42;
  const weekColW = (pageW - 28 - opColW) / weeks.length;
  const colStyles = { 0: { cellWidth: opColW, halign: 'left', fontStyle: 'bold' } };
  for (let i = 1; i <= weeks.length; i++) colStyles[i] = { cellWidth: weekColW, halign: 'center' };

  const COLORS = {
    start:    { fill: [99, 102, 241],  text: [255, 255, 255] },
    second:   { fill: [129, 140, 248], text: [255, 255, 255] },
    ferie:    { fill: [252, 165, 165], text: [127, 29, 29] },
    conflict: { fill: [245, 158, 11],  text: [255, 255, 255] },
  };

  doc.autoTable({
    startY: 22,
    head, body,
    styles: { fontSize: fs, cellPadding: 1.1, overflow: 'linebreak', valign: 'middle', halign: 'center', lineWidth: 0.1, lineColor: [226, 232, 240] },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: fs },
    columnStyles: colStyles,
    margin: { left: 14, right: 14 },
    didParseCell: function (h) {
      if (h.section === 'body' && h.column.index >= 1) {
        const st = stateGrid[h.row.index][h.column.index - 1];
        const c = COLORS[st];
        if (c) { h.cell.styles.fillColor = c.fill; h.cell.styles.textColor = c.text; h.cell.styles.fontStyle = 'bold'; }
      }
    },
  });

  // Legenda
  let ly = doc.lastAutoTable.finalY + 6;
  if (ly > pageH - 8) ly = pageH - 8;
  doc.setFontSize(7); doc.setFont(undefined, 'normal');
  const leg = [['Doppia week (1a/2a sett.)', [99, 102, 241]], ['In ferie', [252, 165, 165]], ['Conflitto doppia+ferie', [245, 158, 11]]];
  let lx = 14;
  leg.forEach(([lbl, rgb]) => {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.rect(lx, ly - 3, 4, 4, 'F');
    doc.setTextColor(51, 65, 85); doc.text(lbl, lx + 5, ly);
    lx += doc.getTextWidth(lbl) + 14;
  });

  doc.save(`Doppia_Week_${PW_MESI_IT[pwDwMonth]}_${pwDwYear}.pdf`);
}

