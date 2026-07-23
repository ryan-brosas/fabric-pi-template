// C1 — Dedicated Pi RPC lane launcher.
//
// The controller calls launch(profileId) in its own host process. The launcher
// starts Pi from an inert control cwd (NEVER the repository) with the exact
// A1 argv/env, over a dedicated RPC lane parsed by rpc.ts. It pins the per-lane
// process.execPath to the trusted A2 wrapper via a NODE_OPTIONS --import preload
// (the A2/A3-proven writable-execPath seam: pi is a node script, so the preload
// reassigns process.execPath before pi/Fabric boots). It binds ONE immutable
// profile to ONE single-use lane process, rejects reload / project-resource
// loading / model switching / profile reuse at a command gate, and rechecks the
// B2 closure (all immutable startup inputs present) before launch.
//
// Adversarial invariant: the model never chooses the lane / model / tools / cwd
// / env / binaries / args / risks, and never raw `agents.*`. The controller
// derives the lane from trusted phase/state (B3 dispatch); the launcher only
// accepts the settlement command (prompt) + safe reads + cancellation (abort).
// Model-switch, session-reuse, reload, and shell-egress (bash) commands are
// rejected at the gate before they reach pi.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/launcher.test.ts

import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { bootstrap, loadManifest, type Manifest } from "./bootstrap.ts";
import { resolveClosure } from "./closure.ts";
import { RpcDispatcher, serializeCommand, type RpcRecord, type RpcEvent } from "./rpc.ts";

export interface LauncherOptions {
  manifestPath: string;
  profileId: string;
  /** Inert control cwd (NOT the repository). Defaults to the manifest control_cwd_root. */
  controlCwd?: string;
  /** Environment to filter through the allowlist. Defaults to process.env. */
  processEnv?: Record<string, string | undefined>;
  /** Pin process.execPath to the trusted wrapper via a NODE_OPTIONS preload. Default true. */
  pinExecPath?: boolean;
}

export interface Launcher {
  readonly argv: string[];
  readonly env: Record<string, string>;
  readonly execPathPin: string;
  readonly controlCwd: string;
  readonly closureHash: string;
  markUsed(): void;
  assertUnused(): void;
  assertCommandAllowed(cmd: RpcRecord): void;
  send(cmd: RpcRecord): void;
  request(cmd: RpcRecord): Promise<RpcRecord>;
  run(cb: (send: (cmd: RpcRecord) => void) => Promise<void>): Promise<void>;
  events(): AsyncIterable<RpcEvent>;
}

// The lane may send ONLY these commands over the dedicated RPC lane. Everything
// else (model switch, session reuse, reload, shell egress, compaction, ...)
// is default-deny: rejected at the gate before reaching pi.
const ALLOWED_COMMANDS = new Set<string>([
  "prompt", // the settlement command
  "abort", // cancellation (safe; the wrapper kills descendants on parent death)
  "steer",
  "follow_up",
  "get_state",
  "get_available_models",
  "get_available_thinking_levels",
  "get_session_stats",
  "get_messages",
  "get_commands",
  "get_last_assistant_text",
]);

const PRELOAD_FILENAME = ".away-execpath-preload.mjs";
const MAX_RPC_RECORD_BYTES = 4 * 1024 * 1024;

export function launch(opts: LauncherOptions): Launcher {
  const pinExecPath = opts.pinExecPath ?? true;

  // A1 bootstrap: exact argv/env/controlCwd/fabric.json. Throws on unknown lane.
  // Capture the real Node binary before the preload rewrites process.execPath;
  // the lane extension uses this value for the same immutable closure hash.
  const processEnv: Record<string, string | undefined> = {
    ...(opts.processEnv ?? process.env),
    PI_AWAY_NODE_BINARY: process.execPath,
  };
  const bs = bootstrap(opts.profileId, {
    manifestPath: opts.manifestPath,
    controlCwd: opts.controlCwd,
    processEnv,
  });

  // Re-load the manifest for the exec_path_override + lane_extension refs.
  const { manifest } = loadManifest(opts.manifestPath);

  // The pinned execPath target: the manifest's exec_path_override (the A2
  // wrapper), resolved against the host-derived repoRoot.
  const execPathPin = isAbsolute(manifest.exec_path_override)
    ? manifest.exec_path_override
    : resolve(bs.repoRoot, manifest.exec_path_override);

  // B2 closure launch gate. C2 is connected, so every declared immutable
  // input — including the lane extension — is now mandatory before spawn.
  const closure = resolveClosure(opts.manifestPath, opts.profileId, { requireAll: true });
  const closureHash = closure.hash;

  // Build the pi-host env (allowlisted by bootstrap). The preload that pins
  // process.execPath is host-owned and runs in the TRUSTED pi parent — the
  // sandbox never sees it (the A2 wrapper does --clearenv).
  const env: Record<string, string> = { ...bs.env };
  if (pinExecPath) {
    const preloadPath = join(bs.controlCwd, PRELOAD_FILENAME);
    // The preload reassigns process.execPath to the trusted wrapper before
    // pi/Fabric boots. (A2/A3-proven: process.execPath is writable+configurable
    // on Node 24; Fabric unconditionally spawns process.execPath.)
    writeFileSync(
      preloadPath,
      `// Generated by the away-runtime launcher. Pins process.execPath to the\n` +
        `// trusted A2 wrapper so Fabric spawns the sandbox, not raw node.\n` +
        `process.execPath = ${JSON.stringify(execPathPin)};\n`,
    );
    env.NODE_OPTIONS = `--import ${preloadPath}`;
  }

  // --- single-use lane process state ---
  let used = false;
  let proc: ChildProcess | null = null;
  let procExited = false;
  let dispatcher: RpcDispatcher | null = null;
  const eventQueue: RpcEvent[] = [];
  type WaitResult = IteratorResult<RpcEvent>;
  const eventWaiters: Array<(r: WaitResult) => void> = [];

  function assertCommandAllowed(cmd: RpcRecord): void {
    const t = typeof cmd?.type === "string" ? cmd.type : "";
    if (!ALLOWED_COMMANDS.has(t)) {
      throw new Error(`forbidden command (immutable profile): ${t || "(no type)"}`);
    }
  }

  function send(cmd: RpcRecord): void {
    assertCommandAllowed(cmd);
    const child = proc;
    if (!child?.stdin || child.stdin.destroyed) {
      throw new Error("launcher: lane process not running");
    }
    child.stdin.write(serializeCommand(cmd));
  }

  function dispatchEvent(ev: RpcEvent): void {
    const w = eventWaiters.shift();
    if (w) w({ value: ev, done: false });
    else eventQueue.push(ev);
  }

  function drainWaitersDone(): void {
    while (eventWaiters.length)
      eventWaiters.shift()!({ done: true, value: undefined } as WaitResult);
  }

  const self: Launcher = {
    argv: bs.argv,
    env,
    execPathPin,
    controlCwd: bs.controlCwd,
    closureHash,

    markUsed() {
      used = true;
    },

    assertUnused() {
      if (used) throw new Error("launcher: single-use lane process already consumed");
    },

    assertCommandAllowed,

    send,

    request(cmd: RpcRecord): Promise<RpcRecord> {
      assertCommandAllowed(cmd);
      if (typeof cmd.id !== "string" && typeof cmd.id !== "number") {
        return Promise.reject(new Error("launcher: correlated request id required"));
      }
      if (!dispatcher) {
        return Promise.reject(new Error("launcher: lane process not running"));
      }
      const response = dispatcher.registerPending(cmd.id);
      try {
        send(cmd);
      } catch {
        dispatcher.end();
      }
      return response;
    },

    events(): AsyncIterable<RpcEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<WaitResult> {
              if (eventQueue.length) {
                return Promise.resolve({ value: eventQueue.shift()!, done: false });
              }
              if (procExited) {
                return Promise.resolve({ done: true, value: undefined } as WaitResult);
              }
              return new Promise<WaitResult>((res) => eventWaiters.push(res));
            },
          };
        },
      };
    },

    async run(cb: (send: (cmd: RpcRecord) => void) => Promise<void>): Promise<void> {
      if (used) throw new Error("launcher: single-use lane process already consumed");

      // Spawn pi from the inert control cwd with the exact A1 argv/env.
      proc = spawn(bs.argv[0], bs.argv.slice(1), {
        cwd: bs.controlCwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // The dispatcher classifies each framed record: resolves pending command
      // promises on matching response ids, streams events, surfaces unknown-id
      // responses as wrongId (never fatal), and rejects still-pending commands
      // with an early-exit error when the stream closes.
      const activeDispatcher = new RpcDispatcher({ maxRecordBytes: MAX_RPC_RECORD_BYTES });
      dispatcher = activeDispatcher;
      activeDispatcher.on("event", (ev) => dispatchEvent(ev));
      activeDispatcher.on("end", () => {
        procExited = true;
        drainWaitersDone();
      });
      proc.stdout!.on("data", (chunk: Buffer) => activeDispatcher.push(chunk));
      proc.stdout!.on("end", () => activeDispatcher.end());
      proc.on("exit", () => {
        procExited = true;
        activeDispatcher.end();
        drainWaitersDone();
      });
      proc.on("error", () => {
        procExited = true;
        activeDispatcher.end();
        drainWaitersDone();
      });

      try {
        await cb((cmd: RpcRecord) => send(cmd));
      } finally {
        // Close stdin so pi shuts down on EOF (rpc-mode.js: stdin 'end' -> shutdown),
        // then wait for the lane process to exit. Runs even if cb throws so a
        // consumer error never orphans the lane process or skips the single-use
        // mark. If the consumer threw, that error propagates after cleanup.
        try {
          proc.stdin?.end();
        } catch {}
        if (!procExited) {
          await new Promise<void>((res) => {
            const p = proc;
            if (!p || p.exitCode !== null || p.signalCode) return res();
            p.once("exit", () => res());
            p.once("error", () => res());
          });
        }
        dispatcher = null;
        used = true;
      }
    },
  };

  return self;
}
