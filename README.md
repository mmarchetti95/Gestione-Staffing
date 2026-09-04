## v18.135.0
- feat: **Gerarchia di ruoli (Admin / Responsabile / Operatore / Guest)** — il ruolo utente non è più solo "admin/utente": ora sono 4 livelli. **Admin** tutto incluse le funzioni admin-only; **Responsabile** stesso accesso in lettura/scrittura di prima su Dashboard e Pianificazione Settimanale, ma senza le sezioni admin-only (comportamento invariato per chi già usava l'app: gli utenti esistenti senza ruolo sono stati migrati automaticamente a Responsabile); **Operatore** sola lettura su tutto il sito; **Guest** sola lettura limitata alle sole pagine/tab assegnate ad hoc per singolo utente (nuovo editor "📄 Pagine" nel pannello Gestione utenti), le altre restano completamente nascoste. Il blocco in scrittura per Operatore/Guest non è solo lato client: la RLS su `staffing_state` ora richiede `role IN ('admin','responsabile')` anche per l'update via Supabase, quindi non è aggirabile dalla console del browser. Richiede la migration RLS + il redeploy dell'Edge Function `admin-users` (estesa con i 4 ruoli e il campo `guest_pages`) già applicati separatamente, non versionati nel repo come le altre Edge Function del progetto.

## v18.134.0
- fix: **Modal "Attestati scaduti o in scadenza" — leggibilità** — la lista era una tabella piatta con tutte le righe accorpate senza un ordine logico, difficile da scorrere. Ora è divisa in due sezioni (❌ Scaduti, ⚠️ In scadenza) con contatore, e dentro ciascuna sezione le voci sono raggruppate per operatore (una card per persona con tutti i suoi attestati elencati sotto, invece di ripetere il nome a ogni riga) e ordinate alfabeticamente.

## v18.132.0
- fix: **Modal "Criticità meteo" — dimensione corretta e scrollabile** — con più giorni/commesse a rischio (v18.131.0) il modal cresceva oltre l'altezza della finestra, tagliando il contenuto senza modo di scrollarlo. Ora usa la stessa convenzione degli altri modal dell'app (`max-h-[90vh] overflow-y-auto`, leggermente più largo): resta centrato in verticale e diventa scrollabile con barra quando il contenuto non ci sta.

## v18.131.0
- fix: **Modal "Criticità meteo" — raggruppato per giorno, cliccabile fino alla cella** — cambiato di nuovo il criterio di raggruppamento del modal (v18.130.0): ora la prima suddivisione è per giorno della settimana e, sotto ciascun giorno, per commessa (non più per priorità in testa). Ogni riga di dettaglio (commessa + squadra + severità) è cliccabile: chiude il modal, espande commessa/squadra nella Griglia se collassate e scrolla evidenziando per un paio di secondi la cella cantiere/giorno corrispondente. Per rendere possibile il collegamento alla cella esatta, le criticità non sono più deduplicate tra squadre diverse che condividono lo stesso cantiere/giorno (prima ne veniva mostrata solo una): ora compare una riga per ogni squadra effettivamente coinvolta.

## v18.130.0
- fix: **Modal "Criticità meteo" — raggruppato per priorità e commessa** — il dettaglio del widget (introdotto in v18.127.0) elencava una riga per ogni combinazione cantiere/giorno, di lettura scomoda quando una stessa commessa aveva più giorni a rischio. Ora è raggruppato in due sezioni per severità (🔴 Priorità alta, 🟠 Priorità media) e, dentro ciascuna, per commessa/cantiere, con i giorni a rischio elencati sotto ognuna. Nessuna modifica alla logica di calcolo delle criticità, solo alla presentazione.

## v18.129.0
- fix: **Bollettino Protezione Civile — copertura anche prima della pubblicazione del giorno** — il bollettino esce di norma entro le 16:00, quindi nelle ore precedenti non era ancora disponibile su GitHub e il widget "Criticità meteo" restava senza il segnale PC per mezza giornata. Ora, se il bollettino di oggi non è ancora pubblicato, si usa la sezione "domani" di quello di ieri (che copre esattamente oggi), verificato contro i dati reali del repo.

## v18.128.0
- feat: **Gestione utenti (solo admin)** — nuova sezione "👥 Gestione utenti" nel banner Supabase (visibile solo agli admin, come Log attività/Sessioni/Backup), con modal per elencare tutti gli utenti registrati (email, ruolo, data creazione, ultimo accesso), aggiungerne di nuovi (email + password iniziale + ruolo), cambiare il ruolo di un utente esistente da un menu a tendina e eliminare un account (con conferma, non applicabile al proprio account). Richiede una nuova Edge Function `admin-users` (creata in questo rilascio, service_role key, mai esposta al client) che verifica lato server che il chiamante sia admin prima di usare l'Admin API di Supabase Auth — il ruolo del chiamante viene riletto ad ogni chiamata (non fidandosi dei claim del JWT già emesso) così una retrocessione di ruolo ha effetto immediato.
- feat: **Widget "Criticità meteo" — integrazione bollettino Protezione Civile** — il widget introdotto in v18.127.0 (basato solo su soglie Open-Meteo) ora incrocia anche il bollettino ufficiale di criticità idrogeologica/idraulica della Protezione Civile (fonte gratuita senza API key: repo GitHub `pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica`), quando disponibile per il comune del cantiere e limitatamente all'orizzonte oggi/domani coperto dal bollettino. La severità mostrata è la peggiore tra le due fonti; il modal di dettaglio riporta entrambe separatamente (previsione Open-Meteo + eventuale allerta gialla/arancione/rossa e zona). Nessuna modifica allo schema Supabase (cache lato client, TTL 3h).

## v18.127.0
- feat: **Griglia settimanale — widget "Criticità meteo"** — nuovo bottone nell'header di Pianificazione Settimanale → Griglia, accanto ad "Aggiorna strumenti", che segnala se nei cantieri pianificati nella settimana corrente ci sono criticità meteo (pioggia intensa, temporali, alta probabilità di precipitazione) e con che severità (media/alta), riusando le previsioni Open-Meteo già scaricate per i badge meteo esistenti. Cliccando si apre un elenco dettagliato per cantiere/giorno. Prima versione basata solo su soglie sulle previsioni Open-Meteo: nessuna integrazione con bollettini Protezione Civile (nessun feed pubblico gratuito confermato disponibile), eventualmente in una fase successiva.

## v18.126.0
- feat: **Ricerca Squadre — mostra solo i giorni residui della settimana** — la striscia di chip "Lun–Sab" e la sezione "Dove sono questa settimana" non mostrano più i giorni già passati (es. lunedì/martedì se il ranking parte mercoledì): la richiesta è immediata, quindi contano solo oggi e i giorni successivi. Di conseguenza anche la distanza usata per il ranking e il "giorno consigliato" si basano solo sui cantieri dei giorni residui, non su dove la squadra si trovava a inizio settimana.
- feat: **Ricerca Squadre — data priorità (facoltativa) sulle tappe** — aggiungendo una tappa si può ora indicare una scadenza entro cui il cantiere va coperto. Se compilata, viene mostrata come avviso sotto la tappa (in rosso se già scaduta) e, nella colonna "Quando andare" di ogni squadra proposta, segnala se il giorno consigliato rispetta la scadenza (⏰) o la supera (⚠️).

## v18.125.0
- fix: **cursore invisibile sulle card del Pool operatori** — il cursore "manina" di drag & drop mostrato passando su una card operatore poteva essere reso bianco dal tema cursori del sistema operativo: sulle card a sfondo bianco spariva, diventando visibile solo sopra elementi colorati. Sostituito con un'icona SVG inline (riempimento scuro + contorno chiaro) sempre leggibile su qualunque sfondo, indipendentemente dal tema cursori dell'OS.

## v18.124.0
- feat: **Ricerca Squadre — tappe anche per coordinate geografiche dirette** — il campo "Comune / Cantiere" accetta ora, oltre al nome di un comune/cantiere, anche coordinate dirette nel formato `lat, lng` (o `lat lng` / `lat;lng`), riconosciute con la stessa logica già usata per la correzione manuale in Mappa Squadre: in questo caso non viene interrogato Nominatim, la posizione è presa così com'è. Utile per punti senza un nome geocodificabile affidabile.

## v18.123.0
- feat: **Toggle Stradale/Satellite su tutte le mappe** — ogni mappa dell'app (Mappa Squadre e mappa operatore in Pianificazione settimanale, Pianifica Spostamenti, Ricerca Squadre) ha ora un controllo in alto a destra per passare dalla vista stradale (OpenStreetMap) a quella satellitare e viceversa. Vista satellite fornita da Esri World Imagery, servizio gratuito senza API key, in linea con gli altri servizi di mappe già usati (Nominatim, OSRM).

## v18.122.0
- fix: **Ricerca Squadre — non si ripiega più sulla residenza per le squadre senza cantieri in settimana** — una squadra completamente priva di cantieri pianificati veniva posizionata, ai fini del ranking per distanza, sulla residenza dei suoi operatori: in pratica una settimana "tutta libera" quasi sempre significa dati mancanti, non reale disponibilità, e la residenza le dava una priorità ingiustificata solo perché abitava vicino alla tappa. Ora queste squadre non hanno un'origine geografica e finiscono in fondo alla classifica (distanza "—") invece di poter risultare artificialmente "vicine".
- feat: **Ricerca Squadre — giorno consigliato basato sulla vicinanza reale ai comuni del giro** — l'algoritmo del "Quando andare" non guarda più solo il cantiere immediatamente prima/dopo ciascun giorno libero, ma individua il giorno lavorato in cui la squadra è **in assoluto** più vicina alle tappe richieste, poi sceglie fra i giorni liberi quello cronologicamente più vicino a quel giorno di riferimento (prima o dopo, col più presto a parità). Il motivo mostrato in tabella ora indica correttamente "prima di" o "dopo" a seconda della direzione.
- feat: **Ricerca Squadre — il giorno consigliato non propone più giorni già passati** — lanciando il ranking a metà settimana (es. mercoledì) sulla settimana corrente, i giorni liberi di lunedì/martedì non vengono più suggeriti: la proposta parte sempre dal giorno corrente fino a fine settimana. Per settimane diverse da quella in corso (passate o future) non cambia nulla.

## v18.121.0
- feat: **Import anagrafica dipendenti da Excel (comune e provincia di residenza)** — nuovo pulsante "⬆ Importa anagrafica" nel Pool operatori, accanto all'export, che legge l'export aziendale "Anagrafica dipendenti" (colonne Dipendente / Indirizzo residenza / civico / CAP / Comune residenza / Provincia residenza / Sede di riferimento) e aggiorna **comune e provincia di residenza** degli operatori del pool, abbinando i nominativi con lo stesso matching tollerante già usato per attestati e ferie (Nome/Cognome invertiti, piccoli refusi). Prima di applicare mostra un riepilogo con elenco abbinati/ambigui/non trovati (filtrabile per nome); indirizzo, civico, CAP e sede di riferimento del file non sono gestiti e vengono ignorati. Il nuovo campo **comune di residenza** è visibile e modificabile a mano nella scheda operatore (sostituisce il nome provincia nel badge 📍 quando presente, più specifico) ed è incluso nell'export Excel del pool. Nessuna modifica allo schema Supabase: `comune_residenza` viaggia dentro l'oggetto operatore, nel payload del dominio "core" già esistente.

## v18.120.0
- feat: **DPI — nuova sezione "🦺 DPI & scadenze" con dotazione per operatore** — il menu DPI non sta più tra i filtri del Pool operatori (dove poteva solo aggiungere/rimuovere nomi) ma in una sezione full-width collassata sotto "Attestati & scadenze", costruita sullo stesso modello: matrice **operatore × DPI** con pallino di stato (verde = valido, ambra = in scadenza entro 30 giorni, rosso = da sostituire, grigio = consegnato senza scadenza), data di scadenza in cella (mm/aa), taglia come sigla e dettaglio completo (taglia, data di consegna, giorni residui) nel tooltip; intestazione e colonna nome agganciate durante lo scroll. Filtri per nome operatore, tipo di DPI, stato ("con almeno uno da sostituire" / "in scadenza" / "con DPI da consegnare" / "senza alcun DPI"), ordinamento per nome o per urgenza, export Excel in formato lungo (una riga per operatore × DPI, incluse le righe "Da consegnare" dei DPI richiesti e mai consegnati). Il pulsante ✎ su ogni riga apre direttamente la scheda dell'operatore.
- feat: **Assegnazione DPI agli operatori con data di consegna e scadenza** — nella scheda operatore, nuovo riquadro "DPI in dotazione": una riga per DPI con spunta, **taglia**, **data di consegna** e **data di scadenza**, tutti e tre facoltativi. Compilando la data di consegna il DPI si spunta da solo e, se il tipo di DPI ha una durata dichiarata in catalogo, la scadenza viene precompilata (data di consegna + N mesi, col giorno limitato all'ultimo del mese di arrivo) restando sempre modificabile a mano: la scadenza reale la detta il produttore, quella calcolata è solo un suggerimento. Una scadenza precedente alla consegna viene rifiutata al salvataggio. Come per gli attestati, un DPI **senza data di scadenza non viene mai considerato scaduto**, così i dati inseriti oggi non generano falsi allarmi domani. Si tiene una sola voce per operatore × DPI (il DPI attualmente in dotazione): sostituendone uno si aggiornano le date, non si accumula uno storico delle consegne passate.
- feat: **Catalogo DPI con durata di validità, e DPI richiesti anche sulle commesse "In partenza"** — la gestione del catalogo (aggiungi/rimuovi) si è spostata dentro la nuova sezione, in un pannello "🧰 Gestione catalogo DPI", ed espone per ogni DPI una **durata in mesi** facoltativa (usata solo per precompilare le scadenze; cambiarla non ricalcola le scadenze già inserite). Rimuovendo un DPI dal catalogo si avvisa a quanti operatori risulta in dotazione e si ripulisce tutto: requisiti delle commesse attive **e in partenza**, dotazioni e dettagli degli operatori. Il modal delle commesse **in partenza** ha ora la griglia "DPI richiesti" che finora esisteva solo per le commesse attive, coi relativi badge gialli sulla card; i DPI richiesti dalle commesse su cui un operatore è impegnato (assegnazioni pipeline + righe di staffing sulle attive) alimentano la colonna "Da consegnare" e il marcatore "!" nelle celle della matrice, che distinguono "non ha il casco" da "non ha il casco e gli serve".
- fix: **il catalogo DPI non veniva salvato** — `dpi_disponibili` non era tra le chiavi di `loadState`/`saveState` né nel payload di push/pull Supabase: ogni DPI aggiunto o rimosso spariva al primo reload, tornando alla lista di default hardcoded. Ora `dpi_disponibili` e il nuovo `dpi_catalogo` sono chiavi del payload del dominio **core** (row id 1) già esistente, e un catalogo svuotato di proposito resta vuoto invece di farsi ripopolare dal seed.
- **Nessuna modifica allo schema Supabase e nessun nuovo dominio di sync**: la dotazione viaggia nei campi `dpi` / `dpi_dett` di ogni operatore e il catalogo nelle chiavi `dpi_disponibili` / `dpi_catalogo`, tutte dentro il payload del dominio "core".

## v18.119.0
- fix: **Ricerca Squadre — la tab non funzionava: distanze, disponibilità e mappa erano tutte sbagliate** — tre errori di lettura delle strutture dati rendevano inutilizzabile la tab introdotta in v18.117.0. (1) I cantieri della squadra venivano letti iterando `op.giorni` come array, ma `giorni` è un **oggetto** `{0..5}` e i cantieri si leggono con `pwCellCantieri()`: l'eccezione interrompeva il render della mappa, che restava sempre vuota. (2) La distanza partiva da `_geoCache[provincia]`, ma la rubrica luoghi è indicizzata sui **nomi dei cantieri**, mai sulle province: nessuna posizione veniva trovata e ogni riga mostrava "❌". (3) I giorni disponibili leggevano `pwFerie[anno][week][indice]`, ma ferie e doppia week sono indicizzate per **nome operatore**: il valore era sempre 6, costante e privo di significato (col badge per giunta invisibile, per un colore CSS inesistente `#teal`). Anche il matching strumenti confrontava le label richieste con un campo `operatore.strumenti` inesistente — gli strumenti sono assegnati alla squadra (`pwSqStrumentiJira`) — e risultava perciò sempre 0/0.
- feat: **Ricerca Squadre — ranking rifatto su criteri leggibili e azionabili** — la colonna "distanza media dalla residenza" (poco utile a metà settimana) è sostituita dalla **distanza stradale dal cantiere in cui la squadra sta già lavorando**, con indicato il sito di partenza e, se le tappe sono più d'una, quale tappa è la più vicina; per le squadre senza cantieri in settimana si ripiega sulla residenza, dichiarandolo in tabella. "Giorni disponibili" diventa una striscia di **chip Lun–Sab** colorati (libero / su cantiere / ferie / doppia week), che mostra *quando* la squadra è libera invece di un totale. La tabella riporta ora **operatori e cantieri della settimana con i giorni** (la commessa scende a sottotitolo). L'ordinamento è **solo per distanza**: il punteggio precedente sommava bonus fino a 1000 km equivalenti per skill e 500 per strumenti, che ribaltavano l'ordine rendendolo incomprensibile; skill e strumenti restano come badge (col dettaglio dei mancanti nel tooltip) più una checkbox "solo squadre che coprono tutti i requisiti". Le distanze si calcolano ora in **una sola chiamata** OSRM `/table` (`sources`/`destinations`) invece di una per squadra, con fallback automatico su distanza in linea d'aria se OSRM non risponde.
- feat: **Ricerca Squadre — selettori a tendina per skill e strumenti, e mappa completa** — "Skills richieste" e "Strumenti richiesti" non sono più campi di testo separati da virgola ma menu a tendina con ricerca e caselle di spunta, popolati con le skill degli **operatori effettivamente pianificati in quella settimana** e con gli strumenti Jira **assegnati alle squadre di quella settimana**. Il menu si apre e chiude sempre allo stesso modo: la lista è costruita all'apertura e non più ricostruita a ogni spunta (era la causa della tendina che si "distorceva" dopo la prima selezione), con la selezione tenuta in memoria e la sola etichetta aggiornata. La mappa mostra ora sia i **cantieri da coprire** (verdi) sia i **cantieri dove si trovano le squadre proposte** (colorati per squadra, con operatori e distanza nel popup), collegando con una linea tratteggiata le prime tre squadre alla loro tappa più vicina. Nessuna modifica allo schema Supabase: la tab resta senza persistenza (stato di sessione, come Pianifica spostamenti).
- feat: **Ricerca Squadre — colonna "Quando andare" con il giorno consigliato** — per ogni squadra proposta viene suggerito il giorno in cui conviene mandarla, dedotto dalla programmazione della Griglia: fra i giorni liberi si sceglie quello che "aggancia" il cantiere già programmato più vicino alla tappa (il giorno prima se c'è, altrimenti il giorno dopo), così la trasferta parte da dove la squadra si trova comunque. La cella riporta il giorno (o l'intervallo, es. "Mer–Ven"), il cantiere di partenza col suo giorno e la distanza, più il numero di giorni liberi consecutivi; a parità sostanziale di distanza (margine 1 km) vince il giorno più presto. Il giorno consigliato è evidenziato anche nella striscia dei chip settimanali. Skill e strumenti sono stati accorpati in un'unica colonna "Requisiti" con due badge distinti (🎓 / 🔧) per non allargare troppo la tabella.
- fix: **Ricerca Squadre — il sabato non compare più per le squadre fuori doppia week** — il sabato è giorno lavorativo solo in trasferta lunga, quindi mostrarlo come "libero" per le squadre normali suggeriva un giorno in cui non si va comunque: ora la settimana si ferma al venerdì, e il sabato resta visibile solo per le squadre coinvolte in un blocco doppia week (iniziato questa settimana o la precedente) oppure se in Griglia c'è davvero del lavoro programmato di sabato, per non nascondere dati reali.
- fix: **Ricerca Squadre — tendine illeggibili e colonne disallineate** — le voci dei menu skill/strumenti si disponevano in orizzontale a capo invece che una per riga: il filtro di ricerca reimpostava `display` a stringa vuota, cancellando il `display:flex` della riga che tornava così `inline`. Ora le righe restano una per riga a tutta larghezza, con le etichette lunghe (es. "GAR-194 · GEORADAR - BIANCO") troncate con "…" e testo completo nel tooltip, area scrollabile più alta e tendina che può essere più larga della colonna. La card dei risultati è inoltre allineata in altezza al pannello di ricerca a fianco (limite, non altezza fissa: se le squadre sono poche resta corta, se sono tante scorre), così le due colonne finiscono alla stessa quota; il vincolo si disattiva sotto il breakpoint `lg`, dove le card sono impilate.

## v18.118.0
- fix: **Dashboard — Pool operatori e Commesse della stessa altezza e scrollabili** — le due colonne (Pool operatori / Commesse) del dashboard avevano altezze diverse a causa degli header con contenuto asimmetrico, causando un layout visivamente sbilanciato. Ora entrambi i container hanno altezza fissa (600px) con layout flexbox, e i rispettivi contenuti scrollabili crescono con `flex: 1` per occupare tutto lo spazio disponibile: entrambe le tabelle hanno ora la stessa altezza e scroll indipendente. Nessuna modifica allo schema Supabase.

## v18.117.0
- feat: **Ricerca Squadre — proposta squadre per nuovi cantieri per distanza/skill/disponibilità** (issue #6) — nuova tab "🔍 Ricerca Squadre" in Pianificazione Settimanale che propone le squadre della settimana ordinata per idoneità a coprire un nuovo cantiere/insieme di cantieri. Workflow: (1) aggiungi i comuni/tappe dove è necessario lavorare, specificando facoltativamente skills (es. "Topografia") e strumenti (es. "GPS") richiesti; (2) clicca "Calcola ranking" per ottenere una tabella con tutte le squadre ordinate per distanza geografica media (primaria), poi bonus di disponibilità settimanale, matching skill (%) e matching strumenti (%); (3) visualizza le top 5 squadre su una mappa Leaflet con i marker per i cantieri (teal) e per le squadre proposte (colorate per ordine). Geocodifica via Nominatim (riusa `_geoCache`), distanze via OSRM, senza persistenza Supabase (stato locale/sessione come Pianifica spostamenti). La tabla è ordinabile e ogni riga mostra commessa, squadra, distanza media, giorni disponibili (6 = piena settimana, decrescenti per ferie/doppia week), e percentuali matching skill/strumenti.

## v18.116.0
- feat: **Backup dati — ripristino da UI admin** — nel banner sync, nuovo pulsante "🗄️ Backup dati" (visibile solo agli admin, accanto a Log attività/Sessioni attive) che apre un selettore degli snapshot notturni disponibili (data/ora + conteggio righe). Scelto uno snapshot, il pulsante "Ripristina questo backup" — dopo un doppio avviso esplicito che l'operazione sostituisce integralmente i dati attuali — chiama la nuova RPC Postgres `restore_backup(backup_id, include_cp)`, che tronca e ripopola `staffing_state` (Griglia/Ferie/Doppia Week/Pipeline-Operatori-Staffing) e, se la checkbox è spuntata, anche `controllo_produzione`. La funzione gira `SECURITY DEFINER` ma verifica comunque a livello server che chi chiama sia admin (`auth.jwt() ->> role`), quindi non basta manomettere il JS lato client per attivarla; ogni ripristino viene loggato in `activity_log`. Nuova vista `data_backups_list` (RLS ereditata da `data_backups` via `security_invoker`) per popolare il selettore senza scaricare i payload jsonb completi. Dopo il ripristino la pagina si ricarica in automatico dopo 2,5s; gli altri utenti collegati devono ricaricare a mano (il canale realtime ascolta solo `UPDATE` su `staffing_state`, non `TRUNCATE`/`INSERT`).
- **Nota**: il meccanismo di backup vero e proprio (tabella `data_backups`, funzione `run_nightly_backup()`, job `pg_cron` giornaliero) era già stato introdotto separatamente lato Supabase il 2026-09-01 — vedi "Backup e ripristino dati" più sotto per i dettagli e la procedura via SQL Editor, ora affiancata da questa UI.

## v18.114.0
- feat: **Mappa squadre — toggle "👷 Operatori / 🔧 Strumenti" nella mappa Cantieri** (issue #5) — nella sola mappa Cantieri (non nella mappa Residenze operatori, dove non ha senso) è ora presente uno switch che cambia il focus della mappa e del pannello di destra. Lo strumento eventualmente assegnato alla squadra (dalla Griglia) compare ora sempre nel popup del marker e nella card del riepilogo, **anche in vista "Operatori"** (invariata per il resto). In vista **"Strumenti"** la mappa mostra solo i cantieri con almeno uno strumento assegnato, coi marker colorati per strumento invece che per commessa; il pannello di destra cambia completamente struttura, raggruppando **per commessa → strumento → dove** (cantiere/squadra) invece che per squadra; un bottone "🔧 Strumenti" accanto allo switch apre un pannello con **checkbox multi-selezione** per isolare sulla mappa uno o più strumenti specifici e vedere solo dove si trovano. Un'animazione di caricamento copre la mappa Cantieri durante la geocodifica (rate-limited su Nominatim) al cambio giorno/vista/filtro, così l'attesa non sembra un blocco dell'app. Ogni cantiere in elenco (trovato o no) ha ora un'icona ✏️ che apre un campo per correggerne manualmente la posizione, accettando sia un nome comune (ri-geocodificato su Nominatim) sia coordinate dirette nel formato "lat, lng"; la correzione va sempre confermata in un modale prima di essere salvata nella rubrica luoghi condivisa (`geo_cache_v1`), perché si applica a tutte le settimane in cui compare quel nome cantiere.
- fix: **z-index del modale di conferma/alert generico** (`showConfirmAsync`/`showAlertModal`, usato in tutta l'app) troppo basso (50) rispetto ai controlli/popup di Leaflet (fino a 1000) e ad altri modal dell'app (context menu 10001, modal operatore 10000): una conferma richiesta mentre la Mappa squadre è a schermo (come quella della correzione posizione qui sopra) restava visivamente coperta e non cliccabile. Portato a 10050, sopra tutto tranne le schermate di login/sessioni attive. Gli strumenti sono assegnati per squadra e non per singolo cantiere/giorno: se una squadra tocca più cantieri nel periodo mostrato, lo strumento compare su tutti — non c'è modo di sapere in quale si trovi fisicamente. Funziona sia nella vista per giorno sia in "Tutta la settimana", ed è compatibile col filtro Regione esistente. Nessuna modifica allo schema Supabase, nessun nuovo dominio di sync (stato UI locale, non persistito).

## v18.113.0
- feat: **Attestati dei dipendenti — nuova sezione “Attestati & scadenze” con import da Excel** — nuova sezione full-width in dashboard (collassata di default, sotto Pool operatori) che mappa gli attestati di sicurezza di **tutti** i dipendenti presenti nel file aziendale “EP - Elenco attestati dei dipendenti”, non solo di quelli nel pool del reparto: matrice dipendente × tipo di attestato con pallino di stato (verde = valido, ambra = in scadenza entro 90 giorni, rosso = scaduto, grigio = scadenza non nota), data di scadenza in cella (mm/aa) e dettaglio completo (data corso, data scadenza, giorni residui) nel tooltip; intestazione e colonna nome restano agganciate durante lo scroll. Filtri per nome, tipo di attestato, stato (“con almeno uno scaduto” / “in scadenza” / “senza alcun attestato”), ordinamento per nome o per urgenza, checkbox “solo pool operatori” ed export Excel in formato lungo (una riga per dipendente × attestato, con stato e giorni alla scadenza).
- feat: **Import Excel degli attestati** — pulsante “Importa Excel” che legge i tre fogli utili del file (“Elenco attestati”, “PES-PAV-PEI”, “Segnaletica stradale”). Il foglio principale contiene la data del **corso**, non quella di scadenza: la scadenza viene calcolata come corso + durata di validità del tipo (5/3/2/1 anni, come indicato tra parentesi nelle intestazioni del file) meno 1 giorno, formula verificata sulle date di scadenza esplicite dei fogli di dettaglio. Per Segnaletica stradale e PES-PAV-PEI/ENEL fanno fede i fogli dedicati (sono un soprainsieme del principale e portano la variante Preposto/Addetto e ENEL 1A/1B/2A/2B), quindi le colonne generiche del foglio principale vengono ignorate di proposito. Il nominativo viene abbinato al pool operatori con lo stesso matching per insiemi di parole già usato dall'import ferie (indipendente dall'ordine Nome/Cognome, tollerante agli accenti); un riepilogo pre-import elenca abbinati / ambigui / non nel pool con campo di ricerca, e solo gli abbinati aggiornano la scheda operatore. Reimportando un file aggiornato le voci di provenienza import vengono riallineate in blocco (anche in cancellazione), quelle inserite a mano nella scheda operatore restano invariate.
- feat: **Date di scadenza nella scheda operatore, nei match commessa e negli alert** — nel modal operatore ogni attestato ha ora un campo “data del corso” con la scadenza calcolata mostrata accanto (compilando la data la spunta si attiva da sola); i badge attestato nelle card, nel modal di allocazione e nella vista impegni sono colorati per stato di scadenza con il dettaglio nel tooltip. Nei controlli di idoneità un attestato **scaduto** non copre più il requisito della commessa e viene segnalato come “scaduto il gg/mm/aaaa” invece che genericamente “mancante”; il pannello alert ha una nuova voce “Attestati scaduti o in scadenza” (elenco troncato a 12 righe, il dettaglio sta nella sezione). Un attestato senza data nota non viene mai considerato scaduto, così i dati inseriti prima di questa versione restano validi.
- **Nessuna modifica allo schema Supabase e nessun nuovo dominio di sync**: il dettaglio date viaggia nel campo `attestati_dett` di ogni operatore e il registro completo nella nuova chiave `attestati_registro`, entrambi dentro il payload del dominio “core” (row id 1) già esistente.

## v18.112.0
- feat: **Mappa squadre — vista "Tutta la settimana"** — accanto ai bottoni dei giorni (Lun…Sab) c'è ora un bottone "📅 Tutta la settimana" che mostra la programmazione aggregata sull'intera week invece che divisa per giorno. In questa vista la mappa Cantieri disegna un marker per ogni combinazione **commessa + squadra + cantiere** toccata nella settimana (una sola volta, anche se ricorre in più giorni), con i giorni interessati indicati sia nel popup del marker sia come chip "Lun Mar Gio" sulla card in "Squadre & spostamenti"; l'attività mostrata è l'unione delle attività dei giorni su quel cantiere. Nella mappa Residenze operatori ogni operatore compare **una sola volta** con commesse e cantieri della settimana accorpati (la residenza è una sola: più marker sullo stesso punto sarebbero solo rumore) e i chip dei giorni in cui è assegnato. L'indicatore di spostamento "↗ cantiere precedente → cantiere" resta ovviamente solo nella vista per giorno, dove ha senso. Il filtro Regione e la ricerca manuale dei luoghi non trovati funzionano identici nelle due viste. Nessuna modifica allo schema Supabase, nessun nuovo dominio di sync (la scelta della vista è solo stato UI locale).

## v18.111.0
- feat: **Pianificazione Settimanale — nuova tab "Pianifica spostamenti"** — accanto a "Mappa squadre" c'è ora un pianificatore di itinerari in stile Google Maps: si indica un **comune di partenza** e si incolla un **elenco di comuni/tappe** (uno per riga), l'app li geocodifica (Nominatim, riusando la rubrica `geo_cache_v1` già condivisa con la Mappa squadre) e calcola l'ordine di visita più efficiente sulle **distanze e sui tempi reali di percorrenza in auto**, ottenuti dal servizio pubblico OSRM (matrice `/table`, tracciato stradale `/route` disegnato su mappa Leaflet). Tre versi di percorrenza selezionabili — "più lontano → rientro" (si parte dalla tappa più distante e ci si riavvicina progressivamente alla base), "più vicino → allontanamento" e "percorso più breve in assoluto" — più l'opzione "giro chiuso" che include il rientro alla partenza nel calcolo; sotto, l'algoritmo è un nearest-neighbour raffinato con 2-opt (con la prima tappa bloccata quando è stato scelto un verso). Il risultato è una tabella ordinata con km e tempo di ogni tratta più i progressivi e i totali, riordinabile a mano (▲▼) o sfoltibile (✕) senza rifare le chiamate di rete, con export Excel e PDF. Massimo 40 tappe per calcolo (limite del servizio di routing pubblico). L'ultimo itinerario resta salvato in `localStorage` (`pw_spost_v1`), per-browser come le altre preferenze UI: **nessuna modifica allo schema Supabase e nessun nuovo dominio di sync**.

## v18.110.0
- feat: **Mappa Squadre — doppia mappa Cantieri / Residenze operatori, filtro per regione** (issue #4) — la vista Mappa della Pianificazione Settimanale mostra ora due mappe impilate: quella già esistente dei cantieri assegnati (geocodificati via Nominatim) e una nuova mappa "Residenze operatori" che posiziona ciascun operatore assegnato quel giorno sul capoluogo della propria provincia di provenienza (o sul centroide della regione, se solo quella è nota) — dati già presenti in scheda operatore, nessun nuovo campo né nuova geocodifica. I marker usano lo stesso colore per commessa su entrambe le mappe, per confrontare a colpo d'occhio dove vive un operatore rispetto al cantiere assegnato. Aggiunto un filtro "Regione" condiviso dalle due mappe: per i cantieri filtra in base alla regione di lavorazione della commessa, per gli operatori in base alla loro regione di provenienza. Nessuna modifica allo schema Supabase.

## v18.109.0
- feat: **Ferie & Permessi — conferma prima di togliere la spunta** — nella Vista Ferie, deselezionare il checkbox di un giorno già assente ora chiede conferma ("Rimuovere l'assenza di [nome]?") prima di eliminare l'assenza, per evitare click accidentali su una griglia densa. Annullando, la spunta resta. Nessuna modifica allo schema Supabase.

## v18.108.0
- feat: **Import ferie da Excel — campo di ricerca nell'elenco nominativi non riconosciuti/ambigui** (seguito v18.107.0) — nel modal di conferma pre-import, sopra i riquadri scrollabili "non riconosciuti"/"ambigui", un campo di ricerca filtra dal vivo le righe per nome (contiene, case-insensitive) e mostra "N/tot" trovati, utile per verificare al volo se un nominativo specifico compare tra quelli scartati senza dover scorrere a mano centinaia di righe. Nessuna modifica allo schema Supabase.

## v18.107.0
- fix: **Import ferie da Excel — modal di conferma fuori schermo con molti nominativi non riconosciuti** (seguito v18.104.0) — importando un file con centinaia di dipendenti (es. l'intero elenco aziendale, comodo da esportare così invece di filtrare solo il reparto), il modal di conferma pre-import elencava tutti i nominativi non riconosciuti/ambigui come un'unica riga di testo separata da virgole, senza alcun limite di altezza: il modal cresceva a dismisura e usciva dallo schermo, utilizzabile solo con uno zoom-out estremo del browser. Sostituito con un modal dedicato: intestazione e pulsanti restano sempre visibili, il corpo scorre (max 85vh) e gli elenchi "non riconosciuti"/"ambigui" hanno ciascuno un riquadro con scrollbar propria (max 160px) e un nominativo per riga invece che in un'unica riga di testo. Nessuna modifica allo schema Supabase.

## v18.106.0
- fix: **"Non disponibile" ora visibile anche nella Griglia settimanale, non solo in Ferie** (seguito v18.105.0) — il tipo "Non disponibile" introdotto in v18.105.0 arrivava già come dato in `pwFerie`, ma diversi punti che leggono quel dato usavano ancora il vecchio confronto rigido `=== true`, rimasto scoperto dal cambio di modello dati: risultato, sia "Ferie" sia "Non disponibile" smettevano di essere riconosciuti nel modal di selezione operatore, nel bottone della cella (Griglia), nella cella giorno/cantiere (placeholder "🏖 ferie"), nel popover statistiche "In ferie o permesso" e in Controllo Produzione (un operatore assente sarebbe rientrato nelle righe da compilare). Corretto ovunque con `pwFerieTipo()` (già introdotto in v18.105.0). Aggiunto anche quanto mancava per la visibilità richiesta: il modal di selezione operatore e il bottone/cella della Griglia distinguono ora "FERIE" (rosso) da "NON DISPONIBILE" (viola) invece di mostrare genericamente "FERIE" per entrambi; la cella giorno mostra "🚫 non disponibile" invece di "🏖 ferie"; il report PDF di Controllo Produzione e il testo email di pianificazione riportano l'etichetta corretta per tipo. Nessuna modifica allo schema Supabase.

## v18.105.0
- feat: **Ferie & Permessi — tipo "Non disponibile" e distinzione manuale/importato** (seguito v18.104.0) — la cella pwFerie non è più un booleano puro ma un tipo (`'ferie'` o `'non_disponibile'`, retrocompatibile con le settimane già salvate che hanno ancora `true`): il click sul checkbox resta il toggle rapido "Ferie" come prima, il **click destro** sulla cella apre un mini-menu (coerente con quello già usato in Griglia per copia/incolla cantiere) per scegliere esplicitamente "🏖 Ferie" / "🚫 Non disponibile" (malattia, indisponibilità a trasferta...) o rimuovere l'assenza. Entrambi i tipi bloccano l'assegnazione in Griglia e contano come assenza ovunque nell'app (riepilogo "disponibili per giorno", conflitto Doppia Week, testo email pianificazione) esattamente come faceva "Ferie" prima. In griglia, "Non disponibile" ha ora un colore diverso (viola) da "Ferie" (rosso); le celle popolate da import Excel (v18.104.0) mostrano inoltre una barra laterale ciano sempre visibile, per distinguerle a colpo d'occhio da quelle inserite a mano — prima la differenza si vedeva solo passando il mouse sul badge ore. Aggiunta una legenda colori sopra la griglia Ferie. Nessuna modifica allo schema Supabase (stesso campo `pw_ferie`, solo il tipo di valore salvato al suo interno cambia).

## v18.104.0
- feat: **Ferie & Permessi — import da Excel** — nella Vista Ferie della Pianificazione Settimanale, nuovo pulsante "📥 Importa Excel" che legge un export "ORE NON LAVORATE" del gestionale presenze (colonne Dipendente, descrizione, dataintervento - Anno/Mese/Giorno, Somma di durata) e spunta automaticamente i giorni di assenza per gli operatori riconosciuti, coprendo tutte le settimane presenti nel file (non solo quella aperta). Il match del nominativo è indipendente dall'ordine Nome/Cognome e tollera i refusi tipici di questi export (accenti traslitterati con apostrofo tipo "Nicolo'", underscore/spazi doppi); prima di applicare, un riepilogo mostra righe lette/applicate e l'elenco dei nominativi non riconosciuti o ambigui, che vanno quindi corretti a mano. Ogni giorno spuntato da import mostra ora un badge con il totale ore, con tooltip e popover di dettaglio (click) che elenca ore e descrizione di ogni voce (ferie, permesso, 104, congedo, chiusura aziendale...); togliendo la spunta a mano il dettaglio importato viene scartato. Nuova chiave payload `pw_ferie_dettagli` nello stesso dominio Supabase "ferie" (row id 3) di `pw_ferie` — nessuna nuova riga/tabella.

## v18.103.0
- feat: **Sottotask Jira — pre-selezione automatica di ciò che è già stato fatto** — riaprendo lo step "Crea sottotask Jira" per una commessa già lavorata in parte, i comuni per cui **tutti** gli operatori hanno già un sottotask (creato o già esistente, vedi badge in Griglia da v18.102.0) partono ora con "salta" pre-selezionato e i selettori Epic/Task disattivati, invece di dover essere saltati a mano ogni volta; per i comuni completati solo in parte, nello step successivo di selezione puntuale i singoli operatori già coperti partono deselezionati con una nota "🎫 già presente · <chiave ticket>". In entrambi i casi resta possibile riselezionare a mano per rifare la verifica o ricreare il sottotask. Nessuna modifica allo schema Supabase.

## v18.102.0
- feat: **Sottotask Jira — comuni raggruppati per squadra, "salta tutti" per squadra, verifica "già esistente" in tempo reale e badge persistente in Griglia** — nello step "Crea sottotask Jira" (scelta Epic/Task per comune) la lista, prima piatta e caotica quando c'erano molti comuni/squadre nella stessa commessa, è ora raggruppata in sezioni collassabili per squadra (con "Espandi tutto"/"Comprimi tutto" globali e "salta tutti"/"includi tutti" per singola squadra); appena si sceglie il Task per un comune parte in automatico una verifica dryRun su Jira che mostra subito, riga per riga, quanti sottotask sono già presenti ("🔵 N già esistenti") e quanti andrebbero creati ("🟢 N da creare"), senza dover attendere lo step di anteprima finale. Inoltre ogni cella cantiere della Griglia mostra ora un badge 🎫 (con link al ticket Jira) quando per quell'operatore/comune un sottotask risulta già esistente o è stato creato, rimovibile manualmente con una "×"; il badge è legato al comune+operatore (non alla singola cella), quindi si azzera da solo se si rinomina il cantiere e non viene mai portato con sé da un copia/incolla di cella o settimana su un altro operatore. Nessuna modifica allo schema Supabase (il nuovo campo `jiraSubtask` viaggia nel blob JSON già sincronizzato del dominio "planning").

## v18.99.0
- feat: **Notifica "nuova versione disponibile" per le schede già aperte** — dopo un deploy, chi aveva già l'app aperta continuava a usare il JS vecchio in memoria finché non ricaricava manualmente. Ora un controllo periodico (ogni 5 minuti) confronta la versione mostrata in header con quella dell'`index.html` effettivamente pubblicato; se diversa, compare un banner non invasivo con un pulsante "Aggiorna ora" (nessun reload forzato, per non interrompere una modifica in corso su una cella). Nessuna modifica allo schema Supabase.

## v18.98.0
- feat: **Log Attività admin — tracciate anche le modifiche a Griglia, Ferie e Doppia Week** — finora il Log Attività (pannello admin) registrava solo le azioni sul dominio "core" (operatori, commesse pipeline, login): un salvataggio sulla Griglia settimanale, su Ferie o su Doppia Week non lasciava alcuna traccia, rendendo impossibile capire chi/quando avesse modificato una cella. Ora ogni push su Supabase di questi domini registra una riga "Modifica Griglia" / "Modifica Ferie" / "Modifica Doppia Week" con utente, orario e settimana (anno/settimana ISO) interessata — non è ancora un diff cella-per-cella (il payload resta un unico blob JSON per dominio, senza storicizzazione delle versioni precedenti), ma da ora è possibile risalire a chi ha toccato una determinata settimana e quando. Nessuna modifica allo schema Supabase (usa la tabella `activity_log` già esistente).

## v18.97.0
- fix: **Griglia settimanale — il badge meteo spariva senza traccia quando i dati non erano disponibili** — se per tutti i cantieri pianificati in un giorno il meteo non era risolvibile (geocoding non ancora completato/fallito, o fetch Open-Meteo fallita — quest'ultima non ha TTL infinita come il geocoding: scade ogni ora e va ririchiesta con successo per restare visibile), il badge non veniva renderizzato affatto: nessun elemento, nessun modo di capire il motivo. Ora in questi casi compare comunque un badge segnaposto (🌡️ …) cliccabile, e il modal di dettaglio mostra un messaggio specifico per cantiere ("Localizzazione in corso…", "Località non riconosciuta" o "Servizio meteo momentaneamente non raggiungibile") invece del generico "Meteo non disponibile"; aggiunto anche un `console.warn` quando la fetch Open-Meteo fallisce, per poter diagnosticare un servizio bloccato da rete/proxy senza dover leggere il codice. Nessuna modifica allo schema Supabase.

## v18.96.0
- feat: **Mappa Squadre — colonna "Squadre & spostamenti" raggruppata per commessa e cliccabile** — le card squadra nella colonna a destra della mappa sono ora raggruppate sotto un header per commessa, espandibile/comprimibile con un click (stato mantenuto mentre si cambia giorno); cliccando su una card la mappa si centra e zooma sul marker corrispondente, ne apre il popup e lo evidenzia con un alone pulsante, sincronizzando anche l'evidenziazione della card. Nessuna modifica allo schema Supabase.

## v18.95.0
- feat: **Sottotask Jira — selezione puntuale dei sottotask da creare** (issue #1, seguito v18.93.0) — nel flusso "🎫 Sottotask Jira" aggiunto uno step tra la scelta di Epic/Task e i campi extra: una lista con checkbox di tutti i sottotask proposti (comune/operatore/task), con "Seleziona tutti"/"Deseleziona tutti", per escludere puntualmente singoli operatori senza dover saltare l'intero comune (la spunta "salta" dello step precedente resta per escludere un comune intero già prima della scelta Epic/Task). Nessuna modifica allo schema Supabase.

## v18.94.0
- fix: **Conferma mancante su alcune azioni distruttive** (issue #2) — aggiunta una richiesta di conferma, prima assente, per: rimozione di un'assegnazione operatore↔commessa (chip "×" in Pipeline e riga nel modal impegni operatore), rimozione di un singolo mese di allocazione gg-uomo (icona 🗑 nel modal impegni operatore), rimozione di una squadra dalla Griglia settimanale (prima confermava solo se era l'unica squadra rimasta) e rimozione di un operatore da una squadra della Griglia settimanale. Nessuna modifica allo schema Supabase.

## v18.93.0
- fix: **Sottotask Jira — creazione falliva per campi obbligatori mancanti e assignee non assegnabile** — su alcuni progetti Jira la creazione del sottotask falliva con errori come "Inserire: Stima originale", "Inserire: Data di scadenza", "Inserire: Attività di 2° Livello" perché quei campi sono obbligatori in fase di creazione ma l'API `createmeta` di Jira non lo segnala (li marca `required: false`, verificato empiricamente). Aggiunto un nuovo step nel flusso "🎫 Sottotask Jira" (dopo la scelta di Epic/Task, prima dell'anteprima) che rileva quali di questi campi esistono per il progetto (Data di scadenza, Stima originale, Activity Type, Target Production, Start date pianificato, Tempo Team) e li mostra in un form con un valore di esempio precompilato, modificabile o lasciabile vuoto; se il progetto non li usa lo step viene saltato. Corretto anche un secondo errore separato ("Utente ... non può essere assegnato ai ticket"): la risoluzione dell'assignee da email ora usa la ricerca "utenti assegnabili al progetto" invece della ricerca utenti globale, evitando di scegliere un account Jira esistente ma privo dei permessi su quel progetto specifico.
  - Aggiornata la Edge Function `jira-create-subtask` (stesso nome, nuovo `mode: "fields"` per la scoperta dei campi extra e nuovo parametro opzionale `extraFields` in creazione), nessuna nuova Edge Function da deployare.

## v18.92.0
- feat: **Griglia settimanale — copia/incolla cantiere e attività tra operatori** — click destro su una cella giorno apre un menu con "Copia cantiere/attività" e "Incolla qui", per duplicare cantiere/i + attività su un altro operatore/squadra/commessa senza ridigitarli; click destro sulla colonna del nome operatore apre invece "Copia settimana" / "Incolla settimana qui" per duplicare tutti e 6 i giorni (Lun-Sab) in un colpo solo su un altro operatore. Nessuna modifica allo schema Supabase, il clipboard vive solo in memoria per la sessione corrente.

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

## Backup e ripristino dati

I dati veri (pipeline, operatori, staffing, pianificazione settimanale, controllo produzione) vivono solo in Supabase — non c'è un seed locale recuperabile. `staffing_state` viene sovrascritta a ogni salvataggio (`upsert`, nessuno storico), quindi una cancellazione o un import errato non è di per sé recuperabile dall'app.

**Rete di sicurezza attuale**: un job `pg_cron` (`nightly_staffing_backup`) gira ogni notte alle 02:00 UTC e chiama `run_nightly_backup()`, che salva uno snapshot completo di `staffing_state` + `controllo_produzione` nella tabella `data_backups` (retention 30 giorni). È il minimo indispensabile per poter tornare indietro, non un audit trail completo: se un dato viene cancellato e ripristinato lo stesso giorno prima del backup notturno successivo, si perde comunque quanto scritto tra l'ultimo snapshot buono e il ripristino.

**Ripristino da UI (consigliato, da v18.115.0)**: un admin loggato trova nel banner sync il pulsante "🗄️ Backup dati", che apre un selettore con gli snapshot disponibili (data/ora + conteggio righe) e un pulsante "Ripristina questo backup" (con checkbox per includere o meno `controllo_produzione`). Dopo la conferma la pagina si ricarica da sola; gli altri utenti collegati vanno avvisati di ricaricare a mano. Sotto, la stessa procedura via SQL Editor — utile se l'app non è raggiungibile o per un controllo più fine.

Per vedere i backup disponibili (via SQL Editor su Supabase, utente admin):
```sql
select id, created_at, jsonb_array_length(staffing_state) as righe_staffing, jsonb_array_length(controllo_produzione) as righe_cp
from data_backups order by created_at desc;
```

Per forzare uno snapshot immediato (es. prima di un'importazione rischiosa):
```sql
select run_nightly_backup();
```

**Ripristino** (sostituisce interamente la tabella scelta con lo snapshot `<ID_BACKUP>` — verificare prima con la query sopra quale snapshot è quello buono):
```sql
-- Ripristina staffing_state (pipeline/operatori/staffing + griglia/ferie/doppia week)
truncate table staffing_state;
insert into staffing_state
select * from jsonb_populate_recordset(null::staffing_state, (select staffing_state from data_backups where id = <ID_BACKUP>));

-- Ripristina anche controllo_produzione, solo se necessario
truncate table controllo_produzione;
insert into controllo_produzione
select * from jsonb_populate_recordset(null::controllo_produzione, (select controllo_produzione from data_backups where id = <ID_BACKUP>));
```
Dopo il ripristino, ricaricare la pagina dell'app (o attendere il pull realtime) perché gli utenti collegati vedano i dati ripristinati.

Limite noto: il progetto Supabase è sul piano **Free**, che non include backup automatici/PITR nativi di Supabase — questo meccanismo è l'unica rete di sicurezza. Per un ripristino punto-per-punto più fine (non solo giornaliero) o per non avere alcuna finestra di perdita, valutare l'upgrade a Supabase Pro.

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
