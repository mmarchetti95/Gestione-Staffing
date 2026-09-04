/* ===================== DPI: CATALOGO, ASSEGNAZIONI E SCADENZE ===================== */
/* Mappa i DPI consegnati agli operatori con data di assegnazione e data di scadenza
   (entrambe facoltative) e li confronta con i DPI richiesti dalle commesse.

   MODELLO DATI (tutto nel dominio "core", nessuna modifica allo schema Supabase):
   - state.dpi_disponibili   catalogo: elenco ordinato dei nomi. E' anche l'elenco delle
                             colonne della matrice e delle caselle "DPI richiesti".
   - state.dpi_catalogo      { "<nome DPI>": { durata_mesi: N } } — durata di validita',
                             facoltativa, usata solo per precompilare la scadenza.
   - op.dpi                  lista piatta dei nomi posseduti (filtri, export, matching).
   - op.dpi_dett             { "<nome DPI>": { ass, scad, taglia, fonte } }, date ISO.
   - c.dpi_richiesti         sulle commesse pipeline e in commesse_attive_meta.

   Si tiene UNA sola voce per operatore x DPI: e' il DPI attualmente in dotazione. Sostituendo
   un DPI se ne aggiornano le date, non se ne aggiunge una seconda: lo storico delle consegne
   passate non e' un requisito e raddoppierebbe la complessita' di matrice, filtri ed export.

   Un DPI senza data di scadenza vale "senza scadenza nota" e NON viene mai trattato come
   scaduto (stessa scelta fatta per gli attestati): le date sono facoltative per costruzione,
   quindi lasciarle vuote non deve generare falsi allarmi.

   Le funzioni di calcolo date generiche (attOggiIso, attGiorniAllaScadenza, attClasseStato,
   attDataBreve) sono condivise con dashboard-attestati.js e non vengono riscritte qui. */

/* ------------------------------------------------------------ catalogo e scadenze ----- */

/* Durata di validita' in mesi di un tipo di DPI, o 0 se non e' stata dichiarata. */
function dpiDurataMesi(nome) {
  const voce = (state.dpi_catalogo || {})[nome];
  const n = voce ? parseInt(voce.durata_mesi, 10) : 0;
  return isNaN(n) || n <= 0 ? 0 : n;
}

/* Scadenza suggerita = data di assegnazione + durata del DPI in mesi.
   Il giorno viene limitato all'ultimo del mese di arrivo (31/01 + 1 mese = 28/02, non 03/03,
   che e' quello che farebbe l'aritmetica nativa di Date). Nessuna scadenza se il DPI non ha
   una durata dichiarata: e' un suggerimento, la data resta comunque modificabile a mano. */
function dpiScadenzaDaAssegnazione(nome, assIso) {
  const mesi = dpiDurataMesi(nome);
  if (!mesi || !assIso) return '';
  const p = assIso.split('-');
  const anno = parseInt(p[0], 10), mese = parseInt(p[1], 10) - 1, giorno = parseInt(p[2], 10);
  if (isNaN(anno) || isNaN(mese) || isNaN(giorno)) return '';
  const ultimoDelMese = new Date(Date.UTC(anno, mese + mesi + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(anno, mese + mesi, Math.min(giorno, ultimoDelMese)));
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* Stato di una singola voce { ass, scad }: 'valido' | 'scadenza' | 'scaduto' | 'senza-data'. */
function dpiStatoVoce(voce) {
  if (!voce || !voce.scad) return 'senza-data';
  const gg = attGiorniAllaScadenza(voce.scad);
  if (gg === null) return 'senza-data';
  if (gg < 0) return 'scaduto';
  if (gg <= DPI_PREAVVISO_GG) return 'scadenza';
  return 'valido';
}

/* Dettaglio di un DPI per un operatore, o null se non lo ha in dotazione. */
function dpiVoceOperatore(op, nome) {
  if (!op) return null;
  const dett = op.dpi_dett || {};
  if (dett[nome]) return dett[nome];
  if ((op.dpi || []).includes(nome)) return { ass: '', scad: '', fonte: 'manuale' };
  return null;
}

function dpiStatoOperatore(op, nome) {
  const voce = dpiVoceOperatore(op, nome);
  if (!voce) return 'assente';
  return dpiStatoVoce(voce);
}

/* Un DPI "copre" un requisito di commessa se e' in dotazione e non scaduto. */
function dpiIsValido(op, nome) {
  const st = dpiStatoOperatore(op, nome);
  return st === 'valido' || st === 'scadenza' || st === 'senza-data';
}

/* Nomi dei DPI richiesti che l'operatore non ha (o ha scaduti): sono i DPI da consegnare. */
function dpiNonCoperti(op, richiesti) {
  return (richiesti || []).filter(d => !dpiIsValido(op, d));
}

function dpiTooltipVoce(nome, voce) {
  if (!voce) return nome + ' — non consegnato';
  const parti = [nome];
  if (voce.taglia) parti.push('taglia ' + voce.taglia);
  if (voce.ass) parti.push('consegnato il ' + fmtDate(voce.ass));
  if (voce.scad) {
    const gg = attGiorniAllaScadenza(voce.scad);
    if (dpiStatoVoce(voce) === 'scaduto') parti.push('DA SOSTITUIRE dal ' + fmtDate(voce.scad) + ' (' + Math.abs(gg) + ' giorni fa)');
    else parti.push('da sostituire entro il ' + fmtDate(voce.scad) + ' (tra ' + gg + ' giorni)');
  } else {
    parti.push('nessuna scadenza indicata');
  }
  return parti.join(' · ');
}

/* ------------------------------------------------- requisiti dalle commesse ----- */

/* DPI richiesti dalle commesse su cui l'operatore risulta impegnato: assegnazioni sulle
   commesse in partenza piu' righe di staffing sulle commesse attive. Serve a distinguere
   "non ha il casco" (irrilevante) da "non ha il casco e gli serve" (da consegnare). */
function dpiRichiestiPerOperatore(op) {
  const out = new Set();
  if (!op) return out;
  (state.assegnazioni || []).forEach(a => {
    if (a.operatore_id !== op.id) return;
    const c = (state.pipeline || []).find(p => p.id === a.commessa_id);
    (c && c.dpi_richiesti || []).forEach(d => out.add(d));
  });
  const nome = op.nome_esteso || op.nome || '';
  (state.staffing || []).forEach(r => {
    if (r.risorsa !== nome) return;
    if (!(r.mesi || []).some(v => Number(v) > 0)) return;
    const meta = (state.commesse_attive_meta || {})[r.commessa] || {};
    (meta.dpi_richiesti || []).forEach(d => out.add(d));
  });
  return out;
}

/* Tutte le voci in scadenza o scadute degli operatori del pool, ordinate per urgenza. */
function dpiScadenzeOperatori(giorniPreavviso) {
  const soglia = giorniPreavviso === undefined ? DPI_PREAVVISO_GG : giorniPreavviso;
  const out = [];
  getOperatoriAttivi().forEach(op => {
    const dett = op.dpi_dett || {};
    Object.keys(dett).forEach(nome => {
      const voce = dett[nome];
      if (!voce || !voce.scad) return;
      const gg = attGiorniAllaScadenza(voce.scad);
      if (gg === null || gg > soglia) return;
      out.push({ op: op, nome: nome, scad: voce.scad, giorni: gg, stato: gg < 0 ? 'scaduto' : 'scadenza' });
    });
  });
  out.sort((a, b) => a.giorni - b.giorni);
  return out;
}

/* -------------------------------------------------------- scheda operatore ----- */

/* Riga della griglia DPI nella scheda operatore: spunta, nome, taglia, data di assegnazione
   e data di scadenza, entrambe facoltative. Costruita per concatenazione (niente template
   literal annidati dentro quello del modal). */
function dpiRigaModaleOperatore(op, nome) {
  const voce = dpiVoceOperatore(op, nome) || {};
  const posseduto = (op.dpi || []).includes(nome) || !!(op.dpi_dett || {})[nome];
  const mesi = dpiDurataMesi(nome);
  const tipAss = mesi
    ? 'Data di consegna — validità ' + mesi + (mesi === 1 ? ' mese' : ' mesi') + ', la scadenza viene precompilata'
    : 'Data di consegna (facoltativa)';
  const clsScad = dpiStatoVoce(voce) === 'scaduto' ? ' border-red-400 text-red-600 font-semibold' : '';
  return '<div class="mo-dpi-riga flex items-center gap-1.5 text-xs hover:bg-white rounded px-1 py-0.5">' +
    '<input type="checkbox" class="mo-dpi" value="' + esc(nome) + '"' + (posseduto ? ' checked' : '') + '>' +
    '<span class="flex-1 truncate" title="' + esc(nome) + '">' + esc(nome) + '</span>' +
    '<input type="text" class="mo-dpi-taglia w-[54px] border border-slate-300 rounded px-1 py-0.5 text-[11px]" ' +
      'maxlength="10" placeholder="taglia" value="' + esc(voce.taglia || '') + '" title="Taglia (facoltativa)">' +
    '<input type="date" class="mo-dpi-ass w-[112px] border border-slate-300 rounded px-1 py-0.5 text-[11px]" ' +
      'data-dpi="' + esc(nome) + '" value="' + esc(voce.ass || '') + '" title="' + esc(tipAss) + '">' +
    '<input type="date" class="mo-dpi-scad w-[112px] border border-slate-300 rounded px-1 py-0.5 text-[11px]' + clsScad + '" ' +
      'value="' + esc(voce.scad || '') + '" title="Data di scadenza (facoltativa): precompilata dalla durata del DPI, sempre modificabile">' +
  '</div>';
}

/* Aggancia i comportamenti della griglia DPI del modal operatore (chiamata da
   openOperatoreModal dopo aver iniettato l'HTML). */
function dpiBindModaleOperatore() {
  const btnAll = document.getElementById('mo-dpi-all');
  const btnNone = document.getElementById('mo-dpi-none');
  if (btnAll) btnAll.onclick = () => document.querySelectorAll('.mo-dpi').forEach(x => x.checked = true);
  if (btnNone) btnNone.onclick = () => document.querySelectorAll('.mo-dpi').forEach(x => x.checked = false);

  // Compilando la data di consegna il DPI si spunta da solo e, se il campo scadenza e'
  // ancora vuoto e il DPI ha una durata dichiarata, la scadenza si precompila. Non si
  // sovrascrive mai una scadenza gia' scritta: quella e' un dato, non un suggerimento.
  document.querySelectorAll('.mo-dpi-ass').forEach(inp => {
    inp.addEventListener('change', () => {
      const riga = inp.closest('.mo-dpi-riga');
      if (!riga) return;
      const cb = riga.querySelector('.mo-dpi');
      if (inp.value && cb) cb.checked = true;
      const out = riga.querySelector('.mo-dpi-scad');
      if (out && !out.value) out.value = dpiScadenzaDaAssegnazione(inp.dataset.dpi, inp.value);
    });
  });
  // Anche taglia e scadenza da sole implicano il possesso: evita la combinazione
  // incoerente "campo valorizzato, spunta no".
  document.querySelectorAll('.mo-dpi-scad, .mo-dpi-taglia').forEach(inp => {
    inp.addEventListener('change', () => {
      const riga = inp.closest('.mo-dpi-riga');
      const cb = riga && riga.querySelector('.mo-dpi');
      if (inp.value && cb) cb.checked = true;
    });
  });
}

/* Legge la griglia DPI del modal operatore. Ritorna { dpi, dett, errore }:
   `errore` valorizzato = dati incoerenti, il chiamante non deve salvare. */
function dpiLeggiModaleOperatore(op) {
  const dettPrec = (op && op.dpi_dett) || {};
  const catalogo = state.dpi_disponibili || [];
  const dett = {};
  // Voci per DPI non piu' in catalogo: il modal non le disegna, quindi vanno riportate
  // a mano o un salvataggio le cancellerebbe silenziosamente.
  Object.keys(dettPrec).forEach(n => { if (!catalogo.includes(n)) dett[n] = dettPrec[n]; });
  const fuoriCatalogo = Object.keys(dett);

  let errore = '';
  document.querySelectorAll('.mo-dpi-riga').forEach(riga => {
    const cb = riga.querySelector('.mo-dpi');
    if (!cb || !cb.checked) return;
    const nome = cb.value;
    const ass = (riga.querySelector('.mo-dpi-ass') || {}).value || '';
    const scad = (riga.querySelector('.mo-dpi-scad') || {}).value || '';
    const taglia = ((riga.querySelector('.mo-dpi-taglia') || {}).value || '').trim();
    if (ass && scad && scad < ass) {
      errore = 'DPI "' + nome + '": la data di scadenza non può essere precedente alla data di consegna.';
      return;
    }
    const voce = { ass: ass, scad: scad, fonte: 'manuale' };
    if (taglia) voce.taglia = taglia;
    dett[nome] = voce;
  });

  // Lista piatta in ordine di catalogo, con in coda le voci fuori catalogo conservate sopra.
  const dpi = catalogo.filter(n => dett[n]).concat(fuoriCatalogo);
  return { dpi: dpi, dett: dett, errore: errore };
}

/* ------------------------------------------------------------ matrice DPI ----- */

const _dpiFiltri = { search: '', tipo: '', stato: '', ordine: 'nome' };

function dpiSetFiltro(chiave, valore) {
  _dpiFiltri[chiave] = valore;
  renderDpi();
}

/* Righe della matrice: solo operatori del pool (i DPI si consegnano a chi lavora, non
   esiste un file aziendale da importare come per gli attestati). */
function dpiRigheMatrice() {
  return getOperatoriAttivi().map(op => {
    const dett = op.dpi_dett || {};
    const voci = {};
    (op.dpi || []).forEach(d => { voci[d] = dett[d] || { ass: '', scad: '', fonte: 'manuale' }; });
    Object.keys(dett).forEach(d => { voci[d] = dett[d]; });
    const richiesti = dpiRichiestiPerOperatore(op);
    return {
      nome: op.nome_esteso || op.nome || '',
      op: op,
      voci: voci,
      richiesti: richiesti,
      daConsegnare: dpiNonCoperti(op, [...richiesti]),
    };
  }).filter(r => r.nome);
}

function renderDpi() {
  const box = document.getElementById('dpi-matrix');
  const badge = document.getElementById('dpi-summary-badges');

  const righe = dpiRigheMatrice();
  const scadenze = dpiScadenzeOperatori();
  const nScaduti = scadenze.filter(s => s.stato === 'scaduto').length;
  const nInScadenza = scadenze.length - nScaduti;
  const nDaConsegnare = righe.reduce((s, r) => s + r.daConsegnare.length, 0);
  if (badge) {
    let b = '';
    if (nScaduti > 0) b += '<span class="att-pill ko">' + nScaduti + ' da sostituire</span>';
    if (nInScadenza > 0) b += '<span class="att-pill warn">' + nInScadenza + ' in scadenza</span>';
    if (nDaConsegnare > 0) b += '<span class="att-pill warn">' + nDaConsegnare + ' da consegnare</span>';
    if (!b) b = '<span class="att-pill ok">nessuna scadenza entro ' + DPI_PREAVVISO_GG + ' giorni</span>';
    badge.innerHTML = b;
  }

  if (!box) return;
  // Sezione collassata: niente render della matrice, come per gli attestati.
  const det = document.getElementById('dpi-details');
  if (det && !det.open) { box.innerHTML = ''; return; }

  const colonne = state.dpi_disponibili || [];

  // Tendina dei tipi, ricostruita ad ogni render perche' il catalogo si modifica qui accanto
  const selTipo = document.getElementById('dpi-filter-tipo');
  if (selTipo) {
    const sel = _dpiFiltri.tipo;
    selTipo.innerHTML = '<option value="">Tutti i DPI</option>' +
      colonne.map(d => '<option value="' + esc(d) + '"' + (d === sel ? ' selected' : '') + '>' + esc(d) + '</option>').join('');
  }

  const q = (_dpiFiltri.search || '').trim().toLowerCase();
  const colFiltro = _dpiFiltri.tipo && colonne.includes(_dpiFiltri.tipo) ? _dpiFiltri.tipo : '';

  const visibili = righe.filter(r => {
    if (q && !r.nome.toLowerCase().includes(q)) return false;
    if (colFiltro && !r.voci[colFiltro] && !r.richiesti.has(colFiltro)) return false;
    if (_dpiFiltri.stato) {
      const stati = Object.keys(r.voci).map(n => dpiStatoVoce(r.voci[n]));
      if (_dpiFiltri.stato === 'scaduto' && !stati.includes('scaduto')) return false;
      if (_dpiFiltri.stato === 'scadenza' && !stati.includes('scadenza')) return false;
      if (_dpiFiltri.stato === 'manca' && r.daConsegnare.length === 0) return false;
      if (_dpiFiltri.stato === 'nessuno' && stati.length > 0) return false;
    }
    return true;
  });

  // Scadenza piu' vicina della riga, per l'ordinamento "per urgenza"
  function dpiUrgenzaRiga(r) {
    let best = null;
    Object.keys(r.voci).forEach(n => {
      const gg = attGiorniAllaScadenza(r.voci[n].scad);
      if (gg === null) return;
      if (best === null || gg < best) best = gg;
    });
    return best === null ? 999999 : best;
  }

  if (_dpiFiltri.ordine === 'scadenza') visibili.sort((a, b) => dpiUrgenzaRiga(a) - dpiUrgenzaRiga(b) || a.nome.localeCompare(b.nome));
  else visibili.sort((a, b) => a.nome.localeCompare(b.nome));

  const countEl = document.getElementById('dpi-count');
  if (countEl) countEl.textContent = visibili.length + ' operatori';

  if (colonne.length === 0) {
    box.innerHTML = '<div class="text-center text-sm text-slate-400 py-6">Catalogo DPI vuoto: aggiungi i tipi di DPI da “Gestione catalogo DPI” qui sopra.</div>';
    return;
  }
  if (visibili.length === 0) {
    box.innerHTML = '<div class="text-center text-sm text-slate-400 py-6">Nessun operatore corrisponde ai filtri.</div>';
    return;
  }

  const mostrate = colFiltro ? [colFiltro] : colonne;
  // Totale per colonna: quanti lo hanno in dotazione e non scaduto
  const totali = mostrate.map(col => visibili.filter(r => r.voci[col] && dpiStatoVoce(r.voci[col]) !== 'scaduto').length);

  let html = '<table class="att-matrix"><thead><tr>';
  html += '<th class="att-nome">Operatore</th>';
  mostrate.forEach((col, i) => {
    const mesi = dpiDurataMesi(col);
    const tip = col + (mesi ? ' — durata ' + mesi + (mesi === 1 ? ' mese' : ' mesi') : ' — nessuna durata dichiarata');
    html += '<th title="' + esc(tip) + '"><div class="att-th-lbl">' + esc(col.length > 18 ? col.substring(0, 17) + '…' : col) + '</div>' +
      '<div class="att-th-sub">' + totali[i] + (mesi ? ' · ' + mesi + 'm' : '') + '</div></th>';
  });
  html += '<th title="DPI in dotazione non scaduti / totale consegnati">In regola</th>';
  html += '<th title="DPI richiesti dalle commesse dell’operatore e non ancora consegnati">Da consegnare</th></tr></thead><tbody>';

  visibili.forEach(r => {
    const nomiVoci = Object.keys(r.voci);
    const nVal = nomiVoci.filter(n => dpiStatoVoce(r.voci[n]) !== 'scaduto').length;
    html += '<tr><td class="att-nome">' +
      '<button class="dpi-edit-op text-slate-400 hover:text-teal-700" data-opid="' + esc(r.op.id) + '" title="Apri la scheda operatore per assegnare o aggiornare i DPI">✎</button> ' +
      esc(r.nome) + '</td>';
    mostrate.forEach(col => {
      const voce = r.voci[col];
      if (!voce) {
        html += r.richiesti.has(col)
          ? '<td class="dpi-manca" title="' + esc(col + ' — richiesto da una commessa assegnata, non ancora consegnato') + '">!</td>'
          : '<td class="att-vuoto">·</td>';
        return;
      }
      const st = dpiStatoVoce(voce);
      const taglia = voce.taglia ? '<span class="dpi-taglia">' + esc(voce.taglia) + '</span>' : '';
      html += '<td title="' + esc(dpiTooltipVoce(col, voce)) + '"><span class="att-cell">' +
        '<span class="att-dot ' + attClasseStato(st) + '"></span>' +
        '<span>' + (voce.scad ? attDataBreve(voce.scad) : '—') + '</span>' + taglia + '</span></td>';
    });
    html += '<td class="att-tot">' + nVal + '/' + nomiVoci.length + '</td>';
    html += '<td class="att-tot">' + (r.daConsegnare.length > 0
      ? '<span class="dpi-manca" title="' + esc(r.daConsegnare.join(', ')) + '">' + r.daConsegnare.length + '</span>'
      : '—') + '</td></tr>';
  });
  html += '</tbody></table>';
  box.innerHTML = html;

  box.querySelectorAll('.dpi-edit-op').forEach(b => {
    b.onclick = () => openOperatoreModal(b.dataset.opid);
  });
}

/* Chiamata dall'attributo ontoggle del <details>: alla prima apertura la matrice non
   e' ancora stata costruita. */
function dpiToggleSezione() {
  renderDpi();
}

/* ------------------------------------------------------ gestione catalogo ----- */

function renderDpiCatalogo() {
  const listDiv = document.getElementById('dpi-list');
  if (!listDiv) return;

  const dpiList = state.dpi_disponibili || [];
  const summary = document.getElementById('dpi-cat-summary');
  if (summary) summary.textContent = dpiList.length === 0 ? '(vuoto)' : '(' + dpiList.length + ')';

  listDiv.innerHTML = dpiList.length === 0
    ? '<div class="text-xs text-slate-400 italic py-2">Nessun DPI in catalogo</div>'
    : dpiList.map((dpi, idx) => {
        const mesi = dpiDurataMesi(dpi);
        return '<div class="flex items-center gap-2 p-1.5 bg-white rounded border border-yellow-100 text-xs">' +
          '<span class="flex-1 truncate text-slate-700" title="' + esc(dpi) + '">' + esc(dpi) + '</span>' +
          '<input type="number" min="1" max="600" class="dpi-durata w-[64px] border border-slate-300 rounded px-1 py-0.5 text-[11px]" ' +
            'data-idx="' + idx + '" value="' + (mesi || '') + '" placeholder="mesi" title="Durata di validità in mesi (facoltativa)">' +
          '<button class="dpi-btn-remove text-slate-400 hover:text-red-600" data-idx="' + idx + '" title="Rimuovi dal catalogo">🗑</button>' +
        '</div>';
      }).join('');

  const btnAdd = document.getElementById('dpi-btn-add');
  if (btnAdd) {
    btnAdd.onclick = async () => {
      if (!sbGuardWrite()) return;
      const input = document.getElementById('dpi-input-new');
      const inputDurata = document.getElementById('dpi-input-durata');
      const value = input.value.trim();
      if (!value) { showAlertModal('Inserisci il nome del DPI'); return; }
      if ((state.dpi_disponibili || []).includes(value)) { showAlertModal('Questo DPI esiste già'); return; }
      const mesi = parseInt(inputDurata ? inputDurata.value : '', 10);
      if (!state.dpi_disponibili) state.dpi_disponibili = [];
      state.dpi_disponibili.push(value);
      if (!isNaN(mesi) && mesi > 0) {
        if (!state.dpi_catalogo) state.dpi_catalogo = {};
        state.dpi_catalogo[value] = { durata_mesi: mesi };
      }
      input.value = '';
      if (inputDurata) inputDurata.value = '';
      await saveState('Aggiunto DPI', { dpi: value, durata_mesi: isNaN(mesi) ? null : mesi }, true);
      renderDpiCatalogo();
      renderDpi();
    };
  }

  listDiv.querySelectorAll('.dpi-durata').forEach(inp => {
    inp.onchange = async () => {
      if (!sbGuardWrite()) return;
      const dpi = (state.dpi_disponibili || [])[parseInt(inp.dataset.idx, 10)];
      if (!dpi) return;
      const mesi = parseInt(inp.value, 10);
      if (!state.dpi_catalogo) state.dpi_catalogo = {};
      if (isNaN(mesi) || mesi <= 0) delete state.dpi_catalogo[dpi];
      else state.dpi_catalogo[dpi] = { durata_mesi: mesi };
      // La durata cambia solo le scadenze SUGGERITE d'ora in avanti: quelle gia' scritte
      // sulle schede operatore sono un dato e non vengono ricalcolate a posteriori.
      await saveState('Modificata durata DPI', { dpi: dpi, durata_mesi: isNaN(mesi) ? null : mesi }, true);
      renderDpiCatalogo();
      renderDpi();
    };
  });

  listDiv.querySelectorAll('.dpi-btn-remove').forEach(btn => {
    btn.onclick = async () => {
      if (!sbGuardWrite()) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const dpi = (state.dpi_disponibili || [])[idx];
      if (!dpi) return;
      const conDotazione = getOperatoriAttivi().filter(op => dpiVoceOperatore(op, dpi)).length;
      const avviso = conDotazione > 0
        ? '\n\nAttenzione: risulta in dotazione a ' + conDotazione + ' operator' + (conDotazione === 1 ? 'e' : 'i') +
          '; la relativa assegnazione (date e taglia) verrà eliminata.'
        : '';
      if (!await showConfirmAsync('Rimuovere il DPI "' + dpi + '" dal catalogo?' + avviso, 'Rimuovi')) return;

      state.dpi_disponibili.splice(idx, 1);
      if (state.dpi_catalogo) delete state.dpi_catalogo[dpi];

      // Rimuovi dai requisiti delle commesse attive...
      Object.keys(state.commesse_attive_meta || {}).forEach(nome => {
        const meta = state.commesse_attive_meta[nome];
        if (meta.dpi_richiesti && meta.dpi_richiesti.includes(dpi)) {
          meta.dpi_richiesti = meta.dpi_richiesti.filter(d => d !== dpi);
        }
      });
      // ...e da quelle in partenza
      (state.pipeline || []).forEach(c => {
        if (c.dpi_richiesti && c.dpi_richiesti.includes(dpi)) {
          c.dpi_richiesti = c.dpi_richiesti.filter(d => d !== dpi);
        }
      });
      // ...e dalle dotazioni degli operatori
      (state.operatori || []).forEach(op => {
        if (op.dpi && op.dpi.includes(dpi)) op.dpi = op.dpi.filter(d => d !== dpi);
        if (op.dpi_dett && op.dpi_dett[dpi]) delete op.dpi_dett[dpi];
      });

      await saveState('Rimosso DPI', { dpi: dpi, operatori_coinvolti: conDotazione }, true);
      renderAll();
    };
  });

  // Enter per aggiungere (sui due campi del form)
  ['dpi-input-new', 'dpi-input-durata'].forEach(idCampo => {
    const el = document.getElementById(idCampo);
    if (el) el.onkeydown = e => { if (e.key === 'Enter') document.getElementById('dpi-btn-add').click(); };
  });
}

/* -------------------------------------------------------------------- export ----- */

/* Export in formato lungo (una riga per operatore x DPI), come per gli attestati: piu'
   comodo della matrice per filtrare e ordinare in Excel su scadenze e consegne. */
function exportDpiXlsx() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }
  const header = ['Operatore', 'DPI', 'Richiesto da commessa', 'Taglia', 'Data consegna', 'Data scadenza', 'Stato', 'Giorni alla scadenza'];
  const etichettaStato = { valido: 'Valido', scadenza: 'In scadenza', scaduto: 'Da sostituire', 'senza-data': 'Scadenza non indicata' };
  const righe = [header];
  dpiRigheMatrice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach(r => {
      const nomi = Object.keys(r.voci).sort();
      nomi.forEach(n => {
        const v = r.voci[n];
        const gg = attGiorniAllaScadenza(v.scad);
        righe.push([r.nome, n, r.richiesti.has(n) ? 'Sì' : 'No', v.taglia || '', v.ass || '', v.scad || '',
          etichettaStato[dpiStatoVoce(v)] || '', gg === null ? '' : gg]);
      });
      // I DPI richiesti e mai consegnati non hanno una voce da esportare: senza queste
      // righe l'export non direbbe cosa manca, che e' meta' del motivo per cui lo si apre.
      r.daConsegnare.filter(d => !r.voci[d]).forEach(d => {
        righe.push([r.nome, d, 'Sì', '', '', '', 'Da consegnare', '']);
      });
      if (nomi.length === 0 && r.daConsegnare.length === 0) righe.push([r.nome, '', 'No', '', '', '', 'Nessun DPI', '']);
    });
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws['!cols'] = [{ wch: 28 }, { wch: 26 }, { wch: 20 }, { wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 20 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DPI');
  XLSX.writeFile(wb, 'dpi_operatori_' + attOggiIso() + '.xlsx');
}
