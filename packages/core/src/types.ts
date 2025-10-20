import type { Artifact } from '@mearie/shared';

export type SchemaMeta = {
  entities: Record<string, EntityMeta>;
};

export type EntityMeta = {
  keyFields: string[];
};

export type Operation<T extends Artifact<'query' | 'mutation' | 'subscription'>> = {
  kind: T['kind'];
  artifact: T;
  variables?: T[' $variables'];
  signal?: AbortSignal;
};
