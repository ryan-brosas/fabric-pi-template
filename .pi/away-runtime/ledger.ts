// A1 — Durable external-effect ledger.
//
// Append-only, framed, fsync-durable ledger of external-effect records for
// the away loop. Each append validates a bounded input, stamps the fixed
// `away-loop-ledger/1` schema and a monotonic sequence, frames the canonical
// JSON payload with an ASCII header (magic, payload length, SHA-256) and a
// delimiter, fsyncs the segment file (and the containing directory when a new
// segment is created), and never truncates, overwrites, renames, or deletes
// evidence.
//
// Replay parses every frame by declared length, verifies checksum, JSON,
// schema, sequence, field invariants, and the per-run reducer (transitions,
// stable identity, reservation exclusivity, effect-key immutability), and
// tolerates a single torn tail at the end of the FINAL segment: the next
// append starts a new segment, leaving the torn bytes in place. Any
// earlier-segment torn frame, complete-but-bad frame, numbering gap, or
// corruption blocks.
//
// The bounded field set is an ALLOWLIST: unknown keys (and therefore
// secret/source/prompt/log payloads) are rejected.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/ledger.test.ts

import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const SCHEMA = "away-loop-ledger/1";
const HEADER_MAGIC = "AWL1";
const HEADER_LEN = 81; // "AWL1:" + 10-digit length + ":" + 64-hex sha + "\n"
const DELIMITER = 0x0a;
const ACK_NAME = /^recovery-(\d{6})-(\d{10})-([0-9a-f]{64})\.ack$/;
const SEGMENT_NAME = /^segment-(\d{6})\.log$/;

const STATUS_ORDER = [
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
] as const;
type ForwardStatus = (typeof STATUS_ORDER)[number];
type TerminalStatus = "blocked" | "aborted";
export type LedgerStatus = ForwardStatus | TerminalStatus;

const TERMINAL = new Set<LedgerStatus>(["completed", "blocked", "aborted"]);
const ALL_STATUSES = new Set<LedgerStatus>([...STATUS_ORDER, "blocked", "aborted"]);

const DEFAULTS = {
  maxRecordBytes: 65536,
  maxSegmentBytes: 8 * 1024 * 1024,
  maxLedgerBytes: 1024 * 1024 * 1024,
  maxSegments: 65536,
};

const FIELD_MAX = {
  runId: 128,
  repositoryId: 128,
  cardId: 32,
  effectKey: 256,
  slug: 128,
  requestId: 128,
};

const HEX64 = /^[0-9a-f]{64}$/;
const HEX_OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const CARD_ID = /^RM-\d{3,}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const INPUT_KEYS = new Set<string>([
  "runId",
  "repositoryId",
  "cardId",
  "sourceHash",
  "baseOid",
  "effectKey",
  "status",
  "timestamp",
  "slug",
  "candidateOid",
  "commitOid",
  "verificationReceiptHash",
  "remoteOid",
  "requestId",
  "pullRequestId",
]);

export interface LedgerInput {
  runId: string;
  repositoryId: string;
  cardId: string;
  sourceHash: string;
  baseOid: string;
  effectKey: string;
  status: LedgerStatus;
  timestamp: number;
  slug?: string;
  candidateOid?: string;
  commitOid?: string;
  verificationReceiptHash?: string;
  remoteOid?: string;
  requestId?: string;
  pullRequestId?: number;
}

export interface LedgerRecord extends LedgerInput {
  schema: "away-loop-ledger/1";
  sequence: number;
}

export interface LedgerAppendResult {
  kind: "appended" | "duplicate";
  record: LedgerRecord;
}

export interface TornTailEvidence {
  segment: string;
  offset: number;
  available: number;
  reason: "short header" | "short payload" | "short delimiter";
}

export interface LedgerReplayResult {
  records: LedgerRecord[];
  tornTail: TornTailEvidence | null;
  recoveredTornTails: TornTailEvidence[];
}

export interface LedgerOptions {
  maxRecordBytes?: number;
  maxSegmentBytes?: number;
  maxLedgerBytes?: number;
  maxSegments?: number;
}

export interface Ledger {
  append(input: LedgerInput): LedgerAppendResult;
  replay(): LedgerReplayResult;
}

interface RunState {
  repositoryId: string;
  cardId: string;
  sourceHash: string;
  baseOid: string;
  status: LedgerStatus;
}

interface LedgerState {
  nextSequence: number;
  effectKeys: Map<string, { record: LedgerRecord; inputCanonical: string }>;
  runs: Map<string, RunState>;
  reservations: Map<string, string>;
}

interface RecoveryAck {
  name: string;
  previousSegment: number;
  previousBytes: number;
  previousSha256: string;
}

interface SegmentFile {
  name: string;
  number: number;
  bytes: Buffer;
}

function reservationKey(
  repositoryId: string,
  cardId: string,
  sourceHash: string,
): string {
  return `${repositoryId}\u0000${cardId}\u0000${sourceHash}`;
}

/** Validate the bounded input field set. Rejects unknown/oversized values. */
function validateInputFields(o: Record<string, unknown>): void {
  const runId = o.runId;
  if (
    typeof runId !== "string" ||
    runId.length < 1 ||
    runId.length > FIELD_MAX.runId ||
    !SAFE_IDENTIFIER.test(runId)
  ) {
    throw new Error("ledger: invalid runId");
  }
  const repositoryId = o.repositoryId;
  if (
    typeof repositoryId !== "string" ||
    repositoryId.length < 1 ||
    repositoryId.length > FIELD_MAX.repositoryId ||
    !SAFE_IDENTIFIER.test(repositoryId)
  ) {
    throw new Error("ledger: invalid repositoryId");
  }
  const cardId = o.cardId;
  if (
    typeof cardId !== "string" ||
    cardId.length < 1 ||
    cardId.length > FIELD_MAX.cardId ||
    !CARD_ID.test(cardId)
  ) {
    throw new Error("ledger: invalid cardId");
  }
  const sourceHash = o.sourceHash;
  if (typeof sourceHash !== "string" || !HEX64.test(sourceHash)) {
    throw new Error("ledger: invalid sourceHash");
  }
  const baseOid = o.baseOid;
  if (typeof baseOid !== "string" || !HEX_OID.test(baseOid)) {
    throw new Error("ledger: invalid baseOid");
  }
  const effectKey = o.effectKey;
  if (
    typeof effectKey !== "string" ||
    effectKey.length < 1 ||
    effectKey.length > FIELD_MAX.effectKey ||
    !SAFE_IDENTIFIER.test(effectKey)
  ) {
    throw new Error("ledger: invalid effectKey");
  }
  if (typeof o.status !== "string" || !ALL_STATUSES.has(o.status as LedgerStatus)) {
    throw new Error("ledger: invalid status");
  }
  const timestamp = o.timestamp;
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error("ledger: invalid timestamp");
  }
  if (o.slug !== undefined) {
    const v = o.slug;
    if (
      typeof v !== "string" ||
      v.length < 1 ||
      v.length > FIELD_MAX.slug ||
      !SLUG.test(v)
    ) {
      throw new Error("ledger: invalid slug");
    }
  }
  if (o.candidateOid !== undefined) {
    const v = o.candidateOid;
    if (typeof v !== "string" || !HEX_OID.test(v)) {
      throw new Error("ledger: invalid candidateOid");
    }
  }
  if (o.commitOid !== undefined) {
    const v = o.commitOid;
    if (typeof v !== "string" || !HEX_OID.test(v)) {
      throw new Error("ledger: invalid commitOid");
    }
  }
  if (o.verificationReceiptHash !== undefined) {
    const v = o.verificationReceiptHash;
    if (typeof v !== "string" || !HEX64.test(v)) {
      throw new Error("ledger: invalid verificationReceiptHash");
    }
  }
  if (o.remoteOid !== undefined) {
    const v = o.remoteOid;
    if (typeof v !== "string" || !HEX_OID.test(v)) {
      throw new Error("ledger: invalid remoteOid");
    }
  }
  if (o.requestId !== undefined) {
    const v = o.requestId;
    if (
      typeof v !== "string" ||
      v.length < 1 ||
      v.length > FIELD_MAX.requestId ||
      !SAFE_IDENTIFIER.test(v)
    ) {
      throw new Error("ledger: invalid requestId");
    }
  }
  if (o.pullRequestId !== undefined) {
    const v = o.pullRequestId;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) {
      throw new Error("ledger: invalid pullRequestId");
    }
  }
}

/** Reject any input key outside the allowlist, then validate each field. */
function validateInput(input: unknown): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ledger: input must be an object");
  }
  const o = input as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (!INPUT_KEYS.has(k)) {
      throw new Error(`ledger: unknown input key: ${k}`);
    }
  }
  validateInputFields(o);
}

/** Deterministic JSON: sorted keys, no whitespace. */
function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("ledger: non-finite number in canonical json");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
  }
  throw new Error("ledger: unsupported value type in canonical json");
}

/** Canonical bytes of the input fields only (excludes schema/sequence). */
function inputCanonicalOf(obj: Record<string, unknown>): string {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (k !== "schema" && k !== "sequence") {
      o[k] = obj[k];
    }
  }
  return canonicalJson(o);
}

function buildFrame(record: LedgerRecord): Buffer {
  const payload = Buffer.from(canonicalJson(record), "utf8");
  const hash = createHash("sha256").update(payload).digest("hex");
  const lenStr = String(payload.length).padStart(10, "0");
  const header = `${HEADER_MAGIC}:${lenStr}:${hash}\n`;
  const headerBuf = Buffer.from(header, "ascii");
  return Buffer.concat([headerBuf, payload, Buffer.from([DELIMITER])]);
}

function parseHeader(
  buf: Buffer,
  offset: number,
): { payloadLen: number; sha: string } | null {
  const header = buf.subarray(offset, offset + HEADER_LEN).toString("ascii");
  if (header[0] !== "A" || header[1] !== "W" || header[2] !== "L" || header[3] !== "1") {
    return null;
  }
  if (header[4] !== ":") return null;
  if (header[15] !== ":") return null;
  if (header[80] !== "\n") return null;
  const lenStr = header.substring(5, 15);
  if (!/^\d{10}$/.test(lenStr)) return null;
  const sha = header.substring(16, 80);
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  return { payloadLen: Number(lenStr), sha };
}



/**
 * Read-only transition check (no mutation). Enforces: first event of a run is
 * `reserved`; reservation exclusivity on (repositoryId+cardId+sourceHash);
 * stable per-run identity (repo/card/source/base); blocked/aborted may
 * terminate any nonterminal run; forward transitions advance by exactly one
 * step; no post-terminal event.
 */
function checkTransition(input: LedgerInput, state: LedgerState): void {
  const run = state.runs.get(input.runId);
  if (run === undefined) {
    if (input.status !== "reserved") {
      throw new Error(`ledger: first event for run ${input.runId} must be reserved`);
    }
    const rkey = reservationKey(input.repositoryId, input.cardId, input.sourceHash);
    if (state.reservations.has(rkey)) {
      throw new Error("ledger: identity already reserved");
    }
    return;
  }
  if (
    run.repositoryId !== input.repositoryId ||
    run.cardId !== input.cardId ||
    run.sourceHash !== input.sourceHash ||
    run.baseOid !== input.baseOid
  ) {
    throw new Error(`ledger: identity drift for run ${input.runId}`);
  }
  if (input.status === "blocked" || input.status === "aborted") {
    if (TERMINAL.has(run.status)) {
      throw new Error(`ledger: post-terminal event for run ${input.runId}`);
    }
    return;
  }
  const priorIdx = STATUS_ORDER.indexOf(run.status as ForwardStatus);
  const newIdx = STATUS_ORDER.indexOf(input.status as ForwardStatus);
  if (priorIdx === -1) {
    throw new Error(`ledger: run ${input.runId} is terminal (${run.status})`);
  }
  if (newIdx === -1) {
    throw new Error(`ledger: invalid status ${input.status}`);
  }
  if (newIdx !== priorIdx + 1) {
    throw new Error(
      `ledger: illegal transition ${run.status} -> ${input.status} for run ${input.runId}`,
    );
  }
}

/** Commit a validated transition: stamp effectKey immutability + run state. */
function commitTransition(
  input: LedgerInput,
  record: LedgerRecord,
  state: LedgerState,
): void {
  state.effectKeys.set(record.effectKey, {
    record,
    inputCanonical: inputCanonicalOf(input as Record<string, unknown>),
  });
  const run = state.runs.get(input.runId);
  if (run === undefined) {
    const rkey = reservationKey(input.repositoryId, input.cardId, input.sourceHash);
    state.reservations.set(rkey, input.runId);
    state.runs.set(input.runId, {
      repositoryId: input.repositoryId,
      cardId: input.cardId,
      sourceHash: input.sourceHash,
      baseOid: input.baseOid,
      status: "reserved",
    });
  } else {
    run.status = input.status;
  }
}

/** Replay-time reducer step: effectKey uniqueness (corruption guard) + transition. */
function reducerStep(record: LedgerRecord, state: LedgerState): void {
  if (state.effectKeys.has(record.effectKey)) {
    throw new Error(`ledger: duplicate effectKey in evidence: ${record.effectKey}`);
  }
  checkTransition(record, state);
  commitTransition(record, record, state);
}

/** Validate a parsed frame as a ledger record and advance the reducer. */
function validateRecord(json: unknown, state: LedgerState): LedgerRecord {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("ledger: record must be an object");
  }
  const o = json as Record<string, unknown>;
  if (o.schema !== SCHEMA) {
    throw new Error("ledger: bad schema");
  }
  if (typeof o.sequence !== "number" || !Number.isSafeInteger(o.sequence) || o.sequence < 1) {
    throw new Error("ledger: bad sequence");
  }
  if (o.sequence !== state.nextSequence) {
    throw new Error(`ledger: sequence mismatch: expected ${state.nextSequence}, got ${o.sequence}`);
  }
  for (const k of Object.keys(o)) {
    if (k !== "schema" && k !== "sequence" && !INPUT_KEYS.has(k)) {
      throw new Error(`ledger: unknown record key: ${k}`);
    }
  }
  validateInputFields(o);
  const record = o as unknown as LedgerRecord;
  reducerStep(record, state);
  state.nextSequence = (o.sequence as number) + 1;
  return record;
}

/**
 * Parse a segment's bytes into records beginning at offset 0. `allowTorn`
 * governs only whether an incomplete header/payload/delimiter at the tail
 * yields torn evidence or blocks; a complete-but-bad frame (corrupt header,
 * oversized declared frame, bad delimiter, checksum mismatch, invalid JSON,
 * non-canonical payload, or semantic failure) always throws.
 * `opts.maxRecordBytes` bounds the declared complete frame size before
 * payload processing.
 */
function parseSegmentBytes(
  buf: Buffer,
  allowTorn: boolean,
  segmentName: string,
  state: LedgerState,
  opts: ResolvedLedgerOptions,
): { records: LedgerRecord[]; tornTail: TornTailEvidence | null } {
  const records: LedgerRecord[] = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + HEADER_LEN > buf.length) {
      if (!allowTorn) {
        throw new Error(
          `ledger: torn frame in earlier segment ${segmentName} at offset ${offset}`,
        );
      }
      return {
        records,
        tornTail: {
          segment: segmentName,
          offset,
          available: buf.length - offset,
          reason: "short header",
        },
      };
    }
    const header = parseHeader(buf, offset);
    if (header === null) {
      throw new Error(`ledger: corrupt header in ${segmentName} at offset ${offset}`);
    }
    // Declared complete frame size = header + payload + delimiter. Bound it
    // before touching the payload; an oversized declaration is corruption.
    const declaredFrame = HEADER_LEN + header.payloadLen + 1;
    if (declaredFrame > opts.maxRecordBytes) {
      throw new Error(
        `ledger: declared frame ${declaredFrame} exceeds maxRecordBytes ${opts.maxRecordBytes} in ${segmentName} at offset ${offset}`,
      );
    }
    const payloadStart = offset + HEADER_LEN;
    const payloadEnd = payloadStart + header.payloadLen;
    const delimEnd = payloadEnd + 1;
    if (delimEnd > buf.length) {
      if (!allowTorn) {
        throw new Error(
          `ledger: torn frame in earlier segment ${segmentName} at offset ${offset}`,
        );
      }
      return {
        records,
        tornTail: {
          segment: segmentName,
          offset,
          available: buf.length - offset,
          reason: payloadEnd > buf.length ? "short payload" : "short delimiter",
        },
      };
    }
    if (buf[payloadEnd] !== DELIMITER) {
      throw new Error(`ledger: bad delimiter in ${segmentName} at offset ${payloadEnd}`);
    }
    const payload = buf.subarray(payloadStart, payloadEnd);
    const computed = createHash("sha256").update(payload).digest("hex");
    if (computed !== header.sha) {
      throw new Error(`ledger: checksum mismatch in ${segmentName} at offset ${offset}`);
    }
    const payloadStr = payload.toString("utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadStr);
    } catch {
      throw new Error(`ledger: invalid JSON in ${segmentName} at offset ${offset}`);
    }
    if (canonicalJson(parsed) !== payloadStr) {
      throw new Error(
        `ledger: non-canonical payload in ${segmentName} at offset ${offset}`,
      );
    }
    const record = validateRecord(parsed, state);
    records.push(record);
    offset = delimEnd;
  }
  return { records, tornTail: null };
}

/**
 * List segment and recovery-ack files in order. The ledger root is lstat
 * checked first: a symlink or non-directory root blocks, and ENOENT means an
 * empty ledger. Enforces maxSegments on BOTH segment count and ack count
 * (acks are bounded one per segment), per-file maxSegmentBytes, and total
 * maxLedgerBytes BEFORE reading contents; rejects symlinks and any
 * non-regular file via lstatSync (never follows symlinks); rejects unexpected
 * names and segment numbering gaps. Segment files are non-symlink regular
 * and cap-checked before read. Ack files must be non-symlink regular files
 * of exactly zero bytes, at most one per previous segment (conflicting
 * duplicate filenames block), and must reference an existing segment number.
 */
function listSegments(
  root: string,
  opts: ResolvedLedgerOptions,
): { segments: SegmentFile[]; acks: Map<number, RecoveryAck> } {
  let rootSt: ReturnType<typeof lstatSync>;
  try {
    rootSt = lstatSync(root);
  } catch (err) {
    const e = err as { code?: string };
    if (e && e.code === "ENOENT") return { segments: [], acks: new Map() };
    throw err;
  }
  if (rootSt.isSymbolicLink() || !rootSt.isDirectory()) {
    throw new Error(`ledger: ledger root must be a directory: ${root}`);
  }
  const entries = readdirSync(root);
  const seen: { name: string; number: number; size: number }[] = [];
  const acks = new Map<number, RecoveryAck>();
  for (const name of entries) {
    const segMatch = SEGMENT_NAME.exec(name);
    if (segMatch !== null) {
      // Do not follow symlinks; reject symlinks and any non-regular file.
      const st = lstatSync(join(root, name));
      if (st.isSymbolicLink() || !st.isFile()) {
        throw new Error(`ledger: non-regular file in ledger root: ${name}`);
      }
      if (st.size > opts.maxSegmentBytes) {
        throw new Error(
          `ledger: segment ${name} size ${st.size} exceeds maxSegmentBytes ${opts.maxSegmentBytes}`,
        );
      }
      seen.push({ name, number: Number(segMatch[1]), size: st.size });
      continue;
    }
    const ackMatch = ACK_NAME.exec(name);
    if (ackMatch !== null) {
      const st = lstatSync(join(root, name));
      if (st.isSymbolicLink() || !st.isFile()) {
        throw new Error(`ledger: non-regular file in ledger root: ${name}`);
      }
      if (st.size !== 0) {
        throw new Error(`ledger: recovery ack must be zero bytes: ${name}`);
      }
      const previousSegment = Number(ackMatch[1]);
      const existing = acks.get(previousSegment);
      if (existing !== undefined) {
        throw new Error(
          `ledger: conflicting recovery acks for segment ${previousSegment}: ${name} and ${existing.name}`,
        );
      }
      acks.set(previousSegment, {
        name,
        previousSegment,
        previousBytes: Number(ackMatch[2]),
        previousSha256: ackMatch[3],
      });
      continue;
    }
    throw new Error(`ledger: unexpected file in ledger root: ${name}`);
  }
  seen.sort((a, b) => a.number - b.number);
  if (seen.length > opts.maxSegments) {
    throw new Error(`ledger: maxSegments exceeded (${opts.maxSegments})`);
  }
  if (acks.size > opts.maxSegments) {
    throw new Error(`ledger: maxSegments exceeded by acks (${opts.maxSegments})`);
  }
  let totalSize = 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i].number !== i + 1) {
      throw new Error(
        `ledger: segment numbering gap at position ${i} (found ${seen[i].number})`,
      );
    }
    totalSize += seen[i].size;
    if (totalSize > opts.maxLedgerBytes) {
      throw new Error(`ledger: maxLedgerBytes exceeded (${opts.maxLedgerBytes})`);
    }
  }
  // Every ack must reference an existing segment number.
  for (const [segNum, ack] of acks) {
    if (!seen.some((s) => s.number === segNum)) {
      throw new Error(
        `ledger: recovery ack ${ack.name} references missing segment ${segNum}`,
      );
    }
  }
  const segments: SegmentFile[] = [];
  for (const s of seen) {
    const bytes = readFileSync(join(root, s.name));
    segments.push({ name: s.name, number: s.number, bytes });
  }
  return { segments, acks };
}

function loadLedger(root: string, opts: ResolvedLedgerOptions): {
  segments: SegmentFile[];
  acks: Map<number, RecoveryAck>;
  records: LedgerRecord[];
  state: LedgerState;
  tornTail: TornTailEvidence | null;
  recoveredTornTails: TornTailEvidence[];
  pendingRecoverySegment: number | null;
  totalBytes: number;
} {
  const { segments, acks } = listSegments(root, opts);
  const state: LedgerState = {
    nextSequence: 1,
    effectKeys: new Map(),
    runs: new Map(),
    reservations: new Map(),
  };
  const records: LedgerRecord[] = [];
  let tornTail: TornTailEvidence | null = null;
  const recoveredTornTails: TornTailEvidence[] = [];
  let totalBytes = 0;
  // Parse every segment tolerating a torn tail pending recovery validation.
  const tails: (TornTailEvidence | null)[] = [];
  for (let i = 0; i < segments.length; i++) {
    const isFinal = i === segments.length - 1;
    const result = parseSegmentBytes(
      segments[i].bytes,
      true,
      segments[i].name,
      state,
      opts,
    );
    records.push(...result.records);
    tails.push(result.tornTail);
    totalBytes += segments[i].bytes.length;
    if (isFinal) tornTail = result.tornTail;
  }
  // Validate recovery acks against torn segments. An ack atomically
  // acknowledges segment N only when previousSegment == N and the filename
  // length/hash exactly match all retained segment bytes. An ack without a
  // torn tail, a conflicting ack, a length mismatch, or a sha256 mismatch
  // blocks. A non-final torn segment requires its ack; a final torn segment
  // without an ack remains the unacknowledged torn tail, while a final torn
  // segment with a valid ack is recovered and records pendingRecoverySegment
  // so the next append can create the successor.
  let pendingRecoverySegment: number | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const tail = tails[i];
    const isFinal = i === segments.length - 1;
    const ack = acks.get(seg.number);
    if (ack !== undefined) {
      if (tail === null) {
        throw new Error(
          `ledger: recovery ack ${ack.name} without torn segment ${seg.number}`,
        );
      }
      if (ack.previousBytes !== seg.bytes.length) {
        throw new Error(
          `ledger: recovery ack ${ack.name} length ${ack.previousBytes} != ${seg.bytes.length}`,
        );
      }
      const segSha = createHash("sha256").update(seg.bytes).digest("hex");
      if (ack.previousSha256 !== segSha) {
        throw new Error(
          `ledger: recovery ack ${ack.name} sha256 mismatch for segment ${seg.number}`,
        );
      }
      // Valid ack: recover the torn tail.
      recoveredTornTails.push(tail);
      if (isFinal) {
        tornTail = null;
        pendingRecoverySegment = seg.number;
      }
    } else if (tail !== null && !isFinal) {
      throw new Error(
        `ledger: torn tail in ${seg.name} without recovery acknowledgement`,
      );
    }
  }
  // The final segment's torn tail, if unacknowledged, has no next segment to
  // acknowledge it; it remains the sole unacknowledged torn tail.
  return {
    segments,
    acks,
    records,
    state,
    tornTail,
    recoveredTornTails,
    pendingRecoverySegment,
    totalBytes,
  };
}

function fsyncDir(dir: string): void {
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Append `bytes` to a segment file with strict fail-closed writes. The ledger
 * root is validated/created without following a symlink and, when newly
 * created, its parent directory is fsynced. A new segment is opened with
 * O_WRONLY|O_APPEND|O_CREAT|O_EXCL|O_NOFOLLOW (mode 0600); an existing segment
 * with O_WRONLY|O_APPEND|O_NOFOLLOW. The fd is fstat-checked to be a regular
 * file, every byte is written via a writeSync loop that rejects zero progress,
 * the file is fsynced, and (for a new segment) the root is fsynced after
 * creation. Never truncates, overwrites, renames, or deletes.
 */
function writeFrame(root: string, name: string, bytes: Buffer, isNew: boolean): void {
  let rootExisted = false;
  let rootIsSymlink = false;
  try {
    const st = lstatSync(root);
    if (st.isSymbolicLink()) rootIsSymlink = true;
    rootExisted = true;
  } catch (err) {
    const e = err as { code?: string };
    if (!e || e.code !== "ENOENT") throw err;
  }
  if (rootIsSymlink) {
    throw new Error(`ledger: ledger root must not be a symlink: ${root}`);
  }
  if (!rootExisted) {
    mkdirSync(root, { recursive: true });
    fsyncDir(dirname(root));
  }
  const file = join(root, name);
  const flags = isNew
    ? constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
    : constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW;
  const fd = openSync(file, flags, 0o600);
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      throw new Error(`ledger: non-regular segment file: ${name}`);
    }
    let written = 0;
    while (written < bytes.length) {
      const n = writeSync(fd, bytes, written, bytes.length - written);
      if (n <= 0) {
        throw new Error(`ledger: zero-progress write to ${name} at offset ${written}`);
      }
      written += n;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (isNew) fsyncDir(root);
}

/**
 * Atomic acknowledgement filename for a torn `previous` segment:
 * `recovery-NNNNNN-LLLLLLLLLL-<sha256(previous.bytes)>.ack`, where NNNNNN is
 * the 6-digit segment number, LLLLLLLLLL is the 10-digit retained byte length,
 * and the hash covers all retained segment bytes (including any torn tail).
 * The filename alone is the acknowledgement; the file is empty.
 */
function recoveryAckName(previous: SegmentFile): string {
  const hash = createHash("sha256").update(previous.bytes).digest("hex");
  return `recovery-${String(previous.number).padStart(6, "0")}-${String(previous.bytes.length).padStart(10, "0")}-${hash}.ack`;
}

/**
 * Durably create an empty atomic recovery acknowledgement for `previous`
 * before any successor segment write. The file is created exclusively
 * (O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW, mode 0600), fstat-checked regular,
 * fsynced, closed, then the ledger root directory is fsynced. Never
 * truncates, overwrites, renames, or deletes. Returns the ack filename. On
 * any failure the caller is poisoned and must reopen so replay reconciles.
 */
function createRecoveryAck(root: string, previous: SegmentFile): string {
  const name = recoveryAckName(previous);
  const file = join(root, name);
  const fd = openSync(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      throw new Error(`ledger: non-regular recovery ack: ${name}`);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDir(root);
  return name;
}

function segmentNameFor(n: number): string {
  return `segment-${String(n).padStart(6, "0")}.log`;
}

interface ResolvedLedgerOptions {
  maxRecordBytes: number;
  maxSegmentBytes: number;
  maxLedgerBytes: number;
  maxSegments: number;
}

function resolveOptions(options?: LedgerOptions): ResolvedLedgerOptions {
  const o = options ?? {};
  const caps = {
    maxRecordBytes: o.maxRecordBytes ?? DEFAULTS.maxRecordBytes,
    maxSegmentBytes: o.maxSegmentBytes ?? DEFAULTS.maxSegmentBytes,
    maxLedgerBytes: o.maxLedgerBytes ?? DEFAULTS.maxLedgerBytes,
    maxSegments: o.maxSegments ?? DEFAULTS.maxSegments,
  };
  for (const [k, v] of Object.entries(caps)) {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) {
      throw new Error(`ledger: invalid option ${k}: ${String(v)}`);
    }
  }
  if (caps.maxSegments > 999999) {
    throw new Error("ledger: maxSegments exceeds 6-digit segment name space");
  }
  return caps;
}

/**
 * Open (or create) a ledger at `root`, replaying existing evidence into
 * in-memory reducer state. `append` validates, dedups, transitions, checks
 * caps, fsyncs, and commits. `replay` re-reads disk fresh.
 */
export function openLedger(root: string, options?: LedgerOptions): Ledger {
  const opts = resolveOptions(options);
  const loaded = loadLedger(root, opts);
  const state = loaded.state;
  let currentSegment: SegmentFile | null =
    loaded.segments.length > 0 ? loaded.segments[loaded.segments.length - 1] : null;
  let currentSegmentBytes = currentSegment ? currentSegment.bytes.length : 0;
  let finalSegmentTorn = loaded.tornTail !== null;
  let pendingRecoverySegment = loaded.pendingRecoverySegment;
  let totalBytes = loaded.totalBytes;
  let segmentCount = loaded.segments.length;
  let lastSegmentNumber =
    loaded.segments.length > 0 ? loaded.segments[loaded.segments.length - 1].number : 0;
  let poisoned = false;

  function append(input: LedgerInput): LedgerAppendResult {
    if (poisoned) {
      throw new Error("ledger: ledger is poisoned; reopen before further append");
    }
    validateInput(input);
    const inputCanon = inputCanonicalOf(input as Record<string, unknown>);
    const existing = state.effectKeys.get(input.effectKey);
    if (existing !== undefined) {
      if (existing.inputCanonical === inputCanon) {
        return { kind: "duplicate", record: existing.record };
      }
      throw new Error(`ledger: conflicting effectKey: ${input.effectKey}`);
    }
    checkTransition(input, state);
    const record = {
      ...(input as Record<string, unknown>),
      schema: SCHEMA,
      sequence: state.nextSequence,
    } as unknown as LedgerRecord;
    const frame = buildFrame(record);
    if (frame.length > opts.maxRecordBytes) {
      throw new Error(
        `ledger: frame ${frame.length} exceeds maxRecordBytes ${opts.maxRecordBytes}`,
      );
    }
    // Route the frame to a target segment. A new successor segment is started
    // when there is no current segment, when the final segment has an
    // unacknowledged torn tail, when a recovery ack survived for the final
    // segment but its successor is absent, or on an ordinary size rollover;
    // otherwise the frame appends to the current segment. Only the normal
    // frame is written into a new segment; there is no in-band marker. For an
    // unacknowledged torn final segment, an empty atomic ack file (named for
    // the prior segment's number, byte length, and sha256) is durably created
    // BEFORE the successor segment write, so a crash between the ack and the
    // successor still reconciles on reopen.
    let targetName: string;
    let targetIsNew: boolean;
    let needsRecoveryAck: boolean;
    if (currentSegment === null) {
      targetName = segmentNameFor(lastSegmentNumber + 1);
      targetIsNew = true;
      needsRecoveryAck = false;
    } else if (finalSegmentTorn) {
      targetName = segmentNameFor(lastSegmentNumber + 1);
      targetIsNew = true;
      needsRecoveryAck = true;
    } else if (pendingRecoverySegment === currentSegment.number) {
      targetName = segmentNameFor(lastSegmentNumber + 1);
      targetIsNew = true;
      needsRecoveryAck = false;
    } else if (currentSegmentBytes + frame.length > opts.maxSegmentBytes) {
      targetName = segmentNameFor(lastSegmentNumber + 1);
      targetIsNew = true;
      needsRecoveryAck = false;
    } else {
      targetName = currentSegment.name;
      targetIsNew = false;
      needsRecoveryAck = false;
    }
    // Cap-check FIRST, before any durable write (ack or successor segment).
    // The successor frame is the only bytes counted against the segment and
    // ledger byte caps; the ack is empty and its one-per-segment file is
    // bounded by maxSegments.
    if (targetIsNew) {
      if (segmentCount + 1 > opts.maxSegments) {
        throw new Error(`ledger: maxSegments exceeded (${opts.maxSegments})`);
      }
      if (frame.length > opts.maxSegmentBytes) {
        throw new Error(
          `ledger: frame ${frame.length} exceeds maxSegmentBytes ${opts.maxSegmentBytes}`,
        );
      }
    }
    if (totalBytes + frame.length > opts.maxLedgerBytes) {
      throw new Error(`ledger: maxLedgerBytes exceeded (${opts.maxLedgerBytes})`);
    }
    try {
      if (needsRecoveryAck && currentSegment !== null) {
        createRecoveryAck(root, currentSegment);
      }
      writeFrame(root, targetName, frame, targetIsNew);
    } catch (err) {
      poisoned = true;
      throw err;
    }
    // Commit the reducer only after the segment write + fsync succeeds.
    commitTransition(input, record, state);
    state.nextSequence += 1;
    if (targetIsNew) {
      const newNumber = lastSegmentNumber + 1;
      currentSegment = {
        name: targetName,
        number: newNumber,
        bytes: Buffer.from(frame),
      };
      lastSegmentNumber = newNumber;
      segmentCount += 1;
      currentSegmentBytes = frame.length;
      finalSegmentTorn = false;
      pendingRecoverySegment = null;
    } else {
      if (currentSegment !== null) {
        currentSegment.bytes = Buffer.concat([currentSegment.bytes, frame]);
      }
      currentSegmentBytes += frame.length;
    }
    totalBytes += frame.length;
    return { kind: "appended", record };
  }

  function replay(): LedgerReplayResult {
    const r = loadLedger(root, opts);
    return {
      records: r.records,
      tornTail: r.tornTail,
      recoveredTornTails: r.recoveredTornTails,
    };
  }

  return { append, replay };
}