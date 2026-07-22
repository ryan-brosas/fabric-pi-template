---
description: Initialize project setup — AGENTS.md, planning context, user profile, and tech stack
argument-hint: "[--deep] [--context|--user|--all]"
---

# Init: $ARGUMENTS

Initialize project setup. Run once per project.

> **Next step for fresh projects:** `/plan` to create first implementation plan.
> **Next step for existing codebases:** `/research` for deep codebase analysis, or just start describing what you want to build.

## Idempotency Rules

| File | Rule |
|---|---|---|
| `AGENTS.md` | Improve in-place — never overwrite blindly |
| `.opencode/tech-stack.md` | Overwrite with detected values (auto-regenerated) |
| `.opencode/roadmap.md` / `.opencode/state.md` | Skip if exists, ask before overwrite |
| `.opencode/user.md` | Skip if exists, ask before overwrite |

## Skills

Load the `brainstorming` skill before Mode 1 AGENTS.md generation.

Load `verification-before-completion` inside Mode 1 only (after AGENTS.md creation).

## Parse Arguments

| Argument | Default | Description |
|---|---|---|
| `--deep` | false | Comprehensive research for AGENTS.md (~100+ tool calls) |
| `--context` | false | Init planning context (roadmap.md, state.md) |
| `--user` | false | Init user profile (user.md) |
| `--all` | false | Full init: AGENTS.md + context + user profile |

**Mode rules:**
- No flags (default): Core project setup — AGENTS.md + tech-stack.md
- `--context`: Planning context (roadmap.md, state.md)
- `--user`: User profile (user.md)
- `--all`: Everything
- `--deep` applies to AGENTS.md generation only

**Brownfield auto-detection:** Existing codebase = any `src/`, `lib/`, or `app/` directory with `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, or `.rs` files. Affects Mode 2 discovery scope.

---

## Mode 1: Core Setup (Default)

### Phase 1: Detect Project

Detect and validate:
- Package manager and dependencies (with versions)
- Build, test, lint, dev commands — **validate each actually works**
- CI/CD configuration
- Existing AI rules (`.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`)
- Top-level directory structure

With `--deep`:
- Analyze git history (last 50 commits for patterns)
- Map source directory structure and subsystem candidates
- Identify common patterns (error handling, logging, data flow)
- Detect testing patterns and coverage gaps

### Phase 2: Preview Detection

Show detected summary and ask for confirmation before writing. Present three options:

1. **Yes (Recommended)** — Create both AGENTS.md and tech-stack.md
2. **AGENTS.md only** — Skip tech-stack.md
3. **Cancel** — Don't write anything

Wait for operator selection before proceeding.

### Phase 3: Create AGENTS.md

Load the `verification-before-completion` skill.

Create `./AGENTS.md` — target <60 lines (max 150). Include:
- Tech stack with versions, file structure, validated commands
- Code example from actual codebase
- Testing conventions, boundaries, gotchas

**Principles:** Examples > explanations. Pointers > copies. If AGENTS.md exists, improve it — don't overwrite blindly.

### Phase 4: Create tech-stack.md

Write detected values to `.opencode/tech-stack.md`. Then persist:

```markdown
# Append to .opencode/artifacts/MEMORY.md (under Decisions section):
## YYYY-MM-DD Project initialized — [tech stack summary]

Core setup completed: AGENTS.md, tech-stack.md created for [language/framework] project.
```

### Phase 5: Setup Fallow (if available)

Check if fallow is available. If yes and no `.fallowrc.json` exists:

```bash
npx fallow init --quiet 2>/dev/null || true
```

If fallow is not installed or network is unavailable, skip this step and report it as skipped. Never auto-install packages or make network calls without operator approval.

---

## Mode 2: Planning Context (`--context`)

Initialize project planning context with roadmap and state files.

### Phase 1: Discovery (brownfield)

If the project has existing code (brownfield — see auto-detection above), run parallel codebase analysis. Dispatch two `explore` agents:

1. **Map architecture patterns** — Search the codebase for: architecture patterns, data flow, domain boundaries, and module structure. Return: key architectural decisions, data flow patterns, main domains/modules.

2. **Map domain boundaries** — Search the codebase for: domain boundaries, module organization, and subsystem structure. Return: top-level domains, module boundaries, dependency direction.

If greenfield (no existing code), skip to requirements gathering.

### Phase 2: Requirements Gathering

Ask questions to define project direction. Present each as an operator question and wait for the answer:

1. **Project vision** — What is the project vision? (1-2 sentences). Let the operator type a custom answer.

2. **Target users** — Who are the primary users? (select all that apply):
   - Developers — Tooling, libraries, CLI
   - End users — Consumer-facing application
   - Internal team — Internal tool or service
   - Both — Multiple user types

3. **Success criteria** — What defines success for this project? (select all that apply):
   - Stability — Reliability and correctness first
   - Speed — Performance and low latency
   - UX — User experience and polish
   - Maintainability — Code quality and extensibility

### Phase 3: Preview

Show the gathered requirements as a structured outline and ask for confirmation before writing files.

### Phase 4: Create Files

Create `.opencode/roadmap.md` with the gathered vision, target users, and feature roadmap.

Create `.opencode/state.md` with current status (Initial setup), active decisions (none), and next priorities.

These files are written for reference. They are not injected via `instructions[]` — use `read` for on-demand access.

---

## Mode 3: User Profile (`--user`)

Create personalized user profile at `.opencode/user.md`.

### Phase 1: Gather Preferences

Ask the operator and wait for each answer:

1. **Identity** — What is your name and role? Let the operator type their details.

2. **Communication** — How detailed should AI responses be?
   - Concise (Recommended) — Short, direct answers
   - Detailed — Full explanations and reasoning
   - Mixed — Depends on context

3. **Git workflow** — How should git commits be handled?
   - Ask first (Recommended) — Always confirm before commit/push
   - Auto-commit — Commit directly after completion

### Phase 2: Preview

Show the captured preferences as a summary and ask for confirmation before writing.

### Phase 3: Create user.md

Write to `.opencode/user.md` with the captured preferences.

### Phase 4: Verify

The file is written for on-demand reference — not injected via `instructions[]`. Use `read .opencode/user.md` when you need preferences.

---

## Output

Report what was created:
1. AGENTS.md (if core setup ran)
2. tech-stack.md (if core setup ran)
3. roadmap.md + state.md (if `--context`)
4. user.md (if `--user`)
5. Recommended next command: `/plan` to start planning, `/research` to explore the codebase, or just describe what you want to build.

---

### Skill Installation

If you use a platform-specific technology, install the matching skill. Only install skills your project actually needs — skills are on-demand. Ask the operator before installing any skill.

Available skills include platform-specific guidance for common technologies. Check the local skill catalog for the current list and install only what the project genuinely requires.

---

## Related Commands

| Need | Command |
|---|---|
| Research a topic | `/research` |
| Create feature | `/create` |
| Plan execution | `/plan` |
| Ship feature | `/ship` |
| Verify gates | `/verify` |
