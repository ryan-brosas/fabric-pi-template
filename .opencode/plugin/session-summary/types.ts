
export interface Decision {
  what: string;
  rationale: string;
}

export interface SessionSummaryData {
  intent: string;
  state: "exploring" | "implementing" | "verifying" | "done" | "unknown";
  files: {
    modified: Map<string, string>; // path → what changed
    created: Set<string>; // paths
    read: Map<string, string>; // path → why examined / key finding
  };
  decisions: Decision[];
  nextSteps: string[];
}

/** Max artifact entries before we start evicting oldest reads */
export const MAX_READS = 30;
export const MAX_MODIFIED = 20;
export const MAX_CREATED = 10;
export const MAX_DECISIONS = 10;
export const MAX_NEXT_STEPS = 8;
/** Target summary size in chars (~400 tokens * ~4 chars/token) */
export const MAX_SUMMARY_CHARS = 1600;
