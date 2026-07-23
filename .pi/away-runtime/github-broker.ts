// A5 — Host-only GitHub draft-PR create-or-get broker.
// Uses gh api with fixed argv, pinned REST headers, bounded output/retries, and
// query-before-create/query-after-ambiguity semantics. Generated code never
// receives this transport or its host-held credentials.

import { spawnSync } from "node:child_process";

const API_VERSION = "2022-11-28";
const ACCEPT = "application/vnd.github+json";
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const DEDICATED_HEAD = /^pi-away\/rm-\d{3,}-[0-9a-f]{8}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_OUTPUT = 1024 * 1024;
const MAX_RETRY_MS = 60_000;
const MAX_LIST_ATTEMPTS = 3;

export interface GhCallResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface GitHubBrokerDependencies {
  runGh(args: string[]): GhCallResult;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface DraftPullRequestRequest {
  repository: string;
  hostname: string;
  base: string;
  head: string;
  title: string;
  body: string;
  requestId: string;
}

export interface DraftPullRequestResult {
  kind: "created" | "observed";
  pullRequestId: number;
  pullRequestNumber: number;
  url: string;
  requestId: string;
}

interface ParsedResponse {
  status: number;
  headers: Map<string, string>;
  body: unknown;
}

interface PullShape {
  id: number;
  number: number;
  draft: boolean;
  html_url: string;
  head: { ref: string; label: string };
  base: { ref: string };
}

const queues = new Map<string, Promise<void>>();

const defaultDependencies: GitHubBrokerDependencies = {
  runGh(args) {
    const result = spawnSync("gh", args, {
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT,
      env: process.env,
    });
    if (result.error) {
      return { status: 1, stdout: "", stderr: "gh process failed" };
    }
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  },
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  now: () => Date.now(),
};

function validateRequest(request: DraftPullRequestRequest): void {
  if (!REPOSITORY.test(request.repository)) throw new Error("github-broker: invalid repository");
  if (request.hostname !== "github.com") throw new Error("github-broker: hostname is not allowlisted");
  if (request.base !== "main") throw new Error("github-broker: base is not allowlisted");
  if (!DEDICATED_HEAD.test(request.head)) throw new Error("github-broker: invalid dedicated head");
  if (!REQUEST_ID.test(request.requestId)) throw new Error("github-broker: invalid request id");
  if (
    typeof request.title !== "string" ||
    request.title.length < 1 ||
    request.title.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(request.title)
  ) {
    throw new Error("github-broker: invalid title");
  }
  if (
    typeof request.body !== "string" ||
    request.body.length > 4096 ||
    /[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(request.body)
  ) {
    throw new Error("github-broker: invalid body");
  }
}

function commonArgs(request: DraftPullRequestRequest, method: "GET" | "POST"): string[] {
  return [
    "api",
    "--hostname",
    request.hostname,
    "--include",
    "--method",
    method,
    "-H",
    `Accept: ${ACCEPT}`,
    "-H",
    `X-GitHub-Api-Version: ${API_VERSION}`,
  ];
}

function listArgs(request: DraftPullRequestRequest): string[] {
  const owner = request.repository.split("/")[0];
  return [
    ...commonArgs(request, "GET"),
    "-f",
    `head=${owner}:${request.head}`,
    "-f",
    `base=${request.base}`,
    `/repos/${request.repository}/pulls`,
  ];
}

function createArgs(request: DraftPullRequestRequest): string[] {
  return [
    ...commonArgs(request, "POST"),
    "-f",
    `title=${request.title}`,
    "-f",
    `body=${request.body}`,
    "-f",
    `head=${request.head}`,
    "-f",
    `base=${request.base}`,
    "-F",
    "draft=true",
    `/repos/${request.repository}/pulls`,
  ];
}

function parseResponse(call: GhCallResult): ParsedResponse | null {
  if (call.stdout.length > MAX_OUTPUT || call.stderr.length > MAX_OUTPUT) {
    throw new Error("github-broker: gh output exceeded the bound");
  }
  const crlf = call.stdout.indexOf("\r\n\r\n");
  const lf = call.stdout.indexOf("\n\n");
  const split = crlf >= 0 ? { at: crlf, width: 4 } : lf >= 0 ? { at: lf, width: 2 } : null;
  if (!split) return null;
  const headerText = call.stdout.slice(0, split.at).replace(/\r/g, "");
  const lines = headerText.split("\n");
  const match = /^HTTP\/\S+\s+(\d{3})(?:\s|$)/.exec(lines.shift() ?? "");
  if (!match) return null;
  const headers = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("github-broker: malformed response header");
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }
  const bodyText = call.stdout.slice(split.at + split.width);
  let body: unknown;
  try {
    body = bodyText.length === 0 ? null : JSON.parse(bodyText);
  } catch {
    throw new Error("github-broker: malformed JSON response");
  }
  return { status: Number(match[1]), headers, body };
}

function retryDelay(response: ParsedResponse, dependencies: GitHubBrokerDependencies): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1000, MAX_RETRY_MS);
  }
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = response.headers.get("x-ratelimit-reset");
    if (reset && /^\d+$/.test(reset)) {
      return Math.min(Math.max(Number(reset) * 1000 - dependencies.now(), 0), MAX_RETRY_MS);
    }
  }
  return MAX_RETRY_MS;
}

function isRateLimited(response: ParsedResponse): boolean {
  return response.status === 403 || response.status === 429;
}

function parsePull(value: unknown, request: DraftPullRequestRequest): PullShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("github-broker: pull response is not an object");
  }
  const pull = value as Partial<PullShape>;
  const owner = request.repository.split("/")[0];
  if (
    !Number.isSafeInteger(pull.id) ||
    !Number.isSafeInteger(pull.number) ||
    pull.draft !== true ||
    typeof pull.html_url !== "string" ||
    !pull.head ||
    pull.head.ref !== request.head ||
    pull.head.label !== `${owner}:${request.head}` ||
    !pull.base ||
    pull.base.ref !== request.base
  ) {
    throw new Error("github-broker: pull coordinates or draft state mismatch");
  }
  const expectedPrefix = `https://${request.hostname}/${request.repository}/pull/`;
  if (!pull.html_url.startsWith(expectedPrefix)) {
    throw new Error("github-broker: pull URL repository mismatch");
  }
  return pull as PullShape;
}

function resultFromPull(
  kind: "created" | "observed",
  pull: PullShape,
  response: ParsedResponse,
): DraftPullRequestResult {
  const requestId = response.headers.get("x-github-request-id");
  if (!requestId || requestId.length > 128 || !REQUEST_ID.test(requestId)) {
    throw new Error("github-broker: missing GitHub request evidence");
  }
  return {
    kind,
    pullRequestId: pull.id,
    pullRequestNumber: pull.number,
    url: pull.html_url,
    requestId,
  };
}

async function listExact(
  request: DraftPullRequestRequest,
  dependencies: GitHubBrokerDependencies,
): Promise<{ pull: PullShape | null; response: ParsedResponse }> {
  for (let attempt = 0; attempt < MAX_LIST_ATTEMPTS; attempt += 1) {
    const call = dependencies.runGh(listArgs(request));
    const response = parseResponse(call);
    if (!response) throw new Error("github-broker: pull-list transport failed");
    if (response.status === 200) {
      if (!Array.isArray(response.body)) throw new Error("github-broker: pull list is not an array");
      const pulls = response.body.map((value) => parsePull(value, request));
      if (pulls.length > 1) throw new Error("github-broker: multiple exact pull requests observed");
      return { pull: pulls[0] ?? null, response };
    }
    if (!isRateLimited(response) || attempt + 1 >= MAX_LIST_ATTEMPTS) {
      throw new Error(`github-broker: pull-list failed with HTTP ${response.status}`);
    }
    await dependencies.sleep(retryDelay(response, dependencies));
  }
  throw new Error("github-broker: pull-list retry budget exhausted");
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  let resolveMarker!: () => void;
  const marker = new Promise<void>((resolve) => {
    resolveMarker = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => marker);
  queues.set(key, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    resolveMarker();
    if (queues.get(key) === queued) queues.delete(key);
  }
}

export type DraftPullObservation =
  | { kind: "absent" }
  | { kind: "match"; pullRequestId: number; requestId: string };

/** Query-only draft observation for the replay reducer's observe-before-mutate step. */
export async function observeDraftPullRequest(
  request: DraftPullRequestRequest,
  dependencies: GitHubBrokerDependencies = defaultDependencies,
): Promise<DraftPullObservation> {
  validateRequest(request);
  return serialized(`${request.hostname}/${request.repository}`, async () => {
    const observed = await listExact(request, dependencies);
    if (!observed.pull) return { kind: "absent" };
    const result = resultFromPull("observed", observed.pull, observed.response);
    return {
      kind: "match",
      pullRequestId: result.pullRequestId,
      requestId: result.requestId,
    };
  });
}

export async function createOrGetDraftPullRequest(
  request: DraftPullRequestRequest,
  dependencies: GitHubBrokerDependencies = defaultDependencies,
): Promise<DraftPullRequestResult> {
  validateRequest(request);
  return serialized(`${request.hostname}/${request.repository}`, async () => {
    const before = await listExact(request, dependencies);
    if (before.pull) return resultFromPull("observed", before.pull, before.response);

    const createCall = dependencies.runGh(createArgs(request));
    const created = parseResponse(createCall);
    if (created?.status === 201) {
      return resultFromPull("created", parsePull(created.body, request), created);
    }

    const ambiguous =
      !created ||
      created.status === 409 ||
      created.status === 422 ||
      created.status >= 500 ||
      isRateLimited(created);
    if (!ambiguous) {
      throw new Error(`github-broker: draft create failed with HTTP ${created.status}`);
    }
    if (created && isRateLimited(created)) {
      await dependencies.sleep(retryDelay(created, dependencies));
    }
    const reconciled = await listExact(request, dependencies);
    if (!reconciled.pull) {
      throw new Error("github-broker: ambiguous create did not reconcile to an exact draft");
    }
    return resultFromPull("observed", reconciled.pull, reconciled.response);
  });
}