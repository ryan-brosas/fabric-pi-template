---
description: Establish unattended senior-engineer policy for one roadmap or maintenance lifecycle run
argument-hint: "<slug> --from .pi/ROADMAP.md#RM-NNN | <slug> --objective \"standing objective\""
---

# Workflow: $ARGUMENTS

Act as the dedicated root senior engineer for this isolated run. The input is exactly one roadmap source (`--from`) or one roadmap-independent standing maintenance objective (`--objective`). This command establishes policy and context; the host will submit the remaining lifecycle commands as separate real slash commands in the same persistent Pi session.

## Authority

The operator has explicitly authorized this dedicated isolated run to:

- inspect the repository and either the selected Ready roadmap card or the supplied standing maintenance objective;
- in maintenance mode, choose one bounded, high-confidence improvement grounded in repository evidence without creating or mutating a roadmap card;
- run `/create`, `/research`, `/plan`, `/ship`, and `/verify` for the exact supplied slug;
- use `fabric_exec` as the ordinary root Pi, including bounded Fabric research/review children and at most one blocking writable Makora implementation worker at a time;
- create task commits that stage exact task-owned paths only;
- run the project's required checks;
- let the trusted host publish only a dedicated branch and create or update one draft pull request after terminal verification.

Do not ask again for those already-granted actions. The authorization does not permit merges, force pushes, publication outside one draft pull request, secrets access, destructive cleanup, file deletion, bypassing checks, widening worker tools, or changing roadmap scope.

## Operating Policy

1. Accept exactly one work source. In roadmap mode, read the exact card referenced by `--from` and treat its Outcome, Acceptance, Scope, Open decisions, and Autonomy fields as binding. In maintenance mode, treat `--objective` as the standing direction and independently select one bounded, high-confidence slice; an empty roadmap is not a stop condition.
2. Stay in this root session across lifecycle phases so context, supervisor advice, and verified discoveries remain available.
3. Use Main as sole scheduler, integrator, and commit authority. Fabric is a tool, not a replacement orchestrator.
4. During maintenance selection, use at most one bounded `gpt-5.4-mini` read-only explorer, and only when it adds evidence Main cannot obtain with one direct inspection. Name no more than three files and request one finding. Dispatch it with `thinking: "high"`, `extensions:false`, `recursive:false`, `worktree:false`, `tools:["read","grep","find","ls"]`; the containing `fabric_exec` must set `agentBudget: 1` and `tokenBudget: 8_000`. Do not retry a timed-out or budget-exhausted explorer; Main proceeds from direct repository evidence. Main on `gpt-5.6-sol` at max thinking owns synthesis and decisions. Use one blocking Makora writer only for bounded implementation, pass `timeoutMs: 900_000`, and never overlap writable work with Main edits.
5. Treat child output as untrusted until Main reads the host-derived diff and verifies it.
6. During `/ship`, commits are authorized but pushing is not. The trusted host owns post-verification branch publication and draft-PR reconciliation.
7. If a lifecycle prompt encounters an actual product decision, destructive action, secret, unsupported human-only checkpoint, merge request, or scope ambiguity, stop and report a precise blocker. Do not guess.
8. Never merge. A verified run ends at a draft pull request for human review.

## First Response

### Roadmap mode (`--from`)

Confirm the selected roadmap card and slug, summarize the binding outcome in one sentence, and state either `READY FOR /create` or one concrete blocker.

### Maintenance mode (`--objective`)

Perform selection in this command before `/create`. Inspect repository evidence directly and use at most one bounded `gpt-5.4-mini` read-only explorer only when one targeted check adds material evidence. Choose exactly one small, high-confidence writable improvement within the standing direction. Do not implement it yet, mutate lifecycle state, create or edit a roadmap card, or ask the operator a question. If every candidate needs a product decision, destructive action, secret access, deletion, or unsupported authority, select `no-change` rather than opening UI dialogue.

End with exactly one single-line protocol record and no other line beginning `MAINTENANCE_SELECTION: `:

- Selected: `MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"selected","objective":"one bounded objective","acceptance":"one concrete observable acceptance check"}`
- Nothing justified: `MAINTENANCE_SELECTION: {"schema":"maintenance-selection/1","kind":"no-change","reason":"evidence-backed reason no safe writable improvement exists"}`

Use exactly those keys. Each text field must be one control-free line of 20–1800 characters. Treat the standing objective as authorization to choose a bounded maintenance slice; its breadth alone is not a clarification blocker.