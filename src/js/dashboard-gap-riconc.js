/* ===================== GAP & RACCOMANDAZIONI ===================== */
function renderGap() {
  const today = new Date();
  const gapDetailDiv = document.getElementById('gap-detail');
  const recsDiv = document.getElementById('hire-recs');

  const detailItems = [];
  // aggregato per assunzione: skill -> { count, commesse, prioritaAlta }
  const skillDemand = {};
  // aggregato per formazione: attestato -> { commesse, candidati: Set di nomi }
  const formazioneDemand = {};

  state.pipeline.forEach(c => {
    const assegnate = state.assegnazioni.filter(a => a.commessa_id === c.id).length;
    const gap = (c.risorse_necessarie||0) - assegnate;
    if (gap <= 0) return;

    const mesiC = monthsBetween(c.inizio, c.fine);
    const attReq = c.attestati_richiesti || [];

    // disponibili: skill OK + attestati OK + saturazione < 0.85
    const disponibili = getOperatoriAttivi().filter(op => {
      if (c.skills.length>0 && !c.skills.every(s => op.skills.includes(s))) return false;
      if (attReq.length>0 && !attReq.every(a => (op.attestati||[]).includes(a))) return false;
      if (state.assegnazioni.some(a => a.operatore_id === op.id && a.commessa_id === c.id)) return false;
      const sat = operatoreSatPeriodo(op, mesiC);
      return sat < 0.85;
    });

    // candidati alla formazione: skill OK + sat < 0.85 ma manca uno o più attestati
    const candidatiFormazione = [];
    if (attReq.length > 0) {
      getOperatoriAttivi().forEach(op => {
        if (c.skills.length>0 && !c.skills.every(s => op.skills.includes(s))) return;
        if (state.assegnazioni.some(a => a.operatore_id === op.id && a.commessa_id === c.id)) return;
        if (operatoreSatPeriodo(op, mesiC) >= 0.85) return;
        // se ha già tutti gli attestati è "disponibile", non "candidato alla formazione"
        const mancanti = attReq.filter(a => !(op.attestati||[]).includes(a));
        if (mancanti.length > 0 && mancanti.length < attReq.length + 1) {
          candidatiFormazione.push({ op, mancanti });
        }
      });
    }

    const giorni = c.inizio ? (new Date(c.inizio) - today) / 86400000 : 999;
    const priorita = giorni <= 60 ? 'ALTA' : 'MEDIA';

    let icon = '🔴';
    if (disponibili.length >= gap) icon = '🟡';
    else if (disponibili.length > 0 || candidatiFormazione.length > 0) icon = '🟠';

    const skillReqHtml = c.skills.map(s => `<span class="skill-badge req">${s}</span>`).join(' ') || '<i>—</i>';
    const attReqHtml = attReq.length > 0 ? `<div class="mt-1">Attestati: ${attReq.map(a => `<span class="att-badge req">${a}</span>`).join(' ')}</div>` : '';

    detailItems.push(`
      <div class="border border-slate-200 rounded p-3">
        <div class="flex items-start gap-2">
          <div class="text-lg leading-none mt-0.5">${icon}</div>
          <div class="flex-1">
            <div class="font-medium text-sm text-slate-900">${esc(c.cliente)} — ${c.progetto}</div>
            <div class="text-[11px] text-slate-500">${fmtDate(c.inizio)} → ${fmtDate(c.fine)} · gap <b>${gap}</b> risorse · skill: ${skillReqHtml}${attReqHtml}</div>
            <div class="text-[12px] mt-1 text-slate-700">
              ${disponibili.length>0
                ? `<b>Disponibili</b> (skill+attestati OK, sat &lt;85%): ${disponibili.map(o=>esc(o.nome_esteso)).join(', ')}`
                : `<span class="text-red-600">Nessun operatore interno copre completamente i requisiti.</span>`}
            </div>
            ${candidatiFormazione.length > 0 ? `
              <div class="text-[12px] mt-1 text-purple-700">
                <b>Da formare</b> (skill OK ma mancano attestati): ${candidatiFormazione.map(cf => `${esc(cf.op.nome_esteso)} <span class="text-[10px]">(manca: ${cf.mancanti.join(', ')})</span>`).join('; ')}
              </div>` : ''}
            ${disponibili.length < gap ? `<div class="text-[12px] mt-1 text-amber-700">→ <b>Manca personale: ${gap - disponibili.length}</b> risorsa/e. Priorità ${priorita}.</div>` : ''}
          </div>
        </div>
      </div>
    `);

    // aggregato assunzioni (per skill)
    if (disponibili.length < gap) {
      const mancanti = gap - disponibili.length;
      const keys = c.skills.length > 0 ? c.skills : ['GENERICA'];
      keys.forEach(sk => {
        if (!skillDemand[sk]) skillDemand[sk] = { count: 0, commesse: [], prioritaAlta: false };
        skillDemand[sk].count += mancanti;
        skillDemand[sk].commesse.push(c);
        if (priorita === 'ALTA') skillDemand[sk].prioritaAlta = true;
      });
    }

    // aggregato formazione (per attestato)
    candidatiFormazione.forEach(cf => {
      cf.mancanti.forEach(att => {
        if (!formazioneDemand[att]) formazioneDemand[att] = { commesse: new Set(), candidati: new Set(), prioritaAlta: false };
        formazioneDemand[att].commesse.add(c.progetto);
        formazioneDemand[att].candidati.add(cf.op.nome_esteso);
        if (priorita === 'ALTA') formazioneDemand[att].prioritaAlta = true;
      });
    });
  });

  gapDetailDiv.innerHTML = detailItems.join('') || '<div class="text-sm text-emerald-700">✓ Tutte le commesse pipeline hanno il fabbisogno coperto o sono coperte da risorse disponibili.</div>';

  // raccomandazioni assunzione
  const recs = Object.entries(skillDemand).map(([sk, info]) => ({
    tipo: 'assunzione',
    skill: sk,
    persone: Math.max(1, Math.ceil(info.count / 2)),
    priorita: info.prioritaAlta ? 'ALTA' : 'MEDIA',
    commesse: info.commesse,
    impatto: info.commesse.length,
  }));

  // raccomandazioni formazione
  const recsForm = Object.entries(formazioneDemand).map(([att, info]) => ({
    tipo: 'formazione',
    attestato: att,
    candidati: [...info.candidati],
    priorita: info.prioritaAlta ? 'ALTA' : 'MEDIA',
    commesse: [...info.commesse],
    impatto: info.commesse.size,
  }));

  const allRecs = [...recs, ...recsForm].sort((a,b) =>
    (b.priorita==='ALTA'?1:0) - (a.priorita==='ALTA'?1:0) || b.impatto - a.impatto
  );

  recsDiv.innerHTML = allRecs.map(r => {
    if (r.tipo === 'formazione') {
      return `
        <div class="border border-purple-300 bg-purple-50 rounded p-3">
          <div class="flex items-start gap-2">
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-purple-600 text-white">FORMAZIONE</span>
            <div class="flex-1">
              <div class="font-medium text-sm text-slate-900">Certificare <b>${r.candidati.length}</b> interno/i — attestato <span class="att-badge req">${r.attestato}</span> ${r.priorita==='ALTA'?'<span class="text-[10px] text-red-700 ml-1">[priorità ALTA]</span>':''}</div>
              <div class="text-[11px] text-slate-600 mt-1">Candidati: <i>${r.candidati.join(', ')}</i></div>
              <div class="text-[11px] text-slate-600">Commesse impattate (${r.impatto}): ${r.commesse.map(c=>`<i>${c}</i>`).join(', ')}</div>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="border ${r.priorita==='ALTA'?'border-red-300 bg-red-50':'border-amber-300 bg-amber-50'} rounded p-3">
        <div class="flex items-start gap-2">
          <span class="text-xs font-bold px-2 py-0.5 rounded ${r.priorita==='ALTA'?'bg-red-600 text-white':'bg-amber-600 text-white'}">${r.priorita} · ASSUMI</span>
          <div class="flex-1">
            <div class="font-medium text-sm text-slate-900"><b>+${r.persone}</b> persona/e con skill <span class="skill-badge req">${r.skill}</span></div>
            <div class="text-[11px] text-slate-600 mt-1">Commesse impattate (${r.impatto}): ${r.commesse.map(c => `<i>${esc(c.progetto)}</i>`).join(', ')}</div>
          </div>
        </div>
      </div>`;
  }).join('') || '<div class="text-sm text-emerald-700">Nessun gap di assunzione o formazione necessario con la copertura attuale.</div>';
}

/* ===================== RICONCILIAZIONE ===================== */
function renderRiconciliazione() {
  const tbody = document.getElementById('recon-tbody');
  tbody.innerHTML = INITIAL_DATA.riconciliazione.map(r => {
    let cls = '';
    if (r.status === 'ambiguous') cls = 'bg-yellow-50';
    else if (r.status === 'missing') cls = 'bg-red-50';
    return `<tr class="${cls} border-b border-slate-100">
      <td class="p-2 font-mono">${r.breve}</td>
      <td class="p-2">${r.esteso || '<i class="text-red-600">— nessun match —</i>'}</td>
      <td class="p-2 text-[10px] uppercase">${r.status}</td>
    </tr>`;
  }).join('');
}

