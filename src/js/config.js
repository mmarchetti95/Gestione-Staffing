/* ===================== DATI INIZIALI DAL FILE EXCEL ===================== */
const INITIAL_DATA = {"pipeline": [], "operatori": [], "staffing": [], "commesse_attive": [], "giorni_lavorativi": [20, 20, 22, 21, 20, 21, 23, 21, 22, 22, 21, 21], "saturazione_baseline": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "riconciliazione": [], "attestati_disponibili": ["RSPP", "ASPP", "Preposto", "RLS", "Primo soccorso", "Defibrillatore BLS-D", "Antincendio", "Ambienti confinati", "Lavori in quota", "Segnaletica stradale - Preposto", "Segnaletica stradale - Addetto", "PES-PAV-PEI", "ENEL 1A", "ENEL 1B", "ENEL 2A", "ENEL 2B"]};
const SKILLS = ['DRONE', 'LIXEL', 'WO', 'LASER - STATICO', 'ROBOT', 'GRD', 'GPS', 'MMS', 'ALTRO'];
let ATTESTATI = INITIAL_DATA.attestati_disponibili || [];
const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const MESI_LONG = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const INDUSTRIES = ['Altre infrastrutture','Telco','Energy','Water','Robotica e AI','Trasporti','Altro'];

/* ===================== ANAGRAFICA PROVINCE/REGIONI ===================== */
/* Usata per la provenienza geografica degli operatori (filtro regione/provincia
   in Pool operatori e nel picker Griglia settimanale, per trovare velocemente
   chi e' vicino a un rilievo). Sigla = codice targa provincia. */
const PROVINCE_ITALIA = [
  {sigla:'TO',nome:'Torino',regione:'Piemonte'}, {sigla:'VC',nome:'Vercelli',regione:'Piemonte'},
  {sigla:'NO',nome:'Novara',regione:'Piemonte'}, {sigla:'CN',nome:'Cuneo',regione:'Piemonte'},
  {sigla:'AT',nome:'Asti',regione:'Piemonte'}, {sigla:'AL',nome:'Alessandria',regione:'Piemonte'},
  {sigla:'BI',nome:'Biella',regione:'Piemonte'}, {sigla:'VB',nome:'Verbano-Cusio-Ossola',regione:'Piemonte'},
  {sigla:'AO',nome:'Aosta',regione:"Valle d'Aosta"},
  {sigla:'MI',nome:'Milano',regione:'Lombardia'}, {sigla:'BG',nome:'Bergamo',regione:'Lombardia'},
  {sigla:'BS',nome:'Brescia',regione:'Lombardia'}, {sigla:'PV',nome:'Pavia',regione:'Lombardia'},
  {sigla:'CR',nome:'Cremona',regione:'Lombardia'}, {sigla:'MN',nome:'Mantova',regione:'Lombardia'},
  {sigla:'LC',nome:'Lecco',regione:'Lombardia'}, {sigla:'LO',nome:'Lodi',regione:'Lombardia'},
  {sigla:'SO',nome:'Sondrio',regione:'Lombardia'}, {sigla:'VA',nome:'Varese',regione:'Lombardia'},
  {sigla:'CO',nome:'Como',regione:'Lombardia'}, {sigla:'MB',nome:'Monza e della Brianza',regione:'Lombardia'},
  {sigla:'TN',nome:'Trento',regione:'Trentino-Alto Adige'}, {sigla:'BZ',nome:'Bolzano',regione:'Trentino-Alto Adige'},
  {sigla:'VR',nome:'Verona',regione:'Veneto'}, {sigla:'VI',nome:'Vicenza',regione:'Veneto'},
  {sigla:'BL',nome:'Belluno',regione:'Veneto'}, {sigla:'TV',nome:'Treviso',regione:'Veneto'},
  {sigla:'VE',nome:'Venezia',regione:'Veneto'}, {sigla:'PD',nome:'Padova',regione:'Veneto'},
  {sigla:'RO',nome:'Rovigo',regione:'Veneto'},
  {sigla:'UD',nome:'Udine',regione:'Friuli-Venezia Giulia'}, {sigla:'GO',nome:'Gorizia',regione:'Friuli-Venezia Giulia'},
  {sigla:'TS',nome:'Trieste',regione:'Friuli-Venezia Giulia'}, {sigla:'PN',nome:'Pordenone',regione:'Friuli-Venezia Giulia'},
  {sigla:'GE',nome:'Genova',regione:'Liguria'}, {sigla:'IM',nome:'Imperia',regione:'Liguria'},
  {sigla:'SP',nome:'La Spezia',regione:'Liguria'}, {sigla:'SV',nome:'Savona',regione:'Liguria'},
  {sigla:'PC',nome:'Piacenza',regione:'Emilia-Romagna'}, {sigla:'PR',nome:'Parma',regione:'Emilia-Romagna'},
  {sigla:'RE',nome:'Reggio Emilia',regione:'Emilia-Romagna'}, {sigla:'MO',nome:'Modena',regione:'Emilia-Romagna'},
  {sigla:'BO',nome:'Bologna',regione:'Emilia-Romagna'}, {sigla:'FE',nome:'Ferrara',regione:'Emilia-Romagna'},
  {sigla:'RA',nome:'Ravenna',regione:'Emilia-Romagna'}, {sigla:'FC',nome:'Forlì-Cesena',regione:'Emilia-Romagna'},
  {sigla:'RN',nome:'Rimini',regione:'Emilia-Romagna'},
  {sigla:'MS',nome:'Massa-Carrara',regione:'Toscana'}, {sigla:'LU',nome:'Lucca',regione:'Toscana'},
  {sigla:'PT',nome:'Pistoia',regione:'Toscana'}, {sigla:'FI',nome:'Firenze',regione:'Toscana'},
  {sigla:'LI',nome:'Livorno',regione:'Toscana'}, {sigla:'PI',nome:'Pisa',regione:'Toscana'},
  {sigla:'AR',nome:'Arezzo',regione:'Toscana'}, {sigla:'SI',nome:'Siena',regione:'Toscana'},
  {sigla:'GR',nome:'Grosseto',regione:'Toscana'}, {sigla:'PO',nome:'Prato',regione:'Toscana'},
  {sigla:'PG',nome:'Perugia',regione:'Umbria'}, {sigla:'TR',nome:'Terni',regione:'Umbria'},
  {sigla:'PU',nome:'Pesaro e Urbino',regione:'Marche'}, {sigla:'AN',nome:'Ancona',regione:'Marche'},
  {sigla:'MC',nome:'Macerata',regione:'Marche'}, {sigla:'AP',nome:'Ascoli Piceno',regione:'Marche'},
  {sigla:'FM',nome:'Fermo',regione:'Marche'},
  {sigla:'VT',nome:'Viterbo',regione:'Lazio'}, {sigla:'RI',nome:'Rieti',regione:'Lazio'},
  {sigla:'RM',nome:'Roma',regione:'Lazio'}, {sigla:'LT',nome:'Latina',regione:'Lazio'},
  {sigla:'FR',nome:'Frosinone',regione:'Lazio'},
  {sigla:'AQ',nome:"L'Aquila",regione:'Abruzzo'}, {sigla:'TE',nome:'Teramo',regione:'Abruzzo'},
  {sigla:'PE',nome:'Pescara',regione:'Abruzzo'}, {sigla:'CH',nome:'Chieti',regione:'Abruzzo'},
  {sigla:'CB',nome:'Campobasso',regione:'Molise'}, {sigla:'IS',nome:'Isernia',regione:'Molise'},
  {sigla:'CE',nome:'Caserta',regione:'Campania'}, {sigla:'BN',nome:'Benevento',regione:'Campania'},
  {sigla:'NA',nome:'Napoli',regione:'Campania'}, {sigla:'AV',nome:'Avellino',regione:'Campania'},
  {sigla:'SA',nome:'Salerno',regione:'Campania'},
  {sigla:'FG',nome:'Foggia',regione:'Puglia'}, {sigla:'BA',nome:'Bari',regione:'Puglia'},
  {sigla:'TA',nome:'Taranto',regione:'Puglia'}, {sigla:'BR',nome:'Brindisi',regione:'Puglia'},
  {sigla:'LE',nome:'Lecce',regione:'Puglia'}, {sigla:'BT',nome:'Barletta-Andria-Trani',regione:'Puglia'},
  {sigla:'PZ',nome:'Potenza',regione:'Basilicata'}, {sigla:'MT',nome:'Matera',regione:'Basilicata'},
  {sigla:'CS',nome:'Cosenza',regione:'Calabria'}, {sigla:'KR',nome:'Crotone',regione:'Calabria'},
  {sigla:'CZ',nome:'Catanzaro',regione:'Calabria'}, {sigla:'VV',nome:'Vibo Valentia',regione:'Calabria'},
  {sigla:'RC',nome:'Reggio Calabria',regione:'Calabria'},
  {sigla:'TP',nome:'Trapani',regione:'Sicilia'}, {sigla:'PA',nome:'Palermo',regione:'Sicilia'},
  {sigla:'ME',nome:'Messina',regione:'Sicilia'}, {sigla:'AG',nome:'Agrigento',regione:'Sicilia'},
  {sigla:'CL',nome:'Caltanissetta',regione:'Sicilia'}, {sigla:'EN',nome:'Enna',regione:'Sicilia'},
  {sigla:'CT',nome:'Catania',regione:'Sicilia'}, {sigla:'RG',nome:'Ragusa',regione:'Sicilia'},
  {sigla:'SR',nome:'Siracusa',regione:'Sicilia'},
  {sigla:'SS',nome:'Sassari',regione:'Sardegna'}, {sigla:'NU',nome:'Nuoro',regione:'Sardegna'},
  {sigla:'CA',nome:'Cagliari',regione:'Sardegna'}, {sigla:'OR',nome:'Oristano',regione:'Sardegna'},
  {sigla:'SU',nome:'Sud Sardegna',regione:'Sardegna'},
];
const REGIONI_ITALIA = [...new Set(PROVINCE_ITALIA.map(p => p.regione))].sort((a,b) => a.localeCompare(b));
function provinciaInfo(sigla) { return PROVINCE_ITALIA.find(p => p.sigla === sigla) || null; }
function provinceDiRegione(regione) { return PROVINCE_ITALIA.filter(p => p.regione === regione).sort((a,b) => a.nome.localeCompare(b.nome)); }
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
  commesse_attive_meta: {}, // {[nome]: {cliente,industry,inizio,fine,note,skills,attestati_richiesti}}
  assegnazioni: [],
  activeTab: 'pipeline',
  filters: { search:'', skills:new Set(), attestati:new Set(), lowSat:false, regione:'', provincia:'', showEx:false },
  searchCommesse: '',
};

