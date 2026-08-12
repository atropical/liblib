import React from "react";
import { Checkbox, Flex, Input, SegmentedControl, Text } from "figma-kit";
import { InstanceContent, SelectionSummary, UsageOptions, UsageScope } from "../types.d";

interface UsageOptionsPanelProps {
  options: UsageOptions;
  onChange: (options: UsageOptions) => void;
  selection: SelectionSummary | null;
  disabled?: boolean;
}

// Segment labels stay to a word or two — the panel is narrow, and the sentence
// that explains each choice sits under the control rather than inside it.
const SCOPES: { value: UsageScope; label: string }[] = [
  { value: "selection", label: "Selection" },
  { value: "page", label: "Current page" },
  { value: "file", label: "Whole file" },
];

const INSTANCE_CONTENT: { value: InstanceContent; label: string; hint: string }[] = [
  {
    value: "boundary",
    label: "Boundary",
    hint: "Stops at each instance, recording what configures it and nothing below. Smallest by far.",
  },
  {
    value: "overrides",
    label: "Overrides",
    hint: "Also keeps the branches that carry an override or text — the design's own content, without the library's insides.",
  },
  {
    value: "full",
    label: "Everything",
    hint: "Walks inside every instance. Complete, and the most expensive by a wide margin.",
  },
];

export const UsageOptionsPanel: React.FC<UsageOptionsPanelProps> = ({
  options,
  onChange,
  selection,
  disabled,
}) => {
  const toggle = (key: keyof UsageOptions) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...options, [key]: event.target.checked });

  const instanceContent = INSTANCE_CONTENT.find((entry) => entry.value === options.instanceContent)!;

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text size="small" weight="strong">
          What to export
        </Text>
        <SegmentedControl.Root
          value={options.scope}
          onValueChange={(scope) => scope && onChange({ ...options, scope: scope as UsageScope })}
          fullWidth
          disabled={disabled}
        >
          {SCOPES.map((scope) => (
            <SegmentedControl.Item key={scope.value} value={scope.value}>
              <SegmentedControl.Text>{scope.label}</SegmentedControl.Text>
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        <ScopeSummary options={options} selection={selection} />
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="small" weight="strong">
          Inside instances
        </Text>
        <SegmentedControl.Root
          value={options.instanceContent}
          onValueChange={(value) => value && onChange({ ...options, instanceContent: value as InstanceContent })}
          fullWidth
          disabled={disabled}
        >
          {INSTANCE_CONTENT.map((entry) => (
            <SegmentedControl.Item key={entry.value} value={entry.value}>
              <SegmentedControl.Text>{entry.label}</SegmentedControl.Text>
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        <Text size="small" style={{ opacity: 0.6 }}>
          {instanceContent.hint}
        </Text>
      </Flex>

      <Checkbox.Root>
        <Checkbox.Input
          checked={options.flagDeviations}
          onChange={toggle("flagDeviations")}
          disabled={disabled}
        />
        <Checkbox.Label>Flag anything off-system</Checkbox.Label>
      </Checkbox.Root>
      <Text size="small" style={{ opacity: 0.6, marginLeft: "1.5rem" }}>
        Local components, missing mains, and values typed in where a token exists. Layers named with a
        leading <code>*</code> or <code>[custom]</code> are reported as deliberate.
      </Text>

      <Checkbox.Root>
        <Checkbox.Input
          checked={options.includeVariables}
          onChange={toggle("includeVariables")}
          disabled={disabled}
        />
        <Checkbox.Label>Include the variables these frames bind</Checkbox.Label>
      </Checkbox.Root>

      <Checkbox.Root>
        <Checkbox.Input
          checked={options.includeStyles}
          onChange={toggle("includeStyles")}
          disabled={disabled}
        />
        <Checkbox.Label>Include the styles these frames use</Checkbox.Label>
      </Checkbox.Root>

      <Checkbox.Root>
        <Checkbox.Input checked={options.includeSizes} onChange={toggle("includeSizes")} disabled={disabled} />
        <Checkbox.Label>Include pixel sizes</Checkbox.Label>
      </Checkbox.Root>

      <Flex align="center" gap="2">
        <Text size="small">Structure depth</Text>
        <Input
          type="number"
          min={0}
          max={30}
          value={String(options.depth)}
          disabled={disabled}
          onChange={(event) => {
            const depth = Number.parseInt(event.target.value, 10);
            onChange({ ...options, depth: Number.isFinite(depth) ? Math.max(0, Math.min(30, depth)) : 0 });
          }}
          style={{ width: "4rem" }}
        />
        <Text size="small" style={{ opacity: 0.6 }}>
          Screens nest deeper than components.
        </Text>
      </Flex>
    </Flex>
  );
};

/**
 * What the current scope resolves to, spelled out. Selecting a section and
 * selecting the frames inside it export the same thing, and seeing the frame
 * list is how a user learns that without having to trust it.
 */
const ScopeSummary: React.FC<{ options: UsageOptions; selection: SelectionSummary | null }> = ({
  options,
  selection,
}) => {
  if (!selection || selection.scope !== options.scope) {
    return (
      <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
        Working out what that covers…
      </Text>
    );
  }

  if (selection.frames.length === 0) {
    return (
      <Text size="small" style={{ color: "var(--figma-color-text-warning)" }}>
        {options.scope === "selection"
          ? "Nothing selected. Pick frames, or a section holding them."
          : "No frames found in this scope."}
      </Text>
    );
  }

  const shown = selection.frames.slice(0, 6);

  return (
    <Flex direction="column">
      <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
        {selection.frames.length} frame{selection.frames.length === 1 ? "" : "s"}:{" "}
        {shown.map((frame) => frame.name).join(", ")}
        {selection.frames.length > shown.length ? ` +${selection.frames.length - shown.length} more` : ""}
      </Text>
    </Flex>
  );
};
