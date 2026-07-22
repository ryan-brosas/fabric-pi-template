// D1 — Hermetic sandbox integration: content-addressed retained fixtures.
//
// The fixture store is content-addressed: a fixture is keyed by the sha256 of
// its defining inputs. Valid fixtures are REUSED across runs (never
// auto-deleted — the no-delete rule + the plan's "reuse valid fixtures" step).
// New fixtures are refused once the store reaches the configured storage cap
// (plan step 7: "stop when the configured storage cap is reached").
//
// `buildIntegrationFixture` materializes a self-contained away-runtime fixture
// repo: a synthetic manifest pointing at the REAL wrapper / pi-fabric /
// lane-extension (so the integration exercises the real implementation) + a
// faux provider + source files + staging/attest/control dirs. The fixture is
// hermetic: it depends only on the repo's away-runtime install + the passed
// provider extension, never on the real Makora provider or the live repo.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface FixtureStore {
  /** Reuse an existing fixture by key, or build it. Throws if the store is full. */
  getOrCreate(key: string, builder: (dir: string) => void): string;
  /** Total bytes used by the store. */
  measure(): number;
  /** All retained fixture dir paths (for reporting). */
  paths(): string[];
  /** True when the store has reached the storage cap. */
  isFull(): boolean;
  readonly root: string;
  readonly storageCapBytes: number;
}

export function createFixtureStore(root: string, opts: { storageCapBytes: number }): FixtureStore {
  mkdirSync(root, { recursive: true });

  function dirBytes(d: string): number {
    let total = 0;
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) total += dirBytes(p);
      else total += st.size;
    }
    return total;
  }

  function measure(): number {
    if (!existsSync(root)) return 0;
    let total = 0;
    for (const entry of readdirSync(root)) {
      const p = join(root, entry);
      const st = statSync(p);
      if (st.isDirectory()) total += dirBytes(p);
      else total += st.size;
    }
    return total;
  }

  return {
    root,
    storageCapBytes: opts.storageCapBytes,
    getOrCreate(key, builder) {
      const dir = join(root, key);
      if (existsSync(dir)) return dir; // reuse, never auto-delete
      if (measure() >= opts.storageCapBytes) {
        throw new Error(
          `away-sandbox: fixture store full (${measure()}/${opts.storageCapBytes} bytes); refusing new fixture ${key}`,
        );
      }
      mkdirSync(dir, { recursive: true });
      builder(dir);
      return dir;
    },
    measure,
    paths() {
      if (!existsSync(root)) return [];
      return readdirSync(root)
        .map((e) => join(root, e))
        .filter((p) => statSync(p).isDirectory());
    },
    isFull() {
      return measure() >= opts.storageCapBytes;
    },
  };
}

/** Content-addressed key: sha256 over the fixture's defining inputs. */
export function fixtureKey(...inputs: string[]): string {
  return createHash("sha256").update(inputs.join("\n")).digest("hex");
}

// ---- integration fixture builder -------------------------------------------

// Real repo + away-runtime paths (the integration exercises the REAL wrapper,
// pi-fabric install, and lane-extension — not copies).
const REPO = resolve(import.meta.dirname, "..", "..");
const REAL_MANIFEST = join(REPO, ".pi", "away-sandbox.json");
const REAL_WRAPPER = join(REPO, ".pi", "away-runtime", "executor-wrapper.mjs");
const REAL_LANE_EXT = join(REPO, ".pi", "away-runtime", "lane-extension.ts");
const REAL_PI_FABRIC = join(REPO, ".pi", "npm", "node_modules", "pi-fabric");

export interface IntegrationFixture {
  repoRoot: string;
  manifestPath: string;
  controlCwd: string;
  stagingRoot: string;
  attestDir: string;
  /** PI_AWAY_* env for a given lane id (the controller sets these on the launcher). */
  envFor(laneId: string): Record<string, string>;
}

export interface BuildFixtureOptions {
  /** Absolute path to the fake-provider -e extension. */
  providerExtPath: string;
  /** Override selected limits (e.g. shorter timeout for tests). */
  limits?: Record<string, number>;
}

/**
 * Materialize a self-contained away-runtime fixture under `dir`:
 *  - `<dir>/repo/.pi/away-sandbox.json` — synthetic manifest (real wrapper +
 *    pi-fabric + lane-extension; faux model → the fake provider; all lanes use
 *    the faux model).
 *  - `<dir>/repo/src/hello.txt` + `<dir>/repo/src/sub/deep.txt` — source files
 *    for away_read / away_list / away_search.
 *  - `<dir>/control` — inert control cwd (NOT the repo).
 *  - `<dir>/staging` — staging root for away_stage_write.
 *  - `<dir>/attest` — attestation dir for wrapper + extension receipts.
 */
export function buildIntegrationFixture(
  dir: string,
  opts: BuildFixtureOptions,
): IntegrationFixture {
  const repoRoot = join(dir, "repo");
  const piDir = join(repoRoot, ".pi");
  const srcDir = join(repoRoot, "src");
  const subDir = join(srcDir, "sub");
  const controlCwd = join(dir, "control");
  const stagingRoot = join(dir, "staging");
  const attestDir = join(dir, "attest");
  mkdirSync(piDir, { recursive: true });
  mkdirSync(subDir, { recursive: true });
  mkdirSync(controlCwd, { recursive: true });
  mkdirSync(stagingRoot, { recursive: true });
  mkdirSync(attestDir, { recursive: true });

  writeFileSync(join(srcDir, "hello.txt"), "hello from the fixture\n");
  writeFileSync(join(subDir, "deep.txt"), "deep nested file\n");

  // Clone the real manifest + override: faux model → the fake provider, real
  // wrapper/pi-fabric/lane-extension (absolute), inert control cwd, test
  // limits. protected_paths / runtime_protected_paths are kept as-is (they are
  // path strings checked by the lane-extension; the fixture repo simply lacks
  // those files, which is fine — away_read of a present src file still works,
  // and away_stage_write of a protected-path STRING is still rejected).
  const manifest = JSON.parse(readFileSync(REAL_MANIFEST, "utf8"));
  manifest.model_registry = {
    faux: {
      provider: "faux",
      model: "faux-1",
      thinking: "max",
      provider_source: opts.providerExtPath,
    },
  };
  manifest.extensions = { lane_extension: REAL_LANE_EXT };
  manifest.exec_path_override = REAL_WRAPPER;
  manifest.pinned_versions = {
    ...manifest.pinned_versions,
    pi_fabric_path: REAL_PI_FABRIC,
  };
  manifest.control_cwd_root = controlCwd;
  for (const laneId of Object.keys(manifest.lanes)) {
    manifest.lanes[laneId].model = "faux";
  }
  if (opts.limits) {
    manifest.limits = { ...manifest.limits, ...opts.limits };
  }
  const manifestPath = join(piDir, "away-sandbox.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    repoRoot,
    manifestPath,
    controlCwd,
    stagingRoot,
    attestDir,
    envFor(laneId) {
      return {
        PI_AWAY_LANE: laneId,
        PI_AWAY_MANIFEST: manifestPath,
        PI_AWAY_STAGING_ROOT: stagingRoot,
        PI_AWAY_ATTEST_DIR: attestDir,
        PI_AWAY_REPO_ROOT: repoRoot,
      };
    },
  };
}
