/// <reference types="@figma/plugin-typings" />

import {
  ComponentPropertyRecord,
  ComponentUsageRecord,
  DeviationRecord,
  FrameRecord,
  ProbeGroup,
  ProbeResult,
  SelectionSummary,
  StyleRecord,
  USAGE_SCHEMA,
  UsageOptions,
  UsageScope,
  UsageSnapshot,
  VariableCollectionRecord,
  VariableRecord,
} from "../types.d";
import { byField, hashValue, round } from "../utils/stable";
import {
  nodePath,
  PLUGIN_VERSION,
  ProgressFn,
  roundNumbers,
  serializeVariableValue,
  styleRecordFor,
} from "./buildSnapshot";
import { createContext, serializeNode, SerializeContext } from "./serializeNode";

export const DEFAULT_USAGE_OPTIONS: UsageOptions = {
  scope: "selection",
  // Screens nest deeper than components do — a frame is a page, not a widget.
  depth: 12,
  // The default that makes a screen worth reading: the library's insides stay
  // in the library snapshot, the screen's own content comes through.
  instanceContent: "overrides",
  includeStyles: true,
  includeVariables: true,
  includeSizes: true,
  // Most spacing in a design is the gap between two layers, and a gap is only
  // recoverable from where those layers sit.
  includePositions: true,
  summariseVectors: true,
  flagDeviations: true,
};

/** Everything a usage scan asks of the serializer, in one place. */
function usageContext(options: UsageOptions): SerializeContext {
  return createContext({
    depth: options.depth,
    includeSizes: options.includeSizes,
    includeNodeIds: true,
    instanceContent: options.instanceContent,
    includePositions: options.includePositions,
    summariseVectors: options.summariseVectors,
    // A mismatch is only checkable when variables are being resolved anyway.
    checkBindings: options.includeVariables,
  });
}

/** Node types that count as a surface in their own right. */
const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"]);
/** Node types that only hold surfaces, and are looked through to find them. */
const CONTAINER_TYPES = new Set(["SECTION", "GROUP"]);

/**
 * A usage snapshot of the frames the user chose.
 *
 * The library snapshot answers "what does the design system contain?". This
 * answers "what does this file use from it, and how?" — and the two join on the
 * component publish key, so neither has to repeat the other.
 */
export async function buildUsage(
  options: UsageOptions = DEFAULT_USAGE_OPTIONS,
  onProgress: ProgressFn = () => {},
): Promise<UsageSnapshot> {
  if (options.scope === "file") await figma.loadAllPagesAsync();

  const roots = await resolveFrames(options.scope);
  if (roots.length === 0) {
    throw new Error(
      options.scope === "selection"
        ? "Nothing selected. Select the frames — or a section holding them — and scan again."
        : "No frames found in this scope.",
    );
  }

  const ctx = usageContext(options);

  const frames = await collectFrames(roots, ctx, onProgress);
  const components = await collectComponentUsage(roots, frames, onProgress);
  const styles = options.includeStyles ? await collectUsedStyles(ctx, onProgress) : [];
  const { collections, variables } = options.includeVariables
    ? await collectUsedVariables(ctx, onProgress)
    : { collections: [], variables: [] };
  const deviations = options.flagDeviations ? await collectDeviations(roots, frames, onProgress) : [];

  return assembleUsage(options.scope, frames, components, styles, collections, variables, deviations);
}

/**
 * Same sampling logic as the library probe, over frames instead of components.
 * Screens vary in size far more than components do, so the estimate matters
 * more here, not less.
 */
export async function probeUsage(
  options: UsageOptions = DEFAULT_USAGE_OPTIONS,
  sampleSize = 8,
): Promise<ProbeResult> {
  const overheadStart = Date.now();
  if (options.scope === "file") await figma.loadAllPagesAsync();

  const roots = await resolveFrames(options.scope);
  const ctx = usageContext(options);

  const weights = roots.map((root) => countNodes(root, options.depth));
  const totalNodes = weights.reduce((sum, weight) => sum + weight, 0);
  const overheadMs = Date.now() - overheadStart;

  const picks = pickSample(weights, sampleSize);
  const bySize = [...picks].sort((a, b) => weights[a] - weights[b]);
  const half = Math.floor(bySize.length / 2);

  const groups: ProbeGroup[] = [];
  for (const indices of [bySize.slice(0, half), bySize.slice(half)]) {
    if (indices.length === 0) continue;
    const start = Date.now();
    const sampled = indices.map((index) => roots[index]);
    const frames = await collectFrames(sampled, ctx);
    const components = await collectComponentUsage(sampled, frames);
    groups.push({
      snapshot: assembleUsage(options.scope, frames, components, [], [], [], []),
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
    base: assembleUsage(options.scope, [], [], [], [], [], []),
  };
}

/** What the current scope resolves to, so the UI can say it before scanning. */
export async function summariseSelection(scope: UsageScope): Promise<SelectionSummary> {
  if (scope === "file") await figma.loadAllPagesAsync();

  const roots = await resolveFrames(scope);
  const keys = frameKeys(roots);
  const selected = scope === "selection" ? figma.currentPage.selection.length : roots.length;

  return {
    scope,
    frames: roots.map((node, index) => ({ key: keys[index], name: node.name, nodeId: node.id })),
    // Selecting three sections that hold twelve frames is not "nine ignored",
    // so this only counts a shortfall, never an expansion.
    ignored: Math.max(0, selected - roots.length),
  };
}

/**
 * Turns whatever the designer clicked into a list of frames.
 *
 * A section and the frames inside it are the same export either way: identity
 * comes from each frame's own document path, never from what was selected, so
 * selecting the section on Monday and the frames on Tuesday still diff against
 * each other.
 */
async function resolveFrames(scope: UsageScope): Promise<SceneNode[]> {
  if (scope === "selection") return expandAll(dropNested(figma.currentPage.selection));
  if (scope === "page") return expandAll(figma.currentPage.children);

  const frames: SceneNode[] = [];
  for (const page of figma.root.children) {
    frames.push(...expandAll(page.children));
  }
  return frames;
}

/** Drops any node that already has an ancestor in the selection. */
function dropNested(nodes: readonly SceneNode[]): SceneNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes.filter((node) => {
    let parent: BaseNode | null = node.parent;
    while (parent) {
      if (ids.has(parent.id)) return false;
      parent = parent.parent;
    }
    return true;
  });
}

function expandAll(nodes: readonly SceneNode[]): SceneNode[] {
  const out: SceneNode[] = [];
  for (const node of nodes) expand(node, out);
  // Document order is kept here so the `#2` suffix a duplicate path gets is
  // assigned the same way every run; the records themselves are sorted by key.
  return out;
}

function expand(node: SceneNode, out: SceneNode[]): void {
  if (FRAME_TYPES.has(node.type)) {
    out.push(node);
    return;
  }
  if (CONTAINER_TYPES.has(node.type) && "children" in node) {
    for (const child of node.children) expand(child, out);
  }
}

/**
 * `Page / Section / Frame`, made unique. Two frames genuinely can share a path
 * — a designer duplicates a screen and leaves the name — and a duplicate key
 * would silently drop one of them from the export.
 */
function frameKeys(nodes: readonly SceneNode[]): string[] {
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    const path = [nodePath(node), node.name].filter(Boolean).join(" / ");
    const count = (seen.get(path) ?? 0) + 1;
    seen.set(path, count);
    return count === 1 ? path : `${path} #${count}`;
  });
}

async function collectFrames(
  roots: readonly SceneNode[],
  ctx: SerializeContext,
  onProgress: ProgressFn = () => {},
): Promise<FrameRecord[]> {
  const keys = frameKeys(roots);
  const records: FrameRecord[] = [];

  for (let index = 0; index < roots.length; index++) {
    onProgress("frames", index, roots.length);
    const node = roots[index];
    const structure = await serializeNode(node, ctx);

    records.push({
      key: keys[index],
      nodeId: node.id,
      name: node.name,
      page: pageOf(node)?.name ?? "",
      type: node.type,
      size: [round("width" in node ? node.width : 0), round("height" in node ? node.height : 0)],
      structure,
      hash: hashValue({ name: node.name, structure: stripIds(structure) }),
    });
  }
  onProgress("frames", roots.length, roots.length);

  return records.sort(byField((record) => record.key));
}

/**
 * The hash answers "did this frame change?", so it is taken over content with
 * every node id removed — ids are addresses, and a duplicated file would
 * otherwise report every frame as modified.
 */
function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "nodeId") continue;
    out[key] = stripIds(item);
  }
  return out;
}

function pageOf(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE") current = current.parent;
  return (current as PageNode) ?? null;
}

/**
 * Every library component the exported frames instantiate, with the exact
 * configurations they are used in.
 *
 * This is the part a consuming file cannot get any other way: its library
 * components are not nodes in this document, so they can only be discovered
 * through the instances that point at them.
 */
async function collectComponentUsage(
  roots: readonly SceneNode[],
  frames: FrameRecord[],
  onProgress: ProgressFn = () => {},
): Promise<ComponentUsageRecord[]> {
  const byKey = new Map<string, ComponentUsageRecord & { usedAsSet: Set<string>; frameSet: Set<string> }>();
  const keys = frameKeys(roots);

  for (let index = 0; index < roots.length; index++) {
    onProgress("components", index, roots.length);
    const root = roots[index];
    const frameKey = frames.find((frame) => frame.nodeId === root.id)?.key ?? keys[index];

    for (const instance of instancesIn(root)) {
      const main = await instance.getMainComponentAsync();
      if (!main) continue;

      const set = main.parent?.type === "COMPONENT_SET" ? (main.parent as ComponentSetNode) : null;
      const key = main.key || `local:${main.id}`;
      let record = byKey.get(key);

      if (!record) {
        record = {
          key,
          // A variant's own name is its property assignment (`Size=Small`), so
          // the set's name is the one that identifies the component.
          name: set ? set.name : main.name,
          setKey: set?.key || undefined,
          setName: set?.name,
          remote: main.remote,
          properties: readPropertyDefinitions(set ?? main),
          usedAs: [],
          instanceCount: 0,
          frames: [],
          hash: "",
          usedAsSet: new Set<string>(),
          frameSet: new Set<string>(),
        };
        byKey.set(key, record);
      }

      record.instanceCount += 1;
      record.frameSet.add(frameKey);
      const combo = variantCombo(instance);
      if (combo) record.usedAsSet.add(combo);
    }
  }
  onProgress("components", roots.length, roots.length);

  const records: ComponentUsageRecord[] = [];
  for (const record of byKey.values()) {
    const { usedAsSet, frameSet, ...rest } = record;
    const finished: ComponentUsageRecord = {
      ...rest,
      usedAs: Array.from(usedAsSet).sort(),
      frames: Array.from(frameSet).sort(),
    };
    // Frame membership and instance counts are the volatile part; the identity
    // and the configurations used are what a change should be reported on.
    finished.hash = hashValue({
      key: finished.key,
      name: finished.name,
      setName: finished.setName,
      remote: finished.remote,
      properties: finished.properties,
      usedAs: finished.usedAs,
    });
    records.push(finished);
  }

  return records.sort(byField((record) => `${record.name}:${record.key}`));
}

/** The instances inside a root, including the root itself when it is one. */
function instancesIn(root: SceneNode): InstanceNode[] {
  const found =
    "findAllWithCriteria" in root
      ? (root as FrameNode).findAllWithCriteria({ types: ["INSTANCE"] })
      : [];
  return root.type === "INSTANCE" ? [root, ...found] : [...found];
}

/** `Intent=Main, Size=Small` — variant properties only, sorted, one string. */
function variantCombo(instance: InstanceNode): string {
  const properties = instance.componentProperties;
  const parts: string[] = [];
  for (const name of Object.keys(properties).sort()) {
    const property = properties[name];
    if (property.type !== "VARIANT") continue;
    parts.push(`${name}=${String(property.value)}`);
  }
  return parts.join(", ");
}

/**
 * Property definitions as the library published them. Remote components are
 * proxies into another document, and reading them is best-effort — a missing
 * definition is worth losing, an aborted scan is not.
 */
function readPropertyDefinitions(
  node: ComponentNode | ComponentSetNode,
): Record<string, ComponentPropertyRecord> | undefined {
  try {
    const definitions = node.componentPropertyDefinitions;
    if (!definitions) return undefined;

    const out: Record<string, ComponentPropertyRecord> = {};
    for (const name of Object.keys(definitions).sort()) {
      const definition = definitions[name];
      const record: ComponentPropertyRecord = { type: definition.type };
      if (definition.defaultValue !== undefined) record.defaultValue = definition.defaultValue;
      if (definition.variantOptions) record.variantOptions = [...definition.variantOptions].sort();
      out[name] = record;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The styles the exported frames actually reference.
 *
 * A consuming file has no local styles to enumerate — every style it uses lives
 * in the library — so the only way to record them is to note the ids met while
 * serializing and resolve them afterwards.
 */
async function collectUsedStyles(
  ctx: SerializeContext,
  onProgress: ProgressFn = () => {},
): Promise<StyleRecord[]> {
  onProgress("styles", 0, 1);

  const records: StyleRecord[] = [];
  for (const id of ctx.styleIds) {
    try {
      const style = await figma.getStyleByIdAsync(id);
      if (style) records.push(await styleRecordFor(style, ctx));
    } catch {
      // A style whose library is no longer reachable: the reference is already
      // recorded on the node, and that is the part an agent needs.
    }
  }

  onProgress("styles", 1, 1);
  return records.sort(byField((record) => `${record.type}:${record.key || record.name}`));
}

/**
 * The variables the exported frames bind, plus everything those resolve
 * through. An alias chain is followed to its end: a screen bound to
 * `Surface/Card` tells an agent nothing unless the record for `Surface/Card`
 * says it resolves to `Neutral/100`.
 */
async function collectUsedVariables(
  ctx: SerializeContext,
  onProgress: ProgressFn = () => {},
): Promise<{ collections: VariableCollectionRecord[]; variables: VariableRecord[] }> {
  onProgress("variables", 0, 1);

  const pending = Array.from(ctx.variableNames.keys());
  const seen = new Set<string>(pending);
  const variables: Variable[] = [];

  while (pending.length > 0) {
    const id = pending.pop()!;
    const variable = await figma.variables.getVariableByIdAsync(id).catch(() => null);
    if (!variable) continue;
    variables.push(variable);

    for (const value of Object.values(variable.valuesByMode)) {
      if (!isAlias(value)) continue;
      if (seen.has(value.id)) continue;
      seen.add(value.id);
      pending.push(value.id);
    }
  }

  const nameById = new Map<string, string>();
  for (const variable of variables) nameById.set(variable.id, variable.name);

  const collectionsById = new Map<string, VariableCollection>();
  for (const variable of variables) {
    if (collectionsById.has(variable.variableCollectionId)) continue;
    const collection = await figma.variables
      .getVariableCollectionByIdAsync(variable.variableCollectionId)
      .catch(() => null);
    if (collection) collectionsById.set(collection.id, collection);
  }

  const collections: VariableCollectionRecord[] = Array.from(collectionsById.values())
    .map((collection) => ({
      key: collection.key,
      name: collection.name,
      modes: collection.modes.map((mode) => mode.name).sort(),
      defaultMode: collection.modes.find((mode) => mode.modeId === collection.defaultModeId)?.name ?? "",
    }))
    .sort(byField((record) => record.key || record.name));

  const records: VariableRecord[] = variables.map((variable) => {
    const collection = collectionsById.get(variable.variableCollectionId);
    const valuesByMode: Record<string, unknown> = {};
    for (const mode of collection?.modes ?? []) {
      valuesByMode[mode.name] = roundNumbers(
        serializeVariableValue(variable.valuesByMode[mode.modeId], nameById),
      );
    }

    const record: VariableRecord = {
      key: variable.key,
      name: variable.name,
      collection: collection?.name ?? "",
      resolvedType: variable.resolvedType,
      scopes: [...variable.scopes].sort(),
      codeSyntax: variable.codeSyntax as Record<string, string>,
      description: variable.description ?? "",
      valuesByMode,
      hash: "",
    };
    record.hash = hashValue({ ...record, hash: undefined });
    return record;
  });

  onProgress("variables", 1, 1);
  return {
    collections,
    variables: records.sort(byField((record) => `${record.collection}/${record.name}`)),
  };
}

function isAlias(value: unknown): value is VariableAlias {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: string }).type === "VARIABLE_ALIAS"
  );
}

/** Beyond this the list stops being a review aid and starts being the file. */
const MAX_DEVIATIONS = 500;

/**
 * Layers marked as a deliberate exception. Both forms exist because the plugin
 * data survives a rename and the name marker is visible in the layer panel,
 * and designers reach for whichever they can see.
 */
const INTENTIONAL_MARKER = /(^\s*[*✳✳︎])|\[custom\]|\[intentional\]/i;

function isMarkedIntentional(node: SceneNode): boolean {
  if (INTENTIONAL_MARKER.test(node.name)) return true;
  try {
    return node.getPluginData("intentional") === "true";
  } catch {
    return false;
  }
}

/**
 * Where the design steps outside the library.
 *
 * The point is not to police the file — it is that an agent reading a screen
 * cannot otherwise tell a deliberate one-off from a mistake, and guessing wrong
 * in either direction is expensive. Anything the designer marked comes through
 * as `intentional: true` rather than being dropped, so the agent sees both the
 * exception and the fact that it was meant.
 */
async function collectDeviations(
  roots: readonly SceneNode[],
  frames: FrameRecord[],
  onProgress: ProgressFn = () => {},
): Promise<DeviationRecord[]> {
  const records: DeviationRecord[] = [];
  const keys = frameKeys(roots);

  for (let index = 0; index < roots.length; index++) {
    onProgress("deviations", index, roots.length);
    const root = roots[index];
    const frameKey = frames.find((frame) => frame.nodeId === root.id)?.key ?? keys[index];
    await walkForDeviations(root, frameKey, [], false, records);
  }
  onProgress("deviations", roots.length, roots.length);

  return records
    .slice(0, MAX_DEVIATIONS)
    .sort(byField((record) => `${record.frame}:${record.path}:${record.kind}`));
}

async function walkForDeviations(
  node: SceneNode,
  frameKey: string,
  path: string[],
  inheritedIntent: boolean,
  out: DeviationRecord[],
): Promise<void> {
  if (out.length >= MAX_DEVIATIONS) return;

  const intentional = inheritedIntent || isMarkedIntentional(node);
  const add = (kind: DeviationRecord["kind"], detail?: string) => {
    out.push({
      kind,
      frame: frameKey,
      nodeId: node.id,
      path: path.join(" / "),
      name: node.name,
      type: node.type,
      detail,
      intentional,
    });
  };

  if (node.type === "INSTANCE") {
    const main = await node.getMainComponentAsync();
    if (!main) {
      add("missing-main", "The library component behind this instance is not reachable.");
    } else if (!main.remote) {
      add("local-component", `Instance of \`${main.name}\`, defined in this file rather than a library.`);
    }
    // Inside an instance the library is responsible for the values, so the walk
    // stops here: a hardcoded fill in there is the library's business, not this
    // file's, and reporting it would bury the deviations that are actionable.
    return;
  }

  for (const found of hardcodedValues(node)) add(found.kind, found.detail);

  if ("children" in node) {
    for (const child of node.children) {
      await walkForDeviations(child, frameKey, [...path, node.name], intentional, out);
    }
  }
}

interface HardcodedValue {
  kind: DeviationRecord["kind"];
  detail: string;
}

/**
 * Values set by hand where the library offers a token: a paint with no style
 * and no bound variable, a radius typed in, spacing that matches nothing.
 *
 * Deliberately conservative — every rule here asks "is there a binding?", never
 * "does this value look right?", so a false positive means the designer really
 * did type a number.
 */
function hardcodedValues(node: SceneNode): HardcodedValue[] {
  const found: HardcodedValue[] = [];
  const bound = ("boundVariables" in node ? node.boundVariables : undefined) as
    | Record<string, unknown>
    | undefined;
  const hasBinding = (field: string) => Boolean(bound && bound[field]);

  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const visible = node.fills.filter((paint) => paint.visible !== false);
    const styled = "fillStyleId" in node && node.fillStyleId && node.fillStyleId !== figma.mixed;
    if (visible.length > 0 && !styled && !hasBinding("fills")) {
      found.push({ kind: "hardcoded-fill", detail: describePaints(visible) });
    }
  }

  if ("strokes" in node && node.strokes.length > 0) {
    const styled = "strokeStyleId" in node && node.strokeStyleId;
    if (!styled && !hasBinding("strokes")) {
      found.push({ kind: "hardcoded-stroke", detail: describePaints([...node.strokes]) });
    }
  }

  if ("cornerRadius" in node) {
    const radius = node.cornerRadius;
    const radiusBound = ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"].some(
      hasBinding,
    );
    if (typeof radius === "number" && radius > 0 && !radiusBound) {
      found.push({ kind: "hardcoded-radius", detail: `${round(radius)}px` });
    }
  }

  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    const spacing: string[] = [];
    const itemSpacing = node.itemSpacing as number | undefined;
    if (typeof itemSpacing === "number" && itemSpacing !== 0 && !hasBinding("itemSpacing")) {
      spacing.push(`gap ${round(itemSpacing)}`);
    }
    const paddings: [string, number][] = [
      ["paddingTop", node.paddingTop],
      ["paddingRight", node.paddingRight],
      ["paddingBottom", node.paddingBottom],
      ["paddingLeft", node.paddingLeft],
    ];
    for (const [field, value] of paddings) {
      if (value !== 0 && !hasBinding(field)) spacing.push(`${field.replace("padding", "").toLowerCase()} ${round(value)}`);
    }
    if (spacing.length > 0) {
      found.push({ kind: "hardcoded-spacing", detail: spacing.join(", ") });
    }
  }

  return found;
}

function describePaints(paints: readonly Paint[]): string {
  return paints
    .map((paint) => {
      if (paint.type !== "SOLID") return paint.type;
      const to255 = (v: number) => Math.round(v * 255);
      const { r, g, b } = paint.color;
      return `#${[to255(r), to255(g), to255(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    })
    .join(", ");
}

/** Nodes in this subtree down to `depth`, counting the root itself. */
function countNodes(node: SceneNode, depth: number, level = 0): number {
  if (!("children" in node) || level >= depth) return 1;
  let total = 1;
  for (const child of node.children) total += countNodes(child, depth, level + 1);
  return total;
}

/** Spread across the size distribution, like the library probe does. */
function pickSample(weights: number[], count: number): number[] {
  if (weights.length <= count) return weights.map((_, index) => index);

  const bySize = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => a.weight - b.weight || a.index - b.index);

  const step = bySize.length / count;
  return Array.from({ length: count }, (_, i) => bySize[Math.floor(i * step + step / 2)].index);
}

function assembleUsage(
  scope: UsageScope,
  frames: FrameRecord[],
  components: ComponentUsageRecord[],
  styles: StyleRecord[],
  collections: VariableCollectionRecord[],
  variables: VariableRecord[],
  deviations: DeviationRecord[],
): UsageSnapshot {
  return {
    schema: USAGE_SCHEMA,
    meta: {
      generatedAt: new Date().toISOString(),
      pluginVersion: PLUGIN_VERSION,
      fileName: figma.root.name,
      fileKey: figma.fileKey,
      scope: {
        mode: scope,
        pages: Array.from(new Set(frames.map((frame) => frame.page))).sort(),
        frames: frames.map((frame) => frame.key).sort(),
      },
      counts: {
        frames: frames.length,
        components: components.length,
        localComponents: components.filter((record) => !record.remote).length,
        styles: styles.length,
        variables: variables.length,
        deviations: deviations.length,
        intentional: deviations.filter((record) => record.intentional).length,
      },
    },
    frames,
    components,
    styles,
    variableCollections: collections,
    variables,
    deviations,
  };
}
