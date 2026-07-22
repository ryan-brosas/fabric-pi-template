# PLAN — Pi/Fabric Template (`pi-template`)

The canonical implementation contract for this template. Authority, safety, and routing
live in `AGENTS.md`; model wiring in `.opencode/tech-stack.md`; this file is the executable
contract for the `.pi/` runtime. Trade-offs are in `DECISIONS.md`.

## Goal

A thin, portable Pi-native coding template powered by `pi-fabric` 0.22.4: GPT-5.6-sol Main
as sole scheduler/integrator/commit authority, a per-session advisory council, one Makora
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
| Council (supervisor + advisors) | `pi` | `openai-codex/gpt-5.6-sol` | `max` | `false` | `read,grep,find,ls` | `false` (persistent actors) |

**Extension split (load-bearing):** `extensions:false` → Fabric passes Pi `--no-extensions`
→ Makora provider fails to resolve. GPT council and read-only children use `extensions:false`;
Makora implementation workers MUST use `extensions:true` + `thinking:"max"` + an exact
writable tool allowlist.

**Writable work is blocking:** use `agents.run()` (not `spawn`/`parallel`) for the Makora
lane. No writable fan-out. Main does not edit until the run settles.

## Advisory Council

Per `AGENTS.md` "Advisory council, not orchestrator". Hybrid, per-session.

- **Supervisor** — persistent, ambient. `events:["agent_settled","tool_error"]`,
  `delivery:"steer"`, `triggerTurn:true`, `responseMode:"directive"`, `coalesce:true`,
  `extensions:false`, `tools:["read","grep","find","ls"]`, `model:"openai-codex/gpt-5.6-sol"`,
  `thinking:"max"`. **Custom instructions** — not the stock `fabric-supervisor` skill (which
  self-stops on "Goal verified complete"): the supervisor reports missing evidence/blockers
  but never certifies readiness and never stops itself; teardown follows `/verify` or
  explicit operator action.
- **Security advisor** — persistent, mailbox-only (no `events`). Same model/tools/extensions.
  Invoked only at lifecycle gates for security-domain changes.
- **Architecture advisor** — persistent, mailbox-only (no `events`). Same model/tools.
  Invoked only at lifecycle gates for structural concerns.

**Gate mechanics (blocking, not fire-and-forget):**
1. Main calls each applicable advisor with blocking `agents.ask()`. Never `tell()` — a
   failed directive run resolves as `action:"silent"`+`error` and yields no steer.
2. Main validates each result: accept only `action:"message"`, no `error`, structurally
   valid verdict. Missing/silent/stopped/malformed/errored responses **block** the gate.
3. On material conflict, Main issues one blocking `agents.ask(supervisor)` for synthesis.
4. Main independently validates cited evidence (actor output is untrusted advice); never
   executes commands or authorizes side effects solely from a steer.
5. The decision (coverage, failures, snapshot digest, evidence refs) is persisted in the
   artifact before Main proceeds.

Actor IDs are resolved locally each session via `agents.create()`/`agents.actors()`; never
address actors by canonical name over mesh (session scope does not isolate name-addressed
mesh messages).

## Lifecycle

Every lifecycle command takes an explicit `<slug>` (lowercase-hyphen, validated) and
reads/writes `.pi/artifacts/<slug>/{PLAN,TODO,PROGRESS,DECISIONS}.md`. No `.active` pointer,
no "latest" inference. Concurrent sessions on different slugs stay disjoint.

```
/create <slug> <idea>  ->  PLAN.md, TODO.md
/plan <slug>           ->  slice ordering, open questions (optional)
/ship <slug>           ->  implement slices; records work, NOT completion
/verify <slug>         ->  freshness fingerprint; ONLY phase that writes verified status
/research <slug>       ->  sideways; feeds /plan or /create; lives in PROGRESS.md
```

Pi auto-discovers `.pi/prompts/*.md` as slash commands (non-recursive; frontmatter =
`description` + optional `argument-hint`). Prompts are self-contained instructions to Main —
no `agent:` routing, no pseudo-tool calls, no command chaining (Pi templates expand Markdown
only).

## Verification (Freshness)

A PASS is bound to the bytes tested. `/verify <slug>` captures a fingerprint tuple:
- `HEAD` commit OID
- staged binary-diff digest (`git diff --cached`)
- unstaged diff digest (`git diff`)
- untracked-file manifest (`git ls-files --others --exclude-standard`)
- verified-file content hashes

Run the narrowest check, then typecheck/lint/test/build. PASS holds only if the tuple is
unchanged after every check; a formatter, concurrent writer, or later edit invalidates a
stale PASS — rerun. Persist commands, exit codes, and fingerprints in `PROGRESS.md`. Missing,
skipped, timed-out, or non-zero checks cannot produce PASS.

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
2. `.pi/prompts/supervise.md` (create/inspect council, session-scoped) — verify: re-run
   reuses IDs; resume restores correct immutable fields; second session gets distinct IDs —
   risk: stock supervisor self-stops on completion.
3. `.pi/prompts/gate.md` (blocking advisor ask + supervisor synthesis) — verify: errored
   advisor blocks; no duplicate steer loop — risk: `tell()` fire-and-forget yields no steer.
4. `.pi/prompts/{create,plan,ship,verify,research}.md` — verify: two sessions on different
   slugs stay disjoint; `/ship` cannot write verified status — risk: prompt pseudo-tool
   calls give false enforcement.
5. `.pi/tools/` verification fingerprint capture — verify: byte change after PASS
   invalidates — risk: stale PASS on concurrent edit.
6. Smoke: model resolution, Main native tools, review-child edit rejection, gate block on
   errored advisor, freshness invalidation.

## Open Questions

- Cross-worktree shared mesh: default mesh root is worktree-local — do concurrent
  worktree sessions need shared mesh visibility, or is per-session isolation sufficient?
- Single-writer lease: stay operator/prompt policy in v1, or add an atomic lease later?
- Gate timeout: actor call-level timeouts cannot shorten the configured Fabric
  `subagents.timeoutMs` — define a practical gate deadline.

## Stop Conditions

- A failed/errored/silent required advisor blocks the gate; no silent model substitution.
- A byte change after a PASS invalidates verification; rerun before any commit.
- Two sessions contending the same slug fail closed or acquire explicit ownership.
- Stop and ask before destructive Git, push beyond per-artifact commits, or secrets.
