/// <reference types="@figma/plugin-typings" />

import { MessageTypes, PluginCommands, PluginMessage, UsageScope } from "./types.d";
import { buildSnapshot, DEFAULT_OPTIONS, probeSnapshot } from "./snapshot/buildSnapshot";
import { buildUsage, DEFAULT_USAGE_OPTIONS, probeUsage, summariseSelection } from "./snapshot/buildUsage";

figma.showUI(__html__, { width: 640, height: 640, themeColors: true });

figma.on("run", ({ command }) => {
  figma.ui.postMessage({
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
    figma.ui.postMessage({ type: MessageTypes.SELECTION_RESULT, selection } as PluginMessage);
  } catch (error) {
    console.error(error);
  }
}

const progress = (stage: string, scanned: number, total: number) =>
  figma.ui.postMessage({ type: MessageTypes.SNAPSHOT_PROGRESS, stage, scanned, total } as PluginMessage);

function reportError(error: unknown, fallback: string): void {
  console.error(error);
  figma.ui.postMessage({
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
      figma.ui.postMessage({ type: MessageTypes.PROBE_RESULT, probe } as PluginMessage);
    } catch (error) {
      console.error(error);
      // A failed probe only costs the user an estimate, so it degrades to
      // silence rather than blocking the scan behind an error.
      figma.ui.postMessage({ type: MessageTypes.PROBE_RESULT } as PluginMessage);
    }
    return;
  }

  if (msg.type === MessageTypes.BUILD_USAGE) {
    try {
      const usage = await buildUsage(msg.usageOptions ?? DEFAULT_USAGE_OPTIONS, progress);
      figma.ui.postMessage({ type: MessageTypes.USAGE_RESULT, usage } as PluginMessage);
    } catch (error) {
      reportError(error, "Unknown error while reading this file's library usage");
    }
    return;
  }

  if (msg.type !== MessageTypes.BUILD_SNAPSHOT) return;

  try {
    const snapshot = await buildSnapshot(msg.options ?? DEFAULT_OPTIONS, progress);
    figma.ui.postMessage({ type: MessageTypes.SNAPSHOT_RESULT, snapshot } as PluginMessage);
  } catch (error) {
    reportError(error, "Unknown error while building the snapshot");
  }
};
