/* ===== CONTROLLO PRODUZIONE: ORE MYSOND ===== */
// "📥 Carica MySond" importa l'export delle ore inserite in MySond (stesso formato dell'export
// ferie: Dipendente, commessa, voce, attività 1°/2° livello, descrizione, dataintervento
// Anno/Mese/Giorno, Somma di durata), abbina i dipendenti agli operatori con
// pwFerieMatchOperatore e salva un totale per operatore+giorno nella tabella Supabase
// `mysond_ore` (condivisa, una riga per data+operatore, dettaglio in jsonb). La colonna
// "MySond" accanto a "Ore Jira" mostra il totale del giorno dell'operatore (tutte le commesse,
// come Ore Jira); click = modal con la composizione. Non tocca controllo_produzione né Jira.

HELP_TEXTS['cp-mysond'] = 'Carica l\'export Excel delle ore inserite in MySond (colonne Dipendente, commessa, voce, attività, descrizione, dataintervento Anno/Mese/Giorno, Somma di durata).\n\nPer ogni operatore riconosciuto viene salvato il totale ore di ogni giorno, mostrato nella colonna "MySond" accanto a "Ore Jira" (click sul numero per il dettaglio). Il file può coprire qualsiasi periodo: i giorni presenti nel file sostituiscono quelli caricati in precedenza, gli altri restano invariati.\n\nI dipendenti non presenti nel Pool operatori vengono ignorati.';

let _cpMysond = {}; // operatore → { giornoIdx: { ore, dipendente, dettaglio, caricato_at, caricato_da } }
let _cpMysondDi = ''; // 'anno|week' a cui si riferisce _cpMysond (lo legge il Controllo anomalie)

const CP_MYSOND_CHUNK = 500;

function _cpMysondNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function _cpMysondOre(n) {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function _cpMysondIsoAdd(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* Carica le ore MySond della settimana mostrata (lun..dom). Una tabella mancante o un errore
   lasciano la colonna vuota senza bloccare il Controllo produzione. */
async function cpMysondLoad() {
  _cpMysond = {};
  _cpMysondDi = '';
  if (!_sbClient || !_sbUser) return;
  const di = pwAnno + '|' + pwWeek;
  const lun = isoWeekToMonday(pwAnno, pwWeek).toISOString().slice(0, 10);
  try {
    const { data, error } = await _sbClient
      .from('mysond_ore')
      .select('data,operatore,dipendente,ore,dettaglio,caricato_at,caricato_da')
      .gte('data', lun)
      .lte('data', _cpMysondIsoAdd(lun, 6));
    if (error) throw error;
    (data || []).forEach(r => {
      const dow = new Date(r.data + 'T00:00:00Z').getUTCDay();
      if (dow === 0) return; // domenica: fuori dalla tabella (Lun..Sab)
      if (!_cpMysond[r.operatore]) _cpMysond[r.operatore] = {};
      _cpMysond[r.operatore][dow - 1] = {
        ore: Number(r.ore) || 0, dipendente: r.dipendente || '',
        dettaglio: Array.isArray(r.dettaglio) ? r.dettaglio : [],
        caricato_at: r.caricato_at, caricato_da: r.caricato_da,
      };
    });
    _cpMysondDi = di;
  } catch (e) {
    console.warn('cpMysondLoad:', e);
  }
}

/* Cella "MySond" di una riga del Controllo produzione. In ambra se le Ore Jira del giorno
   (entrambe sono il totale giornaliero dell'operatore) escono dall'intervallo atteso: fra le
   ore di lavoro senza viaggio e quelle con il viaggio (stessa regola del Controllo anomalie). */
function cpMysondCellHtml(operatore, g, jVal, cantieri) {
  const rec = (_cpMysond[operatore] || {})[g];
  if (!rec) return '<span style="color:#cbd5e1" title="Nessuna ora MySond caricata per questo giorno">—</span>';
  const jNum = parseFloat(String(jVal));
  const m = cpaMysondRipartisci(rec);
  const diverso = !isNaN(jNum) && cpaMysondScarto(jNum, m, 0.25) !== 0;
  const ttl = 'Totale ore MySond del giorno (' + rec.dettaglio.length + ' inseriment' + (rec.dettaglio.length === 1 ? 'o' : 'i') + ')'
    + (m.viaggio > 0 ? ', di cui ' + _cpMysondOre(m.viaggio) + ' h di viaggio (non richieste su Jira)' : '')
    + (diverso ? ' — diverso dalle Ore Jira (' + jVal + ')' : '') + ' — clicca per il dettaglio';
  return '<button type="button" class="cp-mysond-btn' + (diverso ? ' cp-mysond-diff' : '') + '" title="' + esc(ttl) + '"'
    + ' data-op="' + esc(operatore) + '" data-g="' + g + '" data-jval="' + esc(String(jVal == null ? '' : jVal)) + '"'
    + ' data-cantieri="' + esc(JSON.stringify(cantieri || [])) + '" onclick="cpMysondDettaglio(this)">'
    + _cpMysondOre(rec.ore) + '</button>';
}

function cpMysondDettaglio(btn) {
  const operatore = btn.dataset.op;
  const g = parseInt(btn.dataset.g, 10);
  const rec = (_cpMysond[operatore] || {})[g];
  if (!rec) return;
  let cantieri = [];
  try { cantieri = JSON.parse(btn.dataset.cantieri || '[]'); } catch (_) {}
  const norm = s => pwFerieNormTokens(s).join(' ');
  const cantNorm = new Set(cantieri.map(norm).filter(Boolean));

  const giorno = new Date(isoWeekToMonday(pwAnno, pwWeek));
  giorno.setUTCDate(giorno.getUTCDate() + g);
  const dataLbl = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][g] + ' '
    + String(giorno.getUTCDate()).padStart(2, '0') + '/' + String(giorno.getUTCMonth() + 1).padStart(2, '0');

  const voci = rec.dettaglio.slice().sort((a, b) => (b.ore || 0) - (a.ore || 0));
  const m = cpaMysondRipartisci(rec);
  const nonLav = m.nonLavorate;
  const righe = voci.map(v => {
    const isNonLav = cpaMysondNonLavorata(v);
    const isViaggio = !isNonLav && cpaMysondViaggio(v);
    const suCantiere = !isNonLav && v.voce && cantNorm.has(norm(v.voce));
    const att = [v.att1, v.att2].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' › ');
    const bg = isNonLav ? 'background:#fff7ed;' : (isViaggio ? 'background:#eff6ff;' : (suCantiere ? 'background:#ecfdf5;' : ''));
    return '<tr style="' + bg + '">'
      + '<td class="px-2 py-1 align-top">' + esc(v.commessa || '') + (v.tipo ? '<div class="text-[10px] text-slate-400">' + esc(v.tipo) + '</div>' : '') + '</td>'
      + '<td class="px-2 py-1 align-top">' + esc(v.voce || '') + (suCantiere ? ' <span title="Cantiere pianificato in Griglia per questa riga">📍</span>' : '') + '</td>'
      + '<td class="px-2 py-1 align-top">' + (isViaggio ? '<span title="Viaggio: nella norma non va su Jira">🚐</span> ' : '') + esc(att || '—') + '</td>'
      + '<td class="px-2 py-1 align-top text-slate-500">' + esc(v.descrizione || '') + '</td>'
      + '<td class="px-2 py-1 align-top text-right font-semibold whitespace-nowrap">' + _cpMysondOre(Number(v.ore) || 0) + '</td>'
      + '</tr>';
  }).join('');

  const jVal = btn.dataset.jval;
  const jNum = parseFloat(jVal);
  const scarto = isNaN(jNum) ? 0 : cpaMysondScarto(jNum, m, 0.25);
  const atteso = m.viaggio > 0 ? _cpMysondOre(m.lavoro) + '–' + _cpMysondOre(m.lavoro + m.viaggio) : _cpMysondOre(m.lavoro);
  const jiraLbl = isNaN(jNum) ? 'non sincronizzate'
    : _cpMysondOre(jNum) + ' h' + (scarto ? ' <span class="text-amber-700">(Δ ' + (scarto > 0 ? '+' : '') + _cpMysondOre(scarto) + ' h rispetto alle ' + atteso + ' h attese)</span>' : '');
  const caricato = rec.caricato_at
    ? 'Caricato il ' + new Date(rec.caricato_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) + (rec.caricato_da ? ' da ' + esc(rec.caricato_da) : '')
    : '';

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col" style="max-height:85vh;">
        <div class="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold text-slate-900 text-sm">MySond — ${esc(operatore)} · ${dataLbl}</div>
            <div class="text-xs text-slate-500 mt-0.5">Totale <b>${_cpMysondOre(rec.ore)} h</b>${(nonLav > 0 || m.viaggio > 0) ? ' (di cui ' + [m.viaggio > 0 ? _cpMysondOre(m.viaggio) + ' h di viaggio' : '', nonLav > 0 ? _cpMysondOre(nonLav) + ' h non lavorate' : ''].filter(Boolean).join(', ') + ')' : ''} · Ore Jira ${jiraLbl}</div>
          </div>
          <button class="text-slate-400 hover:text-slate-600 text-lg leading-none" onclick="closeModal()">×</button>
        </div>
        <div class="px-5 py-3" style="overflow-y:auto;">
          <table class="w-full text-xs">
            <thead><tr class="text-left text-slate-500 border-b border-slate-200">
              <th class="px-2 py-1">Commessa</th><th class="px-2 py-1">Voce</th><th class="px-2 py-1">Attività</th><th class="px-2 py-1">Descrizione</th><th class="px-2 py-1 text-right">Ore</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">${righe}</tbody>
          </table>
          <div class="text-[11px] text-slate-400 mt-3">Totale del giorno su tutte le commesse. Viaggio (🚐, in azzurro) e ore non lavorate (in arancio) nella norma non vanno su Jira.${cantNorm.size ? ' In verde le voci sul cantiere pianificato in questa riga.' : ''}${rec.dipendente && rec.dipendente !== operatore ? ' In MySond: «' + esc(rec.dipendente) + '».' : ''}${caricato ? ' ' + caricato + '.' : ''}</div>
        </div>
        <div class="px-5 py-3 border-t border-slate-100 flex justify-end">
          <button class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50" onclick="closeModal()">Chiudi</button>
        </div>
      </div>
    </div>`;
}

function cpMysondPick(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ''; // permette di ricaricare lo stesso file
  if (file) cpMysondImportFile(file);
}

// Riepilogo pre-caricamento: showConfirmAsync farebbe l'escape dell'HTML degli elenchi.
function _cpMysondConferma(fileName, bodyHtml) {
  return new Promise(resolve => {
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-backdrop">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col" style="max-height:85vh;">
          <div class="px-5 py-4 border-b border-slate-100">
            <div class="font-semibold text-slate-900 text-sm">Caricamento ore MySond</div>
            <div class="text-xs text-slate-500 mt-0.5">${esc(fileName)}</div>
          </div>
          <div class="px-5 py-4" style="overflow-y:auto;">${bodyHtml}</div>
          <div class="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
            <button id="cpms-cancel" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Annulla</button>
            <button id="cpms-confirm" class="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">Carica</button>
          </div>
        </div>
      </div>`;
    document.getElementById('cpms-cancel').onclick = () => { closeModal(); resolve(false); };
    document.getElementById('cpms-confirm').onclick = () => { closeModal(); resolve(true); };
  });
}

// Abbina prima gli operatori attivi; solo se nessuno corrisponde prova anche gli ex/scaduti
// (settimane passate), così un omonimo licenziato non rende ambiguo un operatore attivo.
function _cpMysondMatch(nomeExcel, attivi, tutti) {
  const r = pwFerieMatchOperatore(nomeExcel, attivi);
  if (r.match || r.ambiguous) return r;
  return pwFerieMatchOperatore(nomeExcel, tutti);
}

async function cpMysondImportFile(file) {
  if (!sbGuardWrite()) return;
  if (!_sbClient || !_sbUser) { showAlertModal('Caricamento non disponibile in modalità offline.'); return; }
  if (typeof XLSX === 'undefined') { showAlertModal('Libreria XLSX non caricata. Verifica la connessione internet e ricarica la pagina.'); return; }

  let rows;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
  } catch (err) {
    showAlertModal('Errore nella lettura del file:\n\n' + err.message);
    return;
  }

  // L'header non è in riga 1 (prima c'è "Filtri applicati: ..."): lo cerco per contenuto.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if ((rows[i] || []).some(c => ('' + (c || '')).trim().toLowerCase() === 'dipendente')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) { showAlertModal('Colonna "Dipendente" non trovata nel file.\n\nVerifica che sia l\'export delle ore MySond.'); return; }
  const header = rows[headerIdx].map(h => ('' + (h || '')).trim().toLowerCase());
  const col = name => header.indexOf(name.toLowerCase());
  const c = {
    dip: col('Dipendente'), commessa: col('commessa'), voce: col('voce'),
    att1: col('attivita_primo_livello'), att2: col('attivita_secondo_livello'),
    descr: col('descrizione'), tipo: col('commessa_tipo'),
    anno: col('dataintervento - Anno'), mese: col('dataintervento - Mese'), giorno: col('dataintervento - Giorno'),
    durata: col('Somma di durata'),
  };
  if (c.anno < 0 || c.mese < 0 || c.giorno < 0 || c.durata < 0) {
    showAlertModal('Colonne attese non trovate ("dataintervento - Anno/Mese/Giorno", "Somma di durata").');
    return;
  }
  const txt = (row, i) => (i >= 0 && row[i] != null) ? ('' + row[i]).trim() : '';

  const operatori = state.operatori || [];
  const attivi = getOperatoriAttivi();
  const cacheMatch = new Map(); // nome excel → risultato abbinamento
  const unmatched = new Set(), ambiguous = new Set();
  const perCella = new Map();   // "data|||operatore" → record
  let righeLette = 0, righeSenzaData = 0, dataMin = null, dataMax = null;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[c.dip]) continue;
    righeLette++;
    const anno = parseInt(row[c.anno], 10);
    const meseRaw = txt(row, c.mese).toLowerCase();
    const meseIdx = /^\d+$/.test(meseRaw) ? parseInt(meseRaw, 10) - 1 : PW_FERIE_MESI[meseRaw];
    const gg = parseInt(row[c.giorno], 10);
    if (!anno || meseIdx === undefined || meseIdx < 0 || meseIdx > 11 || !gg) { righeSenzaData++; continue; }
    const dataISO = new Date(Date.UTC(anno, meseIdx, gg)).toISOString().slice(0, 10);
    if (!dataMin || dataISO < dataMin) dataMin = dataISO;
    if (!dataMax || dataISO > dataMax) dataMax = dataISO;

    const nomeExcel = txt(row, c.dip);
    if (!cacheMatch.has(nomeExcel)) cacheMatch.set(nomeExcel, _cpMysondMatch(nomeExcel, attivi, operatori));
    const m = cacheMatch.get(nomeExcel);
    if (!m.match) { (m.ambiguous ? ambiguous : unmatched).add(nomeExcel); continue; }

    const operatore = m.match.nome_esteso || m.match.nome;
    const key = dataISO + '|||' + operatore;
    if (!perCella.has(key)) perCella.set(key, { data: dataISO, operatore, dipendente: nomeExcel, ore: 0, dettaglio: [] });
    const rec = perCella.get(key);
    const ore = _cpMysondNum(row[c.durata]);
    rec.ore = Math.round((rec.ore + ore) * 100) / 100;
    rec.dettaglio.push({
      commessa: txt(row, c.commessa), voce: txt(row, c.voce),
      att1: txt(row, c.att1), att2: txt(row, c.att2),
      descrizione: txt(row, c.descr), tipo: txt(row, c.tipo), ore,
    });
  }

  if (perCella.size === 0) {
    showAlertModal('Nessuna riga abbinabile a un operatore del Pool trovata nel file (' + righeLette + ' righe lette).');
    return;
  }

  // Operatori pianificati nella settimana mostrata che il file copre ma per cui non ha ore:
  // è l'informazione utile (gli altri dipendenti non abbinati sono quasi sempre di altri reparti).
  const lun = isoWeekToMonday(pwAnno, pwWeek).toISOString().slice(0, 10);
  const sab = _cpMysondIsoAdd(lun, 5);
  const copreSettimana = dataMin <= sab && dataMax >= lun;
  const operatoriFile = new Set([...perCella.values()].map(r => r.operatore));
  const mancanti = new Set();
  if (copreSettimana) {
    pwGetWeekData().forEach(bc => (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
      if (op.nome && !op.fornitore && !operatoriFile.has(op.nome)
          && Object.values(op.giorni || {}).some(gd => pwCellCantieri(gd || {}).length)) mancanti.add(op.nome);
    })));
  }

  const fmt = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const lista = set => [...set].sort().map(esc).join(', ');
  const msg = '<div class="text-xs space-y-1 text-slate-600">'
    + '<div>• ' + righeLette + ' righe lette, periodo <b>' + fmt(dataMin) + ' – ' + fmt(dataMax) + '</b></div>'
    + '<div>• <b>' + operatoriFile.size + '</b> operatori riconosciuti, ' + perCella.size + ' giorni-operatore</div>'
    + (unmatched.size ? '<div>• ' + unmatched.size + ' dipendenti non presenti nel Pool operatori (ignorati)</div>' : '')
    + (ambiguous.size ? '<div class="text-amber-700">• ' + ambiguous.size + ' nominativi ambigui (ignorati): ' + lista(ambiguous) + '</div>' : '')
    + (righeSenzaData ? '<div>• ' + righeSenzaData + ' righe senza data valida (ignorate)</div>' : '')
    + (mancanti.size ? '<div class="text-amber-700" style="max-height:120px;overflow-y:auto;">• ' + mancanti.size + ' operatori pianificati questa settimana senza ore nel file: ' + lista(mancanti) + '</div>' : '')
    + (!copreSettimana ? '<div class="text-amber-700">• Il file non copre la settimana mostrata (W' + pwWeek + '): i dati saranno visibili aprendo le settimane del periodo.</div>' : '')
    + '<div class="mt-2">Le ore MySond già caricate per i giorni dal ' + fmt(dataMin) + ' al ' + fmt(dataMax) + ' verranno sostituite.</div>'
    + '</div>';
  if (!await _cpMysondConferma(file.name, msg)) return;

  const status = document.getElementById('cp-status');
  if (status) status.textContent = '⏳ Caricamento ore MySond…';
  try {
    const { error: delErr } = await _sbClient.from('mysond_ore').delete().gte('data', dataMin).lte('data', dataMax);
    if (delErr) throw delErr;
    const caricato_da = _sbUser.email || null;
    const records = [...perCella.values()].map(r => ({ ...r, caricato_da }));
    for (let i = 0; i < records.length; i += CP_MYSOND_CHUNK) {
      const { error } = await _sbClient.from('mysond_ore').insert(records.slice(i, i + CP_MYSOND_CHUNK));
      if (error) throw error;
    }
  } catch (e) {
    console.error('cpMysondImportFile:', e);
    if (status) status.textContent = '⚠ Errore caricamento MySond';
    showAlertModal('Errore nel salvataggio delle ore MySond:\n\n' + (e.message || e));
    return;
  }
  sbLogActivity('Controllo produzione: ore MySond caricate', { periodo: dataMin + '..' + dataMax, operatori: operatoriFile.size, giorni_operatore: perCella.size });

  await cpMysondLoad();
  pwControlloRender();
  if (status) status.textContent = '✅ Ore MySond caricate (' + fmt(dataMin) + ' – ' + fmt(dataMax) + ')';
}
