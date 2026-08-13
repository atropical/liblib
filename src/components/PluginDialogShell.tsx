import React from "react";
import { Flex } from "figma-kit";
import { Footer } from "./Footer";

interface PluginDialogShellProps {
  children: React.ReactNode;
  /** Full-width row pinned above the content columns. */
  header?: React.ReactNode;
  showFooter?: boolean;
  /**
   * Changes when the panel switches to a different step. A scan is started at
   * the bottom of a scrolled options list and its result is a new screen, so
   * the scroll position from the previous step is never the right one to keep.
   */
  scrollKey?: string;
}

export const PluginDialogShell: React.FC<PluginDialogShellProps> = ({
  children,
  header,
  showFooter = true,
  scrollKey,
}) => {
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  return (
  <Flex
    ref={scroller}
    direction="column"
    gap="4"
    style={{
      padding: "1rem",
      boxSizing: "border-box",
      height: "100%",
      minHeight: 0,
      flex: 1,
      // The body has overflow hidden, so anything taller than the panel — an
      // expanded note, a long estimate — has to scroll here or it is lost.
      overflowY: "auto",
    }}
  >
    {header && (
      <Flex direction="column" gap="2" style={{ flex: "0 0 auto" }}>
        {header}
      </Flex>
    )}
    <Flex direction="column" gap="4" style={{ flex: "1 0 auto", minHeight: 0 }}>
      {children}
    </Flex>
    {showFooter && <Footer />}
  </Flex>
  );
};
