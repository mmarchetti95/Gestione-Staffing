/* ===== WORKLOG FORNITORI (cpFornWl*, v18.251.0) =====
   I dipendenti dei fornitori con email (dashboard-fornitori.js) hanno i sottotask giornalieri
   ma non usano Jira. La Edge Function jira-fornitori-worklog porta ogni loro sottotask nello
   stato del sottotask del collega interno della stessa squadra (stesso giorno, commessa e
   cantiere) e ne copia i worklog, intestati all'assegnatario. Gira da sola (cron ogni 15
   minuti, lun–sab) e prima di ogni «🔄 Sincronizza da Jira» sulla settimana sincronizzata.
   Questo modal («🏢 Worklog fornitori» in Controllo Produzione) mostra l'ultimo giro, permette
   di scegliere a mano il collega da cui copiare (fornitori_worklog_sorgente) e di lanciare un
   giro sulla settimana mostrata (anteprima senza scritture, o allinea). I worklog dei
   sottotask fornitore sono gestiti dalla funzione: quelli che non sono copie si eliminano. */

const CPFW_FN = 'jira-fornitori-worklog';
const _cpFornWl = { aperto: false, esito: null, ts: '', da: '', anteprima: false, inCorso: false, msg: '', errore: '', scelte: {} };

// La settimana ha in Griglia dipendenti fornitore con email?
function cpFornWlSettimanaHa(anno, week) {
  const data = (pwData[anno] || {})[week];
  if (!Array.isArray(data)) return false;
  return data.some(bc => ((bc && bc.squadre) || []).some(sq => (sq.operatori || []).some(op =>
    op && op.nome && fornitoreDiNome(op.nome) && opEmailDi(op.nome))));
}

async function cpFornWlEsegui(anno, week, dryRun) {
  const { data, error } = await _sbClient.functions.invoke(CPFW_FN, { body: { anno, week, dryRun: !!dryRun, origine: 'app' } });
  if (error) throw new Error(await _cpEdgeErr(error, CPFW_FN));
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

/* Prima di «Sincronizza da Jira»: allinea i sottotask fornitore della settimana, così le Ore
   Jira lette subito dopo comprendono le copie. Ritorna un avviso per il riepilogo ('' se tutto ok). */
async function cpFornWlPrimaDellaSync(anno, week, status) {
  if (!cpFornWlSettimanaHa(anno, week)) return '';
  if (status) status.textContent = '⏳ Copio i worklog dei fornitori dal collega Eagle…';
  try {
    const r = await cpFornWlEsegui(anno, week, false);
    if (r.occupato) return 'Worklog fornitori: un giro di copia era già in corso, le copie arriveranno a breve.';
    _cpFornWl.esito = r;
    _cpFornWl.anteprima = false;
    _cpFornWl.ts = new Date().toISOString();
    _cpFornWl.da = (_sbUser && _sbUser.email) || '';
    const err = (r.coppie || []).filter(c => c.errore).length;
    return err ? 'Worklog fornitori: ' + err + (err === 1 ? ' sottotask con errore' : ' sottotask con errori') + ' (vedi «🏢 Worklog fornitori»).' : '';
  } catch (e) {
    return 'Copia dei worklog fornitori non riuscita: ' + (e.message || e);
  }
}

async function cpFornWlApri() {
  _cpFornWl.aperto = true;
  _cpFornWl.errore = '';
  document.getElementById('cpfw-modal').style.display = 'flex';
  _cpFornWlRender();
  try {
    const [st, sc] = await Promise.all([
      _sbClient.from('fornitori_worklog_stato').select('ultimo_avvio,ultimo_da,ultimo_esito').eq('id', 1).maybeSingle(),
      _sbClient.from('fornitori_worklog_sorgente').select('target_key,sorgente'),
    ]);
    if (st.error) throw st.error;
    _cpFornWl.scelte = {};
    ((sc && sc.data) || []).forEach(r => { _cpFornWl.scelte[r.target_key] = r.sorgente; });
    const s = st.data;
    // L'ultimo giro salvato (cron o un collega) sostituisce quello in memoria solo se più recente
    if (s && s.ultimo_esito && (!_cpFornWl.ts || _cpFornWl.anteprima || new Date(s.ultimo_avvio) > new Date(_cpFornWl.ts))) {
      _cpFornWl.esito = s.ultimo_esito;
      _cpFornWl.ts = s.ultimo_avvio;
      _cpFornWl.da = s.ultimo_da || '';
      _cpFornWl.anteprima = false;
    }
  } catch (e) {
    _cpFornWl.errore = 'Lettura dell\'ultimo giro non riuscita: ' + (e.message || e);
  }
  if (_cpFornWl.aperto) _cpFornWlRender();
}

function cpFornWlChiudi() {
  _cpFornWl.aperto = false;
  document.getElementById('cpfw-modal').style.display = 'none';
}

async function cpFornWlAvvia(dryRun) {
  if (!dryRun && !sbGuardWrite()) return;
  if (_cpFornWl.inCorso) return;
  if (!dryRun && !await showConfirmAsync('Allineo su Jira i sottotask dei fornitori della settimana ' + pwWeek + '/' + pwAnno
      + ' (fino a oggi): stato come il sottotask del collega Eagle, worklog copiati uguali ai suoi. Sui sottotask dei fornitori '
      + 'i worklog che non sono copie vengono eliminati. Procedere?', 'Allinea')) return;
  _cpFornWl.inCorso = true;
  _cpFornWl.errore = '';
  _cpFornWl.msg = dryRun ? '⏳ Calcolo l\'anteprima (nessuna scrittura su Jira)…' : '⏳ Allineo i sottotask dei fornitori…';
  _cpFornWlRender();
  try {
    const r = await cpFornWlEsegui(pwAnno, pwWeek, dryRun);
    if (r.occupato) {
      _cpFornWl.errore = 'Un altro giro di copia è in corso (cron o un collega): riprova tra un minuto.';
    } else {
      _cpFornWl.esito = r;
      _cpFornWl.anteprima = !!dryRun;
      _cpFornWl.ts = new Date().toISOString();
      _cpFornWl.da = (_sbUser && _sbUser.email) || '';
      if (!dryRun) sbLogActivity('Worklog fornitori: allineamento manuale', { anno: pwAnno, week: pwWeek });
    }
  } catch (e) {
    _cpFornWl.errore = e.message || String(e);
  }
  _cpFornWl.inCorso = false;
  _cpFornWl.msg = '';
  if (_cpFornWl.aperto) _cpFornWlRender();
}

// Scelta a mano del collega da cui copiare ('' = automatica). Vale dal prossimo giro.
async function cpFornWlScegli(sel) {
  if (!sbGuardWrite()) { _cpFornWlRender(); return; }
  const key = sel.dataset.key, nome = sel.value;
  const q = nome
    ? _sbClient.from('fornitori_worklog_sorgente').upsert({ target_key: key, sorgente: nome, updated_at: new Date().toISOString(), updated_by: (_sbUser && _sbUser.email) || '' })
    : _sbClient.from('fornitori_worklog_sorgente').delete().eq('target_key', key);
  const { error } = await q;
  if (error) { showAlertModal('Scelta non salvata: ' + error.message); _cpFornWlRender(); return; }
  if (nome) _cpFornWl.scelte[key] = nome; else delete _cpFornWl.scelte[key];
  _cpFornWlRender();
}

function _cpFornWlStatoHtml(c) {
  const s = c.stato;
  if (!s) return '<span style="color:#94a3b8;">—</span>';
  if (s.errore) return '<span style="color:#b91c1c;">' + esc(s.prima) + ' ⚠ ' + esc(s.errore) + '</span>';
  if (!s.passi || !s.passi.length) return '<span style="color:#475569;">' + esc(s.dopo || s.prima || '') + '</span>';
  return '<span style="color:#4338ca;">' + esc(s.passi.join(' · ')) + '</span>';
}

function _cpFornWlWorklogHtml(c) {
  const p = [];
  if (c.creati) p.push('<span style="color:#047857;">+' + c.creati + ' copiat' + (c.creati === 1 ? 'o' : 'i') + '</span>');
  if (c.aggiornati) p.push('<span style="color:#4338ca;">~' + c.aggiornati + ' aggiornat' + (c.aggiornati === 1 ? 'o' : 'i') + '</span>');
  if (c.eliminati) p.push('<span style="color:#b45309;">−' + c.eliminati + ' eliminat' + (c.eliminati === 1 ? 'o' : 'i') + '</span>');
  return p.join(' ') || (c.sourceKey && !c.errore ? '<span style="color:#475569;">allineati</span>' : '');
}

function _cpFornWlLink(key) {
  const url = cpStatoUrlFor(key);
  return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:#4338ca;">' + esc(key) + '</a>' : esc(key);
}

function _cpFornWlRender() {
  const root = document.getElementById('cpfw-root');
  if (!root || !_cpFornWl.aperto) return;
  const r = _cpFornWl.esito;
  const coppie = (r && r.coppie) || [];
  const quando = _cpFornWl.ts ? new Date(_cpFornWl.ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const testata = r
    ? (_cpFornWl.anteprima ? '👁 Anteprima (nulla è stato scritto su Jira)' : 'Ultimo giro')
      + (quando ? ' · ' + esc(quando) : '') + (_cpFornWl.da ? ' · ' + esc(_cpFornWl.da === 'cron' ? 'automatico' : _cpFornWl.da) : '')
      + (r.dal ? ' · giorni ' + esc(r.dal) + ' → ' + esc(r.al) : '')
    : 'Nessun giro ancora registrato.';
  const righe = coppie.map(c => {
    const scelta = _cpFornWl.scelte[c.targetKey] || '';
    const opz = ['<option value="">auto' + (c.scelta === 'auto' && c.sorgente ? ' (' + esc(c.sorgente) + ')' : '') + '</option>']
      .concat((c.candidati || []).map(n => '<option value="' + esc(n) + '"' + (n === scelta ? ' selected' : '') + '>' + esc(n) + '</option>'));
    const sorg = (c.candidati || []).length
      ? '<select data-key="' + esc(c.targetKey) + '" onchange="cpFornWlScegli(this)" data-help-key="cpfw-sorgente" style="font-size:12px;border:1px solid #cbd5e1;border-radius:6px;padding:2px 4px;max-width:190px;">' + opz.join('') + '</select>'
        + (c.sourceKey ? '<div style="font-size:11px;color:#64748b;">da ' + _cpFornWlLink(c.sourceKey) + '</div>' : '')
      : '<span style="color:#b45309;">' + esc(c.nota || 'nessun collega') + '</span>';
    const nota = c.errore ? '<span style="color:#b91c1c;">⚠ ' + esc(c.errore) + '</span>' : (c.candidati && c.candidati.length && c.nota ? esc(c.nota) : '');
    return '<tr style="border-top:1px solid #e2e8f0;vertical-align:top;">'
      + '<td style="padding:6px 8px;white-space:nowrap;">' + esc(pwJsubGiornoLabel(c.anno, c.week, c.giorno)) + '</td>'
      + '<td style="padding:6px 8px;"><div style="font-weight:600;">' + esc(c.operatore) + '</div><div style="font-size:11px;color:#64748b;">🏢 ' + esc(c.fornitore) + '</div></td>'
      + '<td style="padding:6px 8px;">' + esc(c.cantiere) + (c.attivita ? '<div style="font-size:11px;color:#64748b;">' + esc(c.attivita) + '</div>' : '') + '</td>'
      + '<td style="padding:6px 8px;">' + _cpFornWlLink(c.targetKey) + '</td>'
      + '<td style="padding:6px 8px;">' + sorg + '</td>'
      + '<td style="padding:6px 8px;">' + _cpFornWlStatoHtml(c) + '</td>'
      + '<td style="padding:6px 8px;">' + _cpFornWlWorklogHtml(c) + (nota ? '<div style="font-size:11px;">' + nota + '</div>' : '') + '</td>'
      + '</tr>';
  }).join('');
  const avvisi = ((r && r.avvisi) || []).map(a => '<div>⚠ ' + esc(a) + '</div>').join('');
  const btn = 'padding:6px 12px;font-size:13px;border-radius:8px;cursor:pointer;';
  root.innerHTML =
    '<div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
    + '<div style="font-weight:700;font-size:16px;color:#0f172a;font-family:var(--font-display);">🏢 Worklog fornitori</div>'
    + '<div style="font-size:12px;color:#64748b;flex:1;min-width:200px;">' + testata + '</div>'
    + '<button id="cpfw-anteprima" onclick="cpFornWlAvvia(true)" style="' + btn + 'border:1px solid #cbd5e1;background:#fff;"' + (_cpFornWl.inCorso ? ' disabled' : '') + '>👁 Anteprima week ' + pwWeek + '</button>'
    + '<button id="cpfw-allinea" onclick="cpFornWlAvvia(false)" class="pw-write-action" style="' + btn + 'border:none;background:#4338ca;color:#fff;"' + (_cpFornWl.inCorso ? ' disabled' : '') + '>▶ Allinea week ' + pwWeek + '</button>'
    + '<button onclick="cpFornWlChiudi()" style="' + btn + 'border:1px solid #cbd5e1;background:#fff;">✕</button>'
    + '</div>'
    + '<div style="padding:10px 18px;font-size:12px;color:#475569;background:#eef2ff;">Ogni sottotask di un dipendente fornitore segue il collega interno della stessa squadra, stesso cantiere e giorno: '
    + 'stesso stato (passando da IN PROGRESS) e stessi worklog, intestati al dipendente. Gira da solo ogni 15 minuti (lun–sab) e prima di «🔄 Sincronizza da Jira».</div>'
    + (_cpFornWl.msg ? '<div style="padding:8px 18px;font-size:13px;color:#4338ca;">' + esc(_cpFornWl.msg) + '</div>' : '')
    + (_cpFornWl.errore ? '<div style="padding:8px 18px;font-size:13px;color:#b91c1c;">⚠ ' + esc(_cpFornWl.errore) + '</div>' : '')
    + (avvisi ? '<div style="padding:8px 18px;font-size:12px;color:#b45309;">' + avvisi + '</div>' : '')
    + '<div style="overflow:auto;flex:1;padding:0 10px 12px;">'
    + (coppie.length
      ? '<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;">'
        + '<th style="padding:8px;">Giorno</th><th style="padding:8px;">Dipendente</th><th style="padding:8px;">Cantiere</th><th style="padding:8px;">Sottotask</th>'
        + '<th style="padding:8px;">Copia da</th><th style="padding:8px;">Stato</th><th style="padding:8px;">Worklog</th></tr></thead><tbody>' + righe + '</tbody></table>'
      : '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">' + (r ? 'Nessun sottotask di dipendenti fornitore nel periodo.' : '') + '</div>')
    + '</div>';
}
