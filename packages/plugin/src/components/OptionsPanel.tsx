import React from "react";
import { Checkbox, Flex, Input, Text } from "figma-kit";
import { SnapshotOptions } from "@atropical/liblib-core/types";

interface OptionsPanelProps {
  options: SnapshotOptions;
  onChange: (options: SnapshotOptions) => void;
  disabled?: boolean;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({ options, onChange, disabled }) => {
  const toggle = (key: keyof SnapshotOptions) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...options, [key]: event.target.checked });

  return (
    <Flex direction="column" gap="2">
      <Checkbox.Root>
        <Checkbox.Input
          checked={options.includeStyles}
          onChange={toggle("includeStyles")}
          disabled={disabled}
        />
        <Checkbox.Label>Include styles</Checkbox.Label>
      </Checkbox.Root>

      <Checkbox.Root>
        <Checkbox.Input
          checked={options.includeVariables}
          onChange={toggle("includeVariables")}
          disabled={disabled}
        />
        <Checkbox.Label>Include variables</Checkbox.Label>
      </Checkbox.Root>

      {/* Paired with its own hint: at the panel's spacing the sentence would
          read as belonging to the option below it. */}
      <Flex direction="column" gap="1">
        <Checkbox.Root>
          <Checkbox.Input
            checked={options.includeSizes}
            onChange={toggle("includeSizes")}
            disabled={disabled}
          />
          <Checkbox.Label>Include pixel sizes</Checkbox.Label>
        </Checkbox.Root>
        <Text size="small" style={{ opacity: 0.6, marginLeft: "1.5rem" }}>
          On by default — without it, a size only appears where a variable happens to be bound, so
          wrong geometry reads as no change.
        </Text>
      </Flex>

      <Flex align="center" gap="2">
        <Text size="small">Structure depth</Text>
        <Input
          type="number"
          min={0}
          max={20}
          value={String(options.depth)}
          disabled={disabled}
          onChange={(event) => {
            const depth = Number.parseInt(event.target.value, 10);
            onChange({ ...options, depth: Number.isFinite(depth) ? Math.max(0, Math.min(20, depth)) : 0 });
          }}
          style={{ width: "4rem" }}
        />
        <Text size="small" style={{ opacity: 0.6 }}>
          Deeper = more signal, larger file.
        </Text>
      </Flex>
    </Flex>
  );
};
