// verify-manifest.mjs — whole-boundary SHA256 verifier for the Fabric-Pi
// template payload.
//
// Pure function + CLI. No external dependencies. It checks agreement between
// .template-manifest.json and the static .pi payload while excluding Pi/Fabric
// runtime caches and feature artifacts.
//
// ---------------------------------------------------------------------------
// Manifest schema (PINNED — the release-surface step authors
// .template-manifest.json to match this exactly):
//
//   {
//     "version":   "<string>",
//     "createdAt": "<ISO-8601 timestamp>",
//     "files": {
//       "<path relative to rootDir>": "<sha256 hex lowercase>"
//     }
//   }
//
// - `files` is an object mapping a path to its lowercase SHA256 hex digest.
// - Paths are RELATIVE to `rootDir` (the profile root, `project/.pi/` in the
//   authoring workspace or `.pi/` in a target project that copied the profile).
// - Paths use forward slashes, no leading slash, and must not escape `rootDir`
//   via `..` or by being absolute.
// - `version` and `createdAt` are not validated by the verifier; the Release
//   Surfaces phase sets them.
// - The manifest file itself (`.template-manifest.json`) is NOT hashed and
//   is excluded from the on-disk walk.
//
// ---------------------------------------------------------------------------
// verifyManifest(manifest, rootDir) -> { missing, mismatch, unmanaged, unsupported }
//
//   missing     — a path in manifest.files that does not exist on disk under
//                 rootDir.
//   mismatch    — a path in manifest.files whose on-disk SHA256 does not match
//                 the manifest hash.
//                 unmanaged   — a file on disk under rootDir (walked recursively) that is NOT
//                 in manifest.files. The walk skips runtime/non-shipped dirs:
//                 top-level (direct children of rootDir) `runtime/` (runtime
//                 cache, gitignored), `artifacts/` (per-feature runtime state),
//                 `git/` and `npm/` (Pi provider package caches created at
//                 project load), `state/` (extension-local session state), and
//                 `fabric/` (Fabric mesh state, mode 700);
//                 `.git/` and `node_modules/` anywhere in the tree; and the
//                 manifest file `.template-manifest.json` at the root of
//                 rootDir. The shipped static surface (scripts/, extensions/,
//                 prompts/, skills/, agents/, templates/) IS walked and must
//                 be recorded in the manifest.
//   unsupported — a path in manifest.files that escapes rootDir (resolves
//                 outside rootDir via `..` or is absolute), references
//                 something the verifier cannot hash (a directory, a symlink
//                 pointing outside rootDir, or a broken symlink), OR falls
//                 under an excluded runtime/non-shipped dir (runtime/,
//                 artifacts/, git/, npm/, fabric/, state/, .git/,
//                 node_modules/) — the shipped manifest carries no runtime
//                 mesh state.
//
// ---------------------------------------------------------------------------
// CLI entry (run as `node verify-manifest.mjs`):
// - Reads the manifest from `<scriptDir>/../.template-manifest.json` (i.e.
//   `.pi/.template-manifest.json`).
// - `rootDir` = `<scriptDir>/..` (i.e. `.pi/`, the profile root).
// - Prints the result as JSON to stdout.
// - Exits 1 if any of the four arrays is non-empty; exits 0 if all are empty.
// - If the manifest file is missing (the release-surface step has not
//   authored it yet), prints a clear error to stderr and exits 1. The CLI is
//   an integration test that stays red until that step lands the manifest.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = ".template-manifest.json";

// Top-level dirs (direct children of rootDir) skipped during the on-disk
// walk for `unmanaged`. `runtime/` is the runtime cache (gitignored);
// `artifacts/` holds per-feature runtime state (plan, decisions, evidence);
// `git/` and `npm/` are Pi provider package caches created at project load;
// `fabric/` is Fabric mesh state. scripts/ and extensions/ are NOT excluded:
// they are part of the shipped static surface and must appear in the manifest.
const EXCLUDE_TOP_DIRS = new Set(["runtime", "artifacts", "git", "npm", "fabric", "state"]);
// Dirs skipped anywhere in the tree during the walk.
const EXCLUDE_ANY_DIRS = new Set([".git", "node_modules"]);

function sha256(p) {
  const h = createHash("sha256");
  h.update(readFileSync(p));
  return h.digest("hex");
}

function toPosix(p) {
  return p.split(sep).join("/");
}

// True if `resolved` is strictly inside `rootDir` (not rootDir itself, not
// outside). Returns false when `resolved === rootDir` (a directory, not a
// file) and when `relative(rootDir, resolved)` escapes via `..`.
function withinRoot(resolved, rootDir) {
  const rel = relative(rootDir, resolved);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function verifyManifest(manifest, rootDir) {
  const missing = [];
  const mismatch = [];
  const unmanaged = [];
  const unsupported = [];

  const recorded = manifest && manifest.files ? manifest.files : {};

  // 1. Check every manifest path against disk.
  for (const [p, expected] of Object.entries(recorded)) {
    const resolved = resolve(rootDir, p);
    if (!withinRoot(resolved, rootDir)) {
      unsupported.push(p);
      continue;
    }
    // A manifest entry must not fall under an excluded runtime/non-shipped
    // dir; the shipped manifest carries no runtime mesh state.
    const segs = p.split("/").filter(Boolean);
    if (
      segs.length > 0 &&
      (EXCLUDE_TOP_DIRS.has(segs[0]) || segs.some((s) => EXCLUDE_ANY_DIRS.has(s)))
    ) {
      unsupported.push(p);
      continue;
    }
    // Existence without following symlinks: a broken symlink still "exists"
    // as a symlink but cannot be hashed.
    try {
      lstatSync(resolved);
    } catch {
      missing.push(p);
      continue;
    }
    // Follow symlinks to the real target. Catches broken symlinks and
    // symlinks pointing outside rootDir.
    let real;
    try {
      real = realpathSync(resolved);
    } catch {
      unsupported.push(p);
      continue;
    }
    if (!withinRoot(real, rootDir)) {
      unsupported.push(p);
      continue;
    }
    const st = statSync(real);
    if (!st.isFile()) {
      // Directory or other non-regular type.
      unsupported.push(p);
      continue;
    }
    const actual = sha256(real);
    if (actual !== expected) mismatch.push(p);
  }

  // 2. Walk rootDir recursively and collect on-disk regular files, skipping
  //    runtime/non-shipped dirs and the manifest file itself.
  const discovered = new Set();
  function walk(dir, depth) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      // Top-level (direct children of rootDir) runtime/non-shipped dirs.
      if (depth === 0 && EXCLUDE_TOP_DIRS.has(name)) continue;
      // Standard dirs to skip anywhere in the tree.
      if (EXCLUDE_ANY_DIRS.has(name)) continue;
      // The manifest file itself at the root of rootDir.
      if (depth === 0 && name === MANIFEST_NAME) continue;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const rel = relative(rootDir, full);
        discovered.add(toPosix(rel));
      }
      // Symlinks and other non-file non-dir entry types are skipped: not
      // added to `unmanaged` and not added to `unsupported` (unsupported is
      // reserved for manifest paths, per the pinned contract).
    }
  }
  walk(rootDir, 0);

  for (const rel of discovered) {
    if (!(rel in recorded)) unmanaged.push(rel);
  }
  unmanaged.sort();

  return { missing, mismatch, unmanaged, unsupported };
}

// CLI entry — detect `node verify-manifest.mjs` invocation.
const isMain = (() => {
  if (!process.argv[1]) return false;
  const invoked = resolve(process.argv[1]);
  const here = fileURLToPath(import.meta.url);
  return invoked === here;
})();

if (isMain) {
  const here = fileURLToPath(import.meta.url);
  const scriptDir = resolve(here, "..");
  const rootDir = resolve(scriptDir, "..");
  const manifestPath = join(rootDir, MANIFEST_NAME);

  if (!existsSync(manifestPath)) {
    process.stderr.write(
      `verify-manifest: manifest not found at ${manifestPath}\n` +
        "The manifest (.template-manifest.json) is authored by the release-surface " +
        "step. It does not exist yet; the verifier CLI stays red until that " +
        "step lands it.\n",
    );
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    process.stderr.write(`verify-manifest: failed to parse ${manifestPath}: ${e.message}\n`);
    process.exit(1);
  }

  const result = verifyManifest(manifest, rootDir);
  console.log(JSON.stringify(result));
  const hasDefects =
    result.missing.length > 0 ||
    result.mismatch.length > 0 ||
    result.unmanaged.length > 0 ||
    result.unsupported.length > 0;
  process.exit(hasDefects ? 1 : 0);
}
