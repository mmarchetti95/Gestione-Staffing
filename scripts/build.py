#!/usr/bin/env python3
"""Rigenera index.html concatenando src/head.html + src/js/*.js (nell'ordine
di questo elenco) + src/tail.html.

USO:
    python3 scripts/build.py

L'ordine qui sotto conta: riproduce esattamente l'ordine con cui il codice
compariva nel vecchio blocco <script> unico, quindi anche l'ordine di
registrazione dei due handler DOMContentLoaded (dashboard prima, poi
pianificazione settimanale). Aggiungere un file nuovo = aggiungerlo a questa
lista nel punto giusto.
"""
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, 'src')
JS_DIR = os.path.join(SRC, 'js')

JS_FILES = [
    'config.js',
    'sb-admin.js',
    'storage-utils.js',
    'dashboard-kpi.js',
    'dashboard-operatori.js',
    'dashboard-commesse.js',
    'dashboard-assegnazioni.js',
    'dashboard-crud-helpers.js',
    'dashboard-gap-riconc.js',
    'dashboard-import-export.js',
    'dashboard-gantt.js',
    'dashboard-commessa-attiva.js',
    'dashboard-staffing-celle.js',
    'dashboard-dettaglio-mese.js',
    'dashboard-alerts-render.js',
    'weekly-mail-core.js',
    'weekly-operatore-modal.js',
    'weekly-popover-stats.js',
    'weekly-strumenti.js',
    'weekly-jira-subtask.js',
    'weekly-nav.js',
    'weekly-doppiaweek.js',
    'weekly-collapse-cp.js',
    'produzione-core.js',
    'produzione-report.js',
    'weekly-mappa.js',
    'weekly-meteo.js',
]


def build_bytes():
    """Ritorna il contenuto di index.html così come lo produrrebbe la build,
    senza scrivere su disco. Usato anche da smoke_test.py per verificare che
    index.html sia allineato a src/."""
    parts = []
    with open(os.path.join(SRC, 'head.html'), 'rb') as f:
        parts.append(f.read())
    for name in JS_FILES:
        path = os.path.join(JS_DIR, name)
        if not os.path.isfile(path):
            raise SystemExit(f"File mancante: {path}")
        with open(path, 'rb') as f:
            parts.append(f.read())
    with open(os.path.join(SRC, 'tail.html'), 'rb') as f:
        parts.append(f.read())
    return b''.join(parts)


def main():
    data = build_bytes()
    out_path = os.path.join(REPO, 'index.html')
    with open(out_path, 'wb') as f:
        f.write(data)
    print(f"index.html rigenerato ({len(data)} byte) da {len(JS_FILES)} file in src/js/")


if __name__ == '__main__':
    main()
