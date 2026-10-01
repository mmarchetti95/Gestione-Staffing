/* ==================== CONTROLLO ANOMALIE PRODUZIONE · UI E RACCOLTA DATI ====================
   Pannello "🔍 Controllo anomalie" del tab Controllo Produzione. Raccoglie i dati
   della settimana mostrata e li passa al motore puro (produzione-anomalie-core.js):
   - Griglia (pwData) + Ferie della settimana, appiattite in celle operatore/giorno;
   - worklog Jira LETTI ora (jira-sync-worklogs, sola lettura): non si usa la colonna
     "Ore Jira" salvata perché copre solo le celle pianificate e può essere vecchia, e
     per i "worklog senza pianificazione" servono proprio i giorni non pianificati;
   - Km/Cad di controllo_produzione (_cpData, già caricato dal tab);
   - Epic dei sottotask della Griglia, via jira-task-status (stesse cache della Mappa:
     il sottotask è l'unico legame certo cantiere -> Task -> Epic, vedi
     supabase/functions/jira-task-status/index.ts);
   - mediane km per famiglia di attività dallo storico (stesso modello di Auto-pianifica).

   Non scrive MAI su Jira. Le azioni dei bottoni sono locali e sempre confermate:
   Km/Cad in controllo_produzione (arrivano su Jira solo con "🔄 Sincronizza da Jira",
   che chiede a sua volta conferma) oppure una cella di Griglia. */

const CPA_IGNORATE_KEY = 'cpa_ignorate_v1';
const CPA_EMAIL_CHUNK = 8;           // email per chiamata a jira-sync-worklogs (evita timeout della funzione)
const CPA_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

let _cpa = {
  aperto: false,
  anno: null, week: null,     // settimana dell'ultimo controllo
  inCorso: false,
  msg: '',
  risultato: null,            // output di cpaRileva + contesto (giorniLabel, avvisi)
  filtro: '',                 // tipo mostrato ('' = tutti)
  mostraIgnorate: false,
  tuttoIlPool: false,         // legge i worklog anche di chi non è in Griglia questa settimana
  risolte: new Set(),         // id corretti con un bottone in questa sessione
};

function _cpaIgnorate() {
  try { return JSON.parse(localStorage.getItem(CPA_IGNORATE_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function _cpaSalvaIgnorate(m) {
  try { localStorage.setItem(CPA_IGNORATE_KEY, JSON.stringify(m)); } catch (_) {}
}

function cpaToggle() {
  _cpa.aperto = !_cpa.aperto;
  cpaRender();
  if (_cpa.aperto && !_cpa.risultato && !_cpa.inCorso) cpaAvvia();
}

/* Chiamata a fine pwControlloRender: il risultato vale per una sola settimana. */
function cpaOnControlloRender() {
  if (_cpa.risultato && (_cpa.anno !== pwAnno || _cpa.week !== pwWeek)) {
    _cpa.risultato = null; _cpa.msg = ''; _cpa.risolte = new Set();
  }
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

/* Griglia della settimana -> celle operatore/giorno per il motore, più l'indice
   inverso sottotask -> cantiere/operatore (per capire dove andrebbe un worklog). */
function _cpaCelleSettimana() {
  const data = pwGetWeekData();
  const fw = pwGetFerieWeek();
  const celle = [], sottotaskIndex = {}, operatori = new Set();
  data.forEach(bc => {
    if (!bc.commessa) return;
    Object.keys(bc.jiraSubtask || {}).forEach(mk => {
      const e = bc.jiraSubtask[mk];
      if (!pwJiraSubtaskIsResolved(e) || !e.key) return;
      const p = mk.split('|||');
      sottotaskIndex[e.key] = { commessa: bc.commessa, cantiere: p[0], operatore: p[1], attivita: p[2] || '' };
    });
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
  return { celle, sottotaskIndex, operatori };
}

async function _cpaLeggiWorklog(nomi, date, avvisi) {
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
    _cpa.msg = '⏳ Leggo i worklog Jira (' + Math.min(i + CPA_EMAIL_CHUNK, emails.length) + '/' + emails.length + ' operatori)…';
    cpaRender();
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
      date.iso.forEach((d, g) => { if (perData[d]) worklog[nome][g] = perData[d]; });
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
  if (!_sbClient || !_sbUser) { _cpa.msg = 'Controllo non disponibile offline: servono Jira e lo storico.'; cpaRender(); return; }
  _cpa.inCorso = true;
  _cpa.anno = pwAnno; _cpa.week = pwWeek;
  _cpa.risultato = null; _cpa.risolte = new Set();
  const avvisi = [];
  try {
    const date = _cpaDateSettimana();
    const oggi = _cpaOggiISO();
    const giorniValutabili = [0, 1, 2, 3, 4, 5].filter(g => date.iso[g] < oggi);
    const { celle, sottotaskIndex, operatori } = _cpaCelleSettimana();

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

    _cpa.msg = '⏳ Carico lo storico di produzione…';
    cpaRender();
    await apCaricaStorico(false);
    const modello = _ap.modello;
    if (!modello) avvisi.push('Storico di produzione non disponibile: controllo "km fuori scala" saltato.');

    const r = cpaRileva({
      anno: pwAnno, week: pwWeek, giorniLabel: date.label, giorniValutabili,
      celle, worklog, verificati, cp: _cpData, epicDiSottotask, sottotaskIndex,
      modello, famigliaDi: modello ? (a => apTrovaFamiglia(modello, a)) : null,
    });
    r.giorniLabel = date.label;
    r.ddmm = date.ddmm;
    r.avvisi = avvisi;
    r.nOperatori = verificati.length;
    r.giorniValutabili = giorniValutabili;
    r.quando = new Date();
    _cpa.risultato = r;
    _cpa.msg = '';
    sbLogActivity('Controllo anomalie produzione', { anno: pwAnno, week: pwWeek, anomalie: r.anomalie.length });
  } catch (e) {
    console.error('cpaAvvia', e);
    _cpa.msg = '⚠ Controllo non riuscito: ' + (e.message || e);
  } finally {
    _cpa.inCorso = false;
    cpaRender();
  }
}

function cpaFiltro(tipo) { _cpa.filtro = (_cpa.filtro === tipo) ? '' : tipo; cpaRender(); }
function cpaToggleIgnorate() { _cpa.mostraIgnorate = !_cpa.mostraIgnorate; cpaRender(); }
function cpaTogglePool(el) { _cpa.tuttoIlPool = !!el.checked; }

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

/* Porta in vista la riga del Controllo Produzione (riapre commessa/squadra collassate). */
function cpaVaiAllaRiga(el) {
  const a = _cpaTrova(el);
  if (!a || !a.cpKey) return;
  const tr = [...document.querySelectorAll('.cp-table tbody tr[data-cpk]')].find(x => x.dataset.cpk === a.cpKey);
  if (!tr) { showAlertModal('Riga non trovata nella tabella (la cella potrebbe essere stata modificata in Griglia).'); return; }
  const ci = tr.dataset.commIdx, si = tr.dataset.sqIdx;
  _cpCollapsedComm.delete(ci); _cpCollapsedComm.delete(Number(ci)); _cpCollapsedSq.delete(si);
  cpApplyCollapse();
  tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tr.classList.remove('cpa-flash'); void tr.offsetWidth; tr.classList.add('cpa-flash');
}

async function _cpaSalvaKm(cpKey, ticket, valore) {
  const [commessa, squadra, operatore, gs] = cpKey.split('|||');
  const g = Number(gs);
  const cella = _cpaCelleSettimana().celle.find(c => c.cpKey === cpKey);
  const cantiere = cella ? [...new Set(cella.voci.map(v => v.cantiere))].join(', ') : '';
  const op = pwGetWeekData().flatMap(bc => bc.commessa === commessa ? (bc.squadre || []) : [])
    .filter(sq => (sq.nome || 'Squadra') === squadra).flatMap(sq => sq.operatori || [])
    .find(o => (o.nome || '').trim() === operatore);
  const attivita = (op && op.giorni && op.giorni[g] && op.giorni[g].attivita) || '';
  await cpSaveKmTicket(commessa, squadra, operatore, g, _cpa.risultato.ddmm[g], cantiere, attivita, ticket, valore);
}

async function cpaAzione(el) {
  if (!sbGuardWrite()) return;
  const a = _cpaTrova(el);
  if (!a || !a.azione) return;
  const r = _cpa.risultato;
  if (_cpa.anno !== pwAnno || _cpa.week !== pwWeek) { showAlertModal('Il controllo è di un\'altra settimana: rilancialo.'); return; }
  const giorno = r.giorniLabel[a.giorno];
  const az = a.azione;

  if (az.tipo === 'tieni_km') {
    const scelta = az.scelte[Number(el.dataset.scelta || 0)];
    if (!scelta) return;
    const altri = scelta.azzera.map(x => x.operatore).join(', ');
    const ok = await showConfirmAsync('Tenere i km di ' + giorno + ' su ' + scelta.tieni + ' e mettere 0 su ' + altri + '?\n\n' +
      'La modifica è locale (Controllo Produzione). Su Jira la quota in eccesso viene tolta solo alla prossima "🔄 Sincronizza da Jira", che chiede conferma.',
      'Correggi km');
    if (!ok) return;
    for (const x of scelta.azzera) for (const t of x.tickets) await _cpaSalvaKm(x.cpKey, t, 0);
  } else if (az.tipo === 'imposta_km') {
    const ok = await showConfirmAsync('Impostare Km/Cad di ' + az.operatore + ' (' + giorno + ', ticket ' + az.ticket + ') a ' +
      String(az.valore).replace('.', ',') + '?\n\nLa modifica è locale; arriva su Jira solo con "🔄 Sincronizza da Jira".', 'Imposta km');
    if (!ok) return;
    await _cpaSalvaKm(az.cpKey, az.ticket, az.valore);
  } else if (az.tipo === 'aggiungi_griglia') {
    const data = pwGetWeekData();
    const bc = data.find(b => b.commessa === az.commessa);
    let op = null;
    (bc ? bc.squadre || [] : []).some(sq => { op = (sq.operatori || []).find(o => (o.nome || '').trim() === az.operatore) || null; return !!op; });
    if (!op) { showAlertModal(az.operatore + ' non ha una riga nella commessa "' + az.commessa + '" questa settimana: aggiungilo a mano in Griglia.'); return; }
    if (!_apAncoraLibero(data, az.operatore, az.giorno)) { showAlertModal('Nel frattempo ' + az.operatore + ' risulta già impegnato o assente ' + giorno + ': nessuna modifica.'); return; }
    const ok = await showConfirmAsync('Aggiungere in Griglia ' + az.operatore + ' su ' + az.cantiere + (az.attivita ? ' (' + az.attivita + ')' : '') +
      ' ' + giorno + ', commessa "' + az.commessa + '"?', 'Aggiungi');
    if (!ok) return;
    if (!op.giorni) op.giorni = {};
    _apScriviCella(op, az.giorno, az.cantiere, az.attivita);
    await pwSave();
    pwRender();
  } else {
    return;
  }
  _cpa.risolte.add(a.id);
  sbLogActivity('Controllo anomalie: correzione applicata', { anno: pwAnno, week: pwWeek, tipo: a.tipo, operatore: a.operatore, giorno: a.giorno });
  pwControlloRender();
}

/* Tutti i duplicati aperti in un colpo, con una sola conferma (vedi _cpaSceltaPreferita). */
async function cpaTieniTuttiPrimo() {
  if (!sbGuardWrite()) return;
  const r = _cpa.risultato;
  if (!r || _cpa.anno !== pwAnno || _cpa.week !== pwWeek) return;
  const ign = _cpaIgnorate();
  const lista = r.anomalie.filter(a => a.tipo === 'km_duplicati' && !ign[a.id] && !_cpa.risolte.has(a.id));
  if (!lista.length) return;
  const ok = await showConfirmAsync('Correggere ' + lista.length + ' duplicati tenendo i km su un solo operatore per squadra e mettendo 0 sugli altri?\n\n' +
    'Modifica locale (Controllo Produzione). Su Jira la quota in eccesso viene tolta solo alla prossima "🔄 Sincronizza da Jira", che chiede conferma.',
    'Correggi tutti');
  if (!ok) return;
  for (const a of lista) {
    const scelta = _cpaSceltaPreferita(a);
    for (const x of scelta.azzera) for (const t of x.tickets) await _cpaSalvaKm(x.cpKey, t, 0);
    _cpa.risolte.add(a.id);
  }
  sbLogActivity('Controllo anomalie: duplicati km corretti', { anno: pwAnno, week: pwWeek, n: lista.length });
  pwControlloRender();
}

/* Operatore su cui tenere i km: chi li ha già scritti su Jira (meno ticket da
   correggere), altrimenti il primo del gruppo. */
function _cpaSceltaPreferita(a) {
  const suJira = k => Object.keys((_cpData[k] || {}).km_last_by_ticket || {}).length > 0;
  const sc = a.azione.scelte;
  const cpKeyDi = s => {
    const altre = new Set(s.azzera.map(x => x.cpKey));
    const tutte = sc.flatMap(y => y.azzera.map(x => x.cpKey));
    return tutte.find(k => !altre.has(k));
  };
  return sc.find(s => { const k = cpKeyDi(s); return k && suJira(k); }) || sc[0];
}

async function cpaCopia() {
  const r = _cpa.risultato;
  if (!r) return;
  const ign = _cpaIgnorate();
  const lista = r.anomalie.filter(a => !ign[a.id] && !_cpa.risolte.has(a.id));
  const testo = cpaTestoCorrezioni(lista, r.giorniLabel, 'Controllo produzione · settimana ' + _cpa.week + '/' + _cpa.anno + ' · correzioni proposte');
  try { await navigator.clipboard.writeText(testo); showAlertModal('Elenco copiato negli appunti (' + lista.length + ' voci).'); }
  catch (_) { showAlertModal(testo); }
}

const CPA_GRAVITA_STILE = {
  alta:  'border-color:#fca5a5;background:#fef2f2;',
  media: 'border-color:#fcd34d;background:#fffbeb;',
  bassa: 'border-color:#e2e8f0;background:#f8fafc;',
};

function _cpaVoceHtml(a, r, ignorata) {
  const T = CPA_TIPI[a.tipo];
  const dove = [r.giorniLabel[a.giorno], a.commessa, a.squadra, a.cantiere].filter(Boolean).map(esc).join(' · ');
  let bottoni = '';
  if (a.azione && !ignorata) {
    if (a.azione.tipo === 'tieni_km') {
      bottoni += a.azione.scelte.map((s, i) =>
        '<button type="button" class="pw-write-action text-xs px-2 py-0.5 rounded font-semibold text-white" style="background:#0f766e;" data-scelta="' + i + '" onclick="cpaAzione(this)">Tieni su ' + esc(s.tieni) + '</button>').join('');
    } else {
      bottoni += '<button type="button" class="pw-write-action text-xs px-2 py-0.5 rounded font-semibold text-white" style="background:#0f766e;" onclick="cpaAzione(this)">' + esc(a.azione.etichetta) + '</button>';
    }
  }
  if (a.cpKey) bottoni += '<button type="button" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50" onclick="cpaVaiAllaRiga(this)">↘ Vai alla riga</button>';
  bottoni += (a.link || []).filter(l => l.url).map(l =>
    '<a href="' + esc(l.url) + '" target="_blank" rel="noopener" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50" style="color:#2563eb;text-decoration:none;">' + esc(l.label) + ' ↗</a>').join('');
  bottoni += '<button type="button" class="text-xs px-2 py-0.5 text-slate-500 hover:text-slate-800" onclick="cpaIgnora(this)">' + (ignorata ? '↩ Ripristina' : 'Ignora') + '</button>';
  return '<div class="border rounded-md px-3 py-2" data-cpa-id="' + esc(a.id) + '" style="' + CPA_GRAVITA_STILE[a.gravita] + (ignorata ? 'opacity:.55;' : '') + '">' +
    '<div class="flex items-start gap-2">' +
      '<span class="text-base leading-5" title="' + esc(T.etichetta) + '">' + T.icona + '</span>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="text-[11px] text-slate-500">' + dove + (a.gravita === 'alta' ? ' <span class="font-bold" style="color:#b91c1c;">· priorità alta</span>' : '') + '</div>' +
        '<div class="text-sm font-semibold text-slate-800">' + esc(a.titolo) + '</div>' +
        '<div class="text-xs text-slate-600 mt-0.5">' + esc(a.dettaglio) + '</div>' +
        '<div class="text-xs mt-1" style="color:#0f766e;">💡 ' + esc(a.correzione) + '</div>' +
        '<div class="flex flex-wrap items-center gap-1.5 mt-1.5">' + bottoni + '</div>' +
      '</div>' +
    '</div></div>';
}

function cpaRender() {
  const root = document.getElementById('cpa-root');
  const btn = document.getElementById('cpa-toggle');
  if (!root) return;
  root.style.display = _cpa.aperto ? '' : 'none';
  const r = (_cpa.risultato && _cpa.anno === pwAnno && _cpa.week === pwWeek) ? _cpa.risultato : null;
  const ign = _cpaIgnorate();
  const attive = r ? r.anomalie.filter(a => !_cpa.risolte.has(a.id)) : [];
  const nAperte = attive.filter(a => !ign[a.id]).length;
  if (btn) btn.innerHTML = '🔍 Controllo anomalie' + (r && nAperte ? ' <span style="background:#fff;color:#b45309;border-radius:9px;padding:0 6px;font-weight:700;">' + nAperte + '</span>' : '');
  if (!_cpa.aperto) return;

  const intest = '<div class="flex flex-wrap items-center gap-2">' +
    '<span class="text-xs font-semibold text-slate-700 uppercase tracking-wide">🔍 Controllo anomalie · settimana ' + pwWeek + '</span>' +
    '<span class="text-[11px] text-slate-500">Griglia vs ore Jira vs km. Propone correzioni, non scrive mai su Jira.</span>' +
    '<div class="flex-1"></div>' +
    '<label class="text-xs text-slate-600 flex items-center gap-1" title="Legge i worklog anche degli operatori del pool che non compaiono in Griglia questa settimana (più lento)">' +
      '<input type="checkbox" onchange="cpaTogglePool(this)"' + (_cpa.tuttoIlPool ? ' checked' : '') + '> anche chi non è in Griglia</label>' +
    '<button type="button" onclick="cpaAvvia()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#b45309;"' + (_cpa.inCorso ? ' disabled' : '') + '>' + (r ? '↻ Ricontrolla' : '▶ Avvia controllo') + '</button>' +
    '<button type="button" onclick="cpaToggle()" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800" title="Chiudi">✕</button>' +
    '</div>';

  let corpo = '';
  if (_cpa.msg) corpo += '<div class="text-xs mt-2 ' + (_cpa.msg.startsWith('⚠') ? 'text-rose-700' : 'text-slate-600') + '">' + esc(_cpa.msg) + '</div>';
  if (r && !_cpa.inCorso) {
    const visibili = attive.filter(a => _cpa.mostraIgnorate ? true : !ign[a.id]);
    const conta = {};
    attive.filter(a => !ign[a.id]).forEach(a => { conta[a.tipo] = (conta[a.tipo] || 0) + 1; });
    const chips = Object.keys(CPA_TIPI).map(t => {
      const n = conta[t] || 0;
      const on = _cpa.filtro === t;
      return '<button type="button" data-tipo="' + t + '" onclick="cpaFiltro(this.dataset.tipo)" class="text-xs px-2 py-0.5 rounded-full border" style="' +
        (on ? 'background:#1e293b;color:#fff;border-color:#1e293b;' : (n ? 'background:#fff;border-color:#cbd5e1;color:#334155;' : 'background:#f8fafc;border-color:#e2e8f0;color:#94a3b8;')) + '">' +
        CPA_TIPI[t].icona + ' ' + CPA_TIPI[t].etichetta + ' <b>' + n + '</b></button>';
    }).join('');
    const nIgn = attive.filter(a => ign[a.id]).length;
    const valutati = r.giorniValutabili.length
      ? 'worklog attesi fino a ' + r.giorniLabel[r.giorniValutabili[r.giorniValutabili.length - 1]]
      : 'settimana non ancora iniziata: nessun worklog atteso';
    const nv = r.nonVerificabili;
    const note = [
      r.nOperatori + ' operatori controllati su Jira, ' + valutati + '.',
      nv.epicSenzaSottotask ? nv.epicSenzaSottotask + ' giornate con worklog ma senza sottotask in Griglia: Epic non confrontabile.' : '',
      nv.kmSenzaFamiglia ? nv.kmSenzaFamiglia + ' giornate-squadra con km senza mediana di riferimento (attività miste o con poco storico).' : '',
    ].concat(r.avvisi).filter(Boolean);
    corpo += '<div class="flex flex-wrap items-center gap-1.5 mt-2">' + chips +
      '<div class="flex-1"></div>' +
      (nIgn ? '<button type="button" onclick="cpaToggleIgnorate()" class="text-xs text-slate-500 hover:text-slate-800">' + (_cpa.mostraIgnorate ? 'Nascondi' : 'Mostra') + ' ignorate (' + nIgn + ')</button>' : '') +
      ((conta.km_duplicati || 0) > 1 ? '<button type="button" onclick="cpaTieniTuttiPrimo()" class="pw-write-action text-xs px-2 py-0.5 rounded font-semibold text-white" style="background:#0f766e;" title="Per ogni duplicato tiene i km su un operatore (quello che li ha già su Jira, se c\'è) e mette 0 sugli altri">👯 Correggi tutti i duplicati</button>' : '') +
      (nAperte ? '<button type="button" onclick="cpaCopia()" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50">📋 Copia elenco correzioni</button>' : '') +
      '</div>';
    corpo += '<div class="text-[11px] text-slate-500 mt-1">' + note.map(esc).join('<br>') + '</div>';
    const lista = visibili.filter(a => !_cpa.filtro || a.tipo === _cpa.filtro);
    corpo += lista.length
      ? '<div class="flex flex-col gap-1.5 mt-2" style="max-height:420px;overflow-y:auto;">' + lista.map(a => _cpaVoceHtml(a, r, !!ign[a.id])).join('') + '</div>'
      : '<div class="text-sm mt-3 mb-1" style="color:#15803d;">✅ ' + (_cpa.filtro ? 'Nessuna anomalia di questo tipo.' : 'Nessuna anomalia aperta per questa settimana.') + '</div>';
    if (_cpa.risolte.size) corpo += '<div class="text-[11px] text-slate-500 mt-1">' + _cpa.risolte.size + ' correzioni applicate in questa sessione. Per i km, la "🔄 Sincronizza da Jira" le riporterà su Jira (con conferma).</div>';
  }
  root.innerHTML = '<div class="bg-white border border-amber-200 rounded-lg p-3 shadow-sm">' + intest + corpo + '</div>';
}
