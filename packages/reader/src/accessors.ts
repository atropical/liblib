import {
  ComponentUsageRecord,
  DeviationRecord,
  FrameRecord,
  SerializedNode,
  UsageSnapshot,
} from "@atropical/liblib-core/types";
import { SchemaError } from "./errors";

/**
 * Every accessor takes an already-read snapshot, is pure, and returns records in
 * a fixed order. None of them re-parse text, and none of them branch on schema
 * version — `read` has already normalised the two fields that moved.
 *
 * Paths are `Frame / Group / Layer`, and a path always ends with the layer's own
 * name. The plugin writes a deviation's `path` as the ancestors only, with
 * `name` beside it; here the two are joined, because a path an agent can grep
 * for is worth more than one it has to reassemble.
 */

const PATH_SEPARATOR = " / ";

export interface FrameSummary {
  key: string;
  name: string;
  page: string;
  nodeId: string;
  size: [number, number];
  /** Layers inside the frame, not counting the frame itself. */
  layers: number;
}

export interface TreeNode {
  /** `Frame / Group / Layer`, ending with this node's own name. */
  path: string;
  /** 0 for the frame itself. */
  depth: number;
  type: string;
  name: string;
  nodeId?: string;
  /** Only ever `true`, and only when `includeHidden` was asked for. */
  hidden?: boolean;
  /** The walk stopped here because the export hit its depth limit. */
  truncated?: boolean;
  /** Children the export left out because they matched the library. */
  omittedChildren?: number;
  props: Record<string, unknown>;
}

export interface TreeOptions {
  /** Include hidden layers, marked `hidden: true`. Off by default. */
  includeHidden?: boolean;
  /** Deepest level to return, counting the frame as 0. */
  maxDepth?: number;
}

export interface Mismatch {
  /** Frame key — the same key `frames()` returns. */
  frame: string;
  /** Layer path inside the frame, ending with the layer's own name. */
  path: string;
  nodeId?: string;
  /** The property that disagrees with its token, e.g. `itemSpacing`. */
  field: string;
  /** Variable name the field is bound to. */
  token: string;
  /** What the token resolves to. */
  tokenValue: unknown;
  /** What the layer actually renders. */
  rendered: unknown;
}

export interface DeviationOptions {
  /** Include deviations the designer marked as deliberate. Off by default. */
  includeIntentional?: boolean;
}

export type HitField = "text" | "name" | "component";

export interface Hit {
  frame: string;
  path: string;
  name: string;
  type: string;
  nodeId?: string;
  /** Which field matched. */
  in: HitField;
  /** The value that matched, so a caller can show why. */
  match: string;
}

export interface FindOptions {
  in?: HitField[];
}

/** Every exported frame, smallest useful description of each, sorted by key. */
export function frames(usage: UsageSnapshot): FrameSummary[] {
  return [...(usage.frames ?? [])]
    .sort(byKey)
    .map((frame) => ({
      key: frame.key,
      name: frame.name,
      page: frame.page,
      nodeId: frame.nodeId,
      size: frame.size,
      layers: countLayers(frame.structure),
    }));
}

/**
 * Library components this file uses, most-used first. Ties break on name so the
 * order is stable across runs and across files.
 */
export function components(usage: UsageSnapshot): ComponentUsageRecord[] {
  return [...(usage.components ?? [])].sort((a, b) => {
    if (b.instanceCount !== a.instanceCount) return b.instanceCount - a.instanceCount;
    return compare(a.name, b.name) || compare(a.key, b.key);
  });
}

/**
 * A frame's layers as a flat, pre-ordered list.
 *
 * Flat rather than nested on purpose: an agent greps, and a nested tree buries
 * the one line it came for under indentation it has to reconstruct. Each entry
 * carries its full path, so the nesting is still recoverable and still
 * searchable.
 */
export function tree(usage: UsageSnapshot, frameRef: string, opts: TreeOptions = {}): TreeNode[] {
  const frame = resolveFrame(usage, frameRef);
  const out: TreeNode[] = [];
  walk(frame.structure, [], 0, out, opts);
  return out;
}

function walk(
  node: SerializedNode | undefined,
  ancestors: string[],
  depth: number,
  out: TreeNode[],
  opts: TreeOptions,
): void {
  if (!node) return;
  // A hidden subtree is skipped whole. Its children are hidden too — Figma has
  // no way to show a layer inside a hidden parent — so descending would report
  // visible-looking layers that nobody can see.
  if (node.hidden && !opts.includeHidden) return;
  if (opts.maxDepth !== undefined && depth > opts.maxDepth) return;

  const path = [...ancestors, node.name];
  const entry: TreeNode = {
    path: path.join(PATH_SEPARATOR),
    depth,
    type: node.type,
    name: node.name,
    props: node.props ?? {},
  };
  if (node.nodeId !== undefined) entry.nodeId = node.nodeId;
  if (node.hidden) entry.hidden = true;
  if (node.truncated) entry.truncated = true;
  if (node.omittedChildren !== undefined) entry.omittedChildren = node.omittedChildren;
  out.push(entry);

  for (const child of node.children ?? []) walk(child, path, depth + 1, out, opts);
}

/**
 * Every bound value that does not render as its token says it should.
 *
 * The mismatch record itself is complete, but it sits on a node deep inside a
 * frame's structure, where it says which field disagrees and nothing about
 * where. The frame key and layer path are carried down from the walk, which is
 * the whole value of this accessor: a mismatch you cannot locate is a rumour.
 *
 * Hidden layers are included — a stale binding is a fact about the file whether
 * or not the layer is currently shown.
 */
export function mismatches(usage: UsageSnapshot): Mismatch[] {
  const out: Mismatch[] = [];

  for (const frame of [...(usage.frames ?? [])].sort(byKey)) {
    const nodes = walkAll(frame.structure, []);
    for (const { node, path } of nodes) {
      for (const record of mismatchesOn(node)) {
        const entry: Mismatch = {
          frame: frame.key,
          path: path.join(PATH_SEPARATOR),
          field: String(record.field ?? ""),
          token: String(record.token ?? ""),
          tokenValue: record.tokenValue,
          rendered: record.rendered,
        };
        if (node.nodeId !== undefined) entry.nodeId = node.nodeId;
        out.push(entry);
      }
    }
  }

  return out.sort(
    byString((entry) => `${entry.frame}\u0000${entry.path}\u0000${entry.field}`),
  );
}

/**
 * Where the design steps outside the library. Deviations the designer marked as
 * deliberate are left out by default — they are answered questions, and mixing
 * them back in is how a report of twelve real problems reads as forty.
 *
 * The plugin's `path` is the ancestors only, so it is joined with `name` here:
 * a deviation's path is then the same string `tree`, `mismatches` and `find`
 * return for that layer, and greps against them. `name` stays its own field.
 */
export function deviations(usage: UsageSnapshot, opts: DeviationOptions = {}): DeviationRecord[] {
  const all = usage.deviations ?? [];
  const kept = opts.includeIntentional ? [...all] : all.filter((record) => !record.intentional);
  return kept
    .map((record) => ({ ...record, path: joinPath(record.path, record.name) }))
    .sort(byString((record) => `${record.frame}\u0000${record.path}\u0000${record.kind}`));
}

/**
 * How much of everything is in a usage snapshot, in one pass.
 *
 * It answers the same questions `frames`, `deviations` and `mismatches` answer,
 * for callers that want the size of the answer rather than the answer — the
 * `liblib info` header being the first of them. Those accessors each walk every
 * node and build every record on the way; asking three of them for three
 * numbers walks a large export three times and throws the records away.
 *
 * Every count here is defined by the same helpers the accessors use, not by a
 * second traversal with its own rules: `layers` counts what `frames()` counts,
 * `mismatches` counts what `mismatches()` returns, and the deviation split is
 * the one `deviations()` makes. The tests assert that equivalence, because a
 * counter that quietly disagrees with the list it summarises is worse than no
 * counter.
 */
export interface Counts {
  frames: number;
  components: number;
  styles: number;
  variables: number;
  variableCollections: number;
  /** Deviations still open — what `deviations()` returns by default. */
  deviations: number;
  /** Deviations the designer marked deliberate, which `deviations()` hides. */
  intentionalDeviations: number;
  mismatches: number;
  /** Layers across every frame, each frame not counting itself. */
  layers: number;
}

export function counts(usage: UsageSnapshot): Counts {
  const frameRecords = requireUsage(usage);
  const all = usage.deviations ?? [];
  let intentionalDeviations = 0;
  for (const record of all) if (record.intentional) intentionalDeviations += 1;

  let layers = 0;
  let mismatched = 0;
  for (const frame of frameRecords) {
    eachNode(frame.structure, [], (node, path) => {
      // `frames()` counts a frame's descendants, not the frame itself.
      if (path.length > 1) layers += 1;
      mismatched += mismatchesOn(node).length;
    });
  }

  return {
    frames: frameRecords.length,
    components: usage.components?.length ?? 0,
    styles: usage.styles?.length ?? 0,
    variables: usage.variables?.length ?? 0,
    variableCollections: usage.variableCollections?.length ?? 0,
    deviations: all.length - intentionalDeviations,
    intentionalDeviations,
    mismatches: mismatched,
    layers,
  };
}

/**
 * `counts` is usage-only, like every accessor above it: a library snapshot has
 * no frames, no layers, no deviations and no mismatches, so more than half of
 * the record would be a zero that reads as a finding. `read` already knows
 * which kind a file is; this catches a library snapshot handed straight to the
 * API and says so, rather than reporting a design system as a clean design.
 */
function requireUsage(usage: UsageSnapshot): FrameRecord[] {
  if (!Array.isArray(usage?.frames)) {
    const schema = (usage as { schema?: unknown } | undefined)?.schema;
    throw new SchemaError(
      `That is a library snapshot${typeof schema === "string" ? ` (\`${schema}\`)` : ""} — the ` +
        `design system itself, which has no frames to count. \`counts\` needs a usage snapshot, ` +
        `exported from a design file that consumes the library.`,
      typeof schema === "string" ? { schema } : undefined,
    );
  }
  return usage.frames;
}

/** `Order Summary` + `Totals` -> `Order Summary / Totals`. A frame-level deviation has no ancestors. */
function joinPath(ancestors: string, name: string): string {
  if (!ancestors) return name;
  if (!name) return ancestors;
  return `${ancestors}${PATH_SEPARATOR}${name}`;
}

/**
 * Searches layer text, layer names and the component behind each instance.
 *
 * A string query matches case-insensitively anywhere in the value; a RegExp is
 * used as given, minus its `g` flag, which would otherwise make every other
 * call miss.
 */
export function find(
  usage: UsageSnapshot,
  query: string | RegExp,
  opts: FindOptions = {},
): Hit[] {
  const fields: HitField[] = opts.in?.length ? opts.in : ["text", "name", "component"];
  const matches = matcher(query);
  const out: Hit[] = [];

  for (const frame of [...(usage.frames ?? [])].sort(byKey)) {
    for (const { node, path } of walkAll(frame.structure, [])) {
      const hit = (field: HitField, value: string) => {
        const entry: Hit = {
          frame: frame.key,
          path: path.join(PATH_SEPARATOR),
          name: node.name,
          type: node.type,
          in: field,
          match: value,
        };
        if (node.nodeId !== undefined) entry.nodeId = node.nodeId;
        out.push(entry);
      };

      for (const field of fields) {
        if (field === "text") {
          const characters = node.props?.characters;
          if (typeof characters === "string" && matches(characters)) hit("text", characters);
        } else if (field === "name") {
          if (matches(node.name)) hit("name", node.name);
        } else if (field === "component") {
          const main = node.props?.mainComponent as
            | { key?: unknown; name?: unknown }
            | undefined;
          const label = typeof main?.name === "string" ? main.name : undefined;
          const key = typeof main?.key === "string" ? main.key : undefined;
          if (label !== undefined && matches(label)) hit("component", label);
          else if (key !== undefined && matches(key)) hit("component", key);
        }
      }
    }
  }

  return out;
}

/**
 * Finds a frame by key, and — when it is unambiguous — by name or node id too.
 *
 * The key is `Page / Section / Frame`, which nobody types by hand. Falling back
 * to a name is what makes this usable; refusing an ambiguous one, with the
 * candidates listed, is what stops it from silently picking the wrong screen.
 */
export function resolveFrame(usage: UsageSnapshot, ref: string): FrameRecord {
  const all = usage.frames ?? [];
  if (typeof ref !== "string" || ref === "") {
    throw new SchemaError(
      `No frame given. Pass a frame key, name or node id — this file has: ${list(all)}`,
    );
  }

  const byExactKey = all.filter((frame) => frame.key === ref);
  if (byExactKey.length === 1) return byExactKey[0];

  const byNodeId = all.filter((frame) => frame.nodeId === ref);
  if (byNodeId.length === 1) return byNodeId[0];

  const byName = all.filter((frame) => frame.name === ref);
  if (byName.length === 1) return byName[0];

  const candidates = byExactKey.length ? byExactKey : byName.length ? byName : byNodeId;
  if (candidates.length > 1) {
    throw new SchemaError(
      `\`${ref}\` matches ${candidates.length} frames in this file. Did you mean one of: ` +
        `${candidates.map((frame) => `\`${frame.key}\``).join(", ")}?`,
    );
  }

  throw new SchemaError(`No frame matches \`${ref}\`. This file has: ${list(all)}`);
}

function list(all: FrameRecord[]): string {
  const shown = [...all].sort(byKey).slice(0, 20).map((frame) => `\`${frame.key}\``);
  const rest = all.length - shown.length;
  return `${shown.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}`;
}

function matcher(query: string | RegExp): (value: string) => boolean {
  if (query instanceof RegExp) {
    // A `g` regex carries `lastIndex` between calls, so the same pattern would
    // match on one node and miss on the next.
    const flags = query.flags.replace(/[gy]/g, "");
    const pattern = new RegExp(query.source, flags);
    return (value) => pattern.test(value);
  }
  const needle = String(query).toLowerCase();
  return (value) => value.toLowerCase().includes(needle);
}

/**
 * The one traversal every accessor that reads a frame's structure is built on.
 *
 * Pre-order, hidden layers included, each node visited with the path that
 * reaches it — the caller decides what to keep. `walkAll` collects, `counts`
 * only tallies; sharing the walk is what keeps them from drifting apart on
 * which nodes exist.
 */
function eachNode(
  node: SerializedNode | undefined,
  ancestors: string[],
  visit: (node: SerializedNode, path: string[]) => void,
): void {
  if (!node) return;
  const path = [...ancestors, node.name];
  visit(node, path);
  for (const child of node.children ?? []) eachNode(child, path, visit);
}

/** Every node in a subtree, pre-order, each with the path that reaches it. */
function walkAll(
  node: SerializedNode | undefined,
  ancestors: string[],
): { node: SerializedNode; path: string[] }[] {
  const out: { node: SerializedNode; path: string[] }[] = [];
  eachNode(node, ancestors, (found, path) => out.push({ node: found, path }));
  return out;
}

/**
 * The binding mismatches recorded on one node — the single definition of what
 * counts as one, so `mismatches()` and `counts()` cannot disagree about it.
 */
function mismatchesOn(node: SerializedNode): Record<string, unknown>[] {
  const found = node.props?.bindingMismatch;
  if (!Array.isArray(found)) return [];
  return found.filter(
    (raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === "object",
  );
}

function countLayers(node: SerializedNode | undefined): number {
  if (!node) return 0;
  let total = 0;
  for (const child of node.children ?? []) total += 1 + countLayers(child);
  return total;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byString<T>(field: (item: T) => string) {
  return (a: T, b: T) => compare(field(a), field(b));
}

const byKey = byString<{ key: string }>((frame) => frame.key);
