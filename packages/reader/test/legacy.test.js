import assert from "node:assert/strict";
import test from "node:test";
import { mismatches, readUsage, tree } from "../dist/index.js";
import { fixture } from "./helpers.js";

const legacy = readUsage(fixture("usage-legacy2.toon"));

test("the fixture really is an old-shaped file", () => {
  const text = fixture("usage-legacy2.toon");
  assert.match(text, /schema: liblib\/usage-snapshot@2/);
  assert.match(text, /offset\[2\]: 24,96/);
  assert.match(text, /bindingMismatch\[1\]\{actual,expected,field,token\}/);
});

test("`@2` is accepted and flagged as legacy", () => {
  assert.equal(legacy.schema, "liblib/usage-snapshot@2");
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.kind, "usage");
});

test("`offset` is normalised to `position` on read", () => {
  const totals = tree(legacy.data, "Checkout / Order Summary")[1];
  assert.equal(totals.name, "Totals");
  assert.deepEqual(totals.props.position, [24, 96]);
  assert.equal(totals.props.offset, undefined);
});

test("`expected`/`actual` are normalised to `tokenValue`/`rendered` on read", () => {
  const [mismatch] = mismatches(legacy.data);
  assert.equal(mismatch.tokenValue, 16);
  assert.equal(mismatch.rendered, 20);
  assert.equal(mismatch.path, "Order Summary / Totals");
  assert.equal(mismatch.frame, "Checkout / Order Summary");
});

test("an accessor gives the same answer on `@2` as on `@3`", () => {
  const current = readUsage(fixture("usage.toon")).data;
  assert.deepEqual(mismatches(legacy.data), mismatches(current));
});
