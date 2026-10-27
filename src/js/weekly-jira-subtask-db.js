/* ==================== GRIGLIA · SOTTOTASK JIRA GIORNALIERI (tabella) ====================
   Dalla v18.229.0 il sottotask Jira è GIORNALIERO: uno per operatore + cantiere + attività +
   giorno, così ogni operatore ha il ticket del giorno e la produzione su Jira si legge giorno
   per giorno, cantiere per cantiere. Il legame cella -> sottotask sta nella tabella Supabase
   `pw_jira_subtask` (supabase/migrations/20261027_pw_jira_subtask.sql), non più in pwData:
   con un sottotask al giorno bc.jiraSubtask sarebbe cresciuta di ~30 KB a settimana dentro
   la riga di pianificazione, che si risincronizza a ogni salvataggio.
   - I collegamenti SETTIMANALI già salvati restano in bc.jiraSubtask, chiave
     "comune|||operatore|||attività" (o "comune|||operatore", prima della v18.182.0): non si
     scrivono più, si leggono ancora e valgono per tutti i giorni della settimana.
   - Le righe della tabella si caricano tutte al login (pwJsubLoad) e si tengono aggiornate col
     Realtime: chi legge (badge in cella, Controllo Produzione, anomalie, Mappa, controllo
     sottotask) resta sincrono. Indice per anno|week|commessa, chiave
     "comune|||operatore|||attività|||giorno" (attività vuota = "comune|||operatore||||||g").
   - Chiave per NOME della commessa, come in Controllo Produzione: due blocchi della stessa
     commessa nella stessa settimana condividono la mappa (le voci sono comunque per operatore).
   - Indietro/Avanti non tocca questa tabella (come non tocca Jira): un sottotask creato resta. */

const PW_JSUB_TABLE = 'pw_jira_subtask';
const PW_JSUB_COLONNE = 'id,anno,week,commessa,cantiere,operatore,attivita,giorno,data,status,jira_key,url,message,task_key,updated_at';
const PW_JSUB_GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

const _pwJsub = {
  idx: {},        // 'anno|week|commessa' -> { mapKey: entry }
  byId: {},       // id riga -> { ik, mapKey }
  caricato: false,
  channel: null,
};

function _pwJsubIk(anno, week, commessa) { return anno + '|' + week + '|' + commessa; }

// Voce in memoria: stessa forma degli entry di bc.jiraSubtask ({status, key, url, message, ts})
// più i campi della voce, così chi legge non distingue fra le due fonti.
function _pwJsubEntry(r) {
  return {
    status: r.status, key: r.jira_key || '', url: r.url || '', message: r.message || '', ts: r.updated_at || '',
    id: r.id, cantiere: r.cantiere, operatore: r.operatore, attivita: r.attivita || '', giorno: Number(r.giorno),
    data: r.data, taskKey: r.task_key || '', _db: true,
  };
}

function _pwJsubTogliId(id) {
  const pos = _pwJsub.byId[id];
  if (!pos) return;
  const m = _pwJsub.idx[pos.ik];
  if (m && m[pos.mapKey] && m[pos.mapKey].id === id) delete m[pos.mapKey];
  delete _pwJsub.byId[id];
}

function _pwJsubApplica(r) {
  if (!r || r.id == null) return;
  _pwJsubTogliId(r.id);
  const ik = _pwJsubIk(r.anno, r.week, r.commessa);
  const mapKey = pwJiraSubtaskMapKey(r.cantiere, r.operatore, r.attivita, Number(r.giorno));
  if (!_pwJsub.idx[ik]) _pwJsub.idx[ik] = {};
  const prima = _pwJsub.idx[ik][mapKey];
  if (prima && prima.id !== r.id) delete _pwJsub.byId[prima.id];
  _pwJsub.idx[ik][mapKey] = _pwJsubEntry(r);
  _pwJsub.byId[r.id] = { ik, mapKey };
}

// Voci giornaliere di un blocco commessa in una settimana (oggetto vivo: non modificarlo).
function pwJsubVociDi(anno, week, commessa) {
  return _pwJsub.idx[_pwJsubIk(anno, week, commessa)] || {};
}

/* Tutte le righe, a pagine da 1000 (limite di PostgREST). Chiamata al login prima del primo
   pwRender, e di nuovo dopo una riconnessione del Realtime. */
async function pwJsubLoad() {
  if (!_sbClient || !_sbUser) return;
  try {
    const righe = [];
    for (let da = 0; ; da += 1000) {
      const { data, error } = await _sbClient.from(PW_JSUB_TABLE).select(PW_JSUB_COLONNE)
        .order('id', { ascending: true }).range(da, da + 999);
      if (error) throw error;
      righe.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    _pwJsub.idx = {};
    _pwJsub.byId = {};
    righe.forEach(_pwJsubApplica);
    _pwJsub.caricato = true;
  } catch (e) {
    console.warn('Sottotask Jira giornalieri: caricamento non riuscito', e);
  }
}

// Dopo un evento Realtime: badge in Griglia, controllo sottotask e Mappa. Con un debounce,
// perché creare i sottotask di una settimana manda centinaia di eventi uno dopo l'altro.
let _pwJsubVistaTimer = null;
function _pwJsubAggiornaVista() {
  clearTimeout(_pwJsubVistaTimer);
  _pwJsubVistaTimer = setTimeout(() => {
    if (typeof pwJiraSubtaskApplyBadgesToDom === 'function') pwJiraSubtaskApplyBadgesToDom();
    if (typeof mlOnDataChanged === 'function') mlOnDataChanged();
  }, 300);
}

function pwJsubSubscribe() {
  if (_pwJsub.channel || !_sbClient) return;
  try {
    _pwJsub.channel = _sbClient.channel('pw-jira-subtask')
      .on('postgres_changes', { event: '*', schema: 'public', table: PW_JSUB_TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') _pwJsubTogliId(payload.old && payload.old.id);
        else _pwJsubApplica(payload.new);
        _pwJsubAggiornaVista();
      })
      .subscribe((status) => {
        // Dopo una disconnessione gli eventi persi non tornano: si ricarica tutto.
        if (status === 'SUBSCRIBED' && _pwJsub.caricato && _pwJsub._riconnetti) {
          _pwJsub._riconnetti = false;
          pwJsubLoad().then(_pwJsubAggiornaVista);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') _pwJsub._riconnetti = true;
      });
  } catch (e) { console.warn('Realtime sottotask Jira:', e); }
}

function pwJsubUnsubscribe() {
  if (_pwJsub.channel) {
    try { _sbClient.removeChannel(_pwJsub.channel); } catch (e) {}
    _pwJsub.channel = null;
  }
  _pwJsub.idx = {};
  _pwJsub.byId = {};
  _pwJsub.caricato = false;
}

/* Salva (upsert) voci giornaliere (anno/week di default: la settimana mostrata):
   [{ anno?, week?, commessa, cantiere, operatore, attivita, giorno, status, key, url, message, taskKey }].
   Aggiorna subito la memoria con le righe restituite; in errore avvisa e rilancia. */
async function pwJsubSalva(voci) {
  if (!voci.length || !_sbClient || !_sbUser) return;
  const chi = (_sbUser && _sbUser.email) || '';
  const ora = new Date().toISOString();
  const perChiave = new Map(); // un upsert non accetta due righe con la stessa chiave
  voci.forEach(v => {
    const giorno = Number(v.giorno);
    const anno = v.anno != null ? Number(v.anno) : pwAnno, week = v.week != null ? Number(v.week) : pwWeek;
    const row = {
      anno, week, commessa: v.commessa, cantiere: v.cantiere, operatore: v.operatore,
      attivita: v.attivita || '', giorno, data: pwJsubDataIso(anno, week, giorno),
      status: v.status, jira_key: v.key || '', url: v.url || '', message: v.message || '',
      task_key: v.taskKey || '', updated_at: ora, updated_by: chi,
    };
    perChiave.set([row.commessa, row.cantiere, row.operatore, row.attivita, row.giorno].join('|||'), row);
  });
  const { data, error } = await _sbClient.from(PW_JSUB_TABLE)
    .upsert([...perChiave.values()], { onConflict: 'anno,week,commessa,cantiere,operatore,attivita,giorno' })
    .select(PW_JSUB_COLONNE);
  if (error) throw error;
  (data || []).forEach(_pwJsubApplica);
}

async function pwJsubElimina(ids) {
  const lista = (ids || []).filter(id => id != null);
  if (!lista.length || !_sbClient || !_sbUser) return;
  const { error } = await _sbClient.from(PW_JSUB_TABLE).delete().in('id', lista);
  if (error) throw error;
  lista.forEach(_pwJsubTogliId);
}

/* Sposta un sottotask giornaliero a un altro operatore (riassegnato su Jira): la riga cambia
   operatore (e attività, se in Griglia il nuovo operatore lì ne ha un'altra); un'eventuale
   voce già presente per il nuovo operatore (es. errore) si toglie. */
async function pwJsubCambiaOperatore(entry, commessa, operatore, attivita) {
  if (!entry || !entry.id || !_sbClient || !_sbUser) return;
  const att = attivita == null ? entry.attivita : attivita;
  const dest = pwJsubVociDi(pwAnno, pwWeek, commessa)[pwJiraSubtaskMapKey(entry.cantiere, operatore, att, entry.giorno)];
  if (dest && dest.id !== entry.id) await pwJsubElimina([dest.id]);
  const { data, error } = await _sbClient.from(PW_JSUB_TABLE)
    .update({ operatore, attivita: att || '', updated_at: new Date().toISOString(), updated_by: (_sbUser && _sbUser.email) || '' })
    .eq('id', entry.id).select(PW_JSUB_COLONNE);
  if (error) throw error;
  (data || []).forEach(_pwJsubApplica);
}

// Data ISO (aaaa-mm-gg) del giorno g (0 = lunedì) di una settimana.
function pwJsubDataIso(anno, week, g) {
  const d = isoWeekToMonday(anno, week);
  d.setUTCDate(d.getUTCDate() + Number(g));
  return d.toISOString().slice(0, 10);
}

// "Gio 29/10/2026": il riferimento al giorno nel titolo del sottotask.
function pwJsubGiornoLabel(anno, week, g, conAnno) {
  const [y, m, d] = pwJsubDataIso(anno, week, g).split('-');
  return PW_JSUB_GIORNI[g] + ' ' + d + '/' + m + (conAnno ? '/' + y : '');
}
