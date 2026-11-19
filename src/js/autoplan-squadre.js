/* ==================== AUTO-PIANIFICA · SQUADRE SETTIMANALI (modulo puro) ==================== */
/* Pianificazione a SQUADRE FISSE (since v18.288.0). Regole dell'ufficio:
   - una squadra lavora TUTTI i giorni della settimana (Lun–Ven, anche il sabato se
     richiesto): niente giorni senza cantiere finché c'è lavoro da fare;
   - giornate piene: un cantiere occupa giorni interi;
   - alla stessa squadra vanno più cantieri vicini fra loro (un "giro");
   - una squadra da 2+ deve avere un senior sul tipo di WO del lavoro, meglio senior+junior.
   Per questo il problema non si risolve cantiere per cantiere (come _apGreedy, che resta
   per la riparazione degli imprevisti) ma in quattro passi:
     1. QUANTE squadre: giorni-squadra richiesti ÷ giorni della settimana, nel limite degli
        operatori liberi TUTTA la settimana (chi ha ferie/celle in alcuni giorni resta fuori
        e viene elencato);
     2. GIRI: i cantieri (in ordine di priorità) vanno al giro più vicino con posto, poi si
        migliora spostando/scambiando cantieri fra i giri (vicinanza, stessa commessa, stesso
        tipo di WO, cantieri non spezzati);
     3. CHI va in ogni giro: squadra composta come nel greedy (km da casa, esperienza su
        commessa e attività, seniority sul tipo di WO, stessa partenza, rendimento), poi
        scambi di operatori fra squadre finché il totale migliora;
     4. ORDINE dei giorni di ogni squadra: tutte le permutazioni dei suoi cantieri (fino a
        AP_SQ_MAX_PERM), poi scambi di giorni: km, meteo, scadenze, "non prima di".
   Stesso formato di uscita di apRisolvi (assegnazioni, esiti, capacitaResidua…) più
   squadre[] e riepilogo, così bozza, chat, diagnosi e "Applica" restano invariati.
   Righe: come apRisolvi, più nSquadre (squadre in parallelo, default 1) e giorni = giorni
   di lavoro di OGNI squadra (giorni-squadra totali = nSquadre × giorni). Deterministico. */

const AP_SQ_APERTURA_KM = 120;   // un cantiere più lontano di così dai giri esistenti ne apre uno nuovo
const AP_SQ_MISTO_COMMESSA = 40; // km-equivalenti per ogni commessa in più nello stesso giro
const AP_SQ_MISTO_TIPO = 60;     // ... per ogni tipo di WO in più
const AP_SQ_SPEZZATO = 100;      // ... per un cantiere diviso fra due squadre
const AP_SQ_MAX_PERM = 7;        // fino a 7 cantieri per squadra si provano tutti gli ordini
const AP_SQ_MAX_MS = 2500;
const AP_SQ_FUORI_GIORNO = 5000; // un cantiere in un giorno non ammesso (allerta, prima del "dal"…)
const AP_SQ_FRATELLI = 2000;     // due delle N squadre chieste per un cantiere nello stesso giro (= stessa squadra)
const AP_SQ_ALLINEA = 30;        // per giorno in cui le N squadre di un cantiere non lavorano insieme
const AP_SQ_ATTESA = 5;          // giorno vuoto prima del lavoro: meglio lasciare liberi gli ultimi giorni
const AP_SQ_BUCO = 200;          // giorno vuoto IN MEZZO al giro: in trasferta è una giornata persa

/* ---------- VINCOLI dati dall'utente (anche a voce, tramite l'assistente) ----------
   ctx.vincoli = [{ tipo, a, b }]:
     insieme / separati            a, b = operatori        stessa squadra / squadre diverse
     operatore_cantiere            a = operatore, b = id riga   in una squadra che lavora quel cantiere
     operatore_limitato            a = operatore, b = [commesse] solo in giri di quelle commesse
     cantieri_insieme / cantieri_separati   a, b = id righe   stesso giro / giri diversi
   Sono penalità forti (AP_SQ_VINCOLO), non divieti assoluti: se due vincoli si
   contraddicono il calcolo sceglie il male minore e riepilogo.vincoli dice quale non regge. */
const AP_SQ_VINCOLO = 4000;

function _apSqKmFactory(ctx, distanze) {
  const memo = new Map();
  return (a, b) => {
    if (!a || !b) return null;
    const k = a.lat.toFixed(4) + ',' + a.lng.toFixed(4) + '>' + b.lat.toFixed(4) + ',' + b.lng.toFixed(4);
    if (memo.has(k)) return memo.get(k);
    let km = ctx.distanzaKm ? ctx.distanzaKm(a, b) : null;
    if (km != null) { if (distanze) distanze.stradali++; }
    else { if (distanze) distanze.stimate++; km = haversineKm(a.lat, a.lng, b.lat, b.lng) * AP_FATTORE_STRADA; }
    memo.set(k, km);
    return km;
  };
}

/* Punteggio di un operatore su un giro (pezzi = [{ r, giorni }]), voce per voce: è lo
   stesso numero che usa il calcolo e che "spiega squadra" mostra. null = non può andarci. */
function apSqVociOperatore(ctx, pesi, o, pezzi, kmTra, isoUltimo) {
  for (const p of pezzi) {
    if ((p.r.esclusi || []).includes(o.nome)) return { totale: null, escluso: 'escluso a mano da ' + p.r.cantiere };
    const manca = (p.r.attestati || []).filter(a => !o.attestatiValidi(a, isoUltimo));
    if (manca.length) return { totale: null, escluso: 'attestati mancanti per ' + p.r.cantiere + ': ' + manca.join(', ') };
  }
  const voci = {};
  const tot = pezzi.reduce((t, p) => t + p.giorni, 0) || 1;
  const geos = pezzi.map(p => p.r.geo).filter(Boolean);
  if (!o.base) { voci.residenza_mancante = -pesi.posizioneIgnota; }
  else if (geos.length) {
    const km = Math.min.apply(null, geos.map(x => kmTra(o.base, x)));
    voci.km_da_casa = Math.round(km);
    voci.punti_km = -Math.round(km * pesi.kmCosto);
  } else voci.punti_km = -60;
  let esp = 0, rend = 0, staff = 0, pref = 0;
  pezzi.forEach(p => {
    const w = p.giorni / tot;
    esp += apBonusEsperienza(o, p.r, ctx.modello, pesi) * w;
    rend += apBonusRendimento(o, p.r, pesi.rendimento) * w;
    if (o.staffing && o.staffing.has(p.r.commessa)) staff += pesi.staffing * w;
    if ((p.r.preferiti || []).includes(o.nome)) pref += 200 * w;
  });
  if (esp) voci.esperienza = Math.round(esp);
  if (rend) voci.rendimento = Math.round(rend);
  if (staff) voci.staffing_commessa = Math.round(staff);
  if (pref) voci.preferito = Math.round(pref);
  const totale = (voci.residenza_mancante || 0) + (voci.punti_km || 0) + esp + rend + staff + pref;
  return { totale, voci };
}

/* Vincoli che riguardano una squadra su un giro: penalità e testi delle violazioni */
function _apSqVincoliSquadra(vincoli, nomi, righeGiro) {
  let pen = 0;
  const violati = [];
  const ha = n => nomi.includes(n);
  (vincoli || []).forEach(v => {
    if (v.tipo === 'insieme' && ha(v.a) !== ha(v.b)) { pen += AP_SQ_VINCOLO / 2; violati.push(v); }
    else if (v.tipo === 'separati' && ha(v.a) && ha(v.b)) { pen += AP_SQ_VINCOLO; violati.push(v); }
    else if (v.tipo === 'operatore_cantiere') {
      if (ha(v.a) && !righeGiro.some(r => r.id === v.b)) { pen += AP_SQ_VINCOLO; violati.push(v); }
      else if (!ha(v.a) && righeGiro.some(r => r.id === v.b)) { pen += AP_SQ_VINCOLO / 2; violati.push(v); }
    } else if (v.tipo === 'operatore_limitato' && ha(v.a) && Array.isArray(v.b) &&
      righeGiro.some(r => !v.b.includes(r.commessa))) { pen += AP_SQ_VINCOLO; violati.push(v); }
  });
  return { pen, violati };
}

/* Valutazione completa di una squadra su un giro (stessa formula del calcolo) */
function apSqValutaSquadra(ctx, pesi, nomi, pezzi, kmTra, isoUltimo, opByNome) {
  const membri = {};
  let tot = 0;
  for (const n of nomi) {
    const v = apSqVociOperatore(ctx, pesi, opByNome[n], pezzi, kmTra, isoUltimo);
    if (v.totale == null) return { totale: null, escluso: n + ': ' + v.escluso };
    membri[n] = v;
    tot += v.totale;
  }
  const coppia = { storico: 0, stessa_partenza: 0 };
  for (let i = 0; i < nomi.length; i++) for (let j = i + 1; j < nomi.length; j++) {
    if (ctx.modello) {
      const k = nomi[i] < nomi[j] ? nomi[i] + '|||' + nomi[j] : nomi[j] + '|||' + nomi[i];
      coppia.storico += pesi.coppia * Math.min(ctx.modello.coppie[k] || 0, 10) / 10;
    }
    if (pesi.stessaPartenza && _apStessaPartenza(ctx, nomi[i], nomi[j])) coppia.stessa_partenza += pesi.stessaPartenza;
  }
  tot += coppia.storico + coppia.stessa_partenza;
  const giorniTot = pezzi.reduce((t, p) => t + p.giorni, 0) || 1;
  const seniority = [];
  if (nomi.length >= 2) {
    pezzi.forEach(p => {
      const w = p.giorni / giorniTot;
      const liv = nomi.map(n => apLivelloSeniority(opByNome[n], p.r.tipoWo));
      let pen = 0, esito = 'senior + junior';
      if (!liv.includes('senior')) { pen = pesi.soloJunior * w; esito = 'nessun senior' + (p.r.tipoWo ? ' su ' + p.r.tipoWo : ''); }
      else if (liv.every(x => x === 'senior')) { pen = pesi.soloSenior * w; esito = 'tutti senior'; }
      tot -= pen;
      seniority.push({ cantiere: p.r.cantiere, tipo_wo: p.r.tipoWo || '', livelli: nomi.map((n, i) => n + ': ' + (liv[i] || 'nessun livello')).join(', '), esito, punti: -Math.round(pen) });
    });
  }
  const skill = new Set();
  pezzi.forEach(p => (p.r.skills || []).forEach(k => skill.add(k)));
  let skillCoperte = 0;
  skill.forEach(k => { if (nomi.some(n => opByNome[n].skills && opByNome[n].skills.has(k))) skillCoperte++; });
  tot += skillCoperte * 80;
  const vinc = _apSqVincoliSquadra(ctx.vincoli, nomi, pezzi.map(p => p.r));
  tot -= vinc.pen;
  return { totale: tot, membri, coppia, seniority, skillCoperte, skillRichieste: skill.size, vincoliViolati: vinc.violati };
}

/* Esito di ogni vincolo sulla soluzione finale */
function _apSqVerificaVincoli(vincoli, squadre, righeById) {
  const squadraDi = {};
  squadre.forEach(sq => sq.operatori.forEach(n => { squadraDi[n] = sq; }));
  const righeDi = sq => new Set(Object.values(sq.piano).filter(Boolean));
  const nome = id => (righeById[id] ? righeById[id].cantiere : id);
  return (vincoli || []).map(v => {
    let ok = true, testo = '';
    const A = squadraDi[v.a], B = squadraDi[v.b];
    if (v.tipo === 'insieme') { testo = v.a + ' e ' + v.b + ' nella stessa squadra'; ok = (!A && !B) || (A && A === B); }
    else if (v.tipo === 'separati') { testo = v.a + ' e ' + v.b + ' in squadre diverse'; ok = !(A && A === B); }
    else if (v.tipo === 'operatore_cantiere') { testo = v.a + ' su ' + nome(v.b); ok = !!(A && righeDi(A).has(v.b)); }
    else if (v.tipo === 'operatore_limitato') {
      testo = v.a + ' solo su ' + (v.b || []).join(', ');
      ok = !A || Array.from(righeDi(A)).every(id => righeById[id] && (v.b || []).includes(righeById[id].commessa));
    } else if (v.tipo === 'cantieri_insieme' || v.tipo === 'cantieri_separati') {
      const insieme = squadre.some(sq => { const s = righeDi(sq); return s.has(v.a) && s.has(v.b); });
      testo = nome(v.a) + ' e ' + nome(v.b) + (v.tipo === 'cantieri_insieme' ? ' nello stesso giro' : ' in giri diversi');
      ok = v.tipo === 'cantieri_insieme' ? insieme : !insieme;
    }
    return { tipo: v.tipo, testo, rispettato: ok };
  });
}

function apPianificaSquadre(ctx, righe) {
  const t0 = Date.now();
  const pesi = Object.assign({}, AP_PESI_DEFAULT, ctx.pesi || {});
  const giorniSq = (ctx.giorni || []).filter(d => ctx.sabato || d <= 4);
  const nG = giorniSq.length;
  const opByNome = {};
  ctx.operatori.forEach(o => { opByNome[o.nome] = o; });
  const meteo = ctx.meteo || {};
  const distanze = { stradali: 0, stimate: 0 };
  const kmTra = _apSqKmFactory(ctx, distanze);
  const vincoli = ctx.vincoli || [];
  const kmCantieri = (a, b) => (a.geo && b.geo ? kmTra(a.geo, b.geo) : (a === b ? 0 : 60));
  const peso = r => AP_PESO_PRIORITA[r.priorita] || 1;

  /* ---- esiti iniziali ---- */
  const esiti = {};
  righe.forEach(r => {
    const N = Math.max(1, Math.round(r.nSquadre || 1));
    const G = Math.max(1, Math.ceil((r.giorni || 1) - 1e-9));
    esiti[r.id] = { stato: 'non_assegnato', motivi: [], giorniAssegnati: 0, richiesti: N * G, giorniUsati: [],
      kmMedi: null, avvisi: [], meteo: [], oltreScadenza: false, squadre: [] };
    if (!r.geo) esiti[r.id].avvisi.push('cantiere non localizzato: distanze non valutate');
  });
  const vuoto = extra => Object.assign({ assegnazioni: [], esiti, operatoriSuPiuCommesse: [], capacitaResidua: {},
    valore: 0, distanze, miglioramenti: [], suggerimenti: [], ordine: righe.map(r => r.id), ricalcoli: 0,
    squadre: [], riepilogo: { squadre: 0, giorniLiberi: 0, nonPianificati: 0, parziali: [], inutilizzati: 0 } }, extra || {});
  if (!nG) {
    righe.forEach(r => esiti[r.id].motivi.push('nessun giorno utile in settimana'));
    return vuoto();
  }
  const isoUltimo = ctx.giorniISO[giorniSq[nG - 1]];

  /* ---- 1. operatori liberi tutta la settimana ---- */
  const stato = (n, d) => ((ctx.disp[n] || {})[d]) || 'libero';
  const liberoSempre = o => giorniSq.every(d => stato(o.nome, d) === 'libero') &&
    !(o.fineRapporto && isoUltimo && o.fineRapporto < isoUltimo);
  const pool = ctx.operatori.filter(liberoSempre).map(o => o.nome);
  const parziali = ctx.operatori.filter(o => !liberoSempre(o) && giorniSq.some(d => stato(o.nome, d) === 'libero')).map(o => o.nome);

  /* ---- lavori: nSquadre lavori da G giorni per riga, giorni ammessi per ciascuno ---- */
  const ordine = apApplicaPrecedenze(apOrdineBase(righe), ctx.precedenze);
  const lavori = [];
  const residuoSettimana = {};
  ordine.forEach((r, idx) => {
    const N = Math.max(1, Math.round(r.nSquadre || 1));
    const G = Math.max(1, Math.ceil((r.giorni || 1) - 1e-9));
    const M = meteo[r.id] || {};
    const ammessi = giorniSq.filter(d => d >= (r.dalGiorno || 0) && !(r.giorniEsclusi || []).includes(d) && !(M[d] && M[d].blocco));
    const bloccati = giorniSq.filter(d => M[d] && M[d].blocco);
    if (bloccati.length) esiti[r.id].avvisi.push('evitati per allerta meteo: ' + bloccati.map(d => AP_GIORNI[d] + ' (' + M[d].motivo + ')').join(', '));
    for (let i = 0; i < N; i++) {
      const gg = Math.min(G, ammessi.length);
      if (G > gg) residuoSettimana[r.id] = (residuoSettimana[r.id] || 0) + (G - gg);
      if (gg > 0) lavori.push({ id: r.id + '#' + i, r, giorni: gg, ordine: idx, ammessi: new Set(ammessi), nOp: Math.max(1, r.nOp || 2), nSq: N });
    }
    if (!ammessi.length) esiti[r.id].motivi.push('nessun giorno utile (vincoli "non prima di"/giorni esclusi/allerte)');
  });

  /* ---- costo di un giro (indice di compattezza, in km-equivalenti) ---- */
  const costoGiro = pezzi => {
    if (!pezzi.length) return 0;
    // giro "nearest neighbour" dal pezzo più grande: approssima i km fra un cantiere e l'altro
    const resto = pezzi.slice().sort((a, b) => b.giorni - a.giorni || (a.lavoro.id < b.lavoro.id ? -1 : 1));
    let cur = resto.shift();
    let km = 0;
    while (resto.length) {
      let bi = 0, bk = Infinity;
      resto.forEach((p, i) => { const k = kmCantieri(cur.lavoro.r, p.lavoro.r); if (k < bk) { bk = k; bi = i; } });
      km += bk;
      cur = resto.splice(bi, 1)[0];
    }
    const commesse = new Set(pezzi.map(p => p.lavoro.r.commessa));
    const tipi = new Set(pezzi.map(p => p.lavoro.r.tipoWo || ''));
    const righeNelGiro = pezzi.map(p => p.lavoro.r.id);
    const fratelli = righeNelGiro.length - new Set(righeNelGiro).size;
    const ids = new Set(righeNelGiro);
    let vinc = 0;
    vincoli.forEach(v => {
      if (v.tipo === 'cantieri_separati' && ids.has(v.a) && ids.has(v.b)) vinc += AP_SQ_VINCOLO;
      if (v.tipo === 'cantieri_insieme' && ids.has(v.a) !== ids.has(v.b)) vinc += AP_SQ_VINCOLO / 2;
    });
    return km + (commesse.size - 1) * AP_SQ_MISTO_COMMESSA + (tipi.size - 1) * AP_SQ_MISTO_TIPO + fratelli * AP_SQ_FRATELLI + vinc;
  };
  const usati = g => g.pezzi.reduce((t, p) => t + p.giorni, 0);
  const spezzati = giri => {
    const dove = {};
    giri.forEach((g, gi) => g.pezzi.forEach(p => { (dove[p.lavoro.id] = dove[p.lavoro.id] || new Set()).add(gi); }));
    return Object.values(dove).reduce((t, s) => t + (s.size - 1), 0);
  };
  const costoTotale = giri => giri.reduce((t, g) => t + costoGiro(g.pezzi), 0) + spezzati(giri) * AP_SQ_SPEZZATO;

  const assegnazioni = [];
  const squadre = [];
  const viaggioRiga = {};   // rigaId -> giornate perse per il viaggio da casa
  const nonPianificati = {};
  const cap = {};
  ctx.operatori.forEach(o => { cap[o.nome] = {}; (ctx.giorni || []).forEach(d => { cap[o.nome][d] = stato(o.nome, d) === 'libero' ? 1 : 0; }); });
  const liberi = new Set(pool);
  let valore = 0;
  let giorniLiberiTot = 0;

  /* Classi per persone per squadra (2, 1…): si comincia da quella con più lavoro pesato */
  const classi = {};
  lavori.forEach(l => { (classi[l.nOp] = classi[l.nOp] || []).push(l); });
  const ordineClassi = Object.keys(classi).map(Number).sort((a, b) => {
    const v = s => classi[s].reduce((t, l) => t + l.giorni * peso(l.r), 0);
    return v(b) - v(a) || b - a;
  });

  ordineClassi.forEach(s => {
    const lav = classi[s];
    const W = lav.reduce((t, l) => t + l.giorni, 0);
    const K = Math.min(Math.ceil(W / nG), Math.floor(liberi.size / s));
    if (K <= 0) {
      lav.forEach(l => {
        nonPianificati[l.r.id] = (nonPianificati[l.r.id] || 0) + l.giorni;
        const m = 'nessuna squadra da ' + s + ' libera tutta la settimana (' + liberi.size + ' operatori liberi tutti i giorni)';
        if (!esiti[l.r.id].motivi.includes(m)) esiti[l.r.id].motivi.push(m);
      });
      return;
    }

    /* ---- 2. giri ---- */
    const giri = [];
    for (let k = 0; k < K; k++) giri.push({ pezzi: [] });
    /* A parità di priorità entrano prima i cantieri con più squadre: le N squadre devono finire in giri diversi, e se gli altri cantieri hanno già occupato i posti non ci riescono più */
    lav.slice().sort((a, b) => (a.r.priorita || 3) - (b.r.priorita || 3) || b.nSq - a.nSq || a.ordine - b.ordine || b.giorni - a.giorni).forEach(l => {
      let resto = l.giorni;
      while (resto > 0) {
        let best = null;
        giri.forEach(g => {
          const libero = nG - usati(g);
          if (libero <= 0) return;
          let c;
          if (!g.pezzi.length) c = AP_SQ_APERTURA_KM;
          else {
            c = Math.min.apply(null, g.pezzi.map(p => kmCantieri(p.lavoro.r, l.r)));
            if (!g.pezzi.some(p => p.lavoro.r.commessa === l.r.commessa)) c += AP_SQ_MISTO_COMMESSA;
            if (!g.pezzi.some(p => (p.lavoro.r.tipoWo || '') === (l.r.tipoWo || ''))) c += AP_SQ_MISTO_TIPO;
          }
          if (libero < resto) c += AP_SQ_SPEZZATO;
          if (g.pezzi.some(p => p.lavoro.r === l.r && p.lavoro !== l)) c += AP_SQ_FRATELLI;
          vincoli.forEach(v => {
            if (v.tipo !== 'cantieri_insieme' && v.tipo !== 'cantieri_separati') return;
            const altro = v.a === l.r.id ? v.b : (v.b === l.r.id ? v.a : null);
            if (!altro || !g.pezzi.some(p => p.lavoro.r.id === altro)) return;
            c += v.tipo === 'cantieri_separati' ? AP_SQ_VINCOLO : -AP_SQ_APERTURA_KM * 2;
          });
          if (!best || c < best.c - 1e-9) best = { g, c, libero };
        });
        if (!best) break;
        const gg = Math.min(resto, best.libero);
        const gia = best.g.pezzi.find(p => p.lavoro === l);
        if (gia) gia.giorni += gg; else best.g.pezzi.push({ lavoro: l, giorni: gg });
        resto -= gg;
      }
      if (resto > 0) {
        nonPianificati[l.r.id] = (nonPianificati[l.r.id] || 0) + resto;
        const m = 'squadre piene con cantieri a priorità più alta: ' + apFmtNum(resto) + ' gg-squadra non pianificati';
        esiti[l.r.id].motivi.push(m);
      }
    });

    /* miglioramento dei giri: sposta un pezzo, o scambia due pezzi, se il costo scende */
    const unisci = g => {
      const m = new Map();
      g.pezzi.forEach(p => { if (m.has(p.lavoro)) m.get(p.lavoro).giorni += p.giorni; else m.set(p.lavoro, { lavoro: p.lavoro, giorni: p.giorni }); });
      g.pezzi = Array.from(m.values());
    };
    let attuale = costoTotale(giri);
    let migliora = true;
    while (migliora && Date.now() - t0 < AP_SQ_MAX_MS * 0.4) {
      migliora = false;
      for (let a = 0; a < giri.length && !migliora; a++) {
        for (let pi = 0; pi < giri[a].pezzi.length && !migliora; pi++) {
          const p = giri[a].pezzi[pi];
          for (let b = 0; b < giri.length && !migliora; b++) {
            if (b === a) continue;
            // sposta
            if (nG - usati(giri[b]) >= p.giorni) {
              const prima = [giri[a].pezzi, giri[b].pezzi];
              giri[a].pezzi = prima[0].filter(x => x !== p);
              giri[b].pezzi = prima[1].concat([{ lavoro: p.lavoro, giorni: p.giorni }]);
              unisci(giri[b]);
              const c = costoTotale(giri);
              if (c < attuale - 1) { attuale = c; migliora = true; break; }
              giri[a].pezzi = prima[0]; giri[b].pezzi = prima[1];
            }
            // scambia
            for (let qi = 0; qi < giri[b].pezzi.length && !migliora; qi++) {
              const q = giri[b].pezzi[qi];
              if (q.lavoro === p.lavoro) continue;
              if (usati(giri[a]) - p.giorni + q.giorni > nG || usati(giri[b]) - q.giorni + p.giorni > nG) continue;
              const prima = [giri[a].pezzi, giri[b].pezzi];
              giri[a].pezzi = prima[0].filter(x => x !== p).concat([{ lavoro: q.lavoro, giorni: q.giorni }]);
              giri[b].pezzi = prima[1].filter(x => x !== q).concat([{ lavoro: p.lavoro, giorni: p.giorni }]);
              unisci(giri[a]); unisci(giri[b]);
              const c = costoTotale(giri);
              if (c < attuale - 1) { attuale = c; migliora = true; break; }
              giri[a].pezzi = prima[0]; giri[b].pezzi = prima[1];
            }
          }
        }
      }
    }

    /* ---- 3. chi va in ogni giro ---- */
    const giorniGiro = g => usati(g) || 1;
    const pezziDi = g => g.pezzi.map(p => ({ r: p.lavoro.r, giorni: p.giorni }));
    const individuale = (nome, g) => apSqVociOperatore(ctx, pesi, opByNome[nome], pezziDi(g), kmTra, isoUltimo).totale;
    const valutaSquadra = (nomi, g) => apSqValutaSquadra(ctx, pesi, nomi, pezziDi(g), kmTra, isoUltimo, opByNome).totale;
    const pesoGiro = g => g.pezzi.reduce((t, p) => t + p.giorni * peso(p.lavoro.r) + (p.lavoro.r.scadenzaGiorno != null ? 1 : 0), 0);
    const giriAttivi = giri.filter(g => g.pezzi.length).sort((a, b) => pesoGiro(b) - pesoGiro(a));
    giriAttivi.forEach(g => {
      const cand = Array.from(liberi).filter(n => individuale(n, g) != null);
      if (cand.length < s) { g.squadra = null; return; }
      const indiv = {};
      cand.forEach(n => { indiv[n] = individuale(n, g); });
      const semi = cand.slice().sort((a, b) => indiv[b] - indiv[a] || (a < b ? -1 : 1)).slice(0, s > 1 ? Math.max(AP_SEMI_SQUADRA, 6) : 1);
      let migliore = null;
      semi.forEach(seme => {
        const nomi = [seme];
        while (nomi.length < s) {
          let bn = null, bv = -Infinity;
          cand.forEach(n => {
            if (nomi.includes(n)) return;
            const v = valutaSquadra(nomi.concat([n]), g);
            if (v != null && (v > bv || (v === bv && bn && n < bn))) { bv = v; bn = n; }
          });
          if (!bn) break;
          nomi.push(bn);
        }
        if (nomi.length < s) return;
        const v = valutaSquadra(nomi, g);
        if (v != null && (!migliore || v > migliore.v + 1e-9)) migliore = { nomi, v };
      });
      if (!migliore) { g.squadra = null; return; }
      g.squadra = migliore.nomi;
      migliore.nomi.forEach(n => liberi.delete(n));
    });

    /* scambi di operatori fra squadre (e con chi è rimasto libero) se il totale sale */
    const conSquadra = giriAttivi.filter(g => g.squadra);
    const totale = () => conSquadra.reduce((t, g) => t + (valutaSquadra(g.squadra, g) || -1e9), 0);
    let tot = totale();
    migliora = true;
    while (migliora && Date.now() - t0 < AP_SQ_MAX_MS * 0.8) {
      migliora = false;
      for (let a = 0; a < conSquadra.length && !migliora; a++) {
        const A = conSquadra[a];
        for (let i = 0; i < A.squadra.length && !migliora; i++) {
          const x = A.squadra[i];
          // con un libero
          for (const u of Array.from(liberi)) {
            A.squadra[i] = u;
            const v = totale();
            if (v > tot + 1) { tot = v; liberi.delete(u); liberi.add(x); migliora = true; break; }
            A.squadra[i] = x;
          }
          if (migliora) break;
          // con un membro di un'altra squadra
          for (let b = a + 1; b < conSquadra.length && !migliora; b++) {
            const B = conSquadra[b];
            for (let j = 0; j < B.squadra.length; j++) {
              const y = B.squadra[j];
              A.squadra[i] = y; B.squadra[j] = x;
              const v = totale();
              if (v > tot + 1) { tot = v; migliora = true; break; }
              A.squadra[i] = x; B.squadra[j] = y;
            }
          }
        }
      }
    }

    /* giri senza squadra: il loro lavoro non è pianificato */
    giriAttivi.filter(g => !g.squadra).forEach(g => g.pezzi.forEach(p => {
      nonPianificati[p.lavoro.r.id] = (nonPianificati[p.lavoro.r.id] || 0) + p.giorni;
      const m = 'nessuna squadra da ' + s + ' componibile per questo giro (esclusi, attestati o operatori finiti)';
      if (!esiti[p.lavoro.r.id].motivi.includes(m)) esiti[p.lavoro.r.id].motivi.push(m);
    }));

    /* ---- 4. ordine dei giorni di ogni squadra ---- */
    const giorniRiga = {};   // rigaId -> Set(giorni) già fissati da altre squadre (per allineare le N squadre)
    conSquadra.forEach(g => {
      const membri = g.squadra.map(n => opByNome[n]);
      const pezzi = g.pezzi.slice();
      const costoGiorni = arr => {
        let c = 0;
        let prec = null;
        let partito = false;
        arr.forEach((p, i) => {
          const d = giorniSq[i];
          if (!p) { if (!partito) c += AP_SQ_ATTESA * (nG - i); return; }
          const r = p.lavoro.r;
          const altri = giorniRiga[r.id];
          if (p.lavoro.nSq > 1 && altri && altri.size && !altri.has(d)) c += AP_SQ_ALLINEA;
          if (!p.lavoro.ammessi.has(d)) c += AP_SQ_FUORI_GIORNO;
          const mt = (meteo[r.id] || {})[d];
          if (mt && mt.pen) c += mt.pen;
          if (r.scadenzaGiorno != null && d > r.scadenzaGiorno) c += pesi.ritardoGiorno * peso(r);
          if (!partito) membri.forEach(o => { const k = o.base && r.geo ? kmTra(o.base, r.geo) : null; c += k == null ? 60 : k * pesi.kmCosto; });
          else if (prec && prec !== p) {
            const k = kmCantieri(prec.lavoro.r, r);
            c += k * membri.length * pesi.kmCosto;
            if (k > pesi.maxKmTrasferta) c += 300;
            // tornare su un cantiere già lasciato costa un trasferimento in più
            if (arr.slice(0, i).includes(p)) c += 80;
          }
          prec = p;
          partito = true;
        });
        /* giorni vuoti fra il primo e l'ultimo giorno di lavoro */
        const primo = arr.findIndex(Boolean);
        let ultimo = -1;
        arr.forEach((p, i) => { if (p) ultimo = i; });
        for (let i = primo + 1; i < ultimo; i++) if (!arr[i]) c += AP_SQ_BUCO;
        return c;
      };
      const espandi = ord => { const arr = []; ord.forEach(p => { for (let k = 0; k < p.giorni; k++) arr.push(p); }); while (arr.length < nG) arr.push(null); return arr; };
      let migliore = null;
      if (pezzi.length <= AP_SQ_MAX_PERM) {
        const perm = (resto, pref) => {
          if (!resto.length) {
            const arr = espandi(pref);
            const c = costoGiorni(arr);
            if (!migliore || c < migliore.c - 1e-9) migliore = { arr, c };
            return;
          }
          resto.forEach((p, i) => perm(resto.slice(0, i).concat(resto.slice(i + 1)), pref.concat([p])));
        };
        perm(pezzi, []);
      } else {
        // tanti cantieri: dal più vicino a casa, poi il più vicino al precedente
        const resto = pezzi.slice();
        const ord = [];
        let cur = null;
        while (resto.length) {
          let bi = 0, bk = Infinity;
          resto.forEach((p, i) => {
            const k = cur ? kmCantieri(cur.lavoro.r, p.lavoro.r)
              : membri.reduce((t, o) => t + (o.base && p.lavoro.r.geo ? kmTra(o.base, p.lavoro.r.geo) : 60), 0);
            if (k < bk) { bk = k; bi = i; }
          });
          cur = resto.splice(bi, 1)[0];
          ord.push(cur);
        }
        const arr = espandi(ord);
        migliore = { arr, c: costoGiorni(arr) };
      }
      // scambi di giorni (anche spezzando un cantiere attorno a un giorno di pioggia)
      let arr = migliore.arr, c0 = migliore.c, ok = true;
      while (ok) {
        ok = false;
        for (let i = 0; i < nG && !ok; i++) for (let j = i + 1; j < nG && !ok; j++) {
          if (arr[i] === arr[j]) continue;
          const t = arr.slice(); t[i] = arr[j]; t[j] = arr[i];
          const c = costoGiorni(t);
          if (c < c0 - 1) { arr = t; c0 = c; ok = true; }
        }
      }
      g.giorni = arr;
      arr.forEach((p, i) => { if (p) (giorniRiga[p.lavoro.r.id] = giorniRiga[p.lavoro.r.id] || new Set()).add(giorniSq[i]); });
    });

    /* ---- uscita per questa classe ---- */
    conSquadra.forEach(g => {
      const id = 'S' + (squadre.length + 1);
      const membri = g.squadra.map(n => opByNome[n]);
      const avvisi = [];
      const piano = {};
      let kmSettimana = 0;
      let prec = null;
      let partito = false;
      g.giorni.forEach((p, i) => {
        const d = giorniSq[i];
        if (!p) { piano[d] = null; return; }
        const r = p.lavoro.r;
        piano[d] = r.id;
        const a = { rigaId: r.id, giorno: d, operatori: g.squadra.slice(), quota: 1, squadra: id };
        let prod = 1;
        if (!partito) {
          partito = true;
          const viaggiatori = membri.filter(o => o.base && r.geo && kmTra(o.base, r.geo) > pesi.kmViaggioMezzaGiornata);
          membri.forEach(o => { if (o.base && r.geo) kmSettimana += kmTra(o.base, r.geo); });
          if (viaggiatori.length) {
            a.viaggio = viaggiatori.map(o => o.nome);
            prod = 0.5;
            a.produttivo = 0.5;
            viaggioRiga[r.id] = (viaggioRiga[r.id] || 0) + 0.5;
            esiti[r.id].avvisi.push('viaggio da casa, mezza giornata produttiva: ' + AP_GIORNI[d] + ' ' +
              viaggiatori.map(o => o.nome + ' (' + Math.round(kmTra(o.base, r.geo)) + ' km da casa)').join(', '));
          }
        } else if (prec && prec !== p) {
          const k = kmCantieri(prec.lavoro.r, r);
          kmSettimana += k * membri.length;
          if (k > pesi.maxKmTrasferta) avvisi.push(AP_GIORNI[d] + ': ' + Math.round(k) + ' km dal cantiere precedente (oltre ' + pesi.maxKmTrasferta + ')');
        }
        if (!p.lavoro.ammessi.has(d)) avvisi.push(AP_GIORNI[d] + ' su ' + r.cantiere + ' in un giorno non ammesso (allerta o vincolo): nessuna alternativa nel giro');
        const mt = (meteo[r.id] || {})[d];
        if (mt && mt.pen > 0) esiti[r.id].meteo.push(AP_GIORNI[d] + ': ' + mt.motivo);
        assegnazioni.push(a);
        const e = esiti[r.id];
        membri.forEach(o => {
          const ri = apIndiceRendimento(o, r);
          const R = e.rendimento || (e.rendimento = { somma: 0, noti: 0, totali: 0, medio: 0 });
          R.totali++;
          if (ri) { R.somma += ri.indice; R.noti++; }
        });
        e.giorniAssegnati += prod;
        if (!e.giorniUsati.includes(d)) e.giorniUsati.push(d);
        if (!e.squadre.includes(id)) e.squadre.push(id);
        valore += prod * pesi.giornoFatto * peso(r);
        g.squadra.forEach(n => { cap[n][d] = 0; });
        prec = p;
      });
      const liberiGg = giorniSq.filter(d => piano[d] == null);
      giorniLiberiTot += liberiGg.length;
      if (liberiGg.length) avvisi.push('senza cantiere: ' + liberiGg.map(d => AP_GIORNI[d]).join(', ') + ' — aggiungi cantieri vicini per riempire la settimana');
      // seniority per tipo di WO del giro
      const tipi = new Set(g.pezzi.map(p => p.lavoro.r.tipoWo || ''));
      if (g.squadra.length >= 2) tipi.forEach(t => {
        const liv = membri.map(o => apLivelloSeniority(o, t));
        if (!liv.includes('senior')) {
          const msg = 'nessun senior' + (t ? ' su ' + t : '') + ' in squadra';
          avvisi.push(msg);
          g.pezzi.filter(p => (p.lavoro.r.tipoWo || '') === t).forEach(p => {
            const m2 = msg + ' (' + id + ': ' + g.squadra.join(' + ') + ')';
            if (!esiti[p.lavoro.r.id].avvisi.includes(m2)) esiti[p.lavoro.r.id].avvisi.push(m2);
          });
        }
      });
      const senzaCasa = membri.filter(o => !o.base).map(o => o.nome);
      if (senzaCasa.length) avvisi.push('residenza mancante in anagrafica: ' + senzaCasa.join(', ') + ' (km da casa non valutati)');
      const skill = new Set();
      g.pezzi.forEach(p => (p.lavoro.r.skills || []).forEach(k => skill.add(k)));
      const mancanti = Array.from(skill).filter(k => !membri.some(o => o.skills && o.skills.has(k)));
      if (mancanti.length) g.pezzi.forEach(p => {
        const m = 'skill non coperte: ' + mancanti.filter(k => (p.lavoro.r.skills || []).includes(k)).join(', ');
        if (m !== 'skill non coperte: ' && !esiti[p.lavoro.r.id].avvisi.includes(m)) esiti[p.lavoro.r.id].avvisi.push(m);
      });
      valore -= kmSettimana * pesi.kmCosto;
      squadre.push({ id, nome: 'Squadra ' + (squadre.length + 1), operatori: g.squadra.slice(), persone: s,
        piano, kmSettimana: Math.round(kmSettimana), avvisi,
        commesse: Array.from(new Set(g.pezzi.map(p => p.lavoro.r.commessa))),
        cantieri: Array.from(new Set(g.pezzi.map(p => p.lavoro.r.cantiere))) });
    });
  });

  /* ---- esiti finali ---- */
  righe.forEach(r => {
    const e = esiti[r.id];
    e.giorniUsati.sort((a, b) => a - b);
    const residuo = Math.max(0, e.richiesti - e.giorniAssegnati);
    if (e.giorniAssegnati <= 1e-6) e.stato = 'non_assegnato';
    else e.stato = residuo > 1e-6 ? 'parziale' : 'assegnato';
    if (e.stato !== 'non_assegnato' && residuo > 1e-6) {
      const fuori = residuoSettimana[r.id] || 0;
      const viaggio = viaggioRiga[r.id] || 0;
      const perche = [];
      if (viaggio) perche.push(apFmtNum(viaggio) + ' persa per il viaggio del primo giorno');
      if (fuori) perche.push(apFmtNum(fuori) + ' non stanno nei giorni utili di questa');
      e.motivi.push('restano ' + apFmtNum(residuo) + ' gg-squadra per la settimana successiva' + (perche.length ? ' (' + perche.join('; ') + ')' : ''));
    } else if (e.stato === 'non_assegnato' && !e.motivi.length) {
      e.motivi.push('non pianificato');
    }
    if (r.scadenzaGiorno != null && e.giorniUsati.length && e.giorniUsati[e.giorniUsati.length - 1] > r.scadenzaGiorno) {
      e.oltreScadenza = true;
      e.avvisi.push('finisce oltre la scadenza');
    }
    if (e.meteo.length) e.avvisi.push('meteo sfavorevole: ' + e.meteo.join(', '));
    if (e.squadre.length > 1) e.avvisi.push('lavorato da ' + e.squadre.length + ' squadre: ' + e.squadre.join(', '));
    if (residuo > 1e-6) valore -= residuo * pesi.ritardoGiorno * peso(r);
  });

  /* km medi per riga (dal cantiere precedente o da casa) e operatori su più commesse */
  const perOp = {};
  assegnazioni.forEach(a => a.operatori.forEach(n => {
    const r = righe.find(x => x.id === a.rigaId);
    (perOp[n] = perOp[n] || new Set()).add(r.commessa);
  }));
  squadre.forEach(sq => {
    const kmRiga = {};
    let prevR = null;
    let partito = false;
    giorniSq.forEach(d => {
      const rid = sq.piano[d];
      if (!rid) { prevR = null; return; }
      const r = righe.find(x => x.id === rid);
      const membri = sq.operatori.map(n => opByNome[n]);
      let k = null;
      if (!partito) k = membri.reduce((t, o) => t + (o.base && r.geo ? kmTra(o.base, r.geo) : 0), 0) / membri.length;
      else if (prevR && prevR !== r) k = kmCantieri(prevR, r);
      if (k != null) (kmRiga[rid] = kmRiga[rid] || []).push(k);
      prevR = r;
      partito = true;
    });
    Object.keys(kmRiga).forEach(rid => {
      const e = esiti[rid];
      const tutti = (e._km || []).concat(kmRiga[rid]);
      e._km = tutti;
      e.kmMedi = tutti.reduce((a, b) => a + b, 0) / tutti.length;
    });
  });
  Object.values(esiti).forEach(e => {
    delete e._km;
    if (e.rendimento) {
      if (e.rendimento.noti) e.rendimento.medio = e.rendimento.somma / e.rendimento.noti;
      else delete e.rendimento;
    }
  });
  const righeById = {};
  righe.forEach(r => { righeById[r.id] = r; });
  const esitoVincoli = _apSqVerificaVincoli(vincoli, squadre, righeById);

  return vuoto({
    assegnazioni,
    operatoriSuPiuCommesse: Object.keys(perOp).filter(n => perOp[n].size > 1),
    capacitaResidua: cap,
    valore,
    squadre,
    riepilogo: {
      squadre: squadre.length,
      giorniLiberi: giorniLiberiTot,
      nonPianificati: Object.values(nonPianificati).reduce((a, b) => a + b, 0),
      parziali,
      inutilizzati: Array.from(liberi).length,
      liberi: Array.from(liberi),
      vincoli: esitoVincoli,
      giorni: giorniSq.slice(),
      ms: Date.now() - t0
    }
  });
}

/* Perché una squadra è fatta così: punteggio voce per voce dei membri sul loro giro, coppia,
   seniority per cantiere, vincoli, e le alternative (chi era libero e chi è finito in
   un'altra squadra pur valendo di più su questo giro). Stesse formule del calcolo. */
function apSpiegaSquadra(ctx, righe, risultato, idSquadra) {
  const sq = (risultato.squadre || []).find(x => x.id === idSquadra || x.nome.toLowerCase() === String(idSquadra).toLowerCase());
  if (!sq) return null;
  const pesi = Object.assign({}, AP_PESI_DEFAULT, ctx.pesi || {});
  const opByNome = {};
  ctx.operatori.forEach(o => { opByNome[o.nome] = o; });
  const kmTra = _apSqKmFactory(ctx, null);
  const giorni = (risultato.riepilogo && risultato.riepilogo.giorni) || ctx.giorni;
  const isoUltimo = ctx.giorniISO[giorni[giorni.length - 1]];
  const conta = {};
  giorni.forEach(d => { const id = sq.piano[d]; if (id) conta[id] = (conta[id] || 0) + 1; });
  const pezzi = Object.keys(conta).map(id => ({ r: righe.find(r => r.id === id), giorni: conta[id] })).filter(p => p.r);
  const val = apSqValutaSquadra(ctx, pesi, sq.operatori, pezzi, kmTra, isoUltimo, opByNome);
  const membri = sq.operatori.map(n => ({ nome: n, punti: Math.round((val.membri[n] || {}).totale || 0), voci: (val.membri[n] || {}).voci || {} }));
  const minimo = Math.min.apply(null, membri.map(m => m.punti));
  const valuta = n => apSqVociOperatore(ctx, pesi, opByNome[n], pezzi, kmTra, isoUltimo);
  const liberi = ((risultato.riepilogo && risultato.riepilogo.liberi) || []).map(n => ({ n, v: valuta(n) })).filter(x => x.v.totale != null)
    .sort((a, b) => b.v.totale - a.v.totale).slice(0, 4)
    .map(x => ({ nome: x.n, punti: Math.round(x.v.totale), voci: x.v.voci,
      perche_no: _apSqVincoliSquadra(ctx.vincoli, [x.n], pezzi.map(p => p.r)).violati.some(v => v.a === x.n && (v.tipo === 'operatore_limitato' || v.tipo === 'operatore_cantiere'))
        ? 'un vincolo lo tiene fuori da questo giro'
        : (x.v.totale <= minimo ? 'vale meno dei membri su questo giro' : 'vale di più da solo, ma la squadra con lui vale meno (seniority, coppia o vincoli)') }));
  const altrove = [];
  (risultato.squadre || []).forEach(o => {
    if (o === sq) return;
    o.operatori.forEach(n => {
      const v = valuta(n);
      if (v.totale != null && v.totale > minimo) altrove.push({ nome: n, squadra: o.nome, punti: Math.round(v.totale) });
    });
  });
  altrove.sort((a, b) => b.punti - a.punti);
  return {
    squadra: sq.nome, operatori: sq.operatori,
    giro: giorni.map(d => AP_GIORNI[d] + ': ' + (sq.piano[d] ? (righe.find(r => r.id === sq.piano[d]) || {}).cantiere : 'libero')).join(', '),
    km_settimana: sq.kmSettimana,
    punteggio_squadra: Math.round(val.totale || 0),
    membri,
    coppia: { gia_lavorato_insieme: Math.round(val.coppia ? val.coppia.storico : 0), stessa_partenza: Math.round(val.coppia ? val.coppia.stessa_partenza : 0) },
    seniority: val.seniority,
    skill: (val.skillCoperte || 0) + '/' + (val.skillRichieste || 0) + ' coperte',
    vincoli_violati: (val.vincoliViolati || []).map(v => v.tipo + ' ' + (Array.isArray(v.b) ? v.a + ' → ' + v.b.join(', ') : v.a + ' / ' + v.b)),
    alternative_libere: liberi,
    piu_adatti_finiti_in_altre_squadre: altrove.slice(0, 4),
    legenda: 'punti in km-equivalenti: −1 per km da casa; esperienza fino a +200 sulla commessa e +100 sulla stessa attività; senza senior sul tipo di WO −300; tutti senior −80; stessa partenza +40; residenza mancante −500',
    avvisi: sq.avvisi
  };
}
