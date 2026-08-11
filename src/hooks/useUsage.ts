import { useCallback, useEffect, useState } from "react";
import {
  MessageTypes,
  PluginMessage,
  ProbeResult,
  SelectionSummary,
  UsageOptions,
  UsageSnapshot,
} from "../types.d";

export interface UsageState {
  usage: UsageSnapshot | null;
  building: boolean;
  progress: { stage: string; scanned: number; total: number } | null;
  error: string | null;
}

/**
 * The usage counterpart to `useSnapshot`. It carries one thing that scan does
 * not: a live view of what the current scope covers, because a usage scan is
 * driven by the selection and the user needs to see what they picked before
 * they pay for a scan of it.
 */
export function useUsage() {
  const [state, setState] = useState<UsageState>({
    usage: null,
    building: false,
    progress: null,
    error: null,
  });
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [selection, setSelection] = useState<SelectionSummary | null>(null);

  useEffect(() => {
    const handleMessage = ({ data: { pluginMessage } }: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
      if (!pluginMessage) return;

      switch (pluginMessage.type) {
        case MessageTypes.SELECTION_RESULT:
          setSelection(pluginMessage.selection ?? null);
          break;
        case MessageTypes.PROBE_RESULT:
          setProbing(false);
          setProbe(pluginMessage.probe ?? null);
          break;
        case MessageTypes.SNAPSHOT_PROGRESS:
          setState((previous) => ({
            ...previous,
            progress: {
              stage: pluginMessage.stage ?? "",
              scanned: pluginMessage.scanned ?? 0,
              total: pluginMessage.total ?? 0,
            },
          }));
          break;
        case MessageTypes.USAGE_RESULT:
          setState({ usage: pluginMessage.usage ?? null, building: false, progress: null, error: null });
          break;
        case MessageTypes.SNAPSHOT_ERROR:
          setState((previous) => ({
            ...previous,
            building: false,
            progress: null,
            error: pluginMessage.error ?? "Unknown error",
          }));
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const build = useCallback((usageOptions: UsageOptions) => {
    setState({ usage: null, building: true, progress: null, error: null });
    parent.postMessage({ pluginMessage: { type: MessageTypes.BUILD_USAGE, usageOptions } }, "*");
  }, []);

  const reset = useCallback(() => {
    setState({ usage: null, building: false, progress: null, error: null });
  }, []);

  const runProbe = useCallback((usageOptions: UsageOptions) => {
    setProbing(true);
    parent.postMessage({ pluginMessage: { type: MessageTypes.PROBE_USAGE, usageOptions } }, "*");
  }, []);

  const watchSelection = useCallback((usageOptions: UsageOptions) => {
    parent.postMessage({ pluginMessage: { type: MessageTypes.REQUEST_SELECTION, usageOptions } }, "*");
  }, []);

  return { ...state, probe, probing, selection, build, runProbe, watchSelection, reset };
}

/**
 * Re-probes after a pause when an option that changes cost changes. The scope
 * is in the dependency list too — switching from a selection to the whole file
 * is the single biggest cost change available here.
 */
export function useAutoUsageProbe(
  options: UsageOptions,
  runProbe: (options: UsageOptions) => void,
  watchSelection: (options: UsageOptions) => void,
  /** Changes when the user selects different frames, which changes the cost. */
  selectionKey: string,
  enabled = true,
) {
  const { scope, depth, instanceContent, includeSizes, includeStyles, includeVariables, flagDeviations } =
    options;

  useEffect(() => {
    if (!enabled) return;
    watchSelection(options);
    const timer = setTimeout(() => runProbe(options), 400);
    return () => clearTimeout(timer);
    // `options` is rebuilt on every render; the fields it is made of are what
    // actually decide whether a re-probe is owed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scope,
    depth,
    instanceContent,
    includeSizes,
    includeStyles,
    includeVariables,
    flagDeviations,
    selectionKey,
    enabled,
    runProbe,
    watchSelection,
  ]);
}
