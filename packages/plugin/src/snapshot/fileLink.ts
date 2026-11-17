/// <reference types="@figma/plugin-typings" />

import { FileLinkState } from "@atropical/liblib-core/types";
import { NO_FILE_KEY_HINT, parseFigmaUrl, SCREENSHOT_HINT } from "@atropical/liblib-core/links";

/**
 * The file key every export carries, and where it came from.
 *
 * `figma.fileKey` is only set for plugins private to an organisation; in the
 * Community build it is `undefined`, and without a key no node id in the
 * export can be opened by an agent. So the user is asked for the file's link
 * once, and it is saved in the file itself — anyone who runs the plugin on
 * this file later, in either editor, gets it without being asked again.
 */
const PLUGIN_DATA_KEY = "fileUrl";

/** Kept for the session when the file refuses plugin data (some Dev Mode seats). */
let unsaved: string | undefined;

export function fileLink(): FileLinkState {
  if (figma.fileKey) return { fileKey: figma.fileKey, source: "figma" };
  const url = stored();
  const parsed = url ? parseFigmaUrl(url) : null;
  return parsed ? { fileKey: parsed.fileKey, source: "pasted", url } : { source: "none" };
}

/** The `meta` fields every export writes: the key when there is one, and how to use it. */
export function fileKeyMeta(): { fileKey?: string; viewWith: string } {
  const { fileKey } = fileLink();
  return fileKey ? { fileKey, viewWith: SCREENSHOT_HINT } : { viewWith: NO_FILE_KEY_HINT };
}

/** Saves a pasted link, or forgets it when `input` is empty. Never throws. */
export function setFileLink(input: string): FileLinkState {
  const url = input.trim();
  if (url !== "" && !parseFigmaUrl(url)) {
    return {
      ...fileLink(),
      error: "That is not a Figma file link. Copy it from Share → Copy link, or from the browser's address bar.",
    };
  }
  try {
    figma.root.setPluginData(PLUGIN_DATA_KEY, url);
    unsaved = undefined;
    return fileLink();
  } catch (error) {
    console.warn("LibLib: could not save the file link into the file", error);
    unsaved = url || undefined;
    return {
      ...fileLink(),
      error: "Figma would not let LibLib save the link in this file, so it is kept until the plugin closes.",
    };
  }
}

function stored(): string | undefined {
  if (unsaved) return unsaved;
  try {
    return figma.root.getPluginData(PLUGIN_DATA_KEY) || undefined;
  } catch {
    return undefined;
  }
}
