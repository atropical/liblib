export default {
  "name": "LibLib",
  "id": "1665168884798434636",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "src/index.html",
  "editorType": ["figma", "dev"],
  // Dev Mode refuses to launch a plugin in the handoff panel without this,
  // even with "dev" in editorType.
  "capabilities": ["inspect"],
  "documentAccess": "dynamic-page",
  // Named by which file each belongs in: "Library" runs where the components
  // live, "Usage" runs in a design file that consumes them.
  "menu": [
    { "command": "snapshot", "name": "Export Library Snapshot…" },
    { "command": "diff", "name": "Diff Against Library Snapshot…" },
    { "separator": true },
    { "command": "usage", "name": "Export Usage Snapshot…" },
    { "command": "usage-diff", "name": "Diff Against Usage Snapshot…" }
  ],
  "networkAccess": {
    "allowedDomains": ["none"],
    "reasoning": "LibLib reads the current file and writes report files locally. It never sends design data anywhere."
  }
};
