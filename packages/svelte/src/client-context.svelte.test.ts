import { describe, it, expect } from 'vitest';
import { mount, unmount } from 'svelte';
import type { Client } from '@mearie/core';
import { getClient } from './client-context.svelte.ts';
import { createMockClient } from './test-utils.svelte.ts';
import TestRunner from './TestRunner.svelte';

describe('client-context', () => {
  it('should provide client to children', () => {
    const { client } = createMockClient();
    let retrieved: unknown;
    const target = document.createElement('div');

    const component = mount(TestRunner, {
      target,
      props: {
        client,
        setupFn: () => getClient(),
        onResult: (r: unknown) => {
          retrieved = r;
        },
      },
    });

    expect(retrieved).toBe(client);
    void unmount(component);
  });

  it('should throw when used without provider', () => {
    expect(() => {
      getClient();
    }).toThrow();
  });

  it('should throw when client is null', () => {
    let caughtError: unknown;
    const target = document.createElement('div');

    const component = mount(TestRunner, {
      target,
      props: {
        client: null as unknown as Client,
        setupFn: () => {
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
