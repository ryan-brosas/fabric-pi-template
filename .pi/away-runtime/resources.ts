// B2 — Resource limits for the away sandbox.
//
// Hard enforcement of PID/memory/CPU via cgroup-v2 systemd delegation, wrapping
// the bwrap sandbox invocation in `systemd-run --user --wait --pipe --collect`
// (service mode — A3 proved `--scope` hangs on long-running children). The
// cgroup covers the bwrap + inner guest only (the wrapper is spawned by Fabric
// as its own child; a later wave swaps the wrapper's bwrap spawn for the
// cgroup-wrapped spawn produced here).
//
// Storage quota: bwrap `--size` is rejected in setuid mode (probed in B2 on this
// host: "The --size option is not permitted in setuid mode"). The available
// hard bound is therefore cgroup `MemoryMax`, which charges tmpfs page cache to
// the cgroup (A3 proved oom-kill under MemoryMax). `cgroup_storage_bytes` and
// `max_file_count` are verified post-run via the accounting helpers below
// (quota-backed verification used by the C2/C3 attestation).
//
// Run: node --experimental-strip-types --test .pi/away-runtime/confinement.test.ts

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildBwrapArgs } from "./executor-wrapper.mjs";
import type { Limits } from "./bootstrap.ts";

/**
 * Build the systemd-run prefix that wraps a command in a transient service
 * cgroup with PID/memory/CPU limits. Service mode (--wait --pipe --collect),
 * never --scope (A3: scope drains on children and hangs long-running guests).
 */
export function buildCgroupArgs(limits: Limits): string[] {
  return [
    "systemd-run",
    "--user",
    "--wait",
    "--pipe",
    "--collect",
    "-p",
    `TasksMax=${limits.cgroup_pid_max}`,
    "-p",
    `MemoryMax=${limits.cgroup_memory_bytes}`,
    "-p",
    `CPUWeight=${limits.cgroup_cpu_weight}`,
  ];
}

export interface SandboxSpawnInputs {
  realNode: string;
  libs: string[];
  innerGuestPath: string;
  network: boolean;
  guestArgs: string[];
  bwrapPath: string;
}

/**
 * Compose the full spawn argv: systemd-run (cgroup) -> bwrap -> inner guest.
 * Reuses the A2 wrapper's buildBwrapArgs so the strict-namespace binding is
 * defined in exactly one place.
 */
export function buildSandboxSpawnArgs(limits: Limits, inp: SandboxSpawnInputs): string[] {
  const bwrap = buildBwrapArgs({
    realNode: inp.realNode,
    libs: inp.libs,
    innerGuestPath: inp.innerGuestPath,
    network: inp.network,
    guestArgs: inp.guestArgs,
  });
  return [...buildCgroupArgs(limits), "--", inp.bwrapPath, ...bwrap];
}

export interface RunInCgroupOptions {
  timeoutMs?: number;
}

export interface CgroupRunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Synchronously run a command under a cgroup-wrapped transient service. */
export function runInCgroup(
  limits: Limits,
  argv: string[],
  opts: RunInCgroupOptions = {},
): CgroupRunResult {
  // buildCgroupArgs returns the full argv (command "systemd-run" first); spawn
  // with argv[0] as the command and the rest as args — never pass "systemd-run"
  // again as a leading arg (that reinterprets it as the unit's command and trips
  // a polkit "Interactive authentication required" denial on the bogus unit).
  const fullArgv = [...buildCgroupArgs(limits), "--", ...argv];
  const r = spawnSync(fullArgv[0], fullArgv.slice(1), {
    encoding: "utf8",
    timeout: opts.timeoutMs,
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: typeof r.stdout === "string" ? r.stdout : "",
    stderr: typeof r.stderr === "string" ? r.stderr : "",
  };
}

/** Count regular files under a directory tree (quota accounting). */
export function countFiles(dir: string): number {
  let n = 0;
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else n++;
    }
  };
  walk(dir);
  return n;
}

/** Sum file sizes (bytes) under a directory tree (quota accounting). */
export function measureDirBytes(dir: string): number {
  let total = 0;
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else total += s.size;
    }
  };
  walk(dir);
  return total;
}

/** Read the PIDs in a cgroup's cgroup.procs file (for reap verification). */
export function listCgroupProcs(cgroupPath: string): number[] {
  try {
    const content = readFileSync(join(cgroupPath, "cgroup.procs"), "utf8");
    return content
      .split("\n")
      .map((l) => Number(l))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}
