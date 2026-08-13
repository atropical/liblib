// Bundles the reader (and the CLI, once it exists) into dist/.
//
// The reader deliberately imports the plugin's own `src/types.d`, `src/snapshot/diff.ts`
// and `src/utils/stable.ts` by relative path rather than copying them: one definition of
// the schema, one implementation of the diff. esbuild inlines them here.
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
