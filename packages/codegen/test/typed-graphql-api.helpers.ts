// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import type { ArtifactKind } from '@mearie/shared';
import type { Artifact } from 'mearie/types';

export type { Artifact, FragmentRefs, List, Nullable } from 'mearie/types';
export type {
  ImageFormat,
  NestedFilter,
  RequiredAction,
  Role,
  UserFilter,
  UserInput,
} from './fixtures/__generated__/types.d.ts';

export type ArtifactData<T> = T extends Artifact<ArtifactKind, string, infer Data, unknown> ? Data : never;
export type ArtifactVariables<T> =
  T extends Artifact<ArtifactKind, string, unknown, infer Variables> ? Variables : never;

export const UserCard = graphql.fragment('UserCard', 'User', {
  variables: (t) => ({
    avatarSize: t.Int.default(64),
    square: t.Boolean.optional(),
  }),
  directives: () => ({
    fragmentOnly: { reason: 'typed card' },
  }),
  select: ($) => ({
    id: true,
    name: true,
    email: [{ directives: { include: { if: true } } }],
    profile: {
      avatar: [
        {
          args: { size: $.avatarSize, format: graphql.enum('WEBP') },
          directives: { fieldOnly: true, include: { if: true } },
        },
        {
          url: true,
          width: true,
        },
      ],
    },
  }),
});
