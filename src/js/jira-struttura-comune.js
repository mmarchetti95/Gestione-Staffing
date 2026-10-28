/* ==================== STRUTTURA JIRA PER COMUNE (dal MODELLO della commessa) ====================
   v18.231.0. Ogni comune nuovo su Jira vuole la stessa struttura (per SINFI: Iniziativa
   "Frontone" -> Epic "Frontone - Walk Out" / "Frontone - Digital Twin" -> 4 Task). Invece di
   crearla a mano, la commessa indica un MODELLO che esiste davvero in Jira (es. AI029-604
   "MODELLO") e l'Edge Function jira-struttura-comune lo copia per ogni comune, sostituendo
   "MODELLO" nei titoli e copiando i campi del modello. Niente modello = niente servizio.
   - state.commesse_attive_meta[commessa].jira_modello = { key, project, nodi: [{ key, summary,
     tipo, livello, parentKey }], attivita: { chiaveTaskModello: [nomi attività Griglia] },
     letto_il } (dominio core, salvato col "Salva" della scheda commessa). nodi è la copia
     dell'albero letta da Jira: serve a escludere il modello dalle tendine Epic/Task e a
     collegare le attività della Griglia ai Task.
   - Le chiavi create (o ritrovate: una struttura fatta a mano viene "adottata") stanno nella
     tabella jira_struttura_comune, scritta solo dall'Edge Function. È il legame CERTO
     comune -> Epic/Task: la creazione dei sottotask lo usa per PROPORRE Epic e Task
     (jstProponiPerGruppi), l'utente può sempre cambiarli. Il confronto comune in Griglia ->
     riga della tabella è sul nome normalizzato (caNorm) che l'utente stesso ha dato alla
     creazione; nessun abbinamento per nome con issue Jira non create/registrate qui.
   - La creazione richiede sempre l'anteprima (dryRun) e scrive su Jira solo al clic su "Crea". */

const JST_TABLE = 'jira_struttura_comune';
const JST_PARALLELO = 3;

const _jst = {
  righe: {},    // commessa -> { comune_norm: riga }
  carico: {},   // commessa -> Promise in corso
};

HELP_TEXTS['#ma-btn-modello'] = 'Imposta il MODELLO della struttura Jira di questa commessa: la chiave della radice di un albero che esiste davvero in Jira (es. AI029-604, l\'Iniziativa "MODELLO" con le sue Epic e i suoi Task). «Leggi da Jira» mostra l\'albero, cosa verrà copiato e permette di collegare ogni Task del modello alle attività della Griglia, così la creazione dei sottotask propone da sola Epic e Task.\n\nNei titoli del modello la parola MODELLO diventa il nome del comune. Le modifiche valgono solo dopo «Salva» della scheda commessa e sono condivise con tutti. Senza modello il servizio «Crea strutture comuni» non è disponibile.';
HELP_TEXTS['#ma-btn-strutture'] = 'Crea su Jira, per uno o più comuni, la stessa struttura del modello della commessa (es. Iniziativa → Epic → Task), senza sottotask: quelli li crea la Griglia giorno per giorno.\n\nPrima mostra sempre un\'anteprima di cosa verrà creato e cosa esiste già. Un comune che ha già la struttura (anche fatta a mano) viene solo completato con le parti mancanti, e le sue chiavi vengono registrate nell\'app. SCRIVE SU JIRA e le issue create non si cancellano da qui.';
HELP_TEXTS['#jst-leggi'] = 'Legge da Jira l\'albero del modello (radice e tutto quello che ha sotto fino ai Task) e mostra, per ogni issue, quali campi verranno copiati. Non scrive nulla.';
HELP_TEXTS['#jst-salva'] = 'Conferma il modello nella scheda commessa. Diventa definitivo (e condiviso) solo con «Salva» della scheda.';
HELP_TEXTS['#jst-rimuovi'] = 'Toglie il modello dalla commessa (dopo «Salva» della scheda): il servizio di creazione strutture si disattiva. Su Jira non cambia nulla e le strutture già registrate restano.';
HELP_TEXTS['#jst-suggerisci'] = 'Aggiunge all\'elenco i cantieri di questa commessa pianificati in Griglia da questa settimana in poi che non hanno ancora una struttura registrata.';
HELP_TEXTS['#jst-anteprima'] = 'Controlla su Jira, comune per comune, cosa esiste già e cosa verrebbe creato. Non scrive nulla.';
HELP_TEXTS['#jst-crea'] = 'Crea su Jira le parti mancanti per i comuni dell\'anteprima e registra le chiavi nell\'app (anche per i comuni già completi). SCRIVE SU JIRA: le issue create non si cancellano da qui.';

async function jstInvoke(body) {
  if (!_sbClient || !_sbUser) throw new Error('Non connesso a Supabase.');
  const { data, error } = await _sbClient.functions.invoke('jira-struttura-comune', { body });
  if (error) throw new Error(await _cpEdgeErr(error, 'jira-struttura-comune'));
  if (data && data.error) throw new Error(data.error);
  return data;
}

function jstModelloDi(meta) {
  const m = meta && meta.jira_modello;
  return m && m.key && Array.isArray(m.nodi) && m.nodi.length ? m : null;
}

// Chiavi delle issue del modello: non devono comparire fra le Epic/i Task proponibili.
function jstChiaviModello(meta) {
  const m = jstModelloDi(meta);
  return new Set(m ? m.nodi.map(n => n.key) : []);
}

/* Strutture registrate di una commessa (tabella), in cache per sessione. forza = rilegge. */
async function jstCarica(commessa, forza) {
  if (!commessa || !_sbClient || !_sbUser) return {};
  if (!forza && _jst.righe[commessa]) return _jst.righe[commessa];
  if (!forza && _jst.carico[commessa]) return _jst.carico[commessa];
  _jst.carico[commessa] = (async () => {
    const { data, error } = await _sbClient.from(JST_TABLE)
      .select('commessa,comune,comune_norm,project_key,modello_key,radice_key,nodi,stato,updated_at,updated_by')
      .eq('commessa', commessa).order('comune', { ascending: true });
    if (error) throw new Error(error.message);
    const idx = {};
    (data || []).forEach(r => { idx[r.comune_norm] = r; });
    _jst.righe[commessa] = idx;
    return idx;
  })();
  try { return await _jst.carico[commessa]; } finally { delete _jst.carico[commessa]; }
}

function jstStrutturaDi(commessa, comune) {
  const idx = _jst.righe[commessa];
  return (idx && idx[caNorm(comune)]) || null;
}

/* Chiave del Task del modello collegato a un'attività della Griglia (nome, alias o voce di
   catalogo, stesso confronto tollerante di caTrova). null = nessun collegamento. */
function jstTaskModelloPerAttivita(commessa, modello, attivita) {
  if (!modello || !modello.attivita) return null;
  const voce = caTrova(commessa, attivita);
  const nomi = [caNorm(attivita)];
  if (voce && voce.nome) nomi.push(caNorm(voce.nome));
  const hit = Object.keys(modello.attivita).find(k =>
    (modello.attivita[k] || []).some(a => nomi.includes(caNorm(a))));
  return hit || null;
}

/* Proposta Epic/Task per ogni gruppo comune+attività della creazione sottotask: dalla
   struttura registrata del comune, il Task collegato all'attività e l'Epic sopra di lui.
   Il Target Production del Task si legge da Jira (serve alle commesse senza catalogo). */
async function jstProponiPerGruppi(commessa, meta, gruppi) {
  const modello = jstModelloDi(meta);
  if (!modello) return gruppi.map(() => null);
  await jstCarica(commessa);
  const padreDi = {};
  modello.nodi.forEach(n => { padreDi[n.key] = n.parentKey || ''; });
  const taskCache = {};
  const out = [];
  for (const gr of gruppi) {
    const riga = jstStrutturaDi(commessa, gr.comune);
    const taskMod = jstTaskModelloPerAttivita(commessa, modello, gr.attivita);
    const nodoDi = k => riga && (riga.nodi || []).find(n => n.modello === k);
    const task = taskMod && nodoDi(taskMod);
    const epic = task && nodoDi(padreDi[taskMod]);
    if (!riga) { out.push({ senzaStruttura: true }); continue; }
    if (!task || !epic) { out.push(null); continue; }
    let targetProduction;
    try {
      if (!taskCache[epic.key]) taskCache[epic.key] = await pwJiraFetchTasks(epic.key, '');
      const t = taskCache[epic.key].find(x => x.key === task.key);
      if (t) targetProduction = t.targetProduction;
    } catch (_) { /* la proposta resta valida, senza Target Production */ }
    out.push({
      epic: { key: epic.key, summary: epic.summary },
      task: { key: task.key, summary: task.summary, targetProduction },
    });
  }
  return out;
}

function _jstProfondita(nodi) {
  const per = {};
  nodi.forEach(n => { per[n.key] = n; });
  const prof = {};
  nodi.forEach(n => {
    let d = 0, p = n.parentKey;
    while (p && per[p] && d < 10) { d++; p = per[p].parentKey; }
    prof[n.key] = d;
  });
  return prof;
}

function jstSummaryHtml(modello, modificato) {
  if (!modello) return '<div class="text-[11px] text-slate-400 italic mt-1">Nessun modello: il servizio «Crea strutture comuni» non è disponibile.</div>';
  const nTask = modello.nodi.filter(n => n.livello === 0).length;
  const collegati = Object.keys(modello.attivita || {}).filter(k => (modello.attivita[k] || []).length).length;
  return '<div class="text-[11px] text-slate-600 mt-1">Modello <b>' + esc(modello.key) + '</b> · ' + modello.nodi.length + ' issue (' + nTask + ' Task, ' + collegati + ' collegati ad attività)'
    + (modificato ? ' <span class="text-amber-600">— da salvare</span>' : '') + '</div>';
}

/* ----- Editor del modello (si apre sopra la scheda commessa) -----
   opts: { commessa, modello, jiraProjectCode, attivita (catalogo in bozza), onSave(modello|null) } */
function jstOpenModelloEditor(opts) {
  const root = document.getElementById('modal-root');
  const layer = document.createElement('div');
  layer.className = 'modal-backdrop';
  const chiudi = () => layer.remove();
  let modello = opts.modello ? JSON.parse(JSON.stringify(opts.modello)) : null;
  let dettaglio = null; // risposta di "Leggi da Jira" (campi copiati, avvisi)
  let errore = '';
  let lettura = false;
  const catalogo = (opts.attivita || []).map(a => a.nome).filter(Boolean);

  function leggiMappatura() {
    if (!modello) return;
    const att = {};
    layer.querySelectorAll('[data-jst-task]').forEach(el => {
      const k = el.dataset.jstTask;
      const nomi = el.tagName === 'INPUT' && el.type === 'text'
        ? el.value.split(',').map(s => s.trim()).filter(Boolean)
        : [...el.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.value);
      if (nomi.length) att[k] = nomi;
    });
    modello.attivita = att;
  }

  function attivitaHtml(n) {
    const scelte = (modello.attivita && modello.attivita[n.key]) || [];
    if (!catalogo.length) {
      return '<input type="text" data-jst-task="' + esc(n.key) + '" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Attività della Griglia, separate da virgola" value="' + esc(scelte.join(', ')) + '">';
    }
    return '<div data-jst-task="' + esc(n.key) + '" class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">' + catalogo.map(nome =>
      '<label class="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer"><input type="checkbox" value="' + esc(nome) + '"' + (scelte.some(s => caNorm(s) === caNorm(nome)) ? ' checked' : '') + '>' + esc(nome) + '</label>'
    ).join('') + '</div>';
  }

  function alberoHtml() {
    if (lettura) return '<div class="text-xs text-slate-400 py-3">⏳ Lettura del modello da Jira…</div>';
    if (errore) return '<div class="text-xs text-red-700 py-2">' + esc(errore) + '</div>';
    if (!modello) return '<div class="text-xs text-slate-400 italic py-2">Inserisci la chiave della radice del modello e premi «Leggi da Jira».</div>';
    const prof = _jstProfondita(modello.nodi);
    const det = {};
    ((dettaglio && dettaglio.nodi) || []).forEach(n => { det[n.key] = n; });
    const righe = modello.nodi.map(n => {
      const d = det[n.key];
      const campi = d ? '<div class="text-[10px] text-slate-500">Copia: ' + (d.campi.length ? esc(d.campi.join(', ')) : '—') + (d.saltati.length ? ' <span class="text-slate-400">· non copiati: ' + esc(d.saltati.join(', ')) + '</span>' : '') + '</div>' : '';
      return '<div class="border-l-2 border-slate-200 pl-2 py-1" style="margin-left:' + (prof[n.key] * 18) + 'px">'
        + '<div class="text-xs"><span class="text-slate-400">[' + esc(n.tipo) + ']</span> <a href="' + esc(_jstUrl(n.key, modello)) + '" target="_blank" class="font-medium text-teal-700 hover:underline">' + esc(n.key) + '</a> · ' + esc(n.summary)
        + (d && d.assegnatario ? ' <span class="text-slate-400">→ ' + esc(d.assegnatario) + '</span>' : '') + '</div>'
        + campi
        + (n.livello === 0 ? '<div class="text-[10px] text-slate-500 mt-0.5">Attività della Griglia che vanno su questo Task:</div>' + attivitaHtml(n) : '')
        + '</div>';
    }).join('');
    const avvisi = ((dettaglio && dettaglio.avvisi) || []).map(a => '<div class="text-[11px] text-amber-700">⚠️ ' + esc(a) + '</div>').join('');
    const progetto = opts.jiraProjectCode && modello.project && modello.project.toUpperCase() !== opts.jiraProjectCode.toUpperCase()
      ? '<div class="text-[11px] text-red-700">⚠️ Il modello è nel progetto ' + esc(modello.project) + ' ma il Codice progetto Jira della commessa è ' + esc(opts.jiraProjectCode) + ': correggi uno dei due.</div>' : '';
    const letto = modello.letto_il ? '<div class="text-[10px] text-slate-400 mb-1">Letto da Jira il ' + esc(fmtDate(modello.letto_il.slice(0, 10))) + (dettaglio ? '' : ' — «Leggi da Jira» per vedere i campi copiati') + '</div>' : '';
    return letto + avvisi + progetto + '<div class="mt-1">' + righe + '</div>';
  }

  function disegnaEditor() {
    const keyVal = (layer.querySelector('#jst-key') || {}).value;
    layer.innerHTML = '<div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">'
      + '<h3 class="font-semibold text-slate-900 mb-1">Modello struttura Jira — ' + esc(opts.commessa) + '</h3>'
      + '<p class="text-xs text-slate-500 mb-3">La radice di un albero vero in Jira (Iniziativa o Epic, con sotto Epic e Task). Nei titoli la parola <b>MODELLO</b> diventerà il nome del comune; i sottotask non si copiano.</p>'
      + '<div class="flex gap-2 items-end mb-2"><label class="block text-xs flex-1"><span class="text-slate-600">Chiave della radice del modello</span>'
      + '<input id="jst-key" class="mt-0.5 w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Es: AI029-604" value="' + esc(keyVal !== undefined ? keyVal : (modello ? modello.key : '')) + '"></label>'
      + '<button type="button" id="jst-leggi" class="px-3 py-1.5 text-sm bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 whitespace-nowrap">🔎 Leggi da Jira</button></div>'
      + '<div id="jst-albero" class="p-2 bg-slate-50 rounded border border-slate-200">' + alberoHtml() + '</div>'
      + '<div class="flex justify-between mt-4 gap-2">'
      + '<button type="button" id="jst-rimuovi" class="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded hover:bg-slate-50"' + (opts.modello ? '' : ' disabled style="opacity:0.5;"') + '>Rimuovi modello</button>'
      + '<div class="flex gap-2"><button type="button" id="jst-annulla" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>'
      + '<button type="button" id="jst-salva" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">OK</button></div></div>'
      + '</div>';
    layer.querySelector('#jst-annulla').onclick = chiudi;
    layer.querySelector('#jst-rimuovi').onclick = () => { opts.onSave(null); chiudi(); };
    layer.querySelector('#jst-leggi').onclick = leggiDaJira;
    layer.querySelector('#jst-key').onkeydown = e => { if (e.key === 'Enter') leggiDaJira(); };
    layer.querySelector('#jst-salva').onclick = salva;
  }

  async function leggiDaJira() {
    leggiMappatura();
    const key = layer.querySelector('#jst-key').value.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) { errore = 'Chiave non valida (es. AI029-604).'; disegnaEditor(); return; }
    const mappaPrima = (modello && modello.attivita) || {};
    lettura = true; errore = ''; disegnaEditor();
    try {
      const r = await jstInvoke({ mode: 'modello', modelloKey: key });
      dettaglio = r.modello;
      const nodi = dettaglio.nodi.map(n => ({ key: n.key, summary: n.summary, tipo: n.tipo, livello: n.livello, parentKey: n.parentKey }));
      const att = {};
      nodi.forEach(n => { if (n.livello === 0 && mappaPrima[n.key]) att[n.key] = mappaPrima[n.key]; });
      modello = { key: dettaglio.key, project: dettaglio.projectKey, base: dettaglio.base || '', nodi, attivita: att, letto_il: new Date().toISOString() };
    } catch (e) {
      errore = e.message || String(e);
      dettaglio = null;
    }
    lettura = false;
    disegnaEditor();
  }

  function salva() {
    const key = layer.querySelector('#jst-key').value.trim().toUpperCase();
    if (!key) { opts.onSave(null); chiudi(); return; }
    if (!modello || modello.key !== key) { errore = 'Premi «Leggi da Jira» per controllare il modello ' + key + ' prima di confermarlo.'; disegnaEditor(); return; }
    leggiMappatura();
    if (opts.jiraProjectCode && modello.project && modello.project.toUpperCase() !== opts.jiraProjectCode.toUpperCase()) {
      errore = 'Il modello è nel progetto ' + modello.project + ', diverso dal Codice progetto Jira della commessa (' + opts.jiraProjectCode + ').';
      disegnaEditor(); return;
    }
    const doppie = {};
    Object.keys(modello.attivita || {}).forEach(k => (modello.attivita[k] || []).forEach(a => { (doppie[caNorm(a)] = doppie[caNorm(a)] || []).push(k); }));
    const conflitti = Object.keys(doppie).filter(a => doppie[a].length > 1);
    if (conflitti.length) { errore = 'Un\'attività può andare su un solo Task: ' + conflitti.join(', ') + '.'; disegnaEditor(); return; }
    opts.onSave(modello);
    chiudi();
  }

  disegnaEditor();
  root.appendChild(layer);
}

// Link a una issue: la base arriva dall'Edge Function con la lettura del modello (modello.base).
function _jstUrl(key, modello) {
  const base = (modello && modello.base) || 'https://eagleprojects.atlassian.net';
  return base.replace(/\/+$/, '') + '/browse/' + encodeURIComponent(key);
}

/* Cantieri della commessa pianificati in Griglia da questa settimana in poi. */
function _jstCantieriDallaGriglia(commessa) {
  const oggi = isoWeekYear(new Date());
  const visti = {};
  Object.keys(pwData || {}).forEach(anno => {
    const settimane = pwData[anno];
    if (!/^\d+$/.test(anno) || !settimane || typeof settimane !== 'object') return;
    Object.keys(settimane).forEach(week => {
      const blocchi = settimane[week];
      if (!Array.isArray(blocchi)) return;
      if (Number(anno) < oggi.year || (Number(anno) === oggi.year && Number(week) < oggi.week)) return;
      blocchi.forEach(bc => {
        if (!bc || bc.commessa !== commessa) return;
        (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op =>
          Object.keys(op.giorni || {}).forEach(d => pwCellVoci(op.giorni[d]).forEach(v => {
            const n = caNorm(v.cantiere);
            if (n && !visti[n]) visti[n] = v.cantiere.trim();
          }))));
      });
    });
  });
  return Object.values(visti);
}

/* ----- Creazione strutture per uno o più comuni (si apre sopra la scheda commessa) -----
   Anteprima obbligatoria (dryRun) prima di "Crea". */
function jstOpenCreaModal(commessa, modello) {
  if (!sbGuardWrite()) return;
  if (!modello) { showAlertModal('Imposta prima il modello della struttura Jira nella scheda commessa.'); return; }
  const root = document.getElementById('modal-root');
  const layer = document.createElement('div');
  layer.className = 'modal-backdrop';
  const chiudi = () => layer.remove();
  let anteprima = null;  // [{ comune, esito?, errore? }]
  let fatto = null;      // [{ comune, esito?, errore? }] dopo "Crea"
  let inCorso = '';

  function comuniDalTesto() {
    const visti = {};
    return layer.querySelector('#jst-comuni').value.split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => { const n = caNorm(s); if (!n || visti[n]) return false; visti[n] = true; return true; });
  }

  function statoComune(r) {
    if (r.errore) return '<span class="text-red-700">⚠️ ' + esc(r.errore) + '</span>';
    const nodi = r.esito.nodi || [];
    const conta = s => nodi.filter(n => n.stato === s).length;
    const parti = [];
    if (conta('creato')) parti.push('<span class="text-emerald-700">🟢 ' + conta('creato') + ' create</span>');
    if (conta('da_creare')) parti.push('<span class="text-emerald-700">🆕 ' + conta('da_creare') + ' da creare</span>');
    if (conta('esiste')) parti.push('<span class="text-blue-700">🔵 ' + conta('esiste') + ' già presenti</span>');
    if (conta('errore')) parti.push('<span class="text-red-700">⚠️ ' + conta('errore') + ' errori</span>');
    if (conta('saltato')) parti.push('<span class="text-slate-500">' + conta('saltato') + ' saltate</span>');
    if (fatto) parti.push(r.esito.salvato ? '<span class="text-slate-500">· registrata nell\'app</span>' : '<span class="text-amber-700">· non registrata nell\'app</span>');
    return parti.join(' &nbsp;');
  }

  function dettaglioComune(r) {
    if (r.errore) return '';
    const prof = {};
    (r.esito.nodi || []).forEach(n => { prof[n.modello] = n.livello; });
    const maxLiv = Math.max(0, ...(r.esito.nodi || []).map(n => n.livello));
    const icone = { esiste: '🔵', da_creare: '🆕', creato: '🟢', errore: '⚠️', saltato: '⏭️' };
    return (r.esito.avvisi || []).map(a => '<div class="text-[11px] text-amber-700">⚠️ ' + esc(a) + '</div>').join('')
      + (r.esito.nodi || []).map(n => '<div class="text-[11px]" style="margin-left:' + ((maxLiv - n.livello) * 16) + 'px">'
        + (icone[n.stato] || '') + ' <span class="text-slate-400">[' + esc(n.tipo) + ']</span> '
        + (n.key ? '<a href="' + esc(n.url || _jstUrl(n.key, modello)) + '" target="_blank" class="text-teal-700 hover:underline">' + esc(n.key) + '</a> · ' : '')
        + esc(n.summary)
        + (n.message ? ' <span class="' + (n.stato === 'errore' ? 'text-red-700' : 'text-amber-700') + '">— ' + esc(n.message) + '</span>' : '')
        + '</div>').join('');
  }

  function risultatiHtml(lista) {
    return lista.map(r => '<details class="border border-slate-200 rounded px-2 py-1.5 mb-1.5"' + (r.errore || (r.esito.nodi || []).some(n => n.stato === 'errore') ? ' open' : '') + '>'
      + '<summary class="cursor-pointer text-sm"><b>' + esc(r.comune) + '</b> &nbsp;<span class="text-[11px]">' + statoComune(r) + '</span></summary>'
      + '<div class="mt-1">' + dettaglioComune(r) + '</div></details>').join('');
  }

  function registrateHtml() {
    const idx = _jst.righe[commessa] || {};
    const righe = Object.values(idx).sort((a, b) => a.comune.localeCompare(b.comune, 'it'));
    if (!righe.length) return '';
    return '<details class="mt-3"><summary class="cursor-pointer text-xs text-slate-600">Strutture già registrate nell\'app: ' + righe.length + '</summary><div class="mt-1 text-[11px] text-slate-600">'
      + righe.map(r => esc(r.comune) + ' (<a href="' + esc(_jstUrl(r.radice_key, modello)) + '" target="_blank" class="text-teal-700 hover:underline">' + esc(r.radice_key) + '</a>' + (r.stato === 'parziale' ? ', <span class="text-amber-700">parziale</span>' : '') + ')').join(' · ')
      + '</div></details>';
  }

  function disegnaCrea() {
    const testo = (layer.querySelector('#jst-comuni') || {}).value || '';
    const lista = fatto || anteprima;
    const daFare = anteprima && !fatto ? anteprima.filter(r => !r.errore).length : 0;
    layer.innerHTML = '<div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">'
      + '<h3 class="font-semibold text-slate-900 mb-1">🏗️ Crea strutture comuni — ' + esc(commessa) + '</h3>'
      + '<p class="text-xs text-slate-500 mb-3">Modello <a href="' + esc(_jstUrl(modello.key, modello)) + '" target="_blank" class="text-teal-700 hover:underline">' + esc(modello.key) + '</a> (' + modello.nodi.length + ' issue, progetto ' + esc(modello.project || '') + '). Un comune per riga: viene creata la stessa struttura, con il nome del comune al posto di MODELLO. I comuni che l\'hanno già vengono solo completati.</p>'
      + '<div class="flex items-center justify-between mb-1"><span class="text-xs text-slate-600">Comuni</span>'
      + '<button type="button" id="jst-suggerisci" class="text-[11px] text-teal-700 hover:underline">+ Suggerisci dalla Griglia</button></div>'
      + '<textarea id="jst-comuni" rows="5" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="Frontone&#10;Pietrarubbia"' + (inCorso || fatto ? ' disabled' : '') + '>' + esc(testo) + '</textarea>'
      + (inCorso ? '<div class="text-xs text-slate-500 my-2">⏳ ' + esc(inCorso) + '</div>' : '')
      + (lista ? '<div class="mt-3">' + (fatto ? '<div class="text-xs font-medium text-slate-700 mb-1">Esito</div>' : '<div class="text-xs font-medium text-slate-700 mb-1">Anteprima (nulla è stato ancora scritto su Jira)</div>') + risultatiHtml(lista) + '</div>' : '')
      + registrateHtml()
      + '<div class="flex justify-end gap-2 mt-4">'
      + '<button type="button" id="jst-chiudi" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Chiudi</button>'
      + (fatto ? '' : '<button type="button" id="jst-anteprima" class="px-3 py-1.5 text-sm border border-teal-300 text-teal-700 rounded hover:bg-teal-50"' + (inCorso ? ' disabled' : '') + '>Anteprima</button>'
        + '<button type="button" id="jst-crea" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700"' + (inCorso || !daFare ? ' disabled style="opacity:0.5;"' : '') + '>Crea' + (daFare ? ' (' + daFare + ' comun' + (daFare === 1 ? 'e' : 'i') + ')' : '') + '</button>')
      + '</div></div>';
    layer.querySelector('#jst-chiudi').onclick = chiudi;
    const sugg = layer.querySelector('#jst-suggerisci');
    if (sugg) sugg.onclick = suggerisci;
    const ta = layer.querySelector('#jst-comuni');
    ta.oninput = () => { if (anteprima) { anteprima = null; disegnaCrea(); layer.querySelector('#jst-comuni').focus(); } };
    const ant = layer.querySelector('#jst-anteprima');
    if (ant) ant.onclick = () => esegui(true);
    const crea = layer.querySelector('#jst-crea');
    if (crea) crea.onclick = () => esegui(false);
  }

  function suggerisci() {
    const ta = layer.querySelector('#jst-comuni');
    const gia = {};
    ta.value.split(/\r?\n/).forEach(s => { gia[caNorm(s)] = true; });
    const nuovi = _jstCantieriDallaGriglia(commessa).filter(c => !gia[caNorm(c)] && !jstStrutturaDi(commessa, c));
    if (!nuovi.length) { _jstNota(layer, 'Nessun cantiere della Griglia (da questa settimana in poi) senza struttura registrata.'); return; }
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + nuovi.sort((a, b) => a.localeCompare(b, 'it')).join('\n');
    anteprima = null;
    disegnaCrea();
  }

  async function esegui(dryRun) {
    const comuni = dryRun ? comuniDalTesto() : anteprima.filter(r => !r.errore).map(r => r.comune);
    if (!comuni.length) { _jstNota(layer, 'Scrivi almeno un comune.'); return; }
    if (comuni.length > 40) { _jstNota(layer, 'Al massimo 40 comuni per volta.'); return; }
    const out = new Array(comuni.length);
    let fatti = 0;
    inCorso = (dryRun ? 'Verifica su Jira' : 'Creazione su Jira') + ': 0/' + comuni.length;
    disegnaCrea();
    let next = 0;
    const worker = async () => {
      while (next < comuni.length) {
        const i = next++;
        try {
          const esito = await jstInvoke({ mode: 'comune', commessa, modelloKey: modello.key, comune: comuni[i], dryRun });
          out[i] = { comune: comuni[i], esito };
        } catch (e) {
          out[i] = { comune: comuni[i], errore: e.message || String(e) };
        }
        fatti++;
        inCorso = (dryRun ? 'Verifica su Jira' : 'Creazione su Jira') + ': ' + fatti + '/' + comuni.length;
        const el = layer.querySelector('.text-xs.text-slate-500.my-2');
        if (el) el.textContent = '⏳ ' + inCorso;
      }
    };
    // In creazione un comune alla volta: le issue di un comune nascono in ordine (padre prima dei figli).
    await Promise.all(Array.from({ length: Math.min(dryRun ? JST_PARALLELO : 2, comuni.length) }, worker));
    inCorso = '';
    if (dryRun) {
      anteprima = out;
    } else {
      fatto = out;
      try { await jstCarica(commessa, true); } catch (_) { /* l'elenco registrate resta quello di prima */ }
      const creati = out.reduce((s, r) => s + ((r.esito && r.esito.nodi) || []).filter(n => n.stato === 'creato').length, 0);
      if (creati) sbLogActivity('Strutture Jira comuni', { commessa, modello: modello.key, comuni: comuni.length, issue_create: creati });
    }
    disegnaCrea();
  }

  disegnaCrea();
  root.appendChild(layer);
  jstCarica(commessa).then(() => { if (layer.isConnected && !inCorso) disegnaCrea(); }).catch(() => {});
}

// Avviso dentro una finestra impilata (showAlertModal riscriverebbe #modal-root, chiudendo tutto).
function _jstNota(layer, msg) {
  const d = document.createElement('div');
  d.className = 'modal-backdrop';
  d.innerHTML = '<div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5"><div class="mb-4 text-sm">' + esc(msg) + '</div><div class="flex justify-end"><button type="button" class="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">OK</button></div></div>';
  d.querySelector('button').onclick = () => d.remove();
  layer.appendChild(d);
}
