# User Profile

On-demand reference, not injected. Read this when personalizing responses or commits.

## Identity

- **Name:** Ryan Brosas
- **Role:** Operator and sole builder of this project; "Agent Systems Builder" by
  positioning.
- **Stance:** evidence-aware; claims must be backed (Verified / Proposed / Open). No
  fabricated proof. Source-driven: trust official docs, then source code, then
  maintainer material, then community content, then AI inference.

## Communication

- **Detail level:** Concise. State outcomes and decisions directly; cut filler,
  restatements, and running commentary. (Mirrors `AGENTS.md` communication rules.)
- **Confidence:** Calibrate in the first sentence. "I am sure" or "I am not sure, here's
  why" — not confident-sounding prose that requires probing.
- **Cite evidence:** edits, reviews, and architecture claims cite `path:line`.

## Git Workflow

- **Ask first** before commit or push (standing exception: per-artifact commit+push is
  pre-authorized after each artifact completes).
- Scope commits to your changes only; never `git add .`.
- Full git-safety rules (no force-push main/master, no destructive restoration, `main` only
  with `master` synced) live in `AGENTS.md` — this file is preferences, not policy.

## Working Preferences

- Build incrementally, slice by slice, with verification at each step — not one-shot.
- Planning artifacts may be edited freely; never scaffold application code without
  explicit approval.
- Treat `swastika` as a clean-slate Pi template: do not infer requirements from the
  inherited `.opencode` scaffold, the deleted legacy `.pi` implementation, README prose,
  or Git index state. Ground conclusions in live files and installed/upstream Pi/Fabric
  source.
- Concurrent-agent edits in this repo are normal working-set changes — never stash,
  revert, or disturb them; treat them as your own.

## Project Context

- Repository: `swastika` (Pi coding template, clean-slate).
- Authoritative home: `.pi/` (config, prompts, artifacts). Reference scaffold:
  `.opencode/`.
- Read `AGENTS.md` for binding authority, safety, routing, and verification constraints.
