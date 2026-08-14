# LibLib

Design libraries in a form agents can actually read.

A Figma plugin that exports your design system as a file you commit to your repo. Re-export after
each publish, and `git diff` becomes the changelog your agent reads.

It works in both directions:

- **In the library file** — every component, variant, style and variable.
- **In a file that uses the library** — each frame, with the component and variant behind every
  instance, what each override was set to, and which tokens are bound.

The second one matters because an agent looking at a design can see that a layer is an instance, but
not which variant. So it guesses, and guesses wrong.

## Commands

| Command | Run it in |
| --- | --- |
| **Export Library Snapshot…** | the library file |
| **Diff Against Library Snapshot…** | the library file |
| **Export Usage Snapshot…** | a file that uses the library |
| **Diff Against Usage Snapshot…** | a file that uses the library |

A library snapshot run in a consuming file comes out empty — the library's components are not in
that file, only instances pointing at them. That is what the usage commands are for.

Each export is deterministic: the same design gives you a byte-identical file. Each diff shows what
was added, removed, renamed or modified, down to the field.

## Formats

| Format | Use | Cost |
| --- | --- | --- |
| **TOON** (default) | Same data as JSON, far fewer tokens. Converts back to JSON losslessly. | ~39% less than JSON |
| **JSON** | Universal, pretty-printed so `git diff` stays line-oriented. | baseline |
| **Markdown** | A report to read. Cannot be loaded back as a diff base. | ~78% less |

Every view estimates the tokens and the scan time before you run it, and updates as you change the
options.

## Workflow

```
design-system/
  button.tsx
  .figma/library.snapshot.toon   ← commit this
```

1. Publish the library, run **Export Library Snapshot…**, replace the committed file.
2. The commit diff is your changelog.
3. The agent reads `git diff .figma/`.

A design file that uses the library commits its own `.figma/usage.snapshot.toon`. The two join on
the component key: the usage file says which component and variant a frame uses, the library file
says what that component is.

## Reading the files

```bash
npx @atropical/liblib info design.usage.toon
npx @atropical/liblib mismatches design.usage.toon
npx @atropical/liblib init-skill      # teaches your agent to use it
```

[`packages/reader`](packages/reader) is the reader package: `@atropical/liblib`. Use it rather than
parsing the file by hand — hand-written readers for this format have shipped bugs that returned
empty results instead of errors.

## What is in a snapshot

**Library snapshot** — per component: publish key, node id, name, description, properties and
variant options, the full node tree (layout, sizing, fills, strokes, effects, radii, styles, bound
variables, text), and a content hash. Plus every style, variable collection and variable, with
values per mode.

Left out on purpose: node ids inside the tree, and positions. They change without the design
changing.

**Usage snapshot** — per frame: the layer tree with a node id on every layer, the component and
exact variant behind each instance, what each override was set to, each layer's position, and the
tokens bound. Plus the styles and variables these frames actually use, and a list of deviations —
local components, missing mains, and values typed in where a token exists.

Inside an instance, a branch is kept only if it carries an override, text, or another library
component. The rest is counted and left out, so a screen reads small without losing a fact.

Both kinds carry `meta.readWith`, one line naming the reader for the format. Everything under `meta`
is informational — never hashed, never diffed.

### Details worth knowing

- **Renames stay renames.** Records match on publish key, so a renamed component reads as renamed,
  not as one deleted and another added.
- **Scope is honest.** A usage export records which frames it covered, so a narrower export reads as
  *not covered*, never as deleted.
- **Frames are matched by node id.** Insert a layer and you get one added layer, not every sibling
  after it reported as changed.
- **Intentional exceptions.** Name a layer with a leading `*` or `[custom]` and it comes through
  marked deliberate.
- **Bound tokens are checked** against what actually renders, and disagreements flagged.
- **A diff across a plugin update** suppresses fields that were renamed between the two versions,
  and says so at the top.

## Options

**Usage scan** — which frames (selection, current page, whole file); how much of each instance's
inside to write (stop at the instance, keep overrides and text, or everything); whether to record
override values, positions, artwork summaries and off-system flags; depth (12).

**Library scan** — depth (12), styles, variables, pixel sizes.

## Why this exists

Figma has no API for what changed. The plugin API can read a file in full detail but cannot compare
two versions or read another file's components; the REST API returns metadata only. A committed
snapshot is the way to get a diff.

## Development

```bash
npm install
npm run dev       # typecheck and rebuild the plugin on change
npm run build     # production build into packages/plugin/dist/
npm run test      # typecheck, token calibration, plugin build, reader test suite
```

The repo is an npm workspace; the root scripts above delegate to the packages.

In Figma: **Plugins → Development → Import plugin from manifest…**, pick
`packages/plugin/dist/manifest.json`. `packages/plugin/figma.manifest.ts` is the source of truth;
`dist/manifest.json` is generated.

Token figures are estimates, shown as a ±10% range. `npm run calibrate:tokens` checks them against a
real tokenizer and fails if they drift.

```
packages/
  core/               shared by the plugin and the reader, no Figma API in it
    types.ts          the record types and the schema ids
    snapshot/         the diff, the encoders, the Markdown report
    utils/stable.ts   deterministic ordering and hashing
  plugin/             the Figma plugin
    src/code.ts       plugin thread
    src/ui.tsx        UI thread, routes on the menu command
    src/snapshot/     the scans and the cost estimate
    src/views/        one per menu command
    src/hooks/        talking to the plugin thread
    src/components/   preview, format picker, options
    src/utils/        token estimation, highlighting, download
  reader/             @atropical/liblib — the reader package and CLI
```

## Status

v2.1.1. Figma Community plugin id `1665168884798434636`.

## Licence

GPL-3.0-only © Atropical AS
