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

function apPianificaSquadre(ctx, righe) {
  const t0 = Date.now();
  const pesi = Object.assign({}, AP_PESI_DEFAULT, ctx.pesi || {});
  const giorniSq = (ctx.giorni || []).filter(d => ctx.sabato || d <= 4);
  const nG = giorniSq.length;
  const opByNome = {};
  ctx.operatori.forEach(o => { opByNome[o.nome] = o; });
  const meteo = ctx.meteo || {};
  const distanze = { stradali: 0, stimate: 0 };
  const kmMemo = new Map();
  const kmTra = (a, b) => {
    if (!a || !b) return null;
    const k = a.lat.toFixed(4) + ',' + a.lng.toFixed(4) + '>' + b.lat.toFixed(4) + ',' + b.lng.toFixed(4);
    if (kmMemo.has(k)) return kmMemo.get(k);
    let km = ctx.distanzaKm ? ctx.distanzaKm(a, b) : null;
    if (km != null) distanze.stradali++;
    else { distanze.stimate++; km = haversineKm(a.lat, a.lng, b.lat, b.lng) * AP_FATTORE_STRADA; }
    kmMemo.set(k, km);
    return km;
  };
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
    return km + (commesse.size - 1) * AP_SQ_MISTO_COMMESSA + (tipi.size - 1) * AP_SQ_MISTO_TIPO + fratelli * AP_SQ_FRATELLI;
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
    const individuale = (nome, g) => {
      const o = opByNome[nome];
      let sc = 0;
      for (const p of g.pezzi) {
        const r = p.lavoro.r;
        if ((r.esclusi || []).includes(nome)) return null;
        if ((r.attestati || []).some(a => !o.attestatiValidi(a, isoUltimo))) return null;
      }
      // km da casa al cantiere del giro più vicino (il lunedì si parte da lì)
      const geos = g.pezzi.map(p => p.lavoro.r.geo).filter(Boolean);
      if (!o.base) sc -= pesi.posizioneIgnota;
      else if (geos.length) sc -= Math.min.apply(null, geos.map(x => kmTra(o.base, x))) * pesi.kmCosto;
      else sc -= 60;
      g.pezzi.forEach(p => {
        const r = p.lavoro.r;
        const w = p.giorni / giorniGiro(g);
        let v = apBonusEsperienza(o, r, ctx.modello, pesi) + apBonusRendimento(o, r, pesi.rendimento);
        if (o.staffing && o.staffing.has(r.commessa)) v += pesi.staffing;
        if ((r.preferiti || []).includes(nome)) v += 200;
        sc += v * w;
      });
      return sc;
    };
    const valutaSquadra = (nomi, g) => {
      let sc = 0;
      for (const n of nomi) { const v = individuale(n, g); if (v == null) return null; sc += v; }
      for (let i = 0; i < nomi.length; i++) for (let j = i + 1; j < nomi.length; j++) {
        if (ctx.modello) {
          const k = nomi[i] < nomi[j] ? nomi[i] + '|||' + nomi[j] : nomi[j] + '|||' + nomi[i];
          sc += pesi.coppia * Math.min(ctx.modello.coppie[k] || 0, 10) / 10;
        }
        if (pesi.stessaPartenza && _apStessaPartenza(ctx, nomi[i], nomi[j])) sc += pesi.stessaPartenza;
      }
      if (nomi.length >= 2) {
        g.pezzi.forEach(p => {
          const w = p.giorni / giorniGiro(g);
          const liv = nomi.map(n => apLivelloSeniority(opByNome[n], p.lavoro.r.tipoWo));
          if (!liv.includes('senior')) sc -= pesi.soloJunior * w;
          else if (liv.every(x => x === 'senior')) sc -= pesi.soloSenior * w;
        });
      }
      const skill = new Set();
      g.pezzi.forEach(p => (p.lavoro.r.skills || []).forEach(k => skill.add(k)));
      skill.forEach(k => { if (nomi.some(n => opByNome[n].skills && opByNome[n].skills.has(k))) sc += 80; });
      return sc;
    };
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
          if (!p) { if (!partito) c += AP_SQ_ATTESA * (nG - i); prec = null; return; }
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
  Object.values(esiti).forEach(e => { delete e._km; });

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
      giorni: giorniSq.slice(),
      ms: Date.now() - t0
    }
  });
}
