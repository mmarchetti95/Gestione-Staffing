/* ===================== CATALOGO ATTIVITÀ PER COMMESSA =====================
   state.commesse_attive_meta[commessa].attivita = [{ nome, produttiva, kpi_target, unita,
   activity_type: { id, label } | null, alias: string[] }] (dominio core, salvato col
   "Salva" della scheda commessa). Se una commessa ha il catalogo, in Griglia il campo
   attività propone solo quelle voci più le voci di servizio comuni (CA_ATTIVITA_SERVIZIO,
   mai produttive); le commesse senza catalogo restano a testo libero.
   - kpi_target: KPI_Quantità target GIORNALIERO per SQUADRA. Il target del sottotask di un
     operatore è kpi_target diviso chi, della sua squadra in Griglia, quel giorno è sullo
     stesso cantiere con la stessa attività (caKpiTargetVoce): chi è da solo prende tutto.
   - alias: nomi scritti a mano prima del catalogo ("Rielivo Wo Ip"…). Lo storico di pwData
     non viene riscritto: gli alias lo ricollegano alla voce giusta (caTrova).
   - activity_type: Activity Type Jira proposto nella creazione dei sottotask (prima era
     ricordato solo nel browser, vedi pwJiraActivityTypeGuess). */

HELP_TEXTS['#ma-btn-attivita'] = 'Apre il catalogo delle attività di questa commessa: nome, se è produttiva, KPI_Quantità target giornaliero per squadra, unità, Activity Type Jira e nomi vecchi (alias).\n\nCon il catalogo, in Griglia il campo attività diventa una tendina con queste voci (più Viaggio, Riposo compensativo e le altre voci di servizio) e un nome fuori catalogo viene rifiutato; i nomi già scritti nelle settimane passate non vengono toccati, gli alias li ricollegano alla voce giusta. «Importa dalla Griglia» propone i nomi già usati.\n\nLe modifiche valgono solo dopo «Salva» della scheda commessa e sono condivise con tutti.';

const CA_ATTIVITA_SERVIZIO = ['Viaggio', 'Rientro in sede', 'Riposo compensativo', 'Maltempo (pioggia)', 'Formazione', 'Infortunio', 'Permesso'];

// Confronto tollerante a maiuscole, accenti, spazi e "_" (i nomi in Griglia sono digitati a mano).
function caNorm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_\s]+/g, ' ').trim().toLowerCase();
}

function caCatalogo(commessa) {
  const meta = (state.commesse_attive_meta || {})[commessa];
  return (meta && Array.isArray(meta.attivita)) ? meta.attivita : [];
}

function caHaCatalogo(commessa) {
  return caCatalogo(commessa).length > 0;
}

/* Voce di catalogo per un testo di Griglia: per nome o alias della commessa, oppure voce di
   servizio ({ nome, produttiva: false, servizio: true }). null = fuori catalogo. */
function caTrova(commessa, testo) {
  const n = caNorm(testo);
  if (!n) return null;
  const voce = caCatalogo(commessa).find(a => caNorm(a.nome) === n || (a.alias || []).some(x => caNorm(x) === n));
  if (voce) return voce;
  const serv = CA_ATTIVITA_SERVIZIO.find(s => caNorm(s) === n);
  return serv ? { nome: serv, produttiva: false, servizio: true } : null;
}

// Nomi proposti nella tendina della Griglia: catalogo, poi voci di servizio.
function caNomiTendina(commessa) {
  return caCatalogo(commessa).map(a => a.nome).concat(CA_ATTIVITA_SERVIZIO);
}

function caFmtNum(n) {
  return (Math.round(Number(n) * 1000) / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

/* KPI_Quantità target del sottotask di un operatore in un giorno: kpi_target della voce di
   catalogo diviso i presenti della SUA squadra quel giorno sullo stesso cantiere con la
   stessa attività (stessa voce di catalogo, alias compresi). Un giorno senza attività
   prende quella dell'operatore sullo stesso cantiere (pwJiraAttivitaSottotask), come la
   creazione dei sottotask. null se la voce non è nel catalogo, non è produttiva o non ha
   un target. */
function caKpiTargetVoce(bc, comune, operatore, attivita, giorno) {
  if (!bc || !bc.commessa) return null;
  const voce = caTrova(bc.commessa, attivita);
  if (!voce || voce.servizio || voce.produttiva === false) return null;
  const kpi = Number(voce.kpi_target);
  if (!(kpi > 0)) return null;
  const dKey = String(giorno);
  const stessaVoce = (op, v) => v.cantiere === comune
    && caTrova(bc.commessa, pwJiraAttivitaSottotask(bc, v.cantiere, op.nome, v.attivita)) === voce;
  const squadra = (bc.squadre || []).find(sq => (sq.operatori || []).some(op =>
    op.nome === operatore && pwCellVoci((op.giorni || {})[dKey]).some(v => stessaVoce(op, v))));
  if (!squadra) return null;
  const presenti = new Set();
  (squadra.operatori || []).forEach(op => {
    if (op.nome && pwCellVoci((op.giorni || {})[dKey]).some(v => stessaVoce(op, v))) presenti.add(op.nome);
  });
  const n = Math.max(1, presenti.size);
  return { target: Math.round((kpi / n) * 1000) / 1000, kpiSquadra: kpi, presenti: n, unita: voce.unita || '', voce: voce.nome };
}

/* Nomi di attività usati in Griglia per una commessa (tutte le settimane), con il numero di
   voci, per costruire il catalogo dai dati esistenti. */
function caNomiUsatiInGriglia(commessa) {
  const conta = {};
  Object.keys(pwData || {}).forEach(anno => {
    if (!/^\d+$/.test(anno)) return;
    Object.values(pwData[anno] || {}).forEach(week => {
      if (!Array.isArray(week)) return;
      week.forEach(bc => {
        if (!bc || bc.commessa !== commessa) return;
        (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => Object.keys(op.giorni || {}).forEach(d => {
          pwCellVoci(op.giorni[d]).forEach(v => {
            const a = (v.attivita || '').trim();
            if (a) conta[a] = (conta[a] || 0) + 1;
          });
        })));
      });
    });
  });
  return Object.keys(conta).map(nome => ({ nome, n: conta[nome] })).sort((a, b) => b.n - a.n);
}

function caClona(lista) {
  return (lista || []).map(a => ({
    nome: a.nome || '',
    produttiva: a.produttiva !== false,
    kpi_target: (a.kpi_target === null || a.kpi_target === undefined || a.kpi_target === '') ? null : Number(a.kpi_target),
    unita: a.unita || '',
    activity_type: a.activity_type && a.activity_type.id ? { id: String(a.activity_type.id), label: a.activity_type.label || '' } : null,
    alias: [...(a.alias || [])],
  }));
}

function caSummaryHtml(lista, daSalvare) {
  if (!(lista || []).length) return '<div class="text-[10px] text-slate-400 mt-1">Nessun catalogo: in Griglia l\'attività resta a testo libero.</div>';
  return '<div class="mt-1 text-[10px] text-teal-700 bg-teal-50 rounded px-2 py-1 border border-teal-100">' +
    esc(lista.length + ' attività: ' + lista.map(a => a.nome + (a.produttiva !== false && a.kpi_target ? ' (' + caFmtNum(a.kpi_target) + (a.unita ? ' ' + a.unita : '') + '/sq)' : '')).join(', ')) +
    (daSalvare ? ' <span class="text-amber-700 font-medium">· premi «Salva» per confermarlo</span>' : '') + '</div>';
}

/* Editor del catalogo, aperto SOPRA la scheda commessa (stesso schema di
   openFabbisognoModal): lavora su una copia e la restituisce con opts.onSave(lista); il
   salvataggio vero lo fa il "Salva" della scheda commessa.
   opts: { commessa, jiraProjectCode, lista, onSave } */
function caOpenEditor(opts) {
  const commessa = opts.commessa || '';
  let lista = caClona(opts.lista);
  let activityValues = null; // [{id, value}] da Jira, se il progetto ha il campo
  let activityStato = opts.jiraProjectCode ? 'caricamento' : 'nocodice';

  const root = document.getElementById('modal-root');
  const layer = document.createElement('div');
  layer.className = 'modal-backdrop';
  const chiudi = () => layer.remove();

  // Legge i valori digitati prima di ogni re-render, così non si perdono.
  function leggi() {
    layer.querySelectorAll('[data-ca-idx]').forEach(row => {
      const a = lista[Number(row.dataset.caIdx)];
      if (!a) return;
      a.nome = row.querySelector('.ca-nome').value.trim();
      a.produttiva = row.querySelector('.ca-prod').checked;
      const k = row.querySelector('.ca-kpi').value.trim().replace(',', '.');
      a.kpi_target = k === '' || !isFinite(Number(k)) ? null : Number(k);
      a.unita = row.querySelector('.ca-unita').value.trim();
      a.alias = row.querySelector('.ca-alias').value.split(',').map(s => s.trim()).filter(Boolean);
      const sel = row.querySelector('.ca-at');
      if (sel) {
        const v = (activityValues || []).find(x => String(x.id) === sel.value);
        a.activity_type = v ? { id: String(v.id), label: v.value } : (sel.value === '' ? null : a.activity_type);
      }
    });
  }

  function activityHtml(a) {
    if (activityStato === 'nocodice') return '<span class="text-[10px] text-slate-400" title="Imposta il Codice progetto Jira della commessa">—</span>';
    if (activityStato === 'caricamento') return '<span class="text-[10px] text-slate-400">⏳</span>';
    if (!activityValues) return '<span class="text-[10px] text-slate-400" title="Il progetto Jira non ha il campo Activity Type">n/d</span>';
    const cur = a.activity_type ? String(a.activity_type.id) : '';
    return '<select class="ca-at w-full border border-slate-300 rounded px-1 py-1 text-xs"><option value="">—</option>' +
      activityValues.map(v => '<option value="' + esc(String(v.id)) + '"' + (String(v.id) === cur ? ' selected' : '') + '>' + esc(v.value) + '</option>').join('') + '</select>';
  }

  function righeHtml() {
    if (!lista.length) return '<div class="text-xs text-slate-400 italic py-2">Nessuna attività: aggiungile a mano o importale dai nomi usati in Griglia.</div>';
    return lista.map((a, i) => '<div data-ca-idx="' + i + '" class="grid gap-1 items-center py-1 border-b border-slate-100" style="grid-template-columns: minmax(0,2fr) 52px 70px 60px minmax(0,1.5fr) minmax(0,2fr) 22px;">' +
      '<input class="ca-nome border border-slate-300 rounded px-1.5 py-1 text-xs" value="' + esc(a.nome) + '" placeholder="Es: Rilievo IP">' +
      '<label class="flex justify-center"><input type="checkbox" class="ca-prod"' + (a.produttiva !== false ? ' checked' : '') + '></label>' +
      '<input class="ca-kpi border border-slate-300 rounded px-1.5 py-1 text-xs text-right" inputmode="decimal" value="' + (a.kpi_target === null ? '' : esc(String(a.kpi_target).replace('.', ','))) + '" placeholder="—">' +
      '<input class="ca-unita border border-slate-300 rounded px-1.5 py-1 text-xs" value="' + esc(a.unita) + '" placeholder="km">' +
      '<div>' + activityHtml(a) + '</div>' +
      '<input class="ca-alias border border-slate-300 rounded px-1.5 py-1 text-xs" value="' + esc((a.alias || []).join(', ')) + '" placeholder="nomi vecchi, separati da virgola">' +
      '<button type="button" class="ca-del text-slate-400 hover:text-red-600 text-sm" data-del="' + i + '" title="Togli">✕</button>' +
      '</div>').join('');
  }

  // Nomi usati in Griglia che il catalogo (nomi + alias + voci di servizio) non copre ancora.
  function nonCoperti() {
    const coperto = new Set();
    lista.forEach(a => { coperto.add(caNorm(a.nome)); (a.alias || []).forEach(x => coperto.add(caNorm(x))); });
    CA_ATTIVITA_SERVIZIO.forEach(s => coperto.add(caNorm(s)));
    return caNomiUsatiInGriglia(commessa).filter(x => !coperto.has(caNorm(x.nome)));
  }

  function importHtml() {
    const nc = nonCoperti();
    if (!nc.length) return '<div class="text-[11px] text-emerald-700">✓ Tutti i nomi usati in Griglia per questa commessa sono coperti dal catalogo.</div>';
    const opzioni = '<option value="">— ignora —</option><option value="__nuova__">+ nuova attività</option>' +
      lista.map((a, i) => a.nome ? '<option value="' + i + '">alias di: ' + esc(a.nome) + '</option>' : '').join('');
    return '<div class="text-[11px] text-slate-500 mb-1">Nomi usati in Griglia non ancora coperti (' + nc.length + '): scegli se farne una nuova attività o il nome vecchio di una esistente.</div>' +
      '<div class="max-h-48 overflow-y-auto border border-slate-200 rounded px-2">' +
      nc.map(x => '<div class="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0 text-xs">' +
        '<span class="min-w-0 truncate">' + esc(x.nome) + ' <span class="text-slate-400">(' + x.n + ')</span></span>' +
        '<select class="ca-imp border border-slate-300 rounded px-1 py-0.5 text-xs w-48 shrink-0" data-nome="' + esc(x.nome) + '">' + opzioni + '</select></div>').join('') +
      '</div><div class="flex justify-end mt-1"><button type="button" id="ca-imp-applica" class="text-xs px-2 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100">Applica scelte</button></div>';
  }

  function render() {
    layer.querySelector('#ca-righe').innerHTML = righeHtml();
    layer.querySelector('#ca-import').innerHTML = importHtml();
    layer.querySelectorAll('.ca-del').forEach(b => b.onclick = () => { leggi(); lista.splice(Number(b.dataset.del), 1); render(); });
    const imp = layer.querySelector('#ca-imp-applica');
    if (imp) imp.onclick = () => {
      leggi();
      const nuove = [];
      layer.querySelectorAll('.ca-imp').forEach(sel => {
        const nome = sel.dataset.nome;
        if (sel.value === '__nuova__') nuove.push({ nome, produttiva: true, kpi_target: null, unita: '', activity_type: null, alias: [] });
        else if (sel.value !== '' && lista[Number(sel.value)]) lista[Number(sel.value)].alias.push(nome);
      });
      lista = lista.concat(nuove);
      render();
    };
  }

  layer.innerHTML = '<div class="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">' +
    '<h3 class="font-semibold text-slate-900 mb-1">Attività e KPI — ' + esc(commessa) + '</h3>' +
    '<p class="text-xs text-slate-500 mb-3">Le attività di questa commessa diventano la tendina del campo attività in Griglia. ' +
    '<b>KPI target</b> = KPI_Quantità target <b>giornaliero per squadra</b>: nel sottotask di ogni operatore va diviso per chi della sua squadra è quel giorno sullo stesso cantiere con la stessa attività. ' +
    'Le voci di servizio (' + esc(CA_ATTIVITA_SERVIZIO.join(', ')) + ') ci sono sempre e non sono produttive.</p>' +
    '<div class="grid gap-1 text-[10px] text-slate-500 uppercase font-medium border-b border-slate-200 pb-1" style="grid-template-columns: minmax(0,2fr) 52px 70px 60px minmax(0,1.5fr) minmax(0,2fr) 22px;">' +
    '<span>Attività</span><span class="text-center">Produttiva</span><span class="text-right">KPI/sq/gg</span><span>Unità</span><span>Activity Type</span><span>Nomi vecchi (alias)</span><span></span></div>' +
    '<div id="ca-righe"></div>' +
    '<button type="button" id="ca-add" class="mt-2 text-xs px-2 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded hover:bg-slate-200">+ Attività</button>' +
    '<div class="mt-4 pt-3 border-t border-slate-200"><div class="text-xs font-medium text-slate-600 mb-1">Importa dalla Griglia</div><div id="ca-import"></div></div>' +
    '<div class="flex justify-end gap-2 mt-4">' +
    '<button type="button" id="ca-annulla" class="px-3 py-1.5 text-sm border border-slate-300 rounded">Annulla</button>' +
    '<button type="button" id="ca-ok" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">OK</button>' +
    '</div></div>';
  root.appendChild(layer);
  render();

  layer.querySelector('#ca-add').onclick = () => { leggi(); lista.push({ nome: '', produttiva: true, kpi_target: null, unita: '', activity_type: null, alias: [] }); render(); };
  layer.querySelector('#ca-annulla').onclick = chiudi;
  layer.querySelector('#ca-ok').onclick = () => {
    leggi();
    const pulita = lista.filter(a => a.nome);
    const visti = new Map();
    for (const a of pulita) {
      for (const n of [a.nome].concat(a.alias || [])) {
        const k = caNorm(n);
        if (visti.has(k) && visti.get(k) !== a) { pwJiraFlowAlert('«' + n + '» compare due volte nel catalogo (come nome o come alias): ogni nome deve portare a una sola attività.'); return; }
        visti.set(k, a);
      }
      if (CA_ATTIVITA_SERVIZIO.some(s => caNorm(s) === caNorm(a.nome))) { pwJiraFlowAlert('«' + a.nome + '» è già una voce di servizio comune a tutte le commesse.'); return; }
    }
    opts.onSave(pulita);
    chiudi();
  };

  if (opts.jiraProjectCode) {
    pwJiraFetchExtraFields(opts.jiraProjectCode).then(fields => {
      const f = fields.find(x => x.extraKey === 'activityType' && x.allowedValues && x.allowedValues.length);
      activityValues = f ? f.allowedValues : null;
      activityStato = 'ok';
    }).catch(() => { activityStato = 'ok'; activityValues = null; })
      .then(() => { if (layer.isConnected) { leggi(); render(); } });
  }
}
