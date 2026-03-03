import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
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

  it('should throw when useClient is used without ClientProvider', () => {
    const container = document.createElement('div');

    expect(() => {
      render(() => {
        useClient();
        return null;
      }, container);
    }).toThrow('useClient must be used within ClientProvider');
  });
});
