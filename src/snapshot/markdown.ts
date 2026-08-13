import {
  DiffEntry,
  DiffReport,
  SerializedNode,
  Snapshot,
  UsageDiffReport,
  UsageSnapshot,
} from "../types.d";
import { formatValue } from "./diff";

/**
 * The Markdown report is the artefact an agent reads. It is deliberately flat
 * and heading-heavy: an agent grepping for a component name should land on
 * everything it needs without parsing JSON.
 */
export function snapshotToMarkdown(snapshot: Snapshot): string {
  const lines: string[] = [];
  const { meta } = snapshot;

  lines.push(`# Design system snapshot — ${meta.fileName}`, "");
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Schema: \`${snapshot.schema}\``);
  if (meta.fileKey) lines.push(`- File key: \`${meta.fileKey}\``);
  for (const [name, count] of Object.entries(meta.counts)) {
    lines.push(`- ${name}: ${count}`);
  }
  lines.push("");

  lines.push("## Components", "");
  lines.push("| Component | Type | Variants | Properties | Hash |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const component of snapshot.components) {
    const variantCount = Object.keys(component.variants ?? {}).length;
    const properties = Object.keys(component.properties);
    lines.push(
      `| ${escape(component.name)} | ${component.type} | ${variantCount || "—"} | ${
        properties.length ? escape(properties.join(", ")) : "—"
      } | \`${component.hash}\` |`,
    );
  }
  lines.push("");

  for (const component of snapshot.components) {
    lines.push(`### ${escape(component.name)}`, "");
    lines.push(`- Key: \`${component.key || "(unpublished)"}\``);
    lines.push(`- Node: ${nodeReference(component.nodeId, meta.fileKey, meta.fileName)}`);
    lines.push(`- Location: ${escape(component.path) || "—"}`);
    lines.push(`- Hash: \`${component.hash}\``);
    if (component.description) lines.push(`- Description: ${escape(component.description)}`);
    for (const link of component.documentationLinks) lines.push(`- Docs: ${link}`);

    const propertyNames = Object.keys(component.properties);
    if (propertyNames.length > 0) {
      lines.push("", "Properties:", "");
      for (const name of propertyNames) {
        const property = component.properties[name];
        const options = property.variantOptions ? ` — options: ${property.variantOptions.join(" | ")}` : "";
        const preferred = property.preferredValues ? ` — preferred: ${property.preferredValues.join(", ")}` : "";
        lines.push(
          `- \`${escape(name)}\` (${property.type}), default: ${formatValue(property.defaultValue)}${options}${preferred}`,
        );
      }
    }

    const variants = component.variants ?? {};
    const variantNames = Object.keys(variants);
    if (variantNames.length > 0) {
      lines.push("", "Variants:", "");
      for (const name of variantNames) {
        lines.push(
          `- \`${escape(name)}\` — node \`${variants[name].nodeId}\`, hash \`${variants[name].hash}\``,
        );
      }
    }
    lines.push("");
  }

  if (snapshot.variableCollections.length > 0) {
    lines.push("## Variables", "");
    for (const collection of snapshot.variableCollections) {
      lines.push(`### ${escape(collection.name)} (modes: ${collection.modes.join(", ")})`, "");
      const members = snapshot.variables.filter((variable) => variable.collection === collection.name);
      lines.push(`| Variable | Type | ${collection.modes.map(escape).join(" | ")} |`);
      lines.push(`| --- | --- | ${collection.modes.map(() => "---").join(" | ")} |`);
      for (const variable of members) {
        const values = collection.modes.map((mode) => formatValue(variable.valuesByMode[mode]));
        lines.push(`| ${escape(variable.name)} | ${variable.resolvedType} | ${values.map(escape).join(" | ")} |`);
      }
      lines.push("");
    }
  }

  if (snapshot.styles.length > 0) {
    lines.push("## Styles", "");
    lines.push("| Style | Type | Hash |");
    lines.push("| --- | --- | --- |");
    for (const style of snapshot.styles) {
      lines.push(`| ${escape(style.name)} | ${style.type} | \`${style.hash}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * The usage report an agent reads before it touches a screen: what each frame
 * is made of, which library component sits behind every instance and in which
 * variant, and where the design deliberately or accidentally leaves the system.
 */
export function usageToMarkdown(usage: UsageSnapshot): string {
  const lines: string[] = [];
  const { meta } = usage;

  lines.push(`# Library usage — ${meta.fileName}`, "");
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Schema: \`${usage.schema}\``);
  if (meta.fileKey) lines.push(`- File key: \`${meta.fileKey}\``);
  lines.push(`- Scope: ${meta.scope.mode} — ${meta.scope.frames.length} frame(s)`);
  if (meta.scope.pages.length > 0) lines.push(`- Pages: ${meta.scope.pages.map(escape).join(", ")}`);
  for (const [name, count] of Object.entries(meta.counts)) lines.push(`- ${name}: ${count}`);
  lines.push("");

  lines.push("## Components used", "");
  if (usage.components.length === 0) {
    lines.push("None — nothing in these frames instantiates a component.", "");
  } else {
    lines.push("| Component | Source | Instances | Used as |");
    lines.push("| --- | --- | --- | --- |");
    for (const component of usage.components) {
      lines.push(
        `| ${escape(component.name)} | ${component.remote ? "library" : "this file"} | ${
          component.instanceCount
        } | ${component.usedAs.length ? escape(component.usedAs.join(" · ")) : "—"} |`,
      );
    }
    lines.push("");
    for (const component of usage.components) {
      lines.push(`### ${escape(component.name)}`, "");
      lines.push(`- Key: \`${component.key}\``);
      if (component.setKey) lines.push(`- Set key: \`${component.setKey}\``);
      lines.push(`- Source: ${component.remote ? "library" : "local to this file"}`);
      lines.push(`- Frames: ${component.frames.map(escape).join(", ") || "—"}`);
      for (const combo of component.usedAs) lines.push(`- Used as: \`${escape(combo)}\``);
      const properties = Object.keys(component.properties ?? {});
      for (const name of properties) {
        const property = component.properties![name];
        const options = property.variantOptions ? ` — options: ${property.variantOptions.join(" | ")}` : "";
        lines.push(`- \`${escape(name)}\` (${property.type}), default: ${formatValue(property.defaultValue)}${options}`);
      }
      lines.push("");
    }
  }

  lines.push("## Frames", "");
  for (const frame of usage.frames) {
    lines.push(`### ${escape(frame.key)}`, "");
    lines.push(`- Node: ${nodeReference(frame.nodeId, meta.fileKey, meta.fileName)}`);
    lines.push(`- Size: ${frame.size[0]} × ${frame.size[1]}`);
    lines.push(`- Hash: \`${frame.hash}\``);
    lines.push("", "```");
    outlineNode(frame.structure, lines, 0);
    lines.push("```", "");
  }

  if (usage.deviations.length > 0) {
    lines.push("## Off-system", "");
    lines.push("| Frame | Layer | Kind | Detail | Intentional |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const deviation of usage.deviations) {
      lines.push(
        `| ${escape(deviation.frame)} | ${escape([deviation.path, deviation.name].filter(Boolean).join(" / "))} | ${
          deviation.kind
        } | ${escape(deviation.detail ?? "—")} | ${deviation.intentional ? "yes" : "no"} |`,
      );
    }
    lines.push("");
  }

  if (usage.variables.length > 0) {
    lines.push("## Variables bound", "");
    for (const collection of usage.variableCollections) {
      const members = usage.variables.filter((variable) => variable.collection === collection.name);
      if (members.length === 0) continue;
      lines.push(`### ${escape(collection.name)} (modes: ${collection.modes.join(", ")})`, "");
      lines.push(`| Variable | Type | ${collection.modes.map(escape).join(" | ")} |`);
      lines.push(`| --- | --- | ${collection.modes.map(() => "---").join(" | ")} |`);
      for (const variable of members) {
        const values = collection.modes.map((mode) => formatValue(variable.valuesByMode[mode]));
        lines.push(`| ${escape(variable.name)} | ${variable.resolvedType} | ${values.map(escape).join(" | ")} |`);
      }
      lines.push("");
    }
  }

  if (usage.styles.length > 0) {
    lines.push("## Styles used", "");
    lines.push("| Style | Type | Key |");
    lines.push("| --- | --- | --- |");
    for (const style of usage.styles) {
      lines.push(`| ${escape(style.name)} | ${style.type} | \`${style.key}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * An indented outline of a frame's tree — the Markdown report is for an agent
 * that greps, and a nested tree of prose headings would bury the one line it
 * came for. Instances carry their component and variant on the same line,
 * because that pairing is the whole point of this export.
 */
function outlineNode(node: SerializedNode, lines: string[], indent: number): void {
  const pad = "  ".repeat(indent);
  const parts: string[] = [`${node.type} "${node.name}"`];

  const main = node.props.mainComponent as { key?: string; name?: string; missing?: boolean } | undefined;
  if (main?.missing) parts.push("← main component missing");
  else if (main) parts.push(`← ${main.name ?? ""} [${main.key ?? ""}]`);

  const properties = node.props.componentProperties as Record<string, { value: unknown }> | undefined;
  if (properties) {
    const rendered = Object.keys(properties)
      .map((name) => `${name}=${String(properties[name].value)}`)
      .join(", ");
    if (rendered) parts.push(`(${rendered})`);
  }

  const position = node.props.position as [number, number] | undefined;
  if (position) parts.push(`@${position[0]},${position[1]}`);

  const mismatches = node.props.bindingMismatch as
    | { field: string; token: string; tokenValue: number; rendered: number }[]
    | undefined;
  for (const mismatch of mismatches ?? []) {
    parts.push(`⚠ ${mismatch.field} renders ${mismatch.rendered}, ${mismatch.token} is ${mismatch.tokenValue}`);
  }

  const overrides = node.props.overrides as { layer: string; field: string; value: unknown }[] | undefined;
  for (const override of overrides ?? []) {
    parts.push(`${override.layer}.${override.field}=${formatValue(override.value)}`);
  }

  if (node.props.vectorShapes) parts.push(`${node.props.vectorShapes} vector shape(s)`);
  if (typeof node.props.characters === "string") parts.push(`text: ${JSON.stringify(node.props.characters)}`);
  if (node.nodeId) parts.push(`#${node.nodeId}`);
  if (node.hidden) parts.push("hidden");
  if (node.truncated) parts.push("…truncated");
  if (node.omittedChildren) parts.push(`+${node.omittedChildren} unchanged from library`);

  lines.push(`${pad}${parts.join(" ")}`);
  for (const child of node.children ?? []) outlineNode(child, lines, indent + 1);
}

export function usageDiffToMarkdown(report: UsageDiffReport): string {
  const lines: string[] = [];

  lines.push(`# Library usage diff — ${report.head.fileName}`, "");
  lines.push(`- Base: ${report.base.generatedAt}`);
  lines.push(`- Head: ${report.head.generatedAt}`);
  lines.push(
    `- Summary: ${report.summary.added} added, ${report.summary.removed} removed, ` +
      `${report.summary.renamed} renamed, ${report.summary.modified} modified` +
      (report.summary.outOfScope ? `, ${report.summary.outOfScope} not covered by this export` : ""),
  );
  lines.push("");

  // Above the numbers, because it is a statement about whether to trust them.
  for (const note of report.notes ?? []) lines.push(`> ${note}`, "");

  const total =
    report.frames.length +
    report.components.length +
    report.styles.length +
    report.variables.length +
    report.deviations.length;
  if (total === 0) {
    lines.push("No changes.", "");
    return lines.join("\n");
  }

  section(lines, "Frames", report.frames);
  section(lines, "Components used", report.components);
  section(lines, "Off-system", report.deviations);
  section(lines, "Styles", report.styles);
  section(lines, "Variables", report.variables);

  return lines.join("\n");
}

export function diffToMarkdown(report: DiffReport): string {
  const lines: string[] = [];

  lines.push(`# Design system diff — ${report.head.fileName}`, "");
  lines.push(`- Base: ${report.base.generatedAt}`);
  lines.push(`- Head: ${report.head.generatedAt}`);
  lines.push(
    `- Summary: ${report.summary.added} added, ${report.summary.removed} removed, ` +
      `${report.summary.renamed} renamed, ${report.summary.modified} modified`,
  );
  lines.push("");

  if (report.components.length + report.styles.length + report.variables.length === 0) {
    lines.push("No changes.", "");
    return lines.join("\n");
  }

  section(lines, "Components", report.components);
  section(lines, "Styles", report.styles);
  section(lines, "Variables", report.variables);

  return lines.join("\n");
}

function section(lines: string[], title: string, entries: DiffEntry[]): void {
  if (entries.length === 0) return;
  lines.push(`## ${title}`, "");

  for (const entry of entries) {
    const renamed = entry.previousName ? ` (was \`${escape(entry.previousName)}\`)` : "";
    lines.push(`### ${kindLabel(entry.kind)} ${escape(entry.name)}${renamed}`, "");
    lines.push(`- Key: \`${entry.key}\``);

    if (entry.changes.length > 0) {
      lines.push("", "| Field | Before | After |", "| --- | --- | --- |");
      for (const change of entry.changes) {
        lines.push(
          `| \`${escape(change.path)}\` | ${escape(formatValue(change.before))} | ${escape(formatValue(change.after))} |`,
        );
      }
    }
    lines.push("");
  }
}

function kindLabel(kind: DiffEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "➕ Added:";
    case "removed":
      return "➖ Removed:";
    case "renamed":
      return "✏️ Renamed:";
    case "out-of-scope":
      return "◌ Not covered by this export:";
    default:
      return "🔄 Modified:";
  }
}

/**
 * A node id alone is enough for the MCP tools; with a file key it also becomes
 * a link a human can open, which is the difference between "go find this in
 * Figma" and a click.
 */
function nodeReference(nodeId: string, fileKey: string | undefined, fileName: string): string {
  if (!nodeId) return "—";
  if (!fileKey) return `\`${nodeId}\``;
  const slug = encodeURIComponent(fileName.replace(/\s+/g, "-"));
  return `[\`${nodeId}\`](https://www.figma.com/design/${fileKey}/${slug}?node-id=${encodeURIComponent(nodeId)}&m=dev)`;
}

/** Pipes break Markdown tables and backticks break inline code spans. */
function escape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "'").replace(/\n/g, " ");
}
