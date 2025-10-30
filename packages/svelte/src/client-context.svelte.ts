import { getContext, setContext } from 'svelte';
import type { Client, SchemaMeta } from '@mearie/core';

const CLIENT_KEY = Symbol('mearie-client');

export const setClient = <TMeta extends SchemaMeta = SchemaMeta>(client: Client<TMeta>): void => {
  setContext(CLIENT_KEY, client as Client<SchemaMeta>);
};

export const getClient = <TMeta extends SchemaMeta = SchemaMeta>(): Client<TMeta> => {
  const client = getContext<Client<SchemaMeta>>(CLIENT_KEY);

  if (!client) {
    throw new Error('getClient must be used within a context that has called setClient');
  }

  return client as Client<TMeta>;
};
