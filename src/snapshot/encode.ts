import { decode as toonDecode, encode as toonEncode } from "@toon-format/toon";
import {
  DiffReport,
  LEGACY_SNAPSHOT_SCHEMAS,
  LEGACY_USAGE_SCHEMAS,
  SNAPSHOT_SCHEMA,
  Snapshot,
  USAGE_SCHEMA,
  UsageDiffReport,
  UsageSnapshot,
} from "../types.d";
import { canonicalize } from "../utils/stable";
import { diffToMarkdown, snapshotToMarkdown, usageDiffToMarkdown, usageToMarkdown } from "./markdown";

export enum OutputFormats {
  TOON = "toon",
  JSON = "json",
  MARKDOWN = "markdown",
}

export interface FormatDescriptor {
  format: OutputFormats;
  label: string;
  extension: string;
  language: "toon" | "json" | "markdown";
  hint: string;
  /** Shown under the hint for formats a user is unlikely to have met before. */
  footnote?: { text: string; href: string; label: string };
}

/**
 * The first entry is the default, and that is TOON rather than the cheaper
 * Markdown: Markdown is a rendering, so it cannot be loaded back as a diff
 * base. A file that cannot be diffed is not a snapshot, whatever it costs.
 */
export const FORMATS: FormatDescriptor[] = [
  {
    format: OutputFormats.TOON,
    label: "TOON",
    extension: "toon",
    language: "toon",
    hint: "Same data as JSON in far fewer tokens, and losslessly convertible back to JSON.",
    footnote: {
      text: "TOON is a compact encoding of the JSON data model, built for LLM input.",
      href: "https://toonformat.dev",
      label: "toonformat.dev ↗",
    },
  },
  {
    format: OutputFormats.MARKDOWN,
    label: "Markdown",
    extension: "md",
    language: "markdown",
    hint: "Prose report for an agent that greps rather than parses. Cheapest, but a rendering — it cannot be loaded back as a diff base.",
  },
  {
    format: OutputFormats.JSON,
    label: "JSON",
    extension: "json",
    language: "json",
    hint: "Universal. Pretty-printed so `git diff` stays line-oriented.",
  },
];

export const DEFAULT_FORMAT = FORMATS[0].format;

/**
 * All three encoders read from the same canonical value, so a snapshot is
 * byte-stable regardless of which format it is written in.
 */
export function encodeSnapshot(snapshot: Snapshot, format: OutputFormats): string {
  if (format === OutputFormats.MARKDOWN) return snapshotToMarkdown(snapshot);
  return encodeData(snapshot, format);
}

export function encodeDiff(report: DiffReport, format: OutputFormats): string {
  if (format === OutputFormats.MARKDOWN) return diffToMarkdown(report);
  return encodeData(report, format);
}

export function encodeUsage(usage: UsageSnapshot, format: OutputFormats): string {
  if (format === OutputFormats.MARKDOWN) return usageToMarkdown(usage);
  return encodeData(usage, format);
}

export function encodeUsageDiff(report: UsageDiffReport, format: OutputFormats): string {
  if (format === OutputFormats.MARKDOWN) return usageDiffToMarkdown(report);
  return encodeData(report, format);
}

/**
 * Encodes either kind of snapshot. The estimator works on whatever the probe
 * produced and has no reason to care which scan it came from.
 */
export function encodeAny(payload: Snapshot | UsageSnapshot, format: OutputFormats): string {
  return "frames" in payload ? encodeUsage(payload, format) : encodeSnapshot(payload, format);
}

/** Reads back a usage snapshot the plugin previously wrote. */
export function parseUsage(text: string, fileName: string): UsageSnapshot {
  const parsed = decodeByExtension(text, fileName) as UsageSnapshot;
  const known = parsed?.schema === USAGE_SCHEMA || LEGACY_USAGE_SCHEMAS.includes(parsed?.schema);
  if (!known) {
    throw new Error(
      parsed?.schema === SNAPSHOT_SCHEMA || LEGACY_SNAPSHOT_SCHEMAS.includes(parsed?.schema)
        ? "That is a library snapshot. Load a usage snapshot — the file exported from the design, not from the library."
        : `Unsupported usage schema: ${parsed?.schema ?? "missing"}`,
    );
  }
  return parsed;
}

/**
 * Reads a snapshot the plugin previously wrote, in either machine format.
 * A Markdown report is a rendering, not a source — it cannot be read back.
 */
export function parseSnapshot(text: string, fileName: string): Snapshot {
  const parsed = decodeByExtension(text, fileName) as Snapshot;

  const known = parsed?.schema === SNAPSHOT_SCHEMA || LEGACY_SNAPSHOT_SCHEMAS.includes(parsed?.schema);
  if (!parsed || !known) {
    // A mismatched schema would produce a diff full of phantom changes, which
    // is worse for an agent than refusing outright.
    throw new Error(`Unsupported snapshot schema: ${parsed?.schema ?? "missing"}`);
  }
  return parsed;
}

function decodeByExtension(text: string, fileName: string): unknown {
  const looksLikeToon = fileName.toLowerCase().endsWith(".toon") || !text.trimStart().startsWith("{");
  return looksLikeToon ? toonDecode(text) : JSON.parse(text);
}

function encodeData(value: unknown, format: OutputFormats): string {
  const canonical = canonicalize(value);
  if (format === OutputFormats.TOON) {
    return `${toonEncode(canonical)}\n`;
  }
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
