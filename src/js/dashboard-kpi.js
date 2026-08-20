/* ===================== RENDER KPI ===================== */
function calcKPI() {
  // commesse attive = uniche dallo staffing corrente, escludendo ORE NON LAVORATE
  const commesseFromStaffing = new Set();
  state.staffing.forEach(r => { if (r.commessa && r.commessa !== 'ORE NON LAVORATE') commesseFromStaffing.add(r.commessa); });
  const nAttive = commesseFromStaffing.size;
  const nPipeline = state.pipeline.length;
  const nOperatori = getOperatoriAttivi().length;

  // saturazione media prox 3 mesi (mese corrente + 2) — solo mesi futuri
  const mese0 = meseCorrente();
  const mesi3 = [mese0, mese0+1, mese0+2].filter(m => m>=0 && m<12);
  let totSat = 0, count = 0;
  getOperatoriAttivi().forEach(op => {
    const s = operatoreSatPeriodo(op, mesi3);
    if (s > 0) { totSat += s; count++; }
  });
  const satMedia = count > 0 ? totSat/count : 0;

  // gap risorse totale
  let gapTot = 0, alertCritici = 0;
  const today = new Date();
  state.pipeline.forEach(p => {
    const assegnate = state.assegnazioni.filter(a => a.commessa_id === p.id).length;
    const gap = Math.max(0, (p.risorse_necessarie||0) - assegnate);
    gapTot += gap;
    // critico se: gap > 0 E nessun operatore interno ha tutte le skill richieste OPPURE inizio nei prossimi 60 gg
    if (gap > 0) {
      const giorni = p.inizio ? (new Date(p.inizio) - today) / 86400000 : 999;
      if (giorni <= 60) alertCritici++;
      else {
        const haInternoConSkill = getOperatoriAttivi().some(op => p.skills.every(s => op.skills.includes(s)));
        if (!haInternoConSkill && p.skills.length > 0) alertCritici++;
      }
    }
  });

  return { nAttive, nPipeline, nOperatori, satMedia, gapTot, alertCritici };
}

function renderKPI() {
  const k = calcKPI();
  const tot = k.nAttive + k.nPipeline;
  const clickable = 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all select-none';
  // Icone e colore identificativo ripresi dal modal di dettaglio di ciascun
  // KPI (showKpiModal: stesse icone, stesso headerBg) invece di inventarne
  // di nuovi solo per la tile — la striscia in cima anticipa il colore che
  // si vede aprendo il modal.
  const stripe = c => `box-shadow: inset 0 3px 0 0 ${c}, var(--shadow-sm);`;
  const html = [
    ['📋', 'Commesse attive',    k.nAttive,  'text-slate-900', 'attive', '#1e40af'],
    ['🚀', 'Commesse in partenza', k.nPipeline, 'text-teal-700', 'pipeline', 'var(--accent-dark)'],
    ['🗂',  'Totale commesse',    tot,        'text-slate-900', null, null],
    ['👷', 'Operatori',          k.nOperatori,'text-slate-900','operatori', '#4f46e5'],
    ['📊', 'Saturazione 3 mesi', (k.satMedia*100).toFixed(0)+'%',
      k.satMedia>1.0?'text-red-600':(k.satMedia>0.9?'text-orange-600':'text-emerald-700'), 'saturazione', '#d97706'],
    ['📉', 'Gap risorse', k.gapTot, k.gapTot>0?'text-red-600':'text-emerald-700', 'gap', '#dc2626'],
  ].map(([icon, label, val, cls, type, color]) => `
    <div class="bg-white rounded-lg border border-slate-200 p-4 ${type ? clickable : ''}"
         ${color ? `style="${stripe(color)}"` : ''}
         ${type ? `onclick="showKpiModal('${jsAttr(type)}')"` : ''}>
      <div class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium">
        <span class="text-sm leading-none opacity-70">${icon}</span>${label}
      </div>
      <div class="kpi-num text-3xl font-bold mt-1.5 ${cls}">${val}</div>
    </div>
  `).join('');
  document.getElementById('kpi-grid').innerHTML = html +
    `<div class="bg-white rounded-lg border ${k.alertCritici>0?'border-red-300 bg-red-50':'border-slate-200'} p-4 col-span-2 md:col-span-1 ${clickable}"
          style="${stripe('#9f1239')}"
          onclick="showKpiModal('alert')">
      <div class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${k.alertCritici>0?'text-red-600':'text-slate-500'} font-medium">
        <span class="text-sm leading-none opacity-70">🚨</span>Alert critici
      </div>
      <div class="kpi-num text-3xl font-bold mt-1.5 ${k.alertCritici>0?'text-red-600':'text-slate-900'}">${k.alertCritici}</div>
    </div>`;
}


/* ===================== KPI MODAL ===================== */
function showKpiModal(type) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const esc = v => (v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const mese0 = meseCorrente();
  const mesi3 = [mese0, mese0+1, mese0+2].filter(m => m >= 0 && m < 12);

  // Skill badges colorati
  const skillBadge = s => `<span style="background:#e0f2fe;color:#0369a1;padding:1px 7px;border-radius:9999px;font-size:10px;font-weight:600;">${esc(s)}</span>`;

  // Barra saturazione
  const satBar = (sat) => {
    const pct = Math.min(150, Math.round(sat * 100));
    const col = sat <= 0.80 ? '#10b981' : sat <= 0.95 ? '#f59e0b' : sat <= 1.05 ? '#f97316' : '#ef4444';
    return `<div style="display:flex;align-items:center;gap:8px;min-width:160px;">
      <div style="flex:1;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${Math.min(100,pct)}%;background:${col};border-radius:4px;"></div>
      </div>
      <span style="font-size:11px;font-weight:700;color:${col};min-width:38px;">${pct}%</span>
    </div>`;
  };

  let title = '', headerBg = 'var(--accent-dark)', bodyHtml = '';

  /* ── COMMESSE ATTIVE ─────────────────────────────── */
  if (type === 'attive') {
    title = '📋 Commesse attive';
    headerBg = '#1e40af';
    const seen = new Set();
    const rows = [];
    state.commesse_attive.forEach(ca => {
      const nome = ca.progetto || ca.nome || '';
      if (!nome || nome === 'ORE NON LAVORATE' || seen.has(nome)) return;
      seen.add(nome);
      const meta  = (state.commesse_attive_meta || {})[nome] || {};
      const nOp   = (ca.allocazioni || []).filter(a => (a.mesi || []).some((v,i) => v > 0 && i >= mese0)).length;
      const inizio = meta.inizio ? fmtDate(meta.inizio) : '';
      const fine   = meta.fine   ? fmtDate(meta.fine)   : '';
      rows.push({ nome, cliente: meta.cliente||'', periodo: inizio&&fine?`${inizio} → ${fine}`:(inizio||fine||'—'), nOp });
    });
    bodyHtml = `<div style="font-size:12px;color:#64748b;margin-bottom:12px;">${rows.length} commesse attive</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f1f5f9;">
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Commessa</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Cliente</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Periodo</th>
        <th style="text-align:center;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Operatori</th>
      </tr></thead><tbody>
      ${rows.map((r,i) => `<tr style="background:${i%2?'#f8fafc':'#fff'};">
        <td style="padding:7px 10px;font-weight:600;color:#1e293b;">${esc(r.nome)}</td>
        <td style="padding:7px 10px;color:#475569;">${esc(r.cliente)}</td>
        <td style="padding:7px 10px;color:#64748b;">${esc(r.periodo)}</td>
        <td style="padding:7px 10px;text-align:center;font-weight:700;color:var(--accent-dark);">${r.nOp}</td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  /* ── COMMESSE IN PARTENZA (PIPELINE) ─────────────── */
  else if (type === 'pipeline') {
    title = '🚀 Commesse in partenza';
    headerBg = 'var(--accent-dark)';
    const sorted = [...state.pipeline].sort((a,b) => new Date(a.inizio||'9999-01-01') - new Date(b.inizio||'9999-01-01'));
    bodyHtml = `<div style="font-size:12px;color:#64748b;margin-bottom:12px;">${sorted.length} commesse in pipeline</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f0fdf4;">
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Cliente / Progetto</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Inizio</th>
        <th style="text-align:center;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Risorse</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Skills</th>
      </tr></thead><tbody>
      ${sorted.map((p,i) => {
        const assegnate = state.assegnazioni.filter(a => a.commessa_id === p.id).length;
        const gap = Math.max(0, (p.risorse_necessarie||0) - assegnate);
        const gapBadge = gap > 0
          ? `<span style="background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:9999px;font-size:10px;font-weight:700;margin-left:4px;">gap ${gap}</span>` : '';
        return `<tr style="background:${i%2?'#f8fafc':'#fff'};">
          <td style="padding:7px 10px;">
            <div style="font-weight:600;color:#1e293b;">${esc(p.progetto||'')}</div>
            <div style="font-size:11px;color:#64748b;">${esc(p.cliente||'')}</div>
          </td>
          <td style="padding:7px 10px;color:#475569;white-space:nowrap;">${p.inizio ? fmtDate(p.inizio) : '—'}</td>
          <td style="padding:7px 10px;text-align:center;font-weight:700;">
            <span style="color:var(--accent-dark);">${assegnate}</span><span style="color:#94a3b8;">/${p.risorse_necessarie||0}</span>${gapBadge}
          </td>
          <td style="padding:7px 10px;">${(p.skills||[]).map(skillBadge).join(' ')}</td>
        </tr>`;
      }).join('')}
      </tbody></table>`;
  }

  /* ── OPERATORI ───────────────────────────────────── */
  else if (type === 'operatori') {
    title = '👷 Operatori';
    headerBg = '#4f46e5';
    const ops = getOperatoriAttivi().map(op => ({ op, sat: operatoreSatPeriodo(op, mesi3) }))
                               .sort((a,b) => b.sat - a.sat);
    bodyHtml = `<div style="font-size:12px;color:#64748b;margin-bottom:12px;">${ops.length} operatori · mesi ${mesi3.map(m=>MESI[m]).join(', ')}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f5f3ff;">
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Operatore</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Skills</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;">Saturazione 3 mesi</th>
      </tr></thead><tbody>
      ${ops.map(({op,sat},i) => `<tr style="background:${i%2?'#f8fafc':'#fff'};">
        <td style="padding:7px 10px;font-weight:600;color:#1e293b;">${esc(op.nome_esteso||op.nome_breve||op.nome||'')}</td>
        <td style="padding:7px 10px;">${(op.skills||[]).map(skillBadge).join(' ')}</td>
        <td style="padding:7px 10px;">${satBar(sat)}</td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  /* ── SATURAZIONE 3 MESI ─────────────────────────── */
  else if (type === 'saturazione') {
    title = '📊 Saturazione 3 mesi';
    headerBg = '#d97706';
    // Per mese
    const perMese = mesi3.map(m => {
      let tot2 = 0, cnt = 0;
      getOperatoriAttivi().forEach(op => { const s = operatoreSatPeriodo(op,[m]); if(s>0){tot2+=s;cnt++;} });
      return { mese: m, sat: cnt>0?tot2/cnt:0 };
    });
    const mesiHtml = perMese.map(({mese,sat}) => {
      const pct = Math.round(sat*100);
      const col = sat<=0.80?'#10b981':sat<=0.95?'#f59e0b':sat<=1.05?'#f97316':'#ef4444';
      return `<div style="flex:1;text-align:center;padding:14px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:6px;">${MESI_LONG[mese]}</div>
        <div style="font-size:28px;font-weight:800;color:${col};">${pct}%</div>
        <div style="height:4px;background:#e2e8f0;border-radius:2px;margin-top:8px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(100,pct)}%;background:${col};border-radius:2px;"></div>
        </div>
      </div>`;
    }).join('');
    // Per operatore
    const opsSat = getOperatoriAttivi().map(op => ({ op, sat: operatoreSatPeriodo(op,mesi3) })).sort((a,b)=>b.sat-a.sat);
    const sopra  = opsSat.filter(x => x.sat > 0.95);
    const norma  = opsSat.filter(x => x.sat <= 0.95);
    const opRow  = ({op,sat},i,bg) => `<tr style="background:${bg};">
      <td style="padding:6px 10px;font-weight:600;color:#1e293b;">${esc(op.nome_esteso||op.nome_breve||op.nome||'')}</td>
      <td style="padding:6px 10px;">${satBar(sat)}</td>
    </tr>`;
    bodyHtml = `<div style="display:flex;gap:10px;margin-bottom:20px;">${mesiHtml}</div>
    ${sopra.length>0?`<div style="font-weight:700;color:#dc2626;font-size:12px;margin-bottom:6px;">⚠ Sopra soglia &gt;95% (${sopra.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
      <tbody>${sopra.map((x,i)=>opRow(x,i,i%2?'#fff7ed':'#fff')).join('')}</tbody></table>`:``}
    <div style="font-weight:700;color:#16a34a;font-size:12px;margin-bottom:6px;">✅ Nella norma ≤95% (${norma.length})</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tbody>${norma.map((x,i)=>opRow(x,i,i%2?'#f0fdf4':'#fff')).join('')}</tbody></table>`;
  }

  /* ── GAP RISORSE ─────────────────────────────────── */
  else if (type === 'gap') {
    title = '⚠️ Gap risorse';
    headerBg = '#dc2626';
    const today2 = new Date();
    const righe = state.pipeline.map(p => {
      const assegnate = state.assegnazioni.filter(a => a.commessa_id === p.id).length;
      const gap = Math.max(0, (p.risorse_necessarie||0) - assegnate);
      return { p, assegnate, gap };
    }).sort((a,b) => b.gap - a.gap);
    // Skill aggregato
    const skillCount = {};
    righe.filter(r => r.gap > 0).forEach(({ p, gap }) => {
      (p.skills||[]).forEach(s => { skillCount[s] = (skillCount[s]||0) + gap; });
    });
    const skillSorted = Object.entries(skillCount).sort((a,b)=>b[1]-a[1]);
    const skillAggHtml = skillSorted.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px;">
          ${skillSorted.map(([s,n]) => `<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:700;">${esc(s)} <span style="opacity:.7">×${n}</span></span>`).join('')}
        </div>`
      : `<div style="color:#16a34a;font-size:13px;margin-bottom:16px;">✅ Nessun gap di skill</div>`;
    bodyHtml = `<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Fabbisogno non coperto per skill:</div>
    ${skillAggHtml}
    <div style="font-size:12px;color:#64748b;margin-bottom:8px;">Dettaglio per commessa:</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#fef2f2;">
        <th style="text-align:left;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #fecaca;">Commessa</th>
        <th style="text-align:center;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #fecaca;">Necessarie</th>
        <th style="text-align:center;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #fecaca;">Assegnate</th>
        <th style="text-align:center;padding:8px 10px;font-size:11px;color:#475569;font-weight:700;border-bottom:2px solid #fecaca;">Gap</th>
      </tr></thead><tbody>
      ${righe.map(({p,assegnate,gap},i) => `<tr style="background:${i%2?'#f8fafc':'#fff'};">
        <td style="padding:7px 10px;">
          <div style="font-weight:600;color:#1e293b;">${esc(p.progetto||'')}</div>
          <div style="font-size:11px;color:#64748b;">${esc(p.cliente||'')} · ${p.inizio?fmtDate(p.inizio):'—'}</div>
        </td>
        <td style="padding:7px 10px;text-align:center;color:#475569;">${p.risorse_necessarie||0}</td>
        <td style="padding:7px 10px;text-align:center;color:var(--accent-dark);font-weight:700;">${assegnate}</td>
        <td style="padding:7px 10px;text-align:center;font-weight:800;color:${gap>0?'#dc2626':'#16a34a'};">${gap>0?'+'+gap:'✓'}</td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  /* ── ALERT CRITICI ───────────────────────────────── */
  else if (type === 'alert') {
    title = '🚨 Alert critici';
    headerBg = '#9f1239';
    const today3 = new Date();
    const alerts = [];
    state.pipeline.forEach(p => {
      const assegnate = state.assegnazioni.filter(a => a.commessa_id === p.id).length;
      const gap = Math.max(0, (p.risorse_necessarie||0) - assegnate);
      if (gap <= 0) return;
      const giorni = p.inizio ? (new Date(p.inizio) - today3) / 86400000 : 999;
      let motivo = '';
      if (giorni <= 60) {
        motivo = `⏰ Inizio tra ${Math.max(0,Math.round(giorni))} giorni (${p.inizio ? fmtDate(p.inizio) : '—'})`;
      } else {
        const haInterno = getOperatoriAttivi().some(op => (p.skills||[]).every(s => (op.skills||[]).includes(s)));
        if (!haInterno && (p.skills||[]).length > 0) {
          motivo = '🔴 Nessun operatore interno con le skill richieste';
        }
      }
      if (motivo) alerts.push({ p, gap, motivo, giorni });
    });
    alerts.sort((a,b) => a.giorni - b.giorni);
    if (alerts.length === 0) {
      bodyHtml = `<div style="text-align:center;padding:32px;color:#16a34a;font-size:14px;">✅ Nessun alert critico</div>`;
    } else {
      bodyHtml = `<div style="font-size:12px;color:#64748b;margin-bottom:12px;">${alerts.length} alert ${alerts.length===1?'critico':'critici'}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
      ${alerts.map(({p,gap,motivo}) => `
        <div style="border:1px solid #fecaca;border-radius:8px;padding:12px 14px;background:#fff5f5;">
          <div style="font-weight:700;color:#1e293b;font-size:13px;">${esc(p.progetto||'')}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${esc(p.cliente||'')} · Inizio: ${p.inizio?fmtDate(p.inizio):'—'} · Gap: <strong style="color:#dc2626;">+${gap}</strong></div>
          <div style="font-size:12px;color:#b91c1c;font-weight:600;margin-bottom:6px;">${motivo}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">${(p.skills||[]).map(s => `<span style="background:#fee2e2;color:#dc2626;padding:1px 8px;border-radius:9999px;font-size:10px;font-weight:700;">${esc(s)}</span>`).join('')}</div>
        </div>`).join('')}
      </div>`;
    }
  }

  root.innerHTML = `<div class="modal-backdrop">
    <div style="background:#fff;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);width:100%;max-width:760px;margin:2rem auto;display:flex;flex-direction:column;max-height:85vh;">
      <div style="background:${headerBg};border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <span style="font-weight:800;color:#fff;font-size:15px;font-family:var(--font-display);">${title}</span>
        <button onclick="closeModal()" style="color:rgba(255,255,255,.8);font-size:22px;font-weight:700;line-height:1;background:none;border:none;cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.8)'">✕</button>
      </div>
      <div style="overflow-y:auto;padding:18px 20px;flex:1;">${bodyHtml}</div>
    </div>
  </div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}

/* ===================== CHART SATURAZIONE ===================== */


