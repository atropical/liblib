/// <reference types="@figma/plugin-typings" />

import { ApiWarning, MessageTypes, PluginCommands, PluginMessage, UsageScope } from "@atropical/liblib-core/types";
import { buildSnapshot, DEFAULT_OPTIONS, probeSnapshot } from "./snapshot/buildSnapshot";
import { buildUsage, DEFAULT_USAGE_OPTIONS, probeUsage, summariseSelection } from "./snapshot/buildUsage";

figma.showUI(__html__, { width: 640, height: 640, themeColors: true });

/**
 * postMessage cannot carry a Symbol, and `figma.mixed` is one. Any property the
 * API starts returning as mixed without the typings saying so would otherwise
 * fail the whole export with "Cannot unwrap symbol", so the boundary swaps it
 * for the same `"mixed"` marker `mixedOr` writes, and tells the UI which
 * property did it so the user can report it.
 */
function postToUI(message: PluginMessage): void {
  const warnings = new Map<string, ApiWarning>();
  const clean = (value: unknown, path: string): unknown => {
    if (typeof value === "symbol") {
      const property = path.slice(path.lastIndexOf(".") + 1).replace(/\[\d+\]$/, "");
      if (!warnings.has(property)) {
        warnings.set(property, { property, example: path });
        console.warn(`LibLib: replaced a symbol at ${path} with "mixed"`);
      }
      return "mixed";
    }
    if (typeof value === "function") return undefined;
    if (Array.isArray(value)) return value.map((item, i) => clean(item, `${path}[${i}]`));
    if (value && typeof value === "object" && !ArrayBuffer.isView(value)) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) out[key] = clean(item, `${path}.${key}`);
      return out;
    }
    return value;
  };
  figma.ui.postMessage(clean(message, "message"));
  if (warnings.size > 0) {
    figma.ui.postMessage({
      type: MessageTypes.API_WARNING,
      apiWarnings: Array.from(warnings.values()),
      editorType: figma.editorType,
    } as PluginMessage);
  }
}

figma.on("run", ({ command }) => {
  postToUI({
    type: MessageTypes.BASIC_INFO,
    command: (command as PluginCommands) || PluginCommands.SNAPSHOT,
    editorType: figma.editorType || "figma",
  } as PluginMessage);
});

/** The scope the UI last asked about, so a selection change can be answered in kind. */
let watchedScope: UsageScope | null = null;

figma.on("selectionchange", () => {
  if (watchedScope !== "selection") return;
  void postSelection("selection");
});

async function postSelection(scope: UsageScope): Promise<void> {
  try {
    const selection = await summariseSelection(scope);
    postToUI({ type: MessageTypes.SELECTION_RESULT, selection } as PluginMessage);
  } catch (error) {
    console.error(error);
  }
}

const progress = (stage: string, scanned: number, total: number) =>
  postToUI({ type: MessageTypes.SNAPSHOT_PROGRESS, stage, scanned, total } as PluginMessage);

function reportError(error: unknown, fallback: string): void {
  console.error(error);
  postToUI({
    type: MessageTypes.SNAPSHOT_ERROR,
    error: error instanceof Error ? error.message : fallback,
  } as PluginMessage);
}

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === MessageTypes.REQUEST_SELECTION) {
    watchedScope = msg.usageOptions?.scope ?? "selection";
    await postSelection(watchedScope);
    return;
  }

  if (msg.type === MessageTypes.PROBE || msg.type === MessageTypes.PROBE_USAGE) {
    try {
      const probe =
        msg.type === MessageTypes.PROBE_USAGE
          ? await probeUsage(msg.usageOptions ?? DEFAULT_USAGE_OPTIONS)
          : await probeSnapshot(msg.options ?? DEFAULT_OPTIONS);
      postToUI({ type: MessageTypes.PROBE_RESULT, probe } as PluginMessage);
    } catch (error) {
      console.error(error);
      // A failed probe only costs the user an estimate, so it degrades to
      // silence rather than blocking the scan behind an error.
      postToUI({ type: MessageTypes.PROBE_RESULT } as PluginMessage);
    }
    return;
  }

  if (msg.type === MessageTypes.BUILD_USAGE) {
    try {
      const usage = await buildUsage(msg.usageOptions ?? DEFAULT_USAGE_OPTIONS, progress);
      postToUI({ type: MessageTypes.USAGE_RESULT, usage } as PluginMessage);
    } catch (error) {
      reportError(error, "Unknown error while reading this file's library usage");
    }
    return;
  }

  if (msg.type !== MessageTypes.BUILD_SNAPSHOT) return;

  try {
    const snapshot = await buildSnapshot(msg.options ?? DEFAULT_OPTIONS, progress);
    postToUI({ type: MessageTypes.SNAPSHOT_RESULT, snapshot } as PluginMessage);
  } catch (error) {
    reportError(error, "Unknown error while building the snapshot");
  }
};
