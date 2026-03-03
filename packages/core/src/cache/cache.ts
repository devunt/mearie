import type { Artifact, DataOf, FragmentRefs, SchemaMeta, VariablesOf } from '@mearie/shared';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import {
  makeDependencyKey,
  makeEntityKey,
  makeFieldKeyFromArgs,
  getFragmentVars,
  parseDependencyKey,
} from './utils.ts';
import { RootFieldKey, FragmentRefKey, EntityLinkKey } from './constants.ts';
import type {
  CacheSnapshot,
  DependencyKey,
  EntryTreeNode,
  FieldKey,
  InvalidateTarget,
  Patch,
  QuerySubscription,
  Storage,
  StorageKey,
  SubscriptionEntry,
  EntityKey,
} from './types.ts';
import { buildEntryTree, type EntryTuple } from './tree.ts';
import { generatePatches } from './change.ts';

/**
 * A normalized cache that stores and manages GraphQL query results and entities.
 * Supports entity normalization, cache invalidation, and reactive updates through subscriptions.
 */
export class Cache {
  #schemaMeta: SchemaMeta;
  #storage = { [RootFieldKey]: {} } as Storage;
  #subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
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
    const layerDependencies = new Set<DependencyKey>();

    normalize(
      this.#schemaMeta,
      artifact.selections,
      layerStorage,
      data,
      variables as Record<string, unknown>,
      (storageKey, fieldKey) => {
        layerDependencies.add(makeDependencyKey(storageKey, fieldKey));
      },
    );

    const oldValues = new Map<DependencyKey, unknown>();
    const currentView = this.#getStorageView();
    for (const depKey of layerDependencies) {
      const { storageKey: sk, fieldKey: fk } = this.#parseDepKey(depKey);
      oldValues.set(depKey, currentView[sk]?.[fk]);
    }

    this.#optimisticKeys.push(key);
    this.#optimisticLayers.set(key, { storage: layerStorage, dependencies: layerDependencies });
    this.#storageView = null;

    const newView = this.#getStorageView();
    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>();
    for (const depKey of layerDependencies) {
      const { storageKey: sk, fieldKey: fk } = this.#parseDepKey(depKey);
      const newVal = newView[sk]?.[fk];
      const oldVal = oldValues.get(depKey);
      if (oldVal !== newVal) {
        changedKeys.set(depKey, { oldValue: oldVal, newValue: newVal });
      }
    }

    const patchesBySubscription = generatePatches(changedKeys, this.#subscriptions, newView);
    for (const [subscription, patches] of patchesBySubscription) {
      subscription.listener(patches);
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

    const currentView = this.#getStorageView();
    const oldValues = new Map<DependencyKey, unknown>();
    for (const depKey of layer.dependencies) {
      const { storageKey: sk, fieldKey: fk } = this.#parseDepKey(depKey);
      oldValues.set(depKey, currentView[sk]?.[fk]);
    }

    this.#optimisticLayers.delete(key);
    this.#optimisticKeys = this.#optimisticKeys.filter((k) => k !== key);
    this.#storageView = null;

    const newView = this.#getStorageView();
    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>();
    for (const depKey of layer.dependencies) {
      const { storageKey: sk, fieldKey: fk } = this.#parseDepKey(depKey);
      const newVal = newView[sk]?.[fk];
      const oldVal = oldValues.get(depKey);
      if (oldVal !== newVal) {
        changedKeys.set(depKey, { oldValue: oldVal, newValue: newVal });
      }
    }

    const patchesBySubscription = generatePatches(changedKeys, this.#subscriptions, newView);
    for (const [subscription, patches] of patchesBySubscription) {
      subscription.listener(patches);
    }
  }

  /**
   * Writes a query result to the cache, normalizing entities.
   * In addition to field-level stale clearing, this also clears entity-level stale entries
   * (e.g., `"User:1"`) when any field of that entity is written, because {@link invalidate}
   * supports entity-level invalidation without specifying a field.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @param data - Query result data.
   */
  writeQuery<T extends Artifact>(artifact: T, variables: VariablesOf<T>, data: DataOf<T>): void {
    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>();
    const staleClearedKeys = new Set<DependencyKey>();
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
          staleClearedKeys.add(depKey);
        }

        if (!entityStaleCleared.has(storageKey) && this.#stale.delete(storageKey as string)) {
          entityStaleCleared.add(storageKey);
        }

        if (oldValue !== newValue) {
          changedKeys.set(depKey, { oldValue, newValue });
        }
      },
    );

    const patchesBySubscription = generatePatches(changedKeys, this.#subscriptions, this.#storage);

    for (const [subscription, patches] of patchesBySubscription) {
      subscription.listener(patches);
    }

    const staleOnlySubscriptions = new Set<QuerySubscription>();
    for (const depKey of staleClearedKeys) {
      if (changedKeys.has(depKey)) continue;
      const entries = this.#subscriptions.get(depKey);
      if (entries) {
        for (const entry of entries) {
          if (!patchesBySubscription.has(entry.subscription)) {
            staleOnlySubscriptions.add(entry.subscription);
          }
        }
      }
    }
    for (const entityKey of entityStaleCleared) {
      const prefix = `${entityKey}.`;
      for (const [depKey, entries] of this.#subscriptions) {
        if (depKey.startsWith(prefix)) {
          for (const entry of entries) {
            if (!patchesBySubscription.has(entry.subscription)) {
              staleOnlySubscriptions.add(entry.subscription);
            }
          }
        }
      }
    }
    for (const subscription of staleOnlySubscriptions) {
      subscription.listener(null);
    }
  }

  /**
   * Reads a query result from the cache, denormalizing entities if available.
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

    return { data: data as DataOf<T>, stale };
  }

  /**
   * Subscribes to cache changes for a specific query.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @param listener - Callback function to invoke on cache changes.
   * @returns Object containing initial data, stale status, unsubscribe function, and subscription.
   */
  subscribeQuery<T extends Artifact<'query'>>(
    artifact: T,
    variables: VariablesOf<T>,
    listener: (patches: Patch[] | null) => void,
  ): { data: DataOf<T> | null; stale: boolean; unsubscribe: () => void; subscription: QuerySubscription } {
    let stale = false;
    const tuples: EntryTuple[] = [];

    const storageView = this.#getStorageView();
    const { data, partial } = denormalize(
      artifact.selections,
      storageView,
      storageView[RootFieldKey],
      variables as Record<string, unknown>,
      (storageKey, fieldKey, path, selections) => {
        tuples.push({ storageKey, fieldKey, path, selections });
        if (this.#stale.has(storageKey as string) || this.#stale.has(makeDependencyKey(storageKey, fieldKey))) {
          stale = true;
        }
      },
      { trackFragmentDeps: false },
    );

    const entryTree = buildEntryTree(tuples);

    const subscription: QuerySubscription = {
      listener,
      selections: artifact.selections,
      variables: variables as Record<string, unknown>,
      entryTree,
    };

    for (const tuple of tuples) {
      const depKey = makeDependencyKey(tuple.storageKey, tuple.fieldKey);
      const entry: SubscriptionEntry = {
        path: tuple.path,
        subscription,
      };
      let entrySet = this.#subscriptions.get(depKey);
      if (!entrySet) {
        entrySet = new Set();
        this.#subscriptions.set(depKey, entrySet);
      }
      entrySet.add(entry);
    }

    const unsubscribe = () => {
      this.#removeSubscriptionFromTree(entryTree, subscription);
    };

    return {
      data: partial ? null : (data as DataOf<T>),
      stale,
      unsubscribe,
      subscription,
    };
  }

  /**
   * Reads a fragment from the cache for a specific entity.
   * @param artifact - GraphQL fragment artifact.
   * @param fragmentRef - Fragment reference containing entity key.
   * @returns Denormalized fragment data or null if not found or invalid.
   */
  readFragment<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRef: FragmentRefs<string>,
  ): { data: DataOf<T> | null; stale: boolean } {
    const storageKey = (fragmentRef as unknown as { [FragmentRefKey]: StorageKey })[FragmentRefKey];
    const fragmentVars = getFragmentVars(fragmentRef, artifact.name);

    const storageView = this.#getStorageView();

    let stale = false;

    const value = storageView[storageKey];
    if (!value) {
      return { data: null, stale: false };
    }

    const { data, partial } = denormalize(
      artifact.selections,
      storageView,
      storageKey === RootFieldKey ? value : { [EntityLinkKey]: storageKey },
      fragmentVars,
      (sk, fieldKey) => {
        if (this.#stale.has(sk as string) || this.#stale.has(makeDependencyKey(sk, fieldKey))) {
          stale = true;
        }
      },
    );

    if (partial) {
      return { data: null, stale: false };
    }

    return { data: data as DataOf<T>, stale };
  }

  /**
   * Subscribes to cache changes for a specific fragment.
   * @param artifact - GraphQL fragment artifact.
   * @param fragmentRef - Fragment reference containing entity key.
   * @param listener - Callback function to invoke on cache changes.
   * @returns Object containing initial data, stale status, unsubscribe function, and subscription.
   */
  subscribeFragment<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRef: FragmentRefs<string>,
    listener: (patches: Patch[] | null) => void,
  ): { data: DataOf<T> | null; stale: boolean; unsubscribe: () => void; subscription: QuerySubscription } {
    const storageKey = (fragmentRef as unknown as { [FragmentRefKey]: StorageKey })[FragmentRefKey];
    const fragmentVars = getFragmentVars(fragmentRef, artifact.name);

    const storageView = this.#getStorageView();
    const value = storageKey === RootFieldKey ? storageView[RootFieldKey] : storageView[storageKey];
    if (!value) {
      const entryTree = buildEntryTree([]);
      const subscription: QuerySubscription = {
        listener,
        selections: artifact.selections,
        variables: fragmentVars,
        entryTree,
      };
      return { data: null, stale: false, unsubscribe: () => {}, subscription };
    }

    let stale = false;
    const tuples: EntryTuple[] = [];

    const denormalizeValue = storageKey === RootFieldKey ? value : { [EntityLinkKey]: storageKey };
    const { data, partial } = denormalize(
      artifact.selections,
      storageView,
      denormalizeValue,
      fragmentVars,
      (sk, fieldKey, path, selections) => {
        tuples.push({ storageKey: sk, fieldKey, path, selections });
        if (this.#stale.has(sk as string) || this.#stale.has(makeDependencyKey(sk, fieldKey))) {
          stale = true;
        }
      },
      { trackFragmentDeps: false },
    );
    if (partial) {
      const entryTree = buildEntryTree([]);
      const subscription: QuerySubscription = {
        listener,
        selections: artifact.selections,
        variables: fragmentVars,
        entryTree,
      };
      return { data: null, stale: false, unsubscribe: () => {}, subscription };
    }

    const rootDepKey = storageKey === RootFieldKey ? undefined : (storageKey as unknown as DependencyKey);
    const entryTree = buildEntryTree(tuples, rootDepKey);

    const subscription: QuerySubscription = {
      listener,
      selections: artifact.selections,
      variables: fragmentVars,
      entryTree,
    };

    for (const tuple of tuples) {
      const depKey = makeDependencyKey(tuple.storageKey, tuple.fieldKey);
      const entry: SubscriptionEntry = { path: tuple.path, subscription };
      let entrySet = this.#subscriptions.get(depKey);
      if (!entrySet) {
        entrySet = new Set();
        this.#subscriptions.set(depKey, entrySet);
      }
      entrySet.add(entry);
    }

    const unsubscribe = () => {
      this.#removeSubscriptionFromTree(entryTree, subscription);
    };

    return { data: partial ? null : (data as DataOf<T>), stale, unsubscribe, subscription };
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

    return { data: results, stale };
  }

  subscribeFragments<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRefs: FragmentRefs<string>[],
    listener: (patches: Patch[] | null) => void,
  ): () => void {
    const unsubscribes: (() => void)[] = [];

    for (const ref of fragmentRefs) {
      const { unsubscribe } = this.subscribeFragment(artifact, ref, listener);
      unsubscribes.push(unsubscribe);
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  }

  /**
   * Invalidates one or more cache entries and notifies affected subscribers.
   * @param targets - Cache entries to invalidate.
   */
  invalidate(...targets: InvalidateTarget[]): void {
    const affectedSubscriptions = new Set<QuerySubscription>();

    for (const target of targets) {
      if (target.__typename === 'Query') {
        if ('$field' in target) {
          const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
          const depKey = makeDependencyKey(RootFieldKey, fieldKey);
          this.#stale.add(depKey);
          this.#collectSubscriptions(RootFieldKey, fieldKey, affectedSubscriptions);
        } else {
          this.#stale.add(RootFieldKey as string);
          this.#collectSubscriptions(RootFieldKey, undefined, affectedSubscriptions);
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
            this.#collectSubscriptions(entityKey, fieldKey, affectedSubscriptions);
          } else {
            this.#stale.add(entityKey);
            this.#collectSubscriptions(entityKey, undefined, affectedSubscriptions);
          }
        } else {
          const prefix = `${target.__typename}:`;
          for (const key of Object.keys(this.#storage)) {
            if (key.startsWith(prefix)) {
              const entityKey = key as EntityKey;
              if ('$field' in target) {
                const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
                this.#stale.add(makeDependencyKey(entityKey, fieldKey));
                this.#collectSubscriptions(entityKey, fieldKey, affectedSubscriptions);
              } else {
                this.#stale.add(entityKey);
                this.#collectSubscriptions(entityKey, undefined, affectedSubscriptions);
              }
            }
          }
        }
      }
    }

    for (const subscription of affectedSubscriptions) {
      subscription.listener(null);
    }
  }

  /**
   * Checks if a subscription has stale data.
   * @internal
   */
  isStale(subscription: QuerySubscription): boolean {
    const check = (node: EntryTreeNode): boolean => {
      if (node.depKey.includes('@')) {
        const { storageKey } = parseDependencyKey(node.depKey);
        if (this.#stale.has(storageKey as string) || this.#stale.has(node.depKey)) return true;
      }
      for (const child of node.children.values()) {
        if (check(child)) return true;
      }
      return false;
    };
    return check(subscription.entryTree);
  }

  #hasKeyFields(target: Record<string, unknown>, keyFields: string[]): boolean {
    return keyFields.every((f) => f in target);
  }

  #collectSubscriptions(storageKey: StorageKey, fieldKey: FieldKey | undefined, out: Set<QuerySubscription>): void {
    if (fieldKey === undefined) {
      const prefix = `${storageKey}.`;
      for (const [depKey, entries] of this.#subscriptions) {
        if (depKey.startsWith(prefix)) {
          for (const entry of entries) {
            out.add(entry.subscription);
          }
        }
      }
    } else {
      const depKey = makeDependencyKey(storageKey, fieldKey);
      const entries = this.#subscriptions.get(depKey);
      if (entries) {
        for (const entry of entries) {
          out.add(entry.subscription);
        }
      }
    }
  }

  #removeSubscriptionFromTree(node: EntryTreeNode, subscription: QuerySubscription): void {
    const entries = this.#subscriptions.get(node.depKey);
    if (entries) {
      for (const entry of entries) {
        if (entry.subscription === subscription) {
          entries.delete(entry);
          break;
        }
      }
      if (entries.size === 0) {
        this.#subscriptions.delete(node.depKey);
      }
    }
    for (const child of node.children.values()) {
      this.#removeSubscriptionFromTree(child, subscription);
    }
  }

  #parseDepKey(depKey: DependencyKey): { storageKey: StorageKey; fieldKey: FieldKey } {
    return parseDependencyKey(depKey);
  }

  /**
   * Extracts a serializable snapshot of the cache storage.
   * Optimistic layers are excluded because they represent transient in-flight state.
   */
  extract(): CacheSnapshot {
    return { storage: structuredClone(this.#storage) } as unknown as CacheSnapshot;
  }

  /**
   * Hydrates the cache with a previously extracted snapshot.
   */
  hydrate(snapshot: CacheSnapshot): void {
    const { storage } = snapshot as unknown as { storage: Record<string, Record<string, unknown>> };

    for (const [key, fields] of Object.entries(storage)) {
      this.#storage[key as StorageKey] = { ...this.#storage[key as StorageKey], ...fields };
    }

    this.#storageView = null;
  }

  /**
   * Clears all cache data.
   */
  clear(): void {
    this.#storage = { [RootFieldKey]: {} };
    this.#subscriptions.clear();
    this.#stale.clear();
    this.#optimisticKeys = [];
    this.#optimisticLayers.clear();
    this.#storageView = null;
  }
}
