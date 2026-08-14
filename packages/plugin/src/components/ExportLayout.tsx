import React from "react";
import { Flex } from "figma-kit";

interface ExportLayoutProps {
  editorType?: string;
  children: React.ReactNode;
  preview: React.ReactNode;
}

/**
 * Design mode gets a wide panel, so controls sit left of the preview. Dev mode
 * is narrow, so the preview goes underneath instead.
 */
export const ExportLayout: React.FC<ExportLayoutProps> = ({ editorType, children, preview }) => {
  if (editorType === "figma") {
    return (
      <Flex direction="row" gap="4" style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Flex
          direction="column"
          gap="4"
          style={{
            flex: "1 1 200px",
            minWidth: 250,
            position: "sticky",
            top: "1rem",
            alignSelf: "flex-start",
          }}
        >
          {children}
        </Flex>
        {preview}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" style={{ flex: 1, minHeight: 0 }}>
      {children}
      {preview}
    </Flex>
  );
};
