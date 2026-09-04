/* ===================== ATTESTATI: SCADENZE, REGISTRO E IMPORT ===================== */
/* Mappa gli attestati di sicurezza posseduti dai dipendenti con la relativa data di corso
   e di scadenza, alimentando due consumatori diversi:

   1. la sezione "Attestati & scadenze" della dashboard, consultabile per TUTTI i dipendenti
      presenti nel file aziendale (non solo per gli operatori del reparto rilievi);
   2. gli operatori gia' in anagrafica, di cui riempie op.attestati (che era, ed e' rimasta,
      la lista piatta di nomi usata da filtri, matching commessa/operatore ed export).

   MODELLO DATI (tutto nel dominio "core", nessuna modifica allo schema Supabase):
   - op.attestati        lista piatta di nomi. INVARIATA: nessun call site esistente si rompe.
   - op.attestati_dett   { "<nome attestato>": { corso, scad, fonte } } con date ISO.
                         E' la fonte autorevole per chi e' nel pool, perche' puo' contenere
                         anche correzioni fatte a mano dalla scheda operatore.
   - state.attestati_registro  archivio grezzo dell'ultimo import, che copre anche i
                         dipendenti fuori dal pool. Serve alla sola consultazione e a
                         riabbinare qualcuno che venga aggiunto al pool in seguito.

   Un attestato senza data (inserito a mano prima che esistesse questa funzione, oppure
   spuntato senza compilare il campo data) vale "senza scadenza nota" e NON viene mai
   trattato come scaduto: cosi' l'introduzione delle scadenze non invalida da sola dati
   preesistenti. */

/* ---------------------------------------------------------------- date e stati ----- */

/* Converte una cella Excel in data ISO 'YYYY-MM-DD'. Il file arriva come seriale numerico
   (si legge con raw:true, senza cellDates, perche' la conversione automatica di SheetJS
   sposta la data di qualche ora a seconda del fuso del browser e puo' far slittare il
   giorno). L'epoca dei seriali e' 1899-12-30: tiene gia' conto del bug del 1900 bisestile
   di Excel. Accetta anche date gia' testuali (gg/mm/aaaa o ISO) per robustezza. */
function attExcelData(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) {
    if (v < 1 || v > 100000) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? '' : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  }
  const s = ('' + v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const ita = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (ita) {
    let anno = parseInt(ita[3], 10);
    if (anno < 100) anno += anno < 50 ? 2000 : 1900;
    const mm = ('0' + ita[2]).slice(-2), gg = ('0' + ita[1]).slice(-2);
    return anno + '-' + mm + '-' + gg;
  }
  return '';
}

/* Scadenza = data corso + N anni - 1 giorno, con N preso da ATTESTATI_DURATA.
   Il "-1 giorno" riproduce esattamente le date di scadenza esplicite dei fogli
   PES-PAV-PEI e Segnaletica stradale (es. corso 26/10/2018 -> scadenza 25/10/2023). */
function attScadenzaDaCorso(nome, corsoIso) {
  const anni = ATTESTATI_DURATA[nome];
  if (!anni || !corsoIso) return '';
  const p = corsoIso.split('-');
  const d = new Date(Date.UTC(parseInt(p[0], 10) + anni, parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function attOggiIso() { return new Date().toISOString().slice(0, 10); }

/* Giorni che mancano alla scadenza (negativi se gia' scaduto), null se data assente. */
function attGiorniAllaScadenza(scadIso) {
  if (!scadIso) return null;
  const oggi = new Date(attOggiIso() + 'T00:00:00Z').getTime();
  const scad = new Date(scadIso + 'T00:00:00Z').getTime();
  if (isNaN(scad)) return null;
  return Math.round((scad - oggi) / 86400000);
}

/* Stato di una singola voce { corso, scad }: 'valido' | 'scadenza' | 'scaduto' | 'senza-data'. */
function attStatoVoce(voce) {
  if (!voce || !voce.scad) return 'senza-data';
  const gg = attGiorniAllaScadenza(voce.scad);
  if (gg === null) return 'senza-data';
  if (gg < 0) return 'scaduto';
  if (gg <= ATTESTATI_PREAVVISO_GG) return 'scadenza';
  return 'valido';
}

/* Dettaglio (con date) di un attestato per un operatore, o null se non lo possiede. */
function attVoceOperatore(op, nome) {
  if (!op) return null;
  const dett = op.attestati_dett || {};
  if (dett[nome]) return dett[nome];
  if ((op.attestati || []).includes(nome)) return { corso: '', scad: '', fonte: 'manuale' };
  return null;
}

/* Stato di un attestato per un operatore, 'assente' incluso. */
function attStatoOperatore(op, nome) {
  const voce = attVoceOperatore(op, nome);
  if (!voce) return 'assente';
  return attStatoVoce(voce);
}

/* Un attestato "copre" un requisito di commessa se e' posseduto e non scaduto.
   Senza data di scadenza nota lo si considera valido (vedi nota in testa al file). */
function attIsValido(op, nome) {
  const st = attStatoOperatore(op, nome);
  return st === 'valido' || st === 'scadenza' || st === 'senza-data';
}

/* Sostituisce il vecchio  attReq.filter(a => !(op.attestati||[]).includes(a))
   distinguendo pero' "mai avuto" da "scaduto". Ritorna i soli nomi. */
function attNonCoperti(op, richiesti) {
  return (richiesti || []).filter(a => !attIsValido(op, a));
}

/* Etichetta di un attestato non coperto, per i messaggi di assegnazione:
   "Preposto" se manca del tutto, "Preposto (scaduto il 12 mar 2025)" se e' scaduto. */
function attEtichettaMancanza(op, nome) {
  const voce = attVoceOperatore(op, nome);
  if (voce && voce.scad && attStatoVoce(voce) === 'scaduto') return nome + ' (scaduto il ' + fmtDate(voce.scad) + ')';
  return nome;
}

/* Tooltip completo di una voce, usato nei badge della scheda operatore e nella matrice. */
function attTooltipVoce(nome, voce) {
  if (!voce) return nome + ' — non posseduto';
  const st = attStatoVoce(voce);
  const parti = [nome];
  if (voce.corso) parti.push('corso del ' + fmtDate(voce.corso));
  if (voce.scad) {
    const gg = attGiorniAllaScadenza(voce.scad);
    if (st === 'scaduto') parti.push('SCADUTO il ' + fmtDate(voce.scad) + ' (' + Math.abs(gg) + ' giorni fa)');
    else parti.push('scade il ' + fmtDate(voce.scad) + ' (tra ' + gg + ' giorni)');
  } else {
    parti.push('scadenza non nota');
  }
  return parti.join(' · ');
}

/* Classe CSS del pallino/badge per stato. */
function attClasseStato(st) {
  if (st === 'scaduto') return 'ko';
  if (st === 'scadenza') return 'warn';
  if (st === 'valido') return 'ok';
  return 'nodate';
}

/* Badge di un attestato posseduto: colore per stato di scadenza e dettaglio nel tooltip.
   Un attestato senza scadenza nota resta viola neutro come prima di questa funzione.
   Condiviso da scheda operatore, modal di allocazione e vista impegni, che prima
   ripetevano tre volte lo stesso markup. */
function attBadgeHtml(op, nome) {
  const voce = attVoceOperatore(op, nome);
  const st = attStatoVoce(voce);
  const cls = st === 'senza-data' ? '' : ' ' + attClasseStato(st);
  const marker = st === 'scaduto' ? ' ✕' : (st === 'scadenza' ? ' ⏳' : '');
  const label = nome.length > 14 ? nome.substring(0, 13) + '…' : nome;
  return '<span class="att-badge' + cls + '" title="' + esc(attTooltipVoce(nome, voce)) + '">' + esc(label) + marker + '</span>';
}

/* Elenco completo dei badge di un operatore; `vuoto` e' l'HTML da mostrare se non ne ha. */
function attBadgesHtml(op, vuoto) {
  const lista = (op && op.attestati) || [];
  if (lista.length === 0) return vuoto === undefined ? '' : vuoto;
  return lista.map(a => attBadgeHtml(op, a)).join('');
}

/* Riga della griglia attestati nella scheda operatore: spunta, nome, data del corso
   modificabile e scadenza calcolata. Costruita per concatenazione (niente template literal
   annidati dentro quello del modal, che in questo file hanno gia' causato errori di parse). */
function attRigaModaleOperatore(op, nome) {
  const voce = attVoceOperatore(op, nome) || {};
  const posseduto = (op.attestati || []).includes(nome) || !!(op.attestati_dett || {})[nome];
  const durata = ATTESTATI_DURATA[nome];
  const tip = durata
    ? 'Data del corso — validità ' + durata + (durata === 1 ? ' anno' : ' anni') + ', la scadenza si calcola da sola'
    : 'Data del corso';
  const scadTxt = voce.scad ? fmtDate(voce.scad) : '';
  const clsScad = attStatoVoce(voce) === 'scaduto' ? ' text-red-600 font-semibold' : '';
  return '<div class="mo-att-riga flex items-center gap-1.5 text-xs hover:bg-white rounded px-1 py-0.5">' +
    '<input type="checkbox" class="mo-att" value="' + esc(nome) + '"' + (posseduto ? ' checked' : '') + '>' +
    '<span class="flex-1 truncate" title="' + esc(nome) + '">' + esc(nome) + '</span>' +
    '<input type="date" class="mo-att-corso w-[118px] border border-slate-300 rounded px-1 py-0.5 text-[11px]" ' +
      'data-att="' + esc(nome) + '" value="' + esc(voce.corso || '') + '" title="' + esc(tip) + '">' +
    '<span class="mo-att-scad w-[86px] text-right text-[10px] text-slate-500' + clsScad + '">' + esc(scadTxt) + '</span>' +
  '</div>';
}

/* Tutte le voci in scadenza o scadute degli operatori del pool, ordinate per urgenza.
   Usata dal pannello alert e dal contatore nell'intestazione della sezione. */
function attScadenzeOperatori(giorniPreavviso) {
  const soglia = giorniPreavviso === undefined ? ATTESTATI_PREAVVISO_GG : giorniPreavviso;
  const out = [];
  getOperatoriAttivi().forEach(op => {
    const dett = op.attestati_dett || {};
    Object.keys(dett).forEach(nome => {
      const voce = dett[nome];
      if (!voce || !voce.scad) return;
      const gg = attGiorniAllaScadenza(voce.scad);
      if (gg === null || gg > soglia) return;
      out.push({ op: op, nome: nome, scad: voce.scad, giorni: gg, stato: gg < 0 ? 'scaduto' : 'scadenza' });
    });
  });
  out.sort((a, b) => a.giorni - b.giorni);
  return out;
}

/* ------------------------------------------------------- righe della matrice ----- */

const _attFiltri = { search: '', tipo: '', stato: '', soloPool: false, ordine: 'nome' };

/* Unisce pool operatori e registro importato in un'unica lista di righe
   { nome, op, voci, inPool }. Per chi e' nel pool vince sempre op.attestati_dett
   (che include le eventuali correzioni manuali); il registro copre solo chi nel
   pool non c'e'. */
function attRigheRegistro() {
  const righe = [];
  const nomiPool = new Set();

  (state.operatori || []).forEach(op => {
    if (op.licenziato || isOperatoreScaduto(op)) return;
    const nome = op.nome_esteso || op.nome || '';
    if (!nome) return;
    nomiPool.add(pwFerieNormTokens(nome).sort().join(' '));
    const voci = {};
    const dett = op.attestati_dett || {};
    (op.attestati || []).forEach(a => { voci[a] = dett[a] || { corso: '', scad: '', fonte: 'manuale' }; });
    Object.keys(dett).forEach(a => { voci[a] = dett[a]; });
    righe.push({ nome: nome, op: op, voci: voci, inPool: true });
  });

  const reg = state.attestati_registro || {};
  (reg.dipendenti || []).forEach(d => {
    const chiave = pwFerieNormTokens(d.nome || '').sort().join(' ');
    if (!chiave || nomiPool.has(chiave)) return;
    righe.push({ nome: d.nome, op: null, voci: d.voci || {}, inPool: false });
  });

  return righe;
}

/* Voce "principale" di una colonna per una riga: se la colonna accorpa piu' varianti
   (ENEL, Segnaletica Preposto/Addetto) vince quella con la scadenza piu' lontana, cosi'
   la cella riflette lo stato migliore effettivamente in corso. */
function attVocePrincipaleColonna(voci, col) {
  let best = null;
  col.voci.forEach(nome => {
    const v = voci[nome];
    if (!v) return;
    if (!best || (v.scad || '') > (best.voce.scad || '')) best = { nome: nome, voce: v };
  });
  return best;
}

function attSetFiltro(chiave, valore) {
  _attFiltri[chiave] = valore;
  renderAttestati();
}

/* Data breve mm/aa per stare dentro una cella stretta. */
function attDataBreve(iso) {
  if (!iso) return '';
  return iso.slice(5, 7) + '/' + iso.slice(2, 4);
}

/* --------------------------------------------------------------- render vista ----- */

function renderAttestati() {
  const box = document.getElementById('att-matrix');
  const badge = document.getElementById('att-summary-badges');

  const scadenze = attScadenzeOperatori();
  const nScaduti = scadenze.filter(s => s.stato === 'scaduto').length;
  const nInScadenza = scadenze.length - nScaduti;
  if (badge) {
    let b = '';
    if (nScaduti > 0) b += '<span class="att-pill ko">' + nScaduti + ' scadut' + (nScaduti === 1 ? 'o' : 'i') + '</span>';
    if (nInScadenza > 0) b += '<span class="att-pill warn">' + nInScadenza + ' in scadenza</span>';
    if (!b) b = '<span class="att-pill ok">nessuna scadenza entro ' + ATTESTATI_PREAVVISO_GG + ' giorni</span>';
    badge.innerHTML = b;
  }

  if (!box) return;
  // Sezione collassata: niente render della matrice (150+ righe x 11 colonne ad ogni
  // renderAll() sarebbero sprecate finche' nessuno la apre).
  const det = document.getElementById('att-details');
  if (det && !det.open) { box.innerHTML = ''; return; }

  const meta = state.attestati_registro || {};
  const metaEl = document.getElementById('att-meta');
  if (metaEl) {
    metaEl.textContent = meta.aggiornato_il
      ? 'Ultimo import: ' + fmtDate(meta.aggiornato_il) + (meta.file ? ' — ' + meta.file : '') + (meta.da ? ' (' + meta.da + ')' : '')
      : 'Nessun import effettuato: la tabella mostra solo gli attestati inseriti a mano nelle schede operatore.';
  }

  // Popola una-tantum la tendina dei tipi
  const selTipo = document.getElementById('att-filter-tipo');
  if (selTipo && selTipo.options.length <= 1) {
    selTipo.innerHTML = '<option value="">Tutti i tipi</option>' +
      ATTESTATI_COLONNE.map(c => '<option value="' + esc(c.label) + '">' + esc(c.label) + '</option>').join('');
  }

  const q = (_attFiltri.search || '').trim().toLowerCase();
  const colFiltro = _attFiltri.tipo ? ATTESTATI_COLONNE.find(c => c.label === _attFiltri.tipo) : null;

  const righe = attRigheRegistro().filter(r => {
    if (_attFiltri.soloPool && !r.inPool) return false;
    if (q && !r.nome.toLowerCase().includes(q)) return false;
    if (colFiltro && !attVocePrincipaleColonna(r.voci, colFiltro)) return false;
    if (_attFiltri.stato) {
      const stati = Object.keys(r.voci).map(n => attStatoVoce(r.voci[n]));
      if (_attFiltri.stato === 'scaduto' && !stati.includes('scaduto')) return false;
      if (_attFiltri.stato === 'scadenza' && !stati.includes('scadenza')) return false;
      if (_attFiltri.stato === 'nessuno' && stati.length > 0) return false;
    }
    return true;
  });

  // Scadenza piu' vicina della riga, per l'ordinamento "per urgenza"
  function urgenzaRiga(r) {
    let best = null;
    Object.keys(r.voci).forEach(n => {
      const gg = attGiorniAllaScadenza(r.voci[n].scad);
      if (gg === null) return;
      if (best === null || gg < best) best = gg;
    });
    return best === null ? 999999 : best;
  }

  if (_attFiltri.ordine === 'scadenza') righe.sort((a, b) => urgenzaRiga(a) - urgenzaRiga(b) || a.nome.localeCompare(b.nome));
  else righe.sort((a, b) => a.nome.localeCompare(b.nome));

  const colonne = colFiltro ? [colFiltro] : ATTESTATI_COLONNE;

  const countEl = document.getElementById('att-count');
  if (countEl) countEl.textContent = righe.length + ' dipendenti';

  if (righe.length === 0) {
    box.innerHTML = '<div class="text-center text-sm text-slate-400 py-6">Nessun dipendente corrisponde ai filtri.</div>';
    return;
  }

  // Totale per colonna: quanti hanno la voce e non e' scaduta
  const totali = colonne.map(col => righe.filter(r => {
    const b = attVocePrincipaleColonna(r.voci, col);
    return b && attStatoVoce(b.voce) !== 'scaduto';
  }).length);

  let html = '<table class="att-matrix"><thead><tr>';
  html += '<th class="att-nome">Dipendente</th>';
  colonne.forEach((col, i) => {
    const durata = ATTESTATI_DURATA[col.voci[0]];
    const tip = col.label + (durata ? ' — validità ' + durata + (durata === 1 ? ' anno' : ' anni') : '');
    html += '<th title="' + esc(tip) + '"><div class="att-th-lbl">' + esc(col.label) + '</div>' +
      '<div class="att-th-sub">' + totali[i] + (durata ? ' · ' + durata + 'a' : '') + '</div></th>';
  });
  html += '<th title="Attestati non scaduti / totale posseduti">Validi</th></tr></thead><tbody>';

  righe.forEach(r => {
    const nVal = Object.keys(r.voci).filter(n => attStatoVoce(r.voci[n]) !== 'scaduto').length;
    const nTot = Object.keys(r.voci).length;
    const tagPool = r.inPool ? '' : '<span class="att-fuoripool" title="Presente nel file attestati ma non nel pool operatori del reparto">fuori pool</span>';
    html += '<tr><td class="att-nome">' + esc(r.nome) + ' ' + tagPool + '</td>';
    colonne.forEach(col => {
      const best = attVocePrincipaleColonna(r.voci, col);
      if (!best) { html += '<td class="att-vuoto">·</td>'; return; }
      const st = attStatoVoce(best.voce);
      // sigle delle varianti effettivamente possedute (ENEL 1A/1B..., Prep/Add)
      let sigle = '';
      if (col.sigle) {
        Object.keys(col.sigle).forEach(nomeVar => {
          if (r.voci[nomeVar]) sigle += '<span class="att-sigla">' + esc(col.sigle[nomeVar]) + '</span>';
        });
      }
      html += '<td title="' + esc(attTooltipVoce(best.nome, best.voce)) + '"><span class="att-cell">' +
        '<span class="att-dot ' + attClasseStato(st) + '"></span>' +
        '<span>' + (best.voce.scad ? attDataBreve(best.voce.scad) : '—') + '</span>' + sigle + '</span></td>';
    });
    html += '<td class="att-tot">' + nVal + '/' + nTot + '</td></tr>';
  });
  html += '</tbody></table>';
  box.innerHTML = html;
}

/* Chiamata dall'attributo ontoggle del <details>: alla prima apertura la matrice non
   e' ancora stata costruita. */
function attToggleSezione() {
  renderAttestati();
}

/* -------------------------------------------------------------------- import ----- */

/* Normalizza un'intestazione del foglio principale ("Preposto \n(2 anni)", "PES-PAV-PEI** ")
   nel nome canonico del vocabolario ATTESTATI. Ritorna '' se la colonna non e' un attestato
   (es. "n. attestati", colonne vuote). */
function attNomeDaIntestazione(h) {
  let s = ('' + (h || '')).replace(/\s+/g, ' ').trim();
  s = s.replace(/\(.*?\)/g, '').replace(/[*]+/g, '').trim();
  if (!s) return '';
  const norm = v => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(s);
  if (!target || target.indexOf('attestat') === 0 || target.indexOf('nattestat') === 0) return '';
  // "Segnaletica stradale" e "PES-PAV-PEI" sul foglio principale sono generici: la variante
  // (Preposto/Addetto, ENEL 1A..2B) si legge nei fogli dedicati, che sono un soprainsieme
  // di quello principale — quindi qui vengono ignorati di proposito.
  if (target.indexOf('segnaletica') === 0) return '';
  if (target.indexOf('pespav') === 0) return '';
  const trovato = ATTESTATI.find(a => norm(a) === target);
  return trovato || '';
}

function attFoglio(wb, frammento) {
  const nome = wb.SheetNames.find(n => n.toLowerCase().replace(/[^a-z]/g, '').includes(frammento));
  return nome ? wb.Sheets[nome] : null;
}

function attImportPick(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ''; // consente di riselezionare lo stesso file dopo una correzione
  if (file) attImportFile(file);
}

/* Riepilogo pre-import: stesso schema del modal ferie (elenchi scrollabili + ricerca),
   perche' anche qui il file copre tutta l'azienda e la gran parte dei nominativi non
   appartiene al pool del reparto. */
function attImportShowConfirm(info) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');

    function attListBox(items, titolo, colorClass) {
      if (items.length === 0) return '';
      const righe = items.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(it => {
        const nota = it.nota ? ' <span class="text-slate-400">(' + esc(it.nota) + ')</span>' : '';
        return '<div class="ati-row px-2 py-1 border-b border-slate-100 last:border-b-0" data-nome="' +
          esc(it.nome.toLowerCase()) + '">' + esc(it.nome) + nota + '</div>';
      }).join('');
      return '<div class="mt-3"><div class="text-xs font-semibold ' + colorClass + ' mb-1">' + titolo +
        ' (' + items.length + ')</div><div class="border border-slate-200 rounded text-xs" style="max-height:160px;overflow-y:auto;">' +
        righe + '</div></div>';
    }

    const nElencati = info.matched.length + info.unmatched.length + info.ambiguous.length;
    const html =
      '<div class="modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col" style="max-height:85vh;">' +
        '<div class="px-5 py-4 border-b border-slate-100">' +
          '<div class="font-semibold text-slate-900 text-sm">Importazione attestati</div>' +
          '<div class="text-xs text-slate-500 mt-0.5">' + esc(info.fileName) + '</div>' +
        '</div>' +
        '<div class="px-5 py-4 text-sm text-slate-700" style="overflow-y:auto;">' +
          '<ul class="text-xs space-y-1 text-slate-600">' +
            '<li>• <b>' + info.nDipendenti + '</b> dipendenti letti dal file, <b>' + info.nVoci + '</b> attestati in totale</li>' +
            '<li>• <b>' + info.matched.length + '</b> abbinati a operatori del pool: le loro schede verranno aggiornate</li>' +
            '<li>• ' + (info.nDipendenti - info.matched.length) + ' resteranno solo nel registro consultabile</li>' +
            (info.nScartati > 0 ? '<li>• ' + info.nScartati + ' celle ignorate (data non leggibile)</li>' : '') +
          '</ul>' +
          (nElencati > 0 ?
            '<div class="relative mt-3">' +
              '<input type="text" id="ati-search" placeholder="Cerca un nominativo negli elenchi qui sotto…" ' +
              'class="w-full text-xs border border-slate-300 rounded px-2 py-1.5 pr-16 focus:outline-none focus:border-teal-400" ' +
              'oninput="attImportFilter(this.value)">' +
              '<span id="ati-search-count" class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></span>' +
            '</div>' : '') +
          attListBox(info.matched, '✓ Abbinati al pool operatori', 'text-emerald-700') +
          attListBox(info.ambiguous, '⚠ Ambigui, più operatori corrispondenti (solo registro)', 'text-amber-700') +
          attListBox(info.unmatched, 'Non nel pool operatori (solo registro)', 'text-slate-600') +
          '<div class="text-xs text-slate-500 mt-3">Per gli operatori abbinati gli attestati provenienti da un import precedente ' +
          'vengono riallineati al file; quelli aggiunti a mano dalla scheda operatore restano invariati.</div>' +
        '</div>' +
        '<div class="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">' +
          '<button id="ati-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button>' +
          '<button id="ati-confirm" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Importa</button>' +
        '</div>' +
      '</div></div>';

    root.innerHTML = html;
    document.getElementById('ati-cancel').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('ati-confirm').onclick = () => { closeModal(); resolve(true); };
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) { closeModal(); resolve(false); }
    });
  });
}

function attImportFilter(query) {
  const q = (query || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#modal-root .ati-row');
  let shown = 0;
  rows.forEach(row => {
    const match = !q || row.dataset.nome.includes(q);
    row.classList.toggle('hidden', !match);
    if (match) shown++;
  });
  const countEl = document.getElementById('ati-search-count');
  if (countEl) countEl.textContent = q ? shown + '/' + rows.length : '';
}

/* Legge un foglio di dettaglio (PES / Segnaletica): riga intestazione con "Dipendente",
   una colonna X per variante e le colonne "Data ultimo corso"/"Data corso" e
   "Data di scadenza". Ritorna il numero di righe scartate. */
function attImportFoglioDettaglio(rows, mappaColonne, aggiungiVoce) {
  let scartate = 0;
  let hIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some(c => /^dipendente$/i.test(('' + (c || '')).trim()))) { hIdx = i; break; }
  }
  if (hIdx < 0) return 0;
  const header = (rows[hIdx] || []).map(c => ('' + (c || '')).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const iNome = header.findIndex(h => h === 'dipendente');
  const iCorso = header.findIndex(h => h.indexOf('dataultimocorso') === 0 || h.indexOf('datacorso') === 0);
  const iScad = header.findIndex(h => h.indexOf('datadiscadenza') === 0 || h.indexOf('datascadenza') === 0);
  const colVar = [];
  header.forEach((h, i) => { if (mappaColonne[h]) colVar.push({ i: i, nome: mappaColonne[h] }); });
  if (iNome < 0 || colVar.length === 0) return 0;

  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const nomeDip = ('' + (row[iNome] === null || row[iNome] === undefined ? '' : row[iNome])).replace(/\s+/g, ' ').trim();
    // scarta la riga "Totale" e le righe di legenda ("1A - Conoscenze teoriche", ...)
    if (!nomeDip || /^totale$/i.test(nomeDip) || /^legenda/i.test(nomeDip) || /^\d[ab]?\s*-/i.test(nomeDip)) continue;
    const corso = iCorso >= 0 ? attExcelData(row[iCorso]) : '';
    const scad = iScad >= 0 ? attExcelData(row[iScad]) : '';
    let almenoUna = false;
    colVar.forEach(c => {
      const cella = row[c.i];
      const v = ('' + (cella === null || cella === undefined ? '' : cella)).trim();
      if (!v) return;
      almenoUna = true;
      aggiungiVoce(nomeDip, c.nome, corso, scad);
    });
    if (!almenoUna && (corso || scad)) scartate++;
  }
  return scartate;
}

/* Estrae dal workbook la mappa "chiave nome normalizzata -> { nome, voci }".
   E' separata dall'handler perche' contiene tutta la logica non banale dell'import
   (riconoscimento colonne, conversione date, precedenza fra foglio principale e fogli di
   dettaglio) e cosi' e' verificabile fuori dal browser, senza DOM ne' modali.
   Ritorna { perDip, nScartati, errore }: `errore` valorizzato = file non riconosciuto. */
function attImportParseWorkbook(wb) {
  // chiave nome normalizzata -> { nome, voci }
  const perDip = new Map();
  let nScartati = 0;

  function aggiungiVoce(nomeDip, nomeAtt, corsoIso, scadIso) {
    const nome = ('' + nomeDip).replace(/\s+/g, ' ').trim();
    if (!nome || !nomeAtt) return;
    const chiave = pwFerieNormTokens(nome).sort().join(' ');
    if (!chiave) return;
    if (!perDip.has(chiave)) perDip.set(chiave, { nome: nome, voci: {} });
    const scad = scadIso || attScadenzaDaCorso(nomeAtt, corsoIso);
    // Se lo stesso attestato compare piu' volte (foglio principale + foglio dedicato)
    // vince la scadenza piu' recente: i fogli di dettaglio sono i piu' aggiornati.
    const gia = perDip.get(chiave).voci[nomeAtt];
    if (gia && (gia.scad || '') >= (scad || '')) return;
    perDip.get(chiave).voci[nomeAtt] = { corso: corsoIso || '', scad: scad || '', fonte: 'import' };
  }

  /* --- foglio principale: una colonna per attestato, la cella e' la data del CORSO --- */
  const wsMain = attFoglio(wb, 'elencoattestati') || wb.Sheets[wb.SheetNames[0]];
  if (wsMain) {
    const rows = XLSX.utils.sheet_to_json(wsMain, { header: 1, defval: null, raw: true });
    let hIdx = -1;
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const r = rows[i] || [];
      if (r.some(c => /dipendent/i.test('' + (c || '')))) { hIdx = i; break; }
    }
    if (hIdx < 0) {
      return { perDip: perDip, nScartati: nScartati,
        errore: 'Intestazione "Dipendenti" non trovata nel foglio "Elenco attestati".\n\nVerifica di aver selezionato il file corretto.' };
    }
    const header = rows[hIdx] || [];
    const iNome = header.findIndex(c => /dipendent/i.test('' + (c || '')));
    const colAtt = [];
    header.forEach((h, i) => {
      if (i === iNome) return;
      const nomeAtt = attNomeDaIntestazione(h);
      if (nomeAtt) colAtt.push({ i: i, nome: nomeAtt });
    });
    for (let r = hIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const cellaNome = row[iNome];
      const nomeDip = ('' + (cellaNome === null || cellaNome === undefined ? '' : cellaNome)).replace(/\s+/g, ' ').trim();
      // salta la riga "Totale" e il blocco legenda in coda al foglio
      if (!nomeDip || /^totale$/i.test(nomeDip) || /^legenda/i.test(nomeDip) || /^[*]/.test(nomeDip) || /^(p\.iva|personale)/i.test(nomeDip)) continue;
      colAtt.forEach(c => {
        const cella = row[c.i];
        if (cella === null || cella === undefined || cella === '') return;
        const corso = attExcelData(cella);
        if (!corso) { nScartati++; return; }
        aggiungiVoce(nomeDip, c.nome, corso, '');
      });
    }
  }

  /* --- foglio PES-PAV-PEI: colonne X per variante + data corso e scadenza esplicite --- */
  const wsPes = attFoglio(wb, 'pespavpei');
  if (wsPes) {
    const rows = XLSX.utils.sheet_to_json(wsPes, { header: 1, defval: null, raw: true });
    const mapPes = { pespavpei: 'PES-PAV-PEI', enel1a: 'ENEL 1A', enel1b: 'ENEL 1B', enel2a: 'ENEL 2A', enel2b: 'ENEL 2B' };
    nScartati += attImportFoglioDettaglio(rows, mapPes, aggiungiVoce);
  }

  /* --- foglio Segnaletica stradale: colonne X Preposto/Addetto + date esplicite --- */
  const wsSeg = attFoglio(wb, 'segnaleticastradale');
  if (wsSeg) {
    const rows = XLSX.utils.sheet_to_json(wsSeg, { header: 1, defval: null, raw: true });
    const mapSeg = { preposto: 'Segnaletica stradale - Preposto', addetto: 'Segnaletica stradale - Addetto' };
    nScartati += attImportFoglioDettaglio(rows, mapSeg, aggiungiVoce);
  }


  return { perDip: perDip, nScartati: nScartati, errore: '' };
}

async function attImportFile(file) {
  if (!sbGuardWrite()) return;
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }

  let wb;
  try {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: 'array' });
  } catch (err) {
    showAlertModal('Errore nella lettura del file:\n\n' + err.message);
    return;
  }

  const parsed = attImportParseWorkbook(wb);
  if (parsed.errore) { showAlertModal(parsed.errore); return; }
  const perDip = parsed.perDip;
  const nScartati = parsed.nScartati;

  if (perDip.size === 0) {
    showAlertModal('Nessun attestato leggibile trovato nel file.\n\nVerifica che sia l’export "Elenco attestati dei dipendenti".');
    return;
  }

  /* --- abbinamento con il pool operatori --- */
  const operatori = getOperatoriAttivi();
  const matched = [], unmatched = [], ambiguous = [];
  const dipendenti = [];
  let nVoci = 0;

  perDip.forEach(d => {
    const nVociDip = Object.keys(d.voci).length;
    nVoci += nVociDip;
    const res = pwFerieMatchOperatore(d.nome, operatori);
    let opId = null;
    if (res.match) {
      opId = res.match.id;
      matched.push({ nome: d.nome, nota: nVociDip + ' attestati → ' + (res.match.nome_esteso || res.match.nome) });
    } else if (res.ambiguous) {
      ambiguous.push({ nome: d.nome, nota: (res.candidates || []).map(c => c.nome_esteso || c.nome).join(', ') });
    } else {
      unmatched.push({ nome: d.nome, nota: nVociDip + ' attestati' });
    }
    dipendenti.push({ nome: d.nome, op_id: opId, voci: d.voci });
  });

  const ok = await attImportShowConfirm({
    fileName: file.name, nDipendenti: perDip.size, nVoci: nVoci, nScartati: nScartati,
    matched: matched, unmatched: unmatched, ambiguous: ambiguous,
  });
  if (!ok) return;

  /* --- applicazione --- */
  state.attestati_registro = {
    aggiornato_il: attOggiIso(),
    file: file.name,
    da: (typeof _sbUser !== 'undefined' && _sbUser) ? _sbUser.email : '',
    dipendenti: dipendenti,
  };

  let nOpAggiornati = 0;
  dipendenti.forEach(d => {
    if (!d.op_id) return;
    const op = state.operatori.find(o => o.id === d.op_id);
    if (!op) return;
    const dett = op.attestati_dett || {};
    // Le voci di un import precedente vengono sostituite in blocco da quelle del nuovo file
    // (cosi' una correzione a monte si propaga, anche in cancellazione); quelle inserite a
    // mano dalla scheda operatore sopravvivono.
    Object.keys(dett).forEach(nome => { if (dett[nome] && dett[nome].fonte === 'import') delete dett[nome]; });
    Object.keys(d.voci).forEach(nome => { dett[nome] = d.voci[nome]; });
    op.attestati_dett = dett;
    // op.attestati resta la lista piatta: nomi del vocabolario in ordine canonico piu'
    // eventuali voci fuori vocabolario gia' presenti sulla scheda.
    const fuoriVocabolario = (op.attestati || []).filter(a => ATTESTATI.indexOf(a) < 0 && !dett[a]);
    op.attestati = ATTESTATI.filter(a => dett[a]).concat(fuoriVocabolario);
    nOpAggiornati++;
  });

  await saveState('Import attestati', { file: file.name, dipendenti: perDip.size, operatori: nOpAggiornati }, true);
  const det = document.getElementById('att-details');
  if (det) det.open = true;
  renderAll();
  showAlertModal('✓ Import completato: ' + perDip.size + ' dipendenti nel registro, ' + nOpAggiornati + ' operatori del pool aggiornati.');
}

/* -------------------------------------------------------------------- export ----- */

/* Esporta il registro in formato lungo (una riga per dipendente x attestato): piu' comodo
   della matrice per filtrare e ordinare in Excel su scadenze e stati. */
function exportAttestatiXlsx() {
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }
  const header = ['Dipendente', 'Nel pool operatori', 'Attestato', 'Data corso', 'Data scadenza', 'Stato', 'Giorni alla scadenza', 'Fonte'];
  const etichettaStato = { valido: 'Valido', scadenza: 'In scadenza', scaduto: 'Scaduto', 'senza-data': 'Scadenza non nota' };
  const righe = [header];
  attRigheRegistro()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach(r => {
      const nomi = Object.keys(r.voci).sort();
      const inPool = r.inPool ? 'Sì' : 'No';
      if (nomi.length === 0) { righe.push([r.nome, inPool, '', '', '', 'Nessun attestato', '', '']); return; }
      nomi.forEach(n => {
        const v = r.voci[n];
        const gg = attGiorniAllaScadenza(v.scad);
        righe.push([r.nome, inPool, n, v.corso || '', v.scad || '',
          etichettaStato[attStatoVoce(v)] || '', gg === null ? '' : gg, v.fonte || '']);
      });
    });
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 30 }, { wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attestati');
  XLSX.writeFile(wb, 'attestati_dipendenti_' + attOggiIso() + '.xlsx');
}
