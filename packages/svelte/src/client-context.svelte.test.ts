import { describe, it, expect } from 'vitest';
import { mount, unmount } from 'svelte';
import type { Client } from '@mearie/core';
import { getClient } from './client-context.svelte.ts';
import { createMockClient } from './test-utils.svelte.ts';
import HookRunner from './HookRunner.svelte';

describe('client-context', () => {
  it('should set and get client in context', () => {
    const { client } = createMockClient();
    let retrieved: unknown;
    const target = document.createElement('div');

    const component = mount(HookRunner, {
      target,
      props: {
        client,
        hookFn: () => getClient(),
        onResult: (r: unknown) => {
          retrieved = r;
        },
      },
    });

    expect(retrieved).toBe(client);
    void unmount(component);
  });

  it('should throw when getClient is used outside component context', () => {
    expect(() => {
      getClient();
    }).toThrow();
  });

  it('should throw when getClient is used with null client', () => {
    let caughtError: unknown;
    const target = document.createElement('div');

    const component = mount(HookRunner, {
      target,
      props: {
        client: null as unknown as Client,
        hookFn: () => {
          try {
            getClient();
          } catch (e) {
            caughtError = e;
          }
          return null;
        },
        onResult: () => {},
      },
    });

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('getClient must be used within a context that has called setClient');
    void unmount(component);
  });
});
