---
name: chrome-devtools
description: Gives agents the ability to inspect, screenshot, and verify UI behavior using Chrome DevTools Protocol. Use for agent-legible UI verification — bug reproduction, visual validation, DOM inspection.
version: 1.0.0
tags: [ui, testing, browser, verification]
agent_types: [build, review, general]
tools: [bash, playwright, webclaw_scrape]
---

# Chrome DevTools — Agent-Legible UI Verification

Enables agents to verify UI behavior programmatically — the same way OpenAI's Harness team wires CDP into Codex for DOM snapshots, screenshots, and navigation.

## Prerequisites

- Playwright must be available: `npx playwright install chromium`
- The app must be bootable locally (dev server, vite, next dev, etc.)

## Usage

### 1. Launch App (per-task worktree or local dev)

```bash
# If using worktrees:
git worktree add ../review-{task-id} {branch}
cd ../review-{task-id}
npm install
npm run dev &
APP_PID=$!

# Or for local dev:
npm run dev &
APP_PID=$!
```

### 2. Take DOM Snapshot

```bash
npx playwright eval --browser chromium "document.documentElement.outerHTML"
```

### 3. Capture Screenshot

```bash
npx playwright screenshot --browser chromium http://localhost:5173 screenshot.png
```

### 4. Verify UI State

Use playwright script to check specific conditions:

```bash
cat > verify-state.mjs << 'SCRIPT'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173');

// Check element exists
const exists = await page.locator('[data-testid="submit-btn"]').count() > 0;

// Check text content
const text = await page.locator('h1').textContent();
console.log(JSON.stringify({ heading: text, buttonExists: exists }));

await browser.close();
SCRIPT
node verify-state.mjs
```

### 5. Reproduce Bug

Given a bug description, navigate to the page, interact, and capture the erroneous state:

```bash
npx playwright eval --browser chromium "..." 2>&1 | head -100
```

## When to Use

- After implementing UI changes, verify they render correctly
- Before shipping, verify critical user journeys
- When debugging UI bugs, reproduce and inspect DOM state
- Validating responsive behavior at different viewport sizes

## When NOT to Use

- For API-level testing (use curl or direct tests instead)
- For unit tests (use the testing framework directly)
- When the app isn't bootable locally

## Verification Contract

After any UI change, the agent should verify:

1. App boots without errors (no uncaught exceptions in console)
2. Key elements render with expected content
3. Interactive elements respond to user input
4. Error states display correctly when data/async fails

## Remediation

If UI verification fails:
1. Check the browser console for errors (see `console.error` calls)
2. Check if the app needs specific environment variables
3. Verify the correct port is being used
4. Check for JS errors from the page itself
