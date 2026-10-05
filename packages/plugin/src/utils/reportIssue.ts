const ISSUES_URL = "https://github.com/atropical/liblib/issues/new";

/**
 * A prefilled GitHub issue. The user reviews it before submitting, so the
 * body can carry details from their file that they may choose to trim.
 */
export function issueUrl(title: string, details: string[], editorType?: string): string {
  const body = [
    ...details,
    "",
    `Plugin version: ${__PLUGIN_VERSION__}`,
    `Editor: ${editorType ?? "unknown"}`,
  ].join("\n");
  return `${ISSUES_URL}?${new URLSearchParams({ title, body }).toString()}`;
}
