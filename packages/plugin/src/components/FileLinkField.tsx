import React, { useEffect, useState } from "react";
import { Button, Flex, Input, Text } from "figma-kit";
import { FileLinkState, MessageTypes, PluginMessage } from "@atropical/liblib-core/types";

const secondary = { color: "var(--figma-color-text-secondary)" };

/** Figma's "Copy link". With a layer selected it links to the layer — same file key, so that is fine. */
const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘L" : "Ctrl+L";

const kbd: React.CSSProperties = {
  fontFamily: "inherit",
  fontWeight: 600,
  padding: "0 4px",
  borderRadius: 3,
  border: "1px solid var(--figma-color-border)",
  background: "var(--figma-color-bg)",
};

/**
 * Asks for this file's link when Figma will not say which file the plugin is
 * running in — which is always, for a Community plugin. Without it an export
 * names its frames by node id only, and an agent cannot open one.
 *
 * Asked once per file: the plugin thread saves the link in the file. Renders
 * nothing when Figma gives the key itself.
 */
export const FileLinkField: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const [state, setState] = useState<FileLinkState | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const handle = ({ data: { pluginMessage } }: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
      if (pluginMessage?.type !== MessageTypes.FILE_LINK_RESULT || !pluginMessage.fileLink) return;
      setState(pluginMessage.fileLink);
      if (!pluginMessage.fileLink.error) {
        setEditing(false);
        setDraft("");
      }
    };
    window.addEventListener("message", handle);
    parent.postMessage({ pluginMessage: { type: MessageTypes.REQUEST_FILE_LINK } }, "*");
    return () => window.removeEventListener("message", handle);
  }, []);

  const save = (fileUrl: string) =>
    parent.postMessage({ pluginMessage: { type: MessageTypes.SET_FILE_LINK, fileUrl } }, "*");

  if (!state || state.source === "figma") return null;

  if (state.source === "pasted" && !editing) {
    return (
      <Flex direction="column" gap="1">
        <Flex direction="row" gap="2" align="center" wrap="wrap">
          <Text size="small">
            Linked to file <code>{state.fileKey}</code>
          </Text>
          <Button variant="secondary" onClick={() => setEditing(true)} disabled={disabled}>
            Change
          </Button>
        </Flex>
        {state.error && <Text size="small" style={secondary}>{state.error}</Text>}
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      gap="2"
      style={{
        border: "1px solid var(--figma-color-border-brand-strong)",
        background: "var(--figma-color-bg-brand-tertiary)",
        borderRadius: 6,
        padding: 10,
      }}
    >
      <Text weight="strong">Paste this file's link first</Text>
      <Text size="small">
        Click the canvas, press <kbd style={kbd}>{SHORTCUT}</kbd> to copy the link, then paste it here. Figma doesn't tell
        plugins which file they're in, so without the link agents can't open or screenshot what you export.
        It's saved in this file, so you're only asked once.
      </Text>
      <Flex direction="row" gap="2" align="center">
        <Input
          placeholder="https://www.figma.com/design/…"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) save(draft);
          }}
          style={{ flex: 1 }}
        />
        <Button variant="primary" onClick={() => save(draft)} disabled={disabled || !draft.trim()}>
          Save
        </Button>
        {editing && (
          <Button variant="secondary" onClick={() => save("")} disabled={disabled}>
            Remove
          </Button>
        )}
      </Flex>
      {state.error && (
        <Text size="small" style={{ color: "var(--figma-color-text-danger)" }}>
          {state.error}
        </Text>
      )}
    </Flex>
  );
};
