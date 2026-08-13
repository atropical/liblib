import React, { useMemo, useRef, useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportLayout } from "../components/ExportLayout";
import { FormatSelector } from "../components/FormatSelector";
import { UsageOptionsPanel } from "../components/UsageOptionsPanel";
import { EstimatePanel } from "../components/EstimatePanel";
import { DiffEntryList } from "../components/DiffEntryList";
import { OutputPreview } from "../components/OutputPreview";
import { useAutoUsageProbe, useUsage } from "../hooks/useUsage";
import { useEncodedOutput } from "../hooks/useEncodedOutput";
import { DEFAULT_USAGE_OPTIONS } from "../snapshot/buildUsage";
import { diffUsage } from "../snapshot/diff";
import { DEFAULT_FORMAT, encodeUsageDiff, FORMATS, OutputFormats, parseUsage } from "../snapshot/encode";
import { downloadText, readFileAsText, slugify } from "../utils/download";
import { UsageOptions, UsageSnapshot } from "../types.d";
import { mimeFor } from "./SnapshotView";

interface UsageDiffViewProps {
  editorType?: string;
}

export const UsageDiffView: React.FC<UsageDiffViewProps> = ({ editorType }) => {
  const { usage, building, progress, error, build, probe, probing, selection, runProbe, watchSelection, reset } =
    useUsage();
  const [options, setOptions] = useState<UsageOptions>(DEFAULT_USAGE_OPTIONS);
  const selectionKey = selection?.frames.map((frame) => frame.nodeId).join(",") ?? "";
  useAutoUsageProbe(options, runProbe, watchSelection, selectionKey, !building && !usage);

  const [format, setFormat] = useState<OutputFormats>(DEFAULT_FORMAT);
  const [base, setBase] = useState<UsageSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const report = useMemo(() => (base && usage ? diffUsage(base, usage) : null), [base, usage]);
  const { outputs, tokens } = useEncodedOutput(report, encodeUsageDiff);

  const descriptor = FORMATS.find((entry) => entry.format === format)!;
  const fileName = usage
    ? `${slugify(usage.meta.fileName)}.usage-diff.${descriptor.extension}`
    : `usage-diff.${descriptor.extension}`;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    try {
      setBase(parseUsage(await readFileAsText(file), file.name));
    } catch (cause) {
      setBase(null);
      setLoadError(cause instanceof Error ? cause.message : "Could not read that file");
    } finally {
      event.target.value = "";
    }
  };

  const entries = report
    ? [...report.frames, ...report.components, ...report.deviations, ...report.styles, ...report.variables]
    : [];

  return (
    <PluginDialogShell
      scrollKey={report ? "result" : "setup"}
      header={
        report ? (
          <Flex direction="column" gap="1">
            <Flex direction="row" gap="3" align="center" wrap="wrap">
              <Button variant="secondary" onClick={reset}>
                ← Compare again
              </Button>
              <Text weight="strong">
                {report.summary.added} added · {report.summary.removed} removed ·{" "}
                {report.summary.renamed} renamed · {report.summary.modified} modified
              </Text>
            </Flex>
            {(report.notes ?? []).map((note) => (
              <Text key={note} size="small" style={{ color: "var(--figma-color-text-warning)" }}>
                {note.replace(/`/g, "")}
              </Text>
            ))}
            {report.summary.outOfScope > 0 && (
              <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                {report.summary.outOfScope} entr{report.summary.outOfScope === 1 ? "y" : "ies"} in the base
                were outside this export's scope — reported as not covered, not as removed.
              </Text>
            )}
          </Flex>
        ) : (
          <Flex direction="column" gap="1">
            <Text weight="strong">Diff against a previous usage snapshot</Text>
            <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
              Load the usage file your last run produced and rescan. Frames the new export does not cover
              are reported as such rather than as deletions.
            </Text>
          </Flex>
        )
      }
    >
      <ExportLayout
        editorType={editorType}
        preview={
          report ? (
            <OutputPreview
              content={outputs[format]}
              language={descriptor.language}
              previewId="liblib-usage-diff"
              onDownload={() => downloadText(fileName, outputs[format], mimeFor(format))}
              downloadLabel={`Download .${descriptor.extension}`}
            />
          ) : null
        }
      >
        {report ? (
          <>
            <FormatSelector value={format} onChange={setFormat} tokens={tokens} />
            <DiffEntryList entries={entries} />
          </>
        ) : (
          <>
            <Flex direction="column" gap="2">
              <Button onClick={() => fileInput.current?.click()} style={{ width: "100%" }}>
                Load base usage snapshot…
              </Button>
              <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                {base
                  ? `${base.meta.fileName} · ${base.meta.scope.frames.length} frames · ${base.meta.generatedAt}`
                  : "No base loaded (.json or .toon)"}
              </Text>
              {loadError && <Text style={{ color: "var(--figma-color-text-danger)" }}>{loadError}</Text>}
            </Flex>

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
              disabled={building || !base || selection?.frames.length === 0}
              style={{ width: "100%" }}
            >
              {building ? "Scanning…" : "Scan and compare"}
            </Button>

            {building && progress && (
              <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                {progress.stage}: {progress.scanned}/{progress.total}
              </Text>
            )}
            {error && <Text style={{ color: "var(--figma-color-text-danger)" }}>{error}</Text>}
          </>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".json,.toon,application/json,text/plain"
          onChange={handleFile}
          style={{ display: "none" }}
        />
      </ExportLayout>
    </PluginDialogShell>
  );
};
