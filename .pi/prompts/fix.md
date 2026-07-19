---
description: Debug and fix a bug or failing test
argument-hint: "<description of bug or error>"
agent: build
---

> **Pi execution binding:** The governed fix-and-verify TypeScript block below runs inside `fabric_exec`: `general`-only implementation uses the GLM 12 pool at medium thinking (`extensions:true`), with governed spawn/status/steer/wait, isolated worktrees, schema-transaction integration, and durable state receipts; read-only reasoning (`review`/`plan`/`debug`) runs `openai-codex/gpt-5.6-sol` at medium thinking. Full dispatch doctrine is canonical in `.pi/docs/fabric-tuning.md` (kernel in `APPEND_SYSTEM.md`).

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

### Phase 3: Governed Fix + Verify

The primary supplies `π.issue`, an evidence-backed `π.diagnosis`, a JSON array
`π.ownedPaths`, one exact `π.verifyCommand`, and `π.verifyAllowlist`. The
allowlist contains primary-approved project commands derived from inspected
project scripts, never worker prose or raw operator text. This narrow `/fix`
program edits existing files only; route additions/deletions/renames to `/ship`.

```typescript
// fabric_exec — two bounded attempts, primary gate, schema integration, root verify.
const ROOT = (await pi.bash({ cmd: 'pwd', timeoutMs: 30000 })).output.trim();
const cfg = JSON.parse(String(await pi.read(ROOT + '/.pi/config.json')));
const issue = typeof π.issue === 'string' ? π.issue.trim() : '';
const diagnosis = typeof π.diagnosis === 'string' ? π.diagnosis.trim() : '';
const verifyCommand = typeof π.verifyCommand === 'string' ? π.verifyCommand.trim() : '';
if (!issue || !diagnosis || !verifyCommand) throw new Error('issue, diagnosis, and verify command are required');
if (/[\n\r;&|`$<>]/.test(verifyCommand))
  throw new Error('shell control operators are not allowed in π.verifyCommand');
let rawOwned; let allowlist;
try { rawOwned = JSON.parse(String(π.ownedPaths || '')); } catch (_) { throw new Error('π.ownedPaths must be JSON'); }
try { allowlist = JSON.parse(String(π.verifyAllowlist || '')); } catch (_) { throw new Error('π.verifyAllowlist must be JSON'); }
if (!Array.isArray(rawOwned) || !rawOwned.length) throw new Error('owned paths are required');
if (!Array.isArray(allowlist) || !allowlist.includes(verifyCommand))
  throw new Error('verify command is not an exact allowlist member');
function normalizeRepoPath(value) {
  const s = String(value);
  if (!s || s.includes('\0') || s.includes('\\') || s[0] === '/' || /^[A-Za-z]:/.test(s))
    throw new Error('unsafe repository path: ' + s);
  if (s.split('/').some(p => !p || p === '.' || p === '..') || s === '.git' || s.startsWith('.git/'))
    throw new Error('unsafe repository path: ' + s);
  return s;
}
const ownedPaths = [...new Set(rawOwned.map(normalizeRepoPath))];
const owns = rel => ownedPaths.some(p => rel === p || rel.startsWith(p + '/'));
function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
function safeWorktree(value) {
  const s = String(value || '');
  if (!/^\/[A-Za-z0-9._/-]+$/.test(s) || s.includes('..')) throw new Error('unsafe worktree path');
  return s;
}
const status = await pi.bash({
  cmd: 'git -C ' + shellQuote(ROOT) + ' status --porcelain=v1 -z --untracked-files=all', timeoutMs: 30000,
});
if (!status.ok || String(status.output).length) throw new Error('/fix requires a clean Git root');
const head = await pi.bash({ cmd: 'git -C ' + shellQuote(ROOT) + ' rev-parse HEAD', timeoutMs: 30000 });
if (!head.ok) throw new Error('cannot read ROOT HEAD');
const ROOT_HEAD = String(head.output).trim();
const runId = Date.now().toString(36);
const initial = await tools.call({ ref: 'state.get', args: {} });
let LEDGER_HEAD = initial && initial.head && initial.head.to ? String(initial.head.to) : '';
async function ledgerReceipt(phase, summary, evidence = []) {
  const to = 'fix-' + runId + '/' + phase;
  const base = { label: 'fix ' + phase, to, summary: String(summary).slice(0, 300) };
  const args = evidence.length ? { ...base, evidence: evidence.map(String) } : base;
  try { await tools.call({ ref: 'state.transition', args: LEDGER_HEAD ? { ...args, from: LEDGER_HEAD } : args }); }
  catch (_) {
    const now = await tools.call({ ref: 'state.get', args: {} });
    const observed = now && now.head && now.head.to ? String(now.head.to) : '';
    await tools.call({ ref: 'state.transition', args: observed ? { ...args, from: observed } : args });
  }
  LEDGER_HEAD = to;
}
await ledgerReceipt('isolate', diagnosis);
const route = cfg.role_routes.general;
const contract = String(await pi.read(ROOT + '/' + route.contract));
async function waitGoverned(id, timeoutMs) {
  const started = Date.now(); let steered = false;
  for (;;) {
    const st = await tools.call({ ref: 'agents.status', args: { id } });
    const s = String((st && st.status) || '');
    if (s && !['running', 'pending', 'starting'].includes(s)) break;
    if (!steered && Date.now() - started > timeoutMs * 0.8) {
      steered = true;
      try { await tools.call({ ref: 'agents.steer', args: { id,
        message: 'Deadline near: run the exact verification and return now.' } }); } catch (_) {}
    }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  return tools.call({ ref: 'agents.wait', args: { id } });
}
let gated = null; let priorFailure = '';
for (let attempt = 1; attempt <= 2 && !gated; attempt++) {
  try {
    const model = attempt === 1 ? route.model : (route.alternate_model || route.model);
    const handle = await tools.call({ ref: 'agents.spawn', args: {
      name: 'fix-' + runId + '-a' + attempt, model, thinking: route.thinking, tools: route.tools,
      extensions: true, worktree: true, timeoutMs: 900000,
      task: contract + '\n\n---\n\nrequired_skills: [] (load no skill)\nBug: ' + issue +
        '\nRoot cause: ' + diagnosis + '\nOwned existing paths: ' + JSON.stringify(ownedPaths) +
        '\nVerification: ' + verifyCommand + (priorFailure ? '\nPrior gate failure: ' + priorFailure : '') +
        '\nAdd the regression assertion in an existing owned test file, make the minimal fix, and verify. ' +
        'Do not add/delete/rename files; do not commit, push, branch, or clean up.'
    } });
    const result = await waitGoverned(handle.id, 900000);
    if (!result || result.status !== 'completed') throw new Error('worker status: ' + String(result && result.status));
    const wt = safeWorktree(result.worktree);
    const wtHead = await pi.bash({ cmd: 'git -C ' + shellQuote(wt) + ' rev-parse HEAD', timeoutMs: 30000 });
    if (!wtHead.ok || String(wtHead.output).trim() !== ROOT_HEAD) throw new Error('worker committed or diverged');
    const changed = await pi.bash({
      cmd: 'git -C ' + shellQuote(wt) + ' status --porcelain=v1 -z --untracked-files=all', timeoutMs: 30000,
    });
    if (!changed.ok) throw new Error('cannot inspect worker worktree');
    const paths = [];
    for (const record of String(changed.output).split('\0')) {
      if (!record) continue;
      if (record.length < 4 || record[2] !== ' ') throw new Error('malformed worktree status');
      const xy = record.slice(0, 2);
      if (/[DRC?A]/.test(xy) || ['DD','AU','UD','UA','DU','AA','UU'].includes(xy))
        throw new Error('new/delete/rename/copy/conflict change rejected: ' + xy);
      const rel = normalizeRepoPath(record.slice(3));
      if (!owns(rel)) throw new Error('path outside ownership: ' + rel);
      if (!paths.includes(rel)) paths.push(rel);
    }
    if (!paths.length) throw new Error('worker returned no changes');
    const diffCheck = await pi.bash({
      cmd: 'git -C ' + shellQuote(wt) + ' diff HEAD --check -- ' + paths.map(shellQuote).join(' '), timeoutMs: 60000,
    });
    if (!diffCheck.ok) throw new Error('diff check failed');
    const verified = await pi.bash({ cmd: 'cd ' + shellQuote(wt) + ' && ' + verifyCommand, timeoutMs: 180000 });
    if (!verified.ok) throw new Error('worktree verification failed: ' + String(verified.output).slice(0, 500));
    const files = [];
    for (const rel of paths) {
      const content = String(await pi.read(wt + '/' + rel));
      if (content.includes('\0')) throw new Error('binary change rejected: ' + rel);
      files.push({ path: rel, content });
    }
    gated = { workerId: result.id, worktree: wt, paths, files };
    await ledgerReceipt('fix-attempt-' + attempt, 'gated: ' + paths.join(', '));
  } catch (e) {
    priorFailure = String(e && (e.message || e) || 'attempt failed').slice(0, 800);
    await ledgerReceipt('attempt-' + attempt + '-failed', priorFailure);
    if (attempt === 2) throw new Error('fix failed twice: ' + priorFailure);
  }
}
if (!gated) throw new Error('fix loop ended without a gated result');
async function sha256File(path) {
  const r = await pi.bash({ cmd: 'sha256sum ' + shellQuote(path), timeoutMs: 30000 });
  const hex = String(r.output).trim().slice(0, 64);
  if (!r.ok || !/^[a-f0-9]{64}$/.test(hex)) throw new Error('sha256 failed: ' + path);
  return 'sha256:' + hex;
}
const ops = []; const posts = []; const preImages = []; const restoreOps = [];
for (const file of gated.files) {
  const rootPath = ROOT + '/' + file.path;
  const before = String(await pi.read(rootPath));
  if (before.includes('\0')) throw new Error('binary pre-image rejected: ' + file.path);
  const preSha = await sha256File(rootPath);
  const postSha = await sha256File(gated.worktree + '/' + file.path);
  ops.push({ kind: 'write', path: file.path, content: file.content, expected: { sha256: preSha } });
  posts.push({ kind: 'file_sha256', path: file.path, sha256: postSha });
  preImages.push({ kind: 'file_sha256', path: file.path, sha256: preSha });
  restoreOps.push({ kind: 'write', path: file.path, content: before, expected: { sha256: postSha } });
}
const hyp = await tools.call({ ref: 'schema.hypothesize', args: {
  label: 'fix-' + runId, summary: 'Integrate the gated fix into unchanged ROOT.', evidence: preImages,
} });
const cert = await tools.call({ ref: 'schema.verify', args: { hypothesisId: hyp.hypothesisId } });
if (!cert || cert.verified !== true) throw new Error('ROOT pre-image drift');
await tools.call({ ref: 'schema.commit', args: {
  hypothesisId: hyp.hypothesisId, certificate: cert.certificate, operations: ops, postconditions: posts,
} });
await ledgerReceipt('integrate', 'schema wrote: ' + gated.paths.join(', '));
let rootCheck = null;
try { rootCheck = await pi.bash({ cmd: 'cd ' + shellQuote(ROOT) + ' && ' + verifyCommand, timeoutMs: 180000 }); }
catch (_) { rootCheck = null; }
if (!rootCheck || !rootCheck.ok) {
  const rollback = await tools.call({ ref: 'schema.hypothesize', args: {
    label: 'fix-rollback-' + runId, summary: 'Restore pre-fix bytes after failed root verification.', evidence: posts,
  } });
  const rollbackCert = await tools.call({ ref: 'schema.verify', args: { hypothesisId: rollback.hypothesisId } });
  if (!rollbackCert || rollbackCert.verified !== true) throw new Error('root verify and rollback verification failed');
  await tools.call({ ref: 'schema.commit', args: {
    hypothesisId: rollback.hypothesisId, certificate: rollbackCert.certificate,
    operations: restoreOps, postconditions: preImages,
  } });
  await ledgerReceipt('rollback', 'root verification failed; pre-fix bytes restored');
  throw new Error('root verification failed; ROOT rolled back');
}
await ledgerReceipt('verify', 'worktree and ROOT verification passed', [verifyCommand]);
return { workerId: gated.workerId, changedPaths: gated.paths,
  verification: String(rootCheck.output).slice(0, 4000), ledgerHead: LEDGER_HEAD };
```

### Phase 4: Verification Result

Success requires the exact command to pass in the worker worktree and again in
ROOT after schema integration. A second failed attempt stops with retained
worktrees; a failed ROOT check restores the existing pre-fix bytes atomically.

## Output

Report:
1. Root cause (with file:line)
2. Fix applied
3. Verification results
4. What else was considered and rejected
