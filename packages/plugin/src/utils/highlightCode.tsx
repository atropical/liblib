import React from "react";

/**
 * Small, dependency-free highlighter for the three formats this plugin emits.
 * It is line-based on purpose: the preview is long, and a per-line pass keeps
 * rendering cheap and lets very long files be sliced without breaking spans.
 */
export type CodeLanguage = "json" | "toon" | "markdown";

const COLOURS = {
  key: "var(--figma-color-text-brand, #7cc4ff)",
  string: "var(--figma-color-text-success, #8ce99a)",
  number: "var(--figma-color-text-warning, #ffd43b)",
  literal: "var(--figma-color-text-danger, #ff8787)",
  punctuation: "var(--figma-color-text-tertiary, #8f8f8f)",
  heading: "var(--figma-color-text-brand, #7cc4ff)",
  meta: "var(--figma-color-text-secondary, #a0a0a0)",
};

export function renderCodeLines(code: string, language: CodeLanguage): React.ReactNode {
  const lines = code.split("\n");
  return lines.map((line, index) => (
    <React.Fragment key={index}>
      {highlightLine(line, language)}
      {index < lines.length - 1 ? "\n" : null}
    </React.Fragment>
  ));
}

function highlightLine(line: string, language: CodeLanguage): React.ReactNode {
  switch (language) {
    case "json":
      return tokenise(line, JSON_RULES);
    case "toon":
      return highlightToon(line);
    case "markdown":
      return highlightMarkdown(line);
  }
}

interface Rule {
  pattern: RegExp;
  colour: string;
}

/** Order matters — the first rule that matches at a position wins. */
const JSON_RULES: Rule[] = [
  { pattern: /^"(?:[^"\\]|\\.)*"(?=\s*:)/, colour: COLOURS.key },
  { pattern: /^"(?:[^"\\]|\\.)*"/, colour: COLOURS.string },
  { pattern: /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, colour: COLOURS.number },
  { pattern: /^(?:true|false|null)\b/, colour: COLOURS.literal },
  { pattern: /^[{}[\],:]/, colour: COLOURS.punctuation },
];

/**
 * TOON is position-sensitive in a way JSON is not: values are mostly unquoted,
 * so `f55c6b64e1249382` is a string and `1512` is a number, and only the
 * position tells them apart. A rule list would colour the digits inside a hash,
 * which is why this format gets a line parser instead.
 */
const TOON_HEADER = /^(\s*)(- )?("(?:[^"\\]|\\.)*"|[^"\s:[\]{}][^:[\]{}]*?)((?:\[[^\]]*\])?(?:\{[^}]*\})?)(:)(.*)$/;

function highlightToon(line: string): React.ReactNode {
  const header = TOON_HEADER.exec(line);
  if (!header) {
    // A table row or a bare list item: values only.
    return highlightToonValue(line);
  }

  const [, indent, marker, key, brackets, colon, rest] = header;
  return (
    <>
      {indent}
      {marker && <span style={{ color: COLOURS.punctuation }}>{marker}</span>}
      <span style={{ color: COLOURS.key }}>{key}</span>
      {brackets && <span style={{ color: COLOURS.punctuation }}>{brackets}</span>}
      <span style={{ color: COLOURS.punctuation }}>{colon}</span>
      {highlightToonValue(rest)}
    </>
  );
}

/** Colours a value only when its whole text is a literal — never a substring. */
function highlightToonValue(text: string): React.ReactNode {
  if (!text) return null;

  const leading = text.length - text.trimStart().length;
  const parts = text.slice(leading).split(",");

  return (
    <>
      {text.slice(0, leading)}
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span style={{ color: COLOURS.punctuation }}>,</span>}
          <span style={{ color: scalarColour(part.trim()) }}>{part}</span>
        </React.Fragment>
      ))}
    </>
  );
}

function scalarColour(value: string): string | undefined {
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return COLOURS.string;
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return COLOURS.number;
  if (value === "true" || value === "false" || value === "null") return COLOURS.literal;
  if (value === "[]" || value === "-") return COLOURS.punctuation;
  return undefined;
}

function tokenise(line: string, rules: Rule[]): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let rest = line;
  let plain = "";
  let key = 0;

  const flush = () => {
    if (plain) {
      nodes.push(plain);
      plain = "";
    }
  };

  while (rest.length > 0) {
    const rule = rules.find((candidate) => candidate.pattern.test(rest));
    const match = rule ? rule.pattern.exec(rest) : null;

    if (!rule || !match || match[0].length === 0) {
      plain += rest[0];
      rest = rest.slice(1);
      continue;
    }

    flush();
    nodes.push(
      <span key={key++} style={{ color: rule.colour }}>
        {match[0]}
      </span>,
    );
    rest = rest.slice(match[0].length);
  }

  flush();
  return nodes;
}

function highlightMarkdown(line: string): React.ReactNode {
  if (/^#{1,6}\s/.test(line)) {
    return <span style={{ color: COLOURS.heading, fontWeight: 600 }}>{line}</span>;
  }
  if (/^\s*\|/.test(line)) {
    // Dim the table scaffolding so the cell contents stay legible.
    return line.split(/(\|)/).map((part, index) =>
      part === "|" ? (
        <span key={index} style={{ color: COLOURS.punctuation }}>
          |
        </span>
      ) : (
        <React.Fragment key={index}>{highlightInlineCode(part)}</React.Fragment>
      ),
    );
  }
  if (/^\s*[-*]\s/.test(line)) {
    const bulletAt = line.search(/\S/);
    return (
      <>
        {line.slice(0, bulletAt)}
        <span style={{ color: COLOURS.punctuation }}>{line[bulletAt]}</span>
        {highlightInlineCode(line.slice(bulletAt + 1))}
      </>
    );
  }
  return highlightInlineCode(line);
}

function highlightInlineCode(text: string): React.ReactNode {
  if (!text.includes("`")) return text;
  return text.split(/(`[^`]*`)/).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <span key={index} style={{ color: COLOURS.string }}>
        {part}
      </span>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}
