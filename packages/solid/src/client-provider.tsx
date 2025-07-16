import { type JSX, createContext, useContext } from 'solid-js';
import type { Client } from '@mearie/core';

const ClientContext = createContext<Client>();

export type ClientProviderProps = {
  client: Client;
  children: JSX.Element;
};

export const ClientProvider = (props: ClientProviderProps): JSX.Element => {
  return <ClientContext.Provider value={props.client}>{props.children}</ClientContext.Provider>;
};

export const useClient = (): Client => {
  const client = useContext(ClientContext);

  if (!client) {
    throw new Error('useClient must be used within ClientProvider');
  }

  return client;
};
