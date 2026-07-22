---
schema_version: 1
initialization_status: partial
context_reload_required: true
generation_id: gen-2026-07-23-01
updated_at: 2026-07-23
agents_boilerplate_sha256: 6803a2a012ed2096c1107861400ed8db9c02a1c870d6a087bc6ea0b31438dd56
---

# Initialization State

Timestamped, non-authoritative snapshot of the Pi-native context packet. The
frontmatter is machine-readable; the body is a human summary. Authority lives in
`AGENTS.md` and `.pi/artifacts/pi-template/`.

## Status: partial

The packet is seeded but **not yet ready**. Lifecycle commands that require a ready
packet (`/create`, `/plan`, `/ship`, `/verify`, `/gc`) must fail the packet gate until
this state reaches `ready` with `context_reload_required: false`.

`context_reload_required: true` — `AGENTS.md` was established/changed at P2.1; a
post-`/reload` refresh with no drift is required before promotion to `ready`.

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

- `agents_boilerplate_sha256`: `6803a2a012ed2096c1107861400ed8db9c02a1c870d6a087bc6ea0b31438dd56`
- Fixture: `.opencode/artifacts/pi-native-init/boilerplate.md`
- Managed region: `AGENTS.md` between markers `<!-- pi:init:boilerplate:start -->` and
  `<!-- pi:init:boilerplate:end -->` (byte-identical to the fixture).

## Generation

- `generation_id`: `gen-2026-07-23-01` (first seed generation)
- Intent record: `.pi/memory.md` `## Initialization Intent - gen-2026-07-23-01`

## Next

Complete the pi-native-init implementation (P3.1–P8.2), then promote to `ready` at
P8.3 after an operator-gated `/reload` and retained-fixture `/init` smoke. Do not
advertise `/create --from` as ready while this state is `partial`.
