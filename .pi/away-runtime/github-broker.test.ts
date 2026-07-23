import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOrGetDraftPullRequest,
  type GhCallResult,
  type GitHubBrokerDependencies,
} from "./github-broker.ts";

function response(status: number, body: unknown, headers: Record<string, string> = {}): GhCallResult {
  const lines = [`HTTP/2.0 ${status} Test`];
  for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
  return { status: 0, stdout: `${lines.join("\r\n")}\r\n\r\n${JSON.stringify(body)}`, stderr: "" };
}

function pull(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    number: id,
    draft: true,
    html_url: `https://github.com/acme/widget/pull/${id}`,
    head: { ref: "pi-away/rm-003-01234567", label: "acme:pi-away/rm-003-01234567" },
    base: { ref: "main" },
    ...overrides,
  };
}

function request() {
  return {
    repository: "acme/widget",
    hostname: "github.com",
    base: "main",
    head: "pi-away/rm-003-01234567",
    title: "RM-003 autonomous candidate",
    body: "Host-observed candidate evidence.",
    requestId: "request-01234567",
  };
}

function scripted(results: GhCallResult[]): {
  dependencies: GitHubBrokerDependencies;
  calls: string[][];
  sleeps: number[];
} {
  const calls: string[][] = [];
  const sleeps: number[] = [];
  return {
    calls,
    sleeps,
    dependencies: {
      runGh(args) {
        calls.push([...args]);
        const next = results.shift();
        if (!next) throw new Error("unexpected gh call");
        return next;
      },
      async sleep(ms) {
        sleeps.push(ms);
      },
      now: () => 1_700_000_000_000,
    },
  };
}

describe("A5 host GitHub draft-PR broker", () => {
  it("returns an exact existing draft without POST", async () => {
    const s = scripted([response(200, [pull(41)], { "X-GitHub-Request-Id": "list-41" })]);
    const result = await createOrGetDraftPullRequest(request(), s.dependencies);
    assert.deepEqual(result, {
      kind: "observed",
      pullRequestId: 41,
      pullRequestNumber: 41,
      url: "https://github.com/acme/widget/pull/41",
      requestId: "list-41",
    });
    assert.equal(s.calls.length, 1);
    assert.ok(s.calls[0].includes("GET"));
    assert.ok(!s.calls[0].includes("POST"));
  });

  it("creates one draft with pinned API headers and exact coordinates", async () => {
    const s = scripted([
      response(200, []),
      response(201, pull(42), { "X-GitHub-Request-Id": "create-42" }),
    ]);
    const result = await createOrGetDraftPullRequest(request(), s.dependencies);
    assert.equal(result.kind, "created");
    assert.equal(result.pullRequestId, 42);
    const create = s.calls[1];
    assert.ok(create.includes("POST"));
    assert.ok(create.includes("X-GitHub-Api-Version: 2022-11-28"));
    assert.ok(create.includes("draft=true"));
    assert.ok(create.includes("head=pi-away/rm-003-01234567"));
    assert.ok(create.includes("base=main"));
    assert.equal(s.calls.filter((call) => call.includes("POST")).length, 1);
  });

  it("reconciles an ambiguous create by listing instead of replaying POST", async () => {
    const s = scripted([
      response(200, []),
      { status: 1, stdout: "", stderr: "transport timeout" },
      response(200, [pull(43)], { "X-GitHub-Request-Id": "reconcile-43" }),
    ]);
    const result = await createOrGetDraftPullRequest(request(), s.dependencies);
    assert.equal(result.kind, "observed");
    assert.equal(result.pullRequestId, 43);
    assert.equal(s.calls.filter((call) => call.includes("POST")).length, 1);
    assert.equal(s.calls.filter((call) => call.includes("GET")).length, 2);
  });

  it("blocks duplicate or mismatched pull requests", async () => {
    const duplicate = scripted([response(200, [pull(1), pull(2)])]);
    await assert.rejects(
      createOrGetDraftPullRequest(request(), duplicate.dependencies),
      /multiple exact pull requests/,
    );
    const mismatch = scripted([response(200, []), response(201, pull(3, { draft: false }))]);
    await assert.rejects(
      createOrGetDraftPullRequest(request(), mismatch.dependencies),
      /coordinates|draft/,
    );
  });

  it("honors Retry-After for a bounded list retry", async () => {
    const s = scripted([
      response(429, { message: "rate limited" }, { "Retry-After": "2" }),
      response(200, [pull(44)], { "X-GitHub-Request-Id": "list-44" }),
    ]);
    const result = await createOrGetDraftPullRequest(request(), s.dependencies);
    assert.equal(result.pullRequestId, 44);
    assert.deepEqual(s.sleeps, [2000]);
  });

  it("rejects unallowlisted coordinates before calling gh", async () => {
    const s = scripted([]);
    await assert.rejects(
      createOrGetDraftPullRequest({ ...request(), repository: "../secret", head: "main" }, s.dependencies),
      /repository|dedicated head/,
    );
    assert.equal(s.calls.length, 0);
  });
});