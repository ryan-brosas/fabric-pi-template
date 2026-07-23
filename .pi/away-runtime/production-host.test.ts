import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

import {
  buildLifecyclePrompt,
  createProductionHost,
  deriveRetainedPaths,
  ensureRetainedWorkspace,
  runLifecycleRpc,
  runProductionAwayController,
  validatePhaseEvidence,
  type LifecycleLauncher,
  type PhaseEvidence,
  type RetainedWorkspaceDependencies,
} from "./production-host.ts";
import {
  buildWorkflowCommands,
  createRootPiLaunchSpec,
  deriveMaintenanceWorkIdentity,
  executeSeniorWorkflowAway,
  isDirectSeniorCandidateProtected,
  isExpectedProjectPromptCommand,
  parseMaintenanceSelection,
  runAwayOnce,
  runContinuousSeniorService,
  runRootPiWorkflow,
  runSeniorAwayController,
  runTopLevelWorkflow,
} from "./supervise-away.ts";
import { isBlockingRpcUiRequest } from "./rpc.ts";

const REPOSITORY_ID = "repo-" + "a".repeat(64);
const RUN_ID = "run-0123456789abcdef";
const BASE_OID = "b".repeat(40);
const CANDIDATE_OID = "c".repeat(40);
const HASH = "d".repeat(64);

function currentMaintenanceIdentity(objective: string): { cardId: string; slug: string } {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  return deriveMaintenanceWorkIdentity(head, objective);
}

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

describe("direct senior candidate policy", () => {
  it("allows away implementation refinement but protects intent, authority, state, and secrets", () => {
    for (const path of [
      ".pi/away-runtime/supervise-away.ts",
      ".pi/extensions/away/index.ts",
      ".pi/artifacts/pi-template/PLAN.md",
      "src/tokenizer.ts",
      "docs/token-budget.md",
      "README.md",
    ]) assert.equal(isDirectSeniorCandidateProtected(path), false, path);
    for (const path of [
      "AGENTS.md",
      ".pi/ROADMAP.md",
      ".pi/settings.json",
      ".pi/fabric.json",
      ".pi/away-sandbox.json",
      ".pi/state.md",
      ".pi/user.md",
      ".pi/memory.md",
      ".pi/npm/cache.json",
      ".pi/fabric/mesh/state.json",
      ".pi/prompts/workflow.md",
      ".opencode/command/ship.md",
      ".opencode/artifacts/MEMORY.md",
      ".env",
      "config/credentials.json",
      "keys/private.pem",
    ]) assert.equal(isDirectSeniorCandidateProtected(path), true, path);
  });
});

describe("root RPC project command provenance", () => {
  it("accepts actual Pi 0.81 project metadata and rejects scope/path decoys", () => {
    const modern = {
      name: "create",
      source: "prompt",
      sourceInfo: { scope: "project", path: "/repo/.pi/prompts/create.md" },
    };
    assert.equal(isExpectedProjectPromptCommand(modern, "create", "/repo"), true);
    assert.equal(isExpectedProjectPromptCommand({ ...modern, sourceInfo: { scope: "user", path: "/repo/.pi/prompts/create.md" } }, "create", "/repo"), false);
    assert.equal(isExpectedProjectPromptCommand({ ...modern, sourceInfo: { scope: "project", path: "/tmp/decoy/create.md" } }, "create", "/repo"), false);
    assert.equal(isExpectedProjectPromptCommand({ ...modern, location: "project", sourceInfo: { scope: "project", path: "/tmp/decoy/create.md" } }, "create", "/repo"), false);
    assert.equal(isExpectedProjectPromptCommand({ ...modern, source: "skill" }, "create", "/repo"), false);
    assert.equal(isExpectedProjectPromptCommand({ name: "create", source: "prompt", location: "project" }, "create", "/repo"), true);
  });
});

describe("RPC extension UI policy", () => {
  it("ignores only documented fire-and-forget methods and blocks dialogs or unknown requests", () => {
    for (const method of ["notify", "setStatus", "setWidget", "setTitle", "set_editor_text"]) {
      assert.equal(isBlockingRpcUiRequest({ type: "extension_ui_request", method }), false);
    }
    for (const method of ["select", "confirm", "input", "editor", "future-method"]) {
      assert.equal(isBlockingRpcUiRequest({ type: "extension_ui_request", method }), true);
    }
    assert.equal(isBlockingRpcUiRequest({ type: "extension_ui_request" }), true);
    assert.equal(isBlockingRpcUiRequest({ type: "ui_request" }), true);
    assert.equal(isBlockingRpcUiRequest({ type: "agent_settled" }), false);
  });
});

describe("maintenance selection protocol", () => {
  it("accepts one bounded selected task or no-change result", () => {
    assert.deepEqual(
      parseMaintenanceSelection(
        'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"Harden RPC fire-and-forget UI filtering","acceptance":"Status events are ignored while confirm events block"}',
      ),
      {
        schema: "maintenance-selection/1",
        kind: "selected",
        objective: "Harden RPC fire-and-forget UI filtering",
        acceptance: "Status events are ignored while confirm events block",
      },
    );
    assert.deepEqual(
      parseMaintenanceSelection(
        'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"No high-confidence writable improvement exists on this HEAD"}',
      ),
      {
        schema: "maintenance-selection/1",
        kind: "no-change",
        reason: "No high-confidence writable improvement exists on this HEAD",
      },
    );
  });

  it("rejects malformed, duplicated, unbounded, or extra-key selections", () => {
    for (const text of [
      "Result: READY",
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"short","acceptance":"also short"}',
      `MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"${"x".repeat(1801)}","acceptance":"A concrete acceptance check exists"}`,
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"A sufficiently bounded maintenance objective","acceptance":"A concrete acceptance check exists","command":"rm"}',
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"Reduce .opencode/command/ship.md to its old line limit","acceptance":"The legacy structural checker exits zero"}',
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"contains\u0000nul"}',
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"First adequate no-change rationale"}\nMAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"Second adequate no-change rationale"}',
    ]) {
      assert.throws(() => parseMaintenanceSelection(text), /maintenance selection/i);
    }
  });
});

describe("retained maintenance policy", () => {
  it("blocks a maintenance identity derived from a different base before root launch", async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "away-maintenance-base-drift-"));
    let launches = 0;
    const result = await executeSeniorWorkflowAway({
      repoRoot: REPO,
      objective: "Continuously improve repository reliability with bounded evidence-backed maintenance",
      cardId: "MT-000000000000",
      slug: "maintenance-000000000000",
      dryRun: false,
    }, {
      stateRoot,
      runId: "run-0011223344556677",
      async runWorkflow() {
        launches += 1;
        return { kind: "blocked", nextIndex: 0, message: "root must not launch" };
      },
    });
    assert.equal(result.kind, "blocked");
    if (result.kind === "blocked") assert.match(result.message, /identity.*base|base.*identity/i);
    assert.equal(launches, 0);
  });

  it("rejects repository mutation during the selection-only policy turn", async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "away-maintenance-policy-mutation-"));
    const sessionFile = join(stateRoot, "sessions", "policy.jsonl");
    const assistantText =
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"No high-confidence writable improvement exists on this exact HEAD"}';
    let launches = 0;
    const standingObjective = "Continuously improve repository reliability with bounded evidence-backed maintenance";
    const work = currentMaintenanceIdentity(standingObjective);
    const result = await executeSeniorWorkflowAway({
      repoRoot: REPO,
      objective: standingObjective,
      ...work,
      dryRun: false,
    }, {
      stateRoot,
      runId: "run-fedcba9876543210",
      piPath: process.execPath,
      async runWorkflow(workflow) {
        launches += 1;
        if (launches > 1) return { kind: "blocked", nextIndex: 1, message: "unexpected continuation" };
        writeFileSync(join(workflow.launch.cwd, "policy-mutation.txt"), "not allowed\n");
        writeFileSync(sessionFile, "session\n");
        await workflow.validateSettlement?.(workflow.commands[0], assistantText, 1);
        await workflow.checkpoint(1, sessionFile);
        return { kind: "completed", nextIndex: 1, assistantText, sessionFile };
      },
    });
    assert.equal(result.kind, "blocked");
    if (result.kind === "blocked") assert.match(result.message, /policy.*mutat/i);
    assert.equal(launches, 1);
    assert.equal(existsSync(join(stateRoot, "selection.json")), false);
    assert.equal(existsSync(join(stateRoot, "idle.json")), false);
  });

  it("persists one selected task and resumes /create with its bounded acceptance", async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "away-maintenance-selected-"));
    const sessionFile = join(stateRoot, "sessions", "policy.jsonl");
    const assistantText =
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"Harden RPC status-event classification","acceptance":"All fire-and-forget events pass while dialogs remain blocked"}';
    let launches = 0;
    const standingObjective = "Continuously improve repository reliability with bounded evidence-backed maintenance";
    const work = currentMaintenanceIdentity(standingObjective);
    const result = await executeSeniorWorkflowAway({
      repoRoot: REPO,
      objective: standingObjective,
      ...work,
      dryRun: false,
    }, {
      stateRoot,
      runId: "run-abcdef0123456789",
      piPath: process.execPath,
      async runWorkflow(workflow) {
        launches += 1;
        if (launches === 1) {
          writeFileSync(sessionFile, "session\n");
          await workflow.validateSettlement?.(workflow.commands[0], assistantText, 1);
          await workflow.checkpoint(1, sessionFile);
          return { kind: "completed", nextIndex: 1, assistantText, sessionFile };
        }
        assert.equal(workflow.startIndex, 1);
        assert.ok(workflow.launch.argv.includes(sessionFile));
        assert.match(workflow.commands[2], /Harden RPC status-event classification/);
        assert.match(workflow.commands[2], /Acceptance evidence: All fire-and-forget events pass/);
        assert.doesNotMatch(workflow.commands[2], /Continuously improve repository reliability/);
        return { kind: "blocked", nextIndex: 1, message: "bounded continuation observed" };
      },
    });
    assert.equal(result.kind, "blocked");
    assert.equal(launches, 2);
    assert.equal(JSON.parse(readFileSync(join(stateRoot, "selection.json"), "utf8")).selection.kind, "selected");
  });

  it("persists NO_CHANGE once and idles replay without launching another root", async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "away-maintenance-policy-"));
    const sessionFile = join(stateRoot, "sessions", "policy.jsonl");
    const trustedPi = join(stateRoot, "pi");
    writeFileSync(trustedPi, "#!/usr/bin/env node\n");
    chmodSync(trustedPi, 0o700);
    const assistantText =
      'MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"No high-confidence writable improvement exists on this exact HEAD"}';
    let launches = 0;
    const standingObjective = "Continuously improve repository reliability with bounded evidence-backed maintenance";
    const request = {
      repoRoot: REPO,
      objective: standingObjective,
      ...currentMaintenanceIdentity(standingObjective),
      dryRun: false,
    };
    const first = await executeSeniorWorkflowAway(request, {
      stateRoot,
      runId: "run-0123456789abcdef",
      processArgv: [process.execPath, trustedPi],
      env: {},
      async runWorkflow(workflow) {
        launches += 1;
        assert.equal(workflow.launch.argv[0], trustedPi);
        assert.equal(workflow.commands.length, 1);
        assert.match(workflow.commands[0], /^DIRECT AWAY WORKFLOW POLICY/);
        writeFileSync(sessionFile, "session\n");
        await workflow.validateSettlement?.(workflow.commands[0], assistantText, 1);
        await workflow.checkpoint(1, sessionFile);
        return { kind: "completed", nextIndex: 1, assistantText, sessionFile };
      },
    });
    assert.equal(first.kind, "no-work");
    assert.equal(launches, 1);
    assert.equal(JSON.parse(readFileSync(join(stateRoot, "selection.json"), "utf8")).selection.kind, "no-change");
    assert.equal(JSON.parse(readFileSync(join(stateRoot, "idle.json"), "utf8")).schema, "senior-away-idle/1");

    const replay = await executeSeniorWorkflowAway(request, {
      stateRoot,
      runId: "run-0123456789abcdef",
      async runWorkflow() {
        throw new Error("idle replay must not launch root Pi");
      },
    });
    assert.equal(replay.kind, "no-work");
    assert.equal(launches, 1);
  });
});

describe("senior-engineer root workflow", () => {
  it("skips init for a ready project and submits the real prompt commands in order", () => {
    const workflow = buildWorkflowCommands({
      packetReady: true,
      slug: "retained-host",
      cardId: "RM-007",
      outcome: "Ship the retained host",
      runGc: true,
      auditPatterns: ["TODO|FIXME"],
    });
    assert.equal(workflow.kind, "ready");
    assert.equal(workflow.requiresOperator, false);
    assert.match(workflow.commands[0], /^DIRECT AWAY WORKFLOW POLICY/);
    assert.match(workflow.commands[0], /\.pi\/ROADMAP\.md#RM-007/);
    assert.deepEqual(workflow.commands.slice(1), [
      "/gc",
      "/create retained-host --from .pi/ROADMAP.md#RM-007",
      "/research retained-host \"Research implementation risks and established project patterns for RM-007: Ship the retained host\" --thorough",
      "/plan retained-host",
      "/ship retained-host",
      "/audit TODO|FIXME",
      "/verify retained-host all --full",
    ]);
    assert.ok(workflow.commands.slice(1).every((command) => command.startsWith("/")));
    assert.ok(workflow.commands.every((command) => !command.startsWith("/workflow")));
  });

  it("builds a roadmap-independent lifecycle for a maintenance objective", () => {
    const workflow = buildWorkflowCommands({
      packetReady: true,
      slug: "maintenance-a1b2c3d4e5f6",
      workId: "MT-a1b2c3d4e5f6",
      outcome: "Continuously improve agent routing and code quality",
      runGc: true,
    });
    assert.equal(workflow.kind, "ready");
    assert.match(workflow.commands[0], /^DIRECT AWAY WORKFLOW POLICY/);
    assert.match(workflow.commands[0], /MAINTENANCE_SELECTION/);
    assert.match(workflow.commands[0], /Never select, plan, or edit `.opencode\/\*\*`/);
    assert.deepEqual(workflow.commands.slice(1), [
      "/gc",
      "/create maintenance-a1b2c3d4e5f6 \"Continuously improve agent routing and code quality\"",
      "/research maintenance-a1b2c3d4e5f6 \"Research implementation risks and established project patterns for MT-a1b2c3d4e5f6: Continuously improve agent routing and code quality\" --thorough",
      "/plan maintenance-a1b2c3d4e5f6",
      "/ship maintenance-a1b2c3d4e5f6",
      "/verify maintenance-a1b2c3d4e5f6 all --full",
    ]);
    assert.ok(workflow.commands.every((command) => !command.includes("ROADMAP.md")));
    assert.ok(workflow.commands.every((command) => !command.startsWith("/workflow")));
  });

  it("submits only real init when the packet is not ready and pauses for its operator gate", () => {
    const workflow = buildWorkflowCommands({
      packetReady: false,
      slug: "retained-host",
      cardId: "RM-007",
      outcome: "Ship the retained host",
    });
    assert.deepEqual(workflow, {
      kind: "needs-init",
      commands: ["/init --deep"],
      requiresOperator: true,
    });
  });

  it("launches a persistent ordinary root Pi session with Fabric and prompt discovery enabled", () => {
    const initial = createRootPiLaunchSpec({
      repoRoot: "/repo/workspace",
      sessionDir: "/state/sessions",
      piPath: "/trusted/pi",
    });
    assert.equal(initial.cwd, "/repo/workspace");
    assert.deepEqual(initial.argv.slice(0, 2), ["/trusted/pi", "--approve"]);
    assert.ok(initial.argv.includes("rpc"));
    assert.ok(initial.argv.includes("gpt-5.6-sol"));
    assert.ok(initial.argv.includes("/state/sessions"));
    assert.ok(!initial.argv.includes("--no-prompt-templates"));
    assert.ok(!initial.argv.includes("--no-extensions"));
    assert.ok(!initial.argv.includes("--no-session"));

    const resumed = createRootPiLaunchSpec({
      repoRoot: "/repo/workspace",
      sessionDir: "/state/sessions",
      sessionFile: "/state/sessions/controller.jsonl",
      piPath: "/trusted/pi",
    });
    assert.ok(resumed.argv.includes("--session"));
    assert.ok(resumed.argv.includes("/state/sessions/controller.jsonl"));
  });

  it("submits exact commands through one root RPC process and checkpoints its session", async () => {
    const submitted: string[] = [];
    const checkpoints: Array<[number, string]> = [];
    const listeners: Record<string, Array<(chunk?: Buffer) => void>> = {};
    const stream = (name: string) => ({
      on(event: string, listener: (chunk?: Buffer) => void) {
        (listeners[name + ":" + event] ??= []).push(listener);
      },
    });
    const emit = (record: Record<string, unknown>) => {
      const chunk = Buffer.from(JSON.stringify(record) + "\n");
      for (const listener of listeners["stdout:data"] ?? []) listener(chunk);
    };
    const process = {
      stdin: {
        write(chunk: Buffer) {
          const command = JSON.parse(chunk.toString("utf8")) as Record<string, unknown>;
          queueMicrotask(() => {
            if (command.type === "get_commands") {
              emit({ type: "extension_ui_request", id: "status-1", method: "setStatus", statusKey: "away-run" });
              emit({ type: "extension_ui_request", id: "status-2", method: "setStatus", statusKey: "xai-usage" });
              emit({ type: "response", id: command.id, command: "get_commands", success: true, data: {
                commands: ["create", "research", "plan", "ship", "verify"].map((name) => ({
                  name,
                  source: "prompt",
                  sourceInfo: {
                    path: `/repo/.pi/prompts/${name}.md`,
                    source: "auto",
                    scope: "project",
                    origin: "top-level",
                    baseDir: "/repo/.pi",
                  },
                })),
              } });
            } else if (command.type === "prompt") {
              submitted.push(String(command.message));
              emit({ type: "response", id: command.id, command: "prompt", success: true });
              emit({ type: "agent_settled" });
            } else if (command.type === "get_last_assistant_text") {
              emit({ type: "response", id: command.id, command: command.type, success: true, data: { text: "Result: VERIFIED" } });
            } else if (command.type === "get_state") {
              emit({ type: "response", id: command.id, command: command.type, success: true, data: { sessionFile: "/state/controller.jsonl" } });
            }
          });
          return true;
        },
        end() {},
      },
      stdout: stream("stdout"),
      stderr: stream("stderr"),
      kill() { return true; },
    };
    const commands = ["DIRECT AWAY WORKFLOW POLICY", "/create retained-host", "/verify retained-host all --full"];
    const result = await runRootPiWorkflow({
      launch: { cwd: "/repo", argv: ["pi", "--mode", "rpc"] },
      commands,
      startIndex: 0,
      timeoutMs: 100,
      spawnProcess: () => process,
      checkpoint(nextIndex, sessionFile) { checkpoints.push([nextIndex, sessionFile]); },
    });
    assert.equal(result.kind, "completed");
    assert.deepEqual(submitted, commands);
    assert.deepEqual(checkpoints, [[1, "/state/controller.jsonl"], [2, "/state/controller.jsonl"], [3, "/state/controller.jsonl"]]);
  });

  it("persists a phase cursor and resumes without replaying settled top-level prompts", async () => {
    const calls: string[] = [];
    const checkpoints: number[] = [];
    const commands = ["DIRECT AWAY WORKFLOW POLICY", "/create retained-host", "/ship retained-host"];
    const first = await runTopLevelWorkflow({
      commands,
      startIndex: 0,
      async prompt(command) {
        calls.push(command);
        if (command === commands[2]) throw new Error("interrupted");
        return { assistantText: "settled" };
      },
      checkpoint(nextIndex) { checkpoints.push(nextIndex); },
    });
    assert.equal(first.kind, "blocked");
    assert.deepEqual(calls, commands);
    assert.deepEqual(checkpoints, [1, 2]);

    calls.length = 0;
    const resumed = await runTopLevelWorkflow({
      commands,
      startIndex: checkpoints.at(-1)!,
      async prompt(command) {
        calls.push(command);
        return { assistantText: "settled" };
      },
      checkpoint(nextIndex) { checkpoints.push(nextIndex); },
    });
    assert.equal(resumed.kind, "completed");
    assert.deepEqual(calls, [commands[2]]);
    assert.equal(checkpoints.at(-1), commands.length);
  });
});

describe("senior extension adapter", () => {
  it("treats interactive away text as the selected objective", async () => {
    let selectedObjective: string | undefined;
    const result = await runSeniorAwayController({ repoRoot: "/repo", objective: "improve routing" }, {
      async runOnce(request) {
        selectedObjective = request.objective;
        return {
          kind: "completed", runId: RUN_ID, changedPaths: ["src/change.ts"],
          cardId: "MT-a1b2c3d4e5f6", slug: "maintenance-a1b2c3d4e5f6",
          candidateOid: CANDIDATE_OID, fingerprint: HASH,
        };
      },
    });
    assert.equal(selectedObjective, "improve routing");
    assert.equal(result.kind, "completed");
  });

  it("exposes only validated candidate and verifier evidence", async () => {
    const completed = await runSeniorAwayController({ repoRoot: "/repo" }, {
      async runOnce() {
        return {
          kind: "completed", runId: RUN_ID, changedPaths: ["src/change.ts"],
          cardId: "RM-007", slug: "retained-host", candidateOid: CANDIDATE_OID,
          fingerprint: HASH,
        };
      },
    });
    assert.deepEqual(completed, {
      kind: "completed", cardId: "RM-007", slug: "retained-host",
      candidateOid: CANDIDATE_OID, fingerprint: HASH,
    });
    const malformed = await runSeniorAwayController({ repoRoot: "/repo" }, {
      async runOnce() { return { kind: "completed", runId: RUN_ID, changedPaths: [] }; },
    });
    assert.equal(malformed.kind, "blocked");
  });
});

describe("roadmap-independent maintenance selection", () => {
  it("binds maintenance identity to the exact HEAD and standing objective", () => {
    const objective = "Continuously improve one bounded repository behavior with evidence";
    const first = deriveMaintenanceWorkIdentity("a".repeat(40), objective);
    assert.match(first.cardId, /^MT-[0-9a-f]{12}$/);
    assert.equal(first.slug, first.cardId.toLowerCase().replace(/^mt-/, "maintenance-"));
    assert.deepEqual(deriveMaintenanceWorkIdentity("a".repeat(40), objective), first);
    assert.notDeepEqual(deriveMaintenanceWorkIdentity("b".repeat(40), objective), first);
    assert.notDeepEqual(deriveMaintenanceWorkIdentity("a".repeat(40), objective + " now"), first);
    assert.throws(() => deriveMaintenanceWorkIdentity("bad-head", objective), /HEAD/i);
  });


  it("idles a completed maintenance cycle while continuous polling stays available", async () => {
    const result = await runAwayOnce(
      { repoRoot: REPO, dryRun: false },
      {
        readRoadmap: () => "## Ready\n",
        isCompleted: (_repoRoot, work) => work.cardId.startsWith("MT-"),
        async execute() {
          throw new Error("completed maintenance must not execute again");
        },
      },
    );
    assert.equal(result.kind, "no-work");
    if (result.kind === "no-work") assert.match(result.message, /polling remains active/i);
  });

  it("starts a deterministic maintenance cycle when the roadmap has no eligible work", async () => {
    let selected: { objective: string; cardId?: string; slug?: string } | undefined;
    const result = await runAwayOnce(
      { repoRoot: REPO, dryRun: false },
      {
        readRoadmap: () => "## Ready\n",
        async execute(request) {
          selected = request;
          return {
            kind: "completed", runId: RUN_ID, changedPaths: ["src/change.ts"],
            cardId: request.cardId, slug: request.slug,
            candidateOid: CANDIDATE_OID, fingerprint: HASH,
          };
        },
      },
    );
    assert.equal(result.kind, "completed");
    assert.match(selected?.cardId ?? "", /^MT-[0-9a-f]{12}$/);
    assert.match(selected?.slug ?? "", /^maintenance-[0-9a-f]{12}$/);
    assert.match(selected?.objective ?? "", /maintain|improve/i);
    assert.match(selected?.objective ?? "", /\.pi\/\*\*/);
    assert.match(selected?.objective ?? "", /\.opencode\/\*\*.*out of scope/i);
  });
});

describe("continuous senior service", () => {
  it("polls continuously with bounded blocked backoff and resets after progress", async () => {
    const results = [
      { kind: "blocked", message: "one" },
      { kind: "blocked", message: "two" },
      { kind: "completed", runId: RUN_ID, changedPaths: ["src/change.ts"] },
    ] as const;
    const delays: number[] = [];
    const reported: string[] = [];
    await runContinuousSeniorService({
      repoRoot: "/repo",
      maxCycles: 3,
      blockedDelayMs: 10,
      maximumBlockedDelayMs: 15,
      completedDelayMs: 1,
      async runOnce() { return results[reported.length]; },
      async wait(milliseconds) { delays.push(milliseconds); },
      report(result) { reported.push(result.kind); },
    });
    assert.deepEqual(reported, ["blocked", "blocked", "completed"]);
    assert.deepEqual(delays, [10, 15]);
  });

  it("bounds maintenance mini-agent discovery before a live cycle", () => {
    const fabric = JSON.parse(readFileSync(join(REPO, ".pi", "fabric.json"), "utf8"));
    const workflow = buildWorkflowCommands({
      packetReady: true,
      slug: "maintenance-a1b2c3d4e5f6",
      workId: "MT-a1b2c3d4e5f6",
      outcome: "Maintain the Pi-native runtime",
    }).commands[0];
    const manifest = readFileSync(join(REPO, ".pi", "away-sandbox.json"), "utf8");
    const service = readFileSync(join(REPO, ".pi", "away-runtime", "pi-away-senior@.service"), "utf8");
    assert.match(service, /^Environment=PI_AWAY_PI_BINARY=\/home\/ryan\/\.local\/bin\/pi$/m);
    assert.equal(fabric.subagents.maxConcurrent, 8);
    assert.equal(fabric.subagents.timeoutMs, 300_000);
    assert.equal(fabric.subagents.maxTokensPerChild, 30_000);
    assert.match(workflow, /at most one bounded `gpt-5\.4-mini` read-only explorer/);
    assert.match(workflow, /agentBudget:\s*1/);
    assert.match(workflow, /tokenBudget:\s*8_000/);
    assert.match(workflow, /thinking:\s*"high"/);
    assert.match(workflow, /Do not retry a timed-out or budget-exhausted explorer/);
    assert.match(workflow, /Never select, plan, or edit `.opencode\/\*\*`/);
    assert.doesNotMatch(workflow, /1[–-]3 bounded `gpt-5\.4-mini`/);
    assert.doesNotMatch(manifest, /\.pi\/prompts\/workflow\.md/);
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
          receiptBytes: Buffer.from(JSON.stringify({
            schema: "away-verifier-receipt/1", oid, commandId: "test", catalogHash: HASH,
            depsHash: null, preManifest: HASH, postManifest: HASH, manifestMatch: true,
            limits: {}, exitStatus: 0, exitSignal: null, outcome: "completed", timestamp: 1,
          })),
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
    assert.equal(verified.fingerprint, HASH);
    assert.equal(verified.repositoryWritesAfterFingerprint, 0);
    assert.deepEqual(promptProfiles, ["writer", "writer"], "verify must not launch against the dirty retained workspace");
    assert.equal(written.length, 3);
  });
});

describe("production host restart replay", () => {
  it("reuses an exact durable create receipt without launching a second lane", async () => {
    const paths = deriveRetainedPaths("/state", REPOSITORY_ID, RUN_ID);
    const command = "/create retained-host --from .pi/ROADMAP.md#RM-007";
    const template = Buffer.from("# Create $ARGUMENTS\n");
    const prompt = buildLifecyclePrompt({ phase: "create", command, canonicalTemplate: template, identity: identity() });
    const settlementPath = paths.attestations + "/extension-receipt-create.json";
    const settlementBytes = Buffer.from(JSON.stringify({
      schema: "away-extension-receipt/1", profileId: "writer", laneId: "writer",
      manifestHash: HASH, closureHash: HASH, childSourceDigest: HASH, limits: {},
      outcome: "completed", wrapperReceiptPath: "/wrapper.json", wrapperFsynced: true, timestamp: 1,
    }));
    const receipt: PhaseEvidence = {
      schema: "away-phase-evidence/1", phase: "create", profileId: "writer", command,
      promptDigest: prompt.digest, repositoryId: REPOSITORY_ID, runId: RUN_ID, cardId: "RM-007",
      slug: "retained-host", baseOid: BASE_OID,
      settlementReceipt: {
        path: settlementPath,
        hash: createHash("sha256").update(settlementBytes).digest("hex"),
        outcome: "completed",
        wrapperFsynced: true,
      },
      namespaceState: "established",
      candidates: [
        { path: ".pi/artifacts/retained-host/PLAN.md", hash: HASH },
        { path: ".pi/artifacts/retained-host/TODO.md", hash: HASH },
      ],
    };
    let launches = 0;
    const host = createProductionHost(identity(), {
      pathKind(path: string) {
        if (path === paths.workspace) return "directory";
        if (path === paths.receipts + "/create.json") return "file";
        if (path.endsWith("/PLAN.md") || path.endsWith("/TODO.md")) return "file";
        return "missing";
      },
      realpath: (path: string) => path,
      mkdir: () => {},
      symbolicHead: () => null,
      git(cwd: string, args: string[]) {
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return cwd;
        if (args[0] === "rev-parse" && args[1] === "HEAD") return BASE_OID;
        if (args[0] === "status") return [
          "?? .pi/artifacts/retained-host/PLAN.md\0",
          "?? .pi/artifacts/retained-host/TODO.md\0",
        ].join("");
        throw new Error("unexpected git");
      },
      readFile(path: string) {
        if (path === paths.receipts + "/create.json") return Buffer.from(JSON.stringify(receipt));
        if (path === settlementPath) return settlementBytes;
        if (path.endsWith("/.pi/prompts/create.md")) return template;
        throw new Error("unexpected read: " + path);
      },
      launch() { launches += 1; throw new Error("restart must not launch create"); },
    });
    assert.equal(await host.namespaceState("retained-host"), "established");
    const observation = await host.invoke({
      phase: "create", command, slug: "retained-host",
      answerPolicy(question) {
        if (question === "discovery-level") return "deep";
        if (question === "clean-isolated-workspace") return "proceed";
        return "deny";
      },
    });
    assert.equal(observation.status, "completed");
    assert.equal(launches, 0);
  });
});

describe("production terminal composition", () => {
  it("uses the shipped selector by default and returns live no-work", async () => {
    const result = await runProductionAwayController({ repoRoot: REPO });
    assert.equal(result.kind, "no-work");
  });

  it("returns no-work before constructing lifecycle or effect hosts", async () => {
    const calls: string[] = [];
    const result = await runProductionAwayController({ repoRoot: "/repo" }, {
      async select() { calls.push("select"); return { kind: "no-work", reason: "none eligible" }; },
      hostFactory() { calls.push("host"); throw new Error("unreachable"); },
      effectHostFactory() { calls.push("effects"); throw new Error("unreachable"); },
      now: () => 1,
    } as never);
    assert.deepEqual(result, { kind: "no-work", reason: "none eligible" });
    assert.deepEqual(calls, ["select"]);
  });

  it("maps completed only after durable effect reconciliation converges", async () => {
    const calls: string[] = [];
    let namespaceChecks = 0;
    const reservation = {
      kind: "reserved",
      card: { id: "RM-007", candidateSlug: "retained-host" },
      record: { runId: RUN_ID, cardId: "RM-007", baseOid: BASE_OID, repositoryId: REPOSITORY_ID, slug: "retained-host", status: "reserved" },
    } as never;
    const result = await runProductionAwayController({ repoRoot: "/repo" }, {
      async select() { calls.push("select"); return { kind: "reserved", reservation, ledger: {} }; },
      hostFactory() {
        calls.push("host");
        return {
          namespaceState() { namespaceChecks += 1; return namespaceChecks === 1 ? "absent" : "established"; },
          invoke(request: { phase: string; command: string }) {
            calls.push("phase:" + request.phase);
            if (request.phase === "verify") return {
              phase: "verify", command: request.command, status: "completed", terminalClaim: "verified",
              verifiedOid: CANDIDATE_OID, fingerprint: HASH, repositoryWritesAfterFingerprint: 0,
            };
            return { phase: request.phase, command: request.command, status: "completed", terminalClaim: "none" };
          },
          createOrObserveCandidate() {
            calls.push("candidate");
            return {
              oid: CANDIDATE_OID, baseOid: BASE_OID, clean: true, hostObserved: true,
              paths: ["src/change.ts"], hashes: { "src/change.ts": HASH },
            };
          },
        };
      },
      effectHostFactory(_selection: unknown, lifecycle: { candidateOid: string }) {
        calls.push("effects");
        assert.equal(lifecycle.candidateOid, CANDIDATE_OID);
        return {} as never;
      },
      async reconcile() {
        calls.push("reconcile");
        return { kind: "completed", commitOid: CANDIDATE_OID, remoteOid: CANDIDATE_OID, pullRequestId: 77 };
      },
      now: () => 1,
    } as never);
    assert.deepEqual(result, {
      kind: "completed", slug: "retained-host", cardId: "RM-007",
      candidateOid: CANDIDATE_OID, fingerprint: HASH,
    });
    assert.deepEqual(calls, [
      "select", "host", "phase:create", "phase:ship", "candidate", "phase:verify", "effects", "reconcile",
    ]);
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
    const built = buildLifecyclePrompt({
      phase: "verify", command, canonicalTemplate: Buffer.from("verify $ARGUMENTS"),
      identity: identity(), expectedOid: CANDIDATE_OID,
    });
    assert.ok(built.prompt.includes('"expectedOid":"' + CANDIDATE_OID + '"'));
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
