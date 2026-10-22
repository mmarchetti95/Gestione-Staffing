/* ==================== CONTROLLO ANOMALIE PRODUZIONE · MOTORE ====================
   Modulo PURO: niente DOM, niente globali, niente chiamate di rete. Riceve tutto in
   `input` (Griglia della settimana già appiattita in celle, worklog Jira, Epic dei
   sottotask, indice dei sottotask della Griglia) e restituisce l'elenco delle anomalie
   con la correzione proposta. Stessa regola del solver di Auto-pianifica: tenerlo
   puro, così può diventare uno strumento di un agente LLM o girare in una Edge
   Function programmata.

   Le correzioni sono SOLO proposte. `azione` descrive cosa farebbe un click
   dell'utente (sempre locale: una cella di Griglia); su Jira non si scrive mai da qui.

   input = {
     anno, week,
     giorniLabel: ['Lun 28/09', ...],            6 etichette
     giorniValutabili: [0..5],                   giorni già conclusi (worklog attesi)
     celle: [{ commessa, squadra, operatore, giorno, cpKey,
               voci: [{ cantiere, attivita, subtask: {key, url} | null }],
               ferie: 'ferie' | 'non_disponibile' | null }],
     worklog: { operatore: { giorno: { hours, tickets: [{key, url, hours, summary, epic: {key,name,url}|null}] } } } | null,
     verificati: [operatore],                    operatori di cui si sono letti i worklog
     epicDiSottotask: { subtaskKey: { epicKey, epicName, taskKey, taskSummary } },
     sottotaskIndex: { subtaskKey: { commessa, cantiere, operatore, attivita, anno, week } },
                                                 sottotask di TUTTA la Griglia (non solo la settimana)
     mysond: { operatore: { giorno: { ore, dettaglio: [{ commessa, voce, att1, att2, descrizione, ore }] } } } | null,
                                                 ore MySond della settimana (null = non caricate)
     soglie: { ... }                             vedi CPA_SOGLIE_DEFAULT
   }
*/

const CPA_TIPI = {
  pianificato_senza_worklog:    { icona: '⏱', etichetta: 'Pianificati senza worklog',
    descrizione: 'In Griglia per un giorno già passato, ma senza ore su Jira.' },
  worklog_senza_pianificazione: { icona: '👻', etichetta: 'Worklog senza pianificazione',
    descrizione: 'Ore su Jira in un giorno senza cantiere in Griglia (o in ferie). Propone la cella da aggiungere.' },
  epic_diverso:                 { icona: '🟣', etichetta: 'Epic diverso dalla Griglia',
    descrizione: 'Ore su un ticket di un Epic diverso da quello dei cantieri pianificati quel giorno.' },
  ore_squadra:                  { icona: '⚖️', etichetta: 'Ore diverse in squadra',
    descrizione: 'Operatori della stessa squadra, nello stesso giorno, con ore Jira diverse.' },
  mysond_diverso:               { icona: '🧾', etichetta: 'Jira diverso da MySond',
    descrizione: 'Ore Jira del giorno diverse dalle ore lavorate in MySond. Viaggio e ore non lavorate non vanno su Jira: Jira è in regola fra le ore di lavoro senza viaggio e quelle con il viaggio.' },
};

const CPA_SOGLIE_DEFAULT = {
  oreMinime: 0.25,      // sotto questa soglia un giorno vale "senza worklog"
  diffOreSquadra: 1,    // scarto (h) fra il massimo della squadra e un operatore oltre cui segnalare
  diffOreAlta: 3,       // scarto da cui la gravità passa a "media"
  diffOreMysond: 0.5,   // scarto (h) fra Jira e MySond oltre cui segnalare
};

const CPA_GRAVITA_ORD = { alta: 0, media: 1, bassa: 2 };

function _cpaNum(v) {
  const n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? null : n;
}

function _cpaFmt(n) {
  if (n == null) return '—';
  const r = Math.abs(n) >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}

function _cpaId(tipo, input, parti) {
  return [tipo, input.anno, input.week].concat(parti).join('|||');
}

function _cpaCantieriCella(c) {
  return [...new Set((c.voci || []).map(v => v.cantiere))];
}

function _cpaNormTxt(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

/* Dove sta un ticket in Griglia: sottotask creato dalla Griglia (di qualunque settimana),
   oppure Task padre di un sottotask della settimana. null = non riconducibile. */
function _cpaDoveTicket(input, t) {
  const s = input.sottotaskIndex[t.key];
  if (s) return { commessa: s.commessa, cantiere: s.cantiere, attivita: s.attivita || '', operatore: s.operatore,
    fonte: 'sottotask', anno: s.anno, week: s.week };
  const sub = Object.keys(input.epicDiSottotask).find(k => input.epicDiSottotask[k].taskKey === t.key && input.sottotaskIndex[k]);
  if (sub) {
    const x = input.sottotaskIndex[sub];
    return { commessa: x.commessa, cantiere: x.cantiere, attivita: x.attivita || '', operatore: x.operatore, fonte: 'task' };
  }
  return null;
}

/* Ticket del giorno con la loro posizione in Griglia, per il confronto "Griglia | Jira" */
function _cpaTicketJira(input, tickets) {
  return (tickets || []).map(t => ({
    key: t.key, url: t.url || '', summary: t.summary || '', hours: _cpaNum(t.hours) || 0,
    epic: t.epic || null, dove: _cpaDoveTicket(input, t),
  }));
}

/* Pianificazione della settimana di un operatore, giorno per giorno (per il confronto) */
function _cpaSettimanaOperatore(input, op) {
  const out = [];
  for (let g = 0; g < 6; g++) {
    const celle = (input.celle || []).filter(c => c.operatore === op && c.giorno === g);
    const ferie = (celle.find(c => c.ferie) || {}).ferie || input.ferieDi(op, g);
    const voci = cc => cc.flatMap(c => (c.voci || []).map(v => ({ commessa: c.commessa, squadra: c.squadra, cantiere: v.cantiere, attivita: v.attivita || '' })));
    out.push({
      giorno: g, ferie: ferie || null,
      voci: voci(celle.filter(c => !c.ferie)),
      vociInFerie: voci(celle.filter(c => c.ferie)),   // cella compilata ma giorno segnato assente
    });
  }
  return out;
}

function _cpaDedupVoci(voci) {
  const visti = new Set();
  return voci.filter(v => {
    const k = _cpaNormTxt(v.commessa) + '|' + _cpaNormTxt(v.cantiere) + '|' + _cpaNormTxt(v.attivita);
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

/* ---------- 1) Pianificato senza worklog ---------- */

function _cpaControllaSenzaWorklog(input, out, perOpGiorno, wl, ore) {
  const S = input.soglie;
  const verificati = new Set(input.verificati || []);
  const valutabili = new Set(input.giorniValutabili || []);
  Object.keys(perOpGiorno).forEach(k => {
    const celle = perOpGiorno[k].filter(c => !c.ferie);
    if (!celle.length) return;
    const op = celle[0].operatore, g = celle[0].giorno;
    if (!verificati.has(op) || !valutabili.has(g)) return;
    const h = ore(op, g);
    if (h >= S.oreMinime) return;
    const cantieri = [...new Set(celle.flatMap(_cpaCantieriCella))];
    const commesse = celle.map(c => c.commessa).filter((x, i, a) => a.indexOf(x) === i);
    const sottotask = celle.flatMap(c => (c.voci || []).map(v => v.subtask).filter(Boolean));
    const ticket = ((wl(op, g) || {}).tickets || []);
    const dove = sottotask.length
      ? 'sul sottotask ' + sottotask.map(s => s.key).join(' / ')
      : 'sul ticket del cantiere ' + cantieri.join(', ');
    out.push({
      id: _cpaId('pianificato_senza_worklog', input, [op, g]),
      tipo: 'pianificato_senza_worklog', gravita: 'media',
      commessa: celle[0].commessa, squadra: celle[0].squadra, operatore: op, giorno: g,
      cpKey: celle[0].cpKey, cantiere: cantieri.join(', '),
      titolo: op + ' è in Griglia ma non ha ore su Jira',
      dettaglio: 'Pianificato su ' + cantieri.join(', ') + ' (' + commesse.join(', ') + '), worklog del giorno: ' + _cpaFmt(h) + ' h.',
      correzione: 'Chiedere a ' + op + ' di registrare le ore di ' + input.giorniLabel[g] + ' ' + dove +
        '. Se invece quel giorno era assente, segnarlo in Ferie (la cella esce dal controllo).',
      confronto: {
        griglia: celle.flatMap(c => (c.voci || []).map(v => ({ commessa: c.commessa, squadra: c.squadra, cantiere: v.cantiere, attivita: v.attivita || '', subtask: v.subtask }))),
        jira: _cpaTicketJira(input, ticket),
        oreJira: h,
      },
      azione: null,
      solleciti: [{ operatore: op, giorno: g, commesse, cantieri, oreRegistrate: Math.round(h * 100) / 100, oreAttese: null,
        sottotask: sottotask.map(s => s.key), ticket: ticket.map(t => t.key) }],
      link: sottotask.map(s => ({ label: s.key, url: s.url })),
    });
  });
}

/* ---------- 2) Worklog senza pianificazione ---------- */

/* Cella da proporre: i cantieri dei ticket riconosciuti; altrimenti il cantiere della
   settimana con lo stesso Epic del ticket; altrimenti quello del giorno pianificato più
   vicino. `certezza` dice all'utente quanto fidarsi della proposta. */
function _cpaProposta(input, op, g, jira, settimana) {
  const daTicket = _cpaDedupVoci(jira.filter(t => t.dove).map(t => ({ commessa: t.dove.commessa, cantiere: t.dove.cantiere, attivita: t.dove.attivita })));
  if (daTicket.length) return { voci: daTicket, certezza: 'alta', fonte: 'Cantiere del sottotask su cui ha registrato le ore.' };

  const epicTk = new Set(jira.map(t => t.epic && t.epic.key).filter(Boolean));
  if (epicTk.size) {
    const stessoEpic = [];
    (input.celle || []).forEach(c => {
      if (c.operatore !== op || c.ferie) return;
      (c.voci || []).forEach(v => {
        const e = v.subtask && input.epicDiSottotask[v.subtask.key];
        if (e && e.epicKey && epicTk.has(e.epicKey)) stessoEpic.push({ commessa: c.commessa, cantiere: v.cantiere, attivita: v.attivita || '' });
      });
    });
    if (stessoEpic.length) return { voci: _cpaDedupVoci(stessoEpic), certezza: 'media', fonte: 'Cantiere della settimana con lo stesso Epic del ticket.' };
  }

  const inFerie = (settimana[g] || {}).vociInFerie || [];
  if (inFerie.length) return { voci: _cpaDedupVoci(inFerie.map(v => ({ commessa: v.commessa, cantiere: v.cantiere, attivita: v.attivita }))),
    certezza: 'media', fonte: 'Cantiere già in Griglia quel giorno, ma il giorno è segnato assente.' };

  for (let d = 1; d < 6; d++) {
    for (const gg of [g - d, g + d]) {
      const s = settimana[gg];
      if (s && s.voci.length) return { voci: _cpaDedupVoci(s.voci.map(v => ({ commessa: v.commessa, cantiere: v.cantiere, attivita: v.attivita }))),
        certezza: 'bassa', fonte: 'Cantiere di ' + input.giorniLabel[gg] + ' (giorno pianificato più vicino): verificare.' };
    }
  }
  return { voci: [], certezza: 'nessuna', fonte: 'Ticket non collegato a un cantiere della Griglia: indicare commessa e cantiere.' };
}

function _cpaControllaSenzaPianificazione(input, out, perOpGiorno, wl) {
  const S = input.soglie;
  (input.verificati || []).forEach(op => {
    let settimana = null;
    for (let g = 0; g < 6; g++) {
      const d = wl(op, g);
      const h = d ? (_cpaNum(d.hours) || 0) : 0;
      if (h < S.oreMinime) continue;
      const celle = perOpGiorno[op + '|||' + g] || [];
      if (celle.some(c => !c.ferie)) continue;
      settimana = settimana || _cpaSettimanaOperatore(input, op);
      const assenza = settimana[g].ferie;
      const jira = _cpaTicketJira(input, d.tickets);
      const prop = _cpaProposta(input, op, g, jira, settimana);
      const assTxt = assenza === 'non_disponibile' ? 'non disponibile' : 'in ferie';
      const doveJira = jira.map(t => t.dove ? t.dove.cantiere + ' (' + t.dove.commessa + ')' : t.key).filter((x, i, a) => a.indexOf(x) === i).join(', ');
      out.push({
        id: _cpaId('worklog_senza_pianificazione', input, [op, g]),
        tipo: 'worklog_senza_pianificazione', gravita: assenza ? 'alta' : 'media',
        commessa: prop.voci.length ? prop.voci[0].commessa : '', squadra: '', operatore: op, giorno: g,
        cpKey: null, cantiere: prop.voci.map(v => v.cantiere).join(', '),
        titolo: assenza
          ? op + ' ha ' + _cpaFmt(h) + ' h su Jira ma in Griglia risulta ' + assTxt
          : op + ' ha ' + _cpaFmt(h) + ' h su Jira ma nessun cantiere in Griglia',
        dettaglio: 'In Griglia: ' + (assenza ? assTxt : 'nessun cantiere') + '. Su Jira: ' + (doveJira || '—') + '.',
        correzione: assenza
          ? 'Se ha lavorato davvero, togliere l\'assenza e aggiungere la cella in Griglia (proposta sotto); altrimenti il worklog è sul giorno sbagliato e va spostato su Jira.'
          : 'Aggiungere la cella in Griglia (proposta sotto); se invece il worklog è sul giorno sbagliato, correggerne la data su Jira.',
        confronto: { settimana, giorno: g, assenza: assenza || null, jira, oreJira: h },
        azione: { tipo: 'aggiungi_griglia', operatore: op, giorno: g, togliAssenza: !!assenza,
          voci: prop.voci, certezza: prop.certezza, fonte: prop.fonte },
        link: jira.map(t => ({ label: t.key, url: t.url })),
      });
    }
  });
}

/* ---------- 3) Epic diverso ---------- */

function _cpaControllaEpic(input, out, perOpGiorno, wl, nonVerificabili) {
  const verificati = new Set(input.verificati || []);
  Object.keys(perOpGiorno).forEach(k => {
    const celle = perOpGiorno[k].filter(c => !c.ferie);
    if (!celle.length) return;
    const op = celle[0].operatore, g = celle[0].giorno;
    if (!verificati.has(op)) return;
    const d = wl(op, g);
    const tickets = (d && d.tickets) || [];
    if (!tickets.length) return;
    const pianificati = {};   // epicKey -> nome
    const griglia = [];
    celle.forEach(c => (c.voci || []).forEach(v => {
      const e = v.subtask && input.epicDiSottotask[v.subtask.key];
      griglia.push({ commessa: c.commessa, squadra: c.squadra, cantiere: v.cantiere, attivita: v.attivita || '', subtask: v.subtask,
        epic: e && e.epicKey ? { key: e.epicKey, name: e.epicName || e.epicKey } : null });
      if (e && e.epicKey) pianificati[e.epicKey] = e.epicName || e.epicKey;
    }));
    const epicKeys = Object.keys(pianificati);
    if (!epicKeys.length) { nonVerificabili.epicSenzaSottotask++; return; }
    const fuori = tickets.filter(t => t.epic && t.epic.key && !pianificati[t.epic.key]);
    if (!fuori.length) return;
    const sottotaskAttesi = celle.flatMap(c => (c.voci || []).map(v => v.subtask).filter(Boolean));
    const oreFuori = fuori.reduce((a, t) => a + (_cpaNum(t.hours) || 0), 0);
    const jira = _cpaTicketJira(input, tickets).map(t => Object.assign(t, { fuori: fuori.some(f => f.key === t.key) }));
    out.push({
      id: _cpaId('epic_diverso', input, [op, g, fuori.map(t => t.key).sort().join(',')]),
      tipo: 'epic_diverso', gravita: 'alta',
      commessa: celle[0].commessa, squadra: celle[0].squadra, operatore: op, giorno: g,
      cpKey: celle[0].cpKey, cantiere: [...new Set(celle.flatMap(_cpaCantieriCella))].join(', '),
      titolo: _cpaFmt(oreFuori) + ' h di ' + op + ' su un Epic diverso da quello in Griglia',
      dettaglio: 'Worklog: ' + fuori.map(t => t.key + ' → Epic ' + (t.epic.name || t.epic.key) + ' (' + _cpaFmt(_cpaNum(t.hours)) + ' h)').join('; ') +
        '. In Griglia: Epic ' + epicKeys.map(ek => pianificati[ek]).join(', ') + '.',
      correzione: 'Spostare su Jira il worklog da ' + fuori.map(t => t.key).join(', ') + ' al sottotask ' +
        sottotaskAttesi.map(s => s.key).join(' / ') + ', oppure, se il lavoro era davvero su quell\'Epic, correggere il cantiere in Griglia.',
      confronto: { griglia, jira, oreJira: _cpaNum(d.hours) || 0 },
      azione: null,
      link: fuori.filter(t => t.epic.url).map(t => ({ label: 'Epic ' + (t.epic.name || t.epic.key), url: t.epic.url })),
    });
  });
}

/* ---------- 4) Ore diverse fra operatori della stessa squadra ---------- */

/* Stessa commessa + squadra + giorno: le ore Jira del giorno (totale, come la colonna "Ore
   Jira") dovrebbero essere simili. Si escludono dal confronto gli operatori a zero ore (già
   in "Pianificati senza worklog") e chi quel giorno è su più squadre (il totale del giorno
   non è confrontabile). */
function _cpaControllaOreSquadra(input, out, wl, ore) {
  const S = input.soglie;
  const verificati = new Set(input.verificati || []);
  const valutabili = new Set(input.giorniValutabili || []);
  const squadreDi = {};   // operatore|||giorno -> Set(commessa|||squadra)
  const gruppi = {};
  (input.celle || []).forEach(c => {
    if (c.ferie) return;
    const kOp = c.operatore + '|||' + c.giorno;
    (squadreDi[kOp] = squadreDi[kOp] || new Set()).add(c.commessa + '|||' + c.squadra);
    if (!valutabili.has(c.giorno)) return;
    const k = c.commessa + '|||' + c.squadra + '|||' + c.giorno;
    const G = gruppi[k] = gruppi[k] || { commessa: c.commessa, squadra: c.squadra, giorno: c.giorno, celle: [] };
    if (!G.celle.some(x => x.operatore === c.operatore)) G.celle.push(c);
  });
  Object.keys(gruppi).forEach(k => {
    const G = gruppi[k];
    const membri = G.celle.filter(c => verificati.has(c.operatore)).map(c => ({
      operatore: c.operatore, cpKey: c.cpKey, ore: Math.round(ore(c.operatore, G.giorno) * 100) / 100,
      piuSquadre: squadreDi[c.operatore + '|||' + G.giorno].size > 1,
      cantieri: _cpaCantieriCella(c),
      ticket: (((wl(c.operatore, G.giorno) || {}).tickets) || []).map(t => t.key),
    }));
    const conf = membri.filter(m => !m.piuSquadre && m.ore >= S.oreMinime);
    if (conf.length < 2) return;
    const max = Math.max.apply(null, conf.map(m => m.ore));
    const min = Math.min.apply(null, conf.map(m => m.ore));
    if (max - min < S.diffOreSquadra - 1e-9) return;
    const bassi = conf.filter(m => max - m.ore >= S.diffOreSquadra - 1e-9);
    membri.forEach(m => { m.basso = bassi.includes(m); m.escluso = !conf.includes(m); });
    membri.sort((a, b) => b.ore - a.ore);
    const cantieri = [...new Set(G.celle.flatMap(_cpaCantieriCella))];
    out.push({
      id: _cpaId('ore_squadra', input, [G.commessa, G.squadra, G.giorno]),
      tipo: 'ore_squadra', gravita: (max - min >= S.diffOreAlta - 1e-9) ? 'media' : 'bassa',
      commessa: G.commessa, squadra: G.squadra, operatore: bassi.map(m => m.operatore).join(' + '), giorno: G.giorno,
      cpKey: bassi[0].cpKey, cantiere: cantieri.join(', '),
      titolo: G.squadra + ': ore da ' + _cpaFmt(min) + ' a ' + _cpaFmt(max) + ' h (scarto ' + _cpaFmt(Math.round((max - min) * 100) / 100) + ' h)',
      dettaglio: membri.map(m => m.operatore + ' ' + (m.escluso ? (m.piuSquadre ? '(su più squadre)' : '0 h') : _cpaFmt(m.ore) + ' h')).join(' · ') + '.',
      correzione: 'Chiedere a ' + bassi.map(m => m.operatore).join(', ') + ' se mancano ore di ' + input.giorniLabel[G.giorno] +
        ' (il collega più alto ne ha ' + _cpaFmt(max) + '). Se hanno davvero lavorato meno (permesso, rientro anticipato), nessuna correzione.',
      confronto: { membri, max, min },
      azione: null,
      solleciti: bassi.map(m => ({ operatore: m.operatore, giorno: G.giorno, commesse: [G.commessa], cantieri: m.cantieri,
        oreRegistrate: m.ore, oreAttese: max, sottotask: [], ticket: m.ticket })),
      link: [],
    });
  });
}

/* ---------- 5) Ore Jira diverse dalle ore MySond ---------- */

/* Nella norma su Jira non vanno né le ore di viaggio (attività "Viaggio …") né le ore non
   lavorate (commessa "ORE NON LAVORATE": ferie, permessi). */
function cpaMysondViaggio(v) { return /viaggi/i.test(String(v.att1 || '') + ' ' + String(v.att2 || '')); }
function cpaMysondNonLavorata(v) { return /non lavorat/i.test(String(v.commessa || '')); }

/* Giorno MySond diviso in lavoro / viaggio / non lavorate, con le voci etichettate */
function cpaMysondRipartisci(rec) {
  const m = { totale: 0, lavoro: 0, viaggio: 0, nonLavorate: 0, voci: [] };
  const det = (rec && Array.isArray(rec.dettaglio)) ? rec.dettaglio : [];
  det.forEach(v => {
    const h = _cpaNum(v.ore) || 0;
    const tipo = cpaMysondNonLavorata(v) ? 'non_lavorate' : (cpaMysondViaggio(v) ? 'viaggio' : 'lavoro');
    m[tipo === 'non_lavorate' ? 'nonLavorate' : tipo] += h;
    m.totale += h;
    m.voci.push({ commessa: v.commessa || '', voce: v.voce || '', descrizione: v.descrizione || '', ore: h, tipo,
      attivita: [v.att1, v.att2].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' › ') });
  });
  if (!det.length && rec) m.totale = m.lavoro = _cpaNum(rec.ore) || 0;   // senza dettaglio: tutto lavoro
  ['totale', 'lavoro', 'viaggio', 'nonLavorate'].forEach(k => { m[k] = Math.round(m[k] * 100) / 100; });
  return m;
}

/* Jira è in regola fra le ore di lavoro senza viaggio e quelle con il viaggio (c'è chi il
   viaggio lo carica comunque). 0 = in regola, altrimenti lo scarto con segno (< 0: Jira sotto). */
function cpaMysondScarto(oreJira, m, tolleranza) {
  const min = m.lavoro, max = m.lavoro + m.viaggio;
  if (oreJira < min - tolleranza + 1e-9) return Math.round((oreJira - min) * 100) / 100;
  if (oreJira > max + tolleranza - 1e-9) return Math.round((oreJira - max) * 100) / 100;
  return 0;
}

/* Totale del giorno su entrambi i lati (tutte le commesse, come le colonne del Controllo
   Produzione). Si valuta solo dove MySond è caricato; Jira a zero su un giorno pianificato
   è già in "Pianificati senza worklog". */
function _cpaControllaMysond(input, out, perOpGiorno, wl, ore) {
  if (!input.mysond) return;
  const S = input.soglie;
  const valutabili = new Set(input.giorniValutabili || []);
  (input.verificati || []).forEach(op => {
    for (let g = 0; g < 6; g++) {
      const rec = (input.mysond[op] || {})[g];
      if (!rec || !valutabili.has(g)) continue;
      const m = cpaMysondRipartisci(rec);
      const h = Math.round(ore(op, g) * 100) / 100;
      const scarto = cpaMysondScarto(h, m, S.diffOreMysond);
      if (!scarto) continue;
      const celle = (perOpGiorno[op + '|||' + g] || []).filter(c => !c.ferie);
      if (h < S.oreMinime && celle.length) continue;
      const sotto = scarto < 0, zero = h < S.oreMinime;
      const ticket = ((wl(op, g) || {}).tickets) || [];
      const sottotask = celle.flatMap(c => (c.voci || []).map(v => v.subtask).filter(Boolean));
      const lavoroMs = m.voci.filter(v => v.tipo === 'lavoro');
      const cantieri = celle.length ? [...new Set(celle.flatMap(_cpaCantieriCella))] : [...new Set(lavoroMs.map(v => v.voce).filter(Boolean))];
      const commesse = celle.length ? [...new Set(celle.map(c => c.commessa))] : [...new Set(lavoroMs.map(v => v.commessa).filter(Boolean))];
      const atteso = m.viaggio > 0 ? 'fra ' + _cpaFmt(m.lavoro) + ' e ' + _cpaFmt(m.lavoro + m.viaggio) + ' h' : _cpaFmt(m.lavoro) + ' h';
      const delta = _cpaFmt(Math.abs(scarto));
      out.push({
        id: _cpaId('mysond_diverso', input, [op, g]),
        tipo: 'mysond_diverso',
        gravita: (zero || Math.abs(scarto) >= S.diffOreAlta - 1e-9) ? 'media' : 'bassa',
        commessa: celle.length ? celle[0].commessa : (commesse[0] || ''), squadra: celle.length ? celle[0].squadra : '',
        operatore: op, giorno: g, cpKey: celle.length ? celle[0].cpKey : null, cantiere: cantieri.join(', '),
        titolo: zero ? op + ' ha ' + _cpaFmt(m.lavoro) + ' h lavorate in MySond ma nessuna su Jira'
          : sotto ? op + ': ' + _cpaFmt(h) + ' h su Jira, ' + _cpaFmt(m.lavoro) + ' h lavorate in MySond (−' + delta + ' h)'
          : op + ': ' + _cpaFmt(h) + ' h su Jira, ' + _cpaFmt(m.lavoro + m.viaggio) + ' h in MySond' + (m.viaggio > 0 ? ' viaggio compreso' : '') + ' (+' + delta + ' h)',
        dettaglio: 'MySond: ' + _cpaFmt(m.lavoro) + ' h di lavoro' +
          (m.viaggio > 0 ? ', ' + _cpaFmt(m.viaggio) + ' h di viaggio' : '') +
          (m.nonLavorate > 0 ? ', ' + _cpaFmt(m.nonLavorate) + ' h non lavorate' : '') +
          '. Jira: ' + _cpaFmt(h) + ' h' + (ticket.length ? ' (' + ticket.map(t => t.key).join(', ') + ')' : '') +
          '. Atteso su Jira: ' + atteso + '.',
        correzione: sotto
          ? 'Mancano ' + delta + ' h su Jira: chiedere a ' + op + ' di registrarle' +
            (sottotask.length ? ' sul sottotask ' + sottotask.map(s => s.key).join(' / ') : '') +
            '. Se in MySond ha segnato come lavoro ore di viaggio, va corretta l\'attività in MySond ("Viaggio").'
          : 'Su Jira ci sono ' + delta + ' h in più di MySond: verificare se il worklog è duplicato o sul giorno sbagliato, oppure se mancano ore in MySond' +
            (m.nonLavorate > 0 ? ' (quel giorno MySond segna ' + _cpaFmt(m.nonLavorate) + ' h non lavorate)' : '') + '.',
        confronto: { mysond: m, jira: _cpaTicketJira(input, ticket), oreJira: h, attesoMin: m.lavoro, attesoMax: m.lavoro + m.viaggio,
          griglia: celle.flatMap(c => (c.voci || []).map(v => ({ commessa: c.commessa, squadra: c.squadra, cantiere: v.cantiere, attivita: v.attivita || '', subtask: v.subtask }))) },
        azione: null,
        solleciti: sotto ? [{ operatore: op, giorno: g, commesse, cantieri, oreRegistrate: h, oreAttese: m.lavoro,
          sottotask: sottotask.map(s => s.key), ticket: ticket.map(t => t.key) }] : undefined,
        link: sottotask.map(s => ({ label: s.key, url: s.url })),
      });
    }
  });
}

/* ---------- Ingresso ---------- */

function cpaRileva(input) {
  const inp = Object.assign({ celle: [], epicDiSottotask: {}, sottotaskIndex: {}, giorniLabel: [], giorniValutabili: [] }, input || {});
  inp.soglie = Object.assign({}, CPA_SOGLIE_DEFAULT, (input && input.soglie) || {});
  if (typeof inp.ferieDi !== 'function') inp.ferieDi = () => null;
  const out = [];
  const nonVerificabili = { epicSenzaSottotask: 0 };
  if (inp.worklog) {
    const perOpGiorno = {};   // operatore|||giorno -> celle (tutte le commesse)
    inp.celle.forEach(c => {
      const k = c.operatore + '|||' + c.giorno;
      (perOpGiorno[k] = perOpGiorno[k] || []).push(c);
    });
    const wl = (op, g) => (inp.worklog[op] || {})[g] || null;
    const ore = (op, g) => { const d = wl(op, g); return d ? (_cpaNum(d.hours) || 0) : 0; };
    _cpaControllaSenzaWorklog(inp, out, perOpGiorno, wl, ore);
    _cpaControllaSenzaPianificazione(inp, out, perOpGiorno, wl);
    _cpaControllaEpic(inp, out, perOpGiorno, wl, nonVerificabili);
    _cpaControllaOreSquadra(inp, out, wl, ore);
    _cpaControllaMysond(inp, out, perOpGiorno, wl, ore);
  }
  const ordTipo = Object.keys(CPA_TIPI);
  out.sort((a, b) =>
    (a.giorno - b.giorno) ||
    (ordTipo.indexOf(a.tipo) - ordTipo.indexOf(b.tipo)) ||
    (CPA_GRAVITA_ORD[a.gravita] - CPA_GRAVITA_ORD[b.gravita]) ||
    String(a.commessa).localeCompare(String(b.commessa)) ||
    String(a.operatore).localeCompare(String(b.operatore)));
  const perTipo = {};
  ordTipo.forEach(t => { perTipo[t] = 0; });
  out.forEach(a => { perTipo[a.tipo]++; });
  return { anomalie: out, perTipo, nonVerificabili };
}

/* ---------- Solleciti per worklog mancanti / ore inferiori alla squadra ---------- */

/* Un gruppo per operatore con le sue giornate da sistemare, in ordine di giorno
   (una giornata sola per giorno, anche se più anomalie la toccano). */
function cpaRaggruppaSolleciti(anomalie) {
  const per = {};
  (anomalie || []).forEach(a => (a.solleciti || []).forEach(s => {
    const G = per[s.operatore] = per[s.operatore] || { operatore: s.operatore, voci: [] };
    if (!G.voci.some(v => v.giorno === s.giorno)) G.voci.push(Object.assign({ tipo: a.tipo, id: a.id }, s));
  }));
  return Object.values(per)
    .map(g => { g.voci.sort((x, y) => x.giorno - y.giorno); return g; })
    .sort((x, y) => x.operatore.localeCompare(y.operatore));
}

/* Le stesse giornate nel formato dell'azione 'solleciti' di ai-autoplan. Si passano
   solo le ore registrate, non quelle attese: il messaggio non deve citare il target. */
function cpaSollecitiPayload(gruppi, giorniLabel) {
  return gruppi.map(g => ({
    nome: g.operatore,
    voci: g.voci.map(v => ({
      giorno: giorniLabel[v.giorno] || String(v.giorno),
      commessa: v.commesse.join(', '),
      cantieri: v.cantieri.join(', '),
      ore_registrate: v.oreRegistrate,
      sottotask: v.sottotask,
      ticket: v.ticket,
    })),
  }));
}

/* Testo di base, senza AI: sempre disponibile, e punto di partenza da ritoccare. */
function cpaSollecitoBase(gruppo, giorniLabel, opt) {
  const o = opt || {};
  const righe = gruppo.voci.map(v => {
    const dove = v.cantieri.join(', ') + ' (' + v.commesse.join(', ') + ')';
    const su = v.sottotask.length ? ' — sottotask ' + v.sottotask.join(' / ') : '';
    // solo le ore registrate, mai "su Y": le ore dei colleghi sono una soglia di controllo, non l'orario dovuto
    const stato = v.oreRegistrate > 0 ? 'registrate ' + _cpaFmt(v.oreRegistrate) + ' h' : 'nessuna ora registrata';
    return '- ' + (giorniLabel[v.giorno] || '') + ': ' + dove + ', ' + stato + su;
  });
  const tutteZero = gruppo.voci.every(v => !(v.oreRegistrate > 0));
  const nome = String(gruppo.operatore || '').trim();
  return {
    oggetto: 'Ore Jira da ' + (tutteZero ? 'registrare' : 'completare') + ' — settimana ' + o.week + '/' + o.anno,
    testo: 'Ciao ' + nome + ',\n\n' +
      'dal controllo della settimana ' + o.week + ' risultano ore Jira ' + (tutteZero ? 'mancanti' : 'mancanti o incomplete') + ' per queste giornate:\n\n' +
      righe.join('\n') + '\n\n' +
      'Potresti mandarmi ' + (o.entro ? 'entro ' + o.entro + ' ' : '') + 'gli orari di lavoro effettivo, così da poter registrare correttamente l\'intervento? Se qualche giornata non è corretta (assenza, cantiere diverso) fammelo sapere, così sistemiamo la pianificazione.\n\n' +
      'Grazie' + (o.firma ? ',\n' + o.firma : ''),
  };
}

/* Testo semplice dell'elenco (per copiarlo in una mail o in chat). */
function cpaTestoCorrezioni(anomalie, giorniLabel, intestazione) {
  const righe = [intestazione || 'Correzioni proposte'];
  Object.keys(CPA_TIPI).forEach(tipo => {
    const lista = anomalie.filter(a => a.tipo === tipo);
    if (!lista.length) return;
    righe.push('', CPA_TIPI[tipo].icona + ' ' + CPA_TIPI[tipo].etichetta + ' (' + lista.length + ')');
    lista.forEach(a => {
      righe.push('- ' + (giorniLabel[a.giorno] || '') + ' · ' + [a.commessa, a.squadra].filter(Boolean).join(' / ') + ' · ' + a.titolo);
      righe.push('  ' + a.dettaglio);
      righe.push('  ' + a.correzione);
    });
  });
  return righe.join('\n');
}
