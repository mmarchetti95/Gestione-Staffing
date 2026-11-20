/* ==================== CONTROLLO PRODUZIONE · COPIA WORKLOG FRA OPERATORI DELLA SQUADRA ====================
   «⧉ Copia worklog» sulla riga del giorno di una squadra (v18.258.0), per admin e responsabili.
   Caso tipico: un operatore ha lavorato con la squadra ma si è dimenticato di usare Jira; le ore
   vere sono quelle del compagno, quindi si ricopiano i worklog del compagno sui sottotask suoi.
   - All'apertura legge da Jira (jira-sync-worklogs, sola lettura) i worklog del giorno di tutti
     gli operatori della squadra e lo stato dei sottotask coinvolti (jira-task-status).
   - Si scelgono «Da» (chi ha i worklog) e «A» (chi li ha dimenticati): ogni worklog del primo
     diventa una riga con il sottotask del secondo proposto. Abbinamento: il sottotask di partenza
     → cantiere + attività in Griglia (_cpaIndiceSottotask) → il sottotask Griglia dell'operatore
     «A» quel giorno con lo stesso cantiere e attività (poi solo cantiere, se unico). Mai per nome
     del ticket. Senza abbinamento la chiave si sceglie a mano.
   - Orari e commento sono modificabili; un worklog già presente uguale sullo stesso sottotask
     («già copiato») parte deselezionato.
   - Sostituzione (v18.273.0): la copia allinea «A» a «Da», non somma. I worklog che «A» ha già
     quel giorno sono elencati e partono spuntati per l'eliminazione, tranne quelli uguali a uno
     da copiare (si tengono) e quelli su sottotask di un'altra commessa (quel giorno può aver
     lavorato altrove). Si eliminano dopo lo stato e prima delle aggiunte (Tempo conta 12 h al
     giorno per autore); su un sottotask il cui stato è cambiato nel frattempo non si tocca nulla.
   - Stato: se il sottotask del compagno è IN PENDING/DONE e quello dell'operatore è indietro,
     propone di portarlo allo stesso stato (solo in avanti, azione "stato" di jira-worklog-edit,
     come «✎ Sistema giornata»: prima lo stato, poi i worklog, così quelli dell'automazione Jira
     si riconoscono come nuovi e vengono eliminati).
   - Scrive SOLO con jira-worklog-edit (stato/delete/create), dopo una conferma; autore = assegnatario
     del sottotask via Tempo quando c'è il token. Non aggiorna controllo_produzione: «Ore Jira»
     si aggiorna con «🔄 Sincronizza squadra». I dipendenti fornitore non sono destinatari: i
     loro worklog li gestisce «🏢 Worklog fornitori», che cancellerebbe le copie fatte a mano.
   Modal #cpcw-modal (z-index 99995: sotto conferme e avvisi). */

const CPCW_FN_NASCOSTA = 'controllo:copia-worklog';

let _cpCw = {
  aperto: false,
  commessa: '', squadra: '', g: 0, iso: '', label: '',
  k: '', d: null,             // settimana ('anno|week') e date su cui è stato aperto
  caricando: false, errore: '', avvisi: [],
  membri: [],                 // { nome, email, fornitore, voci: [{ commessa, cantiere, attivita, key }] }
  letti: {},                  // nome -> { interventi, minuti } (solo chi è stato letto)
  da: '', a: '',
  righe: [],                  // vedi _cpCwCostruisciRighe
  elimina: {},                // id worklog di «A» -> true se va eliminato (la copia lo sostituisce)
  esistInfo: {},              // id worklog di «A» -> { altra: commessa|'', uguale: bool }
  statoNo: {},                // chiave destinazione -> true se l'utente non vuole il cambio di stato
  salvando: false,
  passi: null,                // durante la copia: [{ testo, esito: ''|'ok'|'ko'|'warn', nota }]
};

function cpCwPuo() {
  if (!_sbClient || !_sbUser || !sbCanWrite()) return false;
  return !(sbFnApplicaNascoste() && sbFnNascosta(CPCW_FN_NASCOSTA));
}

/* Pulsante sulla riga del giorno della squadra (pwControlloRender): servono almeno due operatori
   e un giorno non futuro. */
function cpCwBtnHtml(commessa, squadra, g, nOperatori, dateISO) {
  if (nOperatori < 2 || dateISO > _cpaOggiISO() || !cpCwPuo()) return '';
  return '<button type="button" class="no-print cp-cw-btn" data-help-key="cp-copia-worklog" data-commessa="' + esc(commessa) +
    '" data-squadra="' + esc(squadra) + '" data-g="' + g + '" title="Copia i worklog Jira di un operatore della squadra su un compagno che si è dimenticato di farli (click destro per la guida)" ' +
    'style="margin-left:10px;font-size:11px;font-weight:600;background:#fff;color:#0f766e;border:1px solid #5eead4;border-radius:5px;padding:1px 8px;cursor:pointer;" ' +
    'onclick="event.stopPropagation();cpCwApri(this)">⧉ Copia worklog</button>';
}

function _cpCwNorm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

/* Operatori della squadra con cantieri quel giorno (come le righe del Controllo Produzione) e,
   per ognuno, i sottotask Griglia di tutte le sue voci del giorno (anche di altre commesse). */
function _cpCwMembri(commessa, squadra, g) {
  const data = pwGetWeekData(), email = opEmailMappa();
  const nomi = [];
  data.forEach(bc => {
    if (bc.commessa !== commessa) return;
    (bc.squadre || []).forEach(sq => {
      if ((sq.nome || 'Squadra') !== squadra) return;
      (sq.operatori || []).forEach(op => {
        const n = (op.nome || '').trim();
        if (!n || nomi.includes(n)) return;
        const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
        if (!pwCellCantieri(opG).length || pwFerieTipoGiornata(n, g)) return;
        nomi.push(n);
      });
    });
  });
  return nomi.map(nome => {
    const voci = [];
    data.forEach(bc => {
      if (!bc.commessa) return;
      (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
        if ((op.nome || '').trim() !== nome) return;
        const opG = (op.giorni || {})[g] || {};
        // Riga del Controllo Produzione della voce: serve per segnarci la produzione messa a 1
        const cella = { squadra: sq.nome || 'Squadra', cantiere: pwCellCantieri(opG).join(', '), attivita: opG.attivita || '' };
        pwCellVoci(opG).forEach(v => {
          const att = pwJiraAttivitaSottotask(bc, v.cantiere, nome, v.attivita);
          const e = pwJiraSubtaskEntry(bc, v.cantiere, nome, att, g);
          voci.push({ commessa: bc.commessa, cantiere: v.cantiere, attivita: att || '', key: pwJiraSubtaskIsResolved(e) && e.key ? e.key : '', cella });
        });
      }));
    });
    return { nome, email: email[nome] || '', fornitore: !!fornitoreDiNome(nome), voci };
  });
}

/* ---------- Apertura e lettura ---------- */

async function cpCwApri(btn) {
  if (!cpCwPuo()) return;
  const d = _cpaDateSettimana(), g = Number(btn.dataset.g);
  Object.assign(_cpCw, {
    aperto: true, commessa: btn.dataset.commessa, squadra: btn.dataset.squadra, g, iso: d.iso[g], label: d.label[g],
    k: _cpaKey(pwAnno, pwWeek), d, caricando: true, errore: '', avvisi: [], membri: [], letti: {},
    da: '', a: '', righe: [], elimina: {}, esistInfo: {}, statoNo: {}, salvando: false, passi: null,
  });
  _cpCw.membri = _cpCwMembri(_cpCw.commessa, _cpCw.squadra, g);
  _cpCwRender();
  await _cpCwCarica();
}

function cpCwChiudi() {
  if (_cpCw.salvando) return;   // copia in corso: la finestra mostra l'avanzamento
  _cpCw.aperto = false;
  const m = document.getElementById('cpcw-modal');
  if (m) m.style.display = 'none';
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_cpCw.aperto) return;
  const mr = document.getElementById('modal-root');
  if (mr && mr.children.length) return;   // c'è una conferma/avviso aperto sopra
  cpCwChiudi();
});

async function _cpCwCarica() {
  const C = _cpCw, prima = { da: C.da, a: C.a }, apertura = C.k + '|' + C.iso + '|' + C.commessa + '|' + C.squadra;
  const ancora = () => C.aperto && (C.k + '|' + C.iso + '|' + C.commessa + '|' + C.squadra) === apertura;
  C.caricando = true; C.errore = ''; C.avvisi = [];
  _cpCwRender();
  try {
    const conEmail = C.membri.filter(m => m.email);
    const senza = C.membri.filter(m => !m.email).map(m => m.nome);
    if (senza.length) C.avvisi.push('Senza email in anagrafica, worklog non letti: ' + senza.join(', ') + '.');
    const nomeByEmail = {};
    conEmail.forEach(m => { nomeByEmail[m.email.toLowerCase()] = m.nome; });
    const emails = Object.keys(nomeByEmail), letti = {};
    for (let i = 0; i < emails.length; i += CPA_EMAIL_CHUNK) {
      const blocco = emails.slice(i, i + CPA_EMAIL_CHUNK);
      const { data: fn, error } = await _sbClient.functions.invoke('jira-sync-worklogs', { body: { emails: blocco, startDate: C.iso, endDate: C.iso } });
      if (error) throw new Error(await _cpEdgeErr(error, 'jira-sync-worklogs'));
      const res = (fn && fn.results) || {}, errs = (fn && fn.errors) || {};
      blocco.forEach(em => {
        const nome = nomeByEmail[em];
        if (errs[em]) { C.avvisi.push(nome + ': ' + errs[em] + ' (worklog non letti).'); return; }
        const tickets = (res[em] && res[em][C.iso] && res[em][C.iso].tickets) || [];
        const r = cpOreJiraInterventi(tickets, C.iso);
        if (r.senzaOrari.length) C.avvisi.push(nome + ': alcuni worklog senza orari (Edge Function jira-sync-worklogs da aggiornare).');
        const interventi = r.interventi.filter(iv => iv.w && iv.inizio >= 0 && iv.fine <= 1440).map(iv => Object.assign(iv, { fine: Math.round(iv.fine) }));
        letti[nome] = { interventi, minuti: interventi.reduce((s, iv) => s + (iv.fine - iv.inizio), 0) };
      });
    }
    if (!ancora()) return;
    C.letti = letti;
    // Stato dei sottotask coinvolti, fresco (serve per proporre il cambio di stato)
    const keys = new Set();
    C.membri.forEach(m => m.voci.forEach(v => { if (v.key) keys.add(v.key); }));
    Object.values(letti).forEach(l => l.interventi.forEach(iv => keys.add(iv.t.key)));
    const tutte = [...keys];
    for (let i = 0; i < tutte.length; i += CP_STATO_CHUNK) {
      const c = tutte.slice(i, i + CP_STATO_CHUNK);
      const { data, error } = await _sbClient.functions.invoke('jira-task-status', { body: { subtaskKeys: c, soloSottotask: true, statoDa: true } });
      if (error || (data && data.error)) { C.avvisi.push('Stato dei sottotask non letto: il cambio di stato non viene proposto.'); break; }
      const sub = (data && data.subtasks) || {};
      c.forEach(k => { _cpStatoTicket[k] = sub[k] || null; });
    }
    if (!ancora()) return;
    // Proposta: «A» = chi ha meno ore (non fornitore, con email), «Da» = chi ne ha di più.
    // Su «↻ Rileggi» restano le scelte fatte, se ancora valide.
    const destinabili = C.membri.filter(m => m.email && !m.fornitore && letti[m.nome]);
    destinabili.sort((x, y) => letti[x.nome].minuti - letti[y.nome].minuti);
    C.a = destinabili.some(m => m.nome === prima.a) ? prima.a : (destinabili.length ? destinabili[0].nome : '');
    const fonti = C.membri.filter(m => m.nome !== C.a && letti[m.nome] && letti[m.nome].minuti > 0);
    fonti.sort((x, y) => letti[y.nome].minuti - letti[x.nome].minuti);
    C.da = fonti.some(m => m.nome === prima.da) ? prima.da : (fonti.length ? fonti[0].nome : '');
    _cpCwCostruisciRighe();
  } catch (e) {
    if (!ancora()) return;
    C.errore = 'Lettura da Jira non riuscita: ' + (e && e.message ? e.message : e);
  }
  C.caricando = false;
  cpStatoRefresh(false);   // gli stati appena letti valgono anche per la colonna Stato
  cpApplyStatoToDom();
  _cpCwRender();
}

/* ---------- Abbinamento sottotask ---------- */

/* Sottotask dell'operatore «A» per un worklog di «Da»: { key, come } ('' se non si sa) */
function _cpCwAbbina(srcKey, indice) {
  const C = _cpCw;
  const dst = C.membri.find(m => m.nome === C.a), src = C.membri.find(m => m.nome === C.da);
  if (!dst) return { key: '', come: '' };
  const conKey = dst.voci.filter(v => v.key);
  let orig = indice[srcKey];
  let come = '';
  if (!orig && src) {
    // Ticket non creato dalla Griglia: se «Da» aveva una sola voce quel giorno, è quella
    const uniche = src.voci.filter((v, i, a) => a.findIndex(x => x.commessa === v.commessa && _cpCwNorm(x.cantiere) === _cpCwNorm(v.cantiere) && _cpCwNorm(x.attivita) === _cpCwNorm(v.attivita)) === i);
    if (uniche.length === 1) { orig = uniche[0]; come = ' (unica voce di ' + C.da + ' quel giorno)'; }
  }
  if (orig) {
    const stessoCant = conKey.filter(v => v.commessa === orig.commessa && _cpCwNorm(v.cantiere) === _cpCwNorm(orig.cantiere));
    const esatti = stessoCant.filter(v => _cpCwNorm(v.attivita) === _cpCwNorm(orig.attivita));
    const keys = arr => [...new Set(arr.map(v => v.key))];
    if (keys(esatti).length === 1) return { key: esatti[0].key, come: 'stesso cantiere e attività' + come };
    if (!esatti.length && keys(stessoCant).length === 1) return { key: stessoCant[0].key, come: 'stesso cantiere, attività diversa' + come };
    return { key: '', come: keys(esatti.length ? esatti : stessoCant).length > 1 ? 'più sottotask possibili: scegli' : 'nessun sottotask di ' + C.a + ' su ' + orig.cantiere };
  }
  return { key: '', come: 'cantiere del ticket sconosciuto: scegli' };
}

function _cpCwCostruisciRighe() {
  const C = _cpCw, src = C.letti[C.da];
  C.righe = []; C.elimina = {}; C.esistInfo = {};
  if (!src || !C.a || C.da === C.a) return;
  const indice = _cpaIndiceSottotask();
  const esistenti = (C.letti[C.a] || { interventi: [] }).interventi;
  C.righe = src.interventi.map(iv => {
    const ab = _cpCwAbbina(iv.t.key, indice);
    const orig = indice[iv.t.key];
    const r = {
      srcKey: iv.t.key, srcSummary: iv.t.summary || '', srcUrl: iv.t.url || '',
      srcDove: orig ? orig.cantiere + (orig.attivita ? ' · ' + orig.attivita : '') : '',
      inizio: iv.inizio, fine: iv.fine, commento: (iv.w.comment || '').trim(),
      dst: ab.key, come: ab.come, gia: false, sel: !!ab.key,
    };
    r.gia = !!r.dst && esistenti.some(e => _cpCwUguale(e, r));
    if (r.gia) r.sel = false;
    return r;
  });
  // Worklog che «A» ha già quel giorno: la copia li sostituisce, quindi partono da eliminare,
  // tranne quelli uguali a uno da copiare (restano) e quelli di un'altra commessa.
  esistenti.forEach(e => {
    if (e.w.id == null) return;   // senza id non si può eliminare
    const id = String(e.w.id), o = indice[e.t.key];
    const altra = o && o.commessa !== C.commessa ? o.commessa : '';
    const uguale = C.righe.some(r => r.gia && _cpCwUguale(e, r));
    C.esistInfo[id] = { altra, uguale };
    C.elimina[id] = !altra && !uguale;
  });
}

/* Worklog esistente e riga da copiare uguali: stesso sottotask, orari entro un minuto */
function _cpCwUguale(e, r) {
  return e.t.key === r.dst && Math.abs(e.inizio - r.inizio) <= 1 && Math.abs(e.fine - r.fine) <= 1;
}

/* Ticket proposti per «A»: i suoi sottotask Griglia del giorno e quelli su cui ha già worklog */
function _cpCwTicketDestinazione() {
  const C = _cpCw, out = [], visti = new Set();
  const dst = C.membri.find(m => m.nome === C.a);
  (dst ? dst.voci : []).forEach(v => {
    if (!v.key || visti.has(v.key)) return;
    visti.add(v.key);
    out.push({ key: v.key, testo: v.commessa + ' · ' + v.cantiere + (v.attivita ? ' · ' + v.attivita : '') });
  });
  ((C.letti[C.a] || {}).interventi || []).forEach(iv => {
    if (visti.has(iv.t.key)) return;
    visti.add(iv.t.key);
    out.push({ key: iv.t.key, testo: iv.t.summary || 'ticket con worklog quel giorno' });
  });
  return out;
}

/* ---------- Form ---------- */

function cpCwScegli(el) {
  const C = _cpCw;
  C[el.dataset.f] = el.value;
  if (C.da === C.a) {
    // stessa persona su entrambi: sposta l'altro sul primo disponibile
    const altro = el.dataset.f === 'da' ? 'a' : 'da';
    const cand = C.membri.find(m => m.nome !== C[el.dataset.f] && C.letti[m.nome] &&
      (altro === 'da' ? C.letti[m.nome].minuti > 0 : (!m.fornitore && m.email)));
    C[altro] = cand ? cand.nome : '';
  }
  C.statoNo = {};
  _cpCwCostruisciRighe();
  _cpCwRender();
}

function cpCwCampo(el) {
  const r = _cpCw.righe[Number(el.dataset.i)];
  if (!r) return;
  const f = el.dataset.f;
  if (f === 'sel') { r.sel = el.checked; _cpCwRender(); return; }
  if (f === 'commento') r.commento = el.value;
  else if (f === 'dst') r.dst = el.value.trim().toUpperCase();
  else r[f] = _cpTlWlMin(el.value);
  if (f === 'dst') _cpCwRenderStati();
  cpCwControlla();
}

function cpCwElimina(el) {
  _cpCw.elimina[el.dataset.w] = el.checked;
  cpCwControlla();
}

function cpCwStato(el) {
  if (el.checked) delete _cpCw.statoNo[el.dataset.k]; else _cpCw.statoNo[el.dataset.k] = true;
  cpCwControlla();
}

function cpCwTutte(el) {
  _cpCw.righe.forEach(r => { r.sel = el.checked; });
  _cpCwRender();
}

/* Cambi di stato proposti: destinazione -> { voluto, da, src, srcSt } */
function _cpCwStatiProposti() {
  const C = _cpCw, out = {};
  C.righe.forEach(r => {
    if (!r.sel || !r.dst) return;
    const s = _cpStatoTicket[r.srcKey], t = _cpStatoTicket[r.dst];
    if (!s || !t) return;
    const rs = _cpGsRango(s.status), rt = _cpGsRango(t.status);
    if ((rs !== CPGS_IN_PENDING && rs !== CPGS_DONE) || rt < 0 || rt >= rs) return;
    const voluto = rs === CPGS_DONE ? 'DONE' : 'IN PENDING';
    if (!out[r.dst] || _cpGsRango(out[r.dst].voluto) < rs) out[r.dst] = { voluto, da: t.status, src: r.srcKey, srcSt: s.status };
  });
  return out;
}

function _cpCwStatoHtml(k) {
  const t = _cpStatoTicket[k];
  return t && t.status ? esc(t.status) : '?';
}

function _cpCwRenderStati() {
  const box = document.getElementById('cpcw-stati');
  if (!box) return;
  const C = _cpCw, prop = _cpCwStatiProposti(), keys = Object.keys(prop);
  if (!keys.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<span class="block text-[11px] font-semibold text-slate-500 mb-0.5">Stato dei sottotask di ' + esc(C.a) + '</span>' +
    keys.map(k => {
      const p = prop[k];
      return '<label class="flex items-start gap-2 text-xs mb-1"><input type="checkbox" data-k="' + esc(k) + '"' + (C.statoNo[k] ? '' : ' checked') + ' onchange="cpCwStato(this)" style="margin-top:2px">' +
        '<span>Porta <b>' + esc(k) + '</b> da «' + esc(p.da) + '» a <b>' + esc(p.voluto) + '</b>, come ' + esc(p.src) + ' di ' + esc(C.da) + ' («' + esc(p.srcSt) + '»)' +
        (p.voluto === 'DONE' ? '. <span class="text-slate-500">Se su Jira manca la produzione la metto a 1 (resta «👁 da verificare»: il report la sostituisce, non la somma).</span>' : '') + '</span></label>';
    }).join('');
}

function _cpCwRender() {
  const modal = document.getElementById('cpcw-modal');
  const root = document.getElementById('cpcw-root');
  if (!modal || !root) return;
  modal.style.display = _cpCw.aperto ? 'flex' : 'none';
  if (!_cpCw.aperto) return;
  const C = _cpCw;
  const inp = 'border border-slate-300 rounded px-2 py-1 text-sm bg-white';
  const lab = 'block text-[11px] font-semibold text-slate-500 mb-0.5';
  const titolo = '<div style="font-weight:700;font-size:15px;color:#0f172a;font-family:var(--font-display);">⧉ Copia worklog fra operatori</div>' +
    '<div class="text-xs text-slate-500 mt-0.5 mb-3">' + esc(C.commessa) + ' · 👥 ' + esc(C.squadra) + ' · ' + esc(C.label) + '</div>';
  const piede = btn => '<div class="flex flex-wrap items-center gap-2" style="padding:10px 20px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
    '<button type="button" onclick="_cpCwCarica()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white"' + (C.caricando || C.salvando ? ' disabled' : '') + '>↻ Rileggi da Jira</button>' +
    '<div class="flex-1"></div>' +
    '<button type="button" onclick="cpCwChiudi()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white">Chiudi</button>' + (btn || '') + '</div>';
  const avvisi = C.avvisi.length ? '<div class="text-[11px] text-amber-700 mb-2">⚠ ' + C.avvisi.map(esc).join('<br>⚠ ') + '</div>' : '';

  if (C.passi) {
    const ico = { '': '⏳', ok: '✓', ko: '✕', warn: '⚠' }, col = { '': '#334155', ok: '#0f766e', ko: '#b91c1c', warn: '#b45309' };
    root.innerHTML = '<div style="padding:16px 20px 12px;">' + titolo +
      '<div class="text-sm font-semibold mb-2" style="color:#0f766e">' + (C.salvando ? '⏳ Copia dei worklog in corso: non chiudere la pagina…' : 'Copia finita') + '</div>' +
      C.passi.map(p => '<div class="text-xs mb-1" style="color:' + col[p.esito] + '">' + ico[p.esito] + ' ' + esc(p.testo) +
        (p.nota ? '<div class="text-[11px] text-slate-500" style="margin-left:16px">' + esc(p.nota) + '</div>' : '') + '</div>').join('') +
      '</div>';
    return;
  }

  if (C.caricando || C.errore) {
    root.innerHTML = '<div style="padding:16px 20px 10px;">' + titolo +
      (C.errore ? '<div class="text-sm text-red-700 mb-2">✕ ' + esc(C.errore) + '</div>' : '<div class="text-sm text-slate-500 mb-2">Leggo da Jira i worklog della squadra…</div>') +
      '</div>' + piede('');
    return;
  }

  // Operatori della squadra con le ore Jira del giorno
  const chip = m => {
    const l = C.letti[m.nome];
    let txt, col;
    if (!l) { txt = 'non letto'; col = '#94a3b8'; }
    else if (!l.minuti) { txt = 'nessun worklog'; col = '#b91c1c'; }
    else { txt = _cpOjDurata(l.minuti) + ' (' + l.interventi.length + ')'; col = '#0f766e'; }
    return '<span class="inline-block text-[11px] rounded px-2 py-0.5 mr-1 mb-1" style="background:#f1f5f9;">' + esc(m.nome) +
      (m.fornitore ? ' <span class="text-slate-400">· fornitore</span>' : '') + ' · <b style="color:' + col + '">' + txt + '</b></span>';
  };
  const opzDa = C.membri.filter(m => C.letti[m.nome] && C.letti[m.nome].minuti > 0)
    .map(m => '<option value="' + esc(m.nome) + '"' + (m.nome === C.da ? ' selected' : '') + '>' + esc(m.nome) + ' · ' + _cpOjDurata(C.letti[m.nome].minuti) + '</option>').join('');
  const opzA = C.membri.filter(m => C.letti[m.nome] && m.email && !m.fornitore)
    .map(m => '<option value="' + esc(m.nome) + '"' + (m.nome === C.a ? ' selected' : '') + '>' + esc(m.nome) + ' · ' + (C.letti[m.nome].minuti ? _cpOjDurata(C.letti[m.nome].minuti) : 'nessun worklog') + '</option>').join('');

  let corpo;
  if (!opzDa) corpo = '<div class="text-sm text-slate-500">Nessun operatore della squadra ha worklog su Jira in questo giorno: non c\'è niente da copiare.</div>';
  else if (!opzA) corpo = '<div class="text-sm text-slate-500">Nessun operatore a cui copiare (servono email in anagrafica; i dipendenti fornitore li gestisce «🏢 Worklog fornitori»).</div>';
  else {
    const prop = _cpCwTicketDestinazione();
    const dl = '<datalist id="cpcw-tickets">' + prop.map(p => '<option value="' + esc(p.key) + '">' + esc(p.testo) + '</option>').join('') + '</datalist>';
    const dst = C.membri.find(m => m.nome === C.a);
    const senzaSottotask = dst && !dst.voci.some(v => v.key)
      ? '<div class="text-[11px] text-amber-700 mb-2">⚠ ' + esc(C.a) + ' non ha sottotask Jira in Griglia per questo giorno: crealo da «🎫 Sottotask Jira» in Griglia, oppure scrivi la chiave a mano.</div>' : '';
    const tutte = C.righe.length && C.righe.every(r => r.sel);
    const righe = C.righe.map((r, i) => {
      const dis = r.sel ? '' : ' style="opacity:.55"';
      const srcLink = r.srcUrl ? '<a href="' + esc(r.srcUrl) + '" target="_blank" rel="noopener" class="text-teal-700">' + esc(r.srcKey) + '</a>' : esc(r.srcKey);
      return '<tr' + dis + ' style="border-top:1px solid #f1f5f9">' +
        '<td style="padding:4px;vertical-align:top"><input type="checkbox" data-i="' + i + '" data-f="sel"' + (r.sel ? ' checked' : '') + ' onchange="cpCwCampo(this)"></td>' +
        '<td style="padding:4px;vertical-align:top" class="text-xs"><div class="font-semibold">' + srcLink + ' <span class="font-normal text-slate-500">' + _cpOjOra(r.inizio) + '–' + _cpOjOra(r.fine) + '</span></div>' +
          '<div class="text-[11px] text-slate-500">' + esc(r.srcDove || r.srcSummary) + '</div></td>' +
        '<td style="padding:4px;vertical-align:top"><input list="cpcw-tickets" class="' + inp + '" style="width:120px" data-i="' + i + '" data-f="dst" value="' + esc(r.dst) + '" placeholder="es. AI029-1234" autocomplete="off" oninput="cpCwCampo(this)">' +
          '<div class="text-[10px] ' + (r.gia ? 'text-amber-700' : 'text-slate-500') + '">' + esc(r.gia ? 'già presente uguale: deselezionato' : r.come) + '</div></td>' +
        '<td style="padding:4px;vertical-align:top"><input type="time" step="60" class="' + inp + '" data-i="' + i + '" data-f="inizio" value="' + (r.inizio == null ? '' : _cpTlWlHHMM(r.inizio)) + '" oninput="cpCwCampo(this)"></td>' +
        '<td style="padding:4px;vertical-align:top"><input type="time" step="60" class="' + inp + '" data-i="' + i + '" data-f="fine" value="' + (r.fine == null ? '' : _cpTlWlHHMM(r.fine)) + '" oninput="cpCwCampo(this)"></td>' +
        '<td style="padding:4px;vertical-align:top;width:100%"><input type="text" maxlength="2000" class="' + inp + ' w-full" placeholder="commento" data-i="' + i + '" data-f="commento" value="' + esc(r.commento) + '" oninput="cpCwCampo(this)"></td>' +
      '</tr>';
    }).join('');
    const esist = ((C.letti[C.a] || {}).interventi || []);
    const giaDi = !esist.length ? '<div class="text-[11px] text-slate-500 mt-2">' + esc(C.a) + ' non ha worklog su Jira in questo giorno.</div>' :
      '<div class="mt-3"><span class="' + lab + '">Worklog che ' + esc(C.a) + ' ha già su Jira quel giorno: quelli spuntati vengono eliminati, la copia li sostituisce</span>' +
      esist.map(e => {
        const id = String(e.w.id), info = C.esistInfo[id] || {};
        const link = e.t.url ? '<a href="' + esc(e.t.url) + '" target="_blank" rel="noopener" class="text-teal-700">' + esc(e.t.key) + '</a>' : esc(e.t.key);
        const nota = info.altra ? 'su un\'altra commessa (' + info.altra + '): di solito si tiene' : info.uguale ? 'uguale a uno da copiare: si tiene' : '';
        const comm = (e.w.comment || '').trim();
        return '<label class="flex items-start gap-2 text-xs mb-1"><input type="checkbox" data-w="' + esc(id) + '"' + (C.elimina[id] ? ' checked' : '') + (e.w.id == null ? ' disabled title="Worklog senza id: non si può eliminare da qui"' : '') + ' onchange="cpCwElimina(this)" style="margin-top:2px">' +
          '<span><b>' + link + '</b> ' + _cpOjOra(e.inizio) + '–' + _cpOjOra(e.fine) + ' (' + _cpOjDurata(e.fine - e.inizio) + ')' +
          (comm ? ' <span class="text-slate-500">· ' + esc(comm.length > 80 ? comm.slice(0, 80) + '…' : comm) + '</span>' : '') +
          (nota ? ' <span class="text-amber-700">· ' + esc(nota) + '</span>' : '') + '</span></label>';
      }).join('') + '</div>';
    corpo =
      '<div class="flex flex-wrap gap-3 mb-3 items-end">' +
        '<label><span class="' + lab + '">Copia i worklog di</span><select class="' + inp + '" data-f="da" onchange="cpCwScegli(this)">' + opzDa + '</select></label>' +
        '<span class="text-slate-400 pb-1">→</span>' +
        '<label><span class="' + lab + '">sui sottotask di</span><select class="' + inp + '" data-f="a" onchange="cpCwScegli(this)">' + opzA + '</select></label>' +
      '</div>' + senzaSottotask +
      (C.da === C.a ? '<div class="text-sm text-slate-500">Scegli due operatori diversi.</div>' :
      '<table style="width:100%;border-collapse:collapse"><thead><tr class="text-[11px] text-slate-500">' +
        '<th style="padding:0 4px"><input type="checkbox"' + (tutte ? ' checked' : '') + ' title="Tutti / nessuno" onchange="cpCwTutte(this)"></th>' +
        '<th style="text-align:left;padding:0 4px">Worklog di ' + esc(C.da) + '</th><th style="text-align:left;padding:0 4px">Sottotask di ' + esc(C.a) + '</th>' +
        '<th style="text-align:left;padding:0 4px">Inizio</th><th style="text-align:left;padding:0 4px">Fine</th><th style="text-align:left;padding:0 4px">Commento</th></tr></thead>' +
        '<tbody>' + righe + '</tbody></table>' + dl + giaDi) +
      '<div id="cpcw-stati" class="mt-3"></div>';
  }

  root.innerHTML = '<div style="padding:16px 20px 6px;">' + titolo +
      '<div class="mb-2">' + C.membri.map(chip).join('') + '</div>' + avvisi + corpo +
      '<div id="cpcw-check" class="text-xs mt-3 mb-1" style="min-height:18px;"></div>' +
    '</div>' +
    piede('<button type="button" id="cpcw-applica" onclick="cpCwApplica()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#0f766e;">Copia su Jira</button>');
  _cpCwRenderStati();
  cpCwControlla();
}

/* Operazioni da fare + errori (bloccano) e avvisi */
function _cpCwVerifica() {
  const C = _cpCw, out = { errori: [], avvisi: [], crea: [], stati: [], elimina: [] };
  if (!C.a || !C.da || C.da === C.a) return out;
  const ora = cpOraRoma(), noti = new Set(_cpCwTicketDestinazione().map(p => p.key));
  const esistenti = (C.letti[C.a] || { interventi: [] }).interventi;
  out.elimina = esistenti.filter(e => e.w.id != null && C.elimina[String(e.w.id)]);
  const restano = esistenti.filter(e => !out.elimina.includes(e));
  out.elimina.forEach(e => {
    const info = C.esistInfo[String(e.w.id)] || {};
    if (info.altra) out.avvisi.push('Elimini anche ' + e.t.key + ' ' + _cpOjOra(e.inizio) + '–' + _cpOjOra(e.fine) + ', che è su un\'altra commessa (' + info.altra + ').');
  });
  C.righe.forEach((r, i) => {
    if (!r.sel && r.gia && out.elimina.some(e => _cpCwUguale(e, r))) {
      out.avvisi.push('Riga ' + (i + 1) + ' (' + r.srcKey + '): il worklog uguale già di ' + C.a + ' viene eliminato e non ricopiato.');
    }
    if (!r.sel) return;
    const n = 'Riga ' + (i + 1) + ' (' + r.srcKey + ')';
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(r.dst || '')) { out.errori.push(n + ': indica il sottotask di ' + C.a + '.'); return; }
    if (r.inizio == null || r.fine == null) { out.errori.push(n + ': indica ora di inizio e di fine.'); return; }
    if (r.fine <= r.inizio) { out.errori.push(n + ': la fine deve essere dopo l\'inizio.'); return; }
    if (ora && (C.iso > ora.data || (C.iso === ora.data && r.fine > ora.min))) { out.errori.push(n + ': non può finire nel futuro.'); return; }
    if (r.dst === r.srcKey) out.avvisi.push(n + ': è lo stesso ticket di ' + C.da + ', le ore finirebbero due volte sullo stesso sottotask.');
    else if (!noti.has(r.dst)) out.avvisi.push(n + ': ' + r.dst + ' non è tra i sottotask di ' + C.a + ' di questo giorno.');
    if (r.fine - r.inizio > CPTL_WL_LUNGO_MIN) out.avvisi.push(n + ': durata lunga (' + _cpOjDurata(r.fine - r.inizio) + ').');
    if (r.commento.length >= 299) out.avvisi.push(n + ': il commento letto da Jira può essere accorciato (300 caratteri).');
    restano.forEach(e => {
      if (e.inizio < r.fine && e.fine > r.inizio) out.avvisi.push(n + ' si sovrappone a ' + e.t.key + ' ' + _cpOjOra(e.inizio) + '–' + _cpOjOra(e.fine) + ' già di ' + C.a + ' (non eliminato).');
    });
    out.crea.push(r);
  });
  const prop = _cpCwStatiProposti();
  Object.keys(prop).forEach(k => { if (!C.statoNo[k]) out.stati.push(Object.assign({ key: k }, prop[k])); });
  const totale = restano.reduce((s, e) => s + (e.fine - e.inizio), 0) + out.crea.reduce((s, r) => s + (r.fine - r.inizio), 0);
  if (totale > 12 * 60) out.avvisi.push('In tutto ' + C.a + ' arriverebbe a ' + _cpOjDurata(totale) + ': Tempo rifiuta oltre 12 h al giorno per persona.');
  // Un sottotask che resta IN PROGRESS: alla chiusura Jira registrerebbe altro tempo
  new Set(out.crea.map(r => r.dst)).forEach(k => {
    const t = _cpStatoTicket[k];
    if (t && cpStatoInProgress(t) && !out.stati.some(s => s.key === k)) {
      out.avvisi.push(k + ' è IN PROGRESS: quando verrà chiuso Jira aggiungerà da solo un worklog fino a quel momento (ore contate due volte). Conviene portarlo avanti con «✎» nella colonna Stato.');
    }
  });
  return out;
}

function cpCwControlla() {
  const box = document.getElementById('cpcw-check'), btn = document.getElementById('cpcw-applica');
  if (!box) return;
  const v = _cpCwVerifica();
  const niente = !v.crea.length && !v.stati.length && !v.elimina.length;
  const righe = [];
  if (!niente) {
    const cosa = [];
    if (v.elimina.length) cosa.push(v.elimina.length + ' worklog di ' + _cpCw.a + ' da eliminare (' + _cpOjDurata(v.elimina.reduce((s, e) => s + (e.fine - e.inizio), 0)) + ')');
    if (v.crea.length) cosa.push(v.crea.length + ' worklog da aggiungere a ' + _cpCw.a + ' (' + _cpOjDurata(v.crea.reduce((s, r) => s + (r.fine - r.inizio), 0)) + ')');
    if (v.stati.length) cosa.push(v.stati.length + ' cambio di stato');
    righe.push('<span class="text-slate-600">' + esc(cosa.join(' · ')) + '</span>');
  }
  v.errori.forEach(e => righe.push('<span class="text-red-700">✕ ' + esc(e) + '</span>'));
  v.avvisi.forEach(a => righe.push('<span class="text-amber-700">⚠ ' + esc(a) + '</span>'));
  box.innerHTML = righe.join('<br>');
  if (btn) {
    const off = niente || !!v.errori.length || _cpCw.salvando;
    btn.disabled = off;
    btn.style.opacity = off ? '.5' : '';
  }
}

/* ---------- Scrittura su Jira ---------- */

/* Avanzamento mostrato nella finestra durante la copia */
function _cpCwPasso(testo) {
  _cpCw.passi.push({ testo, esito: '', nota: '' });
  _cpCwRender();
  return _cpCw.passi[_cpCw.passi.length - 1];
}
function _cpCwFatto(p, esito, nota) {
  p.esito = esito;
  if (nota) p.nota = nota;
  _cpCwRender();
}

async function _cpCwInvocaProd(body) {
  const { data, error } = await _sbClient.functions.invoke('jira-update-production', { body });
  if (error) return { errore: await _cpEdgeErr(error, 'jira-update-production') };
  if (data && data.error) return { errore: data.error };
  return data || {};
}

/* DONE vuole la produzione > 0 sul sottotask. Se manca la porta a 1 con jira-update-production
   (stesso canale e stesso modello a delta di «Sincronizza»: anche il Task padre resta allineato)
   e la segna nella riga del Controllo Produzione come letta da Jira (fonte 'jira', «👁 da
   verificare», ultimo invio = 1): il report la sostituisce, non la somma. Se nella riga c'è già
   un Km/Cad per quel ticket non si tocca nulla (lo invia «Sincronizza»).
   → { esito: 'gia' | 'scritto' | 'locale' | 'errore', testo } */
async function _cpCwProduzioneMinima(key) {
  const C = _cpCw;
  const dst = C.membri.find(m => m.nome === C.a);
  const v = (dst ? dst.voci : []).find(x => x.key === key);
  return cpProduzioneMinima(key, {
    nome: C.a, g: C.g, iso: C.iso, commessa: v ? v.commessa : C.commessa,
    cella: v ? v.cella : { squadra: C.squadra, cantiere: '', attivita: '' },
  });
}

/* Stessa cosa per chiunque porti un sottotask in DONE (Copia worklog, Copia/incolla della
   Timeline). dove = { nome, g, iso, commessa, cella: { squadra, cantiere, attivita } | null }:
   senza cella (sottotask non in Griglia) scrive solo su Jira. Riga = settimana mostrata. */
async function cpProduzioneMinima(key, dove) {
  const nome = dove.nome, commessa = dove.commessa || '', cella = dove.cella || null;
  const ck = cella ? commessa + '|||' + cella.squadra + '|||' + nome + '|||' + dove.g : '';
  await cpCampoProdLoad();
  // Il validatore verso DONE controlla l'Actual Production, anche sulle commesse che tengono la
  // produzione su KPI_Quantità lavorata (v18.268.0): lì si scrive solo su Jira, la riga non si tocca
  // (il suo storico a delta è sul KPI e «Sincronizza» non scrive l'Actual Production).
  const campo = CP_CAMPO_AP, inRiga = !!cella && !!commessa && cpCampoProduzione(commessa) === CP_CAMPO_AP;
  const loc = inRiga && _cpData[ck] && _cpData[ck].km_by_ticket ? _cpData[ck].km_by_ticket[key] : null;
  if (loc != null) return { esito: 'locale', testo: 'in Controllo Produzione c\'è già un Km/Cad (' + loc + ') per ' + key + ': lo invia «Sincronizza squadra», poi chiudilo con «✎» se è rimasto IN PENDING' };
  const r = await _cpCwInvocaProd({ reads: [{ issueKey: key, campo }] });
  if (r.errore) return { esito: 'errore', testo: 'produzione non letta: ' + r.errore };
  const val = Number((r.values || {})[key]);
  if (isFinite(val) && val > 0) return { esito: 'gia', testo: 'Actual Production già su Jira (' + val + ')' };
  const w = await _cpCwInvocaProd({ updates: [{ issueKey: key, add: 1, campo }] });
  const ris = w.results && w.results[key];
  if (w.errore || !ris || !ris.ok) return { esito: 'errore', testo: 'produzione non scritta: ' + (w.errore || (w.errors && w.errors[key]) || 'risposta non valida') };
  if (!inRiga) return { esito: 'scritto', testo: 'Actual Production messa a 1 per poterlo chiudere (la produzione della commessa resta su «' + cpCampoProduzione(commessa) + '»)' };
  const cell = _cpData[ck] || (_cpData[ck] = {});
  if (!cell.km_by_ticket || typeof cell.km_by_ticket !== 'object') cell.km_by_ticket = {};
  if (!cell.km_last_by_ticket || typeof cell.km_last_by_ticket !== 'object') cell.km_last_by_ticket = {};
  cell.km_by_ticket[key] = 1;
  cell.km_last_by_ticket[key] = 1;
  cpKmMetaSet(cell, key, { fonte: 'jira', campoLast: ris.campo || campo });
  cell.km_cad = cpSumKm(cell.km_by_ticket);
  const rec = cpBuildRecordDa(cell, pwAnno, pwWeek, commessa, cella.squadra, nome, dove.g, dove.iso, cella.cantiere, cella.attivita);
  const { error } = await _sbClient.from('controllo_produzione').upsert([rec], { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
  return { esito: 'scritto', testo: 'produzione messa a 1 su «' + campo + '»' + (error ? ' ⚠ ma non salvata in Controllo Produzione: ' + (error.message || error) : ' (👁 da verificare)') };
}

/* Rilegge i worklog del giorno dell'operatore finché compaiono quelli aggiunti e spariscono
   quelli eliminati (Tempo può metterci qualche secondo ad allineare Jira), così «Sincronizza
   squadra» trova la giornata giusta.
   → { mancanti: aggiunti che ancora non si leggono, ancora: eliminati che si leggono ancora } */
async function _cpCwAttendiWorklog(email, creati, eliminati) {
  let mancanti = creati, ancora = eliminati;
  for (let t = 0; t < 5 && (mancanti.length || ancora.length); t++) {
    if (t) await new Promise(r => setTimeout(r, 3000));
    const { data: fn, error } = await _sbClient.functions.invoke('jira-sync-worklogs', { body: { emails: [email], startDate: _cpCw.iso, endDate: _cpCw.iso } });
    if (error) continue;
    const giorno = (((fn && fn.results) || {})[email.toLowerCase()] || {})[_cpCw.iso];
    const iv = cpOreJiraInterventi((giorno && giorno.tickets) || [], _cpCw.iso).interventi;
    mancanti = creati.filter(r => !iv.some(e => _cpCwUguale(e, r)));
    ancora = eliminati.filter(x => iv.some(e => e.w && String(e.w.id) === String(x.w.id)));
  }
  return { mancanti, ancora };
}

async function cpCwApplica() {
  const C = _cpCw;
  if (C.salvando || !cpCwPuo()) return;
  const v = _cpCwVerifica();
  if (v.errori.length || (!v.crea.length && !v.stati.length && !v.elimina.length)) { cpCwControlla(); return; }
  const dove = r => _cpOjOra(r.inizio) + '–' + _cpOjOra(r.fine) + ' (' + _cpOjDurata(r.fine - r.inizio) + ')';
  const righe = [];
  v.stati.forEach(s => righe.push('Stato ' + s.key + ': ' + s.da + ' → ' + s.voluto + (s.voluto === 'DONE' ? ' (se manca la produzione, la metto a 1)' : '')));
  v.elimina.forEach(e => {
    const c = (e.w.comment || '').trim();
    righe.push('Elimina da ' + e.t.key + ' ' + dove(e) + (c ? ' «' + (c.length > 60 ? c.slice(0, 60) + '…' : c) + '»' : ''));
  });
  v.crea.forEach(r => righe.push('Aggiungi su ' + r.dst + ' ' + dove(r) + ' (da ' + r.srcKey + ')'));
  const msg = 'Su Jira, per ' + C.a + ', ' + C.label + ' (copiando da ' + C.da + '):\n\n• ' + righe.join('\n• ') +
    '\n\nI worklog risultano a nome dell\'assegnatario del sottotask; la stima residua non cambia. I worklog di ' + C.da + ' restano come sono. ' +
    'Subito dopo parte «🔄 Sincronizza squadra», così il prospetto si aggiorna da solo. Da qui non si torna indietro con «Indietro».' +
    (v.avvisi.length ? '\n\n⚠ ' + v.avvisi.join('\n⚠ ') : '');
  if (!await showConfirmAsync(msg, 'Copia su Jira')) return;

  C.salvando = true;
  C.passi = [];
  _cpCwRender();
  const fatti = [], problemi = [], saltaKey = new Set(), creati = [], eliminati = [];
  const nome = C.a, k = C.k, d = C.d, email = (C.membri.find(m => m.nome === C.a) || {}).email || '';
  const commessa = C.commessa, squadra = C.squadra, anno = pwAnno, week = pwWeek;
  try {
    // a. Stato prima dei worklog: quelli dell'automazione Jira si riconoscono come nuovi
    for (const s of v.stati) {
      if (s.voluto === 'DONE') {
        const pp = _cpCwPasso('Controllo la produzione di ' + s.key + ' (per DONE Jira la vuole maggiore di 0)…');
        const pr = await _cpCwProduzioneMinima(s.key);
        _cpCwFatto(pp, pr.esito === 'errore' || pr.esito === 'locale' ? 'warn' : 'ok', pr.testo);
        if (pr.esito === 'scritto') fatti.push(s.key + ': ' + pr.testo);
        else if (pr.esito !== 'gia') problemi.push(s.key + ': ' + pr.testo);
      }
      const ps = _cpCwPasso('Porto ' + s.key + ' da «' + s.da + '» a ' + s.voluto + ' (Jira impiega 10–20 secondi)…');
      const res = await _cpTlWlInvoca({ action: 'stato', issueKey: s.key, voluto: s.voluto, atteso: { stato: s.da }, operatore: nome });
      if (res.ok) {
        const t = 'Stato ' + s.key + ': ' + res.prima + ' → ' + res.dopo + (res.rimossi && res.rimossi.length ? ' (eliminati ' + res.rimossi.length + ' worklog dell\'automazione)' : '');
        fatti.push(t);
        _cpCwFatto(ps, res.avviso ? 'warn' : 'ok', t + (res.avviso ? ' ⚠ ' + res.avviso : ''));
        if (res.avviso) problemi.push(s.key + ': ' + res.avviso);
      } else {
        const t = 'Stato ' + s.key + ': ' + (res.errore || 'non riuscito') + (res.codice === 'cambiato' ? ' Worklog su questo sottotask non aggiunti.' : '');
        problemi.push(t);
        _cpCwFatto(ps, 'ko', t);
        if (res.codice === 'cambiato') saltaKey.add(s.key);
      }
    }
    // b. Eliminazione dei worklog di «A» che la copia sostituisce (prima delle aggiunte: Tempo
    //    conta 12 h al giorno per autore). Non su un sottotask il cui stato è cambiato nel frattempo.
    for (const e of v.elimina) {
      if (saltaKey.has(e.t.key)) continue;
      const pe = _cpCwPasso('Elimino il worklog di ' + nome + ' su ' + e.t.key + ' ' + dove(e) + '…');
      const res = await _cpTlWlInvoca({ action: 'delete', issueKey: e.t.key, worklogId: String(e.w.id), operatore: nome, atteso: { started: e.w.started, seconds: e.w.seconds } });
      if (res.ok) {
        eliminati.push(e);
        fatti.push('Eliminato da ' + e.t.key + ' ' + dove(e) + (res.avviso ? ' ⚠ ' + res.avviso : ''));
        _cpCwFatto(pe, res.avviso ? 'warn' : 'ok', res.avviso || '');
      } else {
        problemi.push('Eliminazione ' + e.t.key + ' ' + dove(e) + ': ' + (res.errore || 'non riuscita'));
        _cpCwFatto(pe, 'ko', res.errore || 'non riuscita');
      }
    }
    // c. Worklog, uno alla volta
    let forza = false, chiesto = false;
    for (let i = 0; i < v.crea.length; i++) {
      const r = v.crea[i];
      if (saltaKey.has(r.dst)) continue;
      const pw = _cpCwPasso('Copio il worklog ' + (i + 1) + '/' + v.crea.length + ' su ' + r.dst + ' ' + dove(r) + '…');
      const body = { action: 'create', issueKey: r.dst, data: C.iso, inizioMin: r.inizio, durataMin: r.fine - r.inizio, operatore: nome, email, forza };
      if (r.commento.trim()) body.commento = r.commento.trim();
      let res = await _cpTlWlInvoca(body);
      if (res.codice === 'assegnatario_diverso' && !forza) {
        if (!chiesto) { chiesto = true; forza = await showConfirmAsync(res.errore + '\n\nAggiungere comunque le ore?', 'Aggiungi comunque'); }
        if (forza) res = await _cpTlWlInvoca(Object.assign({}, body, { forza: true }));
      }
      if (res.ok) {
        creati.push(r);
        fatti.push('Aggiunto su ' + r.dst + ' ' + dove(r) + (res.dopo && res.dopo.autore ? ' (autore ' + res.dopo.autore + ')' : '') + (res.avviso ? ' ⚠ ' + res.avviso : ''));
        _cpCwFatto(pw, res.avviso ? 'warn' : 'ok', res.avviso || (res.dopo && res.dopo.autore ? 'autore ' + res.dopo.autore : ''));
      } else {
        problemi.push(r.dst + ' ' + dove(r) + ': ' + (res.errore || 'non riuscito'));
        _cpCwFatto(pw, 'ko', res.errore || 'non riuscito');
      }
    }
    // d. Prima di sincronizzare: Jira deve già mostrare la giornata nuova
    if ((creati.length || eliminati.length) && email) {
      const pv = _cpCwPasso('Controllo che Jira mostri i worklog aggiornati…');
      const { mancanti, ancora } = await _cpCwAttendiWorklog(email, creati, eliminati);
      const t = [];
      if (mancanti.length) t.push(mancanti.length + ' worklog aggiunti non si leggono ancora da Jira (' + mancanti.map(r => r.dst + ' ' + _cpOjOra(r.inizio)).join(', ') + '): sono stati scritti, NON ricopiarli');
      if (ancora.length) t.push(ancora.length + ' worklog eliminati si leggono ancora da Jira (' + ancora.map(e => e.t.key + ' ' + _cpOjOra(e.inizio)).join(', ') + ')');
      if (t.length) {
        const testo = t.join('; ') + '. Se «Ore Jira» non torna, rilancia «🔄 Sincronizza squadra» tra qualche minuto.';
        problemi.push(testo);
        _cpCwFatto(pv, 'warn', testo);
      } else _cpCwFatto(pv, 'ok');
    }
    if (fatti.length) _cpCwPasso('Sincronizzo la squadra «' + squadra + '» da Jira…');
  } catch (e) {
    problemi.push('Interrotto: ' + (e && e.message ? e.message : e));
  } finally {
    C.salvando = false;
    cpStatoRefresh(true);
    if (fatti.length && _cpTl.letture[k]) _cpTlWlRileggiOperatore(nome, k, d, '✓ Copiati su Jira worklog per ' + nome + '.');
  }
  const esito = '⧉ Copia worklog ' + C.da + ' → ' + nome + ', ' + C.label + ':\n' +
    (fatti.length ? '• ' + fatti.join('\n• ') : 'nessuna modifica fatta su Jira.') +
    (problemi.length ? '\n\n⚠ Da controllare:\n• ' + problemi.join('\n• ') : '');
  // e. «Sincronizza squadra» senza la domanda iniziale: il prospetto si aggiorna da solo. Solo se
  //    si è ancora sulla stessa settimana (altrimenti sincronizzerebbe quella mostrata). La
  //    finestra resta aperta con l'avanzamento finché la sincronizzazione non finisce.
  if (fatti.length && pwAnno === anno && pwWeek === week) {
    C.salvando = true;
    try {
      await pwControlloSyncJira(commessa, squadra, null, { senzaConferma: true, prefisso: esito });
    } finally {
      C.salvando = false;
      C.passi = null;
      cpCwChiudi();
    }
  } else {
    C.passi = null;
    cpCwChiudi();
    showAlertModal(esito + (fatti.length ? '\n\nHai cambiato settimana: per aggiornare «Ore Jira» usa «🔄 Sincronizza squadra».' : ''));
  }
}
