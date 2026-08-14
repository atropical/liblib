import React from "react";
import { Button, Flex, Label, Link, Text } from "figma-kit";
import { FORMATS, OutputFormats } from "@atropical/liblib-core/snapshot/encode";
import { formatTokenRange, savingsPercent, TOKEN_ERROR_MARGIN } from "../utils/tokens";

interface FormatSelectorProps {
  value: OutputFormats;
  onChange: (format: OutputFormats) => void;
  /** Estimated token count per format, for the current payload. */
  tokens: Record<OutputFormats, number>;
  disabled?: boolean;
}

/**
 * Token cost is the reason to pick one format over another when the consumer
 * is an agent, so it sits on the button rather than in a tooltip.
 */
export const FormatSelector: React.FC<FormatSelectorProps> = ({ value, onChange, tokens, disabled }) => {
  const baseline = tokens[OutputFormats.JSON];
  const selected = FORMATS.find((descriptor) => descriptor.format === value);

  return (
    <Flex direction="column" gap="2">
      <Label style={{ color: "var(--figma-color-text-secondary)" }}>Format</Label>
      {/* Stacked and full width: the formats are alternatives, and side by side
          the token range had to be shrunk to fit, which is the one figure the
          user is here to compare. */}
      <Flex direction="column" gap="2">
        {FORMATS.map((descriptor) => {
          const count = tokens[descriptor.format] ?? 0;
          const saved = savingsPercent(baseline, count);
          return (
            <Button
              key={descriptor.format}
              variant={descriptor.format === value ? "primary" : "secondary"}
              onClick={() => onChange(descriptor.format)}
              disabled={disabled}
              style={{ width: "100%", justifyContent: "space-between", gap: 8 }}
            >
              <span>{descriptor.label}</span>
              <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
                {formatTokenRange(count)}
                {saved > 0 ? ` · −${saved}%` : ""}
              </span>
            </Button>
          );
        })}
      </Flex>
      {selected && (
        <Text size="small" style={{ color: "var(--figma-color-text-secondary)" }}>
          {selected.hint}
        </Text>
      )}
      {selected?.footnote && (
        <Text size="small" style={{ color: "var(--figma-color-text-tertiary)" }}>
          {selected.footnote.text}{" "}
          <Link target="_blank" href={selected.footnote.href}>
            {selected.footnote.label}
          </Link>
        </Text>
      )}
      <TokenMethodNote />
    </Flex>
  );
};

/**
 * The ranges are estimates, and an estimate presented without its method is
 * indistinguishable from a measurement. This is the method.
 */
const TokenMethodNote: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <Flex direction="column" gap="2">
      <Text
        size="small"
        onClick={() => setOpen((previous) => !previous)}
        style={{ color: "var(--figma-color-text-secondary)", cursor: "pointer", userSelect: "none" }}
      >
        {open ? "▾" : "▸"} How are these token ranges calculated?
      </Text>
      {open && (
        <Flex
          direction="column"
          gap="2"
          style={{
            borderLeft: "2px solid var(--figma-color-border)",
            paddingLeft: 8,
            color: "var(--figma-color-text-secondary)",
          }}
        >
          <Text size="small">
            The counts are <strong>estimated, not tokenised</strong>. A real tokenizer needs about 2.6 MB
            of byte-pair rank tables — too much to load inside a plugin for a figure whose job is to
            compare formats.
          </Text>
          <Text size="small">
            Instead the text is split the way byte-pair encoders tend to split it: runs of letters cost
            one token per ~5 characters, digits group in threes, punctuation runs merge in pairs, and
            indentation and newlines are charged at a lower rate. Those rates were fitted against
            o200k_base, the encoding used by current frontier models, on real snapshot output.
          </Text>
          <Text size="small">
            Worst measured deviation was 9.7%, so each figure is shown as a ±
            {Math.round(TOKEN_ERROR_MARGIN * 100)}% range. Your model's tokenizer will differ again —
            treat the range as a budget, not a bill.
          </Text>
          <Text size="small">
            The percentage compares a format against JSON. It is more reliable than the absolute numbers,
            because both sides carry the same estimator bias and it largely cancels.
          </Text>
        </Flex>
      )}
    </Flex>
  );
};
