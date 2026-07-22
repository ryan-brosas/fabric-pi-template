// A1 — Deterministic lane bootstrap.
//
// The away runtime keeps the trusted Pi RPC host OUTSIDE the sandbox and pins
// the per-lane Fabric node-process execPath at a trusted wrapper (A2). This
// module is the deterministic entry point: given a host-owned, versioned
// profile manifest (.pi/away-sandbox.json) and a lane id, it derives the
// synthetic fabric.json, the exact Pi RPC argv, the allowlisted environment,
// and an inert control cwd.
//
// Adversarial invariant: the effective profile is read ONLY from the manifest
// path the host supplies. process.env pollution (PI_FABRIC_*, PI_TRUST, ...) is
// dropped, never honored. A malicious project at any other cwd cannot override
// the host manifest, widen approvals, alter argv, or mutate the generated
// bytes. The synthetic fabric.json is written to the inert control cwd, never
// into the repository.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/bootstrap.test.ts

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";

export type FabricRisk = "read" | "write" | "execute" | "network" | "agent";
export type ApprovalMode = "allow" | "ask" | "deny";

export interface PinnedVersions {
  node: string;
  pi: string;
  pi_path: string;
  pi_fabric: string;
  pi_fabric_path: string;
  pi_fabric_node_process_runtime: string;
  pi_fabric_node_process_child_source: string;
  bwrap: string;
  bwrap_path: string;
  makora_provider: string;
  makora_provider_path: string;
}

export interface ModelRef {
  provider: string;
  model: string;
  thinking: string;
  provider_source: string | null;
}

export interface LaneApprovals {
  read: ApprovalMode;
  write: ApprovalMode;
  execute: ApprovalMode;
  network: ApprovalMode;
  agent: ApprovalMode;
}

export interface LaneProfile {
  network: boolean;
  filesystem: boolean;
  writable: boolean;
  tools: string[];
  host_call_refs: string[];
  approvals: LaneApprovals;
  model: string;
}

export interface Limits {
  cgroup_pid_max: number;
  cgroup_memory_bytes: number;
  cgroup_cpu_weight: number;
  cgroup_storage_bytes: number;
  executor_memory_limit_bytes: number;
  executor_timeout_ms: number;
  max_file_count: number;
  max_output_chars: number;
  max_nested_result_chars: number;
}

export interface Manifest {
  schema: string;
  version: number;
  pinned_versions: PinnedVersions;
  model_registry: Record<string, ModelRef>;
  extensions: { lane_extension: string };
  exec_path_override: string;
  control_cwd_root: string;
  env_allowlist: string[];
  env_deny_prefixes: string[];
  limits: Limits;
  host_call_refs: string[];
  host_call_risks: Record<string, FabricRisk>;
  lanes: Record<string, LaneProfile>;
  protected_paths: string[];
  runtime_protected_paths: string[];
}

export interface BootstrapOptions {
  /** Absolute path to the host manifest. Defaults to the canonical .pi/away-sandbox.json. */
  manifestPath?: string;
  /** Inert control cwd (NOT the repository). Defaults to the manifest control_cwd_root. */
  controlCwd?: string;
  /** Environment to filter through the allowlist. Defaults to process.env. */
  processEnv?: Record<string, string | undefined>;
}

export interface BootstrapResult {
  profileId: string;
  manifestHash: string;
  fabricConfig: Record<string, unknown>;
  fabricJsonPath: string;
  fabricJsonHash: string;
  argv: string[];
  env: Record<string, string>;
  controlCwd: string;
  repoRoot: string;
}

const CANONICAL_MANIFEST_PATH = join(
  dirname(new URL(".", import.meta.url).pathname),
  "..",
  "away-sandbox.json",
);

export function loadManifest(manifestPath: string = CANONICAL_MANIFEST_PATH): {
  manifest: Manifest;
  hash: string;
  canonical: string;
} {
  const raw = readFileSync(manifestPath);
  const hash = createHash("sha256").update(raw).digest("hex");
  const canonical = raw.toString("utf8");
  const manifest = JSON.parse(canonical) as Manifest;
  if (manifest.schema !== "away-sandbox/1") {
    throw new Error(`unexpected manifest schema: ${manifest.schema}`);
  }
  if (manifest.version !== 1) {
    throw new Error(`unexpected manifest version: ${manifest.version}`);
  }
  return { manifest, hash, canonical };
}

function expandHome(p: string): string {
  if (p.startsWith("~")) return join(homedir(), p.slice(1));
  return p;
}

function isDenied(name: string, denyPrefixes: string[]): boolean {
  return denyPrefixes.some((p) => name.startsWith(p));
}

function buildEnv(
  manifest: Manifest,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of manifest.env_allowlist) {
    const value = processEnv[name];
    if (value === undefined) continue;
    if (isDenied(name, manifest.env_deny_prefixes)) continue;
    env[name] = value;
  }
  return env;
}

function buildCaptureRisks(lane: LaneProfile, manifest: Manifest): Record<string, FabricRisk> {
  const risks: Record<string, FabricRisk> = {};
  for (const ref of lane.host_call_refs) {
    const risk = manifest.host_call_risks[ref];
    if (!risk) {
      throw new Error(`lane references undeclared host call ref: ${ref}`);
    }
    risks[ref] = risk;
  }
  return risks;
}

function buildFabricConfig(
  lane: LaneProfile,
  model: ModelRef,
  manifest: Manifest,
): Record<string, unknown> {
  const limits = manifest.limits;
  return {
    fullCodeMode: true,
    schema: { mode: "off" as const },
    approvals: lane.approvals,
    executor: {
      runtime: "node-process" as const,
      timeoutMs: limits.executor_timeout_ms,
      memoryLimitBytes: limits.executor_memory_limit_bytes,
      maxOutputChars: limits.max_output_chars,
      maxNestedResultChars: limits.max_nested_result_chars,
      resultFormat: "auto" as const,
    },
    mcp: {
      enabled: false,
      disableOAuth: true,
      allowDynamicServers: false,
      callTimeoutMs: 0,
    },
    subagents: {
      enabled: false,
      runner: "pi" as const,
      transport: "process" as const,
      model: model.model,
      claude: { binary: "claude" },
      thinking: model.thinking,
      maxConcurrent: 0,
      maxPerExecution: 0,
      maxDepth: 0,
      timeoutMs: 0,
      extensions: false,
      defaultTools: [],
      retainRuns: false,
      notifyOnComplete: false,
      budgetUsd: 0,
      maxTokensPerChild: 0,
    },
    capture: {
      enabled: true,
      hideFromModel: true,
      keepVisible: ["fabric_exec"],
      defaultRisk: "read" as const,
      risks: buildCaptureRisks(lane, manifest),
    },
    ui: {
      enabled: false,
      widget: "hidden" as const,
      maxRows: 0,
      refreshMs: 1000,
      eventHistory: 0,
      haltOnEscape: false,
      showNestedToolCalls: false,
      nestedToolDebounceMs: 0,
    },
    compaction: { engine: "fabric" as const, targetContextRatio: 0.7 },
    mesh: {
      enabled: false,
      actorScope: "session" as const,
      maxEventBytes: 0,
      maxReadEvents: 0,
      actorPollMs: 0,
      actorQueueLimit: 0,
      eventContextChars: 0,
      actorContextEntries: 0,
    },
    memory: {
      enabled: false,
      maxSessions: 0,
      maxEntryChars: 0,
      indexThinking: false,
      indexToolOutput: false,
    },
  };
}

function buildArgv(
  lane: LaneProfile,
  model: ModelRef,
  manifest: Manifest,
  repoRoot: string,
): string[] {
  // --approve trusts the inert control cwd non-interactively (projectTrustOverride,
  // project-trust.js:19 returns it before any UI prompt) so pi-fabric reads the
  // synthetic <controlCwd>/.pi/fabric.json (config.js:380 reads the project fabric.json
  // only when projectTrusted). The control cwd is host-owned and inert; --no-approve
  // would leave it untrusted and the per-lane config inert.
  const argv: string[] = [
    manifest.pinned_versions.pi_path,
    "--approve",
    "--no-context-files",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--tools",
    "fabric_exec",
  ];
  // pi-fabric must be loaded explicitly: --no-extensions keeps only explicit -e paths
  // (resource-loader.js:267) and drops the packages-discovered npm:pi-fabric, so without
  // this the fabric_exec tool never registers. Entry is dist/index.js (package main).
  const piFabricPath = manifest.pinned_versions.pi_fabric_path;
  argv.push("-e", resolve(repoRoot, piFabricPath, "dist/index.js"));
  // Lane extension (always; resolved against the host repo root).
  const laneExt = manifest.extensions.lane_extension;
  argv.push("-e", isAbsolute(laneExt) ? laneExt : resolve(repoRoot, laneExt));
  // Provider source only for non-built-in providers (makora). openai-codex is built-in.
  if (model.provider_source) {
    argv.push("-e", model.provider_source);
  }
  argv.push(
    "--mode",
    "rpc",
    "--provider",
    model.provider,
    "--model",
    model.model,
    "--thinking",
    model.thinking,
    "--print",
    "--no-session",
  );
  return argv;
}

export function bootstrap(profileId: string, opts: BootstrapOptions = {}): BootstrapResult {
  const manifestPath = opts.manifestPath ?? CANONICAL_MANIFEST_PATH;
  const { manifest, hash: manifestHash } = loadManifest(manifestPath);

  const lane = manifest.lanes[profileId];
  if (!lane) {
    throw new Error(`unknown lane: ${profileId}`);
  }
  const model = manifest.model_registry[lane.model];
  if (!model) {
    throw new Error(`lane ${profileId} references unknown model: ${lane.model}`);
  }

  // repoRoot is derived from the manifest location (host-owned), NEVER from cwd.
  // The manifest lives at <repoRoot>/.pi/away-sandbox.json.
  const repoRoot = resolve(dirname(manifestPath), "..");

  const controlCwd = opts.controlCwd ?? expandHome(manifest.control_cwd_root);
  if (resolve(controlCwd) === resolve(repoRoot)) {
    throw new Error(`control cwd must not be the repository: ${controlCwd}`);
  }
  mkdirSync(controlCwd, { recursive: true });

  const fabricConfig = buildFabricConfig(lane, model, manifest);
  // pi-fabric reads the project config from <cwd>/.pi/fabric.json (config.js:380),
  // never the bare control-cwd root. The .pi dir is created here; --approve (buildArgv)
  // makes the inert control cwd trusted so this file is actually read.
  mkdirSync(join(controlCwd, ".pi"), { recursive: true });
  const fabricJsonPath = join(controlCwd, ".pi", "fabric.json");
  const fabricJsonBytes = Buffer.from(JSON.stringify(fabricConfig, null, 2) + "\n", "utf8");
  writeFileSync(fabricJsonPath, fabricJsonBytes);
  const fabricJsonHash = createHash("sha256").update(fabricJsonBytes).digest("hex");

  const env = buildEnv(manifest, opts.processEnv ?? process.env);
  const argv = buildArgv(lane, model, manifest, repoRoot);

  return {
    profileId,
    manifestHash,
    fabricConfig,
    fabricJsonPath,
    fabricJsonHash,
    argv,
    env,
    controlCwd,
    repoRoot,
  };
}
