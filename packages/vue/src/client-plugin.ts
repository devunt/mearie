import type { App, InjectionKey } from 'vue';
import { inject } from 'vue';
import type { Client, SchemaMeta } from '@mearie/core';

export const ClientKey: InjectionKey<Client<SchemaMeta>> = Symbol('mearie-client');

export type ClientPluginOptions<TMeta extends SchemaMeta = SchemaMeta> = {
  client: Client<TMeta>;
};

export const ClientPlugin = {
  install<TMeta extends SchemaMeta = SchemaMeta>(app: App, options: ClientPluginOptions<TMeta>) {
    app.provide(ClientKey, options.client as Client<SchemaMeta>);
  },
};

export const useClient = <TMeta extends SchemaMeta = SchemaMeta>(): Client<TMeta> => {
  const client = inject(ClientKey);

  if (!client) {
    throw new Error('useClient must be used within a ClientPlugin context');
  }

  return client as Client<TMeta>;
};
