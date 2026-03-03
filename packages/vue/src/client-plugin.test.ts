import { describe, it, expect } from 'vitest';
import { createApp } from 'vue';
import type { Client } from '@mearie/core';
import { ClientPlugin, useClient } from './client-plugin.ts';
import { createMockClient, withSetup } from './test-utils.ts';

describe('ClientPlugin', () => {
  it('should provide client to children via plugin', () => {
    const { client } = createMockClient();
    const { result, unmount } = withSetup(() => useClient(), client);

    expect(result).toBe(client);
    unmount();
  });

  it('should throw when useClient is used without ClientPlugin', () => {
    expect(() => {
      let error: Error | undefined;
      const app = createApp({
        setup() {
          try {
            useClient();
          } catch (e) {
            error = e as Error;
          }
          if (error) throw error;
          return () => null;
        },
      });
      app.config.warnHandler = () => {};
      const container = document.createElement('div');
      app.mount(container);
    }).toThrow('useClient must be used within a ClientPlugin context');
  });

  it('should throw when client is null', () => {
    expect(() => {
      let error: Error | undefined;
      const app = createApp({
        setup() {
          try {
            useClient();
          } catch (e) {
            error = e as Error;
          }
          if (error) throw error;
          return () => null;
        },
      });
      app.config.warnHandler = () => {};
      app.use(ClientPlugin, { client: null as unknown as Client });
      const container = document.createElement('div');
      app.mount(container);
    }).toThrow('useClient must be used within a ClientPlugin context');
  });
});
