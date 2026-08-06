## v18.51.0
- feat: nuovo campo obbligatorio **"Email referente tecnico"** nei parametri delle commesse (sia pipeline che attive, una o più email separate da virgola). Il referente/i della commessa viene ora incluso automaticamente tra i destinatari quando si genera la mail di pianificazione settimanale ("Genera Mail" → "Apri Outlook"), e riportato in chiaro nel testo della mail accanto all'intestazione di ogni commessa ("👤 Referente tecnico: ..."). Le commesse già esistenti senza referente impostato mostrano un badge "⚠ referente tecnico non impostato" direttamente sulla card in Dashboard (sia Pipeline che Attive), oltre alla segnalazione già presente in Genera Mail; il salvataggio del modal di modifica resta bloccato finché il campo non viene compilato, ma i dati storici non vengono toccati finché non si modifica la commessa.

## v18.50.0
- fix: **bug di sincronizzazione multi-utente** — `sbPush()` interrompeva l'intero salvataggio non appena rilevava un conflitto sul *primo* dominio in conflitto, chiamando `sbPull()` (che sovrascrive in memoria tutti e 4 i domini) prima ancora di scrivere gli altri domini dirty dello stesso batch che non erano in conflitto. Caso concreto: griglia (planning) e ferie condividono lo stesso debounce di 500ms, quindi capita spesso che siano dirty insieme; se nel frattempo un collega aveva già salvato planning, il conflitto su planning triggerava una `sbPull()` che cancellava anche la modifica ferie non ancora salvata — silenziosamente, perché il flag dirty di ferie restava `true` e il push successivo risalvava il valore ormai ripristinato a quello remoto (nessun errore visibile, dato perso). Ora il controllo conflitti raccoglie tutti i domini in conflitto senza uscire subito, scrive immediatamente sul server i domini senza conflitto (prima di qualunque `sbPull()`), e solo dopo ricarica per i domini realmente in conflitto.

## v18.49.2
- fix: **Doppia Week** non aveva nessuna cache locale (a differenza di Griglia e Ferie): il valore viveva solo in memoria, popolato esclusivamente da `sbPull()`. Se la pagina veniva ricaricata prima che `sbPull()` finisse (rete lenta) o offline, la vista Doppia Week risultava vuota anche con dati già sincronizzati in precedenza. Ora `sbPull()` scrive anche in locale (`sbSetLocal`), un nuovo `pwDwLoad()` la rilegge all'apertura della Pianificazione Settimanale (come `pwFerieLoad()`), e ogni toggle la persiste subito in locale oltre che schedulare il push su Supabase.

## v18.49.1
- fix: "Genera Mail" — nome squadra, note squadra e strumenti/attrezzatura testo libero venivano iniettati non escapati nell'HTML del modal (a differenza di commessa e strumenti Jira, già passati per `esc()`). Una nota o un nome squadra contenente `<` o `</textarea>` rompeva il rendering del modal. Ora tutti i campi passano per `esc()`.

## v18.49.0
- feat: "Genera Mail" — nuovo pulsante "✉️ Apri Outlook (destinatari)": copia il testo della mail negli appunti e apre una nuova mail (link `mailto:`) con come destinatari le email di tutti gli operatori pianificati nella settimana (deduplicate). Serve perché incollare un tag "@email" nel corpo non attiva il meccanismo di menzione/destinatario automatico di Outlook (funziona solo digitandolo live) — il link mailto invece popola davvero il campo "A:". Operatori senza email in anagrafica vengono segnalati e esclusi dai destinatari.

## v18.48.0
- feat: "Genera Mail" — per ogni squadra, la mail ora elenca i cantieri (e le attività) della settimana in un unico elenco deduplicato ("🏗 Cantieri: ..."), invece del programma rigido giorno-per-giorno ("Lun → Cantiere A, Mar → Cantiere B"). Lascia alla squadra la libertà di organizzarsi su quale cantiere andare in quale giorno.

## v18.47.2
- fix: **bug importante di sincronizzazione multi-utente** — `sbPull()` aggiornava i dati di Pianificazione Settimanale (griglia) e Ferie scaricati da Supabase solo in memoria, senza scriverli nel local storage del browser. Poiché `pwLoad()`/`pwFerieLoad()` rileggono da lì ad ogni refresh della pagina e ogni volta che si apre/riapre il tab Pianificazione Settimanale, questa rilettura sovrascriveva silenziosamente i dati appena scaricati con l'ultima copia locale obsoleta — le modifiche fatte da un collega sparivano dopo un refresh, anche se il realtime/pull aveva funzionato. Ora `sbPull()` scrive anche in locale, come già faceva per i dati dashboard (core).

## v18.47.1
- fix: Pianificazione Settimanale — selezionando un operatore su una cella e poi aprendo il selettore operatori su un'altra squadra della **stessa** commessa, l'operatore già assegnato risultava "LIBERO" invece di "ASSEGNATO". Il controllo escludeva erroneamente l'intero blocco commessa invece della sola cella in modifica. Ora l'esclusione è limitata alla cella corrente: un operatore già usato in un'altra squadra (della stessa commessa o di un'altra) viene sempre segnalato come assegnato.

## v18.47.0
- feat: l'app ora ricorda anche l'ultima **schermata** visualizzata (Dashboard oppure Pianificazione Settimanale), non solo l'ultimo tab dentro Pianificazione Settimanale. Al refresh della pagina si riapre sulla schermata lasciata attiva.

## v18.46.1
- fix: Pianificazione Settimanale — il menu a tendina "Week" restava vuoto (nessuna settimana selezionabile) quando, all'apertura della sezione, il tab ripristinato dall'ultima sessione non era "Griglia settimanale" (es. dopo un refresh della pagina con "Controllo Produzione" come ultimo tab visitato). Il `<select>` delle settimane veniva popolato solo dal render della Griglia; ora viene ripopolato ad ogni cambio tab, indipendentemente da quale sia attivo.

## v18.46.0
- feat: Controllo Produzione — nuovo pulsante "🔄 Sincronizza squadra" accanto a "Carica Report" nell'header di ogni squadra: esegue la sincronizzazione Jira (worklog + Actual Production) solo per gli operatori di quella squadra invece che per tutta la settimana, per una sync più rapida. Il pulsante globale "Sincronizza da Jira" resta invariato e continua a sincronizzare tutte le commesse/squadre pianificate.

## v18.45.2
- fix: Controllo Produzione — "Carica Report": le righe del layer **"Note"** nel CSV contribuivano alla Lunghezza (quindi al Km/Cad), gonfiando il valore. Ora una riga con layer "Note" viene usata solo per allargare l'intervallo Inizio/Fine (quindi le "Ore Report Prod."), ma la sua Lunghezza non viene più sommata al totale km. Richiede una colonna "Layer" nel CSV (per nome se c'è intestazione, colonna 1 nel formato posizionale noto).

## v18.45.1
- fix: Pianificazione Settimanale — il banner statistiche ("Pianificati" / "Liberi" / "In ferie" / "Su più commesse") restava ancorato alla settimana vista sul tab Griglia quando si cambiava settimana stando su un altro tab (Ferie, Mappa, Controllo Produzione, Doppia Week). Ora il banner viene ricalcolato ad ogni cambio settimana indipendentemente dal tab attivo.

## v18.45.0
- feat: Controllo Produzione — nuovo pulsante "🔄" accanto alla spunta "Su Jira" di un ticket già adottato: rilegge subito l'Actual Production di quel ticket da Jira, sovrascrivendo il valore locale. Serve per il caso in cui il valore sia stato modificato direttamente su Jira dopo che l'app lo aveva già letto/scritto: la sync automatica non lo rileggerebbe più (applica solo il delta rispetto al valore adottato), quindi senza questo pulsante la modifica manuale su Jira andrebbe recuperata svuotando a mano la cella "Km/Cad". Il comportamento della sync automatica non cambia.
- fix: colonne della tabella Controllo Produzione più compatte (font, padding, testo con capo automatico invece di allargarsi all'infinito su Commessa/Cantiere/Attività, ellissi su Epic/Ticket) per ridurre la necessità di scroll orizzontale quando ci sono molti ticket per cella.

## v18.44.0
- feat: nella mail generata, gli strumenti assegnati alla squadra dalla griglia compaiono con **key + nome** (es. "GAR-218 · Disto 13"), non piu solo la key. Nell'editor mail sono mostrati come promemoria sopra il campo strumenti aggiuntivi (testo libero per attrezzatura non Jira, es. auto).

## v18.43.0
- feat: le tendine strumenti nella Griglia settimanale ora sono un menu custom con **barra di ricerca**, che si apre correttamente verso il basso (posizionamento fixed, non piu clippato dai contenitori). fix: risolta la collisione tra gli strumenti Jira (ora nel campo dedicato `strumentiJira`) e il campo testo libero "strumenti" usato dalla mail, con migrazione automatica dei dati eventualmente gia inseriti.

## v18.42.0
- feat: nella Griglia settimanale, sotto il nome di ogni squadra, si possono assegnare uno o piu strumenti (menu a discesa + "+ Strumento", rimuovibili). L'elenco strumenti e caricato da Jira (progetto GAR, tipo "Strumentazione") tramite il pulsante "Aggiorna strumenti" e messo in cache. Solo lettura da Jira; le assegnazioni si salvano nella pianificazione della settimana. Avviso visivo se lo stesso strumento e assegnato a piu squadre nella stessa settimana. Richiede la Edge Function jira-list-strumenti.

## v18.41.0
- fix: hardening escaping. Aggiunto helper globale `jsAttr()` e applicato ai pochi onclick che passano stringhe dinamiche (showKpiModal, openOperatoreModal, pwToggleStatPopover, cpToggleSq), per evitare rotture con nomi contenenti apostrofi/virgolette (es. "D'Ivrea"). Intervento mirato, non un refactor completo. Aggiunto smoke test pre-deploy in scripts/smoke_test.py.

## v18.40.0
- feat: la Pianificazione Settimanale ricorda l'ultima tab aperta (Griglia/Ferie/Mappa/Controllo/Doppia Week) e l'ultima settimana visualizzata, ripristinandole dopo il refresh (salvataggio locale). Il pulsante "Oggi" riporta comunque alla settimana corrente.

## v18.39.0
- feat: nella Griglia settimanale, gli operatori che risultano in doppia week nella settimana visualizzata mostrano un badge "🔁 DOPPIA W1/W2" (collegamento con la tab Doppia Week), così si vede subito chi è in trasferta lunga mentre si pianifica.

## v18.38.0
- feat: nella tab Doppia Week, sotto il nome di ogni operatore compare il contatore delle doppie week svolte (nel mese visualizzato e nell'intero anno), per bilanciare il carico.

## v18.37.0
- refactor: rimossi dall'header globale i pulsanti "Esporta XLSX" e "Esporta PDF" (quest'ultimo era la stampa grezza del browser, superata dai report PDF dedicati). Il selettore Anno della Dashboard è stato spostato dall'header a una barra in cima alla Dashboard stessa (dove ha effetto), con stile coerente. Nessun impatto sulle tab settimanali.

## v18.36.0
- feat: tab Doppia Week - bottone "📄 Esporta PDF" che esporta la griglia mensile (operatori × settimane) in PDF orizzontale, colorato (doppia week / ferie / conflitto) con legenda, dimensionato per stare in una sola pagina, pronto per la condivisione.

## v18.35.0
- feat: il Report PDF del Controllo Produzione include ora la colonna "Ore Report Prod." accanto a "Ore Jira" (larghezze colonne ribilanciate per farla stare in pagina).

## v18.34.2
- feat: nella tab Doppia Week l'intestazione con il numero della settimana resta visibile (sticky) durante lo scroll verticale. Il contenitore ha ora uno scroll interno (max 70vh) con header e colonna operatore fissi.

## v18.34.1
- fix: etichetta del pulsante ferie cambiata in "Tutta la Settimana". La griglia Doppia Week ora si adatta alla larghezza del contenitore (colonne elastiche minmax/1fr) invece di restare compressa a sinistra.

## v18.34.0
- feat: nella tab Ferie/Permessi, ogni riga operatore ha un pulsante "➕ Settimana" che applica le ferie a tutti i 6 giorni della settimana in un clic (e "➖ Settimana" per rimuoverle se già tutte impostate).

## v18.33.1
- fix: le assegnazioni Doppia Week ora vengono salvate su Supabase con debounce breve (500ms, come le ferie) invece di 3s. Prima, un refresh subito dopo l'inserimento poteva far perdere il dato.

## v18.33.0
- feat: nuova tab **Doppia Week** in Pianificazione Settimanale. Prospetto mensile (operatori × settimane ISO che toccano il mese) per programmare le doppie week. Click su una cella = assegna un blocco di 2 settimane consecutive (Opzione 1); la 2ª settimana riporta "rientro gio · riposo compensativo ven". Chi ha anche un solo giorno di ferie in una settimana non è assegnabile (blocco con avviso). Segnalazione visiva ⚠ per doppie week di fila (non bloccante). Conteggio operatori in doppia week per settimana. Navigazione mese ‹ ›. Dati salvati automaticamente su Supabase (staffing_state, nessun SQL da eseguire).

## v18.32.0
- feat: modello KM/Cad **per singolo ticket** (un operatore può avere produzione su più comuni lo stesso giorno). Le colonne "Km/Cad" e "Su Jira" diventano impilate e allineate ai ticket. "Carica Report": chiede con una tendina il **comune** a cui si riferisce il report e scrive il Km/Cad sul ticket di quel comune. Lettura/adozione da Jira e upload (modello delta) ora operano **per ticket**: si scrive su ogni sottotask solo la differenza rispetto all'ultimo valore scritto per quel ticket. Migrazione automatica dal modello a cella singola. Richiede le colonne Supabase km_by_ticket e km_last_by_ticket (jsonb). Nota workflow: prima "Sincronizza con Jira" (porta i ticket), poi "Carica Report".

## v18.31.1
- fix: pwSyncCpDataForGrid (chiamata a ogni render della Griglia settimanale) ora include km_jira_uploaded e km_jira_last nella select e nella cache _cpData. Prima li azzerava, col rischio che una sync successiva ricalcolasse un delta errato.

## v18.31.0
- feat: introdotto il modello "delta" per l'aggiornamento di Actual Production su Jira. Ogni cella memorizza l'ultimo valore scritto (km_jira_last) e alla sync viene applicata a Jira solo la DIFFERENZA (km_cad - km_jira_last), che puo' essere negativa. Cosi' la quota di questa app viene sostituita e non risommata, mentre eventuali valori di altra provenienza restano preservati. Lo Step 2 (lettura) adotta il valore letto come km_jira_last (delta 0). La checkbox "Su Jira" ora riflette km_jira_last valorizzato; azzerarla (con conferma) dimentica lo storico e alla sync successiva riapplica il valore pieno. Richiede la colonna Supabase km_jira_last (con migrazione dai record gia' caricati).

## v18.30.1
- fix: la sincronizzazione ora mostra il messaggio d'errore reale restituito dalle Edge Function (legge il corpo della risposta invece del generico "non-2xx"), indicando anche quale funzione ha fallito.

## v18.30.0
- feat: alla "Sincronizza con Jira", passo intermedio prima dell'upload KM: per le celle con "Km/Cad" VUOTO e un solo ticket, legge il valore attuale di "Actual Production" dal ticket e lo scrive in "Km/Cad" (solo se >0). Le celle cosi' recuperate vengono marcate come gia' caricate (flag Su Jira), per non ri-sommarle. Le celle con valore gia' presente non vengono toccate. Richiede la Edge Function jira-update-production aggiornata (supporto modalita' 'reads').

## v18.29.0
- feat: alla "Sincronizza con Jira", dopo il recupero worklog, il valore KM/CAD di ogni cella idonea viene SOMMATO al campo custom "Actual Production" del relativo sottotask (via Edge Function jira-update-production). Idonee: KM/CAD > 0, esattamente 1 ticket, flag "caricato" non ancora attivo. Celle con piu' ticket o senza ticket vengono saltate. Nuova colonna "Su Jira" con checkbox flag (km_jira_uploaded): si spunta automaticamente dopo il caricamento, non e' attivabile a mano, e si puo' rimuovere solo con conferma esplicita (riabilita il ricaricamento). Conferma richiesta prima di scrivere su Jira. Richiede la colonna Supabase km_jira_uploaded e la Edge Function jira-update-production.

## v18.28.2
- fix: corretto `ReferenceError: dataISO is not defined` in "Carica Report" (refuso variabile dateISO/dataISO) che impediva la compilazione delle celle.

## v18.28.1
- fix: "Carica Report" ora ha un parser CSV robusto (rileva delimitatore ; o , e mappa le colonne dall'intestazione), legge il file con fallback FileReader, e mostra a schermo eventuali errori invece di fallire in silenzio. Aggiunto avviso esplicito quando la settimana selezionata e' fuori dal periodo coperto dal report (con indicazione del range disponibile) e opzione per azzerare comunque.

## v18.28.0
- feat: aggiunto bottone "📄 Carica Report" a fianco di ogni squadra nel tab Controllo Produzione. Carica un CSV del report produzione e compila automaticamente "Ore Report Prod." e "KM/Cad" per gli operatori pianificati della squadra nella settimana corrente. Abbinamento operatore report<->app tramite email (parte locale prima della @). Ore = span della giornata (prima entrata -> ultima uscita) dell'operatore-fonte, uguale per tutta la squadra. Produzione = lunghezza totale (m) dell'operatore-fonte convertita in km e divisa per il numero di operatori della squadra, assegnata a tutti. Giorni senza dati nel report -> 0. Sovrascrittura con conferma.

## v18.27.0
- fix: mantenuti stato di espansione/collasso (commesse/squadre) e posizione di scroll per ciascun tab (Griglia settimanale, Ferie/Permessi, Mappa squadre, Controllo produzione) quando si passa da un tab all'altro nella Pianificazione Settimanale. Prima ogni switch di tab azzerava collapse e scroll; ora restano invariati finché non si fa il refresh della pagina.

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
| `v18.26.0` | 2026-07-23 | Report PDF: gli operatori senza cantiere assegnato per un giorno ma in **ferie** o con **attività** compilata ora compaiono comunque, con l'informazione nella nuova colonna **Altre informazioni** (dedup per operatore/giorno) |
| `v18.25.0` | 2026-07-23 | Controllo Produzione: nuovo bottone **Report PDF** — report visivo per giornata (Giorno/Data → Operatore, Cantiere, Ore Jira colorate, Ticket, Epic) impaginato con jsPDF+autotable, pensato per l'invio al PM |
| `v18.24.0` | 2026-07-23 | Controllo Produzione: nuova colonna **Verificato** (checkbox, tra Operatore e Giorno). La cella verde nella Griglia settimanale ora dipende dalla spunta "Verificato" e non più dalla semplice presenza di dati. Stato preservato dal sync Jira ed esportato in Excel |
| `v18.23.0` | 2026-07-23 | Controllo Produzione: nuova colonna **Epic** accanto a Ticket (nome + link all'epic di riferimento, risalendo la catena sottotask→story→epic via Edge Function aggiornata) |
| `v18.22.0` | 2026-07-23 | Controllo Produzione: la cella "Ore Jira" si colora automaticamente (🟢 ok / 🟠 poche / 🔴 troppo poche / 🟡 troppe) in base alle ore e al giorno (Lun/Ven soglie ridotte) |
| `v18.21.0` | 2026-07-23 | **Integrazione Jira**: Controllo Produzione ora sincronizza le ore reali dai worklog. Colonna "Ore Jira" read-only (popolata dal sync), nuova colonna "Ticket" con link cliccabili, bottone "🔄 Sincronizza da Jira" (via Edge Function jira-sync-worklogs) |
| `v18.20.0` | 2026-07-23 | Nuova tab **Email/operatore** nella sezione Dashboard: gestione email aziendale per operatore (campo nel modale + tabella editabile + seed iniziale) — fondamento per il sync worklog Jira |
| `v18.19.0` | 2026-07-21 | Griglia settimanale: celle giorno colorate in verde quando la produzione è già in Controllo Produzione (aggiornamento in tempo reale) |
| `v18.18.1` | 2026-07-10 | **HOTFIX** esc() globale mancante — fix crash showAlertModal/showConfirmAsync (ReferenceError) |
| `v18.18.0` | 2026-07-10 | Escaping HTML completo: esc() su 25+ template literals con dati utente in contesto innerHTML |
| `v18.17.0` | 2026-07-10 | Rimosso INITIAL_DATA hardcoded (52KB→0.5KB): fallback minimale, dati reali da Supabase |
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
