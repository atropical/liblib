import {
  ChangeKind,
  ComponentRecord,
  DeviationRecord,
  DiffEntry,
  DiffReport,
  FieldChange,
  SNAPSHOT_SCHEMA,
  Snapshot,
  StyleRecord,
  USAGE_SCHEMA,
  UsageDiffReport,
  UsageSnapshot,
  VariableRecord,
} from "../types.d";
import { byField, hashValue, stableStringify } from "../utils/stable";

interface Identified {
  key: string;
  name: string;
  hash: string;
}

/**
 * Compares two snapshots of the same library. Records are matched on publish
 * key first — that survives renames, which is exactly the case an agent tends
 * to misread as "component deleted and a new one added".
 */
export function diffSnapshots(base: Snapshot, head: Snapshot): DiffReport {
  const components = diffCollection(base.components, head.components);
  const styles = diffCollection(base.styles, head.styles);
  const variables = diffCollection(base.variables, head.variables);

  const all = [...components, ...styles, ...variables];

  return {
    schema: SNAPSHOT_SCHEMA,
    base: { fileName: base.meta.fileName, generatedAt: base.meta.generatedAt },
    head: { fileName: head.meta.fileName, generatedAt: head.meta.generatedAt },
    summary: {
      added: all.filter((entry) => entry.kind === "added").length,
      removed: all.filter((entry) => entry.kind === "removed").length,
      renamed: all.filter((entry) => entry.kind === "renamed").length,
      modified: all.filter((entry) => entry.kind === "modified").length,
      componentsChanged: components.length,
      stylesChanged: styles.length,
      variablesChanged: variables.length,
    },
    components,
    styles,
    variables,
  };
}

/**
 * Compares two usage snapshots of the same consuming file.
 *
 * The one thing this must not do is read a narrower export as a deletion. Two
 * runs can legitimately cover different frames — the designer selected a
 * section last time and two screens this time — so anything outside the new
 * export's scope is reported as `out-of-scope`, which is a statement about
 * coverage, not about the design.
 */
export function diffUsage(base: UsageSnapshot, head: UsageSnapshot): UsageDiffReport {
  const headScope = new Set(head.meta.scope.frames);
  const inScope = (frameKey: string) => headScope.size === 0 || headScope.has(frameKey);

  const frames = diffCollection(base.frames, head.frames, inScope);
  const components = diffCollection(base.components, head.components);
  const styles = diffCollection(base.styles, head.styles);
  const variables = diffCollection(base.variables, head.variables);
  const deviations = diffCollection(
    deviationEntries(base.deviations),
    deviationEntries(head.deviations),
    (key) => inScope(key.split(" ▸ ")[0] ?? key),
  );

  const all = [...frames, ...components, ...styles, ...variables, ...deviations];

  return {
    schema: USAGE_SCHEMA,
    base: { fileName: base.meta.fileName, generatedAt: base.meta.generatedAt },
    head: { fileName: head.meta.fileName, generatedAt: head.meta.generatedAt },
    summary: {
      added: all.filter((entry) => entry.kind === "added").length,
      removed: all.filter((entry) => entry.kind === "removed").length,
      renamed: all.filter((entry) => entry.kind === "renamed").length,
      modified: all.filter((entry) => entry.kind === "modified").length,
      outOfScope: all.filter((entry) => entry.kind === "out-of-scope").length,
      framesChanged: frames.length,
      componentsChanged: components.length,
      stylesChanged: styles.length,
      variablesChanged: variables.length,
      deviationsChanged: deviations.length,
    },
    frames,
    components,
    styles,
    variables,
    deviations,
  };
}

/**
 * Deviations have no identity of their own — they are findings, not records —
 * so one is keyed by where it was found and what it was. A moved layer reads as
 * one gone and one appeared, which is the honest reading of a finding.
 */
function deviationEntries(deviations: DeviationRecord[]): Identified[] {
  return deviations.map((deviation) => ({
    key: `${deviation.frame} ▸ ${deviation.path} / ${deviation.name} ▸ ${deviation.kind}`,
    name: `${deviation.kind}: ${deviation.name}${deviation.intentional ? " (intentional)" : ""}`,
    hash: hashValue({
      kind: deviation.kind,
      detail: deviation.detail,
      intentional: deviation.intentional,
    }),
  }));
}

function diffCollection<T extends Identified>(
  baseItems: T[],
  headItems: T[],
  /** Whether a key the head no longer has was even in the head's scope. */
  inScope: (key: string) => boolean = () => true,
): DiffEntry[] {
  const baseByKey = indexBy(baseItems);
  const headByKey = indexBy(headItems);
  const entries: DiffEntry[] = [];

  for (const [key, headItem] of headByKey) {
    const baseItem = baseByKey.get(key);
    if (!baseItem) {
      entries.push({ kind: "added", key, name: headItem.name, changes: [] });
      continue;
    }
    if (baseItem.hash === headItem.hash) continue;

    const changes = diffRecords(baseItem, headItem);
    // A component's root node carries the same name, so a plain rename shows up
    // on both paths. Anything beyond those two is a real change.
    const renamedOnly =
      changes.length > 0 && changes.every((change) => RENAME_PATHS.has(change.path));
    const kind: ChangeKind = renamedOnly ? "renamed" : "modified";
    entries.push({
      kind,
      key,
      name: headItem.name,
      previousName: baseItem.name !== headItem.name ? baseItem.name : undefined,
      changes,
    });
  }

  for (const [key, baseItem] of baseByKey) {
    if (headByKey.has(key)) continue;
    entries.push({
      kind: inScope(key) ? "removed" : "out-of-scope",
      key,
      name: baseItem.name,
      changes: [],
    });
  }

  return entries.sort(byField((entry) => `${entry.kind}:${entry.name}`));
}

/**
 * A record with no publish key is unpublished; falling back to `name` keeps it
 * comparable, at the cost of reading a rename as add + remove.
 */
function indexBy<T extends Identified>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.key || `name:${item.name}`, item);
  return map;
}

/**
 * `frames` and `instanceCount` on a usage record say where a component is used
 * and how often — that moves whenever a screen is edited, and it is already
 * reported by the frame's own entry. Neither is excluded from the record, only
 * from the change list.
 */
const IGNORED_FIELDS = new Set(["hash", "path", "frames", "instanceCount"]);
const RENAME_PATHS = new Set(["name", "structure.name"]);

/**
 * `nodeId` is an address, not content — it is identical on every scan of the
 * same file and wholly different in a duplicate of it, so reporting it would
 * turn "I copied the library" into a diff against every component.
 */
function isIgnored(path: string): boolean {
  return IGNORED_FIELDS.has(path) || path === "nodeId" || path.endsWith(".nodeId");
}

function diffRecords(base: Identified, head: Identified): FieldChange[] {
  const changes: FieldChange[] = [];
  walk(base as unknown, head as unknown, "", changes);
  return changes.filter((change) => !isIgnored(change.path)).sort(byField((change) => change.path));
}

const MAX_CHANGES = 200;

function walk(before: unknown, after: unknown, path: string, changes: FieldChange[]): void {
  if (changes.length >= MAX_CHANGES) return;

  const leafPath = path || "(root)";
  if (before === after) return;

  const bothObjects =
    before !== null && after !== null && typeof before === "object" && typeof after === "object";

  if (!bothObjects) {
    changes.push({ path: leafPath, before, after });
    return;
  }

  if (Array.isArray(before) !== Array.isArray(after)) {
    changes.push({ path: leafPath, before, after });
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    // Arrays here are ordered by construction (children, fills, effects), so
    // index-wise comparison is the honest reading of "what moved or changed".
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) {
      walk(before[i], after[i], `${path}[${i}]`, changes);
    }
    return;
  }

  const beforeObject = before as Record<string, unknown>;
  const afterObject = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)]);
  for (const key of Array.from(keys).sort()) {
    const childPath = path ? `${path}.${key}` : key;
    // Skip before recursing, so ignored fields never eat the change budget.
    if (isIgnored(childPath)) continue;
    walk(beforeObject[key], afterObject[key], childPath, changes);
  }
}

/** Compact one-line rendering of a changed value for the Markdown report. */
export function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  const serialized = stableStringify(value);
  return serialized.length > 80 ? `${serialized.slice(0, 77)}…` : serialized;
}

export type AnyRecord = ComponentRecord | StyleRecord | VariableRecord;
