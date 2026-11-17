import React from "react";
import { Flex } from "figma-kit";
import { ApiWarningBanner } from "./ApiWarningBanner";
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
  /**
   * Pinned under the scrolling content, so the primary button is always in
   * view however many options sit above it.
   */
  action?: React.ReactNode;
}

export const PluginDialogShell: React.FC<PluginDialogShellProps> = ({
  children,
  header,
  showFooter = true,
  scrollKey,
  action,
}) => {
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  return (
  <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
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
    <ApiWarningBanner />
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
    {action && (
      <Flex
        direction="column"
        gap="2"
        style={{
          flex: "0 0 auto",
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--figma-color-border)",
          background: "var(--figma-color-bg)",
        }}
      >
        {action}
      </Flex>
    )}
  </Flex>
  );
};
