/* ==================== GRIGLIA · CONTROLLO SOTTOTASK JIRA ====================
   Bottone "🎫 Sottotask" nella toolbar della Griglia, accanto a Note/Variazioni: controlla
   tutte le celle della settimana mostrata e dice, per ogni operatore + cantiere + attività +
   GIORNO, se ha il suo sottotask Jira. Stessa unità di pwJiraSubtaskInit: dalla v18.229.0 un
   sottotask copre un solo giorno; quelli settimanali creati prima (bc.jiraSubtask) coprono
   ancora tutti i giorni della loro settimana.
   La base sono gli indicatori 🎫/⚠️ delle celle (pwJiraSubtaskMappa: tabella pw_jira_subtask
   più bc.jiraSubtask), letti in locale a ogni pwRender/aggiornamento badge: per questo il
   bottone è sempre aggiornato e immediato.
   Sopra c'è una verifica su Jira (pwJchkVerificaJira, Edge Function jira-task-status con
   soloSottotask): una chiamata per settimana che dice quali chiavi non esistono più, a chi
   è assegnato ogni sottotask e in che stato è — un sottotask cancellato o riassegnato su
   Jira lascia il suo indicatore in Griglia com'era. Parte da sola la prima volta che si
   mostra una settimana e di nuovo a ogni apertura/"Ricontrolla"; il risultato vive solo
   in memoria (_pwJchk.jira). L'assegnatario si confronta per accountId: le email degli
   operatori diventano accountId lato server (cache di sessione in _pwJchk.acc), mai per
   nome. Le correzioni toccano solo gli indicatori e solo su click, mai da sole (una
   chiave non visibile all'utenza Jira o spostata in un altro progetto risulterebbe
   "cancellata" anche se non lo è); su Jira non si scrive niente.
   Anomalie (pwJchkAnalizza):
   - mancante: nessun indicatore (con nota se all'operatore manca l'email in anagrafica,
     senza la quale il sottotask non si può creare);
   - errore: creazione fallita (indicatore ⚠️);
   - cancellato: l'indicatore c'è ma su Jira il sottotask non esiste più (di solito
     l'operatore non lavora più lì: va tolto dalla Griglia, o l'indicatore va tolto e il
     sottotask ricreato);
   - riassegnato: su Jira il sottotask è di un altro (o di nessuno). Se il nuovo
     assegnatario è in Griglia sullo stesso cantiere senza sottotask, si offre di spostargli
     l'indicatore;
   - creato: sottotask nello stato CREATED su Jira (non ancora avviato nel workflow);
   - orfano: indicatore creato/già esistente che nessuna cella usa più (cantiere, attività,
     operatore o giorno cambiati dopo la creazione): su Jira c'è un sottotask che la Griglia
     non pianifica più. Tipico con i giornalieri: l'operatore spostato da martedì a mercoledì
     lascia orfano il sottotask di martedì e scopre il mercoledì;
   - commessa: blocco senza commessa o commessa senza "Codice progetto Jira" — le sue
     celle non si possono controllare una per una.
   Sottotask fatti a mano (v18.239.0): per le giornate mancanti/in errore la verifica cerca
   anche su Jira i sottotask della settimana dei loro operatori (_pwJchkCercaManuali) e li
   abbina per progetto + accountId + giorno (+ nome del cantiere fra più candidati); la
   riga offre «🔗 collega», che scrive la riga in pw_jira_subtask come "already_exists".
   Gli operatori di un fornitore esterno (op.fornitore) non hanno sottotask: restano fuori. */

HELP_TEXTS['pw-jchk'] = 'Controlla in un colpo tutte le celle della settimana mostrata: per ogni operatore + cantiere + attività, giorno per giorno, verifica che ci sia il sottotask Jira di quel giorno (indicatore 🎫 in cella). I sottotask settimanali creati prima della v18.229.0 valgono ancora per tutti i giorni della loro settimana.\n\nVerde = tutto a posto. Rosso = assegnazioni senza sottotask, con creazione fallita, con il sottotask cancellato su Jira o riassegnato a un\'altra persona. Ambra = sottotask ancora in stato CREATED, sottotask non più collegati a nessuna cella, o commesse senza codice progetto Jira.\n\nClicca una riga (o un giorno) per andare alla cella. Il controllo è immediato sugli indicatori della Griglia; all\'apertura e con «Ricontrolla» verifica anche su Jira quali sottotask sono stati cancellati, a chi sono assegnati e in che stato sono, e cerca i sottotask creati a mano su Jira per le giornate che ne sono senza («🔗 collega»). Su Jira non viene mai scritto niente.';

const PW_JCHK_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const PW_JCHK_TIPI = {
  commessa: { sev: 'warn', ico: '🔌', label: 'commessa non collegata a Jira', plur: 'commesse non collegate a Jira' },
  errore:   { sev: 'ko',   ico: '⚠️', label: 'creazione fallita', plur: 'creazioni fallite' },
  cancellato: { sev: 'ko', ico: '🗑️', label: 'sottotask cancellato su Jira', plur: 'sottotask cancellati su Jira' },
  riassegnato: { sev: 'ko', ico: '🔀', label: 'sottotask riassegnato su Jira', plur: 'sottotask riassegnati su Jira' },
  mancante: { sev: 'ko',   ico: '❌', label: 'senza sottotask', plur: 'senza sottotask' },
  creato:   { sev: 'warn', ico: '🆕', label: 'sottotask in stato CREATED', plur: 'sottotask in stato CREATED' },
  orfano:   { sev: 'warn', ico: '🔗', label: 'sottotask non più in Griglia', plur: 'sottotask non più in Griglia' },
};
const PW_JCHK_ORDINE = ['commessa', 'errore', 'cancellato', 'riassegnato', 'mancante', 'creato', 'orfano'];
// Stato Jira da segnalare (nome dello stato, non la categoria: CREATED e TO DO sono entrambi "new").
const PW_JCHK_STATO_CREATED = /^(created|creato)$/i;

const _pwJchk = {
  evidenzia: false, // celle anomale evidenziate in Griglia (acceso all'apertura del controllo)
  ultimo: null,     // ultimo risultato mostrato nel modal: gli onclick lo indicizzano per numero
  jira: {},         // 'anno|week' -> { cancellati: Set(chiavi), info: {chiave: {status, assignee}}, n, ts, errore, inflight }
  acc: {},          // email operatore (minuscola) -> accountId Jira | null (non risolta), per la sessione
};

function _pwJchkWeekKey() { return pwAnno + '|' + pwWeek; }

// Sottotask che la verifica su Jira ha trovato cancellato (o non più visibile).
function _pwJchkCancellato(e) {
  const v = _pwJchk.jira[_pwJchkWeekKey()];
  return !!(v && e && e.key && v.cancellati.has(e.key));
}

// accountId Jira dell'operatore, se la sua email è stata risolta (altrimenti '').
function _pwJchkAccountDi(operatore) {
  const em = pwJiraOperatorEmail(operatore).toLowerCase();
  return (em && _pwJchk.acc[em]) || '';
}

// Operatore in anagrafica con quell'accountId (tra le email già risolte), o ''.
function _pwJchkOperatoreDi(accountId) {
  if (!accountId) return '';
  const op = (state.operatori || []).find(o => o.email && _pwJchk.acc[o.email.trim().toLowerCase()] === accountId);
  return op ? (op.nome_esteso || op.nome_breve || '') : '';
}

/* Cosa dice Jira di un sottotask presente: null se nulla da segnalare (o non ancora
   verificato), altrimenti { tipo: 'riassegnato', assignee, nuovo } o { tipo: 'creato', status }.
   assignee undefined = Edge Function senza il campo: nessun confronto. */
function _pwJchkEsameJira(e, operatore) {
  const v = _pwJchk.jira[_pwJchkWeekKey()];
  const info = v && v.info && e && e.key ? v.info[e.key] : null;
  if (!info) return null;
  const atteso = _pwJchkAccountDi(operatore);
  if (atteso && info.assignee !== undefined && (!info.assignee || info.assignee.accountId !== atteso)) {
    const nuovo = info.assignee ? _pwJchkOperatoreDi(info.assignee.accountId) : '';
    return { tipo: 'riassegnato', assignee: info.assignee, nuovo: nuovo !== operatore ? nuovo : '' };
  }
  if (PW_JCHK_STATO_CREATED.test(String(info.status || '').trim())) return { tipo: 'creato', status: info.status };
  return null;
}

// Gruppo della Griglia (stesso blocco) dove spostare l'indicatore di un sottotask
// riassegnato: il nuovo operatore sullo stesso cantiere, stessa attività se c'è, e
// senza un sottotask suo valido. Per un sottotask giornaliero (giorno non null) il
// nuovo operatore deve essere su quel cantiere QUEL giorno.
function _pwJchkDestinazione(bc, gruppi, operatore, cantiere, attivita, giorno) {
  if (!operatore) return null;
  const conGiorno = giorno !== null && giorno !== undefined;
  const cand = [...gruppi.values()].filter(g => g.operatore === operatore && g.cantiere === cantiere
    && (!conGiorno || g.celle.some(c => c.day === giorno)));
  const gr = cand.find(g => g.attivita === attivita) || cand[0];
  if (!gr) return null;
  const f = pwJiraSubtaskLookup(bc, gr.cantiere, gr.operatore, gr.attivita, conGiorno ? giorno : null);
  const e = f && f.entry;
  if (pwJiraSubtaskIsResolved(e) && !_pwJchkCancellato(e)) return null;
  return gr;
}

/* Chiede a Jira quali sottotask della settimana esistono ancora. Senza forza parte una
   sola volta per settimana (pwRender gira a ogni modifica). Le chiavi create dopo la
   verifica non sono nel Set dei cancellati, quindi contano come presenti. */
function pwJchkVerificaJira(forza) {
  const wk = _pwJchkWeekKey();
  const cur = _pwJchk.jira[wk];
  if (cur && cur.inflight) return cur.inflight;
  if ((cur && !forza) || !_sbClient || !_sbUser) return Promise.resolve();
  const week = pwGetWeekData();
  const keys = [...new Set(week.flatMap(bc =>
    Object.values(pwJiraSubtaskMappa(bc)).filter(e => pwJiraSubtaskIsResolved(e) && e.key).map(e => e.key)))];
  const stato = { cancellati: cur ? cur.cancellati : new Set(), info: cur ? cur.info : {}, n: keys.length, ts: cur ? cur.ts : 0, errore: '',
    trovati: cur ? cur.trovati : null, erroreCerca: '' };
  _pwJchk.jira[wk] = stato;
  // Email da risolvere in accountId: operatori della settimana e dei sottotask (anche
  // orfani). Quelle già risolte restano in cache; le non risolte si ritentano su Ricontrolla.
  const emails = new Set();
  const aggiungi = nome => { const em = nome ? pwJiraOperatorEmail(nome).toLowerCase() : ''; if (em) emails.add(em); };
  week.forEach(bc => {
    if (!bc) return;
    (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => { if (op && !op.fornitore) aggiungi(op.nome); }));
    Object.values(pwJiraSubtaskMappa(bc)).forEach(e => aggiungi(e.operatore));
  });
  const daRisolvere = [...emails].filter(em => !(em in _pwJchk.acc) || (forza && _pwJchk.acc[em] === null));
  const cerca = _pwJchkRichiestaCerca();
  stato.inflight = (async () => {
    try {
      const trovati = new Set();
      const info = {};
      for (let i = 0; i < keys.length; i += 500) {
        const body = { subtaskKeys: keys.slice(i, i + 500), soloSottotask: true };
        if (i === 0 && daRisolvere.length) body.emails = daRisolvere;
        const { data, error } = await _sbClient.functions.invoke('jira-task-status', { body });
        if (error) throw new Error(await _cpEdgeErr(error, 'jira-task-status'));
        if (data && data.error) throw new Error(data.error);
        Object.entries((data && data.subtasks) || {}).forEach(([k, st]) => {
          trovati.add(k);
          info[k] = { status: (st && st.status) || '', assignee: st ? st.assignee : undefined };
        });
        Object.assign(_pwJchk.acc, (data && data.accountByEmail) || {});
      }
      // Nessuna chiave trovata su tante: più probabile un problema di accesso a Jira che
      // una settimana intera cancellata — meglio non dichiararli tutti cancellati.
      if (!trovati.size && keys.length >= 3) throw new Error('Jira non ha restituito nessuno dei ' + keys.length + ' sottotask: verifica non attendibile');
      stato.cancellati = new Set(keys.filter(k => !trovati.has(k)));
      stato.info = info;
      stato.ts = Date.now();
    } catch (e) {
      stato.errore = e.message || String(e);
    }
    try {
      stato.trovati = cerca.length ? await _pwJchkCercaManuali(cerca) : [];
    } catch (e) {
      stato.erroreCerca = e.message || String(e);
    }
    delete stato.inflight;
  })();
  return stato.inflight;
}

/* Sottotask creati a mano su Jira (v18.239.0): la Griglia conosce solo quelli creati
   dall'app, quindi un sottotask fatto a mano lascia la giornata "senza sottotask". Per le
   giornate scoperte (mancanti o con creazione fallita) si chiede a jira-task-status
   ("cerca") i sottotask della settimana dei loro operatori, progetto per progetto;
   l'abbinamento lo fa _pwJchkAbbinaManuali e il collegamento solo l'utente (pwJchkCollega). */
function _pwJchkRichiestaCerca() {
  const perProgetto = new Map(); // progetto -> Set(email)
  pwJchkAnalizza().anomalie.forEach(a => {
    if (a.tipo !== 'mancante' && a.tipo !== 'errore') return;
    const progetto = _pwJchkProgettoDi(a.commessa);
    const em = pwJiraOperatorEmail(a.operatore).toLowerCase();
    if (!progetto || !em) return;
    if (!perProgetto.has(progetto)) perProgetto.set(progetto, new Set());
    perProgetto.get(progetto).add(em);
  });
  const dal = pwJsubDataIso(pwAnno, pwWeek, 0), al = pwJsubDataIso(pwAnno, pwWeek, 5);
  return [...perProgetto].map(([project, emails]) => ({ project, emails: [...emails], dal, al }));
}

async function _pwJchkCercaManuali(cerca) {
  const { data, error } = await _sbClient.functions.invoke('jira-task-status', { body: { subtaskKeys: [], cerca } });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-task-status'));
  if (data && data.error) throw new Error(data.error);
  Object.assign(_pwJchk.acc, (data && data.accountByEmail) || {});
  if (!data || !Array.isArray(data.trovati)) throw new Error('Edge Function jira-task-status da aggiornare');
  return data.trovati;
}

function _pwJchkProgettoDi(commessa) {
  const meta = (commessa && state.commesse_attive_meta && state.commesse_attive_meta[commessa]) || {};
  return String(meta.jira_project_code || '').trim().toUpperCase();
}

// Sottotask di quel giorno (aaaa-mm-gg): data nel titolo (gg/mm/aaaa, anche con "-" o "."
// o senza anno) oppure scadenza/inizio = giorno. Stessa idea dell'anti-duplicati di
// jira-create-subtask; un settimanale ("Week N") non è mai di un giorno.
function _pwJchkDiGiorno(t, data) {
  const s = String(t.summary || '');
  if (/\bWeek\s+\d+\b/i.test(s)) return false;
  const [y, m, d] = data.split('-');
  const gg = '0?' + Number(d), mm = '0?' + Number(m);
  if (new RegExp('(^|\\D)' + gg + '[/.-]' + mm + '(?:[/.-](?:' + y + '|' + y.slice(2) + ')(?!\\d)|(?![/.-]?\\d))').test(s)) return true;
  const due = t.duedate || '', start = t.start || '';
  return (due === data && (!start || start === data)) || (!due && start === data);
}

/* Abbina i sottotask trovati alle giornate scoperte: stesso progetto della commessa,
   assegnato all'operatore (accountId, mai il nome), di quel giorno, non già collegato a
   un'altra cella. Fra più candidati vince l'unico che nomina il cantiere (nel titolo suo o
   del Task padre); se nessuno lo nomina, si abbina solo se quel giorno l'operatore ha una
   sola giornata scoperta nel progetto e c'è un solo candidato. Mai due giornate sullo
   stesso sottotask. Esito sulle anomalie: a.suJira = [{ day, key, url, summary, taskKey }]
   (collegabili), a.dubbi = [{ day, cand: [{key, url}] }] (più candidati, non si sceglie). */
function _pwJchkAbbinaManuali(anomalie, data) {
  const v = _pwJchk.jira[_pwJchkWeekKey()];
  const trovati = (v && v.trovati) || [];
  if (!trovati.length) return;
  const collegate = new Set();
  data.forEach(bc => Object.values(pwJiraSubtaskMappa(bc)).forEach(e => { if (e && e.key) collegate.add(e.key); }));
  const scoperte = [];
  anomalie.forEach(a => {
    if (a.tipo !== 'mancante' && a.tipo !== 'errore') return;
    const acc = _pwJchkAccountDi(a.operatore), progetto = _pwJchkProgettoDi(a.commessa);
    if (!acc || !progetto) return;
    a.celle.forEach(c => scoperte.push({ a, c, acc, progetto, data: pwJsubDataIso(pwAnno, pwWeek, c.day) }));
  });
  const perGiorno = {};
  const kGiorno = s => s.acc + '|' + s.progetto + '|' + s.data;
  scoperte.forEach(s => { perGiorno[kGiorno(s)] = (perGiorno[kGiorno(s)] || 0) + 1; });
  const compatto = x => caNorm(x).replace(/ /g, '');
  // Cantieri di ogni operatore nella settimana: un candidato unico che ne nomina un altro
  // (es. un doppione fatto a mano del cantiere già coperto) non si abbina per esclusione.
  const cantieriOp = {};
  data.forEach(bc => ((bc && bc.squadre) || []).forEach(sq => (sq.operatori || []).forEach(op => {
    if (!op || !op.nome) return;
    const set = cantieriOp[op.nome] = cantieriOp[op.nome] || new Set();
    Object.keys(op.giorni || {}).forEach(d => pwCellVoci(op.giorni[d]).forEach(x => { const n = compatto(x.cantiere); if (n) set.add(n); }));
  })));
  const testo = t => compatto((t.summary || '') + ' ' + (t.parentSummary || ''));
  const usate = new Set();
  scoperte.forEach(s => {
    const cand = trovati.filter(t => t.assignee === s.acc && String(t.project || '').toUpperCase() === s.progetto
      && !collegate.has(t.key) && !usate.has(t.key) && _pwJchkDiGiorno(t, s.data));
    if (!cand.length) return;
    const nome = compatto(s.a.cantiere);
    const nomina = nome ? cand.filter(t => testo(t).includes(nome)) : [];
    const altri = [...(cantieriOp[s.a.operatore] || [])].filter(n => n !== nome);
    let scelto = null;
    if (nomina.length === 1) scelto = nomina[0];
    else if (!nomina.length && cand.length === 1 && perGiorno[kGiorno(s)] === 1 && !altri.some(n => testo(cand[0]).includes(n))) scelto = cand[0];
    if (scelto) {
      usate.add(scelto.key);
      (s.a.suJira = s.a.suJira || []).push({ day: s.c.day, key: scelto.key, url: scelto.url, summary: scelto.summary, taskKey: scelto.parentKey || '' });
    } else {
      (s.a.dubbi = s.a.dubbi || []).push({ day: s.c.day, cand: (nomina.length ? nomina : cand).map(t => ({ key: t.key, url: t.url })) });
    }
  });
}

/* Unità del controllo = operatore + cantiere + attività + giorno (una cella-voce). Le celle
   si raggruppano per operatore + cantiere + attività del sottotask (pwJiraAttivitaSottotask:
   un giorno senza attività va con l'attività che l'operatore ha lì nel resto della
   settimana); dentro il gruppo, ogni giorno cerca il suo sottotask (giornaliero, o il
   settimanale che copre tutta la settimana). Una riga di anomalia per sottotask
   (cancellato/riassegnato/creato), e una per i giorni senza sottotask o con errore. */
function pwJchkAnalizza() {
  const out = { voci: 0, ok: 0, fornitori: 0, anomalie: [], cancellati: [] };
  const data = pwGetWeekData();
  const usatiPerCommessa = new Map(); // commessa -> Set(mapKey) usati da una cella di qualunque suo blocco
  const visti = new Map();            // commessa -> Set(mapKey) già esaminati (blocchi della stessa commessa condividono i giornalieri)
  const blocchi = [];                 // { bc, cIdx, gruppi, mappa, offriSposta } per gli orfani
  const setDi = (m, k) => { if (!m.has(k)) m.set(k, new Set()); return m.get(k); };

  data.forEach((bc, cIdx) => {
    if (!bc) return;
    const gruppi = new Map(); // operatore|||cantiere|||attività -> gruppo
    (bc.squadre || []).forEach((sq, sIdx) => (sq.operatori || []).forEach((op, oIdx) => {
      if (!op || !op.nome) return;
      const giorni = op.giorni || {};
      Object.keys(giorni).filter(d => /^[0-5]$/.test(d)).forEach(dKey => {
        const g = giorni[dKey];
        pwCellCantieriRaw(g).forEach((raw, ci) => {
          const cantiere = (raw || '').trim();
          if (!cantiere) return;
          if (op.fornitore) { out.fornitori++; return; }
          const attivita = pwJiraAttivitaSottotask(bc, cantiere, op.nome, pwCellAttivitaAt(g, ci));
          const k = op.nome + '|||' + cantiere + '|||' + attivita;
          let gr = gruppi.get(k);
          if (!gr) {
            gr = { cIdx, sIdx, operatore: op.nome, cantiere, attivita, squadra: sq.nome || '', celle: [] };
            gruppi.set(k, gr);
          }
          gr.celle.push({ sIdx, oIdx, day: Number(dKey), ci });
        });
      });
    }));
    const mappa = pwJiraSubtaskMappa(bc);
    if (!gruppi.size && !Object.keys(mappa).length) return;

    const meta = (bc.commessa && state.commesse_attive_meta && state.commesse_attive_meta[bc.commessa]) || {};
    if (!bc.commessa || !meta.jira_project_code) {
      if (!gruppi.size) return;
      const celle = [...gruppi.values()].flatMap(gr => gr.celle);
      out.voci += celle.length;
      out.anomalie.push({
        tipo: 'commessa', cIdx, sIdx: 0, commessa: bc.commessa || '', n: celle.length, celle,
        messaggio: (bc.commessa ? 'Manca il "Codice progetto Jira" in anagrafica commessa: ' : 'Blocco senza commessa scelta: ')
          + celle.length + (celle.length === 1 ? ' giornata non controllabile.' : ' giornate non controllabili.'),
      });
      return;
    }

    const vistiQui = setDi(visti, bc.commessa);
    Object.keys(mappa).forEach(mapKey => {
      const e = mappa[mapKey];
      // Un giornaliero è della commessa, un settimanale del blocco: si conta una volta.
      const id = e._db ? mapKey : cIdx + '#' + mapKey;
      if (vistiQui.has(id)) return;
      vistiQui.add(id);
      if (pwJiraSubtaskIsResolved(e) && _pwJchkCancellato(e)) out.cancellati.push({ cIdx, mapKey, id: e._db ? e.id : null });
    });

    // Sottotask riassegnato a chi in Griglia lavora sullo stesso cantiere (lo stesso giorno,
    // se giornaliero) senza sottotask: l'indicatore si può spostare. Il gruppo di
    // destinazione lo dice anche lui.
    const offriSposta = (a, mapKey, e, nuovo) => {
      const giorno = e._db ? e.giorno : null;
      const dest = _pwJchkDestinazione(bc, gruppi, nuovo, a.cantiere, a.attivita, giorno);
      if (!dest) return;
      a.sposta = { da: mapKey, operatore: dest.operatore, cantiere: dest.cantiere, attivita: dest.attivita, giorno };
      dest.daSpostare = { key: e.key, da: a.operatore };
    };

    const usati = setDi(usatiPerCommessa, bc.commessa);
    gruppi.forEach(gr => {
      gr.celle.sort((a, b) => a.day - b.day);
      gr.commessa = bc.commessa;
      const perSottotask = new Map(); // mapKey -> { e, celle }
      const senza = [], errori = [];
      gr.celle.forEach(c => {
        out.voci++;
        const found = pwJiraSubtaskLookup(bc, gr.cantiere, gr.operatore, gr.attivita, c.day);
        if (found) usati.add(found.mapKey);
        const e = found && found.entry;
        if (pwJiraSubtaskIsResolved(e)) {
          if (!perSottotask.has(found.mapKey)) perSottotask.set(found.mapKey, { e, celle: [] });
          perSottotask.get(found.mapKey).celle.push(c);
        } else if (e && e.status === 'error') {
          errori.push({ c, e });
        } else {
          senza.push(c);
        }
      });

      perSottotask.forEach(({ e, celle }, mapKey) => {
        const a = Object.assign({}, gr, { celle, mapKey, key: e.key || '', url: e.url || '', giorno: e._db ? e.giorno : null });
        if (_pwJchkCancellato(e)) {
          a.tipo = 'cancellato';
          out.anomalie.push(a);
          return;
        }
        // Un sottotask in CREATED c'è: conta fra quelli presenti, ma va segnalato.
        const j = _pwJchkEsameJira(e, gr.operatore);
        if (!j || j.tipo === 'creato') out.ok += celle.length;
        if (!j) return;
        a.tipo = j.tipo;
        a.assignee = j.assignee;
        a.nuovo = j.nuovo;
        a.status = j.status || '';
        if (j.tipo === 'riassegnato') offriSposta(a, mapKey, e, j.nuovo);
        out.anomalie.push(a);
      });
      // Giorni in errore e giorni mancanti: due righe distinte. La riga "mancante" è il
      // gruppo stesso, perché offriSposta di un'altra riga (anche più avanti) vi segna
      // daSpostare; quella degli errori, se c'è anche l'altra, ne è una copia.
      gr.noEmail = !pwJiraOperatorEmail(gr.operatore);
      if (errori.length) {
        const err = { tipo: 'errore', celle: errori.map(x => x.c), messaggio: errori[0].e.message || '' };
        out.anomalie.push(senza.length ? Object.assign({}, gr, err) : Object.assign(gr, err));
      }
      if (senza.length) out.anomalie.push(Object.assign(gr, { tipo: 'mancante', celle: senza, messaggio: '' }));
    });
    blocchi.push({ bc, cIdx, mappa, offriSposta });
  });

  // Indicatori creati/già esistenti che nessuna cella usa più. Un errore non più usato
  // non dice nulla (il sottotask non c'è), quindi non si segnala. Dopo tutti i blocchi:
  // un giornaliero può essere usato da un altro blocco della stessa commessa.
  const segnalati = new Map(); // commessa -> Set(mapKey) giornalieri già segnalati
  blocchi.forEach(({ bc, cIdx, mappa, offriSposta }) => {
    const usati = usatiPerCommessa.get(bc.commessa) || new Set();
    const giaSegnalati = setDi(segnalati, bc.commessa);
    Object.keys(mappa).forEach(mapKey => {
      const e = mappa[mapKey];
      if (usati.has(mapKey) || !pwJiraSubtaskIsResolved(e) || _pwJchkCancellato(e)) return;
      if (e._db) { if (giaSegnalati.has(mapKey)) return; giaSegnalati.add(mapKey); }
      const operatore = e.operatore || '';
      // Riga dell'operatore in questo blocco, o in un altro della stessa commessa.
      let pos = null;
      data.some((b, bIdx) => b && (bIdx === cIdx || (e._db && b.commessa === bc.commessa)) && (b.squadre || []).some((sq, sIdx) => (sq.operatori || []).some((op, oIdx) => {
        if (op && op.nome === operatore) { pos = { cIdx: bIdx, sIdx, oIdx }; return true; }
        return false;
      })));
      const a = {
        tipo: 'orfano', cIdx: pos ? pos.cIdx : cIdx, sIdx: pos ? pos.sIdx : 0, commessa: bc.commessa, mapKey,
        operatore, cantiere: e.cantiere || '', attivita: e.attivita || '', giorno: e._db ? e.giorno : null,
        key: e.key || '', url: e.url || '', pos, celle: [],
      };
      // Caso tipico: in Griglia l'operatore è stato sostituito e su Jira il sottotask
      // riassegnato al sostituto — l'indicatore è rimasto sotto il vecchio nome.
      const j = _pwJchkEsameJira(e, a.operatore);
      if (j && j.tipo === 'riassegnato') {
        a.assignee = j.assignee;
        a.nuovo = j.nuovo;
        offriSposta(a, mapKey, e, j.nuovo);
      }
      out.anomalie.push(a);
    });
  });

  _pwJchkAbbinaManuali(out.anomalie, data);
  out.anomalie.sort((a, b) => (a.cIdx - b.cIdx)
    || (PW_JCHK_ORDINE.indexOf(a.tipo) - PW_JCHK_ORDINE.indexOf(b.tipo))
    || (a.sIdx - b.sIdx)
    || String(a.operatore || '').localeCompare(String(b.operatore || ''), 'it')
    || ((a.celle[0] ? a.celle[0].day : (a.giorno || 0)) - (b.celle[0] ? b.celle[0].day : (b.giorno || 0))));
  return out;
}

/* Bottone + evidenziazione: chiamata da pwRender e da pwJiraSubtaskApplyBadgesToDom. La
   prima volta per settimana avvia anche la verifica su Jira e si riaggiorna all'esito. */
function pwJchkRefresh() {
  const r = pwJchkAnalizza();
  pwJchkUpdateButton(r);
  pwJchkApplyHighlight(r);
  const wk = _pwJchkWeekKey();
  if (!_pwJchk.jira[wk]) {
    pwJchkVerificaJira().then(() => {
      if (_pwJchkWeekKey() !== wk) return;
      const r2 = pwJchkAnalizza();
      pwJchkUpdateButton(r2);
      pwJchkApplyHighlight(r2);
    });
  }
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
    btn.title = 'Tutte le ' + r.voci + ' giornate della settimana hanno il sottotask Jira — Click destro per la guida';
  } else {
    const ko = r.anomalie.some(a => PW_JCHK_TIPI[a.tipo].sev === 'ko');
    btn.className = BASE + (ko ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100');
    btn.textContent = '🎫 Sottotask · ' + n + (n === 1 ? ' anomalia' : ' anomalie');
    btn.title = r.ok + '/' + r.voci + ' giornate con sottotask Jira — clicca per il dettaglio, click destro per la guida';
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
  const wk = _pwJchkWeekKey();
  const verifica = pwJchkVerificaJira(true);
  _pwJchkRenderModal(true);
  verifica.then(() => {
    if (_pwJchkWeekKey() === wk && document.getElementById('pw-jchk-modal')) _pwJchkRenderModal(true);
  });
}

function _pwJchkStatoJiraHtml() {
  const v = _pwJchk.jira[_pwJchkWeekKey()];
  if (!v) return '';
  if (v.inflight) return '<div class="pw-jchk-jira">⏳ Verifica su Jira dei sottotask in corso…</div>';
  const cerca = v.erroreCerca
    ? '<div class="pw-jchk-jira pw-jchk-jira-err">⚠️ Ricerca su Jira dei sottotask fatti a mano non riuscita (' + esc(v.erroreCerca) + ').</div>'
    : '';
  if (v.errore) return '<div class="pw-jchk-jira pw-jchk-jira-err">⚠️ Verifica su Jira non riuscita (' + esc(v.errore) + '): mostrati solo gli indicatori della Griglia.</div>' + cerca;
  if (!v.ts || !v.n) return cerca;
  const ora = new Date(v.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const canc = v.cancellati.size;
  return '<div class="pw-jchk-jira">✓ Verificati su Jira alle ' + ora + ' i ' + v.n + ' sottotask della settimana (esistenza, assegnatario, stato)'
    + (canc ? ': <b>' + canc + (canc === 1 ? ' cancellato' : ' cancellati') + '</b>' : ', tutti presenti') + '.</div>' + cerca;
}

// Anomalie (tutte, o solo la i-esima) con sottotask fatti a mano da collegare: [{ a, i }].
function _pwJchkDaCollegare(r, soloI) {
  const out = [];
  r.anomalie.forEach((a, i) => {
    if ((soloI === undefined || soloI === i) && a.suJira && a.suJira.length) out.push({ a, i });
  });
  return out;
}

// accendi: all'apertura del controllo l'evidenziazione in Griglia si accende da sola se
// ci sono anomalie; nei ri-render (verifica Jira, pulizia) resta come l'ha lasciata l'utente.
function _pwJchkRenderModal(accendi) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const r = pwJchkAnalizza();
  _pwJchk.ultimo = r;
  if (accendi && r.anomalie.length && !document.getElementById('pw-jchk-modal')) _pwJchk.evidenzia = true;
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
      + '<div>Tutte le <b>' + r.voci + '</b> giornate (operatore · cantiere · attività · giorno) hanno il loro sottotask Jira.</div></div>';
  } else {
    const ko = r.anomalie.some(a => PW_JCHK_TIPI[a.tipo].sev === 'ko');
    esito = '<div class="pw-jchk-esito ' + (ko ? 'pw-jchk-esito-ko' : 'pw-jchk-esito-warn') + '">'
      + '<div class="pw-jchk-esito-big">' + n + (n === 1 ? ' anomalia' : ' anomalie') + '</div>'
      + '<div><b>' + r.ok + '</b> su <b>' + r.voci + '</b> giornate hanno il sottotask Jira.</div>'
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
      ? '<button type="button" class="pw-jchk-crea" data-help-key="pw-jchk-crea" onclick="closeModal();pwJiraSubtaskInit(' + cIdx + ')" title="Apre la creazione sottotask per questa commessa">🎫 Crea sottotask</button>'
      : '';
    return '<div class="pw-jchk-blocco">'
      + '<div class="pw-jchk-blocco-head"><span class="truncate">' + esc(primo.commessa || '(blocco senza commessa)') + '</span>'
      + '<span class="text-slate-400 font-normal text-xs ml-1">' + idxs.length + '</span>' + creaBtn + '</div>'
      + idxs.map(i => pwJchkRigaHtml(r.anomalie[i], i)).join('')
      + '</div>';
  }).join('');

  const note = ['Controllo sugli indicatori 🎫 salvati in Griglia, più la verifica su Jira di sottotask cancellati, riassegnati o in stato CREATED (su Jira non viene scritto niente). Un sottotask copre operatore + cantiere + attività per un giorno (quelli settimanali creati prima della v18.229.0 coprono tutta la loro settimana).'];
  if (r.fornitori) note.push(r.fornitori + (r.fornitori === 1 ? ' cella' : ' celle') + ' di fornitori esterni escluse dal controllo.');

  const pulisci = r.cancellati.length && sbCanWrite()
    ? '<button type="button" class="pw-jchk-pulisci" onclick="pwJchkTogliCancellati()">🧹 Togli ' + r.cancellati.length
      + (r.cancellati.length === 1 ? ' indicatore' : ' indicatori') + ' di sottotask cancellati su Jira</button>'
    : '';
  const nCollega = _pwJchkDaCollegare(r).reduce((s, x) => s + x.a.suJira.length, 0);
  const collegaTutti = nCollega && sbCanWrite()
    ? '<button type="button" class="pw-jchk-collega" onclick="pwJchkCollegaTutti()">🔗 Collega ' + nCollega
      + (nCollega === 1 ? ' sottotask trovato' : ' sottotask trovati') + ' su Jira (fatti a mano)</button>'
    : '';

  root.innerHTML ='<div class="modal-backdrop"><div id="pw-jchk-modal" class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">'
    + '<div class="flex items-start justify-between gap-3 mb-3">'
    +   '<div><h3 class="font-semibold text-slate-900">🎫 Controllo sottotask Jira</h3>'
    +   '<div class="text-xs text-slate-500">Week ' + pwWeek + ' · ' + pwAnno + ' · tutte le commesse della Griglia</div></div>'
    +   (n ? '<label data-help-key="pw-jchk-evidenzia" class="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer whitespace-nowrap mt-1">'
    +     '<input type="checkbox"' + (_pwJchk.evidenzia ? ' checked' : '') + ' onchange="pwJchkSetEvidenzia(this.checked)"> Evidenzia in Griglia</label>' : '')
    + '</div>'
    + esito
    + _pwJchkStatoJiraHtml()
    + pulisci
    + collegaTutti
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
    + (a.tipo === 'orfano' && a.giorno !== null && a.giorno !== undefined ? ' <span class="text-slate-500">· ' + esc(pwJsubGiornoLabel(pwAnno, pwWeek, a.giorno)) + '</span>' : '')
    + (a.squadra ? ' <span class="pw-jchk-sq">(' + esc(a.squadra) + ')</span>' : '');
  const link = a.url
    ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="text-blue-700 hover:underline">' + esc(a.key || 'apri') + '</a>'
    : esc(a.key || '');
  const scrive = sbCanWrite();
  const btnRimuovi = scrive
    ? '<button type="button" class="pw-jchk-azione" onclick="event.stopPropagation();pwJchkRimuoviIndicatore(' + i + ')" title="Toglie solo l\'indicatore dalla Griglia: su Jira non cambia niente">✕ togli indicatore</button>'
    : '';
  const btnSposta = scrive && a.sposta
    ? '<button type="button" class="pw-jchk-azione pw-jchk-azione-ok" onclick="event.stopPropagation();pwJchkSposta(' + i + ')" title="Collega il sottotask a ' + esc(a.sposta.operatore) + ' in Griglia: su Jira non cambia niente">⇄ sposta a ' + esc(a.sposta.operatore) + '</button>'
    : '';
  // Testo dell'assegnatario attuale su Jira (sottotask riassegnato).
  const aChi = a.assignee
    ? 'su Jira ora è assegnato a <b>' + esc(a.nuovo || a.assignee.displayName || 'un altro utente') + '</b>'
      + (a.nuovo ? '' : ' (non in Griglia questa settimana)')
    : 'su Jira non è più assegnato a nessuno';
  if (a.tipo === 'orfano') {
    const det = a.assignee !== undefined
      ? 'Sottotask ' + link + ' non più pianificato da nessuna cella; ' + aChi
      : 'Sottotask ' + link + ' su Jira, ma nessuna cella lo pianifica più'
        + (a.pos ? (a.giorno !== null && a.giorno !== undefined ? ' (giorno, cantiere o attività cambiati?)' : ' (cantiere o attività cambiati?)') : ' (operatore non più in questa commessa)');
    return '<div class="' + cls + '" onclick="pwJchkVai(' + i + ')" title="' + (a.pos ? 'Vai alla riga dell\'operatore' + (a.giorno !== null && a.giorno !== undefined ? ' (' + PW_JCHK_GIORNI[a.giorno] + ')' : '') : 'Vai al blocco commessa') + '">'
      + '<span class="pw-jchk-ico">' + t.ico + '</span>'
      + '<div class="min-w-0 flex-1"><div>' + titolo + '</div>'
      + '<div class="pw-jchk-det">' + det + '</div></div>'
      + (btnSposta || btnRimuovi) + '</div>';
  }
  let det, azione = '';
  if (a.tipo === 'cancellato') {
    det = 'Il sottotask ' + link + ' è stato cancellato su Jira: se l\'operatore non lavora più qui toglilo dalla Griglia, altrimenti togli l\'indicatore e ricrea il sottotask';
    azione = btnRimuovi;
  } else if (a.tipo === 'riassegnato') {
    det = 'Il sottotask ' + link + ' ' + aChi + ': ' + (a.sposta
      ? 'sposta l\'indicatore, poi togli ' + esc(a.operatore) + ' dalla Griglia se non lavora più qui'
      : 'aggiorna la Griglia, o riassegnalo su Jira');
    azione = btnSposta;
  } else if (a.tipo === 'creato') {
    det = 'Il sottotask ' + link + ' su Jira è ancora nello stato <b>' + esc(a.status || 'CREATED') + '</b>';
  } else {
    const parti = [t.label + (a.messaggio ? ': ' + a.messaggio : '')];
    if (a.noEmail) parti.push('📧 email mancante in anagrafica: il sottotask non si può creare');
    if (a.daSpostare) parti.push('🔀 su Jira gli è stato riassegnato ' + a.daSpostare.key + ' di ' + a.daSpostare.da + ': usa «sposta» su quella riga');
    det = parti.map(esc).join(' · ');
    const linkJira = x => '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="text-blue-700 hover:underline">' + esc(x.key) + '</a>';
    if (a.suJira && a.suJira.length) {
      det += '<div class="pw-jchk-trovati">🔎 Su Jira c\'è già, fatto a mano: '
        + a.suJira.map(x => PW_JCHK_GIORNI[x.day] + ' → ' + linkJira(x)).join(', ') + '</div>';
      if (scrive) azione = '<button type="button" class="pw-jchk-azione pw-jchk-azione-ok" onclick="event.stopPropagation();pwJchkCollega(' + i + ')" title="Collega in Griglia i sottotask trovati: su Jira non cambia niente">🔗 collega</button>';
    }
    if (a.dubbi && a.dubbi.length) {
      det += '<div class="pw-jchk-trovati pw-jchk-trovati-dubbi">🔎 Su Jira più sottotask possibili, non collegati: '
        + a.dubbi.map(x => PW_JCHK_GIORNI[x.day] + ' ' + x.cand.map(linkJira).join(' / ')).join(', ')
        + ' — metti il nome del cantiere nel titolo su Jira e ricontrolla</div>';
    }
  }
  const giorni = a.celle.map((c, k) => '<button type="button" class="pw-jchk-giorno" onclick="event.stopPropagation();pwJchkVai(' + i + ',' + k + ')" title="Vai alla cella di ' + PW_JCHK_GIORNI[c.day] + '">' + PW_JCHK_GIORNI[c.day] + '</button>').join('');
  return '<div class="' + cls + '" onclick="pwJchkVai(' + i + ')" title="Vai alla cella">'
    + '<span class="pw-jchk-ico">' + t.ico + '</span>'
    + '<div class="min-w-0 flex-1"><div>' + titolo + '</div>'
    + '<div class="pw-jchk-det">' + det + '</div></div>'
    + azione
    + '<div class="pw-jchk-giorni">' + giorni + '</div></div>';
}

/* k = indice della cella dell'anomalia (chip del giorno), 0 = prima cella. */
function pwJchkVai(i, k) {
  const a = _pwJchk.ultimo && _pwJchk.ultimo.anomalie[i];
  if (!a) return;
  if (a.tipo === 'commessa' || (a.tipo === 'orfano' && !a.pos)) { pwJchkVaiBlocco(a.cIdx); return; }
  if (a.tipo === 'orfano') { pwGoToSearchCell(a.pos.cIdx, a.pos.sIdx, a.pos.oIdx, a.giorno !== null && a.giorno !== undefined ? a.giorno : null); return; }
  const c = a.celle[k || 0];
  if (c) pwGoToSearchCell(a.cIdx, c.sIdx, c.oIdx, c.day);
}

function pwJchkVaiBlocco(cIdx) {
  closeModal();
  if (_collapseSets('pw').comm.delete(String(cIdx))) pwApplyCollapseState();
  setTimeout(() => {
    const head = document.querySelector('.pw-commessa-block[data-cidx="' + cIdx + '"] .pw-commessa-header');
    if (!head) return;
    head.scrollIntoView({ behavior: 'smooth', block: 'center' });
    head.classList.add('pw-weather-cell-flash');
    setTimeout(() => head.classList.remove('pw-weather-cell-flash'), 2000);
  }, 50);
}

// Orfano o sottotask cancellato su Jira: toglie solo l'indicatore (riga della tabella dei
// giornalieri, o entry settimanale di bc.jiraSubtask).
async function pwJchkRimuoviIndicatore(i) {
  const a = _pwJchk.ultimo && _pwJchk.ultimo.anomalie[i];
  if (!a || !a.mapKey || (a.tipo !== 'orfano' && a.tipo !== 'cancellato') || !sbGuardWrite()) return;
  const quando = a.giorno !== null && a.giorno !== undefined ? ', ' + pwJsubGiornoLabel(pwAnno, pwWeek, a.giorno) : '';
  const ok = await showConfirmAsync('Togliere l\'indicatore del sottotask ' + (a.key || '') + ' (' + a.operatore + ' — ' + a.cantiere + quando
    + ') dalla Griglia?\n\n' + (a.tipo === 'cancellato'
      ? 'Su Jira è già stato cancellato. Se l\'operatore è ancora pianificato, la cella resterà "senza sottotask".'
      : 'Il sottotask su Jira NON viene cancellato.'), 'Togli indicatore');
  if (ok) await pwJiraSubtaskBadgeRemove(a.cIdx, a.mapKey);
  _pwJchkRenderModal(false);
}

/* Sottotask riassegnato su Jira a un operatore che in Griglia lavora sullo stesso
   cantiere (lo stesso giorno, se giornaliero) senza sottotask: l'indicatore passa da
   a.operatore a lui (riga della tabella, o un pwSave per un settimanale). */
async function pwJchkSposta(i) {
  const a = _pwJchk.ultimo && _pwJchk.ultimo.anomalie[i];
  const sp = a && a.sposta;
  if (!sp || !sbGuardWrite()) return;
  const ok = await showConfirmAsync('Collegare in Griglia il sottotask ' + (a.key || '') + ' a ' + sp.operatore + ' (' + sp.cantiere
    + (sp.attivita ? ' · ' + sp.attivita : '') + ') invece che a ' + a.operatore + '?\n\nSu Jira è già assegnato a lui: lì non cambia niente.'
    + (a.tipo === 'riassegnato' ? '\n' + a.operatore + ' resterà pianificato senza sottotask: toglilo dalla Griglia se non lavora più qui.' : ''), 'Sposta indicatore');
  const bc = ok ? pwGetWeekData()[a.cIdx] : null;
  const giornaliero = bc && bc.commessa ? pwJsubVociDi(pwAnno, pwWeek, bc.commessa)[sp.da] : null;
  if (giornaliero) {
    try {
      await pwJsubCambiaOperatore(giornaliero, bc.commessa, sp.operatore, sp.attivita);
      sbLogActivity('Griglia: indicatore sottotask riassegnato su Jira spostato', { anno: pwAnno, week: pwWeek, key: a.key, da: a.operatore, a: sp.operatore, cantiere: sp.cantiere, giorno: sp.giorno });
    } catch (e) {
      showAlertModal('Indicatore non spostato: ' + (e.message || String(e)));
      return;
    }
    pwJiraSubtaskApplyBadgesToDom();
  } else if (bc) {
    const entry = bc.jiraSubtask && bc.jiraSubtask[sp.da];
    if (entry) {
      delete bc.jiraSubtask[sp.da];
      const dest = pwJiraSubtaskLookup(bc, sp.cantiere, sp.operatore, sp.attivita);
      if (dest && !dest.entry._db) delete bc.jiraSubtask[dest.mapKey];
      bc.jiraSubtask[pwJiraSubtaskMapKey(sp.cantiere, sp.operatore, sp.attivita)] = Object.assign({}, entry, { ts: new Date().toISOString() });
      sbLogActivity('Griglia: indicatore sottotask riassegnato su Jira spostato', { anno: pwAnno, week: pwWeek, key: a.key, da: a.operatore, a: sp.operatore, cantiere: sp.cantiere });
      await pwSave();
      pwJiraSubtaskApplyBadgesToDom();
    }
  }
  _pwJchkRenderModal(false);
}

/* Collega in Griglia i sottotask fatti a mano trovati su Jira (_pwJchkAbbinaManuali): una
   riga giornaliera per giorno nella tabella pw_jira_subtask, stato "already_exists" come un
   sottotask che la creazione ha trovato già presente. Su Jira non cambia niente. */
async function _pwJchkCollega(lista) {
  if (!lista.length || !sbGuardWrite()) return;
  const n = lista.reduce((s, x) => s + x.a.suJira.length, 0);
  const ok = await showConfirmAsync('Collegare in Griglia ' + (n === 1 ? 'il sottotask trovato' : 'i ' + n + ' sottotask trovati')
    + ' su Jira?\n\n' + lista.map(({ a }) => a.operatore + ' — ' + a.cantiere + ': '
      + a.suJira.map(x => PW_JCHK_GIORNI[x.day] + ' ' + x.key).join(', ')).join('\n')
    + '\n\nSu Jira non cambia niente.', 'Collega');
  if (!ok) return;
  const perBlocco = new Map(); // cIdx -> voci
  lista.forEach(({ a }) => {
    if (!perBlocco.has(a.cIdx)) perBlocco.set(a.cIdx, []);
    a.suJira.forEach(x => perBlocco.get(a.cIdx).push({
      comune: a.cantiere, operatore: a.operatore, attivita: a.attivita, giorno: x.day,
      status: 'already_exists', key: x.key, url: x.url, taskKey: x.taskKey, message: '',
    }));
  });
  for (const [cIdx, voci] of perBlocco) await pwJiraSubtaskMarkBadges(cIdx, voci);
  sbLogActivity('Griglia: collegati sottotask fatti a mano su Jira', { anno: pwAnno, week: pwWeek, n, chiavi: lista.flatMap(({ a }) => a.suJira.map(x => x.key)) });
  _pwJchkRenderModal(false);
}

function pwJchkCollega(i) {
  return _pwJchk.ultimo ? _pwJchkCollega(_pwJchkDaCollegare(_pwJchk.ultimo, i)) : undefined;
}

function pwJchkCollegaTutti() {
  return _pwJchk.ultimo ? _pwJchkCollega(_pwJchkDaCollegare(_pwJchk.ultimo)) : undefined;
}

/* Toglie gli indicatori dei sottotask che la verifica ha trovato cancellati su Jira (una
   delete sulla tabella per i giornalieri, un solo pwSave per i settimanali). Le celle ancora
   pianificate restano "senza sottotask", pronte per una nuova creazione. */
async function pwJchkTogliCancellati() {
  const lista = (_pwJchk.ultimo && _pwJchk.ultimo.cancellati) || [];
  if (!lista.length || !sbGuardWrite()) return;
  const ok = await showConfirmAsync('Togliere dalla Griglia ' + (lista.length === 1 ? 'l\'indicatore del sottotask' : 'gli indicatori dei ' + lista.length + ' sottotask')
    + ' che su Jira risultano cancellati?\n\nLe celle ancora pianificate resteranno "senza sottotask".', 'Togli indicatori');
  if (ok) {
    const data = pwGetWeekData();
    const ids = lista.filter(x => x.id != null).map(x => x.id);
    const settimanali = lista.filter(x => x.id == null);
    try {
      await pwJsubElimina(ids);
    } catch (e) {
      showAlertModal('Indicatori non tolti: ' + (e.message || String(e)));
      return;
    }
    settimanali.forEach(({ cIdx, mapKey }) => { const bc = data[cIdx]; if (bc && bc.jiraSubtask) delete bc.jiraSubtask[mapKey]; });
    sbLogActivity('Griglia: tolti indicatori di sottotask cancellati su Jira', { anno: pwAnno, week: pwWeek, n: lista.length });
    if (settimanali.length) await pwSave();
    pwJiraSubtaskApplyBadgesToDom();
  }
  _pwJchkRenderModal(false);
}
