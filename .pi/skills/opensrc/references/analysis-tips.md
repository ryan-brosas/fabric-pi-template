# Tips for Efficient Analysis

Run TypeScript examples inside `fabric_exec` full-code mode.

## 1. Start with Tests

Tests often show real-world usage better than docs:

```typescript
const tests = await pi.find("*.test.{ts,js}", "opensrc");
const example = await pi.read("opensrc/.../feature.test.ts");
```

## 2. Check Examples Directory

Many repos have `examples/` or `samples/`:

```typescript
const examples = await pi.find("*", "opensrc/.../examples");
```

## 3. Read CHANGELOG for Context

Understand recent changes:

```typescript
const changelog = await pi.read("opensrc/.../CHANGELOG.md");
```

## 4. Check TypeScript Definitions

Often more accurate than docs:

```typescript
const definitions = await pi.find("*.d.ts", "opensrc");
const publicTypes = await pi.read("opensrc/.../index.d.ts");
```

## 5. Use Blame for History (if needed)

```bash
cd opensrc/repos/github.com/owner/repo
git log --oneline -- src/file.ts
git show <commit>:src/file.ts
```