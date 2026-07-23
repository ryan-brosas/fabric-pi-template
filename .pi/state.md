---
schema_version: 1
initialization_status: ready
context_reload_required: false
generation_id: gen-2026-07-23-01
updated_at: 2026-07-23
agents_boilerplate_sha256: e12e27bdb65d49e4431cc7ede5549071d8bc195e8a5690f4ca6c7203d1e3bd2b
---

# Initialization State

Timestamped, non-authoritative snapshot of the Pi-native context packet. The
frontmatter is machine-readable; the body is a human summary. Authority lives in
`AGENTS.md` and `.pi/artifacts/pi-template/`.

## Status: ready

P0.2's managed-policy reconciliation is settled. The updated `AGENTS.md`
managed interior is loaded in the active context and matches both the locked
fixture and the recorded SHA-256; the post-reload refresh promoted the packet
to ready.

## Packet

| File | Status |
|---|---|
| `AGENTS.md` | refreshed (Fabric 0.24.3 managed authority; loaded) |
| `.pi/tech-stack.md` | refreshed (live Fabric 0.24.3 facts and command evidence) |
| `.pi/ROADMAP.md` | refreshed (v1 grammar, 3 Ready + bounded Next/Later) |
| `.pi/user.md` | seeded (operator-approved preferences) |
| `.pi/memory.md` | seeded (durable knowledge + Initialization Intent) |
| `.pi/state.md` | this file (ready) |

## Boilerplate

- `agents_boilerplate_sha256`: `e12e27bdb65d49e4431cc7ede5549071d8bc195e8a5690f4ca6c7203d1e3bd2b` (SHA-256 of the `AGENTS.md` managed interior, between markers)
- Fixture: `.opencode/artifacts/pi-native-init/boilerplate.md`
- Managed region: `AGENTS.md` between markers `<!-- pi:init:boilerplate:start -->` and
  `<!-- pi:init:boilerplate:end -->` (byte-identical to the fixture).

## Generation

- `generation_id`: `gen-2026-07-23-01` (first seed generation)
- Intent record: `.pi/memory.md` `## Initialization Intent - gen-2026-07-23-01`

## Next

The packet is ready. Established lifecycle namespaces may proceed through their
downstream gates.
