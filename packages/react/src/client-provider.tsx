import { type ReactNode, createContext, useContext } from 'react';
import type { Client, SchemaMeta } from '@mearie/core';

const ClientContext = createContext<Client<SchemaMeta> | null>(null);

export type ClientProviderProps<TMeta extends SchemaMeta = SchemaMeta> = {
  client: Client<TMeta>;
  children: ReactNode;
};

export const ClientProvider = <TMeta extends SchemaMeta = SchemaMeta>({
  client,
  children,
}: ClientProviderProps<TMeta>): ReactNode => {
  return <ClientContext.Provider value={client as Client<SchemaMeta>}>{children}</ClientContext.Provider>;
};

export const useClient = <TMeta extends SchemaMeta = SchemaMeta>(): Client<TMeta> => {
  const client = useContext(ClientContext);

  if (!client) {
    throw new Error('useClient must be used within ClientProvider');
  }

  return client as Client<TMeta>;
};
