import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("formats multiple JS/TS files in one invocation", () => {
  const dir = mkdtempSync(join(tmpdir(), "qp-batch-"));
  const bin = join(dir, "bin");
  const log = join(dir, "npx.log");
  const first = join(dir, "first.ts");
  const second = join(dir, "second.ts");
  writeFileSync(first, "export const first = 1;\n");
  writeFileSync(second, "export const second = 2;\n");
  spawnSync("mkdir", ["-p", bin]);
  const npx = join(bin, "npx");
  writeFileSync(npx, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NPX_LOG"\n');
  chmodSync(npx, 0o755);

  const r = spawnSync(process.execPath, [RUNNER, first, second], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin, NPX_LOG: log },
  });
  assert.equal(r.status, 0);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(calls.length, 1, "oxfmt should receive the file set in one batch");
  assert.match(calls[0], /first\.ts/);
  assert.match(calls[0], /second\.ts/);
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
