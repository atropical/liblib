TAGLINE:
Design systems in a form agents can actually read. Snapshot your library, snapshot the designs that use it, and let `git diff` tell your agent what changed.

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
**LibLib** is a Figma plugin that exports your design system as deterministic, diffable files, so an LLM agent can answer the two questions nothing else in Figma can: what changed since last time, and what is this design actually made of?

Your agent can already read your components — Figma's MCP server hands it context on demand. What it can't tell you is what changed since last week; there is no published-component history and no diff anywhere in the platform, not in the MCP server, not in the Plugin API, not in REST. And in a design file it can see that a layer is an instance but not which variant, so it guesses — which is where wrong button sizes and invented shadows come from.

LibLib writes both down.

## Features
**Library Snapshots:** Every component, component set, variant, property, style and variable in one deterministic file, with a content hash per record. Same design in, byte-identical file out
**Usage Snapshots:** Run it in a file that *uses* your library and get each frame written out with the component key and exact variant behind every instance, what each override was set to, the tokens bound, and a node id on every layer
**Diff Either One:** Load a previous export, rescan, and get a report of what was added, removed, renamed or modified — down to the field path (`structure.children[0].props.padding`, `properties.Size.variantOptions`, `valuesByMode.Dark`), with old value against new
**Renames Stay Renames:** Library changes are tracked by publish key, so a renamed component never reads as one deleted and another invented — the single mistake that sends agents rewriting components nobody touched
**Honest Scope:** A usage export records which frames it covered, so exporting a section one day and two screens the next reports the difference as *not covered*, never as deleted
**Off-System Flags:** Local components, missing main components, and values typed in where a token exists, each marked deliberate or not — so an agent can tell a considered exception from a mistake
**Positions and Tokens Together:** Layers carry their position relative to the parent and the token bound to each spacing value, and where a bound token disagrees with what renders, both numbers are recorded
**Screens Without the Bulk:** Instances stop at their boundary, keeping only what carries an override, text, or another component; artwork outlines collapse to a count on the layer holding them
**Three Formats With Token Counts:** TOON for machines (~40% cheaper than JSON, losslessly convertible back), Markdown to read, JSON as a universal baseline — each with an estimated token range shown before you export
**Cost Estimate Before You Scan:** Large files are measured first. A stratified sample and an exact node count predict scan time, file size and token cost per format, and re-predict whenever you change an option
**Resolved Tokens, Not Raw Ids:** Bound variables are resolved to `Collection/Variable` names, including variables bound inside a style's shadow colour, offset, radius or spread
**Node Ids Included:** Every component, variant and — in a usage export — every layer carries its Figma node id, so an agent can link straight back into the file or hand it to the MCP tools
**Fully Offline:** No network requests at all. Nothing leaves Figma

### Notes:
† Markdown is a rendering, not a source — it is the cheapest format to read but cannot be loaded back as a diff base. Use TOON or JSON for anything you intend to diff against later.
‡ Figma caps a plugin run at roughly ten save dialogs, which is why each export writes a single file.

## Usage
### In your library file
1. Open the Figma file containing your library
2. Run **LibLib** from the Plugins menu and choose **Export Library Snapshot…**
3. Review the estimate, pick a format and adjust depth if needed
4. Click **Scan file**, then **Download**
5. Commit the file next to your code, e.g. `design-system/.figma/library.snapshot.toon`

### In a file that uses the library
1. Select the frames you want — or a section holding them
2. Run **LibLib** and choose **Export Usage Snapshot…**
3. Check the frame list the panel reports, adjust the options, and scan
4. Commit it alongside, e.g. `.figma/usage.snapshot.toon`

The two join on the component publish key: the usage file says which component and which variant a frame uses, the library file says what that component is. Neither repeats the other.

### Dev Mode
Open the file, switch to Dev Mode, and run **LibLib** from the Plugins menu — the same commands run in the handoff panel.

### Diffing against a previous export
1. Run **LibLib** and choose **Diff Against Library Snapshot…** or **Diff Against Usage Snapshot…**
2. Select a `.json` or `.toon` file previously exported by the plugin
3. The current file is rescanned and compared
4. Review the report, expand any change to see old value against new, then download it

### Suggested Workflow
1. Designer publishes the library and re-exports the snapshot over the committed file
2. The commit diff *is* the design system changelog
3. The agent reads `git diff` (or the Markdown report) and knows exactly which components to re-implement, and which screens use them

LibLib is open source, consider contributing. Code available on [GitHub](https://github.com/atropical/liblib).

For bug reports, suggestions, or questions, please open an [issue](https://github.com/atropical/liblib/issues).

TAGS:
design system, design tokens, agents, ai, llm, mcp, diff, changelog, snapshot, components, component library, variants, variables, styles, export, dev mode, developer, handoff, git, version control, documentation, toon, json, markdown, library audit
