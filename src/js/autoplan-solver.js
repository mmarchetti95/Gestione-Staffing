/* ==================== AUTO-PIANIFICA: SOLVER (modulo puro) ==================== */
/* Motore della tab "🤖 Auto-pianifica" (UI in weekly-autoplan.js). Qui NIENTE DOM,
   niente pwData/state/Supabase: tutte le funzioni ricevono i dati come argomenti e
   restituiscono oggetti. Così lo stesso codice potrà girare in una Edge Function
   (bozza programmata) o essere chiamato come tool da un agente LLM, e il risultato
   dipende solo dagli input (deterministico: stessi dati, stessa bozza).

   Modello:
   - Un "cantiere da pianificare" chiede G giorni-squadra di N operatori. G arriva dalla
     stima sullo storico di Controllo Produzione (km da rilevare / km al giorno della
     famiglia di attività) oppure è inserito a mano.
   - Le squadre si RICOMPONGONO: l'unità assegnata è l'operatore-giorno. Ogni operatore
     ha capacità 1 per giorno; l'ultimo giorno di un cantiere può consumarne solo una
     frazione (es. 2,5 gg -> 1 + 1 + 0,5) e lasciare spazio a un secondo cantiere vicino.
   - Vincoli rigidi (escludono): ferie/non disponibile, doppia week, cella già occupata in
     Griglia, contratto terminato, attestati della commessa mancanti o scaduti alla data,
     finestra "non prima di", operatore escluso a mano.
   - Preferenze (punteggio): distanza dal punto in cui l'operatore si trova il giorno
     prima, esperienza sulla famiglia di attività, coppie che lavorano spesso insieme,
     restare sulla commessa in cui è già in Griglia, allocazione staffing del mese,
     continuità della stessa squadra sui giorni dello stesso cantiere.
   - Ordine: priorità (P1 prima), poi scadenza, poi impegno più lungo (greedy). */

const AP_STOPWORDS = new Set(['rilievo', 'di', 'e', 'del', 'della', 'delle', 'the', 'con', 'per', 'a', 'da', 'in',
  /* note e zone che compaiono nel testo libero ma non cambiano il tipo di lavoro */
  'maltempo', 'ripassi', 'ripasso', 'solo', 'punti', 'consorzio', 'recupero',
  'nord', 'sud', 'est', 'ovest', 'centro', 'lombardia', 'piemonte', 'veneto', 'liguria', 'emilia', 'romagna',
  'toscana', 'lazio', 'campania', 'puglia', 'sicilia', 'sardegna', 'marche', 'umbria', 'abruzzo', 'calabria']);
/* Giornate che non producono km: fuori dalla stima di produttività */
const AP_NON_PRODUTTIVE = new Set(['viaggio', 'rientro', 'sede', 'formazione', 'corsi', 'corso', 'delivery', 'nuovi', 'operatori']);
const AP_SINONIMI = {
  walkout: 'wo', walk: 'wo', 'walk-out': 'wo',
  fognataura: 'fognatura', fogatura: 'fognatura', fogna: 'fognatura', fognature: 'fognatura', fognario: 'fognatura',
  bianca: 'bianche', bianco: 'bianche',
  gruppi: 'gr', riduzione: 'gr',
  illuminazione: 'ip', pubblica: 'ip'
};

/* Distanza di Levenshtein limitata (serve solo a riconoscere refusi di 1-2 lettere) */
function apLev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/* Token significativi di un'attività, normalizzati. `vocab` (facoltativo) è l'insieme dei
   token già visti nello storico: un token lungo che dista 1 lettera da uno noto viene
   ricondotto a quello ("fognataura" -> "fognatura" anche senza sinonimo esplicito). */
function apAttivitaTokens(testo, vocab) {
  const s = String(testo || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  if (!s) return [];
  const out = new Set();
  s.split(' ').forEach(t => {
    /* token con cifre = codici interni (es. "csvw48"), non il tipo di attività */
    if (!t || AP_STOPWORDS.has(t) || /\d/.test(t)) return;
    let k = AP_SINONIMI[t] || t;
    if (vocab && k.length >= 6 && !vocab.has(k)) {
      for (const v of vocab) { if (v.length >= 6 && apLev(k, v) <= 1) { k = v; break; } }
    }
    out.add(k);
  });
  return Array.from(out).sort();
}

/* Chiave di famiglia: token ordinati. "WO - Fognatura" e "Rilievo Wo Fognatura" -> "fognatura wo" */
function apFamiglia(testo, vocab) {
  return apAttivitaTokens(testo, vocab).join(' ');
}

/* Famiglia senza i token non produttivi; '' se l'attività è solo viaggio/formazione */
function apFamigliaProduttiva(testo, vocab) {
  return apAttivitaTokens(testo, vocab).filter(t => !AP_NON_PRODUTTIVE.has(t)).join(' ');
}

function apMediana(arr) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function apModa(arr) {
  const cnt = {};
  let best = null;
  arr.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; if (best == null || cnt[v] > cnt[best]) best = v; });
  return best == null ? null : Number(best);
}

/* Costruisce il modello di produttività dalle righe di controllo_produzione
   ({anno, week, giorno, commessa, squadra, cantiere, operatore, attivita, km_cad}).
   Le righe sono per operatore/giorno, ma i km sono della SQUADRA: spesso li scrive un
   solo operatore, a volte sono ripetuti identici su entrambi. Quindi si raggruppa per
   giornata-cantiere-squadra e, se tutti i valori presenti coincidono, se ne tiene uno solo
   (altrimenti si sommano: sono contributi diversi).
   Restituisce anche la storia per operatore (esperienza per famiglia) e le coppie. */
function apBuildModello(righe) {
  const vocab = new Set();
  (righe || []).forEach(r => apAttivitaTokens(r.attivita).forEach(t => vocab.add(t)));

  const gruppi = {};
  (righe || []).forEach(r => {
    if (!r.cantiere) return;
    const k = [r.anno, r.week, r.giorno, r.commessa, r.squadra, r.cantiere].join('|');
    let g = gruppi[k];
    if (!g) g = gruppi[k] = { commessa: r.commessa, attivita: new Set(), ops: new Set(), km: [] };
    if (r.attivita) String(r.attivita).split(',').forEach(a => { if (a.trim()) g.attivita.add(a.trim()); });
    if (r.operatore) g.ops.add(r.operatore);
    const km = Number(r.km_cad);
    if (r.km_cad != null && isFinite(km) && km > 0) g.km.push(km);
  });

  const famiglie = {};     // fam -> { km: [], nOp: [], varianti: Set, commesse: {commessa: km[]} }
  const esperienza = {};   // operatore -> { fam: giornate }
  const coppie = {};       // "A|||B" (ordinati) -> giornate insieme
  Object.values(gruppi).forEach(g => {
    const ops = Array.from(g.ops).sort();
    const atts = Array.from(g.attivita);
    /* "Rilievo Gr + Viaggio": il viaggio si toglie, resta "gr"; "Viaggio" da solo sparisce */
    const fams = Array.from(new Set(atts.map(a => apFamigliaProduttiva(a, vocab)).filter(Boolean)));
    ops.forEach(o => {
      if (!esperienza[o]) esperienza[o] = {};
      fams.forEach(f => { esperienza[o][f] = (esperienza[o][f] || 0) + 1; });
    });
    for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) {
      const k = ops[i] + '|||' + ops[j];
      coppie[k] = (coppie[k] || 0) + 1;
    }
    /* Produttività solo se la giornata ha un'unica famiglia: con due attività diverse lo
       stesso giorno non si sa come dividere i km. */
    if (fams.length !== 1) return;
    const f = fams[0];
    if (!famiglie[f]) famiglie[f] = { km: [], nOp: [], varianti: new Set(), commesse: {} };
    const F = famiglie[f];
    atts.forEach(a => F.varianti.add(a));
    F.nOp.push(ops.length || 1);
    if (!g.km.length) return;
    const tuttiUguali = g.km.every(v => Math.abs(v - g.km[0]) < 1e-6);
    const km = (tuttiUguali && g.km.length > 1) ? g.km[0] : g.km.reduce((a, b) => a + b, 0);
    F.km.push(km);
    if (!F.commesse[g.commessa]) F.commesse[g.commessa] = [];
    F.commesse[g.commessa].push(km);
  });

  Object.keys(famiglie).forEach(f => {
    const F = famiglie[f];
    F.kmGiorno = apMediana(F.km);
    F.nOpTipico = apModa(F.nOp) || 2;
    F.campioni = F.km.length;
    F.varianti = Array.from(F.varianti).sort();
  });
  return { vocab, famiglie, esperienza, coppie, generato: Date.now() };
}

/* Famiglia del modello più simile a un testo di attività: prima la corrispondenza esatta,
   poi la massima sovrapposizione di token (Jaccard), purché almeno un token in comune. */
function apTrovaFamiglia(modello, attivita) {
  if (!modello) return null;
  const fam = apFamigliaProduttiva(attivita, modello.vocab);
  if (!fam) return null;
  if (modello.famiglie[fam]) return fam;
  const tok = new Set(fam.split(' '));
  let best = null, bestScore = 0;
  Object.keys(modello.famiglie).forEach(f => {
    const ft = f.split(' ');
    const inter = ft.filter(t => tok.has(t)).length;
    if (!inter) return;
    const score = inter / (tok.size + ft.length - inter) + Math.min(modello.famiglie[f].campioni, 50) / 1000;
    if (score > bestScore) { bestScore = score; best = f; }
  });
  return best;
}

const AP_MIN_CAMPIONI = 3;

/* Stima dell'impegno di una riga. Precedenza: giorni inseriti a mano > km / km al giorno
   (storico della commessa se ha abbastanza campioni, altrimenti della famiglia) > 1 giorno
   di default. Restituisce anche il "perché", mostrato in UI accanto al numero. */
function apStimaImpegno(riga, modello) {
  const out = { giorni: null, nOp: null, fonte: '', famiglia: null, kmGiorno: null, campioni: 0 };
  const fam = apTrovaFamiglia(modello, riga.attivita);
  const F = fam ? modello.famiglie[fam] : null;
  out.famiglia = fam;
  out.nOp = riga.nOp || (F ? F.nOpTipico : 2);

  if (riga.giorniManuali > 0) {
    out.giorni = riga.giorniManuali;
    out.fonte = 'inserito a mano';
    return out;
  }
  if (riga.km > 0 && F) {
    const perCommessa = F.commesse[riga.commessa] || [];
    const usaCommessa = perCommessa.length >= AP_MIN_CAMPIONI;
    const kmG = usaCommessa ? apMediana(perCommessa) : F.kmGiorno;
    const n = usaCommessa ? perCommessa.length : F.campioni;
    if (kmG > 0 && n >= AP_MIN_CAMPIONI) {
      out.kmGiorno = kmG;
      out.campioni = n;
      /* Arrotondamento a mezza giornata, per eccesso: meglio un avanzo di mezza giornata
         che un cantiere lasciato a metà. */
      out.giorni = Math.max(0.5, Math.ceil((riga.km / kmG) * 2) / 2);
      out.fonte = 'mediana ' + apFmtNum(kmG) + ' km/giorno su ' + n + ' giornate' +
        (usaCommessa ? ' della commessa' : '') + ' ("' + fam + '")';
      return out;
    }
  }
  out.giorni = 1;
  out.fonte = !riga.km ? 'km non indicati: 1 giorno di default'
    : (F ? 'storico insufficiente per "' + fam + '": 1 giorno di default'
         : 'attività senza storico: 1 giorno di default');
  return out;
}

function apFmtNum(n) {
  if (n == null || !isFinite(n)) return '—';
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}


/* ---------- solver ---------- */

const AP_PESI_DEFAULT = {
  kmCosto: 1,            // punti persi per km di spostamento
  esperienza: 25,        // bonus se l'operatore ha già fatto quella famiglia (saturato)
  coppia: 30,            // bonus coppia abituale (saturato)
  stessaCommessa: 40,    // bonus se già in Griglia su quella commessa questa settimana
  staffing: 30,          // bonus se allocato sulla commessa nello staffing del mese
  continuita: 60,        // bonus se ieri era sullo stesso cantiere
  ritardoGiorno: 400,    // penalità per giorno oltre la scadenza (x peso priorità)
  attesaGiorno: 8,       // penalità per giorno di attesa prima di iniziare (x peso priorità)
  giornoFatto: 1000,     // valore di un giorno-squadra assegnato (x peso priorità): domina il resto
  maxKmTrasferta: 250    // oltre: operatore scartato per quel giorno
};
const AP_PESO_PRIORITA = { 1: 3, 2: 2, 3: 1 };
const AP_FATTORE_STRADA = 1.3; // linea d'aria -> strada, stima prudente quando manca OSRM
const AP_MAX_RICALCOLI = 80;   // tetto del miglioramento locale (ogni prova = un greedy completo)
const AP_MAX_MS = 2500;

/* Ordine di partenza: priorità (P1 prima), scadenza più vicina, impegno più lungo */
function apOrdineBase(righe) {
  return righe.slice().sort((a, b) => {
    if ((a.priorita || 3) !== (b.priorita || 3)) return (a.priorita || 3) - (b.priorita || 3);
    const sa = a.scadenzaGiorno == null ? 99 : a.scadenzaGiorno;
    const sb = b.scadenzaGiorno == null ? 99 : b.scadenzaGiorno;
    if (sa !== sb) return sa - sb;
    if ((b.giorni || 0) !== (a.giorni || 0)) return (b.giorni || 0) - (a.giorni || 0);
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

/* Precedenze decise dall'utente ([primaId, dopoId]): la prima riga va messa davanti */
function apApplicaPrecedenze(ordine, precedenze) {
  const out = ordine.slice();
  (precedenze || []).forEach(([prima, dopo]) => {
    const ip = out.findIndex(r => r.id === prima);
    const id = out.findIndex(r => r.id === dopo);
    if (ip < 0 || id < 0 || ip < id) return;
    const [r] = out.splice(ip, 1);
    out.splice(id, 0, r);
  });
  return out;
}

function _apViolaPrecedenze(ordine, precedenze) {
  const idx = {};
  ordine.forEach((r, i) => { idx[r.id] = i; });
  return (precedenze || []).some(([prima, dopo]) => idx[prima] != null && idx[dopo] != null && idx[prima] > idx[dopo]);
}

/* Input del solver:
   ctx = {
     giorni: [0..5] indici utili,            giorniISO: {d: 'YYYY-MM-DD'},
     operatori: [{ nome, skills:Set, attestatiValidi(nome, iso)->bool, fineRapporto,
                   base: {lat,lng}|null, commessaSettimana: string|null, staffing:Set(commesse) }],
     disp: { nome: { d: 'libero'|'ferie'|'dw'|'occupato' } },
     posizione: { nome: { d: {lat,lng,label} } },   // dove è già (celle esistenti)
     distanzaKm(a, b) -> km stradali | null,        // facoltativa: senza, linea d'aria x 1,3
     meteo: { rigaId: { d: { pen, blocco, motivo } } },   // facoltativo
     precedenze: [[primaId, dopoId]],                // facoltativo
     modello, pesi
   }
   righe = [{ id, cantiere, commessa, attivita, famiglia, geo:{lat,lng}|null, giorni, nOp,
              priorita, scadenzaGiorno (indice o null), dalGiorno, giorniEsclusi:[indici],
              skills:[], attestati:[], preferiti:[], esclusi:[] }]
   Output: { assegnazioni: [{rigaId, giorno, operatori:[], quota}], esiti: {rigaId: {...}},
             miglioramenti: [...], suggerimenti: [...], distanze: {stradali, stimate}, ... } */
function apRisolvi(ctx, righe) {
  const pesi = Object.assign({}, AP_PESI_DEFAULT, ctx.pesi || {});
  const t0 = Date.now();
  let ricalcoli = 0;
  const greedy = ordine => { ricalcoli++; return _apGreedy(ctx, pesi, ordine); };

  let ordine = apApplicaPrecedenze(apOrdineBase(righe), ctx.precedenze);
  let best = greedy(ordine);
  const miglioramenti = [];

  /* Miglioramento locale. Il greedy assegna in ordine e non torna indietro: un cantiere in
     fondo alla fila può restare scoperto anche quando anticiparlo darebbe un piano migliore
     nel complesso (es. un P2 con scadenza che il P3 lungo gli ha tolto i giorni). Si prova
     ad anticipare ogni cantiere "insoddisfatto" davanti a chi lo precede e si tiene la mossa
     solo se il valore totale sale: più giorni assegnati (pesati per priorità), meno ritardi,
     meno km. Le precedenze impostate a mano non vengono mai violate. */
  let migliorato = true;
  while (migliorato && ricalcoli < AP_MAX_RICALCOLI && Date.now() - t0 < AP_MAX_MS) {
    migliorato = false;
    for (const r of _apInsoddisfatte(best, ordine)) {
      const pos = ordine.findIndex(x => x.id === r.id);
      for (let j = 0; j < pos && !migliorato; j++) {
        if (ricalcoli >= AP_MAX_RICALCOLI || Date.now() - t0 >= AP_MAX_MS) break;
        const cand = ordine.slice();
        cand.splice(pos, 1);
        cand.splice(j, 0, r);
        if (_apViolaPrecedenze(cand, ctx.precedenze)) continue;
        const res = greedy(cand);
        if (res.valore > best.valore + 1) {
          miglioramenti.push({ rigaId: r.id, primaDi: ordine[j].id, effetti: _apEffetti(best, res, righe) });
          ordine = cand;
          best = res;
          migliorato = true;
        }
      }
      if (migliorato) break;
    }
  }

  /* Suggerimenti: per i cantieri ancora scoperti, le mosse che li farebbero entrare ma
     peggiorano il totale (tipicamente a scapito di un cantiere di pari priorità). Non si
     applicano da sole: le decide l'utente, che conosce cose che il calcolo non sa. */
  const suggerimenti = [];
  for (const r of _apInsoddisfatte(best, ordine)) {
    const e0 = best.esiti[r.id];
    if (e0.stato === 'assegnato') continue; // solo in ritardo: nessun suggerimento, basta l'avviso
    const pos = ordine.findIndex(x => x.id === r.id);
    let migliore = null;
    for (let j = pos - 1; j >= 0; j--) {
      if (ricalcoli >= AP_MAX_RICALCOLI * 2 || Date.now() - t0 >= AP_MAX_MS * 2) break;
      const cand = ordine.slice();
      cand.splice(pos, 1);
      cand.splice(j, 0, r);
      const res = greedy(cand);
      const guadagno = res.esiti[r.id].giorniAssegnati - e0.giorniAssegnati;
      if (guadagno <= 1e-6) continue;
      const costo = best.valore - res.valore;
      if (!migliore || costo < migliore.costo) {
        migliore = { rigaId: r.id, primaDi: ordine[j].id, costo, guadagno, effetti: _apEffetti(best, res, righe) };
      }
    }
    if (migliore) suggerimenti.push(migliore);
  }

  best.miglioramenti = miglioramenti;
  best.suggerimenti = suggerimenti;
  best.ordine = ordine.map(r => r.id);
  best.ricalcoli = ricalcoli;
  return best;
}

/* Righe non soddisfatte, nell'ordine corrente: non assegnate, parziali o oltre scadenza */
function _apInsoddisfatte(res, ordine) {
  return ordine.filter(r => {
    const e = res.esiti[r.id];
    return e && (e.stato !== 'assegnato' || e.oltreScadenza);
  });
}

/* Cosa cambia fra due soluzioni, riga per riga: giorni assegnati prima -> dopo */
function _apEffetti(prima, dopo, righe) {
  const out = [];
  righe.forEach(r => {
    const a = prima.esiti[r.id], b = dopo.esiti[r.id];
    if (!a || !b) return;
    const d = b.giorniAssegnati - a.giorniAssegnati;
    const ritardo = !!b.oltreScadenza !== !!a.oltreScadenza;
    if (Math.abs(d) > 1e-6 || ritardo) {
      out.push({ rigaId: r.id, prima: a.giorniAssegnati, dopo: b.giorniAssegnati,
        oltreScadenzaPrima: !!a.oltreScadenza, oltreScadenzaDopo: !!b.oltreScadenza });
    }
  });
  return out;
}

/* Un passaggio greedy completo con un ordine dato. Non modifica ctx. */
function _apGreedy(ctx, pesi, ordinate) {
  const cap = {};           // nome -> d -> capacità residua (0..1)
  const pos = {};           // nome -> d -> {lat,lng,label} ultima posizione nota del giorno
  const commessaDi = {};    // nome -> Set commesse toccate in bozza (per avviso doppia riga)
  ctx.operatori.forEach(o => {
    cap[o.nome] = {};
    pos[o.nome] = {};
    ctx.giorni.forEach(d => {
      const st = (ctx.disp[o.nome] || {})[d] || 'libero';
      cap[o.nome][d] = st === 'libero' ? 1 : 0;
      const p = ((ctx.posizione || {})[o.nome] || {})[d];
      if (p) pos[o.nome][d] = p;
    });
    commessaDi[o.nome] = new Set(o.commessaSettimana ? [o.commessaSettimana] : []);
  });
  const opByNome = {};
  ctx.operatori.forEach(o => { opByNome[o.nome] = o; });
  const distanze = { stradali: 0, stimate: 0 };

  const assegnazioni = [];
  const esiti = {};
  let valore = 0;

  /* Punto di partenza di un operatore il giorno d: l'ultimo luogo noto dal giorno d-1 in
     giù (celle esistenti o bozza), altrimenti la residenza. */
  const partenza = (nome, d) => {
    /* Con solo una parte della giornata libera (mezza giornata già in bozza) si parte dal
       cantiere di quel giorno stesso, non da quello di ieri. */
    if (cap[nome][d] < 1 - 1e-6 && pos[nome][d]) return pos[nome][d];
    for (let x = d - 1; x >= 0; x--) if (pos[nome][x]) return pos[nome][x];
    return opByNome[nome].base || null;
  };
  const kmTra = (a, b) => {
    if (!a || !b) return null;
    const km = ctx.distanzaKm ? ctx.distanzaKm(a, b) : null;
    if (km != null) { distanze.stradali++; return km; }
    distanze.stimate++;
    return haversineKm(a.lat, a.lng, b.lat, b.lng) * AP_FATTORE_STRADA;
  };

  /* Motivi di esclusione di un operatore da una riga (indipendenti dal giorno) */
  const escluso = (o, r) => {
    if (r.esclusi && r.esclusi.includes(o.nome)) return 'escluso a mano';
    const mancanti = (r.attestati || []).filter(a => !o.attestatiValidi(a, null));
    if (mancanti.length) return 'attestati mancanti: ' + mancanti.join(', ');
    return null;
  };

  /* Punteggio individuale di un operatore per la riga r nel giorno d (null = non usabile) */
  const punteggio = (o, r, d, ieriSuCantiere) => {
    const iso = ctx.giorniISO[d];
    if (o.fineRapporto && iso && o.fineRapporto < iso) return null;
    if ((r.attestati || []).some(a => !o.attestatiValidi(a, iso))) return null;
    let s = 0;
    const km = kmTra(partenza(o.nome, d), r.geo);
    if (km != null) {
      if (km > pesi.maxKmTrasferta) return null;
      s -= km * pesi.kmCosto;
    } else {
      s -= 60; // posizione ignota: né premiato né scartato, ma dietro a chi è vicino
    }
    const exp = r.famiglia && ctx.modello && ctx.modello.esperienza[o.nome]
      ? (ctx.modello.esperienza[o.nome][r.famiglia] || 0) : 0;
    s += pesi.esperienza * Math.min(exp, 10) / 10;
    if (o.commessaSettimana === r.commessa) s += pesi.stessaCommessa;
    else if (o.commessaSettimana) s -= pesi.stessaCommessa / 2; // eviterebbe una seconda riga in Griglia
    if (o.staffing && o.staffing.has(r.commessa)) s += pesi.staffing;
    if (ieriSuCantiere && ieriSuCantiere.has(o.nome)) s += pesi.continuita;
    if (r.preferiti && r.preferiti.includes(o.nome)) s += 200;
    return { s, km };
  };

  const affinita = (a, b) => {
    if (!ctx.modello) return 0;
    const k = a < b ? a + '|||' + b : b + '|||' + a;
    return pesi.coppia * Math.min(ctx.modello.coppie[k] || 0, 10) / 10;
  };

  /* Sceglie N operatori per la riga r nel giorno d: il migliore da solo, poi via via chi
     aggiunge più punteggio (individuale + affinità con i già scelti), completando se
     possibile le skill richieste. Restituisce null se non si arriva a N. */
  const scegliSquadra = (r, d, candidati, ieriSuCantiere, quota, capOf) => {
    const valutati = [];
    candidati.forEach(o => {
      if (capOf(o.nome, d) + 1e-6 < quota) return;
      const p = punteggio(o, r, d, ieriSuCantiere);
      if (p) valutati.push({ o, s: p.s, km: p.km });
    });
    if (valutati.length < r.nOp) return null;
    const scelti = [];
    const skillReq = r.skills || [];
    const coperte = new Set();
    while (scelti.length < r.nOp) {
      let best = null, bestTot = -Infinity;
      valutati.forEach(v => {
        if (scelti.includes(v)) return;
        let tot = v.s;
        scelti.forEach(x => { tot += affinita(v.o.nome, x.o.nome); });
        const nuoveSkill = skillReq.filter(sk => !coperte.has(sk) && v.o.skills.has(sk)).length;
        tot += nuoveSkill * 80;
        if (tot > bestTot || (tot === bestTot && best && v.o.nome < best.o.nome)) { bestTot = tot; best = v; }
      });
      if (!best) break;
      scelti.push(best);
      skillReq.forEach(sk => { if (best.o.skills.has(sk)) coperte.add(sk); });
    }
    if (scelti.length < r.nOp) return null;
    const skillMancanti = skillReq.filter(sk => !coperte.has(sk));
    const punti = scelti.reduce((a, v) => a + v.s, 0);
    return { scelti, skillMancanti, punti };
  };

  ordinate.forEach(r => {
    const esito = { stato: 'non_assegnato', motivi: [], giorniAssegnati: 0, richiesti: r.giorni,
      giorniUsati: [], kmMedi: null, avvisi: [], meteo: [], oltreScadenza: false };
    esiti[r.id] = esito;
    const peso = AP_PESO_PRIORITA[r.priorita] || 1;
    if (!r.geo) esito.avvisi.push('cantiere non localizzato: distanze non valutate');

    const esclusioni = {};
    const candidati = ctx.operatori.filter(o => {
      const m = escluso(o, r);
      if (m) { esclusioni[m] = (esclusioni[m] || 0) + 1; return false; }
      return true;
    });
    if (candidati.length < r.nOp) {
      esito.motivi.push('servono ' + r.nOp + ' operatori idonei, ne risultano ' + candidati.length +
        apMotiviEsclusione(esclusioni));
      valore -= r.giorni * pesi.ritardoGiorno * peso;
      return;
    }

    const primoGiorno = Math.max(ctx.giorni[0], r.dalGiorno || 0);
    /* giorniEsclusi: vincolo rigido deciso dall'utente (o dall'agente su sua richiesta),
       es. "Brescia non di venerdì" */
    const giorniUtili = ctx.giorni.filter(d => d >= primoGiorno && !(r.giorniEsclusi || []).includes(d));
    if (!giorniUtili.length) {
      esito.motivi.push((r.giorniEsclusi || []).length ? 'nessun giorno utile fra "non prima di" e giorni esclusi'
        : 'nessun giorno utile dopo il "non prima di"');
      valore -= r.giorni * pesi.ritardoGiorno * peso;
      return;
    }
    const meteoRiga = (ctx.meteo || {})[r.id] || {};
    const bloccati = giorniUtili.filter(d => meteoRiga[d] && meteoRiga[d].blocco);

    /* Prova ogni giorno di inizio e simula il riempimento; tiene il piano migliore.
       La simulazione non tocca cap/pos: si applica solo il vincitore. */
    let migliore = null;
    giorniUtili.forEach(start => {
      let residuo = r.giorni;
      const piano = [];
      let ieri = null;
      let punti = 0;
      const capSim = {};
      const capOf = (n, d) => (capSim[n + '|' + d] != null ? capSim[n + '|' + d] : cap[n][d]);
      for (const d of giorniUtili) {
        if (d < start || residuo <= 1e-6) continue;
        const mt = meteoRiga[d];
        if (mt && mt.blocco) { ieri = null; continue; } // allerta: quel giorno non si va
        const quota = Math.min(1, residuo);
        const sq = scegliSquadra(r, d, candidati, ieri, quota, capOf);
        if (!sq) { ieri = null; continue; }
        sq.scelti.forEach(v => { capSim[v.o.nome + '|' + d] = capOf(v.o.nome, d) - quota; });
        piano.push({ giorno: d, quota, sq });
        punti += sq.punti - (mt ? mt.pen * quota : 0);
        residuo -= quota;
        ieri = new Set(sq.scelti.map(v => v.o.nome));
      }
      if (!piano.length) return;
      const ultimo = piano[piano.length - 1].giorno;
      if (r.scadenzaGiorno != null && ultimo > r.scadenzaGiorno) punti -= (ultimo - r.scadenzaGiorno) * pesi.ritardoGiorno * peso;
      if (residuo > 1e-6) punti -= residuo * pesi.ritardoGiorno * peso; // non finito in settimana
      punti -= (piano[0].giorno - primoGiorno) * pesi.attesaGiorno * peso;
      /* Buchi tra i giorni: il cantiere a pezzi costa uno spostamento in più */
      for (let i = 1; i < piano.length; i++) if (piano[i].giorno - piano[i - 1].giorno > 1) punti -= 50;
      const fatto = r.giorni - Math.max(0, residuo);
      if (!migliore || fatto > migliore.fatto + 1e-6 || (Math.abs(fatto - migliore.fatto) < 1e-6 && punti > migliore.punti)) {
        migliore = { piano, punti, fatto, residuo: Math.max(0, residuo) };
      }
    });

    if (!migliore) {
      esito.motivi.push('nessun gruppo di ' + r.nOp + ' operatori idonei libero nei giorni utili' +
        (r.geo ? ' entro ' + pesi.maxKmTrasferta + ' km' : '') +
        (bloccati.length ? ' (esclusi per allerta meteo: ' + bloccati.map(d => AP_GIORNI[d]).join(', ') + ')' : ''));
      valore -= r.giorni * pesi.ritardoGiorno * peso;
      return;
    }

    const skillMancanti = new Set();
    const kmTot = [];
    migliore.piano.forEach(p => {
      const nomi = p.sq.scelti.map(v => v.o.nome);
      nomi.forEach(n => {
        cap[n][p.giorno] = Math.max(0, cap[n][p.giorno] - p.quota);
        if (r.geo) pos[n][p.giorno] = { lat: r.geo.lat, lng: r.geo.lng, label: r.cantiere };
        commessaDi[n].add(r.commessa);
      });
      p.sq.scelti.forEach(v => { if (v.km != null) kmTot.push(v.km); });
      p.sq.skillMancanti.forEach(s => skillMancanti.add(s));
      assegnazioni.push({ rigaId: r.id, giorno: p.giorno, operatori: nomi, quota: p.quota });
      esito.giorniUsati.push(p.giorno);
      const mt = meteoRiga[p.giorno];
      if (mt && mt.pen > 0) esito.meteo.push(AP_GIORNI[p.giorno] + ': ' + mt.motivo);
    });
    esito.giorniAssegnati = migliore.fatto;
    esito.kmMedi = kmTot.length ? kmTot.reduce((a, b) => a + b, 0) / kmTot.length : null;
    esito.stato = migliore.residuo > 1e-6 ? 'parziale' : 'assegnato';
    if (migliore.residuo > 1e-6) esito.motivi.push('restano ' + apFmtNum(migliore.residuo) + ' gg-squadra per la settimana successiva');
    const primo = migliore.piano[0].giorno;
    const ultimo = migliore.piano[migliore.piano.length - 1].giorno;
    if (r.scadenzaGiorno != null && ultimo > r.scadenzaGiorno) {
      esito.oltreScadenza = true;
      esito.avvisi.push('finisce oltre la scadenza');
    }
    if (skillMancanti.size) esito.avvisi.push('skill non coperte: ' + Array.from(skillMancanti).join(', '));
    /* Giorni saltati per allerta dentro l'arco del cantiere (o prima dell'inizio): va detto,
       altrimenti un buco nel piano sembra un errore del calcolo. */
    const evitati = bloccati.filter(d => d <= ultimo || d < primo);
    if (evitati.length) esito.avvisi.push('evitati per allerta meteo: ' + evitati.map(d => AP_GIORNI[d] + ' (' + meteoRiga[d].motivo + ')').join(', '));
    if (esito.meteo.length) esito.avvisi.push('meteo sfavorevole: ' + esito.meteo.join(', '));
    valore += migliore.fatto * pesi.giornoFatto * peso + migliore.punti;
  });

  const doppie = Object.keys(commessaDi).filter(n => commessaDi[n].size > 1);
  return { assegnazioni, esiti, operatoriSuPiuCommesse: doppie, capacitaResidua: cap, valore, distanze };
}

const AP_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function apMotiviEsclusione(esclusioni) {
  const k = Object.keys(esclusioni);
  if (!k.length) return '';
  return ' (' + k.map(m => esclusioni[m] + ' ' + m).join('; ') + ')';
}

/* ---------- diagnosi di una riga (per i "perché" dell'agente e della UI) ----------
   Dato il risultato di apRisolvi, dice giorno per giorno quanti operatori c'erano per la
   riga e dove sono finiti gli altri. Non rifà il calcolo: legge disponibilità iniziale
   (ctx.disp), capacità residua a fine calcolo e assegnazioni. La distanza è misurata dalla
   residenza o dall'ultima posizione nota in Griglia, quindi è indicativa (nel calcolo vero
   conta anche dove l'operatore si trova per effetto della bozza stessa). */
function apDiagnostica(ctx, righe, risultato, rigaId) {
  const r = righe.find(x => x.id === rigaId);
  if (!r) return null;
  const pesi = Object.assign({}, AP_PESI_DEFAULT, ctx.pesi || {});
  const e = risultato.esiti[r.id] || {};
  const righeById = {};
  righe.forEach(x => { righeById[x.id] = x; });
  const km = (a, b) => {
    if (!a || !b) return null;
    const v = ctx.distanzaKm ? ctx.distanzaKm(a, b) : null;
    return v != null ? v : haversineKm(a.lat, a.lng, b.lat, b.lng) * AP_FATTORE_STRADA;
  };
  const presoDa = {};  // "nome|giorno" -> [righe che lo usano]
  risultato.assegnazioni.forEach(a => a.operatori.forEach(n => {
    const k = n + '|' + a.giorno;
    (presoDa[k] = presoDa[k] || []).push(a.rigaId);
  }));
  const meteoRiga = (ctx.meteo || {})[r.id] || {};
  const giorni = ctx.giorni.map(d => {
    const out = { giorno: d, libero: 0, stati: {}, fuoriRaggio: 0, attestati: 0, esclusiMano: 0, usatiQui: 0,
      presiAltrove: [], restanoLiberi: [], meteo: meteoRiga[d] ? meteoRiga[d].motivo + (meteoRiga[d].blocco ? ' (giorno escluso)' : '') : null,
      fuoriFinestra: d < (r.dalGiorno || 0) || (r.giorniEsclusi || []).includes(d) };
    ctx.operatori.forEach(o => {
      const st = (ctx.disp[o.nome] || {})[d] || 'libero';
      if (st !== 'libero') { out.stati[st] = (out.stati[st] || 0) + 1; return; }
      out.libero++;
      if ((r.esclusi || []).includes(o.nome)) { out.esclusiMano++; return; }
      if ((r.attestati || []).some(a => !o.attestatiValidi(a, ctx.giorniISO[d]))) { out.attestati++; return; }
      let p = null;
      for (let x = d - 1; x >= 0 && !p; x--) p = ((ctx.posizione || {})[o.nome] || {})[x] || null;
      const dist = km(p || o.base, r.geo);
      if (dist != null && dist > pesi.maxKmTrasferta) { out.fuoriRaggio++; return; }
      const usi = presoDa[o.nome + '|' + d] || [];
      if (usi.includes(r.id)) { out.usatiQui++; return; }
      const voce = { nome: o.nome, km: dist == null ? null : Math.round(dist) };
      if (usi.length) { voce.cantieri = usi.map(id => righeById[id] ? 'P' + righeById[id].priorita + ' ' + righeById[id].cantiere : id); out.presiAltrove.push(voce); }
      else if ((((risultato.capacitaResidua || {})[o.nome] || {})[d] || 0) > 1e-6) out.restanoLiberi.push(voce);
    });
    const perKm = (a, b) => (a.km == null ? 9999 : a.km) - (b.km == null ? 9999 : b.km);
    out.presiAltrove.sort(perKm); out.presiAltrove = out.presiAltrove.slice(0, 6);
    out.restanoLiberi.sort(perKm); out.restanoLiberi = out.restanoLiberi.slice(0, 6);
    return out;
  });
  return { riga: r, esito: e, giorni, maxKm: pesi.maxKmTrasferta };
}

/* ---------- riparazione per imprevisti ----------
   La settimana è già pianificata e succede qualcosa: un operatore si assenta, un cantiere
   si ferma. Invece di rifare la settimana si tocca il meno possibile: si tolgono SOLO le
   celle colpite e si chiede ad apRisolvi di recuperare il lavoro perso con la capacità
   rimasta libera. Poiché il solver non sovrascrive mai celle esistenti, tutto il resto
   della Griglia resta com'è per costruzione.

   Input:
     celle: la Griglia della settimana appiattita, una voce per operatore+giorno+cantiere+attività:
       [{ operatore, giorno, cantiere, attivita, commessa, quota }]  (quota = 1 / voci della cella)
     imprevisti: [{ id, tipo: 'assenza', operatore, giorni: [d] }
                | { id, tipo: 'cantiere_fermo', cantiere, giorni: [d] }]
     modificabili: indici dei giorni che si possono ancora cambiare (i passati no)
     opts: { prioritaSostituto (1), prioritaRecupero (2) }
   Output:
     rimozioni: [cella + { imprevistoId }]  celle da togliere
     assenti:   { operatore: [d] }           giorni in cui non va assegnato
     righe:     righe (parziali: senza geo/famiglia/attestati, li aggiunge il chiamante) per
                apRisolvi, con in più tipo 'sostituto' | 'recupero', imprevistoId, compagni,
                sostituisce (sostituto) o squadra (recupero)
     liberati:  [{ operatore, giorno, quota }] capacità liberata dalle rimozioni (solo chi
                non è assente), per dire a chi resta a disposizione
     ignorati:  [{ imprevistoId, motivo }]   imprevisti senza effetto sulla Griglia */
function _apK(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

function apRiparaImpatto(celle, imprevisti, modificabili, opts) {
  const o = opts || {};
  const pSost = o.prioritaSostituto || 1;
  const pRec = o.prioritaRecupero || 2;
  const mod = new Set(modificabili || []);
  const tolte = new Set();   // indici in celle
  const rimozioni = [];
  const assenti = {};
  const ignorati = [];
  const righe = [];
  let seq = 0;
  const togli = (i, imp) => {
    if (tolte.has(i)) return false;
    tolte.add(i);
    rimozioni.push(Object.assign({}, celle[i], { imprevistoId: imp.id }));
    return true;
  };
  const tuttiTranne = giorni => [0, 1, 2, 3, 4, 5].filter(d => !giorni.includes(d));

  /* 1. Cantieri fermi prima: le loro celle se ne vanno per tutti, e un'assenza sullo
        stesso cantiere-giorno non deve chiedere un sostituto per un cantiere chiuso. */
  imprevisti.filter(x => x.tipo === 'cantiere_fermo').forEach(imp => {
    const giorni = (imp.giorni || []).filter(d => mod.has(d));
    const k = _apK(imp.cantiere);
    const gruppi = {};  // cantiere|commessa|attivita -> { giorno -> [celle] }
    celle.forEach((c, i) => {
      if (_apK(c.cantiere) !== k || !giorni.includes(c.giorno)) return;
      if (!togli(i, imp)) return;
      const g = _apK(c.cantiere) + '|' + _apK(c.commessa) + '|' + _apK(c.attivita);
      if (!gruppi[g]) gruppi[g] = { c, perGiorno: {} };
      (gruppi[g].perGiorno[c.giorno] = gruppi[g].perGiorno[c.giorno] || []).push(c);
    });
    const chiavi = Object.keys(gruppi);
    if (!chiavi.length) {
      ignorati.push({ imprevistoId: imp.id, motivo: giorni.length ? 'nessuna cella in Griglia su quel cantiere nei giorni indicati' : 'giorni già passati' });
      return;
    }
    chiavi.forEach(g => {
      const { c, perGiorno } = gruppi[g];
      let persi = 0, nOp = 0;
      const squadra = new Set();
      Object.keys(perGiorno).forEach(d => {
        const cs = perGiorno[d];
        persi += Math.max.apply(null, cs.map(x => x.quota || 1));
        const nomi = new Set(cs.map(x => x.operatore));
        nOp = Math.max(nOp, nomi.size);
        nomi.forEach(n => squadra.add(n));
      });
      righe.push({
        id: 'x' + (++seq), tipo: 'recupero', imprevistoId: imp.id,
        cantiere: c.cantiere, commessa: c.commessa, attivita: c.attivita,
        giorni: persi, nOp, priorita: pRec,
        scadenzaGiorno: null, dalGiorno: Math.min.apply(null, Array.from(mod).concat([99])),
        giorniEsclusi: giorni.slice(),
        giorniPersi: Object.keys(perGiorno).map(Number).sort((a, b) => a - b),
        squadra: Array.from(squadra).sort(),
        preferiti: Array.from(squadra).sort(), esclusi: [], skills: []
      });
    });
  });

  /* 2. Assenze: via le celle dell'assente nei giorni indicati; per ogni cantiere-giorno
        colpito serve un sostituto (stesso cantiere, stesso giorno), perché il resto della
        squadra è ancora lì. Più assenti sullo stesso cantiere-giorno = una riga con nOp > 1. */
  const sostituti = {};  // cantiere|commessa|attivita|giorno -> riga
  imprevisti.filter(x => x.tipo === 'assenza').forEach(imp => {
    const giorni = (imp.giorni || []).filter(d => mod.has(d));
    if (!giorni.length) { ignorati.push({ imprevistoId: imp.id, motivo: 'giorni già passati' }); return; }
    const nome = imp.operatore;
    assenti[nome] = Array.from(new Set((assenti[nome] || []).concat(giorni))).sort((a, b) => a - b);
    let colpite = 0;
    celle.forEach((c, i) => {
      if (c.operatore !== nome || !giorni.includes(c.giorno)) return;
      if (!togli(i, imp)) return;
      colpite++;
      const g = _apK(c.cantiere) + '|' + _apK(c.commessa) + '|' + _apK(c.attivita) + '|' + c.giorno;
      let r = sostituti[g];
      if (!r) {
        r = sostituti[g] = {
          id: 'x' + (++seq), tipo: 'sostituto', imprevistoId: imp.id,
          cantiere: c.cantiere, commessa: c.commessa, attivita: c.attivita,
          giorni: 0, nOp: 0, priorita: pSost,
          scadenzaGiorno: c.giorno, dalGiorno: c.giorno, giorniEsclusi: tuttiTranne([c.giorno]),
          giorno: c.giorno, sostituisce: [], compagni: [],
          preferiti: [], esclusi: [], skills: []
        };
        righe.push(r);
      }
      r.giorni = Math.max(r.giorni, c.quota || 1);
      r.nOp++;
      r.sostituisce.push(nome);
    });
    if (!colpite) ignorati.push({ imprevistoId: imp.id, motivo: 'nessuna cella in Griglia nei giorni indicati: resta solo l\'assenza' });
  });

  /* Compagni rimasti sul cantiere quel giorno (per dire "Bianchi resta da solo") */
  righe.filter(r => r.tipo === 'sostituto').forEach(r => {
    const k = _apK(r.cantiere);
    const nomi = new Set();
    celle.forEach((c, i) => {
      if (!tolte.has(i) && c.giorno === r.giorno && _apK(c.cantiere) === k) nomi.add(c.operatore);
    });
    r.compagni = Array.from(nomi).sort();
    r.esclusi = r.sostituisce.slice();
  });

  /* Capacità liberata: chi perde una cella ma non è assente quel giorno */
  const lib = {};
  rimozioni.forEach(c => {
    if ((assenti[c.operatore] || []).includes(c.giorno)) return;
    const k = c.operatore + '|' + c.giorno;
    lib[k] = { operatore: c.operatore, giorno: c.giorno, quota: Math.min(1, ((lib[k] && lib[k].quota) || 0) + (c.quota || 1)) };
  });
  return { rimozioni, assenti, righe, liberati: Object.values(lib), ignorati };
}
