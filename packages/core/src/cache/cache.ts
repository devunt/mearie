import type { Artifact, DataOf, FragmentRefs, SchemaMeta, VariablesOf } from '@mearie/shared';
import { normalize } from './normalize.ts';
import { denormalize } from './denormalize.ts';
import {
  makeDependencyKey,
  makeEntityKey,
  makeFieldKeyFromArgs,
  getFragmentVars,
  parseDependencyKey,
  isEqual,
  mergeFields,
} from './utils.ts';
import { RootFieldKey, FragmentRefKey, EntityLinkKey } from './constants.ts';
import type {
  CacheNotification,
  CacheSnapshot,
  DependencyKey,
  FieldChange,
  FieldKey,
  FieldValue,
  InvalidateTarget,
  Patch,
  StalledInfo,
  Storage,
  StorageKey,
  Subscription,
  EntityKey,
} from './types.ts';
import { CursorRegistry, traceSelections } from './cursor.ts';
import { classifyChanges, processScalarChanges, processStructuralChanges, buildEntityArrayContext } from './change.ts';
import { diffSnapshots } from './diff.ts';
import { OptimisticStack } from './optimistic.ts';
import { applyPatchesImmutable } from './patch.ts';

/**
 * A normalized cache that stores and manages GraphQL query results and entities.
 * Supports entity normalization, cache invalidation, and reactive updates through subscriptions.
 */
export class Cache {
  #schemaMeta: SchemaMeta;
  #storage = { [RootFieldKey]: {} } as Storage;
  #registry = new CursorRegistry();
  #subscriptions = new Map<number, Subscription>();
  #stalled = new Map<number, StalledInfo>();
  #optimistic = new OptimisticStack();
  #nextId = 1;
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
    const changes: FieldChange[] = [];
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

        if (!isEqual(oldValue, newValue)) {
          changes.push({
            depKey,
            storageKey,
            fieldKey,
            oldValue: oldValue as FieldValue,
            newValue: newValue as FieldValue,
          });
        }
      },
    );

    this.#notifySubscribers(changes);

    this.#notifyStaleCleared(staleClearedKeys, entityStaleCleared, changes);
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

    return { data: data as DataOf<T>, stale };
  }

  /**
   * Subscribes to cache changes for a specific query.
   * @param artifact - GraphQL document artifact.
   * @param variables - Query variables.
   * @param listener - Callback function to invoke on cache changes.
   * @returns Object containing initial data, stale status, and unsubscribe function.
   */
  subscribeQuery<T extends Artifact<'query'>>(
    artifact: T,
    variables: VariablesOf<T>,
    listener: (notification: CacheNotification) => void,
  ): { data: DataOf<T> | null; stale: boolean; subId: number; unsubscribe: () => void } {
    const id = this.#nextId++;
    const vars = variables as Record<string, unknown>;

    let stale = false;

    const traceResult = traceSelections(
      artifact.selections,
      this.#storage,
      this.#storage[RootFieldKey],
      vars,
      RootFieldKey,
      [],
      id,
    );

    for (const { depKey } of traceResult.cursors) {
      const { storageKey, fieldKey } = parseDependencyKey(depKey);
      if (this.#stale.has(storageKey as string) || this.#stale.has(makeDependencyKey(storageKey, fieldKey))) {
        stale = true;
        break;
      }
    }

    const subscription: Subscription = {
      id,
      kind: 'query',
      artifact,
      variables: vars,
      listener,
      data: traceResult.complete ? traceResult.data : null,
      stale,
      cursors: new Set(traceResult.cursors.map((c) => c.entry)),
    };

    this.#subscriptions.set(id, subscription);

    for (const { depKey, entry } of traceResult.cursors) {
      this.#registry.add(depKey, entry);
    }

    if (!traceResult.complete) {
      this.#stalled.set(id, { subscription, missingDeps: traceResult.missingDeps });
    }

    const unsubscribe = () => {
      this.#registry.removeAll(subscription.cursors);
      this.#subscriptions.delete(id);
      this.#stalled.delete(id);
    };

    return {
      data: subscription.data as DataOf<T> | null,
      stale,
      subId: id,
      unsubscribe,
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

    let stale = false;

    const value = this.#storage[storageKey];
    if (!value) {
      return { data: null, stale: false };
    }

    const { data, partial } = denormalize(
      artifact.selections,
      this.#storage,
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
   * @returns Object containing initial data, stale status, and unsubscribe function.
   */
  subscribeFragment<T extends Artifact<'fragment'>>(
    artifact: T,
    fragmentRef: FragmentRefs<string>,
    listener: (notification: CacheNotification) => void,
  ): { data: DataOf<T> | null; stale: boolean; subId: number; unsubscribe: () => void } {
    const storageKey = (fragmentRef as unknown as { [FragmentRefKey]: StorageKey })[FragmentRefKey];
    const fragmentVars = getFragmentVars(fragmentRef, artifact.name);
    const id = this.#nextId++;

    const value = storageKey === RootFieldKey ? this.#storage[RootFieldKey] : this.#storage[storageKey];
    if (!value) {
      const subscription: Subscription = {
        id,
        kind: 'fragment',
        artifact,
        variables: fragmentVars,
        listener,
        entityKey: storageKey,
        data: null,
        stale: false,
        cursors: new Set(),
      };
      this.#subscriptions.set(id, subscription);
      return { data: null, stale: false, subId: id, unsubscribe: () => this.#subscriptions.delete(id) };
    }

    let stale = false;

    const denormalizeValue = storageKey === RootFieldKey ? value : value;
    const traceResult = traceSelections(
      artifact.selections,
      this.#storage,
      denormalizeValue as Record<string, unknown>,
      fragmentVars,
      storageKey,
      [],
      id,
    );

    for (const { depKey } of traceResult.cursors) {
      const { storageKey: sk, fieldKey } = parseDependencyKey(depKey);
      if (this.#stale.has(sk as string) || this.#stale.has(makeDependencyKey(sk, fieldKey))) {
        stale = true;
        break;
      }
    }

    if (!traceResult.complete) {
      const subscription: Subscription = {
        id,
        kind: 'fragment',
        artifact,
        variables: fragmentVars,
        listener,
        entityKey: storageKey,
        data: null,
        stale: false,
        cursors: new Set(),
      };
      this.#subscriptions.set(id, subscription);
      return { data: null, stale: false, subId: id, unsubscribe: () => this.#subscriptions.delete(id) };
    }

    const subscription: Subscription = {
      id,
      kind: 'fragment',
      artifact,
      variables: fragmentVars,
      listener,
      entityKey: storageKey,
      data: traceResult.data,
      stale,
      cursors: new Set(traceResult.cursors.map((c) => c.entry)),
    };

    this.#subscriptions.set(id, subscription);

    for (const { depKey, entry } of traceResult.cursors) {
      this.#registry.add(depKey, entry);
    }

    const unsubscribe = () => {
      this.#registry.removeAll(subscription.cursors);
      this.#subscriptions.delete(id);
      this.#stalled.delete(id);
    };

    return {
      data: traceResult.data as DataOf<T>,
      stale,
      subId: id,
      unsubscribe,
    };
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
    listener: (notification: CacheNotification) => void,
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
   * Writes an optimistic response to the cache.
   * @internal
   */
  writeOptimistic<T extends Artifact>(key: string, artifact: T, variables: VariablesOf<T>, data: DataOf<T>): void {
    const changes: FieldChange[] = [];
    const optimisticChanges = new Map<DependencyKey, { old: FieldValue; new: FieldValue }>();

    normalize(
      this.#schemaMeta,
      artifact.selections,
      this.#storage,
      data,
      variables as Record<string, unknown>,
      (storageKey, fieldKey, oldValue, newValue) => {
        const depKey = makeDependencyKey(storageKey, fieldKey);
        if (!isEqual(oldValue, newValue)) {
          changes.push({
            depKey,
            storageKey,
            fieldKey,
            oldValue: oldValue as FieldValue,
            newValue: newValue as FieldValue,
          });
          optimisticChanges.set(depKey, { old: oldValue as FieldValue, new: newValue as FieldValue });
        }
      },
    );

    this.#optimistic.push(key, optimisticChanges);
    this.#notifySubscribers(changes);
  }

  /**
   * Removes an optimistic layer and notifies affected subscribers.
   * @internal
   */
  removeOptimistic(key: string): void {
    const restorations = this.#optimistic.rollback(key);

    for (const restoration of restorations) {
      const { storageKey, fieldKey, newValue } = restoration;
      const fields = this.#storage[storageKey];
      if (fields) {
        (fields as Record<string, unknown>)[fieldKey] = newValue;
      }
    }

    this.#notifySubscribers(restorations);
  }

  /**
   * Invalidates one or more cache entries and notifies affected subscribers.
   * @param targets - Cache entries to invalidate.
   */
  invalidate(...targets: InvalidateTarget[]): void {
    const affectedSubscriptions = new Set<number>();

    for (const target of targets) {
      if (target.__typename === 'Query') {
        if ('$field' in target) {
          const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
          const depKey = makeDependencyKey(RootFieldKey, fieldKey);
          this.#stale.add(depKey);
          this.#collectAffectedSubscriptions(RootFieldKey, fieldKey, affectedSubscriptions);
        } else {
          this.#stale.add(RootFieldKey as string);
          this.#collectAffectedSubscriptions(RootFieldKey, undefined, affectedSubscriptions);
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
            this.#collectAffectedSubscriptions(entityKey, fieldKey, affectedSubscriptions);
          } else {
            this.#stale.add(entityKey);
            this.#collectAffectedSubscriptions(entityKey, undefined, affectedSubscriptions);
          }
        } else {
          const prefix = `${target.__typename}:`;
          for (const key of Object.keys(this.#storage)) {
            if (key.startsWith(prefix)) {
              const entityKey = key as EntityKey;
              if ('$field' in target) {
                const fieldKey = makeFieldKeyFromArgs(target.$field as string, target.$args as Record<string, unknown>);
                this.#stale.add(makeDependencyKey(entityKey, fieldKey));
                this.#collectAffectedSubscriptions(entityKey, fieldKey, affectedSubscriptions);
              } else {
                this.#stale.add(entityKey);
                this.#collectAffectedSubscriptions(entityKey, undefined, affectedSubscriptions);
              }
            }
          }
        }
      }
    }

    const subsToNotify: Subscription[] = [];
    for (const subId of affectedSubscriptions) {
      const sub = this.#subscriptions.get(subId);
      if (sub) {
        sub.stale = true;
        subsToNotify.push(sub);
      }
    }
    for (const sub of subsToNotify) {
      if (sub.stale) {
        sub.listener({ type: 'stale' });
      }
    }
  }

  /**
   * Checks if a subscription has stale data.
   * @internal
   */
  isStale(subId: number): boolean {
    const sub = this.#subscriptions.get(subId);
    return sub?.stale ?? false;
  }

  /**
   * Extracts a serializable snapshot of the cache storage.
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
      const existing = this.#storage[key as StorageKey];
      if (existing) {
        mergeFields(existing, fields, true);
      } else {
        this.#storage[key as StorageKey] = fields as Storage[StorageKey];
      }
    }
  }

  /**
   * Clears all cache data.
   */
  clear(): void {
    this.#storage = { [RootFieldKey]: {} };
    this.#registry.clear();
    this.#subscriptions.clear();
    this.#stalled.clear();
    this.#stale.clear();
  }

  #notifySubscribers(changes: FieldChange[]): void {
    if (changes.length === 0) return;

    const unstalledPatches = this.#checkStalled(changes);

    const { scalar, structural } = classifyChanges(changes);

    const scalarPatches = processScalarChanges(scalar, this.#registry, this.#subscriptions, this.#storage);

    const structuralPatches = processStructuralChanges(
      structural,
      this.#registry,
      this.#subscriptions,
      this.#storage,
      this.#stalled,
    );

    const allPatches = new Map<number, Patch[]>();
    for (const [subId, patches] of unstalledPatches) {
      allPatches.set(subId, patches);
    }
    for (const [subId, patches] of scalarPatches) {
      if (unstalledPatches.has(subId)) continue;
      allPatches.set(subId, [...(allPatches.get(subId) ?? []), ...patches]);
    }
    for (const [subId, patches] of structuralPatches) {
      if (unstalledPatches.has(subId)) continue;
      allPatches.set(subId, [...(allPatches.get(subId) ?? []), ...patches]);
    }

    for (const [subId, patches] of allPatches) {
      const sub = this.#subscriptions.get(subId);
      if (sub && patches.length > 0) {
        if (!structuralPatches.has(subId) && !unstalledPatches.has(subId)) {
          sub.data = applyPatchesImmutable(sub.data, patches);
        }
        sub.listener({ type: 'patch', patches });
      }
    }
  }

  #checkStalled(changes: FieldChange[]): Map<number, Patch[]> {
    const result = new Map<number, Patch[]>();
    const writtenDepKeys = new Set(changes.map((c) => c.depKey));

    for (const [subId, info] of this.#stalled) {
      const intersects = [...info.missingDeps].some((dep) => writtenDepKeys.has(dep));
      if (!intersects) continue;

      const sub = info.subscription;
      const rootStorageKey = sub.entityKey ?? RootFieldKey;
      const rootValue = this.#storage[rootStorageKey];
      if (!rootValue) continue;

      const traceResult = traceSelections(
        sub.artifact.selections,
        this.#storage,
        rootValue,
        sub.variables,
        rootStorageKey,
        [],
        sub.id,
      );

      if (traceResult.complete) {
        this.#registry.removeAll(sub.cursors);
        sub.cursors = new Set(traceResult.cursors.map((c) => c.entry));
        for (const { depKey, entry } of traceResult.cursors) {
          this.#registry.add(depKey, entry);
        }
        this.#stalled.delete(subId);

        const entityArrayChanges = buildEntityArrayContext(changes, traceResult.cursors);
        const patches = diffSnapshots(sub.data, traceResult.data, entityArrayChanges);
        if (patches.length > 0) {
          sub.data = traceResult.data;
          result.set(subId, patches);
        }
      } else {
        info.missingDeps = traceResult.missingDeps;
      }
    }
    return result;
  }

  #notifyStaleCleared(
    staleClearedKeys: Set<DependencyKey>,
    entityStaleCleared: Set<StorageKey>,
    changes: FieldChange[],
  ): void {
    const changedDepKeys = new Set(changes.map((c) => c.depKey));
    const notifiedSubs = new Set<number>();

    for (const depKey of staleClearedKeys) {
      if (changedDepKeys.has(depKey)) continue;
      const entries = this.#registry.get(depKey);
      if (entries) {
        for (const entry of entries) {
          notifiedSubs.add(entry.subscriptionId);
        }
      }
    }

    for (const entityKey of entityStaleCleared) {
      this.#registry.forEachByPrefix(`${entityKey}.`, (entry) => {
        notifiedSubs.add(entry.subscriptionId);
      });
    }

    for (const subId of notifiedSubs) {
      const sub = this.#subscriptions.get(subId);
      if (sub?.stale) {
        sub.stale = false;
        sub.listener({ type: 'stale' });
      }
    }
  }

  #hasKeyFields(target: Record<string, unknown>, keyFields: string[]): boolean {
    return keyFields.every((f) => f in target);
  }

  #collectAffectedSubscriptions(storageKey: StorageKey, fieldKey: FieldKey | undefined, out: Set<number>): void {
    if (fieldKey === undefined) {
      this.#registry.forEachByPrefix(`${storageKey}.`, (entry) => {
        out.add(entry.subscriptionId);
      });
    } else {
      const depKey = makeDependencyKey(storageKey, fieldKey);
      const entries = this.#registry.get(depKey);
      if (entries) {
        for (const entry of entries) {
          out.add(entry.subscriptionId);
        }
      }
    }
  }
}
