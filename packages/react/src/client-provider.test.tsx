import { describe, it, expect } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Client } from '@mearie/core';
import { ClientProvider, useClient } from './client-provider.tsx';
import { createMockClient } from './test-utils.ts';

describe('ClientProvider', () => {
  it('should provide client to children', () => {
    const { client } = createMockClient();
    let receivedClient: unknown;

    const TestChild = (): null => {
      receivedClient = useClient();
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(createElement(ClientProvider, { client, children: createElement(TestChild) }));
    });

    expect(receivedClient).toBe(client);
    act(() => root.unmount());
  });

  it('should throw when used without provider', () => {
    const TestChild = (): null => {
      useClient();
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    expect(() => {
      act(() => {
        root.render(createElement(TestChild));
      });
    }).toThrow('useClient must be used within ClientProvider');

    act(() => root.unmount());
  });

  it('should throw when client is null', () => {
    let caughtError: unknown;

    const TestChild = (): null => {
      try {
        useClient();
      } catch (e) {
        caughtError = e;
      }
      return null;
    };

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(ClientProvider, {
          client: null as unknown as Client,
          children: createElement(TestChild),
        }),
      );
    });

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('useClient must be used within ClientProvider');
    act(() => root.unmount());
  });
});
