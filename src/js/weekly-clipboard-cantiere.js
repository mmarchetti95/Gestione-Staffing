/* ===== COPIA/INCOLLA CANTIERE/ATTIVITA IN GRIGLIA (click destro) ===== */
// Permette di duplicare cantiere/i + attività di una cella (o dell'intera
// settimana di un operatore) su un altro operatore/squadra/commessa, senza
// dover ridigitare gli stessi valori a mano. Il click destro su una cella
// giorno apre il menu per quella cella; il click destro sulla colonna nome
// operatore apre il menu per l'intera riga (tutti e 6 i giorni).

let _pwClipCell = null; // { cantieri: string[], attivita: string }
let _pwClipRow  = null; // { giorni: { [day]: { cantieri: string[], attivita: string } } }

function _pwCtxMenuEsc(e) {
  if (e.key === 'Escape') _pwCloseCtxMenu();
}

function _pwCloseCtxMenu() {
  const m = document.getElementById('pw-ctx-menu');
  if (m) m.remove();
  document.removeEventListener('keydown', _pwCtxMenuEsc);
}

function _pwShowCtxMenu(x, y, items) {
  _pwCloseCtxMenu();
  const menu = document.createElement('div');
  menu.id = 'pw-ctx-menu';
  menu.className = 'pw-ctx-menu';
  menu.onclick = e => e.stopPropagation();
  items.forEach(it => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-ctx-menu-item' + (it.disabled ? ' disabled' : '');
    btn.textContent = it.label;
    if (!it.disabled) btn.onclick = () => { _pwCloseCtxMenu(); it.onClick(); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);

  // Posiziona e poi ricorregge se esce dal viewport (il menu va misurato da renderizzato).
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = Math.max(4, window.innerWidth - rect.width - 4) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = Math.max(4, window.innerHeight - rect.height - 4) + 'px';

  // Chiusura su click fuori / Esc; il listener va agganciato dopo il click corrente
  // che ha aperto il menu, altrimenti lo stesso evento lo richiuderebbe subito.
  setTimeout(() => document.addEventListener('click', _pwCloseCtxMenu, { once: true }), 0);
  document.addEventListener('keydown', _pwCtxMenuEsc);
}

/* ----- Singola cella (cantiere/i + attività di un giorno) ----- */
function pwCellCtxMenu(ev, cidx, sidx, oidx, day) {
  ev.preventDefault();
  _pwShowCtxMenu(ev.clientX, ev.clientY, [
    { label: '📋 Copia cantiere/attività', onClick: () => pwCopyCell(cidx, sidx, oidx, day) },
    { label: '📥 Incolla qui', disabled: !_pwClipCell, onClick: () => pwPasteCell(cidx, sidx, oidx, day) },
  ]);
  return false;
}

function pwCopyCell(cidx, sidx, oidx, day) {
  const data = pwGetWeekData();
  const op = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (!op) return;
  const g = (op.giorni || {})[day] || {};
  _pwClipCell = { cantieri: pwCellCantieri(g), attivita: g.attivita || '' };
}

async function pwPasteCell(cidx, sidx, oidx, day) {
  if (!sbGuardWrite()) return;
  if (!_pwClipCell) return;
  const data = pwGetWeekData();
  const op = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (!op) return;
  if (!op.giorni) op.giorni = {};
  op.giorni[day] = { cantieri: _pwClipCell.cantieri.slice(), attivita: _pwClipCell.attivita };
  await pwSave();
  pwRender();
  pwRefreshMeteoWeek();
}

/* ----- Intera settimana di un operatore (tutti i giorni Lun-Sab) ----- */
function pwRowCtxMenu(ev, cidx, sidx, oidx) {
  ev.preventDefault();
  _pwShowCtxMenu(ev.clientX, ev.clientY, [
    { label: '📋 Copia settimana (cantieri/attività)', onClick: () => pwCopyRow(cidx, sidx, oidx) },
    { label: '📥 Incolla settimana qui', disabled: !_pwClipRow, onClick: () => pwPasteRow(cidx, sidx, oidx) },
  ]);
  return false;
}

function pwCopyRow(cidx, sidx, oidx) {
  const data = pwGetWeekData();
  const op = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (!op) return;
  const giorni = {};
  for (let d = 0; d < 6; d++) {
    const g = (op.giorni || {})[d] || {};
    giorni[d] = { cantieri: pwCellCantieri(g), attivita: g.attivita || '' };
  }
  _pwClipRow = { giorni };
}

async function pwPasteRow(cidx, sidx, oidx) {
  if (!sbGuardWrite()) return;
  if (!_pwClipRow) return;
  const data = pwGetWeekData();
  const op = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (!op) return;
  op.giorni = {};
  for (let d = 0; d < 6; d++) {
    const src = _pwClipRow.giorni[d] || { cantieri: [], attivita: '' };
    op.giorni[d] = { cantieri: src.cantieri.slice(), attivita: src.attivita };
  }
  await pwSave();
  pwRender();
  pwRefreshMeteoWeek();
}
