/* ===================== DATI INIZIALI DAL FILE EXCEL ===================== */
const INITIAL_DATA = {"pipeline": [], "operatori": [], "staffing": [], "commesse_attive": [], "giorni_lavorativi": [20, 20, 22, 21, 20, 21, 23, 21, 22, 22, 21, 21], "saturazione_baseline": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "riconciliazione": [], "attestati_disponibili": ["RSPP", "ASPP", "Preposto", "RLS", "Primo soccorso", "Defibrillatore BLS-D", "Antincendio", "Ambienti confinati", "Lavori in quota", "Segnaletica stradale - Preposto", "Segnaletica stradale - Addetto", "PES-PAV-PEI", "ENEL 1A", "ENEL 1B", "ENEL 2A", "ENEL 2B"]};
const SKILLS = ['DRONE', 'LIXEL', 'WO', 'LASER - STATICO', 'ROBOT', 'GRD', 'GPS', 'MMS', 'ALTRO'];
let ATTESTATI = INITIAL_DATA.attestati_disponibili || [];
const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const MESI_LONG = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const INDUSTRIES = ['Altre infrastrutture','Telco','Energy','Water','Robotica e AI','Trasporti','Altro'];
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
  filters: { search:'', skills:new Set(), attestati:new Set(), lowSat:false },
  searchCommesse: '',
};

