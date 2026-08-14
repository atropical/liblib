# @atropical/liblib

Reads the snapshot files the [LibLib](../../README.md) Figma plugin writes — either kind, TOON or
JSON, one API.

```sh
npm install @atropical/liblib      # or: npx @atropical/liblib info checkout.toon
```

## The guard

Do not parse these files by hand. It looks like a small job and it is not — hand-written readers
have shipped bugs that returned empty lists instead of errors, and empty is a believable answer to
"which components does this file use?".

This package delegates decoding to `@toon-format/toon` and `JSON.parse`, and never returns a
plausible empty. A file that will not decode, has no schema, has one this package does not know, is
the wrong kind, or has no records, throws `SchemaError` saying which. Old schemas are normalised on
read, so accessors never branch on version.

## Library

```ts
import { readUsage, frames, tree, mismatches, deviations } from "@atropical/liblib";

const { data, schema, legacy } = readUsage(await readFile("checkout.toon", "utf8"));

frames(data);                        // every exported frame, with size and layer count
tree(data, "Order Summary");         // that frame's layers, flat, each with its full path
mismatches(data);                    // every value that does not render as its token says
deviations(data);                    // where the design steps outside the library
```

Also `read`, `readLibrary`, `components`, `counts`, `find`, `resolveFrame` and `diff`. `counts`
gives the size of every one of those answers in a single walk, for when the number is the whole
question. Every accessor takes
the `data`, is pure, and returns records in a fixed order. Paths read `Frame / Group / Layer`
everywhere.

## CLI

Run `liblib info <file>` first, then one command per question — `frames`, `components`, `tree`,
`mismatches`, `deviations`, `find`, `diff`. One line per row, `--json` for the raw value, and every
list says what it showed against what exists. `liblib --help` has the rest.

`liblib init-skill` installs `SKILL.md` into `.claude/skills/liblib/`, which tells an agent this
exists and when to use it.

## Development

```sh
npm run fixtures   # regenerate test/fixtures through the plugin's own encoders
npm run build      # bundle to dist/
npm run types      # emit declarations
npm test           # node --test
```

The reader imports the plugin's `types.d.ts`, `diff.ts` and `stable.ts` by relative path and the
bundler inlines them, so there is one definition of the schema and one implementation of the diff.
