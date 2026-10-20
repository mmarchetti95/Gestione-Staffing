/* ===== CONTROLLO PRODUZIONE: ORARI JIRA (infografica sulla colonna "Ore Jira") ===== */
// Passando il mouse su una cella "Ore Jira" si apre un'infografica con gli interventi del
// giorno: barra oraria (un colore per ticket) + elenco con inizio, fine, durata, ticket e
// commento del worklog, le pause fra un intervento e l'altro e le sovrapposizioni. I dati sono
// i worklog in jira_tickets[].worklogs, che jira-sync-worklogs restituisce dalla v18.210.0: le
// righe sincronizzate prima hanno solo le ore per ticket finché non si risincronizza.
// Orari sempre in ora italiana (Europe/Rome), qualunque sia il fuso registrato nel worklog.

const CP_OJ_COLORI = ['#0d9488', '#6366f1', '#f59e0b', '#ec4899', '#0ea5e9', '#84cc16', '#8b5cf6', '#ef4444'];
const CP_OJ_PAUSA_MIN = 15;   // pause più brevi non vengono elencate
const CP_OJ_CORSIA_PX = 20;

let _cpOjPop = null, _cpOjFmt = null;

/* "2026-05-25T08:30:00.000+0200" → { data: '2026-05-25', min: 510 } in ora di Roma */
function _cpOjParti(started) {
  const d = new Date(String(started || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (isNaN(d.getTime())) return null;
  if (!_cpOjFmt) _cpOjFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = {};
  _cpOjFmt.formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return { data: p.year + '-' + p.month + '-' + p.day, min: Number(p.hour) * 60 + Number(p.minute) };
}

/* Minuti dalla mezzanotte del giorno della riga → "08:30" (con "+1g" se sconfina nel giorno dopo) */
function _cpOjOra(min) {
  min = Math.round(min);
  const g = Math.floor(min / 1440), r = min - g * 1440;
  return String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0') +
    (g > 0 ? ' +' + g + 'g' : g < 0 ? ' ' + g + 'g' : '');
}

function _cpOjDurata(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + 'h' + (m ? ' ' + String(m).padStart(2, '0') + 'm' : '') : m + 'm';
}

/* Worklog dei ticket della riga, ordinati per inizio. dateISO = giorno della riga, per riportare
   ogni worklog sui minuti di quel giorno. senzaOrari = ticket salvati prima della v18.210.0. */
function cpOreJiraInterventi(tickets, dateISO) {
  const interventi = [], senzaOrari = [];
  const base = Date.parse(dateISO + 'T00:00:00Z');
  (tickets || []).forEach((t, i) => {
    const colore = CP_OJ_COLORI[i % CP_OJ_COLORI.length];
    if (!Array.isArray(t.worklogs)) { senzaOrari.push({ t, colore }); return; }
    t.worklogs.forEach(w => {
      const p = _cpOjParti(w.started);
      if (!p) return;
      const off = Math.round((Date.parse(p.data + 'T00:00:00Z') - base) / 60000);
      const inizio = p.min + (isNaN(off) ? 0 : off);
      interventi.push({ t, colore, inizio, fine: inizio + (Number(w.seconds) || 0) / 60, commento: w.comment || '' });
    });
  });
  interventi.sort((a, b) => a.inizio - b.inizio || a.fine - b.fine);
  return { interventi, senzaOrari };
}

/* Barra oraria: almeno 07–18, allargata agli interventi; quelli sovrapposti vanno su corsie diverse. */
function _cpOjTimeline(iv) {
  const da = Math.min(7, Math.floor(Math.min(...iv.map(x => x.inizio)) / 60));
  const a = Math.max(18, Math.ceil(Math.max(...iv.map(x => x.fine)) / 60));
  const span = (a - da) * 60;
  const pct = m => ((m - da * 60) / span * 100).toFixed(2) + '%';
  const fineCorsia = [];
  const corsie = iv.map(x => {
    let c = fineCorsia.findIndex(f => f <= x.inizio);
    if (c < 0) { c = fineCorsia.length; fineCorsia.push(0); }
    fineCorsia[c] = x.fine;
    return c;
  });
  const passo = (a - da) > 12 ? 3 : 2;
  let grid = '', axis = '';
  for (let h = da; h <= a; h += passo) {
    if (h > da && h < a) grid += '<div class="cp-oj-grid" style="left:' + pct(h * 60) + '"></div>';
    axis += '<span style="left:' + pct(h * 60) + '">' + String(((h % 24) + 24) % 24).padStart(2, '0') + '</span>';
  }
  const bars = iv.map((x, i) =>
    '<div class="cp-oj-bar" style="left:' + pct(x.inizio) + ';width:' + ((x.fine - x.inizio) / span * 100).toFixed(2) + '%;top:' +
    (2 + corsie[i] * CP_OJ_CORSIA_PX) + 'px;background:' + x.colore + '"></div>').join('');
  return '<div class="cp-oj-track" style="height:' + (fineCorsia.length * CP_OJ_CORSIA_PX + 4) + 'px">' + grid + bars + '</div>' +
    '<div class="cp-oj-axis">' + axis + '</div>';
}

function _cpOjRiga(colore, orario, durata, t, commento, sovrapposto) {
  return '<div class="cp-oj-row"><span class="cp-oj-dot" style="background:' + colore + '"></span>' +
    '<span class="cp-oj-ora">' + orario + (sovrapposto ? ' ⚠' : '') + '</span><span class="cp-oj-dur">' + durata + '</span>' +
    '<span class="cp-oj-tk"><b>' + esc(t.key || '') + '</b>' +
    (t.summary ? '<small>' + esc(t.summary) + '</small>' : (t.epic && t.epic.name ? '<small>🟣 ' + esc(t.epic.name) + '</small>' : '')) +
    (commento ? '<i>“' + esc(commento) + '”</i>' : '') + '</span></div>';
}

function _cpOjElenco(iv) {
  let html = '', finoA = null, sovrapposti = 0;
  iv.forEach(x => {
    const sovr = finoA != null && x.inizio < finoA;
    if (sovr) sovrapposti++;
    if (finoA != null && x.inizio - finoA >= CP_OJ_PAUSA_MIN) {
      html += '<div class="cp-oj-pausa">pausa ' + _cpOjOra(finoA) + '–' + _cpOjOra(x.inizio) + ' (' + _cpOjDurata(x.inizio - finoA) + ')</div>';
    }
    html += _cpOjRiga(x.colore, _cpOjOra(x.inizio) + '–' + _cpOjOra(x.fine), _cpOjDurata(x.fine - x.inizio), x.t, x.commento, sovr);
    finoA = finoA == null ? x.fine : Math.max(finoA, x.fine);
  });
  if (sovrapposti) {
    html += '<div class="cp-oj-warn">⚠ ' + sovrapposti + (sovrapposti === 1 ? ' intervento si sovrappone' : ' interventi si sovrappongono') +
      ' a un altro: controlla gli orari su Jira.</div>';
  }
  return html;
}

function cpOreJiraPopupHtml(td) {
  const tr = td.closest('tr');
  const cell = (tr && _cpData[tr.dataset.cpk]) || {};
  const tickets = Array.isArray(cell.jira_tickets) ? cell.jira_tickets : [];
  const ore = parseFloat(String(cell.ore_jira));
  let html = '<div class="cp-oj-h"><b>🕘 ' + esc(tr ? tr.dataset.operatore : '') + ' · ' + esc(td.dataset.giorno || '') + '</b>' +
    (isNaN(ore) ? '' : '<span class="cp-oj-tot">Totale ' + _cpOjDurata(ore * 60) + '</span>') + '</div>';
  if (isNaN(ore)) return html + '<div class="cp-oj-vuoto">Non ancora sincronizzato con Jira (🔄 Sincronizza squadra).</div>';
  if (!tickets.length) return html + '<div class="cp-oj-vuoto">Nessun worklog Jira in questo giorno.</div>';
  const { interventi, senzaOrari } = cpOreJiraInterventi(tickets, td.dataset.date);
  if (interventi.length) html += _cpOjTimeline(interventi) + _cpOjElenco(interventi);
  if (senzaOrari.length) {
    html += '<div class="cp-oj-vuoto" style="margin-bottom:4px">Orari non disponibili: la riga è stata sincronizzata prima che venissero letti. Risincronizza (🔄 Sincronizza squadra) per vederli.</div>' +
      senzaOrari.map(x => _cpOjRiga(x.colore, '—', x.t.hours != null ? _cpOjDurata(x.t.hours * 60) : '', x.t, '', false)).join('');
  }
  return html;
}

/* Popup al passaggio del mouse: a destra della cella, a sinistra se non c'è spazio. Non riceve
   il mouse (pointer-events:none), così non intralcia la tabella. */
function cpOreJiraShow(td) {
  if (!_cpOjPop) {
    _cpOjPop = document.createElement('div');
    _cpOjPop.className = 'cp-oj-pop no-print';
    document.body.appendChild(_cpOjPop);
  }
  _cpOjPop.innerHTML = cpOreJiraPopupHtml(td);
  _cpOjPop.style.display = 'block';
  const r = td.getBoundingClientRect(), w = _cpOjPop.offsetWidth, h = _cpOjPop.offsetHeight;
  let left = r.right + 8;
  if (left + w > window.innerWidth - 8) left = r.left - w - 8;
  if (left < 8) left = Math.max(8, window.innerWidth - w - 8);
  const top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 8));
  _cpOjPop.style.left = left + 'px';
  _cpOjPop.style.top = top + 'px';
}

function cpOreJiraHide() {
  if (_cpOjPop) _cpOjPop.style.display = 'none';
}

window.addEventListener('scroll', cpOreJiraHide, true);
