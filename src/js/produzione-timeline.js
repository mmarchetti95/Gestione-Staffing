/* ==================== CONTROLLO PRODUZIONE · TIMELINE WORKLOG ====================
   Modal "🕘 Timeline worklog" del tab Controllo Produzione (#cptl-modal, z-index sotto
   .modal-backdrop: conferme e avvisi devono comparire sopra). Per ogni operatore impiegato
   nella settimana mostrata disegna, giorno per giorno, una barra oraria con un segmento per
   worklog (da quando è stato attivato a quando è stato chiuso), le pause, le sovrapposizioni
   e il totale. Vista per giorno (un operatore per riga) o per settimana (un gruppo per
   operatore, una riga per giorno), filtri per commessa/squadra/nome, export PDF.

   Fonte dei worklog:
   - di norma quelli salvati in controllo_produzione.jira_tickets[].worklogs dall'ultimo
     "🔄 Sincronizza da Jira" (stesso dato dell'infografica su "Ore Jira"). Un operatore su
     più commesse lo stesso giorno ha più righe, e a ogni riga la sincronizzazione dà TUTTI i
     worklog della giornata: qui si uniscono per ticket, senza contarli due volte;
   - letti da jira-sync-worklogs (sola lettura) per tutti gli operatori in Griglia, anche
     quelli senza giorni compilati: in automatico alla prima apertura di ogni settimana
     (_cpTl.autoLette) e con "↻ Rileggi da Jira". Tenuti solo in memoria (_cpTl.letture),
     non aggiornano controllo_produzione. Finché la lettura non finisce si vedono i salvati.
   Commessa di un ticket: dal sottotask creato in Griglia (certo), altrimenti dal prefisso del
   ticket confrontato con il "Codice progetto Jira" delle commesse in dashboard
   (state.commesse_attive_meta). Un progetto che non corrisponde a nessuna commessa è "fuori
   dashboard" (iv.fuori): segmento con bordo rosso e avviso sulla riga. Un codice condiviso da
   più commesse (es. SINFI su AI029) si risolve solo se una sola è pianificata quel giorno.
   Clic su un segmento: apre il ticket su Jira in un'altra scheda (anche nel PDF). Per admin e
   responsabili, sui worklog con l'id Jira (letti dalla v18.230.0) il clic apre invece l'editor
   del worklog e «＋» sulla riga ne aggiunge uno: vedi produzione-timeline-worklog.js, l'unico
   punto che scrive su Jira. Il resto della timeline non scrive nulla, né su Jira né in Supabase.
   Il segmento "in corso" (sottotask IN PROGRESS, solo oggi) viene da cpLavoroInCorso sulle
   righe del Controllo Produzione già disegnate. */

const CPTL_ORA_DA = 6, CPTL_ORA_A = 20;   // asse minimo, si allarga ai worklog fuori orario
const CPTL_CORSIA_PX = 15;
const CPTL_SOGLIE = [4, 6, 7, 8];
const CPTL_SETTIMANA = -1;                // _cpTl.giorno: tutta la settimana
const CPTL_GRIGIO = '#94a3b8';
const CPTL_COLORI_COMMESSA = CP_OJ_COLORI.concat(['#14b8a6', '#a855f7', '#f97316', '#22c55e', '#3b82f6', '#e11d48']);
const CPTL_FUORI = '__fuori__';           // valore del filtro commessa "fuori dashboard"

let _cpTl = {
  aperto: false,
  settimana: null,            // 'anno|week' su cui è stato allineato il giorno di partenza
  giorno: CPTL_SETTIMANA,     // 0..5 oppure CPTL_SETTIMANA
  commessa: '', squadra: '', cerca: '',
  colore: 'ticket',           // 'ticket' | 'commessa'
  soglia: 0,                  // ore: segnala i giorni passati sotto soglia (0 = no)
  soloControllo: false,
  letture: {},                // 'anno|week' -> { worklog, verificati, avvisi, ts } letti da Jira
  autoLette: new Set(),       // settimane già lette in automatico in questa sessione
  inCorso: false,
  msg: '',
};

function cpTlApri() {
  _cpTl.aperto = true;
  const k = _cpaKey(pwAnno, pwWeek);
  if (_cpTl.settimana !== k) {
    _cpTl.settimana = k;
    const g = _cpaDateSettimana().iso.indexOf(_cpaOggiISO());
    _cpTl.giorno = g >= 0 ? g : CPTL_SETTIMANA;
    _cpTl.squadra = '';
    if (!_cpTl.inCorso) _cpTl.msg = '';
  }
  cpTlRender();
  _cpTlAutoLettura();
}

/* Click destro su una riga della tabella del Controllo Produzione: apre la timeline sul giorno
   della riga, filtrata sull'operatore (gli altri filtri si azzerano, così l'intervento si vede).
   Su campi, link e bottoni con una guida resta il loro click destro. */
function cpTlDaRiga(ev, tr) {
  for (let el = ev.target; el && el !== tr; el = el.parentElement) {
    if (el.matches('input, textarea, select, a[href]') || helpKeyFor(el)) return true;
  }
  if (sbFnApplicaNascoste() && sbFnNascosta('controllo:timeline')) return true;
  const g = Number(String(tr.dataset.cpk || '').split('|||').pop());
  if (!tr.dataset.operatore || !(g >= 0 && g <= 5)) return true;
  ev.preventDefault();
  cpOreJiraHide();
  const k = _cpaKey(pwAnno, pwWeek);
  if (_cpTl.settimana !== k && !_cpTl.inCorso) _cpTl.msg = '';
  _cpTl.settimana = k;
  _cpTl.giorno = g;
  _cpTl.commessa = ''; _cpTl.squadra = ''; _cpTl.soloControllo = false;
  _cpTl.cerca = tr.dataset.operatore;
  const body = document.getElementById('cptl-body');
  if (body) body.scrollTop = 0;
  cpTlApri();
  return false;
}

/* Prima apertura della settimana: legge da Jira da sola, così compaiono anche i worklog che
   la sincronizzazione del Controllo Produzione non salva (giorni non pianificati, operatori
   in Griglia senza giorni compilati, ticket di commesse fuori dashboard). Una volta per
   settimana e sessione: dopo si aggiorna con "↻ Rileggi da Jira". */
function _cpTlAutoLettura() {
  const k = _cpaKey(pwAnno, pwWeek);
  if (!_cpTl.aperto || _cpTl.inCorso || _cpTl.letture[k] || _cpTl.autoLette.has(k)) return;
  if (!_sbClient || !_sbUser || !_cpaCelleSettimana().operatori.size) return;
  _cpTl.autoLette.add(k);
  cpTlRileggi();
}

function cpTlChiudi() {
  _cpTl.aperto = false;
  cpTlRender();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_cpTl.aperto) return;
  const mr = document.getElementById('modal-root');
  if (mr && mr.children.length) return;   // c'è una conferma/avviso aperto sopra
  if (cpTlWlAperto()) { cpTlWlChiudi(); return; }   // prima si chiude l'editor del worklog
  cpTlChiudi();
});

/* Chiamata a fine pwControlloRender: nuova settimana o dati risincronizzati */
function cpTlOnControlloRender() {
  if (_cpTl.aperto) cpTlApri();
}

function cpTlGiorno(el) {
  _cpTl.giorno = Number(el.dataset.g);
  cpTlRender();
}

function cpTlSet(campo, v) {
  if (campo === 'soglia') v = Number(v) || 0;
  if (campo === 'soloControllo') v = !!v;
  _cpTl[campo] = v;
  if (campo === 'commessa') _cpTl.squadra = '';
  cpTlRender();
}

/* La ricerca ridisegna solo il corpo, così il campo non perde il fuoco */
function cpTlCerca(el) {
  _cpTl.cerca = el.value;
  const body = document.getElementById('cptl-body');
  if (body) body.innerHTML = _cpTlCorpo(_cpTlVista());
}

/* ---------- Dati ---------- */

function _cpTlUnici(a) { return [...new Set(a.filter(Boolean))]; }

/* Unisce i ticket di più righe dello stesso operatore/giorno: a parità di ticket tiene la
   copia con più worklog (le righe possono essere state sincronizzate in momenti diversi). */
function _cpTlUnisciTicket(lista, tickets) {
  (tickets || []).forEach(t => {
    if (!t || !t.key) return;
    const i = lista.findIndex(x => x.key === t.key);
    if (i < 0) lista.push(t);
    else if (Array.isArray(t.worklogs) && (!Array.isArray(lista[i].worklogs) || t.worklogs.length > lista[i].worklogs.length)) lista[i] = t;
  });
}

/* Lavoro in corso dell'operatore oggi, dalle righe del Controllo Produzione (prima transizione) */
function _cpTlInCorso(nome, g, iso) {
  if (iso !== _cpaOggiISO()) return null;
  let best = null;
  document.querySelectorAll('#cp-table-container tr[data-cpk]').forEach(tr => {
    if (tr.dataset.operatore !== nome || !tr.dataset.cpk.endsWith('|||' + g)) return;
    const lv = cpLavoroInCorso(tr, iso);
    if (lv && (!best || lv.inizio < best.inizio)) best = lv;
  });
  return best;
}

/* Operatore/giorno -> { celle (pianificate), ferie, tickets, sincronizzato } */
function _cpTlRaccogli(d) {
  const lett = _cpTl.letture[_cpaKey(pwAnno, pwWeek)] || null;
  const ops = {};
  const giorno = (nome, g) => {
    const o = ops[nome] || (ops[nome] = {});
    return o[g] || (o[g] = { nome, g, iso: d.iso[g], label: d.label[g], celle: [], ferie: null, tickets: [], sincronizzato: false });
  };
  _cpaCelleSettimana().celle.forEach(c => {
    const x = giorno(c.operatore, c.giorno);
    if (c.ferie) { x.ferie = c.ferie; return; }
    x.celle.push(c);
    if (lett) return;
    const s = _cpData[c.cpKey];
    if (!s || s.ore_jira == null || s.ore_jira === '' || isNaN(parseFloat(s.ore_jira))) return;
    x.sincronizzato = true;
    _cpTlUnisciTicket(x.tickets, s.jira_tickets);
  });
  if (lett) {
    lett.verificati.forEach(nome => {
      const perGiorno = lett.worklog[nome] || {};
      for (let g = 0; g < 6; g++) {
        const w = perGiorno[g];
        if (!w && !(ops[nome] && ops[nome][g])) continue;
        const x = giorno(nome, g);
        x.sincronizzato = true;
        _cpTlUnisciTicket(x.tickets, w ? w.tickets : []);
      }
    });
  }
  const righe = [];
  Object.keys(ops).forEach(nome => Object.keys(ops[nome]).forEach(g => righe.push(ops[nome][g])));
  return righe;
}

/* Operatore -> blocchi della Griglia in cui compare questa settimana, anche senza giorni */
function _cpTlInGriglia() {
  const m = {};
  pwGetWeekData().forEach(bc => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
      const n = (op.nome || '').trim();
      if (n) (m[n] = m[n] || []).push({ commessa: bc.commessa, squadra: sq.nome || 'Squadra' });
    }));
  });
  return m;
}

/* Codice progetto Jira -> commesse della dashboard che lo usano */
function _cpTlProgetti() {
  const m = {}, meta = state.commesse_attive_meta || {};
  Object.keys(meta).forEach(c => {
    const p = String((meta[c] && meta[c].jira_project_code) || '').trim().toUpperCase();
    if (p) (m[p] = m[p] || []).push(c);
  });
  return m;
}

/* Commessa di un ticket: { commessa } se riconosciuta, { fuori } se il progetto Jira non è di
   nessuna commessa in dashboard, {} se il codice è condiviso e non si sa quale. */
function _cpTlCommessaTicket(t, x, ctx) {
  const sub = ctx.indice[t.key];
  if (sub && sub.commessa) return { commessa: sub.commessa };
  const prog = String(t.key || '').split('-')[0].toUpperCase();
  const cand = ctx.progetti[prog] || [];
  if (cand.length === 1) return { commessa: cand[0] };
  if (cand.length > 1) {
    const pian = cand.filter(c => x.commesse.includes(c));
    return pian.length === 1 ? { commessa: pian[0] } : {};
  }
  if (!prog) return {};
  const epic = t.epic && t.epic.name ? t.epic.name : '';
  return { fuori: { progetto: prog, epic, etichetta: epic ? epic + ' (' + prog + ')' : 'progetto ' + prog } };
}

/* Gruppo per colore/legenda/filtro: la commessa, oppure il progetto fuori dashboard */
function _cpTlGruppo(iv) {
  return iv.commessa || (iv.fuori ? '⚠ ' + iv.fuori.etichetta : '');
}

/* Intervalli, totali e avvisi di una riga operatore/giorno */
function _cpTlCalcola(x, ctx, oggi) {
  x.pianificato = x.celle.length > 0;
  x.commesse = _cpTlUnici(x.celle.map(c => c.commessa));
  x.squadre = _cpTlUnici(x.celle.map(c => c.squadra));
  x.cantieri = _cpTlUnici([].concat(...x.celle.map(c => c.voci.map(v => v.cantiere))));
  x.inGriglia = ctx.inGriglia[x.nome] || [];
  const assegna = o => { Object.assign(o, _cpTlCommessaTicket(o.t, x, ctx)); o.gruppo = _cpTlGruppo(o); };
  const r = cpOreJiraInterventi(x.tickets, x.iso);
  x.interventi = r.interventi;
  x.senzaOrari = r.senzaOrari;
  x.interventi.forEach(assegna);
  x.senzaOrari.forEach(assegna);
  x.minuti = x.interventi.reduce((s, iv) => s + (iv.fine - iv.inizio), 0) +
    x.senzaOrari.reduce((s, v) => s + (Number(v.t.hours) || 0) * 60, 0);

  x.live = _cpTlInCorso(x.nome, x.g, x.iso);
  if (x.live) {
    x.live.voci.forEach((v, i) => {
      const ti = x.tickets.findIndex(t => t.key === v.t.key);
      const iv = {
        t: v.t, colore: CP_OJ_COLORI[(ti >= 0 ? ti : x.tickets.length + i) % CP_OJ_COLORI.length],
        inizio: Math.max(0, v.inizio), fine: x.live.fine, inCorso: true,
        commento: 'IN PROGRESS dalle ' + v.info.testo + ', non ancora registrato su Jira',
      };
      assegna(iv);
      x.interventi.push(iv);
    });
    x.interventi.sort((a, b) => a.inizio - b.inizio || a.fine - b.fine);
  }

  // Unione degli intervalli: pause = giornata (primo inizio -> ultima fine) meno il tempo coperto
  let unione = 0, finoA = null, sovr = 0;
  x.interventi.forEach(iv => {
    if (finoA != null && iv.inizio < finoA) sovr++;
    if (finoA == null || iv.inizio >= finoA) unione += iv.fine - iv.inizio;
    else if (iv.fine > finoA) unione += iv.fine - finoA;
    finoA = finoA == null ? iv.fine : Math.max(finoA, iv.fine);
  });
  x.sovrapposti = sovr;
  x.inizio = x.interventi.length ? x.interventi[0].inizio : null;
  x.fine = x.interventi.length ? finoA : null;
  x.pause = x.interventi.length ? Math.max(0, x.fine - x.inizio - unione) : 0;

  const passato = x.iso < oggi;
  x.avvisi = [];
  if (x.ferie && x.minuti > 0) x.avvisi.push(x.ferie === 'ferie' ? 'In ferie ma con worklog' : 'Non disponibile ma con worklog');
  else if (!x.pianificato && x.minuti > 0) x.avvisi.push('Worklog senza pianificazione');
  if (x.pianificato && x.sincronizzato && passato && x.minuti < 15) x.avvisi.push('Nessun worklog');
  else if (_cpTl.soglia && x.pianificato && x.sincronizzato && passato && x.minuti < _cpTl.soglia * 60) x.avvisi.push('Sotto ' + _cpTl.soglia + ' h');
  if (x.sovrapposti) x.avvisi.push(x.sovrapposti === 1 ? '1 sovrapposizione' : x.sovrapposti + ' sovrapposizioni');
  if (x.live && x.live.vecchio) x.avvisi.push('IN PROGRESS dal giorno prima');
  if (x.senzaOrari.length) x.avvisi.push('Orari mancanti: risincronizza');
  x.fuori = _cpTlUnici(x.interventi.concat(x.senzaOrari).map(o => o.fuori ? o.fuori.etichetta : ''));
  if (x.fuori.length) x.avvisi.push('Commessa non in dashboard: ' + x.fuori.join(', '));
}

/* Commesse/squadre della riga per i filtri: quelle pianificate quel giorno; se il giorno non è
   pianificato, quelle in cui l'operatore compare in Griglia questa settimana. */
function _cpTlCommesseRiga(x) { return x.pianificato ? x.commesse : _cpTlUnici(x.inGriglia.map(b => b.commessa)); }
function _cpTlSquadreRiga(x) { return x.pianificato ? x.squadre : _cpTlUnici(x.inGriglia.map(b => b.squadra)); }

function _cpTlPassa(x) {
  if (_cpTl.commessa === CPTL_FUORI) { if (!x.fuori.length) return false; }
  else if (_cpTl.commessa && !_cpTlCommesseRiga(x).includes(_cpTl.commessa) &&
      !x.interventi.some(iv => iv.commessa === _cpTl.commessa)) return false;
  if (_cpTl.squadra && !_cpTlSquadreRiga(x).includes(_cpTl.squadra)) return false;
  if (_cpTl.soloControllo && !x.avvisi.length) return false;
  const q = _cpTl.cerca.trim().toLowerCase();
  if (q && !x.nome.toLowerCase().includes(q) && !x.cantieri.some(c => c.toLowerCase().includes(q))) return false;
  return true;
}

/* Tutto quello che serve per disegnare (modal e PDF) con i filtri attuali */
function _cpTlVista() {
  const d = _cpaDateSettimana(), oggi = _cpaOggiISO();
  const ctx = { indice: _cpaIndiceSottotask(), progetti: _cpTlProgetti(), inGriglia: _cpTlInGriglia() };
  const tutte = _cpTlRaccogli(d);
  tutte.forEach(x => _cpTlCalcola(x, ctx, oggi));
  const incluse = tutte.filter(x => x.pianificato || x.minuti > 0 || x.live);

  const perNomeIt = (a, b) => a.localeCompare(b, 'it');
  const commesse = _cpTlUnici([].concat(...incluse.map(x => _cpTlCommesseRiga(x).concat(x.interventi.map(iv => iv.commessa))))).sort(perNomeIt);
  const nFuori = incluse.filter(x => x.fuori.length).length;
  // Colori per gruppo: prima le commesse, poi i progetti fuori dashboard
  const gruppiColore = commesse.concat(_cpTlUnici([].concat(...incluse.map(x => x.interventi.map(iv => iv.fuori ? iv.gruppo : '')))).sort(perNomeIt));
  const coloreCommessa = c => {
    const i = gruppiColore.indexOf(c);
    return i < 0 ? CPTL_GRIGIO : CPTL_COLORI_COMMESSA[i % CPTL_COLORI_COMMESSA.length];
  };
  if (_cpTl.colore === 'commessa') incluse.forEach(x => x.interventi.forEach(iv => { iv.colore = coloreCommessa(iv.gruppo); }));
  if (_cpTl.commessa === CPTL_FUORI && !nFuori) _cpTl.commessa = '';

  const squadre = _cpTlUnici([].concat(...incluse.filter(x => !_cpTl.commessa || _cpTl.commessa === CPTL_FUORI || _cpTlCommesseRiga(x).includes(_cpTl.commessa))
    .map(_cpTlSquadreRiga))).sort(perNomeIt);
  if (_cpTl.squadra && !squadre.includes(_cpTl.squadra)) _cpTl.squadra = '';

  const perNome = (a, b) => a.nome.localeCompare(b.nome, 'it') || a.g - b.g;
  const righe = incluse.filter(x => (_cpTl.giorno === CPTL_SETTIMANA || x.g === _cpTl.giorno) && _cpTlPassa(x)).sort(perNome);
  const gruppi = [];
  righe.forEach(x => {
    const ult = gruppi[gruppi.length - 1];
    if (ult && ult.nome === x.nome) ult.righe.push(x); else gruppi.push({ nome: x.nome, righe: [x] });
  });

  let da = CPTL_ORA_DA, a = CPTL_ORA_A;
  righe.forEach(x => x.interventi.forEach(iv => {
    da = Math.min(da, Math.floor(iv.inizio / 60));
    a = Math.max(a, Math.ceil(iv.fine / 60));
  }));
  da = Math.max(0, da); a = Math.min(36, Math.max(a, da + 1));

  const ora = cpOraRoma();
  return {
    d, oggi, righe, gruppi, commesse, squadre, coloreCommessa, nFuori,
    asse: { da, a }, adesso: ora ? ora.min : null,
    lettura: _cpTl.letture[_cpaKey(pwAnno, pwWeek)] || null,
    nOperatori: gruppi.length,
    minuti: righe.reduce((s, x) => s + x.minuti, 0),
    nAvvisi: righe.filter(x => x.avvisi.length).length,
  };
}

/* ---------- Lettura da Jira (sola lettura, non salvata) ---------- */

/* Nome operatore -> email in anagrafica (serve a leggere e scrivere i suoi worklog) */
function _cpTlEmailPerNome() {
  const m = {};
  (state.operatori || []).forEach(o => {
    const n = o.nome_esteso || o.nome_breve || o.nome;
    if (n && o.email && o.email.trim()) m[n] = o.email.trim();
  });
  return m;
}

async function _cpTlLeggiWorklog(nomi, date) {
  const emailByNome = _cpTlEmailPerNome();
  const avvisi = [];
  const senzaEmail = nomi.filter(n => !emailByNome[n]);
  if (senzaEmail.length) avvisi.push('Senza email in anagrafica, worklog non letti: ' + senzaEmail.join(', ') + '.');
  const nomeByEmail = {};
  nomi.filter(n => emailByNome[n]).forEach(n => { nomeByEmail[emailByNome[n].toLowerCase()] = n; });
  const emails = Object.keys(nomeByEmail);
  const worklog = {}, verificati = [];
  for (let i = 0; i < emails.length; i += CPA_EMAIL_CHUNK) {
    const blocco = emails.slice(i, i + CPA_EMAIL_CHUNK);
    _cpTl.msg = '⏳ Leggo i worklog da Jira (' + Math.min(i + CPA_EMAIL_CHUNK, emails.length) + '/' + emails.length + ' operatori)…';
    cpTlRender();
    const { data: fn, error } = await _sbClient.functions.invoke('jira-sync-worklogs', {
      body: { emails: blocco, startDate: date.iso[0], endDate: date.iso[5] },
    });
    if (error) throw new Error(await _cpEdgeErr(error, 'jira-sync-worklogs'));
    const res = (fn && fn.results) || {}, errs = (fn && fn.errors) || {};
    blocco.forEach(em => {
      const nome = nomeByEmail[em];
      if (errs[em]) { avvisi.push(nome + ': ' + errs[em] + ' (worklog non letti).'); return; }
      verificati.push(nome);
      const perData = res[em] || {};
      worklog[nome] = {};
      date.iso.forEach((iso, g) => { if (perData[iso]) worklog[nome][g] = { hours: perData[iso].hours, tickets: perData[iso].tickets || [] }; });
    });
  }
  return { worklog, verificati, avvisi };
}

async function cpTlRileggi() {
  if (_cpTl.inCorso) return;
  if (!_sbClient || !_sbUser) { showAlertModal('Per leggere i worklog da Jira bisogna essere collegati.'); return; }
  const d = _cpaDateSettimana(), k = _cpaKey(pwAnno, pwWeek);
  const nomi = [..._cpaCelleSettimana().operatori];
  if (!nomi.length) { showAlertModal('Nessun operatore in Griglia questa settimana.'); return; }
  _cpTl.inCorso = true;
  try {
    const r = await _cpTlLeggiWorklog(nomi, d);
    r.ts = new Date();
    _cpTl.letture[k] = r;
    _cpTl.msg = r.avvisi.length ? '⚠ ' + r.avvisi.join(' ') : '';
  } catch (e) {
    _cpTl.msg = '⚠ Lettura da Jira non riuscita: ' + (e && e.message ? e.message : e);
  } finally {
    _cpTl.inCorso = false;
    cpTlRender();
    _cpTlAutoLettura();   // se nel frattempo si è passati a un'altra settimana
  }
}

/* ---------- Disegno ---------- */

function cpTlRender() {
  const modal = document.getElementById('cptl-modal');
  const root = document.getElementById('cptl-root');
  if (!modal || !root) return;
  modal.style.display = _cpTl.aperto ? 'flex' : 'none';
  if (!_cpTl.aperto) return;
  const prima = document.getElementById('cptl-body');
  const scroll = prima ? prima.scrollTop : 0;
  const cercaAttivo = document.activeElement && document.activeElement.id === 'cptl-cerca';
  const V = _cpTlVista();
  root.innerHTML = _cpTlIntestazione(V) + _cpTlBarra(V) +
    '<div id="cptl-body" style="flex:1;overflow:auto;padding:10px 20px 20px;">' + _cpTlCorpo(V) + '</div>';
  const dopo = document.getElementById('cptl-body');
  if (dopo && scroll) dopo.scrollTop = scroll;
  if (cercaAttivo) {
    const inp = document.getElementById('cptl-cerca');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
}

function _cpTlFonteTesto(V) {
  if (_cpTl.inCorso && !V.lettura) return 'Intanto vedi i worklog dell\'ultima sincronizzazione del Controllo Produzione';
  if (V.lettura) return 'Worklog letti da Jira alle ' + V.lettura.ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
    ' (solo in questa finestra, non aggiornano il Controllo Produzione)';
  return 'Worklog dell\'ultima sincronizzazione del Controllo Produzione: per vederli aggiornati usa «↻ Rileggi da Jira»';
}

function _cpTlIntestazione(V) {
  const btn = 'text-xs px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50';
  return '<div style="background:white;padding:14px 20px 8px;">' +
    '<div class="flex flex-wrap items-start gap-2">' +
      '<div class="min-w-0">' +
        '<div style="font-weight:700;font-size:16px;color:#0f172a;font-family:var(--font-display);">🕘 Timeline worklog</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Settimana ' + pwWeek + ' · ' + V.d.ddmm[0] + ' – ' + V.d.ddmm[5] + '/' + pwAnno +
          ' · quando ogni operatore ha attivato e chiuso i worklog Jira, pause e totale del giorno. Passa il mouse su un segmento per i dettagli, ' +
          (cpTlWlPuo() ? 'clicca per correggerlo o eliminarlo su Jira; «＋» sulla riga aggiunge un worklog.' : 'clicca per aprire il ticket su Jira.') + '</div>' +
        '<div class="text-[11px] mt-0.5" style="color:' + (V.lettura ? '#0f766e' : '#64748b') + ';">' + esc(_cpTlFonteTesto(V)) + '</div>' +
      '</div>' +
      '<div class="flex-1"></div>' +
      '<button type="button" onclick="cpTlRileggi()" class="text-xs px-3 py-1 rounded font-semibold text-white" style="background:#0f766e;' +
        (_cpTl.inCorso ? 'opacity:.55;' : '') + '"' + (_cpTl.inCorso ? ' disabled' : '') + ' title="Rilegge i worklog della settimana da Jira, in sola lettura">↻ Rileggi da Jira</button>' +
      '<button type="button" onclick="cpTlEsportaPdf()" class="' + btn + '" style="color:#be123c;border-color:#fda4af;" title="Scarica la vista attuale in PDF">📄 Esporta PDF</button>' +
      '<button type="button" onclick="cpTlChiudi()" class="' + btn + '">Chiudi</button>' +
    '</div>' +
    (_cpTl.msg ? '<div class="text-xs mt-1.5 ' + (_cpTl.msg.startsWith('⚠') ? 'text-amber-700' : 'text-slate-600') + '">' + esc(_cpTl.msg) + '</div>' : '') +
  '</div>';
}

function _cpTlOpzioni(valori, scelto, vuoto) {
  return '<option value="">' + vuoto + '</option>' +
    valori.map(v => '<option value="' + esc(v) + '"' + (v === scelto ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
}

function _cpTlBarra(V) {
  const tab = (g, testo) => '<button type="button" data-g="' + g + '" data-help-key="cpTlGiorno" onclick="cpTlGiorno(this)" class="cptl-tab' +
    (_cpTl.giorno === g ? ' on' : '') + (V.d.iso[g] === V.oggi ? ' oggi' : '') + '">' + testo + '</button>';
  const sel = 'text-xs border border-slate-200 rounded px-2 py-1 bg-white';
  let h = '<div style="background:white;padding:0 20px 10px;border-bottom:1px solid #e2e8f0;">' +
    '<div class="flex flex-wrap gap-1 mb-2">';
  for (let g = 0; g < 6; g++) h += tab(g, esc(V.d.label[g]));
  h += tab(CPTL_SETTIMANA, 'Settimana') + '</div>' +
    '<div class="flex flex-wrap items-center gap-2">' +
      '<select class="' + sel + '" onchange="cpTlSet(\'commessa\', this.value)" title="Filtra per commessa">' + _cpTlOpzioni(V.commesse, _cpTl.commessa, 'Tutte le commesse') +
        (V.nFuori ? '<option value="' + CPTL_FUORI + '"' + (_cpTl.commessa === CPTL_FUORI ? ' selected' : '') + '>⚠ Commesse non in dashboard (' + V.nFuori + ')</option>' : '') + '</select>' +
      '<select class="' + sel + '" onchange="cpTlSet(\'squadra\', this.value)" title="Filtra per squadra">' + _cpTlOpzioni(V.squadre, _cpTl.squadra, 'Tutte le squadre') + '</select>' +
      '<input id="cptl-cerca" type="text" class="' + sel + '" style="width:190px;" placeholder="Cerca operatore o cantiere…" value="' + esc(_cpTl.cerca) + '" oninput="cpTlCerca(this)">' +
      '<label class="text-xs text-slate-600 flex items-center gap-1">Colore per' +
        '<select class="' + sel + '" onchange="cpTlSet(\'colore\', this.value)">' +
          '<option value="ticket"' + (_cpTl.colore === 'ticket' ? ' selected' : '') + '>ticket</option>' +
          '<option value="commessa"' + (_cpTl.colore === 'commessa' ? ' selected' : '') + '>commessa</option>' +
        '</select></label>' +
      '<label class="text-xs text-slate-600 flex items-center gap-1">Segnala sotto' +
        '<select class="' + sel + '" onchange="cpTlSet(\'soglia\', this.value)">' +
          '<option value="0">—</option>' +
          CPTL_SOGLIE.map(s => '<option value="' + s + '"' + (_cpTl.soglia === s ? ' selected' : '') + '>' + s + ' h</option>').join('') +
        '</select></label>' +
      '<label class="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" onchange="cpTlSet(\'soloControllo\', this.checked)"' +
        (_cpTl.soloControllo ? ' checked' : '') + '> solo da controllare</label>' +
    '</div></div>';
  return h;
}

function _cpTlPct(m, asse) {
  return ((m - asse.da * 60) / ((asse.a - asse.da) * 60) * 100).toFixed(3) + '%';
}

function _cpTlPassoOre(asse) { return (asse.a - asse.da) > 16 ? 2 : 1; }

function _cpTlAsseHtml(asse) {
  let h = '';
  for (let o = asse.da; o <= asse.a; o += _cpTlPassoOre(asse)) {
    h += '<span style="left:' + _cpTlPct(o * 60, asse) + '">' + String(o % 24).padStart(2, '0') + '</span>';
  }
  return '<div class="cptl-axis">' + h + '</div>';
}

/* Corsie: i worklog sovrapposti vanno su righe diverse della stessa barra */
function _cpTlCorsie(iv) {
  const fine = [];
  const corsie = iv.map(x => {
    let c = fine.findIndex(f => f <= x.inizio);
    if (c < 0) { c = fine.length; fine.push(0); }
    fine[c] = x.fine;
    return c;
  });
  return { corsie, n: Math.max(1, fine.length) };
}

function _cpTlVuotoTesto(x, oggi) {
  if (!x.sincronizzato && !x.live) return x.ferie ? 'In ferie' : 'Non sincronizzato con Jira';
  if (x.interventi.length) return '';
  if (x.senzaOrari.length) return 'Orari non disponibili (' + _cpOjDurata(x.minuti) + '): risincronizza';
  return x.iso > oggi ? 'Giorno futuro' : 'Nessun worklog';
}

function _cpTlTitoloBarra(iv, modifica) {
  return iv.t.key + (iv.t.summary ? ' — ' + iv.t.summary : '') + '\n' +
    _cpOjOra(iv.inizio) + '–' + (iv.inCorso ? 'ora' : _cpOjOra(iv.fine)) + ' (' + _cpOjDurata(iv.fine - iv.inizio) + ')' +
    (iv.commessa ? '\n' + iv.commessa : '') +
    (iv.fuori ? '\n⚠ Commessa non in dashboard: ' + iv.fuori.etichetta + ' (nessuna commessa ha il codice progetto Jira ' + iv.fuori.progetto + ')' : '') +
    (iv.commento ? '\n“' + iv.commento + '”' : '') +
    (modifica ? '\nClic: correggi o elimina il worklog su Jira' : iv.t.url ? '\nClic: apre il ticket su Jira' : '');
}

function _cpTlTrackHtml(x, V) {
  const { corsie, n } = _cpTlCorsie(x.interventi);
  let h = '';
  for (let o = V.asse.da + 1; o < V.asse.a; o++) h += '<div class="cptl-grid" style="left:' + _cpTlPct(o * 60, V.asse) + '"></div>';
  if (x.interventi.length > 1) {
    h += '<div class="cptl-span" style="left:' + _cpTlPct(x.inizio, V.asse) + ';width:' +
      ((x.fine - x.inizio) / ((V.asse.a - V.asse.da) * 60) * 100).toFixed(3) + '%"></div>';
  }
  const puo = cpTlWlPuo();
  x.interventi.forEach((iv, i) => {
    // Worklog con id (e utente che può scrivere): il clic apre l'editor. Altrimenti, con l'URL il
    // segmento è un link: si apre in un'altra scheda (il click destro resta quello del browser)
    const modifica = !!(puo && !iv.inCorso && iv.w && iv.w.id);
    const tag = modifica ? 'div' : iv.t.url ? 'a' : 'div';
    h += '<' + tag + (modifica ? ' data-op="' + esc(x.nome) + '" data-g="' + x.g + '" data-k="' + esc(iv.t.key || '') + '" data-wl="' + esc(String(iv.w.id)) +
        '" data-help-key="cpTlWlApri" onclick="cpTlWlApri(this)"'
        : iv.t.url ? ' href="' + esc(iv.t.url) + '" target="_blank" rel="noopener"' : '') +
      ' class="cptl-bar' + (modifica ? ' edit' : '') + (iv.inCorso ? ' cp-oj-bar-live' : '') + (iv.fuori ? ' fuori' : '') + '" title="' + esc(_cpTlTitoloBarra(iv, modifica)) + '" style="left:' + _cpTlPct(iv.inizio, V.asse) +
      ';width:' + ((iv.fine - iv.inizio) / ((V.asse.a - V.asse.da) * 60) * 100).toFixed(3) + '%;top:' + (3 + corsie[i] * CPTL_CORSIA_PX) +
      'px;background-color:' + iv.colore + '">' + esc(iv.t.key || '') + '</' + tag + '>';
  });
  if (x.iso === V.oggi && V.adesso != null && V.adesso >= V.asse.da * 60 && V.adesso <= V.asse.a * 60) {
    h += '<div class="cptl-now" style="left:' + _cpTlPct(V.adesso, V.asse) + '" title="Adesso"></div>';
  }
  const vuoto = _cpTlVuotoTesto(x, V.oggi);
  if (vuoto) h += '<div class="cptl-vuoto">' + esc(vuoto) + '</div>';
  return '<div class="cptl-track" style="height:' + (n * CPTL_CORSIA_PX + 5) + 'px">' + h + '</div>';
}

function _cpTlNumeri(x) {
  const tot = '<b>' + (x.sincronizzato || x.live ? _cpOjDurata(x.minuti) : '—') + '</b>' +
    (x.live ? '<div class="cp-oj-tot-live" style="font-size:10px;">+' + _cpOjDurata(x.live.minuti) + ' in corso</div>' : '');
  return '<div class="cptl-num">' + (x.inizio != null ? _cpOjOra(x.inizio) : '—') + '</div>' +
    '<div class="cptl-num">' + (x.fine != null ? (x.live && x.fine === x.live.fine ? 'ora' : _cpOjOra(x.fine)) : '—') + '</div>' +
    '<div class="cptl-num"' + (x.avvisi.length ? ' style="color:#b45309"' : '') + '>' + tot + '</div>' +
    '<div class="cptl-num">' + (x.pause >= 1 ? _cpOjDurata(x.pause) : '—') + '</div>';
}

/* Dove lavorava quel giorno secondo la Griglia (testo della seconda riga dell'etichetta) */
function _cpTlDove(x) {
  if (x.pianificato) return x.commesse.join(', ') + (x.squadre.length ? ' · ' + x.squadre.join(', ') : '') + (x.cantieri.length ? ' · ' + x.cantieri.join(', ') : '');
  if (x.ferie) return x.ferie === 'ferie' ? 'In ferie' : 'Non disponibile';
  if (x.inGriglia.length) return 'Non pianificato quel giorno · in Griglia: ' + _cpTlUnici(x.inGriglia.map(b => b.commessa + ' (' + b.squadra + ')')).join(', ');
  return 'Non in Griglia';
}

function _cpTlSotto(x, conNome) {
  const dove = _cpTlDove(x);
  return (conNome ? '<b>' + esc(x.nome) + '</b>' : '<b>' + esc(x.label) + '</b>') +
    '<small title="' + esc(dove) + '">' + esc(dove) + '</small>' +
    (x.avvisi.length ? '<span class="cptl-flag" title="' + esc(x.avvisi.join('\n')) + '">⚠ ' + esc(x.avvisi.join(' · ')) + '</span>' : '');
}

function _cpTlRigaHtml(x, V, conNome, alt) {
  const piu = cpTlWlPuo() && x.iso <= V.oggi
    ? '<button type="button" class="cptl-add" data-op="' + esc(x.nome) + '" data-g="' + x.g + '" onclick="cpTlWlNuovo(this)" title="Aggiungi un worklog su Jira per ' +
      esc(x.nome) + ' (' + esc(x.label) + ')">＋</button>' : '';
  return '<div class="cptl-r' + (alt ? ' alt' : '') + (x.avvisi.length ? ' warn' : '') + '">' +
    '<div class="cptl-op' + (piu ? ' con-add' : '') + '">' + _cpTlSotto(x, conNome) + piu + '</div>' +
    _cpTlTrackHtml(x, V) + _cpTlNumeri(x) + '</div>';
}

/* Gruppi colore usati dalle righe mostrate: '—' = commessa non riconosciuta (codice condiviso) */
function _cpTlGruppiUsati(V) {
  return _cpTlUnici([].concat(...V.righe.map(x => x.interventi.map(iv => iv.gruppo || '—'))));
}

function _cpTlLegenda(V) {
  const fuori = V.nFuori ? '<span class="cptl-leg"><i class="fuori"></i>bordo rosso = commessa non in dashboard</span>' : '';
  if (_cpTl.colore !== 'commessa') return '<span class="text-slate-400">Colori: un colore per ticket all\'interno della riga.</span>' + fuori;
  return _cpTlGruppiUsati(V).map(c => '<span class="cptl-leg"><i' + (c.startsWith('⚠ ') ? ' class="fuori"' : '') + ' style="background:' +
    (c === '—' ? CPTL_GRIGIO : V.coloreCommessa(c)) + '"></i>' +
    esc(c === '—' ? 'Commessa non riconosciuta' : c.startsWith('⚠ ') ? c.slice(2) + ' — non in dashboard' : c) + '</span>').join('');
}

function _cpTlCorpo(V) {
  if (!V.righe.length) {
    return _cpTl.inCorso ? '<div class="text-sm mt-6 text-center text-slate-600">' + esc(_cpTl.msg || '⏳ Leggo i worklog da Jira…') + '</div>'
      : '<div class="text-sm mt-8 text-center text-slate-400">Nessun operatore da mostrare con questi filtri.</div>';
  }
  const settimana = _cpTl.giorno === CPTL_SETTIMANA;
  let h = '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mb-2">' +
    '<span><b>' + V.nOperatori + '</b> ' + (V.nOperatori === 1 ? 'operatore' : 'operatori') + '</span>' +
    '<span>Totale worklog <b>' + _cpOjDurata(V.minuti) + '</b></span>' +
    (V.nAvvisi ? '<span style="color:#b45309;">⚠ <b>' + V.nAvvisi + '</b> ' + (V.nAvvisi === 1 ? 'giornata da controllare' : 'giornate da controllare') + '</span>' : '') +
    '<span class="flex flex-wrap gap-2">' + _cpTlLegenda(V) + '</span></div>';
  // Intestazione fissa, poi le righe: per giorno a righe alterne; per settimana un riquadro per operatore
  h += '<div class="cptl-tab-wrap"><div class="cptl-r cptl-head"><div>' + (settimana ? 'Operatore / giorno' : 'Operatore') + '</div>' +
    _cpTlAsseHtml(V.asse) + '<div class="cptl-num">Inizio</div><div class="cptl-num">Fine</div><div class="cptl-num">Totale</div><div class="cptl-num">Pause</div></div>';
  if (!settimana) {
    h += '<div class="cptl-card">';
    V.righe.forEach((x, i) => { h += _cpTlRigaHtml(x, V, true, i % 2 === 1); });
    h += '</div>';
  } else {
    V.gruppi.forEach(gr => {
      const tot = gr.righe.reduce((s, x) => s + x.minuti, 0);
      const pause = gr.righe.reduce((s, x) => s + x.pause, 0);
      const comm = _cpTlUnici([].concat(...gr.righe.map(_cpTlCommesseRiga)));
      const nAvv = gr.righe.filter(x => x.avvisi.length).length;
      h += '<div class="cptl-card cptl-blocco"><div class="cptl-r cptl-grp"><div class="cptl-op"><b>' + esc(gr.nome) + '</b><small>' + esc(comm.join(', ')) + '</small></div>' +
        '<div class="text-[11px] text-slate-600">' + gr.righe.length + (gr.righe.length === 1 ? ' giorno' : ' giorni') +
          (nAvv ? ' · <span style="color:#b45309;font-weight:600;">⚠ ' + nAvv + ' da controllare</span>' : '') + '</div>' +
        '<div></div><div></div><div class="cptl-num"><b>' + _cpOjDurata(tot) + '</b></div><div class="cptl-num">' + (pause >= 1 ? _cpOjDurata(pause) : '—') + '</div></div>';
      gr.righe.forEach((x, i) => { h += _cpTlRigaHtml(x, V, false, i % 2 === 1); });
      h += '</div>';
    });
  }
  return h + '</div>';
}

/* ---------- Export PDF ---------- */

function _cpTlRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [148, 163, 184];
}

function cpTlEsportaPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showAlertModal('Libreria PDF non disponibile.'); return; }
  const V = _cpTlVista();
  if (!V.righe.length) { showAlertModal('Nessun operatore da esportare con questi filtri.'); return; }
  const settimana = _cpTl.giorno === CPTL_SETTIMANA;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const M = 10, LW = 60, TX = M + LW + 2, NW = 56, TW = pageW - M - NW - TX;
  const colFine = [TX + TW + 12, TX + TW + 24, TX + TW + 39, pageW - M];   // bordo destro di Inizio, Fine, Totale, Pause
  const span = (V.asse.a - V.asse.da) * 60;
  const xDi = m => TX + (m - V.asse.da * 60) / span * TW;
  const T = s => _cpaPdfTxt(s);
  const oraTs = d => d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const vista = settimana ? 'Tutta la settimana' : CPA_GIORNI_LUNGHI[_cpTl.giorno] + ' ' + V.d.ddmm[_cpTl.giorno];

  doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.setTextColor(15, 118, 110);
  doc.text(T('Timeline worklog — ' + vista), M, 14);
  doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text(T('Settimana ' + pwWeek + ' · ' + V.d.ddmm[0] + ' – ' + V.d.ddmm[5] + '/' + pwAnno + ' · ' + V.nOperatori +
    (V.nOperatori === 1 ? ' operatore' : ' operatori') + ' · totale worklog ' + _cpOjDurata(V.minuti) +
    (V.nAvvisi ? ' · ' + V.nAvvisi + (V.nAvvisi === 1 ? ' giornata da controllare' : ' giornate da controllare') : '')), M, 19.5);
  const filtri = [
    _cpTl.commessa ? (_cpTl.commessa === CPTL_FUORI ? 'commesse non in dashboard' : 'commessa ' + _cpTl.commessa) : '', _cpTl.squadra ? 'squadra ' + _cpTl.squadra : '',
    _cpTl.cerca.trim() ? 'ricerca "' + _cpTl.cerca.trim() + '"' : '', _cpTl.soglia ? 'segnala sotto ' + _cpTl.soglia + ' h' : '',
    _cpTl.soloControllo ? 'solo da controllare' : '',
  ].filter(Boolean);
  doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  doc.text(T((filtri.length ? 'Filtri: ' + filtri.join(', ') + ' · ' : '') +
    (V.lettura ? 'Worklog letti da Jira il ' + oraTs(V.lettura.ts) : 'Worklog dell\'ultima sincronizzazione del Controllo Produzione') +
    ' · generato il ' + oraTs(new Date()) + ((_sbUser && _sbUser.email) ? ' da ' + _sbUser.email : '')), M, 24);

  const asse = y => {
    doc.setFont(undefined, 'bold'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(settimana ? 'Operatore / giorno' : 'Operatore', M, y);
    for (let o = V.asse.da; o <= V.asse.a; o += _cpTlPassoOre(V.asse)) doc.text(String(o % 24).padStart(2, '0'), xDi(o * 60), y, { align: 'center' });
    ['Inizio', 'Fine', 'Totale', 'Pause'].forEach((t, i) => doc.text(t, colFine[i], y, { align: 'right' }));
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2); doc.line(M, y + 1.5, pageW - M, y + 1.5);
    doc.setFont(undefined, 'normal');
    return y + 3;
  };
  let y = asse(31);
  let pagina = 1;
  const spazio = h => { if (y + h > pageH - 13) { doc.addPage(); pagina++; y = asse(14); } };
  const riga1 = (s, w) => doc.splitTextToSize(T(s), w)[0] || '';

  const disegnaRiga = (x, conNome, alt) => {
    const { corsie, n } = _cpTlCorsie(x.interventi);
    const h = Math.max(x.avvisi.length ? 9.5 : 7.5, n * 3.4 + 2.6);
    spazio(h);
    if (x.avvisi.length) { doc.setFillColor(255, 251, 235); doc.rect(M, y, pageW - 2 * M, h, 'F'); }
    else if (alt) { doc.setFillColor(241, 245, 249); doc.rect(M, y, pageW - 2 * M, h, 'F'); }
    doc.setFont(undefined, 'bold'); doc.setFontSize(conNome ? 8 : 7.5); doc.setTextColor(15, 23, 42);
    doc.text(riga1(conNome ? x.nome : x.label, LW), M + (conNome ? 0.5 : 2.5), y + 2.9);
    doc.setFont(undefined, 'normal'); doc.setFontSize(6); doc.setTextColor(100, 116, 139);
    doc.text(riga1(_cpTlDove(x), LW - 2), M + (conNome ? 0.5 : 2.5), y + 5.4);
    if (x.avvisi.length) { doc.setTextColor(180, 83, 9); doc.text(riga1('! ' + x.avvisi.join(' · '), LW - 2), M + (conNome ? 0.5 : 2.5), y + 7.8); }

    if (alt && !x.avvisi.length) doc.setFillColor(226, 232, 240); else doc.setFillColor(241, 245, 249);
    doc.rect(TX, y + 0.7, TW, h - 1.4, 'F');
    doc.setDrawColor(213, 222, 233); doc.setLineWidth(0.1); doc.setLineDashPattern([0.5, 0.7], 0);
    for (let o = V.asse.da + 1; o < V.asse.a; o++) doc.line(xDi(o * 60), y + 0.7, xDi(o * 60), y + h - 0.7);
    doc.setLineDashPattern([], 0);
    if (x.interventi.length > 1) { doc.setFillColor(203, 213, 225); doc.rect(xDi(x.inizio), y + h / 2 - 0.25, xDi(x.fine) - xDi(x.inizio), 0.5, 'F'); }
    x.interventi.forEach((iv, i) => {
      const bx = xDi(iv.inizio), bw = Math.max(0.6, xDi(iv.fine) - bx), by = y + 1.3 + corsie[i] * 3.4;
      const c = _cpTlRgb(iv.colore);
      if (iv.inCorso) {
        doc.setFillColor(Math.round(c[0] + (255 - c[0]) * 0.5), Math.round(c[1] + (255 - c[1]) * 0.5), Math.round(c[2] + (255 - c[2]) * 0.5));
        doc.rect(bx, by, bw, 2.8, 'F');
        doc.setDrawColor(234, 88, 12); doc.setLineWidth(0.25); doc.setLineDashPattern([0.6, 0.5], 0);
        doc.rect(bx, by, bw, 2.8, 'S'); doc.setLineDashPattern([], 0);
      } else {
        doc.setFillColor(c[0], c[1], c[2]);
        doc.roundedRect(bx, by, bw, 2.8, 0.5, 0.5, 'F');
      }
      if (iv.fuori) {
        doc.setDrawColor(185, 28, 28); doc.setLineWidth(0.35); doc.setLineDashPattern([0.7, 0.4], 0);
        doc.rect(bx, by, bw, 2.8, 'S'); doc.setLineDashPattern([], 0);
      }
      if (iv.t.url) doc.link(bx, by, bw, 2.8, { url: iv.t.url });
      doc.setFontSize(5); doc.setTextColor(255, 255, 255);
      const k = T(iv.t.key || '');
      if (k && doc.getTextWidth(k) < bw - 1) doc.text(k, bx + 0.6, by + 2.05);
    });
    if (x.iso === V.oggi && V.adesso != null && V.adesso >= V.asse.da * 60 && V.adesso <= V.asse.a * 60) {
      doc.setDrawColor(225, 29, 72); doc.setLineWidth(0.4); doc.line(xDi(V.adesso), y + 0.3, xDi(V.adesso), y + h - 0.3);
    }
    const vuoto = _cpTlVuotoTesto(x, V.oggi);
    if (vuoto) { doc.setFont(undefined, 'italic'); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184); doc.text(T(vuoto), TX + 2, y + h / 2 + 1); doc.setFont(undefined, 'normal'); }

    doc.setFontSize(7); doc.setTextColor(30, 41, 59);
    const ym = y + h / 2 + 1;
    doc.text(x.inizio != null ? _cpOjOra(x.inizio) : '-', colFine[0], ym, { align: 'right' });
    doc.text(x.fine != null ? (x.live && x.fine === x.live.fine ? 'ora' : _cpOjOra(x.fine)) : '-', colFine[1], ym, { align: 'right' });
    doc.setFont(undefined, 'bold');
    if (x.avvisi.length) doc.setTextColor(180, 83, 9);
    doc.text(x.sincronizzato || x.live ? _cpOjDurata(x.minuti) : '-', colFine[2], ym - (x.live ? 1.2 : 0), { align: 'right' });
    doc.setFont(undefined, 'normal');
    if (x.live) { doc.setFontSize(5.5); doc.setTextColor(234, 88, 12); doc.text('+' + _cpOjDurata(x.live.minuti) + ' in corso', colFine[2], ym + 1.6, { align: 'right' }); }
    doc.setFontSize(7); doc.setTextColor(30, 41, 59);
    doc.text(x.pause >= 1 ? _cpOjDurata(x.pause) : '-', colFine[3], ym, { align: 'right' });
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.15); doc.line(M, y + h, pageW - M, y + h);
    y += h;
  };

  if (!settimana) V.righe.forEach((x, i) => disegnaRiga(x, true, i % 2 === 1));
  else V.gruppi.forEach((gr, gi) => {
    if (gi) y += 3;   // stacco fra un operatore e l'altro
    spazio(7 + 7.5);
    const tot = gr.righe.reduce((s, x) => s + x.minuti, 0), pause = gr.righe.reduce((s, x) => s + x.pause, 0);
    const y0 = y, p0 = pagina;
    doc.setFillColor(203, 213, 225); doc.rect(M, y, pageW - 2 * M, 7, 'F');
    doc.setFillColor(15, 118, 110); doc.rect(M, y, 1.2, 7, 'F');
    doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(riga1(gr.nome, LW - 2), M + 2.5, y + 4.7);
    doc.setFont(undefined, 'normal'); doc.setFontSize(6.5); doc.setTextColor(51, 65, 85);
    doc.text(riga1(_cpTlUnici([].concat(...gr.righe.map(_cpTlCommesseRiga))).join(', ') + ' · ' + gr.righe.length + (gr.righe.length === 1 ? ' giorno' : ' giorni'), TW), TX, y + 4.7);
    doc.setFont(undefined, 'bold'); doc.setFontSize(8); doc.setTextColor(15, 23, 42);
    doc.text(_cpOjDurata(tot), colFine[2], y + 4.7, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.text(pause >= 1 ? _cpOjDurata(pause) : '-', colFine[3], y + 4.7, { align: 'right' });
    y += 7;
    gr.righe.forEach((x, i) => disegnaRiga(x, false, i % 2 === 1));
    // Bordo del riquadro dell'operatore (solo se non è andato a capo pagina)
    if (pagina === p0) { doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3); doc.rect(M, y0, pageW - 2 * M, y - y0, 'S'); }
  });

  // Legenda colori
  spazio(8);
  y += 4;
  doc.setFontSize(7); doc.setTextColor(100, 116, 139);
  if (_cpTl.colore === 'commessa') {
    let lx = M;
    _cpTlGruppiUsati(V).forEach(c => {
      const fuori = c.startsWith('⚠ ');
      const nome = T(c === '—' ? 'Commessa non riconosciuta' : fuori ? c.slice(2) + ' (non in dashboard)' : c), w = doc.getTextWidth(nome) + 7;
      if (lx + w > pageW - M) { lx = M; y += 4.5; spazio(5); }
      const rgb = _cpTlRgb(c === '—' ? CPTL_GRIGIO : V.coloreCommessa(c));
      doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.roundedRect(lx, y - 2.3, 3, 2.6, 0.4, 0.4, 'F');
      if (fuori) { doc.setDrawColor(185, 28, 28); doc.setLineWidth(0.35); doc.rect(lx, y - 2.3, 3, 2.6, 'S'); }
      doc.text(nome, lx + 4, y);
      lx += w;
    });
  } else {
    doc.text(T('Un colore per ticket all\'interno della riga. Segmenti tratteggiati arancio: sottotask IN PROGRESS non ancora registrato. Linea rossa: adesso. Righe gialle: da controllare.' +
      (V.nFuori ? ' Bordo rosso: commessa non in dashboard.' : '') + ' Clic su un segmento o su un ticket: apre Jira.'), M, y);
  }

  // Elenco dei worklog mostrati (la colonna Ticket è un link a Jira)
  const body = [], urls = [];
  const commessaTesto = (o, x) => o.commessa || (o.fuori ? o.fuori.etichetta + ' - NON IN DASHBOARD' : _cpTlCommesseRiga(x).join(', '));
  V.righe.forEach(x => {
    x.interventi.forEach(iv => {
      body.push([
        x.label, x.nome, commessaTesto(iv, x) + (x.squadre.length ? '\n' + x.squadre.join(', ') : ''),
        iv.t.key || '', iv.t.summary || '', _cpOjOra(iv.inizio), iv.inCorso ? 'in corso' : _cpOjOra(iv.fine),
        _cpOjDurata(iv.fine - iv.inizio), iv.commento || '',
      ]);
      urls.push(iv.t.url || '');
    });
    x.senzaOrari.forEach(s => {
      body.push([x.label, x.nome, commessaTesto(s, x), s.t.key || '', s.t.summary || '', '-', '-',
        s.t.hours != null ? _cpOjDurata(s.t.hours * 60) : '-', 'Orari non disponibili: risincronizzare']);
      urls.push(s.t.url || '');
    });
  });
  if (body.length) {
    doc.addPage();
    doc.setFont(undefined, 'bold'); doc.setFontSize(12); doc.setTextColor(30, 41, 59);
    doc.text(T('Elenco worklog — ' + vista), M, 14);
    doc.autoTable({
      startY: 18,
      head: [['Giorno', 'Operatore', 'Commessa / squadra', 'Ticket', 'Descrizione', 'Inizio', 'Fine', 'Durata', 'Commento']],
      body: body.map(r => r.map(T)),
      styles: { font: 'helvetica', fontSize: 7.2, cellPadding: { top: 1.3, bottom: 1.3, left: 1.8, right: 1.4 }, overflow: 'linebreak', valign: 'top', lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 19 }, 1: { cellWidth: 34, fontStyle: 'bold' }, 2: { cellWidth: 40 }, 3: { cellWidth: 20, textColor: [29, 78, 216] },
        4: { cellWidth: 55 }, 5: { cellWidth: 12, halign: 'right' }, 6: { cellWidth: 13, halign: 'right' }, 7: { cellWidth: 14, halign: 'right' }, 8: { cellWidth: 'auto' },
      },
      rowPageBreak: 'avoid',
      margin: { left: M, right: M, bottom: 13 },
      didParseCell: hk => {
        if (hk.section === 'body' && hk.column.index === 2 && /NON IN DASHBOARD/.test(String(hk.cell.raw))) hk.cell.styles.textColor = [185, 28, 28];
      },
      didDrawCell: hk => {
        if (hk.section !== 'body' || hk.column.index !== 3 || !urls[hk.row.index]) return;
        doc.link(hk.cell.x, hk.cell.y, hk.cell.width, hk.cell.height, { url: urls[hk.row.index] });
      },
    });
  }

  const pagine = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFont(undefined, 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
    doc.text(T('Timeline worklog · ' + vista + ' · Settimana ' + pwWeek + '/' + pwAnno), M, pageH - 6);
    doc.text('Pagina ' + p + ' / ' + pagine, pageW - M, pageH - 6, { align: 'right' });
  }
  doc.save('Timeline_worklog_W' + pwWeek + '_' + pwAnno + (settimana ? '' : '_' + CPA_GIORNI[_cpTl.giorno]) + '.pdf');
  sbLogActivity('Timeline worklog: export PDF', { anno: pwAnno, week: pwWeek, giorno: settimana ? 'settimana' : _cpTl.giorno, operatori: V.nOperatori });
}
