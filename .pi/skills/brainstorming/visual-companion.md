# Visual Companion Guide

Browser-based companion for showing mockups, diagrams, and visual options during brainstorming. A tool, not a mode: accepting it means it's *available* for visual questions, not that every question goes through the browser.

This is a Pi-adapted port of the upstream superpowers visual companion. The Node server and shell scripts are vendored verbatim under `scripts/`; only the launch/interaction guidance is mapped to Pi.

## When to Use

Decide per-question, not per-session. The test: **would the user understand this better by seeing it than reading it?**

**Use the browser** when the content itself is visual: UI mockups/wireframes, architecture diagrams, side-by-side layout or color comparisons, design polish, spatial relationships (state machines, flowcharts, ER diagrams).

**Use the terminal** when the content is text or tabular: requirements/scope questions, conceptual A/B/C choices, tradeoff lists, technical decisions, clarifying questions. A question *about* a UI topic is not automatically a visual question — "What kind of wizard do you want?" is conceptual; "Which wizard layout feels right?" is visual.

## How It Works

The server watches a directory for HTML files and serves the newest one to the browser. You write HTML to `screen_dir`; the user sees it and can click options; selections are recorded to `state_dir/events` for your next turn. Content fragments (no `<!DOCTYPE`/`<html`) are auto-wrapped in a frame template; full documents are served as-is with the helper script injected.

## Starting a Session (Pi)

Offer the companion as its own message, only when a question is genuinely visual. On approval, start the server via `pi.bash`:

```ts
// fabric_exec: start the companion (backgrounds itself via nohup; returns JSON with url/screen_dir/state_dir)
const r = await pi.bash({
  cmd: '.pi/skills/brainstorming/scripts/start-server.sh --project-dir . --open'
});
// parse r.output JSON; save url, screen_dir, state_dir for the rest of the session
```

- `--project-dir .` persists mockups under `<repo>/.superpowers/brainstorm/`. Add `.superpowers/` to `.gitignore`. Pass any directory you prefer.
- `--open` auto-opens the browser on the first screen (skip on a headless host; instead share the returned `url`).
- **Always give the user the complete URL from the `url` field**, including the `?key=…` session key — never strip the query string. The key gates HTTP and WebSocket access.
- Remote/headless: add `--host 0.0.0.0 --url-host localhost` and reach it via SSH port-forward or tunnel.
- **Finding connection info** if you didn't capture stdout: the server writes startup JSON to `$STATE_DIR/server-info`; read it with `pi.read`.
- **Telemetry/branding note:** the vendored page injects an upstream logo fetched from `primeradiant.com` with the skill version. Suppress it by exporting `SUPERPOWERS_DISABLE_TELEMETRY=1` (or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`) before starting the server.

## The Loop

1. **Confirm the server is alive** before referring to the URL or pushing a screen: check that `$STATE_DIR/server-info` exists and `$STATE_DIR/server-stopped` does not. If it shut down (auto-exits after 4h idle), restart with the *same* `--project-dir` — it reuses the port and the user's open tab reconnects.
2. **Write HTML** to a new file in `screen_dir` via `pi.write` (semantic names: `platform.html`, `layout.html`; never reuse a filename; for iterations use `layout-v2.html`). The server serves the newest by mtime.
3. **Tell the user what to expect and end your turn:** restate the URL, summarize what's on screen, ask them to respond in the terminal ("Take a look and let me know; click to select if you'd like").
4. **Next turn** — read `state_dir/events` with `pi.read` (JSON lines of browser clicks; cleared on each new screen) and merge with the user's terminal text. The terminal message is primary; `events` adds structured interaction data. If `events` is absent, the user didn't interact in the browser.
5. **Iterate or advance** — if feedback changes the current screen, write a new version. Only move on when the current step is validated.
6. **Unload when returning to terminal** — push a waiting screen so the user isn't staring at a resolved choice:
   ```html
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">Continuing in terminal...</p>
   </div>
   ```
7. **Cleanup:** `pi.bash({cmd: '.pi/skills/brainstorming/scripts/stop-server.sh ' + sessionDir})`. Persistent (`--project-dir`) mockups are kept for later review; `/tmp` sessions are deleted on stop.

## Writing Content Fragments

Write just the content inside the page — the server wraps it in the frame template (header, theme CSS, connection status, interactive infrastructure).

```html
<h2>Which layout works better?</h2>
<p class="subtitle">Consider readability and visual hierarchy</p>
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>Single Column</h3><p>Clean, focused reading</p></div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content"><h3>Two Column</h3><p>Sidebar + main</p></div>
  </div>
</div>
```

## CSS Classes Available

- **Options (A/B/C):** `.options` > `.option[data-choice]` > `.letter` + `.content`. Multi-select: add `data-multiselect` to `.options`.
- **Cards:** `.cards` > `.card[data-choice]` > `.card-image` + `.card-body`.
- **Mockup:** `.mockup` > `.mockup-header` + `.mockup-body`.
- **Split:** `.split` > two `.mockup`.
- **Pros/Cons:** `.pros-cons` > `.pros` / `.cons` (each with `<h4>` + `<ul>`).
- **Wireframe blocks:** `.mock-nav`, `.mock-sidebar`, `.mock-content`, `.mock-button`, `.mock-input`, `.placeholder`.
- **Typography:** `h2` (page title), `h3` (section), `.subtitle`, `.section`, `.label`.

## Browser Events Format

`state_dir/events` (one JSON object per line; cleared on each new screen):

```jsonl
{"type":"click","choice":"a","text":"Option A - Simple Layout","timestamp":1706000101}
```

The full stream shows the exploration path; the last `choice` is typically the final selection, but the click pattern can reveal hesitation worth asking about.

## Reference

- Frame template / CSS: `scripts/frame-template.html`
- Client helper: `scripts/helper.js`
- Server: `scripts/server.cjs`