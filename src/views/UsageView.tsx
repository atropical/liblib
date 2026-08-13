import React, { useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportLayout } from "../components/ExportLayout";
import { FormatSelector } from "../components/FormatSelector";
import { UsageOptionsPanel } from "../components/UsageOptionsPanel";
import { EstimatePanel } from "../components/EstimatePanel";
import { OutputPreview } from "../components/OutputPreview";
import { useAutoUsageProbe, useUsage } from "../hooks/useUsage";
import { useEncodedOutput } from "../hooks/useEncodedOutput";
import { DEFAULT_USAGE_OPTIONS } from "../snapshot/buildUsage";
import { DEFAULT_FORMAT, encodeUsage, FORMATS, OutputFormats } from "../snapshot/encode";
import { downloadText, slugify } from "../utils/download";
import { UsageOptions } from "../types.d";
import { mimeFor } from "./SnapshotView";

interface UsageViewProps {
  editorType?: string;
}

export const UsageView: React.FC<UsageViewProps> = ({ editorType }) => {
  const { usage, building, progress, error, build, probe, probing, selection, runProbe, watchSelection, reset } =
    useUsage();
  const [options, setOptions] = useState<UsageOptions>(DEFAULT_USAGE_OPTIONS);
  const selectionKey = selection?.frames.map((frame) => frame.nodeId).join(",") ?? "";
  useAutoUsageProbe(options, runProbe, watchSelection, selectionKey, !building && !usage);

  const [format, setFormat] = useState<OutputFormats>(DEFAULT_FORMAT);
  const { outputs, tokens } = useEncodedOutput(usage, encodeUsage);

  const descriptor = FORMATS.find((entry) => entry.format === format)!;
  const fileName = usage
    ? `${slugify(usage.meta.fileName)}.usage.${descriptor.extension}`
    : `usage.${descriptor.extension}`;

  return (
    <PluginDialogShell
      scrollKey={usage ? "result" : "setup"}
      header={
        usage ? (
          <Flex direction="row" gap="3" align="center" wrap="wrap">
            <Button variant="secondary" onClick={reset}>
              ← Scan again
            </Button>
            <Text weight="strong">{usage.meta.fileName}</Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="1">
            <Text weight="strong">Export what this file uses from your library</Text>
            <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
              Run this in a design file, not in the library. It writes each frame with the component and
              variant behind every instance, so an agent reads the design instead of inferring it.
            </Text>
          </Flex>
        )
      }
    >
      <ExportLayout
        editorType={editorType}
        preview={
          usage ? (
            <OutputPreview
              content={outputs[format]}
              language={descriptor.language}
              previewId="liblib-usage"
              onDownload={() => downloadText(fileName, outputs[format], mimeFor(format))}
              downloadLabel={`Download .${descriptor.extension}`}
            />
          ) : null
        }
      >
        {usage ? (
          <>
            <Flex direction="row" gap="2" wrap="wrap">
              {Object.entries(usage.meta.counts).map(([name, count]) => (
                <Text key={name} size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                  {name}: {count}
                </Text>
              ))}
            </Flex>

            <FormatSelector value={format} onChange={setFormat} tokens={tokens} />
          </>
        ) : (
          <>
            <UsageOptionsPanel
              options={options}
              onChange={setOptions}
              selection={selection}
              disabled={building}
            />

            <EstimatePanel probe={probe} probing={probing} unit="frames" />

            <Button
              variant="primary"
              onClick={() => build(options)}
              disabled={building || selection?.frames.length === 0}
              style={{ width: "100%" }}
            >
              {building ? "Scanning…" : "Scan frames"}
            </Button>

            {building && progress && (
              <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                {progress.stage}: {progress.scanned}/{progress.total}
              </Text>
            )}
            {error && <Text style={{ color: "var(--figma-color-text-danger)" }}>{error}</Text>}
          </>
        )}
      </ExportLayout>
    </PluginDialogShell>
  );
};
