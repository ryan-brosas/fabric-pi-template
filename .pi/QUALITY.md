# Quality — OpenCode semantic port

## Current evidence

| Boundary | Result | Evidence |
|---|---|---|
| Source roles | PASS | Seven source agent contracts exist; all seven, the configured compaction support route, and the port-added `debug` route are declared (nine role routes total in `config.json`). |
| Source commands | PASS | All nine source command names exist under `.pi/prompts/`; the port-added `/team` lifecycle prompt is also present (ten prompt files total). |
| Source skills | PASS | 65 skill entrypoints under `.pi/skills/` (one `SKILL.md` per skill). Provenance is installed-template-safe: skills are installed from the source `.opencode/skill` set (`.pi/skill-adaptations.json` `source`), with 67 files registered as adapted (Pi runtime bindings only) and 10 added; unlisted files stay byte-identical to source per the file's `policy`. The source `.opencode/skill` directory is absent in-tree, so byte-identical-vs-source is not re-measured here; the entrypoint and adaptation counts above are what this pass verifies. |
| Plugin API | PASS | Active extensions contain no `@opencode-ai` imports or `.opencode` runtime paths. |
| Pi startup | PASS | `pi --approve --list-models` exits 0 and resolves the configured providers. |
| Codex web search | PASS (registration) | Pinned `npm:pi-codex-search@0.1.5` is installed project-locally; `/codex-search-settings status` reports `enabled=true`, `codex_search`, live freshness, high context, and standalone disabled. A live authenticated query remains behavioral acceptance. |
| Claude Bridge | PASS | Fable 5, Sonnet 5, and the newest installed Opus entry (4.8) are enabled for model cycling. |
| Guard/Fabric boundary | PASS | `fabric_exec` and Fabric-native tool names bypass the project guard; ordinary file and shell calls remain guarded. |
| JSON configuration | PASS | `settings.json`, `config.json`, and `fabric.json` parse. |
| Prompt/profile contracts | PASS | `node --test .pi/tests/profile-contracts.test.mjs` passes 23/23, including pinned Codex search, unlimited-token semantics, mandatory research, host-log evidence, addressed mesh actors, strict role ordering, existing trust boundaries, and source workflows. |
| Quality-pack tests | PASS | `node --test .pi/tests/quality-pack.test.mjs` passes 5/5, covering conflicts, EOF newlines, clean files, formatter unavailability, and non-Git use. |
| Diagnostics semantics | PASS (deterministic core) | `.pi/tests/diagnostics.test.mjs` passes 11/11: installed-only planning, full/changed Fallow arguments, language/file filters, mypy fallback, missing-tool skips, modern Fallow schemas, fail-closed unknown JSON, stable ordering, delimiter escaping, abort/timeout handling, config skips, and global debounce. Fresh-session fixture execution remains behavioral acceptance. |
| Structural check | PASS | `.pi/tools/structural-check.sh` completed with all six checks passing. |
| Manifest | PASS | Complete 606-file static surface regenerated; `scripts/verify-manifest.mjs` returned empty `missing`, `mismatch`, `unmanaged`, and `unsupported` arrays. |
| Fresh interactive behavior | OPERATOR PENDING | Exercise commands, guards, summary, diagnostics, and MCP in a fresh trusted session. |

## Acceptance rule

Static presence is not behavioral acceptance. Final acceptance requires:

1. structural and manifest checks pass;
2. a fresh trusted Pi session discovers exactly the intended active resources;
3. guard behavior is observed for one denied, one confirmation-required, and one allowed action;
4. prompt leverage transforms a substantive prompt but not slash commands;
5. session summary persists across reload/compaction;
6. diagnostics run on a fixture project;
7. one Context7, grep.app, or `codex_search` query succeeds when network access is available;
8. one skill-MCP server can list tools and disconnect cleanly.

The old generated v4 evidence is not evidence for this port.

**Status as of this documentation pass:** static release gates pass (23/23
profile contracts, 6/6 structural checks, and a zero-defect 606-file manifest).
Behavioral criteria 2–8 remain operator-pending and are not implied by static
success.
