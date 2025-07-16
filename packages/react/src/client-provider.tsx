import { type ReactNode, createContext, useContext } from 'react';
import type { Client } from '@mearie/core';

const ClientContext = createContext<Client | null>(null);

export type ClientProviderProps = {
  client: Client;
  children: ReactNode;
};

export const ClientProvider = ({ client, children }: ClientProviderProps): ReactNode => {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
};

export const useClient = (): Client => {
  const client = useContext(ClientContext);

  if (!client) {
    throw new Error('useClient must be used within ClientProvider');
  }

  return client;
};
