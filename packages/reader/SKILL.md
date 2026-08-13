---
name: liblib
description: Read a LibLib Figma snapshot (.toon or .json export of a design system, or of what a design file uses from it) with the `liblib` CLI. Use before opening such a file by hand, when you need the component, variant, token or spacing behind a layer, or when asked what changed between two exports.
---

# LibLib snapshots

The LibLib Figma plugin exports a design file as a deterministic, diffable snapshot. There are
two kinds:

- a **library snapshot** — the design system itself: components, variants, properties, styles,
  variables;
- a **usage snapshot** — what one design file uses from that library: every exported frame's layer
  tree, which component and variant each instance resolves to, which values are bound to tokens,
  and where the design steps outside the system.

Both are TOON (or JSON) and both name their schema on the first line. `liblib` reads them.

## When to reach for this

- **Before opening a `.toon` or `.json` snapshot by hand.** The format has count-form lists, quoted
  keys containing colons, inline lists with commas inside values, and tabular sections. Hand-rolled
  parsing of it does not crash — it returns empty lists, which look like real answers. Every read
  path here throws `SchemaError` instead of returning a plausible empty.
- **Before guessing which component or variant an instance uses.** `tree` says, per layer.
- **Before inferring spacing, a colour, or a token from a screenshot.** The snapshot has the
  bound variable and the rendered value, and `mismatches` lists every place the two disagree.
- **When asked what changed between two exports.** `diff` runs the plugin's own comparison.
- **Before reporting "the design doesn't follow the system".** `deviations` already found them,
  and already knows which ones the designer marked deliberate.

A Markdown report is a rendering, not a snapshot — it cannot be read back. Ask for the `.toon`.

## Commands

Run with `npx @atropical/liblib <command>` (installed: `liblib <command>`). Every command takes
`--json` for the raw structured value, and prints a last line saying what it showed against what
exists.

```sh
liblib info checkout.toon
# kind, schema, source file, scope, and the counts. Run this first.

liblib frames checkout.toon
# Checkout / Order Summary  1440x900  6 layers  10:1

liblib tree checkout.toon "Order Summary" --depth 4
# one line per layer, indented, with node id, text, and `-> Component / Variant`
# for each instance. Depth defaults to 4; the last line says if that cut anything.

liblib mismatches checkout.toon
# Order Summary / Totals  itemSpacing  spacing/md  16 -> 20  10:2

liblib deviations checkout.toon
# hardcoded-spacing  Order Summary / Totals  FRAME  10:2  itemSpacing 20 is not a token value.
# Intentional ones are hidden unless you pass --intentional.

liblib find checkout.toon "Subtotal" --in text
# where a string appears — layer text, layer names, or the component behind an instance

liblib components checkout.toon
liblib diff before.toon after.toon
```

Paths are `Frame / Group / Layer` and mean the same thing in every command, so a path from
`deviations` greps against `tree`. A frame is addressed by its key (`Page / Section / Frame`), or
by name or node id when that is unambiguous. Node ids (`10:2`) are what the Figma MCP tools take.

`liblib --help` has the full flag list. The same accessors are importable as a typed library —
see the package README.
