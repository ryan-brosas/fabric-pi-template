---
description: Create a specification with PRD, tasks, and workspace setup
argument-hint: "<description>"
agent: build
---

> **Pi execution binding:** Dispatch doctrine (GLM pool sizing, role routes, board states, worker-distrust, primary-as-sole-integrator) lives in `.pi/docs/fabric-tuning.md`.

# Create: $ARGUMENTS

Create a specification (PRD), set up workspace, and define executable tasks — ready for `/ship`.

> **Workflow:** **`/create`** → `/ship`

## Parse Arguments

| Argument        | Default       | Description                               |
| --------------- | ------------- | ----------------------------------------- |
| `<description>` | required      | What to build/fix (quoted string)         |

## Determine Input Type

| Input Type  | Detection            | Action                        |
| ----------- | -------------------- | ----------------------------- |
| Quoted text | `"description here"` | Create PRD from description   |
| Short form  | Simple string        | Ask for more detail if needed |

## Before You Create

- **Be certain**: Only create specs you're confident have clear scope
- **Don't over-spec**: If the description is vague, ask clarifying questions first
- **Check duplicates**: Always check for existing work
- **No implementation**: This command creates specs and workspace — don't write implementation code
- **Verify PRD**: Before saving, verify all sections are filled (no placeholders)
- **Flag uncertainty**: Use `[NEEDS CLARIFICATION]` markers for unknowns — never guess silently

## Available Tools

| Tool      | Use When                                     |
| --------- | -------------------------------------------- |
| `explore` | Finding patterns in codebase, affected files |
| `scout`   | External research, best practices            |

## Phase 1: Duplicate Check

### Context Search

Search `.pi/artifacts/MEMORY.md` for: prior decisions, similar work.

```bash
rg -n "topic" .pi/artifacts/MEMORY.md
```

### Existing Work Check

Check `.pi/artifacts/.active` for existing work in progress. If active slug exists with a `spec.md`, ask user if they want to continue with `/ship` instead.

## Phase 3: Choose Research Depth

Ask user before spawning agents:

```typescript
question({
  questions: [
    {
      header: "Research Depth",
      question: "How much codebase research do you need?",
      options: [
        {
          label: "Deep (Recommended for complex work)",
          description: "3-5 agents: patterns, tests, deps, best practices (~2 min)",
        },
        {
          label: "Standard",
          description: "2 agents: patterns + tests (~1 min)",
        },
        {
          label: "Minimal",
          description: "1 agent: quick file scan (~30 sec)",
        },
        {
          label: "Skip",
          description: "I know the codebase, use existing knowledge",
        },
      ],
    },
  ],
});
```

## Phase 4: Gather Context

Based on research depth choice, spawn agents:

**If Deep:**

- 3x `explore` (patterns, tests, deps)
- 1x `scout` (feature/epic)
- 1x `review` (epic)

**If Standard:**

- 2x `explore` (patterns, tests)
- 1x `scout` (feature/epic only)

**If Minimal:**

- 1x `explore` (patterns)

**If Skip:**

- No agents, use existing AGENTS.md context

**While agents run**, ask clarifying questions if the description lacks scope or expected outcome. For bugs, also ask for reproduction steps and expected vs actual behavior.

## Phase 5: Initialize Plan

Extract title and description from `$ARGUMENTS`:

- If user provided a single line, use it for both title and description.
- If user provided multiple lines, use first line as title and full text as description.

Derive a kebab-case slug from the title. This slug becomes the feature's namespace. Do not write the namespace yet; Phase 10 persists `.active`, `spec.md`, and `tasks.json` together with durable receipts.

## Phase 6: Determine PRD Rigor

Not every change needs a full spec. Assess complexity to choose the right PRD level:

| Signal | Lite PRD | Full PRD |
| --- | --- | --- |
| Scope | Simple, single-concern | Cross-cutting, multi-system |
| Files affected | 1-3 | 4+ |
| Research depth | Skip or Minimal | Standard or Deep |
| Description | "Fix X in Y" | "Implement X with Y and Z" |

**Auto-detect:** If research was Skip/Minimal AND description is a single sentence → default to Lite.

### Lite PRD Format

For simple, well-scoped work (bugs, small tasks):

```markdown
# [Title]

## Problem
[1-2 sentences: what's wrong or what's needed]

## Solution
[1-2 sentences: what to do]

## Affected Files
- `src/path/to/file.ts`

## Tasks
- [ ] [Task description] → Verify: `[command]`

## Success Criteria
- Verify: `npm run typecheck && npm run lint`
- Verify: `[specific test or check]`
```

### Full PRD Format

For features and complex work, use the full template:

Read the PRD template and write it to the active feature's spec (`.pi/artifacts/$(cat .pi/artifacts/.active)/spec.md`).

## Phase 7: Write PRD

Copy and fill the PRD template (lite or full) using context from Phase 4.

**If Lite PRD:** Fill the lite format directly. No template file needed.

**If Full PRD:** Read the template and fill all required sections:

| Section           | Source                                                     | Required          |
| ----------------- | ---------------------------------------------------------- | ----------------- |
| Problem Statement | User description + clarifying questions                    | Always            |
| Scope (In/Out)    | User input + codebase exploration                          | Always            |
| Proposed Solution | Codebase patterns + user intent                            | Always            |
| Success Criteria  | User verification + test commands (must include `Verify:`) | Always            |
| Technical Context | Explore agent findings                                     | Always            |
| Affected Files    | Explore agent findings (real paths from Phase 4)           | Always            |
| Tasks             | Derived from scope + solution                              | Always            |
| Risks             | Codebase exploration                                       | Feature/epic only |
| Open Questions    | Unresolved items from Phase 4                              | If any exist      |

### Task Format

Tasks must follow this format:

- Title with `[category]` tag
- One-sentence **end state** description (not step-by-step)
- Metadata block: `depends_on`, `parallel`, `conflicts_with`, `files`
- At least one verification command per task

## Phase 8: Validate PRD

Before saving, verify:

- [ ] No placeholder text remains (e.g., "[Clear description", "[List what's allowed]")
- [ ] Success criteria include `Verify:` commands
- [ ] Technical context references actual `src/` paths from exploration
- [ ] Affected files list real paths
- [ ] Tasks have `[category]` headings
- [ ] Each task has verification
- [ ] No implementation code in the PRD
- [ ] No unresolved `[NEEDS CLARIFICATION]` markers remain (convert to Open Questions or resolve)

If any check fails, fix it — don't ask the user.

## Phase 9: Prepare Workspace

### Workspace Check

```bash
git status --porcelain
git branch --show-current
```

- If uncommitted changes: ask user to stash, commit, or continue

### Create Branch

### Workspace Setup

Set up the workspace: create branch, install deps if needed.

Additionally offer a "Create worktree" option:

```typescript
skill({ name: "using-git-worktrees" });
```

## Phase 10: Convert and Persist Artifacts

Convert the validated PRD markdown to the executable JSON that `/ship` parses.
The primary supplies the final values to the `fabric_exec` invocation as named
strings: `π.slug` (validated kebab-case), `π.spec` (complete PRD markdown),
`π.tasks` (valid JSON), and `π.research` (consolidated Phase-4 worker/research
reports markdown; empty string when research was Skipped). Never paste raw
`$ARGUMENTS` into code or a shell command.

```typescript
// fabric_exec — light /create persistence: write each lifecycle artifact, then
// append a CAS-chained ledger receipt proving that exact write completed.
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const slug = typeof π.slug === 'string' ? π.slug.trim() : '';
const spec = typeof π.spec === 'string' ? π.spec : '';
const rawTasks = typeof π.tasks === 'string' ? π.tasks : '';
const research = typeof π.research === 'string' ? π.research : '';
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('π.slug must be nonempty kebab-case');
if (!spec.trim() || !spec.includes('Verify:')) throw new Error('π.spec must be complete and include Verify: commands');
let parsedTasks;
try { parsedTasks = JSON.parse(rawTasks); } catch (_) { throw new Error('π.tasks must be valid JSON'); }
if (!parsedTasks || typeof parsedTasks !== 'object') throw new Error('π.tasks must encode tasks');
const tasks = JSON.stringify(parsedTasks, null, 2) + '\n';
const artifactDir = ROOT + '/.pi/artifacts/' + slug;
function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
const made = await pi.bash({ cmd: 'mkdir -p ' + shellQuote(artifactDir), timeoutMs: 30000 });
if (!made.ok) throw new Error('cannot create artifact directory: ' + made.output);
const s0 = await tools.call({ ref: 'state.get', args: {} });
let LEDGER_HEAD = s0 && s0.head && s0.head.to ? String(s0.head.to) : '';
async function ledgerReceipt(phase, summary, evidence) {
  const to = 'create-' + slug + '/' + phase;
  const args = { label: 'create ' + phase, to, summary: String(summary).slice(0, 300), evidence };
  try { await tools.call({ ref: 'state.transition', args: LEDGER_HEAD ? { ...args, from: LEDGER_HEAD } : args }); }
  catch (_) {
    const current = await tools.call({ ref: 'state.get', args: {} });
    const observed = current && current.head && current.head.to ? String(current.head.to) : '';
    await tools.call({ ref: 'state.transition', args: observed ? { ...args, from: observed } : args });
  }
  LEDGER_HEAD = to;
}
async function writeArtifact(path, content, phase) {
  const written = await pi.write({ path, content });
  if (!written.ok) throw new Error('artifact write failed: ' + path + ': ' + written.output);
  await ledgerReceipt(phase, 'wrote ' + path.slice(ROOT.length + 1), ['test -s ' + shellQuote(path)]);
}
await writeArtifact(ROOT + '/.pi/artifacts/.active', slug + '\n', 'active-write');
await writeArtifact(artifactDir + '/spec.md', spec.endsWith('\n') ? spec : spec + '\n', 'spec-write');
await writeArtifact(artifactDir + '/tasks.json', tasks, 'tasks-write');
// research.md is ALWAYS persisted so /plan's Phase-0 read is reliable. When
// research was Skipped (π.research empty), write a minimal stub instead of
// omitting the file.
const researchContent = research.trim()
  ? (research.endsWith('\n') ? research : research + '\n')
  : '# Research\n\n(skipped: no research performed for this feature)\n';
await writeArtifact(artifactDir + '/research.md', researchContent, 'research-write');
```

The write is successful only after all four ledger receipts return
(`active-write`, `spec-write`, `tasks-write`, and `research-write` — the last
always persists, stub or real). If a write or receipt fails, stop and report
the exact artifact; do not claim `/create` completed.

## Phase 11: Report

Output:

1. Summary: task count, success criteria count, affected files count
2. Branch name and workspace (if claimed)
3. Active feature: `.pi/artifacts/$(cat .pi/artifacts/.active)/`
4. Next step: `/ship` (or `/plan` for complex work)

---

## Related Commands

| Need               | Command      |
| ------------------ | ------------ |
| Research first     | `/research`  |
| Plan after spec    | `/plan`      |
| Implement and ship | `/ship`      |
