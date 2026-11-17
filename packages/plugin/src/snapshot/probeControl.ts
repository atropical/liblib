/**
 * Lets a scan pre-empt the estimate.
 *
 * The plugin thread is single-threaded: a probe still counting a huge library
 * would otherwise make the user wait for an estimate they no longer want
 * before their scan even starts. Every probe takes a ticket; starting a scan,
 * or a newer probe, invalidates it, and the probe stops at its next
 * checkpoint. Checkpoints also yield, so the scan's message gets in at all.
 */

let generation = 0;

/** Thrown out of an abandoned probe. Never shown: nobody is waiting for it. */
export class ProbeCancelled extends Error {
  constructor() {
    super("probe cancelled");
  }
}

/** Abandons whatever probe is running. */
export function cancelProbes(): void {
  generation += 1;
}

export interface ProbeTicket {
  /** Yields to queued messages, then throws if this probe was superseded. */
  checkpoint(): Promise<void>;
}

export function startProbe(): ProbeTicket {
  const mine = ++generation;
  return {
    async checkpoint() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (generation !== mine) throw new ProbeCancelled();
    },
  };
}

/** Above this many roots, node counts come from an evenly spread subset and are scaled up. */
export const MAX_COUNTED_ROOTS = 1500;

/**
 * Styles and variables sent with an estimate. The full set is collected (the
 * scan needs it), but encoding thousands of variables three times in the UI is
 * what froze the panel; a slice scaled up is within the estimate's own error.
 */
export const MAX_ESTIMATED_DEFINITIONS = 300;

/** Roots to count exactly, spread over the file so the subset has its shape. */
export function countedSubset(total: number): number[] {
  if (total <= MAX_COUNTED_ROOTS) return Array.from({ length: total }, (_, i) => i);
  const step = total / MAX_COUNTED_ROOTS;
  return Array.from({ length: MAX_COUNTED_ROOTS }, (_, i) => Math.floor(i * step));
}

/** Counts each root's cost, yielding every few hundred roots. */
export async function countWeights<T>(
  roots: T[],
  cost: (root: T) => number,
  ticket: ProbeTicket,
): Promise<{ indices: number[]; weights: number[]; totalNodes: number; approximate: boolean }> {
  const indices = countedSubset(roots.length);
  const weights: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    if (i % 200 === 0) await ticket.checkpoint();
    weights.push(cost(roots[indices[i]]));
  }
  const counted = weights.reduce((sum, weight) => sum + weight, 0);
  const approximate = indices.length < roots.length;
  return {
    indices,
    weights,
    totalNodes: approximate ? Math.round((counted * roots.length) / indices.length) : counted,
    approximate,
  };
}
