/* ===== BONIFICA SOTTOTASK DI UNA SETTIMANA PASSATA (pwJbon*, v18.243.0) =====
   «🧹 Bonifica settimana» nel controllo «🎫 Sottotask», solo per settimane finite. Regola
   dell'utente: ogni operatore lavora attivando il suo sottotask su Jira, quindi a settimana
   finita un sottotask ancora in CREATED / TO DO senza ore non serve e si elimina; la Griglia
   si corregge con quello che è successo davvero:
   - quel giorno l'operatore non ha ore su Jira → la voce si toglie dalla cella;
   - ha ore su altri sottotask → la voce si sostituisce con i cantieri di quei sottotask
     (indice sottotask → cantiere di tutta la Griglia, _cpaIndiceSottotask) e la giornata si
     collega al sottotask su cui ha registrato le ore;
   - ha ore solo su ticket che la Griglia non conosce, o i suoi worklog non si leggono →
     «da verificare»: né Jira né Griglia vengono toccati.
   Prima un'anteprima, poi «Applica» con conferma. Su Jira passa da jira-subtask-delete, che
   rilegge ogni sottotask e rifiuta quelli iniziati o con ore: la Griglia si corregge solo per
   i sottotask eliminati davvero. Le modifiche alla Griglia passano da pwSave (annullabili con
   «Indietro»); l'eliminazione su Jira no. */

const PW_JBON_STATI = /^(created|creato|to\s*do|da\s*fare)$/i;
const _pwJbon = { piano: null, msg: '', errore: '', inCorso: false, esito: null };

// La settimana mostrata è finita (sabato prima di oggi).
function pwJbonDisponibile() {
  return pwJsubDataIso(pwAnno, pwWeek, 5) < _cpaOggiISO();
}

function pwJbonApri() {
  if (!pwJbonDisponibile() || !sbGuardWrite()) return;
  _pwJbon.piano = null;
  _pwJbon.esito = null;
  _pwJbon.errore = '';
  _pwJbon.msg = 'Leggo da Jira lo stato dei sottotask e le ore degli operatori…';
  _pwJbonRender();
  const anno = pwAnno, week = pwWeek;
  _pwJbonPiano().then(p => {
    if (pwAnno !== anno || pwWeek !== week) return;
    _pwJbon.piano = p;
    _pwJbon.msg = '';
    if (document.getElementById('pw-jbon-modal')) _pwJbonRender();
  }).catch(e => {
    _pwJbon.msg = '';
    _pwJbon.errore = e.message || String(e);
    if (document.getElementById('pw-jbon-modal')) _pwJbonRender();
  });
}

/* Piano della bonifica per la settimana mostrata:
   { anno, week, elimina: [gruppo], verificare: [gruppo], conOre: [gruppo], avvisi }
   gruppo = { key, url, operatore, cantiere, attivita, giorno, status, voci: [voce], motivo? }
   voce = { cIdx, commessa, operatore, giorno, cantiere, attivita, ore, mete: [{ commessa,
            cantiere, attivita, key, url }] } — mete vuote = la voce si toglie e basta. */
async function _pwJbonPiano() {
  const anno = pwAnno, week = pwWeek;
  const data = pwGetWeekData(), date = _cpaDateSettimana(), indice = _cpaIndiceSottotask(); // prima delle attese
  await pwJchkVerificaJira(true);
  const v = _pwJchk.jira[anno + '|' + week];
  if (!v || v.errore || !v.ts) throw new Error('verifica dei sottotask su Jira non riuscita' + (v && v.errore ? ': ' + v.errore : ''));

  // Sottotask della settimana ancora in CREATED / TO DO, con le voci di Griglia che li usano.
  const gruppi = new Map();
  data.forEach(bc => {
    if (!bc || !bc.commessa) return;
    Object.values(pwJiraSubtaskMappa(bc)).forEach(e => {
      if (!pwJiraSubtaskIsResolved(e) || !e.key || gruppi.has(e.key) || v.cancellati.has(e.key)) return;
      const st = v.info[e.key] && v.info[e.key].status;
      if (!PW_JBON_STATI.test(String(st || '').trim())) return;
      gruppi.set(e.key, { key: e.key, url: e.url || '', operatore: e.operatore || '', cantiere: e.cantiere || '',
        attivita: e.attivita || '', giorno: e._db ? e.giorno : null, status: st, voci: [] });
    });
  });
  data.forEach((bc, cIdx) => {
    if (!bc || !bc.commessa) return;
    (bc.squadre || []).forEach(sq => (sq.operatori || []).forEach(op => {
      const nome = (op.nome || '').trim();
      if (!nome || op.fornitore) return;
      for (let g = 0; g < 6; g++) {
        pwCellVoci((op.giorni || {})[g]).forEach(x => {
          const e = pwJiraSubtaskEntry(bc, x.cantiere, nome, pwJiraAttivitaSottotask(bc, x.cantiere, nome, x.attivita), g);
          const gr = e && e.key ? gruppi.get(e.key) : null;
          if (gr) gr.voci.push({ cIdx, commessa: bc.commessa, operatore: nome, giorno: g, cantiere: x.cantiere, attivita: x.attivita || '', mete: [] });
        });
      }
    }));
  });
  const piano = { anno, week, elimina: [], verificare: [], conOre: [], avvisi: [] };
  if (!gruppi.size) return piano;

  // Ore degli operatori coinvolti (proprietari dei sottotask e operatori delle voci).
  const nomi = new Set();
  gruppi.forEach(gr => { if (gr.operatore) nomi.add(gr.operatore); gr.voci.forEach(x => nomi.add(x.operatore)); });
  const { worklog, verificati } = await _cpaLeggiWorklog([...nomi], date, piano.avvisi, true);
  const letti = new Set(verificati);
  const ticketDi = nome => Object.values(worklog[nome] || {}).flatMap(d => d.tickets || []);

  gruppi.forEach(gr => {
    const op = gr.operatore || (gr.voci[0] && gr.voci[0].operatore) || '';
    if (!letti.has(op) || gr.voci.some(x => !letti.has(x.operatore))) {
      piano.verificare.push(Object.assign(gr, { motivo: 'ore su Jira di ' + op + ' non leggibili (email mancante o errore)' }));
      return;
    }
    if ([op, ...gr.voci.map(x => x.operatore)].some(n => ticketDi(n).some(t => t.key === gr.key && t.hours > 0))) {
      piano.conOre.push(gr);
      return;
    }
    const ignoti = [];
    gr.voci.forEach(x => {
      const giorno = (worklog[x.operatore] || {})[x.giorno];
      x.ore = giorno ? Number(giorno.hours) || 0 : 0;
      if (!x.ore) return;
      const viste = new Set();
      (giorno.tickets || []).forEach(t => {
        if (!(t.hours > 0) || t.key === gr.key) return;
        const i = indice[t.key];
        if (!i) { ignoti.push(t); return; }
        const id = _apNorm(i.commessa) + '|' + _apNorm(i.cantiere) + '|' + _apNorm(i.attivita);
        if (viste.has(id)) return;
        viste.add(id);
        x.mete.push({ commessa: i.commessa, cantiere: i.cantiere, attivita: i.attivita || '', key: t.key, url: t.url || '' });
      });
      if (!x.mete.length) x.ignoti = (giorno.tickets || []).filter(t => t.hours > 0);
    });
    const dubbie = gr.voci.filter(x => x.ore && !x.mete.length);
    if (dubbie.length) {
      const chiavi = [...new Set(dubbie.flatMap(x => x.ignoti.map(t => t.key)))];
      piano.verificare.push(Object.assign(gr, { motivo: 'ore registrate su ticket che la Griglia non conosce (' + chiavi.join(', ') + '): correggi a mano' }));
      return;
    }
    piano.elimina.push(gr);
  });
  const ordina = (a, b) => String(a.operatore).localeCompare(String(b.operatore), 'it') || ((a.giorno || 0) - (b.giorno || 0));
  piano.elimina.sort(ordina);
  piano.verificare.sort(ordina);
  piano.conOre.sort(ordina);
  return piano;
}

function _pwJbonGiorno(anno, week, g) {
  return g === null || g === undefined ? 'settimanale' : pwJsubGiornoLabel(anno, week, g);
}

function _pwJbonLink(key, url) {
  return url
    ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="text-blue-700 hover:underline">' + esc(key) + '</a>'
    : esc(key);
}

// Cosa succede in Griglia per una voce (testo HTML).
function _pwJbonEffettoHtml(p, x) {
  const quando = esc(_pwJbonGiorno(p.anno, p.week, x.giorno));
  const dove = '<b>' + esc(x.operatore) + '</b> · ' + esc(x.cantiere) + (x.attivita ? ' <span class="text-slate-500">(' + esc(x.attivita) + ')</span>' : '') + ' · ' + quando;
  if (!x.mete.length) return dove + ' → <span class="text-red-700">nessuna ora su Jira quel giorno: voce tolta dalla cella</span>';
  const mete = x.mete.map(m => esc(m.cantiere) + (m.attivita ? ' (' + esc(m.attivita) + ')' : '')
    + (_apNorm(m.commessa) !== _apNorm(x.commessa) ? ' <span class="text-slate-500">[' + esc(m.commessa) + ']</span>' : '')
    + ' ' + _pwJbonLink(m.key, m.url)).join(', ');
  return dove + ' → <span class="text-teal-700">ore su ' + mete + ': voce sostituita</span>';
}

function _pwJbonGruppoHtml(p, gr, conEffetto) {
  const testa = _pwJbonLink(gr.key, gr.url) + ' <span class="text-slate-500">' + esc(gr.status || '') + '</span>';
  if (!conEffetto) {
    return '<div class="pw-jbon-riga">' + testa + ' — <b>' + esc(gr.operatore) + '</b> · ' + esc(gr.cantiere) + ' · ' + esc(_pwJbonGiorno(p.anno, p.week, gr.giorno))
      + (gr.motivo ? '<div class="text-[11px] text-amber-700">' + esc(gr.motivo) + '</div>' : '') + '</div>';
  }
  const corpo = gr.voci.length
    ? gr.voci.map(x => '<div class="text-[12px]">' + _pwJbonEffettoHtml(p, x) + '</div>').join('')
    : '<div class="text-[12px]"><b>' + esc(gr.operatore) + '</b> · ' + esc(gr.cantiere) + ' · ' + esc(_pwJbonGiorno(p.anno, p.week, gr.giorno))
      + ' → <span class="text-slate-600">non più in Griglia: nessuna correzione</span></div>';
  return '<div class="pw-jbon-riga">' + testa + corpo + '</div>';
}

function _pwJbonSezione(titolo, colore, righe) {
  if (!righe) return '';
  return '<div class="mt-3"><div class="text-sm font-semibold ' + colore + ' mb-1">' + titolo + '</div>' + righe + '</div>';
}

function _pwJbonRender() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const p = _pwJbon.piano;
  let corpo = '';
  if (_pwJbon.msg) corpo += '<div class="pw-jchk-jira">⏳ ' + esc(_pwJbon.msg) + '</div>';
  if (_pwJbon.errore) corpo += '<div class="pw-jchk-jira pw-jchk-jira-err">⚠️ ' + esc(_pwJbon.errore) + '</div>';
  if (_pwJbon.esito) corpo += '<div class="pw-jchk-jira' + (_pwJbon.esito.ko ? ' pw-jchk-jira-err' : '') + '" style="white-space:pre-line">' + esc(_pwJbon.esito.testo) + '</div>';
  if (p && !_pwJbon.esito) {
    const tot = p.elimina.length + p.verificare.length + p.conOre.length;
    if (!tot) {
      corpo += '<div class="pw-jchk-esito pw-jchk-esito-ok"><div class="pw-jchk-esito-big">✅ Niente da bonificare</div>'
        + '<div>Nessun sottotask della settimana è rimasto in CREATED o TO DO.</div></div>';
    } else {
      corpo += '<div class="text-sm text-slate-700">Sottotask rimasti in CREATED / TO DO: <b>' + tot + '</b> — da eliminare <b>' + p.elimina.length + '</b>'
        + (p.verificare.length ? ', da verificare <b>' + p.verificare.length + '</b>' : '')
        + (p.conOre.length ? ', con ore (lasciati) <b>' + p.conOre.length + '</b>' : '') + '.</div>';
      corpo += _pwJbonSezione('🗑️ Da eliminare su Jira, con la correzione della Griglia', 'text-red-700', p.elimina.map(gr => _pwJbonGruppoHtml(p, gr, true)).join(''));
      corpo += _pwJbonSezione('🔎 Da verificare a mano (non vengono toccati)', 'text-amber-700', p.verificare.map(gr => _pwJbonGruppoHtml(p, gr, false)).join(''));
      corpo += _pwJbonSezione('⏱️ Hanno ore registrate: restano su Jira', 'text-slate-600', p.conOre.map(gr => _pwJbonGruppoHtml(p, gr, false)).join(''));
    }
    if (p.avvisi.length) corpo += '<div class="text-[11px] text-amber-700 mt-3">' + p.avvisi.map(esc).join('<br>') + '</div>';
  }
  const applica = p && !_pwJbon.esito && p.elimina.length && sbCanWrite()
    ? '<button type="button" onclick="pwJbonApplica()"' + (_pwJbon.inCorso ? ' disabled' : '') + ' class="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">🗑️ Applica: elimina ' + p.elimina.length + ' e correggi la Griglia</button>'
    : '';
  root.innerHTML = '<div class="modal-backdrop"><div id="pw-jbon-modal" class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 p-5 max-h-[90vh] overflow-y-auto">'
    + '<h3 class="font-semibold text-slate-900">🧹 Bonifica sottotask della settimana</h3>'
    + '<div class="text-xs text-slate-500 mb-3">Week ' + (p ? p.week : pwWeek) + ' · ' + (p ? p.anno : pwAnno) + ' · sottotask rimasti in CREATED o TO DO senza ore</div>'
    + corpo
    + '<div class="flex justify-end gap-2 mt-4">'
    +   '<button type="button" onclick="pwOpenJiraCheck()" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">← Controllo sottotask</button>'
    +   applica
    +   '<button type="button" onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50">Chiudi</button>'
    + '</div></div></div>';
}

async function pwJbonApplica() {
  const p = _pwJbon.piano;
  if (!p || !p.elimina.length || _pwJbon.inCorso || !sbGuardWrite()) return;
  if (p.anno !== pwAnno || p.week !== pwWeek) { showAlertModal('La Griglia mostra un\'altra settimana: riapri la bonifica.'); return; }
  const nVoci = p.elimina.reduce((s, gr) => s + gr.voci.length, 0);
  const ok = await showConfirmAsync('Bonifica della week ' + p.week + ':\n\n• elimina su Jira ' + p.elimina.length + ' sottotask rimasti in CREATED / TO DO'
    + (nVoci ? '\n• corregge ' + nVoci + (nVoci === 1 ? ' voce' : ' voci') + ' della Griglia (tolte o sostituite col cantiere dove ci sono le ore)' : '')
    + '\n\nOgni sottotask viene riletto prima: se nel frattempo è stato avviato o ha ore, resta su Jira e la sua voce in Griglia non cambia.'
    + ' L\'eliminazione su Jira NON si può annullare; le correzioni alla Griglia sì, con «Indietro».', 'Applica bonifica');
  if (!ok) { _pwJbonRender(); return; }
  _pwJbon.inCorso = true;
  _pwJbon.msg = 'Elimino su Jira ' + p.elimina.length + ' sottotask…';
  _pwJbonRender();

  // 1. Jira
  const keys = p.elimina.map(gr => gr.key);
  const esiti = {};
  let errore = '';
  for (let i = 0; i < keys.length; i += 50) {
    try {
      const { data, error } = await _sbClient.functions.invoke('jira-subtask-delete', {
        body: { keys: keys.slice(i, i + 50), contesto: { anno: p.anno, week: p.week, bonifica: true } },
      });
      if (error) throw new Error(await _cpEdgeErr(error, 'jira-subtask-delete'));
      if (data && data.error) throw new Error(data.error);
      ((data && data.risultati) || []).forEach(x => { esiti[x.key] = x; });
    } catch (e) {
      errore = e.message || String(e);
      break;
    }
  }
  const eliminati = p.elimina.filter(gr => esiti[gr.key] && esiti[gr.key].esito === 'eliminato');
  const tolti = new Set(eliminati.map(gr => gr.key));

  // 2. Griglia, solo per i sottotask eliminati davvero
  const data = (pwData[p.anno] || {})[p.week] || [];
  const toccate = new Set(), collega = new Map(), cambiate = [];
  let celleCambiate = 0;
  eliminati.forEach(gr => gr.voci.forEach(x => {
    if (!_apTogliVoce(data, x)) { cambiate.push(x.operatore + ' ' + _pwJbonGiorno(p.anno, p.week, x.giorno) + ' (' + x.cantiere + ')'); return; }
    celleCambiate++;
    x.mete.forEach(m => {
      let bc = data.find(b => b && _apNorm(b.commessa) === _apNorm(m.commessa));
      if (!bc) { bc = { commessa: m.commessa, squadre: [] }; data.push(bc); }
      if (!Array.isArray(bc.squadre)) bc.squadre = [];
      const presente = bc.squadre.some(sq => (sq.operatori || []).some(o => (o.nome || '').trim() === x.operatore
        && pwCellVoci((o.giorni || {})[x.giorno]).some(y => _apNorm(y.cantiere) === _apNorm(m.cantiere) && _apNorm(y.attivita) === _apNorm(m.attivita))));
      if (!presente) {
        const compagni = bc.squadre.flatMap(sq => sq.operatori || [])
          .filter(o => pwCellVoci((o.giorni || {})[x.giorno]).some(y => _apNorm(y.cantiere) === _apNorm(m.cantiere)))
          .map(o => (o.nome || '').trim());
        const op = _apRigaOperatore(bc, x.operatore, compagni);
        if (!op.giorni) op.giorni = {};
        if (_apScriviCella(op, x.giorno, m.cantiere, m.attivita)) toccate.add(bc);
      }
      // La giornata si collega al sottotask su cui l'operatore ha registrato le ore.
      const cIdx = data.indexOf(bc);
      const e = pwJiraSubtaskEntry(bc, m.cantiere, x.operatore, m.attivita, x.giorno, p.anno, p.week);
      if (!pwJiraSubtaskIsResolved(e) || tolti.has(e.key)) {
        if (!collega.has(cIdx)) collega.set(cIdx, []);
        collega.get(cIdx).push({ comune: m.cantiere, operatore: x.operatore, attivita: m.attivita, giorno: x.giorno,
          status: 'already_exists', key: m.key, url: m.url, taskKey: '', message: '', anno: p.anno, week: p.week });
      }
    });
  }));
  data.forEach((bc, i) => { if (toccate.has(bc)) pwRinumeraSquadreDefault(i); });

  // 3. Indicatori dei sottotask eliminati (righe della tabella, o settimanali in bc.jiraSubtask)
  const ids = [];
  let settimanali = false;
  data.forEach(bc => {
    if (!bc) return;
    Object.entries(pwJiraSubtaskMappa(bc, p.anno, p.week)).forEach(([mapKey, e]) => {
      if (!e || !tolti.has(e.key)) return;
      if (e._db) { if (e.id != null) ids.push(e.id); }
      else if (bc.jiraSubtask && bc.jiraSubtask[mapKey]) { delete bc.jiraSubtask[mapKey]; settimanali = true; }
    });
  });
  try {
    await pwJsubElimina([...new Set(ids)]);
  } catch (e) {
    errore = (errore ? errore + ' · ' : '') + 'indicatori non tolti: ' + (e.message || String(e));
  }
  if (celleCambiate || settimanali) await pwSave();
  for (const [cIdx, voci] of collega) await pwJiraSubtaskMarkBadges(cIdx, voci);
  if (pwAnno === p.anno && pwWeek === p.week) pwRender();
  if (eliminati.length) {
    sbLogActivity('Griglia: bonifica sottotask della settimana', { anno: p.anno, week: p.week, eliminati: [...tolti], celleCambiate,
      collegati: [...collega.values()].flat().map(v => v.key) });
  }

  const nonEliminati = p.elimina.filter(gr => !tolti.has(gr.key));
  let testo = '🧹 Bonifica fatta: ' + eliminati.length + ' sottotask eliminati su Jira, ' + celleCambiate + ' voci corrette in Griglia.';
  if (nonEliminati.length) {
    testo += '\n\nNon eliminati (' + nonEliminati.length + '), Griglia non toccata:\n' + nonEliminati.slice(0, 15).map(gr =>
      gr.key + ': ' + (esiti[gr.key] ? (esiti[gr.key].motivo || esiti[gr.key].esito) : 'non elaborato')).join('\n') + (nonEliminati.length > 15 ? '\n…' : '');
  }
  if (cambiate.length) testo += '\n\nCelle già cambiate nel frattempo, lasciate com\'erano: ' + cambiate.join(', ');
  if (errore) testo += '\n\n⚠️ ' + errore;
  _pwJbon.inCorso = false;
  _pwJbon.msg = '';
  _pwJbon.esito = { testo, ko: !!(nonEliminati.length || errore) };
  if (document.getElementById('pw-jbon-modal')) _pwJbonRender();
  else showAlertModal(testo);
}
