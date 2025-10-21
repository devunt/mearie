import type { Link, LinkContext, LinkResult } from '../link.ts';

export type HttpOptions = {
  url: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
};

/**
 * @param options - The HTTP options.
 * @returns The HTTP link.
 */
const createHttpLink = (options: HttpOptions): Link => {
  const { url, credentials = 'same-origin', headers = {} } = options;

  return {
    name: 'http',

    async execute(ctx: LinkContext): Promise<LinkResult> {
      const { artifact, variables, headers: operationHeaders } = ctx.operation;

      const response = await fetch(url, {
        method: 'POST',
        credentials,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...operationHeaders,
        },
        body: JSON.stringify({
          query: artifact.source,
          variables,
        }),
        signal: ctx.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<LinkResult>;
    },
  };
};

export const httpLink = createHttpLink;
