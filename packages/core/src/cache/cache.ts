import type { Artifact, DataOf, VariablesOf } from '@mearie/shared';
import type { SchemaMeta } from '../types.ts';
import { hashString } from '../utils.ts';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import { makeFieldKey, makeQueryKey, makeDependencyKey, extractFieldPaths } from './utils.ts';
import { EntityLinkKey, RootFieldKey, FragmentRefKey } from './constants.ts';
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
    const affectedKeys = new Set<QueryKey>();

    normalize(
      result,
      document.selections,
      this.#schemaMetadata,
      this.#storage,
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        this.#trackDependency(queryKey, storageKey, fieldKey);
        const dependencyKey = makeDependencyKey(storageKey, fieldKey);
        const dependentQueries = this.#dependencies.get(dependencyKey);
        if (dependentQueries) {
          for (const key of dependentQueries) {
            affectedKeys.add(key);
          }
        }
      },
    );

    for (const key of affectedKeys) {
      this.#notifyListeners(key);
    }
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
   * Only Field selections are evicted from the root. FragmentSpread and InlineFragment
   * selections are not directly stored at the root level, so they are skipped.
   * @param document - GraphQL document artifact.
   * @param variables - Query variables.
   */
  evictQuery<T extends Artifact>(document: T, variables: VariablesOf<T>): void {
    const queryKey = makeQueryKey(hashString(document.source), variables);
    const queryRoot = this.#storage.get(RootFieldKey);

    if (queryRoot) {
      for (const selection of document.selections) {
        if (selection.kind === 'Field') {
          const fieldKey = makeFieldKey(selection, variables as Record<string, unknown>);
          delete queryRoot[fieldKey];
        }
      }
    }

    this.#notifyListeners(queryKey);
  }

  /**
   * Reads a fragment from the cache for a specific entity.
   * Returns null for invalid or missing fragment references, making it safe for
   * defensive reads. For subscriptions, use subscribeFragment which throws errors.
   * @param document - GraphQL fragment artifact.
   * @param fragmentRef - Fragment reference containing entity key.
   * @param variables - Fragment variables.
   * @returns Denormalized fragment data or null if not found or invalid.
   */
  readFragment<T extends Artifact>(document: T, fragmentRef: unknown, variables: VariablesOf<T>): DataOf<T> | null {
    if (!fragmentRef || typeof fragmentRef !== 'object') {
      return null;
    }

    const ref = fragmentRef as Record<string, unknown>;
    const entityKey = ref[EntityLinkKey];

    if (typeof entityKey !== 'string') {
      return null;
    }

    const entity = this.#storage.get(entityKey as StorageKey);
    if (!entity) {
      return null;
    }

    const result: Record<string, unknown> = {};

    for (const selection of document.selections) {
      if (selection.kind === 'Field') {
        const fieldKey = makeFieldKey(selection, variables as Record<string, unknown>);
        const responseKey = selection.alias ?? selection.name;
        const fieldValue = entity[fieldKey];

        if (fieldValue !== undefined) {
          result[responseKey] = fieldValue;
        }
      }
    }

    return Object.keys(result).length === 0 ? null : (result as DataOf<T>);
  }

  /**
   * Subscribes to fragment field changes.
   * Throws errors for invalid fragment references to catch programming errors early.
   * For defensive reads that handle missing data gracefully, use readFragment instead.
   * @param document - Fragment document artifact.
   * @param fragmentRef - Fragment reference containing entity key.
   * @param variables - Fragment variables.
   * @param callback - Callback function to invoke on cache invalidation.
   * @returns Unsubscribe function.
   * @throws Error if fragmentRef is invalid or missing entity key.
   */
  subscribeFragment<T extends Artifact>(
    document: T,
    fragmentRef: unknown,
    variables: VariablesOf<T>,
    callback: CacheListener,
  ): () => void {
    if (!fragmentRef || typeof fragmentRef !== 'object') {
      throw new Error('Fragment reference must be an object');
    }

    const ref = fragmentRef as Record<string, unknown>;
    const entityKey = ref[FragmentRefKey];

    if (typeof entityKey !== 'string') {
      throw new Error('Fragment reference missing entity key');
    }

    const queryKey = makeQueryKey(hashString(document.source), { entityKey, variables });

    let listeners = this.#listeners.get(queryKey);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(queryKey, listeners);
    }

    listeners.add(callback);

    const fieldPaths = extractFieldPaths(
      document.selections,
      entityKey as StorageKey,
      variables as Record<string, unknown>,
    );

    for (const path of fieldPaths) {
      let queryKeys = this.#dependencies.get(path);
      if (!queryKeys) {
        queryKeys = new Set();
        this.#dependencies.set(path, queryKeys);
      }
      queryKeys.add(queryKey);
    }

    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.#listeners.delete(queryKey);

        for (const path of fieldPaths) {
          const queryKeys = this.#dependencies.get(path);
          queryKeys?.delete(queryKey);
          if (queryKeys?.size === 0) {
            this.#dependencies.delete(path);
          }
        }
      }
    };
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
