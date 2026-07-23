// lane-extension.test.ts — C2 tests for the away-sandbox lane extension.
//
// Tests the registration, per-lane firewall, arg validation, staged atomic
// writes, in-flight mutation barrier, attestation-before-success, and
// settlement-gate LOGIC in isolation (no `pi`, no Fabric capture routing — that
// end-to-end proof is D1).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/lane-extension.test.ts

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import * as os from "node:os";

import { loadManifest } from "./bootstrap.ts";
import { resolveClosure } from "./closure.ts";
import { writeAttestation } from "./executor-wrapper.mjs";
import registerAwayLane, { createLaneExtension, type LaneExtensionContext } from "./lane-extension.ts";

const REAL_MANIFEST = join(import.meta.dirname, "..", "away-sandbox.json");
const LANE_IDS = ["local-explorer", "external-scout", "writer", "reviewer", "verifier"] as const;
const FORBIDDEN_REFS = [
  "write",
  "shell",
  "agent",
  "compact",
  "schema",
  "agents.run",
  "agents.spawn",
  "agents.handoff",
];

interface Fixture {
  repoRoot: string;
  manifestPath: string;
  stagingRoot: string;
  attestDir: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const repoRoot = mkdtempSync(join(os.tmpdir(), "away-c2-"));
  mkdirSync(join(repoRoot, ".pi"), { recursive: true });
  mkdirSync(join(repoRoot, "src", "sub"), { recursive: true });
  mkdirSync(join(repoRoot, "staging"), { recursive: true });
  mkdirSync(join(repoRoot, "attest"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "hello.txt"), "hello world\nline two\n");
  writeFileSync(join(repoRoot, "src", "sub", "deep.txt"), "deep content\nmatch me\n");
  writeFileSync(join(repoRoot, "src", "protected.txt"), "secret\n");

  const real = loadManifest(REAL_MANIFEST);
  const manifest = JSON.parse(JSON.stringify(real.manifest)) as ReturnType<
    typeof loadManifest
  >["manifest"];
  manifest.control_cwd_root = join(repoRoot, "control");
  manifest.extensions.lane_extension = join(repoRoot, "lane-extension.ts");
  manifest.exec_path_override = join(repoRoot, "executor-wrapper.mjs");
  manifest.protected_paths = ["src/protected.txt", ".pi/fabric.json", "AGENTS.md"];
  manifest.runtime_protected_paths = [".pi/", "src/protected.txt"];
  const manifestPath = join(repoRoot, ".pi", "away-sandbox.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));

  return {
    repoRoot,
    manifestPath,
    stagingRoot: join(repoRoot, "staging"),
    attestDir: join(repoRoot, "attest"),
    cleanup: () => {
      try {
        rmSync(repoRoot, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

function ctxFor(
  fx: Fixture,
  laneId: string,
  commandCatalog?: ReadonlySet<string>,
): LaneExtensionContext {
  return {
    manifestPath: fx.manifestPath,
    laneId,
    stagingRoot: fx.stagingRoot,
    attestDir: fx.attestDir,
    repoRoot: fx.repoRoot,
    commandCatalog,
  };
}

/** Write a fake wrapper receipt (the A2 wrapper fsyncs this before forwarding). */
function seedWrapperReceipt(attestDir: string, laneId: string): string {
  return writeAttestation(attestDir, {
    lane: laneId,
    terminationReason: "completed",
    forwardedRefs: ["away_read"],
    deniedRefs: ["agents.run"],
    fsynced: true,
  }) as string;
}

async function callTool(
  state: ReturnType<typeof createLaneExtension>,
  name: string,
  params: Record<string, unknown>,
): Promise<ReturnType<ReturnType<typeof createLaneExtension>["tools"][number]["execute"]>> {
  const tool = state.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  return tool.execute("test", params);
}

async function rejects(p: Promise<unknown>, re: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    assert.match(String((e as Error).message), re);
    return;
  }
  assert.fail(`expected rejection matching ${re}; call succeeded`);
}

let fx: Fixture;

before(() => {
  fx = makeFixture();
});

after(() => {
  fx.cleanup();
});

describe("C2 — per-lane registration + firewall", () => {
  for (const laneId of LANE_IDS) {
    it(`registers exactly the lane's host_call_refs for ${laneId}`, () => {
      const state = createLaneExtension(ctxFor(fx, laneId));
      const real = loadManifest(fx.manifestPath);
      const expected = real.manifest.lanes[laneId].host_call_refs;
      assert.deepEqual(state.tools.map((t) => t.name).sort(), [...expected].sort());
      assert.deepEqual([...state.allowlist].sort(), [...expected].sort());
    });
  }

  it("does not expose ordinary write/shell/agent/compaction/schema refs", () => {
    for (const laneId of LANE_IDS) {
      const state = createLaneExtension(ctxFor(fx, laneId));
      const names = state.tools.map((t) => t.name);
      for (const ref of FORBIDDEN_REFS) {
        assert.ok(!names.includes(ref), `${laneId} exposed forbidden ref: ${ref}`);
      }
    }
  });

  it("external scout filesystem exposes no repository read/list/search bridge", async () => {
    const state = createLaneExtension(ctxFor(fx, "external-scout"));
    assert.equal(state.lane.network, true, "external research retains network");
    assert.equal(state.lane.filesystem, false, "external scout has no direct filesystem");
    for (const ref of ["away_read", "away_list", "away_search"]) {
      assert.ok(!state.allowlist.has(ref), `external scout exposed repository ref: ${ref}`);
    }
    await rejects(
      callTool(state, "away_read", { path: "src/hello.txt" }),
      /tool not registered: away_read/,
    );
  });

  it("rejects an unknown lane", () => {
    assert.throws(() => createLaneExtension(ctxFor(fx, "evil")), /unknown lane: evil/);
  });
});

describe("C2 — away_read arg validation", () => {
  it("reads a valid source file", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    const r = await callTool(state, "away_read", { path: "src/hello.txt" });
    assert.match(r.content[0].text, /hello world/);
  });

  it("rejects a protected path", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(
      callTool(state, "away_read", { path: "src/protected.txt" }),
      /protected path rejected/,
    );
  });

  it("rejects an absolute path", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(callTool(state, "away_read", { path: "/etc/passwd" }), /absolute path rejected/);
  });

  it("rejects a path-escape", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(callTool(state, "away_read", { path: "../escape.txt" }), /path escape rejected/);
  });

  it("rejects a model-supplied capability field (broad-risk)", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(
      callTool(state, "away_read", { path: "src/hello.txt", mode: "0o777" }),
      /unexpected argument: mode/,
    );
  });
});

describe("C2 — away_list / away_search", () => {
  it("lists a directory", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    const r = await callTool(state, "away_list", { path: "src" });
    assert.ok(r.content[0].text.includes("hello.txt"));
  });

  it("rejects a protected directory", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(callTool(state, "away_list", { path: ".pi" }), /protected path rejected/);
  });

  it("searches the source view", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    const r = await callTool(state, "away_search", { pattern: "match me", path: "src" });
    const matches = JSON.parse(r.content[0].text);
    assert.ok(matches.some((m: { path: string }) => m.path.includes("deep.txt")));
  });

  it("rejects a model-supplied capability field on search", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(
      callTool(state, "away_search", { pattern: "x", recursive: true }),
      /unexpected argument: recursive/,
    );
  });
});

describe("C2 — away_stage_write staging + barrier", () => {
  it("atomically stages a write and returns a hash", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    const r = await callTool(state, "away_stage_write", { path: "src/out.txt", content: "new\n" });
    assert.match(r.content[0].text, /staged: src\/out\.txt/);
    assert.ok(existsSync(join(fx.stagingRoot, "src", "out.txt")));
    assert.equal((r.details as { stagedHash: string }).stagedHash.length, 64);
  });

  it("rejects a protected target", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(
      callTool(state, "away_stage_write", { path: "src/protected.txt", content: "x" }),
      /protected path rejected/,
    );
  });

  it("rejects a path-prefix-expansion target", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(
      callTool(state, "away_stage_write", { path: "../escape.txt", content: "x" }),
      /staging path escape rejected/,
    );
  });

  it("rejects a model-supplied capability field", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await rejects(
      callTool(state, "away_stage_write", { path: "src/x.txt", content: "x", force: true }),
      /unexpected argument: force/,
    );
  });
});

describe("C2 — commit/discard settlement gate", () => {
  it("blocks commit before the writer token is released", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await callTool(state, "away_stage_write", { path: "src/c1.txt", content: "c1\n" });
    await rejects(
      callTool(state, "away_commit_staged", { path: "src/c1.txt" }),
      /writer token held/,
    );
  });

  it("commits to the real destination after release", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await callTool(state, "away_stage_write", { path: "src/c2.txt", content: "c2\n" });
    state.release();
    const r = await callTool(state, "away_commit_staged", { path: "src/c2.txt" });
    assert.match(r.content[0].text, /committed: src\/c2\.txt/);
    assert.equal(readFileSync(join(fx.repoRoot, "src", "c2.txt"), "utf8"), "c2\n");
  });

  it("discards staged scratch after release", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    await callTool(state, "away_stage_write", { path: "src/c3.txt", content: "c3\n" });
    state.release();
    await callTool(state, "away_discard_staged", { path: "src/c3.txt" });
    assert.ok(!existsSync(join(fx.stagingRoot, "src", "c3.txt")));
  });

  it("rejects commit of an unstaged path", async () => {
    const state = createLaneExtension(ctxFor(fx, "writer"));
    state.release();
    await rejects(
      callTool(state, "away_commit_staged", { path: "src/never.txt" }),
      /nothing staged/,
    );
  });

  it("prevalidates the exact host candidate set before committing and attests once", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const attestDir = join(fx.repoRoot, `settle-attest-${suffix}`);
    mkdirSync(attestDir, { recursive: true });
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    const firstPath = `src/settle-a-${suffix}.txt`;
    const secondPath = `src/settle-b-${suffix}.txt`;
    const first = await callTool(state, "away_stage_write", { path: firstPath, content: "a\n" });
    const second = await callTool(state, "away_stage_write", { path: secondPath, content: "b\n" });
    const firstHash = (first.details as { stagedHash: string }).stagedHash;
    const secondHash = (second.details as { stagedHash: string }).stagedHash;
    seedWrapperReceipt(attestDir, "writer");
    state.release();

    await rejects(
      state.settle([{ path: firstPath, hash: firstHash }]),
      /exact candidate set/,
    );
    assert.equal(existsSync(join(fx.repoRoot, firstPath)), false);
    assert.equal(existsSync(join(fx.repoRoot, secondPath)), false);

    const result = await state.settle([
      { path: firstPath, hash: firstHash },
      { path: secondPath, hash: secondHash },
    ]);
    assert.deepEqual(result.changedPaths, [firstPath, secondPath]);
    assert.equal(readFileSync(join(fx.repoRoot, firstPath), "utf8"), "a\n");
    assert.equal(readFileSync(join(fx.repoRoot, secondPath), "utf8"), "b\n");
    assert.equal(state.isAttested(), true);
  });

  it("rejects a symlinked commit destination before any repository write", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const linkName = `escape-${suffix}`;
    const outsideName = `away-must-not-exist-${suffix}.txt`;
    symlinkSync(os.tmpdir(), join(fx.repoRoot, linkName));
    const state = createLaneExtension(ctxFor(fx, "writer"));
    const path = `${linkName}/${outsideName}`;
    const staged = await callTool(state, "away_stage_write", { path, content: "blocked\n" });
    seedWrapperReceipt(fx.attestDir, "writer");
    state.release();
    await rejects(
      state.settle([
        {
          path,
          hash: (staged.details as { stagedHash: string }).stagedHash,
        },
      ]),
      /symlink|escape/,
    );
    assert.equal(existsSync(join(os.tmpdir(), outsideName)), false);
  });
});

describe("C2 — real Pi lifecycle wiring", () => {
  it("uses the host Node binary for the immutable closure", () => {
    const nodeBinary = join(fx.repoRoot, "host-node");
    writeFileSync(nodeBinary, "host node placeholder\n");
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), nodeBinary });
    const expected = resolveClosure(fx.manifestPath, "writer", { nodeBinary }).hash;
    assert.equal(state.closureHash, expected);
  });

  it("releases the writer token only when the lane turn settles", async () => {
    const envNames = [
      "PI_AWAY_LANE",
      "PI_AWAY_MANIFEST",
      "PI_AWAY_STAGING_ROOT",
      "PI_AWAY_ATTEST_DIR",
      "PI_AWAY_REPO_ROOT",
      "PI_AWAY_NODE_BINARY",
    ] as const;
    const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
    let settled: (() => void | Promise<void>) | undefined;
    let settlementCommand: ((args: string) => Promise<void>) | undefined;

    Object.assign(process.env, {
      PI_AWAY_LANE: "writer",
      PI_AWAY_MANIFEST: fx.manifestPath,
      PI_AWAY_STAGING_ROOT: fx.stagingRoot,
      PI_AWAY_ATTEST_DIR: fx.attestDir,
      PI_AWAY_REPO_ROOT: fx.repoRoot,
      PI_AWAY_NODE_BINARY: process.execPath,
    });

    try {
      const state = registerAwayLane({
        registerTool() {},
        registerCommand(name, options) {
          if (name === "away-settle") settlementCommand = options.handler;
        },
        on(event, handler) {
          if (event === "agent_settled") settled = handler;
        },
      });
      const target = "src/settled-release.txt";
      const staged = await callTool(state, "away_stage_write", {
        path: target,
        content: "settled\n",
      });

      assert.equal(state.token.released, false);
      assert.ok(settled, "the extension must register an agent_settled handler");
      await settled();
      assert.equal(state.token.released, true);
      assert.ok(settlementCommand, "the extension must register its internal settlement command");

      seedWrapperReceipt(fx.attestDir, "writer");
      const payload = Buffer.from(
        JSON.stringify({
          schema: "away-settlement/1",
          candidates: [
            {
              path: target,
              hash: (staged.details as { stagedHash: string }).stagedHash,
            },
          ],
        }),
        "utf8",
      ).toString("base64url");
      await settlementCommand(payload);
      assert.equal(readFileSync(join(fx.repoRoot, target), "utf8"), "settled\n");
      assert.equal(state.isAttested(), true);
    } finally {
      for (const name of envNames) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

describe("C2 — away_run_verify command ID gate", () => {
  it("accepts a cataloged command ID", async () => {
    const state = createLaneExtension(ctxFor(fx, "verifier", new Set(["build", "test"])));
    const r = await callTool(state, "away_run_verify", { commandId: "build" });
    assert.match(r.content[0].text, /accepted: build/);
  });

  it("rejects model-supplied argv (capability)", async () => {
    const state = createLaneExtension(ctxFor(fx, "verifier", new Set(["build"])));
    await rejects(
      callTool(state, "away_run_verify", { commandId: "build", argv: ["rm", "-rf", "/"] }),
      /unexpected argument: argv/,
    );
  });

  it("rejects an unknown command ID when a catalog is bound", async () => {
    const state = createLaneExtension(ctxFor(fx, "verifier", new Set(["build"])));
    await rejects(
      callTool(state, "away_run_verify", { commandId: "evil" }),
      /unknown command: evil/,
    );
  });
});

describe("C2 — away_attest settlement + attestation", () => {
  function freshAttest(): string {
    const d = join(fx.repoRoot, `attest-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(d, { recursive: true });
    return d;
  }

  it("rejects attestation while bridge work is in flight", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    seedWrapperReceipt(attestDir, "writer");
    state.token.beginWrite(); // simulate an in-flight write
    await rejects(
      callTool(state, "away_attest", { outcome: "completed" }),
      /bridge work in flight/,
    );
    state.token.endWrite();
  });

  it("rejects attestation before the host releases the writer token", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    seedWrapperReceipt(attestDir, "writer");
    await rejects(
      callTool(state, "away_attest", { outcome: "completed" }),
      /writer token held|settlement has not released/,
    );
    assert.equal(state.isAttested(), false);
  });

  it("rejects attestation when the wrapper has not fsynced (sandbox active)", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    state.release();
    await rejects(
      callTool(state, "away_attest", { outcome: "completed" }),
      /wrapper has not fsynced/,
    );
  });

  it("rejects an invalid outcome", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    seedWrapperReceipt(attestDir, "writer");
    await rejects(callTool(state, "away_attest", { outcome: "maybe" }), /invalid outcome/);
  });

  it("fsyncs terminal evidence and declares settlement when the wrapper settled", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    seedWrapperReceipt(attestDir, "writer");
    state.release();
    const r = await callTool(state, "away_attest", { outcome: "completed" });
    assert.match(r.content[0].text, /attested:/);
    assert.equal(state.isAttested(), true);
    const receipts = readdirSync(attestDir).filter((n) => n.startsWith("extension-receipt-"));
    assert.equal(receipts.length, 1);
  });

  it("rejects a second attestation (stale nonce / single terminal result)", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    seedWrapperReceipt(attestDir, "writer");
    state.release();
    await callTool(state, "away_attest", { outcome: "completed" });
    await rejects(callTool(state, "away_attest", { outcome: "completed" }), /already attested/);
  });

  it("receipt keys are allowlisted and contain no secret values", async () => {
    const attestDir = freshAttest();
    const state = createLaneExtension({ ...ctxFor(fx, "writer"), attestDir });
    seedWrapperReceipt(attestDir, "writer");
    state.release();
    await callTool(state, "away_attest", { outcome: "completed" });
    const receipts = readdirSync(attestDir).filter((n) => n.startsWith("extension-receipt-"));
    const parsed = JSON.parse(readFileSync(join(attestDir, receipts[0]), "utf8"));
    const allowed = new Set([
      "schema",
      "profileId",
      "laneId",
      "manifestHash",
      "closureHash",
      "childSourceDigest",
      "limits",
      "outcome",
      "wrapperReceiptPath",
      "wrapperFsynced",
      "timestamp",
    ]);
    assert.deepEqual(new Set(Object.keys(parsed)), allowed);
    assert.equal(parsed.schema, "away-extension-receipt/1");
    assert.equal(parsed.laneId, "writer");
    assert.equal(parsed.outcome, "completed");
    assert.equal(parsed.wrapperFsynced, true);
    assert.equal(parsed.childSourceDigest.length, 64);
    // No secret-looking values: keys are allowlisted; values must not resemble
    // credentials. childSourceDigest/manifestHash/closureHash are hex digests
    // (safe), not source code or credentials.
    for (const v of Object.values(parsed)) {
      const s = JSON.stringify(v);
      assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(s), `secret-looking value: ${s}`);
      assert.ok(!/Bearer [A-Za-z0-9]/.test(s), `bearer token value: ${s}`);
    }
  });

  it("embeds a stable closure hash + manifest hash", () => {
    const a = createLaneExtension(ctxFor(fx, "writer"));
    const b = createLaneExtension(ctxFor(fx, "writer"));
    assert.equal(a.closureHash, b.closureHash);
    assert.equal(a.closureHash.length, 64);
    assert.equal(a.manifestHash.length, 64);
    const direct = resolveClosure(fx.manifestPath, "writer", { requireAll: false }).hash;
    assert.equal(a.closureHash, direct);
  });
});

describe("C2 — attestation receipt safety helper", () => {
  it("readWrapperReceipt requires the matching lane + fsynced:true", async () => {
    const { readWrapperReceipt } = await import("./attestation.ts");
    const dir = join(fx.repoRoot, `attest-safety-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(dir, { recursive: true });
    writeAttestation(dir, { lane: "verifier", fsynced: true });
    assert.equal(readWrapperReceipt(dir, "writer"), null);
    writeAttestation(dir, { lane: "writer", fsynced: false });
    assert.equal(readWrapperReceipt(dir, "writer"), null);
    writeAttestation(dir, { lane: "writer", fsynced: true });
    const r = readWrapperReceipt(dir, "writer");
    assert.ok(r, "expected a matching wrapper receipt");
    assert.equal(r!.receipt.lane, "writer");
    assert.equal(r!.receipt.fsynced, true);
  });
});
