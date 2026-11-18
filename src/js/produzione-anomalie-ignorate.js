/* ==================== CONTROLLO ANOMALIE · LISTA CONDIVISA DELLE IGNORATE ====================
   «Ignora» su un'anomalia la archivia nella tabella Supabase `cpa_anomalie_ignorate`
   (supabase/migrations/20261118_…), una riga per anomalia, con chi e quando. Prima stava nel
   localStorage del browser: su un altro PC, per un collega o dopo una pulizia dei dati
   ricomparivano tutte e il totale del controllo sembrava sempre da rifare.
   - Tutte le righe si caricano al login (cpaIgnLoad, poche e piccole) in una mappa in memoria,
     così _cpaIgnorate() resta sincrona per tutti i lettori (conteggi, PDF, solleciti,
     Chiusura settimana).
   - L'id è quello stabile del motore (tipo|||anno|||week|||...): un nuovo controllo della
     stessa settimana ritrova la stessa anomalia, che resta ignorata.
   - Le ignorate salvate prima nel browser (cpa_ignorate_v1) si portano nella tabella al primo
     caricamento (solo admin/responsabile), poi la chiave locale si cancella.
   - Se la tabella non è raggiungibile si usa la vecchia lista del browser, come prima.
   - Realtime su un canale separato: contatori e modal si aggiornano quando un collega ignora
     o ripristina. */

const CPA_IGN_TABLE = 'cpa_anomalie_ignorate';

const _cpaIgn = {
  righe: {},          // anomalia_id -> riga della tabella
  caricato: false,
  inCorso: new Set(), // id in salvataggio (evita il doppio clic)
  channel: null,
  timer: null,
};

/* Mappa id -> riga (truthy = ignorata). Senza tabella: la vecchia lista del browser. */
function _cpaIgnorate() {
  if (_cpaIgn.caricato) return _cpaIgn.righe;
  return _cpaIgnLocali();
}

function _cpaIgnLocali() {
  try { return JSON.parse(localStorage.getItem(CPA_IGNORATE_KEY) || '{}') || {}; } catch (_) { return {}; }
}

/* Riga della tabella per un'anomalia (a = oggetto del motore, se disponibile) */
function _cpaIgnRiga(id, a, ts) {
  const p = String(id).split('|||');
  const anno = Number(p[1]), week = Number(p[2]);
  if (!p[0] || !anno || !(week >= 1 && week <= 53)) return null;
  const riga = { anomalia_id: id, anno, week, tipo: p[0], autore_nome: _pwNvNomeUtente() };
  if (a) {
    if (a.giorno >= 0 && a.giorno <= 5) riga.giorno = a.giorno;
    riga.titolo = a.titolo || null;
    riga.dove = [a.commessa, a.squadra, a.cantiere].filter(Boolean).join(' · ') || null;
  }
  if (ts) riga.created_at = new Date(ts).toISOString();
  return riga;
}

async function cpaIgnLoad() {
  if (!_sbClient || !_sbUser) return;
  try {
    const righe = [];
    const PAGINA = 1000;
    for (let da = 0; ; da += PAGINA) {
      const { data, error } = await _sbClient.from(CPA_IGN_TABLE).select('*').order('created_at').range(da, da + PAGINA - 1);
      if (error) throw error;
      righe.push(...(data || []));
      if (!data || data.length < PAGINA) break;
    }
    const m = {};
    righe.forEach(r => { m[r.anomalia_id] = r; });
    _cpaIgn.righe = m;
    _cpaIgn.caricato = true;
    await _cpaIgnMigraLocali();
  } catch (e) {
    console.warn('Anomalie ignorate: caricamento non riuscito, uso la lista del browser', e);
  }
  _cpaIgnAggiornaVista();
}

/* Porta nella tabella le ignorate salvate prima solo in questo browser */
async function _cpaIgnMigraLocali() {
  const loc = _cpaIgnLocali();
  const ids = Object.keys(loc).filter(id => !_cpaIgn.righe[id]);
  const togli = () => { try { localStorage.removeItem(CPA_IGNORATE_KEY); } catch (_) {} };
  if (!ids.length) { togli(); return; }
  if (!sbCanWrite()) return;
  const righe = ids.map(id => _cpaIgnRiga(id, null, loc[id])).filter(Boolean);
  if (righe.length) {
    const { data, error } = await _sbClient.from(CPA_IGN_TABLE)
      .upsert(righe, { onConflict: 'anomalia_id', ignoreDuplicates: true }).select('*');
    if (error) { console.warn('Anomalie ignorate: migrazione dal browser non riuscita', error); return; }
    (data || []).forEach(r => { _cpaIgn.righe[r.anomalia_id] = r; });
  }
  togli();
}

/* Ignora / ripristina un'anomalia (cpaIgnora in produzione-anomalie.js) */
async function _cpaIgnCambia(a) {
  if (_cpaIgn.inCorso.has(a.id)) return;
  if (!_cpaIgn.caricato) {
    /* Tabella non raggiungibile: comportamento di prima, solo su questo browser */
    const m = _cpaIgnLocali();
    if (m[a.id]) delete m[a.id]; else m[a.id] = Date.now();
    try { localStorage.setItem(CPA_IGNORATE_KEY, JSON.stringify(m)); } catch (_) {}
    _cpaIgnAggiornaVista();
    return;
  }
  if (!sbGuardWrite()) return;
  const ignorata = !!_cpaIgn.righe[a.id];
  _cpaIgn.inCorso.add(a.id);
  cpaRender();
  try {
    if (ignorata) {
      const { error } = await _sbClient.from(CPA_IGN_TABLE).delete().eq('anomalia_id', a.id);
      if (error) throw error;
      delete _cpaIgn.righe[a.id];
    } else {
      const riga = _cpaIgnRiga(a.id, a);
      if (!riga) throw new Error('id anomalia non riconosciuto');
      const { data, error } = await _sbClient.from(CPA_IGN_TABLE)
        .upsert(riga, { onConflict: 'anomalia_id', ignoreDuplicates: true }).select('*');
      if (error) throw error;
      _cpaIgn.righe[a.id] = (data && data[0]) || Object.assign({ created_at: new Date().toISOString(), autore_email: _sbUser && _sbUser.email }, riga);
    }
  } catch (e) {
    showAlertModal('Impossibile ' + (ignorata ? 'ripristinare' : 'ignorare') + ' l\'anomalia: ' + (e.message || String(e)));
  } finally {
    _cpaIgn.inCorso.delete(a.id);
  }
  _cpaIgnAggiornaVista();
}

/* Chi l'ha ignorata e quando, per la scheda nella linguetta «Ignorate» */
function _cpaIgnChiQuando(id) {
  const r = _cpaIgnorate()[id];
  if (!r) return '';
  if (typeof r !== 'object') return 'Ignorata il ' + new Date(r).toLocaleDateString('it-IT') + ' (solo su questo browser)';
  const d = new Date(r.created_at);
  const chi = r.autore_nome || (r.autore_email || '').split('@')[0];
  return 'Ignorata' + (chi ? ' da ' + chi : '') + (isNaN(d) ? '' : ' il ' + d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
}

/* Ridisegna modal, contatore sul bottone e Chiusura settimana (con un debounce per Realtime) */
function _cpaIgnAggiornaVista() {
  clearTimeout(_cpaIgn.timer);
  _cpaIgn.timer = setTimeout(() => {
    if (typeof cpaRender === 'function') cpaRender();
    if (typeof chsAggiorna === 'function') chsAggiorna();
  }, 150);
}

function cpaIgnSubscribe() {
  if (_cpaIgn.channel || !_sbClient) return;
  try {
    _cpaIgn.channel = _sbClient.channel('cpa-anomalie-ignorate')
      .on('postgres_changes', { event: '*', schema: 'public', table: CPA_IGN_TABLE }, (payload) => {
        if (!_cpaIgn.caricato) return;
        if (payload.eventType === 'DELETE') { if (payload.old && payload.old.anomalia_id) delete _cpaIgn.righe[payload.old.anomalia_id]; }
        else if (payload.new && payload.new.anomalia_id) _cpaIgn.righe[payload.new.anomalia_id] = payload.new;
        _cpaIgnAggiornaVista();
      })
      .subscribe((status) => {
        /* Dopo una disconnessione gli eventi persi non tornano: si ricarica tutto */
        if (status === 'SUBSCRIBED' && _cpaIgn._riconnetti) { _cpaIgn._riconnetti = false; cpaIgnLoad(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') _cpaIgn._riconnetti = true;
      });
  } catch (e) { console.warn('Realtime anomalie ignorate:', e); }
}

function cpaIgnUnsubscribe() {
  if (_cpaIgn.channel) {
    try { _sbClient.removeChannel(_cpaIgn.channel); } catch (e) {}
    _cpaIgn.channel = null;
  }
  _cpaIgn._riconnetti = false;
  _cpaIgn.righe = {};
  _cpaIgn.caricato = false;
}
