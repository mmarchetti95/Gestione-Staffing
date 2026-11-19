/* ==================== PRESTAZIONI OPERATORI · MOTORE (prf*) ==================== */
/* Modulo PURO (niente DOM, niente variabili globali dell'app): riceve le giornate di lavoro
   già preparate e restituisce un indice di rendimento per operatore. Pensato per essere
   riusato da Auto-pianifica (priorità «urgente») e da una Edge Function, come autoplan-solver.

   Il problema che risolve. Nelle squadre la produzione del giorno è quasi sempre divisa in
   parti uguali fra i membri (un tablet per coppia): il Km/Cad «di un operatore» misura la
   squadra, non lui. Però le coppie ruotano: confrontando le giornate della stessa persona con
   compagni diversi (e su comuni diversi) si separa il suo contributo.

   Modello. Per ogni osservazione g (una squadra con la stessa composizione su un comune e
   un'attività in una settimana; peso w_g = numero di giornate):
     l_g = ln(resa_g / mediana dell'attività)                  resa = produzione per ora-uomo
     l_g ≈ media(θ_i dei membri) + φ_comune(g) + rumore        varianza del rumore ∝ 1/w_g
   Perché la settimana e non il giorno: i km della board QField arrivano nel giorno in cui il
   tablet sincronizza, non in quello del rilievo (una giornata gonfia, la successiva vuota).
   Sui dati di Sinfi (Rilievo WO IP, nov. 2026) sommare la settimana ha dimezzato lo scarto
   (0,53 → 0,28 in log) senza cambiare l'ordine (correlazione di rango 0,81); le coppie
   restano quasi sempre insieme tutta la settimana, quindi non si perde separabilità.
   θ_i = contributo dell'operatore, φ = difficoltà del comune (facoltativa). Stima ai minimi
   quadrati con penalità (ridge) che tira θ e φ verso 0: con pochi dati l'indice resta vicino
   a 100, così una giornata fortunata non porta nessuno in cima. Risolto per discesa a
   coordinate, ordine fisso: deterministico. Indice = 100 · e^θ (100 = nella norma
   dell'attività, 125 = +25%).
   Un'osservazione «individuale» (tablet QField proprio, raro) ha un solo membro e pesa
   quanto quattro giornate in coppia: la penalità lo gestisce da sola.

   Limite dichiarato: due persone che lavorano SEMPRE insieme non sono separabili; la stima
   le divide a metà. Per questo ogni operatore porta compagnoTop/quotaTop e il flag
   `inseparabile`. */

const PRF_OPZ_DEFAULT = {
  lambdaOp: 2,         // penalità sul contributo dell'operatore (≈ 2 giornate da solo di "prior" a 100)
  lambdaComune: 4,     // penalità sull'effetto del comune; null/0 = effetto comune spento
  clip: Math.log(4),   // un'osservazione vale al massimo ×4 o ÷4 rispetto alla mediana
  iter: 400,
  tol: 1e-6,
  z: 1.2816,           // intervallo all'80%
  quotaInseparabile: 0.8,
  minGiorniSquadraPerFlag: 3,
};

function prfMediana(valori) {
  const v = valori.filter(x => isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/* Mediana pesata: coppie [valore, peso]. */
function prfMedianaPesata(coppie) {
  const v = coppie.filter(x => isFinite(x[0]) && x[1] > 0).sort((a, b) => a[0] - b[0]);
  if (!v.length) return null;
  const tot = v.reduce((s, x) => s + x[1], 0);
  let acc = 0;
  for (let i = 0; i < v.length; i++) {
    acc += v[i][1];
    if (acc > tot / 2) return v[i][0];
    if (acc === tot / 2) return i + 1 < v.length ? (v[i][0] + v[i + 1][0]) / 2 : v[i][0];
  }
  return v[v.length - 1][0];
}

/* Affidabilità di una stima dall'informazione raccolta (somma di 1/n² sulle giornate:
   una giornata da solo vale 1, una in coppia 0,25). */
function prfAffidabilita(info) {
  if (info >= 3.75) return 'alta';      // ≈ 15 giornate in coppia
  if (info >= 1.5) return 'media';      // ≈ 6 giornate in coppia
  return 'bassa';
}

/* osservazioni: [{ pool, att, comune, membri: [nomi], resa, peso (giornate, default 1), individuale, rif }]
   → { pools: { [pool]: { pool, nOss, nGiorni, mediane: { att: resa }, sd, operatori, comuni } },
       scartate: n } */
function prfStima(osservazioni, opzioni) {
  const o = Object.assign({}, PRF_OPZ_DEFAULT, opzioni || {});
  const conComune = !!(o.lambdaComune && o.lambdaComune > 0);

  // 1. Mediana della resa per attività (sulle giornate di squadra, se ce ne sono).
  const perAtt = {};
  osservazioni.forEach(g => {
    if (!(g.resa > 0) || !g.membri || !g.membri.length) return;
    const a = perAtt[g.att] || (perAtt[g.att] = { squadra: [], tutte: [] });
    const w = g.peso > 0 ? g.peso : 1;
    a.tutte.push([g.resa, w]);
    if (!g.individuale) a.squadra.push([g.resa, w]);
  });
  const mediane = {};
  Object.keys(perAtt).forEach(k => {
    mediane[k] = prfMedianaPesata(perAtt[k].squadra.length ? perAtt[k].squadra : perAtt[k].tutte);
  });

  // 2. Valore relativo di ogni giornata, raggruppato per pool.
  const pools = {};
  let scartate = 0;
  osservazioni.forEach(g => {
    const med = mediane[g.att];
    if (!(g.resa > 0) || !(med > 0) || !g.membri || !g.membri.length) { scartate++; return; }
    const l = Math.max(-o.clip, Math.min(o.clip, Math.log(g.resa / med)));
    const p = pools[g.pool] || (pools[g.pool] = { pool: g.pool, oss: [] });
    p.oss.push({ g, l, n: g.membri.length, w: g.peso > 0 ? g.peso : 1, pred: 0 });
  });

  const out = {};
  Object.keys(pools).sort().forEach(k => { out[k] = _prfStimaPool(pools[k], mediane, o, conComune); });
  return { pools: out, mediane, scartate };
}

function _prfStimaPool(p, mediane, o, conComune) {
  const oss = p.oss;
  const nomi = [...new Set(oss.flatMap(x => x.g.membri))].sort();
  const ossDi = {};
  nomi.forEach(n => { ossDi[n] = []; });
  oss.forEach((x, i) => x.g.membri.forEach(n => ossDi[n].push(i)));
  const comuni = conComune ? [...new Set(oss.map(x => x.g.comune || ''))].filter(Boolean).sort() : [];
  const ossCom = {};
  comuni.forEach(c => { ossCom[c] = []; });
  if (conComune) oss.forEach((x, i) => { if (x.g.comune) ossCom[x.g.comune].push(i); });

  const theta = {}, phi = {}, den = {};
  nomi.forEach(n => {
    theta[n] = 0;
    den[n] = o.lambdaOp + ossDi[n].reduce((s, i) => s + oss[i].w / (oss[i].n * oss[i].n), 0);
  });
  comuni.forEach(c => { phi[c] = 0; });

  for (let it = 0; it < o.iter; it++) {
    let maxd = 0;
    nomi.forEach(n => {
      let num = 0;
      ossDi[n].forEach(i => { const x = oss[i]; num += x.w * (x.l - x.pred + theta[n] / x.n) / x.n; });
      const nuovo = num / den[n];
      const d = nuovo - theta[n];
      if (d) { ossDi[n].forEach(i => { oss[i].pred += d / oss[i].n; }); theta[n] = nuovo; }
      if (Math.abs(d) > maxd) maxd = Math.abs(d);
    });
    comuni.forEach(c => {
      const idx = ossCom[c];
      let num = 0;
      let pesi = 0;
      idx.forEach(i => { num += oss[i].w * (oss[i].l - oss[i].pred + phi[c]); pesi += oss[i].w; });
      const nuovo = num / (o.lambdaComune + pesi);
      const d = nuovo - phi[c];
      if (d) { idx.forEach(i => { oss[i].pred += d; }); phi[c] = nuovo; }
      if (Math.abs(d) > maxd) maxd = Math.abs(d);
    });
    if (maxd < o.tol) break;
  }

  // Varianza per unità di peso (un'osservazione di w giornate ha varianza σ²/w).
  const sse = oss.reduce((s, x) => s + x.w * (x.l - x.pred) * (x.l - x.pred), 0);
  const sd = Math.max(0.1, Math.sqrt(sse / Math.max(1, oss.length)));

  const operatori = {};
  nomi.forEach(n => {
    const idx = ossDi[n];
    const compagni = {};
    let giorni = 0, giorniSquadra = 0, giorniInd = 0, sommaL = 0;
    idx.forEach(i => {
      const x = oss[i];
      giorni += x.w;
      sommaL += x.w * x.l;
      if (x.g.individuale) giorniInd += x.w;
      if (x.n > 1) {
        giorniSquadra += x.w;
        x.g.membri.forEach(m => { if (m !== n) compagni[m] = (compagni[m] || 0) + x.w; });
      }
    });
    let compagnoTop = '', nTop = 0;
    Object.keys(compagni).sort().forEach(m => { if (compagni[m] > nTop) { compagnoTop = m; nTop = compagni[m]; } });
    const quotaTop = giorniSquadra ? nTop / giorniSquadra : 0;
    const info = den[n] - o.lambdaOp;
    const se = sd / Math.sqrt(den[n]);
    const t = theta[n];
    operatori[n] = {
      nome: n,
      theta: t,
      indice: 100 * Math.exp(t),
      basso: 100 * Math.exp(t - o.z * se),
      alto: 100 * Math.exp(t + o.z * se),
      grezzo: giorni ? 100 * Math.exp(sommaL / giorni) : null,  // senza togliere compagni e comuni
      giorni,
      giorniInd,
      giorniSquadra,
      info,
      affidabilita: prfAffidabilita(info),
      compagni,
      compagnoTop,
      quotaTop,
      inseparabile: giorniSquadra >= o.minGiorniSquadraPerFlag && quotaTop >= o.quotaInseparabile,
      oss: idx.map(i => ({ rif: oss[i].g.rif, l: oss[i].l, peso: oss[i].w, membri: oss[i].g.membri, individuale: !!oss[i].g.individuale, comune: oss[i].g.comune, att: oss[i].g.att })),
    };
  });

  const comuniOut = {};
  comuni.forEach(c => { comuniOut[c] = { phi: phi[c], indice: 100 * Math.exp(phi[c]), n: ossCom[c].length }; });
  const atts = [...new Set(oss.map(x => x.g.att))];
  const med = {};
  atts.forEach(a => { med[a] = mediane[a]; });
  return { pool: p.pool, nOss: oss.length, nGiorni: oss.reduce((s, x) => s + x.w, 0), mediane: med, sd, operatori, comuni: comuniOut };
}
