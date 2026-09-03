# Template .gitignore per stack

Blocchi da comporre in Passo 4 di [SKILL.md](../SKILL.md). Il blocco **Base** va sempre incluso; aggiungi solo i blocchi degli stack effettivamente rilevati (più di uno se il progetto è misto, es. backend Python + frontend Node).

## Base (sempre incluso)

```gitignore
# OS
.DS_Store
Thumbs.db

# Editor
.idea/
*.swp

# Env / secrets
.env
.env.local

# Log
*.log
```

## Node (indicatore: package.json)

```gitignore
node_modules/
dist/
build/
.npm/
npm-debug.log*
.pnpm-store/
```

## Python (indicatori: requirements.txt, pyproject.toml, Pipfile)

```gitignore
__pycache__/
*.pyc
.venv/
venv/
dist/
build/
*.egg-info/
.pytest_cache/
.mypy_cache/
```

## Go (indicatore: go.mod)

```gitignore
bin/
*.exe
*.test
*.out
```

## Rust (indicatore: Cargo.toml)

```gitignore
target/
```

`Cargo.lock` **non** va nel .gitignore per un binario/eseguibile distribuito (va committato). Aggiungilo tu stesso solo se il progetto è una library (dove convenzionalmente si ignora).

## .NET (indicatori: *.csproj, *.sln)

```gitignore
bin/
obj/
*.user
```

## Java (indicatori: pom.xml, build.gradle)

```gitignore
target/
build/
*.class
.gradle/
```
