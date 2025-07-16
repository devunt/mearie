import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';
import { stableStringify, hashString, combineHashes } from '../utils.ts';

/**
 * @returns The deduplication link.
 */
const createDedupLink = (): Link => {
  const pending = new Map<number, Promise<LinkResult>>();

  return {
    name: 'dedup',

    async execute(ctx: LinkContext, next: NextFn): Promise<LinkResult> {
      const { document, variables } = ctx.operation;

      const queryHash = document.hash;
      const varsHash = variables ? hashString(stableStringify(variables)) : 0;
      const key = combineHashes(queryHash, varsHash);

      const existing = pending.get(key);
      if (existing) {
        return existing;
      }

      const promise = next();
      pending.set(key, promise);

      try {
        return await promise;
      } finally {
        pending.delete(key);
      }
    },
  };
};

export const dedupLink = createDedupLink;
