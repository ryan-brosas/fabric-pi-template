// B3 — Host-derived dispatch and staging.
//
// Verifies the controller (not the model) selects the lane profile, the model
// never supplies capabilities, the source view is read-only with path/symlink
// containment, writes route to exact reserved staging files, post-run
// candidates are hash-validated, and the writer token is held until staged
// mutations and cancellation barriers settle.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/dispatch.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  readFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManifest } from "./bootstrap.ts";
import {
  deriveProfile,
  dispatch,
  resolveSourceView,
  isProtected,
  PHASE_TO_LANE,
} from "./dispatch.ts";
import {
  reserveStagingPath,
  stageWrite,
  commitStaged,
  discardStaged,
  validateCandidates,
  WriterToken,
} from "./staging.ts";

const { manifest } = loadManifest(
  // Explicit path: bootstrap.ts's no-arg CANONICAL_MANIFEST_PATH default resolves
  // one level too high (latent A1 defect, out of B3 scope). Pass the real path.
  join(import.meta.dirname, "..", "away-sandbox.json"),
);

const REAL_PROTECTED = manifest.protected_paths;
const REAL_RUNTIME_PROTECTED = manifest.runtime_protected_paths;

function makeSourceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "b3-src-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "real.ts"), "export const x = 1;\n");
  // a symlink escaping the source root
  symlinkSync("/etc", join(root, "src", "escape"));
  // a legitimate dir + file
  mkdirSync(join(root, "pkg"), { recursive: true });
  writeFileSync(join(root, "pkg", "mod.ts"), "y\n");
  return root;
}

function makeStagingRoot(): string {
  return mkdtempSync(join(tmpdir(), "b3-stage-"));
}

test("deriveProfile: each controller phase maps to the correct lane", () => {
  assert.equal(deriveProfile("explore", manifest).laneId, "local-explorer");
  assert.equal(deriveProfile("research", manifest).laneId, "external-scout");
  assert.equal(deriveProfile("implement", manifest).laneId, "writer");
  assert.equal(deriveProfile("review", manifest).laneId, "reviewer");
  assert.equal(deriveProfile("verify", manifest).laneId, "verifier");
});

test("deriveProfile: lane host_call_refs match the lane role", () => {
  const writer = deriveProfile("implement", manifest);
  assert.ok(writer.lane.host_call_refs.includes("away_stage_write"));
  assert.ok(writer.lane.host_call_refs.includes("away_commit_staged"));
  assert.ok(!writer.lane.host_call_refs.includes("away_run_verify"));
  const verifier = deriveProfile("verify", manifest);
  assert.ok(verifier.lane.host_call_refs.includes("away_run_verify"));
  assert.ok(!verifier.lane.host_call_refs.includes("away_stage_write"));
  const scout = deriveProfile("research", manifest);
  assert.equal(scout.lane.network, true);
  assert.equal(deriveProfile("implement", manifest).lane.network, false);
});

test("deriveProfile: unknown phase is rejected before Fabric", () => {
  assert.throws(() => deriveProfile("writer-please", manifest), /unknown profile/);
  assert.throws(() => deriveProfile("", manifest), /unknown profile/);
});

test("PHASE_TO_LANE is a complete, host-owned mapping", () => {
  assert.deepEqual(Object.keys(PHASE_TO_LANE).sort(), [
    "explore",
    "implement",
    "research",
    "review",
    "verify",
  ]);
  for (const phase of Object.keys(PHASE_TO_LANE)) {
    assert.ok(
      manifest.lanes[PHASE_TO_LANE[phase as keyof typeof PHASE_TO_LANE]],
      `lane for phase ${phase} must exist in the manifest`,
    );
  }
});

test("dispatch: lane is removed from untrusted envelopes (host re-derives)", () => {
  const r = dispatch("implement", { lane: "writer", task: "fix bug" }, manifest);
  assert.equal(r.laneId, "writer");
  assert.equal("lane" in r.envelope, false);
  assert.deepEqual(r.envelope, { task: "fix bug" });
});

test("dispatch: envelope with no lane is fine", () => {
  const r = dispatch("explore", { query: "find x" }, manifest);
  assert.equal(r.laneId, "local-explorer");
  assert.equal("lane" in r.envelope, false);
});

test("dispatch: model-supplied unknown lane value is rejected", () => {
  assert.throws(() => dispatch("implement", { lane: "evil" }, manifest), /unknown profile/);
});

test("dispatch: model-supplied capabilities are rejected", () => {
  for (const field of ["model", "tools", "cwd", "env", "args", "risks", "agents"]) {
    const env: Record<string, unknown> = { [field]: field === "tools" ? ["x"] : "x" };
    assert.throws(() => dispatch("implement", env, manifest), /model-supplied capability/);
  }
});

test("isProtected: matches file + dir-prefixed protected paths", () => {
  assert.equal(isProtected(".pi/fabric.json", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), true);
  assert.equal(isProtected(".pi/settings.json", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), true);
  assert.equal(isProtected("AGENTS.md", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), true);
  assert.equal(isProtected(".pi/prompts/create.md", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), true);
  assert.equal(
    isProtected(".pi/away-runtime/bootstrap.ts", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    true,
  );
  assert.equal(
    isProtected(".opencode/command/ship.md", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    true,
  );
  assert.equal(isProtected(".pi/npm/node_modules/x", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), true);
  assert.equal(isProtected("src/real.ts", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), false);
  assert.equal(isProtected("pkg/mod.ts", REAL_PROTECTED, REAL_RUNTIME_PROTECTED), false);
});

test("resolveSourceView: normal in-tree file resolves", () => {
  const root = makeSourceRoot();
  const r = resolveSourceView(root, "src/real.ts", REAL_PROTECTED, REAL_RUNTIME_PROTECTED);
  assert.equal(r.rel, join("src", "real.ts"));
  assert.equal(r.abs, join(root, "src", "real.ts"));
});

test("resolveSourceView: path escape is rejected", () => {
  const root = makeSourceRoot();
  assert.throws(
    () => resolveSourceView(root, "../etc/passwd", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /escape/,
  );
  assert.throws(
    () => resolveSourceView(root, "../../etc/hostname", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /escape/,
  );
});

test("resolveSourceView: absolute model-supplied path is rejected", () => {
  const root = makeSourceRoot();
  assert.throws(
    () => resolveSourceView(root, "/etc/passwd", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /absolute/,
  );
});

test("resolveSourceView: symlink escaping the source root is rejected", () => {
  const root = makeSourceRoot();
  assert.throws(
    () => resolveSourceView(root, "src/escape/hostname", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /escape/,
  );
});

test("resolveSourceView: protected source paths are rejected (read-only view)", () => {
  const root = makeSourceRoot();
  assert.throws(
    () => resolveSourceView(root, ".pi/fabric.json", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /protected/,
  );
  assert.throws(
    () =>
      resolveSourceView(
        root,
        ".pi/away-runtime/bootstrap.ts",
        REAL_PROTECTED,
        REAL_RUNTIME_PROTECTED,
      ),
    /protected/,
  );
  assert.throws(
    () => resolveSourceView(root, ".pi/prompts/create.md", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /protected/,
  );
  assert.throws(
    () => resolveSourceView(root, "AGENTS.md", REAL_PROTECTED, REAL_RUNTIME_PROTECTED),
    /protected/,
  );
});

test("reserveStagingPath: declared target reserves an exact staging file", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  assert.equal(r.reservedRel, join("src", "foo.ts"));
  assert.equal(r.reservedAbs, join(staging, "src", "foo.ts"));
  assert.equal(r.stagingRoot, staging);
});

test("reserveStagingPath: undeclared target rejected", () => {
  const staging = makeStagingRoot();
  assert.throws(() => reserveStagingPath("", staging), /undeclared/);
});

test("reserveStagingPath: absolute target rejected", () => {
  const staging = makeStagingRoot();
  assert.throws(() => reserveStagingPath("/abs/x", staging), /absolute|escape/);
});

test("reserveStagingPath: path-prefix expansion rejected", () => {
  const staging = makeStagingRoot();
  assert.throws(() => reserveStagingPath("src/../escape.ts", staging), /escape/);
  assert.throws(() => reserveStagingPath("../escape.ts", staging), /escape/);
});

test("stageWrite: writes exactly the reserved content atomically", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "export const z = 2;\n");
  assert.equal(readFileSync(r.reservedAbs, "utf8"), "export const z = 2;\n");
});

test("stageWrite: multiple distinct reservations coexist; each exact", () => {
  const staging = makeStagingRoot();
  const a = reserveStagingPath("src/a.ts", staging);
  const b = reserveStagingPath("src/b.ts", staging);
  stageWrite(a, "a\n");
  stageWrite(b, "b\n");
  assert.equal(readFileSync(a.reservedAbs, "utf8"), "a\n");
  assert.equal(readFileSync(b.reservedAbs, "utf8"), "b\n");
  assert.equal(existsSync(join(staging, "src", "c.ts")), false);
});

test("validateCandidates: in-reservation + matching hash returns hashes", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "hello\n");
  const out = validateCandidates([{ path: "src/foo.ts" }], [r], staging);
  assert.equal(out.length, 1);
  assert.ok(out[0].hash.length === 64);
});

test("validateCandidates: candidate outside reservations rejected", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "hello\n");
  writeFileSync(join(staging, "sneak.ts"), "x\n");
  assert.throws(
    () => validateCandidates([{ path: "sneak.ts" }], [r], staging),
    /outside reservations/,
  );
});

test("validateCandidates: hash mismatch rejected", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "hello\n");
  assert.throws(
    () => validateCandidates([{ path: "src/foo.ts", hash: "deadbeef" }], [r], staging),
    /hash mismatch/,
  );
});

test("validateCandidates: missing candidate rejected", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  assert.throws(() => validateCandidates([{ path: "src/foo.ts" }], [r], staging), /missing/);
});

test("WriterToken: commit/discard blocked while held", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "x\n");
  const token = new WriterToken();
  assert.equal(token.released, false);
  assert.throws(
    () => commitStaged(token, r, join(makeStagingRoot(), "src", "foo.ts")),
    /held|released/,
  );
  assert.throws(() => discardStaged(token, r), /held|released/);
});

test("WriterToken: in-flight writes drain before settle", async () => {
  const token = new WriterToken();
  token.beginWrite();
  let settled = false;
  const p = token.settle().then(() => {
    settled = true;
  });
  // still in flight: not settled
  await Promise.resolve();
  assert.equal(settled, false);
  token.endWrite();
  await p;
  assert.equal(settled, true);
});

test("WriterToken: release allows commit; staged file moves to destination", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "payload\n");
  const token = new WriterToken();
  token.release();
  assert.equal(token.released, true);
  const dest = join(makeStagingRoot(), "src", "foo.ts");
  commitStaged(token, r, dest);
  assert.equal(readFileSync(dest, "utf8"), "payload\n");
});

test("WriterToken: release allows discard; staged scratch removed", () => {
  const staging = makeStagingRoot();
  const r = reserveStagingPath("src/foo.ts", staging);
  stageWrite(r, "payload\n");
  const token = new WriterToken();
  token.release();
  discardStaged(token, r);
  assert.equal(existsSync(r.reservedAbs), false);
});

test("WriterToken: beginWrite after release rejected (cancellation barrier)", () => {
  const token = new WriterToken();
  token.release();
  assert.throws(() => token.beginWrite(), /released|cancelled/);
});

test("verify gate: dispatch.ts contains no raw agent-dispatch literals", () => {
  const src = readFileSync(join(import.meta.dirname, "dispatch.ts"), "utf8");
  for (const lit of ["agents.run", "agents.spawn", "agents.handoff"]) {
    assert.ok(!src.includes(lit), `dispatch.ts must not contain ${lit}`);
  }
});
