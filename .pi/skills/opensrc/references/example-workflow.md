# Example: Complete Workflow

**Scenario:** Understand how Zod handles async refinements.

Run the analysis inside `fabric_exec` full-code mode:

```typescript
// 1. Fetch source
await pi.bash({cmd: "npx opensrc zod"});

// 2. Find refinement code
const matches = await pi.grep({
  regex: "refine.*async",
  path: "opensrc",
  glob: "*.ts",
});

// 3. Locate and read the implementation
const implementation = await pi.grep({
  regex: "refine\\(",
  path: "opensrc/repos/github.com/colinhacks/zod",
  glob: "*.ts",
});
const source = await pi.read({
  path: "opensrc/repos/github.com/colinhacks/zod/src/types.ts",
  offset: 500,
  limit: 100,
});

// 4. Check tests for usage examples
const tests = await pi.find("*.test.ts", "opensrc");
const asyncTest = await pi.read("opensrc/repos/.../async.test.ts");

// 5. Document findings
await pi.write({
  path: ".pi/artifacts/<slug>/research.md",
  text: `# Zod Async Refinements

**Finding:** Async refinements use \`parseAsync()\` rather than \`parse()\`.

**Evidence:** \`src/types.ts:842-856\`

Async refinements return a promise and require:
- \`.parseAsync()\`;
- an async refinement function;
- promise-aware error handling.
`,
});
```