// B3 — Atomic staged writes + in-flight mutation barrier.
//
// Writes route to exact reserved staging files under an inert staging root
// (never the repository, never broad writable dirs). Each declared write
// target is bound to one reservation; undeclared targets and path-prefix
// expansion are rejected. Writes are atomic (temp + fsync + rename + dir
// fsync). The WriterToken is held for the duration of the lane run and released
// only after staged mutations and cancellation barriers settle; commit/discard
// are blocked while it is held. Post-run candidate paths and hashes are
// validated against the reservations before any result is exposed.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/dispatch.test.ts

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, resolve, dirname, isAbsolute, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";

export interface Reservation {
  /** Inert staging root (never the repository). */
  stagingRoot: string;
  /** Exact declared repo-relative path (e.g. "src/foo.ts"). */
  reservedRel: string;
  /** Absolute staging path: stagingRoot/reservedRel. */
  reservedAbs: string;
}

function normalizeRel(p: string): string {
  let r = p.replace(/^\.\//, "");
  if (r === "" || r === ".") throw new Error("undeclared staging target");
  return r;
}

/** Realpath, or lexical canonical if the target does not yet exist. */
function canonicalize(p: string, root: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(root, normalizeRel(p));
  }
}

/**
 * Bind a declared write target to an exact reserved staging file. Rejects
 * undeclared targets, absolute paths, and path-prefix expansion (`..`).
 */
export function reserveStagingPath(declaredRel: string, stagingRoot: string): Reservation {
  if (isAbsolute(declaredRel)) throw new Error(`absolute staging target rejected: ${declaredRel}`);
  const r = normalizeRel(declaredRel);
  // reject path-prefix expansion: any `..` segment
  if (r.split(sep).some((s) => s === "..")) {
    throw new Error(`staging path escape rejected: ${declaredRel}`);
  }
  const root = realpathSync(stagingRoot);
  const reservedAbs = resolve(root, r);
  const canon = canonicalize(reservedAbs, root);
  if (canon !== root && !canon.startsWith(root + sep)) {
    throw new Error(`staging path escape rejected: ${declaredRel}`);
  }
  return { stagingRoot: root, reservedRel: r, reservedAbs };
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
 * Atomically write `content` to the reservation's exact path. The write goes to
 * a temp file in the same directory, fsyncs the data, renames over the target,
 * then fsyncs the directory. The model cannot choose an arbitrary path — the
 * reservation is host-bound.
 */
export function stageWrite(reservation: Reservation, content: string | Buffer): string {
  const target = reservation.reservedAbs;
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${randomBytes(8).toString("hex")}`;
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, buf);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
  fsyncDir(dirname(target));
  return target;
}

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

export interface CandidatePath {
  path: string;
  /** Optional expected sha256; if present, the actual hash must match. */
  hash?: string;
}

export interface ValidatedCandidate {
  path: string;
  hash: string;
}

/**
 * Validate post-run candidate paths + hashes against the reservations before
 * the result is exposed. Each candidate must be within the reserved set, must
 * exist, and (if an expected hash was supplied) must match it.
 */
export function validateCandidates(
  candidates: readonly CandidatePath[],
  reservations: readonly Reservation[],
  stagingRoot: string,
): ValidatedCandidate[] {
  const root = realpathSync(stagingRoot);
  const reservedSet = new Set(reservations.map((r) => canonicalize(r.reservedAbs, root)));
  const out: ValidatedCandidate[] = [];
  for (const c of candidates) {
    const abs = canonicalize(resolve(root, c.path), root);
    if (!reservedSet.has(abs)) {
      throw new Error(`candidate outside reservations: ${c.path}`);
    }
    if (!existsSync(abs)) {
      throw new Error(`candidate missing: ${c.path}`);
    }
    const hash = sha256File(abs);
    if (c.hash !== undefined && c.hash !== hash) {
      throw new Error(`candidate hash mismatch: ${c.path}`);
    }
    out.push({ path: c.path, hash });
  }
  return out;
}

/**
 * Writer token: held for the duration of a lane run; released only after
 * staged mutations and cancellation barriers settle. While held, commit/discard
 * are blocked. New writes after release are rejected (cancellation barrier).
 */
export class WriterToken {
  #inFlight = 0;
  #released = false;
  #waiters: Array<() => void> = [];

  beginWrite(): void {
    if (this.#released) throw new Error("writer token released (cancellation barrier)");
    this.#inFlight += 1;
  }

  endWrite(): void {
    if (this.#inFlight > 0) this.#inFlight -= 1;
    if (this.#inFlight === 0) this.#drain();
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  get released(): boolean {
    return this.#released;
  }

  /** Resolve once all in-flight writes have drained (the settlement barrier). */
  settle(): Promise<void> {
    if (this.#inFlight === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  /** Release the token after the controller confirms settlement. */
  release(): void {
    if (this.#released) return;
    this.#released = true;
    if (this.#inFlight === 0) this.#drain();
  }

  #drain(): void {
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const w of waiters) w();
  }
}

function assertSettled(token: WriterToken, action: string): void {
  if (!token.released) {
    throw new Error(`${action} blocked: writer token held`);
  }
}

/**
 * Move the staged file to its real (host) destination. Host-side, post
 * settlement only. Atomic rename + dir fsync.
 */
export function commitStaged(token: WriterToken, reservation: Reservation, destAbs: string): void {
  assertSettled(token, "commit");
  if (!existsSync(reservation.reservedAbs)) {
    throw new Error("commit blocked: nothing staged");
  }
  mkdirSync(dirname(destAbs), { recursive: true });
  renameSync(reservation.reservedAbs, destAbs);
  fsyncDir(dirname(destAbs));
}

/** Discard the staged scratch. Host-side, post settlement only. */
export function discardStaged(token: WriterToken, reservation: Reservation): void {
  assertSettled(token, "discard");
  if (existsSync(reservation.reservedAbs)) {
    unlinkSync(reservation.reservedAbs);
  }
}
