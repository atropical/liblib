#!/usr/bin/env node
/**
 * `liblib` — the command line over this package's accessors.
 *
 * Everything printed here lands in an agent's context window, and that single
 * constraint decides the whole design: each command answers one small question,
 * no command dumps the file, output is one line per row, and any list that was
 * cut short says so on its last line. A silent truncation is worse than no
 * answer, for the same reason a plausible empty result is.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { components, counts, deviations, find, frames, mismatches, tree } from "./accessors";
import type { TreeNode } from "./accessors";
import { diff } from "./diff";
import { SchemaError } from "./errors";
import { read, readUsage } from "./read";
import type { Snapshot, UsageSnapshot } from "@atropical/liblib-core/types";

/**
 * A frame nests about as deep as its designer's patience. The plugin exports to
 * 12 levels; across the fixtures every layer sits at depth 2 or less, and a real
 * screen puts its content — the text, the instances, the spacing an agent is
 * actually asking about — in the first three or four. Past that it is autolayout
 * wrappers and icon vectors, which multiply fastest and say least. 4 is where a
 * typical frame stays under about fifty lines; `--depth` lifts it.
 */
const DEFAULT_TREE_DEPTH = 4;

/** Long enough to recognise a string, short enough that a wall of text cannot form. */
const DEFAULT_COMPONENT_LIMIT = 50;
const DEFAULT_DIFF_LIMIT = 50;
const MAX_TEXT = 60;

/** A failure that is the caller's to fix, and so prints without a stack. */
class CliError extends Error {}

const HELP = `liblib — read a LibLib Figma snapshot without parsing it by hand

Usage
  liblib info <file>                          what this file is, and what is in it
  liblib frames <file>                        every exported frame
  liblib components <file> [--limit N]        library components used, most-used first
  liblib tree <file> <frame> [--depth N] [--hidden]
                                              one frame's layers, flat, with full paths
  liblib mismatches <file>                    values that do not render as their token says
  liblib deviations <file> [--intentional]    where the design steps outside the library
  liblib find <file> <query> [--in text,name,component]
                                              search layer text, layer names, components
  liblib diff <base> <head> [--limit N]       what changed between two exports
  liblib init-skill [--dir <path>] [--force]  install the agent skill into .claude/skills

Options
  --json          print the structured value instead of text, for piping
  --limit N       cap the rows shown; the last line always says what was cut
  -h, --help      this text
  -V, --version   package version

<frame> is a frame key (\`Page / Section / Frame\`), or a frame name or node id
when it is unambiguous. Files may be TOON or JSON; Markdown reports cannot be
read back.`;

interface Flags {
  json: boolean;
  hidden: boolean;
  intentional: boolean;
  force: boolean;
  depth?: number;
  limit?: number;
  in?: string;
  dir?: string;
}

const FLAG_SPEC: Record<string, "boolean" | "value"> = {
  "--json": "boolean",
  "--hidden": "boolean",
  "--intentional": "boolean",
  "--force": "boolean",
  "--depth": "value",
  "--limit": "value",
  "--in": "value",
  "--dir": "value",
};

main();

function main(): void {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (argv[0] === "-V" || argv[0] === "--version") {
    process.stdout.write(`${version()}\n`);
    return;
  }

  try {
    run(argv[0], argv.slice(1));
  } catch (error) {
    if (error instanceof SchemaError || error instanceof CliError) {
      process.stderr.write(`liblib: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function run(command: string, rest: string[]): void {
  const { args, flags } = parse(rest);
  const out = (value: unknown, lines: string[]) => emit(flags.json, value, lines);

  switch (command) {
    case "info": {
      const result = read(source(args, 0, "info"), { fileName: args[0] });
      const summary = describe(result, args[0]);
      return out(summary, infoLines(summary));
    }

    case "frames": {
      const usage = usageFrom(args, 0, "frames");
      const rows = frames(usage);
      const shown = capped(rows, flags.limit);
      return out(
        rows,
        table(
          shown.map((frame) => [
            frame.key,
            `${frame.size[0]}x${frame.size[1]}`,
            plural(frame.layers, "layer"),
            frame.nodeId,
          ]),
        ).concat(count(shown.length, rows.length, "frames", flags.limit !== undefined)),
      );
    }

    case "components": {
      const usage = usageFrom(args, 0, "components");
      const rows = components(usage);
      const limit = flags.limit ?? DEFAULT_COMPONENT_LIMIT;
      const shown = rows.slice(0, limit);
      return out(
        rows,
        table(
          shown.map((component) => [
            `${component.instanceCount}x`,
            component.name,
            component.remote ? "" : "local",
            plural(component.usedAs?.length ?? 0, "config"),
            plural(component.frames?.length ?? 0, "frame"),
          ]),
        ).concat(count(shown.length, rows.length, "components", true)),
      );
    }

    case "tree": {
      const usage = usageFrom(args, 0, "tree");
      const ref = args[1];
      if (ref === undefined) {
        throw new CliError(
          "tree needs a frame: `liblib tree <file> <frame>`. Run `liblib frames <file>` for the list.",
        );
      }
      const depth = flags.depth ?? DEFAULT_TREE_DEPTH;
      const all = tree(usage, ref, { includeHidden: flags.hidden });
      const nodes = all.filter((node) => node.depth <= depth);
      const shown = capped(nodes, flags.limit);
      const cut = shown.length < all.length;
      return out(
        nodes,
        table(shown.map(treeRow)).concat(
          cut
            ? `${shown.length} of ${all.length} layers (depth ${depth}; --depth to change)`
            : `${all.length} of ${all.length} layers`,
        ),
      );
    }

    case "mismatches": {
      const usage = usageFrom(args, 0, "mismatches");
      const rows = mismatches(usage);
      const shown = capped(rows, flags.limit);
      return out(
        rows,
        table(
          shown.map((entry) => [
            entry.path,
            entry.field,
            entry.token,
            `${brief(entry.tokenValue)} -> ${brief(entry.rendered)}`,
            entry.nodeId ?? "",
          ]),
        ).concat(count(shown.length, rows.length, "mismatches", flags.limit !== undefined)),
      );
    }

    case "deviations": {
      const usage = usageFrom(args, 0, "deviations");
      const rows = deviations(usage, { includeIntentional: flags.intentional });
      const total = deviations(usage, { includeIntentional: true }).length;
      const shown = capped(rows, flags.limit);
      const hidden = total - rows.length;
      const tail = flags.intentional
        ? count(shown.length, rows.length, "deviations", flags.limit !== undefined)
        : `${shown.length} of ${rows.length} unresolved deviations` +
          (hidden > 0 ? ` (${hidden} intentional hidden; --intentional to include)` : "");
      return out(
        rows,
        table(
          shown.map((record) => [
            record.kind,
            record.path,
            record.type,
            record.nodeId ?? "",
            record.detail ?? "",
          ]),
        ).concat(tail),
      );
    }

    case "find": {
      const usage = usageFrom(args, 0, "find");
      const query = args[1];
      if (query === undefined) throw new CliError("find needs something to look for: `liblib find <file> <query>`.");
      const rows = find(usage, query, { in: fields(flags.in) });
      const shown = capped(rows, flags.limit);
      return out(
        rows,
        table(
          shown.map((hit) => [hit.in, hit.path, hit.type, hit.nodeId ?? "", clip(hit.match)]),
        ).concat(count(shown.length, rows.length, "matches", flags.limit !== undefined)),
      );
    }

    case "diff": {
      if (args.length < 2) throw new CliError("diff needs two files: `liblib diff <base> <head>`.");
      const base = read(load(args[0]), { fileName: args[0] });
      const head = read(load(args[1]), { fileName: args[1] });
      // Printed by field name across both report shapes — a usage diff has
      // sections a library diff does not, and the missing ones just skip.
      const report = diff(base, head) as unknown as Record<string, unknown>;
      return out(report, diffLines(report, flags.limit ?? DEFAULT_DIFF_LIMIT));
    }

    case "init-skill":
      return initSkill(flags);

    default:
      throw new CliError(
        `Unknown command \`${command}\`. Run \`liblib --help\` for the list.`,
      );
  }
}

/* ── output ─────────────────────────────────────────────────────────── */

function emit(json: boolean, value: unknown, lines: string[]): void {
  const text = json ? JSON.stringify(value, null, 2) : lines.filter((line) => line !== "").join("\n");
  process.stdout.write(`${text}\n`);
}

/**
 * Columns padded to line up, and nothing else: no borders, no rules, no colour.
 * An agent reads this as text and a human scans it; a box drawing helps neither
 * and costs a character on every row.
 */
function table(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  // A column nothing filled in — no node ids in this file, no local components —
  // is dropped rather than padded, so its absence costs nothing to read.
  const columns = rows[0]
    .map((_, column) => column)
    .filter(
      (column) => column === 0 || rows.some((row) => (row[column] ?? "") !== ""),
    );
  const width = columns.map((column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows.map((row) =>
    columns
      .map((column, index) =>
        index === columns.length - 1 ? row[column] ?? "" : (row[column] ?? "").padEnd(width[index]),
      )
      .join("  ")
      .trimEnd(),
  );
}

function count(shown: number, total: number, noun: string, limitable: boolean): string {
  if (shown >= total) return `${total} of ${total} ${noun}`;
  return `showing ${shown} of ${total} ${noun}${limitable ? " (--limit to change)" : ""}`;
}

function capped<T>(rows: T[], limit?: number): T[] {
  return limit === undefined ? rows : rows.slice(0, limit);
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function clip(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
}

function brief(value: unknown): string {
  if (typeof value === "string") return clip(value);
  if (value === undefined) return "—";
  return clip(JSON.stringify(value) ?? String(value));
}

/* ── info ───────────────────────────────────────────────────────────── */

interface Info {
  file: string;
  kind: string;
  schema: string;
  legacy: boolean;
  sourceFile: string;
  generatedAt: string;
  pluginVersion: string;
  scope?: { mode: string; pages: number; frames: number };
  counts: Record<string, number>;
}

function describe(result: ReturnType<typeof read>, file: string): Info {
  const meta = result.data.meta;
  const info: Info = {
    file,
    kind: result.kind,
    schema: result.schema,
    legacy: result.legacy,
    sourceFile: meta?.fileName ?? "",
    generatedAt: meta?.generatedAt ?? "",
    pluginVersion: meta?.pluginVersion ?? "",
    counts: {},
  };

  if (result.kind === "usage") {
    const usage = result.data as UsageSnapshot;
    const scope = usage.meta?.scope;
    if (scope) {
      info.scope = {
        mode: scope.mode,
        pages: scope.pages?.length ?? 0,
        frames: scope.frames?.length ?? 0,
      };
    }
    // One walk of the frame trees, not one per number. The printed keys are
    // spelled out rather than spread, so `--json` keeps the shape it has had.
    const total = counts(usage);
    info.counts = {
      frames: total.frames,
      components: total.components,
      styles: total.styles,
      variables: total.variables,
      variableCollections: total.variableCollections,
      deviations: total.deviations,
      deviationsIntentional: total.intentionalDeviations,
      mismatches: total.mismatches,
    };
  } else {
    const library = result.data as Snapshot;
    info.counts = {
      components: library.components?.length ?? 0,
      styles: library.styles?.length ?? 0,
      variables: library.variables?.length ?? 0,
      variableCollections: library.variableCollections?.length ?? 0,
    };
  }

  return info;
}

function infoLines(info: Info): string[] {
  const rows: string[][] = [
    ["file", info.file],
    ["kind", info.kind === "usage" ? "usage snapshot (a design that uses a library)" : "library snapshot (a design system)"],
    ["schema", `${info.schema}${info.legacy ? " (legacy, still readable)" : ""}`],
    ["source", info.sourceFile],
    ["generated", `${info.generatedAt}${info.pluginVersion ? ` by LibLib ${info.pluginVersion}` : ""}`],
  ];
  if (info.scope) {
    rows.push([
      "scope",
      `${info.scope.mode} — ${plural(info.scope.pages, "page")}, ${plural(info.scope.frames, "frame")}`,
    ]);
  }

  const c = info.counts;
  if (info.kind === "usage") {
    rows.push(["frames", String(c.frames)]);
    rows.push(["components", String(c.components)]);
  } else {
    rows.push(["components", String(c.components)]);
  }
  rows.push(["styles", String(c.styles)]);
  rows.push([
    "variables",
    `${c.variables} in ${plural(c.variableCollections, "collection")}`,
  ]);
  if (info.kind === "usage") {
    rows.push([
      "deviations",
      `${c.deviations} unresolved${c.deviationsIntentional ? `, ${c.deviationsIntentional} intentional` : ""}`,
    ]);
    rows.push(["mismatches", String(c.mismatches)]);
  }

  return table(rows);
}

/* ── tree ───────────────────────────────────────────────────────────── */

function treeRow(node: TreeNode): string[] {
  const notes: string[] = [];
  if (node.hidden) notes.push("hidden");
  if (node.truncated) notes.push("truncated");
  if (node.omittedChildren) notes.push(`+${node.omittedChildren} omitted`);

  const main = node.props?.mainComponent as { name?: unknown; key?: unknown } | undefined;
  if (typeof main?.name === "string") notes.push(`-> ${main.name}`);
  else if (typeof main?.key === "string") notes.push(`-> ${main.key}`);

  const characters = node.props?.characters;
  if (typeof characters === "string") notes.push(`"${clip(characters)}"`);

  const mismatch = node.props?.bindingMismatch;
  if (Array.isArray(mismatch) && mismatch.length > 0) {
    const fields = mismatch
      .map((entry) => (entry as { field?: unknown })?.field)
      .filter((field): field is string => typeof field === "string");
    notes.push(`!mismatch ${fields.join(",") || mismatch.length}`);
  }

  return [
    `${"  ".repeat(node.depth)}${node.name}`,
    node.type,
    node.nodeId ?? "",
    notes.join("  "),
  ];
}

/* ── diff ───────────────────────────────────────────────────────────── */

function diffLines(report: Record<string, unknown>, limit: number): string[] {
  const side = (key: string) => {
    const value = report[key] as { fileName?: string; generatedAt?: string } | undefined;
    return `${value?.fileName ?? ""}  ${value?.generatedAt ?? ""}`.trim();
  };

  const lines = table([
    ["base", side("base")],
    ["head", side("head")],
  ]);

  for (const note of (report.notes as string[] | undefined) ?? []) lines.push(`note: ${note}`);

  // Only the counters that moved: a row of zeroes is a line an agent pays for
  // and learns nothing from.
  const summary = (report.summary as Record<string, number>) ?? {};
  const changed = Object.entries(summary).filter(([, value]) => typeof value === "number" && value !== 0);
  lines.push(changed.length ? changed.map(([key, value]) => `${key} ${value}`).join("  ") : "nothing changed");

  let total = 0;
  let shown = 0;
  for (const section of ["frames", "components", "styles", "variables", "deviations"]) {
    const entries = report[section] as
      | { kind: string; key: string; name: string; previousName?: string; changes?: unknown[] }[]
      | undefined;
    if (!Array.isArray(entries) || entries.length === 0) continue;
    total += entries.length;
    const room = Math.max(0, limit - shown);
    const slice = entries.slice(0, room);
    shown += slice.length;
    if (slice.length === 0) continue;
    lines.push(`${section}:`);
    lines.push(
      ...table(
        slice.map((entry) => [
          `  ${entry.kind}`,
          entry.key,
          // A frame's key already ends with its name; a component's is a publish key.
          entry.name && !entry.key.endsWith(entry.name) ? entry.name : "",
          entry.previousName ? `was ${entry.previousName}` : "",
          entry.changes?.length ? plural(entry.changes.length, "change") : "",
        ]),
      ),
    );
  }

  lines.push(
    total === 0
      ? "0 of 0 changed records"
      : count(shown, total, "changed records", true),
  );
  return lines;
}

/* ── init-skill ─────────────────────────────────────────────────────── */

function initSkill(flags: Flags): void {
  const packaged = resolve(dirname(fileURLToPath(import.meta.url)), "../SKILL.md");
  if (!existsSync(packaged)) {
    throw new CliError(`This install is missing its SKILL.md (looked in ${packaged}).`);
  }

  const root = flags.dir ? resolve(process.cwd(), flags.dir) : process.cwd();
  const target = resolve(root, ".claude/skills/liblib/SKILL.md");

  if (existsSync(target) && !flags.force) {
    throw new CliError(`${target} already exists. Pass --force to overwrite it.`);
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(packaged, target);
  process.stdout.write(
    flags.json ? `${JSON.stringify({ written: target }, null, 2)}\n` : `wrote ${target}\n`,
  );
}

/* ── input ──────────────────────────────────────────────────────────── */

function parse(argv: string[]): { args: string[]; flags: Flags } {
  const args: string[] = [];
  const flags: Flags = { json: false, hidden: false, intentional: false, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }

    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    const kind = FLAG_SPEC[name];
    if (kind === undefined) {
      throw new CliError(`Unknown option \`${name}\`. Run \`liblib --help\` for the list.`);
    }

    if (kind === "boolean") {
      if (name === "--json") flags.json = true;
      if (name === "--hidden") flags.hidden = true;
      if (name === "--intentional") flags.intentional = true;
      if (name === "--force") flags.force = true;
      continue;
    }

    const value = equals === -1 ? argv[(index += 1)] : token.slice(equals + 1);
    if (value === undefined) throw new CliError(`\`${name}\` needs a value.`);
    if (name === "--depth") flags.depth = whole(name, value);
    if (name === "--limit") flags.limit = whole(name, value);
    if (name === "--in") flags.in = value;
    if (name === "--dir") flags.dir = value;
  }

  return { args, flags };
}

function whole(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(`\`${name}\` takes a whole number, not \`${value}\`.`);
  }
  return parsed;
}

function fields(value?: string): ("text" | "name" | "component")[] | undefined {
  if (!value) return undefined;
  const allowed = ["text", "name", "component"];
  const wanted = value.split(",").map((field) => field.trim()).filter(Boolean);
  const unknown = wanted.filter((field) => !allowed.includes(field));
  if (unknown.length) {
    throw new CliError(
      `\`--in\` takes any of ${allowed.join(", ")} — not \`${unknown.join(", ")}\`.`,
    );
  }
  return wanted as ("text" | "name" | "component")[];
}

function source(args: string[], index: number, command: string): string {
  const path = args[index];
  if (path === undefined) throw new CliError(`${command} needs a file: \`liblib ${command} <file>\`.`);
  return load(path);
}

/**
 * Every command but `info` and `diff` reads a usage export. Handed a library
 * snapshot, `readUsage` says so in terms of the API — so the check is made here
 * instead, and the answer names the file to look for rather than a function.
 */
function usageFrom(args: string[], index: number, command: string): UsageSnapshot {
  const result = read(source(args, index, command), { fileName: args[index] });
  if (result.kind !== "usage") {
    throw new CliError(
      `\`${args[index]}\` is a library snapshot — the design system itself, which has no frames. ` +
        `\`${command}\` reads a usage snapshot, exported from a file that consumes the library. ` +
        `\`liblib info\` reads either.`,
    );
  }
  return result.data as UsageSnapshot;
}

function load(path: string): string {
  try {
    return readFileSync(resolve(process.cwd(), path), "utf8");
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === "ENOENT" ? "No such file" : (error as Error).message;
    throw new CliError(`Could not read \`${path}\`: ${reason}.`);
  }
}

function version(): string {
  try {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");
    return String(JSON.parse(readFileSync(path, "utf8")).version ?? "unknown");
  } catch {
    return "unknown";
  }
}
