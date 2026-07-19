import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const json = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Extract ```typescript code blocks, strip JS comments, and join — the executable
// Fabric program surface of a prompt (prose like "no agents.spawn" is excluded).
const codeBlocks = (text) => [...text.matchAll(/```typescript\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const stripComments = (code) => code.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const programCode = (text) => codeBlocks(text).map(stripComments).join("\n");

test("configuration parses with the fabric-first profile", () => {
  const config = json("config.json");
  json("settings.json");
  json("fabric.json");
  assert.equal(config.profile.authority, "fabric-first");
  assert.equal(config.dispatch.default, "delegated");
});

test("all configured roles and their contracts are mapped", () => {
  const roles = json("config.json").role_routes;
  assert.deepEqual(Object.keys(roles).sort(), [
    "build",
    "debug",
    "explore",
    "general",
    "plan",
    "review",
    "scout",
    "vision",
  ]);
  for (const name of ["debug", "explore", "general", "plan", "review", "scout", "vision"])
    assert.ok(existsSync(join(root, "agents", `${name}.md`)));
  // Conversing-actor mechanism: actor.md contract exists independently of the
  // dead team-architect/team-risk standing crew.
  assert.ok(existsSync(join(root, "agents", "actor.md")));
});

test("requested Claude Bridge models are enabled", () => {
  const enabled = json("settings.json").enabledModels;
  assert.ok(enabled.includes("claude-bridge/claude-fable-5"));
  assert.ok(enabled.includes("claude-bridge/claude-sonnet-5"));
  assert.ok(enabled.includes("claude-bridge/claude-opus-4-8"));
});

test("fabric-focus invariants hold across the config trio", () => {
  const config = json("config.json");
  const fabric = json("fabric.json");
  const settings = json("settings.json");
  assert.equal(config.role_routes.review.model, "makora/zai-org/GLM-5.2-NVFP4");
  assert.equal(config.role_routes.review.thinking, "medium");
  // No small-model lanes: explore/scout/review/debug route to GLM.
  assert.equal(config.dispatch.small_model_lanes, undefined);
  assert.deepEqual(config.dispatch.implementation_models, [
    "makora/zai-org/GLM-5.2-NVFP4",
    "umans/umans-glm-5.2",
  ]);
  // GLM implementation pool: 6 Makora + 2 Umans = 8 writable seats; Fabric ceiling matches.
  const pool = config.dispatch.implementation_pool;
  assert.equal(pool.makora, 6);
  assert.equal(pool.umans, 2);
  assert.equal(config.dispatch.max_parallel_workflow_agents, fabric.subagents.maxConcurrent);
  assert.equal(config.dispatch.max_parallel_workflow_agents, pool.makora + pool.umans);
  assert.equal(fabric.subagents.maxConcurrent, 8);
  assert.equal(fabric.subagents.extensions, true);
  assert.equal(fabric.subagents.maxDepth, 1);
  assert.equal(
    fabric.subagents.transport,
    "auto",
    "auto transport selects LocalTerm first and retains tmux/screen/process fallback",
  );
  assert.equal(config.coordination.mesh_topic_prefix, "fabric-pi-");
  assert.equal(config.coordination.board_key_prefix, "fabric-pi/");
  assert.deepEqual(config.team_mode.phase_order, [
    "research",
    "plan",
    "implement",
    "verify",
    "review",
    "integrate",
    "goal",
  ]);
  assert.deepEqual(config.team_mode.required_roles.research.routes, ["explore", "scout"]);
  assert.equal(config.team_mode.required_roles.implement.maximum, 8);
  assert.equal(config.team_mode.review_payload_limit_chars, 800000);
  assert.deepEqual(config.team_mode.research_evidence_tools, [
    "codex_search",
    "context7",
    "grepsearch",
  ]);
  // Conversing-actor mechanism config block (live capability; crew checkpoints stay dead).
  assert.deepEqual(config.actors.default_topics, []);
  assert.ok(settings.enabledModels.includes("claude-bridge/claude-haiku-4-5"));
  const budgets = config.dispatch.token_budgets;
  const lanes = ["implementation", "review", "research"];
  for (const lane of lanes) assert.equal(budgets[lane], 0, `${lane}: 0 means unlimited`);
  assert.match(budgets.policy, /unlimited/);
  const backstop = fabric.subagents.maxTokensPerChild;
  assert.ok(
    backstop === 0 || backstop >= Math.max(...lanes.map((lane) => budgets[lane])),
    "backstop is 0 (unlimited, operator decision 2026-07-18) or covers the largest advisory lane budget",
  );
  const referenced = new Set([
    fabric.subagents.model,
    ...config.dispatch.implementation_models,
    ...Object.values(config.role_routes).map((route) => route.model),
  ]);
  for (const model of referenced)
    assert.ok(settings.enabledModels.includes(model), `referenced model must be enabled: ${model}`);
  assert.deepEqual(config.coordination.board_states, [
    "assigned",
    "running",
    "returned",
    "verified",
    "failed",
  ]);
  assert.ok(config.dispatch.retry_policy.max_retries_per_task >= 1);
});

test("substantive coding requires visible team dispatch", () => {
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  for (const text of [agents]) {
    assert.match(text, /non-trivial multi-step coding task/);
    assert.match(text, /[`/]team/);
    assert.match(text, /spawn bounded Fabric agents/);
    assert.match(text, /announce/);
    assert.match(text, /read-only analysis .{0,40}stays direct/);
    assert.match(text, /edits delegate to the GLM pool/);
  }
});

test("Codex search is pinned project-locally and granted only to the scout research route", () => {
  const settings = json("settings.json");
  const config = json("config.json");
  assert.ok(settings.packages.includes("npm:pi-codex-search@0.1.5"));
  // The npm package cache exists only after Pi loads the project; skip on a pristine clone.
  if (existsSync(join(root, "npm")))
    assert.ok(existsSync(join(root, "npm", "node_modules", "pi-codex-search", "package.json")));
  assert.ok(config.role_routes.scout.tools.includes("codex_search"));
  for (const [name, route] of Object.entries(config.role_routes)) {
    if (name !== "scout" && Array.isArray(route.tools))
      assert.ok(!route.tools.includes("codex_search"), `${name}: codex_search is scout-only`);
  }
  const scout = readFileSync(join(root, "agents", "scout.md"), "utf8");
  assert.match(scout, /codex_search/);
  assert.match(scout, /existing openai-codex login/);
});

test("the nine lifecycle commands plus project team prompt exist", () => {
  for (const name of ["audit", "create", "fix", "gc", "init", "plan", "research", "ship", "verify"])
    assert.ok(existsSync(join(root, "prompts", `${name}.md`)));
  assert.ok(existsSync(join(root, "prompts", "team.md")));
  assert.equal(
    readdirSync(join(root, "prompts")).filter((name) => name.endsWith(".md")).length,
    10,
  );
});

test("skill registry: every cataloged path exists and manifest tiers are complete", () => {
  const registry = json("skill-adaptations.json");
  const adapted = new Set(Object.keys(registry.adapted));
  const added = new Set(Object.keys(registry.added ?? {}));
  const targetRoot = join(root, "skills");

  // Every adapted and added registry path exists locally.
  for (const rel of [...adapted, ...added])
    assert.ok(existsSync(join(targetRoot, rel)), `registry path must exist: ${rel}`);

  // Every SKILL.md directory is cataloged exactly once in the manifest
  // tiers. The manifest owns whole-static-surface integrity; the test
  // derives the directory set from the filesystem rather than hardcoding it.
  const manifest = JSON.parse(readFileSync(join(targetRoot, "manifest.json"), "utf8"));
  const tierSkills = [];
  for (const tier of Object.values(manifest.tiers)) tierSkills.push(...tier.skills);
  assert.equal(
    tierSkills.length,
    new Set(tierSkills).size,
    "each skill cataloged once across tiers",
  );
  const skillMdDirs = new Set(
    readdirSync(targetRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(targetRoot, d.name, "SKILL.md")))
      .map((d) => d.name),
  );
  assert.deepEqual(
    [...new Set(tierSkills)].sort(),
    [...skillMdDirs].sort(),
    "manifest tiers catalog every SKILL.md directory exactly once",
  );
});

test("adapted skills contain no active legacy artifact or task-tool bindings", () => {
  const registry = json("skill-adaptations.json");
  for (const relative of Object.keys(registry.adapted)) {
    const text = readFileSync(join(root, "skills", relative), "utf8");
    assert.doesNotMatch(
      text,
      /[.]opencode[/]artifacts|TodoWrite|Task tool [(]general-purpose[)]/,
      relative,
    );
  }
});

test("skill helpers and MCP launchers use portable Pi contracts", () => {
  for (const name of ["chrome-devtools", "playwright", "supabase"]) {
    const config = JSON.parse(readFileSync(join(root, "skills", name, "mcp.json"), "utf8"));
    for (const server of Object.values(config)) {
      assert.equal(typeof server.command, "string");
      assert.ok(Array.isArray(server.args));
      assert.ok(Array.isArray(server.includeTools));
    }
  }
  for (const name of ["brave-search", "browser-tools"]) {
    const pkg = JSON.parse(readFileSync(join(root, "skills", name, "package.json"), "utf8"));
    assert.equal(pkg.private, true);
    assert.ok(Object.keys(pkg.dependencies).length > 0);
  }
  const client = readFileSync(join(root, "extensions", "skill-mcp", "client.ts"), "utf8");
  assert.doesNotMatch(client, /skill[(][)]/);
  assert.match(client, /resolveConfigEnv/);
  assert.match(client, /shell: false/);
});

test("project guard explicitly leaves Fabric-native tools to Fabric", () => {
  const guard = readFileSync(join(root, "extensions", "guard.ts"), "utf8");
  assert.match(guard, /FABRIC_TOOL_NAMES = new Set\(\["fabric_exec"\]\)/);
  assert.match(guard, /if \(isFabricTool\(event[.]toolName\)\) return/);
  assert.doesNotMatch(guard, /command[.]includes\(["'`]fabric/);
});

test("active extensions use Pi APIs, not legacy runtime imports", () => {
  for (const name of [
    "diagnostics.ts",
    "diagnostics/core.ts",
    "diagnostics/formatting.ts",
    "diagnostics/planning.ts",
    "diagnostics/types.ts",
    "guard.ts",
    "quality-gate.ts",
    "research-tools.ts",
    "skill-mcp/index.ts",
  ]) {
    const text = readFileSync(join(root, "extensions", name), "utf8");
    assert.doesNotMatch(text, /@opencode-ai|[.]opencode/);
  }
  const diag = readFileSync(join(root, "extensions", "diagnostics.ts"), "utf8");
  const diagPlanning = readFileSync(join(root, "extensions", "diagnostics", "planning.ts"), "utf8");
  assert.match(diag, /createAutoGate/);
  assert.match(diag, /--no-install/);
  assert.match(diag, /CONFIG_DIR_NAME/);
  assert.match(diag, /runtime", "diagnostics-tools/);
  assert.match(diag, /relative\(ctx[.]cwd, absoluteFile\)/);
  assert.match(diagPlanning, /safe mode never downloads/);
  assert.doesNotMatch(diagPlanning, /["']npx["']/);
});

test("generated-profile duplicates are absent from the active tree", () => {
  for (const name of ["guide", "implement", "resume", "status", "validate"])
    assert.equal(existsSync(join(root, "prompts", `${name}.md`)), false);
  for (const name of [
    "fabric-exec",
    "fabric-loop",
    "fabric-memory",
    "fabric-planning",
    "fabric-roles",
    "fabric-state",
    "mesh-coordination",
    "seed-conventions",
  ])
    assert.equal(existsSync(join(root, "skills", name)), false);
  for (const name of ["bridge", "deliberator", "implementer", "planner", "verifier"])
    assert.equal(existsSync(join(root, "agents", `${name}.md`)), false);
  for (const name of ["bootstrap-profile.mjs", "bundle-profile.mjs", "smoke-profile.mjs"])
    assert.equal(existsSync(join(root, "scripts", name)), false);
  assert.equal(existsSync(join(root, "extensions", "profile-doctor.ts")), false);
  assert.equal(existsSync(join(root, "V4-PLAN.md")), false);
});

test("reasoning roles never implement (Sol/Fable/Opus-when-reasoning are read-only)", () => {
  const config = json("config.json");
  const routes = config.role_routes;
  const writeTools = new Set(["edit", "write", "bash"]);
  for (const [name, route] of Object.entries(routes)) {
    const tools = route.tools;
    if (!tools) continue; // build carries no explicit tool list (primary role)
    const hasWrite = tools.some((t) => writeTools.has(t));
    if (name === "general") assert.ok(hasWrite, "general must retain edit/write/bash");
    else assert.ok(!hasWrite, name + " must not hold write tools (read-only tier)");
  }
  // plan runs Claude Opus; review and debug route to GLM (openai-codex is unprovisioned here).
  assert.deepEqual(routes.plan.tools, ["read", "grep", "find", "ls"], "plan");
  assert.equal(routes.plan.model, "claude-bridge/claude-opus-4-8", "plan");
  for (const name of ["review", "debug"]) {
    assert.deepEqual(routes[name].tools, ["read", "grep", "find", "ls"], name);
    assert.equal(routes[name].model, "makora/zai-org/GLM-5.2-NVFP4", name + " routes to GLM");
  }
  assert.equal(config.dispatch.implementation_route, "general");
  assert.equal(config.dispatch.reasoning_never_implements, true);
  const implModels = config.dispatch.implementation_models;
  for (const m of ["claude-bridge/claude-fable-5", "claude-bridge/claude-opus-4-8"])
    assert.ok(
      !implModels.includes(m),
      "reasoning model " + m + " must not be in implementation_models",
    );
  assert.deepEqual(routes.general.tools, ["read", "grep", "find", "ls", "edit", "write", "bash"]);
});

test("agent route contracts restate model, thinking, and tool authority from config", () => {
  const config = json("config.json");
  // Every route contract restates the config model (config stays authoritative).
  for (const [name, route] of Object.entries(config.role_routes)) {
    const text = readFileSync(join(root, route.contract.replace(/^\.pi\//, "")), "utf8");
    assert.match(
      text,
      new RegExp(esc(route.model)),
      `${name}: contract names model ${route.model}`,
    );
    assert.match(
      text,
      new RegExp(`\\b${route.thinking}\\b`),
      `${name}: contract names thinking ${route.thinking}`,
    );
    if (Array.isArray(route.tools)) {
      if (route.tools.includes("bash")) {
        assert.match(text, /\bbash\b/, `${name}: implementation contract grants bash`);
      } else {
        assert.match(text, /read-only/, `${name}: read-only contract`);
        assert.match(
          text,
          /`read`[\s\S]{0,60}`grep`[\s\S]{0,60}`find`[\s\S]{0,60}`ls`/,
          `${name}: states the read tool set`,
        );
      }
    }
  }
  // Explicit spot checks called out by the profile.
  const explore = readFileSync(join(root, "agents", "explore.md"), "utf8");
  assert.match(explore, /read-only/, "explore: read-only");
  assert.doesNotMatch(
    explore,
    /\bbash\b/,
    "explore: no bash granted (route allow-list grants no shell)",
  );
  assert.match(explore, /No shell/, "explore: explicitly denies shell");
  for (const name of ["plan", "review", "debug"]) {
    const text = readFileSync(join(root, "agents", `${name}.md`), "utf8");
    assert.match(text, /\bmedium\b/, `${name}: medium thinking`);
    assert.match(text, /read-only/, `${name}: read-only`);
  }
});

test("skill policy requires named skills per brief and loads nothing implicitly", () => {
  const config = json("config.json");
  const policy = config.dispatch.skill_policy;
  assert.equal(policy.required_skills_field, "required_skills");
  assert.equal(policy.every_brief_must_carry, true);
  assert.equal(policy.allow_empty, true);
  assert.match(
    policy.role_defaults,
    /no skill loads implicitly|loaded by default/i,
    "role_defaults states no implicit skill loading",
  );
  assert.equal(
    policy.unknown_skill_action.split(":")[0].trim(),
    "reject",
    "unknown skills are rejected, not spawned",
  );
  // Leaf restrictions union the operator hard-exclusion set with manifest interactive skills.
  assert.deepEqual(config.dispatch.leaf_excluded_skills.skills, ["grill-me", "grill-with-docs"]);
  const manifest = JSON.parse(readFileSync(join(root, "skills", "manifest.json"), "utf8"));
  assert.ok(
    manifest.primary_only.interactive.includes("brainstorming"),
    "manifest identifies brainstorming as primary-only interactive",
  );
});

test("brainstorming is primary-session-only and gates commits on operator confirmation", () => {
  const bs = readFileSync(join(root, "skills", "brainstorming", "SKILL.md"), "utf8");
  assert.match(bs, /primary-session-only/, "brainstorming runs primary-session-only");
  assert.match(
    bs,
    /Operator-confirmation gate before any commit/,
    "brainstorming gates commits on operator confirmation",
  );
  assert.match(
    bs,
    /do not commit the spec until the explicit operator has confirmed/,
    "spec commit waits for explicit operator confirmation",
  );
  // A leaf that needs brainstorming reports a blocker instead of running the interview.
  assert.match(bs, /reports a blocker/, "leaves escalate brainstorming as a blocker");
});

test("worker-result envelope keeps four required fields and adds optional versioned fields", () => {
  const schema = JSON.parse(readFileSync(join(root, "schemas", "worker-result.json"), "utf8"));
  assert.deepEqual([...schema.required].sort(), [
    "changed_paths",
    "checks_run",
    "status",
    "stop_reason",
  ]);
  const versioned = [
    "schema_version",
    "run_id",
    "unit_id",
    "attempt",
    "owned_paths",
    "result_refs",
    "timestamps",
  ];
  for (const f of versioned) {
    assert.ok(f in schema.properties, `versioned field present: ${f}`);
    assert.ok(!schema.required.includes(f), `versioned field stays optional: ${f}`);
  }
});

test("/team prompt binds the operator goal safely and dispatches a 6-makora-then-umans GLM wave", () => {
  const team = readFileSync(join(root, "prompts", "team.md"), "utf8");
  // frontmatter argument-hint for the goal argument
  assert.match(team, /^argument-hint:\s*"<goal>"/m, "team carries an argument-hint for <goal>");
  // exactly one $ARGUMENTS occurrence (the operator goal is supplied once)
  assert.equal((team.match(/\$ARGUMENTS/g) || []).length, 1, "exactly one $ARGUMENTS occurrence");
  // named strings, not manual interpolation / placeholders
  assert.match(team, /π\.goal\b/, "team reads the goal as the π.goal named string");
  assert.match(team, /π\.goalCheck/, "team reads the predicate as the π.goalCheck named string");
  assert.match(team, /never hand-pastes/, "team forbids hand-pasting the goal");
  assert.match(
    team,
    /no unsafe raw argument interpolation/,
    "team forbids unsafe raw interpolation",
  );
  // required_skills are resolved and attached to implementation briefs
  assert.match(team, /required_skills/, "team resolves required_skills before dispatch");
  // shell checks use object-form pi.bash (no raw string interpolation)
  assert.match(team, /pi\.bash\(\s*\{/, "team uses object-form pi.bash");
  // 6-makora-then-umans balance for the GLM wave (provider-pinned pool)
  assert.match(
    team,
    /PROVIDER_CAP = \{ makora: 6, umans: 2 \}/,
    "provider caps: 6 makora + 2 umans",
  );
  assert.match(team, /m < PROVIDER_CAP[.]makora/, "first six workers makora");
  assert.match(team, /n < PROVIDER_CAP[.]umans/, "balance umans");
});

test("/team mechanically requires research, addressed mesh peers, and same-cycle role receipts", () => {
  const team = readFileSync(join(root, "prompts", "team.md"), "utf8");
  for (const pattern of [
    /schema: workerSchema/,
    /runResearchWave/,
    /successfulResearchTools/,
    /tool_execution_end/,
    /isError.*false/,
    /safeRunLog/,
    /verifySeat/,
    /reviewResults/,
    /mesh[.]publish/,
    /cross-review/,
    /PROVIDER_LANES/,
    /agents[.]run/,
    /PHASE_DEPS/,
    /recordEvidence/,
    /requireEvidence/,
    /missing required_skills/,
    /JSON[.]parse[(]line[)]/,
    /REVIEW_PAYLOAD_LIMIT/,
    /review-payload-too-large/,
    // durable state ledger
    /ledgerTransition/,
    /state[.]transition/,
    // schema-transaction integration + rollback
    /schema[.]hypothesize/,
    /schema[.]verify/,
    /schema[.]commit/,
    /restoreOps/,
    // governed dispatch
    /runGoverned/,
    /agents[.]spawn/,
    /agents[.]wait/,
    /agents[.]steer/,
    // skill resolution enforcement
    /function resolveSkills/,
    /unknown skill [(]reject, do not spawn[)]/,
    /leaf-denied skill/,
  ])
    assert.match(team, pattern);

  // Lifecycle order: research -> Main-authored plan -> implement -> primary gate ->
  // GLM 6+2 cross-review wave -> schema integration -> goal check (no Sol/Opus gate).
  const research = team.indexOf("researchReceipt = await runResearchWave(cycle)");
  // Main authors the plan from the discover-wave reports and writes it to
  // .pi/artifacts/<slug>/plan.json; the implement phase reads that file (no π.plan).
  const plan = team.indexOf("units = extractUnits(");
  const implement = team.indexOf("const done = await implementWave(units)");
  const gate = team.indexOf("gate.push(await gateWorker(d))");
  const review = team.indexOf("const reviewResults = []");
  const integrate = team.indexOf("await recordEvidence('integrate'");
  const goal = team.indexOf("const g = await tools.call({ ref: 'state.checkGoal'");
  assert.ok(research >= 0 && plan > research && implement > plan && gate > implement);
  assert.ok(review > gate, "GLM cross-review wave runs after the primary gate");
  assert.ok(
    integrate > review && goal > integrate,
    "integration and goal follow the cross-review wave",
  );
  assert.match(team, /integration-failed[\s\S]{0,300}break/);
  assert.match(team, /const TOTAL_BUDGET = 0/);
  assert.doesNotMatch(team, /TOTAL_BUDGET = 4_000_000/);
});

test("/team fails closed across command, path, diff, peer-review, and goal boundaries", () => {
  const team = readFileSync(join(root, "prompts", "team.md"), "utf8");
  for (const pattern of [
    /π[.]verifyAllowlist/,
    /mustAllow[(]GOAL_CHECK/,
    /worktree:\s*worktree === true/,
    /result[.]worktree/,
    /deriveActualChanges/,
    /normalizeRepoPath/,
    /rejected change type/,
    /changed_paths size mismatch/,
    /parseGate[(]res[.]text/,
  ])
    assert.match(team, pattern);
  // GLM cross-review wave gates before integration (no Sol/Opus peer gate).
  const reviewWave = team.indexOf("const reviewResults = []");
  const verifyOk = team.indexOf("const verifyOk = reviewResults.every");
  const integrate = team.indexOf("await recordEvidence('integrate'");
  const goalCheck = team.indexOf("const g = await tools.call({ ref: 'state.checkGoal'");
  assert.ok(reviewWave >= 0 && verifyOk > reviewWave, "cross-review wave produces a verify gate");
  assert.ok(
    integrate > verifyOk && goalCheck > integrate,
    "integration follows a passing cross-review wave",
  );
  assert.match(team, /checkpoint-required/);
});

test("all lifecycle prompts use current routes and safe dispatch/action bindings", () => {
  const names = ["audit", "create", "fix", "gc", "init", "plan", "research", "ship", "verify"];
  for (const name of names) {
    const text = readFileSync(join(root, "prompts", name + ".md"), "utf8");
    // No prompt carries the obsolete 6-pool sizing.
    assert.doesNotMatch(text, /Makora 6 pool|at most 6 concurrent/, name + ": no old pool");
  }
  // The GLM 6+2 topology (8 seats) is stated by the prompts that own dispatch.
  for (const name of ["gc", "ship", "team"]) {
    const text = readFileSync(join(root, "prompts", name + ".md"), "utf8");
    assert.match(text, /6 Makora \+ 2 Umans/, name + ": states the 6 Makora + 2 Umans topology");
  }
  // Prompts that resolve role routes from config reference route.contract, load
  // no skill implicitly, and spawn custom-provider children with extensions.
  for (const name of ["audit", "init", "research", "team", "verify"]) {
    const text = readFileSync(join(root, "prompts", name + ".md"), "utf8");
    assert.match(text, /route[.]contract/, name + ": resolves route contract from config");
    assert.match(
      text,
      /required_skills: \[\] [(]load no skill[)]/,
      name + ": loads no skill implicitly",
    );
    assert.match(
      text,
      /extensions:\s*true/,
      name + ": custom-provider children spawn with extensions",
    );
  }
  // gc scans the canonical profile surfaces.
  const gc = readFileSync(join(root, "prompts", "gc.md"), "utf8");
  for (const path of [".pi/extensions", ".pi/prompts", ".pi/skills"])
    assert.match(gc, new RegExp(esc(path)));
  assert.doesNotMatch(
    gc,
    /required_skills:\s*\[\],\s*\/\//,
    "required_skills belongs in the task, not FabricAgentRequest",
  );
  // ship gates every external action on operator authorization.
  const ship = readFileSync(join(root, "prompts", "ship.md"), "utf8");
  assert.match(ship, /No automatic commits/);
  assert.match(ship, /explicit operator authorization naming the exact action/);
  assert.match(ship, /named Git\/action options/);
  assert.doesNotMatch(ship, /Per-task commits required|Commit — per-task commit/);
});

test("audit and research run governed read-only fan-out; ship is a thin router that delegates and ledgers", () => {
  // ship is a thin router: delegates execution to /team and verification to /verify,
  // records durable ledger receipts, but performs no dispatch/transaction itself.
  const ship = readFileSync(join(root, "prompts", "ship.md"), "utf8");
  const shipCode = programCode(ship);
  assert.match(ship, /\/team/, "ship: delegates execution to /team");
  assert.match(ship, /\/verify/, "ship: delegates verification to /verify");
  assert.match(shipCode, /state[.]transition/, "ship: records durable ledger transitions");
  assert.match(shipCode, /ledgerReceipt/, "ship: ledger receipts");
  assert.doesNotMatch(
    shipCode,
    /agents[.]spawn|agents[.]status|agents[.]steer|agents[.]wait|waitGoverned|worktree: true|schema[.]hypothesize|schema[.]verify|schema[.]commit|runGoverned|implementWave/,
    "ship: thin router — no wave engine / no direct execution in code",
  );
  // audit and research run governed read-only fan-out (agents.spawn + status poll + steer).
  for (const name of ["audit", "research"]) {
    const text = readFileSync(join(root, "prompts", name + ".md"), "utf8");
    for (const pattern of [
      /agents[.]spawn/,
      /agents[.]status/,
      /agents[.]steer/,
      /agents[.]wait/,
      /waitGoverned/,
      /status !== ['"]completed['"]/,
      /spawnLeaf/,
    ])
      assert.match(text, pattern, name + ": " + pattern);
    assert.doesNotMatch(
      text,
      /schema[.]commit|worktree: true/,
      name + ": read-only fan-out never transacts or takes worktrees",
    );
  }
});

test("audit and research bind real named inputs and return nonempty fan-out evidence", () => {
  const audit = readFileSync(join(root, "prompts", "audit.md"), "utf8");
  assert.match(audit, /π[.]pattern/);
  assert.match(audit, /return { pattern, discovery/);
  assert.ok(!audit.includes("PATTERN_FROM_ARGUMENTS"));
  assert.ok(!audit.includes("const clusters = []"));

  const research = readFileSync(join(root, "prompts", "research.md"), "utf8");
  assert.match(research, /π[.]question/);
  assert.match(research, /π[.]angles/);
  assert.match(research, /return { question, findings/);
  for (const placeholder of [
    "TOPIC_FROM_ARGUMENTS",
    "const angles = []",
    "<the aggregated Phase 1 reports>",
  ])
    assert.ok(!research.includes(placeholder), "research placeholder removed: " + placeholder);
});

test("lifecycle prompts that dispatch contain executable Fabric programs", () => {
  // plan.md is a pure planning prompt (no fabric_exec program); the other nine
  // lifecycle prompts each contain an executable Fabric program.
  const names = ["audit", "create", "fix", "gc", "init", "research", "ship", "team", "verify"];
  for (const name of names) {
    const text = readFileSync(join(root, "prompts", name + ".md"), "utf8");
    assert.match(text, /fabric_exec/, name + ": names the Fabric execution surface");
    const blocks = [...text.matchAll(/```typescript\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    const programs = blocks.filter((code) => /(?:pi[.]|tools[.]call|π[.])/.test(code));
    assert.ok(programs.length > 0, name + ": contains a Pi/Fabric TypeScript program");
    for (const [index, code] of programs.entries())
      assert.doesNotThrow(
        () =>
          new Function(
            "pi",
            "tools",
            "π",
            "skill",
            "question",
            "write",
            "return async function () {\n" + code + "\n}",
          ),
        name + ": program " + (index + 1) + " parses as an async function",
      );
  }
});

test("fix is a thin router that delegates repair to /team with a verified command", () => {
  const fix = readFileSync(join(root, "prompts", "fix.md"), "utf8");
  const fixCode = programCode(fix);
  // Delegates repair to /team with a verify command.
  assert.match(fix, /Thin router/, "fix: thin router into /team");
  assert.match(fixCode, /route: '\/team'/, "fix: routes repair to /team");
  assert.match(fixCode, /verifyCommand/, "fix: carries a verify command");
  // Uses π named strings (no raw argument interpolation into a shell string).
  assert.match(fixCode, /π[.]/, "fix: reads named strings");
  assert.match(
    fix,
    /shell control operators are not allowed/,
    "fix: rejects shell control operators in the verify command",
  );
  // Thin router: no wave engine, no transaction, no dispatch in code.
  assert.doesNotMatch(
    fixCode,
    /agents[.]spawn|agents[.]status|agents[.]steer|agents[.]wait|waitGoverned|worktree: true|schema[.]hypothesize|schema[.]verify|schema[.]commit|state[.]transition|ledgerReceipt|runGoverned|implementWave|spawnLeaf/,
    "fix: thin router — no engine/dispatch/transaction in code",
  );
});

test("verify runs governed read-only fan-out; gc is non-mutating and proposes cleanup units", () => {
  // verify: governed read-only fan-out (agents.spawn + status poll + steer); primary synthesizes.
  const verify = readFileSync(join(root, "prompts", "verify.md"), "utf8");
  for (const pattern of [
    /agents[.]spawn/,
    /agents[.]status/,
    /agents[.]steer/,
    /agents[.]wait/,
    /waitGoverned/,
    /status !== ['"]completed['"]/,
    /spawnLeaf/,
    /primary synthesizes/,
  ])
    assert.match(verify, pattern, "verify: " + pattern);
  assert.doesNotMatch(
    verify,
    /schema[.]commit|worktree: true/,
    "verify: read-only fan-out never transacts or takes worktrees",
  );

  // gc: NON-MUTATING — no dispatch, no worktree, no transaction, no file write.
  // Asserts the proposal/units shape instead of an engine.
  const gc = readFileSync(join(root, "prompts", "gc.md"), "utf8");
  const gcCode = programCode(gc);
  assert.doesNotMatch(
    gcCode,
    /agents[.]spawn|agents[.]status|agents[.]steer|agents[.]wait|waitGoverned|worktree: true|schema[.]commit|schema[.]hypothesize|pi[.]write|spawnLeaf/,
    "gc: non-mutating — no dispatch/transaction/write in code",
  );
  assert.doesNotMatch(gcCode, /QUALITY[.]md/, "gc: no QUALITY.md write in code");
  assert.match(gc, /primary synthesizes/, "gc: primary synthesizes");
  assert.match(gc, /PROPOSAL only/, "gc: report is a proposal only");
  assert.match(gc, /"units"/, "gc: proposes structured cleanup units");
  assert.match(gc, /"ownedPaths"/, "gc: units carry owned paths");
  assert.match(gc, /"tag"/, "gc: units carry a tag");
});

test("create writes spec and tasks artifacts with ledger receipts", () => {
  const create = readFileSync(join(root, "prompts", "create.md"), "utf8");
  for (const pattern of [
    /pi[.]write/,
    /state[.]transition/,
    /ledgerReceipt/,
    /spec-write/,
    /tasks-write/,
  ])
    assert.match(create, pattern, "create: " + pattern);
  assert.doesNotMatch(create, /agents[.]spawn|schema[.]commit|worktree: true/);
});

test("every workflow binds general-only implementation, current models, canonical board states, no legacy paths, and an external-action guard", () => {
  const workflowDir = join(root, "workflows");
  const workflows = readdirSync(workflowDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  assert.equal(workflows.length, 5, "exactly five workflows");
  const implWorkflows = new Set([
    "batch-implement.md",
    "development-lifecycle-workflow.md",
    "garbage-collection.md",
  ]);
  const readOnlyWorkflows = new Set(["audit-pattern.md", "deep-research.md"]);
  for (const name of workflows) {
    const text = readFileSync(join(workflowDir, name), "utf8");
    // general is the named implementation route
    assert.match(text, /general/, `${name}: names general as the implementation route`);
    // current model fleet: GLM lanes carry implementation and read-only routes;
    // openai-codex is unprovisioned and retired from the fleet
    assert.match(text, /makora\/zai-org\/GLM-5.2-NVFP4/, `${name}: makora GLM 5.2`);
    assert.match(text, /umans\/umans-glm-5.2/, `${name}: umans GLM 5.2`);
    assert.doesNotMatch(text, /openai-codex\/gpt-5\.[46]/, `${name}: no retired codex lanes`);
    // canonical board-state chain on a single line
    assert.match(
      text,
      /assigned[^\n]*running[^\n]*returned[^\n]*verified[^\n]*failed/,
      `${name}: canonical board states`,
    );
    // no legacy paths or obsolete 6-pool sizing
    assert.doesNotMatch(
      text,
      /[.]opencode|Makora 6 pool|at most 6 concurrent|6 per wave/,
      `${name}: no legacy paths or 6-pool sizing`,
    );
    // external-action guard: implementation workflows require operator confirmation;
    // read-only fan-out workflows never dispatch an implementation route directly.
    if (implWorkflows.has(name)) {
      assert.match(text, /without operator confirmation/, `${name}: external-action guard`);
    } else {
      assert.ok(readOnlyWorkflows.has(name), `${name}: classified read-only`);
      assert.doesNotMatch(
        text,
        /@general|@build/,
        `${name}: read-only workflow does not implement`,
      );
    }
  }
  // deep-research is a primary-brokered workflow: the primary brokers evidence
  // into scout briefs rather than scouts performing arbitrary web retrieval.
  const deep = readFileSync(join(workflowDir, "deep-research.md"), "utf8");
  assert.match(deep, /primary brokers/, "deep-research: primary brokers scout evidence");
});
