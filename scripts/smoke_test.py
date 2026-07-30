#!/usr/bin/env python3
"""
Smoke test pre-deploy per Gestione-Staffing (index.html).

Esegue una serie di controlli automatici sul file HTML PRIMA della pubblicazione,
per intercettare errori di regressione che in passato sono costati hotfix
(es. il refuso `dataISO`, funzioni duplicate, uso di confirm()/alert() nativi).

USO:
    python3 smoke_test.py path/to/index.html [--expect-version X.Y.Z] [--prev-version X.Y.Z]

Exit code 0 = tutti i controlli passati; 1 = almeno un controllo fallito.
Richiede `node` nel PATH per il controllo di sintassi JS.
"""

import sys
import re
import os
import subprocess
import tempfile

def main():
    args = sys.argv[1:]
    path = None
    expect_version = None
    prev_version = None
    i = 0
    while i < len(args):
        if args[i] == '--expect-version':
            expect_version = args[i + 1]; i += 2
        elif args[i] == '--prev-version':
            prev_version = args[i + 1]; i += 2
        else:
            path = args[i]; i += 1
    if not path:
        print("USO: python3 smoke_test.py path/to/index.html [--expect-version X.Y.Z] [--prev-version X.Y.Z]")
        return 2

    with open(path, encoding='utf-8') as f:
        html = f.read()

    errors = []
    warnings = []
    print(f"== Smoke test su {path} ({len(html)} caratteri) ==\n")

    # ---- 1. Versione nell'header ----
    vers = re.findall(r'>v(\d+\.\d+\.\d+)<', html)
    if not vers:
        errors.append("Nessuna versione trovata nell'header (atteso <span ...>vX.Y.Z</span>).")
    else:
        header_version = vers[0]
        print(f"[versione] header = v{header_version} (occorrenze: {len(vers)})")
        if expect_version and header_version != expect_version:
            errors.append(f"Versione header v{header_version} != attesa v{expect_version}.")
        if prev_version and header_version == prev_version:
            errors.append(f"Versione header v{header_version} identica alla precedente: dimenticato il bump?")

    # ---- 2. Estrazione blocchi <script> e controllo sintassi con node ----
    scripts = re.findall(r'<script(?:(?!src=)[^>])*>(.*?)</script>', html, re.DOTALL)
    print(f"[script]   blocchi <script> inline: {len(scripts)}")
    if not scripts:
        errors.append("Nessun blocco <script> inline trovato.")
    else:
        js = "\n;\n".join(scripts)
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as tf:
            tf.write(js); tmp = tf.name
        try:
            res = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            if res.returncode != 0:
                errors.append("Sintassi JS non valida (node --check):\n" + (res.stderr.strip() or res.stdout.strip()))
            else:
                print("[sintassi] node --check: OK")
        except FileNotFoundError:
            warnings.append("`node` non disponibile: salto il controllo di sintassi JS.")
        finally:
            os.unlink(tmp)

    # ---- 3. confirm()/alert()/prompt() nativi ----
    # Ignora chiamate a metodi (es. showAlertModal) grazie al negative lookbehind su [\w.]
    for fn in ('alert', 'confirm', 'prompt'):
        hits = re.findall(r'(?<![\w.])' + fn + r'\s*\(', "\n".join(scripts))
        if hits:
            errors.append(f"Uso di `{fn}(` nativo trovato ({len(hits)}x). Usare i modali custom (showAlertModal/showConfirmAsync).")
    if not any(re.findall(r'(?<![\w.])' + fn + r'\s*\(', "\n".join(scripts)) for fn in ('alert', 'confirm', 'prompt')):
        print("[modali]   nessun alert/confirm/prompt nativo: OK")

    # ---- 4. Funzioni top-level duplicate ----
    names = re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(', "\n".join(scripts))
    seen = {}
    for n in names:
        seen[n] = seen.get(n, 0) + 1
    dups = {n: c for n, c in seen.items() if c > 1}
    if dups:
        for n, c in sorted(dups.items()):
            errors.append(f"Funzione definita {c} volte: {n}()")
    else:
        print(f"[funzioni] {len(names)} funzioni, nessun nome duplicato: OK")

    # ---- 5. Coerenza parentesi/graffe (sanity, non sostituisce node) ----
    for label, o, c in (('graffe', '{', '}'), ('tonde', '(', ')'), ('quadre', '[', ']')):
        no, nc = html.count(o), html.count(c)
        if no != nc:
            warnings.append(f"Sbilanciamento {label}: {no} '{o}' vs {nc} '{c}' (può essere legittimo in stringhe/HTML).")

    # ---- 6. (opzionale) ESLint no-undef: cattura variabili non definite (es. il refuso `dataISO`) ----
    # Nomi già presenti nel codice dashboard (baseline noto): non fanno fallire il gate.
    ESLINT_ALLOWLIST = {'k', 'ass', 'mc', 'isOreNonLav'}
    eslint = _find_eslint()
    if not eslint:
        warnings.append("ESLint non trovato: salto il controllo no-undef (installa con `npm i eslint@8` per attivarlo).")
    elif scripts:
        undef = _run_eslint_noundef(eslint, "\n;\n".join(scripts))
        if undef is None:
            warnings.append("ESLint non ha prodotto output analizzabile: controllo no-undef saltato.")
        else:
            new_undef = [(name, ln) for (name, ln) in undef if name not in ESLINT_ALLOWLIST]
            base = [(name, ln) for (name, ln) in undef if name in ESLINT_ALLOWLIST]
            print(f"[no-undef] ESLint: {len(undef)} totali ({len(base)} baseline noti, {len(new_undef)} nuovi)")
            for name, ln in new_undef:
                errors.append(f"Variabile non definita `{name}` (riga JS ~{ln}) — possibile refuso tipo `dataISO`.")

    # ---- 7. onclick con stringa dinamica NON escapata ----
    # Cerca onclick="...'${ EXPR }'..." dove EXPR non usa jsAttr/jsesc/esc.
    unescaped = []
    for m in re.finditer(r'onclick="([^"]*)"', html):
        inner = m.group(1)
        for em in re.finditer(r"'\$\{([^}]*)\}'", inner):
            expr = em.group(1)
            if not re.search(r'\b(jsAttr|jsesc|esc)\s*\(', expr):
                unescaped.append(expr.strip())
    if unescaped:
        for ex in unescaped:
            errors.append(f"onclick con stringa dinamica non escapata: '${{{ex}}}' — usare jsAttr(...) (rischio con apostrofi/quote).")
    else:
        print("[onclick]  nessun onclick con stringa dinamica non escapata: OK")

    # ---- Esito ----
    print()
    for w in warnings:
        print("⚠  WARNING:", w)
    if errors:
        print()
        for e in errors:
            print("❌ ERRORE:", e)
        print(f"\n== SMOKE TEST FALLITO: {len(errors)} error(i) ==")
        return 1
    print("\n== SMOKE TEST SUPERATO ==")
    return 0


def _find_eslint():
    """Cerca l'eseguibile eslint in vari percorsi noti; None se assente."""
    import shutil
    for cand in (
        os.environ.get('ESLINT_BIN'),
        os.path.join(os.getcwd(), 'node_modules', '.bin', 'eslint'),
        '/home/claude/.eslint-local/node_modules/.bin/eslint',
    ):
        if cand and os.path.exists(cand):
            return cand
    return shutil.which('eslint')


def _run_eslint_noundef(eslint_bin, js):
    """Esegue eslint (solo regola no-undef) sul JS e ritorna lista (nome, riga)."""
    cfg = (
        '{ "root": true, "parserOptions": { "ecmaVersion": 2022, "sourceType": "script" }, '
        '"env": { "browser": true, "es2022": true }, '
        '"globals": { "supabase": "readonly", "XLSX": "readonly", "jspdf": "readonly", '
        '"L": "readonly", "Papa": "readonly", "Chart": "readonly", "_": "readonly" }, '
        '"rules": { "no-undef": "error" } }'
    )
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as tf:
        tf.write(js); jsf = tf.name
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as cf:
        cf.write(cfg); cfgf = cf.name
    try:
        res = subprocess.run(
            [eslint_bin, '--no-eslintrc', '-c', cfgf, '--format', 'compact', jsf],
            capture_output=True, text=True,
        )
        out = res.stdout + res.stderr
        found = []
        for m in re.finditer(r'line (\d+),.*?\'([^\']+)\' is not defined\. \(no-undef\)', out):
            found.append((m.group(2), int(m.group(1))))
        return found
    except Exception:
        return None
    finally:
        os.unlink(jsf); os.unlink(cfgf)

if __name__ == '__main__':
    sys.exit(main())
