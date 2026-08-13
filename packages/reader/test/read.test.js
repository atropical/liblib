import assert from "node:assert/strict";
import test from "node:test";
import {
  SchemaError,
  USAGE_SCHEMA,
  SNAPSHOT_SCHEMA,
  read,
  readLibrary,
  readUsage,
} from "../dist/index.js";
import { fixture, thrown } from "./helpers.js";

test("reads a TOON usage snapshot and says what it read", () => {
  const result = readUsage(fixture("usage.toon"), { fileName: "usage.toon" });
  assert.equal(result.kind, "usage");
  assert.equal(result.schema, USAGE_SCHEMA);
  assert.equal(result.legacy, false);
  assert.equal(result.data.frames.length, 2);
  assert.equal(result.data.meta.fileName, "Acme Checkout");
});

test("reads the JSON encoding of the same snapshot to the same data", () => {
  const fromToon = readUsage(fixture("usage.toon")).data;
  const fromJson = readUsage(fixture("usage.json")).data;
  assert.deepEqual(fromJson, fromToon);
});

test("reads a library snapshot in both formats", () => {
  const toon = readLibrary(fixture("library.toon"));
  const json = readLibrary(fixture("library.json"));
  assert.equal(toon.kind, "library");
  assert.equal(toon.schema, SNAPSHOT_SCHEMA);
  assert.equal(toon.legacy, false);
  assert.deepEqual(json.data, toon.data);
  assert.equal(toon.data.components[0].name, "Button / Primary");
});

test("`read` detects the kind without being told", () => {
  assert.equal(read(fixture("usage.toon")).kind, "usage");
  assert.equal(read(fixture("library.json")).kind, "library");
});

test("format detection comes from the content, not the file name", () => {
  // A JSON snapshot handed over under a .toon name still reads.
  const mislabelled = read(fixture("usage.json"), { fileName: "export.toon" });
  assert.equal(mislabelled.kind, "usage");
});

test("a Markdown report is refused as a rendering", () => {
  const error = thrown(() => read(fixture("usage-report.md"), { fileName: "usage-report.md" }));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /Markdown/);
  assert.match(error.message, /rendering|cannot be read back/);
});

test("a .md file name alone is enough to refuse it", () => {
  const error = thrown(() => read("schema: liblib/usage-snapshot@3\n", { fileName: "report.md" }));
  assert.match(error.message, /Markdown/);
});

test("empty text is refused", () => {
  const error = thrown(() => read("   \n"));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /empty/i);
});

test("undecodable TOON is refused, naming the format", () => {
  const error = thrown(() => read(fixture("broken.toon"), { fileName: "broken.toon" }));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /Could not decode this file as TOON/);
});

test("undecodable JSON is refused, naming the format", () => {
  const error = thrown(() => read('{"schema": ', { fileName: "x.json" }));
  assert.match(error.message, /Could not decode this file as JSON/);
});

test("a file with no schema is refused, and lists what it expected", () => {
  const error = thrown(() => read(fixture("no-schema.toon")));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /declares no `schema`/);
  assert.ok(error.expected.includes(USAGE_SCHEMA));
});

test("an unrecognised schema is refused, and reports which one it saw", () => {
  const error = thrown(() => read(fixture("unknown-schema.toon")));
  assert.ok(error instanceof SchemaError);
  assert.equal(error.schema, "liblib/usage-snapshot@99");
  assert.match(error.message, /Unrecognised schema/);
});

test("a usage snapshot with no `frames` array is refused, not read as empty", () => {
  const error = thrown(() => readUsage(fixture("no-frames.toon")));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /no `frames` array/);
});

test("a usage snapshot with an empty `frames` list is refused", () => {
  const error = thrown(() => readUsage(fixture("empty-usage.toon")));
  assert.match(error.message, /`frames` list is empty/);
});

test("a library snapshot with an empty `components` list is refused", () => {
  const error = thrown(() => readLibrary(fixture("empty-library.toon")));
  assert.match(error.message, /`components` list is empty/);
});

test("readUsage on a library file says so explicitly", () => {
  const error = thrown(() => readUsage(fixture("library.toon")));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /That is a library snapshot/);
  assert.match(error.message, /readLibrary/);
  assert.equal(error.schema, SNAPSHOT_SCHEMA);
});

test("readLibrary on a usage file says so explicitly", () => {
  const error = thrown(() => readLibrary(fixture("usage.toon")));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /That is a usage snapshot/);
  assert.match(error.message, /readUsage/);
  assert.equal(error.schema, USAGE_SCHEMA);
});

test("a legacy usage schema is accepted and flagged", () => {
  const result = readUsage(fixture("usage-legacy2.toon"));
  assert.equal(result.legacy, true);
  assert.equal(result.schema, "liblib/usage-snapshot@2");
});
