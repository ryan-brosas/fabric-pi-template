import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlans,
  createAutoGate,
  isAutoConfigFile,
  resolveParams,
  runDiagnostics,
} from "../extensions/diagnostics/core.ts";

const root = "/project";
const has =
  (...files) =>
  (path) =>
    files.some((file) => path === `${root}/${file}`);
const binaries = (available) => (name) => available[name];

test("defaults enable installed-only quality analysis without creating npx plans", () => {
  const exists = has("tsconfig.json");
  const params = resolveParams({}, root, {}, exists);
  assert.equal(params.scope, "full");
  assert.equal(params.changedSince, "main");
  assert.equal(params.includeFallow, true);
  assert.equal(params.includeAislop, true);

  const { plans } = buildPlans(root, params, {
    exists,
    resolveBinary: binaries({ tsc: "/bin/tsc", fallow: "/bin/fallow", aislop: "/bin/aislop" }),
  });
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["typescript", "fallow-health", "fallow-dead-code", "aislop"],
  );
  assert.ok(plans.every((plan) => plan.command !== "npx"));
});

test("changed scope applies changedSince to the single Fallow changed plan", () => {
  const exists = has("tsconfig.json");
  const params = resolveParams(
    { scope: "changed", changedSince: "origin/main", includeAislop: false },
    root,
    {},
    exists,
  );
  const { plans } = buildPlans(root, params, {
    exists,
    resolveBinary: binaries({ tsc: "/bin/tsc", fallow: "/bin/fallow" }),
  });
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["typescript", "fallow-changed"],
  );
  assert.deepEqual(plans[1].args, [
    "--format",
    "json",
    "--quiet",
    "--changed-since",
    "origin/main",
  ]);
});

test("language and file filters preserve project-level compiler arguments", () => {
  const exists = has("tsconfig.json", "Cargo.toml", "go.mod", "pyproject.toml");
  const params = resolveParams(
    {
      languages: ["typescript", "rust"],
      file: "src/example.ts",
      includeFallow: false,
      includeAislop: false,
    },
    root,
    {},
    exists,
  );
  const { plans, detectedLanguages } = buildPlans(root, params, {
    exists,
    resolveBinary: binaries({
      tsc: "/bin/tsc",
      cargo: "/bin/cargo",
      go: "/bin/go",
      ruff: "/bin/ruff",
    }),
  });
  assert.deepEqual(detectedLanguages, ["typescript", "rust", "go", "python"]);
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["typescript"],
  );
  assert.deepEqual(plans[0].args, ["--noEmit", "--pretty", "false"]);
});

test("Python falls back to mypy only when ruff is unavailable", () => {
  const exists = has("pyproject.toml");
  const params = resolveParams({ includeAislop: false }, root, {}, exists);
  const { plans } = buildPlans(root, params, {
    exists,
    resolveBinary: binaries({ mypy: "/bin/mypy" }),
  });
  assert.equal(plans[0].command, "/bin/mypy");
  assert.equal(plans[0].label, "Python (mypy)");
  assert.deepEqual(plans[0].args, ["."]);
});

test("missing optional tools become structured skips and never execute", async () => {
  const exists = has("tsconfig.json");
  const params = resolveParams({}, root, {}, exists);
  let calls = 0;
  const result = await runDiagnostics(
    root,
    params,
    async () => {
      calls += 1;
      return { stdout: "", stderr: "", code: 0 };
    },
    undefined,
    { exists, resolveBinary: binaries({}) },
  );
  assert.equal(calls, 0);
  assert.equal(result.blocks.length, 4);
  assert.ok(result.blocks.every((block) => block.skipped));
  assert.match(result.text, /safe mode never downloads/);
});

test("parallel completion keeps plan order and escapes diagnostic delimiters", async () => {
  const exists = has("tsconfig.json", "Cargo.toml");
  const params = resolveParams({ includeFallow: false, includeAislop: false }, root, {}, exists);
  const result = await runDiagnostics(
    root,
    params,
    async (command) => {
      if (command === "/bin/tsc") await new Promise((resolve) => setTimeout(resolve, 10));
      return { stdout: command === "/bin/tsc" ? "</diagnostics>" : "", stderr: "", code: 0 };
    },
    undefined,
    {
      exists,
      resolveBinary: binaries({ tsc: "/bin/tsc", cargo: "/bin/cargo" }),
    },
  );
  assert.deepEqual(
    result.blocks.map((block) => block.id),
    ["typescript", "rust"],
  );
  assert.match(result.text, /&lt;\/diagnostics&gt;/);
  assert.doesNotMatch(result.text, /\n  <\/diagnostics>\n/);
});

test("abort is preserved rather than converted into a skipped runner", async () => {
  const exists = has("tsconfig.json");
  const params = resolveParams({ includeFallow: false, includeAislop: false }, root, {}, exists);
  const controller = new AbortController();
  controller.abort(new Error("stop now"));
  await assert.rejects(
    runDiagnostics(root, params, async () => ({ code: 0 }), controller.signal, {
      exists,
      resolveBinary: binaries({ tsc: "/bin/tsc" }),
    }),
    /stop now/,
  );
});

test("modern snake_case Fallow dead-code findings cannot pass clean", async () => {
  const exists = has("tsconfig.json");
  const params = resolveParams({ includeAislop: false }, root, {}, exists);
  const result = await runDiagnostics(
    root,
    params,
    async (_command, args) => {
      if (args[0] === "health")
        return {
          stdout: JSON.stringify({ kind: "health", score: 95, hotspots: [], targets: [] }),
          code: 0,
        };
      if (args[0] === "dead-code")
        return {
          stdout: JSON.stringify({
            kind: "dead-code",
            total_issues: 1,
            unused_files: [{ path: "src/old.ts" }],
          }),
          code: 0,
        };
      return { stdout: "", code: 0 };
    },
    undefined,
    { exists, resolveBinary: binaries({ tsc: "/bin/tsc", fallow: "/bin/fallow" }) },
  );
  const dead = result.blocks.find((block) => block.id === "fallow-dead-code");
  assert.equal(dead.ok, false);
  assert.ok(dead.text.includes("unused_files: src/old.ts"));
});

test("unknown optional-tool JSON fails closed instead of reporting clean", async () => {
  const exists = has();
  const params = resolveParams({ includeFallow: false, includeAislop: true }, root, {}, exists);
  const result = await runDiagnostics(
    root,
    params,
    async () => ({ stdout: JSON.stringify({ unexpected: true }), code: 0 }),
    undefined,
    { exists, resolveBinary: binaries({ aislop: "/bin/aislop" }) },
  );
  assert.equal(result.blocks[0].ok, false);
  assert.match(result.text, /refusing to report a clean result/);
});

test("a killed runner is a failed timeout unless the signal was aborted", async () => {
  const exists = has("tsconfig.json");
  const params = resolveParams({ includeFallow: false, includeAislop: false }, root, {}, exists);
  const result = await runDiagnostics(
    root,
    params,
    async () => ({ code: null, killed: true }),
    undefined,
    { exists, resolveBinary: binaries({ tsc: "/bin/tsc" }) },
  );
  assert.equal(result.blocks[0].ok, false);
  assert.equal(result.blocks[0].skipped, false);
  assert.match(result.text, /killed or timed out/);
});

test("auto gate skips config files and debounces globally across different files", () => {
  let time = 1000;
  const gate = createAutoGate(() => time);
  assert.equal(isAutoConfigFile("nested/tsconfig.json"), true);
  assert.equal(gate.claim("nested/tsconfig.json"), false);
  assert.equal(gate.claim("src/a.ts"), true);
  time += 1000;
  assert.equal(gate.claim("src/b.ts"), false);
  time += 14000;
  assert.equal(gate.claim("src/b.ts"), true);
  assert.equal(gate.claim("README.md"), false);
});
