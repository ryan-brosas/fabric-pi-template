// A1 — Durable external-effect ledger tests.
//
// Real filesystem tests exercise framed append, fsync-oriented persistence,
// replay, corruption handling, and reducer semantics. Temporary ledgers are
// intentionally retained; tests never delete journal evidence. Torn-tail and
// checksum-corruption cases simulate crash/bit-rot artifacts by appending
// crafted bytes to a segment (never by having the ledger itself mutate
// evidence).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/ledger.test.ts

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openLedger, type LedgerInput, type LedgerStatus } from "./ledger.ts";

const reservation: LedgerInput = {
  runId: "run-0123456789abcdef",
  repositoryId: "repo-0123456789abcdef",
  cardId: "RM-003",
  sourceHash: "a".repeat(64),
  baseOid: "b".repeat(40),
  effectKey: "reserve:repo-0123456789abcdef:RM-003",
  status: "reserved",
  timestamp: 1_721_600_000_000,
};

const CHAIN: LedgerStatus[] = [
  "reserved",
  "workspace_observed",
  "candidate_observed",
  "commit_observed",
  "verified",
  "push_intent",
  "push_observed",
  "pr_intent",
  "pr_observed",
  "completed",
];

function makeInput(
  o: Partial<LedgerInput> & Pick<LedgerInput, "runId" | "effectKey" | "status">,
): LedgerInput {
  return { ...reservation, ...o };
}

/** A reservation with fixed-length fields keyed by `tag` (equal frame sizes). */
function resFor(tag: string, sourceChar: string): LedgerInput {
  return {
    runId: `run-${tag.repeat(16)}`,
    repositoryId: `repo-${tag.repeat(16)}`,
    cardId: "RM-003",
    sourceHash: sourceChar.repeat(64),
    baseOid: "b".repeat(40),
    effectKey: `reserve:repo-${tag.repeat(16)}:RM-003`,
    status: "reserved",
    timestamp: 1_721_600_000_000,
  };
}

function measureFrame(input: LedgerInput): number {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-measure-"));
  openLedger(root).append(input);
  return statSync(join(root, "segment-000001.log")).size;
}

/** A complete frame with a valid 10-byte JSON payload but a wrong SHA-256. */
function badChecksumFrame(): Buffer {
  const payload = Buffer.from('{"x":1234}', "utf8");
  const header = Buffer.from(`AWL1:0000000010:${"0".repeat(64)}\n`, "ascii");
  return Buffer.concat([header, payload, Buffer.from([0x0a])]);
}

/** A complete header declaring a 100-byte payload that never lands (torn tail). */
function tornHeader(): Buffer {
  return Buffer.from(`AWL1:0000000100:${"0".repeat(64)}\n`, "ascii");
}

/** Atomic acknowledgement filename for a torn segment: `recovery-NNNNNN-LLLLLLLLLL-<sha256>.ack`. */
function recoveryAckName(segmentPath: string, segmentNumber: number): string {
  const bytes = readFileSync(segmentPath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  return `recovery-${String(segmentNumber).padStart(6, "0")}-${String(bytes.length).padStart(10, "0")}-${hash}.ack`;
}

test("framed reservation is durable and replayable", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const appended = ledger.append(reservation);

  assert.equal(appended.kind, "appended");
  assert.equal(appended.record.sequence, 1);

  const replayed = openLedger(root).replay();
  assert.equal(replayed.records.length, 1);
  assert.deepEqual(replayed.records[0], appended.record);
});

test("exact duplicate append is a no-op returning the original record", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const first = ledger.append(reservation);
  assert.equal(first.kind, "appended");

  const dup = ledger.append(reservation);
  assert.equal(dup.kind, "duplicate");
  assert.deepEqual(dup.record, first.record);

  // the duplicate consumed no sequence: the next real append is seq 2
  const next = ledger.append(
    makeInput({
      runId: reservation.runId,
      effectKey: "step:reserve:workspace",
      status: "workspace_observed",
    }),
  );
  assert.equal(next.kind, "appended");
  assert.equal(next.record.sequence, 2);

  assert.equal(openLedger(root).replay().records.length, 2);
});

test("conflicting effect key throws", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(reservation);
  assert.throws(
    () => ledger.append({ ...reservation, timestamp: reservation.timestamp + 1 } as LedgerInput),
    /conflicting effectKey/,
  );
  assert.equal(openLedger(root).replay().records.length, 1);
});

test("distinct run cannot reserve an identity already present", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(reservation);
  assert.throws(
    () =>
      ledger.append(
        makeInput({
          runId: "run-bbbbbbbbbbbbbbbb",
          effectKey: "reserve:repo-bbbbbbbbbbbbbbbb:RM-003",
          status: "reserved",
        }),
      ),
    /already reserved/,
  );
  assert.equal(openLedger(root).replay().records.length, 1);
});

test("legal status chain advances to completed", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const run = reservation.runId;
  let seq = 0;
  for (const s of CHAIN) {
    const r = ledger.append(makeInput({ runId: run, effectKey: `step:${run}:${s}`, status: s }));
    assert.equal(r.kind, "appended");
    seq += 1;
    assert.equal(r.record.sequence, seq);
  }
  const replayed = openLedger(root).replay();
  assert.equal(replayed.records.length, CHAIN.length);
  assert.equal(replayed.records[replayed.records.length - 1].status, "completed");
  assert.equal(replayed.tornTail, null);
});

test("illegal forward transition (skip) throws", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const run = reservation.runId;
  ledger.append(reservation);
  assert.throws(
    () => ledger.append(makeInput({ runId: run, effectKey: "skip:commit", status: "commit_observed" })),
    /illegal transition/,
  );
});

test("post-terminal event throws after completed", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const run = reservation.runId;
  for (const s of CHAIN) {
    ledger.append(makeInput({ runId: run, effectKey: `step:${run}:${s}`, status: s }));
  }
  assert.throws(
    () =>
      ledger.append(makeInput({ runId: run, effectKey: "post:completed:ws", status: "workspace_observed" })),
    /illegal transition/,
  );
  assert.throws(
    () => ledger.append(makeInput({ runId: run, effectKey: "post:completed:blocked", status: "blocked" })),
    /post-terminal/,
  );
});

test("blocked and aborted terminate nonterminal runs and block further events", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(makeInput({ runId: "run-blocked", effectKey: "r1:reserved", status: "reserved" }));
  ledger.append(makeInput({ runId: "run-blocked", effectKey: "r1:blocked", status: "blocked" }));
  ledger.append(
    makeInput({ runId: "run-aborted", effectKey: "r2:reserved", status: "reserved", sourceHash: "c".repeat(64) }),
  );
  ledger.append(makeInput({ runId: "run-aborted", effectKey: "r2:ws", status: "workspace_observed", sourceHash: "c".repeat(64) }));
  ledger.append(makeInput({ runId: "run-aborted", effectKey: "r2:aborted", status: "aborted", sourceHash: "c".repeat(64) }));
  assert.throws(
    () => ledger.append(makeInput({ runId: "run-blocked", effectKey: "r1:post", status: "workspace_observed" })),
    /terminal/,
  );
  assert.throws(
    () => ledger.append(makeInput({ runId: "run-aborted", effectKey: "r2:post", status: "workspace_observed", sourceHash: "c".repeat(64) })),
    /terminal/,
  );
  const replayed = openLedger(root).replay();
  assert.equal(replayed.records.length, 5);
  assert.equal(replayed.records[1].status, "blocked");
  assert.equal(replayed.records[4].status, "aborted");
});

test("identity drift within a run throws", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const run = reservation.runId;
  ledger.append(reservation);
  assert.throws(
    () =>
      ledger.append(
        makeInput({ runId: run, effectKey: "drift:base", status: "workspace_observed", baseOid: "d".repeat(40) }),
      ),
    /identity drift/,
  );
  assert.throws(
    () =>
      ledger.append(
        makeInput({ runId: run, effectKey: "drift:source", status: "workspace_observed", sourceHash: "e".repeat(64) }),
      ),
    /identity drift/,
  );
});

test("reopen rebuilds reducer state and continues the chain", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const run = reservation.runId;
  const l1 = openLedger(root);
  l1.append(reservation);
  l1.append(makeInput({ runId: run, effectKey: "step:ws", status: "workspace_observed" }));
  const l2 = openLedger(root);
  const r = l2.append(makeInput({ runId: run, effectKey: "step:co", status: "candidate_observed" }));
  assert.equal(r.kind, "appended");
  assert.equal(r.record.sequence, 3);
  assert.equal(r.record.status, "candidate_observed");
  const replayed = openLedger(root).replay();
  assert.equal(replayed.records.length, 3);
});

test("bounded optional host facts are accepted and replayed", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  const r = ledger.append({
    ...reservation,
    slug: "feature-x",
    candidateOid: "c".repeat(40),
    commitOid: "d".repeat(64),
    verificationReceiptHash: "e".repeat(64),
    remoteOid: "f".repeat(40),
    requestId: "req-1",
    pullRequestId: 42,
  } as LedgerInput);
  assert.equal(r.kind, "appended");
  const rec = openLedger(root).replay().records[0];
  assert.equal(rec.slug, "feature-x");
  assert.equal(rec.candidateOid, "c".repeat(40));
  assert.equal(rec.commitOid, "d".repeat(64));
  assert.equal(rec.verificationReceiptHash, "e".repeat(64));
  assert.equal(rec.remoteOid, "f".repeat(40));
  assert.equal(rec.requestId, "req-1");
  assert.equal(rec.pullRequestId, 42);
});

test("torn final payload is retained; next append starts a new segment with old bytes unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(reservation);
  const seg1Path = join(root, "segment-000001.log");
  const seg1Before = readFileSync(seg1Path);
  // simulate a torn second write: a complete header whose payload never landed
  appendFileSync(seg1Path, tornHeader());

  const reopened = openLedger(root);
  const replayed = reopened.replay();
  assert.equal(replayed.records.length, 1);
  assert.equal(replayed.records[0].sequence, 1);
  assert.ok(replayed.tornTail);
  assert.equal(replayed.tornTail!.segment, "segment-000001.log");
  assert.equal(replayed.tornTail!.reason, "short payload");

  const appended = reopened.append(
    makeInput({ runId: reservation.runId, effectKey: "step:reserve:workspace", status: "workspace_observed" }),
  );
  assert.equal(appended.kind, "appended");
  assert.equal(appended.record.sequence, 2);

  // old segment bytes are unchanged; new evidence went to a fresh segment
  const seg1After = readFileSync(seg1Path);
  assert.deepEqual(seg1After, Buffer.concat([seg1Before, tornHeader()]));
  assert.ok(existsSync(join(root, "segment-000002.log")));
  assert.ok(statSync(join(root, "segment-000002.log")).size > 0);

  const reopened2 = openLedger(root);
  const replayed2 = reopened2.replay();
  assert.equal(replayed2.records.length, 2);
  assert.deepEqual(replayed2.records.map((r) => r.sequence), [1, 2]);
  assert.equal(replayed2.tornTail, null);
  assert.equal(replayed2.recoveredTornTails.length, 1);
  assert.equal(replayed2.recoveredTornTails[0].segment, "segment-000001.log");
  assert.deepEqual(readFileSync(seg1Path), seg1After);
});

test("earlier-segment torn frame blocks replay", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const b = resFor("b", "b");
  const frameSize = measureFrame(a);
  // The cap must accommodate segment-000001 after the torn tail is appended so
  // replay reaches the recovery-marker check rather than the per-file size cap.
  const ledger = openLedger(root, { maxSegmentBytes: frameSize + tornHeader().length });
  ledger.append(a);
  ledger.append(b);
  appendFileSync(join(root, "segment-000001.log"), tornHeader());
  assert.throws(() => openLedger(root).replay(), /torn tail.*without recovery acknowledgement/);
});

test("checksum corruption blocks replay", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  openLedger(root).append(reservation);
  appendFileSync(join(root, "segment-000001.log"), badChecksumFrame());
  assert.throws(() => openLedger(root).replay(), /checksum/);
});

test("bad checksum in an earlier segment blocks replay", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const b = resFor("b", "b");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxSegmentBytes: frameSize });
  ledger.append(a);
  ledger.append(b);
  appendFileSync(join(root, "segment-000001.log"), badChecksumFrame());
  assert.throws(() => openLedger(root).replay(), /checksum/);
});

test("unknown and secret-shaped input keys are rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  for (const badKey of ["prompt", "source", "log", "apiKey", "credentials", "secret", "env", "system"]) {
    const input = { ...reservation, [badKey]: "sensitive payload" };
    assert.throws(() => ledger.append(input as LedgerInput), /unknown input key/);
  }
  assert.equal(openLedger(root).replay().records.length, 0);
});

test("malformed field bounds are rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  assert.throws(() => ledger.append({ ...reservation, sourceHash: "a".repeat(63) } as LedgerInput), /sourceHash/);
  assert.throws(() => ledger.append({ ...reservation, sourceHash: "g".repeat(64) } as LedgerInput), /sourceHash/);
  assert.throws(() => ledger.append({ ...reservation, baseOid: "b".repeat(50) } as LedgerInput), /baseOid/);
  assert.throws(() => ledger.append({ ...reservation, cardId: "RM-3" } as LedgerInput), /cardId/);
  assert.throws(() => ledger.append({ ...reservation, cardId: "XYZ-003" } as LedgerInput), /cardId/);
  assert.throws(() => ledger.append({ ...reservation, timestamp: -1 } as LedgerInput), /timestamp/);
  assert.throws(() => ledger.append({ ...reservation, timestamp: 1.5 } as LedgerInput), /timestamp/);
  assert.throws(() => ledger.append({ ...reservation, pullRequestId: 0 } as LedgerInput), /pullRequestId/);
  assert.throws(() => ledger.append({ ...reservation, pullRequestId: "1" } as LedgerInput), /pullRequestId/);
  assert.throws(() => ledger.append({ ...reservation, runId: "" } as LedgerInput), /runId/);
  assert.throws(() => ledger.append({ ...reservation, runId: "x".repeat(129) } as LedgerInput), /runId/);
  assert.throws(() => ledger.append({ ...reservation, runId: "run with space" } as LedgerInput), /runId/);
  assert.throws(() => ledger.append({ ...reservation, effectKey: "" } as LedgerInput), /effectKey/);
  assert.throws(() => ledger.append({ ...reservation, effectKey: "key\nwith\nnewline" } as LedgerInput), /effectKey/);
  assert.throws(() => ledger.append({ ...reservation, slug: "x".repeat(129) } as LedgerInput), /slug/);
  assert.throws(() => ledger.append({ ...reservation, slug: "Uppercase" } as LedgerInput), /slug/);
  assert.equal(openLedger(root).replay().records.length, 0);
});

test("maxRecordBytes cap fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxRecordBytes: frameSize - 1 });
  assert.throws(() => ledger.append(a), /maxRecordBytes/);
  assert.equal(openLedger(root).replay().records.length, 0);
});

test("maxSegmentBytes cap fails closed when a frame cannot fit", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxSegmentBytes: frameSize - 1 });
  assert.throws(() => ledger.append(a), /maxSegmentBytes/);
  assert.equal(openLedger(root).replay().records.length, 0);
});

test("maxSegmentBytes rolls to a new segment when exceeded", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const b = resFor("b", "b");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxSegmentBytes: frameSize, maxSegments: 2 });
  ledger.append(a);
  ledger.append(b);
  assert.ok(existsSync(join(root, "segment-000001.log")));
  assert.ok(existsSync(join(root, "segment-000002.log")));
  const replayed = openLedger(root).replay();
  assert.equal(replayed.records.length, 2);
  assert.equal(replayed.records[0].runId, a.runId);
  assert.equal(replayed.records[1].runId, b.runId);
});

test("maxLedgerBytes cap fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const b = resFor("b", "b");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxLedgerBytes: frameSize + 1 });
  ledger.append(a);
  assert.throws(() => ledger.append(b), /maxLedgerBytes/);
  assert.equal(openLedger(root).replay().records.length, 1);
});

test("maxSegments cap fails closed when a new segment is needed", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const b = resFor("b", "b");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxSegmentBytes: frameSize, maxSegments: 1 });
  ledger.append(a);
  assert.throws(() => ledger.append(b), /maxSegments/);
  assert.equal(openLedger(root).replay().records.length, 1);
});

test("existing evidence is rechecked against configured caps", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const a = resFor("a", "a");
  const b = resFor("b", "b");
  const frameSize = measureFrame(a);
  const ledger = openLedger(root, { maxSegmentBytes: frameSize, maxSegments: 2 });
  ledger.append(a);
  ledger.append(b);
  assert.ok(existsSync(join(root, "segment-000001.log")));
  assert.ok(existsSync(join(root, "segment-000002.log")));
  assert.throws(() => openLedger(root, { maxRecordBytes: frameSize - 1 }), /maxRecordBytes/);
  assert.throws(() => openLedger(root, { maxSegmentBytes: frameSize - 1 }), /maxSegmentBytes/);
  assert.throws(() => openLedger(root, { maxLedgerBytes: 2 * frameSize - 1 }), /maxLedgerBytes/);
  assert.throws(() => openLedger(root, { maxSegments: 1 }), /maxSegments/);
});

test("mismatched recovery acknowledgement blocks", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(reservation);
  const seg1Path = join(root, "segment-000001.log");
  appendFileSync(seg1Path, tornHeader());
  // retained bytes: the full prior segment length including the torn tail
  const retainedBytes = statSync(seg1Path).size;
  // empty ack file whose filename names segment 1 and the exact retained byte
  // length but declares an all-zero SHA-256 (mismatches the real segment bytes)
  const ackName = `recovery-000001-${String(retainedBytes).padStart(10, "0")}-${"0".repeat(64)}.ack`;
  appendFileSync(join(root, ackName), Buffer.alloc(0));
  // ack filename hash mismatch (any order; recovery|sha256|mismatch)
  assert.throws(() => openLedger(root).replay(), /(?=.*recovery)(?=.*(?:hash|sha-?256))(?=.*mismatch)/i);
});

test("atomic recovery acknowledgement survives a partial successor", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(reservation);
  const seg1Path = join(root, "segment-000001.log");
  appendFileSync(seg1Path, tornHeader());
  const seg1After = readFileSync(seg1Path);
  // durable atomic ack for segment 1's torn tail
  appendFileSync(join(root, recoveryAckName(seg1Path, 1)), Buffer.alloc(0));
  // crash after durable ack but before the successor frame completed: only the
  // first 17 bytes of a would-be frame/header landed in segment-000002.
  const seg2Path = join(root, "segment-000002.log");
  const partialSuccessor = Buffer.from("AWL1:0000000100:", "ascii");
  assert.equal(partialSuccessor.length, 16);
  appendFileSync(seg2Path, partialSuccessor);

  const reopened = openLedger(root);
  const replayed = reopened.replay();
  assert.equal(replayed.records.length, 1);
  assert.equal(replayed.records[0].sequence, 1);
  assert.ok(
    replayed.recoveredTornTails.some((t) => t.segment === "segment-000001.log"),
    "segment 1 torn tail is acknowledged",
  );
  assert.ok(replayed.tornTail);
  assert.equal(replayed.tornTail!.segment, "segment-000002.log");

  const appended = reopened.append(
    makeInput({ runId: reservation.runId, effectKey: "step:reserve:workspace", status: "workspace_observed" }),
  );
  assert.equal(appended.kind, "appended");
  assert.equal(appended.record.sequence, 2);
  const seg3Path = join(root, "segment-000003.log");
  assert.ok(existsSync(seg3Path));
  assert.ok(statSync(seg3Path).size > 0);

  const reopened2 = openLedger(root);
  const replayed2 = reopened2.replay();
  assert.equal(replayed2.records.length, 2);
  assert.deepEqual(replayed2.records.map((r) => r.sequence), [1, 2]);
  assert.equal(replayed2.tornTail, null);
  assert.equal(replayed2.recoveredTornTails.length, 2);
  assert.ok(replayed2.recoveredTornTails.some((t) => t.segment === "segment-000001.log"));
  assert.ok(replayed2.recoveredTornTails.some((t) => t.segment === "segment-000002.log"));
  // all original bytes/files are retained
  assert.deepEqual(readFileSync(seg1Path), seg1After);
  assert.deepEqual(readFileSync(seg2Path), partialSuccessor);
  assert.ok(existsSync(join(root, recoveryAckName(seg1Path, 1))));
  assert.ok(existsSync(join(root, recoveryAckName(seg2Path, 2))));
});

test("partial in-band marker is not an acknowledgement", () => {
  const root = mkdtempSync(join(tmpdir(), "away-ledger-a1-"));
  const ledger = openLedger(root);
  ledger.append(reservation);
  const seg1Path = join(root, "segment-000001.log");
  appendFileSync(seg1Path, tornHeader());
  // a partial in-band recovery marker in segment-000002 is NOT an ack file
  const seg2Path = join(root, "segment-000002.log");
  const partialMarker = Buffer.from("AWL1-RECOVER:0000", "ascii");
  assert.equal(partialMarker.length, 17);
  appendFileSync(seg2Path, partialMarker);
  // no ack file exists for segment 1; replay must block for the missing ack
  assert.throws(() => openLedger(root).replay(), /(?=.*recovery)(?=.*ack)/i);
});