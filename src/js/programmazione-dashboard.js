/* ==================== PROGRAMMAZIONE · COLLEGAMENTO CON LA DASHBOARD (rilascio 2) ====================
   Lega ogni elemento di una board a una voce della Griglia (cantiere + attività di catalogo) e
   da lì legge quello che la dashboard sa già, senza nuovi dati da tenere allineati a mano:
   - COLLEGAMENTO: valori['__griglia'] = { cantiere, attivita } dell'elemento, scritto con
     prg_imposta come ogni altro campo (finisce nello storico, si ripristina). Lo propone
     prgProponiLink dal nome dell'elemento («Gubbio FGN (BIANCA)» → Gubbio · Rilievo Wo Fognatura
     Bianca), ma lo scrive SOLO l'utente: mai un abbinamento per nome senza conferma.
   - DATI DELLA DASHBOARD (sola lettura, colonne virtuali «🔗 Griglia», «📅 In Griglia»,
     «📈 Avanzamento», «🎫 Jira» e scheda «🔗 Dashboard» del pannello): stesso modello di
     Avanzamento comuni (_avCaricaRighe + _avCalcola: pwData + controllo_produzione, attribuzione
     per sottotask), stato dei Task Jira dalle cache della Mappa (mlEnsureTaskStatus), strutture
     Jira registrate (jstCarica). Calcolato una volta per commessa e sessione; «↻» lo rilegge.
   - AZIONI dalla riga o dalla selezione: «➕ Auto-pianifica» (righe nella lista della settimana
     scelta, apAccodaRighe: la Griglia la scrive sempre e solo Auto-pianifica, su conferma),
     «🏗️ Struttura Jira» (la creazione strutture con i comuni già scritti; anteprima obbligatoria).
   - STATI PROPOSTI: dal lavoro in Griglia/Jira si propone di portare AVANTI lo stato della board
     (Pianificazione / In progress / Rilievo completato), mai indietro e mai da solo: si applica
     con un clic, per elemento o in blocco. */

const PRG_LINK = '__griglia';
const PRG_APP_COLS = [
  { id: '__app_link', titolo: '🔗 Griglia', tipo: 'app', larghezza: 230 },
  { id: '__app_pian', titolo: '📅 In Griglia', tipo: 'app', larghezza: 160 },
  { id: '__app_avanz', titolo: '📈 Avanzamento', tipo: 'app', larghezza: 180 },
  { id: '__app_jira', titolo: '🎫 Jira', tipo: 'app', larghezza: 120 },
];
const PRG_JIRA_LBL = { new: 'Da fare', indeterminate: 'In corso', done: 'Completato' };
const PRG_JIRA_COL = { new: '#94a3b8', indeterminate: '#fdab3d', done: '#00c875' };
const PRG_RETE_TOK = new Set(['ip', 'fgn', 'acq', 'h2o', 'bianca', 'nera', 'mista']);

const _prgApp = {};              // commessa -> { stato: ''|'carica'|'ok'|'errore', mod, errore, ts, jira, promessa }
const _prgInfoCache = new Map(); // id elemento -> { k, info }

/* ---------- collegamento ---------- */
function prgLink(el) {
  const v = el && el.valori && el.valori[PRG_LINK];
  return v && typeof v === 'object' && v.cantiere ? v : null;
}
function prgLinkTesto(l) { return l ? l.cantiere + (l.attivita ? ' · ' + l.attivita : '') : ''; }
function prgColsApp(b) { return b && b.commessa ? PRG_APP_COLS : []; }
function prgColsTutte(b) { return prgColsApp(b).concat(prgCols(b)); }
function _prgTok(s) { return caNorm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean); }

/* Voci note della commessa: cantiere + attività già in Griglia o con produzione. */
function prgVociNote(commessa) {
  const s = _prgApp[commessa];
  const out = [];
  if (!s || !s.mod) return out;
  Object.values(s.mod.comuni).forEach(c => {
    const atts = Object.values(c.att || {}).filter(a => !a.servizio && a.nome !== AV_SENZA_ATT);
    if (!atts.length) out.push({ chiave: c.key + '|||', cantiere: c.nome, etichetta: '' });
    atts.forEach(a => out.push({ chiave: c.key + '|||' + a.key, cantiere: c.nome, etichetta: a.nome }));
  });
  return out;
}

/* Attività proponibili per la commessa: catalogo produttivo, altrimenti nomi usati in Griglia. */
function prgAttivitaCommessa(commessa) {
  const cat = caCatalogo(commessa).filter(a => a.produttiva !== false).map(a => a.nome);
  if (cat.length) return cat;
  return [...new Set(prgVociNote(commessa).map(v => v.etichetta).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
}

/* Comune scritto nel nome dell'elemento: senza la rete (IP/FGN/ACQ…), le parti fra parentesi e
   le parole che compaiono nei nomi delle attività di catalogo (Auto, Pedestrian…). */
function prgComuneDalNome(nome, commessa) {
  const paroleAtt = new Set();
  caCatalogo(commessa).forEach(a => [a.nome].concat(a.alias || []).forEach(n => _prgTok(n).forEach(t => paroleAtt.add(t))));
  const parole = String(nome || '').replace(/\([^)]*\)/g, ' ').split(/[\s_]+/).filter(Boolean);
  const tenute = parole.filter(p => { const t = _prgTok(p).join(''); return t && !PRG_RETE_TOK.has(t) && !paroleAtt.has(t); });
  return (tenute.length ? tenute : parole).join(' ').replace(/[-–]+$/, '').trim();
}

// Punteggio di un'attività per il nome dell'elemento: rete compatibile (obbligatoria se entrambe
// la dicono), sottotipo, parole in comune (Auto/Pedestrian…). null = incompatibile.
function _prgPunteggioAtt(etichetta, nomeEl, paroleComune) {
  const p = cpBrdRete(String(nomeEl).replace(/[()]/g, ' '));
  const r = cpBrdRete(etichetta);
  let s = 0;
  if (p.rete && r.rete) { if (p.rete !== r.rete) return null; s += 2; }
  if (r.sotto) { if (p.sotto && p.sotto !== r.sotto) return null; s += p.sotto ? 1 : -1; } else if (p.sotto) s -= 1;
  const tokAtt = new Set(_prgTok(etichetta));
  _prgTok(nomeEl).forEach(t => { if (t.length >= 3 && !paroleComune.has(t) && !PRG_RETE_TOK.has(t) && tokAtt.has(t)) s += 1; });
  return s;
}

/* Proposta di collegamento per un elemento: prima fra le voci già in Griglia (comune uguale o
   prefisso, rete compatibile), poi comune dal nome + attività di catalogo. Solo con un candidato
   migliore unico; è sempre e solo una proposta. */
function prgProponiLink(b, el) {
  const commessa = b.commessa;
  if (!commessa || !el.nome) return null;
  const comuneTesto = prgComuneDalNome(el.nome, commessa);
  const comuneK = cpBrdCompatta(comuneTesto);
  const paroleComune = new Set(_prgTok(comuneTesto));
  const cand = [];
  prgVociNote(commessa).forEach(v => {
    const cv = cpBrdCompatta(v.cantiere);
    let s;
    if (cv === comuneK) s = 3;
    else if (comuneK.length >= 4 && cv.length >= 4 && (cv.startsWith(comuneK) || comuneK.startsWith(cv))) s = 1;
    else return;
    const sa = v.etichetta ? _prgPunteggioAtt(v.etichetta, el.nome, paroleComune) : 0;
    if (sa === null) return;
    cand.push({ v, s: s + sa });
  });
  if (cand.length) {
    const max = Math.max(...cand.map(c => c.s));
    const best = cand.filter(c => c.s === max);
    if (best.length === 1) return { cantiere: best[0].v.cantiere, attivita: best[0].v.etichetta, fonte: 'griglia' };
  }
  if (!comuneTesto) return null;
  let attivita = '';
  const atts = prgAttivitaCommessa(commessa).map(n => ({ n, s: _prgPunteggioAtt(n, el.nome, paroleComune) })).filter(x => x.s !== null);
  if (atts.length) {
    const max = Math.max(...atts.map(x => x.s));
    const best = atts.filter(x => x.s === max);
    if (best.length === 1) attivita = best[0].n;
  }
  return { cantiere: comuneTesto, attivita, fonte: 'nome' };
}

/* ---------- dati della dashboard ---------- */
let _prgAppTimer = null;
function _prgAppAggiorna() {
  clearTimeout(_prgAppTimer);
  _prgAppTimer = setTimeout(() => {
    _prgInfoCache.clear();
    const scr = document.getElementById('screen-programmazione');
    if (!scr || scr.classList.contains('hidden')) return;
    prgRenderTesta();
    prgRenderTabella();
    if (_prg.drawer && _prg.drawer.tab === 'dashboard') prgRenderDrawer();
  }, 120);
}

async function prgAppCarica(commessa, forza) {
  if (!commessa || !_sbClient || !_sbUser) return null;
  const s = _prgApp[commessa] || (_prgApp[commessa] = { stato: '', mod: null });
  if (s.promessa) return s.promessa;
  if (s.stato === 'ok' && !forza) return s;
  s.stato = 'carica';
  s.errore = '';
  _prgAppAggiorna();
  s.promessa = (async () => {
    try {
      if (typeof _cpCampoProd !== 'undefined' && _cpCampoProd === null && typeof cpCampoProdLoad === 'function') await cpCampoProdLoad();
      const dati = await _avCaricaRighe(commessa, !!forza);
      s.mod = _avCalcola(commessa, dati.rows);
      s.troncato = !!dati.troncato;
      s.ts = Date.now();
      s.stato = 'ok';
      try { await jstCarica(commessa, !!forza); } catch (_) { /* senza strutture registrate si va avanti */ }
    } catch (e) {
      s.stato = 'errore';
      s.errore = e.message || String(e);
    }
    s.promessa = null;
    _prgAppAggiorna();
    if (s.stato === 'ok') prgAppJira(commessa, forza);
    return s;
  })();
  return s.promessa;
}

/* Stato dei Task Jira dei soli elementi collegati (cache della Mappa: 12 ore). */
async function prgAppJira(commessa, forza) {
  const s = _prgApp[commessa];
  if (!s || !s.mod) return;
  const chiavi = new Set();
  _prg.boards.filter(b => b.commessa === commessa).forEach(b => prgEls(b.id).forEach(el => {
    const a = _prgAttDi(s.mod, commessa, prgLink(el));
    if (a) _avTasks(a).chiavi.forEach(k => chiavi.add(k));
  }));
  const lista = [...chiavi];
  if (!lista.length || (!forza && !lista.some(k => !(k in _mlTaskBySubtask)))) return;
  s.jira = 'carica';
  _prgAppAggiorna();
  try { await (forza ? mlFetchTaskStatus(lista) : mlEnsureTaskStatus(lista)); s.jira = 'ok'; }
  catch (e) { s.jira = 'errore'; console.warn('Programmazione: stato Jira', e); }
  _prgAppAggiorna();
}

// Gruppo di Avanzamento comuni per un collegamento (comune + attività), o null.
function _prgAttDi(mod, commessa, link) {
  if (!mod || !link) return null;
  const c = mod.comuni[caNorm(link.cantiere)];
  if (!c) return null;
  const atts = Object.values(c.att || {});
  if (!link.attivita) return atts.length === 1 ? atts[0] : null;
  const voce = caTrova(commessa, link.attivita);
  return c.att[caNorm(voce ? voce.nome : link.attivita)] || null;
}

/* Tutto quello che la dashboard sa di un elemento collegato. */
function prgAppInfo(b, el) {
  const link = prgLink(el);
  if (!link || !b.commessa) return { link: null };
  const s = _prgApp[b.commessa];
  if (!s || !s.mod) return { link, carica: !s || s.stato !== 'errore', errore: s && s.errore };
  const k = s.ts + '|' + JSON.stringify(link) + '|' + (s.jira || '');
  const hit = _prgInfoCache.get(el.id);
  if (hit && hit.k === k) return hit.info;
  const c = s.mod.comuni[caNorm(link.cantiere)];
  const a = _prgAttDi(s.mod, b.commessa, link);
  let info;
  if (!a) {
    const altre = c ? Object.values(c.att || {}).map(x => x.nome).filter(n => n && n !== AV_SENZA_ATT) : [];
    info = { link, ok: true, inGriglia: false, comuneInGriglia: !!c, altre };
  } else {
    const oggi = _avOggi();
    const st = _avStats(a.voci, a.pian, null);
    const tk = _avTasks(a);
    const kpi = s.mod.kpi && a.nome !== AV_SENZA_ATT ? _avKpiTarget(a.voci, a.nome, s.mod.blocchi) : null;
    const av = kpi ? { kpi: true, pct: kpi.pct, fatto: kpi.fatto, target: kpi.target } : { kpi: false, pct: tk.pct, fatto: tk.fatto, target: tk.target };
    const passati = [...new Set(a.pian.filter(p => p.dataISO < oggi).map(p => p.dataISO))].sort();
    const futuri = [...new Set(st.futuri.map(p => p.dataISO))].sort();
    info = {
      link, ok: true, inGriglia: true, st, tk, av, unita: a.unita, nomeAtt: a.nome,
      passati, futuri, ultimoPian: passati[passati.length - 1] || '', statoJira: tk.stato,
    };
  }
  _prgInfoCache.set(el.id, { k, info });
  return info;
}

function _prgDataCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

function _prgPctHtml(av, testo) {
  const pct = av && av.pct != null ? Math.round(av.pct) : null;
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return '<div class="prg-app-bar" title="' + prgEsc(testo) + '"><div style="width:' + w + '%"></div><span>'
    + (pct == null ? prgEsc(testo) : pct + '%' + (testo ? ' · ' + prgEsc(testo) : '')) + '</span></div>';
}

/* Contenuto di una colonna virtuale: { html, testo, ord }. */
function prgAppValore(b, c, el) {
  const info = prgAppInfo(b, el);
  const vuoto = { html: '', testo: '', ord: null };
  if (c.id === '__app_link') {
    if (info.link) {
      const ic = !info.ok ? '' : info.inGriglia ? '<span class="prg-app-ok" title="In Griglia o con lavoro registrato">✓</span>' : '<span class="prg-app-no" title="Non ancora in Griglia con questa attività">○</span>';
      return { html: ic + '<span class="prg-trunc">' + prgEsc(prgLinkTesto(info.link)) + '</span>', testo: prgLinkTesto(info.link), ord: prgLinkTesto(info.link).toLowerCase() };
    }
    if (!sbCanWrite()) return vuoto;
    const p = _prgApp[b.commessa] && _prgApp[b.commessa].mod ? prgProponiLink(b, el) : null;
    return { html: '<span class="prg-app-prop" title="Proposta: clic per collegare">' + (p && p.cantiere ? '💡 ' + prgEsc(prgLinkTesto(p)) + '?' : '＋ collega') + '</span>', testo: '', ord: null };
  }
  if (!info.link) return vuoto;
  if (!info.ok) return { html: info.errore ? '<span class="text-red-500" title="' + prgEsc(info.errore) + '">⚠</span>' : '<span class="text-slate-300">…</span>', testo: '', ord: null };
  if (!info.inGriglia) return c.id === '__app_pian' ? { html: '<span class="text-slate-400">non in Griglia</span>', testo: 'non in Griglia', ord: null } : vuoto;
  if (c.id === '__app_pian') {
    if (info.futuri.length) {
      const t = 'da ' + _prgDataCorta(info.futuri[0]) + (info.futuri.length > 1 ? ' · ' + info.futuri.length + ' gg' : '');
      return { html: '<span class="prg-app-fut">' + prgEsc(t) + '</span>', testo: t, ord: 'a' + info.futuri[0] };
    }
    if (info.ultimoPian) { const t = 'ultimo ' + _prgDataCorta(info.ultimoPian); return { html: '<span class="text-slate-500">' + prgEsc(t) + '</span>', testo: t, ord: 'b' + info.ultimoPian }; }
    return vuoto;
  }
  if (c.id === '__app_avanz') {
    const st = info.st;
    if (!st.km && !st.ore && info.av.pct == null) return vuoto;
    const t = prgFmtNumero(Math.round(st.km * 100) / 100) + ' ' + (info.unita || '') + ' · ' + st.giorni.size + ' gg';
    return { html: _prgPctHtml(info.av, t), testo: (info.av.pct != null ? Math.round(info.av.pct) + '% · ' : '') + t, ord: info.av.pct != null ? info.av.pct : st.km / 1e6 };
  }
  if (c.id === '__app_jira') {
    const sj = info.statoJira;
    if (!sj) return info.tk.daLeggere.length ? { html: '<span class="text-slate-300" title="Stato in lettura">…</span>', testo: '', ord: null } : vuoto;
    const nomi = [...new Set(info.tk.lista.map(x => x.task.status).filter(Boolean))].join(', ');
    return { html: '<span class="prg-app-jira" style="background:' + PRG_JIRA_COL[sj] + '" title="' + prgEsc(nomi || PRG_JIRA_LBL[sj]) + '">' + prgEsc(PRG_JIRA_LBL[sj]) + '</span>', testo: PRG_JIRA_LBL[sj], ord: { new: 1, indeterminate: 2, done: 3 }[sj] };
  }
  return vuoto;
}

/* ---------- stato proposto ---------- */
function prgStatoProposto(b, el) {
  const gc = prgColonnaGruppoBoard(b);
  if (!gc || !b.commessa) return null;
  const info = prgAppInfo(b, el);
  if (!info.ok || !info.inGriglia) return null;
  const opz = gc.opzioni || [];
  const idx = re => opz.findIndex(o => re.test(caNorm(o.label)));
  const cur = opz.findIndex(o => o.id === (el.valori || {})[gc.id]);
  const iComp = idx(/rilievo complet/) >= 0 ? idx(/rilievo complet/) : idx(/complet/);
  const iProg = idx(/in progress|in corso|in lavorazione/);
  const iPian = idx(/^pianificaz/);
  let t = -1, motivo = '';
  if (info.statoJira === 'done' && iComp >= 0) { t = iComp; motivo = 'Task Jira chiusi'; }
  else if ((info.st.ore > 0 || info.st.km > 0) && iProg >= 0) { t = iProg; motivo = 'lavoro registrato fino al ' + _prgDataCorta(info.st.ultima); }
  else if (info.futuri.length && iPian >= 0) { t = iPian; motivo = 'in Griglia dal ' + _prgDataCorta(info.futuri[0]); }
  if (t < 0 || t <= cur) return null;     // solo in avanti
  return { col: gc, opz: opz[t], prima: cur >= 0 ? opz[cur] : null, motivo };
}

function prgStatiProposti(b) {
  if (!b || !b.commessa || !(_prgApp[b.commessa] && _prgApp[b.commessa].mod)) return [];
  return prgEls(b.id).map(el => ({ el, p: prgStatoProposto(b, el) })).filter(x => x.p);
}

/* ---------- barra della dashboard e selezione ---------- */
function prgAppBarraHtml(b) {
  if (!b || !b.commessa) {
    return b && sbCanWrite() ? '<div class="prg-app-barra text-xs text-slate-500">Collega la board a una commessa («✎ Board») per vedere Griglia, avanzamento e Jira e mandare i comuni in Auto-pianifica.</div>' : '';
  }
  const s = _prgApp[b.commessa] || {};
  const w = sbCanWrite();
  const sel = _prg.sel ? [..._prg.sel].filter(id => prgEls(b.id).some(e => e.id === id)) : [];
  const nCol = prgEls(b.id).filter(e => prgLink(e)).length;
  let stato = '';
  if (s.stato === 'carica') stato = '⏳ Leggo Griglia e produzione di ' + prgEsc(b.commessa) + '…';
  else if (s.stato === 'errore') stato = '<span class="text-red-600">⚠ ' + prgEsc(s.errore) + '</span>';
  else if (s.stato === 'ok') stato = 'Dati dashboard delle ' + new Date(s.ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    + (s.jira === 'carica' ? ' · ⏳ stato Jira…' : '') + (s.troncato ? ' · <span class="text-amber-600">produzione troncata</span>' : '');
  const proposti = w && s.stato === 'ok' ? prgStatiProposti(b).length : 0;
  let h = '<div class="prg-app-barra">'
    + '<span class="text-xs text-slate-500">' + nCol + '/' + prgEls(b.id).length + ' collegati alla Griglia · ' + stato + '</span>'
    + '<button class="prg-btn prg-btn-mini" data-prg-azione="app-ricarica" data-help-key="prg-app-ricarica" title="Rilegge Griglia, produzione e stato Jira">↻</button>';
  if (w) {
    h += '<span class="prg-app-sep"></span>';
    if (sel.length) {
      h += '<b class="text-xs text-slate-700">' + sel.length + ' selezionat' + (sel.length === 1 ? 'o' : 'i') + '</b>'
        + '<button class="prg-btn" data-prg-azione="collega" data-help-key="prg-collega">🔗 Collega alla Griglia</button>'
        + '<button class="prg-btn" data-prg-azione="autoplan" data-help-key="prg-autoplan">➕ Auto-pianifica</button>'
        + '<button class="prg-btn" data-prg-azione="struttura" data-help-key="prg-struttura">🏗️ Struttura Jira</button>'
        + '<button class="prg-btn" data-prg-azione="desel" title="Togli la selezione">✕</button>';
    } else {
      h += '<button class="prg-btn" data-prg-azione="collega" data-help-key="prg-collega" title="Propone il collegamento per gli elementi non ancora collegati">🔗 Collega alla Griglia</button>'
        + '<span class="text-xs text-slate-400">Spunta gli elementi per mandarli in Auto-pianifica o creare la struttura Jira</span>';
    }
    if (proposti) h += '<button class="prg-btn prg-btn-prop" data-prg-azione="stati" data-help-key="prg-stati">💡 Stati da aggiornare (' + proposti + ')</button>';
  }
  return h + '</div>';
}

function prgSelezionati(b) {
  const ids = _prg.sel ? [..._prg.sel] : [];
  return prgEls(b.id).filter(e => ids.includes(e.id));
}

/* ---------- finestra: collega alla Griglia ---------- */
function prgCollegaApri(soloIds) {
  const b = prgBoard();
  if (!b || !b.commessa || !sbGuardWrite()) return;
  const s = _prgApp[b.commessa];
  if (!s || !s.mod) { showAlertModal('Sto ancora leggendo i dati della dashboard: riprova fra qualche secondo.'); return; }
  const els = soloIds && soloIds.length ? prgEls(b.id).filter(e => soloIds.includes(e.id)) : prgEls(b.id).filter(e => !prgLink(e));
  if (!els.length) { showAlertModal('Tutti gli elementi della board sono già collegati. Per cambiarne uno aprilo e usa la scheda «🔗 Dashboard».'); return; }
  const cantieri = [...new Set(prgVociNote(b.commessa).map(v => v.cantiere))].sort((x, y) => x.localeCompare(y, 'it'));
  const attivita = prgAttivitaCommessa(b.commessa);
  const righe = els.map(el => {
    const l = prgLink(el);
    const p = l ? { cantiere: l.cantiere, attivita: l.attivita, fonte: 'collegato' } : (prgProponiLink(b, el) || { cantiere: '', attivita: '', fonte: '' });
    return { el, p };
  });
  const fonteHtml = f => f === 'griglia' ? '<span class="prg-badge" style="background:#ecfdf5;color:#047857">in Griglia</span>'
    : f === 'nome' ? '<span class="prg-badge" title="Comune ricavato dal nome: non ancora in Griglia">dal nome</span>'
      : f === 'collegato' ? '<span class="prg-badge">già collegato</span>' : '';
  const corpo = '<p class="text-xs text-slate-500 mb-2">Proposte ricavate dal nome dell\'elemento: <b>in Griglia</b> = cantiere e attività già pianificati o con produzione; <b>dal nome</b> = comune non ancora in Griglia (va bene per mandarlo in Auto-pianifica). Correggi quello che serve: si collegano solo le righe spuntate.</p>'
    + '<datalist id="prg-dl-cantieri">' + cantieri.map(c => '<option value="' + prgEsc(c) + '">').join('') + '</datalist>'
    + '<table class="prg-imp-tab"><thead><tr><th><input type="checkbox" id="prg-col-tutti" checked></th><th>Elemento</th><th>Cantiere (comune)</th><th>Attività</th><th></th></tr></thead><tbody>'
    + righe.map((r, i) => '<tr data-i="' + i + '"><td><input type="checkbox" class="prg-col-sel"' + (r.p.cantiere ? ' checked' : '') + '></td>'
      + '<td>' + prgEsc(r.el.nome) + '</td>'
      + '<td><input class="prg-f-inp prg-col-cant" list="prg-dl-cantieri" value="' + prgEsc(r.p.cantiere) + '" style="width:200px"></td>'
      + '<td><select class="prg-f-inp prg-col-att" style="width:220px"><option value="">— nessuna —</option>'
      + attivita.concat(r.p.attivita && !attivita.includes(r.p.attivita) ? [r.p.attivita] : []).map(a => '<option' + (a === r.p.attivita ? ' selected' : '') + '>' + prgEsc(a) + '</option>').join('')
      + '</select></td><td>' + fonteHtml(r.p.fonte) + '</td></tr>').join('')
    + '</tbody></table>';
  const m = prgModalApri('🔗 Collega alla Griglia · ' + b.nome, corpo,
    '<span id="prg-col-n" class="text-xs text-slate-500 mr-auto"></span><button class="prg-btn" data-prg-m="chiudi2">Annulla</button><button class="prg-btn prg-btn-pri" id="prg-col-ok" data-help-key="prg-collega-ok">Collega</button>', true);
  const conta = () => { const n = m.querySelectorAll('.prg-col-sel:checked').length; m.querySelector('#prg-col-n').textContent = n + ' da collegare'; };
  conta();
  m.querySelector('[data-prg-m="chiudi2"]').onclick = prgModalChiudi;
  m.onchange = e => {
    if (e.target.id === 'prg-col-tutti') m.querySelectorAll('.prg-col-sel').forEach(cb => { cb.checked = e.target.checked; });
    else if (e.target.classList.contains('prg-col-cant') || e.target.classList.contains('prg-col-att')) {
      const tr = e.target.closest('tr'); const cb = tr && tr.querySelector('.prg-col-sel'); if (cb && tr.querySelector('.prg-col-cant').value.trim()) cb.checked = true;
    }
    conta();
  };
  m.querySelector('#prg-col-ok').onclick = async () => {
    const modifiche = new Map();
    m.querySelectorAll('tbody tr[data-i]').forEach(tr => {
      if (!tr.querySelector('.prg-col-sel').checked) return;
      const cantiere = tr.querySelector('.prg-col-cant').value.replace(/\s+/g, ' ').trim();
      if (!cantiere) return;
      const r = righe[Number(tr.dataset.i)];
      const att = tr.querySelector('.prg-col-att').value;
      const nuovo = { cantiere, attivita: att || '' };
      if (JSON.stringify(prgLink(r.el)) === JSON.stringify(nuovo)) return;
      modifiche.set(r.el, { [PRG_LINK]: nuovo });
    });
    if (!modifiche.size) { prgModalChiudi(); return; }
    const bt = m.querySelector('#prg-col-ok'); bt.disabled = true; bt.textContent = 'Salvo…';
    const errori = await prgApplicaValori(modifiche);
    prgModalChiudi();
    _prgAppAggiorna();
    prgAppJira(b.commessa);
    showAlertModal((modifiche.size - errori) + ' elementi collegati alla Griglia' + (errori ? '; ' + errori + ' non salvati (permessi o rete).' : '.'));
  };
}

/* ---------- finestra: manda in Auto-pianifica ---------- */
// Colonne della board che servono ad Auto-pianifica: km (numero col titolo «km»), scadenza, priorità.
function _prgColonneAp(b) {
  const cols = prgCols(b);
  return {
    km: cols.filter(c => c.tipo === 'numero' && /km/i.test(c.titolo)),
    scad: cols.find(c => (c.tipo === 'data' || c.tipo === 'data_ora') && /scadenz/i.test(c.titolo)) || null,
    prio: cols.find(c => c.tipo === 'stato' && /priorit/i.test(c.titolo)) || null,
  };
}

function prgAutoplanApri(ids) {
  const b = prgBoard();
  if (!b || !b.commessa || !sbGuardWrite()) return;
  if (typeof apAccodaRighe !== 'function') return;
  const els = prgEls(b.id).filter(e => ids.includes(e.id));
  if (!els.length) return;
  const cAp = _prgColonneAp(b);
  const oggi = isoWeekYear(new Date());
  const settimane = [0, 1, 2, 3].map(d => pwWeekAdd(oggi.year, oggi.week, d));
  const attivita = prgAttivitaCommessa(b.commessa);
  const righe = els.map(el => {
    const l = prgLink(el) || prgProponiLink(b, el) || { cantiere: '', attivita: '' };
    let prio = 3;
    if (cAp.prio) { const o = (cAp.prio.opzioni || []).find(x => x.id === (el.valori || {})[cAp.prio.id]); if (o) prio = _apPriorita(o.label); }
    const sc = cAp.scad ? String((el.valori || {})[cAp.scad.id] || '').slice(0, 10) : '';
    return { el, cantiere: l.cantiere, attivita: l.attivita || '', collegato: !!prgLink(el), prio, scadenza: sc };
  });
  const kmDi = (el, colId) => { const v = colId ? (el.valori || {})[colId] : null; return typeof v === 'number' ? v : ''; };
  const corpo = '<div class="flex flex-wrap gap-4 items-end mb-3">'
    + '<label class="prg-f-lab" style="margin:0">Settimana<select id="prg-ap-week" class="prg-f-inp">' + settimane.map((s, i) =>
      '<option value="' + s.anno + '|' + s.week + '"' + (i === 1 ? ' selected' : '') + '>W' + s.week + ' ' + s.anno + (i === 0 ? ' (questa)' : i === 1 ? ' (prossima)' : '') + '</option>').join('') + '</select></label>'
    + '<label class="prg-f-lab" style="margin:0">Km da rilevare dalla colonna<select id="prg-ap-km" class="prg-f-inp"><option value="">— nessuna (stima dallo storico) —</option>'
    + cAp.km.map((c, i) => '<option value="' + prgEsc(c.id) + '"' + (i === 0 ? ' selected' : '') + '>' + prgEsc(c.titolo) + '</option>').join('') + '</select></label>'
    + '<label class="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" id="prg-ap-link" checked> collega anche gli elementi non ancora collegati</label>'
    + '</div>'
    + '<datalist id="prg-dl-cantieri2">' + [...new Set(prgVociNote(b.commessa).map(v => v.cantiere))].map(c => '<option value="' + prgEsc(c) + '">').join('') + '</datalist>'
    + '<table class="prg-imp-tab"><thead><tr><th>Elemento</th><th>Cantiere</th><th>Attività</th><th>Km</th><th>Priorità</th><th>Scadenza</th></tr></thead><tbody>'
    + righe.map((r, i) => '<tr data-i="' + i + '"><td>' + prgEsc(r.el.nome) + (r.collegato ? '' : ' <span class="prg-badge" title="Proposta dal nome: non ancora collegato">proposta</span>') + '</td>'
      + '<td><input class="prg-f-inp prg-ap-cant" list="prg-dl-cantieri2" value="' + prgEsc(r.cantiere) + '" style="width:170px"></td>'
      + '<td><select class="prg-f-inp prg-ap-att" style="width:190px"><option value="">—</option>' + attivita.concat(r.attivita && !attivita.includes(r.attivita) ? [r.attivita] : []).map(a =>
        '<option' + (a === r.attivita ? ' selected' : '') + '>' + prgEsc(a) + '</option>').join('') + '</select></td>'
      + '<td><input class="prg-f-inp prg-ap-km" inputmode="decimal" style="width:70px" value="' + prgEsc(String(kmDi(r.el, cAp.km[0] && cAp.km[0].id)).replace('.', ',')) + '"></td>'
      + '<td><select class="prg-f-inp prg-ap-prio">' + [1, 2, 3].map(p => '<option value="' + p + '"' + (p === r.prio ? ' selected' : '') + '>P' + p + '</option>').join('') + '</select></td>'
      + '<td><input type="date" class="prg-f-inp prg-ap-scad" value="' + prgEsc(r.scadenza) + '"></td></tr>').join('')
    + '</tbody></table>'
    + '<p class="text-xs text-slate-500 mt-3">Le righe vanno nella lista di Auto-pianifica di quella settimana (in questo browser), poi si apre Auto-pianifica: la Griglia cambia solo quando calcoli la bozza e la applichi. Giorni e squadre li stima Auto-pianifica, li puoi correggere lì.</p>';
  const m = prgModalApri('➕ Manda in Auto-pianifica · ' + els.length + ' element' + (els.length === 1 ? 'o' : 'i'), corpo,
    '<button class="prg-btn" data-prg-m="chiudi2">Annulla</button><button class="prg-btn prg-btn-pri" id="prg-ap-ok" data-help-key="prg-autoplan-ok">Manda in Auto-pianifica</button>', true);
  m.querySelector('[data-prg-m="chiudi2"]').onclick = prgModalChiudi;
  m.querySelector('#prg-ap-km').onchange = e => m.querySelectorAll('tbody tr[data-i]').forEach(tr => {
    const v = kmDi(righe[Number(tr.dataset.i)].el, e.target.value);
    tr.querySelector('.prg-ap-km').value = String(v).replace('.', ',');
  });
  m.querySelector('#prg-ap-ok').onclick = async () => {
    const [anno, week] = m.querySelector('#prg-ap-week').value.split('|').map(Number);
    const oggetti = [], daCollegare = new Map(), senza = [];
    m.querySelectorAll('tbody tr[data-i]').forEach(tr => {
      const r = righe[Number(tr.dataset.i)];
      const cantiere = tr.querySelector('.prg-ap-cant').value.replace(/\s+/g, ' ').trim();
      if (!cantiere) { senza.push(r.el.nome); return; }
      const att = tr.querySelector('.prg-ap-att').value;
      const km = prgParseNumero(tr.querySelector('.prg-ap-km').value);
      oggetti.push({ cantiere, commessa: b.commessa, attivita: att, km: typeof km === 'number' ? km : null,
        priorita: Number(tr.querySelector('.prg-ap-prio').value), scadenza: tr.querySelector('.prg-ap-scad').value, note: 'Programmazione: ' + r.el.nome });
      const nuovo = { cantiere, attivita: att || '' };
      if (JSON.stringify(prgLink(r.el)) !== JSON.stringify(nuovo) && (r.collegato || m.querySelector('#prg-ap-link').checked)) daCollegare.set(r.el, { [PRG_LINK]: nuovo });
    });
    if (!oggetti.length) { showAlertModal('Nessuna riga con il cantiere: scrivilo per gli elementi da mandare.'); return; }
    let esito;
    try { esito = apAccodaRighe(anno, week, oggetti, 'Programmazione'); }
    catch (e) { showAlertModal('Righe non aggiunte: ' + (e.message || String(e))); return; }
    if (daCollegare.size) await prgApplicaValori(daCollegare);
    prgModalChiudi();
    _prg.sel = new Set();
    pwAnno = anno; pwWeek = week;
    _pwActiveTab = 'autoplan';
    switchScreen('weekly');
    setTimeout(() => showAlertModal('Auto-pianifica W' + week + ': ' + esito.nuove.length + ' righe aggiunte'
      + (esito.gia.length ? ', ' + esito.gia.length + ' già in lista' : '') + (senza.length ? ', ' + senza.length + ' senza cantiere saltate' : '')
      + '. Controlla giorni e squadre, poi «Calcola bozza».'), 400);
  };
}

/* ---------- struttura Jira dei comuni ---------- */
function prgStrutturaApri(ids) {
  const b = prgBoard();
  if (!b || !b.commessa || !sbGuardWrite()) return;
  const modello = jstModelloDi((state.commesse_attive_meta || {})[b.commessa]);
  if (!modello) { showAlertModal('La commessa ' + b.commessa + ' non ha un modello della struttura Jira (Dashboard → Commesse attive → Modifica commessa → «🧩 Modello»).'); return; }
  const comuni = [];
  prgEls(b.id).filter(e => ids.includes(e.id)).forEach(el => {
    const l = prgLink(el) || prgProponiLink(b, el);
    if (l && l.cantiere && !comuni.some(c => caNorm(c) === caNorm(l.cantiere))) comuni.push(l.cantiere);
  });
  if (!comuni.length) { showAlertModal('Nessun comune: collega prima gli elementi alla Griglia.'); return; }
  jstOpenCreaModal(b.commessa, modello, comuni);
}

/* ---------- finestra: stati da aggiornare ---------- */
function prgStatiApri() {
  const b = prgBoard();
  if (!b || !sbGuardWrite()) return;
  const lista = prgStatiProposti(b);
  if (!lista.length) { showAlertModal('Nessuno stato da aggiornare: la board è allineata con Griglia e Jira.'); return; }
  const corpo = '<p class="text-xs text-slate-500 mb-2">Stati che Griglia, produzione e Jira suggeriscono di portare avanti. Si cambiano solo quelli spuntati; ogni cambio resta nello storico dell\'elemento.</p>'
    + '<table class="prg-imp-tab"><thead><tr><th><input type="checkbox" id="prg-st-tutti" checked></th><th>Elemento</th><th>Ora</th><th></th><th>Proposto</th><th>Perché</th></tr></thead><tbody>'
    + lista.map((x, i) => '<tr data-i="' + i + '"><td><input type="checkbox" class="prg-st-sel" checked></td><td>' + prgEsc(x.el.nome) + '</td>'
      + '<td>' + (x.p.prima ? prgEtichettaHtml(x.p.prima, ' prg-lbl-mini') : '<span class="text-slate-400">vuoto</span>') + '</td><td>→</td>'
      + '<td>' + prgEtichettaHtml(x.p.opz, ' prg-lbl-mini') + '</td><td class="text-xs text-slate-500">' + prgEsc(x.p.motivo) + '</td></tr>').join('')
    + '</tbody></table>';
  const m = prgModalApri('💡 Stati da aggiornare · ' + b.nome, corpo,
    '<button class="prg-btn" data-prg-m="chiudi2">Annulla</button><button class="prg-btn prg-btn-pri" id="prg-st-ok" data-help-key="prg-stati-ok">Aggiorna gli stati spuntati</button>', true);
  m.querySelector('[data-prg-m="chiudi2"]').onclick = prgModalChiudi;
  m.querySelector('#prg-st-tutti').onchange = e => m.querySelectorAll('.prg-st-sel').forEach(cb => { cb.checked = e.target.checked; });
  m.querySelector('#prg-st-ok').onclick = async () => {
    const modifiche = new Map();
    m.querySelectorAll('tbody tr[data-i]').forEach(tr => {
      if (!tr.querySelector('.prg-st-sel').checked) return;
      const x = lista[Number(tr.dataset.i)];
      modifiche.set(x.el, { [x.p.col.id]: x.p.opz.id });
    });
    if (!modifiche.size) { prgModalChiudi(); return; }
    const bt = m.querySelector('#prg-st-ok'); bt.disabled = true; bt.textContent = 'Aggiorno…';
    const errori = await prgApplicaValori(modifiche);
    prgModalChiudi();
    _prgAppAggiorna();
    if (errori) showAlertModal(errori + ' stati non aggiornati (permessi o rete).');
  };
}

/* ---------- scheda «🔗 Dashboard» del pannello ---------- */
function prgDrawerDashboardHtml(b, el, w) {
  if (!b.commessa) return '<div class="text-sm text-slate-500 py-4">La board non è collegata a una commessa: impostala da «✎ Board» per vedere Griglia, avanzamento e Jira.</div>';
  const s = _prgApp[b.commessa] || {};
  const link = prgLink(el);
  const prop = !link && s.mod ? prgProponiLink(b, el) : null;
  const val = link || prop || { cantiere: '', attivita: '' };
  const attivita = prgAttivitaCommessa(b.commessa);
  const cantieri = [...new Set(prgVociNote(b.commessa).map(v => v.cantiere))].sort((x, y) => x.localeCompare(y, 'it'));
  let h = '<div class="prg-app-sez"><div class="prg-app-tit">🔗 Collegamento alla Griglia</div>';
  if (w) {
    h += '<datalist id="prg-dl-cantieri3">' + cantieri.map(c => '<option value="' + prgEsc(c) + '">').join('') + '</datalist>'
      + '<div class="flex flex-wrap gap-2 items-center"><input id="prg-lk-cant" class="prg-dr-inp" style="width:190px" list="prg-dl-cantieri3" placeholder="Cantiere (comune)" value="' + prgEsc(val.cantiere) + '">'
      + '<select id="prg-lk-att" class="prg-dr-inp" style="width:auto;min-width:180px"><option value="">— attività —</option>'
      + attivita.concat(val.attivita && !attivita.includes(val.attivita) ? [val.attivita] : []).map(a => '<option' + (a === val.attivita ? ' selected' : '') + '>' + prgEsc(a) + '</option>').join('') + '</select>'
      + '<button class="prg-btn prg-btn-pri" data-prg-d="lk-salva" data-help-key="prg-link-salva">' + (link ? 'Salva' : 'Collega') + '</button>'
      + (link ? '<button class="prg-btn" data-prg-d="lk-togli" data-help-key="prg-link-togli">Scollega</button>' : '') + '</div>'
      + (prop ? '<div class="text-xs text-amber-700 mt-1">💡 Proposta ricavata dal nome' + (prop.fonte === 'griglia' ? ' (già in Griglia)' : ' (comune non ancora in Griglia)') + ': controlla e premi «Collega».</div>' : '');
  } else h += '<div class="text-sm">' + (link ? prgEsc(prgLinkTesto(link)) : '<span class="text-slate-400">Non collegato</span>') + '</div>';
  h += '</div>';
  if (!link) return h;
  const info = prgAppInfo(b, el);
  if (!info.ok) return h + '<div class="text-sm text-slate-400 py-3">' + (info.errore ? '⚠ ' + prgEsc(info.errore) : 'Leggo i dati della dashboard…') + '</div>';
  if (!info.inGriglia) {
    h += '<div class="prg-app-sez text-sm text-slate-500">' + (info.comuneInGriglia
      ? prgEsc(link.cantiere) + ' è in Griglia, ma non con questa attività' + (info.altre.length ? ' (c\'è: ' + prgEsc(info.altre.join(', ')) + ')' : '') + '.'
      : prgEsc(link.cantiere) + ' non è ancora in Griglia e non ha produzione registrata.') + '</div>';
  } else {
    const st = info.st;
    const opsFut = {};
    st.futuri.forEach(p => { (opsFut[p.dataISO] = opsFut[p.dataISO] || new Set()).add(p.operatore); });
    h += '<div class="prg-app-sez"><div class="prg-app-tit">📅 Griglia</div>'
      + (info.futuri.length ? '<div class="text-sm mb-1">Prossimi giorni pianificati:</div>' + info.futuri.slice(0, 12).map(d =>
        '<div class="text-xs"><b>' + prgEsc(_prgDataCorta(d)) + '</b> · ' + prgEsc([...opsFut[d]].join(', ')) + '</div>').join('')
        + (info.futuri.length > 12 ? '<div class="text-xs text-slate-400">… altri ' + (info.futuri.length - 12) + ' giorni</div>' : '')
        : '<div class="text-sm text-slate-500">Nessun giorno pianificato da oggi in poi.</div>')
      + (info.passati.length ? '<div class="text-xs text-slate-500 mt-1">' + info.passati.length + ' giorni pianificati in passato, l\'ultimo ' + prgEsc(_prgDataCorta(info.ultimoPian)) + '</div>' : '')
      + '</div>';
    h += '<div class="prg-app-sez"><div class="prg-app-tit">📈 Avanzamento</div>'
      + (info.av.pct != null ? _prgPctHtml(info.av, prgFmtNumero(Math.round(info.av.fatto * 100) / 100) + ' su ' + prgFmtNumero(Math.round(info.av.target * 100) / 100) + (info.av.kpi ? ' (KPI target delle giornate)' : ' (Target Production)')) : '')
      + '<div class="text-sm mt-1">Produzione <b>' + prgEsc(prgFmtNumero(Math.round(st.km * 1000) / 1000)) + ' ' + prgEsc(info.unita || '') + '</b> · ore Jira <b>' + prgEsc(prgFmtNumero(Math.round(st.ore * 10) / 10)) + '</b> · ' + st.giorni.size + ' giorni lavorati</div>'
      + (st.ultima ? '<div class="text-xs text-slate-500">Dal ' + prgEsc(_prgDataCorta(st.prima)) + ' al ' + prgEsc(_prgDataCorta(st.ultima)) + ' · ' + prgEsc([...st.operatori].join(', ')) + '</div>' : '')
      + (st.kmDaVer ? '<div class="text-xs text-amber-700">' + prgEsc(prgFmtNumero(Math.round(st.kmDaVer * 100) / 100)) + ' ' + prgEsc(info.unita || '') + ' ancora da verificare (presi da Jira)</div>' : '')
      + '</div>';
    h += '<div class="prg-app-sez"><div class="prg-app-tit">🎫 Jira</div>'
      + (info.tk.lista.length ? info.tk.lista.map(x => '<div class="text-xs"><a href="' + prgEsc(x.task.url || '') + '" target="_blank" rel="noopener" class="text-teal-700 hover:underline">' + prgEsc(x.task.key) + '</a> '
        + prgEsc(x.task.summary || '') + ' · <b>' + prgEsc(x.task.status || PRG_JIRA_LBL[x.task.statusCategory] || '') + '</b>'
        + (Number(x.task.targetProduction) > 0 ? ' · target ' + prgEsc(prgFmtNumero(Number(x.task.targetProduction))) : '') + '</div>').join('')
        : '<div class="text-sm text-slate-500">' + (info.tk.daLeggere.length ? 'Leggo lo stato dei Task…' : 'Nessun sottotask Jira per questa voce.') + '</div>')
      + '</div>';
  }
  const strutt = typeof jstStrutturaDi === 'function' ? jstStrutturaDi(b.commessa, link.cantiere) : null;
  const modello = jstModelloDi((state.commesse_attive_meta || {})[b.commessa]);
  if (strutt || modello) {
    h += '<div class="prg-app-sez"><div class="prg-app-tit">🏗️ Struttura Jira del comune</div>'
      + (strutt ? '<div class="text-sm">Registrata: <a class="text-teal-700 hover:underline" target="_blank" rel="noopener" href="' + prgEsc(_jstUrl(strutt.radice_key, modello)) + '">' + prgEsc(strutt.radice_key) + '</a></div>'
        : '<div class="text-sm text-slate-500">Nessuna struttura registrata per ' + prgEsc(link.cantiere) + '.</div>')
      + '</div>';
  }
  if (w) {
    const p = prgStatoProposto(b, el);
    h += '<div class="prg-app-sez flex flex-wrap gap-2">'
      + '<button class="prg-btn" data-prg-d="ap" data-help-key="prg-autoplan">➕ Manda in Auto-pianifica</button>'
      + (modello && !strutt ? '<button class="prg-btn" data-prg-d="jst" data-help-key="prg-struttura">🏗️ Crea struttura Jira</button>' : '')
      + '</div>'
      + (p ? '<div class="prg-app-sez prg-app-prop-box">💡 Stato proposto: ' + prgEtichettaHtml(p.opz, ' prg-lbl-mini') + ' <span class="text-xs text-slate-500">(' + prgEsc(p.motivo) + ')</span> '
        + '<button class="prg-btn prg-btn-pri" data-prg-d="stato-prop" data-help-key="prg-stato-prop">Applica</button></div>' : '');
  }
  return h;
}

async function prgDrawerDashboardClick(az, el) {
  const b = _prg.boards.find(x => x.id === el.board_id);
  if (!b) return;
  if (az === 'lk-salva') {
    const cantiere = (document.getElementById('prg-lk-cant').value || '').replace(/\s+/g, ' ').trim();
    if (!cantiere) { showAlertModal('Scrivi il cantiere (comune) come compare in Griglia.'); return; }
    const ok = await prgSalvaValore(el, PRG_LINK, { cantiere, attivita: document.getElementById('prg-lk-att').value || '' });
    if (ok) { _prgInfoCache.delete(el.id); prgAppJira(b.commessa); prgRenderDrawer(); }
  } else if (az === 'lk-togli') {
    if (!(await showConfirmAsync('Scollegare «' + el.nome + '» dalla Griglia? Su Griglia e Jira non cambia nulla.', 'Scollega'))) return;
    if (await prgSalvaValore(el, PRG_LINK, null)) prgRenderDrawer();
  } else if (az === 'ap') {
    if (_prg.boardId !== b.id) await prgScegliBoard(b.id);
    prgAutoplanApri([el.id]);
  } else if (az === 'jst') {
    prgStrutturaApri([el.id]);
  } else if (az === 'stato-prop') {
    const p = prgStatoProposto(b, el);
    if (p && await prgSalvaValore(el, p.col.id, p.opz.id)) prgRenderDrawer();
  }
}

/* ---------- guida col click destro ---------- */
HELP_TEXTS['prg-app-ricarica'] = 'Rilegge dalla dashboard i dati degli elementi collegati: giorni in Griglia, ore e produzione di Controllo Produzione, stato dei Task Jira e strutture Jira registrate.\n\nNon scrive nulla.';
HELP_TEXTS['prg-collega'] = 'Collega gli elementi a una voce della Griglia: cantiere (il comune come è scritto in Griglia) e attività del catalogo della commessa. Propone il collegamento dal nome dell\'elemento («Gubbio FGN (BIANCA)» → Gubbio · Fognatura Bianca), ma lo salva solo per le righe che confermi.\n\nScrive nella Programmazione condivisa (resta nello storico di ogni elemento); Griglia e Jira non cambiano.';
HELP_TEXTS['prg-collega-ok'] = 'Salva il collegamento per le righe spuntate, per tutti i colleghi. Si cambia o si toglie dal pannello dell\'elemento, scheda «🔗 Dashboard».';
HELP_TEXTS['prg-autoplan'] = 'Manda i comuni in Auto-pianifica: aggiunge una riga per elemento (cantiere, attività, km, priorità, scadenza presi dalla board) alla lista di Auto-pianifica della settimana scelta, poi apre Auto-pianifica.\n\nLa lista è di questo browser. La Griglia cambia solo quando in Auto-pianifica calcoli la bozza e la applichi.';
HELP_TEXTS['prg-autoplan-ok'] = 'Aggiunge le righe alla lista di Auto-pianifica della settimana scelta (quelle già in lista non si duplicano) e apre Auto-pianifica. Con la spunta, salva anche il collegamento alla Griglia degli elementi che non l\'avevano.';
HELP_TEXTS['prg-struttura'] = 'Apre la creazione delle strutture Jira (Iniziativa, Epic, Task dal modello della commessa) con i comuni degli elementi già scritti. Prima mostra sempre l\'anteprima; SCRIVE SU JIRA solo con «Crea».';
HELP_TEXTS['prg-stati'] = 'Elenca gli elementi il cui stato si può portare avanti in base a quello che la dashboard sa: in Griglia da oggi in poi → Pianificazione, lavoro registrato → In progress, Task Jira chiusi → Rilievo completato. Mai indietro, mai da solo: si cambia solo quello che confermi.';
HELP_TEXTS['prg-stati-ok'] = 'Cambia lo stato degli elementi spuntati, per tutti i colleghi. Ogni cambio resta nello storico dell\'elemento e si può ripristinare.';
HELP_TEXTS['prg-stato-prop'] = 'Porta lo stato dell\'elemento a quello proposto. Resta nello storico e si può ripristinare.';
HELP_TEXTS['prg-link-salva'] = 'Salva il collegamento dell\'elemento alla voce della Griglia (cantiere + attività), per tutti i colleghi. Griglia e Jira non cambiano.';
HELP_TEXTS['prg-link-togli'] = 'Toglie il collegamento alla Griglia. Su Griglia e Jira non cambia nulla; resta nello storico dell\'elemento.';
HELP_TEXTS['prg-sel'] = 'Seleziona l\'elemento per le azioni in blocco: collegare alla Griglia, mandare in Auto-pianifica, creare la struttura Jira. Solo in questo browser.';
