export const SNAPSHOT_SCHEMA = "liblib/design-system-snapshot@1";

/**
 * Ids this plugin has written under previous names. The data model is
 * unchanged, so a snapshot exported before the rename is still a valid diff
 * base — refusing it would strand every file already committed to a repo.
 */
export const LEGACY_SNAPSHOT_SCHEMAS = ["help-an-agent/design-system-snapshot@1"];

/**
 * Written by the consuming file, not the library file. A usage snapshot says
 * *which* library components a design uses and *how* they are configured; the
 * components' internals stay in the library snapshot, and the two join on the
 * component publish key.
 */
export const USAGE_SCHEMA = "liblib/usage-snapshot@2";

/**
 * Usage schemas still accepted as a diff base. `@2` added per-node positions,
 * kept nested instances that `@1` pruned, and started summarising outline
 * shapes — all additive, so an older export still compares cleanly enough to be
 * worth more than refusing it.
 */
export const LEGACY_USAGE_SCHEMAS = ["liblib/usage-snapshot@1"];

export enum PluginCommands {
  SNAPSHOT = "snapshot",
  DIFF = "diff",
  USAGE = "usage",
  USAGE_DIFF = "usage-diff",
}

export enum MessageTypes {
  BASIC_INFO = "basic-info",
  PROBE = "probe",
  PROBE_RESULT = "probe-result",
  BUILD_SNAPSHOT = "build-snapshot",
  SNAPSHOT_PROGRESS = "snapshot-progress",
  SNAPSHOT_RESULT = "snapshot-result",
  SNAPSHOT_ERROR = "snapshot-error",
  BUILD_USAGE = "build-usage",
  USAGE_RESULT = "usage-result",
  PROBE_USAGE = "probe-usage",
  /** UI asks what the current selection covers; the plugin thread answers. */
  REQUEST_SELECTION = "request-selection",
  SELECTION_RESULT = "selection-result",
}

/** One half of the sample, measured on its own so cost can be fitted. */
export interface ProbeGroup {
  /** A real snapshot containing only this group's components (or frames). */
  snapshot: Snapshot | UsageSnapshot;
  /** Roots in this group: components in a library scan, frames in a usage scan. */
  componentCount: number;
  nodes: number;
  millis: number;
}

/**
 * Result of measuring a representative sample of the file rather than all of
 * it, so the UI can tell the user what a full scan will cost them before they
 * commit to waiting for it.
 */
export interface ProbeResult {
  componentCount: number;
  sampleSize: number;
  /**
   * Nodes in every component's subtree, counted for the whole file at the
   * chosen depth. Cost tracks nodes far better than it tracks component count
   * — a 9-variant set is worth dozens of icons.
   */
  totalNodes: number;
  /**
   * The sample split into a small-component group and a large-component group.
   * Two groups with different shapes give two equations, which is what lets
   * the estimate separate per-component cost from per-node cost instead of
   * assuming everything scales the same way.
   */
  groups: ProbeGroup[];
  /** Fixed cost already paid: loading pages, styles and variables. */
  overheadMs: number;
  /** The snapshot with no components, isolating the fixed part of the output. */
  base: Snapshot | UsageSnapshot;
}

/** Serialized form of a single node inside a component's subtree. */
export interface SerializedNode {
  type: string;
  name: string;
  /**
   * Figma node id, on every node. Only written by a usage snapshot: a screen is
   * read to be navigated back into, and the id of a nested instance layer is
   * the one thing an agent cannot recover from the metadata it gets otherwise.
   * Excluded from hashes and diffs, like every other address in this file.
   */
  nodeId?: string;
  /** Only present when the node is hidden — absence means visible. */
  hidden?: boolean;
  props: Record<string, unknown>;
  children?: SerializedNode[];
  /** Set when traversal hit the configured depth limit. */
  truncated?: boolean;
  /**
   * Children left out because they carry nothing only they could say — no
   * override, no text, no library component. Set only in `overrides` instance
   * mode, so a pruned subtree never reads as an empty one.
   */
  omittedChildren?: number;
}

export interface ComponentPropertyRecord {
  type: string;
  defaultValue?: unknown;
  /** Variant options, sorted. */
  variantOptions?: string[];
  /** Preferred instance-swap values, as component/component-set keys. */
  preferredValues?: string[];
}

export interface ComponentRecord {
  /** Publish key — stable across renames and across files. Empty for unpublished nodes. */
  key: string;
  /**
   * Figma node id (`5526:1123`). The only field that addresses this component
   * from outside the snapshot: it builds the `?node-id=` deep link and is what
   * the MCP tools accept. Excluded from the hash and the diff — it is an
   * address, not content, and it changes when a file is duplicated.
   */
  nodeId: string;
  name: string;
  /** Page name + parent frame/section path, for humans reading the report. */
  path: string;
  type: "COMPONENT" | "COMPONENT_SET";
  description: string;
  documentationLinks: string[];
  properties: Record<string, ComponentPropertyRecord>;
  /**
   * For a COMPONENT_SET: each variant child, keyed by its variant name
   * (e.g. `Size=Large, State=Hover`). A set's own `structure` carries only
   * set-level props — the variant trees live here so a diff can name the
   * exact variant that changed.
   */
  variants?: Record<string, { key: string; nodeId: string; hash: string; structure: SerializedNode }>;
  structure: SerializedNode;
  /** Content hash of everything above except `path` (position is not a change). */
  hash: string;
}

export interface StyleRecord {
  key: string;
  name: string;
  type: "PAINT" | "TEXT" | "EFFECT" | "GRID";
  description: string;
  value: unknown;
  hash: string;
}

export interface VariableRecord {
  key: string;
  name: string;
  collection: string;
  resolvedType: string;
  scopes: string[];
  codeSyntax: Record<string, string>;
  description: string;
  /** Mode name -> value (aliases rendered as `{Collection/Variable}`). */
  valuesByMode: Record<string, unknown>;
  hash: string;
}

export interface VariableCollectionRecord {
  key: string;
  name: string;
  modes: string[];
  defaultMode: string;
}

export interface Snapshot {
  schema: string;
  /** Excluded from every hash and from the diff — informational only. */
  meta: {
    generatedAt: string;
    pluginVersion: string;
    fileName: string;
    /**
     * File key, so a `nodeId` can be turned into a URL without a human pasting
     * one. Absent when Figma withholds it (public plugins on some plans).
     */
    fileKey?: string;
    counts: Record<string, number>;
  };
  components: ComponentRecord[];
  styles: StyleRecord[];
  variableCollections: VariableCollectionRecord[];
  variables: VariableRecord[];
}

/** One exported frame: a screen, a print sheet, a spec board — any bounded surface. */
export interface FrameRecord {
  /**
   * `Page / Section / Frame`. Frames have no publish key, so the document path
   * is the identity — and it is the same whether the designer selected the
   * section or the frames inside it, which is what makes two exports with
   * different selections still comparable.
   */
  key: string;
  nodeId: string;
  name: string;
  page: string;
  type: string;
  /** Frame size in px. Always recorded: a surface is defined by its bounds. */
  size: [number, number];
  structure: SerializedNode;
  hash: string;
}

/** A library component this file uses, and every configuration it is used in. */
export interface ComponentUsageRecord {
  /** Publish key of the main component — the join back to the library snapshot. */
  key: string;
  name: string;
  /** Component set the main component belongs to, when it is a variant. */
  setKey?: string;
  setName?: string;
  /** False for a component defined in this file rather than in a library. */
  remote: boolean;
  /** Property definitions as the library published them, when readable. */
  properties?: Record<string, ComponentPropertyRecord>;
  /** Distinct property assignments seen in this file, e.g. `Size=Small, Intent=Main`. */
  usedAs: string[];
  /** How many instances resolve to this component. */
  instanceCount: number;
  /** Frame keys this component appears in, sorted. */
  frames: string[];
  hash: string;
}

export type DeviationKind =
  | "local-component"
  | "missing-main"
  | "detached"
  | "hardcoded-fill"
  | "hardcoded-stroke"
  | "hardcoded-radius"
  | "hardcoded-spacing";

/**
 * Somewhere the design steps outside the library. Reported so an agent can tell
 * a deliberate one-off from a mistake instead of guessing — and marked
 * `intentional` when the designer said so, via the layer name marker or plugin
 * data.
 */
export interface DeviationRecord {
  kind: DeviationKind;
  frame: string;
  nodeId: string;
  /** Layer path inside the frame, e.g. `Cards Container / Chip + Button`. */
  path: string;
  name: string;
  type: string;
  detail?: string;
  /** True when the layer is marked as a deliberate exception. */
  intentional: boolean;
}

export interface UsageSnapshot {
  schema: string;
  meta: {
    generatedAt: string;
    pluginVersion: string;
    fileName: string;
    fileKey?: string;
    /**
     * How the frames were chosen, and which ones were exported. A diff compares
     * the intersection of two scopes, so a narrower export reads as
     * "not covered", never as "everything else was deleted".
     */
    scope: {
      mode: UsageScope;
      pages: string[];
      frames: string[];
    };
    counts: Record<string, number>;
  };
  frames: FrameRecord[];
  components: ComponentUsageRecord[];
  styles: StyleRecord[];
  variableCollections: VariableCollectionRecord[];
  variables: VariableRecord[];
  deviations: DeviationRecord[];
}

export type ChangeKind = "added" | "removed" | "renamed" | "modified" | "out-of-scope";

export interface DiffEntry {
  kind: ChangeKind;
  key: string;
  name: string;
  previousName?: string;
  /** Dot/bracket paths into the record that differ, with before/after values. */
  changes: FieldChange[];
}

export interface FieldChange {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffReport {
  schema: string;
  base: { fileName: string; generatedAt: string };
  head: { fileName: string; generatedAt: string };
  summary: Record<string, number>;
  components: DiffEntry[];
  styles: DiffEntry[];
  variables: DiffEntry[];
}

export interface UsageDiffReport {
  schema: string;
  base: { fileName: string; generatedAt: string };
  head: { fileName: string; generatedAt: string };
  summary: Record<string, number>;
  frames: DiffEntry[];
  components: DiffEntry[];
  styles: DiffEntry[];
  variables: DiffEntry[];
  deviations: DiffEntry[];
}

export interface PluginMessage {
  type: MessageTypes;
  command?: PluginCommands;
  editorType?: string;
  /** Snapshot build options from the UI. */
  options?: SnapshotOptions;
  /** Usage build options; set instead of `options` on a usage scan. */
  usageOptions?: UsageOptions;
  snapshot?: Snapshot;
  usage?: UsageSnapshot;
  /** Frames the current selection resolves to, for the scope summary in the UI. */
  selection?: SelectionSummary;
  probe?: ProbeResult;
  scanned?: number;
  total?: number;
  stage?: string;
  error?: string;
}

export interface SnapshotOptions {
  /** How deep into each component's subtree to serialize. */
  depth: number;
  includeStyles: boolean;
  includeVariables: boolean;
  /** Include absolute pixel sizes. Off by default — resizes are usually noise. */
  includeSizes: boolean;
}

/** Which frames a usage scan covers. */
export type UsageScope = "selection" | "page" | "file";

/**
 * How much of an instance's inside to write out.
 *
 * `boundary` stops at the instance and records only what configures it —
 * component key, property values, which fields are overridden. Everything below
 * is already in the library snapshot, so writing it again costs tokens and adds
 * nothing. `overrides` additionally keeps the branches that carry an override
 * or text, which is where a screen's actual content lives. `full` walks
 * everything, at library-snapshot cost.
 */
export type InstanceContent = "boundary" | "overrides" | "full";

export interface UsageOptions {
  scope: UsageScope;
  depth: number;
  instanceContent: InstanceContent;
  includeStyles: boolean;
  includeVariables: boolean;
  includeSizes: boolean;
  /**
   * Write each node's position relative to its parent. Without it, the gap
   * between two layers can only be recovered by opening the file — and most
   * spacing in a design is a gap, not a padding.
   */
  includePositions: boolean;
  /**
   * Replace outline shapes (`VECTOR`, `BOOLEAN_OPERATION`) with a count on the
   * parent. On by default: the outlines inside artwork are the bulk of a
   * design file and nothing reads them. Turn it off when the artwork itself is
   * the subject.
   */
  summariseVectors: boolean;
  /**
   * Record what each override was set to — the text a label was changed to, the
   * component swapped into a slot — rather than only which fields changed.
   * Costs one node lookup per overridden layer, so it can be turned off on a
   * file with heavily overridden instances.
   */
  resolveOverrides: boolean;
  /** Report where the design steps outside the library. */
  flagDeviations: boolean;
}

/** What the current selection resolves to, before a scan is run. */
export interface SelectionSummary {
  scope: UsageScope;
  frames: { key: string; name: string; nodeId: string }[];
  /** Nodes selected that resolved to no frame at all. */
  ignored: number;
}
