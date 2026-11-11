/* ==================== AVANZAMENTO COMUNI (av*) ====================
   Tab «📍 Avanzamento comuni» di Pianificazione Settimanale. Risponde a domande come «A
   Sondrio a che punto sono? Quanta produzione hanno fatto finora?».

   Due livelli:
   - ELENCO: tabella raggruppata per comune (riga di intestazione del comune, poi una riga
     per attività: attività diverse non si sommano mai, hanno unità e target diversi),
     filtrabile (testo, attività, stato Jira, «mostra») e ordinabile per colonna.
   - DETTAGLIO di un comune: un riquadro per attività, ciascuno con il suo Task, il suo
     avanzamento e il suo progressivo per settimana, che si apre sui giorni; ‹ › passano al
     comune precedente/successivo dell'elenco così com'è filtrato e ordinato.
   Un PERIODO (tutto, ultimi 7/30 giorni, una settimana, un intervallo di date) limita i
   numeri ai giorni scelti; l'avanzamento sul Target Production del Task è invece il
   cumulato fino alla fine del periodo («a che punto erano a quella data»).
   Le scelte (commessa, periodo, filtri) si fanno in una finestra centrata (_avScegli), non
   con le tendine native.

   Quale produzione: il Km/Cad di Controllo Produzione, cioè ciò che «Sincronizza» scrive sul
   campo Jira della commessa (cpCampoProduzione). Commesse a KPI_Quantità lavorata (SINFI):
   la % è la resa sul KPI_Quantità target delle giornate lavorate (_avKpiTarget); le altre:
   Actual Production sul Target Production dei Task (_avTasks).

   Sola lettura: non scrive né Supabase né Jira. Fonti:
   - pwData: giorni pianificati (anche futuri), operatori, sottotask della Griglia;
   - controllo_produzione: ore Jira e Km/Cad salvati in Controllo Produzione (quindi
     aggiornati solo per le settimane in cui qualcuno ha fatto «Sincronizza da Jira»);
   - jira-task-status (via le cache della Mappa, mlEnsureTaskStatus/_mlTasks): stato e
     targetProduction del Task di ciascun sottotask.

   Attribuzione a un comune. Una riga di controllo_produzione è operatore+giorno e porta
   TUTTI i worklog del giorno (anche di altre commesse) e il Km/Cad per ticket. Ogni ticket
   va al comune (e all'attività) del suo sottotask in Griglia (_cpaIndiceSottotask, l'unico
   legame certo); un ticket che la Griglia non conosce va al cantiere della giornata solo se
   quel giorno l'operatore aveva un solo cantiere e nessun'altra commessa, e se il prefisso
   del ticket non è di un altro progetto Jira. Altrimenti resta «non attribuito» e viene
   contato a parte: niente abbinamenti per nome fra comune e Task. */

const AV_PAGE = 1000;
const AV_MAX_PAGES = 60;
const AV_PREF_KEY = 'av_pref_v3';
const AV_COLONNE = 'anno,week,giorno,data_giorno,squadra,operatore,cantiere,attivita,ore_jira,ore_report,km_cad,km_by_ticket,km_meta_by_ticket,jira_tickets,updated_at';
const AV_SENZA_ATT = '(senza attività)';
const AV_STATO_ORD = { indeterminate: 0, new: 1, done: 2, nd: 3 };
const AV_STATI = [
  { v: '', label: 'Tutti gli stati' },
  { v: 'indeterminate', label: 'In corso', sub: 'Task Jira in lavorazione' },
  { v: 'new', label: 'Da fare', sub: 'Task Jira non ancora iniziato' },
  { v: 'done', label: 'Completato', sub: 'Task Jira chiuso' },
  { v: 'nd', label: 'Senza stato Jira', sub: 'nessun sottotask Jira o Task non ancora letto' },
];
const AV_MOSTRA = [
  { v: '', label: 'Tutti' },
  { v: 'lavorati', label: 'Con lavoro nel periodo', sub: 'ore o produzione registrate nel periodo scelto' },
  { v: 'programma', label: 'In programma in Griglia', sub: 'con giorni pianificati da oggi in poi' },
  { v: 'mai', label: 'Senza lavoro nel periodo', sub: 'nessuna ora né produzione nel periodo scelto' },
];
const AV_COLS = [
  { k: 'comune', label: 'Comune · attività' },
  { k: 'stato', label: 'Stato Jira' },
  { k: 'pct', label: 'Avanzamento', w: 200 },
  { k: 'km', label: 'Produzione', r: true },
  { k: 'ore', label: 'Ore', r: true },
  { k: 'giorni', label: 'Giorni', r: true },
  { k: 'ultima', label: 'Ultimo giorno' },
  { k: 'prossimo', label: 'In Griglia' },
];

const _av = {
  commessa: '',
  comuneKey: '',        // '' = elenco; altrimenti dettaglio del comune
  attFocus: '',         // attività da portare in vista aprendo il dettaglio
  filtri: { q: '', att: '', stato: '', mostra: '' },
  sort: { col: 'ultima', dir: -1 },
  per: { tipo: 'tutto', anno: null, week: null, dal: '', al: '' },
  righe: {},            // commessa -> { rows, ts, troncato } (cache di sessione)
  mod: null,
  caricando: false,
  errore: '',
  jiraMsg: '',
  jiraLetti: {},
  aperte: new Set(),    // "attKey|anno|week" espanse nel progressivo
  uiPronta: false,
  ordineComuni: [],     // chiavi dei comuni nell'ordine dell'elenco (per ‹ › nel dettaglio)
};

(function _avPrefLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(AV_PREF_KEY) || '{}');
    if (p.commessa) _av.commessa = p.commessa;
    if (p.filtri) Object.assign(_av.filtri, p.filtri);
    if (!AV_MOSTRA.some(o => o.v === _av.filtri.mostra)) _av.filtri.mostra = '';
    if (p.sort && AV_COLS.some(c => c.k === p.sort.col)) _av.sort = { col: p.sort.col, dir: p.sort.dir === 1 ? 1 : -1 };
    if (p.per && p.per.tipo) Object.assign(_av.per, p.per);
  } catch (_) { /* preferenze illeggibili: si parte dai default */ }
})();

function _avPrefSave() {
  try { localStorage.setItem(AV_PREF_KEY, JSON.stringify({ commessa: _av.commessa, filtri: _av.filtri, sort: _av.sort, per: _av.per })); } catch (_) {}
}

/* ----- Utilità ----- */

function _avKey(nome) { return caNorm(nome); }

function _avNum(n, dec) {
  const v = Number(n) || 0;
  return v.toLocaleString('it-IT', { maximumFractionDigits: dec == null ? 1 : dec });
}

function _avOggi() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _avIsoGiorno(anno, week, giorno) {
  const m = isoWeekToMonday(Number(anno), Number(week));
  m.setUTCDate(m.getUTCDate() + Number(giorno));
  return m.toISOString().slice(0, 10);
}

function _avSpostaIso(iso, giorni) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

function _avData(iso, conAnno) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  const o = { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' };
  if (conAnno) o.year = '2-digit';
  return d.toLocaleDateString('it-IT', o);
}

function _avDataBreve(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function _avWeekLabel(anno, week) { return 'W' + week + '/' + anno; }

function _avWeekDate(anno, week) {
  const lun = isoWeekToMonday(Number(anno), Number(week)), sab = new Date(lun);
  sab.setUTCDate(lun.getUTCDate() + 5);
  return formatDate(lun) + '–' + formatDate(sab);
}

function _avStr(v) { return v == null ? '' : String(v); }

/* Unità di misura di un'attività: quella del catalogo, altrimenti il nome storico della
   colonna di Controllo Produzione. */
function _avUnita(commessa, attivita) {
  const v = attivita ? caTrova(commessa, attivita) : null;
  return (v && v.unita) ? v.unita : 'km/cad';
}

function avCommesse() {
  const s = new Set();
  Object.keys(pwData || {}).forEach(anno => {
    if (!/^\d{4}$/.test(anno)) return;
    Object.values(pwData[anno] || {}).forEach(data => {
      if (Array.isArray(data)) data.forEach(bc => { if (bc && bc.commessa) s.add(bc.commessa); });
    });
  });
  return [...s].sort((a, b) => a.localeCompare(b));
}

/* ----- Periodo ----- */

/* Estremi del periodo scelto (ISO, inclusi); null = senza limite. */
function _avRange() {
  const p = _av.per, oggi = _avOggi();
  if (p.tipo === '7') return { dal: _avSpostaIso(oggi, -6), al: oggi };
  if (p.tipo === '30') return { dal: _avSpostaIso(oggi, -29), al: oggi };
  if (p.tipo === 'week' && p.anno && p.week) { const dal = _avIsoGiorno(p.anno, p.week, 0); return { dal, al: _avSpostaIso(dal, 6) }; }
  if (p.tipo === 'date') return { dal: p.dal || null, al: p.al || null };
  return { dal: null, al: null };
}

function _avPerLabel() {
  const p = _av.per;
  if (p.tipo === '7') return 'Ultimi 7 giorni';
  if (p.tipo === '30') return 'Ultimi 30 giorni';
  if (p.tipo === 'week' && p.anno && p.week) return _avWeekLabel(p.anno, p.week) + ' (' + _avWeekDate(p.anno, p.week) + ')';
  if (p.tipo === 'date' && (p.dal || p.al)) return (p.dal ? 'dal ' + _avDataBreve(p.dal) : '') + (p.dal && p.al ? ' ' : '') + (p.al ? 'al ' + _avDataBreve(p.al) : '');
  return 'Tutto';
}

function _avInPeriodo(iso, r) { return (!r.dal || iso >= r.dal) && (!r.al || iso <= r.al); }

/* ----- Dati ----- */

async function _avCaricaRighe(commessa, forza) {
  if (!forza && _av.righe[commessa]) return _av.righe[commessa];
  if (!_sbClient || !_sbUser) return { rows: [], ts: Date.now(), troncato: false };
  const rows = [];
  let troncato = false;
  for (let p = 0; p < AV_MAX_PAGES; p++) {
    const { data, error } = await _sbClient
      .from('controllo_produzione')
      .select(AV_COLONNE)
      .eq('commessa', commessa)
      .order('anno').order('week').order('giorno').order('squadra').order('operatore')
      .range(p * AV_PAGE, p * AV_PAGE + AV_PAGE - 1);
    if (error) throw error;
    const blocco = data || [];
    blocco.forEach(r => rows.push(r));
    if (blocco.length < AV_PAGE) break;
    if (p === AV_MAX_PAGES - 1) troncato = true;
  }
  const out = { rows, ts: Date.now(), troncato };
  _av.righe[commessa] = out;
  return out;
}

/* Modello della commessa: per comune i giorni pianificati (pian), le voci di produzione
   attribuite (voci: una per operatore+giorno+ticket) e i sottotask (sub: chiave ->
   attività); poi raggruppati per attività in c.att. I numeri del periodo li calcola
   _avDeriva(). */
function _avCalcola(commessa, righe) {
  const comuni = {};
  const ensure = nome => {
    const key = _avKey(nome);
    if (!key) return null;
    if (!comuni[key]) comuni[key] = { key, nome: String(nome).trim(), pian: [], voci: [], sub: {} };
    return comuni[key];
  };
  const celle = {};                 // "anno|week|squadra|operatore|giorno" -> voci di Griglia
  const altre = {};                 // "anno|week|operatore|giorno" -> Set(commesse)
  const blocchi = {};               // "anno|week" -> blocco Griglia della commessa (per il KPI target)
  const settimane = new Set();      // settimane della commessa (pianificate o con dati)

  Object.keys(pwData || {}).forEach(anno => {
    if (!/^\d{4}$/.test(anno)) return;
    Object.keys(pwData[anno] || {}).forEach(week => {
      const data = pwData[anno][week];
      if (!Array.isArray(data)) return;
      data.forEach(bc => {
        if (!bc || !bc.commessa) return;
        if (bc.commessa === commessa && !blocchi[anno + '|' + week]) blocchi[anno + '|' + week] = bc;
        (bc.squadre || []).forEach(sq => {
          (sq.operatori || []).forEach(op => {
            if (!op || !op.nome) return;
            for (let g = 0; g < 6; g++) {
              const voci = pwCellVoci((op.giorni || {})[g]);
              if (!voci.length) continue;
              const ka = anno + '|' + week + '|' + op.nome + '|' + g;
              (altre[ka] = altre[ka] || new Set()).add(bc.commessa);
              if (bc.commessa !== commessa) continue;
              celle[anno + '|' + week + '|' + (sq.nome || '') + '|' + op.nome + '|' + g] = voci;
              settimane.add(anno + '|' + week);
              const dataISO = _avIsoGiorno(anno, week, g);
              voci.forEach(v => {
                const c = ensure(v.cantiere);
                if (c) c.pian.push({ dataISO, anno: Number(anno), week: Number(week), giorno: g, operatore: op.nome, squadra: sq.nome || '', cantiere: v.cantiere, attivita: v.attivita || '' });
              });
            }
          });
        });
        if (bc.commessa !== commessa) return;
        Object.values(pwJiraSubtaskMappa(bc, Number(anno), Number(week))).forEach(e => {
          if (!pwJiraSubtaskIsResolved(e) || !e.key || !e.cantiere) return;
          const c = ensure(e.cantiere);
          if (c && !c.sub[e.key]) c.sub[e.key] = e.attivita || '';
        });
      });
    });
  });

  const indice = _cpaIndiceSottotask();
  const meta = (state.commesse_attive_meta || {})[commessa] || {};
  const codice = String(meta.jira_project_code || '').trim().toUpperCase();
  const nonAttr = [];               // voci non attribuibili (filtrate per periodo in _avDeriva)
  const visti = new Set();
  const settimaneDati = new Set();

  (righe || []).forEach(r => {
    const anno = Number(r.anno), week = Number(r.week), giorno = Number(r.giorno);
    settimaneDati.add(anno + '|' + week);
    settimane.add(anno + '|' + week);
    const dataISO = r.data_giorno || _avIsoGiorno(anno, week, giorno);
    let voci = celle[anno + '|' + week + '|' + (r.squadra || '') + '|' + r.operatore + '|' + giorno];
    if (!voci || !voci.length) {
      voci = String(r.cantiere || '').split(', ').map(s => s.trim()).filter(Boolean)
        .map(c => ({ cantiere: c, attivita: r.attivita || '' }));
    }
    const comuniGiorno = [...new Set(voci.map(v => _avKey(v.cantiere)))];
    const altreCommesse = [...(altre[anno + '|' + week + '|' + r.operatore + '|' + giorno] || [])].filter(c => c !== commessa);
    const tickets = Array.isArray(r.jira_tickets) ? r.jira_tickets.filter(t => t && t.key) : [];
    let kmBy = (r.km_by_ticket && typeof r.km_by_ticket === 'object') ? r.km_by_ticket : {};
    if (!Object.keys(kmBy).length && r.km_cad != null && tickets.length === 1) kmBy = { [tickets[0].key]: Number(r.km_cad) };
    const kmMeta = (r.km_meta_by_ticket && typeof r.km_meta_by_ticket === 'object') ? r.km_meta_by_ticket : {};
    const base = { dataISO, anno, week, giorno, operatore: r.operatore, squadra: r.squadra || '' };

    const destinazione = key => {
      const ix = indice[key];
      if (ix) {
        if (ix.commessa !== commessa) return null;
        const vc = voci.find(v => _avKey(v.cantiere) === _avKey(ix.cantiere));
        return { cantiere: ix.cantiere, attivita: ix.attivita || (vc && vc.attivita) || '', certo: true };
      }
      const pref = String(key).split('-')[0].toUpperCase();
      if (codice && pref !== codice) return null;              // ticket di un altro progetto Jira
      if (comuniGiorno.length === 1 && !altreCommesse.length) {
        const atts = [...new Set(voci.map(v => v.attivita).filter(Boolean))];
        return { cantiere: voci[0].cantiere, attivita: atts.length === 1 ? atts[0] : '', certo: false };
      }
      return 'ambiguo';
    };

    const chiavi = [...new Set(tickets.map(t => t.key).concat(Object.keys(kmBy)))];
    chiavi.forEach(key => {
      const vk = dataISO + '|' + r.operatore + '|' + key;
      if (visti.has(vk)) return;                                 // stesso operatore in due squadre
      visti.add(vk);
      const t = tickets.find(x => x.key === key);
      const ore = t ? Number(t.hours) || 0 : 0;
      const km = kmBy[key] != null ? Number(kmBy[key]) || 0 : 0;
      if (!ore && !km) return;
      const dest = destinazione(key);
      if (!dest) return;
      if (dest === 'ambiguo') { nonAttr.push({ dataISO, ore, km }); return; }
      const c = ensure(dest.cantiere);
      if (!c) return;
      const fonte = (kmMeta[key] && kmMeta[key].fonte) || (km ? (r.ore_report != null ? 'report' : 'jira') : null);
      c.voci.push(Object.assign({}, base, {
        cantiere: dest.cantiere, attivita: dest.attivita, ticket: key, url: (t && t.url) || '', summary: (t && t.summary) || '',
        ore, km, fonte, certo: dest.certo,
      }));
      if (dest.certo && !(key in c.sub)) c.sub[key] = dest.attivita;
    });

    // Righe senza ticket (salvate prima che si leggessero i worklog per ticket)
    if (!tickets.length && !Object.keys(kmBy).length) {
      const ore = Number(r.ore_jira) || 0, km = Number(r.km_cad) || 0;
      if (!ore && !km) return;
      if (comuniGiorno.length === 1 && !altreCommesse.length) {
        const c = ensure(voci[0].cantiere);
        if (c) c.voci.push(Object.assign({}, base, { cantiere: voci[0].cantiere, attivita: voci[0].attivita || '', ticket: '', url: '', summary: '', ore, km, fonte: km ? 'jira' : null, certo: false }));
      } else nonAttr.push({ dataISO, ore, km });
    }
  });

  Object.values(comuni).forEach(c => _avRaggruppa(c, commessa));
  const kpi = _avIsKpi(commessa);
  return { commessa, comuni, nonAttr, settimaneDati, settimane, blocchi, kpi, campo: kpi ? CP_CAMPO_KPI : CP_CAMPO_AP };
}

/* Divide le voci, i giorni pianificati e i sottotask del comune per attività (nome di
   catalogo quando c'è). Un giorno senza attività va all'unica attività del comune, se ce
   n'è una sola (come la creazione dei sottotask); altrimenti resta «senza attività». */
function _avRaggruppa(c, commessa) {
  const nomeDi = t => { const v = t ? caTrova(commessa, t) : null; return v ? v.nome : (t || '').trim(); };
  const tutte = new Set();
  c.pian.forEach(p => { if (p.attivita) tutte.add(nomeDi(p.attivita)); });
  c.voci.forEach(v => { if (v.attivita) tutte.add(nomeDi(v.attivita)); });
  Object.values(c.sub).forEach(a => { if (a) tutte.add(nomeDi(a)); });
  const unica = tutte.size === 1 ? [...tutte][0] : '';
  const gruppo = t => {
    const nome = nomeDi(t) || unica || AV_SENZA_ATT;
    const k = caNorm(nome);
    if (!c.att[k]) {
      const voce = nome !== AV_SENZA_ATT ? caTrova(commessa, nome) : null;
      c.att[k] = { key: k, nome, unita: _avUnita(commessa, nome), servizio: !!(voce && (voce.servizio || voce.produttiva === false)), pian: [], voci: [], sub: new Set() };
    }
    return c.att[k];
  };
  c.att = {};
  c.pian.forEach(p => gruppo(p.attivita).pian.push(p));
  c.voci.forEach(v => gruppo(v.attivita).voci.push(v));
  Object.keys(c.sub).forEach(k => gruppo(c.sub[k]).sub.add(k));
}

/* Numeri del periodo scelto, per comune e attività:
   - st: statistiche delle voci nel periodo (i giorni in programma restano da oggi in poi);
   - vc: voci fino alla fine del periodo (cumulato, per l'avanzamento sul Target Production);
   - kpi: resa sul KPI_Quantità target delle giornate lavorate nel periodo. */
function _avDeriva() {
  const m = _av.mod;
  if (!m) return;
  const r = _avRange();
  m.range = r;
  Object.values(m.comuni).forEach(c => {
    Object.values(c.att).forEach(a => {
      a.vp = a.voci.filter(v => _avInPeriodo(v.dataISO, r));
      a.vc = r.al ? a.voci.filter(v => v.dataISO <= r.al) : a.voci;
      a.st = _avStats(a.vp, a.pian, r);
      a.kpi = m.kpi ? _avKpiTarget(a.vp, a.nome, m.blocchi) : null;
    });
    c.st = _avStats(c.voci.filter(v => _avInPeriodo(v.dataISO, r)), c.pian, r);
  });
  const na = m.nonAttr.filter(v => _avInPeriodo(v.dataISO, r));
  m.na = { voci: na.length, ore: na.reduce((s, v) => s + v.ore, 0), km: na.reduce((s, v) => s + v.km, 0) };
}

/* Commessa col nuovo formato: la produzione è la KPI_Quantità lavorata dei sottotask (scelta
   in Controllo Produzione, cp_campo_produzione) e il confronto va fatto col KPI_Quantità
   target, non col Target Production del Task (unità non garantita). */
function _avIsKpi(commessa) {
  return typeof cpCampoProduzione === 'function' && cpCampoProduzione(commessa) === CP_CAMPO_KPI;
}

/* KPI_Quantità target delle giornate-operatore LAVORATE (con ore o produzione): per
   ognuna quello che l'app mette sul sottotask (caKpiTargetVoce: target giornaliero della
   squadra dal catalogo, diviso i presenti della squadra). La resa è la lavorata di quelle
   stesse giornate diviso la loro somma. */
function _avKpiTarget(voci, nomeAttivita, blocchi) {
  const giorni = {};
  voci.forEach(v => {
    const k = v.dataISO + '|' + v.operatore;
    if (!giorni[k]) giorni[k] = { v, km: 0 };
    giorni[k].km += v.km;
  });
  const out = { target: 0, fatto: 0, giorni: 0, senza: 0, perGiorno: {}, pct: null };
  Object.keys(giorni).forEach(k => {
    const g = giorni[k];
    const bc = blocchi[g.v.anno + '|' + g.v.week];
    let t = null;
    try { t = bc ? caKpiTargetVoce(bc, g.v.cantiere, g.v.operatore, nomeAttivita, g.v.giorno) : null; } catch (_) { t = null; }
    if (t && t.target > 0) { out.target += t.target; out.fatto += g.km; out.giorni++; out.perGiorno[k] = t.target; }
    else out.senza++;
  });
  if (out.target > 0) out.pct = out.fatto / out.target * 100;
  return out;
}

/* Avanzamento mostrato per un'attività: commesse KPI = resa sul KPI_Quantità target delle
   giornate lavorate; le altre = Actual Production sul Target Production dei Task. */
function _avAvanz(a, tk) {
  if (a.kpi) return { kpi: true, pct: a.kpi.pct, fatto: a.kpi.fatto, target: a.kpi.target };
  return { kpi: false, pct: tk.pct, fatto: tk.fatto, target: tk.target };
}

function _avStats(voci, pian, r) {
  const oggi = _avOggi();
  const s = {
    ore: 0, km: 0, kmDaVer: 0, giorni: new Set(), giorniUomo: new Set(), operatori: new Set(),
    prima: null, ultima: null, ultimaOps: new Set(), futuri: [], senzaOre: [],
  };
  voci.forEach(v => {
    s.ore += v.ore; s.km += v.km;
    if (v.km && v.fonte === 'jira') s.kmDaVer += v.km;
    s.giorni.add(v.dataISO);
    s.giorniUomo.add(v.dataISO + '|' + v.operatore);
    s.operatori.add(v.operatore);
    if (!s.prima || v.dataISO < s.prima) s.prima = v.dataISO;
    if (!s.ultima || v.dataISO > s.ultima) s.ultima = v.dataISO;
  });
  voci.forEach(v => { if (v.dataISO === s.ultima) s.ultimaOps.add(v.operatore); });
  const visti = new Set();
  pian.forEach(p => {
    const k = p.dataISO + '|' + p.operatore;
    if (visti.has(k)) return;
    visti.add(k);
    if (p.dataISO >= oggi) s.futuri.push(p);
    else if (!s.giorniUomo.has(k) && (!r || _avInPeriodo(p.dataISO, r))) s.senzaOre.push(p);
  });
  s.futuri.sort((a, b) => a.dataISO.localeCompare(b.dataISO) || a.operatore.localeCompare(b.operatore));
  s.senzaOre.sort((a, b) => a.dataISO.localeCompare(b.dataISO));
  return s;
}

/* Task Jira di un'attività del comune (dalle cache della Mappa), con la produzione — fino
   alla fine del periodo — dei ticket che vi appartengono. Il target è il Target Production
   del Task. */
function _avTasks(a) {
  const perTask = {};
  const chiavi = new Set(a.sub);
  a.voci.forEach(v => { if (v.ticket && v.certo) chiavi.add(v.ticket); });
  chiavi.forEach(sk => {
    const tk = _mlTaskBySubtask[sk];
    const t = tk ? _mlTasks[tk] : null;
    if (!t) return;
    if (!perTask[tk]) perTask[tk] = { task: t, km: 0, ore: 0 };
  });
  let kmFuori = 0;
  (a.vc || a.voci).forEach(v => {
    const tk = v.ticket ? _mlTaskBySubtask[v.ticket] : null;
    if (tk && perTask[tk]) { perTask[tk].km += v.km; perTask[tk].ore += v.ore; }
    else kmFuori += v.km;
  });
  const lista = Object.values(perTask).sort((x, y) => String(x.task.key).localeCompare(String(y.task.key)));
  const conTarget = lista.filter(x => Number(x.task.targetProduction) > 0);
  const target = conTarget.reduce((s, x) => s + Number(x.task.targetProduction), 0);
  const fatto = conTarget.reduce((s, x) => s + x.km, 0);
  const cats = lista.map(x => x.task.statusCategory).filter(Boolean);
  const stato = !cats.length ? null : cats.includes('indeterminate') ? 'indeterminate'
    : cats.includes('new') ? (cats.includes('done') ? 'indeterminate' : 'new') : 'done';
  const daLeggere = [...chiavi].filter(k => !(k in _mlTaskBySubtask));
  return { lista, target, fatto, kmFuori, stato, chiavi: [...chiavi], daLeggere, pct: target > 0 ? fatto / target * 100 : null };
}

/* ----- Jira ----- */

async function _avLeggiJira(chiavi, forza) {
  if (!chiavi.length) return true;
  if (forza) return mlFetchTaskStatus([...new Set(chiavi)]);
  return mlEnsureTaskStatus(chiavi);
}

function _avChiaviComune(c) {
  const out = [];
  Object.values(c.att || {}).forEach(a => out.push(..._avTasks(a).chiavi));
  return out;
}

async function _avJiraComune(forza) {
  const c = _av.mod && _av.mod.comuni[_av.comuneKey];
  if (!c) return;
  const chiavi = _avChiaviComune(c);
  if (!forza && !chiavi.some(k => !(k in _mlTaskBySubtask))) return;
  _av.jiraMsg = '⏳ Leggo i Task Jira di ' + c.nome + '…';
  _avRenderVista();
  try { await _avLeggiJira(chiavi, forza); _av.jiraMsg = ''; }
  catch (e) { _av.jiraMsg = '⚠ Task Jira non letti: ' + (e.message || String(e)); }
  _avRenderVista();
}

/* Stato e target di tutti i comuni della commessa, per l'elenco: una volta per sessione
   (le cache della Mappa durano 12 ore), in sottofondo. */
async function _avJiraCommessa() {
  const mod = _av.mod;
  if (!mod || _av.jiraLetti[mod.commessa]) return;
  _av.jiraLetti[mod.commessa] = true;
  const chiavi = [];
  Object.values(mod.comuni).forEach(c => chiavi.push(..._avChiaviComune(c)));
  if (!chiavi.some(k => !(k in _mlTaskBySubtask))) return;
  _avStatus('⏳ Leggo lo stato dei Task Jira…');
  try { await _avLeggiJira(chiavi, false); }
  catch (e) { console.error('avanzamento: stato Jira dei comuni', e); }
  if (_pwActiveTab === 'avanzamento' && _av.mod === mod) { _avStatus(''); _avRenderVista(); }
}

/* ----- Finestra di scelta (al posto delle tendine) ----- */

let _avPickRisolvi = null;

function _avModal() {
  let bg = document.getElementById('av-pick');
  if (bg) return bg;
  bg = document.createElement('div');
  bg.id = 'av-pick';
  bg.className = 'av-pick-bg hidden';
  bg.innerHTML = '<div class="av-pick-box" role="dialog" aria-modal="true">' +
    '<div class="av-pick-h"><span id="av-pick-tit"></span><button type="button" class="av-pick-x" data-help-key="av-pick-x" title="Chiudi (Esc)">✕</button></div>' +
    '<div id="av-pick-body" class="av-pick-body"></div></div>';
  document.body.appendChild(bg);
  bg.addEventListener('mousedown', ev => { if (ev.target === bg) _avModalChiudi(null); });
  bg.querySelector('.av-pick-x').onclick = () => _avModalChiudi(null);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !bg.classList.contains('hidden')) { ev.stopPropagation(); _avModalChiudi(null); }
  }, true);
  return bg;
}

function _avModalApri(titolo, html) {
  const bg = _avModal();
  if (_avPickRisolvi) { const r = _avPickRisolvi; _avPickRisolvi = null; r(null); }
  document.getElementById('av-pick-tit').textContent = titolo;
  document.getElementById('av-pick-body').innerHTML = html;
  bg.classList.remove('hidden');
  return new Promise(res => { _avPickRisolvi = res; });
}

function _avModalChiudi(valore) {
  const bg = document.getElementById('av-pick');
  if (bg) bg.classList.add('hidden');
  if (_avPickRisolvi) { const r = _avPickRisolvi; _avPickRisolvi = null; r(valore); }
}

/* Elenco di opzioni centrato e leggibile, con ricerca se sono tante.
   opzioni: [{ v, label, sub, sez }] (sez = titolo di gruppo prima dell'opzione). */
function _avScegli(titolo, opzioni, valore) {
  const conCerca = opzioni.length > 8;
  const lista = () => opzioni.map((o, i) =>
    (o.sez ? '<div class="av-pick-sez">' + esc(o.sez) + '</div>' : '') +
    '<button type="button" class="av-pick-opt' + (o.v === valore ? ' on' : '') + '" data-i="' + i + '" data-help-key="av-pick-opt" data-cerca="' + esc(caNorm(o.label + ' ' + (o.sub || ''))) + '">' +
    '<span>' + esc(o.label) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span>' + (o.v === valore ? '<span class="av-pick-ok">✓</span>' : '') + '</button>').join('');
  const p = _avModalApri(titolo,
    (conCerca ? '<input type="text" id="av-pick-q" class="av-pick-q" placeholder="Cerca…" autocomplete="off">' : '') +
    '<div class="av-pick-list" id="av-pick-list">' + lista() + '</div>');
  const box = document.getElementById('av-pick-list');
  box.onclick = ev => {
    const b = ev.target.closest('.av-pick-opt');
    if (b) _avModalChiudi(opzioni[Number(b.getAttribute('data-i'))].v);
  };
  const q = document.getElementById('av-pick-q');
  if (q) {
    q.oninput = () => {
      const t = caNorm(q.value);
      box.querySelectorAll('.av-pick-opt').forEach(b => { b.style.display = !t || b.getAttribute('data-cerca').indexOf(t) !== -1 ? '' : 'none'; });
      box.querySelectorAll('.av-pick-sez').forEach(s => { s.style.display = t ? 'none' : ''; });
    };
    q.onkeydown = ev => {
      if (ev.key !== 'Enter') return;
      const b = [...box.querySelectorAll('.av-pick-opt')].find(x => x.style.display !== 'none');
      if (b) b.click();
    };
    setTimeout(() => q.focus(), 30);
  }
  const on = box.querySelector('.av-pick-opt.on');
  if (on) setTimeout(() => on.scrollIntoView({ block: 'center' }), 0);
  return p;
}

async function _avScegliCommessa() {
  const commesse = avCommesse();
  if (!commesse.length) return;
  const v = await _avScegli('Commessa', commesse.map(c => ({ v: c, label: c })), _av.commessa);
  if (v == null || v === _av.commessa) return;
  _av.commessa = v; _av.comuneKey = ''; _av.filtri.att = ''; _av.aperte.clear();
  _avPrefSave();
  avRender();
}

async function _avScegliAttivita() {
  const nomi = _avNomiAttivita();
  const v = await _avScegli('Attività', [{ v: '', label: 'Tutte le attività' }].concat(
    Object.keys(nomi).sort((x, y) => nomi[x].localeCompare(nomi[y])).map(k => ({ v: k, label: nomi[k] }))), _av.filtri.att);
  if (v == null) return;
  _av.filtri.att = v; _avPrefSave(); _avRenderVista();
}

async function _avScegliStato() {
  const v = await _avScegli('Stato del Task Jira', AV_STATI, _av.filtri.stato);
  if (v == null) return;
  _av.filtri.stato = v; _avPrefSave(); _avRenderVista();
}

async function _avScegliMostra() {
  const v = await _avScegli('Mostra', AV_MOSTRA, _av.filtri.mostra);
  if (v == null) return;
  _av.filtri.mostra = v; _avPrefSave(); _avRenderVista();
}

/* Periodo: scorciatoie, una settimana (quelle della commessa, più recenti prima) o un
   intervallo di date. */
async function _avScegliPeriodo() {
  const p = _av.per;
  const opz = [
    { v: 'tutto', label: 'Tutto', sub: 'dall\'inizio dei lavori' },
    { v: '7', label: 'Ultimi 7 giorni', sub: 'oggi compreso' },
    { v: '30', label: 'Ultimi 30 giorni', sub: 'oggi compreso' },
  ];
  const corrente = p.tipo === 'week' ? 'w|' + p.anno + '|' + p.week : p.tipo;
  const oggi = _avOggi();
  const sett = _av.mod ? [..._av.mod.settimane] : [];
  sett.map(k => k.split('|').map(Number)).sort((x, y) => y[0] - x[0] || y[1] - x[1]).forEach(([anno, week], i) => {
    const dal = _avIsoGiorno(anno, week, 0);
    const qui = oggi >= dal && oggi <= _avSpostaIso(dal, 6);
    opz.push({ v: 'w|' + anno + '|' + week, label: _avWeekLabel(anno, week) + (qui ? ' · settimana corrente' : ''), sub: _avWeekDate(anno, week), sez: i === 0 ? 'Una settimana' : '' });
  });
  const html = '<div class="av-pick-date">' +
    '<div class="av-pick-sez" style="padding-left:0">Intervallo di date</div>' +
    '<div class="av-pick-date-r"><label>Dal <input type="date" id="av-per-dal" value="' + esc(p.tipo === 'date' ? p.dal : '') + '"></label>' +
    '<label>Al <input type="date" id="av-per-al" value="' + esc(p.tipo === 'date' ? p.al : '') + '"></label>' +
    '<button type="button" id="av-per-applica" class="av-btn av-btn-pri" data-help-key="av-per-applica">Applica</button></div></div>';
  const pr = _avScegli('Periodo', opz, corrente);
  // Intervallo di date in fondo alla stessa finestra
  const body = document.getElementById('av-pick-body');
  body.insertAdjacentHTML('beforeend', html);
  document.getElementById('av-per-applica').onclick = () => {
    const dal = document.getElementById('av-per-dal').value, al = document.getElementById('av-per-al').value;
    if (!dal && !al) return;
    _avModalChiudi(dal && al && dal > al ? 'd|' + al + '|' + dal : 'd|' + dal + '|' + al);
  };
  const v = await pr;
  if (v == null) return;
  if (v.indexOf('w|') === 0) { const x = v.split('|'); _av.per = { tipo: 'week', anno: Number(x[1]), week: Number(x[2]), dal: '', al: '' }; }
  else if (v.indexOf('d|') === 0) { const x = v.split('|'); _av.per = { tipo: 'date', anno: null, week: null, dal: x[1], al: x[2] }; }
  else _av.per = { tipo: v, anno: null, week: null, dal: '', al: '' };
  _avPrefSave();
  _avDeriva();
  _avRenderVista();
}

function _avSpostaSettimana(delta) {
  const p = _av.per;
  if (p.tipo !== 'week') return;
  let w = p.week + delta, a = p.anno;
  if (w < 1) { a--; w = weeksInYear(a); } else if (w > weeksInYear(a)) { a++; w = 1; }
  _av.per = { tipo: 'week', anno: a, week: w, dal: '', al: '' };
  _avPrefSave(); _avDeriva(); _avRenderVista();
}

/* ----- Righe dell'elenco ----- */

function _avNomiAttivita() {
  const nomi = {};
  if (_av.mod) Object.values(_av.mod.comuni).forEach(c => Object.values(c.att).forEach(a => { nomi[a.key] = a.nome; }));
  return nomi;
}

function _avRigheElenco() {
  const m = _av.mod;
  if (!m) return [];
  const oggi = _avOggi();
  const out = [];
  Object.values(m.comuni).forEach(c => {
    Object.values(c.att).forEach(a => {
      const tk = _avTasks(a);
      const av = _avAvanz(a, tk);
      out.push({
        c, a, comune: c.nome, attivita: a.nome, stato: tk.stato || 'nd', pct: av.pct, target: av.target, fatto: av.fatto,
        km: a.st.km, ore: a.st.ore, giorni: a.st.giorni.size, ultima: a.st.ultima || '',
        prossimo: (a.st.futuri[0] || {}).dataISO || '', oggi: !!(a.st.futuri[0] && a.st.futuri[0].dataISO === oggi),
        unita: a.unita, daVer: a.st.kmDaVer,
      });
    });
  });
  return out;
}

function _avFiltra(righe) {
  const f = _av.filtri;
  const q = caNorm(f.q);
  return righe.filter(r => {
    if (q && caNorm(r.comune).indexOf(q) === -1) return false;
    if (f.att && r.a.key !== f.att) return false;
    if (f.stato && r.stato !== f.stato) return false;
    if (f.mostra === 'lavorati' && !(r.ore || r.km)) return false;
    if (f.mostra === 'programma' && !r.prossimo) return false;
    if (f.mostra === 'mai' && (r.ore || r.km)) return false;
    return true;
  });
}

function _avOrdina(righe) {
  const { col, dir } = _av.sort;
  const val = r => {
    if (col === 'stato') return AV_STATO_ORD[r.stato];
    if (col === 'pct') return r.pct == null ? -1 : r.pct;
    return r[col];
  };
  return righe.sort((x, y) => {
    const a = val(x), b = val(y);
    // Vuoti (mai lavorato, niente in programma) sempre in fondo, in qualsiasi verso.
    if ((col === 'ultima' || col === 'prossimo') && (!a || !b) && a !== b) return a ? -1 : 1;
    const cmp = (typeof a === 'string' || typeof b === 'string') ? String(a).localeCompare(String(b)) : (a - b);
    return cmp * dir || x.comune.localeCompare(y.comune) || x.attivita.localeCompare(y.attivita);
  });
}

/* Gruppi per comune nell'ordine della prima riga di ciascuno: un comune sale se una sua
   attività sale. Dentro il gruppo le attività restano nell'ordine scelto. */
function _avGruppi(righe) {
  const gruppi = [], per = {};
  righe.forEach(r => {
    if (!per[r.c.key]) { per[r.c.key] = { c: r.c, righe: [] }; gruppi.push(per[r.c.key]); }
    per[r.c.key].righe.push(r);
  });
  return gruppi;
}

/* ----- Render ----- */

function _avInitUi() {
  if (_av.uiPronta) return;
  const view = document.getElementById('pw-view-avanzamento');
  if (!view) return;
  _av.uiPronta = true;
  try { mlJiraCacheLoad(); } catch (_) {}
  const q = document.getElementById('av-q');
  if (q) q.oninput = () => { _av.filtri.q = q.value; _avPrefSave(); _avRenderElenco(); };
  const azioni = {
    'av-commessa-btn': _avScegliCommessa,
    'av-periodo-btn': _avScegliPeriodo,
    'av-per-prev': () => _avSpostaSettimana(-1),
    'av-per-next': () => _avSpostaSettimana(1),
    'av-f-att-btn': _avScegliAttivita,
    'av-f-stato-btn': _avScegliStato,
    'av-f-mostra-btn': _avScegliMostra,
    'av-refresh': avAggiorna,
    'av-export-lista': avEsportaElenco,
    'av-f-clear': () => { _av.filtri = { q: '', att: '', stato: '', mostra: '' }; _avPrefSave(); _avRenderVista(); },
  };
  Object.keys(azioni).forEach(id => { const el = document.getElementById(id); if (el) el.onclick = () => azioni[id](); });
  view.addEventListener('click', ev => {
    const el = ev.target.closest('[data-av-comune],[data-av-sort],[data-av-week],[data-av-cp],[data-av-back],[data-av-export],[data-av-vai],[data-av-salta]');
    if (!el || !view.contains(el) || ev.target.closest('a[href]')) return;
    if (el.hasAttribute('data-av-cp')) {
      const p = el.getAttribute('data-av-cp').split('|');
      pwAnno = Number(p[0]); pwWeek = Number(p[1]);
      pwSwitchTab('controllo');
    } else if (el.hasAttribute('data-av-sort')) {
      const col = el.getAttribute('data-av-sort');
      if (_av.sort.col === col) _av.sort.dir = -_av.sort.dir;
      else _av.sort = { col, dir: (col === 'comune' || col === 'stato' || col === 'prossimo') ? 1 : -1 };
      _avPrefSave();
      _avRenderElenco();
    } else if (el.hasAttribute('data-av-comune')) {
      _avApriComune(el.getAttribute('data-av-comune'), el.getAttribute('data-av-att') || '');
    } else if (el.hasAttribute('data-av-vai')) {
      _avApriComune(el.getAttribute('data-av-vai'), '');
    } else if (el.hasAttribute('data-av-back')) {
      _av.comuneKey = '';
      _avRenderVista();
    } else if (el.hasAttribute('data-av-export')) {
      avEsportaComune();
    } else if (el.hasAttribute('data-av-salta')) {
      const card = view.querySelector('[data-av-card="' + CSS.escape(el.getAttribute('data-av-salta')) + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (el.hasAttribute('data-av-week')) {
      const k = el.getAttribute('data-av-week');
      if (_av.aperte.has(k)) _av.aperte.delete(k); else _av.aperte.add(k);
      _avRenderDettaglio();
    }
  });
}

function _avApriComune(key, att) {
  if (!_av.mod || !_av.mod.comuni[key]) return;
  _av.comuneKey = key;
  _av.attFocus = att;
  _av.aperte.clear();
  _avRenderVista();
  window.scrollTo(0, 0);
  _avJiraComune(false);
}

async function avRender() {
  _avInitUi();
  const commesse = avCommesse();
  if (!commesse.includes(_av.commessa)) _av.commessa = commesse[0] || '';
  _avRenderBarra();
  if (!_av.commessa) { _av.mod = null; _avRenderVista(); return; }
  if (typeof _cpCampoProd !== 'undefined' && _cpCampoProd === null) { try { await cpCampoProdLoad(); } catch (_) {} }

  const commessa = _av.commessa;
  _av.errore = '';
  if (!_av.righe[commessa]) {
    _av.caricando = true;
    _av.mod = null;
    _avStatus('⏳ Carico la produzione di ' + commessa + '…');
    _avRenderVista();
  }
  let dati;
  try { dati = await _avCaricaRighe(commessa, false); }
  catch (e) { _av.errore = 'Produzione non caricata: ' + (e.message || String(e)); dati = { rows: [], ts: Date.now() }; }
  _av.caricando = false;
  if (_pwActiveTab !== 'avanzamento' || _av.commessa !== commessa) return;
  _av.mod = _avCalcola(commessa, dati.rows);
  _av.mod.troncato = !!dati.troncato;
  _av.mod.ts = dati.ts;
  _avDeriva();
  if (_av.comuneKey && !_av.mod.comuni[_av.comuneKey]) _av.comuneKey = '';
  _avStatus('');
  _avRenderVista();
  _avJiraComune(false).then(() => _avJiraCommessa());
}

async function avAggiorna() {
  if (!_av.commessa) return;
  delete _av.righe[_av.commessa];
  await avRender();
  // Rilettura forzata solo per il comune aperto: per l'elenco bastano le chiavi mancanti
  // (rileggere tutta la commessa sarebbero migliaia di sottotask).
  await _avJiraComune(true);
}

function _avStatus(txt) {
  const el = document.getElementById('av-status');
  if (!el) return;
  if (txt) { el.textContent = txt; return; }
  const m = _av.mod;
  el.textContent = m && m.ts ? 'Dati letti alle ' + new Date(m.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
}

function _avChip(id, etichetta, valore, attivo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<span>' + esc(etichetta) + '</span> <b>' + esc(valore) + '</b> <span class="av-caret">▾</span>';
  el.classList.toggle('on', !!attivo);
}

/* Barra in alto (sempre visibile): commessa, periodo, campo di produzione. */
function _avRenderBarra() {
  _avChip('av-commessa-btn', 'Commessa', _av.commessa || '—', false);
  _avChip('av-periodo-btn', 'Periodo', _avPerLabel(), _av.per.tipo !== 'tutto');
  const sett = _av.per.tipo === 'week';
  ['av-per-prev', 'av-per-next'].forEach(id => { const b = document.getElementById(id); if (b) b.classList.toggle('hidden', !sett); });
  const campo = document.getElementById('av-campo');
  if (campo) {
    const m = _av.mod;
    campo.textContent = !m ? '' : (m.kpi ? 'Produzione = KPI_Quantità lavorata · % = resa sul KPI_Quantità target' : 'Produzione = Actual Production · % = avanzamento sul Target Production del Task');
    campo.className = 'av-campo' + (m && m.kpi ? ' av-campo-kpi' : '');
  }
}

function _avRenderVista() {
  _avRenderBarra();
  const el = document.getElementById('av-elenco'), det = document.getElementById('av-dettaglio');
  const inDettaglio = !!(_av.mod && _av.comuneKey && _av.mod.comuni[_av.comuneKey]);
  if (el) el.classList.toggle('hidden', inDettaglio);
  if (det) det.classList.toggle('hidden', !inDettaglio);
  if (inDettaglio) _avRenderDettaglio();
  else _avRenderElenco();
}

function _avBadge(stato, testo) {
  if (!stato || stato === 'nd') return '<span class="av-muted">—</span>';
  return '<span class="av-badge" style="background:' + esc(ML_STATUS_COLORS[stato] || '#cbd5e1') + '">' + esc(testo || ML_STATUS_LABELS[stato] || stato) + '</span>';
}

function _avBarra(pct) {
  const p = Math.max(0, Math.min(100, pct));
  const col = pct >= 100 ? '#10b981' : '#0d9488';
  return '<div class="av-bar"><div style="width:' + p.toFixed(1) + '%;background:' + col + '"></div></div>';
}

function _avRenderElenco() {
  const box = document.getElementById('av-tabella');
  if (!box) return;
  const m = _av.mod;
  const f = _av.filtri;
  const q = document.getElementById('av-q');
  if (q && q.value !== f.q) q.value = f.q;
  const nomi = _avNomiAttivita();
  if (f.att && m && !nomi[f.att]) f.att = '';
  _avChip('av-f-att-btn', 'Attività', f.att ? nomi[f.att] : 'Tutte', !!f.att);
  _avChip('av-f-stato-btn', 'Stato', (AV_STATI.find(s => s.v === f.stato) || AV_STATI[0]).label.replace('Tutti gli stati', 'Tutti'), !!f.stato);
  _avChip('av-f-mostra-btn', 'Mostra', (AV_MOSTRA.find(s => s.v === f.mostra) || AV_MOSTRA[0]).label, !!f.mostra);
  const clear = document.getElementById('av-f-clear');
  if (clear) clear.classList.toggle('hidden', !(f.q || f.att || f.stato || f.mostra));

  if (_av.errore) { box.innerHTML = '<div class="av-vuoto av-err">' + esc(_av.errore) + '</div>'; return; }
  if (!m) { box.innerHTML = '<div class="av-vuoto">' + (_av.caricando ? 'Caricamento…' : 'Scegli una commessa.') + '</div>'; return; }
  const tutte = _avRigheElenco();
  const righe = _avOrdina(_avFiltra(tutte));
  const gruppi = _avGruppi(righe);
  _av.ordineComuni = gruppi.map(g => g.c.key);
  const n = document.getElementById('av-n');
  if (n) n.textContent = gruppi.length + ' comuni' + (righe.length !== tutte.length ? ' (filtrati)' : '');
  if (!righe.length) { box.innerHTML = '<div class="av-vuoto">Nessun comune con questi filtri.</div>'; return; }

  const colLabel = c => c.k === 'pct' ? (m.kpi ? 'Resa su KPI target' : 'Avanzamento su target')
    : c.k === 'km' ? (m.kpi ? 'KPI lavorata' : 'Actual Production') : c.label;
  let h = '<table class="av-t av-t-elenco"><thead><tr>' + AV_COLS.map(c => {
    const on = _av.sort.col === c.k;
    return '<th class="av-th-sort' + (c.r ? ' r' : '') + (on ? ' av-th-on' : '') + '"' + (c.w ? ' style="min-width:' + c.w + 'px"' : '') +
      ' data-av-sort="' + c.k + '" data-help-key="av-sort" title="Ordina">' + colLabel(c) + ' <span class="av-arr">' + (on ? (_av.sort.dir === 1 ? '▲' : '▼') : '↕') + '</span></th>';
  }).join('') + '</tr></thead>';
  const oggi = _avOggi();
  gruppi.forEach((g, gi) => {
    const c = g.c, st = c.st;
    const prossimo = (st.futuri[0] || {}).dataISO || '';
    h += '<tbody class="av-grp">' + (gi ? '<tr class="av-gap"><td colspan="' + AV_COLS.length + '"></td></tr>' : '') +
      '<tr class="av-grp-h av-row-click" data-av-comune="' + esc(c.key) + '" data-help-key="av-comune">' +
      '<td colspan="3"><span class="av-grp-nome">' + esc(c.nome) + '</span> <span class="av-muted">' + Object.keys(c.att).length + ' attività · ' + st.operatori.size + ' operatori</span></td>' +
      '<td></td>' +
      '<td class="r"><b>' + (st.ore ? _avNum(st.ore) : '') + '</b></td>' +
      '<td class="r"><b>' + (st.giorni.size || '') + '</b></td>' +
      '<td><b>' + esc(_avData(st.ultima, true)) + '</b></td>' +
      '<td>' + (prossimo === oggi ? '<span class="av-oggi">● oggi</span>' : '<b>' + esc(_avData(prossimo)) + '</b>') + '</td></tr>';
    g.righe.forEach(r => {
      h += '<tr class="av-att-r av-row-click" data-av-comune="' + esc(c.key) + '" data-av-att="' + esc(r.a.key) + '" data-help-key="av-comune">' +
        '<td>' + esc(r.attivita) + '</td>' +
        '<td>' + _avBadge(r.stato) + '</td>' +
        '<td>' + (r.pct != null
          ? '<div class="av-pct">' + _avBarra(r.pct) + '<b>' + _avNum(r.pct, 0) + '%</b></div><div class="av-muted">' + _avNum(r.fatto) + ' / ' + _avNum(r.target) + ' ' + esc(r.unita) + '</div>'
          : '<span class="av-muted">' + (r.a.servizio ? 'non produttiva' : (m.kpi ? 'nessun KPI target' : 'nessun target')) + '</span>') + '</td>' +
        '<td class="r">' + (r.km ? _avNum(r.km) + ' <span class="av-muted">' + esc(r.unita) + '</span>' + (r.daVer ? ' <span class="av-warn" title="' + esc(_avNum(r.daVer)) + ' da verificare in Controllo Produzione">👁</span>' : '') : '') + '</td>' +
        '<td class="r">' + (r.ore ? _avNum(r.ore) : '') + '</td>' +
        '<td class="r">' + (r.giorni || '') + '</td>' +
        '<td>' + esc(_avData(r.ultima, true)) + '</td>' +
        '<td>' + (r.oggi ? '<span class="av-oggi">● oggi</span>' : esc(_avData(r.prossimo))) + '</td></tr>';
    });
    h += '</tbody>';
  });
  h += '</table>';
  if (m.na && m.na.voci) {
    h += '<p class="av-nota" style="padding:8px 12px">⚠ ' + _avNum(m.na.ore) + ' h e ' + _avNum(m.na.km) + ' di produzione della commessa nel periodo non sono attribuibili a un comune: giornate con più cantieri o più commesse su ticket che la Griglia non collega a un sottotask.</p>';
  }
  box.innerHTML = h;
}

function _avRenderDettaglio() {
  const el = document.getElementById('av-dettaglio');
  const m = _av.mod;
  const c = m && m.comuni[_av.comuneKey];
  if (!el || !c) return;
  const st = c.st;
  const oggi = _avOggi();
  const r = m.range || {};

  // Navigazione: elenco, precedente/successivo nell'ordine dell'elenco filtrato
  _av.ordineComuni = _avGruppi(_avOrdina(_avFiltra(_avRigheElenco()))).map(g => g.c.key);
  const pos = _av.ordineComuni.indexOf(c.key);
  const prec = pos > 0 ? _av.ordineComuni[pos - 1] : '';
  const succ = pos >= 0 && pos < _av.ordineComuni.length - 1 ? _av.ordineComuni[pos + 1] : '';
  const nomeDi = k => (m.comuni[k] || {}).nome || '';

  let h = '<div class="av-card av-head">' +
    '<button type="button" class="av-btn" data-av-back="1" data-help-key="av-back">← Elenco comuni</button>' +
    '<div class="av-head-t"><div class="av-titolo">' + esc(c.nome) + '</div><div class="av-sub">' + esc(m.commessa) +
      (r.dal || r.al ? ' · periodo: ' + esc(_avPerLabel()) : '') + (pos >= 0 ? ' · ' + (pos + 1) + ' di ' + _av.ordineComuni.length + ' nell\'elenco' : '') + '</div></div>' +
    '<div class="av-nav">' +
      '<button type="button" class="av-btn"' + (prec ? ' data-av-vai="' + esc(prec) + '" title="' + esc(nomeDi(prec)) + '"' : ' disabled') + ' data-help-key="av-prev">‹ ' + esc(prec ? nomeDi(prec) : 'Precedente') + '</button>' +
      '<button type="button" class="av-btn"' + (succ ? ' data-av-vai="' + esc(succ) + '" title="' + esc(nomeDi(succ)) + '"' : ' disabled') + ' data-help-key="av-next">' + esc(succ ? nomeDi(succ) : 'Successivo') + ' ›</button>' +
      '<button type="button" class="av-btn" data-av-export="1" data-help-key="av-export">⬇ Excel</button></div></div>';

  // Sintesi del comune: solo ciò che vale per tutte le attività insieme.
  const pezzi = [];
  pezzi.push(st.ultima ? 'Ultimo lavoro' + (r.dal || r.al ? ' nel periodo' : '') + ' <b>' + esc(_avData(st.ultima)) + '</b> (' + esc([...st.ultimaOps].join(', ')) + ')' : 'Nessuna ora registrata' + (r.dal || r.al ? ' nel periodo' : ''));
  if (st.futuri.length) {
    const giorni = [...new Set(st.futuri.map(f => f.dataISO))];
    const ops = [...new Set(st.futuri.filter(f => f.dataISO === giorni[0]).map(f => f.operatore))];
    pezzi.push((giorni[0] === oggi ? '<b>oggi</b> in Griglia: ' : 'prossimo giorno in Griglia <b>' + esc(_avData(giorni[0])) + '</b>: ') + esc(ops.join(', ')) +
      (giorni.length > 1 ? ' (' + giorni.length + ' giorni in programma)' : ''));
  } else pezzi.push('niente in programma in Griglia');
  pezzi.push('<b>' + _avNum(st.ore) + ' ore</b> in ' + st.giorni.size + ' giorni, ' + st.operatori.size + ' operatori');
  h += '<div class="av-sintesi">' + pezzi.join(' <span class="av-sep">·</span> ') + '</div>';

  const avvisi = [];
  const settSenza = [...new Set(c.pian.filter(p => p.dataISO < oggi && _avInPeriodo(p.dataISO, r)).map(p => p.anno + '|' + p.week))].filter(k => !m.settimaneDati.has(k)).sort();
  if (settSenza.length) avvisi.push('Settimane pianificate mai sincronizzate in Controllo Produzione (non contate): ' +
    settSenza.map(k => { const p = k.split('|'); return '<button type="button" class="av-link" data-av-cp="' + esc(k) + '" data-help-key="av-cp">' + esc(_avWeekLabel(p[0], p[1])) + '</button>'; }).join(', '));
  if (m.troncato) avvisi.push('La commessa ha più righe di quante se ne leggano in una volta: i totali potrebbero essere incompleti.');
  if (_av.jiraMsg) avvisi.push(esc(_av.jiraMsg));
  if (avvisi.length) h += '<ul class="av-avvisi">' + avvisi.map(a => '<li>' + a + '</li>').join('') + '</ul>';

  // Un riquadro per attività: prima le produttive con più lavoro, in fondo quelle di servizio.
  const atts = Object.values(c.att).sort((x, y) => (x.servizio - y.servizio) || (y.st.ore - x.st.ore) || x.nome.localeCompare(y.nome));
  if (atts.length > 1) {
    h += '<div class="av-salta">Attività: ' + atts.map(a => {
      const tk = _avTasks(a), av = _avAvanz(a, tk);
      return '<button type="button" class="av-salta-b" data-av-salta="' + esc(a.key) + '" data-help-key="av-salta">' + esc(a.nome) +
        (av.pct != null ? ' <b>' + _avNum(av.pct, 0) + '%</b>' : '') + '</button>';
    }).join('') + '</div>';
  }
  atts.forEach(a => { h += _avHtmlAttivita(a, m); });
  el.innerHTML = h;

  if (_av.attFocus) {
    const card = el.querySelector('[data-av-card="' + CSS.escape(_av.attFocus) + '"]');
    _av.attFocus = '';
    if (card && atts.length > 1) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }
}

function _avHtmlAttivita(a, m) {
  const tk = _avTasks(a);
  const st = a.st;
  const u = esc(a.unita);
  const ritmo = st.giorni.size ? st.km / st.giorni.size : 0;
  const residuo = tk.target > 0 ? Math.max(0, tk.target - tk.fatto) : null;

  let h = '<div class="av-card av-att" data-av-card="' + esc(a.key) + '">';
  h += '<div class="av-att-h"><div class="av-att-nome">' + esc(a.nome) + ' ' + _avBadge(tk.stato || 'nd') + '</div>' +
    '<div class="av-att-task">' + (tk.lista.length
      ? tk.lista.map(x => '<a href="' + esc(_avStr(x.task.url)) + '" target="_blank" rel="noopener" title="' + esc(_avStr(x.task.summary)) + '">' + esc(_avStr(x.task.key)) + '</a> <span class="av-muted">' + esc(_avStr(x.task.status)) + '</span>').join(' · ')
      : '<span class="av-muted">' + (tk.chiavi.length ? (tk.daLeggere.length ? 'Task Jira in lettura…' : 'Task Jira non trovato') : 'Nessun sottotask Jira: stato e target non disponibili') + '</span>') + '</div></div>';

  // Avanzamento: commesse KPI = resa sul KPI_Quantità target delle giornate lavorate;
  // le altre = Actual Production sul Target Production dei Task.
  if (a.kpi) {
    const k = a.kpi;
    if (k.pct != null) {
      h += '<div class="av-att-prog"><div class="av-att-pct">' + _avNum(k.pct, 0) + '%</div><div style="flex:1">' + _avBarra(k.pct) +
        '<div class="av-muted" style="margin-top:3px">resa: ' + _avNum(k.fatto) + ' ' + u + ' di KPI_Quantità lavorata su ' + _avNum(k.target) + ' ' + u +
        ' di KPI_Quantità target, in ' + k.giorni + ' giornate-operatore lavorate' +
        (k.senza ? ' · ' + k.senza + ' giornate senza KPI target (escluse)' : '') + '</div></div></div>';
    } else if (!a.servizio && st.giorni.size) {
      h += '<div class="av-nota">Nessun KPI_Quantità target per questa attività: va impostato nel catalogo attività della commessa («🏷️ Attività e KPI»).</div>';
    }
  } else if (tk.pct != null) {
    h += '<div class="av-att-prog"><div class="av-att-pct">' + _avNum(tk.pct, 0) + '%</div><div style="flex:1">' + _avBarra(tk.pct) +
      '<div class="av-muted" style="margin-top:3px">' + _avNum(tk.fatto) + ' di ' + _avNum(tk.target) + ' ' + u + ' (Actual Production su Target Production del Task' +
      (m.range && m.range.al ? ', fino al ' + esc(_avDataBreve(m.range.al)) : '') + ') · residuo ' + _avNum(residuo) + ' ' + u +
      (residuo > 0 && ritmo > 0 ? ' · ≈ ' + Math.ceil(residuo / ritmo) + ' giorni di lavoro al ritmo medio' : '') + '</div></div></div>';
  }
  // Numeri dell'attività, in una riga
  const kv = (l, v) => '<div><span>' + l + '</span><b>' + v + '</b></div>';
  h += '<div class="av-kv">' +
    (a.servizio ? '' : kv(m.kpi ? 'KPI_Quantità lavorata' : 'Actual Production', _avNum(st.km) + ' ' + u + (st.kmDaVer ? ' <span class="av-warn" title="Letta da Jira, non verificata in Controllo Produzione">(' + _avNum(st.kmDaVer) + ' da verificare)</span>' : ''))) +
    kv('Ore', _avNum(st.ore)) +
    kv('Giorni', String(st.giorni.size) + ' <span class="av-muted">(' + st.giorniUomo.size + ' giorni-uomo)</span>') +
    (a.servizio || !st.giorni.size ? '' : kv('Resa', _avNum(ritmo) + ' ' + u + '/giorno')) +
    kv('Periodo lavorato', st.prima ? esc(_avData(st.prima, true)) + ' → ' + esc(_avData(st.ultima, true)) : '—') +
    kv('In programma', st.futuri.length ? [...new Set(st.futuri.map(f => f.dataISO))].length + ' gg dal ' + esc(_avData(st.futuri[0].dataISO)) : '—') +
    '</div>';
  if (!a.kpi && tk.kmFuori && tk.pct != null) h += '<div class="av-nota">' + _avNum(tk.kmFuori) + ' ' + u + ' su ticket senza Task con target: esclusi dalla percentuale.</div>';
  if (st.senzaOre.length) h += '<div class="av-nota av-warn">' + st.senzaOre.length + ' giornate-operatore pianificate e passate senza ore registrate (in giallo nel progressivo).</div>';

  h += _avHtmlProgressivo(a, tk, m);
  return h + '</div>';
}

/* Progressivo per settimana di UNA attività; ogni settimana si apre sui giorni. Con un
   periodo si vedono solo le sue settimane, ma il progressivo parte comunque dall'inizio
   dei lavori (è «dove erano arrivati» a quella settimana). */
function _avHtmlProgressivo(a, tk, m) {
  const r = m.range || {};
  const per = {};
  const add = (anno, week) => {
    const k = anno + '|' + week;
    return per[k] || (per[k] = { k, anno, week, km: 0, ore: 0, kmTot: 0, giorni: new Set(), ops: new Set(), voci: [], pian: [] });
  };
  a.voci.forEach(v => {
    const w = add(v.anno, v.week);
    if (!r.al || v.dataISO <= r.al) w.kmTot += v.km;
    if (!_avInPeriodo(v.dataISO, r)) return;
    w.km += v.km; w.ore += v.ore; w.giorni.add(v.dataISO); w.ops.add(v.operatore); w.voci.push(v);
  });
  a.pian.forEach(p => { if (_avInPeriodo(p.dataISO, r)) add(p.anno, p.week).pian.push(p); });
  const tutte = Object.values(per).sort((x, y) => x.anno - y.anno || x.week - y.week);
  const sett = tutte.filter(w => w.voci.length || w.pian.length);
  if (!sett.length) return '<div class="av-vuoto">Nessuna settimana nel periodo.</div>';
  const oggi = _avOggi();
  const kpi = a.kpi && a.kpi.target > 0 ? a.kpi : null;
  const conTargetTask = !kpi && tk.target > 0;
  const u = esc(a.unita);
  const cumDi = {};
  let cum = 0;
  tutte.forEach(w => { cum += w.kmTot; cumDi[w.k] = cum; });
  const nCol = 4 + (a.servizio ? 0 : 2) + (kpi ? 2 : conTargetTask ? 1 : 0) + 1;
  let h = '<div class="av-tw"><table class="av-t av-t-prog"><thead><tr><th>Settimana</th><th class="r">Giorni</th><th>Operatori</th><th class="r">Ore</th>' +
    (a.servizio ? '' : '<th class="r">' + (m.kpi ? 'KPI lavorata' : 'Produzione') + '</th><th class="r">Progressivo</th>') +
    (kpi ? '<th class="r">KPI target</th><th style="min-width:140px">Resa settimana</th>' : conTargetTask ? '<th style="min-width:150px">% progressiva su target</th>' : '') +
    '<th></th></tr></thead><tbody>';
  sett.forEach(w => {
    const ak = a.key + '|' + w.k;
    const aperta = _av.aperte.has(ak);
    const futura = !w.voci.length && w.pian.every(p => p.dataISO >= oggi);
    let celleTarget = '';
    if (kpi) {
      const visti = new Set();
      let t = 0, f = 0;
      w.voci.forEach(v => {
        const g = v.dataISO + '|' + v.operatore;
        if (kpi.perGiorno[g] == null) return;
        f += v.km;
        if (!visti.has(g)) { visti.add(g); t += kpi.perGiorno[g]; }
      });
      const pct = t > 0 ? f / t * 100 : null;
      celleTarget = '<td class="r">' + (t ? _avNum(t) : '') + '</td><td>' + (pct == null ? '' : '<div class="av-pct">' + _avBarra(pct) + '<span>' + _avNum(pct, 0) + '%</span></div>') + '</td>';
    } else if (conTargetTask) {
      const pct = cumDi[w.k] / tk.target * 100;
      celleTarget = '<td>' + (futura ? '' : '<div class="av-pct">' + _avBarra(pct) + '<span>' + _avNum(pct, 0) + '%</span></div>') + '</td>';
    }
    h += '<tr class="av-row-click' + (futura ? ' av-futuro' : '') + (aperta ? ' av-aperta' : '') + '" data-av-week="' + esc(ak) + '" data-help-key="av-week">' +
      '<td><span class="av-chev">' + (aperta ? '▾' : '▸') + '</span> <b>' + esc(_avWeekLabel(w.anno, w.week)) + '</b> <span class="av-muted">' + esc(_avWeekDate(w.anno, w.week)) + '</span></td>' +
      '<td class="r">' + (futura ? '<span class="av-muted">in programma</span>' : w.giorni.size) + '</td>' +
      '<td class="av-wrap">' + esc([...(w.ops.size ? w.ops : new Set(w.pian.map(p => p.operatore)))].join(', ')) + '</td>' +
      '<td class="r">' + (w.ore ? _avNum(w.ore) : '') + '</td>' +
      (a.servizio ? '' : '<td class="r">' + (w.km ? _avNum(w.km) : '') + '</td><td class="r">' + (futura ? '' : '<b>' + _avNum(cumDi[w.k]) + '</b> <span class="av-muted">' + u + '</span>') + '</td>') +
      celleTarget +
      '<td><button type="button" class="av-link" data-av-cp="' + esc(w.k) + '" data-help-key="av-cp" title="Apri questa settimana in Controllo Produzione">↗</button></td></tr>';
    if (aperta) h += _avHtmlGiorniSettimana(w, a, oggi, nCol);
  });
  const st = a.st;
  h += '</tbody><tfoot><tr><td><b>Totale' + (r.dal || r.al ? ' periodo' : '') + '</b></td><td class="r">' + st.giorni.size + '</td><td>' + st.operatori.size + ' operatori</td><td class="r"><b>' + _avNum(st.ore) + '</b></td>' +
    (a.servizio ? '' : '<td class="r"><b>' + _avNum(st.km) + '</b></td><td></td>') +
    (kpi ? '<td class="r"><b>' + _avNum(kpi.target) + '</b></td><td><b>' + _avNum(kpi.pct, 0) + '%</b></td>' : conTargetTask ? '<td></td>' : '') +
    '<td></td></tr></tfoot></table></div>';
  return h;
}

function _avHtmlGiorniSettimana(w, a, oggi, nCol) {
  const righe = {};
  const add = (d, op) => righe[d + '|' + op] || (righe[d + '|' + op] = { d, op, ore: 0, km: 0, tk: [], daVer: false });
  w.pian.forEach(p => add(p.dataISO, p.operatore));
  w.voci.forEach(v => {
    const r = add(v.dataISO, v.operatore);
    r.ore += v.ore; r.km += v.km;
    if (v.km && v.fonte === 'jira') r.daVer = true;
    if (v.ticket && !r.tk.some(t => t.key === v.ticket)) r.tk.push({ key: v.ticket, url: v.url, summary: v.summary, certo: v.certo });
  });
  let h = '';
  let precD = null;
  Object.values(righe).sort((x, y) => x.d.localeCompare(y.d) || x.op.localeCompare(y.op)).forEach(r => {
    const futuro = r.d >= oggi && !r.ore && !r.km;
    const senza = !futuro && !r.ore && !r.km;
    const usate = 4 + (a.servizio ? 0 : 1);
    h += '<tr class="av-sub-row' + (futuro ? ' av-futuro' : senza ? ' av-senza' : '') + (r.d !== precD ? ' av-sub-primo' : '') + '">' +
      '<td class="av-ind">' + (r.d !== precD ? esc(_avData(r.d)) : '') + '</td>' +
      '<td></td><td>' + esc(r.op) + ' ' + r.tk.map(t => (t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener" class="av-tk" title="' + esc(t.summary) + '">' + esc(t.key) + '</a>' : '<span class="av-tk">' + esc(t.key) + '</span>') +
        (t.certo ? '' : '<span class="av-muted" title="Ticket non collegato a un sottotask della Griglia: attribuito al comune perché quel giorno l\'operatore aveva solo questo cantiere">*</span>')).join(' ') + '</td>' +
      '<td class="r">' + (futuro ? '<span class="av-muted">in programma</span>' : senza ? '<span class="av-warn">nessuna ora</span>' : _avNum(r.ore)) + '</td>' +
      (a.servizio ? '' : '<td class="r">' + (r.km ? _avNum(r.km) + (r.daVer ? ' <span class="av-warn" title="Letta da Jira, non verificata">👁</span>' : '') : '') + '</td>') +
      '<td colspan="' + Math.max(1, nCol - usate) + '"></td></tr>';
    precD = r.d;
  });
  return h;
}

/* ----- Export ----- */

function avEsportaElenco() {
  if (!_av.mod) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria Excel non disponibile.'); return; }
  const righe = _avOrdina(_avFiltra(_avRigheElenco()));
  const kpi = _av.mod.kpi;
  const aoa = [['Periodo', _avPerLabel()], [],
    ['Comune', 'Attività', 'Stato Jira', kpi ? 'Resa su KPI target %' : 'Avanzamento su target %', kpi ? 'KPI lavorata (giornate con target)' : 'Fatto su target',
      kpi ? 'KPI_Quantità target' : 'Target Production', 'Unità', kpi ? 'KPI_Quantità lavorata' : 'Actual Production', 'Da verificare', 'Ore', 'Giorni', 'Ultimo giorno', 'Prossimo in Griglia']];
  _avGruppi(righe).forEach(g => g.righe.forEach(r => aoa.push([r.comune, r.attivita, r.stato === 'nd' ? '' : ML_STATUS_LABELS[r.stato], r.pct == null ? '' : Math.round(r.pct * 10) / 10,
    r.pct == null ? '' : r.fatto, r.target || '', r.unita, r.km, r.daVer || '', r.ore, r.giorni, r.ultima, r.prossimo])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Comuni');
  XLSX.writeFile(wb, ('avanzamento_comuni_' + _av.mod.commessa).replace(/[^\w\-]+/g, '_') + '.xlsx');
}

function avEsportaComune() {
  const m = _av.mod;
  const c = m && m.comuni[_av.comuneKey];
  if (!c) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria Excel non disponibile.'); return; }
  const kpi = m.kpi;
  const wb = XLSX.utils.book_new();
  const riep = [['Periodo', _avPerLabel()], [],
    ['Attività', 'Stato Jira', 'Task', kpi ? 'KPI_Quantità target' : 'Target Production', kpi ? 'KPI lavorata (giornate con target)' : 'Fatto su target',
      kpi ? 'Resa su KPI target %' : 'Avanzamento %', 'Unità', kpi ? 'KPI_Quantità lavorata' : 'Actual Production', 'Da verificare', 'Ore', 'Giorni', 'Giorni-uomo', 'Primo giorno', 'Ultimo giorno']];
  const prog = [['Attività', 'Settimana', 'Anno', 'Giorni', 'Operatori', 'Ore', kpi ? 'KPI lavorata' : 'Produzione', kpi ? 'KPI target settimana' : 'Progressivo', kpi ? 'Resa settimana %' : '% progressiva su target']];
  const gg = [['Attività', 'Data', 'Settimana', 'Operatore', 'Squadra', 'Ticket', 'Ore', 'Produzione', 'Fonte produzione']];
  Object.values(c.att).sort((x, y) => x.nome.localeCompare(y.nome)).forEach(a => {
    const tk = _avTasks(a), st = a.st, av = _avAvanz(a, tk);
    riep.push([a.nome, tk.stato ? ML_STATUS_LABELS[tk.stato] : '', tk.lista.map(x => x.task.key).join(', '), av.target || '', av.pct == null ? '' : av.fatto,
      av.pct == null ? '' : Math.round(av.pct * 10) / 10, a.unita, st.km, st.kmDaVer || '', st.ore, st.giorni.size, st.giorniUomo.size, st.prima || '', st.ultima || '']);
    const per = {};
    let cum = 0;
    a.voci.slice().sort((x, y) => x.dataISO.localeCompare(y.dataISO)).forEach(v => {
      const k = v.anno * 100 + v.week;
      const w = per[k] || (per[k] = { anno: v.anno, week: v.week, km: 0, ore: 0, g: new Set(), o: new Set(), t: 0, f: 0, tg: new Set(), cum: 0, inP: false });
      if (!m.range.al || v.dataISO <= m.range.al) cum += v.km;
      w.cum = cum;
      if (!_avInPeriodo(v.dataISO, m.range)) return;
      w.inP = true; w.km += v.km; w.ore += v.ore; w.g.add(v.dataISO); w.o.add(v.operatore);
      const g = v.dataISO + '|' + v.operatore;
      if (a.kpi && a.kpi.perGiorno[g] != null) { w.f += v.km; if (!w.tg.has(g)) { w.tg.add(g); w.t += a.kpi.perGiorno[g]; } }
    });
    Object.keys(per).sort((x, y) => x - y).forEach(k => {
      const w = per[k];
      if (!w.inP) return;
      if (a.kpi) prog.push([a.nome, w.week, w.anno, w.g.size, [...w.o].join(', '), w.ore, w.km, w.t || '', w.t ? Math.round(w.f / w.t * 1000) / 10 : '']);
      else prog.push([a.nome, w.week, w.anno, w.g.size, [...w.o].join(', '), w.ore, w.km, w.cum, tk.target > 0 ? Math.round(w.cum / tk.target * 1000) / 10 : '']);
    });
    a.vp.slice().sort((x, y) => x.dataISO.localeCompare(y.dataISO) || x.operatore.localeCompare(y.operatore))
      .forEach(v => gg.push([a.nome, v.dataISO, v.week, v.operatore, v.squadra, v.ticket, v.ore, v.km, v.km ? (v.fonte === 'jira' ? 'da verificare' : (v.fonte || '')) : '']));
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(riep), 'Per attività');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prog), 'Progressivo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gg), 'Giorni');
  XLSX.writeFile(wb, ('avanzamento_' + m.commessa + '_' + c.nome).replace(/[^\w\-]+/g, '_') + '.xlsx');
}
