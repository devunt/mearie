import type { Artifact } from '@mearie/shared';
import type { Operation } from './types.ts';
import type { Link, LinkContext } from './link.ts';
import { executeLinks } from './link.ts';

export type QueryOptions<TVariables> = {
  variables?: TVariables;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type MutationOptions<TVariables> = {
  variables?: TVariables;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type ClientConfig = {
  links: (Link | (() => Link))[];
};

export type Observable<T> = {
  subscribe(observer: { next?: (value: T) => void; error?: (error: Error) => void; complete?: () => void }): {
    unsubscribe?: () => void;
  };
};

/**
 * GraphQL client for executing queries and mutations.
 */
export class Client {
  private links: Link[];

  /**
   * @param config - The client configuration.
   */
  constructor(config: ClientConfig) {
    this.links = config.links.map((link) => (typeof link === 'function' ? link() : link));
  }

  /**
   * @param document - The query document artifact.
   * @param variables - The query variables.
   * @param options - Query options.
   * @returns The query result.
   */
  async query<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
    options?: QueryOptions<TVariables>,
  ): Promise<{ data: TResult; errors?: import('./link.ts').GraphQLError[] }> {
    const operation: Operation<Artifact<'query'>> = {
      kind: 'query',
      artifact: document as Artifact<'query'>,
      variables,
      signal: options?.signal,
      headers: options?.headers,
    };

    const ctx: LinkContext = {
      operation,
      signal: options?.signal,
      metadata: new Map(),
    };

    const result = await executeLinks(this.links, ctx, () => {
      throw new Error('No terminating link found in the chain');
    });

    return { data: result.data as TResult, errors: result.errors };
  }

  /**
   * @param document - The mutation document artifact.
   * @param variables - The mutation variables.
   * @param options - Mutation options.
   * @returns The mutation result.
   */
  async mutate<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
    options?: MutationOptions<TVariables>,
  ): Promise<{ data: TResult; errors?: import('./link.ts').GraphQLError[] }> {
    const operation: Operation<Artifact<'mutation'>> = {
      kind: 'mutation',
      artifact: document as Artifact<'mutation'>,
      variables,
      signal: options?.signal,
      headers: options?.headers,
    };

    const ctx: LinkContext = {
      operation,
      signal: options?.signal,
      metadata: new Map(),
    };

    const result = await executeLinks(this.links, ctx, () => {
      throw new Error('No terminating link found in the chain');
    });

    return { data: result.data as TResult, errors: result.errors };
  }

  /**
   * @param document - The mutation document artifact.
   * @param variables - The mutation variables.
   * @param options - Mutation options.
   * @returns The mutation result.
   */
  async mutation<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
    options?: MutationOptions<TVariables>,
  ): Promise<{ data: TResult; errors?: import('./link.ts').GraphQLError[] }> {
    return this.mutate<TResult, TVariables>(document, variables, options);
  }

  /**
   * @param document - The subscription document artifact.
   * @param variables - The subscription variables.
   * @returns An observable of subscription results.
   */
  subscription<TResult, TVariables = Record<string, never>>(
    document: Artifact,
    variables?: TVariables,
  ): Observable<{ data: TResult }> {
    return {
      subscribe: () => ({
        unsubscribe: () => {},
      }),
    };
  }

  /**
   * @param name - The name of the link to find.
   * @returns The link instance if found.
   */
  getLink<T extends Link>(name: string): T | undefined {
    return this.links.find((link) => link.name === name) as T | undefined;
  }
}

/**
 * @param config - The client configuration.
 * @returns A new client instance.
 */
export const createClient = (config: ClientConfig): Client => {
  return new Client(config);
};
