/* ===================== DATI INIZIALI DAL FILE EXCEL ===================== */
const INITIAL_DATA = {"pipeline": [], "operatori": [], "staffing": [], "commesse_attive": [], "giorni_lavorativi": [20, 20, 22, 21, 20, 21, 23, 21, 22, 22, 21, 21], "saturazione_baseline": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "riconciliazione": [], "attestati_disponibili": ["RSPP", "ASPP", "Preposto", "RLS", "Primo soccorso", "Defibrillatore BLS-D", "Antincendio", "Ambienti confinati", "Lavori in quota", "Segnaletica stradale - Preposto", "Segnaletica stradale - Addetto", "PES-PAV-PEI", "ENEL 1A", "ENEL 1B", "ENEL 2A", "ENEL 2B"]};
const SKILLS = ['DRONE', 'LIXEL', 'WO', 'LASER - STATICO', 'ROBOT', 'GRD', 'GPS', 'MMS', 'ALTRO'];
let ATTESTATI = INITIAL_DATA.attestati_disponibili || [];
const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const MESI_LONG = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const INDUSTRIES = ['Altre infrastrutture','Telco','Energy','Water','Robotica e AI','Trasporti','Altro'];

/* ===================== ATTESTATI: VALIDITA' E COLONNE MATRICE ===================== */
/* Durata di validita' in anni per tipo di attestato, come indicata tra parentesi nelle
   intestazioni del file "EP - Elenco attestati dei dipendenti": quel file riporta la data
   del CORSO, non la scadenza, quindi la scadenza viene calcolata (corso + N anni - 1 giorno,
   coerente con i fogli PES/Segnaletica che la scadenza ce l'hanno esplicita).
   Una voce senza durata qui viene trattata come "senza scadenza nota". */
const ATTESTATI_DURATA = {
  'RSPP': 5,
  'ASPP': 5,
  'Preposto': 2,
  'RLS': 1,
  'Primo soccorso': 3,
  'Defibrillatore BLS-D': 2,
  'Antincendio': 3,
  'Ambienti confinati': 5,
  'Lavori in quota': 5,
  'Segnaletica stradale - Preposto': 5,
  'Segnaletica stradale - Addetto': 5,
  'PES-PAV-PEI': 5,
  'ENEL 1A': 5,
  'ENEL 1B': 5,
  'ENEL 2A': 5,
  'ENEL 2B': 5,
};

/* Giorni di preavviso entro cui un attestato ancora valido viene mostrato "in scadenza". */
const ATTESTATI_PREAVVISO_GG = 90;

/* Colonne della matrice Attestati. Alcune voci del vocabolario ATTESTATI sono
   specializzazioni della stessa abilitazione (Segnaletica Preposto/Addetto, ENEL 1A..2B):
   come colonne a se' stanti sarebbero quasi tutte vuote, quindi vengono accorpate in
   un'unica colonna e la variante compare come sigla dentro la cella. */
const ATTESTATI_COLONNE = [
  { label: 'Ambienti confinati',  voci: ['Ambienti confinati'] },
  { label: 'Antincendio',         voci: ['Antincendio'] },
  { label: 'ASPP',                voci: ['ASPP'] },
  { label: 'Defibrillatore',      voci: ['Defibrillatore BLS-D'] },
  { label: 'Lavori in quota',     voci: ['Lavori in quota'] },
  { label: 'PES-PAV-PEI',         voci: ['PES-PAV-PEI', 'ENEL 1A', 'ENEL 1B', 'ENEL 2A', 'ENEL 2B'],
    sigle: { 'ENEL 1A': '1A', 'ENEL 1B': '1B', 'ENEL 2A': '2A', 'ENEL 2B': '2B' } },
  { label: 'Preposto',            voci: ['Preposto'] },
  { label: 'Primo soccorso',      voci: ['Primo soccorso'] },
  { label: 'RLS',                 voci: ['RLS'] },
  { label: 'RSPP',                voci: ['RSPP'] },
  { label: 'Segnaletica',         voci: ['Segnaletica stradale - Preposto', 'Segnaletica stradale - Addetto'],
    sigle: { 'Segnaletica stradale - Preposto': 'Prep', 'Segnaletica stradale - Addetto': 'Add' } },
];

/* ===================== ANAGRAFICA PROVINCE/REGIONI ===================== */
/* Usata per la provenienza geografica degli operatori (filtro regione/provincia
   in Pool operatori e nel picker Griglia settimanale, per trovare velocemente
   chi e' vicino a un rilievo) e per la provincia/regione di lavorazione della
   commessa. Sigla = codice targa provincia. lat/lng = coordinate del
   capoluogo, usate solo per stimare la distanza tra due province (ranking dei
   suggerimenti di allocazione), non per una geolocalizzazione precisa. */
const PROVINCE_ITALIA = [
  {sigla:'TO',nome:'Torino',regione:'Piemonte',lat:45.07,lng:7.69}, {sigla:'VC',nome:'Vercelli',regione:'Piemonte',lat:45.32,lng:8.42},
  {sigla:'NO',nome:'Novara',regione:'Piemonte',lat:45.45,lng:8.62}, {sigla:'CN',nome:'Cuneo',regione:'Piemonte',lat:44.39,lng:7.55},
  {sigla:'AT',nome:'Asti',regione:'Piemonte',lat:44.90,lng:8.21}, {sigla:'AL',nome:'Alessandria',regione:'Piemonte',lat:44.91,lng:8.61},
  {sigla:'BI',nome:'Biella',regione:'Piemonte',lat:45.57,lng:8.06}, {sigla:'VB',nome:'Verbano-Cusio-Ossola',regione:'Piemonte',lat:45.92,lng:8.55},
  {sigla:'AO',nome:'Aosta',regione:"Valle d'Aosta",lat:45.74,lng:7.32},
  {sigla:'MI',nome:'Milano',regione:'Lombardia',lat:45.46,lng:9.19}, {sigla:'BG',nome:'Bergamo',regione:'Lombardia',lat:45.69,lng:9.67},
  {sigla:'BS',nome:'Brescia',regione:'Lombardia',lat:45.54,lng:10.22}, {sigla:'PV',nome:'Pavia',regione:'Lombardia',lat:45.18,lng:9.16},
  {sigla:'CR',nome:'Cremona',regione:'Lombardia',lat:45.13,lng:10.02}, {sigla:'MN',nome:'Mantova',regione:'Lombardia',lat:45.16,lng:10.79},
  {sigla:'LC',nome:'Lecco',regione:'Lombardia',lat:45.85,lng:9.39}, {sigla:'LO',nome:'Lodi',regione:'Lombardia',lat:45.31,lng:9.50},
  {sigla:'SO',nome:'Sondrio',regione:'Lombardia',lat:46.17,lng:9.87}, {sigla:'VA',nome:'Varese',regione:'Lombardia',lat:45.82,lng:8.83},
  {sigla:'CO',nome:'Como',regione:'Lombardia',lat:45.81,lng:9.09}, {sigla:'MB',nome:'Monza e della Brianza',regione:'Lombardia',lat:45.58,lng:9.27},
  {sigla:'TN',nome:'Trento',regione:'Trentino-Alto Adige',lat:46.07,lng:11.12}, {sigla:'BZ',nome:'Bolzano',regione:'Trentino-Alto Adige',lat:46.50,lng:11.35},
  {sigla:'VR',nome:'Verona',regione:'Veneto',lat:45.44,lng:10.99}, {sigla:'VI',nome:'Vicenza',regione:'Veneto',lat:45.55,lng:11.55},
  {sigla:'BL',nome:'Belluno',regione:'Veneto',lat:46.14,lng:12.22}, {sigla:'TV',nome:'Treviso',regione:'Veneto',lat:45.67,lng:12.24},
  {sigla:'VE',nome:'Venezia',regione:'Veneto',lat:45.44,lng:12.33}, {sigla:'PD',nome:'Padova',regione:'Veneto',lat:45.41,lng:11.88},
  {sigla:'RO',nome:'Rovigo',regione:'Veneto',lat:45.07,lng:11.79},
  {sigla:'UD',nome:'Udine',regione:'Friuli-Venezia Giulia',lat:46.06,lng:13.24}, {sigla:'GO',nome:'Gorizia',regione:'Friuli-Venezia Giulia',lat:45.94,lng:13.62},
  {sigla:'TS',nome:'Trieste',regione:'Friuli-Venezia Giulia',lat:45.65,lng:13.77}, {sigla:'PN',nome:'Pordenone',regione:'Friuli-Venezia Giulia',lat:45.96,lng:12.66},
  {sigla:'GE',nome:'Genova',regione:'Liguria',lat:44.41,lng:8.93}, {sigla:'IM',nome:'Imperia',regione:'Liguria',lat:43.89,lng:8.03},
  {sigla:'SP',nome:'La Spezia',regione:'Liguria',lat:44.11,lng:9.82}, {sigla:'SV',nome:'Savona',regione:'Liguria',lat:44.31,lng:8.48},
  {sigla:'PC',nome:'Piacenza',regione:'Emilia-Romagna',lat:45.05,lng:9.69}, {sigla:'PR',nome:'Parma',regione:'Emilia-Romagna',lat:44.80,lng:10.33},
  {sigla:'RE',nome:'Reggio Emilia',regione:'Emilia-Romagna',lat:44.70,lng:10.63}, {sigla:'MO',nome:'Modena',regione:'Emilia-Romagna',lat:44.65,lng:10.93},
  {sigla:'BO',nome:'Bologna',regione:'Emilia-Romagna',lat:44.49,lng:11.34}, {sigla:'FE',nome:'Ferrara',regione:'Emilia-Romagna',lat:44.84,lng:11.62},
  {sigla:'RA',nome:'Ravenna',regione:'Emilia-Romagna',lat:44.42,lng:12.20}, {sigla:'FC',nome:'Forlì-Cesena',regione:'Emilia-Romagna',lat:44.22,lng:12.04},
  {sigla:'RN',nome:'Rimini',regione:'Emilia-Romagna',lat:44.06,lng:12.57},
  {sigla:'MS',nome:'Massa-Carrara',regione:'Toscana',lat:44.03,lng:10.14}, {sigla:'LU',nome:'Lucca',regione:'Toscana',lat:43.84,lng:10.50},
  {sigla:'PT',nome:'Pistoia',regione:'Toscana',lat:43.93,lng:10.92}, {sigla:'FI',nome:'Firenze',regione:'Toscana',lat:43.77,lng:11.26},
  {sigla:'LI',nome:'Livorno',regione:'Toscana',lat:43.55,lng:10.31}, {sigla:'PI',nome:'Pisa',regione:'Toscana',lat:43.72,lng:10.40},
  {sigla:'AR',nome:'Arezzo',regione:'Toscana',lat:43.46,lng:11.88}, {sigla:'SI',nome:'Siena',regione:'Toscana',lat:43.32,lng:11.33},
  {sigla:'GR',nome:'Grosseto',regione:'Toscana',lat:42.76,lng:11.11}, {sigla:'PO',nome:'Prato',regione:'Toscana',lat:43.88,lng:11.10},
  {sigla:'PG',nome:'Perugia',regione:'Umbria',lat:43.11,lng:12.39}, {sigla:'TR',nome:'Terni',regione:'Umbria',lat:42.56,lng:12.65},
  {sigla:'PU',nome:'Pesaro e Urbino',regione:'Marche',lat:43.91,lng:12.91}, {sigla:'AN',nome:'Ancona',regione:'Marche',lat:43.62,lng:13.52},
  {sigla:'MC',nome:'Macerata',regione:'Marche',lat:43.30,lng:13.45}, {sigla:'AP',nome:'Ascoli Piceno',regione:'Marche',lat:42.85,lng:13.58},
  {sigla:'FM',nome:'Fermo',regione:'Marche',lat:43.16,lng:13.72},
  {sigla:'VT',nome:'Viterbo',regione:'Lazio',lat:42.42,lng:12.11}, {sigla:'RI',nome:'Rieti',regione:'Lazio',lat:42.40,lng:12.86},
  {sigla:'RM',nome:'Roma',regione:'Lazio',lat:41.90,lng:12.50}, {sigla:'LT',nome:'Latina',regione:'Lazio',lat:41.47,lng:12.90},
  {sigla:'FR',nome:'Frosinone',regione:'Lazio',lat:41.64,lng:13.35},
  {sigla:'AQ',nome:"L'Aquila",regione:'Abruzzo',lat:42.35,lng:13.40}, {sigla:'TE',nome:'Teramo',regione:'Abruzzo',lat:42.66,lng:13.70},
  {sigla:'PE',nome:'Pescara',regione:'Abruzzo',lat:42.46,lng:14.21}, {sigla:'CH',nome:'Chieti',regione:'Abruzzo',lat:42.35,lng:14.17},
  {sigla:'CB',nome:'Campobasso',regione:'Molise',lat:41.56,lng:14.66}, {sigla:'IS',nome:'Isernia',regione:'Molise',lat:41.60,lng:14.23},
  {sigla:'CE',nome:'Caserta',regione:'Campania',lat:41.07,lng:14.33}, {sigla:'BN',nome:'Benevento',regione:'Campania',lat:41.13,lng:14.78},
  {sigla:'NA',nome:'Napoli',regione:'Campania',lat:40.85,lng:14.27}, {sigla:'AV',nome:'Avellino',regione:'Campania',lat:40.91,lng:14.79},
  {sigla:'SA',nome:'Salerno',regione:'Campania',lat:40.68,lng:14.77},
  {sigla:'FG',nome:'Foggia',regione:'Puglia',lat:41.46,lng:15.55}, {sigla:'BA',nome:'Bari',regione:'Puglia',lat:41.12,lng:16.87},
  {sigla:'TA',nome:'Taranto',regione:'Puglia',lat:40.47,lng:17.24}, {sigla:'BR',nome:'Brindisi',regione:'Puglia',lat:40.64,lng:17.94},
  {sigla:'LE',nome:'Lecce',regione:'Puglia',lat:40.35,lng:18.17}, {sigla:'BT',nome:'Barletta-Andria-Trani',regione:'Puglia',lat:41.23,lng:16.30},
  {sigla:'PZ',nome:'Potenza',regione:'Basilicata',lat:40.64,lng:15.81}, {sigla:'MT',nome:'Matera',regione:'Basilicata',lat:40.67,lng:16.60},
  {sigla:'CS',nome:'Cosenza',regione:'Calabria',lat:39.30,lng:16.25}, {sigla:'KR',nome:'Crotone',regione:'Calabria',lat:39.08,lng:17.13},
  {sigla:'CZ',nome:'Catanzaro',regione:'Calabria',lat:38.91,lng:16.60}, {sigla:'VV',nome:'Vibo Valentia',regione:'Calabria',lat:38.68,lng:16.10},
  {sigla:'RC',nome:'Reggio Calabria',regione:'Calabria',lat:38.11,lng:15.65},
  {sigla:'TP',nome:'Trapani',regione:'Sicilia',lat:38.02,lng:12.53}, {sigla:'PA',nome:'Palermo',regione:'Sicilia',lat:38.12,lng:13.36},
  {sigla:'ME',nome:'Messina',regione:'Sicilia',lat:38.19,lng:15.55}, {sigla:'AG',nome:'Agrigento',regione:'Sicilia',lat:37.31,lng:13.58},
  {sigla:'CL',nome:'Caltanissetta',regione:'Sicilia',lat:37.49,lng:14.06}, {sigla:'EN',nome:'Enna',regione:'Sicilia',lat:37.57,lng:14.28},
  {sigla:'CT',nome:'Catania',regione:'Sicilia',lat:37.51,lng:15.08}, {sigla:'RG',nome:'Ragusa',regione:'Sicilia',lat:36.93,lng:14.73},
  {sigla:'SR',nome:'Siracusa',regione:'Sicilia',lat:37.07,lng:15.29},
  {sigla:'SS',nome:'Sassari',regione:'Sardegna',lat:40.73,lng:8.56}, {sigla:'NU',nome:'Nuoro',regione:'Sardegna',lat:40.32,lng:9.33},
  {sigla:'CA',nome:'Cagliari',regione:'Sardegna',lat:39.22,lng:9.12}, {sigla:'OR',nome:'Oristano',regione:'Sardegna',lat:39.90,lng:8.59},
  {sigla:'SU',nome:'Sud Sardegna',regione:'Sardegna',lat:39.17,lng:8.53},
];
const REGIONI_ITALIA = [...new Set(PROVINCE_ITALIA.map(p => p.regione))].sort((a,b) => a.localeCompare(b));
function provinciaInfo(sigla) { return PROVINCE_ITALIA.find(p => p.sigla === sigla) || null; }
function provinceDiRegione(regione) { return PROVINCE_ITALIA.filter(p => p.regione === regione).sort((a,b) => a.nome.localeCompare(b.nome)); }
/* Regione di un operatore: usa il campo regione se valorizzato (provincia
   facoltativa, spesso ignota), altrimenti la deriva dalla provincia nota. */
function operatoreRegione(op) { return (op && (op.regione || (op.provincia && provinciaInfo(op.provincia)?.regione))) || ''; }

function haversineKm(latA, lngA, latB, lngB) {
  const R = 6371;
  const dLat = (latB - latA) * Math.PI / 180;
  const dLng = (lngB - lngA) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(latA*Math.PI/180) * Math.cos(latB*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}
/* Distanza approssimata (km, haversine tra i capoluoghi) tra due province,
   usata per ordinare i suggerimenti di allocazione per vicinanza geografica.
   Ritorna null se una delle due sigle non e' nota (nessun criterio di distanza
   applicabile: chi chiama deve trattarlo come "sconosciuto", non come "vicino"). */
function distanzaProvince(siglaA, siglaB) {
  if (!siglaA || !siglaB) return null;
  if (siglaA === siglaB) return 0;
  const a = provinciaInfo(siglaA), b = provinciaInfo(siglaB);
  if (!a || !b) return null;
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}
function regioneCentroid(regione) {
  const province = provinceDiRegione(regione);
  if (!province.length) return null;
  return {
    lat: province.reduce((s,p) => s + p.lat, 0) / province.length,
    lng: province.reduce((s,p) => s + p.lng, 0) / province.length,
  };
}
/* Distanza "di lavorazione" tra una commessa (nota per regione e/o provincia)
   e la provenienza di un operatore. Usa la provincia della commessa se nota
   (piu' precisa, vedi distanzaProvince); se la commessa ha solo la regione,
   approssima con il centroide della regione — 0 se l'operatore e' della
   stessa regione. Se la provincia dell'operatore non e' nota (facoltativa)
   ma lo e' la sua regione, approssima anche l'operatore con il centroide
   della sua regione. Ritorna null se non c'e' nessun criterio applicabile. */
function distanzaLavorazione(regioneCommessa, provinciaCommessa, siglaOperatore, regioneOperatore) {
  if (siglaOperatore) {
    if (provinciaCommessa) return distanzaProvince(provinciaCommessa, siglaOperatore);
    if (!regioneCommessa) return null;
    const opInfo = provinciaInfo(siglaOperatore);
    if (!opInfo) return null;
    if (opInfo.regione === regioneCommessa) return 0;
    const centro = regioneCentroid(regioneCommessa);
    if (!centro) return null;
    return haversineKm(centro.lat, centro.lng, opInfo.lat, opInfo.lng);
  }
  if (!regioneOperatore) return null;
  const regioneCommessaEffettiva = regioneCommessa || (provinciaCommessa && provinciaInfo(provinciaCommessa)?.regione) || '';
  if (!regioneCommessaEffettiva) return null;
  if (regioneOperatore === regioneCommessaEffettiva) return 0;
  const centroOp = regioneCentroid(regioneOperatore);
  const centroCommessa = provinciaCommessa ? provinciaInfo(provinciaCommessa) : regioneCentroid(regioneCommessaEffettiva);
  if (!centroOp || !centroCommessa) return null;
  return haversineKm(centroCommessa.lat, centroCommessa.lng, centroOp.lat, centroOp.lng);
}
let ANNO = parseInt(localStorage.getItem('dashboard_anno') || String(new Date().getFullYear()));

/* Indice 0-11 del mese corrente di riferimento.
   Mesi precedenti = storici: NON contano per saturazione, gap analysis, suggerimenti. */
function meseCorrente() {
  const now = new Date();
  if (now.getFullYear() < ANNO) return 0;
  if (now.getFullYear() > ANNO) return 11;
  return now.getMonth();
}
function soloFuturi(mesi) { const mc = meseCorrente(); return mesi.filter(i => i >= mc); }

/* ===================== STATO RUNTIME ===================== */
let state = {
  pipeline: [],
  operatori: [],
  staffing: [],
  commesse_attive: [],
  commesse_chiuse: [],
  commesse_escluse: [], // lista permanente: nomi esclusi per sempre dai dati attivi, anche se rimossi dall'archivio
  commesse_attive_meta: {}, // {[nome]: {cliente,industry,inizio,fine,note,skills,attestati_richiesti,dpi_richiesti}}
  assegnazioni: [],
  dpi_disponibili: ['Casco', 'Occhiali protettivi', 'Guanti di sicurezza', 'Scarpe antinfortunistiche', 'Giubbotto di sicurezza', 'Cintura di sicurezza', 'Imbracatura', 'Mascherina/Respiratore', 'Camice/Tuta protettiva', 'Altro'],
  activeTab: 'pipeline',
  filters: { search:'', skills:new Set(), attestati:new Set(), lowSat:false, regione:'', provincia:'', showEx:false },
  searchCommesse: '',
  // Registro attestati importato da Excel: archivio grezzo dell'ultimo import, che copre
  // TUTTI i dipendenti del file (anche chi non e' nel pool operatori del reparto rilievi).
  // Per chi e' nel pool la fonte autorevole resta op.attestati_dett, che puo' contenere
  // anche correzioni manuali fatte dalla scheda operatore. Vedi dashboard-attestati.js.
  attestati_registro: { aggiornato_il: '', file: '', da: '', dipendenti: [] },
};

