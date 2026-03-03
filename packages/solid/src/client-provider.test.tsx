import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
import type { Client } from '@mearie/core';
import { ClientProvider, useClient } from './client-provider.tsx';
import { createMockClient } from './test-utils.tsx';

describe('ClientProvider', () => {
  it('should provide client to children', () => {
    const { client } = createMockClient();
    let receivedClient: unknown;

    const container = document.createElement('div');
    const dispose = render(() => {
      return (
        <ClientProvider client={client}>
          {(() => {
            receivedClient = useClient();
            return null;
          })()}
        </ClientProvider>
      );
    }, container);

    expect(receivedClient).toBe(client);
    dispose();
  });

  it('should throw when used without provider', () => {
    const container = document.createElement('div');

    expect(() => {
      render(() => {
        useClient();
        return null;
      }, container);
    }).toThrow('useClient must be used within ClientProvider');
  });

  it('should throw when client is null', () => {
    let caughtError: unknown;
    const container = document.createElement('div');

    render(() => {
      return (
        <ClientProvider client={null as unknown as Client}>
          {(() => {
            try {
              useClient();
            } catch (e) {
              caughtError = e;
            }
            return null;
          })()}
        </ClientProvider>
      );
    }, container);

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('useClient must be used within ClientProvider');
  });
});
