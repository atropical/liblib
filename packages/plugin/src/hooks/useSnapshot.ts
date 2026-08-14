import { useCallback, useEffect, useRef, useState } from "react";
import { MessageTypes, PluginMessage, ProbeResult, Snapshot, SnapshotOptions } from "@atropical/liblib-core/types";

export interface SnapshotState {
  snapshot: Snapshot | null;
  building: boolean;
  progress: { stage: string; scanned: number; total: number } | null;
  error: string | null;
}

/**
 * Owns the request/response round-trip with the plugin thread. Both views need
 * a snapshot of the current file, so the logic lives here rather than being
 * duplicated per view.
 */
export function useSnapshot() {
  const [state, setState] = useState<SnapshotState>({
    snapshot: null,
    building: false,
    progress: null,
    error: null,
  });
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  // Options can change faster than the plugin thread answers; only the newest
  // request's result may land, or the panel flickers between stale estimates.
  const probeToken = useRef(0);

  useEffect(() => {
    const handleMessage = ({ data: { pluginMessage } }: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
      if (!pluginMessage) return;

      switch (pluginMessage.type) {
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
        case MessageTypes.SNAPSHOT_RESULT:
          setState({
            snapshot: pluginMessage.snapshot ?? null,
            building: false,
            progress: null,
            error: null,
          });
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

  const build = useCallback((options: SnapshotOptions) => {
    setState({ snapshot: null, building: true, progress: null, error: null });
    parent.postMessage({ pluginMessage: { type: MessageTypes.BUILD_SNAPSHOT, options } }, "*");
  }, []);

  /** Returns to the setup step, discarding the result but keeping the probe. */
  const reset = useCallback(() => {
    setState({ snapshot: null, building: false, progress: null, error: null });
  }, []);

  const runProbe = useCallback((options: SnapshotOptions) => {
    probeToken.current += 1;
    setProbing(true);
    parent.postMessage({ pluginMessage: { type: MessageTypes.PROBE, options } }, "*");
  }, []);

  return { ...state, probe, probing, build, runProbe, reset };
}

/**
 * Re-probes when the options that affect cost change, after a pause — depth is
 * edited digit by digit, and each keystroke would otherwise queue a scan.
 */
export function useAutoProbe(
  options: SnapshotOptions,
  runProbe: (options: SnapshotOptions) => void,
  enabled = true,
) {
  const { depth, includeSizes, includeStyles, includeVariables } = options;

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => runProbe({ depth, includeSizes, includeStyles, includeVariables }), 400);
    return () => clearTimeout(timer);
  }, [depth, includeSizes, includeStyles, includeVariables, enabled, runProbe]);
}
