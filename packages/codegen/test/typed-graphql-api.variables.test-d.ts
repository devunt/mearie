/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import {
  UserCard,
  type ArtifactVariables,
  type ImageFormat,
  type List,
  type NestedFilter,
  type Nullable,
  type RequiredAction,
  type Role,
  type UserFilter,
  type UserInput,
} from './typed-graphql-api.helpers.ts';

test('variables require non-null keys and allow optional keys', () => {
  const RequiredOptionalVariables = graphql.query('RequiredOptionalVariables', {
    variables: (t) => ({
      id: t.ID.nonNull(),
      after: t.String.optional(),
      first: t.Int.optional(),
    }),
    select: ($) => ({
      user: [
        { args: { id: $.id } },
        {
          friends: [{ args: { after: $.after, first: $.first } }, { id: true }],
        },
      ],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof RequiredOptionalVariables>>().toExtend<{
    id: string;
    after?: Nullable<string>;
    first?: Nullable<number>;
  }>();
  assertType<ArtifactVariables<typeof RequiredOptionalVariables>>({ id: '1' });
  assertType<ArtifactVariables<typeof RequiredOptionalVariables>>({ id: '1', after: null, first: 10 });
  // @ts-expect-error - non-null variables are required in the variables object.
  assertType<ArtifactVariables<typeof RequiredOptionalVariables>>({ after: 'cursor' });
});

test('defaulted variables are optional and keep their value nullability', () => {
  const DefaultedVariables = graphql.query('DefaultedVariables', {
    variables: (t) => ({
      id: t.ID.nonNull().default('viewer-id'),
      includeFriends: t.Boolean.default(true),
      role: t.Role.default(graphql.enum('USER')),
    }),
    select: ($) => ({
      user: [
        { args: { id: $.id, role: $.role } },
        {
          friends: [{ directives: { include: { if: $.includeFriends } } }, { id: true }],
        },
      ],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof DefaultedVariables>>().toExtend<{
    id?: string;
    includeFriends?: Nullable<boolean>;
    role?: Nullable<Role>;
  }>();
  assertType<ArtifactVariables<typeof DefaultedVariables>>({});
  assertType<ArtifactVariables<typeof DefaultedVariables>>({
    id: '1',
    includeFriends: null,
    role: 'ADMIN',
  });
  // @ts-expect-error - nonNull().default() is optional but still rejects null values.
  assertType<ArtifactVariables<typeof DefaultedVariables>>({ id: null });
});

test('list variable nullability follows builder order', () => {
  const ListNullabilityVariables = graphql.query('ListNullabilityVariables', {
    variables: (t) => ({
      nullableListNullableItems: t.String.list(),
      requiredListNullableItems: t.String.list().nonNull(),
      nullableListRequiredItems: t.String.nonNull().list(),
      requiredListRequiredItems: t.String.nonNull().list().nonNull(),
    }),
    select: () => ({
      viewer: { id: true },
    }),
  });

  expectTypeOf<ArtifactVariables<typeof ListNullabilityVariables>>().toExtend<{
    nullableListNullableItems?: Nullable<List<Nullable<string>>>;
    requiredListNullableItems: List<Nullable<string>>;
    nullableListRequiredItems?: Nullable<List<string>>;
    requiredListRequiredItems: List<string>;
  }>();
  assertType<ArtifactVariables<typeof ListNullabilityVariables>>({
    requiredListNullableItems: ['Ada', null],
    requiredListRequiredItems: ['Grace'],
  });
  assertType<ArtifactVariables<typeof ListNullabilityVariables>>({
    nullableListNullableItems: null,
    requiredListNullableItems: [null],
    nullableListRequiredItems: null,
    requiredListRequiredItems: [],
  });
  assertType<ArtifactVariables<typeof ListNullabilityVariables>>({
    requiredListNullableItems: [],
    // @ts-expect-error - non-null list items reject null values.
    requiredListRequiredItems: [null],
  });
});

test('enum defaults use graphql.enum and expose enum value variables', () => {
  const EnumDefaultVariables = graphql.query('EnumDefaultVariables', {
    variables: (t) => ({
      role: t.Role.default(graphql.enum('ADMIN')),
      imageFormat: t.ImageFormat.default(graphql.enum('WEBP')),
      requiredAction: t.RequiredAction.default(graphql.enum('THROW')),
    }),
    select: ($) => ({
      user: [
        { args: { id: '1', role: $.role } },
        {
          profile: {
            avatar: [
              { args: { size: 64, format: $.imageFormat }, directives: { required: { action: $.requiredAction } } },
              { url: true },
            ],
          },
        },
      ],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof EnumDefaultVariables>>().toExtend<{
    role?: Nullable<Role>;
    imageFormat?: Nullable<ImageFormat>;
    requiredAction?: Nullable<RequiredAction>;
  }>();
  assertType<ArtifactVariables<typeof EnumDefaultVariables>>({});
  assertType<ArtifactVariables<typeof EnumDefaultVariables>>({
    role: 'USER',
    imageFormat: 'PNG',
    requiredAction: 'CASCADE',
  });
});

test('input object defaults preserve generated input variable types', () => {
  const DefaultedInputObjects = graphql.query('DefaultedInputObjects', {
    variables: (t) => ({
      filter: t.UserFilter.default({
        role: graphql.enum('USER'),
        tags: ['featured'],
        nested: { active: true },
      }),
      nested: t.NestedFilter.default({ active: false }),
    }),
    select: ($) => ({
      user: [{ args: { id: '1', filter: $.filter } }, { id: true }],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof DefaultedInputObjects>>().toExtend<{
    filter?: Nullable<UserFilter>;
    nested?: Nullable<NestedFilter>;
  }>();
  assertType<ArtifactVariables<typeof DefaultedInputObjects>>({});
  assertType<ArtifactVariables<typeof DefaultedInputObjects>>({
    filter: {
      role: 'ADMIN',
      tags: ['staff'],
      nested: { active: true },
    },
    nested: null,
  });
});

test('input object defaults can satisfy non-null mutation arguments', () => {
  const DefaultedUserInput = graphql.mutation('DefaultedUserInput', {
    variables: (t) => ({
      id: t.ID.nonNull().default('1'),
      input: t.UserInput.default({
        name: 'Ada',
        email: null,
        tags: ['engineer'],
      }),
    }),
    select: ($) => ({
      updateUser: [{ args: { id: $.id, input: $.input } }, { id: true }],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof DefaultedUserInput>>().toExtend<{
    id?: string;
    input?: Nullable<UserInput>;
  }>();
  assertType<ArtifactVariables<typeof DefaultedUserInput>>({});
  assertType<ArtifactVariables<typeof DefaultedUserInput>>({
    id: '2',
    input: { name: 'Grace' },
  });
});

test('custom scalar variables use configured scalar types', () => {
  const CustomScalarVariables = graphql.query('CustomScalarVariables', {
    variables: (t) => ({
      homepage: t.URL.nonNull(),
      fallbackHomepage: t.URL.optional(),
      defaultHomepage: t.URL.default(new URL('https://example.com')),
    }),
    select: () => ({
      viewer: { id: true },
    }),
  });

  expectTypeOf<ArtifactVariables<typeof CustomScalarVariables>>().toExtend<{
    homepage: URL;
    fallbackHomepage?: Nullable<URL>;
    defaultHomepage?: Nullable<URL>;
  }>();
  assertType<ArtifactVariables<typeof CustomScalarVariables>>({
    homepage: new URL('https://example.com'),
  });
  assertType<ArtifactVariables<typeof CustomScalarVariables>>({
    homepage: new URL('https://example.com'),
    fallbackHomepage: null,
    defaultHomepage: null,
  });
});

test('variable refs satisfy compatible field args and directives', () => {
  const VariableRefsForArgsAndDirectives = graphql.query('VariableRefsForArgsAndDirectives', {
    variables: (t) => ({
      id: t.ID.nonNull(),
      role: t.Role.default(graphql.enum('ADMIN')),
      includeUser: t.Boolean.default(true),
      avatarSize: t.Int.default(64),
      avatarFormat: t.ImageFormat.default(graphql.enum('WEBP')),
      tags: t.String.nonNull().list().nonNull(),
      nested: t.NestedFilter.default({ active: true }),
      squareAvatar: t.Boolean.optional(),
    }),
    directives: ($) => ({
      auth: { role: $.role },
      clientFlag: { value: $.includeUser },
    }),
    select: ($) => ({
      user: [
        {
          args: {
            id: $.id,
            role: $.role,
            filter: { role: $.role, tags: $.tags, nested: $.nested },
          },
          directives: {
            auth: { role: $.role },
            include: { if: $.includeUser },
          },
        },
        {
          profile: {
            avatar: [
              { args: { size: $.avatarSize, format: $.avatarFormat }, directives: { include: { if: $.includeUser } } },
              { url: true },
            ],
          },
          $: [
            [
              {
                args: { avatarSize: $.avatarSize, square: $.squareAvatar },
                directives: { spreadOnly: { flag: $.includeUser } },
              },
              UserCard,
            ],
          ],
        },
      ],
    }),
  });

  assertType<ArtifactVariables<typeof VariableRefsForArgsAndDirectives>>({
    id: '1',
    tags: ['featured'],
  });
});

test('rejects nullable variable refs for non-null field args', () => {
  graphql.query('BadNullableVariableRefForRequiredFieldArg', {
    variables: (t) => ({
      id: t.ID.optional(),
    }),
    // @ts-expect-error - nullable variables cannot satisfy non-null field arguments.
    select: ($) => ({ user: [{ args: { id: $.id } }, { id: true }] }),
  });
});

test('rejects nullable variable refs for non-null directive args', () => {
  graphql.query('BadNullableVariableRefForRequiredDirectiveArg', {
    variables: (t) => ({
      includeUser: t.Boolean.optional(),
    }),
    // @ts-expect-error - nullable variables cannot satisfy non-null directive arguments.
    select: ($) => ({ viewer: [{ directives: { include: { if: $.includeUser } } }, { id: true }] }),
  });
});

test('rejects nullable list item refs for non-null input list items', () => {
  graphql.query('BadNullableListItemVariableRef', {
    variables: (t) => ({
      tags: t.String.list().nonNull(),
    }),
    // @ts-expect-error - [String] variables cannot satisfy a [String!] input field.
    select: ($) => ({ user: [{ args: { id: '1', filter: { tags: $.tags } } }, { id: true }] }),
  });
});

test('rejects unfinished variable builders', () => {
  graphql.query('BadUnfinishedVariableBuilder', {
    // @ts-expect-error - variable builders must be finalized.
    variables: (t) => ({ id: t.ID }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects unknown variable builder types', () => {
  graphql.query('BadUnknownVariableBuilderType', {
    variables: (t) => ({
      // @ts-expect-error - variable builders only expose schema input types.
      missing: t.Missing.nonNull(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects optional then nonNull variable builder state', () => {
  graphql.query('BadOptionalThenNonNullVariableBuilder', {
    variables: (t) => ({
      // @ts-expect-error - nonNull() cannot be chained after optional().
      id: t.ID.optional().nonNull(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects nonNull then optional variable builder state', () => {
  graphql.query('BadNonNullThenOptionalVariableBuilder', {
    variables: (t) => ({
      // @ts-expect-error - optional() cannot be chained after nonNull().
      id: t.ID.nonNull().optional(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects repeated list variable builder state', () => {
  graphql.query('BadRepeatedListVariableBuilder', {
    variables: (t) => ({
      // @ts-expect-error - list() cannot be applied more than once.
      names: t.String.list().list(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects chaining after default variable builder state', () => {
  graphql.query('BadPostDefaultVariableBuilderChain', {
    variables: (t) => ({
      // @ts-expect-error - default() is terminal in the variable builder state machine.
      id: t.ID.default('1').optional(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects repeated variable definition directives', () => {
  graphql.query('BadRepeatedVariableDefinitionDirectives', {
    variables: (t) => ({
      id: t.ID.directives({ varTag: { reason: 'one' } })
        // @ts-expect-error - directives() can only be applied once per variable builder.
        .directives({ varTag: { reason: 'two' } })
        .nonNull(),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects enum variable defaults without graphql.enum', () => {
  graphql.query('BadEnumVariableDefaultLiteral', {
    variables: (t) => ({
      // @ts-expect-error - enum variable defaults require graphql.enum().
      role: t.Role.default('ADMIN'),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects input object variable defaults missing required fields', () => {
  graphql.query('BadInputObjectVariableDefault', {
    variables: (t) => ({
      // @ts-expect-error - input object defaults enforce required input fields.
      input: t.UserInput.default({ email: null }),
    }),
    select: () => ({ viewer: { id: true } }),
  });
});

test('rejects enum helper calls with widened strings', () => {
  const roleName = 'ADMIN'.toString();
  // @ts-expect-error - graphql.enum() requires a string literal, not a widened string.
  graphql.enum(roleName);
});
