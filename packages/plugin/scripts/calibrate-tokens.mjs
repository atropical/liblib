/**
 * Checks `estimateTokens` against a real BPE tokenizer on representative
 * snapshot output. Run after touching the estimator:
 *
 *   npm run calibrate:tokens
 *
 * `gpt-tokenizer` is a devDependency and is never shipped in the plugin bundle.
 */
import { encode } from "gpt-tokenizer/encoding/o200k_base";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The estimator is TypeScript, so bundle it to plain ESM before importing.
const dir = mkdtempSync(join(tmpdir(), "haa-calibrate-"));
const entry = join(dir, "entry.ts");
const out = join(dir, "tokens.mjs");
writeFileSync(entry, `export { estimateTokens } from "${join(process.cwd(), "src/utils/tokens.ts")}";\n`);
execFileSync("npx", ["esbuild", entry, "--bundle", "--format=esm", `--outfile=${out}`], { stdio: "ignore" });
const { estimateTokens } = await import(out);

const samples = [
  ["snapshot fragment (JSON)", readFileSync(new URL("./fixtures/sample.json", import.meta.url), "utf8")],
  ["snapshot fragment (TOON)", readFileSync(new URL("./fixtures/sample.toon", import.meta.url), "utf8")],
  ["report fragment (Markdown)", readFileSync(new URL("./fixtures/sample.md", import.meta.url), "utf8")],
];

let worst = 0;
for (const [label, text] of samples) {
  const actual = encode(text).length;
  const estimated = estimateTokens(text);
  const error = Math.abs(estimated - actual) / actual;
  worst = Math.max(worst, error);
  console.log(
    `${label.padEnd(28)} actual ${String(actual).padStart(7)}  ` +
      `estimated ${String(estimated).padStart(7)}  error ${(error * 100).toFixed(1)}%`,
  );
}

console.log(`\nworst-case error: ${(worst * 100).toFixed(1)}%`);
process.exit(worst > 0.12 ? 1 : 0);
