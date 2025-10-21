import type { Artifact, VariablesOf } from '@mearie/shared';

export type Operation<T extends Artifact<'query' | 'mutation' | 'subscription'>> = {
  artifact: T;
  variables: VariablesOf<T>;
  signal?: AbortSignal;
};
