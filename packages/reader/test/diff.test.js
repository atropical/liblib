import assert from "node:assert/strict";
import test from "node:test";
import { SchemaError, diff, readLibrary, readUsage } from "../dist/index.js";
import { fixture, thrown } from "./helpers.js";

const base = readUsage(fixture("usage.toon"));
const head = readUsage(fixture("usage-head.toon"));
const library = readLibrary(fixture("library.toon"));

test("diff() compares two usage snapshots", () => {
  const report = diff(base, head);
  assert.equal(report.base.generatedAt, "2026-08-01T10:00:00.000Z");
  assert.equal(report.head.generatedAt, "2026-08-02T10:00:00.000Z");
  const renamed = report.frames.find((entry) => entry.key === "Checkout / Order Summary");
  assert.ok(renamed, "the edited frame should appear in the report");
  assert.equal(renamed.kind, "modified");
  assert.ok(report.summary.framesChanged >= 1);
});

test("diff() accepts raw snapshots as well as read results", () => {
  assert.deepEqual(diff(base.data, head.data), diff(base, head));
});

test("diff() compares two library snapshots", () => {
  const report = diff(library, readLibrary(fixture("library.json")));
  assert.equal(report.components.length, 0);
  assert.equal(report.summary.componentsChanged, 0);
});

test("diff() refuses a library against a usage snapshot", () => {
  const error = thrown(() => diff(library, base));
  assert.ok(error instanceof SchemaError);
  assert.match(error.message, /Cannot diff a library snapshot against a usage snapshot/);
  assert.match(error.message, /everything was removed/);
});

test("diff() refuses it the other way round too", () => {
  const error = thrown(() => diff(base, library));
  assert.match(error.message, /Cannot diff a usage snapshot against a library snapshot/);
});

test("diff() refuses something that is not a snapshot at all", () => {
  const error = thrown(() => diff(base, { schema: "liblib/usage-snapshot@3" }));
  assert.match(error.message, /neither `frames` nor `components`/);
});

test("diff() ignores style `bindings`, which older snapshots lack", () => {
  const before = structuredClone(library.data);
  const after = structuredClone(library.data);
  const style = after.styles[0];
  assert.ok(style, "the library fixture should carry a style");
  style.bindings = { "boundVariables.fontSize": { name: "type/xl/size", collection: "Theme", key: null } };
  assert.equal(diff(before, after).styles.length, 0);

  // A real change still shows, without the new field riding along.
  style.description = "edited";
  style.hash = "changed";
  const [entry] = diff(before, after).styles;
  assert.equal(entry.kind, "modified");
  assert.ok(entry.changes.every((change) => !change.path.startsWith("bindings")));
});
