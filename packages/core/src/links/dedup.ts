import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';
import { stringify } from '../utils.ts';

/**
 * @returns The deduplication link.
 */
const createDedupLink = (): Link => {
  const pending = new Map<string, Promise<LinkResult>>();

  return {
    name: 'dedup',

    async execute(ctx: LinkContext, next: NextFn): Promise<LinkResult> {
      const { artifact, variables } = ctx.operation;

      const vars = stringify(variables);
      const key = `${artifact.source}@${vars}`;

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
