import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createOrObserveCandidateCommit,
  deriveAwayBranch,
  observeRemoteBranch,
  publishDedicatedBranch,
} from "./git-broker.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initRepository(): { repo: string; remote: string; baseOid: string } {
  const root = mkdtempSync(join(tmpdir(), "away-git-broker-"));
  const repo = join(root, "repo");
  const remote = join(root, "remote.git");
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Away Test");
  git(repo, "config", "user.email", "away-test@example.invalid");
  writeFileSync(join(repo, "candidate.txt"), "base\n");
  writeFileSync(join(repo, "unrelated.txt"), "untouched\n");
  git(repo, "add", "candidate.txt", "unrelated.txt");
  git(repo, "commit", "-m", "base");
  const baseOid = git(repo, "rev-parse", "HEAD");
  git(root, "init", "--bare", remote);
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "origin", "main:refs/heads/main");
  return { repo, remote, baseOid };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("A4 host Git broker", () => {
  it("derives only a dedicated run branch", () => {
    assert.equal(deriveAwayBranch("RM-003", "run-0123456789abcdef"), "pi-away/rm-003-01234567");
    assert.equal(
      deriveAwayBranch("MT-a1b2c3d4e5f6", "run-0123456789abcdef"),
      "pi-away/mt-a1b2c3d4e5f6-01234567",
    );
    assert.throws(() => deriveAwayBranch("main", "run-0123456789abcdef"), /card id/);
    assert.throws(() => deriveAwayBranch("RM-003", "short"), /run id/);
  });

  it("creates one exact-path commit and CAS-updates only the dedicated local ref", () => {
    const { repo, baseOid } = initRepository();
    writeFileSync(join(repo, "candidate.txt"), "candidate\n");
    writeFileSync(join(repo, "unrelated.txt"), "must-not-enter-candidate\n");
    const branch = deriveAwayBranch("RM-003", "run-0123456789abcdef");
    const result = createOrObserveCandidateCommit({
      repoRoot: repo,
      baseOid,
      branch,
      runId: "run-0123456789abcdef",
      cardId: "RM-003",
      paths: ["candidate.txt"],
      hashes: { "candidate.txt": sha256(join(repo, "candidate.txt")) },
    });
    assert.equal(result.kind, "created");
    assert.equal(git(repo, "rev-parse", "main"), baseOid, "default branch is unchanged");
    assert.equal(git(repo, "rev-parse",       "refs/heads/" + branch), result.oid);
    assert.equal(git(repo, "show", result.oid + ":candidate.txt"), "candidate");
    assert.equal(git(repo, "show", result.oid + ":unrelated.txt"), "untouched");
    assert.match(git(repo, "show", "-s", "--format=%B", result.oid), /Pi-Away-Run: run-0123456789abcdef/);
    const replay = createOrObserveCandidateCommit({
      repoRoot: repo,
      baseOid,
      branch,
      runId: "run-0123456789abcdef",
      cardId: "RM-003",
      paths: ["candidate.txt"],
      hashes: { "candidate.txt": sha256(join(repo, "candidate.txt")) },
    });
    assert.deepEqual(replay, { kind: "observed", oid: result.oid, branch, ref: "refs/heads/" + branch });
  });

  it("classifies exact remote state and publishes a normal fast-forward dedicated ref", () => {
    const { repo, baseOid } = initRepository();
    writeFileSync(join(repo, "candidate.txt"), "candidate\n");
    const branch = deriveAwayBranch("RM-003", "run-abcdef0123456789");
    const candidate = createOrObserveCandidateCommit({
      repoRoot: repo,
      baseOid,
      branch,
      runId: "run-abcdef0123456789",
      cardId: "RM-003",
      paths: ["candidate.txt"],
      hashes: { "candidate.txt": sha256(join(repo, "candidate.txt")) },
    });
    assert.deepEqual(observeRemoteBranch({ repoRoot: repo, remote: "origin", branch, expectedOid: candidate.oid }), { kind: "absent", branch, ref: "refs/heads/" + branch });
    assert.deepEqual(publishDedicatedBranch({ repoRoot: repo, remote: "origin", branch, oid: candidate.oid }), { kind: "published", branch, ref: "refs/heads/" + branch, oid: candidate.oid });
    assert.deepEqual(observeRemoteBranch({ repoRoot: repo, remote: "origin", branch, expectedOid: candidate.oid }), { kind: "match", branch, ref: "refs/heads/" + branch, oid: candidate.oid });
    assert.deepEqual(publishDedicatedBranch({ repoRoot: repo, remote: "origin", branch, oid: candidate.oid }), { kind: "observed", branch, ref: "refs/heads/" + branch, oid: candidate.oid });
  });

  it("blocks divergent publication and any non-away branch", () => {
    const { repo, remote, baseOid } = initRepository();
    writeFileSync(join(repo, "candidate.txt"), "divergent candidate\n");
    const branch = deriveAwayBranch("RM-003", "run-fedcba9876543210");
    const candidate = createOrObserveCandidateCommit({
      repoRoot: repo,
      baseOid,
      branch,
      runId: "run-fedcba9876543210",
      cardId: "RM-003",
      paths: ["candidate.txt"],
      hashes: { "candidate.txt": sha256(join(repo, "candidate.txt")) },
    });
    git(remote, "update-ref", "refs/heads/" + branch, baseOid);
    const state = observeRemoteBranch({ repoRoot: repo, remote: "origin", branch, expectedOid: candidate.oid });
    assert.deepEqual(state, { kind: "divergent", branch, ref: "refs/heads/" + branch, oid: baseOid });
    assert.throws(() => publishDedicatedBranch({ repoRoot: repo, remote: "origin", branch, oid: candidate.oid }), /divergent/);
    assert.throws(() => publishDedicatedBranch({ repoRoot: repo, remote: "origin", branch: "main", oid: baseOid }), /dedicated branch/);
  });
});
