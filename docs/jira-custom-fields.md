# Atlante Campi Jira — Eagleprojects

> Riferimento locale, salvato per poter essere riletto rapidamente (da me o da chiunque apra il repo) senza dover re-interrogare Jira. Versione "viva" e navigabile: [Atlante Campi Jira](https://claude.ai/code/artifact/1c63bc97-84a8-4f70-ba8d-5b863ffd1aa0) (Claude Artifact, richiede l'account che l'ha pubblicato o la condivisione del link). Copia HTML standalone condivisibile: `docs/jira-custom-fields.html` in questa stessa cartella.

- **Fonte**: Jira Cloud `eagleprojects.atlassian.net`, letto via API `createmeta`/field-metadata per progetto+tipo ticket (nessuna scrittura).
- **Generato**: 2026-08-27
- **Copertura**: 23/23 progetti richiesti + GAR come quarto template di confronto
- **Custom field distinti trovati**: 41
- **Campo davvero universale**: `customfield_10432` (EPICKEY) — presente in tutti i template/tipi tranne "Iniziativa" del cluster C

## Come si raggruppano i progetti

Sono emersi **4 template**. Dentro un cluster i progetti condividono lo stesso set di custom field (stesso id, stesso nome); le differenze vivono *tra* i cluster, non dentro (salvo le 2 eccezioni puntuali in fondo).

### A — Rilievi classico (27 tipi ticket) — 14 progetti
`W07R, W08R, W13R, AI013RIL, AI25R, AI24R, W09R, AI004RIL, AI10R, W10R, WT033RIL, W03R, W01R, ASR0`

Verificato su **Bug** (18 custom field) e **Rilievi** (13 custom field, 12 su ASR0 — manca Tempo Team, vedi Eccezione 01).

### B — Rilievi + Task/ONP (28 tipi ticket) — 2 progetti
`T01P, T02P`

Estensione del template A con i tipi ticket **Task** e **ONP_prg** in più. T02P manca Tempo Team su Rilievi/Task (Eccezione 01).

### C — Task/Iniziativa (16 tipi ticket) — 6 progetti
`AI032, AI029, PS019, WT036, WT037, WT038`

Niente Rilievi/ONP_prg; ha invece il tipo **Iniziativa** con 4 campi esclusivi (Codice Demand, Obiettivi, Data consegna cliente, Feature, Data fine ripianificata).

### D — GAR, asset management (4 tipi ticket) — 1 progetto
`GAR`

Template completamente diverso (Drone/Hard disk/Strumentazione/Epic), max 8 custom field, nessuna sovrapposizione con gli altri tranne EPICKEY e Link Epic.

## Eccezioni riscontrate

1. **T02P & ASR0** — Rilievi (e Task dove presente) non hanno `customfield_10602` "Tempo Team" (Tempo app), presente invece su T01P e sugli altri 13 progetti del cluster A. Stessa anomalia in due cluster diversi → probabile progetto/team non collegato all'app Tempo, non un problema di template.
2. **ONP_prg** (in T01P e T02P) — non ha `customfield_10001` "Team", a differenza di tutti gli altri tipi ticket degli stessi due progetti.

Nessun caso di **id riusato con nome diverso** o **nome duplicato con id diverso** tra progetti diversi.

## Matrice completa — campo × template/tipo ticket

Colonne: **A·Bug** (14pr) · **A·Ril** (14pr, ¹=eccezione ASR0) · **B·Bug** (T01P,T02P) · **B·Ril/Task** (T01P,T02P; ¹=eccezione T02P) · **B·ONP** (T01P,T02P) · **C·Bug** (6pr) · **C·Task** (6pr) · **C·Iniz** (6pr) · **D·GAR** (Drone/HD/Strumentazione)

| Campo | ID | A·Bug | A·Ril | B·Bug | B·Ril/Task | B·ONP | C·Bug | C·Task | C·Iniz | D·GAR |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Team | 10001 | ● | ● | ● | ● | | ● | ● | ● | |
| Collegamento all'epic | 10014 | | | | | | | ● | | |
| Data di inizio | 10015 | ● | | ● | | | ● | ● | ● | |
| Sprint | 10020 | ● | | ● | | | ● | | | |
| End date | 10044 | ● | | ● | | | ● | ● | ● | |
| Start Date [Gantt] | 10048 | ● | | ● | | | ● | | | |
| End Date [Gantt] | 10049 | ● | | ● | | | ● | | | |
| Multiple Assignee | 10094 | | ● | | ● | ● | | ● | ● | |
| Codice Demand | 10239 | | | | | | | | ● | |
| Data Invio HLD | 10244 | ● | | ● | | | ● | ● | ● | |
| Regione interessata | 10259 | | | | | ● | | | | |
| Comune | 10388 | | | | | ● | | | | |
| Commessa | 10397 | ● | ● | ● | ● | ● | ● | | | |
| Contract Revenue Type | 10414 | ● | ● | ● | ● | | ● | ● | | |
| **EPICKEY** | **10432** | ● | ● | ● | ● | ● | ● | ● | | ● |
| Production Units | 10436 | ● | ● | ● | ● | | ● | | | |
| Provincia | 10499 | | | | | ● | | | | |
| Cluster | 10559 | | ● | | ● | ● | | | | |
| Tempo Team | 10602 | | ●¹ | | ●¹ | | ● | | | |
| Data assegnazione | 10642 | | | | | | | | | ● |
| Obiettivi | 10684 | | | | | | | | ● | |
| Modello | 10700 | | | | | | | | | ● |
| Note | 10730 | | | | | | | ● | ● | ● |
| Data consegna cliente | 10998 | | | | | | | | ● | |
| Target Production | 11280 | ● | ● | ● | ● | | ● | ● | | |
| Link Epic | 11347 | ● | | ● | | ● | ● | ● | | ● |
| Fornitore-Provider | 11512 | ● | ● | ● | ● | | ● | ● | ● | |
| Attività No produzione | 11577 | | | | | ● | | | | |
| Multiple teams | 11742 | ● | | ● | | | ● | ● | ● | |
| Servizio (old) | 12245 | ● | | ● | | | | | | |
| Identificativo | 12861 | | | | | | | | | ● |
| Matricola | 12862 | | | | | | | | | ● |
| Dimensione | 12895 | | | | | | | | | ● |
| Service Type | 12961 | ● | ● | ● | ● | | ● | | | |
| Production Weight (%) | 13027 | | | | | | ● | ● | | |
| Feature | 13060 | | | | | | | | ● | |
| Start date pianificato | 13093 | | | | ● | | ● | ● | ● | |
| Data fine ripianificata | 13175 | | | | | | | | ● | |
| Rework | 13308 | | ● | | ● | | | ● | ● | |
| Atlassian Project | 13683 | ● | ● | ● | ● | ● | | | | |
| Activity Budget Share | 13995 | | | | | | ● | ● | | |

¹ Vedi Eccezione 1: Tempo Team assente su T02P e ASR0 (le altre 12 righe A·Ril / 1 riga B·Ril/Task hanno il campo).

## Come consultare/aggiornare in futuro

- **In chat**: chiedi di riaprire/aggiornare "l'Atlante Campi Jira" — l'artifact resta collegato a questa sessione/progetto e può essere ri-pubblicato sullo stesso link.
- **Da editor/repo**: apri questo file (`docs/jira-custom-fields.md`) o `docs/jira-custom-fields.html` (doppio clic, si apre nel browser, nessuna dipendenza da claude.ai).
- **Per ri-verificare un progetto** (es. se cambia lo schema Jira): serve interrogare di nuovo `getJiraIssueTypeMetaWithFields` per quel progetto+tipo ticket — questo file è uno snapshot alla data indicata sopra, non si aggiorna da solo.
