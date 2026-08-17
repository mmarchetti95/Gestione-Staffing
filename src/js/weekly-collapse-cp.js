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

