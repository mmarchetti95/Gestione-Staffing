/* ===== MODAL SELEZIONE OPERATORE ===== */

function pwOpenOpModal(cidx, sidx, oidx) {
  cidx = parseInt(cidx); sidx = parseInt(sidx); oidx = parseInt(oidx);

  const data = pwGetWeekData();
  const bc   = data[cidx];
  if (!bc) return;

  const op           = bc.squadre[sidx]?.operatori[oidx];
  const nomeCorrente = op ? (op.nome || '') : '';
  const commessa     = bc.commessa || '';

  // Provincia di lavorazione della commessa (se impostata), per suggerire
  // in cima chi e' della stessa zona o il piu' vicino.
  const provinciaCommessa = (state.commesse_attive_meta[commessa] || {}).provincia
    || (state.pipeline.find(p => p.progetto === commessa) || {}).provincia
    || '';
  const regioneCommessa = (state.commesse_attive_meta[commessa] || {}).regione
    || (state.pipeline.find(p => p.progetto === commessa) || {}).regione
    || '';

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

  // Filtro provenienza (regione/provincia) - utile per trovare velocemente
  // chi e' vicino alla zona del rilievo quando si assegna una squadra.
  const opByNome = {};
  (state.operatori || []).forEach(o => { opByNome[o.nome_esteso || o.nome] = o; });
  let filtroRegione = '', filtroProvincia = '';

  const geoRow = document.createElement('div');
  geoRow.style.cssText = 'display:flex;gap:6px;padding:0 0 6px;';
  const selRegione = document.createElement('select');
  selRegione.className = 'op-modal-search';
  selRegione.style.cssText = 'flex:1;';
  selRegione.innerHTML = '<option value="">Tutte le regioni</option>' +
    REGIONI_ITALIA.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  const selProvincia = document.createElement('select');
  selProvincia.className = 'op-modal-search';
  selProvincia.style.cssText = 'flex:1;';
  function rebuildProvinciaOptions() {
    const province = filtroRegione ? provinceDiRegione(filtroRegione) : PROVINCE_ITALIA.slice().sort((a,b) => a.nome.localeCompare(b.nome));
    selProvincia.innerHTML = '<option value="">Tutte le province</option>' +
      province.map(p => `<option value="${p.sigla}">${esc(p.nome)} (${p.sigla})</option>`).join('');
    selProvincia.value = filtroProvincia;
  }
  rebuildProvinciaOptions();
  selRegione.onchange = () => { filtroRegione = selRegione.value; filtroProvincia = ''; rebuildProvinciaOptions(); buildList(search.value); };
  selProvincia.onchange = () => { filtroProvincia = selProvincia.value; buildList(search.value); };
  geoRow.appendChild(selRegione);
  geoRow.appendChild(selProvincia);
  modal.appendChild(geoRow);

  // Search
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'op-modal-search';
  search.placeholder = '🔍 Cerca per nome…';
  modal.appendChild(search);

  // Lista
  const list = document.createElement('div');
  list.className = 'op-modal-list';

  function passaFiltroGeo(nome) {
    if (!filtroRegione && !filtroProvincia) return true;
    const op = opByNome[nome];
    if (!op) return false;
    if (filtroProvincia) return op.provincia === filtroProvincia;
    return operatoreRegione(op) === filtroRegione;
  }

  function buildList(filter) {
    list.innerHTML = '';

    // Voce "nessuno / rimuovi"
    const noneEl = document.createElement('div');
    noneEl.className = 'op-modal-item stato-nessuno' + (!nomeCorrente ? ' is-selected' : '');
    noneEl.innerHTML = `<div class="op-modal-dot stato-nessuno"></div><span>— nessuno / rimuovi —</span>`;
    noneEl.onclick = () => pwConfirmOpModal(cidx, sidx, oidx, '');
    list.appendChild(noneEl);

    const filtrati = tuttiNomi.filter(n => (!filter || n.toLowerCase().includes(filter.toLowerCase())) && passaFiltroGeo(n));

    if (filtrati.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'op-modal-item stato-nessuno';
      empty.textContent = 'Nessun operatore trovato';
      list.appendChild(empty);
      return;
    }

    // Ordina per precedenza: prima i liberi e già assegnati alla commessa (staffing del
    // mese), poi i liberi ma non assegnati alla commessa (per vicinanza alla zona di
    // lavorazione), poi gli assegnati altrove questa settimana, poi chi e' in ferie,
    // infine chi e' non disponibile (malattia/indisponibile a trasferta: meno "recuperabile"
    // di una ferie pianificata, quindi in fondo); in generale, ordine alfabetico come
    // criterio finale.
    const distanzaDi = nome => distanzaLavorazione(regioneCommessa, provinciaCommessa, opByNome[nome]?.provincia, opByNome[nome]?.regione);
    const rangoDi = nome => {
      const stato = pwStatoOperatore(nome, cidx, sidx, oidx);
      if (stato === 'libero') return fromStaffing.has(nome) ? 0 : 1;
      if (stato === 'assegnato') return 2;
      if (stato === 'ferie') return 3;
      return 4; // non_disponibile
    };
    const ordinati = [...filtrati].sort((a, b) => {
      const dRango = rangoDi(a) - rangoDi(b);
      if (dRango !== 0) return dRango;
      const da = distanzaDi(a), db = distanzaDi(b);
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        if (da !== db) return da - db;
      }
      return a.localeCompare(b);
    });

    ordinati.forEach(nome => {
      const stato     = pwStatoOperatore(nome, cidx, sidx, oidx);
      const tagLabel  = stato === 'ferie' ? 'FERIE'
        : stato === 'non_disponibile' ? 'NON DISP.'
        : stato === 'assegnato' ? 'ASSEGNATO' : 'LIBERO';
      const inCommessa = fromStaffing.has(nome);
      const provInfo = provinciaInfo(opByNome[nome]?.provincia);
      const geoLabel = provInfo ? provInfo.nome : operatoreRegione(opByNome[nome]);

      const item = document.createElement('div');
      item.className = `op-modal-item stato-${stato}${nome === nomeCorrente ? ' is-selected' : ''}`;
      item.innerHTML = `
        <div class="op-modal-dot stato-${stato}"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${nome}${inCommessa ? '' : ' <span style="font-size:9px;opacity:.6;">(fuori commessa)</span>'}
          ${geoLabel ? ` <span style="font-size:9px;opacity:.6;">📍 ${esc(geoLabel)}</span>` : ''}
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
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-ferie"></div> In ferie</div>
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-non_disponibile"></div> Non disponibile</div>`;
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

// Cognomi (deduplicati, in ordine di assegnazione) degli operatori correntemente
// nella squadra — mostrati come riferimento a sola lettura accanto al campo
// "Nome squadra", che resta libero/editabile.
function pwSquadraCognomi(squadra) {
  const cognomi = (squadra.operatori || [])
    .map(o => o.nome)
    .filter(Boolean)
    .map(nome => {
      const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome) === nome);
      return (op && op.cognome) ? op.cognome : nome.split(' ').pop();
    });
  return [...new Set(cognomi)];
}

// Provincia (o, in mancanza, regione) di provenienza dell'operatore, per il
// badge di localizzazione nella griglia — stessa logica del filtro geo del
// modal di selezione (pwOpenOpModal).
function pwOperatoreGeoLabel(nome) {
  const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome) === nome);
  if (!op) return '';
  const provInfo = provinciaInfo(op.provincia);
  return provInfo ? provInfo.nome : operatoreRegione(op);
}

/* Costruisce HTML del trigger nella cella operatore */
function pwRenderOpDropdown(cidx, sidx, oidx, nomeCorrente) {
  const stato      = nomeCorrente ? pwStatoOperatore(nomeCorrente, cidx, sidx, oidx) : '';
  const statoClass = nomeCorrente ? `stato-${stato}` : '';
  const label      = nomeCorrente || '— scegli —';
  const exBadge    = nomeCorrente && isOperatoreLicenziato(nomeCorrente)
    ? '<span class="op-ex-tag">ex</span>'
    : '';
  const geoLabel   = nomeCorrente ? pwOperatoreGeoLabel(nomeCorrente) : '';
  return `<button class="op-trigger-btn ${statoClass}"
    onclick="pwOpenOpModal(${cidx}, ${sidx}, ${oidx})">
    <span class="op-trigger-label">${label}${exBadge}</span>
    ${geoLabel ? `<span class="op-trigger-geo">📍 ${esc(geoLabel)}</span>` : ''}
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

    // Header colonne — costruito per squadra (non per commessa) perché il badge meteo
    // dipende dai cantieri specifici della squadra in quel giorno.
    const buildColHeaderHtml = (squadra, sIdx) => `
      <div class="pw-op-row" style="grid-template-columns: 200px repeat(6, 1fr);">
        <div class="pw-op-name text-[10px] text-slate-400 uppercase font-medium">Operatore</div>
        ${days.map((d, di) => {
          const ds = d.toISOString().slice(0, 10);
          const isToday = ds === today;
          const isSab = di === 5;
          return `<div class="pw-day-header ${isSab ? 'sabato' : ''} ${isToday ? 'today' : ''}">
            ${DAY_NAMES[di]}
            <div class="pw-date">${formatDate(d)}</div>
            ${pwWeatherBadgeHtml(cIdx, sIdx, squadra, di, ds)}
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
          const cantieriArr = pwCellCantieriRaw(giorni[dKey]);
          const cantiereList = cantieriArr.length ? cantieriArr : [''];
          const attivita = (giorni[dKey] || {}).attivita || '';
          const isSab    = di === 5;
          const tipoGiorno = pwFerieTipo(opFerie[di]);
          const isInFerie = !!tipoGiorno;
          const ferieClass = tipoGiorno === 'non_disponibile' ? ' non-disponibile' : tipoGiorno === 'ferie' ? ' in-ferie' : '';
          const cantierePlaceholder = tipoGiorno === 'non_disponibile' ? '🚫 non disponibile' : tipoGiorno === 'ferie' ? '🏖 ferie' : 'cantiere…';
          const attivitaPlaceholder = isInFerie ? '' : 'attività (facolt.)';
          const cantiereRowsHtml = cantiereList.map((c, ci) => `
            <div class="pw-cantiere-row">
              <input class="pw-cantiere-input" type="text" placeholder="${cantierePlaceholder}"
                value="${c.replace(/"/g, '&quot;')}"
                data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-idx="${ci}"
                onchange="pwUpdateCantiere(this)">${pwJiraSubtaskBadgeHtml(cIdx, sIdx, oIdx, dKey, ci, bloccoCommessa, op.nome, c)}${cantiereList.length > 1 ? `<button type="button" class="pw-cantiere-remove" title="Rimuovi cantiere"
                data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-idx="${ci}"
                onclick="pwRemoveCantiereField(this)">✕</button>` : ''}
            </div>`).join('');
          return `<div class="pw-day-cell${isSab ? ' sabato' : ''}${ferieClass}" data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}"
            title="Click destro per copiare/incollare cantiere e attività"
            oncontextmenu="return pwCellCtxMenu(event, ${cIdx}, ${sIdx}, ${oIdx}, ${dKey});">
            <div class="pw-cantiere-list">
              ${cantiereRowsHtml}
              <button type="button" class="pw-cantiere-add" title="Aggiungi un altro cantiere per questo giorno"
                data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}"
                onclick="pwAddCantiereField(this)">+ cantiere</button>
            </div>
            <input class="pw-attivita-input" type="text" placeholder="${attivitaPlaceholder}"
              value="${attivita.replace(/"/g, '&quot;')}"
              data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-field="attivita"
              onchange="pwUpdateCell(this)">
          </div>`;
        }).join('');

        // Stato operatore corrente (con esclusione della sola cella corrente)
        const statoAttuale = op.nome ? pwStatoOperatore(op.nome, cIdx, sIdx, oIdx) : '';
        const badgeLabel = statoAttuale === 'ferie' ? 'FERIE'
          : statoAttuale === 'non_disponibile' ? 'NON DISPONIBILE'
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
          <div class="pw-op-name" style="flex-direction:column;align-items:flex-start;gap:2px;overflow:hidden;padding:4px 8px;"
            title="Click destro per copiare/incollare l'intera settimana (cantieri/attività)"
            oncontextmenu="return pwRowCtxMenu(event, ${cIdx}, ${sIdx}, ${oIdx});">
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

      const cognomiSquadra = pwSquadraCognomi(squadra);
      const cognomiHtml = cognomiSquadra.length
        ? `<span class="pw-sq-cognomi" title="Operatori: ${esc(cognomiSquadra.join(', '))}">: ${esc(cognomiSquadra.join(', '))}</span>`
        : '';

      return `<div class="pw-squadra-block" data-collapse-key="${cIdx}-${sIdx}">
        <div class="pw-squadra-header">
          <button class="pw-sq-collapse-toggle" onclick="pwToggleSq(${cIdx},${sIdx})">▼</button>
          <span>🟡</span>
          <input type="text" class="pw-sq-nome-input bg-transparent border-none outline-none font-semibold text-amber-900 text-xs"
            placeholder="Nome squadra…" value="${(squadra.nome || '').replace(/"/g, '&quot;')}"
            data-cidx="${cIdx}" data-sidx="${sIdx}"
            onchange="pwUpdateSquadraNome(this)">
          ${cognomiHtml}
          <div class="flex items-center gap-2 ml-2" style="margin-left:auto;">
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
        ${buildColHeaderHtml(squadra, sIdx)}
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
          <button class="text-xs bg-amber-500 hover:bg-amber-400 text-white px-2 py-1 rounded"
            data-cidx="${cIdx}" onclick="pwJiraSubtaskInit(${cIdx})" title="Crea sottotask su Jira per gli operatori pianificati questa settimana">🎫 Sottotask Jira</button>
          <button class="text-xs bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded disabled:opacity-50"
            data-cidx="${cIdx}" onclick="pwMoveCommessaUp(this)" ${cIdx === 0 ? 'disabled' : ''} title="Sposta commessa su">▲</button>
          <button class="text-xs bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded disabled:opacity-50"
            data-cidx="${cIdx}" onclick="pwMoveCommessaDown(this)" ${cIdx === data.length - 1 ? 'disabled' : ''} title="Sposta commessa giù">▼</button>
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
  // Meteo per squadra/giorno: fire-and-forget, aggiorna i badge già in pagina senza
  // un secondo pwRender() (perderebbe focus/cursore negli input appena renderizzati).
  pwRefreshMeteoWeek();
}

/* ----- Statistiche settimana ----- */
function pwRenderStats() {
  const banner = document.getElementById('pw-stats-banner');
  if (!banner) return;

  const data   = pwGetWeekData();
  const fw     = pwGetFerieWeek();
  const allOps = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean);

  // Operatori in ferie/non disponibili (almeno 1 giorno) + giorni (con tipo, per il popover)
  const DAY_ABBR = ['Lun','Mar','Mer','Gio','Ven','Sab'];
  const inFerie     = new Set();
  const ferieGiorni = {};
  Object.entries(fw).forEach(([nome, giorni]) => {
    const gg = Object.entries(giorni)
      .map(([k, v]) => ({ k, tipo: pwFerieTipo(v) }))
      .filter(g => g.tipo)
      .map(g => ({ label: DAY_ABBR[parseInt(g.k)] || g.k, tipo: g.tipo }));
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

