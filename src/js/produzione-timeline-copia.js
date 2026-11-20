/* ==================== CONTROLLO PRODUZIONE · TIMELINE: COPIA E INCOLLA WORKLOG ====================
   «⧉» e «📋» sulle righe della "🕘 Timeline worklog" (v18.299.0), per admin e responsabili.
   Caso tipico: l'operatore lavora giovedì ma attiva il sottotask di un altro giorno (di solito
   venerdì): i worklog creati dall'automazione Jira hanno gli orari giusti ma stanno sul sottotask
   sbagliato. Si copiano e si incollano su quello giusto, eliminando gli originali.
   - «⧉» sulla riga operatore/giorno copia negli appunti tutti i worklog con id di quel giorno
     (dall'editor di un worklog: solo quelli di quel sottotask). Gli appunti stanno in memoria.
   - «📋» su una riga (anche la stessa) apre #cptl-cp-modal: operatore e giorno della riga sono la
     destinazione, gli orari restano. All'apertura rilegge da Jira (azione "giornata" di
     jira-worklog-edit) i sottotask di origine: worklog freschi (commento intero, "atteso") e
     stato. Il sottotask di destinazione è proposto dalla Griglia: il sottotask di origine →
     cantiere + attività (_cpaIndiceSottotask) → il sottotask Griglia dell'operatore di
     destinazione quel giorno con lo stesso cantiere e attività (poi solo cantiere, poi l'unico
     del giorno). Mai per titolo del ticket. Si può scrivere a mano.
   - «Sposta» (spuntato se l'operatore è lo stesso): dopo l'aggiunta elimina gli originali. Prima
     le aggiunte e poi le eliminazioni, così un'aggiunta fallita non perde ore (l'originale
     resta); solo se la giornata supererebbe le 12 h di Tempo si elimina prima.
   - Stato: se l'origine è IN PENDING/DONE e la destinazione è indietro propone di portarla allo
     stesso stato (solo in avanti, azione "stato", prima dei worklog come «⧉ Copia worklog»; per
     DONE scrive la produzione minima con cpProduzioneMinima). Lo stato dell'origine non torna
     indietro: un DONE non si riapre da qui.
   - Scrive SOLO con jira-worklog-edit (stato/create/delete) dopo una conferma. Dopo rilegge gli
     operatori nella Timeline e lo stato della colonna Stato; non aggiorna controllo_produzione
     («Ore Jira» con «🔄 Sincronizza da Jira»). I dipendenti fornitore sono esclusi: i loro
     worklog li gestisce «🏢 Worklog fornitori».
   Nascosta con la stessa chiave dell'editor («🧩 Funzioni», controllo:timeline-modifica).
   Modal #cptl-cp-modal (z-index 99995: sopra la timeline, sotto conferme e avvisi). */

const CPTLCP_MAX_GIORNO_MIN = 12 * 60;   // Tempo rifiuta oltre 12 h al giorno per autore

let _cpTlCp = {
  appunti: null,       // { nome, g, iso, label, k, voci: [{ key, summary, url, id, inizio, fine }] }
  aperto: false,
  nome: '', g: 0, iso: '', label: '', k: '', d: null,   // destinazione: la riga su cui si incolla
  caricando: false, caricaT0: 0, errore: '', avvisi: [],
  info: {},            // chiave -> risposta "giornata" { stato, assegnatario, worklogs } | { errore } | { caricando }
  righe: [],           // vedi _cpTlCpCostruisci
  sposta: true,
  statoNo: {},         // chiave destinazione -> true se l'utente non vuole il cambio di stato
  salvando: false,
  passi: null,         // durante «Incolla su Jira»: [{ testo, esito: ''|'ok'|'ko'|'warn', nota, t0 }]
};

function _cpTlCpNorm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function _cpTlCpFornitore(nome) { return typeof fornitoreDiNome === 'function' && !!fornitoreDiNome(nome); }

/* Worklog copiabili di una riga della timeline (con id Jira; mai il segmento "in corso") */
function _cpTlCpCopiabili(x, key) {
  return (x ? x.interventi : []).filter(iv => !iv.inCorso && iv.w && iv.w.id != null && (!key || iv.t.key === key));
}

/* Bottoni «⧉» / «📋» della riga (dentro .cptl-azioni accanto a «＋») */
function cpTlCpBottoni(x, V) {
  if (!cpTlWlPuo() || _cpTlCpFornitore(x.nome)) return [];
  const out = [];
  const n = _cpTlCpCopiabili(x).length;
  if (n) {
    out.push('<button type="button" class="cptl-add" data-op="' + esc(x.nome) + '" data-g="' + x.g + '" onclick="cpTlCpCopia(this)" title="Copia negli appunti i ' +
      n + ' worklog Jira di ' + esc(x.nome) + ' (' + esc(x.label) + '), per incollarli su un altro sottotask (click destro per la guida)">⧉</button>');
  }
  const A = _cpTlCp.appunti;
  if (A && x.iso <= V.oggi) {
    out.push('<button type="button" class="cptl-add incolla" data-op="' + esc(x.nome) + '" data-g="' + x.g + '" onclick="cpTlCpIncolla(this)" title="Incolla qui i worklog copiati (' +
      esc(A.nome) + ', ' + esc(A.label) + '): scegli il sottotask di destinazione (click destro per la guida)">📋</button>');
  }
  return out;
}

/* Riga degli appunti sotto l'intestazione della timeline */
function cpTlCpAppuntiHtml() {
  const A = _cpTlCp.appunti;
  if (!A || !cpTlWlPuo()) return '';
  const min = A.voci.reduce((s, v) => s + (v.fine - v.inizio), 0);
  const keys = [...new Set(A.voci.map(v => v.key))];
  return '<div class="cptl-appunti text-xs mt-1.5 flex flex-wrap items-center gap-2" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:4px 8px;color:#78350f;">' +
    '<span>📋 <b>Appunti:</b> ' + A.voci.length + (A.voci.length === 1 ? ' worklog' : ' worklog') + ' di <b>' + esc(A.nome) + '</b>, ' + esc(A.label) +
      ' (' + esc(keys.join(', ')) + ', ' + _cpOjDurata(min) + ') · clicca «📋» sulla riga dove incollarli, anche la stessa per spostarli su un altro sottotask</span>' +
    '<button type="button" onclick="cpTlCpSvuota()" class="text-xs px-2 py-0.5 rounded border border-amber-300 bg-white" title="Svuota gli appunti">✕ Svuota</button>' +
  '</div>';
}

/* ---------- Copia ---------- */

function cpTlCpCopia(el) {
  if (!cpTlWlPuo()) return;
  const nome = el.dataset.op, g = Number(el.dataset.g), key = el.dataset.k || '';
  const x = _cpTlWlRiga(nome, g);
  const voci = _cpTlCpCopiabili(x, key);
  if (!voci.length) { showAlertModal('Nessun worklog con l\'id Jira da copiare: usa «↻ Rileggi da Jira» e riprova.'); return; }
  _cpTlCp.appunti = {
    nome, g, iso: x.iso, label: x.label, k: _cpaKey(pwAnno, pwWeek),
    voci: voci.map(iv => ({ key: iv.t.key, summary: iv.t.summary || '', url: iv.t.url || '', id: String(iv.w.id), inizio: iv.inizio, fine: Math.round(iv.fine) })),
  };
  if (cpTlWlAperto()) cpTlWlChiudi();
  _cpTl.msg = '📋 Copiati ' + voci.length + ' worklog di ' + nome + ' (' + x.label + '). Ora clicca «📋» sulla riga dove incollarli.';
  cpTlRender();
}

function cpTlCpSvuota() {
  _cpTlCp.appunti = null;
  if (_cpTl.msg.startsWith('📋')) _cpTl.msg = '';
  cpTlRender();
}

/* ---------- Incolla: apertura e lettura ---------- */

async function cpTlCpIncolla(el) {
  if (!cpTlWlPuo() || !_cpTlCp.appunti) return;
  const nome = el.dataset.op, g = Number(el.dataset.g), d = _cpaDateSettimana();
  if (_cpTlCpFornitore(nome)) { showAlertModal('I worklog dei dipendenti fornitore li gestisce «🏢 Worklog fornitori»: non si incollano da qui.'); return; }
  Object.assign(_cpTlCp, {
    aperto: true, nome, g, iso: d.iso[g], label: d.label[g], k: _cpaKey(pwAnno, pwWeek), d,
    caricando: true, errore: '', avvisi: [], info: {}, righe: [], statoNo: {}, salvando: false, passi: null,
    sposta: nome === _cpTlCp.appunti.nome,
  });
  _cpTlCpRender();
  await _cpTlCpCarica();
}

function cpTlCpChiudi() {
  if (_cpTlCp.salvando) return;   // scrittura in corso: la finestra mostra l'avanzamento
  _cpTlCp.aperto = false;
  const m = document.getElementById('cptl-cp-modal');
  if (m) m.style.display = 'none';
}

/* Esc: lo gestisce il listener della timeline (produzione-timeline.js), che chiude prima questa finestra */

/* Stato, assegnatario e worklog di un sottotask (azione "giornata", sola lettura) */
async function _cpTlCpInfo(key) {
  const C = _cpTlCp;
  if (C.info[key] && !C.info[key].errore) return C.info[key];
  C.info[key] = { caricando: true };
  const res = await _cpTlWlInvoca({ action: 'giornata', issueKey: key });
  C.info[key] = res.ok ? res : { errore: res.errore || 'risposta non valida' };
  return C.info[key];
}

async function _cpTlCpCarica() {
  const C = _cpTlCp, A = C.appunti, apertura = C.k + '|' + C.nome + '|' + C.g;
  const ancora = () => C.aperto && (C.k + '|' + C.nome + '|' + C.g) === apertura;
  C.caricando = true; C.caricaT0 = Date.now(); C.errore = ''; C.avvisi = []; C.info = {};
  _cpTlCpRender();
  try {
    const srcKeys = [...new Set(A.voci.map(v => v.key))];
    await Promise.all(srcKeys.map(k => _cpTlCpInfo(k)));
    if (!ancora()) return;
    _cpTlCpCostruisci();
    // Stato e assegnatario dei sottotask proposti come destinazione
    const dst = [...new Set(C.righe.map(r => r.dst).filter(k => k && !C.info[k]))];
    await Promise.all(dst.map(k => _cpTlCpInfo(k)));
  } catch (e) {
    if (!ancora()) return;
    C.errore = 'Lettura da Jira non riuscita: ' + (e && e.message ? e.message : e);
  }
  if (!ancora()) return;
  C.caricando = false;
  _cpTlCpRender();
}

/* Voci della Griglia (con sottotask) dell'operatore in un giorno della settimana mostrata, con la
   riga del Controllo Produzione a cui appartengono (serve per segnarci la produzione minima). */
function _cpTlCpVoci(nome, g) {
  const out = [];
  pwGetWeekData().forEach(bc => {
    if (!bc.commessa) return;
    (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
      if ((op.nome || '').trim() !== nome) return;
      const opG = (op.giorni || {})[g] || {};
      const cella = { squadra: sq.nome || 'Squadra', cantiere: pwCellCantieri(opG).join(', '), attivita: opG.attivita || '' };
      pwCellVoci(opG).forEach(v => {
        const att = pwJiraAttivitaSottotask(bc, v.cantiere, nome, v.attivita);
        const e = pwJiraSubtaskEntry(bc, v.cantiere, nome, att, g);
        if (pwJiraSubtaskIsResolved(e) && e.key) out.push({ commessa: bc.commessa, cantiere: v.cantiere, attivita: att || '', key: e.key, cella });
      });
    }));
  });
  return out;
}

/* Sottotask di destinazione proposto per un sottotask di origine: { key, come } */
function _cpTlCpProponi(srcKey, indice, voci) {
  const cand = voci.filter(v => v.key !== srcKey);
  const keys = arr => [...new Set(arr.map(v => v.key))];
  const orig = indice[srcKey];
  if (orig) {
    const stessoCant = cand.filter(v => v.commessa === orig.commessa && _cpTlCpNorm(v.cantiere) === _cpTlCpNorm(orig.cantiere));
    const esatti = stessoCant.filter(v => _cpTlCpNorm(v.attivita) === _cpTlCpNorm(orig.attivita));
    if (keys(esatti).length === 1) return { key: esatti[0].key, come: 'stesso cantiere e attività, sottotask del giorno' };
    if (!esatti.length && keys(stessoCant).length === 1) return { key: stessoCant[0].key, come: 'stesso cantiere, attività diversa' };
    if (keys(esatti.length ? esatti : stessoCant).length > 1) return { key: '', come: 'più sottotask possibili: scegli' };
  }
  if (keys(cand).length === 1) return { key: cand[0].key, come: 'unico sottotask del giorno in Griglia' };
  return { key: '', come: cand.length ? 'scegli il sottotask' : 'nessun sottotask in Griglia per questo giorno: scrivi la chiave' };
}

/* Dove sta il sottotask secondo la Griglia: "Ven 20/11 · Quarrata · Rilievo" + se è di un altro giorno */
function _cpTlCpDove(key, indice, iso) {
  const o = indice[key];
  if (!o) return { testo: '', altroGiorno: false };
  const stessa = o.anno === pwAnno && o.week === pwWeek;
  const giorno = o.giorno == null ? '' : stessa ? _cpTlCp.d.label[o.giorno] : CPA_GIORNI[o.giorno] + ' sett. ' + o.week;
  const isoSub = o.giorno != null && stessa ? _cpTlCp.d.iso[o.giorno] : '';
  return {
    testo: [giorno ? 'sottotask di ' + giorno : 'sottotask settimanale', o.cantiere, o.attivita].filter(Boolean).join(' · '),
    altroGiorno: o.giorno != null && (!stessa || isoSub !== iso),
  };
}

function _cpTlCpCostruisci() {
  const C = _cpTlCp, A = C.appunti, indice = _cpaIndiceSottotask(), voci = _cpTlCpVoci(C.nome, C.g);
  const proposte = {};
  C.righe = A.voci.map(v => {
    const inf = C.info[v.key] || {};
    const w = (inf.worklogs || []).find(x => String(x.id) === v.id) || null;
    const p = w ? _cpOjParti(w.started) : null;
    const prop = proposte[v.key] || (proposte[v.key] = _cpTlCpProponi(v.key, indice, voci));
    const inizio = p ? p.min : v.inizio;
    const dove = _cpTlCpDove(v.key, indice, A.iso);
    return {
      srcKey: v.key, srcUrl: v.url, srcSummary: v.summary, srcDove: dove.testo, srcAltroGiorno: dove.altroGiorno,
      id: v.id, orig: w, manca: !w && !inf.errore, nonLetto: !!inf.errore,
      inizio, fine: w ? inizio + Math.round((Number(w.seconds) || 0) / 60) : v.fine,
      commento: w ? (w.commento || '').trim() : '',
      dst: prop.key, come: prop.come, sel: !!w,
    };
  });
}

/* ---------- Form ---------- */

function cpTlCpCampo(el) {
  const C = _cpTlCp, r = C.righe[Number(el.dataset.i)];
  if (!r) return;
  const f = el.dataset.f;
  if (f === 'sel') { r.sel = el.checked; _cpTlCpRender(); return; }
  if (f === 'commento') { r.commento = el.value; cpTlCpControlla(); return; }
  if (f === 'dst') {
    const vecchio = r.dst, nuovo = el.value.trim().toUpperCase();
    // Stesso cambio sulle altre righe dello stesso sottotask di origine che puntavano allo stesso
    C.righe.forEach((x, j) => {
      if (x === r || x.srcKey !== r.srcKey || x.dst !== vecchio) return;
      x.dst = nuovo;
      x.come = '';
      const altro = document.querySelector('#cptl-cp-root input[data-f="dst"][data-i="' + j + '"]');
      if (altro) altro.value = nuovo;
    });
    r.dst = nuovo;
    r.come = '';
    _cpTlCpRenderDettagli();
    return;
  }
  r[f] = _cpTlWlMin(el.value);
  cpTlCpControlla();
}

/* Chiave di destinazione confermata (change, non a ogni tasto): legge stato e assegnatario */
function cpTlCpDstLeggi(el) {
  const C = _cpTlCp, key = el.value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key) || (C.info[key] && !C.info[key].errore)) return;
  const p = _cpTlCpInfo(key);
  _cpTlCpRenderDettagli();   // «leggo lo stato…»
  p.then(() => { if (C.aperto && !C.salvando && !C.passi) _cpTlCpRenderDettagli(); });
}

function cpTlCpSposta(el) { _cpTlCp.sposta = el.checked; _cpTlCpRenderDettagli(); }

function cpTlCpStato(el) {
  if (el.checked) delete _cpTlCp.statoNo[el.dataset.k]; else _cpTlCp.statoNo[el.dataset.k] = true;
  cpTlCpControlla();
}

/* Cambi di stato proposti sulla destinazione: chiave -> { voluto, da, src, srcSt } */
function _cpTlCpStatiProposti() {
  const C = _cpTlCp, out = {};
  C.righe.forEach(r => {
    if (!r.sel || !r.dst || r.dst === r.srcKey) return;
    const s = C.info[r.srcKey], t = C.info[r.dst];
    if (!s || !s.stato || !t || !t.stato) return;
    const rs = _cpGsRango(s.stato), rt = _cpGsRango(t.stato);
    if ((rs !== CPGS_IN_PENDING && rs !== CPGS_DONE) || rt < 0 || rt >= rs) return;
    const voluto = rs === CPGS_DONE ? 'DONE' : 'IN PENDING';
    if (!out[r.dst] || _cpGsRango(out[r.dst].voluto) < rs) out[r.dst] = { voluto, da: t.stato, src: r.srcKey, srcSt: s.stato };
  });
  return out;
}

function _cpTlCpStatoTesto(key) {
  const i = _cpTlCp.info[key];
  if (!i) return '';
  if (i.caricando) return 'leggo lo stato…';
  if (i.errore) return '⚠ ' + i.errore;
  return '«' + (i.stato || '?') + '»' + (i.assegnatario && i.assegnatario.nome ? ' · assegnato a ' + i.assegnatario.nome : ' · non assegnato');
}

/* Sezioni che dipendono dalle scelte (stati, controlli) senza ridisegnare gli input */
function _cpTlCpRenderDettagli() {
  const C = _cpTlCp;
  C.righe.forEach((r, i) => {
    const el = document.getElementById('cptl-cp-dst-' + i);
    if (el) el.textContent = [r.come, r.dst ? _cpTlCpStatoTesto(r.dst) : ''].filter(Boolean).join(' · ');
  });
  const box = document.getElementById('cptl-cp-stati');
  if (box) {
    const prop = _cpTlCpStatiProposti(), keys = Object.keys(prop);
    box.innerHTML = !keys.length ? '' : '<span class="block text-[11px] font-semibold text-slate-500 mb-0.5">Stato del sottotask di destinazione</span>' +
      keys.map(k => {
        const p = prop[k];
        return '<label class="flex items-start gap-2 text-xs mb-1"><input type="checkbox" data-k="' + esc(k) + '"' + (C.statoNo[k] ? '' : ' checked') + ' onchange="cpTlCpStato(this)" style="margin-top:2px">' +
          '<span>Porta <b>' + esc(k) + '</b> da «' + esc(p.da) + '» a <b>' + esc(p.voluto) + '</b>, come ' + esc(p.src) + ' («' + esc(p.srcSt) + '»)' +
          (p.voluto === 'DONE' ? '. <span class="text-slate-500">Se su Jira manca la produzione la metto a 1 (resta «👁 da verificare»: il report la sostituisce, non la somma).</span>' : '') + '</span></label>';
      }).join('');
  }
  cpTlCpControlla();
}

function _cpTlCpRender() {
  const modal = document.getElementById('cptl-cp-modal');
  const root = document.getElementById('cptl-cp-root');
  if (!modal || !root) return;
  modal.style.display = _cpTlCp.aperto ? 'flex' : 'none';
  if (!_cpTlCp.aperto) return;
  const C = _cpTlCp, A = C.appunti;
  const inp = 'border border-slate-300 rounded px-2 py-1 text-sm bg-white';
  const lab = 'block text-[11px] font-semibold text-slate-500 mb-0.5';
  const stessoOp = A.nome === C.nome;
  const titolo = '<div style="font-weight:700;font-size:15px;color:#0f172a;font-family:var(--font-display);">📋 Incolla worklog su un altro sottotask</div>' +
    '<div class="text-xs text-slate-500 mt-0.5 mb-3">Da <b>' + esc(A.nome) + '</b>, ' + esc(A.label) + ' → a <b>' + esc(C.nome) + '</b>, ' + esc(C.label) +
      (A.iso !== C.iso ? ' <span class="text-amber-700">(gli orari restano, cambia il giorno)</span>' : '') + '</div>';
  const piede = btn => '<div class="flex flex-wrap items-center gap-2" style="padding:10px 20px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
    '<button type="button" onclick="_cpTlCpCarica()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white"' + (C.caricando || C.salvando ? ' disabled' : '') + '>↻ Rileggi da Jira</button>' +
    '<div class="flex-1"></div>' +
    '<button type="button" onclick="cpTlCpChiudi()" class="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white">Chiudi</button>' + (btn || '') + '</div>';

  if (C.passi) {
    const ico = { '': '⏳', ok: '✓', ko: '✕', warn: '⚠' }, col = { '': '#334155', ok: '#0f766e', ko: '#b91c1c', warn: '#b45309' };
    root.innerHTML = '<div style="padding:16px 20px 12px;">' + titolo +
      '<div class="text-sm font-semibold mb-2" style="color:#0f766e">' + (C.salvando ? 'Scrivo su Jira: non chiudere la pagina…' : 'Finito') + '</div>' +
      C.passi.map(p => '<div class="text-xs mb-1" style="color:' + col[p.esito] + '">' +
        (p.esito ? ico[p.esito] + ' ' + esc(p.testo) : cpAttesaHtml(p.testo, p.t0)) +
        (p.nota ? '<div class="text-[11px] text-slate-500" style="margin-left:16px">' + esc(p.nota) + '</div>' : '') + '</div>').join('') +
      '</div>';
    return;
  }
  if (C.caricando || C.errore) {
    root.innerHTML = '<div style="padding:16px 20px 10px;">' + titolo +
      (C.errore ? '<div class="text-sm text-red-700 mb-2">✕ ' + esc(C.errore) + '</div>'
        : '<div class="text-sm text-slate-500 mb-2">' + cpAttesaHtml('Leggo da Jira stato e worklog dei sottotask…', C.caricaT0) + '</div>') +
      '</div>' + piede('');
    return;
  }

  const prop = _cpTlWlTicketProposti(C.nome, C.g);
  const dl = '<datalist id="cptl-cp-tickets">' + prop.map(p => '<option value="' + esc(p.key) + '">' + esc(p.testo) + '</option>').join('') + '</datalist>';
  const righe = C.righe.map((r, i) => {
    const off = r.sel ? '' : ' style="opacity:.55"';
    const srcLink = r.srcUrl ? '<a href="' + esc(r.srcUrl) + '" target="_blank" rel="noopener" class="text-teal-700">' + esc(r.srcKey) + '</a>' : esc(r.srcKey);
    const nota = r.manca ? '<div class="text-[11px] text-red-700">non c\'è più su Jira</div>'
      : r.nonLetto ? '<div class="text-[11px] text-red-700">sottotask non letto</div>'
      : '<div class="text-[11px] ' + (r.srcAltroGiorno ? 'text-amber-700 font-semibold' : 'text-slate-500') + '">' + esc(r.srcDove || r.srcSummary) + (r.srcAltroGiorno ? ' ⚠' : '') + '</div>' +
        '<div class="text-[10px] text-slate-400">' + esc(_cpTlCpStatoTesto(r.srcKey)) + '</div>';
    return '<tr' + off + ' style="border-top:1px solid #f1f5f9">' +
      '<td style="padding:4px;vertical-align:top"><input type="checkbox" data-i="' + i + '" data-f="sel"' + (r.sel ? ' checked' : '') + (r.orig ? '' : ' disabled') + ' onchange="cpTlCpCampo(this)"></td>' +
      '<td style="padding:4px;vertical-align:top" class="text-xs"><div class="font-semibold">' + srcLink + '</div>' + nota + '</td>' +
      '<td style="padding:4px;vertical-align:top"><input list="cptl-cp-tickets" class="' + inp + '" style="width:120px" data-i="' + i + '" data-f="dst" value="' + esc(r.dst) +
        '" placeholder="es. AI029-1234" autocomplete="off" oninput="cpTlCpCampo(this)" onchange="cpTlCpDstLeggi(this)">' +
        '<div id="cptl-cp-dst-' + i + '" class="text-[10px] text-slate-500" style="max-width:170px"></div></td>' +
      '<td style="padding:4px;vertical-align:top"><input type="time" step="60" class="' + inp + '" data-i="' + i + '" data-f="inizio" value="' + (r.inizio == null ? '' : _cpTlWlHHMM(r.inizio)) + '" oninput="cpTlCpCampo(this)"></td>' +
      '<td style="padding:4px;vertical-align:top"><input type="time" step="60" class="' + inp + '" data-i="' + i + '" data-f="fine" value="' + (r.fine == null ? '' : _cpTlWlHHMM(r.fine)) + '" oninput="cpTlCpCampo(this)"></td>' +
      '<td style="padding:4px;vertical-align:top;width:100%"><input type="text" maxlength="2000" class="' + inp + ' w-full" placeholder="commento" data-i="' + i + '" data-f="commento" value="' + esc(r.commento) + '" oninput="cpTlCpCampo(this)"></td>' +
    '</tr>';
  }).join('');
  const srcKeys = [...new Set(C.righe.map(r => r.srcKey))].join(', ');

  root.innerHTML = '<div style="padding:16px 20px 6px;">' + titolo +
      (C.avvisi.length ? '<div class="text-[11px] text-amber-700 mb-2">⚠ ' + C.avvisi.map(esc).join('<br>⚠ ') + '</div>' : '') +
      (prop.some(p => p.delGiorno) ? '' : '<div class="text-[11px] text-amber-700 mb-2">⚠ ' + esc(C.nome) + ' non ha sottotask Jira in Griglia per ' + esc(C.label) +
        ': crealo da «🎫 Sottotask Jira» in Griglia, oppure scrivi la chiave a mano.</div>') +
      '<table style="width:100%;border-collapse:collapse"><thead><tr class="text-[11px] text-slate-500">' +
        '<th></th><th style="text-align:left;padding:0 4px">Worklog copiato</th><th style="text-align:left;padding:0 4px">Incolla su</th>' +
        '<th style="text-align:left;padding:0 4px">Inizio</th><th style="text-align:left;padding:0 4px">Fine</th><th style="text-align:left;padding:0 4px">Commento</th></tr></thead>' +
        '<tbody>' + righe + '</tbody></table>' + dl +
      '<label class="flex items-start gap-2 text-xs mt-3"><input type="checkbox"' + (C.sposta ? ' checked' : '') + ' onchange="cpTlCpSposta(this)" style="margin-top:2px">' +
        '<span><b>Sposta</b>: dopo averli aggiunti, elimina gli originali da ' + esc(srcKeys) + '. ' +
        '<span class="text-slate-500">' + (stessoOp ? 'È il caso del sottotask del giorno sbagliato: senza, le ore conterebbero due volte.'
          : 'Operatori diversi: di solito si copia senza eliminare (come «⧉ Copia worklog»).') + '</span></span></label>' +
      '<div id="cptl-cp-stati" class="mt-3"></div>' +
      '<div id="cptl-cp-check" class="text-xs mt-3 mb-1" style="min-height:18px;"></div>' +
    '</div>' +
    piede('<button type="button" id="cptl-cp-applica" onclick="cpTlCpApplica()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#0f766e;">Incolla su Jira</button>');
  _cpTlCpRenderDettagli();
}

/* Operazioni da fare + errori (bloccano) e avvisi */
function _cpTlCpVerifica() {
  const C = _cpTlCp, A = C.appunti, out = { errori: [], avvisi: [], crea: [], elimina: [], stati: [] };
  const ora = cpOraRoma(), noti = new Set(_cpTlWlTicketProposti(C.nome, C.g).map(p => p.key));
  const stessaGiornata = A.nome === C.nome && A.iso === C.iso;
  const x = _cpTlWlRiga(C.nome, C.g);
  const esistenti = (x ? x.interventi : []).filter(iv => !iv.inCorso);
  C.righe.forEach((r, i) => {
    if (!r.sel || !r.orig) return;
    const n = 'Riga ' + (i + 1) + ' (' + r.srcKey + ' ' + (r.inizio == null ? '' : _cpOjOra(r.inizio)) + ')';
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(r.dst || '')) { out.errori.push(n + ': indica il sottotask su cui incollare.'); return; }
    if (r.dst === r.srcKey && C.sposta && stessaGiornata) { out.errori.push(n + ': è lo stesso sottotask da cui viene, scegline un altro.'); return; }
    if (r.inizio == null || r.fine == null) { out.errori.push(n + ': indica ora di inizio e di fine.'); return; }
    if (r.fine <= r.inizio) { out.errori.push(n + ': la fine deve essere dopo l\'inizio.'); return; }
    if (ora && (C.iso > ora.data || (C.iso === ora.data && r.fine > ora.min))) { out.errori.push(n + ': non può finire nel futuro.'); return; }
    const inf = C.info[r.dst];
    if (inf && inf.errore) out.avvisi.push(n + ': ' + r.dst + ' non letto da Jira (' + inf.errore + ').');
    if (r.dst === r.srcKey) out.avvisi.push(n + ': è lo stesso sottotask di origine.');
    else if (!noti.has(r.dst)) out.avvisi.push(n + ': ' + r.dst + ' non è tra i sottotask di ' + C.nome + ' di questa settimana.');
    if (r.fine - r.inizio > CPTL_WL_LUNGO_MIN) out.avvisi.push(n + ': durata lunga (' + _cpOjDurata(r.fine - r.inizio) + ').');
    // Sovrapposizioni con i worklog della destinazione che restano (non con gli originali che si spostano)
    esistenti.forEach(e => {
      if (C.sposta && stessaGiornata && C.righe.some(o => o.sel && o.orig && String(o.orig.id) === String(e.w && e.w.id))) return;
      if (e.inizio < r.fine && e.fine > r.inizio) out.avvisi.push(n + ' si sovrappone a ' + e.t.key + ' ' + _cpOjOra(e.inizio) + '–' + _cpOjOra(e.fine) + ' già di ' + C.nome + '.');
    });
    out.crea.push(r);
    if (C.sposta) out.elimina.push(r);
  });
  const prop = _cpTlCpStatiProposti();
  Object.keys(prop).forEach(k => { if (!C.statoNo[k]) out.stati.push(Object.assign({ key: k }, prop[k])); });
  // Tempo: 12 h al giorno per autore. Con lo spostamento sulla stessa giornata conta la somma solo
  // se si aggiunge prima di eliminare: in quel caso si elimina prima (vedi cpTlCpApplica).
  const giorno = esistenti.reduce((s, e) => s + (e.fine - e.inizio), 0);
  const nuovi = out.crea.reduce((s, r) => s + (r.fine - r.inizio), 0);
  const tolti = stessaGiornata ? out.elimina.reduce((s, r) => s + (Math.round((Number(r.orig.seconds) || 0) / 60)), 0) : 0;
  out.prima = stessaGiornata && giorno + nuovi > CPTLCP_MAX_GIORNO_MIN;   // eliminare prima di aggiungere
  if (giorno + nuovi - tolti > CPTLCP_MAX_GIORNO_MIN) out.avvisi.push('In tutto ' + C.nome + ' arriverebbe a ' + _cpOjDurata(giorno + nuovi - tolti) + ' il ' + C.label + ': Tempo rifiuta oltre 12 h al giorno per persona.');
  if (out.prima) out.avvisi.push('Per stare nelle 12 h di Tempo elimino gli originali prima di aggiungere: se un\'aggiunta non riesce, gli orari restano negli appunti per rimetterli.');
  // Sottotask IN PROGRESS: alla chiusura Jira aggiunge da solo un worklog
  new Set(out.crea.map(r => r.dst)).forEach(k => {
    const t = C.info[k];
    if (t && t.stato && _cpGsRango(t.stato) === CPGS_IN_PROGRESS && !out.stati.some(s => s.key === k)) {
      out.avvisi.push(k + ' è IN PROGRESS: quando verrà chiuso Jira aggiungerà un worklog fino a quel momento (ore contate due volte). Conviene chiuderlo con «✎» nella colonna Stato.');
    }
  });
  if (out.elimina.length) {
    new Set(out.elimina.map(r => r.srcKey)).forEach(k => {
      const t = C.info[k];
      const r = t && t.stato ? _cpGsRango(t.stato) : -1;
      if (r === CPGS_IN_PROGRESS) out.avvisi.push(k + ' è IN PROGRESS: alla chiusura Jira gli aggiungerà di nuovo un worklog.');
      else if (r >= CPGS_IN_PENDING) out.avvisi.push(k + ' resta «' + t.stato + '» anche senza ore: da qui non si riporta indietro. Se l\'operatore deve usarlo ancora, riaprilo su Jira.');
    });
  }
  return out;
}

function cpTlCpControlla() {
  const box = document.getElementById('cptl-cp-check'), btn = document.getElementById('cptl-cp-applica');
  if (!box) return;
  const v = _cpTlCpVerifica();
  const niente = !v.crea.length && !v.stati.length;
  const righe = [];
  if (!niente) {
    const cosa = [];
    if (v.crea.length) cosa.push(v.crea.length + ' worklog da aggiungere (' + _cpOjDurata(v.crea.reduce((s, r) => s + (r.fine - r.inizio), 0)) + ')');
    if (v.elimina.length) cosa.push(v.elimina.length + ' originali da eliminare');
    if (v.stati.length) cosa.push(v.stati.length + ' cambio di stato');
    righe.push('<span class="text-slate-600">' + esc(cosa.join(' · ')) + '</span>');
  }
  v.errori.forEach(e => righe.push('<span class="text-red-700">✕ ' + esc(e) + '</span>'));
  v.avvisi.forEach(a => righe.push('<span class="text-amber-700">⚠ ' + esc(a) + '</span>'));
  box.innerHTML = righe.join('<br>');
  if (btn) {
    const off = niente || !!v.errori.length || _cpTlCp.salvando;
    btn.disabled = off;
    btn.style.opacity = off ? '.5' : '';
  }
}

/* ---------- Scrittura su Jira ---------- */

function _cpTlCpPasso(testo) {
  _cpTlCp.passi.push({ testo, esito: '', nota: '', t0: Date.now() });
  _cpTlCpRender();
  return _cpTlCp.passi[_cpTlCp.passi.length - 1];
}
function _cpTlCpFatto(p, esito, nota) {
  p.esito = esito;
  if (nota) p.nota = nota;
  _cpTlCpRender();
}

async function cpTlCpApplica() {
  const C = _cpTlCp, A = C.appunti;
  if (C.salvando || !cpTlWlPuo()) return;
  const v = _cpTlCpVerifica();
  if (v.errori.length || (!v.crea.length && !v.stati.length)) { cpTlCpControlla(); return; }
  const dove = r => _cpOjOra(r.inizio) + '–' + _cpOjOra(r.fine) + ' (' + _cpOjDurata(r.fine - r.inizio) + ')';
  const doveOrig = r => {
    const p = _cpOjParti(r.orig.started), m = Math.round((Number(r.orig.seconds) || 0) / 60);
    return p ? _cpOjOra(p.min) + '–' + _cpOjOra(p.min + m) + ' (' + _cpOjDurata(m) + ')' : '';
  };
  const righe = [];
  v.stati.forEach(s => righe.push('Stato ' + s.key + ': ' + s.da + ' → ' + s.voluto + (s.voluto === 'DONE' ? ' (se manca la produzione, la metto a 1)' : '')));
  v.crea.forEach(r => righe.push('Aggiungi su ' + r.dst + ' ' + C.label + ' ' + dove(r) + ' (da ' + r.srcKey + ')'));
  v.elimina.forEach(r => righe.push('Elimina da ' + r.srcKey + ' ' + A.label + ' ' + doveOrig(r)));
  const msg = 'Su Jira, per ' + C.nome + ':\n\n• ' + righe.join('\n• ') +
    '\n\nI worklog aggiunti risultano a nome dell\'assegnatario del sottotask; la stima residua non cambia. Da qui non si torna indietro con «Indietro».' +
    (v.avvisi.length ? '\n\n⚠ ' + v.avvisi.join('\n⚠ ') : '');
  if (!await showConfirmAsync(msg, 'Incolla su Jira')) return;

  C.salvando = true;
  C.passi = [];
  _cpTlCpRender();
  const fatti = [], problemi = [], saltaKey = new Set(), creati = new Set(), eliminati = new Set();
  const nome = C.nome, email = _cpTlEmailPerNome()[nome] || '', k = C.k, d = C.d;
  const elimina = async r => {
    const pe = _cpTlCpPasso('Elimino da ' + r.srcKey + ' il worklog ' + doveOrig(r) + '…');
    const res = await _cpTlWlInvoca({ action: 'delete', issueKey: r.srcKey, worklogId: String(r.orig.id), operatore: A.nome,
      atteso: { started: r.orig.started, seconds: r.orig.seconds } });
    if (res.ok) {
      eliminati.add(r);
      fatti.push('Eliminato da ' + r.srcKey + ' ' + doveOrig(r) + (res.avviso ? ' ⚠ ' + res.avviso : ''));
      _cpTlCpFatto(pe, res.avviso ? 'warn' : 'ok', res.avviso || '');
    } else {
      problemi.push('Eliminazione da ' + r.srcKey + ' ' + doveOrig(r) + ': ' + (res.errore || 'non riuscita') + ' (le ore ora sono su due sottotask)');
      _cpTlCpFatto(pe, 'ko', res.errore || 'non riuscita');
    }
  };
  try {
    // a. Stato della destinazione prima dei worklog: quelli dell'automazione Jira si riconoscono come nuovi
    for (const s of v.stati) {
      if (s.voluto === 'DONE') {
        const pp = _cpTlCpPasso('Controllo la produzione di ' + s.key + ' (per DONE Jira la vuole maggiore di 0)…');
        const voce = _cpTlCpVoci(nome, C.g).find(x => x.key === s.key);
        const o = _cpaIndiceSottotask()[s.key];
        const pr = await cpProduzioneMinima(s.key, {
          nome, g: C.g, iso: C.iso, commessa: voce ? voce.commessa : (o ? o.commessa : ''),
          cella: voce && C.k === _cpaKey(pwAnno, pwWeek) ? voce.cella : null,
        });
        _cpTlCpFatto(pp, pr.esito === 'errore' || pr.esito === 'locale' ? 'warn' : 'ok', pr.testo);
        if (pr.esito === 'scritto') fatti.push(s.key + ': ' + pr.testo);
        else if (pr.esito !== 'gia') problemi.push(s.key + ': ' + pr.testo);
      }
      const ps = _cpTlCpPasso('Porto ' + s.key + ' da «' + s.da + '» a ' + s.voluto + ' (Jira impiega 10–20 secondi)…');
      const res = await _cpTlWlInvoca({ action: 'stato', issueKey: s.key, voluto: s.voluto, atteso: { stato: s.da }, operatore: nome });
      if (res.ok) {
        const t = 'Stato ' + s.key + ': ' + res.prima + ' → ' + res.dopo + (res.rimossi && res.rimossi.length ? ' (eliminati ' + res.rimossi.length + ' worklog dell\'automazione)' : '');
        fatti.push(t);
        _cpTlCpFatto(ps, res.avviso ? 'warn' : 'ok', t + (res.avviso ? ' ⚠ ' + res.avviso : ''));
        if (res.avviso) problemi.push(s.key + ': ' + res.avviso);
      } else {
        const t = 'Stato ' + s.key + ': ' + (res.errore || 'non riuscito') + (res.codice === 'cambiato' ? ' Su questo sottotask non incollo niente.' : '');
        problemi.push(t);
        _cpTlCpFatto(ps, 'ko', t);
        if (res.codice === 'cambiato') saltaKey.add(s.key);
      }
    }
    const daFare = v.crea.filter(r => !saltaKey.has(r.dst));
    // b. Oltre le 12 h di Tempo: prima si eliminano gli originali
    if (v.prima) for (const r of daFare) if (C.sposta) await elimina(r);
    // c. Aggiunte, una alla volta
    let forza = false, chiesto = false;
    for (let i = 0; i < daFare.length; i++) {
      const r = daFare[i];
      const pw = _cpTlCpPasso('Aggiungo il worklog ' + (i + 1) + '/' + daFare.length + ' su ' + r.dst + ' ' + dove(r) + '…');
      const body = { action: 'create', issueKey: r.dst, data: C.iso, inizioMin: r.inizio, durataMin: r.fine - r.inizio, operatore: nome, email, forza };
      if (r.commento.trim()) body.commento = r.commento.trim();
      let res = await _cpTlWlInvoca(body);
      if (res.codice === 'assegnatario_diverso' && !forza) {
        if (!chiesto) { chiesto = true; forza = await showConfirmAsync(res.errore + '\n\nAggiungere comunque le ore?', 'Aggiungi comunque'); }
        if (forza) res = await _cpTlWlInvoca(Object.assign({}, body, { forza: true }));
      }
      if (res.ok) {
        creati.add(r);
        fatti.push('Aggiunto su ' + r.dst + ' ' + dove(r) + (res.dopo && res.dopo.autore ? ' (autore ' + res.dopo.autore + ')' : '') + (res.avviso ? ' ⚠ ' + res.avviso : ''));
        _cpTlCpFatto(pw, res.avviso ? 'warn' : 'ok', res.avviso || (res.dopo && res.dopo.autore ? 'autore ' + res.dopo.autore : ''));
      } else {
        problemi.push('Aggiunta su ' + r.dst + ' ' + dove(r) + ': ' + (res.errore || 'non riuscita') +
          (v.prima && eliminati.has(r) ? ' — l\'originale è già stato eliminato: rimettilo con «＋» (' + r.srcKey + ' ' + dove(r) + ', è ancora negli appunti)' : ''));
        _cpTlCpFatto(pw, 'ko', res.errore || 'non riuscita');
      }
    }
    // d. Eliminazione degli originali solo dove l'aggiunta è riuscita: altrimenti le ore si perderebbero
    if (!v.prima && C.sposta) {
      for (const r of daFare) {
        if (creati.has(r)) await elimina(r);
        else problemi.push('Non elimino ' + r.srcKey + ' ' + doveOrig(r) + ': l\'aggiunta non è riuscita, l\'originale resta.');
      }
    }
  } catch (e) {
    problemi.push('Interrotto: ' + (e && e.message ? e.message : e));
  } finally {
    C.salvando = false;
    C.passi = null;
    cpTlCpChiudi();
    // Appunti: dopo uno spostamento riuscito gli originali non ci sono più
    const tuttoOk = !problemi.length && creati.size === v.crea.length;
    if (C.sposta && tuttoOk) _cpTlCp.appunti = null;
    cpStatoRefresh(true);
    const esito = (fatti.length ? '✓ Incollati su Jira ' + creati.size + ' worklog per ' + nome + (eliminati.size ? ', ' + eliminati.size + ' originali eliminati' : '') + '.' : '') +
      (problemi.length ? ' ⚠ ' + problemi.length + ' da controllare.' : '') + ' Per aggiornare «Ore Jira» usa «🔄 Sincronizza da Jira».';
    showAlertModal((fatti.length ? 'Fatto su Jira:\n\n• ' + fatti.join('\n• ') : 'Nessuna modifica fatta su Jira.') +
      (problemi.length ? '\n\n⚠ Da controllare:\n• ' + problemi.join('\n• ') : '') +
      '\n\nPer aggiornare «Ore Jira» del Controllo Produzione usa «🔄 Sincronizza da Jira».');
    if (fatti.length && k === _cpaKey(pwAnno, pwWeek)) {
      _cpTlWlRileggiOperatore(nome, k, d, esito);
      if (A.nome !== nome && A.k === k) _cpTlWlRileggiOperatore(A.nome, k, d, esito);
    } else {
      _cpTl.msg = esito;
      cpTlRender();
    }
  }
}
