---
name: checkpoint
description: Save or resume a working-session handoff so a new session can continue with a clean context window instead of carrying the full transcript, saving tokens. Use when the user wants to pause work and save a checkpoint, hand off to a new session, or resume/continue previous work — including Italian phrasing like "salva il punto", "checkpoint", "chiudiamo la sessione", "riprendi", "continua da dove eravamo".
---

# checkpoint

A lightweight handoff mechanism for crossing the boundary between one Claude Code session and the next, so a new session can resume with a small, targeted context instead of re-reading the whole project or carrying a long transcript.

**This is not project memory and not a project's durable history.** If the current project already keeps its own "where I left off" doc (e.g. an AGENTS.md/CLAUDE.md section literally named that, or a CHECKLIST.md changelog), that doc remains the source of truth for durable decisions and history — do not duplicate its narrative here, and do not let this skill's output substitute for updating it. This file exists only to survive the literal moment of stopping one session and starting the next one. It is always overwritten wholesale (never appended) and capped at roughly 80 lines — if content doesn't fit, cut detail, not the "next step" section.

Also not the same thing as Claude Code's own auto-memory system (`~/.claude/projects/.../memory/`) — never write this ephemeral in-progress state into `MEMORY.md`.

## Storage

One file per project, at:

```
$HOME/.claude/checkpoints/<slug>/latest.md
```

`<slug>` = the basename of the git repo root, lowercased, spaces/underscores turned into dashes. Compute it with:

```bash
root="$(git rev-parse --show-toplevel)"
slug="$(basename "$root" | tr '[:upper:] ' '[:lower:]-' )"
mkdir -p "$HOME/.claude/checkpoints/$slug"
```

(Same logic in PowerShell: `$root = git rev-parse --show-toplevel; $slug = (Split-Path $root -Leaf).ToLower() -replace '[ _]','-'; New-Item -ItemType Directory -Force "$HOME/.claude/checkpoints/$slug"`.)

Storing outside the repo means no `.gitignore` edits are ever needed, and the file can never accidentally get committed.

## Save flow

Trigger: the user asks to pause, checkpoint, wrap up, or hand off to a new session — or you judge the context window is getting large and a fresh session would be more efficient.

1. Resolve `<slug>` as above.
2. Check whether the project has its own durable status doc (grep AGENTS.md/CLAUDE.md for a "where I left off" style section, or a CHECKLIST.md-style changelog). If real decisions were made this session that belong there per that project's own conventions, update that doc first, following its own rules (e.g. "replace, don't append").
3. Write `latest.md`, overwriting entirely, using this shape:

```markdown
# Checkpoint — <project name>

Saved: <date>, branch `<branch>` @ <short commit> (<clean/dirty + note on untracked files if relevant>)

## What was being worked on
<1-3 sentences>

## Decisions made this session (brief — see <durable doc> for full rationale, if one exists)
- <bullet>

## Concrete next step (in order)
1. <specific, actionable — enough to start cold>

## Files touched
<path:line if useful>

## To reorient without re-reading everything
- `graphify query "<topic>"` <-- only if graphify-out/ exists in the project
- <pointer to durable doc section, if any>

## Note
This file is a disposable bridge between sessions, not the permanent record — that stays in <durable doc, if any>. It gets fully overwritten at the next checkpoint.
```

Keep it self-contained enough that the next session can act on "Concrete next step" without opening any other file — but don't restate the full rationale for old decisions; point at the durable doc for that.

4. If the project has `graphify-out/graph.json` and code changed this session, run `graphify update .` before writing the checkpoint, and note 1-3 concrete `graphify query "..."` strings in the file instead of a prose summary of the codebase — that's the actual token saving on the resume side.
5. Tell the user in one sentence that it's safe to end the session.

## Resume flow

Trigger: a new session opens with little/no prior context and the user says something like "riprendi", "continua da dove eravamo", "resume", "pick up where we left off" — or you notice a checkpoint file exists for this project and the conversation is otherwise cold-started.

The checkpoint is **single-use**: resuming consumes it. This matters because the user may open several sessions on the same project — without consumption, each one would read the same stale file and redo the same "concrete next step," duplicating work.

1. Resolve `<slug>` as above and read `$HOME/.claude/checkpoints/<slug>/latest.md`. If it doesn't exist, say so plainly ("nessun checkpoint trovato per questo progetto") and ask what to work on — don't guess, and don't treat this as an error.
2. Immediately delete that file (`rm` / `Remove-Item`), before doing anything else with its content. This is what makes it single-use: once one session has claimed it, a second "riprendi" in another session for the same project correctly finds nothing rather than re-running the same next step.
3. Compare the recorded branch/commit to the current `git status`/`git log`. If they differ, flag it before trusting the checkpoint — another session (yours or a teammate's) may have moved things since.
4. Summarize in 2-4 sentences what's being resumed, then go straight into "Concrete next step" — don't ask "should I continue?" unless the checkpoint itself flags an open decision.
5. Run any `graphify query` pointers from the file if you need to reorient, instead of re-reading source files from scratch.

If the user just wants to peek at a checkpoint without consuming it (e.g. "cosa c'era scritto nel checkpoint?"), read the file directly instead of going through this flow — don't delete it in that case.

## Gotchas

- Resume deletes the file on purpose (see Resume flow) — this is what stops parallel sessions on the same project from duplicating the same next step. Two sessions resuming at the exact same instant could both read before either deletes, but that's a rare edge case not worth engineering around for single-user sequential use.
- Slug collisions: two different repos with the same folder basename (e.g. two different `api/` checkouts) share a checkpoint slot. Not handled — acceptable for a single-user tool with a handful of active projects, but don't rely on this for concurrently active same-named repos.
- Don't let this become a second changelog: if you catch yourself writing multiple paragraphs of history into `latest.md`, that content belongs in the project's durable doc instead — trim this file back down.
