# Common Patterns

Run TypeScript examples inside `fabric_exec` full-code mode.

## Pattern 1: Understanding Error Handling

```typescript
await pi.bash({cmd: "npx opensrc zod"});
const classes = await pi.grep({regex: "class.*Error", path: "opensrc", glob: "*.ts"});
const implementation = await pi.read("opensrc/repos/.../errors.ts");
const throwSites = await pi.grep({regex: "throw new", path: "opensrc", glob: "*.ts"});
```

## Pattern 2: Tracing Function Behavior

```typescript
await pi.bash({cmd: "npx opensrc react-hook-form"});
const definition = await pi.grep({regex: "export function useForm", path: "opensrc", glob: "*.ts"});
const implementation = await pi.read("opensrc/.../useForm.ts");
const dependencies = await pi.grep({regex: "import.*from", path: "opensrc/.../useForm.ts"});
```

## Pattern 3: Evaluating Library Quality

```typescript
await pi.bash({cmd: "npx opensrc candidate-library"});
const tests = await Promise.all([
  pi.find("*.test.ts", "opensrc"),
  pi.find("*.spec.ts", "opensrc")
]);
const usage = await pi.read("opensrc/.../feature.test.ts");
const TypeScriptConfigs = await pi.find("tsconfig.json", "opensrc");
const packageMetadata = await pi.read("opensrc/.../package.json");
```