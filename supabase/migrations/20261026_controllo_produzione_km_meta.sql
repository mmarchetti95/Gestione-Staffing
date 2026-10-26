-- v18.224.0 — Controllo Produzione: provenienza del Km/Cad e campo dell'ultimo invio, per ticket.
-- km_meta_by_ticket[chiave ticket] = {
--   fonte:     'report' | 'manuale' | 'jira'   (solo report/manuale contano come verificati dall'ufficio;
--                                                'jira' = valore letto da Jira, di solito il segnaposto
--                                                messo dall'operatore per chiudere il ticket)
--   campoLast: campo Jira su cui è stato scritto km_last_by_ticket
--              ('Actual Production' | 'KPI_Quantità lavorata'; assente = 'Actual Production', storico)
-- }
-- Il campo di destinazione è per commessa (cp_campo_produzione). Righe salvate prima di questa
-- colonna: la provenienza si deduce lato client (Ore Report compilate = report, altrimenti jira),
-- vedi cpRowToCell.
alter table public.controllo_produzione
  add column if not exists km_meta_by_ticket jsonb not null default '{}'::jsonb;
comment on column public.controllo_produzione.km_meta_by_ticket is
  'Per ticket Jira: { fonte: report|manuale|jira (solo report/manuale = verificato dall''ufficio), campoLast: campo Jira su cui è stato scritto km_last_by_ticket (assente = Actual Production) }. Il campo di destinazione è per commessa in cp_campo_produzione. Dalla v18.224.0.';
