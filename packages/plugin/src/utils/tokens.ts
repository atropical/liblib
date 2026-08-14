/**
 * Token estimation.
 *
 * The point of offering TOON alongside JSON is that it costs an agent fewer
 * tokens, so the UI has to show that number. A real BPE tokenizer would be
 * exact, but `gpt-tokenizer`'s rank tables are ~2.6 MB — inlined into a
 * single-file plugin UI that is a bad trade for a figure used to compare two
 * formats.
 *
 * Instead this splits text the way byte-pair encoders tend to: leading space
 * stays with its word, runs of letters are one token up to a length, digits
 * group in threes, and punctuation stands alone. Calibrated against
 * `o200k_base` (the encoding used by current GPT and Claude-era models) on
 * real snapshot output; see `scripts/calibrate-tokens.mjs`. Counts are shown
 * with a `≈` in the UI because they are an estimate, not a promise.
 */

const CHUNK = /\s*(?:[A-Za-z]+|\d+|[^\sA-Za-z\d]+)|\s+/g;

// Fitted against o200k_base on the fixtures in `scripts/fixtures`; worst-case
// error 9.7% across JSON, TOON and Markdown output.
const CHARS_PER_WORD_TOKEN = 5;
const CHARS_PER_PUNCTUATION_TOKEN = 1.5;
const CHARS_PER_WHITESPACE_TOKEN = 4;
const DIGITS_PER_TOKEN = 3;

export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  for (const [chunk] of text.matchAll(CHUNK)) {
    const body = chunk.trimStart();

    if (body.length === 0) {
      // A whitespace-only run: newlines and indentation are cheap but not free.
      tokens += Math.max(1, Math.ceil(chunk.length / CHARS_PER_WHITESPACE_TOKEN));
      continue;
    }

    if (/^[A-Za-z]+$/.test(body)) {
      tokens += Math.max(1, Math.ceil(body.length / CHARS_PER_WORD_TOKEN));
    } else if (/^\d+$/.test(body)) {
      tokens += Math.ceil(body.length / DIGITS_PER_TOKEN);
    } else {
      // Runs like `":` or `| --- |` merge rather than costing a token apiece.
      tokens += Math.max(1, Math.ceil(body.length / CHARS_PER_PUNCTUATION_TOKEN));
    }
  }

  return tokens;
}

/**
 * Worst-case deviation from `o200k_base` measured by
 * `npm run calibrate:tokens`, rounded up to a round number. The UI reports a
 * range built from this rather than a single figure, because a single figure
 * reads as a measurement when it is an estimate.
 */
export const TOKEN_ERROR_MARGIN = 0.1;

export interface TokenRange {
  estimate: number;
  min: number;
  max: number;
}

export function tokenRange(estimate: number): TokenRange {
  return {
    estimate,
    min: Math.floor(estimate * (1 - TOKEN_ERROR_MARGIN)),
    max: Math.ceil(estimate * (1 + TOKEN_ERROR_MARGIN)),
  };
}

/** `12345` -> `12.3k`, for a count that sits inline next to a button. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * `11k–14k` — both bounds are rendered at the scale of the upper one, so a
 * range never reads as `846–1.0k` and force the eye to convert units.
 */
export function formatTokenRange(estimate: number): string {
  const { min, max } = tokenRange(estimate);
  if (max < 1000) return `${min}–${max}`;
  if (max >= 1_000_000) return `${(min / 1_000_000).toFixed(1)}M–${(max / 1_000_000).toFixed(1)}M`;
  const decimals = max < 10_000 ? 1 : 0;
  return `${(min / 1000).toFixed(decimals)}k–${(max / 1000).toFixed(decimals)}k`;
}

/** Percentage saved by `candidate` relative to `baseline`, floored at 0. */
export function savingsPercent(baseline: number, candidate: number): number {
  if (baseline <= 0) return 0;
  return Math.max(0, Math.round(((baseline - candidate) / baseline) * 100));
}
