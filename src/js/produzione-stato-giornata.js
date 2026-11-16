/* ==================== CONTROLLO PRODUZIONE · SISTEMA GIORNATA DEL SOTTOTASK ====================
   «✎» accanto al badge della colonna Stato (v18.254.0), per admin e responsabili: sistema da qui,
   senza passare da Jira, i sottotask che l'operatore ha dimenticato di muovere:
     1. mai attivato (TO DO) e lavoro finito  → chiudere e mettere le ore vere;
     2. attivato in ritardo                   → anticipare l'inizio (tratto mancante prima);
     3. finito ma lasciato IN PROGRESS         → chiudere con l'ora di fine vera;
     4. messo in pausa e non riattivato        → aggiungere il tratto dopo la pausa;
     5. sta lavorando ma non l'ha attivato     → portarlo IN PROGRESS (da TO DO o IN PENDING,
                                                 v18.264.0): da lì Jira conta il tempo da solo.
   La finestra mostra stato e worklog del sottotask (letti da Jira all'apertura, azione
   "giornata" di jira-worklog-edit) e propone i tratti di lavoro del giorno in base allo stato.
   «Applica su Jira», dopo una conferma:
     a. cambio di stato (azione "stato"): transizioni con i passaggi intermedi, assegnatario
        rimesso, eliminati i worklog che l'automazione Jira crea all'uscita da IN PROGRESS
        (registrerebbero il tempo sbagliato); senza Actual Production DONE resta IN PENDING;
     b. worklog: eliminati, corretti e aggiunti uno per uno (azioni delete/update/create, le
        stesse della Timeline: autore = assegnatario via Tempo, "atteso" contro le modifiche
        concorrenti).
   Dopo rilegge lo stato della colonna e, se la Timeline ha già letto la settimana, l'operatore.
   Non aggiorna controllo_produzione: «Ore Jira» si aggiorna con «🔄 Sincronizza da Jira».
   Modal #cpgs-modal (z-index 99995: sotto conferme e avvisi). */

const CPGS_FN_NASCOSTA = 'controllo:stato-giornata';
const CPGS_RANGO = [/^created$/i, /^to\s*do$/i, /^in\s*progress$/i, /pending/i, /^done$/i];
const CPGS_IN_PROGRESS = 2, CPGS_IN_PENDING = 3, CPGS_DONE = 4;

let _cpGs = {
  aperto: false, key: '', nome: '', iso: '', label: '',
  k: '', d: null,            // settimana ('anno|week') e date su cui è stato aperto
  caricando: false, errore: '',
  info: null,                // risposta "giornata": { stato, categoria, summary, assegnatario, worklogs }
  statoDa: null,             // { data, min, oggi, testo } dalla colonna Stato (solo se stesso stato)
  tratti: [],                // { id|null, orig: Wl|null, inizio, fine, commento, elimina, proposto }
  altri: [],                 // worklog del sottotask in altri giorni: { w, p }
  voluto: '',                // '' (invariato) | 'IN PROGRESS' | 'IN PENDING' | 'DONE'
  riga: null,                // riga del Controllo Produzione: { cpk, commessa, squadra, g, cantiere, attivita, anno, week }
  prod: null,                // produzione su Jira (per DONE): { caricando, errore, valore, campo }
  prodValore: '',            // produzione da scrivere prima di DONE se su Jira manca ('' = non scrivere)
  caricaT0: 0,               // inizio della lettura (per i secondi dell'indicatore)
  passi: null,               // durante «Applica su Jira»: [{ testo, esito: ''|'ok'|'ko'|'warn', nota, t0 }]
  salvando: false,
};

function cpGsPuo() {
  if (!_sbClient || !_sbUser || !sbCanWrite()) return false;
  return !(sbFnApplicaNascoste() && sbFnNascosta(CPGS_FN_NASCOSTA));
}

function _cpGsRango(stato) { return CPGS_RANGO.findIndex(r => r.test(String(stato || '').trim())); }

/* Stato finale ammesso da quello attuale: in avanti, più IN PENDING → IN PROGRESS (ripresa dopo
   la pausa, transizione normale del flusso). Un DONE non si riapre. Stessa regola nell'Edge Function. */
function _cpGsAmmesso(rAttuale, voluto) {
  const rV = _cpGsRango(voluto);
  if (rAttuale < 0 || rV < CPGS_IN_PROGRESS || rAttuale === CPGS_DONE) return false;
  return rV > rAttuale || (rV === CPGS_IN_PROGRESS && rAttuale === CPGS_IN_PENDING);
}

/* Pulsante accanto al badge (cpStatoCellHtml); t = stato già letto dalla colonna */
function cpGsBtnHtml(key, dateISO, t) {
  if (!t || !key || !cpGsPuo()) return '';
  return '<button type="button" class="no-print cp-gs-btn" data-help-key="cp-sistema-giornata" data-k="' + esc(key) + '" data-date="' + esc(dateISO) +
    '" title="Sistema stato e ore di questo sottotask senza aprire Jira (click destro per la guida)" onclick="cpGsApri(this)">✎</button>';
}

/* ---------- Apertura e lettura ---------- */

async function cpGsApri(btn) {
  if (!cpGsPuo()) return;
  const tr = btn.closest('tr');
  const d = _cpaDateSettimana(), iso = btn.dataset.date, g = d.iso.indexOf(iso);
  // Riga del Controllo Produzione (commessa|||squadra|||operatore|||giorno): serve per segnarci
  // la produzione scritta su Jira prima di DONE
  const parti = String((tr && tr.dataset.cpk) || '').split('|||');
  const riga = parti.length === 4 ? {
    cpk: tr.dataset.cpk, commessa: parti[0], squadra: parti[1], g: Number(parti[3]),
    cantiere: tr.dataset.cantiere || '', attivita: tr.dataset.attivita || '', anno: pwAnno, week: pwWeek,
  } : null;
  Object.assign(_cpGs, {
    aperto: true, key: btn.dataset.k, nome: (tr && tr.dataset.operatore) || '', iso, label: g >= 0 ? d.label[g] : iso,
    k: _cpaKey(pwAnno, pwWeek), d, caricando: true, errore: '', info: null, statoDa: null, tratti: [], altri: [], voluto: '',
    riga, prod: null, prodValore: '', passi: null, salvando: false,
  });
  _cpGsRender();
  await _cpGsCarica();
}

function cpGsChiudi() {
  _cpGs.aperto = false;
  const m = document.getElementById('cpgs-modal');
  if (m) m.style.display = 'none';
}

async function _cpGsCarica() {
  const key = _cpGs.key;
  _cpGs.caricando = true; _cpGs.errore = ''; _cpGs.caricaT0 = Date.now();
  _cpGsRender();
  const res = await _cpTlWlInvoca({ action: 'giornata', issueKey: key });
  if (!_cpGs.aperto || _cpGs.key !== key) return;
  _cpGs.caricando = false;
  if (res.errore || !res.ok) {
    _cpGs.errore = res.errore || 'Risposta non valida: l\'Edge Function jira-worklog-edit va aggiornata.';
    _cpGsRender();
    return;
  }
  _cpGs.info = res;
  const t = _cpStatoTicket[key];
  _cpGs.statoDa = t && t.statoDa && String(t.status || '').trim().toLowerCase() === String(res.stato || '').trim().toLowerCase()
    ? cpStatoDaInfo(t.statoDa) : null;
  const tratti = [], altri = [];
  (res.worklogs || []).forEach(w => {
    const p = _cpOjParti(w.started);
    if (p && p.data === _cpGs.iso) {
      tratti.push({ id: String(w.id), orig: w, inizio: p.min, fine: p.min + Math.round((Number(w.seconds) || 0) / 60), commento: w.commento || '', elimina: false, proposto: false });
    } else altri.push({ w, p });
  });
  tratti.sort((a, b) => a.inizio - b.inizio);
  // Proposta in base allo stato
  const r = _cpGsRango(res.stato), sd = _cpGs.statoDa;
  let voluto = '';
  if (r === CPGS_IN_PROGRESS) {
    // Casi 2-3: il tempo da quando è IN PROGRESS diventa un tratto; la fine la mette l'utente
    const ora = cpOraRoma();
    tratti.push({
      id: null, orig: null, inizio: sd && sd.data === _cpGs.iso ? sd.min : null,
      fine: ora && ora.data === _cpGs.iso ? ora.min : null, commento: '', elimina: false, proposto: true,
    });
    voluto = 'DONE';
  } else if (r >= 0 && r < CPGS_IN_PROGRESS) {
    // Caso 1: mai attivato
    if (!tratti.length) tratti.push({ id: null, orig: null, inizio: null, fine: null, commento: '', elimina: false, proposto: true });
    voluto = 'DONE';
  }
  _cpGs.tratti = tratti;
  _cpGs.altri = altri;
  _cpGs.voluto = voluto;
  _cpGs.prod = null;
  _cpGs.prodValore = '';
  _cpGsRender();
  if (_cpGsAmmesso(r, 'DONE')) _cpGsLeggiProd();
}

/* ---------- Produzione (per DONE) ----------
   Jira chiude in DONE solo con l'ACTUAL PRODUCTION del sottotask > 0: è quello il campo che blocca
   la transizione, anche sulle commesse che tengono la produzione su KPI_Quantità lavorata (v18.268.0).
   Se manca, la finestra propone di scriverla prima del cambio di stato, con lo stesso canale di
   «Sincronizza» (jira-update-production, delta, Task padre allineato).
   - Commessa su Actual Production: default il Km/Cad già in Controllo Produzione per questo ticket,
     altrimenti 1; il valore va anche nella riga (1 = segnaposto letto da Jira, fonte 'jira',
     «👁 da verificare», il report lo sostituisce; un altro valore = manuale).
   - Commessa su KPI_Quantità lavorata: default 1, solo su Jira. La riga non si tocca: il suo storico
     a delta è sul KPI, e segnarci l'Actual Production farebbe riscrivere tutto il valore al
     prossimo «Sincronizza». */

function _cpGsCampoCommessa() { return cpCampoProduzione(_cpGs.riga ? _cpGs.riga.commessa : ''); }
function _cpGsProdInRiga() { return _cpGsCampoCommessa() === CP_CAMPO_AP; }

function _cpGsKmLocale() {
  if (!_cpGsProdInRiga()) return null;   // il Km/Cad della riga è KPI_Quantità lavorata, non Actual Production
  const R = _cpGs.riga, cell = R && _cpData[R.cpk];
  const v = cell && cell.km_by_ticket ? Number(cell.km_by_ticket[_cpGs.key]) : NaN;
  return isFinite(v) && v > 0 ? v : null;
}

async function _cpGsLeggiProd() {
  const G = _cpGs, key = G.key;
  G.prod = { caricando: true, t0: Date.now() };
  _cpGsRender();
  try { await cpCampoProdLoad(); } catch (_) { /* resta il campo di default */ }
  const campo = CP_CAMPO_AP;   // il campo che il validatore verso DONE controlla
  const r = await _cpCwInvocaProd({ reads: [{ issueKey: key, campo }] });
  if (!G.aperto || G.key !== key) return;
  if (r.errore) G.prod = { errore: r.errore, campo };
  else {
    const v = Number((r.values || {})[key]);
    G.prod = { valore: isFinite(v) ? v : null, campo };
    if (!(v > 0)) G.prodValore = String(_cpGsKmLocale() || 1);
  }
  _cpGsRender();
}

function _cpGsProdHtml() {
  const G = _cpGs, P = G.prod;
  if (G.voluto !== 'DONE' || !P) return '';
  const box = (stile, html) => '<div class="text-xs mb-3" style="border-radius:6px;padding:8px 10px;' + stile + '">' + html + '</div>';
  if (P.caricando) return box('background:#f8fafc;color:#64748b;', cpAttesaHtml('Leggo la produzione del sottotask su Jira…', P.t0));
  if (P.errore) {
    return box('background:#fffbeb;color:#92400e;', '⚠ Produzione non letta da Jira (' + esc(P.errore) + '). Se manca, il sottotask si fermerà in IN PENDING: ' +
      '<button type="button" onclick="_cpGsLeggiProd()" class="underline">riprova a leggerla</button>.');
  }
  if (P.valore > 0) return box('background:#f0fdf4;color:#166534;', '✓ Produzione su Jira: <b>' + esc(String(P.valore)) + '</b> («' + esc(P.campo) + '»): si può chiudere in DONE.');
  const loc = _cpGsKmLocale(), inRiga = _cpGsProdInRiga();
  return box('background:#fffbeb;color:#92400e;',
    'Su Jira manca l\'<b>' + esc(P.campo) + '</b>: senza, Jira non lo chiude in DONE e si ferma in IN PENDING.' +
    (loc ? ' In Controllo Produzione c\'è già <b>' + esc(String(loc)) + '</b> per questo ticket.' : '') +
    (inRiga ? '' : ' La produzione di questa commessa resta su «' + esc(_cpGsCampoCommessa()) + '»: qui si scrive solo l\'' + esc(P.campo) + ' per poterlo chiudere.') +
    '<div class="flex flex-wrap items-center gap-2 mt-2" style="color:#334155;"><span class="font-semibold">Scrivi su Jira prima di chiuderlo:</span>' +
    '<input type="number" step="0.1" min="0" class="border border-slate-300 rounded px-2 py-1 text-sm bg-white" style="width:90px" ' +
    'value="' + esc(G.prodValore) + '" oninput="cpGsProd(this)">' +
    '<span class="text-[11px] text-slate-500">vuoto = non scriverla' + (loc || !inRiga ? '' : '; 1 resta «👁 da verificare» e il report la sostituisce') + '</span></div>');
}

function cpGsProd(el) { _cpGs.prodValore = el.value; cpGsControlla(); }

/* Produzione da scrivere: null (niente) | numero > 0 | NaN (valore non valido) */
function _cpGsProdDaScrivere() {
  const G = _cpGs, P = G.prod;
  if (G.voluto !== 'DONE' || !P || P.caricando || P.errore || P.valore > 0) return null;
  const s = String(G.prodValore || '').trim().replace(',', '.');
  if (!s) return null;
  const v = Number(s);
  return isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : NaN;
}

async function _cpGsScriviProd(val) {
  const G = _cpGs, P = G.prod, R = G.riga, key = G.key;
  const cur = Number(P.valore);
  const add = Math.round((val - (isFinite(cur) ? cur : 0)) * 1000) / 1000;
  const w = await _cpCwInvocaProd({ updates: [{ issueKey: key, add, campo: P.campo }] });
  const ris = w.results && w.results[key];
  if (w.errore || !ris || !ris.ok) {
    return { ok: false, testo: 'Produzione non scritta: ' + (w.errore || (w.errors && w.errors[key]) || 'risposta non valida') };
  }
  const testo = 'Produzione ' + val + ' su «' + (ris.campo || P.campo) + '»';
  // Commessa su KPI_Quantità lavorata: l'Actual Production serve solo a sbloccare DONE, la riga non si tocca
  if (!_cpGsProdInRiga()) return { ok: true, testo: testo + ' (solo per chiuderlo: la produzione della commessa resta su «' + _cpGsCampoCommessa() + '»)' };
  // Riga del Controllo Produzione: solo se la tabella mostra ancora la settimana aperta
  if (!R || R.anno !== pwAnno || R.week !== pwWeek) return { ok: true, testo: testo + ' (non segnata in Controllo Produzione: riga non trovata)' };
  const cell = _cpData[R.cpk] || (_cpData[R.cpk] = {});
  if (!cell.km_by_ticket || typeof cell.km_by_ticket !== 'object') cell.km_by_ticket = {};
  if (!cell.km_last_by_ticket || typeof cell.km_last_by_ticket !== 'object') cell.km_last_by_ticket = {};
  const prima = Number(cell.km_by_ticket[key]), fontePrima = cpKmMeta(cell, key).fonte;
  const fonte = prima === val && fontePrima !== 'jira' ? (fontePrima || 'manuale') : (val === 1 ? 'jira' : 'manuale');
  cell.km_by_ticket[key] = val;
  cell.km_last_by_ticket[key] = val;
  cpKmMetaSet(cell, key, { fonte, campoLast: ris.campo || P.campo });
  cell.km_cad = cpSumKm(cell.km_by_ticket);
  const rec = cpBuildRecordDa(cell, R.anno, R.week, R.commessa, R.squadra, G.nome, R.g, G.iso, R.cantiere, R.attivita);
  const { error } = await _sbClient.from('controllo_produzione').upsert([rec], { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
  return { ok: true, testo: testo + (error ? ' ⚠ ma non salvata in Controllo Produzione: ' + (error.message || error) : (fonte === 'jira' ? ' (👁 da verificare)' : '')) };
}

/* ---------- Form ---------- */

function _cpGsSituazione() {
  const G = _cpGs, r = _cpGsRango(G.info.stato), sd = G.statoDa;
  const da = sd ? (sd.oggi ? ' dalle ' : ' da ') + sd.testo : '';
  if (r === CPGS_IN_PROGRESS) {
    return 'È <b>IN PROGRESS' + esc(da) + '</b>. Se l\'operatore ha finito, metti l\'ora di fine vera e chiudilo: il worklog che Jira ' +
      'creerebbe da solo (fino al momento della chiusura) viene eliminato e restano le ore scritte qui. Se l\'ha attivato in ritardo, anticipa l\'inizio.';
  }
  if (r >= 0 && r < CPGS_IN_PROGRESS) {
    return 'Non è mai stato attivato (<b>' + esc(G.info.stato) + '</b>). Se l\'operatore ha lavorato, scrivi le ore e chiudilo. ' +
      'Se sta lavorando adesso, portalo IN PROGRESS: Jira conterà il tempo da adesso fino a quando lo sposta; le ore già fatte scrivile qui.';
  }
  if (r === CPGS_IN_PENDING) {
    return 'È <b>IN PENDING' + esc(da) + '</b> (in pausa). Se l\'operatore ha ripreso a lavorare senza riattivarlo, aggiungi il tratto mancante con «＋ Aggiungi tratto», ' +
      'oppure, se sta ancora lavorando, rimettilo IN PROGRESS (le ore fatte finora scrivile qui).';
  }
  if (r === CPGS_DONE) return 'È già <b>DONE</b>: puoi correggere le ore (es. attivato in ritardo: anticipa l\'inizio).';
  return 'Stato <b>' + esc(G.info.stato) + '</b> non previsto dal flusso dei sottotask: puoi solo correggere le ore.';
}

function _cpGsRender() {
  const modal = document.getElementById('cpgs-modal');
  const root = document.getElementById('cpgs-root');
  if (!modal || !root) return;
  modal.style.display = _cpGs.aperto ? 'flex' : 'none';
  if (!_cpGs.aperto) return;
  const G = _cpGs;
  const inp = 'border border-slate-300 rounded px-2 py-1 text-sm bg-white';
  const lab = 'block text-[11px] font-semibold text-slate-500 mb-0.5';
  const titolo = '<div style="font-weight:700;font-size:15px;color:#0f172a;font-family:var(--font-display);">✎ Sistema sottotask ' + esc(G.key) + '</div>' +
    '<div class="text-xs text-slate-500 mt-0.5 mb-3">' + esc(G.nome) + ' · ' + esc(G.label) + '</div>';
  // «Apri su Jira» sempre disponibile, anche mentre legge o dopo un errore
  const urlJira = (_cpStatoTicket[G.key] && _cpStatoTicket[G.key].url) || cpStatoUrlFor(G.key);
  const piede = (btn) => '<div class="flex flex-wrap items-center gap-2" style="padding:10px 20px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
    (urlJira ? '<a href="' + esc(urlJira) + '" target="_blank" rel="noopener" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white" style="text-decoration:none;color:#0f766e;">↗ Apri ' + esc(G.key) + ' su Jira</a>' : '') +
    '<div class="flex-1"></div>' +
    '<button type="button" onclick="cpGsChiudi()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white">Chiudi</button>' + (btn || '') + '</div>';

  // Durante «Applica su Jira»: i passi uno per uno, quello in corso con spinner e secondi
  if (G.passi) {
    const ico = { ok: '✓', ko: '✕', warn: '⚠' }, col = { '': '#334155', ok: '#0f766e', ko: '#b91c1c', warn: '#b45309' };
    root.innerHTML = '<div style="padding:16px 20px 14px;">' + titolo +
      '<div class="text-sm font-semibold mb-2" style="color:#0f766e">' +
        (G.salvando ? 'Sto lavorando su Jira: non chiudere la pagina, la finestra si chiude da sola alla fine.' : 'Finito.') + '</div>' +
      G.passi.map(p => '<div class="text-xs mb-1.5" style="color:' + col[p.esito] + '">' +
        (p.esito ? ico[p.esito] + ' ' + esc(p.testo.replace(/…$/, '')) : cpAttesaHtml(p.testo, p.t0)) +
        (p.nota ? '<div class="text-[11px] text-slate-500" style="margin-left:17px">' + esc(p.nota) + '</div>' : '') + '</div>').join('') +
      '</div>';
    return;
  }

  if (G.caricando || G.errore || !G.info) {
    root.innerHTML = '<div style="padding:16px 20px 10px;">' + titolo +
      (G.errore ? '<div class="text-sm text-red-700 mb-2">✕ ' + esc(G.errore) + '</div>'
        : '<div class="text-sm text-slate-500 mb-2">' + cpAttesaHtml('Leggo stato e worklog del sottotask da Jira…', G.caricaT0) + '</div>') +
      '</div>' + piede(G.errore ? '<button type="button" onclick="_cpGsCarica()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white">↻ Riprova</button>' : '');
    return;
  }

  const info = G.info, r = _cpGsRango(info.stato);
  const ticket = '<div class="text-sm mb-2">' + (info.summary ? esc(info.summary) : '') +
    (urlJira ? ' <a href="' + esc(urlJira) + '" target="_blank" rel="noopener" class="text-xs text-teal-700 underline whitespace-nowrap">Apri su Jira ↗</a>' : '') +
    (info.assegnatario ? '<div class="text-[11px] text-slate-500">Assegnato a ' + esc(info.assegnatario.nome) + '</div>' : '<div class="text-[11px] text-amber-700">Non assegnato</div>') + '</div>';

  // Stato finale: in avanti, più IN PENDING → IN PROGRESS (un DONE da qui non si riapre)
  let opz = '<option value=""' + (G.voluto === '' ? ' selected' : '') + '>Lascia «' + esc(info.stato) + '»</option>';
  [['IN PROGRESS', 'IN PROGRESS (al lavoro)'], ['IN PENDING', 'IN PENDING (in pausa)'], ['DONE', 'DONE (finito)']].forEach(([v, testo]) => {
    if (_cpGsAmmesso(r, v)) opz += '<option value="' + v + '"' + (G.voluto === v ? ' selected' : '') + '>' + testo + '</option>';
  });

  const righe = G.tratti.map((t, i) => {
    const barrato = t.elimina ? 'text-decoration:line-through;opacity:.5;' : '';
    const tag = t.id ? '<span class="text-[10px] text-slate-500" title="Worklog su Jira' + (t.orig && t.orig.autore ? ' di ' + esc(t.orig.autore) : '') + '">Jira</span>'
      : '<span class="text-[10px] font-semibold" style="color:#0f766e">nuovo</span>';
    const azione = t.id
      ? '<button type="button" onclick="cpGsElimina(' + i + ')" class="text-xs px-1.5" title="' + (t.elimina ? 'Non eliminare' : 'Elimina questo worklog da Jira') + '">' + (t.elimina ? '↺' : '🗑') + '</button>'
      : '<button type="button" onclick="cpGsTogli(' + i + ')" class="text-xs px-1.5" title="Togli questo tratto">✕</button>';
    const dis = t.elimina ? ' disabled' : '';
    return '<tr style="' + barrato + '">' +
      '<td style="padding:3px 4px">' + tag + '</td>' +
      '<td style="padding:3px 4px"><input type="time" step="60" class="' + inp + '" data-i="' + i + '" data-f="inizio" value="' + (t.inizio == null ? '' : _cpTlWlHHMM(t.inizio)) + '" oninput="cpGsCampo(this)"' + dis + '></td>' +
      '<td style="padding:3px 4px"><input type="time" step="60" class="' + inp + '" data-i="' + i + '" data-f="fine" value="' + (t.fine == null ? '' : _cpTlWlHHMM(t.fine)) + '" oninput="cpGsCampo(this)"' + dis + '></td>' +
      '<td style="padding:3px 4px" class="text-xs text-slate-600 whitespace-nowrap" id="cpgs-dur-' + i + '"></td>' +
      '<td style="padding:3px 4px;width:100%"><input type="text" maxlength="2000" class="' + inp + ' w-full" placeholder="commento" data-i="' + i + '" data-f="commento" value="' + esc(t.commento) + '" oninput="cpGsCampo(this)"' + dis + '></td>' +
      '<td style="padding:3px 4px">' + azione + '</td></tr>';
  }).join('');
  const altri = G.altri.length ? '<div class="text-[11px] text-slate-500 mt-1">Su questo sottotask ci sono anche ' + G.altri.length + ' worklog in altri giorni (' +
    G.altri.map(a => a.p ? a.p.data.slice(8, 10) + '/' + a.p.data.slice(5, 7) + ' ' + _cpOjOra(a.p.min) + ' · ' + _cpOjDurata((Number(a.w.seconds) || 0) / 60) : '?').map(esc).join(', ') +
    '): qui non si toccano, si correggono dalla Timeline worklog.</div>' : '';

  root.innerHTML =
    '<div style="padding:16px 20px 6px;">' + titolo + ticket +
      '<div class="text-xs mb-3" style="background:#f1f5f9;border-radius:6px;padding:8px 10px;color:#334155;">' + _cpGsSituazione() + '</div>' +
      '<div class="mb-3"><span class="' + lab + '">Stato finale</span><select class="' + inp + '" onchange="cpGsVoluto(this)">' + opz + '</select></div>' +
      _cpGsProdHtml() +
      '<span class="' + lab + '">Ore di lavoro su questo sottotask, ' + esc(G.label) + '</span>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr class="text-[11px] text-slate-500"><th></th><th style="text-align:left;padding:0 4px">Inizio</th><th style="text-align:left;padding:0 4px">Fine</th><th></th><th style="text-align:left;padding:0 4px">Commento</th><th></th></tr></thead>' +
      '<tbody>' + (righe || '<tr><td colspan="6" class="text-xs text-slate-400" style="padding:4px">Nessun worklog in questo giorno.</td></tr>') + '</tbody></table>' +
      '<button type="button" onclick="cpGsAggiungi()" class="text-xs px-2 py-1 mt-1 rounded border border-slate-300 bg-white">＋ Aggiungi tratto</button>' +
      altri +
      '<div id="cpgs-check" class="text-xs mt-3 mb-1" style="min-height:18px;"></div>' +
    '</div>' +
    piede('<button type="button" id="cpgs-applica" onclick="cpGsApplica()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#0f766e;">Applica su Jira</button>');
  cpGsControlla();
}

function cpGsCampo(el) {
  const t = _cpGs.tratti[Number(el.dataset.i)];
  if (!t) return;
  if (el.dataset.f === 'commento') t.commento = el.value;
  else t[el.dataset.f] = _cpTlWlMin(el.value);
  cpGsControlla();
}

function cpGsVoluto(el) { _cpGs.voluto = el.value; _cpGsRender(); }   // ridisegna: mostra/nasconde la produzione

function cpGsAggiungi() {
  const vivi = _cpGs.tratti.filter(t => !t.elimina && t.fine != null);
  const inizio = vivi.length ? Math.min(1380, Math.max(...vivi.map(t => t.fine))) : null;
  _cpGs.tratti.push({ id: null, orig: null, inizio, fine: null, commento: '', elimina: false, proposto: false });
  _cpGsRender();
}

function cpGsTogli(i) { _cpGs.tratti.splice(i, 1); _cpGsRender(); }

function cpGsElimina(i) {
  const t = _cpGs.tratti[i];
  if (!t || !t.id) return;
  t.elimina = !t.elimina;
  if (t.elimina) { t.inizio = _cpOjParti(t.orig.started).min; t.fine = t.inizio + Math.round((Number(t.orig.seconds) || 0) / 60); t.commento = t.orig.commento || ''; }
  _cpGsRender();
}

/* Operazioni da fare + errori (bloccano) e avvisi */
function _cpGsVerifica() {
  const G = _cpGs, out = { errori: [], avvisi: [], crea: [], modifica: [], elimina: [], stato: '', prod: null };
  if (!G.info) return out;
  const r = _cpGsRango(G.info.stato), ora = cpOraRoma();
  if (G.voluto && _cpGsAmmesso(r, G.voluto)) out.stato = G.voluto;
  if (out.stato === 'DONE') {
    const pv = _cpGsProdDaScrivere();
    if (Number.isNaN(pv)) out.errori.push('Produzione: scrivi un numero maggiore di 0, oppure lascia vuoto.');
    else out.prod = pv;
    if (G.prod && G.prod.caricando) out.errori.push('Sto ancora leggendo la produzione da Jira, un attimo.');
  }
  const vivi = [];
  G.tratti.forEach((t, i) => {
    if (t.elimina) { out.elimina.push(t); return; }
    if (!t.id && t.inizio == null && t.fine == null) return;   // tratto nuovo lasciato vuoto
    const n = 'Tratto ' + (i + 1);
    if (t.inizio == null || t.fine == null) { out.errori.push(n + ': indica ora di inizio e di fine.'); return; }
    if (t.fine <= t.inizio) { out.errori.push(n + ': la fine deve essere dopo l\'inizio.'); return; }
    if (ora && (G.iso > ora.data || (G.iso === ora.data && t.fine > ora.min))) { out.errori.push(n + ': non può finire nel futuro.'); return; }
    if (t.fine - t.inizio > CPTL_WL_LUNGO_MIN) out.avvisi.push(n + ': durata lunga (' + _cpOjDurata(t.fine - t.inizio) + ').');
    vivi.push({ t, n });
    if (!t.id) out.crea.push(t);
    else {
      const p = _cpOjParti(t.orig.started), dur = Math.round((Number(t.orig.seconds) || 0) / 60);
      if (!p || p.min !== t.inizio || p.min + dur !== t.fine || (t.commento || '').trim() !== (t.orig.commento || '').trim()) out.modifica.push(t);
    }
  });
  vivi.sort((a, b) => a.t.inizio - b.t.inizio);
  for (let i = 1; i < vivi.length; i++) {
    if (vivi[i].t.inizio < vivi[i - 1].t.fine) out.errori.push(vivi[i - 1].n + ' e ' + vivi[i].n.toLowerCase() + ' si sovrappongono.');
  }
  // Sovrapposizioni con worklog dell'operatore su altri ticket nello stesso giorno (dati della Timeline)
  try {
    const g = G.d.iso.indexOf(G.iso);
    const x = g >= 0 ? _cpTlWlRiga(G.nome, g) : null;
    (x ? x.interventi : []).forEach(iv => {
      if (iv.inCorso || !iv.t || iv.t.key === G.key) return;
      vivi.forEach(v => {
        if (iv.inizio < v.t.fine && iv.fine > v.t.inizio) out.avvisi.push(v.n + ' si sovrappone a ' + iv.t.key + ' ' + _cpOjOra(iv.inizio) + '–' + _cpOjOra(iv.fine) + '.');
      });
    });
  } catch (_) { /* dati della Timeline non disponibili: niente controllo */ }
  const sd = G.statoDa;
  if (r === CPGS_IN_PROGRESS && !out.stato && sd && sd.data === G.iso && vivi.some(v => v.t.fine > sd.min)) {
    out.avvisi.push('Resta IN PROGRESS: il tempo dalle ' + _cpOjOra(sd.min) + ' lo registrerà Jira alla chiusura, un tratto scritto qui dopo quell\'ora sarebbe contato due volte.');
  }
  if (out.stato && r === CPGS_IN_PROGRESS && !vivi.length) {
    out.avvisi.push('Nessun tratto: il tempo passato in IN PROGRESS non resterà registrato (il worklog dell\'automazione viene eliminato).');
  }
  if (out.stato && out.stato !== 'IN PROGRESS' && r < CPGS_IN_PROGRESS && !vivi.length) out.avvisi.push('Nessuna ora: il sottotask si chiude senza worklog.');
  const P = G.prod;
  if (out.stato === 'DONE' && out.prod == null && !(P && P.valore > 0)) {
    out.avvisi.push(P && !P.errore && !P.caricando
      ? 'Senza produzione su Jira il sottotask si ferma in IN PENDING, non in DONE.'
      : 'Per DONE Jira vuole l\'Actual Production: se manca, il sottotask si ferma in IN PENDING.');
  }
  if (out.stato === 'IN PROGRESS') {
    out.avvisi.push('Da IN PROGRESS Jira registra da solo il tempo da adesso a quando l\'operatore lo sposta: le ore fatte prima vanno scritte qui come tratti.');
    if (ora && G.iso !== ora.data) out.avvisi.push('La riga è di ' + G.label + ', non di oggi: il tempo che conterà Jira parte da adesso, non da quel giorno.');
  }
  return out;
}

function cpGsControlla() {
  const box = document.getElementById('cpgs-check'), btn = document.getElementById('cpgs-applica');
  if (!box) return;
  _cpGs.tratti.forEach((t, i) => {
    const el = document.getElementById('cpgs-dur-' + i);
    if (el) el.textContent = t.inizio != null && t.fine != null && t.fine > t.inizio ? _cpOjDurata(t.fine - t.inizio) : '';
  });
  const v = _cpGsVerifica();
  const niente = !v.stato && !v.crea.length && !v.modifica.length && !v.elimina.length;
  const righe = [];
  if (!niente) {
    const cosa = [];
    if (v.prod != null) cosa.push('produzione ' + v.prod + ' su Jira');
    if (v.stato) cosa.push(_cpGs.info.stato + ' → ' + v.stato);
    if (v.crea.length) cosa.push(v.crea.length + ' worklog da aggiungere');
    if (v.modifica.length) cosa.push(v.modifica.length + ' da correggere');
    if (v.elimina.length) cosa.push(v.elimina.length + ' da eliminare');
    righe.push('<span class="text-slate-600">' + esc(cosa.join(' · ')) + '</span>');
  }
  v.errori.forEach(e => righe.push('<span class="text-red-700">✕ ' + esc(e) + '</span>'));
  v.avvisi.forEach(a => righe.push('<span class="text-amber-700">⚠ ' + esc(a) + '</span>'));
  box.innerHTML = righe.join('<br>');
  if (btn) {
    const off = niente || !!v.errori.length || _cpGs.salvando;
    btn.disabled = off;
    btn.style.opacity = off ? '.5' : '';
  }
}

/* ---------- Scrittura su Jira ---------- */

/* Avanzamento mostrato nella finestra durante «Applica su Jira» */
function _cpGsPasso(testo, nota) {
  _cpGs.passi.push({ testo, esito: '', nota: nota || '', t0: Date.now() });
  _cpGsRender();
  return _cpGs.passi[_cpGs.passi.length - 1];
}
function _cpGsFatto(p, esito, nota) {
  p.esito = esito;
  p.nota = nota || '';
  _cpGsRender();
}

function _cpGsDove(inizio, fine) { return _cpOjOra(inizio) + '–' + _cpOjOra(fine) + ' (' + _cpOjDurata(fine - inizio) + ')'; }

async function cpGsApplica() {
  const G = _cpGs;
  if (G.salvando || !cpGsPuo() || !G.info) return;
  const v = _cpGsVerifica();
  if (v.errori.length) { cpGsControlla(); return; }
  const righe = [];
  if (v.prod != null) righe.push('Produzione: scrivo ' + v.prod + ' su «' + G.prod.campo + '» (prima di chiuderlo)');
  if (v.stato) {
    righe.push('Stato: ' + G.info.stato + ' → ' + v.stato + (_cpGsRango(G.info.stato) === CPGS_IN_PROGRESS || v.stato === 'DONE'
      ? ' (i worklog che l\'automazione Jira crea uscendo da IN PROGRESS vengono eliminati)' : ''));
  }
  v.elimina.forEach(t => righe.push('Elimina worklog ' + _cpGsDove(t.inizio, t.fine)));
  v.modifica.forEach(t => {
    const p = _cpOjParti(t.orig.started), dur = Math.round((Number(t.orig.seconds) || 0) / 60);
    righe.push('Correggi worklog ' + (p ? _cpGsDove(p.min, p.min + dur) : '') + ' → ' + _cpGsDove(t.inizio, t.fine));
  });
  v.crea.forEach(t => righe.push('Aggiungi worklog ' + _cpGsDove(t.inizio, t.fine)));
  const msg = 'Su Jira, sottotask ' + G.key + ' di ' + G.nome + ', ' + G.label + ':\n\n• ' + righe.join('\n• ') +
    '\n\nI worklog aggiunti risultano a nome dell\'assegnatario; la stima residua non cambia. Da qui non si torna indietro con «Indietro».' +
    (v.avvisi.length ? '\n\n⚠ ' + v.avvisi.join('\n⚠ ') : '');
  if (!await showConfirmAsync(msg, 'Applica su Jira')) return;

  G.salvando = true;
  G.passi = [];
  _cpGsRender();
  const fatti = [], problemi = [];
  let ricarica = false, prodScritta = false;
  try {
    // a0. Produzione prima di DONE (se non riesce, la funzione lo ferma in IN PENDING come prima)
    if (v.prod != null) {
      const pp = _cpGsPasso('Scrivo la produzione ' + v.prod + ' su «' + G.prod.campo + '»…');
      const pr = await _cpGsScriviProd(v.prod);
      _cpGsFatto(pp, pr.ok ? 'ok' : 'ko', pr.testo);
      if (pr.ok) { fatti.push(pr.testo); prodScritta = true; }
      else problemi.push(pr.testo);
    }
    // a. Stato (prima dei worklog: i worklog nuovi dell'automazione si riconoscono come "nuovi")
    if (v.stato) {
      // Uscendo da IN PROGRESS la funzione aspetta il worklog dell'automazione Jira per eliminarlo
      const esce = _cpGsRango(G.info.stato) === CPGS_IN_PROGRESS || v.stato === 'DONE';
      const ps = _cpGsPasso('Porto ' + G.key + ' da «' + G.info.stato + '» a ' + v.stato + '…',
        esce ? 'Jira impiega 10–20 secondi: aspetto il worklog che l\'automazione crea uscendo da IN PROGRESS, per eliminarlo.' : '');
      const res = await _cpTlWlInvoca({ action: 'stato', issueKey: G.key, voluto: v.stato, atteso: { stato: G.info.stato }, operatore: G.nome });
      if (res.codice === 'cambiato') {
        _cpGsFatto(ps, 'ko', res.errore || 'Lo stato è cambiato su Jira nel frattempo.');
        showAlertModal(res.errore || 'Lo stato è cambiato su Jira nel frattempo.');
        ricarica = true;
        return;
      }
      if (res.errore || !res.ok) {
        // Con errore la funzione restituisce comunque i passi fatti (nel corpo dell'errore non li vediamo: si rilegge)
        _cpGsFatto(ps, 'ko', res.errore || 'risposta non valida');
        problemi.push('Stato: ' + (res.errore || 'risposta non valida'));
        ricarica = true;
        return;
      }
      const t = 'Stato: ' + res.prima + ' → ' + res.dopo + (res.rimossi && res.rimossi.length ? ' (eliminati ' + res.rimossi.length + ' worklog dell\'automazione)' : '');
      _cpGsFatto(ps, res.avviso ? 'warn' : 'ok', t + (res.avviso ? ' ⚠ ' + res.avviso : ''));
      fatti.push(t);
      if (res.avviso) problemi.push(res.avviso);
    }
    // b. Worklog: prima le eliminazioni (Tempo conta 12 h al giorno per autore), poi correzioni e aggiunte
    const email = _cpTlEmailPerNome()[G.nome] || '';
    let forza = false;
    for (const t of v.elimina) {
      const p = _cpGsPasso('Elimino il worklog ' + _cpGsDove(t.inizio, t.fine) + '…');
      const res = await _cpTlWlInvoca({ action: 'delete', issueKey: G.key, worklogId: t.id, operatore: G.nome, atteso: { started: t.orig.started, seconds: t.orig.seconds } });
      if (res.ok) { fatti.push('Eliminato ' + _cpGsDove(t.inizio, t.fine)); _cpGsFatto(p, res.avviso ? 'warn' : 'ok', res.avviso || ''); }
      else { problemi.push('Eliminazione ' + _cpGsDove(t.inizio, t.fine) + ': ' + (res.errore || 'non riuscita')); _cpGsFatto(p, 'ko', res.errore || 'non riuscita'); }
    }
    for (const t of v.modifica) {
      const p = _cpGsPasso('Correggo il worklog → ' + _cpGsDove(t.inizio, t.fine) + '…');
      const body = { action: 'update', issueKey: G.key, worklogId: t.id, data: G.iso, inizioMin: t.inizio, durataMin: t.fine - t.inizio,
        operatore: G.nome, email, atteso: { started: t.orig.started, seconds: t.orig.seconds } };
      if ((t.commento || '').trim() !== (t.orig.commento || '').trim()) body.commento = (t.commento || '').trim();
      const res = await _cpTlWlInvoca(body);
      if (res.ok) { fatti.push('Corretto → ' + _cpGsDove(t.inizio, t.fine) + (res.avviso ? ' ⚠ ' + res.avviso : '')); _cpGsFatto(p, res.avviso ? 'warn' : 'ok', res.avviso || ''); }
      else { problemi.push('Correzione → ' + _cpGsDove(t.inizio, t.fine) + ': ' + (res.errore || 'non riuscita')); _cpGsFatto(p, 'ko', res.errore || 'non riuscita'); }
    }
    for (const t of v.crea) {
      const p = _cpGsPasso('Aggiungo il worklog ' + _cpGsDove(t.inizio, t.fine) + '…');
      const body = { action: 'create', issueKey: G.key, data: G.iso, inizioMin: t.inizio, durataMin: t.fine - t.inizio, operatore: G.nome, email, forza };
      if ((t.commento || '').trim()) body.commento = t.commento.trim();
      let res = await _cpTlWlInvoca(body);
      if (res.codice === 'assegnatario_diverso' && !forza) {
        forza = await showConfirmAsync(res.errore + '\n\nAggiungere comunque le ore?', 'Aggiungi comunque');
        if (forza) res = await _cpTlWlInvoca(Object.assign({}, body, { forza: true }));
      }
      const autore = res.dopo && res.dopo.autore ? ' (autore ' + res.dopo.autore + ')' : '';
      if (res.ok) { fatti.push('Aggiunto ' + _cpGsDove(t.inizio, t.fine) + autore + (res.avviso ? ' ⚠ ' + res.avviso : '')); _cpGsFatto(p, res.avviso ? 'warn' : 'ok', (autore.trim() + ' ' + (res.avviso || '')).trim()); }
      else { problemi.push('Aggiunta ' + _cpGsDove(t.inizio, t.fine) + ': ' + (res.errore || 'non riuscita')); _cpGsFatto(p, 'ko', res.errore || 'non riuscita'); }
    }
  } finally {
    G.salvando = false;
    G.passi = null;
    const nome = G.nome, k = G.k, d = G.d;
    const esito = (fatti.length ? '✓ ' + G.key + ': ' + fatti.join(' · ') + '.' : '') +
      (problemi.length ? ' ⚠ ' + problemi.join(' · ') : '');
    if (ricarica) {
      await _cpGsCarica();
      if (problemi.length) showAlertModal('Jira non ha accettato la modifica.\n\n' + problemi.join('\n\n') + '\n\nHo riletto il sottotask: controlla e riprova.');
    } else {
      cpGsChiudi();
      showAlertModal((fatti.length ? 'Fatto su Jira (' + G.key + '):\n\n• ' + fatti.join('\n• ') : 'Nessuna modifica fatta.') +
        (problemi.length ? '\n\n⚠ Da controllare:\n• ' + problemi.join('\n• ') : '') +
        '\n\nPer aggiornare «Ore Jira» usa «🔄 Sincronizza da Jira».');
    }
    cpStatoRefresh(true);
    if (prodScritta) { try { pwControlloRender(); } catch (_) { /* tabella non aperta */ } }   // Km/Cad della riga
    if (fatti.length && _cpTl.letture[k]) _cpTlWlRileggiOperatore(nome, k, d, esito + ' Per aggiornare «Ore Jira» usa «🔄 Sincronizza da Jira».');
  }
}
