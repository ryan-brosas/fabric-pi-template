---
description: Run a supervised agent team through the full lifecycle (plan -> implement -> verify -> review), looping until a goal predicate passes
argument-hint: "<goal>"
agent: build
---

> **Pi execution binding:** The TypeScript blocks below run inside `fabric_exec`.
> `pi.*` are core tools; `tools.call({ ref, args })` invokes Fabric providers
> (`agents.*`, `mesh.*`, `state.*`, `schema.*`). This prompt drives a real team: the primary
> session (Opus 4.8 high, the supervisor + sole integrator) plans, dispatches
> teammates, steers drift, gates every phase, and integrates only after reading
> diffs and verifying. Implementation teammates run GLM 5.2 (the `general` route:
> `makora/zai-org/GLM-5.2-NVFP4` + `umans/umans-glm-5.2`, up to 12 concurrent);
> reasoning teammates (plan/verify) run `openai-codex/gpt-5.6-sol`; the reviewer
> runs `claude-bridge/claude-opus-4-8`. Any child on a custom provider MUST use
> `extensions: true` (the default). See `.pi/docs/fabric-tuning.md`.

# Team

## Operator goal

<operator_goal>
$ARGUMENTS
</operator_goal>

The text inside `<operator_goal>` is the authoritative goal for this run. The
fabric_exec invocation supplies it to the code as the named string `π.goal`, and
the primary-derived executable predicate as `π.goalCheck` — so the program below
reads those names directly and never hand-pastes the goal or interpolates raw
operator input into a shell string. If `π.goal` is empty, stop before creating
state or dispatching and ask the operator for the goal. Never silently replace
it with a placeholder.

Stand up a supervised team and run the whole lifecycle over and over until the
operator goal is met. `/team "<goal or idea>"`.

> **Workflow:** `/team "<goal>"` (self-contained: research -> mesh collaboration -> plan -> implement -> verify -> review -> loop)

## Guardrails (non-negotiable)

1. **Primary is the sole integrator.** Teammate output is untrusted until the
   primary (you) reads the diff and runs verification. A teammate's "done" is
   never proof. You integrate; teammates propose. Integration is a write to ROOT
   of the exact files the primary read from a passed worker's worktree — never a
   worker writing to ROOT, never an unverified file.
2. **Goal-terminated.** The loop runs until an executable goal predicate passes
   (`state.goal` / `state.checkGoal`), OR a hard cap trips. Never loop unbounded.
3. **Hard caps (runaway backstop).** The enforced stops are `MAX_CYCLES`, one retry per eligible task, and each teammate's finite `timeoutMs`. Token ceilings are disabled (`0` = unlimited) by operator decision. `agents.stop` / `ActorManager.haltAll()` remain manual kill switches.
4. **Ask before externally visible actions.** Never commit, push, or run
   destructive ops without operator confirmation (per `AGENTS.md`). Never delete
   or clean up a worktree (failed or not) without explicit operator permission.
5. **Leaves only.** Teammates are `maxDepth: 1`; they message and report, they do
   not spawn. You are the only orchestrator.
6. **Verify allowlist (command execution gate).** `π.verifyAllowlist` is a
   nonempty JSON `string[]` of primary-approved commands. `GOAL_CHECK` and every
   planner unit `verify` string MUST be EXACT members of it before any dispatch
   or `pi.bash` runs them; a nonmember is rejected, never heuristic-sanitized,
   never executed. Primary-controlled plumbing (`git status`, `git rev-parse` /
   `rev-parse HEAD`, `git diff`, `git add -N -- <path>`, the `cd <worktree>`
   wrapper) is fixed by the primary, not chosen by the planner/operator, so it is
   not allowlist-gated — only the verify/goal-check commands are. The
   allowlist must include the canonical quality-pack commands (`node
   .pi/tools/quality/run-pack.mjs --staged` and the explicit-paths ROOT
   re-run) so unit verifies can reference them as exact members.
7. **Mandatory role and research gate.** Every cycle MUST run one local `explore` researcher and one external `scout`, then the two fixed read-only mesh crew actors (`team-architect`, `team-risk`). The crew participates at bounded, addressed checkpoints: one analysis turn plus one cross-review hop before planning (the gating pre-plan collaboration), one advisory post-plan plan-review turn before dispatch, and one advisory post-implement risk pass on the captured diffs. Each is a single addressed turn per actor over the run topic (no standing topic subscription, so no ambient feedback loop); the post-plan and post-implement turns are ADVISORY only — they inform the primary and the Opus reviewer but never authorize a phase transition, which still requires same-cycle host run receipts. The scout must have a host-observed successful `tool_execution_end` for an approved external research tool (`codex_search`, `context7`, or `grepsearch`) and at least one URL result reference. Worker prose cannot satisfy this gate. Every later phase requires same-cycle host receipts; Sol must pass before Opus is dispatched. Twelve implementers are capacity, not a target: dispatch exactly one per genuinely independent owned unit.
8. **Clean Git target, fail closed.** Before any `state.*` / `agents.*` / `mesh.*`
   call, ROOT must be a Git work tree with a clean working tree (no tracked or
   untracked changes) and a recorded `HEAD`. Not Git, or dirty -> refuse to
   start. Workers edit isolated worktrees (branched from `HEAD`), so ROOT stays
   clean until the primary integrates a fully-gated wave. A worker that commits
   advances its worktree `HEAD` (hiding a clean status) or leaves an
   unmerged/conflict status is rejected at the gate — its `HEAD` must equal the
   saved ROOT `HEAD`.

## Phase 0 - Setup

> **Fail closed first.** `π.goal` carries the operator goal supplied by the
> fabric_exec invocation; `π.goalCheck` carries the primary-derived executable
> predicate; `π.verifyAllowlist` carries the JSON `string[]` of primary-approved
> commands. If `π.goal` is empty, STOP — do not call `state.*`, `mesh.*`, or
> `agents.*`. Ask the operator for the goal. The whole run depends on `GOAL`
> below; never fabricate a placeholder.

```typescript
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const slug = 'team-' + Date.now().toString(36);            // stable work slug
const topic = 'fabric-pi-' + slug;
const board = 'fabric-pi/' + slug + '/board';
const STAGE_DIR = ROOT + '/.pi/artifacts/team-' + slug;            // operator review-trail dir (gitignored)
const MAX_CYCLES = 5;                                        // hard cap
const laneBudget = cfg.dispatch.token_budgets;              // 0 means unlimited
const TOTAL_BUDGET = 0;                                   // operator decision: no token ceiling
const teamPolicy = cfg.team_mode;
const workerSchema = JSON.parse(String(await pi.read(ROOT + '/.pi/schemas/worker-result.json')));
const manifest = JSON.parse(String(await pi.read(ROOT + '/.pi/skills/manifest.json')));
const DIFF_LIMIT = 200_000;                                // per-unit unified diff ceiling
const REVIEW_PAYLOAD_LIMIT = teamPolicy.review_payload_limit_chars; // aggregate inline evidence ceiling per Sol/Opus pass

// CLEAN-GIT STARTUP GATE — fail closed before any state/agents/mesh call. The
// operator must hand over a clean Git target; workers later edit isolated
// worktrees (branched from HEAD) so ROOT stays clean until the primary
// integrates a fully-gated wave. Not a Git work tree, or any tracked/untracked
// change present -> refuse to start. (These are primary-controlled git plumbing
// commands, not allowlist-gated verify/goal-check strings.)
async function gitRepoClean() {
  const inside = await pi.bash({ cmd: 'git -C ' + ROOT + ' rev-parse --is-inside-work-tree', timeoutMs: 30000 });
  if (!inside.ok || String(inside.output).trim() !== 'true') return { ok: false, reason: 'ROOT is not a Git work tree' };
  const st = await pi.bash({ cmd: 'git -C ' + ROOT + ' status --porcelain=v1 -z --untracked-files=all', timeoutMs: 30000 });
  if (!st.ok) return { ok: false, reason: 'git status failed' };
  if (String(st.output).length > 0) return { ok: false, reason: 'working tree dirty (tracked or untracked changes present)' };
  return { ok: true };
}
const clean = await gitRepoClean();
if (!clean.ok) throw new Error('clean-Git gate failed: ' + clean.reason + ' — hand over a clean Git target before /team');
// Capture ROOT HEAD. Implementation worktrees branch from this commit; a worker
// that commits advances its worktree HEAD and would hide a clean working tree,
// so any worktree whose HEAD differs from ROOT_HEAD is rejected at the gate.
const rootHeadRes = await pi.bash({ cmd: 'git -C ' + ROOT + ' rev-parse HEAD', timeoutMs: 30000 });
if (!rootHeadRes.ok) throw new Error('cannot read ROOT HEAD');
const ROOT_HEAD = String(rootHeadRes.output).trim();

// GOAL, GOAL_CHECK, and the VERIFY ALLOWLIST arrive as Fabric named strings:
// π.goal is the exact operator goal text (the substance of <operator_goal>
// above). π.goalCheck is the primary-derived executable shell predicate that
// exits 0 only when the goal is really met (a test, build, or artifact grep).
// π.verifyAllowlist is a JSON string[] of primary-approved verify/goal-check
// commands. The fabric_exec invocation supplies all three by name, so the code
// never hand-pastes the goal and never interpolates raw operator input into a
// shell string — no manual code paste, no unsafe raw argument interpolation
// remains. All three are required and non-empty before any state or dispatch:
// fail closed, never guess.
const GOAL = typeof π.goal === 'string' ? π.goal.trim() : '';
const GOAL_CHECK = typeof π.goalCheck === 'string' ? π.goalCheck.trim() : '';
const RAW_ALLOW = typeof π.verifyAllowlist === 'string' ? π.verifyAllowlist : '';
if (!GOAL) throw new Error('empty operator goal (π.goal) - ask the operator, do not dispatch');
if (!GOAL_CHECK) throw new Error('empty goal predicate (π.goalCheck) - loop cannot terminate honestly');
if (!RAW_ALLOW) throw new Error('empty verify allowlist (π.verifyAllowlist) - cannot gate dispatch');

// Parse the allowlist once. Exact members only; never heuristic-sanitize.
let ALLOW_LIST;
try { ALLOW_LIST = JSON.parse(RAW_ALLOW); } catch (e) { throw new Error('π.verifyAllowlist is not valid JSON'); }
if (!Array.isArray(ALLOW_LIST) || ALLOW_LIST.length === 0) throw new Error('π.verifyAllowlist must be a nonempty JSON string[]');
for (const a of ALLOW_LIST) if (typeof a !== 'string' || a.length === 0) throw new Error('π.verifyAllowlist entries must be nonempty strings');
const ALLOW = new Set(ALLOW_LIST.map(String));

// A verify/goal-check command may run via pi.bash only if it is an EXACT member
// of the allowlist. GOAL_CHECK and every planner unit verify string must be
// members before any dispatch or pi.bash; nonmembers are rejected, never
// sanitized, never executed. (Primary-controlled git plumbing — `status`,
// `rev-parse`, `diff`, `add -N`, `cd <worktree>` — is NOT gated here; only the
// verify/goal-check commands chosen by planner/operator are allowlist-gated.)
function mustAllow(cmd, label) {
  const c = String(cmd);
  if (!ALLOW.has(c)) throw new Error('allowlist rejected ' + label + ': not an exact member (never sanitized): ' + c);
  return c;
}
mustAllow(GOAL_CHECK, 'GOAL_CHECK');

await tools.call({ ref: 'state.goal', args: {
  description: GOAL,
  check: GOAL_CHECK,
} });

// Create the shared board (create-only; ifVersion 0).
await tools.call({ ref: 'mesh.put', args: {
  key: board, ifVersion: 0,
  value: { slug, cycle: 0, phase: 'research', tasks: {}, evidence: {}, status: 'running' },
} });

await stageArtifact('create', 0, 'Create — run contract',
  '## Run contract (operator /create)\n\n```\ngoal: ' + GOAL + '\npredicate: ' + GOAL_CHECK + '\nverify_allowlist: ' + JSON.stringify([...ALLOW]) + '\n```');
```

## Phase helpers - dispatch and gate

Every dispatch resolves the role from `config.json` and injects the role
contract from `.pi/agents/`. Custom-provider children use `extensions: true`.
Implementation (general) children run in an isolated Fabric worktree
(`worktree: true`); reasoning (plan/verify/review) stays read-only in main.

```typescript
async function contractFor(role) {
  const route = cfg.role_routes[role];
  const body = String(await pi.read(ROOT + '/' + route.contract));
  return { route, body };
}

// One-shot teammate on a role route; returns the completed run record. Pass
// worktree:true ONLY for implementation (general) children; reasoning children
// stay read-only in main. result.worktree is the authoritative worktree path.
async function run(role, assignment, modelOverride, label, worktree) {
  const { route, body } = await contractFor(role);
  const task = body + '\n\n---\n\n' + assignment +
    '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json' +
    ' (status, changed_paths, checks_run, stop_reason).';
  return await tools.call({ ref: 'agents.run', args: {
    name: (label || role) + '-' + slug, runner: 'pi',
    model: modelOverride || route.model,
    thinking: route.thinking, tools: route.tools, schema: workerSchema,
    extensions: true, worktree: worktree === true, timeoutMs: 900000, task,
  } });
}

// Governed implementation dispatch: agents.spawn returns a handle immediately,
// the primary polls agents.status on a bounded interval (coordination
// poll_interval_ms, capped at 15s for responsiveness) and steers a child still
// running near its deadline ("wrap up now") — making agents.steer (and
// agents.compact, for a context-heavy child) reachable MID-FLIGHT instead of
// prose-only kill switches — then agents.wait joins the same completed run
// record agents.run would return. Reasoning roles keep the synchronous run();
// only implementation children (general, isolated worktree) are governed.
async function runGoverned(role, assignment, modelOverride, label) {
  const { route, body } = await contractFor(role);
  const task = body + '\n\n---\n\n' + assignment +
    '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json' +
    ' (status, changed_paths, checks_run, stop_reason).';
  const TIMEOUT_MS = 900000;
  const spawned = await tools.call({ ref: 'agents.spawn', args: {
    name: (label || role) + '-' + slug, runner: 'pi',
    model: modelOverride || route.model,
    thinking: route.thinking, tools: route.tools, schema: workerSchema,
    extensions: true, worktree: true, timeoutMs: TIMEOUT_MS, task,
  } });
  const started = Date.now();
  let steered = false;
  const poll = Math.min(Number(cfg.coordination.poll_interval_ms) || 60000, 15000);
  for (;;) {
    const st = await tools.call({ ref: 'agents.status', args: { id: spawned.id } });
    const s = String((st && st.status) || '');
    if (s && s !== 'running' && s !== 'pending' && s !== 'starting') break;
    if (!steered && Date.now() - started > TIMEOUT_MS * 0.8) {
      steered = true;
      try { await tools.call({ ref: 'agents.steer', args: { id: spawned.id,
        message: 'Deadline near: stop exploring, wrap up, and end with the required worker-result JSON envelope now.' } }); } catch (_) {}
    }
    await new Promise(resolve => setTimeout(resolve, poll));
  }
  return await tools.call({ ref: 'agents.wait', args: { id: spawned.id } });
}

// Extract the last JSON object from a worker/report text, even when it is
// wrapped in a markdown ``` fence. Scans forward with string/escape awareness so
// braces inside strings do not confuse depth, and returns the LAST balanced
// top-level object. Throws if none/malformed. This lets the generic
// worker-envelope instruction (end with a worker-result object) and a role's
// own final-object instruction coexist: the last object wins, so they do not
// conflict.
function trailingJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '').trimEnd();
  let depth = 0, inStr = false, esc = false, start = -1;
  let lastStart = -1, lastEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0) { lastStart = start; lastEnd = i; } }
  }
  if (lastStart < 0) throw new Error('no trailing JSON object in report');
  return JSON.parse(s.slice(lastStart, lastEnd + 1));
}
// Same-cycle receipts (in-memory) plus a durable state ledger. The board
// mirrors receipts for observability; receipts authorize same-cycle phase
// advancement, and every recorded receipt is ALSO chained into the durable
// Fabric state ledger (state.transition, CAS-guarded via from/to labels) so
// the phase history survives the invocation and is auditable and re-runnable
// across cycles and runs (state.history / state.verify).
let phaseEvidence = { cycle: 0, receipts: {} };
const PHASE_DEPS = {
  plan: ['research', 'collaboration'],
  implement: ['research', 'collaboration', 'plan'],
  verify: ['research', 'collaboration', 'plan', 'implement'],
  review: ['verify'],
  integrate: ['verify', 'review'],
  goal: ['integrate'],
  done: ['goal'],
};

function startCycleEvidence(cycle) {
  phaseEvidence = { cycle, receipts: {} };
}

function requireEvidence(nextPhase) {
  const deps = PHASE_DEPS[nextPhase] || [];
  for (const phase of deps) {
    const receipt = phaseEvidence.receipts[phase];
    if (!receipt || receipt.cycle !== phaseEvidence.cycle || receipt.pass !== true) {
      throw new Error('phase gate blocked ' + nextPhase + ': missing/failed same-cycle ' + phase + ' receipt');
    }
  }
}

// Durable CAS-guarded phase ledger. Each receipt chains a state.transition
// whose `from` must equal the observed head label; on a from-mismatch (a
// concurrent session moved the head) the primary re-observes the real head
// once and chains from it — never force, never fork. Evidence entries are
// trusted shell commands that state.verify can re-run later.
let LEDGER_HEAD = '';
async function ledgerInit() {
  const s = await tools.call({ ref: 'state.get', args: {} });
  LEDGER_HEAD = s && s.head && s.head.to ? String(s.head.to) : '';
}
async function ledgerTransition(phase, summary, evidence) {
  const to = slug + '/c' + phaseEvidence.cycle + '/' + phase;
  const args = { label: 'team ' + phase, to, summary: String(summary).slice(0, 400) };
  if (Array.isArray(evidence) && evidence.length) args.evidence = evidence.map(String);
  try {
    await tools.call({ ref: 'state.transition', args: LEDGER_HEAD ? { ...args, from: LEDGER_HEAD } : args });
  } catch (_) {
    const s = await tools.call({ ref: 'state.get', args: {} });
    const observed = s && s.head && s.head.to ? String(s.head.to) : '';
    await tools.call({ ref: 'state.transition', args: observed ? { ...args, from: observed } : args });
  }
  LEDGER_HEAD = to;
}

async function recordEvidence(phase, receipt, ledgerEvidence) {
  const normalized = { ...receipt, cycle: phaseEvidence.cycle, pass: receipt.pass === true };
  phaseEvidence.receipts[phase] = normalized;
  const cur = await tools.call({ ref: 'mesh.get', args: { key: board } });
  await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: cur.version,
    value: { ...cur.value, phase, evidence: { ...(cur.value.evidence || {}), [phase]: normalized } } } });
  await ledgerTransition(phase, phase + ' receipt cycle ' + phaseEvidence.cycle + ': pass=' + normalized.pass, ledgerEvidence);
  return normalized;
}

// Operator review trail. Maps the internal lifecycle onto the named operator
// process (create -> research -> plan -> ship -> verify) and writes ONE
// human-readable markdown per stage under the gitignored STAGE_DIR. Best-effort:
// a write failure NEVER blocks a phase transition or changes any gate.
async function stageArtifact(stage, stageCycle, title, body) {
  try {
    await pi.bash({ cmd: 'mkdir -p ' + shellQuote(STAGE_DIR), timeoutMs: 30000 });
    const md = '# ' + title + '\n\n- stage: ' + stage + '\n- cycle: ' + stageCycle + '\n- goal: ' + GOAL + '\n- generated: ' + new Date().toISOString() + '\n\n' + body + '\n';
    await pi.write({ path: STAGE_DIR + '/c' + stageCycle + '-' + stage + '.md', text: md });
  } catch (_) { /* review trail is best-effort; never gate on it */ }
}

async function markBlocked(phase, error) {
  const reason = String(error && (error.message || error) || 'unknown failure');
  const cur = await tools.call({ ref: 'mesh.get', args: { key: board } });
  await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: cur.version,
    value: { ...cur.value, cycle: phaseEvidence.cycle, phase, status: phase + '-blocked: ' + reason } } });
}

// Require host completion and a full worker-result envelope. Structured output
// is also host-validated by agents.run(schema), but the primary rechecks the
// fields and read-only invariant before recording a receipt.
function requireCompletedRun(result, role, expectedModel, readOnly) {
  if (!result || result.status !== 'completed') throw new Error(role + ' run did not complete: ' + String(result && result.status));
  if (result.runner !== 'pi') throw new Error(role + ' used unexpected runner: ' + String(result.runner));
  if (expectedModel && result.model !== expectedModel) throw new Error(role + ' used unexpected model: ' + String(result.model));
  const env = result.value && typeof result.value === 'object' ? result.value : trailingJson(result.text);
  if (!env || env.status !== 'done') throw new Error(role + ' envelope status is not done');
  if (!Array.isArray(env.changed_paths) || !Array.isArray(env.checks_run) || typeof env.stop_reason !== 'string') {
    throw new Error(role + ' envelope missing required fields');
  }
  if (readOnly && env.changed_paths.length !== 0) throw new Error(role + ' read-only run reported changed paths');
  if (env.checks_run.length === 0) throw new Error(role + ' envelope has no evidence checks');
  return env;
}

function safeRunLog(result) {
  const p = String(result && result.logFile || '');
  if (!/^\/(?:data\/)?tmp\/pi-fabric-runs-[A-Za-z0-9._-]+\/[a-f0-9]{32}\/events\.jsonl$/.test(p)) {
    throw new Error('unsafe or missing host run log path');
  }
  if (p.indexOf('/' + String(result.id) + '/') === -1) throw new Error('run log path does not match child id');
  return p;
}

// Prove successful external retrieval from the host-generated child event log.
// A worker saying "I researched" is insufficient: the log must contain a
// successful tool_execution_end for an approved tool.
async function successfulResearchTools(result) {
  const log = safeRunLog(result);
  const allowed = teamPolicy.research_evidence_tools.map(String);
  for (const name of allowed) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('invalid configured research tool name');
  // Primary-fixed plumbing parses each complete JSONL event, so whitespace/key
  // order and large tool results cannot create false negatives. Both argv values
  // are validated/JSON-encoded and shell-quoted; no model text enters the command.
  const parser = "const fs=require('fs');const allowed=new Set(JSON.parse(process.argv[1]));const found=new Set();for(const line of fs.readFileSync(process.argv[2],'utf8').split('\\n')){try{const e=JSON.parse(line);if(e.type==='tool_execution_end'&&allowed.has(e.toolName)&&e.isError===false)found.add(e.toolName)}catch{}}process.stdout.write(JSON.stringify([...found]));";
  const parsed = await pi.bash({ cmd: 'node -e ' + shellQuote(parser) + ' ' + shellQuote(JSON.stringify(allowed)) + ' ' + shellQuote(log), timeoutMs: 30000 });
  if (!parsed.ok) throw new Error('research gate: host log parser failed');
  let found; try { found = JSON.parse(String(parsed.output)); } catch (_) { throw new Error('research gate: malformed host log parser output'); }
  if (!Array.isArray(found) || found.length === 0) throw new Error('research gate: no successful approved external tool call in host log');
  return found;
}

function verifiedUrlRefs(env) {
  const refs = Array.isArray(env.result_refs) ? env.result_refs : [];
  return refs.filter(r => r && /^https:\/\/[^\s]+$/.test(String(r.uri || ''))).map(r => String(r.uri));
}

async function runResearchWave(cycle) {
  const localTask = 'required_skills: []\nCycle ' + cycle + '. Goal: ' + GOAL + '. Inspect the local repository for relevant architecture, constraints, prior art, and likely affected paths. Read only. Put concise findings in notes and list every inspection in checks_run.';
  const externalTask = 'required_skills: []\nCycle ' + cycle + '. Goal: ' + GOAL + '. Perform current external research before planning. You MUST successfully call at least one of ' + JSON.stringify(teamPolicy.research_evidence_tools) + '. Prefer official documentation and source. Put findings in notes, and put every verified source URL in result_refs as {uri,kind:"url",description}. If retrieval is unavailable or empty, return status blocked; never infer from memory.';
  const pair = await Promise.all([
    run('explore', localTask, undefined, 'research-local'),
    run('scout', externalTask, undefined, 'research-external'),
  ]);
  const localEnv = requireCompletedRun(pair[0], 'explore research', cfg.role_routes.explore.model, true);
  const externalEnv = requireCompletedRun(pair[1], 'scout research', cfg.role_routes.scout.model, true);
  const usedTools = await successfulResearchTools(pair[1]);
  const urls = verifiedUrlRefs(externalEnv);
  if (urls.length < teamPolicy.research_min_url_refs) throw new Error('research gate: insufficient verified URL refs');
  return {
    pass: true,
    local_run_id: pair[0].id,
    external_run_id: pair[1].id,
    successful_tools: usedTools,
    urls,
    digest: JSON.stringify({ local: localEnv.notes || localEnv.checks_run, external: externalEnv.notes || externalEnv.checks_run, urls }).slice(0, 60000),
  };
}

async function ensureTeamActors() {
  const actorCfg = cfg.actors;
  const actorContract = String(await pi.read(ROOT + '/' + actorCfg.contract));
  const roles = [
    { name: 'team-architect', note: 'Analyze architecture, dependencies, and the smallest coherent design.' },
    { name: 'team-risk', note: 'Challenge assumptions, identify bypasses and edge cases, and propose fail-closed mitigations.' },
  ];
  const listed = await tools.call({ ref: 'agents.actors', args: {} });
  const out = [];
  for (const role of roles) {
    let actor = (Array.isArray(listed) ? listed : []).find(a => a.name === role.name);
    if (actor) {
      if (actor.status === 'stopped') throw new Error('required actor is stopped; do not auto-delete/recreate: ' + role.name);
      if (actor.runner !== 'pi' || actor.delivery !== 'mailbox' || actor.triggerTurn !== false) throw new Error('required actor has unsafe configuration: ' + role.name);
      if ((actor.tools || []).some(t => t === 'edit' || t === 'write' || t === 'bash')) throw new Error('required actor has mutation tools: ' + role.name);
      if ((actor.topics || []).includes('fabric.actor.output')) throw new Error('required actor subscribes to feedback-loop topic: ' + role.name);
    } else {
      actor = await tools.call({ ref: 'agents.create', args: {
        name: role.name,
        instructions: actorContract + '\n\nTeam-specific role: ' + role.note + '\nReply only to the addressed run request. Never write mesh state, never publish follow-on events, and never integrate.',
        events: [], topics: [], delivery: 'mailbox', responseMode: 'text', triggerTurn: false, coalesce: true,
        runner: 'pi', model: actorCfg.model, thinking: actorCfg.thinking, tools: actorCfg.tools, timeoutMs: 180000,
      } });
    }
    out.push(actor);
  }
  return out;
}

async function addressedActorTurn(actor, kind, data) {
  const before = await tools.call({ ref: 'agents.messages', args: { id: actor.id, limit: 100 } });
  const seen = new Set((Array.isArray(before) ? before : []).map(m => m.id));
  const event = await tools.call({ ref: 'mesh.publish', args: { topic, to: actor.id, kind, data } });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const messages = await tools.call({ ref: 'agents.messages', args: { id: actor.id, limit: 100 } });
    const reply = (Array.isArray(messages) ? messages : []).find(m => m.direction === 'out' && m.source === 'mesh:' + topic && !seen.has(m.id) && m.createdAt >= event.createdAt);
    if (reply) {
      if (reply.error || !reply.text) throw new Error('actor failed to answer: ' + actor.name);
      return { actor_id: actor.id, actor_name: actor.name, message_id: reply.id, text: String(reply.text).slice(0, 30000) };
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('actor response timeout: ' + actor.name);
}

async function runMeshCollaboration(cycle, research) {
  const actors = await ensureTeamActors();
  const first = await Promise.all(actors.map(actor => addressedActorTurn(actor, 'team.analysis', {
    run_id: slug, cycle, hop: 0, goal: GOAL, research: research.digest,
  })));
  const second = await Promise.all(actors.map((actor, i) => addressedActorTurn(actor, 'team.cross-review', {
    run_id: slug, cycle, hop: 1, goal: GOAL, peer: first[1 - i].text,
    instruction: 'Cross-review the peer once. Return actionable agreements, disagreements, and blockers; do not send another message.',
  })));
  return {
    pass: true,
    actors: actors.map(a => a.id),
    message_ids: [...first, ...second].map(m => m.message_id),
    digest: JSON.stringify({ first, cross_review: second }).slice(0, 80000),
  };
}

// --- Standing crew: bounded advisory checkpoints (NEVER gate). ---
// The crew (team-architect, team-risk) already persists across runs; these
// helpers let it participate at post-plan and post-implement via ONE addressed
// turn each, writing only the board's advisory mirror. They MUST NOT call
// recordEvidence/requireEvidence — only host run receipts gate phase transitions,
// and they use bounded addressed turns (no standing topic subscription).
async function crewPlanCheck(cycle, units, collaborationDigest) {
  const cp = ((cfg.team_mode.collaboration || {}).checkpoints || {}).post_plan;
  if (!cp || cp.advisory !== true) return '';
  const actors = (await ensureTeamActors()).filter(a => cp.actors.includes(a.name));
  if (actors.length === 0) return '';
  const turns = await Promise.all(actors.map(actor => addressedActorTurn(actor, 'team.plan-review', {
    run_id: slug, cycle, hop: 0, goal: GOAL,
    units: JSON.stringify(units).slice(0, 60000),
    prior: collaborationDigest,
    instruction: 'ADVISORY sanity-check of the planned units before dispatch. Flag path overlap, missing/weak verifies, risky ownership, or gaps. One reply; do not send another message.',
  })));
  const digest = JSON.stringify(turns.map(t => ({ actor: t.actor_name, text: t.text }))).slice(0, 60000);
  const cur = await tools.call({ ref: 'mesh.get', args: { key: board } });
  await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: cur.version,
    value: { ...cur.value, advisory: { ...(cur.value.advisory || {}), plan_review: { cycle, message_ids: turns.map(t => t.message_id) } } } } });
  return digest;
}

async function crewDiffCheck(cycle, diffsPayload) {
  const cp = ((cfg.team_mode.collaboration || {}).checkpoints || {}).post_implement;
  if (!cp || cp.advisory !== true) return '';
  const actors = (await ensureTeamActors()).filter(a => cp.actors.includes(a.name));
  if (actors.length === 0) return '';
  const turns = await Promise.all(actors.map(actor => addressedActorTurn(actor, 'team.diff-review', {
    run_id: slug, cycle, hop: 0, goal: GOAL,
    diffs: String(diffsPayload).slice(0, 60000),
    instruction: 'ADVISORY risk pass on the integrated-candidate diffs: name concrete correctness/security/edge-case concerns with path:line. One reply; do not send another message.',
  })));
  const digest = JSON.stringify(turns.map(t => ({ actor: t.actor_name, text: t.text }))).slice(0, 40000);
  const cur = await tools.call({ ref: 'mesh.get', args: { key: board } });
  await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: cur.version,
    value: { ...cur.value, advisory: { ...(cur.value.advisory || {}), diff_review: { cycle, message_ids: turns.map(t => t.message_id) } } } } });
  return digest;
}

// Retire finished AUTO-generated /team run boards from prior runs. Never touches
// the active board, hand-authored initiative boards, or a live/non-terminal board.
// CAS-deletes with the version mesh.list returns inline. Best-effort: on doubt, keep.
async function cleanupStaleBoards(activeBoardKey) {
  if (!((cfg.team_mode.collaboration || {}).board_retention || {}).delete_finished) return;
  const AUTO_SLUG = /^fabric-pi\/team-[0-9a-z]{5,12}\/board$/;
  let listed;
  try { listed = await tools.call({ ref: 'mesh.list', args: { prefix: 'fabric-pi/team-', limit: 500 } }); }
  catch (_) { return; }
  const entries = Array.isArray(listed) ? listed : (listed && listed.entries) || [];
  for (const e of entries) {
    const key = typeof e === 'string' ? e : (e && e.key);
    if (typeof key !== 'string' || key === activeBoardKey || !AUTO_SLUG.test(key)) continue;
    const v = e && e.value;
    const terminal = v && (v.phase === 'done' || v.status === 'goal-met');
    const live = v && (v.status === 'alive' || v.status === 'running' || (v.phase && v.phase !== 'done'));
    if (terminal && !live && typeof e.version === 'number') {
      try { await tools.call({ ref: 'mesh.delete', args: { key, ifVersion: e.version } }); } catch (_) {}
    }
  }
}

// Strict repo-relative path normalizer. Rejects anything that could escape
// ROOT or break path semantics: absolute paths, drive letters, backslashes,
// NUL, empty strings, empty segments (leading/trailing/double slash), and
// '.'/'..' traversal. With no absolute prefix and no traversal, the path cannot
// escape ROOT; returns the validated relative path.
function normalizeRepoPath(p) {
  const s = String(p);
  if (s.length === 0) throw new Error('normalizeRepoPath: empty path');
  if (s.indexOf('\0') !== -1) throw new Error('normalizeRepoPath: NUL in path');
  if (s.indexOf('\\') !== -1) throw new Error('normalizeRepoPath: backslash in path');
  if (s.charCodeAt(0) === 47) throw new Error('normalizeRepoPath: absolute path');
  if (/^[A-Za-z]:/.test(s)) throw new Error('normalizeRepoPath: drive-letter path');
  const segs = s.split('/');
  for (const seg of segs) {
    if (seg === '') throw new Error('normalizeRepoPath: empty segment');
    if (seg === '.' || seg === '..') throw new Error('normalizeRepoPath: dot/traversal segment');
  }
  return s;
}

// Is rel inside one of the owned path roots (exact or nested)?
function insideOwned(rel, owned) {
  for (const q of owned) {
    if (rel === q || rel.startsWith(q + '/')) return true;
  }
  return false;
}

// A worktree path comes from Fabric (result.worktree). Validate it strictly
// before it is ever placed in a shell command: absolute, safe characters only,
// no traversal. Fabric worktrees live under the system tmpdir.
function safeWorktree(wt) {
  const s = String(wt || '');
  if (!s) throw new Error('empty worktree path');
  if (!/^\/[A-Za-z0-9._/-]+$/.test(s)) throw new Error('worktree path has unsafe characters: ' + s);
  if (s.indexOf('..') !== -1) throw new Error('worktree path has traversal: ' + s);
  return s;
}

// Shell-single-quote a path string (escape embedded single quotes).
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// Parse NUL-delimited `git status --porcelain=v1 -z --untracked-files=all` into
// [{xy, path}]. Renames/copies carry a second NUL-delimited origin path which we
// consume (and the caller rejects) so later entries parse correctly.
function parseStatusPorcelainZ(out) {
  const s = String(out);
  const recs = [];
  let i = 0;
  const n = s.length;
  while (i + 3 <= n) {
    const x = s[i], y = s[i + 1];
    if (s[i + 2] !== ' ') break;          // malformed entry / trailing junk
    i += 3;
    let j = i;
    while (j < n && s[j] !== '\0') j++;
    const path = s.slice(i, j);
    i = j + 1;
    recs.push({ xy: x + y, path });
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      let k = i;
      while (k < n && s[k] !== '\0') k++;
      i = k + 1;                          // consume origin path field
    }
  }
  return recs;
}

// Derive the AUTHORITATIVE change set for a worktree from Git (NUL-delimited
// porcelain). Rejects deletion/rename/copy (D/R/C in either column) and any
// actual path outside the unit's owned paths. Git is authoritative; the
// worker's self-reported changed_paths is cross-checked but never trusted over
// Git. Returns the normalized set of changed file paths.
async function deriveActualChanges(worktree, owned) {
  const wt = safeWorktree(worktree);
  const st = await pi.bash({ cmd: 'git -C ' + shellQuote(wt) + ' status --porcelain=v1 -z --untracked-files=all', timeoutMs: 60000 });
  if (!st.ok) throw new Error('worktree git status failed: ' + String(st.output || ''));
  const recs = parseStatusPorcelainZ(st.output);
  const UNMERGED = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'];
  const actual = [];
  const untracked = [];
  for (const r of recs) {
    const x = r.xy[0], y = r.xy[1];
    if (UNMERGED.indexOf(r.xy) !== -1) throw new Error('rejected unmerged/conflict status ' + r.xy + ' on ' + r.path + ' (never integrated)');
    if (x === 'D' || y === 'D' || x === 'R' || y === 'R' || x === 'C' || y === 'C') {
      throw new Error('rejected change type ' + r.xy + ' on ' + r.path + ' (deletion/rename/copy never integrated)');
    }
    const rel = normalizeRepoPath(r.path);
    if (!insideOwned(rel, owned)) throw new Error('actual path outside unit ownership: ' + rel);
    if (actual.indexOf(rel) === -1) actual.push(rel);
    if (r.xy === '??') untracked.push(rel);
  }
  return { actual, untracked };
}

// Read a changed file's content from the worktree. Internal Fabric pi.* bypasses
// the outer project guard, so pi.read on the validated absolute worktree path
// works directly (no `cat`, no shell). rel is normalizeRepoPath-validated; the
// absolute path is safeWorktree-validated before use.
async function readWorktreeFile(worktree, rel) {
  const wt = safeWorktree(worktree);
  const r = normalizeRepoPath(rel);
  return String(await pi.read({ path: wt + '/' + r }));
}

// Capture a bounded unified Git diff for a unit. Untracked files are first
// intent-to-added (`git add -N -- <path>`) so `git diff HEAD` shows them as new
// file additions; then `git diff HEAD -- <individual paths>` produces the unified
// diff. Binary files (numstat shows `-\t-`) and overlarge/unreviewable diffs
// (over DIFF_LIMIT chars) are rejected. This diff is the evidence Sol and Opus
// gate — they receive it in their briefs, never raw worktree paths.
async function captureDiff(worktree, actual, untracked) {
  const wt = safeWorktree(worktree);
  for (const p of untracked) {
    const addN = await pi.bash({ cmd: 'git -C ' + shellQuote(wt) + ' add -N -- ' + shellQuote(p), timeoutMs: 60000 });
    if (!addN.ok) throw new Error('git add -N failed for ' + p + ': ' + String(addN.output || ''));
  }
  const pathsArgs = actual.map(shellQuote).join(' ');
  const numstat = await pi.bash({ cmd: 'git -C ' + shellQuote(wt) + ' diff --numstat HEAD -- ' + pathsArgs, timeoutMs: 60000 });
  if (!numstat.ok) throw new Error('git diff --numstat failed: ' + String(numstat.output || ''));
  for (const line of String(numstat.output).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 2 && parts[0] === '-' && parts[1] === '-') throw new Error('binary file in diff, not reviewable: ' + line);
  }
  const diff = await pi.bash({ cmd: 'git -C ' + shellQuote(wt) + ' diff HEAD -- ' + pathsArgs, timeoutMs: 120000 });
  if (!diff.ok) throw new Error('git diff HEAD failed: ' + String(diff.output || ''));
  const text = String(diff.output || '');
  if (text.length > DIFF_LIMIT) throw new Error('diff overlarge/unreviewable (' + text.length + ' > ' + DIFF_LIMIT + ')');
  return text;
}

// Run an allowlisted verify command with the worktree as cwd. The verify
// command itself MUST be an EXACT allowlist member (enforced here); the `cd`
// wrapper is primary-controlled plumbing with a validated worktree path, never
// an operator/planner-supplied command. Returns the pi.bash result.
async function execInWorktree(worktree, verifyCmd) {
  const wt = safeWorktree(worktree);
  mustAllow(verifyCmd, 'worktree verify');
  const cmd = 'cd ' + shellQuote(wt) + ' && ' + String(verifyCmd);
  return await pi.bash({ cmd, timeoutMs: 180000 });
}

// Parse + validate a Sol/Opus gate from a report's trailing JSON. The gate MUST
// be an object { pass: boolean, blocking_findings: string[] }. Returns
// { ok, pass, blocking_findings }; ok=false means missing/malformed (treated as
// a failed gate — updates board, replans, skips state.checkGoal).
function parseGate(text, label) {
  let obj;
  try { obj = trailingJson(text); }
  catch (e) { return { ok: false, pass: false, blocking_findings: [], reason: label + ': no trailing JSON' }; }
  const g = obj && obj.gate;
  if (!g || typeof g !== 'object') return { ok: false, pass: false, blocking_findings: [], reason: label + ': missing gate object' };
  if (typeof g.pass !== 'boolean') return { ok: false, pass: false, blocking_findings: [], reason: label + ': gate.pass not boolean' };
  if (!Array.isArray(g.blocking_findings)) return { ok: false, pass: false, blocking_findings: [], reason: label + ': gate.blocking_findings not array' };
  return { ok: true, pass: !!g.pass, blocking_findings: g.blocking_findings.map(String), reason: label + (g.pass ? ': pass' : ': fail') };
}

// Deterministic plan extraction + validation (replaces manual parsing). The
// planner MUST return ONE final JSON object whose `units` array entries are
// { id, paths, deliverable, verify, required_skills, brief }. required_skills
// is a string[] (empty allowed; names resolved against the skill catalog before
// spawn, not here). Owned paths are strict-normalized. Each verify string MUST
// be an EXACT allowlist member or the whole plan is rejected (re-plan). Rejects:
// missing units[], count outside 1-12, missing/duplicate ids, missing or
// overlapping owned paths, missing deliverable or verify command, required_skills
// present but not a string[].
function extractUnits(planText) {
  const parsed = trailingJson(planText);
  const units = parsed && Array.isArray(parsed.units) ? parsed.units : null;
  if (!units) throw new Error('planner report missing units[]');
  if (units.length < 1 || units.length > 12) throw new Error('units count out of range 1-12: ' + units.length);
  const ids = new Set();
  const claimed = [];
  for (const u of units) {
    if (!u || typeof u !== 'object') throw new Error('unit is not an object');
    const id = String(u.id || '').trim();
    if (!id) throw new Error('unit missing id');
    if (ids.has(id)) throw new Error('duplicate unit id: ' + id);
    ids.add(id);
    const rawOwned = Array.isArray(u.paths) ? u.paths : (Array.isArray(u.owned) ? u.owned : null);
    if (!Array.isArray(rawOwned) || rawOwned.length === 0) throw new Error('unit ' + id + ' has no owned paths');
    for (const p of rawOwned) {
      const ps = normalizeRepoPath(String(p));      // strict normalize
      for (const q of claimed) {
        if (ps === q || ps.startsWith(q + '/') || q.startsWith(ps + '/')) {
          throw new Error('overlapping owned paths: ' + ps + ' ~ ' + q);
        }
      }
      claimed.push(ps);
    }
    if (!u.deliverable) throw new Error('unit ' + id + ' missing deliverable');
    if (!u.verify) throw new Error('unit ' + id + ' missing verify command');
    mustAllow(String(u.verify), 'unit ' + id + ' verify');   // exact member or reject plan
    if (!Object.prototype.hasOwnProperty.call(u, 'required_skills')) throw new Error('unit ' + id + ' missing required_skills (must be present; [] is valid)');
    const rs = u.required_skills;
    if (!Array.isArray(rs)) throw new Error('unit ' + id + ' required_skills must be a string[]');
    for (const sk of rs) if (typeof sk !== 'string' || !sk.trim()) throw new Error('unit ' + id + ' required_skills has a non-string/empty entry');
  }
  return units.map(u => ({
    id: String(u.id),
    paths: (u.paths || u.owned).map(p => normalizeRepoPath(String(p))),
    deliverable: String(u.deliverable),
    verify: String(u.verify),
    required_skills: Array.isArray(u.required_skills) ? u.required_skills.map(String) : [],
    brief: String(u.brief || u.deliverable),
  }));
}

// Resolve a unit's required_skills against config dispatch.skill_policy and
// the skill manifest BEFORE spawn. Unknown skills (absent from the catalog) and
// leaf-denied skills (dispatch.leaf_excluded_skills.skills +
// manifest.primary_only.interactive) are rejected so the brief is not spawned;
// high-context skills route to the primary, never a bounded leaf. Returns the
// resolved skill names to attach to the spawned brief. [] means no skill is
// loaded; kernel skills are considered first but still must be named when relevant.
const catalogSkills = new Set([
  ...manifest.tiers.kernel.skills,
  ...manifest.tiers['mandatory-on-trigger'].skills,
  ...manifest.tiers.specialist.skills,
  ...manifest.tiers['high-context'].skills,
]);
const leafDenied = new Set([
  ...cfg.dispatch.leaf_excluded_skills.skills,
  ...manifest.primary_only.interactive,
]);
const highContext = new Set(manifest.tiers['high-context'].skills);

function resolveSkills(unitId, requested) {
  const names = Array.isArray(requested) ? requested.map(String) : [];
  if (!names.length) return [];                 // empty allowed
  const resolved = [];
  for (const name of names) {
    if (!catalogSkills.has(name)) throw new Error('unit ' + unitId + ' unknown skill (reject, do not spawn): ' + name);
    if (leafDenied.has(name)) throw new Error('unit ' + unitId + ' leaf-denied skill (reroute to primary): ' + name);
    if (highContext.has(name)) throw new Error('unit ' + unitId + ' high-context skill (route to primary, not a leaf): ' + name);
    resolved.push(name);
  }
  return resolved;
}

// Fan out GLM implementers (up to 12; first 6 makora, then umans balance). Each
// runs in its OWN fresh Fabric worktree (worktree:true); result.worktree is the
// authoritative change-set root. Skills are resolved against the catalog before
// spawn and the resolved names are folded into each implementation brief.
async function implementWave(units, attempt = 1) {
  const lanes = ['makora/zai-org/GLM-5.2-NVFP4', 'umans/umans-glm-5.2'];
  const handles = [];
  units.slice(0, 12).forEach((u, i) => {
    const model = i < 6 ? lanes[0] : lanes[1];   // true 6-makora-then-umans balance
    const skills = resolveSkills(u.id, u.required_skills);
    const skillInstruction = skills.length
      ? '\n\nrequired_skills: ' + JSON.stringify(skills) +
        '\nBefore other work, read every .pi/skills/<name>/SKILL.md listed above and follow it.'
      : '\n\nrequired_skills: [] (load no skill)';
    const brief = u.brief + skillInstruction +
      '\nRun metadata for the final envelope: run_id=' + slug +
      ', unit_id=' + u.id + ', attempt=' + attempt +
      ', owned_paths=' + JSON.stringify(u.paths) +
      '\nYou run inside an isolated Git worktree (your cwd). Edit only your owned paths; do not commit, push, branch, delete, or run destructive ops.';
    handles.push({ u, model, attempt, p: runGoverned('general', brief, model, 'impl-' + (i + 1)) });
  });
  return await Promise.all(handles.map(async h => ({
    unit: h.u, model: h.model, attempt: h.attempt, result: await h.p,
  })));
}

// Gate one returned worker: derive the authoritative change set from its
// worktree, reject a divergent HEAD (worker committed) or unmerged status, read
// every changed file, capture a bounded unified diff, run the allowlisted
// verify inside the worktree. Returns { passed, changed, files, diff, worktree,
// envelope, out, error }. Failed worktrees are RETAINED (never cleaned up).
async function gateWorker(d) {
  const u = d.unit;
  const wt = d.result && d.result.worktree;
  const g = { id: u.id, paths: u.paths, changed: [], untracked: [], files: [], diff: '', worktree: wt || '', envelope: null, attempt: d.attempt || 1, passed: false, out: '', error: '' };
  let wr = null; try { wr = trailingJson(d.result.text); } catch (_) {}
  g.envelope = wr;
  try {
    requireCompletedRun(d.result, 'general implementer', d.model, false);
    if (!wt) throw new Error('no result.worktree from agents.run (worktree:true required)');
    // Reject worktrees whose HEAD diverges from the saved ROOT HEAD: a worker
    // that commits advances HEAD and would hide a clean status. Workers must
    // never commit; a divergent HEAD is rejected, never integrated.
    const wtHead = await pi.bash({ cmd: 'git -C ' + shellQuote(safeWorktree(wt)) + ' rev-parse HEAD', timeoutMs: 30000 });
    if (!wtHead.ok) throw new Error('cannot read worktree HEAD');
    if (String(wtHead.output).trim() !== ROOT_HEAD) throw new Error('worktree HEAD diverges from ROOT HEAD (worker committed — clean status hidden)');
    const { actual, untracked } = await deriveActualChanges(wt, u.paths);   // Git authoritative; rejects unmerged
    g.changed = actual; g.untracked = untracked;
    const envOk = !!wr && wr.status === 'done' && Array.isArray(wr.checks_run) && typeof wr.stop_reason === 'string';
    if (!envOk) throw new Error('worker envelope invalid (status/checks_run/stop_reason)');
    // L3 deterministic gate: implementation envelopes MUST carry a quality-pack
    // check (config.json quality_policy.enforcement.envelope). Absence = failed
    // verification; the envelope is rejected before any integration.
    if (!wr.checks_run.some((c) => c && c.name === 'quality-pack')) throw new Error('worker envelope missing required quality-pack entry in checks_run');
    if (laneBudget.implementation > 0 && usageTokens(d.result) > laneBudget.implementation) throw new Error('lane budget exceeded');
    // The worker's reported changed_paths (normalized) MUST equal Git's actual
    // set EXACTLY (both directions). A lie in either direction fails the gate;
    // Git remains authoritative for integration.
    const reportedRaw = (wr && Array.isArray(wr.changed_paths)) ? wr.changed_paths : [];
    const reported = [];
    for (const p of reportedRaw) {
      let n; try { n = normalizeRepoPath(String(p)); } catch (e) { throw new Error('worker changed_paths has invalid path: ' + String(p)); }
      reported.push(n);
    }
    const reportedSet = new Set(reported), actualSet = new Set(actual);
    if (reportedSet.size !== actualSet.size) throw new Error('changed_paths size mismatch: reported ' + reportedSet.size + ' vs actual ' + actualSet.size);
    for (const p of actualSet) if (!reportedSet.has(p)) throw new Error('changed_paths missing actual path: ' + p);
    for (const p of reportedSet) if (!actualSet.has(p)) throw new Error('changed_paths reported not in actual: ' + p);
    g.mismatch = [];
    // Read every actual changed file from the worktree (primary-confirmed).
    for (const rel of actual) g.files.push({ path: rel, content: await readWorktreeFile(wt, rel) });
    // Capture the bounded unified diff (the evidence Sol/Opus gate).
    g.diff = await captureDiff(wt, actual, untracked);
    // Run only the allowlisted verify check inside the worktree.
    const v = await execInWorktree(wt, u.verify);
    g.out = String((v && v.output) || '').slice(0, 600);
    if (!(v && v.ok)) throw new Error('worktree verify failed');
    g.passed = true;
  } catch (e) {
    g.passed = false; g.error = String(e.message || e);
  }
  return g;
}

function usageTokens(run) {
  const u = (run && run.usage) || {};
  return Number(u.totalTokens || ((u.input || 0) + (u.output || 0)));
}

async function totalTeamTokens() {
  const runs = await tools.call({ ref: 'agents.list', args: {} });
  return (Array.isArray(runs) ? runs : []).reduce((sum, r) => sum + usageTokens(r), 0);
}

// True when the whole run has exceeded TOTAL_BUDGET. Polled before every
// failed-plan / failed-gate continue so those paths still honor the backstop.
async function overBudget() {
  return TOTAL_BUDGET > 0 && (await totalTeamTokens()) > TOTAL_BUDGET;
}
```

## The lifecycle loop

```typescript
let cycle = 0;
let met = false;
await cleanupStaleBoards(board);   // retire finished prior /team boards (never the active one)
await ledgerInit();                // observe the durable state head; receipts chain from it
let replanContext = '';
while (cycle < MAX_CYCLES && !met) {
  cycle++;
  startCycleEvidence(cycle);

  // 1. RESEARCH + MESH COLLABORATION — hard prerequisites for planning.
  // Missing/failed retrieval, URL evidence, actor response, or cross-review
  // blocks the run; no planner or implementation child is dispatched.
  let researchReceipt; let collaborationReceipt;
  try {
    researchReceipt = await runResearchWave(cycle);
    await recordEvidence('research', researchReceipt);
    collaborationReceipt = await runMeshCollaboration(cycle, researchReceipt);
    await recordEvidence('collaboration', collaborationReceipt);
    await stageArtifact('research', cycle, 'Research — cycle ' + cycle,
      '## Local + external research and peer cross-review\n\n### Verified sources\n' + (researchReceipt.urls || []).map(u => '- ' + u).join('\n') + '\n\n### Research digest\n```json\n' + researchReceipt.digest + '\n```\n\n### Mesh collaboration (architect + risk)\n```json\n' + collaborationReceipt.digest + '\n```');
    requireEvidence('plan');
  } catch (e) {
    await markBlocked(phaseEvidence.receipts.research ? 'collaboration' : 'research', e);
    break;
  }

  // 2. PLAN (gpt-5.6-sol) - decompose the goal into owned, non-overlapping units.
  const plan = await run('plan',
    'required_skills: ["planning-and-task-breakdown"]\n' +
    'Before planning, read .pi/skills/planning-and-task-breakdown/SKILL.md.\n' +
    'Cycle ' + cycle + '. Goal: ' + GOAL + '. Board: ' + board + '. Mandatory research and peer cross-review already passed. Use this evidence: ' +
    JSON.stringify({ research: researchReceipt.digest, collaboration: collaborationReceipt.digest, prior_blocker: replanContext }).slice(0, 120000) + '\nDecompose the next\n' +
    'increment into 1-12 independent implementation units. Each unit MUST be a JSON\n' +
    'object: { id (unique string), paths (string[], owned, non-overlapping),\n' +
    'deliverable (string), verify (shell command, exit 0 == done),\n' +
    'required_skills (string[], empty allowed; skill names from .pi/skills/manifest.json),\n' +
    'brief (string) }.\n' +
    'CRITICAL — verify allowlist: each unit verify command MUST be an EXACT string\n' +
    'from this primary-approved allowlist (no other command is ever executed, never\n' +
    'sanitized): ' + JSON.stringify([...ALLOW]) + '. Choose verify commands only from\n' +
    'this list; a nonmember verify causes the whole plan to be rejected and re-planned.\n' +
    'End your report with ONE final JSON object as the LAST thing that contains BOTH\n' +
    'the worker-result fields (status, changed_paths, checks_run, stop_reason) AND a\n' +
    'top-level "units": [...] array. The primary parses the last JSON object even if\n' +
    'it is fenced, so the generic worker-envelope instruction does not conflict with\n' +
    'this. Malformed, duplicate-id, overlapping-path, unknown-skill, or non-allowlisted-\n' +
    'verify plans are rejected by the primary.');

  // Primary (you) extracts + validates units deterministically (strict path
  // normalize + verify allowlist membership), then records on the board. A
  // malformed/rejected plan updates the board and re-plans (does not crash).
  let units;
  try {
    const planEnv = requireCompletedRun(plan, 'planner', cfg.role_routes.plan.model, true);
    units = extractUnits(plan.text);
    await recordEvidence('plan', { pass: true, run_id: plan.id, unit_ids: units.map(u => u.id), checks: planEnv.checks_run.length });
    await stageArtifact('plan', cycle, 'Plan — cycle ' + cycle,
      '## Plan units\n\n' + units.map(u => '### ' + u.id + '\n- paths: ' + JSON.stringify(u.paths) + '\n- verify: `' + u.verify + '`\n- required_skills: ' + JSON.stringify(u.required_skills) + '\n\n' + (u.deliverable || '') + '\n\n' + (u.brief || '')).join('\n\n'));
    requireEvidence('implement');
  }
  catch (e) {
    const curR = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curR.version,
      value: { ...curR.value, cycle, phase: 're-plan', status: 'plan-rejected: ' + String(e.message || e) } } });
    if (await overBudget()) break;
    continue;
  }
  // Post-plan crew check (advisory; never gates). Fold guidance into implementation briefs.
  const planReviewDigest = await crewPlanCheck(cycle, units, collaborationReceipt.digest);
  if (planReviewDigest) for (const u of units) u.brief = (u.brief || '') + '\n\nAdvisory crew plan-review (guidance, not a gate): ' + planReviewDigest;
  const curP = await tools.call({ ref: 'mesh.get', args: { key: board } });
  const tasksP = {};
  for (const u of units) tasksP[u.id] = {
    paths: u.paths, verify: u.verify, required_skills: u.required_skills,
    attempt: 1, status: 'assigned',
  };
  await tools.call({ ref: 'mesh.put', args: {
    key: board, ifVersion: curP.version,
    value: { ...curP.value, cycle, phase: 'implement', tasks: tasksP, status: 'running' },
  } });

  // 2. IMPLEMENT (GLM 12, worktree:true) - one owned path-set per teammate, no overlap.
  await tools.call({ ref: 'mesh.publish', args: { topic, kind: 'assignment',
    text: 'cycle ' + cycle + ': dispatching ' + units.length + ' units' } });
  const curRun = await tools.call({ ref: 'mesh.get', args: { key: board } });
  const tasksRun = { ...(curRun.value.tasks || {}) };
  for (const u of units) tasksRun[u.id] = { ...(tasksRun[u.id] || {}), status: 'running' };
  await tools.call({ ref: 'mesh.put', args: {
    key: board, ifVersion: curRun.version, value: { ...curRun.value, tasks: tasksRun },
  } });
  const done = await implementWave(units);
  const curReturned = await tools.call({ ref: 'mesh.get', args: { key: board } });
  const tasksReturned = { ...(curReturned.value.tasks || {}) };
  for (const d of done) tasksReturned[d.unit.id] = {
    ...(tasksReturned[d.unit.id] || {}), status: 'returned',
  };
  await tools.call({ ref: 'mesh.put', args: {
    key: board, ifVersion: curReturned.version,
    value: { ...curReturned.value, tasks: tasksReturned },
  } });

  // 3. PRIMARY GATE - derive the authoritative change set from each worktree,
  //    read every changed file, capture a bounded unified diff, and run the
  //    allowlisted verify inside the worktree. Untrusted until confirmed.
  //    Reject: deletion/rename/copy, unmerged/conflict status, a worktree HEAD
  //    that diverges from the saved ROOT HEAD (worker committed), any actual
  //    path outside the unit ownership, and any mismatch between the worker's
  //    normalized reported changed_paths and Git's actual set (must be exact).
  //    One fresh-worktree retry max (retry_policy: 1) while ROOT remains clean;
  //    re-gate just those. Failed worktrees are RETAINED (never cleaned up
  //    without operator permission). Do NOT advance to verify/review/goal when
  //    any unit remains failed after the one retry — re-plan the next cycle.
  let gate = [];
  for (const d of done) gate.push(await gateWorker(d));
  const failed = gate.filter(g => !g.passed);
  if (failed.length) {
    const curRetry = await tools.call({ ref: 'mesh.get', args: { key: board } });
    const tasksRetry = { ...(curRetry.value.tasks || {}) };
    for (const f of failed) tasksRetry[f.id] = {
      ...(tasksRetry[f.id] || {}), attempt: 2, status: 'running',
    };
    await tools.call({ ref: 'mesh.put', args: {
      key: board, ifVersion: curRetry.version, value: { ...curRetry.value, tasks: tasksRetry },
    } });
    const retry = await implementWave(units.filter(u => failed.some(f => f.id === u.id)), 2);
    const curRetryReturned = await tools.call({ ref: 'mesh.get', args: { key: board } });
    const tasksRetryReturned = { ...(curRetryReturned.value.tasks || {}) };
    for (const d of retry) tasksRetryReturned[d.unit.id] = {
      ...(tasksRetryReturned[d.unit.id] || {}), status: 'returned',
    };
    await tools.call({ ref: 'mesh.put', args: {
      key: board, ifVersion: curRetryReturned.version,
      value: { ...curRetryReturned.value, tasks: tasksRetryReturned },
    } });
    for (const d of retry) {
      const rg = await gateWorker(d);
      const existing = gate.find(x => x.id === rg.id);
      if (existing) gate[gate.indexOf(existing)] = rg; else gate.push(rg);
    }
  }
  // Retain failed worktrees (never cleanup/delete without operator permission).
  const retained = gate.filter(g => !g.passed && g.worktree).map(g => ({ id: g.id, worktree: g.worktree, error: g.error }));
  const allPassed = gate.every(g => g.passed);
  const curG = await tools.call({ ref: 'mesh.get', args: { key: board } });
  const tasksG = { ...(curG.value.tasks || {}) };
  for (const g of gate) tasksG[g.id] = {
    ...(tasksG[g.id] || {}), attempt: g.attempt, changed_paths: g.changed,
    envelope: g.envelope, status: g.passed ? 'verified' : 'failed',
  };
  await tools.call({ ref: 'mesh.put', args: {
    key: board, ifVersion: curG.version,
    value: { ...curG.value, cycle, phase: allPassed ? 'verify' : 're-plan', tasks: tasksG, status: allPassed ? 'running' : 'gate-failed', retained },
  } });
  const spentAfterGate = await totalTeamTokens();
  if (TOTAL_BUDGET > 0 && spentAfterGate > TOTAL_BUDGET) break;
  if (!allPassed) continue;
  await recordEvidence('implement', { pass: true, run_ids: done.map(d => d.result.id), unit_ids: gate.map(g => g.id) });
  requireEvidence('verify');   // do not advance to verify/review/goal; re-plan next cycle

  // Captured, primary-confirmed change set per unit (files read from the worktree
  // + the bounded unified diff + the worktree verify output) — the evidence Sol
  // and Opus review as supplied diffs (never worktree paths) and the exact bytes
  // the primary integrates after both gates pass.
  const captured = gate.map(g => ({ unit: { id: g.id, paths: g.paths, verify: (units.find(u => u.id === g.id) || {}).verify || '' }, worktree: g.worktree, files: g.files, diff: g.diff, verifyOut: g.out, mismatch: g.mismatch || [] }));
  // Sol and Opus receive the supplied unified diffs (not inaccessible worktree
  // absolute paths) and gate those diffs.
  const diffsPayload = JSON.stringify(captured.map(c => ({
    id: c.unit.id, paths: c.unit.paths, diff: c.diff, verify_out: c.verifyOut,
  })));
  if (diffsPayload.length > REVIEW_PAYLOAD_LIMIT) {
    replanContext = 'Previous wave review evidence was ' + diffsPayload.length + ' chars (limit ' + REVIEW_PAYLOAD_LIMIT + '). Split or narrow units so the aggregate supplied diff fits.';
    const curSize = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curSize.version,
      value: { ...curSize.value, cycle, phase: 're-plan', status: 'review-payload-too-large', review_payload_chars: diffsPayload.length } } });
    continue;
  }

  // Post-implement crew check (advisory; never gates). Feeds the Opus reviewer context.
  const diffReviewDigest = await crewDiffCheck(cycle, diffsPayload);

  // 4. VERIFY (Sol) - independent read-only verification pass (review route on
  //    gpt-5.6-sol; no dedicated verify route). Read-only in main; it gates the
  //    supplied unified diffs and the primary-captured gate evidence (unit verify
  //    outputs already run by the primary inside each worktree). Its final JSON
  //    MUST include gate:{pass:boolean, blocking_findings:string[]}; a
  //    failed/malformed Sol gate updates the board/replans and MUST skip
  //    state.checkGoal. ROOT is still clean (no integration yet).
  const verify = await run('review',
    'required_skills: []\n' +
    'Cycle ' + cycle + '. Independent verification: gate the supplied unified diffs\n' +
    'and the primary-captured gate evidence (unit verify outputs already run by the\n' +
    'primary inside each worktree). You are read-only and receive the diffs inline\n' +
    'below — do NOT access worktree absolute paths (they are not reachable from your\n' +
    'read-only main session); review the diffs you are given. Do NOT claim to execute\n' +
    'shell checks yourself; name the exact diff hunks and primary evidence you relied\n' +
    'on. This is the verify pass, distinct from the Opus review that follows.\n' +
    'Your ONE final JSON object MUST contain all worker-result fields AND a top-level\n' +
    '"gate": { "pass": boolean, "blocking_findings": [string] }. Set pass=false\n' +
    'and list path:line findings if\n' +
    'any verified unit is incorrect, incomplete, or unsafe; pass=true only if the\n' +
    'whole increment is verified. A missing/malformed gate is treated as a failure.\n' +
    'Supplied unified diffs + primary verify outputs (one object per unit): ' + diffsPayload,
    undefined, 'verify');
  let solGate;
  try {
    requireCompletedRun(verify, 'Sol verifier', cfg.team_mode.required_roles.verify.model, true);
    solGate = parseGate(verify.text, 'Sol verify');
  } catch (e) { solGate = { ok: false, pass: false, blocking_findings: [String(e.message || e)], reason: 'Sol verify host/envelope failure' }; }
  if (!solGate.ok || !solGate.pass) {
    const curV = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curV.version,
      value: { ...curV.value, cycle, phase: 're-plan', status: 'verify-failed', sol_blocking_findings: solGate.blocking_findings } } });
    if (await overBudget()) break;
    continue;
  }
  await recordEvidence('verify', { pass: true, run_id: verify.id, blocking_findings: [] });
  requireEvidence('review');

  // 5. REVIEW (Opus) - unreachable until the Sol receipt passes. Read-only
  //    in main; same gate contract. A failed/malformed Opus gate updates the
  //    board/replans and MUST skip state.checkGoal.
  const review = await run('review',
    'required_skills: ["code-review-and-quality"]\n' +
    'Before review, read .pi/skills/code-review-and-quality/SKILL.md.\n' +
    'Cycle ' + cycle + '. Review the increment for correctness and security. Gate the\n' +
    'supplied unified diffs (delivered inline below — do NOT access worktree absolute\n' +
    'paths, they are not reachable from your read-only main session). Score 1-5 and\n' +
    'list blocking findings with path:line. Changed paths: ' +
    JSON.stringify(gate.flatMap(g => g.changed)) + '\nIndependent Sol verify report: ' +
    String(verify.text || '') + '\nYour ONE final JSON object MUST contain all worker-result fields AND a top-level\n' +
    '"gate": { "pass": boolean, "blocking_findings": [string] }. Set pass=false with\n' +
    'path:line blocking findings if the increment is not shippable; pass=true only\n' +
    'if it is correct and safe. A missing/malformed gate is treated as a failure.\n' +
    'Supplied unified diffs + primary verify outputs (one object per unit): ' + diffsPayload +
    (diffReviewDigest ? '\nAdvisory crew risk pass (not a gate; verify independently): ' + diffReviewDigest : ''),
    'claude-bridge/claude-opus-4-8');
  let opusGate;
  try {
    requireCompletedRun(review, 'Opus reviewer', cfg.team_mode.required_roles.review.model, true);
    opusGate = parseGate(review.text, 'Opus review');
  } catch (e) { opusGate = { ok: false, pass: false, blocking_findings: [String(e.message || e)], reason: 'Opus review host/envelope failure' }; }

  // A failed or malformed Sol/Opus gate updates the board/replans and MUST skip
  // state.checkGoal. Do not integrate: ROOT stays clean.
  if (!solGate.ok || !solGate.pass || !opusGate.ok || !opusGate.pass) {
    const curB = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curB.version,
      value: { ...curB.value, cycle, phase: 're-plan',
        status: 'gate-failed: sol=' + (solGate.ok ? (solGate.pass ? 'pass' : 'fail') : 'malformed') +
          ' opus=' + (opusGate.ok ? (opusGate.pass ? 'pass' : 'fail') : 'malformed'),
        sol_blocking_findings: solGate.blocking_findings, opus_blocking_findings: opusGate.blocking_findings } } });
    if (await overBudget()) break;
    continue;
  }

  await recordEvidence('review', { pass: true, run_id: review.id, blocking_findings: [] });
  requireEvidence('integrate');

  // BOTH GATES PASS — primary integrates the EXACT worktree files into ROOT
  // (primary is sole integrator) through the Fabric schema transaction:
  // schema.hypothesize binds per-file pre-image evidence, schema.verify mints a
  // short-lived single-use certificate (commit must follow immediately), and
  // schema.commit performs the bounded declared writes atomically — each write
  // carries its expected pre-image (sha256, or absent for a new file) and a
  // byte-exact sha256 postcondition, with host-side rollback — so a drifted
  // target or partial write can never leave ROOT half-integrated. This is a
  // FILE transaction, not a Git commit; per AGENTS.md the primary still never
  // commits. Deletions remain rejected (caught earlier at the worktree gate).
  const sha256File = async (abs) => {
    const h = await pi.bash({ cmd: 'sha256sum ' + shellQuote(abs), timeoutMs: 30000 });
    if (!h.ok) throw new Error('sha256sum failed: ' + abs);
    const hex = String(h.output).trim().slice(0, 64);
    if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('malformed sha256 for ' + abs);
    return 'sha256:' + hex;
  };
  const ops = []; const posts = []; const preImages = []; const restoreOps = [];
  for (const c of captured) {
    for (const f of c.files) {
      const rel = normalizeRepoPath(f.path);
      let preContent = null; let preSha = null;
      try { preContent = String(await pi.read({ path: ROOT + '/' + rel })); preSha = await sha256File(ROOT + '/' + rel); } catch (_) { /* new file */ }
      const postSha = await sha256File(safeWorktree(c.worktree) + '/' + rel);
      ops.push({ kind: 'write', path: rel, content: f.content, expected: preSha ? { sha256: preSha } : { absent: true } });
      posts.push({ kind: 'file_sha256', path: rel, sha256: postSha });
      preImages.push(preSha ? { kind: 'file_sha256', path: rel, sha256: preSha } : { kind: 'file_absent', path: rel });
      restoreOps.push(preSha
        ? { kind: 'write', path: rel, content: preContent, expected: { sha256: postSha } }
        : { kind: 'delete', path: rel, expectedSha256: postSha });
    }
  }
  try {
    const hyp = await tools.call({ ref: 'schema.hypothesize', args: {
      label: 'integrate-c' + cycle + '-' + slug,
      summary: 'Integrate ' + captured.length + ' gated unit(s) into clean ROOT; every target must match its pre-image (or be absent) and every write must land byte-exact.',
      evidence: preImages,
    } });
    const cert = await tools.call({ ref: 'schema.verify', args: { hypothesisId: hyp.hypothesisId } });
    if (!cert || cert.verified !== true) throw new Error('pre-image verification failed: ROOT drifted from the state the gates reviewed');
    await tools.call({ ref: 'schema.commit', args: {
      hypothesisId: hyp.hypothesisId, certificate: cert.certificate,
      operations: ops, postconditions: posts,
    } });
  } catch (e) {
    // Atomic commit means no partial write landed: ROOT is NOT mutated.
    const curTx = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curTx.version,
      value: { ...curTx.value, cycle, phase: 'integration-failed', status: 'integration transaction failed (ROOT unchanged): ' + String(e.message || e) } } });
    break;   // ROOT integrity is in question (drift/transaction fault); require operator attention
  }
  // Re-run checks in ROOT (exact allowlisted verify commands, cwd=ROOT).
  let rootRecheckOk = true; let rootRecheckErr = '';
  for (const c of captured) {
    const rv = await pi.bash({ cmd: c.unit.verify, timeoutMs: 180000 });
    if (!(rv && rv.ok)) { rootRecheckOk = false; rootRecheckErr = c.unit.id + ': ' + String((rv && rv.output) || '').slice(0, 300); break; }
  }
  // L4 deterministic gate: run the canonical quality pack at ROOT on the exact
  // integrated paths — unconditional, primary-fixed plumbing (not an
  // allowlist-gated planner verify string), independent of unit verifies.
  if (rootRecheckOk) {
    const integrated = captured.flatMap((c) => c.files.map((f) => f.path));
    const qp = await pi.bash({ cmd: 'node .pi/tools/quality/run-pack.mjs ' + integrated.map(shellQuote).join(' '), timeoutMs: 120000 });
    if (!(qp && qp.ok)) { rootRecheckOk = false; rootRecheckErr = 'quality-pack: ' + String((qp && qp.output) || '').slice(0, 300); }
  }
  if (!rootRecheckOk) {
    // Roll ROOT back atomically through the same schema-transaction machinery:
    // restore writes for pre-existing files (expected = the integrated bytes),
    // deletes for files this integration created, postconditions = the exact
    // pre-integration images. A successful rollback returns ROOT byte-identical
    // to clean HEAD, so the loop can safely re-plan; only a failed rollback
    // leaves a mutated ROOT and stops for operator recovery.
    let restored = false;
    try {
      const rhyp = await tools.call({ ref: 'schema.hypothesize', args: {
        label: 'rollback-c' + cycle + '-' + slug,
        summary: 'ROOT re-check failed after integration; restore every integrated path to its pre-integration state.',
        evidence: posts,
      } });
      const rcert = await tools.call({ ref: 'schema.verify', args: { hypothesisId: rhyp.hypothesisId } });
      if (!rcert || rcert.verified !== true) throw new Error('rollback pre-image drift');
      await tools.call({ ref: 'schema.commit', args: {
        hypothesisId: rhyp.hypothesisId, certificate: rcert.certificate,
        operations: restoreOps, postconditions: preImages,
      } });
      restored = true;
    } catch (_) { restored = false; }
    const curB = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curB.version,
      value: { ...curB.value, cycle, phase: 'integration-failed', status: 'ROOT re-check failed: ' + rootRecheckErr + (restored ? ' — ROOT rolled back to pre-integration state; re-planning' : ' — rollback also failed; stop on the mutated ROOT') } } });
    if (!restored) break;   // ROOT is mutated; fail closed and require operator recovery/checkpoint
    replanContext = 'ROOT re-check failed after integration: ' + rootRecheckErr + '. ROOT was rolled back to clean HEAD; plan a smaller or corrected increment.';
    if (await overBudget()) break;
    continue;
  }
  await recordEvidence('integrate', { pass: true, root_recheck: true, unit_ids: captured.map(c => c.unit.id) }, captured.map(c => c.unit.verify));
  await stageArtifact('ship', cycle, 'Ship — cycle ' + cycle,
    '## Shipped increment\n\n' + captured.map(c => '### ' + c.unit.id + '\n- paths: ' + JSON.stringify(c.unit.paths) + '\n- verify: `' + c.unit.verify + '`\n\n**verify output**\n```\n' + String(c.verifyOut || '').slice(0, 4000) + '\n```\n\n**diff**\n```diff\n' + String(c.diff || '').slice(0, 20000) + '\n```').join('\n\n'));
  requireEvidence('goal');

  // 6. GOAL CHECK - the ONLY real success stop. Called only after the whole wave
  //    passes (primary gate + Sol gate + Opus gate) AND the ROOT re-check passes.
  //    It remains sole success stop.
  const g = await tools.call({ ref: 'state.checkGoal', args: {} });
  met = !!(g && (g.met ?? g.passed ?? g.ok));
  await recordEvidence('goal', { pass: met, predicate_result: met }, [GOAL_CHECK]);
  await stageArtifact('verify', cycle, 'Verify — cycle ' + cycle,
    '## Independent verification + review\n\n- goal predicate met: ' + met + '\n- Sol verify gate: ' + (solGate && solGate.pass ? 'pass' : 'fail') + '\n- Opus review gate: ' + (opusGate && opusGate.pass ? 'pass' : 'fail') + '\n\n### Sol verify report\n' + String(verify.text || '').slice(0, 8000) + '\n\n### Opus review report\n' + String(review.text || '').slice(0, 8000));

  // After a mutating integration, fresh worktrees branch from committed HEAD and
  // cannot safely see this uncommitted integration. If the goal is not yet met,
  // STOP mutating cycles: set the board to checkpoint-required and break. Ask
  // the operator whether to authorize a checkpoint commit before a new /team run
  // that builds on this integration. Do not pretend the same invocation can
  // continue mutating cycles on a now-dirty ROOT.
  if (!met) {
    const curCk = await tools.call({ ref: 'mesh.get', args: { key: board } });
    await tools.call({ ref: 'mesh.put', args: { key: board, ifVersion: curCk.version,
      value: { ...curCk.value, cycle, phase: 'checkpoint-required', status: 'checkpoint-required: goal not met after integration; fresh worktrees branch from committed HEAD and cannot see uncommitted integration — ask the operator to authorize a checkpoint commit before a new /team run' } } });
    break;
  }

  // 7. ADVANCE the board (CAS) only after the goal receipt passes.
  requireEvidence('done');
  const cur = await tools.call({ ref: 'mesh.get', args: { key: board } });
  await tools.call({ ref: 'mesh.put', args: {
    key: board, ifVersion: cur.version,
    value: { ...cur.value, cycle, phase: 'done', status: 'goal-met' },
  } });

  // 8. OPTIONAL TOKEN BACKSTOP — disabled while TOTAL_BUDGET is 0.
  const spent = await totalTeamTokens();
  if (TOTAL_BUDGET > 0 && spent > TOTAL_BUDGET) {
    // report runaway, ActorManager.haltAll(), and break - do not start another cycle.
    break;
  }
}
```

## Stop and report

- **Goal met**: report the passing predicate, the cycles taken, and the final
  integrated diff. Ask the operator before any commit/push.
- **Cap hit** (`cycle == MAX_CYCLES`, goal not met): stop, report the last
  review findings and what blocks the goal, and ask how to proceed. Do NOT keep
  looping.
- **Runaway**: token budgets are disabled. For a hung or looping teammate, inspect status, then use `agents.compact` -> `agents.steer` ("wrap up") -> `agents.stop`; `ActorManager.haltAll()` halts all actors.
- **Failed worktrees**: retained runs/worktrees are evidence for manual
  recovery; never `agents.cleanup` (with or without `deleteBranch`) or delete a
  worktree without explicit operator permission.

## Notes

- `/team` is supervisor-driven but no longer mesh-passive: the fixed architect and risk actors receive addressed run-topic requests and perform exactly one cross-review hop. `triggerTurn` remains disabled; the primary reads every response and drives transitions.
- Three Fabric mechanisms carry the run's integrity. (1) The durable phase
  ledger: every receipt chains a CAS-guarded `state.transition` (from = observed
  head), so `state.history` shows the full phase trail and `state.verify` can
  re-run the attached verify/goal commands after the invocation ends. (2)
  Transactional integration: ROOT writes go through `schema.hypothesize` →
  `schema.verify` → `schema.commit` with pre-image expectations, sha256
  postconditions, and atomic rollback — a file transaction, never a Git commit.
  (3) Governed dispatch: implementation children are `agents.spawn`ed and
  status-polled, with a deadline steer ("wrap up now") making `agents.steer`/
  `agents.compact` live mid-flight controls rather than prose-only kill
  switches.
- The goal predicate is the contract. A vague predicate makes the loop
  meaningless - make it a command that genuinely fails until the goal is real.
- Worktrees branch from `HEAD` (committed state). The primary integrates by
  writing files to ROOT's working tree but never commits (per `AGENTS.md`), so a
  follow-on cycle's fresh worktrees will not see a prior cycle's uncommitted
  integration. If `state.checkGoal` is false after a mutating integration, the
  run sets the board to `checkpoint-required` and stops: ask the operator
  whether to authorize a checkpoint commit before a new `/team` run that builds
  on it. The same invocation never continues mutating cycles on a now-dirty ROOT.
- Internal Fabric `pi.*` bypasses the outer project guard, so the primary reads
  worktree files directly via `pi.read` on the validated absolute worktree path
  (no `cat`, no shell) and integrates through the atomic `schema.commit` file
  transaction (pre-image-guarded writes to ROOT; rollback on failure). The
  primary captures a bounded unified `git diff` per unit (untracked files via
  `git add -N -- <path>` then `git diff HEAD -- <paths>`; binary or overlarge
  diffs are rejected) and supplies those diffs to Sol/Opus, who gate the diffs
  rather than unreachable worktree paths. The verify allowlist gates only the
  verify/goal-check commands; primary-controlled git plumbing (`status`,
  `rev-parse`, `diff`, `add -N`, `cd`) is not allowlisted because it is
  primary-chosen and path-validated.
