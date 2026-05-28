/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import {
  UserCard,
  type Artifact,
  type ArtifactData,
  type ArtifactVariables,
  type FragmentRefs,
  type ImageFormat,
  type Nullable,
} from './typed-graphql-api.helpers.ts';

const RequiredAvatarFragment = graphql.fragment('RequiredAvatarFragment', 'User', {
  variables: (t) => ({
    size: t.Int.nonNull(),
    format: t.ImageFormat.default(graphql.enum('PNG')),
  }),
  select: ($) => ({
    profile: {
      avatar: [{ args: { size: $.size, format: $.format } }, { url: true }],
    },
  }),
});

test('fragment variables and data', () => {
  expectTypeOf(UserCard).toExtend<Artifact<'fragment', 'UserCard'>>();
  expectTypeOf<ArtifactVariables<typeof UserCard>>().toExtend<{
    avatarSize?: Nullable<number>;
    square?: Nullable<boolean>;
  }>();

  assertType<ArtifactVariables<typeof UserCard>>({});
  assertType<ArtifactVariables<typeof UserCard>>({ avatarSize: 96, square: null });
  assertType<ArtifactData<typeof UserCard>>({ id: '1', name: 'Ada' });
  assertType<ArtifactData<typeof UserCard>>({
    id: '1',
    name: 'Ada',
    email: null,
    profile: { avatar: { url: {} as URL, width: 128 } },
  });
});

test('plain fragment spreads add FragmentRefs', () => {
  const PlainFragmentSpread = graphql.query('PlainFragmentSpread', {
    select: () => ({
      user: [{ args: { id: '1' } }, { $: [UserCard] }],
    }),
  });

  type UserData = NonNullable<ArtifactData<typeof PlainFragmentSpread>['user']>;
  expectTypeOf<UserData>().toExtend<FragmentRefs<'UserCard'>>();
  assertType<ArtifactData<typeof PlainFragmentSpread>>({
    user: { ' $fragmentRefs': { UserCard: true } },
  });
});

test('configured spreads accept optional and default args', () => {
  const ConfiguredOptionalDefaultArgs = graphql.query('ConfiguredOptionalDefaultArgs', {
    variables: (t) => ({
      square: t.Boolean.optional(),
    }),
    select: ($) => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            [{ args: {} }, UserCard],
            [{ args: { square: $.square } }, UserCard],
          ],
        },
      ],
    }),
  });

  type UserData = NonNullable<ArtifactData<typeof ConfiguredOptionalDefaultArgs>['user']>;
  expectTypeOf<UserData>().toExtend<FragmentRefs<'UserCard'>>();
  assertType<ArtifactData<typeof ConfiguredOptionalDefaultArgs>>({
    user: { ' $fragmentRefs': { UserCard: true } },
  });
});

test('configured spreads require non-null fragment args', () => {
  expectTypeOf<ArtifactVariables<typeof RequiredAvatarFragment>>().toExtend<{
    size: number;
    format?: Nullable<ImageFormat>;
  }>();
  assertType<ArtifactVariables<typeof RequiredAvatarFragment>>({ size: 64 });

  const ConfiguredRequiredArgs = graphql.query('ConfiguredRequiredArgs', {
    variables: (t) => ({
      avatarSize: t.Int.nonNull(),
    }),
    select: ($) => ({
      user: [{ args: { id: '1' } }, { $: [[{ args: { size: $.avatarSize } }, RequiredAvatarFragment]] }],
    }),
  });

  type UserData = NonNullable<ArtifactData<typeof ConfiguredRequiredArgs>['user']>;
  expectTypeOf<UserData>().toExtend<FragmentRefs<'RequiredAvatarFragment'>>();
});

test('conditional configured spreads produce partial FragmentRefs', () => {
  const ConditionalConfiguredSpread = graphql.query('ConditionalConfiguredSpread', {
    variables: (t) => ({
      avatarSize: t.Int.nonNull(),
      showAvatar: t.Boolean.nonNull(),
    }),
    select: ($) => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            [{ args: { size: $.avatarSize }, directives: { include: { if: $.showAvatar } } }, RequiredAvatarFragment],
          ],
        },
      ],
    }),
  });

  type UserData = NonNullable<ArtifactData<typeof ConditionalConfiguredSpread>['user']>;
  expectTypeOf<UserData>().toExtend<Partial<FragmentRefs<'RequiredAvatarFragment'>>>();
  assertType<ArtifactData<typeof ConditionalConfiguredSpread>>({ user: {} });
  assertType<ArtifactData<typeof ConditionalConfiguredSpread>>({
    user: { ' $fragmentRefs': { RequiredAvatarFragment: true } },
  });
});

test('inline fragments on object types add object fields', () => {
  const InlineObjectFragment = graphql.query('InlineObjectFragment', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          id: true,
          $: [[{ on: 'User' }, { age: true, profile: { bio: true } }]],
        },
      ],
    }),
  });

  type UserData = NonNullable<ArtifactData<typeof InlineObjectFragment>['user']>;
  expectTypeOf<UserData>().toExtend<{
    id: string;
    age?: Nullable<number>;
    profile?: Nullable<{ bio?: Nullable<string> }>;
  }>();
  assertType<ArtifactData<typeof InlineObjectFragment>>({ user: { id: '1' } });
  assertType<ArtifactData<typeof InlineObjectFragment>>({
    user: { id: '1', age: null, profile: { bio: null } },
  });
});

test('rejects fragment spreads on incompatible parents', () => {
  graphql.query('BadFragmentSpreadParent', {
    // @ts-expect-error - User fragments cannot be spread on Profile.
    select: () => ({ user: [{ args: { id: '1' } }, { profile: { $: [UserCard] } }] }),
  });
});

test('rejects configured spreads missing required args', () => {
  graphql.query('BadConfiguredSpreadMissingRequiredArg', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - configured spreads must provide non-null fragment variables.
            [{ args: {} }, RequiredAvatarFragment],
          ],
        },
      ],
    }),
  });
});

test('rejects configured spread arg type mismatches', () => {
  graphql.query('BadConfiguredSpreadArgType', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - configured spread args use the fragment variable shape.
            [{ args: { size: 'large' } }, RequiredAvatarFragment],
          ],
        },
      ],
    }),
  });
});

test('rejects fragment spread config shape keys', () => {
  graphql.query('BadFragmentSpreadConfigKey', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - fragment spread configs only support args and directives.
            [{ on: 'User' }, UserCard],
          ],
        },
      ],
    }),
  });
});

test('rejects inline fragment config shape keys', () => {
  graphql.query('BadInlineFragmentConfigKey', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - inline fragment configs only support on and directives.
            [{ args: {} }, { id: true }],
          ],
        },
      ],
    }),
  });
});

test('rejects inline fragment type conditions that are not string literals', () => {
  graphql.query('BadInlineFragmentTargetType', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - inline fragment type conditions must be string literal type names.
            [{ on: 123 }, { id: true }],
          ],
        },
      ],
    }),
  });
});

test('rejects non-array fragment selection shapes', () => {
  graphql.query('BadFragmentSelectionShape', {
    // @ts-expect-error - the $ pseudo-selection must be a fragment item array.
    select: () => ({ viewer: { $: { id: true } } }),
  });
});
