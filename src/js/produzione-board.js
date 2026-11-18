/* ==================== IMPORTA DALLA BOARD QFIELD (per squadra) ==================== */
/* «📡 Importa da board» sulla riga squadra di Controllo Produzione (since v18.272.0): legge
   direttamente il dati.json pubblico della board di produzione QField della commessa (oggi solo
   SINFI, vedi CP_BRD_FONTI) invece del CSV esportato a mano. Stesso risultato di «Carica Report»
   (Ore Report Prod. + Km/Cad per ticket, fonte 'report', reportUtenze per utenza QField), ma:
   - le righe si raggruppano per giorno + PROGETTO QField (es. Moena_ACQ, Moena_FGN), e ogni
     progetto va su una voce cantiere+attività della Griglia, proposta dal nome e confermata
     dall'utente (scelta ricordata in localStorage.cp_brd_mappa_v1, solo come proposta);
   - i Km di un progetto si dividono fra gli operatori della squadra che QUEL giorno hanno
     quella voce in Griglia (non fra tutta la squadra), sommando i tablet della squadra;
   - il sottotask è quello della Griglia (pwJiraSubtaskEntry), poi il ticket con worklog il cui
     summary è «Attività - Comune - …»; mai abbinamenti per Epic o nome libero;
   - le ore della cella vanno dalla prima all'ultima registrazione dell'operatore su tutti i
     suoi progetti del giorno (cpOreReportDaMeta), non dall'ultimo progetto caricato;
   - i Km che non trovano una voce/sottotask NON si scrivono: finiscono nel campo Note delle
     righe di quel giorno come «⟦Board: …⟧», tolto e ricalcolato a ogni reimportazione.
   Scrive solo controllo_produzione (Jira con «Sincronizza»). I giorni passati senza alcun dato
   della squadra diventano «✓ Nessuna» come con il CSV; oggi e i giorni futuri restano liberi.
   I km sono quelli del giorno di SINCRONIZZAZIONE del tablet (come nel CSV della board). */

const CP_BRD_FONTI = [
  { commessa: 'sinfi', nome: 'Board WO SINFI',
    url: 'https://mmarchetti95.github.io/produzione-wo-sinfi/dati.json',
    link: 'https://mmarchetti95.github.io/produzione-wo-sinfi/',
    repo: 'mmarchetti95/produzione-wo-sinfi', workflow: 'aggiorna.yml' },
];
const CP_BRD_MAPPA_LS = 'cp_brd_mappa_v1';
const CP_BRD_NOTA_RE = /\s*⟦Board:[^⟧]*⟧/g;
const CP_BRD_GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
let _cpBrd = null;   // stato del modal aperto
const _cpBrdAgg = {};  // repo → { testo, t0 } aggiornamento in corso, { ultimo } ora dei dati, { errore }

function cpBrdFonte(commessa) {
  const n = caNorm(commessa);
  return CP_BRD_FONTI.find(f => f.commessa === n) || null;
}

/* ----- «🔄 Aggiorna board» (since v18.273.0): avvia la GitHub Action della board come il suo
   pulsante «Aggiorna ora», dalla riga commessa di Controllo Produzione o dal modal di import.
   Il token (fine-grained, solo «Actions: read and write» sul repo della board) NON sta in questo
   repo: si legge a ogni avvio dal config.js pubblicato con la board, dove è già pubblico per
   il pulsante della board stessa. Se c'è già un'esecuzione in corso (automatica o di un collega)
   si aspetta quella. Finita l'Action si aspetta che dati.json pubblicato cambi «aggiornato»;
   con il modal aperto sulla stessa board i dati si rileggono da soli, scelte di abbinamento comprese. */
function cpBrdPausa(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cpBrdToken(fonte) {
  const r = await fetch(fonte.link + 'config.js?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('configurazione della board non leggibile (HTTP ' + r.status + ')');
  const m = (await r.text()).match(/token\s*:\s*"([^"]*)"/);
  if (!m || !m[1]) throw new Error('la board non ha il token per avviare l\'aggiornamento: avvisa il referente della board');
  return m[1];
}

async function cpBrdGh(fonte, token, path, opt) {
  const r = await fetch('https://api.github.com/repos/' + fonte.repo + '/actions' + path, Object.assign({}, opt || {}, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' },
  }));
  if (r.status === 401) throw new Error('il token della board non è valido o è scaduto: avvisa il referente della board');
  if (r.status === 403 || r.status === 404) throw new Error('il token della board non ha il permesso di avviare l\'aggiornamento');
  if (!r.ok) throw new Error('GitHub ha risposto ' + r.status);
  return r.status === 204 ? null : r.json();
}

async function cpBrdLeggiAggiornato(fonte) {
  const r = await fetch(fonte.url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('dati della board non leggibili (HTTP ' + r.status + ')');
  return (await r.json()).aggiornato || null;
}

function cpBrdOraDati(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function cpBrdAggEtichetta(fonte) {
  const s = _cpBrdAgg[fonte.repo] || {};
  if (s.testo) return cpAttesaHtml(s.testo, s.t0);
  return '🔄 Aggiorna board' + (s.ultimo ? ' <span style="font-weight:400;opacity:.85;">· dati ' + esc(cpBrdOraDati(s.ultimo)) + '</span>' : '');
}

// Tasto per la riga commessa e per il modal; data-commessa evita stringhe dinamiche nell'onclick.
function cpBrdAggBtnHtml(commessa, nelModal) {
  const fonte = cpBrdFonte(commessa);
  if (!fonte || !fonte.repo) return '';
  const inCorso = !!(_cpBrdAgg[fonte.repo] || {}).testo;
  const stile = nelModal
    ? 'font-size:12px;font-weight:600;border-radius:6px;padding:5px 10px;border:1px solid #99f6e4;background:#f0fdfa;color:#0f766e;'
    : 'margin-left:8px;font-size:11px;font-weight:600;border-radius:5px;padding:2px 8px;border:1px solid #99f6e4;background:#f0fdfa;color:#0f766e;';
  return '<button class="no-print cp-brd-agg-btn" data-commessa="' + esc(commessa) + '" data-help-key="cp-board-aggiorna" title="Click destro per la guida"'
    + (inCorso ? ' disabled' : '') + ' style="' + stile + 'cursor:' + (inCorso ? 'default' : 'pointer') + ';"'
    + ' onclick="event.stopPropagation();cpBrdAggiornaDa(this)">' + cpBrdAggEtichetta(fonte) + '</button>';
}

// Ridisegna i tasti già a schermo (riga commessa e modal) senza un render completo.
function cpBrdAggUi() {
  document.querySelectorAll('.cp-brd-agg-btn').forEach(b => {
    const c = b.getAttribute('data-commessa');
    const fonte = cpBrdFonte(c);
    if (!fonte) return;
    const inCorso = !!(_cpBrdAgg[fonte.repo] || {}).testo;
    b.innerHTML = cpBrdAggEtichetta(fonte);
    b.disabled = inCorso;
    b.style.cursor = inCorso ? 'default' : 'pointer';
  });
}

function cpBrdAggiornaDa(btn) {
  cpBrdAggiorna(btn.getAttribute('data-commessa'));
}

async function cpBrdAggiorna(commessa) {
  const fonte = cpBrdFonte(commessa);
  if (!fonte || !fonte.repo) return;
  const s = _cpBrdAgg[fonte.repo] || (_cpBrdAgg[fonte.repo] = {});
  if (s.testo) return;
  s.testo = 'Avvio…'; s.t0 = Date.now(); s.errore = null;
  const passo = t => { s.testo = t; cpBrdAggUi(); };
  cpBrdAggUi();
  if (_cpBrd && _cpBrd.fonte === fonte && _cpBrd.stato !== 'carica') cpBrdRender();   // fascia «in corso»
  let nuovi = false;
  try {
    const token = await cpBrdToken(fonte);
    const prima = await cpBrdLeggiAggiornato(fonte);
    const wf = '/workflows/' + fonte.workflow;
    const ultimoRun = async dopo => ((await cpBrdGh(fonte, token, wf + '/runs?per_page=1' + (dopo ? '&created=' + encodeURIComponent('>=' + dopo) : ''))).workflow_runs || [])[0];
    let run = await ultimoRun();
    if (!run || run.status === 'completed') {   // già in corso (automatico o di un collega): si aspetta quello
      const da = new Date(Date.now() - 60000).toISOString().slice(0, 19) + 'Z';
      await cpBrdGh(fonte, token, wf + '/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
      run = null;
      for (let i = 0; i < 12 && !run; i++) { await cpBrdPausa(5000); run = await ultimoRun(da); }
      if (!run) throw new Error('l\'aggiornamento non è partito, riprova tra poco');
    }
    const t0 = Date.now();
    while (run.status !== 'completed') {
      if (Date.now() - t0 > 25 * 60000) throw new Error('l\'aggiornamento sta impiegando troppo, riprova più tardi');
      passo(run.status === 'in_progress' ? 'Scarico i dati da QFieldCloud…' : 'In coda su GitHub…');
      await cpBrdPausa(10000);
      run = await cpBrdGh(fonte, token, '/runs/' + run.id);
    }
    if (run.conclusion !== 'success') throw new Error('l\'aggiornamento della board non è riuscito: avvisa il referente della board');
    passo('Pubblico la board…');
    let dopo = prima;
    for (let i = 0; i < 12 && dopo === prima; i++) { await cpBrdPausa(10000); dopo = await cpBrdLeggiAggiornato(fonte); }
    s.ultimo = dopo || s.ultimo;
    nuovi = dopo !== prima;
    if (!nuovi) s.errore = 'aggiornamento completato, ma i dati pubblicati non sono ancora cambiati: riprova tra un minuto';
  } catch (e) {
    console.error('cpBrdAggiorna:', e);
    s.errore = (e && e.message) || String(e);
  }
  s.testo = null;
  cpBrdAggUi();
  if (nuovi && _cpBrd && _cpBrd.fonte === fonte && _cpBrd.stato !== 'carica') cpBrdCarica();
  else if (_cpBrd && _cpBrd.fonte === fonte) cpBrdRender();
  if (s.errore && !(_cpBrd && _cpBrd.fonte === fonte)) showAlertModal('🔄 Aggiorna board: ' + s.errore);
}

function cpBrdBtnHtml(commessa, squadra) {
  if (!cpBrdFonte(commessa)) return '';
  return '<button class="no-print pw-write-action cp-brd-btn" style="margin-left:6px;font-size:11px;font-weight:600;background:#0d9488;color:#fff;border:none;border-radius:5px;padding:2px 8px;cursor:pointer;" data-help-key="cp-board-import" title="Click destro per la guida" onclick="event.stopPropagation();cpBrdApri(\'' + jsAttr(commessa) + '\',\'' + jsAttr(squadra) + '\')">📡 Importa da board</button>';
}

function cpBrdCompatta(s) { return caNorm(s).replace(/[^a-z0-9]/g, ''); }
function cpBrdR3(n) { return Math.round(Number(n) * 1000) / 1000; }
function cpBrdR2(n) { return Math.round(Number(n) * 100) / 100; }
function cpBrdKm(n) { return cpBrdR3(n).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function cpBrdOre(n) { return (n == null || n === '' || !isFinite(Number(n))) ? '—' : Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function cpBrdHm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }

// Rete e sottotipo di un testo (nome progetto QField spezzato o attività di Griglia).
function cpBrdRete(testo) {
  const t = ' ' + caNorm(testo).replace(/[^a-z0-9]+/g, ' ') + ' ';
  let rete = null;
  if (/ (acq|h2o|acquedott\w*|idric\w*) /.test(t)) rete = 'acquedotto';
  else if (/ (fgn|fogn\w*) /.test(t)) rete = 'fognatura';
  else if (/ (ip|illuminazion\w*) /.test(t)) rete = 'ip';
  const sm = t.match(/ (bianca|nera|mista) /);
  return { rete, sotto: sm ? sm[1] : null };
}

// "Sondrio_FGN_Bianca" → { comune: 'sondrio', rete: 'fognatura', sotto: 'bianca' }.
function cpBrdScomponi(progetto) {
  const parti = String(progetto || '').replace(/([a-z])([A-Z])/g, '$1_$2').split(/[_\s\-]+/).filter(Boolean);
  const comune = [];
  parti.forEach(p => {
    const r = cpBrdRete(p);
    if (r.rete || r.sotto || /^\d+$/.test(p)) return;
    comune.push(p);
  });
  const r = cpBrdRete(parti.join(' '));
  return { comune: cpBrdCompatta(comune.join('')), rete: r.rete, sotto: r.sotto };
}

/* Proposta di voce (cantiere+attività) per un progetto QField: comune uguale (o uno prefisso
   dell'altro, da 4 lettere) e rete compatibile. Solo con un candidato migliore unico; altrimenti
   '' = da abbinare a mano. È solo una proposta: l'utente la vede e la conferma. */
function cpBrdProponi(progetto, voci) {
  const p = cpBrdScomponi(progetto);
  if (!p.comune) return '';
  const cand = [];
  voci.forEach(v => {
    const cv = cpBrdCompatta(v.cantiere);
    const ok = cv === p.comune || (p.comune.length >= 4 && cv.length >= 4 && (cv.startsWith(p.comune) || p.comune.startsWith(cv)));
    if (!ok) return;
    const r = cpBrdRete(v.etichetta);
    let s = 0;
    if (p.rete && r.rete) { if (p.rete !== r.rete) return; s += 2; }
    if (r.sotto) {
      if (p.sotto && p.sotto !== r.sotto) return;
      s += p.sotto ? 1 : -1;
    } else if (p.sotto) s -= 1;
    cand.push({ v, s });
  });
  if (!cand.length) return '';
  const max = Math.max(...cand.map(c => c.s));
  const best = cand.filter(c => c.s === max);
  return best.length === 1 ? best[0].v.chiave : '';
}

function cpBrdMappaLs() {
  try { return JSON.parse(localStorage.getItem(CP_BRD_MAPPA_LS) || '{}') || {}; } catch (_) { return {}; }
}
function cpBrdMappaSalva(commessa, mappa) {
  try {
    const all = cpBrdMappaLs();
    all[commessa] = Object.assign({}, all[commessa] || {}, mappa);
    localStorage.setItem(CP_BRD_MAPPA_LS, JSON.stringify(all));
  } catch (_) { /* solo comodità */ }
}

/* Operatori della squadra pianificati per giorno (cantiere assegnato, non in ferie), con le voci
   cantiere+attività e il sottotask di ciascuna. Stessa inclusione di cpGetSquadraOpsByDay. */
function cpBrdOperatori(commessa, squadra) {
  const bc = pwGetWeekData().find(b => b && b.commessa === commessa);
  const perGiorno = {}, nomi = new Set(), voci = new Map();
  if (!bc) return { bc: null, perGiorno, nomi: [], voci: [] };
  const ctx = cpCtxTicketCommessa();
  (bc.squadre || []).forEach(sq => {
    if ((sq.nome || 'Squadra') !== squadra) return;
    (sq.operatori || []).forEach(op => {
      const nome = (op.nome || '').trim();
      if (!nome) return;
      for (let g = 0; g < 6; g++) {
        const opG = (op.giorni || {})[g] || {};
        const vv = pwCellVoci(opG);
        if (!vv.length || pwFerieTipoGiornata(op.nome, g)) continue;
        nomi.add(op.nome);
        const k = commessa + '|||' + squadra + '|||' + op.nome + '|||' + g;
        const tks = cpTicketsPropri(_cpData[k] && _cpData[k].jira_tickets, commessa, op.nome, g, ctx);
        const vociOp = [];
        vv.forEach(v => {
          const attRaw = pwJiraAttivitaSottotask(bc, v.cantiere, op.nome, v.attivita);
          const cat = attRaw ? caTrova(commessa, attRaw) : null;
          const etichetta = (cat && cat.nome) || attRaw || '';
          const chiave = caNorm(v.cantiere) + '|||' + caNorm(etichetta);
          if (vociOp.some(x => x.chiave === chiave)) return;
          let ticket = null;
          const e = pwJiraSubtaskEntry(bc, v.cantiere, op.nome, attRaw, g);
          if (e && e.key) ticket = e.key;
          else if (etichetta) {
            const pref = caNorm(etichetta) + ' - ' + caNorm(v.cantiere) + ' - ';
            const t = tks.find(t => t && t.key && caNorm(t.summary).startsWith(pref));
            if (t) ticket = t.key;
          }
          vociOp.push({ cantiere: v.cantiere, etichetta, chiave, ticket });
          if (!voci.has(chiave)) voci.set(chiave, { cantiere: v.cantiere, etichetta, chiave });
        });
        (perGiorno[g] || (perGiorno[g] = [])).push({
          nome: op.nome, voci: vociOp,
          cantiere: pwCellCantieri(opG).join(', '), attivita: opG.attivita || '',
        });
      }
    });
  });
  return { bc, perGiorno, nomi: [...nomi],
    voci: [...voci.values()].sort((a, b) => (a.cantiere + a.etichetta).localeCompare(b.cantiere + b.etichetta, 'it')) };
}

/* Calcolo puro sullo stato del modal: per ogni giorno e progetto, i Km (somma dei tablet della
   squadra, layer «Note» esclusi) divisi fra chi ha la voce abbinata in Griglia quel giorno.
   → { celle: { 'op|||g': { op, g, tickets: { key: { progetti, utenti: { u: { km, ini, fin } } } } } },
       anomalie: [{ g, progetto, km, testo, op? }], giorniVuoti: [g], giorniConDati: Set } */
function cpBrdCalcola(st) {
  const celle = {}, anomalie = [], giorniVuoti = [], giorniConDati = new Set();
  for (let g = 0; g < 6; g++) {
    const ops = st.perGiorno[g] || [];
    const rows = st.righe.filter(r => r.giorno === st.isoDates[g]);
    const perProg = {};
    rows.forEach(r => {
      const p = perProg[r.progetto] || (perProg[r.progetto] = { km: 0, utenti: {} });
      const km = /^note(_|$)/i.test(String(r.layer || '')) ? 0 : (Number(r.km_nuovi) || 0);
      const ini = cpHmToMin(r.inizio), fin = cpHmToMin(r.fine);
      const u = p.utenti[r.operatore] || (p.utenti[r.operatore] = { km: 0, ini: null, fin: null });
      u.km += km; p.km += km;
      if (ini != null && (u.ini == null || ini < u.ini)) u.ini = ini;
      if (fin != null && (u.fin == null || fin > u.fin)) u.fin = fin;
    });
    // Un progetto senza km nuovi e senza orari (es. solo una modifica) non è un dato del giorno.
    Object.keys(perProg).forEach(P => {
      const p = perProg[P];
      if (p.km <= 0 && !Object.values(p.utenti).some(u => u.ini != null && u.fin != null)) delete perProg[P];
    });
    if (!Object.keys(perProg).length) {
      if (ops.length && st.isoDates[g] < st.oggiISO) giorniVuoti.push(g);
      continue;
    }
    giorniConDati.add(g);
    Object.keys(perProg).sort().forEach(P => {
      const p = perProg[P];
      const target = st.mappa[P] || '';
      if (target === '-') return;
      if (!target) {
        if (p.km > 0) anomalie.push({ g, progetto: P, km: p.km, testo: 'progetto non abbinato a una voce della Griglia' });
        return;
      }
      const presenti = ops.filter(op => op.voci.some(v => v.chiave === target));
      const voce = st.voci.find(v => v.chiave === target);
      const nomeVoce = voce ? (voce.cantiere + ' · ' + (voce.etichetta || 'senza attività')) : target;
      if (!presenti.length) {
        if (p.km > 0) anomalie.push({ g, progetto: P, km: p.km, testo: 'nessuno della squadra ha «' + nomeVoce + '» in Griglia quel giorno' });
        return;
      }
      const N = presenti.length;
      presenti.forEach(op => {
        const v = op.voci.find(x => x.chiave === target);
        if (!v.ticket) {
          if (p.km > 0) anomalie.push({ g, progetto: P, km: p.km / N, op: op.nome, testo: 'manca il sottotask Jira di ' + op.nome + ' per «' + nomeVoce + '»' });
          return;
        }
        const ck = op.nome + '|||' + g;
        const c = celle[ck] || (celle[ck] = { op, g, tickets: {} });
        const t = c.tickets[v.ticket] || (c.tickets[v.ticket] = { progetti: [], utenti: {}, voce: nomeVoce });
        if (!t.progetti.includes(P)) t.progetti.push(P);
        Object.keys(p.utenti).forEach(u => {
          const s = p.utenti[u];
          const d = t.utenti[u] || (t.utenti[u] = { km: 0, ini: null, fin: null });
          d.km += s.km / N;
          if (s.ini != null && (d.ini == null || s.ini < d.ini)) d.ini = s.ini;
          if (s.fin != null && (d.fin == null || s.fin > d.fin)) d.fin = s.fin;
        });
      });
    });
  }
  return { celle, anomalie, giorniVuoti, giorniConDati };
}

/* Piano completo: celle di _cpData clonate e modificate come le scriverebbe «Applica».
   → { calc, righe: [{ k, op, g, prima, dopo, cambiata }] } */
function cpBrdPiano() {
  const st = _cpBrd;
  const calc = cpBrdCalcola(st);
  const righe = new Map();
  const get = (op, g) => {
    const k = st.commessa + '|||' + st.squadra + '|||' + op.nome + '|||' + g;
    if (!righe.has(k)) {
      const prima = _cpData[k] || {};
      righe.set(k, { k, op, g, prima, dopo: JSON.parse(JSON.stringify(prima)) });
    }
    return righe.get(k);
  };
  const utentiSquadra = new Set(st.utenti);
  // 1. Note della board precedente: si tolgono ovunque e si riscrivono sotto.
  Object.keys(st.perGiorno).forEach(g => st.perGiorno[g].forEach(op => get(op, Number(g))));
  // 2. Km e ore dei progetti abbinati.
  Object.values(calc.celle).forEach(c => {
    const cell = get(c.op, c.g).dopo;
    if (!cell.km_by_ticket || typeof cell.km_by_ticket !== 'object') cell.km_by_ticket = {};
    Object.keys(c.tickets).forEach(key => {
      const t = c.tickets[key];
      const ru = Object.assign({}, cpKmMeta(cell, key).reportUtenze || {});
      // La board vale per tutte le utenze della squadra: un'utenza della squadra che non ha più
      // dati su questo ticket esce; restano le altre (CSV di utenze esterne, «?»).
      Object.keys(ru).forEach(u => { if (utentiSquadra.has(u) && !t.utenti[u]) delete ru[u]; });
      Object.keys(t.utenti).forEach(u => {
        const d = t.utenti[u];
        const int = d.ini != null && d.fin != null && d.fin > d.ini;
        ru[u] = { km: cpBrdR3(d.km), ore: int ? cpBrdR2((d.fin - d.ini) / 60) : 0,
          inizio: int ? d.ini : null, fine: int ? d.fin : null };
      });
      cell.km_by_ticket[key] = cpBrdR3(Object.values(ru).reduce((s, v) => s + (Number(v.km) || 0), 0));
      cpKmMetaSet(cell, key, { fonte: 'report', reportUtenze: ru });
    });
    cell.km_cad = cpSumKm(cell.km_by_ticket);
    const ore = cpOreReportDaMeta(cell);
    if (ore != null) cell.ore_report = ore;
  });
  // 3. Giorni passati senza dati della squadra: «✓ Nessuna» sui ticket ancora vuoti.
  calc.giorniVuoti.forEach(g => (st.perGiorno[g] || []).forEach(op => {
    const cell = get(op, g).dopo;
    if (cell.ore_report == null) cell.ore_report = 0;
    op.voci.forEach(v => {
      if (!v.ticket) return;
      const vuoto = (!cell.km_by_ticket || cell.km_by_ticket[v.ticket] == null) &&
                    (!cell.km_last_by_ticket || cell.km_last_by_ticket[v.ticket] == null);
      if (!vuoto) return;
      if (!cell.km_by_ticket || typeof cell.km_by_ticket !== 'object') cell.km_by_ticket = {};
      cell.km_by_ticket[v.ticket] = 0;
      cpKmMetaSet(cell, v.ticket, { fonte: 'report', reportUtenze: null });
      cell.km_cad = cpSumKm(cell.km_by_ticket);
    });
  }));
  // 4. Note: Km non scritti, sulle righe di quel giorno (dell'operatore, se riguarda solo lui).
  const notePer = {};
  calc.anomalie.forEach(a => {
    const txt = '⟦Board: ' + a.progetto + ' ' + cpBrdKm(a.km) + ' km non scritti, ' + a.testo + '⟧';
    (st.perGiorno[a.g] || []).forEach(op => {
      if (a.op && a.op !== op.nome) return;
      const k = op.nome + '|||' + a.g;
      (notePer[k] || (notePer[k] = [])).push(txt);
    });
  });
  righe.forEach(r => {
    const base = String(r.prima.note || '').replace(CP_BRD_NOTA_RE, '').trim();
    const add = notePer[r.op.nome + '|||' + r.g] || [];
    const nota = [base].concat(add).filter(Boolean).join(' ');
    r.dopo.note = nota || (r.prima.note == null ? null : '');
    r.noteBoard = add;
  });
  const num = v => (v == null || v === '' ? null : Number(v));
  const firma = c => JSON.stringify([num(c.ore_report), c.km_by_ticket || {}, c.km_meta_by_ticket || {}, c.note || '']);
  const out = [...righe.values()];
  out.forEach(r => { r.cambiata = firma(r.prima) !== firma(r.dopo); });
  return { calc, righe: out };
}

HELP_TEXTS['cp-board-import'] = 'Importa la produzione di QUESTA squadra direttamente dalla board QField della commessa (oggi SINFI), senza scaricare il CSV: stessi valori di «📄 Carica Report» (Ore Report Prod. e Km/Cad dei sottotask), per i soli giorni della settimana mostrata.\n\nPrima di scrivere mostra un\'anteprima: ogni progetto QField del tablet della squadra (es. Moena_ACQ, Moena_FGN) va abbinato a una voce cantiere + attività della Griglia. L\'app lo propone dal nome e tu lo confermi o lo cambi (la scelta viene ricordata in questo browser). I Km di un progetto si dividono fra gli operatori della squadra che quel giorno hanno quella voce in Griglia e vanno sul loro sottotask; le ore vanno dalla prima all\'ultima registrazione della giornata, su tutti i progetti.\n\nI Km che non trovano posto (progetto non abbinato, voce assente in Griglia quel giorno, sottotask mancante) NON vengono scritti: finiscono nel campo Note delle righe di quel giorno come «⟦Board: …⟧», che viene tolto e ricalcolato a ogni nuova importazione. Correggi la Griglia o crea il sottotask e reimporta.\n\nI giorni già passati senza nessun dato della squadra vengono segnati «✓ Nessuna» produzione; oggi e i giorni futuri restano da compilare. Reimportare sostituisce i valori del tablet della squadra, non li somma. Scrive solo nel Controllo Produzione condiviso: su Jira i Km arrivano con «🔄 Sincronizza squadra».\n\nGli utenti QField della squadra si riconoscono dall\'email; se l\'utenza del tablet è diversa (es. hsemry con email hsmsemry@) l\'app la abbina da sola dal nome della persona e lo segnala in un riquadro blu. Se non ci riesce o trova più persone possibili, imposta «Utente QField» in Operatori → ✉ Email/operatore.';

HELP_TEXTS['cp-board-aggiorna'] = 'Fa scaricare subito alla board QField della commessa i dati nuovi da QFieldCloud, come il pulsante «Aggiorna ora» della board. Ci vogliono 2-3 minuti: il tasto mostra a che punto è e alla fine l\'ora dei dati pubblicati. Se un aggiornamento è già in corso (quello automatico o lanciato da un collega) aspetta quello invece di avviarne un altro.\n\nServe per i dati appena sincronizzati dai tablet: da sola la board si aggiorna ogni 30 minuti, dal lunedì al sabato, circa dalle 5 alle 21. Il lavoro che un tablet non ha ancora sincronizzato non arriva comunque.\n\nSe la finestra «📡 Importa da board» è aperta, a fine aggiornamento rilegge i dati da sola e tiene gli abbinamenti già scelti. Non scrive niente nel Controllo Produzione né su Jira.';

async function cpBrdApri(commessa, squadra) {
  if (!sbGuardWrite()) return;
  const fonte = cpBrdFonte(commessa);
  if (!fonte) return;
  const info = cpBrdOperatori(commessa, squadra);
  if (!info.bc || !Object.keys(info.perGiorno).length) {
    showAlertModal('La squadra "' + squadra + '" non ha operatori pianificati questa settimana.');
    return;
  }
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const isoDates = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    isoDates.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'));
  }
  const oggi = new Date();
  const oggiISO = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');
  _cpBrd = { commessa, squadra, fonte, anno: pwAnno, week: pwWeek, isoDates, oggiISO,
    perGiorno: info.perGiorno, nomi: info.nomi, utenti: [], senzaUtente: [], autoUtenti: [], ambigui: [], voci: info.voci,
    righe: [], progetti: [], mappa: {}, stato: 'carica', errore: null, dati: null };
  document.getElementById('cpbrd-modal').style.display = 'flex';
  await cpBrdCarica();
}

/* Legge dati.json e prepara progetti e abbinamenti del modal aperto. Alla rilettura (dopo
   «🔄 Aggiorna board») le scelte già fatte nel modal restano; i progetti nuovi prendono la
   scelta ricordata o la proposta. */
async function cpBrdCarica() {
  const st = _cpBrd;
  if (!st) return;
  st.stato = 'carica';
  cpBrdRender();
  try {
    const r = await fetch(st.fonte.url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const dati = await r.json();
    if (_cpBrd !== st) return;
    const isoDates = st.isoDates;
    // Utenti QField della squadra (since v18.275.0): email, «Utente QField» o abbinamento
    // automatico dal nome (hsemry ↔ hsmsemry@…), fra tutti gli utenti presenti nella board.
    const tutti = (Array.isArray(dati.righe) ? dati.righe : []).map(x => x && x.operatore).filter(Boolean);
    const abb = qfuAbbina(tutti, st.nomi);
    st.utenti = Object.keys(abb.perUtente).filter(u => abb.perUtente[u].nomi.some(n => st.nomi.includes(n))).sort();
    st.senzaUtente = st.nomi.filter(n => !qfuUtentiDi(abb, n).length);
    st.autoUtenti = qfuDescriviAuto(abb, st.nomi);
    st.ambigui = abb.ambigui;
    const utenti = new Set(st.utenti);
    st.dati = { aggiornato: dati.aggiornato || null, dal: dati.dal || null, al: dati.al || null, avvisi: dati.avvisi || [] };
    if (st.fonte.repo && dati.aggiornato) {
      (_cpBrdAgg[st.fonte.repo] || (_cpBrdAgg[st.fonte.repo] = {})).ultimo = dati.aggiornato;
      cpBrdAggUi();
    }
    st.righe = (Array.isArray(dati.righe) ? dati.righe : []).filter(x => x && isoDates.includes(x.giorno) &&
      utenti.has(String(x.operatore || '').toLowerCase()) && x.progetto)
      .map(x => Object.assign({}, x, { operatore: String(x.operatore).toLowerCase() }));
    // Progetti della settimana con almeno un dato vero (km nuovi o orari).
    const prog = {};
    st.righe.forEach(x => {
      const km = /^note(_|$)/i.test(String(x.layer || '')) ? 0 : (Number(x.km_nuovi) || 0);
      const p = prog[x.progetto] || (prog[x.progetto] = { nome: x.progetto, km: 0, perGiorno: {}, utile: false });
      p.km += km;
      const gi = isoDates.indexOf(x.giorno);
      p.perGiorno[gi] = (p.perGiorno[gi] || 0) + km;
      if (km > 0 || (x.inizio && x.fine)) p.utile = true;
    });
    st.progetti = Object.values(prog).filter(p => p.utile).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const ricordata = cpBrdMappaLs()[st.commessa] || {};
    const scelte = st.mappa;
    st.mappa = {};
    st.progetti.forEach(p => {
      const r0 = ricordata[p.nome];
      const valida = r0 === '-' || (r0 && st.voci.some(v => v.chiave === r0));
      p.proposta = cpBrdProponi(p.nome, st.voci);
      p.ricordata = valida ? r0 : null;
      st.mappa[p.nome] = Object.prototype.hasOwnProperty.call(scelte, p.nome) ? scelte[p.nome] : (valida ? r0 : p.proposta);
    });
    st.stato = 'pronto';
  } catch (e) {
    console.error('cpBrdCarica:', e);
    if (_cpBrd === st) { st.stato = 'errore'; st.errore = (e && e.message) || String(e); }
  }
  cpBrdRender();
}

function cpBrdChiudi() {
  _cpBrd = null;
  const m = document.getElementById('cpbrd-modal');
  if (m) m.style.display = 'none';
}

function cpBrdSetMappa(sel) {
  if (!_cpBrd) return;
  const p = _cpBrd.progetti[Number(sel.getAttribute('data-i'))];
  if (!p) return;
  _cpBrd.mappa[p.nome] = sel.value;
  cpBrdRender();
}

function cpBrdRender() {
  const root = document.getElementById('cpbrd-root');
  if (!root || !_cpBrd) return;
  const st = _cpBrd;
  const btn = 'font-size:12px;font-weight:600;border-radius:6px;padding:5px 12px;cursor:pointer;';
  let h = '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#fff;">'
    + '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:15px;">📡 Importa da board — ' + esc(st.squadra) + '</div>'
    + '<div style="font-size:12px;color:#64748b;">' + esc(st.commessa) + ' · Week ' + st.week + ' ' + st.anno + ' · <a href="' + esc(st.fonte.link) + '" target="_blank" rel="noopener" style="color:#0d9488;">' + esc(st.fonte.nome) + '</a>'
    + (st.dati && st.dati.aggiornato ? ' · dati aggiornati al ' + esc(new Date(st.dati.aggiornato).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : '')
    + '</div></div>'
    + cpBrdAggBtnHtml(st.commessa, true)
    + '<button onclick="cpBrdChiudi()" style="' + btn + 'border:1px solid #cbd5e1;background:#fff;">✕</button></div>';
  const agg = (st.fonte.repo && _cpBrdAgg[st.fonte.repo]) || {};
  if (agg.errore && !agg.testo) h += '<div style="padding:6px 16px;background:#fef2f2;border-bottom:1px solid #fecaca;color:#b91c1c;font-size:12px;">🔄 Aggiorna board: ' + esc(agg.errore) + '</div>';
  else if (agg.testo) h += '<div style="padding:6px 16px;background:#f0fdfa;border-bottom:1px solid #99f6e4;color:#0f766e;font-size:12px;">Aggiornamento della board in corso (2-3 minuti): quando finisce i dati qui sotto si rileggono da soli, le scelte di abbinamento restano.</div>';
  h += '<div style="flex:1;overflow:auto;padding:14px 16px;font-size:13px;">';
  if (st.stato === 'carica') {
    h += '<div style="color:#64748b;padding:30px;text-align:center;">⏳ Lettura dati della board…</div></div>';
    root.innerHTML = h;
    return;
  }
  if (st.stato === 'errore') {
    h += '<div style="color:#b91c1c;padding:20px;">Lettura della board non riuscita: ' + esc(st.errore) + '</div></div>';
    root.innerHTML = h;
    return;
  }
  const opz = st.voci.map(v => ({ value: v.chiave, label: v.cantiere + ' · ' + (v.etichetta || 'senza attività') }));
  const avvisi = [];
  st.ambigui.forEach(a => avvisi.push('Utente QField «' + a.utente + '» ambiguo (' + a.nomi.join(' / ') + '): i suoi dati non vengono usati. Imposta «Utente QField» sulla persona giusta (Operatori → ✉ Email/operatore).'));
  if (st.senzaUtente.length) avvisi.push('Nessun utente QField nella board per: ' + st.senzaUtente.join(', ') + '. Se usano un\'utenza molto diversa dall\'email, impostala in «Utente QField» (Operatori → ✉ Email/operatore).');
  if (st.dati && st.dati.dal && st.isoDates[5] < st.dati.dal) avvisi.push('La board conserva i dati dal ' + st.dati.dal + ': questa settimana è troppo vecchia.');
  (st.dati && st.dati.avvisi || []).forEach(a => avvisi.push('Board: ' + a));
  if (st.autoUtenti.length) h += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 10px;margin-bottom:12px;color:#1e40af;">Utenti QField abbinati automaticamente (nome diverso dall\'email): ' + st.autoUtenti.map(esc).join(' · ') + '</div>';
  if (avvisi.length) h += '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:12px;color:#92400e;">' + avvisi.map(esc).join('<br>') + '</div>';

  // Progetti QField
  h += '<div style="font-weight:700;margin-bottom:6px;">Progetti QField della squadra (' + esc(st.utenti.join(', ') || 'nessun utente riconosciuto') + ')</div>';
  if (!st.progetti.length) {
    h += '<div style="color:#64748b;margin-bottom:14px;">Nessun dato della squadra nella board per questa settimana.</div>';
  } else {
    h += '<table class="cp-table" style="width:100%;margin-bottom:14px;"><thead><tr><th>Progetto</th><th>Km nuovi per giorno</th><th style="text-align:right;">Totale</th><th>Abbinato a</th></tr></thead><tbody>';
    st.progetti.forEach((p, i) => {
      const gg = Object.keys(p.perGiorno).map(Number).sort((a, b) => a - b)
        .map(g => CP_BRD_GG[g] + ' ' + cpBrdKm(p.perGiorno[g])).join(' · ');
      const val = st.mappa[p.nome] || '';
      let sel = '<select data-i="' + i + '" onchange="cpBrdSetMappa(this)" style="font-size:12px;padding:2px 4px;border:1px solid ' + (val ? '#cbd5e1' : '#f59e0b') + ';border-radius:5px;max-width:320px;">'
        + '<option value=""' + (val === '' ? ' selected' : '') + '>— da abbinare (Km in Note) —</option>';
      opz.forEach(o => { sel += '<option value="' + esc(o.value) + '"' + (val === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>'; });
      sel += '<option value="-"' + (val === '-' ? ' selected' : '') + '>Ignora (non è di questa squadra)</option></select>';
      const tag = p.ricordata != null && val === p.ricordata ? ' <span style="font-size:10px;color:#64748b;">ricordata</span>'
        : (val && val === p.proposta ? ' <span style="font-size:10px;color:#0d9488;">proposta</span>' : '');
      h += '<tr><td style="font-weight:600;">' + esc(p.nome) + '</td><td style="font-size:12px;color:#475569;">' + esc(gg) + '</td>'
        + '<td style="text-align:right;">' + cpBrdKm(p.km) + '</td><td>' + sel + tag + '</td></tr>';
    });
    h += '</tbody></table>';
  }

  // Anteprima per giorno
  const piano = cpBrdPiano();
  st.piano = piano;
  const nCambi = piano.righe.filter(r => r.cambiata).length;
  h += '<div style="font-weight:700;margin-bottom:6px;">Anteprima</div>';
  for (let g = 0; g < 6; g++) {
    const ops = st.perGiorno[g] || [];
    const an = piano.calc.anomalie.filter(a => a.g === g);
    if (!ops.length && !an.length) continue;
    const data = st.isoDates[g];
    let stato;
    if (piano.calc.giorniVuoti.includes(g)) stato = '<span style="color:#64748b;">nessun dato → «✓ Nessuna» produzione sui sottotask ancora vuoti</span>';
    else if (piano.calc.giorniConDati.has(g)) stato = data === st.oggiISO ? '<span style="color:#b45309;">giornata in corso: dati parziali</span>' : '';
    else stato = '<span style="color:#64748b;">' + (data >= st.oggiISO ? 'nessun dato ancora: resta da compilare' : 'nessun dato') + '</span>';
    h += '<div style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:10px;background:#fff;">'
      + '<div style="padding:6px 10px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-weight:600;">' + CP_BRD_GG[g] + ' ' + data.slice(8, 10) + '/' + data.slice(5, 7) + (stato ? ' · ' + stato : '') + '</div>';
    if (!ops.length) h += '<div style="padding:6px 10px;color:#64748b;font-size:12px;">Nessun operatore della squadra pianificato quel giorno: i Km sotto restano solo qui.</div>';
    else {
      h += '<table class="cp-table" style="width:100%;"><thead><tr><th>Operatore</th><th>Voce</th><th>Ticket</th><th style="text-align:right;">Km/Cad attuale</th><th style="text-align:right;">Nuovo</th><th style="text-align:right;">Ore attuali</th><th style="text-align:right;">Nuove</th></tr></thead><tbody>';
      ops.forEach(op => {
        const r = piano.righe.find(x => x.op.nome === op.nome && x.g === g);
        const prima = r ? r.prima : {}, dopo = r ? r.dopo : {};
        const oreP = prima.ore_report, oreD = dopo.ore_report;
        const oreCambia = (oreP == null ? null : Number(oreP)) !== (oreD == null ? null : Number(oreD));
        const vv = op.voci.length ? op.voci : [{ etichetta: '', cantiere: op.cantiere, ticket: null }];
        vv.forEach((v, vi) => {
          const kP = v.ticket && prima.km_by_ticket ? prima.km_by_ticket[v.ticket] : null;
          const kD = v.ticket && dopo.km_by_ticket ? dopo.km_by_ticket[v.ticket] : null;
          const cambia = (kP == null ? null : Number(kP)) !== (kD == null ? null : Number(kD));
          const col = cambia ? 'color:#0f766e;font-weight:700;' : 'color:#94a3b8;';
          h += '<tr>' + (vi === 0 ? '<td rowspan="' + vv.length + '" style="font-weight:600;">' + esc(op.nome) + '</td>' : '')
            + '<td>' + esc(v.cantiere + ' · ' + (v.etichetta || '—')) + '</td>'
            + '<td>' + (v.ticket ? esc(v.ticket) : '<span style="color:#b91c1c;">manca</span>') + '</td>'
            + '<td style="text-align:right;">' + (kP == null ? '—' : cpBrdKm(kP)) + '</td>'
            + '<td style="text-align:right;' + col + '">' + (kD == null ? '—' : cpBrdKm(kD)) + '</td>'
            + (vi === 0 ? '<td rowspan="' + vv.length + '" style="text-align:right;">' + cpBrdOre(oreP) + '</td>'
              + '<td rowspan="' + vv.length + '" style="text-align:right;' + (oreCambia ? 'color:#0f766e;font-weight:700;' : 'color:#94a3b8;') + '">' + cpBrdOre(oreD) + '</td>' : '')
            + '</tr>';
        });
      });
      h += '</tbody></table>';
    }
    an.forEach(a => {
      h += '<div style="padding:6px 10px;color:#92400e;background:#fffbeb;border-top:1px solid #fde68a;font-size:12px;">⚠️ <b>' + esc(a.progetto) + '</b> ' + cpBrdKm(a.km) + ' km non scritti: ' + esc(a.testo) + (ops.length ? ' → in Note' : '') + '</div>';
    });
    h += '</div>';
  }
  h += '</div>';
  h += '<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid #e2e8f0;background:#fff;">'
    + '<div style="flex:1;font-size:12px;color:#64748b;">' + (nCambi ? nCambi + ' righe di Controllo Produzione cambiano. Su Jira non va niente finché non premi «🔄 Sincronizza squadra».' : 'Niente da cambiare: i valori sono già allineati alla board.') + '</div>'
    + '<button onclick="cpBrdChiudi()" style="' + btn + 'border:1px solid #cbd5e1;background:#fff;">Annulla</button>'
    + '<button class="pw-write-action" onclick="cpBrdApplica()" ' + (nCambi ? '' : 'disabled ') + 'style="' + btn + 'border:none;background:' + (nCambi ? '#0d9488' : '#94a3b8') + ';color:#fff;">Applica</button></div>';
  root.innerHTML = h;
}

async function cpBrdApplica() {
  if (!sbGuardWrite() || !_cpBrd) return;
  const st = _cpBrd;
  if (st.anno !== pwAnno || st.week !== pwWeek) {
    showAlertModal('La settimana mostrata è cambiata: chiudi e riapri l\'importazione.');
    return;
  }
  const piano = cpBrdPiano();
  const righe = piano.righe.filter(r => r.cambiata);
  if (!righe.length) return;
  const nAn = piano.calc.anomalie.length;
  const ok = await showConfirmAsync(
    'Squadra "' + st.squadra + '": verranno aggiornate ' + righe.length + ' righe di Controllo Produzione (Ore Report Prod., Km/Cad e Note).'
    + (nAn ? '\n\n' + nAn + ' dat' + (nAn === 1 ? 'o' : 'i') + ' della board non trovano posto: non vengono scritti come Km, restano nelle Note.' : '')
    + '\n\nSu Jira non va niente finché non premi «🔄 Sincronizza squadra». Procedere?', 'Applica');
  if (!ok || _cpBrd !== st) return;
  const records = righe.map(r => {
    _cpData[r.k] = r.dopo;
    return cpBuildRecordDa(r.dopo, st.anno, st.week, st.commessa, st.squadra, r.op.nome, r.g, st.isoDates[r.g], r.op.cantiere, r.op.attivita);
  });
  if (_sbClient && _sbUser && records.length) {
    try {
      const { error } = await _sbClient.from('controllo_produzione')
        .upsert(records, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
      if (error) throw error;
    } catch (e) {
      console.error('cpBrdApplica upsert error:', e);
      showAlertModal('Errore durante il salvataggio: ' + (e.message || e) + '\n\nRicarica Controllo Produzione prima di riprovare.');
      return;
    }
  }
  const m = {};
  st.progetti.forEach(p => { m[p.nome] = st.mappa[p.nome] || ''; });
  cpBrdMappaSalva(st.commessa, m);
  cpBrdChiudi();
  pwControlloRender();
  pwApplyProduzioneColors();
  const campo = cpCampoProduzione(st.commessa);
  const inSospeso = righe.reduce((n, r) => n + Object.keys(r.dopo.km_by_ticket || {}).filter(key =>
    ['da_aggiornare', 'da_inviare'].includes(cpKmJiraStato(_cpData[r.k], key, r.op.nome, campo).stato)).length, 0);
  let msg = '✅ Squadra "' + st.squadra + '": aggiornate ' + records.length + ' righe dalla board.';
  if (nAn) msg += '\n\n⚠ ' + nAn + ' dat' + (nAn === 1 ? 'o' : 'i') + ' non scritt' + (nAn === 1 ? 'o' : 'i') + ' come Km: vedi le Note delle righe (si aggiornano alla prossima importazione).';
  if (inSospeso) msg += '\n\n⬆ ' + inSospeso + ' valor' + (inSospeso === 1 ? 'e' : 'i') + ' Km/Cad non ancora su Jira: premi 🔄 Sincronizza squadra per inviarl' + (inSospeso === 1 ? 'o' : 'i') + '.';
  showAlertModal(msg);
}
