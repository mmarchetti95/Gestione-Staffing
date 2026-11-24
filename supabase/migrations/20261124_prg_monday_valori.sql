-- v18.310.0 — Programmazione: import da Monday senza doppioni e senza perdere le modifiche fatte qui.
-- monday_valori = valori delle colonne del file (più '__nome' = nome nel file) all'ultimo import
-- dell'elemento: è la base dell'unione a tre vie in prgImpUnisci (src/js/programmazione-import.js).
-- Un campo uguale alla base nel nuovo file non è cambiato su Monday e resta quello dell'app.
-- Colonna a parte e non dentro `valori`: il trigger dello storico guarda solo nome e valori,
-- quindi un import non riempie lo storico con la copia dei valori Monday.
alter table public.prg_elemento add column if not exists monday_valori jsonb;
comment on column public.prg_elemento.monday_valori is
  'Programmazione: valori del file Monday all''ultimo import (base dell''unione a tre vie; __nome = nome nel file).';
