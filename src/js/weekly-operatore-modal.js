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

  // Unione: operatori da staffing commessa + tutti gli operatori registrati.
  // Lo staffing puo' tenere giorni allocati anche dopo la fine del rapporto (contratto
  // a termine scaduto non ancora segnato come ex collega): senza il filtro l'ex collega
  // verrebbe riproposto, e per giunta in cima come "della commessa".
  const fromStaffing = new Set();
  state.staffing.filter(r => r.commessa === commessa && (Number(r.mesi[mese]) || 0) > 0)
    .forEach(r => { if (r.risorsa && !isOperatoreLicenziato(r.risorsa)) fromStaffing.add(r.risorsa); });

  // Tutti gli operatori attivi nel sistema (nome_esteso o nome)
  const fromOperatori = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean);

  // Dipendenti dei fornitori esterni (state.fornitori, vedi dashboard-fornitori.js):
  // risorse occasionali, fuori dal pool interno, ma selezionabili qui — con un
  // gruppo/badge dedicato — perché di volta in volta un fornitore ce li mette a
  // disposizione per una commessa. Un nome già presente nel pool interno vince
  // (fornOfNome non viene impostato per quel nome): l'identità resta quella interna.
  const fornOfNome = {};
  const fromFornitori = [];
  (state.fornitori || []).forEach(f => {
    (f.dipendenti || []).forEach(d => {
      const nome = d.nome_esteso;
      if (!nome || opByNomeHasInterno(nome)) return;
      fromFornitori.push(nome);
      if (!fornOfNome[nome]) fornOfNome[nome] = f.nome || 'Fornitore';
    });
  });
  function opByNomeHasInterno(nome) {
    return (state.operatori || []).some(o => (o.nome_esteso || o.nome) === nome);
  }

  // Lista finale: prima quelli della commessa, poi gli altri, poi i dipendenti
  // fornitore — tutti deduplicati
  const tuttiNomi = [...new Set([...fromStaffing, ...fromOperatori, ...fromFornitori])].sort();

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
  // Dipendenti fornitore: solo per i nomi non già presenti nel pool interno (vedi
  // fromFornitori sopra), così filtro geo/badge funzionano anche per loro.
  (state.fornitori || []).forEach(f => (f.dipendenti || []).forEach(d => {
    if (d.nome_esteso && !opByNome[d.nome_esteso]) opByNome[d.nome_esteso] = d;
  }));
  let filtroRegione = '', filtroProvincia = '';

  const geoRow = document.createElement('div');
  geoRow.className = 'op-modal-filtri';
  const selRegione = document.createElement('select');
  selRegione.className = 'op-modal-select';
  selRegione.title = 'Regione di provenienza';
  selRegione.innerHTML = '<option value="">Tutte le regioni</option>' +
    REGIONI_ITALIA.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  const selProvincia = document.createElement('select');
  selProvincia.className = 'op-modal-select';
  selProvincia.title = 'Provincia di provenienza';
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

  // Filtro seniority ('' = tutte, 'nd' = seniority non definita)
  let filtroSeniorita = '';
  const selSeniorita = document.createElement('select');
  selSeniorita.className = 'op-modal-select';
  selSeniorita.title = 'Seniority';
  selSeniorita.innerHTML = '<option value="">Tutte le seniority</option>' +
    Object.keys(SENIORITA).map(k => '<option value="' + k + '">' + SENIORITA[k] + '</option>').join('') +
    '<option value="nd">Non definita</option>';
  selSeniorita.onchange = () => { filtroSeniorita = selSeniorita.value; buildList(search.value); };
  geoRow.appendChild(selSeniorita);

  // Doppia week della settimana aperta: W1 = il blocco inizia questa settimana, W2 = è
  // iniziato la precedente (rientro gio). Flag puro come il badge in Griglia; un W1 non
  // ancora impiegato in Griglia ha dato solo la disponibilità, quindi è "da collocare".
  const prevW = pwWeekAdd(pwAnno, pwWeek, -1);
  const dwFaseDi = nome => pwIsDwStart(pwAnno, pwWeek, nome) ? 'W1'
    : pwIsDwStart(prevW.anno, prevW.week, nome) ? 'W2' : '';
  const nDw = tuttiNomi.filter(n => dwFaseDi(n)).length;
  let filtroDw = false;
  const btnDw = document.createElement('button');
  btnDw.type = 'button';
  btnDw.className = 'op-modal-skill-btn';
  btnDw.style.cssText = 'flex:0 0 auto;font-size:13px;padding:6px 12px;';
  btnDw.textContent = '🔁 Doppia week (' + nDw + ')';
  btnDw.title = nDw ? 'Mostra solo chi è in doppia week questa settimana' : 'Nessuno in doppia week questa settimana';
  btnDw.disabled = !nDw;
  if (!nDw) btnDw.style.opacity = '.5';
  btnDw.onclick = () => {
    filtroDw = !filtroDw;
    btnDw.style.background = filtroDw ? '#e0e7ff' : '#fff';
    btnDw.style.borderColor = filtroDw ? '#6366f1' : '#cbd5e1';
    btnDw.style.color = filtroDw ? '#4338ca' : '#475569';
    btnDw.style.fontWeight = filtroDw ? '700' : '400';
    buildList(search.value);
  };
  geoRow.appendChild(btnDw);
  modal.appendChild(geoRow);

  // Seniority: se nella squadra non c'è ancora un senior (primo operatore, o finora solo
  // junior / seniority non definita) i senior vanno in cima, a parità di disponibilità,
  // così che nessun junior resti senza un senior accanto. Con un senior già presente la
  // seconda scelta è indifferente (junior o senior) e l'ordine resta quello normale.
  const altriSquadra = ((bc.squadre[sidx] || {}).operatori || [])
    .filter((o, i) => i !== oidx && o.nome && !o.fornitore).map(o => o.nome);
  const serveSenior = !altriSquadra.some(n => opSeniorita(n) === 'senior');
  const senioritaHint = document.createElement('div');
  senioritaHint.style.cssText = 'padding:0 16px 8px;font-size:12.5px;color:#4338ca;';
  senioritaHint.textContent = !serveSenior ? ''
    : altriSquadra.length ? "🎖 In cima i senior: in squadra non c'è ancora un senior (" + altriSquadra.join(', ') + ')'
    : '🎖 In cima i senior: è il primo operatore della squadra';
  if (senioritaHint.textContent) modal.appendChild(senioritaHint);

  // Filtro skill (chip multi-selezione, AND come nel filtro Pool operatori) e
  // filtro attestati (checkbox in un pannello a comparsa, stessa logica AND) —
  // utili per trovare in griglia chi ha davvero la competenza/il certificato
  // richiesto dalla commessa, non solo chi è libero e vicino.
  const filtroSkills = new Set();
  const filtroAttestati = new Set();

  const skillRow = document.createElement('div');
  skillRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:0 16px 8px;';
  skillRow.innerHTML = SKILLS.map(s => '<button type="button" class="op-modal-skill-btn" data-skill="' + esc(s) + '">' + esc(s) + '</button>').join('');
  modal.appendChild(skillRow);
  function paintSkillBtn(btn, on) {
    btn.style.background = on ? '#ccfbf1' : '#fff';
    btn.style.borderColor = on ? '#14b8a6' : '#cbd5e1';
    btn.style.color = on ? '#0f766e' : '#475569';
    btn.style.fontWeight = on ? '700' : '400';
  }
  skillRow.querySelectorAll('.op-modal-skill-btn').forEach(btn => {
    btn.onclick = () => {
      const s = btn.dataset.skill;
      if (filtroSkills.has(s)) filtroSkills.delete(s); else filtroSkills.add(s);
      paintSkillBtn(btn, filtroSkills.has(s));
      buildList(search.value);
    };
  });

  if (ATTESTATI.length > 0) {
    const attWrap = document.createElement('details');
    attWrap.style.cssText = 'padding:0 16px 10px;font-size:12.5px;';
    attWrap.innerHTML = `<summary style="cursor:pointer;color:#64748b;user-select:none;">🎓 Filtra per attestato <span class="op-modal-att-summary">(tutti)</span></summary>
      <div style="max-height:140px;overflow-y:auto;margin-top:6px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 12px;padding:2px 2px 2px 4px;">
        ${ATTESTATI.map(a => `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:#334155;">
          <input type="checkbox" class="op-modal-att-cb" data-att="${esc(a)}"> ${esc(a)}</label>`).join('')}
      </div>`;
    modal.appendChild(attWrap);
    const attSummary = attWrap.querySelector('.op-modal-att-summary');
    attWrap.querySelectorAll('.op-modal-att-cb').forEach(cb => {
      cb.onchange = () => {
        cb.checked ? filtroAttestati.add(cb.dataset.att) : filtroAttestati.delete(cb.dataset.att);
        attSummary.textContent = filtroAttestati.size ? `(${filtroAttestati.size})` : '(tutti)';
        buildList(search.value);
      };
    });
  }

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

  function passaFiltroSkillAttestati(nome) {
    if (filtroSkills.size === 0 && filtroAttestati.size === 0) return true;
    const op = opByNome[nome];
    if (!op) return false;
    if (filtroSkills.size > 0 && ![...filtroSkills].every(s => (op.skills||[]).includes(s))) return false;
    if (filtroAttestati.size > 0 && ![...filtroAttestati].every(a => (op.attestati||[]).includes(a))) return false;
    return true;
  }

  function passaFiltroSeniorita(nome) {
    if (!filtroSeniorita) return true;
    const sen = opSeniorita(nome);
    return filtroSeniorita === 'nd' ? !sen : sen === filtroSeniorita;
  }

  function buildList(filter) {
    list.innerHTML = '';

    // Voce "nessuno / rimuovi"
    const noneEl = document.createElement('div');
    noneEl.className = 'op-modal-item stato-nessuno' + (!nomeCorrente ? ' is-selected' : '');
    noneEl.innerHTML = `<div class="op-modal-dot stato-nessuno"></div><span>— nessuno / rimuovi —</span>`;
    noneEl.onclick = () => pwConfirmOpModal(cidx, sidx, oidx, '');
    list.appendChild(noneEl);

    const filtrati = tuttiNomi.filter(n => (!filter || n.toLowerCase().includes(filter.toLowerCase())) && passaFiltroGeo(n) && passaFiltroSkillAttestati(n) && passaFiltroSeniorita(n) && (!filtroDw || dwFaseDi(n)));

    if (filtrati.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'op-modal-item stato-nessuno';
      empty.textContent = 'Nessun operatore trovato';
      list.appendChild(empty);
      return;
    }

    // Ordina per precedenza: prima i liberi, poi gli assegnati altrove questa settimana,
    // poi chi e' in ferie, infine chi e' non disponibile (malattia/indisponibile a
    // trasferta: meno "recuperabile" di una ferie pianificata, quindi in fondo). A parità
    // di stato: i senior se la squadra non ne ha ancora uno (serveSenior), poi chi è già
    // assegnato alla commessa (staffing del mese), poi la vicinanza alla zona di
    // lavorazione; in generale, ordine alfabetico come criterio finale.
    const distanzaDi = nome => distanzaLavorazione(regioneCommessa, provinciaCommessa, opByNome[nome]?.provincia, opByNome[nome]?.regione);
    const rangoDi = nome => {
      const stato = pwStatoOperatore(nome, cidx, sidx, oidx);
      if (stato === 'libero') return 0;
      if (stato === 'assegnato') return 1;
      if (stato === 'ferie_parziale') return 2;
      if (stato === 'ferie') return 3;
      return 4; // non_disponibile
    };
    const senRango = nome => (serveSenior && opSeniorita(nome) === 'senior') ? 0 : 1;
    const ordinati = [...filtrati].sort((a, b) => {
      const dRango = rangoDi(a) - rangoDi(b);
      if (dRango !== 0) return dRango;
      const dSen = senRango(a) - senRango(b);
      if (dSen !== 0) return dSen;
      const dComm = (fromStaffing.has(a) ? 0 : 1) - (fromStaffing.has(b) ? 0 : 1);
      if (dComm !== 0) return dComm;
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
        : stato === 'ferie_parziale' ? 'FERIE ' + pwFerieGiorniLabel(nome).toUpperCase()
        : stato === 'non_disponibile' ? 'NON DISP.'
        : stato === 'assegnato' ? 'ASSEGNATO' : 'LIBERO';
      const inCommessa = fromStaffing.has(nome);
      const provInfo = provinciaInfo(opByNome[nome]?.provincia);
      const geoLabel = provInfo ? provInfo.nome : operatoreRegione(opByNome[nome]);
      const fornNome = fornOfNome[nome] || '';
      const senBadge = fornNome ? '' : senioritaBadgeHtml(opSeniorita(nome));
      const dwFase = dwFaseDi(nome);
      const dwBadge = !dwFase ? ''
        : '<span style="background:' + (dwFase === 'W1' ? '#6366f1' : '#818cf8') + ';color:#fff;border-radius:3px;padding:0 5px;" title="' +
          (dwFase === 'W1' ? 'Doppia week - 1a settimana' : 'Doppia week - 2a settimana (rientro gio, riposo ven)') + '">🔁 DOPPIA ' + dwFase +
          (dwFase === 'W1' && !pwOperatoreImpiegato(pwAnno, pwWeek, nome) ? ' · da collocare' : '') + '</span>';

      // Nome su una riga, dettagli (commessa, provenienza, seniority, fornitore) sotto e
      // a capo se serve: nulla viene troncato con i puntini.
      const meta = [
        inCommessa ? '<span>✅ in commessa</span>' : '<span>fuori commessa</span>',
        geoLabel ? '<span>📍 ' + esc(geoLabel) + '</span>' : '',
        senBadge,
        dwBadge,
        fornNome ? '<span class="op-modal-forn" style="background:#e0e7ff;color:#4338ca;border-radius:3px;padding:0 5px;">🏢 ' + esc(fornNome) + '</span>' : ''
      ].filter(Boolean).join('');
      const item = document.createElement('div');
      item.className = 'op-modal-item stato-' + stato + (nome === nomeCorrente ? ' is-selected' : '');
      item.innerHTML = '<div class="op-modal-dot stato-' + stato + '"></div>' +
        '<div class="op-modal-item-body"><div class="op-modal-item-nome">' + esc(nome) + '</div>' +
        '<div class="op-modal-item-meta">' + meta + '</div></div>' +
        '<span class="op-modal-tag stato-' + stato + '">' + tagLabel + '</span>';
      item.onclick = () => pwConfirmOpModal(cidx, sidx, oidx, nome, fornNome);
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
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-ferie_parziale"></div> Ferie alcuni giorni</div>
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-ferie"></div> In ferie tutta la week</div>
    <div class="op-modal-legend-item"><div class="op-modal-dot stato-non_disponibile"></div> Non disponibile</div>`;
  modal.appendChild(legend);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Focus ricerca + filtro live
  setTimeout(() => search.focus(), 50);
  search.addEventListener('input', () => buildList(search.value));
  search.addEventListener('keydown', e => { if (e.key === 'Escape') pwCloseOpModal(); });
}

function pwCloseOpModal() {
  const m = document.getElementById('op-select-modal');
  if (m) m.remove();
}

async function pwConfirmOpModal(cidx, sidx, oidx, nome, fornNome) {
  pwCloseOpModal();
  if (!sbGuardWrite()) return;
  // Assegnare (non rimuovere) un operatore con limitazioni riportate nell'idoneita'
  // medica mostra un avviso col dettaglio prima di confermare, cosi' si puo' ancora
  // annullare la scelta (vedi dashboard-limitazioni.js).
  if (nome) {
    const reg = limVociOperatore(nome);
    if (reg) {
      const proceed = await showConfirmAsync(
        '⚠ ' + nome + ' ha limitazioni riportate nell\'idoneità medica:\n\n' + limDescrizioneRegistro(reg) +
        '\n\nProcedere comunque con l\'assegnazione?',
        'Assegna comunque'
      );
      if (!proceed) return;
    }
  }
  const data = pwGetWeekData();
  const op   = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (op !== undefined) {
    op.nome = nome;
    if (fornNome) op.fornitore = fornNome; else delete op.fornitore;
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

// Giorni in cui, dentro la squadra, due o più operatori stanno sullo stesso cantiere e
// sono tutti junior (nessun senior ad affiancarli). Seniority non definita = non conta
// come junior, per non segnalare squadre di cui non si sa nulla.
function pwSquadraSoloJunior(squadra) {
  const giorniLbl = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const out = [];
  for (let d = 0; d < 6; d++) {
    const perCantiere = {};
    (squadra.operatori || []).forEach(o => {
      if (!o.nome || o.fornitore) return;
      const g = (o.giorni || {})[d];
      if (!g) return;
      new Set(pwCellCantieri(g).map(c => c.trim().toLowerCase())).forEach(k => {
        (perCantiere[k] = perCantiere[k] || []).push(o.nome);
      });
    });
    const coppie = Object.values(perCantiere).filter(nomi => nomi.length >= 2 && nomi.every(n => opSeniorita(n) === 'junior'));
    if (coppie.length) out.push(giorniLbl[d] + ' (' + coppie.map(n => n.join(' + ')).join('; ') + ')');
  }
  return out;
}

// Cerca un nome tra i dipendenti di tutti i fornitori (dipendenti esterni non
// presenti in state.operatori, vedi dashboard-fornitori.js).
function fornDipendenteByNome(nome) {
  if (!nome) return null;
  for (const f of (state.fornitori || [])) {
    const d = (f.dipendenti || []).find(d => d.nome_esteso === nome);
    if (d) return d;
  }
  return null;
}

// Provincia (o, in mancanza, regione) di provenienza dell'operatore, per il
// badge di localizzazione nella griglia — stessa logica del filtro geo del
// modal di selezione (pwOpenOpModal). Funziona anche per i dipendenti fornitore.
function pwOperatoreGeoLabel(nome) {
  const op = (state.operatori || []).find(o => (o.nome_esteso || o.nome) === nome) || fornDipendenteByNome(nome);
  if (!op) return '';
  const provInfo = provinciaInfo(op.provincia);
  return provInfo ? provInfo.nome : operatoreRegione(op);
}

/* Costruisce HTML del trigger nella cella operatore */
function pwRenderOpDropdown(cidx, sidx, oidx, nomeCorrente, fornitoreNome) {
  const stato      = nomeCorrente ? pwStatoOperatore(nomeCorrente, cidx, sidx, oidx) : '';
  const statoClass = nomeCorrente ? `stato-${stato}` : '';
  const label      = nomeCorrente || '— scegli —';
  const exBadge    = nomeCorrente && isOperatoreLicenziato(nomeCorrente)
    ? '<span class="op-ex-tag">ex</span>'
    : '';
  const fornBadge  = nomeCorrente && fornitoreNome
    ? `<span class="op-ex-tag" style="background:#e0e7ff;color:#4338ca;" title="Dipendente fornitore esterno">🏢 ${esc(fornitoreNome)}</span>`
    : '';
  const geoLabel   = nomeCorrente ? pwOperatoreGeoLabel(nomeCorrente) : '';
  const titleAttr  = stato === 'ferie_parziale' ? ` title="In ferie: ${esc(pwFerieGiorniLabel(nomeCorrente))}"` : '';
  return `<button class="op-trigger-btn pw-write-action ${statoClass}"${titleAttr}
    onclick="pwOpenOpModal(${cidx}, ${sidx}, ${oidx})">
    <span class="op-trigger-label">${label}${exBadge}${fornBadge}</span>
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
    pwJchkRefresh();
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
          const attivitaList = pwCellAttivitaRaw(giorni[dKey]);
          const isSab    = di === 5;
          const tipoGiorno = pwFerieTipo(opFerie[di]);
          const isInFerie = !!tipoGiorno;
          const ferieClass = tipoGiorno === 'non_disponibile' ? ' non-disponibile' : tipoGiorno === 'ferie' ? ' in-ferie' : '';
          const cantierePlaceholder = tipoGiorno === 'non_disponibile' ? '🚫 non disponibile' : tipoGiorno === 'ferie' ? '🏖 ferie' : 'cantiere…';
          const attivitaPlaceholder = isInFerie ? '' : 'attività (facolt.)';
          const cantiereRowsHtml = cantiereList.map((c, ci) => `
            <div class="pw-cantiere-row">
              <input class="pw-cantiere-input pw-write-action" type="text" placeholder="${cantierePlaceholder}"
                value="${c.replace(/"/g, '&quot;')}"
                data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-idx="${ci}"
                onchange="pwUpdateCantiere(this)">${pwJiraSubtaskBadgeHtml(cIdx, sIdx, oIdx, dKey, ci, bloccoCommessa, op.nome, c, attivitaList[ci])}${cantiereList.length > 1 ? `<button type="button" class="pw-cantiere-remove pw-write-action" title="Rimuovi cantiere"
                data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-idx="${ci}"
                onclick="pwRemoveCantiereField(this)">✕</button>` : ''}
            </div>
            <input class="pw-attivita-input pw-write-action" type="text" placeholder="${attivitaPlaceholder}"
              value="${(attivitaList[ci] || '').replace(/"/g, '&quot;')}"
              data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}" data-idx="${ci}"
              onchange="pwUpdateAttivitaCantiere(this)">`).join('');
          return `<div class="pw-day-cell${isSab ? ' sabato' : ''}${ferieClass}" data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}"
            title="Click destro per copiare/incollare cantiere e attività"
            oncontextmenu="return pwCellCtxMenu(event, ${cIdx}, ${sIdx}, ${oIdx}, ${dKey});">
            <div class="pw-cantiere-list">
              ${cantiereRowsHtml}
              <button type="button" class="pw-cantiere-add pw-write-action" title="Aggiungi un altro cantiere per questo giorno"
                data-cidx="${cIdx}" data-sidx="${sIdx}" data-oidx="${oIdx}" data-day="${dKey}"
                onclick="pwAddCantiereField(this)">+ cantiere</button>
            </div>
          </div>`;
        }).join('');

        // Stato operatore corrente (con esclusione della sola cella corrente)
        const statoAttuale = op.nome ? pwStatoOperatore(op.nome, cIdx, sIdx, oIdx) : '';
        const badgeLabel = statoAttuale === 'ferie' ? 'FERIE'
          : statoAttuale === 'ferie_parziale' ? 'FERIE ' + pwFerieGiorniLabel(op.nome).toUpperCase()
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
            ${pwRenderOpDropdown(cIdx, sIdx, oIdx, op.nome, op.fornitore)}
            ${badgeHtml ? `<div>${badgeHtml}</div>` : ''}
            ${dwBadge ? `<div>${dwBadge}</div>` : ''}
            ${op.nome && !op.fornitore && opSeniorita(op.nome) ? '<div>' + senioritaBadgeHtml(opSeniorita(op.nome)) + '</div>' : ''}
            <button class="text-[9px] text-red-400 hover:text-red-600 text-left pw-write-action"
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
      const soloJunior = pwSquadraSoloJunior(squadra);
      const soloJuniorHtml = soloJunior.length
        ? '<span class="text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 rounded" title="' + esc('Junior insieme senza un senior sullo stesso cantiere: ' + soloJunior.join(' · ')) + '">⚠️ solo junior</span>'
        : '';

      return `<div class="pw-squadra-block" data-collapse-key="${cIdx}-${sIdx}">
        <div class="pw-squadra-header">
          <button class="pw-sq-collapse-toggle" onclick="pwToggleSq(${cIdx},${sIdx})">▼</button>
          <span>🟡</span>
          <input type="text" class="pw-sq-nome-input pw-write-action bg-transparent border-none outline-none font-semibold text-amber-900 text-xs"
            placeholder="Nome squadra…" value="${(squadra.nome || '').replace(/"/g, '&quot;')}"
            data-cidx="${cIdx}" data-sidx="${sIdx}"
            onchange="pwUpdateSquadraNome(this)">
          ${cognomiHtml}
          ${soloJuniorHtml}
          <div class="flex items-center gap-2 ml-2" style="margin-left:auto;">
            <button class="text-[10px] bg-amber-200 hover:bg-amber-300 text-amber-900 px-2 py-0.5 rounded pw-write-action"
              data-cidx="${cIdx}" data-sidx="${sIdx}"
              onclick="pwAddOp(this)">+ Operatore</button>
            <button class="text-[10px] bg-amber-200 hover:bg-amber-300 text-amber-900 px-2 py-0.5 rounded"
              data-cidx="${cIdx}" data-sidx="${sIdx}" data-help-key="pw-sottotask-jira" onclick="pwJiraSubtaskInit(${cIdx},${sIdx})"
              title="Crea sottotask su Jira per i soli operatori pianificati questa settimana in questa squadra — Click destro per la guida">🎫 Sottotask</button>
            <button class="text-[10px] bg-amber-200 hover:bg-amber-300 text-amber-900 px-1.5 py-0.5 rounded disabled:opacity-50"
              data-cidx="${cIdx}" data-sidx="${sIdx}" onclick="pwMoveSquadraUp(this)" ${(sIdx === 0 || !sbCanWrite()) ? 'disabled' : ''} title="Sposta squadra su">▲</button>
            <button class="text-[10px] bg-amber-200 hover:bg-amber-300 text-amber-900 px-1.5 py-0.5 rounded disabled:opacity-50"
              data-cidx="${cIdx}" data-sidx="${sIdx}" onclick="pwMoveSquadraDown(this)" ${(sIdx === bloccoCommessa.squadre.length - 1 || !sbCanWrite()) ? 'disabled' : ''} title="Sposta squadra giù">▼</button>
            <button class="text-[10px] text-red-400 hover:text-red-600 pw-write-action"
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
                <button type="button" class="pw-str-trigger pw-write-action" data-cidx="${cIdx}" data-sidx="${sIdx}" data-idx="${idx}" onclick="pwStrOpen(this)"
                  title="${dup ? 'Attenzione: questo strumento e assegnato a piu squadre in questa settimana' : 'Clicca per cercare e scegliere lo strumento'}"
                  style="font-size:11px;text-align:left;border:1px solid ${dup ? '#dc2626' : '#d1d5db'};border-radius:4px;padding:2px 6px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${dup ? '#fef2f2' : '#fff'};cursor:pointer;">${esc(pwStrLabel(k))} ▾</button>${dup ? '<span title="Doppia assegnazione" style="color:#dc2626;font-size:12px;">⚠</span>' : ''}<button class="pw-write-action" data-cidx="${cIdx}" data-sidx="${sIdx}" data-idx="${idx}" onclick="pwRemoveStrumento(this)" title="Rimuovi strumento" style="color:#b91c1c;font-size:12px;line-height:1;padding:0 2px;">✕</button>
              </span>`;
            }).join('')}
            <button class="pw-write-action" data-cidx="${cIdx}" data-sidx="${sIdx}" onclick="pwAddStrumento(this)" style="font-size:10px;font-weight:600;background:#fde68a;color:#92400e;border-radius:4px;padding:2px 7px;white-space:nowrap;">+ Strumento</button>
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
          <select class="bg-teal-700 text-white text-sm font-semibold border border-teal-500 rounded px-2 py-0.5 pw-write-action"
            data-cidx="${cIdx}" onchange="pwUpdateCommessa(this)">
            ${commessaOptions}
          </select>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-xs bg-teal-500 hover:bg-teal-400 text-white px-3 py-1 rounded pw-write-action"
            data-cidx="${cIdx}" onclick="pwAddSquadra(this)">+ Squadra</button>
          <button class="text-xs bg-amber-500 hover:bg-amber-400 text-white px-2 py-1 rounded pw-write-action"
            data-cidx="${cIdx}" data-help-key="pw-sottotask-jira" onclick="pwJiraSubtaskInit(${cIdx})" title="Crea sottotask su Jira per gli operatori pianificati questa settimana — Click destro per la guida">🎫 Sottotask Jira</button>
          <button class="text-xs bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded disabled:opacity-50"
            data-cidx="${cIdx}" onclick="pwMoveCommessaUp(this)" ${(cIdx === 0 || !sbCanWrite()) ? 'disabled' : ''} title="Sposta commessa su">▲</button>
          <button class="text-xs bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded disabled:opacity-50"
            data-cidx="${cIdx}" onclick="pwMoveCommessaDown(this)" ${(cIdx === data.length - 1 || !sbCanWrite()) ? 'disabled' : ''} title="Sposta commessa giù">▼</button>
          <button class="text-xs text-teal-200 hover:text-red-300 pw-write-action"
            data-cidx="${cIdx}" onclick="pwRemoveCommessa(this)">✕</button>
        </div>
      </div>
      ${squadreHtml || `<div class="text-xs text-slate-500 italic px-4 py-3">Nessuna squadra — clicca "+ Squadra"</div>`}
      <div class="pw-op-legenda no-print">
        <div class="pw-op-legenda-item"><span class="op-stato-badge libero">LIBERO</span> disponibile</div>
        <div class="pw-op-legenda-item"><span class="op-stato-badge assegnato">ASSEGNATO</span> già in un'altra squadra questa settimana</div>
        <div class="pw-op-legenda-item"><span class="op-stato-badge ferie">FERIE</span> in ferie/permesso tutta la settimana</div>
        <div class="pw-op-legenda-item"><span class="op-stato-badge ferie_parziale">FERIE LUN</span> in ferie/permesso solo alcuni giorni</div>
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
  pwUpdateWeatherWidget();
  pwRefreshMeteoWeek();
  pwNvUpdateButton();
  pwJchkRefresh();
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

  // Squadre con almeno un operatore in doppia week (1ª o 2ª settimana del blocco):
  // stesso flag puro dei badge 🔁 DOPPIA W1/W2 delle righe operatore.
  const prevW = pwWeekAdd(pwAnno, pwWeek, -1);
  const squadreDw = [];
  data.forEach((bc, cIdx) => {
    (bc.squadre || []).forEach((sq, sIdx) => {
      const ops = [];
      (sq.operatori || []).forEach((op, oIdx) => {
        if (!op.nome || !op.nome.trim()) return;
        const fase = pwIsDwStart(pwAnno, pwWeek, op.nome) ? 'W1'
          : pwIsDwStart(prevW.anno, prevW.week, op.nome) ? 'W2' : '';
        if (fase) ops.push({ nome: op.nome, oIdx, fase });
      });
      if (ops.length) squadreDw.push({ cIdx, sIdx, commessa: bc.commessa || '', squadra: sq.nome || '', operatori: ops });
    });
  });

  // Salva dati per i popover sul banner
  banner._statsData = {
    pianificati:   [...pianificati].sort().map(nome => ({ nome, commesse: [...(commessaNomiPerOp[nome] || [])] })),
    liberi:        liberiList.sort().map(nome => ({ nome })),
    inFerie:       [...inFerie].sort().map(nome => ({ nome, giorni: ferieGiorni[nome] || [] })),
    suPiuCommesse: suPiuCommesseLista.sort((a,b) => a.nome.localeCompare(b.nome)),
    doppiaWeek:    squadreDw,
  };

  const cards = [
    { icon: '👷', num: pianificati.size,        lbl: 'Pianificati questa settimana', cls: 'blu',    key: 'pianificati'   },
    { icon: '✅', num: liberiList.length,         lbl: 'Liberi / disponibili',         cls: 'verde',  key: 'liberi'        },
    { icon: '🏖', num: inFerie.size,             lbl: 'In ferie o permesso',          cls: 'rosso',  key: 'inFerie'       },
    { icon: '⚠️', num: suPiuCommesseLista.length, lbl: 'Su più commesse',              cls: 'giallo', key: 'suPiuCommesse' },
    { icon: '🔁', num: squadreDw.length,          lbl: 'Squadre in doppia week',       cls: 'viola',  key: 'doppiaWeek'    },
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

