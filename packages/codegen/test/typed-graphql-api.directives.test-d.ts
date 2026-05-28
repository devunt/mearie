/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import {
  UserCard,
  type ArtifactData,
  type ArtifactVariables,
  type FragmentRefs,
  type Nullable,
  type Role,
} from './typed-graphql-api.helpers.ts';

test('accepts operation directives by operation location and args', () => {
  const OperationDirectiveQuery = graphql.query('DirectiveOperationQuery', {
    variables: (t) => ({
      enabled: t.Boolean.optional(),
      role: t.Role.nonNull(),
    }),
    directives: ($) => ({
      auth: { role: $.role },
      clientFlag: { value: $.enabled },
      include: { if: true },
      skip: { if: false },
    }),
    select: () => ({ viewer: { id: true } }),
  });

  expectTypeOf<ArtifactVariables<typeof OperationDirectiveQuery>>().toExtend<{
    enabled?: Nullable<boolean>;
    role: Role;
  }>();
  assertType<ArtifactVariables<typeof OperationDirectiveQuery>>({ role: 'ADMIN' });

  graphql.mutation('DirectiveOperationMutation', {
    directives: () => ({
      include: { if: true },
      mutationOnly: { reason: 'audit' },
      skip: { if: false },
    }),
    select: () => ({ updateUser: [{ args: { id: '1', input: { name: 'Ada' } } }, { id: true }] }),
  });

  graphql.subscription('DirectiveOperationSubscription', {
    directives: () => ({
      include: { if: true },
      skip: { if: false },
      subscriptionOnly: true,
    }),
    select: () => ({ userUpdated: [{ args: { id: '1' } }, { id: true }] }),
  });
});

test('rejects operation directives from other operation locations', () => {
  graphql.query('DirectiveBadQueryMutationOnly', {
    // @ts-expect-error - QUERY operations reject MUTATION-only directives.
    directives: () => ({ mutationOnly: {} }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects operation directives missing required args', () => {
  graphql.query('DirectiveBadOperationMissingArg', {
    // @ts-expect-error - operation directive args enforce required values.
    directives: () => ({ auth: {} }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects operation directive enum args without enum helper', () => {
  graphql.query('DirectiveBadOperationEnumArg', {
    // @ts-expect-error - enum directive args require graphql.enum() or typed variables.
    directives: () => ({ auth: { role: 'ADMIN' } }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('accepts field directives by field location and args', () => {
  const FieldDirectiveQuery = graphql.query('DirectiveFieldQuery', {
    variables: (t) => ({
      role: t.Role.nonNull(),
    }),
    select: ($) => ({
      viewer: [
        { directives: { auth: { role: $.role }, fieldOnly: true, include: { if: true }, skip: { if: false } } },
        { id: true },
      ],
    }),
  });

  assertType<ArtifactData<typeof FieldDirectiveQuery>>({ viewer: { id: 'viewer' } });
});

test('rejects field directives from operation-only locations', () => {
  graphql.query('DirectiveBadFieldClientFlag', {
    // @ts-expect-error - FIELD selections reject QUERY-only directives.
    select: () => ({ viewer: [{ directives: { clientFlag: { value: true } } }, { id: true }] }),
  });
});

test('rejects field directives missing required args', () => {
  graphql.query('DirectiveBadFieldMissingArg', {
    // @ts-expect-error - field directive args enforce required values.
    select: () => ({ viewer: [{ directives: { auth: {} } }, { id: true }] }),
  });
});

test('rejects required directive enum args without enum helper', () => {
  graphql.query('DirectiveBadRequiredEnumArg', {
    // @ts-expect-error - @required(action:) uses enum helper values.
    select: () => ({ viewer: { user: [{ directives: { required: { action: 'CASCADE' } } }, { id: true }] } }),
  });
});

test('accepts variable definition directives by location and args', () => {
  const VariableDirectiveQuery = graphql.query('DirectiveVariableQuery', {
    variables: (t) => ({
      id: t.ID.directives({ varTag: { reason: 'identity' } }).nonNull(),
    }),
    select: ($) => ({ user: [{ args: { id: $.id } }, { id: true }] }),
  });

  assertType<ArtifactVariables<typeof VariableDirectiveQuery>>({ id: '1' });
});

test('rejects variable directives from field-only locations', () => {
  graphql.query('DirectiveBadVariableFieldOnly', {
    variables: (t) => ({
      // @ts-expect-error - variable definitions reject FIELD-only directives.
      id: t.ID.directives({ fieldOnly: {} }).nonNull(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects variable directives missing required args', () => {
  graphql.query('DirectiveBadVariableMissingArg', {
    variables: (t) => ({
      // @ts-expect-error - variable definition directive args enforce required values.
      id: t.ID.directives({ varTag: {} }).nonNull(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('accepts fragment definition directives by location and args', () => {
  const FragmentDefinitionDirective = graphql.fragment('DirectiveFragmentDefinition', 'User', {
    variables: (t) => ({
      reason: t.String.optional(),
    }),
    directives: ($) => ({
      fragmentOnly: { reason: $.reason },
    }),
    select: () => ({ id: true }),
  });

  assertType<ArtifactData<typeof FragmentDefinitionDirective>>({ id: '1' });
  assertType<ArtifactVariables<typeof FragmentDefinitionDirective>>({ reason: null });
});

test('rejects fragment definition directives from field-only locations', () => {
  graphql.fragment('DirectiveBadFragmentDefinitionFieldOnly', 'User', {
    // @ts-expect-error - fragment definitions reject FIELD-only directives.
    directives: () => ({ fieldOnly: {} }),
    select: () => ({ id: true }),
  });
});

test('rejects fragment definition directive args with wrong value types', () => {
  graphql.fragment('DirectiveBadFragmentDefinitionArg', 'User', {
    // @ts-expect-error - fragment definition directive args enforce string values.
    directives: () => ({ fragmentOnly: { reason: 123 } }),
    select: () => ({ id: true }),
  });
});

test('accepts fragment spread directives by location and args', () => {
  const FragmentSpreadDirectiveQuery = graphql.query('DirectiveFragmentSpreadQuery', {
    variables: (t) => ({
      enabled: t.Boolean.nonNull(),
    }),
    select: ($) => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            [
              {
                args: { square: $.enabled },
                directives: { include: { if: $.enabled }, spreadOnly: { flag: $.enabled } },
              },
              UserCard,
            ],
          ],
        },
      ],
    }),
  });

  expectTypeOf<NonNullable<ArtifactData<typeof FragmentSpreadDirectiveQuery>['user']>>().toExtend<
    Partial<FragmentRefs<'UserCard'>>
  >();
});

test('rejects fragment spread directives from inline-only locations', () => {
  graphql.query('DirectiveBadFragmentSpreadInlineOnly', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - fragment spreads reject INLINE_FRAGMENT-only directives.
            [{ directives: { inlineOnly: { flag: true } } }, UserCard],
          ],
        },
      ],
    }),
  });
});

test('rejects fragment spread directive args with wrong value types', () => {
  graphql.query('DirectiveBadFragmentSpreadArg', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - fragment spread directive args enforce boolean values.
            [{ directives: { spreadOnly: { flag: 'yes' } } }, UserCard],
          ],
        },
      ],
    }),
  });
});

test('accepts inline fragment directives by location and args', () => {
  const InlineFragmentDirectiveQuery = graphql.query('DirectiveInlineFragmentQuery', {
    variables: (t) => ({
      enabled: t.Boolean.nonNull(),
    }),
    select: ($) => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            [
              { directives: { include: { if: true }, inlineOnly: { flag: $.enabled }, skip: { if: false } } },
              { name: true },
            ],
          ],
        },
      ],
    }),
  });

  expectTypeOf<NonNullable<ArtifactData<typeof InlineFragmentDirectiveQuery>['user']>>().toExtend<{ name: string }>();
});

test('rejects inline fragment directives from spread-only locations', () => {
  graphql.query('DirectiveBadInlineFragmentSpreadOnly', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - inline fragments reject FRAGMENT_SPREAD-only directives.
            [{ directives: { spreadOnly: { flag: true } } }, { id: true }],
          ],
        },
      ],
    }),
  });
});

test('rejects inline fragment directive args with wrong value types', () => {
  graphql.query('DirectiveBadInlineFragmentArg', {
    select: () => ({
      user: [
        { args: { id: '1' } },
        {
          $: [
            // @ts-expect-error - inline fragment directive args enforce boolean values.
            [{ directives: { inlineOnly: { flag: 'yes' } } }, { id: true }],
          ],
        },
      ],
    }),
  });
});

test('infers include and skip optionality', () => {
  const IncludeSkipOptionality = graphql.query('DirectiveIncludeSkipOptionality', {
    variables: (t) => ({
      includeEmail: t.Boolean.nonNull(),
      skipAge: t.Boolean.default(false),
    }),
    select: ($) => ({
      viewer: {
        id: [{ directives: { include: { if: true }, skip: { if: false } } }],
        user: {
          name: [{ directives: { skip: { if: false } } }],
          email: [{ directives: { include: { if: $.includeEmail } } }],
          age: [{ directives: { skip: { if: $.skipAge } } }],
        },
      },
    }),
  });

  type IncludeSkipUser = NonNullable<ArtifactData<typeof IncludeSkipOptionality>['viewer']['user']>;
  expectTypeOf<IncludeSkipUser>().toExtend<{
    age?: Nullable<number>;
    email?: Nullable<string>;
    name: string;
  }>();
  assertType<ArtifactData<typeof IncludeSkipOptionality>>({ viewer: { id: 'viewer', user: { name: 'Ada' } } });
  // @ts-expect-error - statically included and unskipped fields remain required.
  assertType<ArtifactData<typeof IncludeSkipOptionality>>({ viewer: { user: { name: 'Ada' } } });
});

test('removes null from fields with required directives', () => {
  const RequiredDirectiveQuery = graphql.query('DirectiveRequiredQuery', {
    select: () => ({
      user: [{ args: { id: '1' } }, { email: [{ directives: { required: {} } }] }],
    }),
  });

  expectTypeOf<NonNullable<ArtifactData<typeof RequiredDirectiveQuery>['user']>>().toExtend<{ email: string }>();
  assertType<ArtifactData<typeof RequiredDirectiveQuery>>({ user: { email: 'ada@example.com' } });
  // @ts-expect-error - @required removes null from nullable field data.
  assertType<ArtifactData<typeof RequiredDirectiveQuery>>({ user: { email: null } });
});

test('infers cascading required behavior', () => {
  const CascadingRequiredDirectiveQuery = graphql.query('DirectiveCascadingRequiredQuery', {
    select: () => ({
      viewer: {
        user: [
          { directives: { required: { action: graphql.enum('THROW') } } },
          {
            profile: [
              { directives: { required: { action: graphql.enum('THROW') } } },
              {
                avatar: [
                  { args: { size: 64 }, directives: { required: { action: graphql.enum('CASCADE') } } },
                  { url: true },
                ],
              },
            ],
          },
        ],
      },
    }),
  });

  assertType<ArtifactData<typeof CascadingRequiredDirectiveQuery>>(null);
  assertType<ArtifactData<typeof CascadingRequiredDirectiveQuery>>({
    viewer: {
      user: {
        profile: {
          avatar: {
            url: {} as URL,
          },
        },
      },
    },
  });
  // @ts-expect-error - cascading @required keeps selected fields non-null when data is present.
  assertType<ArtifactData<typeof CascadingRequiredDirectiveQuery>>({ viewer: { user: { profile: { avatar: null } } } });
});
