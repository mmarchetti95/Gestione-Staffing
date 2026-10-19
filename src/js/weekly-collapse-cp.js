/* ==================== COLLAPSE / ACCORDION ==================== */

/* ----- Griglia settimanale ----- */
function pwToggleComm(cidx) {
  const key = String(cidx);
  if (_collapseSets('pw').comm.has(key)) _collapseSets('pw').comm.delete(key);
  else _collapseSets('pw').comm.add(key);
  pwApplyCollapseState();
}
function pwToggleSq(cidx, sidx) {
  const key = cidx + '-' + sidx;
  if (_collapseSets('pw').sq.has(key)) _collapseSets('pw').sq.delete(key);
  else _collapseSets('pw').sq.add(key);
  pwApplyCollapseState();
}
function pwApplyCollapseState() {
  document.querySelectorAll('.pw-commessa-block').forEach(bl => {
    const key = String(bl.dataset.cidx);
    const btn = bl.querySelector('.pw-collapse-toggle');
    if (_collapseSets('pw').comm.has(key)) { bl.classList.add('pw-collapsed'); if (btn) btn.textContent = '▶'; }
    else { bl.classList.remove('pw-collapsed'); if (btn) btn.textContent = '▼'; }
  });
  document.querySelectorAll('.pw-squadra-block').forEach(bl => {
    const key = bl.dataset.collapseKey;
    const btn = bl.querySelector('.pw-sq-collapse-toggle');
    if (key && _collapseSets('pw').sq.has(key)) { bl.classList.add('pw-sq-collapsed'); if (btn) btn.textContent = '▶'; }
    else { bl.classList.remove('pw-sq-collapsed'); if (btn) btn.textContent = '▼'; }
  });
  const collBtn = document.getElementById('pw-collapse-all');
  if (collBtn) {
    const allBlocks = [...document.querySelectorAll('.pw-commessa-block')];
    const allColl = allBlocks.length > 0 && allBlocks.every(b => b.classList.contains('pw-collapsed'));
    collBtn.textContent = allColl ? '≡ Espandi' : '≡ Collassa';
  }
}
function pwCollapseAllToggle() {
  const allBlocks = [...document.querySelectorAll('.pw-commessa-block')];
  const allColl = allBlocks.length > 0 && allBlocks.every(b => b.classList.contains('pw-collapsed'));
  if (allColl) {
    _collapseSets('pw').comm.clear(); _collapseSets('pw').sq.clear();
  } else {
    allBlocks.forEach(b => _collapseSets('pw').comm.add(String(b.dataset.cidx)));
    document.querySelectorAll('.pw-squadra-block[data-collapse-key]').forEach(b => _collapseSets('pw').sq.add(b.dataset.collapseKey));
  }
  pwApplyCollapseState();
}

/* ----- Controllo Produzione ----- */
function cpToggleComm(idx) {
  const key = String(idx);
  if (_collapseSets('cp').comm.has(key)) _collapseSets('cp').comm.delete(key);
  else _collapseSets('cp').comm.add(key);
  cpApplyCollapse();
}
function cpToggleSq(key) {
  if (_collapseSets('cp').sq.has(key)) _collapseSets('cp').sq.delete(key);
  else _collapseSets('cp').sq.add(key);
  cpApplyCollapse();
}
function cpApplyCollapse() {
  const tbody = document.querySelector('.cp-table tbody');
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(tr => {
    const ci = tr.dataset.commIdx;
    const si = tr.dataset.sqIdx;
    if (ci == null) return;
    if (tr.classList.contains('cp-tr-commessa')) {
      tr.style.display = '';
      const arr = tr.querySelector('.cp-carr');
      if (arr) arr.textContent = _collapseSets('cp').comm.has(ci) ? '▶' : '▼';
      return;
    }
    if (_collapseSets('cp').comm.has(ci)) { tr.style.display = 'none'; return; }
    if (tr.classList.contains('cp-tr-squadra')) {
      tr.style.display = '';
      const arr = tr.querySelector('.cp-sarr');
      if (arr) arr.textContent = _collapseSets('cp').sq.has(si) ? '▶' : '▼';
      return;
    }
    tr.style.display = (si && _collapseSets('cp').sq.has(si)) ? 'none' : '';
  });
  const btn = document.getElementById('cp-collapse-all');
  if (btn) {
    const commRows = [...tbody.querySelectorAll('.cp-tr-commessa[data-comm-idx]')];
    const allColl = commRows.length > 0 && commRows.every(tr => _collapseSets('cp').comm.has(tr.dataset.commIdx));
    btn.textContent = allColl ? '≡ Espandi' : '≡ Collassa';
  }
}
function cpCollapseAllToggle() {
  const tbody = document.querySelector('.cp-table tbody');
  if (!tbody) return;
  const commRows = [...tbody.querySelectorAll('.cp-tr-commessa[data-comm-idx]')];
  const sqRows   = [...tbody.querySelectorAll('.cp-tr-squadra[data-sq-idx]')];
  const allColl  = commRows.length > 0 && commRows.every(tr => _collapseSets('cp').comm.has(tr.dataset.commIdx));
  if (allColl) { _collapseSets('cp').comm.clear(); _collapseSets('cp').sq.clear(); }
  else { commRows.forEach(tr => _collapseSets('cp').comm.add(tr.dataset.commIdx)); sqRows.forEach(tr => _collapseSets('cp').sq.add(tr.dataset.sqIdx)); }
  cpApplyCollapse();
}

/* ----- Ricerca operatore/cantiere in Controllo Produzione -----
   Stesso pattern di pwSearchOp (weekly-popover-stats.js) ma senza modal di
   dettaglio: la tabella è piatta, quindi evidenziare/attenuare le righe basta.
   Durante la ricerca lo stato collassa/espandi viene ignorato (tutte le righe
   restano visibili) per non nascondere risultati dentro sezioni chiuse; alla
   ricerca vuota si ripristina con cpApplyCollapse(). Cliccando sul testo dei
   risultati si salta direttamente alla prima riga trovata (cpGoToFirstMatch). */
let _cpSearchTerm = '';
let _cpFirstMatchRow = null;

function cpSearchOp(term) {
  _cpSearchTerm = (term || '').trim().toLowerCase();
  _cpFirstMatchRow = null;

  const clearBtn = document.getElementById('cp-search-op-clear');
  const infoEl   = document.getElementById('cp-search-op-info');
  if (clearBtn) clearBtn.classList.toggle('hidden', !_cpSearchTerm);

  const tbody = document.querySelector('.cp-table tbody');
  if (!tbody) return;

  if (!_cpSearchTerm) {
    tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('cp-search-match', 'cp-search-dim', 'cp-search-no-match'));
    if (infoEl) {
      infoEl.textContent = '';
      infoEl.classList.add('hidden');
      infoEl.style.cursor = '';
      infoEl.style.textDecoration = '';
      infoEl.onclick = null;
    }
    cpApplyCollapse();
    return;
  }

  const matchedComm = new Set();
  const matchedSq   = new Set();
  let matchCount = 0;
  let firstMatchRow = null;

  tbody.querySelectorAll('tr[data-operatore]').forEach(tr => {
    const nome     = (tr.dataset.operatore || '').toLowerCase();
    const cantiere = (tr.dataset.cantiere  || '').toLowerCase();
    const isMatch  = (!!nome && nome.includes(_cpSearchTerm)) || (!!cantiere && cantiere.includes(_cpSearchTerm));
    tr.classList.toggle('cp-search-match', isMatch);
    tr.classList.toggle('cp-search-dim', !isMatch);
    tr.style.display = '';
    if (isMatch) {
      matchCount++;
      if (!firstMatchRow) firstMatchRow = tr;
      matchedComm.add(tr.dataset.commIdx);
      matchedSq.add(tr.dataset.sqIdx);
    }
  });
  _cpFirstMatchRow = firstMatchRow;

  tbody.querySelectorAll('tr.cp-tr-commessa').forEach(tr => {
    tr.style.display = '';
    tr.classList.toggle('cp-search-no-match', !matchedComm.has(tr.dataset.commIdx));
  });
  tbody.querySelectorAll('tr.cp-tr-squadra').forEach(tr => {
    tr.style.display = '';
    tr.classList.toggle('cp-search-no-match', !matchedSq.has(tr.dataset.sqIdx));
  });
  tbody.querySelectorAll('tr.cp-tr-day').forEach(tr => { tr.style.display = ''; });

  if (infoEl) {
    infoEl.classList.remove('hidden');
    if (matchCount === 0) {
      infoEl.textContent = 'Nessun risultato trovato';
      infoEl.style.color = 'var(--red)';
      infoEl.style.cursor = '';
      infoEl.style.textDecoration = '';
      infoEl.onclick = null;
    } else {
      infoEl.textContent = `${matchCount} risultat${matchCount === 1 ? 'o' : 'i'} trovat${matchCount === 1 ? 'o' : 'i'} — clicca per andare al primo`;
      infoEl.style.color = 'var(--accent)';
      infoEl.style.cursor = 'pointer';
      infoEl.style.textDecoration = 'underline';
      infoEl.onclick = () => cpGoToFirstMatch(_cpFirstMatchRow);
    }
  }
}

/* Scrolla alla prima riga trovata dall'ultima cpSearchOp e la evidenzia per
   un paio di secondi (stesso pattern/classe di pwGoToSearchCell in
   weekly-popover-stats.js). */
function cpGoToFirstMatch(row) {
  if (!row || !row.isConnected) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.add('pw-weather-cell-flash');
  setTimeout(() => row.classList.remove('pw-weather-cell-flash'), 2000);
}

