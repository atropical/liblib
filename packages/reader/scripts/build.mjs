// Bundles the reader (and the CLI, once it exists) into dist/.
//
// The reader deliberately takes its record types and its diff from `@atropical/liblib-core`
// — the same private workspace package the plugin builds against — rather than copying
// them: one definition of the schema, one implementation of the diff. Core is never
// published, so esbuild inlines it here.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");

const entryPoints = [resolve(pkg, "src/index.ts")];

// Written by a separate change; the bin entry in package.json is already reserved for it.
const cli = resolve(pkg, "src/cli.ts");
if (existsSync(cli)) entryPoints.push(cli);

await build({
  entryPoints,
  outdir: resolve(pkg, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  external: ["@toon-format/toon"],
  logLevel: "info",
});
