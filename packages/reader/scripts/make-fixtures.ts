/**
 * Writes the fixtures the reader tests run against.
 *
 * Every fixture is encoded through the plugin's own `encodeSnapshot`/`encodeUsage`,
 * so the tests read exactly the bytes the plugin writes — not a hand-typed
 * approximation of them. The shapes are chosen to cover the TOON constructs a
 * hand-rolled parser gets wrong: count-form lists, quoted keys containing a
 * colon, inline lists with a comma inside a value, tabular sections, and
 * numbers that must arrive as numbers.
 *
 * Run with `npm run fixtures` from `packages/reader`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeSnapshot, encodeUsage, OutputFormats } from "@atropical/liblib-core/snapshot/encode";
import { hashValue } from "@atropical/liblib-core/utils/stable";
import {
  SNAPSHOT_SCHEMA,
  SerializedNode,
  Snapshot,
  USAGE_SCHEMA,
  UsageSnapshot,
} from "@atropical/liblib-core/types";

// Bundled before it runs, so the output path comes from the package root npm sets.
const out = resolve(process.cwd(), "test/fixtures");
mkdirSync(out, { recursive: true });

const write = (name: string, text: string) => writeFileSync(resolve(out, name), text);

const node = (
  type: string,
  name: string,
  nodeId: string,
  props: Record<string, unknown> = {},
  children?: SerializedNode[],
): SerializedNode => ({ type, name, nodeId, props, ...(children ? { children } : {}) });

/**
 * One screen, carrying every construct under test:
 * - a hidden group with a visible-looking child inside it
 * - a binding mismatch two levels down, so its path has to be carried
 * - text with a comma in it, which TOON quotes rather than splits
 * - numeric positions and sizes
 */
const summaryFrame = node(
  "FRAME",
  "Order Summary",
  "10:1",
  { layoutMode: "VERTICAL", itemSpacing: 16, cornerRadius: 8 },
  [
    node(
      "FRAME",
      "Totals",
      "10:2",
      {
        position: [24, 96],
        itemSpacing: 20,
        boundVariables: { itemSpacing: "spacing/md" },
        bindingMismatch: [
          { field: "itemSpacing", token: "spacing/md", tokenValue: 16, rendered: 20 },
        ],
      },
      [
        node("TEXT", "Line item", "10:3", {
          characters: "Subtotal, before tax",
          position: [0, 0],
        }),
        node("INSTANCE", "Price Chip", "10:4", {
          position: [0, 32],
          mainComponent: { key: "chipkey0000000000000000000000000000000001", name: "Chip / Price" },
          componentProperties: { Size: { value: "Small" }, "Icon#12:3": { value: "abc" } },
        }),
      ],
    ),
    node(
      "GROUP",
      "Legacy Banner",
      "10:5",
      { position: [24, 320] },
      [
        // Inside a hidden parent, so it must never appear in a default tree read.
        node("TEXT", "Old promo copy", "10:6", { characters: "Ends Friday, midnight" }),
      ],
    ),
    node("INSTANCE", "Confirm", "10:7", {
      position: [24, 420],
      mainComponent: { key: "btnkey00000000000000000000000000000000001", name: "Button / Primary" },
      componentProperties: { Size: { value: "Large" } },
    }),
  ],
);
(summaryFrame.children![1] as SerializedNode).hidden = true;

const emptyFrame = node("FRAME", "Receipt", "20:1", { layoutMode: "VERTICAL" }, [
  node("TEXT", "Thanks", "20:2", { characters: "Thank you" }),
]);

const usage: UsageSnapshot = {
  schema: USAGE_SCHEMA,
  meta: {
    generatedAt: "2026-08-01T10:00:00.000Z",
    pluginVersion: "2.1.1",
    fileName: "Acme Checkout",
    fileKey: "abc123",
    scope: {
      mode: "selection",
      pages: ["Checkout"],
      frames: ["Checkout / Order Summary", "Checkout / Receipt"],
    },
    counts: { frames: 2, components: 2, deviations: 2 },
  },
  frames: [
    {
      key: "Checkout / Order Summary",
      nodeId: "10:1",
      name: "Order Summary",
      page: "Checkout",
      type: "FRAME",
      size: [1440, 900],
      structure: summaryFrame,
      hash: hashValue("summary"),
    },
    {
      key: "Checkout / Receipt",
      nodeId: "20:1",
      name: "Receipt",
      page: "Checkout",
      type: "FRAME",
      size: [1440, 640],
      structure: emptyFrame,
      hash: hashValue("receipt"),
    },
  ],
  components: [
    {
      key: "btnkey00000000000000000000000000000000001",
      name: "Button / Primary",
      setKey: "btnset0000000000000000000000000000000001",
      setName: "Button",
      remote: true,
      properties: {
        // A quoted key with a colon inside it — the construct that breaks a
        // hand-written `key: value` regex.
        "Icon#12:3": { type: "INSTANCE_SWAP", defaultValue: "abc" },
        Size: { type: "VARIANT", defaultValue: "Medium", variantOptions: ["Large", "Medium"] },
      },
      // Inline list whose values each contain a comma.
      usedAs: ["Size=Large, State=Default", "Size=Medium, State=Hover"],
      instanceCount: 7,
      frames: ["Checkout / Order Summary"],
      hash: hashValue("button"),
    },
    {
      key: "chipkey0000000000000000000000000000000001",
      name: "Chip / Price",
      remote: true,
      usedAs: ["Size=Small, Intent=Main"],
      instanceCount: 3,
      frames: ["Checkout / Order Summary"],
      hash: hashValue("chip"),
    },
  ],
  styles: [
    {
      key: "style0001",
      name: "Colour / Brand / Primary",
      type: "PAINT",
      description: "",
      value: "#0d99ff",
      hash: hashValue("style1"),
    },
    {
      key: "style0002",
      name: "Text / Body",
      type: "TEXT",
      description: "",
      value: "Inter 14/20",
      hash: hashValue("style2"),
    },
  ],
  variableCollections: [
    { key: "col1", name: "Primitives", modes: ["Light", "Dark"], defaultMode: "Light" },
  ],
  variables: [
    {
      key: "var1",
      name: "spacing/md",
      collection: "Primitives",
      resolvedType: "FLOAT",
      scopes: ["GAP"],
      codeSyntax: {},
      description: "",
      valuesByMode: { Light: 16, Dark: 16 },
      hash: hashValue("var1"),
    },
  ],
  deviations: [
    {
      kind: "hardcoded-spacing",
      frame: "Checkout / Order Summary",
      nodeId: "10:2",
      path: "Order Summary",
      name: "Totals",
      type: "FRAME",
      detail: "itemSpacing 20 is not a token value.",
      intentional: false,
    },
    {
      kind: "local-component",
      frame: "Checkout / Receipt",
      nodeId: "20:2",
      path: "Receipt",
      name: "Thanks",
      type: "TEXT",
      detail: "Instance of `Local Note`, defined in this file rather than a library.",
      intentional: true,
    },
  ],
};

/** The same file scanned again, with one layer renamed and one instance added. */
const head: UsageSnapshot = JSON.parse(JSON.stringify(usage));
head.meta.generatedAt = "2026-08-02T10:00:00.000Z";
head.frames[0].structure.children![2].name = "Confirm Order";
head.frames[0].hash = hashValue("summary-2");
head.components[0].instanceCount = 9;
head.components[0].hash = hashValue("button-2");

/**
 * A `@2` export: node coordinates were called `offset`, and a binding mismatch's
 * two numbers were called `expected`/`actual`.
 */
const legacy: UsageSnapshot = JSON.parse(JSON.stringify(usage));
legacy.schema = "liblib/usage-snapshot@2";
const legacyTotals = legacy.frames[0].structure.children![0];
legacyTotals.props.offset = legacyTotals.props.position;
delete legacyTotals.props.position;
legacyTotals.props.bindingMismatch = [
  { field: "itemSpacing", token: "spacing/md", expected: 16, actual: 20 },
];

const library: Snapshot = {
  schema: SNAPSHOT_SCHEMA,
  meta: {
    generatedAt: "2026-08-01T09:00:00.000Z",
    pluginVersion: "2.1.1",
    fileName: "Acme Design System",
    counts: { components: 1, styles: 1, variables: 1 },
  },
  components: [
    {
      key: "btnkey00000000000000000000000000000000001",
      nodeId: "1:1",
      name: "Button / Primary",
      path: "Components / Buttons",
      type: "COMPONENT_SET",
      description: "Primary action.",
      documentationLinks: ["https://example.com/button"],
      properties: {
        "Icon#12:3": { type: "INSTANCE_SWAP", defaultValue: "abc" },
        Size: { type: "VARIANT", defaultValue: "Medium", variantOptions: ["Large", "Medium"] },
      },
      variants: {
        "Size=Large, State=Default": {
          key: "v1",
          nodeId: "1:2",
          hash: hashValue("v1"),
          structure: node("COMPONENT", "Size=Large", "1:2", { itemSpacing: 12 }),
        },
      },
      structure: node("COMPONENT_SET", "Button / Primary", "1:1", { itemSpacing: 16 }),
      hash: hashValue("lib-button"),
    },
  ],
  styles: [
    {
      key: "style0001",
      name: "Colour / Brand / Primary",
      type: "PAINT",
      description: "",
      value: "#0d99ff",
      hash: hashValue("style1"),
    },
  ],
  variableCollections: [
    { key: "col1", name: "Primitives", modes: ["Light", "Dark"], defaultMode: "Light" },
  ],
  variables: [
    {
      key: "var1",
      name: "spacing/md",
      collection: "Primitives",
      resolvedType: "FLOAT",
      scopes: ["GAP"],
      codeSyntax: {},
      description: "",
      valuesByMode: { Light: 16, Dark: 16 },
      hash: hashValue("var1"),
    },
  ],
};

write("usage.toon", encodeUsage(usage, OutputFormats.TOON));
write("usage.json", encodeUsage(usage, OutputFormats.JSON));
write("usage-report.md", encodeUsage(usage, OutputFormats.MARKDOWN));
write("usage-head.toon", encodeUsage(head, OutputFormats.TOON));
write("usage-legacy2.toon", encodeUsage(legacy, OutputFormats.TOON));
write("library.toon", encodeSnapshot(library, OutputFormats.TOON));
write("library.json", encodeSnapshot(library, OutputFormats.JSON));

// Files that must be refused. Each is written through the same encoder, so the
// only thing wrong with it is the thing under test.
write(
  "no-schema.toon",
  encodeUsage({ ...usage, schema: undefined } as unknown as UsageSnapshot, OutputFormats.TOON),
);
write(
  "unknown-schema.toon",
  encodeUsage({ ...usage, schema: "liblib/usage-snapshot@99" }, OutputFormats.TOON),
);
write("empty-usage.toon", encodeUsage({ ...usage, frames: [] }, OutputFormats.TOON));
write("empty-library.toon", encodeSnapshot({ ...library, components: [] }, OutputFormats.TOON));
write(
  "no-frames.toon",
  encodeUsage(
    { schema: USAGE_SCHEMA, meta: usage.meta } as unknown as UsageSnapshot,
    OutputFormats.TOON,
  ),
);
// A count that does not match the rows under it: valid-looking, and rejected by
// the real decoder rather than silently read as one row.
write("broken.toon", "schema: liblib/usage-snapshot@3\nframes[3]{key,name}:\n  a,b\n");

console.log(`fixtures written to ${out}`);
