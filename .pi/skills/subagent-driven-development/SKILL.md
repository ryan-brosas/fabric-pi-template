---
name: subagent-driven-development
description: Use when an accepted implementation plan contains two or more genuinely independent, disjoint-path tasks that benefit from fresh bounded workers and parent-side review.
compatibility: Pi with pi-fabric; workers are leaf agents at maxDepth 1.
---

# Subagent-Driven Development

Use fresh workers only when delegation reduces risk or context pressure. Small, dependent, shared-contract, or single-unit work stays in the primary session.

## Preconditions

Before delegation, the primary must have:

1. an accepted plan or an equally explicit operator-approved task contract;
2. two or more independent units with disjoint owned paths;
3. completed shared prerequisites;
4. exact acceptance checks and non-goals for each unit;
5. available routes resolved from `.pi/config.json` rather than hard-coded model keys.

If any precondition fails, execute sequentially in the primary.

## Pi/Fabric process

### 1. Read and slice the plan

Read the canonical plan from `.pi/artifacts/<slug>/`. Derive eligible units from the plan, decisions, evidence, and current mesh leases. Do not create a separate task queue or mutate status into plan prose.

If shared context is too large to inline, write an inspectable context packet under `.pi/artifacts/<slug>/implementation-context.md` and reference that path in each worker brief.

### 2. Reserve ownership before spawning

The primary acquires the unit lease and exact-file reservations with mesh compare-and-swap. Every spawn must have a durable task record under `work/<slug>/tasks/<task-id>` before launch, plus control and result topics.

A partial reservation, foreign lease, overlapping ancestor/descendant path, or unexplained source change blocks dispatch. Do not silently take over ownership.

### 3. Dispatch bounded leaf workers

Use `fabric_exec` with `agents.spawn`, then harvest later with `agents.status` or `agents.wait`; do not hold one long blocking wave. Workers that need mesh access use the Pi runner and are leaves at `maxDepth:1`.

```typescript
// canonical leaf-worker dispatch and harvest
const h = await tools.call({
  ref: 'agents.spawn',
  args: {
    name: 'unit-<id>',
    task: brief, // full brief per the list below
    model: route.model, // resolved from .pi/config.json role_routes
    tools: route.tools,
  }
});
// later: harvest without blocking a whole wave
const status = await tools.call({
  ref: 'agents.status',
  args: { id: h.id }
});
const result = await tools.call({
  ref: 'agents.wait',
  args: { id: h.id }
});
```

Each brief names:

- exact target and acceptance criteria;
- exact writable paths;
- read-any/write-only-owned authority;
- required checks;
- task key, control topic, and results topic;
- prohibition on deleting files, broadening scope, spawning descendants, or calling Fabric `state.*`;
- required completion payload: status, files, checks, findings, and blockers.

Use the smallest wave. Provider caps in `.pi/config.json` are ceilings, not a mandate to fill every seat.

### 4. Worker completion protocol

A worker:

1. re-reads its durable task record and verifies owner/path scope;
2. reads current source before editing;
3. edits only owned paths;
4. re-reads its changes and runs the named checks;
5. CAS-updates the task to `completed` or `blocked`;
6. publishes the same result to the results topic.

Workers never transition the project-global Fabric state head. Only the primary may call `state.*` through `tools.call`.

### 5. Parent distrust and integration

Worker completion is not acceptance. For one result at a time, the primary:

1. reads every changed file and inspects the actual diff;
2. confirms no out-of-scope path changed;
3. runs the narrow checks independently;
4. checks the original acceptance criteria;
5. records per-unit evidence under `.pi/artifacts/<slug>/evidence/`;
6. integrates or requests a bounded repair;
7. releases ownership only after evidence is written and verified.

Do not require workers to commit unless the operator or accepted plan explicitly asks for commits.

### 6. Final integrated review

After all units are integrated, run repository-native typecheck, lint, tests, and build as applicable. Then use one bounded read-only reviewer if independent review is warranted. The primary remains the sole integrator and owns completion claims.

## Red flags

Never:

- manufacture parallelism for one or tightly coupled units;
- spawn without a durable mesh task and exact path ownership;
- let workers edit shared contracts concurrently;
- trust a worker summary without reading its changes;
- let a worker call `state.transition`, accept a plan, or spawn descendants;
- hard-code provider/model keys inside skill examples;
- perform automatic commits, merges, pushes, or cleanup.

## Failure handling

Steer a drifting worker once with a precise correction before stopping it. A transient provider failure may be retried once on the configured alternate route. A second failure blocks that slice; preserve partial work and report the evidence.

## Verification

- Every spawn has a durable task record and started/completed-or-blocked events.
- Owned paths are disjoint and match actual edits.
- The primary independently reruns checks and reviews one result at a time.
- No worker transitioned Fabric state or spawned a descendant.
- Integrated repository checks pass before completion is claimed.