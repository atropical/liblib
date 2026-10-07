/**
 * What each plugin release changed about the files it writes, and what that
 * means for anyone comparing a file from before it with one from after.
 *
 * A diff that spans releases quotes the entries in between, so an agent
 * reading the report learns why some records moved without being told. Keep
 * FORMAT-CHANGES.md in the reader package in step: a test holds the two
 * together.
 */
export interface FormatChange {
  /** Plugin version that first wrote the change. */
  version: string;
  /** One sentence: what the files now contain. */
  change: string;
  /** One sentence: what that does to hashes and diffs across the release. */
  consequence: string;
}

export const FORMAT_CHANGES_URL = "https://github.com/atropical/liblib/blob/main/packages/reader/FORMAT-CHANGES.md";

export const FORMAT_CHANGES: FormatChange[] = [
  {
    version: "2.3.0",
    change:
      "Style records carry `bindings`: each bound variable's name, collection and key, keyed by its path in `value`.",
    consequence:
      "The hash of every style that binds a variable changes once; against an older snapshot the diff skips " +
      "`bindings`, so those styles are not reported unless something else about them changed.",
  },
];

/** Entries written after `base` and up to `head`, oldest first. */
export function formatChangesBetween(base: string, head: string): FormatChange[] {
  return FORMAT_CHANGES.filter(
    (entry) => compareVersions(entry.version, base) > 0 && compareVersions(entry.version, head) <= 0,
  );
}

/** One note per release a diff spans, plus where to read more. Empty when it spans none. */
export function formatChangeNotes(base: string | undefined, head: string | undefined): string[] {
  if (!base || !head) return [];
  const entries = formatChangesBetween(base, head);
  if (entries.length === 0) return [];
  return [
    ...entries.map(
      (entry) => `LibLib ${entry.version} changed the format: ${entry.change} ${entry.consequence}`,
    ),
    `Base was written by LibLib ${base}, head by ${head}; every format change: ${FORMAT_CHANGES_URL}`,
  ];
}

function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return (left[i] ?? 0) - (right[i] ?? 0);
  }
  return 0;
}
