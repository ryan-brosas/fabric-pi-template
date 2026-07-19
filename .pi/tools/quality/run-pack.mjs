#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname } from "node:path";

const MAX_BYTES = 512000;
const JS_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".json", ".jsonc"]);
const OPEN_RE = /^<{7}( |$)/;
const CLOSE_RE = /^>{7}( |$)/;
const TRUNC_RE =
  /\[Showing lines \d+-\d+ of \d+ \([^)]*limit\)\. Use offset=\d+ to continue\.\]|\[\d+ more lines in file\. Use offset=\d+ to continue\.\]/;

function gitFiles(mode) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "pipe" });
  } catch {
    console.log("run-pack: skip (not a git work tree)");
    process.exit(0);
  }
  if (mode === "staged") {
    const out = execFileSync("git", ["diff", "--name-only", "--cached", "--diff-filter=ACMR"], {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  }
  const out = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((l) => l[0] !== "D" && l[1] !== "D")
    .map((l) => l.slice(3).replace(/^"|"$/g, ""));
}

function universal(file, text, findings) {
  const lines = text.split("\n");
  const conflict = lines.some((l) => OPEN_RE.test(l)) && lines.some((l) => CLOSE_RE.test(l));
  lines.forEach((line, i) => {
    if (OPEN_RE.test(line) || CLOSE_RE.test(line) || (line === "=======" && conflict)) {
      findings.push(`${file}:${i + 1} merge-marker conflict marker present`);
    }
    if (TRUNC_RE.test(line)) {
      findings.push(`${file}:${i + 1} truncation-marker pi-read truncation banner captured in content`);
    }
  });
  if (text.length > 0 && !text.endsWith("\n")) {
    findings.push(`${file}:${lines.length} eof-newline missing trailing newline`);
  }
}

function jsTs(file, findings) {
  try {
    execFileSync("npx", ["--no-install", "oxfmt", "--check", file], {
      stdio: "pipe",
      timeout: 10000,
    });
  } catch (e) {
    const err = String(e.stderr ?? e.message ?? "");
    if (e.status === undefined || /--no-install|not found|ENOENT|canceled/i.test(err)) {
      console.log(`run-pack: skip js-ts pack for ${file} (oxfmt unavailable)`);
      return;
    }
    findings.push(`${file}:1 format oxfmt --check failed`);
  }
}

const argv = process.argv.slice(2);
let files;
if (argv[0] === "--changed") files = gitFiles("changed");
else if (argv[0] === "--staged") files = gitFiles("staged");
else files = argv;

if (files.length === 0) {
  console.log("run-pack: no files to check");
  process.exit(0);
}

const findings = [];
for (const file of files) {
  let text;
  let size;
  try {
    size = statSync(file).size;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (size > MAX_BYTES) {
    findings.push(`${file}:1 oversized ${size} bytes (max ${MAX_BYTES})`);
    continue;
  }
  if (text.includes("\u0000")) continue;
  universal(file, text, findings);
  if (JS_EXTS.has(extname(file))) jsTs(file, findings);
}

if (findings.length > 0) {
  console.log(findings.join("\n"));
  process.exit(1);
}
console.log(`run-pack: ${files.length} file(s) clean`);
