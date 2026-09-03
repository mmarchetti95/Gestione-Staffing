---
name: new-project
description: Scaffolda lo standard personale di progetto — AGENTS.md, CLAUDE.md che importa AGENTS.md, README.md, LICENSE, CHANGELOG.md, .gitignore, inizializzazione Git e Graphify. Usa quando l'utente avvia un nuovo progetto, apre una cartella priva di AGENTS.md/README.md e vuole strutturarla, o chiede di scaffoldare/inizializzare/standardizzare un progetto — incluse frasi come "nuovo progetto", "inizializziamo questo repo", "metti a posto la struttura del progetto", "/new-project".
---

# new-project

Porta un progetto — nuovo o esistente ma privo di standard — allo stato "pronto per lavorarci con qualsiasi coding agent": documentazione base, Git, e il grafo di conoscenza Graphify.

**Idempotente**: ogni passo crea un artefatto solo se manca. Se un artefatto esiste già con contenuto diverso da quello che genereresti, non sovrascriverlo — segnalalo nel riepilogo finale e chiedi prima di toccarlo. La directory di lavoro corrente è la root del progetto.

## Passo 1 — Rileva lo stato attuale

Controlla l'esistenza di: `.git/`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `LICENSE`, `CHANGELOG.md`, `graphify-out/graph.json`. Questo determina quali dei passi 3-10 sono no-op (artefatto già presente → salta e segnalo nel riepilogo).

## Passo 2 — Raccogli le informazioni minime

- **Nome progetto**: basename della cartella corrente, salvo indicazione diversa dell'utente.
- **Descrizione breve** (1 riga): chiedila all'utente se non l'ha già data nel messaggio che ha attivato la skill.
- **Versione iniziale**: se il progetto ha già un manifest con versione (`package.json`, `pyproject.toml`, `*.csproj`, ecc.), usa quella; altrimenti `0.1.0`.
- **Autore** (per il copyright in LICENSE): `git config user.name`; se vuoto, chiedilo.
- **Stack tecnologico**: rilevalo dai file indicatori presenti nella root (`package.json`→Node, `requirements.txt`/`pyproject.toml`/`Pipfile`→Python, `go.mod`→Go, `Cargo.toml`→Rust, `*.csproj`/`*.sln`→.NET, `pom.xml`/`build.gradle`→Java). Serve solo per il Passo 4 (.gitignore); se non rilevabile e la cartella è vuota, chiedilo solo se l'utente vuole già indicare lo stack — altrimenti procedi con il blocco Base generico.

## Passo 3 — Git

Se `.git/` non esiste (`git rev-parse --is-inside-work-tree` fallisce), esegui `git init`. Se esiste già, salta.

## Passo 4 — .gitignore

Se assente: componi il file usando lo stack rilevato al Passo 2. Vedi [references/gitignore-templates.md](references/gitignore-templates.md) per il blocco Base (sempre incluso) e i blocchi per stack — leggilo solo qui, quando serve davvero comporre il file. Se lo stack non è rilevabile, usa solo il blocco Base.

## Passo 5 — AGENTS.md

Se assente, crealo con questo scheletro (sezioni vuote, da riempire mano a mano che il progetto cresce — non un'intervista ora):

```markdown
# AGENTS.md

Istruzioni per qualsiasi agente di coding (Claude, Cursor, Codex, Copilot, ecc.) che lavora su questo progetto.

## Panoramica del progetto
<!-- Cosa fa questo progetto, in 2-3 frasi. -->

## Setup
<!-- Comandi per installare le dipendenze e preparare l'ambiente. -->

## Comandi principali
<!-- Build, test, lint, run — un comando per riga con una breve nota. -->

## Convenzioni
<!-- Stile di codice, struttura cartelle, pattern da seguire o evitare. -->

## Architettura
<!-- Componenti principali e come comunicano tra loro, quando il progetto cresce. -->

## Note per l'agente
<!-- Vincoli, cose da NON fare, decisioni prese e il perché. -->
```

## Passo 6 — CLAUDE.md

Se assente, crealo così, in modo che Claude Code importi automaticamente AGENTS.md come fonte unica di verità:

```markdown
# CLAUDE.md

Questo progetto usa [AGENTS.md](AGENTS.md) come fonte unica di verità per le istruzioni agli agenti di coding. Claude Code importa il suo contenuto dalla riga seguente; qualunque altro agente che apra questo file segue comunque il link.

@AGENTS.md
```

Se CLAUDE.md esiste già ma non contiene una riga `@AGENTS.md`, non sovrascriverlo: chiedi all'utente il permesso di aggiungere quella riga in cima, lasciando invariato il resto.

## Passo 7 — README.md

Se assente, crealo con:

```markdown
# <Nome progetto>

<Descrizione breve, una riga.>

**Versione:** <versione iniziale>

## Descrizione

<Descrizione più estesa — da completare.>

## Installazione

<!-- Comandi di installazione -->

## Utilizzo

<!-- Come si usa -->

## Licenza

Vedi [LICENSE](LICENSE).
```

## Passo 8 — LICENSE

Se assente, crealo con il default **proprietario/tutti i diritti riservati** (nessuna licenza open source), salvo diversa indicazione esplicita dell'utente in questa conversazione:

```text
Copyright (c) <anno corrente> <autore>

Tutti i diritti riservati.

Questo software e la relativa documentazione sono di proprietà di <autore>.
È vietata la copia, modifica, distribuzione o l'uso, totale o parziale,
senza autorizzazione scritta del titolare dei diritti.
```

## Passo 9 — CHANGELOG.md

Se assente, crealo in formato Keep a Changelog:

```markdown
# Changelog

Tutte le modifiche rilevanti di questo progetto saranno documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Added
- Setup iniziale del progetto.
```

## Passo 10 — Graphify

Se `graphify-out/graph.json` esiste già, salta la build (già impostato) ma verifica comunque l'hook come sotto. Altrimenti:

- Se il progetto contiene già file tracciabili (codice, doc) oltre a quelli appena creati da questa skill, invoca la skill `graphify` (tool Skill, `skill: "graphify"`) sulla directory corrente per costruire il grafo iniziale.
- Se il progetto è ancora sostanzialmente vuoto (solo i file di scaffolding appena creati), salta la build ora — un grafo su un corpus vuoto non ha valore e fallisce — e segnalalo nel riepilogo finale: l'utente potrà lanciare `/graphify` quando ci sarà del codice. In questo caso salta anche l'installazione dell'hook sotto (non c'è ancora un grafo da tenere aggiornato).

Non duplicare qui la pipeline di graphify (rilevamento, estrazione, clustering): è tutta nella sua skill.

**Hook di auto-rebuild.** Solo se un grafo è stato costruito (questa esecuzione o in una precedente) e la CLI `graphify` è disponibile, verifica lo stato dell'hook (`graphify hook status`) e installalo se assente (`graphify hook install`) — ricostruisce automaticamente `graph.json` dopo ogni commit che tocca codice. È un hook locale al clone (vive in `.git/hooks/`, non viaggia con push/clone) e copre solo il codice, non doc/immagini: menzionalo nel riepilogo finale. Rimovibile con `graphify hook uninstall`. Non esiste un equivalente a livello di push — gli hook Git non si propagano comunque via push, quindi non aggiungerebbe valore rispetto al post-commit.

## Passo 11 — Commit dello scaffolding

Metti in stage **solo** i file effettivamente creati o modificati in questa sessione dai passi 3-9 — `git add <elenco puntuale di quei file>`, mai `git add -A` e mai i file saltati perché già esistenti — e crea un commit. Messaggio: `chore: initial project scaffolding` se questo è il primo commit del repo (nessun commit precedente), altrimenti `chore: add project scaffolding files`. Non includere altre modifiche pendenti dell'utente nello stesso commit.

## Passo 12 — Riepilogo finale

Riporta all'utente, in breve: cosa è stato creato, cosa esisteva già ed è stato saltato, e cosa richiede ancora attenzione (es. sezioni di AGENTS.md da riempire, Graphify da lanciare più avanti se il progetto era vuoto).

## Gotchas

- Mai sovrascrivere un file già esistente con contenuto diverso senza chiedere prima — questa skill scaffolda uno stato mancante, non impone un formato su file che l'utente ha già scritto.
- Il commit del Passo 11 è mirato ai soli file di scaffolding: non usare `git add -A` e non trascinare dentro modifiche pendenti non correlate.
- Il default LICENSE è proprietario/tutti i diritti riservati, non MIT o altra licenza open source, salvo che l'utente lo dica esplicitamente per quel progetto.
- Se il progetto è vuoto, Graphify va saltato (non forzato) — un grafo costruito su zero file utili non è un "setup" reale, è solo un errore.
- L'hook di auto-rebuild è locale al clone git (non versionato, non condiviso via push/clone): su un'altra macchina o un altro clone dello stesso repo va reinstallato rilanciando questa skill o `graphify hook install`.
