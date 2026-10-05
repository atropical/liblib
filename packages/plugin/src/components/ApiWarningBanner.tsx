import React, { useEffect, useState } from "react";
import { Flex, Link, Text } from "figma-kit";
import { ApiWarning, MessageTypes, PluginMessage } from "@atropical/liblib-core/types";
import { issueUrl } from "../utils/reportIssue";

interface Report {
  warnings: ApiWarning[];
  editorType?: string;
}

/**
 * Figma sometimes starts returning `figma.mixed` from a property the typings
 * call plain. The export survives it, but the output says `"mixed"` where a
 * value belongs, so the user is told and handed a ready-made bug report.
 */
export const ApiWarningBanner: React.FC = () => {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    const handleMessage = ({ data: { pluginMessage } }: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
      if (pluginMessage?.type !== MessageTypes.API_WARNING || !pluginMessage.apiWarnings) return;
      const incoming = pluginMessage.apiWarnings;
      setReport((previous) => {
        const known = new Set(previous?.warnings.map((warning) => warning.property));
        const fresh = incoming.filter((warning) => !known.has(warning.property));
        if (previous && fresh.length === 0) return previous;
        return {
          warnings: [...(previous?.warnings ?? []), ...fresh],
          editorType: pluginMessage.editorType,
        };
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!report) return null;

  const properties = report.warnings.map((warning) => warning.property);
  const title = `Unexpected mixed value: ${properties.join(", ")}`;
  const href = issueUrl(
    title,
    [
      "LibLib replaced values Figma returned as `figma.mixed` on properties it expected to be plain.",
      "",
      ...report.warnings.map((warning) => `- \`${warning.property}\` (e.g. \`${warning.example}\`)`),
    ],
    report.editorType,
  );

  return (
    <Flex
      direction="column"
      gap="1"
      style={{
        flex: "0 0 auto",
        padding: "0.5rem 0.75rem",
        borderRadius: "var(--radius-medium, 5px)",
        background: "var(--figma-color-bg-warning-tertiary)",
        border: "1px solid var(--figma-color-border-warning)",
      }}
    >
      <Text weight="strong">Some values came back in a shape LibLib didn’t expect</Text>
      <Text>
        Figma returned mixed values for {properties.map((property, i) => (
          <React.Fragment key={property}>
            {i > 0 && ", "}
            <code>{property}</code>
          </React.Fragment>
        ))}
        . The export still works, but these show as <code>"mixed"</code>.{" "}
        <Link target="_blank" href={href}>
          Report it on GitHub ↗
        </Link>
      </Text>
    </Flex>
  );
};
