---
name: Dashboard Staffing
description: Strumento interno Eagleprojects per pipeline commerciale, staffing e pianificazione settimanale del reparto rilievi
colors:
  accent: "#0d9488"
  accent-dark: "#0f766e"
  accent-soft: "#ccfbf1"
  neutral-bg: "#f4f6f8"
  neutral-surface: "#ffffff"
  neutral-border: "#e2e8f0"
  neutral-text: "#0f172a"
  neutral-muted: "#64748b"
  status-green: "#10b981"
  status-yellow: "#f59e0b"
  status-orange: "#f97316"
  status-red: "#ef4444"
  category-blue: "#1e40af"
  category-indigo: "#4f46e5"
  category-amber: "#d97706"
  category-rose: "#9f1239"
  chrome-dark-bg: "#0d0d0d"
  chrome-dark-border: "#242424"
  chrome-dark-border-strong: "#3f3f3f"
  chrome-dark-text: "#d1d5db"
  chrome-dark-text-muted: "#9ca3af"
typography:
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  section-gap: "1.75rem"
  card-padding: "16px"
  tile-padding: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
  kpi-tile-teal:
    backgroundColor: "#f0fdfa"
    textColor: "{colors.accent-dark}"
    rounded: "{rounded.lg}"
---

# Design System: Dashboard Staffing

## Overview

**Creative North Star: "The Site Foreman's Whiteboard"**

Uno strumento operativo, non una vetrina: la superficie di un caposquadra che tiene sotto controllo commesse, operatori e cantieri con colpo d'occhio rapido, non con eleganza da vetrina. Chiaro, denso, diretto — colori usati per significare stato (chi è libero, cosa è in ritardo, cosa richiede attenzione), non per decorare. Non esiste un pubblico da conquistare: il "cliente" sono le stesse 10-15 persone che lo aprono più volte al giorno, quindi la familiarità e la densità informativa contano più della sorpresa.

Il sistema nasce da un'app funzionante ma incoerente (due teal diversi per lo stesso accento, tre grigi diversi per lo stesso testo secondario, quattro ombre diverse per lo stesso tipo di pannello) ed è stato riportato a un solo linguaggio: un accento, una scala di raggi, una scala di ombre. Sopra queste fondamenta, il sistema usa **colori categorici** (blu, indigo, ambra, rosso) per distinguere a colpo d'occhio le famiglie di indicatori — non un accento singolo ripetuto ovunque, ma nemmeno una tavolozza libera: ogni colore categorico ha un significato fisso e riappare identico ovunque quella categoria compare (dalla card riassuntiva al modale di dettaglio che apre).

**Key Characteristics:**
- Un solo font (Inter), nessun secondo carattere "da titolo" — la gerarchia viene da peso/dimensione/colore, non da un cambio di font.
- Un solo accento (teal, `#0d9488`) per le azioni primarie e l'identità dell'app; colori categorici fissi per differenziare classi di dati (non stati d'animo o decorazione).
- Tabelle e griglie dense per design: la densità informativa è un requisito, non un difetto da correggere con più spaziatura.
- Card e tile a tinta piena quando rappresentano una sintesi/metrica; superfici bianche neutre quando contengono liste o dati operativi dettagliati.

## Colors

La palette è Restrained con innesti Categorici: un solo accento porta l'identità dell'app, un piccolo set fisso di colori categorici (mai scelti a caso per elemento) distingue le famiglie di indicatori riassuntivi.

### Primary
- **Deep Teal** (`#0d9488`): l'accento dell'intera app — pulsanti primari, tab attive, focus ring, header commessa nella Griglia, logo mark. Un solo valore referenziato via `var(--accent)`, mai più ripetuto come hex.
- **Teal Ink** (`#0f766e`): variante scura dell'accento, usata per header di tabella densi (Controllo Produzione) e per testo enfatizzato su sfondo chiaro dove il teal pieno sarebbe troppo squillante.

### Secondary — Colori Categorici
Un set fisso di colori, ciascuno legato in modo permanente a una categoria di dato, non riassegnato liberamente:
- **Ledger Blue** (`#1e40af`): commesse attive (KPI + modal di dettaglio).
- **Circuit Indigo** (`#4f46e5`): operatori/persone e azioni di sincronizzazione con Jira ("Sincronizza da Jira", "Genera mail", header Doppia Week).
- **Foreman Amber** (`#d97706`): saturazione/carico di lavoro, e lo sfondo delle celle "Squadra" nella Griglia.
- **Alarm Rose** (`#9f1239` / `#dc2626`): gap risorse e alert critici — compare a tinta piena SOLO quando il valore è diverso da zero; a riposo la card resta neutra. È un segnale di stato, non un accento decorativo.

### Neutral
- **Fog** (`#f4f6f8`): sfondo di pagina.
- **Paper** (`#ffffff`): superficie di card, modali, tabelle.
- **Hairline** (`#e2e8f0`): bordi di card e divisori.
- **Ink** (`#0f172a`): testo primario.
- **Slate Muted** (`#64748b`): testo secondario, etichette, meta-informazioni.

### Chrome Scura (header e banner di sync)
- **Near-Black** (`#0d0d0d`): sfondo di header e banner di sincronizzazione.
- **Hairline scuro** (`#242424`) e **Bordo scuro forte** (`#3f3f3f`): due intensità per divisori sottili vs. contorni di elementi interattivi sullo sfondo scuro.
- **Testo scuro secondario** (`#d1d5db`) e **terziario** (`#9ca3af`): due soli toni, non tre, per tutto il testo su sfondo scuro.

### Named Rules
**La Regola del Colore Categorico.** Un colore categorico (blu/indigo/ambra/rosa) è legato per sempre al suo significato: se una card riassuntiva è blu, il modale che apre cliccandola è blu. Non si riusa un colore categorico per un significato diverso altrove nell'app.

**La Regola dello Stato Neutro a Riposo.** Le card che segnalano un problema (Gap risorse, Alert critici) sono a tinta piena SOLO quando il problema esiste. A zero, restano neutre: il colore è un segnale, non decorazione fissa.

## Typography

**Body Font:** Inter (con fallback `system-ui, -apple-system, sans-serif`)
**Display Font:** nessuno — stesso Inter dei titoli, differenziato per peso/dimensione/colore.

**Character:** un solo carattere, funzionale e ad alta leggibilità anche a dimensioni piccole (10-11px, frequenti nelle tabelle dense): la gerarchia si costruisce sottraendo o aggiungendo peso e dimensione, non cambiando voce.

### Hierarchy
- **Title** (600-700, ~1.05rem, tracking -0.01em): titoli di sezione (`h2`) e di modale; una piccola barra da 3px dell'accento sotto i titoli di sezione principali.
- **Body** (400-500, 13-14px): testo di card, paragrafi descrittivi, celle di tabella non compresse.
- **Label** (600, 10-11px, tracking 0.04em, maiuscolo): etichette di KPI, intestazioni di tabella, badge di stato.
- **Numero KPI** (700-800, 1.875rem/text-3xl, tabular-nums): il valore numerico primario di ogni card di sintesi — sempre in cifre tabellari per non "ballare" a ogni aggiornamento.

### Named Rules
**La Regola dell'Unico Carattere.** Nessun secondo font "da titolo": introdurne uno (provato e poi rimosso durante questo restyling) è stato riconosciuto come uno dei pattern più abusati dalle interfacce generate da IA. La gerarchia tipografica di questo sistema si ottiene sempre con peso, dimensione, colore e spaziatura — mai cambiando famiglia di caratteri.

## Layout

Due container a larghezza diversa per le due schermate: `max-w-7xl` per la Dashboard, `max-w-screen-2xl` per Pianificazione Settimanale (più larga perché ospita griglie a molte colonne). Ritmo verticale tra sezioni a 1.75rem (`--space` implicito via `.space-y-6`). Le viste dati-intensive (Controllo Produzione, Gantt, Griglia settimanale, Doppia Week) usano font 10-12px e padding compresso nelle celle: è una scelta deliberata per ridurre lo scroll orizzontale, non un debito di leggibilità da correggere.

## Elevation & Depth

Sistema a tre livelli, mai oltre: le superfici usano un'ombra leggera per staccarsi dallo sfondo, non per simulare profondità drammatica. Nessun bagliore colorato (rimosso durante questo restyling: un'ombra teal sul logo dell'header è stata sostituita con un'ombra neutra, perché il bagliore colorato su sfondo scuro è uno dei segnali più riconoscibili di un'interfaccia generata da IA).

### Shadow Vocabulary
- **`--shadow-sm`** (`0 1px 3px rgba(15,23,42,.06)`): card, sezioni, KPI tile a riposo.
- **`--shadow-md`** (`0 4px 12px rgba(15,23,42,.08)`): hover di card interattive, popover, pannelli fluttuanti (ricerca strumenti).
- **`--shadow-lg`** (`0 20px 60px rgba(15,23,42,.18)`): modali "custom" (selezione operatore, modali admin, modal KPI, modal Genera Mail).
- **Inset stripe** (`inset 0 3px 0 0 <colore-categoria>`): striscia colorata in cima alle KPI card, combinata con `--shadow-sm` — segna la categoria senza aggiungere un livello di elevazione separato.

### Named Rules
**La Regola del Bagliore Vietato.** Nessuna ombra colorata a alone su sfondo scuro. La profondità sullo sfondo scuro dell'header usa un'ombra neutra (`rgba(0,0,0,.4)`), mai un bagliore nel colore dell'accento.

## Shapes

Tre raggi, mai un quarto valore inventato per un caso singolo: `--radius-sm` (6px, micro-elementi come select/input compatti), `--radius-md` (8px, bottoni, input, pannelli fluttuanti), `--radius-lg` (12px, card, sezioni, modali, KPI tile). Nessun bordo colorato laterale (side-tab): un accento di stato passa per sfondo, bordo intero o striscia superiore, mai per un bordo sinistro/destro isolato — pattern esplicitamente rimosso durante questo restyling perché è uno dei tell più riconoscibili delle interfacce generate da IA.

## Components

### Buttons
- **Shape:** raggio 8px (`--radius-md`).
- **Primary:** sfondo `var(--accent)`, testo bianco, peso 500; al passaggio del mouse un lieve sollevamento (`translateY(-1px)` + `--shadow-sm`) invece di un cambio di colore secco.
- **Secondary/Ghost:** bordo `--border`, sfondo bianco o trasparente, testo `--muted`; hover con sfondo grigio chiarissimo.

### KPI Tile (componente distintivo)
- **Shape:** `--radius-lg`, sfondo a tinta piena della categoria (non bianco).
- **Anatomia:** badge icona 32×32px con sfondo colorato più intenso della tinta di card, etichetta maiuscola grigio scuro, numero grande (text-3xl, 700-800) nel colore categorico scuro.
- **Stato:** cliccabile (tranne "Totale commesse", non interattiva e volutamente neutra) — apre un modale con lo stesso colore categorico nell'header.
- **Regola:** il colore della tile anticipa sempre il colore del modale di dettaglio, mai un colore diverso.

### Modals — due famiglie
- **Modale canonico (dominante, ~15 punti d'uso):** `.modal-backdrop` (attenuazione `var(--backdrop)`) + pannello `bg-white rounded-lg shadow-xl` (scala Tailwind, non i token custom) — usato da `showAlertModal`/`showConfirmAsync` e da tutti i form CRUD (commesse, operatori, allocazioni).
- **Modale "su misura" (dialoghi con header colorato o layout complesso):** pannello su `--radius-lg` + `--shadow-lg`, backdrop `var(--backdrop)` — usato da selezione operatore, modali admin (log, sessioni, password), modal KPI, modal Genera Mail. Non condivide la scala Tailwind del modale canonico: è un secondo linguaggio riconosciuto, non un refuso.

### Tabs
- **Style:** testo `--muted`, bordo inferiore 3px trasparente; attivo = testo e bordo `var(--accent)`, peso 700; hover con tint di sfondo leggerissimo (`rgba(15,23,42,.03)`).

### Badges
- **Skill/Attestato:** rettangolari, raggio 4px, coppia sfondo-tinta/testo-scuro per stato (posseduto/richiesto/mancante) — `.skill-badge`/`.att-badge` condividono la stessa struttura, differiscono solo nel colore.
- **Stato operatore:** pillola (raggio 999px), stessa logica colore di skill/attestato ma forma diversa — la pillola indica uno stato transitorio (libero/assegnato/ferie), il rettangolo indica un attributo stabile (skill/attestato).

### Navigation
- **Header:** sfondo quasi-nero, bordo inferiore da 3px colore accento (firma visiva dell'app), pillola di navigazione Dashboard/Pianificazione con sfondo pieno sull'attiva.
- **Tab bar secondarie:** stesso linguaggio (bordo attivo colorato, grassetto) ripetuto identico in ogni schermata che ne ha bisogno (Pool operatori, Pipeline/Attive, Griglia/Ferie/Mappa/Controllo/Doppia Week).

## Do's and Don'ts

### Do:
- **Do** referenziare sempre `var(--accent)` / `var(--accent-dark)` per l'accento — mai un hex ripetuto (`#0d9488`/`#0f766e`), anche in stringhe HTML generate da JS.
- **Do** riusare la stessa scala di raggio/ombra (`--radius-sm/md/lg`, `--shadow-sm/md/lg`) per ogni nuovo componente elevato, invece di scrivere un valore ad hoc.
- **Do** far coincidere il colore categorico di una card di sintesi con quello del modale/dettaglio che apre.
- **Do** mantenere le viste dati-intensive (tabelle, griglie) dense: font 10-12px e padding compresso sono una scelta di prodotto, non un debito di leggibilità.

### Don't:
- **Don't** aggiungere un secondo font "da titolo" per dare più carattere — la gerarchia si fa con peso/dimensione/colore su Inter.
- **Don't** usare un bordo laterale colorato (side-tab) come accento di stato — sfondo pieno, bordo intero o striscia superiore sì, bordo sinistro/destro isolato no.
- **Don't** aggiungere ombre colorate a alone (glow), specialmente su sfondo scuro.
- **Don't** colorare a tinta piena una card che segnala un problema (gap, alert) quando il valore è zero — deve restare neutra: il colore è informazione di stato, non decorazione fissa.
- **Don't** forzare il pannello modale "canonico" (`shadow-xl` Tailwind) e quello "su misura" (`--shadow-lg`) a coincidere — sono due famiglie riconosciute con ruoli diversi, non un'inconsistenza da correggere.
