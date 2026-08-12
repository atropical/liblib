/// <reference types="@figma/plugin-typings" />

import { InstanceContent, SerializedNode } from "../types.d";
import { hashValue, round, styleKeyFromId } from "../utils/stable";

export interface SerializeContext {
  /** How many levels below the component root to walk before truncating. */
  depth: number;
  /** Absolute width/height are usually resize noise, so they are opt-in. */
  includeSizes: boolean;
  /** Variable id -> "Collection/Variable Name", resolved lazily and cached. */
  variableNames: Map<string, string>;
  /**
   * Write `nodeId` on every node. Off for a library snapshot: a component is
   * addressed by its publish key, and per-node ids would only add churn.
   */
  includeNodeIds: boolean;
  /** How much of an instance's subtree to walk. `full` matches a library scan. */
  instanceContent: InstanceContent;
  /**
   * Write each node's position relative to its parent. A library component is
   * laid out by its own rules and moves as a unit, so this is for usage
   * snapshots, where the gap between two layers is a fact about the design.
   */
  includePositions: boolean;
  /** Replace outline shapes with a count on the parent. */
  summariseVectors: boolean;
  /**
   * Compare a bound variable against the value actually rendered, and record
   * where they differ. Needs variable lookups, so it is opt-in.
   */
  checkBindings: boolean;
  /** Variable id -> its value in the collection's default mode, cached. */
  variableValues: Map<string, unknown>;
  /**
   * Style ids met while serializing. A consuming file has no local styles to
   * enumerate, so the styles it uses can only be discovered this way.
   */
  styleIds: Set<string>;
}

export function createContext(overrides: Partial<SerializeContext> = {}): SerializeContext {
  return {
    depth: 6,
    includeSizes: false,
    variableNames: new Map(),
    includeNodeIds: false,
    instanceContent: "full",
    styleIds: new Set(),
    includePositions: false,
    summariseVectors: false,
    checkBindings: false,
    variableValues: new Map(),
    ...overrides,
  };
}

export async function serializeNode(
  node: SceneNode,
  ctx: SerializeContext,
  level = 0,
  /** Overridden node ids of the enclosing instance, in `overrides` mode. */
  overriddenIds?: Set<string>,
): Promise<SerializedNode> {
  const serialized: SerializedNode = {
    type: node.type,
    name: node.name,
    props: await collectProps(node, ctx),
  };

  if (ctx.includeNodeIds) serialized.nodeId = node.id;
  if (node.visible === false) serialized.hidden = true;

  // Position relative to the parent, which is what `x`/`y` already are for any
  // child. The root is skipped: its coordinates are the canvas position of the
  // whole surface, which moves whenever someone tidies the page and means
  // nothing about the design.
  if (ctx.includePositions && level > 0 && "x" in node) {
    serialized.props.offset = [round(node.x), round(node.y)];
  }

  if ("children" in node && node.children.length > 0) {
    const atInstanceBoundary = node.type === "INSTANCE" && ctx.instanceContent !== "full";

    if (level >= ctx.depth) {
      // Record that something was cut rather than silently reporting a leaf —
      // otherwise a deep change would look like "no change" in the diff.
      serialized.truncated = true;
      serialized.props.childCount = node.children.length;
    } else if (atInstanceBoundary && ctx.instanceContent === "boundary") {
      // The subtree is the library's, and the library snapshot already has it.
      // What configures it — key, property values, overridden fields — is in
      // `props`, so nothing about this instance is lost by stopping here.
      serialized.omittedChildren = node.children.length;
    } else {
      // Entering an instance restarts the filter from that instance's own
      // overrides; a branch below it is only interesting for what it changes.
      const filter = atInstanceBoundary
        ? overriddenIdsOf(node as InstanceNode)
        : overriddenIds;

      serialized.children = [];
      let omitted = 0;
      let omittedVectors = 0;
      for (const child of node.children) {
        if (ctx.summariseVectors && isVectorArtwork(child)) {
          omittedVectors += 1;
          continue;
        }
        if (filter && !carriesSignal(child, filter, ctx.depth - level)) {
          omitted += 1;
          continue;
        }
        serialized.children.push(await serializeNode(child, ctx, level + 1, filter));
      }
      if (omitted > 0) serialized.omittedChildren = omitted;
      // Counted, not silently dropped: "this layer holds artwork" is worth
      // knowing even when the outlines themselves are not.
      if (omittedVectors > 0) serialized.props.vectorShapes = omittedVectors;
      if (serialized.children.length === 0) delete serialized.children;
    }
  }

  return serialized;
}

/**
 * Node ids Figma reports as overridden inside this instance. Ids of nested
 * layers are composed by appending to the ancestor's id, so a prefix test is
 * enough to ask "does this branch contain an override?".
 */
function overriddenIdsOf(instance: InstanceNode): Set<string> {
  const ids = new Set<string>();
  for (const override of instance.overrides) ids.add(override.id);
  return ids;
}

/** Outline shapes: the insides of artwork, not layers anyone reasons about. */
function isVectorArtwork(node: SceneNode): boolean {
  return node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION";
}

/**
 * Whether a branch inside an instance is worth writing out.
 *
 * The test is not the node's type but what the node can say that nothing else
 * can. An override is a departure from the library. Text is the words, which no
 * library snapshot holds. And a nested instance names a library component —
 * the very thing this export exists to record, so pruning it for being
 * unmodified would be pruning the answer.
 */
function carriesSignal(node: SceneNode, overriddenIds: Set<string>, remainingDepth: number): boolean {
  for (const id of overriddenIds) {
    if (id === node.id || id.startsWith(`${node.id};`)) return true;
  }
  return hasIdentity(node, remainingDepth);
}

function hasIdentity(node: SceneNode, remainingDepth: number): boolean {
  if (node.type === "TEXT" || node.type === "INSTANCE") return true;
  if (remainingDepth <= 0 || !("children" in node)) return false;
  return node.children.some((child) => hasIdentity(child, remainingDepth - 1));
}

async function collectProps(node: SceneNode, ctx: SerializeContext): Promise<Record<string, unknown>> {
  const props: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    props[key] = value;
  };

  // --- Auto layout & sizing -------------------------------------------------
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    put("layoutMode", node.layoutMode);
    put("layoutWrap", node.layoutWrap);
    put("primaryAxisAlignItems", node.primaryAxisAlignItems);
    put("counterAxisAlignItems", node.counterAxisAlignItems);
    put("primaryAxisSizingMode", node.primaryAxisSizingMode);
    put("counterAxisSizingMode", node.counterAxisSizingMode);
    put("itemSpacing", mixedOr(node.itemSpacing, (v) => round(v)));
    if (node.layoutWrap === "WRAP") put("counterAxisSpacing", node.counterAxisSpacing);
    put("padding", [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map((v) => round(v)));
    put("itemReverseZIndex", node.itemReverseZIndex || undefined);
    put("strokesIncludedInLayout", node.strokesIncludedInLayout || undefined);
  }
  if ("layoutSizingHorizontal" in node) {
    put("layoutSizing", [node.layoutSizingHorizontal, node.layoutSizingVertical]);
  }
  if ("layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE") {
    put("layoutPositioning", node.layoutPositioning);
  }
  if ("layoutAlign" in node) put("layoutAlign", node.layoutAlign);
  if ("layoutGrow" in node && node.layoutGrow !== 0) put("layoutGrow", node.layoutGrow);
  if ("constraints" in node) put("constraints", [node.constraints.horizontal, node.constraints.vertical]);
  if ("minWidth" in node) {
    put("minWidth", nonNull(node.minWidth));
    put("maxWidth", nonNull(node.maxWidth));
    put("minHeight", nonNull(node.minHeight));
    put("maxHeight", nonNull(node.maxHeight));
  }
  if (ctx.includeSizes && "width" in node) {
    // Named rather than a `size` tuple: an agent greps for `width`, and a
    // rendered dimension is the one thing a bound-variable comparison cannot
    // see when the dimension is not bound to a variable at all.
    put("width", round(node.width));
    put("height", round(node.height));
  }

  // --- Appearance -----------------------------------------------------------
  if ("opacity" in node && node.opacity !== 1) put("opacity", round(node.opacity, 3));
  if ("blendMode" in node && node.blendMode !== "PASS_THROUGH") put("blendMode", node.blendMode);
  if ("isMask" in node && node.isMask) put("isMask", true);
  if ("clipsContent" in node) put("clipsContent", node.clipsContent);

  if ("fills" in node) put("fills", mixedOr(node.fills, (v) => v.map(serializePaint)));
  if ("strokes" in node && node.strokes.length > 0) {
    put("strokes", node.strokes.map(serializePaint));
    put("strokeWeight", mixedOr(node.strokeWeight, (v) => round(v)));
    put("strokeAlign", node.strokeAlign);
    if (node.dashPattern.length > 0) put("dashPattern", node.dashPattern);
    if ("strokeCap" in node) put("strokeCap", mixedOr(node.strokeCap, (v) => v));
  }
  if ("effects" in node && node.effects.length > 0) {
    put("effects", node.effects.map(serializeEffect));
  }
  if ("cornerRadius" in node) {
    put("cornerRadius", mixedOr(node.cornerRadius, (v) => round(v)));
    if (node.cornerRadius === figma.mixed && "topLeftRadius" in node) {
      put("corners", [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius].map((v) => round(v)));
    }
  }

  // --- Style references -----------------------------------------------------
  // Keys, not ids: a style id embeds a local node reference that churns.
  const styleKey = (id: string): string | undefined => {
    if (id) ctx.styleIds.add(id);
    return styleKeyFromId(id);
  };
  if ("fillStyleId" in node) put("fillStyle", mixedOr(node.fillStyleId, styleKey));
  if ("strokeStyleId" in node) put("strokeStyle", styleKey(node.strokeStyleId));
  if ("effectStyleId" in node) put("effectStyle", styleKey(node.effectStyleId));
  if ("gridStyleId" in node) put("gridStyle", styleKey(node.gridStyleId));

  // --- Variables ------------------------------------------------------------
  if ("boundVariables" in node && node.boundVariables) {
    const bound = await serializeBoundVariables(node.boundVariables as Record<string, unknown>, ctx);
    if (Object.keys(bound).length > 0) put("boundVariables", bound);
    if (ctx.checkBindings) {
      const mismatches = await bindingMismatches(node, node.boundVariables as Record<string, unknown>, ctx);
      if (mismatches.length > 0) put("bindingMismatch", mismatches);
    }
  }
  if ("inferredVariables" in node) {
    // Deliberately skipped: inferred (not bound) variables are a UI hint and
    // flip based on unrelated edits elsewhere in the file.
  }

  // --- Text -----------------------------------------------------------------
  if (node.type === "TEXT") {
    put("characters", node.characters);
    put("textAlign", [node.textAlignHorizontal, node.textAlignVertical]);
    put("textAutoResize", node.textAutoResize);
    put("textTruncation", node.textTruncation);
    put("maxLines", nonNull(node.maxLines));
    put("paragraphSpacing", node.paragraphSpacing);
    put("paragraphIndent", node.paragraphIndent);
    put("textStyle", mixedOr(node.textStyleId, styleKey));
    // Styled segments capture per-range typography, which is the only way to
    // express a text node whose scalar props read as `figma.mixed`.
    put("segments", node.getStyledTextSegments([
      "fontName",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "textCase",
      "textDecoration",
      "textStyleId",
      "fillStyleId",
      "listOptions",
      "indentation",
      "hyperlink",
    ]).map((segment) => ({
      characters: segment.characters,
      fontName: segment.fontName,
      fontSize: segment.fontSize,
      fontWeight: segment.fontWeight,
      lineHeight: segment.lineHeight,
      letterSpacing: segment.letterSpacing,
      textCase: segment.textCase,
      textDecoration: segment.textDecoration,
      textStyle: styleKey(segment.textStyleId),
      fillStyle: styleKey(segment.fillStyleId),
      listOptions: segment.listOptions,
      indentation: segment.indentation,
      hyperlink: segment.hyperlink,
    })));
  }

  // --- Instances ------------------------------------------------------------
  if (node.type === "INSTANCE") {
    const main = await node.getMainComponentAsync();
    put("mainComponent", main ? { key: main.key, name: main.name, remote: main.remote } : { missing: true });
    put("componentProperties", serializeComponentProperties(node.componentProperties));
    if (node.overrides.length > 0) {
      // Override *targets* are node ids, which mean nothing across files — the
      // set of overridden fields is the part that carries diff signal.
      const fields = new Set<string>();
      for (const override of node.overrides) {
        for (const field of override.overriddenFields) fields.add(field);
      }
      put("overriddenFields", Array.from(fields).sort());
      put("overrideCount", node.overrides.length);
    }
    put("exposedInstanceCount", node.exposedInstances.length || undefined);
  }

  if ("componentPropertyReferences" in node && node.componentPropertyReferences) {
    put("componentPropertyReferences", node.componentPropertyReferences);
  }

  // --- Vectors --------------------------------------------------------------
  // Path data is large and rarely read by a human; a hash still flags a change.
  if ("vectorPaths" in node) {
    put("vectorPathsHash", hashValue(node.vectorPaths.map((path) => ({ data: path.data, windingRule: path.windingRule }))));
  }

  if ("layoutGrids" in node && node.layoutGrids.length > 0) put("layoutGrids", node.layoutGrids);

  return props;
}

function serializePaint(paint: Paint): unknown {
  const base: Record<string, unknown> = { type: paint.type };
  if (paint.visible === false) base.visible = false;
  if (paint.opacity !== undefined && paint.opacity !== 1) base.opacity = round(paint.opacity, 3);
  if (paint.blendMode && paint.blendMode !== "NORMAL") base.blendMode = paint.blendMode;

  if (paint.type === "SOLID") {
    base.color = serializeColor(paint.color);
  } else if (paint.type === "IMAGE") {
    base.imageHash = paint.imageHash;
    base.scaleMode = paint.scaleMode;
  } else if (paint.type === "VIDEO") {
    base.videoHash = paint.videoHash;
    base.scaleMode = paint.scaleMode;
  } else if (isGradient(paint)) {
    base.gradientStops = paint.gradientStops.map((stop) => ({
      position: round(stop.position, 4),
      color: serializeColor(stop.color),
    }));
    base.gradientTransform = paint.gradientTransform.map((row) => row.map((v) => round(v, 4)));
  } else {
    // Pattern and shader paints: no stable shorthand, so hash the descriptor.
    base.paintHash = hashValue(paint);
  }

  if ("boundVariables" in paint && paint.boundVariables) {
    base.boundVariables = Object.keys(paint.boundVariables).sort();
  }
  return base;
}

function isGradient(paint: Paint): paint is GradientPaint {
  return (
    paint.type === "GRADIENT_LINEAR" ||
    paint.type === "GRADIENT_RADIAL" ||
    paint.type === "GRADIENT_ANGULAR" ||
    paint.type === "GRADIENT_DIAMOND"
  );
}

function serializeColor(color: RGB | RGBA): string {
  const to255 = (v: number) => Math.round(v * 255);
  const hex = [to255(color.r), to255(color.g), to255(color.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const alpha = "a" in color ? round(color.a, 3) : 1;
  return alpha === 1 ? `#${hex}` : `#${hex}/${alpha}`;
}

function serializeEffect(effect: Effect): unknown {
  const base: Record<string, unknown> = { type: effect.type, visible: effect.visible !== false };
  if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
    base.color = serializeColor(effect.color);
    base.offset = [round(effect.offset.x), round(effect.offset.y)];
    base.radius = round(effect.radius);
    base.spread = round(effect.spread ?? 0);
    base.blendMode = effect.blendMode;
    if (effect.type === "DROP_SHADOW") base.showShadowBehindNode = effect.showShadowBehindNode;
  } else if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
    base.radius = round(effect.radius);
  } else {
    // Noise / texture and any future effect type: hash the whole descriptor so
    // a change is still detected without this file needing to know the shape.
    base.effectHash = hashValue(effect);
  }
  return base;
}

function serializeComponentProperties(properties: ComponentProperties): unknown {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(properties).sort()) {
    const property = properties[name];
    out[name] = { type: property.type, value: property.value };
  }
  return out;
}

/**
 * Numeric properties whose bound variable can be checked against what the node
 * actually renders. Only numbers: a colour resolves differently per mode by
 * design, so a difference there says nothing.
 */
const CHECKED_BINDINGS = [
  "itemSpacing",
  "counterAxisSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "topLeftRadius",
  "topRightRadius",
  "bottomRightRadius",
  "bottomLeftRadius",
  "width",
  "height",
] as const;

/**
 * Where a node claims a token and renders something else.
 *
 * A layer bound to `spacing/small` but sitting at 12px when the token says 8 is
 * one of three things — a detached override, a stale binding, or a token that
 * moved — and no reader can tell which from the token name alone. Recording
 * both numbers is what makes the question answerable at all; leaving it out is
 * what makes a design look consistent when it is not.
 */
async function bindingMismatches(
  node: SceneNode,
  boundVariables: Record<string, unknown>,
  ctx: SerializeContext,
): Promise<unknown[]> {
  const found: unknown[] = [];

  for (const field of CHECKED_BINDINGS) {
    const binding = boundVariables[field];
    if (!binding || Array.isArray(binding)) continue;

    const actual = (node as unknown as Record<string, unknown>)[field];
    if (typeof actual !== "number") continue;

    const expected = await variableValue(binding as VariableAlias, ctx);
    if (typeof expected !== "number") continue;
    if (round(expected) === round(actual)) continue;

    found.push({
      field,
      token: await variableName(binding as VariableAlias, ctx),
      expected: round(expected),
      actual: round(actual),
    });
  }

  return found;
}

/**
 * A variable's value in its collection's default mode. The default mode is the
 * only mode every collection is guaranteed to have, and comparing against a
 * mode the design is not currently in would invent mismatches.
 */
async function variableValue(alias: VariableAlias, ctx: SerializeContext): Promise<unknown> {
  if (!alias || typeof alias !== "object" || !("id" in alias)) return undefined;
  if (ctx.variableValues.has(alias.id)) return ctx.variableValues.get(alias.id);

  let value: unknown;
  try {
    const variable = await figma.variables.getVariableByIdAsync(alias.id);
    const collection = variable
      ? await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
      : null;
    if (variable && collection) value = variable.valuesByMode[collection.defaultModeId];
  } catch {
    // A variable from a library this file can no longer reach: the binding is
    // already recorded by name, which is the part worth having.
  }

  ctx.variableValues.set(alias.id, value);
  return value;
}

async function serializeBoundVariables(
  boundVariables: Record<string, unknown>,
  ctx: SerializeContext,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(boundVariables).sort()) {
    const binding = boundVariables[field];
    if (!binding) continue;
    if (Array.isArray(binding)) {
      const names = await Promise.all(binding.map((alias) => variableName(alias as VariableAlias, ctx)));
      out[field] = names;
    } else {
      out[field] = await variableName(binding as VariableAlias, ctx);
    }
  }
  return out;
}

/**
 * Replaces every `VARIABLE_ALIAS` anywhere inside `value` with the variable's
 * name, leaving everything else alone.
 *
 * Styles hand back raw Figma descriptors (`style.paints`, `style.effects`),
 * whose `boundVariables` carry a `VariableID:…` that nothing else in the
 * snapshot is keyed by — the `variables` section identifies variables by
 * publish key, so there is no join. Resolving to the name is what makes a
 * rebound token visible: two tokens can resolve to the same literal in one mode
 * and diverge in another, and only the name says which `var(--…)` is correct.
 */
export async function resolveVariableAliases(value: unknown, ctx: SerializeContext): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveVariableAliases(item, ctx)));
  }
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (record.type === "VARIABLE_ALIAS" && typeof record.id === "string") {
    return variableName(record as unknown as VariableAlias, ctx);
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    out[key] = await resolveVariableAliases(record[key], ctx);
  }
  return out;
}

async function variableName(alias: VariableAlias, ctx: SerializeContext): Promise<string> {
  if (!alias || typeof alias !== "object" || !("id" in alias)) return "unknown";
  const cached = ctx.variableNames.get(alias.id);
  if (cached) return cached;

  // Works for library variables too, so long as they are used in this file.
  const variable = await figma.variables.getVariableByIdAsync(alias.id);
  const name = variable ? variable.name : `unresolved:${alias.id}`;
  ctx.variableNames.set(alias.id, name);
  return name;
}

/** Unwrap a value that may be `figma.mixed` or absent, mapping the concrete case. */
function mixedOr<T>(value: T | PluginAPI["mixed"] | undefined, map: (value: T) => unknown): unknown {
  if (value === undefined) return undefined;
  return value === figma.mixed ? "mixed" : map(value as T);
}

function nonNull<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}
