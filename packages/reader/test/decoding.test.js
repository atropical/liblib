/**
 * Regressions for the five bugs a consuming agent shipped when it hand-rolled a
 * TOON reader. Every one of them produced a plausible empty result rather than
 * an error, which is why they all shipped. Each test below reads the real
 * fixture through the real decoder and asserts both the value and its type.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { components, frames, mismatches, readUsage, tree } from "../dist/index.js";
import { fixture } from "./helpers.js";

const usage = readUsage(fixture("usage.toon")).data;

test("bug 1: a `[N:]` count-form list is read, not skipped", () => {
  // `componentProperties[2:]{value}:` — the length marker with a trailing colon
  // that a `\[(\d+)\]` key regex misses entirely.
  assert.match(fixture("usage.toon"), /componentProperties\[2:\]\{value\}:/);

  const chip = tree(usage, "Checkout / Order Summary").find(
    (node) => node.name === "Price Chip",
  );
  assert.deepEqual(chip.props.componentProperties, {
    "Icon#12:3": { value: "abc" },
    Size: { value: "Small" },
  });
});

test("bug 2: a quoted key containing a colon keeps its whole name", () => {
  assert.match(fixture("usage.toon"), /"Icon#12:3"/);

  const button = components(usage)[0];
  assert.deepEqual(Object.keys(button.properties).sort(), ["Icon#12:3", "Size"]);
  assert.equal(button.properties["Icon#12:3"].type, "INSTANCE_SWAP");

  const chip = tree(usage, "Checkout / Order Summary").find(
    (node) => node.name === "Price Chip",
  );
  // Split on `:` and this key becomes `Icon#12` with a value of `3`.
  assert.equal(chip.props.componentProperties["Icon#12:3"].value, "abc");
});

test("bug 3: an inline list is not split on the commas inside its values", () => {
  assert.match(fixture("usage.toon"), /usedAs\[2\]: "Size=Large, State=Default"/);

  const button = components(usage)[0];
  assert.deepEqual(button.usedAs, [
    "Size=Large, State=Default",
    "Size=Medium, State=Hover",
  ]);
  assert.equal(button.usedAs.length, 2);

  // Same trap on a text value: one string, not two.
  const line = tree(usage, "Checkout / Order Summary").find(
    (node) => node.name === "Line item",
  );
  assert.equal(line.props.characters, "Subtotal, before tax");
});

test("bug 4: a tabular section decodes to rows, not to header/value pairs", () => {
  // `deviations[2]{detail,frame,…}:` — `Object.entries` over this yields the
  // header names, which reads as a section with no records in it.
  assert.match(fixture("usage.toon"), /deviations\[2\]\{[a-z,]+\}:/i);

  assert.equal(usage.deviations.length, 2);
  assert.deepEqual(
    usage.deviations.map((record) => record.kind).sort(),
    ["hardcoded-spacing", "local-component"],
  );
  assert.equal(usage.deviations[0].frame, "Checkout / Order Summary");
  assert.equal(typeof usage.deviations[0].intentional, "boolean");

  // A tabular section nested inside a node's children, which is the shape that
  // hides deepest.
  assert.match(fixture("usage.toon"), /children\[1\]\{name,type,nodeId,props\{characters\}\}:/);
  const thanks = tree(usage, "Checkout / Receipt")[1];
  assert.equal(thanks.name, "Thanks");
  assert.equal(thanks.type, "TEXT");
  assert.equal(thanks.props.characters, "Thank you");
});

test("bug 5: numeric fields arrive as numbers, not as strings", () => {
  const [summary] = frames(usage);
  assert.equal(typeof summary.size[0], "number");
  assert.equal(typeof summary.size[1], "number");
  assert.deepEqual(summary.size, [1440, 900]);
  assert.equal(typeof summary.layers, "number");

  assert.equal(typeof components(usage)[0].instanceCount, "number");

  const [mismatch] = mismatches(usage);
  assert.equal(typeof mismatch.tokenValue, "number");
  assert.equal(typeof mismatch.rendered, "number");
  assert.ok(mismatch.rendered > mismatch.tokenValue);

  const totals = tree(usage, "Checkout / Order Summary")[1];
  assert.deepEqual(totals.props.position, [24, 96]);
  assert.equal(typeof totals.props.position[0], "number");

  // A node id looks numeric and must stay a string — `10:2`, not 10.
  assert.equal(typeof totals.nodeId, "string");
  assert.equal(totals.nodeId, "10:2");
});
