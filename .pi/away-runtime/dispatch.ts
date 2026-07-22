// B3 — Host-derived dispatch.
//
// The away controller (autonomous-away-loop, ADR-015) drives this module from
// trusted phase/state. The model emits an intent; the HOST — not the model —
// maps the controller phase to one of five fixed lane profiles. The model never
// supplies the lane, model id, tools, cwd, env, binaries, args, or risk grants;
// any such capability in an untrusted envelope is rejected before Fabric is
// reached. The source view is read-only: path escape, escaping symlinks, and
// protected/runtime-protected paths are rejected.
//
// This module is pure: it never spawns a lane process (that is C1's launcher)
// and never invokes Fabric. It is imported by the launcher (C1) and the lane
// extension (C2), and exercised directly by dispatch.test.ts.
//
// Run: node --experimental-strip-types --test .pi/away-runtime/dispatch.test.ts

import type { Manifest, LaneProfile } from "./bootstrap.ts";
import { isAbsolute, resolve, relative, join, sep, dirname } from "node:path";
import { realpathSync } from "node:fs";

export type ControllerPhase = "explore" | "research" | "implement" | "review" | "verify";

export const PHASE_TO_LANE: Readonly<Record<ControllerPhase, string>> = {
  explore: "local-explorer",
  research: "external-scout",
  implement: "writer",
  review: "reviewer",
  verify: "verifier",
};

export interface DispatchedProfile {
  laneId: string;
  lane: LaneProfile;
  /** Untrusted envelope with `lane` stripped and capabilities rejected. */
  envelope: Record<string, unknown>;
}

// Capability fields the model must never supply. The bare token for subagent
// dispatch is listed here so a model cannot smuggle a raw spawn capability; the
// host firewall (A2/C2) additionally denies any non-bridge ref at the IPC layer.
const MODEL_CAPABILITY_FIELDS = [
  "lane",
  "model",
  "provider",
  "runner",
  "extensions",
  "tools",
  "cwd",
  "env",
  "args",
  "binaries",
  "binary",
  "risks",
  "agents",
  "approvals",
] as const;

/**
 * Derive the lane profile the HOST selected for this controller phase.
 * Unknown phase → throw "unknown profile" before any Fabric dispatch.
 */
export function deriveProfile(
  phase: string,
  manifest: Manifest,
): { laneId: string; lane: LaneProfile } {
  const laneId = (PHASE_TO_LANE as Record<string, string | undefined>)[phase];
  if (!laneId) throw new Error(`unknown profile: ${phase}`);
  const lane = manifest.lanes[laneId];
  if (!lane) throw new Error(`unknown profile: ${laneId}`);
  return { laneId, lane };
}

/**
 * Strip `lane` from an untrusted envelope (the host re-derives it) and reject
 * every capability field the model must never supply. A model-supplied lane
 * whose value is not a known lane id is an "unknown profile" attempt.
 */
export function dispatch(
  phase: string,
  envelope: Record<string, unknown>,
  manifest: Manifest,
): DispatchedProfile {
  const { laneId, lane } = deriveProfile(phase, manifest);
  const cleaned: Record<string, unknown> = { ...envelope };
  if ("lane" in cleaned) {
    const supplied = cleaned.lane;
    if (typeof supplied === "string" && !(supplied in manifest.lanes)) {
      throw new Error(`unknown profile: ${supplied}`);
    }
    delete cleaned.lane;
  }
  for (const field of MODEL_CAPABILITY_FIELDS) {
    if (field === "lane") continue; // already handled
    if (field in cleaned) {
      throw new Error(`model-supplied capability rejected: ${field}`);
    }
  }
  return { laneId, lane, envelope: cleaned };
}

/** Normalize a repo-relative path: strip a leading `./`; reject empty/`.`. */
export function normalizeRelative(p: string): string {
  let r = p.replace(/^\.\//, "");
  if (r === "" || r === ".") throw new Error(`empty path`);
  return r;
}

/** True if a repo-relative path equals a protected file or sits under a dir-prefixed protected entry. */
export function isProtected(
  relPath: string,
  protectedPaths: readonly string[],
  runtimeProtectedPaths: readonly string[],
): boolean {
  const r = normalizeRelative(relPath);
  for (const entry of protectedPaths) {
    if (entry.endsWith("/")) {
      if (r === entry.slice(0, -1) || r.startsWith(entry)) return true;
    } else if (r === entry) {
      return true;
    }
  }
  for (const entry of runtimeProtectedPaths) {
    if (entry.endsWith("/")) {
      if (r === entry.slice(0, -1) || r.startsWith(entry)) return true;
    } else if (r === entry) {
      return true;
    }
  }
  return false;
}

/** Canonicalize a repo root (realpath). */
function rootOf(repoRoot: string): string {
  return realpathSync(repoRoot);
}

/** Walk each existing prefix of `requested` and reject a symlink that escapes the root. */
function assertNoEscapingSymlink(root: string, requested: string): void {
  const parts = requested.split(sep).filter(Boolean);
  let cur = root;
  for (const part of parts) {
    cur = join(cur, part);
    let rp: string;
    try {
      rp = realpathSync(cur);
    } catch {
      // component does not exist yet (to-be-created) — stop walking
      break;
    }
    if (rp !== root && !rp.startsWith(root + sep)) {
      throw new Error(`symlink escape rejected: ${requested}`);
    }
    cur = rp;
  }
}

export interface SourceViewPath {
  abs: string;
  rel: string;
}

/**
 * Resolve a model-requested path against the read-only source root. Rejects
 * absolute paths, path escape (lexical or via symlink), and protected paths.
 */
export function resolveSourceView(
  repoRoot: string,
  requested: string,
  protectedPaths: readonly string[],
  runtimeProtectedPaths: readonly string[],
): SourceViewPath {
  if (isAbsolute(requested)) throw new Error(`absolute path rejected: ${requested}`);
  const root = rootOf(repoRoot);
  const resolved = resolve(root, requested);
  let canonical: string;
  try {
    canonical = realpathSync(resolved);
  } catch {
    // target not present yet — fall back to lexical containment; symlinked
    // intermediate dirs are caught by the component walk below
    canonical = resolved;
  }
  if (canonical !== root && !canonical.startsWith(root + sep)) {
    throw new Error(`path escape rejected: ${requested}`);
  }
  const rel = relative(root, canonical);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escape rejected: ${requested}`);
  }
  assertNoEscapingSymlink(root, requested);
  if (isProtected(rel, protectedPaths, runtimeProtectedPaths)) {
    throw new Error(`protected path rejected: ${rel}`);
  }
  return { abs: canonical, rel };
}
