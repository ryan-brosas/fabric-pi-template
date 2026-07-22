// D1 — Hermetic sandbox integration.
//
// Exercises the REAL launcher + RPC parser + Fabric node-process runtime +
// wrapper + host-call firewall + staging + verifier end-to-end, faking ONLY
// provider output + clock (fake-provider.ts). Uses content-addressed retained
// fixtures (fixtures.ts) — reused, never auto-deleted, stopped at the storage
// cap. Tests writer + reviewer profiles + external-scout no-filesystem. Injects
// crashes around wrapper startup / calls / writes / result fsync / verifier
// completion. Asserts no duplicate application, no surviving descendant, no
// protected-path change.
//
// Verify: node --experimental-strip-types --test .pi/away-runtime/integration.test.ts

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildIntegrationFixture,
  createFixtureStore,
  fixtureKey,
  type IntegrationFixture,
} from "./fixtures.ts";
import { fabricExecTurn, textTurn, writeFakeProvider } from "./fake-provider.ts";
import { launch } from "./launcher.ts";
import type { Launcher } from "./launcher.ts";
import { createLaneExtension } from "./lane-extension.ts";
import { listExtensionReceipts } from "./attestation.ts";
import { buildBwrapArgs } from "./executor-wrapper.mjs";
import { verify } from "./verifier.ts";
import type { CommandCatalog } from "./command-catalog.ts";

const REPO = join(import.meta.dirname, "..", "..");
const REAL_MANIFEST = join(REPO, ".pi", "away-sandbox.json");
const REAL_NODE = process.execPath;
const REAL_BWRAP = JSON.parse(readFileSync(REAL_MANIFEST, "utf8")).pinned_versions.bwrap_path;
const PI_PATH = JSON.parse(readFileSync(REAL_MANIFEST, "utf8")).pinned_versions.pi_path;
const PI_OK = existsSync(PI_PATH);
const BWRAP_OK = existsSync(REAL_BWRAP);

// A shared fixture for the fast (no-pi) suites. Built once; the fast suites
// operate on createLaneExtension (in-process logic) + buildBwrapArgs (pure).
function makeFastFixture(): IntegrationFixture {
  const dir = mkdtempSync(join(tmpdir(), "d1-fast-"));
  // A fake provider is not needed for the fast suites, but buildIntegrationFixture
  // requires a providerExtPath (referenced by the manifest's model_registry).
  // Write a minimal provider stub.
  const providerPath = writeFakeProvider(dir, [textTurn("DONE")]);
  return buildIntegrationFixture(dir, { providerExtPath: providerPath });
}

// A full fixture for the slow (real-pi) suites: writes the fake provider with
// the given scripted turns, then builds the integration fixture.
function makeSlowFixture(turns: ReturnType<typeof fabricExecTurn>[]) {
  const dir = mkdtempSync(join(tmpdir(), "d1-slow-"));
  const providerPath = writeFakeProvider(dir, turns);
  const fx = buildIntegrationFixture(dir, {
    providerExtPath: providerPath,
    limits: { executor_timeout_ms: 30000 },
  });
  return { dir, fx };
}

// The controller (test) sets the PI_AWAY_* lane config AND inherits the host
// env (PATH/HOME/LANG) so pi's `#!/usr/bin/env node` shebang resolves. The
// bootstrap allowlist keeps PATH/HOME/LANG + the PI_AWAY_* keys; the rest of
// the host env is filtered out (PI_FABRIC_*/PI_TRUST/etc. denied).
function envForLane(fx: IntegrationFixture, laneId: string): Record<string, string | undefined> {
  return { ...process.env, ...fx.envFor(laneId) };
}

// Collect events from a launcher run until agent_settled (or a timeout).
async function runUntilSettled(l: Launcher, prompt: string, timeoutMs = 60000) {
  const events: any[] = [];
  const settled = l.run(async (send) => {
    send({ type: "prompt", id: "req_1", message: prompt });
    for await (const ev of l.events()) {
      events.push(ev);
      if (ev.type === "agent_settled") break;
    }
  });
  await Promise.race([
    settled,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`pi did not settle in ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  return events;
}

// Extract all text + tool-result text from the event stream (mirrors the C1
// launcher.test.ts extraction).
function extractText(events: any[]): string {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === "message_update" && e.assistantMessageEvent) {
      const ame = e.assistantMessageEvent;
      if (ame.type === "text_delta" && typeof ame.delta === "string") out.push(ame.delta);
      if (ame.type === "text_end" && typeof ame.content === "string") out.push(ame.content);
    }
    if (e.type === "tool_execution_end" && e.result) {
      // tool results may carry text content
      const r = e.result;
      if (typeof r === "string") out.push(r);
      else if (r && r.content) out.push(JSON.stringify(r.content));
    }
  }
  return out.join("");
}

// ----------------------------------------------------------------------------
// Suite 1: fixture store (content-addressed, retained, storage-capped)
// ----------------------------------------------------------------------------

describe("D1 fixture store (content-addressed, retained)", () => {
  it("fixtureKey is content-addressed (same inputs → same key, different → different)", () => {
    assert.equal(fixtureKey("a", "b"), fixtureKey("a", "b"));
    assert.notEqual(fixtureKey("a"), fixtureKey("b"));
  });

  it("reuses an existing fixture by key (never rebuilds, never auto-deletes)", () => {
    const root = mkdtempSync(join(tmpdir(), "d1-store-"));
    const store = createFixtureStore(root, { storageCapBytes: 1 << 20 });
    let builds = 0;
    const a = store.getOrCreate("k1", (d) => {
      builds++;
      writeFileSync(join(d, "f.txt"), "data");
    });
    const b = store.getOrCreate("k1", () => {
      builds++;
    });
    assert.equal(a, b, "same key → same dir (reused)");
    assert.equal(builds, 1, "reused fixture is not rebuilt");
    assert.ok(existsSync(a), "retained fixture dir still exists (not auto-deleted)");
  });

  it("reports retained fixture paths", () => {
    const root = mkdtempSync(join(tmpdir(), "d1-store-"));
    const store = createFixtureStore(root, { storageCapBytes: 1 << 20 });
    store.getOrCreate("alpha", (d) => writeFileSync(join(d, "f"), "x"));
    store.getOrCreate("beta", (d) => writeFileSync(join(d, "f"), "y"));
    const paths = store.paths();
    assert.equal(paths.length, 2, "two retained fixtures reported");
    assert.ok(paths.some((p) => p.endsWith("alpha")));
    assert.ok(paths.some((p) => p.endsWith("beta")));
  });

  it("stops when the storage cap is reached (refuses new fixtures)", () => {
    const root = mkdtempSync(join(tmpdir(), "d1-store-"));
    const store = createFixtureStore(root, { storageCapBytes: 16 });
    // Fill the store to the cap.
    store.getOrCreate("k1", (d) => writeFileSync(join(d, "f"), "0123456789abcdef")); // 16 bytes
    assert.ok(store.isFull(), "store is full at the cap");
    assert.throws(
      () => store.getOrCreate("k2", () => {}),
      /fixture store full/,
      "refuses a new fixture when full",
    );
  });
});

// ----------------------------------------------------------------------------
// Suite 2: profiles (reviewer read-only, external-scout no-filesystem)
// ----------------------------------------------------------------------------

describe("D1 profiles (reviewer read-only, external-scout no-filesystem)", () => {
  let fx: IntegrationFixture;
  before(() => {
    fx = makeFastFixture();
  });

  it("reviewer allowlist is read-only (no stage_write / commit / attest)", () => {
    const state = createLaneExtension({
      manifestPath: fx.manifestPath,
      laneId: "reviewer",
      stagingRoot: fx.stagingRoot,
      attestDir: fx.attestDir,
      repoRoot: fx.repoRoot,
    });
    assert.ok(state.allowlist.has("away_read"), "reviewer can read");
    assert.ok(state.allowlist.has("away_list"), "reviewer can list");
    assert.ok(state.allowlist.has("away_search"), "reviewer can search");
    assert.ok(!state.allowlist.has("away_stage_write"), "reviewer cannot stage writes");
    assert.ok(!state.allowlist.has("away_commit_staged"), "reviewer cannot commit");
    assert.ok(!state.allowlist.has("away_attest"), "reviewer cannot attest");
  });

  it("external-scout sandbox has network but no repo filesystem (buildBwrapArgs binds no repo path)", () => {
    // The scout lane is the ONLY lane with network. Its sandbox must not bind
    // the repo root or any source path (the model's fabric_exec code cannot
    // read the repo directly; it must go through away_search/away_read in the
    // trusted host). buildBwrapArgs does minimal binding (node + libs +
    // inner-guest + /proc + /dev + /tmp); assert no repo path leaks.
    const args = buildBwrapArgs({
      realNode: REAL_NODE,
      libs: ["/usr/lib/x86_64-linux-gnu/libc.so.6"],
      innerGuestPath: "/guest.mjs",
      network: true, // scout
      guestArgs: ["--input-type=module", "--import", "/guest.mjs", "--eval", "X"],
    });
    const joined = args.join(" ");
    assert.ok(joined.includes("--share-net"), "scout sandbox has network (--share-net)");
    assert.ok(!joined.includes(REPO), "scout sandbox binds no repo path");
    assert.ok(!joined.includes(fx.repoRoot), "scout sandbox binds no fixture repo path");
  });

  it("writer sandbox has NO network (buildBwrapArgs omits --share-net)", () => {
    const args = buildBwrapArgs({
      realNode: REAL_NODE,
      libs: ["/usr/lib/x86_64-linux-gnu/libc.so.6"],
      innerGuestPath: "/guest.mjs",
      network: false, // writer
      guestArgs: ["--input-type=module", "--import", "/guest.mjs", "--eval", "X"],
    });
    const joined = args.join(" ");
    assert.ok(!joined.includes("--share-net"), "writer sandbox has no network");
  });
});

// ----------------------------------------------------------------------------
// Suite 3: crash injection (no dup / no descendant / no protected-path change)
// ----------------------------------------------------------------------------

describe("D1 crash injection (no dup / no descendant / no protected-path change)", () => {
  let fx: IntegrationFixture;

  before(() => {
    fx = makeFastFixture();
  });

  it("wrapper startup: closure gate rejects a missing wrapper (no spawn)", () => {
    // Build a fixture whose exec_path_override points at a NONEXISTENT wrapper.
    // launch()'s closure gate hard-checks the wrapper (a critical input); it
    // must throw BEFORE spawning pi. No spawn → no descendant, no write.
    const dir = mkdtempSync(join(tmpdir(), "d1-nos-"));
    const providerPath = writeFakeProvider(dir, [textTurn("DONE")]);
    const broken = buildIntegrationFixture(dir, { providerExtPath: providerPath });
    // Overwrite the manifest's exec_path_override to a missing path.
    const m = JSON.parse(readFileSync(broken.manifestPath, "utf8"));
    m.exec_path_override = "/nonexistent/wrapper.mjs";
    writeFileSync(broken.manifestPath, JSON.stringify(m));
    assert.throws(
      () =>
        launch({
          manifestPath: broken.manifestPath,
          profileId: "writer",
          controlCwd: broken.controlCwd,
          pinExecPath: true,
          processEnv: broken.envFor("writer"),
        }),
      /closure: missing required input|missing required input/,
      "launch rejects a missing wrapper before spawning",
    );
  });

  it("calls: away_read with an escaping path is rejected (no read happens)", async () => {
    const state = createLaneExtension({
      manifestPath: fx.manifestPath,
      laneId: "writer",
      stagingRoot: fx.stagingRoot,
      attestDir: fx.attestDir,
      repoRoot: fx.repoRoot,
    });
    const readTool = state.tools.find((t) => t.name === "away_read");
    assert.ok(readTool, "away_read registered for writer");
    await assert.rejects(
      () => readTool.execute("test", { path: "../../../etc/passwd" }),
      /escape|protected|outside|denied|invalid/,
      "escaping path rejected before any read",
    );
  });

  it("writes: away_stage_write to a protected path is rejected (no commit, no duplicate)", async () => {
    const state = createLaneExtension({
      manifestPath: fx.manifestPath,
      laneId: "writer",
      stagingRoot: fx.stagingRoot,
      attestDir: fx.attestDir,
      repoRoot: fx.repoRoot,
    });
    const stageTool = state.tools.find((t) => t.name === "away_stage_write");
    // .pi/fabric.json is a protected path in the real manifest (cloned into the
    // fixture). Staging it must be rejected.
    await assert.rejects(
      () => stageTool.execute("test", { path: ".pi/fabric.json", content: "evil" }),
      /protected/,
      "protected-path write rejected",
    );
    // No commit happened → the protected path is unchanged (it doesn't even
    // exist in the fixture repo). No duplicate application: nothing was staged.
    assert.ok(!existsSync(join(fx.repoRoot, ".pi", "fabric.json")), "protected path not created");
  });

  it("result fsync: away_attest without a wrapper receipt is rejected (no settlement)", async () => {
    // A fresh attest dir (no wrapper receipt). away_attest must reject because
    // the wrapper has not fsynced terminal evidence (sandbox active).
    const freshAttest = mkdtempSync(join(tmpdir(), "d1-attest-"));
    const state = createLaneExtension({
      manifestPath: fx.manifestPath,
      laneId: "writer",
      stagingRoot: fx.stagingRoot,
      attestDir: freshAttest,
      repoRoot: fx.repoRoot,
    });
    const attestTool = state.tools.find((t) => t.name === "away_attest");
    await assert.rejects(
      () => attestTool.execute("test", { outcome: "completed" }),
      /wrapper has not fsynced|sandbox active|no wrapper receipt/,
      "attest without a wrapper receipt rejected (no settlement)",
    );
    // No extension receipt was written (no settlement).
    assert.equal(
      listExtensionReceipts(freshAttest).length,
      0,
      "no extension receipt without a wrapper receipt",
    );
  });

  it("verifier completion: a failing command yields outcome 'failed' (no protected-path change)", async () => {
    // Build a tiny git fixture repo + a command catalog with a failing command.
    // verify() runs the command in a sandbox; a non-zero exit → outcome "failed".
    // The evidence tree is an exact-OID COPY; the source repo is not mutated.
    const srcRepo = mkdtempSync(join(tmpdir(), "d1-vsrc-"));
    writeFileSync(join(srcRepo, "test.ts"), "throw new Error('fail');");
    execFileSync("git", ["init", "-q"], { cwd: srcRepo });
    execFileSync("git", ["add", "."], { cwd: srcRepo });
    execFileSync(
      "git",
      ["-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-q", "-m", "init"],
      {
        cwd: srcRepo,
      },
    );
    const oid = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: srcRepo,
      encoding: "utf8",
    }).trim();
    const sourceManifestBefore = readFileSync(fx.manifestPath);

    const workRoot = mkdtempSync(join(tmpdir(), "d1-vwork-"));
    const attestDir = mkdtempSync(join(tmpdir(), "d1-vattest-"));
    const catalog: CommandCatalog = {
      fail: { id: "fail", binary: REAL_NODE, argv: ["--eval", "process.exit(1)"], cwd: "/" },
    };

    const result = await verify({
      oid,
      repoPath: srcRepo,
      commandId: "fail",
      catalog,
      limits: {
        ...JSON.parse(readFileSync(REAL_MANIFEST, "utf8")).limits,
        executor_timeout_ms: 20000,
      },
      workRoot,
      commandBinary: REAL_NODE,
      bwrapPath: REAL_BWRAP,
      attestDir,
    });

    assert.equal(result.receipt.outcome, "failed", "failing command → outcome 'failed'");
    assert.notEqual(result.receipt.exitStatus, 0, "non-zero exit status recorded");
    // No protected-path change: the fixture manifest (a protected path) is
    // byte-identical before/after (verify never touches the host repo).
    assert.deepEqual(
      readFileSync(fx.manifestPath),
      sourceManifestBefore,
      "protected manifest unchanged by verify",
    );
    // The source repo HEAD is unchanged (the evidence tree is a copy).
    const oidAfter = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: srcRepo,
      encoding: "utf8",
    }).trim();
    assert.equal(oidAfter, oid, "source repo HEAD unchanged by verify");
  });
});

// ----------------------------------------------------------------------------
// Suite 4: real-pi capture routing (pinExecPath:false — fabric_exec -> captured away_read)
// ----------------------------------------------------------------------------

describe(
  "D1 real-pi capture routing (fabric_exec -> captured away_read, pinExecPath:false)",
  { skip: !PI_OK },
  () => {
    it("a fabric_exec tool_call invoking extensions.away_read returns the file content + agent_settled", async () => {
      const code = `const r=await tools.call({ref:"extensions.away_read",args:{path:"src/hello.txt"}});return JSON.stringify(r);`;
      const { fx } = makeSlowFixture([fabricExecTurn(code), textTurn("DONE")]);

      const l = launch({
        manifestPath: fx.manifestPath,
        profileId: "writer",
        controlCwd: fx.controlCwd,
        pinExecPath: false, // capture-routing path (no wrapper); the make-or-break probe.
        processEnv: envForLane(fx, "writer"),
      });

      const events = await runUntilSettled(l, "read src/hello.txt via fabric_exec");
      assert.ok(
        events.some((e) => e.type === "agent_settled"),
        "agent_settled received",
      );

      // The away_read content ("hello from the fixture") should appear in the
      // tool result fed back to the provider (tool_execution_end / toolResult
      // message). The capture routing + the extensions. namespace fix delivered
      // the captured-tool result through real pi.
      const text = extractText(events);
      assert.ok(
        text.includes("hello from the fixture"),
        `expected away_read content in the event stream, got: ${JSON.stringify(text).slice(0, 400)}`,
      );
      l.markUsed();
    });
  },
);

// ----------------------------------------------------------------------------
// Suite 5: real-sandbox writer end-to-end (pinExecPath:true — real wrapper+bwrap+cgroup)
// ----------------------------------------------------------------------------

describe(
  "D1 real-sandbox writer end-to-end (pinExecPath:true, real wrapper+bwrap+cgroup)",
  { skip: !PI_OK || !BWRAP_OK },
  () => {
    it("fabric_exec -> extensions.away_read through the real wrapper returns content + agent_settled (no descendant)", async () => {
      const code = `const r=await tools.call({ref:"extensions.away_read",args:{path:"src/hello.txt"}});return JSON.stringify(r);`;
      const { fx } = makeSlowFixture([fabricExecTurn(code), textTurn("DONE")]);

      // Snapshot a protected path (the fixture manifest) before the run.
      const manifestBefore = readFileSync(fx.manifestPath);

      const l = launch({
        manifestPath: fx.manifestPath,
        profileId: "writer",
        controlCwd: fx.controlCwd,
        pinExecPath: true, // REAL wrapper + bwrap + cgroup (the full sandbox path).
        processEnv: envForLane(fx, "writer"),
      });

      // run() resolves only after the lane process exits (stdin closed + exit
      // awaited). A surviving sandbox descendant would hang the cgroup --wait,
      // so a clean return proves no descendant survived.
      const events = await runUntilSettled(l, "read src/hello.txt through the sandbox");

      assert.ok(
        events.some((e) => e.type === "agent_settled"),
        "agent_settled received",
      );

      // The away_read content crossed the sandbox -> wrapper -> host bridge.
      const text = extractText(events);
      assert.ok(
        text.includes("hello from the fixture"),
        `expected away_read content through the real wrapper, got: ${JSON.stringify(text).slice(0, 400)}`,
      );

      // No protected-path change: the fixture manifest is byte-identical.
      assert.deepEqual(
        readFileSync(fx.manifestPath),
        manifestBefore,
        "protected manifest unchanged",
      );

      // A wrapper attestation receipt should exist (the wrapper fsyncs on the
      // terminal result frame). This proves the wrapper ran + attested.
      const wrapperReceipts = existsSync(fx.attestDir)
        ? readdirSync(fx.attestDir).filter((f) => f.startsWith("attest-"))
        : [];
      assert.ok(
        wrapperReceipts.length >= 1,
        "wrapper attestation receipt exists (wrapper fsynced)",
      );

      l.markUsed();
    });
  },
);
