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
                             'nord', 'sud', 'est', 'ovest', 'centro', 'zona', 'lotto', 'fase', 'bis', 'ter'];

function geoNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[''`´_.\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
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
  return { sigla, tentativi };
}

function _geoStessoNome(r, qn) {
  const n = geoNorm(r.name || '');
  return n === qn || n.replace(/ /g, '') === qn.replace(/ /g, '');
}

function _geoPunto(r) {
  return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name };
}

/* Fra i risultati di UNA ricerca: comuni e centri abitati soltanto. Ordine: nome
   identico prima, poi comune prima di frazione, poi l'ordine di Nominatim. Con la
   sigla restano i risultati di quella provincia (se ce ne sono). Nomi di 1-2 lettere
   («Ne», «Re») solo se identici, altrimenti «p» o «da» trovano qualunque cosa. */
function geoScegli(risultati, q, sigla) {
  if (!Array.isArray(risultati) || !risultati.length) return null;
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
    valutati.push({ r, i, tipo, nome });
  });
  if (!valutati.length) return null;
  valutati.sort((a, b) => a.nome - b.nome || a.tipo - b.tipo || a.i - b.i);
  return _geoPunto(valutati[0].r);
}

/* → {lat,lng,label} | null (non trovato). `cerca(q)` = async, restituisce l'array di
   risultati Nominatim per GEO_NOMINATIM_URL + q; un suo errore (rete) si propaga, così
   chi chiama non scambia un guasto per un «non trovato». Nessun ripiego su strade,
   ponti, esercizi: un cantiere è un comune, e un nome che non lo è («Viaggio» →
   Punta Viaggio a Ponza) è meglio «non trovato» e corretto a mano con la ✏️. */
async function geoCercaComune(nome, cerca) {
  const { sigla, tentativi } = geoTentativi(nome);
  for (let i = 0; i < tentativi.length; i++) {
    const g = geoScegli(await cerca(tentativi[i]), tentativi[i], sigla);
    if (g) return g;
  }
  return null;
}
