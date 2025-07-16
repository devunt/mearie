import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';

export type RetryOptions = {
  maxAttempts?: number;
  backoff?: (attempt: number) => number;
  shouldRetry?: (error: unknown) => boolean;
};

/**
 * @param options - The retry options.
 * @returns The retry link.
 */
const createRetryLink = (options: RetryOptions = {}): Link => {
  const {
    maxAttempts = 3,
    backoff = (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    shouldRetry = () => true,
  } = options;

  return {
    name: 'retry',

    async execute(ctx: LinkContext, next: NextFn): Promise<LinkResult> {
      let lastError: unknown;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await next();
        } catch (error) {
          lastError = error;

          if (attempt === maxAttempts - 1 || !shouldRetry(error)) {
            throw error;
          }

          const delay = backoff(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      throw lastError;
    },
  };
};

export const retryLink = createRetryLink;
