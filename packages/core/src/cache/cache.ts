import type { Artifact, DataOf, VariablesOf } from '@mearie/shared';
import type { SchemaMeta } from '../types.ts';
import { hashString } from '../utils.ts';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import { makeFieldKey, makeQueryKey, makeDependencyKey } from './utils.ts';
import { RootFieldKey } from './constants.ts';
import type { StorageKey, QueryKey, DependencyKey, FieldKey, Fields } from './types.ts';

export type CacheListener = () => void;

/**
 * A normalized cache that stores and manages GraphQL query results and entities.
 * Supports entity normalization, cache invalidation, and reactive updates through subscriptions.
 */
export class Cache {
  #storage = new Map<StorageKey, Fields>();
  #dependencies = new Map<DependencyKey, Set<QueryKey>>();
  #listeners = new Map<QueryKey, Set<CacheListener>>();
  #schemaMetadata: SchemaMeta;

  constructor(schemaMetadata: SchemaMeta) {
    this.#schemaMetadata = schemaMetadata;
  }

  /**
   * Writes a query result to the cache, normalizing entities and tracking dependencies.
   * @param document - GraphQL document artifact.
   * @param variables - Query variables.
   * @param result - Query result data.
   */
  writeQuery<T extends Artifact>(document: T, variables: VariablesOf<T>, result: DataOf<T>): void {
    const queryKey = makeQueryKey(hashString(document.source), variables);

    normalize(
      result,
      document.selections,
      this.#schemaMetadata,
      this.#storage,
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        this.#trackDependency(queryKey, storageKey, fieldKey);
      },
    );

    this.#notifyListeners(queryKey);
  }

  /**
   * Reads a query result from the cache, denormalizing entities if available.
   * @param document - GraphQL document artifact.
   * @param variables - Query variables.
   * @returns Denormalized query result or null if not found.
   */
  readQuery<T extends Artifact>(document: T, variables: VariablesOf<T>): DataOf<T> | null {
    return denormalize(document.selections, this.#storage, variables as Record<string, unknown>) as DataOf<T> | null;
  }

  /**
   * Subscribes to cache invalidations for a specific query.
   * @param document - GraphQL document artifact.
   * @param variables - Query variables.
   * @param callback - Callback function to invoke on cache invalidation.
   * @returns Unsubscribe function.
   */
  subscribe<T extends Artifact>(document: T, variables: VariablesOf<T>, callback: CacheListener): () => void {
    const queryKey = makeQueryKey(hashString(document.source), variables);

    let listeners = this.#listeners.get(queryKey);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(queryKey, listeners);
    }

    listeners.add(callback);

    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.#listeners.delete(queryKey);
      }
    };
  }

  /**
   * Evicts a query from the cache and notifies listeners.
   * @param document - GraphQL document artifact.
   * @param variables - Query variables.
   */
  evictQuery<T extends Artifact>(document: T, variables: VariablesOf<T>): void {
    const queryKey = makeQueryKey(hashString(document.source), variables);
    const queryRoot = this.#storage.get(RootFieldKey);

    if (queryRoot) {
      for (const selection of document.selections) {
        const fieldKey = makeFieldKey(selection, variables as Record<string, unknown>);
        delete queryRoot[fieldKey];
      }
    }

    this.#notifyListeners(queryKey);
  }

  /**
   * Clears all cache data.
   */
  clear(): void {
    this.#storage.clear();
    this.#dependencies.clear();
    this.#listeners.clear();
  }

  /**
   * Tracks dependency between a query and a storage field.
   * @param queryKey - Query key to track.
   * @param storageKey - Storage key (entity or root).
   * @param fieldKey - Field key.
   */
  #trackDependency(queryKey: QueryKey, storageKey: StorageKey, fieldKey: FieldKey): void {
    const dependencyKey = makeDependencyKey(storageKey, fieldKey);

    let queryKeys = this.#dependencies.get(dependencyKey);
    if (!queryKeys) {
      queryKeys = new Set();
      this.#dependencies.set(dependencyKey, queryKeys);
    }
    queryKeys.add(queryKey);
  }

  /**
   * Notifies all listeners subscribed to a query.
   * @param queryKey - Query key to notify listeners for.
   */
  #notifyListeners(queryKey: QueryKey): void {
    const listeners = this.#listeners.get(queryKey);
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }
}
