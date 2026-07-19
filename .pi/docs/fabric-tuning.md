# Fabric orchestration — the profile brain

The `fabric_exec` tool surface is the orchestration brain of this profile. The
primary session plans, routes, dispatches, steers, and integrates all delegated
work through Fabric. Direct execution remains the default for small, known
work; Fabric is engaged when a task needs specialization, isolation, or
parallel fan-out. Role routes and per-role models live in `.pi/config.json`;
`.pi/fabric.json` owns runtime limits plus the runtime defaults for untyped
dispatch (`subagents.model`, `subagents.thinking`). This document describes the
orchestration model and does not duplicate those tables.

## Brain loop

The primary loop is: **plan -> dispatch -> coordinate (mesh) -> steer -> verify
-> integrate**. The primary breaks work into assignments, dispatches them to
workers, tracks status over the mesh, corrects drift mid-flight, inspects each
returned diff, runs verification, and integrates the accepted result. Direct
execution short-circuits the loop for small, known work.

### The loop in TypeScript

All dispatch runs inside `fabric_exec`. The canonical idiom resolves the role
from `role_routes` in `.pi/config.json` and injects the role contract from
`.pi/agents/` at the top of the worker task — contract injection is the
dispatcher's job; Fabric does not do it automatically:

```typescript
// resolve the role and inject its contract (use absolute paths from the project root)
const ROOT = '/abs/path/to/project';
// note: pi.read returns the file content as a plain string (pi.bash returns { ok, output })
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const route = cfg.role_routes.general;            // model, thinking, tools, contract
const contract = String(await pi.read(ROOT + '/' + route.contract));

// create the CAS board before dispatch (ifVersion: 0 = create-only)
await tools.call({ ref: 'mesh.put', args: { key: 'fabric-pi/<slug>/board',
  value: { tasks: { 'unit-1': 'assigned' } }, ifVersion: 0 } });

// spawn a bounded leaf worker (general route -> GLM 8 pool)
const h = await tools.call({ ref: 'agents.spawn', args: {
  name: 'unit-1',
  task: contract + '\n\n---\n\n' +
    'Goal, non-goals, owned paths, expected output, verification, stop condition.',
  model: route.model,
  tools: route.tools,
  thinking: route.thinking,
  extensions: true,                 // custom providers (makora/umans/claude-bridge) need this
} });

// coordinate over mesh
await tools.call({ ref: 'mesh.publish', args: {
  topic: 'fabric-pi-<slug>', kind: 'assignment', text: 'unit-1 dispatched',
} });

// correct drift mid-flight, then harvest
await tools.call({ ref: 'agents.steer', args: { id: h.id, message: 'Stay inside owned paths.' } });
const done = await tools.call({ ref: 'agents.wait', args: { id: h.id } });

// record completion with compare-and-swap (re-read, then write with the read version)
const board = await tools.call({ ref: 'mesh.get', args: { key: 'fabric-pi/<slug>/board' } });
board.value.tasks['unit-1'] = 'verified';
await tools.call({ ref: 'mesh.put', args: { key: 'fabric-pi/<slug>/board', value: board.value, ifVersion: board.version } });
// worker output is untrusted: read the diff and run verification before integrating
```



### Dispatch gateway (canonical helper)

Every dispatch should go through one helper defined inside the `fabric_exec`
turn, so contract injection, route resolution, and board bookkeeping cannot
be skipped piecemeal:

```typescript
async function dispatch(role, assignment) {
  const route = cfg.role_routes[role];
  const roleContract = String(await pi.read(ROOT + '/' + route.contract));
  const task = roleContract + '\n\n---\n\n' + assignment +
    '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json' +
    ' (status, changed_paths, checks_run, stop_reason).';
  const h = await tools.call({ ref: 'agents.spawn', args: {
    name: role + '-' + Date.now(), task,
    model: route.model, tools: route.tools, thinking: route.thinking,
    extensions: true,               // custom providers (makora/umans/claude-bridge) need this
  } });
  // record the assignment on the board via CAS, not a create-only put: the board
  // is created once (ifVersion: 0); every later write re-reads the version and writes
  // at it, so concurrent dispatches never clobber each other or fail on re-create.
  const cur = await tools.call({ ref: 'mesh.get', args: { key: 'fabric-pi/<slug>/board' } });
  const next = cur.value;
  next.tasks[h.id] = 'assigned';
  await tools.call({ ref: 'mesh.put', args: { key: 'fabric-pi/<slug>/board',
    value: next, ifVersion: cur.version } });
  return h;
}

async function govern(handles, laneBudget) {
  for (const h of handles) {
    const st = await tools.call({ ref: 'agents.status', args: { id: h.id } });
    const used = (st.usage && st.usage.totalTokens) || 0;
    if (used > laneBudget) await tools.call({ ref: 'agents.stop', args: { id: h.id } });
    else if (used > laneBudget * 0.9) await tools.call({ ref: 'agents.steer', args: { id: h.id, message: 'Budget nearly exhausted: wrap up and report now.' } });
    else if (used > laneBudget * 0.75) await tools.call({ ref: 'agents.compact', args: { id: h.id } });
  }
}
```

Poll `govern` on `coordination.poll_interval_ms`; lane budgets come from
`dispatch.token_budgets`. Retry at most once, using the role alternate before
the implementation-model order. The completion envelope is advisory input —
the primary still reads diffs and verifies before marking `verified`.
`/team` applies this pattern: its implementation wave is `agents.spawn`ed and
status-polled with a deadline steer ("wrap up now"); the budget clauses stay
inert while `token_budgets` are 0 (unlimited by operator decision).

### Required skills (dispatcher-side resolution)

A dispatch brief may name `required_skills`: the skills the leaf is expected to
run during the task. The flow is: the primary **validates** each named skill
before spawning (it exists, is loadable, and is not in the union of
`dispatch.leaf_excluded_skills` and `manifest.primary_only.interactive`), then
**names** the validated skill in the brief; the receiving session (the leaf)
**explicitly loads** each named skill itself by reading its full `SKILL.md`. No
skill loads without being named in the brief — there is no default skill surface
for a leaf. `brainstorming`, `grill-me`, and `grill-with-docs` require operator
dialogue, so they stay primary-session-only and are never named in a worker
brief. Never pass an unresolved skill name to a leaf: a leaf that references a
skill it cannot load fails mid-task instead of at dispatch. The route's `tools`
allow-list is the hard capability boundary; `required_skills` is the softer
"which skills to surface" hint, resolved against that boundary first.

## Role routes

The eight role routes are defined in `.pi/config.json` and are the single source
of truth for per-role models and tool sets, organized by tier:

- **Supervisor:** `build` (orchestrates, gates, integrates; delegates
  implementation to `general`; may edit directly for small fixes) runs
  `makora/zai-org/GLM-5.2-NVFP4`. Opus is the Main/primary model driving the
  brain loop, not a routed seat; `build` is the routed dispatch lane.
- **Implementation (GLM 5.2):** `general` (bounded implementation — the only role
  granted `edit`/`write`/`bash`) — the two GLM lanes
  `makora/zai-org/GLM-5.2-NVFP4` (cap 6) and `umans/umans-glm-5.2` (cap 2);
  see Pi execution binding below.
- **Reasoning (read-only):** `plan` (primary when driving the loop, or read-only
  advisory) runs `claude-bridge/claude-opus-4-8` at medium thinking with
  `claude-bridge/claude-fable-5` as the per-route `alternate_model`; `review`
  (read-only correctness/security) and `debug` (read-only root-cause diagnosis)
  run the GLM lanes. All read-only (`read`/`grep`/`find`/`ls`); they NEVER
  receive implementation briefs and cannot edit.
- **Read-only fan-out (GLM lanes):** `explore` (local code search) and `scout`
  (external research) run the GLM lanes.
- **Multimodal:** `vision` — `makora/moonshotai/Kimi-K2.7-Code`.

Do not duplicate the model table here; consult `config.json` for the exact keys
and tool allow-lists per role. Interactive skills are the union of `dispatch.leaf_excluded_skills` and
`skills/manifest.json` `primary_only.interactive` (currently brainstorming,
grill-me, and grill-with-docs). They require operator dialogue, so the
dispatcher never names them in a leaf brief. Each route also names a `contract` file under
`.pi/agents/`; the dispatcher reads it and prepends it to every worker task
(see the loop example above) so role behavior travels with the spawn.

## Pi execution binding (canonical)

This section is the canonical binding for how Pi dispatches implementation
work; the lifecycle prompts point here, so do not duplicate this doctrine
elsewhere.

**Lanes and caps.** Implementation runs on two GLM 5.2 lanes only:
`makora/zai-org/GLM-5.2-NVFP4` (cap 6) and `umans/umans-glm-5.2` (cap 2),
8 seats total. Never 12, never a 6+6 split, never "up to 12". The `general`
route (the only role granted `edit`/`write`/`bash`) is pinned to these lanes.

**Provider pinning.** makora and umans are package-based providers loaded at
Pi startup; any child running them needs `extensions: true`. Dispatch fills
makora first up to its cap of 6, then umans up to its cap of 2 — not
round-robin, not interchangeable.

**Per-lane circuit breaker.** A lane that rate-limits or errors gets at most
one retry on the same lane, then falls back to the role `alternate_model`
before the implementation-model order; a persistently failing lane is parked,
not retried in a tight loop. Token budgets are disabled (`0` = unlimited) by
operator decision — manage a runaway child manually with `agents.compact`,
`agents.steer`, or `agents.stop`.

**Worker-output distrust.** Worker output is untrusted until the primary
reads the diff and runs verification. The worker's self-reported envelope
guides harvest but never substitutes for the host-derived Git diff (see
Worker distrust and integration).

**Mesh convention.** Each work slug uses two durable surfaces: topic
`fabric-pi-<slug>` for assignment/status events, and a compare-and-swap
board at mesh key `fabric-pi/<slug>/board`. Only the primary writes the
board; workers report, the primary verifies and integrates (see Mesh
coordination).

## Support and reasoning lanes

The `openai-codex` provider is not provisioned in this environment (no API
key), so no route uses it. Read-only fan-out (`explore`, `scout`) and the
reasoning routes `review` and `debug` run the GLM lanes
(`makora/zai-org/GLM-5.2-NVFP4`, alternate `umans/umans-glm-5.2`). `plan` runs
`claude-bridge/claude-opus-4-8` at medium thinking with
`claude-bridge/claude-fable-5` as its `alternate_model` — both read-only in
the reasoning tier. `compaction` is `fabric.json` runtime plumbing (context
reduction via `claude-bridge/claude-haiku-4-5` with a GLM alternate), not a
role route. Claude models are reached only through the Claude Bridge provider
— there is no native Claude runner in this profile.

## External research (Context7, Exa, and more)

Two research surfaces are live, and they have different reach — the
maximization rule is to use each where it actually works, not to pretend a
single pipeline.

**Primary-side (depth 0) — the Fabric `mcp` provider.** The primary session
can call pooled MCP tools directly via `tools.call({ ref: 'mcp.<server>.<tool>',
args })`. Verified live (2026-07-18):

- `mcp.exa.web_search_exa` / `mcp.exa.web_fetch_exa` — general web search and
  full-page fetch (Exa, http transport).
- `mcp.context7.resolve-library-id` / `mcp.context7.query-docs` — current
  library documentation (richer schema than the native extension below).
- `mcp.tilth.*` — structural code intelligence (search/read/files/deps/grok/diff);
  verified callable, but its file scope is the MCP server's launch cwd, so
  confirm it covers the project you are editing.
- `mcp.openaiDeveloperDocs.*` and `mcp.firecrawl.*` — listed by `mcp.$servers`
  but not separately verified here.

Verified working: `context7`, `exa`, `tilth`. `mcp.$servers` also lists
openaiDeveloperDocs, firecrawl, oracle, and process_triage, but a listed server
is not necessarily functional — agent-mail was listed yet uninstalled — so
verify a server before relying on it.

**Peer-side (subagents and actors, depth 1) — native extension tools only.**
Depth-1 children are NOT exposed the `mcp` provider: a child granted `mcp.exa.*`
reported "this session doesn't expose the MCP tools interface" (verified).
Children CAN use native extension tools granted by name — `context7`, `grepsearch`, and pinned project package tool `codex_search`. The scout route exposes all three: Context7 for official library docs, grep.app for production-code examples, and Codex search for current general web/release evidence through Pi's existing openai-codex login. `codex_standalone_web` remains disabled by default.

**Maximization pattern.** In `/team`, a local `explore` run and an external `scout` run are mandatory before planning. The scout must successfully complete at least one configured research tool, and its structured envelope must include URL references; the primary proves the tool completion from the host-reported child event log. The primary may additionally use Exa, OpenAI docs, Firecrawl, or Tilth through Fabric MCP and broker that evidence into briefs. Do not grant `mcp.*` refs to children — they are unavailable there.

## Custom-provider child dispatch requires extensions:true

makora, umans, and claude-bridge are package-based providers (their models are
registered at pi startup by `pi-makora-provider`, `pi-umans-provider`, and
`pi-claude-bridge` — declared in the user-global `packages`, not the project).
They are absent from the `~/.pi/agent/models-store.json` cache. A Fabric child
spawned with `extensions: false` does not load those packages, so any
makora/umans/claude-bridge model fails to resolve with `No models match pattern`
(openai-codex models resolve without packages, but that provider is not provisioned here — no API key — so no route uses it). Spawning
with `extensions: true` loads the packages and the models resolve (verified
2026-07-18: makora GLM, umans GLM, claude-bridge Opus all dispatch as children
with `extensions: true`, all fail with `extensions: false`).

`fabric.json` `subagents.extensions` defaults to `true`, so normal dispatch and
persistent actors resolve custom providers correctly. RULE: never set
`extensions: false` on a child (subagent or actor) that runs a
makora/umans/claude-bridge model — restrict tools with the `tools` allow-list
instead if you want a lean child.

## LocalTerm-first subagent transport

`.pi/fabric.json` sets `subagents.transport` to `auto`. Fabric resolves
`auto` in this order: **LocalTerm → tmux → screen → process**. LocalTerm is
available only when the `localterm` executable is on the Pi host's `PATH`
and `localterm session ls --json` succeeds; otherwise dispatch falls through
without reducing the configured 8-child ceiling. A call may still override the
profile with `transport: "process"` or another explicit transport.

LocalTerm is an operator-managed host prerequisite, not a Pi extension. Install
and start it using the upstream package, then reload Pi so the changed Fabric
default is active:

```bash
npm install -g @monotykamary/localterm
localterm start
localterm status
localterm session ls --json
```

Source: [monotykamary/localterm](https://github.com/monotykamary/localterm).
LocalTerm adds persistent, attachable PTYs (Fabric reports an
`attachCommand`); it does not raise model/provider concurrency limits. Keep
`maxConcurrent` and the GLM lane split as the capacity controls.

## Mesh coordination

Coordination uses two durable surfaces per work slug:

- **Topic** `fabric-pi-<slug>` — carries assignments and addressed actor requests. Conversing actors (see below) exchange addressed messages on it; there is no fixed standing crew and no gating checkpoint actors.
- **Board** at mesh key `fabric-pi/<slug>/board` — a primary-owned compare-and-swap audit projection. Only the primary writes it; host run records, event logs, structured envelopes, Git evidence, and the in-memory phase ledger authorize transitions.

Board task states follow `coordination.board_states` in `config.json` (assigned -> running -> returned -> verified | failed): "returned" means the host run returned; "verified" only after the primary read the diff and ran checks. The board's `evidence` mirror is observable but never an authorization source. The mesh is project-scoped.

### CAS claims and orphan recovery

- **CAS writes are not leases.** The primary creates the board once with `ifVersion: 0`, then re-reads and version-writes every audit transition. One-shot workers never claim or write board state. There is no heartbeat/TTL lease; host run status and timeout determine orphan recovery.
- **Orphaned one-shot workers (manual recovery on resume).** A child that
  crashes mid-task leaves its run in `agents.list` (`fabric.json`
  `subagents.retainRuns: true`) and its board entry stuck in
  `assigned`/`running`. Because v1 has no heartbeat/TTL, there is no automatic
  orphan detection: on supervisor resume, the primary reads the retained runs
  plus board state, detects non-completion via `agents.wait` (which returns the
  error/timeout) or `agents.status`, CAS-writes the entry to `failed`, and
  re-dispatches at most once, using the role `alternate_model` before the
  `implementation_models` order. Do not delete a dead run's worktree branch,
  or invoke any branch
  deletion, without explicit operator permission — the retained run record is
  the evidence used for manual recovery.
- **Orphaned persistent actors.** Actors restore across sessions via the
  project actor registry (Pi actors resume their Fabric-owned session file;
  ambient restoration is on while `mesh.enabled`). `agents.remove({ id })`
  retires one; `ActorManager.haltAll()` is stop-the-world when a conversation
  runs away.
- **Steer/follow-up to a dead target.** A `fabric.steer`/`followUp` mesh event
  addressed to an id no live process owns is dropped best-effort — confirm the
  peer is live with `agents.status`/`agents.actors()` before relying on a
  cross-process steer.

## Conversing actors

Alongside one-shot subagents, the profile adopts Fabric **persistent mailbox
actors** for work that benefits from ongoing peer collaboration rather than a
single dispatched turn. An actor is a durable peer with its own context and
mailbox, created by the primary with `agents.create` and conversing with other
actors and the primary over mesh topics and direct messages.

Primitives (pi-fabric 0.21.5, verified against `dist/`):

- `agents.create({name, instructions, topics, delivery, responseMode, model, thinking, tools, scope})` — create a live project actor (or a global template with `scope: "global"`). `instructions` is the actor's persona; the dispatcher injects `.pi/agents/actor.md` here.
- `agents.ask({id, message, data})` — send and wait for the actor's next response (synchronous peer exchange).
- `agents.tell({id, message, data})` — queue a message without waiting (async mailbox).
- `agents.actors()` / `agents.actorStatus({id})` / `agents.messages({id})` — inspect live actors and their bounded inbox/outbox.
- `agents.setInstructions` / `setEvents` — refine a peer's persona or subscriptions live. No live setter exists for model or thinking: changing those requires recreating the actor (its runner and model are fixed at creation; the dashboard can repoint the model for the next activation).
- `agents.import` / `export` — move role templates between the global registry and live project actors.
- `agents.steer` / `followUp` — reach a peer cross-process over the mesh ("any Fabric-equipped agent can steer any other").
- `ActorManager.haltAll()` — stop-the-world if a conversation runs away.

Authority preserved: actors collaborate and converse, but the **primary remains the sole board writer and integrator**. `/team` has no fixed standing crew; actors have no default subscriptions, which avoids ambient feedback loops. Actors are never automatically removed because removal deletes retained actor state. Outside explicit `/team`, direct-first still applies.

## Steering and follow-up

- `agents.steer` corrects a drifting worker between turns without restarting
  the assignment.
- `agents.followUp` queues a post-completion message for a worker, used for
  follow-ups that should land after the current turn finishes.
- `agents.compact` requests advisory compaction of a running child's context —
  the pressure valve for a worker approaching its token budget.

Token ceilings are disabled by operator decision: `fabric.json` `subagents.maxTokensPerChild` and every `config.json` lane budget are `0` (unlimited). `/team` interprets zero explicitly rather than comparing usage against it. Safety still has finite cycle, retry, wall-clock timeout, worktree, verification, and operator-checkpoint boundaries; `agents.compact`, `steer`, and `stop` remain manual pressure valves, not token-budget transitions.

Workers are leaves: `maxDepth: 1`. No worker may spawn further workers.

## Worker distrust and integration

Worker output is untrusted until the primary reads the diff and verifies it.
For mutating `/team` waves, ROOT must start as a clean Git work tree and every
`general` worker runs with `worktree: true`. The primary derives changed paths
from each host-reported worktree with NUL-delimited Git status, rejects
deletions/renames/conflicts and out-of-scope paths, reads every changed file and
a bounded unified diff, and only then considers integration. A worker's
self-reported `changed_paths` must match Git exactly but is never itself proof.
Failed worktrees remain retained until the operator explicitly authorizes
cleanup. Workers end reports with the `.pi/schemas/worker-result.json` envelope;
the envelope guides harvest but never substitutes for the host-derived diff.

### Versioned completion envelopes

The completion envelope is recorded **inside each task entry** on the
versioned board, never as the entire board value. A mesh state entry is
`{ key, value, version, updatedAt, updatedBy }`; the board `value` holds
`{ slug, cycle, phase, tasks, status }`, and each task entry holds its own
`{ paths, verify, status, envelope }`. The worker's `worker-result` object
(`status`, `changed_paths`, `checks_run`, `stop_reason`) is written as the
`envelope` field inside that task entry at a compare-and-swap `version`. Tying
the envelope to a board version (and to a specific task entry) makes
integration auditable (`updatedBy` records who integrated) and lost-update-safe: the primary serializes returned envelopes into task entries;
for each write it re-reads the board and retries the CAS if another update won.
Workers do not write the board directly on this profile. The envelope never
substitutes for reading the diff — it guides harvest.

### Primary gates

The primary gates every phase of the brain loop; no phase advances on a
worker's say-so:

1. **Research gate** — every cycle runs `explore` and `scout`. The scout must finish with a host-validated worker envelope, at least one HTTPS result reference, and a successful `tool_execution_end` for a configured evidence tool in its host-reported event log. Missing, empty, failed, or prose-only research stops before planning.
2. **Plan/command gate** — a completed planner run consumes the research digest and returns schema-valid units. `π.verifyAllowlist` remains a nonempty exact command set; paths, ownership, explicit `required_skills`, and unit overlap are validated mechanically.
3. **Implement gate** — `general` workers scale one-for-one with genuinely independent units (1–8), edit isolated worktrees, and must have completed host runs plus schema-valid envelopes. Git supplies the authoritative paths and diff; the primary reruns exact checks.
4. **Verify gate** — the verify reviewer receives captured diffs and primary command evidence. Host status, the complete envelope, and `gate.pass` must all succeed. The review role is not dispatched until this receipt exists.
5. **Review gate** — cross-review is a GLM 6+2 wave (the `review` route across the makora/umans GLM lanes), not a Sol/Opus reasoning gate. Host status, the complete envelope, and `gate.pass` must succeed before integration.
6. **Integration/goal gate** — only after same-cycle research, plan, implement, verify, and review receipts pass does the primary write reviewed bytes to ROOT and rerun checks. A failed ROOT recheck stops on `integration-failed`; it never replans from stale HEAD. `state.checkGoal` is the only success signal, and a false goal stops at `checkpoint-required`.

The in-memory ledger authorizes transitions and is reset each cycle. The CAS board mirrors normalized receipts for observability but cannot authorize a phase by itself. Child JSONL events are parsed structurally, not matched by serializer key order. Aggregate inline review evidence is capped by `team_mode.review_payload_limit_chars`; an oversized wave replans with explicit narrowing feedback before planner dispatch. This is executable enforcement inside the canonical `/team` program; it is stronger than prompting but is not a pi-fabric-core ACL. A caller that does not execute `/team` is outside this lifecycle.

## Dispatch failure triage

Fast diagnosis for child failures, in observed-signature order:

- **`No models match pattern` warnings for every custom provider (makora, umans,
  claude-bridge) while `openai-codex` resolves** — two possible causes, check in
  order:
  1. **`extensions: false` on the child (deterministic; most common).** Custom
     providers are package-based and only load when the child loads extensions.
     A child spawned with `extensions: false` cannot resolve any
     makora/umans/claude-bridge model. Fix: dispatch with `extensions: true`
     (the `fabric.json` default). See "Custom-provider child dispatch requires
     extensions:true" above. This does NOT resolve on retry — it is a flag bug.
  2. **Half-initialized provider environment (transient).** If the failure is
     instant (~5s), also carries `No API key found for <provider>`, and the
     child already had `extensions: true`, the child launched during a host
     session reload. Credentials are fine; re-spawn after the session settles.
  Disambiguate: if `extensions` was false, it is cause 1 (fix the flag, do not
  retry blindly); if `extensions` was true, it is cause 2 (retry after settle).
  Verify either fix with a one-word probe child.
- **`This extension ctx is stale after session replacement or reload`** — the
  handle was captured before a `ctx.reload()`/session replacement. Re-issue
  the call from the fresh session; the child itself may be unaffected.
- **`Fabric token limit reached`** — the hard backstop fired. Currently
  disabled (`maxTokensPerChild: 0` = unlimited). The limit is loaded at host
  startup: config edits to `maxTokensPerChild` apply only after session
  reload. There are no token budgets by operator decision; manage a genuinely runaway child manually with `agents.status`, then `agents.compact`, `agents.steer`, or `agents.stop`. Wall-clock timeouts remain finite.
- **`timed_out`** — scope too broad for the window. Narrow the file scope and
  tighten the output contract before raising `timeoutMs`.

## Limits and ownership

- `.pi/fabric.json` owns runtime limits and untyped-dispatch defaults: workflow
  fan-out of 8 (`subagents.maxConcurrent`; mirrored as
  `dispatch.max_parallel_workflow_agents` in `config.json`), `maxDepth: 1`,
  executor and subagent timeouts, output and token ceilings, and the default
  `subagents.model` used when a dispatch names no role.
- `.pi/config.json` owns role routes, models, and the direct-by-default
  dispatch policy. Delegate only for specialist knowledge, isolation, or two or
  more genuinely independent tasks.

## Fabric surface coverage

The brain uses a deliberate subset of Fabric. Coverage is explicit so the
profile can be audited against the full surface.

**Adopted (documented above):** `agents.*` lifecycle (spawn, steer, followUp,
wait, status, **create, ask, tell, actors, messages** for persistent conversing actors), `mesh` topics and the CAS board, the subagent runtime (pool,
fan-out, `maxDepth`, token ceilings), and role-routed dispatch.

**Available on demand:**

- `memory` — cross-session search over prior Pi session timelines
  (`fabric.json` `memory.enabled`). Use for recalling past decisions or
  incidents before re-deriving them.
- `mcp` — Fabric's pooled MCP provider is the primary-side research route and
  runs with dynamic servers disabled; the separate `skill-mcp` extension remains
  available for skills that declare their own scoped MCP server.
- `schema` and `state` — host-owned verification and transition control
  planes. `state.goal`/`state.checkGoal` are wired into `/team` as the goal-
  termination contract (the loop stops only when the executable predicate
  passes); `schema` is available when a task needs validated structured output
  or an auditable transition timeline.
- Bundled `fabric-*` skills shipped inside the `pi-fabric` package (advisor,
  ambient, council, exec, fusion, rlm, schema, supervisor, swarm, workflow).
  These load from the package, not `.pi/skills/` (which stays source-locked);
  load one only when its pattern clearly fits (for example `fabric-council`
  for a role-diverse advisory panel on a high-risk decision).

**Deliberately excluded (recorded decisions):** advisory fusion at the ship gate
(the final close-out check remains a single read-only reviewer; the pre-gate
multi-angle review in `/ship` is a separate, earlier step), `council.run` inside
lifecycle prompts (route-governed fan-out preserves per-role controls and leaves
synthesis with the primary), `rlm.query` for lifecycle work that fits normal
context, and `workflow.*` dashboard wiring. Persistent mailbox actors were
previously excluded and are now adopted as the conversing-actor layer (see
Conversing actors above); the primary remains sole integrator.
