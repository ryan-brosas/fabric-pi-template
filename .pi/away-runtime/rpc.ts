// C1 — raw-buffer LF-only RPC parser.
//
// Pi's RPC mode (modes/rpc/jsonl.js) frames records as `${JSON.stringify(v)}\n`
// — LF only. U+2028/U+2029 stay INSIDE JSON strings and are deliberately NOT
// treated as line separators (jsonl.js avoids Node readline for exactly this
// reason). This module mirrors that framing for the away-runtime launcher:
// a chunked, UTF-8-safe reader that splits ONLY on `\n`, tolerates one
// trailing `\r` (CRLF), rejects oversized records, and flushes a final
// unterminated record on end().
//
// Run: node --experimental-strip-types --test .pi/away-runtime/launcher.test.ts

import { StringDecoder } from "node:string_decoder";

/** A parsed RPC record. Either a command (in), a response, or an event (out). */
export interface RpcRecord {
  type: string;
  id?: string | number;
  [key: string]: unknown;
}

/** A streamed agent/session event (agent_start, turn_start, message_update, agent_settled, ...). */
export interface RpcEvent {
  type: string;
  [key: string]: unknown;
}

const FIRE_AND_FORGET_UI_METHODS = new Set([
  "notify",
  "setStatus",
  "setWidget",
  "setTitle",
  "set_editor_text",
]);

/** Fail closed on dialog/unknown UI requests; ignore documented fire-and-forget RPC UI events. */
export function isBlockingRpcUiRequest(event: RpcEvent): boolean {
  if (event.type === "ui_request") return true;
  if (event.type !== "extension_ui_request") return false;
  return typeof event.method !== "string" || !FIRE_AND_FORGET_UI_METHODS.has(event.method);
}

export interface RpcFramedReaderOptions {
  /** Max bytes per record before an "oversized" error is emitted. */
  maxRecordBytes?: number;
}

type LineListener = (line: string) => void;
type ErrorListener = (err: Error) => void;

/**
 * Incremental LF-only line reader. Mirrors jsonl.js: StringDecoder for chunked
 * UTF-8, split on `\n`, strip ONE trailing `\r`, flush the tail on end().
 * Emits "line" for each complete record and "error" for an oversized record.
 */
export class RpcFramedReader {
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private readonly maxRecordBytes: number;
  private lineListeners: LineListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private ended = false;

  constructor(opts: RpcFramedReaderOptions = {}) {
    this.maxRecordBytes = opts.maxRecordBytes ?? 4 * 1024 * 1024; // 4 MiB default
  }

  on(event: "line", fn: LineListener): void;
  on(event: "error", fn: ErrorListener): void;
  on(event: "line" | "error", fn: LineListener | ErrorListener): void {
    if (event === "line") this.lineListeners.push(fn as LineListener);
    else this.errorListeners.push(fn as ErrorListener);
  }

  /** Feed a chunk of bytes. Emits "line" for each complete record. */
  push(chunk: Buffer | Uint8Array): void {
    if (this.ended) return;
    // StringDecoder handles multi-byte chars split across chunks.
    this.buffer += this.decoder.write(chunk as Buffer);

    let nl: number;
    // The size guard is checked BEFORE appending new bytes would exceed the cap.
    // (We measure the in-progress record length, not the whole buffer, which
    // already excludes emitted lines.)
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      let line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      // CRLF tolerance: strip exactly ONE trailing `\r`. A bare `\r` inside
      // content is preserved (it's not a separator).
      if (line.endsWith("\r")) line = line.slice(0, -1);
      // An oversized COMPLETE record is an error, not a line.
      if (line.length > this.maxRecordBytes) {
        const err = new Error(
          `rpc: oversized record (${line.length} > ${this.maxRecordBytes} bytes)`,
        );
        for (const fn of this.errorListeners) fn(err);
        continue;
      }
      this.emitLine(line);
    }
    // If the accumulated (unterminated) record exceeds the cap, error + clear.
    if (this.buffer.length > this.maxRecordBytes) {
      const err = new Error(
        `rpc: oversized record (${this.buffer.length} > ${this.maxRecordBytes} bytes)`,
      );
      this.buffer = "";
      for (const fn of this.errorListeners) fn(err);
    }
  }

  /** Flush any trailing unterminated record, then mark ended. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    // StringDecoder.end() returns any final partial UTF-8 bytes.
    const tail = this.decoder.end();
    if (tail.length) this.buffer += tail;
    if (this.buffer.length > 0) {
      let line = this.buffer;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.buffer = "";
      if (line.length > this.maxRecordBytes) {
        const err = new Error(
          `rpc: oversized record on end (${line.length} > ${this.maxRecordBytes} bytes)`,
        );
        for (const fn of this.errorListeners) fn(err);
        return;
      }
      this.emitLine(line);
    }
  }

  private emitLine(line: string): void {
    for (const fn of this.lineListeners) fn(line);
  }

  /** Bytes accumulated for the not-yet-terminated record. */
  pendingBytes(): number {
    return this.buffer.length;
  }
}

/**
 * Parse one raw JSON-line into an object, or null for non-object / non-JSON.
 * Non-JSON lines (stderr bleed, banner text) are ignored, not fatal — mirrors
 * rpc-client.js's `catch {}` swallow.
 */
export function parseRpcLine(line: string): RpcRecord | null {
  if (line.length === 0) return null;
  try {
    const v = JSON.parse(line);
    // Only object records are meaningful; arrays/numbers/strings are ignored.
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    return v as RpcRecord;
  } catch {
    return null;
  }
}

/** Serialize a command object as a single LF-terminated JSON line. */
export function serializeCommand(cmd: RpcRecord): Buffer {
  return Buffer.from(JSON.stringify(cmd) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// RpcDispatcher — the parser-level consumer of the framed records.
//
// The framing layer (RpcFramedReader) splits bytes into lines; the dispatcher
// classifies each record, resolves pending command promises on matching
// response ids, surfaces unknown-id responses as `wrongId` (never fatal —
// mirrors rpc-client.js, which ignores uncorrelated responses), streams
// events, and rejects every still-pending command with an early-exit error
// when the stream closes before a response arrives.
// ---------------------------------------------------------------------------

type EventListener = (ev: RpcEvent) => void;
type WrongIdListener = (rec: RpcRecord) => void;
type EndListener = () => void;

export class RpcDispatcher {
  private readonly reader: RpcFramedReader;
  private readonly pending = new Map<string | number, (res: RpcRecord | Error) => void>();
  private readonly eventListeners: EventListener[] = [];
  private readonly wrongIdListeners: WrongIdListener[] = [];
  private readonly endListeners: EndListener[] = [];
  private closed = false;

  constructor(opts: RpcFramedReaderOptions = {}) {
    this.reader = new RpcFramedReader(opts);
    this.reader.on("line", (line) => this.handleLine(line));
    this.reader.on("error", () => this.close());
  }

  on(event: "event", fn: EventListener): void;
  on(event: "wrongId", fn: WrongIdListener): void;
  on(event: "end", fn: EndListener): void;
  on(event: "event" | "wrongId" | "end", fn: EventListener | WrongIdListener | EndListener): void {
    if (event === "event") this.eventListeners.push(fn as EventListener);
    else if (event === "wrongId") this.wrongIdListeners.push(fn as WrongIdListener);
    else this.endListeners.push(fn as EndListener);
  }

  /**
   * Register a pending command id. Resolves with the matching response record,
   * or rejects with an early-exit Error if the stream closes first. A response
   * with an id that was never registered is surfaced via `wrongId`, not here.
   */
  registerPending(id: string | number): Promise<RpcRecord> {
    return new Promise<RpcRecord>((resolve, reject) => {
      this.pending.set(id, (res) => {
        if (res instanceof Error) reject(res);
        else resolve(res);
      });
    });
  }

  /** Feed a chunk of bytes from the RPC stream (e.g. child stdout). */
  push(chunk: Buffer | Uint8Array): void {
    this.reader.push(chunk);
  }

  /** Signal stream end (e.g. child stdout closed / early process exit). */
  end(): void {
    this.reader.end();
    this.close();
  }

  private handleLine(line: string): void {
    const rec = parseRpcLine(line);
    if (!rec) return;
    if (rec.type === "response" && rec.id != null) {
      const resolve = this.pending.get(rec.id);
      if (resolve) {
        this.pending.delete(rec.id);
        resolve(rec);
      } else {
        // Unknown / uncorrelated response id — not fatal. Surface for diagnostics.
        for (const fn of this.wrongIdListeners) fn(rec);
      }
      return;
    }
    // Non-response record (agent_*, message_*, turn_*, extension_ui_request) is an event.
    for (const fn of this.eventListeners) fn(rec as RpcEvent);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    // Reject every still-pending command: the stream closed before a response.
    const err = new Error("rpc: stream closed before response (early process exit)");
    for (const resolve of this.pending.values()) resolve(err);
    this.pending.clear();
    for (const fn of this.endListeners) fn();
  }
}
