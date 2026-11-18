/* ==================== UTENTI QFIELD ↔ OPERATORI (since v18.275.0) ==================== */
/* Chi ha prodotto un dato della board QField o del CSV report si riconosce dall'utente QField
   (es. «hsemry»), che di solito è la parte prima della @ dell'email aziendale. Non sempre:
   hsemry ↔ hsmsemry@, ccica01 ↔ ccica@, mminoia ↔ mmaroneminoia@, gfrenguellotti ↔ gfrenguellotti2@.
   Prima quei dati non si abbinavano a nessuno e i Km del giorno andavano persi in silenzio.
   Ordine di abbinamento di un utente QField:
   1. esatto: «Utente QField» impostato a mano sull'operatore (op.utente_qfield, anche più di uno
      separati da virgola) oppure parte locale dell'email;
   2. automatico, solo se nessuno lo ha in modo esatto:
      - uguale alla parte locale dell'email senza le cifre finali (ccica01 ↔ ccica);
      - iniziali + cognome dal nome dell'operatore (hsemry = H[azem] + Semry, sdenicola = S + De Nicola,
        anche nome intero + cognome); cognome di almeno 4 lettere.
   Un abbinamento automatico che porta a più operatori vale solo se fra quelli della squadra ne
   resta uno; altrimenti è «ambiguo» e non si usa (si imposta «Utente QField» a mano). Puro: legge
   state.operatori / state.fornitori, non scrive niente. */

function qfuNorm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function qfuSenzaCifre(s) { return qfuNorm(s).replace(/\d+$/, ''); }

// Utenti QField impostati a mano su un operatore o dipendente (stringa "a, b" o array).
function qfuEspliciti(o) {
  const v = o && o.utente_qfield;
  const arr = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/);
  return arr.map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
}

// Elenco di tutti quelli che possono avere un utente QField: pool interno + dipendenti fornitore.
function qfuOperatori() {
  const out = [], visti = new Set();
  const add = (nome, email, espl) => {
    nome = String(nome || '').trim();
    if (!nome || visti.has(nome)) return;
    visti.add(nome);
    const em = String(email || '').trim().toLowerCase();
    const locale = em.includes('@') ? em.split('@')[0] : '';
    const esatti = new Set(espl);
    if (locale) esatti.add(locale);
    out.push({ nome, locale, esplicito: new Set(espl), esatti,
      token: nome.split(/[\s'’.\-]+/).map(qfuNorm).filter(Boolean) });
  };
  (state.operatori || []).forEach(o => add(o.nome_esteso || o.nome_breve || o.nome, o.email, qfuEspliciti(o)));
  (state.fornitori || []).forEach(f => (f.dipendenti || []).forEach(d => add(d.nome_esteso, d.email, qfuEspliciti(d))));
  return out;
}

/* u (già senza cifre finali) = prefisso + cognome, dove il cognome è una sequenza contigua di
   parole del nome (≥ 4 lettere in tutto) e il prefisso sono le iniziali di altre parole del nome
   (in qualunque ordine, ognuna una volta) oppure altre parole intere contigue. */
function qfuDalNome(u, token) {
  if (!u || u.length < 5 || token.length < 2) return false;
  const n = token.length;
  for (let i = 0; i < n; i++) {
    let cognome = '';
    for (let j = i; j < n; j++) {
      cognome += token[j];
      if (cognome.length < 4 || !u.endsWith(cognome) || u.length === cognome.length) continue;
      const pref = u.slice(0, u.length - cognome.length);
      const altri = token.filter((_, k) => k < i || k > j);
      if (!altri.length) continue;
      // iniziali
      if (pref.length <= altri.length) {
        const liberi = altri.slice();
        const ok = [...pref].every(c => {
          const k = liberi.findIndex(t => t[0] === c);
          if (k < 0) return false;
          liberi.splice(k, 1);
          return true;
        });
        if (ok) return true;
      }
      // parole intere contigue (es. «marcoperuzzi»)
      for (let a = 0; a < altri.length; a++) {
        let s = '';
        for (let b = a; b < altri.length; b++) { s += altri[b]; if (s === pref) return true; }
      }
    }
  }
  return false;
}

function qfuSimile(u, op) {
  const us = qfuSenzaCifre(u);
  if (!us) return false;
  if (op.locale && qfuSenzaCifre(op.locale) === us) return true;
  return qfuDalNome(us, op.token);
}

/* Abbina gli utenti QField presenti nei dati agli operatori.
   utenti: elenco di utenti QField (come compaiono nei dati); preferiti: nomi degli operatori
   della squadra (servono a sciogliere un abbinamento automatico che porta a più persone).
   → { perUtente: { u: { nomi: [..], come: 'esplicito'|'email'|'auto' } },
       ambigui: [{ utente, nomi }] } */
function qfuAbbina(utenti, preferiti) {
  const ops = qfuOperatori();
  const pref = new Set(preferiti || []);
  const perUtente = {}, ambigui = [];
  [...new Set((utenti || []).map(u => String(u || '').trim().toLowerCase()).filter(Boolean))].forEach(u => {
    let cand = ops.filter(o => o.esatti.has(u));
    let come = cand.some(o => o.esplicito.has(u)) ? 'esplicito' : 'email';
    if (!cand.length) {
      cand = ops.filter(o => qfuSimile(u, o));
      come = 'auto';
      if (cand.length > 1 && pref.size) {
        const inSq = cand.filter(o => pref.has(o.nome));
        if (inSq.length) cand = inSq;
      }
      if (cand.length > 1) {
        // Ambiguo: conta solo se tocca la squadra (gli altri non interessano a questo import).
        if (!pref.size || cand.some(o => pref.has(o.nome))) ambigui.push({ utente: u, nomi: cand.map(o => o.nome) });
        return;
      }
    }
    if (cand.length) perUtente[u] = { nomi: cand.map(o => o.nome), come };
  });
  return { perUtente, ambigui };
}

// Utenti QField (fra quelli abbinati) di un operatore.
function qfuUtentiDi(abb, nome) {
  return Object.keys(abb.perUtente).filter(u => abb.perUtente[u].nomi.includes(nome));
}

// "hsemry → Semry Hazem Said Mohamed (email hsmsemry)" per gli abbinamenti automatici dei nomi dati.
function qfuDescriviAuto(abb, nomi) {
  const set = new Set(nomi || []);
  const ops = qfuOperatori();
  return Object.keys(abb.perUtente).filter(u => abb.perUtente[u].come === 'auto' && abb.perUtente[u].nomi.some(n => set.has(n)))
    .sort().map(u => {
      const nome = abb.perUtente[u].nomi[0];
      const o = ops.find(x => x.nome === nome);
      return u + ' → ' + nome + (o && o.locale ? ' (email ' + o.locale + '@)' : ' (senza email)');
    });
}

// Si può riconoscere l'utente QField di questo operatore (email o «Utente QField»)?
function qfuHaRiferimento(nome) {
  const o = qfuOperatori().find(x => x.nome === nome);
  return !!(o && o.esatti.size);
}
