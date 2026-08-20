/* ===================== GENERA MAIL PIANIFICAZIONE ===================== */
function pwGeneraMail() {
  const data = pwGetWeekData();
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }
  const saturday = days[5];

  // Raccoglie tutte le squadre per costruire i campi note nel modal
  const squadreInfo = []; // { commessa, squadraNome, idx }
  data.forEach((bc, cIdx) => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach((sq, sIdx) => {
      squadreInfo.push({ commessa: bc.commessa, squadraNome: sq.nome || `Squadra ${sIdx+1}`, cIdx, sIdx });
    });
  });

  // Costruisce il modal
  const root = document.getElementById('modal-root');

  const noteSquadreHtml = squadreInfo.length > 0
    ? squadreInfo.map((s, i) => {
        const sq = data[s.cIdx]?.squadre[s.sIdx];
        const noteSalvate      = sq?.note       || '';
        const strumentiSalvati = (typeof sq?.strumenti === 'string') ? sq.strumenti : '';
        const strumentiJiraLbl = sq ? pwSqStrumentiJira(sq).filter(Boolean).map(k => pwStrLabel(k)) : [];
        const jiraHint = strumentiJiraLbl.length
          ? `<div style="font-size:10px;color:var(--accent-dark);margin-bottom:2px;">✓ Da griglia: ${esc(strumentiJiraLbl.join(', '))}</div>`
          : '';
        return `
        <div class="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div class="text-xs font-semibold text-slate-700 mb-2">
            <span class="text-teal-700">${esc(s.commessa)}</span>
            <span class="text-slate-400 mx-1">/</span>
            <span class="text-amber-700">${esc(s.squadraNome)}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] text-slate-500 font-medium mb-0.5">📝 Note squadra <span class="text-slate-400 font-normal">(facoltativo)</span></label>
              <textarea id="mail-note-sq-${i}" rows="2"
                class="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-teal-400 bg-white"
                placeholder="Es: Affiancamento, istruzioni operative…">${esc(noteSalvate)}</textarea>
            </div>
            <div>
              <label class="block text-[10px] text-slate-500 font-medium mb-0.5">🔧 Strumenti / attrezzatura <span class="text-slate-400 font-normal">(aggiuntivi, facoltativo)</span></label>
              ${jiraHint}
              <textarea id="mail-strumenti-sq-${i}" rows="2"
                class="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-teal-400 bg-white"
                placeholder="Es: GPS Leica RX1250, Auto targa AB123CD…">${esc(strumentiSalvati)}</textarea>
            </div>
          </div>
        </div>`;
      }).join('')
    : '<div class="text-xs text-slate-400 italic">Nessuna squadra pianificata.</div>';

  // Rimuovi eventuale modal precedente
  const _existingMailModal = document.getElementById('pw-mail-modal-wrap');
  if (_existingMailModal) _existingMailModal.remove();

  // Costruisce il modal direttamente su body → nessun conflitto z-index con Leaflet
  const wrap = document.createElement('div');
  wrap.id = 'pw-mail-modal-wrap';
  wrap.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:var(--backdrop)', 'padding:16px'
  ].join(';');

  wrap.innerHTML = `
    <div style="
      background:white; border-radius:var(--radius-lg);
      box-shadow:var(--shadow-lg);
      width:100%; max-width:760px;
      display:flex; flex-direction:column;
      max-height:calc(100vh - 32px);
      overflow:hidden;
    ">
      <!-- Header fisso -->
      <div style="flex-shrink:0; padding:16px 20px; border-bottom:1px solid #e2e8f0;
                  display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-weight:700; font-size:15px; color:#0f172a;">📧 Genera mail — Week ${pwWeek}</div>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">${formatDate(monday)} → ${formatDate(saturday)} ${pwAnno}</div>
        </div>
        <button id="pw-mail-close-btn"
          style="background:none; border:none; font-size:24px; color:#94a3b8;
                 cursor:pointer; line-height:1; padding:0 4px;">×</button>
      </div>

      <!-- Parametri fissi -->
      <div style="flex-shrink:0; padding:12px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <label style="font-size:11px;">
            <div style="color:#475569; font-weight:600; margin-bottom:3px;">Orario partenza sede</div>
            <input id="mail-orario-partenza" type="text" value="${esc(pwData.mailOrarioPartenza || '08:00')}"
              style="width:100%; border:1px solid #e2e8f0; border-radius:6px;
                     padding:6px 10px; font-size:13px; outline:none; box-sizing:border-box;">
          </label>
          <label style="font-size:11px;">
            <div style="color:#475569; font-weight:600; margin-bottom:3px;">Orario lavoro</div>
            <input id="mail-orario-lavoro" type="text" value="${esc(pwData.mailOrarioLavoro || '08:00/08:30 – 16:30/17:00')}"
              style="width:100%; border:1px solid #e2e8f0; border-radius:6px;
                     padding:6px 10px; font-size:13px; outline:none; box-sizing:border-box;">
          </label>
        </div>
        <label style="font-size:11px; display:block; margin-top:10px;">
          <div style="color:#475569; font-weight:600; margin-bottom:3px;">📧 Email sempre in CC
            <span style="font-weight:400; color:#94a3b8;">(separate da virgola, aggiunte sempre in copia conoscenza)</span>
          </div>
          <input id="mail-email-sempre" type="text" value="${esc(pwData.emailSempreIncluse || '')}"
            placeholder="es: ufficio.tecnico@eagleprojects.it, capocommessa@eagleprojects.it"
            style="width:100%; border:1px solid #e2e8f0; border-radius:6px;
                   padding:6px 10px; font-size:13px; outline:none; box-sizing:border-box;">
        </label>
      </div>

      <!-- Corpo scrollabile: note squadra + note generali + anteprima -->
      <div style="flex:1; overflow-y:auto; min-height:0;">

        <!-- Note & strumenti per squadra -->
        <div style="padding:12px 20px; border-bottom:1px solid #e2e8f0;">
          <div style="font-size:11px; font-weight:600; color:#1e293b; margin-bottom:8px;">
            Note &amp; strumenti per squadra
          </div>
          ${noteSquadreHtml}
        </div>

        <!-- Note generali -->
        <div style="padding:12px 20px; border-bottom:1px solid #e2e8f0;">
          <label style="display:block; font-size:11px; font-weight:600; color:#1e293b; margin-bottom:4px;">
            📌 Note generali
            <span style="font-weight:400; color:#94a3b8;">(ferie manuali, istruzioni…)</span>
          </label>
          <textarea id="mail-note-generali" rows="3"
            style="width:100%; border:1px solid #e2e8f0; border-radius:6px;
                   padding:8px 10px; font-size:11px; color:#334155; outline:none;
                   resize:vertical; box-sizing:border-box;"
            placeholder="Es: permesso pomeriggio @Mario Rossi"></textarea>
        </div>

        <!-- Anteprima mail -->
        <div style="padding:12px 20px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="font-size:11px; font-weight:600; color:#1e293b;">Anteprima mail</div>
            <button id="mail-rigenera"
              style="font-size:11px; padding:3px 10px; background:#f1f5f9; color:#475569;
                     border:1px solid #e2e8f0; border-radius:4px; cursor:pointer;">↺ Rigenera</button>
          </div>
          <textarea id="mail-testo" rows="18"
            style="width:100%; border:1px solid #e2e8f0; border-radius:6px;
                   padding:10px 12px; font-size:11px; font-family:monospace;
                   background:#f8fafc; color:#1e293b; outline:none;
                   resize:none; line-height:1.6; box-sizing:border-box;"></textarea>
        </div>

      </div>

      <!-- Footer fisso -->
      <div style="flex-shrink:0; padding:12px 20px; border-top:1px solid #e2e8f0;
                  display:flex; justify-content:flex-end; gap:8px;">
        <button id="pw-mail-chiudi-btn"
          style="padding:7px 16px; font-size:13px; border:1px solid #cbd5e1;
                 border-radius:6px; background:white; cursor:pointer; color:#475569;">Chiudi</button>
        <button id="mail-apri-outlook"
          style="padding:7px 16px; font-size:13px; background:#0ea5e9; color:white;
                 border:none; border-radius:6px; cursor:pointer; font-weight:600;">✉️ Apri Outlook (destinatari)</button>
        <button id="mail-copia"
          style="padding:7px 18px; font-size:13px; background:#4f46e5; color:white;
                 border:none; border-radius:6px; cursor:pointer; font-weight:600;">📋 Copia negli appunti</button>
      </div>
    </div>`;

  document.body.appendChild(wrap);

  // Chiudi cliccando fuori o sui bottoni chiudi
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.getElementById('pw-mail-close-btn').onclick  = () => wrap.remove();
  document.getElementById('pw-mail-chiudi-btn').onclick = () => wrap.remove();

  // Funzione che compone il testo della mail
  function componiTesto() {
    const orarioPartenza = document.getElementById('mail-orario-partenza').value.trim() || '08:00';
    const orarioLavoro   = document.getElementById('mail-orario-lavoro').value.trim()   || '08:00/08:30 – 16:30/17:00';
    const noteGenerali   = document.getElementById('mail-note-generali').value.trim();
    const sep = '━'.repeat(34);
    const prevWeek = pwWeekAdd(pwAnno, pwWeek, -1);
    const dwLabel = nome => {
      if (pwIsDwStart(pwAnno, pwWeek, nome)) return ' [🔁 doppia week, 1ª sett.]';
      if (pwIsDwStart(prevWeek.anno, prevWeek.week, nome)) return ' [🔁 doppia week, 2ª sett. — rientro gio]';
      return '';
    };

    let testo = '';
    testo += `📅 PIANIFICAZIONE WEEK ${pwWeek} — ${formatDate(monday)} / ${formatDate(saturday)} ${pwAnno}\n`;
    testo += `\n`;
    testo += `🕗 Orario partenza: ${orarioPartenza} presso la sede aziendale\n`;
    testo += `🕗 Orario lavoro: ${orarioLavoro}\n`;
    testo += `⚠️  Pausa pranzo obbligatoria (30 min, max 1h)\n`;

    let sqInfoIdx = 0;
    data.forEach((bc) => {
      if (!bc.commessa) return;
      testo += `\n${sep}\n`;
      const metaCommessa = state.commesse_attive_meta[bc.commessa] || {};
      const codiceCommessa = metaCommessa.codice_commessa || '';
      testo += `📋 ${bc.commessa.toUpperCase()}${codiceCommessa ? ' (Cod. ' + codiceCommessa + ')' : ''}\n`;
      testo += `👤 Referente tecnico: ${metaCommessa.email_referente || '⚠️ non impostato'}\n`;
      testo += `${sep}\n`;

      (bc.squadre || []).forEach((sq) => {
        const nomeSquadra  = sq.nome || 'Squadra';
        const operatori    = (sq.operatori || []).filter(o => o.nome && o.nome.trim());
        const noteEl       = document.getElementById(`mail-note-sq-${sqInfoIdx}`);
        const strumentiEl  = document.getElementById(`mail-strumenti-sq-${sqInfoIdx}`);
        const noteSq       = noteEl      ? noteEl.value.trim()      : '';
        const strumentiSq  = strumentiEl ? strumentiEl.value.trim() : '';
        sqInfoIdx++;

        testo += `\n🟡 ${nomeSquadra}\n`;

        if (operatori.length > 0) {
          testo += `👷 ${operatori.map(o => o.nome + dwLabel(o.nome)).join(' · ')}\n`;
        }

        const strumentiJiraTxt = pwSqStrumentiJira(sq).filter(Boolean).map(k => pwStrLabel(k));
        const strumentiParts = [...strumentiJiraTxt];
        if (strumentiSq) strumentiParts.push(strumentiSq);
        if (strumentiParts.length > 0) {
          testo += `🔧 Strumenti: ${strumentiParts.join(', ')}\n`;
        }

        // Cantieri/attività della squadra per l'intera settimana, deduplicati e senza
        // vincolo di giorno: si vuole lasciare alla squadra la libertà di organizzarsi
        // su quale cantiere andare quale giorno, non imporre un programma rigido "lunedì
        // qui, martedì lì".
        const cantieriSett = new Set();
        const attivitaSett = new Set();
        for (let di = 0; di < 6; di++) {
          operatori.forEach(op => {
            const g = (op.giorni || {})[di] || {};
            if (g.cantiere && g.cantiere.trim()) cantieriSett.add(g.cantiere.trim());
            if (g.attivita && g.attivita.trim()) attivitaSett.add(g.attivita.trim());
          });
        }

        if (cantieriSett.size > 0) {
          testo += `🏗 Cantieri: ${[...cantieriSett].join(', ')}\n`;
        } else {
          testo += `  (nessun cantiere pianificato)\n`;
        }
        if (attivitaSett.size > 0) {
          testo += `📌 Attività: ${[...attivitaSett].join(', ')}\n`;
        }

        if (noteSq) {
          testo += `📝 ${noteSq}\n`;
        }
      });
    });

    if (noteGenerali) {
      testo += `\n${sep}\n`;
      testo += `📌 NOTE GENERALI\n`;
      testo += `${sep}\n`;
      testo += noteGenerali + '\n';
    }

    // --- Sezione ferie automatica ---
    const fw = pwGetFerieWeek();
    const DAY_NAMES_FERIE = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const righeF = [];
    Object.entries(fw).forEach(([nome, giorni]) => {
      const giorniAssenti = Object.entries(giorni)
        .filter(([, v]) => v === true)
        .map(([di]) => parseInt(di));
      if (giorniAssenti.length === 0) return;
      if (giorniAssenti.length === 6) {
        righeF.push(`• ${nome} → tutta la settimana`);
      } else {
        const etichette = giorniAssenti.map(di => {
          const d = new Date(monday);
          d.setUTCDate(monday.getUTCDate() + di);
          return `${DAY_NAMES_FERIE[di]} ${formatDate(d)}`;
        });
        righeF.push(`• ${nome} → ${etichette.join(', ')}`);
      }
    });

    if (righeF.length > 0) {
      testo += `\n${sep}\n`;
      testo += `🏖 FERIE / PERMESSI\n`;
      testo += `${sep}\n`;
      testo += righeF.join('\n') + '\n';
    }

    // --- Sezione doppia week automatica ---
    const dwStart = (pwDoppiaWeek[pwAnno] && pwDoppiaWeek[pwAnno][pwWeek]) || {};
    const dwPrevStart = (pwDoppiaWeek[prevWeek.anno] && pwDoppiaWeek[prevWeek.anno][prevWeek.week]) || {};
    const righeDw = [];
    Object.keys(dwStart).forEach(nome => {
      if (dwStart[nome] === true) righeDw.push(`• ${nome} → 1ª settimana doppia week (fuori tutta la settimana)`);
    });
    Object.keys(dwPrevStart).forEach(nome => {
      if (dwPrevStart[nome] === true) righeDw.push(`• ${nome} → 2ª settimana doppia week (rientro giovedì, riposo compensativo venerdì)`);
    });

    if (righeDw.length > 0) {
      testo += `\n${sep}\n`;
      testo += `🔁 DOPPIA WEEK\n`;
      testo += `${sep}\n`;
      testo += righeDw.join('\n') + '\n';
    }

    return testo;
  }

  // Salva note e strumenti in pwData ad ogni modifica
  async function salvaNoteSq() {
    squadreInfo.forEach((s, i) => {
      const sq = data[s.cIdx]?.squadre[s.sIdx];
      if (!sq) return;
      const noteEl      = document.getElementById(`mail-note-sq-${i}`);
      const strumentiEl = document.getElementById(`mail-strumenti-sq-${i}`);
      if (noteEl)      sq.note       = noteEl.value;
      if (strumentiEl) sq.strumenti  = strumentiEl.value;
    });
    await pwSave();
  }

  // Prima generazione
  document.getElementById('mail-testo').value = componiTesto();

  // Rigenera al click
  document.getElementById('mail-rigenera').onclick = () => {
    document.getElementById('mail-testo').value = componiTesto();
  };
  // Rigenera anche quando cambiano i parametri, persistendoli in pwData
  document.getElementById('mail-orario-partenza').addEventListener('input', (e) => {
    pwData.mailOrarioPartenza = e.target.value;
    pwSave();
    document.getElementById('mail-testo').value = componiTesto();
  });
  document.getElementById('mail-orario-lavoro').addEventListener('input', (e) => {
    pwData.mailOrarioLavoro = e.target.value;
    pwSave();
    document.getElementById('mail-testo').value = componiTesto();
  });
  // Email sempre incluse: persistita in pwData, non fa parte del testo della mail
  document.getElementById('mail-email-sempre').addEventListener('input', (e) => {
    pwData.emailSempreIncluse = e.target.value;
    pwSave();
  });
  // Note e strumenti squadra: salva in storage + rigenera anteprima
  squadreInfo.forEach((_, i) => {
    const noteEl = document.getElementById(`mail-note-sq-${i}`);
    if (noteEl) noteEl.addEventListener('input', () => {
      salvaNoteSq();
      document.getElementById('mail-testo').value = componiTesto();
    });
    const strumentiEl = document.getElementById(`mail-strumenti-sq-${i}`);
    if (strumentiEl) strumentiEl.addEventListener('input', () => {
      salvaNoteSq();
      document.getElementById('mail-testo').value = componiTesto();
    });
  });
  document.getElementById('mail-note-generali').addEventListener('input', () => {
    document.getElementById('mail-testo').value = componiTesto();
  });

  // Apri Outlook con i destinatari precompilati (email degli operatori pianificati questa
  // settimana). Il testo NON va nel corpo del mailto: (il link ha un limite di lunghezza
  // e lo tronca su testi lunghi) — resta comunque negli appunti, basta un Ctrl+V.
  document.getElementById('mail-apri-outlook').onclick = async () => {
    const testo = document.getElementById('mail-testo').value;
    try { await navigator.clipboard.writeText(testo); } catch(e) {}

    const emailByNome = {};
    (state.operatori || []).forEach(o => {
      const n = o.nome_esteso || o.nome_breve || o.nome;
      if (n && o.email && o.email.trim()) emailByNome[n] = o.email.trim();
    });
    const nomiSettimana = new Set();
    data.forEach(bc => {
      if (!bc.commessa) return;
      (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
        if (op.nome && op.nome.trim()) nomiSettimana.add(op.nome.trim());
      }));
    });
    // Operatori in ferie/permesso questa settimana: inclusi anche loro tra i destinatari
    Object.entries(pwGetFerieWeek()).forEach(([nome, giorni]) => {
      if (nome && nome.trim() && Object.values(giorni).some(v => v === true)) nomiSettimana.add(nome.trim());
    });
    const senzaEmail = [];
    const emailDipendenti = [];
    nomiSettimana.forEach(n => {
      if (emailByNome[n]) emailDipendenti.push(emailByNome[n]);
      else senzaEmail.push(n);
    });

    // Referenti tecnici delle commesse pianificate questa settimana
    const commesseSenzaRef = [];
    const emailReferenti = [];
    data.forEach(bc => {
      if (!bc.commessa) return;
      const ref = (state.commesse_attive_meta[bc.commessa] || {}).email_referente || '';
      if (ref) ref.split(',').map(s => s.trim()).filter(Boolean).forEach(e => emailReferenti.push(e));
      else commesseSenzaRef.push(bc.commessa);
    });

    // Email sempre incluse (impostazione salvata, es. ufficio tecnico, capocommessa…)
    const emailSempreIncluse = document.getElementById('mail-email-sempre').value || '';
    const emailSempre = emailSempreIncluse.split(',').map(s => s.trim()).filter(Boolean);

    // Unico destinatario ("A:"): logistica. Tutti gli altri vanno in copia conoscenza (CC),
    // nell'ordine: email sempre in CC → referenti tecnici → dipendenti (compresi quelli in ferie), deduplicati.
    const destinatario = 'logistica@eagleprojects.it';
    const ccSeen = new Set([destinatario.toLowerCase()]);
    const ccEmails = [];
    [...emailSempre, ...emailReferenti, ...emailDipendenti].forEach(e => {
      const key = e.toLowerCase();
      if (ccSeen.has(key)) return;
      ccSeen.add(key);
      ccEmails.push(e);
    });

    const subject = `Pianificazione Week ${pwWeek} — ${formatDate(monday)} / ${formatDate(saturday)} ${pwAnno}`;
    let mailtoUrl = 'mailto:' + encodeURIComponent(destinatario) + '?subject=' + encodeURIComponent(subject);
    if (ccEmails.length > 0) mailtoUrl += '&cc=' + encodeURIComponent(ccEmails.join(','));
    const a = document.createElement('a');
    a.href = mailtoUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (senzaEmail.length > 0 || commesseSenzaRef.length > 0) {
      let warn = 'Testo copiato negli appunti (incollalo nel corpo della mail).';
      if (senzaEmail.length > 0) {
        warn += `\n\n⚠ ${senzaEmail.length} operatore/i senza email assegnata, non inclusi in copia conoscenza: ${senzaEmail.join(', ')}.`;
      }
      if (commesseSenzaRef.length > 0) {
        warn += `\n\n⚠ Referente tecnico non impostato per: ${commesseSenzaRef.join(', ')} (Dashboard → Commesse attive → Modifica). Non incluso in copia conoscenza.`;
      }
      showAlertModal(warn);
    }
  };

  // Copia negli appunti
  document.getElementById('mail-copia').onclick = async () => {
    const testo = document.getElementById('mail-testo').value;
    const btn   = document.getElementById('mail-copia');
    try {
      await navigator.clipboard.writeText(testo);
      btn.textContent = '✓ Copiato!';
      btn.style.background = '#059669';
      setTimeout(() => {
        btn.textContent = '📋 Copia negli appunti';
        btn.style.background = '#4f46e5';
      }, 2500);
    } catch(e) {
      const ta = document.getElementById('mail-testo');
      ta.select();
      document.execCommand('copy');
      showAlertModal('Testo selezionato — premi Ctrl+C per copiare.');
    }
  };
}

/* ----- Utilities ISO week ----- */
function isoWeekYear(date) {
  // Ritorna { week, year } ISO 8601
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
    year: d.getUTCFullYear()
  };
}

function isoWeekToMonday(year, week) {
  // Ritorna la data del Lunedì della settimana ISO
  const jan4 = new Date(Date.UTC(year, 0, 4)); // 4 gennaio è sempre nella week 1
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
  return monday;
}

function weeksInYear(year) {
  // 52 o 53 settimane
  const dec31 = new Date(Date.UTC(year, 11, 31));
  return isoWeekYear(dec31).week === 1 ? 52 : isoWeekYear(dec31).week;
}

function formatDate(d) {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

function formatDateFull(d) {
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/* ----- Stato pianificazione settimanale ----- */
// Struttura: pwData[anno][week] = [ { commessa, commessaId, squadre: [ { nome, operatori: [ { nome, giorni: {0..5: {cantiere,attivita}} } ] } ] } ]
let pwData = {};
let pwAnno = 2026;
let pwWeek = 22;

/* ----- Stato ferie ----- */
// Struttura: pwFerie[anno][week][nomeOperatore] = { 0: bool, 1: bool, ..., 5: bool }
let pwFerie = {};

// Doppia week (Opzione 1, a blocco): pwDoppiaWeek[anno][week][nomeOperatore] = true
// significa che un blocco doppia-week INIZIA in (anno, week) e copre week e week+1.
let pwDoppiaWeek = {};

// Sposta (anno, week) di delta settimane gestendo il cambio anno (52/53 week ISO)
function pwWeekAdd(anno, week, delta) {
  let y = anno, w = week + delta;
  while (w > weeksInYear(y)) { w -= weeksInYear(y); y++; }
  while (w < 1) { y--; w += weeksInYear(y); }
  return { anno: y, week: w };
}

// True se l'operatore ha almeno un giorno di ferie nella settimana indicata
function pwHasFeriaWeek(anno, week, nome) {
  const wk = pwFerie[anno] && pwFerie[anno][week] ? pwFerie[anno][week][nome] : null;
  if (!wk) return false;
  for (let i = 0; i < 6; i++) if (wk[i] === true) return true;
  return false;
}

// True se in (anno, week) inizia un blocco doppia-week per l'operatore
function pwIsDwStart(anno, week, nome) {
  return !!(pwDoppiaWeek[anno] && pwDoppiaWeek[anno][week] && pwDoppiaWeek[anno][week][nome] === true);
}

function pwSetDwStart(anno, week, nome, val) {
  if (val) {
    if (!pwDoppiaWeek[anno]) pwDoppiaWeek[anno] = {};
    if (!pwDoppiaWeek[anno][week]) pwDoppiaWeek[anno][week] = {};
    pwDoppiaWeek[anno][week][nome] = true;
  } else if (pwDoppiaWeek[anno] && pwDoppiaWeek[anno][week]) {
    delete pwDoppiaWeek[anno][week][nome];
  }
}

// Conta i blocchi doppia-week (start) di un operatore: nell'insieme di settimane
// indicato (mese corrente) e nell'intero anno.
function pwDwCount(nome, weeksList, year) {
  let mese = 0;
  (weeksList || []).forEach(wk => { if (pwIsDwStart(wk.anno, wk.week, nome)) mese++; });
  let anno = 0;
  const y = pwDoppiaWeek[year];
  if (y) {
    Object.keys(y).forEach(wk => { if (y[wk] && y[wk][nome] === true) anno++; });
  }
  return { mese, anno };
}

// Ritorna le settimane ISO che toccano il mese (anno, mese 0-11), in ordine.
function pwMonthWeeks(anno, mese) {
  const seen = new Set();
  const out = [];
  const last = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  for (let day = 1; day <= last; day++) {
    const iw = isoWeekYear(new Date(Date.UTC(anno, mese, day)));
    const key = `${iw.year}-${iw.week}`;
    if (!seen.has(key)) { seen.add(key); out.push({ anno: iw.year, week: iw.week }); }
  }
  return out;
}

async function pwFerieLoad() {
  try { const r = await sget('pw_ferie'); if (r) pwFerie = r; } catch(e) { pwFerie = {}; }
}

async function pwDwLoad() {
  try { const r = await sget('pw_doppia_week'); if (r) pwDoppiaWeek = r; } catch(e) { pwDoppiaWeek = {}; }
}

async function pwFerieSave() {
  _sbDirty.ferie = true;
  try { await sset('pw_ferie', pwFerie); } catch(e) { console.warn('pwFerieSave error', e); }
  // Push immediato su Supabase con debounce breve (500ms) per evitare perdita dati al refresh
  if (typeof _sbUser !== 'undefined' && _sbUser) {
    clearTimeout(_sbPwPushTimer);
    _sbPwPushTimer = setTimeout(() => sbPush(), 500);
  }
}

function pwGetFerieWeek() {
  if (!pwFerie[pwAnno]) pwFerie[pwAnno] = {};
  if (!pwFerie[pwAnno][pwWeek]) pwFerie[pwAnno][pwWeek] = {};
  return pwFerie[pwAnno][pwWeek];
}

/* Restituisce true se l'operatore è in ferie almeno un giorno della settimana corrente */
function pwIsInFerie(nomeOp) {
  const fw = pwGetFerieWeek();
  const days = fw[nomeOp];
  if (!days) return false;
  return Object.values(days).some(v => v === true);
}

/* Restituisce true se l'operatore è già assegnato in qualsiasi commessa/squadra/cella
   della settimana corrente, ESCLUDENDO solo la cella (commessa+squadra+operatore) indicata
   da excludeCidx/excludeSidx/excludeOidx — cioè quella che si sta effettivamente modificando.
   Prima escludeva l'intero blocco commessa: un operatore già assegnato a un'altra squadra
   della STESSA commessa risultava erroneamente "libero". */
function pwIsGiaAssegnato(nomeOp, excludeCidx, excludeSidx, excludeOidx) {
  if (!nomeOp || !nomeOp.trim()) return false;
  const data = pwGetWeekData();
  for (let ci = 0; ci < data.length; ci++) {
    const bc = data[ci];
    const squadre = bc.squadre || [];
    for (let si = 0; si < squadre.length; si++) {
      const operatori = squadre[si].operatori || [];
      for (let oi = 0; oi < operatori.length; oi++) {
        if (ci === excludeCidx && si === excludeSidx && oi === excludeOidx) continue; // escludi solo la cella corrente
        const op = operatori[oi];
        if (op.nome && op.nome.trim() === nomeOp.trim()) return true;
      }
    }
  }
  return false;
}

/* Calcola stato operatore: 'ferie' | 'assegnato' | 'libero'
   excludeCidx/excludeSidx/excludeOidx = cella corrente, esclusa dal check assegnato */
function pwStatoOperatore(nomeOp, excludeCidx, excludeSidx, excludeOidx) {
  if (!nomeOp || !nomeOp.trim()) return 'libero';
  if (pwIsInFerie(nomeOp)) return 'ferie';
  if (pwIsGiaAssegnato(nomeOp, excludeCidx, excludeSidx, excludeOidx)) return 'assegnato';
  return 'libero';
}

/* ----- Render griglia ferie ----- */
function pwFerieRender() {
  const fw = pwGetFerieWeek();
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d);
  }
  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const today = new Date().toISOString().slice(0, 10);

  // Label settimana
  const labelEl = document.getElementById('pw-ferie-week-label');
  if (labelEl) labelEl.textContent = `WEEK ${pwWeek} · ${formatDate(days[0])} — ${formatDate(days[5])} ${pwAnno}`;

  const gridEl = document.getElementById('pw-ferie-grid');
  if (!gridEl) return;

  const allOps = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean).sort();
  const cols = `150px repeat(6, 1fr) 130px`;

  // Header
  let html = `<div class="pw-ferie-header-row" style="grid-template-columns:${cols};">
    <div class="pw-ferie-op-cell text-[10px] text-rose-700 uppercase font-bold">Operatore</div>
    ${days.map((d, i) => {
      const ds = d.toISOString().slice(0, 10);
      const isSab = i === 5;
      const isTod = ds === today;
      return `<div class="pw-ferie-day-header ${isSab ? 'sabato' : ''} ${isTod ? 'today' : ''}">
        ${DAY_NAMES[i]}<div class="pw-date">${formatDate(d)}</div>
      </div>`;
    }).join('')}
    <div class="pw-ferie-day-header text-[10px] text-rose-700 uppercase font-bold">Settimana</div>
  </div>`;

  // Righe operatori
  allOps.forEach(nome => {
    const row = (fw[nome] || {});
    const allSet = [0,1,2,3,4,5].every(i => row[i] === true);
    html += `<div class="pw-ferie-row" style="grid-template-columns:${cols};">
      <div class="pw-ferie-op-cell">${nome}</div>
      ${days.map((d, i) => {
        const checked = row[i] === true;
        const isSab = i === 5;
        return `<div class="pw-ferie-cell ${isSab ? 'sabato' : ''} ${checked ? 'assente' : ''}">
          <input type="checkbox" class="pw-ferie-cb"
            data-op="${nome.replace(/"/g, '&quot;')}" data-day="${i}"
            ${checked ? 'checked' : ''}
            onchange="pwToggleFeria(this)">
        </div>`;
      }).join('')}
      <div class="pw-ferie-cell" style="padding:2px 6px;">
        <button data-op="${nome.replace(/"/g, '&quot;')}" onclick="pwFerieToggleWeek(this.dataset.op)"
          title="${allSet ? 'Rimuovi le ferie da tutta la settimana' : 'Applica le ferie a tutta la settimana'}"
          style="width:100%;font-size:11px;font-weight:600;border-radius:5px;padding:3px 6px;cursor:pointer;border:1px solid ${allSet ? '#fca5a5' : '#cbd5e1'};background:${allSet ? '#fee2e2' : '#f8fafc'};color:${allSet ? '#991b1b' : '#475569'};white-space:nowrap;">
          ${allSet ? 'Tutta la Settimana' : 'Tutta la Settimana'}
        </button>
      </div>
    </div>`;
  });

  gridEl.innerHTML = html;

  // Riepilogo disponibili
  pwFerieSummaryRender(allOps, days, DAY_NAMES, today);
}

function pwFerieSummaryRender(allOps, days, DAY_NAMES, today) {
  const fw = pwGetFerieWeek();
  const sumEl = document.getElementById('pw-ferie-summary');
  if (!sumEl) return;

  const cols = `repeat(6, 1fr)`;
  let html = `<div style="display:grid;grid-template-columns:${cols};gap:8px;">`;
  days.forEach((d, i) => {
    const ds = d.toISOString().slice(0, 10);
    const isSab = i === 5;
    const isTod = ds === today;
    const inFerie = allOps.filter(nome => (fw[nome] || {})[i] === true);
    const disponibili = allOps.length - inFerie.length;
    const borderColor = isTod ? '#f59e0b' : isSab ? '#fb923c' : '#e2e8f0';
    html += `<div style="border:1px solid ${borderColor};border-radius:8px;padding:10px 8px;text-align:center;background:${isTod ? '#fef9c7' : isSab ? '#fff7ed' : '#f8fafc'}">
      <div style="font-size:11px;font-weight:700;color:#475569;">${DAY_NAMES[i]}</div>
      <div style="font-size:9px;color:#94a3b8;margin-bottom:6px;">${formatDate(d)}</div>
      <div style="font-size:22px;font-weight:800;color:${disponibili === 0 ? '#ef4444' : '#10b981'};">${disponibili}</div>
      <div style="font-size:9px;color:#64748b;">disponibili</div>
      ${inFerie.length > 0 ? `<div style="font-size:9px;color:#be123c;margin-top:4px;border-top:1px solid #fecdd3;padding-top:4px;">${inFerie.length} assente/i</div>` : ''}
    </div>`;
  });
  html += '</div>';

  if (allOps.length === 0) {
    sumEl.innerHTML = '<div class="text-xs text-slate-400 italic">Nessun operatore presente.</div>';
    return;
  }

  sumEl.innerHTML = html;
}

async function pwToggleFeria(cb) {
  const nome = cb.dataset.op;
  const day = parseInt(cb.dataset.day);
  const fw = pwGetFerieWeek();
  if (!fw[nome]) fw[nome] = {};
  fw[nome][day] = cb.checked;
  // Aggiorna sfondo cella
  const cell = cb.closest('.pw-ferie-cell');
  if (cell) {
    if (cb.checked) cell.classList.add('assente');
    else cell.classList.remove('assente');
  }
  await pwFerieSave();
  // Aggiorna summary senza re-render completo
  const allOps = getOperatoriAttivi().map(o => o.nome_esteso || o.nome).filter(Boolean).sort();
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); days.push(d);
  }
  pwFerieSummaryRender(allOps, days, ['Lun','Mar','Mer','Gio','Ven','Sab'], new Date().toISOString().slice(0,10));
}

// Applica o rimuove le ferie a tutta la settimana (6 giorni) per un operatore.
async function pwFerieToggleWeek(nome) {
  const fw = pwGetFerieWeek();
  if (!fw[nome]) fw[nome] = {};
  const allSet = [0,1,2,3,4,5].every(i => fw[nome][i] === true);
  for (let i = 0; i < 6; i++) fw[nome][i] = !allSet; // se tutta piena -> svuota, altrimenti riempi
  await pwFerieSave();
  pwFerieRender();
}

async function pwLoad() {
  try {
    const r = await sget('pw_data');
    if (r) pwData = r;
  } catch(e) { pwData = {}; }
  await pwFerieLoad();
  await pwDwLoad();
}

async function pwSave() {
  _sbDirty.planning = true;
  try { await sset('pw_data', pwData); } catch(e) { console.warn('pwSave error', e); }
  // Push immediato su Supabase con debounce breve (500ms) per evitare perdita dati al refresh
  if (typeof _sbUser !== 'undefined' && _sbUser) {
    clearTimeout(_sbPwPushTimer);
    _sbPwPushTimer = setTimeout(() => sbPush(), 500);
  }
}

function pwGetWeekData() {
  if (!pwData[pwAnno]) pwData[pwAnno] = {};
  if (!pwData[pwAnno][pwWeek]) pwData[pwAnno][pwWeek] = [];
  return pwData[pwAnno][pwWeek];
}

/* ----- Calcola commesse e operatori validi per la settimana corrente ----- */
function pwGetCommesseValide() {
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const mese = monday.getUTCMonth(); // 0-based

  // 1. Commesse dallo staffing con almeno una riga con gg>0 nel mese
  const commesseConStaffing = new Set();
  state.staffing.forEach(r => {
    if (r.commessa && r.commessa !== 'ORE NON LAVORATE' && (Number(r.mesi[mese]) || 0) > 0) {
      commesseConStaffing.add(r.commessa);
    }
  });

  // 2. Tutte le commesse attive (incluse quelle promosse da pipeline o create manualmente)
  //    che NON sono già coperte dallo staffing
  state.commesse_attive.forEach(ca => {
    const nome = ca.progetto || ca.nome;
    if (nome && nome !== 'ORE NON LAVORATE') {
      commesseConStaffing.add(nome);
    }
  });

  // 3. Commesse attive da meta (create/modificate manualmente)
  Object.keys(state.commesse_attive_meta || {}).forEach(nome => {
    if (nome && nome !== 'ORE NON LAVORATE') {
      commesseConStaffing.add(nome);
    }
  });

  // Escludi commesse escluse permanentemente — non devono apparire nel selettore
  const nomiChiuse = new Set(
    (state.commesse_escluse || []).map(n => (n||'').trim()).filter(Boolean)
  );
  return [...commesseConStaffing].filter(n => !nomiChiuse.has((n||'').trim())).sort();
}

function pwGetOperatoriPerCommessa(commessaNome) {
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const mese = monday.getUTCMonth();

  // Operatori con gg>0 su questa commessa nel mese (dallo staffing)
  const nomi = new Set();
  state.staffing
    .filter(r => r.commessa === commessaNome && (Number(r.mesi[mese]) || 0) > 0)
    .forEach(r => nomi.add(r.risorsa));

  // Se la commessa non ha righe staffing (es. promossa da pipeline o creata manualmente)
  // restituisci tutti gli operatori del sistema come fallback
  if (nomi.size === 0) {
    getOperatoriAttivi()
      .map(o => o.nome_esteso || o.nome)
      .filter(Boolean)
      .forEach(n => nomi.add(n));
  }

  return [...nomi].sort();
}

