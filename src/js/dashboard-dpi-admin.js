/* ===================== GESTIONE DPI DISPONIBILI ===================== */
function renderDpiAdmin() {
  const filterSection = document.getElementById('dpi-filter-section');
  const listContainer = document.getElementById('dpi-list-container');
  if (!filterSection || !listContainer) return;

  // Mostra solo agli admin
  if (!sbIsAdmin()) {
    filterSection.classList.add('hidden');
    return;
  }
  filterSection.classList.remove('hidden');

  const dpiList = state.dpi_disponibili || [];
  const summary = document.getElementById('dpi-filter-summary');
  if (summary) {
    summary.textContent = dpiList.length === 0 ? 'Nessun DPI' : `${dpiList.length} DPI`;
  }

  const listHtml = dpiList.length === 0
    ? '<div class="text-xs text-slate-400 italic py-2">Nessun DPI configurato</div>'
    : dpiList.map((dpi, idx) => `
        <div class="flex items-center justify-between p-1.5 bg-white rounded border border-yellow-100 text-xs">
          <span class="text-slate-700">${esc(dpi)}</span>
          <button class="dpi-btn-remove text-xs text-slate-400 hover:text-red-600" data-idx="${idx}" title="Rimuovi">🗑</button>
        </div>
      `).join('');

  const listDiv = document.getElementById('dpi-list');
  if (listDiv) listDiv.innerHTML = listHtml;

  // Event handlers
  const btnAdd = document.getElementById('dpi-btn-add');
  if (btnAdd) {
    btnAdd.onclick = async () => {
      const input = document.getElementById('dpi-input-new');
      const value = input.value.trim();
      if (!value) {
        showAlertModal('Inserisci il nome del DPI');
        return;
      }
      if ((state.dpi_disponibili || []).includes(value)) {
        showAlertModal('Questo DPI esiste già');
        return;
      }
      state.dpi_disponibili.push(value);
      input.value = '';
      await saveState('Aggiunto DPI', {dpi: value}, true);
      renderDpiAdmin();
    };
  }

  document.querySelectorAll('.dpi-btn-remove').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx);
      const dpi = state.dpi_disponibili[idx];
      if (!await showConfirmAsync(`Rimuovere il DPI "${dpi}"?`, 'Rimuovi')) return;

      // Rimuovi dai DPI disponibili
      state.dpi_disponibili.splice(idx, 1);

      // Rimuovi dalle commesse che lo usano
      Object.keys(state.commesse_attive_meta || {}).forEach(nome => {
        const meta = state.commesse_attive_meta[nome];
        if (meta.dpi_richiesti && meta.dpi_richiesti.includes(dpi)) {
          meta.dpi_richiesti = meta.dpi_richiesti.filter(d => d !== dpi);
        }
      });

      await saveState('Rimosso DPI', {dpi}, true);
      renderDpiAdmin();
      renderCommesse();
    };
  });

  // Enter per aggiungere
  const inputNew = document.getElementById('dpi-input-new');
  if (inputNew) {
    inputNew.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        document.getElementById('dpi-btn-add').click();
      }
    });
  }
}
