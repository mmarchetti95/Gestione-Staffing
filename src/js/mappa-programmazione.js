
/* ==================== MAPPA · VISTA PROGRAMMAZIONE ====================
   Seconda fonte della Mappa (switch «🎫 Griglia e Jira | 📋 Programmazione» in toolbar,
   _mlFonte in mappa-live.js, scelta ricordata in localStorage.ml_fonte). Al posto dei cantieri
   in Griglia nel giorno/settimana scelti mostra TUTTI gli elementi delle board della
   Programmazione che hanno una colonna di stato (prgColonnaGruppoBoard), anche quelli non
   ancora pianificati, colorati con il colore della loro etichetta di stato.
   - Comune dell'elemento: il cantiere del collegamento alla Griglia (__griglia) se c'è,
     altrimenti prgComuneDalNome (nome senza rete/parentesi). La posizione viene dalla stessa
     rubrica luoghi della Griglia (_geoCache via mlGeo, geocodifica a blocchi); il riquadro
     «Non localizzati» la corregge come per i cantieri.
   - Un pin per comune: più elementi nello stesso comune (es. FGN + ACQ) = un pin a spicchi,
     uno per stato, col numero di elementi al centro.
   - Filtro «Stato» = etichette delle board, con chiave l'etichetta normalizzata (caNorm), così
     board diverse con la stessa etichetta si filtrano insieme; più «Senza stato».
   - Giorno/settimana non contano: la toolbar li nasconde.
   Sola lettura: niente Jira, niente pwData. Il Realtime della Programmazione ridisegna
   (mlPrgOnDataChanged, chiamata da _prgRtRender). «📋 Apri» porta alla board con il pannello
   dell'elemento aperto. */

const ML_PRG_ND = 'nd';
const ML_PRG_ND_COLORE = '#cbd5e1';
let _mlPrgStati = [];          // [{ k, l, c }] etichette di stato di tutte le board, in ordine di board

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
function mlPrgBuildItems() {
  const items = [];
  const stati = new Map();
  _prg.boards.forEach(b => {
    const gc = prgColonnaGruppoBoard(b);
    if (!gc || !_prg.caricate[b.id]) return;
    const opz = gc.opzioni || [];
    opz.forEach(o => {
      const k = caNorm(o.label);
      if (k && !stati.has(k)) stati.set(k, { k, l: o.label, c: o.colore || ML_PRG_ND_COLORE });
    });
    prgEls(b.id).forEach(el => {
      const cantiere = String(mlPrgComune(b, el) || '').trim();
      if (!cantiere) return;
      const o = opz.find(x => x.id === (el.valori || {})[gc.id]);
      items.push({
        prg: true, el, board: b, commessa: b.commessa || b.nome || 'Board', cantiere,
        nome: el.nome || '', operatori: [], link: prgLink(el),
        stato: o ? caNorm(o.label) : null,
        statoL: o ? o.label : 'Senza stato',
        colore: o ? (o.colore || ML_PRG_ND_COLORE) : ML_PRG_ND_COLORE,
        ordine: o ? opz.indexOf(o) : 999,
      });
    });
  });
  _mlPrgStati = [...stati.values()];
  return items;
}

function mlPrgFiltra(tutti) {
  let items = mlApplyFilters(tutti);
  if (_mlFiltroStati.size) items = items.filter(it => _mlFiltroStati.has(it.stato || ML_PRG_ND));
  return items;
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
async function mlPrgRender(o) {
  const loading = document.getElementById('ml-loading');
  if (loading) loading.style.display = 'flex';
  try {
    await mlPrgCarica(o.forcePrg === true);
  } catch (e) {
    _prg.errore = e.message || String(e);
  }
  const tutti = mlPrgBuildItems();
  mlRenderFiltri(tutti);

  // Geocodifica a blocchi su TUTTI i comuni (anche quelli esclusi dai filtri), come per la Griglia.
  await mlGeoAttendiRubrica();
  const daGeocodificare = await mlGeocodificaGruppi(mlPrgRaggruppa(tutti));

  mlRenderFiltri(tutti);
  const items = mlPrgFiltra(tutti);
  const groups = mlPrgRaggruppa(items);
  _mlGroups = groups;
  _mlItems = items;
  mlDrawMarkers(groups, o.keepView === true);
  mlPrgRenderLista(groups, items);
  mlPrgRenderRiepilogo(groups, items);

  if (_mlSelCantiere) {
    const still = groups.findIndex(g => g.key === _mlSelCantiere);
    if (still >= 0) mlOpenDettaglio(still, true); else mlCloseDrawer();
  }
  if (daGeocodificare > 0) {
    setTimeout(() => {
      if (mlIsActive() && _mlFonte === 'prg') mlRender({ keepView: true });
    }, 1200);
  }
}

/* Chip «Stato»: le etichette di tutte le board (fisse, anche se nessun elemento è in quello
   stato), poi «Senza stato». */
function mlPrgRenderChipsStato() {
  const el = document.getElementById('ml-filtro-stati');
  if (!el) return;
  const voci = _mlPrgStati.concat([{ k: ML_PRG_ND, l: 'Senza stato', c: ML_PRG_ND_COLORE }]);
  if (_mlPrgStati.length) {
    const valide = new Set(voci.map(v => v.k));
    [..._mlFiltroStati].forEach(s => { if (!valide.has(s)) _mlFiltroStati.delete(s); });
  }
  el.innerHTML = voci.map(s =>
    '<button class="ml-chip' + (_mlFiltroStati.has(s.k) ? ' active' : '') + '" style="--chip:' + esc(s.c) +
    '" data-v="' + esc(s.k) + '" title="' + esc(s.k === ML_PRG_ND ? 'Elementi senza stato nella board' : 'Elementi nello stato «' + s.l + '»') + '">' +
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
  const senzaGeo = groups.filter(g => !mlGeo(g.key)).length;
  const senzaStato = items.filter(i => !i.stato).length;
  const box = (v, l, kind, titolo) =>
    '<button class="ml-kpi" data-ml-kpi="' + kind + '" title="' + esc(titolo) + '">' +
      '<span class="ml-kpi-v">' + v + '</span><span class="ml-kpi-l">' + esc(l) + '</span></button>';
  let html =
    box(items.length, 'Elementi', 'cantieri', "Elementi delle board: mostra l'elenco per comune") +
    box(groups.length, 'Comuni', 'cantieri', "Mostra l'elenco dei comuni") +
    box(commesse.size, 'Commesse', 'commesse', "Mostra l'elenco delle commesse");
  if (senzaGeo) html += box(senzaGeo, 'Non localizzati', 'nogeo', 'Comuni assenti dalla mappa: clicca per correggerne la posizione');
  if (senzaStato) html += box(senzaStato, 'Senza stato', 'prgnostato', 'Elementi senza stato nella board: clicca per vedere quali');
  el.innerHTML = html;
  el.querySelectorAll('[data-ml-kpi]').forEach(b => { b.onclick = () => mlOpenKpi(b.dataset.mlKpi); });
}

/* Pannello «Senza stato»: elementi da sistemare, ognuno con «📋 Apri». */
function mlPrgKpiNoStatoHtml() {
  let n = 0;
  const righe = [];
  _mlGroups.forEach((g, gi) => g.items.forEach((it, ii) => {
    if (it.stato) return;
    n++;
    righe.push('<div class="ml-cant"><div class="ml-cant-h"><b>' + esc(it.nome) + '</b>' +
      (mlPrgPuo() ? '<span class="ml-griglia-btns"><button class="ml-link ml-griglia-link" data-ml-prg-g="' + gi + '" data-ml-prg="' + ii + '" title="Apri l\'elemento nella Programmazione">📋 Apri</button></span>' : '') +
      '</div><div class="ml-cant-m">' + esc(g.cantiere + ' · ' + it.board.nome) + '</div></div>');
  }));
  if (!n) return '<div class="ml-note">Tutti gli elementi visibili hanno uno stato.</div>';
  return '<div class="ml-note" style="margin-bottom:7px;">Elementi senza un valore nella colonna di stato della board: sulla mappa sono grigi.</div>' +
    '<div class="ml-cant-list" style="max-height:none;">' + righe.join('') + '</div>';
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
