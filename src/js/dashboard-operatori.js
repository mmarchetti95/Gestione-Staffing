/* ===================== POOL OPERATORI ===================== */
function renderSkillFilters() {
  const wrap = document.getElementById('skill-filters');
  wrap.innerHTML = SKILLS.map(s => `
    <button data-skill="${s}" class="skill-filter-btn text-[10px] px-2 py-0.5 rounded border ${state.filters.skills.has(s)?'bg-teal-100 border-teal-400 text-teal-800':'bg-white border-slate-300 text-slate-600'}">${s}</button>
  `).join('');
  wrap.querySelectorAll('.skill-filter-btn').forEach(b => {
    b.onclick = () => {
      const s = b.dataset.skill;
      state.filters.skills.has(s) ? state.filters.skills.delete(s) : state.filters.skills.add(s);
      renderSkillFilters(); renderOperatori();
    };
  });
}

function renderAttestatiFilters() {
  const wrap = document.getElementById('att-filters');
  if (!wrap) return;
  wrap.innerHTML = ATTESTATI.map(a => `
    <label class="flex items-center gap-1.5 py-0.5 text-[11px] hover:bg-slate-100 rounded px-1 cursor-pointer">
      <input type="checkbox" class="att-filter-cb" data-att="${a.replace(/"/g, '&quot;')}" ${state.filters.attestati.has(a)?'checked':''}>
      <span class="text-slate-700">${a}</span>
    </label>
  `).join('') || '<div class="text-[10px] text-slate-400 italic">Nessun attestato disponibile.</div>';
  wrap.querySelectorAll('.att-filter-cb').forEach(cb => {
    cb.onchange = () => {
      const a = cb.dataset.att;
      cb.checked ? state.filters.attestati.add(a) : state.filters.attestati.delete(a);
      updateAttestatiSummary();
      renderOperatori();
    };
  });
  updateAttestatiSummary();
}

/* Filtro provenienza (regione → provincia a cascata). La select regione è
   popolata una volta sola; la select provincia si ricalcola quando cambia
   la regione scelta, così mostra solo le province coerenti. */
function renderProvinciaFilterOptions() {
  const selRegione = document.getElementById('op-filter-regione');
  if (!selRegione) return;
  if (selRegione.options.length <= 1) {
    selRegione.innerHTML = '<option value="">Tutte le regioni</option>' +
      REGIONI_ITALIA.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  }
  selRegione.value = state.filters.regione || '';
  updateProvinciaFilterOptions();
}

function updateProvinciaFilterOptions() {
  const selProvincia = document.getElementById('op-filter-provincia');
  if (!selProvincia) return;
  const regione = state.filters.regione || '';
  const province = regione ? provinceDiRegione(regione) : PROVINCE_ITALIA.slice().sort((a,b) => a.nome.localeCompare(b.nome));
  selProvincia.innerHTML = '<option value="">Tutte le province</option>' +
    province.map(p => `<option value="${p.sigla}">${esc(p.nome)} (${p.sigla})</option>`).join('');
  selProvincia.value = state.filters.provincia || '';
}

function updateAttestatiSummary() {
  const sum = document.getElementById('att-filter-summary');
  if (!sum) return;
  const n = state.filters.attestati.size;
  sum.textContent = n === 0 ? 'Tutti' : `${n} selezionato/i`;
}

function checkCoerenzaOperatori() {
  const mc = meseCorrente();
  const nomiPool = new Set(state.operatori.map(o => o.nome_esteso));
  const fantasmi = new Set();
  state.staffing.forEach(r => {
    if (!r.risorsa || r.commessa === 'ORE NON LAVORATE') return;
    if (nomiPool.has(r.risorsa)) return;
    if (r.mesi.slice(mc).some(v => (Number(v)||0) > 0)) fantasmi.add(r.risorsa);
  });
  const banner = document.getElementById('op-coerenza-banner');
  if (!banner) return;
  if (fantasmi.size === 0) {
    banner.className = 'hidden';
    banner.innerHTML = '';
    return;
  }
  const nomi = [...fantasmi].sort().join(', ');
  banner.className = 'mx-3 mt-2 mb-1 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded px-3 py-2';
  banner.innerHTML = '<span class="font-semibold">&#9888; ' + fantasmi.size + ' operatore/i con impegni futuri non nel pool:</span> ' + nomi + '. <span class="text-amber-600">Aggiungili al pool o verifica i dati.</span>';
}

function renderOperatori() {
  const list = document.getElementById('op-list');
  const mese0 = meseCorrente();
  const meseProx = Math.min(11, mese0+1);

  const modoEx = state.filters.showEx;
  let ops = state.operatori.filter(op => modoEx ? (op.licenziato || isOperatoreScaduto(op)) : (!op.licenziato && !isOperatoreScaduto(op))).filter(op => {
    if (state.filters.search && !op.nome_esteso.toLowerCase().includes(state.filters.search.toLowerCase())) return false;
    if (state.filters.skills.size > 0 && ![...state.filters.skills].every(s => op.skills.includes(s))) return false;
    if (state.filters.attestati.size > 0 && ![...state.filters.attestati].every(a => (op.attestati||[]).includes(a))) return false;
    if (state.filters.provincia && op.provincia !== state.filters.provincia) return false;
    if (state.filters.regione && !state.filters.provincia) {
      const info = provinciaInfo(op.provincia);
      if (!info || info.regione !== state.filters.regione) return false;
    }
    if (state.filters.lowSat) {
      const s = operatoreSatPeriodo(op, [meseProx]);
      if (s >= 0.5) return false;
    }
    return true;
  });

  // ordina: in modo normale liberi prima/saturi dopo, in modo ex per nome
  if (modoEx) ops.sort((a,b) => (a.nome_esteso||'').localeCompare(b.nome_esteso||''));
  else ops.sort((a,b) => operatoreSatPeriodo(a, [mese0, meseProx]) - operatoreSatPeriodo(b, [mese0, meseProx]));

  const totEx = state.operatori.filter(op => op.licenziato || isOperatoreScaduto(op)).length;
  document.getElementById('op-count').textContent = modoEx ? `(${ops.length} ex colleghi)` : `(${ops.length}/${getOperatoriAttivi().length})`;
  const exCountEl = document.getElementById('ex-count');
  if (exCountEl) exCountEl.textContent = totEx > 0 ? `(${totEx})` : '';
  checkCoerenzaOperatori();
  renderProvinciaFilterOptions();

  list.innerHTML = ops.map(op => {
    const sat3 = operatoreSatPeriodo(op, [mese0, meseProx, Math.min(11,mese0+2)]);
    const isSaturo = sat3 >= 1.0;
    const provInfo = provinciaInfo(op.provincia);
    const provBadge = provInfo ? `<span class="text-[9px] bg-sky-50 text-sky-700 border border-sky-200 px-1 rounded" title="${esc(provInfo.regione)}">📍 ${esc(provInfo.nome)}</span>` : '';
    const contrattoBadge = op.contratto_tipo === 'determinato' && op.data_fine_rapporto
      ? `<span class="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1 rounded">📅 fino al ${fmtDate(op.data_fine_rapporto)}</span>` : '';
    const exReason = isOperatoreScaduto(op)
      ? `Contratto a termine scaduto il ${fmtDate(op.data_fine_rapporto)}`
      : (op.licenziato ? 'Segnato manualmente come ex collega' : '');
    const exBadge = modoEx ? `<span class="op-ex-tag" title="${esc(exReason)}">ex</span>` : '';
    const skillBadges = op.skills.map(s => `<span class="skill-badge">${s}</span>`).join('');
    const attBadges = (op.attestati||[]).map(a => `<span class="att-badge" title="${a}">${a.length>14 ? a.substring(0,13)+'…' : a}</span>`).join('');
    // mini sat bar 12 mesi
    let extraPerMese = new Array(12).fill(0);
    state.assegnazioni.filter(a => a.operatore_id === op.id).forEach(a => {
      const c = state.pipeline.find(p => p.id === a.commessa_id);
      if (!c) return;
      monthsBetween(c.inizio, c.fine).forEach(i => { extraPerMese[i] += INITIAL_DATA.giorni_lavorativi[i] || 20; });
    });
    const _mc = meseCorrente();
    const satBarHtml = MESI.map((m, i) => {
      const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
      const s = (op.alloc_mensile[i] + extraPerMese[i]) / gl;
      const cls = satColorClass(s);
      const op_style = i < _mc ? 'opacity:0.3;' : '';
      const tip = i < _mc ? `${m} (storico): ${(s*100).toFixed(0)}%` : `${m}: ${(s*100).toFixed(0)}%`;
      return `<div class="${cls}" style="${op_style}" title="${tip}"></div>`;
    }).join('');

    return `
      <div class="op-card bg-white border border-slate-200 rounded-md p-2 ${isSaturo&&!modoEx?'saturo':''} ${modoEx?'opacity-70':''}" data-op-id="${op.id}" draggable="${modoEx?'false':'true'}">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <div class="font-medium text-sm text-slate-900">${esc(op.nome_esteso)}</div>
            ${exBadge}
            ${provBadge}
            ${contrattoBadge}
            ${!modoEx && isSaturo ? '<span class="text-[9px] bg-red-100 text-red-700 px-1 rounded">SATURO</span>' : ''}
            ${op.orphan ? '<span class="text-[9px] bg-slate-100 text-slate-600 px-1 rounded" title="Non presente nel foglio OPERATORI">no skill matrix</span>' : ''}
          </div>
          <div class="flex items-center gap-1">
            <button class="view-op text-xs text-slate-400 hover:text-teal-700" data-id="${op.id}" title="Vedi impegni / commesse">📋</button>
            <button class="edit-op text-xs text-slate-400 hover:text-teal-700" data-id="${op.id}" title="Modifica">✎</button>
            ${modoEx
              ? `<button class="reattiva-op text-xs text-slate-400 hover:text-emerald-600" data-id="${op.id}" title="Riattiva (rimuovi stato ex collega)">↩</button>`
              : `<button class="del-op text-xs text-slate-400 hover:text-red-600" data-id="${op.id}" title="Elimina">🗑</button>`}
          </div>
        </div>
        ${modoEx && exReason ? `<div class="text-[10px] text-slate-500 mb-1">${esc(exReason)}</div>` : ''}
        <div class="mb-1">${skillBadges || '<span class="text-[10px] text-slate-400">nessuna skill</span>'}</div>
        ${attBadges ? `<div class="mb-1.5">${attBadges}</div>` : ''}
        <div class="sat-bar" aria-label="Saturazione mensile ${op.nome_esteso}">${satBarHtml}</div>
        <div class="text-[10px] text-slate-500 mt-0.5">Sat. 3 mesi: <span class="font-medium">${(sat3*100).toFixed(0)}%</span></div>
      </div>
    `;
  }).join('') || `<div class="text-center text-sm text-slate-400 py-4">${modoEx ? 'Nessun ex collega.' : 'Nessun operatore corrisponde ai filtri.'}</div>`;

  // drag handlers (disattivati in modalità ex colleghi: non assegnabili)
  if (!modoEx) {
    list.querySelectorAll('.op-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type:'operatore', id: card.dataset.opId }));
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
  }
  list.querySelectorAll('.view-op').forEach(b => b.onclick = () => apriVistaOperatore(b.dataset.id));
  list.querySelectorAll('.edit-op').forEach(b => b.onclick = () => openOperatoreModal(b.dataset.id));
  list.querySelectorAll('.del-op').forEach(b => b.onclick = () => openLicenziaModal(b.dataset.id));
  list.querySelectorAll('.reattiva-op').forEach(b => b.onclick = () => riattivaOperatore(b.dataset.id));
}

/* Rimuove lo stato "ex collega": azzera il flag manuale e, se il contratto
   a termine risultava scaduto, lo riporta a tempo indeterminato (altrimenti
   tornerebbe ex al prossimo render finche' non si aggiorna la data di fine). */
async function riattivaOperatore(id) {
  const op = state.operatori.find(o => o.id === id);
  if (!op) return;
  const eraScaduto = isOperatoreScaduto(op);
  const msg = eraScaduto
    ? `Riattivare ${op.nome_esteso}? Il contratto a termine (scaduto il ${fmtDate(op.data_fine_rapporto)}) verrà impostato a tempo indeterminato: modifica la scheda operatore se vuoi impostare una nuova data di fine.`
    : `Riattivare ${op.nome_esteso} e rimuoverlo dagli ex colleghi?`;
  const ok = await showConfirmAsync(msg, 'Riattiva');
  if (!ok) return;
  op.licenziato = false;
  if (eraScaduto) { op.contratto_tipo = 'indeterminato'; op.data_inizio_rapporto = ''; op.data_fine_rapporto = ''; }
  await saveState('Riattivazione operatore', {operatore: op.nome_esteso});
  renderAll();
}

/* ===================== VISTA OPERATORE ===================== */
let _vistaOpId = null;

function switchOpTab(tab) {
  const tabPool = document.getElementById('op-tab-pool');
  const tabEmail = document.getElementById('op-tab-email');
  const tabVista = document.getElementById('op-tab-vista');
  const opList = document.getElementById('op-list');
  const opEmail = document.getElementById('op-email-container');
  const opVista = document.getElementById('op-vista-container');
  const opFilters = document.getElementById('op-pool-filters');
  // Reset comune
  [tabPool, tabEmail, tabVista].forEach(t => t && t.classList.remove('active'));
  [opList, opEmail, opVista].forEach(c => c && c.classList.add('hidden'));
  if (tab === 'pool') {
    tabPool.classList.add('active');
    opList.classList.remove('hidden');
    opFilters.classList.remove('hidden');
  } else if (tab === 'email') {
    tabEmail.classList.add('active');
    opEmail.classList.remove('hidden');
    opFilters.classList.add('hidden');
    renderEmailOperatori();
  } else {
    tabVista.classList.add('active');
    opVista.classList.remove('hidden');
    opFilters.classList.add('hidden');
    renderVistaOperatore(_vistaOpId);
  }
}

/* ===================== EMAIL / OPERATORE ===================== */
/* Mappa seed esplicita: email → nome esteso come compare in state.operatori.
   Match esplicito (non euristico) per evitare ambiguita' su nomi multipli/invertiti. */
const EMAIL_SEED = {
  'Fiore Davide':                     'dfiore@eagleprojects.it',
  'Di Pierro Gianluigi':              'gdipierro@eagleprojects.it',
  'Morazzini Stefano':                'smorazzini@eagleprojects.it',
  'Perelli Quartilio':                'qperelli@eagleprojects.it',
  'Caronti Lorenzo':                  'lcaronti@eagleprojects.it',
  'Ballestra Giandomenico':           'gballestra@eagleprojects.it',
  'Dominici Laerte':                  'ldominici@eagleprojects.it',
  'Contini Fabio':                    'fcontini@eagleprojects.it',
  'Angeluzzi Fabio':                  'fangeluzzi@eagleprojects.it',
  'Arduini Giacomo':                  'garduini@eagleprojects.it',
  'Semry Hazem Said Mohamed':         'hsmsemry@eagleprojects.it',
  "Bertoglio Nicolo'":               'nbertoglio@eagleprojects.it',
  'Benosmane Aymen Mohamed Zaki':     'amzbenosmane@eagleprojects.it',
  'Fernandez Begazo Julio Cesar':     'jfernandez@eagleprojects.it',
  'Cozzari Samuele':                  'scozzari@eagleprojects.it',
  'Terrasi Nicola':                   'nterrasi@eagleprojects.it',
  'De Nicola Stefano':                'sdenicola@eagleprojects.it',
  'Ienachescu Cristian Laurentiu':    'cienachescu@eagleprojects.it',
  'Petrolati Michele':                'mpetrolati@eagleprojects.it',
  'Marchetti Michele':                'mmarchetti@eagleprojects.it',
};

/* Applica il seed una-tantum: solo agli operatori senza email valorizzata.
   Ritorna true se ha modificato lo stato (per decidere se salvare). */
function seedEmailOperatori() {
  let changed = false;
  (state.operatori || []).forEach(op => {
    const nome = op.nome_esteso || op.nome_breve || op.nome || '';
    if ((!op.email || !op.email.trim()) && EMAIL_SEED[nome]) {
      op.email = EMAIL_SEED[nome];
      changed = true;
    }
  });
  return changed;
}

function renderEmailOperatori() {
  const container = document.getElementById('op-email-container');
  if (!container) return;
  const ops = [...(state.operatori || [])].sort((a, b) =>
    (a.nome_esteso || '').localeCompare(b.nome_esteso || ''));
  if (ops.length === 0) {
    container.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">Nessun operatore.</div>';
    return;
  }
  const nMiss = ops.filter(o => !o.email || !o.email.trim()).length;
  let html = `<div class="text-[11px] text-slate-500 mb-2">Email aziendale usata per la sincronizzazione dei worklog da Jira. ${nMiss > 0 ? `<span style="color:#dc2626;font-weight:600;">${nMiss} mancanti.</span>` : '<span style="color:#16a34a;font-weight:600;">Tutte assegnate.</span>'}</div>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="text-align:left;border-bottom:1px solid #e2e8f0;">
      <th style="padding:6px 8px;color:#64748b;font-weight:600;">Operatore</th>
      <th style="padding:6px 8px;color:#64748b;font-weight:600;">Email</th>
      <th style="padding:6px 8px;color:#64748b;font-weight:600;width:90px;">Stato</th>
    </tr></thead><tbody>`;
  ops.forEach(op => {
    const nome = op.nome_esteso || op.nome_breve || op.nome || '';
    const email = op.email || '';
    const missing = !email.trim();
    const badge = missing
      ? '<span style="font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626;border-radius:3px;padding:2px 6px;">⚠ mancante</span>'
      : '<span style="font-size:10px;font-weight:700;background:#dcfce7;color:#16a34a;border-radius:3px;padding:2px 6px;">✓ ok</span>';
    const exTag = (typeof isOperatoreLicenziato === 'function' && isOperatoreLicenziato(nome))
      ? '<span class="op-ex-tag">ex</span>' : '';
    html += `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:5px 8px;font-weight:600;color:#1e293b;">${esc(nome)}${exTag}</td>
      <td style="padding:5px 8px;"><input type="email" value="${esc(email)}" placeholder="nome@eagleprojects.it"
        data-op-id="${esc(op.id)}"
        style="width:100%;border:1px solid #cbd5e1;border-radius:4px;padding:3px 6px;font-size:12px;"
        onblur="saveEmailOperatore('${String(op.id).replace(/'/g, "\\'")}', this.value)"></td>
      <td style="padding:5px 8px;" id="op-email-badge-${esc(op.id)}">${badge}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

async function saveEmailOperatore(opId, value) {
  const op = (state.operatori || []).find(o => o.id === opId);
  if (!op) return;
  const val = (value || '').trim();
  if (op.email === val) return; // nessun cambiamento
  op.email = val;
  // Aggiorna il badge senza re-render completo
  const badgeCell = document.getElementById('op-email-badge-' + opId);
  if (badgeCell) {
    badgeCell.innerHTML = val
      ? '<span style="font-size:10px;font-weight:700;background:#dcfce7;color:#16a34a;border-radius:3px;padding:2px 6px;">✓ ok</span>'
      : '<span style="font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626;border-radius:3px;padding:2px 6px;">⚠ mancante</span>';
  }
  await saveState('Email operatore', { operatore: op.nome_esteso || op.id });
}

function apriVistaOperatore(opId) {
  _vistaOpId = opId;
  const op = state.operatori.find(o => o.id === opId);
  if (!op) return;
  const tabVista = document.getElementById('op-tab-vista');
  const nomeEl = document.getElementById('op-tab-vista-nome');
  if (nomeEl) nomeEl.textContent = op.nome_esteso.split(' ')[0]; // cognome breve
  if (tabVista) tabVista.classList.remove('hidden');
  switchOpTab('vista');
}

function renderVistaOperatore(opId) {
  const container = document.getElementById('op-vista-container');
  if (!container) return;
  const op = state.operatori.find(o => o.id === opId);
  if (!op) { container.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">Operatore non trovato.</div>'; return; }

  const mc = meseCorrente();
  // --- Barra saturazione mensile espansa ---
  let extraPerMese = new Array(12).fill(0);
  state.assegnazioni.filter(a => a.operatore_id === op.id).forEach(a => {
    const c = state.pipeline.find(p => p.id === a.commessa_id);
    if (!c) return;
    monthsBetween(c.inizio, c.fine).forEach(i => { extraPerMese[i] += INITIAL_DATA.giorni_lavorativi[i] || 20; });
  });
  const satBarExpHtml = MESI.map((m, i) => {
    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
    const alloc = op.alloc_mensile[i] + extraPerMese[i];
    const s = alloc / gl;
    const pct = Math.min(100, Math.round(s * 100));
    const isPast = i < mc;
    const barCls = s <= 0.80 ? 'bg-emerald-500' : s <= 0.95 ? 'bg-amber-400' : s <= 1.05 ? 'bg-orange-500' : 'bg-red-500';
    return `<div class="flex flex-col items-center gap-0.5 flex-1" title="${m}: ${pct}% sat (${Math.round(alloc)}/${gl} gg)" style="${isPast?'opacity:0.4':''}">
      <div class="text-[8px] text-slate-500 font-medium">${pct}%</div>
      <div class="w-full bg-slate-100 rounded-sm" style="height:32px;position:relative;">
        <div class="${barCls} rounded-sm" style="position:absolute;bottom:0;width:100%;height:${pct}%;transition:height .2s;"></div>
      </div>
      <div class="text-[8px] text-slate-400">${m}</div>
    </div>`;
  }).join('');

  // --- Commesse attive dove è impiegato ---
  const commesseAttiveOp = [];
  const righeOp = state.staffing.filter(r => r.risorsa === op.nome_esteso);
  const commesseNomi = [...new Set(righeOp.map(r => r.commessa))].filter(n => n && n !== 'ORE NON LAVORATE');
  commesseNomi.forEach(nome => {
    const righe = righeOp.filter(r => r.commessa === nome);
    const totGG = righe.reduce((s,r) => s + r.mesi.reduce((a,b)=>a+(Number(b)||0),0), 0);
    const mesiAttivi = righe[0]?.mesi.map((v,i) => ({ v: Number(v)||0, i })).filter(x => x.v > 0) || [];
    commesseAttiveOp.push({ nome, righe, totGG, mesiAttivi });
  });

  const commesseAttiveHtml = commesseAttiveOp.length === 0
    ? '<div class="text-[11px] text-slate-400 italic px-1">Nessuna commessa attiva.</div>'
    : commesseAttiveOp.map(ca => {
        const meta = state.commesse_attive_meta[ca.nome] || {};
        const mesiBar = MESI.map((m, i) => {
          const gg = ca.righe.reduce((s,r) => s+(Number(r.mesi[i])||0), 0);
          const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
          const isPast = i < mc;
          return `<td class="p-0" title="${m}: ${gg} gg">
            <input type="number" min="0" max="99" step="0.5"
              class="inline-cell-input w-10 text-center text-[11px] border rounded py-0.5
                ${gg > gl ? 'border-red-400 text-red-700 font-bold' : gg > 0 ? 'border-slate-300 text-slate-800 font-medium' : 'border-slate-200 text-slate-400'}
                ${isPast ? 'opacity-50 bg-slate-50' : 'bg-white'}"
              data-risorsa="${op.nome_esteso}" data-commessa="${ca.nome.replace(/"/g,'&quot;')}" data-mese="${i}" data-gl="${gl}"
              value="${gg || ''}" placeholder="·"
              onchange="aggiornaGgOpVistaCommessa(this)">
          </td>`;
        }).join('');
        const mesiEffRow = MESI.map((m, i) => {
          const isPast = i < mc;
          const confronto = calcolaConfrontoCommessa(ca.nome, i);
          const rigaOp = confronto.righe.find(r => r.nome === op.nome_esteso);
          if (confronto.datiGrigliaAssenti) {
            return `<td class="text-center text-[10px] py-0.5 text-slate-300" title="${m}: nessun dato dalla Griglia settimanale">·</td>`;
          }
          const eff = rigaOp ? rigaOp.eff : 0;
          const stato = rigaOp ? rigaOp.stato : 'assente';
          const clsByStato = { ok: 'text-emerald-600 font-medium', scostamento: 'text-amber-600 font-semibold', assente: 'text-red-400', extra: 'text-blue-600 font-semibold' };
          return `<td class="text-center text-[10px] py-0.5 ${clsByStato[stato]||'text-slate-300'} ${isPast?'opacity-50':''}" title="${m}: ${eff} gg effettivi da Griglia settimanale (${stato})">${eff || '·'}</td>`;
        }).join('');
        return `<div class="border border-slate-200 rounded p-2 mb-2">
          <div class="flex items-center justify-between mb-1">
            <div class="font-medium text-xs text-slate-800">${esc(ca.nome)}</div>
            <div class="text-[10px] text-slate-500">${ca.totGG} gg-uomo${meta.cliente?' · '+esc(meta.cliente):''}</div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-[9px]">
              <thead><tr>
                <th class="text-left text-[8px] font-medium text-slate-400 px-0.5"></th>
                ${MESI.map((m,i)=>`<th class="text-center text-[8px] font-medium ${i<mc?'text-slate-300':'text-slate-500'} px-0.5">${m}</th>`).join('')}
              </tr></thead>
              <tbody>
                <tr><td class="text-[8px] text-slate-400 pr-1 whitespace-nowrap">Prev.</td>${mesiBar}</tr>
                <tr class="border-t border-slate-100"><td class="text-[8px] text-slate-400 pr-1 whitespace-nowrap">Eff.</td>${mesiEffRow}</tr>
              </tbody>
            </table>
          </div>
        </div>`;
      }).join('');

  // --- Commesse "solo Griglia": impiegato in Griglia settimanale ma mai
  // preventivato nello staffing (scoperte solo scansionando pwData). ---
  const effAnno = calcolaImpegniEffettiviAnnoOperatore(op.nome_esteso);
  const soloEffettivoOp = Object.entries(effAnno)
    .filter(([nome, mesi]) => !commesseNomi.includes(nome) && mesi.some(v => v > 0))
    .map(([nome, mesi]) => ({ nome, mesi, totEff: mesi.reduce((a,b)=>a+b,0) }));

  const soloEffettivoHtml = soloEffettivoOp.length === 0 ? '' : `
      <div>
        <div class="text-[9px] text-amber-700 uppercase font-medium mb-1.5">⚡ Solo in Griglia settimanale — non preventivate (${soloEffettivoOp.length})</div>
        ${soloEffettivoOp.map(ca => {
          const meta = state.commesse_attive_meta[ca.nome] || {};
          const effRow = MESI.map((m, i) => {
            const isPast = i < mc;
            const v = ca.mesi[i] || 0;
            return `<td class="text-center text-[10px] py-0.5 ${v>0?'text-blue-700 font-semibold':'text-slate-300'} ${isPast?'opacity-50':''}" title="${m}: ${v} gg effettivi da Griglia settimanale, mai preventivati">${v || '·'}</td>`;
          }).join('');
          return `<div class="border border-amber-300 bg-amber-50 rounded p-2 mb-2">
            <div class="flex items-center justify-between mb-1">
              <div class="font-medium text-xs text-slate-800">${esc(ca.nome)} <span class="text-[9px] bg-amber-100 text-amber-800 px-1 rounded ml-1">⚠ mai preventivata</span></div>
              <div class="text-[10px] text-slate-500">${ca.totEff} gg effettivi${meta.cliente?' · '+esc(meta.cliente):''}</div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-[9px]">
                <thead><tr>
                  <th class="text-left text-[8px] font-medium text-slate-400 px-0.5"></th>
                  ${MESI.map((m,i)=>`<th class="text-center text-[8px] font-medium ${i<mc?'text-slate-300':'text-slate-500'} px-0.5">${m}</th>`).join('')}
                </tr></thead>
                <tbody><tr><td class="text-[8px] text-slate-400 pr-1 whitespace-nowrap">Eff.</td>${effRow}</tr></tbody>
              </table>
            </div>
          </div>`;
        }).join('')}
      </div>`;

  // --- Pipeline assegnazioni ---
  const pipelineOp = state.assegnazioni
    .filter(a => a.operatore_id === op.id)
    .map(a => state.pipeline.find(p => p.id === a.commessa_id))
    .filter(Boolean);

  const pipelineHtml = pipelineOp.length === 0
    ? '<div class="text-[11px] text-slate-400 italic px-1">Nessuna commessa pipeline assegnata.</div>'
    : pipelineOp.map(c => {
        const mesiC = monthsBetween(c.inizio, c.fine);
        return `<div class="border border-teal-100 bg-teal-50 rounded p-2 mb-1.5">
          <div class="flex items-center justify-between">
            <div class="font-medium text-xs text-slate-800">${esc(c.progetto)}</div>
            <div class="text-[10px] text-slate-500">${esc(c.cliente)} · ${fmtDate(c.inizio)}→${fmtDate(c.fine)}</div>
          </div>
          <div class="flex flex-wrap gap-0.5 mt-1">
            ${mesiC.map(i => `<span class="text-[9px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">${MESI[i]}</span>`).join('')}
            ${c.skills.map(s=>`<span class="skill-badge req text-[9px]">${s}</span>`).join('')}
          </div>
        </div>`;
      }).join('');

  const sat3 = operatoreSatPeriodo(op, [mc, Math.min(11,mc+1), Math.min(11,mc+2)]);

  container.innerHTML = `
    <div class="space-y-3">
      <!-- Header operatore -->
      <div class="flex items-start justify-between">
        <div>
          <div class="font-semibold text-slate-900 text-sm">${esc(op.nome_esteso)}${isOperatoreScaduto(op) ? '<span class="op-ex-tag">ex</span>' : ''}</div>
          <div class="mt-0.5">${op.skills.map(s=>`<span class="skill-badge">${s}</span>`).join('') || '<span class="text-[10px] text-slate-400">nessuna skill</span>'}</div>
          <div class="text-[10px] text-slate-500 mt-0.5">Sat. 3 mesi: <b>${(sat3*100).toFixed(0)}%</b></div>
          <div class="text-[10px] text-slate-500 mt-0.5">${op.contratto_tipo === 'determinato'
            ? `Contratto a termine: ${fmtDate(op.data_inizio_rapporto)} &rarr; <b class="${isOperatoreScaduto(op)?'text-red-600':''}">${fmtDate(op.data_fine_rapporto)}</b>`
            : 'Contratto a tempo indeterminato'}</div>
        </div>
        <div class="flex gap-1">
          <button onclick="openOperatoreModal('${jsAttr(op.id)}')" class="text-xs px-2 py-1 bg-white text-slate-600 border border-slate-300 rounded hover:bg-slate-50">✎ Modifica</button>
          <button onclick="switchOpTab('pool')" class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200">← Pool</button>
        </div>
      </div>
      <!-- Barra saturazione espansa -->
      <div>
        <div class="text-[9px] text-slate-500 uppercase font-medium mb-1">Saturazione mensile</div>
        <div class="flex gap-0.5 items-end" style="height:60px;">${satBarExpHtml}</div>
      </div>
      <!-- Commesse attive -->
      <div>
        <div class="text-[9px] text-slate-500 uppercase font-medium mb-1.5">Commesse attive (${commesseAttiveOp.length})</div>
        ${commesseAttiveHtml}
      </div>
      ${soloEffettivoHtml}
      <!-- Pipeline -->
      <div>
        <div class="text-[9px] text-slate-500 uppercase font-medium mb-1.5">Pipeline assegnata (${pipelineOp.length})</div>
        ${pipelineHtml}
      </div>
    </div>
  `;

  // Bind input changes
  container.querySelectorAll('input[type=number][data-commessa]').forEach(inp => {
    inp.addEventListener('change', () => aggiornaGgOpVistaCommessa(inp));
  });
}

async function aggiornaGgOpVistaCommessa(inp) {
  const risorsa = inp.dataset.risorsa;
  const commessa = inp.dataset.commessa;
  const meseIdx = parseInt(inp.dataset.mese);
  const gl = parseInt(inp.dataset.gl) || 20;
  const val = parseFloat(inp.value) || 0;
  // trova la riga staffing
  const riga = state.staffing.find(r => r.risorsa === risorsa && r.commessa === commessa);
  if (!riga) return;
  riga.mesi[meseIdx] = val;
  // aggiorna tot
  ricalcolaAllocOperatori();
  await saveState();
  // re-render solo la vista operatore senza reload completo
  renderVistaOperatore(_vistaOpId);
  renderKPI();
  renderAlerts();
}

