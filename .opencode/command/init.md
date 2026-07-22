---
description: Initialize project setup — AGENTS.md, planning context, user profile, and tech stack
argument-hint: "[--deep] [--context|--user|--all]"
agent: build
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

```typescript
skill({ name: "brainstorming" });
```

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

Show detected summary and ask for confirmation before writing:

```typescript
question({
  questions: [
    {
      header: "Proceed?",
      question: "Write AGENTS.md and tech-stack.md with the detected configuration?",
      options: [
        { label: "Yes (Recommended)", description: "Create both files" },
        { label: "AGENTS.md only", description: "Skip tech-stack.md" },
        { label: "Cancel", description: "Don't write anything" },
      ],
    },
  ],
});
```

### Phase 3: Create AGENTS.md

```typescript
skill({ name: "verification-before-completion" });
```

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

---

## Mode 2: Planning Context (`--context`)

Initialize project planning context with roadmap and state files.

### Phase 1: Discovery (brownfield)

If the project has existing code (brownfield — see auto-detection above), run parallel codebase analysis:

```typescript
task({
  subagent_type: "explore",
  description: "Map architecture patterns",
  prompt: `Search the codebase for: architecture patterns, data flow, domain boundaries, and module structure.
  Return: key architectural decisions, data flow patterns, main domains/modules.`,
});

task({
  subagent_type: "explore",
  description: "Map domain boundaries",
  prompt: `Search the codebase for: domain boundaries, module organization, and subsystem structure.
  Return: top-level domains, module boundaries, dependency direction.`,
});
```

If greenfield (no existing code), skip to requirements gathering.

### Phase 2: Requirements Gathering

Ask questions to define project direction:

```typescript
question({
  questions: [
    {
      header: "Project vision",
      question: "What is the project vision? (1-2 sentences)",
      options: [
        { label: "Let me type it", description: "Custom input" },
      ],
    },
    {
      header: "Target users",
      question: "Who are the primary users?",
      multiple: true,
      options: [
        { label: "Developers", description: "Tooling, libraries, CLI" },
        { label: "End users", description: "Consumer-facing application" },
        { label: "Internal team", description: "Internal tool or service" },
        { label: "Both", description: "Multiple user types" },
      ],
    },
    {
      header: "Success criteria",
      question: "What defines success for this project? (select all that apply)",
      multiple: true,
      options: [
        { label: "Stability", description: "Reliability and correctness first" },
        { label: "Speed", description: "Performance and low latency" },
        { label: "UX", description: "User experience and polish" },
        { label: "Maintainability", description: "Code quality and extensibility" },
      ],
    },
  ],
});
```

### Phase 3: Preview

Show the gathered requirements as a structured outline and ask for confirmation before writing files.

### Phase 4: Create Files

```typescript
// Create roadmap.md
write({
  filePath: ".opencode/roadmap.md",
  content: `# Roadmap

## Vision
[1-2 sentences]

## Target Users
- ...

## Feature Roadmap
- ...
`,
});

// Create state.md
write({
  filePath: ".opencode/state.md",
  content: `# State

## Current Status
Initial setup

## Active Decisions
(none)

## Next Priorities
- ...
`,
});
```

These files are written for reference. They are not injected via `instructions[]` — use `read` for on-demand access.

---

## Mode 3: User Profile (`--user`)

Create personalized user profile at `.opencode/user.md`.

### Phase 1: Gather Preferences

```typescript
question({
  questions: [
    {
      header: "Identity",
      question: "What is your name and role?",
      options: [
        { label: "Set name", description: "Tell me your details" },
      ],
    },
    {
      header: "Communication",
      question: "How detailed should AI responses be?",
      options: [
        { label: "Concise (Recommended)", description: "Short, direct answers" },
        { label: "Detailed", description: "Full explanations and reasoning" },
        { label: "Mixed", description: "Depends on context" },
      ],
    },
    {
      header: "Git workflow",
      question: "How should git commits be handled?",
      options: [
        { label: "Ask first (Recommended)", description: "Always confirm before commit/push" },
        { label: "Auto-commit", description: "Commit directly after completion" },
      ],
    },
  ],
});
```

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

If you use a platform-specific technology, install the matching skill:

```
.opencode/scripts/install-skill.sh cloudflare
.opencode/scripts/install-skill.sh react-best-practices
.opencode/scripts/install-skill.sh supabase-postgres-best-practices
.opencode/scripts/install-skill.sh swiftui-expert-skill
.opencode/scripts/install-skill.sh swift-concurrency
.opencode/scripts/install-skill.sh core-data-expert
```

Run `.opencode/scripts/install-skill.sh --list` to see all available. Skills are on-demand — only install what your project actually needs.
