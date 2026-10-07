# Format changes

What each LibLib plugin release changed about the snapshots it writes, and what that means when you compare a file from before the release with one from after it. Every snapshot records the release that wrote it in `meta.pluginVersion`.

A diff that spans one of these releases quotes the entry in its `notes`, so you don't need to come here to read a report — this page is for the reasoning and for tools that compare snapshots without the diff.

Releases that changed the schema id (`schema`) are still read as diff bases; fields renamed across them are listed in the diff's notes.

## 2.3.0

**Change.** Style records carry `bindings`: every variable bound inside `value`, keyed by its path there (`boundVariables.fontSize`, `paints[0].boundVariables.color`), with its `name`, `collection` and `key`. `value` is unchanged and still names the variable only. Styles that bind nothing have no `bindings`. The schema id stays `liblib/design-system-snapshot@1`.

**Why.** Variable names repeat across collections (a primitive and a theme token can both be `color/brand/500`). The name alone could not say which variable a style used, so a rebind between them was invisible.

**Consequences.**
- The hash of every style that binds a variable changes once. Styles that bind nothing keep their hash.
- Against a snapshot from before 2.3.0 the diff skips `bindings`, so those styles are not reported unless something else about them changed. A rebind made between the two exports is not visible in that one diff; every later diff sees it.
- If you compare hashes yourself, expect every bound style to differ across this release.
