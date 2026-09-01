/* ===================== STORAGE (window.storage con fallback) ===================== */
const hasStorage = typeof window.storage !== 'undefined';
async function sset(k, v) {
  if (hasStorage) { try { return await window.storage.set(k, JSON.stringify(v)); } catch(e){console.warn(e);} }
  else { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
}
async function sget(k) {
  if (hasStorage) {
    try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
    catch { return null; }
  } else {
    try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
  }
}

async function loadState() {
  const keys = ['commesse_pipeline','operatori','assegnazioni','commesse_attive_extra','staffing_modificato','commesse_chiuse','commesse_attive_meta','commesse_escluse','attestati_registro'];
  const [p, o, a, ce, sm, cc, cam, cesc, areg] = await Promise.all(keys.map(sget));
  state.pipeline = p || JSON.parse(JSON.stringify(INITIAL_DATA.pipeline));
  state.operatori = o || JSON.parse(JSON.stringify(INITIAL_DATA.operatori));
  state.commesse_chiuse = cc || INITIAL_DATA._chiuse || [];
  state.commesse_escluse = cesc || INITIAL_DATA._escluse || [];

  // FIX RADICE: il blob statico INITIAL_DATA (import originale da Excel) viene
  // ricaricato integralmente ad ogni avvio — senza questo filtro, una commessa
  // chiusa/eliminata che esisteva nei dati originali tornerebbe SEMPRE visibile
  // dopo un refresh, indipendentemente da qualsiasi pulizia fatta a runtime.
  // IMPORTANTE: si usa "commesse_escluse" (lista permanente), NON "commesse_chiuse"
  // (archivio restaurabile) — eliminare una voce dall'archivio NON deve farla
  // rivivere: l'esclusione resta finché non viene esplicitamente ripristinata.
  const nomiEsclusi = new Set(
    (state.commesse_escluse || []).map(n => (n || '').trim()).filter(Boolean)
  );
  const tuttiAttivi = INITIAL_DATA.commesse_attive.concat(ce || []);
  state.commesse_attive = tuttiAttivi.filter(ca => !nomiEsclusi.has(((ca.progetto||ca.nome||'')).trim()));

  const staffingBase = sm || JSON.parse(JSON.stringify(INITIAL_DATA.staffing));
  state.staffing = staffingBase.filter(r => !nomiEsclusi.has((r.commessa||'').trim()));

  state.assegnazioni = a || INITIAL_DATA._assegnazioni || [];
  state.commesse_attive_meta = cam || INITIAL_DATA._meta || {};
  state.attestati_registro = areg || { aggiornato_il: '', file: '', da: '', dipendenti: [] };
  ricalcolaAllocOperatori();

  // Seed email operatori una-tantum (solo su quelli ancora senza email)
  if (seedEmailOperatori()) {
    try { await sset('operatori', state.operatori); _sbDirty.core = true; } catch(e) { console.warn('seed email save', e); }
  }
}
async function saveState(logAction, logDetails, immediate) {
  _sbDirty.core = true;
  await Promise.all([
    sset('commesse_pipeline', state.pipeline),
    sset('operatori', state.operatori),
    sset('assegnazioni', state.assegnazioni),
    sset('staffing_modificato', state.staffing),
    sset('commesse_chiuse', state.commesse_chiuse),
    sset('commesse_attive_meta', state.commesse_attive_meta),
    sset('commesse_escluse', state.commesse_escluse),
    sset('attestati_registro', state.attestati_registro),
  ]);
  // Log attività se specificata
  if (logAction) sbLogActivity(logAction, logDetails || {});
  if (immediate) {
    // Operazione critica/distruttiva: push immediato, bypassa il debounce
    clearTimeout(_sbAutoPushTimer);
    await sbPush();
  } else {
    // Auto-push su Supabase con debounce 3s
    sbScheduleAutoPush();
  }
}
async function resetAll() {
  if (!await showConfirmAsync('Reset completo: tutte le modifiche manuali andranno perse. Procedere?', 'Reset')) return;
  if (hasStorage) {
    for (const k of ['commesse_pipeline','operatori','assegnazioni','commesse_attive_extra','staffing_modificato','commesse_chiuse','commesse_attive_meta','commesse_escluse','attestati_registro']) {
      try { await window.storage.delete(k); } catch{}
    }
  } else {
    sessionStorage.clear();
  }
  location.reload();
}

/* Ricalcola alloc_mensile e saturazione di ogni operatore in base allo staffing corrente */
function ricalcolaAllocOperatori() {
  const allocMap = {};
  state.operatori.forEach(op => { allocMap[op.nome_esteso] = new Array(12).fill(0); });
  state.staffing.forEach(r => {
    if (!allocMap[r.risorsa]) allocMap[r.risorsa] = new Array(12).fill(0);
    for (let i=0; i<12; i++) {
      allocMap[r.risorsa][i] += Number(r.mesi[i]) || 0;
    }
  });
  state.operatori.forEach(op => {
    op.alloc_mensile = allocMap[op.nome_esteso] || new Array(12).fill(0);
    op.saturazione = op.alloc_mensile.map((g, i) => {
      const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
      return gl > 0 ? Math.round((g/gl)*1000)/1000 : 0;
    });
  });
}

/* ===================== UTILS ===================== */
function monthsBetween(inizio, fine) {
  // ritorna gli indici mese 0..11 per ANNO
  if (!inizio || !fine) return [];
  const d1 = new Date(inizio), d2 = new Date(fine);
  const out = [];
  for (let i=0; i<12; i++) {
    const start = new Date(ANNO, i, 1);
    const end = new Date(ANNO, i+1, 0);
    if (end >= d1 && start <= d2) out.push(i);
  }
  return out;
}

function operatoreSatPeriodo(op, mesiIdx) {
  // Solo mesi correnti/futuri: i passati non vincolano il planning
  const mesi = soloFuturi(mesiIdx);
  if (mesi.length === 0) return 0;
  let extraPerMese = new Array(12).fill(0);
  state.assegnazioni.filter(a => a.operatore_id === op.id).forEach(a => {
    const c = state.pipeline.find(p => p.id === a.commessa_id);
    if (!c) return;
    monthsBetween(c.inizio, c.fine).forEach(i => { extraPerMese[i] += INITIAL_DATA.giorni_lavorativi[i] || 20; });
  });
  let s = 0;
  for (const i of mesi) {
    const gl = INITIAL_DATA.giorni_lavorativi[i] || 20;
    s += (op.alloc_mensile[i] + extraPerMese[i]) / gl;
  }
  return s / mesi.length;
}

function satColor(sat) {
  if (sat <= 0.80) return 'var(--green)';
  if (sat <= 0.95) return 'var(--yellow)';
  if (sat <= 1.05) return 'var(--orange)';
  return 'var(--red)';
}

function satColorClass(sat) {
  if (sat <= 0.80) return 'bg-emerald-500';
  if (sat <= 0.95) return 'bg-amber-500';
  if (sat <= 1.05) return 'bg-orange-500';
  return 'bg-red-500';
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('it-IT', {day:'2-digit', month:'short', year:'numeric'});
}

