/**
 * Turning a node id into something an agent can open.
 *
 * Figma's MCP tools take a file key and a node id, and nothing in a node id
 * says which file it belongs to. Figma only tells a plugin its own file key
 * when the plugin is private to an organisation, so a Community build has to
 * be handed the key — by the user pasting the file's link once. Both the
 * plugin (to read that link) and the reader (to accept one on the command
 * line) need the same parsing, which is why it lives here.
 */

/** What a pasted Figma link resolves to. */
export interface FigmaLink {
  /**
   * The key the MCP tools want. For a link into a branch this is the branch
   * key, not the main file's: that is the file the node ids belong to.
   */
  fileKey: string;
  /** Node id from `?node-id=`, in API form (`865:12277`), when the link had one. */
  nodeId?: string;
}

/**
 * `https://www.figma.com/design/<key>[/branch/<branch>][/<name>][?…node-id=1-2…]`.
 * Parsed by pattern rather than with `URL`: the plugin sandbox has no `URL`.
 */
const FILE_LINK =
  /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*figma\.com\/(?:design|file|proto|board|slides|make)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?(?:[/?#]|$)/i;
const NODE_ID = /[?&]node-id=([0-9]+(?:[-:]|%3A)[0-9]+)/i;

/**
 * Reads a figma.com link. Returns `null` for anything that is not one, so a
 * caller can tell the user their paste was not a file link rather than store
 * a key that opens nothing.
 */
export function parseFigmaUrl(input: string): FigmaLink | null {
  const text = input.trim();
  const match = FILE_LINK.exec(text);
  if (!match) return null;
  const link: FigmaLink = { fileKey: match[2] ?? match[1] };
  const node = NODE_ID.exec(text);
  if (node) link.nodeId = node[1].replace(/%3A/i, ":").replace("-", ":");
  return link;
}

/**
 * A link that opens `nodeId` in Dev Mode. The URL takes the id with a dash
 * (`865-12277`); the MCP tools and the export use the colon form. The file
 * name in the path is cosmetic — Figma resolves the key alone — but a link
 * with the name reads better to the person it is shown to.
 */
export function nodeUrl(fileKey: string, nodeId: string, fileName = ""): string {
  const slug = encodeURIComponent(fileName.trim().replace(/\s+/g, "-")) || "file";
  return `https://www.figma.com/design/${fileKey}/${slug}?node-id=${nodeId.replace(/:/g, "-")}&m=dev`;
}

/** Written into `meta` when an export has no file key, so an agent knows what to ask for. */
export const NO_FILE_KEY_HINT =
  "No file key: Figma withholds it from Community plugins and none was pasted. Ask the user for this " +
  "file's Figma link, then pass it as `--file-url` to `liblib frames` or `liblib link`.";

/** Written into `meta` when it does have one: how to see a node, in one line. */
export const SCREENSHOT_HINT =
  "To see any node: Figma MCP `get_screenshot` with `fileKey` from here and the record's `nodeId`; " +
  "`liblib link <file> <frame|component|nodeId>` prints both and a URL.";
