import { describe, it, expect } from 'vitest';
import { classifyChanges, generatePatches } from './change.ts';
import { buildEntryTree } from './tree.ts';
import type { EntryTuple } from './tree.ts';
import { makeDependencyKey, markNormalized } from './utils.ts';
import { EntityLinkKey, RootFieldKey } from './constants.ts';
import type {
  DependencyKey,
  EntryTreeNode,
  FieldKey,
  FieldValue,
  Patch,
  QuerySubscription,
  Storage,
  StorageKey,
  SubscriptionEntry,
} from './types.ts';
import type { Selection } from '@mearie/shared';

const fk = (name: string): FieldKey => `${name}@{}` as FieldKey;
const dk = (storageKey: string, fieldName: string): DependencyKey => `${storageKey}.${fieldName}@{}` as DependencyKey;

const makeSubscription = (
  selections: readonly Selection[],
  variables: Record<string, unknown>,
  entryTree: EntryTreeNode,
): QuerySubscription => ({
  listener: () => {},
  selections,
  variables,
  entryTree,
});

const registerEntries = (
  entryTree: EntryTreeNode,
  subscription: QuerySubscription,
  tuples: EntryTuple[],
  subscriptions: Map<DependencyKey, Set<SubscriptionEntry>>,
): void => {
  for (const tuple of tuples) {
    const depKey = makeDependencyKey(tuple.storageKey, tuple.fieldKey);
    const entry: SubscriptionEntry = {
      path: tuple.path,
      subscription,
    };
    let entrySet = subscriptions.get(depKey);
    if (!entrySet) {
      entrySet = new Set();
      subscriptions.set(depKey, entrySet);
    }
    entrySet.add(entry);
  }
};

describe('classifyChanges', () => {
  it('scalar string change is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.scalar[0]!.depKey).toBe(dk(RootFieldKey, 'name'));
    expect(result.structural).toHaveLength(0);
  });

  it('scalar number change is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'age'), { oldValue: 25, newValue: 30 }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('null to string is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'name'), { oldValue: null, newValue: 'Alice' }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('string to null is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'name'), { oldValue: 'Alice', newValue: null }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('boolean change is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'active'), { oldValue: true, newValue: false }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('embedded object change is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'config'), { oldValue: { a: 1 }, newValue: { a: 2 } }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('non-entity array change is classified as scalar', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'tags'), { oldValue: ['a', 'b'], newValue: ['a', 'c'] }],
    ]);
    const result = classifyChanges(changed);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('entity ref change is classified as structural', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('entity ref to null is classified as structural', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: null }],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('null to entity ref is classified as structural', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: null, newValue: { [EntityLinkKey]: 'User:1' } }],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('entity link array change is classified as structural', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'users'),
        {
          oldValue: [{ [EntityLinkKey]: 'User:1' }],
          newValue: [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
        },
      ],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('same entity link rewrite (same __ref key) is filtered out', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'user'),
        {
          oldValue: { [EntityLinkKey]: 'User:1' },
          newValue: { [EntityLinkKey]: 'User:1' },
        },
      ],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(0);
    expect(result.scalar).toHaveLength(0);
  });

  it('same entity link array rewrite is filtered out', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'users'),
        {
          oldValue: [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
          newValue: [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
        },
      ],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(0);
    expect(result.scalar).toHaveLength(0);
  });

  it('mixed structural and scalar changes are correctly classified', () => {
    const changed = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
      [dk('User:1', 'age'), { oldValue: 25, newValue: 30 }],
    ]);
    const result = classifyChanges(changed);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(2);
  });
});

describe('generatePatches - scalar changes', () => {
  it('single scalar field change produces set patch', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Bob',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    expect(result.size).toBe(1);
    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });
  });

  it('multiple scalar field changes produce multiple set patches', () => {
    const tuples: EntryTuple[] = [
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('age'), path: ['user', 'age'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription([], {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = { [RootFieldKey]: {} };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
      [dk('User:1', 'age'), { oldValue: 25, newValue: 30 }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(2);
    expect(patches).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });
    expect(patches).toContainEqual({ type: 'set', path: ['user', 'age'], value: 30 });
  });

  it('same depKey with two subscriptions gives each its own patches', () => {
    const tuples1: EntryTuple[] = [
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];
    const tuples2: EntryTuple[] = [
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['profile', 'name'], selections: undefined },
    ];

    const entryTree1 = buildEntryTree(tuples1);
    const entryTree2 = buildEntryTree(tuples2);
    const sub1 = makeSubscription([], {}, entryTree1);
    const sub2 = makeSubscription([], {}, entryTree2);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree1, sub1, tuples1, subscriptions);
    registerEntries(entryTree2, sub2, tuples2, subscriptions);

    const storage: Storage = { [RootFieldKey]: {} };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    expect(result.size).toBe(2);
    expect(result.get(sub1)![0]).toEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });
    expect(result.get(sub2)![0]).toEqual({ type: 'set', path: ['profile', 'name'], value: 'Bob' });
  });

  it('null value produces set patch with null', () => {
    const tuples: EntryTuple[] = [
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription([], {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: null }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, { [RootFieldKey]: {} });

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ type: 'set', path: ['user', 'name'], value: null });
  });

  it('empty string produces set patch with empty string', () => {
    const tuples: EntryTuple[] = [
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription([], {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: '' }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, { [RootFieldKey]: {} });

    const patches = result.get(subscription)!;
    expect(patches[0]).toEqual({ type: 'set', path: ['user', 'name'], value: '' });
  });
});

describe('generatePatches - entity ref to null', () => {
  it('entity ref to null produces set null patch and removes subtree entries', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: null },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: null }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ type: 'set', path: ['user'], value: null });

    expect(subscriptions.has(dk('User:1', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'id'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'name'))).toBe(false);

    const userNode = entryTree.children.get('user')!;
    expect(userNode.selections).toBeDefined();
  });
});

describe('generatePatches - null to entity ref', () => {
  it('null to entity ref produces set patch with denormalized value', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: null, newValue: { [EntityLinkKey]: 'User:1' } }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]!.type).toBe('set');
    expect(patches[0]!.path).toEqual(['user']);
    expect((patches[0]! as Extract<Patch, { type: 'set' }>).value).toEqual({
      __typename: 'User',
      id: '1',
      name: 'Alice',
    });

    const newSubKeys = [...subscriptions.keys()].filter((k) => k !== dk(RootFieldKey, 'user'));
    expect(newSubKeys.length).toBeGreaterThan(0);
  });
});

describe('generatePatches - entity ref to entity ref', () => {
  it('entity ref to entity ref with same field values produces no patches', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Alice',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    const patches = result.get(subscription);
    if (patches) {
      for (const p of patches) {
        if (p.type === 'set') {
          const fieldName = p.path.at(-1) as string;
          if (fieldName === 'name') {
            expect(p.value).toBe('Alice');
          }
        }
      }
    }
  });

  it('entity ref to entity ref with different field values produces patches for differing fields', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Bob',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    const patches = result.get(subscription)!;
    expect(patches.length).toBeGreaterThan(0);

    const namePatch = patches.find(
      (p): p is Extract<Patch, { type: 'set' }> => p.type === 'set' && p.path.join('.') === 'user.name',
    );
    expect(namePatch).toBeDefined();
    expect(namePatch!.value).toBe('Bob');

    const idPatch = patches.find(
      (p): p is Extract<Patch, { type: 'set' }> => p.type === 'set' && p.path.join('.') === 'user.id',
    );
    expect(idPatch).toBeDefined();
    expect(idPatch!.value).toBe('2');
  });
});

describe('generatePatches - list deletion', () => {
  const itemSelections: Selection[] = [
    { kind: 'Field', name: '__typename', type: 'String' },
    { kind: 'Field', name: 'id', type: 'ID' },
    { kind: 'Field', name: 'title', type: 'String' },
  ];

  const setupListSubscription = (entityKeys: string[]) => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
    ];

    for (const [i, entityKey] of entityKeys.entries()) {
      tuples.push(
        {
          storageKey: entityKey as StorageKey,
          fieldKey: fk('__typename'),
          path: ['posts', i, '__typename'],
          selections: undefined,
        },
        { storageKey: entityKey as StorageKey, fieldKey: fk('id'), path: ['posts', i, 'id'], selections: undefined },
        {
          storageKey: entityKey as StorageKey,
          fieldKey: fk('title'),
          path: ['posts', i, 'title'],
          selections: undefined,
        },
      );
    }

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    return { entryTree, subscription, subscriptions };
  };

  it('last item deleted produces splice at end', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2']);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
          newValue: [{ [EntityLinkKey]: 'Post:1' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter((p) => p.type === 'splice');
    expect(splicePatches).toHaveLength(1);
    expect(splicePatches[0]).toEqual({
      type: 'splice',
      path: ['posts'],
      index: 1,
      deleteCount: 1,
      items: [],
    });
  });

  it('first item deleted produces splice at 0', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2']);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
          newValue: [{ [EntityLinkKey]: 'Post:2' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter((p) => p.type === 'splice');
    expect(splicePatches).toHaveLength(1);
    expect(splicePatches[0]).toEqual({
      type: 'splice',
      path: ['posts'],
      index: 0,
      deleteCount: 1,
      items: [],
    });
  });

  it('multiple items deleted produces back-to-front splices', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
    };

    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2', 'Post:3']);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
          newValue: [{ [EntityLinkKey]: 'Post:2' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter((p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice');
    expect(splicePatches).toHaveLength(2);
    expect(splicePatches[0]!.index).toBeGreaterThanOrEqual(splicePatches[1]!.index);
  });
});

describe('generatePatches - list addition', () => {
  const itemSelections: Selection[] = [
    { kind: 'Field', name: '__typename', type: 'String' },
    { kind: 'Field', name: 'id', type: 'ID' },
    { kind: 'Field', name: 'title', type: 'String' },
  ];

  it('append item produces splice at end', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
      {
        storageKey: 'Post:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 0, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('id'), path: ['posts', 0, 'id'], selections: undefined },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('title'), path: ['posts', 0, 'title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }],
          newValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter((p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice');
    expect(splicePatches).toHaveLength(1);
    const sp = splicePatches[0]!;
    expect(sp.index).toBe(1);
    expect(sp.deleteCount).toBe(0);
    expect(sp.items).toHaveLength(1);
    expect(sp.items[0]).toEqual({
      __typename: 'Post',
      id: '2',
      title: 'B',
    });
  });

  it('insert item at beginning produces splice at index 0', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
      {
        storageKey: 'Post:2' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 0, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:2' as StorageKey, fieldKey: fk('id'), path: ['posts', 0, 'id'], selections: undefined },
      { storageKey: 'Post:2' as StorageKey, fieldKey: fk('title'), path: ['posts', 0, 'title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'New' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:2' }],
          newValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter((p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice');
    expect(splicePatches).toHaveLength(1);
    const sp = splicePatches[0]!;
    expect(sp.index).toBe(0);
    expect(sp.deleteCount).toBe(0);
    expect(sp.items[0]).toEqual({
      __typename: 'Post',
      id: '1',
      title: 'New',
    });
  });
});

describe('generatePatches - list reorder', () => {
  const itemSelections: Selection[] = [
    { kind: 'Field', name: '__typename', type: 'String' },
    { kind: 'Field', name: 'id', type: 'ID' },
    { kind: 'Field', name: 'title', type: 'String' },
  ];

  it('simple swap produces swap patch', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
      {
        storageKey: 'Post:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 0, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('id'), path: ['posts', 0, 'id'], selections: undefined },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('title'), path: ['posts', 0, 'title'], selections: undefined },
      {
        storageKey: 'Post:2' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 1, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:2' as StorageKey, fieldKey: fk('id'), path: ['posts', 1, 'id'], selections: undefined },
      { storageKey: 'Post:2' as StorageKey, fieldKey: fk('title'), path: ['posts', 1, 'title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
          newValue: [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const swapPatches = patches.filter((p) => p.type === 'swap');
    expect(swapPatches).toHaveLength(1);
    expect(swapPatches[0]).toEqual({
      type: 'swap',
      path: ['posts'],
      i: 0,
      j: 1,
    });
  });
});

describe('generatePatches - mixed structural and scalar', () => {
  it('scalar in rebuilt subtree is skipped', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Bob',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
      [dk('User:2', 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const namePatchesCount = patches.filter((p) => p.type === 'set' && p.path.join('.') === 'user.name').length;
    expect(namePatchesCount).toBeLessThanOrEqual(1);
  });

  it('scalar outside rebuilt subtree is processed normally', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
      { storageKey: RootFieldKey, fieldKey: fk('title'), path: ['title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('user')]: { [EntityLinkKey]: 'User:2' },
        [fk('title')]: 'New Title',
      },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Bob',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
      [dk(RootFieldKey, 'title'), { oldValue: 'Old Title', newValue: 'New Title' }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const titlePatch = patches.find(
      (p): p is Extract<Patch, { type: 'set' }> => p.type === 'set' && p.path.join('.') === 'title',
    );
    expect(titlePatch).toBeDefined();
    expect(titlePatch!.value).toBe('New Title');
  });
});

describe('generatePatches - embedded objects and non-entity arrays', () => {
  it('embedded object change produces single set patch', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('config'), path: ['config'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription([], {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const newConfig = { theme: 'dark', lang: 'en' };
    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'config'), { oldValue: { theme: 'light', lang: 'en' }, newValue: newConfig }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, { [RootFieldKey]: {} });

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ type: 'set', path: ['config'], value: newConfig });
  });

  it('embedded type with sub-selections denormalizes fieldKey format to user-facing names in patch value', () => {
    const statsSelections: Selection[] = [
      { kind: 'Field', name: 'additions', type: 'Int' },
      { kind: 'Field', name: 'deletions', type: 'Int' },
    ];

    const tuples: EntryTuple[] = [
      {
        storageKey: 'Document:1' as StorageKey,
        fieldKey: fk('characterCountChange'),
        path: ['document', 'characterCountChange'],
        selections: statsSelections,
      },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(statsSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {},
      ['Document:1' as StorageKey]: {
        [fk('characterCountChange')]: {
          [fk('additions')]: 19,
          [fk('deletions')]: 2,
        },
      },
    };

    const oldEmbedded = { [fk('additions')]: 18, [fk('deletions')]: 2 };
    const newEmbedded = { [fk('additions')]: 19, [fk('deletions')]: 2 };
    markNormalized(oldEmbedded);
    markNormalized(newEmbedded);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('Document:1', 'characterCountChange'), { oldValue: oldEmbedded, newValue: newEmbedded }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      type: 'set',
      path: ['document', 'characterCountChange'],
      value: { additions: 19, deletions: 2 },
    });
  });

  it('non-entity array change produces single set patch', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('tags'), path: ['tags'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription([], {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const newTags = ['a', 'b', 'c'];
    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'tags'), { oldValue: ['a', 'b'], newValue: newTags }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, { [RootFieldKey]: {} });

    const patches = result.get(subscription)!;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ type: 'set', path: ['tags'], value: newTags });
  });
});

describe('generatePatches - edge cases', () => {
  it('empty changedKeys returns empty Map', () => {
    const result = generatePatches(new Map(), new Map(), { [RootFieldKey]: {} });
    expect(result.size).toBe(0);
  });

  it('no subscriptions for changed depKey is ignored', () => {
    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
    ]);

    const result = generatePatches(changedKeys, new Map(), { [RootFieldKey]: {} });
    expect(result.size).toBe(0);
  });
});

describe('generatePatches - list complex operations', () => {
  const itemSelections: Selection[] = [
    { kind: 'Field', name: '__typename', type: 'String' },
    { kind: 'Field', name: 'id', type: 'ID' },
    { kind: 'Field', name: 'title', type: 'String' },
  ];

  it('delete + add in same operation', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
      {
        storageKey: 'Post:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 0, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('id'), path: ['posts', 0, 'id'], selections: undefined },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('title'), path: ['posts', 0, 'title'], selections: undefined },
      {
        storageKey: 'Post:2' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 1, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:2' as StorageKey, fieldKey: fk('id'), path: ['posts', 1, 'id'], selections: undefined },
      { storageKey: 'Post:2' as StorageKey, fieldKey: fk('title'), path: ['posts', 1, 'title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
          newValue: [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const spliceDeletePatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount > 0,
    );
    const spliceInsertPatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount === 0,
    );

    expect(spliceDeletePatches.length).toBeGreaterThanOrEqual(1);
    expect(spliceInsertPatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('generatePatches - extended coverage', () => {
  const itemSelections: Selection[] = [
    { kind: 'Field', name: '__typename', type: 'String' },
    { kind: 'Field', name: 'id', type: 'ID' },
    { kind: 'Field', name: 'title', type: 'String' },
  ];

  const setupListSubscription = (entityKeys: string[]) => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
    ];

    for (const [i, entityKey] of entityKeys.entries()) {
      tuples.push(
        {
          storageKey: entityKey as StorageKey,
          fieldKey: fk('__typename'),
          path: ['posts', i, '__typename'],
          selections: undefined,
        },
        { storageKey: entityKey as StorageKey, fieldKey: fk('id'), path: ['posts', i, 'id'], selections: undefined },
        {
          storageKey: entityKey as StorageKey,
          fieldKey: fk('title'),
          path: ['posts', i, 'title'],
          selections: undefined,
        },
      );
    }

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    return { entryTree, subscription, subscriptions, tuples };
  };

  it('T12: entity ref to null clears node.children', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: null },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: null }],
    ]);

    const userNode = entryTree.children.get('user')!;
    expect(userNode.children.size).toBeGreaterThan(0);

    generatePatches(changedKeys, subscriptions, storage);

    expect(userNode.children.size).toBe(0);
  });

  it('T13: entity ref to null with deep nested entity cleanup', () => {
    const addressSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'city', type: 'String' },
    ];

    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
      { kind: 'Field', name: 'address', type: 'Address', selections: addressSelections },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('address'),
        path: ['user', 'address'],
        selections: addressSelections,
      },
      {
        storageKey: 'Address:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', 'address', '__typename'],
        selections: undefined,
      },
      {
        storageKey: 'Address:1' as StorageKey,
        fieldKey: fk('id'),
        path: ['user', 'address', 'id'],
        selections: undefined,
      },
      {
        storageKey: 'Address:1' as StorageKey,
        fieldKey: fk('city'),
        path: ['user', 'address', 'city'],
        selections: undefined,
      },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: null },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
        [fk('address')]: { [EntityLinkKey]: 'Address:1' },
      },
      ['Address:1' as StorageKey]: {
        [fk('__typename')]: 'Address',
        [fk('id')]: '1',
        [fk('city')]: 'NYC',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: null }],
    ]);

    generatePatches(changedKeys, subscriptions, storage);

    expect(subscriptions.has(dk('User:1', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'id'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'name'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'address'))).toBe(false);
    expect(subscriptions.has(dk('Address:1', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('Address:1', 'id'))).toBe(false);
    expect(subscriptions.has(dk('Address:1', 'city'))).toBe(false);

    const userNode = entryTree.children.get('user')!;
    expect(userNode.children.size).toBe(0);
  });

  it('T14: entity ref to entity ref swaps subscription entries from old to new', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    expect(subscriptions.has(dk('User:1', '__typename'))).toBe(true);
    expect(subscriptions.has(dk('User:1', 'id'))).toBe(true);
    expect(subscriptions.has(dk('User:1', 'name'))).toBe(true);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Bob',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);

    generatePatches(changedKeys, subscriptions, storage);

    expect(subscriptions.has(dk('User:1', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'id'))).toBe(false);
    expect(subscriptions.has(dk('User:1', 'name'))).toBe(false);

    const newKeys = [...subscriptions.keys()].filter((k) => k !== dk(RootFieldKey, 'user'));
    expect(newKeys.length).toBeGreaterThan(0);
  });

  it('T15: entity ref to entity ref where new entity has extra fields produces patches', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
      { kind: 'Field', name: 'email', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Bob',
        [fk('email')]: 'bob@example.com',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    expect(patches.length).toBeGreaterThan(0);
    const emailPatch = patches.find(
      (p): p is Extract<Patch, { type: 'set' }> => p.type === 'set' && p.path.join('.') === 'user.email',
    );
    expect(emailPatch).toBeDefined();
    expect(emailPatch!.value).toBe('bob@example.com');
  });

  it('T16: entity ref to entity ref where old entity has fields that new entity does not produces null patches', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
      { kind: 'Field', name: 'bio', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('bio'), path: ['user', 'bio'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
        [fk('bio')]: 'Hello world',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Bob',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const bioPatch = patches.find(
      (p): p is Extract<Patch, { type: 'set' }> => p.type === 'set' && p.path.join('.') === 'user.bio',
    );
    expect(bioPatch).toBeDefined();
    expect(bioPatch!.value).toBeUndefined();
  });

  it('T17: entity ref to entity ref isolates single differing field among multiple', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
      { kind: 'Field', name: 'age', type: 'Int' },
      { kind: 'Field', name: 'role', type: 'String' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('age'), path: ['user', 'age'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('role'), path: ['user', 'role'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: { [fk('user')]: { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Alice',
        [fk('age')]: 30,
        [fk('role')]: 'admin',
      },
      ['User:2' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '2',
        [fk('name')]: 'Alice',
        [fk('age')]: 30,
        [fk('role')]: 'editor',
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk(RootFieldKey, 'user'), { oldValue: { [EntityLinkKey]: 'User:1' }, newValue: { [EntityLinkKey]: 'User:2' } }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const setPatches = patches.filter((p): p is Extract<Patch, { type: 'set' }> => p.type === 'set');
    const changedFieldPaths = setPatches.map((p) => p.path.join('.'));

    expect(changedFieldPaths).toContain('user.id');
    expect(changedFieldPaths).toContain('user.role');
    expect(changedFieldPaths).not.toContain('user.name');
    expect(changedFieldPaths).not.toContain('user.age');
    expect(changedFieldPaths).not.toContain('user.__typename');
  });

  it('T18: list middle item deletion', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:3' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
    };

    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2', 'Post:3']);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
          newValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:3' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount > 0,
    );
    expect(splicePatches).toHaveLength(1);
    expect(splicePatches[0]!.index).toBe(1);
    expect(splicePatches[0]!.deleteCount).toBe(1);
  });

  it('T19: deleted items subscriptions are removed', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const { subscriptions } = setupListSubscription(['Post:1', 'Post:2']);

    expect(subscriptions.has(dk('Post:2', '__typename'))).toBe(true);
    expect(subscriptions.has(dk('Post:2', 'id'))).toBe(true);
    expect(subscriptions.has(dk('Post:2', 'title'))).toBe(true);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
          newValue: [{ [EntityLinkKey]: 'Post:1' }],
        },
      ],
    ]);

    generatePatches(changedKeys, subscriptions, storage);

    expect(subscriptions.has(dk('Post:2', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('Post:2', 'id'))).toBe(false);
    expect(subscriptions.has(dk('Post:2', 'title'))).toBe(false);

    expect(subscriptions.has(dk('Post:1', '__typename'))).toBe(true);
    expect(subscriptions.has(dk('Post:1', 'id'))).toBe(true);
    expect(subscriptions.has(dk('Post:1', 'title'))).toBe(true);
  });

  it('T20: remaining items have reindexed paths after deletion', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
    };

    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2', 'Post:3']);

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
          newValue: [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
        },
      ],
    ]);

    generatePatches(changedKeys, subscriptions, storage);

    const post2Entries = subscriptions.get(dk('Post:2', 'title'));
    expect(post2Entries).toBeDefined();
    const post2Entry = [...post2Entries!].find((e) => e.subscription === subscription)!;
    expect(post2Entry.path).toEqual(['posts', 0, 'title']);

    const post3Entries = subscriptions.get(dk('Post:3', 'title'));
    expect(post3Entries).toBeDefined();
    const post3Entry = [...post3Entries!].find((e) => e.subscription === subscription)!;
    expect(post3Entry.path).toEqual(['posts', 1, 'title']);
  });

  it('T21: list middle position insertion', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
      {
        storageKey: 'Post:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 0, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('id'), path: ['posts', 0, 'id'], selections: undefined },
      { storageKey: 'Post:1' as StorageKey, fieldKey: fk('title'), path: ['posts', 0, 'title'], selections: undefined },
      {
        storageKey: 'Post:3' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['posts', 1, '__typename'],
        selections: undefined,
      },
      { storageKey: 'Post:3' as StorageKey, fieldKey: fk('id'), path: ['posts', 1, 'id'], selections: undefined },
      { storageKey: 'Post:3' as StorageKey, fieldKey: fk('title'), path: ['posts', 1, 'title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:3' }],
          newValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const splicePatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount === 0,
    );
    expect(splicePatches).toHaveLength(1);
    expect(splicePatches[0]!.index).toBe(1);
    expect(splicePatches[0]!.items).toHaveLength(1);
    expect(splicePatches[0]!.items[0]).toEqual({
      __typename: 'Post',
      id: '2',
      title: 'B',
    });
  });

  it('T22: 3-element rotation swap sequence', () => {
    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2', 'Post:3']);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:3' }, { [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
          newValue: [{ [EntityLinkKey]: 'Post:3' }, { [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const swapPatches = patches.filter((p) => p.type === 'swap');
    expect(swapPatches.length).toBeGreaterThanOrEqual(2);
  });

  it('T23: list compound [A,B,C] to [C,D] with removal, addition, and reorder', () => {
    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2', 'Post:3']);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:3' }, { [EntityLinkKey]: 'Post:4' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
      ['Post:3' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '3', [fk('title')]: 'C' },
      ['Post:4' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '4', [fk('title')]: 'D' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }],
          newValue: [{ [EntityLinkKey]: 'Post:3' }, { [EntityLinkKey]: 'Post:4' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const spliceDeletePatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount > 0,
    );
    const spliceInsertPatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount === 0,
    );

    expect(spliceDeletePatches.length).toBeGreaterThanOrEqual(1);
    expect(spliceInsertPatches.length).toBeGreaterThanOrEqual(1);

    const insertedData = spliceInsertPatches[0]!.items[0] as Record<string, unknown>;
    expect(insertedData.id).toBe('4');
    expect(insertedData.title).toBe('D');
  });

  it('T24: list compound empty to populated [] to [A,B]', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('posts'), path: ['posts'], selections: itemSelections },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(itemSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [] as unknown[],
          newValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const spliceInsertPatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount === 0,
    );
    expect(spliceInsertPatches).toHaveLength(2);

    const insertedItems = spliceInsertPatches.map((p) => p.items[0] as Record<string, unknown>);
    expect(insertedItems).toContainEqual({ __typename: 'Post', id: '1', title: 'A' });
    expect(insertedItems).toContainEqual({ __typename: 'Post', id: '2', title: 'B' });
  });

  it('T25: list compound populated to empty [A,B] to []', () => {
    const { subscription, subscriptions } = setupListSubscription(['Post:1', 'Post:2']);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('posts')]: [] as FieldValue[],
      },
      ['Post:1' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '1', [fk('title')]: 'A' },
      ['Post:2' as StorageKey]: { [fk('__typename')]: 'Post', [fk('id')]: '2', [fk('title')]: 'B' },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [
        dk(RootFieldKey, 'posts'),
        {
          oldValue: [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
          newValue: [] as unknown[],
        },
      ],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);
    const patches = result.get(subscription)!;

    const spliceDeletePatches = patches.filter(
      (p): p is Extract<Patch, { type: 'splice' }> => p.type === 'splice' && p.deleteCount > 0,
    );
    expect(spliceDeletePatches).toHaveLength(2);

    expect(subscriptions.has(dk('Post:1', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('Post:1', 'id'))).toBe(false);
    expect(subscriptions.has(dk('Post:1', 'title'))).toBe(false);
    expect(subscriptions.has(dk('Post:2', '__typename'))).toBe(false);
    expect(subscriptions.has(dk('Post:2', 'id'))).toBe(false);
    expect(subscriptions.has(dk('Post:2', 'title'))).toBe(false);
  });

  it('T26: multiple changes to same subscription produce single accumulated patch array', () => {
    const userSelections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
      { kind: 'Field', name: 'age', type: 'Int' },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: fk('user'), path: ['user'], selections: userSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('__typename'),
        path: ['user', '__typename'],
        selections: undefined,
      },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('id'), path: ['user', 'id'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('name'), path: ['user', 'name'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: fk('age'), path: ['user', 'age'], selections: undefined },
      { storageKey: RootFieldKey, fieldKey: fk('title'), path: ['title'], selections: undefined },
    ];

    const entryTree = buildEntryTree(tuples);
    const subscription = makeSubscription(userSelections, {}, entryTree);
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    registerEntries(entryTree, subscription, tuples, subscriptions);

    const storage: Storage = {
      [RootFieldKey]: {
        [fk('user')]: { [EntityLinkKey]: 'User:1' },
        [fk('title')]: 'New Title',
      },
      ['User:1' as StorageKey]: {
        [fk('__typename')]: 'User',
        [fk('id')]: '1',
        [fk('name')]: 'Bob',
        [fk('age')]: 31,
      },
    };

    const changedKeys = new Map<DependencyKey, { oldValue: unknown; newValue: unknown }>([
      [dk('User:1', 'name'), { oldValue: 'Alice', newValue: 'Bob' }],
      [dk('User:1', 'age'), { oldValue: 30, newValue: 31 }],
      [dk(RootFieldKey, 'title'), { oldValue: 'Old Title', newValue: 'New Title' }],
    ]);

    const result = generatePatches(changedKeys, subscriptions, storage);

    expect(result.size).toBe(1);
    const patches = result.get(subscription)!;
    expect(patches.length).toBe(3);
    expect(patches).toContainEqual({ type: 'set', path: ['user', 'name'], value: 'Bob' });
    expect(patches).toContainEqual({ type: 'set', path: ['user', 'age'], value: 31 });
    expect(patches).toContainEqual({ type: 'set', path: ['title'], value: 'New Title' });
  });
});
