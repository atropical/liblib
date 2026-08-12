import React, { useMemo, useRef, useState } from "react";
import { Button, Flex, Text } from "figma-kit";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportLayout } from "../components/ExportLayout";
import { FormatSelector } from "../components/FormatSelector";
import { OptionsPanel } from "../components/OptionsPanel";
import { EstimatePanel } from "../components/EstimatePanel";
import { DiffEntryList } from "../components/DiffEntryList";
import { OutputPreview } from "../components/OutputPreview";
import { useAutoProbe, useSnapshot } from "../hooks/useSnapshot";
import { useEncodedOutput } from "../hooks/useEncodedOutput";
import { DEFAULT_OPTIONS } from "../snapshot/buildSnapshot";
import { diffSnapshots } from "../snapshot/diff";
import { DEFAULT_FORMAT, encodeDiff, FORMATS, OutputFormats, parseSnapshot } from "../snapshot/encode";
import { downloadText, readFileAsText, slugify } from "../utils/download";
import { Snapshot, SnapshotOptions } from "../types.d";
import { mimeFor } from "./SnapshotView";

interface DiffViewProps {
  editorType?: string;
}

export const DiffView: React.FC<DiffViewProps> = ({ editorType }) => {
  const { snapshot, building, progress, error, build, probe, probing, runProbe, reset } = useSnapshot();
  const [options, setOptions] = useState<SnapshotOptions>(DEFAULT_OPTIONS);
  // Probing rescans the file; pointless once a full result is on screen.
  useAutoProbe(options, runProbe, !building && !snapshot);

  const [format, setFormat] = useState<OutputFormats>(DEFAULT_FORMAT);
  const [base, setBase] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const report = useMemo(
    () => (base && snapshot ? diffSnapshots(base, snapshot) : null),
    [base, snapshot],
  );
  const { outputs, tokens } = useEncodedOutput(report, encodeDiff);

  const descriptor = FORMATS.find((entry) => entry.format === format)!;
  const fileName = snapshot
    ? `${slugify(snapshot.meta.fileName)}.diff.${descriptor.extension}`
    : `diff.${descriptor.extension}`;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    try {
      setBase(parseSnapshot(await readFileAsText(file), file.name));
    } catch (cause) {
      setBase(null);
      setLoadError(cause instanceof Error ? cause.message : "Could not read that file");
    } finally {
      event.target.value = "";
    }
  };

  const entries = report ? [...report.components, ...report.styles, ...report.variables] : [];

  return (
    <PluginDialogShell
      scrollKey={report ? "result" : "setup"}
      header={
        report ? (
          <Flex direction="row" gap="3" align="center" wrap="wrap">
            <Button variant="secondary" onClick={reset}>
              ← Compare again
            </Button>
            <Text weight="strong">
              {report.summary.added} added · {report.summary.removed} removed · {report.summary.renamed}{" "}
              renamed · {report.summary.modified} modified
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="1">
            <Text weight="strong">Diff against a previous snapshot</Text>
            <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
              Load the snapshot your last run produced, rescan the file, and get a report of exactly what
              an agent needs to know.
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
              previewId="liblib-diff"
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
                Load base snapshot…
              </Button>
              <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                {base ? `${base.meta.fileName} · ${base.meta.generatedAt}` : "No base loaded (.json or .toon)"}
              </Text>
              {loadError && <Text style={{ color: "var(--figma-color-text-danger)" }}>{loadError}</Text>}
            </Flex>

            <OptionsPanel options={options} onChange={setOptions} disabled={building} />

            <EstimatePanel probe={probe} probing={probing} />

            <Button
              variant="primary"
              onClick={() => build(options)}
              disabled={building || !base}
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
