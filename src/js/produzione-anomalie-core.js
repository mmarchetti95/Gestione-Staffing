/* ==================== CONTROLLO ANOMALIE PRODUZIONE · MOTORE ====================
   Modulo PURO: niente DOM, niente globali, niente chiamate di rete. Riceve tutto in
   `input` (Griglia della settimana già appiattita in celle, worklog Jira, righe di
   controllo_produzione, Epic dei sottotask, modello di produttività) e restituisce
   l'elenco delle anomalie con la correzione proposta. Stessa regola del solver di
   Auto-pianifica: tenerlo puro, così può diventare uno strumento di un agente LLM o
   girare in una Edge Function programmata.

   Le correzioni sono SOLO proposte. `azione` descrive cosa farebbe un click
   dell'utente (sempre locale: Km/Cad in controllo_produzione o una cella di
   Griglia); su Jira non si scrive mai da qui. I Km corretti arrivano su Jira solo
   con "🔄 Sincronizza da Jira", che chiede conferma come sempre.

   input = {
     anno, week,
     giorniLabel: ['Lun 28/09', ...],            6 etichette
     giorniValutabili: [0..5],                   giorni già conclusi (worklog attesi)
     celle: [{ commessa, squadra, operatore, giorno, cpKey,
               voci: [{ cantiere, attivita, subtask: {key, url} | null }],
               ferie: 'ferie' | 'non_disponibile' | null }],
     worklog: { operatore: { giorno: { hours, tickets: [{key, url, hours, epic: {key,name,url}|null}] } } } | null,
     verificati: [operatore],                    operatori di cui si sono letti i worklog
     cp: { cpKey: { km_by_ticket, km_last_by_ticket, km_cad, jira_tickets } },
     epicDiSottotask: { subtaskKey: { epicKey, epicName, taskKey, taskSummary } },
     sottotaskIndex: { subtaskKey: { commessa, cantiere, operatore, attivita } },
     modello,                                    apBuildModello() (può mancare)
     famigliaDi: attivita -> famiglia | null,    tipicamente apTrovaFamiglia(modello, ·)
     soglie: { ... }                             vedi CPA_SOGLIE_DEFAULT
   }
*/

const CPA_TIPI = {
  pianificato_senza_worklog:     { icona: '⏱', etichetta: 'Pianificati senza worklog' },
  worklog_senza_pianificazione:  { icona: '👻', etichetta: 'Worklog senza pianificazione' },
  epic_diverso:                  { icona: '🟣', etichetta: 'Epic diverso dalla Griglia' },
  km_duplicati:                  { icona: '👯', etichetta: 'Km duplicati in squadra' },
  km_fuori_scala:                { icona: '📏', etichetta: 'Km fuori scala' },
};

const CPA_SOGLIE_DEFAULT = {
  kmAlto: 3,          // km giornata-squadra >= 3x la mediana della famiglia
  kmBasso: 0.25,      // ... o <= 1/4
  minCampioni: 3,     // giornate di storico minime perché la mediana conti
  oreMinime: 0.25,    // sotto questa soglia un giorno vale "senza worklog"
};

const CPA_GRAVITA_ORD = { alta: 0, media: 1, bassa: 2 };

function _cpaNum(v) {
  const n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? null : n;
}

function _cpaFmt(n) {
  if (n == null) return '—';
  const r = Math.abs(n) >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 1000;
  return String(r).replace('.', ',');
}

function _cpaUguali(a, b) { return Math.abs(a - b) < 1e-6; }

/* Km di una giornata-squadra come li conta il modello di stima (apBuildModello):
   valori tutti uguali su più operatori = un solo valore ripetuto, altrimenti somma. */
function _cpaKmSquadra(valori) {
  if (!valori.length) return null;
  if (valori.length > 1 && valori.every(v => _cpaUguali(v, valori[0]))) return valori[0];
  return valori.reduce((a, b) => a + b, 0);
}

function _cpaId(tipo, input, parti) {
  return [tipo, input.anno, input.week].concat(parti).join('|||');
}

function _cpaCantieriCella(c) {
  return [...new Set((c.voci || []).map(v => v.cantiere))];
}

/* ---------- Worklog vs Griglia ---------- */

function _cpaControllaWorklog(input, out, nonVerificabili) {
  if (!input.worklog) return;
  const S = input.soglie;
  const verificati = new Set(input.verificati || []);
  const valutabili = new Set(input.giorniValutabili || []);

  // operatore|||giorno -> celle (tutte le commesse)
  const perOpGiorno = {};
  (input.celle || []).forEach(c => {
    const k = c.operatore + '|||' + c.giorno;
    (perOpGiorno[k] = perOpGiorno[k] || []).push(c);
  });

  const wl = (op, g) => (input.worklog[op] || {})[g] || null;
  const ore = (op, g) => { const d = wl(op, g); return d ? (_cpaNum(d.hours) || 0) : 0; };

  // 1) Pianificati senza worklog (per operatore/giorno, solo giorni conclusi)
  Object.keys(perOpGiorno).forEach(k => {
    const celle = perOpGiorno[k].filter(c => !c.ferie);
    if (!celle.length) return;
    const op = celle[0].operatore, g = celle[0].giorno;
    if (!verificati.has(op) || !valutabili.has(g)) return;
    if (ore(op, g) >= S.oreMinime) return;
    const cantieri = [...new Set(celle.flatMap(_cpaCantieriCella))];
    const sottotask = celle.flatMap(c => (c.voci || []).map(v => v.subtask).filter(Boolean));
    const dove = sottotask.length
      ? 'sul sottotask ' + sottotask.map(s => s.key).join(' / ')
      : 'sul ticket del cantiere ' + cantieri.join(', ');
    out.push({
      id: _cpaId('pianificato_senza_worklog', input, [op, g]),
      tipo: 'pianificato_senza_worklog', gravita: 'media',
      commessa: celle[0].commessa, squadra: celle[0].squadra, operatore: op, giorno: g,
      cpKey: celle[0].cpKey, cantiere: cantieri.join(', '),
      titolo: op + ' è in Griglia ma non ha ore su Jira',
      dettaglio: 'Pianificato su ' + cantieri.join(', ') + ' (' + celle.map(c => c.commessa).filter((x, i, a) => a.indexOf(x) === i).join(', ') + '), worklog del giorno: ' + _cpaFmt(ore(op, g)) + ' h.',
      correzione: 'Chiedere a ' + op + ' di registrare le ore di ' + input.giorniLabel[g] + ' ' + dove +
        '. Se invece quel giorno era assente, segnarlo in Ferie (la cella esce dal controllo).',
      azione: null,
      link: sottotask.map(s => ({ label: s.key, url: s.url })),
    });
  });

  // 2) Worklog senza pianificazione (anche giorni futuri: ore registrate in anticipo sono comunque strane)
  verificati.forEach(op => {
    for (let g = 0; g < 6; g++) {
      const d = wl(op, g);
      const h = d ? (_cpaNum(d.hours) || 0) : 0;
      if (h < S.oreMinime) continue;
      const celle = perOpGiorno[op + '|||' + g] || [];
      const attive = celle.filter(c => !c.ferie);
      if (attive.length) continue;
      const inFerie = celle.find(c => c.ferie);
      const tickets = (d.tickets || []);
      // Il ticket è un sottotask creato dalla Griglia di questa settimana? allora si sa dove andrebbe
      const noto = tickets.map(t => ({ t, s: input.sottotaskIndex[t.key] })).find(x => x.s && x.s.operatore === op);
      const elencoTk = tickets.map(t => t.key + ' (' + _cpaFmt(_cpaNum(t.hours)) + ' h' + (t.epic ? ', Epic ' + (t.epic.name || t.epic.key) : '') + ')').join('; ');
      let correzione, azione = null;
      if (inFerie) {
        correzione = 'Il giorno risulta ' + (inFerie.ferie === 'ferie' ? 'in ferie' : 'non disponibile') +
          ': o le ore sono sul giorno sbagliato (correggere la data del worklog su Jira), o l\'assenza in Ferie è da togliere e la cella da pianificare.';
      } else if (noto) {
        correzione = 'Il ticket ' + noto.t.key + ' è il sottotask di ' + op + ' su ' + noto.s.cantiere +
          (noto.s.attivita ? ' (' + noto.s.attivita + ')' : '') + ', commessa ' + noto.s.commessa +
          ': probabilmente manca la cella in Griglia. In alternativa il worklog è sul giorno sbagliato.';
        azione = { tipo: 'aggiungi_griglia', etichetta: '＋ Aggiungi in Griglia', commessa: noto.s.commessa,
          operatore: op, giorno: g, cantiere: noto.s.cantiere, attivita: noto.s.attivita || '' };
      } else {
        correzione = 'Verificare su Jira i ticket ' + tickets.map(t => t.key).join(', ') +
          ': manca la pianificazione in Griglia oppure il worklog è sul giorno sbagliato.';
      }
      out.push({
        id: _cpaId('worklog_senza_pianificazione', input, [op, g]),
        tipo: 'worklog_senza_pianificazione', gravita: inFerie ? 'alta' : 'media',
        commessa: noto ? noto.s.commessa : '', squadra: '', operatore: op, giorno: g,
        cpKey: null, cantiere: noto ? noto.s.cantiere : '',
        titolo: inFerie
          ? op + ' ha ' + _cpaFmt(h) + ' h su Jira in un giorno di assenza'
          : op + ' ha ' + _cpaFmt(h) + ' h su Jira ma nessun cantiere in Griglia',
        dettaglio: 'Ticket: ' + (elencoTk || '—') + '.',
        correzione, azione,
        link: tickets.map(t => ({ label: t.key, url: t.url })),
      });
    }
  });

  // 3) Epic dei worklog diverso dall'Epic dei cantieri pianificati
  Object.keys(perOpGiorno).forEach(k => {
    const celle = perOpGiorno[k].filter(c => !c.ferie);
    if (!celle.length) return;
    const op = celle[0].operatore, g = celle[0].giorno;
    if (!verificati.has(op)) return;
    const d = wl(op, g);
    const tickets = (d && d.tickets) || [];
    if (!tickets.length) return;
    const pianificati = {};   // epicKey -> { name, voci: [cantiere (sottotask)] }
    celle.forEach(c => (c.voci || []).forEach(v => {
      const e = v.subtask && input.epicDiSottotask[v.subtask.key];
      if (!e || !e.epicKey) return;
      (pianificati[e.epicKey] = pianificati[e.epicKey] || { name: e.epicName || e.epicKey, voci: [] })
        .voci.push(v.cantiere + ' (' + v.subtask.key + ')');
    }));
    const epicKeys = Object.keys(pianificati);
    if (!epicKeys.length) { nonVerificabili.epicSenzaSottotask++; return; }
    const fuori = tickets.filter(t => t.epic && t.epic.key && !pianificati[t.epic.key]);
    if (!fuori.length) return;
    const atteso = epicKeys.map(ek => pianificati[ek].name + ' → ' + pianificati[ek].voci.join(', ')).join('; ');
    const sottotaskAttesi = celle.flatMap(c => (c.voci || []).map(v => v.subtask).filter(Boolean));
    const oreFuori = fuori.reduce((a, t) => a + (_cpaNum(t.hours) || 0), 0);
    out.push({
      id: _cpaId('epic_diverso', input, [op, g, fuori.map(t => t.key).sort().join(',')]),
      tipo: 'epic_diverso', gravita: 'alta',
      commessa: celle[0].commessa, squadra: celle[0].squadra, operatore: op, giorno: g,
      cpKey: celle[0].cpKey, cantiere: [...new Set(celle.flatMap(_cpaCantieriCella))].join(', '),
      titolo: _cpaFmt(oreFuori) + ' h di ' + op + ' su un Epic diverso da quello in Griglia',
      dettaglio: 'Worklog: ' + fuori.map(t => t.key + ' → Epic ' + (t.epic.name || t.epic.key) + ' (' + _cpaFmt(_cpaNum(t.hours)) + ' h)').join('; ') +
        '. In Griglia: Epic ' + atteso + '.',
      correzione: 'Spostare su Jira il worklog da ' + fuori.map(t => t.key).join(', ') + ' al sottotask ' +
        sottotaskAttesi.map(s => s.key).join(' / ') + ', oppure, se il lavoro era davvero su quell\'Epic, correggere il cantiere in Griglia.',
      azione: null,
      link: fuori.map(t => ({ label: t.key, url: t.url }))
        .concat(fuori.filter(t => t.epic.url).map(t => ({ label: 'Epic ' + (t.epic.name || t.epic.key), url: t.epic.url })))
        .concat(sottotaskAttesi.map(s => ({ label: s.key + ' (Griglia)', url: s.url }))),
    });
  });
}

/* ---------- Km ---------- */

function _cpaKmCella(input, c) {
  const r = input.cp[c.cpKey];
  if (!r) return null;
  const by = (r.km_by_ticket && typeof r.km_by_ticket === 'object') ? r.km_by_ticket : {};
  const vals = Object.keys(by).map(t => ({ ticket: t, km: _cpaNum(by[t]) })).filter(x => x.km != null && x.km > 0);
  const tot = vals.length ? vals.reduce((a, x) => a + x.km, 0) : (_cpaNum(r.km_cad) || 0);
  if (!(tot > 0)) return null;
  const last = (r.km_last_by_ticket && typeof r.km_last_by_ticket === 'object') ? r.km_last_by_ticket : {};
  return { tot: Math.round(tot * 1000) / 1000, perTicket: vals, suJira: vals.some(x => last[x.ticket] != null) };
}

function _cpaControllaKm(input, out, nonVerificabili) {
  const S = input.soglie;
  const gruppi = {};   // commessa|||squadra|||giorno -> celle con km
  (input.celle || []).forEach(c => {
    if (c.ferie) return;
    const km = _cpaKmCella(input, c);
    const k = c.commessa + '|||' + c.squadra + '|||' + c.giorno;
    const G = gruppi[k] = gruppi[k] || { commessa: c.commessa, squadra: c.squadra, giorno: c.giorno, celle: [] };
    G.celle.push({ c, km });
  });

  Object.keys(gruppi).forEach(k => {
    const G = gruppi[k];
    const conKm = G.celle.filter(x => x.km);
    if (!conKm.length) return;

    // 4) Duplicati: stesso valore su più operatori che condividono un cantiere
    const duplicati = new Set();
    const visti = new Set();
    conKm.forEach((a, i) => {
      if (visti.has(i)) return;
      const cantA = new Set(_cpaCantieriCella(a.c));
      const gruppo = [a];
      conKm.forEach((b, j) => {
        if (j <= i || visti.has(j)) return;
        if (!_cpaUguali(a.km.tot, b.km.tot)) return;
        if (!_cpaCantieriCella(b.c).some(x => cantA.has(x))) return;
        gruppo.push(b); visti.add(j);
      });
      if (gruppo.length < 2) return;
      gruppo.forEach(x => duplicati.add(x.c.cpKey));
      const ops = gruppo.map(x => x.c.operatore);
      const giaSuJira = gruppo.filter(x => x.km.suJira).map(x => x.c.operatore);
      out.push({
        id: _cpaId('km_duplicati', input, [G.commessa, G.squadra, G.giorno, ops.slice().sort().join(',')]),
        tipo: 'km_duplicati', gravita: giaSuJira.length > 1 ? 'alta' : 'media',
        commessa: G.commessa, squadra: G.squadra, operatore: ops.join(' + '), giorno: G.giorno,
        cpKey: gruppo[0].c.cpKey, cantiere: _cpaCantieriCella(a.c).join(', '),
        titolo: _cpaFmt(a.km.tot) + ' km ripetuti su ' + ops.length + ' operatori della stessa squadra',
        dettaglio: 'La produzione è della squadra: ripetuta su ' + ops.join(', ') + ' viene contata ' + ops.length +
          ' volte nel Task padre su Jira.' + (giaSuJira.length ? ' Già scritta su Jira per: ' + giaSuJira.join(', ') + '.' : ''),
        correzione: 'Tenere i km su un solo operatore e mettere 0 sugli altri. ' +
          (giaSuJira.length ? 'Alla prossima "Sincronizza da Jira" verrà tolta la quota in eccesso (con conferma).' : 'Nessun valore è ancora su Jira.'),
        azione: { tipo: 'tieni_km', scelte: gruppo.map(x => ({
          tieni: x.c.operatore,
          azzera: gruppo.filter(y => y !== x).map(y => ({ cpKey: y.c.cpKey, operatore: y.c.operatore, tickets: y.km.perTicket.map(t => t.ticket) })),
        })) },
        link: [],
      });
    });

    // 5) Fuori scala rispetto alla mediana della famiglia di attività
    if (!input.modello || typeof input.famigliaDi !== 'function') return;
    const attivita = [...new Set(G.celle.flatMap(x => (x.c.voci || []).map(v => v.attivita)).filter(Boolean))];
    const famiglie = [...new Set(attivita.map(a => input.famigliaDi(a)).filter(Boolean))];
    if (famiglie.length !== 1) { nonVerificabili.kmSenzaFamiglia++; return; }
    const F = input.modello.famiglie[famiglie[0]];
    if (!F || !(F.kmGiorno > 0) || F.campioni < S.minCampioni) { nonVerificabili.kmSenzaFamiglia++; return; }
    const km = _cpaKmSquadra(conKm.map(x => x.km.tot));
    const ratio = km / F.kmGiorno;
    if (ratio < S.kmAlto && ratio > S.kmBasso) return;
    const alto = ratio >= S.kmAlto;
    // Errore tipico: virgola/unità spostata di 10, 100 o 1000
    // (solo per scarti estremi: a 3-5 volte la mediana un "x10" sarebbe un tiro a caso)
    let proposto = null;
    if (ratio >= 8 || ratio <= 1 / 8) [10, 100, 1000].some(f => {
      const v = alto ? km / f : km * f;
      if (v / F.kmGiorno <= 2 && v / F.kmGiorno >= 0.5) { proposto = Math.round(v * 1000) / 1000; return true; }
      return false;
    });
    // Correzione applicabile con un click solo se il valore sta in una sola cella e un solo ticket
    const singola = conKm.length === 1 && conKm[0].km.perTicket.length === 1 && !duplicati.has(conKm[0].c.cpKey) ? conKm[0] : null;
    const att = attivita.join(', ');
    out.push({
      id: _cpaId('km_fuori_scala', input, [G.commessa, G.squadra, G.giorno]),
      tipo: 'km_fuori_scala', gravita: (ratio >= S.kmAlto * 3 || ratio <= S.kmBasso / 3) ? 'alta' : 'media',
      commessa: G.commessa, squadra: G.squadra, operatore: conKm.map(x => x.c.operatore).join(' + '), giorno: G.giorno,
      cpKey: conKm[0].c.cpKey, cantiere: [...new Set(conKm.flatMap(x => _cpaCantieriCella(x.c)))].join(', '),
      titolo: _cpaFmt(km) + ' km in giornata: ' + (alto ? _cpaFmt(Math.round(ratio * 10) / 10) + ' volte ' : (ratio < 0.01 ? 'meno dell\'1% del' : 'solo il ' + Math.round(ratio * 100) + '% del')) +
        'la mediana di "' + famiglie[0] + '"',
      dettaglio: 'Attività: ' + att + '. Mediana della famiglia: ' + _cpaFmt(F.kmGiorno) + ' km per giornata-squadra (' + F.campioni + ' giornate di storico).',
      correzione: proposto != null
        ? 'Probabile errore di virgola o unità: ' + _cpaFmt(proposto) + ' invece di ' + _cpaFmt(km) + '. Verificare con il report di produzione.'
        : 'Verificare il valore con il report di produzione' + (alto ? ' (giornata eccezionale o somma di più giorni?)' : ' (giornata parziale o km mancanti?)') + '.',
      azione: (proposto != null && singola)
        ? { tipo: 'imposta_km', etichetta: 'Imposta ' + _cpaFmt(proposto), cpKey: singola.c.cpKey, operatore: singola.c.operatore,
            ticket: singola.km.perTicket[0].ticket, valore: proposto }
        : null,
      link: [],
    });
  });
}

/* ---------- Ingresso ---------- */

function cpaRileva(input) {
  const inp = Object.assign({ celle: [], cp: {}, epicDiSottotask: {}, sottotaskIndex: {}, giorniLabel: [], giorniValutabili: [] }, input || {});
  inp.soglie = Object.assign({}, CPA_SOGLIE_DEFAULT, (input && input.soglie) || {});
  const out = [];
  const nonVerificabili = { epicSenzaSottotask: 0, kmSenzaFamiglia: 0 };
  _cpaControllaWorklog(inp, out, nonVerificabili);
  _cpaControllaKm(inp, out, nonVerificabili);
  out.sort((a, b) =>
    (CPA_GRAVITA_ORD[a.gravita] - CPA_GRAVITA_ORD[b.gravita]) ||
    (a.giorno - b.giorno) ||
    String(a.commessa).localeCompare(String(b.commessa)) ||
    String(a.operatore).localeCompare(String(b.operatore)));
  const perTipo = {};
  Object.keys(CPA_TIPI).forEach(t => { perTipo[t] = 0; });
  out.forEach(a => { perTipo[a.tipo]++; });
  return { anomalie: out, perTipo, nonVerificabili };
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
      righe.push('  ' + a.correzione);
    });
  });
  return righe.join('\n');
}
