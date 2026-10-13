/* ==================== GRIGLIA · LAVAGNA NOTE / VARIAZIONI ====================
   Bottone "📝 Note/Variazioni" nella toolbar della Griglia, accanto al meteo: apre una
   lavagna per la settimana mostrata dove si scrivono note e variazioni rispetto alla
   programmazione iniziale. Ogni messaggio porta autore e data/ora.
   Sta nella tabella Supabase `pw_note_variazioni` (supabase/migrations/20261013_…), NON in
   pwData: è un registro a sola aggiunta, data/ora e utente li mette il server, e due
   colleghi che scrivono insieme non si sovrascrivono (dentro pwData un conflitto di sync
   ricaricherebbe i dati e la nota appena scritta andrebbe persa). Nessuna modifica dopo la
   pubblicazione: si cancella (solo i propri, l'admin tutti) e si riscrive.
   Realtime su un canale separato: contatore sul bottone e modal aperto si aggiornano quando
   scrive un collega. */

const PW_NV_TABLE = 'pw_note_variazioni';
const PW_NV_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

const _pwNv = {
  cache: {},          // 'anno|week' -> righe (più recenti prima)
  inflight: {},       // 'anno|week' -> Promise
  aperto: null,       // { anno, week } della lavagna aperta, null = chiusa
  filtro: 'tutte',    // 'tutte' | 'nota' | 'variazione'
  tipo: 'variazione', // tipo selezionato nel composer
  channel: null,
};

function _pwNvKey(anno, week) { return anno + '|' + week; }

async function pwNvFetch(anno, week, forza) {
  const key = _pwNvKey(anno, week);
  if (!forza && _pwNv.cache[key]) return _pwNv.cache[key];
  if (_pwNv.inflight[key]) return _pwNv.inflight[key];
  if (!_sbClient || !_sbUser) return [];
  _pwNv.inflight[key] = (async () => {
    try {
      const { data, error } = await _sbClient.from(PW_NV_TABLE).select('*')
        .eq('anno', anno).eq('week', week)
        .order('created_at', { ascending: false });
      if (error) throw error;
      _pwNv.cache[key] = data || [];
      return _pwNv.cache[key];
    } finally {
      delete _pwNv.inflight[key];
    }
  })();
  return _pwNv.inflight[key];
}

/* Contatore sul bottone per la settimana mostrata in Griglia. Chiamata da pwRender: legge
   la cache, e va in rete solo la prima volta per settimana (pwRender gira ad ogni modifica). */
function pwNvUpdateButton() {
  const btn = document.getElementById('pw-nv-btn');
  if (!btn) return;
  const key = _pwNvKey(pwAnno, pwWeek);
  const rows = _pwNv.cache[key];
  const BASE = 'px-3 py-1.5 text-sm border rounded no-print whitespace-nowrap ';
  if (!rows) {
    btn.className = BASE + 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100';
    btn.textContent = '📝 Note/Variazioni';
    if (_sbUser) pwNvFetch(pwAnno, pwWeek).then(() => { if (_pwNv.cache[key]) pwNvUpdateButton(); }).catch(e => console.warn('Note/Variazioni:', e));
    return;
  }
  const nVar = rows.filter(r => r.tipo === 'variazione').length;
  if (!rows.length) {
    btn.className = BASE + 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100';
    btn.textContent = '📝 Note/Variazioni';
    btn.title = 'Nessuna nota o variazione per questa settimana — clicca per scriverne una';
  } else {
    btn.className = BASE + 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100';
    btn.textContent = '📝 Note/Variazioni (' + rows.length + ')';
    btn.title = rows.length + ' messaggi' + (nVar ? ', di cui ' + nVar + ' variazioni' : '') + ' — ultimo: '
      + (rows[0].autore_nome || rows[0].autore_email) + ', ' + _pwNvDataOra(rows[0].created_at);
  }
}

function _pwNvDataOra(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* Nome leggibile dell'utente: anagrafica operatori per email, poi metadata, poi la parte
   prima della @. Salvato nella riga così resta anche se l'anagrafica cambia. */
function _pwNvNomeUtente() {
  const email = ((_sbUser && _sbUser.email) || '').toLowerCase();
  const op = (state.operatori || []).find(o => o.email && o.email.trim().toLowerCase() === email);
  if (op && op.nome_esteso) return op.nome_esteso;
  const md = (_sbUser && _sbUser.user_metadata) || {};
  if (md.full_name || md.name) return md.full_name || md.name;
  return email.split('@')[0].split(/[._]/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join(' ');
}

function _pwNvGiornoLabel(anno, week, g) {
  const d = isoWeekToMonday(anno, week);
  d.setUTCDate(d.getUTCDate() + g);
  const [, mm, dd] = d.toISOString().slice(0, 10).split('-');
  return PW_NV_GIORNI[g] + ' ' + dd + '/' + mm;
}

function pwOpenNoteVariazioni() {
  _pwNv.aperto = { anno: pwAnno, week: pwWeek };
  const modal = document.getElementById('pw-nv-modal');
  if (!modal) return;
  const mon = isoWeekToMonday(pwAnno, pwWeek);
  const sab = new Date(mon); sab.setUTCDate(mon.getUTCDate() + 5);
  const fmt = d => d.toISOString().slice(0, 10).split('-').reverse().join('/');
  document.getElementById('pw-nv-sub').textContent = 'Settimana ' + pwWeek + ' · ' + fmt(mon) + ' – ' + fmt(sab);

  const comp = document.getElementById('pw-nv-composer');
  if (sbCanWrite()) {
    let opts = '<option value="">Tutta la settimana</option>';
    for (let g = 0; g < 6; g++) opts += '<option value="' + g + '">' + _pwNvGiornoLabel(pwAnno, pwWeek, g) + '</option>';
    document.getElementById('pw-nv-giorno').innerHTML = opts;
    // preseleziona oggi se cade nella settimana mostrata
    const oggi = new Date(); oggi.setHours(12, 0, 0, 0);
    const diff = Math.floor((Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()) - mon.getTime()) / 86400000);
    document.getElementById('pw-nv-giorno').value = (diff >= 0 && diff <= 5) ? String(diff) : '';
    document.getElementById('pw-nv-testo').value = '';
    document.getElementById('pw-nv-err').textContent = '';
    comp.style.display = '';
    document.getElementById('pw-nv-readonly').style.display = 'none';
    pwNvSetTipo(_pwNv.tipo);
  } else {
    comp.style.display = 'none';
    document.getElementById('pw-nv-readonly').style.display = '';
  }
  modal.style.display = 'flex';
  pwNvRenderLista();
  pwNvFetch(pwAnno, pwWeek, true)
    .then(() => { pwNvRenderLista(); pwNvUpdateButton(); })
    .catch(e => {
      document.getElementById('pw-nv-lista').innerHTML =
        '<div class="text-sm text-red-600 py-6 text-center">Errore nel caricamento: ' + esc(e.message || String(e)) + '</div>';
    });
  if (sbCanWrite()) setTimeout(() => document.getElementById('pw-nv-testo').focus(), 50);
}

function pwCloseNoteVariazioni() {
  _pwNv.aperto = null;
  const modal = document.getElementById('pw-nv-modal');
  if (modal) modal.style.display = 'none';
}

function pwNvSetTipo(tipo) {
  _pwNv.tipo = tipo;
  document.querySelectorAll('#pw-nv-composer [data-nv-tipo]').forEach(b => {
    const on = b.dataset.nvTipo === tipo;
    b.classList.toggle('pw-nv-tipo-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const ta = document.getElementById('pw-nv-testo');
  if (ta) ta.placeholder = tipo === 'variazione'
    ? 'Cosa è cambiato rispetto alla programmazione? (es. "Rossi spostato da Ivrea a Biella da mercoledì")'
    : 'Scrivi una nota per la settimana…';
}

function pwNvSetFiltro(f) {
  _pwNv.filtro = f;
  pwNvRenderLista();
}

function pwNvRenderLista() {
  const box = document.getElementById('pw-nv-lista');
  if (!box || !_pwNv.aperto) return;
  const { anno, week } = _pwNv.aperto;
  const rows = _pwNv.cache[_pwNvKey(anno, week)];

  document.querySelectorAll('#pw-nv-filtri [data-nv-filtro]').forEach(b => {
    b.classList.toggle('pw-nv-filtro-on', b.dataset.nvFiltro === _pwNv.filtro);
  });
  if (!rows) {
    box.innerHTML = '<div class="text-sm text-slate-400 py-6 text-center">Caricamento…</div>';
    return;
  }
  const nNote = rows.filter(r => r.tipo === 'nota').length;
  const cnt = { tutte: rows.length, nota: nNote, variazione: rows.length - nNote };
  document.querySelectorAll('#pw-nv-filtri [data-nv-filtro]').forEach(b => {
    const c = b.querySelector('.pw-nv-cnt');
    if (c) c.textContent = cnt[b.dataset.nvFiltro];
  });

  const vis = _pwNv.filtro === 'tutte' ? rows : rows.filter(r => r.tipo === _pwNv.filtro);
  if (!vis.length) {
    box.innerHTML = '<div class="text-sm text-slate-400 py-8 text-center">'
      + (rows.length ? 'Nessun messaggio di questo tipo.' : 'La lavagna di questa settimana è vuota.') + '</div>';
    return;
  }
  const mia = (_sbUser && _sbUser.id) || '';
  box.innerHTML = vis.map(r => {
    const isVar = r.tipo === 'variazione';
    const puoCancellare = sbCanWrite() && (r.user_id === mia || sbIsAdmin());
    const giorno = (r.giorno === null || r.giorno === undefined) ? '' :
      '<span class="pw-nv-chip pw-nv-chip-giorno">📅 ' + esc(_pwNvGiornoLabel(r.anno, r.week, r.giorno)) + '</span>';
    return '<div class="pw-nv-card ' + (isVar ? 'pw-nv-card-var' : 'pw-nv-card-nota') + '">'
      + '<div class="flex items-center gap-2 mb-1.5 flex-wrap">'
      +   '<span class="pw-nv-chip ' + (isVar ? 'pw-nv-chip-var' : 'pw-nv-chip-nota') + '">' + (isVar ? '🔀 Variazione' : '📝 Nota') + '</span>'
      +   giorno
      +   (puoCancellare ? '<button class="ml-auto pw-nv-del" title="Elimina messaggio" data-nv-id="' + Number(r.id) + '" onclick="pwNvElimina(this)">🗑</button>' : '')
      + '</div>'
      + '<div class="pw-nv-testo">' + esc(r.testo) + '</div>'
      + '<div class="pw-nv-meta"><span class="font-medium text-slate-600" title="' + esc(r.autore_email) + '">'
      +   esc(r.autore_nome || r.autore_email) + '</span> · ' + esc(_pwNvDataOra(r.created_at)) + '</div>'
      + '</div>';
  }).join('');
}

async function pwNvPubblica() {
  if (!sbGuardWrite() || !_pwNv.aperto) return;
  const ta = document.getElementById('pw-nv-testo');
  const err = document.getElementById('pw-nv-err');
  const btn = document.getElementById('pw-nv-pubblica');
  const testo = ta.value.trim();
  err.textContent = '';
  if (!testo) { err.textContent = 'Scrivi qualcosa prima di pubblicare.'; ta.focus(); return; }
  if (testo.length > 2000) { err.textContent = 'Massimo 2000 caratteri (ora ' + testo.length + ').'; return; }
  const g = document.getElementById('pw-nv-giorno').value;
  const { anno, week } = _pwNv.aperto;
  btn.disabled = true;
  try {
    const { error } = await _sbClient.from(PW_NV_TABLE).insert({
      anno, week, giorno: g === '' ? null : Number(g), tipo: _pwNv.tipo, testo,
      autore_nome: _pwNvNomeUtente(),
    });
    if (error) throw error;
    ta.value = '';
    sbLogActivity('Griglia: ' + (_pwNv.tipo === 'variazione' ? 'variazione' : 'nota') + ' in lavagna', { anno, week });
    await pwNvFetch(anno, week, true);
    pwNvRenderLista();
    pwNvUpdateButton();
  } catch (e) {
    err.textContent = 'Errore nel salvataggio: ' + (e.message || String(e));
  } finally {
    btn.disabled = false;
  }
}

async function pwNvElimina(el) {
  const id = Number(el.dataset.nvId);
  if (!id || !sbGuardWrite() || !_pwNv.aperto) return;
  if (!(await showConfirmAsync('Eliminare questo messaggio dalla lavagna?', 'Elimina'))) return;
  const { anno, week } = _pwNv.aperto;
  try {
    const { data, error } = await _sbClient.from(PW_NV_TABLE).delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('puoi eliminare solo i tuoi messaggi');
    sbLogActivity('Griglia: messaggio eliminato dalla lavagna', { anno, week, id });
    await pwNvFetch(anno, week, true);
    pwNvRenderLista();
    pwNvUpdateButton();
  } catch (e) {
    showAlertModal('Impossibile eliminare il messaggio: ' + (e.message || String(e)));
  }
}

/* Realtime: un INSERT porta anno/week; un DELETE porta solo l'id, quindi svuota tutta la
   cache. Si ricarica solo la settimana che serve (mostrata in Griglia o aperta). */
function pwNvSubscribe() {
  if (_pwNv.channel || !_sbClient) return;
  try {
    _pwNv.channel = _sbClient.channel('pw-note-variazioni')
      .on('postgres_changes', { event: '*', schema: 'public', table: PW_NV_TABLE }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          delete _pwNv.cache[_pwNvKey(payload.new.anno, payload.new.week)];
        } else {
          _pwNv.cache = {};
        }
        if (_pwNv.aperto) {
          pwNvFetch(_pwNv.aperto.anno, _pwNv.aperto.week).then(() => pwNvRenderLista()).catch(() => {});
        }
        pwNvUpdateButton();
      })
      .subscribe();
  } catch (e) { console.warn('Realtime note/variazioni:', e); }
}

function pwNvUnsubscribe() {
  if (!_pwNv.channel) return;
  try { _sbClient.removeChannel(_pwNv.channel); } catch (e) {}
  _pwNv.channel = null;
  _pwNv.cache = {};
}

document.addEventListener('keydown', (e) => {
  if (!_pwNv.aperto) return;
  if (e.key === 'Escape' && !document.getElementById('modal-root').innerHTML) pwCloseNoteVariazioni();
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target && e.target.id === 'pw-nv-testo') pwNvPubblica();
});
