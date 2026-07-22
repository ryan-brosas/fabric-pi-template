// C2 — Extension-side terminal attestation.
//
// The wrapper (A2 executor-wrapper.mjs) fsyncs ITS terminal receipt to
// PI_AWAY_ATTEST_DIR before forwarding the result to Fabric (the
// "wrapper is REQUIRED to fsync before success" invariant). This module is
// the EXTENSION-side gate: it builds the lane run's terminal receipt
// (profile / closure / resource hashes, profile id, limits, outcome) — NEVER
// prompts, source, credentials, or logs — and fsyncs it before the lane
// declares success. It also reads the wrapper's receipt to confirm the wrapper
// settled (sandbox processes drained) before accepting settlement.
//
// The receipt key set is an ALLOWLIST: any key outside it is rejected, so a
// caller cannot smuggle prompts/source/credentials/logs into the durable
// evidence.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/lane-extension.test.ts

import {
  mkdirSync,
  existsSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

/** Outcome of a lane run. Fixed schema; never free text. */
export type LaneOutcome = "completed" | "failed" | "aborted";

/** The wrapper's terminal receipt shape (written by A2 writeAttestation). */
export interface WrapperReceipt {
  lane: string;
  terminationReason?: string;
  forwardedRefs?: string[];
  deniedRefs?: string[];
  fsynced: boolean;
  error?: string;
}

/**
 * The extension's terminal receipt. Only the allowlisted keys below are
 * permitted — no prompts, source, credentials, or logs.
 */
export interface TerminalReceipt {
  schema: "away-extension-receipt/1";
  profileId: string;
  laneId: string;
  manifestHash: string;
  closureHash: string;
  childSourceDigest: string;
  limits: Record<string, number>;
  outcome: LaneOutcome;
  wrapperReceiptPath: string | null;
  wrapperFsynced: boolean;
  timestamp: number;
}

export interface AttestationResult {
  path: string;
  receipt: TerminalReceipt;
}

const ALLOWED_RECEIPT_KEYS = new Set<keyof TerminalReceipt>([
  "schema",
  "profileId",
  "laneId",
  "manifestHash",
  "closureHash",
  "childSourceDigest",
  "limits",
  "outcome",
  "wrapperReceiptPath",
  "wrapperFsynced",
  "timestamp",
]);

/** Reject any receipt key outside the allowlist (defense against smuggling). */
export function assertReceiptSafe(receipt: TerminalReceipt): void {
  for (const k of Object.keys(receipt) as (keyof TerminalReceipt)[]) {
    if (!ALLOWED_RECEIPT_KEYS.has(k)) {
      throw new Error(`attestation: forbidden receipt key: ${k}`);
    }
  }
  if (receipt.schema !== "away-extension-receipt/1") {
    throw new Error(`attestation: unexpected receipt schema: ${receipt.schema}`);
  }
  if (
    receipt.outcome !== "completed" &&
    receipt.outcome !== "failed" &&
    receipt.outcome !== "aborted"
  ) {
    throw new Error(`attestation: invalid outcome: ${receipt.outcome}`);
  }
}

export interface BuildReceiptInput {
  profileId: string;
  laneId: string;
  manifestHash: string;
  closureHash: string;
  childSourceDigest: string;
  limits: Record<string, number>;
  outcome: LaneOutcome;
  wrapperReceiptPath: string | null;
  wrapperFsynced: boolean;
}

/** Construct the terminal receipt (never prompts/source/credentials/logs). */
export function buildTerminalReceipt(inp: BuildReceiptInput): TerminalReceipt {
  const receipt: TerminalReceipt = {
    schema: "away-extension-receipt/1",
    profileId: inp.profileId,
    laneId: inp.laneId,
    manifestHash: inp.manifestHash,
    closureHash: inp.closureHash,
    childSourceDigest: inp.childSourceDigest,
    limits: { ...inp.limits },
    outcome: inp.outcome,
    wrapperReceiptPath: inp.wrapperReceiptPath,
    wrapperFsynced: inp.wrapperFsynced,
    timestamp: Date.now(),
  };
  assertReceiptSafe(receipt);
  return receipt;
}

function fsyncDir(dir: string): void {
  let fd: number;
  try {
    fd = openSync(dir, "r");
  } catch {
    return;
  }
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomically write + fsync the terminal receipt to the attest dir. Filename
 * uses the `extension-receipt-` prefix so it never collides with the wrapper's
 * `attest-` prefix. Returns the path + receipt.
 */
export function writeTerminalAttestation(
  attestDir: string,
  receipt: TerminalReceipt,
): AttestationResult {
  assertReceiptSafe(receipt);
  mkdirSync(attestDir, { recursive: true });
  const file = join(
    attestDir,
    `extension-receipt-${Date.now()}-${randomBytes(4).toString("hex")}.json`,
  );
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(receipt));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  fsyncDir(dirname(file));
  return { path: file, receipt };
}

function isWrapperReceiptName(name: string): boolean {
  // Wrapper writes `attest-<ts>-<rand>.json`; extension writes
  // `extension-receipt-...json`. The latter does NOT start with `attest-`.
  return name.startsWith("attest-") && name.endsWith(".json");
}

/**
 * Read the most recent wrapper receipt for `laneId`. Confirms the wrapper
 * fsynced terminal evidence for THIS lane before settlement. Returns null if
 * no valid wrapper receipt exists (sandbox still active / wrapper did not
 * settle). Never returns prompt/source/credential/log content.
 */
export function readWrapperReceipt(
  attestDir: string,
  laneId: string,
): {
  path: string;
  receipt: WrapperReceipt;
} | null {
  if (!existsSync(attestDir)) return null;
  let latest: { path: string; receipt: WrapperReceipt } | null = null;
  for (const name of readdirSync(attestDir)) {
    if (!isWrapperReceiptName(name)) continue;
    const p = join(attestDir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const r = parsed as WrapperReceipt;
    if (r.fsynced !== true) continue;
    if (r.lane !== laneId) continue;
    // Wrapper filename embeds Date.now() (`attest-<ms>-<rand>.json`); the
    // lexically-greatest name is a stable proxy for the most recent receipt.
    if (!latest || name > (latest.path.split("/").pop() as string)) {
      latest = { path: p, receipt: r };
    }
  }
  return latest;
}

/** List extension receipts (for tests). */
export function listExtensionReceipts(attestDir: string): string[] {
  if (!existsSync(attestDir)) return [];
  return readdirSync(attestDir)
    .filter((n) => n.startsWith("extension-receipt-") && n.endsWith(".json"))
    .map((n) => join(attestDir, n));
}
