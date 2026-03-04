import { describe, it, expect } from 'vitest';
import { CursorRegistry, traceSelections } from './cursor.ts';
import { RootFieldKey, EntityLinkKey, FragmentRefKey, FragmentVarsKey } from './constants.ts';
import type { CursorEntry, DependencyKey, Storage, StorageKey } from './types.ts';
import type { Selection } from '@mearie/shared';

describe('CursorRegistry', () => {
  it('registers a cursor entry and retrieves it by depKey', () => {
    const registry = new CursorRegistry();
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    const depKey = 'User:1.name@{}' as DependencyKey;

    registry.add(depKey, entry);

    const entries = registry.get(depKey);
    expect(entries).toBeDefined();
    expect(entries!.size).toBe(1);
    expect(entries!.has(entry)).toBe(true);
  });

  it('returns undefined for unregistered depKey', () => {
    const registry = new CursorRegistry();
    const entries = registry.get('User:1.name@{}' as DependencyKey);
    expect(entries).toBeUndefined();
  });

  it('removes a cursor entry', () => {
    const registry = new CursorRegistry();
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    const depKey = 'User:1.name@{}' as DependencyKey;

    registry.add(depKey, entry);
    registry.remove(depKey, entry);

    const entries = registry.get(depKey);
    expect(entries).toBeUndefined();
  });

  it('supports multiple entries for the same depKey', () => {
    const registry = new CursorRegistry();
    const depKey = 'User:1.name@{}' as DependencyKey;
    const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    const entry2: CursorEntry = { subscriptionId: 2, path: ['author', 'name'] };

    registry.add(depKey, entry1);
    registry.add(depKey, entry2);

    const entries = registry.get(depKey);
    expect(entries!.size).toBe(2);
  });

  it('removeAll removes all entries for a subscription', () => {
    const registry = new CursorRegistry();
    const depKey1 = 'User:1.name@{}' as DependencyKey;
    const depKey2 = 'User:1.email@{}' as DependencyKey;
    const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    const entry2: CursorEntry = { subscriptionId: 1, path: ['user', 'email'] };
    const cursors = new Set([entry1, entry2]);

    registry.add(depKey1, entry1);
    registry.add(depKey2, entry2);

    registry.removeAll(cursors);

    expect(registry.get(depKey1)).toBeUndefined();
    expect(registry.get(depKey2)).toBeUndefined();
  });

  it('removeAll preserves entries from other subscriptions', () => {
    const registry = new CursorRegistry();
    const depKey = 'User:1.name@{}' as DependencyKey;
    const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
    const entry2: CursorEntry = { subscriptionId: 2, path: ['author', 'name'] };

    registry.add(depKey, entry1);
    registry.add(depKey, entry2);

    registry.removeAll(new Set([entry1]));

    const entries = registry.get(depKey);
    expect(entries).toBeDefined();
    expect(entries!.size).toBe(1);
    expect(entries!.has(entry2)).toBe(true);
  });

  it('clear removes all entries', () => {
    const registry = new CursorRegistry();
    const depKey = 'User:1.name@{}' as DependencyKey;
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };

    registry.add(depKey, entry);
    registry.clear();

    expect(registry.get(depKey)).toBeUndefined();
  });

  it('remove on a non-existent depKey does not throw', () => {
    const registry = new CursorRegistry();
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };

    expect(() => registry.remove('User:1.name@{}' as DependencyKey, entry)).not.toThrow();
  });

  it('removeAll with empty Set is a no-op', () => {
    const registry = new CursorRegistry();
    const depKey = 'User:1.name@{}' as DependencyKey;
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };

    registry.add(depKey, entry);
    registry.removeAll(new Set());

    const entries = registry.get(depKey);
    expect(entries).toBeDefined();
    expect(entries!.size).toBe(1);
    expect(entries!.has(entry)).toBe(true);
  });

  it('adding same CursorEntry object to same depKey twice deduplicates', () => {
    const registry = new CursorRegistry();
    const depKey = 'User:1.name@{}' as DependencyKey;
    const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };

    registry.add(depKey, entry);
    registry.add(depKey, entry);

    const entries = registry.get(depKey);
    expect(entries!.size).toBe(1);
  });

  describe('forEachByPrefix', () => {
    it('matches entries by shared prefix', () => {
      const registry = new CursorRegistry();
      const depKey1 = 'User:1.name@{}' as DependencyKey;
      const depKey2 = 'User:1.id@{}' as DependencyKey;
      const depKey3 = 'User:2.name@{}' as DependencyKey;
      const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
      const entry2: CursorEntry = { subscriptionId: 1, path: ['user', 'id'] };
      const entry3: CursorEntry = { subscriptionId: 2, path: ['author', 'name'] };

      registry.add(depKey1, entry1);
      registry.add(depKey2, entry2);
      registry.add(depKey3, entry3);

      const matched: CursorEntry[] = [];
      registry.forEachByPrefix('User:1.', (entry) => matched.push(entry));

      expect(matched).toHaveLength(2);
      expect(matched).toContain(entry1);
      expect(matched).toContain(entry2);
    });

    it('does not call callback on empty registry', () => {
      const registry = new CursorRegistry();
      const matched: CursorEntry[] = [];

      registry.forEachByPrefix('User:1.', (entry) => matched.push(entry));

      expect(matched).toHaveLength(0);
    });

    it('does not call callback when prefix matches no keys', () => {
      const registry = new CursorRegistry();
      const depKey = 'User:1.name@{}' as DependencyKey;
      const entry: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };

      registry.add(depKey, entry);

      const matched: CursorEntry[] = [];
      registry.forEachByPrefix('Post:1.', (entry) => matched.push(entry));

      expect(matched).toHaveLength(0);
    });

    it('prefix uses startsWith so User:1. also matches User:10.', () => {
      const registry = new CursorRegistry();
      const depKey1 = 'User:1.name@{}' as DependencyKey;
      const depKey10 = 'User:10.name@{}' as DependencyKey;
      const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
      const entry10: CursorEntry = { subscriptionId: 2, path: ['user10', 'name'] };

      registry.add(depKey1, entry1);
      registry.add(depKey10, entry10);

      const matched: CursorEntry[] = [];
      registry.forEachByPrefix('User:1', (entry) => matched.push(entry));

      expect(matched).toHaveLength(2);
      expect(matched).toContain(entry1);
      expect(matched).toContain(entry10);
    });

    it('calls callback once per entry when multiple entries share a depKey', () => {
      const registry = new CursorRegistry();
      const depKey = 'User:1.name@{}' as DependencyKey;
      const entry1: CursorEntry = { subscriptionId: 1, path: ['user', 'name'] };
      const entry2: CursorEntry = { subscriptionId: 2, path: ['author', 'name'] };

      registry.add(depKey, entry1);
      registry.add(depKey, entry2);

      const matched: CursorEntry[] = [];
      registry.forEachByPrefix('User:1.', (entry) => matched.push(entry));

      expect(matched).toHaveLength(2);
      expect(matched).toContain(entry1);
      expect(matched).toContain(entry2);
    });
  });
});

describe('traceSelections', () => {
  it('traces scalar fields and returns cursor entries', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.cursors.length).toBeGreaterThan(0);
    expect(result.missingDeps.size).toBe(0);
    expect(result.data).toEqual({ user: { __typename: 'User', id: '1', name: 'Alice' } });
  });

  it('returns incomplete when a required field is missing', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(false);
    expect(result.missingDeps.size).toBeGreaterThan(0);
  });

  it('traces through entity links recursively', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
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

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    const depKeys = result.cursors.map((c) => c.depKey);
    expect(depKeys).toContain('__root.user@{}');
    expect(depKeys).toContain('User:1.id@{}');
    expect(depKeys).toContain('User:1.name@{}');
  });

  it('returns incomplete when entity is missing from storage', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
    };
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

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(false);
  });

  it('handles null values as complete', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': null },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [{ kind: 'Field', name: 'id', type: 'ID' }],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({ user: null });
  });

  it('traces arrays of entity links', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        'users@{}': [{ [EntityLinkKey]: 'User:1' }, { [EntityLinkKey]: 'User:2' }],
      },
      ['User:1' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '1', 'name@{}': 'Alice' },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '2', 'name@{}': 'Bob' },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'users',
        type: 'User',
        array: true,
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({
      users: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
    });
  });

  it('checks fragment sub-selections for completeness', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          {
            kind: 'FragmentSpread',
            name: 'UserProfile',
            selections: [
              { kind: 'Field', name: 'name', type: 'String' },
              { kind: 'Field', name: 'email', type: 'String' },
            ],
          },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(false);
    expect(result.missingDeps.size).toBeGreaterThan(0);
  });

  it('merges InlineFragment sub-selections when on matches __typename', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'node@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'node',
        type: 'Node',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          {
            kind: 'InlineFragment',
            on: 'User',
            selections: [{ kind: 'Field', name: 'name', type: 'String' }],
          },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({ node: { __typename: 'User', id: '1', name: 'Alice' } });
  });

  it('skips InlineFragment when on does not match __typename', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'node@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'node',
        type: 'Node',
        selections: [
          { kind: 'Field', name: '__typename', type: 'String' },
          { kind: 'Field', name: 'id', type: 'ID' },
          {
            kind: 'InlineFragment',
            on: 'Post',
            selections: [{ kind: 'Field', name: 'title', type: 'String' }],
          },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({ node: { __typename: 'User', id: '1' } });
  });

  it('uses alias as output key and cursor path segment', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [{ kind: 'Field', name: 'name', type: 'String', alias: 'displayName' }],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({ user: { displayName: 'Alice' } });

    const nameCursor = result.cursors.find((c) => c.depKey === 'User:1.name@{}');
    expect(nameCursor).toBeDefined();
    expect(nameCursor!.entry.path).toEqual(['user', 'displayName']);
  });

  it('FragmentSpread with args sets FragmentVarsKey with merged variables', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          {
            kind: 'FragmentSpread',
            name: 'UserDetail',
            args: { size: { kind: 'literal', value: 'large' } },
            selections: [{ kind: 'Field', name: 'name', type: 'String' }],
          },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], { limit: 10 }, RootFieldKey, [], 1);

    const data = result.data as Record<string, Record<string, unknown> | undefined>;
    expect(data.user![FragmentRefKey]).toBe('User:1');
    expect(data.user![FragmentVarsKey]).toEqual({
      UserDetail: { limit: 10, size: 'large' },
    });
  });

  it('resolves a 3-level deep entity chain correctly', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'company@{}': { [EntityLinkKey]: 'Company:1' },
      },
      ['Company:1' as StorageKey]: {
        '__typename@{}': 'Company',
        'id@{}': '1',
        'ceo@{}': { [EntityLinkKey]: 'User:2' },
      },
      ['User:2' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '2',
        'name@{}': 'Bob',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'user',
        type: 'User',
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          {
            kind: 'Field',
            name: 'company',
            type: 'Company',
            selections: [
              { kind: 'Field', name: 'id', type: 'ID' },
              {
                kind: 'Field',
                name: 'ceo',
                type: 'User',
                selections: [
                  { kind: 'Field', name: 'id', type: 'ID' },
                  { kind: 'Field', name: 'name', type: 'String' },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({
      user: {
        id: '1',
        company: {
          id: '1',
          ceo: { id: '2', name: 'Bob' },
        },
      },
    });

    const depKeys = result.cursors.map((c) => c.depKey);
    expect(depKeys).toContain('User:1.id@{}');
    expect(depKeys).toContain('User:1.company@{}');
    expect(depKeys).toContain('Company:1.id@{}');
    expect(depKeys).toContain('Company:1.ceo@{}');
    expect(depKeys).toContain('User:2.id@{}');
    expect(depKeys).toContain('User:2.name@{}');
  });

  it('preserves null items in arrays and remains complete', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        'users@{}': [{ [EntityLinkKey]: 'User:1' }, null, { [EntityLinkKey]: 'User:2' }],
      },
      ['User:1' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '1', 'name@{}': 'Alice' },
      ['User:2' as StorageKey]: { '__typename@{}': 'User', 'id@{}': '2', 'name@{}': 'Bob' },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'users',
        type: 'User',
        array: true,
        selections: [
          { kind: 'Field', name: 'id', type: 'ID' },
          { kind: 'Field', name: 'name', type: 'String' },
        ],
      },
    ];

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(result.complete).toBe(true);
    expect(result.data).toEqual({
      users: [{ id: '1', name: 'Alice' }, null, { id: '2', name: 'Bob' }],
    });
  });

  it('prefixes all cursor paths with basePath', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
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

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, ['root', 0], 1);

    for (const cursor of result.cursors) {
      expect(cursor.entry.path[0]).toBe('root');
      expect(cursor.entry.path[1]).toBe(0);
    }

    const userCursor = result.cursors.find((c) => c.depKey === '__root.user@{}');
    expect(userCursor!.entry.path).toEqual(['root', 0, 'user']);

    const nameCursor = result.cursors.find((c) => c.depKey === 'User:1.name@{}');
    expect(nameCursor!.entry.path).toEqual(['root', 0, 'user', 'name']);
  });

  it('all emitted cursor entries have the correct subscriptionId', () => {
    const storage: Storage = {
      [RootFieldKey]: { 'user@{}': { [EntityLinkKey]: 'User:1' } },
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };
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

    const result = traceSelections(selections, storage, storage[RootFieldKey], {}, RootFieldKey, [], 42);

    expect(result.cursors.length).toBeGreaterThan(0);
    for (const cursor of result.cursors) {
      expect(cursor.entry.subscriptionId).toBe(42);
    }
  });

  it('embedded object (sk === null) produces no cursor entries for sub-fields and missing sub-fields cause incomplete', () => {
    const storage: Storage = {
      [RootFieldKey]: {
        'config@{}': { 'theme@{}': 'dark' },
      },
    };

    const selectionsComplete: Selection[] = [
      {
        kind: 'Field',
        name: 'config',
        type: 'Config',
        selections: [{ kind: 'Field', name: 'theme', type: 'String' }],
      },
    ];

    const resultComplete = traceSelections(selectionsComplete, storage, storage[RootFieldKey], {}, RootFieldKey, [], 1);

    expect(resultComplete.complete).toBe(true);
    expect(resultComplete.data).toEqual({ config: { theme: 'dark' } });

    const subFieldCursors = resultComplete.cursors.filter((c) => c.depKey !== '__root.config@{}');
    expect(subFieldCursors).toHaveLength(0);

    const selectionsIncomplete: Selection[] = [
      {
        kind: 'Field',
        name: 'config',
        type: 'Config',
        selections: [
          { kind: 'Field', name: 'theme', type: 'String' },
          { kind: 'Field', name: 'locale', type: 'String' },
        ],
      },
    ];

    const resultIncomplete = traceSelections(
      selectionsIncomplete,
      storage,
      storage[RootFieldKey],
      {},
      RootFieldKey,
      [],
      1,
    );

    expect(resultIncomplete.complete).toBe(false);
  });
});
