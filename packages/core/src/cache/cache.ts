import type { Artifact, DataOf, FragmentRefs, SchemaMeta, VariablesOf } from '@mearie/shared';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import { stringify } from '../utils.ts';
import {
  makeDependencyKey,
  makeEntityKey,
  makeFieldKeyFromArgs,
  makeMemoKey,
  replaceEqualDeep,
  getFragmentVars,
} from './utils.ts';
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

  #optimisticKeys: string[] = [];
  #optimisticLayers = new Map<string, { storage: Storage; dependencies: Set<DependencyKey> }>();
  #storageView: Storage | null = null;

  constructor(schemaMetadata: SchemaMeta) {
    this.#schemaMeta = schemaMetadata;
  }

  #getStorageView(): Storage {
    if (this.#optimisticKeys.length === 0) {
      return this.#storage;
    }

    if (this.#storageView) {
      return this.#storageView;
    }

    const merged = { ...this.#storage } as Storage;
    for (const storageKey of Object.keys(this.#storage) as StorageKey[]) {
      merged[storageKey] = { ...this.#storage[storageKey] };
    }

    for (const key of this.#optimisticKeys) {
      const layer = this.#optimisticLayers.get(key);
      if (!layer) continue;

      for (const storageKey of Object.keys(layer.storage) as StorageKey[]) {
        merged[storageKey] = merged[storageKey]
          ? { ...merged[storageKey], ...layer.storage[storageKey] }
          : { ...layer.storage[storageKey] };
      }
    }

    this.#storageView = merged;
    return merged;
  }

  /**
   * Writes an optimistic response to a separate cache layer.
   * The optimistic data is immediately visible in reads but does not affect the base storage.
   * @internal
   * @param key - Unique key identifying this optimistic mutation (typically the operation key).
   * @param artifact - GraphQL document artifact.
   * @param variables - Operation variables.
   * @param data - The optimistic response data.
   */
  writeOptimistic<T extends Artifact>(key: string, artifact: T, variables: VariablesOf<T>, data: DataOf<T>): void {
    const layerStorage = { [RootFieldKey]: {} } as Storage;
    const dependencies = new Set<DependencyKey>();

    normalize(
      this.#schemaMeta,
      artifact.selections,
      layerStorage,
      data,
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        dependencies.add(makeDependencyKey(storageKey, fieldKey));
      },
    );

    this.#optimisticKeys.push(key);
    this.#optimisticLayers.set(key, { storage: layerStorage, dependencies });
    this.#storageView = null;

    const subscriptions = new Set<Subscription>();
    for (const depKey of dependencies) {
      const ss = this.#subscriptions.get(depKey);
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
   * Removes an optimistic layer and notifies affected subscribers.
   * @internal
   * @param key - The key of the optimistic layer to remove.
   */
  removeOptimistic(key: string): void {
    const layer = this.#optimisticLayers.get(key);
    if (!layer) return;

    this.#optimisticLayers.delete(key);
    this.#optimisticKeys = this.#optimisticKeys.filter((k) => k !== key);
    this.#storageView = null;

    const subscriptions = new Set<Subscription>();
    for (const depKey of layer.dependencies) {
      const ss = this.#subscriptions.get(depKey);
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

    const storage = this.#getStorageView();
    const { data, partial } = denormalize(
      artifact.selections,
      storage,
      storage[RootFieldKey],
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

    const storageView = this.#getStorageView();
    denormalize(
      artifact.selections,
      storageView,
      storageView[RootFieldKey],
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
    const fragmentVars = getFragmentVars(fragmentRef, artifact.name);

    const storageView = this.#getStorageView();
    const entity = storageView[entityKey];
    if (!entity) {
      return { data: null, stale: false };
    }

    let stale = false;

    const { data, partial } = denormalize(
      artifact.selections,
      storageView,
      { [EntityLinkKey]: entityKey },
      fragmentVars,
      (storageKey, fieldKey) => {
        if (this.#stale.has(storageKey as string) || this.#stale.has(makeDependencyKey(storageKey, fieldKey))) {
          stale = true;
        }
      },
    );

    if (partial) {
      return { data: null, stale: false };
    }

    const argsId = Object.keys(fragmentVars).length > 0 ? entityKey + stringify(fragmentVars) : entityKey;
    const key = makeMemoKey('fragment', artifact.name, argsId);
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
    const fragmentVars = getFragmentVars(fragmentRef, artifact.name);
    const dependencies = new Set<DependencyKey>();

    const storageView = this.#getStorageView();
    denormalize(
      artifact.selections,
      storageView,
      { [EntityLinkKey]: entityKey },
      fragmentVars,
      (storageKey, fieldKey) => {
        const dependencyKey = makeDependencyKey(storageKey, fieldKey);
        dependencies.add(dependencyKey);
      },
    );

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

    const storageView = this.#getStorageView();
    for (const ref of fragmentRefs) {
      const entityKey = (ref as unknown as { [FragmentRefKey]: EntityKey })[FragmentRefKey];
      const fragmentVars = getFragmentVars(ref, artifact.name);
      denormalize(
        artifact.selections,
        storageView,
        { [EntityLinkKey]: entityKey },
        fragmentVars,
        (storageKey, fieldKey) => {
          dependencies.add(makeDependencyKey(storageKey, fieldKey));
        },
      );
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
        if ('$field' in target) {
          const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
          const depKey = makeDependencyKey(RootFieldKey, fieldKey);
          this.#stale.add(depKey);
          this.#collectSubscriptions(RootFieldKey, fieldKey, subscriptions);
        } else {
          this.#stale.add(RootFieldKey as string);
          this.#collectSubscriptions(RootFieldKey, undefined, subscriptions);
        }
      } else {
        const entityMeta = this.#schemaMeta.entities[target.__typename];
        const keyFields = entityMeta?.keyFields;

        if (keyFields && this.#hasKeyFields(target, keyFields)) {
          const keyValues = keyFields.map((f) => (target as Record<string, unknown>)[f] as string | number);
          const entityKey = makeEntityKey(target.__typename, keyValues);

          if ('$field' in target) {
            const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
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
              if ('$field' in target) {
                const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
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
    }

    for (const subscription of subscriptions) {
      void subscription.listener();
    }
  }

  #hasKeyFields(target: Record<string, unknown>, keyFields: string[]): boolean {
    return keyFields.every((f) => f in target);
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
   * Optimistic layers are excluded because they represent transient in-flight state.
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

    this.#storageView = null;
  }

  /**
   * Clears all cache data.
   */
  clear(): void {
    this.#storage = { [RootFieldKey]: {} };
    this.#subscriptions.clear();
    this.#memo.clear();
    this.#stale.clear();
    this.#optimisticKeys = [];
    this.#optimisticLayers.clear();
    this.#storageView = null;
  }
}
