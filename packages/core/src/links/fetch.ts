import type { Link, LinkContext, LinkResult } from '../link.ts';

export type HttpOptions = {
  url: string;
  headers?: HeadersInit;
  mode?: RequestMode;
  credentials?: RequestCredentials;
};

/**
 * @param options - The HTTP options.
 * @returns The HTTP link.
 */
const createHttpLink = (options: HttpOptions): Link => {
  const { url, headers, mode, credentials } = options;

  return {
    name: 'http',

    async execute(ctx: LinkContext): Promise<LinkResult> {
      const { artifact, variables, signal } = ctx.operation;

      const response = await fetch(url, {
        method: 'POST',
        mode,
        credentials,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          query: artifact.source,
          variables,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as LinkResult;
    },
  };
};

export const httpLink = createHttpLink;
