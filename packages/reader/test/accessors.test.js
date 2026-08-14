import assert from "node:assert/strict";
import test from "node:test";
import {
  components,
  counts,
  deviations,
  find,
  frames,
  mismatches,
  readLibrary,
  readUsage,
  resolveFrame,
  tree,
} from "../dist/index.js";
import { fixture, thrown } from "./helpers.js";

const usage = readUsage(fixture("usage.toon")).data;

test("frames() summarises every exported frame, sorted by key", () => {
  const list = frames(usage);
  assert.deepEqual(
    list.map((frame) => frame.key),
    ["Checkout / Order Summary", "Checkout / Receipt"],
  );
  const [summary] = list;
  assert.equal(summary.name, "Order Summary");
  assert.equal(summary.page, "Checkout");
  assert.equal(summary.nodeId, "10:1");
  assert.deepEqual(summary.size, [1440, 900]);
  // Totals, Line item, Price Chip, Legacy Banner, Old promo copy, Confirm.
  assert.equal(summary.layers, 6);
});

test("components() puts the most-used component first", () => {
  const list = components(usage);
  assert.deepEqual(
    list.map((component) => component.name),
    ["Button / Primary", "Chip / Price"],
  );
  assert.equal(list[0].instanceCount, 7);
});

test("tree() returns a flat, pre-ordered list with full paths", () => {
  const nodes = tree(usage, "Checkout / Order Summary");
  assert.deepEqual(
    nodes.map((node) => node.path),
    [
      "Order Summary",
      "Order Summary / Totals",
      "Order Summary / Totals / Line item",
      "Order Summary / Totals / Price Chip",
      "Order Summary / Confirm",
    ],
  );
  assert.deepEqual(
    nodes.map((node) => node.depth),
    [0, 1, 2, 2, 1],
  );
  assert.equal(nodes[3].type, "INSTANCE");
  assert.equal(nodes[3].nodeId, "10:4");
  assert.equal(nodes[1].props.itemSpacing, 20);
});

test("tree() excludes a hidden layer and everything under it", () => {
  const visible = tree(usage, "Checkout / Order Summary");
  assert.ok(!visible.some((node) => node.name === "Legacy Banner"));
  // The child is not itself marked hidden — the subtree has to be skipped whole.
  assert.ok(!visible.some((node) => node.name === "Old promo copy"));
});

test("tree({ includeHidden }) brings the subtree back, marked", () => {
  const all = tree(usage, "Checkout / Order Summary", { includeHidden: true });
  const banner = all.find((node) => node.name === "Legacy Banner");
  assert.equal(banner.hidden, true);
  const child = all.find((node) => node.name === "Old promo copy");
  assert.equal(child.path, "Order Summary / Legacy Banner / Old promo copy");
  assert.equal(child.hidden, undefined);
});

test("tree({ maxDepth }) stops at the requested level", () => {
  const shallow = tree(usage, "Checkout / Order Summary", { maxDepth: 1 });
  assert.deepEqual(
    shallow.map((node) => node.path),
    ["Order Summary", "Order Summary / Totals", "Order Summary / Confirm"],
  );
});

test("a frame can be found by name or node id", () => {
  assert.equal(resolveFrame(usage, "Receipt").key, "Checkout / Receipt");
  assert.equal(resolveFrame(usage, "20:1").key, "Checkout / Receipt");
  assert.equal(tree(usage, "Receipt").length, 2);
});

test("an ambiguous frame reference lists the candidates", () => {
  const twoFrames = {
    ...usage,
    frames: usage.frames.map((frame, index) => ({
      ...frame,
      key: `Page ${index} / Receipt`,
      name: "Receipt",
    })),
  };
  const error = thrown(() => resolveFrame(twoFrames, "Receipt"));
  assert.match(error.message, /matches 2 frames/);
  assert.match(error.message, /Did you mean/);
  assert.match(error.message, /Page 0 \/ Receipt/);
  assert.match(error.message, /Page 1 \/ Receipt/);
});

test("an unknown frame reference lists what the file does have", () => {
  const error = thrown(() => tree(usage, "Nope"));
  assert.match(error.message, /No frame matches/);
  assert.match(error.message, /Checkout \/ Order Summary/);
});

test("mismatches() carries the frame key and layer path down from the walk", () => {
  const found = mismatches(usage);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], {
    frame: "Checkout / Order Summary",
    path: "Order Summary / Totals",
    nodeId: "10:2",
    field: "itemSpacing",
    token: "spacing/md",
    tokenValue: 16,
    rendered: 20,
  });
});

test("deviations() hides the intentional ones by default", () => {
  const flagged = deviations(usage);
  assert.deepEqual(
    flagged.map((record) => record.kind),
    ["hardcoded-spacing"],
  );
  const all = deviations(usage, { includeIntentional: true });
  assert.equal(all.length, 2);
  assert.equal(all.filter((record) => record.intentional).length, 1);
});

test("deviations() paths end with the layer's own name, like every other accessor", () => {
  const [spacing] = deviations(usage);
  assert.equal(spacing.path, "Order Summary / Totals");
  assert.equal(spacing.name, "Totals");

  // The same layer, reached three other ways, has to read as the same path.
  const [mismatch] = mismatches(usage);
  assert.equal(mismatch.path, spacing.path);
  const [named] = find(usage, "Totals", { in: ["name"] });
  assert.equal(named.path, spacing.path);
  assert.ok(tree(usage, spacing.frame).some((node) => node.path === spacing.path));

  // The snapshot itself is untouched: the plugin's record still has ancestors only.
  assert.equal(usage.deviations.find((record) => record.name === "Totals").path, "Order Summary");
});

test("find() searches text, names and components", () => {
  const text = find(usage, "before tax", { in: ["text"] });
  assert.equal(text.length, 1);
  assert.equal(text[0].in, "text");
  assert.equal(text[0].frame, "Checkout / Order Summary");
  assert.equal(text[0].path, "Order Summary / Totals / Line item");
  assert.equal(text[0].match, "Subtotal, before tax");

  const named = find(usage, "totals", { in: ["name"] });
  assert.equal(named.length, 1);
  assert.equal(named[0].name, "Totals");

  const used = find(usage, "Button / Primary", { in: ["component"] });
  assert.equal(used.length, 1);
  assert.equal(used[0].path, "Order Summary / Confirm");
  assert.equal(used[0].nodeId, "10:7");
});

test("find() accepts a RegExp and is not defeated by the g flag", () => {
  const hits = find(usage, /^Thank/g, { in: ["text"] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].frame, "Checkout / Receipt");
  // Twice, to prove lastIndex is not carried between calls.
  assert.equal(find(usage, /^Thank/g, { in: ["text"] }).length, 1);
});

test("find() searches hidden layers too", () => {
  const hits = find(usage, "Ends Friday", { in: ["text"] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "Order Summary / Legacy Banner / Old promo copy");
});

test("accessors do not mutate the snapshot they are given", () => {
  const before = JSON.stringify(usage);
  frames(usage);
  components(usage);
  deviations(usage);
  tree(usage, "Checkout / Order Summary");
  mismatches(usage);
  find(usage, "a");
  assert.equal(JSON.stringify(usage), before);
});

/** The counts every accessor would produce the long way, for one snapshot. */
function theLongWay(snapshot) {
  return {
    frames: frames(snapshot).length,
    components: components(snapshot).length,
    styles: snapshot.styles?.length ?? 0,
    variables: snapshot.variables?.length ?? 0,
    variableCollections: snapshot.variableCollections?.length ?? 0,
    deviations: deviations(snapshot).length,
    intentionalDeviations:
      deviations(snapshot, { includeIntentional: true }).length - deviations(snapshot).length,
    mismatches: mismatches(snapshot).length,
    layers: frames(snapshot).reduce((total, frame) => total + frame.layers, 0),
  };
}

test("counts() agrees with the accessors it summarises", () => {
  assert.deepEqual(counts(usage), theLongWay(usage));
  // Not vacuously: the snapshot has something in every bucket.
  for (const [field, value] of Object.entries(counts(usage))) {
    assert.ok(value > 0, `${field} is 0, so this proves nothing`);
  }
});

test("counts() agrees on the legacy `@2` snapshot too", () => {
  const legacy = readUsage(fixture("usage-legacy2.toon")).data;
  assert.deepEqual(counts(legacy), theLongWay(legacy));
});

test("counts() refuses a library snapshot, like the reader does", () => {
  const library = readLibrary(fixture("library.toon")).data;
  const error = thrown(() => counts(library));
  assert.equal(error.name, "SchemaError");
  assert.match(error.message, /library snapshot/);
  assert.match(error.message, /usage snapshot/);
});

test("counts() does not mutate the snapshot it is given", () => {
  const before = JSON.stringify(usage);
  counts(usage);
  assert.equal(JSON.stringify(usage), before);
});
