# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Utenti primari: staff ufficio Eagleprojects (dipartimento rilievi/surveying) — pianificatori e project manager che usano Dashboard e Pianificazione Settimanale da desktop in ufficio per gestire pipeline commerciale, staffing e pianificazione squadre. Un sottoinsieme ha ruolo admin (`sbIsAdmin()`), con accesso a log attività, sessioni attive e riconciliazione nomi. L'uso da mobile/tablet sul campo da parte di capisquadra/operatori non è stato confermato come caso d'uso primario in questo giro di interviste — non va escluso a priori (l'app è iframe-safe e alcune viste come Griglia/Ferie/Mappa potrebbero comunque finire aperte da mobile), ma il restyling non deve essere guidato da quell'ipotesi finché non confermata.

## Product Purpose

Gestione integrata di staffing e pipeline commerciale per il dipartimento rilievi di Eagleprojects: due schermate nello stesso file/stato — Dashboard (pipeline commerciale, anagrafica operatori con skill/certificazioni, allocazione mensile gg-uomo, Gantt, KPI, mappa cantieri attivi, mapping email/Jira, log admin) e Pianificazione Settimanale (griglia squadra/cantiere/strumenti, ferie, mappa, controllo produzione sincronizzato con Jira worklog, doppia week per trasferte consecutive).

## Positioning

Strumento interno mono-tenant per un singolo reparto aziendale, non un prodotto competitivo sul mercato — non esiste un "cliente" da convincere, il successo si misura in efficienza operativa e correttezza dei dati (sincronizzazione multi-utente, coerenza con Jira) per chi già lo usa quotidianamente.

## Operating Context

- Hosting: GitHub Pages, nessun backend proprio — persistenza su Supabase (Postgres + Auth + Realtime + Edge Functions).
- L'app può girare embeddata in iframe (vincolo noto: `window.confirm()` nativo fallisce in iframe, da qui l'uso obbligato di modali custom `showAlertModal`/`showConfirmAsync`).
- Integrazione Jira in lettura (liste strumenti, worklog) e in scrittura delta su un solo custom field (Actual Production).
- Sincronizzazione realtime multi-utente su 4 domini di stato indipendenti (core, planning, ferie, doppia week), con rilevamento conflitti — un restyling non deve introdurre percezioni di stato "sporche" (es. spinner/skeleton che nascondano conflitti reali).
- Viste dati-intensive: Controllo Produzione, Gantt, KPI e le tabelle della Griglia settimanale sono tabelle fitte con molte colonne — la densità informativa è un requisito esplicito da preservare, non un difetto da "arieggiare" a scapito dei dati visibili per riga/schermata.

## Capabilities and Constraints

- Single-file deployment: `index.html` è generato da `scripts/build.py` a partire da `src/head.html` + `src/js/*.js` + `src/tail.html`; ogni modifica va fatta in `src/`, mai su `index.html` direttamente, poi rigenerata e verificata con `scripts/smoke_test.py`.
- No bundler, no framework — HTML/CSS/JS inline, Tailwind via CDN `<script>`, niente componenti di terze parti oltre a quelli già presenti (xlsx, jspdf, leaflet, supabase-js).
- Vincoli hard-won da rispettare in ogni modifica (violarli ha causato regressioni reali, changelog v18.13–v18.18/v18.41): niente `alert()`/`confirm()`/`prompt()` nativi; escaping obbligatorio (`jsAttr()`/`esc()`) di ogni stringa dinamica dentro `onclick="..."`; evitare template literal annidati; nessun nome di funzione top-level duplicato.
- Densità delle tabelle: dimensioni di font/padding compatti nelle viste dati (es. Controllo Produzione) sono scelte deliberate per ridurre lo scroll orizzontale, non un debito di design da "sistemare" con più spaziatura.
- Uso mobile/campo: non confermato come requisito primario in questo giro — trattare come ipotesi aperta, non come vincolo di progettazione hard.
- Accessibilità: nessuno standard formale (es. WCAG) imposto dall'azienda; buon contrasto/leggibilità restano comunque desiderabili come buona pratica, non come requisito di conformità.

## Brand Commitments

Nessun vincolo di brand aziendale stringente confermato: l'utente ha indicato "libertà quasi totale" sul restyling, incluso l'accento teal (#00b8b0) attualmente in uso, che è una scelta pregressa e non un elemento di identità aziendale da preservare.

## Evidence on Hand

Nessun asset di brand (logo, guideline) fornito o noto. Riferimento visivo esistente: `index.html`/`src/head.html` (CSS inline, palette CSS custom properties in `:root`, Tailwind utility classes), changelog dettagliato in `README.md` (v18.x) che documenta l'evoluzione funzionale ma non decisioni di design.

## Product Principles

1. La correttezza e la freschezza dei dati (sync multi-utente, coerenza con Jira) vengono prima dell'estetica: nessuna modifica visiva deve mascherare o rallentare la percezione dello stato reale dei dati.
2. Densità informativa oltre "arieggiamento": per un tool operativo usato da poche persone esperte più volte al giorno, mostrare più dati per schermata batte un layout più minimale ma con più scroll/click.
3. Coerenza incrementale: essendo un file generato da sorgenti modulari (`src/js/*.js`) senza bundler, il design system deve restare esprimibile in CSS inline/Tailwind-CDN, senza introdurre dipendenze da build step aggiuntivi.
4. Nessuna regressione sui vincoli hard-won (escaping, no native dialog, no duplicate function names) — ogni proposta di restyling passa comunque per `scripts/smoke_test.py`.
5. Il pubblico è interno e ristretto (staff ufficio + admin Eagleprojects): ottimizzare per efficienza ed expertise crescente nel tempo, non per onboarding di utenti nuovi/anonimi.

## Accessibility & Inclusion

Nessun requisito formale stabilito dall'azienda in questo giro di interviste. Non fabbricare uno standard (es. "WCAG AA") come se fosse un vincolo confermato: trattare buon contrasto e leggibilità come buona pratica di default nel restyling, senza presentarlo come requisito di conformità.
