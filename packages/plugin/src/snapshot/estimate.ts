import { ProbeResult } from "@atropical/liblib-core/types";
import { encodeAny, FORMATS, OutputFormats } from "@atropical/liblib-core/snapshot/encode";
import { estimateTokens } from "../utils/tokens";

export interface FormatEstimate {
  tokens: number;
  bytes: number;
}

export interface ScanEstimate {
  componentCount: number;
  sampleSize: number;
  totalNodes: number;
  /** Node count scaled up from a subset, because the file is huge. */
  approximate: boolean;
  /** Predicted wall-clock for a full scan, including the fixed overhead. */
  millis: number;
  perFormat: Record<OutputFormats, FormatEstimate>;
}

/**
 * Extrapolates a full scan from a sampled one.
 *
 * Cost is modelled as `fixed + a × components + b × nodes`. Both terms are
 * needed: a Markdown report spends most of its budget per component (a heading,
 * a row, a properties list), while TOON and JSON spend it per node. Fitting
 * only one of the two — as scaling by component count alone does — mispredicts
 * badly on any library whose components differ in size, which is most of them.
 *
 * The two coefficients come from the probe's two sample groups, one built from
 * the file's smaller components and one from its larger ones. The fixed term
 * is measured directly from a component-free encode, so it is never fitted.
 */
export function estimateScan(probe: ProbeResult): ScanEstimate {
  const perFormat = {} as Record<OutputFormats, FormatEstimate>;
  for (const descriptor of FORMATS) perFormat[descriptor.format] = estimateFormat(probe, descriptor.format);
  return assembleEstimate(probe, perFormat);
}

/**
 * The same estimate, one format per task, so the panel stays clickable while
 * it is worked out. Encoding the sample three ways is the expensive part, and
 * on a big library it held the UI thread long enough to swallow the click on
 * Scan. Resolves `null` as soon as `cancelled()` says the answer is unwanted.
 */
export async function estimateScanStepwise(
  probe: ProbeResult,
  cancelled: () => boolean,
): Promise<ScanEstimate | null> {
  const perFormat = {} as Record<OutputFormats, FormatEstimate>;
  for (const descriptor of FORMATS) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (cancelled()) return null;
    perFormat[descriptor.format] = estimateFormat(probe, descriptor.format);
  }
  return cancelled() ? null : assembleEstimate(probe, perFormat);
}

function estimateFormat(probe: ProbeResult, format: OutputFormats): FormatEstimate {
  const { componentCount, totalNodes, groups } = probe;
  // The probe sends only a slice of the styles and variables; scale them back up.
  const scale = probe.definitionScale ?? 1;
  const baseText = encodeAny(probe.base, format);
  const sliceTokens = estimateTokens(baseText);
  const sliceBytes = baseText.length;

  const measured = groups.map((group) => {
    const text = encodeAny(group.snapshot, format);
    return {
      components: group.componentCount,
      nodes: group.nodes,
      tokens: Math.max(0, estimateTokens(text) - sliceTokens),
      bytes: Math.max(0, text.length - sliceBytes),
    };
  });

  return {
    tokens: Math.round(
      sliceTokens * scale + fit(measured.map((m) => [m.components, m.nodes, m.tokens]), componentCount, totalNodes),
    ),
    bytes: Math.round(
      sliceBytes * scale + fit(measured.map((m) => [m.components, m.nodes, m.bytes]), componentCount, totalNodes),
    ),
  };
}

function assembleEstimate(probe: ProbeResult, perFormat: Record<OutputFormats, FormatEstimate>): ScanEstimate {
  const { componentCount, sampleSize, totalNodes, groups, overheadMs } = probe;
  const timing = groups.map((group): [number, number, number] => [
    group.componentCount,
    group.nodes,
    group.millis,
  ]);

  return {
    componentCount,
    sampleSize,
    totalNodes,
    approximate: probe.approximate ?? false,
    millis: overheadMs + fit(timing, componentCount, totalNodes),
    perFormat,
  };
}

type Observation = [components: number, nodes: number, cost: number];

/**
 * Solves `cost = a × components + b × nodes` from two observations and
 * evaluates it for the whole file.
 *
 * Falls back to scaling by nodes alone whenever the system is degenerate (the
 * two groups came out the same shape) or the solution is nonsensical (a
 * negative coefficient means the fit is being driven by noise, not signal).
 */
function fit(observations: Observation[], components: number, nodes: number): number {
  const totalNodes = observations.reduce((sum, [, n]) => sum + n, 0);
  const totalCost = observations.reduce((sum, [, , cost]) => sum + cost, 0);
  const byNodes = totalNodes > 0 ? totalCost * (nodes / totalNodes) : 0;

  if (observations.length < 2) return byNodes;

  const [[c1, n1, t1], [c2, n2, t2]] = observations;
  const determinant = c1 * n2 - c2 * n1;
  // Scale-relative tolerance: a determinant that is tiny next to the magnitudes
  // involved means the two equations are effectively the same one.
  if (Math.abs(determinant) < Math.max(1, (c1 * n2 + c2 * n1) * 1e-6)) return byNodes;

  const perComponent = (t1 * n2 - t2 * n1) / determinant;
  const perNode = (c1 * t2 - c2 * t1) / determinant;
  if (perComponent < 0 || perNode < 0) return byNodes;

  return perComponent * components + perNode * nodes;
}

/** `95 s` -> `~1 min 35 s`. Deliberately coarse: this is a prediction. */
export function formatDuration(millis: number): string {
  const seconds = Math.round(millis / 1000);
  if (seconds < 1) return "under a second";
  if (seconds < 60) return `~${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 10) return rest === 0 ? `~${minutes} min` : `~${minutes} min ${rest} s`;
  return `~${minutes} min`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
