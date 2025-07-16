import type { App, InjectionKey } from 'vue';
import { inject } from 'vue';
import type { Client } from '@mearie/core';

export const ClientKey: InjectionKey<Client> = Symbol('mearie-client');

export type ClientPluginOptions = {
  client: Client;
};

export const ClientPlugin = {
  install(app: App, options: ClientPluginOptions) {
    app.provide(ClientKey, options.client);
  },
};

export const useClient = (): Client => {
  const client = inject(ClientKey);

  if (!client) {
    throw new Error('useClient must be used within a ClientPlugin context');
  }

  return client;
};
