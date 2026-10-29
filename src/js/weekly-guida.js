/* ==================== GUIDA CLICK DESTRO — PIANIFICAZIONE SETTIMANALE ==================== */

// Testi della guida col click destro sui bottoni della Pianificazione Settimanale. Le chiavi
// sono quelle ricavate da helpKeysFor (dashboard-crud-helpers.js): data-help-key, '#' + id,
// oppure la funzione dell'onclick/onchange ('fn:arg' / 'fn'). Un bottone nuovo nella
// settimanale = un testo qui (o accanto alla sua funzione, come cp-carica-report).
// Non dare un testo a closeModal/cpaToggle: le usano anche i bottoni di chiusura.

// ---- Barra della settimana, schede e strumenti in testata ----
// ← Prec.
HELP_TEXTS['#pw-prev'] = 'Passa alla settimana precedente (al cambio d\'anno va all\'ultima settimana dell\'anno prima) e ricarica la scheda aperta su quella settimana.\n\nSolo navigazione: non modifica nessun dato. La settimana scelta viene ricordata da questo browser alla prossima apertura. Doppia Week e Storico meteo hanno una navigazione propria e non dipendono da questa.';
// Succ. →
HELP_TEXTS['#pw-next'] = 'Passa alla settimana successiva (dopo l\'ultima settimana dell\'anno va alla prima dell\'anno dopo) e ricarica la scheda aperta su quella settimana.\n\nSolo navigazione: non modifica nessun dato. La settimana scelta viene ricordata da questo browser alla prossima apertura. Doppia Week e Storico meteo hanno una navigazione propria e non dipendono da questa.';
// Oggi
HELP_TEXTS['#pw-today'] = 'Torna alla settimana corrente, cioè quella che contiene la data di oggi, restando nella scheda aperta.\n\nSolo navigazione: non modifica nessun dato.';
// 🖨 Stampa
HELP_TEXTS['#pw-print'] = 'Apre la finestra di stampa del browser per la scheda visualizzata in questo momento, di solito la Griglia della settimana.\n\nBarre degli strumenti, schede e bottoni vengono esclusi dalla stampa. Non modifica nessun dato.';
// 📋 Griglia settimanale
HELP_TEXTS['#pw-tab-griglia'] = 'Mostra la Griglia della settimana selezionata: commesse, squadre e operatori, con cantiere e attività giorno per giorno (lunedì–sabato).\n\nLe modifiche fatte in Griglia vengono salvate e condivise con i colleghi in tempo reale. Per modificare serve il ruolo admin o responsabile; gli altri ruoli la consultano in sola lettura.';
// 🏖 Ferie / Permessi
HELP_TEXTS['#pw-tab-ferie'] = 'Mostra il prospetto Ferie / Permessi della settimana selezionata. Per ogni operatore e giorno si segna Ferie o Non disponibile; sotto c\'è il riepilogo degli operatori disponibili per giorno.\n\nLe assenze sono condivise con i colleghi e vengono usate anche dalla Doppia Week. Per modificarle serve il ruolo admin o responsabile.';
// 🗺 Mappa squadre
HELP_TEXTS['#pw-tab-mappa'] = 'Mostra la settimana selezionata su due mappe. Nella prima ci sono i cantieri pianificati: per giorno o per tutta la settimana, filtrabili per regione, evidenziando operatori o strumenti. Nella seconda ci sono le residenze degli operatori.\n\nÈ una vista di consultazione. Le posizioni dei cantieri vengono cercate in automatico dal nome. Se correggi a mano una posizione (✏️), la correzione vale per tutti i colleghi e per tutte le settimane in cui compare quel cantiere.';
// 🧭 Pianifica spostamenti
HELP_TEXTS['#pw-tab-spostamenti'] = 'Apre il pianificatore di percorsi. Inserisci un comune di partenza e un elenco di tappe, e calcola l\'ordine di visita con distanze e tempi reali su strada.\n\nÈ uno strumento indipendente dalla Griglia: non legge e non modifica la pianificazione. Le tappe e l\'ultimo percorso restano salvati solo in questo browser.';
// 🔍 Ricerca Squadre
HELP_TEXTS['#pw-tab-ricerca-squadre'] = 'Apre la Ricerca Squadre. Indichi uno o più cantieri da coprire, con eventuali skill, strumenti e data entro cui intervenire. Le squadre pianificate nella settimana selezionata vengono ordinate per distanza stradale dal cantiere in cui si trovano.\n\nNon modifica la Griglia: è solo un supporto alla decisione.';
// 🤖 Auto-pianifica
HELP_TEXTS['#pw-tab-autoplan'] = 'Apre Auto-pianifica. Da un elenco di cantieri con priorità calcola una bozza di Griglia per la settimana selezionata. L\'elenco può essere incollato, preso da un file Excel/CSV, inserito a mano o ripreso dalla settimana precedente. Puoi farti aiutare dall\'assistente in chat, se vuoi.\n\nLa bozza resta solo in questo browser finché non la applichi. In Griglia arriva solo ciò che confermi esplicitamente, senza sovrascrivere le celle già compilate, e l\'applicazione si può annullare.';
// 📊 Controllo produzione
HELP_TEXTS['#pw-tab-controllo'] = 'Apre il Controllo produzione della settimana selezionata. Per ogni operatore e giorno pianificato in Griglia mostra insieme le ore registrate su Jira, le ore del report di produzione, le ore MySond e i Km/Cad.\n\nI dati sono condivisi con i colleghi. All\'apertura vengono letti i valori già salvati: per aggiornare le ore da Jira serve «Sincronizza da Jira».';
// 🌦️ Storico meteo
HELP_TEXTS['#pw-tab-meteo-storico'] = 'Mostra, per ogni cantiere pianificato in Griglia, il meteo realmente osservato nei giorni già passati e il bollettino della Protezione Civile di quel giorno. Puoi filtrare per periodo e fare ricerche.\n\nIl periodo è indipendente dalla settimana selezionata in alto. Lo storico viene recuperato e salvato in automatico in un archivio comune. I dati degli ultimi 7 giorni sono provvisori e si consolidano da soli.';
// 🔁 Doppia Week
HELP_TEXTS['#pw-tab-doppia'] = 'Apre il prospetto mensile Doppia Week, con le settimane del mese per ogni operatore attivo. Cliccando una cella assegni o rimuovi una doppia week: due settimane di fila, con rientro il giovedì e riposo compensativo il venerdì della seconda.\n\nLe assegnazioni sono condivise con i colleghi e richiedono il ruolo admin o responsabile. Non si possono assegnare a chi è in ferie in una delle due settimane. Il mese si sceglie con le frecce del prospetto, non con la settimana in alto.';
// Meteo settimana
HELP_TEXTS['#pw-weather-week-btn'] = 'Apre l\'elenco delle criticità meteo nei cantieri pianificati nella settimana selezionata, raggruppate per giorno e commessa. Cliccando una riga vai alla cella corrispondente in Griglia.\n\nPer i giorni a venire usa le previsioni meteo e, solo per oggi e domani, anche il bollettino ufficiale della Protezione Civile. Per i giorni già passati usa il meteo osservato. Il colore e il testo del bottone riassumono l\'esito (verde = nessuna criticità). È solo consultazione.';
// 📝 Note/Variazioni
HELP_TEXTS['#pw-nv-btn'] = 'Apre la lavagna Note / Variazioni della settimana selezionata. Contiene messaggi con autore e data/ora: variazioni rispetto alla programmazione oppure note generali, eventualmente riferite a un giorno preciso.\n\nI messaggi sono condivisi con tutti i colleghi e si aggiornano in tempo reale. Il numero tra parentesi indica quanti messaggi ci sono. Possono scrivere solo admin e responsabili; gli altri ruoli possono solo leggere.';
// ↶ Indietro
HELP_TEXTS['#pw-undo-btn'] = 'Annulla la tua ultima modifica in Pianificazione settimanale (Griglia, Ferie o Doppia week). Se la modifica riguarda un\'altra settimana, la vista si sposta su quella. Scorciatoia: Ctrl+Z.\n\nL\'annullamento viene salvato e condiviso come una normale modifica. Le modifiche dei colleghi non vengono annullate; se un collega ha cambiato gli stessi dati dopo di te, ti viene chiesta conferma. La lavagna Note/Variazioni e il Controllo produzione non sono coperti.\n\nLa cronologia arriva fino a 50 passi, vale solo per questa sessione e si azzera ricaricando la pagina. Serve il ruolo admin o responsabile.';
// ↷ Avanti
HELP_TEXTS['#pw-redo-btn'] = 'Ripristina la modifica appena annullata con «Indietro». Scorciatoia: Ctrl+Y (oppure Ctrl+Maiusc+Z).\n\nCome per Indietro, il ripristino viene salvato e condiviso con i colleghi. Se fai una nuova modifica, i passi ancora ripristinabili vengono persi. La cronologia vale solo per questa sessione.';
// + Aggiungi commessa
HELP_TEXTS['#pw-add-commessa'] = 'Aggiunge in fondo alla Griglia della settimana selezionata un nuovo blocco commessa vuoto, con una «Squadra 1» e una riga operatore da compilare.\n\nRiguarda solo questa settimana e viene salvato subito, quindi lo vedono anche i colleghi. Serve il ruolo admin o responsabile. Puoi annullarlo con «Indietro».';
// Collassa / Espandi
HELP_TEXTS['#pw-collapse-all'] = 'Chiude tutte le commesse e le squadre della Griglia, per avere una vista compatta. Se sono già tutte chiuse, le riapre.\n\nCambia solo la visualizzazione in questo browser e non modifica dati. Lo stato resta finché non ricarichi la pagina.';
// ☑ Seleziona risultati
HELP_TEXTS['#pw-ferie-search-sel'] = 'Aggiunge alla selezione per la modifica massiva tutti gli operatori trovati dalla ricerca nella vista Ferie. Chi era già selezionato resta selezionato.\n\nNon modifica ancora nessuna assenza: le azioni sugli operatori selezionati si scelgono poi dalla barra che compare sopra il prospetto.';
// Mese precedente / successivo
HELP_TEXTS['pwDwMonthNav'] = 'Passa al mese precedente (‹) o successivo (›) nel prospetto Doppia Week.\n\nSolo navigazione: non cambia la settimana selezionata in alto e non modifica dati.';
// 📄 Esporta PDF
HELP_TEXTS['pwDoppiaWeekExportPDF'] = 'Scarica un PDF orizzontale, in una sola pagina, con il prospetto Doppia Week del mese mostrato. Usa gli stessi filtri di provenienza e lo stesso ordinamento della schermata.\n\nNel PDF compaiono solo gli operatori con almeno una doppia week nel mese. Non modifica nessun dato.';
// Giorno della mappa
HELP_TEXTS['pw-map-day'] = 'Sceglie il giorno della settimana selezionata da mostrare sulle mappe Cantieri e Residenze. «Tutta la settimana» mostra tutti i giorni insieme.\n\nCambia solo la visualizzazione e non modifica dati.';
// 🔧 Filtro strumenti
HELP_TEXTS['#pw-map-strumento-filter-btn'] = 'Compare solo in modalità «🔧 Strumenti» della mappa Cantieri. Apre l\'elenco degli strumenti: sulla mappa restano solo i cantieri delle squadre a cui sono assegnati gli strumenti scelti. «Nessun filtro» li mostra di nuovo tutti.\n\nCambia solo la visualizzazione e non modifica dati.';
// Nessun filtro
HELP_TEXTS['#pw-map-str-filter-clear'] = 'Toglie il filtro per strumento dalla mappa Cantieri e torna a mostrare tutti i cantieri.\n\nCambia solo la visualizzazione e non modifica dati.';
// 🧭 Calcola percorso
HELP_TEXTS['#pw-spost-calcola'] = 'Calcola il percorso tra il comune di partenza e le tappe inserite (una per riga, al massimo 40), con l\'ordinamento scelto e, se spuntato, il ritorno alla partenza. Se il campo partenza è vuoto, si parte dalla prima riga.\n\nMostra sulla mappa e in tabella l\'itinerario, i chilometri e i tempi di guida reali su strada. Le tappe non trovate vengono escluse e segnalate.\n\nNon tocca la Griglia: il risultato resta salvato solo in questo browser. Le località trovate vengono invece aggiunte alla rubrica comune delle posizioni.';
// 🧹 Pulisci
HELP_TEXTS['#pw-spost-clear'] = 'Dopo una conferma, cancella partenza, tappe e percorso calcolato di Pianifica spostamenti.\n\nRiguarda solo i dati salvati in questo browser: non tocca la Griglia né i dati dei colleghi.';
// ⬇ Esporta Excel
HELP_TEXTS['pwSpostExportXlsx'] = 'Scarica in Excel l\'itinerario calcolato: ordine delle tappe, chilometri e minuti di ogni tratta, e i valori progressivi.\n\nFunziona solo dopo aver calcolato un percorso. Non modifica nessun dato.';
// 📄 PDF
HELP_TEXTS['pwSpostExportPdf'] = 'Scarica in PDF l\'itinerario calcolato, con partenza, chilometri totali, tempo di guida e dettaglio delle tratte.\n\nFunziona solo dopo aver calcolato un percorso. Non modifica nessun dato.';
// Seleziona skills…
HELP_TEXTS['#rs-tappa-skills-btn'] = 'Apre l\'elenco delle skill da richiedere per la tappa che stai per aggiungere. L\'elenco contiene solo le skill degli operatori pianificati nella settimana selezionata.\n\nÈ facoltativo: serve a far vedere nel ranking quali squadre coprono i requisiti. Non modifica dati.';
// Seleziona strumenti…
HELP_TEXTS['#rs-tappa-strumenti-btn'] = 'Apre l\'elenco degli strumenti da richiedere per la tappa che stai per aggiungere. L\'elenco contiene solo gli strumenti assegnati alle squadre della settimana selezionata.\n\nÈ facoltativo: serve a far vedere nel ranking quali squadre coprono i requisiti. Non modifica dati.';
// ➕ Aggiungi tappa
HELP_TEXTS['rsAddTappa'] = 'Aggiunge all\'elenco il cantiere da coprire scritto nel campo (comune o indirizzo, oppure coordinate «lat, lng»), con le skill, gli strumenti e la data priorità selezionati. Poi svuota i campi per la tappa successiva.\n\nLa località viene cercata sulla mappa e memorizzata nella rubrica comune delle posizioni. Non modifica la Griglia.';
// 🔍 Calcola ranking
HELP_TEXTS['#rs-calcola-btn'] = 'Ordina le squadre pianificate nella settimana selezionata in base alla distanza stradale tra i cantieri in cui si trovano e le tappe aggiunte. Se la settimana è quella corrente, conta solo i giorni da oggi in poi. Per ogni squadra indica quando muoversi, da quale cantiere partire e se copre skill e strumenti richiesti.\n\nLe squadre senza cantieri nella settimana sono escluse. Se il servizio dei percorsi non risponde, si usano le distanze in linea d\'aria. Non modifica la Griglia.';
// 🧹 Pulisci
HELP_TEXTS['rsPulisci'] = 'Svuota l\'elenco delle tappe, i risultati del ranking e le selezioni di skill, strumenti e data priorità.\n\nAgisce subito, senza chiedere conferma, ma riguarda solo questa ricerca: la Griglia non viene toccata.';
// Solo squadre compatibili
HELP_TEXTS['#rs-solo-compatibili'] = 'Se è spuntato, il ranking mostra solo le squadre che coprono tutti i requisiti (skill e strumenti) delle tappe.\n\nÈ solo un filtro sui risultati e non modifica dati.';
// × Cancella ricerca
HELP_TEXTS['#cp-search-op-clear'] = 'Cancella la ricerca operatore/cantiere del Controllo produzione e riporta la tabella com\'era, con commesse e squadre aperte o chiuse come le avevi lasciate.\n\nNon modifica dati.';
// Collassa / Espandi
HELP_TEXTS['#cp-collapse-all'] = 'Chiude tutte le commesse e le squadre della tabella Controllo produzione. Se sono già tutte chiuse, le riapre.\n\nCambia solo la visualizzazione in questo browser e non modifica dati.';
// ⬇ Esporta Excel
HELP_TEXTS['pwControlloExport'] = 'Scarica in Excel il Controllo produzione della settimana selezionata, con una riga per operatore e giorno: commessa, squadra, cantiere, attività, verificato, Ore Jira, ticket ed Epic, Ore Report Prod., differenza ore, Km/Cad e note.\n\nEsporta i valori così come sono salvati: se ti servono le ore aggiornate, sincronizza prima da Jira. Non modifica nessun dato.';
// 📄 Report PDF
HELP_TEXTS['pwControlloExportPDF'] = 'Scarica un PDF orizzontale con il report di produzione della settimana selezionata, pensato per l\'invio al PM. È organizzato per giorno e per ogni operatore riporta cantiere, Ore Jira, Ore Report Prod., ticket, Epic e altre informazioni (per esempio le ferie).\n\nUsa i valori salvati, quindi conviene sincronizzare prima da Jira. Non modifica nessun dato.';
// 🔀 Variazione
HELP_TEXTS['pwNvSetTipo:variazione'] = 'Imposta il messaggio che stai scrivendo come Variazione, cioè un cambiamento rispetto alla programmazione della settimana (per esempio un operatore spostato su un altro cantiere).\n\nNon pubblica ancora nulla: il messaggio parte solo con «Pubblica».';
// 📝 Nota
HELP_TEXTS['pwNvSetTipo:nota'] = 'Imposta il messaggio che stai scrivendo come Nota, cioè un\'informazione generale sulla settimana che non è una variazione della programmazione.\n\nNon pubblica ancora nulla: il messaggio parte solo con «Pubblica».';
// Pubblica
HELP_TEXTS['#pw-nv-pubblica'] = 'Pubblica il messaggio sulla lavagna della settimana, con il tipo (Nota o Variazione) e il giorno scelti. Autore e data/ora vengono aggiunti in automatico. Scorciatoia: Ctrl+Invio.\n\nIl messaggio è subito visibile a tutti i colleghi e non si può modificare: per correggerlo devi eliminarlo e riscriverlo. Serve il ruolo admin o responsabile. Lunghezza massima 2000 caratteri.';
// Tutte
HELP_TEXTS['pwNvSetFiltro:tutte'] = 'Mostra tutti i messaggi della lavagna della settimana, sia note sia variazioni. Il numero indica quanti sono.\n\nÈ solo un filtro di visualizzazione.';
// Variazioni
HELP_TEXTS['pwNvSetFiltro:variazione'] = 'Mostra solo le Variazioni della lavagna della settimana. Il numero indica quante sono.\n\nÈ solo un filtro di visualizzazione.';
// Note
HELP_TEXTS['pwNvSetFiltro:nota'] = 'Mostra solo le Note della lavagna della settimana. Il numero indica quante sono.\n\nÈ solo un filtro di visualizzazione.';

// ---- Griglia, Ferie, Doppia Week, Mappa squadre, Mail, Storico meteo ----
// Scegli operatore
HELP_TEXTS['pwOpenOpModal'] = 'Apre l\'elenco per scegliere l\'operatore di questa riga della squadra, nella settimana mostrata. In cima ci sono i liberi, poi chi è già assegnato altrove, in ferie o non disponibile. A parità di stato vengono prima i senior (se in squadra non ce n\'è ancora uno), poi chi è nello staffing della commessa nel mese, poi chi abita più vicino alla zona della commessa.\n\nPuoi filtrare per regione/provincia, seniority, doppia week, skill e attestati. Compaiono anche i dipendenti dei fornitori esterni.\n\nLa scelta si salva nella Griglia condivisa con i colleghi; i cantieri già scritti nella riga restano. Se l\'operatore ha limitazioni nell\'idoneità medica viene chiesta conferma. Serve il ruolo admin o responsabile.';
// ✕ rimuovi operatore
HELP_TEXTS['pwRemoveOp'] = 'Toglie questo operatore dalla squadra insieme a tutti i cantieri e le attività che ha nella settimana mostrata. Chiede conferma.\n\nLe altre settimane non cambiano. La modifica si salva nella Griglia condivisa con i colleghi e, finché non ricarichi la pagina, si può annullare con Indietro. L\'ultimo operatore di una squadra non si può rimuovere. Serve il ruolo admin o responsabile.';
// + cantiere
HELP_TEXTS['pwAddCantiereField'] = 'Aggiunge un altro campo cantiere, con la sua attività, nella cella di questo operatore e giorno: serve quando lavora su più cantieri nello stesso giorno.\n\nIl nuovo campo nasce vuoto. Si salva nella Griglia condivisa con i colleghi. Serve il ruolo admin o responsabile.';
// ✕ togli cantiere
HELP_TEXTS['pwRemoveCantiereField'] = 'Toglie questo cantiere, con la sua attività, dalla cella dell\'operatore per quel giorno; gli altri cantieri della cella restano. Non chiede conferma.\n\nCompare solo quando la cella ha più di un cantiere. Si salva nella Griglia condivisa con i colleghi. Un sottotask Jira eventualmente già creato per quel cantiere non viene toccato su Jira. Serve il ruolo admin o responsabile.';
// Apri / chiudi squadra
HELP_TEXTS['pwToggleSq'] = 'Chiude o riapre il riquadro di questa squadra nella Griglia, per fare spazio.\n\nCambia solo la vista nel tuo browser e non modifica la pianificazione. Lo stato vale per la settimana mostrata e si perde ricaricando la pagina.';
// + Operatore
HELP_TEXTS['pwAddOp'] = 'Aggiunge una riga operatore vuota a questa squadra, nella settimana mostrata. Poi scegli il nome con il bottone della riga e compila i cantieri giorno per giorno.\n\nSi salva nella Griglia condivisa con i colleghi. Serve il ruolo admin o responsabile.';
// ▲ Sposta squadra su
HELP_TEXTS['pwMoveSquadraUp'] = 'Sposta la squadra di una posizione più in alto dentro la commessa, solo nella settimana mostrata.\n\nCambia l\'ordine con cui compare in Griglia e nella mail settimanale; operatori e cantieri non cambiano. Si salva nella Griglia condivisa. È disattivo sulla prima squadra o senza ruolo admin/responsabile.';
// ▼ Sposta squadra giù
HELP_TEXTS['pwMoveSquadraDown'] = 'Sposta la squadra di una posizione più in basso dentro la commessa, solo nella settimana mostrata.\n\nCambia l\'ordine con cui compare in Griglia e nella mail settimanale; operatori e cantieri non cambiano. Si salva nella Griglia condivisa. È disattivo sull\'ultima squadra o senza ruolo admin/responsabile.';
// ✕ Rimuovi squadra
HELP_TEXTS['pwRemoveSquadra'] = 'Elimina questa squadra dalla commessa nella settimana mostrata, con tutti i suoi operatori, cantieri e strumenti. Chiede conferma.\n\nLe squadre con nome predefinito («Squadra N») vengono rinumerate. Si salva nella Griglia condivisa con i colleghi e, finché non ricarichi la pagina, si può annullare con Indietro. I sottotask Jira già creati non vengono toccati. Serve il ruolo admin o responsabile.';
// Strumento
HELP_TEXTS['pwStrOpen'] = 'Apre una tendina con ricerca per scegliere lo strumento in questa posizione della squadra. Ci sono gli strumenti del progetto Jira GAR (dall\'elenco salvato nel browser) e quelli messi a disposizione dai fornitori.\n\nLa scelta vale per la settimana mostrata e si salva nella Griglia condivisa; su Jira non viene scritto nulla. Il bordo rosso con ⚠ indica che lo stesso strumento è assegnato a più squadre questa settimana. Se l\'elenco Jira è vuoto, usa prima «🔧 Aggiorna strumenti».';
// ✕ togli strumento
HELP_TEXTS['pwRemoveStrumento'] = 'Toglie questo strumento dalla squadra per la settimana mostrata, senza chiedere conferma.\n\nSi salva nella Griglia condivisa con i colleghi; su Jira non cambia nulla. Serve il ruolo admin o responsabile.';
// + Strumento
HELP_TEXTS['pwAddStrumento'] = 'Aggiunge a questa squadra un posto strumento vuoto per la settimana mostrata; poi lo scegli dalla tendina.\n\nGli strumenti della squadra compaiono nella mail settimanale e nella Mappa (vista Strumenti). Si salva nella Griglia condivisa. Serve il ruolo admin o responsabile.';
// Apri / chiudi commessa
HELP_TEXTS['pwToggleComm'] = 'Chiude o riapre il blocco di questa commessa nella Griglia, con tutte le sue squadre.\n\nCambia solo la vista nel tuo browser e non modifica la pianificazione. Lo stato vale per la settimana mostrata e si perde ricaricando la pagina.';
// + Squadra
HELP_TEXTS['pwAddSquadra'] = 'Aggiunge a questa commessa una nuova squadra («Squadra N») con una riga operatore vuota, solo nella settimana mostrata.\n\nSi salva nella Griglia condivisa con i colleghi. Serve il ruolo admin o responsabile.';
// ▲ Sposta commessa su
HELP_TEXTS['pwMoveCommessaUp'] = 'Sposta il blocco di questa commessa di una posizione più in alto nella Griglia della settimana mostrata.\n\nCambia l\'ordine in Griglia e nella mail settimanale; il contenuto non cambia. Si salva nella Griglia condivisa. È disattivo sulla prima commessa o senza ruolo admin/responsabile.';
// ▼ Sposta commessa giù
HELP_TEXTS['pwMoveCommessaDown'] = 'Sposta il blocco di questa commessa di una posizione più in basso nella Griglia della settimana mostrata.\n\nCambia l\'ordine in Griglia e nella mail settimanale; il contenuto non cambia. Si salva nella Griglia condivisa. È disattivo sull\'ultima commessa o senza ruolo admin/responsabile.';
// ✕ Rimuovi commessa
HELP_TEXTS['pwRemoveCommessa'] = 'Toglie l\'intera commessa dalla pianificazione della settimana mostrata, con tutte le sue squadre, operatori, cantieri e strumenti. Chiede conferma.\n\nLe altre settimane non cambiano e Jira non viene toccato. Si salva nella Griglia condivisa con i colleghi e, finché non ricarichi la pagina, si può annullare con Indietro. Serve il ruolo admin o responsabile.';
// 👷 Pianificati questa settimana
HELP_TEXTS['pwToggleStatPopover:pianificati'] = 'Mostra l\'elenco degli operatori presenti in almeno una squadra di una commessa nella settimana mostrata, con le commesse su cui sono.\n\nSolo consultazione: legge la Griglia. Clicca di nuovo sul riquadro (o fuori) per chiudere.';
// ✅ Liberi / disponibili
HELP_TEXTS['pwToggleStatPopover:liberi'] = 'Mostra gli operatori attivi in anagrafica che nella settimana mostrata non sono in nessuna squadra e non hanno ferie o assenze in nessun giorno.\n\nSolo consultazione. Clicca di nuovo sul riquadro (o fuori) per chiudere.';
// 🏖 In ferie o permesso
HELP_TEXTS['pwToggleStatPopover:inFerie'] = 'Mostra gli operatori con almeno un giorno di ferie/permesso o di non disponibilità nella settimana mostrata, presi dalla Vista Ferie, con i giorni (rosso = ferie, viola = non disponibile).\n\nSolo consultazione. Clicca di nuovo sul riquadro (o fuori) per chiudere.';
// ⚠️ Su più commesse
HELP_TEXTS['pwToggleStatPopover:suPiuCommesse'] = 'Mostra gli operatori pianificati su due o più commesse diverse nella settimana mostrata, con l\'elenco delle commesse: utile per scovare doppie assegnazioni.\n\nSolo consultazione. Clicca di nuovo sul riquadro (o fuori) per chiudere.';
// 🔁 Squadre in doppia week
HELP_TEXTS['pwToggleStatPopover:doppiaWeek'] = 'Mostra le squadre della settimana con almeno un operatore in doppia week (W1 = prima settimana del blocco, W2 = seconda, con rientro il giovedì).\n\nCliccando una squadra o un nome vai alla riga in Griglia. Solo consultazione.';
// Vai alla riga
HELP_TEXTS['pwStatGoToCell'] = 'Chiude l\'elenco e porta alla riga di quell\'operatore (o alla squadra) nella Griglia: riapre commessa e squadra se erano chiuse e la evidenzia per qualche secondo.\n\nSolo navigazione, non modifica nulla.';
// Vai alla cella
HELP_TEXTS['pwGoToSearchCell'] = 'Chiude i risultati e porta alla cella trovata nella Griglia (o all\'intera riga, se hai trovato il nome dell\'operatore): riapre commessa e squadra se erano chiuse e la evidenzia per qualche secondo.\n\nSolo navigazione, non modifica nulla.';
// Meteo del giorno
HELP_TEXTS['pwOpenMeteoModal'] = 'Mostra il meteo di quel giorno per i cantieri della squadra, per fasce orarie (icona, temperatura, pioggia). Per oggi e i giorni futuri sono previsioni Open-Meteo; per i giorni passati è il meteo realmente osservato (storico).\n\nIl badge riporta il primo cantiere, «+N» indica gli altri. «🌡️ …» vuol dire che il meteo non è ancora disponibile: il dettaglio spiega il motivo per ogni cantiere. Solo consultazione.';
// Vai alla cella
HELP_TEXTS['pwGoToWeatherCell'] = 'Chiude il riquadro e porta alla cella (commessa, squadra e giorno) che ha la criticità meteo: riapre commessa e squadra se erano chiuse e la evidenzia per qualche secondo.\n\nSolo navigazione, non modifica nulla.';
// 🗑 Elimina messaggio
HELP_TEXTS['pwNvElimina'] = 'Elimina definitivamente questo messaggio dalla lavagna Note/Variazioni della settimana, per tutti i colleghi. Chiede conferma.\n\nPuoi eliminare solo i tuoi messaggi; l\'admin anche quelli degli altri. Serve il ruolo admin o responsabile. L\'eliminazione non si annulla con Indietro.';
// ↺ Rigenera
HELP_TEXTS['#mail-rigenera'] = 'Ricompone l\'anteprima della mail partendo dalla Griglia attuale e dai campi del riquadro (orari, note e strumenti per squadra, note generali).\n\nLe modifiche fatte a mano direttamente nell\'anteprima vanno perse. Non salva nulla e non invia nulla.';
// ✉️ Apri Outlook
HELP_TEXTS['#mail-apri-outlook'] = 'Copia negli appunti il testo dell\'anteprima e apre il programma di posta con i destinatari già compilati. A: logistica@eagleprojects.it. In CC: le «Email sempre in CC», i referenti tecnici delle commesse della settimana e gli operatori attivi pianificati o in ferie/permesso (esclusi i Non disponibili senza giorni di lavoro).\n\nIl testo non viene messo nel corpo della mail: incollalo con Ctrl+V. Un avviso elenca chi è rimasto fuori (senza email, non attivo in anagrafica, commessa senza referente). Non invia nulla da solo.';
// 📋 Copia negli appunti
HELP_TEXTS['#mail-copia'] = 'Copia negli appunti il testo dell\'anteprima così come lo vedi, comprese le modifiche fatte a mano, per incollarlo in una mail.\n\nNon invia e non salva nulla.';
// Tutta la Settimana
HELP_TEXTS['pwFerieToggleWeek'] = 'Segna come Ferie tutti e sei i giorni (lun–sab) di questo operatore nella settimana mostrata; i giorni già segnati «Non disponibile» diventano Ferie. Se invece tutti i giorni erano già assenti, li libera tutti e scarta le ore importate dal gestionale per quella settimana.\n\nNon chiede conferma. Si salva nelle Ferie condivise con i colleghi. Serve il ruolo admin o responsabile.';
// 🏖 Ferie
HELP_TEXTS['pw-ctx-ferie'] = 'Imposta Ferie su questo operatore e giorno nella settimana mostrata.\n\nSi salva nelle Ferie condivise con i colleghi. Serve il ruolo admin o responsabile.';
// 🚫 Non disponibile
HELP_TEXTS['pw-ctx-non-disp'] = 'Segna questo operatore come Non disponibile in quel giorno (es. malattia o indisponibilità alla trasferta), invece che in ferie. In Griglia appare come non disponibile e finisce in fondo all\'elenco di scelta operatori.\n\nSi salva nelle Ferie condivise con i colleghi. Serve il ruolo admin o responsabile.';
// ✕ Rimuovi assenza
HELP_TEXTS['pw-ctx-rimuovi-assenza'] = 'Toglie l\'assenza (ferie o non disponibile) da questo operatore e giorno e scarta le ore/descrizioni importate dal gestionale per quel giorno.\n\nNon chiede conferma. Si salva nelle Ferie condivise con i colleghi. Serve il ruolo admin o responsabile.';
// 📋 Copia cantiere/attività
HELP_TEXTS['pw-ctx-copia-cella'] = 'Memorizza cantieri e attività di questa cella (operatore e giorno) per incollarli su un\'altra cella con «📥 Incolla qui».\n\nNon modifica nulla. La copia resta solo in questa pagina del browser.';
// 📥 Incolla qui
HELP_TEXTS['pw-ctx-incolla-cella'] = 'Sostituisce cantieri e attività di questa cella con quelli copiati prima: quanto c\'era in cella viene sovrascritto, senza conferma.\n\nSi salva nella Griglia condivisa con i colleghi. Si attiva solo dopo una copia e con ruolo admin o responsabile.';
// 📋 Copia settimana
HELP_TEXTS['pw-ctx-copia-settimana'] = 'Memorizza cantieri e attività di tutti e sei i giorni di questo operatore, per incollarli sulla riga di un altro operatore, squadra o commessa.\n\nNon modifica nulla. La copia resta solo in questa pagina del browser.';
// 📥 Incolla settimana qui
HELP_TEXTS['pw-ctx-incolla-settimana'] = 'Sostituisce cantieri e attività di tutti e sei i giorni di questo operatore con la settimana copiata prima: tutto quello che c\'era nella riga viene sovrascritto, senza conferma.\n\nSi salva nella Griglia condivisa con i colleghi. Si attiva solo dopo una copia e con ruolo admin o responsabile.';
// Giorno della barra
HELP_TEXTS['pwFerieBulkToggleGiorno'] = 'Accende o spegne questo giorno tra quelli su cui agiscono i bottoni della barra (Ferie, Non disponibile, Rimuovi assenza).\n\nDa solo non modifica nulla. La scelta dei giorni resta solo in questa pagina.';
// 🏖 Ferie (selezionati)
HELP_TEXTS['pwFerieBulkApply:ferie'] = 'Imposta Ferie sui giorni accesi nella barra, per tutti gli operatori selezionati, nella settimana mostrata.\n\nCon «solo giorni già assenti» spuntato (predefinito) cambia solo il tipo dei giorni che hanno già un\'assenza, senza aggiungerne di nuove: togli la spunta per mettere ferie anche sui giorni liberi. Chiede conferma indicando quanti giorni cambiano. Si salva nelle Ferie condivise. Serve il ruolo admin o responsabile.';
// 🚫 Non disponibile (selezionati)
HELP_TEXTS['pwFerieBulkApply:non_disponibile'] = 'Imposta Non disponibile sui giorni accesi nella barra, per tutti gli operatori selezionati, nella settimana mostrata.\n\nCon «solo giorni già assenti» spuntato (predefinito) cambia solo il tipo dei giorni che hanno già un\'assenza: togli la spunta per segnare anche giorni liberi. Chiede conferma indicando quanti giorni cambiano. Si salva nelle Ferie condivise. Serve il ruolo admin o responsabile.';
// ✕ Rimuovi assenza (selezionati)
HELP_TEXTS['pwFerieBulkApply'] = 'Toglie ferie o non disponibilità dai giorni accesi nella barra, per tutti gli operatori selezionati, nella settimana mostrata. Scarta anche le ore/descrizioni importate dal gestionale per quei giorni.\n\nChiede conferma indicando quanti giorni cambiano. Si salva nelle Ferie condivise. Serve il ruolo admin o responsabile.';
// Seleziona / deseleziona tutti
HELP_TEXTS['pwFerieSelAll'] = 'La casella nell\'intestazione seleziona (o deseleziona) tutti gli operatori della Vista Ferie per una modifica di gruppo; il bottone «Deseleziona» della barra svuota la selezione e chiude la barra.\n\nDa soli non modificano le ferie: le azioni si scelgono dalla barra che compare con almeno un operatore selezionato.';
// Seleziona operatore
HELP_TEXTS['pwFerieSelClick'] = 'Aggiunge o toglie questo operatore dalla selezione per le modifiche di gruppo della Vista Ferie (Maiusc+clic seleziona un intervallo di righe). Con almeno un operatore selezionato compare la barra con i giorni e le azioni.\n\nDa sola non modifica le ferie.';
// Ore importate
HELP_TEXTS['pwFerieDettaglioPopover'] = 'Mostra il dettaglio delle ore non lavorate importate dal gestionale presenze per questo operatore e giorno: ogni voce (ferie, permesso, ecc.) con le sue ore. Il numero sul badge è il totale ore del giorno.\n\nSolo consultazione.';
// Importa ferie
HELP_TEXTS['#pfi-confirm'] = 'Conferma l\'importazione: per gli operatori riconosciuti segna come Ferie i giorni presenti nel file, su tutte le settimane che il file copre (non solo quella aperta), e salva ore e descrizione di ogni giorno.\n\nI giorni segnati a mano e assenti dal file restano invariati. Per i giorni presenti nel file il dettaglio importato prima viene sostituito, così reimportare non raddoppia le ore. Le righe con nominativi non riconosciuti o ambigui (elencati sopra) e le domeniche vengono saltate. Si salva nelle Ferie condivise con i colleghi.';
// Doppia week
HELP_TEXTS['pwDwToggle'] = 'Su una settimana libera assegna a questo operatore una doppia week che parte qui e copre anche la settimana successiva: nella seconda rientra il giovedì e ha riposo compensativo il venerdì. Non si può assegnare se è in ferie in una delle due settimane. Su una settimana già in doppia week (➊ o ➋) toglie l\'intero blocco, dopo una conferma.\n\nScrive solo il calendario Doppia Week condiviso con i colleghi: la Griglia non viene modificata. Se l\'operatore è già impiegato lì, verifica tu rientro e riposo. ⚠ = doppia week di fila, sconsigliata. Serve il ruolo admin o responsabile.';
// 🔁 Doppia week
HELP_TEXTS['pw-opmodal-dw'] = 'Mostra solo gli operatori in doppia week nella settimana mostrata (prima o seconda settimana del blocco); il numero dice quanti sono. Clicca di nuovo per togliere il filtro.\n\nFiltra solo la lista. È disattivo se nessuno è in doppia week.';
// Skill
HELP_TEXTS['pw-opmodal-skill'] = 'Filtra l\'elenco a chi ha questa skill in anagrafica. Puoi accenderne più di una: restano solo gli operatori che le hanno tutte.\n\nFiltra solo la lista, non modifica nulla.';
// — nessuno / rimuovi —
HELP_TEXTS['pw-opmodal-nessuno'] = 'Svuota il nome dell\'operatore in questa riga; la riga e i cantieri già scritti restano. Per togliere anche la riga usa «✕ rimuovi».\n\nSi salva nella Griglia condivisa con i colleghi. Serve il ruolo admin o responsabile.';
// Operatore
HELP_TEXTS['pw-opmodal-operatore'] = 'Assegna questo operatore alla riga; i cantieri già scritti nella riga restano. L\'etichetta indica il suo stato nella settimana (LIBERO, ASSEGNATO altrove, FERIE, NON DISP.) e sotto trovi commessa, provenienza, seniority, doppia week ed eventuale fornitore.\n\nSe ha limitazioni nell\'idoneità medica viene chiesta conferma. Si salva nella Griglia condivisa con i colleghi. Serve il ruolo admin o responsabile.';
// Strumento
HELP_TEXTS['pw-str-voce'] = 'Assegna lo strumento scelto alla posizione della squadra da cui hai aperto la tendina, nella settimana mostrata; «— nessuno —» la svuota.\n\nSi salva nella Griglia condivisa con i colleghi. Su Jira non viene scritto nulla. Serve il ruolo admin o responsabile.';
// Giorno
HELP_TEXTS['pw-map-giorno'] = 'Mostra sulle mappe Cantieri e Residenze le squadre pianificate in Griglia in quel giorno della settimana mostrata, con gli spostamenti rispetto al giorno prima.\n\nSolo consultazione.';
// 📅 Tutta la settimana
HELP_TEXTS['pw-map-settimana'] = 'Mostra insieme tutti i cantieri della settimana mostrata, ciascuno con i giorni in cui è pianificato. Nella mappa Residenze ogni operatore compare una sola volta.\n\nSolo consultazione.';
// 👷 Operatori
HELP_TEXTS['pw-map-mode-operatori'] = 'Nella mappa Cantieri raggruppa e colora per commessa e squadra, con gli operatori di ogni cantiere.\n\nCambia solo la vista; la mappa Residenze non cambia.';
// 🔧 Strumenti
HELP_TEXTS['pw-map-mode-strumenti'] = 'Nella mappa Cantieri mette in evidenza gli strumenti assegnati alle squadre, raggruppati per commessa e strumento, e attiva il filtro per strumento.\n\nCambia solo la vista; la mappa Residenze non cambia.';
// Gruppo commessa
HELP_TEXTS['pw-map-gruppo'] = 'Chiude o apre il gruppo di questa commessa nell\'elenco accanto alla mappa.\n\nCambia solo la vista.';
// Cantiere
HELP_TEXTS['pw-map-card'] = 'Centra la mappa Cantieri su questo cantiere, apre il suo fumetto ed evidenzia la scheda.\n\nSolo consultazione.';
// ✏️ Correggi posizione
HELP_TEXTS['pwMapGeoEditToggle'] = 'Apre il campo per correggere a mano la posizione di questo cantiere: scrivi il nome di un comune (cercato su OpenStreetMap) oppure le coordinate «lat, lng» e premi Invio. Prima di salvare viene chiesta conferma.\n\nLa correzione vale per tutte le settimane in cui compare lo stesso nome cantiere ed è condivisa con i colleghi. Serve il ruolo admin o responsabile.';
// Gruppo regione
HELP_TEXTS['pw-map-op-gruppo'] = 'Chiude o apre il gruppo di operatori di questa regione di provenienza nell\'elenco accanto alla mappa Residenze.\n\nCambia solo la vista.';
// Operatore
HELP_TEXTS['pw-map-op-card'] = 'Centra la mappa Residenze su questo operatore (posizione della sua provincia di provenienza o, se manca, del centro della regione), apre il fumetto ed evidenzia la scheda.\n\nSolo consultazione.';
// 📧 Genera mail
HELP_TEXTS['#pw-gen-mail'] = 'Apre il riquadro per preparare la mail di pianificazione della settimana mostrata: orari, email sempre in CC, note e strumenti per squadra, note generali e anteprima del testo.\n\nQuello che scrivi nei campi si salva subito nella Griglia condivisa: note, strumenti per squadra e note generali solo per questa settimana; orari ed email in CC per tutte le settimane. La mail non viene inviata: la copi negli appunti o la apri in Outlook.';
// × Cancella ricerca
HELP_TEXTS['#pw-search-op-clear'] = 'Cancella la ricerca per operatore o cantiere e toglie l\'evidenziazione dalla Griglia.\n\nCambia solo la vista.';
// Risultati ricerca
HELP_TEXTS['#pw-search-op-info'] = 'Apre l\'elenco dei risultati della ricerca, raggruppati per commessa: operatori trovati per nome e celle in cui compare il cantiere cercato, con il giorno. Clicca una riga per andare alla cella in Griglia.\n\nSolo consultazione.';
// Risultati ricerca
HELP_TEXTS['#cp-search-op-info'] = 'Porta alla prima riga del Controllo Produzione che corrisponde alla ricerca e la evidenzia per qualche secondo (anche Invio nel campo di ricerca fa lo stesso).\n\nSolo navigazione.';
// ⬇ Esporta Excel
HELP_TEXTS['#ms-export'] = 'Scarica un file Excel con le righe dello storico meteo che passano i filtri attuali, nell\'ordine mostrato. Ci sono tutte, anche oltre le 1500 visibili in tabella, con condizione, temperature, pioggia, maltempo e rischi del bollettino Protezione Civile.\n\nIl file resta solo sul tuo computer: non modifica dati.';
// 7 gg
HELP_TEXTS['ms-range-7'] = 'Imposta il periodo dello storico meteo sugli ultimi 7 giorni fino a ieri.\n\nIl meteo osservato che manca per i cantieri pianificati in quel periodo viene recuperato in automatico e salvato nello storico condiviso con i colleghi.';
// 30 gg
HELP_TEXTS['ms-range-30'] = 'Imposta il periodo dello storico meteo sugli ultimi 30 giorni fino a ieri.\n\nIl meteo osservato che manca per i cantieri pianificati in quel periodo viene recuperato in automatico e salvato nello storico condiviso con i colleghi.';
// Tutto
HELP_TEXTS['ms-range-all'] = 'Imposta il periodo dello storico meteo dal primo giorno pianificato in Griglia fino a ieri.\n\nIl meteo osservato che manca viene recuperato in automatico (può richiedere tempo su periodi lunghi) e salvato nello storico condiviso con i colleghi.';
// Giorni-cantiere
HELP_TEXTS['ms-kpi-all'] = 'Toglie tutti i filtri di colonna e mostra tutti i giorni-cantiere del periodo. Il numero conta i giorni-cantiere mostrati; sotto c\'è quanti sono ancora senza meteo (in recupero o non localizzati).\n\nCambia solo la vista.';
// 🌧️ Con pioggia
HELP_TEXTS['ms-kpi-pioggia'] = 'Filtra la tabella ai soli giorni-cantiere con almeno 1 mm di pioggia caduta nel giorno.\n\nCambia solo la vista; il filtro si toglie dal chip o dal riquadro «Giorni-cantiere».';
// ⚠️ Maltempo
HELP_TEXTS['ms-kpi-maltempo'] = 'Filtra la tabella ai giorni-cantiere con maltempo di livello Alto o Medio (pioggia forte, neve, temporali o allerta).\n\nCambia solo la vista.';
// ▲ Allerte Protezione Civile
HELP_TEXTS['ms-kpi-pc'] = 'Filtra la tabella ai giorni-cantiere con un\'allerta gialla, arancione o rossa nel bollettino Protezione Civile di quel giorno.\n\nCambia solo la vista.';
// Ordina colonna
HELP_TEXTS['ms-th-sort'] = 'Ordina la tabella per questa colonna; un altro clic inverte il verso. Con Maiusc+clic aggiungi la colonna come criterio secondario.\n\nOrdinando per Data le righe vengono raggruppate per giorno. Cambia solo la vista.';
// Filtro di colonna
HELP_TEXTS['ms-th-filtro'] = 'Apre il filtro di questa colonna, in stile Excel: ordinamento, ricerca e spunta dei valori (con quante righe ha ciascuno) oppure, per le colonne numeriche, un intervallo da/a e scelte rapide.\n\nCambia solo la vista.';
// ✕ Togli filtro
HELP_TEXTS['ms-chip-rimuovi'] = 'Toglie solo questo filtro (o la ricerca testuale); gli altri restano.\n\nCambia solo la vista.';
// Azzera tutti i filtri
HELP_TEXTS['ms-chip-azzera'] = 'Toglie tutti i filtri di colonna e la ricerca testuale. Il periodo resta quello scelto.\n\nCambia solo la vista.';
// Ordina
HELP_TEXTS['ms-pop-ordina'] = 'Ordina la tabella solo per questa colonna, nel verso indicato, sostituendo gli altri criteri di ordinamento.\n\nCambia solo la vista.';
// Scelta rapida pioggia
HELP_TEXTS['ms-pop-preset'] = 'Imposta subito l\'intervallo del filtro pioggia sul valore scelto (es. ≥ 8 mm = giorni con pioggia consistente; Asciutto = meno di 1 mm).\n\nCambia solo la vista.';
// Seleziona tutti
HELP_TEXTS['ms-pop-tutti'] = 'Spunta tutti i valori visibili nell\'elenco del filtro (solo quelli trovati, se hai cercato). Se alla fine sono spuntati tutti, il filtro sparisce.\n\nCambia solo la vista.';
// Deseleziona tutti
HELP_TEXTS['ms-pop-nessuno'] = 'Toglie la spunta a tutti i valori visibili nell\'elenco del filtro (solo quelli trovati, se hai cercato), nascondendo le relative righe.\n\nCambia solo la vista.';
// Rimuovi filtro
HELP_TEXTS['ms-pop-rimuovi'] = 'Toglie il filtro di questa colonna e chiude il riquadro.\n\nCambia solo la vista.';
// Dettaglio giorno-cantiere
HELP_TEXTS['ms-riga'] = 'Apre il dettaglio di quel cantiere e giorno: meteo osservato per fasce orarie, rischi del bollettino Protezione Civile, operatori presenti e, se puoi vedere la Griglia, il bottone per aprirla su quella cella.\n\nSolo consultazione.';
// 📅 Apri in Griglia
HELP_TEXTS['#ms-dett-griglia'] = 'Apre la Griglia sulla settimana di questo giorno e porta alla cella dell\'operatore e del cantiere, evidenziandola.\n\nCambia la settimana mostrata in Pianificazione Settimanale; non modifica dati.';

// ---- Auto-pianifica, Assistente pianificazione, Pianifica spostamenti, Ricerca squadre ----
// 📂 Da file .xlsx / .csv
HELP_TEXTS['#ap-file'] = 'Apre la scelta di un file Excel (.xlsx/.xls) o CSV e aggiunge alla lista dei cantieri da pianificare le righe del primo foglio.\n\nLa prima riga può essere l\'intestazione (Cantiere, Commessa, Attività, Km, Giorni, Operatori, Priorità, Scadenza, Dal, Skill, Preferiti, Esclusi, Note); senza intestazione riconosciuta si usa l\'ordine del modello Excel. Serve almeno la colonna del cantiere.\n\nLe righe si aggiungono a quelle già presenti. La lista è salvata solo su questo browser e la Griglia non viene toccata; una bozza già calcolata va ricalcolata.';
// ⬇ Importa righe incollate
HELP_TEXTS['apImportaTesto'] = 'Legge le righe incollate nel riquadro sopra (anche copiate direttamente da Excel, oppure CSV separati da ; o ,) e le aggiunge alla lista dei cantieri da pianificare.\n\nSe la prima riga contiene intestazioni riconosciute (Cantiere, Commessa, Attività, Km, Priorità…) le colonne vengono abbinate per nome, altrimenti vale l\'ordine del modello Excel. Serve almeno il cantiere; commesse e operatori scritti a mano vengono ricondotti ai nomi esatti quando il riconoscimento è univoco.\n\nDopo l\'importazione il riquadro si svuota. La Griglia non viene toccata.';
// ↩ Cantieri della settimana precedente
HELP_TEXTS['apDaSettimanaPrecedente'] = 'Aggiunge alla lista i cantieri pianificati in Griglia la settimana precedente (cantiere, commessa e attività), saltando quelli già presenti nella lista.\n\nKm, giorni e scadenze non vengono riportati e la priorità parte da P3: completa le righe (es. i km che restano da fare), altrimenti la durata viene stimata dallo storico. La Griglia non viene toccata.';
// ＋ Riga manuale
HELP_TEXTS['apAggiungiRiga'] = 'Aggiunge in fondo alla lista una riga vuota da compilare a mano. Servono almeno cantiere e commessa perché la riga entri nel calcolo.\n\nLa lista è salvata per settimana solo su questo browser; la Griglia non viene toccata.';
// Scarica il modello Excel
HELP_TEXTS['apScaricaModello'] = 'Scarica un file Excel di esempio con le colonne riconosciute e una riga d\'esempio, da compilare e poi caricare con «Da file .xlsx / .csv».\n\nLa colonna Giorni lasciata vuota significa «stima dallo storico di produzione». Non modifica niente.';
// Svuota
HELP_TEXTS['apSvuota'] = 'Toglie, dopo una conferma, tutti i cantieri dalla lista di questa settimana; anche la bozza eventualmente calcolata viene scartata.\n\nLa Griglia non viene toccata. Non c\'è un annulla: per riavere le righe vanno reimportate.';
// 🤖 Calcola bozza
HELP_TEXTS['#ap-calcola-btn'] = 'Calcola una BOZZA della Griglia per la settimana mostrata a partire dalle righe spuntate della lista (servono cantiere e commessa). Assegna i singoli operatori liberi ai cantieri ricomponendo le squadre e tenendo conto di priorità, scadenze, vincoli e delle opzioni accanto (sabato, meteo, max km fra cantieri). Le celle già compilate in Griglia non vengono mai sovrascritte e i giorni già passati non si usano.\n\nPer il calcolo localizza i cantieri, chiede le distanze stradali a un servizio di routing esterno (se non risponde le stima in linea d\'aria) e, con «considera meteo» attivo, usa previsioni e allerte della Protezione Civile. Se i giorni non sono indicati, la durata è stimata dai km con lo storico di produzione.\n\nLa bozza resta solo in memoria (si perde ricaricando la pagina): la Griglia cambia solo con «Applica alla Griglia».';
// ✦ Assistente
HELP_TEXTS['apcToggle'] = 'Apre o chiude il pannello dell\'Assistente pianificazione, una chat in cui chiedere in linguaggio naturale di aggiungere o modificare cantieri, cambiare priorità e vincoli, segnalare imprevisti, ricalcolare la bozza e spiegarne il risultato.\n\nL\'assistente usa un servizio di intelligenza artificiale esterno tramite il server: serve l\'accesso e deve essere attivato da un amministratore. Lavora solo su lista e bozza, mai sulla Griglia, che cambia solo quando premi «Applica».\n\nCon la chat aperta le fonti per aggiungere cantieri passano nel riquadro richiudibile «📥 Aggiungi cantieri». La conversazione è salvata per settimana su questo browser.';
// aggiorna (storico)
HELP_TEXTS['apCaricaStorico'] = 'Riscarica dal server lo storico di Controllo Produzione (km/cad registrati per attività), usato per stimare quanti giorni servono a un cantiere quando la colonna Gg è vuota.\n\nDi norma lo storico si rilegge da solo ogni 12 ore ed è conservato su questo browser: usa «aggiorna» se nel frattempo sono stati caricati nuovi report di produzione. Senza collegamento al server la stima è di 1 giorno. Non modifica la lista né la Griglia.';
// ＋ Aggiungi (imprevisto)
HELP_TEXTS['apImprevistoAggiungi'] = 'Aggiunge all\'elenco degli imprevisti quanto scelto nel modulo: un\'assenza (operatore + giorni, con l\'eventuale registrazione in Ferie come «Ferie» o «Non disponibile») oppure un cantiere fermo (un cantiere presente in Griglia questa settimana + giorni).\n\nSi possono indicare solo giorni non ancora passati. Se la stessa persona o lo stesso cantiere è già in elenco, i giorni vengono uniti; una riparazione già calcolata va ricalcolata.\n\nNon tocca la Griglia: dopo serve «Calcola riparazione».';
// ✕ togli imprevisto
HELP_TEXTS['apImprevistoRimuovi'] = 'Toglie questo imprevisto dall\'elenco. Una riparazione già calcolata viene scartata e va ricalcolata.\n\nNon tocca la Griglia né le Ferie.';
// 🔧 Calcola riparazione
HELP_TEXTS['#ap-ripara-btn'] = 'Calcola come riparare la settimana già pianificata in Griglia dopo gli imprevisti in elenco, senza rifarla da capo. Individua solo le celle colpite e cerca un sostituto sullo stesso cantiere e nello stesso giorno oppure, per un cantiere fermo, altri giorni liberi per recuperare il lavoro perso, preferendo la stessa squadra.\n\nUsa solo i giorni da oggi in poi. Come per la bozza localizza i cantieri, chiede le distanze a un servizio di routing esterno e, se «considera meteo» è attivo, tiene conto del meteo (non per i sostituti).\n\nIl risultato è un\'anteprima in memoria: la Griglia cambia solo con «Applica riparazione».';
// ✕ Scarta
HELP_TEXTS['apScartaRiparazione'] = 'Chiude la proposta di riparazione, toglie tutti gli imprevisti segnalati e richiude il riquadro «Imprevisti».\n\nLa Griglia non è mai stata toccata, quindi non c\'è niente da annullare; gli imprevisti però vanno reinseriti se servono di nuovo.';
// ✓ Applica riparazione
HELP_TEXTS['apApplicaRiparazione'] = 'Scrive la riparazione nella Griglia condivisa della settimana, dopo una conferma che riepiloga celle tolte e celle nuove. Toglie le celle colpite dagli imprevisti, registra in Ferie le assenze per cui è stato scelto (senza toccare giorni già segnati) e scrive sostituti e recuperi; il resto della Griglia non cambia.\n\nChi nel frattempo risulta occupato o in ferie viene saltato e segnalato. Dopo l\'applicazione l\'elenco degli imprevisti si svuota e una bozza calcolata prima va rifatta.\n\nSi può annullare con «↶ Annulla ultima applicazione» (solo da questo browser), che ripristina anche le Ferie. Richiede un ruolo con permesso di scrittura.';
// Menu a tendina
HELP_TEXTS['apDdApri'] = 'Apre il menu a tendina per scegliere il valore di questo campo della riga, con una casella di ricerca.\n\nOgni modifica rende da ricalcolare la bozza già calcolata. La Griglia non viene toccata.';
// Commessa
HELP_TEXTS['ap-dd-commessa'] = 'Sceglie la commessa del cantiere fra quelle attive. È obbligatoria: senza commessa la riga non entra nel calcolo. Il campo è evidenziato in giallo se la commessa importata non corrisponde a nessuna commessa attiva.\n\nNel calcolo valgono anche le skill e gli attestati indicati nell\'anagrafica della commessa. Cambiarla rende da ricalcolare la bozza.';
// Attività
HELP_TEXTS['ap-dd-attivita'] = 'Sceglie l\'attività da svolgere sul cantiere fra quelle dello storico di produzione e quelle già usate in Griglia quest\'anno. Scrivendo un nome che non c\'è si può aggiungere una nuova attività, ricordata su questo browser.\n\nL\'attività serve a stimare la durata dai km ed è quella che finirà nelle celle della Griglia quando la bozza viene applicata. Cambiarla rende da ricalcolare la bozza.';
// Skill
HELP_TEXTS['ap-dd-skills'] = 'Sceglie le skill richieste per il cantiere (anche più di una). Sono solo una preferenza: le squadre che le coprono sono favorite e, se mancano, compare un avviso, ma nessuno viene escluso per questo.\n\nLe skill indicate nell\'anagrafica della commessa valgono già in automatico (il campo mostra «commessa (n)» o «+n»). Cambiarle rende da ricalcolare la bozza.';
// Preferiti
HELP_TEXTS['ap-dd-preferiti'] = 'Sceglie gli operatori da favorire su questo cantiere (anche più di uno): sono preferiti nella scelta se liberi e idonei, senza garanzia.\n\nChi viene aggiunto ai preferiti è tolto dagli esclusi della stessa riga. Il campo è evidenziato in giallo se contiene nomi non riconosciuti fra gli operatori attivi, che vengono ignorati. Cambiarli rende da ricalcolare la bozza.';
// Esclusi
HELP_TEXTS['ap-dd-esclusi'] = 'Sceglie gli operatori da non assegnare mai a questo cantiere (anche più di uno).\n\nChi viene aggiunto agli esclusi è tolto dai preferiti della stessa riga. I nomi non riconosciuti fra gli operatori attivi vengono ignorati (campo evidenziato in giallo). Cambiarli rende da ricalcolare la bozza.';
// Deseleziona tutto
HELP_TEXTS['ap-dd-deseleziona'] = 'Toglie tutte le voci selezionate in questo campo della riga (skill, preferiti o esclusi). La modifica conta alla chiusura del menu e rende da ricalcolare la bozza.';
// ＋ Aggiungi nuova attività
HELP_TEXTS['ap-dd-nuova-attivita'] = 'Aggiunge l\'attività scritta nella ricerca all\'elenco delle attività proponibili (ricordato solo su questo browser) e la imposta su questa riga.\n\nIn Griglia l\'attività è testo libero: diventa visibile a tutti solo quando la bozza viene applicata.';
// ⊘ giorni esclusi
HELP_TEXTS['apTogliGiorniEsclusi'] = 'Il badge ⊘ indica che il cantiere ha il vincolo «mai in questi giorni» (le iniziali sono i giorni esclusi), di solito impostato tramite l\'Assistente. Cliccandolo, dopo una conferma, il vincolo viene tolto e il cantiere torna pianificabile tutti i giorni.\n\nLa bozza già calcolata va ricalcolata. La Griglia non viene toccata.';
// ✕ rimuovi riga
HELP_TEXTS['apRimuoviRiga'] = 'Toglie questo cantiere dalla lista, insieme alle precedenze che lo riguardano, senza chiedere conferma. La bozza già calcolata va ricalcolata.\n\nLa Griglia non viene toccata.';
// Applica e ricalcola
HELP_TEXTS['apApplicaSuggerimento'] = 'Accetta il suggerimento: fissa la precedenza «questo cantiere prima di quell\'altro» e ricalcola subito la bozza. Il suggerimento fa entrare più giorni di un cantiere togliendone a un altro, come descritto nella riga.\n\nLa precedenza resta salvata per la settimana (sotto la lista, in «Precedenze scelte») finché non la togli; una precedenza opposta fra gli stessi due cantieri viene sostituita. La Griglia non viene toccata.';
// ✕ togli precedenza
HELP_TEXTS['apRimuoviPrecedenza'] = 'Toglie questa precedenza («A prima di B»), scelta prima da un suggerimento: il calcolo torna libero di ordinare i due cantieri. La bozza già calcolata va ricalcolata.\n\nLa Griglia non viene toccata.';
// ↶ Annulla ultima applicazione
HELP_TEXTS['apAnnulla'] = 'Riporta la Griglia di questa settimana a com\'era subito prima dell\'ultima «Applica alla Griglia» o «Applica riparazione», dopo una conferma. Per la riparazione ripristina anche le Ferie della settimana.\n\nAttenzione: si perdono anche tutte le modifiche fatte su questa settimana DOPO quell\'applicazione, da chiunque. Funziona solo dal browser da cui si è applicato e solo per l\'ultima applicazione. Richiede un ruolo con permesso di scrittura.';
// ✓ Applica alla Griglia
HELP_TEXTS['apApplica'] = 'Scrive la bozza nella Griglia condivisa della settimana mostrata, dopo una conferma con il numero di celle. Entrano solo le righe spuntate nella lista; le celle già compilate non vengono toccate e chi nel frattempo risulta occupato o in ferie viene saltato e segnalato.\n\nOgni operatore va nella sua riga della commessa se c\'è già, altrimenti nella squadra di un compagno o in una squadra nuova. Si può annullare con «↶ Annulla ultima applicazione» (solo da questo browser).\n\nRichiede un ruolo con permesso di scrittura e una bozza calcolata per la stessa settimana.';
// ✦ Perché?
HELP_TEXTS['apcPerche'] = 'Apre l\'Assistente pianificazione (se è chiuso) e gli chiede perché questo cantiere non è assegnato, è solo parziale o finisce oltre la scadenza, e cosa si può fare.\n\nLa domanda va a un servizio di intelligenza artificiale esterno. L\'assistente analizza la bozza e può proporre o fare modifiche a lista e bozza, mai alla Griglia; le modifiche di una risposta si possono annullare dalla chat.';
// ⚡ Imprevisti
HELP_TEXTS['ap-imprevisti'] = 'Apre o chiude il riquadro «Imprevisti», per assenze o cantieri fermi in una settimana già pianificata in Griglia: si segnalano gli imprevisti, si calcola una riparazione che tocca solo le celle colpite e la si applica dopo averla rivista.\n\nAprire o chiudere il riquadro non modifica niente. Per le settimane passate non c\'è più niente da ripianificare.';
// 📥 Aggiungi cantieri
HELP_TEXTS['ap-fonti'] = 'Apre o chiude il riquadro con le fonti per aggiungere cantieri alla lista: incolla da Excel, file, settimana precedente, riga manuale, modello Excel. Con l\'Assistente aperto le fonti stanno qui invece che nella colonna a sinistra. Non modifica niente.';
// Invia / Ferma
HELP_TEXTS['#apc-send'] = 'Invia all\'assistente il messaggio scritto nella casella (come premere Invio; Maiusc+Invio va a capo). Mentre l\'assistente lavora il bottone diventa ■ e serve a fermarlo (anche con Esc): i passaggi già fatti restano e si possono annullare.\n\nIl messaggio è elaborato da un servizio di intelligenza artificiale esterno tramite il server. L\'assistente può leggere la bozza, modificare lista, opzioni, precedenze e imprevisti e ricalcolare, ma non scrive mai in Griglia. Domanda e risposta vengono registrate nello storico dell\'assistente.';
// Nuova conversazione
HELP_TEXTS['apc-nuova'] = 'Inizia una nuova conversazione con l\'assistente per questa settimana, dopo una conferma se ci sono già messaggi.\n\nLista dei cantieri e bozza restano come sono: si perdono solo la cronologia della chat e la possibilità di annullare le risposte precedenti.';
// ↶ Annulla
HELP_TEXTS['apc-annulla'] = 'Annulla tutte le modifiche fatte dall\'assistente in questa risposta: lista dei cantieri, opzioni, precedenze, imprevisti e bozza tornano com\'erano prima. L\'assistente viene informato dell\'annullamento.\n\nSi annulla a ritroso, una risposta alla volta partendo dall\'ultima, e non dopo aver ricaricato la pagina. Se dopo la risposta hai modificato ancora la lista viene chiesta conferma, perché anche quelle modifiche andranno perse. La Griglia non è coinvolta.';
// Vedi nella bozza
HELP_TEXTS['apc-vedi'] = 'Scorre la pagina fino all\'anteprima della bozza e la evidenzia per un attimo; le celle cambiate dall\'assistente sono evidenziate. Non modifica niente.';
// Vedi riparazione
HELP_TEXTS['apc-vedi-rip'] = 'Scorre la pagina fino al riquadro della riparazione calcolata e lo evidenzia per un attimo. Non modifica niente.';
// Riprova
HELP_TEXTS['apc-riprova'] = 'Dopo un errore di collegamento, ricontrolla se l\'assistente è raggiungibile e configurato (attivo e con la chiave del servizio di intelligenza artificiale). Non invia messaggi e non modifica niente.';
// Suggerimento rapido
HELP_TEXTS['apc-chip'] = 'Richiesta già pronta, costruita sullo stato attuale di lista e bozza: cliccandola viene inviata subito all\'assistente, come se l\'avessi scritta tu.\n\nL\'assistente può quindi modificare lista, opzioni o imprevisti e ricalcolare la bozza, mai la Griglia; le modifiche si possono annullare dalla risposta.';
// Passaggi dell'assistente
HELP_TEXTS['apc-passi'] = 'Mostra o nasconde i passaggi eseguiti dall\'assistente in questa risposta (letture, modifiche, ricalcoli), con l\'esito di ciascuno. Non modifica niente.';
// Tappa del percorso
HELP_TEXTS['pwSpostFocus'] = 'Clic su una tappa del percorso: centra la mappa su quel comune. Non modifica il percorso.';
// ▲ / ▼
HELP_TEXTS['pwSpostMove'] = '▲ e ▼ spostano la tappa di una posizione nell\'ordine di visita, scambiandola con quella sopra o sotto. Km e tempi delle tratte si aggiornano subito senza ricalcolare le distanze, il tracciato sulla mappa viene richiesto di nuovo al servizio di routing e la strategia diventa «Ordine modificato a mano».\n\nIl percorso è salvato solo su questo browser e la Griglia non è coinvolta. Un nuovo «Calcola percorso» rifà l\'ordine secondo la strategia scelta.';
// ✕ rimuovi tappa
HELP_TEXTS['pwSpostRemove'] = 'Toglie la tappa dal percorso calcolato, senza conferma; totali, tratte e mappa si aggiornano.\n\nIl comune resta però nell\'elenco delle tappe: ricalcolando il percorso torna dentro, a meno di cancellarlo anche dall\'elenco. Il percorso è salvato solo su questo browser.';
// × togli tappa
HELP_TEXTS['rs-rimuovi-tappa'] = 'Toglie questa tappa dall\'elenco dei cantieri da coprire, senza conferma.\n\nLa classifica delle squadre e la mappa già mostrate non si aggiornano da sole: premi di nuovo «Calcola ranking» per rifarle senza la tappa. L\'elenco vale solo per questa sessione e non tocca la Griglia.';
// Skill richiesta
HELP_TEXTS['rs-opzione-skill'] = 'Spunta o toglie una skill richiesta per la prossima tappa che aggiungerai. Sono proposte solo le skill degli operatori pianificati questa settimana; dopo aver aggiunto la tappa la selezione si azzera.\n\nLe skill non cambiano l\'ordine della classifica, che dipende solo dalla vicinanza: servono a mostrare quante ne copre ogni squadra e al filtro delle squadre compatibili.';
// Strumento richiesto
HELP_TEXTS['rs-opzione-strumento'] = 'Spunta o toglie uno strumento richiesto per la prossima tappa che aggiungerai. Sono proposti solo gli strumenti assegnati alle squadre di questa settimana; dopo aver aggiunto la tappa la selezione si azzera.\n\nGli strumenti non cambiano l\'ordine della classifica, che dipende solo dalla vicinanza: servono a mostrare quanti ne ha ogni squadra e al filtro delle squadre compatibili.';

// ---- Sottotask Jira e Controllo Produzione ----
// 🧹 Togli indicatori cancellati
HELP_TEXTS['pwJchkTogliCancellati'] = 'Toglie in un colpo dalla Griglia gli indicatori 🎫 di tutti i sottotask che la verifica ha trovato cancellati su Jira, in tutte le commesse della settimana mostrata. Chiede conferma.\n\nLa modifica è condivisa con i colleghi ed è registrata nel log attività. Su Jira non viene scritto né cancellato niente. Le celle ancora pianificate restano «senza sottotask», pronte per una nuova creazione.\n\nVisibile solo ad admin e responsabili.';
// ✕ togli indicatore
HELP_TEXTS['pwJchkRimuoviIndicatore'] = 'Toglie dalla Griglia l\'indicatore 🎫 di questo solo sottotask, con conferma. Compare per i sottotask cancellati su Jira e per quelli che nessuna cella pianifica più (es. operatore spostato a un altro giorno: il sottotask del giorno vecchio resta orfano).\n\nSu Jira non cambia niente: il sottotask NON viene cancellato. Se l\'operatore è ancora pianificato su quel cantiere quel giorno, la cella diventa «senza sottotask».\n\nLa modifica è condivisa con i colleghi. Riservato ad admin e responsabili.';
// ⇄ sposta
HELP_TEXTS['pwJchkSposta'] = 'Il sottotask è stato riassegnato su Jira a un altro operatore, che in Griglia lavora sullo stesso cantiere (lo stesso giorno, per un sottotask giornaliero) senza un sottotask suo. Questo bottone sposta l\'indicatore 🎫 dal vecchio operatore a lui, sostituendo l\'eventuale indicatore non valido che aveva. Chiede conferma.\n\nSu Jira non cambia niente: lì è già assegnato a lui. Il vecchio operatore resta pianificato senza sottotask: toglilo dalla Griglia se non lavora più lì.\n\nLa modifica è condivisa con i colleghi ed è registrata nel log attività. Riservato ad admin e responsabili.';
// 🔗 collega
HELP_TEXTS['pwJchkCollega'] = 'Su Jira c\'è già un sottotask, creato a mano, per queste giornate «senza sottotask»: questo bottone lo collega in Griglia (indicatore 🎫), come se l\'avesse creato l\'app. Chiede conferma e mostra cosa collega.\n\nIl sottotask viene trovato con «Ricontrolla»: stesso progetto della commessa, assegnato all\'operatore, di quel giorno (data nel titolo come 29/10/2026, oppure scadenza o inizio = quel giorno). Se quel giorno ce n\'è più d\'uno, vale quello che nel titolo (suo o del Task padre) nomina il cantiere.\n\nSu Jira non cambia niente. Il collegamento è condiviso con i colleghi ed è registrato nel log attività. Riservato ad admin e responsabili.';
// 🔗 Collega tutti
HELP_TEXTS['pwJchkCollegaTutti'] = 'Collega in un colpo tutti i sottotask fatti a mano su Jira che «Ricontrolla» ha riconosciuto per le giornate senza sottotask della settimana (vedi «🔗 collega» sulle singole righe). Chiede conferma con l\'elenco.\n\nSu Jira non cambia niente. Il collegamento è condiviso con i colleghi ed è registrato nel log attività. Riservato ad admin e responsabili.';
// Vai alla cella
HELP_TEXTS['pwJchkVai'] = 'Chiude il controllo e porta alla Griglia, aprendo commessa e squadra se erano chiuse. Per un\'assegnazione porta alla cella dell\'operatore: la riga va alla prima cella, il chip del giorno alla cella di quel giorno. Per un sottotask non più pianificato porta alla riga dell\'operatore. Per una commessa non collegata a Jira porta all\'intestazione del blocco.\n\nSolo navigazione: non modifica nulla.';
// ↻ Ricontrolla
HELP_TEXTS['pwOpenJiraCheck'] = 'Rifà il controllo dei sottotask della settimana mostrata. Rilegge gli indicatori 🎫 della Griglia e richiede a Jira, solo in lettura, quali sottotask esistono ancora, a chi sono assegnati e in che stato sono. Ritenta anche le email operatore non risolte la volta prima. Per le giornate senza sottotask cerca anche su Jira quelli creati a mano (stesso progetto, assegnati all\'operatore, di quel giorno) e propone di collegarli con «🔗 collega».\n\nUtile dopo aver creato, cancellato o riassegnato sottotask su Jira. Non scrive niente, né su Jira né in Griglia: il collegamento lo fai tu.';
// 🎫 Crea sottotask
HELP_TEXTS['pw-jchk-crea'] = 'Chiude il controllo e apre la creazione guidata dei sottotask Jira per questa commessa (tutte le sue squadre), la stessa del bottone «🎫 Sottotask Jira» in Griglia.\n\nCompare solo se nella commessa ci sono assegnazioni senza sottotask o con creazione fallita, e solo per admin e responsabili. Aprirla non scrive niente: su Jira si crea solo all\'ultimo passo, dopo l\'anteprima.';
// Evidenzia in Griglia
HELP_TEXTS['pw-jchk-evidenzia'] = 'Accende o spegne l\'evidenziazione in Griglia delle celle con anomalie: rosse le gravi (senza sottotask, creazione fallita, cancellato o riassegnato su Jira), ambra le altre.\n\nSi accende da sola quando apri il controllo e ci sono anomalie. Vale solo sul tuo schermo e non salva nulla.';
// ✕ indicatore 🎫
HELP_TEXTS['pwJiraSubtaskBadgeRemove'] = 'Toglie dalla cella della Griglia l\'indicatore del sottotask Jira (🎫 creato/già esistente o ⚠️ creazione fallita) di quel giorno. Lo toglie subito, senza conferma. Per un sottotask settimanale (creato prima della v18.229.0) l\'indicatore sparisce da tutti i giorni della settimana.\n\nSu Jira il sottotask NON viene cancellato: si perde solo il collegamento in Griglia, e il Controllo sottotask segnalerà la cella come «senza sottotask».\n\nLa modifica è condivisa con i colleghi. Riservato ad admin e responsabili.';
// ← Indietro
HELP_TEXTS['pwJiraStepBack'] = 'Torna al passo precedente della creazione sottotask Jira, con tutte le scelte com\'erano: Epic e Task scelti, spunte, valori digitati.\n\nNon scrive niente su Jira.';
// Riprova
HELP_TEXTS['#pw-jira-retry'] = 'Rifà l\'anteprima su Jira (solo verifica, nessuna creazione) per i sottotask selezionati non ancora creati. Quelli già creati nel frattempo risultano «già esistenti» e non vengono duplicati.\n\nPer creare davvero bisogna poi premere di nuovo «Crea N sottotask». L\'anteprima aggiorna in Griglia gli indicatori dei sottotask già esistenti e degli errori.';
// Scegli Epic
HELP_TEXTS['pw-jira-epic'] = 'Apre l\'elenco con ricerca degli Epic del progetto Jira della commessa, letti da Jira in quel momento, e fa scegliere l\'Epic per questo cantiere/attività.\n\nLa scelta vale solo per questa creazione e non viene ricordata. Cambiando Epic, il Task già scelto si azzera. Su Jira non scrive niente.';
// Scegli Task
HELP_TEXTS['pw-jira-task'] = 'Apre l\'elenco con ricerca dei Task sotto l\'Epic scelto, letti da Jira, e fa scegliere il Task sotto cui creare i sottotask di questo cantiere/attività. Si attiva solo dopo aver scelto l\'Epic.\n\nAppena scelto, parte una verifica su Jira senza creare nulla, che mostra quanti sottotask sono già esistenti, da creare o in errore. Gli indicatori in Griglia di quelli già esistenti, in errore o senza email vengono aggiornati.';
// salta
HELP_TEXTS['pw-jira-salta-comune'] = 'Esclude questo cantiere (con questa attività) dalla creazione dei sottotask: non serve scegliere Epic e Task.\n\nÈ già spuntato quando tutti gli operatori del cantiere hanno già il loro sottotask. Togli la spunta per rifare la verifica. Non scrive niente.';
// Squadra
HELP_TEXTS['pw-jira-squadra-toggle'] = 'Apre o chiude l\'elenco dei cantieri di questa squadra nella creazione sottotask. Solo visualizzazione.';
// salta tutti
HELP_TEXTS['pw-jira-salta-tutti'] = 'Spunta «salta» su tutti i cantieri di questa squadra: nessun sottotask verrà proposto per loro. Non scrive niente.';
// includi tutti
HELP_TEXTS['pw-jira-includi-tutti'] = 'Toglie «salta» da tutti i cantieri di questa squadra: per ognuno andranno scelti Epic e Task. Non scrive niente.';
// Espandi tutto
HELP_TEXTS['#pw-jira-expand-all'] = 'Apre gli elenchi dei cantieri di tutte le squadre nella creazione sottotask. Solo visualizzazione.';
// Comprimi tutto
HELP_TEXTS['#pw-jira-collapse-all'] = 'Chiude gli elenchi dei cantieri di tutte le squadre nella creazione sottotask. Solo visualizzazione.';
// Continua
HELP_TEXTS['#pw-jira-continua'] = 'Controlla che ogni cantiere non saltato abbia il suo Task, poi prepara l\'elenco dei sottotask proposti: uno per operatore per cantiere/attività per giorno pianificato.\n\nGli operatori senza email in anagrafica vengono esclusi e segnati in Griglia con ⚠️. Si passa alla scelta puntuale dei sottotask: su Jira non viene ancora creato niente.';
// Sottotask da creare
HELP_TEXTS['pw-jira-seleziona-sottotask'] = 'Spunta i sottotask da creare davvero. Ogni riga è un operatore su un cantiere/attività, sotto il Task indicato tra parentesi; ogni casella è un giorno, cioè un sottotask.\n\nI giorni che hanno già un sottotask (🎫, anche settimanale) partono senza spunta; ⚠️ = tentativo precedente fallito. Non scrive niente.';
// Seleziona tutti
HELP_TEXTS['#pw-jira-select-all'] = 'Spunta tutti i sottotask proposti, anche quelli che risultano già presenti. Non scrive niente.';
// Deseleziona tutti
HELP_TEXTS['#pw-jira-select-none'] = 'Toglie la spunta a tutti i sottotask proposti. Non scrive niente.';
// Continua
HELP_TEXTS['#pw-jira-select-continua'] = 'Passa ai campi aggiuntivi dei sottotask spuntati: Stima originale (1d), Activity Type, Production Weight, Tempo Team. Data scadenza e Start date pianificato non si chiedono: sono il giorno di ciascun sottotask. Chiede a Jira, solo in lettura, quali campi esistono su questo progetto.\n\nSe il progetto non ne ha, si va direttamente all\'anteprima. Su Jira non viene ancora creato niente.';
// Campo Jira
HELP_TEXTS['pwExtraFieldSelectOpen'] = 'Apre l\'elenco con ricerca dei valori ammessi da Jira per questo campo (per esempio Activity Type o Tempo Team). Per Activity Type c\'è una tendina per ogni attività della Griglia presente nella creazione.\n\nIl valore verrà scritto su Jira solo alla creazione. Activity Type e Tempo Team scelti vengono ricordati, solo in questo browser, come proposta per le volte successive.';
// Ricalcola su tutti i sottotask del Task
HELP_TEXTS['pw-jira-ricalcola-weight'] = 'Con la spunta (predefinita), al momento della creazione il Production Weight di OGNI sottotask del Task diventa 100% diviso il numero totale dei suoi sottotask. Vengono riscritti su Jira anche quelli già esistenti prima. L\'anteprima mostra il conteggio reale.\n\nSenza spunta puoi scrivere i pesi a mano riga per riga, e valgono solo per i sottotask nuovi.';
// Continua
HELP_TEXTS['#pw-jira-extra-continua'] = 'Conferma i valori dei campi aggiuntivi e apre l\'anteprima: verifica su Jira, senza creare nulla, quali sottotask sono da creare, quali esistono già e quali darebbero errore.\n\nL\'anteprima aggiorna in Griglia gli indicatori dei sottotask già esistenti e degli errori. Activity Type e Tempo Team vengono ricordati in questo browser.';
// Crea sottotask
HELP_TEXTS['#pw-jira-confirm-create'] = 'SCRIVE SU JIRA. Crea davvero i sottotask «da creare» dell\'anteprima, sotto i Task scelti. Ognuno è assegnato all\'operatore tramite la sua email, con titolo «[Attività] - [Comune] - [Cognome] - Gio 29/10/2026», data inizio e scadenza nel giorno del sottotask e i campi aggiuntivi compilati: Stima originale, Activity Type, Target Production ereditato dal Task, Production Weight, Start date pianificato, Tempo Team.\n\nSe «Ricalcola su tutti» è spuntato, riscrive su Jira anche il Production Weight dei sottotask già esistenti dello stesso Task. Non duplica un sottotask già presente per lo stesso operatore, Task e settimana.\n\nGli indicatori 🎫 vengono salvati in Griglia (pianificazione condivisa). Dall\'app non si può annullare: un sottotask creato per errore va cancellato a mano su Jira. Disattivato per i ruoli in sola lettura.';
// Commessa
HELP_TEXTS['cpToggleComm'] = 'Apre o chiude tutte le righe di questa commessa nel Controllo Produzione. Solo visualizzazione: vale per questa settimana finché non ricarichi la pagina e non modifica dati.';
// Squadra
HELP_TEXTS['cpToggleSq'] = 'Apre o chiude le righe di questa squadra nel Controllo Produzione. Solo visualizzazione: non modifica dati.';
// 🔄 Sincronizza squadra
HELP_TEXTS['pwControlloSyncJira'] = 'Come «Sincronizza da Jira», ma solo per questa squadra in questa settimana. Legge da Jira i worklog degli operatori con email e SOVRASCRIVE «Ore Jira» e Ticket/Epic: un giorno senza worklog va a 0 e senza ticket. Per i ticket che qui non hanno ancora un Km/Cad, legge il valore da Jira e lo mette come «👁 da verificare».\n\nDopo una seconda conferma SCRIVE SU JIRA i Km/Cad verificati (da report o confermati a mano), ma solo la differenza rispetto all\'ultimo invio, nel campo scelto per la commessa. Su Actual Production la stessa differenza va anche sul Task padre, su KPI_Quantità lavorata solo sul sottotask. I valori «da verificare» non vengono inviati.\n\nTutto viene salvato nel Controllo Produzione condiviso. Gli operatori senza email vengono saltati. Riservato ad admin e responsabili.';
// KM su Jira
HELP_TEXTS['cpKmJiraVaiPrimo'] = 'Riepilogo dello stato dei Km/Cad della squadra rispetto a Jira: quanti allineati, da verificare, da aggiornare, da inviare, senza email.\n\nIl clic apre la squadra se era chiusa e porta alla prima riga ancora in sospeso. Non modifica nulla.';
// Stato Km/Cad su Jira
HELP_TEXTS['cpJiraFlagTicketClick'] = 'Stato del Km/Cad di questo ticket rispetto a Jira. Il clic dipende dallo stato:\n- 👁 Verifica: il valore è stato letto da Jira, di solito messo dall\'operatore per chiudere il ticket. Il clic chiede di confermarlo come produzione reale, e da lì potrà essere inviato.\n- ⬆ Invia, ↻ Agg., ⚠ Email: il clic spiega solo cosa manca. L\'invio si fa con «🔄 Sincronizza squadra».\n- ✓ Jira e ○ Jira: il clic, con conferma, azzera lo storico di scrittura del ticket. Alla sincronizzazione successiva l\'INTERO valore verrà risommato su Jira: usalo solo se hai azzerato il campo su Jira a mano.\n\nLe modifiche vanno nel Controllo Produzione condiviso; il clic in sé non scrive su Jira. Riservato ad admin e responsabili.';
// 🔄 Rileggi da Jira
HELP_TEXTS['cpRereadTicket'] = 'Rilegge ora da Jira, solo in lettura, il valore di produzione di questo ticket, nel campo scelto per la commessa. Sostituisce il Km/Cad locale e lo considera verificato e già allineato: la sincronizzazione successiva non invierà nulla per questo ticket.\n\nServe quando il valore è stato corretto a mano su Jira dopo che l\'app l\'aveva già letto o scritto. Chiede conferma, salva nel Controllo Produzione condiviso ed è riservato ad admin e responsabili. Compare solo sui ticket già scritti dall\'app.';
// 🗓️ Apri in Griglia
HELP_TEXTS['cpApriInGriglia'] = 'Passa alla Griglia settimanale sulla cella di questo operatore in questo giorno, per un controllo rapido della pianificazione. Compare un bottone «⬅ Torna al Controllo Produzione» per tornare indietro.\n\nSolo navigazione: non modifica nulla.';
// ⬅ Torna al Controllo Produzione
HELP_TEXTS['#cp-torna-btn'] = 'Torna al Controllo Produzione nel punto in cui eri, dopo essere passato alla Griglia con 🗓️. Solo navigazione.';
// Verificato
HELP_TEXTS['cp-verificato'] = 'Segna la riga (operatore + giorno) come controllata dall\'ufficio. Il flag viene salvato subito nel Controllo Produzione condiviso.\n\nNon scrive niente su Jira e non cambia il Km/Cad. Riservato ad admin e responsabili.';
// Produzione su
HELP_TEXTS['cp-campo-produzione'] = 'Sceglie in quale campo Jira dei sottotask va scritto il Km/Cad di questa commessa: Actual Production (predefinito) o KPI_Quantità lavorata (commesse col nuovo formato, per ora SINFI). Jira non permette di ricavarlo da solo, quindi va impostato qui.\n\nCambiandolo, con conferma, la scelta viene salvata per tutti. I valori già scritti sul campo precedente restano dove sono. Alla prossima «🔄 Sincronizza» ogni Km/Cad verificato viene scritto per intero sul nuovo campo; su KPI_Quantità lavorata solo sul sottotask, non sul Task padre.\n\nCambiare il campo non scrive niente su Jira. Riservato ad admin e responsabili.';
// Ore MySond
HELP_TEXTS['cpMysondDettaglio'] = 'Apre il dettaglio delle ore inserite in MySond dall\'operatore in quel giorno, su tutte le commesse: commessa, voce, attività, descrizione e ore. Il viaggio è in azzurro, le ore non lavorate in arancio, le voci sul cantiere pianificato in verde.\n\nMostra anche il confronto con le Ore Jira: il numero è in ambra quando non tornano. Sola lettura.';
// Carica MySond
HELP_TEXTS['#cpms-confirm'] = 'Conferma il caricamento del file MySond riassunto sopra. Cancella dal database condiviso TUTTE le ore MySond già caricate, di tutti gli operatori, per i giorni tra la prima e l\'ultima data del file, poi salva quelle nuove.\n\nNon si può annullare: per tornare indietro va ricaricato il file precedente. Jira e il Controllo Produzione non vengono toccati. Riservato ad admin e responsabili.';

// ---- Controllo anomalie e Solleciti ----
// 🔍 Controllo anomalie
HELP_TEXTS['#cpa-toggle'] = 'Apre la finestra «Controllo anomalie» per la settimana mostrata in Controllo Produzione. Confronta la Griglia (con le Ferie) e le ore MySond caricate con le ore registrate su Jira, e propone le correzioni. Il numero sul bottone conta le anomalie ancora aperte, senza quelle ignorate.\n\nLa prima volta che apri una settimana legge da sola i worklog da Jira. Le volte dopo riprende l\'ultima lettura, salvata nel browser, e la ricalcola sulla Griglia di adesso: per aggiornarla usa «↻ Ricontrolla». Su Jira non scrive mai.';
// ▶ Avvia controllo / ↻ Ricontrolla
HELP_TEXTS['cpaAvvia'] = 'Rilegge da Jira, in sola lettura, i worklog della settimana e gli Epic dei sottotask, poi ricalcola tutte le anomalie. Legge gli operatori presenti in Griglia, oppure tutto il pool se è spuntato «anche chi non è in Griglia». Aggiorna anche lo storico meteo della settimana. La lettura resta salvata nel browser per le ultime 12 settimane.\n\nChi non ha l\'email in anagrafica non viene controllato e compare un avviso. Il controllo riparte da zero: le proposte di cella modificate a mano si perdono, mentre le celle già aggiunte in Griglia e le anomalie ignorate restano. Bisogna essere collegati: offline non funziona.';
// ☐ anche chi non è in Griglia
HELP_TEXTS['cpaTogglePool'] = 'Se è spuntato, il prossimo «Avvia controllo» o «Ricontrolla» legge i worklog Jira anche degli operatori del pool che questa settimana non sono in Griglia (gli ex colleghi restano esclusi). Così si vedono le ore registrate da chi non era pianificato. La lettura è più lenta.\n\nLa spunta da sola non rilancia il controllo. Non viene salvata: vale finché la pagina resta aperta.';
// 📒 Registro solleciti
HELP_TEXTS['cpaRegistroApri'] = 'Apre il registro dei solleciti segnati come inviati per la settimana mostrata. Per ogni invio indica operatore, giornate, data e ora, autore, canale (mail o Teams) e testo. Il numero tra parentesi conta gli invii registrati nella settimana.\n\nIl registro è condiviso: è salvato con la pianificazione e lo vedono tutti. Si consulta anche senza rilanciare il controllo. Se c\'è un controllo della stessa settimana, dice anche se le ore sono state sistemate o mancano ancora. È solo da consultare.';
// Linguette dei controlli
HELP_TEXTS['cpaFiltro'] = 'Ogni linguetta mostra le anomalie di un solo controllo; «Tutte» le mostra tutte, raggruppate per giorno. Il numero conta le anomalie aperte, senza le ignorate e quelle già corrette in Griglia. Un secondo clic sulla linguetta attiva torna a «Tutte».\n\nLa linguetta scelta decide anche cosa entra in «📋 Copia elenco» e «📄 Esporta PDF». Cambiarla non rilegge Jira.';
// Tutte
HELP_TEXTS['cpaFiltro:tutte'] = 'Mostra le anomalie aperte di tutti i controlli, raggruppate giorno per giorno. Il numero è il totale delle anomalie aperte, senza le ignorate e quelle già corrette in Griglia.\n\nCon questa linguetta, «📋 Copia elenco» e «📄 Esporta PDF» comprendono tutti i controlli; nel PDF c\'è una sezione per ciascuno. Cambiare linguetta non rilegge Jira.';
// ⏱ Pianificati senza worklog
HELP_TEXTS['cpaFiltro:pianificato_senza_worklog'] = 'Controlla gli operatori in Griglia in un giorno già passato che su Jira hanno registrato meno di un quarto d\'ora. I giorni segnati in Ferie non vengono controllati.\n\nLa correzione proposta è chiedere all\'operatore di registrare le ore sul sottotask del cantiere. Se quel giorno era assente, va segnato in Ferie e la cella esce dal controllo. Queste anomalie entrano in «✉️ Prepara solleciti».';
// 👻 Worklog senza pianificazione
HELP_TEXTS['cpaFiltro:worklog_senza_pianificazione'] = 'Controlla le ore registrate su Jira in un giorno in cui l\'operatore non ha cantieri in Griglia. Se in Griglia risulta in ferie o non disponibile, la priorità è alta.\n\nPer ogni caso propone la cella da aggiungere in Griglia. La prende dal sottotask su cui ha registrato le ore; se non c\'è, da un cantiere della settimana con lo stesso Epic, poi dal cantiere segnato quel giorno, poi dal giorno pianificato più vicino. Indica anche quanto è sicura la proposta. Puoi modificarla e applicarla con «✓ Aggiungi in Griglia». Se invece il worklog è sul giorno sbagliato, va corretto a mano su Jira.';
// 🟣 Epic diverso dalla Griglia
HELP_TEXTS['cpaFiltro:epic_diverso'] = 'Controlla se in un giorno l\'operatore ha registrato ore su ticket di un Epic diverso da quello dei cantieri pianificati. Queste anomalie hanno priorità alta. L\'Epic del cantiere si ricava dal sottotask Jira creato dalla Griglia: le giornate senza sottotask non si possono confrontare e vengono solo contate nelle note.\n\nLa correzione proposta è spostare su Jira il worklog sul sottotask giusto. Se il lavoro era davvero su quell\'Epic, va corretto invece il cantiere in Griglia.';
// ⚖️ Ore diverse in squadra
HELP_TEXTS['cpaFiltro:ore_squadra'] = 'Confronta le ore Jira del giorno tra gli operatori della stessa commessa e squadra. Segnala chi ha almeno lo «scarto minimo» in meno del collega con più ore: la soglia si regola nella barra sotto ed è 1 h se non la cambi. Non vengono confrontati chi ha zero ore (è già tra i «Pianificati senza worklog») e chi quel giorno è su più squadre.\n\nSe l\'operatore ha davvero lavorato meno, ad esempio per un permesso, non c\'è nulla da correggere. Gli operatori segnalati entrano in «✉️ Prepara solleciti».';
// 🧾 Jira diverso da MySond
HELP_TEXTS['cpaFiltro:mysond_diverso'] = 'Confronta il totale delle ore Jira del giorno con le ore MySond. Viaggio e ore non lavorate di norma non vanno su Jira. Per questo Jira è in regola se sta tra le ore di lavoro senza viaggio e quelle con il viaggio, con una tolleranza pari allo «scarto minimo» (0,5 h se non lo cambi).\n\nFunziona solo se le ore MySond della settimana sono caricate con «📥 Carica MySond» in Controllo Produzione; altrimenti il confronto non viene fatto. Quando Jira ha meno ore, l\'operatore entra in «✉️ Prepara solleciti».';
// 🌧 Ore scoperte con maltempo
HELP_TEXTS['cpaFiltro:ore_scoperte_maltempo'] = 'Segnala le giornate pianificate in cui le ore Jira non arrivano alla giornata piena di 8 h e sul cantiere il maltempo era probabile nelle ore di lavoro, dalle 8 alle 17. Si basa sulla pioggia osservata ora per ora e sulle allerte della Protezione Civile.\n\nServe a riconoscere le ore mancanti dovute al meteo. Controlla solo i giorni passati e i cantieri localizzati. Sulle altre anomalie con poche ore, il maltempo compare come etichetta in più.';
// ⚖️ scarto minimo
HELP_TEXTS['cpaSetSogliaOre:diffOreSquadra'] = 'Imposta quante ore in meno del collega di squadra con più ore deve avere un operatore perché «Ore diverse in squadra» lo segnali. Il controllo si ricalcola subito, senza rileggere Jira.\n\nLa scelta resta salvata solo in questo browser.';
// 🧾 scarto minimo
HELP_TEXTS['cpaSetSogliaOre:diffOreMysond'] = 'Imposta di quanto le ore Jira devono scostarsi dalle ore MySond (viaggio escluso) perché «Jira diverso da MySond» le segnali. Compare solo se le ore MySond della settimana sono caricate. Il controllo si ricalcola subito, senza rileggere Jira.\n\nLa scelta resta salvata solo in questo browser.';
// Mostra / Nascondi ignorate
HELP_TEXTS['cpaToggleIgnorate'] = 'Mostra o nasconde nell\'elenco le anomalie che hai ignorato. Compaiono in grigio, con il bottone «↩ Ripristina». Il numero tra parentesi conta le anomalie ignorate della settimana.\n\nCambia solo cosa vedi: le ignorate restano comunque fuori dai conteggi, da «Copia elenco», dal PDF e dai solleciti.';
// ✉️ Prepara solleciti
HELP_TEXTS['cpaSollApri'] = 'Apre le bozze di sollecito, una per operatore, per chi non ha caricato le ore su Jira o ne ha meno dei colleghi di squadra o di MySond. Considera solo le anomalie aperte e non ignorate. Tra parentesi c\'è quanti operatori sono ancora da sollecitare.\n\nPuoi rivedere ogni testo, farlo riscrivere dall\'assistente AI e aprirlo in posta o in Teams: nessun messaggio parte da solo. Dopo l\'invio spunta «Sollecito inviato» per registrarlo. La spunta è visibile anche ai colleghi.';
// 📋 Copia elenco
HELP_TEXTS['cpaCopia'] = 'Copia negli appunti, come testo, l\'elenco delle anomalie aperte della linguetta mostrata con le correzioni proposte. È pronto da incollare in una mail o in una chat. Non comprende le ignorate e quelle già corrette in Griglia.\n\nNon modifica nulla e non invia nulla.';
// 📄 Esporta PDF
HELP_TEXTS['cpaEsportaPdf'] = 'Scarica un PDF in A4 orizzontale con le anomalie aperte della linguetta mostrata, da mandare ai controller. Con «Tutte» c\'è una sezione per ogni controllo. Per ogni anomalia riporta giorno, dati del confronto, gravità (barretta colorata), correzione proposta ed eventuale data del sollecito già inviato.\n\nNon comprende le ignorate e quelle già corrette in Griglia. Nell\'intestazione indica quando sono state lette le ore Jira: se la lettura non è di oggi, conviene fare prima «↻ Ricontrolla». Non invia nulla.';
// ↻ Ricontrolla (singola anomalia)
HELP_TEXTS['cpaRicontrollaVoce'] = 'Rilegge da Jira, in sola lettura, le ore e gli Epic dei sottotask solo degli operatori di questa anomalia, poi ricalcola il controllo. Per «Ore diverse in squadra» rilegge tutta la squadra. Usalo dopo una correzione fatta su Jira, così non devi rileggere tutta la settimana.\n\nIn cima all\'elenco compare l\'esito: risolta, ancora aperta, oppure nuove anomalie per le stesse persone. Finché il ricontrollo è in corso, gli altri «↻» sono disattivati.';
// Timeline worklog (src/js/produzione-timeline.js)
HELP_TEXTS['#cptl-toggle'] = 'Apre la «Timeline worklog» della settimana mostrata in Controllo Produzione. Per ogni operatore impiegato disegna una barra oraria con un segmento per ogni worklog Jira, da quando è stato attivato a quando è stato chiuso. Accanto riporta prima ora, ultima ora, totale del giorno e pause. Cliccando un segmento si apre il ticket su Jira in un\'altra scheda; per admin e responsabili apre invece la correzione del worklog, e «＋» sulla riga ne aggiunge uno.\n\nLa prima volta che apri una settimana rilegge da sola i worklog da Jira, in sola lettura, per tutti gli operatori in Griglia, anche quelli senza giorni compilati. Intanto mostra quelli salvati dall\'ultimo «🔄 Sincronizza da Jira». I ticket di commesse che non sono in dashboard hanno il bordo rosso. Non modifica la Griglia; su Jira scrive solo quando correggi, aggiungi o elimini un worklog e confermi.\n\nScorciatoia: il click destro su una riga della tabella del Controllo Produzione apre la timeline direttamente sul giorno della riga, filtrata su quell\'operatore (sui campi, sui link e sui bottoni resta il loro click destro).';
HELP_TEXTS['cpTlRileggi'] = 'Rilegge da Jira, in sola lettura, i worklog della settimana di tutti gli operatori in Griglia, anche quelli senza giorni compilati, e ridisegna la timeline. Lo fa da sola la prima volta che apri la settimana; usalo per aggiornare dopo una correzione su Jira. Così vedi anche i worklog dei giorni non pianificati e quelli su commesse che non sono in dashboard.\n\nLa lettura vale solo per questa finestra finché la pagina resta aperta: non aggiorna la colonna «Ore Jira» del Controllo Produzione, per quella serve «🔄 Sincronizza da Jira». Chi non ha l\'email in anagrafica non viene letto. Bisogna essere collegati.';
HELP_TEXTS['cpTlWlApri'] = 'Apre la correzione di questo worklog Jira: puoi cambiare giorno, ora di inizio, ora di fine e commento, oppure eliminarlo. Serve quando l\'operatore non ha fatto bene le transizioni del sottotask e il worklog creato dall\'automazione ha orari o durata sbagliati.\n\nNiente viene scritto finché non premi «Salva su Jira» e confermi. Solo admin e responsabili; il segmento «in corso» (IN PROGRESS) non si corregge, non è ancora un worklog.';
HELP_TEXTS['cpTlWlNuovo'] = 'Aggiunge un worklog Jira per questo operatore e questo giorno, per esempio quando il sottotask non è mai passato da IN PROGRESS e il worklog manca. Scegli il ticket (sono proposti i suoi sottotask della Griglia, prima quelli del giorno), inizio, fine e commento.\n\nNiente viene scritto finché non premi «Salva su Jira» e confermi. Se il ticket è assegnato a un altro, l\'app avvisa: il worklog non comparirebbe nella giornata dell\'operatore. Solo admin e responsabili.';
HELP_TEXTS['cpTlWlSalva'] = 'Scrive su Jira il worklog con il giorno e gli orari indicati (ora italiana), dopo una conferma che mostra prima e dopo. La stima residua del ticket non cambia. Se nel frattempo qualcuno ha modificato lo stesso worklog su Jira, non tocca nulla e rilegge l\'operatore.\n\nPoi rilegge da Jira i worklog della settimana dell\'operatore e ridisegna la timeline. La colonna «Ore Jira» del Controllo Produzione si aggiorna con «🔄 Sincronizza da Jira». Ogni modifica resta nel log attività con chi l\'ha fatta.\n\nAutore su Jira: un worklog aggiunto risulta a nome dell\'assegnatario del sottotask; uno corretto tiene il suo autore, tranne quelli inseriti dall\'app a nome dell\'account di servizio, che passano all\'assegnatario (per sistemarne uno basta aprirlo e salvarlo senza cambiare nulla).';
HELP_TEXTS['cpTlWlElimina'] = 'Elimina questo worklog da Jira, dopo una conferma: le sue ore spariscono dal ticket. Da qui non si può annullare; per rimetterlo bisogna aggiungerlo di nuovo con «＋». L\'eliminazione resta nel log attività con chi l\'ha fatta.';
HELP_TEXTS['cpTlEsportaPdf'] = 'Scarica un PDF in A4 orizzontale con la vista attuale: il giorno o la settimana scelti, con i filtri applicati. Contiene le barre orarie con inizio, fine, totale e pause di ogni operatore. In fondo c\'è l\'elenco dei worklog con ticket, orari, durata e commento. Nel PDF segmenti e ticket sono cliccabili e aprono Jira; le commesse non in dashboard sono in rosso.\n\nNell\'intestazione indica da dove vengono i worklog e quando sono stati letti. Non invia nulla.';
HELP_TEXTS['cpTlGiorno'] = 'Sceglie il giorno da mostrare: un operatore per riga, tutti sullo stesso asse orario, così si confrontano facilmente. Il giorno di oggi ha il bordo verde. «Settimana» mostra ogni operatore con una riga per giorno e il totale settimanale.\n\nCambiare giorno non rilegge Jira.';
HELP_TEXTS['cpTlSet:commessa'] = 'Mostra solo gli operatori pianificati su questa commessa, o con worklog su ticket della commessa, nel giorno scelto. La commessa di un ticket si riconosce dal sottotask creato dalla Griglia, altrimenti dal «Codice progetto Jira» delle commesse in dashboard. Nei giorni non pianificati conta la commessa in cui l\'operatore compare in Griglia.\n\n«⚠ Commesse non in dashboard» mostra solo le giornate con ore su progetti Jira che non corrispondono a nessuna commessa: se la commessa c\'è, manca il codice progetto Jira nella sua anagrafica. Il filtro vale anche per l\'export PDF.';
HELP_TEXTS['cpTlSet:squadra'] = 'Mostra solo gli operatori di questa squadra. L\'elenco segue la commessa scelta.\n\nIl filtro vale anche per l\'export PDF.';
HELP_TEXTS['cpTlCerca'] = 'Filtra per nome dell\'operatore o per cantiere pianificato. Il filtro vale anche per l\'export PDF.';
HELP_TEXTS['cpTlSet:colore'] = 'Sceglie come colorare i segmenti. «ticket»: un colore per ogni ticket della riga, utile a vedere quando si passa da un ticket all\'altro. «commessa»: un colore per commessa, uguale in tutte le righe, con la legenda sopra la tabella; in grigio i ticket di cui non si riconosce la commessa.';
HELP_TEXTS['cpTlSet:soglia'] = 'Segnala, in giallo e tra le righe da controllare, le giornate già passate in cui un operatore pianificato ha meno ore di worklog di quelle scelte. Con «—» non segnala niente di questo tipo.\n\nGli altri avvisi restano sempre attivi: nessun worklog, sovrapposizioni, worklog senza pianificazione o in ferie, sottotask IN PROGRESS dal giorno prima.';
HELP_TEXTS['cpTlSet:soloControllo'] = 'Se è spuntato, mostra solo le giornate con un avviso (righe gialle). Il filtro vale anche per l\'export PDF.';
// ↘ Vai alla riga
HELP_TEXTS['cpaVaiAllaRiga'] = 'Chiude il controllo anomalie e porta alla riga corrispondente nella tabella del Controllo Produzione. Se commessa e squadra erano chiuse le riapre, e la riga lampeggia per qualche istante. Nelle schede «Ore diverse in squadra» fa lo stesso un clic sul nome di un operatore.\n\nNon modifica nulla. Se nel frattempo la cella è stata cambiata in Griglia, la riga potrebbe non essere trovata.';
// Ignora / ↩ Ripristina
HELP_TEXTS['cpaIgnora'] = '«Ignora» toglie questa anomalia dall\'elenco e dai conteggi, anche dopo un nuovo controllo. «↩ Ripristina» la rimette tra quelle aperte. Le anomalie ignorate restano fuori anche da «Copia elenco», dal PDF e dai solleciti.\n\nLa scelta resta salvata solo in questo browser: i colleghi continuano a vedere l\'anomalia. Non tocca né la Griglia né Jira.';
// ✓ Aggiungi in Griglia
HELP_TEXTS['cpaAzione'] = 'Aggiunge in Griglia la cella proposta per questo worklog senza pianificazione, con un cantiere per ogni riga. L\'operatore entra nella squadra di chi quel giorno è già sullo stesso cantiere, altrimenti nella sua riga della commessa. Se la commessa non c\'è nella settimana, viene creata.\n\nSe quel giorno l\'operatore era in ferie o non disponibile, toglie anche l\'assenza dalle Ferie. Chiede sempre conferma e salva Griglia e Ferie, che sono condivise; su Jira non cambia nulla. Servono il permesso di modifica e commessa e cantiere su ogni riga. Non fa nulla se nel frattempo l\'operatore è già stato pianificato quel giorno.';
// ＋ altro cantiere
HELP_TEXTS['cpaPropAggiungi'] = 'Aggiunge una riga vuota alla proposta di cella, per indicare un altro cantiere su cui l\'operatore ha lavorato quel giorno. Compila commessa e cantiere (e l\'attività, se serve) prima di «✓ Aggiungi in Griglia».\n\nCambia solo la proposta: in Griglia non viene scritto nulla finché non confermi.';
// ✕ riga della proposta
HELP_TEXTS['cpaPropTogli'] = 'Toglie questa riga dalla proposta di cella. Se era l\'unica, resta una riga vuota da compilare.\n\nCambia solo la proposta: in Griglia non viene scritto nulla finché non confermi con «✓ Aggiungi in Griglia».';
// ↺ proposta iniziale
HELP_TEXTS['cpaPropRipristina'] = 'Annulla le modifiche fatte a mano alla proposta e torna alla cella proposta all\'inizio dal controllo. Compare solo dopo che hai modificato la proposta.\n\nNon scrive nulla in Griglia.';
// ← Anomalie
HELP_TEXTS['cpaSollChiudi'] = 'Torna all\'elenco delle anomalie. Le bozze di sollecito non vengono conservate: quando riapri «✉️ Prepara solleciti» ripartono dal testo base, e anche la scadenza «Entro» va reinserita. Prima di uscire, invia o copia i testi che hai modificato o fatto scrivere all\'assistente.\n\nLe spunte «Sollecito inviato», il tono e la firma restano.';
// Tono
HELP_TEXTS['cpaSollOpzione:tono'] = 'Sceglie il tono che l\'assistente AI usa quando riscrive i solleciti. Il testo base non cambia.\n\nIl tono, come la firma, resta salvato solo in questo browser.';
// ↺ Testo base
HELP_TEXTS['cpaSollTestoBase'] = 'Rigenera per tutti gli operatori il testo standard del sollecito, con la firma e la scadenza «Entro» indicate. Scarta le modifiche fatte a mano e i testi scritti dall\'assistente; se qualche bozza è stata modificata, chiede prima conferma.\n\nNon invia nulla e non cambia le spunte «Sollecito inviato».';
// ✨ Scrivi con l'assistente AI
HELP_TEXTS['cpaSollAi'] = 'Fa riscrivere all\'assistente AI le bozze di tutti gli operatori ancora da sollecitare. Usa il tono scelto, la firma e la scadenza «Entro». L\'assistente scrive solo il testo: non modifica dati e non invia nulla.\n\nRiscrive anche le bozze modificate a mano, dopo una conferma. Rileggi i testi prima di inviarli. Serve che l\'amministratore abbia attivato l\'assistente: se il bottone è sbiadito non è disponibile, e passando il mouse ne vedi il motivo.';
// 📋 Copia tutti
HELP_TEXTS['cpaSollCopia:tutti'] = 'Copia negli appunti, in un unico testo, i solleciti di tutti gli operatori ancora da sollecitare. Per ognuno ci sono destinatario con email, oggetto e testo, separati da una riga. Serve per inviarli da un altro programma.\n\nNon invia nulla e non segna nessun sollecito come inviato.';
// 📋 Copia
HELP_TEXTS['cpaSollCopia'] = 'Copia negli appunti oggetto e testo del sollecito per questo operatore, da incollare dove vuoi, ad esempio in una mail o in una chat.\n\nNon invia nulla e non segna il sollecito come inviato: dopo l\'invio spunta «Sollecito inviato».';
// ✉️ Apri mail
HELP_TEXTS['cpaSollMail'] = 'Apre il tuo programma di posta con una nuova mail già compilata: destinatario (l\'email dell\'operatore in anagrafica), oggetto e testo della bozza. La mail non parte da sola: la rivedi e la invii tu.\n\nSe il testo è troppo lungo per essere inserito in automatico, la mail si apre con il solo oggetto e il testo finisce negli appunti, da incollare. Se l\'operatore non ha email in anagrafica il bottone è sbiadito: usa «📋 Copia». Dopo l\'invio spunta «Sollecito inviato».';
// 💬 Apri in Teams
HELP_TEXTS['cpaSollTeams'] = 'Apre la chat di Microsoft Teams con l\'operatore, trovato tramite la sua email in anagrafica, con il messaggio già scritto nella casella. Il testo viene anche copiato negli appunti. Il messaggio non parte da solo: lo invii tu con Invio.\n\nServe l\'email aziendale: con un\'email personale Teams potrebbe non trovare la persona. Se il testo è troppo lungo, la chat si apre vuota e basta incollarlo. Dopo l\'invio spunta «Sollecito inviato».';
// Sollecito inviato
HELP_TEXTS['cpaSollSegnaInviato'] = 'Registra che hai inviato il sollecito a questo operatore per le giornate mostrate, con data, autore, canale (mail o Teams) e testo. La spunta è condivisa: i colleghi vedono chi è già stato sollecitato, l\'invio compare nel «📒 Registro solleciti» e sulle anomalie appare «✉️ sollecitato».\n\nSe in seguito risulta mancante una giornata nuova, l\'operatore torna «da inviare» e la giornata nuova è riquadrata. Togliere la spunta annulla l\'ultimo invio registrato. Serve il permesso di modifica. La spunta non invia nessun messaggio.';
// ← Indietro
HELP_TEXTS['cpaRegistroChiudi'] = 'Chiude il registro e torna alla vista da cui l\'hai aperto: l\'elenco delle anomalie oppure le bozze di sollecito, che restano come le avevi lasciate.';
// tutte le settimane
HELP_TEXTS['cpaRegistroTutte'] = 'Se è spuntato, il registro mostra i solleciti di tutte le settimane, con una colonna Settimana, invece che solo quelli della settimana aperta.\n\nCambia solo cosa vedi.';
// testo / nascondi
HELP_TEXTS['cpaRegistroTesto'] = 'Mostra o nasconde sotto la riga l\'oggetto e il testo del sollecito, così com\'erano quando è stato segnato inviato. I testi molto lunghi sono salvati accorciati.\n\nServe solo a consultare.';

// ---- Selettori e opzioni (select / checkbox) ----
// Anno
HELP_TEXTS['#pw-anno'] = 'Sceglie l\'anno della settimana da mostrare; la scheda aperta si ricarica su quella settimana.\n\nSolo navigazione: non modifica nessun dato.';
// Settimana
HELP_TEXTS['#pw-week'] = 'Sceglie il numero di settimana (ISO, da lunedì a sabato) da mostrare; la scheda aperta si ricarica su quella settimana.\n\nSolo navigazione: non modifica nessun dato. La settimana scelta viene ricordata da questo browser.';
// Commessa del blocco
HELP_TEXTS['pwUpdateCommessa'] = 'Sceglie la commessa di questo blocco della Griglia, nella settimana mostrata.\n\nAttenzione: cambiando commessa il blocco riparte da zero, con una sola «Squadra 1» vuota: squadre, operatori, cantieri e strumenti che c\'erano vengono tolti, senza conferma. Si salva subito nella Griglia condivisa; finché non ricarichi la pagina si può annullare con «↶ Indietro». Serve il ruolo admin o responsabile.';
// Ordina
HELP_TEXTS['pwFerieSetSort'] = 'Cambia l\'ordine degli operatori nella Vista Ferie: per cognome e nome (A → Z o Z → A) oppure prima chi ha assenze nella settimana.\n\nCambia solo la vista e non modifica dati.';
// solo giorni già assenti
HELP_TEXTS['pwFerieBulkSetSoloAssenti'] = 'Con la spunta (predefinita), «🏖 Ferie» e «🚫 Non disponibile» della barra cambiano solo il tipo dei giorni che hanno già un\'assenza, senza aggiungerne di nuove. Togli la spunta per segnare l\'assenza anche sui giorni liberi.\n\nDa sola non modifica le ferie.';
// Filtro regione
HELP_TEXTS['pwDwSetFiltro:regione'] = 'Mostra nel prospetto Doppia Week solo gli operatori con provenienza nella regione scelta. Vale anche per l\'esportazione PDF.\n\nCambia solo la vista e non modifica dati.';
// Filtro provincia
HELP_TEXTS['pwDwSetFiltro:provincia'] = 'Mostra nel prospetto Doppia Week solo gli operatori con provenienza nella provincia scelta. Vale anche per l\'esportazione PDF.\n\nCambia solo la vista e non modifica dati.';
// Ordinamento
HELP_TEXTS['pwDwSetFiltro:ordine'] = 'Ordina gli operatori del prospetto Doppia Week per nome oppure per provenienza. Vale anche per l\'esportazione PDF.\n\nCambia solo la vista e non modifica dati.';
// Filtro regione
HELP_TEXTS['#pw-map-regione-filter'] = 'Limita alla regione scelta entrambe le mappe: i cantieri nella mappa Cantieri e gli operatori nella mappa Residenze.\n\nCambia solo la vista e non modifica dati.';
// Ordine delle tappe
HELP_TEXTS['#pw-spost-strategia'] = 'Sceglie come ordinare le tappe al prossimo «Calcola percorso»: prima la più lontana e poi il rientro, prima la più vicina allontanandosi, il percorso più breve in assoluto, oppure nell\'ordine in cui le hai scritte.\n\nDa sola non ricalcola il percorso.';
// Giro chiuso
HELP_TEXTS['#pw-spost-chiuso'] = 'Se è spuntato, il percorso calcolato torna alla partenza dopo l\'ultima tappa, e km e tempi comprendono il ritorno.\n\nVale dal prossimo «Calcola percorso».';
// Tipo di imprevisto
HELP_TEXTS['ap-imp-tipo'] = 'Sceglie il tipo di imprevisto da aggiungere: l\'assenza di un operatore oppure un cantiere fermo. Cambiandolo, la scelta di operatore o cantiere si azzera.\n\nNon modifica la Griglia.';
// Operatore / cantiere
HELP_TEXTS['ap-imp-chi'] = 'Sceglie chi è assente (fra gli operatori) o quale cantiere è fermo (fra quelli in Griglia questa settimana), a seconda del tipo di imprevisto.\n\nNon modifica la Griglia: l\'imprevisto entra in elenco con «＋ Aggiungi».';
// Giorni dell'imprevisto
HELP_TEXTS['ap-imp-giorno'] = 'Spunta i giorni in cui vale l\'imprevisto. I giorni già passati non si possono scegliere.\n\nNon modifica la Griglia: l\'imprevisto entra in elenco con «＋ Aggiungi».';
// in Ferie come
HELP_TEXTS['ap-imp-registra'] = 'Per un\'assenza, sceglie se, applicando la riparazione, registrarla anche in Ferie come «Ferie» o «Non disponibile», oppure non registrarla.\n\nLe Ferie vengono scritte solo con «✓ Applica riparazione», e solo sui giorni non già segnati.';
// anche sabato
HELP_TEXTS['ap-opz-sabato'] = 'Se è spuntato, la bozza può usare anche il sabato come giorno di lavoro.\n\nVale dal prossimo calcolo. La Griglia non viene toccata.';
// considera meteo
HELP_TEXTS['ap-opz-meteo'] = 'Se è spuntato, il calcolo evita i giorni con allerta della Protezione Civile e sposta, quando può, il lavoro dei giorni con maltempo previsto. Le previsioni coprono solo i prossimi giorni.\n\nVale dal prossimo calcolo. La Griglia non viene toccata.';
// max km fra cantieri
HELP_TEXTS['ap-opz-maxkm'] = 'Spostamento massimo, in km, da un cantiere all\'altro durante la settimana. Il primo viaggio da casa a inizio trasferta non ha limite: conta i suoi km e, oltre 200 km, quel giorno vale mezza giornata produttiva.\n\nVale dal prossimo calcolo. La Griglia non viene toccata.';
// Includi
HELP_TEXTS['ap-includi'] = 'Se è spuntata, la riga entra nel calcolo della bozza e nell\'applicazione alla Griglia; togli la spunta per tenerla in lista senza pianificarla.\n\nLa bozza già calcolata va ricalcolata.';
// Priorità
HELP_TEXTS['ap-priorita'] = 'Priorità del cantiere: P1 è il più urgente. Il calcolo assegna prima i cantieri a priorità più alta e, a parità, quelli con la scadenza più vicina.\n\nLa bozza già calcolata va ricalcolata. La Griglia non viene toccata.';
