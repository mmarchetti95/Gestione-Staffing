/* ==================== NAVIGAZIONE SCHERMATA ==================== */
function switchScreen(screen) {
  const mainEl   = document.querySelector('main');
  const weeklyEl = document.getElementById('screen-weekly');
  const navDash  = document.getElementById('nav-dashboard');
  const navWk    = document.getElementById('nav-weekly');
  const btnPres  = document.getElementById('btn-presentation');
  try { localStorage.setItem('last_screen', screen); } catch (_) {}
  if (screen === 'weekly') {
    mainEl.classList.add('hidden');
    weeklyEl.classList.remove('hidden');
    navDash.classList.remove('active');
    navWk.classList.add('active');
    if (btnPres) btnPres.style.visibility = 'hidden';
    pwLoad().then(() => pwSwitchTab(typeof _pwActiveTab !== 'undefined' ? _pwActiveTab : 'griglia'));
  } else {
    weeklyEl.classList.add('hidden');
    mainEl.classList.remove('hidden');
    navDash.classList.add('active');
    navWk.classList.remove('active');
    if (btnPres) btnPres.style.visibility = 'visible';
  }
}

/* ==================== TAB GRIGLIA / FERIE / MAPPA ==================== */
let _pwActiveTab = (function(){ try { return localStorage.getItem('pw_last_tab') || 'griglia'; } catch(_) { return 'griglia'; } })();
// Ricorda la posizione di scroll di ciascun tab (Griglia/Ferie/Mappa = scroll pagina,
// Controllo Produzione = scroll interno alla tabella) finché non si fa il refresh.
let _pwScrollY = { griglia: 0, ferie: 0, mappa: 0, controllo: 0, doppia: 0 };
let _cpTableScrollTop = 0;

function pwSwitchTab(tab) {
  // Salva la posizione di scroll del tab che si stava lasciando, per ripristinarla al ritorno
  const _leavingTab = _pwActiveTab;
  _pwScrollY[_leavingTab] = window.scrollY;
  if (_leavingTab === 'controllo') {
    const _cpc = document.getElementById('cp-table-container');
    if (_cpc) _cpTableScrollTop = _cpc.scrollTop;
  }
  _pwActiveTab = tab;
  // Memorizza ultima tab e settimana per ripristinarle al refresh
  try {
    localStorage.setItem('pw_last_tab', tab);
    localStorage.setItem('pw_last_anno', String(pwAnno));
    localStorage.setItem('pw_last_week', String(pwWeek));
  } catch (_) {}
  const headerDates = document.getElementById('pw-header-dates');
  if (headerDates) {
    const _mon = isoWeekToMonday(pwAnno, pwWeek);
    const _sat = new Date(_mon); _sat.setUTCDate(_mon.getUTCDate() + 5);
    headerDates.textContent = `WEEK ${pwWeek} · ${formatDate(_mon)} — ${formatDate(_sat)} ${pwAnno}`;
  }
  const _annoSel = document.getElementById('pw-anno');
  if (_annoSel) _annoSel.value = String(pwAnno);
  // Il <select> settimane va ripopolato qui (non solo dentro pwRender/Griglia): se il tab
  // ripristinato all'apertura non è la Griglia, altrimenti resta vuoto finché non ci si passa.
  pwPopulateWeekSelect();
  // Il banner statistiche è comune a tutti i tab: va ricalcolato sulla settimana
  // corrente indipendentemente dal tab visualizzato, non solo quando si è in Griglia.
  pwRenderStats();
  const tg = document.getElementById('pw-tab-griglia');
  const tf = document.getElementById('pw-tab-ferie');
  const tm = document.getElementById('pw-tab-mappa');
  const tc = document.getElementById('pw-tab-controllo');
  const td = document.getElementById('pw-tab-doppia');
  const vg = document.getElementById('pw-view-griglia');
  const vf = document.getElementById('pw-view-ferie');
  const vm = document.getElementById('pw-view-mappa');
  const vc = document.getElementById('pw-view-controllo');
  const vd = document.getElementById('pw-view-doppia');

  [tg, tf, tm, tc, td].forEach(t => t && t.classList.remove('active'));
  [vg, vf, vm, vc, vd].forEach(v => v && v.classList.add('hidden'));

  if (tab === 'mappa') {
    tm.classList.add('active');
    vm.classList.remove('hidden');
    window.scrollTo(0, _pwScrollY.mappa || 0);
    setTimeout(() => {
      if (!_map) {
        _map = L.map('pw-map', { preferCanvas: true }).setView([42.5, 12.5], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19
        }).addTo(_map);
        setTimeout(() => _map.invalidateSize(), 200);
      }
      if (!_mapOp) {
        _mapOp = L.map('pw-map-op', { preferCanvas: true }).setView([42.5, 12.5], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19
        }).addTo(_mapOp);
        setTimeout(() => _mapOp.invalidateSize(), 200);
      }
      pwMapRender(_mapDay);
    }, 60);
  } else if (tab === 'ferie') {
    tf.classList.add('active');
    vf.classList.remove('hidden');
    pwFerieRender();
    window.scrollTo(0, _pwScrollY.ferie || 0);
  } else if (tab === 'controllo') {
    tc.classList.add('active');
    vc.classList.remove('hidden');
    // Nota: NON azzerare _cpCollapsedComm/_cpCollapsedSq qui — devono restare
    // come l'utente le ha lasciate finché non fa il refresh della pagina.
    pwControlloLoad().then(() => {
      const _cpc = document.getElementById('cp-table-container');
      if (_cpc) _cpc.scrollTop = _cpTableScrollTop;
      window.scrollTo(0, _pwScrollY.controllo || 0);
    });
  } else if (tab === 'doppia') {
    td.classList.add('active');
    vd.classList.remove('hidden');
    pwDoppiaWeekRender();
    window.scrollTo(0, _pwScrollY.doppia || 0);
  } else {
    tg.classList.add('active');
    vg.classList.remove('hidden');
    // Nota: NON azzerare _pwCollapsedComm/_pwCollapsedSq qui — devono restare
    // come l'utente le ha lasciate finché non fa il refresh della pagina.
    pwRender();
    window.scrollTo(0, _pwScrollY.griglia || 0);
  }
}

