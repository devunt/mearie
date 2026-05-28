/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line import-x/no-unresolved -- $mearie is the generated virtual module under test.
import { graphql } from '$mearie';
import { assertType, expectTypeOf, test } from 'vitest';
import {
  type ArtifactData,
  type ArtifactVariables,
  type ImageFormat,
  type List,
  type Nullable,
} from './typed-graphql-api.helpers.ts';

test('field selection: root object field shape', () => {
  const RootObjectField = graphql.query('FieldRootObjectField', {
    select: () => ({
      viewer: {
        id: true,
      },
    }),
  });

  expectTypeOf<ArtifactData<typeof RootObjectField>>().toExtend<{
    viewer: {
      id: string;
    };
  }>();
  assertType<ArtifactData<typeof RootObjectField>>({
    viewer: {
      id: 'viewer-1',
    },
  });
});

test('field selection: required field args', () => {
  const RequiredFieldArgs = graphql.query('FieldRequiredFieldArgs', {
    variables: (t) => ({
      id: t.ID.nonNull(),
    }),
    select: ($) => ({
      user: [
        {
          args: {
            id: $.id,
          },
        },
        {
          id: true,
        },
      ],
    }),
  });

  expectTypeOf<ArtifactVariables<typeof RequiredFieldArgs>>().toExtend<{
    id: string;
  }>();
  expectTypeOf<ArtifactData<typeof RequiredFieldArgs>>().toExtend<{
    user?: Nullable<{
      id: string;
    }>;
  }>();
  assertType<ArtifactVariables<typeof RequiredFieldArgs>>({
    id: 'user-1',
  });
  assertType<ArtifactData<typeof RequiredFieldArgs>>({
    user: {
      id: 'user-1',
    },
  });
});

test('field selection: alias output names', () => {
  const AliasOutputNames = graphql.query('FieldAliasOutputNames', {
    select: () => ({
      viewer: [
        {
          alias: 'me',
        },
        {
          id: [
            {
              alias: 'viewerId',
            },
          ],
        },
      ],
    }),
  });

  expectTypeOf<ArtifactData<typeof AliasOutputNames>>().toExtend<{
    me: {
      viewerId: string;
    };
  }>();
  assertType<ArtifactData<typeof AliasOutputNames>>({
    me: {
      viewerId: 'viewer-1',
    },
  });
});

test('field selection: scalar nullability', () => {
  const ScalarNullability = graphql.fragment('FieldScalarNullability', 'User', {
    select: () => ({
      email: true,
    }),
  });

  expectTypeOf<ArtifactData<typeof ScalarNullability>>().toExtend<{
    email?: Nullable<string>;
  }>();
  assertType<ArtifactData<typeof ScalarNullability>>({});
  assertType<ArtifactData<typeof ScalarNullability>>({
    email: null,
  });
  assertType<ArtifactData<typeof ScalarNullability>>({
    email: 'ada@example.com',
  });
});

test('field selection: object nullability', () => {
  const ObjectNullability = graphql.fragment('FieldObjectNullability', 'Viewer', {
    select: () => ({
      user: {
        id: true,
      },
    }),
  });

  expectTypeOf<ArtifactData<typeof ObjectNullability>>().toExtend<{
    user?: Nullable<{
      id: string;
    }>;
  }>();
  assertType<ArtifactData<typeof ObjectNullability>>({});
  assertType<ArtifactData<typeof ObjectNullability>>({
    user: null,
  });
  assertType<ArtifactData<typeof ObjectNullability>>({
    user: {
      id: 'user-1',
    },
  });
});

test('field selection: list item shape', () => {
  const ListItemShape = graphql.fragment('FieldListItemShape', 'User', {
    select: () => ({
      friends: {
        id: true,
        name: true,
      },
    }),
  });

  expectTypeOf<ArtifactData<typeof ListItemShape>>().toExtend<{
    friends: List<{
      id: string;
      name: string;
    }>;
  }>();
  assertType<ArtifactData<typeof ListItemShape>>({
    friends: [
      {
        id: 'user-2',
        name: 'Grace',
      },
    ],
  });
});

test('field selection: custom scalar URL', () => {
  const CustomScalarUrl = graphql.fragment('FieldCustomScalarUrl', 'Image', {
    select: () => ({
      url: true,
    }),
  });

  expectTypeOf<ArtifactData<typeof CustomScalarUrl>>().toExtend<{
    url: URL;
  }>();
  assertType<ArtifactData<typeof CustomScalarUrl>>({
    url: new URL('https://example.com/avatar.png'),
  });
});

test('field selection: nested args', () => {
  const NestedArgs = graphql.fragment('FieldNestedArgs', 'User', {
    variables: (t) => ({
      avatarSize: t.Int.nonNull(),
      imageFormat: t.ImageFormat.optional(),
    }),
    select: ($) => ({
      profile: {
        avatar: [
          {
            args: {
              size: $.avatarSize,
              format: $.imageFormat,
            },
          },
          {
            width: true,
          },
        ],
      },
    }),
  });

  expectTypeOf<ArtifactVariables<typeof NestedArgs>>().toExtend<{
    avatarSize: number;
    imageFormat?: Nullable<ImageFormat>;
  }>();
  expectTypeOf<ArtifactData<typeof NestedArgs>>().toExtend<{
    profile?: Nullable<{
      avatar?: Nullable<{
        width?: Nullable<number>;
      }>;
    }>;
  }>();
  assertType<ArtifactVariables<typeof NestedArgs>>({
    avatarSize: 96,
    imageFormat: 'WEBP',
  });
  assertType<ArtifactData<typeof NestedArgs>>({
    profile: {
      avatar: {
        width: 128,
      },
    },
  });
});

test('field selection rejects unknown root fields', () => {
  // @ts-expect-error - query selections reject unknown root fields.
  graphql.query('FieldRejectUnknownRootField', { select: () => ({ missing: true }) });
});

test('field selection rejects missing required args', () => {
  // @ts-expect-error - user(id:) is required.
  graphql.query('FieldRejectMissingRequiredArg', { select: () => ({ user: [{ args: {} }, { id: true }] }) });
});

test('field selection rejects invalid argument values', () => {
  // @ts-expect-error - user(id:) expects an ID-compatible string.
  graphql.query('FieldRejectInvalidArgValue', { select: () => ({ user: [{ args: { id: 123 } }, { id: true }] }) });
});

test('field selection rejects object-as-scalar shapes', () => {
  // @ts-expect-error - object fields require a nested object selection.
  graphql.query('FieldRejectObjectAsScalar', { select: () => ({ viewer: true }) });
});

test('field selection rejects scalar-as-object shapes', () => {
  // @ts-expect-error - scalar fields cannot have nested object selections.
  graphql.query('FieldRejectScalarAsObject', { select: () => ({ viewer: { id: { nested: true } } }) });
});

test('field selection rejects shorthand object selections when required args are missing', () => {
  // @ts-expect-error - fields with required args cannot use the shorthand nested-selection form.
  graphql.query('FieldRejectMissingRequiredArgShorthand', { select: () => ({ user: { id: true } }) });
});

test('field selection rejects args on no-argument object fields', () => {
  // @ts-expect-error - no-argument fields reject args in field tuples.
  graphql.query('FieldRejectNoArgsObjectFieldWithArgs', { select: () => ({ viewer: [{ args: {} }, { id: true }] }) });
});

test('field selection rejects args on no-argument scalar fields', () => {
  // @ts-expect-error - scalar no-argument fields reject args in scalar tuples.
  graphql.query('FieldRejectNoArgsScalarFieldWithArgs', { select: () => ({ viewer: { id: [{ args: {} }] } }) });
});

test('field selection rejects composite tuples on scalar fields', () => {
  // @ts-expect-error - scalar fields cannot use composite field tuples.
  graphql.query('FieldRejectScalarCompositeTuple', { select: () => ({ viewer: { id: [{}, { missing: true }] } }) });
});

test('field selection rejects scalar tuples on composite fields', () => {
  // @ts-expect-error - composite field tuples require a nested object selection.
  graphql.query('FieldRejectCompositeScalarTuple', { select: () => ({ viewer: [{}, true] }) });
});

test('field selection rejects unsupported field config keys', () => {
  // @ts-expect-error - field configs reject unsupported keys.
  graphql.query('FieldRejectUnsupportedConfigKey', { select: () => ({ viewer: [{ cache: 'nope' }, { id: true }] }) });
});

test('field selection rejects non-string aliases', () => {
  // @ts-expect-error - aliases must be strings.
  graphql.query('FieldRejectNonStringAlias', { select: () => ({ viewer: [{ alias: 123 }, { id: true }] }) });
});

test('field selection rejects raw enum literals in arguments', () => {
  graphql.query('FieldRejectEnumLiteralArg', {
    // @ts-expect-error - enum arguments require graphql.enum() values, not raw strings.
    select: () => ({ user: [{ args: { id: '1', role: 'ADMIN' } }, { id: true }] }),
  });
});

test('field selection rejects enum helper values outside the target enum', () => {
  graphql.query('FieldRejectInvalidEnumHelperArg', {
    // @ts-expect-error - enum helper values are checked against the target enum.
    select: () => ({ user: [{ args: { id: '1', role: graphql.enum('OWNER') } }, { id: true }] }),
  });
});

test('field selection rejects input objects missing required nested fields', () => {
  graphql.query('FieldRejectInputMissingRequiredNestedField', {
    // @ts-expect-error - nested input objects enforce required fields.
    select: () => ({ user: [{ args: { id: '1', filter: { nested: {} } } }, { id: true }] }),
  });
});

test('field selection rejects raw enum literals inside input objects', () => {
  graphql.query('FieldRejectNestedInputEnumLiteral', {
    // @ts-expect-error - enum fields inside input objects still require graphql.enum().
    select: () => ({ user: [{ args: { id: '1', filter: { role: 'ADMIN' } } }, { id: true }] }),
  });
});
