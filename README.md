## v18.91.2
- fix: **Griglia settimanale — meteo non si aggiornava subito dopo aver digitato un cantiere** — modificare il testo di un campo cantiere (`onchange`) salvava il dato ma non richiamava il refresh meteo (a differenza di aggiungere/rimuovere un campo con "+ cantiere", che passa da un render completo), per cui il badge/modal meteo si aggiornava solo al refresh orario automatico o a un altro render. Ora la modifica del testo del cantiere richiama subito `pwRefreshMeteoWeek()` (fire-and-forget, senza un render completo che farebbe perdere il focus).

## v18.91.1
- fix: **Griglia settimanale — meteo, dettaglio orario mancante per un cantiere su più cantieri della squadra** — se la fetch meteo di una località finiva in cache con il solo aggregato giornaliero ma senza il dettaglio orario (es. per un errore transitorio di Open-Meteo su quella specifica chiamata), la cache veniva comunque considerata "fresca" per l'intera durata del TTL (1 ora) e non veniva più ritentata, mostrando nel modal "dettaglio orario non disponibile" per quel cantiere. Ora una entry senza dettaglio orario non è considerata fresca e viene ritentata al refresh successivo.

## v18.91.0
- feat: **Griglia settimanale — meteo cantieri e più cantieri nello stesso giorno** — ogni cella operatore/giorno può ora avere più campi "cantiere" (pulsante "+ cantiere"), per chi nella stessa giornata lavora su più zone. Sopra ogni giorno di ogni squadra compare un badge meteo (icona + temperatura, [Open-Meteo](https://open-meteo.com), gratuito senza API key) relativo al/ai cantiere/i pianificati quel giorno per la squadra, aggiornato automaticamente ogni ora; se i cantieri della squadra quel giorno sono più di uno, il badge è cliccabile e apre un modal con il meteo per ciascuna zona. La localizzazione riusa il geocoder Nominatim già usato dalla Mappa (nessun validatore di comuni: se un cantiere non è geocodificabile, semplicemente non genera un badge). Il campo "cantiere" ora è un elenco anche per Mappa, email riepilogo settimanale, Controllo Produzione e creazione sottotask Jira (un operatore con più cantieri lo stesso giorno genera un pin/voce email per ciascuno e, per i sottotask, un sottotask per comune) — nessuna modifica allo schema Supabase, i dati delle settimane già salvate restano compatibili.

## v18.90.0
- feat: **Genera mail — cognomi squadra nell'intestazione** — la riga "🟡 Nome squadra" nel testo generato da "Genera mail" riporta ora anche i cognomi degli operatori assegnati (stesso formato "Nome squadra: Cognome1, Cognome2" introdotto in griglia in v18.89.0/v18.89.1), per coerenza tra la griglia e il testo copiato/inviato via mail.

## v18.89.1
- fix: **Griglia settimanale — cognomi squadra attaccati al nome squadra** — l'etichetta con i cognomi (introdotta in v18.89.0) veniva stampata subito dopo il testo digitato nel campo "Nome squadra…", perché quel campo era a larghezza piena (`flex-1`) ma il testo occupava solo una parte della sua larghezza reale, senza un separatore visivo. Ora il campo ha una larghezza fissa più contenuta e l'etichetta cognomi è preceduta da "`: `" con un margine dedicato, leggibile come "Nome squadra: Cognome1, Cognome2".

## v18.89.0
- feat: **Griglia settimanale — badge localizzazione accanto al nome operatore** — ogni riga operatore nella Griglia mostra ora, accanto al nome, la provincia (o la regione se la provincia non è nota) di provenienza — stessa informazione già disponibile nel modal di selezione operatore, ora visibile direttamente in griglia senza doverlo aprire.
- feat: **Griglia settimanale — cognomi squadra accanto al nome squadra** — l'header di ogni blocco squadra mostra ora, accanto al campo libero "Nome squadra…", un'etichetta a sola lettura con i cognomi degli operatori correntemente assegnati (dedotti dal campo "Cognome" anagrafico, o dall'ultima parola del nome esteso se non compilato), aggiornata automaticamente ad ogni assegnazione/rimozione. Il campo nome squadra resta libero e non viene mai sovrascritto.
- fix: **Salvataggio operatore e commessa attiva — rischio di perdita modifiche se si naviga via subito dopo il salvataggio** — "Nuovo/Modifica operatore" e "Salva/Reset metadati" della modale Commessa attiva scrivevano lo stato solo in locale e demandavano l'invio a Supabase al debounce di auto-push (3s); senza un flush alla chiusura pagina, chiudere/ricaricare la scheda entro quei 3s faceva sì che la modifica non arrivasse mai al database, pur risultando "salvata" localmente. Questi due salvataggi ora forzano il push immediato (stesso pattern già usato per eliminazione/licenziamento operatore e chiusura commessa).

## v18.88.2
- fix: **Sottotask Jira — "Nessun risultato" nella scelta del Task sotto un Epic** — `jira-list-tasks` filtrava di default su `issuetype = "Task"`, ma sul progetto testato dall'utente il tipo del livello sotto l'Epic non è "Task" (osservato empiricamente: varia da progetto a progetto, es. "Story"). Rimosso il filtro per issuetype di default: ora vengono mostrati tutti i figli diretti dell'Epic (via campo `parent`), con l'issuetype indicato tra parentesi quadre in ogni riga del dropdown, e sceglie l'utente. Il filtro resta disponibile via `JIRA_TASK_ISSUETYPE` (env Edge Function) per chi vuole restringerlo a un solo tipo.

## v18.88.1
- fix: **Sottotask Jira — click su Epic/Task nel pannello di ricerca non selezionava nulla** — la callback `onPick` del pannello (che scatta in modo asincrono, dopo il click sull'elemento della lista) leggeva il bottone trigger da `e.currentTarget`, che a quel punto è già tornato `null` per specifica DOM (valido solo durante il dispatch dell'evento originale); l'assegnazione falliva silenziosamente e il pannello restava bloccato aperto senza applicare la scelta. Ora il bottone viene catturato in una variabile locale al momento del click, prima di aprire il pannello.

## v18.88.0
- feat: **Griglia settimanale — creazione sottotask Jira dalla pianificazione** — nuovo bottone "🎫 Sottotask Jira" nell'header di ogni blocco commessa della Griglia: per ogni comune/cantiere pianificato quella settimana permette di scegliere Epic e Task Jira sotto cui creare i sottotask (una commessa può avere più Epic, quindi si scelgono a cascata per comune, non fissati in anagrafica — o si può saltare il comune), mostra un'anteprima ("da creare" / "già esistente" con link / errore) prima di procedere, e solo dopo conferma crea davvero i sottotask (uno per operatore assegnato, formato `Attività - Comune - Cognome`, senza duplicati se un operatore ha già un sottotask sotto lo stesso Task). Richiede che la commessa attiva abbia il "Codice progetto Jira" configurato nella relativa anagrafica (Dashboard → Commesse attive → Modifica commessa, nuovo campo). L'anagrafica operatore ha inoltre due nuovi campi opzionali "Nome"/"Cognome" (accanto al preesistente "Nome esteso", che resta invariato ovunque nel resto dell'app) usati per generare il cognome nel summary del sottotask quando compilati.
  - Richiede 3 nuove Supabase Edge Function (già deployate): `jira-list-epics`, `jira-list-tasks`, `jira-create-subtask`, stesso pattern di autenticazione/secret delle function Jira esistenti (`JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`); env opzionali `JIRA_TASK_ISSUETYPE` (default "Task") e `JIRA_SUBTASK_ISSUETYPE` (default "Subtask") se i nomi dei tipi issue differiscono su Jira.

## v18.86.0
- feat: **Griglia settimanale — auto-formattazione Cantiere/Attività** — i campi "cantiere" e "attività" di ogni cella operatore/giorno nella Pianificazione Settimanale vengono ora automaticamente riformattati in "Prima Lettera Maiuscola Per Ogni Parola" al salvataggio della cella (`onchange`), per uniformare la grafia inserita a mano dagli utenti (utile in vista della futura corrispondenza automatica tra nome cantiere e Task Jira).

## v18.85.0
- feat: **Pool operatori — Regione e Provincia di provenienza separate** — nella modale operatore (Dashboard → Pool operatori → Nuovo/Modifica) il campo unico "Provincia di provenienza" è stato sostituito da due select a cascata: "Regione di provenienza" e "Provincia (facoltativa)", sul modello già usato per la commessa. Si può ora indicare solo la regione di un operatore senza doverne conoscere la provincia esatta (dato spesso non disponibile per tutte le risorse); la provincia resta selezionabile solo dopo aver scelto la regione. Filtro Regione/Provincia del Pool operatori, badge 📍 in card/export Excel, picker operatore in Griglia settimanale e suggerimento "operatori più vicini" (introdotto in v18.84.0) sono stati aggiornati per usare la regione dell'operatore come fallback quando la provincia non è nota (badge/filtro per regione, distanza approssimata dal centroide regionale). Gli operatori con provincia già impostata non sono impattati: la regione viene derivata automaticamente da questa alla prima apertura della modale.

## v18.84.0
- feat: **Pool operatori — export Excel e ordinamento alfabetico** — nuovo pulsante "⬇ Excel" nella barra di ricerca del Pool operatori: scarica un foglio Excel con tutte le informazioni anagrafiche/contrattuali di ogni operatore (attivi ed ex colleghi) — nome, email, stato, provincia/regione, tipo contratto e date rapporto, skill, attestati e data di aggiunta al pool. La data di aggiunta viene registrata da questa versione in poi sui nuovi operatori creati dalla modale "Nuovo"; per quelli già presenti la cella resta vuota (dato non disponibile retroattivamente). Le card del Pool operatori sono inoltre ora sempre ordinate alfabeticamente per nome (in precedenza, fuori dalla vista ex colleghi, erano ordinate per saturazione), per una lista più prevedibile da scorrere.
- feat: **Provincia/regione di lavorazione della commessa — suggerimento operatori più vicini** — le commesse (pipeline e attive) hanno ora un campo "Regione/Provincia di lavorazione" opzionale nella relativa modale. Quando impostato, tutti i picker di assegnazione operatore (aggiunta risorsa su commessa, dettaglio mese, suggerimento nel fabbisogno dettagliato, selezione operatore in Griglia settimanale) calcolano la distanza approssimata (haversine tra i capoluoghi di provincia, o dal centroide della regione se la commessa ha solo la regione) tra la zona della commessa e la provincia di provenienza di ciascun operatore, e la usano come criterio di ordinamento/badge "📍 ~N km" / "📍 stessa provincia/regione" — dopo il match skill/attestati richiesti, prima della saturazione. Operatori o commesse senza provincia nota restano in fondo, senza badge di distanza (nessun dato geografico disponibile, non "lontano").

## v18.79.0
- fix: **Confronto Preventivo/Effettivo — il cambio mese smetteva di ricaricare la tabella** — la select del mese nel box "🔍 Confronto Preventivo/Effettivo" (card commessa attiva) veniva sostituita ad ogni cambio da `_refreshConfrontoBox` (refresh mirato che non richiude i `<details>`), ma il relativo handler `onchange` era legato una sola volta durante il render completo della lista commesse: dopo il primo cambio la nuova `<select>` restava senza listener e i cambi successivi non aggiornavano più la tabella. Ora l'handler viene ricollegato ad ogni refresh del box.

## v18.78.0
- fix: **Dashboard — commesse "in partenza" contate ma non visibili** — la lista pipeline (tab "In partenza") filtrava le commesse il cui nome coincideva con una voce di `commesse_escluse` (lista permanente pensata per le commesse attive chiuse, derivate per nome dalle righe staffing), mentre il badge conteggio, la KPI "Commesse in partenza" e la relativa modale contavano `state.pipeline` senza applicare lo stesso filtro. Risultato: una commessa pipeline con lo stesso nome di una vecchia commessa attiva chiusa risultava conteggiata ma invisibile in lista. Le commesse pipeline hanno un id proprio e un ciclo di vita esplicito (creazione/eliminazione via CRUD), quindi non hanno bisogno del filtro per nome pensato per la vista Attive: rimosso dalla vista pipeline, che ora è sempre coerente con conteggio/KPI/modale.

## v18.77.0
- feat: **Pool operatori — vista Ex colleghi** — nuovo checkbox "🚪 Mostra solo ex colleghi" nei filtri del Pool operatori (con contatore accanto), per ritrovare chi è stato segnato manualmente come ex o il cui contratto a termine è scaduto e che quindi non compare più nel pool attivo né nei picker di assegnazione. La vista ex mostra il motivo (licenziamento manuale o data di scadenza contratto), non è più trascinabile per nuove assegnazioni, e ogni card ha un pulsante "↩ Riattiva" per rimuovere lo stato ex (se il motivo era un contratto scaduto, viene riportato a tempo indeterminato, pronto per impostare una nuova data se serve). Gli altri filtri (nome, skill, attestati, provenienza) restano applicabili anche in questa vista.

## v18.76.0
- feat: **Tipo di rapporto operatore** — nella modale operatore (Dashboard → Pool operatori → Nuovo/Modifica) è ora possibile indicare se l'operatore è a tempo indeterminato (default) o a termine, con data inizio/fine rapporto. Quando la data di fine passa, l'operatore viene automaticamente trattato come "ex collega" (badge `ex`, escluso dal pool attivo e dai picker di assegnazione) senza bisogno di segnarlo manualmente — basta correggere/rimuovere la data se il rapporto viene rinnovato. Nuovo alert in Dashboard: se un operatore con contratto scaduto risulta ancora impiegato su commesse nei mesi successivi alla fine rapporto, compare un avviso dedicato "🚪 Ex collega ancora impiegato" con l'elenco dei mesi/gg-uomo da correggere.

## v18.75.0
- feat: **Provenienza geografica operatori** — aggiunto il campo "Provincia di provenienza" all'anagrafica operatore (Dashboard → Pool operatori → Nuovo/Modifica), con elenco completo delle 107 province italiane raggruppate per regione. Nel Pool operatori è ora disponibile un filtro a cascata Regione → Provincia (accanto a Skill/Attestati) e ogni card mostra un badge 📍 con la provincia. Nel picker di selezione operatore della Griglia settimanale (Pianificazione Settimanale) è stato aggiunto lo stesso filtro Regione/Provincia, per trovare rapidamente gli operatori più vicini alla zona di un rilievo quando si compone una squadra. Il campo è opzionale e va compilato manualmente sugli operatori esistenti; nessuna migrazione dati necessaria (default "non specificata").

## v18.74.0
- feat: **Dashboard - Pool operatori, "Vedi impegni/commesse"** — se l'operatore risulta impiegato in Griglia settimanale su una commessa mai preventivata nello staffing, ora compare una sezione aggiuntiva "⚡ Solo in Griglia settimanale — non preventivate" con card evidenziate in ambra (badge "⚠ mai preventivata") e la sola riga "Eff." mese per mese, così da non perdere allocazioni reali che prima restavano invisibili perché la vista operatore leggeva solo `state.staffing`.

## v18.73.0
- feat: **Dashboard - Pool operatori, "Vedi impegni/commesse"** — nella card di ogni commessa attiva mostrata nella vista dettaglio operatore, sotto la riga mensile "Prev." (gg-uomo preventivati, editabile) è stata aggiunta una riga "Eff." di sola lettura con i giorni effettivamente lavorati risultanti dalla Griglia settimanale per quell'operatore su quella commessa, mese per mese (stessa logica/colori del confronto Preventivo/Effettivo già presente nelle card commessa e nella Vista mensile).

## v18.72.1
- fix: **Dashboard - Confronto Preventivo/Effettivo** (card "Attive" e popup Vista mensile Gantt) — le risorse preventivate nello staffing venivano nascoste quando la commessa non aveva alcun blocco nella Griglia settimanale per quel mese, mostrando solo il messaggio "Nessun dato dalla Griglia settimanale". Ora i gg preventivati sono sempre visibili (con badge "🔴 assente in Griglia" per ciascuna risorsa); l'assenza di dati Griglia è solo una nota informativa, non blocca più la visualizzazione.

## v18.72.0
- feat: **Dashboard - Commesse attive** — nuova sezione collassabile "🔍 Confronto Preventivo/Effettivo" in ogni card commessa, che confronta i gg-uomo preventivati nello staffing con i giorni effettivamente lavorati risultanti dalla Griglia settimanale di Pianificazione Settimanale (cantiere valorizzato e non in ferie), per il mese scelto da un selettore. Segnala risorse con scostamento (giorni diversi da quelli preventivati), risorse "extra" comparse in Griglia ma non preventivate, e risorse preventivate ma mai comparse in Griglia; badge riepilogativo sul titolo della card se ci sono scostamenti nel mese corrente.
- feat: **Dashboard - Vista mensile commesse (Gantt)** — lo stesso confronto Preventivo/Effettivo è ora integrato anche qui: il popup che si apre cliccando una cella mensile mostra, oltre allo staffing preventivato, anche i giorni effettivamente lavorati da Griglia settimanale con stato (✓ ok, ⚠ scostamento, 🔴 assente, ⚡ extra). Le celle di mesi senza alcun gg-uomo preventivato ma con lavoro effettivo registrato in Griglia (risorse "extra" non pianificate) sono ora evidenziate in blu e cliccabili — prima erano invisibili.

## v18.70.0
- feat: **Pianificazione Settimanale** — aggiunto il tipo di strumento "DRONE (UAV)" alla sezione "Aggiorna strumenti", selezionabile come qualunque altro strumento Jira.
- feat: **Pianificazione Settimanale - Griglia** — aggiunto il riordinamento delle commesse tramite pulsanti frecce (▲/▼) nell'header di ciascuna commessa; i pulsanti si disabilitano automaticamente quando la commessa è già prima (freccia su) o ultima (freccia giù) nell'elenco.

## v18.69.0
- style: restyling grafico dell'app (Dashboard e Pianificazione Settimanale), guidato con `/impeccable`. Fix: il font `Inter` era dichiarato ma mai davvero caricato da nessuna parte (nessun `<link>` Google Fonts) — l'app ha sempre reso nel font di sistema del sistema operativo; ora caricato per davvero. Fix: `switchScreen()` (cambio Dashboard/Pianificazione) sostituiva la className dei due pulsanti di navigazione ma lasciava lo style inline del markup iniziale a vincere per specificità — dopo ogni cambio schermata (incluso quello automatico al caricamento) il pulsante disattivo poteva restare con lo sfondo colorato e quello attivo col colore sbagliato. Visibile: un solo accento teal (prima due leggermente diversi tra header e pianificazione), card KPI della Dashboard a tinta piena colorata per categoria invece che bianche con un filo di colore (stesso colore del modale di dettaglio che aprono), riga di accento sotto l'header, tab bar con stato attivo più marcato in tutta l'app, ombre/raggi/badge/modali unificati su una sola scala invece di valori duplicati leggermente diversi tra loro. Nessun cambio di layout, densità delle tabelle o comportamento funzionale. Aggiunti `DESIGN.md` e `.impeccable/design.json` a documentazione del sistema di design risultante.

## v18.58.0
- chore: rimossi i CDN di `sortablejs` e `chart.js` dall'header — mai referenziati nel codice (il drag&drop usa l'HTML5 nativo `draggable`, nessun grafico Chart.js in uso). ~250 KB in meno scaricati ad ogni apertura, nessun cambio di comportamento.
- chore: rimossa la funzione `salvaHTML()` (export "snapshot" dell'app come file HTML autonomo) — dead code, non richiamata da nessun pulsante/handler da quando i dati vivono solo su Supabase (v18.17+).

## v18.57.0
- feat: "Genera Mail" — il riferimento alla doppia week non compare più solo nella sezione riepilogativa in fondo alla mail ("🔁 DOPPIA WEEK"), ma anche accanto al nome dell'operatore nella riga "👷" della squadra a cui è assegnato quella settimana, con l'indicazione se è la 1ª settimana (fuori tutta la settimana) o la 2ª (rientro giovedì).

## v18.56.0
- feat: "Genera Mail" — riordinati i destinatari del link `mailto:` ("Apri Outlook"). Ora l'unico destinatario ("A:") è `logistica@eagleprojects.it`; tutti gli altri (email sempre in CC, referenti tecnici, dipendenti pianificati e in ferie) vanno in copia conoscenza (CC), in quest'ordine: 1) email sempre in CC, 2) referenti tecnici delle commesse, 3) dipendenti (inclusi quelli in ferie), deduplicati.

## v18.55.0
- feat: "Genera Mail" — i campi "Orario partenza sede" e "Orario lavoro" sono ora persistiti in pianificazione (`pwData.mailOrarioPartenza` / `mailOrarioLavoro`, sincronizzati come "Email sempre in CC"), invece di ripartire ogni volta dal valore di default (08:00 / 08:00-08:30–16:30-17:00).
- feat: nuovo campo **"Codice commessa"** nei parametri delle commesse attive (Dashboard → Commesse attive → Modifica), riportato tra parentesi accanto al nome della commessa nel testo della mail generata ("📋 COMMESSA (Cod. ...)").
- feat: "Genera Mail" — gli operatori in ferie/permesso nella settimana vengono ora inclusi anche tra i destinatari del link `mailto:` ("Apri Outlook"), non solo elencati nel testo ("🏖 FERIE / PERMESSI").
- feat: "Genera Mail" — nuova sezione automatica nel testo della mail "🔁 DOPPIA WEEK" con gli operatori in 1ª settimana (fuori tutta la settimana) o 2ª settimana (rientro giovedì, riposo compensativo venerdì) di un blocco doppia-week che tocca la settimana pianificata.

## v18.54.0
- fix: **Griglia** — rimuovere una squadra con nome di default (es. "Squadra 1") e poi aggiungerne una nuova poteva creare due squadre con lo stesso nome sulla stessa commessa (es. due "Squadra 2"), perché il nome della nuova squadra veniva calcolato solo dal conteggio squadre attuali (`length + 1`), senza tener conto dei nomi già usati/rimasti dopo le rimozioni. Ora, dopo ogni aggiunta o rimozione, le squadre il cui nome è ancora quello di default (pattern "Squadra N", mai personalizzato dall'utente) vengono rinumerate in sequenza (1, 2, 3…); le squadre rinominate manualmente non vengono toccate.

## v18.53.0
- fix: "Genera Mail" — il campo "Email sempre incluse" (rinominato "Email sempre in CC") aggiungeva le email tra i destinatari principali (To) del link `mailto:`. Ora vengono messe in copia conoscenza (CC), lasciando come destinatari solo operatori pianificati e referenti tecnico delle commesse.

## v18.52.0
- feat: "Genera Mail" — nuovo campo **"Email sempre incluse"** nei parametri del modal: una lista di email (separate da virgola) salvata in pianificazione (`pwData.emailSempreIncluse`, sincronizzata come le altre impostazioni di Griglia) e aggiunta automaticamente ai destinatari ogni volta che si genera la mail ("Apri Outlook"), indipendentemente da operatori/referenti pianificati. Utile per includere sempre indirizzi fissi (es. ufficio tecnico, capocommessa) senza doverli ridigitare ogni settimana.

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
