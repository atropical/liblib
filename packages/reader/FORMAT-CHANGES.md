# Format changes

Newest first. What each LibLib plugin release changed about the snapshots it writes, and what that means when you compare a file from before the release with one from after it. Every snapshot records the release that wrote it in `meta.pluginVersion`.

A diff that spans one of these releases quotes the entry in its `notes`, so you don't need to come here to read a report — this page is for the reasoning and for tools that compare snapshots without the diff.

Releases that changed the schema id (`schema`) are still read as diff bases; fields renamed across them are listed in the diff's notes.

## 2.3.0

**Change.** Style records carry `bindings`: every variable bound inside `value`, keyed by its path there (`boundVariables.fontSize`, `paints[0].boundVariables.color`), with its `name`, `collection` and `key`. `value` is unchanged and still names the variable only. Styles that bind nothing have no `bindings`. The schema id stays `liblib/design-system-snapshot@1`.

**Why.** Variable names repeat across collections (a primitive and a theme token can both be `color/brand/500`). The name alone could not say which variable a style used, so a rebind between them was invisible.

**Consequences.**
- The hash of every style that binds a variable changes once. Styles that bind nothing keep their hash.
- Against a snapshot from before 2.3.0 the diff skips `bindings`, so those styles are not reported unless something else about them changed. A rebind made between the two exports is not visible in that one diff; every later diff sees it.
- If you compare hashes yourself, expect every bound style to differ across this release.

## 2.2.0

**Change.** Every snapshot's `meta` carries `readWith`, saying how to read the file.

**Consequences.** None. `meta` is not hashed or diffed, and files without `readWith` still load.

## 2.1.0

**Change.** Usage schema goes to `liblib/usage-snapshot@3`:
- A layer's `offset` is renamed `position` (an effect already used `offset` for its shadow).
- A binding mismatch's `expected` and `actual` become `tokenValue` and `rendered`.
- Usage diffs match children by node id instead of by position.

**Consequences.**
- `@1` and `@2` usage exports still load as a diff base. Across the change, the renamed and added fields are suppressed and the report says so at the top.
- Inserting a layer now reports one added layer, not every sibling after it as changed.

## 2.0.0

**Change.** Usage snapshots arrive, as `liblib/usage-snapshot@2` (`@1` was never released, but loads). The library scan's default depth goes from 6 to 12, matching a usage scan.

**Consequences.** At the default depth, components nested deeper than 6 levels change hash once, because more of their tree is written.

## 1.2.0

**Change.** The library schema id moves from `help-an-agent/design-system-snapshot@1` to `liblib/design-system-snapshot@1`. Node keys are written identity-first, so a node's name comes before its children.

**Consequences.** Hashes are unchanged and the old schema id still loads as a diff base. A text diff of the file itself (e.g. in git) shows every node reordered once.

## 1.1.0

**Change.**
- Components, sets and variants carry `nodeId`; `meta` carries `fileKey`.
- Every node carries `width` and `height` (`includeSizes` now defaults to on).
- Variable aliases inside style values resolve to variable names, instead of raw `VariableID:` ids.

**Consequences.**
- Component and style hashes change once.
- `nodeId` and `fileKey` are kept out of hashes and diffs, so a duplicated file does not diff against every component.
