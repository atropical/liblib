TAGLINE:
Design systems in a form agents can actually read — the library, and the designs using it.

RELEASE NOTES (2.1.0):
🏷️ **Two fields renamed to say what they are.** A layer's `offset` is now `position` — an effect already used `offset` for its shadow, and readers kept finding the wrong one. A bound-token mismatch now reads `tokenValue` and `rendered` instead of `expected` and `actual`, which are ambiguous once a table header scrolls out of view.
🔗 **Usage diffs match layers by node id, not by position.** Insert one layer and you now get one added layer, instead of every sibling after it reported as changed.
📌 **Gate on `meta.schema`, not `meta.pluginVersion`** — the schema is the contract, the version is only which build wrote the file.
♻️ Usage schema is `@3`; `@1` and `@2` still load as a diff base.

RELEASE NOTES (2.0.0):
🆕 **Two new commands — Export Usage Snapshot… and Diff Against Usage Snapshot….** For design files that *use* a library, where the old snapshot came out empty. Pick frames by selection, page, or whole file; a section and the frames inside it export identically, and a narrower export reads as *not covered* rather than deleted.
🧩 **Every instance names what it is.** The component behind it, the exact variant it uses, what its overrides were set to — the new label text, the swapped icon — and its node id, nested ones included.
📐 **Layout you can read without opening Figma.** Each layer carries its position relative to its parent, so gaps between siblings come from the file rather than from measuring. Bound tokens are checked against what actually renders, and disagreements flagged.
🚩 **Off-system layers reported.** Local components, missing main components, and values typed in where a token exists. Mark a layer with a leading `*` or `[custom]` and it comes through as deliberate rather than as a slip.
✂️ **Screens stay readable.** Instances stop at their boundary, keeping only what carries an override, text, or another component; artwork outlines collapse to a count. A screen reads at a fraction of its raw size with nothing going missing.
📦 **TOON is now the default format**, library scans match usage scans at depth 12, and the menu, spacing and scrolling all got tidied.
📄 **First export after updating will diff as changed.** The files genuinely carry more than before. Treat that first diff as a new baseline; the one after it is clean again.
♻️ **Old snapshots still load.** Both kinds work as a diff base exactly as before.

DESCRIPTION:
**LibLib** exports your design system as deterministic, diffable files, so an agent can answer the two questions Figma can't: what changed since last time, and what is this design actually made of?

Agents can already read your components — Figma's MCP server hands them context on demand. What no API gives them is history, or the variant behind an instance. So they guess, and that is where wrong button sizes and invented shadows come from.

## Features
**Library Snapshots:** Every component, variant, property, style and variable in one deterministic file, hashed per record. Same design in, byte-identical file out
**Usage Snapshots:** Run it in a file that *uses* your library: each frame written out with the component and exact variant behind every instance, what each override was set to, the tokens bound, and a node id on every layer
**Diff Either One:** Load a previous export, rescan, and see what was added, removed, renamed or modified — down to the field path, old value against new
**Renames Stay Renames:** Tracked by publish key, so a renamed component never reads as one deleted and another invented
**Honest Scope:** A usage export records the frames it covered, so a narrower export reads as *not covered*, never as deleted
**Off-System Flags:** Local components, missing mains, and values typed in where a token exists — each marked deliberate or not, so an agent can tell an exception from a mistake
**Screens Without the Bulk:** Instances stop at their boundary and artwork outlines collapse to a count, so a screen reads at a fraction of its raw size
**Three Formats, Costed:** TOON (~40% cheaper than JSON, losslessly convertible back), Markdown to read, JSON as a baseline — with an estimated token range and predicted scan time before you commit to a scan
**Resolved Tokens, Not Raw Ids:** Bound variables come through as `Collection/Variable`, including those bound inside a style's shadow
**Fully Offline:** No network requests at all. Nothing leaves Figma

† Markdown is a rendering, not a source: cheapest to read, but it cannot be loaded back as a diff base. Use TOON or JSON for anything you intend to diff against.

## Usage
**In your library file** — run **Export Library Snapshot…**, scan, download, and commit it next to your code (`design-system/.figma/library.snapshot.toon`).

**In a file that uses it** — select the frames you want, or a section holding them, run **Export Usage Snapshot…**, and commit that alongside.

The two join on the component publish key: the usage file says which component and variant a frame uses, the library file says what that component is. Neither repeats the other.

**To compare** — run either **Diff Against…** command and pick a `.json` or `.toon` the plugin wrote earlier. The current file is rescanned and the report shows old value against new.

Works in Dev Mode too, in the handoff panel.

Re-export over the committed file whenever the library is published: the commit diff *is* your design system changelog, and the agent reads it with `git diff`.

LibLib is open source, consider contributing. Code available on [GitHub](https://github.com/atropical/liblib).

For bug reports, suggestions, or questions, please open an [issue](https://github.com/atropical/liblib/issues).

TAGS:
design system, design tokens, agents, ai, llm, mcp, diff, changelog, snapshot, components, component library, variants, variables, styles, export, dev mode, developer, handoff, git, version control, documentation, toon, json, markdown, library audit
