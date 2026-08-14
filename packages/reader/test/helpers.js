import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** Reads a fixture exactly as it was written — no normalising, no trimming. */
export function fixture(name) {
  return readFileSync(resolve(fixtures, name), "utf8");
}

/** Runs `fn`, returns the error it threw, and fails loudly if it threw nothing. */
export function thrown(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected this to throw, and it returned instead.");
}
