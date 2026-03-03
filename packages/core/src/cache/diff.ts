/**
 * Finds the common prefix and suffix boundaries between two key arrays.
 * @internal
 */
export const findCommonBounds = (
  oldKeys: (string | null)[],
  newKeys: (string | null)[],
): { start: number; oldEnd: number; newEnd: number } => {
  let start = 0;
  while (start < oldKeys.length && start < newKeys.length && oldKeys[start] === newKeys[start]) {
    start++;
  }

  let oldEnd = oldKeys.length;
  let newEnd = newKeys.length;
  while (oldEnd > start && newEnd > start && oldKeys[oldEnd - 1] === newKeys[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { start, oldEnd, newEnd };
};

/**
 * Computes swap operations to reorder oldKeys into newKeys order using selection sort.
 * @internal
 */
export const computeSwaps = (oldKeys: string[], newKeys: string[]): { i: number; j: number }[] => {
  const working = [...oldKeys];
  const swaps: { i: number; j: number }[] = [];

  for (const [i, newKey] of newKeys.entries()) {
    if (working[i] === newKey) continue;
    const j = working.indexOf(newKey, i + 1);
    if (j === -1) continue;
    [working[i], working[j]] = [working[j]!, working[i]!];
    swaps.push({ i, j });
  }

  return swaps;
};
