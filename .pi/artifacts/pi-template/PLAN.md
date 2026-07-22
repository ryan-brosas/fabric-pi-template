# PLAN — Pi/Fabric Template (`pi-template`)

The canonical implementation contract for this template. Authority, safety, and routing
live in `AGENTS.md`; model wiring in `.opencode/tech-stack.md`; this file is the executable
contract for the `.pi/` runtime. Trade-offs are in `DECISIONS.md`.

## Goal

A thin, portable Pi-native coding template powered by `pi-fabric` 0.22.4: GPT-5.6-sol Main
as sole scheduler/integrator/commit authority, a per-session advisory supervisor, one Makora
worker per session, and a Markdown lifecycle — adoptable by copying `.pi/`.

## Non-goals

- No `/team`, lifecycle kernel, schemas, typed handoffs, candidate manifests, receipts, or
  CAS board.
- No `.pi/config.json` (no consumer exists).
- No mandatory council per task; no mandatory research/review every cycle.
- No automatic commits/push/publication; no worker commits.
- No host-enforced single-writer lease (v1 is operator/prompt policy).

## Runtime Config

### `.pi/settings.json` (Pi project settings — Main defaults + package pin)

```jsonc
{
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.6-sol",
  "defaultThinkingLevel": "max",
  "packages": ["npm:pi-fabric@0.22.4"]
}
```

Pi 0.81.1 is an external host prerequisite; project settings cannot pin the host executable.
`packages` loads `pi-fabric` as a project extension so Fabric tools/actors resolve. Project
trust is required or this file is ignored.

### `.pi/fabric.json` (Fabric config — child defaults + mesh + budgets)

```jsonc
{
  "fullCodeMode": false,
  "schema": { "mode": "off" },
  "approvals": {
    "read": "allow",
    "write": "deny",
    "execute": "deny",
    "network": "deny",
    "agent": "allow"
  },
  "subagents": {
    "runner": "pi",
    "extensions": false,
    "maxDepth": 1,
    "maxConcurrent": 8,
    "maxPerExecution": 16,
    "timeoutMs": 600000,
    "defaultTools": ["read", "grep", "find", "ls"],
    "budgetUsd": 10,
    "maxTokensPerChild": 500000
  },
  "mesh": {
    "actorScope": "session"
  },
  "memory": { "enabled": false, "indexToolOutput": false, "indexThinking": false },
  "compaction": { "engine": "fabric" }
}
```

- `fullCodeMode:false` keeps native Pi tools on Main (read/bash/edit/write) alongside
  Fabric orchestration. `schema.mode:"off"` is mandatory — inherited `"enforce"` forces
  full-code mode and disables subagents.
- Default child tools are read-only; writable tools are granted per-call only on the
  Makora lane. `maxDepth:1` makes all workers leaves. `maxConcurrent:8` gives headroom for
  the hybrid council (3 actors) + 1 Makora + read-only gatherers; the writable pool is
  still 1 Makora (enforced by per-call dispatch + single-writer policy, not by
  `maxConcurrent`).
- `approvals` gates `fabric_exec` operations only (in orchestration-only mode, native
  Pi tools bypass it); `write/execute/network:"deny"` blocks autonomous fabric_exec
  mutation while `agent:"allow"` permits actor/subagent dispatch.
- `mesh.actorScope:"session"` isolates actor registries per Pi session under
  `.pi/fabric/mesh/actors/<sessionId>/`. `mesh.enabled:true` is inherited from global.
- `memory.enabled:false` disables Fabric session indexing (Markdown artifacts are the
  lifecycle record); `indexToolOutput:false` prevents transcripts retaining tool output.
- `compaction.engine:"fabric"` is deterministic and LLM-free.
- `budgetUsd:10` and `maxTokensPerChild:500000` are finite template defaults; tune before
  autonomous use. Global values inherit for everything not listed (transport, executor,
  capture, ui).

## Dispatch Rules

Every `agents.run` / `agents.create` / `agents.spawn` passes exact params at the call site.
No file-routed roles.

| Lane | `runner` | `model` | `thinking` | `extensions` | `tools` | `worktree` |
|---|---|---|---|---|---|---|
| GPT read-only (plan/review/debug/explore/scout) | `pi` | `openai-codex/gpt-5.6-sol` or `gpt-5.4-mini` | `max` | `false` | `read,grep,find,ls` | `false` |
| Makora implement | `pi` | `makora/zai-org/GLM-5.2-NVFP4` | `max` | **`true`** | `read,grep,find,ls,edit,write,bash` (exact allowlist) | `true` for isolated impl; `false` for in-place |
| Supervisor (ambient) | `pi` | `openai-codex/gpt-5.6-sol` | `max` | `false` | `read,grep,find,ls` | N/A (persistent actor rejects `worktree`) |

**Extension split (load-bearing):** `extensions:false` → Fabric passes Pi `--no-extensions`
→ Makora provider fails to resolve. GPT council and read-only children use `extensions:false`;
Makora implementation workers MUST use `extensions:true` + `thinking:"max"` + an exact
writable tool allowlist.

**Writable work is blocking:** use `agents.run()` (not `spawn`/`parallel`) for the Makora
lane. No writable fan-out. Main does not edit until the run settles.

## Advisory Supervisor

Per `AGENTS.md` "Advisory supervisor, not orchestrator". Per-session, single actor.

- **Supervisor** — persistent, ambient. `events:["agent_settled","tool_error"]`,
  `delivery:"steer"`, `triggerTurn:true`, `responseMode:"directive"`, `coalesce:true`,
  `extensions:false`, `tools:["read","grep","find","ls"]`, `model:"openai-codex/gpt-5.6-sol"`,
  `thinking:"max"`. **Custom instructions** — not the stock `fabric-supervisor` skill (which
  self-stops on "Goal verified complete"): the supervisor reports missing evidence/blockers
  but never certifies readiness and never stops itself; teardown follows `/verify` or
  explicit operator action.

Actor IDs are resolved locally each session via `agents.create()`/`agents.actors()`; never
address the actor by canonical name over mesh (session scope does not isolate name-addressed
mesh messages). (The earlier security/architecture advisor + gate design was dropped as
redundant — see ADR-008.)

## Lifecycle

Every lifecycle command takes an explicit `<slug>` (lowercase-hyphen, validated) and
reads/writes `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`. No `.active` pointer,
no "latest" inference. Concurrent sessions on different slugs stay disjoint.

```
/create <slug> <idea>  ->  PLAN.md, TODO.md
/plan <slug>           ->  slice ordering, open questions (optional)
/ship <slug>           ->  implement slices; records work, NOT completion
/verify <slug>         ->  freshness fingerprint; ONLY phase that may declare verified status (externally)
/research <slug>       ->  sideways; feeds /plan or /create; lives in PROGRESS.md
```

Pi auto-discovers `.pi/prompts/*.md` as slash commands (non-recursive; frontmatter =
`description` + optional `argument-hint`). Prompts are self-contained instructions to Main —
no `agent:` routing, no pseudo-tool calls, no command chaining (Pi templates expand Markdown
only).

### Namespace ownership (fail-closed)

`/create` is the sole slug-namespace creator. An established namespace = both `PLAN.md` AND
`TODO.md` exist. `/create` validates the slug before any slug-derived access, `mkdir -p
.pi/artifacts/<slug>/`, and writes both sentinel files, refusing an existing namespace.
Downstream lifecycle commands (`/plan`, `/ship`, `/verify`) validate the slug, then **fail
closed** if the namespace is missing or partial — they never `mkdir`, adopt, overwrite, or
delete. Pre-`/create` `/research` runs read-only and returns findings in the response only
(no `PROGRESS.md` or memory write). An empty or partial namespace blocks for operator
recovery — no silent adoption, overwrite, or deletion.

### Two surfaces

The Pi runtime layer carries two distinct writable surfaces (ADR-007):
- **Lifecycle state** — `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`, the sole
  per-slug lifecycle record, confined to the slug namespace. Only `/verify` declares terminal
  verified status (externally).
- **Project memory** — `.opencode/artifacts/MEMORY.md`, an **optional** separate writable
  surface for durable cross-slug knowledge, distinct from lifecycle state. Missing memory is
  treated as absent (non-blocking); prompts must not auto-create the OpenCode scaffold. Only
  `/init` may establish the OpenCode context surface; `/verify` may append one distilled
  non-sensitive finding pre-fingerprint. Lifecycle prompts may read project memory for context
  when it exists; other writes are explicit "record durable finding" steps, never lifecycle
  state. Memory content is distilled, non-sensitive knowledge only — never secrets,
  credentials, PII, raw tool output, per-slug status, or final verification results.

## Verification (Freshness)

A PASS is bound to the bytes tested. `/verify <slug>` captures a fingerprint tuple:
- `HEAD` commit OID
- staged binary-diff digest (`git diff --cached`)
- unstaged diff digest (`git diff`)
- untracked-file manifest (`git ls-files --others --exclude-standard`)
- verified-file content hashes

Run the narrowest check, then typecheck/lint/test/build. PASS holds only if the tuple is
unchanged after every check; a formatter, concurrent writer, or later edit invalidates a
stale PASS — rerun. Candidate evidence (commands, exit codes, hashes) may be persisted in
`PROGRESS.md` before the final pass; the final verified declaration is emitted in the
`/verify` response/session transcript only, and no repository write occurs after the final
before/after fingerprint (a post-fingerprint write would invalidate the PASS it records).
Missing, skipped, timed-out, or non-zero checks cannot produce PASS.

## Commit Policy

- Main is sole commit authority; workers never commit.
- Single writer per worktree (v1 operator/prompt policy): one root Pi per writable Git
  worktree; blocking `agents.run()` for writable work; no Main edits until the run settles.
- Scope staging to owned paths; never `git add .`. Stage exact blobs/hunks.
- Per-artifact commit+push is pre-authorized after each artifact completes; ask before
  any other externally visible or destructive action.

## Slices (ordered, risk-first)

1. `.pi/settings.json` + `.pi/fabric.json` — verify: `pi --approve --list-models` resolves
   all three IDs; Main retains native tools; review child edit fails — risk: inherited
   `schema.mode:"enforce"` silently disables subagents.
2. `.pi/prompts/supervise.md` (create/reconcile council, session-scoped) — verify: re-run
   reuses IDs; exact-session restart restores same IDs; immutable/stopped drift blocks
   (no removal); new session uses distinct registry — risk: stock supervisor self-stops on
   completion; same-name create over a stopped actor deletes history.
3. `.pi/prompts/{create,plan,ship,verify,research,fix,init,gc,audit}.md` — port **all nine**
   `.opencode/command/*.md` bodies (operator-approved scope: take all of each body, strip
   only OpenCode-only syntax, re-point to `.pi/artifacts/<slug>/`). The five lifecycle
   commands take an explicit validated `<slug>`; the four operational commands keep natural
   args. verify: two sessions on different slugs stay disjoint; `/ship` cannot declare
   completion; `/verify` declares verified status externally only — risk: over-stripping
   loses runnable behavior; prompt pseudo-tool calls give false enforcement.
5. `.pi/tools/` verification fingerprint capture — verify: byte change after PASS
   invalidates — risk: stale PASS on concurrent edit.
6. Smoke: model resolution, Main native tools, review-child edit rejection, freshness
   invalidation.

## Open Questions

- Cross-worktree shared mesh: default mesh root is worktree-local — do concurrent
  worktree sessions need shared mesh visibility, or is per-session isolation sufficient?
- Single-writer lease: stay operator/prompt policy in v1, or add an atomic lease later?

## Stop Conditions

- A byte change after a PASS invalidates verification; rerun before any commit.
- Two sessions contending the same slug fail closed or acquire explicit ownership.
- Stop and ask before destructive Git, push beyond per-artifact commits, or secrets.
