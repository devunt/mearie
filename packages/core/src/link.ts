import type { Operation, MaybePromise } from './types.ts';

export type GraphQLError = {
  message: string;
  path?: readonly (string | number)[];
  locations?: readonly { line: number; column: number }[];
  extensions?: Record<string, unknown>;
};

export type LinkContext = {
  operation: Operation;
  signal?: AbortSignal;
  metadata: Map<string, unknown>;
};

export type LinkResult<T = unknown> = {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
};

export type NextFn = () => Promise<LinkResult>;

export type Link = {
  name: string;
  execute(ctx: LinkContext, next: NextFn): Promise<LinkResult>;
};

/**
 * @param links - The chain of links to execute.
 * @param ctx - The link context.
 * @param finalHandler - The final handler function.
 * @returns The link result.
 */
export const executeLinks = (
  links: Link[],
  ctx: LinkContext,
  finalHandler: (ctx: LinkContext) => MaybePromise<LinkResult>,
): Promise<LinkResult> => {
  let index = 0;

  const dispatch = async (): Promise<LinkResult> => {
    if (index >= links.length) {
      return await finalHandler(ctx);
    }

    const link = links[index++];
    if (!link) {
      throw new Error('Link is undefined');
    }
    return link.execute(ctx, dispatch);
  };

  return dispatch();
};
