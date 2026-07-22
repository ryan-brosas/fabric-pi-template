// C3 — Verifier command catalog.
//
// The immutable, host-owned map from a verifier command ID to the EXACT argv the
// verifier runs. The model only ever supplies a `commandId` (C2 away_run_verify
// rejects model-supplied argv/args/shell/command); verifier.ts looks the ID up
// here and runs the broker-controlled argv. There is no path by which the model
// influences the argv, cwd, or binary of a candidate command — that is the
// "broker-controlled exact argv" invariant (spec.md:41,88; ADR-014).
//
// A command's argv is expressed in SANDBOX-MOUNT coordinates (e.g. ["/src/test.ts"])
// — the verifier binds the evidence tree at /src, deps at /deps, the catalog file
// at /catalog/catalog.json, and a writable scratch tmpfs at /scratch, then runs
// `<binary> ...argv` with cwd = the command's cwd (default /scratch).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/verifier.test.ts

import { createHash } from "node:crypto";

/** A single verifier command. The host (broker) defines these; the model cannot. */
export interface CommandDef {
  /** Unique command id, e.g. "test", "typecheck", "build". */
  id: string;
  /** Human label (not parsed by the verifier). */
  label?: string;
  /** Host path to the command binary (e.g. the node binary), bound read-only. */
  binary: string;
  /** Exact argv AFTER the binary, in sandbox-mount coordinates. Never model-supplied. */
  argv: string[];
  /** Sandbox cwd for the command (default "/scratch"). */
  cwd?: string;
}

/** The immutable command-ID → definition map. Host-owned. */
export type CommandCatalog = Record<string, CommandDef>;

/** Validate a catalog: rejects non-objects, mismatched id/key, non-string
 * binary/argv. The command id MUST equal its key — lookupCommand looks up by
 * key, so a mismatch would make the receipt's commandId ambiguous. */
export function validateCatalog(catalog: CommandCatalog): void {
  if (!catalog || typeof catalog !== "object") {
    throw new Error("catalog: not an object");
  }
  const seenIds = new Set<string>();
  for (const [key, def] of Object.entries(catalog)) {
    if (!def || typeof def !== "object") {
      throw new Error("catalog: entry is not an object");
    }
    if (typeof def.id !== "string" || def.id.length === 0) {
      throw new Error("catalog: command id missing or empty");
    }
    if (def.id !== key) {
      throw new Error(`catalog: command id ${def.id} != key ${key}`);
    }
    if (typeof def.binary !== "string" || def.binary.length === 0) {
      throw new Error(`catalog: command ${def.id}: binary missing`);
    }
    if (!Array.isArray(def.argv) || def.argv.some((a) => typeof a !== "string")) {
      throw new Error(`catalog: command ${def.id}: argv must be string[]`);
    }
    if (def.cwd !== undefined && (typeof def.cwd !== "string" || def.cwd.length === 0)) {
      throw new Error(`catalog: command ${def.id}: cwd must be a non-empty string`);
    }
    if (seenIds.has(def.id)) {
      throw new Error(`catalog: duplicate command id: ${def.id}`);
    }
    seenIds.add(def.id);
  }
}

/** Look up a command by id. Throws "unknown command" if absent. */
export function lookupCommand(catalog: CommandCatalog, commandId: string): CommandDef {
  const def = catalog[commandId];
  if (!def) {
    throw new Error(`unknown command: ${commandId}`);
  }
  return def;
}

/** Stable canonical JSON for hashing (sorted top-level keys). */
export function canonicalCatalogJson(catalog: CommandCatalog): string {
  const sorted: Record<string, CommandDef> = {};
  for (const k of Object.keys(catalog).sort()) {
    sorted[k] = catalog[k];
  }
  return JSON.stringify(sorted);
}

/** sha256 of the canonical catalog JSON. Bound into the verifier receipt. */
export function hashCatalog(catalog: CommandCatalog): string {
  return createHash("sha256").update(canonicalCatalogJson(catalog)).digest("hex");
}
