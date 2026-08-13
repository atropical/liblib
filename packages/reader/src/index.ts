/**
 * `@atropical/liblib` — a typed reader for the snapshot files the LibLib Figma
 * plugin writes.
 *
 * Two rules hold everywhere in this package, and they are the reason it exists
 * rather than each consumer writing twenty lines of parsing:
 *
 *  1. Decoding is delegated to `@toon-format/toon` and `JSON.parse`. Nothing
 *     here splits lines, matches keys with a regex, or splits a list on commas.
 *  2. Nothing returns a plausible empty result. A file that will not decode, or
 *     that decodes to a shell with no records, throws `SchemaError`.
 */

export { SchemaError } from "./errors";
export { read, readLibrary, readUsage, ALL_SCHEMAS, LIBRARY_SCHEMAS, USAGE_SCHEMAS } from "./read";
export type { ReadOptions, ReadResult, SnapshotKind } from "./read";

export {
  components,
  deviations,
  find,
  frames,
  mismatches,
  resolveFrame,
  tree,
} from "./accessors";
export type {
  DeviationOptions,
  FindOptions,
  FrameSummary,
  Hit,
  HitField,
  Mismatch,
  TreeNode,
  TreeOptions,
} from "./accessors";

export { diff } from "./diff";
export type { DiffInput } from "./diff";

export {
  LEGACY_SNAPSHOT_SCHEMAS,
  LEGACY_USAGE_SCHEMAS,
  SNAPSHOT_SCHEMA,
  USAGE_SCHEMA,
} from "../../../src/types.d";

export type {
  ChangeKind,
  ComponentPropertyRecord,
  ComponentRecord,
  ComponentUsageRecord,
  DeviationKind,
  DeviationRecord,
  DiffEntry,
  DiffReport,
  FieldChange,
  FrameRecord,
  SerializedNode,
  Snapshot,
  StyleRecord,
  UsageDiffReport,
  UsageScope,
  UsageSnapshot,
  VariableCollectionRecord,
  VariableRecord,
} from "../../../src/types.d";
