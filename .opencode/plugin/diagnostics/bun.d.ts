// eslint-disable-next-line no-var
declare var Bun: {
  which(name: string): string | null;
  spawn(opts: {
    bin: string;
    args: string[];
    cwd?: string;
    signal?: AbortSignal;
    stdio?: Array<"ignore" | "pipe">;
  }): {
    exited: Promise<number>;
    stdout: ReadableStream;
    stderr: ReadableStream;
  };
};
