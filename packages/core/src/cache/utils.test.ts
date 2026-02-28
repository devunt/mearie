import { describe, it, expect } from 'vitest';
import {
  makeEntityKey,
  makeFieldKey,
  makeFieldKeyFromArgs,
  resolveArguments,
  isEntityLink,
  isFragmentRefArray,
  replaceEqualDeep,
} from './utils.ts';
import { EntityLinkKey, FragmentRefKey } from './constants.ts';
import type { FieldSelection, FragmentRefs } from '@mearie/shared';

describe('makeEntityKey', () => {
  it('should create key with single value', () => {
    const key = makeEntityKey('User', ['1']);
    expect(key).toBe('User:1');
  });

  it('should create key with multiple values in order', () => {
    const key = makeEntityKey('Comment', ['post-123', 'comment-456']);
    expect(key).toBe('Comment:post-123:comment-456');
  });

  it('should handle numeric values', () => {
    const key = makeEntityKey('User', [123]);
    expect(key).toBe('User:123');
  });

  it('should handle falsy values', () => {
    expect(makeEntityKey('User', [0])).toBe('User:0');
    expect(makeEntityKey('User', [false])).toBe('User:false');
    expect(makeEntityKey('User', [''])).toBe('User:');
  });

  it('should handle null and undefined as empty string', () => {
    expect(makeEntityKey('User', [null])).toBe('User:');
    expect(makeEntityKey('User', [undefined])).toBe('User:');
  });

  it('should handle partial key values', () => {
    const key = makeEntityKey('Comment', ['post-1', undefined]);
    expect(key).toBe('Comment:post-1:');
  });

  it('should preserve key field order', () => {
    const key1 = makeEntityKey('Comment', ['a', 'b']);
    const key2 = makeEntityKey('Comment', ['b', 'a']);
    expect(key1).not.toBe(key2);
    expect(key1).toBe('Comment:a:b');
    expect(key2).toBe('Comment:b:a');
  });
});

describe('resolveArguments', () => {
  it('should resolve literal arguments', () => {
    const args = {
      limit: { kind: 'literal' as const, value: 10 },
      offset: { kind: 'literal' as const, value: 0 },
    };

    const resolved = resolveArguments(args, {});

    expect(resolved).toEqual({
      limit: 10,
      offset: 0,
    });
  });

  it('should resolve variable arguments', () => {
    const args = {
      limit: { kind: 'variable' as const, name: 'limit' },
      offset: { kind: 'variable' as const, name: 'offset' },
    };

    const resolved = resolveArguments(args, { limit: 10, offset: 5 });

    expect(resolved).toEqual({
      limit: 10,
      offset: 5,
    });
  });

  it('should resolve mixed literal and variable arguments', () => {
    const args = {
      limit: { kind: 'literal' as const, value: 10 },
      offset: { kind: 'variable' as const, name: 'offset' },
      status: { kind: 'literal' as const, value: 'published' },
    };

    const resolved = resolveArguments(args, { offset: 5 });

    expect(resolved).toEqual({
      limit: 10,
      offset: 5,
      status: 'published',
    });
  });

  it('should handle undefined variable value', () => {
    const args = {
      limit: { kind: 'variable' as const, name: 'limit' },
    };

    const resolved = resolveArguments(args, { limit: undefined });

    expect(resolved).toEqual({
      limit: undefined,
    });
  });

  it('should handle missing variable', () => {
    const args = {
      limit: { kind: 'variable' as const, name: 'limit' },
    };

    const resolved = resolveArguments(args, {});

    expect(resolved).toEqual({
      limit: undefined,
    });
  });
});

describe('makeFieldKey', () => {
  it('should create key without arguments', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'user',
      type: 'User',
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('user@{}');
  });

  it('should create key with literal arguments', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'literal', value: 10 },
        offset: { kind: 'literal', value: 0 },
      },
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('posts@{"limit":10,"offset":0}');
  });

  it('should create key with alphabetically sorted arguments', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        zLimit: { kind: 'literal', value: 10 },
        aOffset: { kind: 'literal', value: 0 },
        mFilter: { kind: 'literal', value: 'active' },
      },
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('posts@{"aOffset":0,"mFilter":"active","zLimit":10}');
  });

  it('should create key with variable arguments', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'variable', name: 'limit' },
        offset: { kind: 'variable', name: 'offset' },
      },
    };

    const key = makeFieldKey(selection, { limit: 10, offset: 5 });

    expect(key).toBe('posts@{"limit":10,"offset":5}');
  });

  it('should create key with mixed literal and variable arguments', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'literal', value: 10 },
        offset: { kind: 'variable', name: 'offset' },
        status: { kind: 'literal', value: 'published' },
      },
    };

    const key = makeFieldKey(selection, { offset: 5 });

    expect(key).toBe('posts@{"limit":10,"offset":5,"status":"published"}');
  });

  it('should use field name, not alias', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      alias: 'myPosts',
      args: {
        limit: { kind: 'literal', value: 5 },
      },
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('posts@{"limit":5}');
  });

  it('should handle complex argument values', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        filter: {
          kind: 'literal',
          value: { status: 'published', tags: ['typescript', 'graphql'] },
        },
      },
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('posts@{"filter":{"status":"published","tags":["typescript","graphql"]}}');
  });

  it('should handle null argument value', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'literal', value: null },
      },
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('posts@{"limit":null}');
  });

  it('should handle undefined variable value', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'variable', name: 'limit' },
      },
    };

    const key = makeFieldKey(selection, { limit: undefined });

    expect(key).toBe('posts@{}');
  });

  it('should handle falsy argument values', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'literal', value: 0 },
        active: { kind: 'literal', value: false },
        search: { kind: 'literal', value: '' },
      },
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('posts@{"active":false,"limit":0,"search":""}');
  });
});

describe('makeFieldKeyFromArgs', () => {
  it('should return field@{} when no args provided', () => {
    expect(makeFieldKeyFromArgs('user')).toBe('user@{}');
  });

  it('should return field@{} when args is empty object', () => {
    expect(makeFieldKeyFromArgs('user', {})).toBe('user@{}');
  });

  it('should return field@{stringified args} when args provided', () => {
    expect(makeFieldKeyFromArgs('posts', { limit: 10, offset: 0 })).toBe('posts@{"limit":10,"offset":0}');
  });

  it('should match output of makeFieldKey for equivalent inputs', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
      type: 'Post',
      args: {
        limit: { kind: 'literal', value: 10 },
        offset: { kind: 'literal', value: 5 },
      },
    };

    const fromMakeFieldKey = makeFieldKey(selection, {});
    const fromMakeFieldKeyFromArgs = makeFieldKeyFromArgs('posts', { limit: 10, offset: 5 });

    expect(fromMakeFieldKeyFromArgs).toBe(fromMakeFieldKey);
  });
});

describe('isEntityLink', () => {
  it('should return true for entity link', () => {
    const link = { [EntityLinkKey]: 'User:1' };
    expect(isEntityLink(link)).toBe(true);
  });

  it('should return false for regular object', () => {
    expect(isEntityLink({ id: '1', name: 'Alice' })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isEntityLink(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(isEntityLink(undefined)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isEntityLink('User:1')).toBe(false);
    expect(isEntityLink(123)).toBe(false);
    expect(isEntityLink(true)).toBe(false);
  });

  it('should return false for arrays', () => {
    expect(isEntityLink([])).toBe(false);
    expect(isEntityLink([{ [EntityLinkKey]: 'User:1' }])).toBe(false);
  });
});

describe('isFragmentRefArray', () => {
  it('should return true for array with single fragment ref', () => {
    const ref = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
    expect(isFragmentRefArray([ref])).toBe(true);
  });

  it('should return true for array with multiple fragment refs', () => {
    const ref1 = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
    const ref2 = { [FragmentRefKey]: 'User:2' } as unknown as FragmentRefs<string>;
    expect(isFragmentRefArray([ref1, ref2])).toBe(true);
  });

  it('should return false for empty array', () => {
    expect(isFragmentRefArray([])).toBe(false);
  });

  it('should return false for a single fragment ref', () => {
    const ref = { [FragmentRefKey]: 'User:1' } as unknown as FragmentRefs<string>;
    expect(isFragmentRefArray(ref)).toBe(false);
  });

  it('should return false for array of plain objects', () => {
    expect(isFragmentRefArray([{ id: '1' }])).toBe(false);
  });

  it('should return false for null', () => {
    expect(isFragmentRefArray(null)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isFragmentRefArray('User:1')).toBe(false);
    expect(isFragmentRefArray(123)).toBe(false);
  });
});

describe('replaceEqualDeep', () => {
  describe('primitives', () => {
    it('should return prev when values are identical', () => {
      expect(replaceEqualDeep(1, 1)).toBe(1);
      expect(replaceEqualDeep('hello', 'hello')).toBe('hello');
      expect(replaceEqualDeep(true, true)).toBe(true);
      expect(replaceEqualDeep(null, null)).toBe(null);
    });

    it('should return next when values differ', () => {
      expect(replaceEqualDeep(1, 2)).toBe(2);
      expect(replaceEqualDeep('a', 'b')).toBe('b');
      expect(replaceEqualDeep(true, false)).toBe(false);
    });

    it('should return next when types differ', () => {
      expect(replaceEqualDeep(1, '1')).toBe('1');
      expect(replaceEqualDeep(null, 0)).toBe(0);
      expect(replaceEqualDeep(undefined, null)).toBe(null);
      expect(replaceEqualDeep({}, null)).toBe(null);
      expect(replaceEqualDeep(null, {})).toEqual({});
    });
  });

  describe('same reference', () => {
    it('should return prev when same reference', () => {
      const obj = { a: 1 };
      expect(replaceEqualDeep(obj, obj)).toBe(obj);

      const arr = [1, 2, 3];
      expect(replaceEqualDeep(arr, arr)).toBe(arr);
    });
  });

  describe('objects', () => {
    it('should return prev when structurally equal', () => {
      const prev = { a: 1, b: 'hello', c: true };
      const next = { a: 1, b: 'hello', c: true };
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should return new object when a field changed', () => {
      const prev = { a: 1, b: 2 };
      const next = { a: 1, b: 3 };
      const result = replaceEqualDeep(prev, next);
      expect(result).not.toBe(prev);
      expect(result).toEqual({ a: 1, b: 3 });
    });

    it('should return new object when a key is added', () => {
      const prev = { a: 1 } as Record<string, number>;
      const next = { a: 1, b: 2 };
      const result = replaceEqualDeep(prev, next);
      expect(result).not.toBe(prev);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should return new object when a key is removed', () => {
      const prev = { a: 1, b: 2 };
      const next = { a: 1 };
      const result = replaceEqualDeep(prev, next);
      expect(result).not.toBe(prev);
      expect(result).toEqual({ a: 1 });
    });

    it('should preserve references for unchanged nested objects', () => {
      const inner = { x: 1, y: 2 };
      const prev = { a: inner, b: 'old' };
      const next = { a: { x: 1, y: 2 }, b: 'new' };
      const result = replaceEqualDeep(prev, next) as typeof prev;
      expect(result).not.toBe(prev);
      expect(result.a).toBe(inner); // unchanged subtree keeps reference
      expect(result.b).toBe('new');
    });

    it('should deeply preserve references through multiple levels', () => {
      const deep = { value: 42 };
      const mid = { deep, name: 'mid' };
      const prev = { top: mid, other: 'x' };
      const next = { top: { deep: { value: 42 }, name: 'mid' }, other: 'y' };
      const result = replaceEqualDeep(prev, next) as typeof prev;
      expect(result).not.toBe(prev);
      expect(result.top).toBe(mid);
      expect(result.top.deep).toBe(deep);
      expect(result.other).toBe('y');
    });
  });

  describe('arrays', () => {
    it('should return prev when structurally equal', () => {
      const prev = [1, 2, 3];
      const next = [1, 2, 3];
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should return new array when an element changed', () => {
      const prev = [1, 2, 3];
      const next = [1, 2, 4];
      const result = replaceEqualDeep(prev, next);
      expect(result).not.toBe(prev);
      expect(result).toEqual([1, 2, 4]);
    });

    it('should return new array when length differs', () => {
      const prev = [1, 2];
      const next = [1, 2, 3];
      const result = replaceEqualDeep(prev, next);
      expect(result).not.toBe(prev);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should preserve references for unchanged array elements (objects)', () => {
      const elem0 = { id: '1', name: 'Alice' };
      const elem1 = { id: '2', name: 'Bob' };
      const prev = [elem0, elem1];
      const next = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bobby' },
      ];
      const result = replaceEqualDeep(prev, next) as typeof prev;
      expect(result).not.toBe(prev);
      expect(result[0]).toBe(elem0); // unchanged element keeps reference
      expect(result[1]).not.toBe(elem1); // changed element is new
      expect(result[1]).toEqual({ id: '2', name: 'Bobby' });
    });

    it('should handle empty arrays', () => {
      const prev: unknown[] = [];
      const next: unknown[] = [];
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should handle array shrinking and still share elements', () => {
      const elem = { id: '1' };
      const prev = [elem, { id: '2' }];
      const next = [{ id: '1' }];
      const result = replaceEqualDeep(prev, next) as typeof prev;
      expect(result).not.toBe(prev);
      expect(result[0]).toBe(elem);
      expect(result).toHaveLength(1);
    });
  });

  describe('mixed structures (GraphQL-like)', () => {
    it('should preserve unchanged entity references in a query result', () => {
      const user1 = { __typename: 'User', id: '1', name: 'Alice' };
      const user2 = { __typename: 'User', id: '2', name: 'Bob' };
      const site = { __typename: 'Site', id: 's1', name: 'MySite' };

      const prev = {
        me: {
          ...user1,
          sites: [site],
        },
        users: [user1, user2],
      };

      // Only user2's name changed
      const next = {
        me: {
          __typename: 'User',
          id: '1',
          name: 'Alice',
          sites: [{ __typename: 'Site', id: 's1', name: 'MySite' }],
        },
        users: [
          { __typename: 'User', id: '1', name: 'Alice' },
          { __typename: 'User', id: '2', name: 'Bobby' },
        ],
      };

      const result = replaceEqualDeep(prev, next) as typeof prev;

      // Root changed (users[1] changed)
      expect(result).not.toBe(prev);
      // me subtree is unchanged
      expect(result.me).toBe(prev.me);
      expect(result.me.sites).toBe(prev.me.sites);
      expect(result.me.sites[0]).toBe(site);
      // users array changed
      expect(result.users).not.toBe(prev.users);
      expect(result.users[0]).toBe(user1); // unchanged
      expect(result.users[1]).not.toBe(user2); // changed
      expect(result.users[1]!.name).toBe('Bobby');
    });

    it('should return prev entirely when nothing changed', () => {
      const prev = {
        me: {
          id: '1',
          sites: [{ id: 's1', entities: [{ id: 'e1' }, { id: 'e2' }] }],
        },
      };

      const next = {
        me: {
          id: '1',
          sites: [{ id: 's1', entities: [{ id: 'e1' }, { id: 'e2' }] }],
        },
      };

      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined prev', () => {
      const next = { a: 1 };
      expect(replaceEqualDeep(undefined, next)).toBe(next);
    });

    it('should handle prev object vs next array', () => {
      const prev = { '0': 'a' };
      const next = ['a'];
      expect(replaceEqualDeep(prev, next)).toBe(next);
    });

    it('should handle prev array vs next object', () => {
      const prev = ['a'];
      const next = { '0': 'a' };
      expect(replaceEqualDeep(prev, next)).toEqual(next);
    });

    it('should handle nested null values', () => {
      const prev = { a: null, b: { c: null } };
      const next = { a: null, b: { c: null } };
      expect(replaceEqualDeep(prev, next)).toBe(prev);
    });

    it('should handle nested null becoming a value', () => {
      const prev = { a: null };
      const next = { a: { b: 1 } };
      const result = replaceEqualDeep(prev, next);
      expect(result).not.toBe(prev);
      expect(result).toEqual({ a: { b: 1 } });
    });
  });
});
