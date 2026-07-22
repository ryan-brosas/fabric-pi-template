// inner-guest.mjs — transport shim.
//
// Loaded via `--import` inside the strict bubblewrap sandbox BEFORE the verbatim
// Fabric 0.23.0 child-source runs via `--eval`. The verbatim child-source uses
// Node's native ipc transport (process.send / process.on("message") /
// process.connected / process.disconnect) to talk to its spawner. Inside bwrap
// there is no ipc channel (the wrapper spawns bwrap with stdio pipe/pipe/ignore),
// so this shim re-binds that transport onto stdin/stdout JSON-lines, allowing the
// verbatim child-source to run UNMODIFIED (zero drift from the pinned digest).
//
// The shim is trusted host code (runtime_protected). It only translates the
// transport; it does not interpret or fabricate fabric frames.

import { createInterface } from "node:readline";

const out = process.stdout;
let msgCb = null;
let closed = false;
const pending = [];

const writeLine = (obj) => {
  if (closed) return true;
  try {
    out.write(JSON.stringify(obj) + "\n");
  } catch {
    /* bridge closed */
  }
  return true;
};

// process.send -> write a JSON line to stdout (the bridge to executor-wrapper).
process.send = (msg, cb) => {
  const ok = writeLine(msg);
  if (typeof cb === "function") cb(undefined);
  return ok;
};

// process.connected (getter): true while the bridge is open and a handler is registered.
try {
  Object.defineProperty(process, "connected", {
    configurable: true,
    get: () => !closed && msgCb !== null,
  });
} catch {
  /* already a non-configurable property; leave as-is */
}

// process.disconnect -> close the bridge and exit.
process.disconnect = () => {
  closed = true;
  try {
    out.end();
  } catch {}
};

// process.on("message", cb) -> register the handler fed by the stdin readline.
// Lines arriving before the handler is registered are buffered and flushed on
// registration (the Fabric `execute` frame may arrive during --import, before
// the verbatim child-source calls process.on("message")).
const origOn = process.on.bind(process);
process.on = (ev, cb) => {
  if (ev === "message") {
    msgCb = cb;
    const queued = pending.splice(0);
    for (const m of queued) {
      try {
        msgCb(m);
      } catch {
        /* handler error; drop */
      }
    }
    return process;
  }
  return origOn(ev, cb);
};

const origOnce = process.once.bind(process);
process.once = (ev, cb) => {
  if (ev === "message") {
    const wrap = (m) => {
      msgCb = null;
      try {
        cb(m);
      } catch {}
    };
    msgCb = wrap;
    const queued = pending.splice(0);
    for (const m of queued) {
      try {
        wrap(m);
      } catch {}
    }
    return process;
  }
  return origOnce(ev, cb);
};

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (closed) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; /* ignore non-JSON noise */
  }
  if (msgCb) {
    try {
      msgCb(msg);
    } catch {
      /* handler error; keep bridge open */
    }
  } else {
    pending.push(msg);
  }
});
rl.on("close", () => {
  closed = true;
});
