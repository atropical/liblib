// Finishes the declaration build.
//
// The reader's sources live in `packages/reader/src`, but they import the plugin's
// `src/types.d.ts` and `src/snapshot/diff.ts` by relative path, so tsc's common root is
// the repository root and it emits into `dist/packages/reader/src/…` alongside
// `dist/src/…`. Two things are left to do:
//
//  1. tsc never emits a declaration *for* a declaration file, so `src/types.d.ts` — which
//     is where every record type lives — has to be copied into place by hand.
//  2. `exports` points at `dist/index.d.ts`, so a one-line re-export lands it there.
//     The relative specifiers inside the emitted files already resolve correctly,
//     because `dist` sits at the same depth as `src` inside the package.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const repo = resolve(pkg, "../..");

mkdirSync(resolve(pkg, "dist/src"), { recursive: true });
writeFileSync(resolve(pkg, "dist/src/types.d.ts"), ambient(resolve(repo, "src/types.d.ts")));

/**
 * The plugin's `types.d.ts` is a `.d.ts` by name but a compiled `.ts` in
 * practice: esbuild resolves it and emits real values for its consts and enums,
 * which is how the plugin gets `SNAPSHOT_SCHEMA` at runtime. That works because
 * the plugin builds with `skipLibCheck`. Published, it does not: a consumer who
 * checks library types sees `TS1254 — a const initializer in an ambient context
 * must be a string or numeric literal`.
 *
 * Only the shipped declaration is rewritten, and only for array-valued consts;
 * the values themselves are bundled from the same source and are untouched. If
 * a const shows up that this cannot express, the build stops rather than
 * shipping a declaration file a consumer cannot compile.
 */
function ambient(path) {
  const source = readFileSync(path, "utf8");
  const rewritten = source.replace(
    /export const (\w+) = \[[^\]]*\];/g,
    "export declare const $1: string[];",
  );

  const remaining = rewritten.match(/export const \w+ = (?!["'`\d])/);
  if (remaining) {
    throw new Error(
      `src/types.d.ts has a const this declaration rewrite cannot express: ${remaining[0].trim()}. ` +
        `Teach scripts/finish-types.mjs about it, or the published package will not typecheck.`,
    );
  }
  return rewritten;
}

writeFileSync(
  resolve(pkg, "dist/index.d.ts"),
  'export * from "./packages/reader/src/index.js";\n',
);
