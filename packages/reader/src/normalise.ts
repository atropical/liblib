import { SerializedNode, Snapshot, UsageSnapshot } from "../../../src/types.d";

/**
 * Brings older exports up to the current field names, once, at read time.
 *
 * `@3` renamed a node's `offset` to `position` and a binding mismatch's
 * `expected`/`actual` to `tokenValue`/`rendered`. Accessors must never branch on
 * schema version — the moment one of them does, every caller has to know which
 * schema it is holding, and the accessors stop being the reason this package
 * exists.
 */

/** A numeric field that arrived as a string. Coerced rather than trusted. */
function num(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function numPair(value: unknown): unknown {
  if (!Array.isArray(value) || value.length !== 2) return value;
  return [num(value[0]), num(value[1])];
}

export interface BindingMismatch {
  field: string;
  token: string;
  tokenValue: unknown;
  rendered: unknown;
}

function normaliseNode(node: SerializedNode): void {
  if (!node || typeof node !== "object") return;

  const props = node.props;
  if (props && typeof props === "object" && !Array.isArray(props)) {
    // `@1`/`@2` wrote a node's own coordinates as `offset`. Only the top-level
    // prop moves: an effect's shadow offset is a different thing that kept its
    // name, and it lives nested inside `props.effects[]`.
    if (props.position === undefined && Array.isArray(props.offset)) {
      props.position = props.offset;
      delete props.offset;
    }
    if (props.position !== undefined) props.position = numPair(props.position);

    if (Array.isArray(props.bindingMismatch)) {
      props.bindingMismatch = props.bindingMismatch.map((entry: unknown) => {
        if (!entry || typeof entry !== "object") return entry;
        const record = entry as Record<string, unknown>;
        if (record.tokenValue === undefined && record.expected !== undefined) {
          record.tokenValue = record.expected;
          delete record.expected;
        }
        if (record.rendered === undefined && record.actual !== undefined) {
          record.rendered = record.actual;
          delete record.actual;
        }
        record.tokenValue = num(record.tokenValue);
        record.rendered = num(record.rendered);
        return record;
      });
    }
  }

  for (const child of node.children ?? []) normaliseNode(child);
}

export function normaliseUsage(usage: UsageSnapshot): UsageSnapshot {
  for (const frame of usage.frames ?? []) {
    frame.size = numPair(frame.size) as [number, number];
    if (frame.structure) normaliseNode(frame.structure);
  }
  for (const component of usage.components ?? []) {
    component.instanceCount = num(component.instanceCount) as number;
  }
  return usage;
}

export function normaliseLibrary(snapshot: Snapshot): Snapshot {
  for (const component of snapshot.components ?? []) {
    if (component.structure) normaliseNode(component.structure);
    for (const variant of Object.values(component.variants ?? {})) {
      if (variant?.structure) normaliseNode(variant.structure);
    }
  }
  return snapshot;
}
