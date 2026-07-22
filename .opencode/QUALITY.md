# Quality Grades

Tracks structural health of each domain in the template. Updated by `/gc` and manual audit.

## Scale

| Grade | Meaning |
|---|---|
| **A** | No issues. Well-maintained. |
| **B** | Minor issues. No blockers. |
| **C** | Notable decay. Needs cleanup. |
| **D** | Significant decay. Priority cleanup. |
| **—** | Not yet assessed. |

## Current Grades

| Domain | Grade | Last Checked | Issues |
|---|---|---|---|---|
| Plugins (`.opencode/plugin/`) | B | 2026-06-08 | Bundled opencode plugins exceed 300-line limit (6 files) — vendor code, not template |
| Commands (`.opencode/command/`) | C | 2026-06-08 | 4 commands exceed 200-line limit: create.md(256), init.md(313), plan.md(406), ship.md(498) |
| Skills (`.opencode/skill/`) | B | 2026-06-08 | No structural issues detected |
| Docs (`.opencode/artifacts/MEMORY.md`) | A | 2026-07-08 | 1 file, clean |
| Workflows (`.opencode/workflows/`) | B | 2026-06-08 | No structural issues detected |
| Configuration (`.opencode/opencode.json`) | A | 2026-06-08 | Valid JSON, clean |

## How to Update

Run `/gc` to auto-grade each domain based on Fallow analysis and structural checks.
Manual updates: edit this file and record the reason in the Changelog below.

## Changelog

| Date | Domain | Old | New | Reason |
|---|---|---|---|---|---|
| 2026-06-08 | All | — | Initial assessment | GC run: Fallow scan + structural check |
| — | — | — | — | Initial |
