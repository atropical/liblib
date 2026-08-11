/// <reference types="@figma/plugin-typings" />

import {
  ComponentPropertyRecord,
  ComponentRecord,
  ProbeGroup,
  ProbeResult,
  SNAPSHOT_SCHEMA,
  Snapshot,
  SnapshotOptions,
  StyleRecord,
  VariableCollectionRecord,
  VariableRecord,
} from "../types.d";
import { byField, hashValue, round, styleKeyFromId } from "../utils/stable";
import {
  createContext,
  resolveVariableAliases,
  serializeNode,
  SerializeContext,
} from "./serializeNode";

// Injected at build time from package.json; see vite.config.js and the
// build:plugin script, so the version lives in exactly one place.
export const PLUGIN_VERSION = __PLUGIN_VERSION__;

export type ProgressFn = (stage: string, scanned: number, total: number) => void;

export const DEFAULT_OPTIONS: SnapshotOptions = {
  depth: 6,
  includeStyles: true,
  includeVariables: true,
  // On by default: geometry bugs (a 32px button rendering against a 28px
  // symbol) are invisible to a bound-variable comparison, which only ever sees
  // colour and token mistakes.
  includeSizes: true,
};

export async function buildSnapshot(
  options: SnapshotOptions = DEFAULT_OPTIONS,
  onProgress: ProgressFn = () => {},
): Promise<Snapshot> {
  // `documentAccess: dynamic-page` means pages are lazily loaded; a document-wide
  // search would otherwise only see the page the user happens to be on.
  await figma.loadAllPagesAsync();

  const ctx = createContext({ depth: options.depth, includeSizes: options.includeSizes });

  const components = await collectComponents(componentRoots(), ctx, onProgress);
  const styles = options.includeStyles ? await collectStyles(ctx, onProgress) : [];
  const { collections, variables } = options.includeVariables
    ? await collectVariables(onProgress)
    : { collections: [], variables: [] };

  return assemble(components, styles, collections, variables);
}

/**
 * Measures what a full scan would cost, without doing one.
 *
 * Every component's node count is measured exactly — that only reads
 * `children`, so it is cheap — and a stratified sample is actually serialized
 * and timed. The sample is split into a small-component and a large-component
 * group so `estimateScan` can separate per-component cost from per-node cost.
 *
 * Styles and variables are collected in full: they are cheap, and they are the
 * fixed part of the output, which must not be scaled per component.
 */
export async function probeSnapshot(
  options: SnapshotOptions = DEFAULT_OPTIONS,
  sampleSize = 24,
): Promise<ProbeResult> {
  const overheadStart = Date.now();
  await figma.loadAllPagesAsync();

  const roots = componentRoots();
  const probeCtx = createContext({ depth: options.depth, includeSizes: options.includeSizes });
  const styles = options.includeStyles ? await collectStyles(probeCtx) : [];
  const { collections, variables } = options.includeVariables
    ? await collectVariables()
    : { collections: [], variables: [] };

  // Counting nodes only reads `children`, no properties, so it is far cheaper
  // than serializing — cheap enough to do for every component in the file.
  const weights = roots.map((root) => countCost(root, options.depth));
  const totalNodes = weights.reduce((sum, weight) => sum + weight, 0);
  const overheadMs = Date.now() - overheadStart;

  const picks = stratifiedPicks(weights, sampleSize);
  const ctx = probeCtx;

  // Split by size so the two groups differ in shape; identical groups would
  // give two copies of the same equation and nothing to solve.
  const bySize = [...picks].sort((a, b) => weights[a] - weights[b]);
  const half = Math.floor(bySize.length / 2);
  const groups: ProbeGroup[] = [];
  for (const indices of [bySize.slice(0, half), bySize.slice(half)]) {
    if (indices.length === 0) continue;
    const start = Date.now();
    const records = await collectComponents(indices.map((index) => roots[index]), ctx);
    groups.push({
      snapshot: assemble(records, styles, collections, variables),
      componentCount: indices.length,
      nodes: indices.reduce((sum, index) => sum + weights[index], 0),
      millis: Date.now() - start,
    });
  }

  return {
    componentCount: roots.length,
    sampleSize: picks.length,
    totalNodes,
    groups,
    overheadMs,
    base: assemble([], styles, collections, variables),
  };
}

/**
 * Nodes this component will actually cost to serialize, at `depth`.
 *
 * A component set is not one tree: `serializeComponentRoot` walks each variant
 * from its own root at full depth. Counting a set as a single tree would
 * undercount it by roughly a level per variant.
 */
function countCost(node: ComponentNode | ComponentSetNode, depth: number): number {
  if (node.type !== "COMPONENT_SET") return countNodes(node, depth);
  let total = 1;
  for (const variant of node.children) total += countNodes(variant, depth);
  return total;
}

/** Nodes in this subtree down to `depth`, counting the root itself. */
function countNodes(node: SceneNode, depth: number, level = 0): number {
  if (!("children" in node) || level >= depth) return 1;
  let total = 1;
  for (const child of node.children) total += countNodes(child, depth, level + 1);
  return total;
}

/**
 * Picks sample indices spread across the size distribution rather than across
 * document order. Even spacing by position aliases badly against a library's
 * own structure — a stride that keeps landing on component sets predicts a
 * file several times larger than it is.
 */
function stratifiedPicks(weights: number[], count: number): number[] {
  if (weights.length <= count) return weights.map((_, index) => index);

  const bySize = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => a.weight - b.weight || a.index - b.index);

  const step = bySize.length / count;
  // Offset by half a step so the picks sit mid-stratum instead of always on
  // the smallest member of each band.
  return Array.from({ length: count }, (_, i) => bySize[Math.floor(i * step + step / 2)].index);
}

function componentRoots(): (ComponentNode | ComponentSetNode)[] {
  const found = figma.root.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
  // Variants are reported through their parent set, never as top-level entries.
  return found.filter((node) => !(node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET"));
}

function assemble(
  components: ComponentRecord[],
  styles: StyleRecord[],
  collections: VariableCollectionRecord[],
  variables: VariableRecord[],
): Snapshot {
  return {
    schema: SNAPSHOT_SCHEMA,
    meta: {
      generatedAt: new Date().toISOString(),
      pluginVersion: PLUGIN_VERSION,
      fileName: figma.root.name,
      fileKey: figma.fileKey,
      counts: {
        components: components.filter((c) => c.type === "COMPONENT").length,
        componentSets: components.filter((c) => c.type === "COMPONENT_SET").length,
        variants: components.reduce((sum, c) => sum + Object.keys(c.variants ?? {}).length, 0),
        styles: styles.length,
        variableCollections: collections.length,
        variables: variables.length,
      },
    },
    components,
    styles,
    variableCollections: collections,
    variables,
  };
}

async function collectComponents(
  roots: (ComponentNode | ComponentSetNode)[],
  ctx: SerializeContext,
  onProgress: ProgressFn = () => {},
): Promise<ComponentRecord[]> {
  const records: ComponentRecord[] = [];
  for (let i = 0; i < roots.length; i++) {
    onProgress("components", i, roots.length);
    records.push(await serializeComponentRoot(roots[i], ctx));
  }
  onProgress("components", roots.length, roots.length);

  return records.sort(byField((record) => record.key || record.name));
}

async function serializeComponentRoot(
  node: ComponentNode | ComponentSetNode,
  ctx: SerializeContext,
): Promise<ComponentRecord> {
  const record: ComponentRecord = {
    key: node.key,
    nodeId: node.id,
    name: node.name,
    path: nodePath(node),
    type: node.type,
    description: node.description ?? "",
    documentationLinks: (node.documentationLinks ?? []).map((link) => link.uri).sort(),
    properties: serializePropertyDefinitions(node.componentPropertyDefinitions),
    structure: { type: node.type, name: node.name, props: {} },
    hash: "",
  };

  if (node.type === "COMPONENT_SET") {
    // Set-level props only (padding/fills on the set frame are cosmetic but do
    // get published, so they still belong in the snapshot).
    record.structure = await serializeNode(node, { ...ctx, depth: 0 });
    delete record.structure.children;
    record.structure.truncated = undefined;

    record.variants = {};
    for (const variant of [...node.children].sort(byField((child) => child.name))) {
      if (variant.type !== "COMPONENT") continue;
      const structure = await serializeNode(variant, ctx);
      record.variants[variant.name] = {
        key: variant.key,
        nodeId: variant.id,
        hash: hashValue(structure),
        structure,
      };
    }
  } else {
    record.structure = await serializeNode(node, ctx);
  }

  record.hash = hashValue({
    key: record.key,
    name: record.name,
    type: record.type,
    description: record.description,
    documentationLinks: record.documentationLinks,
    properties: record.properties,
    variants: record.variants,
    structure: record.structure,
  });

  return record;
}

function serializePropertyDefinitions(
  definitions: ComponentPropertyDefinitions,
): Record<string, ComponentPropertyRecord> {
  const out: Record<string, ComponentPropertyRecord> = {};
  for (const name of Object.keys(definitions ?? {}).sort()) {
    const definition = definitions[name];
    const record: ComponentPropertyRecord = { type: definition.type };
    if (definition.defaultValue !== undefined) record.defaultValue = definition.defaultValue;
    if (definition.variantOptions) record.variantOptions = [...definition.variantOptions].sort();
    if (definition.preferredValues) {
      record.preferredValues = definition.preferredValues.map((value) => `${value.type}:${value.key}`).sort();
    }
    out[name] = record;
  }
  return out;
}

/** `Page / Section / Frame` — human orientation only, excluded from the hash. */
export function nodePath(node: BaseNode): string {
  const parts: string[] = [];
  let current: BaseNode | null = node.parent;
  while (current && current.type !== "DOCUMENT") {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(" / ");
}

async function collectStyles(
  ctx: SerializeContext,
  onProgress: ProgressFn = () => {},
): Promise<StyleRecord[]> {
  onProgress("styles", 0, 1);

  const [paints, texts, effects, grids] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);

  const records: StyleRecord[] = [];
  for (const style of [...paints, ...texts, ...effects, ...grids]) {
    records.push(await styleRecordFor(style, ctx));
  }

  onProgress("styles", 1, 1);
  return records.sort(byField((record) => `${record.type}:${record.key || record.name}`));
}

/**
 * A style record from any style node, local or remote. The value shape differs
 * per type, so the type is read off the node rather than passed in — that is
 * what lets a consuming file build records for library styles it merely uses.
 */
export async function styleRecordFor(style: BaseStyle, ctx: SerializeContext): Promise<StyleRecord> {
  if (style.type === "PAINT") {
    const paintStyle = style as PaintStyle;
    return styleRecord(paintStyle, "PAINT", { paints: paintStyle.paints }, ctx);
  }
  if (style.type === "TEXT") {
    const textStyle = style as TextStyle;
    return styleRecord(
      textStyle,
      "TEXT",
      {
        fontName: textStyle.fontName,
        fontSize: textStyle.fontSize,
        lineHeight: textStyle.lineHeight,
        letterSpacing: textStyle.letterSpacing,
        textCase: textStyle.textCase,
        textDecoration: textStyle.textDecoration,
        paragraphSpacing: textStyle.paragraphSpacing,
        paragraphIndent: textStyle.paragraphIndent,
        listSpacing: textStyle.listSpacing,
        hangingPunctuation: textStyle.hangingPunctuation,
        hangingList: textStyle.hangingList,
        leadingTrim: textStyle.leadingTrim,
        boundVariables: textStyle.boundVariables,
      },
      ctx,
    );
  }
  if (style.type === "EFFECT") {
    const effectStyle = style as EffectStyle;
    return styleRecord(effectStyle, "EFFECT", { effects: effectStyle.effects }, ctx);
  }
  const gridStyle = style as GridStyle;
  return styleRecord(gridStyle, "GRID", { layoutGrids: gridStyle.layoutGrids }, ctx);
}

async function styleRecord(
  style: BaseStyle,
  type: StyleRecord["type"],
  value: unknown,
  ctx: SerializeContext,
): Promise<StyleRecord> {
  const normalizedValue = roundNumbers(await resolveVariableAliases(value, ctx));
  return {
    key: style.key || styleKeyFromId(style.id) || style.id,
    name: style.name,
    type,
    description: style.description ?? "",
    value: normalizedValue,
    hash: hashValue({ name: style.name, description: style.description ?? "", value: normalizedValue }),
  };
}

async function collectVariables(
  onProgress: ProgressFn = () => {},
): Promise<{ collections: VariableCollectionRecord[]; variables: VariableRecord[] }> {
  onProgress("variables", 0, 1);

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();

  // Aliases point at variable ids; resolving them to names keeps the snapshot
  // readable and stable when Figma reissues ids.
  const nameById = new Map<string, string>();
  for (const variable of variables) nameById.set(variable.id, variable.name);

  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));

  const collectionRecords: VariableCollectionRecord[] = collections
    .map((collection) => ({
      key: collection.key,
      name: collection.name,
      modes: collection.modes.map((mode) => mode.name).sort(),
      defaultMode: collection.modes.find((mode) => mode.modeId === collection.defaultModeId)?.name ?? "",
    }))
    .sort(byField((record) => record.key || record.name));

  const variableRecords: VariableRecord[] = [];
  for (const variable of variables) {
    const collection = collectionById.get(variable.variableCollectionId);
    const valuesByMode: Record<string, unknown> = {};
    for (const mode of collection?.modes ?? []) {
      const raw = variable.valuesByMode[mode.modeId];
      valuesByMode[mode.name] = serializeVariableValue(raw, nameById);
    }

    variableRecords.push({
      key: variable.key,
      name: variable.name,
      collection: collection?.name ?? "",
      resolvedType: variable.resolvedType,
      scopes: [...variable.scopes].sort(),
      codeSyntax: variable.codeSyntax as Record<string, string>,
      description: variable.description ?? "",
      valuesByMode,
      hash: hashValue({
        name: variable.name,
        collection: collection?.name ?? "",
        resolvedType: variable.resolvedType,
        scopes: [...variable.scopes].sort(),
        codeSyntax: variable.codeSyntax,
        description: variable.description ?? "",
        valuesByMode,
      }),
    });
  }

  onProgress("variables", 1, 1);
  return {
    collections: collectionRecords,
    variables: variableRecords.sort(byField((record) => `${record.collection}/${record.name}`)),
  };
}

export function serializeVariableValue(value: VariableValue | undefined, nameById: Map<string, string>): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS") {
    const alias = value as VariableAlias;
    return `{${nameById.get(alias.id) ?? `unresolved:${alias.id}`}}`;
  }
  if (typeof value === "object" && value !== null && "r" in value) {
    const color = value as RGBA;
    const to255 = (v: number) => Math.round(v * 255);
    const hex = [to255(color.r), to255(color.g), to255(color.b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const alpha = color.a === undefined ? 1 : round(color.a, 3);
    return alpha === 1 ? `#${hex}` : `#${hex}/${alpha}`;
  }
  return value;
}

/** Floats from Figma carry rendering noise; rounding keeps diffs meaningful. */
export function roundNumbers(value: unknown): unknown {
  if (typeof value === "number") return round(value, 4);
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = roundNumbers(item);
    }
    return out;
  }
  return value;
}
