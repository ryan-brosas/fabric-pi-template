// generate-manifest.mjs — release-surface author for .template-manifest.json.
// Composes verify-manifest.mjs (the single source of truth for the shipped
// boundary walk): mismatched and unmanaged files are (re)hashed, entries whose
// files no longer exist are dropped, and unsupported manifest paths abort
// generation. Run after editing any shipped template file, then confirm with
// verify-manifest.mjs.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyManifest } from "./verify-manifest.mjs";

const here = fileURLToPath(import.meta.url);
const rootDir = resolve(here, "..", "..");
const manifestPath = join(rootDir, ".template-manifest.json");

const prior = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { version: "1.0.0", files: {} };

const result = verifyManifest(prior, rootDir);
if (result.unsupported.length) {
  console.error("generate-manifest: unsupported manifest paths; refusing to generate:");
  for (const p of result.unsupported) console.error("  " + p);
  process.exit(1);
}

const files = { ...(prior.files || {}) };
for (const p of result.missing) delete files[p];
for (const p of [...result.mismatch, ...result.unmanaged]) {
  files[p] = createHash("sha256")
    .update(readFileSync(join(rootDir, p)))
    .digest("hex");
}
const sorted = {};
for (const p of Object.keys(files).sort()) sorted[p] = files[p];

writeFileSync(
  manifestPath,
  JSON.stringify(
    { version: prior.version || "1.0.0", createdAt: new Date().toISOString(), files: sorted },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    rehashed: result.mismatch.length,
    added: result.unmanaged.length,
    removed: result.missing.length,
    total: Object.keys(sorted).length,
  }),
);
