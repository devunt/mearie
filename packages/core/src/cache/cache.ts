import type { Artifact, DataOf, FragmentRefs, VariablesOf } from '@mearie/shared';
import type { SchemaMeta } from '../types.ts';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import { makeDependencyKey } from './utils.ts';
import { RootFieldKey, FragmentRefKey, EntityLinkKey } from './constants.ts';
import type { DependencyKey, Storage, Listener, EntityKey, Subscription } from './types.ts';

/**
 * A normalized cache that stores and manages GraphQL query results and entities.
 * Supports entity normalization, cache invalidation, and reactive updates through subscriptions.
 */
export class Cache {
  #schemaMeta: SchemaMeta;
  #storage = { [RootFieldKey]: {} } as Storage;
  #subscriptions = new Map<DependencyKey, Set<Subscription>>();

  constructor(schemaMetadata: SchemaMeta) {
    this.#schemaMeta = schemaMetadata;
  }

  /**
   * Writes a query result to the cache, normalizing entities.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @param data - Query result data.
   */
  writeQuery<T extends Artifact>(artifact: T, variables: VariablesOf<T>, data: DataOf<T>): void {
    const dependencies = new Set<DependencyKey>();
    const subscriptions = new Set<Subscription>();

    normalize(
      this.#schemaMeta,
      artifact.selections,
      this.#storage,
      data,
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        const dependencyKey = makeDependencyKey(storageKey, fieldKey);
        dependencies.add(dependencyKey);
      },
    );

    for (const dependency of dependencies) {
      const ss = this.#subscriptions.get(dependency);
      if (ss) {
        for (const s of ss) {
          subscriptions.add(s);
        }
      }
    }

    for (const subscription of subscriptions) {
      subscription.listener();
    }
  }

  /**
   * Reads a query result from the cache, denormalizing entities if available.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @returns Denormalized query result or null if not found.
   */
  readQuery<T extends Artifact<'query'>>(artifact: T, variables: VariablesOf<T>): DataOf<T> | null {
    const { data, partial } = denormalize(
      artifact.selections,
      this.#storage,
      this.#storage[RootFieldKey],
      variables as Record<string, unknown>,
    );

    return partial ? null : (data as DataOf<T>);
  }

  /**
   * Subscribes to cache invalidations for a specific query.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @param listener - Callback function to invoke on cache invalidation.
   * @returns Unsubscribe function.
   */
  subscribeQuery<T extends Artifact<'query'>>(artifact: T, variables: VariablesOf<T>, listener: Listener): () => void {
    const dependencies = new Set<DependencyKey>();

    denormalize(
      artifact.selections,
      this.#storage,
      this.#storage[RootFieldKey],
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        const dependencyKey = makeDependencyKey(storageKey, fieldKey);
        dependencies.add(dependencyKey);
      },
    );

    return this.#subscribe(dependencies, listener);
  }

  /**
   * Reads a fragment from the cache for a specific entity.
   * Returns null for invalid or missing fragment references, making it safe for
   * defensive reads. For subscriptions, use subscribeFragment which throws errors.
   * @param artifact - GraphQL fragment artifact.
   * @param fragmentRef - Fragment reference containing entity key.
   * @returns Denormalized fragment data or null if not found or invalid.
   */
  readFragment<T extends Artifact<'fragment'>>(artifact: T, fragmentRef: FragmentRefs<string>): DataOf<T> | null {
    const entityKey = (fragmentRef as unknown as { [FragmentRefKey]: EntityKey })[FragmentRefKey];

    const entity = this.#storage[entityKey];
    if (!entity) {
      return null;
    }

    const { data, partial } = denormalize(artifact.selections, this.#storage, { [EntityLinkKey]: entityKey }, {});

    return partial ? null : (data as DataOf<T>);
  }

  subscribeFragment<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRef: FragmentRefs<string>,
    listener: Listener,
  ): () => void {
    const entityKey = (fragmentRef as unknown as { [FragmentRefKey]: EntityKey })[FragmentRefKey];
    const dependencies = new Set<DependencyKey>();

    denormalize(artifact.selections, this.#storage, { [EntityLinkKey]: entityKey }, {}, (storageKey, fieldKey) => {
      const dependencyKey = makeDependencyKey(storageKey, fieldKey);
      dependencies.add(dependencyKey);
    });

    return this.#subscribe(dependencies, listener);
  }

  #subscribe(dependencies: Set<DependencyKey>, listener: Listener): () => void {
    const subscription = { listener };

    for (const dependency of dependencies) {
      const subscriptions = this.#subscriptions.get(dependency) ?? new Set();
      subscriptions.add(subscription);
      this.#subscriptions.set(dependency, subscriptions);
    }

    return () => {
      for (const dependency of dependencies) {
        const subscriptions = this.#subscriptions.get(dependency);
        subscriptions?.delete(subscription);
        if (subscriptions?.size === 0) {
          this.#subscriptions.delete(dependency);
        }
      }
    };
  }

  /**
   * Clears all cache data.
   */
  clear(): void {
    this.#storage = { [RootFieldKey]: {} };
    this.#subscriptions.clear();
  }
}
