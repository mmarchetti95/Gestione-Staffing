/* ===================== VISTA MENSILE (GANTT) ===================== */
let _ganttCfg = { pipeline:true, historic:false, sort:'carico' };

function renderGantt() {
  const el = document.getElementById('gantt-container');
  if (!el) return;
  const mc = meseCorrente();

  // Raccoglie dati commesse attive
  const attMap = {};
  state.staffing.forEach(r => {
    if (!r.commessa || r.commessa === 'ORE NON LAVORATE') return;
    if (!attMap[r.commessa]) attMap[r.commessa] = {
      carico: new Array(12).fill(0),
      risorse: new Set(),
      opMese: new Array(12).fill(null).map(() => new Set())
    };
    r.mesi.forEach((v, i) => {
      const n = Number(v) || 0;
      attMap[r.commessa].carico[i] += n;
      if (n > 0) { attMap[r.commessa].risorse.add(r.risorsa); attMap[r.commessa].opMese[i].add(r.risorsa); }
    });
  });

  const rows = [];
  Object.entries(attMap).forEach(([nome, d]) => {
    const hasFut = d.carico.some((v, i) => i >= mc && v > 0);
    if (!_ganttCfg.historic && !hasFut) return;
    const meta = state.commesse_attive_meta[nome] || {};
    const risDich = (meta.risorse_necessarie != null) ? meta.risorse_necessarie : null;
    let mInizio = -1, mFine = -1;
    if (meta.inizio) { const d2 = new Date(meta.inizio); if (d2.getFullYear() === ANNO) mInizio = d2.getMonth(); }
    if (meta.fine)   { const d2 = new Date(meta.fine);   if (d2.getFullYear() === ANNO) mFine   = d2.getMonth(); }
    if (mInizio < 0) mInizio = d.carico.findIndex(v => v > 0);
    if (mFine   < 0) { for (let i = 11; i >= 0; i--) { if (d.carico[i] > 0) { mFine = i; break; } } }
    rows.push({ tipo:'attiva', nome, carico:d.carico, opMese:d.opMese,
      tot: d.carico.reduce((s,v)=>s+v,0), nRis:d.risorse.size,
      risDich, mInizio, mFine, primo: d.carico.findIndex(v=>v>0) });
  });

  if (_ganttCfg.pipeline) {
    state.pipeline.forEach(p => {
      const mm = monthsBetween(p.inizio, p.fine);
      if (!mm.length) return;
      const c = new Array(12).fill(0); mm.forEach(i => c[i] = 1);
      rows.push({ tipo:'pipeline', nome:p.progetto, cliente:p.cliente,
        carico:c, opMese:null, tot:p.risorse_necessarie||0, nRis:p.risorse_necessarie||0,
        risDich:p.risorse_necessarie||null, mInizio:mm[0], mFine:mm[mm.length-1], primo:mm[0] });
    });
  }

  if (!rows.length) {
    el.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:32px;font-size:14px">Nessuna commessa da visualizzare.</div>';
    return;
  }

  if (_ganttCfg.sort === 'alfa')   rows.sort((a,b) => a.nome.localeCompare(b.nome));
  else if (_ganttCfg.sort === 'inizio') rows.sort((a,b) => a.primo - b.primo);
  else rows.sort((a,b) => { if (a.tipo !== b.tipo) return a.tipo==='attiva'?-1:1; return b.tot - a.tot; });

  const attive   = rows.filter(r => r.tipo === 'attiva');
  const pipeline = rows.filter(r => r.tipo === 'pipeline');

  // Intestazione mesi
  let headHtml = '<th style="text-align:left;padding:8px;position:sticky;left:0;background:#f1f5f9;z-index:20;min-width:220px;font-size:12px;color:#475569;font-weight:600">Commessa</th>';
  MESI.forEach((m, i) => {
    const past = i < mc;
    headHtml += '<th style="min-width:52px;font-size:11px;font-weight:600;padding:6px 2px;text-align:center;'
      + (past ? 'color:#94a3b8;background:#f8fafc' : 'color:#475569;background:#f1f5f9') + '">'
      + m + (past ? '<div style="font-size:8px;font-weight:400;color:#cbd5e1">st.</div>' : '') + '</th>';
  });
  headHtml += '<th style="min-width:60px;font-size:11px;font-weight:600;padding:6px;text-align:center;background:#f1f5f9;color:#475569">Tot</th>';

  // Costruisce righe
  function buildRowHtml(r) {
    const isPipe = r.tipo === 'pipeline';
    const past_bg = isPipe ? '#faf5ff' : '#f8fafc';
    const base_bg = isPipe ? '#faf5ff' : '#ffffff';

    let cells = '';
    MESI.forEach((m, i) => {
      const past = i < mc;
      const inRange = (r.mInizio < 0 || i >= r.mInizio) && (r.mFine < 0 || i <= r.mFine);
      const gl  = INITIAL_DATA.giorni_lavorativi[i] || 20;
      const gg  = r.carico[i] || 0;

      if (isPipe) {
        const style = inRange
          ? 'background:repeating-linear-gradient(45deg,#c4b5fd,#c4b5fd 3px,#ede9fe 3px,#ede9fe 7px);opacity:' + (past ? '0.3' : '0.85')
          : 'background:#f8fafc';
        cells += '<td style="min-width:52px;padding:2px;' + style + '" title="' + m + (inRange ? ' · periodo attivo' : '') + '">'
          + (inRange && i === r.mInizio && r.risDich ? '<div style="font-size:9px;color:#7c3aed;font-weight:600;text-align:center">' + r.risDich + ' ris.</div>' : '')
          + '</td>';
        return;
      }

      // Commessa attiva: fuori range = grigio
      if (!inRange) {
        cells += '<td style="min-width:52px;background:#f1f5f9;padding:2px" title="' + m + ': fuori finestra commessa"></td>';
        return;
      }

      // Nel range ma senza giorni
      if (!gg) {
        const bg = past ? '#f8fafc' : (r.risDich ? '#fff7ed' : '#f8fafc');
        cells += '<td style="min-width:52px;background:' + bg + ';padding:2px" title="' + m + ': nessuna allocazione' + (r.risDich && !past ? ' ⚠' : '') + '"></td>';
        return;
      }

      // Ha giorni
      const fte = gg / gl;
      const nOp = r.opMese ? r.opMese[i].size : 0;
      let bg, txtColor;
      if (r.risDich !== null) {
        const ratio = fte / r.risDich;
        if      (ratio >= 0.98) { bg = past ? 'rgba(16,185,129,.15)'  : 'rgba(16,185,129,.30)';  txtColor = '#065f46'; }
        else if (ratio >= 0.70) { bg = past ? 'rgba(245,158,11,.15)'  : 'rgba(245,158,11,.30)';  txtColor = '#92400e'; }
        else                    { bg = past ? 'rgba(239,68,68,.12)'   : 'rgba(239,68,68,.25)';   txtColor = '#991b1b'; }
      } else {
        const intensity = Math.min(1, fte / 3);
        bg = 'rgba(99,102,241,' + (past ? 0.10 + 0.10*intensity : 0.15 + 0.35*intensity) + ')';
        txtColor = past ? '#a5b4fc' : '#3730a3';
      }
      const barW = r.risDich ? Math.min(100, Math.round(fte / r.risDich * 100)) : 0;
      const barHtml = r.risDich
        ? '<div style="height:2px;background:rgba(0,0,0,.1);margin-top:2px;border-radius:1px"><div style="height:2px;background:' + txtColor + ';width:' + barW + '%;border-radius:1px"></div></div>'
        : '';
      const encNome = encodeURIComponent(r.nome);
      cells += '<td class="gantt-cell" data-gnome="' + encNome + '" data-gm="' + i + '"'
        + ' style="min-width:52px;background:' + bg + ';padding:3px;cursor:pointer;opacity:' + (past ? '0.55' : '1') + '"'
        + ' title="' + m + ': ' + gg + ' gg · ' + fte.toFixed(1) + ' FTE · ' + nOp + ' op' + (r.risDich ? ' / target ' + r.risDich : '') + '">'
        + '<div style="text-align:center;font-size:11px;font-weight:700;color:' + txtColor + '">' + gg + '</div>'
        + '<div style="text-align:center;font-size:9px;color:' + txtColor + ';opacity:.8">' + fte.toFixed(1) + 'F</div>'
        + barHtml + '</td>';
    });

    const tagHtml = isPipe
      ? '<span style="font-size:9px;background:#ede9fe;color:#7c3aed;padding:1px 5px;border-radius:3px;white-space:nowrap">PIPELINE</span>'
      : '<span style="font-size:9px;background:#d1fae5;color:#065f46;padding:1px 5px;border-radius:3px;white-space:nowrap">ATTIVA</span>';
    const subHtml = isPipe
      ? '<div style="font-size:10px;color:#94a3b8">' + (r.cliente||'') + ' · ' + (r.risDich||'?') + ' ris. · ' + MESI[r.mInizio] + '→' + MESI[r.mFine] + '</div>'
      : '<div style="font-size:10px;color:#94a3b8">' + r.nRis + ' risorse · ' + r.tot + ' gg' + (r.risDich ? ' · target ' + r.risDich + ' FTE' : '') + '</div>';
    const totLbl = isPipe ? (r.risDich||'?') + ' ris.' : r.tot + ' gg';

    return '<tr style="border-bottom:1px solid #f1f5f9;background:' + base_bg + '">'
      + '<td style="padding:6px 8px;position:sticky;left:0;background:' + base_bg + ';z-index:5;min-width:220px;max-width:260px">'
      + '<div style="display:flex;align-items:center;gap:6px">' + tagHtml
      + '<div style="min-width:0"><div style="font-size:12px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + r.nome + '">' + r.nome + '</div>' + subHtml + '</div></div></td>'
      + cells
      + '<td style="padding:6px;text-align:center;font-size:11px;font-weight:600;color:#475569;white-space:nowrap">' + totLbl + '</td></tr>';
  }

  // Riga totale FTE
  let totRowHtml = '<tr style="background:#f8fafc;border-top:2px solid #e2e8f0"><td style="padding:6px 8px;position:sticky;left:0;background:#f8fafc;z-index:5;font-size:11px;font-weight:700;color:#475569">Totale FTE attive</td>';
  MESI.forEach((m, i) => {
    const past = i < mc;
    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
    const ggTot = attive.reduce((s, r) => s + (r.carico[i] || 0), 0);
    const fte = ggTot / gl;
    const col = fte === 0 ? '#94a3b8' : fte > state.operatori.length ? '#dc2626' : fte > state.operatori.length * 0.95 ? '#f97316' : '#059669';
    totRowHtml += '<td style="text-align:center;padding:4px 2px;font-size:11px;font-weight:700;color:' + (past?'#cbd5e1':col) + '">' + (ggTot ? fte.toFixed(1) : '—') + '</td>';
  });
  totRowHtml += '<td></td></tr>';

  const sepHtml = (pipeline.length && attive.length)
    ? '<tr><td colspan="14" style="padding:4px 8px;background:#faf5ff;font-size:10px;font-weight:600;color:#7c3aed;letter-spacing:.05em;border-top:1px solid #e9d5ff">PIPELINE IN ATTESA</td></tr>'
    : '';

  el.innerHTML = '<div style="overflow-x:auto">'
    + '<table style="width:100%;border-collapse:collapse;font-family:inherit">'
    + '<thead><tr>' + headHtml + '</tr></thead>'
    + '<tbody>'
    + attive.map(r => buildRowHtml(r)).join('')
    + totRowHtml
    + sepHtml
    + pipeline.map(r => buildRowHtml(r)).join('')
    + '</tbody></table></div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:10px;color:#64748b">'
    + '<span>🟢 FTE ≥ target</span><span>🟡 FTE 70-99% target</span><span>🔴 FTE &lt;70% target</span>'
    + '<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:16px;height:10px;background:repeating-linear-gradient(45deg,#c4b5fd,#c4b5fd 3px,#ede9fe 3px,#ede9fe 6px);border-radius:2px"></span>Pipeline</span>'
    + '<span style="background:#f1f5f9;padding:1px 6px;border-radius:3px">Grigio = fuori finestra</span>'
    + '</div>';

  // Delegated click su celle gantt (evita onclick inline)
  el.querySelectorAll('.gantt-cell').forEach(td => {
    td.addEventListener('click', ev => {
      ev.stopPropagation();
      const nome = decodeURIComponent(td.dataset.gnome);
      const mIdx = parseInt(td.dataset.gm);
      // Se commessa attiva con meta -> modal dettaglio FTE
      const meta = state.commesse_attive_meta[nome];
      if (meta && meta.risorse_necessarie != null) {
        apriDettaglioMeseCommessa(ev, td.dataset.gnome, mIdx);
      } else {
        // Semplice popup lista operatori
        const righe = state.staffing.filter(r => r.commessa === nome && Number(r.mesi[mIdx]) > 0);
        if (!righe.length) return;
        const txt = nome + ' — ' + MESI_LONG[mIdx] + '\n\n' + righe.map(r => '• ' + r.risorsa + ': ' + r.mesi[mIdx] + ' gg').join('\n');
        showAlertModal(txt);
      }
    });
  });
}

