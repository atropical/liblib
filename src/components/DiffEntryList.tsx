import React, { useState } from "react";
import { Flex, Text } from "figma-kit";
import { DiffEntry } from "../types.d";
import { formatValue } from "../snapshot/diff";

interface DiffEntryListProps {
  entries: DiffEntry[];
}

/** Rendering every entry of a large diff stalls the panel; the rest is in the report. */
const RENDER_LIMIT = 300;
/** Per entry — a component with hundreds of changed fields is read in the file, not here. */
const CHANGE_LIMIT = 40;

const KIND_COLOUR: Record<DiffEntry["kind"], string> = {
  added: "var(--figma-color-text-success)",
  removed: "var(--figma-color-text-danger)",
  renamed: "var(--figma-color-text-warning)",
  modified: "var(--figma-color-text-brand)",
  // Not a change in the design — a statement about what this export covered.
  "out-of-scope": "var(--figma-color-text-tertiary)",
};

export const DiffEntryList: React.FC<DiffEntryListProps> = ({ entries }) => {
  if (entries.length === 0) {
    return (
      <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
        No changes between the two snapshots.
      </Text>
    );
  }

  const visible = entries.slice(0, RENDER_LIMIT);

  return (
    <Flex direction="column" gap="1" style={{ minHeight: 0, overflowY: "auto" }}>
      {visible.map((entry) => (
        <EntryRow key={`${entry.kind}-${entry.key}-${entry.name}`} entry={entry} />
      ))}
      {entries.length > visible.length && (
        <Text size="small" style={{ color: "var(--figma-color-text-tertiary)", padding: "4px 0" }}>
          {entries.length - visible.length} more changes — in the report, not shown here.
        </Text>
      )}
    </Flex>
  );
};

const EntryRow: React.FC<{ entry: DiffEntry }> = ({ entry }) => {
  const [open, setOpen] = useState(false);
  const expandable = entry.changes.length > 0;
  const shown = entry.changes.slice(0, CHANGE_LIMIT);

  return (
    <Flex
      direction="column"
      style={{ borderBottom: "1px solid var(--figma-color-border)", padding: "4px 0" }}
    >
      <Flex
        direction="row"
        gap="2"
        align="center"
        onClick={() => expandable && setOpen((previous) => !previous)}
        style={{ cursor: expandable ? "pointer" : "default", minWidth: 0 }}
      >
        <Text size="small" style={{ color: "var(--figma-color-text-tertiary)", width: "1em" }}>
          {expandable ? (open ? "▾" : "▸") : ""}
        </Text>
        <Text
          size="small"
          weight="strong"
          style={{ color: KIND_COLOUR[entry.kind], flex: "0 0 auto" }}
        >
          {entry.kind}
        </Text>
        <Text
          size="small"
          style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {entry.name}
        </Text>
        {expandable && (
          <Text size="small" style={{ color: "var(--figma-color-text-tertiary)", flex: "0 0 auto" }}>
            {entry.changes.length}
          </Text>
        )}
      </Flex>

      {entry.previousName && (
        <Text size="small" style={{ color: "var(--figma-color-text-secondary)", marginLeft: "2em" }}>
          was {entry.previousName}
        </Text>
      )}

      {open && (
        <Flex direction="column" gap="2" style={{ marginLeft: "2em", marginTop: 4, marginBottom: 4 }}>
          {shown.map((change) => (
            <Flex key={change.path} direction="column" style={{ minWidth: 0 }}>
              <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
                {change.path}
              </Text>
              {/* Absent on one side means added or removed, not changed to
                  nothing — so that side is omitted rather than shown empty. */}
              {change.before !== undefined && <ValueLine sign="−" value={change.before} kind="before" />}
              {change.after !== undefined && <ValueLine sign="+" value={change.after} kind="after" />}
            </Flex>
          ))}
          {entry.changes.length > shown.length && (
            <Text size="small" style={{ color: "var(--figma-color-text-tertiary)" }}>
              +{entry.changes.length - shown.length} more fields — in the report.
            </Text>
          )}
        </Flex>
      )}
    </Flex>
  );
};

const ValueLine: React.FC<{ sign: string; value: unknown; kind: "before" | "after" }> = ({
  sign,
  value,
  kind,
}) => (
  <div
    style={{
      display: "flex",
      gap: 6,
      fontFamily: '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 10,
      lineHeight: 1.5,
      padding: "1px 4px",
      borderRadius: 2,
      minWidth: 0,
      color: kind === "before" ? "var(--figma-color-text-danger)" : "var(--figma-color-text-success)",
      backgroundColor:
        kind === "before"
          ? "var(--figma-color-bg-danger-tertiary, rgba(255,90,90,.12))"
          : "var(--figma-color-bg-success-tertiary, rgba(90,200,120,.12))",
    }}
  >
    <span style={{ flex: "0 0 auto", opacity: 0.8 }}>{sign}</span>
    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{formatValue(value)}</span>
  </div>
);
