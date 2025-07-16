import type { Link, LinkContext, NextFn, LinkResult } from '../link.ts';

export type AuthOptions = {
  getToken: () => string | null | Promise<string | null>;
  refreshToken?: () => Promise<string>;
  header?: string;
};

/**
 * @param options - The authentication options.
 * @returns The authentication link.
 */
const createAuthLink = (options: AuthOptions): Link => {
  const { getToken, refreshToken, header = 'Authorization' } = options;

  return {
    name: 'auth',

    async execute(ctx: LinkContext, next: NextFn): Promise<LinkResult> {
      const token = await getToken();

      if (token) {
        ctx.operation.headers = {
          ...ctx.operation.headers,
          [header]: `Bearer ${token}`,
        };
      }

      try {
        return await next();
      } catch (error: unknown) {
        if (
          refreshToken &&
          typeof error === 'object' &&
          error !== null &&
          'response' in error &&
          typeof error.response === 'object' &&
          error.response !== null &&
          'status' in error.response &&
          error.response.status === 401
        ) {
          const newToken = await refreshToken();

          ctx.operation.headers = {
            ...ctx.operation.headers,
            [header]: `Bearer ${newToken}`,
          };

          return next();
        }

        throw error;
      }
    },
  };
};

export const authLink = createAuthLink;
