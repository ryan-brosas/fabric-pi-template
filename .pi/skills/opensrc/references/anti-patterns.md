# Anti-Patterns

## [ ] Don't: Fetch Entire Ecosystem

```bash
# Bad: Fetching everything
npx opensrc react
npx opensrc react-dom
npx opensrc react-router
npx opensrc react-query
# ... (too much code)
```

**Do:** Fetch only what you need to answer a specific question.

## [ ] Don't: Read Random Files

Inside `fabric_exec`, avoid unfocused reads:

```typescript
// Bad: reading without a search question
await pi.read("opensrc/.../index.ts");
await pi.read("opensrc/.../utils.ts");
await pi.read("opensrc/.../helpers.ts");
```

**Do:** Use `pi.grep` or `pi.find` to locate relevant code first, then read it.

## [ ] Don't: Ignore Version Mismatch

```bash
# Bad: Fetching latest when project uses old version
npx opensrc zod  # Fetches latest
# But project uses an older version with different behavior
```

**Do:** Specify the version matching the lockfile, or let opensrc auto-detect it.