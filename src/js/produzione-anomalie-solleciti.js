/* ==================== CONTROLLO ANOMALIE · SOLLECITI WORKLOG ====================
   Bozze di messaggio per chi non ha caricato, o ha caricato solo in parte, le ore su
   Jira (anomalie con `sollecito`: pianificato_senza_worklog / worklog_parziale).
   Il testo base è deterministico (cpaSollecitoBase, nel motore puro); "✨ Scrivi con
   l'assistente AI" lo fa riscrivere dall'azione 'solleciti' di ai-autoplan (una
   chiamata senza strumenti: il modello scrive testo e basta, non legge né modifica
   dati). Niente parte da solo: "✉️ Apri mail" apre il programma di posta con
   destinatario, oggetto e testo da rivedere e inviare a mano. */

/* "Sollecito inviato" è CONDIVISO: sta in pwData.sollecitiInviati[anno][week][operatore]
   = { ts, da, giorni: [0..5] } (dominio planning, sincronizzato e Realtime come
   pwData.noteGenerali), così un collega vede chi è già stato sollecitato. `giorni` dice
   quali giornate copriva: se poi ne spunta una nuova, l'operatore torna "da sollecitare".
   I lettori che scorrono pwData per anno scartano già le chiavi non numeriche. */
function _cpaSollInviati(anno, week) {
  return (pwData.sollecitiInviati && pwData.sollecitiInviati[anno] && pwData.sollecitiInviati[anno][week]) || {};
}

/* null = mai sollecitato; altrimenti { rec, completo, nuovi: [giorni non coperti] } */
function _cpaSollStato(g) {
  const rec = _cpaSollInviati(_cpa.anno, _cpa.week)[g.operatore];
  if (!rec) return null;
  const coperti = new Set(rec.giorni || []);
  const nuovi = g.voci.map(v => v.giorno).filter(d => !coperti.has(d));
  return { rec, completo: !nuovi.length, nuovi };
}

async function cpaSollSegnaInviato(el) {
  const nome = el.dataset.sollOp;
  if (!sbGuardWrite()) { el.checked = !el.checked; return; }
  const g = _cpaSollGruppi().find(x => x.operatore === nome);
  if (!g) return;
  if (!pwData.sollecitiInviati) pwData.sollecitiInviati = {};
  const A = pwData.sollecitiInviati[_cpa.anno] = pwData.sollecitiInviati[_cpa.anno] || {};
  const W = A[_cpa.week] = A[_cpa.week] || {};
  const prev = W[nome];
  // cronologia: un elemento per invio (i record vecchi, senza `invii`, valgono come un invio)
  const invii = prev ? (Array.isArray(prev.invii) ? prev.invii.slice() : [{ ts: prev.ts, da: prev.da, giorni: prev.giorni || [] }]) : [];
  if (el.checked) {
    const b = (_cpa.soll && _cpa.soll.bozze[nome]) || {};
    invii.push({
      ts: new Date().toISOString(), da: (_sbUser && _sbUser.email) || '',
      giorni: g.voci.map(v => v.giorno),
      canale: b.apertaTeams && !b.aperta ? 'teams' : (b.aperta && !b.apertaTeams ? 'mail' : (b.aperta ? 'mail+teams' : '')),
      oggetto: String(b.oggetto || '').slice(0, 200), testo: String(b.testo || '').slice(0, 1500),
    });
  } else {
    invii.pop();   // togli la spunta = annulla l'ultimo invio registrato
  }
  if (invii.length) {
    const ultimo = invii[invii.length - 1];
    W[nome] = { ts: ultimo.ts, da: ultimo.da, giorni: [...new Set(invii.flatMap(x => x.giorni || []))].sort(), invii };
  } else {
    delete W[nome];
  }
  await pwSave();
  sbLogActivity('Controllo anomalie: sollecito ' + (el.checked ? 'segnato inviato' : 'tolto da inviati'), { anno: _cpa.anno, week: _cpa.week, operatore: nome });
  cpaRender();
}


/* Gruppi ancora da sollecitare (mai inviati, o con giornate nuove dopo l'invio) */
function _cpaSollDaInviare() {
  return _cpaSollGruppi().filter(g => { const s = _cpaSollStato(g); return !s || !s.completo; });
}

const CPA_SOLL_PREF_KEY = 'cpa_solleciti_pref_v1';   // tono/firma, per browser
const CPA_SOLL_AI_BLOCCO = 10;                        // operatori per chiamata AI (tetto server: 12)
const CPA_MAILTO_MAX = 1800;                          // oltre, il corpo va negli appunti

function _cpaSollPref() {
  try { return Object.assign({ tono: 'cordiale', firma: '' }, JSON.parse(localStorage.getItem(CPA_SOLL_PREF_KEY) || '{}')); }
  catch (_) { return { tono: 'cordiale', firma: '' }; }
}

function _cpaEmailByNome() {
  const m = {};
  (state.operatori || []).forEach(o => {
    const n = o.nome_esteso || o.nome_breve || o.nome;
    if (n && o.email && o.email.trim()) m[n] = o.email.trim();
  });
  return m;
}

function _cpaSollGruppi() {
  const r = _cpa.risultato;
  if (!r) return [];
  const ign = _cpaIgnorate();
  return cpaRaggruppaSolleciti(r.anomalie.filter(a => !ign[a.id] && !_cpa.risolte.has(a.id)));
}

function _cpaSollOpzioni() {
  const S = _cpa.soll;
  return { anno: _cpa.anno, week: _cpa.week, firma: S.firma, entro: S.entro };
}

function _cpaSollBase(g) {
  return Object.assign({ fonte: 'base' }, cpaSollecitoBase(g, _cpa.risultato.giorniLabel, _cpaSollOpzioni()));
}

function cpaSollApri() {
  const p = _cpaSollPref();
  _cpa.soll = { tono: p.tono, firma: p.firma, entro: '', bozze: {}, msg: '', aiInCorso: false, ai: null };
  cpaRender();
  _cpaSollStatoAi();
}

function cpaSollChiudi() { _cpa.soll = null; cpaRender(); }

async function cpaSollTestoBase() {
  const S = _cpa.soll;
  if (!S) return;
  if (Object.values(S.bozze).some(b => b.fonte !== 'base')) {
    const ok = await showConfirmAsync('Rigenerare il testo base per tutti? Le modifiche fatte a mano e i testi dell\'assistente andranno persi.', 'Rigenera');
    if (!ok) return;
  }
  S.bozze = {};
  S.msg = '';
  cpaRender();
}

async function _cpaSollStatoAi() {
  const S = _cpa.soll;
  if (!S || !_sbClient || !_sbUser) return;
  try {
    const { data, error } = await _sbClient.functions.invoke('ai-autoplan', { body: { action: 'status' } });
    if (error) throw new Error(await _cpEdgeErr(error, 'ai-autoplan'));
    S.ai = (data && data.enabled && data.has_key) ? { ok: true, provider: data.provider, model: data.model }
      : { ok: false, motivo: (!data || !data.enabled) ? 'Assistente AI disattivato dall\'amministratore.' : 'Nessuna API key per il provider configurato.' };
  } catch (e) {
    S.ai = { ok: false, motivo: 'Assistente AI non raggiungibile (' + (e.message || e) + ').' };
  }
  if (_cpa.soll === S) cpaRender();
}

function cpaSollOpzione(el) {
  const S = _cpa.soll;
  if (!S) return;
  const f = el.dataset.f;
  S[f] = el.value;
  if (f === 'tono' || f === 'firma') {
    try { localStorage.setItem(CPA_SOLL_PREF_KEY, JSON.stringify({ tono: S.tono, firma: S.firma })); } catch (_) {}
  }
  /* Firma e scadenza entrano nel testo base: si aggiornano le bozze non ancora toccate,
     senza ridisegnare (il ridisegno farebbe perdere il fuoco al campo che si sta digitando) */
  if (f === 'firma' || f === 'entro') {
    _cpaSollGruppi().forEach(g => {
      const b = S.bozze[g.operatore];
      if (b && b.fonte === 'base') S.bozze[g.operatore] = _cpaSollBase(g);
    });
    document.querySelectorAll('#cpa-root [data-soll-op][data-f]').forEach(x => {
      const b = S.bozze[x.dataset.sollOp];
      if (b && b.fonte === 'base') x.value = b[x.dataset.f] || '';
    });
  }
}

function cpaSollEdit(el) {
  const S = _cpa.soll;
  const b = S && S.bozze[el.dataset.sollOp];
  if (!b) return;
  b[el.dataset.f] = el.value;
  b.fonte = 'manuale';
  const tag = [...document.querySelectorAll('#cpa-root [data-soll-tag]')].find(x => x.dataset.sollTag === el.dataset.sollOp);
  if (tag) tag.textContent = '✎ modificato';
}

async function cpaSollAi() {
  const S = _cpa.soll;
  if (!S || S.aiInCorso) return;
  if (!S.ai || !S.ai.ok) { showAlertModal((S.ai && S.ai.motivo) || 'Sto ancora verificando l\'assistente AI: riprova tra un attimo.'); return; }
  const gruppi = _cpaSollDaInviare();
  if (!gruppi.length) return;
  if (Object.values(S.bozze).some(b => b.fonte === 'manuale')) {
    const ok = await showConfirmAsync('L\'assistente riscriverà tutte le bozze, comprese quelle che hai modificato a mano. Procedere?', 'Riscrivi');
    if (!ok) return;
  }
  const r = _cpa.risultato;
  S.aiInCorso = true;
  let scritti = 0;
  const mancanti = [];
  try {
    for (let i = 0; i < gruppi.length; i += CPA_SOLL_AI_BLOCCO) {
      const blocco = gruppi.slice(i, i + CPA_SOLL_AI_BLOCCO);
      S.msg = '⏳ L\'assistente scrive i solleciti (' + Math.min(i + CPA_SOLL_AI_BLOCCO, gruppi.length) + '/' + gruppi.length + ')…';
      cpaRender();
      const { data, error } = await _sbClient.functions.invoke('ai-autoplan', {
        body: {
          action: 'solleciti', anno: _cpa.anno, settimana: _cpa.week, oggi: _cpaOggiISO(),
          tono: S.tono, firma: S.firma, entro: S.entro, operatori: cpaSollecitiPayload(blocco, r.giorniLabel),
        },
      });
      if (error) throw new Error(await _cpEdgeErr(error, 'ai-autoplan'));
      if (data && data.error) throw new Error(data.error);
      const perNome = {};
      ((data && data.messaggi) || []).forEach(m => { perNome[m.operatore] = m; });
      blocco.forEach(g => {
        const m = perNome[g.operatore];
        if (!m) { mancanti.push(g.operatore); return; }
        const prima = S.bozze[g.operatore] || _cpaSollBase(g);
        S.bozze[g.operatore] = { fonte: 'ai', oggetto: m.oggetto || prima.oggetto, testo: m.testo };
        scritti++;
      });
    }
    S.msg = '✅ ' + scritti + ' solleciti scritti dall\'assistente' +
      (mancanti.length ? '. Restano col testo base: ' + mancanti.join(', ') : '') + '. Rileggili prima di inviarli.';
    sbLogActivity('Controllo anomalie: solleciti scritti con AI', { anno: _cpa.anno, week: _cpa.week, n: scritti });
  } catch (e) {
    console.error('cpaSollAi', e);
    S.msg = '⚠ ' + (e.message || e) + (scritti ? ' (' + scritti + ' già riscritti)' : '') + '. Le altre bozze restano col testo base.';
  } finally {
    S.aiInCorso = false;
    if (_cpa.soll === S) cpaRender();
  }
}

async function cpaSollMail(el) {
  const S = _cpa.soll;
  const nome = el.dataset.sollOp;
  const b = S && S.bozze[nome];
  if (!b) return;
  const email = _cpaEmailByNome()[nome];
  if (!email) { showAlertModal(nome + ' non ha un\'email in anagrafica: usa "📋 Copia" e invia il messaggio a mano.'); return; }
  let url = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(b.oggetto || '');
  const lungo = encodeURIComponent(b.testo).length > CPA_MAILTO_MAX;
  if (lungo) { try { await navigator.clipboard.writeText(b.testo); } catch (_) {} }
  else url += '&body=' + encodeURIComponent(b.testo);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  b.aperta = true;
  sbLogActivity('Controllo anomalie: sollecito aperto in posta', { anno: _cpa.anno, week: _cpa.week, operatore: nome });
  cpaRender();
  if (lungo) showAlertModal('Il testo è troppo lungo per il link di posta: è negli appunti, incollalo nel corpo della mail (Ctrl+V).');
}

/* Chat Teams con l'operatore e il messaggio già scritto nella casella (deep link
   ufficiale "l/chat"). L'utente Teams si individua con l'email di lavoro in anagrafica:
   con un'email personale la chat non si apre sulla persona giusta. Il messaggio
   NON parte: resta da inviare con Invio. Testo lungo: va negli appunti. */
const CPA_TEAMS_MAX = 1800;
const CPA_TEAMS_DOMINIO = /@eagleprojects\.it$/i;

async function cpaSollTeams(el) {
  const S = _cpa.soll;
  const nome = el.dataset.sollOp;
  const b = S && S.bozze[nome];
  if (!b) return;
  const email = _cpaEmailByNome()[nome];
  if (!email) { showAlertModal(nome + ' non ha un\'email in anagrafica: senza email non si può aprire la chat Teams. Usa "📋 Copia".'); return; }
  let url = 'https://teams.microsoft.com/l/chat/0/0?users=' + encodeURIComponent(email);
  const lungo = encodeURIComponent(b.testo).length > CPA_TEAMS_MAX;
  try { await navigator.clipboard.writeText(b.testo); } catch (_) {}
  if (!lungo) url += '&message=' + encodeURIComponent(b.testo);
  window.open(url, '_blank', 'noopener');
  b.apertaTeams = true;
  sbLogActivity('Controllo anomalie: sollecito aperto in Teams', { anno: _cpa.anno, week: _cpa.week, operatore: nome });
  cpaRender();
  if (lungo) showAlertModal('Il testo è troppo lungo per il link di Teams: si apre la chat vuota e il messaggio è negli appunti, incollalo (Ctrl+V).');
}

async function cpaSollCopia(el) {
  const S = _cpa.soll;
  if (!S) return;
  let testo;
  if (el.dataset.sollOp) {
    const b = S.bozze[el.dataset.sollOp];
    testo = b ? (b.oggetto ? 'Oggetto: ' + b.oggetto + '\n\n' : '') + b.testo : '';
  } else {
    const email = _cpaEmailByNome();
    testo = _cpaSollDaInviare().map(g => {
      const b = S.bozze[g.operatore] || _cpaSollBase(g);
      return 'A: ' + g.operatore + (email[g.operatore] ? ' <' + email[g.operatore] + '>' : '') + '\nOggetto: ' + b.oggetto + '\n\n' + b.testo;
    }).join('\n\n----------------------------------------\n\n');
  }
  try { await navigator.clipboard.writeText(testo); showAlertModal('Copiato negli appunti.'); }
  catch (_) { showAlertModal(testo); }
}

const CPA_SOLL_FONTE = { base: 'testo base', ai: '✨ assistente', manuale: '✎ modificato' };

function _cpaSollSchedaHtml(g, r, email, inp) {
  const S = _cpa.soll;
  const b = S.bozze[g.operatore] || (S.bozze[g.operatore] = _cpaSollBase(g));
  const em = email[g.operatore];
  const op = esc(g.operatore);
  const st = _cpaSollStato(g);
  const nuovi = new Set(st ? st.nuovi : []);
  const giorni = g.voci.map(v => '<span class="inline-block rounded px-1.5 text-[11px] mr-1" style="' +
    (v.oreRegistrate > 0 ? 'background:#fef3c7;color:#92400e;' : 'background:#fee2e2;color:#991b1b;') +
    (st && nuovi.has(v.giorno) ? 'outline:2px solid #4f46e5;' : '') + '"' +
    (st && nuovi.has(v.giorno) ? ' title="Giornata nuova, non compresa nel sollecito già inviato"' : '') + '>' +
    esc(r.giorniLabel[v.giorno]) + ' · ' + (v.oreRegistrate > 0 ? esc(String(v.oreRegistrate).replace('.', ',')) + '/' + v.oreAttese + ' h' : '0 h') + '</span>').join('');
  const quando = st ? new Date(st.rec.ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const spunta = '<label class="pw-write-action text-xs flex items-center gap-1 font-semibold" style="color:' + (st && st.completo ? '#15803d' : '#334155') + ';">' +
    '<input type="checkbox" data-soll-op="' + op + '" onchange="cpaSollSegnaInviato(this)"' + (st && st.completo ? ' checked' : '') + '> Sollecito inviato</label>' +
    (st ? '<span class="text-[11px] text-slate-500">' + (st.completo ? '' : '⚠ inviato il ' + quando + ', ma ci sono giornate nuove (riquadrate): spunta di nuovo dopo il nuovo invio · ') +
      (st.completo ? 'il ' + quando : '') + (st.rec.da ? ' da ' + esc(st.rec.da) : '') + '</span>' : '');
  /* Già sollecitato e niente di nuovo: scheda compatta, il testo non serve più */
  if (st && st.completo) {
    return '<div class="border border-emerald-200 rounded px-2 py-1 bg-white">' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<span class="text-sm font-semibold text-slate-600">' + op + '</span>' + spunta +
        '<div class="flex-1"></div>' + giorni + '</div></div>';
  }
  return '<div class="border border-slate-200 rounded-md p-2 bg-white">' +
    '<div class="flex flex-wrap items-center gap-2">' +
      '<span class="text-sm font-semibold text-slate-800">' + op + '</span>' +
      '<span class="text-[11px] ' + (em ? 'text-slate-500' : 'text-rose-700') + '">' + (em ? esc(em) : '⚠ senza email in anagrafica') + '</span>' +
      '<span class="text-[11px] text-slate-400" data-soll-tag="' + op + '">' + CPA_SOLL_FONTE[b.fonte] + '</span>' +
      (b.aperta ? '<span class="text-[11px]" style="color:#15803d;">✓ aperta in posta</span>' : '') +
      (b.apertaTeams ? '<span class="text-[11px]" style="color:#15803d;">✓ aperta in Teams</span>' : '') +
      '<div class="flex-1"></div>' + giorni + '</div>' +
    '<input type="text" data-soll-op="' + op + '" data-f="oggetto" oninput="cpaSollEdit(this)" value="' + esc(b.oggetto) + '" class="' + inp + ' w-full mt-1.5" placeholder="Oggetto">' +
    '<textarea data-soll-op="' + op + '" data-f="testo" oninput="cpaSollEdit(this)" rows="' + Math.min(14, 8 + g.voci.length) + '" class="' + inp + ' w-full mt-1" style="font-family:inherit;line-height:1.4;">' + esc(b.testo) + '</textarea>' +
    '<div class="flex items-center gap-1.5 mt-1">' +
      '<button type="button" data-soll-op="' + op + '" onclick="cpaSollMail(this)" class="text-xs px-2 py-0.5 rounded font-semibold text-white" style="background:#4f46e5;' + (em ? '' : 'opacity:.55;') + '">✉️ Apri mail</button>' +
      '<button type="button" data-soll-op="' + op + '" onclick="cpaSollTeams(this)" class="text-xs px-2 py-0.5 rounded font-semibold text-white" style="background:#5b5fc7;' + (em ? '' : 'opacity:.55;') + '" title="Apre la chat Teams con l\'operatore e il messaggio già scritto (resta da inviare)">💬 Apri in Teams</button>' +
      (em && !CPA_TEAMS_DOMINIO.test(em) ? '<span class="text-[11px] text-amber-700" title="Teams trova la persona dall\'email di lavoro">⚠ email non aziendale: Teams potrebbe non trovarlo</span>' : '') +
      '<button type="button" data-soll-op="' + op + '" onclick="cpaSollCopia(this)" class="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white hover:bg-slate-50">📋 Copia</button>' +
      '<div class="flex-1"></div>' + spunta +
    '</div></div>';
}

function _cpaSollHtml(r) {
  const S = _cpa.soll;
  const gruppi = _cpaSollGruppi();
  const email = _cpaEmailByNome();
  const inp = 'border border-slate-300 rounded px-1.5 py-1 text-xs';
  const aiOk = S.ai && S.ai.ok;
  const aiTitolo = !S.ai ? 'Verifico l\'assistente AI…' : (aiOk ? 'Riscrive le bozze con ' + S.ai.provider + ' · ' + S.ai.model : S.ai.motivo);
  const nZero = gruppi.filter(g => g.voci.some(v => !(v.oreRegistrate > 0))).length;
  const intest = '<div class="flex flex-wrap items-center gap-2">' +
    '<button type="button" onclick="cpaSollChiudi()" class="text-xs px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50">← Anomalie</button>' +
    '<button type="button" onclick="cpaRegistroApri()" class="text-xs px-2 py-1 border border-emerald-300 rounded bg-white hover:bg-emerald-50" style="color:#047857;">📒 Registro solleciti' + (_cpaRegistroConta() ? ' (' + _cpaRegistroConta() + ')' : '') + '</button>' +
    '<span class="text-xs font-semibold text-slate-700 uppercase tracking-wide">✉️ Solleciti ore Jira · settimana ' + _cpa.week + '</span>' +
    '<span class="text-[11px] text-slate-500">' + _cpaSollDaInviare().length + ' da inviare su ' + gruppi.length + ' operatori (' + nZero + ' con giornate a zero ore). Niente parte da solo: ogni mail si apre nel tuo programma di posta da rivedere.</span>' +
    '<div class="flex-1"></div>' +
    '<button type="button" onclick="cpaToggle()" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800" title="Chiudi">✕</button></div>';
  const toni = [['cordiale', 'Cordiale'], ['formale', 'Formale'], ['diretto', 'Diretto']];
  const opzioni = '<div class="flex flex-wrap items-center gap-2 mt-2">' +
    '<label class="text-xs text-slate-600 flex items-center gap-1" title="Usato dall\'assistente AI">Tono <select data-f="tono" onchange="cpaSollOpzione(this)" class="' + inp + '">' +
      toni.map(t => '<option value="' + t[0] + '"' + (S.tono === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') +
    '</select></label>' +
    '<label class="text-xs text-slate-600 flex items-center gap-1">Entro <input type="text" data-f="entro" oninput="cpaSollOpzione(this)" value="' + esc(S.entro) + '" placeholder="es. venerdì 2 ottobre" class="' + inp + '" style="width:150px;"></label>' +
    '<label class="text-xs text-slate-600 flex items-center gap-1">Firma <input type="text" data-f="firma" oninput="cpaSollOpzione(this)" value="' + esc(S.firma) + '" placeholder="es. Mario — Pianificazione" class="' + inp + '" style="width:210px;"></label>' +
    '<div class="flex-1"></div>' +
    '<button type="button" onclick="cpaSollTestoBase()" class="text-xs px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50">↺ Testo base</button>' +
    '<button type="button" onclick="cpaSollAi()" class="text-xs px-3 py-1.5 rounded font-semibold text-white" style="background:#7c3aed;' + (aiOk && !S.aiInCorso ? '' : 'opacity:.55;') + '" title="' + esc(aiTitolo) + '"' + (S.aiInCorso ? ' disabled' : '') + '>✨ Scrivi con l\'assistente AI</button>' +
    '<button type="button" onclick="cpaSollCopia(this)" class="text-xs px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50">📋 Copia tutti</button>' +
    '</div>';
  const msg = S.msg ? '<div class="text-xs mt-2 ' + (S.msg.startsWith('⚠') ? 'text-rose-700' : 'text-slate-600') + '">' + esc(S.msg) + '</div>' : '';
  // confronto per NOME: _cpaSollGruppi() crea oggetti nuovi a ogni chiamata
  const daInviare = _cpaSollDaInviare();
  const nomiDaInviare = new Set(daInviare.map(g => g.operatore));
  const inviati = gruppi.filter(g => !nomiDaInviare.has(g.operatore));
  let corpo;
  if (!gruppi.length) {
    corpo = '<div class="text-sm mt-3" style="color:#15803d;">✅ Nessun sollecito da preparare: ore Jira complete per tutti.</div>';
  } else {
    /* Già sollecitati: riquadro verde in cima, una riga per operatore (si toglie la spunta da qui) */
    const bloccoInviati = inviati.length
      ? '<div class="rounded-md border p-2 mt-2" style="background:#f0fdf4;border-color:#86efac;">' +
          '<div class="text-xs font-semibold mb-1" style="color:#15803d;">✅ Già sollecitati (' + inviati.length + ')</div>' +
          '<div class="flex flex-col gap-1">' + inviati.map(g => _cpaSollSchedaHtml(g, r, email, inp)).join('') + '</div>' +
        '</div>'
      : '';
    const intestDa = '<div class="text-xs font-semibold text-slate-700 mt-3 mb-1">✉️ Da inviare (' + daInviare.length + ')</div>';
    corpo = '<div class="mt-1" style="max-height:620px;overflow-y:auto;">' +
      bloccoInviati +
      (daInviare.length
        ? intestDa + '<div class="flex flex-col gap-2">' + daInviare.map(g => _cpaSollSchedaHtml(g, r, email, inp)).join('') + '</div>'
        : '<div class="text-sm mt-3" style="color:#15803d;">✅ Tutti i solleciti di questa settimana risultano inviati.</div>') +
      '</div>';
  }
  return '<div class="bg-white border border-indigo-200 rounded-lg p-3 shadow-sm">' + intest + opzioni + msg + corpo + '</div>';
}

/* ==================== REGISTRO SOLLECITI ====================
   Chi è stato sollecitato, quando, da chi, per quali giornate e con quale testo.
   Legge SOLO pwData.sollecitiInviati (salvato su Supabase con la pianificazione),
   quindi è visibile senza rilanciare il controllo e resta dopo la chiusura della
   dashboard. Se c'è un controllo della stessa settimana, mostra anche se le ore
   risultano ancora mancanti. */

const CPA_CANALE = { mail: '✉️ mail', teams: '💬 Teams', 'mail+teams': '✉️ + 💬', '': '—' };

function cpaRegistroApri() { _cpa.registro = { tutte: false, aperti: {} }; cpaRender(); }
function cpaRegistroChiudi() { _cpa.registro = null; cpaRender(); }
function cpaRegistroTutte(el) { _cpa.registro.tutte = !!el.checked; cpaRender(); }
function cpaRegistroTesto(el) {
  const k = el.dataset.k;
  _cpa.registro.aperti[k] = !_cpa.registro.aperti[k];
  cpaRender();
}

/* Righe del registro, più recenti prima: una per invio */
function _cpaRegistroRighe(tutte) {
  const out = [];
  const S = pwData.sollecitiInviati || {};
  Object.keys(S).forEach(anno => Object.keys(S[anno] || {}).forEach(week => {
    if (!tutte && (Number(anno) !== pwAnno || Number(week) !== pwWeek)) return;
    const W = S[anno][week] || {};
    Object.keys(W).forEach(op => {
      const rec = W[op] || {};
      const invii = Array.isArray(rec.invii) ? rec.invii : [{ ts: rec.ts, da: rec.da, giorni: rec.giorni || [] }];
      invii.forEach((x, i) => out.push({ anno: Number(anno), week: Number(week), operatore: op, idx: i, n: invii.length, inv: x }));
    });
  }));
  return out.sort((a, b) => String(b.inv.ts).localeCompare(String(a.inv.ts)));
}

function _cpaGiorniLabel(anno, week, giorni) {
  const mon = isoWeekToMonday(anno, week);
  return (giorni || []).map(g => {
    const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + g);
    return CPA_GIORNI[g] + ' ' + String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }).join(', ');
}

/* Stato attuale secondo l'ultimo controllo di quella settimana (se c'è) */
function _cpaRegistroStato(riga) {
  const r = _cpa.risultato;
  if (!r || _cpa.anno !== riga.anno || _cpa.week !== riga.week) return '<span class="text-slate-400" title="Lancia il controllo di quella settimana per sapere se le ore sono state sistemate">—</span>';
  const g = cpaRaggruppaSolleciti(r.anomalie).find(x => x.operatore === riga.operatore);
  const ancora = g ? g.voci.filter(v => (riga.inv.giorni || []).includes(v.giorno)) : [];
  return ancora.length
    ? '<span style="color:#b45309;">⏳ ore ancora mancanti (' + ancora.map(v => CPA_GIORNI[v.giorno]).join(', ') + ')</span>'
    : '<span style="color:#15803d;">✓ ore sistemate</span>';
}

function _cpaRegistroHtml() {
  const R = _cpa.registro;
  const righe = _cpaRegistroRighe(R.tutte);
  const intest = '<div class="flex flex-wrap items-center gap-2">' +
    '<button type="button" onclick="cpaRegistroChiudi()" class="text-xs px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50">← Indietro</button>' +
    '<span class="text-xs font-semibold text-slate-700 uppercase tracking-wide">📒 Registro solleciti · ' + (R.tutte ? 'tutte le settimane' : 'settimana ' + pwWeek + '/' + pwAnno) + '</span>' +
    '<span class="text-[11px] text-slate-500">Salvato con la pianificazione: lo vedono tutti e resta anche dopo aver chiuso la dashboard.</span>' +
    '<div class="flex-1"></div>' +
    '<label class="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" onchange="cpaRegistroTutte(this)"' + (R.tutte ? ' checked' : '') + '> tutte le settimane</label>' +
    '<button type="button" onclick="cpaToggle()" class="text-xs px-2 py-1 text-slate-500 hover:text-slate-800" title="Chiudi">✕</button></div>';
  if (!righe.length) {
    return '<div class="bg-white border border-emerald-200 rounded-lg p-3 shadow-sm">' + intest +
      '<div class="text-sm text-slate-500 mt-3">Nessun sollecito registrato' + (R.tutte ? '.' : ' per questa settimana.') + ' Si registra con la spunta «Sollecito inviato» in ✉️ Prepara solleciti.</div></div>';
  }
  const th = 'text-left text-[11px] font-semibold text-slate-500 px-2 py-1 border-b border-slate-200';
  const td = 'text-xs px-2 py-1 border-b border-slate-100 align-top';
  const corpo = righe.map(x => {
    const k = x.anno + '|' + x.week + '|' + x.operatore + '|' + x.idx;
    const quando = x.inv.ts ? new Date(x.inv.ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const aperto = R.aperti[k];
    const riga = '<tr>' +
      (R.tutte ? '<td class="' + td + '">' + x.week + '/' + x.anno + '</td>' : '') +
      '<td class="' + td + ' font-semibold text-slate-800">' + esc(x.operatore) + (x.n > 1 ? ' <span class="text-[10px] text-slate-400">(' + (x.idx + 1) + '° invio)</span>' : '') + '</td>' +
      '<td class="' + td + '">' + esc(_cpaGiorniLabel(x.anno, x.week, x.inv.giorni)) + '</td>' +
      '<td class="' + td + '">' + quando + '</td>' +
      '<td class="' + td + ' text-slate-500">' + esc(x.inv.da || '—') + '</td>' +
      '<td class="' + td + '">' + (CPA_CANALE[x.inv.canale || ''] || '—') + '</td>' +
      '<td class="' + td + '">' + _cpaRegistroStato(x) + '</td>' +
      '<td class="' + td + '">' + (x.inv.testo
        ? '<button type="button" data-k="' + esc(k) + '" onclick="cpaRegistroTesto(this)" class="text-[11px] text-indigo-700 hover:underline">' + (aperto ? 'nascondi' : 'testo') + '</button>'
        : '<span class="text-slate-300">—</span>') + '</td>' +
      '</tr>';
    const testo = aperto && x.inv.testo
      ? '<tr><td colspan="' + (R.tutte ? 8 : 7) + '" class="px-2 pb-2"><div class="text-xs whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-slate-700">' +
          (x.inv.oggetto ? '<b>' + esc(x.inv.oggetto) + '</b>\n\n' : '') + esc(x.inv.testo) + '</div></td></tr>'
      : '';
    return riga + testo;
  }).join('');
  const nOp = new Set(righe.map(x => x.anno + '|' + x.week + '|' + x.operatore)).size;
  return '<div class="bg-white border border-emerald-200 rounded-lg p-3 shadow-sm">' + intest +
    '<div class="text-[11px] text-slate-500 mt-1">' + righe.length + ' invii a ' + nOp + ' operatori. Per annullare un invio registrato per errore, togli la spunta dalla scheda in ✉️ Prepara solleciti.</div>' +
    '<div class="mt-2" style="max-height:520px;overflow:auto;"><table class="w-full" style="border-collapse:collapse;"><thead><tr>' +
      (R.tutte ? '<th class="' + th + '">Settimana</th>' : '') +
      '<th class="' + th + '">Operatore</th><th class="' + th + '">Giornate</th><th class="' + th + '">Inviato il</th><th class="' + th + '">Da</th><th class="' + th + '">Canale</th><th class="' + th + '">Stato ore</th><th class="' + th + '"></th>' +
    '</tr></thead><tbody>' + corpo + '</tbody></table></div></div>';
}

function _cpaRegistroConta() {
  return _cpaRegistroRighe(false).length;
}
