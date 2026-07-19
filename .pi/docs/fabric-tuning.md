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

// spawn a bounded leaf worker (general route -> GLM 12 pool)
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
`dispatch.token_budgets`; retries follow `dispatch.retry_policy` (at most one,
fallback per `fallback_order`). The completion envelope is advisory input —
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

The nine role routes are defined in `.pi/config.json` and are the single source
of truth for per-role models and tool sets, organized by tier:

- **Supervisor (Opus 4.8):** `build` (primary — orchestrates, gates, integrates;
  delegates implementation to `general`; may edit directly for small fixes).
- **Implementation (GLM 5.2):** `general` (bounded implementation — the only role
  granted `edit`/`write`/`bash`) — Makora `zai-org/GLM-5.2-NVFP4`, alternate
  `umans/umans-glm-5.2`.
- **Reasoning (gpt-5.6-sol medium + Claude Opus/Fable):** `plan` (primary when
  driving the loop, or read-only advisory), `review` (read-only correctness/security),
  `debug` (read-only root-cause diagnosis). All read-only (`read`/`grep`/`find`/`ls`);
  they NEVER receive implementation briefs and cannot edit. Sol is the route model;
  Opus 4.8 is the per-route `alternate_model` and Fable 5 is an explicit-dispatch
  reasoning alternate — both read-only here. (Opus 4.8 is also the primary supervisor model.)
- **Small/read-only fan-out (gpt-5.4-mini + Haiku):** `explore` (local code search),
  `scout` (external research), `compaction` (support, context reduction).
- **Multimodal:** `vision` — `makora/moonshotai/Kimi-K2.7-Code`.

Do not duplicate the model table here; consult `config.json` for the exact keys
and tool allow-lists per role. Interactive skills are the union of `dispatch.leaf_excluded_skills` and
`skills/manifest.json` `primary_only.interactive` (currently brainstorming,
grill-me, and grill-with-docs). They require operator dialogue, so the
dispatcher never names them in a leaf brief. Each route also names a `contract` file under
`.pi/agents/`; the dispatcher reads it and prepends it to every worker task
(see the loop example above) so role behavior travels with the spawn.

## Implementation pool (GLM 12)

Implementation work runs GLM 5.2 across two lanes: `makora/zai-org/GLM-5.2-NVFP4`
and `umans/umans-glm-5.2` (both GLM 5.2), listed in `config.json`
`dispatch.implementation_models`; the ceiling and split live in
`dispatch.implementation_pool` (`total_workers: 12`, `makora_minimum: 6`). The
pool is "GLM 12": up to 12 concurrent GLM 5.2 workers, with **at least 6 on
makora** and the balance on umans. The balancing rule (from the `/team`
`implementWave` helper) is: fill the first six slots on makora, then fill the
remaining slots on umans (`i < 6 ? makora : umans`) — a true
6-makora-then-6-umans split, not round-robin. Both lanes are the same model, so
the split is about provider rate-limit headroom, not capability. A full 12-wide
wave lands 6 on makora and 6 on umans, satisfying the ≥6 makora floor exactly. Verified 2026-07-18: makora + umans GLM children dispatch concurrently
(4-wide test, 2 makora + 2 umans, all completed) with `extensions: true`.
Reaching a full 12-wide wave depends on makora/umans provider rate limits, which
are not yet validated at 12 concurrent — the retry/fallback in
`dispatch.retry_policy` covers a lane that rate-limits (one retry, then
`fallback_order`).

## Small-model lanes

Read-only fan-out (explore, scout, compaction support) uses small, cheap
models: `openai-codex/gpt-5.4-mini` and `claude-bridge/claude-haiku-4-5`.
`gpt-5.4-mini` is the default route for these roles; the Haiku lane is declared
per-route as `alternate_model` on `explore` and `scout` in `config.json`.
Review is not a small-model lane. The reasoning tier — `plan`, `review`, and
`debug` — runs on `openai-codex/gpt-5.6-sol` at medium thinking, with Claude
alternates `claude-bridge/claude-opus-4-8` and `claude-bridge/claude-fable-5`
(Opus 4.8 is the per-route `alternate_model`; Fable 5 is an explicit-dispatch
reasoning alternate). Both are read-only when used in the reasoning tier.
Claude models are reached only through the Claude Bridge provider — there is no
native Claude runner in this profile.

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
(openai-codex still works — it is built-in/OAuth and needs no package). Spawning
with `extensions: true` loads the packages and the models resolve (verified
2026-07-18: makora GLM, umans GLM, claude-bridge Opus all dispatch as children
with `extensions: true`, all fail with `extensions: false`).

`fabric.json` `subagents.extensions` defaults to `true`, so normal dispatch and
persistent actors resolve custom providers correctly. RULE: never set
`extensions: false` on a child (subagent or actor) that runs a
makora/umans/claude-bridge model — restrict tools with the `tools` allow-list
instead if you want a lean child. openai-codex-only children may use
`extensions: false` for a lighter, faster launch.

## LocalTerm-first subagent transport

`.pi/fabric.json` sets `subagents.transport` to `auto`. Fabric resolves
`auto` in this order: **LocalTerm → tmux → screen → process**. LocalTerm is
available only when the `localterm` executable is on the Pi host's `PATH`
and `localterm session ls --json` succeeds; otherwise dispatch falls through
without reducing the configured 12-child ceiling. A call may still override the
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

- **Topic** `fabric-pi-<slug>` — carries assignments and addressed actor requests. The fixed `team-architect` and `team-risk` crew actors answer addressed requests at bounded checkpoints: one analysis + one cross-review hop before planning (gating input), plus one advisory post-plan plan-review turn and one advisory post-implement risk pass. One addressed turn per actor per checkpoint; no standing subscription.
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
  re-dispatches per `dispatch.retry_policy` (at most one retry, then
  `fallback_order`: role `alternate_model`, then `implementation_models`
  order). Do not delete a dead run's worktree branch, or invoke any branch
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

Authority preserved: actors collaborate and converse, but the **primary remains the sole board writer and integrator**. `/team` reuses a fixed read-only roster (`team-architect`, `team-risk`) and sends addressed events on the dynamic run topic; actors have no default subscriptions, which avoids ambient feedback loops. Each run permits bounded addressed checkpoints — one analysis turn and one cross-review hop before planning (gating), then one advisory post-plan turn and one advisory post-implement turn — always addressed, never an ambient subscription. Actors are never automatically removed because removal deletes retained actor state. Outside explicit `/team`, direct-first still applies.

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
2. **Collaboration gate** — fixed read-only `team-architect` and `team-risk` crew actors receive addressed run-topic messages: one analysis + one cross-review response before planning (gating), plus advisory post-plan (plan-review) and post-implement (risk pass) turns whose message IDs are recorded to the board's advisory mirror. Advisory turns never gate — only host run receipts do. No default topic subscription or automatic actor deletion is used.
3. **Plan/command gate** — a completed Sol planner run consumes the research/actor digest and returns schema-valid units. `π.verifyAllowlist` remains a nonempty exact command set; paths, ownership, explicit `required_skills`, and unit overlap are validated mechanically.
4. **Implement gate** — `general` workers scale one-for-one with genuinely independent units (1–12), edit isolated worktrees, and must have completed host runs plus schema-valid envelopes. Git supplies the authoritative paths and diff; the primary reruns exact checks.
5. **Verify gate** — Sol receives captured diffs and primary command evidence. Host status, the complete envelope, and `gate.pass` must all succeed. Opus is not dispatched until this receipt exists.
6. **Review gate** — Opus independently checks the same evidence. Host status, complete envelope, and `gate.pass` must succeed before integration.
7. **Integration/goal gate** — only after same-cycle research, collaboration, plan, implement, verify, and review receipts pass does the primary write reviewed bytes to ROOT and rerun checks. A failed ROOT recheck stops on `integration-failed`; it never replans from stale HEAD. `state.checkGoal` is the only success signal, and a false goal stops at `checkpoint-required`.

The in-memory ledger authorizes transitions and is reset each cycle. The CAS board mirrors normalized receipts for observability but cannot authorize a phase by itself. Child JSONL events are parsed structurally, not matched by serializer key order. Aggregate inline review evidence is capped by `team_mode.review_payload_limit_chars`; an oversized wave replans with explicit narrowing feedback before Sol dispatch. This is executable enforcement inside the canonical `/team` program; it is stronger than prompting but is not a pi-fabric-core ACL. A caller that does not execute `/team` is outside this lifecycle.

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
  fan-out of 12 (`subagents.maxConcurrent`; mirrored as
  `dispatch.max_parallel_workflow_agents` in `config.json`), `maxDepth: 1`,
  executor and subagent timeouts, output and token ceilings, and the default
  `subagents.model` used when a dispatch names no role.
- `.pi/config.json` owns role routes, models, and dispatch policy
  (`dispatch.default` stays `direct`; `delegate_when` governs when the brain
  loop engages).

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
