/* ===================== DETTAGLIO MESE COMMESSA ===================== */
function apriDettaglioMeseCommessa(ev, commessaEnc, meseIdx) {
  ev.stopPropagation();
  const commessaNome = decodeURIComponent(commessaEnc);
  const meta = state.commesse_attive_meta[commessaNome] || {};
  const risDich = (meta.risorse_necessarie !== undefined && meta.risorse_necessarie !== null) ? meta.risorse_necessarie : null;
  if (risDich === null) return;

  const ass = state.staffing
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter(r => r.commessa === commessaNome);

  const gl = INITIAL_DATA.giorni_lavorativi[meseIdx] || 20;
  const meseName = MESI_LONG[meseIdx];

  // Operatori già impiegati questo mese
  const opImpiegati = new Set();
  ass.forEach(a => { if (Number(a.mesi[meseIdx]) > 0) opImpiegati.add(a.risorsa); });
  const nOp = opImpiegati.size;
  const diff = nOp - risDich;

  // Helper saturazione nel mese
  const satOpMese = (nomeEsteso) => {
    const ggTot = state.staffing.filter(r => r.risorsa === nomeEsteso)
      .reduce((s, r) => s + (Number(r.mesi[meseIdx]) || 0), 0);
    return gl > 0 ? ggTot / gl : 0;
  };

  // Helper: costruisce lista candidati filtrati per skill richieste
  const provinciaCommessa = meta.provincia || '';
  const regioneCommessa = meta.regione || '';
  function buildCandidati(skillRichieste) {
    const candidati = [];
    const tuttiNomiStaffing = new Set(ass.map(a => a.risorsa));
    const opNonImpiegati = [...tuttiNomiStaffing].filter(n => !opImpiegati.has(n));
    // Già su commessa ma non in questo mese
    opNonImpiegati.forEach(nome => {
      const opObj = state.operatori.find(o => o.nome_esteso === nome);
      const skills = opObj ? opObj.skills : [];
      const matchSkill = skillRichieste.length === 0 || skillRichieste.every(s => skills.includes(s));
      const skillMancanti = skillRichieste.filter(s => !skills.includes(s));
      const sat = satOpMese(nome);
      const ggDisp = Math.round(gl * Math.max(0, 1 - sat));
      const distanza = distanzaLavorazione(regioneCommessa, provinciaCommessa, opObj?.provincia);
      candidati.push({ nome, sat, ggDisp, tipo: 'già_su_commessa', skills, matchSkill, skillMancanti, distanza });
    });
    // Dal pool, non sulla commessa
    getOperatoriAttivi()
      .filter(op => !state.staffing.some(r => r.commessa === commessaNome && r.risorsa === op.nome_esteso))
      .filter(op => satOpMese(op.nome_esteso) < 0.9)
      .forEach(op => {
        const matchSkill = skillRichieste.length === 0 || skillRichieste.every(s => op.skills.includes(s));
        const skillMancanti = skillRichieste.filter(s => !op.skills.includes(s));
        const sat = satOpMese(op.nome_esteso);
        const ggDisp = Math.round(gl * Math.max(0, 1 - sat));
        const distanza = distanzaLavorazione(regioneCommessa, provinciaCommessa, op.provincia);
        if (ggDisp > 0) candidati.push({ nome: op.nome_esteso, sat, ggDisp, tipo: 'disponibile', skills: op.skills, matchSkill, skillMancanti, distanza });
      });
    // Ordina: prima i validi (match skill), poi la vicinanza geografica alla commessa,
    // infine in generale ordine alfabetico come criterio finale
    candidati.sort((a, b) => {
      if (a.matchSkill !== b.matchSkill) return a.matchSkill ? -1 : 1;
      if (a.distanza !== b.distanza) {
        if (a.distanza === null) return 1;
        if (b.distanza === null) return -1;
        if (a.distanza !== b.distanza) return a.distanza - b.distanza;
      }
      return a.nome.localeCompare(b.nome);
    });
    return candidati;
  }

  function renderCardCandidato(c) {
    const tipoTag = c.tipo === 'già_su_commessa'
      ? '<span class="text-[9px] bg-teal-100 text-teal-700 px-1 rounded">già su commessa</span>'
      : '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">da aggiungere</span>';
    const matchTag = c.matchSkill
      ? '<span class="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">✓ skill</span>'
      : `<span class="text-[9px] bg-red-100 text-red-600 px-1 rounded">manca: ${c.skillMancanti.join(', ')}</span>`;
    const geoTag = c.distanza === null ? '' : c.distanza === 0
      ? (provinciaCommessa
          ? '<span class="text-[9px] bg-sky-100 text-sky-700 px-1 rounded">📍 stessa provincia</span>'
          : '<span class="text-[9px] bg-sky-100 text-sky-700 px-1 rounded">📍 stessa regione</span>')
      : `<span class="text-[9px] bg-sky-50 text-sky-700 px-1 rounded">📍 ~${Math.round(c.distanza)} km</span>`;
    const skillsHtml = c.skills.length ? c.skills.map(s => `<span class="skill-badge">${s}</span>`).join('') : '';
    // Colore leggero del riquadro: verde chi ha la skill richiesta, ambra chi no.
    const cardCls = c.matchSkill ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200';
    return `<div class="p-2 ${cardCls} border rounded text-xs">
      <div class="flex items-center justify-between mb-0.5">
        <span class="font-medium text-slate-800">${esc(c.nome)} ${tipoTag} ${matchTag} ${geoTag}</span>
        <span class="text-slate-500">${(c.sat*100).toFixed(0)}% sat · ~${c.ggDisp} gg</span>
      </div>
      ${skillsHtml ? `<div class="text-[10px] mt-0.5">${skillsHtml}</div>` : ''}
    </div>`;
  }

  let statusHtml, suggestHtml;

  if (diff === 0) {
    statusHtml = `<div class="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded text-sm font-medium">✓ Obiettivo raggiunto: ${nOp}/${risDich} operatori in ${meseName}</div>`;
    suggestHtml = '';
  } else if (diff > 0) {
    // Surplus
    const liberabili = [...opImpiegati].map(nome => {
      const gg = (ass.find(a => a.risorsa === nome && Number(a.mesi[meseIdx]) > 0) || {}).mesi?.[meseIdx] || 0;
      return { nome, gg: Number(gg), sat: satOpMese(nome) };
    }).sort((a, b) => a.gg - b.gg);
    statusHtml = `<div class="px-3 py-1.5 bg-amber-100 text-amber-800 rounded text-sm font-medium">⚠ Surplus +${diff} in ${meseName}: ${nOp} operatori presenti, ne bastano ${risDich}</div>`;
    suggestHtml = `<div class="mt-3">
      <div class="text-xs font-semibold text-slate-700 mb-1">Operatori che potresti riallocare (minor carico):</div>
      <div class="space-y-1">
        ${liberabili.slice(0, diff + 1).map(c => `
          <div class="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded text-xs">
            <span class="font-medium text-slate-800">${esc(c.nome)}</span>
            <span class="text-slate-500">${c.gg} gg · sat ${(c.sat*100).toFixed(0)}%</span>
            <span class="text-amber-700 text-[10px]">→ valuta riallocazione</span>
          </div>`).join('')}
      </div></div>`;
  } else {
    // Deficit — usa fabbisogno dettagliato se disponibile
    const fabbDett = meta.fabbisogno_dettagliato || [];
    statusHtml = `<div class="px-3 py-1.5 bg-red-100 text-red-800 rounded text-sm font-medium">🔴 Deficit ${Math.abs(diff)} in ${meseName}: ${nOp} operatori presenti, ne servono ${risDich}</div>`;

    if (fabbDett.length > 0) {
      // Mostra candidati per ogni riga di fabbisogno dettagliato
      const sezioni = fabbDett.map(riga => {
        const skillLabel = riga.skills.length ? riga.skills.join(' + ') : 'qualsiasi skill';
        const candidati = buildCandidati(riga.skills).slice(0, 5);
        const opGiaPresenti = [...opImpiegati].filter(nome => {
          const opObj = state.operatori.find(o => o.nome_esteso === nome);
          return riga.skills.length === 0 || riga.skills.every(s => opObj?.skills?.includes(s));
        }).length;
        const deficit = Math.max(0, riga.quantita - opGiaPresenti);
        if (deficit === 0) return '';
        return `<div class="mt-2">
          <div class="flex items-center gap-2 mb-1">
            <div class="text-[10px] font-semibold text-red-700">Servono ${deficit}× <span class="bg-red-100 px-1 rounded">${skillLabel}</span> (hai ${opGiaPresenti}/${riga.quantita})</div>
          </div>
          <div class="space-y-1">
            ${candidati.length > 0
              ? candidati.map(renderCardCandidato).join('')
              : `<div class="text-[10px] text-red-600 italic px-1">⚠ Nessun operatore disponibile con skill ${skillLabel} — valuta assunzione</div>`}
          </div>
        </div>`;
      }).filter(Boolean).join('');

      suggestHtml = sezioni
        ? `<div class="mt-3"><div class="text-xs font-semibold text-slate-700 mb-1">Candidati per skill richiesta:</div>${sezioni}</div>`
        : `<div class="mt-3 text-xs text-slate-500 italic">Tutte le righe di fabbisogno sono coperte per questo mese.</div>`;
    } else {
      // Nessun fabbisogno dettagliato: lista generica
      const candidati = buildCandidati([]);
      suggestHtml = candidati.length > 0
        ? `<div class="mt-3">
            <div class="text-xs font-semibold text-slate-700 mb-1">Operatori disponibili (definisci il fabbisogno 🎯 per filtrarli per skill):</div>
            <div class="space-y-1">${candidati.slice(0, 8).map(renderCardCandidato).join('')}</div>
          </div>`
        : `<div class="mt-3 text-xs text-slate-500 italic">Nessun operatore disponibile con capacità residua in ${meseName}.</div>`;
    }
  }

  // Operatori impiegati
  const impiegatiHtml = [...opImpiegati].map(nome => {
    const gg = (ass.find(a => a.risorsa === nome && Number(a.mesi[meseIdx]) > 0) || {}).mesi?.[meseIdx] || 0;
    return `<div class="flex items-center justify-between p-1.5 bg-slate-50 border border-slate-200 rounded text-xs">
      <span class="font-medium text-slate-800">${nome}</span>
      <span class="text-slate-500">${gg} / ${gl} gg</span>
    </div>`;
  }).join('');

  // Confronto con la Griglia settimanale: chi ha lavorato davvero questo mese
  // (persone diverse o giorni diversi da quelli preventivati sopra). Stessa
  // tabella colorata usata nelle card "Attive" e nel popup della Vista mensile.
  const confrontoMese = calcolaConfrontoCommessa(commessaNome, meseIdx);
  const confrontoHtml = `<div class="mt-3">
    <div class="text-xs font-semibold text-slate-700 mb-1">🔍 Confronto Preventivo/Effettivo (${meseName}):</div>
    ${_confrontoTableHtml(confrontoMese)}
  </div>`;

  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-semibold text-slate-900">${meseName} — ${commessaNome}</h3>
            <div class="text-xs text-slate-500">Fabbisogno: <b>${risDich}</b> operatori
              ${(meta.fabbisogno_dettagliato||[]).length > 0 ? '<span class="text-[9px] bg-teal-100 text-teal-700 px-1 rounded ml-1">🎯 dettaglio skill</span>' : ''}
            </div>
          </div>
          <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        ${statusHtml}
        ${impiegatiHtml ? `<div class="mt-3"><div class="text-xs font-semibold text-slate-700 mb-1">Impiegati in ${meseName} (${nOp}):</div><div class="space-y-1">${impiegatiHtml}</div></div>` : `<div class="mt-3 text-xs text-slate-500 italic">Nessun operatore impiegato in ${meseName}.</div>`}
        ${confrontoHtml}
        ${suggestHtml}
        <div class="flex justify-end mt-4">
          <button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Chiudi</button>
        </div>
      </div>
    </div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
}

