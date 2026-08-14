// Finishes the declaration build.
//
// The reader's sources import the record types and schema ids from
// `@atropical/liblib-core`, which is a private workspace package: it is bundled into
// `dist/index.js` and never published. tsc copies import specifiers into the emitted
// declarations verbatim, so those files would point at a package a consumer cannot
// install. `npm run types` emits core's `types.ts` into `dist/types.d.ts` alongside them;
// this rewrites the specifier to point there, leaving the shipped declarations
// self-contained.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist");

const SPECIFIER = /"@atropical\/liblib-core\/types"/g;

let rewritten = 0;
for (const name of readdirSync(dist)) {
  if (!name.endsWith(".d.ts") || name === "types.d.ts") continue;
  const path = resolve(dist, name);
  const source = readFileSync(path, "utf8");
  if (!SPECIFIER.test(source)) continue;
  writeFileSync(path, source.replace(SPECIFIER, '"./types.js"'));
  rewritten++;
}

// Anything else reaching into core would leave an unresolvable specifier in the published
// package, so stop rather than ship one.
for (const name of readdirSync(dist)) {
  if (!name.endsWith(".d.ts")) continue;
  const source = readFileSync(resolve(dist, name), "utf8");
  const stray = source.match(/"@atropical\/liblib-core[^"]*"/);
  if (stray) {
    throw new Error(
      `dist/${name} imports ${stray[0]} — only "@atropical/liblib-core/types" is emitted into ` +
        `dist/types.d.ts. Emit that module too, or the published package will not typecheck.`,
    );
  }
}

console.log(`declarations finished (${rewritten} rewritten)`);
