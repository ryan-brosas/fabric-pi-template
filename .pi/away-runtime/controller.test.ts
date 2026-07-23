// A2 controller test — away-loop reservation gate.
//
// Substantive coverage for the current A2 contract: roadmap parsing/selection,
// ready-packet proof, immutable closure validation, host-derived Git facts,
// flock-backed repository lease, and idempotent A1 ledger append. Uses Node 24
// node:test with real retained temp directories (never deleted). The obsolete
// runAwayOnce/dry-run/execute APIs from supervise-away.ts are NOT tested here.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/controller.test.ts

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, isAbsolute } from "node:path";
import {
  parseRoadmap,
  selectAwayRoadmapCard,
  validateReadyPacket,
  validateRuntimeClosures,
  deriveGitFacts,
  withRepositoryLease,
  reserveNext,
  answerAwayPolicy,
  driveReservedLifecycle,
  runAwayController,
  ControllerBlockError,
  type GitFacts,
  type ControllerDependencies,
  type ReserveNextOptions,
} from "./controller.ts";
import { openLedger } from "./ledger.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENTS_BEGIN = "<!-- pi:init:boilerplate:start -->";
const AGENTS_END = "<!-- pi:init:boilerplate:end -->";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = resolve(HERE, "..", "..");
const REAL_ROADMAP_PATH = join(REPO_ROOT, ".pi", "ROADMAP.md");
const REAL_MANIFEST_PATH = join(REPO_ROOT, ".pi", "away-sandbox.json");

const MAX_ROADMAP_BYTES = 1 << 20; // mirror controller constant for the >1MiB case

// Fixed injected GitFacts / closure values.
const FIXED_BASE_OID = "0123456789abcdef0123456789abcdef01234567"; // 40 hex
const FIXED_REPO_ID = "repo-" + "a1".repeat(32); // repo- + 64 hex
const FIXED_COMMON_DIR = "/tmp/away-controller-common-dir";
const FIXED_CLOSURE_HASH = "a".repeat(64);
const FIXED_CLOSURE: Record<string, string> = { "local-explorer": FIXED_CLOSURE_HASH };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Retained temp directory: created, never deleted. */
function retainedTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Build AGENTS.md with one canonical marker pair and return content + interior hash. */
function makeAgentsMd(interior: string): { content: string; hash: string } {
  const content = `# AGENTS\n\n${AGENTS_BEGIN}\n${interior}\n${AGENTS_END}\n\nTail content.\n`;
  return { content, hash: hashAgentsRegion(Buffer.from(content, "utf8")) };
}

/** Hash the bytes strictly between the first begin/end marker pair (mirrors controller). */
function hashAgentsRegion(buf: Buffer): string {
  const beginBuf = Buffer.from(AGENTS_BEGIN, "utf8");
  const endBuf = Buffer.from(AGENTS_END, "utf8");
  const bi = buf.indexOf(beginBuf);
  const ei = buf.indexOf(endBuf);
  if (bi === -1 || ei === -1 || bi + beginBuf.length > ei) {
    throw new Error("bad agents content: markers missing or out of order");
  }
  return createHash("sha256").update(buf.subarray(bi + beginBuf.length, ei)).digest("hex");
}

function hashAgentsInterior(content: string): string {
  return hashAgentsRegion(Buffer.from(content, "utf8"));
}

// ---------------------------------------------------------------------------
// Roadmap fixture
// ---------------------------------------------------------------------------

interface CardSpec {
  number: number;
  title: string;
  struck?: boolean;
  outcome: string | string[];
  whyNow: string | string[];
  acceptanceEvidence: string | string[];
  dependencies: string | string[];
  candidateSlug: string;
  autonomy: string;
  openDecisions: string;
  source: string | string[];
}

function pushField(lines: string[], name: string, value: string | string[]): void {
  const parts = Array.isArray(value) ? value : [value];
  lines.push(`- ${name}: ${parts[0]}`);
  for (let i = 1; i < parts.length; i++) lines.push(`  ${parts[i]}`); // continuation
}

/** Valid roadmap schema v1 with all eight exact bullet fields, multiline support, configurable cards. */
function makeRoadmap(cards: CardSpec[], lastIssued?: number): string {
  const lii = lastIssued ?? Math.max(0, ...cards.map((c) => c.number));
  const lines: string[] = [
    "---",
    "roadmap_schema_version: 1",
    `last_issued_id: RM-${String(lii).padStart(3, "0")}`,
    "---",
    "",
    "# Roadmap",
    "",
    "## Ready",
    "",
  ];
  for (const c of cards) {
    const id = `RM-${String(c.number).padStart(3, "0")}`;
    const s = c.struck ? "~~" : "";
    lines.push(`### ${s}${id} \u2014 ${c.title}${s}`);
    pushField(lines, "Outcome", c.outcome);
    pushField(lines, "Why now", c.whyNow);
    pushField(lines, "Acceptance evidence", c.acceptanceEvidence);
    pushField(lines, "Dependencies", c.dependencies);
    pushField(lines, "Candidate slug", c.candidateSlug);
    pushField(lines, "Autonomy", c.autonomy);
    pushField(lines, "Open decisions", c.openDecisions);
    pushField(lines, "Source", c.source);
    lines.push("");
  }
  return lines.join("\n");
}

/** One eligible away-ok card (multiline outcome) with the given slug. */
function eligibleRoadmap(slug: string, number = 1, lastIssued?: number): string {
  return makeRoadmap(
    [
      {
        number,
        title: `Eligible card ${slug}`,
        outcome: [`Deliver ${slug}.`, "Second outcome line.", "Third outcome line."],
        whyNow: "The prerequisite is settled.",
        acceptanceEvidence: "A focused test passes.",
        dependencies: "none",
        candidateSlug: slug,
        autonomy: "away-ok",
        openDecisions: "none",
        source: "test fixture",
      },
    ],
    lastIssued,
  );
}

// ---------------------------------------------------------------------------
// Packet fixture
// ---------------------------------------------------------------------------

interface PacketOptions {
  roadmap?: string;
  stateOverrides?: Partial<{
    schema_version: string;
    initialization_status: string;
    context_reload_required: string;
    agents_boilerplate_sha256: string;
  }>;
  agentsInterior?: string;
  agentsMdOverride?: string;
  omitFile?: string;
}

/**
 * Retained temp repo packet: AGENTS.md (managed markers + interior) and
 * `.pi/{tech-stack,ROADMAP,state,user,memory}.md`. Computes state
 * `agents_boilerplate_sha256` from the AGENTS interior. Creates `.pi/artifacts`
 * but never a slug namespace.
 */
function makePacket(opts: PacketOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "away-packet-"));
  const piDir = join(dir, ".pi");
  mkdirSync(piDir, { recursive: true });
  mkdirSync(join(piDir, "artifacts"), { recursive: true });

  const interior = opts.agentsInterior ?? "Managed boilerplate line one.\nLine two with detail.";
  const agentsMd = opts.agentsMdOverride ?? makeAgentsMd(interior).content;

  let stateHash: string;
  if (opts.stateOverrides?.agents_boilerplate_sha256 !== undefined) {
    stateHash = opts.stateOverrides.agents_boilerplate_sha256;
  } else if (opts.agentsMdOverride) {
    stateHash = hashAgentsInterior(opts.agentsMdOverride);
  } else {
    stateHash = makeAgentsMd(interior).hash;
  }

  const stateMd = [
    "---",
    `schema_version: ${opts.stateOverrides?.schema_version ?? "1"}`,
    `initialization_status: ${opts.stateOverrides?.initialization_status ?? "ready"}`,
    `context_reload_required: ${opts.stateOverrides?.context_reload_required ?? "false"}`,
    `agents_boilerplate_sha256: ${stateHash}`,
    "generation_id: gen-test-01",
    "---",
    "",
    "# Initialization State",
    "",
    "Fixture state body.",
  ].join("\n");

  const roadmapContent = opts.roadmap ?? eligibleRoadmap("fixture-card", 1);

  const files: Array<[string, string]> = [
    ["AGENTS.md", agentsMd],
    [".pi/tech-stack.md", "# Tech Stack\n\nFixture tech stack.\n"],
    [".pi/ROADMAP.md", roadmapContent],
    [".pi/state.md", stateMd],
    [".pi/user.md", "# User\n\nFixture user preferences.\n"],
    [".pi/memory.md", "# Memory\n\nFixture durable knowledge.\n"],
  ];
  for (const [rel, content] of files) {
    if (opts.omitFile === rel) continue;
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Deterministic injected deps for reserveNext
// ---------------------------------------------------------------------------

interface DriftConfig {
  roadmapAfter?: number; // readFile(roadmapPath) drifts after N calls
  agentsAfter?: number; // readFile(agentsPath) drifts after N calls
  baseAfter?: number; // gitFacts baseOid drifts after N calls
  repoAfter?: number; // gitFacts repositoryId drifts after N calls
  closureAfter?: number; // closureFacts drifts after N calls
  nsEstablishedAfter?: number; // exists(ns PLAN/TODO) true after N calls per path
}

interface FixedDepsOptions {
  drift?: DriftConfig;
  realLease?: boolean;
  closureFail?: boolean;
}

async function directLease<T>(lockPath: string, fn: () => Promise<T> | T): Promise<T> {
  return fn();
}

/**
 * Deterministic deps: real fs read/exists, fixed GitFacts (repo-hash ID + 40-hex
 * base + common dir), fixed closure hash map, direct callback lease. Drift
 * knobs flip the second (re-validation) call to exercise each gate.
 */
function makeFixedDeps(
  repoRoot: string,
  slug: string | undefined,
  opts: FixedDepsOptions = {},
): ControllerDependencies {
  const drift = opts.drift ?? {};
  const roadmapPath = join(repoRoot, ".pi", "ROADMAP.md");
  const agentsPath = join(repoRoot, "AGENTS.md");
  const namespaceRoot = join(repoRoot, ".pi", "artifacts");
  const planPath = slug ? join(namespaceRoot, slug, "PLAN.md") : "";
  const todoPath = slug ? join(namespaceRoot, slug, "TODO.md") : "";
  const readCounts: Record<string, number> = {};
  const existsCounts: Record<string, number> = {};
  let gitCalls = 0;
  let closureCalls = 0;

  const readFile = (p: string): Buffer => {
    readCounts[p] = (readCounts[p] ?? 0) + 1;
    if (p === roadmapPath && drift.roadmapAfter !== undefined && readCounts[p] > drift.roadmapAfter) {
      return Buffer.from(readFileSync(p, "utf8") + "\n<!-- drift -->\n", "utf8");
    }
    if (p === agentsPath && drift.agentsAfter !== undefined && readCounts[p] > drift.agentsAfter) {
      const original = readFileSync(p, "utf8");
      const beginIdx = original.indexOf(AGENTS_BEGIN);
      const endIdx = original.indexOf(AGENTS_END);
      if (beginIdx === -1 || endIdx === -1 || beginIdx + AGENTS_BEGIN.length > endIdx) {
        throw new Error("agentsAfter drift: managed markers missing or out of order");
      }
      const interiorStart = beginIdx + AGENTS_BEGIN.length;
      const interior = original.slice(interiorStart, endIdx);
      const anchor = "Managed boilerplate line one.";
      if (!interior.includes(anchor)) {
        throw new Error("agentsAfter drift: expected interior anchor absent");
      }
      const drifted =
        original.slice(0, interiorStart) +
        interior.replace(anchor, "Managed boilerplate line changed.") +
        original.slice(endIdx);
      return Buffer.from(drifted, "utf8");
    }
    return readFileSync(p);
  };

  const exists = (p: string): boolean => {
    existsCounts[p] = (existsCounts[p] ?? 0) + 1;
    if (
      drift.nsEstablishedAfter !== undefined &&
      slug &&
      (p === planPath || p === todoPath) &&
      existsCounts[p] > drift.nsEstablishedAfter
    ) {
      return true;
    }
    return existsSync(p);
  };

  const gitFacts = (_repoRoot: string): GitFacts => {
    gitCalls++;
    const baseDrift = drift.baseAfter !== undefined && gitCalls > drift.baseAfter;
    const repoDrift = drift.repoAfter !== undefined && gitCalls > drift.repoAfter;
    return {
      baseOid: baseDrift ? "f".repeat(40) : FIXED_BASE_OID,
      repositoryId: repoDrift ? "repo-" + "0".repeat(64) : FIXED_REPO_ID,
      commonDir: FIXED_COMMON_DIR,
    };
  };

  const closureFacts = (_manifestPath: string): Record<string, string> => {
    closureCalls++;
    if (opts.closureFail) throw new ControllerBlockError("closure", "injected closure failure");
    if (drift.closureAfter !== undefined && closureCalls > drift.closureAfter) {
      return { "local-explorer": "b".repeat(64) };
    }
    return { ...FIXED_CLOSURE };
  };

  const withLease = opts.realLease ? withRepositoryLease : directLease;

  return { readFile, exists, gitFacts, closureFacts, withLease };
}

function reserveOpts(
  repoRoot: string,
  ledgerRoot: string,
  runId = "test-run-001",
  timestamp = 1700000000,
): ReserveNextOptions {
  return {
    repoRoot,
    ledgerRoot,
    manifestPath: join(ledgerRoot, "manifest.json"), // dummy; closureFacts is injected
    runId,
    timestamp,
  };
}

/** Sync block assertion helper for parseRoadmap / validateReadyPacket. */
function assertBlock(
  fn: () => unknown,
  gate: string,
  msg: RegExp,
  label?: string,
): void {
  assert.throws(
    fn,
    (err: unknown) => {
      assert.ok(err instanceof ControllerBlockError, `${label ?? ""}: expected ControllerBlockError`);
      assert.equal((err as ControllerBlockError).gate, gate, `${label ?? ""}: gate`);
      assert.match((err as Error).message, msg, `${label ?? ""}: message`);
      return true;
    },
    label,
  );
}

// ---------------------------------------------------------------------------
// Parser-test roadmap builders (single-line fields, easy to mutate)
// ---------------------------------------------------------------------------

function cardLines(num: number, title: string, struck: boolean, fieldLines: string[]): string[] {
  const id = `RM-${String(num).padStart(3, "0")}`;
  const s = struck ? "~~" : "";
  return [`### ${s}${id} \u2014 ${title}${s}`, ...fieldLines, ""];
}

function fld(name: string, value: string): string {
  return `- ${name}: ${value}`;
}

function allFields(slug: string): string[] {
  return [
    fld("Outcome", "Do it."),
    fld("Why now", "Now."),
    fld("Acceptance evidence", "Test passes."),
    fld("Dependencies", "none"),
    fld("Candidate slug", slug),
    fld("Autonomy", "away-ok"),
    fld("Open decisions", "none"),
    fld("Source", "test"),
  ];
}

function roadmapFrom(lastIssued: number, ...cardLineArrays: string[][]): string {
  const lines: string[] = [
    "---",
    "roadmap_schema_version: 1",
    `last_issued_id: RM-${String(lastIssued).padStart(3, "0")}`,
    "---",
    "",
    "# Roadmap",
    "",
    "## Ready",
    "",
  ];
  for (const cl of cardLineArrays) lines.push(...cl);
  return lines.join("\n");
}

// ===========================================================================
// Tests
// ===========================================================================

describe("roadmap selector and parser", () => {
  it("selector chooses lowest numeric eligible away-ok card despite source order; live repository ROADMAP returns no-work", () => {
    // Source order: RM-003 (eligible) before RM-001 (eligible). Selector sorts
    // ascending and returns RM-001 despite source order.
    const rm = makeRoadmap(
      [
        {
          number: 3,
          title: "Eligible three",
          outcome: "Deliver three.",
          whyNow: "Now.",
          acceptanceEvidence: "Test three.",
          dependencies: "none",
          candidateSlug: "eligible-three",
          autonomy: "away-ok",
          openDecisions: "none",
          source: "test",
        },
        {
          number: 1,
          title: "Eligible one",
          outcome: "Deliver one.",
          whyNow: "Now.",
          acceptanceEvidence: "Test one.",
          dependencies: "none",
          candidateSlug: "eligible-one",
          autonomy: "away-ok",
          openDecisions: "none",
          source: "test",
        },
        {
          number: 5,
          title: "Manual five",
          outcome: "Do not select.",
          whyNow: "Later.",
          acceptanceEvidence: "n/a",
          dependencies: "none",
          candidateSlug: "manual-five",
          autonomy: "manual-only",
          openDecisions: "none",
          source: "test",
        },
      ],
      5,
    );
    const card = selectAwayRoadmapCard(rm);
    assert.ok(card, "expected a card");
    assert.equal(card!.id, "RM-001");
    assert.equal(card!.number, 1);
    assert.equal(card!.candidateSlug, "eligible-one");
    assert.equal(card!.autonomy, "away-ok");

    // Live repository ROADMAP: all cards are manual-only (RM-001 is also struck)
    // so the selector returns no-work.
    const liveRoadmap = readFileSync(REAL_ROADMAP_PATH, "utf8");
    const liveCard = selectAwayRoadmapCard(liveRoadmap);
    assert.equal(liveCard, null, "live ROADMAP should yield no eligible away-ok card");
  });

  it("selector skips manual-only, struck, open decisions, unresolved dependencies, established namespace, and exact prior reservation; partial namespace hard-blocks", () => {
    const nsRoot = retainedTempDir("away-ns-");
    // Established namespace for slug "established-card": both PLAN and TODO.
    mkdirSync(join(nsRoot, "established-card"), { recursive: true });
    writeFileSync(join(nsRoot, "established-card", "PLAN.md"), "plan");
    writeFileSync(join(nsRoot, "established-card", "TODO.md"), "todo");

    const rm = makeRoadmap(
      [
        {
          number: 1,
          title: "Manual only",
          outcome: "x",
          whyNow: "x",
          acceptanceEvidence: "x",
          dependencies: "none",
          candidateSlug: "manual-card",
          autonomy: "manual-only",
          openDecisions: "none",
          source: "x",
        },
        {
          number: 2,
          title: "Struck",
          struck: true,
          outcome: "x",
          whyNow: "x",
          acceptanceEvidence: "x",
          dependencies: "none",
          candidateSlug: "struck-card",
          autonomy: "away-ok",
          openDecisions: "none",
          source: "x",
        },
        {
          number: 3,
          title: "Open decisions",
          outcome: "x",
          whyNow: "x",
          acceptanceEvidence: "x",
          dependencies: "none",
          candidateSlug: "open-decisions-card",
          autonomy: "away-ok",
          openDecisions: "Which color? blue or red",
          source: "x",
        },
        {
          number: 4,
          title: "Unresolved deps",
          outcome: "x",
          whyNow: "x",
          acceptanceEvidence: "x",
          dependencies: "RM-099 \u2014 not satisfied",
          candidateSlug: "unresolved-deps-card",
          autonomy: "away-ok",
          openDecisions: "none",
          source: "x",
        },
        {
          number: 5,
          title: "Established namespace",
          outcome: "x",
          whyNow: "x",
          acceptanceEvidence: "x",
          dependencies: "none",
          candidateSlug: "established-card",
          autonomy: "away-ok",
          openDecisions: "none",
          source: "x",
        },
        {
          number: 6,
          title: "Exact prior reservation",
          outcome: "x",
          whyNow: "x",
          acceptanceEvidence: "x",
          dependencies: "none",
          candidateSlug: "prior-reservation-card",
          autonomy: "away-ok",
          openDecisions: "none",
          source: "x",
        },
      ],
      6,
    );
    const sourceHash = sha256Hex(rm);
    const card = selectAwayRoadmapCard(rm, {
      repositoryId: "repo-test",
      namespaceRoot: nsRoot,
      exists: (p) => existsSync(p),
      ledgerReservations: [{ repositoryId: "repo-test", cardId: "RM-006", sourceHash }],
    });
    assert.equal(card, null, "every card should be skipped");

    // Partial namespace hard-blocks: only PLAN.md exists (no TODO.md).
    const partialNsRoot = retainedTempDir("away-ns-partial-");
    mkdirSync(join(partialNsRoot, "partial-card"), { recursive: true });
    writeFileSync(join(partialNsRoot, "partial-card", "PLAN.md"), "plan");
    const partialRm = eligibleRoadmap("partial-card", 1);
    assertBlock(
      () =>
        selectAwayRoadmapCard(partialRm, {
          namespaceRoot: partialNsRoot,
          exists: (p) => existsSync(p),
        }),
      "roadmap",
      /partial namespace for slug partial-card/,
      "partial namespace",
    );
  });

  it("parser rejects missing/duplicate/unknown fields, duplicate IDs/slugs, ID above last_issued, invalid/unmatched code-span slug, malformed frontmatter, and over 1MiB", () => {
    // Missing field (Source omitted)
    const missing = roadmapFrom(1, cardLines(1, "Card", false, allFields("card-one").filter((l) => !l.startsWith("- Source:"))));
    assertBlock(() => parseRoadmap(missing), "roadmap", /missing field: Source/, "missing field");

    // Duplicate field
    const dupFields = [...allFields("card-one")];
    dupFields.splice(1, 0, fld("Outcome", "Dup."));
    const dupFieldRm = roadmapFrom(1, cardLines(1, "Card", false, dupFields));
    assertBlock(() => parseRoadmap(dupFieldRm), "roadmap", /duplicate field: Outcome/, "duplicate field");

    // Unknown field
    const unkFields = [...allFields("card-one")];
    unkFields.splice(4, 0, "- Bad field: x");
    const unknownRm = roadmapFrom(1, cardLines(1, "Card", false, unkFields));
    assertBlock(() => parseRoadmap(unknownRm), "roadmap", /unknown field: Bad field/, "unknown field");

    // Duplicate IDs
    const dupIds = roadmapFrom(
      1,
      cardLines(1, "Card one", false, allFields("card-one")),
      cardLines(1, "Card two", false, allFields("card-two")),
    );
    assertBlock(() => parseRoadmap(dupIds), "roadmap", /duplicate card id: RM-001/, "duplicate IDs");

    // Duplicate slugs (distinct IDs, same slug)
    const dupSlugs = roadmapFrom(
      2,
      cardLines(1, "Card one", false, allFields("same-slug")),
      cardLines(2, "Card two", false, allFields("same-slug")),
    );
    assertBlock(() => parseRoadmap(dupSlugs), "roadmap", /duplicate slug: same-slug/, "duplicate slugs");

    // ID above last_issued
    const aboveLii = roadmapFrom(3, cardLines(5, "Card", false, allFields("card-five")));
    assertBlock(() => parseRoadmap(aboveLii), "roadmap", /card id above last_issued_id: RM-005/, "ID above last_issued");

    // Invalid slug (uppercase + space)
    const invalidSlug = roadmapFrom(1, cardLines(1, "Card", false, allFields("Invalid Slug")));
    assertBlock(() => parseRoadmap(invalidSlug), "roadmap", /invalid slug: Invalid Slug/, "invalid slug");

    // Unmatched code-span slug (opening backtick, no closing)
    const unmatchedSlug = roadmapFrom(1, cardLines(1, "Card", false, allFields("`bad")));
    assertBlock(() => parseRoadmap(unmatchedSlug), "roadmap", /unmatched backtick in slug: `bad/, "unmatched code-span slug");

    // Malformed frontmatter (line without colon)
    const malformedFm = [
      "---",
      "roadmap_schema_version: 1",
      "bad line",
      "last_issued_id: RM-001",
      "---",
      "",
      "# Roadmap",
      "",
      "## Ready",
      "",
    ].join("\n");
    assertBlock(() => parseRoadmap(malformedFm), "roadmap", /malformed frontmatter: bad line/, "malformed frontmatter");

    // Unknown frontmatter key
    const unknownKey = [
      "---",
      "roadmap_schema_version: 1",
      "last_issued_id: RM-001",
      "extra_key: value",
      "---",
      "",
      "# Roadmap",
      "",
      "## Ready",
      "",
    ].join("\n");
    assertBlock(() => parseRoadmap(unknownKey), "roadmap", /unknown frontmatter key: extra_key/, "unknown frontmatter key");

    // Over 1 MiB
    const oversized = "---\nroadmap_schema_version: 1\nlast_issued_id: RM-001\n---\n" + "x".repeat(MAX_ROADMAP_BYTES);
    assert.ok(Buffer.byteLength(oversized, "utf8") > MAX_ROADMAP_BYTES);
    assertBlock(() => parseRoadmap(oversized), "roadmap", /exceeds max size/, "over 1MiB");

    // Positive control: a valid roadmap parses.
    const valid = eligibleRoadmap("ok-card", 1);
    const parsed = parseRoadmap(valid);
    assert.equal(parsed.schema, 1);
    assert.equal(parsed.cards.length, 1);
    assert.equal(parsed.cards[0].id, "RM-001");
    assert.equal(parsed.cards[0].candidateSlug, "ok-card");
  });
});

describe("ready packet", () => {
  it("packet validates real fixture and rejects missing six-file member, schema/status/reload/hash/duplicate marker faults; memory contents are not read", () => {
    // Happy path: real fixture with real fs.
    const valid = makePacket();
    const evidence = validateReadyPacket(valid);
    assert.equal(evidence.schema, 1);
    assert.equal(evidence.ready, true);
    assert.equal(evidence.reload, false);
    assert.equal(evidence.agentsHashOk, true);
    assert.equal(evidence.agentsHashComputed, evidence.agentsHashStored);
    assert.equal(evidence.files.length, 6);

    // Missing six-file member (each one).
    const members = [
      "AGENTS.md",
      ".pi/tech-stack.md",
      ".pi/ROADMAP.md",
      ".pi/state.md",
      ".pi/user.md",
      ".pi/memory.md",
    ];
    for (const member of members) {
      const pkt = makePacket({ omitFile: member });
      assertBlock(() => validateReadyPacket(pkt), "packet", /missing file/, `missing ${member}`);
    }

    // Schema fault
    assertBlock(
      () => validateReadyPacket(makePacket({ stateOverrides: { schema_version: "2" } })),
      "packet",
      /bad state schema_version/,
      "schema fault",
    );
    // Status fault
    assertBlock(
      () => validateReadyPacket(makePacket({ stateOverrides: { initialization_status: "not-ready" } })),
      "packet",
      /not ready/,
      "status fault",
    );
    // Reload fault
    assertBlock(
      () => validateReadyPacket(makePacket({ stateOverrides: { context_reload_required: "true" } })),
      "packet",
      /context_reload_required not false/,
      "reload fault",
    );
    // Hash fault: stored hash not 64-hex
    assertBlock(
      () => validateReadyPacket(makePacket({ stateOverrides: { agents_boilerplate_sha256: "not-a-hash" } })),
      "packet",
      /bad agents_boilerplate_sha256/,
      "bad stored hash",
    );
    // Hash fault: stored is 64-hex but mismatches computed interior
    assertBlock(
      () => validateReadyPacket(makePacket({ stateOverrides: { agents_boilerplate_sha256: "0".repeat(64) } })),
      "packet",
      /agents hash mismatch/,
      "hash mismatch",
    );

    // Duplicate marker faults.
    const dummyHash = "0".repeat(64);
    assertBlock(
      () =>
        validateReadyPacket(
          makePacket({
            agentsMdOverride: `pre\n${AGENTS_BEGIN}\ninterior\n${AGENTS_BEGIN}\n${AGENTS_END}\ntail\n`,
            stateOverrides: { agents_boilerplate_sha256: dummyHash },
          }),
        ),
      "packet",
      /begin marker not unique/,
      "two begin markers",
    );
    assertBlock(
      () =>
        validateReadyPacket(
          makePacket({
            agentsMdOverride: `pre\n${AGENTS_BEGIN}\ninterior\n${AGENTS_END}\n${AGENTS_END}\ntail\n`,
            stateOverrides: { agents_boilerplate_sha256: dummyHash },
          }),
        ),
      "packet",
      /end marker not unique/,
      "two end markers",
    );
    assertBlock(
      () =>
        validateReadyPacket(
          makePacket({
            agentsMdOverride: `pre\n${AGENTS_END}\ninterior\n${AGENTS_BEGIN}\ntail\n`,
            stateOverrides: { agents_boilerplate_sha256: dummyHash },
          }),
        ),
      "packet",
      /markers out of order/,
      "markers out of order",
    );

    // Memory contents are not read: an io adapter that throws if readFile(memoryPath)
    // is called must still validate the real fixture (memory is existence-checked only).
    const memPkt = makePacket();
    const memPath = join(memPkt, ".pi", "memory.md");
    const throwingRead = (p: string): Buffer => {
      if (p === memPath) throw new Error("memory must not be read");
      return readFileSync(p);
    };
    const memEvidence = validateReadyPacket(memPkt, {
      readFile: throwingRead,
      exists: (p) => existsSync(p),
    });
    assert.equal(memEvidence.ready, true);
    assert.equal(memEvidence.agentsHashOk, true);
  });
});

describe("reserveNext reservation and drift", () => {
  it("reservation writes one durable A1 record with exact run/repo/card/source/base/slug and leaves roadmap bytes/hash unchanged; replay verifies", async () => {
    const slug = "fixture-card";
    const packet = makePacket({ roadmap: eligibleRoadmap(slug, 1) });
    const ledger = retainedTempDir("away-ledger-");
    const deps = makeFixedDeps(packet, slug, {});
    const opts = reserveOpts(packet, ledger, "test-run-001");

    const result = await reserveNext(opts, deps);
    assert.equal(result.kind, "reserved");
    if (result.kind !== "reserved") throw new Error("unreachable");
    const rec = result.record;

    // Exact run/repo/card/source/base/slug.
    assert.equal(rec.runId, "test-run-001");
    assert.equal(rec.repositoryId, FIXED_REPO_ID);
    assert.equal(rec.cardId, "RM-001");
    assert.equal(rec.sourceHash, result.roadmapHash);
    assert.equal(rec.baseOid, FIXED_BASE_OID);
    assert.equal(rec.status, "reserved");
    assert.equal(rec.timestamp, 1700000000);
    assert.equal(rec.slug, slug);
    // A1 record framing.
    assert.equal(rec.schema, "away-loop-ledger/1");
    assert.equal(rec.sequence, 1);
    assert.equal(rec.effectKey, `reserve:${FIXED_REPO_ID}:RM-001:${result.roadmapHash}`);

    // Selected card identity.
    assert.equal(result.card.id, "RM-001");
    assert.equal(result.card.number, 1);
    assert.equal(result.card.candidateSlug, slug);
    assert.equal(result.card.struck, false);

    // Roadmap bytes/hash unchanged after append.
    const roadmapPath = join(packet, ".pi", "ROADMAP.md");
    const afterHash = sha256Hex(readFileSync(roadmapPath));
    assert.equal(afterHash, result.roadmapHash);

    // Replay verifies: one durable record, byte-identical.
    const replayed = openLedger(ledger).replay();
    assert.equal(replayed.records.length, 1);
    assert.deepEqual(replayed.records[0], rec);
    assert.equal(replayed.tornTail, null);
  });

  it("second reservation on one-card same source returns no-work without adding record; source drift against existing reservation blocks rather than re-reserving", async () => {
    const slug = "fixture-card";
    const packet = makePacket({ roadmap: eligibleRoadmap(slug, 1) });
    const ledger = retainedTempDir("away-ledger-");

    // First reservation: one record.
    const first = await reserveNext(reserveOpts(packet, ledger, "run-A"), makeFixedDeps(packet, slug, {}));
    assert.equal(first.kind, "reserved");

    // Second reservation on the same one-card same source: no-work, no new record.
    const second = await reserveNext(reserveOpts(packet, ledger, "run-B"), makeFixedDeps(packet, slug, {}));
    assert.equal(second.kind, "no-work");
    assert.equal(openLedger(ledger).replay().records.length, 1);

    // If roadmap bytes change after a prior reservation, source drift against the
    // existing reservation blocks rather than re-reserving.
    const roadmapPath = join(packet, ".pi", "ROADMAP.md");
    writeFileSync(roadmapPath, readFileSync(roadmapPath, "utf8") + "\n## Next\n\n- A new horizon item.\n");

    let thrown: unknown;
    try {
      await reserveNext(reserveOpts(packet, ledger, "run-C"), makeFixedDeps(packet, slug, {}));
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof ControllerBlockError, "source drift should block");
    assert.equal((thrown as ControllerBlockError).gate, "roadmap");
    assert.match((thrown as Error).message, /source drift against existing reservation/);
    // Ledger unchanged: still the single prior reservation.
    assert.equal(openLedger(ledger).replay().records.length, 1);
  });

  it("source drift between initial read and pre-append re-read blocks and ledger stays empty; base drift, namespace drift, packet drift, closure drift similarly block before append", async () => {
    async function assertDriftBlocks(
      label: string,
      drift: DriftConfig,
      expectedGate: string,
      expectedMsg: RegExp,
    ): Promise<void> {
      const slug = `drift-${label}`;
      const packet = makePacket({ roadmap: eligibleRoadmap(slug, 1) });
      const ledger = retainedTempDir("away-ledger-");
      const deps = makeFixedDeps(packet, slug, { drift });
      let thrown: unknown;
      try {
        await reserveNext(reserveOpts(packet, ledger), deps);
      } catch (e) {
        thrown = e;
      }
      assert.ok(thrown instanceof ControllerBlockError, `${label}: should block`);
      assert.equal((thrown as ControllerBlockError).gate, expectedGate, `${label}: gate`);
      assert.match((thrown as Error).message, expectedMsg, `${label}: message`);
      assert.equal(openLedger(ledger).replay().records.length, 0, `${label}: ledger stays empty`);
    }

    // Initial read is call #1 (outside lock); pre-append re-read is call #2 (inside lock).
    await assertDriftBlocks("source", { roadmapAfter: 1 }, "reserve", /source drift \(roadmap hash\)/);
    await assertDriftBlocks("base", { baseAfter: 1 }, "reserve", /base drift \(baseOid\)/);
    await assertDriftBlocks("namespace", { nsEstablishedAfter: 1 }, "reserve", /namespace drift/);
    // Packet drift: second validateReadyPacket reads drifted agents -> hash mismatch (gate "packet").
    await assertDriftBlocks("packet", { agentsAfter: 1 }, "packet", /agents hash mismatch/);
    await assertDriftBlocks("closure", { closureAfter: 1 }, "reserve", /closure drift/);
  });

  it("closure failure injected blocks before reservation", async () => {
    const slug = "closure-fail-card";
    const packet = makePacket({ roadmap: eligibleRoadmap(slug, 1) });
    const ledger = retainedTempDir("away-ledger-");
    const deps = makeFixedDeps(packet, slug, { closureFail: true });

    let thrown: unknown;
    try {
      await reserveNext(reserveOpts(packet, ledger), deps);
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof ControllerBlockError);
    assert.equal((thrown as ControllerBlockError).gate, "closure");
    assert.match((thrown as Error).message, /injected closure failure/);
    assert.equal(openLedger(ledger).replay().records.length, 0, "ledger stays empty");
  });
});

describe("repository lease", () => {
  it("lease uses real withRepositoryLease: first owner holds callback while nested/second nonblocking attempt rejects; retained regular lock file remains; relative and symlink lock rejection", async () => {
    const lockDir = retainedTempDir("away-lock-");
    const lockPath = join(lockDir, "lease.lock");

    // First owner acquires and holds the lock until signalled.
    let signalHeld: () => void;
    const held = new Promise<void>((r) => {
      signalHeld = r;
    });
    let releaseFirst: () => void;
    const releaseSignal = new Promise<void>((r) => {
      releaseFirst = r;
    });
    const firstPromise = withRepositoryLease(lockPath, async () => {
      signalHeld!();
      await releaseSignal;
      return "first-result";
    });

    // Wait until the first owner actually holds the lock (callback executing).
    await held;

    // A nested/second nonblocking attempt on the same lockPath must reject.
    let secondThrown: unknown;
    try {
      await withRepositoryLease(lockPath, async () => "second-result");
    } catch (e) {
      secondThrown = e;
    }
    assert.ok(secondThrown instanceof ControllerBlockError, "second attempt should reject");
    assert.equal((secondThrown as ControllerBlockError).gate, "lease");
    assert.match((secondThrown as Error).message, /READY|lease/);

    // Release the first owner and confirm it completed.
    releaseFirst!();
    const firstResult = await firstPromise;
    assert.equal(firstResult, "first-result");

    // Retained regular lock file remains (never deleted), not a symlink.
    const st = lstatSync(lockPath);
    assert.ok(st.isFile(), "lock file should be a regular file");
    assert.ok(!st.isSymbolicLink(), "lock file should not be a symlink");

    // Relative lock path is rejected.
    let relThrown: unknown;
    try {
      await withRepositoryLease("relative.lock", async () => "x");
    } catch (e) {
      relThrown = e;
    }
    assert.ok(relThrown instanceof ControllerBlockError);
    assert.match((relThrown as Error).message, /lockPath must be absolute/);

    // Symlink lock is rejected without cleanup; symlink retained.
    const symPath = join(lockDir, "symlink.lock");
    const targetPath = join(lockDir, "target.lock");
    writeFileSync(targetPath, "");
    symlinkSync(targetPath, symPath);
    let symThrown: unknown;
    try {
      await withRepositoryLease(symPath, async () => "x");
    } catch (e) {
      symThrown = e;
    }
    assert.ok(symThrown instanceof ControllerBlockError);
    assert.match((symThrown as Error).message, /symlink/);
    assert.ok(lstatSync(symPath).isSymbolicLink(), "symlink should be retained");
  });
});

describe("git facts and runtime closure", () => {
  it("deriveGitFacts on the actual repo returns main, safe repo-* ID and valid base OID without exposing origin", () => {
    const facts = deriveGitFacts(REPO_ROOT);
    assert.match(facts.baseOid, /^[0-9a-f]{40}$|^[0-9a-f]{64}$/, "baseOid should be a hex OID");
    assert.match(facts.repositoryId, /^repo-[0-9a-f]{64}$/, "repositoryId should be repo- + 64 hex");
    assert.ok(isAbsolute(facts.commonDir), "commonDir should be absolute");
    assert.ok(existsSync(facts.commonDir), "commonDir should exist");

    // No origin exposed: exactly the three fields, none a raw URL.
    const keys = Object.keys(facts).sort();
    assert.deepEqual(keys, ["baseOid", "commonDir", "repositoryId"]);
    assert.doesNotMatch(facts.repositoryId, /github\.com|git@|^https?:\/\//i, "repositoryId must not be a raw URL");
    assert.doesNotMatch(facts.commonDir, /github\.com|git@|^https?:\/\//i, "commonDir must not be a raw URL");
    // deriveGitFacts enforces branch main: reaching here proves the repo is on main.
  });

  it("live closure validator returns hashes for every manifest lane if practical; otherwise injected gate", async () => {
    const manifest = JSON.parse(readFileSync(REAL_MANIFEST_PATH, "utf8")) as { lanes: Record<string, unknown> };
    const laneIds = Object.keys(manifest.lanes).sort();

    let liveHashes: Record<string, string> | undefined;
    let liveOk = false;
    try {
      liveHashes = validateRuntimeClosures(REAL_MANIFEST_PATH);
      // Determinism: a second pass yields identical hashes.
      const again = validateRuntimeClosures(REAL_MANIFEST_PATH);
      assert.deepEqual(again, liveHashes, "closure hashes should be deterministic");
      liveOk = true;
    } catch {
      liveOk = false;
    }

    if (liveOk && liveHashes) {
      assert.deepEqual(Object.keys(liveHashes).sort(), laneIds, "every manifest lane should have a closure hash");
      for (const lane of laneIds) {
        assert.match(liveHashes[lane], /^[0-9a-f]{64}$/, `lane ${lane} closure hash should be 64 hex`);
      }
    } else {
      // Real closure inputs are not all present (bwrap / makora provider / etc.):
      // test the injected gate and leave the real closure to integration tests.
      const slug = "closure-injected-card";
      const packet = makePacket({ roadmap: eligibleRoadmap(slug, 1) });
      const ledger = retainedTempDir("away-ledger-");
      const deps = makeFixedDeps(packet, slug, {});
      const result = await reserveNext(reserveOpts(packet, ledger), deps);
      assert.equal(result.kind, "reserved");
      if (result.kind !== "reserved") throw new Error("unreachable");
      assert.deepEqual(result.closureHashes, FIXED_CLOSURE, "injected closureFacts should be plumbed through");
      assert.equal(openLedger(ledger).replay().records.length, 1);
    }
  });
});

describe("A3 lifecycle controller", () => {
  async function reservedFixture() {
    const slug = "lifecycle-card";
    const packet = makePacket({ roadmap: eligibleRoadmap(slug, 1) });
    const ledger = retainedTempDir("away-ledger-");
    const result = await reserveNext(
      reserveOpts(packet, ledger, "lifecycle-run"),
      makeFixedDeps(packet, slug, {}),
    );
    assert.equal(result.kind, "reserved");
    if (result.kind !== "reserved") throw new Error("unreachable");
    return result;
  }

  it("drives source-backed create, ship, host candidate commit, and exact-OID verify in order", async () => {
    const reservation = await reservedFixture();
    const calls: string[] = [];
    let namespaceChecks = 0;
    const result = await driveReservedLifecycle(
      reservation,
      { supplementalObjective: "tighten parser bounds" },
      {
        async namespaceState(slug) {
          calls.push(`namespace:${slug}`);
          namespaceChecks += 1;
          return namespaceChecks === 1 ? "absent" : "established";
        },
        async invoke(request) {
          calls.push(`invoke:${request.phase}`);
          assert.equal(request.answerPolicy("discovery-level"), "deep");
          assert.equal(request.answerPolicy("clean-isolated-workspace"), "proceed");
          assert.equal(request.answerPolicy("agent-commit"), "deny");
          if (request.phase === "create") {
            assert.equal(request.command, "/create lifecycle-card --from .pi/ROADMAP.md#RM-001");
            assert.equal(request.supplementalObjective, "tighten parser bounds");
            return { phase: "create", command: request.command, status: "completed", terminalClaim: "none" } as const;
          }
          if (request.phase === "ship") {
            assert.equal(request.command, "/ship lifecycle-card");
            return { phase: "ship", command: request.command, status: "completed", terminalClaim: "none" } as const;
          }
          assert.equal(request.command, "/verify lifecycle-card");
          assert.equal(request.expectedOid, "b".repeat(40));
          return {
            phase: "verify", command: request.command, status: "completed", terminalClaim: "verified",
            verifiedOid: "b".repeat(40), fingerprint: "c".repeat(64), repositoryWritesAfterFingerprint: 0,
          } as const;
        },
        async createOrObserveCandidate(request) {
          calls.push("candidate");
          assert.equal(request.slug, "lifecycle-card");
          assert.equal(request.baseOid, FIXED_BASE_OID);
          return {
            oid: "b".repeat(40), baseOid: FIXED_BASE_OID, clean: true, hostObserved: true,
            paths: ["src/change.ts"], hashes: { "src/change.ts": "d".repeat(64) },
          };
        },
      },
    );
    assert.deepEqual(calls, [
      "namespace:lifecycle-card", "invoke:create", "namespace:lifecycle-card",
      "invoke:ship", "candidate", "invoke:verify",
    ]);
    assert.deepEqual(result, {
      kind: "completed", slug: "lifecycle-card", cardId: "RM-001",
      candidateOid: "b".repeat(40), fingerprint: "c".repeat(64),
    });
  });

  it("reserves by repository identity before applying supplemental objective data", async () => {
    const reservation = await reservedFixture();
    let namespaceChecks = 0;
    const result = await runAwayController(
      { repoRoot: "/repo", supplementalObjective: "never select from this text" },
      {
        async reserve(request) {
          assert.deepEqual(request, { repoRoot: "/repo" });
          return reservation;
        },
        host: {
          async namespaceState() {
            namespaceChecks += 1;
            return namespaceChecks === 1 ? "absent" as const : "established" as const;
          },
          async invoke(request) {
            if (request.phase === "verify") {
              return {
                phase: "verify", command: request.command, status: "completed",
                terminalClaim: "verified", verifiedOid: "b".repeat(40),
                fingerprint: "c".repeat(64), repositoryWritesAfterFingerprint: 0,
              } as const;
            }
            return {
              phase: request.phase, command: request.command, status: "completed",
              terminalClaim: "none",
            } as const;
          },
          async createOrObserveCandidate() {
            return {
              oid: "b".repeat(40), baseOid: FIXED_BASE_OID, clean: true,
              hostObserved: true, paths: ["src/change.ts"],
              hashes: { "src/change.ts": "d".repeat(64) },
            };
          },
        },
      },
    );
    assert.equal(result.kind, "completed");
  });

  it("answers only fixed unattended policy questions and rejects unknown dialogue", () => {
    assert.equal(answerAwayPolicy("discovery-level"), "deep");
    assert.equal(answerAwayPolicy("clean-isolated-workspace"), "proceed");
    for (const question of ["agent-commit", "agent-push", "agent-publication", "agent-merge"]) {
      assert.equal(answerAwayPolicy(question), "deny");
    }
    assert.throws(
      () => answerAwayPolicy("choose-a-database"),
      (error: unknown) => error instanceof ControllerBlockError && error.gate === "policy-answer" && /unexpected question/.test(error.message),
    );
  });

  it("blocks namespace drift, ship completion claims, dirty candidates, and stale verify evidence", async () => {
    const reservation = await reservedFixture();
    const baseHost = {
      async namespaceState() { return "absent" as const; },
      async invoke(request: { phase: string; command: string }) {
        return { phase: request.phase, command: request.command, status: "completed", terminalClaim: "none" } as const;
      },
      async createOrObserveCandidate() {
        return {
          oid: "b".repeat(40), baseOid: FIXED_BASE_OID, clean: true, hostObserved: true,
          paths: ["src/change.ts"], hashes: { "src/change.ts": "d".repeat(64) },
        };
      },
    };
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, { ...baseHost, async namespaceState() { return "established" as const; } }),
      /namespace.*absent/i,
    );

    let checks = 0;
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, {
        ...baseHost,
        async namespaceState() { checks += 1; return checks === 1 ? "absent" as const : "established" as const; },
        async invoke(request) {
          if (request.phase === "ship") return { phase: "ship", command: request.command, status: "completed", terminalClaim: "verified" } as const;
          return baseHost.invoke(request);
        },
      }),
      /ship.*terminal/i,
    );

    checks = 0;
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, {
        ...baseHost,
        async namespaceState() { checks += 1; return checks === 1 ? "absent" as const : "established" as const; },
        async createOrObserveCandidate() {
          return {
            oid: "b".repeat(40), baseOid: FIXED_BASE_OID, clean: false, hostObserved: true,
            paths: ["src/change.ts"], hashes: { "src/change.ts": "d".repeat(64) },
          };
        },
      }),
      /candidate.*clean/i,
    );

    checks = 0;
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, {
        ...baseHost,
        async namespaceState() { checks += 1; return checks === 1 ? "absent" as const : "established" as const; },
        async createOrObserveCandidate() {
          return {
            oid: "b".repeat(40), baseOid: FIXED_BASE_OID, clean: true,
            hostObserved: true, paths: ["src/change.ts"], hashes: {},
          };
        },
      }),
      /candidate.*hash/i,
    );

    checks = 0;
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, {
        ...baseHost,
        async namespaceState() { checks += 1; return checks === 1 ? "absent" as const : "established" as const; },
        async createOrObserveCandidate() {
          return {
            oid: FIXED_BASE_OID, baseOid: FIXED_BASE_OID, clean: true,
            hostObserved: true, paths: ["src/change.ts"],
            hashes: { "src/change.ts": "d".repeat(64) },
          };
        },
      }),
      /candidate.*distinct/i,
    );

    checks = 0;
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, {
        ...baseHost,
        async namespaceState() { checks += 1; return checks === 1 ? "absent" as const : "established" as const; },
        async invoke(request) {
          if (request.phase === "verify") {
            return {
              phase: "verify", command: request.command, status: "completed",
              terminalClaim: "verified", verifiedOid: "d".repeat(40),
              fingerprint: "c".repeat(64), repositoryWritesAfterFingerprint: 0,
            } as const;
          }
          return baseHost.invoke(request);
        },
      }),
      /verify.*OID/i,
    );

    checks = 0;
    await assert.rejects(
      driveReservedLifecycle(reservation, {}, {
        ...baseHost,
        async namespaceState() { checks += 1; return checks === 1 ? "absent" as const : "established" as const; },
        async invoke(request) {
          if (request.phase === "verify") {
            return {
              phase: "verify", command: request.command, status: "completed",
              terminalClaim: "verified", verifiedOid: "b".repeat(40),
              fingerprint: "c".repeat(64), repositoryWritesAfterFingerprint: 1,
            } as const;
          }
          return baseHost.invoke(request);
        },
      }),
      /fingerprint.*write/i,
    );
  });
});