/* ===== GEOCODIFICA COMUNI (modulo puro) ===== */
/* Sceglie, fra i risultati di Nominatim, il COMUNE (o centro abitato) che corrisponde
   al nome di un cantiere. Modulo puro: niente DOM, niente fetch, niente globali — la
   ricerca in rete la passa chi chiama (`cerca`), così lo stesso codice gira nell'app
   (geocodifica() in weekly-mappa.js, Pianifica spostamenti) e negli script di verifica
   della rubrica luoghi.

   Perché (v18.322.0): la vecchia ricerca prendeva il primo risultato di
   `q=<nome>&limit=1`, senza filtro di nazione. Per i capoluoghi il primo risultato è
   la PROVINCIA (più «importante»), il cui punto è il baricentro del territorio:
   Sondrio finiva a 35 km dalla città, in alta Valtellina; Livorno in mare. In più
   omonimi esteri (Sarre → Saarland, Ossasco → Svizzera), nomi con «Auto»/«IP»
   trovati come officine o distributori (Malo Auto → Camerun) e casi come
   Temù → fiume Temo in Sardegna. Qui: solo Italia, mai aree amministrative più grandi
   del comune, nome esatto prima, sigla provincia facoltativa, e parole finali tolte
   una alla volta se il nome intero non è un luogo abitato. */

const GEO_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10' +
                          '&countrycodes=it&accept-language=it&q=';
const GEO_TIPI_COMUNE = ['city', 'town', 'village', 'municipality'];
const GEO_TIPI_FRAZIONE = ['hamlet', 'suburb', 'quarter', 'neighbourhood', 'isolated_dwelling', 'locality', 'croft', 'city_district'];
/* Parole di servizio che i planner aggiungono dopo il comune (tipo di rilievo, rete,
   zona). Si tolgono SOLO queste: togliere un'ultima parola qualsiasi trasformava nomi
   veri o scritti male in un altro comune («Castiglione Fiorentino» → Castiglione in
   Piemonte, «Ponte di Legnono» → Ponte (BN)); meglio «non trovato» e la ✏️. */
const GEO_PAROLE_SERVIZIO = ['auto', 'post', 'pre', 'ip', 'pi', 'fogna', 'fognatura', 'fgn', 'acq', 'acquedotto', 'h2o',
                             'gas', 'bianca', 'nera', 'mms', 'pedestrian', 'ped', 'rilievo', 'rilievi', 'comune',
                             'nord', 'sud', 'est', 'ovest', 'centro', 'zona', 'lotto', 'fase', 'parte', 'bis', 'ter'];

const GEO_PREFISSI_ATTACCATI = /^(Monte|Castel|Castello|Borgo|Villa|Ponte|Porto|Rocca|Torre|Pieve|Colle|Serra|Pozzo|Fonte|Casal|Val)([a-zà-ù]{3,}.*)$/i;

function geoNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019`\u00b4_.\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* "Ivrea (TO)" / "Montefortino, FM" → sigla 'TO'/'FM'; altre note fra parentesi e i «?»
   si scartano («Morbegno (chiedere Russo)»). Poi i nomi da provare in ordine: intero,
   prima parte di "A - B", e il nome senza le parole di servizio finali
   (GEO_PAROLE_SERVIZIO o numeri: «San Quirino Auto» → «San Quirino»). */
function geoTentativi(nome) {
  let base = String(nome || '').trim();
  let sigla = '';
  const m = base.match(/^(.*?)\s*(?:\(\s*([A-Za-z]{2})\s*\)|,\s*([A-Za-z]{2}))\s*$/);
  if (m && m[1]) { base = m[1].trim(); sigla = (m[2] || m[3]).toUpperCase(); }
  base = base.replace(/\([^)]*\)?/g, ' ').replace(/\?/g, ' ').replace(/\s+/g, ' ').trim();
  const tentativi = [];
  const aggiungi = t => {
    t = t.replace(/\s+/g, ' ').replace(/[\s\-–,;:\/_.]+$/, '').trim();
    if (geoNorm(t).length >= 2 && tentativi.indexOf(t) < 0) tentativi.push(t);
  };
  aggiungi(base);
  const parti = base.split(/\s+-\s+|_|\s+\/\s+/);
  if (parti.length > 1) aggiungi(parti[0]);
  const parole = base.split(/\s+/);
  let k = parole.length;
  const servizio = p => { const n = geoNorm(p); return !n || /^\d+$/.test(n) || GEO_PAROLE_SERVIZIO.indexOf(n) >= 0; };
  while (k > 1 && servizio(parole[k - 1])) k--;
  if (k < parole.length) aggiungi(parole.slice(0, k).join(' '));
  // «Montecavallo» → «Monte Cavallo», «Castelgoffredo» → «Castel Goffredo»: la ricerca
  // non trova il comune con le parole attaccate (né viceversa)
  tentativi.slice().forEach(t => {
    const s = t.match(GEO_PREFISSI_ATTACCATI);
    if (s) aggiungi(s[1] + ' ' + s[2]);
  });
  return { sigla, tentativi };
}

function _geoStessoNome(r, qn) {
  const n = geoNorm(r.name || '');
  return n === qn || n.replace(/ /g, '') === qn.replace(/ /g, '');
}

function _geoPunto(r) {
  return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name };
}

/* ---------- contesto: provincia/regione della commessa, cantieri vicini ----------
   Fra comuni omonimi (Castiglione, Laino, Santa Barbara, Serravalle…) Nominatim mette
   prima il più «importante», che spesso non è quello giusto. Chi chiama può passare un
   contesto `{ province: ['AR'], regioni: ['Toscana'], punti: [{lat,lng}] }`: provincia e
   regione delle commesse che usano quel cantiere (campi della commessa) e la posizione
   degli altri cantieri della stessa squadra nella stessa settimana. Livello di un
   candidato: 0 = nella provincia (o, se nessuna provincia è nota, nella regione o entro
   GEO_VICINO_KM da quei punti), 1 = nella regione o vicino (con provincia nota),
   2 = fuori. Essere nella zona conta prima del nome identico: per una squadra in
   Calabria vince Laino Borgo su Laino (CO); la provincia decide solo a parità di nome. Senza contesto la scelta è quella di prima. */
const GEO_VICINO_KM = 80;
const GEO_RIQUADRO_GRADI = 0.6;   // margine del riquadro di ricerca attorno ai cantieri vicini
const GEO_RIQUADRO_MAX_GRADI = 5; // punti sparsi su più di così: niente ricerca nel riquadro

function _geoRegNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
}

function _geoKm(a, b) {
  const r = Math.PI / 180;
  const dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/* Contesto ripulito, o null se non c'è nulla. */
function _geoContesto(ctx) {
  if (!ctx) return null;
  if (ctx.pulito) return ctx;
  const nomiRegioni = [...new Set((ctx.regioni || []).filter(r => _geoRegNorm(r).length >= 4))];
  const regioni = nomiRegioni.map(_geoRegNorm);
  const province = [...new Set((ctx.province || []).map(p => String(p || '').trim().toUpperCase()).filter(p => /^[A-Z]{2}$/.test(p)))];
  const punti = (ctx.punti || []).filter(p => p && isFinite(p.lat) && isFinite(p.lng) && (p.lat || p.lng));
  return regioni.length || province.length || punti.length ? { pulito: true, regioni, nomiRegioni, province, punti } : null;
}

function _geoLivello(r, c) {
  if (!c) return { livello: 0, km: 0 };
  const p = _geoPunto(r);
  const km = c.punti.length ? Math.min.apply(null, c.punti.map(q => _geoKm(p, q))) : null;
  const stato = _geoRegNorm(r.address && r.address.state);
  const inRegione = !!stato && c.regioni.some(x => stato.startsWith(x) || x.startsWith(stato));
  const zona = inRegione || (km != null && km <= GEO_VICINO_KM);
  const iso = r.address && r.address['ISO3166-2-lvl6'];
  const livello = c.province.length
    ? (c.province.some(s => iso === 'IT-' + s) ? 0 : zona ? 1 : 2)
    : (zona ? 0 : 2);
  return { livello, km: km == null ? 0 : km };
}

/* Riquadro "lon1,lat1,lon2,lat2" attorno ai punti, o '' se troppo sparsi */
function _geoRiquadro(punti) {
  if (!punti.length) return '';
  const lats = punti.map(p => p.lat), lngs = punti.map(p => p.lng);
  const la1 = Math.min.apply(null, lats) - GEO_RIQUADRO_GRADI, la2 = Math.max.apply(null, lats) + GEO_RIQUADRO_GRADI;
  const lo1 = Math.min.apply(null, lngs) - GEO_RIQUADRO_GRADI, lo2 = Math.max.apply(null, lngs) + GEO_RIQUADRO_GRADI;
  if (la2 - la1 > GEO_RIQUADRO_MAX_GRADI || lo2 - lo1 > GEO_RIQUADRO_MAX_GRADI) return '';
  return [lo1, la1, lo2, la2].map(v => v.toFixed(3)).join(',');
}

/* Fra i risultati di UNA ricerca: comuni e centri abitati soltanto. Ordine: fuori zona in
   fondo, nome identico, provincia, comune prima di frazione, il più vicino ai cantieri
   della squadra, l'ordine di Nominatim. Con la sigla restano i risultati di quella provincia
   (se ce ne sono). Nomi di 1-2 lettere («Ne», «Re») solo se identici, altrimenti «p» o
   «da» trovano qualunque cosa. → { punto: {lat,lng,label}, livello } | null */
function geoScegli(risultati, q, sigla, ctx) {
  if (!Array.isArray(risultati) || !risultati.length) return null;
  const c = _geoContesto(ctx);
  const qn = geoNorm(q);
  let cand = risultati;
  if (sigla) {
    const inProv = cand.filter(r => r.address && r.address['ISO3166-2-lvl6'] === 'IT-' + sigla);
    if (inProv.length) cand = inProv;
  }
  const valutati = [];
  cand.forEach((r, i) => {
    const tipo = GEO_TIPI_COMUNE.indexOf(r.addresstype) >= 0 ? 0
               : GEO_TIPI_FRAZIONE.indexOf(r.addresstype) >= 0 ? 1 : -1;
    if (tipo < 0) return;
    const nome = _geoStessoNome(r, qn) ? 0 : 1;
    if (qn.length < 3 && nome) return;
    const lv = _geoLivello(r, c);
    valutati.push({ r, i, tipo, nome, livello: lv.livello, km: lv.km });
  });
  if (!valutati.length) return null;
  // fuori zona in fondo; nella zona il nome identico prima della provincia, così una
  // frazione omonima nella provincia della commessa non batte il comune giusto in quella accanto
  const fuori = x => x.livello === 2 ? 1 : 0;
  valutati.sort((a, b) => fuori(a) - fuori(b) || a.nome - b.nome || a.livello - b.livello || a.tipo - b.tipo || a.km - b.km || a.i - b.i);
  return { punto: _geoPunto(valutati[0].r), livello: valutati[0].livello };
}

/* → {lat,lng,label} | null (non trovato). `cerca(q, opz)` = async, restituisce l'array
   di risultati Nominatim per GEO_NOMINATIM_URL + q (opz.viewbox = riquadro in cui
   cercare soltanto); un suo errore (rete) si propaga, così chi chiama non scambia un
   guasto per un «non trovato». Senza contesto vince il primo tentativo che trova un
   luogo abitato. Con un contesto (vedi sopra) ci si ferma solo a un candidato di livello
   0: altrimenti, per ogni tentativo che trova il nome altrove, si cerca ancora
   «nome, Regione» e dentro il riquadro dei cantieri vicini, poi i tentativi successivi;
   alla fine vale il candidato di livello migliore (il primo trovato a parità). Nessun
   ripiego su strade, ponti, esercizi: un cantiere è un comune, e un nome che non lo è
   («Viaggio» → Punta Viaggio a Ponza) è meglio «non trovato» e corretto a mano con la ✏️. */
async function geoCercaComune(nome, cerca, ctx) {
  const { sigla, tentativi } = geoTentativi(nome);
  const c = _geoContesto(ctx);
  let migliore = null;
  const prendi = g => {
    if (g && (!migliore || g.livello < migliore.livello)) migliore = g;
    return !!migliore && migliore.livello === 0;
  };
  for (const t of tentativi) {
    const ris = await cerca(t);
    const g = geoScegli(ris, t, sigla, c);
    if (prendi(g)) return migliore.punto;
    if (!c) continue;
    if (!g) continue;              // il nome non è un luogo abitato da nessuna parte
    let tutti = ris.slice();
    const extra = c.nomiRegioni.slice(0, 2).map(reg => () => cerca(t + ', ' + reg));
    const box = _geoRiquadro(c.punti);
    if (box) extra.push(() => cerca(t, { viewbox: box }));
    for (const f of extra) {
      tutti = tutti.concat(await f());
      if (prendi(geoScegli(tutti, t, sigla, c))) return migliore.punto;
    }
  }
  return migliore ? migliore.punto : null;
}
