# LibLib

Design libraries in a form agents can actually read.

A Figma plugin that makes a design system **diffable** — the library, and the designs that use it.

LLM agents working against a Figma library have no way to answer "what changed since last time?".
Figma has no API for it either — see [Why this exists](#why-this-exists). LibLib solves it the
way developers already solve it: it exports a deterministic snapshot file you commit to your repo, so
`git diff` becomes the changelog your agent reads.

The same problem has a second half. In a file that *uses* the library, an agent can see that a layer
is an instance but not which variant it is, so it infers — and infers wrong. A usage snapshot writes
that down instead.

## What it does

Two pairs of commands, one per kind of file.

### In the library file

**Export Library Snapshot…** scans the current file and writes every component, component set,
variant, style and variable, with a content hash per record. Deterministic: same design in,
byte-identical file out.

**Diff Against Library Snapshot…** loads a previous snapshot, rescans the file, and writes a report of
what was added, removed, renamed or modified — down to the field path
(`structure.children[0].props.padding`, `properties.Size.variantOptions`, `valuesByMode.Dark`).

### In a file that *uses* the library

A consuming file has no local components to scan — the library's components are not nodes in it, only
instances pointing at them — so a library snapshot run there comes out empty. These two read the other
direction.

**Export Usage Snapshot…** writes the frames you select, each as a tree, with the component key **and
variant behind every instance** (`Layout=Overlay, Size=Small, Intent=Main`) — that pairing is in
`components[].usedAs`, and it is the thing most worth reading first. Also: each layer's position
relative to its parent, the variables and styles it binds, and a node id on every node so a nested
instance layer can be addressed directly. Frames, not screens: a print sheet and a spec board are the
same thing here.

Inside an instance, a branch is kept when it can say something nothing else can: an override, text, or
another library component. Everything else is counted and left out, so a screen reads at a fraction of
its raw size without a fact going missing.

**Diff Against Usage Snapshot…** compares two usage exports. Frames the newer export did not cover are
reported as *not covered*, never as deleted — so exporting a section one day and two frames the next
still produces an honest diff.

Both also flag where the design leaves the system: local components, missing main components, and
values typed in where a token exists. Layers named with a leading `*` or `[custom]` — or carrying the
plugin data `intentional=true` — come through marked deliberate rather than being reported as slips.

All four views show a live preview of the output and let you pick the format, with an estimated token
range on each so you can see what you are about to spend:

| Format | Use | Typical cost |
| --- | --- | --- |
| **TOON** | Default. [toonformat.dev](https://toonformat.dev) — same data model as JSON, indentation instead of braces, tabular arrays. Losslessly convertible back to JSON. | **≈39% fewer tokens than JSON** |
| **JSON** | Universal, pretty-printed so `git diff` stays line-oriented. | baseline |
| **Markdown** | Prose report for an agent that greps rather than parses. Lossy — a rendering, not a source. | ≈78% fewer, but not machine-readable back |

Measured on a representative 12-set library: JSON ≈21.0k tokens, TOON ≈12.8k, Markdown ≈4.7k.

Snapshots can be loaded back for diffing as `.json` or `.toon`; both round-trip losslessly.

Renames are detected via the publish key, so a renamed component reads as `renamed`, not as
"deleted + added" — the single most common way an agent misreads a library.

## Suggested workflow

```bash
# Committed once per library, e.g.
design-system/
  button.tsx
  .figma/library.snapshot.toon   # ← plugin output, committed
```

1. Designer publishes the library, runs **Export Library Snapshot…**, replaces the committed file.
2. The commit diff *is* the design system changelog.
3. The agent reads `git diff .figma/` (or the Markdown report) and knows exactly which components to
   re-implement.

For a one-off check without committing anything, use **Diff Against Library Snapshot…** instead.

A design file that consumes the library commits its own file alongside — `.figma/usage.snapshot.toon`,
from **Export Usage Snapshot…**. The two join on the component publish key: the usage file says *which*
component and *which* variant a frame uses, the library file says what that component is. Neither
repeats the other.

## What gets captured

Per component / component set:

| Field | Notes |
| --- | --- |
| `key` | Publish key — stable across renames and files |
| `nodeId` | Figma node id, on the set and on every variant. The route back into Figma: `https://www.figma.com/design/<fileKey>/<name>?node-id=<nodeId>&m=dev`, and what the MCP tools accept. Excluded from hashes and diffs — it is an address, not content |
| `name`, `path` | `path` is location-only and excluded from hashes and diffs |
| `description`, `documentationLinks` | |
| `properties` | Variant options, defaults, preferred instance-swap values |
| `variants` | Per-variant structure and hash, for component sets |
| `structure` | Node tree: auto layout, sizing, constraints, `width`/`height`, fills, strokes, effects, corner radii, style keys, bound variables, text segments, instance main-component keys and overrides |
| `hash` | Content hash of everything above |

Plus all local paint/text/effect/grid styles, variable collections, and variables (values per mode,
with aliases rendered as `{Collection/Variable}`). Variables bound *inside* a style — a shadow's
colour, offset, radius or spread — are resolved to the variable name, the same as on component
nodes. The raw `VariableID:…` is useless in a snapshot: the `variables` section is keyed by publish
key, so there is no join, and a literal colour cannot tell you which token the CSS should reference.

Deliberately excluded from a *library* snapshot, because they change without the design changing:
node ids inside the tree, position, and inferred variables. A usage snapshot keeps both — a screen is
read to be navigated back into, and the gap between two layers is a fact about the design.

### A usage snapshot

| Section | Notes |
| --- | --- |
| `frames` | One record per exported frame. Keyed by `Page / Section / Frame` — its document path, not the selection, so selecting a section and selecting the frames inside it produce the same keys. `nodeId` on every node in the tree; excluded from hashes, like everywhere else |
| `components` | One per library component used: publish key, set key and name, whether it is remote, the published property definitions, every variant combination it is used in (`usedAs`), instance count, and which frames it appears in |
| `styles`, `variables` | Only the ones these frames actually reference — a consuming file has no local ones to list. Variable alias chains are followed to the end, so a screen bound to `Surface/Card` also carries what `Surface/Card` resolves to |
| `deviations` | Local components, missing main components, and fills, strokes, radii and spacing set by hand where nothing is bound. Each carries `intentional`, set from the layer name marker or plugin data |
| `props.position` | `[x, y]` relative to the parent, on every node but the frame root. Most spacing in a design is a gap between siblings, and a gap is only recoverable from where they sit. Named `position` rather than `offset`, which an effect already uses for its shadow |
| `props.bindingMismatch` | Where a node claims a token and renders another number — a detached override, a stale binding, or a token that moved. Both `tokenValue` and `rendered` are recorded, because the name alone cannot say which |
| `props.overrides` | The value behind each override: what a label now reads, which component was swapped in. `overriddenFields` names the fields; this says what they were set to |
| `props.vectorShapes` | A count of outline shapes replaced by it. Counted rather than dropped, so "there is artwork here" survives |
| `meta.scope` | The mode and the exact frame list this export covered, which is what lets the diff tell "removed" from "not covered" |
| `meta.schema` | The version to gate on. `meta.pluginVersion` records which build wrote the file and is provenance, not a contract — the two can disagree when a build predates a release |

In a usage diff, children are matched by node id rather than by position: inserting one layer reports
that layer as added, instead of reporting every sibling after it as changed.

When the two exports were written to different schemas, fields this plugin renamed or added between
them are suppressed and the report says so at the top. Without that, a plugin release reads as a
change to every node in the file — measured on a real 5 MB route, 1,818 of 1,872 nodes differed
across `@2` → `@3`, all of it one renamed field, with the 24 real changes buried inside it.

## Cost estimate before you scan

Every view probes before you commit to a full scan: it counts nodes exactly, serializes a sample of
components (or frames) stratified by size, times it, and fits the result. The panel reports the root
count, predicted scan duration,
and predicted output size and token range per format — and it re-probes whenever you change an option,
so you can see what depth 8 costs versus depth 3 before waiting for either.

```
1,537 components · 11,204 nodes · scan ~2 min
Markdown: 376k–460k tokens · 1.2 MB
TOON: 1.0M–1.2M tokens · 4.4 MB
JSON: 1.6M–2.0M tokens · 8.0 MB
Fitted from 24 sampled components against an exact node count for the whole file.
```

Cost is modelled as `fixed + a × components + b × nodes`:

- The **fixed** term is measured, not fitted — it comes from encoding the file with no components at
  all. A library with 366 variables carries thousands of tokens unrelated to its component count.
- **Node counts are exact for every component**, not sampled. Counting only reads `children`, so it
  is cheap enough to do for the whole file, and it removes the largest source of error: components
  differ in size by an order of magnitude, so scaling by component count alone mispredicts wildly.
- The **two coefficients** are solved from two sample groups — one built from the file's smaller
  components, one from its larger ones. Both terms are needed because a Markdown report spends most
  of its budget per component (heading, row, properties list) while TOON and JSON spend it per node.
- Degenerate cases (both groups the same shape, or a negative coefficient, meaning noise is driving
  the fit) fall back to scaling by nodes alone.

Simulated against synthetic libraries of varying shape, the fitted estimate lands within **3%**,
worsening to ~7% (TOON) on a pathological mix — 7 large component sets among 1,537 icons. The earlier
component-count model was out by **266%** on the same file.

## Options

### Usage scan

- **Frames to export** — selected frames (default), this page, or the whole file. A selected section
  is looked through to the frames inside it, and a node whose ancestor is also selected is dropped, so
  clicking imprecisely and clicking exactly produce the same export.
- **Inside instances** — `Stop at instances` records only what configures each instance;
  `Overrides and text` (default) additionally keeps the branches carrying an override or text, which is
  where a screen's own content lives; `Everything` walks it all, at library-snapshot cost. The default
  exists because the library snapshot already holds every instance's insides — writing them again per
  screen costs tokens and adds nothing.
- **Record what overrides were set to** — on by default. Without it the export names the overridden
  field but not its new value, which is a trip into Figma per instance.
- **Include each layer's position** — on by default, relative to the parent.
- **Summarise artwork outlines** — on by default. Vector shapes become a count on the layer holding
  them; turn it off when the artwork is the subject of the export.
- **Flag anything off-system** — on by default.
- **Structure depth** (default 12) — deep enough that a screen's own nesting is not cut short.

### Library scan

- **Structure depth** (default 12, the same as a usage scan) — how deep into each component's tree to serialize. Truncated
  branches are marked `truncated: true` rather than silently reported as leaves. The estimate panel
  updates as you change it, so the depth/cost trade-off is visible up front.
- **Include styles / variables** — on by default.
- **Include pixel sizes** — on by default, emitted as `width` / `height` per node. Without it a
  dimension only appears where a variable happens to be bound to it, so an icon button rendering
  32px against a 24×24 symbol reads as no change at all: comparing bound variables catches colour
  and token mistakes and is blind to geometry.

## Why this exists

Researched against the Figma platform as of July 2026:

- **Plugin API, inside a file:** full fidelity. `figma.root.findAllWithCriteria` plus `key`,
  `description`, `componentPropertyDefinitions`, `getPublishStatusAsync()`, bound variables and
  layout give everything needed to fingerprint how a component is built.
- **Plugin API, across files:** `figma.teamLibrary` exposes *variable* collections only
  (`getAvailableLibraryVariableCollectionsAsync`, `getVariablesInLibraryCollectionAsync`). There is
  no published-component catalogue, no version history, and no "what changed since last publish"
  API. This is a long-standing gap.
- **REST API:** `/v1/files/{key}/components|component_sets|styles` return `key`, `updated_at` and
  `containing_frame`; `/v1/files/{key}/versions` returns version history. Metadata only — nothing
  about how a component is built.
- **No filesystem access:** the only way out of a plugin is a blob download from the iframe, and
  Figma caps a run at roughly ten save dialogs. Hence one file per export.

So there is no native diff to call. A committed snapshot file is the way to get one.

## Development

```bash
npm install
npm run dev              # typecheck + rebuild plugin and UI on change
npm run build            # production build into dist/
npm run test             # tsc --noEmit + token calibration + build
npm run fixtures         # regenerate scripts/fixtures from a synthetic library
npm run calibrate:tokens # check the token estimator against a real BPE tokenizer
```

### Token counts

Token figures in the UI are **estimates shown as a ±10% range**, never a single number — an estimate
presented as a point value reads as a measurement. The same explanation is available in the plugin
itself under "How are these token ranges calculated?".

How it works:

- A real tokenizer (`gpt-tokenizer`) carries ~2.6 MB of byte-pair rank tables. That is a poor trade
  to inline into a single-file plugin UI for a figure whose job is to compare two formats.
- `src/utils/tokens.ts` approximates BPE segmentation instead: runs of letters cost one token per
  ~5 characters, digit runs group in threes, punctuation runs merge in pairs, and whitespace is
  charged at a lower rate.
- Those rates were fitted against `o200k_base` on the fixtures in `scripts/fixtures`. Worst-case
  deviation is **9.7%** (JSON 3.7%, TOON 8.7%, Markdown 9.7%), which is where the ±10% range comes
  from.
- `npm run calibrate:tokens` re-measures and fails if the estimator drifts past 12%. It runs as part
  of `npm run test`, and `gpt-tokenizer` stays a devDependency — it never ships in the plugin.
- The **percentage saving is more reliable than the absolute numbers**: both sides carry the same
  estimator bias, so it largely cancels.
- Your model's tokenizer will differ again. Treat the range as a budget, not a bill.

In Figma: **Plugins → Development → Import plugin from manifest…** and pick `dist/manifest.json`.

`figma.manifest.ts` is the source of truth for the manifest; `dist/manifest.json` is generated on
build.

Layout:

```
src/
  code.ts                    plugin thread: run command, build a snapshot, post back
  ui.tsx                     UI thread: routes on the invoked menu command
  snapshot/
    buildSnapshot.ts         library scan: walks the document, collects components/styles/variables
    buildUsage.ts            usage scan: resolves the selection to frames, follows instances to the library
    serializeNode.ts         one node -> deterministic property bag
    diff.ts                  key-matched record diff with field paths
    markdown.ts              agent-facing report rendering
    encode.ts                TOON / JSON / Markdown encoders + snapshot parsing
  views/                     one per menu command: library scan, usage scan, and their diffs
  hooks/                     the request/response round-trip with the plugin thread
  components/                preview, format selector, options, layout
  utils/
    stable.ts                canonical JSON, hashing, rounding
    tokens.ts                token estimation
    highlightCode.tsx        preview syntax highlighting
```

## Status

v2.1.1. Figma Community plugin id `1665168884798434636`.

## Licence

GPL-3.0-only © Atropical AS
