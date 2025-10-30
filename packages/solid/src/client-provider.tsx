import { type JSX, createContext, useContext } from 'solid-js';
import type { Client, SchemaMeta } from '@mearie/core';

const ClientContext = createContext<Client<SchemaMeta>>();

export type ClientProviderProps<TMeta extends SchemaMeta = SchemaMeta> = {
  client: Client<TMeta>;
  children: JSX.Element;
};

export const ClientProvider = <TMeta extends SchemaMeta = SchemaMeta>(
  props: ClientProviderProps<TMeta>,
): JSX.Element => {
  return <ClientContext.Provider value={props.client as Client<SchemaMeta>}>{props.children}</ClientContext.Provider>;
};

export const useClient = <TMeta extends SchemaMeta = SchemaMeta>(): Client<TMeta> => {
  const client = useContext(ClientContext);

  if (!client) {
    throw new Error('useClient must be used within ClientProvider');
  }

  return client as Client<TMeta>;
};
