/* ===================== COMMIT CELLE INLINE ===================== */
/* Gestisce la validazione e il salvataggio di una cella inline della griglia staffing.
   Aggiorna lo stato e ricalcola solo il totale riga + il box fabbisogno,
   senza un re-render completo (per non interrompere l'editing). */
async function _commitInlineCell(inp) {
  const staffingIdx = parseInt(inp.dataset.idx);
  const meseIdx     = parseInt(inp.dataset.mese);
  const gl          = parseInt(inp.dataset.gl) || 20;
  const rawVal      = inp.value.trim();

  // Vuoto = 0
  const nuovoValore = rawVal === '' ? 0 : parseFloat(rawVal);

  // Validazione: numero valido
  if (isNaN(nuovoValore) || nuovoValore < 0) {
    inp.classList.add('over-limit');
    // Mostriamo alert non bloccante usando un div temporaneo
    _showInlineAlert(inp, `Valore non valido — inserisci un numero ≥ 0.`);
    inp.value = Number(state.staffing[staffingIdx]?.mesi[meseIdx]) || '';
    inp.classList.remove('over-limit');
    return;
  }

  // Validazione: > giorni lavorativi = alert ma si può forzare
  if (nuovoValore > gl) {
    const conferma = await showConfirmAsync(
      `⚠ Attenzione\n${nuovoValore} giorni-uomo supera i ${gl} giorni lavorativi di ${MESI_LONG[meseIdx]}.\nQuesto porterà l'operatore oltre il 100% di saturazione per quel mese.\nConfermare comunque?`
    );
    if (!conferma) {
      // ripristina il valore precedente
      inp.value = Number(state.staffing[staffingIdx]?.mesi[meseIdx]) || '';
      inp.classList.remove('over-limit', 'modified');
      return;
    }
  }

  // Nessuna modifica reale
  const vecchio = Number(state.staffing[staffingIdx]?.mesi[meseIdx]) || 0;
  if (nuovoValore === vecchio) {
    inp.classList.remove('modified');
    return;
  }

  // Applico la modifica allo stato
  const r = state.staffing[staffingIdx];
  if (!r) return;
  r.mesi[meseIdx] = nuovoValore;

  // Se tutta la riga è a zero, la rimuovo
  if (r.mesi.every(v => !v)) {
    const confDel = await showConfirmAsync(`Tutti i giorni di "${r.risorsa}" su "${r.commessa}" sono ora 0.\nRimuovere l'intera riga?`, 'Rimuovi riga');
    if (confDel) {
      state.staffing.splice(staffingIdx, 1);
      ricalcolaAllocOperatori();
      await saveState();
      renderAll(); // serve un render completo perché la riga sparisce
      return;
    } else {
      // Ripristina l'ultimo valore diverso da zero
      r.mesi[meseIdx] = vecchio;
      inp.value = vecchio || '';
      inp.classList.remove('modified');
      return;
    }
  }

  ricalcolaAllocOperatori();
  await saveState();

  // Aggiornamento visivo parziale: solo totale riga e box fabbisogno
  // (evita di fare renderAll() che farebbe perdere il focus)
  inp.classList.remove('modified', 'over-limit');
  // Colore cella aggiornato
  if (nuovoValore > gl) {
    inp.classList.add('over-limit');
  } else if (nuovoValore > 0) {
    inp.style.fontWeight = '600';
    inp.style.color = '#1e293b';
  } else {
    inp.style.fontWeight = '';
    inp.style.color = '#94a3b8';
  }
  // Aggiorna il totale di riga
  const totCell = document.querySelector(`.row-total[data-idx="${staffingIdx}"]`);
  if (totCell) {
    const newTot = r.mesi.reduce((s,v)=>s+(Number(v)||0),0);
    totCell.textContent = newTot || '—';
  }
  // Aggiorna il box fabbisogno (delicato: rigeneriamo solo quella parte)
  // Identifichiamo la commessa dalla riga e aggiorniamo il parent card
  _refreshFabbisognoBox(r.commessa);
}

function _showInlineAlert(anchorEl, msg) {
  // Toast temporaneo non bloccante ancorato all'input
  const toast = document.createElement('div');
  toast.className = 'fixed z-50 bg-red-600 text-white text-xs px-3 py-2 rounded shadow-lg pointer-events-none';
  toast.style.cssText = 'top: 1rem; right: 1rem; max-width: 280px;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function _refreshFabbisognoBox(commessaNome) {
  // Rigenera solo il box fabbisogno all'interno della card già renderizzata
  // Troviamo la card dalla lista commesse attive cercando per data attribute
  const allCards = document.querySelectorAll('#commesse-list > div');
  for (const card of allCards) {
    const title = card.querySelector('.font-medium.text-sm.text-slate-900');
    if (title && title.textContent.trim() === commessaNome) {
      // Ricalcola il fabbisogno
      const f = calcolaFabbisognoCommessa(commessaNome);
      const oldBox = card.querySelector('.fabbisogno-box');
      if (!f || (!f.completata && f.mesiAttivi === 0)) {
        if (oldBox) oldBox.remove();
      } else {
        let newHtml = '';
        if (f.completata) {
          newHtml = `<div class="fabbisogno-box my-2 p-2 rounded border bg-slate-100 border-slate-300 text-[11px] text-slate-600">
            <b>⓵ Nessun carico futuro</b> — valuta di chiudere questa commessa.
          </div>`;
        } else if (f.mesiAttivi > 0) {
          let sCls = f.surplus > 0 ? 'bg-amber-100 border-amber-300 text-amber-800'
            : f.surplus < 0 ? 'bg-red-100 border-red-300 text-red-800'
            : 'bg-emerald-100 border-emerald-300 text-emerald-800';
          let sIcon = f.surplus > 0 ? '⚠' : f.surplus < 0 ? '🔴' : '✓';
          let sLabel = f.surplus > 0 ? `+${f.surplus} surplus` : f.surplus < 0 ? `${Math.abs(f.surplus)} carenza` : 'ottimale';
          const fabbSrc = f.risDichiarate !== null
            ? `<span class="bg-blue-100 text-blue-700 px-1 rounded ml-1">📋 dichiarato</span>`
            : `<span class="text-slate-400 ml-1">(stimato)</span>`;
          newHtml = `<div class="fabbisogno-box my-2 p-2 rounded border ${sCls}">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="text-[11px]"><span class="font-semibold">Fabbisogno residuo:</span>
                ${f.risDichiarate !== null ? f.nNecessari + ' risorse ' + fabbSrc : f.fteNec + ' FTE stimati ' + fabbSrc}
                · ${f.nAssegnati} con carico · ${f.totGGFuturo} gg-uomo
              </div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded ${sCls.replace('-100','-200')}">${sIcon} ${sLabel}</span>
            </div>
            ${f.surplus > 0 ? '<div class="text-[10px] mt-1 text-amber-700">Suggerimento: ' + f.surplus + ' risorsa/e liberabile/i.</div>' : ''}
            ${f.surplus < 0 ? '<div class="text-[10px] mt-1 text-red-700">⚠ Servono ' + Math.abs(f.surplus) + ' risorse aggiuntive.</div>' : ''}
          </div>`;
        }
        if (oldBox) { oldBox.outerHTML = newHtml; }
        else {
          const subtitle = card.querySelector('.text-\\[11px\\].text-slate-500');
          if (subtitle) subtitle.insertAdjacentHTML('afterend', newHtml);
        }
      }

      // Aggiorna colori intestazioni mese in tempo reale (logica FTE + range date)
      const meta2 = state.commesse_attive_meta[commessaNome] || {};
      const risDich2 = (meta2.risorse_necessarie != null) ? meta2.risorse_necessarie : null;
      const mc2 = meseCorrente();
      const ass2 = state.staffing.map((r, idx) => ({ ...r, _idx: idx })).filter(r => r.commessa === commessaNome);

      // Range date commessa
      let mInizio2 = -1, mFine2 = -1;
      if (meta2.inizio) { const d2 = new Date(meta2.inizio); if (d2.getFullYear() === ANNO) mInizio2 = d2.getMonth(); }
      if (meta2.fine)   { const d2 = new Date(meta2.fine);   if (d2.getFullYear() === ANNO) mFine2   = d2.getMonth(); }

      const thead = card.querySelector('thead tr');
      if (thead) {
        const ths = thead.querySelectorAll('th');
        MESI.forEach((m, i) => {
          const th = ths[i + 1];
          if (!th) return;
          const gl  = INITIAL_DATA.giorni_lavorativi[i] || 20;
          const ggM = ass2.reduce((s, a) => s + (Number(a.mesi[i]) || 0), 0);
          const fte = ggM / gl;

          th.onclick = null;
          th.style.cursor = '';
          th.className = 'text-center px-0.5 font-medium';

          // Mese fuori range: grigio neutro
          const inRange = (mInizio2 < 0 || i >= mInizio2) && (mFine2 < 0 || i <= mFine2);
          if (!inRange) {
            th.className += ' text-slate-300';
            th.title = m + ' (fuori finestra commessa)';
            th.innerHTML = m;
            return;
          }

          if (i < mc2) {
            // Mese storico: grigio con info FTE
            th.className += ' text-slate-400';
            th.title = m + ' (storico): ' + fte.toFixed(2) + ' FTE' + (risDich2 ? ' / ' + risDich2 + ' richiesti' : '');
            th.innerHTML = m;
            return;
          }

          if (risDich2 === null) {
            // Nessun target dichiarato: teal neutro
            th.className += ggM > 0 ? ' text-teal-700' : ' text-slate-400';
            th.title = m + ': ' + fte.toFixed(2) + ' FTE';
            th.style.cursor = 'pointer';
            th.innerHTML = m;
            th.onclick = ev => apriDettaglioMeseCommessa(ev, encodeURIComponent(commessaNome), i);
            return;
          }

          const diff = fte - risDich2;
          if (Math.abs(diff) < 0.05) {
            th.className += ' text-emerald-700 bg-emerald-50 rounded';
            th.title = m + ': ' + fte.toFixed(2) + ' / ' + risDich2 + ' FTE ✓';
            th.style.cursor = 'pointer';
            th.innerHTML = m;
          } else if (diff > 0) {
            th.className += ' text-amber-700 bg-amber-50 rounded';
            th.title = m + ': ' + fte.toFixed(2) + ' FTE — surplus +' + diff.toFixed(2);
            th.style.cursor = 'pointer';
            th.innerHTML = m + '<span style="font-size:8px">▲</span>';
          } else {
            th.className += ' text-red-700 bg-red-50 rounded';
            th.title = m + ': ' + fte.toFixed(2) + ' FTE — deficit ' + diff.toFixed(2);
            th.style.cursor = 'pointer';
            th.innerHTML = m + '<span style="font-size:8px">▼</span>';
          }
          th.onclick = ev => apriDettaglioMeseCommessa(ev, encodeURIComponent(commessaNome), i);
        });
      }
      return;
    }
  }
}

// Rigenera solo il contenuto del box confronto (select mese + tabella) per la
// commessa indicata, individuato via data-attribute (non per titolo, a differenza
// di _refreshFabbisognoBox) — così funziona indipendentemente dalla posizione
// della card nella lista. Non tocca il <details> esterno: ne preserva lo stato aperto/chiuso.
function _refreshConfrontoBox(commessaNome) {
  const box = document.querySelector(`.confronto-box[data-commessa="${CSS.escape(encodeURIComponent(commessaNome))}"]`);
  if (!box) return;
  const body = box.querySelector('.confronto-body');
  if (!body) return;
  const meseSel = _confrontoMeseSel[commessaNome] !== undefined ? _confrontoMeseSel[commessaNome] : meseCorrente();
  body.innerHTML = _confrontoBodyHtml(commessaNome, meseSel);
  // body.innerHTML sostituisce anche la <select>: il suo onchange, legato una sola
  // volta durante il renderCommesse() completo, va ricollegato qui — altrimenti dopo
  // il primo cambio mese la nuova <select> resta senza handler e i cambi successivi
  // non ricaricano più la tabella (v18.79.0).
  const sel = body.querySelector('.confronto-mese-sel');
  if (sel) sel.onchange = () => {
    _confrontoMeseSel[commessaNome] = parseInt(sel.value, 10);
    _refreshConfrontoBox(commessaNome);
  };
}

