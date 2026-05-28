/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import type { ArtifactData, FragmentRefs, List, Nullable } from './typed-graphql-api.helpers.ts';

test('union selections expose __typename and inline fragments', () => {
  const SearchResultMembers = graphql.query('AbstractSearchResultMembers', {
    select: () => ({
      search: [
        { args: { term: 'ada' } },
        {
          __typename: true,
          $: [
            [{ on: 'User' }, { id: true, name: true }],
            [{ on: 'Admin' }, { id: true, name: true, permissions: true }],
            [{ on: 'Guest' }, { id: true, nickname: true }],
          ],
        },
      ],
    }),
  });

  type SearchItem = ArtifactData<typeof SearchResultMembers>['search'][number];

  expectTypeOf<SearchItem>().toExtend<{ __typename: 'Admin' | 'Guest' | 'User' }>();
  expectTypeOf<Extract<SearchItem, { __typename: 'User' }>>().toExtend<{
    id: string;
    name: string;
  }>();
  expectTypeOf<Extract<SearchItem, { __typename: 'Admin' }>>().toExtend<{
    id: string;
    name: string;
    permissions: List<string>;
  }>();
  expectTypeOf<Extract<SearchItem, { __typename: 'Guest' }>>().toExtend<{
    id: string;
    nickname?: Nullable<string>;
  }>();
  assertType<ArtifactData<typeof SearchResultMembers>>({
    search: [
      { __typename: 'User', id: 'user-1', name: 'Ada' },
      { __typename: 'Admin', id: 'admin-1', name: 'Lin', permissions: ['manage-users'] },
      { __typename: 'Guest', id: 'guest-1', nickname: null },
    ],
  });
});

test('interface selections expose common fields and narrow inline fragments', () => {
  const NodeDetails = graphql.fragment('AbstractNodeDetails', 'Node', {
    select: () => ({
      __typename: true,
      id: true,
      $: [
        [{ on: 'User' }, { name: true }],
        [{ on: 'Admin' }, { permissions: true }],
        [{ on: 'Guest' }, { nickname: true }],
        [{ on: 'Viewer' }, { user: { id: true } }],
      ],
    }),
  });

  type NodeDetailsData = ArtifactData<typeof NodeDetails>;

  expectTypeOf<NodeDetailsData>().toExtend<{
    __typename: 'Admin' | 'Guest' | 'User' | 'Viewer';
    id: string;
  }>();
  expectTypeOf<Extract<NodeDetailsData, { __typename: 'User' }>>().toExtend<{
    name: string;
  }>();
  expectTypeOf<Extract<NodeDetailsData, { __typename: 'Admin' }>>().toExtend<{
    permissions: List<string>;
  }>();
  expectTypeOf<Extract<NodeDetailsData, { __typename: 'Guest' }>>().toExtend<{
    nickname?: Nullable<string>;
  }>();
  expectTypeOf<Extract<NodeDetailsData, { __typename: 'Viewer' }>>().toExtend<{
    user?: Nullable<{ id: string }>;
  }>();
  assertType<NodeDetailsData>({ __typename: 'Guest', id: 'guest-1', nickname: null });
});

test('interface fragments can target another implemented interface', () => {
  const NodeProfileOwner = graphql.fragment('AbstractNodeProfileOwner', 'Node', {
    select: () => ({
      __typename: true,
      id: true,
      $: [[{ on: 'ProfileOwner' }, { profile: { bio: true } }]],
    }),
  });

  type NodeProfileOwnerData = ArtifactData<typeof NodeProfileOwner>;

  expectTypeOf<Extract<NodeProfileOwnerData, { __typename: 'User' }>>().toExtend<{
    profile?: Nullable<{ bio?: Nullable<string> }>;
  }>();
  expectTypeOf<Extract<NodeProfileOwnerData, { __typename: 'Admin' }>>().toExtend<{
    profile?: Nullable<{ bio?: Nullable<string> }>;
  }>();
  assertType<NodeProfileOwnerData>({ __typename: 'Guest', id: 'guest-1' });
  assertType<NodeProfileOwnerData>({
    __typename: 'User',
    id: 'user-1',
    profile: { bio: null },
  });
});

test('spreads abstract fragments into compatible object selections', () => {
  const NodeIdentity = graphql.fragment('AbstractNodeIdentity', 'Node', {
    select: () => ({
      id: true,
    }),
  });
  const SearchResultKind = graphql.fragment('AbstractSearchResultKind', 'SearchResult', {
    select: () => ({
      __typename: true,
    }),
  });

  const UserWithAbstractSpreads = graphql.query('AbstractUserWithSpreads', {
    select: () => ({
      user: [
        { args: { id: 'user-1' } },
        {
          id: true,
          $: [NodeIdentity, SearchResultKind],
        },
      ],
    }),
  });

  type UserData = NonNullable<ArtifactData<typeof UserWithAbstractSpreads>['user']>;

  expectTypeOf<UserData>().toExtend<FragmentRefs<'AbstractNodeIdentity'> & FragmentRefs<'AbstractSearchResultKind'>>();
  assertType<ArtifactData<typeof UserWithAbstractSpreads>>({
    user: {
      id: 'user-1',
      ' $fragmentRefs': {
        AbstractNodeIdentity: true,
        AbstractSearchResultKind: true,
      },
    },
  });
});

test('rejects direct field selections on unions', () => {
  graphql.query('BadAbstractUnionDirectField', {
    // @ts-expect-error - union selections expose only __typename and fragment entries.
    select: () => ({ search: [{ args: { term: 'x' } }, { id: true }] }),
  });
});

test('rejects inline fragment targets that do not overlap the parent type', () => {
  graphql.query('BadAbstractInlineTarget', {
    // @ts-expect-error - inline fragment type conditions must overlap the parent abstract type.
    select: () => ({ search: [{ args: { term: 'x' } }, { $: [[{ on: 'Profile' }, { bio: true }]] }] }),
  });
});

test('rejects inline fragment fields outside the narrowed target type', () => {
  graphql.query('BadAbstractInlineField', {
    // @ts-expect-error - inline fragment selections are checked against their target type.
    select: () => ({ search: [{ args: { term: 'x' } }, { $: [[{ on: 'Admin' }, { nickname: true }]] }] }),
  });
});

test('rejects fragment spreads that do not overlap the parent selection type', () => {
  const ProfileOwnerProfile = graphql.fragment('AbstractProfileOwnerProfile', 'ProfileOwner', {
    select: () => ({
      profile: { bio: true },
    }),
  });

  graphql.query('BadAbstractFragmentSpreadTarget', {
    // @ts-expect-error - fragment spreads must overlap the parent object selection type.
    select: () => ({ viewer: { $: [ProfileOwnerProfile] } }),
  });
});
