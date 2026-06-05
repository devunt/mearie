/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import {
  UserCard,
  type ArtifactData,
  type ArtifactVariables,
  type FragmentRefs,
  type List,
  type Nullable,
  type Role,
} from './typed-graphql-api.helpers.ts';

test('composition smoke: variables, directives, aliases and fragments work together', () => {
  const CompositionUser = graphql.query('CompositionUser', {
    variables: (t) => ({
      id: t.ID.nonNull().directives({ varTag: { reason: 'identity' } }),
      includeEmail: t.Boolean.default(false),
      role: t.Role.default(graphql.enum('USER')),
      after: t.String.optional(),
      avatarSize: t.Int.default(64),
    }),
    directives: ($) => ({
      clientFlag: { value: $.includeEmail },
      include: { if: true },
    }),
    select: ($) => ({
      user: [
        {
          alias: 'viewer',
          args: {
            id: $.id,
            role: $.role,
          },
          directives: { auth: { role: $.role } },
        },
        {
          id: true,
          name: [{ alias: 'displayName' }],
          email: [{ directives: { include: { if: $.includeEmail } } }],
          friends: [{ args: { first: 2, after: $.after } }, { id: true }],
          $: [
            [
              {
                args: { avatarSize: $.avatarSize },
                directives: { spreadOnly: { flag: $.includeEmail } },
              },
              UserCard,
            ],
          ],
        },
      ],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof CompositionUser>>().toExtend<{
    id: string;
    includeEmail?: Nullable<boolean>;
    role?: Nullable<Role>;
    after?: Nullable<string>;
    avatarSize?: Nullable<number>;
  }>();
  assertType<ArtifactVariables<typeof CompositionUser>>({ id: '1' });

  type Viewer = NonNullable<ArtifactData<typeof CompositionUser>['viewer']>;
  expectTypeOf<Viewer>().toExtend<
    FragmentRefs<'UserCard'> & {
      id: string;
      displayName: string;
      email?: Nullable<string>;
      friends: List<{ id: string }>;
    }
  >();
  assertType<ArtifactData<typeof CompositionUser>>({
    viewer: {
      id: '1',
      displayName: 'Ada',
      friends: [{ id: '2' }],
      ' $fragmentRefs': { UserCard: true },
    },
  });
});
