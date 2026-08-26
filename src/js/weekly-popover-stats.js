/* ===== POPOVER STATISTICHE PIANIFICAZIONE ===== */
function pwToggleStatPopover(key, cardEl) {
  const existing = document.getElementById('pw-stat-popover');

  // Stesso popover già aperto → chiudi
  if (existing && existing.dataset.key === key) { existing.remove(); return; }
  if (existing) existing.remove();

  const banner    = document.getElementById('pw-stats-banner');
  const statsData = banner && banner._statsData;
  if (!statsData) return;

  const cfgMap = {
    pianificati:   { title: 'Pianificati questa settimana', cls: 'blu'    },
    liberi:        { title: 'Liberi / disponibili',         cls: 'verde'  },
    inFerie:       { title: 'In ferie o permesso',          cls: 'rosso'  },
    suPiuCommesse: { title: 'Su più commesse',              cls: 'giallo' },
  };
  const cfg   = cfgMap[key];
  const items = statsData[key] || [];

  function renderRow(it) {
    const tags = (it.commesse || []).map(c =>
      `<span class="psp-tag ${cfg.cls}" title="${c}">${c}</span>`).join('');
    const giorni = (it.giorni || []).map(g =>
      `<span class="psp-tag rosso">${g}</span>`).join('');
    const extra = tags || giorni;
    return `<div class="psp-row">
      <span class="psp-nome">${esc(it.nome)}</span>
      ${extra ? `<span class="psp-tags">${extra}</span>` : ''}
    </div>`;
  }

  const rect = cardEl.getBoundingClientRect();
  const pop  = document.createElement('div');
  pop.id = 'pw-stat-popover';
  pop.className = 'pw-popover';
  pop.dataset.key = key;
  pop.style.cssText = [
    'position:fixed',
    `top:${rect.bottom + 6}px`,
    `left:${Math.min(rect.left, window.innerWidth - 430)}px`,
    'z-index:9999',
  ].join(';');

  pop.innerHTML = `
    <div class="pw-popover-header">
      <span class="pw-popover-title">${cfg.title}</span>
      <span class="pw-popover-count">${items.length}</span>
    </div>
    <div class="pw-popover-body">
      ${items.length === 0
        ? '<div class="pw-popover-empty">Nessun operatore</div>'
        : items.map(renderRow).join('')}
    </div>`;

  document.body.appendChild(pop);

  // Chiudi cliccando fuori
  setTimeout(() => {
    document.addEventListener('click', function _pspClose(e) {
      if (!pop.contains(e.target) && e.target !== cardEl && !cardEl.contains(e.target)) {
        pop.remove();
        document.removeEventListener('click', _pspClose);
      }
    });
  }, 0);
}

/* ----- Ricerca operatore nella griglia ----- */
let _pwSearchTerm = '';

function pwSearchOp(term) {
  _pwSearchTerm = (term || '').trim().toLowerCase();

  const clearBtn = document.getElementById('pw-search-op-clear');
  const infoEl   = document.getElementById('pw-search-op-info');
  if (clearBtn) clearBtn.classList.toggle('hidden', !_pwSearchTerm);

  // Rimuovi highlight se ricerca vuota
  if (!_pwSearchTerm) {
    document.querySelectorAll('.pw-op-row').forEach(r => {
      r.classList.remove('search-match', 'search-dim');
    });
    document.querySelectorAll('.pw-commessa-block').forEach(b => {
      b.classList.remove('search-no-match');
    });
    if (infoEl) { infoEl.textContent = ''; infoEl.classList.add('hidden'); }
    return;
  }

  let totalMatch = 0;
  let commesseConMatch = 0;

  document.querySelectorAll('.pw-commessa-block').forEach(block => {
    let matchInBlock = 0;
    block.querySelectorAll('.pw-op-row').forEach(row => {
      // Legge il nome dall'op-trigger-label dentro la riga
      const labelEl = row.querySelector('.op-trigger-label');
      const nome = labelEl ? labelEl.textContent.trim().toLowerCase() : '';
      const isMatch = nome && nome !== '— scegli —' && nome.includes(_pwSearchTerm);

      row.classList.toggle('search-match', isMatch);
      row.classList.toggle('search-dim',  !isMatch);

      if (isMatch) { matchInBlock++; totalMatch++; }
    });

    const hasOps = block.querySelectorAll('.pw-op-row').length > 0;
    block.classList.toggle('search-no-match', hasOps && matchInBlock === 0);
    if (matchInBlock > 0) commesseConMatch++;
  });

  if (infoEl) {
    infoEl.classList.remove('hidden');
    if (totalMatch === 0) {
      infoEl.textContent = 'Nessun operatore trovato';
      infoEl.style.color = 'var(--red)';
    } else {
      infoEl.textContent = `${totalMatch} risultat${totalMatch === 1 ? 'o' : 'i'} in ${commesseConMatch} commess${commesseConMatch === 1 ? 'a' : 'e'}`;
      infoEl.style.color = 'var(--accent)';
    }
  }
}

/* ----- Handlers CRUD pianificazione ----- */
function pwTitleCase(str) {
  return str.replace(/\S+/g, w => w.charAt(0).toLocaleUpperCase('it-IT') + w.slice(1).toLocaleLowerCase('it-IT'));
}

async function pwUpdateCell(inp) {
  const { cidx, sidx, oidx, day, field } = inp.dataset;
  const data = pwGetWeekData();
  const op = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (!op) return;
  if (!op.giorni) op.giorni = {};
  if (!op.giorni[day]) op.giorni[day] = {};
  const value = pwTitleCase(inp.value.trim());
  inp.value = value;
  op.giorni[day][field] = value;
  await pwSave();
}

async function pwUpdateOpNome(sel) {
  const { cidx, sidx, oidx } = sel.dataset;
  const data = pwGetWeekData();
  const op = data[cidx]?.squadre[sidx]?.operatori[oidx];
  if (op) { op.nome = sel.value; await pwSave(); pwRender(); }
}

