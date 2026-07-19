---
description: Initialize project setup — AGENTS.md, planning context, user profile, and tech stack
argument-hint: "[--deep] [--context|--user|--all]"
agent: build
---

> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation runs **`general`-only** on the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` (first six on makora) and `umans/umans-glm-5.2` (balance on umans), at medium thinking; custom-provider children spawn with `extensions:true`. The `build` route (`claude-bridge/claude-opus-4-8` at high thinking) is the primary supervisor and sole integrator — it orchestrates, gates, and integrates but is never dispatched as a worker. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); `review`, `plan`, and `debug` run on `openai-codex/gpt-5.6-sol` at medium thinking as **read-only reasoning** (reasoning roles never implement and cannot edit). The primary resolves `required_skills` against `.pi/skills/manifest.json` before spawn and injects the role contract from `.pi/agents/` into every dispatch. Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`; each owns **exclusive paths** (no two workers edit the same file) and gets one bounded retry on a failed check before reporting a blocker. Multi-worker phases coordinate over mesh using the canonical board states `assigned → running → returned → verified | failed` (durable topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`). **Worker output is untrusted** — worker summaries are reports, not merged code; the primary reads every diff, verifies, and is the sole integrator. Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. Every worker brief carries a `required_skills` field (`[]` is valid and means no skill loaded; unknown skills are rejected before spawn). `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

# Init: $ARGUMENTS

Initialize project setup. Run once per project.

> **Next step for fresh projects:** `/plan` to create first implementation plan.  
> **Next step for existing codebases:** `/research` for deep codebase analysis, or just start describing what you want to build.

## Idempotency Rules

| File | Rule |
|---|---|---|
| `AGENTS.md` | Improve in-place — never overwrite blindly |
| `.pi/tech-stack.md` | Overwrite with detected values (auto-regenerated) |
| `.pi/roadmap.md` / `.pi/state.md` | Skip if exists, ask before overwrite |
| `.pi/user.md` | Skip if exists, ask before overwrite |

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

Write detected values to `.pi/tech-stack.md`. Then persist:

```markdown
# Append to .pi/artifacts/MEMORY.md (under Decisions section):
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
// fabric_exec — parallel explore dispatches (small-model lane, read-only)
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const route = cfg.role_routes.explore;                              // resolve role from config
const contract = String(await pi.read(ROOT + '/' + route.contract)); // inject role contract (.pi/agents/explore.md)
const spawn = (name, finding) => tools.call({
  ref: 'agents.spawn',
  args: {
    name,
    task: contract + '\n\n---\n\n' + finding +
      '\n\nrequired_skills: [] (load no skill)' +
      '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json ' +
      '(status, changed_paths, checks_run, stop_reason).',
    model: route.model,            // openai-codex/gpt-5.4-mini (alternate claude-bridge/claude-haiku-4-5)
    thinking: route.thinking,      // low
    tools: route.tools,            // read, grep, find, ls
    extensions: true,             // alternate claude-bridge custom provider needs this
  }
});

const a = await spawn('init-architecture', 'Search the codebase for: architecture patterns, data flow, domain boundaries, and module structure. Return: key architectural decisions, data flow patterns, main domains/modules.');
const b = await spawn('init-domains', 'Search the codebase for: domain boundaries, module organization, and subsystem structure. Return: top-level domains, module boundaries, dependency direction.');

const [archReport, domainReport] = [
  await tools.call({ ref: 'agents.wait', args: { id: a.id } }),
  await tools.call({ ref: 'agents.wait', args: { id: b.id } }),
];
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
  filePath: ".pi/roadmap.md",
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
  filePath: ".pi/state.md",
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

Create personalized user profile at `.pi/user.md`.

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

Write to `.pi/user.md` with the captured preferences.

### Phase 4: Verify

The file is written for on-demand reference — not injected via `instructions[]`. Use `read .pi/user.md` when you need preferences.

---

## Output

Report what was created:
1. AGENTS.md (if core setup ran)
2. tech-stack.md (if core setup ran)
3. roadmap.md + state.md (if `--context`)
4. user.md (if `--user`)
5. Recommended next command: `/plan` to start planning, `/research` to explore the codebase, or just describe what you want to build.

---

### Skills

Skills ship pre-installed under `.pi/skills/<name>/SKILL.md` and load on demand:
the primary names them per brief via `required_skills`, resolved against
`.pi/skills/manifest.json`. Nothing installs at init time — when the stack is
detected (e.g. Cloudflare, React, Supabase, SwiftUI), note the matching skills
in the project guidance so briefs can name them later.
