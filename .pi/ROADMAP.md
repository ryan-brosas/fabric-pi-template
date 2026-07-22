---
roadmap_schema_version: 1
last_issued_id: RM-003
---

# Roadmap

Project intent as versioned roadmap cards. IDs are immutable and never reused,
renumbered, or reassigned to a materially different outcome. Moving a card between
horizons preserves its ID. Away eligibility requires Ready + `Autonomy: away-ok` +
`Open decisions: none`. Reservations and execution status live in the autonomous-loop
ledger, not here.

Provenance source: `.pi/memory.md` section
`## Initialization Intent - gen-2026-07-23-01`
@ sha256: 74f3cf4e1bb528dc8668d612470434ebf6c4a996523d1aa3e75ce644d16727b4

## Ready

### RM-001 — Pi-native initialization lifecycle
- Outcome: Mandatory first-touch `/init` compiles the full Pi-native context packet
  (`AGENTS.md` managed boilerplate + `.pi/{tech-stack,ROADMAP,state,user,memory}.md`)
  with source-backed `/create` and crash-safe `--refresh`; state schema v1 gates
  lifecycle commands.
- Why now: every downstream feature depends on an initialized, ready packet; the
  lifecycle is the foundation all other work builds on.
- Acceptance evidence: `.pi/state.md` reaches `initialization_status: ready` with
  `context_reload_required: false` after a retained-fixture `/init` smoke; structural
  checks pass; managed AGENTS boilerplate is byte-identical to the locked fixture.
- Dependencies: away-sandbox-runtime settlement (shared authority files) — Option B
  reserves pi-native-init with a feature-scoped baseline.
- Candidate slug: `pi-native-init` (in progress).
- Autonomy: manual-only
- Open decisions: none
- Source: `.pi/memory.md` `## Initialization Intent - gen-2026-07-23-01` @ sha256: 74f3cf4e1bb528dc8668d612470434ebf6c4a996523d1aa3e75ce644d16727b4

### RM-002 — Away sandbox runtime
- Outcome: Unattended `node-process` Fabric guests and candidate verification run under
  host-pinned bubblewrap confinement (`.pi/away-runtime/`) with cgroup-v2 limits and a
  trusted launcher attesting the Fabric argv + child-source digest.
- Why now: the autonomous loop and unattended verification both require a confinement
  boundary; `node-process` is explicitly not a security sandbox.
- Acceptance evidence: confinement test passes (strict userns, no fail-open); launcher
  attestation + closure hash validated; D3 no-write acceptance passes.
- Dependencies: none (predecessor).
- Candidate slug: `away-sandbox-runtime` (in progress, paused at B3).
- Autonomy: manual-only
- Open decisions: none
- Source: `.pi/memory.md` `## Initialization Intent - gen-2026-07-23-01` @ sha256: 74f3cf4e1bb528dc8668d612470434ebf6c4a996523d1aa3e75ce644d16727b4

## Next

### RM-003 — Autonomous away loop
- Outcome: Ledger/Git/GitHub crash-replay full loop on the sandbox foundation:
  unattended ideation (roadmap-first), execution, and crash recovery.
- Why now: closes the unattended automation loop once the sandbox and init packet are
  stable.
- Acceptance evidence: full crash-replay loop runs end-to-end under confinement;
  roadmap selection uses stable RM-NNN IDs; ledger reservations/completion are
  host-derived.
- Dependencies: RM-001 (pi-native-init P8.3) — Gate 0.4; RM-002 (sandbox settlement).
- Candidate slug: `autonomous-away-loop`.
- Autonomy: manual-only
- Open decisions: none (gated behind RM-001 P8.3; not yet eligible)
- Source: `.pi/memory.md` `## Initialization Intent - gen-2026-07-23-01` @ sha256: 74f3cf4e1bb528dc8668d612470434ebf6c4a996523d1aa3e75ce644d16727b4

## Later

- **Adopter ergonomics:** one-command bootstrap (`/trust` + `/init`) for new
  repositories adopting the template; documentation and examples.
- **Verification harness:** `.pi/tools/` for per-slug verification fingerprint capture
  and retained-fixture runtime smoke automation.
- **Cross-tool compatibility:** `CLAUDE.md` / `.github/copilot-instructions.md`
  adapters importing the canonical `AGENTS.md` boilerplate.
