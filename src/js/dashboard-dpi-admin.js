/* ===================== GESTIONE DPI DISPONIBILI ===================== */
function renderDpiAdmin() {
  const container = document.getElementById('dpi-admin-section');
  if (!container) return;

  // Mostra solo agli admin
  if (!sbIsAdmin()) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const dpiList = state.dpi_disponibili || [];
  const html = `
    <div class="bg-white border border-yellow-200 rounded-md p-3 mb-3">
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-semibold text-slate-800">⚙ DPI disponibili</h4>
        <span class="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">${dpiList.length} DPI</span>
      </div>
      <div class="mb-2 flex gap-2">
        <input id="dpi-input-new" type="text" placeholder="Aggiungi nuovo DPI..." class="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5">
        <button id="dpi-btn-add" class="text-sm px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700">Aggiungi</button>
      </div>
      <div class="space-y-1">
        ${dpiList.length === 0
          ? '<div class="text-xs text-slate-400 italic py-2">Nessun DPI configurato</div>'
          : dpiList.map((dpi, idx) => `
              <div class="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-100 text-sm">
                <span class="text-slate-700">${esc(dpi)}</span>
                <button class="dpi-btn-remove text-xs text-slate-400 hover:text-red-600" data-idx="${idx}" title="Rimuovi">🗑</button>
              </div>
            `).join('')
        }
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Event handlers
  document.getElementById('dpi-btn-add').onclick = async () => {
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
  document.getElementById('dpi-input-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      document.getElementById('dpi-btn-add').click();
    }
  });
}
