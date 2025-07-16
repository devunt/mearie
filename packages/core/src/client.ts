import type { DocumentNode, Operation } from './types.ts';
import type { Link, LinkContext } from './link.ts';
import { executeLinks } from './link.ts';
import type { Cache } from './cache/cache.ts';

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
  cache?: Cache;
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
  private cache?: Cache;

  /**
   * @param config - The client configuration.
   */
  constructor(config: ClientConfig) {
    this.links = config.links.map((link) => (typeof link === 'function' ? link() : link));
    this.cache = config.cache;
  }

  /**
   * @param document - The query document.
   * @param variables - The query variables.
   * @returns The query result.
   */
  async query<TResult, TVariables = Record<string, never>>(
    document: DocumentNode<TResult, TVariables>,
    variables?: TVariables,
  ): Promise<{ data: TResult }> {
    return { data: {} as TResult };
  }

  /**
   * @param document - The mutation document.
   * @param variables - The mutation variables.
   * @returns The mutation result.
   */
  async mutate<TResult, TVariables = Record<string, never>>(
    document: DocumentNode<TResult, TVariables>,
    variables?: TVariables,
  ): Promise<{ data: TResult }> {
    return { data: {} as TResult };
  }

  /**
   * @param document - The mutation document.
   * @param variables - The mutation variables.
   * @returns The mutation result.
   */
  async mutation<TResult, TVariables = Record<string, never>>(
    document: DocumentNode<TResult, TVariables>,
    variables?: TVariables,
  ): Promise<{ data: TResult }> {
    return { data: {} as TResult };
  }

  /**
   * @param document - The subscription document.
   * @param variables - The subscription variables.
   * @returns An observable of subscription results.
   */
  subscription<TResult, TVariables = Record<string, never>>(
    document: DocumentNode<TResult, TVariables>,
    variables?: TVariables,
  ): Observable<{ data: TResult }> {
    return {
      subscribe: () => ({
        unsubscribe: () => {},
      }),
    };
  }

  /**
   * @param fragment - The fragment document.
   * @param fragmentRef - The fragment reference data.
   * @returns The fragment data.
   */
  readFragment<TResult>(fragment: DocumentNode<TResult>, fragmentRef: TResult): TResult {
    return {} as TResult;
  }

  /**
   * @returns The normalized cache instance.
   */
  getCache(): Cache | undefined {
    return this.cache;
  }
}

/**
 * @param config - The client configuration.
 * @returns A new client instance.
 */
export const createClient = (config: ClientConfig): Client => {
  return new Client(config);
};
