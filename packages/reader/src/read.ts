import { decode as toonDecode } from "@toon-format/toon";
import {
  LEGACY_SNAPSHOT_SCHEMAS,
  LEGACY_USAGE_SCHEMAS,
  SNAPSHOT_SCHEMA,
  Snapshot,
  USAGE_SCHEMA,
  UsageSnapshot,
} from "../../../src/types.d";
import { SchemaError } from "./errors";
import { normaliseLibrary, normaliseUsage } from "./normalise";

export type SnapshotKind = "library" | "usage";

export interface ReadResult<T> {
  kind: SnapshotKind;
  /** The schema id the file actually declared — not the one this package prefers. */
  schema: string;
  /** True when the file was written to a superseded schema that is still accepted. */
  legacy: boolean;
  data: T;
}

export interface ReadOptions {
  /** Only refines format detection; the content decides. Never trusted for kind. */
  fileName?: string;
}

const LIBRARY_SCHEMAS = [SNAPSHOT_SCHEMA, ...LEGACY_SNAPSHOT_SCHEMAS];
const USAGE_SCHEMAS = [USAGE_SCHEMA, ...LEGACY_USAGE_SCHEMAS];
const ALL_SCHEMAS = [...LIBRARY_SCHEMAS, ...USAGE_SCHEMAS];

/**
 * Reads a snapshot file of either kind and says which one it was.
 *
 * Nothing here guesses. A file that cannot be decoded, does not declare a
 * schema, declares one this package does not know, or decodes to a shell with
 * no records in it, throws `SchemaError` — an empty answer from this function
 * would be indistinguishable from a true one.
 */
export function read(text: string, opts: ReadOptions = {}): ReadResult<Snapshot | UsageSnapshot> {
  const value = decode(text, opts.fileName);
  const schema = schemaOf(value);

  if (LIBRARY_SCHEMAS.includes(schema)) {
    const data = value as unknown as Snapshot;
    requireRecords(data.components, "components", "library", schema);
    return {
      kind: "library",
      schema,
      legacy: schema !== SNAPSHOT_SCHEMA,
      data: normaliseLibrary(data),
    };
  }

  if (USAGE_SCHEMAS.includes(schema)) {
    const data = value as unknown as UsageSnapshot;
    requireRecords(data.frames, "frames", "usage", schema);
    return {
      kind: "usage",
      schema,
      legacy: schema !== USAGE_SCHEMA,
      data: normaliseUsage(data),
    };
  }

  throw new SchemaError(
    `Unrecognised schema \`${schema}\`. This file was not written by LibLib, or by a version ` +
      `newer than this reader. Accepted: ${ALL_SCHEMAS.join(", ")}.`,
    { schema, expected: ALL_SCHEMAS },
  );
}

/** Reads a design-system snapshot, refusing a usage snapshot by name. */
export function readLibrary(text: string, opts: ReadOptions = {}): ReadResult<Snapshot> {
  const result = read(text, opts);
  if (result.kind !== "library") {
    throw new SchemaError(
      `That is a usage snapshot (\`${result.schema}\`) — the file exported from a design that ` +
        `consumes the library. \`readLibrary\` needs a design-system snapshot, exported from the ` +
        `library file itself. Use \`readUsage\` for this file.`,
      { schema: result.schema, expected: LIBRARY_SCHEMAS },
    );
  }
  return result as ReadResult<Snapshot>;
}

/** Reads a usage snapshot, refusing a library snapshot by name. */
export function readUsage(text: string, opts: ReadOptions = {}): ReadResult<UsageSnapshot> {
  const result = read(text, opts);
  if (result.kind !== "usage") {
    throw new SchemaError(
      `That is a library snapshot (\`${result.schema}\`) — the file exported from the design ` +
        `system itself. \`readUsage\` needs a usage snapshot, exported from a design file that ` +
        `consumes the library. Use \`readLibrary\` for this file.`,
      { schema: result.schema, expected: USAGE_SCHEMAS },
    );
  }
  return result as ReadResult<UsageSnapshot>;
}

/**
 * Decoding is delegated whole to `@toon-format/toon` and `JSON.parse`. There is
 * no line-splitting, no key regex and no comma splitting anywhere in this
 * package: every one of those is a way to read a valid file as an empty one.
 */
function decode(text: string, fileName?: string): Record<string, unknown> {
  if (typeof text !== "string" || text.trim() === "") {
    throw new SchemaError("Nothing to read: the snapshot text is empty.", { expected: ALL_SCHEMAS });
  }

  const trimmed = text.trimStart();
  const name = (fileName ?? "").toLowerCase();

  if (trimmed.startsWith("#") || name.endsWith(".md") || name.endsWith(".markdown")) {
    throw new SchemaError(
      "That is a Markdown report. Markdown is a rendering of a snapshot, not a snapshot: it is " +
        "lossy and cannot be read back. Export the same scan again as TOON or JSON.",
      { expected: ALL_SCHEMAS },
    );
  }

  const isJson = trimmed.startsWith("{") || trimmed.startsWith("[") || name.endsWith(".json");
  const format = isJson ? "JSON" : "TOON";

  let value: unknown;
  try {
    value = isJson ? JSON.parse(text) : toonDecode(text);
  } catch (error) {
    throw new SchemaError(
      `Could not decode this file as ${format}: ${(error as Error).message}`,
      { expected: ALL_SCHEMAS },
    );
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SchemaError(
      `Decoded this file as ${format}, but a snapshot is an object and this is ` +
        `${Array.isArray(value) ? "an array" : typeof value}.`,
      { expected: ALL_SCHEMAS },
    );
  }

  return value as Record<string, unknown>;
}

function schemaOf(value: Record<string, unknown>): string {
  const schema = value.schema;
  if (typeof schema !== "string" || schema === "") {
    throw new SchemaError(
      "This file decoded, but declares no `schema`. Every snapshot LibLib writes names its " +
        `schema on the first line. Accepted: ${ALL_SCHEMAS.join(", ")}.`,
      { expected: ALL_SCHEMAS },
    );
  }
  return schema;
}

/**
 * A snapshot whose records did not survive the round trip is the exact failure
 * this package exists to make loud, so it is reported as a schema failure and
 * not handed back as an empty list.
 */
function requireRecords(
  records: unknown,
  field: string,
  kind: SnapshotKind,
  schema: string,
): void {
  if (!Array.isArray(records)) {
    throw new SchemaError(
      `This file declares \`${schema}\` but has no \`${field}\` array, so it is not a readable ` +
        `${kind} snapshot. It may have been truncated or re-serialized by something else.`,
      { schema, expected: ALL_SCHEMAS },
    );
  }
  if (records.length === 0) {
    throw new SchemaError(
      `This ${kind} snapshot decoded, but its \`${field}\` list is empty — there is nothing in ` +
        `it to read. Re-export with a scope that covers something.`,
      { schema, expected: ALL_SCHEMAS },
    );
  }
}

export { LIBRARY_SCHEMAS, USAGE_SCHEMAS, ALL_SCHEMAS };
