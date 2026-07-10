# Dashboard Staffing — Eagleprojects

Applicazione web per la gestione dello staffing e della pipeline commerciale del dipartimento rilievi.

🔗 **[Apri il Dashboard](https://mmarchetti95.github.io/Gestione-Staffing/)**

---

## Funzionalità

- 📊 **Pipeline commerciale** — gestione commesse in fase di offerta con probabilità e valore
- 👷 **Operatori** — anagrafica con skill badge (WO, MMS, LIXEL, DRONE, GPS, LASER, ROBOT, GRD)
- 📅 **Staffing mensile** — allocazione gg-uomo per commessa, saturazione e gap analysis
- 🗓️ **Pianificazione settimanale** — composizione squadre, assegnazione cantieri, gestione ferie
- 🗺️ **Mappa cantieri** — visualizzazione geografica delle commesse attive
- 📈 **Gantt** — timeline visiva pipeline e commesse attive
- ☁️ **Sync automatico** — ogni modifica viene salvata su database cloud (Supabase) in tempo reale
- 🔑 **Cambio password** — ogni utente può cambiare la propria password dal banner sync
- 📋 **Log attività** — pannello admin con storico di tutte le modifiche (solo amministratori)
- 🔒 **Riconciliazione nomi** — sezione debug visibile solo agli amministratori

---

## Accesso

Il dashboard è protetto da login con credenziali personali.  
Per richiedere un account contattare l'amministratore.

### Ruoli utente
| Ruolo | Accesso |
|---|---|
| Utente standard | Dashboard completo, modifica dati, cambio password |
| Admin | Come sopra + log attività + sezione riconciliazione nomi |

Per assegnare il ruolo admin — SQL Editor su Supabase:
```sql
UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb WHERE email = 'email@esempio.it';
```

---

## Stack tecnico

| Componente | Tecnologia |
|---|---|
| Frontend | HTML + Tailwind CSS + Chart.js + Leaflet.js |
| Hosting | GitHub Pages |
| Database / Auth | Supabase (PostgreSQL) |
| Aggiornamento | Push su branch `main` → deploy automatico |

---

## File nella repo

| File | Descrizione |
|---|---|
| `index.html` | Applicazione completa (single-file) |
| `SETUP_SUPABASE_GITHUB.md` | Guida setup iniziale Supabase + GitHub Pages |
| `README.md` | Questo file |
| `backups/` | Backup versioni precedenti |

---

## Changelog

| Versione | Data | Modifiche |
|---|---|---|
| `v18.16.0` | 2026-07-10 | Supabase Realtime: auto-pull in tempo reale quando un altro utente salva |
| `v18.15.0` | 2026-07-10 | Sync multi-dominio: stato suddiviso in core/planning/ferie con conflict detection granulare + migrazione automatica |
| `v18.14.0` | 2026-07-10 | Rimossa switchScreen duplicata; unificata funzione globale con gestione btn-presentation |
| `v18.13.0` | 2026-07-10 | Sostituiti tutti confirm() e alert() nativi (31 punti) con modali custom showConfirmAsync/showAlertModal |
| `v18.12.0` | 2026-07-09 | Controllo Produzione: esclusi operatori senza cantiere o in ferie per quel giorno |
| `v18.6.7` | 2026-06-26 | Fix selettore Week/Anno non si aggiornava nelle tab Ferie e Mappa |
| `v18.6.6` | 2026-06-26 | Fix header dates aggiornato in tutte le tab al cambio settimana |
| `v18.6.5` | 2026-06-26 | Fix persistenza dati pwData/pwFerie (push 500ms), fix griglia prev/next, label week in mappa |
| `v18.6.4` | 2026-06-26 | Fix perdita dati pw al refresh, fix tasto Oggi, fix prev/next aggiornano tab attiva |
| `v18.6.3` | 2026-06-26 | Fix persistenza pwData/pwFerie, fix cambio week su ferie/mappa, fix switchScreen con pwLoad |
| `v18.6.2` | 2026-06-26 | Fix cambio settimana aggiorna tab attiva (ferie/mappa/griglia) |
| `v18.6.1` | 2026-06-25 | Fix visibilità log/riconciliazione non-admin, fix header con visibility invece di display |
| `v18.6.0` | 2026-06-25 | Riconciliazione nomi visibile solo admin, modalità presentazione solo in Dashboard |
| `v18.5.1` | 2026-06-25 | Fix log admin (rilettura sessione getUser), fix colore select anno |
| `v18.5.0` | 2026-06-25 | Log attività admin — pannello con storico modifiche, tracciamento commesse e operatori |
| `v18.4.0` | 2026-06-25 | Cambio password utente dal banner sync |
| `v18.3.0` | 2026-06-25 | Card con ombra morbida, tabelle più ariose, input con focus accent cyan |
| `v18.2.0` | 2026-06-25 | Restyling palette Eagleprojects — header scuro, accent cyan #00b8b0 |
| `v18.1.0` | 2026-06-25 | Selettore anno dinamico — si aggiorna automaticamente ogni anno |
| `v18.0.0` | 2026-06-25 | Migrazione a Supabase + GitHub Pages, login utenti, rimozione pulsanti Reset/Salva HTML/Importa XLSX |

---

## Note tecniche per sviluppo futuro

- Sempre scaricare `index.html` via GitHub API prima di modificare (per avere SHA aggiornato)
- Workflow per ogni modifica: backup in `backups/` → modifica → push `index.html` → aggiorna README
- Credenziali Supabase: URL e anon key già inserite nel file `index.html`
- Admin role: assegnato via SQL su `auth.users.raw_user_meta_data`, letto con `auth.jwt() -> 'user_metadata' ->> 'role'`
- `window.confirm()` non funziona in iframe — usare sempre `showConfirm()` custom
- Nested template literals causano errori JS — usare concatenazione + attributi `data-`

---

*Versione attuale: **v18.12.0** — Michele Marchetti*
