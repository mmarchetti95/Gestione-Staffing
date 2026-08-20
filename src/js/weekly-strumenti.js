/* ==================== STRUMENTI SQUADRA (da Jira GAR) ==================== */
// Elenco strumenti (cache in memoria + localStorage): [{key, name}]
let pwStrumenti = [];
try { const _c = localStorage.getItem('pw_strumenti_cache'); if (_c) pwStrumenti = JSON.parse(_c) || []; } catch (_) {}

async function pwFetchStrumenti() {
  const st = document.getElementById('pw-strumenti-status');
  if (!_sbClient || !_sbUser) { showAlertModal('Non connesso: impossibile contattare Jira.'); return; }
  if (st) st.textContent = '⏳ Carico strumenti da Jira…';
  try {
    const { data, error } = await _sbClient.functions.invoke('jira-list-strumenti', { body: {} });
    if (error) throw new Error(await _cpEdgeErr(error, 'jira-list-strumenti'));
    if (data && data.error) throw new Error(data.error);
    pwStrumenti = Array.isArray(data && data.strumenti) ? data.strumenti : [];
    try { localStorage.setItem('pw_strumenti_cache', JSON.stringify(pwStrumenti)); } catch (_) {}
    if (st) st.textContent = `✓ ${pwStrumenti.length} strumenti caricati`;
    pwRender();
    setTimeout(() => { if (st) st.textContent = ''; }, 4000);
  } catch (e) {
    console.error('pwFetchStrumenti', e);
    if (st) st.textContent = '';
    showAlertModal('Errore caricamento strumenti da Jira: ' + (e.message || e));
  }
}

function pwSqStrumentiJira(sq) {
  if (Array.isArray(sq.strumentiJira)) return sq.strumentiJira.slice();
  if (Array.isArray(sq.strumenti)) return sq.strumenti.slice();
  return [];
}
function pwSetSqStrumentiJira(sq, arr) {
  sq.strumentiJira = arr;
  if (Array.isArray(sq.strumenti)) sq.strumenti = '';
}

function pwStrLabel(key) {
  if (!key) return '— strumento —';
  const s = pwStrumenti.find(x => x.key === key);
  return s ? (s.key + ' · ' + s.name) : key;
}

function pwStrumentoCounts() {
  const cnt = {};
  pwGetWeekData().forEach(bc => (bc.squadre || []).forEach(sq => pwSqStrumentiJira(sq).forEach(k => {
    if (k) cnt[k] = (cnt[k] || 0) + 1;
  })));
  return cnt;
}

async function pwAddStrumento(btn) {
  const { cidx, sidx } = btn.dataset;
  const sq = pwGetWeekData()[cidx]?.squadre[sidx];
  if (!sq) return;
  const arr = pwSqStrumentiJira(sq);
  arr.push('');
  pwSetSqStrumentiJira(sq, arr);
  await pwSave();
  pwRender();
}

async function pwRemoveStrumento(btn) {
  const { cidx, sidx, idx } = btn.dataset;
  const sq = pwGetWeekData()[cidx]?.squadre[sidx];
  if (!sq) return;
  const arr = pwSqStrumentiJira(sq);
  arr.splice(parseInt(idx), 1);
  pwSetSqStrumentiJira(sq, arr);
  await pwSave();
  pwRender();
}

/* --- Tendina custom con ricerca (si apre verso il basso, non viene clippata) --- */
let _pwStrTarget = null;
function pwStrEnsurePanel() {
  let p = document.getElementById('pw-str-panel');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'pw-str-panel';
  p.className = 'pw-str-panel';
  p.style.cssText = 'position:fixed;z-index:9999;width:280px;display:none;overflow:hidden;';
  p.innerHTML = '<div class="pw-str-panel-search"><input id="pw-str-search" type="text" placeholder="Cerca strumento…"></div><div id="pw-str-list" style="overflow-y:auto;"></div>';
  document.body.appendChild(p);
  p.querySelector('#pw-str-search').addEventListener('input', e => pwStrRenderList(e.target.value));
  document.addEventListener('mousedown', e => {
    const pan = document.getElementById('pw-str-panel');
    if (pan && pan.style.display !== 'none' && !pan.contains(e.target) && !(e.target.classList && e.target.classList.contains('pw-str-trigger'))) pwStrClose();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pwStrClose(); });
  return p;
}
function pwStrClose() {
  const p = document.getElementById('pw-str-panel');
  if (p) p.style.display = 'none';
  _pwStrTarget = null;
}
function pwStrOpen(btn) {
  const p = pwStrEnsurePanel();
  _pwStrTarget = { cidx: btn.dataset.cidx, sidx: btn.dataset.sidx, idx: parseInt(btn.dataset.idx) };
  const r = btn.getBoundingClientRect();
  p.style.display = 'block';
  p.style.left = Math.max(6, Math.min(r.left, window.innerWidth - 290)) + 'px';
  p.style.top = (r.bottom + 2) + 'px';
  const avail = window.innerHeight - r.bottom - 16;
  const list = p.querySelector('#pw-str-list');
  list.style.maxHeight = Math.max(120, Math.min(280, avail)) + 'px';
  const search = p.querySelector('#pw-str-search');
  search.value = '';
  pwStrRenderList('');
  setTimeout(() => search.focus(), 0);
}
function pwStrRenderList(filter) {
  const list = document.getElementById('pw-str-list');
  if (!list) return;
  const f = (filter || '').toLowerCase().trim();
  let html = '<div class="pw-str-item empty" data-key="">— nessuno —</div>';
  if (pwStrumenti.length === 0) {
    html += '<div style="padding:8px;font-size:11px;color:#b45309;">Nessuno strumento in cache. Clicca "🔧 Aggiorna strumenti".</div>';
  } else {
    const items = pwStrumenti.filter(s => !f || (s.key + ' ' + s.name).toLowerCase().includes(f));
    if (items.length === 0) html += '<div style="padding:8px;font-size:11px;color:#94a3b8;">Nessun risultato.</div>';
    else items.forEach(s => {
      html += `<div class="pw-str-item" data-key="${esc(s.key)}"><b>${esc(s.key)}</b> · ${esc(s.name)}</div>`;
    });
  }
  list.innerHTML = html;
  list.querySelectorAll('.pw-str-item').forEach(el => { el.onclick = () => pwStrPick(el.dataset.key); });
}
async function pwStrPick(key) {
  if (!_pwStrTarget) return;
  const { cidx, sidx, idx } = _pwStrTarget;
  const sq = pwGetWeekData()[cidx]?.squadre[sidx];
  if (sq) {
    const arr = pwSqStrumentiJira(sq);
    arr[idx] = key;
    pwSetSqStrumentiJira(sq, arr);
    await pwSave();
  }
  pwStrClose();
  pwRender();
}

async function pwUpdateSquadraNome(inp) {
  const { cidx, sidx } = inp.dataset;
  const data = pwGetWeekData();
  const sq = data[cidx]?.squadre[sidx];
  if (sq) { sq.nome = inp.value.trim(); await pwSave(); }
}

async function pwUpdateCommessa(sel) {
  const cidx = parseInt(sel.dataset.cidx);
  const data = pwGetWeekData();
  if (data[cidx]) {
    data[cidx].commessa = sel.value;
    // Reset squadre se la commessa cambia
    data[cidx].squadre = [{ nome: 'Squadra 1', operatori: [{ nome: '', giorni: {} }] }];
    await pwSave(); pwRender();
  }
}

// Rinumera in sequenza (Squadra 1, Squadra 2, ...) le sole squadre con nome ancora
// "di default" (mai personalizzato dall'utente, riconosciuto dal pattern "Squadra <N>").
// Le squadre rinominate dall'utente non vengono toccate. Va richiamata dopo ogni
// aggiunta/rimozione di squadra per evitare doppioni tipo due "Squadra 2" sulla
// stessa commessa quando la squadra "Squadra 1" viene rimossa e ne viene aggiunta una nuova.
function pwRinumeraSquadreDefault(cidx) {
  const data = pwGetWeekData();
  const squadre = data[cidx]?.squadre;
  if (!squadre) return;
  let n = 1;
  squadre.forEach(sq => {
    if (/^Squadra \d+$/.test((sq.nome || '').trim())) {
      sq.nome = `Squadra ${n}`;
      n++;
    }
  });
}

async function pwAddSquadra(btn) {
  const cidx = parseInt(btn.dataset.cidx);
  const data = pwGetWeekData();
  if (data[cidx]) {
    const n = data[cidx].squadre.length + 1;
    data[cidx].squadre.push({ nome: `Squadra ${n}`, operatori: [{ nome: '', giorni: {} }] });
    pwRinumeraSquadreDefault(cidx);
    await pwSave(); pwRender();
  }
}

async function pwRemoveSquadra(btn) {
  const { cidx, sidx } = btn.dataset;
  const data = pwGetWeekData();
  if (!data[cidx]) return;
  if (data[cidx].squadre.length <= 1) {
    if (!await showConfirmAsync('Rimuovere l\'unica squadra? La commessa rimarrà senza squadre.', 'Rimuovi squadra')) return;
  }
  data[cidx].squadre.splice(parseInt(sidx), 1);
  pwRinumeraSquadreDefault(parseInt(cidx));
  await pwSave(); pwRender();
}

async function pwAddOp(btn) {
  const { cidx, sidx } = btn.dataset;
  const data = pwGetWeekData();
  const sq = data[cidx]?.squadre[sidx];
  if (sq) { sq.operatori.push({ nome: '', giorni: {} }); await pwSave(); pwRender(); }
}

async function pwRemoveOp(btn) {
  const { cidx, sidx, oidx } = btn.dataset;
  const data = pwGetWeekData();
  const sq = data[cidx]?.squadre[sidx];
  if (!sq) return;
  if (sq.operatori.length <= 1) { showAlertModal('Ogni squadra deve avere almeno un operatore.'); return; }
  sq.operatori.splice(parseInt(oidx), 1);
  await pwSave(); pwRender();
}

async function pwRemoveCommessa(btn) {
  const cidx = parseInt(btn.dataset.cidx);
  if (!await showConfirmAsync('Rimuovere questa commessa dalla pianificazione della settimana?', 'Rimuovi commessa')) return;
  const data = pwGetWeekData();
  data.splice(cidx, 1);
  await pwSave(); pwRender();
}

/* ----- Init pianificazione ----- */
document.addEventListener('DOMContentLoaded', async () => {
  await pwLoad();

  // Imposta settimana corrente
  const now = new Date();
  const { week, year } = isoWeekYear(now);
  pwAnno = year; pwWeek = week;

  // Ripristina l'ultima settimana visualizzata, se salvata
  try {
    const sa = parseInt(localStorage.getItem('pw_last_anno'));
    const sw = parseInt(localStorage.getItem('pw_last_week'));
    if (sa && sw && sw >= 1 && sw <= weeksInYear(sa)) { pwAnno = sa; pwWeek = sw; }
  } catch (_) {}

  // Selettori anno/week
  const annoSel = document.getElementById('pw-anno');
  const weekSel = document.getElementById('pw-week');
  if (annoSel) {
    annoSel.value = String(pwAnno);
    annoSel.onchange = () => {
      pwAnno = parseInt(annoSel.value);
      // Correggi se week > weeksInYear
      const maxW = weeksInYear(pwAnno);
      if (pwWeek > maxW) pwWeek = maxW;
      pwSwitchTab(_pwActiveTab || 'griglia');
    };
  }
  if (weekSel) {
    weekSel.onchange = () => { pwWeek = parseInt(weekSel.value); pwSwitchTab(_pwActiveTab || 'griglia'); };
  }

  document.getElementById('pw-prev').onclick = () => {
    pwWeek--;
    if (pwWeek < 1) { pwAnno--; pwWeek = weeksInYear(pwAnno); }
    pwSwitchTab(_pwActiveTab || 'griglia');
  };
  document.getElementById('pw-next').onclick = () => {
    pwWeek++;
    const maxW = weeksInYear(pwAnno);
    if (pwWeek > maxW) { pwAnno++; pwWeek = 1; }
    pwSwitchTab(_pwActiveTab || 'griglia');
  };
  const _strBtn = document.getElementById('pw-strumenti-refresh');
  if (_strBtn) _strBtn.onclick = pwFetchStrumenti;
  document.getElementById('pw-today').onclick = () => {
    const { week, year } = isoWeekYear(new Date());
    pwAnno = year;
    pwWeek = week;
    // Aggiorna anche il selettore anno se presente
    const aS = document.getElementById('pw-anno');
    if (aS) aS.value = String(pwAnno);
    pwSwitchTab(_pwActiveTab || 'griglia');
  };
  document.getElementById('pw-add-commessa').onclick = async () => {
    const data = pwGetWeekData();
    data.push({ commessa: '', squadre: [{ nome: 'Squadra 1', operatori: [{ nome: '', giorni: {} }] }] });
    await pwSave(); pwRender();
  };
  document.getElementById('pw-gen-mail').onclick = () => pwGeneraMail();
  document.getElementById('pw-print').onclick = () => window.print();

  // Ricerca operatore nella griglia
  const searchInput = document.getElementById('pw-search-op');
  const searchClear = document.getElementById('pw-search-op-clear');
  if (searchInput) {
    searchInput.addEventListener('input', () => pwSearchOp(searchInput.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchInput.value = ''; pwSearchOp(''); }
    });
  }
  if (searchClear) {
    searchClear.onclick = () => { searchInput.value = ''; pwSearchOp(''); searchInput.focus(); };
  }
});


