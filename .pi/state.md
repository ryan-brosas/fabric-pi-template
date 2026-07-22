---
schema_version: 1
initialization_status: partial
context_reload_required: true
generation_id: gen-2026-07-23-01
updated_at: 2026-07-23
agents_boilerplate_sha256: f03c114b4cf989e1fd713546e4b69ee0beb2e4776f71ee2920a051ae3f462df1
---

# Initialization State

Timestamped, non-authoritative snapshot of the Pi-native context packet. The
frontmatter is machine-readable; the body is a human summary. Authority lives in
`AGENTS.md` and `.pi/artifacts/pi-template/`.

## Status: partial

The `AGENTS.md` Repository appendix was edited (`.opencode/tech-stack.md` →
`.pi/tech-stack.md` per ADR-016). The managed boilerplate interior is unchanged
(appendix is outside the markers). Lifecycle commands that require a ready
packet must fail the packet gate until this state returns to `ready` with
`context_reload_required: false`.

`context_reload_required: true` — `AGENTS.md` changed; a post-`/reload`
`/init --refresh` with no managed-region drift is required before promotion
back to `ready`.

## Packet

| File | Status |
|---|---|
| `AGENTS.md` | established (managed boilerplate region, verbatim fixture) |
| `.pi/tech-stack.md` | seeded |
| `.pi/ROADMAP.md` | seeded (v1 grammar, 2 Ready + 1 Next + Later) |
| `.pi/user.md` | seeded (operator-approved preferences) |
| `.pi/memory.md` | seeded (durable knowledge + Initialization Intent) |
| `.pi/state.md` | this file (partial) |

## Boilerplate

- `agents_boilerplate_sha256`: `f03c114b4cf989e1fd713546e4b69ee0beb2e4776f71ee2920a051ae3f462df1` (SHA-256 of the `AGENTS.md` managed interior, between markers)
- Fixture: `.opencode/artifacts/pi-native-init/boilerplate.md`
- Managed region: `AGENTS.md` between markers `<!-- pi:init:boilerplate:start -->` and
  `<!-- pi:init:boilerplate:end -->` (byte-identical to the fixture).

## Generation

- `generation_id`: `gen-2026-07-23-01` (first seed generation)
- Intent record: `.pi/memory.md` `## Initialization Intent - gen-2026-07-23-01`

## Next

The pi-native-init lifecycle is implemented (P1.1–P8.3 complete). The packet is
currently `partial` pending an `AGENTS.md` appendix edit (`.opencode/tech-stack.md`
→ `.pi/tech-stack.md`). After the operator runs `/reload`, `/init --refresh`
re-promotes to `ready` + `context_reload_required: false` (managed interior hash
unchanged). Then `/create <slug> "description"` and
`/create <slug> --from .pi/ROADMAP.md#RM-NNN` are available and roadmap Ready cards
(RM-001, RM-002) are eligible for feature work. The retained-fixture runtime smoke
remains a separate operator-gated checkpoint (requires `/trust` + restart + provider
credentials).
