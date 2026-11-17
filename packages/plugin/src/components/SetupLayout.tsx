import React from "react";
import { Flex } from "figma-kit";

interface SetupLayoutProps {
  editorType?: string;
  /** What to scan and how: the long list. */
  options: React.ReactNode;
  /** What the scan will cost and anything it needs first, beside the options. */
  scan: React.ReactNode;
}

/**
 * The step before a scan. In Design mode the panel is wide enough to put the
 * cost next to the options, so changing one shows its effect without
 * scrolling; Dev mode is narrow, so the two stack. The Scan button itself is
 * not in here: it is pinned to the bottom of the panel by the shell.
 */
export const SetupLayout: React.FC<SetupLayoutProps> = ({ editorType, options, scan }) => {
  if (editorType === "figma") {
    return (
      <Flex direction="row" gap="5" style={{ alignItems: "flex-start" }}>
        <Flex direction="column" gap="4" style={{ flex: "1 1 0", minWidth: 0 }}>
          {options}
        </Flex>
        <Flex
          direction="column"
          gap="4"
          style={{ flex: "1 1 0", minWidth: 0, position: "sticky", top: 0 }}
        >
          {scan}
        </Flex>
      </Flex>
    );
  }
  return (
    <Flex direction="column" gap="4">
      {options}
      {scan}
    </Flex>
  );
};
