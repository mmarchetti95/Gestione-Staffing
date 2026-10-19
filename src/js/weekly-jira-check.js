/* ==================== GRIGLIA · CONTROLLO SOTTOTASK JIRA ====================
   Bottone "🎫 Sottotask" nella toolbar della Griglia, accanto a Note/Variazioni: controlla
   tutte le celle della settimana mostrata e dice, per ogni operatore + cantiere + attività,
   se ha il suo sottotask Jira. Stessa unità di pwJiraSubtaskInit: un sottotask copre
   operatore/cantiere/attività per tutta la settimana, non il singolo giorno.
   Legge solo bc.jiraSubtask (gli indicatori 🎫/⚠️ delle celle): nessuna chiamata a Jira,
   quindi è istantaneo e gira a ogni pwRender/aggiornamento badge per tenere aggiornato il
   bottone. Non verifica che il sottotask esista ancora su Jira: lo fa l'anteprima del
   flusso "🎫 Sottotask Jira", che riallinea gli indicatori.
   Anomalie (pwJchkAnalizza):
   - mancante: nessun indicatore (con nota se all'operatore manca l'email in anagrafica,
     senza la quale il sottotask non si può creare);
   - errore: creazione fallita (indicatore ⚠️);
   - orfano: indicatore creato/già esistente che nessuna cella usa più (cantiere, attività
     o operatore cambiati dopo la creazione): su Jira c'è un sottotask che la Griglia non
     pianifica più;
   - commessa: blocco senza commessa o commessa senza "Codice progetto Jira" — le sue
     celle non si possono controllare una per una.
   Gli operatori di un fornitore esterno (op.fornitore) non hanno sottotask: restano fuori. */

HELP_TEXTS['pw-jchk'] = 'Controlla in un colpo tutte le celle della settimana mostrata: per ogni operatore + cantiere + attività verifica che ci sia il sottotask Jira (indicatore 🎫 in cella).\n\nVerde = tutto a posto. Rosso = assegnazioni senza sottotask o con creazione fallita. Ambra = sottotask non più collegati a nessuna cella, o commesse senza codice progetto Jira.\n\nClicca una riga (o un giorno) per andare alla cella. Il controllo è locale e immediato: non interroga Jira.';

const PW_JCHK_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const PW_JCHK_TIPI = {
  commessa: { sev: 'warn', ico: '🔌', label: 'commessa non collegata a Jira', plur: 'commesse non collegate a Jira' },
  errore:   { sev: 'ko',   ico: '⚠️', label: 'creazione fallita', plur: 'creazioni fallite' },
  mancante: { sev: 'ko',   ico: '❌', label: 'senza sottotask', plur: 'senza sottotask' },
  orfano:   { sev: 'warn', ico: '🔗', label: 'sottotask non più in Griglia', plur: 'sottotask non più in Griglia' },
};
const PW_JCHK_ORDINE = ['commessa', 'errore', 'mancante', 'orfano'];

const _pwJchk = {
  evidenzia: false, // celle anomale evidenziate in Griglia (acceso all'apertura del controllo)
  ultimo: null,     // ultimo risultato mostrato nel modal: gli onclick lo indicizzano per numero
};

function pwJchkAnalizza() {
  const out = { voci: 0, ok: 0, fornitori: 0, anomalie: [] };
  pwGetWeekData().forEach((bc, cIdx) => {
    if (!bc) return;
    const gruppi = new Map();    // operatore|||cantiere|||attività -> gruppo
    const perOpCant = new Map(); // operatore|||cantiere -> Set(attività), in ordine di comparsa
    (bc.squadre || []).forEach((sq, sIdx) => (sq.operatori || []).forEach((op, oIdx) => {
      if (!op || !op.nome) return;
      const giorni = op.giorni || {};
      Object.keys(giorni).filter(d => /^[0-5]$/.test(d)).forEach(dKey => {
        const g = giorni[dKey];
        pwCellCantieriRaw(g).forEach((raw, ci) => {
          const cantiere = (raw || '').trim();
          if (!cantiere) return;
          if (op.fornitore) { out.fornitori++; return; }
          const attivita = pwCellAttivitaAt(g, ci);
          const k = op.nome + '|||' + cantiere + '|||' + attivita;
          let gr = gruppi.get(k);
          if (!gr) {
            gr = { cIdx, sIdx, operatore: op.nome, cantiere, attivita, squadra: sq.nome || '', celle: [] };
            gruppi.set(k, gr);
          }
          gr.celle.push({ sIdx, oIdx, day: Number(dKey), ci });
          const ko = op.nome + '|||' + cantiere;
          if (!perOpCant.has(ko)) perOpCant.set(ko, new Set());
          perOpCant.get(ko).add(attivita);
        });
      });
    }));

    // Come in pwJiraSubtaskInit: se un operatore ha su un cantiere giorni con attività e
    // giorni senza, quelli senza non fanno un sottotask a sé — li copre quello dell'attività.
    gruppi.forEach((gr, k) => {
      if (gr.attivita) return;
      const altra = [...perOpCant.get(gr.operatore + '|||' + gr.cantiere)].find(Boolean);
      if (!altra) return;
      gruppi.get(gr.operatore + '|||' + gr.cantiere + '|||' + altra).celle.push(...gr.celle);
      gruppi.delete(k);
    });
    if (!gruppi.size && !Object.keys(bc.jiraSubtask || {}).length) return;

    const meta = (bc.commessa && state.commesse_attive_meta && state.commesse_attive_meta[bc.commessa]) || {};
    if (!bc.commessa || !meta.jira_project_code) {
      if (!gruppi.size) return;
      out.voci += gruppi.size;
      out.anomalie.push({
        tipo: 'commessa', cIdx, sIdx: 0, commessa: bc.commessa || '', n: gruppi.size,
        celle: [...gruppi.values()].flatMap(gr => gr.celle),
        messaggio: (bc.commessa ? 'Manca il "Codice progetto Jira" in anagrafica commessa: ' : 'Blocco senza commessa scelta: ')
          + gruppi.size + (gruppi.size === 1 ? ' assegnazione non controllabile.' : ' assegnazioni non controllabili.'),
      });
      return;
    }

    const usati = new Set();
    gruppi.forEach(gr => {
      gr.celle.sort((a, b) => a.day - b.day);
      out.voci++;
      const found = pwJiraSubtaskLookup(bc, gr.cantiere, gr.operatore, gr.attivita);
      if (found) usati.add(found.mapKey);
      const e = found && found.entry;
      if (pwJiraSubtaskIsResolved(e)) { out.ok++; return; }
      gr.commessa = bc.commessa;
      gr.tipo = e && e.status === 'error' ? 'errore' : 'mancante';
      gr.messaggio = (e && e.message) || '';
      gr.noEmail = !pwJiraOperatorEmail(gr.operatore);
      out.anomalie.push(gr);
    });

    // Indicatori creati/già esistenti che nessuna cella usa più. Un errore non più usato
    // non dice nulla (il sottotask non c'è), quindi non si segnala.
    Object.keys(bc.jiraSubtask || {}).forEach(mapKey => {
      const e = bc.jiraSubtask[mapKey];
      if (usati.has(mapKey) || !pwJiraSubtaskIsResolved(e)) return;
      const [cantiere, operatore, attivita] = mapKey.split('|||');
      let pos = null;
      (bc.squadre || []).some((sq, sIdx) => (sq.operatori || []).some((op, oIdx) => {
        if (op && op.nome === operatore) { pos = { sIdx, oIdx }; return true; }
        return false;
      }));
      out.anomalie.push({
        tipo: 'orfano', cIdx, sIdx: pos ? pos.sIdx : 0, commessa: bc.commessa, mapKey,
        operatore: operatore || '', cantiere: cantiere || '', attivita: attivita || '',
        key: e.key || '', url: e.url || '', pos, celle: [],
      });
    });
  });

  out.anomalie.sort((a, b) => (a.cIdx - b.cIdx)
    || (PW_JCHK_ORDINE.indexOf(a.tipo) - PW_JCHK_ORDINE.indexOf(b.tipo))
    || (a.sIdx - b.sIdx)
    || String(a.operatore || '').localeCompare(String(b.operatore || ''), 'it'));
  return out;
}

/* Bottone + evidenziazione: chiamata da pwRender e da pwJiraSubtaskApplyBadgesToDom. */
function pwJchkRefresh() {
  const r = pwJchkAnalizza();
  pwJchkUpdateButton(r);
  pwJchkApplyHighlight(r);
}

function pwJchkUpdateButton(r) {
  const btn = document.getElementById('pw-jchk-btn');
  if (!btn) return;
  const BASE = 'px-3 py-1.5 text-sm border rounded no-print whitespace-nowrap ';
  const n = r.anomalie.length;
  if (!r.voci && !n) {
    btn.className = BASE + 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100';
    btn.textContent = '🎫 Sottotask';
    btn.title = 'Nessun cantiere pianificato questa settimana — Click destro per la guida';
  } else if (!n) {
    btn.className = BASE + 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
    btn.textContent = '✅ Sottotask ok';
    btn.title = 'Tutte le ' + r.voci + ' assegnazioni della settimana hanno il sottotask Jira — Click destro per la guida';
  } else {
    const ko = r.anomalie.some(a => PW_JCHK_TIPI[a.tipo].sev === 'ko');
    btn.className = BASE + (ko ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100');
    btn.textContent = '🎫 Sottotask · ' + n + (n === 1 ? ' anomalia' : ' anomalie');
    btn.title = r.ok + '/' + r.voci + ' assegnazioni con sottotask Jira — clicca per il dettaglio, click destro per la guida';
  }
}

function pwJchkApplyHighlight(r) {
  document.querySelectorAll('#pw-grid .pw-jchk-ko, #pw-grid .pw-jchk-warn')
    .forEach(el => el.classList.remove('pw-jchk-ko', 'pw-jchk-warn'));
  if (!_pwJchk.evidenzia) return;
  r.anomalie.forEach(a => {
    const cls = PW_JCHK_TIPI[a.tipo].sev === 'ko' ? 'pw-jchk-ko' : 'pw-jchk-warn';
    a.celle.forEach(c => {
      const inp = document.querySelector('#pw-grid .pw-cantiere-input[data-cidx="' + a.cIdx + '"][data-sidx="' + c.sIdx
        + '"][data-oidx="' + c.oIdx + '"][data-day="' + c.day + '"][data-idx="' + c.ci + '"]');
      if (inp) inp.classList.add(cls);
    });
  });
}

function pwJchkSetEvidenzia(on) {
  _pwJchk.evidenzia = !!on;
  pwJchkApplyHighlight(pwJchkAnalizza());
}

function pwOpenJiraCheck() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const r = pwJchkAnalizza();
  _pwJchk.ultimo = r;
  if (r.anomalie.length) _pwJchk.evidenzia = true;
  pwJchkUpdateButton(r);
  pwJchkApplyHighlight(r);

  const n = r.anomalie.length;
  const conteggi = {};
  r.anomalie.forEach(a => { conteggi[a.tipo] = (conteggi[a.tipo] || 0) + 1; });
  const chips = PW_JCHK_ORDINE.filter(t => conteggi[t]).map(t =>
    '<span class="pw-jchk-chip pw-jchk-chip-' + PW_JCHK_TIPI[t].sev + '">' + PW_JCHK_TIPI[t].ico + ' '
    + conteggi[t] + ' ' + (conteggi[t] === 1 ? PW_JCHK_TIPI[t].label : PW_JCHK_TIPI[t].plur) + '</span>').join('');

  let esito;
  if (!r.voci && !n) {
    esito = '<div class="pw-jchk-esito pw-jchk-esito-vuoto">Nessun cantiere pianificato in Griglia questa settimana.</div>';
  } else if (!n) {
    esito = '<div class="pw-jchk-esito pw-jchk-esito-ok"><div class="pw-jchk-esito-big">✅ Tutto a posto</div>'
      + '<div>Tutte le <b>' + r.voci + '</b> assegnazioni (operatore · cantiere · attività) hanno il loro sottotask Jira.</div></div>';
  } else {
    const ko = r.anomalie.some(a => PW_JCHK_TIPI[a.tipo].sev === 'ko');
    esito = '<div class="pw-jchk-esito ' + (ko ? 'pw-jchk-esito-ko' : 'pw-jchk-esito-warn') + '">'
      + '<div class="pw-jchk-esito-big">' + n + (n === 1 ? ' anomalia' : ' anomalie') + '</div>'
      + '<div><b>' + r.ok + '</b> su <b>' + r.voci + '</b> assegnazioni hanno il sottotask Jira.</div>'
      + '<div class="flex flex-wrap gap-1.5 mt-2">' + chips + '</div></div>';
  }

  const perCommessa = new Map();
  r.anomalie.forEach((a, i) => {
    if (!perCommessa.has(a.cIdx)) perCommessa.set(a.cIdx, []);
    perCommessa.get(a.cIdx).push(i);
  });
  const blocchi = [...perCommessa.entries()].map(([cIdx, idxs]) => {
    const primo = r.anomalie[idxs[0]];
    const collegata = primo.tipo !== 'commessa';
    const creaBtn = collegata && sbCanWrite() && idxs.some(i => r.anomalie[i].tipo === 'mancante' || r.anomalie[i].tipo === 'errore')
      ? '<button type="button" class="pw-jchk-crea" onclick="closeModal();pwJiraSubtaskInit(' + cIdx + ')" title="Apre la creazione sottotask per questa commessa">🎫 Crea sottotask</button>'
      : '';
    return '<div class="pw-jchk-blocco">'
      + '<div class="pw-jchk-blocco-head"><span class="truncate">' + esc(primo.commessa || '(blocco senza commessa)') + '</span>'
      + '<span class="text-slate-400 font-normal text-xs ml-1">' + idxs.length + '</span>' + creaBtn + '</div>'
      + idxs.map(i => pwJchkRigaHtml(r.anomalie[i], i)).join('')
      + '</div>';
  }).join('');

  const note = ['Controllo sugli indicatori 🎫 salvati in Griglia, senza interrogare Jira. Un sottotask copre operatore + cantiere + attività per tutta la settimana.'];
  if (r.fornitori) note.push(r.fornitori + (r.fornitori === 1 ? ' cella' : ' celle') + ' di fornitori esterni escluse dal controllo.');

  root.innerHTML = '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">'
    + '<div class="flex items-start justify-between gap-3 mb-3">'
    +   '<div><h3 class="font-semibold text-slate-900">🎫 Controllo sottotask Jira</h3>'
    +   '<div class="text-xs text-slate-500">Week ' + pwWeek + ' · ' + pwAnno + ' · tutte le commesse della Griglia</div></div>'
    +   (n ? '<label class="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer whitespace-nowrap mt-1">'
    +     '<input type="checkbox"' + (_pwJchk.evidenzia ? ' checked' : '') + ' onchange="pwJchkSetEvidenzia(this.checked)"> Evidenzia in Griglia</label>' : '')
    + '</div>'
    + esito
    + (blocchi ? '<p class="text-xs text-slate-500 mt-3 mb-2">Clicca una riga per andare alla cella, o un giorno per la cella di quel giorno.</p>' + blocchi : '')
    + '<div class="text-[11px] text-slate-400 mt-3">' + note.map(esc).join('<br>') + '</div>'
    + '<div class="flex justify-end gap-2 mt-4">'
    +   '<button type="button" onclick="pwOpenJiraCheck()" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">↻ Ricontrolla</button>'
    +   '<button type="button" onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Chiudi</button>'
    + '</div>'
    + '</div></div>';
}

function pwJchkRigaHtml(a, i) {
  const t = PW_JCHK_TIPI[a.tipo];
  const cls = 'pw-jchk-row pw-jchk-row-' + t.sev;
  if (a.tipo === 'commessa') {
    return '<div class="' + cls + '" onclick="pwJchkVai(' + i + ')" title="Vai al blocco commessa">'
      + '<span class="pw-jchk-ico">' + t.ico + '</span>'
      + '<div class="min-w-0 flex-1"><div class="font-medium">' + esc(t.label) + '</div>'
      + '<div class="pw-jchk-det">' + esc(a.messaggio) + '</div></div></div>';
  }
  const titolo = '<b>' + esc(a.operatore) + '</b> — ' + esc(a.cantiere)
    + (a.attivita ? ' <span class="text-slate-500">· ' + esc(a.attivita) + '</span>' : '')
    + (a.squadra ? ' <span class="pw-jchk-sq">(' + esc(a.squadra) + ')</span>' : '');
  if (a.tipo === 'orfano') {
    const link = a.url
      ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="text-blue-700 hover:underline">' + esc(a.key || 'apri') + '</a>'
      : esc(a.key);
    const rimuovi = sbCanWrite()
      ? '<button type="button" class="pw-jchk-azione" onclick="event.stopPropagation();pwJchkRimuoviOrfano(' + i + ')" title="Toglie solo l\'indicatore dalla Griglia: il sottotask su Jira resta">✕ togli indicatore</button>'
      : '';
    return '<div class="' + cls + '" onclick="pwJchkVai(' + i + ')" title="' + (a.pos ? 'Vai alla riga dell\'operatore' : 'Vai al blocco commessa') + '">'
      + '<span class="pw-jchk-ico">' + t.ico + '</span>'
      + '<div class="min-w-0 flex-1"><div>' + titolo + '</div>'
      + '<div class="pw-jchk-det">Sottotask ' + link + ' su Jira, ma nessuna cella lo pianifica più'
      + (a.pos ? ' (cantiere o attività cambiati?)' : ' (operatore non più in questa commessa)') + '</div></div>'
      + rimuovi + '</div>';
  }
  const det = [t.label + (a.messaggio ? ': ' + a.messaggio : '')];
  if (a.noEmail) det.push('📧 email mancante in anagrafica: il sottotask non si può creare');
  const giorni = a.celle.map((c, k) => '<button type="button" class="pw-jchk-giorno" onclick="event.stopPropagation();pwJchkVai(' + i + ',' + k + ')" title="Vai alla cella di ' + PW_JCHK_GIORNI[c.day] + '">' + PW_JCHK_GIORNI[c.day] + '</button>').join('');
  return '<div class="' + cls + '" onclick="pwJchkVai(' + i + ')" title="Vai alla cella">'
    + '<span class="pw-jchk-ico">' + t.ico + '</span>'
    + '<div class="min-w-0 flex-1"><div>' + titolo + '</div>'
    + '<div class="pw-jchk-det">' + det.map(esc).join(' · ') + '</div></div>'
    + '<div class="pw-jchk-giorni">' + giorni + '</div></div>';
}

/* k = indice della cella dell'anomalia (chip del giorno), 0 = prima cella. */
function pwJchkVai(i, k) {
  const a = _pwJchk.ultimo && _pwJchk.ultimo.anomalie[i];
  if (!a) return;
  if (a.tipo === 'commessa' || (a.tipo === 'orfano' && !a.pos)) { pwJchkVaiBlocco(a.cIdx); return; }
  if (a.tipo === 'orfano') { pwGoToSearchCell(a.cIdx, a.pos.sIdx, a.pos.oIdx, null); return; }
  const c = a.celle[k || 0];
  if (c) pwGoToSearchCell(a.cIdx, c.sIdx, c.oIdx, c.day);
}

function pwJchkVaiBlocco(cIdx) {
  closeModal();
  if (_pwCollapsedComm.delete(String(cIdx))) pwApplyCollapseState();
  setTimeout(() => {
    const head = document.querySelector('.pw-commessa-block[data-cidx="' + cIdx + '"] .pw-commessa-header');
    if (!head) return;
    head.scrollIntoView({ behavior: 'smooth', block: 'center' });
    head.classList.add('pw-weather-cell-flash');
    setTimeout(() => head.classList.remove('pw-weather-cell-flash'), 2000);
  }, 50);
}

async function pwJchkRimuoviOrfano(i) {
  const a = _pwJchk.ultimo && _pwJchk.ultimo.anomalie[i];
  if (!a || a.tipo !== 'orfano' || !sbGuardWrite()) return;
  const ok = await showConfirmAsync('Togliere l\'indicatore del sottotask ' + (a.key || '') + ' (' + a.operatore + ' — ' + a.cantiere
    + ') dalla Griglia?\n\nIl sottotask su Jira NON viene cancellato.', 'Togli indicatore');
  if (ok) pwJiraSubtaskBadgeRemove(a.cIdx, a.mapKey);
  pwOpenJiraCheck();
}
