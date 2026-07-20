---
description: Autonomous overnight pipeline — discover evidence-backed improvements, implement under a FAIL_TO_PASS/PASS_TO_PASS gate, open one draft PR (or report a clean null result)
argument-hint: ""
agent: build
---

> **Pi execution binding:** Thin router that composes the `/team` dispatch
> doctrine. The fabric_exec program below runs in the persistent primary
> session (herdr pane); TypeScript runs in `fabric_exec`, full doctrine in
> `.pi/docs/fabric-tuning.md`. `/night` adds no freelance engines: every
> dispatched worker resolves its model/tools/contract from `role_routes` in
> `.pi/config.json` (explore, scout, plan, general), the implementation pool is
> the same provider-pinned GLM 6+2 (`makora/zai-org/GLM-5.2-NVFP4` cap 6 +
> `umans/umans-glm-5.2` cap 2) used by `/team`, implementation children run in
> isolated Fabric worktrees, and integration is the same `schema.hypothesize →
> schema.verify → schema.commit` file transaction `/team` uses. `/night` only
> layers the night-specific orchestration on top: preflight, bounded discovery,
> an evidence gate, an advisor that picks ≤1 candidate, the implement gate, and
> the PR/notify tail. No `agents.spawn` of ad-hoc models; no re-implementation of
> `/team` internals.

# Night

Autonomous, cron-triggered (or manual) run. It discovers candidate improvements
(bugs, bloat, dead code, doc drift), gates each on machine-checkable retrieved
evidence, asks one advisor to select at most one, implements it under a
SWE-bench-style FAIL_TO_PASS + PASS_TO_PASS gate, and opens a single draft PR —
or exits cleanly with a logged null result. Merge remains human, always.

> **No operator goal argument.** Unlike `/team`, `/night` takes no `$ARGUMENTS`:
> it is self-tasking. The candidate comes from discovery, not the operator.

## Hard caps (non-negotiable)

1. **1 PR per run.** At most one draft PR; never two. Never push or merge `main`/`master`.
2. **Max 5 implement review/retry cycles.** If the candidate is not gated after 5 cycles, park with a report (no PR) and notify a null result.
3. **Per-worker timeouts.** Every dispatched worker has a finite `timeoutMs` (explore/scout 600s, plan 900s, general 900s). A timeout is a failed worker, not a hang.
4. **One respawn retry on transient provider failure.** A worker whose run errors with a transport/provider fault (e.g. the makora key race) is respawned exactly once; a second failure stops that lane for the run.
5. **Null result is a valid, expected outcome.** No retrieved evidence, no advisor selection, or a failed implement gate all produce a clean exit with a log entry — never a manufactured PR.
6. **Leaves only.** Dispatched workers are `maxDepth: 1`; `/night` is the sole orchestrator. Never spawn an orchestrator.

## Standing authorization (from AGENTS.md, established by the night-pipeline policy)

This prompt assumes the parallel policy work is in place: pushing a `night/*`
branch and `gh pr create --draft` are pre-approved for `/night` runs; merge is
never automated; commits use Conventional Commits (enforced by the project
guard). The guard's push gate has a scoped carve-out for `git push origin
night/<...>` only — `main`/`master` pushes stay gated. If that carve-out is
absent, `/night` MUST NOT push; surface it as a blocker.

## Phase 0 — Preflight

Fail closed before any dispatch. Any preflight failure => **null result**.

```typescript
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const workerSchema = JSON.parse(String(await pi.read(ROOT + '/.pi/schemas/worker-result.json')));
const slug = 'night-' + new Date().toISOString().slice(0,10) + '-' + Date.now().toString(36);
const STAGE_DIR = ROOT + '/.pi/artifacts/' + slug;
const MAX_IMPLEMENT_CYCLES = 5;
const MAX_PR = 1;
const TOPIC = 'fabric-pi-' + slug;
const BOARD = 'fabric-pi/' + slug + '/board';
const DAY = new Date().toISOString().slice(0,10);

function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
async function mb(cmd, t=60000) { return await pi.bash({ cmd, timeoutMs: t }); }

// 0a. Clean working tree required (tracked + untracked). /night never clobbers
//     concurrent agent work — a dirty tree means other agents are active; stop.
const st = await mb('git -C ' + shellQuote(ROOT) + ' status --porcelain=v1 -z --untracked-files=all');
if (!st.ok || String(st.output).length > 0) return nullResult('preflight: working tree not clean — refusing to start');

// 0b. On main, up to date.
const co = await mb('git -C ' + shellQuote(ROOT) + ' checkout main 2>&1; git -C ' + shellQuote(ROOT) + ' pull --ff-only 2>&1');
if (!co.ok) return nullResult('preflight: checkout main / pull failed');

// 0c. Research-tool smoke test — one trivial retrieval. If the approved
//     external research tools are down (observed 2026-07-20: codex_search
//     erroring, grepsearch 429), the run MUST end as a null result: model memory
//     is never evidence. The smoke test is dispatched as a single scout worker;
//     a host-observed successful tool_execution_end for an approved tool is
//     required (same proof /team's research gate uses).
const smokeTask = 'required_skills: []\nSmoke test. Call exactly one approved external research tool '
  + JSON.stringify(cfg.team_mode.research_evidence_tools)
  + ' with a trivial query and report the raw retrieval result. If every call errors or is rate-limited, return status blocked. Do not infer anything from memory.';
const smoke = await run('scout', smokeTask, undefined, 'smoke');
try { requireCompletedRun(smoke, 'scout smoke', cfg.role_routes.scout.model, true); }
catch (e) { return nullResult('preflight: smoke worker failed: ' + String(e.message||e)); }
const smokeTools = await successfulResearchTools(smoke);
if (!smokeTools.length) return nullResult('preflight: research tools down — null result (model memory is never evidence)');

// ROOT HEAD recorded for the worktree HEAD-divergence gate.
const rootHeadRes = await mb('git -C ' + shellQuote(ROOT) + ' rev-parse HEAD');
if (!rootHeadRes.ok) return nullResult('preflight: cannot read ROOT HEAD');
const ROOT_HEAD = String(rootHeadRes.output).trim();

await mb('mkdir -p ' + shellQuote(STAGE_DIR));
await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: 0,
  value: { slug, phase: 'discovery', status: 'running', day: DAY, root_head: ROOT_HEAD, candidates: [], evidence: {} } } });
```

## Phase 1 — Discovery (bounded)

`<=3` explore workers scan owned areas for candidates; `<=2` scout workers
verify external evidence. Every candidate MUST carry machine-checkable
retrieved evidence in exactly one of these forms:

- a **failing reproduction command** (a shell command that exits non-zero today
  and is expected to exit 0 after the fix), for a bug candidate;
- a **measured bloat/dead-code report** (a tool output: line counts, dupes,
  dead-code symbols, or a Fallow report), for a bloat/dead-code candidate;
- a **cited upstream source** (a verified URL from a scout's successful
  external retrieval), for a doc-drift or API-correctness candidate.

Candidates without retrieved evidence are discarded. A worker's prose
("this looks buggy") is never evidence. Because this repo has **no global
test suite**, every candidate MUST record BOTH commands at discovery time:

- `fail_to_pass`: the recorded failing reproduction command (bug) or the
  measurement command whose output must shrink (bloat/dead-code);
- `pass_to_pass`: the per-target existing checks that must stay green for the
  touched files (e.g. `node .pi/tools/quality/run-pack.mjs <paths>`,
  `bash -n <script>`, JSON validity) — recorded now, not invented later.

If research tools are down at any point during discovery, the run ends as a
**null result** — model memory is never evidence.

```typescript
async function contractFor(role) {
  const route = cfg.role_routes[role];
  return { route, body: String(await pi.read(ROOT + '/' + route.contract)) };
}

// One-shot worker on a role route with ONE respawn retry on transient provider
// failure (observed makora key race). Raises on a second failure.
async function run(role, assignment, modelOverride, label, worktree) {
  const { route, body } = await contractFor(role);
  const task = body + '\n\n---\n\n' + assignment
    + '\n\nEnd your report with a JSON object matching .pi/schemas/worker-result.json'
    + ' (status, changed_paths, checks_run, stop_reason).';
  const args = {
    name: (label || role) + '-' + slug, runner: 'pi',
    model: modelOverride || route.model,
    thinking: route.thinking, tools: route.tools, schema: workerSchema,
    extensions: true, worktree: worktree === true, timeoutMs: (role === 'plan' || role === 'general') ? 900000 : 600000, task,
  };
  try { return await tools.call({ ref: 'agents.run', args }); }
  catch (e) {
    // Respawn exactly once, and only on transient provider/transport faults.
    const msg = String((e && e.message) || e);
    if (!/no api key|provider|transport|econn|etimedout|rate.?limit|429/i.test(msg))
      throw new Error(label + ' failed (non-transient): ' + msg);
    const retryArgs = { ...args, name: args.name + '-r2' };
    try { return await tools.call({ ref: 'agents.run', args: retryArgs }); }
    catch (e2) { throw new Error(label + ' respawn retry failed: ' + String(e2.message||e2)); }
  }
}

function trailingJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '').trimEnd();
  let depth=0, inStr=false, esc=false, start=-1, lastStart=-1, lastEnd=-1;
  for (let i=0;i<s.length;i++){const c=s[i];if(inStr){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inStr=false;continue;}
    if(c==='"')inStr=true;else if(c==='{'){if(depth===0)start=i;depth++;}else if(c==='}'){depth--;if(depth===0){lastStart=start;lastEnd=i;}}}
  if(lastStart<0) throw new Error('no trailing JSON object in report');
  return JSON.parse(s.slice(lastStart,lastEnd+1));
}

function requireCompletedRun(result, role, expectedModel, readOnly) {
  if (!result || result.status !== 'completed') throw new Error(role + ' run did not complete: ' + String(result&&result.status));
  const env = result.value && typeof result.value === 'object' ? result.value : trailingJson(result.text);
  if (!env || env.status !== 'done') throw new Error(role + ' envelope status is not done');
  if (!Array.isArray(env.changed_paths) || !Array.isArray(env.checks_run) || typeof env.stop_reason !== 'string')
    throw new Error(role + ' envelope missing required fields');
  if (readOnly && env.changed_paths.length !== 0) throw new Error(role + ' read-only run reported changed paths');
  return env;
}

// Host-log proof of a successful approved external tool call (same gate /team
// uses). Worker prose never satisfies this.
async function successfulResearchTools(result) {
  const stat = await tools.call({ ref: 'agents.status', args: { id: result.id } });
  const log = String((stat && stat.logFile) || '');
  if (!/^\/(?:data\/)?tmp\/pi-fabric-runs-[A-Za-z0-9._-]+\/[a-f0-9]{32}\/events\.jsonl$/.test(log))
    throw new Error('unsafe/missing host run log path');
  const allowed = cfg.team_mode.research_evidence_tools.map(String);
  const parser = "const fs=require('fs');const allowed=new Set(JSON.parse(process.argv[1]));const found=new Set();for(const line of fs.readFileSync(process.argv[2],'utf8').split('\\n')){try{const e=JSON.parse(line);if(e.type==='tool_execution_end'&&allowed.has(e.toolName)&&e.isError===false)found.add(e.toolName)}catch{}}process.stdout.write(JSON.stringify([...found]));";
  const parsed = await mb('node -e ' + shellQuote(parser) + ' ' + shellQuote(JSON.stringify(allowed)) + ' ' + shellQuote(log), 30000);
  if (!parsed.ok) throw new Error('research gate: host log parser failed');
  let found; try { found = JSON.parse(String(parsed.output)); } catch(_) { throw new Error('research gate: malformed parser output'); }
  return Array.isArray(found) ? found : [];
}

// Discovery dispatch: <=3 explore + <=2 scout, fanned out concurrently.
const exploreAreas = ['src', '.pi', 'scripts', 'AGENTS.md']; // primary-chosen scan roots
const exploreTask = (area) => 'required_skills: []\nNight discovery (explore). Scan ' + area
  + ' for ONE candidate improvement: a reproducible bug, measurable bloat/dead-code, or doc/API drift. '
  + 'For each candidate you propose, you MUST record machine-checkable retrieved evidence in the report: '
  + 'a `fail_to_pass` shell command (failing reproduction for a bug, or a measurement command for bloat/dead-code whose output must shrink) '
  + 'AND a `pass_to_pass` array of existing checks that must stay green for the touched files '
  + '(this repo has NO global test suite — record both commands now). '
  + 'No evidence, no candidate. Read only. Put candidates in notes as JSON {id,kind,problem,evidence,fail_to_pass,pass_to_pass,paths,why}.';
const scoutTask = 'required_skills: []\nNight discovery (scout). Verify external evidence for candidate improvements. '
  + 'You MUST successfully call at least one of ' + JSON.stringify(cfg.team_mode.research_evidence_tools)
  + '. For any candidate relying on upstream behavior, record the verified source URL in result_refs as {uri,kind:"url",description}. '
  + 'If retrieval is unavailable or empty, return status blocked; never infer from memory.';

const exploreHandles = exploreAreas.slice(0,3).map((a,i) => run('explore', exploreTask(a), undefined, 'disc-explore-'+(i+1)).then(r => ({r, role:'explore', tag:'explore-'+(i+1)})));
const scoutHandles = [1,2].map(i => run('scout', scoutTask, undefined, 'disc-scout-'+i).then(r => ({r, role:'scout', tag:'scout-'+i})));
const disc = await Promise.all([...exploreHandles, ...scoutHandles].map(async h => { try { return await h; } catch(e) { return {err:String(e.message||e), tag:'?'}; } }));

// Research-tool outage during discovery => mandatory null result.
let scoutOk = false;
for (const d of disc) {
  if (d.role !== 'scout' || d.err) continue;
  try { requireCompletedRun(d.r, 'scout discovery', cfg.role_routes.scout.model, true);
    const t = await successfulResearchTools(d.r); if (t.length) scoutOk = true;
  } catch (_) {}
}
if (!scoutOk) return nullResult('discovery: research tools unavailable — null result (model memory is never evidence)');

// Collect candidates with required evidence fields; drop evidence-less ones.
let candidates = [];
for (const d of disc) {
  if (d.err) continue;
  let env; try { env = requireCompletedRun(d.r, d.tag, cfg.role_routes[d.role].model, true); } catch(_) { continue; }
  const notes = typeof env.notes === 'string' ? env.notes : JSON.stringify(env.notes || env.checks_run || {});
  let arr; try { arr = JSON.parse(notes); if (!Array.isArray(arr) && arr && arr.id) arr = [arr]; } catch(_) { continue; }
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    if (!c || !c.id || !c.problem || !c.fail_to_pass || !Array.isArray(c.pass_to_pass) || !c.paths) continue;
    candidates.push({ id: String(c.id), kind: String(c.kind||'bug'), problem: String(c.problem),
      evidence: c.evidence || '', fail_to_pass: String(c.fail_to_pass),
      pass_to_pass: c.pass_to_pass.map(String), paths: c.paths.map(String), why: String(c.why||'') });
  }
}
// Cap candidate set to keep the advisor bounded.
candidates = candidates.slice(0, 8);

const cur1 = await tools.call({ ref: 'mesh.get', args: { key: BOARD } });
await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: cur1.version,
  value: { ...cur1.value, phase: 'advisor', candidates: candidates.map(c => ({id:c.id,kind:c.kind,problem:c.problem,fail_to_pass:c.fail_to_pass,pass_to_pass:c.pass_to_pass,paths:c.paths})) } } });

if (candidates.length === 0) return nullResult('discovery: no evidence-backed candidates — null result');
```

## Phase 2 — Advisor gate

One `plan`-route reasoning agent (Claude Bridge, read-only) scores the
candidate set on three axes — **problem**, **evidence**, **why-not-churn** —
and selects **at most one** candidate or none. It returns a JSON object
`{ select: string|null, rationale: string, churn_risk: string }`. `select`
must be a candidate `id` or `null`. A null selection is a valid, expected
outcome and exits cleanly with a log entry.

```typescript
const advisorTask = 'required_skills: []\nNight advisor gate. You receive a JSON array of evidence-backed candidates. '
  + 'For each, score: (1) problem — is it a real defect worth fixing overnight; (2) evidence — is the retrieved evidence '
  + 'machine-checkable and reproducible; (3) why-not-churn — does fixing it risk manufactured work, noise, or churn '
  + 'for no real value. Select AT MOST ONE candidate id to implement, or null if none is worth it. '
  + 'Put the JSON object { "select": "<id or null>", "rationale": "...", "churn_risk": "..." } in the notes field of your final worker-result envelope. '
  + 'Null is the expected outcome when nothing is worth overnight churn.\n\nCandidates:\n' + JSON.stringify(candidates, null, 2);
const advisor = await run('plan', advisorTask, undefined, 'advisor');
let sel;
try {
  const env = requireCompletedRun(advisor, 'plan advisor', cfg.role_routes.plan.model, true);
  sel = typeof env.notes === 'string' ? JSON.parse(env.notes) : (env.notes || null);
}
catch (e) { return nullResult('advisor: worker failed or selection unparseable: ' + String(e.message||e)); }
const selectedId = (sel && (sel.select || sel.id)) ? String(sel.select || sel.id) : null;
const chosen = candidates.find(c => c.id === selectedId) || null;

const cur2 = await tools.call({ ref: 'mesh.get', args: { key: BOARD } });
await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: cur2.version,
  value: { ...cur2.value, phase: chosen ? 'implement' : 'null', selected: chosen ? chosen.id : null,
    advisor_rationale: String((sel && sel.rationale) || ''), churn_risk: String((sel && sel.churn_risk) || '') } } });

if (!chosen) return nullResult('advisor: no candidate selected — null result. rationale: ' + String((sel&&sel.rationale)||'none'));
```

## Phase 3 — Implement

Branch `night/YYYY-MM-DD-<slug>`. Implementation reuses the `/team` dispatch
doctrine: the chosen candidate becomes a single owned unit dispatched to the
GLM pool (`general` route, `worktree: true`), gated on the recorded evidence
commands. The implement gate is SWE-bench-style and BOTH must hold:

- **FAIL_TO_PASS:** the recorded `fail_to_pass` command (failing reproduction
  for a bug; measurement command whose output must shrink for bloat/dead-code)
  now passes / shrinks as recorded.
- **PASS_TO_PASS:** every recorded `pass_to_pass` command (per-candidate
  existing checks for the touched files) stays green. This repo has no global
  suite, so PASS_TO_PASS is the candidate's recorded per-target checks —
  discovery recorded both commands precisely for this reason.

Up to `MAX_IMPLEMENT_CYCLES` (5) review/retry cycles. Each cycle: dispatch the
implementer in a fresh worktree, gate its diff on FAIL_TO_PASS + PASS_TO_PASS,
and on failure steer/retry (one respawn retry per transient provider fault).
If all 5 cycles fail to gate, park with a report and **no PR**.

```typescript
const branch = 'night/' + DAY + '-' + slug.replace(/^night-/, '');
const implTask = 'required_skills: []\nNight implement. Candidate: ' + JSON.stringify(chosen, null, 2)
  + '\nYou run inside an isolated Git worktree (your cwd). Edit only the owned paths: ' + JSON.stringify(chosen.paths)
  + '. Do not commit, push, branch, delete, or run destructive ops. '
  + 'Make the minimal change so the FAIL_TO_PASS command passes AND every PASS_TO_PASS command stays green. '
  + 'Run BOTH command sets yourself before reporting; record outputs in checks_run. '
  + 'Run `node .pi/tools/quality/run-pack.mjs <your changed paths>` and fix findings; record it as checks_run name "quality-pack".';

async function gateImpl(result, runName) {
  const g = { passed:false, diff:'', worktree:'', out:'', error:'' };
  try {
    requireCompletedRun(result, 'general implementer', cfg.role_routes.general.model, false);
    // agents.run returns no worktree path; worktree:true creates branch
    // pi-fabric/<name>-<id>, so resolve the path from git worktree list.
    const wl = await mb('git -C ' + shellQuote(ROOT) + ' worktree list --porcelain');
    if (!wl.ok) throw new Error('git worktree list failed');
    let wt = '';
    for (const block of String(wl.output).split('\n\n')) {
      if (block.includes('branch refs/heads/pi-fabric/' + runName + '-')) {
        const m = block.match(/^worktree (.+)$/m);
        if (m) { wt = m[1]; break; }
      }
    }
    if (!wt) throw new Error('worktree not found for pi-fabric/' + runName + '-*');
    g.worktree = String(wt);
    if (!/^\/[A-Za-z0-9._/-]+$/.test(String(wt)) || String(wt).indexOf('..') !== -1) throw new Error('unsafe worktree path');
    const wtHead = await mb('git -C ' + shellQuote(String(wt)) + ' rev-parse HEAD');
    if (!wtHead.ok || String(wtHead.output).trim() !== ROOT_HEAD) throw new Error('worktree HEAD diverges from ROOT HEAD (worker committed)');
    // Reject deletion/rename/copy and out-of-ownership paths (Git authoritative).
    const stRes = await mb('git -C ' + shellQuote(String(wt)) + ' status --porcelain=v1 -z --untracked-files=all');
    if (!stRes.ok) throw new Error('worktree git status failed');
    const recs = String(stRes.output).split('\0').filter(Boolean);
    const owned = new Set(chosen.paths.map(String));
    for (const rec of recs) {
      const xy = rec.slice(0, 2);
      const p = rec.slice(3);
      if (/[RC]/.test(xy)) throw new Error('rename/copy rejected in worktree: ' + p);
      if (xy.includes('D')) throw new Error('deletion rejected in worktree: ' + p);
      if (!owned.has(p)) throw new Error('out-of-ownership change in worktree: ' + p);
    }
    // FAIL_TO_PASS + PASS_TO_PASS gate — the recorded evidence commands, run
    // inside the worktree, BOTH must hold. These are the candidate's own
    // recorded commands (primary-controlled plumbing `cd <worktree> && <cmd>`).
    const ftp = await mb('cd ' + shellQuote(String(wt)) + ' && ' + chosen.fail_to_pass, 180000);
    g.out += 'FAIL_TO_PASS: ' + String(ftp.output||'').slice(0,300) + '\n';
    if (!ftp.ok) throw new Error('FAIL_TO_PASS failed: ' + String(ftp.output||''));
    for (const cmd of chosen.pass_to_pass) {
      const ptp = await mb('cd ' + shellQuote(String(wt)) + ' && ' + cmd, 180000);
      if (!ptp.ok) throw new Error('PASS_TO_PASS failed (' + cmd + '): ' + String(ptp.output||''));
    }
    g.passed = true;
  } catch (e) { g.error = String(e.message||e); }
  return g;
}

let integrated = false; let implReport = ''; let implWorktree = '';
for (let cycle = 1; cycle <= MAX_IMPLEMENT_CYCLES && !integrated; cycle++) {
  const cur = await tools.call({ ref: 'mesh.get', args: { key: BOARD } });
  await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: cur.version,
    value: { ...cur.value, phase: 'implement', implement_cycle: cycle } } });
  let result;
  try { result = await run('general', implTask + '\n\nimplement cycle ' + cycle, undefined, 'impl-'+cycle, true); }
  catch (e) { implReport = 'implement cycle ' + cycle + ' dispatch failed: ' + String(e.message||e); continue; }
  const g = await gateImpl(result, 'impl-' + cycle + '-' + slug);
  if (g.passed) { integrated = true; implWorktree = g.worktree; implReport = 'gated on FAIL_TO_PASS + PASS_TO_PASS in cycle ' + cycle; }
  else implReport = 'cycle ' + cycle + ' gate failed: ' + g.error;
}

const cur3 = await tools.call({ ref: 'mesh.get', args: { key: BOARD } });
await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: cur3.version,
  value: { ...cur3.value, phase: integrated ? 'pr' : 'parked',
    status: integrated ? 'running' : ('parked: ' + implReport) } } });

if (!integrated) return nullResult('implement: ' + MAX_IMPLEMENT_CYCLES + ' cycles exhausted, candidate not gated — no PR. ' + implReport);
```

## Phase 4 — PR

Push the `night/*` branch and open **one** draft PR. Never push or merge
`main`/`master`. Git plumbing via `pi.bash` inside `fabric_exec`
is governed by Fabric approvals (the project guard exempts fabric tools —
verified live); the guard's scoped `night/*` carve-out covers the primary's
native bash path as defense in depth. Commits use Conventional Commit
messages (guard-enforced on the native path). The PR body carries the evidence section,
the reproduction commands, and a run-log reference. All git/gh plumbing runs
from the primary session's native bash path (the Fabric sandbox cannot
git-write).

```typescript
// Integrate the gated worktree files into ROOT through the same schema
// transaction /team uses (file transaction, pre-image-guarded, atomic rollback)
// — then create the night/* branch, commit, push, and open the draft PR.
const wt = String(implWorktree);
const integratedPaths = chosen.paths;
const sha256File = async (abs) => {
  const h = await mb('sha256sum ' + shellQuote(abs));
  if (!h.ok) throw new Error('sha256sum failed: ' + abs);
  return 'sha256:' + String(h.output).trim().slice(0,64);
};
const ops = [], posts = [], preImages = [];
for (const rel of integratedPaths) {
  let preSha = null; try { preSha = await sha256File(ROOT + '/' + rel); } catch(_) {}
  const postSha = await sha256File(wt + '/' + rel);
  const content = String(await pi.read({ path: wt + '/' + rel }));
  ops.push({ kind:'write', path:rel, content, expected: preSha ? { sha256: preSha } : { absent:true } });
  posts.push({ kind:'file_sha256', path:rel, sha256: postSha });
  preImages.push(preSha ? { kind:'file_sha256', path:rel, sha256: preSha } : { kind:'file_absent', path:rel });
}
const hyp = await tools.call({ ref:'schema.hypothesize', args:{ label:'night-integrate-'+slug,
  summary:'Integrate night candidate ' + chosen.id + ' into clean ROOT; pre-image-guarded, byte-exact.', evidence: preImages } });
const cert = await tools.call({ ref:'schema.verify', args:{ hypothesisId: hyp.hypothesisId } });
if (!cert || cert.verified !== true) return nullResult('PR: pre-image verification failed — ROOT drifted; no write landed');
await tools.call({ ref:'schema.commit', args:{ hypothesisId: hyp.hypothesisId, certificate: cert.certificate,
  operations: ops, postconditions: posts } });

// Re-run PASS_TO_PASS in ROOT (exact recorded commands) — fail closed.
for (const cmd of chosen.pass_to_pass) {
  const rv = await mb(cmd, 180000);
  if (!rv.ok) return nullResult('PR: ROOT PASS_TO_PASS failed (' + cmd + ') — no PR');
}

// Create the night/* branch, commit (Conventional Commit), push (guard allows
// night/*), open ONE draft PR. Never main/master.
const commitMsg = 'fix(night): ' + chosen.problem.slice(0,72).replace(/\n/g,' ');
// Separate plumbing steps. The push is emitted standalone and unquoted so the
// guard's native-path carve-out matches it verbatim; `branch` is
// primary-constructed and validated against a safe charset first.
if (!/^night\/[A-Za-z0-9.-]+$/.test(branch)) return nullResult('PR: unsafe branch name: ' + branch);
const s1 = await mb('git -C ' + shellQuote(ROOT) + ' checkout -b ' + branch, 60000);
if (!s1.ok) return nullResult('PR: checkout -b failed: ' + String(s1.output||''));
const s2 = await mb('git -C ' + shellQuote(ROOT) + ' add -- ' + integratedPaths.map(shellQuote).join(' '), 60000);
if (!s2.ok) return nullResult('PR: git add failed: ' + String(s2.output||''));
const s3 = await mb('git -C ' + shellQuote(ROOT) + ' commit -m ' + shellQuote(commitMsg), 60000);
if (!s3.ok) return nullResult('PR: commit failed: ' + String(s3.output||''));
const s4 = await mb('git push origin ' + branch, 300000);
if (!s4.ok) return nullResult('PR: push failed (night/* carve-out present?): ' + String(s4.output||''));

const prBody = '## Night autonomous PR\n\n**Candidate:** ' + chosen.id + ' (' + chosen.kind + ')\n\n'
  + '### Problem\n' + chosen.problem + '\n\n'
  + '### Evidence\n' + chosen.evidence + '\n\n'
  + '### Reproduction (FAIL_TO_PASS)\n```bash\n' + chosen.fail_to_pass + '\n```\n\n'
  + '### PASS_TO_PASS (must stay green)\n```bash\n' + chosen.pass_to_pass.join('\n') + '\n```\n\n'
  + '### Run log\n' + STAGE_DIR + '/ (slug ' + slug + ')\n\n'
  + 'Merge remains a human decision.';
const prCreate = await mb(
  'cd ' + shellQuote(ROOT) + ' && gh pr create --draft --head ' + shellQuote(branch) +
  ' --base main --title ' + shellQuote(commitMsg) +
  ' --body ' + shellQuote(prBody), 300000);
if (!prCreate.ok) return nullResult('PR: gh pr create --draft failed: ' + String(prCreate.output||''));
const prUrl = String(prCreate.output).trim().split('\n').pop();

const cur4 = await tools.call({ ref: 'mesh.get', args: { key: BOARD } });
await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: cur4.version,
  value: { ...cur4.value, phase: 'notify', status: 'pr-opened', pr_url: prUrl } } });
```

## Phase 5 — Notify

```typescript
const notifyMsg = 'night PR opened: ' + prUrl;
await mb('herdr notification show ' + shellQuote(notifyMsg), 30000);
return { outcome: 'pr', pr_url: prUrl, branch, candidate: chosen.id };
```

## Null-result helper

```typescript
async function nullResult(reason) {
  const c = await tools.call({ ref: 'mesh.get', args: { key: BOARD } });
  await tools.call({ ref: 'mesh.put', args: { key: BOARD, ifVersion: c.version,
    value: { ...(c.value||{}), phase: 'null', status: 'null-result: ' + reason } } });
  await mb('mkdir -p ' + shellQuote(STAGE_DIR));
  await pi.write({ path: STAGE_DIR + '/null-result.md', content: '# Night null result\n\n- reason: ' + reason + '\n- slug: ' + slug + '\n- day: ' + DAY + '\n' });
  await mb('herdr notification show ' + shellQuote('night null result: ' + reason), 30000);
  return { outcome: 'null result', reason };
}
```

## Stop and report

- **PR opened:** report the PR URL, the `night/*` branch, the candidate id, the
  FAIL_TO_PASS/PASS_TO_PASS commands, and the run-log directory. Merge is human.
- **null result:** report the reason (preflight / discovery / advisor / implement
  / PR) and the slug. A null result is a clean, expected exit, not a failure.
- **Parked (5 cycles exhausted):** report the last gate error and the retained
  worktree path for manual recovery; never delete the worktree.

## Notes

- `/night` composes the `/team` dispatch doctrine without modifying `/team`: it
  reuses `role_routes` (explore/scout/plan/general), the provider-pinned GLM pool,
  isolated worktrees with a HEAD-divergence gate, the verify-allowlist pattern
  (here the candidate's own recorded FAIL_TO_PASS + PASS_TO_PASS commands), and
  the `schema.hypothesize → schema.verify → schema.commit` file transaction for
  integration. It adds the night-specific orchestration (preflight, bounded
  discovery with the evidence rule, the advisor gate, the PR/notify tail) on top.
- The evidence rule is the kill criterion: any implemented change lacking
  retrieved evidence ("a rock") kills the pipeline. Model memory is never
  evidence — the research-tool outage observed 2026-07-20 is encoded as a hard
  null-result rule in preflight and discovery.
- Repo has no global suite, so PASS_TO_PASS is per-candidate: discovery records
  both the failing reproduction (FAIL_TO_PASS) and the existing checks for the
  touched files (PASS_TO_PASS) at candidate time, and the implement gate replays
  both verbatim.
- Git/gh plumbing runs from the primary session's native bash path; the Fabric
  sandbox cannot git-write. The `git push origin night/<...>` carve-out and the
  `gh pr create --draft` standing authorization live in `guard.ts` and
  `AGENTS.md` (parallel policy tasks); if either is absent, `/night` surfaces a
  blocker instead of pushing.
