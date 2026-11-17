import assert from "node:assert/strict";
import test from "node:test";
import { nodeUrl, parseFigmaUrl } from "../dist/index.js";

test("parseFigmaUrl reads file, branch and node id", () => {
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/AbC123/My-File?node-id=865-12277&m=dev"), {
    fileKey: "AbC123",
    nodeId: "865:12277",
  });
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/MAIN1/branch/BR2/My-File"), { fileKey: "BR2" });
  assert.deepEqual(parseFigmaUrl("  figma.com/file/OLD9  "), { fileKey: "OLD9" });
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/K1/F?node-id=1%3A2"), { fileKey: "K1", nodeId: "1:2" });
});

test("parseFigmaUrl refuses what is not a Figma file link", () => {
  for (const input of ["", "abc123", "https://example.com/design/K1", "https://www.figma.com/files/recent", "https://notfigma.com/design/K1"]) {
    assert.equal(parseFigmaUrl(input), null, input);
  }
});

test("nodeUrl writes the dash form and a readable slug", () => {
  assert.equal(nodeUrl("K1", "865:12277", "UI Marine Catch"), "https://www.figma.com/design/K1/UI-Marine-Catch?node-id=865-12277&m=dev");
  assert.equal(nodeUrl("K1", "I1:2;3:4"), "https://www.figma.com/design/K1/file?node-id=I1-2;3-4&m=dev");
});
