
/* ==================== MAPPA · VISTA PROGRAMMAZIONE ====================
   Seconda fonte della Mappa (switch «🎫 Griglia e Jira | 📋 Programmazione» in toolbar,
   _mlFonte in mappa-live.js, scelta ricordata in localStorage.ml_fonte). Al posto dei cantieri
   in Griglia nel giorno/settimana scelti mostra gli elementi delle board della Programmazione
   che hanno una colonna di stato (prgColonnaGruppoBoard) e sono in uno degli stati della fase
   di rilievo (ML_PRG_STATI), anche quelli non ancora pianificati, col colore del loro stato.
   - Comune dell'elemento: il cantiere del collegamento alla Griglia (__griglia) se c'è,
     altrimenti prgComuneDalNome (nome senza rete/parentesi). La posizione viene dalla stessa
     rubrica luoghi della Griglia (_geoCache via mlGeo); i comuni nuovi si localizzano in
     sottofondo senza bloccare il render (mlPrgGeoSfondo); «Non localizzati» corregge.
   - Un pin per comune: più elementi nello stesso comune (es. FGN + ACQ) = un pin a spicchi,
     uno per stato, col numero di elementi al centro.
   - Filtro «Stato» = i 5 stati di ML_PRG_STATI (etichette riconosciute dall'inizio del testo).
   - Filtro «Tipo attività» (v18.309.0, al posto di «Operatore») = la colonna virtuale
     «🏷️ Tipo attività» della Programmazione (prgTipoAttivita: attività del collegamento alla
     Griglia, o del comune in Griglia se non collegato). Servono i dati della dashboard della
     commessa (_prgApp, letti in sottofondo da mlPrgAppSfondo): finché mancano il tipo è «da
     leggere» e la chip lo dice.
   - Giorno/settimana non contano: la toolbar li nasconde.
   Sola lettura: niente Jira, niente pwData. Il Realtime della Programmazione ridisegna
   (mlPrgOnDataChanged, chiamata da _prgRtRender). «📋 Apri» porta alla board con il pannello
   dell'elemento aperto. */

const ML_PRG_ND = 'nd';
const ML_PRG_ND_COLORE = '#cbd5e1';
/* Stati mostrati: solo la fase del rilievo (v18.307.0, scelta dell'utente). Le etichette delle
   board si riconoscono dall'inizio del testo normalizzato, così varianti come «Backlog
   pianificazion» (refuso in una board) finiscono nella stessa chip. Gli elementi negli altri
   stati (elaborazione, revisione, dato condiviso, consegnato…) o senza stato non vanno sulla
   mappa: se ne dice solo il numero in testata. Colore = quello della prima board che ha lo stato. */
const ML_PRG_STATI = [
  { k: 'backlog', l: 'Backlog pianificazione', re: /^backlog pianific/, c: '#c4c4c4' },
  { k: 'pianificazione', l: 'Pianificazione', re: /^pianificaz/, c: '#579bfc' },
  { k: 'progress', l: 'In progress', re: /^in progress/, c: '#fdab3d' },
  { k: 'pending', l: 'In pending', re: /^in pending/, c: '#ffcb00' },
  { k: 'completato', l: 'Rilievo completato', re: /^rilievo complet/, c: '#037f4c' },
];
let _mlPrgStati = [];          // [{ k, l, c }] = ML_PRG_STATI con i colori delle board
let _mlPrgEsclusi = 0;         // elementi in altri stati o senza stato, non mostrati
const ML_PRG_TIPO_ND = '— senza tipo';

function mlPrgPuo() {
  return typeof sbCanSeePage !== 'function' || sbCanSeePage('programmazione');
}

function mlSetFonte(f) {
  f = f === 'prg' && mlPrgPuo() ? 'prg' : 'jira';
  if (f === _mlFonte) return;
  _mlFonte = f;
  try { localStorage.setItem('ml_fonte', f); } catch (_) {}
  // Stati e operatori hanno valori diversi nelle due fonti: un filtro rimasto acceso
  // sarebbe invisibile (nessuna chip corrispondente) e svuoterebbe la mappa.
  _mlFiltroStati.clear();
  _mlFiltroOperatori.clear();
  _mlFiltroTipi.clear();
  mlCloseDrawer();
  mlRender({});
}

/* Board con colonna di stato ed elementi in memoria (stessi dati della Programmazione e
   della Griglia: se già caricati non si rilegge nulla). `forza` = «🔄 Aggiorna». */
async function mlPrgCarica(forza) {
  if (!_sbClient || !_sbUser) return;
  await prgCarica();
  for (const b of _prg.boards) {
    if (!prgColonnaGruppoBoard(b)) continue;
    if (forza || !_prg.caricate[b.id]) await prgCaricaBoard(b.id, forza);
  }
  prgSubscribe();
}

function mlPrgComune(b, el) {
  const l = prgLink(el);
  if (l && l.cantiere) return l.cantiere;
  return prgComuneDalNome(el.nome, b.commessa || '');
}

/* Una voce per elemento. Stessa forma minima delle voci della Griglia usata da filtri e
   rubrica (commessa, cantiere, operatori), più i dati dell'elemento. */
function mlPrgStatoDi(label) {
  const n = caNorm(label);
  return ML_PRG_STATI.find(s => s.re.test(n)) || null;
}

function mlPrgBuildItems() {
  const items = [];
  const colori = {};
  let esclusi = 0;
  _prg.boards.forEach(b => {
    const gc = prgColonnaGruppoBoard(b);
    if (!gc || !_prg.caricate[b.id]) return;
    const opz = gc.opzioni || [];
    opz.forEach(o => {
      const s = mlPrgStatoDi(o.label);
      if (s && o.colore && !colori[s.k]) colori[s.k] = o.colore;
    });
    prgEls(b.id).forEach(el => {
      const o = opz.find(x => x.id === (el.valori || {})[gc.id]);
      const s = o ? mlPrgStatoDi(o.label) : null;
      if (!s) { esclusi++; return; }
      const cantiere = String(mlPrgComune(b, el) || '').trim();
      if (!cantiere) return;
      items.push({
        tipi: mlPrgTipiDi(b, el),
        prg: true, el, board: b, commessa: b.commessa || b.nome || 'Board', cantiere,
        nome: el.nome || '', operatori: [], link: prgLink(el),
        stato: s.k, statoL: s.l, colore: colori[s.k] || s.c,
        ordine: ML_PRG_STATI.indexOf(s),
      });
    });
  });
  _mlPrgStati = ML_PRG_STATI.map(s => ({ k: s.k, l: s.l, c: colori[s.k] || s.c }));
  _mlPrgEsclusi = esclusi;
  return items;
}

/* Tipi di attività di un elemento: array di nomi ([] = nessun tipo trovato), null = non ancora
   noto (dati della dashboard della commessa da leggere, o non leggibili). */
function mlPrgTipiDi(b, el) {
  const t = prgTipoAttivita(b, el);
  if (t && t.carica) return null;
  if (t) return t.nomi.slice();
  const s = b.commessa ? _prgApp[b.commessa] : null;
  return b.commessa && (!s || s.stato === 'errore') ? null : [];
}

function mlPrgPassaTipo(it) {
  if (!_mlFiltroTipi.size) return true;
  if (!it.tipi) return false;   // tipo non ancora noto: non si può dire che corrisponda
  if (!it.tipi.length) return _mlFiltroTipi.has(ML_PRG_TIPO_ND);
  return it.tipi.some(t => _mlFiltroTipi.has(t));
}

function mlPrgFiltra(tutti) {
  let items = mlApplyFilters(tutti);
  if (_mlFiltroStati.size) items = items.filter(it => _mlFiltroStati.has(it.stato || ML_PRG_ND));
  if (_mlFiltroTipi.size) items = items.filter(mlPrgPassaTipo);
  return items;
}

/* Chip «Tipo attività»: i tipi presenti negli elementi, in ordine alfabetico, poi «senza tipo».
   Una scelta non più presente si scarta solo quando i tipi sono tutti noti (durante la lettura
   potrebbe solo non essere ancora arrivata). */
function mlPrgRenderChipsTipi(all) {
  const tipi = new Set();
  let nd = false, ignoti = 0;
  all.forEach(it => {
    if (!it.tipi) { ignoti++; return; }
    if (!it.tipi.length) nd = true;
    it.tipi.forEach(t => tipi.add(t));
  });
  const valori = [...tipi].sort((a, b) => a.localeCompare(b, 'it'));
  if (nd) valori.push(ML_PRG_TIPO_ND);
  if (!ignoti) [..._mlFiltroTipi].forEach(t => { if (!valori.includes(t)) _mlFiltroTipi.delete(t); });
  const inLettura = _prg.boards.some(b => b.commessa && _prgApp[b.commessa] && _prgApp[b.commessa].stato === 'carica');
  const msg = inLettura ? '⏳ leggo la Griglia…' : ignoti ? '⚠️ Griglia non leggibile per ' + ignoti + ' elementi' : '';
  mlRenderChips('ml-filtro-tipi', valori, _mlFiltroTipi, _mlSearchTipi, msg || 'nessun tipo di attività', false);
  const el = document.getElementById('ml-filtro-tipi');
  if (el) {
    el.querySelectorAll('.ml-chip').forEach(b => {
      b.title = b.dataset.v === ML_PRG_TIPO_ND
        ? 'Elementi senza attività: non collegati alla Griglia e senza un comune con lo stesso nome in Griglia'
        : 'Elementi con attività «' + b.dataset.v + '» (dal collegamento alla Griglia, o dal comune in Griglia se non collegato)';
    });
    if (msg && valori.length) el.insertAdjacentHTML('beforeend', '<span class="ml-empty">' + esc(msg) + '</span>');
  }
  mlSetFiltroCount('ml-n-tipi', _mlFiltroTipi.size);
}

/* Dati della dashboard (Griglia + produzione, modello di Avanzamento comuni) delle commesse delle
   board, letti in sottofondo una volta per sessione (come nella Programmazione): servono al tipo
   di attività. A lettura finita si ridisegna. `forza` = «🔄 Aggiorna». */
function mlPrgAppSfondo(forza) {
  const commesse = new Set(_prg.boards.filter(b => b.commessa && prgColonnaGruppoBoard(b)).map(b => b.commessa));
  commesse.forEach(c => {
    const s = _prgApp[c];
    if (s && s.promessa) return;
    if (!forza && s && s.stato) return;   // già letta, in lettura o in errore: niente giri a vuoto
    prgAppCarica(c, !!forza).then(() => mlPrgOnDataChanged()).catch(() => {});
  });
}

/* Un gruppo per comune (stessa chiave della rubrica luoghi), comuni in ordine alfabetico,
   elementi per stato (ordine della board) e nome. */
function mlPrgRaggruppa(items) {
  const by = {};
  const groups = [];
  items.forEach(it => {
    const key = it.cantiere.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!by[key]) {
      by[key] = { prg: true, key, cantiere: it.cantiere, items: [], commesse: new Set(), squadre: new Set(), operatori: new Set() };
      groups.push(by[key]);
    }
    by[key].items.push(it);
    by[key].commesse.add(it.commessa);
  });
  groups.forEach(g => {
    g.items.sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'));
    g.nOperatori = g.items.length;
    g.stato = g.items.some(it => it.stato) ? 'prg' : null;
  });
  groups.sort((a, b) => a.cantiere.localeCompare(b.cantiere, 'it'));
  return groups;
}

/* Stati presenti in un insieme di elementi, col conteggio, nell'ordine delle etichette. */
function mlPrgFette(items) {
  const cnt = new Map();
  items.forEach(it => {
    const k = it.stato || ML_PRG_ND;
    if (!cnt.has(k)) cnt.set(k, { k, n: 0, c: it.colore, l: it.statoL });
    cnt.get(k).n++;
  });
  const ordine = _mlPrgStati.map(s => s.k).concat([ML_PRG_ND]);
  return [...cnt.values()].sort((a, b) => ordine.indexOf(a.k) - ordine.indexOf(b.k));
}

/* Sfondo a spicchi (pin) o a fasce verticali (elenco), proporzionale al conteggio. */
function mlPrgSfondo(fette, verticale) {
  if (!fette.length) return ML_PRG_ND_COLORE;
  if (fette.length === 1) return fette[0].c;
  const tot = fette.reduce((s, f) => s + f.n, 0);
  let a = 0;
  const parti = fette.map(f => {
    const da = a;
    a += f.n / tot * 100;
    return f.c + ' ' + da.toFixed(1) + '% ' + a.toFixed(1) + '%';
  });
  return verticale ? 'linear-gradient(180deg, ' + parti.join(', ') + ')' : 'conic-gradient(' + parti.join(', ') + ')';
}

function mlPrgMarkerHtml(g) {
  const f = mlPrgFette(g.items);
  const nd = f.length === 1 && f[0].k === ML_PRG_ND;
  return '<div class="ml-pin' + (nd ? ' ml-pin-nd' : '') + '" style="background:' + esc(mlPrgSfondo(f)) + '">' +
    '<span class="ml-pin-n">' + g.items.length + '</span></div>';
}

/* Render della vista Programmazione: chiamata da mlRender (che gestisce _mlRendering e
   l'indicatore di caricamento). */
/* Niente attese sulla geocodifica (v18.307.0): con centinaia di comuni mai cercati il render
   restava fermo sotto «caricamento» per minuti. Si disegna subito con le posizioni già in
   rubrica; i comuni nuovi si cercano in sottofondo (mlPrgGeoSfondo) e i pin compaiono man mano. */
async function mlPrgRender(o) {
  const loading = document.getElementById('ml-loading');
  const daLeggere = o.forcePrg === true || !_prg.pronto ||
    _prg.boards.some(b => prgColonnaGruppoBoard(b) && !_prg.caricate[b.id]);
  if (daLeggere && loading) loading.style.display = 'flex';
  try {
    await mlPrgCarica(o.forcePrg === true);
  } catch (e) {
    _prg.errore = e.message || String(e);
  }
  await mlGeoAttendiRubrica();
  if (loading) loading.style.display = 'none';
  mlPrgAppSfondo(o.forcePrg === true);

  const tutti = mlPrgBuildItems();
  mlRenderFiltri(tutti);
  const items = mlPrgFiltra(tutti);
  const groups = mlPrgRaggruppa(items);
  _mlGroups = groups;
  _mlItems = items;
  mlDrawMarkers(groups, o.keepView === true);
  mlPrgRenderLista(groups, items);
  mlPrgRenderRiepilogo(groups, items);
  mlPrgTestata();

  if (_mlSelCantiere) {
    const still = groups.findIndex(g => g.key === _mlSelCantiere);
    if (still >= 0) mlOpenDettaglio(still, true); else mlCloseDrawer();
  }
  // Tutti i comuni, anche quelli esclusi dai filtri: altrimenti non verrebbero mai localizzati.
  mlPrgGeoSfondo(mlPrgRaggruppa(tutti));
}

const _mlPrgGeo = { attivo: false, resto: 0 };

function mlPrgTestata() {
  const lbl = document.getElementById('ml-header-dates');
  if (!lbl || _mlFonte !== 'prg') return;
  let t = '📋 Programmazione · fase di rilievo';
  if (_mlPrgEsclusi) t += ' · ' + _mlPrgEsclusi + ' elementi in altri stati non mostrati';
  if (_mlPrgGeo.attivo && _mlPrgGeo.resto) t += ' · 📍 localizzo ' + _mlPrgGeo.resto + ' comuni…';
  lbl.textContent = t;
}

/* Geocodifica in sottofondo, una ricerca Nominatim al secondo (limite del servizio), con
   ridisegno ogni 10 comuni trovati e alla fine. Si ferma cambiando fonte o screen; un solo
   giro alla volta. I comuni non trovati finiscono in «Non localizzati». */
async function mlPrgGeoSfondo(gruppi) {
  if (_mlPrgGeo.attivo) return;
  const coda = gruppi.filter(g => mlGeoPending(g.key));
  if (!coda.length) return;
  _mlPrgGeo.attivo = true;
  _mlPrgGeo.resto = coda.length;
  mlPrgTestata();
  let nuovi = 0;
  try {
    for (const g of coda) {
      if (_mlFonte !== 'prg' || !mlIsActive()) break;
      if (mlGeoPending(g.key)) {
        await geocodifica(g.cantiere);
        if (!(g.key in _geoCache)) _mlGeoFailed.add(g.key);
        nuovi++;
        await new Promise(r => setTimeout(r, 1000));
      }
      _mlPrgGeo.resto--;
      mlPrgTestata();
      if (nuovi && nuovi % 10 === 0) mlPrgRidisegna();
    }
  } finally {
    _mlPrgGeo.attivo = false;
    _mlPrgGeo.resto = 0;
    mlPrgTestata();
    if (nuovi) mlPrgRidisegna();
  }
}

function mlPrgRidisegna() {
  if (_mlFonte !== 'prg' || !mlIsActive() || _mlRendering) return;
  mlRender({ keepView: true });
}

/* Chip «Stato»: le etichette di tutte le board (fisse, anche se nessun elemento è in quello
   stato), poi «Senza stato». */
function mlPrgRenderChipsStato() {
  const el = document.getElementById('ml-filtro-stati');
  if (!el) return;
  const voci = _mlPrgStati.length ? _mlPrgStati : ML_PRG_STATI;
  const valide = new Set(voci.map(v => v.k));
  [..._mlFiltroStati].forEach(s => { if (!valide.has(s)) _mlFiltroStati.delete(s); });
  el.innerHTML = voci.map(s =>
    '<button class="ml-chip' + (_mlFiltroStati.has(s.k) ? ' active' : '') + '" style="--chip:' + esc(s.c) +
    '" data-v="' + esc(s.k) + '" title="' + esc('Elementi nello stato «' + s.l + '»') + '">' +
    esc(s.l) + '</button>').join('');
  el.querySelectorAll('.ml-chip').forEach(b => {
    b.onclick = () => { mlToggleSet(_mlFiltroStati, b.dataset.v); mlRender({ keepView: true }); };
  });
}

function mlPrgRenderLista(groups, items) {
  const el = document.getElementById('ml-lista');
  if (!el) return;
  const tc = document.getElementById('ml-side-cantieri');
  const tm = document.getElementById('ml-side-commesse');
  if (tc) tc.classList.toggle('active', _mlSideTab !== 'commesse');
  if (tm) tm.classList.toggle('active', _mlSideTab === 'commesse');
  if (_mlSideTab === 'commesse') { mlPrgRenderCommesse(items); return; }
  if (!groups.length) {
    el.innerHTML = '<div class="ml-empty" style="padding:14px;">' + esc(_prg.errore
      ? 'Programmazione non leggibile: ' + _prg.errore
      : 'Nessun elemento della Programmazione con i filtri attivi.') + '</div>';
    return;
  }
  el.innerHTML = groups.map((g, idx) => {
    const f = mlPrgFette(g.items);
    const warn = mlGeo(g.key) ? '' : '<span class="ml-warn" title="Comune non localizzato">📍?</span>';
    const sotto = g.items.length === 1 ? g.items[0].nome + ' · ' + g.items[0].statoL : f.map(x => x.n + ' ' + x.l).join(' · ');
    return '<button class="ml-row" data-idx="' + idx + '">' +
      '<span class="ml-row-main">' +
        '<span class="ml-row-t">' + esc(g.cantiere) + ' ' + warn + '</span>' +
        '<span class="ml-row-s" title="' + esc(g.items.map(it => it.nome + ' · ' + it.statoL).join('\n')) + '">' + esc(sotto) + '</span>' +
      '</span>' +
      '<span class="ml-row-n" title="Elementi">' + g.items.length + '</span>' +
      '<span class="ml-row-st" style="background:' + esc(mlPrgSfondo(f, true)) + '" title="' + esc(f.map(x => x.l + ': ' + x.n).join('\n')) + '"></span>' +
    '</button>';
  }).join('');
  el.querySelectorAll('.ml-row').forEach(b => {
    b.onclick = () => mlFocusGruppo(parseInt(b.dataset.idx, 10));
  });
}

/* Scheda «Commesse»: una riga per commessa (o board senza commessa) con la barra degli
   stati; il clic mostra sulla mappa solo quella (di nuovo = tutte). */
function mlPrgRenderCommesse(items) {
  const el = document.getElementById('ml-lista');
  if (!el) return;
  const by = new Map();
  items.forEach(it => {
    if (!by.has(it.commessa)) by.set(it.commessa, { nome: it.commessa, items: [], board: new Set(), comuni: new Set() });
    const c = by.get(it.commessa);
    c.items.push(it);
    c.board.add(it.board.nome);
    c.comuni.add(it.cantiere.toLowerCase());
  });
  const lista = [...by.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  if (!lista.length) {
    el.innerHTML = '<div class="ml-empty" style="padding:14px;">Nessuna commessa con i filtri attivi.</div>';
    return;
  }
  el.innerHTML = lista.map(c => {
    const f = mlPrgFette(c.items);
    const sel = _mlFiltroCommesse.size === 1 && _mlFiltroCommesse.has(c.nome);
    return '<button class="ml-row ml-row-comm" data-comm="' + esc(c.nome) + '" title="' +
      esc((sel ? 'Torna a tutte le commesse' : 'Mostra sulla mappa solo questa commessa') + '\n' + f.map(x => x.l + ': ' + x.n).join('\n')) + '">' +
      '<span class="ml-row-main">' +
        '<span class="ml-row-t">' + (sel ? '● ' : '') + esc(c.nome) + '</span>' +
        '<span class="ml-row-s">' + c.items.length + ' elementi · ' + c.comuni.size + ' comuni · ' + esc([...c.board].join(', ')) + '</span>' +
        '<span class="ml-bar">' + f.map(x => '<span class="ml-bar-seg" style="flex:' + x.n + ';background:' + esc(x.c) + '"></span>').join('') + '</span>' +
      '</span>' +
    '</button>';
  }).join('');
  el.querySelectorAll('.ml-row-comm').forEach(b => {
    b.onclick = () => {
      const nome = b.dataset.comm;
      const soloQuesta = _mlFiltroCommesse.size === 1 && _mlFiltroCommesse.has(nome);
      _mlFiltroCommesse.clear();
      if (!soloQuesta) _mlFiltroCommesse.add(nome);
      mlRender({});
    };
  });
}

function mlPrgRenderRiepilogo(groups, items) {
  const el = document.getElementById('ml-riepilogo');
  if (!el) return;
  const commesse = new Set(items.map(i => i.commessa));
  // Solo i comuni già cercati e non trovati: quelli in coda di localizzazione arrivano da soli.
  const senzaGeo = groups.filter(g => !mlGeo(g.key) && !mlGeoPending(g.key)).length;
  const box = (v, l, kind, titolo) =>
    '<button class="ml-kpi" data-ml-kpi="' + kind + '" title="' + esc(titolo) + '">' +
      '<span class="ml-kpi-v">' + v + '</span><span class="ml-kpi-l">' + esc(l) + '</span></button>';
  let html =
    box(items.length, 'Elementi', 'cantieri', "Elementi delle board: mostra l'elenco per comune") +
    box(groups.length, 'Comuni', 'cantieri', "Mostra l'elenco dei comuni") +
    box(commesse.size, 'Commesse', 'commesse', "Mostra l'elenco delle commesse");
  if (senzaGeo) html += box(senzaGeo, 'Non localizzati', 'nogeo', 'Comuni assenti dalla mappa: clicca per correggerne la posizione');
  el.innerHTML = html;
  el.querySelectorAll('[data-ml-kpi]').forEach(b => { b.onclick = () => mlOpenKpi(b.dataset.mlKpi); });
}

/* Dettaglio di un comune: un riquadro per elemento con stato, board, collegamento alla
   Griglia e le colonne compilate della board. */
function mlPrgDettaglioHtml(g) {
  const puo = mlPrgPuo();
  return g.items.map((it, i) => {
    const b = it.board, el = it.el;
    const gc = prgColonnaGruppoBoard(b);
    const kv = (l, v) => '<div class="ml-kv"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>';
    let h = '<div class="ml-sec"><div class="ml-sec-t">' + esc(it.nome) +
      (puo ? '<button class="ml-link ml-griglia-link" data-ml-prg="' + i + '" title="Apri la board della Programmazione con il pannello di questo elemento">📋 Apri</button>' : '') +
      '</div>';
    h += '<div class="ml-kv"><span>' + esc(gc ? gc.titolo || 'Stato' : 'Stato') + '</span><b><span class="ml-badge" style="background:' + esc(it.colore) +
      ';color:' + esc(prgTestoSuColore(it.colore)) + '">' + esc(it.statoL) + '</span></b></div>';
    h += kv('Board', b.nome || '');
    if (b.commessa) {
      h += kv('Commessa', b.commessa);
      h += kv('Griglia', it.link ? prgLinkTesto(it.link) : 'non collegato');
      h += kv('Tipo attività', it.tipi ? (it.tipi.length ? it.tipi.join(', ') : '—') : '…');
    }
    prgCols(b).forEach(c => {
      if (gc && c.id === gc.id) return;
      let t = prgTesto(c, (el.valori || {})[c.id], el);
      if (!t) return;
      if (t.length > 280) t = t.slice(0, 277) + '…';
      h += kv(c.titolo || '', t);
    });
    return h + '</div>';
  }).join('');
}

/* Handler del dettaglio e del pannello «Senza stato»: indici su _mlGroups/g.items in
   data-attribute, mai nomi dentro codice inline (apostrofi nei nomi dei comuni). */
function mlPrgBind(root, g) {
  root.querySelectorAll('[data-ml-prg]').forEach(b => {
    b.onclick = () => {
      const grp = b.dataset.mlPrgG != null ? _mlGroups[parseInt(b.dataset.mlPrgG, 10)] : g;
      const it = grp && grp.items[parseInt(b.dataset.mlPrg, 10)];
      if (it) mlPrgApri(it);
    };
  });
}

/* Porta alla board dell'elemento con il suo pannello aperto (scelta esplicita: cambia la
   board mostrata nella Programmazione, come se la si scegliesse lì). */
function mlPrgApri(it) {
  if (!mlPrgPuo()) return;
  _prg.boardId = it.board.id;
  _prg.pref.board = it.board.id;
  prgSalvaPref();
  _prg.sel = new Set();
  switchScreen('programmazione');
  prgApriDrawer(it.el.id, 'dettagli');
}

/* Realtime della Programmazione (da _prgRtRender, già con debounce): ridisegna la Mappa se
   è aperta su questa fonte. Durante un render in corso riprova poco dopo. */
function mlPrgOnDataChanged() {
  if (_mlFonte !== 'prg' || !mlIsActive()) return;
  if (_mlRendering) { setTimeout(mlPrgOnDataChanged, 600); return; }
  mlRender({ keepView: true });
}
