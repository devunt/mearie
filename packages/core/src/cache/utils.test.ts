import { describe, it, expect } from 'vitest';
import { makeEntityKey, makeFieldKey, resolveArguments, isEntityLink } from './utils.ts';
import { EntityLinkKey } from './constants.ts';
import type { FieldSelection } from '@mearie/shared';

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
    };

    const key = makeFieldKey(selection, {});

    expect(key).toBe('user@{}');
  });

  it('should create key with literal arguments', () => {
    const selection: FieldSelection = {
      kind: 'Field',
      name: 'posts',
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
