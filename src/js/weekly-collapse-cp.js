/* ==================== COLLAPSE / ACCORDION ==================== */

/* ----- Griglia settimanale ----- */
function pwToggleComm(cidx) {
  const key = String(cidx);
  if (_pwCollapsedComm.has(key)) _pwCollapsedComm.delete(key);
  else _pwCollapsedComm.add(key);
  pwApplyCollapseState();
}
function pwToggleSq(cidx, sidx) {
  const key = cidx + '-' + sidx;
  if (_pwCollapsedSq.has(key)) _pwCollapsedSq.delete(key);
  else _pwCollapsedSq.add(key);
  pwApplyCollapseState();
}
function pwApplyCollapseState() {
  document.querySelectorAll('.pw-commessa-block').forEach(bl => {
    const key = String(bl.dataset.cidx);
    const btn = bl.querySelector('.pw-collapse-toggle');
    if (_pwCollapsedComm.has(key)) { bl.classList.add('pw-collapsed'); if (btn) btn.textContent = '▶'; }
    else { bl.classList.remove('pw-collapsed'); if (btn) btn.textContent = '▼'; }
  });
  document.querySelectorAll('.pw-squadra-block').forEach(bl => {
    const key = bl.dataset.collapseKey;
    const btn = bl.querySelector('.pw-sq-collapse-toggle');
    if (key && _pwCollapsedSq.has(key)) { bl.classList.add('pw-sq-collapsed'); if (btn) btn.textContent = '▶'; }
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
    _pwCollapsedComm.clear(); _pwCollapsedSq.clear();
  } else {
    allBlocks.forEach(b => _pwCollapsedComm.add(String(b.dataset.cidx)));
    document.querySelectorAll('.pw-squadra-block[data-collapse-key]').forEach(b => _pwCollapsedSq.add(b.dataset.collapseKey));
  }
  pwApplyCollapseState();
}

/* ----- Controllo Produzione ----- */
function cpToggleComm(idx) {
  const key = String(idx);
  if (_cpCollapsedComm.has(key)) _cpCollapsedComm.delete(key);
  else _cpCollapsedComm.add(key);
  cpApplyCollapse();
}
function cpToggleSq(key) {
  if (_cpCollapsedSq.has(key)) _cpCollapsedSq.delete(key);
  else _cpCollapsedSq.add(key);
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
      if (arr) arr.textContent = _cpCollapsedComm.has(ci) ? '▶' : '▼';
      return;
    }
    if (_cpCollapsedComm.has(ci)) { tr.style.display = 'none'; return; }
    if (tr.classList.contains('cp-tr-squadra')) {
      tr.style.display = '';
      const arr = tr.querySelector('.cp-sarr');
      if (arr) arr.textContent = _cpCollapsedSq.has(si) ? '▶' : '▼';
      return;
    }
    tr.style.display = (si && _cpCollapsedSq.has(si)) ? 'none' : '';
  });
  const btn = document.getElementById('cp-collapse-all');
  if (btn) {
    const commRows = [...tbody.querySelectorAll('.cp-tr-commessa[data-comm-idx]')];
    const allColl = commRows.length > 0 && commRows.every(tr => _cpCollapsedComm.has(tr.dataset.commIdx));
    btn.textContent = allColl ? '≡ Espandi' : '≡ Collassa';
  }
}
function cpCollapseAllToggle() {
  const tbody = document.querySelector('.cp-table tbody');
  if (!tbody) return;
  const commRows = [...tbody.querySelectorAll('.cp-tr-commessa[data-comm-idx]')];
  const sqRows   = [...tbody.querySelectorAll('.cp-tr-squadra[data-sq-idx]')];
  const allColl  = commRows.length > 0 && commRows.every(tr => _cpCollapsedComm.has(tr.dataset.commIdx));
  if (allColl) { _cpCollapsedComm.clear(); _cpCollapsedSq.clear(); }
  else { commRows.forEach(tr => _cpCollapsedComm.add(tr.dataset.commIdx)); sqRows.forEach(tr => _cpCollapsedSq.add(tr.dataset.sqIdx)); }
  cpApplyCollapse();
}

/* ----- Ricerca operatore/cantiere in Controllo Produzione -----
   Stesso pattern di pwSearchOp (weekly-popover-stats.js) ma senza modal di
   dettaglio: la tabella è piatta, quindi evidenziare/attenuare le righe basta.
   Durante la ricerca lo stato collassa/espandi viene ignorato (tutte le righe
   restano visibili) per non nascondere risultati dentro sezioni chiuse; alla
   ricerca vuota si ripristina con cpApplyCollapse(). */
let _cpSearchTerm = '';

function cpSearchOp(term) {
  _cpSearchTerm = (term || '').trim().toLowerCase();

  const clearBtn = document.getElementById('cp-search-op-clear');
  const infoEl   = document.getElementById('cp-search-op-info');
  if (clearBtn) clearBtn.classList.toggle('hidden', !_cpSearchTerm);

  const tbody = document.querySelector('.cp-table tbody');
  if (!tbody) return;

  if (!_cpSearchTerm) {
    tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('cp-search-match', 'cp-search-dim', 'cp-search-no-match'));
    if (infoEl) { infoEl.textContent = ''; infoEl.classList.add('hidden'); }
    cpApplyCollapse();
    return;
  }

  const matchedComm = new Set();
  const matchedSq   = new Set();
  let matchCount = 0;

  tbody.querySelectorAll('tr[data-operatore]').forEach(tr => {
    const nome     = (tr.dataset.operatore || '').toLowerCase();
    const cantiere = (tr.dataset.cantiere  || '').toLowerCase();
    const isMatch  = (!!nome && nome.includes(_cpSearchTerm)) || (!!cantiere && cantiere.includes(_cpSearchTerm));
    tr.classList.toggle('cp-search-match', isMatch);
    tr.classList.toggle('cp-search-dim', !isMatch);
    tr.style.display = '';
    if (isMatch) {
      matchCount++;
      matchedComm.add(tr.dataset.commIdx);
      matchedSq.add(tr.dataset.sqIdx);
    }
  });

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
    } else {
      infoEl.textContent = `${matchCount} risultat${matchCount === 1 ? 'o' : 'i'} trovat${matchCount === 1 ? 'o' : 'i'}`;
      infoEl.style.color = 'var(--accent)';
    }
  }
}

