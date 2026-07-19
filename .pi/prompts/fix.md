---
description: Debug and fix a bug or failing test
argument-hint: "<description of bug or error>"
agent: build
---

> **Pi execution binding:** The pseudocode in this prompt is semantic, not executable. `task()` maps to bounded Fabric subagent dispatch with an explicit role from `.pi/config.json`: implementation runs **`general`-only** on the GLM 12 pool — up to 12 concurrent GLM 5.2 workers split across `makora/zai-org/GLM-5.2-NVFP4` (first six on makora) and `umans/umans-glm-5.2` (balance on umans), at medium thinking; custom-provider children spawn with `extensions:true`. The `build` route (`claude-bridge/claude-opus-4-8` at high thinking) is the primary supervisor and sole integrator — it orchestrates, gates, and integrates but is never dispatched as a worker. Read-only fan-out (`explore`, `scout`) uses the small-model lanes (`openai-codex/gpt-5.4-mini`, alternate `claude-bridge/claude-haiku-4-5`); `review`, `plan`, and `debug` run on `openai-codex/gpt-5.6-sol` at medium thinking as **read-only reasoning** (reasoning roles never implement and cannot edit). The primary resolves `required_skills` against `.pi/skills/manifest.json` before spawn and injects the role contract from `.pi/agents/` into every dispatch. Workers are leaves at `maxDepth` 1: they never spawn agents and never call Fabric `state.*`; each owns **exclusive paths** (no two workers edit the same file) and gets one bounded retry on a failed check before reporting a blocker. Multi-worker phases coordinate over mesh using the canonical board states `assigned → running → returned → verified | failed` (durable topic `fabric-pi-<slug>`, CAS board `fabric-pi/<slug>/board`). **Worker output is untrusted** — worker summaries are reports, not merged code; the primary reads every diff, verifies, and is the sole integrator. Workers never create branches, commits, PRs, or other externally visible actions without operator confirmation — they suggest them in reports. Every worker brief carries a `required_skills` field (`[]` is valid and means no skill loaded; unknown skills are rejected before spawn). `question()` maps to asking the operator; `skill()` loads the matching Pi Agent Skill. Artifact paths are under `.pi/`. Direct execution remains the default when delegation adds no leverage (see `.pi/docs/fabric-tuning.md`).

# Fix: $ARGUMENTS

Systematically debug and fix the reported issue.

## Load Skills

```typescript
skill({ name: "root-cause-tracing" });
skill({ name: "verification-before-completion" });
```

## Process

### Phase 1: Reproduce

```bash
# Reproduce the issue with the exact steps or command
```

### Phase 2: Isolate

- Search for the error message or symptom in the codebase
- Trace the execution path to find the root cause
- Read the 2-4 most relevant files
- Distinguish symptom from root cause

### Phase 3: Fix

- Apply the minimal fix for the root cause
- Do not add speculative guards, tolerant readers, or defensive copies
- Prefer making the bad state impossible over handling all bad states

### Phase 4: Verify

```bash
npm run typecheck
npm run lint
npm test            # or vitest relevant test
```

If verification fails twice on the same approach, escalate with learnings.

## Output

Report:
1. Root cause (with file:line)
2. Fix applied
3. Verification results
4. What else was considered and rejected
