import { describe, it, expect, vi } from 'vitest';
import { classifyChanges, processScalarChanges, processStructuralChanges, buildEntityArrayContext } from './change.ts';
import { CursorRegistry } from './cursor.ts';
import { EntityLinkKey, RootFieldKey } from './constants.ts';
import type {
  CursorEntry,
  DependencyKey,
  FieldChange,
  FieldKey,
  FieldValue,
  Subscription,
  StalledInfo,
  Storage,
  StorageKey,
} from './types.ts';
import type { Artifact, Selection } from '@mearie/shared';
import { applyPatchesImmutable } from './patch.ts';
import { markNormalized } from './utils.ts';

const fk = (name: string): FieldKey => `${name}@{}` as FieldKey;
const dk = (storageKey: string, fieldName: string): DependencyKey => `${storageKey}.${fieldName}@{}` as DependencyKey;

const makeChange = (
  storageKey: string,
  fieldName: string,
  oldValue: FieldValue,
  newValue: FieldValue,
): FieldChange => ({
  depKey: dk(storageKey, fieldName),
  storageKey: storageKey as StorageKey,
  fieldKey: fk(fieldName),
  oldValue,
  newValue,
});

const makeArtifact = (selections: Selection[]): Artifact => ({
  kind: 'query',
  name: 'Test',
  body: '',
  selections,
});

const makeSub = (
  id: number,
  selections: Selection[],
  variables: Record<string, unknown> = {},
  data: unknown = null,
  entityKey?: StorageKey,
): Subscription => ({
  id,
  kind: 'query',
  artifact: makeArtifact(selections),
  variables,
  listener: vi.fn(),
  data,
  stale: false,
  cursors: new Set(),
  ...(entityKey && { entityKey }),
});

describe('classifyChanges', () => {
  it('scalar string change is classified as scalar', () => {
    const changes = [makeChange(RootFieldKey, 'name', 'Alice', 'Bob')];
    const result = classifyChanges(changes);
    expect(result.scalar).toHaveLength(1);
    expect(result.scalar[0]!.depKey).toBe(dk(RootFieldKey, 'name'));
    expect(result.structural).toHaveLength(0);
  });

  it('scalar number change is classified as scalar', () => {
    const changes = [makeChange('User:1', 'age', 25, 30)];
    const result = classifyChanges(changes);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('null to string is classified as scalar', () => {
    const changes = [makeChange(RootFieldKey, 'name', null, 'Alice')];
    const result = classifyChanges(changes);
    expect(result.scalar).toHaveLength(1);
    expect(result.structural).toHaveLength(0);
  });

  it('entity link change is classified as structural', () => {
    const changes = [
      makeChange(
        RootFieldKey,
        'user',
        { [EntityLinkKey]: 'User:1' } as FieldValue,
        { [EntityLinkKey]: 'User:2' } as FieldValue,
      ),
    ];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('same entity link is skipped', () => {
    const changes = [
      makeChange(
        RootFieldKey,
        'user',
        { [EntityLinkKey]: 'User:1' } as FieldValue,
        { [EntityLinkKey]: 'User:1' } as FieldValue,
      ),
    ];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(0);
    expect(result.scalar).toHaveLength(0);
  });

  it('entity link array change is classified as structural', () => {
    const changes = [
      makeChange(
        RootFieldKey,
        'users',
        [{ [EntityLinkKey]: 'User:1' }] as FieldValue,
        [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }] as FieldValue,
      ),
    ];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('null to entity link is classified as structural', () => {
    const changes = [makeChange(RootFieldKey, 'user', null, { [EntityLinkKey]: 'User:1' } as FieldValue)];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('entity link to null is classified as structural', () => {
    const changes = [makeChange(RootFieldKey, 'user', { [EntityLinkKey]: 'User:1' } as FieldValue, null)];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('entity link array to null is classified as structural', () => {
    const changes = [makeChange(RootFieldKey, 'users', [{ [EntityLinkKey]: 'User:1' }] as FieldValue, null)];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(1);
    expect(result.scalar).toHaveLength(0);
  });

  it('same entity link array is skipped', () => {
    const changes = [
      makeChange(
        RootFieldKey,
        'users',
        [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }] as FieldValue,
        [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }] as FieldValue,
      ),
    ];
    const result = classifyChanges(changes);
    expect(result.structural).toHaveLength(0);
    expect(result.scalar).toHaveLength(0);
  });
});

describe('processScalarChanges', () => {
  it('generates set patches for scalar changes via cursor lookup', () => {
    const registry = new CursorRegistry();
    const depKey = dk('User:1', 'name');
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    registry.add(depKey, entry);

    const subscriptions = new Map<number, Subscription>([[1, makeSub(1, [])]]);

    const changes: FieldChange[] = [makeChange('User:1', 'name', 'Alice', 'Bob')];

    const result = processScalarChanges(changes, registry, subscriptions);

    expect(result.get(1)).toEqual([{ type: 'set', path: ['user', 'name'], value: 'Bob' }]);
  });

  it('generates patches for multiple subscriptions on the same depKey', () => {
    const registry = new CursorRegistry();
    const depKey = dk('User:1', 'name');
    const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    const entry2: CursorEntry = { subscriptionId: 2, path: ['author', 'name'] };
    registry.add(depKey, entry1);
    registry.add(depKey, entry2);

    const subscriptions = new Map<number, Subscription>([
      [1, makeSub(1, [])],
      [2, makeSub(2, [])],
    ]);

    const changes: FieldChange[] = [makeChange('User:1', 'name', 'Alice', 'Bob')];

    const result = processScalarChanges(changes, registry, subscriptions);

    expect(result.get(1)).toEqual([{ type: 'set', path: ['user', 'name'], value: 'Bob' }]);
    expect(result.get(2)).toEqual([{ type: 'set', path: ['author', 'name'], value: 'Bob' }]);
  });

  it('returns empty map when no cursors match', () => {
    const registry = new CursorRegistry();
    const subscriptions = new Map<number, Subscription>();

    const changes: FieldChange[] = [makeChange('User:1', 'name', 'Alice', 'Bob')];

    const result = processScalarChanges(changes, registry, subscriptions);

    expect(result.size).toBe(0);
  });

  it('denormalizes normalized record using entry selections', () => {
    const addressSelections: Selection[] = [
      { kind: 'Field', name: 'city', type: 'String' },
      { kind: 'Field', name: 'zip', type: 'String' },
    ];

    const registry = new CursorRegistry();
    const depKey = dk('User:1', 'address');
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'address'], selections: addressSelections };
    registry.add(depKey, entry);

    const subscriptions = new Map<number, Subscription>([[1, makeSub(1, [])]]);

    const normalizedRecord: Record<string, unknown> = { 'city@{}': 'Seoul', 'zip@{}': '12345' };
    markNormalized(normalizedRecord);

    const changes: FieldChange[] = [
      {
        depKey: dk('User:1', 'address'),
        storageKey: 'User:1' as StorageKey,
        fieldKey: fk('address'),
        oldValue: null,
        newValue: normalizedRecord as FieldValue,
      },
    ];

    const result = processScalarChanges(changes, registry, subscriptions);

    expect(result.get(1)).toEqual([{ type: 'set', path: ['user', 'address'], value: { city: 'Seoul', zip: '12345' } }]);
  });
});

describe('buildEntityArrayContext', () => {
  it('returns undefined when no changes are entity link arrays', () => {
    const changes: FieldChange[] = [makeChange('User:1', 'name', 'Alice', 'Bob')];
    const cursors: { depKey: DependencyKey; entry: CursorEntry }[] = [
      { depKey: dk('User:1', 'name'), entry: { subscriptionId: 1, path: ['user', 'name'] } },
    ];

    const result = buildEntityArrayContext(changes, cursors);

    expect(result).toBeUndefined();
  });

  it('returns undefined when no cursors match', () => {
    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'posts',
        [{ [EntityLinkKey]: 'Post:1' }] as FieldValue,
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }] as FieldValue,
      ),
    ];
    const cursors: { depKey: DependencyKey; entry: CursorEntry }[] = [
      { depKey: dk(RootFieldKey, 'users'), entry: { subscriptionId: 1, path: ['users'] } },
    ];

    const result = buildEntityArrayContext(changes, cursors);

    expect(result).toBeUndefined();
  });

  it('returns map with correct oldKeys/newKeys when cursor matches', () => {
    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'posts',
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }] as FieldValue,
        [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }] as FieldValue,
      ),
    ];
    const cursors: { depKey: DependencyKey; entry: CursorEntry }[] = [
      { depKey: dk(RootFieldKey, 'posts'), entry: { subscriptionId: 1, path: ['posts'] } },
    ];

    const result = buildEntityArrayContext(changes, cursors);

    expect(result).toBeDefined();
    const key = ['posts'].map(String).join('\0');
    const entry = result!.get(key);
    expect(entry).toEqual({
      oldKeys: ['Post:1', 'Post:2'],
      newKeys: ['Post:2', 'Post:3'],
    });
  });

  it('handles oldValue/newValue being null', () => {
    const changes: FieldChange[] = [
      makeChange(RootFieldKey, 'posts', null, [{ [EntityLinkKey]: 'Post:1' }] as FieldValue),
    ];
    const cursors: { depKey: DependencyKey; entry: CursorEntry }[] = [
      { depKey: dk(RootFieldKey, 'posts'), entry: { subscriptionId: 1, path: ['posts'] } },
    ];

    const result = buildEntityArrayContext(changes, cursors);

    expect(result).toBeDefined();
    const key = ['posts'].map(String).join('\0');
    const entry = result!.get(key);
    expect(entry).toEqual({
      oldKeys: [],
      newKeys: ['Post:1'],
    });
  });
});

describe('processStructuralChanges', () => {
  it('re-traces and produces patches for entity swap', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '1', 'name@{}': 'Alice' },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '2', 'name@{}': 'Bob' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(1, selections, {}, { user: { id: '1', name: 'Alice' } });

    const rootEntry: CursorEntry = { subscriptionId: 1, path: ['user'] };
    const idEntry: CursorEntry = { subscriptionId: 1, path: ['user', 'id'] };
    const nameEntry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    sub.cursors = new Set([rootEntry, idEntry, nameEntry]);
    registry.add(dk(RootFieldKey, 'user'), rootEntry);
    registry.add(dk('User:1', 'id'), idEntry);
    registry.add(dk('User:1', 'name'), nameEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);

    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'user',
        { [EntityLinkKey]: 'User:1' } as FieldValue,
        {
          [EntityLinkKey]: 'User:2',
        } as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    expect(stalled.size).toBe(0);
  });

  it('stalls subscription when new entity is incomplete', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
          { kind: 'Field', name: 'email', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:2' } },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '2', 'name@{}': 'Bob' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(1, selections, {}, { user: { id: '1', name: 'Alice', email: 'alice@test.com' } });

    const rootEntry: CursorEntry = { subscriptionId: 1, path: ['user'] };
    sub.cursors = new Set([rootEntry]);
    registry.add(dk(RootFieldKey, 'user'), rootEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);

    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'user',
        { [EntityLinkKey]: 'User:1' } as FieldValue,
        {
          [EntityLinkKey]: 'User:2',
        } as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(false);
    expect(stalled.has(1)).toBe(true);
  });

  it('generates swap patches for entity array reorder', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'posts',
        type: '[Post]',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'title', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: {
        'posts@{}': [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }],
      },
      ['Post:1' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '1', 'title@{}': 'First' },
      ['Post:2' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '2', 'title@{}': 'Second' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(
      1,
      selections,
      {},
      {
        posts: [
          { __typename: 'Post', id: '1', title: 'First' },
          { __typename: 'Post', id: '2', title: 'Second' },
        ],
      },
    );

    const postsEntry: CursorEntry = { subscriptionId: 1, path: ['posts'], selections: selections[0]!.selections };
    const t1Entry: CursorEntry = { subscriptionId: 1, path: ['posts', 0, '__typename'] };
    const id1Entry: CursorEntry = { subscriptionId: 1, path: ['posts', 0, 'id'] };
    const title1Entry: CursorEntry = { subscriptionId: 1, path: ['posts', 0, 'title'] };
    const t2Entry: CursorEntry = { subscriptionId: 1, path: ['posts', 1, '__typename'] };
    const id2Entry: CursorEntry = { subscriptionId: 1, path: ['posts', 1, 'id'] };
    const title2Entry: CursorEntry = { subscriptionId: 1, path: ['posts', 1, 'title'] };
    sub.cursors = new Set([postsEntry, t1Entry, id1Entry, title1Entry, t2Entry, id2Entry, title2Entry]);
    registry.add(dk(RootFieldKey, 'posts'), postsEntry);
    registry.add(dk('Post:1', '__typename'), t1Entry);
    registry.add(dk('Post:1', 'id'), id1Entry);
    registry.add(dk('Post:1', 'title'), title1Entry);
    registry.add(dk('Post:2', '__typename'), t2Entry);
    registry.add(dk('Post:2', 'id'), id2Entry);
    registry.add(dk('Post:2', 'title'), title2Entry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'posts',
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }] as FieldValue,
        [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }] as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    const patches = result.get(1)!;
    expect(patches).toContainEqual({ type: 'swap', path: ['posts'], i: 0, j: 1 });
    expect(patches.every((p) => p.type !== 'set')).toBe(true);
  });

  it('generates splice patch for entity array deletion', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'posts',
        type: '[Post]',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'title', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: {
        'posts@{}': [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:3' }],
      },
      ['Post:1' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '1', 'title@{}': 'First' },
      ['Post:2' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '2', 'title@{}': 'Second' },
      ['Post:3' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '3', 'title@{}': 'Third' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(
      1,
      selections,
      {},
      {
        posts: [
          { __typename: 'Post', id: '1', title: 'First' },
          { __typename: 'Post', id: '2', title: 'Second' },
          { __typename: 'Post', id: '3', title: 'Third' },
        ],
      },
    );

    const postsEntry: CursorEntry = { subscriptionId: 1, path: ['posts'], selections: selections[0]!.selections };
    sub.cursors = new Set([postsEntry]);
    registry.add(dk(RootFieldKey, 'posts'), postsEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'posts',
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:3' }] as FieldValue,
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:3' }] as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    const patches = result.get(1)!;
    expect(patches).toContainEqual({ type: 'splice', path: ['posts'], index: 1, deleteCount: 1, items: [] });
  });

  it('generates splice patch for entity array insertion', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'posts',
        type: '[Post]',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'title', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: {
        'posts@{}': [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }],
      },
      ['Post:1' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '1', 'title@{}': 'First' },
      ['Post:2' as StorageKey]: { '__typename@{}': 'Post', 'id@{}': '2', 'title@{}': 'New' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(
      1,
      selections,
      {},
      {
        posts: [{ __typename: 'Post', id: '1', title: 'First' }],
      },
    );

    const postsEntry: CursorEntry = { subscriptionId: 1, path: ['posts'], selections: selections[0]!.selections };
    sub.cursors = new Set([postsEntry]);
    registry.add(dk(RootFieldKey, 'posts'), postsEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'posts',
        [{ [EntityLinkKey]: 'Post:1' }] as FieldValue,
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }] as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    const patches = result.get(1)!;
    const splicePatch = patches.find(
      (p): p is Extract<typeof p, { type: 'splice' }> => p.type === 'splice' && p.index === 1,
    );
    expect(splicePatch).toBeDefined();
    expect(splicePatch!.deleteCount).toBe(0);
    expect(splicePatch!.items).toHaveLength(1);
    expect(splicePatch!.items[0]).toEqual(expect.objectContaining({ __typename: 'Post', id: '2', title: 'New' }));
  });

  it('preserves field changes within items during array reorder', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'posts',
        type: '[Post]',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'title', type: 'String' },
          {
            kind: 'Field',
            name: 'author',
            type: 'User',
            selections: [
              { kind: 'Field', name: '__typename', type: 'String' },
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
            ],
          },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: {
        'posts@{}': [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }],
      },
      ['Post:1' as StorageKey]: {
        '__typename@{}': 'Post',
        'id@{}': '1',
        'title@{}': 'First',
        'author@{}': { [EntityLinkKey]: 'User:a2' },
      },
      ['Post:2' as StorageKey]: {
        '__typename@{}': 'Post',
        'id@{}': '2',
        'title@{}': 'Second',
        'author@{}': { [EntityLinkKey]: 'User:a1' },
      },
      ['User:a1' as StorageKey]: { '__typename@{}': 'User', 'id@{}': 'a1', 'name@{}': 'Alice' },
      ['User:a2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': 'a2', 'name@{}': 'Bob' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(
      1,
      selections,
      {},
      {
        posts: [
          { __typename: 'Post', id: '1', title: 'First', author: null },
          { __typename: 'Post', id: '2', title: 'Second', author: { __typename: 'User', id: 'a1', name: 'Alice' } },
        ],
      },
    );

    const postsEntry: CursorEntry = { subscriptionId: 1, path: ['posts'], selections: selections[0]!.selections };
    const authorEntry1: CursorEntry = {
      subscriptionId: 1,
      path: ['posts', 0, 'author'],
      selections: selections[0]!.selections![3]!.selections,
    };
    const authorEntry2: CursorEntry = {
      subscriptionId: 1,
      path: ['posts', 1, 'author'],
      selections: selections[0]!.selections![3]!.selections,
    };
    sub.cursors = new Set([postsEntry, authorEntry1, authorEntry2]);
    registry.add(dk(RootFieldKey, 'posts'), postsEntry);
    registry.add(dk('Post:1', 'author'), authorEntry1);
    registry.add(dk('Post:2', 'author'), authorEntry2);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'posts',
        [{ [EntityLinkKey]: 'Post:1' }, { [EntityLinkKey]: 'Post:2' }] as FieldValue,
        [{ [EntityLinkKey]: 'Post:2' }, { [EntityLinkKey]: 'Post:1' }] as FieldValue,
      ),
      makeChange('Post:1', 'author', null, { [EntityLinkKey]: 'User:a2' } as FieldValue),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    const patches = result.get(1)!;

    const oldData = {
      posts: [
        { __typename: 'Post', id: '1', title: 'First', author: null },
        { __typename: 'Post', id: '2', title: 'Second', author: { __typename: 'User', id: 'a1', name: 'Alice' } },
      ],
    };
    const applied = applyPatchesImmutable(oldData, patches);

    expect(applied.posts[0]).toEqual(
      expect.objectContaining({ id: '2', author: { __typename: 'User', id: 'a1', name: 'Alice' } }),
    );
    expect(applied.posts[1]).toEqual(
      expect.objectContaining({ id: '1', author: { __typename: 'User', id: 'a2', name: 'Bob' } }),
    );
  });

  it('re-traces from entity root for entity-rooted subscription', () => {
    const selections: Selection[] = [
      { kind: 'Field', name: 'id', type: 'ID' },
      { kind: 'Field', name: 'name', type: 'String' },
      {
        kind: 'Field',
        name: 'friend',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const entityKey = 'User:1' as StorageKey;

    const storage: Storage = {
      [RootFieldKey]: {},
      [entityKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
        'friend@{}': { [EntityLinkKey]: 'User:3' },
      },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '2', 'name@{}': 'Bob' },
      ['User:3' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '3', 'name@{}': 'Charlie' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(1, selections, {}, { id: '1', name: 'Alice', friend: { id: '2', name: 'Bob' } }, entityKey);

    const friendEntry: CursorEntry = { subscriptionId: 1, path: ['friend'] };
    const friendIdEntry: CursorEntry = { subscriptionId: 1, path: ['friend', 'id'] };
    const friendNameEntry: CursorEntry = { subscriptionId: 1, path: ['friend', 'name'] };
    sub.cursors = new Set([friendEntry, friendIdEntry, friendNameEntry]);
    registry.add(dk('User:1', 'friend'), friendEntry);
    registry.add(dk('User:2', 'id'), friendIdEntry);
    registry.add(dk('User:2', 'name'), friendNameEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        'User:1',
        'friend',
        { [EntityLinkKey]: 'User:2' } as FieldValue,
        { [EntityLinkKey]: 'User:3' } as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    const patches = result.get(1)!;
    const applied = applyPatchesImmutable({ id: '1', name: 'Alice', friend: { id: '2', name: 'Bob' } }, patches);
    expect(applied.friend).toEqual({ id: '3', name: 'Charlie' });
  });

  it('deduplicates subscriptions across multiple structural changes', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
          {
            kind: 'Field',
            name: 'friend',
            type: 'User',
            selections: [
              { kind: 'Field', name: 'id', type: 'ID' },
              { kind: 'Field', name: 'name', type: 'String' },
            ],
          },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
        'friend@{}': { [EntityLinkKey]: 'User:3' },
      },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '2', 'name@{}': 'Bob' },
      ['User:3' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '3', 'name@{}': 'Charlie' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(1, selections, {}, { user: { id: '1', name: 'Alice', friend: { id: '2', name: 'Bob' } } });

    const userEntry: CursorEntry = { subscriptionId: 1, path: ['user'] };
    const friendEntry: CursorEntry = { subscriptionId: 1, path: ['user', 'friend'] };
    sub.cursors = new Set([userEntry, friendEntry]);
    registry.add(dk(RootFieldKey, 'user'), userEntry);
    registry.add(dk('User:1', 'friend'), friendEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'user',
        { [EntityLinkKey]: 'User:1' } as FieldValue,
        { [EntityLinkKey]: 'User:1' } as FieldValue,
      ),
      makeChange(
        'User:1',
        'friend',
        { [EntityLinkKey]: 'User:2' } as FieldValue,
        { [EntityLinkKey]: 'User:3' } as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    const patches = result.get(1)!;
    const applied = applyPatchesImmutable(
      { user: { id: '1', name: 'Alice', friend: { id: '2', name: 'Bob' } } },
      patches,
    );
    expect(applied.user.friend).toEqual({ id: '3', name: 'Charlie' });
  });

  it('emits no patches when resolved data is identical after entity pointer change', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:2' } },
      ['User:1' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '1', 'name@{}': 'Alice' },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '1', 'name@{}': 'Alice' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(1, selections, {}, { user: { id: '1', name: 'Alice' } });

    const rootEntry: CursorEntry = { subscriptionId: 1, path: ['user'] };
    sub.cursors = new Set([rootEntry]);
    registry.add(dk(RootFieldKey, 'user'), rootEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>();

    const changes: FieldChange[] = [
      makeChange(
        RootFieldKey,
        'user',
        { [EntityLinkKey]: 'User:1' } as FieldValue,
        { [EntityLinkKey]: 'User:2' } as FieldValue,
      ),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(false);
    expect(sub.data).toEqual({ user: { id: '1', name: 'Alice' } });
  });

  it('removes subscription from stalled map after complete re-trace', () => {
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '1', 'name@{}': 'Alice' },
    };

    const registry = new CursorRegistry();
    const sub = makeSub(1, selections, {}, { user: null });

    const rootEntry: CursorEntry = { subscriptionId: 1, path: ['user'] };
    sub.cursors = new Set([rootEntry]);
    registry.add(dk(RootFieldKey, 'user'), rootEntry);

    const subscriptions = new Map<number, Subscription>([[1, sub]]);
    const stalled = new Map<number, StalledInfo>([
      [1, { subscription: sub, missingDeps: new Set([dk('User:1', '__typename')]) }],
    ]);

    const changes: FieldChange[] = [
      makeChange(RootFieldKey, 'user', null, { [EntityLinkKey]: 'User:1' } as FieldValue),
    ];

    const result = processStructuralChanges(changes, registry, subscriptions, storage, stalled);

    expect(result.has(1)).toBe(true);
    expect(stalled.has(1)).toBe(false);
  });
});
