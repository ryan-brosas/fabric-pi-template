import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const failures = [];
const pass = (condition, message) => {
  if (!condition) failures.push(message);
};

const settings = readJson("settings.json");
const config = readJson("config.json");
readJson("fabric.json");
const roles = [
  "build",
  "compaction",
  "debug",
  "explore",
  "general",
  "plan",
  "review",
  "scout",
  "vision",
];
const contractRoles = roles.filter((role) => role !== "compaction");
const commands = ["audit", "create", "fix", "gc", "init", "plan", "research", "ship", "verify"];
const bridgeModels = [
  "claude-bridge/claude-fable-5",
  "claude-bridge/claude-sonnet-5",
  "claude-bridge/claude-opus-4-8",
];
pass(config.profile.authority === "fabric-first", "config profile authority is not fabric-first");
pass(
  roles.every((role) => config.role_routes[role]),
  "one or more source roles are unmapped",
);
pass(
  contractRoles.every((role) => existsSync(join(root, "agents", `${role}.md`))),
  "one or more source role contracts are missing",
);
pass(
  commands.every((name) => existsSync(join(root, "prompts", `${name}.md`))),
  "one or more source commands are missing",
);
pass(config.dispatch.default === "direct", "source direct-first routing is not active");
pass(
  bridgeModels.every((model) => settings.enabledModels.includes(model)),
  "one or more requested Claude Bridge models are not enabled",
);
for (const route of Object.values(config.role_routes)) {
  if (route.model)
    pass(settings.enabledModels.includes(route.model), `route model not enabled: ${route.model}`);
}
const activeExtensions = [
  "diagnostics.ts",
  "guard.ts",
  "prompt-leverage.ts",
  "quality-gate.ts",
  "research-tools.ts",
  "session-summary.ts",
  "tui-bindings.ts",
  "skill-mcp/index.ts",
];
for (const name of activeExtensions) {
  const text = readFileSync(join(root, "extensions", name), "utf8");
  pass(
    !text.includes("@opencode-ai") && !text.includes(".opencode"),
    `legacy OpenCode runtime reference in ${name}`,
  );
}
if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    roles: roles.length,
    commands: commands.length,
    extensions: activeExtensions.length,
  }),
);
