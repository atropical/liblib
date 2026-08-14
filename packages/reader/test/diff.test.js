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
