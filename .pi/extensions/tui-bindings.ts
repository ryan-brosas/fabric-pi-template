import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function tuiBindings(pi: ExtensionAPI) {
  pi.registerShortcut("ctrl+k", {
    description: "Compact the current session",
    handler: async (ctx) => {
      ctx.compact({
        customInstructions: "Preserve intent, file artifact trail, decisions, verification evidence, blockers, and next steps. Incorporate the durable session summary.",
        onError: (error) => ctx.ui.notify(`Compaction failed: ${error.message}`, "error"),
      });
    },
  });
}