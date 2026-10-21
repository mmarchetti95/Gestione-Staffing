/* ==================== CONTROLLO ANOMALIE PRODUZIONE · UI E RACCOLTA DATI ====================
   Modal "🔍 Controllo anomalie" del tab Controllo Produzione (#cpa-modal, z-index sotto
   .modal-backdrop: conferme e avvisi devono comparire sopra). Raccoglie i dati della
   settimana mostrata e li passa al motore puro (produzione-anomalie-core.js):
   - Griglia (pwData) + Ferie della settimana, appiattite in celle operatore/giorno;
   - worklog Jira LETTI ora (jira-sync-worklogs, sola lettura): non si usa la colonna
     "Ore Jira" salvata perché copre solo le celle pianificate e può essere vecchia, e
     per i "worklog senza pianificazione" servono proprio i giorni non pianificati;
   - Epic dei sottotask della Griglia, via jira-task-status (stesse cache della Mappa:
     il sottotask è l'unico legame certo cantiere -> Task -> Epic, vedi
     supabase/functions/jira-task-status/index.ts);
   - indice dei sottotask di TUTTA la Griglia, per dire su quale cantiere sta un ticket.

   Ogni settimana tiene il SUO controllo (_cpaCache, salvato anche in localStorage per le
   ultime CPA_CACHE_MAX settimane): cambiando settimana e tornando indietro si ritrova
   l'ultima lettura, ricalcolata sulla Griglia attuale. Da Jira si rilegge solo a richiesta.
   Le letture da Jira si fanno per "Avvia/Ricontrolla" (tutti) o con "↻" su una singola
   anomalia (solo gli operatori coinvolti, cpaRicontrollaVoce). Dopo una correzione, un
   cambio di soglia, la riapertura del modal o un ridisegno del tab il motore si rilancia
   in locale sulla Griglia/Ferie attuali (_cpaRicalcola), senza rileggere Jira.

   Non scrive MAI su Jira. L'unica azione è locale e sempre confermata: aggiungere in
   Griglia la cella proposta per un worklog senza pianificazione (togliendo l'assenza da
   Ferie, se quel giorno risultava assente). */

const CPA_IGNORATE_KEY = 'cpa_ignorate_v1';
const CPA_PREF_KEY = 'cpa_pref_v1';  // soglia ore in squadra, per browser
const CPA_EMAIL_CHUNK = 8;           // email per chiamata a jira-sync-worklogs (evita timeout della funzione)
const CPA_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const CPA_GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const CPA_SOGLIE_ORE = [0.5, 1, 2, 3];
const CPA_CACHE_KEY = 'cpa_cache_v1';  // ultime letture Jira per settimana, per browser
const CPA_CACHE_MAX = 12;              // settimane tenute in localStorage

let _cpa = {
  aperto: false,
  anno: null, week: null,     // settimana dell'ultimo controllo
  inCorso: false,
  inCorsoDi: null,            // settimana del controllo completo in corso
  msg: '',
  base: null,                 // dati letti da Jira all'ultimo controllo (worklog, Epic, ...)
  risultato: null,            // output di cpaRileva + contesto (giorniLabel, avvisi)
  filtro: '',                 // tipo mostrato ('' = tutti)
  mostraIgnorate: false,
  tuttoIlPool: false,         // legge i worklog anche di chi non è in Griglia questa settimana
  risolte: new Set(),         // id corretti con un bottone in questa sessione
  proposte: {},               // id -> voci della cella proposta, modificabili dall'utente
  propMod: new Set(),         // id delle proposte modificate a mano
  ricontrollo: null,          // id dell'anomalia che si sta ricontrollando da sola
  esito: null,                // { ok, testo } dell'ultimo ricontrollo singolo
  soll: null,                 // vista solleciti aperta (produzione-anomalie-solleciti.js)
  registro: null,             // vista registro solleciti aperta ({ tutte, aperti })
};

function _cpaIgnorate() {
  try { return JSON.parse(localStorage.getItem(CPA_IGNORATE_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function _cpaSalvaIgnorate(m) {
  try { localStorage.setItem(CPA_IGNORATE_KEY, JSON.stringify(m)); } catch (_) {}
}

function _cpaPref() {
  try { return Object.assign({ diffOreSquadra: CPA_SOGLIE_DEFAULT.diffOreSquadra }, JSON.parse(localStorage.getItem(CPA_PREF_KEY) || '{}')); }
  catch (_) { return { diffOreSquadra: CPA_SOGLIE_DEFAULT.diffOreSquadra }; }
}

/* Stato del controllo per settimana: 'anno|week' -> { base, risolte, proposte, propMod }.
   `base` sono i dati letti da Jira (worklog, Epic, ...): il resto si ricalcola. */
let _cpaCache = null;

function _cpaKey(anno, week) { return anno + '|' + week; }

function _cpaCacheGet() {
  if (_cpaCache) return _cpaCache;
  _cpaCache = {};
  try {
    const m = JSON.parse(localStorage.getItem(CPA_CACHE_KEY) || '{}') || {};
    Object.keys(m).forEach(k => {
      const b = m[k];
      if (!b || !b.date || !b.worklog) return;
      b.quando = new Date(b.quando);
      _cpaCache[k] = { base: b, risolte: new Set(), proposte: {}, propMod: new Set() };
    });
  } catch (_) {}
  return _cpaCache;
}

/* Salva in localStorage le letture più recenti (quota piena: si tengono meno settimane) */
function _cpaCacheSalva() {
  const C = _cpaCacheGet();
  let chiavi = Object.keys(C).filter(k => C[k].base)
    .sort((a, b) => C[b].base.quando - C[a].base.quando).slice(0, CPA_CACHE_MAX);
  while (chiavi.length) {
    const m = {};
    chiavi.forEach(k => { m[k] = Object.assign({}, C[k].base, { quando: C[k].base.quando.toISOString() }); });
    try { localStorage.setItem(CPA_CACHE_KEY, JSON.stringify(m)); return; }
    catch (_) { chiavi = chiavi.slice(0, chiavi.length - 1); }
  }
  try { localStorage.removeItem(CPA_CACHE_KEY); } catch (_) {}
}

/* Porta in _cpa lo stato della settimana mostrata (pwAnno/pwWeek), mettendo da parte
   quello della settimana precedente. Il risultato si ricalcola sulla Griglia attuale. */
function _cpaAllinea() {
  if (_cpa.anno === pwAnno && _cpa.week === pwWeek) return;
  const C = _cpaCacheGet();
  if (_cpa.anno != null && _cpa.base) {
    C[_cpaKey(_cpa.anno, _cpa.week)] = { base: _cpa.base, risolte: _cpa.risolte, proposte: _cpa.proposte, propMod: _cpa.propMod };
  }
  const S = C[_cpaKey(pwAnno, pwWeek)] || { base: null, risolte: new Set(), proposte: {}, propMod: new Set() };
  _cpa.anno = pwAnno; _cpa.week = pwWeek;
  _cpa.base = S.base; _cpa.risolte = S.risolte; _cpa.proposte = S.proposte; _cpa.propMod = S.propMod;
  _cpa.risultato = null; _cpa.esito = null; _cpa.soll = null;
  if (!_cpa.inCorso) _cpa.msg = '';
  _cpaRicalcola();
}

/* Registra la lettura Jira di una settimana (anche se nel frattempo se ne mostra un'altra) */
function _cpaMemorizza(anno, week, base) {
  const C = _cpaCacheGet();
  const k = _cpaKey(anno, week);
  const S = C[k] = C[k] || { base: null, risolte: new Set(), proposte: {}, propMod: new Set() };
  S.base = base;
  if (_cpa.anno === anno && _cpa.week === week) {
    _cpa.base = base;
    S.risolte = _cpa.risolte; S.proposte = _cpa.proposte; S.propMod = _cpa.propMod;
  }
  _cpaCacheSalva();
}

function cpaToggle() {
  if (_cpa.aperto) cpaChiudi(); else cpaApri();
}

function cpaApri() {
  _cpa.aperto = true;
  _cpaAllinea();
  _cpaRicalcola();   // la Griglia può essere cambiata mentre il modal era chiuso
  cpaRender();
  /* Lettura automatica solo la prima volta per la settimana: poi si aggiorna con Ricontrolla */
  if (!_cpa.base && !_cpa.inCorso) cpaAvvia();
}

function cpaChiudi() {
  _cpa.aperto = false;
  cpaRender();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_cpa.aperto) return;
  const mr = document.getElementById('modal-root');
  if (mr && mr.children.length) return;   // c'è una conferma/avviso aperto sopra
  cpaChiudi();
});

/* Chiamata a fine pwControlloRender: allinea il controllo alla settimana mostrata e lo
   ricalcola sulla Griglia attuale (anche a modal chiuso: tiene aggiornato il contatore). */
function cpaOnControlloRender() {
  if (_cpa.anno !== pwAnno || _cpa.week !== pwWeek) _cpaAllinea();
  else _cpaRicalcola();
  cpaRender();
}

function _cpaDateSettimana() {
  const monday = isoWeekToMonday(pwAnno, pwWeek);
  const iso = [], label = [], ddmm = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    iso.push(d.getUTCFullYear() + '-' + mm + '-' + dd);
    ddmm.push(dd + '/' + mm);
    label.push(CPA_GIORNI[i] + ' ' + dd + '/' + mm);
  }
  return { iso, label, ddmm };
}

function _cpaOggiISO() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

/* Griglia della settimana -> celle operatore/giorno per il motore */
function _cpaCelleSettimana() {
  const data = pwGetWeekData();
  const fw = pwGetFerieWeek();
  const celle = [], operatori = new Set();
  data.forEach(bc => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => {
      const sqNome = sq.nome || 'Squadra';
      (sq.operatori || []).forEach(op => {
        const nome = (op.nome || '').trim();
        if (!nome) return;
        operatori.add(nome);
        for (let g = 0; g < 6; g++) {
          const voci = pwCellVoci((op.giorni || {})[g]);
          if (!voci.length) continue;
          celle.push({
            commessa: bc.commessa, squadra: sqNome, operatore: nome, giorno: g,
            cpKey: bc.commessa + '|||' + sqNome + '|||' + nome + '|||' + g,
            ferie: fw[nome] ? pwFerieTipo(fw[nome][g]) : null,
            voci: voci.map(v => {
              const e = pwJiraSubtaskEntry(bc, v.cantiere, nome, v.attivita);
              return { cantiere: v.cantiere, attivita: v.attivita,
                subtask: (pwJiraSubtaskIsResolved(e) && e.key) ? { key: e.key, url: e.url || '' } : null };
            }),
          });
        }
      });
    });
  });
  return { celle, operatori };
}

/* Sottotask di tutta la Griglia -> cantiere/operatore. Vince la settimana mostrata, poi la
   più recente: lo stesso sottotask può restare in più settimane (copie di settimana). */
function _cpaIndiceSottotask() {
  const out = {}, rank = {};
  Object.keys(pwData || {}).forEach(anno => {
    if (!/^\d+$/.test(anno)) return;
    Object.keys(pwData[anno] || {}).forEach(week => {
      const data = pwData[anno][week];
      if (!Array.isArray(data)) return;
      const corr = Number(anno) === pwAnno && Number(week) === pwWeek;
      const rk = corr ? Infinity : Number(anno) * 100 + Number(week);
      data.forEach(bc => {
        if (!bc || !bc.commessa) return;
        Object.keys(bc.jiraSubtask || {}).forEach(mk => {
          const e = bc.jiraSubtask[mk];
          if (!pwJiraSubtaskIsResolved(e) || !e.key) return;
          if (rank[e.key] != null && rank[e.key] >= rk) return;
          const p = mk.split('|||');
          rank[e.key] = rk;
          out[e.key] = { commessa: bc.commessa, cantiere: p[0], operatore: p[1], attivita: p[2] || '', anno: Number(anno), week: Number(week) };
        });
      });
    });
  });
  return out;
}

async function _cpaLeggiWorklog(nomi, date, avvisi, silenzioso) {
  const emailByNome = {};
  (state.operatori || []).forEach(o => {
    const n = o.nome_esteso || o.nome_breve || o.nome;
    if (n && o.email && o.email.trim()) emailByNome[n] = o.email.trim();
  });
  const conEmail = nomi.filter(n => emailByNome[n]);
  const senzaEmail = nomi.filter(n => !emailByNome[n]);
  if (senzaEmail.length) avvisi.push('Senza email in anagrafica, worklog non controllati: ' + senzaEmail.join(', ') + '.');
  const nomeByEmail = {};
  conEmail.forEach(n => { nomeByEmail[emailByNome[n].toLowerCase()] = n; });
  const emails = Object.keys(nomeByEmail);
  const worklog = {}, verificati = [];
  for (let i = 0; i < emails.length; i += CPA_EMAIL_CHUNK) {
    const blocco = emails.slice(i, i + CPA_EMAIL_CHUNK);
    if (!silenzioso) {
      _cpa.msg = '⏳ Leggo i worklog Jira (' + Math.min(i + CPA_EMAIL_CHUNK, emails.length) + '/' + emails.length + ' operatori)…';
      cpaRender();
    }
    const { data: fn, error } = await _sbClient.functions.invoke('jira-sync-worklogs', {
      body: { emails: blocco, startDate: date.iso[0], endDate: date.iso[5] },
    });
    if (error) throw new Error(await _cpEdgeErr(error, 'jira-sync-worklogs'));
    const res = (fn && fn.results) || {}, errs = (fn && fn.errors) || {};
    blocco.forEach(em => {
      const nome = nomeByEmail[em];
      if (errs[em]) { avvisi.push(nome + ': ' + errs[em] + ' (worklog non controllati).'); return; }
      verificati.push(nome);
      const perData = res[em] || {};
      worklog[nome] = {};
      date.iso.forEach((d, g) => {
        const x = perData[d];
        if (x) worklog[nome][g] = { hours: x.hours, tickets: (x.tickets || []).map(t => ({ key: t.key, url: t.url, hours: t.hours, summary: t.summary || '', epic: t.epic || null })) };
      });
    });
  }
  return { worklog, verificati };
}

async function _cpaEpicDeiSottotask(celle, avvisi) {
  const keys = [...new Set(celle.flatMap(c => c.voci.map(v => v.subtask && v.subtask.key).filter(Boolean)))];
  if (!keys.length) return {};
  _cpa.msg = '⏳ Leggo gli Epic dei sottotask…';
  cpaRender();
  const ok = await mlEnsureTaskStatus(keys);
  if (!ok) avvisi.push('Epic dei sottotask letti solo in parte: alcuni confronti Epic sono stati saltati.');
  return _cpaEpicDaCache(keys);
}

function _cpaEpicDaCache(keys) {
  const out = {};
  keys.forEach(k => {
    const tk = _mlTaskBySubtask[k];
    const t = tk && _mlTasks[tk];
    if (t) out[k] = { epicKey: t.epicKey || '', epicName: t.epicName || '', taskKey: t.key, taskSummary: t.summary || '' };
  });
  return out;
}

async function cpaAvvia() {
  if (_cpa.inCorso) return;
  if (!_sbClient || !_sbUser) { _cpa.msg = 'Controllo non disponibile offline: servono le ore Jira.'; cpaRender(); return; }
  _cpaAllinea();
  _cpa.inCorso = true;
  const anno = pwAnno, week = pwWeek;
  _cpa.inCorsoDi = week;
  /* Rilettura completa: le correzioni e le proposte della settimana ripartono da zero */
  _cpa.esito = null; _cpa.soll = null; _cpa.risolte = new Set(); _cpa.proposte = {}; _cpa.propMod = new Set();
  const avvisi = [];
  try {
    const date = _cpaDateSettimana();
    const oggi = _cpaOggiISO();
    const giorniValutabili = [0, 1, 2, 3, 4, 5].filter(g => date.iso[g] < oggi);
    const { celle, operatori } = _cpaCelleSettimana();

    let nomi = [...operatori];
    if (_cpa.tuttoIlPool) {
      (state.operatori || []).forEach(o => {
        const n = o.nome_esteso || o.nome_breve || o.nome;
        if (n && !isOperatoreLicenziato(n)) nomi.push(n);
      });
      nomi = [...new Set(nomi)];
    }
    if (!nomi.length) { _cpa.msg = 'Nessun operatore da controllare in questa settimana.'; return; }

    const { worklog, verificati } = await _cpaLeggiWorklog(nomi, date, avvisi);
    let epicDiSottotask = {};
    try { epicDiSottotask = await _cpaEpicDeiSottotask(celle, avvisi); }
    catch (e) { console.error('cpa epic', e); avvisi.push('Epic dei sottotask non letti (' + (e.message || e) + '): confronto Epic saltato.'); }

    _cpaMemorizza(anno, week, { date, giorniValutabili, worklog, verificati, epicDiSottotask, avvisi, quando: new Date() });
    _cpaRicalcola();
    _cpa.msg = '';
    sbLogActivity('Controllo anomalie produzione', { anno, week, anomalie: _cpa.risultato ? _cpa.risultato.anomalie.length : null });
  } catch (e) {
    console.error('cpaAvvia', e);
    _cpa.msg = '⚠ Controllo non riuscito: ' + (e.message || e);
  } finally {
    _cpa.inCorso = false;
    cpaRender();
  }
}

/* Rilancia il motore sulla Griglia/Ferie ATTUALI con i dati Jira già letti (niente rete) */
function _cpaRicalcola() {
  const B = _cpa.base;
  if (!B || _cpa.anno !== pwAnno || _cpa.week !== pwWeek) return;
  const { celle } = _cpaCelleSettimana();
  const fw = pwGetFerieWeek();
  const r = cpaRileva({
    anno: pwAnno, week: pwWeek, giorniLabel: B.date.label, giorniValutabili: B.giorniValutabili,
    celle, worklog: B.worklog, verificati: B.verificati, epicDiSottotask: B.epicDiSottotask,
    sottotaskIndex: _cpaIndiceSottotask(),
    ferieDi: (op, g) => (fw[op] ? pwFerieTipo(fw[op][g]) : null),
    soglie: { diffOreSquadra: Number(_cpaPref().diffOreSquadra) || CPA_SOGLIE_DEFAULT.diffOreSquadra },
  });
  r.giorniLabel = B.date.label;
  r.ddmm = B.date.ddmm;
  r.avvisi = B.avvisi;
  r.nOperatori = B.verificati.length;
  r.giorniValutabili = B.giorniValutabili;
  r.quando = B.quando;
  _cpa.risultato = r;
}

/* Operatori coinvolti in un'anomalia: per le ore in squadra tutta la squadra del giorno */
function _cpaOperatoriDi(a) {
  if (a.tipo === 'ore_squadra') return ((a.confronto && a.confronto.membri) || []).map(m => m.operatore);
  return [a.operatore];
}

function _cpaEtichetta(a) {
  const r = _cpa.risultato;
  return CPA_TIPI[a.tipo].icona + ' ' + (a.tipo === 'ore_squadra' ? a.squadra : a.operatore) + ' · ' + ((r && r.giorniLabel[a.giorno]) || '');
}

/* Ricontrolla UNA anomalia: rilegge da Jira solo le ore (ed Epic dei sottotask) degli
   operatori coinvolti, poi ricalcola tutto in locale. Serve dopo una correzione fatta su
   Jira (ore spostate o caricate) senza rileggere l'intera settimana. */
async function cpaRicontrollaVoce(el) {
  const a = _cpaTrova(el);
  const B = _cpa.base;
  if (!a || !B || _cpa.inCorso || _cpa.ricontrollo) return;
  if (_cpa.anno !== pwAnno || _cpa.week !== pwWeek) { showAlertModal('Il controllo è di un\'altra settimana: rilancialo.'); return; }
  const nomi = _cpaOperatoriDi(a);
  const etichetta = _cpaEtichetta(a);
  const prima = new Set(_cpa.risultato.anomalie.map(x => x.id));
  _cpa.ricontrollo = a.id;
  cpaRender();
  const anno = _cpa.anno, week = _cpa.week;
  const avvisi = [];
  try {
    const { worklog, verificati } = await _cpaLeggiWorklog(nomi, B.date, avvisi, true);
    verificati.forEach(n => {
      B.worklog[n] = worklog[n] || {};
      if (!B.verificati.includes(n)) B.verificati.push(n);
    });
    /* Epic riletti (non solo cache): il sottotask può essere stato spostato sotto un altro Task */
    const keys = [...new Set(_cpaCelleSettimana().celle.filter(c => nomi.includes(c.operatore))
      .flatMap(c => c.voci.map(v => v.subtask && v.subtask.key).filter(Boolean)))];
    if (keys.length) {
      try { await mlFetchTaskStatus(keys); Object.assign(B.epicDiSottotask, _cpaEpicDaCache(keys)); }
      catch (e) { avvisi.push('Epic non riletti (' + (e.message || e) + ').'); }
    }
    _cpaMemorizza(anno, week, B);
    if (_cpa.anno !== anno || _cpa.week !== week) return;   // nel frattempo si è cambiata settimana
    _cpa.risolte.delete(a.id);
    _cpaRicalcola();
    const dopo = _cpa.risultato.anomalie;
    const ancora = dopo.find(x => x.id === a.id);
    const nuove = dopo.filter(x => !prima.has(x.id) && _cpaOperatoriDi(x).some(n => nomi.includes(n)));
    _cpa.esito = {
      ok: !ancora && !nuove.length,
      testo: etichetta + (ancora ? ': ancora aperta — ' + ancora.titolo + '.' : ': risolta.') +
        (nuove.length ? ' Nuove anomalie per ' + nomi.join(', ') + ': ' + nuove.map(_cpaEtichetta).join('; ') + '.' : '') +
        (avvisi.length ? ' ' + avvisi.join(' ') : ''),
    };
    sbLogActivity('Controllo anomalie: ricontrollo singolo', { anno: pwAnno, week: pwWeek, tipo: a.tipo, operatori: nomi, risolta: !ancora });
  } catch (e) {
    console.error('cpaRicontrollaVoce', e);
    _cpa.esito = { ok: false, testo: '⚠ Ricontrollo di ' + etichetta + ' non riuscito: ' + (e.message || e) };
  } finally {
    _cpa.ricontrollo = null;
    cpaRender();
  }
}

function cpaChiudiEsito() { _cpa.esito = null; cpaRender(); }

function cpaFiltro(tipo) { _cpa.filtro = (_cpa.filtro === tipo) ? '' : tipo; cpaRender(); }
function cpaToggleIgnorate() { _cpa.mostraIgnorate = !_cpa.mostraIgnorate; cpaRender(); }
function cpaTogglePool(el) { _cpa.tuttoIlPool = !!el.checked; }

function cpaSetSogliaOre(el) {
  const p = _cpaPref();
  p.diffOreSquadra = Number(el.value) || CPA_SOGLIE_DEFAULT.diffOreSquadra;
  try { localStorage.setItem(CPA_PREF_KEY, JSON.stringify(p)); } catch (_) {}
  _cpaRicalcola();
  cpaRender();
}

function _cpaTrova(el) {
  const id = el && el.closest('[data-cpa-id]') && el.closest('[data-cpa-id]').dataset.cpaId;
  const r = _cpa.risultato;
  return (r && id) ? r.anomalie.find(a => a.id === id) : null;
}

function cpaIgnora(el) {
  const a = _cpaTrova(el);
  if (!a) return;
  const m = _cpaIgnorate();
  if (m[a.id]) delete m[a.id]; else m[a.id] = Date.now();
  _cpaSalvaIgnorate(m);
  cpaRender();
}

/* Chiude il modal e porta in vista la riga del Controllo Produzione (riapre commessa/squadra collassate). */
function cpaVaiAllaRiga(el) {
  const a = _cpaTrova(el);
  const cpKey = (el && el.dataset.cpk) || (a && a.cpKey);
  if (!cpKey) return;
  const tr = [...document.querySelectorAll('.cp-table tbody tr[data-cpk]')].find(x => x.dataset.cpk === cpKey);
  if (!tr) { showAlertModal('Riga non trovata nella tabella (la cella potrebbe essere stata modificata in Griglia).'); return; }
  cpaChiudi();
  const ci = tr.dataset.commIdx, si = tr.dataset.sqIdx;
  _collapseSets('cp').comm.delete(ci); _collapseSets('cp').comm.delete(Number(ci)); _collapseSets('cp').sq.delete(si);
  cpApplyCollapse();
  tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tr.classList.remove('cpa-flash'); void tr.offsetWidth; tr.classList.add('cpa-flash');
}

/* ---------- Proposta di cella (worklog senza pianificazione), modificabile ---------- */

function _cpaPropVoci(a) {
  if (!_cpa.proposte[a.id]) {
    const v = ((a.azione && a.azione.voci) || []).map(x => ({ commessa: x.commessa || '', cantiere: x.cantiere || '', attivita: x.attivita || '' }));
    _cpa.proposte[a.id] = v.length ? v : [{ commessa: '', cantiere: '', attivita: '' }];
  }
  return _cpa.proposte[a.id];
}

function cpaPropEdit(el) {
  const a = _cpaTrova(el);
  if (!a) return;
  const v = _cpaPropVoci(a)[Number(el.dataset.i)];
  if (v) { v[el.dataset.f] = el.value; _cpa.propMod.add(a.id); }
}

function cpaPropAggiungi(el) {
  const a = _cpaTrova(el);
  if (!a) return;
  _cpaPropVoci(a).push({ commessa: '', cantiere: '', attivita: '' });
  _cpa.propMod.add(a.id);
  cpaRender();
}

function cpaPropTogli(el) {
  const a = _cpaTrova(el);
  if (!a) return;
  const voci = _cpaPropVoci(a);
  voci.splice(Number(el.dataset.i), 1);
  if (!voci.length) voci.push({ commessa: '', cantiere: '', attivita: '' });
  _cpa.propMod.add(a.id);
  cpaRender();
}

function cpaPropRipristina(el) {
  const a = _cpaTrova(el);
  if (!a) return;
  delete _cpa.proposte[a.id];
  _cpa.propMod.delete(a.id);
  cpaRender();
}

function _cpaCommesseNote() {
  let valide = [];
  try { valide = pwGetCommesseValide(); } catch (_) {}
  return [...new Set(valide.concat(pwGetWeekData().map(b => b.commessa).filter(Boolean)))];
}

async function cpaAzione(el) {
  if (!sbGuardWrite()) return;
  const a = _cpaTrova(el);
  if (!a || !a.azione || a.azione.tipo !== 'aggiungi_griglia') return;
  const r = _cpa.risultato;
  if (_cpa.anno !== pwAnno || _cpa.week !== pwWeek) { showAlertModal('Il controllo è di un\'altra settimana: rilancialo.'); return; }
  const az = a.azione;
  const giorno = r.giorniLabel[az.giorno];
  const note = _cpaCommesseNote();
  const canon = s => note.find(n => _apNorm(n) === _apNorm(s)) || s;
  const voci = _cpaPropVoci(a)
    .map(v => ({ commessa: canon(String(v.commessa || '').trim()), cantiere: String(v.cantiere || '').trim(), attivita: String(v.attivita || '').trim() }))
    .filter(v => v.commessa || v.cantiere || v.attivita);
  if (!voci.length || voci.some(v => !v.commessa || !v.cantiere)) { showAlertModal('Indica commessa e cantiere per ogni riga della proposta.'); return; }

  const data = pwGetWeekData();
  const fw = pwGetFerieWeek();
  const assente = fw[az.operatore] ? pwFerieTipo(fw[az.operatore][az.giorno]) : null;
  const occupato = data.some(bc => (bc.squadre || []).some(sq => (sq.operatori || []).some(o =>
    (o.nome || '').trim() === az.operatore && pwCellCantieri((o.giorni || {})[az.giorno]).length)));
  if (occupato && !assente) { showAlertModal('Nel frattempo ' + az.operatore + ' risulta già pianificato ' + giorno + ': nessuna modifica. Rilancia il controllo.'); return; }
  const fuoriElenco = voci.filter(v => !note.some(n => _apNorm(n) === _apNorm(v.commessa))).map(v => v.commessa);

  const ok = await showConfirmAsync('Aggiungere in Griglia ' + az.operatore + ' — ' + giorno + ':\n\n' +
    voci.map(v => '• ' + v.cantiere + (v.attivita ? ' (' + v.attivita + ')' : '') + ' — commessa "' + v.commessa + '"').join('\n') +
    (assente ? '\n\nL\'assenza di quel giorno (' + (assente === 'ferie' ? 'ferie' : 'non disponibile') + ') verrà tolta da Ferie.' : '') +
    (fuoriElenco.length ? '\n\n⚠ Commessa non presente fra quelle attive né in Griglia: ' + [...new Set(fuoriElenco)].join(', ') + ' (verrà creata nella settimana).' : '') +
    '\n\nLa modifica riguarda solo la Griglia: su Jira non cambia nulla.', 'Aggiungi in Griglia');
  if (!ok) return;

  const toccate = new Set();
  voci.forEach(v => {
    let bc = data.find(x => _apNorm(x.commessa) === _apNorm(v.commessa));
    if (!bc) { bc = { commessa: v.commessa, squadre: [] }; data.push(bc); }
    if (!Array.isArray(bc.squadre)) bc.squadre = [];
    /* Va nella squadra di chi quel giorno è già sullo stesso cantiere */
    const compagni = bc.squadre.flatMap(sq => sq.operatori || [])
      .filter(o => pwCellVoci((o.giorni || {})[az.giorno]).some(x => _apNorm(x.cantiere) === _apNorm(v.cantiere)))
      .map(o => (o.nome || '').trim());
    const op = _apRigaOperatore(bc, az.operatore, compagni);
    if (!op.giorni) op.giorni = {};
    if (_apScriviCella(op, az.giorno, v.cantiere, v.attivita)) toccate.add(bc);
  });
  data.forEach((bc, i) => { if (toccate.has(bc)) pwRinumeraSquadreDefault(i); });
  if (assente) {
    delete fw[az.operatore][az.giorno];
    await pwFerieSave();
  }
  await pwSave();
  pwRender();
  _cpa.risolte.add(a.id);
  delete _cpa.proposte[a.id];
  sbLogActivity('Controllo anomalie: cella aggiunta in Griglia', { anno: pwAnno, week: pwWeek, operatore: az.operatore, giorno: az.giorno,
    cantieri: voci.map(v => v.cantiere), togliAssenza: !!assente });
  _cpaRicalcola();
  pwControlloRender();
}

async function cpaCopia() {
  const r = _cpa.risultato;
  if (!r) return;
  const ign = _cpaIgnorate();
  const lista = r.anomalie.filter(a => !ign[a.id] && !_cpa.risolte.has(a.id) && (!_cpa.filtro || a.tipo === _cpa.filtro));
  const testo = cpaTestoCorrezioni(lista, r.giorniLabel, 'Controllo produzione · settimana ' + _cpa.week + '/' + _cpa.anno + ' · correzioni proposte');
  try { await navigator.clipboard.writeText(testo); showAlertModal('Elenco copiato negli appunti (' + lista.length + ' voci).'); }
  catch (_) { showAlertModal(testo); }
}

/* ==================== RENDER ==================== */

const CPA_GRAVITA = {
  alta:  { colore: '#dc2626', sfondo: '#fef2f2', testo: 'priorità alta' },
  media: { colore: '#d97706', sfondo: '#fffbeb', testo: 'da verificare' },
  bassa: { colore: '#94a3b8', sfondo: '#f8fafc', testo: 'lieve' },
};

const CPA_CERTEZZA = {
  alta:    { colore: '#15803d', testo: 'proposta sicura' },
  media:   { colore: '#b45309', testo: 'proposta probabile' },
  bassa:   { colore: '#b91c1c', testo: 'proposta da verificare' },
  nessuna: { colore: '#64748b', testo: 'da compilare' },
};

function _cpaS(v) { return esc(v == null ? '' : String(v)); }

function _cpaH(n) { return _cpaS(_cpaFmt(n)) + ' h'; }

function _cpaLink(label, url) {
  if (!url) return '<span class="font-mono text-[11px] text-slate-600">' + _cpaS(label) + '</span>';
  return '<a href="' + _cpaS(url) + '" target="_blank" rel="noopener" class="font-mono text-[11px]" style="color:#2563eb;">' + _cpaS(label) + ' ↗</a>';
}

function _cpaColonna(titolo, colore, contenuto) {
  return '<div class="rounded-md border p-2 min-w-0" style="border-color:' + colore + '33;background:' + colore + '0a;">' +
    '<div class="text-[11px] font-bold uppercase tracking-wide mb-1" style="color:' + colore + ';">' + titolo + '</div>' + contenuto + '</div>';
}

function _cpaConfronto(sx, dx) {
  return '<div class="grid gap-2 mt-2" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));">' +
    _cpaColonna('📅 In Griglia', '#0f766e', sx) + _cpaColonna('🎫 Su Jira', '#4f46e5', dx) + '</div>';
}

/* Una voce di Griglia: cantiere in grassetto, poi attività e commessa/squadra */
function _cpaVoceG(v, extra) {
  return '<div class="text-xs leading-5"><b class="text-slate-800">' + _cpaS(v.cantiere) + '</b>' +
    (v.attivita ? ' <span class="text-slate-500">· ' + _cpaS(v.attivita) + '</span>' : '') +
    '<span class="text-slate-400"> · ' + _cpaS([v.commessa, v.squadra].filter(Boolean).join(' / ')) + '</span>' +
    (v.subtask ? ' ' + _cpaLink(v.subtask.key, v.subtask.url) : '') + (extra || '') + '</div>';
}

function _cpaTicketJ(t, evidenzia) {
  const dove = t.dove
    ? '<div class="text-[11px]" style="color:#0f766e;">→ in Griglia è il cantiere <b>' + _cpaS(t.dove.cantiere) + '</b>' +
        (t.dove.attivita ? ' (' + _cpaS(t.dove.attivita) + ')' : '') + ', commessa ' + _cpaS(t.dove.commessa) +
        (t.dove.fonte === 'task' ? ' <span class="text-slate-400">(Task padre)</span>' : '') +
        (t.dove.week && (t.dove.week !== _cpa.week || t.dove.anno !== _cpa.anno) ? ' <span class="text-slate-400">(sottotask della sett. ' + _cpaS(t.dove.week) + ')</span>' : '') + '</div>'
    : '<div class="text-[11px] text-slate-400">non collegato a un cantiere della Griglia</div>';
  return '<div class="text-xs leading-5 rounded px-1.5 py-1 mb-1" style="' + (evidenzia ? 'background:#fee2e2;' : 'background:#fff;') + '">' +
    _cpaLink(t.key, t.url) + ' <b>' + _cpaH(t.hours) + '</b>' +
    (t.summary ? ' <span class="text-slate-600">· ' + _cpaS(t.summary) + '</span>' : '') +
    (t.epic ? '<div class="text-[11px] ' + (evidenzia ? 'font-semibold' : 'text-slate-500') + '" style="' + (evidenzia ? 'color:#b91c1c;' : '') + '">Epic ' + _cpaS(t.epic.name || t.epic.key) + '</div>' : '') +
    dove + '</div>';
}

/* Settimana dell'operatore in una riga di 6 caselle, col giorno dell'anomalia evidenziato */
function _cpaStriscia(settimana, giorno, r) {
  return '<div class="grid gap-1 mt-1.5" style="grid-template-columns:repeat(6,minmax(0,1fr));">' + settimana.map(s => {
    const sel = s.giorno === giorno;
    const cant = vv => vv.map(v => v.cantiere).filter((x, i, a) => a.indexOf(x) === i).join(', ');
    const txt = s.ferie ? (s.ferie === 'ferie' ? '🏖 ferie' : '⛔ n.d.') + ((s.vociInFerie || []).length ? ' · ' + cant(s.vociInFerie) : '')
      : (s.voci.length ? cant(s.voci) : '—');
    return '<div class="rounded px-1 py-0.5 text-[10px] leading-4 min-w-0" style="' +
      (sel ? 'outline:2px solid #dc2626;background:#fff;' : 'background:#f1f5f9;') + '" title="' + _cpaS(txt) + '">' +
      '<div class="font-semibold ' + (sel ? '' : 'text-slate-500') + '" style="' + (sel ? 'color:#dc2626;' : '') + '">' + CPA_GIORNI[s.giorno] + '</div>' +
      '<div class="truncate ' + (s.voci.length || s.ferie ? 'text-slate-700' : 'text-slate-300') + '">' + _cpaS(txt) + '</div></div>';
  }).join('') + '</div>';
}

function _cpaPropostaHtml(a, r) {
  const az = a.azione;
  const voci = _cpaPropVoci(a);
  const C = CPA_CERTEZZA[az.certezza] || CPA_CERTEZZA.nessuna;
  const inp = 'border border-slate-300 rounded px-1.5 py-1 text-xs bg-white min-w-0';
  const righe = voci.map((v, i) =>
    '<div class="grid gap-1 items-center mt-1" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) auto;">' +
      '<input type="text" list="cpa-dl-commesse" placeholder="Commessa" data-i="' + i + '" data-f="commessa" oninput="cpaPropEdit(this)" value="' + _cpaS(v.commessa) + '" class="' + inp + '">' +
      '<input type="text" list="cpa-dl-cantieri" placeholder="Cantiere" data-i="' + i + '" data-f="cantiere" oninput="cpaPropEdit(this)" value="' + _cpaS(v.cantiere) + '" class="' + inp + '">' +
      '<input type="text" list="cpa-dl-attivita" placeholder="Attività" data-i="' + i + '" data-f="attivita" oninput="cpaPropEdit(this)" value="' + _cpaS(v.attivita) + '" class="' + inp + '">' +
      '<button type="button" data-i="' + i + '" onclick="cpaPropTogli(this)" class="text-xs px-1.5 text-slate-400 hover:text-rose-600" title="Togli questa riga">✕</button>' +
    '</div>').join('');
  return '<div class="rounded-md border mt-2 p-2" style="border-color:#99f6e4;background:#f0fdfa;">' +
    '<div class="flex flex-wrap items-center gap-2">' +
      '<span class="text-xs font-bold" style="color:#0f766e;">✏️ Modifica proposta in Griglia · ' + _cpaS(r.giorniLabel[az.giorno]) + '</span>' +
      '<span class="text-[11px] font-semibold rounded-full px-2" style="background:#fff;color:' + C.colore + ';border:1px solid ' + C.colore + '55;">' + C.testo + '</span>' +
      '<span class="text-[11px] text-slate-500">' + _cpaS(az.fonte) + '</span>' +
    '</div>' +
    '<div class="grid gap-1 mt-1.5 text-[10px] font-semibold uppercase text-slate-400" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) auto;"><span>Commessa</span><span>Cantiere</span><span>Attività</span><span style="width:22px;"></span></div>' +
    righe +
    '<div class="flex flex-wrap items-center gap-2 mt-2">' +
      '<button type="button" onclick="cpaAzione(this)" class="pw-write-action text-xs px-3 py-1 rounded font-semibold text-white" style="background:#0f766e;">✓ ' +
        (az.togliAssenza ? 'Togli assenza e aggiungi in Griglia' : 'Aggiungi in Griglia') + '</button>' +
      '<button type="button" onclick="cpaPropAggiungi(this)" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50">＋ altro cantiere</button>' +
      (_cpa.propMod.has(a.id) ? '<button type="button" onclick="cpaPropRipristina(this)" class="text-xs text-slate-500 hover:text-slate-800">↺ proposta iniziale</button>' : '') +
      '<span class="text-[11px] text-slate-500">' + _cpaS(a.operatore) + ' entra nella squadra di chi è già su quel cantiere, altrimenti nella sua riga della commessa.</span>' +
    '</div></div>';
}

function _cpaCorpo(a, r) {
  const C = a.confronto || {};
  if (a.tipo === 'pianificato_senza_worklog') {
    return _cpaConfronto(
      (C.griglia || []).map(v => _cpaVoceG(v)).join(''),
      '<div class="text-sm font-semibold" style="color:#b91c1c;">' + (C.oreJira > 0 ? _cpaH(C.oreJira) : 'Nessuna ora registrata') + '</div>' +
        (C.jira || []).map(t => _cpaTicketJ(t, false)).join(''));
  }
  if (a.tipo === 'worklog_senza_pianificazione') {
    const stato = C.assenza
      ? '<div class="text-sm font-semibold" style="color:#b91c1c;">' + (C.assenza === 'ferie' ? '🏖 In ferie' : '⛔ Non disponibile') + '</div>'
      : '<div class="text-sm font-semibold" style="color:#b91c1c;">Nessun cantiere pianificato</div>';
    return _cpaConfronto(
      stato + '<div class="text-[11px] text-slate-500 mt-1">La sua settimana in Griglia:</div>' + _cpaStriscia(C.settimana || [], C.giorno, r),
      '<div class="text-sm font-semibold text-slate-800 mb-1">' + _cpaH(C.oreJira) + ' registrate</div>' + (C.jira || []).map(t => _cpaTicketJ(t, false)).join('')) +
      _cpaPropostaHtml(a, r);
  }
  if (a.tipo === 'epic_diverso') {
    return _cpaConfronto(
      (C.griglia || []).map(v => _cpaVoceG(v, v.epic ? '<div class="text-[11px] text-slate-500">Epic ' + _cpaS(v.epic.name) + '</div>' : '<div class="text-[11px] text-slate-400">senza sottotask: Epic non noto</div>')).join(''),
      (C.jira || []).map(t => _cpaTicketJ(t, t.fuori)).join(''));
  }
  if (a.tipo === 'ore_squadra') {
    const max = C.max || 1;
    return '<div class="rounded-md border border-slate-200 bg-white p-2 mt-2">' + (C.membri || []).map(m => {
      const w = m.escluso ? 0 : Math.max(2, Math.round(m.ore / max * 100));
      const col = m.basso ? '#d97706' : '#0f766e';
      const nota = m.piuSquadre ? 'su più squadre quel giorno: escluso dal confronto'
        : (m.escluso ? 'nessuna ora: vedi ⏱ Pianificati senza worklog' : (m.basso ? '−' + _cpaFmt(Math.round((C.max - m.ore) * 100) / 100) + ' h rispetto al più alto' : ''));
      return '<div class="grid items-center gap-2 py-0.5" style="grid-template-columns:minmax(110px,180px) minmax(0,1fr) 56px;">' +
        '<button type="button" data-cpk="' + _cpaS(m.cpKey) + '" onclick="cpaVaiAllaRiga(this)" class="text-xs text-left truncate hover:underline ' + (m.basso ? 'font-semibold' : 'text-slate-700') + '" style="' + (m.basso ? 'color:#b45309;' : '') + '" title="Vai alla riga in Controllo Produzione">' + _cpaS(m.operatore) + '</button>' +
        '<div class="min-w-0"><div style="height:10px;border-radius:5px;background:#f1f5f9;overflow:hidden;"><div style="height:10px;width:' + w + '%;background:' + col + ';"></div></div>' +
          (nota ? '<div class="text-[10px] ' + (m.basso ? '' : 'text-slate-400') + '" style="' + (m.basso ? 'color:#b45309;' : '') + '">' + _cpaS(nota) + '</div>' : '') + '</div>' +
        '<div class="text-xs text-right font-semibold ' + (m.escluso ? 'text-slate-400' : '') + '" style="' + (m.basso ? 'color:#b45309;' : '') + '">' + (m.escluso && !m.piuSquadre ? '0 h' : _cpaH(m.ore)) + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }
  return '';
}

/* Etichetta sulle anomalie già coperte da un sollecito inviato (vedi produzione-anomalie-solleciti.js) */
function _cpaTagSollecito(a) {
  if (!a.solleciti || !a.solleciti.length) return '';
  const inv = _cpaSollInviati(_cpa.anno, _cpa.week);
  const fatti = a.solleciti.filter(s => inv[s.operatore] && (inv[s.operatore].giorni || []).includes(s.giorno));
  if (!fatti.length) return '';
  return ' <span class="text-[11px] font-semibold" style="color:#15803d;">✉️ sollecitato' + (a.solleciti.length > 1 ? ': ' + _cpaS(fatti.map(s => s.operatore).join(', ')) : '') +
    ' il ' + new Date(inv[fatti[0].operatore].ts).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + '</span>';
}

function _cpaSchedaHtml(a, r, ignorata) {
  const T = CPA_TIPI[a.tipo];
  const G = CPA_GRAVITA[a.gravita] || CPA_GRAVITA.bassa;
  const dove = a.tipo === 'worklog_senza_pianificazione' ? '' : [a.commessa, a.squadra, a.cantiere].filter(Boolean).map(_cpaS).join(' · ');
  const inRic = _cpa.ricontrollo === a.id;
  let bottoni = ignorata ? '' : '<button type="button" onclick="cpaRicontrollaVoce(this)" class="text-xs px-2 py-0.5 border rounded bg-white hover:bg-amber-50" style="border-color:#fcd34d;color:#b45309;' +
    (_cpa.ricontrollo && !inRic ? 'opacity:.5;' : '') + '"' + (_cpa.ricontrollo ? ' disabled' : '') +
    ' title="Rilegge da Jira solo le ore di ' + _cpaS(_cpaOperatoriDi(a).join(', ')) + ' e ricalcola (dopo una correzione fatta su Jira)">' +
    (inRic ? '⏳ Ricontrollo…' : '↻ Ricontrolla') + '</button>';
  if (a.cpKey && a.tipo !== 'ore_squadra') bottoni += '<button type="button" onclick="cpaVaiAllaRiga(this)" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50">↘ Vai alla riga</button>';
  bottoni += (a.link || []).filter(l => l.url).map(l =>
    '<a href="' + _cpaS(l.url) + '" target="_blank" rel="noopener" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50" style="color:#2563eb;text-decoration:none;">' + _cpaS(l.label) + ' ↗</a>').join('');
  return '<div class="bg-white border border-slate-200 rounded-lg mt-2" data-cpa-id="' + _cpaS(a.id) + '" style="border-left:4px solid ' + G.colore + ';padding:10px 12px;' + (ignorata ? 'opacity:.5;' : '') + '">' +
    '<div class="flex items-start gap-2">' +
      '<span class="text-lg leading-6" title="' + _cpaS(T.etichetta) + '">' + T.icona + '</span>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">' +
          '<span class="text-sm font-semibold text-slate-800">' + _cpaS(a.titolo) + '</span>' +
          '<span class="text-[10px] font-bold uppercase rounded px-1.5" style="color:' + G.colore + ';background:' + G.sfondo + ';">' + G.testo + '</span>' +
          _cpaTagSollecito(a) +
          '<div class="flex-1"></div>' +
          '<button type="button" onclick="cpaIgnora(this)" class="text-xs text-slate-400 hover:text-slate-800" title="' + (ignorata ? 'Rimetti fra le anomalie aperte' : 'Nascondi questa anomalia (solo su questo browser)') + '">' + (ignorata ? '↩ Ripristina' : 'Ignora') + '</button>' +
        '</div>' +
        (dove ? '<div class="text-[11px] text-slate-500">' + dove + '</div>' : '') +
        (ignorata ? '' : _cpaCorpo(a, r)) +
        '<div class="text-xs mt-2" style="color:#0f766e;">💡 ' + _cpaS(a.correzione) + '</div>' +
        (bottoni ? '<div class="flex flex-wrap items-center gap-1.5 mt-1.5">' + bottoni + '</div>' : '') +
      '</div>' +
    '</div></div>';
}

function _cpaDatalist(id, valori) {
  return '<datalist id="' + id + '">' + [...new Set(valori.filter(Boolean))].sort((x, y) => x.localeCompare(y))
    .map(v => '<option value="' + _cpaS(v) + '"></option>').join('') + '</datalist>';
}

function _cpaDatalists() {
  const data = pwGetWeekData();
  const cantieri = [], attivita = [];
  data.forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(o => {
    for (let g = 0; g < 6; g++) pwCellVoci((o.giorni || {})[g]).forEach(v => { cantieri.push(v.cantiere); attivita.push(v.attivita); });
  })));
  Object.values(_cpa.proposte).forEach(vs => vs.forEach(v => { cantieri.push(v.cantiere); attivita.push(v.attivita); }));
  return _cpaDatalist('cpa-dl-commesse', _cpaCommesseNote()) + _cpaDatalist('cpa-dl-cantieri', cantieri) + _cpaDatalist('cpa-dl-attivita', attivita);
}

function _cpaIntestazione(r) {
  const d = _cpaDateSettimana();
  const btn = 'text-xs px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50';
  return '<div style="background:white;padding:14px 20px 0;border-bottom:1px solid #e2e8f0;">' +
    '<div class="flex flex-wrap items-start gap-2">' +
      '<div class="min-w-0">' +
        '<div style="font-weight:700;font-size:16px;color:#0f172a;font-family:var(--font-display);">🔍 Controllo anomalie</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">Settimana ' + pwWeek + ' · ' + d.ddmm[0] + ' – ' + d.ddmm[5] + ' · Griglia confrontata con le ore Jira. Propone correzioni, su Jira non scrive mai. Le modifiche in Griglia si vedono subito; dopo una correzione su Jira usa ↻ sulla singola anomalia.' +
          '</div>' + _cpaLetturaHtml(r) +
      '</div>' +
      '<div class="flex-1"></div>' +
      '<label class="text-xs text-slate-600 flex items-center gap-1 mt-1" title="Legge i worklog anche degli operatori del pool che non compaiono in Griglia questa settimana (più lento)">' +
        '<input type="checkbox" onchange="cpaTogglePool(this)"' + (_cpa.tuttoIlPool ? ' checked' : '') + '> anche chi non è in Griglia</label>' +
      '<button type="button" onclick="cpaRegistroApri()" class="' + btn + '" style="color:#047857;border-color:#6ee7b7;" title="Chi è già stato sollecitato: resta salvato anche dopo aver chiuso la dashboard">📒 Registro solleciti' + (_cpaRegistroConta() ? ' (' + _cpaRegistroConta() + ')' : '') + '</button>' +
      '<button type="button" onclick="cpaAvvia()" class="text-xs px-3 py-1 rounded font-semibold text-white" style="background:#b45309;' + (_cpa.inCorso ? 'opacity:.55;' : '') + '"' + (_cpa.inCorso ? ' disabled' : '') + ' title="Rilegge worklog ed Epic da Jira">' + (r ? '↻ Ricontrolla' : '▶ Avvia controllo') + '</button>' +
      '<button type="button" onclick="cpaChiudi()" class="' + btn + '">Chiudi</button>' +
    '</div>' +
    _cpaSchede(r) +
  '</div>';
}

/* Quando sono stati letti i dati Jira: in evidenza se non oggi (vanno aggiornati con Ricontrolla) */
function _cpaLetturaHtml(r) {
  if (_cpa.inCorso && _cpa.inCorsoDi !== pwWeek) return '<div class="text-[11px] mt-0.5" style="color:#b45309;">⏳ È in corso il controllo della settimana ' + _cpaS(_cpa.inCorsoDi) + ': attendi che finisca.</div>';
  if (!r || !r.quando) return '';
  const q = r.quando;
  const oggi = q.toDateString() === new Date().toDateString();
  const ora = q.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const testo = oggi ? 'Ore Jira lette oggi alle ' + ora
    : 'Ore Jira lette il ' + q.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' alle ' + ora + ': premi ↻ Ricontrolla per aggiornarle';
  return '<div class="text-[11px] mt-0.5 ' + (oggi ? 'text-slate-500' : 'font-semibold') + '" style="' + (oggi ? '' : 'color:#b45309;') + '">🕘 ' + _cpaS(testo) + '.</div>';
}

/* Linguette: Tutte + una per controllo, col numero di anomalie aperte */
function _cpaSchede(r) {
  if (!r || _cpa.inCorso) return '<div style="height:12px;"></div>';
  const ign = _cpaIgnorate();
  const conta = {};
  let tot = 0;
  r.anomalie.forEach(a => { if (!ign[a.id] && !_cpa.risolte.has(a.id)) { conta[a.tipo] = (conta[a.tipo] || 0) + 1; tot++; } });
  const tab = (tipo, testo, n) => {
    const on = _cpa.filtro === tipo;
    return '<button type="button" data-tipo="' + tipo + '" onclick="cpaFiltro(this.dataset.tipo)" class="text-xs px-3 py-2 whitespace-nowrap" style="border-bottom:3px solid ' + (on ? '#b45309' : 'transparent') + ';' +
      (on ? 'color:#0f172a;font-weight:700;' : 'color:#475569;') + '">' + testo +
      ' <span class="rounded-full px-1.5 text-[11px] font-bold" style="' + (n ? 'background:#fef3c7;color:#92400e;' : 'background:#f1f5f9;color:#94a3b8;') + '">' + n + '</span></button>';
  };
  return '<div class="flex flex-wrap gap-1 mt-2" style="margin-bottom:-1px;">' + tab('', 'Tutte', tot) +
    Object.keys(CPA_TIPI).map(t => tab(t, CPA_TIPI[t].icona + ' ' + CPA_TIPI[t].etichetta, conta[t] || 0)).join('') + '</div>';
}

function _cpaBarra(r, attive, ign) {
  const nIgn = attive.filter(a => ign[a.id]).length;
  const nAperte = attive.length - nIgn;
  const desc = _cpa.filtro ? CPA_TIPI[_cpa.filtro].descrizione : 'Tutti i controlli, giorno per giorno.';
  const soglia = Number(_cpaPref().diffOreSquadra);
  const opzSoglia = CPA_SOGLIE_ORE.map(v => '<option value="' + v + '"' + (v === soglia ? ' selected' : '') + '>' + String(v).replace('.', ',') + ' h</option>').join('');
  return '<div class="flex flex-wrap items-center gap-2" style="padding:8px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">' +
    '<span class="text-xs text-slate-600">' + _cpaS(desc) + '</span>' +
    '<div class="flex-1"></div>' +
    (!_cpa.filtro || _cpa.filtro === 'ore_squadra'
      ? '<label class="text-xs text-slate-600 flex items-center gap-1" title="Segnala un operatore quando ha almeno queste ore in meno del collega di squadra con più ore">⚖️ scarto minimo <select onchange="cpaSetSogliaOre(this)" class="border border-slate-300 rounded px-1 py-0.5 text-xs bg-white">' + opzSoglia + '</select></label>'
      : '') +
    (nIgn ? '<button type="button" onclick="cpaToggleIgnorate()" class="text-xs text-slate-500 hover:text-slate-800">' + (_cpa.mostraIgnorate ? 'Nascondi' : 'Mostra') + ' ignorate (' + nIgn + ')</button>' : '') +
    (attive.some(a => a.solleciti && a.solleciti.length && !ign[a.id]) ? '<button type="button" onclick="cpaSollApri()" class="text-xs px-2 py-0.5 rounded font-semibold text-white" style="background:#4f46e5;" title="Bozze di messaggio per chi non ha caricato le ore su Jira o ne ha meno dei colleghi di squadra">✉️ Prepara solleciti' + (_cpaSollDaInviare().length ? ' (' + _cpaSollDaInviare().length + ' da inviare)' : ' · tutti inviati') + '</button>' : '') +
    (nAperte ? '<button type="button" onclick="cpaCopia()" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50">📋 Copia elenco</button>' : '') +
  '</div>';
}

function _cpaListaHtml(r, attive, ign) {
  const nv = r.nonVerificabili;
  const valutati = r.giorniValutabili.length
    ? 'ore attese fino a ' + r.giorniLabel[r.giorniValutabili[r.giorniValutabili.length - 1]]
    : 'settimana non ancora iniziata: nessuna ora attesa';
  const note = [
    r.nOperatori + ' operatori controllati su Jira, ' + valutati + '.',
    nv.epicSenzaSottotask ? nv.epicSenzaSottotask + ' giornate con ore ma senza sottotask in Griglia: Epic non confrontabile.' : '',
  ].concat(r.avvisi).filter(Boolean);
  let html = '';
  if (_cpa.esito) {
    const E = _cpa.esito;
    html += '<div class="flex items-start gap-2 rounded-md border px-3 py-2 mb-2 text-sm" style="' +
      (E.ok ? 'background:#f0fdf4;border-color:#86efac;color:#166534;' : 'background:#fffbeb;border-color:#fcd34d;color:#92400e;') + '">' +
      '<span>' + (E.ok ? '✅' : '↻') + '</span><span class="flex-1">' + _cpaS(E.testo) + '</span>' +
      '<button type="button" onclick="cpaChiudiEsito()" class="text-xs opacity-70 hover:opacity-100" title="Chiudi">✕</button></div>';
  }
  html += '<div class="text-[11px] text-slate-500">' + note.map(_cpaS).join('<br>') + '</div>';
  const lista = attive.filter(a => (_cpa.mostraIgnorate || !ign[a.id]) && (!_cpa.filtro || a.tipo === _cpa.filtro));
  if (!lista.length) {
    html += '<div class="text-sm mt-6 text-center" style="color:#15803d;">✅ ' + (_cpa.filtro ? 'Nessuna anomalia di questo tipo.' : 'Nessuna anomalia aperta per questa settimana.') + '</div>';
  }
  for (let g = 0; g < 6; g++) {
    const delGiorno = lista.filter(a => a.giorno === g);
    if (!delGiorno.length) continue;
    const dd = r.giorniLabel[g].split(' ')[1] || '';
    html += '<div class="mt-4">' +
      '<div class="flex items-center gap-2" style="position:sticky;top:0;background:#f8fafc;padding:4px 0;z-index:1;">' +
        '<span class="text-sm font-bold text-slate-800">📅 ' + CPA_GIORNI_LUNGHI[g] + ' ' + _cpaS(dd) + '</span>' +
        '<span class="text-xs text-slate-500">' + delGiorno.length + (delGiorno.length === 1 ? ' anomalia' : ' anomalie') + '</span>' +
        '<div style="flex:1;height:1px;background:#e2e8f0;"></div>' +
      '</div>' +
      delGiorno.map(a => _cpaSchedaHtml(a, r, !!ign[a.id])).join('') +
    '</div>';
  }
  if (_cpa.risolte.size) html += '<div class="text-[11px] text-slate-500 mt-3">' + _cpa.risolte.size + ' correzioni applicate in Griglia in questa sessione.</div>';
  return html;
}

function cpaRender() {
  _cpaAllinea();
  const modal = document.getElementById('cpa-modal');
  const root = document.getElementById('cpa-root');
  const btn = document.getElementById('cpa-toggle');
  const r = (_cpa.risultato && _cpa.anno === pwAnno && _cpa.week === pwWeek) ? _cpa.risultato : null;
  const ign = _cpaIgnorate();
  const attive = r ? r.anomalie.filter(a => !_cpa.risolte.has(a.id)) : [];
  const nAperte = attive.filter(a => !ign[a.id]).length;
  if (btn) btn.innerHTML = '🔍 Controllo anomalie' + (r && nAperte ? ' <span style="background:#fff;color:#b45309;border-radius:9px;padding:0 6px;font-weight:700;">' + nAperte + '</span>' : '');
  if (!modal || !root) return;
  modal.style.display = _cpa.aperto ? 'flex' : 'none';
  if (!_cpa.aperto) return;

  /* Il ridisegno non deve far perdere la posizione di lettura nella stessa vista */
  const vista = _cpa.registro ? 'registro' : (_cpa.soll && r && !_cpa.inCorso ? 'soll' : 'lista|' + _cpa.filtro);
  const prima = document.getElementById('cpa-body');
  const scroll = (prima && _cpa._vista === vista) ? prima.scrollTop : 0;
  _cpa._vista = vista;

  const corpo = h => '<div id="cpa-body" style="flex:1;overflow:auto;padding:12px 20px 20px;">' + h + '</div>';
  if (vista === 'registro') root.innerHTML = corpo(_cpaRegistroHtml());
  else if (vista === 'soll') root.innerHTML = corpo(_cpaSollHtml(r));
  else {
    let h = '';
    if (_cpa.msg) h += '<div class="text-sm mt-6 text-center ' + (_cpa.msg.startsWith('⚠') ? 'text-rose-700' : 'text-slate-600') + '">' + _cpaS(_cpa.msg) + '</div>';
    if (r && !_cpa.inCorso) h += _cpaListaHtml(r, attive, ign);
    root.innerHTML = _cpaIntestazione(r) + (r && !_cpa.inCorso ? _cpaBarra(r, attive, ign) : '') + corpo(h) + _cpaDatalists();
  }
  const dopo = document.getElementById('cpa-body');
  if (dopo && scroll) dopo.scrollTop = scroll;
}
