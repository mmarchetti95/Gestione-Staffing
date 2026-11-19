/* ==================== PRESTAZIONI OPERATORI (prf*) ==================== */
/* Tab «⚡ Prestazioni» di Pianificazione Settimanale (since v18.280.0): rendimento di ogni
   operatore per attività (o per tipo di WO), per scegliere i più adatti quando c'è urgenza.
   Visibile solo ad admin/responsabile (sbCanSeePage) e nascondibile da «🧩 Funzioni».
   Sola lettura: non scrive né Supabase né Jira, e non salva gli indici da nessuna parte
   (restano in memoria nella sessione).

   Dati. Le giornate vengono da controllo_produzione attribuite a comune e attività con lo
   stesso codice di Avanzamento comuni (_avCalcola: ticket → sottotask della Griglia), così
   le due viste non possono dare numeri diversi. Un'osservazione = una squadra, un giorno, un
   comune, un'attività: produzione (Km/Cad, somma dei membri) diviso le ore Jira dei membri
   sui loro ticket = resa per ora-uomo. Escluse (e contate): produzione non verificata
   (fonte «jira», di solito il segnaposto «1», se «Solo verificata» è attivo), produzione
   zero, un membro senza ore o con ore anomale. Oggi e il futuro non contano.
   Misura individuale: quando nella giornata ci sono ≥2 tablet QField con km propri e ognuno
   si abbina (qfuAbbina) a un membro diverso, la giornata diventa un'osservazione per
   membro. Nelle squadre WO c'è quasi sempre un tablet per coppia, quindi è rara: la fonte
   resta indicata accanto a ogni indice.
   Il calcolo vero è in prestazioni-core.js (puro).

   Griglia. prfIndiceGriglia() dà alla finestra di scelta operatore l'indice per l'attività
   prevalente della squadra (poi per il tipo di WO): chip «⚡ 125» e ordinamento «⚡ Rendimento
   in cima». Il calcolo per la Griglia usa sempre le opzioni di base (tutto il periodo, solo
   verificata, con effetto comune), non quelle scelte nella tab. */

const PRF_PAGE = 1000;
const PRF_MAX_PAGES = 40;
const PRF_PREF_KEY = 'prf_pref_v1';
const PRF_ORE_MIN = 0.5;           // ore minime di ciascun membro sulla giornata
const PRF_ORE_MAX = 13;            // oltre: ore anomale
const PRF_ORE_GIORNATA = 8;        // per mostrare la resa «a giornata»
const PRF_MIN_GIORNI_COLONNA = 15; // giornate di squadra minime perché un'attività abbia una colonna nella matrice
const PRF_MIN_GIORNI_CHIP = 3;     // giornate minime per il chip in Griglia
const PRF_VITA_CACHE_MS = 6 * 3600 * 1000;
const PRF_FONTI_VERIFICATE = ['report', 'manuale'];

// Colonne ordinabili della classifica (primo clic: dir; secondo clic: verso opposto).
const PRF_ORD_CL = [
  { k: 'nome', dir: 1 },
  { k: 'indice', dir: -1 },
  { k: 'stima', dir: -1 },
  { k: 'reale', dir: -1 },
  { k: 'giorni', dir: -1 },
  { k: 'aff', dir: -1 },
];
const PRF_AFF_ORD = { alta: 3, media: 2, bassa: 1 };

const _prf = {
  modo: 'att',                     // 'att' = attività della commessa · 'wo' = tipo di WO
  commessa: '',                    // '' = tutte
  per: { tipo: 'tutto', dal: '', al: '' },
  soloVer: true,
  comune: true,
  minGiorni: 5,
  ordM: { col: '', dir: 1 },        // matrice: '' = per nome, altrimenti la chiave del pool; dir -1 = dal più alto
  ordC: { col: 'indice', dir: -1 }, // classifica: indice | stima | reale | giorni | aff | nome
  q: '',
  focus: '',                       // pool aperto in classifica ('' = matrice)
  aperto: '',                      // operatore espanso nella classifica
  righe: null,                     // { rows, ts, troncato } (cache di sessione, condivisa con la Griglia)
  caricando: null,                 // promise del caricamento in corso
  ris: null,                       // risultato con le opzioni della tab
  griglia: null,                   // { ts, pools } con le opzioni di base, per la finestra operatore
  errore: '',
  uiPronta: false,
};

(function _prfPrefLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(PRF_PREF_KEY) || '{}');
    if (p.modo === 'att' || p.modo === 'wo') _prf.modo = p.modo;
    if (typeof p.commessa === 'string') _prf.commessa = p.commessa;
    if (p.per && p.per.tipo) Object.assign(_prf.per, p.per);
    if (typeof p.soloVer === 'boolean') _prf.soloVer = p.soloVer;
    if (typeof p.comune === 'boolean') _prf.comune = p.comune;
    if ([3, 5, 10, 15].includes(p.minGiorni)) _prf.minGiorni = p.minGiorni;
    if (p.ordM && typeof p.ordM.col === 'string') _prf.ordM = { col: p.ordM.col, dir: p.ordM.dir === -1 ? -1 : 1 };
    if (p.ordC && PRF_ORD_CL.some(c => c.k === p.ordC.col)) _prf.ordC = { col: p.ordC.col, dir: p.ordC.dir === 1 ? 1 : -1 };
  } catch (_) { /* preferenze illeggibili: default */ }
})();

function _prfPrefSave() {
  try {
    localStorage.setItem(PRF_PREF_KEY, JSON.stringify({ modo: _prf.modo, commessa: _prf.commessa, per: _prf.per, soloVer: _prf.soloVer, comune: _prf.comune, minGiorni: _prf.minGiorni, ordM: _prf.ordM, ordC: _prf.ordC }));
  } catch (_) {}
}

function prfPuo() {
  return typeof sbCanSeePage === 'function' && sbCanSeePage('weekly:prestazioni');
}

/* ----- Periodo ----- */

function _prfIeri() { return _avSpostaIso(_avOggi(), -1); }

function _prfRange(per) {
  const p = per || _prf.per, ieri = _prfIeri();
  let dal = null, al = ieri;
  if (p.tipo === '30' || p.tipo === '90' || p.tipo === '180') dal = _avSpostaIso(_avOggi(), -Number(p.tipo));
  else if (p.tipo === 'date') { dal = p.dal || null; if (p.al && p.al < ieri) al = p.al; }
  return { dal, al };
}

function _prfPerLabel() {
  const p = _prf.per;
  if (p.tipo === '30' || p.tipo === '90' || p.tipo === '180') return 'Ultimi ' + p.tipo + ' giorni';
  if (p.tipo === 'date' && (p.dal || p.al)) return (p.dal ? 'dal ' + _avDataBreve(p.dal) : '') + (p.dal && p.al ? ' ' : '') + (p.al ? 'al ' + _avDataBreve(p.al) : '');
  return 'Tutto';
}

/* ----- Dati ----- */

async function _prfCaricaRighe(forza) {
  if (!forza && _prf.righe) return _prf.righe;
  if (_prf.caricando) return _prf.caricando;
  _prf.caricando = (async () => {
    if (!_sbClient || !_sbUser) return { rows: [], ts: Date.now(), troncato: false };
    const rows = [];
    let troncato = false;
    for (let p = 0; p < PRF_MAX_PAGES; p++) {
      const { data, error } = await _sbClient
        .from('controllo_produzione')
        .select('commessa,' + AV_COLONNE)
        .order('commessa').order('anno').order('week').order('giorno').order('squadra').order('operatore').order('id')
        .range(p * PRF_PAGE, p * PRF_PAGE + PRF_PAGE - 1);
      if (error) throw error;
      const blocco = data || [];
      blocco.forEach(r => rows.push(r));
      if (blocco.length < PRF_PAGE) break;
      if (p === PRF_MAX_PAGES - 1) troncato = true;
    }
    _prf.righe = { rows, ts: Date.now(), troncato };
    _prf.griglia = null;
    return _prf.righe;
  })();
  try { return await _prf.caricando; }
  finally { _prf.caricando = null; }
}

/* Giornate di squadra (osservazioni per prfStima) da tutte le righe di controllo_produzione.
   opz: { modo, commessa, range, soloVer } → { oss, esclusi, etichette } */
function prfOsservazioni(rows, opz) {
  const perCommessa = {};
  (rows || []).forEach(r => { if (r && r.commessa) (perCommessa[r.commessa] = perCommessa[r.commessa] || []).push(r); });
  // reportUtenze per giorno+operatore+ticket (per la misura individuale)
  const ru = {};
  (rows || []).forEach(r => {
    const meta = r.km_meta_by_ticket && typeof r.km_meta_by_ticket === 'object' ? r.km_meta_by_ticket : {};
    Object.keys(meta).forEach(k => {
      const u = meta[k] && meta[k].reportUtenze;
      if (u && typeof u === 'object') ru[(r.data_giorno || '') + '|' + r.operatore + '|' + k] = u;
    });
  });

  const oss = [];
  const esclusi = { membroSenzaDati: 0, nonVerificata: 0, produzioneZero: 0, oreMancanti: 0, oreAnomale: 0 };
  const etichette = {};              // pool -> { label, unita, commessa, attivita }
  const attEtichette = {};           // att -> { commessa, nome, unita }
  const r = opz.range || {};

  Object.keys(perCommessa).sort().forEach(commessa => {
    if (opz.commessa && commessa !== opz.commessa) return;
    let mod;
    try { mod = _avCalcola(commessa, perCommessa[commessa]); } catch (e) { console.error('prestazioni: attribuzione ' + commessa, e); return; }
    Object.values(mod.comuni).forEach(c => {
      Object.values(c.att || {}).forEach(a => {
        if (a.servizio || a.nome === AV_SENZA_ATT) return;
        const att = commessa + '|' + a.key;
        let pool, label;
        if (opz.modo === 'wo') {
          const tipo = woTipoDiAttivita(commessa, a.nome);
          if (!tipo) return;
          pool = 'w|' + tipo; label = tipo;
          if (!etichette[pool]) etichette[pool] = { label, unita: '', commessa: '', attivita: '' };
        } else {
          pool = 'a|' + att; label = a.nome;
          if (!etichette[pool]) etichette[pool] = { label, unita: a.unita, commessa, attivita: a.nome };
        }
        attEtichette[att] = { commessa, nome: a.nome, unita: a.unita };

        const gruppi = {};
        a.voci.forEach(v => {
          if (r.dal && v.dataISO < r.dal) return;
          if (r.al && v.dataISO > r.al) return;
          const k = v.dataISO + '|' + v.squadra;
          const g = gruppi[k] || (gruppi[k] = { dataISO: v.dataISO, anno: v.anno, week: v.week, squadra: v.squadra, membri: {} });
          const m = g.membri[v.operatore] || (g.membri[v.operatore] = { km: 0, ore: 0, tickets: [], nonVer: false });
          m.km += v.km; m.ore += v.ore;
          if (v.ticket) m.tickets.push(v.ticket);
          if (v.km && PRF_FONTI_VERIFICATE.indexOf(v.fonte) === -1) m.nonVer = true;
        });

        // Giornate valide della stessa composizione nella stessa settimana: un'osservazione
        // sola, pesata col numero di giornate (i km della board arrivano nel giorno in cui il
        // tablet sincronizza: il giorno da solo è troppo rumoroso, vedi prestazioni-core.js).
        // Chi era in squadra quel giorno secondo la Griglia: se un membro pianificato non ha
        // dati (ha dimenticato Jira), la giornata non è «da solo» per l'altro: si scarta.
        const pianificati = {};
        a.pian.forEach(p => { const k = p.dataISO + '|' + p.squadra; (pianificati[k] = pianificati[k] || new Set()).add(p.operatore); });
        const settimane = {};
        Object.values(gruppi).sort((x, y) => x.dataISO.localeCompare(y.dataISO)).forEach(g => {
          const nomi = Object.keys(g.membri).sort();
          const ms = nomi.map(n => g.membri[n]);
          const P = ms.reduce((s, m) => s + m.km, 0);
          const H = ms.reduce((s, m) => s + m.ore, 0);
          const pian = pianificati[g.dataISO + '|' + g.squadra];
          if (pian && [...pian].some(n => !g.membri[n])) { esclusi.membroSenzaDati++; return; }
          if (opz.soloVer && ms.some(m => m.nonVer)) { esclusi.nonVerificata++; return; }
          if (!(P > 0)) { esclusi.produzioneZero++; return; }
          if (ms.some(m => m.ore < PRF_ORE_MIN)) { esclusi.oreMancanti++; return; }
          if (ms.some(m => m.ore > PRF_ORE_MAX)) { esclusi.oreAnomale++; return; }
          const base = { anno: g.anno, week: g.week, squadra: g.squadra, comune: c.nome, commessa, attivita: a.nome, unita: a.unita };

          const ind = nomi.length > 1 ? _prfQuote(g, nomi, ru) : null;
          if (ind) {
            nomi.forEach(n => {
              const kmN = P * ind[n];
              oss.push({ pool, att, comune: commessa + '|' + c.key, membri: [n], resa: kmN / g.membri[n].ore, peso: 1, individuale: true,
                rif: Object.assign({}, base, { dataISO: g.dataISO, giorni: [g.dataISO], km: kmN, ore: g.membri[n].ore, membri: nomi, kmSquadra: P, oreSquadra: H }) });
            });
            return;
          }
          const ks = g.anno + '|' + g.week + '|' + nomi.join('\u0001');
          const s = settimane[ks] || (settimane[ks] = Object.assign({}, base, { dataISO: g.dataISO, giorni: [], km: 0, ore: 0, membri: nomi }));
          s.giorni.push(g.dataISO); s.km += P; s.ore += H;
        });
        Object.values(settimane).forEach(s => {
          oss.push({ pool, att, comune: commessa + '|' + c.key, membri: s.membri, resa: s.km / s.ore, peso: s.giorni.length, individuale: s.membri.length === 1, rif: s });
        });
      });
    });
  });
  return { oss, esclusi, etichette, attEtichette };
}

/* Quota di produzione di ciascun membro dai tablet QField, solo se ogni tablet con km si
   abbina a un solo membro e ogni membro ha il suo: altrimenti null (giornata di squadra). */
function _prfQuote(g, nomi, ru) {
  const utenti = {};
  nomi.forEach(n => g.membri[n].tickets.forEach(k => {
    const u = ru[g.dataISO + '|' + n + '|' + k];
    if (!u) return;
    Object.keys(u).forEach(x => {
      const km = Number(u[x] && u[x].km) || 0;
      if (km > (utenti[x] || 0)) utenti[x] = km;
    });
  }));
  const conKm = Object.keys(utenti).filter(u => utenti[u] > 0);
  if (conKm.length < 2) return null;
  let abb;
  try { abb = qfuAbbina(conKm, nomi); } catch (_) { return null; }
  const kmDi = {};
  for (const u of conKm) {
    const pu = abb.perUtente[u];
    const chi = pu ? pu.nomi.filter(n => nomi.includes(n)) : [];
    if (chi.length !== 1) return null;
    kmDi[chi[0]] = (kmDi[chi[0]] || 0) + utenti[u];
  }
  if (nomi.some(n => !(kmDi[n] > 0))) return null;
  const tot = nomi.reduce((s, n) => s + kmDi[n], 0);
  const quote = {};
  nomi.forEach(n => { quote[n] = kmDi[n] / tot; });
  return quote;
}

function _prfCalcola(rows, opz) {
  const prep = prfOsservazioni(rows, opz);
  const stima = prfStima(prep.oss, { lambdaComune: opz.comune ? PRF_OPZ_DEFAULT.lambdaComune : 0 });
  return Object.assign({ opz }, prep, stima);
}

/* ----- Griglia: indice per la finestra di scelta operatore ----- */

/* Calcolo con le opzioni di base (entrambi i raggruppamenti), una volta per sessione o
   dopo PRF_VITA_CACHE_MS. Non blocca: chi lo chiama ridisegna quando la promise si risolve. */
async function prfPreparaGriglia() {
  if (!prfPuo()) return null;
  if (_prf.griglia && Date.now() - _prf.griglia.ts < PRF_VITA_CACHE_MS) return _prf.griglia;
  if (_prf.righe && Date.now() - _prf.righe.ts > PRF_VITA_CACHE_MS) _prf.righe = null;
  const dati = await _prfCaricaRighe(false);
  const base = { commessa: '', range: _prfRange({ tipo: 'tutto' }), soloVer: true, comune: true };
  const a = _prfCalcola(dati.rows, Object.assign({ modo: 'att' }, base));
  const w = _prfCalcola(dati.rows, Object.assign({ modo: 'wo' }, base));
  _prf.griglia = { ts: Date.now(), pools: Object.assign({}, a.pools, w.pools), etichette: Object.assign({}, a.etichette, w.etichette), attEtichette: Object.assign({}, a.attEtichette, w.attEtichette) };
  return _prf.griglia;
}

function prfGrigliaPronta() { return !!_prf.griglia; }

/* Chiavi dei pool in cui cercare l'indice per una voce: prima l'attività della commessa
   (nome di catalogo), poi il tipo di WO. Usate da Griglia e Auto-pianifica. */
function prfChiaviPool(commessa, attivita, tipoWo) {
  const out = [];
  if (commessa && attivita) {
    const v = caTrova(commessa, attivita);
    const k = caNorm(v ? v.nome : attivita);
    if (k) out.push('a|' + commessa + '|' + k);
  }
  if (tipoWo) out.push('w|' + tipoWo);
  return out;
}

/* Indici di un operatore per Auto-pianifica: { chiave: indice } dei pool in cui ha almeno
   PRF_MIN_GIORNI_CHIP giornate (sotto, l'indice è quasi tutto «prior» a 100). Vuoto se i
   dati non sono pronti (prfPreparaGriglia) o la vista non è visibile all'utente. */
function prfIndiciOperatore(nome) {
  const g = _prf.griglia;
  const out = {};
  if (!g || !nome || !prfPuo()) return out;
  Object.keys(g.pools).forEach(k => {
    const o = g.pools[k].operatori[nome];
    if (o && o.giorni >= PRF_MIN_GIORNI_CHIP) out[k] = Math.round(o.indice * 10) / 10;
  });
  return out;
}

/* Indice di un operatore per la squadra aperta in Griglia: prima l'attività più frequente
   della squadra sulla commessa (nome di catalogo), poi il tipo di WO. null = niente dati. */
function prfIndiceGriglia(nome, commessa, attivitaElenco, tipoWo) {
  const g = _prf.griglia;
  if (!g || !nome) return null;
  const conta = {};
  (attivitaElenco || []).forEach(t => {
    const v = commessa ? caTrova(commessa, t) : null;
    const k = caNorm(v ? v.nome : t);
    if (k) conta[k] = (conta[k] || 0) + 1;
  });
  const chiavi = Object.keys(conta).sort((x, y) => conta[y] - conta[x] || x.localeCompare(y)).map(k => 'a|' + commessa + '|' + k);
  if (tipoWo) chiavi.push('w|' + tipoWo);
  for (const k of chiavi) {
    const p = g.pools[k];
    const o = p && p.operatori[nome];
    if (o && o.giorni >= PRF_MIN_GIORNI_CHIP) return { pool: k, label: (g.etichette[k] || {}).label || '', op: o, prod: _prfProdGg(p, o, g.attEtichette) };
  }
  return null;
}

function prfChipHtml(x) {
  if (!x) return '';
  const o = x.op, i = Math.round(o.indice);
  const col = o.inseparabile ? 'bg-slate-50 text-slate-500 border-slate-200'
    : i >= 110 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : i <= 90 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200';
  const tit = 'Rendimento su ' + x.label + ': ' + i + ' (100 = nella norma)' +
    (x.prod ? ' · ≈ ' + _prfNum(x.prod.stima, 2) + ' ' + _prfUnitaGg(x.prod.unita) + ' a testa (norma ' + _prfNum(x.prod.mediana, 2) + ')' : '') +
    ' · ' + o.giorni + ' giornate · affidabilità ' + o.affidabilita +
    (o.inseparabile ? ' · lavora quasi sempre con ' + o.compagnoTop + ': non separabile' : '');
  return '<span class="prf-griglia text-[9px] ' + col + ' border px-1 rounded" title="' + esc(tit) + '">⚡ ' + i + (o.affidabilita === 'bassa' ? '?' : '') + '</span>';
}

/* ----- Render della tab ----- */

function _prfInitUi() {
  if (_prf.uiPronta) return;
  const view = document.getElementById('pw-view-prestazioni');
  if (!view) return;
  _prf.uiPronta = true;
  const q = document.getElementById('prf-q');
  if (q) q.oninput = () => { _prf.q = q.value; _prfRenderCorpo(); };
  const azioni = {
    'prf-modo-btn': _prfScegliModo,
    'prf-commessa-btn': _prfScegliCommessa,
    'prf-periodo-btn': _prfScegliPeriodo,
    'prf-min-btn': _prfScegliMin,
    'prf-ver-btn': () => { _prf.soloVer = !_prf.soloVer; _prfPrefSave(); _prfRicalcola(); },
    'prf-comune-btn': () => { _prf.comune = !_prf.comune; _prfPrefSave(); _prfRicalcola(); },
    'prf-refresh': () => prfRender(true),
    'prf-export': prfEsporta,
  };
  Object.keys(azioni).forEach(id => { const el = document.getElementById(id); if (el) el.onclick = () => azioni[id](); });
  view.addEventListener('click', ev => {
    const el = ev.target.closest('[data-prf-pool],[data-prf-cella],[data-prf-op],[data-prf-back],[data-prf-cp],[data-prf-guida],[data-prf-ordm],[data-prf-ordc]');
    if (!el || !view.contains(el)) return;
    if (el.hasAttribute('data-prf-ordm')) {
      const col = el.getAttribute('data-prf-ordm');
      // Attività: primo clic dal più performante; nome: dalla A. Secondo clic: verso opposto.
      _prf.ordM = _prf.ordM.col === col ? { col, dir: -_prf.ordM.dir } : { col, dir: col ? -1 : 1 };
      _prfPrefSave(); _prfRenderCorpo();
    } else if (el.hasAttribute('data-prf-ordc')) {
      const col = el.getAttribute('data-prf-ordc');
      const def = PRF_ORD_CL.find(c => c.k === col);
      _prf.ordC = _prf.ordC.col === col ? { col, dir: -_prf.ordC.dir } : { col, dir: def ? def.dir : -1 };
      _prfPrefSave(); _prfRenderCorpo();
    } else if (el.hasAttribute('data-prf-guida')) {
      const g = document.getElementById('prf-guida');
      if (g) { g.open = true; g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else if (el.hasAttribute('data-prf-cp')) {
      const p = el.getAttribute('data-prf-cp').split('|');
      pwAnno = Number(p[0]); pwWeek = Number(p[1]);
      pwSwitchTab('controllo');
    } else if (el.hasAttribute('data-prf-back')) {
      _prf.focus = ''; _prf.aperto = ''; _prfRenderCorpo(); window.scrollTo(0, 0);
    } else if (el.hasAttribute('data-prf-cella')) {
      const p = el.getAttribute('data-prf-cella').split('\u0001');
      _prf.focus = p[0]; _prf.aperto = p[1]; _prfRenderCorpo(); window.scrollTo(0, 0);
    } else if (el.hasAttribute('data-prf-pool')) {
      _prf.focus = el.getAttribute('data-prf-pool'); _prf.aperto = ''; _prfRenderCorpo(); window.scrollTo(0, 0);
    } else if (el.hasAttribute('data-prf-op')) {
      const n = el.getAttribute('data-prf-op');
      _prf.aperto = _prf.aperto === n ? '' : n;
      _prfRenderCorpo();
    }
  });
}

async function prfRender(forza) {
  _prfInitUi();
  const corpo = document.getElementById('prf-corpo');
  if (!prfPuo()) { if (corpo) corpo.innerHTML = '<div class="av-vuoto">Vista riservata ad admin e responsabili.</div>'; return; }
  _prfRenderBarra();
  if (forza || !_prf.righe) {
    _prfStatus('⏳ Leggo la produzione di tutte le commesse…');
    if (corpo && !_prf.ris) corpo.innerHTML = '<div class="av-vuoto">Caricamento…</div>';
  }
  try {
    await _prfCaricaRighe(!!forza);
    _prf.errore = '';
  } catch (e) {
    _prf.errore = 'Produzione non caricata: ' + (e.message || String(e));
  }
  if (_pwActiveTab !== 'prestazioni') return;
  _prfRicalcola();
}

function _prfRicalcola() {
  if (_prf.errore || !_prf.righe) { _prfStatus(''); _prfRenderBarra(); _prfRenderCorpo(); return; }
  const commesse = _prfCommesse();
  if (_prf.commessa && !commesse.includes(_prf.commessa)) _prf.commessa = '';
  const opz = { modo: _prf.modo, commessa: _prf.commessa, range: _prfRange(), soloVer: _prf.soloVer, comune: _prf.comune };
  _prf.ris = _prfCalcola(_prf.righe.rows, opz);
  if (_prf.focus && !_prf.ris.pools[_prf.focus]) { _prf.focus = ''; _prf.aperto = ''; }
  _prfStatus('');
  _prfRenderBarra();
  _prfRenderCorpo();
}

function _prfCommesse() {
  const s = new Set();
  ((_prf.righe && _prf.righe.rows) || []).forEach(r => { if (r.commessa) s.add(r.commessa); });
  return [...s].sort((a, b) => a.localeCompare(b));
}

function _prfStatus(txt) {
  const el = document.getElementById('prf-status');
  if (!el) return;
  if (txt) { el.textContent = txt; return; }
  el.textContent = _prf.righe && _prf.righe.ts ? 'Dati letti alle ' + new Date(_prf.righe.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
}

function _prfRenderBarra() {
  _avChip('prf-modo-btn', 'Per', _prf.modo === 'wo' ? 'Tipo di WO' : 'Attività', false);
  _avChip('prf-commessa-btn', 'Commessa', _prf.commessa || 'Tutte', !!_prf.commessa);
  _avChip('prf-periodo-btn', 'Periodo', _prfPerLabel(), _prf.per.tipo !== 'tutto');
  _avChip('prf-min-btn', 'Min. giornate', String(_prf.minGiorni), _prf.minGiorni !== 5);
  const t = (id, on, testo) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (on ? '☑ ' : '☐ ') + esc(testo);
    el.classList.toggle('on', on);
  };
  t('prf-ver-btn', _prf.soloVer, 'Solo produzione verificata');
  t('prf-comune-btn', _prf.comune, 'Tiene conto del comune');
}

function _prfColore(i, debole) {
  if (debole) return '';
  const d = Math.log(i / 100);
  const a = Math.min(1, Math.abs(d) / Math.log(1.4));
  if (Math.abs(d) < Math.log(1.04)) return '';
  return d > 0 ? 'background:rgba(16,185,129,' + (0.12 + 0.5 * a).toFixed(2) + ')' : 'background:rgba(244,63,94,' + (0.1 + 0.42 * a).toFixed(2) + ')';
}

function _prfNum(n, dec) { return _avNum(n, dec); }

function _prfPoolLabel(key) {
  const e = (_prf.ris && _prf.ris.etichette[key]) || {};
  return e.label || key;
}

function _prfPoolSub(key) {
  const e = (_prf.ris && _prf.ris.etichette[key]) || {};
  return !_prf.commessa && e.commessa ? e.commessa : '';
}

function _prfColonne() {
  const r = _prf.ris;
  return Object.keys(r.pools).filter(k => r.pools[k].nGiorni >= PRF_MIN_GIORNI_COLONNA)
    .sort((x, y) => r.pools[y].nGiorni - r.pools[x].nGiorni || x.localeCompare(y));
}

function _prfRenderCorpo() {
  const box = document.getElementById('prf-corpo');
  if (!box) return;
  const q = document.getElementById('prf-q');
  if (q && q.value !== _prf.q) q.value = _prf.q;
  if (_prf.errore) { box.innerHTML = '<div class="av-vuoto av-err">' + esc(_prf.errore) + '</div>'; return; }
  if (!_prf.ris) { box.innerHTML = '<div class="av-vuoto">Caricamento…</div>'; return; }
  box.innerHTML = _prf.focus ? _prfHtmlClassifica(_prf.focus) : _prfHtmlMatrice();
}

function _prfEsclusiHtml() {
  const e = _prf.ris.esclusi;
  const pezzi = [];
  if (e.membroSenzaDati) pezzi.push(e.membroSenzaDati + ' con un membro della squadra (da Griglia) senza dati in Controllo produzione');
  if (e.nonVerificata) pezzi.push(e.nonVerificata + ' con produzione non verificata');
  if (e.produzioneZero) pezzi.push(e.produzioneZero + ' senza produzione');
  if (e.oreMancanti) pezzi.push(e.oreMancanti + ' con un membro senza ore Jira');
  if (e.oreAnomale) pezzi.push(e.oreAnomale + ' con ore anomale (>' + PRF_ORE_MAX + ' h)');
  return pezzi.length ? '<p class="av-nota" style="padding:6px 12px">Giornate di squadra escluse: ' + esc(pezzi.join(', ')) + '.</p>' : '';
}

function _prfFreccia(on, dir) {
  return '<span class="av-arr">' + (on ? (dir === 1 ? '▲' : '▼') : '↕') + '</span>';
}

/* Righe della matrice ordinate per nome o per l'indice di un'attività. Con un'attività:
   prima chi ha almeno «Min. giornate» (per indice, nel verso scelto), poi chi ne ha meno,
   poi chi non ha dati su quell'attività; a parità, per nome. */
function _prfOrdinaMatrice(nomi, r) {
  const { col, dir } = _prf.ordM;
  if (!col || !r.pools[col]) return nomi.sort((a, b) => a.localeCompare(b) * dir);
  const ops = r.pools[col].operatori;
  const gruppo = n => { const x = ops[n]; return !x ? 2 : x.giorni < _prf.minGiorni ? 1 : 0; };
  return nomi.sort((a, b) => {
    const ga = gruppo(a), gb = gruppo(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) { const d = (ops[a].indice - ops[b].indice) * dir; if (d) return d; }
    if (ga === 1) { const d = ops[b].giorni - ops[a].giorni; if (d) return d; }
    return a.localeCompare(b);
  });
}

/* Ordinamento della classifica; valori mancanti (stima con più unità) sempre in fondo. */
function _prfOrdinaClassifica(lista, p, r) {
  const { col, dir } = _prf.ordC;
  const val = o => {
    if (col === 'nome') return o.nome;
    if (col === 'giorni') return o.giorni;
    if (col === 'aff') return PRF_AFF_ORD[o.affidabilita] * 1000 + o.indice / 1000;
    if (col === 'stima' || col === 'reale') { const pg = _prfProdGg(p, o, r.attEtichette); return pg ? pg[col] : null; }
    return o.indice;
  };
  return lista.sort((a, b) => {
    const va = val(a), vb = val(b);
    if ((va == null) !== (vb == null)) return va == null ? 1 : -1;
    const c = (typeof va === 'string') ? va.localeCompare(vb) : (va - vb);
    return c * dir || b.indice - a.indice || a.nome.localeCompare(b.nome);
  });
}

function _prfHtmlMatrice() {
  const r = _prf.ris;
  const cols = _prfColonne();
  const nascoste = Object.keys(r.pools).length - cols.length;
  const n = document.getElementById('prf-n');
  if (!cols.length) {
    if (n) n.textContent = '';
    return '<div class="av-vuoto">Nessuna attività con almeno ' + PRF_MIN_GIORNI_COLONNA + ' giornate di squadra con queste opzioni.</div>' + _prfEsclusiHtml();
  }
  const qn = caNorm(_prf.q);
  const nomi = new Set();
  cols.forEach(k => Object.keys(r.pools[k].operatori).forEach(o => nomi.add(o)));
  if (_prf.ordM.col && !cols.includes(_prf.ordM.col)) _prf.ordM = { col: '', dir: 1 };
  const righe = _prfOrdinaMatrice([...nomi].filter(o => !qn || caNorm(o).indexOf(qn) !== -1), r);
  if (n) n.textContent = righe.length + ' operatori · ' + cols.length + ' ' + (_prf.modo === 'wo' ? 'tipi di WO' : 'attività');

  const om = _prf.ordM;
  let h = '<div class="prf-tw"><table class="av-t prf-mat"><thead><tr><th class="prf-mat-op av-th-sort' + (!om.col ? ' av-th-on' : '') + '" data-prf-ordm="" data-help-key="prf-ordina" title="Ordina per nome">Operatore ' + _prfFreccia(!om.col, om.dir) + '</th>' + cols.map(k => {
    const sub = _prfPoolSub(k);
    const on = om.col === k;
    return '<th class="prf-mat-col' + (on ? ' av-th-on' : '') + '" data-prf-ordm="' + esc(k) + '" data-help-key="prf-ordina" title="Ordina per ' + esc(_prfPoolLabel(k)) + ' (clic di nuovo per invertire)">' +
      esc(_prfPoolLabel(k)) + ' ' + _prfFreccia(on, om.dir) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '<small>' + r.pools[k].nGiorni + ' gg squadra</small>' +
      '<button type="button" class="prf-pool-btn" data-prf-pool="' + esc(k) + '" data-help-key="prf-colonna" title="Apri la classifica di ' + esc(_prfPoolLabel(k)) + '">📊 classifica</button></th>';
  }).join('') + '</tr></thead><tbody>';
  righe.forEach(o => {
    h += '<tr><td class="prf-mat-op">' + esc(o) + '</td>' + cols.map(k => {
      const x = r.pools[k].operatori[o];
      if (!x) return '<td></td>';
      const debole = x.giorni < _prf.minGiorni;
      const pg = _prfProdGg(r.pools[k], x, r.attEtichette);
      const tit = Math.round(x.indice) + (pg ? ' · ≈ ' + _prfNum(pg.stima, 2) + ' ' + _prfUnitaGg(pg.unita) + ' a testa' : '') + ' · ' + x.giorni + ' giornate' + (x.giorniInd ? ' (' + x.giorniInd + ' individuali)' : '') + ' · affidabilità ' + x.affidabilita +
        (x.inseparabile ? ' · quasi sempre con ' + x.compagnoTop : '');
      return '<td class="prf-cella' + (debole ? ' prf-debole' : '') + '" style="' + _prfColore(x.indice, debole || x.inseparabile) + '" data-prf-cella="' + esc(k + '\u0001' + o) + '" data-help-key="prf-cella" title="' + esc(tit) + '">' +
        (debole ? '<span class="av-muted">' + x.giorni + ' gg</span>' : '<b>' + Math.round(x.indice) + '</b>' + (x.inseparabile ? ' <span title="Lavora quasi sempre con ' + esc(x.compagnoTop) + ': indice non separabile">⚠</span>' : '') + '<small>' + x.giorni + '</small>') + '</td>';
    }).join('') + '</tr>';
  });
  h += '</tbody></table></div>';
  h += '<p class="av-nota" style="padding:6px 12px">100 = resa nella norma dell\'attività (mediana). Verde sopra, rosso sotto; in grigio chi ha meno di ' + _prf.minGiorni + ' giornate. Il numero piccolo è il numero di giornate. Clicca un\'intestazione per ordinare (dal più performante; di nuovo per invertire; chi ha poche giornate resta in fondo), «📊 classifica» per la classifica dell\'attività, una cella per il dettaglio.' +
    (nascoste > 0 ? ' ' + nascoste + ' ' + (_prf.modo === 'wo' ? 'tipi' : 'attività') + ' con meno di ' + PRF_MIN_GIORNI_COLONNA + ' giornate di squadra non sono mostrati.' : '') + '</p>';
  return h + _prfEsclusiHtml();
}

/* Barra dell'indice su scala logaritmica 50–200, con l'intervallo probabile. */
function _prfBarra(o) {
  const pos = v => Math.max(0, Math.min(100, Math.log(Math.max(1, v) / 50) / Math.log(4) * 100));
  const col = o.inseparabile ? '#94a3b8' : o.indice >= 104 ? '#059669' : o.indice <= 96 ? '#e11d48' : '#64748b';
  return '<div class="prf-bar"><div class="prf-bar-c"></div>' +
    (o.inseparabile ? '' : '<div class="prf-bar-int" style="left:' + pos(o.basso).toFixed(1) + '%;width:' + Math.max(0.5, pos(o.alto) - pos(o.basso)).toFixed(1) + '%;background:' + col + '"></div>') +
    '<div class="prf-bar-p" style="left:' + pos(o.indice).toFixed(1) + '%;background:' + col + '"></div></div>';
}

function _prfMedianaTesto(p) {
  const r = _prf.ris;
  const atts = Object.keys(p.mediane);
  if (atts.length !== 1) return atts.length + ' attività, ognuna confrontata con la sua mediana';
  const e = r.attEtichette[atts[0]] || {};
  return 'norma (100) = ' + _prfNum(p.mediane[atts[0]] * PRF_ORE_GIORNATA, 2) + ' ' + esc(_prfUnitaGg(e.unita)) + ' a testa (giornata da ' + PRF_ORE_GIORNATA + ' h)';
}

/* Produzione a giornata, A TESTA, di un operatore su un pool con una sola attività (unità
   unica; con più attività le unità non si sommano → null).
   - stima: il suo indice applicato alla mediana dell'attività, giornata da PRF_ORE_GIORNATA ore
     (al netto di compagni e comuni: «quanto fa in una giornata normale»);
   - reale: la sua quota effettiva (produzione della squadra ÷ membri) per giornata lavorata,
     così com'è (ore della giornata comprese, compagni e comuni compresi). */
function _prfProdGg(p, o, attEtichette) {
  const atts = Object.keys((p && p.mediane) || {});
  if (atts.length !== 1 || !(p.mediane[atts[0]] > 0) || !o) return null;
  let km = 0, gg = 0;
  (o.oss || []).forEach(x => { km += (Number(x.rif.km) || 0) / Math.max(1, (x.membri || []).length); gg += x.peso || 1; });
  return {
    unita: ((attEtichette || {})[atts[0]] || {}).unita || '',
    stima: o.indice / 100 * p.mediane[atts[0]] * PRF_ORE_GIORNATA,
    reale: gg ? km / gg : null,
    mediana: p.mediane[atts[0]] * PRF_ORE_GIORNATA,
  };
}

function _prfUnitaGg(u) {
  u = String(u || '').trim();
  if (!u) return '/gg';
  return u.indexOf('/') !== -1 ? u + ' al gg' : u + '/gg';
}

function _prfHtmlClassifica(key) {
  const r = _prf.ris, p = r.pools[key];
  if (!p) return '';
  const qn = caNorm(_prf.q);
  const tutti = Object.values(p.operatori).filter(o => !qn || caNorm(o.nome).indexOf(qn) !== -1);
  const ok = _prfOrdinaClassifica(tutti.filter(o => o.giorni >= _prf.minGiorni), p, r);
  const pochi = _prfOrdinaClassifica(tutti.filter(o => o.giorni < _prf.minGiorni), p, r);
  const oc = _prf.ordC;
  const th = (k, testo, cls, extra) => '<th class="av-th-sort' + (cls ? ' ' + cls : '') + (oc.col === k ? ' av-th-on' : '') + '" data-prf-ordc="' + k + '" data-help-key="prf-ordina-cl"' + (extra || '') + '>' + testo + ' ' + _prfFreccia(oc.col === k, oc.dir) + '</th>';
  const n = document.getElementById('prf-n');
  if (n) n.textContent = ok.length + ' in classifica';
  const sub = _prfPoolSub(key);
  const nComuni = Object.keys(p.comuni).length || new Set(Object.values(p.operatori).flatMap(o => o.oss.map(x => x.comune))).size;

  let h = '<div class="av-card av-head">' +
    '<button type="button" class="av-btn" data-prf-back="1" data-help-key="prf-back">← Tutte le attività</button>' +
    '<div class="av-head-t"><div class="av-titolo">⚡ ' + esc(_prfPoolLabel(key)) + '</div><div class="av-sub">' + (sub ? esc(sub) + ' · ' : '') +
    p.nGiorni + ' giornate di squadra · ' + nComuni + ' comuni · ' + _prfMedianaTesto(p) + ' · periodo: ' + esc(_prfPerLabel()) + '</div></div></div>';

  h += '<div class="av-sintesi prf-spiega">Indice 100 = resa nella norma. Calcolato <b>togliendo l\'effetto dei compagni</b> (le coppie ruotano: si confronta la stessa persona con compagni diversi)' +
    (_prf.comune ? ' e <b>della difficoltà dei comuni</b>' : '') + '. Con poche giornate l\'indice resta vicino a 100. La barra va da 50 a 200; la fascia è l\'intervallo probabile. ' +
    '<button type="button" class="av-link" data-prf-guida="1" data-help-key="prf-guida">📖 Come leggere le colonne</button></div>';

  h += '<div class="prf-tw"><table class="av-t prf-cl"><thead><tr><th class="r">#</th>' + th('nome', 'Operatore') + th('indice', 'Indice', 'r') +
    '<th style="min-width:180px">50 · 100 · 200</th><th>Intervallo</th>' +
    th('stima', 'Stima / gg', 'r', ' title="Quanto produce a testa in una giornata normale da ' + PRF_ORE_GIORNATA + ' ore: il suo indice applicato alla norma dell\'attività, al netto di compagni e comuni"') +
    th('reale', 'Media reale / gg', 'r', ' title="La sua quota effettiva (produzione della squadra divisa per i membri) per giornata lavorata, così com\'è: compagni, comuni e ore della giornata compresi"') +
    th('giorni', 'Giornate', 'r') + th('aff', 'Affidabilità') + '<th>Compagno più frequente</th></tr></thead><tbody>';
  const riga = (o, pos) => {
    const aperto = _prf.aperto === o.nome;
    const pg = _prfProdGg(p, o, r.attEtichette);
    const ug = pg ? ' <span class="av-muted">' + esc(_prfUnitaGg(pg.unita)) + '</span>' : '';
    let t = '<tr class="av-row-click' + (aperto ? ' av-aperta' : '') + (pos ? '' : ' prf-pochi') + '" data-prf-op="' + esc(o.nome) + '" data-help-key="prf-op">' +
      '<td class="r av-muted">' + (pos || '') + '</td>' +
      '<td><span class="av-chev">' + (aperto ? '▾' : '▸') + '</span> <b>' + esc(o.nome) + '</b></td>' +
      '<td class="r"><b class="prf-ind">' + Math.round(o.indice) + '</b></td>' +
      '<td>' + _prfBarra(o) + '</td>' +
      '<td class="av-muted">' + (o.inseparabile ? 'non separabile' : Math.round(o.basso) + '–' + Math.round(o.alto)) + '</td>' +
      '<td class="r">' + (pg ? '<b>' + _prfNum(pg.stima, 2) + '</b>' + ug : '<span class="av-muted" title="Più attività con unità diverse: scegli «Per: Attività»">—</span>') + '</td>' +
      '<td class="r" title="' + esc(o.grezzo != null ? 'Indice grezzo (senza togliere compagni e comuni): ' + Math.round(o.grezzo) : '') + '">' + (pg && pg.reale != null ? _prfNum(pg.reale, 2) + ug : '<span class="av-muted">—</span>') + '</td>' +
      '<td class="r">' + o.giorni + (o.giorniInd ? ' <span class="av-muted" title="Giornate con tablet proprio">(' + o.giorniInd + ' ind.)</span>' : '') + '</td>' +
      '<td><span class="prf-aff prf-aff-' + o.affidabilita + '">' + o.affidabilita + '</span></td>' +
      '<td>' + (o.compagnoTop ? esc(o.compagnoTop) + ' <span class="av-muted">' + Math.round(o.quotaTop * 100) + '% delle giornate</span>' + (o.inseparabile ? ' <span class="av-warn" title="Lavora quasi sempre con questa persona: il contributo dei due non si può separare">⚠</span>' : '') : '<span class="av-muted">da solo</span>') + '</td></tr>';
    if (aperto) t += _prfHtmlGiornate(o);
    return t;
  };
  ok.forEach((o, i) => { h += riga(o, i + 1); });
  if (pochi.length) {
    h += '<tr class="prf-sez"><td colspan="10">Meno di ' + _prf.minGiorni + ' giornate: non in classifica</td></tr>';
    pochi.forEach(o => { h += riga(o, 0); });
  }
  if (!ok.length && !pochi.length) h += '<tr><td colspan="10" class="av-vuoto">Nessun operatore.</td></tr>';
  h += '</tbody></table></div>';
  return h + _prfEsclusiHtml();
}

function _prfHtmlGiornate(o) {
  const righe = o.oss.slice().sort((a, b) => b.rif.dataISO.localeCompare(a.rif.dataISO));
  const wo = _prf.modo === 'wo';
  let h = '<tr class="prf-giorni"><td></td><td colspan="9"><table class="av-t prf-gg"><thead><tr><th>Settimana</th><th>Comune</th>' + (wo ? '<th>Attività</th>' : '') +
    '<th>Con</th><th class="r">Produzione</th><th class="r">Ore-uomo</th><th class="r">Resa / ' + PRF_ORE_GIORNATA + ' h</th><th class="r">Rispetto alla mediana</th><th></th></tr></thead><tbody>';
  righe.forEach(x => {
    const f = x.rif;
    const rel = Math.exp(x.l) * 100;
    const resa = f.ore > 0 ? f.km / f.ore * PRF_ORE_GIORNATA : 0;   // per giornata-uomo
    const con = (f.membri || []).filter(m => m !== o.nome);
    const gg = f.giorni || [f.dataISO];
    h += '<tr><td title="' + esc(gg.map(d => _avData(d, true)).join(', ')) + '">' + esc(_avWeekLabel(f.anno, f.week)) + ' <span class="av-muted">' + gg.length + ' gg</span></td><td>' + esc(f.comune) + '</td>' + (wo ? '<td>' + esc(f.attivita) + '</td>' : '') +
      '<td>' + (x.individuale && f.kmSquadra != null ? '<span title="Misura individuale dal tablet QField">📟 ' : '<span>') + esc(con.join(', ') || 'da solo') + '</span></td>' +
      '<td class="r">' + _prfNum(f.km, 3) + ' <span class="av-muted">' + esc(f.unita || '') + '</span></td>' +
      '<td class="r">' + _prfNum(f.ore, 1) + '</td>' +
      '<td class="r">' + _prfNum(resa, 2) + '</td>' +
      '<td class="r" style="' + _prfColore(rel, false) + '">' + Math.round(rel) + '</td>' +
      '<td><button type="button" class="av-link" data-prf-cp="' + esc(f.anno + '|' + f.week) + '" data-help-key="prf-cp" title="Apri questa settimana in Controllo Produzione">↗</button></td></tr>';
  });
  h += '</tbody></table>';
  return h + '<div class="av-nota">Una riga = la stessa squadra sullo stesso comune nella stessa settimana: produzione e ore sono sommate sulle giornate valide (passa il mouse sulla settimana per vederle); 📟 = giornata misurata sul tablet della persona. «Rispetto alla mediana» è la resa così com\'è, prima di togliere compagni e comuni.</div></td></tr>';
}

/* ----- Scelte ----- */

async function _prfScegliModo() {
  const v = await _avScegli('Raggruppa per', [
    { v: 'att', label: 'Attività', sub: 'una colonna per attività di ciascuna commessa (es. Rilievo WO IP · Sinfi)' },
    { v: 'wo', label: 'Tipo di WO', sub: 'WO I.P, WO Fognatura, … — unisce le attività dello stesso tipo anche fra commesse' },
  ], _prf.modo);
  if (v == null || v === _prf.modo) return;
  _prf.modo = v; _prf.focus = ''; _prf.aperto = ''; _prfPrefSave(); _prfRicalcola();
}

async function _prfScegliCommessa() {
  const v = await _avScegli('Commessa', [{ v: '', label: 'Tutte le commesse' }].concat(_prfCommesse().map(c => ({ v: c, label: c }))), _prf.commessa);
  if (v == null || v === _prf.commessa) return;
  _prf.commessa = v; _prf.focus = ''; _prf.aperto = ''; _prfPrefSave(); _prfRicalcola();
}

async function _prfScegliMin() {
  const v = await _avScegli('Giornate minime per entrare in classifica', [3, 5, 10, 15].map(n => ({ v: String(n), label: n + ' giornate' })), String(_prf.minGiorni));
  if (v == null) return;
  _prf.minGiorni = Number(v); _prfPrefSave(); _prfRenderBarra(); _prfRenderCorpo();
}

async function _prfScegliPeriodo() {
  const p = _prf.per;
  const opz = [
    { v: 'tutto', label: 'Tutto', sub: 'tutte le giornate in Controllo Produzione' },
    { v: '30', label: 'Ultimi 30 giorni' },
    { v: '90', label: 'Ultimi 90 giorni' },
    { v: '180', label: 'Ultimi 180 giorni' },
  ];
  const pr = _avScegli('Periodo', opz, p.tipo === 'date' ? '' : p.tipo);
  const body = document.getElementById('av-pick-body');
  body.insertAdjacentHTML('beforeend', '<div class="av-pick-date"><div class="av-pick-sez" style="padding-left:0">Intervallo di date</div>' +
    '<div class="av-pick-date-r"><label>Dal <input type="date" id="prf-per-dal" value="' + esc(p.tipo === 'date' ? p.dal : '') + '"></label>' +
    '<label>Al <input type="date" id="prf-per-al" value="' + esc(p.tipo === 'date' ? p.al : '') + '"></label>' +
    '<button type="button" id="prf-per-applica" class="av-btn av-btn-pri" data-help-key="av-per-applica">Applica</button></div></div>');
  document.getElementById('prf-per-applica').onclick = () => {
    const dal = document.getElementById('prf-per-dal').value, al = document.getElementById('prf-per-al').value;
    if (!dal && !al) return;
    _avModalChiudi(dal && al && dal > al ? 'd|' + al + '|' + dal : 'd|' + dal + '|' + al);
  };
  const v = await pr;
  if (v == null) return;
  if (v.indexOf('d|') === 0) { const x = v.split('|'); _prf.per = { tipo: 'date', dal: x[1], al: x[2] }; }
  else _prf.per = { tipo: v, dal: '', al: '' };
  _prfPrefSave(); _prfRicalcola();
}

/* ----- Export ----- */

function prfEsporta() {
  const r = _prf.ris;
  if (!r) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria Excel non disponibile.'); return; }
  const ind = [['Periodo', _prfPerLabel(), 'Raggruppato per', _prf.modo === 'wo' ? 'Tipo di WO' : 'Attività', 'Solo verificata', _prf.soloVer ? 'sì' : 'no', 'Effetto comune', _prf.comune ? 'sì' : 'no'], [],
    ['Attività / tipo', 'Commessa', 'Operatore', 'Indice', 'Intervallo da', 'Intervallo a', 'Giornate', 'Di cui individuali', 'Affidabilità', 'Compagno più frequente', 'Quota con lui %', 'Non separabile', 'Grezzo', 'Stima a testa / gg (' + PRF_ORE_GIORNATA + ' h)', 'Media reale a testa / gg', 'Norma / gg', 'Unità']];
  const gg = [['Attività / tipo', 'Operatore', 'Settimana', 'Anno', 'Giornate', 'Giorni', 'Comune', 'Attività', 'Squadra', 'Con', 'Produzione', 'Unità', 'Ore-uomo', 'Rispetto alla mediana', 'Individuale']];
  const arr = v => v == null ? '' : Math.round(v * 1000) / 1000;
  Object.keys(r.pools).sort((x, y) => _prfPoolLabel(x).localeCompare(_prfPoolLabel(y))).forEach(k => {
    const p = r.pools[k], lab = _prfPoolLabel(k), comm = ((r.etichette[k] || {}).commessa) || '';
    Object.values(p.operatori).sort((a, b) => b.indice - a.indice).forEach(o => {
      const pg = _prfProdGg(p, o, r.attEtichette);
      ind.push([lab, comm, o.nome, Math.round(o.indice), o.inseparabile ? '' : Math.round(o.basso), o.inseparabile ? '' : Math.round(o.alto), o.giorni, o.giorniInd, o.affidabilita,
        o.compagnoTop, o.compagnoTop ? Math.round(o.quotaTop * 100) : '', o.inseparabile ? 'sì' : '', o.grezzo != null ? Math.round(o.grezzo) : '',
        pg ? arr(pg.stima) : '', pg ? arr(pg.reale) : '', pg ? arr(pg.mediana) : '', pg ? pg.unita : '']);
      o.oss.forEach(x => {
        const f = x.rif;
        gg.push([lab, o.nome, f.week, f.anno, (f.giorni || [f.dataISO]).length, (f.giorni || [f.dataISO]).join(' '), f.comune, f.attivita, f.squadra, (f.membri || []).filter(m => m !== o.nome).join(', '), f.km, f.unita || '', f.ore, Math.round(Math.exp(x.l) * 100), x.individuale ? 'sì' : '']);
      });
    });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ind), 'Indici');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gg), 'Giornate');
  XLSX.writeFile(wb, ('prestazioni_operatori' + (_prf.commessa ? '_' + _prf.commessa : '')).replace(/[^\w\-]+/g, '_') + '.xlsx');
}
