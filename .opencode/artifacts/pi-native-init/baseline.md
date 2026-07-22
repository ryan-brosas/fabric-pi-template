# pi-native-init — P1 Baseline (feature-scoped, frozen at P1.2)

> **Baseline mode:** feature-scoped (operator Option B: reserve pi-native-init; away-sandbox-runtime paused at B3; C1-D3 deferred, reconcile-on-resume). Absolute byte-equality of protected files against this baseline is NOT achievable while concurrent agents continuously churn shared files (same reality already resolved as "D3 = feature-scoped" in `.opencode/artifacts/away-sandbox-runtime/progress.md`). The binding check is **feature-scoped**: pi-native-init's own commits must not touch protected paths; the hashes below are recorded for reference and drift detection, not absolute-equality enforcement.

## HEAD at freeze

- `HEAD_OID=e15881f3c61eed68d60e528737c848ff47c0c3e7`
- `HEAD_SHORT=e15881f`
- Note: AGENTS.md and `.pi/{fabric.json,settings.json}` are observed churning under concurrent agents at freeze time; the boilerplate-rules region (Rule 0 → Safety + Note for Codex) is the stable, operator-supplied verbatim block captured in `boilerplate.md`.

## Boilerplate fixture

- `BOILERPLATE_SHA256=6803a2a012ed2096c1107861400ed8db9c02a1c870d6a087bc6ea0b31438dd56`
- Fixture path: `.opencode/artifacts/pi-native-init/boilerplate.md`
- Managed markers: `<!-- pi:init:boilerplate:start -->` / `<!-- pi:init:boilerplate:end -->`
- Content (generated order): root `AGENTS.md` `## RULE 0` (L5) through end of `## Safety` (L187) + the `---` / `Note for Codex/GPT:` block (L232) through the closing `---` (L250). The `# Agent Rules` H1 + leading `---` are the fixed file header (outside markers); `## Repository` (L188-231) is the project appendix (placed after the end marker in the generated AGENTS.md at P2.1).

## Protected-file SHA-256 (reference; feature-scoped, not absolute)

```
e04013bc79065c225732bcce491ed58c99294917412ca68d1b56dc53d2948a97  .pi/fabric.json
6c9cdfb492220987e6f2d1c9bef1fe961582cbe7b8dc616e912709945eec3520  .pi/settings.json
d017b03f841aedc8d0a7a431705065c9b567e794ad616578d17857741817fb35  AGENTS.md
abcd968d01d345caf4160b4e50aaa87306c5debe97868948d7b1e99d1e0c7d5c  .pi/artifacts/pi-template/DECISIONS.md
8580070033ed5ae7a3194f105f05c2f072bed7d7729dec6950963c208dedd329  .pi/artifacts/pi-template/PLAN.md
```

## .pi/prompts/*.md (reference)

```
b38b1bad43f40f4a162aa455f9e84bcf43ac445275723050ac6f5a213c0ed83e  .pi/prompts/audit.md
6c11c2c60c121ba36cedf7810498a8b4e34aca6fc637e9ddc719ee6720e2874d  .pi/prompts/create.md
70f69382f3926a3acfcb3d692ec820a3345a5591c1a5a97464baeb2700baccd5  .pi/prompts/fix.md
361d82cd5413244ea1543838617c7189d448590772688adcabf4238774097e73  .pi/prompts/gc.md
ea1195de1999ada2ffad17c5477a27b8fe4baac408c9666b6da2ee77b2d38d6c  .pi/prompts/init.md
5df7856c4ed8a25629bd60de9fa66957b7bb21aee31a09b6c188efaedd416f7d  .pi/prompts/plan.md
34399c72209c5d2af16bd2f12465137a5eac67b02c56db67fde05a9adc5debbd  .pi/prompts/research.md
56980a9a2e87f16e697b209f74d669e9889ec53f5b88e0b5d5d9c79e5ac3e5fd0  .pi/prompts/ship.md
db1e72a4d0dcae5b0a7ea0d0faf8b626be1750d61d5a5d7f5c24bb17a249e464  .pi/prompts/supervise.md
b0e3483eeceae525ee668eee6d41aa288f527c1ee066af315a794f89a97d22ab  .pi/prompts/verify.md
```

## .opencode/command/*.md (protected source — must remain unchanged)

```
d802d209992df1d1ccbf0e712f43a5e8aaa30d4175c7cbab4ee248a9098a9d5d  .opencode/command/audit.md
c93c8bcc7b4ed1e2379360fb794cef7a14593617f10271653b91896c70645f50  .opencode/command/create.md
b58424110500552de8bb80c8889c3b84b1861e8b8ceaa144f21378205a75f25e  .opencode/command/fix.md
02a816852384953307a6148ab536f357c2bfeb032480c4a3b768a0dcfab48db0  .opencode/command/gc.md
46e67990fdd3a44cb461bccb1f6195ea4cf5ba4e2e308d125cef03db2fedf320  .opencode/command/init.md
fb23a75cce934aeb71a442fdae4303223409fd49cd926f0c6f28af9dd9a21070  .opencode/command/plan.md
4e5776a535c187e6f0f2f170a11c8c998e36cddc4b93df9017782da9caf657b0  .opencode/command/research.md
5136edb12467e9b42a890dacc6d5e34282147deb71aa9dc5304e16eb9760b38b  .opencode/command/ship.md
17306b1c5189dd4bee927120098c572ac171c2a1bdb674003c65791df5252fd  .opencode/command/verify.md
```

## Feature-scoped verification rule

pi-native-init's commits (P1.1 through P8.3) must not modify any `.opencode/command/*.md` (the source commands are frozen) and must not touch protected paths except through the explicitly owned shared-serial-ownership entries (`AGENTS.md`, `DECISIONS.md`, `PLAN.md` owned by P2.1/P7.3; `structural-check.sh` owned by P1.2/P3.1/P4.1/P5.1/P6.3/P8.3; `.pi/state.md` owned by P2.3/P8.3). Drift in hashes above caused by OTHER concurrent agents is not a pi-native-init defect; drift caused by pi-native-init's own commits touching a non-owned protected path IS a defect.

## P1.2 Freeze Stamp

Frozen by P1.2. HEAD `e15881f` and the boilerplate fixture SHA-256 `6803a2a0...` above are the authoritative feature-scoped reference for drift detection. This baseline is not re-captured by later tasks. Protected-file edits owned by pi-native-init through its serial-ownership entries are expected drift, not defects: `AGENTS.md` at P2.1/P7.3 (managed boilerplate region pinned to the fixture), `DECISIONS.md`/`PLAN.md` at P2.1/P7.3 (ADR-016 + canonical contract), `structural-check.sh` at P3.1/P4.1/P5.1/P6.3/P8.3 (appended assertions), `.pi/state.md` at P8.3 (final `ready` promotion). Absolute byte-equality of protected files is not enforced under concurrent churn (see baseline mode note above); the binding check is feature-scoped: pi-native-init's own commits touch only owned paths.

**P2.1 fixture regeneration (operator-authorized).** The fixture was captured at P1.1 (HEAD `e15881f`) with the ADR-013 paragraph as it then stood. A concurrent agent (mcp-research-lane, commit `1359cc1`) legitimately rewrote that one paragraph in the AGENTS.md boilerplate region after P1.1. P2.1 regenerated the fixture once to incorporate that update (treating the concurrent change as our own per the Note-for-Codex rule), moving the fixture SHA from `dcaf935a...` to `6803a2a0...` and pinning AGENTS.md to the updated fixture. This is the single authorized fixture re-capture; the freeze otherwise holds.
