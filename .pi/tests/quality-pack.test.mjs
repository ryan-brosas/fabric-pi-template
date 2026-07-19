import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNNER = ".pi/tools/quality/run-pack.mjs";
const FIX = ".pi/tests/fixtures/quality";
const run = (args, opts = {}) =>
  spawnSync("node", [RUNNER, ...args], { encoding: "utf8", ...opts });

test("merge markers fail", () => {
  const r = run([join(FIX, "bad-merge-marker.txt")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /merge-marker/);
});

test("clean file passes", () => {
  const r = run([join(FIX, "clean.ts")]);
  assert.equal(r.status, 0);
});

test("pi-read truncation banner fails", () => {
  const r = run([join(FIX, "bad-truncation.txt")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /truncation-marker/);
});

test("missing eof newline fails", () => {
  const r = run([join(FIX, "no-eof.txt")]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /eof-newline/);
});

test("oxfmt unavailable skips js-ts pack, still passes clean file", () => {
  const r = spawnSync(process.execPath, [RUNNER, join(FIX, "clean.ts")], {
    encoding: "utf8",
    env: { ...process.env, PATH: "/nonexistent" },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /skip js-ts/);
});

test("--changed outside git skips cleanly", () => {
  const dir = mkdtempSync(join(tmpdir(), "qp-"));
  const r = spawnSync("node", [join(process.cwd(), RUNNER), "--changed"], {
    encoding: "utf8",
    cwd: dir,
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /skip/);
});
