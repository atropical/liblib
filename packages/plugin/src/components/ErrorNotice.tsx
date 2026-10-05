import React from "react";
import { Link, Text } from "figma-kit";
import { issueUrl } from "../utils/reportIssue";

interface ErrorNoticeProps {
  error: string;
  /** Which command failed, so the report says what the user was doing. */
  context: string;
  editorType?: string;
}

/** A failed scan, with a way to tell us about it. */
export const ErrorNotice: React.FC<ErrorNoticeProps> = ({ error, context, editorType }) => {
  const href = issueUrl(
    `${context} failed: ${error}`,
    [`The ${context.toLowerCase()} stopped with this error:`, "", "```", error, "```"],
    editorType,
  );
  return (
    <Text style={{ color: "var(--figma-color-text-danger)" }}>
      {error}{" "}
      <Link target="_blank" href={href}>
        Report it on GitHub ↗
      </Link>
    </Text>
  );
};
