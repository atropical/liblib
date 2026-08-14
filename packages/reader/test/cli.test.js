/**
 * The CLI is tested the way it is used: as a process, against the committed
 * fixtures, reading stdout, stderr and the exit code. Anything printed here
 * lands in an agent's context window, so the assertions are as much about what
 * is *not* printed — no stack traces, nothing on stdout beside the JSON, no
 * silent truncation — as about the rows themselves.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../dist/cli.js");
const fixture = (name) => resolve(here, "fixtures", name);

const usage = fixture("usage.toon");
const head = fixture("usage-head.toon");
const library = fixture("library.toon");

/** Runs the CLI and returns everything a caller can observe. */
function run(...args) {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

/** The last line of every list command states what was shown against what exists. */
function lastLine(stdout) {
  const lines = stdout.trimEnd().split("\n");
  return lines[lines.length - 1];
}

test("no arguments prints the help, and so does --help", () => {
  const bare = run();
  assert.equal(bare.status, 0);
  assert.match(bare.stdout, /liblib info <file>/);
  assert.match(bare.stdout, /liblib diff <base> <head>/);
  assert.equal(run("--help").stdout, bare.stdout);
  assert.equal(run("-h").stdout, bare.stdout);
});

test("--version prints just the version", () => {
  const version = run("-V");
  assert.equal(version.status, 0);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+/);
  assert.equal(run("--version").stdout, version.stdout);
});

test("info orients: kind, schema, source, scope and the counts, under 20 lines", () => {
  const info = run("info", usage);
  assert.equal(info.status, 0);
  const lines = info.stdout.trimEnd().split("\n");
  assert.ok(lines.length < 20, `info printed ${lines.length} lines`);
  assert.match(info.stdout, /kind\s+usage snapshot/);
  assert.match(info.stdout, /schema\s+liblib\/usage-snapshot@3/);
  assert.match(info.stdout, /source\s+Acme Checkout/);
  assert.match(info.stdout, /generated\s+2026-08-01T10:00:00\.000Z/);
  assert.match(info.stdout, /scope\s+selection — 1 page, 2 frames/);
  assert.match(info.stdout, /frames\s+2/);
  assert.match(info.stdout, /components\s+2/);
  assert.match(info.stdout, /styles\s+2/);
  assert.match(info.stdout, /variables\s+1 in 1 collection/);
  assert.match(info.stdout, /deviations\s+1 unresolved, 1 intentional/);
  assert.match(info.stdout, /mismatches\s+1/);
});

test("info reads a library snapshot too, and says which kind it is", () => {
  const info = run("info", library);
  assert.equal(info.status, 0);
  assert.match(info.stdout, /kind\s+library snapshot/);
  assert.match(info.stdout, /components\s+1/);
  // A library has no frames and no deviations; the lines are absent, not zero.
  assert.doesNotMatch(info.stdout, /^frames/m);
  assert.doesNotMatch(info.stdout, /^deviations/m);
});

test("info marks a legacy schema as legacy but still reads it", () => {
  const info = run("info", fixture("usage-legacy2.toon"));
  assert.equal(info.status, 0);
  assert.match(info.stdout, /legacy, still readable/);
});

test("frames lists every frame, one line each, and counts them", () => {
  const frames = run("frames", usage);
  assert.equal(frames.status, 0);
  const lines = frames.stdout.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Checkout \/ Order Summary\s+1440x900\s+6 layers\s+10:1$/);
  assert.equal(lastLine(frames.stdout), "2 of 2 frames");
});

test("components puts the most-used first and counts them", () => {
  const components = run("components", usage);
  assert.equal(components.status, 0);
  assert.match(components.stdout.split("\n")[0], /^7x\s+Button \/ Primary/);
  assert.equal(lastLine(components.stdout), "2 of 2 components");
});

test("a limit that bites is stated on the last line, never silently", () => {
  const components = run("components", usage, "--limit", "1");
  assert.equal(components.status, 0);
  assert.equal(components.stdout.trimEnd().split("\n").length, 2);
  assert.equal(lastLine(components.stdout), "showing 1 of 2 components (--limit to change)");
});

test("tree prints one indented line per layer, with instances and text", () => {
  const tree = run("tree", usage, "Order Summary");
  assert.equal(tree.status, 0);
  const lines = tree.stdout.trimEnd().split("\n");
  assert.match(lines[0], /^Order Summary\s+FRAME\s+10:1$/);
  assert.match(lines[1], /^ {2}Totals\s+FRAME\s+10:2\s+!mismatch itemSpacing$/);
  assert.match(lines[2], /^ {4}Line item\s+TEXT\s+10:3\s+"Subtotal, before tax"$/);
  assert.match(lines[3], /Price Chip\s+INSTANCE\s+10:4\s+-> Chip \/ Price$/);
  assert.equal(lastLine(tree.stdout), "5 of 5 layers");
  // Hidden layers are out unless asked for.
  assert.doesNotMatch(tree.stdout, /Legacy Banner/);
});

test("tree --hidden brings the hidden subtree back, marked", () => {
  const tree = run("tree", usage, "Order Summary", "--hidden");
  assert.equal(tree.status, 0);
  assert.match(tree.stdout, /Legacy Banner\s+GROUP\s+10:5\s+hidden/);
  assert.match(tree.stdout, /Old promo copy/);
  assert.equal(lastLine(tree.stdout), "7 of 7 layers");
});

test("tree --depth that cuts says so, with the depth it used", () => {
  const tree = run("tree", usage, "Order Summary", "--depth", "1");
  assert.equal(tree.status, 0);
  assert.doesNotMatch(tree.stdout, /Line item/);
  assert.equal(lastLine(tree.stdout), "3 of 5 layers (depth 1; --depth to change)");
});

test("tree resolves a frame by key, name or node id, and says so when it cannot", () => {
  assert.equal(run("tree", usage, "Checkout / Receipt").status, 0);
  assert.equal(run("tree", usage, "20:1").status, 0);

  const missing = run("tree", usage, "Nope");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /No frame matches/);
  assert.match(missing.stderr, /Checkout \/ Order Summary/);
  assert.doesNotMatch(missing.stderr, /at /);
});

test("tree without a frame explains what it needs", () => {
  const bare = run("tree", usage);
  assert.equal(bare.status, 1);
  assert.match(bare.stderr, /tree needs a frame/);
});

test("mismatches locates each one by path and node id", () => {
  const found = run("mismatches", usage);
  assert.equal(found.status, 0);
  assert.match(
    found.stdout.split("\n")[0],
    /^Order Summary \/ Totals\s+itemSpacing\s+spacing\/md\s+16 -> 20\s+10:2$/,
  );
  assert.equal(lastLine(found.stdout), "1 of 1 mismatches");
});

test("deviations hides the intentional ones and says how many it hid", () => {
  const flagged = run("deviations", usage);
  assert.equal(flagged.status, 0);
  assert.match(flagged.stdout, /^hardcoded-spacing\s+Order Summary \/ Totals\s+FRAME\s+10:2/m);
  assert.equal(
    lastLine(flagged.stdout),
    "1 of 1 unresolved deviations (1 intentional hidden; --intentional to include)",
  );

  const all = run("deviations", usage, "--intentional");
  assert.match(all.stdout, /local-component\s+Receipt \/ Thanks/);
  assert.equal(lastLine(all.stdout), "2 of 2 deviations");
});

test("a deviation's path matches the path the other commands print", () => {
  const deviation = run("deviations", usage, "--json");
  const [record] = JSON.parse(deviation.stdout);
  assert.equal(record.path, "Order Summary / Totals");
  assert.equal(record.name, "Totals");

  const [mismatch] = JSON.parse(run("mismatches", usage, "--json").stdout);
  assert.equal(mismatch.path, record.path);
});

test("find searches text, names and components, and reports which matched", () => {
  const hits = run("find", usage, "Subtotal");
  assert.equal(hits.status, 0);
  assert.match(hits.stdout, /^text\s+Order Summary \/ Totals \/ Line item\s+TEXT\s+10:3/m);
  assert.equal(lastLine(hits.stdout), "1 of 1 matches");

  const scoped = run("find", usage, "chip", "--in", "component");
  assert.equal(scoped.status, 0);
  assert.match(scoped.stdout, /^component\s+Order Summary \/ Totals \/ Price Chip/m);
  assert.equal(lastLine(scoped.stdout), "1 of 1 matches");
});

test("find rejects an unknown --in field instead of silently matching nothing", () => {
  const bad = run("find", usage, "x", "--in", "colour");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--in` takes any of text, name, component/);
});

test("diff reports both sides, the counters that moved, and the entries", () => {
  const report = run("diff", usage, head);
  assert.equal(report.status, 0);
  assert.match(report.stdout, /^base\s+Acme Checkout\s+2026-08-01T10:00:00\.000Z$/m);
  assert.match(report.stdout, /^head\s+Acme Checkout\s+2026-08-02T10:00:00\.000Z$/m);
  assert.match(report.stdout, /framesChanged 1/);
  assert.doesNotMatch(report.stdout, /stylesChanged 0/);
  assert.match(report.stdout, /^ {2}modified\s+Checkout \/ Order Summary/m);
  assert.equal(lastLine(report.stdout), "2 of 2 changed records");
});

test("diff refuses a library against a usage snapshot, cleanly", () => {
  const report = run("diff", library, usage);
  assert.equal(report.status, 1);
  assert.match(report.stderr, /Cannot diff a library snapshot against a usage snapshot/);
  assert.equal(report.stdout, "");
});

test("--json prints the accessor's value and nothing else", () => {
  for (const args of [
    ["info", usage],
    ["frames", usage],
    ["components", usage],
    ["tree", usage, "Order Summary"],
    ["mismatches", usage],
    ["deviations", usage],
    ["find", usage, "Subtotal"],
    ["diff", usage, head],
  ]) {
    const result = run(...args, "--json");
    assert.equal(result.status, 0, `${args[0]} --json exited ${result.status}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed !== null, `${args[0]} --json parsed to null`);
  }

  const frames = JSON.parse(run("frames", usage, "--json").stdout);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].key, "Checkout / Order Summary");
  assert.deepEqual(frames[0].size, [1440, 900]);
});

test("--json on tree honours the depth it would have printed", () => {
  const nodes = JSON.parse(run("tree", usage, "Order Summary", "--depth", "1", "--json").stdout);
  assert.deepEqual(
    nodes.map((node) => node.path),
    ["Order Summary", "Order Summary / Totals", "Order Summary / Confirm"],
  );
});

test("a SchemaError prints its message to stderr, with no stack and no stdout", () => {
  const markdown = run("info", fixture("usage-report.md"));
  assert.equal(markdown.status, 1);
  assert.equal(markdown.stdout, "");
  assert.match(markdown.stderr, /^liblib: That is a Markdown report\./);
  assert.doesNotMatch(markdown.stderr, /SchemaError/);
  assert.doesNotMatch(markdown.stderr, /\bat .*cli\.js/);
  assert.equal(markdown.stderr.trimEnd().split("\n").length, 1);

  const broken = run("frames", fixture("broken.toon"));
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /^liblib: /);
  assert.doesNotMatch(broken.stderr, /\bat .*cli\.js/);

  const empty = run("frames", fixture("empty-usage.toon"));
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /is empty/);
});

test("a usage command handed a library snapshot says which file to look for", () => {
  const wrong = run("frames", library);
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /is a library snapshot/);
  assert.match(wrong.stderr, /liblib info/);
});

test("a missing file and an unknown command both exit 1 without a stack", () => {
  const missing = run("info", resolve(here, "fixtures/nope.toon"));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Could not read .*nope\.toon.*No such file/);
  assert.doesNotMatch(missing.stderr, /\bat .*cli\.js/);

  const unknown = run("frobnicate", usage);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown command `frobnicate`/);
  assert.match(unknown.stderr, /--help/);

  const flag = run("frames", usage, "--wat");
  assert.equal(flag.status, 1);
  assert.match(flag.stderr, /Unknown option `--wat`/);
});

test("init-skill writes the packaged SKILL.md and refuses to overwrite it", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "liblib-skill-"));
  const target = resolve(dir, ".claude/skills/liblib/SKILL.md");

  const first = run("init-skill", "--dir", dir);
  assert.equal(first.status, 0);
  assert.equal(first.stdout.trim(), `wrote ${target}`);

  const written = readFileSync(target, "utf8");
  const packaged = readFileSync(resolve(here, "../SKILL.md"), "utf8");
  assert.equal(written, packaged);
  assert.match(written, /^---\nname: liblib\n/);

  const again = run("init-skill", "--dir", dir);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists\. Pass --force/);

  writeFileSync(target, "edited");
  const forced = run("init-skill", "--dir", dir, "--force");
  assert.equal(forced.status, 0);
  assert.equal(readFileSync(target, "utf8"), packaged);
});

test("init-skill creates the directories it needs under a fresh cwd", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "liblib-cwd-"));
  mkdirSync(resolve(dir, "src"));
  const stdout = execFileSync(process.execPath, [cli, "init-skill"], {
    cwd: dir,
    encoding: "utf8",
  });
  // The temp dir may be a symlink (/var -> /private/var on macOS), so the tail
  // of the path is what is asserted; the file itself proves the rest.
  assert.match(stdout.trim(), /^wrote \/.*\.claude\/skills\/liblib\/SKILL\.md$/);
  assert.equal(
    readFileSync(resolve(dir, ".claude/skills/liblib/SKILL.md"), "utf8"),
    readFileSync(resolve(here, "../SKILL.md"), "utf8"),
  );
});
