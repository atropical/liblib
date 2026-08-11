/**
 * Determinism helpers. A snapshot is only useful as a diff target if the same
 * design produces byte-identical output every run — so every object written
 * into a snapshot goes through `stableStringify`, and every array is sorted on
 * a stable key before serialization.
 */

/** JSON.stringify with object keys sorted recursively. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/** Same ordering rules as `stableStringify`, but returns a value, not a string. */
export function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalize);

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const normalized = normalize(source[key]);
    if (normalized === undefined) continue;
    out[key] = normalized;
  }
  return out;
}

/**
 * Node objects are written identity-first — `name` before `children` — so a
 * node's own name always precedes every line that belongs to it. Alphabetical
 * order puts `children` first, which pushes a group's name hundreds of lines
 * below its contents and makes any windowed read (grep context, a truncated
 * read, a chunked embedding) attribute those lines to the previous sibling.
 *
 * Only node objects get this treatment; every other map stays alphabetical.
 * Ordering is applied at encode time, never in `normalize`, so hashes are taken
 * over the data and can never move because of how it is laid out.
 */
const NODE_KEY_ORDER = [
  "name",
  "type",
  "nodeId",
  "hidden",
  "truncated",
  "omittedChildren",
  "props",
  "children",
];

function isSerializedNode(value: Record<string, unknown>): boolean {
  return (
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.props === "object" &&
    value.props !== null &&
    !Array.isArray(value.props)
  );
}

/** Same rules as `normalize`, plus the node key order above. Encode-time only. */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);

  const source = value as Record<string, unknown>;
  const keys = isSerializedNode(source) ? nodeKeys(source) : Object.keys(source).sort();

  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const canonical = canonicalize(source[key]);
    if (canonical === undefined) continue;
    out[key] = canonical;
  }
  return out;
}

/** Known node keys in fixed order, then anything else alphabetically. */
function nodeKeys(node: Record<string, unknown>): string[] {
  const known = NODE_KEY_ORDER.filter((key) => key in node);
  const rest = Object.keys(node)
    .filter((key) => !NODE_KEY_ORDER.includes(key))
    .sort();
  return [...known, ...rest];
}

/**
 * FNV-1a run twice with different offset bases, concatenated to 16 hex chars.
 * Not cryptographic — it only needs to make "did this component change?"
 * cheap to answer, and to survive being written into a file a human reads.
 */
export function hash(input: string): string {
  return (fnv1a(input, 0x811c9dc5) + fnv1a(input, 0x01000193)).toString();
}

function fnv1a(input: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range without overflowing the float mantissa.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Hash of a value's canonical form. */
export function hashValue(value: unknown): string {
  return hash(stableStringify(value));
}

/** Round to `places` decimals, collapsing -0 to 0 so it never shows as a change. */
export function round(value: number, places = 2): number {
  const factor = Math.pow(10, places);
  const result = Math.round(value * factor) / factor;
  return result === 0 ? 0 : result;
}

/**
 * Figma style ids look like `S:1a2b3c…,4:5` — the part after `S:` and before
 * the comma is the publish key, which is what stays stable across files and
 * publishes. The trailing node reference is local and must not enter a hash.
 */
export function styleKeyFromId(styleId: string): string | undefined {
  if (!styleId) return undefined;
  const match = /^S:([^,]+)/.exec(styleId);
  return match ? match[1] : styleId;
}

/** Sort helper that never depends on locale. */
export function byField<T>(field: (item: T) => string) {
  return (a: T, b: T) => {
    const left = field(a);
    const right = field(b);
    return left < right ? -1 : left > right ? 1 : 0;
  };
}
