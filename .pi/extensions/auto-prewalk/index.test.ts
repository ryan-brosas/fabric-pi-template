import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

const MODEL = "makora/zai-org/GLM-5.2-NVFP4";
const TOOLS = ["read", "grep", "find", "ls", "edit", "write"];

type AsyncProgram = (...args: unknown[]) => Promise<unknown>;
type AsyncProgramConstructor = new (...args: string[]) => AsyncProgram;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as AsyncProgramConstructor;

async function runProgram(
  code: string,
  overrides: {
    pi?: Record<string, (...args: unknown[]) => Promise<unknown>>;
    schema?: Record<string, (...args: unknown[]) => Promise<unknown>>;
    agents?: Record<string, (...args: unknown[]) => Promise<unknown>>;
  } = {},
): Promise<unknown> {
  const program = new AsyncFunction("pi", "schema", "agents", code);
  return program(
    overrides.pi ?? {},
    overrides.schema ?? {},
    overrides.agents ?? {},
  );
}

describe("automatic prewalk settings", () => {
  it("enables only an explicit provider/model target", async () => {
    const { parseAutoPrewalkSettings } = await import("./index.ts");

    assert.deepEqual(
      parseAutoPrewalkSettings(JSON.stringify({ prewalk: { auto: true, model: MODEL } })),
      { kind: "enabled", model: MODEL },
    );
    assert.equal(
      parseAutoPrewalkSettings(JSON.stringify({ prewalk: { auto: false, model: MODEL } })).kind,
      "disabled",
    );
    assert.equal(
      parseAutoPrewalkSettings(JSON.stringify({ prewalk: { auto: true, model: "invalid" } })).kind,
      "disabled",
    );
  });
});

describe("automatic prewalk instrumentation", () => {
  it("hands a successful first edit to the configured executor and preserves the result", async () => {
    const { instrumentFabricProgram } = await import("./index.ts");
    const handoffs: Record<string, unknown>[] = [];
    const code = instrumentFabricProgram(
      'await pi.edit({ path: "/tmp/example", old: "a", new: "b" }); return "frontier";',
      { model: MODEL, task: "implement the feature" },
    );

    const result = await runProgram(code, {
      pi: { edit: async () => ({ ok: true }) },
      schema: { commit: async () => ({ ok: true }) },
      agents: {
        handoff: async (...args: unknown[]) => {
          handoffs.push(args[0] as Record<string, unknown>);
          return { deferred: true };
        },
      },
    });

    assert.equal(result, "frontier");
    assert.deepEqual(handoffs, [
      {
        model: MODEL,
        task: "implement the feature",
        name: "Automatic prewalk executor",
        thinking: "max",
        extensions: true,
        recursive: false,
        tools: TOOLS,
      },
    ]);
  });

  it("leaves read-only Fabric programs unchanged", async () => {
    const { instrumentFabricProgram } = await import("./index.ts");
    const original = 'return await pi.read("/tmp/example");';

    assert.equal(
      instrumentFabricProgram(original, { model: MODEL, task: "inspect only" }),
      original,
    );
  });

  it("does not duplicate an explicit handoff", async () => {
    const { instrumentFabricProgram } = await import("./index.ts");
    const handoffs: Record<string, unknown>[] = [];
    const code = instrumentFabricProgram(
      'await pi.write({ path: "/tmp/example", text: "x" }); await agents.handoff({ model: "already/selected" }); return "done";',
      { model: MODEL, task: "implement the feature" },
    );

    const result = await runProgram(code, {
      pi: { write: async () => ({ ok: true }) },
      schema: { commit: async () => ({ ok: true }) },
      agents: {
        handoff: async (...args: unknown[]) => {
          handoffs.push(args[0] as Record<string, unknown>);
          return { deferred: true };
        },
      },
    });

    assert.equal(result, "done");
    assert.deepEqual(handoffs, [{ model: "already/selected" }]);
  });

  it("still schedules the handoff when later frontier code fails", async () => {
    const { instrumentFabricProgram } = await import("./index.ts");
    const handoffs: Record<string, unknown>[] = [];
    const code = instrumentFabricProgram(
      'await pi.edit({ path: "/tmp/example", old: "a", new: "b" }); throw new Error("later failure");',
      { model: MODEL, task: "implement the feature" },
    );

    await assert.rejects(
      runProgram(code, {
        pi: { edit: async () => ({ ok: true }) },
        schema: { commit: async () => ({ ok: true }) },
        agents: {
          handoff: async (...args: unknown[]) => {
            handoffs.push(args[0] as Record<string, unknown>);
            return { deferred: true };
          },
        },
      }),
      /later failure/,
    );
    assert.equal(handoffs.length, 1);
  });
});
