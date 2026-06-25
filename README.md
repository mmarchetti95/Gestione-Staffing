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

---

## Accesso

Il dashboard è protetto da login con credenziali personali.  
Per richiedere un account contattare l'amministratore.

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
| `v18.3.0` | 2026-06-25 | Card con ombra morbida, tabelle più ariose, input con focus accent cyan |
| `v18.2.0` | 2026-06-25 | Restyling palette Eagleprojects — header scuro, accent cyan #00b8b0 |
| `v18.1.0` | 2026-06-25 | Selettore anno dinamico — si aggiorna automaticamente ogni anno |
| `v18.0.0` | 2026-06-25 | Migrazione a Supabase + GitHub Pages, login utenti, rimozione pulsanti Reset/Salva HTML/Importa XLSX, versione e autore nell'header |

---

*Versione attuale: **v18.3.0** — Michele Marchetti*
