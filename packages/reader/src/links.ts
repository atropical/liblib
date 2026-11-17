import type { ComponentRecord, Snapshot, UsageSnapshot } from "@atropical/liblib-core/types";
import { nodeUrl as coreNodeUrl, parseFigmaUrl as coreParse } from "@atropical/liblib-core/links";
import { resolveFrame } from "./accessors";
import { SchemaError } from "./errors";

/**
 * Turning a record into something Figma's MCP tools can open: `get_screenshot`
 * and `get_design_context` both take `{ fileKey, nodeId }`.
 *
 * The file key comes from `meta.fileKey`. Exports written by the Community
 * plugin before 2.4.0 — and newer ones where nobody pasted the file's link —
 * have none, so every function here also takes the link from the caller.
 */

export interface FigmaLink {
  fileKey: string;
  /** Node id in API form (`865:12277`), when the link had one. */
  nodeId?: string;
}

/** Reads a figma.com file link. `null` for anything that is not one. */
export function parseFigmaUrl(input: string): FigmaLink | null {
  return coreParse(input);
}

/** A Dev Mode link to `nodeId`. Takes the colon form the export and the MCP tools use. */
export function nodeUrl(fileKey: string, nodeId: string, fileName?: string): string {
  return coreNodeUrl(fileKey, nodeId, fileName);
}

export interface LinkOptions {
  /** The file's Figma link, used when the export has no `meta.fileKey` — and over it when given. */
  fileUrl?: string;
}

export interface NodeLink {
  /** What the reference resolved to: a frame key, a component or variant name, or the id itself. */
  name: string;
  kind: "frame" | "component" | "variant" | "node";
  nodeId: string;
  /** Absent when neither the export nor `fileUrl` supplied one. */
  fileKey?: string;
  url?: string;
}

/** The file key to use: an explicit link wins, then the export's own. Throws on a bad link. */
export function fileKeyOf(snapshot: Snapshot | UsageSnapshot, opts: LinkOptions = {}): string | undefined {
  if (opts.fileUrl !== undefined) {
    const parsed = parseFigmaUrl(opts.fileUrl);
    if (!parsed) {
      throw new SchemaError(
        `\`${opts.fileUrl}\` is not a Figma file link. It looks like https://www.figma.com/design/<key>/<name>.`,
      );
    }
    return parsed.fileKey;
  }
  return snapshot.meta?.fileKey || undefined;
}

const NODE_ID = /^I?\d+:\d+(?:;\d+:\d+)*$/;

/**
 * Resolves `ref` to a node and builds its link.
 *
 * In a usage export `ref` is a frame (key, name or node id, as `tree` takes).
 * In a library snapshot it is a component — by key, name or node id — or a
 * variant, as `Set / Size=Large` or by its own name when only one set has it.
 * Any bare node id (`865:12277`) resolves in either, so a layer found with
 * `tree` or `find` can be opened too.
 */
export function link(
  snapshot: Snapshot | UsageSnapshot,
  ref: string,
  opts: LinkOptions = {},
): NodeLink {
  const target = "frames" in snapshot ? frameTarget(snapshot, ref) : componentTarget(snapshot, ref);
  const fileKey = fileKeyOf(snapshot, opts);
  if (!fileKey) return target;
  return { ...target, fileKey, url: nodeUrl(fileKey, target.nodeId, snapshot.meta?.fileName) };
}

function frameTarget(usage: UsageSnapshot, ref: string): NodeLink {
  try {
    const frame = resolveFrame(usage, ref);
    return { name: frame.key, kind: "frame", nodeId: frame.nodeId };
  } catch (error) {
    if (NODE_ID.test(ref)) return { name: ref, kind: "node", nodeId: ref };
    throw error;
  }
}

function componentTarget(library: Snapshot, ref: string): NodeLink {
  const all = library.components ?? [];
  const as = (component: ComponentRecord): NodeLink => ({
    name: component.name,
    kind: "component",
    nodeId: component.nodeId,
  });

  for (const field of ["key", "nodeId", "name"] as const) {
    const hits = all.filter((component) => component[field] === ref);
    if (hits.length === 1) return as(hits[0]);
    if (hits.length > 1) {
      throw new SchemaError(
        `\`${ref}\` matches ${hits.length} components. Pass a key or node id instead: ` +
          hits.map((component) => `\`${component.nodeId}\` (${component.path || component.name})`).join(", "),
      );
    }
  }

  const variants = all.flatMap((set) =>
    Object.entries(set.variants ?? {}).map(([name, variant]) => ({ set: set.name, name, ...variant })),
  );
  const split = ref.lastIndexOf(" / ");
  const hits = variants.filter(
    (variant) =>
      variant.nodeId === ref ||
      variant.key === ref ||
      (split > 0 && variant.set === ref.slice(0, split) && variant.name === ref.slice(split + 3)) ||
      variant.name === ref,
  );
  if (hits.length === 1) {
    return { name: `${hits[0].set} / ${hits[0].name}`, kind: "variant", nodeId: hits[0].nodeId };
  }
  if (hits.length > 1) {
    throw new SchemaError(
      `\`${ref}\` is a variant of ${hits.length} sets. Name the set too: ` +
        hits.slice(0, 10).map((variant) => `\`${variant.set} / ${variant.name}\``).join(", "),
    );
  }

  if (NODE_ID.test(ref)) return { name: ref, kind: "node", nodeId: ref };
  throw new SchemaError(`No component or variant matches \`${ref}\`. \`liblib info\` lists what this file has.`);
}
