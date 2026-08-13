/**
 * The one error this package throws when a file is not what it claims to be.
 *
 * It exists because the failure mode this reader was written against is not a
 * crash — it is a plausible empty result. A hand-rolled parser that mis-reads a
 * tabular section returns `[]`, and `[]` is a perfectly good answer to "which
 * components does this file use?" right up until someone acts on it. Every path
 * through this package that cannot produce a real answer throws instead.
 */
export class SchemaError extends Error {
  /** The schema id the file declared, when it declared one. */
  schema?: string;
  /** Schema ids that would have been accepted here. */
  expected?: string[];

  constructor(message: string, details?: { schema?: string; expected?: string[] }) {
    super(message);
    this.name = "SchemaError";
    if (details?.schema !== undefined) this.schema = details.schema;
    if (details?.expected !== undefined) this.expected = details.expected;
    // Keeps `instanceof` working when the bundle is consumed from CommonJS.
    Object.setPrototypeOf(this, SchemaError.prototype);
  }
}
