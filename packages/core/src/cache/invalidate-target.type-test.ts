import type { SchemaMeta } from '@mearie/shared';
import type { InvalidateTarget } from './types.ts';

type TestSchemaProps = {
  scalars: { DateTime: Date };
  entities: {
    Movie: { keyFields: { id: string }; fields: 'id' | 'title' | 'plot' | 'rating' };
    User: { keyFields: { _id: string }; fields: '_id' | 'name' | 'email' };
    Comment: { keyFields: { postId: string; commentId: string }; fields: 'postId' | 'commentId' | 'text' };
  };
  queryFields: 'movie' | 'movies' | 'user' | 'search';
};

type TestSchema = SchemaMeta<TestSchemaProps>;

type Target = InvalidateTarget<TestSchema>;

// eslint-disable-next-line func-style, @typescript-eslint/no-unused-vars
const accept = (_target: Target): void => {};

accept({ __typename: 'Movie', id: '1' });
accept({ __typename: 'Movie' });
accept({ __typename: 'Movie', id: '1', $field: 'title' });
accept({ __typename: 'Movie', $field: 'rating' });
accept({ __typename: 'Movie', id: '1', $field: 'plot', $args: { lang: 'en' } });

accept({ __typename: 'User', _id: '123' });
accept({ __typename: 'User', _id: '123', $field: 'email' });

accept({ __typename: 'Comment', postId: '1', commentId: '2' });
accept({ __typename: 'Comment', postId: '1', commentId: '2', $field: 'text' });

accept({ __typename: 'Query' });
accept({ __typename: 'Query', $field: 'movie' });
accept({ __typename: 'Query', $field: 'movies', $args: { limit: 10 } });

// @ts-expect-error - typo in __typename
// cspell:disable-next-line
accept({ __typename: 'Moive', id: '1' });

// @ts-expect-error - wrong key field name for Movie (should be 'id', not '_id')
accept({ __typename: 'Movie', _id: '1' });

// @ts-expect-error - invalid field name
// cspell:disable-next-line
accept({ __typename: 'Movie', id: '1', $field: 'titl' });

// @ts-expect-error - invalid query field name
accept({ __typename: 'Query', $field: 'nonexistent' });

// @ts-expect-error - using old 'id' property for User (should be '_id')
accept({ __typename: 'User', id: '123' });

// @ts-expect-error - using old 'field' property instead of '$field'
accept({ __typename: 'Movie', id: '1', field: 'title' });
