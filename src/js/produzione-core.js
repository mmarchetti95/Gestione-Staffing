/* ==================== CONTROLLO PRODUZIONE ==================== */
let _cpData = {}; // chiave: "commessa|||squadra|||operatore|||giorno" → { ore_jira, ore_report, km_cad, note }

/* ----- Colorazione celle Griglia settimanale: SOLO se cella verificata ----- */
function pwCellaVerificata(commessa, squadra, operatore, giornoIdx) {
  const k = `${commessa}|||${squadra}|||${operatore}|||${giornoIdx}`;
  const r = _cpData[k];
  if (!r) return false;
  return r.verificato === true;
}

function pwApplyProduzioneColors() {
  const grid = document.getElementById('pw-grid');
  if (!grid) return;
  const data = pwGetWeekData();
  grid.querySelectorAll('.pw-day-cell[data-cidx]').forEach(cell => {
    if (cell.classList.contains('in-ferie')) return; // priorità visiva alla ferie
    const cidx = parseInt(cell.dataset.cidx, 10);
    const sidx = parseInt(cell.dataset.sidx, 10);
    const oidx = parseInt(cell.dataset.oidx, 10);
    const day  = parseInt(cell.dataset.day, 10);
    const bc = data[cidx];
    const sq = bc && bc.squadre && bc.squadre[sidx];
    const op = sq && sq.operatori && sq.operatori[oidx];
    const has = (op && op.nome) ? pwCellaVerificata(bc.commessa, sq.nome, op.nome, day) : false;
    cell.classList.toggle('produzione-ok', has);
  });
}

async function pwSyncCpDataForGrid() {
  if (!_sbClient || !_sbUser) { pwApplyProduzioneColors(); return; }
  try {
    const { data, error } = await _sbClient
      .from('controllo_produzione')
      .select('commessa,squadra,operatore,giorno,ore_jira,ore_report,km_cad,note,jira_tickets,verificato,km_jira_uploaded,km_jira_last,km_by_ticket,km_last_by_ticket')
      .eq('anno', pwAnno)
      .eq('week', pwWeek);
    if (error) throw error;
    _cpData = {};
    (data || []).forEach(r => {
      const k = `${r.commessa}|||${r.squadra}|||${r.operatore}|||${r.giorno}`;
      _cpData[k] = cpRowToCell(r);
    });
  } catch(e) {
    console.error('pwSyncCpDataForGrid error:', e);
  }
  pwApplyProduzioneColors();
}
let _pwCollapsedComm = new Set(); // indici commessa collassati nella griglia
let _pwCollapsedSq   = new Set(); // chiavi "cidx-sidx" squadre collassate nella griglia
let _cpCollapsedComm = new Set(); // blIdx commesse collassate nel controllo produzione
let _cpCollapsedSq   = new Set(); // chiavi "blIdx-sqIdx" squadre collassate nel controllo produzione
let _cpLoading = false;

// Somma i valori di una mappa {ticket: km}. Ritorna null se vuota.
function cpSumKm(map) {
  if (!map || typeof map !== 'object') return null;
  const vals = Object.values(map).map(Number).filter(v => isFinite(v));
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) * 1000) / 1000;
}

// Converte una data "DD/MM" nella settimana corrente in ISO YYYY-MM-DD.
function cpDataISO(dataGiorno) {
  try {
    const [dd, mm] = String(dataGiorno).split('/');
    return `${pwAnno}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  } catch (_) { return null; }
}

// Costruisce l'oggetto cella (_cpData) da una riga Supabase, con migrazione lazy
// dal vecchio modello (km_cad/km_jira_last) alla mappa per-ticket quando la cella
// ha un solo ticket e non ha ancora dati per-ticket.
function cpRowToCell(r) {
  const cell = {
    ore_jira: r.ore_jira, ore_report: r.ore_report, km_cad: r.km_cad,
    note: r.note, jira_tickets: r.jira_tickets, verificato: r.verificato,
    km_jira_uploaded: r.km_jira_uploaded === true,
    km_jira_last: (r.km_jira_last == null ? null : Number(r.km_jira_last)),
    km_by_ticket: (r.km_by_ticket && typeof r.km_by_ticket === 'object') ? { ...r.km_by_ticket } : {},
    km_last_by_ticket: (r.km_last_by_ticket && typeof r.km_last_by_ticket === 'object') ? { ...r.km_last_by_ticket } : {},
  };
  const tks = Array.isArray(cell.jira_tickets) ? cell.jira_tickets : [];
  if (Object.keys(cell.km_by_ticket).length === 0 && cell.km_cad != null && tks.length === 1 && tks[0] && tks[0].key) {
    cell.km_by_ticket = { [tks[0].key]: Number(cell.km_cad) };
    if (cell.km_jira_last != null) cell.km_last_by_ticket = { [tks[0].key]: Number(cell.km_jira_last) };
  }
  return cell;
}

// Costruisce il record da upsertare a partire dallo stato corrente di _cpData[k].
function cpBuildRecord(commessa, squadra, operatore, giorno, dataISO, cantiere, attivita) {
  const k = `${commessa}|||${squadra}|||${operatore}|||${giorno}`;
  const cell = _cpData[k] || {};
  const byTicket = (cell.km_by_ticket && typeof cell.km_by_ticket === 'object') ? cell.km_by_ticket : {};
  const lastByTicket = (cell.km_last_by_ticket && typeof cell.km_last_by_ticket === 'object') ? cell.km_last_by_ticket : {};
  const kmSum = cpSumKm(byTicket);
  const lastSum = cpSumKm(lastByTicket);
  return {
    anno: pwAnno, week: pwWeek, commessa, squadra, operatore, giorno,
    data_giorno: dataISO || null,
    cantiere: cantiere || null, attivita: attivita || null,
    ore_jira: cell.ore_jira ?? null,
    jira_tickets: cell.jira_tickets ?? null,
    ore_report: cell.ore_report ?? null,
    km_cad: kmSum,                       // specchio derivato (somma per-ticket) per compatibilità
    km_jira_last: lastSum,               // idem
    km_jira_uploaded: lastSum != null,
    km_by_ticket: byTicket,
    km_last_by_ticket: lastByTicket,
    note: cell.note ?? null,
    verificato: cell.verificato === true,
    updated_at: new Date().toISOString(),
    updated_by: _sbUser?.email || null,
  };
}

async function pwControlloLoad() {
  const container = document.getElementById('cp-table-container');
  const status    = document.getElementById('cp-status');
  if (!container) return;
  if (_cpLoading) return;
  _cpLoading = true;

  container.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">⏳ Caricamento dati...</div>';
  if (status) status.textContent = '';

  try {
    if (_sbClient && _sbUser) {
      const { data, error } = await _sbClient
        .from('controllo_produzione')
        .select('commessa,squadra,operatore,giorno,ore_jira,ore_report,km_cad,note,jira_tickets,verificato,km_jira_uploaded,km_jira_last,km_by_ticket,km_last_by_ticket')
        .eq('anno', pwAnno)
        .eq('week', pwWeek);
      if (error) throw error;
      _cpData = {};
      (data || []).forEach(r => {
        const k = `${r.commessa}|||${r.squadra}|||${r.operatore}|||${r.giorno}`;
        _cpData[k] = cpRowToCell(r);
      });
      if (status) status.textContent = `${(data||[]).length} record caricati`;
    } else {
      _cpData = {};
      if (status) status.textContent = 'Modalità offline — i dati non verranno salvati';
    }
  } catch(e) {
    console.error('pwControlloLoad error:', e);
    if (status) status.textContent = '⚠ Errore caricamento';
  }

  _cpLoading = false;
  pwControlloRender();
}

function pwControlloRender() {
  const container = document.getElementById('cp-table-container');
  if (!container) return;
  const data    = pwGetWeekData();
  const monday  = isoWeekToMonday(pwAnno, pwWeek);
  const DAY_NAMES = ['Lun','Mar','Mer','Gio','Ven','Sab'];

  const dates = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`);
  }

  // Struttura raggruppata: commessa → squadra → giorno → operatori
  const blocks = [];
  data.forEach(bc => {
    if (!bc.commessa) return;
    const sqList = [];
    (bc.squadre || []).forEach(sq => {
      const sqNome = sq.nome || 'Squadra';
      const giorni = [];
      for (let g = 0; g < 6; g++) {
        const ops = [];
        (sq.operatori || []).forEach(op => {
          if (!op.nome || !op.nome.trim()) return;
          const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
          const cantieri = pwCellCantieri(opG);
          if (cantieri.length === 0) return;
          const fw = pwGetFerieWeek();
          if (fw[op.nome] && pwFerieTipo(fw[op.nome][g])) return;
          ops.push({ nome: op.nome, cantiere: cantieri.join(', '), attivita: opG.attivita || '' });
        });
        if (ops.length > 0) giorni.push({ giornoIdx: g, ops });
      }
      if (giorni.length > 0) sqList.push({ nome: sqNome, giorni });
    });
    if (sqList.length > 0) blocks.push({ commessa: bc.commessa, squadre: sqList });
  });

  if (blocks.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-400 py-10 text-sm">Nessun operatore pianificato questa settimana.</div>';
    return;
  }

  const esc   = v => (v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const jsesc = v => (v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  let html = `<table class="cp-table">
    <thead><tr>
      <th style="max-width:80px">Commessa</th><th style="max-width:70px">Squadra</th><th style="max-width:90px">Operatore</th>
      <th style="text-align:center;min-width:44px;max-width:44px">Verificato</th>
      <th>Giorno</th><th>Data</th><th style="max-width:80px">Cantiere</th><th style="max-width:80px">Attività</th>
      <th style="text-align:center;max-width:50px">Ore Jira</th><th style="min-width:66px;max-width:66px">Ticket</th><th style="min-width:80px;max-width:80px">Epic</th><th style="max-width:60px">Ore Report Prod.</th>
      <th style="min-width:40px;text-align:center">Δ Ore</th>
      <th style="max-width:60px">Km / Cad</th><th style="text-align:center;min-width:60px">Su Jira</th><th style="max-width:90px">Note</th>
    </tr></thead><tbody>`;

  let ri = 0;

  blocks.forEach((bl, blIdx) => {
    html += `<tr class="cp-tr-commessa" data-comm-idx="${blIdx}"><td colspan="16"><span class="cp-carr" style="cursor:pointer;user-select:none;margin-right:5px;font-size:11px;display:inline-block;width:10px;text-align:center;" onclick="cpToggleComm(${blIdx})">▼</span>📁 ${esc(bl.commessa)}</td></tr>`;
    bl.squadre.forEach((sq, sqIdx) => {
      const sqKey = blIdx + '-' + sqIdx;
      html += `<tr class="cp-tr-squadra" data-comm-idx="${blIdx}" data-sq-idx="${sqKey}"><td colspan="16">&nbsp;&nbsp;&nbsp;<span class="cp-sarr" style="cursor:pointer;user-select:none;margin-right:5px;font-size:11px;display:inline-block;width:10px;text-align:center;" onclick="cpToggleSq('${jsAttr(sqKey)}')">▼</span>👥 ${esc(sq.nome)}<button class="no-print" style="margin-left:10px;font-size:11px;font-weight:600;background:#4f46e5;color:#fff;border:none;border-radius:5px;padding:2px 8px;cursor:pointer;" onclick="event.stopPropagation();pwControlloSyncJira('${jsesc(bl.commessa)}','${jsesc(sq.nome)}',this)">🔄 Sincronizza squadra</button><button class="no-print" style="margin-left:6px;font-size:11px;font-weight:600;background:#0ea5e9;color:#fff;border:none;border-radius:5px;padding:2px 8px;cursor:pointer;" onclick="event.stopPropagation();cpCaricaReportSquadra('${jsesc(bl.commessa)}','${jsesc(sq.nome)}')">📄 Carica Report</button></td></tr>`;
      sq.giorni.forEach((gBlock, gIdx) => {
        const g   = gBlock.giornoIdx;
        const sep = gIdx > 0 ? ' cp-day-sep' : '';
        html += `<tr class="cp-tr-day${sep}" data-comm-idx="${blIdx}" data-sq-idx="${sqKey}"><td colspan="16">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📅 ${DAY_NAMES[g]} ${dates[g]}</td></tr>`;

        gBlock.ops.forEach(op => {
          const k     = `${bl.commessa}|||${sq.nome}|||${op.nome}|||${g}`;
          const saved = _cpData[k] || {};
          const jVal  = saved.ore_jira   != null ? saved.ore_jira   : '';
          const rVal  = saved.ore_report != null ? saved.ore_report : '';
          const kVal  = saved.km_cad     != null ? saved.km_cad     : '';
          const nVal  = saved.note || '';
          const tickets = Array.isArray(saved.jira_tickets) ? saved.jira_tickets : [];
          const byTicket     = (saved.km_by_ticket      && typeof saved.km_by_ticket      === 'object') ? saved.km_by_ticket      : {};
          const lastByTicket = (saved.km_last_by_ticket && typeof saved.km_last_by_ticket === 'object') ? saved.km_last_by_ticket : {};
          const ticketHtml = tickets.length === 0
            ? '<span style="color:#cbd5e1">—</span>'
            : tickets.map(t => `<a href="${esc(t.url||'')}" target="_blank" rel="noopener" title="${esc(t.key||'')}${t.hours!=null?(' — '+t.hours+'h'):''}" style="display:block;height:24px;line-height:24px;color:#2563eb;text-decoration:none;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">• ${esc(t.key||'')}</a>`).join('');
          // Epic distinti fra i ticket del giorno (dedup per key)
          const epicMap = {};
          tickets.forEach(t => { if (t.epic && t.epic.key) epicMap[t.epic.key] = t.epic; });
          const epicList = Object.values(epicMap);
          const epicHtml = epicList.length === 0
            ? '<span style="color:#cbd5e1">—</span>'
            : epicList.map(ep => `<a href="${esc(ep.url||'')}" target="_blank" rel="noopener" title="${esc(ep.name||ep.key||'')}" style="display:block;height:24px;line-height:24px;color:#7c3aed;text-decoration:none;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🟣 ${esc(ep.name||ep.key||'')}</a>`).join('');
          // Km/Cad e "Su Jira" per singolo ticket, allineati verticalmente ai ticket
          const kmCellHtml = tickets.length === 0
            ? '<span style="color:#cbd5e1">—</span>'
            : tickets.map(t => {
                const kv = byTicket[t.key];
                return `<input class="cp-input" type="number" step="0.1" min="0" style="width:64px;height:22px;display:block;margin:1px 0;box-sizing:border-box;" value="${kv==null?'':esc(String(kv))}" title="${esc(t.key||'')}" onblur="cpSaveKmTicket('${jsesc(bl.commessa)}','${jsesc(sq.nome)}','${jsesc(op.nome)}',${g},'${jsesc(dates[g])}','${jsesc(op.cantiere)}','${jsesc(op.attivita)}','${jsesc(t.key||'')}',this.value)">`;
              }).join('');
          const suJiraHtml = tickets.length === 0
            ? '<span style="color:#cbd5e1">—</span>'
            : tickets.map(t => {
                const wrote = lastByTicket[t.key] != null;
                const ttl = wrote ? ('Ultimo scritto su Jira: ' + lastByTicket[t.key] + ' — clicca per azzerare lo storico (con conferma)') : 'Si spunta dopo la scrittura su Jira';
                const reloadBtn = wrote ? `<button type="button" class="no-print" title="Rileggi il valore attuale da Jira (sovrascrive il Km/Cad locale di questo ticket)" style="border:none;background:transparent;cursor:pointer;font-size:12px;line-height:1;padding:0;margin-left:3px;" onclick="cpRereadTicket(event,'${jsesc(bl.commessa)}','${jsesc(sq.nome)}','${jsesc(op.nome)}',${g},'${jsesc(dates[g])}','${jsesc(op.cantiere)}','${jsesc(op.attivita)}','${jsesc(t.key||'')}')">🔄</button>` : '';
                return `<div style="height:24px;display:flex;align-items:center;justify-content:center;"><input type="checkbox" ${wrote?'checked':''} title="${esc(ttl)}" style="width:15px;height:15px;cursor:pointer;" onclick="cpJiraFlagTicketClick(event,'${jsesc(bl.commessa)}','${jsesc(sq.nome)}','${jsesc(op.nome)}',${g},'${jsesc(t.key||'')}')">${reloadBtn}</div>`;
              }).join('');
          const jDisplay = (jVal === '' || jVal == null)
            ? '<span style="color:#cbd5e1">—</span>'
            : esc(String(jVal));
          const verificato = saved.verificato === true;

          const jNum = parseFloat(String(jVal)), rNum = parseFloat(String(rVal));
          let deltaHtml;
          if (!isNaN(jNum) && !isNaN(rNum)) {
            const dv  = jNum - rNum;
            const col = dv >= 0 ? '#16a34a' : '#dc2626';
            deltaHtml = `<span style="font-weight:700;color:${col}">${dv >= 0 ? '+' : ''}${dv.toFixed(1)}</span>`;
          } else {
            deltaHtml = `<span style="color:#cbd5e1">—</span>`;
          }

          const ci = jsesc(bl.commessa), si = jsesc(sq.nome), oi = jsesc(op.nome);
          const ca = jsesc(op.cantiere), at = jsesc(op.attivita), dt = jsesc(dates[g]);

          html += `<tr data-comm-idx="${blIdx}" data-sq-idx="${sqKey}">
      <td class="cp-wrap" title="${esc(bl.commessa)}">${esc(bl.commessa)}</td>
      <td class="cp-wrap" title="${esc(sq.nome)}">${esc(sq.nome)}</td>
      <td class="cp-wrap" title="${esc(op.nome)}"><strong>${esc(op.nome)}</strong>${isOperatoreLicenziato(op.nome) ? '<span class="op-ex-tag">ex</span>' : ''}</td>
      <td style="text-align:center"><input type="checkbox" ${verificato ? 'checked' : ''} title="Verificato" style="width:16px;height:16px;cursor:pointer;" onchange="pwControlloSaveCell('${ci}','${si}','${oi}',${g},'${dt}','${ca}','${at}','verificato',this.checked)"></td>
      <td>${DAY_NAMES[g]}</td>
      <td>${dates[g]}</td>
      <td class="cp-wrap" style="color:#64748b" title="${esc(op.cantiere)}">${esc(op.cantiere)}</td>
      <td class="cp-wrap" style="color:#64748b" title="${esc(op.attivita)}">${esc(op.attivita)}</td>
      <td style="${cpOreJiraStyle(jVal, g)}"><span id="cp-j-${ri}" data-jval="${esc(String(jVal))}">${jDisplay}</span></td>
      <td style="vertical-align:top;padding-top:4px;">${ticketHtml}</td>
      <td style="vertical-align:top;padding-top:4px;">${epicHtml}</td>
      <td class="cp-td-edit"><input id="cp-r-${ri}" class="cp-input" type="number" step="0.5" min="0" max="24"
        value="${esc(String(rVal))}" oninput="cpDelta(${ri})"
        onblur="pwControlloSaveCell('${ci}','${si}','${oi}',${g},'${dt}','${ca}','${at}','ore_report',this.value)"></td>
      <td id="cp-d-${ri}" style="text-align:center">${deltaHtml}</td>
      <td class="cp-td-edit" style="vertical-align:top;padding-top:4px;">${kmCellHtml}</td>
      <td style="vertical-align:top;padding-top:4px;">${suJiraHtml}</td>
      <td class="cp-td-edit"><input class="cp-input note" type="text"
        value="${esc(nVal)}"
        onblur="pwControlloSaveCell('${ci}','${si}','${oi}',${g},'${dt}','${ca}','${at}','note',this.value)"></td>
    </tr>`;
          ri++;
        });
      });
    });
  });

  html += '</tbody></table>';
  container.innerHTML = html;
  cpApplyCollapse();
}

function cpDelta(ri) {
  const jEl = document.getElementById('cp-j-' + ri);
  const rEl = document.getElementById('cp-r-' + ri);
  const dEl = document.getElementById('cp-d-' + ri);
  if (!jEl || !rEl || !dEl) return;
  // Ore Jira ora e' una cella read-only: valore letto da data-jval
  const j = parseFloat(jEl.dataset ? jEl.dataset.jval : '');
  const r = parseFloat(rEl.value);
  if (isNaN(j) || isNaN(r)) { dEl.innerHTML = '<span style="color:#cbd5e1">—</span>'; return; }
  const dv  = j - r;
  const col = dv >= 0 ? '#16a34a' : '#dc2626';
  dEl.innerHTML = `<span style="font-weight:700;color:${col}">${dv >= 0 ? '+' : ''}${dv.toFixed(1)}</span>`;
}

/* ----- Colore cella "Ore Jira" in base a ore + giorno della settimana -----
   giornoIdx: 0=Lun 1=Mar 2=Mer 3=Gio 4=Ven 5=Sab
   Lun/Ven (giornate corte): <5 arancione, 5..8,5 verde, >8,5 giallo
   Altri giorni: <5 rosso, 5..<7 arancione, 7..8,5 verde, >8,5 giallo
   0 o vuoto: default. */
function cpOreJiraStyle(jVal, giornoIdx) {
  const base = 'text-align:center;font-weight:600;';
  const h = parseFloat(String(jVal));
  // 0 o vuoto/non numerico -> default
  if (isNaN(h) || h === 0) return base + 'background:#f8fafc;color:var(--accent-dark);';
  const isLunVen = (giornoIdx === 0 || giornoIdx === 4);
  let bg, fg;
  if (h > 8.5) {                       // troppe ore
    bg = '#fef9c3'; fg = '#854d0e';    // giallo
  } else if (isLunVen) {
    if (h < 5)      { bg = '#ffedd5'; fg = '#9a3412'; } // arancione
    else            { bg = '#dcfce7'; fg = '#166534'; } // verde (5..8,5)
  } else {
    if (h < 5)      { bg = '#fee2e2'; fg = '#991b1b'; } // rosso
    else if (h < 7) { bg = '#ffedd5'; fg = '#9a3412'; } // arancione
    else            { bg = '#dcfce7'; fg = '#166534'; } // verde (7..8,5)
  }
  return base + `background:${bg};color:${fg};`;
}

/* ----- Sincronizzazione worklog da Jira (Edge Function) ----- */
// Estrae il messaggio d'errore reale dal corpo della risposta di una Edge Function
// (supabase-js espone la Response in error.context). Fallback al messaggio generico.
async function _cpEdgeErr(error, fnName) {
  const prefix = fnName ? `[${fnName}] ` : '';
  try {
    if (error && error.context && typeof error.context.clone === 'function') {
      const body = await error.context.clone().text();
      if (body) {
        try { const j = JSON.parse(body); if (j && j.error) return prefix + j.error; } catch (_) {}
        return prefix + body.slice(0, 300);
      }
    }
  } catch (_) { /* ignore */ }
  return prefix + (error && error.message ? error.message : String(error));
}

// scopeCommessa/scopeSquadra: se entrambi valorizzati, la sync (worklog + KM) si limita
// a quella squadra invece che a tutta la settimana. btnEl: bottone da disabilitare durante
// la sync (default il bottone globale in header, per compatibilità con la chiamata senza argomenti).
async function pwControlloSyncJira(scopeCommessa, scopeSquadra, btnEl) {
  if (!_sbClient || !_sbUser) { showAlertModal('Sincronizzazione non disponibile in modalità offline.'); return; }

  const scoped     = (scopeCommessa != null && scopeSquadra != null);
  const scopeLabel = scoped ? ` della squadra "${scopeSquadra}" (commessa "${scopeCommessa}")` : ' di questa settimana';

  // (Decisione A) conferma sovrascrittura
  const ok = await showConfirmAsync(
    `I valori "Ore Jira" e "Ticket"${scopeLabel} verranno sovrascritti con i dati reali da Jira. Procedere?`,
    'Sincronizza da Jira');
  if (!ok) return;

  const status = document.getElementById('cp-status');
  const btn = btnEl || document.getElementById('cp-sync-jira');
  if (status) status.textContent = `⏳ Sincronizzazione${scopeLabel} in corso…`;
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  try {
    // Date ISO Lun..Sab della settimana corrente
    const monday = isoWeekToMonday(pwAnno, pwWeek);
    const isoDates = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      isoDates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
    }
    const startDate = isoDates[0], endDate = isoDates[5];

    // Mappa nome operatore -> email
    const emailByNome = {};
    (state.operatori || []).forEach(o => {
      const n = o.nome_esteso || o.nome_breve || o.nome;
      if (n && o.email && o.email.trim()) emailByNome[n] = o.email.trim();
    });

    // Raccogli le celle pianificate (stessa logica di inclusione del render)
    const data = pwGetWeekData();
    const fw = pwGetFerieWeek();
    const cells = [];
    data.forEach(bc => {
      if (!bc.commessa) return;
      if (scoped && bc.commessa !== scopeCommessa) return;
      (bc.squadre || []).forEach(sq => {
        const sqNome = sq.nome || 'Squadra';
        if (scoped && sqNome !== scopeSquadra) return;
        for (let g = 0; g < 6; g++) {
          (sq.operatori || []).forEach(op => {
            if (!op.nome || !op.nome.trim()) return;
            const opG = op.giorni && op.giorni[g] ? op.giorni[g] : {};
            const cantieri = pwCellCantieri(opG);
            if (cantieri.length === 0) return;
            if (fw[op.nome] && pwFerieTipo(fw[op.nome][g])) return;
            cells.push({
              commessa: bc.commessa, squadra: sqNome, operatore: op.nome, giorno: g,
              dataISO: isoDates[g], cantiere: cantieri.join(', '), attivita: opG.attivita || '',
              email: emailByNome[op.nome] || '',
            });
          });
        }
      });
    });

    const emails = [...new Set(cells.map(c => c.email).filter(Boolean))];
    const noEmailOps = [...new Set(cells.filter(c => !c.email).map(c => c.operatore))];

    if (emails.length === 0) {
      showAlertModal(`Nessun operatore con email assegnata${scopeLabel}. Assegna le email dalla tab "Email/operatore".`);
      if (status) status.textContent = '';
      return;
    }

    // Chiamata Edge Function
    const { data: fnData, error } = await _sbClient.functions.invoke('jira-sync-worklogs', {
      body: { emails, startDate, endDate },
    });
    if (error) throw new Error(await _cpEdgeErr(error, 'jira-sync-worklogs'));

    const results = (fnData && fnData.results) || {};
    const errs    = (fnData && fnData.errors)  || {};

    // Costruisci i record da upsertare (Decisione B: operatori senza email saltati)
    const records = [];
    let updated = 0;
    cells.forEach(c => {
      if (!c.email) return;
      const dayData = (results[c.email.toLowerCase()] || {})[c.dataISO];
      // (Decisione C) giorno senza worklog -> 0 ore, nessun ticket
      const hours   = dayData ? dayData.hours   : 0;
      const tickets = dayData ? dayData.tickets : [];

      const k = `${c.commessa}|||${c.squadra}|||${c.operatore}|||${c.giorno}`;
      if (!_cpData[k]) _cpData[k] = {};
      _cpData[k].ore_jira     = hours;
      _cpData[k].jira_tickets = tickets;

      records.push(cpBuildRecord(c.commessa, c.squadra, c.operatore, c.giorno, c.dataISO, c.cantiere, c.attivita));
      updated++;
    });

    if (records.length > 0) {
      const { error: upErr } = await _sbClient
        .from('controllo_produzione')
        .upsert(records, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
      if (upErr) throw new Error(upErr.message || 'Errore salvataggio');
    }

    // === Recupero KM/CAD da Jira (Actual Production) per ticket non ancora valorizzati ===
    // Per ogni ticket della cella che non ha ancora un valore locale, leggo l'Actual
    // Production dal ticket e lo adotto (byTicket = lastByTicket = valore letto), così
    // non verrà risommato ma potrà essere sostituito da un report successivo.
    let kmReadMsg = '';
    const readSet = new Set();
    const readCellByKey = [];
    cells.forEach(c => {
      if (!c.email) return;
      const k = `${c.commessa}|||${c.squadra}|||${c.operatore}|||${c.giorno}`;
      const cell = _cpData[k] || {};
      const tks = Array.isArray(cell.jira_tickets) ? cell.jira_tickets : [];
      const byTicket = (cell.km_by_ticket && typeof cell.km_by_ticket === 'object') ? cell.km_by_ticket : {};
      tks.forEach(t => {
        if (!t.key) return;
        if (byTicket[t.key] != null) return; // già valorizzato localmente
        readSet.add(t.key);
        readCellByKey.push({ k, issueKey: t.key, commessa: c.commessa, squadra: c.squadra, operatore: c.operatore, giorno: c.giorno, dataISO: c.dataISO, cantiere: c.cantiere, attivita: c.attivita });
      });
    });

    if (readSet.size > 0) {
      if (status) status.textContent = '⏳ Recupero Actual Production da Jira…';
      const { data: rData, error: rErr } = await _sbClient.functions.invoke('jira-update-production', {
        body: { reads: [...readSet] },
      });
      if (rErr) {
        kmReadMsg = `\n\n⚠ Errore lettura Actual Production da Jira: ${await _cpEdgeErr(rErr, 'jira-update-production')}.`;
      } else if (rData && rData.error) {
        kmReadMsg = `\n\n⚠ Lettura Actual Production non riuscita: ${rData.error}.`;
      } else {
        const rvalues = (rData && rData.values) || {};
        const touchedCells = new Map();
        let filled = 0;
        readCellByKey.forEach(u => {
          const v = rvalues[u.issueKey];
          if (v == null || !isFinite(Number(v)) || Number(v) <= 0) return;
          const val = Math.round(Number(v) * 1000) / 1000;
          if (!_cpData[u.k].km_by_ticket || typeof _cpData[u.k].km_by_ticket !== 'object') _cpData[u.k].km_by_ticket = {};
          if (!_cpData[u.k].km_last_by_ticket || typeof _cpData[u.k].km_last_by_ticket !== 'object') _cpData[u.k].km_last_by_ticket = {};
          _cpData[u.k].km_by_ticket[u.issueKey] = val;
          _cpData[u.k].km_last_by_ticket[u.issueKey] = val; // adottato: delta futuro = km - val
          _cpData[u.k].km_cad = cpSumKm(_cpData[u.k].km_by_ticket);
          touchedCells.set(u.k, u);
          filled++;
        });
        if (touchedCells.size > 0) {
          const readRecords = [...touchedCells.values()].map(u => cpBuildRecord(u.commessa, u.squadra, u.operatore, u.giorno, u.dataISO, u.cantiere, u.attivita));
          const { error: rUpErr } = await _sbClient
            .from('controllo_produzione')
            .upsert(readRecords, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
          if (rUpErr) {
            kmReadMsg = `\n\n⚠ Valori KM recuperati da Jira ma errore nel salvataggio: ${rUpErr.message || rUpErr}.`;
          } else {
            kmReadMsg = `\n\nℹ ${filled} valore/i "Km/Cad" recuperati da Jira (Actual Production).`;
          }
        }
      }
    }

    // === Upload KM/CAD -> Jira "Actual Production" (modello delta, per ticket) ===
    // Per ogni ticket con valore locale, si scrive su Jira solo la DIFFERENZA
    // rispetto all'ultimo valore scritto per quel ticket (km_last_by_ticket).
    // delta può essere negativo. I ticket con delta 0 vengono saltati.
    let kmMsg = '';
    const kmUpdates = [];
    cells.forEach(c => {
      if (!c.email) return;
      const k = `${c.commessa}|||${c.squadra}|||${c.operatore}|||${c.giorno}`;
      const cell = _cpData[k] || {};
      const tks = Array.isArray(cell.jira_tickets) ? cell.jira_tickets : [];
      const byTicket = (cell.km_by_ticket && typeof cell.km_by_ticket === 'object') ? cell.km_by_ticket : {};
      const lastByTicket = (cell.km_last_by_ticket && typeof cell.km_last_by_ticket === 'object') ? cell.km_last_by_ticket : {};
      const ticketKeys = new Set(tks.map(t => t.key).filter(Boolean));
      Object.keys(byTicket).forEach(issueKey => {
        if (!ticketKeys.has(issueKey)) return; // ignora km orfani (ticket non più presente)
        const km = Number(byTicket[issueKey]);
        if (!isFinite(km)) return;
        const last = (lastByTicket[issueKey] == null) ? 0 : Number(lastByTicket[issueKey]);
        const delta = Math.round((km - last) * 1000) / 1000;
        if (delta === 0) return;
        kmUpdates.push({
          k, issueKey, add: delta, newLast: km, isFirst: (lastByTicket[issueKey] == null),
          commessa: c.commessa, squadra: c.squadra, operatore: c.operatore, giorno: c.giorno,
          dataISO: c.dataISO, cantiere: c.cantiere, attivita: c.attivita,
        });
      });
    });

    if (kmUpdates.length > 0) {
      const nNew = kmUpdates.filter(u => u.isFirst).length;
      const nUpd = kmUpdates.length - nNew;
      const okKm = await showConfirmAsync(
        `Aggiornamento "Actual Production" su Jira per ${kmUpdates.length} ticket ` +
        `(${nNew} nuovi, ${nUpd} corretti).\n\n` +
        `Verrà applicata la differenza rispetto all'ultimo valore già scritto per ciascun ticket (la tua quota viene sostituita, non risommata). Procedere?`,
        'Aggiorna Jira');
      if (!okKm) {
        kmMsg = `\n\n(Aggiornamento KM su Jira annullato — nessuna modifica ai ticket.)`;
      } else {
        if (status) status.textContent = '⏳ Aggiornamento Actual Production su Jira…';
        const { data: pData, error: pErr } = await _sbClient.functions.invoke('jira-update-production', {
          body: { updates: kmUpdates.map(u => ({ issueKey: u.issueKey, add: u.add })) },
        });
        if (pErr) {
          kmMsg = `\n\n⚠ Errore upload KM su Jira: ${await _cpEdgeErr(pErr, 'jira-update-production')}. Nessuno storico modificato.`;
        } else if (pData && pData.error) {
          kmMsg = `\n\n⚠ Upload KM su Jira non riuscito: ${pData.error}. Nessuno storico modificato.`;
        } else {
          const pres = (pData && pData.results) || {};
          const perr = (pData && pData.errors)  || {};
          const touched = new Map();
          let uploaded = 0;
          kmUpdates.forEach(u => {
            const r = pres[u.issueKey];
            if (r && r.ok) {
              if (!_cpData[u.k].km_last_by_ticket || typeof _cpData[u.k].km_last_by_ticket !== 'object') _cpData[u.k].km_last_by_ticket = {};
              _cpData[u.k].km_last_by_ticket[u.issueKey] = u.newLast;
              touched.set(u.k, u);
              uploaded++;
            }
          });
          if (touched.size > 0) {
            const flagRecords = [...touched.values()].map(u => cpBuildRecord(u.commessa, u.squadra, u.operatore, u.giorno, u.dataISO, u.cantiere, u.attivita));
            const { error: fErr } = await _sbClient
              .from('controllo_produzione')
              .upsert(flagRecords, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
            if (fErr) {
              kmMsg = `\n\n⚠ Jira aggiornato (${uploaded}) ma ERRORE nel salvare lo storico: ${fErr.message||fErr}. ` +
                      `Attenzione: una nuova sincronizzazione potrebbe riapplicare i valori. Contatta lo sviluppatore.`;
            }
          }
          if (!kmMsg) {
            kmMsg = `\n\n✅ Actual Production aggiornata su Jira: ${uploaded}/${kmUpdates.length} ticket` +
                    (pData.fieldId ? ` (campo ${pData.fieldId})` : '') + '.';
            const perrKeys = Object.keys(perr);
            if (perrKeys.length) {
              kmMsg += ` ⚠ Errori: ` + perrKeys.map(kk => `${kk} (${perr[kk]})`).join('; ') + '.';
            }
          }
        }
      }
    }

    pwControlloRender();
    pwApplyProduzioneColors();

    // Riepilogo (Decisione B)
    let msg = `✅ Sincronizzati ${updated} record da Jira${scopeLabel}.`;
    if (noEmailOps.length) {
      msg += `\n\n⚠ ${noEmailOps.length} operator${noEmailOps.length>1?'i':'e'} senza email (saltati): ${noEmailOps.join(', ')}.`;
    }
    const errKeys = Object.keys(errs);
    if (errKeys.length) {
      msg += `\n\n⚠ ${errKeys.length} error${errKeys.length>1?'i':'e'} Jira: ` +
             errKeys.map(e => `${e} (${errs[e]})`).join('; ') + '.';
    }
    msg += kmReadMsg;
    msg += kmMsg;
    if (status) status.textContent = `${updated} record sincronizzati`;
    showAlertModal(msg);
  } catch (e) {
    console.error('pwControlloSyncJira error:', e);
    if (status) status.textContent = '⚠ Errore sincronizzazione';
    showAlertModal('Errore durante la sincronizzazione: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

async function pwControlloSaveCell(commessa, squadra, operatore, giornoIdx, dataGiorno, cantiere, attivita, field, value) {
  const k = `${commessa}|||${squadra}|||${operatore}|||${giornoIdx}`;
  if (!_cpData[k]) _cpData[k] = {};

  // Aggiorna cache locale
  const numFields  = ['ore_jira','ore_report','km_cad'];
  const boolFields = ['verificato'];
  if (boolFields.includes(field)) {
    _cpData[k][field] = (value === true || value === 'true');
  } else if (numFields.includes(field)) {
    _cpData[k][field] = value === '' ? null : parseFloat(value);
  } else {
    _cpData[k][field] = value === '' ? null : value;
  }

  // Aggiorna subito la colorazione nella Griglia settimanale (anche se non è la tab attiva)
  pwApplyProduzioneColors();

  if (!_sbClient || !_sbUser) return; // offline, solo cache locale

  // Calcola data_giorno ISO da dataGiorno "DD/MM"
  let dataISO = null;
  try {
    const [dd, mm] = dataGiorno.split('/');
    dataISO = `${pwAnno}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  } catch(e) {}

  const record = {
    anno:        pwAnno,
    week:        pwWeek,
    commessa,
    squadra,
    operatore,
    giorno:      giornoIdx,
    data_giorno: dataISO,
    cantiere:    cantiere || null,
    attivita:    attivita || null,
    ore_jira:    _cpData[k].ore_jira   ?? null,
    ore_report:  _cpData[k].ore_report ?? null,
    km_cad:      _cpData[k].km_cad    ?? null,
    note:        _cpData[k].note      ?? null,
    verificato:  _cpData[k].verificato === true,
    updated_at:  new Date().toISOString(),
    updated_by:  _sbUser?.email || null,
  };

  try {
    const { error } = await _sbClient
      .from('controllo_produzione')
      .upsert(record, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
    if (error) throw error;
  } catch(e) {
    console.error('pwControlloSaveCell error:', e);
    const st = document.getElementById('cp-status');
    if (st) { st.textContent = '⚠ Errore salvataggio'; setTimeout(() => { st.textContent = ''; }, 3000); }
  }
}

// Gestisce il click sulla checkbox "Su Jira".
// - Riflette km_jira_last (l'ultimo valore scritto su Jira da questa app).
// - Non è spuntabile manualmente (si spunta solo dopo una scrittura su Jira).
// - Se spuntata, la si può azzerare (dimentica lo storico) solo con conferma:
//   alla sync successiva l'intero KM/CAD verrà nuovamente sommato all'Actual
//   Production. Usare solo se il campo su Jira è stato azzerato a mano.
async function cpJiraFlagClick(ev, commessa, squadra, operatore, giorno) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const k = `${commessa}|||${squadra}|||${operatore}|||${giorno}`;
  const cur = _cpData[k] && _cpData[k].km_jira_last != null;

  if (!cur) {
    showAlertModal('Questo indicatore si spunta automaticamente dopo la scrittura del KM/CAD su Jira. Non può essere attivato manualmente.');
    return;
  }

  const ok = await showConfirmAsync(
    'Vuoi azzerare lo storico di scrittura su Jira per questa cella?\n\n' +
    'Alla prossima sincronizzazione l\'INTERO valore KM/CAD verrà nuovamente SOMMATO all\'Actual Production del ticket ' +
    '(non solo la differenza). Usa questa opzione solo se hai azzerato il campo su Jira manualmente.',
    'Azzera storico');
  if (!ok) return;

  if (!_cpData[k]) _cpData[k] = {};
  _cpData[k].km_jira_last = null;
  _cpData[k].km_jira_uploaded = false;

  if (_sbClient && _sbUser) {
    try {
      const { error } = await _sbClient
        .from('controllo_produzione')
        .update({ km_jira_last: null, km_jira_uploaded: false, updated_at: new Date().toISOString(), updated_by: _sbUser?.email || null })
        .eq('anno', pwAnno).eq('week', pwWeek)
        .eq('commessa', commessa).eq('squadra', squadra)
        .eq('operatore', operatore).eq('giorno', giorno);
      if (error) throw error;
    } catch (e) {
      console.error('cpJiraFlagClick update error:', e);
      showAlertModal('Errore nell\'azzerare lo storico: ' + (e.message || e));
      return;
    }
  }

  pwControlloRender();
  pwApplyProduzioneColors();
}

// Salva il KM/Cad di un singolo ticket dentro la mappa per-ticket della cella.
async function cpSaveKmTicket(commessa, squadra, operatore, giorno, dataGiorno, cantiere, attivita, ticketKey, value) {
  const k = `${commessa}|||${squadra}|||${operatore}|||${giorno}`;
  if (!_cpData[k]) _cpData[k] = {};
  if (!_cpData[k].km_by_ticket || typeof _cpData[k].km_by_ticket !== 'object') _cpData[k].km_by_ticket = {};

  const v = (value === '' || value == null) ? null : parseFloat(value);
  if (v == null || isNaN(v)) delete _cpData[k].km_by_ticket[ticketKey];
  else _cpData[k].km_by_ticket[ticketKey] = Math.round(v * 1000) / 1000;

  // Aggiorna lo specchio km_cad (somma) per colorazione griglia/export
  _cpData[k].km_cad = cpSumKm(_cpData[k].km_by_ticket);
  pwApplyProduzioneColors();

  if (!_sbClient || !_sbUser) return;
  try {
    const record = cpBuildRecord(commessa, squadra, operatore, giorno, cpDataISO(dataGiorno), cantiere, attivita);
    const { error } = await _sbClient
      .from('controllo_produzione')
      .upsert(record, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
    if (error) throw error;
  } catch (e) {
    console.error('cpSaveKmTicket error:', e);
    const st = document.getElementById('cp-status');
    if (st) { st.textContent = '⚠ Errore salvataggio'; setTimeout(() => { st.textContent = ''; }, 3000); }
  }
}

// Click sull'indicatore "Su Jira" di un singolo ticket: non attivabile a mano,
// azzerabile solo con conferma (rimuove lo storico di scrittura per quel ticket).
async function cpJiraFlagTicketClick(ev, commessa, squadra, operatore, giorno, ticketKey) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const k = `${commessa}|||${squadra}|||${operatore}|||${giorno}`;
  const cell = _cpData[k] || {};
  const lastMap = (cell.km_last_by_ticket && typeof cell.km_last_by_ticket === 'object') ? cell.km_last_by_ticket : {};
  const cur = lastMap[ticketKey] != null;

  if (!cur) {
    showAlertModal('Questo indicatore si spunta automaticamente dopo la scrittura del KM/CAD su Jira per questo ticket. Non può essere attivato manualmente.');
    return;
  }

  const ok = await showConfirmAsync(
    `Vuoi azzerare lo storico di scrittura su Jira per il ticket ${ticketKey}?\n\n` +
    'Alla prossima sincronizzazione l\'INTERO valore KM/CAD di quel ticket verrà nuovamente SOMMATO all\'Actual Production ' +
    '(non solo la differenza). Usa questa opzione solo se hai azzerato il campo su Jira manualmente.',
    'Azzera storico');
  if (!ok) return;

  if (!_cpData[k]) _cpData[k] = {};
  if (!_cpData[k].km_last_by_ticket || typeof _cpData[k].km_last_by_ticket !== 'object') _cpData[k].km_last_by_ticket = {};
  delete _cpData[k].km_last_by_ticket[ticketKey];
  const newLastMap = _cpData[k].km_last_by_ticket;
  const lastSum = cpSumKm(newLastMap);

  if (_sbClient && _sbUser) {
    try {
      const { error } = await _sbClient
        .from('controllo_produzione')
        .update({
          km_last_by_ticket: newLastMap,
          km_jira_last: lastSum,
          km_jira_uploaded: lastSum != null,
          updated_at: new Date().toISOString(),
          updated_by: _sbUser?.email || null,
        })
        .eq('anno', pwAnno).eq('week', pwWeek)
        .eq('commessa', commessa).eq('squadra', squadra)
        .eq('operatore', operatore).eq('giorno', giorno);
      if (error) throw error;
    } catch (e) {
      console.error('cpJiraFlagTicketClick error:', e);
      showAlertModal('Errore nell\'azzerare lo storico: ' + (e.message || e));
      return;
    }
  }

  pwControlloRender();
  pwApplyProduzioneColors();
}

// Rilegge manualmente l'Actual Production di UN ticket da Jira, anche se è già
// stato adottato in precedenza (bypassa lo skip "già valorizzato localmente" della
// sync automatica). Serve per il caso in cui il valore sia stato modificato a mano
// su Jira dopo che questa app l'aveva già letto/scritto: la sync normale non lo
// rileggerebbe mai più, perché applica solo il DELTA rispetto al valore adottato.
async function cpRereadTicket(ev, commessa, squadra, operatore, giorno, dataGiorno, cantiere, attivita, ticketKey) {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (!_sbClient || !_sbUser) { showAlertModal('Rilettura non disponibile in modalità offline.'); return; }

  const ok = await showConfirmAsync(
    `Rileggere ora da Jira l'Actual Production del ticket ${ticketKey}?\n\n` +
    'Il valore locale "Km/Cad" di questo ticket verrà sostituito con quello letto da Jira in questo momento. ' +
    'Usa questa opzione se hai modificato il valore direttamente su Jira dopo che l\'app lo aveva già adottato (spunta "Su Jira" attiva).',
    'Rileggi da Jira');
  if (!ok) return;

  const k = `${commessa}|||${squadra}|||${operatore}|||${giorno}`;
  const status = document.getElementById('cp-status');
  if (status) status.textContent = '⏳ Rilettura Actual Production…';

  try {
    const { data: rData, error: rErr } = await _sbClient.functions.invoke('jira-update-production', {
      body: { reads: [ticketKey] },
    });
    if (rErr) throw new Error(await _cpEdgeErr(rErr, 'jira-update-production'));
    if (rData && rData.error) throw new Error(rData.error);

    const v = (rData && rData.values) ? rData.values[ticketKey] : null;
    if (v == null || !isFinite(Number(v)) || Number(v) <= 0) {
      if (status) status.textContent = '';
      showAlertModal(`Nessun valore leggibile per ${ticketKey} (campo Actual Production vuoto o non valido su Jira).`);
      return;
    }
    const val = Math.round(Number(v) * 1000) / 1000;

    if (!_cpData[k]) _cpData[k] = {};
    if (!_cpData[k].km_by_ticket || typeof _cpData[k].km_by_ticket !== 'object') _cpData[k].km_by_ticket = {};
    if (!_cpData[k].km_last_by_ticket || typeof _cpData[k].km_last_by_ticket !== 'object') _cpData[k].km_last_by_ticket = {};
    _cpData[k].km_by_ticket[ticketKey] = val;
    _cpData[k].km_last_by_ticket[ticketKey] = val; // adottato di nuovo: delta futuro = 0
    _cpData[k].km_cad = cpSumKm(_cpData[k].km_by_ticket);

    const record = cpBuildRecord(commessa, squadra, operatore, giorno, cpDataISO(dataGiorno), cantiere, attivita);
    const { error: upErr } = await _sbClient
      .from('controllo_produzione')
      .upsert(record, { onConflict: 'anno,week,commessa,squadra,operatore,giorno' });
    if (upErr) throw upErr;

    if (status) status.textContent = '';
    pwControlloRender();
    pwApplyProduzioneColors();
  } catch (e) {
    console.error('cpRereadTicket error:', e);
    if (status) status.textContent = '⚠ Errore rilettura';
    showAlertModal('Errore durante la rilettura da Jira: ' + (e.message || e));
  }
}

