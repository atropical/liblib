import { diffSnapshots, diffUsage } from "@atropical/liblib-core/snapshot/diff";
import { DiffReport, Snapshot, UsageDiffReport, UsageSnapshot } from "@atropical/liblib-core/types";
import { SchemaError } from "./errors";
import { ReadResult, SnapshotKind } from "./read";

export type DiffInput =
  | ReadResult<Snapshot>
  | ReadResult<UsageSnapshot>
  | ReadResult<Snapshot | UsageSnapshot>
  | Snapshot
  | UsageSnapshot;

/**
 * Compares two snapshots of the same kind.
 *
 * The comparison itself is the plugin's own `diffSnapshots`/`diffUsage`, called
 * directly rather than reimplemented — a reader that diffs differently from the
 * tool that wrote the files is worse than no reader. All this adds is refusing a
 * library against a usage snapshot, which would otherwise produce a report
 * saying every component was removed.
 */
export function diff(base: DiffInput, head: DiffInput): DiffReport | UsageDiffReport {
  const left = unwrap(base, "base");
  const right = unwrap(head, "head");

  if (left.kind !== right.kind) {
    throw new SchemaError(
      `Cannot diff a ${left.kind} snapshot against a ${right.kind} snapshot: they describe ` +
        `different things and share no keys, so the report would say everything was removed and ` +
        `everything added. Compare a library against a library, or a usage export against a ` +
        `usage export.`,
    );
  }

  return left.kind === "usage"
    ? diffUsage(left.data as UsageSnapshot, right.data as UsageSnapshot)
    : diffSnapshots(left.data as Snapshot, right.data as Snapshot);
}

function unwrap(input: DiffInput, side: string): { kind: SnapshotKind; data: Snapshot | UsageSnapshot } {
  if (!input || typeof input !== "object") {
    throw new SchemaError(`The ${side} of this diff is not a snapshot.`);
  }

  const candidate = input as unknown as Record<string, unknown>;
  if (candidate.data && typeof candidate.data === "object" && typeof candidate.kind === "string") {
    const result = input as ReadResult<Snapshot | UsageSnapshot>;
    return { kind: result.kind, data: result.data };
  }

  // `frames` is the field only a usage snapshot has; `components` is on both.
  if (Array.isArray(candidate.frames)) {
    return { kind: "usage", data: input as UsageSnapshot };
  }
  if (Array.isArray(candidate.components)) {
    return { kind: "library", data: input as Snapshot };
  }

  throw new SchemaError(
    `The ${side} of this diff has neither \`frames\` nor \`components\`, so it is not a snapshot. ` +
      `Pass the result of \`read\`, or its \`.data\`.`,
  );
}
