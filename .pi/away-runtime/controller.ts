// A2 — Away-loop reservation controller.
//
// Deterministic reservation gate for the away loop. Pure roadmap parsing and
// selection, a ready-packet proof, immutable closure validation, host-derived
// Git facts, an flock-backed repository lease, and an idempotent A1 ledger
// append. No ROADMAP write, no namespace creation, no objective/free prose —
// the controller only records a `reserved` effect and returns the selected
// card (or a deterministic no-work result).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/controller.test.ts

import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, realpathSync, lstatSync } from "node:fs";
import { join, isAbsolute, dirname, resolve } from "node:path";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { openLedger, type LedgerRecord, type LedgerInput } from "./ledger.ts";
import { resolveClosure } from "./closure.ts";
import { loadManifest } from "./bootstrap.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ROADMAP_BYTES = 1 << 20; // 1 MiB
const MAX_CARDS = 256;
const MAX_FIELD_LEN = 32768;
const MAX_TITLE_LEN = 1024;

const MAX_GIT_OUTPUT = 64 * 1024; // 64 KiB bound on git stdout
const MAX_LOCKPATH_LEN = 4096;

const READY_TIMEOUT_MS = 15000;
const EXIT_TIMEOUT_MS = 10000;
const READY_TOKEN = Buffer.from("READY\n", "utf8");
const MAX_HELPER_OUTPUT = 4 * 1024; // 4 KiB bound on helper stdout/stderr

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX_OID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

const ROADMAP_FIELDS = [
  "Outcome",
  "Why now",
  "Acceptance evidence",
  "Dependencies",
  "Candidate slug",
  "Autonomy",
  "Open decisions",
  "Source",
] as const;
const FIELD_SET = new Set<string>(ROADMAP_FIELDS);

const HEADING_RE = /^### (~~)?RM-(\d{3,}) \u2014 (.+?)(~~)?\s*$/;

// Canonical AGENTS marker pair. Exactly one ordered pair must be present; the
// raw bytes between them are hashed and compared against state.md.
const AGENTS_BEGIN = "<!-- pi:init:boilerplate:start -->";
const AGENTS_END = "<!-- pi:init:boilerplate:end -->";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Typed block error. Every failure message carries a gate name. */
export class ControllerBlockError extends Error {
  readonly gate: string;
  constructor(gate: string, detail: string) {
    super(`${gate}: ${detail}`);
    this.name = "ControllerBlockError";
    this.gate = gate;
  }
}

function block(gate: string, detail: string): ControllerBlockError {
  return new ControllerBlockError(gate, detail);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RoadmapCard {
  id: string;
  number: number;
  title: string;
  struck: boolean;
  outcome: string;
  whyNow: string;
  acceptanceEvidence: string;
  dependencies: string;
  candidateSlug: string;
  autonomy: string;
  openDecisions: string;
  source: string;
}

export interface ParsedRoadmap {
  schema: number;
  lastIssuedId: number;
  cards: RoadmapCard[];
}

export interface LedgerReservation {
  repositoryId: string;
  cardId: string;
  sourceHash: string;
}

export interface SelectionContext {
  repositoryId?: string;
  namespaceRoot?: string;
  exists?: (path: string) => boolean;
  ledgerReservations?: LedgerReservation[];
}

export interface PacketEvidence {
  files: string[];
  statePath: string;
  agentsPath: string;
  memoryPath: string;
  schema: number;
  ready: boolean;
  reload: boolean;
  agentsHashComputed: string;
  agentsHashStored: string;
  agentsHashOk: boolean;
}

export interface GitFacts {
  baseOid: string;
  repositoryId: string;
  commonDir: string;
}

export interface ControllerDependencies {
  readFile: (path: string) => Buffer;
  exists: (path: string) => boolean;
  gitFacts: (repoRoot: string) => GitFacts;
  closureFacts: (manifestPath: string) => Record<string, string>;
  withLease: <T>(lockPath: string, fn: () => Promise<T> | T) => Promise<T>;
}

export interface ReserveNextOptions {
  repoRoot: string;
  ledgerRoot: string;
  manifestPath: string;
  runId: string;
  timestamp: number;
}

export type ReserveResult =
  | {
      kind: "reserved";
      card: RoadmapCard;
      record: LedgerRecord;
      roadmapHash: string;
      closureHashes: Record<string, string>;
    }
  | {
      kind: "no-work";
      reason: string;
      roadmapHash: string;
      closureHashes: Record<string, string>;
    };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function realPath(p: string, gate: string): string {
  try {
    return realpathSync(p);
  } catch {
    throw block(gate, `realpath failed: ${p}`);
  }
}

function stripTrailingSep(p: string): string {
  return p.replace(/[\\/]+$/, "") || p;
}

function sameClosure(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function samePacket(a: PacketEvidence, b: PacketEvidence): boolean {
  return (
    a.schema === b.schema &&
    a.ready === b.ready &&
    a.reload === b.reload &&
    a.agentsHashStored === b.agentsHashStored &&
    a.agentsHashComputed === b.agentsHashComputed
  );
}

// ---------------------------------------------------------------------------
// Roadmap parsing
// ---------------------------------------------------------------------------

function splitFrontmatter(
  text: string,
  gate = "roadmap",
): { frontmatter: string; body: string } {
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0] !== "---") {
    throw block(gate, "missing frontmatter opening ---");
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) throw block(gate, "missing frontmatter closing ---");
  return {
    frontmatter: lines.slice(1, closeIdx).join("\n"),
    body: lines.slice(closeIdx + 1).join("\n"),
  };
}

function parseFrontmatter(fm: string): { schema: number; lastIssuedId: number } {
  const allowed = new Set<string>(["roadmap_schema_version", "last_issued_id"]);
  const lines = fm.split("\n");
  const obj: Record<string, string> = {};
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) throw block("roadmap", `malformed frontmatter: ${line}`);
    const key = m[1];
    if (!allowed.has(key)) throw block("roadmap", `unknown frontmatter key: ${key}`);
    if (seen.has(key)) throw block("roadmap", `duplicate frontmatter key: ${key}`);
    seen.add(key);
    obj[key] = m[2].trim();
  }
  if (!("roadmap_schema_version" in obj)) {
    throw block("roadmap", "missing roadmap_schema_version in frontmatter");
  }
  const schemaRaw = obj.roadmap_schema_version.replace(/^["']|["']$/g, "");
  if (schemaRaw !== "1") {
    throw block("roadmap", `bad roadmap_schema_version: ${obj.roadmap_schema_version}`);
  }
  if (!("last_issued_id" in obj)) {
    throw block("roadmap", "missing last_issued_id in frontmatter");
  }
  const liiRaw = obj.last_issued_id.replace(/^["']|["']$/g, "");
  const liiMatch = liiRaw.match(/^RM-(\d+)$/);
  if (!liiMatch) throw block("roadmap", `bad last_issued_id: ${obj.last_issued_id}`);
  const n = Number(liiMatch[1]);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw block("roadmap", `bad last_issued_id: ${obj.last_issued_id}`);
  }
  return { schema: 1, lastIssuedId: n };
}

interface CardInProgress {
  id: string;
  number: number;
  title: string;
  struck: boolean;
  fields: Record<string, string>;
}

function parseReadyCards(body: string, lastIssuedId: number): RoadmapCard[] {
  const lines = body.split("\n");
  const cards: RoadmapCard[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  let inReady = false;
  let cur: CardInProgress | null = null;
  let curField: string | null = null;

  const finalize = (): void => {
    if (cur === null) return;
    const c = cur;
    for (const f of ROADMAP_FIELDS) {
      if (!(f in c.fields)) throw block("roadmap", `card ${c.id} missing field: ${f}`);
      if (c.fields[f].trim() === "") throw block("roadmap", `card ${c.id} empty field: ${f}`);
    }
    if (c.title.length > MAX_TITLE_LEN) {
      throw block("roadmap", `card ${c.id} title too long`);
    }
    for (const f of ROADMAP_FIELDS) {
      if (c.fields[f].length > MAX_FIELD_LEN) {
        throw block("roadmap", `card ${c.id} field too long: ${f}`);
      }
    }
    const rawSlug = c.fields["Candidate slug"];
    let slug = rawSlug;
    if (rawSlug.includes("`")) {
      if (!(rawSlug.startsWith("`") && rawSlug.endsWith("`") && rawSlug.length >= 2)) {
        throw block("roadmap", `card ${c.id} unmatched backtick in slug: ${rawSlug}`);
      }
      slug = rawSlug.slice(1, -1);
      if (slug.includes("`")) {
        throw block("roadmap", `card ${c.id} embedded backtick in slug: ${rawSlug}`);
      }
    }
    if (!SLUG.test(slug)) throw block("roadmap", `card ${c.id} invalid slug: ${slug}`);
    if (seenIds.has(c.id)) throw block("roadmap", `duplicate card id: ${c.id}`);
    seenIds.add(c.id);
    if (seenSlugs.has(slug)) throw block("roadmap", `duplicate slug: ${slug}`);
    seenSlugs.add(slug);
    cards.push({
      id: c.id,
      number: c.number,
      title: c.title,
      struck: c.struck,
      outcome: c.fields["Outcome"],
      whyNow: c.fields["Why now"],
      acceptanceEvidence: c.fields["Acceptance evidence"],
      dependencies: c.fields["Dependencies"],
      candidateSlug: slug,
      autonomy: c.fields["Autonomy"],
      openDecisions: c.fields["Open decisions"],
      source: c.fields["Source"],
    });
    cur = null;
    curField = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) {
      finalize();
      inReady = /^## Ready\s*$/.test(line);
      continue;
    }
    if (!inReady) continue;
    if (/^### (~~)?RM-/.test(line)) {
      finalize();
      const hm = line.match(HEADING_RE);
      if (!hm) throw block("roadmap", `malformed card heading: ${line}`);
      const openT = hm[1] === "~~";
      const closeT = hm[4] === "~~";
      if (openT !== closeT) {
        throw block("roadmap", `unbalanced strikethrough: ${line}`);
      }
      const numStr = hm[2];
      const num = parseInt(numStr, 10);
      if (num < 1) throw block("roadmap", `invalid card number: ${numStr}`);
      if (num > lastIssuedId) {
        throw block("roadmap", `card id above last_issued_id: RM-${numStr}`);
      }
      const title = hm[3].trim();
      if (title === "") throw block("roadmap", `empty card title: ${line}`);
      cur = { id: `RM-${numStr}`, number: num, title, struck: openT, fields: {} };
      curField = null;
      continue;
    }
    if (cur !== null) {
      if (line.trim() === "") {
        curField = null;
        continue;
      }
      if (/^[ \t]/.test(line)) {
        if (curField === null) {
          throw block("roadmap", `continuation without field: ${line}`);
        }
        cur.fields[curField] = cur.fields[curField] + "\n" + line.trim();
        continue;
      }
      const fm = line.match(/^- ([A-Za-z][A-Za-z ]*?):\s?(.*)$/);
      if (fm) {
        const fname = fm[1].trim();
        if (!FIELD_SET.has(fname)) throw block("roadmap", `unknown field: ${fname}`);
        if (fname in cur.fields) throw block("roadmap", `duplicate field: ${fname}`);
        cur.fields[fname] = fm[2].trim();
        curField = fname;
        continue;
      }
      throw block("roadmap", `malformed line in card ${cur.id}: ${line}`);
    }
    // Not in a card: ignore non-heading prose between cards under Ready.
  }
  finalize();
  if (cards.length > MAX_CARDS) {
    throw block("roadmap", `too many cards: ${cards.length}`);
  }
  return cards;
}

export function parseRoadmap(raw: string): ParsedRoadmap {
  if (Buffer.byteLength(raw, "utf8") > MAX_ROADMAP_BYTES) {
    throw block("roadmap", `exceeds max size ${MAX_ROADMAP_BYTES}`);
  }
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const { frontmatter, body } = splitFrontmatter(text);
  const fm = parseFrontmatter(frontmatter);
  const cards = parseReadyCards(body, fm.lastIssuedId);
  return { schema: 1, lastIssuedId: fm.lastIssuedId, cards };
}

// ---------------------------------------------------------------------------
// Roadmap selection
// ---------------------------------------------------------------------------

function clauseSatisfied(clause: string): boolean {
  const c = clause.toLowerCase();
  if (
    c.includes("not satisfied") ||
    c.includes("unsatisfied") ||
    c.includes("un-satisfied")
  ) {
    return false;
  }
  return c.includes("satisfied");
}

function dependenciesSatisfied(dep: string): boolean {
  const d = dep.trim();
  if (d.toLowerCase() === "none") return true;
  const clauses: string[] = [];
  for (const line of d.split("\n")) {
    for (const part of line.split(",")) {
      const c = part.trim();
      if (c.length > 0) clauses.push(c);
    }
  }
  if (clauses.length === 0) return false;
  return clauses.every(clauseSatisfied);
}

export function selectAwayRoadmapCard(
  raw: string,
  context: SelectionContext = {},
): RoadmapCard | null {
  const parsed = parseRoadmap(raw);
  const sourceHash = sha256Hex(raw);
  const cards = [...parsed.cards].sort((a, b) => a.number - b.number);
  for (const card of cards) {
    if (card.struck) continue;
    if (card.autonomy.trim() !== "away-ok") continue;
    if (card.openDecisions.trim().toLowerCase() !== "none") continue;
    if (!dependenciesSatisfied(card.dependencies)) continue;
    if (context.namespaceRoot && context.exists) {
      const nsDir = join(context.namespaceRoot, card.candidateSlug);
      const plan = context.exists(join(nsDir, "PLAN.md"));
      const todo = context.exists(join(nsDir, "TODO.md"));
      if (plan && todo) continue; // established namespace: skip
      if (plan !== todo) {
        // exactly one of PLAN/TODO: partial namespace blocks
        throw block("roadmap", `partial namespace for slug ${card.candidateSlug}`);
      }
    }
    if (context.repositoryId && context.ledgerReservations) {
      let exactMatch = false;
      for (const r of context.ledgerReservations) {
        if (r.repositoryId !== context.repositoryId || r.cardId !== card.id) {
          continue;
        }
        if (r.sourceHash === sourceHash) {
          exactMatch = true;
        } else {
          throw block(
            "roadmap",
            `source drift against existing reservation for card ${card.id}`,
          );
        }
      }
      if (exactMatch) continue;
    }
    return card;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ready packet
// ---------------------------------------------------------------------------

export function validateReadyPacket(
  repoRoot: string,
  io?: Pick<ControllerDependencies, "readFile" | "exists">,
): PacketEvidence {
  const exists = io?.exists ?? ((p: string) => existsSync(p));
  const readFile = io?.readFile ?? ((p: string) => readFileSync(p));

  const agentsPath = join(repoRoot, "AGENTS.md");
  const techStackPath = join(repoRoot, ".pi", "tech-stack.md");
  const roadmapPath = join(repoRoot, ".pi", "ROADMAP.md");
  const statePath = join(repoRoot, ".pi", "state.md");
  const userPath = join(repoRoot, ".pi", "user.md");
  const memoryPath = join(repoRoot, ".pi", "memory.md");
  const files = [
    agentsPath,
    techStackPath,
    roadmapPath,
    statePath,
    userPath,
    memoryPath,
  ];

  for (const f of files) {
    if (!exists(f)) throw block("packet", `missing file: ${f}`);
  }

  // state.md is Markdown with frontmatter (not JSON). Memory contents are
  // never read — only existence-checked above.
  const stateRaw = readFile(statePath);
  const stateText = stateRaw
    .toString("utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const { frontmatter: stateFm } = splitFrontmatter(stateText, "packet");
  const stateObj: Record<string, string> = {};
  for (const line of stateFm.split("\n")) {
    if (line.trim() === "") continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) throw block("packet", `malformed state frontmatter: ${line}`);
    stateObj[m[1]] = m[2].trim();
  }
  if (stateObj.schema_version !== "1") {
    throw block("packet", "bad state schema_version");
  }
  if (stateObj.initialization_status !== "ready") {
    throw block("packet", "not ready");
  }
  if (stateObj.context_reload_required !== "false") {
    throw block("packet", "context_reload_required not false");
  }
  const agentsHashStored = stateObj.agents_boilerplate_sha256;
  if (typeof agentsHashStored !== "string" || !HEX64.test(agentsHashStored)) {
    throw block("packet", "bad agents_boilerplate_sha256");
  }

  // Hash AGENTS raw bytes strictly between exactly one canonical marker pair.
  const agentsRaw = readFile(agentsPath);
  const beginBuf = Buffer.from(AGENTS_BEGIN, "utf8");
  const endBuf = Buffer.from(AGENTS_END, "utf8");
  const beginIdx = agentsRaw.indexOf(beginBuf);
  if (beginIdx === -1) throw block("packet", "agents begin marker not found");
  if (agentsRaw.indexOf(beginBuf, beginIdx + 1) !== -1) {
    throw block("packet", "agents begin marker not unique");
  }
  const endIdx = agentsRaw.indexOf(endBuf);
  if (endIdx === -1) throw block("packet", "agents end marker not found");
  if (agentsRaw.indexOf(endBuf, endIdx + 1) !== -1) {
    throw block("packet", "agents end marker not unique");
  }
  if (beginIdx + beginBuf.length > endIdx) {
    throw block("packet", "agents markers out of order");
  }
  const between = agentsRaw.subarray(beginIdx + beginBuf.length, endIdx);
  const agentsHashComputed = createHash("sha256").update(between).digest("hex");
  const agentsHashOk = agentsHashComputed === agentsHashStored;
  if (!agentsHashOk) throw block("packet", "agents hash mismatch");

  return {
    files,
    statePath,
    agentsPath,
    memoryPath,
    schema: 1,
    ready: true,
    reload: false,
    agentsHashComputed,
    agentsHashStored,
    agentsHashOk,
  };
}

// ---------------------------------------------------------------------------
// Runtime closures
// ---------------------------------------------------------------------------

export function validateRuntimeClosures(manifestPath: string): Record<string, string> {
  const { manifest } = loadManifest(manifestPath);
  const laneIds = Object.keys(manifest.lanes).sort();
  const hashes: Record<string, string> = {};
  for (const laneId of laneIds) {
    try {
      const closure = resolveClosure(manifestPath, laneId, { requireAll: true });
      hashes[laneId] = closure.hash;
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).replace(
        /^closure:\s*/,
        "",
      );
      throw block("closure", msg);
    }
  }
  return hashes;
}

// ---------------------------------------------------------------------------
// Git facts
// ---------------------------------------------------------------------------

function gitRun(repoRoot: string, args: string[]): string {
  let out: string;
  try {
    out = execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        LANG: process.env.LANG ?? "C.UTF-8",
      },
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e && e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw block("git-facts", `output exceeds ${MAX_GIT_OUTPUT} bytes: git ${args.join(" ")}`);
    }
    throw block("git-facts", `command failed: git ${args.join(" ")}`);
  }
  return out.replace(/[\r\n]+$/, "");
}

export function deriveGitFacts(repoRoot: string): GitFacts {
  const top = gitRun(repoRoot, ["rev-parse", "--show-toplevel"]);
  const repoReal = realPath(repoRoot, "git-facts");
  if (top !== repoReal) {
    throw block("git-facts", `toplevel ${top} != repoRoot ${repoReal}`);
  }
  const branch = gitRun(repoRoot, ["symbolic-ref", "--short", "HEAD"]);
  if (branch !== "main") throw block("git-facts", `branch not main: ${branch}`);
  const head = gitRun(repoRoot, ["rev-parse", "HEAD"]);
  if (!HEX_OID.test(head)) throw block("git-facts", `bad HEAD oid: ${head}`);
  const commonDirRaw = gitRun(repoRoot, ["rev-parse", "--git-common-dir"]);
  let originUrl: string;
  try {
    originUrl = gitRun(repoRoot, ["config", "--get", "remote.origin.url"]);
  } catch (err) {
    if (err instanceof ControllerBlockError) {
      throw block("git-facts", "no remote.origin.url configured");
    }
    throw err;
  }
  if (originUrl.length === 0) throw block("git-facts", "empty remote.origin.url");
  const commonDir = realPath(resolve(repoRoot, commonDirRaw), "git-facts");
  // repositoryId never returns or stores the raw origin except inside this fn.
  const repositoryId = "repo-" + sha256Hex(commonDir + "\u0000" + originUrl);
  return { baseOid: head, repositoryId, commonDir };
}

// ---------------------------------------------------------------------------
// Repository lease (flock + node helper)
// ---------------------------------------------------------------------------

// Fixed helper source: emit "READY\n", then wait on stdin until EOF.
const HELPER_SOURCE =
  'process.stdout.write("READY\\n");' +
  "process.stdin.resume();" +
  'process.stdin.on("end",function(){process.exit(0);});' +
  'process.stdin.on("close",function(){process.exit(0);});';

function acquireLock(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!child.stdout || !child.stderr) {
      reject(block("lease", "stdio not available"));
      return;
    }
    let outBuf = Buffer.alloc(0);
    let errBuf = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (err: ControllerBlockError): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {}
      reject(err);
    };
    timer = setTimeout(() => {
      fail(
        block("lease", `timeout waiting for READY${errBuf ? ": " + errBuf.trim() : ""}`),
      );
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => {
      if (settled) return;
      outBuf = Buffer.concat([outBuf, c]);
      const nl = outBuf.indexOf(0x0a); // first LF
      if (nl !== -1) {
        const firstRecord = outBuf.subarray(0, nl + 1);
        if (firstRecord.equals(READY_TOKEN)) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve();
        } else {
          fail(
            block(
              "lease",
              `helper first record not READY: ${JSON.stringify(firstRecord.toString("utf8"))}`,
            ),
          );
        }
        return;
      }
      // No complete record yet: bound the pre-READY accumulation.
      if (Buffer.byteLength(outBuf) > MAX_HELPER_OUTPUT) {
        fail(block("lease", `helper stdout exceeds ${MAX_HELPER_OUTPUT} bytes before READY`));
      }
    });
    child.stderr.on("data", (c: Buffer) => {
      if (settled) return;
      errBuf += c.toString("utf8");
      if (Buffer.byteLength(errBuf) > MAX_HELPER_OUTPUT) {
        fail(block("lease", `helper stderr exceeds ${MAX_HELPER_OUTPUT} bytes`));
      }
    });
    child.on("exit", (code, signal) => {
      fail(
        block(
          "lease",
          `lock helper exited before READY (code=${code} signal=${signal}${errBuf ? ": " + errBuf.trim() : ""})`,
        ),
      );
    });
    child.on("error", (err) => {
      fail(block("lease", `lock helper error: ${err.message}`));
    });
  });
}

function awaitExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve();
    }, timeoutMs);
    child.on("exit", finish);
    child.on("close", finish);
    child.on("error", finish);
  });
}

export async function withRepositoryLease<T>(
  lockPath: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!isAbsolute(lockPath)) throw block("lease", "lockPath must be absolute");
  if (Buffer.byteLength(lockPath) > MAX_LOCKPATH_LEN) {
    throw block("lease", "lockPath too long");
  }
  // Existing lockPath must be a regular file: never a symlink or
  // non-regular file. lstatSync does not follow links, so a symlink is
  // reported as such. Retain a regular lock file; never delete. flock creates
  // it via O_CREAT when absent.
  try {
    const st = lstatSync(lockPath);
    if (st.isSymbolicLink()) {
      throw block("lease", "lockPath is a symlink");
    }
    if (!st.isFile()) {
      throw block("lease", "lockPath is not a regular file");
    }
  } catch (err) {
    if (err instanceof ControllerBlockError) throw err;
    if ((err as { code?: string }).code !== "ENOENT") {
      throw block("lease", `lockPath lstat failed: ${(err as Error).message}`);
    }
    // ENOENT: absent — flock will create it below.
  }
  const parentDir = dirname(lockPath);
  if (!existsSync(parentDir)) {
    try {
      mkdirSync(parentDir, { recursive: true, mode: 0o700 });
    } catch (err) {
      throw block("lease", `mkdir parent failed: ${(err as Error).message}`);
    }
  }
  const argv = [
    "flock",
    "--exclusive",
    "--nonblock",
    lockPath,
    process.execPath,
    "-e",
    HELPER_SOURCE,
  ];
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LANG: process.env.LANG ?? "C.UTF-8",
  };
  const child = spawn(argv[0], argv.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    env,
    windowsHide: true,
  });
  await acquireLock(child, READY_TIMEOUT_MS);
  try {
    return await fn();
  } finally {
    try {
      child.stdin?.end();
    } catch {}
    await awaitExit(child, EXIT_TIMEOUT_MS);
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DEPS: ControllerDependencies = {
  readFile: (p: string) => readFileSync(p),
  exists: (p: string) => existsSync(p),
  gitFacts: (repoRoot: string) => deriveGitFacts(repoRoot),
  closureFacts: (manifestPath: string) => validateRuntimeClosures(manifestPath),
  withLease: <T>(lockPath: string, fn: () => Promise<T> | T) =>
    withRepositoryLease<T>(lockPath, fn),
};

// ---------------------------------------------------------------------------
// reserveNext
// ---------------------------------------------------------------------------

export async function reserveNext(
  options: ReserveNextOptions,
  deps?: Partial<ControllerDependencies>,
): Promise<ReserveResult> {
  if (!isAbsolute(options.repoRoot)) {
    throw block("reserve", "repoRoot must be absolute");
  }
  if (!isAbsolute(options.ledgerRoot)) {
    throw block("reserve", "ledgerRoot must be absolute");
  }
  if (!isAbsolute(options.manifestPath)) {
    throw block("reserve", "manifestPath must be absolute");
  }
  if (
    typeof options.runId !== "string" ||
    options.runId.length < 1 ||
    options.runId.length > 128 ||
    !SAFE_IDENTIFIER.test(options.runId)
  ) {
    throw block("reserve", "invalid runId");
  }
  if (
    typeof options.timestamp !== "number" ||
    !Number.isSafeInteger(options.timestamp) ||
    options.timestamp < 0
  ) {
    throw block("reserve", "invalid timestamp");
  }

  const d: ControllerDependencies = { ...DEFAULT_DEPS, ...deps };
  const roadmapPath = join(options.repoRoot, ".pi", "ROADMAP.md");

  // Initial derivation (outside the lock) — the baseline for drift detection.
  const packet = validateReadyPacket(options.repoRoot, {
    readFile: d.readFile,
    exists: d.exists,
  });
  const closureHashes = d.closureFacts(options.manifestPath);
  const git = d.gitFacts(options.repoRoot);
  const roadmapBytes = d.readFile(roadmapPath);
  const roadmapRaw = roadmapBytes.toString("utf8");
  const roadmapHash = sha256Hex(roadmapBytes);

  // Lock at a sibling path outside ledgerRoot.
  const lockPath = stripTrailingSep(options.ledgerRoot) + ".lock";

  return await d.withLease(lockPath, async () => {
    const ledger = openLedger(options.ledgerRoot);
    let records: LedgerRecord[];
    try {
      records = ledger.replay().records;
    } catch (err) {
      throw block("reserve", `ledger replay: ${(err as Error).message}`);
    }
    const reservations: LedgerReservation[] = records
      .filter((r) => r.status === "reserved")
      .map((r) => ({
        repositoryId: r.repositoryId,
        cardId: r.cardId,
        sourceHash: r.sourceHash,
      }));

    const namespaceRoot = join(options.repoRoot, ".pi", "artifacts");
    const card = selectAwayRoadmapCard(roadmapRaw, {
      repositoryId: git.repositoryId,
      ledgerReservations: reservations,
      namespaceRoot,
      exists: d.exists,
    });
    if (card === null) {
      // Re-read and confirm the roadmap hash so the no-work evidence is not
      // stale (the initial read was outside the lock).
      const roadmapHashNow = sha256Hex(d.readFile(roadmapPath));
      if (roadmapHashNow !== roadmapHash) {
        throw block("reserve", "source drift before no-work (roadmap hash)");
      }
      return {
        kind: "no-work",
        reason: "no eligible away roadmap card",
        roadmapHash,
        closureHashes,
      };
    }

    // Revalidate immediately before append. Any drift blocks.
    const packet2 = validateReadyPacket(options.repoRoot, {
      readFile: d.readFile,
      exists: d.exists,
    });
    const closureHashes2 = d.closureFacts(options.manifestPath);
    const git2 = d.gitFacts(options.repoRoot);
    const roadmapHash2 = sha256Hex(d.readFile(roadmapPath));
    if (roadmapHash2 !== roadmapHash) {
      throw block("reserve", "source drift (roadmap hash)");
    }
    if (git2.baseOid !== git.baseOid) throw block("reserve", "base drift (baseOid)");
    if (git2.repositoryId !== git.repositoryId) {
      throw block("reserve", "repository drift (repositoryId)");
    }
    if (!sameClosure(closureHashes2, closureHashes)) {
      throw block("reserve", "closure drift");
    }
    if (!samePacket(packet2, packet)) throw block("reserve", "packet drift");

    // Re-run selection with current namespace existence and the same ledger
    // reservation set. Catches partial/established namespace drift between
    // the initial (unlocked) selection and the append. No namespace is
    // created.
    const card2 = selectAwayRoadmapCard(roadmapRaw, {
      repositoryId: git2.repositoryId,
      ledgerReservations: reservations,
      namespaceRoot,
      exists: d.exists,
    });
    if (card2 === null) {
      throw block("reserve", "reselection: no eligible card (namespace drift)");
    }
    if (card2.id !== card.id || card2.candidateSlug !== card.candidateSlug) {
      throw block("reserve", "reselection: card identity drift (id or slug changed)");
    }

    const effectKey = `reserve:${git.repositoryId}:${card.id}:${roadmapHash}`;
    const input: LedgerInput = {
      runId: options.runId,
      repositoryId: git.repositoryId,
      cardId: card.id,
      sourceHash: roadmapHash,
      baseOid: git.baseOid,
      effectKey,
      status: "reserved",
      timestamp: options.timestamp,
      slug: card.candidateSlug,
    };
    let appendResult;
    try {
      appendResult = ledger.append(input);
    } catch (err) {
      throw block("reserve", `ledger append: ${(err as Error).message}`);
    }
    if (appendResult.kind === "duplicate") {
      // Prior matching reservation not caught by selection: no duplicate append.
      return {
        kind: "no-work",
        reason: "card already reserved",
        roadmapHash,
        closureHashes,
      };
    }
    const record = appendResult.record;

    // Confirm roadmap hash after append is still identical.
    const roadmapHashAfter = sha256Hex(d.readFile(roadmapPath));
    if (roadmapHashAfter !== roadmapHash) {
      throw block("reserve", "roadmap drift after append");
    }

    return {
      kind: "reserved",
      card,
      record,
      roadmapHash,
      closureHashes: closureHashes2,
    };
  });
}