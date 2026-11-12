/* ==================== PIANIFICAZIONE · CHIUSURA SETTIMANA GUIDATA (chs*, v18.259.0) ====================
   «🏁 Chiusura settimana» (toolbar della Griglia e del Controllo Produzione): un pannello con i
   passi per chiudere la settimana mostrata, nell'ordine in cui conviene farli. Ogni passo dice
   quante cose restano aperte e con un clic apre lo strumento che già esiste; il pannello non
   corregge niente da solo e non legge niente di nuovo da Jira, a parte la verifica dei
   sottotask (pwJchkVerificaJira, la stessa del bottone «🎫 Sottotask»).
   Passi e fonti dei conteggi:
   - sottotask   pwJchkAnalizza (locale, + verifica Jira già in uso)
   - bonifica    stato Jira dei sottotask della settimana (_pwJchk.jira[..].info) in CREATED/TO DO
   - sync        righe controllo_produzione: giornate passate pianificate senza «Ore Jira»
   - fornitori   ultimo giro di jira-fornitori-worklog (fornitori_worklog_stato), solo questa settimana
   - mysond      righe mysond_ore della settimana
   - anomalie    ultimo Controllo anomalie della settimana (_cpa, ricalcolato in locale)
   - solleciti   _cpaSollDaInviare sull'ultimo Controllo anomalie
   - km          righe controllo_produzione: stato «Su Jira» dei Km/Cad (cpKmJiraStato)
   Stato CONDIVISO in pwData.chiusureSettimana[anno][week] (dominio planning, come
   pwData.sollecitiInviati): { passi: { id: { stato: 'fatto'|'saltato', ts, da } },
   chiusa: { ts, da, aperti: [{ passo, testo }] } | assente, storia: [{ azione, ts, da }] }.
   I lettori che scorrono pwData per anno scartano già le chiavi non numeriche; passa da pwSave
   (quindi Indietro/Avanti lo copre). Chiudere non blocca la Griglia: è un'attestazione
   «chi ha chiuso, quando, con cosa ancora aperto».
   Aprendo uno strumento il pannello si chiude e compare «🏁 Torna alla chiusura settimana»
   (#chs-torna-btn), così la navigazione verso le celle della Griglia resta libera. */

const CHS_PASSI = [
  { id: 'sottotask', titolo: 'Sottotask Jira della Griglia', ico: '🎫',
    desc: 'Ogni giornata pianificata ha il suo sottotask; niente sottotask cancellati, riassegnati o rimasti fuori dalla Griglia.' },
  { id: 'bonifica', titolo: 'Bonifica dei sottotask mai avviati', ico: '🧹',
    desc: 'A settimana finita, i sottotask ancora in CREATED / TO DO senza ore si eliminano e la Griglia si corregge su quello che è successo.' },
  { id: 'sync', titolo: 'Ore lette da Jira', ico: '🔄',
    desc: 'Tutte le giornate passate hanno le «Ore Jira» nel Controllo Produzione («Sincronizza da Jira»).' },
  { id: 'fornitori', titolo: 'Worklog dei fornitori', ico: '🏢',
    desc: 'I sottotask dei dipendenti fornitore hanno stato e worklog copiati dal collega in squadra.' },
  { id: 'mysond', titolo: 'Ore MySond caricate', ico: '📥',
    desc: 'L\'export MySond della settimana è caricato, così il controllo confronta Jira con le ore lavorate.' },
  { id: 'anomalie', titolo: 'Controllo anomalie', ico: '🔍',
    desc: 'Griglia e worklog Jira coincidono: nessuna giornata senza ore, nessun worklog fuori pianificazione.' },
  { id: 'solleciti', titolo: 'Solleciti agli operatori', ico: '✉️',
    desc: 'Chi deve ancora caricare le ore su Jira è stato sollecitato.' },
  { id: 'km', titolo: 'KM / produzione su Jira', ico: '📏',
    desc: 'I Km/Cad vengono dal report (o sono confermati) e sono già inviati a Jira.' },
];

const CHS_STILI = {
  ok:     { ico: '✅', col: '#15803d', bg: '#f0fdf4', bd: '#bbf7d0' },
  ko:     { ico: '❌', col: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
  warn:   { ico: '⚠️', col: '#b45309', bg: '#fffbeb', bd: '#fde68a' },
  ignoto: { ico: '❔', col: '#475569', bg: '#f8fafc', bd: '#e2e8f0' },
  attesa: { ico: '⏳', col: '#475569', bg: '#f8fafc', bd: '#e2e8f0' },
  na:     { ico: '➖', col: '#94a3b8', bg: '#f8fafc', bd: '#e2e8f0' },
};

const _chs = {
  aperto: false,
  anno: null, week: null,  // settimana dei dati letti qui sotto
  gen: 0,                  // generazione delle letture: risultati vecchi si scartano
  righe: null, erroreRighe: '',         // controllo_produzione della settimana: k -> cell
  mysond: null, erroreMysond: '',       // { n, ultimo, da }
  forn: null, erroreForn: '',           // ultimo_esito/ultimo_avvio di fornitori_worklog_stato
  letto: null,                          // Date dell'ultima lettura
};

function _chsNascosta(chiave) {
  return typeof sbFnApplicaNascoste === 'function' && sbFnApplicaNascoste() && sbFnNascosta(chiave);
}

function _chsSettimanaFinita() {
  return pwJsubDataIso(pwAnno, pwWeek, 5) < _cpaOggiISO();
}

/* ---------- stato condiviso (pwData.chiusureSettimana) ---------- */

function chsRecord(anno, week) {
  const R = pwData.chiusureSettimana;
  return (R && R[anno] && R[anno][week]) || null;
}

function _chsRecordScrivibile() {
  if (!pwData.chiusureSettimana || typeof pwData.chiusureSettimana !== 'object') pwData.chiusureSettimana = {};
  const A = pwData.chiusureSettimana[pwAnno] = pwData.chiusureSettimana[pwAnno] || {};
  const W = A[pwWeek] = A[pwWeek] || {};
  if (!W.passi || typeof W.passi !== 'object') W.passi = {};
  return W;
}

function _chsPulisciRecord() {
  const A = pwData.chiusureSettimana && pwData.chiusureSettimana[pwAnno];
  const W = A && A[pwWeek];
  if (!W) return;
  const vuoto = !W.chiusa && !Object.keys(W.passi || {}).length && !(W.storia || []).length;
  if (vuoto) delete A[pwWeek];
  if (!Object.keys(A).length) delete pwData.chiusureSettimana[pwAnno];
}

function _chsChi() { return (_sbUser && _sbUser.email) || ''; }

function _chsQuando(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return String(ts); }
}

/* ---------- bottoni nelle toolbar ---------- */

// Chiamata a fine pwRender e pwControlloRender: aggiorna i bottoni (e il pannello aperto).
function chsAggiorna() {
  const rec = chsRecord(pwAnno, pwWeek);
  const chiusa = rec && rec.chiusa;
  ['pw-chs-btn', 'cp-chs-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const base = id === 'pw-chs-btn'
      ? 'px-3 py-1.5 text-sm border rounded no-print whitespace-nowrap '
      : 'px-3 py-1.5 text-sm font-medium border rounded-lg flex items-center gap-1.5 no-print ';
    if (chiusa) {
      btn.className = base + 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
      btn.textContent = '✅ Settimana chiusa';
      btn.title = 'Chiusa da ' + (chiusa.da || '?') + ' il ' + _chsQuando(chiusa.ts)
        + ((chiusa.aperti || []).length ? ' con ' + chiusa.aperti.length + ' passi ancora aperti' : '') + ' — Click destro per la guida';
    } else {
      btn.className = base + 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
      btn.textContent = '🏁 Chiusura settimana';
      btn.title = 'Passi guidati per chiudere la settimana mostrata — Click destro per la guida';
    }
  });
  if (_chs.aperto) {
    if (_chs.anno !== pwAnno || _chs.week !== pwWeek) chsApri();
    else chsRender();
  }
}

/* ---------- apertura, letture ---------- */

function chsApri() {
  const btnTorna = document.getElementById('chs-torna-btn');
  if (btnTorna) btnTorna.remove();
  _chs.aperto = true;
  const nuova = _chs.anno !== pwAnno || _chs.week !== pwWeek;
  if (nuova) {
    _chs.anno = pwAnno; _chs.week = pwWeek;
    _chs.righe = null; _chs.mysond = null; _chs.forn = null; _chs.letto = null;
  }
  chsRender();
  chsCarica(false);
}

function chsChiudi() {
  _chs.aperto = false;
  const m = document.getElementById('chs-modal');
  if (m) m.style.display = 'none';
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_chs.aperto) return;
  const mr = document.getElementById('modal-root');
  if (mr && mr.children.length) return;   // conferma/avviso aperto sopra
  chsChiudi();
});

function chsAggiornaTutto() { chsCarica(true); }

/* Rilegge i dati che servono ai conteggi. forzaJira = rifà anche la verifica dei sottotask. */
async function chsCarica(forzaJira) {
  const gen = ++_chs.gen;
  const anno = pwAnno, week = pwWeek;
  _chs.erroreRighe = ''; _chs.erroreMysond = ''; _chs.erroreForn = '';
  const ancora = () => gen === _chs.gen && _chs.anno === anno && _chs.week === week;
  const ridisegna = () => { if (ancora() && _chs.aperto) chsRender(); };

  const verifica = (typeof pwJchkVerificaJira === 'function') ? pwJchkVerificaJira(!!forzaJira) : Promise.resolve();
  chsRender();
  verifica.then(ridisegna, ridisegna);

  if (!_sbClient || !_sbUser) {
    _chs.erroreRighe = _chs.erroreMysond = _chs.erroreForn = 'Non connesso a Supabase.';
    ridisegna();
    return;
  }
  const lun = pwJsubDataIso(anno, week, 0), dom = _cpMysondIsoAdd(lun, 6);

  const pRighe = (async () => {
    try {
      if (!_cpCampoProd) await cpCampoProdLoad();
      const { data, error } = await _sbClient.from('controllo_produzione')
        .select('commessa,squadra,operatore,giorno,ore_jira,ore_report,km_cad,jira_tickets,km_jira_last,km_by_ticket,km_last_by_ticket,km_meta_by_ticket')
        .eq('anno', anno).eq('week', week);
      if (error) throw error;
      if (!ancora()) return;
      const m = {};
      (data || []).forEach(r => { m[r.commessa + '|||' + r.squadra + '|||' + r.operatore + '|||' + r.giorno] = cpRowToCell(r); });
      _chs.righe = m;
    } catch (e) {
      if (ancora()) _chs.erroreRighe = e.message || String(e);
    }
    ridisegna();
  })();

  const pMysond = (async () => {
    try {
      const { data, count, error } = await _sbClient.from('mysond_ore')
        .select('caricato_at,caricato_da', { count: 'exact' })
        .gte('data', lun).lte('data', dom)
        .order('caricato_at', { ascending: false }).limit(1);
      if (error) throw error;
      if (!ancora()) return;
      const u = (data || [])[0];
      _chs.mysond = { n: count || 0, ultimo: u ? u.caricato_at : null, da: u ? u.caricato_da : '' };
    } catch (e) {
      if (ancora()) _chs.erroreMysond = e.message || String(e);
    }
    ridisegna();
  })();

  const pForn = (async () => {
    if (!cpFornWlSettimanaHa(anno, week)) return;
    try {
      const { data, error } = await _sbClient.from('fornitori_worklog_stato')
        .select('ultimo_avvio,ultimo_da,ultimo_esito').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (!ancora()) return;
      _chs.forn = data || {};
    } catch (e) {
      if (ancora()) _chs.erroreForn = e.message || String(e);
    }
    ridisegna();
  })();

  await Promise.all([pRighe, pMysond, pForn]);
  if (ancora()) { _chs.letto = new Date(); ridisegna(); }
}

/* ---------- conteggi dei passi ---------- */

// Giornate pianificate già passate, con la stessa unità delle righe del Controllo Produzione
// (commessa + squadra + operatore + giorno; ferie escluse, permessi di poche ore no).
function _chsGiornatePassate() {
  const oggi = _cpaOggiISO();
  const out = [];
  const viste = new Set();
  pwGetWeekData().forEach(bc => {
    if (!bc || !bc.commessa) return;
    (bc.squadre || []).forEach(sq => {
      const sqNome = sq.nome || 'Squadra';
      (sq.operatori || []).forEach(op => {
        if (!op || !op.nome || !op.nome.trim()) return;
        for (let g = 0; g < 6; g++) {
          const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
          if (!pwCellCantieri(opG).length) continue;
          if (pwFerieTipoGiornata(op.nome, g)) continue;
          const data = pwJsubDataIso(pwAnno, pwWeek, g);
          if (data >= oggi) continue;
          const k = bc.commessa + '|||' + sqNome + '|||' + op.nome + '|||' + g;
          if (viste.has(k)) continue;
          viste.add(k);
          out.push({ k, commessa: bc.commessa, squadra: sqNome, operatore: op.nome, giorno: g });
        }
      });
    });
  });
  return out;
}

function _chsPlur(n, uno, molti) { return n + ' ' + (n === 1 ? uno : molti); }

// "Lun 3 · Mar 2": giornate per giorno della settimana
function _chsPerGiorno(lista) {
  const c = {};
  lista.forEach(x => { c[x.giorno] = (c[x.giorno] || 0) + 1; });
  return Object.keys(c).map(Number).sort((a, b) => a - b)
    .map(g => pwJsubGiornoLabel(pwAnno, pwWeek, g) + ': ' + c[g]).join(' · ');
}

function _chsStatoSottotask() {
  const r = pwJchkAnalizza();
  const v = _pwJchk.jira[_pwJchkWeekKey()];
  if (!r.voci && !r.anomalie.length) return { stato: 'na', testo: 'Nessun cantiere pianificato questa settimana.' };
  const perTipo = {};
  r.anomalie.forEach(a => { perTipo[a.tipo] = (perTipo[a.tipo] || 0) + 1; });
  const parti = PW_JCHK_ORDINE.filter(t => perTipo[t])
    .map(t => perTipo[t] + ' ' + (perTipo[t] === 1 ? PW_JCHK_TIPI[t].label : PW_JCHK_TIPI[t].plur));
  const ko = r.anomalie.some(a => PW_JCHK_TIPI[a.tipo].sev === 'ko');
  const jira = v && v.inflight ? 'Verifica su Jira in corso…'
    : (v && v.errore ? 'Verifica su Jira non riuscita: ' + v.errore : '');
  if (!r.anomalie.length) {
    return { stato: 'ok', testo: 'Tutte le ' + r.voci + ' giornate hanno il sottotask Jira.', dettaglio: jira };
  }
  return { stato: ko ? 'ko' : 'warn', testo: parti.join(' · '),
    dettaglio: [r.ok + '/' + r.voci + ' giornate con sottotask.', jira].filter(Boolean).join(' ') };
}

function _chsStatoBonifica() {
  if (!_chsSettimanaFinita()) return { stato: 'na', testo: 'Si fa a settimana finita (da domenica).' };
  const v = _pwJchk.jira[_pwJchkWeekKey()];
  if (!v || v.inflight) return { stato: 'attesa', testo: 'Leggo da Jira lo stato dei sottotask…' };
  if (v.errore) return { stato: 'ignoto', testo: 'Stato dei sottotask non letto da Jira: ' + v.errore };
  const chiavi = new Set();
  pwGetWeekData().forEach(bc => {
    if (!bc) return;
    Object.values(pwJiraSubtaskMappa(bc)).forEach(e => {
      if (!e || !e.key || !pwJiraSubtaskIsResolved(e)) return;
      if (fornitoreDiNome(e.operatore)) return;   // come la bonifica: seguono il collega Eagle
      const st = v.info[e.key];
      if (st && PW_JBON_STATI.test(String(st.status || '').trim())) chiavi.add(e.key);
    });
  });
  if (!chiavi.size) return { stato: 'ok', testo: 'Nessun sottotask rimasto in CREATED o TO DO.' };
  return { stato: 'warn', testo: _chsPlur(chiavi.size, 'sottotask ancora in CREATED / TO DO', 'sottotask ancora in CREATED / TO DO') + '.',
    dettaglio: 'La bonifica controlla le ore di ognuno prima di proporre l\'eliminazione.' };
}

function _chsStatoSync() {
  const giornate = _chsGiornatePassate();
  if (!giornate.length) return { stato: 'na', testo: 'Nessuna giornata pianificata già passata.' };
  if (_chs.erroreRighe) return { stato: 'ignoto', testo: 'Controllo Produzione non letto: ' + _chs.erroreRighe };
  if (!_chs.righe) return { stato: 'attesa', testo: 'Leggo il Controllo Produzione…' };
  const senzaEmail = [], mancanti = [];
  giornate.forEach(x => {
    const c = _chs.righe[x.k];
    if (c && c.ore_jira != null) return;
    if (!opEmailDi(x.operatore)) senzaEmail.push(x); else mancanti.push(x);
  });
  const notaEmail = senzaEmail.length
    ? _chsPlur(senzaEmail.length, 'giornata', 'giornate') + ' di operatori senza email (non sincronizzabili: ' + [...new Set(senzaEmail.map(x => x.operatore))].join(', ') + ').'
    : '';
  if (!mancanti.length) {
    return { stato: senzaEmail.length ? 'warn' : 'ok',
      testo: 'Ore Jira lette per tutte le ' + (giornate.length - senzaEmail.length) + ' giornate passate.', dettaglio: notaEmail };
  }
  return { stato: 'ko', testo: _chsPlur(mancanti.length, 'giornata passata', 'giornate passate') + ' senza «Ore Jira».',
    dettaglio: [_chsPerGiorno(mancanti), notaEmail].filter(Boolean).join(' — ') };
}

function _chsStatoFornitori() {
  if (!cpFornWlSettimanaHa(pwAnno, pwWeek)) return { stato: 'na', testo: 'Nessun dipendente fornitore con email in Griglia.' };
  if (_chs.erroreForn) return { stato: 'ignoto', testo: 'Ultimo giro non letto: ' + _chs.erroreForn };
  if (!_chs.forn) return { stato: 'attesa', testo: 'Leggo l\'ultimo giro di copia…' };
  const es = _chs.forn.ultimo_esito;
  const quando = _chsQuando(_chs.forn.ultimo_avvio) + (_chs.forn.ultimo_da ? ' (' + (_chs.forn.ultimo_da === 'cron' ? 'automatico' : _chs.forn.ultimo_da) + ')' : '');
  const lun = pwJsubDataIso(pwAnno, pwWeek, 0), sab = pwJsubDataIso(pwAnno, pwWeek, 5);
  if (!es || !es.dal || es.al < lun || es.dal > sab) {
    return { stato: 'ignoto', testo: 'L\'ultimo giro di copia non riguarda questa settimana.',
      dettaglio: es ? 'Ultimo giro ' + quando + ', giorni ' + es.dal + ' → ' + es.al + '.' : '' };
  }
  const coppie = (es.coppie || []).filter(c => c.anno === pwAnno && c.week === pwWeek);
  const errori = coppie.filter(c => c.errore).length;
  const senzaCollega = coppie.filter(c => !c.errore && !c.sourceKey).length;
  const det = 'Ultimo giro ' + quando + ', giorni ' + es.dal + ' → ' + es.al + '.';
  if (errori) return { stato: 'ko', testo: _chsPlur(errori, 'sottotask con errore', 'sottotask con errori') + (senzaCollega ? ', ' + senzaCollega + ' senza collega' : '') + '.', dettaglio: det };
  if (senzaCollega) return { stato: 'warn', testo: _chsPlur(senzaCollega, 'sottotask senza collega da cui copiare', 'sottotask senza collega da cui copiare') + '.', dettaglio: det };
  return { stato: 'ok', testo: coppie.length ? _chsPlur(coppie.length, 'sottotask allineato', 'sottotask allineati') + ' al collega.' : 'Niente da copiare.', dettaglio: det };
}

function _chsStatoMysond() {
  if (_chs.erroreMysond) return { stato: 'ignoto', testo: 'Ore MySond non lette: ' + _chs.erroreMysond };
  if (!_chs.mysond) return { stato: 'attesa', testo: 'Leggo le ore MySond…' };
  if (!_chs.mysond.n) return { stato: 'warn', testo: 'Ore MySond non ancora caricate per questa settimana.',
    dettaglio: 'Senza, il Controllo anomalie non confronta Jira con le ore lavorate. Se non le usate, segna il passo «non serve».' };
  return { stato: 'ok', testo: _chsPlur(_chs.mysond.n, 'giornata caricata', 'giornate caricate') + '.',
    dettaglio: _chs.mysond.ultimo ? 'Ultimo caricamento ' + _chsQuando(_chs.mysond.ultimo) + (_chs.mysond.da ? ' da ' + _chs.mysond.da : '') + '.' : '' };
}

// Ultimo Controllo anomalie della settimana mostrata, ricalcolato sulla Griglia attuale una volta
// per disegno (_chsCalcola azzera _chs.cpaFatto).
function _chsCpa() {
  if (!_chs.cpaFatto) {
    _chs.cpaFatto = true;
    _cpaAllinea();
    if (!_cpa.aperto) _cpaRicalcola();
  }
  return (_cpa.risultato && _cpa.anno === pwAnno && _cpa.week === pwWeek) ? _cpa.risultato : null;
}

function _chsStatoAnomalie() {
  if (_cpa.inCorso && _cpa.inCorsoDi === pwWeek) return { stato: 'attesa', testo: 'Controllo anomalie in corso…' };
  const r = _chsCpa();
  if (!r) return { stato: 'ignoto', testo: 'Controllo anomalie non ancora fatto per questa settimana.',
    dettaglio: 'Aprendolo legge da Jira i worklog di tutti gli operatori in Griglia (qualche secondo).' };
  const ign = _cpaIgnorate();
  const aperte = r.anomalie.filter(a => !_cpa.risolte.has(a.id) && !ign[a.id]);
  const quando = r.quando ? 'Worklog letti da Jira il ' + _chsQuando(r.quando) + '.' : '';
  const vecchia = r.quando && _chs.righe && (Date.now() - new Date(r.quando).getTime()) > 24 * 3600 * 1000;
  const det = [quando, vecchia ? 'Lettura di più di un giorno fa: «Ricontrolla» nel controllo per aggiornarla.' : '',
    r.mysondCaricato ? '' : 'Senza confronto con MySond.'].filter(Boolean).join(' ');
  if (!aperte.length) return { stato: 'ok', testo: 'Nessuna anomalia aperta.', dettaglio: det };
  const perTipo = {};
  aperte.forEach(a => { perTipo[a.tipo] = (perTipo[a.tipo] || 0) + 1; });
  const parti = Object.keys(perTipo).map(t => perTipo[t] + ' ' + ((CPA_TIPI[t] && CPA_TIPI[t].etichetta) || t).toLowerCase());
  return { stato: 'ko', testo: _chsPlur(aperte.length, 'anomalia aperta', 'anomalie aperte') + ': ' + parti.join(' · '), dettaglio: det };
}

function _chsStatoSolleciti() {
  const r = _chsCpa();
  if (!r) return { stato: 'ignoto', testo: 'Si vede dopo il Controllo anomalie.' };
  const gruppi = _cpaSollGruppi();
  const da = _cpaSollDaInviare();
  if (!gruppi.length) return { stato: 'ok', testo: 'Nessun operatore da sollecitare.' };
  if (!da.length) return { stato: 'ok', testo: 'Solleciti inviati a tutti (' + gruppi.length + ').' };
  return { stato: 'warn', testo: _chsPlur(da.length, 'operatore da sollecitare', 'operatori da sollecitare') + ': ' + da.map(g => g.operatore).join(', ') + '.',
    dettaglio: gruppi.length > da.length ? (gruppi.length - da.length) + ' già sollecitati.' : '' };
}

function _chsStatoKm() {
  const giornate = _chsGiornatePassate();
  if (!giornate.length) return { stato: 'na', testo: 'Nessuna giornata pianificata già passata.' };
  if (_chs.erroreRighe) return { stato: 'ignoto', testo: 'Controllo Produzione non letto: ' + _chs.erroreRighe };
  if (!_chs.righe) return { stato: 'attesa', testo: 'Leggo il Controllo Produzione…' };
  const c = { ok: 0, da_verificare: 0, da_aggiornare: 0, da_inviare: 0, senza_email: 0 };
  const senzaKm = [];
  let conTicket = 0;
  giornate.forEach(x => {
    const cell = _chs.righe[x.k];
    const tks = (cell && Array.isArray(cell.jira_tickets)) ? cell.jira_tickets.filter(t => t && t.key) : [];
    if (!tks.length) return;   // senza ticket: lo dicono «Ore lette da Jira» e il Controllo anomalie
    conTicket++;
    let coperto = false;
    tks.forEach(t => {
      const st = cpKmJiraStato(cell, t.key, x.operatore, cpCampoProduzione(x.commessa));
      if (st.stato in c) c[st.stato]++;
      if (st.km != null || st.last != null) coperto = true;
    });
    if (!coperto) senzaKm.push(x);
  });
  if (!conTicket) return { stato: 'ignoto', testo: 'Nessuna giornata con ticket letti da Jira: prima «Sincronizza da Jira».' };
  const pend = c.da_verificare + c.da_aggiornare + c.da_inviare + c.senza_email;
  const parti = [];
  if (c.da_verificare) parti.push(c.da_verificare + ' da verificare');
  if (c.da_aggiornare) parti.push(c.da_aggiornare + ' da aggiornare');
  if (c.da_inviare) parti.push(c.da_inviare + ' da inviare');
  if (c.senza_email) parti.push(c.senza_email + ' senza email');
  if (senzaKm.length) parti.push(_chsPlur(senzaKm.length, 'giornata senza Km/Cad', 'giornate senza Km/Cad'));
  if (!pend && !senzaKm.length) return { stato: 'ok', testo: 'Km/Cad verificati e allineati su Jira (' + _chsPlur(c.ok, 'ticket', 'ticket') + ').' };
  return { stato: 'ko', testo: 'Ticket: ' + parti.join(' · ') + '.',
    dettaglio: [c.ok ? c.ok + ' ticket già allineati.' : '', senzaKm.length ? 'Senza Km/Cad (report non caricato): ' + _chsPerGiorno(senzaKm) + '.' : '',
      c.da_verificare ? '«Da verificare» = valore letto da Jira (di solito quello dell\'operatore): carica il report o confermalo.' : ''].filter(Boolean).join(' ') };
}

const CHS_STATO_DI = {
  sottotask: _chsStatoSottotask, bonifica: _chsStatoBonifica, sync: _chsStatoSync, fornitori: _chsStatoFornitori,
  mysond: _chsStatoMysond, anomalie: _chsStatoAnomalie, solleciti: _chsStatoSolleciti, km: _chsStatoKm,
};

/* Azione di ogni passo: strumento da aprire, chiave «🧩 Funzioni» che lo nasconde, se scrive. */
const CHS_AZIONI = {
  sottotask: { label: '🎫 Apri controllo sottotask', tab: 'griglia', fn: 'griglia:controllo-sottotask', vai: () => pwOpenJiraCheck() },
  bonifica:  { label: '🧹 Apri bonifica', tab: 'griglia', fn: 'griglia:controllo-sottotask', scrive: true,
    quando: () => _chsSettimanaFinita(), vai: () => pwJbonApri() },
  sync:      { label: '🔄 Sincronizza da Jira', tab: 'controllo', fn: 'controllo:sync-jira', scrive: true,
    vai: () => _chsDopoCaricamento(() => pwControlloSyncJira()) },
  fornitori: { label: '🏢 Apri worklog fornitori', tab: 'controllo', fn: 'controllo:fornitori-worklog',
    quando: () => cpFornWlSettimanaHa(pwAnno, pwWeek), vai: () => cpFornWlApri() },
  mysond:    { label: '📥 Carica MySond', tab: 'controllo', fn: 'controllo:mysond', scrive: true,
    vai: () => { const f = document.getElementById('cp-mysond-file'); if (f) f.click(); } },
  anomalie:  { label: '🔍 Apri controllo anomalie', tab: 'controllo', fn: 'controllo:anomalie', vai: () => cpaApri() },
  solleciti: { label: '✉️ Prepara solleciti', tab: 'controllo', fn: 'controllo:anomalie',
    quando: () => !!_chsCpa(), vai: () => { cpaApri(); if (_cpa.risultato) cpaSollApri(); } },
  km:        { label: '📊 Vai ai KM nel Controllo produzione', tab: 'controllo',
    vai: () => _chsDopoCaricamento(_chsVaiPrimoKm) },
};

// Il tab Controllo Produzione si carica in asincrono: aspetta che abbia finito.
function _chsDopoCaricamento(fn) {
  let n = 0;
  const prova = () => {
    if (!_cpLoading && document.querySelector('#cp-table-container .cp-table, #cp-table-container > div')) { fn(); return; }
    if (++n < 60) setTimeout(prova, 150);
  };
  setTimeout(prova, 50);
}

function _chsVaiPrimoKm() {
  const el = document.querySelector('.cp-table .cp-kmj-sum.pend') || document.querySelector('.cp-table .cp-kmj-sum.parz');
  if (el && el.dataset.sqIdx != null) cpKmJiraVaiPrimo(el.dataset.sqIdx);
}

function _chsAzioneDisponibile(id) {
  const a = CHS_AZIONI[id];
  if (!a) return false;
  if (!sbCanSeePage('weekly:' + a.tab)) return false;
  if (a.fn && _chsNascosta(a.fn)) return false;
  if (a.scrive && !sbCanWrite()) return false;
  if (a.quando && !a.quando()) return false;
  return true;
}

function chsVai(el) {
  const id = el && el.dataset.passo;
  const a = CHS_AZIONI[id];
  if (!a || !_chsAzioneDisponibile(id)) return;
  chsChiudi();
  _chsMostraTorna();
  pwSwitchTab(a.tab);
  if (_pwActiveTab !== a.tab) return;
  a.vai();
}

function _chsMostraTorna() {
  let btn = document.getElementById('chs-torna-btn');
  if (btn) return;
  btn = document.createElement('button');
  btn.id = 'chs-torna-btn';
  btn.type = 'button';
  btn.className = 'no-print';
  btn.textContent = '🏁 Torna alla chiusura settimana';
  btn.onclick = () => chsApri();
  document.body.appendChild(btn);
}

/* ---------- segni manuali, chiusura ---------- */

async function chsSegna(el) {
  if (!sbGuardWrite()) return;
  const id = el.dataset.passo, stato = el.dataset.stato || '';
  const W = _chsRecordScrivibile();
  const prima = W.passi[id];
  if (!stato || (prima && prima.stato === stato)) delete W.passi[id];
  else W.passi[id] = { stato, ts: new Date().toISOString(), da: _chsChi() };
  _chsPulisciRecord();
  await pwSave();
  const p = CHS_PASSI.find(x => x.id === id);
  sbLogActivity('Chiusura settimana: passo ' + (W.passi[id] ? 'segnato «' + stato + '»' : 'tolto il segno'),
    { anno: pwAnno, week: pwWeek, passo: p ? p.titolo : id });
  chsAggiorna();
  chsRender();
}

function _chsCalcola() {
  const rec = chsRecord(pwAnno, pwWeek) || {};
  const passi = rec.passi || {};
  _chs.cpaFatto = false;
  return CHS_PASSI.map((p, i) => {
    let s;
    try { s = CHS_STATO_DI[p.id](); }
    catch (e) { console.warn('[chiusura settimana] ' + p.id, e); s = { stato: 'ignoto', testo: 'Conteggio non riuscito: ' + (e.message || e) }; }
    const segno = passi[p.id] || null;
    const fatto = s.stato === 'ok' || s.stato === 'na' || !!segno;
    return Object.assign({ n: i + 1, segno, fatto }, p, s);
  });
}

async function chsChiudiSettimana() {
  if (!sbGuardWrite()) return;
  const passi = _chsCalcola();
  const aperti = passi.filter(p => !p.fatto);
  const inAttesa = passi.some(p => p.stato === 'attesa');
  let msg = 'Chiudere la settimana ' + pwWeek + '/' + pwAnno + '?\n\nLa chiusura si vede a tutti (chi e quando) e non blocca la Griglia: si può riaprire.';
  if (!_chsSettimanaFinita()) msg += '\n\n⚠️ La settimana non è ancora finita.';
  if (inAttesa) msg += '\n\n⏳ Alcuni conteggi sono ancora in lettura.';
  if (aperti.length) msg += '\n\nPassi ancora aperti, che resteranno annotati nella chiusura:\n' + aperti.map(p => '• ' + p.titolo + ': ' + p.testo).join('\n');
  if (!(await showConfirmAsync(msg, aperti.length ? 'Chiudi comunque' : 'Chiudi settimana'))) return;
  const W = _chsRecordScrivibile();
  const ts = new Date().toISOString(), da = _chsChi();
  W.chiusa = { ts, da, aperti: aperti.map(p => ({ passo: p.id, testo: String(p.testo || '').slice(0, 300) })) };
  W.storia = (W.storia || []).concat([{ azione: 'chiusa', ts, da }]).slice(-20);
  await pwSave();
  sbLogActivity('Chiusura settimana: settimana chiusa', { anno: pwAnno, week: pwWeek, aperti: W.chiusa.aperti });
  chsAggiorna();
  chsRender();
}

async function chsRiapri() {
  if (!sbGuardWrite()) return;
  if (!(await showConfirmAsync('Riaprire la settimana ' + pwWeek + '/' + pwAnno + '?\n\nI segni sui singoli passi restano.', 'Riapri'))) return;
  const W = _chsRecordScrivibile();
  delete W.chiusa;
  W.storia = (W.storia || []).concat([{ azione: 'riaperta', ts: new Date().toISOString(), da: _chsChi() }]).slice(-20);
  await pwSave();
  sbLogActivity('Chiusura settimana: settimana riaperta', { anno: pwAnno, week: pwWeek });
  chsAggiorna();
  chsRender();
}

/* ---------- disegno ---------- */

function _chsPassoHtml(p, puoScrivere) {
  const st = CHS_STILI[p.stato] || CHS_STILI.ignoto;
  const segnato = p.segno;
  const ico = segnato ? (segnato.stato === 'fatto' ? '☑️' : '⏭️') : st.ico;
  const bordo = segnato ? '#cbd5e1' : st.bd;
  const sfondo = (p.fatto && p.stato !== 'ok') ? '#f8fafc' : st.bg;
  const azione = _chsAzioneDisponibile(p.id)
    ? '<button type="button" data-passo="' + esc(p.id) + '" data-help-key="chs-passo-' + esc(p.id) + '" onclick="chsVai(this)" '
      + 'class="text-xs px-2.5 py-1 rounded-md font-semibold text-white whitespace-nowrap" style="background:#4f46e5;">' + esc(CHS_AZIONI[p.id].label) + '</button>'
    : '';
  const segni = (puoScrivere && p.stato !== 'ok' && p.stato !== 'na') || segnato
    ? ['fatto', 'saltato'].map(s => {
        const on = segnato && segnato.stato === s;
        if (!puoScrivere && !on) return '';
        return '<button type="button" data-passo="' + esc(p.id) + '" data-stato="' + s + '" data-help-key="chs-segna" onclick="chsSegna(this)" '
          + 'class="text-[11px] px-2 py-0.5 rounded border whitespace-nowrap ' + (on ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50') + '"'
          + (puoScrivere ? '' : ' disabled') + '>' + (s === 'fatto' ? (on ? '☑ Segnato fatto' : 'Segna fatto') : (on ? '⏭ Non serve' : 'Non serve')) + '</button>';
      }).join('')
    : '';
  const notaSegno = segnato
    ? '<div class="text-[11px] text-slate-500 mt-1">' + (segnato.stato === 'fatto' ? 'Segnato fatto' : 'Segnato «non serve»') + ' da ' + esc(segnato.da || '?') + ' il ' + esc(_chsQuando(segnato.ts)) + '</div>'
    : '';
  return '<div class="rounded-lg border px-3 py-2.5 flex gap-3 items-start" style="background:' + sfondo + ';border-color:' + bordo + ';' + (p.fatto && p.stato !== 'ok' ? 'opacity:.8;' : '') + '">'
    + '<div class="flex flex-col items-center" style="min-width:28px;">'
      + '<span class="text-[11px] font-bold text-slate-400">' + p.n + '</span><span style="font-size:18px;line-height:1.2;">' + ico + '</span></div>'
    + '<div class="flex-1 min-w-0">'
      + '<div class="flex flex-wrap items-center gap-x-2"><span class="font-semibold text-slate-800 text-sm">' + p.ico + ' ' + esc(p.titolo) + '</span></div>'
      + '<div class="text-[11px] text-slate-500">' + esc(p.desc) + '</div>'
      + '<div class="text-sm mt-1" style="color:' + st.col + ';">' + esc(p.testo || '') + '</div>'
      + (p.dettaglio ? '<div class="text-[11px] text-slate-500 mt-0.5">' + esc(p.dettaglio) + '</div>' : '')
      + notaSegno
    + '</div>'
    + '<div class="flex flex-col items-end gap-1.5">' + azione + '<div class="flex gap-1">' + segni + '</div></div>'
  + '</div>';
}

function chsRender() {
  const modal = document.getElementById('chs-modal');
  const root = document.getElementById('chs-root');
  if (!modal || !root) return;
  modal.style.display = _chs.aperto ? 'flex' : 'none';
  if (!_chs.aperto) return;
  const corpoPrima = document.getElementById('chs-body');
  const scroll = corpoPrima ? corpoPrima.scrollTop : 0;

  const passi = _chsCalcola();
  const rec = chsRecord(pwAnno, pwWeek) || {};
  const chiusa = rec.chiusa;
  const puoScrivere = sbCanWrite();
  const fatti = passi.filter(p => p.fatto).length;
  const lun = pwJsubGiornoLabel(pwAnno, pwWeek, 0), sab = pwJsubGiornoLabel(pwAnno, pwWeek, 5, true);
  const finita = _chsSettimanaFinita();
  const inLettura = passi.some(p => p.stato === 'attesa');

  const testata = '<div class="flex items-center gap-3" style="padding:14px 20px;border-bottom:1px solid #e2e8f0;background:#fff;">'
    + '<div class="flex-1 min-w-0"><div class="text-base font-bold text-slate-800">🏁 Chiusura settimana · WEEK ' + pwWeek + ' <span class="font-normal text-slate-500 text-sm">' + esc(lun) + ' — ' + esc(sab) + '</span></div>'
    + '<div class="text-xs text-slate-500">' + (finita ? 'Settimana finita.' : 'Settimana in corso: i conteggi valgono per i giorni già passati.')
    + (_chs.letto ? ' Dati letti alle ' + esc(_chs.letto.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })) + '.' : '') + '</div></div>'
    + '<button type="button" id="chs-aggiorna" onclick="chsAggiornaTutto()" class="text-xs px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 whitespace-nowrap"' + (inLettura ? ' disabled style="opacity:.6"' : '') + '>' + (inLettura ? '⏳ Lettura…' : '↻ Aggiorna') + '</button>'
    + '<button type="button" onclick="chsChiudi()" class="text-slate-400 hover:text-slate-700 text-xl leading-none" title="Chiudi (Esc)">✕</button>'
  + '</div>';

  let banner = '';
  if (chiusa) {
    const ap = chiusa.aperti || [];
    banner = '<div class="rounded-lg border px-3 py-2 mb-3 text-sm" style="background:#f0fdf4;border-color:#86efac;color:#166534;">'
      + '✅ <b>Settimana chiusa</b> da ' + esc(chiusa.da || '?') + ' il ' + esc(_chsQuando(chiusa.ts)) + '.'
      + (ap.length ? '<div class="text-xs mt-1" style="color:#92400e;">Alla chiusura restavano aperti: ' + ap.map(a => {
          const p = CHS_PASSI.find(x => x.id === a.passo);
          return esc((p ? p.titolo : a.passo) + (a.testo ? ' (' + a.testo + ')' : ''));
        }).join('; ') + '</div>' : '')
      + '</div>';
  }

  const lista = '<div class="flex flex-col gap-2">' + passi.map(p => _chsPassoHtml(p, puoScrivere)).join('') + '</div>';
  const storia = (rec.storia || []).slice(-5).reverse();
  const storiaHtml = storia.length
    ? '<div class="text-[11px] text-slate-400 mt-3">Cronologia: ' + storia.map(s => esc((s.azione === 'chiusa' ? 'chiusa' : 'riaperta') + ' da ' + (s.da || '?') + ' il ' + _chsQuando(s.ts))).join(' · ') + '</div>'
    : '';

  const perc = Math.round(fatti / passi.length * 100);
  const piede = '<div class="flex flex-wrap items-center gap-3" style="padding:12px 20px;border-top:1px solid #e2e8f0;background:#fff;">'
    + '<div class="flex items-center gap-2 flex-1 min-w-[200px]">'
      + '<div style="flex:1;max-width:240px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;"><div style="width:' + perc + '%;height:100%;background:' + (fatti === passi.length ? '#16a34a' : '#4f46e5') + ';"></div></div>'
      + '<span class="text-xs text-slate-600">' + fatti + ' di ' + passi.length + ' passi a posto</span></div>'
    + (puoScrivere
      ? (chiusa
        ? '<button type="button" id="chs-riapri" onclick="chsRiapri()" class="text-sm px-3 py-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50">↺ Riapri settimana</button>'
        : '<button type="button" id="chs-chiudi-settimana" onclick="chsChiudiSettimana()" class="text-sm px-3 py-1.5 rounded-lg font-semibold text-white" style="background:' + (fatti === passi.length ? '#16a34a' : '#475569') + ';">🏁 Chiudi settimana</button>')
      : '<span class="text-xs text-slate-500">Sola lettura: non puoi chiudere la settimana.</span>')
  + '</div>';

  root.innerHTML = testata + '<div id="chs-body" style="flex:1;overflow:auto;padding:14px 20px;">' + banner + lista + storiaHtml + '</div>' + piede;
  const dopo = document.getElementById('chs-body');
  if (dopo && scroll) dopo.scrollTop = scroll;
}
