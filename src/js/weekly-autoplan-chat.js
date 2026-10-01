/* ==================== AUTO-PIANIFICA: ASSISTENTE IN CHAT (apc*) ==================== */
/* Chat dedicata alla bozza della tab Auto-pianifica, distinta dall'assistente generico
   (ai-assistant.js), con cui condivide solo la configurazione del provider e il rendering
   del markdown. L'utente scrive in linguaggio naturale; l'Edge Function 'ai-autoplan' fa
   da relè verso l'LLM un passo alla volta e gli STRUMENTI girano qui, sulla bozza locale
   (_ap in weekly-autoplan.js):
     browser → ai-autoplan (trascrizione) → LLM → richieste di strumenti → browser esegue
     → ai-autoplan (con i risultati) → … → risposta finale.
   Regola ferma: nessuno strumento tocca pwData. Gli strumenti modificano righe, opzioni e
   precedenze e richiamano il solver; la Griglia cambia solo con "Applica" dell'utente.
   Ogni risposta che modifica qualcosa mostra le differenze e si può annullare (pila in
   memoria). La conversazione è per settimana, salvata in localStorage (per browser). */

const APC_MAX_PASSI = 10;          // richieste al modello per ogni messaggio dell'utente
const APC_STORAGE_KEY = 'ap_chat_v1';
const APC_MAX_TRASCR = 50;         // messaggi di trascrizione inviati/salvati
const APC_MAX_MSGS = 60;           // bolle visibili salvate

let _apc = {
  aperta: false,
  anno: null,
  week: null,
  msgs: [],        // bolle: { tipo:'utente'|'agente', testo, passi, diff, undo, annullato, errore, ts }
  trascr: [],      // trascrizione normalizzata per ai-autoplan (vedi supabase/functions/ai-autoplan)
  busy: false,
  stop: false,
  stato: null,     // { enabled, provider, model } | { errore }
  undo: [],        // [{ id, snap, firmaDopo }]
  passoCorrente: null
};
let _apcSeq = 0;

try { _apc.aperta = localStorage.getItem('ap_chat_aperta') === '1'; } catch (_) {}

function apcAperta() { return _apc.aperta; }

/* ---------- persistenza per settimana ---------- */

function _apcKey() { return _apWkKey(_ap.anno, _ap.week); }

function _apcSalva() {
  try {
    const raw = localStorage.getItem(APC_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    /* I risultati degli strumenti sono voluminosi e servono al modello solo nel turno in
       corso: nel salvataggio si accorciano. */
    const trascr = _apc.trascr.slice(-APC_MAX_TRASCR).map(m => m.role !== 'tool' ? m : {
      role: 'tool',
      results: m.results.map(r => ({ id: r.id, name: r.name, result: _apcCorto(r.result, 1500) }))
    });
    const msgs = _apc.msgs.slice(-APC_MAX_MSGS).map(m => Object.assign({}, m, { undo: null }));
    all[_apcKey()] = { msgs, trascr, ts: Date.now() };
    const keys = Object.keys(all).sort((a, b) => (all[b].ts || 0) - (all[a].ts || 0));
    keys.slice(6).forEach(k => delete all[k]);
    localStorage.setItem(APC_STORAGE_KEY, JSON.stringify(all));
  } catch (_) { /* storage pieno o bloccato: la chat resta in memoria */ }
}

function _apcCarica() {
  _apc.msgs = [];
  _apc.trascr = [];
  _apc.undo = [];
  try {
    const all = JSON.parse(localStorage.getItem(APC_STORAGE_KEY) || '{}');
    const s = all[_apcKey()];
    if (s) {
      _apc.msgs = Array.isArray(s.msgs) ? s.msgs : [];
      _apc.trascr = Array.isArray(s.trascr) ? s.trascr : [];
    }
  } catch (_) {}
  /* Un turno interrotto dal reload non è più "in corso" */
  _apc.msgs.forEach(m => { (m.passi || []).forEach(p => { if (p.stato === 'corso') p.stato = 'errore'; }); });
  _apc.anno = _ap.anno;
  _apc.week = _ap.week;
}

function _apcCorto(v, n) {
  const s = typeof v === 'string' ? v : JSON.stringify(v == null ? null : v);
  return s.length > n ? s.slice(0, n) + '…' : (typeof v === 'string' ? v : JSON.parse(s));
}

/* Cambio settimana (da apInit): ogni settimana ha la sua conversazione */
function apcOnSettimana() {
  if (_apc.busy) _apc.stop = true;
  _apcCarica();
  if (_apc.aperta) { apcRender(); if (!_apc.stato) apcControllaStato(); }
}

/* ---------- apertura / chiusura ---------- */

function apcToggle(forza) {
  _apc.aperta = typeof forza === 'boolean' ? forza : !_apc.aperta;
  try { localStorage.setItem('ap_chat_aperta', _apc.aperta ? '1' : '0'); } catch (_) {}
  _apcSyncLayout();
  apRender();
  if (_apc.aperta) {
    if (_apc.anno !== _ap.anno || _apc.week !== _ap.week) _apcCarica();
    apcRender();
    apcControllaStato();
    setTimeout(() => { const t = document.getElementById('apc-input'); if (t) t.focus(); }, 60);
  }
}

function _apcSyncLayout() {
  const lay = document.getElementById('ap-layout');
  if (lay) lay.classList.toggle('apc-aperta', _apc.aperta);
}

async function apcControllaStato(forza) {
  if (_apc.stato && !_apc.stato.errore && !forza) { _apcRenderComposer(); return; }
  if (!_sbClient || !_sbUser) { _apc.stato = { errore: 'Serve l\'accesso: l\'assistente usa il server.' }; apcRender(); return; }
  try {
    const { data, error } = await _sbClient.functions.invoke('ai-autoplan', { body: { action: 'status' } });
    if (error) throw new Error(await _cpEdgeErr(error, 'ai-autoplan'));
    _apc.stato = data || { enabled: false };
  } catch (e) {
    _apc.stato = { errore: 'Assistente non raggiungibile: ' + (e.message || e) };
  }
  apcRender();
}

/* ================= STRUMENTI (eseguiti sulla bozza locale) ================= */

const APC_MODIFICANO = new Set(['aggiungi_cantieri', 'modifica_cantiere', 'rimuovi_cantiere',
  'importa_settimana_precedente', 'imposta_precedenza', 'imposta_opzioni', 'calcola_bozza',
  'segnala_imprevisto', 'rimuovi_imprevisto', 'calcola_riparazione']);

/* Riferimento a una riga: id ("r12") oppure nome del cantiere, se univoco */
function _apcRiga(rif) {
  const k = String(rif == null ? '' : rif).trim();
  const perId = _ap.righe.find(r => r.id === k);
  if (perId) return perId;
  const n = _apNorm(k);
  const perNome = _ap.righe.filter(r => _apNorm(r.cantiere) === n);
  if (perNome.length === 1) return perNome[0];
  if (perNome.length > 1) {
    throw new Error('nome ambiguo, ' + perNome.length + ' righe: ' +
      perNome.map(r => r.id + ' (' + (r.commessa || 'senza commessa') + (r.attivita ? ', ' + r.attivita : '') + ')').join('; ') + '. Usa l\'id.');
  }
  const simili = _ap.righe.filter(r => _apNorm(r.cantiere).includes(n) || n.includes(_apNorm(r.cantiere)));
  if (simili.length === 1) return simili[0];
  throw new Error('cantiere "' + k + '" non trovato nella lista' +
    (simili.length ? ' (simili: ' + simili.map(r => r.id + ' ' + r.cantiere).join(', ') + ')' : ''));
}

function _apcNomeGiorni(arr) { return (arr || []).map(d => AP_GIORNI[d]).join(', '); }

/* Commessa della richiesta -> nome esatto fra le attive, o errore con l'elenco */
function _apcCommessa(v) {
  const c = _apCommessaCanonica(v);
  const valide = pwGetCommesseValide();
  if (valide.includes(c)) return c;
  throw new Error('commessa "' + v + '" non trovata fra le attive. Attive: ' + valide.slice(0, 40).join(' | '));
}

/* Nomi operatori -> nomi del pool; quelli non riconosciuti tornano come avviso */
function _apcOperatori(lista, avvisi) {
  const pool = new Set(_apOperatoriCatalogo());
  const out = _apOperatoriCanonici(lista);
  const ignoti = out.filter(n => !pool.has(n));
  if (ignoti.length) avvisi.push('operatori non riconosciuti (ignorati dal calcolo): ' + ignoti.join(', '));
  return out;
}

function _apcAggiorna(righeToccate) {
  (righeToccate || []).forEach(id => _ap.toccate.add(id));
  _apInvalidaBozza();
  _apSalvaLocale();
  apRender();
}

function _apcRigaPerAgente(r) {
  const st = apStimaImpegno(r, _ap.modello);
  const o = {
    id: r.id, cantiere: r.cantiere, commessa: r.commessa || null, attivita: r.attivita || null,
    priorita: 'P' + (r.priorita || 3)
  };
  if (r.km != null) o.km = r.km;
  o.giorni = r.giorniManuali > 0 ? r.giorniManuali + ' (fissati a mano)' : st.giorni + ' (stima: ' + st.fonte + ')';
  o.operatori = r.nOp || st.nOp;
  if (r.scadenza) o.scadenza = r.scadenza;
  if (r.dal) o.dal = r.dal;
  const ge = _apGiorniLista(r.giorniEsclusi);
  if (ge.length) o.giorni_esclusi = _apcNomeGiorni(ge);
  if (r.preferiti.length) o.preferiti = r.preferiti;
  if (r.esclusi.length) o.esclusi = r.esclusi;
  if (r.skills.length) o.skill = r.skills;
  if (r.note) o.note = r.note;
  if (!r.includi) o.escluso_dal_calcolo = true;
  if (!_apRigaCompleta(r)) o.incompleto = 'manca ' + (r.cantiere ? 'la commessa' : 'il cantiere');
  else if (!pwGetCommesseValide().includes(r.commessa)) o.avviso = 'commessa non fra le attive';
  return o;
}

function _apcEsitoPerAgente(b, id) {
  const e = b.risultato.esiti[id];
  const r = b.righeSolver.find(x => x.id === id);
  if (!e || !r) return null;
  const quando = b.risultato.assegnazioni.filter(a => a.rigaId === id)
    .map(a => AP_GIORNI[a.giorno] + (a.quota < 1 ? '½' : '') + (a.viaggio ? ' (viaggio da casa, ½ produttiva)' : '') + ': ' + a.operatori.join(' + ')).join(' · ');
  const o = { id, cantiere: r.cantiere, stato: e.stato.replace('_', ' '), giorni: apFmtNum(e.giorniAssegnati) + '/' + apFmtNum(e.richiesti) };
  if (quando) o.piano = quando;
  if (e.oltreScadenza) o.oltre_scadenza = true;
  const note = [].concat(e.motivi, e.avvisi);
  if (note.length) o.note = note;
  return o;
}

function _apcRiepilogo(b) {
  const es = Object.values(b.risultato.esiti);
  const n = st => es.filter(e => e.stato === st).length;
  return {
    assegnati: n('assegnato'), parziali: n('parziale'), non_assegnati: n('non_assegnato'),
    oltre_scadenza: es.filter(e => e.oltreScadenza).length,
    celle: b.risultato.assegnazioni.reduce((t, a) => t + a.operatori.length, 0)
  };
}

/* Riparazione per imprevisti, in forma compatta per il modello */
function _apcRiparazionePerAgente(rip) {
  const res = rip.risultato;
  const voci = rip.righeSolver.map(r => {
    const e = res.esiti[r.id] || { stato: 'non_assegnato', motivi: [], avvisi: [] };
    const ass = res.assegnazioni.filter(a => a.rigaId === r.id);
    const note = [].concat(e.motivi || [], e.avvisi || []);
    if (r.tipo === 'sostituto') {
      const o = { tipo: 'sostituto', giorno: AP_GIORNI[r.giorno], cantiere: r.cantiere, commessa: r.commessa, al_posto_di: r.sostituisce };
      if (ass.length) o.sostituto = ass.map(a => a.operatori.join(' + ')).join(', ');
      else o.esito = 'nessun sostituto: ' + (r.compagni.length ? 'restano ' + r.compagni.join(', ') : 'cantiere scoperto quel giorno');
      if (note.length && !ass.length) o.note = note;
      return o;
    }
    const o = { tipo: 'recupero', cantiere: r.cantiere, commessa: r.commessa, fermo: r.giorniPersi.map(d => AP_GIORNI[d]).join(', '),
      da_recuperare: apFmtNum(r.giorni) + ' gg × ' + r.nOp + ' op', squadra_originale: r.squadra,
      stato: e.stato.replace('_', ' ') };
    if (ass.length) o.piano = ass.map(a => AP_GIORNI[a.giorno] + (a.quota < 1 ? '½' : '') + ': ' + a.operatori.join(' + ')).join(' · ');
    if (note.length) o.note = note;
    return o;
  });
  const out = {
    celle_tolte: rip.impatto.rimozioni.length,
    celle_nuove: res.assegnazioni.reduce((n, a) => n + a.operatori.length, 0),
    voci,
    nota: 'la riparazione arriva in Griglia solo quando l\'utente preme «Applica riparazione»'
  };
  if (rip.impatto.ignorati.length) out.senza_effetto = rip.impatto.ignorati.map(x => {
    const imp = _ap.imprevisti.find(i => i.id === x.imprevistoId);
    return (imp ? _apImprevistoTesto(imp) : x.imprevistoId) + ': ' + x.motivo;
  });
  const liberi = _apRiparazioneLiberi(rip);
  if (liberi.length) out.restano_liberi = liberi.map(l => AP_GIORNI[l.giorno] + ' ' + l.operatore);
  return out;
}

const APC_TOOLS = {
  leggi_bozza() {
    const b = _ap.bozza;
    let giorni;
    try { giorni = b ? b.ctxGiorni : apBuildContesto().giorni; } catch (_) { giorni = []; }
    const out = {
      settimana: _ap.week, anno: _ap.anno,
      giorni_pianificabili: _apcNomeGiorni(giorni) || 'nessuno (settimana passata)',
      opzioni: { sabato: !!_ap.opzioni.sabato, meteo: !!_ap.opzioni.meteo, max_km: _ap.opzioni.maxKm || 250 },
      storico: _ap.modelloInfo || '',
      commesse_attive: pwGetCommesseValide(),
      cantieri: _ap.righe.map(_apcRigaPerAgente),
      precedenze: _ap.precedenze.map(([a, c]) => _apNomeRiga(null, a) + ' prima di ' + _apNomeRiga(null, c)),
      imprevisti: _ap.imprevisti.map(x => ({ id: x.id, imprevisto: _apImprevistoTesto(x), motivo: x.motivo || undefined })),
      riparazione: _ap.riparazione ? _apcRiparazionePerAgente(_ap.riparazione)
        : (_ap.imprevisti.length ? 'non calcolata: chiama calcola_riparazione' : null)
    };
    if (!b) {
      out.bozza = null;
      out.nota_bozza = _ap.righe.length ? 'bozza non calcolata o non più aggiornata dopo le modifiche: chiama calcola_bozza' : 'lista vuota';
      return out;
    }
    const res = b.risultato;
    out.bozza = {
      riepilogo: _apcRiepilogo(b),
      esiti: b.righeSolver.map(r => _apcEsitoPerAgente(b, r.id)).filter(Boolean),
      migliorie: res.miglioramenti.map(m => _apNomeRiga(b, m.rigaId) + ' anticipato prima di ' + _apNomeRiga(b, m.primaDi) + ': ' + _apEffettiTesto(b, m.effetti)),
      suggerimenti: res.suggerimenti.map(sg => _apNomeRiga(b, sg.rigaId) + ' entra (+' + apFmtNum(sg.guadagno) + ' gg) se passa davanti a ' +
        _apNomeRiga(b, sg.primaDi) + ': ' + _apEffettiTesto(b, sg.effetti) + ' → imposta_precedenza(prima="' + sg.rigaId + '", dopo="' + sg.primaDi + '")'),
      operatori_su_piu_commesse: res.operatoriSuPiuCommesse,
      distanze: b.infoDistanze, meteo: b.infoMeteo
    };
    return out;
  },

  leggi_operatori(args) {
    const b = _ap.bozza;
    const ctx = b ? b.ctx : apBuildContesto();
    const filtroNome = _apNorm(args && args.nome);
    const libero = args && args.libero_il != null && args.libero_il !== '' ? parseInt(args.libero_il, 10) : null;
    const skill = _apNorm(args && args.skill);
    const inBozza = {};
    if (b) b.risultato.assegnazioni.forEach(a => {
      const r = b.righeSolver.find(x => x.id === a.rigaId);
      a.operatori.forEach(n => { (inBozza[n] = inBozza[n] || []).push(AP_GIORNI[a.giorno] + ' ' + (r ? r.cantiere : a.rigaId)); });
    });
    const ETICHETTA = { libero: 'libero', ferie: 'ferie', dw: 'doppia week', occupato: 'in Griglia', sabato: 'sabato non previsto' };
    let ops = ctx.operatori.filter(o => {
      if (filtroNome && !_apNorm(o.nome).includes(filtroNome)) return false;
      if (skill && !Array.from(o.skills).some(s => _apNorm(s).includes(skill))) return false;
      if (libero != null && ((ctx.disp[o.nome] || {})[libero] || 'libero') !== 'libero') return false;
      return true;
    });
    const totale = ops.length;
    ops = ops.slice(0, 60);
    return {
      totale, mostrati: ops.length,
      operatori: ops.map(o => {
        const x = {
          nome: o.nome,
          giorni: ctx.giorni.map(d => AP_GIORNI[d] + ' ' + (ETICHETTA[(ctx.disp[o.nome] || {})[d] || 'libero'] || '?')).join(', ')
        };
        if (o.base && o.base.label) x.residenza = o.base.label;
        if (o.skills.size) x.skill = Array.from(o.skills);
        if (o.commessaSettimana) x.commessa_settimana = o.commessaSettimana;
        if (o.dwDisponibile) x.doppia_week = 'disponibile (anche sabato)';
        if (inBozza[o.nome]) x.in_bozza = inBozza[o.nome].join(', ');
        return x;
      })
    };
  },

  spiega_cantiere(args) {
    const r = _apcRiga(args.rif);
    const b = _ap.bozza;
    if (!b || !b.ctx) return { error: 'bozza non calcolata o non aggiornata: chiama prima calcola_bozza' };
    if (!b.righeSolver.some(x => x.id === r.id)) return { error: r.cantiere + ' non è nel calcolo (escluso o incompleto)' };
    const d = apDiagnostica(b.ctx, b.righeSolver, b.risultato, r.id);
    const rs = d.riga;
    const ST = { ferie: 'ferie', dw: 'doppia week', occupato: 'già in Griglia', sabato: 'sabato non previsto' };
    return {
      cantiere: rs.cantiere, commessa: rs.commessa, priorita: 'P' + rs.priorita,
      esito: _apcEsitoPerAgente(b, r.id),
      stima: apFmtNum(rs.giorni) + ' gg × ' + rs.nOp + ' operatori — ' + rs.stimaFonte,
      localizzato: !!rs.geo,
      max_km_fra_cantieri: d.maxKm,
      attestati_richiesti: rs.attestati,
      per_giorno: d.giorni.map(g => {
        const o = { giorno: AP_GIORNI[g.giorno] };
        if (g.fuoriFinestra) o.fuori_finestra = 'giorno escluso da "dal" o giorni_esclusi';
        if (g.meteo) o.meteo = g.meteo;
        o.liberi = g.libero;
        const nd = Object.keys(g.stati).map(k => g.stati[k] + ' ' + (ST[k] || k));
        if (nd.length) o.non_disponibili = nd.join(', ');
        const scart = [];
        if (g.fuoriRaggio) scart.push(g.fuoriRaggio + ' oltre ' + d.maxKm + ' km dal cantiere precedente');
        if (g.attestati) scart.push(g.attestati + ' senza attestati');
        if (g.esclusiMano) scart.push(g.esclusiMano + ' esclusi a mano');
        if (scart.length) o.scartati = scart.join(', ');
        if (g.usatiQui) o.assegnati_qui = g.usatiQui;
        if (g.presiAltrove.length) o.vicini_presi_da_altri = g.presiAltrove.map(v => v.nome + (v.km != null ? ' (' + v.km + ' km)' : '') + ' → ' + v.cantieri.join(', ')).join('; ');
        if (g.restanoLiberi.length) o.idonei_rimasti_liberi = g.restanoLiberi.map(v => v.nome + (v.km != null ? ' (' + v.km + ' km)' : '')).join('; ');
        return o;
      }),
      nota: 'distanze indicative, misurate dalla residenza o dall\'ultima posizione in Griglia'
    };
  },

  aggiungi_cantieri(args) {
    const lista = Array.isArray(args.cantieri) ? args.cantieri : [];
    const aggiunti = [], scartati = [], avvisi = [];
    const visti = new Set(_ap.righe.map(r => _apNorm(r.cantiere) + '|' + _apNorm(r.commessa) + '|' + _apNorm(r.attivita)));
    lista.forEach(c => {
      try {
        if (!c || !String(c.cantiere || '').trim()) throw new Error('manca il cantiere');
        if (!String(c.commessa || '').trim()) throw new Error('manca la commessa');
        const commessa = _apcCommessa(c.commessa);
        const r = apNormRiga({
          cantiere: c.cantiere, commessa, attivita: c.attivita, km: c.km, giorni: c.giorni, nOp: c.operatori,
          priorita: parseInt(c.priorita, 10) || 3, scadenza: c.scadenza, dal: c.dal, note: c.note,
          giorniEsclusi: c.giorni_esclusi
        }, 'assistente');
        r.preferiti = _apcOperatori(c.preferiti, avvisi);
        r.esclusi = _apcOperatori(c.esclusi, avvisi).filter(n => !r.preferiti.includes(n));
        const k = _apNorm(r.cantiere) + '|' + _apNorm(r.commessa) + '|' + _apNorm(r.attivita);
        if (visti.has(k)) throw new Error('già in lista');
        visti.add(k);
        _ap.righe.push(r);
        aggiunti.push(r);
      } catch (e) {
        scartati.push((c && c.cantiere ? c.cantiere : '?') + ': ' + e.message);
      }
    });
    if (aggiunti.length) _apcAggiorna(aggiunti.map(r => r.id));
    return { aggiunti: aggiunti.map(r => r.id + ' ' + r.cantiere), scartati, avvisi, nota: aggiunti.length ? 'ricorda calcola_bozza' : undefined };
  },

  modifica_cantiere(args) {
    const r = _apcRiga(args.rif);
    const cambi = [], avvisi = [];
    const set = (campo, etichetta, nuovo, fmt) => {
      const f = fmt || (v => (v == null || v === '' || (Array.isArray(v) && !v.length) ? '—' : (Array.isArray(v) ? v.join(', ') : String(v))));
      if (JSON.stringify(r[campo]) === JSON.stringify(nuovo)) return;
      cambi.push(etichetta + ': ' + f(r[campo]) + ' → ' + f(nuovo));
      r[campo] = nuovo;
    };
    const has = k => Object.prototype.hasOwnProperty.call(args, k);
    if (has('cantiere') && String(args.cantiere).trim()) set('cantiere', 'cantiere', String(args.cantiere).trim());
    if (has('commessa')) set('commessa', 'commessa', _apcCommessa(args.commessa));
    if (has('attivita')) set('attivita', 'attività', String(args.attivita || '').trim());
    if (has('km')) set('km', 'km', _apNum(args.km));
    if (has('giorni')) { const g = _apNum(args.giorni); set('giorniManuali', 'giorni', g > 0 ? g : null, v => v > 0 ? apFmtNum(v) : 'stima'); }
    if (has('operatori')) { const n = _apNum(args.operatori); set('nOp', 'operatori', n ? Math.max(1, Math.round(n)) : null, v => v || 'stima'); }
    if (has('priorita')) { const p = parseInt(args.priorita, 10); if (p >= 1 && p <= 3) set('priorita', 'priorità', p, v => 'P' + v); }
    if (has('scadenza')) set('scadenza', 'scadenza', _apData(args.scadenza));
    if (has('dal')) set('dal', 'dal', _apData(args.dal));
    if (has('giorni_esclusi')) set('giorniEsclusi', 'mai di', _apGiorniLista(args.giorni_esclusi), v => _apcNomeGiorni(v) || '—');
    if (has('preferiti')) {
      const pref = _apcOperatori(args.preferiti, avvisi);
      set('preferiti', 'preferiti', pref);
      if (pref.length) r.esclusi = r.esclusi.filter(n => !pref.includes(n));
    }
    if (has('esclusi')) {
      const escl = _apcOperatori(args.esclusi, avvisi);
      set('esclusi', 'esclusi', escl);
      if (escl.length) r.preferiti = r.preferiti.filter(n => !escl.includes(n));
    }
    if (has('note')) set('note', 'note', String(args.note || '').trim());
    if (has('includi')) set('includi', 'incluso', !!args.includi, v => v ? 'sì' : 'no');
    if (cambi.length) _apcAggiorna([r.id]);
    return { cantiere: r.cantiere, modifiche: cambi.length ? cambi : ['nessuna: valori già così'], avvisi };
  },

  rimuovi_cantiere(args) {
    const r = _apcRiga(args.rif);
    _ap.righe = _ap.righe.filter(x => x !== r);
    _ap.precedenze = _ap.precedenze.filter(([x, y]) => x !== r.id && y !== r.id);
    _apcAggiorna([]);
    return { rimosso: r.cantiere };
  },

  importa_settimana_precedente() {
    const { prev, nuove } = _apRigheSettimanaPrecedente();
    if (!nuove.length) return { aggiunti: [], nota: 'la settimana ' + prev.week + ' non ha cantieri nuovi da riportare' };
    _ap.righe = _ap.righe.concat(nuove);
    _apcAggiorna(nuove.map(r => r.id));
    return { aggiunti: nuove.map(r => r.id + ' ' + r.cantiere + ' (' + r.commessa + ')'), nota: 'senza km: stima a 1 giorno finché non si indicano km o giorni' };
  },

  imposta_precedenza(args) {
    const a = _apcRiga(args.prima), c = _apcRiga(args.dopo);
    if (a === c) return { error: 'serve due cantieri diversi' };
    _ap.precedenze = _ap.precedenze.filter(([x, y]) => !(x === a.id && y === c.id) && !(x === c.id && y === a.id));
    if (args.attiva !== false) _ap.precedenze.push([a.id, c.id]);
    _apcAggiorna([a.id, c.id]);
    return { precedenza: a.cantiere + ' prima di ' + c.cantiere + (args.attiva === false ? ' (tolta)' : '') };
  },

  imposta_opzioni(args) {
    const cambi = [];
    if (typeof args.sabato === 'boolean' && args.sabato !== !!_ap.opzioni.sabato) { _ap.opzioni.sabato = args.sabato; cambi.push('sabato ' + (args.sabato ? 'sì' : 'no')); }
    if (typeof args.meteo === 'boolean' && args.meteo !== !!_ap.opzioni.meteo) { _ap.opzioni.meteo = args.meteo; cambi.push('meteo ' + (args.meteo ? 'considerato' : 'ignorato')); }
    const mk = parseInt(args.max_km, 10);
    if (mk >= 20 && mk <= 1000 && mk !== _ap.opzioni.maxKm) { _ap.opzioni.maxKm = mk; cambi.push('max ' + mk + ' km fra cantieri'); }
    if (cambi.length) _apcAggiorna([]);
    return { modifiche: cambi.length ? cambi : ['nessuna'] };
  },

  segnala_imprevisto(args) {
    const reg = args.registra_in_ferie;
    const imp = apNormImprevisto({
      tipo: args.tipo, operatore: args.operatore, cantiere: args.cantiere, giorni: args.giorni, motivo: args.motivo,
      registra: reg === 'ferie' || reg === 'non_disponibile' ? reg : ''
    });
    const x = _apImprevistoAggiungiNorm(imp);
    apRender();
    const colpite = apRiparaImpatto(_apCelleSettimana(pwGetWeekData()), [x], _apGiorniModificabili()).rimozioni;
    const out = {
      id: x.id, imprevisto: _apImprevistoTesto(x),
      celle_colpite: colpite.length ? colpite.map(c => AP_GIORNI[c.giorno] + ' ' + c.operatore + ' su ' + c.cantiere + ' (' + c.commessa + ')')
        : 'nessuna cella in Griglia nei giorni indicati',
      nota: 'segnala tutti gli imprevisti, poi chiama calcola_riparazione una volta'
    };
    if (imp.giorniPassati) out.avviso = 'giorni già passati ignorati: ' + _apcNomeGiorni(imp.giorniPassati);
    return out;
  },

  rimuovi_imprevisto(args) {
    const prima = _ap.imprevisti.length;
    if (args.tutti) _ap.imprevisti = [];
    else {
      const id = String(args.id || '').trim();
      if (!_ap.imprevisti.some(x => x.id === id)) return { error: 'imprevisto "' + id + '" non trovato. Presenti: ' + (_ap.imprevisti.map(x => x.id + ' ' + _apImprevistoTesto(x)).join('; ') || 'nessuno') };
      _ap.imprevisti = _ap.imprevisti.filter(x => x.id !== id);
    }
    _ap.riparazione = null;
    _apSalvaLocale();
    apRender();
    return { tolti: prima - _ap.imprevisti.length, restano: _ap.imprevisti.map(_apImprevistoTesto) };
  },

  async calcola_riparazione() {
    const res = await apCalcolaRiparazione({ silenzioso: true });
    if (!res || !res.ok) return { error: (res && res.errore) || 'calcolo non riuscito' };
    return _apcRiparazionePerAgente(_ap.riparazione);
  },

  async calcola_bozza() {
    const prima = _ap.bozza || _ap.ultimaBozza;
    const res = await apCalcola({ silenzioso: true });
    if (!res || !res.ok) return { error: (res && res.errore) || 'calcolo non riuscito' };
    const b = _ap.bozza;
    const out = { riepilogo: _apcRiepilogo(b), esiti: b.righeSolver.map(r => _apcEsitoPerAgente(b, r.id)).filter(Boolean) };
    if (b.risultato.suggerimenti.length) out.suggerimenti = APC_TOOLS.leggi_bozza().bozza.suggerimenti;
    if (prima) {
      const d = _apcDiffBozze(prima, b);
      out.rispetto_a_prima = d.righe.length ? d.righe.map(x => x.testo) : ['nessun cambio negli esiti'];
      out.celle = '+' + d.celleAggiunte + ' −' + d.celleTolte;
    }
    return out;
  }
};

/* ================= DIFFERENZE E ANNULLA ================= */

function _apcSnapshot() {
  return {
    righe: JSON.parse(JSON.stringify(_ap.righe)),
    opzioni: Object.assign({}, _ap.opzioni),
    precedenze: JSON.parse(JSON.stringify(_ap.precedenze)),
    bozza: _ap.bozza,
    imprevisti: JSON.parse(JSON.stringify(_ap.imprevisti)),
    riparazione: _ap.riparazione
  };
}

function _apcFirma() {
  return JSON.stringify([_ap.righe, _ap.opzioni, _ap.precedenze, _ap.bozza ? _ap.bozza.creata : 0,
    _ap.imprevisti, _ap.riparazione ? _ap.riparazione.creata : 0]);
}

function _apcCelle(b) {
  const s = new Set();
  if (b) b.risultato.assegnazioni.forEach(a => a.operatori.forEach(n => s.add(n + '|' + a.giorno + '|' + a.rigaId)));
  return s;
}

/* Esiti e celle fra due bozze, riga per riga */
function _apcDiffBozze(prima, dopo) {
  const out = { righe: [], celleAggiunte: 0, celleTolte: 0, nuove: new Set() };
  const cp = _apcCelle(prima), cd = _apcCelle(dopo);
  cd.forEach(k => { if (!cp.has(k)) { out.celleAggiunte++; out.nuove.add(k); } });
  cp.forEach(k => { if (!cd.has(k)) out.celleTolte++; });
  const ST = { assegnato: 'assegnato', parziale: 'parziale', non_assegnato: 'non assegnato' };
  dopo.righeSolver.forEach(r => {
    const a = prima && prima.risultato.esiti[r.id], b = dopo.risultato.esiti[r.id];
    if (!b) return;
    if (!a) { out.righe.push({ id: r.id, verso: b.stato === 'assegnato' ? 'su' : 'giu', testo: r.cantiere + ': ' + ST[b.stato] + ' (' + apFmtNum(b.giorniAssegnati) + '/' + apFmtNum(b.richiesti) + ' gg)' }); return; }
    const dg = b.giorniAssegnati - a.giorniAssegnati;
    if (a.stato === b.stato && Math.abs(dg) < 1e-6 && !!a.oltreScadenza === !!b.oltreScadenza) return;
    let t = r.cantiere + ': ';
    t += a.stato !== b.stato ? ST[a.stato] + ' → ' + ST[b.stato] : apFmtNum(a.giorniAssegnati) + ' → ' + apFmtNum(b.giorniAssegnati) + ' gg';
    if (b.oltreScadenza && !a.oltreScadenza) t += ' (oltre la scadenza)';
    if (!b.oltreScadenza && a.oltreScadenza) t += ' (ora entro la scadenza)';
    out.righe.push({ id: r.id, verso: dg > 1e-6 || (a.oltreScadenza && !b.oltreScadenza) ? 'su' : (dg < -1e-6 || (b.oltreScadenza && !a.oltreScadenza) ? 'giu' : 'pari'), testo: t });
  });
  return out;
}

/* Riassunto di cosa ha cambiato un turno: lista (righe/opzioni/precedenze) e bozza */
function _apcDiffTurno(snap) {
  const d = { lista: [], bozza: null, kpi: null };
  const primaById = {};
  snap.righe.forEach(r => { primaById[r.id] = r; });
  const oraIds = new Set(_ap.righe.map(r => r.id));
  _ap.righe.forEach(r => {
    const p = primaById[r.id];
    if (!p) { d.lista.push({ tipo: 'add', testo: r.cantiere + (r.commessa ? ' · ' + r.commessa : '') + ' · P' + r.priorita }); return; }
    const c = [];
    if (p.priorita !== r.priorita) c.push('P' + p.priorita + ' → P' + r.priorita);
    if (p.commessa !== r.commessa) c.push('commessa ' + r.commessa);
    if (p.attivita !== r.attivita) c.push('attività ' + (r.attivita || '—'));
    if (p.km !== r.km) c.push('km ' + (r.km == null ? '—' : apFmtNum(r.km)));
    if (p.giorniManuali !== r.giorniManuali) c.push(r.giorniManuali > 0 ? apFmtNum(r.giorniManuali) + ' gg a mano' : 'giorni da stima');
    if (p.nOp !== r.nOp) c.push((r.nOp || 'stima') + ' operatori');
    if (p.scadenza !== r.scadenza) c.push(r.scadenza ? 'entro ' + formatDate(new Date(r.scadenza + 'T00:00:00Z')) : 'senza scadenza');
    if (p.dal !== r.dal) c.push(r.dal ? 'dal ' + formatDate(new Date(r.dal + 'T00:00:00Z')) : 'senza "dal"');
    if (JSON.stringify(_apGiorniLista(p.giorniEsclusi)) !== JSON.stringify(_apGiorniLista(r.giorniEsclusi))) {
      const g = _apGiorniLista(r.giorniEsclusi);
      c.push(g.length ? 'mai di ' + _apcNomeGiorni(g) : 'tutti i giorni');
    }
    if (JSON.stringify(p.preferiti) !== JSON.stringify(r.preferiti)) c.push(r.preferiti.length ? 'preferiti ' + r.preferiti.map(n => n.split(' ')[0]).join(', ') : 'nessun preferito');
    if (JSON.stringify(p.esclusi) !== JSON.stringify(r.esclusi)) c.push(r.esclusi.length ? 'esclusi ' + r.esclusi.map(n => n.split(' ')[0]).join(', ') : 'nessun escluso');
    if (p.includi !== r.includi) c.push(r.includi ? 'di nuovo incluso' : 'escluso dal calcolo');
    if (p.cantiere !== r.cantiere) c.unshift('rinominato da ' + p.cantiere);
    if (c.length) d.lista.push({ tipo: 'mod', testo: r.cantiere + ': ' + c.join(', ') });
  });
  snap.righe.forEach(r => { if (!oraIds.has(r.id)) d.lista.push({ tipo: 'del', testo: r.cantiere }); });
  const op = [];
  if (!!snap.opzioni.sabato !== !!_ap.opzioni.sabato) op.push(_ap.opzioni.sabato ? 'anche sabato' : 'niente sabato');
  if (!!snap.opzioni.meteo !== !!_ap.opzioni.meteo) op.push(_ap.opzioni.meteo ? 'meteo considerato' : 'meteo ignorato');
  if (snap.opzioni.maxKm !== _ap.opzioni.maxKm) op.push('max ' + _ap.opzioni.maxKm + ' km fra cantieri');
  if (op.length) d.lista.push({ tipo: 'opz', testo: op.join(', ') });
  const k = p => p[0] + '>' + p[1];
  const pp = new Set(snap.precedenze.map(k)), po = new Set(_ap.precedenze.map(k));
  _ap.precedenze.forEach(p => { if (!pp.has(k(p))) d.lista.push({ tipo: 'prec', testo: _apNomeRiga(null, p[0]) + ' prima di ' + _apNomeRiga(null, p[1]) }); });
  snap.precedenze.forEach(p => { if (!po.has(k(p))) d.lista.push({ tipo: 'del', testo: 'precedenza ' + _apNomeRiga(null, p[0]) + ' → ' + _apNomeRiga(null, p[1]) }); });

  const impPrima = {};
  (snap.imprevisti || []).forEach(x => { impPrima[x.id] = x; });
  const impOra = new Set(_ap.imprevisti.map(x => x.id));
  _ap.imprevisti.forEach(x => {
    const p = impPrima[x.id];
    if (!p) d.lista.push({ tipo: 'add', testo: 'imprevisto: ' + _apImprevistoTesto(x) });
    else if (_apImprevistoTesto(p) !== _apImprevistoTesto(x)) d.lista.push({ tipo: 'mod', testo: 'imprevisto: ' + _apImprevistoTesto(x) });
  });
  (snap.imprevisti || []).forEach(x => { if (!impOra.has(x.id)) d.lista.push({ tipo: 'del', testo: 'imprevisto: ' + _apImprevistoTesto(x) }); });
  const rip = _ap.riparazione;
  if (rip && rip !== snap.riparazione) {
    const n = rip.risultato.assegnazioni.reduce((t, a) => t + a.operatori.length, 0);
    d.lista.push({ tipo: 'opz', testo: 'riparazione calcolata: −' + rip.impatto.rimozioni.length + ' / +' + n + ' celle' });
  }

  const b = _ap.bozza;
  if (b && b !== snap.bozza) {
    const db = _apcDiffBozze(snap.bozza, b);
    d.bozza = { righe: db.righe, piu: db.celleAggiunte, meno: db.celleTolte, confronto: !!snap.bozza };
    /* Celle da evidenziare nell'anteprima: solo se c'era una bozza con cui confrontare */
    b.nuove = snap.bozza ? db.nuove : null;
    const r1 = _apcRiepilogo(b), r0 = snap.bozza ? _apcRiepilogo(snap.bozza) : null;
    d.kpi = ['assegnati', 'parziali', 'non_assegnati'].map(key => ({ key, v: r1[key], delta: r0 ? r1[key] - r0[key] : null }));
  } else if (!b && snap.bozza && d.lista.length) {
    d.bozza = { daRicalcolare: true };
  }
  return (d.lista.length || d.bozza) ? d : null;
}

async function apcAnnulla(i) {
  const m = _apc.msgs[i];
  const top = _apc.undo[_apc.undo.length - 1];
  if (!m || !m.undo || !top || top.id !== m.undo || _apc.busy) return;
  if (_apcFirma() !== top.firmaDopo) {
    const ok = await showConfirmAsync('Dopo questa risposta la lista è stata modificata ancora. Annullando torna com\'era PRIMA della risposta e anche le modifiche successive andranno perse.', 'Annulla comunque');
    if (!ok) return;
  }
  const s = top.snap;
  _ap.righe = s.righe;
  _ap.opzioni = s.opzioni;
  _ap.precedenze = s.precedenze;
  _ap.bozza = s.bozza;
  if (_ap.bozza) _ap.bozza.nuove = null;
  _ap.imprevisti = s.imprevisti || [];
  _ap.riparazione = s.riparazione || null;
  _ap.toccate = new Set();
  _apc.undo.pop();
  m.annullato = true;
  /* Il modello deve saperlo, altrimenti al turno dopo ragiona sulla bozza che non c'è più */
  _apc.trascr.push({ role: 'user', text: '[Nota di sistema: l\'utente ha annullato tutte le modifiche della tua ultima risposta; la bozza è tornata allo stato precedente.]' });
  _apSalvaLocale();
  _apcSalva();
  apRender();
  apcRender();
}

/* ================= CICLO DELL'AGENTE ================= */

function _apcEtichetta(nome, args) {
  const nr = rif => { try { return _apcRiga(rif).cantiere; } catch (_) { return String(rif || '?'); } };
  switch (nome) {
    case 'leggi_bozza': return 'Leggo la bozza';
    case 'leggi_operatori': return 'Controllo le disponibilità' + (args && args.nome ? ' di ' + args.nome : (args && args.libero_il != null ? ' di ' + (AP_GIORNI[args.libero_il] || '') : ''));
    case 'spiega_cantiere': return 'Analizzo ' + nr(args && args.rif);
    case 'aggiungi_cantieri': { const n = (args && args.cantieri || []).length; return 'Aggiungo ' + (n === 1 ? args.cantieri[0].cantiere : n + ' cantieri'); }
    case 'modifica_cantiere': return 'Modifico ' + nr(args && args.rif);
    case 'rimuovi_cantiere': return 'Tolgo ' + nr(args && args.rif);
    case 'importa_settimana_precedente': return 'Riporto i cantieri della settimana precedente';
    case 'imposta_precedenza': return (args && args.attiva === false ? 'Tolgo la precedenza ' : 'Metto ') + nr(args && args.prima) + ' prima di ' + nr(args && args.dopo);
    case 'imposta_opzioni': return 'Aggiorno le opzioni';
    case 'calcola_bozza': return 'Ricalcolo la bozza';
    case 'segnala_imprevisto': return 'Segno ' + (args && args.tipo === 'cantiere_fermo' ? (args.cantiere || 'il cantiere') + ' fermo' : (args && args.operatore ? args.operatore : 'l\'operatore') + ' assente') +
      (args && args.giorni && args.giorni.length ? ' ' + _apcNomeGiorni(_apGiorniLista(args.giorni)) : '');
    case 'rimuovi_imprevisto': return args && args.tutti ? 'Tolgo tutti gli imprevisti' : 'Tolgo un imprevisto';
    case 'calcola_riparazione': return 'Cerco sostituti e recuperi';
    default: return nome;
  }
}

const APC_ICONA = {
  leggi_bozza: '📋', leggi_operatori: '👷', spiega_cantiere: '🔎', aggiungi_cantieri: '＋', modifica_cantiere: 'Δ',
  rimuovi_cantiere: '−', importa_settimana_precedente: '↩', imposta_precedenza: '⇅', imposta_opzioni: '⚙︎', calcola_bozza: '⟳',
  segnala_imprevisto: '⚡', rimuovi_imprevisto: '−', calcola_riparazione: '🔧'
};

/* Avanzamento del calcolo (da _apStatus): mostrato sotto il passo in corso */
function apcProgresso(msg) {
  const p = _apc.passoCorrente;
  if (!p || !_apc.busy) return;
  p.dettaglio = msg || '';
  const el = document.querySelector('[data-apc-passo="' + p.id + '"] .apc-passo-det');
  if (el) el.textContent = p.dettaglio;
}

async function apcInvia(testoForzato) {
  if (_apc.busy) return;
  const input = document.getElementById('apc-input');
  const testo = String(testoForzato != null ? testoForzato : (input ? input.value : '')).trim();
  if (!testo) return;
  if (!_apc.stato || _apc.stato.errore || !_apc.stato.enabled || _apc.stato.has_key === false) {
    await apcControllaStato(true);
    if (!_apc.stato || !_apc.stato.enabled || _apc.stato.has_key === false) return;
  }
  if (input && testoForzato == null) { input.value = ''; _apcAutoAltezza(input); }

  const anno = _ap.anno, week = _ap.week;
  _apc.msgs.push({ tipo: 'utente', testo, ts: Date.now() });
  _apc.trascr.push({ role: 'user', text: testo });
  const bolla = { tipo: 'agente', testo: '', passi: [], diff: null, undo: null, ts: Date.now() };
  _apc.msgs.push(bolla);
  const snap = _apcSnapshot();
  _ap.toccate = new Set();
  if (_ap.bozza) _ap.bozza.nuove = null;
  _apc.busy = true;
  _apc.stop = false;
  apRender();
  apcRender(true);

  let passi = 0;
  try {
    while (passi < APC_MAX_PASSI) {
      passi++;
      const { data, error } = await _sbClient.functions.invoke('ai-autoplan', {
        body: { action: 'step', anno, settimana: week, oggi: meteoTodayISO(), messages: _apc.trascr.slice(-APC_MAX_TRASCR) }
      });
      if (error) throw new Error(await _cpEdgeErr(error, 'ai-autoplan'));
      if (!data || data.error) throw new Error((data && data.error) || 'nessuna risposta');
      if (_ap.anno !== anno || _ap.week !== week) throw new Error('settimana cambiata durante la risposta: mi fermo');
      const m = data.message || {};
      const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
      if (!calls.length) {
        _apc.trascr.push({ role: 'assistant', text: m.text || '' });
        bolla.testo = m.text || 'Fatto.';
        break;
      }
      if (_apc.stop) break; // non si eseguono strumenti dopo "Ferma": la richiesta non entra in trascrizione
      _apc.trascr.push({ role: 'assistant', text: m.text || '', toolCalls: calls });
      if (m.text) bolla.passi.push({ id: 'n' + (++_apcSeq), nota: m.text });
      const risultati = [];
      for (const c of calls) {
        const passo = { id: 'p' + (++_apcSeq), nome: c.name, etichetta: _apcEtichetta(c.name, c.args || {}), stato: 'corso', dettaglio: '' };
        bolla.passi.push(passo);
        _apc.passoCorrente = passo;
        apcRender(true);
        let result;
        try {
          const fn = APC_TOOLS[c.name];
          if (!fn) throw new Error('strumento sconosciuto');
          result = await fn(c.args || {});
          if (result && result.error) { passo.stato = 'errore'; passo.dettaglio = result.error; }
          else { passo.stato = 'ok'; passo.dettaglio = _apcEsitoBreve(c.name, result); }
        } catch (e) {
          result = { error: e.message || String(e) };
          passo.stato = 'errore';
          passo.dettaglio = result.error;
        }
        _apc.passoCorrente = null;
        risultati.push({ id: c.id, name: c.name, result });
      }
      _apc.trascr.push({ role: 'tool', results: risultati });
      apcRender(true);
      if (_apc.stop) { bolla.testo = bolla.testo || 'Fermato su tua richiesta.'; break; }
    }
    if (!bolla.testo) bolla.testo = passi >= APC_MAX_PASSI
      ? 'Mi sono fermato dopo ' + APC_MAX_PASSI + ' passaggi: la richiesta forse va divisa in parti più piccole.'
      : 'Fermato su tua richiesta.';
  } catch (e) {
    bolla.errore = e.message || String(e);
    /* Una richiesta di strumenti rimasta senza risultati renderebbe invalida la trascrizione */
    const ult = _apc.trascr[_apc.trascr.length - 1];
    if (ult && ult.role === 'assistant' && ult.toolCalls && ult.toolCalls.length) _apc.trascr.pop();
  } finally {
    _apc.busy = false;
    _apc.stop = false;
    _apc.passoCorrente = null;
  }

  if (_ap.anno === anno && _ap.week === week) {
    bolla.diff = _apcDiffTurno(snap);
    if (bolla.diff) {
      bolla.undo = 'u' + (++_apcSeq);
      _apc.undo.push({ id: bolla.undo, snap, firmaDopo: _apcFirma() });
    }
  }
  _apc.trascr = _apc.trascr.slice(-APC_MAX_TRASCR);
  _apcSalva();
  apRender();
  apcRender(true);
  if (!bolla.errore && typeof aiLogHistory === 'function') aiLogHistory('[Auto-pianifica w' + week + '] ' + testo, bolla.testo);
}

function _apcEsitoBreve(nome, r) {
  if (!r) return '';
  if (nome === 'calcola_bozza' && r.riepilogo) {
    const x = r.riepilogo;
    return x.assegnati + ' assegnati · ' + x.parziali + ' parziali · ' + x.non_assegnati + ' non assegnati';
  }
  if (nome === 'aggiungi_cantieri') return (r.aggiunti.length ? r.aggiunti.length + ' aggiunti' : 'nessuno aggiunto') + (r.scartati.length ? ' · ' + r.scartati.length + ' scartati' : '');
  if (nome === 'modifica_cantiere') return (r.modifiche || []).join(' · ');
  if (nome === 'importa_settimana_precedente') return r.aggiunti.length ? r.aggiunti.length + ' cantieri' : (r.nota || '');
  if (nome === 'leggi_operatori') return r.totale + ' operatori';
  if (nome === 'leggi_bozza') return (r.cantieri || []).length + ' cantieri' + (r.bozza ? ' · bozza calcolata' : '');
  if (nome === 'spiega_cantiere' && r.esito) return r.esito.stato + ' ' + r.esito.giorni + ' gg';
  if (nome === 'imposta_precedenza') return r.precedenza || '';
  if (nome === 'imposta_opzioni') return (r.modifiche || []).join(', ');
  if (nome === 'segnala_imprevisto') return Array.isArray(r.celle_colpite) ? r.celle_colpite.length + ' celle colpite' : (r.celle_colpite || '');
  if (nome === 'rimuovi_imprevisto') return r.tolti + ' tolti';
  if (nome === 'calcola_riparazione') return '−' + r.celle_tolte + ' / +' + r.celle_nuove + ' celle';
  return '';
}

function apcFerma() { if (_apc.busy) { _apc.stop = true; apcRender(); } }

async function apcNuova() {
  if (_apc.busy) return;
  if (_apc.msgs.length) {
    const ok = await showConfirmAsync('Iniziare una nuova conversazione? La lista e la bozza restano come sono; si perde solo la cronologia della chat (e la possibilità di annullare le risposte).', 'Nuova conversazione');
    if (!ok) return;
  }
  _apc.msgs = [];
  _apc.trascr = [];
  _apc.undo = [];
  _ap.toccate = new Set();
  if (_ap.bozza) _ap.bozza.nuove = null;
  _apcSalva();
  apRender();
  apcRender();
}

/* "✦ Perché?" dall'elenco della bozza */
function apcPerche(el) {
  const id = el && el.dataset.apPerche;
  const b = _ap.bozza;
  const r = b && b.righeSolver.find(x => x.id === id);
  if (!r) return;
  const e = b.risultato.esiti[id];
  const cosa = e.stato === 'non_assegnato' ? 'non è assegnato' : (e.stato === 'parziale' ? 'è solo parziale' : 'finisce oltre la scadenza');
  if (!_apc.aperta) apcToggle(true);
  apcInvia('Perché ' + r.cantiere + ' ' + cosa + '? Cosa posso fare?');
}

function apcVediBozza(id) {
  const el = document.getElementById(id || 'ap-bozza-box');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('apc-flash');
  void el.offsetWidth;
  el.classList.add('apc-flash');
}

/* ================= RENDER ================= */

/* Suggerimenti di partenza, costruiti sullo stato reale della bozza */
function _apcSuggerimenti() {
  const out = [];
  const b = _ap.bozza;
  if (_ap.imprevisti.length && !_ap.riparazione) out.push('Calcola la riparazione e dimmi chi manca');
  else if (_ap.riparazione) out.push('Riepiloga la riparazione: chi sostituisce chi?');
  else {
    const mod = _apGiorniModificabili();
    const c = _apCelleSettimana(pwGetWeekData()).find(x => mod.includes(x.giorno));
    if (c) out.push(c.operatore + ' è in malattia ' + AP_GIORNI[c.giorno] + ': trova un sostituto');
  }
  if (!_ap.righe.length) {
    out.push('Riporta i cantieri della settimana precedente');
    const c = pwGetCommesseValide()[0];
    if (c) out.push('Aggiungi Ivrea per ' + c + ': 12 km di WO fognatura, P1 entro giovedì');
    out.push('Chi è libero tutta la settimana?');
    return out.slice(0, 4);
  }
  if (!b) {
    out.push('Calcola la bozza e dimmi cosa non torna');
    if (_ap.righe.some(r => r.scadenza)) out.push('Metti in P1 i cantieri con scadenza in questa settimana');
    out.push('Chi è libero tutta la settimana?');
    return out.slice(0, 4);
  }
  const es = b.righeSolver.map(r => ({ r, e: b.risultato.esiti[r.id] }));
  const ko = es.find(x => x.e.stato === 'non_assegnato') || es.find(x => x.e.stato === 'parziale');
  if (ko) out.push('Perché ' + ko.r.cantiere + ' ' + (ko.e.stato === 'non_assegnato' ? 'non è assegnato' : 'è parziale') + '?');
  if (es.some(x => x.r.priorita === 1 && x.e.stato !== 'assegnato')) out.push('Come faccio entrare tutti i P1?');
  if (b.risultato.suggerimenti.length) out.push('Conviene applicare i suggerimenti? Spiegami il costo');
  out.push('Riepiloga la bozza per squadra');
  if (!_ap.opzioni.sabato) out.push('Cosa cambia se lavoriamo anche sabato?');
  return out.slice(0, 4);
}

function _apcTempo(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function _apcPassiHtml(m, inCorso) {
  const passi = m.passi || [];
  if (!passi.length) return '';
  const nOk = passi.filter(p => !p.nota).length;
  const righe = passi.map(p => {
    if (p.nota) return '<div class="apc-nota">' + aiFormatMarkdown(p.nota) + '</div>';
    const ic = p.stato === 'corso' ? '<span class="apc-spin"></span>' : (p.stato === 'ok' ? '<span class="apc-ok">✓</span>' : '<span class="apc-ko">!</span>');
    return '<div class="apc-passo apc-passo-' + p.stato + '" data-apc-passo="' + _apE(p.id) + '">' + ic +
      '<div class="min-w-0"><div class="apc-passo-t"><span class="apc-passo-i">' + _apE(APC_ICONA[p.nome] || '•') + '</span>' + _apE(p.etichetta) + '</div>' +
      '<div class="apc-passo-det">' + _apE(p.dettaglio || '') + '</div></div></div>';
  }).join('');
  /* Durante il turno i passi sono aperti (si vede il lavoro); a fine turno si chiudono
     in una riga, riapribile. */
  return '<details class="apc-passi"' + (inCorso ? ' open' : '') + '><summary>' +
    (inCorso ? 'Sto lavorando…' : nOk + (nOk === 1 ? ' passaggio' : ' passaggi')) + '</summary>' + righe + '</details>';
}

function _apcDiffHtml(m, i) {
  const d = m.diff;
  if (!d) return '';
  const top = _apc.undo[_apc.undo.length - 1];
  const puoAnnullare = m.undo && top && top.id === m.undo && !_apc.busy;
  const TIPO = { add: ['＋', 'add'], mod: ['Δ', 'mod'], del: ['−', 'del'], opz: ['⚙︎', 'mod'], prec: ['⇅', 'mod'] };
  let html = '<div class="apc-diff' + (m.annullato ? ' annullato' : '') + '">' +
    '<div class="apc-diff-h"><span>' + (m.annullato ? '↶ Modifiche annullate' : 'Modifiche alla bozza') + '</span></div>';
  if (d.lista.length) {
    html += '<div class="apc-diff-list">' + d.lista.map(x => {
      const t = TIPO[x.tipo] || ['•', 'mod'];
      return '<div class="apc-diff-row"><span class="apc-diff-ic ' + t[1] + '">' + t[0] + '</span><span>' + _apE(x.testo) + '</span></div>';
    }).join('') + '</div>';
  }
  if (d.kpi) {
    const LBL = { assegnati: 'assegnati', parziali: 'parziali', non_assegnati: 'non assegnati' };
    const BUONO = { assegnati: 1, parziali: -1, non_assegnati: -1 };
    html += '<div class="apc-kpi">' + d.kpi.map(k => {
      let delta = '';
      if (k.delta) delta = '<span class="apc-delta ' + (k.delta * BUONO[k.key] > 0 ? 'su' : 'giu') + '">' + (k.delta > 0 ? '+' : '−') + Math.abs(k.delta) + '</span>';
      return '<div class="apc-kpi-c apc-kpi-' + k.key + '"><b>' + k.v + '</b>' + delta + '<small>' + LBL[k.key] + '</small></div>';
    }).join('') + '</div>';
  }
  if (d.bozza && d.bozza.righe && d.bozza.righe.length && d.bozza.confronto) {
    html += '<div class="apc-diff-list">' + d.bozza.righe.slice(0, 8).map(x =>
      '<div class="apc-diff-row"><span class="apc-diff-ic ' + (x.verso === 'su' ? 'add' : (x.verso === 'giu' ? 'del' : 'mod')) + '">' + (x.verso === 'su' ? '▲' : (x.verso === 'giu' ? '▼' : '•')) + '</span><span>' + _apE(x.testo) + '</span></div>').join('') +
      (d.bozza.righe.length > 8 ? '<div class="apc-diff-more">e altri ' + (d.bozza.righe.length - 8) + '</div>' : '') + '</div>';
  }
  if (d.bozza && d.bozza.confronto && (d.bozza.piu || d.bozza.meno)) {
    html += '<div class="apc-diff-celle">Celle in bozza: <b class="su">+' + d.bozza.piu + '</b> <b class="giu">−' + d.bozza.meno + '</b> · evidenziate nell\'anteprima</div>';
  }
  if (d.bozza && d.bozza.daRicalcolare) html += '<div class="apc-diff-celle">La bozza va ricalcolata per vedere l\'effetto.</div>';
  const b = _ap.bozza;
  const ultima = i === _apc.msgs.length - 1;
  html += '<div class="apc-diff-az">' +
    (puoAnnullare ? '<button type="button" data-apc="annulla" data-i="' + i + '" class="apc-btn">↶ Annulla</button>' : '') +
    (b && ultima && !m.annullato ? '<button type="button" data-apc="vedi" class="apc-btn">Vedi nella bozza</button>' : '') +
    (b && ultima && !m.annullato && b.risultato.assegnazioni.length ? '<button type="button" data-apc="applica" class="apc-btn primario" title="Scrive la bozza in Griglia (chiede conferma, annullabile)">✓ Applica alla Griglia</button>' : '') +
    (_ap.riparazione && ultima && !m.annullato ? '<button type="button" data-apc="vedi-rip" class="apc-btn">Vedi riparazione</button>' +
      '<button type="button" data-apc="applica-rip" class="apc-btn primario" title="Toglie le celle colpite e scrive sostituti e recuperi (chiede conferma, annullabile)">✓ Applica riparazione</button>' : '') +
    '</div></div>';
  return html;
}

function _apcMsgHtml(m, i) {
  if (m.tipo === 'utente') {
    return '<div class="apc-row apc-row-u"><div class="apc-u">' + _apE(m.testo).replace(/\n/g, '<br>') + '</div></div>';
  }
  const inCorso = _apc.busy && i === _apc.msgs.length - 1;
  let corpo = _apcPassiHtml(m, inCorso);
  if (inCorso && !(m.passi || []).length) corpo += '<div class="apc-pensa"><span class="ai-typing-dots"><span></span><span></span><span></span></span> Ci penso…</div>';
  if (m.testo) corpo += '<div class="apc-testo">' + aiFormatMarkdown(m.testo) + '</div>';
  if (m.errore) corpo += '<div class="apc-err"><b>Non sono riuscito a completare.</b> ' + _apE(m.errore) + '</div>';
  corpo += _apcDiffHtml(m, i);
  return '<div class="apc-row apc-row-a"><div class="apc-av" aria-hidden="true">✦</div><div class="apc-a">' + corpo +
    (m.ts && !inCorso ? '<div class="apc-ora">' + _apcTempo(m.ts) + '</div>' : '') + '</div></div>';
}

function _apcVuotoHtml() {
  return '<div class="apc-vuoto">' +
    '<div class="apc-vuoto-ic">✦</div>' +
    '<div class="apc-vuoto-t">Pianifichiamo la settimana ' + _apE(_ap.week) + '</div>' +
    '<div class="apc-vuoto-s">Dimmi cosa vuoi ottenere: aggiungo o modifico cantieri, cambio priorità e vincoli, ricalcolo e ti spiego il risultato.</div>' +
    '<ul class="apc-vuoto-l">' +
      '<li><b>«Brescia mai di venerdì»</b>: vincoli su giorni e date</li>' +
      '<li><b>«Rossi su Bergamo, non Verdi»</b>: operatori preferiti ed esclusi</li>' +
      '<li><b>«Perché Ivrea resta scoperto?»</b>: diagnosi con le cause</li>' +
    '</ul>' +
    '<div class="apc-vuoto-n">🔒 Lavoro solo sulla bozza: la Griglia cambia quando premi <b>Applica</b>.</div>' +
  '</div>';
}

let _apcInit = false;

function _apcCostruisci() {
  const panel = document.getElementById('apc-panel');
  if (!panel || _apcInit) return;
  _apcInit = true;
  panel.innerHTML =
    '<div class="apc-head">' +
      '<div class="apc-head-ic">✦</div>' +
      '<div class="min-w-0 flex-1"><div class="apc-head-t">Assistente pianificazione</div><div id="apc-sub" class="apc-head-s"></div></div>' +
      '<button type="button" data-apc="nuova" class="apc-ibtn" title="Nuova conversazione">⟲</button>' +
      '<button type="button" data-apc="chiudi" class="apc-ibtn" title="Chiudi">✕</button>' +
    '</div>' +
    '<div id="apc-msgs" class="apc-msgs" aria-live="polite"></div>' +
    '<div id="apc-chips" class="apc-chips"></div>' +
    '<div class="apc-comp">' +
      '<div id="apc-banner" class="apc-banner" style="display:none;"></div>' +
      '<div id="apc-box" class="apc-box">' +
        '<textarea id="apc-input" rows="1" placeholder="Chiedi o dai un\'istruzione…" aria-label="Messaggio all\'assistente"></textarea>' +
        '<button type="button" id="apc-send" data-apc="invia" class="apc-send" title="Invia (Invio)">↑</button>' +
      '</div>' +
      '<div class="apc-hint">Invio per mandare · Maiusc+Invio per andare a capo</div>' +
    '</div>';
  panel.addEventListener('click', _apcClick);
  const ta = document.getElementById('apc-input');
  ta.addEventListener('input', () => _apcAutoAltezza(ta));
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); apcInvia(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _apc.aperta && _apc.busy) apcFerma();
  });
}

function _apcAutoAltezza(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

function _apcClick(e) {
  const chip = e.target.closest('[data-apc-chip]');
  if (chip) { apcInvia(chip.dataset.apcChip); return; }
  const btn = e.target.closest('[data-apc]');
  if (!btn) return;
  const az = btn.dataset.apc;
  if (az === 'invia') { if (_apc.busy) apcFerma(); else apcInvia(); }
  else if (az === 'chiudi') apcToggle(false);
  else if (az === 'nuova') apcNuova();
  else if (az === 'annulla') apcAnnulla(parseInt(btn.dataset.i, 10));
  else if (az === 'vedi') apcVediBozza();
  else if (az === 'applica') apApplica().then(() => apcRender());
  else if (az === 'vedi-rip') apcVediBozza('ap-riparazione-box');
  else if (az === 'applica-rip') apApplicaRiparazione().then(() => apcRender());
  else if (az === 'riprova') apcControllaStato(true);
}

function _apcRenderComposer() {
  const banner = document.getElementById('apc-banner');
  const box = document.getElementById('apc-box');
  const send = document.getElementById('apc-send');
  const ta = document.getElementById('apc-input');
  const sub = document.getElementById('apc-sub');
  if (!banner || !box) return;
  const st = _apc.stato;
  let msg = '';
  if (!st) msg = '';
  else if (st.errore) msg = _apE(st.errore) + ' <button type="button" data-apc="riprova" class="apc-link">Riprova</button>';
  else if (!st.enabled) msg = 'L\'assistente AI è disattivato. ' + (sbIsAdmin() ? 'Attivalo in <b>Gestione Assistente AI</b> (menu admin).' : 'Chiedi a un amministratore di attivarlo.');
  else if (st.has_key === false) msg = 'Manca la API key per il provider scelto (' + _apE(st.provider || '') + '). ' + (sbIsAdmin() ? 'Inseriscila in <b>Gestione Assistente AI</b>.' : 'Chiedi a un amministratore.');
  banner.innerHTML = msg;
  banner.style.display = msg ? 'block' : 'none';
  const pronto = !!(st && st.enabled && !st.errore && st.has_key !== false);
  box.classList.toggle('disabled', !pronto);
  if (ta) ta.disabled = !pronto;
  if (send) {
    send.classList.toggle('stop', _apc.busy);
    send.textContent = _apc.busy ? '■' : '↑';
    send.title = _apc.busy ? 'Ferma (Esc)' : 'Invia (Invio)';
    send.disabled = !pronto;
  }
  if (sub) {
    const PROV = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', anthropic: 'Anthropic' };
    sub.textContent = 'Settimana ' + (_ap.week || '') + ' · ' + (_ap.anno || '') +
      (st && st.model ? ' · ' + (PROV[st.provider] ? PROV[st.provider] + ' ' : '') + st.model : '');
    sub.title = sub.textContent;
  }
}

function apcRender(scorri) {
  if (!_apc.aperta) return;
  _apcCostruisci();
  const box = document.getElementById('apc-msgs');
  if (!box) return;
  /* Si resta incollati in fondo solo se l'utente era già in fondo (non gli si strappa la
     lettura di un messaggio precedente) */
  const inFondo = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = _apc.msgs.length ? _apc.msgs.map(_apcMsgHtml).join('') : _apcVuotoHtml();
  if (scorri || inFondo) box.scrollTop = box.scrollHeight;
  const chips = document.getElementById('apc-chips');
  if (chips) {
    const pronto = _apc.stato && _apc.stato.enabled && !_apc.stato.errore && _apc.stato.has_key !== false;
    chips.innerHTML = !_apc.busy && pronto ? _apcSuggerimenti().map(t =>
      '<button type="button" class="apc-chip" data-apc-chip="' + _apE(t) + '">' + _apE(t) + '</button>').join('') : '';
  }
  _apcRenderComposer();
}

document.addEventListener('DOMContentLoaded', _apcSyncLayout);
