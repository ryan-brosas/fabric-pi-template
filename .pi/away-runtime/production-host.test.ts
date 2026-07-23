import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLifecyclePrompt,
  createProductionHost,
  deriveRetainedPaths,
  ensureRetainedWorkspace,
  runLifecycleRpc,
  validatePhaseEvidence,
  type LifecycleLauncher,
  type PhaseEvidence,
  type RetainedWorkspaceDependencies,
} from "./production-host.ts";

const REPOSITORY_ID = "repo-" + "a".repeat(64);
const RUN_ID = "run-0123456789abcdef";
const BASE_OID = "b".repeat(40);
const CANDIDATE_OID = "c".repeat(40);
const HASH = "d".repeat(64);

function identity() {
  return {
    repoRoot: "/repo",
    stateRoot: "/state",
    manifestPath: "/repo/.pi/away-sandbox.json",
    repositoryId: REPOSITORY_ID,
    runId: RUN_ID,
    cardId: "RM-007",
    slug: "retained-host",
    baseOid: BASE_OID,
  };
}

function fakeLauncher(records: {
  response?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  requestError?: Error;
  never?: boolean;
}): LifecycleLauncher {
  return {
    closureHash: HASH,
    async request(command) {
      if (records.never) return await new Promise(() => {});
      if (records.requestError) throw records.requestError;
      return (records.response ?? {
        type: "response",
        id: command.id,
        command: command.type,
        success: true,
      }) as never;
    },
    send() {},
    events() {
      const events = records.events ?? [{ type: "agent_settled" }];
      return {
        async *[Symbol.asyncIterator]() {
          for (const event of events) yield event as never;
        },
      };
    },
    async run(callback) {
      await callback(() => {});
    },
  };
}

describe("production host construction", () => {
  it("is pure until an explicit host method is invoked", () => {
    const calls: string[] = [];
    const host = createProductionHost(identity(), {
      mkdir: () => calls.push("mkdir"),
      git: () => { calls.push("git"); return ""; },
      launch: () => { calls.push("launch"); return fakeLauncher({}); },
      readFile: () => { calls.push("read"); return Buffer.alloc(0); },
      writeReceipt: () => calls.push("receipt"),
    });
    assert.deepEqual(calls, []);
    assert.equal(typeof host.namespaceState, "function");
    assert.equal(typeof host.invoke, "function");
    assert.equal(typeof host.createOrObserveCandidate, "function");
    assert.deepEqual(calls, []);
  });

  it("rejects symlinked or non-file namespace sentinels", () => {
    for (const sentinelKind of ["symlink", "directory"] as const) {
      const host = createProductionHost(identity(), {
        pathKind(path: string) {
          if (path.endsWith("/PLAN.md") || path.endsWith("/TODO.md")) return sentinelKind;
          return "missing";
        },
      });
      assert.throws(() => host.namespaceState("retained-host"), /namespace.*sentinel/i);
    }
  });

  it("derives canonical repository/run paths and rejects path-bearing identities", () => {
    assert.deepEqual(deriveRetainedPaths("/state", REPOSITORY_ID, RUN_ID), {
      repositoryRoot: "/state/repositories/" + REPOSITORY_ID,
      runRoot: "/state/repositories/" + REPOSITORY_ID + "/runs/" + RUN_ID,
      workspace: "/state/repositories/" + REPOSITORY_ID + "/runs/" + RUN_ID + "/workspace",
      control: "/state/repositories/" + REPOSITORY_ID + "/runs/" + RUN_ID + "/control",
      staging: "/state/repositories/" + REPOSITORY_ID + "/runs/" + RUN_ID + "/staging",
      attestations: "/state/repositories/" + REPOSITORY_ID + "/runs/" + RUN_ID + "/attestations",
      receipts: "/state/repositories/" + REPOSITORY_ID + "/runs/" + RUN_ID + "/receipts",
    });
    assert.throws(() => deriveRetainedPaths("relative", REPOSITORY_ID, RUN_ID), /absolute/i);
    assert.throws(() => deriveRetainedPaths("/state", REPOSITORY_ID, "../escape"), /run id/i);
    assert.throws(() => deriveRetainedPaths("/state", "repo-not-a-hash", RUN_ID), /repository id/i);
  });
});

describe("retained workspace", () => {
  function workspaceDeps(kind: "missing" | "directory" | "symlink" | "other", head = BASE_OID) {
    const calls: Array<{ cwd: string; args: string[] }> = [];
    const deps: RetainedWorkspaceDependencies = {
      pathKind: () => kind,
      realpath: (path) => path,
      mkdir: () => {},
      symbolicHead: () => null,
      git(cwd, args) {
        calls.push({ cwd, args });
        if (args[0] === "worktree") return "";
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return cwd;
        if (args[0] === "rev-parse" && args[1] === "HEAD") return head;
        if (args[0] === "status") return "";
        throw new Error("unexpected git command");
      },
    };
    return { deps, calls };
  }

  it("creates one exact-base detached worktree then observes it", () => {
    const paths = deriveRetainedPaths("/state", REPOSITORY_ID, RUN_ID);
    const first = workspaceDeps("missing");
    assert.equal(ensureRetainedWorkspace(identity(), paths, first.deps).kind, "created");
    assert.deepEqual(first.calls[0], {
      cwd: "/repo",
      args: ["worktree", "add", "--detach", paths.workspace, BASE_OID],
    });

    const replay = workspaceDeps("directory");
    assert.equal(ensureRetainedWorkspace(identity(), paths, replay.deps).kind, "observed");
    assert.ok(!replay.calls.some((call) => call.args[0] === "worktree"));
  });

  it("blocks symlinks, non-directories, attached heads, dirty workspaces, and base drift", () => {
    const paths = deriveRetainedPaths("/state", REPOSITORY_ID, RUN_ID);
    for (const kind of ["symlink", "other"] as const) {
      assert.throws(() => ensureRetainedWorkspace(identity(), paths, workspaceDeps(kind).deps), /workspace.*(symlink|directory)/i);
    }
    assert.throws(() => ensureRetainedWorkspace(identity(), paths, workspaceDeps("directory", CANDIDATE_OID).deps), /base.*mismatch/i);

    const attached = workspaceDeps("directory");
    attached.deps.symbolicHead = () => "main";
    assert.throws(() => ensureRetainedWorkspace(identity(), paths, attached.deps), /detached/i);

    const brokenProbe = workspaceDeps("directory");
    brokenProbe.deps.symbolicHead = () => { throw new Error("symbolic-ref I/O failure"); };
    assert.throws(() => ensureRetainedWorkspace(identity(), paths, brokenProbe.deps), /I\/O failure/i);

    const dirty = workspaceDeps("directory");
    dirty.deps.git = (cwd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return cwd;
      if (args[0] === "rev-parse") return BASE_OID;
      if (args[0] === "status") return "M changed.ts";
      return "";
    };
    assert.throws(() => ensureRetainedWorkspace(identity(), paths, dirty.deps), /clean/i);
  });
});

describe("lifecycle RPC", () => {
  it("requires one exact prompt response before accepting agent settlement", async () => {
    const result = await runLifecycleRpc({
      launcher: fakeLauncher({ events: [{ type: "agent_start" }, { type: "agent_settled" }] }),
      requestId: "phase-create-1",
      prompt: "canonical bytes",
      timeoutMs: 100,
    });
    assert.equal(result.response.id, "phase-create-1");
    assert.equal(result.response.command, "prompt");
    assert.equal(result.response.success, true);
    assert.equal(result.settled, true);
  });

  it("blocks wrong IDs, failed responses, early exit, malformed frames, timeout, and UI dialogue", async () => {
    await assert.rejects(runLifecycleRpc({ launcher: fakeLauncher({ response: { type: "response", id: "wrong", command: "prompt", success: true } }), requestId: "right", prompt: "x", timeoutMs: 100 }), /response.*id/i);
    await assert.rejects(runLifecycleRpc({ launcher: fakeLauncher({ response: { type: "response", id: "right", command: "prompt", success: false } }), requestId: "right", prompt: "x", timeoutMs: 100 }), /response.*success/i);
    await assert.rejects(runLifecycleRpc({ launcher: fakeLauncher({ events: [] }), requestId: "right", prompt: "x", timeoutMs: 100 }), /before.*settled/i);
    await assert.rejects(runLifecycleRpc({ launcher: fakeLauncher({ requestError: new Error("oversized malformed RPC record") }), requestId: "right", prompt: "x", timeoutMs: 100 }), /oversized malformed/i);
    await assert.rejects(runLifecycleRpc({ launcher: fakeLauncher({ never: true }), requestId: "right", prompt: "x", timeoutMs: 5 }), /timeout/i);
    await assert.rejects(runLifecycleRpc({ launcher: fakeLauncher({ events: [{ type: "extension_ui_request", question: "approve?" }] }), requestId: "right", prompt: "x", timeoutMs: 100 }), /unsupported.*dialogue/i);
  });
});

describe("production host phase adapters", () => {
  it("runs fixed create/ship/verify phases from receipts and host observations", async () => {
    let workspaceCreated = false;
    let namespaceEstablished = false;
    let settledPhase: "create" | "ship" | undefined;
    let currentPhase: "create" | "ship" | "verify" = "create";
    const dirtyPaths = new Set<string>();
    const written: PhaseEvidence[] = [];
    const promptProfiles: string[] = [];
    const proposals = {
      create: [{ path: ".pi/artifacts/retained-host/PLAN.md", hash: HASH }, { path: ".pi/artifacts/retained-host/TODO.md", hash: HASH }],
      ship: [{ path: "src/change.ts", hash: HASH }],
    };
    const answerPolicy = (question: string) => {
      if (question === "discovery-level") return "deep" as const;
      if (question === "clean-isolated-workspace") return "proceed" as const;
      return "deny" as const;
    };

    const host = createProductionHost(identity(), {
      pathKind(path: string) {
        if (path.endsWith("/workspace")) return workspaceCreated ? "directory" : "missing";
        if (path.endsWith("/PLAN.md") || path.endsWith("/TODO.md")) return namespaceEstablished ? "file" : "missing";
        return "missing";
      },
      realpath: (path: string) => path,
      mkdir: () => {},
      symbolicHead: () => null,
      git(cwd: string, args: string[]) {
        if (args[0] === "worktree") { workspaceCreated = true; return ""; }
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return cwd;
        if (args[0] === "rev-parse" && args[1] === "HEAD") return BASE_OID;
        if (args[0] === "status") return [...dirtyPaths].sort().map((path) => "?? " + path + "\0").join("");
        throw new Error("unexpected git");
      },
      readFile(path: string) {
        if (path.includes("/.pi/prompts/")) return Buffer.from("# Phase $ARGUMENTS\n");
        if (path.includes("extension-receipt")) return Buffer.from(JSON.stringify({
          schema: "away-extension-receipt/1", profileId: "writer", laneId: "writer",
          manifestHash: HASH, closureHash: HASH, childSourceDigest: HASH, limits: {},
          outcome: "completed", wrapperReceiptPath: "/wrapper.json", wrapperFsynced: true, timestamp: 1,
        }));
        throw new Error("unexpected read: " + path);
      },
      listReceipts() {
        return settledPhase ? ["/state/extension-receipt-" + settledPhase + ".json"] : [];
      },
      launch(options) {
        promptProfiles.push(options.profileId);
        let consumed = false;
        return {
          closureHash: HASH,
          async request(command) {
            if (command.id === "phase-" + currentPhase) {
              return { type: "response", id: command.id, command: "prompt", success: true };
            }
            if (command.id === "settle-" + currentPhase) {
              settledPhase = currentPhase as "create" | "ship";
              for (const candidate of proposals[currentPhase as "create" | "ship"]) dirtyPaths.add(candidate.path);
              if (currentPhase === "create") namespaceEstablished = true;
              return { type: "response", id: command.id, command: "prompt", success: true };
            }
            throw new Error("wrong request id");
          },
          send() {},
          events() {
            return {
              async *[Symbol.asyncIterator]() {
                if (consumed) return;
                consumed = true;
                const candidates = currentPhase === "verify" ? [] : proposals[currentPhase];
                yield { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ schema: "away-phase-proposal/1", phase: currentPhase, candidates }) }] } };
                yield { type: "agent_settled" };
              },
            };
          },
          async run(callback) { await callback(() => {}); },
        };
      },
      writeReceipt(_path: string, evidence: PhaseEvidence) { written.push(evidence); },
      createCandidate(request) {
        assert.deepEqual(request.paths, [
          ".pi/artifacts/retained-host/PLAN.md",
          ".pi/artifacts/retained-host/TODO.md",
          "src/change.ts",
        ]);
        return { oid: CANDIDATE_OID };
      },
      verifyCandidate(oid: string) {
        assert.equal(oid, CANDIDATE_OID);
        return {
          receiptPath: "/state/verifier.json",
          receiptBytes: Buffer.from(JSON.stringify({ oid, outcome: "completed", manifestMatch: true, exitStatus: 0 })),
        };
      },
    } as never);

    assert.equal(await host.namespaceState("retained-host"), "absent");
    const createCommand = "/create retained-host --from .pi/ROADMAP.md#RM-007";
    const created = await host.invoke({ phase: "create", command: createCommand, slug: "retained-host", answerPolicy });
    assert.equal(created.status, "completed");
    assert.equal(await host.namespaceState("retained-host"), "established");

    currentPhase = "ship";
    settledPhase = undefined;
    const shipped = await host.invoke({ phase: "ship", command: "/ship retained-host", slug: "retained-host", answerPolicy });
    assert.equal(shipped.terminalClaim, "none");
    const candidate = await host.createOrObserveCandidate({ runId: RUN_ID, cardId: "RM-007", slug: "retained-host", baseOid: BASE_OID });
    assert.equal(candidate.oid, CANDIDATE_OID);
    assert.deepEqual(candidate.paths, [
      ".pi/artifacts/retained-host/PLAN.md",
      ".pi/artifacts/retained-host/TODO.md",
      "src/change.ts",
    ]);

    currentPhase = "verify";
    settledPhase = undefined;
    const verified = await host.invoke({ phase: "verify", command: "/verify retained-host", slug: "retained-host", expectedOid: CANDIDATE_OID, answerPolicy });
    assert.equal(verified.terminalClaim, "verified");
    assert.equal(verified.verifiedOid, CANDIDATE_OID);
    assert.equal(verified.repositoryWritesAfterFingerprint, 0);
    assert.deepEqual(promptProfiles, ["writer", "writer", "verifier"]);
    assert.equal(written.length, 3);
  });
});

describe("phase evidence", () => {
  const template = Buffer.from("# Create: $ARGUMENTS\nBody\n", "utf8");

  it("builds canonical fixed-profile prompt bytes and validates exact host evidence", () => {
    const built = buildLifecyclePrompt({
      phase: "create",
      command: "/create retained-host --from .pi/ROADMAP.md#RM-007",
      canonicalTemplate: template,
      identity: identity(),
    });
    assert.equal(built.profileId, "writer");
    assert.match(built.prompt, /Create: retained-host --from/);
    assert.match(built.prompt, /\"repositoryId\":\"repo-a+/);
    assert.match(built.prompt, /\"terminalResponse\":\{\"onlyJson\":true/);
    assert.match(built.digest, /^[0-9a-f]{64}$/);

    const evidence: PhaseEvidence = {
      schema: "away-phase-evidence/1",
      phase: "create",
      profileId: "writer",
      command: "/create retained-host --from .pi/ROADMAP.md#RM-007",
      promptDigest: built.digest,
      repositoryId: REPOSITORY_ID,
      runId: RUN_ID,
      cardId: "RM-007",
      slug: "retained-host",
      baseOid: BASE_OID,
      settlementReceipt: { path: "/state/receipt.json", hash: HASH, outcome: "completed", wrapperFsynced: true },
      namespaceState: "established",
      candidates: [ { path: "src/change.ts", hash: HASH } ],
    };
    assert.doesNotThrow(() => validatePhaseEvidence(evidence, {
      phase: "create",
      command: evidence.command,
      promptDigest: built.digest,
      identity: identity(),
    }));
  });

  it("rejects profile selection, identity drift, completion prose, protected paths, stale verify, and recursive parent entry", () => {
    const command = "/verify retained-host";
    const built = buildLifecyclePrompt({ phase: "verify", command, canonicalTemplate: Buffer.from("verify $ARGUMENTS"), identity: identity() });
    const valid: PhaseEvidence = {
      schema: "away-phase-evidence/1", phase: "verify", profileId: "verifier", command,
      promptDigest: built.digest, repositoryId: REPOSITORY_ID, runId: RUN_ID, cardId: "RM-007",
      slug: "retained-host", baseOid: BASE_OID,
      settlementReceipt: { path: "/state/verifier.json", hash: HASH, outcome: "completed", wrapperFsynced: true },
      namespaceState: "established", verifiedOid: CANDIDATE_OID, fingerprint: HASH,
      repositoryWritesAfterFingerprint: 0,
    };
    for (const patch of [
      { profileId: "writer" },
      { runId: "run-drift" },
      { promptDigest: "e".repeat(64) },
      { verifiedOid: BASE_OID },
      { repositoryWritesAfterFingerprint: 1 },
      { claims: ["looks complete"] },
      { candidates: [{ path: ".pi/away-runtime/production-host.ts", hash: HASH }] },
    ]) {
      assert.throws(() => validatePhaseEvidence({ ...valid, ...patch } as PhaseEvidence, {
        phase: "verify", command, promptDigest: built.digest, identity: identity(), expectedOid: CANDIDATE_OID,
      }), /phase evidence|profile|identity|prompt|verified|fingerprint|claim|protected/i);
    }
    assert.throws(() => buildLifecyclePrompt({ phase: "ship", command: "/ship retained-host", canonicalTemplate: Buffer.from("ship $ARGUMENTS"), identity: identity(), parentAwayDepth: 1 }), /recursive.*away/i);
  });
});
