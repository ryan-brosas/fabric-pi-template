import { buildPlans } from "./planning.ts";
import { executePlan } from "./formatting.ts";
import type {
  DiagnosticsResult,
  ExecRunner,
  Exists,
  ResolveBinary,
  ResolvedDiagnosticsParams,
} from "./types.ts";

export * from "./planning.ts";
export type * from "./types.ts";

export async function runDiagnostics(
  root: string,
  params: ResolvedDiagnosticsParams,
  exec: ExecRunner,
  signal?: AbortSignal,
  options: { exists?: Exists; resolveBinary?: ResolveBinary } = {},
): Promise<DiagnosticsResult> {
  const { plans, detectedLanguages } = buildPlans(root, params, options);
  if (!plans.length) {
    return {
      text: "No supported diagnostics detected for this scope.",
      blocks: [],
      detectedLanguages,
      scope: params.scope,
    };
  }
  const blocks = await Promise.all(plans.map((plan) => executePlan(plan, root, exec, signal)));
  return {
    text: blocks.map((block) => block.text).join("\n\n"),
    blocks,
    detectedLanguages,
    scope: params.scope,
  };
}
