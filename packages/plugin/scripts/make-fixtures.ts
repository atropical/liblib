// Generates calibration fixtures from a synthetic but realistically shaped snapshot.
import { writeFileSync } from "node:fs";
import { encodeSnapshot, OutputFormats } from "@atropical/liblib-core/snapshot/encode";
import { hashValue } from "@atropical/liblib-core/utils/stable";
import { SNAPSHOT_SCHEMA, Snapshot } from "@atropical/liblib-core/types";

const component = (i: number) => ({
  key: `c${i}abcdef0123456789abcdef0123456789abcdef`,
  nodeId: `${100 + i}:0`,
  name: `Button / Variant ${i}`,
  path: "Components / Buttons",
  type: "COMPONENT_SET" as const,
  description: "Primary action button used across the product surface.",
  documentationLinks: ["https://example.com/docs/button"],
  properties: {
    Size: { type: "VARIANT", defaultValue: "Medium", variantOptions: ["Large", "Medium", "Small"] },
    "Icon#12:3": { type: "INSTANCE_SWAP", defaultValue: "abc123", preferredValues: ["COMPONENT:xyz789"] },
    Label: { type: "TEXT", defaultValue: "Click me" },
  },
  variants: Object.fromEntries([0, 1, 2].map((v) => [
    `Size=${["Large", "Medium", "Small"][v]}, State=Default`,
    { key: `v${i}${v}`, nodeId: `${100 + i}:${v + 1}`, hash: hashValue({ i, v }), structure: {
      type: "COMPONENT", name: `Size=${["Large","Medium","Small"][v]}`,
      props: { layoutMode: "HORIZONTAL", padding: [8, 16, 8, 16], itemSpacing: 8,
        fills: [{ type: "SOLID", color: "#0d99ff" }], cornerRadius: 6,
        boundVariables: { fills: ["color/brand/primary"] }, layoutSizing: ["HUG", "HUG"] },
      children: [{ type: "TEXT", name: "Label", props: { characters: "Click me", textStyle: "abc", segments: [{ characters: "Click me", fontName: { family: "Inter", style: "Medium" }, fontSize: 14 }] } }],
    } },
  ])),
  structure: { type: "COMPONENT_SET", name: `Button / Variant ${i}`, props: { layoutMode: "VERTICAL", itemSpacing: 16 } },
  hash: hashValue({ i }),
});

const snapshot = {
  schema: SNAPSHOT_SCHEMA,
  meta: { generatedAt: "2026-07-31T12:00:00.000Z", pluginVersion: "0.1.0", fileName: "Acme Design System",
    counts: { components: 24, componentSets: 8, variants: 72, styles: 40, variableCollections: 3, variables: 120 } },
  components: Array.from({ length: 12 }, (_, i) => component(i)),
  styles: Array.from({ length: 20 }, (_, i) => ({ key: `s${i}`, name: `Colour / Brand / ${i}`, type: "PAINT" as const,
    description: "", value: { paints: [{ type: "SOLID", color: { r: 0.05, g: 0.6, b: 1 } }] }, hash: hashValue(i) })),
  variableCollections: [{ key: "col1", name: "Primitives", modes: ["Dark", "Light"], defaultMode: "Light" }],
  variables: Array.from({ length: 40 }, (_, i) => ({ key: `var${i}`, name: `color/brand/${i}`, collection: "Primitives",
    resolvedType: "COLOR", scopes: ["ALL_SCOPES"], codeSyntax: {}, description: "",
    valuesByMode: { Light: "#0d99ff", Dark: "#7cc4ff" }, hash: hashValue(i) })),
} as unknown as Snapshot;

writeFileSync("scripts/fixtures/sample.json", encodeSnapshot(snapshot, OutputFormats.JSON));
writeFileSync("scripts/fixtures/sample.toon", encodeSnapshot(snapshot, OutputFormats.TOON));
writeFileSync("scripts/fixtures/sample.md", encodeSnapshot(snapshot, OutputFormats.MARKDOWN));
console.log("fixtures written");
