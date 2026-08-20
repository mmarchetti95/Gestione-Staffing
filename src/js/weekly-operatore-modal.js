/* ===== MODAL SELEZIONE OPERATORE ===== */

function pwOpenOpModal(cidx, sidx, oidx) {
  cidx = parseInt(cidx); sidx = parseInt(sidx); oidx = parseInt(oidx);

  const data = pwGetWeekData();
  const bc   = data[cidx];
  if (!bc) return;

  const op           = bc.squadre[sidx]?.operatori[oidx];
  const nomeCorrente = op ? (op.nome || '') : '';
  const commessa     = bc.commessa || '';

  // Prendi tutti gli operatori presenti in state.operatori (lista completa)
  // più quelli dello staffing per questa commessa nel mese corrente
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const mese   = monday.getUTCMonth();

  // Unione: operatori da staffing commessa + tutti gli operatori registrati
  const fromStaffing = new Set();
  state.staffing.filter(r => r.commessa === commessa && (Number(r.mesi[mese]) || 0) > 0)
    .forEach(r => fromStaffing.add(r.risorsa));

  // Tutti gli operatori attivi nel sistema (nome_esteso o nome)
  const fromOperatori = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean);

  // Lista finale: prima quelli della commessa, poi gli altri — tutti deduplicati
  const tuttiNomi = [...new Set([...fromStaffing, ...fromOperatori])].sort();

  // Costruisce il modal
  const existing = document.getElementById('op-select-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'op-modal-backdrop';
  backdrop.id = 'op-select-modal';

  const modal = document.createElement('div');
  modal.className = 'op-modal';
  modal.onclick = e => e.stopPropagation();

  // Header
  const header = document.createElement('div');
  header.className = 'op-modal-header';
  header.innerHTML = `
    <span>👷 Seleziona operatore</span>
    <button class="op-modal-close" onclick="pwCloseOpModal()">×</button>`;
  modal.appendChild(header);

  // Search
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'op-modal-search';
  search.placeholder = '🔍 Cerca per nome…';
  modal.appendChild(search);

  // Lista
  const list = document.createElement('div');
  list.className = 'op-modal-list';

  function buildList(filter) {
    list.innerHTML = '';

    // Voce "nessuno / rimuovi"
    const noneEl = document.createElement('div');
    noneEl.className = 'op-modal-item stato-nessuno' + (!nomeCorrente ? ' is-selected' : '');
    noneEl.innerHTML = `<div class="op-modal-dot stato-nessuno"></div><span>— nessuno / rimuovi —</span>`;
    noneEl.onclick = () => pwConfirmOpModal(cidx, sidx, oidx, '');
    list.appendChild(noneEl);

    const filtrati = tuttiNomi.filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase()));

    if (filtrati.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'op-modal-item stato-nessuno';
      empty.textContent = 'Nessun operatore trovato';
      list.appendChild(empty);
      return;
    }

    // Ordina: liberi → assegnati → ferie
    const ordinati = [...filtrati].sort((a, b) => {
      const ord = { libero: 0, assegnato: 1, ferie: 2 };
      return (ord[pwStatoOperatore(a, cidx, sidx, oidx)] || 0) - (ord[pwStatoOperatore(b, cidx, sidx, oidx)] || 0);
    });

    ordinati.forEach(nome => {
      const stato     = pwStatoOperatore(nome, cidx, sidx, oidx);
      const tagLabel  = stato === 'ferie' ? 'FERIE' : stato === 'assegnato' ? 'ASSEGNATO' : 'LIBERO';
      const inCommessa = fromStaffing.has(nome);

      const item = document.createElement('div');
      item.className = `op-modal-item stato-${stato}${nome === nomeCorrente ? ' is-selected' : ''}`;
      item.innerHTML = `
        <div class="op-modal-dot stato-${stato}"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${nome}${inCommessa ? '' : ' <span style="font-size:9px;opacity:.6;">(fuori commessa)</span>'}
        </span>
        <span class="op-modal-tag stato-${stato}">${tagLabel}</span>`;
      item.onclick = () => pwConfirmOpModal(cidx, sidx, oidx, nome);
      list.appendChild(item);
    });
  }

  buildList('');
  modal.appendChild(list);

  // Legenda
  const legend = document.createElement('div');
  legend.className = 'op-modal-legend';
  legend.innerHTML = `
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-libero"></div> Libero</div>
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-assegnato"></div> Assegnato altrove</div>
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-ferie"></div> In ferie</div>`;
  modal.appendChild(legend);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Chiudi cliccando fuori
  backdrop.onclick = () => pwCloseOpModal();

  // Focus ricerca + filtro live
  setTimeout(() => search.focus(), 50);
  search.addEventListener('input', () => buildList(search.value));
  search.addEventListener('keydown', e => { if (e.key === 'Escape') pwCloseOpModal(); });
}

function pwCloseOpModal() {
  const m = document.getElementById('op-select-modal');
  if (m) m.remove();
}

async function pwConfirmOpModal(cidx, sidx, oidx, nome) {
  pwCloseOpModal();
  const data = pwGetWeekData();
  const op   = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (op !== undefined) {
    op.nome = nome;
    await pwSave();
    pwRender();
  }
}

/* Costruisce HTML del trigger nella cella operatore */
function pwRenderOpDropdown(cidx, sidx, oidx, nomeCorrente) {
  const stato      = nomeCorrente ? pwStatoOperatore(nomeCorrente, cidx, sidx, oidx) : '';
  const statoClass = nomeCorrente ? `stato-${stato}` : '';
  const label      = nomeCorrente || '— scegli —';
  const exBadge    = nomeCorrente && isOperatoreLicenziato(nomeCorrente)
    ? '<span class="op-ex-tag">ex</span>'
    : '';
  return `<button class="op-trigger-btn ${statoClass}"
    onclick="pwOpenOpModal(${cidx}, ${sidx}, ${oidx})">
    <span class="op-trigger-label">${label}${exBadge}</span>
    <span class="op-trigger-arrow">▾</span>
  </button>`;
}

// Popola il <select> settimane in base all'anno corrente (pwAnno/pwWeek).
// Va richiamata da qualunque punto di ingresso alla Pianificazione Settimanale
// (non solo pwRender/Griglia): il <select> parte vuoto nell'HTML e senza questa
// chiamata resta vuoto se il primo tab mostrato non e la Griglia (es. dopo un
// refresh con Controllo Produzione come ultimo tab visitato).
function pwPopulateWeekSelect() {
  const weekSel = document.getElementById('pw-week');
  if (!weekSel) return;
  const nw = weeksInYear(pwAnno);
  weekSel.innerHTML = '';
  for (let w = 1; w <= nw; w++) {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = w < 10 ? '0' + w : w;
    if (w === pwWeek) opt.selected = true;
    weekSel.appendChild(opt);
  }
}

/* ----- Render principale ----- */
function pwRender() {
  // Conteggio strumenti per avviso doppia assegnazione (settimana corrente)
  const _stCount = pwStrumentoCounts();
  // Aggiorna selettori
  const annoSel = document.getElementById('pw-anno');
  if (annoSel) annoSel.value = String(pwAnno);
  pwPopulateWeekSelect();

  // Calcola date Lun→Sab
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }

  // Header date
  const headerEl = document.getElementById('pw-header-dates');
  if (headerEl) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    headerEl.textContent = `WEEK ${pwWeek} · ${formatDate(days[0])} — ${formatDate(days[5])} ${pwAnno}`;
  }

  const grid = document.getElementById('pw-grid');
  if (!grid) return;

  const data = pwGetWeekData();
  const today = new Date().toISOString().slice(0, 10);
  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  if (data.length === 0) {
    grid.innerHTML = `<div class="bg-white border border-slate-200 rounded-lg p-8 text-center">
      <div class="text-4xl mb-3">📅</div>
      <div class="font-semibold text-slate-700 mb-1">Nessuna commessa pianificata per questa settimana</div>
      <div class="text-sm text-slate-500 mb-4">Usa il pulsante "+ Aggiungi commessa" per iniziare</div>
    </div>`;
    // Aggiorna comunque il banner statistiche (altrimenti resta "congelato"
    // sui valori dell'ultima settimana con commesse pianificate)
    pwRenderStats();
    if (_pwActiveTab === 'ferie') pwFerieRender();
    return;
  }

  grid.innerHTML = data.map((bloccoCommessa, cIdx) => {
    const commesseValide = pwGetCommesseValide();

    // Header colonne
    const colHeaderHtml = `
      <div class="pw-op-row" style="grid-template-columns: 200px repeat(6, 1fr);">
        <div class="pw-op-name text-[10px] text-slate-400 uppercase font-medium">Operatore</div>
        ${days.map((d, di) => {
          const ds = d.toISOString().slice(0, 10);
          const isToday = ds === today;
          const isSab = di === 5;
          return `<div class="pw-day-header ${isSab ? 'sabato' : ''} ${isToday ? 'today' : ''}">
            ${DAY_NAMES[di]}
            <div class="pw-date">${formatDate(d)}</div>
          </div>`;
        }).join('')}
      </div>`;

    const squadreHtml = bloccoCommessa.squadre.map((squadra, sIdx) => {

      const operatoriHtml = squadra.operatori.map((op, oIdx) => {
        const giorni   = op.giorni || {};
        const fw       = pwGetFerieWeek();
        const opFerie  = op.nome ? (fw[op.nome] || {}) : {};

        const celleHtml = days.map((d, di) => {
          const dKey     = di;
          const cantiere = (giorni[dKey] || {}).cantiere || '';
          const attivita = (giorni[dKey] || {}).attivita || '';
          const isSab    = di === 5;
          const isInFerie = opFerie[di] === true;
          const ferieClass = isInFerie ? ' in-ferie' : '';
          const cantierePlaceholder = isInFerie ? '🏖 ferie' : 'cantiere…';
          const attivitaPlaceholder = isInFerie ? '' : 'attività (facolt.)';
          return `<div class="pw-day-cell${isSab ? ' sabato' : ''}${ferieClass}" data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}">
            <input class="pw-cantiere-input" type="text" placeholder="${cantierePlaceholder}"
              value="${cantiere.replace(/"/g, '&quot;')}"
              data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-field="cantiere"
              onchange="pwUpdateCell(this)">
            <input class="pw-attivita-input" type="text" placeholder="${attivitaPlaceholder}"
              value="${attivita.replace(/"/g, '&quot;')}"
              data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-field="attivita"
              onchange="pwUpdateCell(this)">
          </div>`;
        }).join('');

        // Stato operatore corrente (con esclusione della sola cella corrente)
        const statoAttuale = op.nome ? pwStatoOperatore(op.nome, cIdx, sIdx, oIdx) : '';
        const badgeLabel = statoAttuale === 'ferie' ? 'FERIE'
          : statoAttuale === 'assegnato' ? 'ASSEGNATO'
          : op.nome ? 'LIBERO' : '';
        const badgeHtml = op.nome
          ? `<span class="op-stato-badge ${statoAttuale}">${badgeLabel}</span>`
          : '';

        // Badge Doppia Week per la settimana corrente
        let dwBadge = '';
        if (op.nome) {
          const prevW = pwWeekAdd(pwAnno, pwWeek, -1);
          if (pwIsDwStart(pwAnno, pwWeek, op.nome)) {
            dwBadge = `<span class="op-stato-badge" style="background:#6366f1;color:#fff;" title="Doppia week - 1a settimana">🔁 DOPPIA W1</span>`;
          } else if (pwIsDwStart(prevW.anno, prevW.week, op.nome)) {
            dwBadge = `<span class="op-stato-badge" style="background:#818cf8;color:#fff;" title="Doppia week - 2a settimana (rientro gio, riposo ven)">🔁 DOPPIA W2</span>`;
          }
        }

        return `<div class="pw-op-row" style="grid-template-columns: 200px repeat(6, 1fr);">
          <div class="pw-op-name" style="flex-direction:column;align-items:flex-start;gap:2px;overflow:hidden;padding:4px 8px;">
            ${pwRenderOpDropdown(cIdx, sIdx, oIdx, op.nome)}
            ${badgeHtml ? `<div>${badgeHtml}</div>` : ''}
            ${dwBadge ? `<div>${dwBadge}</div>` : ''}
            <button class="text-[9px] text-red-400 hover:text-red-600 text-left"
              data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}"
              onclick="pwRemoveOp(this)">✕ rimuovi</button>
          </div>
          ${celleHtml}
        </div>`;
      }).join('');

      return `<div class="pw-squadra-block" data-collapse-key="${cIdx}-${sIdx}">
        <div class="pw-squadra-header">
          <button class="pw-sq-collapse-toggle" onclick="pwToggleSq(${cIdx},${sIdx})">▼</button>
          <span>🟡</span>
          <input type="text" class="flex-1 bg-transparent border-none outline-none font-semibold text-amber-900 text-xs"
            placeholder="Nome squadra…" value="${(squadra.nome || '').replace(/"/g, '&quot;')}"
            data-cidx="${cIdx}" data-sidx="${sIdx}"
            onchange="pwUpdateSquadraNome(this)">
          <div class="flex items-center gap-2 ml-2">
            <button class="text-[10px] bg-amber-200 hover:bg-amber-300 text-amber-900 px-2 py-0.5 rounded"
              data-cidx="${cIdx}" data-sidx="${sIdx}"
              onclick="pwAddOp(this)">+ Operatore</button>
            <button class="text-[10px] text-red-400 hover:text-red-600"
              data-cidx="${cIdx}" data-sidx="${sIdx}"
              onclick="pwRemoveSquadra(this)">✕ Rimuovi squadra</button>
          </div>
        </div>
        ${(() => {
          const strumenti = pwSqStrumentiJira(squadra);
          return `<div class="pw-strumenti-row no-print" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 10px;background:#fffbeb;border-top:1px solid #fde68a;">
            <span style="font-size:10px;color:#92400e;font-weight:700;white-space:nowrap;">🔧 Strumenti:</span>
            ${strumenti.map((k, idx) => {
              const dup = k && _stCount[k] > 1;
              return `<span style="display:inline-flex;align-items:center;gap:2px;">
                <button type="button" class="pw-str-trigger" data-cidx="${cIdx}" data-sidx="${sIdx}" data-idx="${idx}" onclick="pwStrOpen(this)"
                  title="${dup ? 'Attenzione: questo strumento e assegnato a piu squadre in questa settimana' : 'Clicca per cercare e scegliere lo strumento'}"
                  style="font-size:11px;text-align:left;border:1px solid ${dup ? '#dc2626' : '#d1d5db'};border-radius:4px;padding:2px 6px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${dup ? '#fef2f2' : '#fff'};cursor:pointer;">${esc(pwStrLabel(k))} ▾</button>${dup ? '<span title="Doppia assegnazione" style="color:#dc2626;font-size:12px;">⚠</span>' : ''}<button data-cidx="${cIdx}" data-sidx="${sIdx}" data-idx="${idx}" onclick="pwRemoveStrumento(this)" title="Rimuovi strumento" style="color:#b91c1c;font-size:12px;line-height:1;padding:0 2px;">✕</button>
              </span>`;
            }).join('')}
            <button data-cidx="${cIdx}" data-sidx="${sIdx}" onclick="pwAddStrumento(this)" style="font-size:10px;font-weight:600;background:#fde68a;color:#92400e;border-radius:4px;padding:2px 7px;white-space:nowrap;">+ Strumento</button>
            ${pwStrumenti.length === 0 ? '<span style="font-size:9px;color:#b45309;">(clicca "🔧 Aggiorna strumenti" in alto per caricare l\'elenco da Jira)</span>' : ''}
          </div>`;
        })()}
        ${colHeaderHtml}
        ${operatoriHtml || `<div class="text-xs text-slate-400 italic px-4 py-2">Nessun operatore — clicca "+ Operatore"</div>`}
      </div>`;
    }).join('');

    // Selettore commessa
    const commessaOptions = ['— scegli commessa —', ...commesseValide].map(n =>
      `<option value="${n === '— scegli commessa —' ? '' : n}" ${bloccoCommessa.commessa === n ? 'selected' : ''}>${n}</option>`
    ).join('');

    return `<div class="pw-commessa-block" data-cidx="${cIdx}">
      <div class="pw-commessa-header">
        <button class="pw-collapse-toggle" onclick="pwToggleComm(${cIdx})">▼</button>
        <div class="flex items-center gap-2 flex-1">
          <span class="text-teal-200 text-xs font-normal">Commessa:</span>
          <select class="bg-teal-700 text-white text-sm font-semibold border border-teal-500 rounded px-2 py-0.5"
            data-cidx="${cIdx}" onchange="pwUpdateCommessa(this)">
            ${commessaOptions}
          </select>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-xs bg-teal-500 hover:bg-teal-400 text-white px-3 py-1 rounded"
            data-cidx="${cIdx}" onclick="pwAddSquadra(this)">+ Squadra</button>
          <button class="text-xs text-teal-200 hover:text-red-300"
            data-cidx="${cIdx}" onclick="pwRemoveCommessa(this)">✕</button>
        </div>
      </div>
      ${squadreHtml || `<div class="text-xs text-slate-500 italic px-4 py-3">Nessuna squadra — clicca "+ Squadra"</div>`}
      <div class="pw-op-legenda no-print">
        <div class="pw-op-legenda-item"><span class="op-stato-badge libero">LIBERO</span> disponibile</div>
        <div class="pw-op-legenda-item"><span class="op-stato-badge assegnato">ASSEGNATO</span> già in un'altra squadra questa settimana</div>
        <div class="pw-op-legenda-item"><span class="op-stato-badge ferie">FERIE</span> in ferie/permesso questa settimana</div>
        <div class="pw-op-legenda-item"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#dcfce7;border:1px solid #86efac;vertical-align:middle;margin-right:3px;"></span>✓ verificato in Controllo Produzione</div>
      </div>
    </div>`;
  }).join('');
  // Se il tab ferie è attivo, aggiorno anche la griglia ferie
  if (_pwActiveTab === 'ferie') pwFerieRender();

  // Aggiorna banner statistiche
  pwRenderStats();

  // Re-applica ricerca operatore se attiva (il DOM è appena stato ricreato)
  if (_pwSearchTerm) pwSearchOp(_pwSearchTerm);
  // Re-applica stato collassa/espandi
  pwApplyCollapseState();
  // Colora le celle con produzione già inserita (Controllo Produzione)
  pwSyncCpDataForGrid();
}

/* ----- Statistiche settimana ----- */
function pwRenderStats() {
  const banner = document.getElementById('pw-stats-banner');
  if (!banner) return;

  const data   = pwGetWeekData();
  const fw     = pwGetFerieWeek();
  const allOps = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean);

  // Operatori in ferie (almeno 1 giorno) + giorni
  const DAY_ABBR = ['Lun','Mar','Mer','Gio','Ven','Sab'];
  const inFerie     = new Set();
  const ferieGiorni = {};
  Object.entries(fw).forEach(([nome, giorni]) => {
    const gg = Object.entries(giorni).filter(([,v]) => v === true).map(([k]) => DAY_ABBR[parseInt(k)] || k);
    if (gg.length) { inFerie.add(nome); ferieGiorni[nome] = gg; }
  });

  // Operatori pianificati + mappa commesse per operatore
  const pianificati       = new Set();
  const commessePerOp     = {};
  const commessaNomiPerOp = {};
  data.forEach((bc, ci) => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => {
      (sq.operatori || []).forEach(op => {
        if (!op.nome || !op.nome.trim()) return;
        pianificati.add(op.nome);
        if (!commessePerOp[op.nome]) commessePerOp[op.nome] = new Set();
        commessePerOp[op.nome].add(ci);
        if (!commessaNomiPerOp[op.nome]) commessaNomiPerOp[op.nome] = new Set();
        commessaNomiPerOp[op.nome].add(bc.commessa);
      });
    });
  });

  // Su più commesse diverse
  const suPiuCommesseLista = Object.entries(commessePerOp)
    .filter(([, s]) => s.size > 1)
    .map(([nome]) => ({ nome, commesse: [...commessaNomiPerOp[nome]] }));

  // Liberi = non pianificati e non in ferie
  const liberiList = allOps.filter(n => !pianificati.has(n) && !inFerie.has(n));

  // Salva dati per i popover sul banner
  banner._statsData = {
    pianificati:   [...pianificati].sort().map(nome => ({ nome, commesse: [...(commessaNomiPerOp[nome] || [])] })),
    liberi:        liberiList.sort().map(nome => ({ nome })),
    inFerie:       [...inFerie].sort().map(nome => ({ nome, giorni: ferieGiorni[nome] || [] })),
    suPiuCommesse: suPiuCommesseLista.sort((a,b) => a.nome.localeCompare(b.nome)),
  };

  const cards = [
    { icon: '👷', num: pianificati.size,        lbl: 'Pianificati questa settimana', cls: 'blu',    key: 'pianificati'   },
    { icon: '✅', num: liberiList.length,         lbl: 'Liberi / disponibili',         cls: 'verde',  key: 'liberi'        },
    { icon: '🏖', num: inFerie.size,             lbl: 'In ferie o permesso',          cls: 'rosso',  key: 'inFerie'       },
    { icon: '⚠️', num: suPiuCommesseLista.length, lbl: 'Su più commesse',              cls: 'giallo', key: 'suPiuCommesse' },
  ];

  banner.innerHTML = cards.map(c => `
    <div class="pw-stat-card ${c.cls}" data-stat-key="${c.key}" onclick="pwToggleStatPopover('${jsAttr(c.key)}', this)">
      <div class="pw-stat-icon">${c.icon}</div>
      <div>
        <div class="pw-stat-num">${c.num}</div>
        <div class="pw-stat-lbl">${c.lbl}</div>
      </div>
    </div>`).join('');
}

