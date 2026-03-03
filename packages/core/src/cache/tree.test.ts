import { describe, it, expect } from 'vitest';
import {
  buildEntryTree,
  findEntryTreeNode,
  removeSubtreeEntries,
  snapshotFields,
  partialDenormalize,
  rebuildArrayIndices,
} from './tree.ts';
import type { EntryTuple } from './tree.ts';
import { RootFieldKey, EntityLinkKey } from './constants.ts';
import type {
  DependencyKey,
  EntryTreeNode,
  QuerySubscription,
  Storage,
  StorageKey,
  SubscriptionEntry,
} from './types.ts';

describe('buildEntryTree', () => {
  it('scalar fields query { name, email }', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: 'name@{}', path: ['name'], selections: undefined },
      { storageKey: RootFieldKey, fieldKey: 'email@{}', path: ['email'], selections: undefined },
    ];

    const root = buildEntryTree(tuples);

    expect(root.depKey).toBe('__root');
    expect(root.children.size).toBe(2);
    expect(root.children.get('name')?.depKey).toBe('__root.name@{}');
    expect(root.children.get('email')?.depKey).toBe('__root.email@{}');
  });

  it('nested entity { post { author { name } } }', () => {
    const authorSelections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
    const postSelections = [
      {
        kind: 'Field' as const,
        name: 'author',
        type: 'User',
        selections: authorSelections,
      },
    ];

    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: 'post@{}', path: ['post'], selections: postSelections },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: 'author@{}',
        path: ['post', 'author'],
        selections: authorSelections,
      },
      {
        storageKey: 'User:1' as StorageKey,
        fieldKey: 'name@{}',
        path: ['post', 'author', 'name'],
        selections: undefined,
      },
    ];

    const root = buildEntryTree(tuples);

    const postNode = root.children.get('post');
    expect(postNode).toBeDefined();
    expect(postNode!.depKey).toBe('__root.post@{}');
    expect(postNode!.selections).toBe(postSelections);

    const authorNode = postNode!.children.get('author');
    expect(authorNode).toBeDefined();
    expect(authorNode!.depKey).toBe('User:1.author@{}');

    const nameNode = authorNode!.children.get('name');
    expect(nameNode).toBeDefined();
    expect(nameNode!.depKey).toBe('User:1.name@{}');
  });

  it('entity array { posts { title } }', () => {
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: 'posts@{}', path: ['posts'], selections: undefined },
      { storageKey: 'Post:1' as StorageKey, fieldKey: 'title@{}', path: ['posts', 0, 'title'], selections: undefined },
      { storageKey: 'Post:2' as StorageKey, fieldKey: 'title@{}', path: ['posts', 1, 'title'], selections: undefined },
    ];

    const root = buildEntryTree(tuples);

    const postsNode = root.children.get('posts');
    expect(postsNode).toBeDefined();
    expect(postsNode!.children.has('0')).toBe(true);
    expect(postsNode!.children.has('1')).toBe(true);

    const post0 = postsNode!.children.get('0');
    expect(post0!.children.get('title')!.depKey).toBe('Post:1.title@{}');

    const post1 = postsNode!.children.get('1');
    expect(post1!.children.get('title')!.depKey).toBe('Post:2.title@{}');
  });

  it('leaf nodes have no selections, entity nodes have selections', () => {
    const entitySelections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
    const tuples: EntryTuple[] = [
      { storageKey: RootFieldKey, fieldKey: 'user@{}', path: ['user'], selections: entitySelections },
      { storageKey: 'User:1' as StorageKey, fieldKey: 'name@{}', path: ['user', 'name'], selections: undefined },
    ];

    const root = buildEntryTree(tuples);

    const userNode = root.children.get('user');
    expect(userNode!.selections).toBe(entitySelections);

    const nameNode = userNode!.children.get('name');
    expect(nameNode!.selections).toBeUndefined();
  });

  it('empty tuples returns root only with empty children', () => {
    const root = buildEntryTree([]);

    expect(root.depKey).toBe('__root');
    expect(root.children.size).toBe(0);
  });

  it('same field referenced at different paths creates separate nodes', () => {
    const tuples: EntryTuple[] = [
      { storageKey: 'User:1' as StorageKey, fieldKey: 'name@{}', path: ['a', 'name'], selections: undefined },
      { storageKey: 'User:1' as StorageKey, fieldKey: 'name@{}', path: ['b', 'name'], selections: undefined },
    ];

    const root = buildEntryTree(tuples);

    const aNode = root.children.get('a');
    const bNode = root.children.get('b');
    expect(aNode).not.toBe(bNode);
    expect(aNode!.children.get('name')!.depKey).toBe('User:1.name@{}');
    expect(bNode!.children.get('name')!.depKey).toBe('User:1.name@{}');
  });

  it('fieldKey with arguments preserves full key in depKey', () => {
    const tuples: EntryTuple[] = [
      {
        storageKey: RootFieldKey,
        fieldKey: 'posts@{"first":10}' as `${string}@${string}`,
        path: ['posts'],
        selections: undefined,
      },
    ];

    const root = buildEntryTree(tuples);

    const postsNode = root.children.get('posts');
    expect(postsNode).toBeDefined();
    expect(postsNode!.depKey).toBe('__root.posts@{"first":10}');
    expect(postsNode!.children.size).toBe(0);
  });
});

describe('findEntryTreeNode', () => {
  const buildSimpleTree = (): EntryTreeNode => {
    const root: EntryTreeNode = {
      depKey: '__root' as DependencyKey,
      children: new Map(),
    };
    const userNode: EntryTreeNode = {
      depKey: '__root.user@{}' as DependencyKey,
      children: new Map(),
    };
    const nameNode: EntryTreeNode = {
      depKey: 'User:1.name@{}' as DependencyKey,
      children: new Map(),
    };
    userNode.children.set('name', nameNode);
    root.children.set('user', userNode);

    const postsNode: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map(),
    };
    const post0: EntryTreeNode = {
      depKey: '' as DependencyKey,
      children: new Map(),
    };
    const titleNode: EntryTreeNode = {
      depKey: 'Post:1.title@{}' as DependencyKey,
      children: new Map(),
    };
    post0.children.set('title', titleNode);
    postsNode.children.set('0', post0);
    root.children.set('posts', postsNode);

    return root;
  };

  it('valid path returns correct node', () => {
    const root = buildSimpleTree();
    const node = findEntryTreeNode(root, ['user', 'name']);
    expect(node?.depKey).toBe('User:1.name@{}');
  });

  it('invalid path returns undefined', () => {
    const root = buildSimpleTree();
    const node = findEntryTreeNode(root, ['nonexistent']);
    expect(node).toBeUndefined();
  });

  it('empty path returns root', () => {
    const root = buildSimpleTree();
    const node = findEntryTreeNode(root, []);
    expect(node).toBe(root);
  });

  it('partial valid path returns undefined when last segment is invalid', () => {
    const root = buildSimpleTree();
    const node = findEntryTreeNode(root, ['user', 'nonexistent']);
    expect(node).toBeUndefined();
  });

  it('array index path with string keys', () => {
    const root = buildSimpleTree();
    const node = findEntryTreeNode(root, ['posts', 0, 'title']);
    expect(node?.depKey).toBe('Post:1.title@{}');
  });
});

describe('removeSubtreeEntries', () => {
  const makeSubscription = (): QuerySubscription => ({
    listener: () => {},
    selections: [],
    variables: {},
    entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
  });

  it('single leaf removes entry from subscriptions map', () => {
    const sub = makeSubscription();
    const node: EntryTreeNode = {
      depKey: '__root.name@{}' as DependencyKey,
      children: new Map(),
    };
    const entry: SubscriptionEntry = { path: ['name'], subscription: sub };
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>([
      ['__root.name@{}' as DependencyKey, new Set([entry])],
    ]);

    removeSubtreeEntries(node, sub, subscriptions);

    expect(subscriptions.has('__root.name@{}' as DependencyKey)).toBe(false);
  });

  it('deep tree recursively removes all children entries', () => {
    const sub = makeSubscription();
    const leafNode: EntryTreeNode = {
      depKey: 'User:1.name@{}' as DependencyKey,
      children: new Map(),
    };
    const midNode: EntryTreeNode = {
      depKey: '__root.user@{}' as DependencyKey,
      children: new Map([['name', leafNode]]),
    };

    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>([
      ['__root.user@{}' as DependencyKey, new Set([{ path: ['user'], subscription: sub }])],
      ['User:1.name@{}' as DependencyKey, new Set([{ path: ['user', 'name'], subscription: sub }])],
    ]);

    removeSubtreeEntries(midNode, sub, subscriptions);

    expect(subscriptions.has('__root.user@{}' as DependencyKey)).toBe(false);
    expect(subscriptions.has('User:1.name@{}' as DependencyKey)).toBe(false);
    expect(midNode.children.size).toBe(0);
  });

  it('empty Set causes depKey to be deleted', () => {
    const sub = makeSubscription();
    const node: EntryTreeNode = {
      depKey: '__root.name@{}' as DependencyKey,
      children: new Map(),
    };
    const entry: SubscriptionEntry = { path: ['name'], subscription: sub };
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>([
      ['__root.name@{}' as DependencyKey, new Set([entry])],
    ]);

    removeSubtreeEntries(node, sub, subscriptions);

    expect(subscriptions.has('__root.name@{}' as DependencyKey)).toBe(false);
  });

  it('other subscriptions on same depKey are preserved', () => {
    const sub1 = makeSubscription();
    const sub2 = makeSubscription();
    const node: EntryTreeNode = {
      depKey: '__root.name@{}' as DependencyKey,
      children: new Map(),
    };
    const entry1: SubscriptionEntry = { path: ['name'], subscription: sub1 };
    const entry2: SubscriptionEntry = { path: ['name'], subscription: sub2 };
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>([
      ['__root.name@{}' as DependencyKey, new Set([entry1, entry2])],
    ]);

    removeSubtreeEntries(node, sub1, subscriptions);

    const remaining = subscriptions.get('__root.name@{}' as DependencyKey);
    expect(remaining).toBeDefined();
    expect(remaining!.size).toBe(1);
    expect([...remaining!][0]!.subscription).toBe(sub2);
  });

  it('3-level deep tree recursively removes all entries', () => {
    const sub = makeSubscription();
    const level3: EntryTreeNode = {
      depKey: 'User:1.name@{}' as DependencyKey,
      children: new Map(),
    };
    const level2: EntryTreeNode = {
      depKey: 'Post:1.author@{}' as DependencyKey,
      children: new Map([['name', level3]]),
    };
    const level1: EntryTreeNode = {
      depKey: '__root.post@{}' as DependencyKey,
      children: new Map([['author', level2]]),
    };

    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>([
      ['__root.post@{}' as DependencyKey, new Set([{ path: ['post'], subscription: sub }])],
      ['Post:1.author@{}' as DependencyKey, new Set([{ path: ['post', 'author'], subscription: sub }])],
      ['User:1.name@{}' as DependencyKey, new Set([{ path: ['post', 'author', 'name'], subscription: sub }])],
    ]);

    removeSubtreeEntries(level1, sub, subscriptions);

    expect(subscriptions.has('__root.post@{}' as DependencyKey)).toBe(false);
    expect(subscriptions.has('Post:1.author@{}' as DependencyKey)).toBe(false);
    expect(subscriptions.has('User:1.name@{}' as DependencyKey)).toBe(false);
    expect(level1.children.size).toBe(0);
    expect(level2.children.size).toBe(0);
  });

  it('already empty node does not throw', () => {
    const sub = makeSubscription();
    const node: EntryTreeNode = {
      depKey: '__root.name@{}' as DependencyKey,
      children: new Map(),
    };
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    expect(() => removeSubtreeEntries(node, sub, subscriptions)).not.toThrow();
  });
});

describe('snapshotFields', () => {
  it('returns current storage values for direct children', () => {
    const node: EntryTreeNode = {
      depKey: '__root' as DependencyKey,
      children: new Map([
        [
          'name',
          {
            depKey: '__root.name@{}' as DependencyKey,
            children: new Map(),
          },
        ],
        [
          'age',
          {
            depKey: '__root.age@{}' as DependencyKey,
            children: new Map(),
          },
        ],
      ]),
    };

    const storage: Storage = {
      [RootFieldKey]: {
        'name@{}': 'Alice',
        'age@{}': 30,
      },
    };

    const result = snapshotFields(node, storage);

    expect(result.get('name')).toBe('Alice');
    expect(result.get('age')).toBe(30);
    expect(result.size).toBe(2);
  });

  it('storage missing returns empty for that field', () => {
    const node: EntryTreeNode = {
      depKey: '__root' as DependencyKey,
      children: new Map([
        [
          'name',
          {
            depKey: 'Missing:1.name@{}' as DependencyKey,
            children: new Map(),
          },
        ],
      ]),
    };

    const storage: Storage = {
      [RootFieldKey]: {},
    };

    const result = snapshotFields(node, storage);

    expect(result.has('name')).toBe(false);
  });

  it('empty children returns empty Map', () => {
    const node: EntryTreeNode = {
      depKey: '__root' as DependencyKey,
      children: new Map(),
    };

    const storage: Storage = {
      [RootFieldKey]: { 'name@{}': 'Alice' },
    };

    const result = snapshotFields(node, storage);

    expect(result.size).toBe(0);
  });

  it('array field value returned as-is', () => {
    const arrayValue = [{ [EntityLinkKey]: 'Post:1' as const }, { [EntityLinkKey]: 'Post:2' as const }];
    const node: EntryTreeNode = {
      depKey: '__root' as DependencyKey,
      children: new Map([
        [
          'posts',
          {
            depKey: '__root.posts@{}' as DependencyKey,
            children: new Map(),
          },
        ],
      ]),
    };

    const storage: Storage = {
      [RootFieldKey]: {
        'posts@{}': arrayValue,
      },
    };

    const result = snapshotFields(node, storage);

    expect(result.get('posts')).toBe(arrayValue);
    expect(Array.isArray(result.get('posts'))).toBe(true);
    expect(result.size).toBe(1);
  });

  it('entity link values returned as-is', () => {
    const link = { [EntityLinkKey]: 'User:1' as const };
    const node: EntryTreeNode = {
      depKey: '__root' as DependencyKey,
      children: new Map([
        [
          'user',
          {
            depKey: '__root.user@{}' as DependencyKey,
            children: new Map(),
          },
        ],
      ]),
    };

    const storage: Storage = {
      [RootFieldKey]: {
        'user@{}': link,
      },
    };

    const result = snapshotFields(node, storage);

    expect(result.get('user')).toBe(link);
  });
});

describe('partialDenormalize', () => {
  it('simple entity with scalar fields', () => {
    const selections = [
      { kind: 'Field' as const, name: 'name', type: 'String' },
      { kind: 'Field' as const, name: 'email', type: 'String' },
    ];

    const entity: Record<string, unknown> = {
      'name@{}': 'Alice',
      'email@{}': 'alice@example.com',
    };

    const node: EntryTreeNode = {
      depKey: 'User:1.__typename@{}' as DependencyKey,
      children: new Map(),
      selections,
    };

    const basePath: (string | number)[] = ['user'];
    const rebuiltDepKeys = new Set<DependencyKey>();
    const storage = {
      [RootFieldKey]: {},
      ['User:1' as StorageKey]: entity,
    } as unknown as Storage;
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    const subscription: QuerySubscription = {
      listener: () => {},
      selections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(node, entity, basePath, rebuiltDepKeys, storage, subscriptions, subscription);

    expect(result.data).toEqual({ name: 'Alice', email: 'alice@example.com' });
    expect(rebuiltDepKeys.size).toBeGreaterThan(0);
    expect(node.children.size).toBeGreaterThan(0);
    expect(subscriptions.size).toBeGreaterThan(0);
  });

  it('returns null data when entity is null', () => {
    const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
    const node: EntryTreeNode = {
      depKey: 'User:1.__typename@{}' as DependencyKey,
      children: new Map(),
      selections,
    };

    const subscription: QuerySubscription = {
      listener: () => {},
      selections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(
      node,
      null as unknown as Record<string, unknown>,
      ['user'],
      new Set(),
      { [RootFieldKey]: {} },
      new Map(),
      subscription,
    );

    expect(result.data).toBe(null);
    expect(result.fieldValues.size).toBe(0);
  });

  it('returns undefined data when entity is undefined', () => {
    const selections = [{ kind: 'Field' as const, name: 'name', type: 'String' }];
    const node: EntryTreeNode = {
      depKey: 'User:1.__typename@{}' as DependencyKey,
      children: new Map(),
      selections,
    };

    const subscription: QuerySubscription = {
      listener: () => {},
      selections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(
      node,
      undefined as unknown as Record<string, unknown>,
      ['user'],
      new Set(),
      { [RootFieldKey]: {} },
      new Map(),
      subscription,
    );

    expect(result.data).toBeUndefined();
    expect(result.fieldValues.size).toBe(0);
  });

  it('returns null data when node has no selections', () => {
    const node: EntryTreeNode = {
      depKey: 'User:1.name@{}' as DependencyKey,
      children: new Map(),
    };

    const subscription: QuerySubscription = {
      listener: () => {},
      selections: [],
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(node, {}, ['user'], new Set(), { [RootFieldKey]: {} }, new Map(), subscription);

    expect(result.data).toBe(null);
    expect(result.fieldValues.size).toBe(0);
  });

  it('all new depKeys are recorded in rebuiltDepKeys', () => {
    const selections = [
      { kind: 'Field' as const, name: 'name', type: 'String' },
      { kind: 'Field' as const, name: 'age', type: 'Int' },
    ];

    const entity: Record<string, unknown> = {
      'name@{}': 'Bob',
      'age@{}': 25,
    };

    const node: EntryTreeNode = {
      depKey: 'User:2.__typename@{}' as DependencyKey,
      children: new Map(),
      selections,
    };

    const rebuiltDepKeys = new Set<DependencyKey>();
    const storage = { [RootFieldKey]: {}, ['User:2' as StorageKey]: entity } as unknown as Storage;
    const subscription: QuerySubscription = {
      listener: () => {},
      selections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    partialDenormalize(node, entity, ['user'], rebuiltDepKeys, storage, new Map(), subscription);

    expect(rebuiltDepKeys.size).toBeGreaterThan(0);
    for (const depKey of rebuiltDepKeys) {
      expect(typeof depKey).toBe('string');
      expect(depKey).toContain('.');
    }
  });

  it('fieldValues map has correct top-level field values', () => {
    const selections = [
      { kind: 'Field' as const, name: 'name', type: 'String' },
      { kind: 'Field' as const, name: 'active', type: 'Boolean' },
    ];

    const entity: Record<string, unknown> = {
      'name@{}': 'Charlie',
      'active@{}': true,
    };

    const node: EntryTreeNode = {
      depKey: '' as DependencyKey,
      children: new Map(),
      selections,
    };

    const storage: Storage = { [RootFieldKey]: {} };
    const subscription: QuerySubscription = {
      listener: () => {},
      selections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(node, entity, [], new Set(), storage, new Map(), subscription);

    expect(result.fieldValues.get('name')).toBe('Charlie');
    expect(result.fieldValues.get('active')).toBe(true);
  });

  it('nested entity creates recursive children', () => {
    const innerSelections = [
      { kind: 'Field' as const, name: '__typename', type: 'String' },
      { kind: 'Field' as const, name: 'id', type: 'ID' },
      { kind: 'Field' as const, name: 'name', type: 'String' },
    ];
    const outerSelections = [
      {
        kind: 'Field' as const,
        name: 'author',
        type: 'User',
        selections: innerSelections,
      },
    ];

    const entity: Record<string, unknown> = {
      'author@{}': { __ref: 'User:1' },
    };

    const storage: Storage = {
      [RootFieldKey]: {},
      ['User:1' as StorageKey]: {
        '__typename@{}': 'User',
        'id@{}': '1',
        'name@{}': 'Alice',
      },
    };

    const node: EntryTreeNode = {
      depKey: '' as DependencyKey,
      children: new Map(),
      selections: outerSelections,
    };

    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();
    const subscription: QuerySubscription = {
      listener: () => {},
      selections: outerSelections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(node, entity, ['post'], new Set(), storage, subscriptions, subscription);

    expect(result.data).toEqual({
      author: { __typename: 'User', id: '1', name: 'Alice' },
    });
    expect(node.children.has('author')).toBe(true);
  });

  it('array field creates index-based children', () => {
    const itemSelections = [
      { kind: 'Field' as const, name: '__typename', type: 'String' },
      { kind: 'Field' as const, name: 'id', type: 'ID' },
      { kind: 'Field' as const, name: 'title', type: 'String' },
    ];
    const selections = [
      {
        kind: 'Field' as const,
        name: 'posts',
        type: 'Post',
        selections: itemSelections,
      },
    ];

    const entity: Record<string, unknown> = {
      'posts@{}': [{ __ref: 'Post:1' }, { __ref: 'Post:2' }],
    };

    const storage: Storage = {
      [RootFieldKey]: {},
      ['Post:1' as StorageKey]: {
        '__typename@{}': 'Post',
        'id@{}': '1',
        'title@{}': 'First',
      },
      ['Post:2' as StorageKey]: {
        '__typename@{}': 'Post',
        'id@{}': '2',
        'title@{}': 'Second',
      },
    };

    const node: EntryTreeNode = {
      depKey: '' as DependencyKey,
      children: new Map(),
      selections,
    };

    const subscription: QuerySubscription = {
      listener: () => {},
      selections,
      variables: {},
      entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
    };

    const result = partialDenormalize(node, entity, [], new Set(), storage, new Map(), subscription);

    expect(result.data).toEqual({
      posts: [
        { __typename: 'Post', id: '1', title: 'First' },
        { __typename: 'Post', id: '2', title: 'Second' },
      ],
    });

    const postsNode = node.children.get('posts');
    expect(postsNode).toBeDefined();
  });
});

describe('rebuildArrayIndices', () => {
  const makeSubscription = (): QuerySubscription => ({
    listener: () => {},
    selections: [],
    variables: {},
    entryTree: { depKey: '__root' as DependencyKey, children: new Map() },
  });

  it('3 items, remove middle, reindexed to "0" and "1"', () => {
    const sub = makeSubscription();
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    const child0: EntryTreeNode = { depKey: 'Post:1.title@{}' as DependencyKey, children: new Map() };
    const child2: EntryTreeNode = { depKey: 'Post:3.title@{}' as DependencyKey, children: new Map() };

    const node: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map([
        ['0', child0],
        ['2', child2],
      ]),
    };

    const entry0: SubscriptionEntry = { path: ['posts', 0, 'title'], subscription: sub };
    const entry2: SubscriptionEntry = { path: ['posts', 2, 'title'], subscription: sub };
    subscriptions.set('Post:1.title@{}' as DependencyKey, new Set([entry0]));
    subscriptions.set('Post:3.title@{}' as DependencyKey, new Set([entry2]));

    const parentEntry: SubscriptionEntry = { path: ['posts'], subscription: sub };

    rebuildArrayIndices(node, parentEntry, subscriptions);

    expect([...node.children.keys()]).toEqual(['0', '1']);
    expect(node.children.get('0')).toBe(child0);
    expect(node.children.get('1')).toBe(child2);

    expect(entry0.path).toEqual(['posts', 0, 'title']);
    expect(entry2.path).toEqual(['posts', 1, 'title']);
  });

  it('swap updates children keys', () => {
    const sub = makeSubscription();
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    const child0: EntryTreeNode = { depKey: 'Post:A.title@{}' as DependencyKey, children: new Map() };
    const child1: EntryTreeNode = { depKey: 'Post:B.title@{}' as DependencyKey, children: new Map() };

    const node: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map([
        ['1', child0],
        ['0', child1],
      ]),
    };

    const entryA: SubscriptionEntry = { path: ['posts', 1, 'title'], subscription: sub };
    const entryB: SubscriptionEntry = { path: ['posts', 0, 'title'], subscription: sub };
    subscriptions.set('Post:A.title@{}' as DependencyKey, new Set([entryA]));
    subscriptions.set('Post:B.title@{}' as DependencyKey, new Set([entryB]));

    const parentEntry: SubscriptionEntry = { path: ['posts'], subscription: sub };

    rebuildArrayIndices(node, parentEntry, subscriptions);

    expect([...node.children.keys()]).toEqual(['0', '1']);
    expect(node.children.get('0')).toBe(child1);
    expect(node.children.get('1')).toBe(child0);

    expect(entryB.path).toEqual(['posts', 0, 'title']);
    expect(entryA.path).toEqual(['posts', 1, 'title']);
  });

  it('nested entity children paths also updated', () => {
    const sub = makeSubscription();
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    const nameNode: EntryTreeNode = { depKey: 'User:1.name@{}' as DependencyKey, children: new Map() };
    const authorNode: EntryTreeNode = {
      depKey: 'Post:1.author@{}' as DependencyKey,
      children: new Map([['name', nameNode]]),
    };
    const child0: EntryTreeNode = {
      depKey: '' as DependencyKey,
      children: new Map([['author', authorNode]]),
    };

    const node: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map([['2', child0]]),
    };

    const nameEntry: SubscriptionEntry = { path: ['posts', 2, 'author', 'name'], subscription: sub };
    const authorEntry: SubscriptionEntry = { path: ['posts', 2, 'author'], subscription: sub };
    subscriptions.set('User:1.name@{}' as DependencyKey, new Set([nameEntry]));
    subscriptions.set('Post:1.author@{}' as DependencyKey, new Set([authorEntry]));

    const parentEntry: SubscriptionEntry = { path: ['posts'], subscription: sub };

    rebuildArrayIndices(node, parentEntry, subscriptions);

    expect([...node.children.keys()]).toEqual(['0']);
    expect(nameEntry.path).toEqual(['posts', 0, 'author', 'name']);
    expect(authorEntry.path).toEqual(['posts', 0, 'author']);
  });

  it('single element stays at "0"', () => {
    const sub = makeSubscription();
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    const child: EntryTreeNode = { depKey: 'Post:1.title@{}' as DependencyKey, children: new Map() };
    const node: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map([['0', child]]),
    };

    const entry: SubscriptionEntry = { path: ['posts', 0, 'title'], subscription: sub };
    subscriptions.set('Post:1.title@{}' as DependencyKey, new Set([entry]));

    const parentEntry: SubscriptionEntry = { path: ['posts'], subscription: sub };

    rebuildArrayIndices(node, parentEntry, subscriptions);

    expect([...node.children.keys()]).toEqual(['0']);
    expect(node.children.get('0')).toBe(child);
    expect(entry.path).toEqual(['posts', 0, 'title']);
  });

  it('empty node is a no-op', () => {
    const sub = makeSubscription();
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    const node: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map(),
    };

    const parentEntry: SubscriptionEntry = { path: ['posts'], subscription: sub };

    expect(() => rebuildArrayIndices(node, parentEntry, subscriptions)).not.toThrow();
    expect(node.children.size).toBe(0);
  });

  it('after insertion existing items are shifted', () => {
    const sub = makeSubscription();
    const subscriptions = new Map<DependencyKey, Set<SubscriptionEntry>>();

    const childA: EntryTreeNode = { depKey: 'Post:A.title@{}' as DependencyKey, children: new Map() };
    const childNew: EntryTreeNode = { depKey: 'Post:New.title@{}' as DependencyKey, children: new Map() };
    const childB: EntryTreeNode = { depKey: 'Post:B.title@{}' as DependencyKey, children: new Map() };

    const node: EntryTreeNode = {
      depKey: '__root.posts@{}' as DependencyKey,
      children: new Map([
        ['0', childA],
        ['1', childNew],
        ['2', childB],
      ]),
    };

    const entryA: SubscriptionEntry = { path: ['posts', 0, 'title'], subscription: sub };
    const entryNew: SubscriptionEntry = { path: ['posts', 1, 'title'], subscription: sub };
    const entryB: SubscriptionEntry = { path: ['posts', 2, 'title'], subscription: sub };
    subscriptions.set('Post:A.title@{}' as DependencyKey, new Set([entryA]));
    subscriptions.set('Post:New.title@{}' as DependencyKey, new Set([entryNew]));
    subscriptions.set('Post:B.title@{}' as DependencyKey, new Set([entryB]));

    const parentEntry: SubscriptionEntry = { path: ['posts'], subscription: sub };

    rebuildArrayIndices(node, parentEntry, subscriptions);

    expect([...node.children.keys()]).toEqual(['0', '1', '2']);
    expect(node.children.get('0')).toBe(childA);
    expect(node.children.get('1')).toBe(childNew);
    expect(node.children.get('2')).toBe(childB);

    expect(entryA.path).toEqual(['posts', 0, 'title']);
    expect(entryNew.path).toEqual(['posts', 1, 'title']);
    expect(entryB.path).toEqual(['posts', 2, 'title']);
  });
});
