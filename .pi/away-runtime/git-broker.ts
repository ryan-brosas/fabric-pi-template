// A4 — Host-only Git broker for exact-path candidate commits and dedicated publication.
// All Git invocations use fixed argv arrays with shell:false (spawnSync default).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const CARD_ID = /^RM-\d{3,}$/;
const OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DEDICATED_BRANCH = /^pi-away\/rm-\d{3,}-[0-9a-f]{8}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runGit(repoRoot: string, args: string[], env?: NodeJS.ProcessEnv): GitResult {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`git-broker: git process failed: ${result.error.message}`);
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function requireGit(repoRoot: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const result = runGit(repoRoot, args, env);
  if (result.status !== 0) {
    throw new Error(`git-broker: command failed: git ${args[0] ?? "(missing)"}`);
  }
  return result.stdout.trim();
}

function canonicalRepository(repoRoot: string): string {
  if (!isAbsolute(repoRoot)) throw new Error("git-broker: repository path must be absolute");
  if (!existsSync(repoRoot) || !lstatSync(repoRoot).isDirectory()) {
    throw new Error("git-broker: repository path is not a directory");
  }
  const canonical = realpathSync(repoRoot);
  const top = requireGit(canonical, ["rev-parse", "--show-toplevel"]);
  if (realpathSync(top) !== canonical) {
    throw new Error("git-broker: repository path must be the worktree root");
  }
  return canonical;
}

function requireOid(value: string, label: string): void {
  if (!OID.test(value)) throw new Error(`git-broker: invalid ${label}`);
}

function requireDedicatedBranch(branch: string): string {
  if (!DEDICATED_BRANCH.test(branch)) {
    throw new Error("git-broker: expected a dedicated branch");
  }
  return `refs/heads/${branch}`;
}

function requireRemote(repoRoot: string, remote: string): void {
  if (!REMOTE.test(remote)) throw new Error("git-broker: invalid remote name");
  const result = runGit(repoRoot, ["remote", "get-url", remote]);
  if (result.status !== 0 || result.stdout.trim().length === 0) {
    throw new Error("git-broker: remote is not configured");
  }
}

function requirePath(path: string): void {
  const parts = path.split("/");
  if (
    path.length < 1 ||
    path.length > 4096 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\u0000\r\n]/.test(path) ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("git-broker: invalid candidate path");
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function zeroOid(length: number): string {
  return "0".repeat(length);
}

export function deriveAwayBranch(cardId: string, runId: string): string {
  if (!CARD_ID.test(cardId)) throw new Error("git-broker: invalid card id");
  if (!RUN_ID.test(runId)) throw new Error("git-broker: invalid run id");
  const runHex = runId.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (runHex.length < 8) throw new Error("git-broker: run id lacks an eight-hex suffix");
  return `pi-away/${cardId.toLowerCase()}-${runHex.slice(0, 8)}`;
}

export interface CandidateCommitRequest {
  repoRoot: string;
  baseOid: string;
  branch: string;
  runId: string;
  cardId: string;
  paths: string[];
  hashes: Record<string, string>;
}

export interface CandidateCommitResult {
  kind: "created" | "observed";
  oid: string;
  branch: string;
  ref: string;
}

function validateCandidateRequest(request: CandidateCommitRequest, repoRoot: string): void {
  requireOid(request.baseOid, "base OID");
  if (!RUN_ID.test(request.runId)) throw new Error("git-broker: invalid run id");
  if (!CARD_ID.test(request.cardId)) throw new Error("git-broker: invalid card id");
  if (request.branch !== deriveAwayBranch(request.cardId, request.runId)) {
    throw new Error("git-broker: branch does not match run identity");
  }
  if (!Array.isArray(request.paths) || request.paths.length < 1 || request.paths.length > 256) {
    throw new Error("git-broker: candidate paths are missing or exceed the limit");
  }
  const paths = [...request.paths].sort();
  if (new Set(paths).size !== paths.length || Object.keys(request.hashes).sort().join("\0") !== paths.join("\0")) {
    throw new Error("git-broker: candidate path/hash set mismatch");
  }
  for (const path of paths) {
    requirePath(path);
    const absolute = join(repoRoot, path);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
      throw new Error(`git-broker: candidate is not a regular file: ${path}`);
    }
    const expected = request.hashes[path];
    if (typeof expected !== "string" || !HASH.test(expected) || sha256File(absolute) !== expected) {
      throw new Error(`git-broker: candidate hash mismatch: ${path}`);
    }
  }
  requireGit(repoRoot, ["cat-file", "-e", `${request.baseOid}^{commit}`]);
}

function candidateIndexPath(repoRoot: string, runId: string): string {
  const gitPath = requireGit(repoRoot, ["rev-parse", "--git-path", "pi-away-indexes"]);
  const directory = resolve(repoRoot, gitPath);
  mkdirSync(directory, { recursive: true });
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const indexPath = join(directory, `${safe}.index`);
  mkdirSync(dirname(indexPath), { recursive: true });
  return indexPath;
}

export function createOrObserveCandidateCommit(
  request: CandidateCommitRequest,
): CandidateCommitResult {
  const repoRoot = canonicalRepository(request.repoRoot);
  const ref = requireDedicatedBranch(request.branch);
  validateCandidateRequest(request, repoRoot);

  const indexPath = candidateIndexPath(repoRoot, request.runId);
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  requireGit(repoRoot, ["read-tree", request.baseOid], env);
  requireGit(repoRoot, ["add", "--", ...request.paths], env);
  const staged = requireGit(repoRoot, ["diff", "--cached", "--name-only", "-z", request.baseOid], env)
    .split("\0")
    .filter(Boolean)
    .sort();
  const expectedPaths = [...request.paths].sort();
  if (staged.join("\0") !== expectedPaths.join("\0")) {
    throw new Error("git-broker: temporary index contains an unexpected path set");
  }
  const tree = requireGit(repoRoot, ["write-tree"], env);

  const existing = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (existing.status === 0) {
    const oid = existing.stdout.trim();
    requireOid(oid, "existing branch OID");
    const parent = requireGit(repoRoot, ["show", "-s", "--format=%P", oid]);
    const existingTree = requireGit(repoRoot, ["rev-parse", `${oid}^{tree}`]);
    const message = requireGit(repoRoot, ["show", "-s", "--format=%B", oid]);
    if (
      parent !== request.baseOid ||
      existingTree !== tree ||
      !message.includes(`Pi-Away-Run: ${request.runId}`) ||
      !message.includes(`Pi-Away-Card: ${request.cardId}`)
    ) {
      throw new Error("git-broker: dedicated local ref is divergent");
    }
    return { kind: "observed", oid, branch: request.branch, ref };
  }
  if (existing.status !== 1) throw new Error("git-broker: local ref probe failed");

  const message = [
    `feat(away): candidate ${request.cardId}`,
    "",
    `Pi-Away-Run: ${request.runId}`,
    `Pi-Away-Card: ${request.cardId}`,
  ].join("\n");
  const identityEnv = {
    ...env,
    GIT_AUTHOR_NAME: "Pi Away Controller",
    GIT_AUTHOR_EMAIL: "pi-away@localhost.invalid",
    GIT_COMMITTER_NAME: "Pi Away Controller",
    GIT_COMMITTER_EMAIL: "pi-away@localhost.invalid",
  };
  const commit = spawnSync("git", ["commit-tree", tree, "-p", request.baseOid], {
    cwd: repoRoot,
    env: identityEnv,
    input: `${message}\n`,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (commit.status !== 0) throw new Error("git-broker: commit-tree failed");
  const oid = commit.stdout.trim();
  requireOid(oid, "candidate OID");

  const update = runGit(repoRoot, ["update-ref", ref, oid, zeroOid(oid.length)]);
  if (update.status !== 0) {
    const raced = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (raced.status === 0 && raced.stdout.trim() === oid) {
      return { kind: "observed", oid, branch: request.branch, ref };
    }
    throw new Error("git-broker: local ref compare-and-swap failed");
  }
  return { kind: "created", oid, branch: request.branch, ref };
}

export type RemoteBranchState =
  | { kind: "absent"; branch: string; ref: string }
  | { kind: "match"; branch: string; ref: string; oid: string }
  | { kind: "divergent"; branch: string; ref: string; oid: string };

export interface ObserveRemoteRequest {
  repoRoot: string;
  remote: string;
  branch: string;
  expectedOid: string;
}

export function observeRemoteBranch(request: ObserveRemoteRequest): RemoteBranchState {
  const repoRoot = canonicalRepository(request.repoRoot);
  const ref = requireDedicatedBranch(request.branch);
  requireOid(request.expectedOid, "expected remote OID");
  requireRemote(repoRoot, request.remote);
  const result = runGit(repoRoot, ["ls-remote", "--exit-code", "--refs", request.remote, ref]);
  if (result.status === 2) return { kind: "absent", branch: request.branch, ref };
  if (result.status !== 0) {
    throw new Error(`git-broker: remote probe failed (exit ${result.status})`);
  }
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  if (lines.length !== 1) throw new Error("git-broker: remote probe returned an ambiguous ref set");
  const [oid, observedRef, extra] = lines[0].split(/\s+/);
  if (extra !== undefined || observedRef !== ref || !OID.test(oid)) {
    throw new Error("git-broker: remote probe returned malformed evidence");
  }
  return oid === request.expectedOid
    ? { kind: "match", branch: request.branch, ref, oid }
    : { kind: "divergent", branch: request.branch, ref, oid };
}

export interface PublishRequest {
  repoRoot: string;
  remote: string;
  branch: string;
  oid: string;
}

export interface PublishResult {
  kind: "published" | "observed";
  branch: string;
  ref: string;
  oid: string;
}

export function publishDedicatedBranch(request: PublishRequest): PublishResult {
  const repoRoot = canonicalRepository(request.repoRoot);
  const ref = requireDedicatedBranch(request.branch);
  requireOid(request.oid, "publication OID");
  requireRemote(repoRoot, request.remote);
  requireGit(repoRoot, ["cat-file", "-e", `${request.oid}^{commit}`]);

  const before = observeRemoteBranch({ ...request, repoRoot, expectedOid: request.oid });
  if (before.kind === "match") {
    return { kind: "observed", branch: request.branch, ref, oid: request.oid };
  }
  if (before.kind === "divergent") {
    throw new Error("git-broker: remote dedicated ref is divergent");
  }

  const push = runGit(repoRoot, [
    "push",
    "--porcelain",
    "--no-follow-tags",
    request.remote,
    `${request.oid}:${ref}`,
  ]);
  const after = observeRemoteBranch({ ...request, repoRoot, expectedOid: request.oid });
  if (after.kind !== "match") {
    throw new Error(
      push.status === 0
        ? "git-broker: remote did not converge after push"
        : `git-broker: push failed and remote did not converge (exit ${push.status})`,
    );
  }
  return { kind: "published", branch: request.branch, ref, oid: request.oid };
}