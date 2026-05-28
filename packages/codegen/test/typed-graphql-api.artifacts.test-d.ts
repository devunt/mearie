/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import {
  UserCard,
  type Artifact,
  type ArtifactData,
  type ArtifactVariables,
  type List,
  type Nullable,
  type UserInput,
} from './typed-graphql-api.helpers.ts';

test('fragment artifact contract: kind, variables and data', () => {
  expectTypeOf(UserCard).toExtend<Artifact<'fragment', 'UserCard'>>();
  assertType<ArtifactVariables<typeof UserCard>>({ avatarSize: 96, square: false });
  assertType<ArtifactData<typeof UserCard>>({
    id: '1',
    name: 'Ada',
    email: null,
    profile: {
      avatar: {
        url: {} as URL,
        width: 128,
      },
    },
  });
});

test('object fragment data contract: selected object fields', () => {
  const ArtifactAdminBadge = graphql.fragment('ArtifactAdminBadge', 'Admin', {
    select: () => ({
      id: true,
      permissions: true,
    }),
  });

  expectTypeOf<ArtifactData<typeof ArtifactAdminBadge>>().toExtend<{
    id: string;
    permissions: List<string>;
  }>();
  assertType<ArtifactData<typeof ArtifactAdminBadge>>({
    id: '1',
    permissions: ['manage-users'],
  });
});

test('query artifact contract: query kind and variables', () => {
  const ArtifactUserLookup = graphql.query('ArtifactUserLookup', {
    variables: (t) => ({
      id: t.ID.nonNull(),
    }),
    select: ($) => ({
      user: [{ args: { id: $.id } }, { id: true }],
    }),
  });

  expectTypeOf(ArtifactUserLookup).toExtend<Artifact<'query', 'ArtifactUserLookup'>>();
  assertType<ArtifactVariables<typeof ArtifactUserLookup>>({ id: '1' });
});

test('mutation artifact contract: mutation kind, variables and data', () => {
  const ArtifactUpdateUser = graphql.mutation('ArtifactUpdateUser', {
    variables: (t) => ({
      id: t.ID.nonNull(),
      input: t.UserInput.nonNull(),
    }),
    select: ($) => ({
      updateUser: [{ args: { id: $.id, input: $.input } }, { id: true, email: true }],
    }),
  });

  expectTypeOf(ArtifactUpdateUser).toExtend<Artifact<'mutation', 'ArtifactUpdateUser'>>();
  expectTypeOf<ArtifactVariables<typeof ArtifactUpdateUser>>().toExtend<{
    id: string;
    input: UserInput;
  }>();
  assertType<ArtifactData<typeof ArtifactUpdateUser>>({
    updateUser: {
      id: '1',
      email: null,
    },
  });
  expectTypeOf<ArtifactData<typeof ArtifactUpdateUser>>().toExtend<{
    updateUser: {
      id: string;
      email?: Nullable<string>;
    };
  }>();
});

test('subscription artifact contract: subscription kind, variables and data', () => {
  const ArtifactUserUpdated = graphql.subscription('ArtifactUserUpdated', {
    variables: (t) => ({
      id: t.ID.nonNull(),
    }),
    select: ($) => ({
      userUpdated: [{ args: { id: $.id } }, { id: true, name: true }],
    }),
  });

  expectTypeOf(ArtifactUserUpdated).toExtend<Artifact<'subscription', 'ArtifactUserUpdated'>>();
  assertType<ArtifactVariables<typeof ArtifactUserUpdated>>({ id: '1' });
  assertType<ArtifactData<typeof ArtifactUserUpdated>>({
    userUpdated: {
      id: '1',
      name: 'Ada',
    },
  });
  expectTypeOf<ArtifactData<typeof ArtifactUserUpdated>>().toExtend<{
    userUpdated: {
      id: string;
      name: string;
    };
  }>();
});
