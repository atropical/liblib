import React, { useEffect, useState } from "react";
import { Flex, Text } from "figma-kit";
import { estimateScanStepwise, formatBytes, formatDuration, ScanEstimate } from "../snapshot/estimate";
import { FORMATS } from "@atropical/liblib-core/snapshot/encode";
import { formatTokenRange } from "../utils/tokens";
import { ProbeResult } from "@atropical/liblib-core/types";

interface EstimatePanelProps {
  probe: ProbeResult | null;
  probing: boolean;
  /** What the roots are: components in a library scan, frames in a usage scan. */
  unit?: "components" | "frames";
  /** A scan has started: stop working out an estimate nobody is waiting for. */
  paused?: boolean;
}

/**
 * Shows what a full scan will cost before the user starts one. On a large
 * icon library the difference between depth 2 and depth 8 is minutes of
 * waiting and hundreds of thousands of tokens, and that is worth knowing in
 * advance rather than after.
 */
export const EstimatePanel: React.FC<EstimatePanelProps> = ({ probe, probing, unit = "components", paused }) => {
  const [estimate, setEstimate] = useState<ScanEstimate | null>(null);

  useEffect(() => {
    if (!probe || paused) return;
    let cancelled = false;
    void estimateScanStepwise(probe, () => cancelled).then((next) => {
      if (next) setEstimate(next);
    });
    return () => {
      cancelled = true;
    };
  }, [probe, paused]);

  if (paused) return null;
  if (!estimate) {
    if (!probing && !probe) return null;
    return (
      <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
        Sizing up this file…
      </Text>
    );
  }

  return (
    <Flex
      direction="column"
      gap="1"
      style={{
        border: "1px solid var(--figma-color-border)",
        borderRadius: 4,
        padding: 8,
        opacity: probing ? 0.5 : 1,
      }}
    >
      <Text size="small" weight="strong">
        {estimate.componentCount.toLocaleString()} {unit} ·{" "}
        {estimate.approximate ? "~" : ""}
        {estimate.totalNodes.toLocaleString()} nodes · scan {formatDuration(estimate.millis)}
      </Text>
      {FORMATS.map((descriptor) => {
        const forFormat = estimate.perFormat[descriptor.format];
        return (
          <Text key={descriptor.format} size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
            {descriptor.label}: {formatTokenRange(forFormat.tokens)} tokens · {formatBytes(forFormat.bytes)}
          </Text>
        );
      })}
      <Text size="small" style={{ color: "var(--figma-color-text-tertiary)" }}>
        Fitted from {estimate.sampleSize} sampled {unit} against an exact node count for the whole
        scope. Expect a few percent out; more when the {unit} vary a lot in size.
        {estimate.approximate && ` This file is large, so nodes were counted on a spread of ${unit} and scaled up.`}
      </Text>
    </Flex>
  );
};
