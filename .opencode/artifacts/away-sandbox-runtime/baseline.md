# Away Sandbox Runtime — P0.2 Protected-File Baseline

**Captured:** 2026-07-23 (P0.2, after P0.1 push settled ADR-013)
**Baseline OID:** `5dd5e347dea9a01385f6cac5433f2e533746a9de` (== `origin/main` == `origin/master`, 0 ahead / 0 behind)
**Authority:** operator instruction "baseline captures current bytes" — concurrent agents' in-flight edits to `.pi/fabric.json` / `.pi/settings.json` are folded in as the baseline; this run never reverts another agent's work.

## SHA-256 manifest (current on-disk bytes)

These are the protected files the away-sandbox-runtime work must NOT change (except where a named task intentionally edits a shared-ownership file: B1 edits DECISIONS.md/PLAN.md/AGENTS.md; D2 edits dev-docs). D3 compares the final on-disk bytes against this manifest.

### Normal Pi/Fabric config (must stay byte-identical through the run)

```
bee3c6fa61d9dcae3af3d64a19e591e62e96ccf0071f16814a1cc6fb1d394561  .pi/fabric.json
6c9cdfb492220987e6f2d1c9bef1fe961582cbe7b8dc616e912709945eec3520  .pi/settings.json
```

### Authority docs (shared serial ownership; B1 edits intentionally)

```
3450a57892e894b0da0cee6bb427206ff574c7baa7fffe26458922ef9883a17d  AGENTS.md
c2901bea392b2c390cd0bc4d9117ef93a1c1f7ff2c9462115233531c210a8457  .pi/artifacts/pi-template/DECISIONS.md
1c52e55fdb78d70e89817d44ed52a5afe5a9dd7bead334c62f5bd83abdc1b129  .pi/artifacts/pi-template/PLAN.md
```

### Lifecycle prompts (forbidden-token cleanliness + ADR markers must survive)

```
b38b1bad43f40f4a162aa455f9e84bcf43ac445275723050ac6f5a213c0ed83e  .pi/prompts/audit.md
558b3984c6e5e078d4e160cf8885e2c825a0ca13c767f756c3c6c7b87f995106  .pi/prompts/create.md
70f69382f3926a3acfcb3d692ec820a3345a5591c1a5a97464baeb2700baccd5  .pi/prompts/fix.md
361d82cd5413244ea1543838617c7189d448590772688adcabf4238774097e73  .pi/prompts/gc.md
ea1195de1999ada2ffad17c5477a27b8fe4baac408c9666b6da2ee77b2d38d6c  .pi/prompts/init.md
dde157365c7cfd47f2c41fcee676392e3d5d5abe54d4ab5f7418fefad4d8dd7b  .pi/prompts/plan.md
e8fafea686ce34d86fdf48a6ccc226d6bbbca649c5dd9888215f0367689e3ab9  .pi/prompts/research.md
70675402ba71a90b86c7e69f27a4f3833283b364e7ab10d9769a7d841f850827  .pi/prompts/ship.md
7d1483073013ccc39d27f7643026b9dfa8ad8e20bf2c965055fcb6694b5c88d7  .pi/prompts/supervise.md
b0e3483eeceae525ee668eee6d41aa288f527c1ee066af315a794f89a97d22ab  .pi/prompts/verify.md
```

### OpenCode commands (protected; not edited by this feature)

```
d802d209992df1d1ccbf0e712f43a5e8aaa30d4175c7cbab4ee248a9098a9d5d  .opencode/command/audit.md
c93c8bcc7b4ed1e2379360fb794cef7a14593617f10271653b91896c70645f50  .opencode/command/create.md
b58424110500552de8bb80c8889c3b84b1861e8b8ceaa144f21378205a75f25e  .opencode/command/fix.md
02a816852384953307a6148ab536f357c2bfeb032480c4a3b768a0dcfab48db0  .opencode/command/gc.md
46e67990fdd3a44cb461bccb1f6195ea4cf5ba4e2e308d125cef03db2fedf320  .opencode/command/init.md
fb23a75cce934aeb71a44fdae4303223409fd49cd926f0c6f28af9dd9a21070  .opencode/command/plan.md
4e5776a535c187e6f0f2f170a11d8c998e36cddc4b93df9017782da9caf657b0  .opencode/command/research.md
5136edb12467e9b42a890dacc6d5e34282147deb71aa9dc5304e16eb9760b38b  .opencode/command/ship.md
17306b1c5189dd4bee9271200918c572ac171c2a1bdb674003c65791df5252fd  .opencode/command/verify.md
```

## ADR markers verified present at baseline

```
304:## ADR-011: Tier-gated lifecycle review gates
370:## ADR-012: Proactive supervisor boundary handshake
433:## ADR-013: Main-mediated MCP research lane
```

## Forbidden-token cleanliness in prompts (verified clean at baseline)

`rg -n 'agent:|task\(|question\(|skill\(|write\(|\.active|spec\.md|prd\.json|review-state\.json' .pi/prompts/*.md` → no matches.

## Notes

- The corrected design (plan.md) replaces mutable `.pi/fabric/**` hashing with immutable startup-closure hashing; the immutable closure (`.pi/away-runtime/**` + wrapper + inner guest + lane extension + config + pinned Pi/Fabric/provider/Node/bwrap sources) is hashed at B2, not this P0.2 baseline.
- This baseline pins the files that the *feature contract* requires to stay unchanged; it is the reference for D3 `git diff --check` and the protected-path equality check.
