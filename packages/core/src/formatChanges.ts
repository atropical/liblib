import { FORMAT_CHANGES, FORMAT_CHANGES_URL, FormatChange } from "./types";

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
