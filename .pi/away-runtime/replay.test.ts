import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import * as controller from "./controller.ts";
import { openLedger, type Ledger, type LedgerInput, type LedgerRecord } from "./ledger.ts";

interface AwayVerificationObservation {
  oid: string;
  receiptHash: string;
  fingerprint: string;
  fresh: boolean;
}

type AwayPullObservation =
  | { kind: "absent" }
  | { kind: "ambiguous" }
  | { kind: "match"; pullRequestId: number; requestId: string };

const reconcileAwayRun = (controller as Record<string, unknown>).reconcileAwayRun as (
  options: Record<string, unknown>,
) => Promise<{ kind: string; commitOid: string; remoteOid: string; pullRequestId: number }>;

const BASE = "1".repeat(40);
const CANDIDATE = "2".repeat(40);
const COMMIT = "3".repeat(40);
const RECEIPT = "4".repeat(64);
const SOURCE = "5".repeat(64);

function seed(ledger: Ledger, runId = "run-replay-01234567"): LedgerRecord {
  return ledger.append({
    runId,
    repositoryId: "repo-01234567",
    cardId: "RM-003",
    sourceHash: SOURCE,
    baseOid: BASE,
    effectKey: `${runId}:reserved`,
    status: "reserved",
    timestamp: 1,
    slug: "autonomous-away-loop",
  }).record;
}

class FakeHost {
  workspace = false;
  candidate: string | null = null;
  commit: string | null = null;
  verification: AwayVerificationObservation | null = null;
  remote: string | null = null;
  pull: AwayPullObservation = { kind: "absent" };
  calls = { workspace: 0, candidate: 0, commit: 0, verify: 0, push: 0, pr: 0 };
  crashAfterPush = false;
  crashAfterPr = false;

  async ensureWorkspace(): Promise<void> {
    if (!this.workspace) this.calls.workspace += 1;
    this.workspace = true;
  }
  async ensureCandidate(): Promise<{ oid: string }> {
    if (!this.candidate) this.calls.candidate += 1;
    this.candidate = CANDIDATE;
    return { oid: this.candidate };
  }
  async ensureCommit(candidateOid: string): Promise<{ oid: string }> {
    assert.equal(candidateOid, CANDIDATE);
    if (!this.commit) this.calls.commit += 1;
    this.commit = COMMIT;
    return { oid: this.commit };
  }
  async ensureVerification(commitOid: string): Promise<AwayVerificationObservation> {
    assert.equal(commitOid, COMMIT);
    if (!this.verification) {
      this.calls.verify += 1;
      this.verification = { oid: COMMIT, receiptHash: RECEIPT, fingerprint: "6".repeat(64), fresh: true };
    }
    return this.verification;
  }
  async observeRemote(commitOid: string) {
    assert.equal(commitOid, COMMIT);
    if (this.remote === null) return { kind: "absent" as const };
    return this.remote === commitOid
      ? { kind: "match" as const, oid: this.remote }
      : { kind: "divergent" as const, oid: this.remote };
  }
  async publish(commitOid: string): Promise<void> {
    this.calls.push += 1;
    this.remote = commitOid;
    if (this.crashAfterPush) {
      this.crashAfterPush = false;
      throw new Error("crash after push");
    }
  }
  async observePullRequest(): Promise<AwayPullObservation> {
    return this.pull;
  }
  async createOrGetDraftPullRequest(requestId: string): Promise<AwayPullObservation> {
    this.calls.pr += 1;
    this.pull = { kind: "match", pullRequestId: 77, requestId: "github-request-77" };
    if (this.crashAfterPr) {
      this.crashAfterPr = false;
      throw new Error("crash after pr");
    }
    return this.pull;
  }
}

function fresh(): { ledger: Ledger; reservation: LedgerRecord; host: FakeHost } {
  const root = mkdtempSync(join(tmpdir(), "away-replay-"));
  const ledger = openLedger(root);
  return { ledger, reservation: seed(ledger), host: new FakeHost() };
}

describe("A6 crash replay and completion", () => {
  it("advances the legal host-observed chain exactly once", async () => {
    const { ledger, reservation, host } = fresh();
    const result = await reconcileAwayRun({ ledger, reservation, host, now: () => 10 });
    assert.deepEqual(result, { kind: "completed", commitOid: COMMIT, remoteOid: COMMIT, pullRequestId: 77 });
    assert.deepEqual(host.calls, { workspace: 1, candidate: 1, commit: 1, verify: 1, push: 1, pr: 1 });
    assert.deepEqual(
      ledger.replay().records.map((record) => record.status),
      ["reserved", "workspace_observed", "candidate_observed", "commit_observed", "verified", "push_intent", "push_observed", "pr_intent", "pr_observed", "completed"],
    );
  });

  it("recovers after every durable append without duplicating effects", async () => {
    for (let cut = 1; cut <= 9; cut += 1) {
      const { ledger, reservation, host } = fresh();
      let appends = 0;
      const crashing: Ledger = {
        replay: () => ledger.replay(),
        append(input: LedgerInput) {
          const result = ledger.append(input);
          appends += 1;
          if (appends === cut) throw new Error(`crash after append ${cut}`);
          return result;
        },
      };
      await assert.rejects(
        reconcileAwayRun({ ledger: crashing, reservation, host, now: () => 10 }),
        /crash after append/,
      );
      const recovered = await reconcileAwayRun({ ledger, reservation, host, now: () => 11 });
      assert.equal(recovered.kind, "completed", `cut ${cut}`);
      assert.deepEqual(host.calls, { workspace: 1, candidate: 1, commit: 1, verify: 1, push: 1, pr: 1 }, `cut ${cut}`);
    }
  });

  it("observes push and PR effects after crashes instead of replaying mutations", async () => {
    const pushed = fresh();
    pushed.host.crashAfterPush = true;
    await assert.rejects(reconcileAwayRun({ ...pushed, now: () => 20 }), /crash after push/);
    await reconcileAwayRun({ ...pushed, now: () => 21 });
    assert.equal(pushed.host.calls.push, 1);

    const pr = fresh();
    pr.host.crashAfterPr = true;
    await assert.rejects(reconcileAwayRun({ ...pr, now: () => 30 }), /crash after pr/);
    await reconcileAwayRun({ ...pr, now: () => 31 });
    assert.equal(pr.host.calls.pr, 1);
  });

  it("blocks stale verification, divergent remote state, and ambiguous PR state", async () => {
    const stale = fresh();
    stale.host.verification = { oid: COMMIT, receiptHash: RECEIPT, fingerprint: "6".repeat(64), fresh: false };
    await assert.rejects(reconcileAwayRun({ ...stale, now: () => 40 }), /verification.*fresh/);

    const divergent = fresh();
    divergent.host.remote = "7".repeat(40);
    await assert.rejects(reconcileAwayRun({ ...divergent, now: () => 50 }), /remote.*divergent/);

    const ambiguous = fresh();
    ambiguous.host.pull = { kind: "ambiguous" };
    await assert.rejects(reconcileAwayRun({ ...ambiguous, now: () => 60 }), /pull request.*ambiguous/);
  });
});