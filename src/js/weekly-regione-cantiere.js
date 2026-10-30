/* ==================== REGIONE DEL CANTIERE (Griglia) ====================
   Sigla della regione accanto a ogni cantiere della Griglia (es. "PIE", nome intero nel
   tooltip). Nessun dato nuovo: si legge il display_name di Nominatim già in _geoCache
   (lo stesso usato per meteo e Mappa, via meteoGeoFor che scarta la riga sentinella
   "[non trovato]"). Un cantiere non ancora geocodificato, non trovato o fuori Italia
   non mostra nulla. */

const PW_REGIONI = [
  ['Piemonte', 'PIE'], ["Valle d'Aosta", 'VDA'], ['Lombardia', 'LOM'],
  ['Trentino-Alto Adige', 'TAA'], ['Veneto', 'VEN'], ['Friuli-Venezia Giulia', 'FVG'],
  ['Liguria', 'LIG'], ['Emilia-Romagna', 'EMR'], ['Toscana', 'TOS'], ['Umbria', 'UMB'],
  ['Marche', 'MAR'], ['Lazio', 'LAZ'], ['Abruzzo', 'ABR'], ['Molise', 'MOL'],
  ['Campania', 'CAM'], ['Puglia', 'PUG'], ['Basilicata', 'BAS'], ['Calabria', 'CAL'],
  ['Sicilia', 'SIC'], ['Sardegna', 'SAR'],
];

/* Solo lettere minuscole senza accenti: "Valle d'Aosta / Vallée d'Aoste" e
   "Trentino-Alto Adige/Südtirol" di Nominatim combaciano coi nomi sopra. */
function _pwRegNorm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
}

/* [nome, sigla] della regione di un cantiere, o null. Il display_name è
   "Comune, Provincia, Regione, CAP, Italia": si scorre dal fondo, così un comune il
   cui nome comincia come una regione non viene scambiato per essa. */
function pwRegioneCantiere(cantiere) {
  if (!cantiere || !cantiere.trim()) return null;
  const g = meteoGeoFor(cantiere);
  if (!g || !g.label) return null;
  const pezzi = g.label.split(',').map(_pwRegNorm).reverse();
  for (const p of pezzi) {
    const r = PW_REGIONI.find(x => p.startsWith(_pwRegNorm(x[0])));
    if (r) return r;
  }
  return null;
}

function pwRegioneInnerHtml(cantiere) {
  const r = pwRegioneCantiere(cantiere);
  return r ? '<span class="pw-regione-badge" title="' + esc(r[0]) + '">' + r[1] + '</span>' : '';
}

/* Slot accanto all'input cantiere: resta in pagina anche vuoto, così
   pwApplyRegioniToDom lo riempie quando la geocodifica arriva. */
function pwRegioneSlotHtml(cantiere) {
  return '<span class="pw-regione-slot">' + pwRegioneInnerHtml(cantiere) + '</span>';
}

/* Ricalcola le sigle dal testo attuale di ogni input cantiere, senza pwRender()
   (perderebbe il focus del campo appena modificato). */
function pwApplyRegioniToDom() {
  document.querySelectorAll('#pw-grid .pw-regione-slot').forEach(slot => {
    const inp = slot.parentNode && slot.parentNode.querySelector('.pw-cantiere-input');
    slot.innerHTML = pwRegioneInnerHtml(inp ? inp.value : '');
  });
}

/* Geocodifica i cantieri della settimana che il meteo non ha cercato (settimane oltre
   l'orizzonte di previsione, cantieri appena scritti). Chiamata in coda a
   pwRefreshMeteoWeek, così di solito trova già tutto in _geoCache e non interroga
   Nominatim due volte per lo stesso nome. Una chiamata durante un giro in corso
   lo fa ripetere a fine giro, sui dati aggiornati. */
let _pwRegioniGeocoding = false;
let _pwRegioniAncora = false;
async function pwRegioniEnsure() {
  pwApplyRegioniToDom();
  if (_pwRegioniGeocoding) { _pwRegioniAncora = true; return; }
  _pwRegioniGeocoding = true;
  try {
    do {
      _pwRegioniAncora = false;
      if (_geoCacheLoading) { try { await _geoCacheLoading; } catch (_) {} }
      const nomi = new Set();
      pwGetWeekData().forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
        for (let di = 0; di < 6; di++) pwCellCantieri((op.giorni || {})[di]).forEach(c => nomi.add(c));
      })));
      for (const c of nomi) {
        if (c.toLowerCase().trim().replace(/\s+/g, ' ') in _geoCache) continue;
        await geocodifica(c);
        pwApplyRegioniToDom();
        await new Promise(r => setTimeout(r, 1100)); // rate-limit Nominatim
      }
    } while (_pwRegioniAncora);
  } finally {
    _pwRegioniGeocoding = false;
  }
  pwApplyRegioniToDom();
}
