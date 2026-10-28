# MicroGames

> **Contexto deste repo.** MicroGames é um site de minigames no navegador
> (HTML/CSS/JS em `public/`, API Node em `api/` e `server.js`, testes com
> `npm test`, deploy na Vercel). Não usa Godot, Unity nem Unreal: o código não
> fica em `src/`. O framework abaixo (Claude Code Game Studios, MIT, copiado de
> github.com/Donchitos/Claude-Code-Game-Studios no commit 05ad7c8, versão 1.2.0)
> foi instalado para dar os agentes, skills, hooks e regras do estúdio. Para
> adaptar ao projeto, rode `/adopt` ou `/start`.
>
> **Fluxo de git do Paulo vale acima do protocolo abaixo:** toda mudança pedida
> vai para a branch `dev` (PR contra a `dev`, merge assim que os testes passam,
> sem esperar confirmação). A `main` é produção e só muda quando ele pedir.

# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

- **Engine**: nenhuma (site web). Phaser 3 nos jogos de ação e Zdog na arte 3D dos cards
- **Language**: JavaScript (front em `public/js/`, API Node em `api/` e `lib/`)
- **Version Control**: Git; mudanças entram na `dev` por PR, a `main` é produção
- **Build System**: `npm run build` (esbuild, gera `dist/`); testes com `npm test`
- **Asset Pipeline**: arquivos em `public/` (ícones em `public/icons/`, avatares em `public/img/avatars/`)

> **Note**: Engine-specialist agents exist for Godot, Unity, and Unreal with
> dedicated sub-specialists. Use the set matching your engine.

## Project Structure

@.claude/docs/directory-structure.md

## Engine Version Reference

Sem engine: o MicroGames não usa Godot, Unity nem Unreal, então nenhuma referência
de engine é carregada. Resumo do projeto: `design/game-brief.md`.

## Technical Preferences

`project.yaml` at the repo root is the primary config store — engine, specialists,
naming, platform, performance, modes. Skills resolve it via `resolve_config`
(see `.claude/docs/config-resolution.md`).

`.claude/docs/technical-preferences.md` is the **legacy fallback**, read on demand
when a key is absent from `project.yaml`. It is not imported here: before
`/setup-engine` runs it is almost entirely `[TO BE CONFIGURED]` placeholders, and
after it runs `project.yaml` holds the real values.

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
  (exempt: `active.md` appends, agent memory, a subagent's new file at the path
  its orchestrating skill named; see `.claude/rules/agent-memory.md`)
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction
- A skipped or dismissed question is not an answer: act on nothing, re-ask in
  plain text and wait
- Started outside this file's folder? Warn first: hooks, deny rules and the
  ask-first mode load only when Claude Code starts here

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **Configurado (2026-10-28):** `project.yaml` tem `modes.rigor: minimal` e
> `modes.automation: autonomous`, e o resumo está em `design/game-brief.md`. Não
> precisa rodar `/start`.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

Read `.claude/docs/context-management.md` on demand — it is a reference, not
session context. Two of its conventions are load-bearing and cited by name
elsewhere in the repo, so they are restated here rather than lost:

- **`production/session-state/active.md` is the session checkpoint.** The file is
  the memory, not the conversation. Read it first after any compaction, crash, or
  `/clear`.
- **Helpers in `.claude/scripts/` emit observations, never verdicts.** A script
  that scores or judges will eventually contradict a mode or override it cannot
  see. (Cited by `artifact-check.sh` and `adr-dep-graph.sh`.)
