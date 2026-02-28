import type { Artifact, DataOf, FragmentRefs, SchemaMeta, VariablesOf } from '@mearie/shared';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import { stringify } from '../utils.ts';
import { makeDependencyKey, makeFieldKeyFromArgs, makeMemoKey, replaceEqualDeep, resolveEntityKey } from './utils.ts';
import { RootFieldKey, FragmentRefKey, EntityLinkKey } from './constants.ts';
import type {
  CacheSnapshot,
  DependencyKey,
  FieldKey,
  InvalidateTarget,
  Storage,
  StorageKey,
  Listener,
  EntityKey,
  Subscription,
} from './types.ts';

/**
 * A normalized cache that stores and manages GraphQL query results and entities.
 * Supports entity normalization, cache invalidation, and reactive updates through subscriptions.
 */
export class Cache {
  #schemaMeta: SchemaMeta;
  #storage = { [RootFieldKey]: {} } as Storage;
  #subscriptions = new Map<DependencyKey, Set<Subscription>>();
  #memo = new Map<string, unknown>();
  #stale = new Set<string>();

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
    const entityStaleCleared = new Set<StorageKey>();

    normalize(
      this.#schemaMeta,
      artifact.selections,
      this.#storage,
      data,
      variables as Record<string, unknown>,
      (storageKey, fieldKey, oldValue, newValue) => {
        const depKey = makeDependencyKey(storageKey, fieldKey);

        if (this.#stale.delete(depKey)) {
          dependencies.add(depKey);
        }

        if (!entityStaleCleared.has(storageKey) && this.#stale.delete(storageKey as string)) {
          entityStaleCleared.add(storageKey);
        }

        if (oldValue !== newValue) {
          dependencies.add(depKey);
        }
      },
    );

    for (const entityKey of entityStaleCleared) {
      this.#collectSubscriptions(entityKey, undefined, subscriptions);
    }

    for (const dependency of dependencies) {
      const ss = this.#subscriptions.get(dependency);
      if (ss) {
        for (const s of ss) {
          subscriptions.add(s);
        }
      }
    }

    for (const subscription of subscriptions) {
      void subscription.listener();
    }
  }

  /**
   * Reads a query result from the cache, denormalizing entities if available.
   * Uses structural sharing to preserve referential identity for unchanged subtrees.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @returns Denormalized query result or null if not found.
   */
  readQuery<T extends Artifact<'query'>>(
    artifact: T,
    variables: VariablesOf<T>,
  ): { data: DataOf<T> | null; stale: boolean } {
    let stale = false;

    const { data, partial } = denormalize(
      artifact.selections,
      this.#storage,
      this.#storage[RootFieldKey],
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        if (this.#stale.has(storageKey as string) || this.#stale.has(makeDependencyKey(storageKey, fieldKey))) {
          stale = true;
        }
      },
    );

    if (partial) {
      return { data: null, stale: false };
    }

    const key = makeMemoKey('query', artifact.name, stringify(variables as Record<string, unknown>));
    const prev = this.#memo.get(key);
    const result = prev === undefined ? data : replaceEqualDeep(prev, data);
    this.#memo.set(key, result);

    return { data: result as DataOf<T>, stale };
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
   * Uses structural sharing to preserve referential identity for unchanged subtrees.
   * @param artifact - GraphQL fragment artifact.
   * @param fragmentRef - Fragment reference containing entity key.
   * @returns Denormalized fragment data or null if not found or invalid.
   */
  readFragment<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRef: FragmentRefs<string>,
  ): { data: DataOf<T> | null; stale: boolean } {
    const entityKey = (fragmentRef as unknown as { [FragmentRefKey]: EntityKey })[FragmentRefKey];

    const entity = this.#storage[entityKey];
    if (!entity) {
      return { data: null, stale: false };
    }

    let stale = false;

    const { data, partial } = denormalize(
      artifact.selections,
      this.#storage,
      { [EntityLinkKey]: entityKey },
      {},
      (storageKey, fieldKey) => {
        if (this.#stale.has(storageKey as string) || this.#stale.has(makeDependencyKey(storageKey, fieldKey))) {
          stale = true;
        }
      },
    );

    if (partial) {
      return { data: null, stale: false };
    }

    const key = makeMemoKey('fragment', artifact.name, entityKey);
    const prev = this.#memo.get(key);
    const result = prev === undefined ? data : replaceEqualDeep(prev, data);
    this.#memo.set(key, result);

    return { data: result as DataOf<T>, stale };
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

  readFragments<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRefs: FragmentRefs<string>[],
  ): { data: DataOf<T>[] | null; stale: boolean } {
    const results: DataOf<T>[] = [];
    let stale = false;

    for (const ref of fragmentRefs) {
      const result = this.readFragment(artifact, ref);
      if (result.data === null) {
        return { data: null, stale: false };
      }
      if (result.stale) {
        stale = true;
      }
      results.push(result.data);
    }

    const entityKeys = fragmentRefs.map((ref) => (ref as unknown as { [FragmentRefKey]: EntityKey })[FragmentRefKey]);
    const key = makeMemoKey('fragments', artifact.name, entityKeys.join(','));
    const prev = this.#memo.get(key) as DataOf<T>[] | undefined;
    const result = prev === undefined ? results : (replaceEqualDeep(prev, results) as DataOf<T>[]);
    this.#memo.set(key, result);

    return { data: result, stale };
  }

  subscribeFragments<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRefs: FragmentRefs<string>[],
    listener: Listener,
  ): () => void {
    const dependencies = new Set<DependencyKey>();

    for (const ref of fragmentRefs) {
      const entityKey = (ref as unknown as { [FragmentRefKey]: EntityKey })[FragmentRefKey];
      denormalize(artifact.selections, this.#storage, { [EntityLinkKey]: entityKey }, {}, (storageKey, fieldKey) => {
        dependencies.add(makeDependencyKey(storageKey, fieldKey));
      });
    }

    return this.#subscribe(dependencies, listener);
  }

  /**
   * Invalidates one or more cache entries and notifies affected subscribers.
   * @param targets - Cache entries to invalidate.
   */
  invalidate(...targets: InvalidateTarget[]): void {
    const subscriptions = new Set<Subscription>();

    for (const target of targets) {
      if (target.__typename === 'Query') {
        if ('field' in target) {
          const fieldKey = makeFieldKeyFromArgs(target.field, target.args);
          const depKey = makeDependencyKey(RootFieldKey, fieldKey);
          this.#stale.add(depKey);
          this.#collectSubscriptions(RootFieldKey, fieldKey, subscriptions);
        } else {
          this.#stale.add(RootFieldKey as string);
          this.#collectSubscriptions(RootFieldKey, undefined, subscriptions);
        }
      } else if ('id' in target) {
        const entityKey = resolveEntityKey(
          target.__typename,
          target.id,
          this.#schemaMeta.entities[target.__typename]?.keyFields,
        );
        if ('field' in target) {
          const fieldKey = makeFieldKeyFromArgs(target.field, target.args);
          this.#stale.add(makeDependencyKey(entityKey, fieldKey));
          this.#collectSubscriptions(entityKey, fieldKey, subscriptions);
        } else {
          this.#stale.add(entityKey);
          this.#collectSubscriptions(entityKey, undefined, subscriptions);
        }
      } else {
        const prefix = `${target.__typename}:`;
        for (const key of Object.keys(this.#storage)) {
          if (key.startsWith(prefix)) {
            const entityKey = key as EntityKey;
            if ('field' in target) {
              const fieldKey = makeFieldKeyFromArgs(target.field, target.args);
              this.#stale.add(makeDependencyKey(entityKey, fieldKey));
              this.#collectSubscriptions(entityKey, fieldKey, subscriptions);
            } else {
              this.#stale.add(entityKey);
              this.#collectSubscriptions(entityKey, undefined, subscriptions);
            }
          }
        }
      }
    }

    for (const subscription of subscriptions) {
      void subscription.listener();
    }
  }

  #collectSubscriptions(storageKey: StorageKey, fieldKey: FieldKey | undefined, out: Set<Subscription>): void {
    if (fieldKey === undefined) {
      const prefix = `${storageKey}.`;
      for (const [depKey, ss] of this.#subscriptions) {
        if (depKey.startsWith(prefix)) {
          for (const s of ss) {
            out.add(s);
          }
        }
      }
    } else {
      const depKey = makeDependencyKey(storageKey, fieldKey);
      const ss = this.#subscriptions.get(depKey);
      if (ss) {
        for (const s of ss) {
          out.add(s);
        }
      }
    }
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
   * Extracts a serializable snapshot of the cache storage and structural sharing state.
   */
  extract(): CacheSnapshot {
    return {
      storage: structuredClone(this.#storage),
      memo: Object.fromEntries(this.#memo),
    } as unknown as CacheSnapshot;
  }

  /**
   * Hydrates the cache with a previously extracted snapshot.
   */
  hydrate(snapshot: CacheSnapshot): void {
    const { storage, memo } = snapshot as unknown as {
      storage: Record<string, Record<string, unknown>>;
      memo: Record<string, unknown>;
    };

    for (const [key, fields] of Object.entries(storage)) {
      this.#storage[key as StorageKey] = { ...this.#storage[key as StorageKey], ...fields };
    }

    for (const [key, value] of Object.entries(memo)) {
      this.#memo.set(key, value);
    }
  }

  /**
   * Clears all cache data.
   */
  clear(): void {
    this.#storage = { [RootFieldKey]: {} };
    this.#subscriptions.clear();
    this.#memo.clear();
    this.#stale.clear();
  }
}
