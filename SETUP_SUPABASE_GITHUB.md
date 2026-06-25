# Setup Dashboard Staffing v18
## Supabase + GitHub Pages — Guida completa (~45 minuti)

---

## PARTE 1 — Crea il progetto Supabase (15 min)

### 1.1 Crea account e progetto
1. Vai su **https://supabase.com** → "Start your project" → registrati (gratuito)
2. Clicca **"New project"**
3. Scegli un nome: `dashboard-staffing`
4. Scegli una password per il database (salvala, ma non ti servirà spesso)
5. Regione: **Central EU (Frankfurt)** — la più vicina all'Italia
6. Clicca **"Create new project"** — attendi ~2 minuti

### 1.2 Crea la tabella dati
Vai su **Table Editor** → **"New table"** e configura:

| Campo | Valore |
|-------|--------|
| Name | `staffing_state` |
| Enable Row Level Security | ✅ Sì |

Colonne da aggiungere (oltre a `id` già presente):

| Nome | Tipo | Default |
|------|------|---------|
| `payload` | `jsonb` | `{}` |
| `updated_at` | `timestamptz` | `now()` |

Clicca **Save**.

### 1.3 Inserisci la riga iniziale
Vai su **Table Editor** → `staffing_state` → **"Insert row"**:
- `id`: `1`
- `payload`: `{}`
- `updated_at`: lascia il default

### 1.4 Configura Row Level Security (RLS)
Vai su **Authentication** → **Policies** → tabella `staffing_state` → **"New Policy"**:

**Policy 1 — Lettura per utenti autenticati:**
- Policy name: `allow_read`
- Allowed operation: `SELECT`
- Target roles: `authenticated`
- USING expression: `true`

**Policy 2 — Scrittura per utenti autenticati:**
- Policy name: `allow_write`
- Allowed operation: `ALL`
- Target roles: `authenticated`
- USING expression: `true`

### 1.5 Crea gli account utenti
Vai su **Authentication** → **Users** → **"Invite user"**:
- Inserisci l'email di ogni collega
- Supabase manda un'email con il link per impostare la password

Ripeti per tutti i 3-4 utenti.

### 1.6 Copia le credenziali API
Vai su **Settings** → **API**. Ti servono:
- **Project URL** → es. `https://xyzabcdef.supabase.co`
- **anon / public key** → stringa lunga che inizia con `eyJ...`

---

## PARTE 2 — Configura il file HTML (5 min)

Apri `dashboard_staffing_v18.html` con un editor di testo (Notepad++, VS Code, ecc.).

Cerca queste due righe in cima al blocco JavaScript (~riga 883):

```javascript
const SB_URL = 'INSERISCI_SUPABASE_URL';
const SB_ANON_KEY = 'INSERISCI_SUPABASE_ANON_KEY';
```

Sostituisci con i tuoi valori reali:

```javascript
const SB_URL = 'https://xyzabcdef.supabase.co';
const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Salva il file.

---

## PARTE 3 — Pubblica su GitHub Pages (15 min)

### 3.1 Crea il repository
1. Vai su **https://github.com** → accedi (o registrati, è gratuito)
2. Clicca **"New repository"**
3. Nome: `dashboard-staffing`
4. Visibilità: **Private** ⚠️ (il file contiene la chiave Supabase)
5. Clicca **"Create repository"**

### 3.2 Carica il file HTML
Nel repository appena creato:
1. Clicca **"Add file"** → **"Upload files"**
2. Carica `dashboard_staffing_v18.html`
3. **Rinomina il file in `index.html`** prima di fare commit
   (oppure fallo subito: nel repo clicca sul file → matita → rinomina)
4. Clicca **"Commit changes"**

### 3.3 Abilita GitHub Pages
1. Vai su **Settings** → **Pages** (menu sinistro)
2. Source: **Deploy from a branch**
3. Branch: `main` → cartella `/` (root)
4. Clicca **Save**

Dopo ~2 minuti il sito sarà online all'indirizzo:
`https://TUOUSERNAME.github.io/dashboard-staffing/`

### 3.4 URL fisso — comunicalo al team
Questo URL non cambia mai. Per aggiornare il dashboard basta sostituire `index.html` nel repo.

---

## PARTE 4 — Migra i dati esistenti (5 min)

Se hai dati importanti nella versione locale attuale:

1. **Apri la vecchia versione** del dashboard nel browser
2. Apri la console del browser (F12 → Console)
3. Esegui questo comando per esportare i dati:
```javascript
const keys = ['commesse_pipeline','operatori','assegnazioni','commesse_attive_extra','staffing_modificato','commesse_chiuse','commesse_attive_meta'];
const data = {};
keys.forEach(k => { try { data[k] = JSON.parse(sessionStorage.getItem(k)); } catch{} });
console.log(JSON.stringify(data));
```
4. Copia il JSON risultante
5. Vai su Supabase → Table Editor → `staffing_state` → modifica la riga 1 → incolla nel campo `payload`

---

## Riepilogo finale

| Cosa | Dove |
|------|------|
| URL dashboard | `https://TUOUSERNAME.github.io/dashboard-staffing/` |
| Dati | Supabase → tabella `staffing_state` |
| Aggiornare il codice | Sostituire `index.html` su GitHub |
| Aggiungere utenti | Supabase → Authentication → Users |
| Backup dati | Supabase → Table Editor → Export CSV |

---

## Problemi comuni

**"Invalid login credentials"** → controlla email e password, o reinvita l'utente da Supabase

**"Failed to fetch"** → controlla che SB_URL e SB_ANON_KEY siano corretti nel file HTML

**La pagina non carica** → attendi 2-3 minuti dopo aver abilitato GitHub Pages

**Dati non aggiornati** → clicca il pulsante "↺ Sincronizza" nel banner in alto
