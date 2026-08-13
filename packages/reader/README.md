# @atropical/liblib

A typed reader, and a CLI, for the snapshot files the [LibLib](../../README.md) Figma plugin
writes — the design-system snapshot exported from a library file, and the usage snapshot exported
from a design that consumes one. TOON or JSON, either kind, one API.

```sh
npm install @atropical/liblib      # or: npx @atropical/liblib info checkout.toon
```

## The guard

The files look like a twenty-line parsing job. They are not: the first agent to try shipped five
decoding bugs — a `[N:]` count-form list, a quoted key containing a colon, an inline list split on
the commas inside a value, `Object.entries` over the header row of a tabular section, and numbers
that had arrived as strings. Nothing crashed. Every one of them returned an empty list, and empty
is a believable answer to "which components does this file use?".

So: decoding is delegated whole to `@toon-format/toon` and `JSON.parse` — no line splitting, no key
regex, no comma splitting anywhere in here — and nothing ever returns a plausible empty result. A
file that will not decode, declares no schema, declares one this package does not know, is the
wrong kind, or decodes to a shell with no records, throws `SchemaError` saying which of those it
was. Legacy schemas are normalised on read, so accessors never branch on version.

## Library

```ts
import { readUsage, frames, tree, mismatches, deviations } from "@atropical/liblib";

const { data, schema, legacy } = readUsage(await readFile("checkout.toon", "utf8"));

frames(data);                        // every exported screen, with size and layer count
tree(data, "Order Summary");         // that screen's layers, flat, each with its full path
mismatches(data);                    // every value that does not render as its token says
deviations(data);                    // where the design steps outside the library
```

Also `read`, `readLibrary`, `components`, `find`, `resolveFrame` and `diff`. Every accessor takes
the `data`, is pure, returns records in a fixed order, and uses one path convention:
`Frame / Group / Layer`, ending with the layer's own name.

## CLI

`liblib info <file>` first, then one command per question — `frames`, `components`, `tree`,
`mismatches`, `deviations`, `find`, `diff`. Output is one line per row and every list says what it
showed against what exists; `--json` gives the accessor's value verbatim. `liblib --help` has the
rest.

`liblib init-skill` installs `SKILL.md` into `.claude/skills/liblib/`, which is what tells an agent
this exists and when to use it.

## Development

```
npm run fixtures   # regenerate test/fixtures through the plugin's own encoders
npm run build      # bundle to dist/
npm run types      # emit declarations
npm test           # node --test (builds first)
```

The reader imports the plugin's `src/types.d.ts`, `src/snapshot/diff.ts` and `src/utils/stable.ts`
by relative path rather than copying them, and the bundler inlines them — one definition of the
schema, one implementation of the diff.
