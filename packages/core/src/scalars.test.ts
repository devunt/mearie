import { describe, it, expect } from 'vitest';
import { parse, serialize, type ScalarsConfig } from './scalars.ts';
import type { Selection, VariableDef, SchemaMeta } from '@mearie/shared';

const schemaMeta: SchemaMeta = {
  entities: {},
  inputs: {},
  scalars: {},
};

const scalars: ScalarsConfig = {
  DateTime: {
    parse: (value: unknown) => new Date(value as string),
    serialize: (value: unknown) => (value as Date).toISOString(),
  },
  JSON: {
    parse: (value: unknown) => JSON.parse(value as string) as unknown,
    serialize: (value: unknown) => JSON.stringify(value),
  },
};

describe('parseScalars', () => {
  it('should parse scalar fields', () => {
    const data = { createdAt: '2025-01-15T10:00:00Z', title: 'Test' };
    const selections: Selection[] = [
      { kind: 'Field', name: 'createdAt', type: 'DateTime' },
      { kind: 'Field', name: 'title', type: 'String' },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      createdAt: new Date('2025-01-15T10:00:00Z'),
      title: 'Test',
    });
  });

  it('should parse array of scalars', () => {
    const data = { dates: ['2025-01-15T10:00:00Z', '2025-01-16T10:00:00Z'] };
    const selections: Selection[] = [{ kind: 'Field', name: 'dates', type: 'DateTime', array: true }];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      dates: [new Date('2025-01-15T10:00:00Z'), new Date('2025-01-16T10:00:00Z')],
    });
  });

  it('should handle null values without transformation', () => {
    const data = { createdAt: null };
    const selections: Selection[] = [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({ createdAt: null });
  });

  it('should handle nested objects', () => {
    const data = {
      post: {
        createdAt: '2025-01-15T10:00:00Z',
        title: 'Test',
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'post',
        type: 'Post',
        selections: [
          { kind: 'Field', name: 'createdAt', type: 'DateTime' },
          { kind: 'Field', name: 'title', type: 'String' },
        ],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      post: {
        createdAt: new Date('2025-01-15T10:00:00Z'),
        title: 'Test',
      },
    });
  });

  it('should handle fragment spreads', () => {
    const data = {
      id: '1',
      createdAt: '2025-01-15T10:00:00Z',
    };
    const selections: Selection[] = [
      { kind: 'Field', name: 'id', type: 'ID' },
      {
        kind: 'FragmentSpread',
        name: 'TestFragment',
        selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      id: '1',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    });
  });

  it('should handle inline fragments', () => {
    const data = {
      __typename: 'Post',
      createdAt: '2025-01-15T10:00:00Z',
    };
    const selections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      {
        kind: 'InlineFragment',
        on: 'Post',
        selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      __typename: 'Post',
      createdAt: new Date('2025-01-15T10:00:00Z'),
    });
  });

  it('should handle field aliases', () => {
    const data = { publishDate: '2025-01-15T10:00:00Z' };
    const selections: Selection[] = [{ kind: 'Field', name: 'createdAt', alias: 'publishDate', type: 'DateTime' }];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      publishDate: new Date('2025-01-15T10:00:00Z'),
    });
  });

  it('should parse JSON scalar', () => {
    const data = { metadata: '{"foo":"bar"}' };
    const selections: Selection[] = [{ kind: 'Field', name: 'metadata', type: 'JSON' }];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({ metadata: { foo: 'bar' } });
  });

  it('should handle deeply nested objects', () => {
    const data = {
      level1: {
        level2: {
          level3: {
            createdAt: '2025-01-15T10:00:00Z',
          },
        },
      },
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'level1',
        type: 'Level1',
        selections: [
          {
            kind: 'Field',
            name: 'level2',
            type: 'Level2',
            selections: [
              {
                kind: 'Field',
                name: 'level3',
                type: 'Level3',
                selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
              },
            ],
          },
        ],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      level1: {
        level2: {
          level3: {
            createdAt: new Date('2025-01-15T10:00:00Z'),
          },
        },
      },
    });
  });

  it('should handle array of objects with scalars', () => {
    const data = {
      posts: [
        { createdAt: '2025-01-15T10:00:00Z', title: 'Post 1' },
        { createdAt: '2025-01-16T10:00:00Z', title: 'Post 2' },
      ],
    };
    const selections: Selection[] = [
      {
        kind: 'Field',
        name: 'posts',
        type: 'Post',
        array: true,
        selections: [
          { kind: 'Field', name: 'createdAt', type: 'DateTime' },
          { kind: 'Field', name: 'title', type: 'String' },
        ],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      posts: [
        { createdAt: new Date('2025-01-15T10:00:00Z'), title: 'Post 1' },
        { createdAt: new Date('2025-01-16T10:00:00Z'), title: 'Post 2' },
      ],
    });
  });

  it('should handle null values in arrays', () => {
    const data = { dates: ['2025-01-15T10:00:00Z', null, '2025-01-16T10:00:00Z'] };
    const selections: Selection[] = [{ kind: 'Field', name: 'dates', type: 'DateTime', array: true }];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      dates: [new Date('2025-01-15T10:00:00Z'), null, new Date('2025-01-16T10:00:00Z')],
    });
  });

  it('should handle empty arrays', () => {
    const data = { dates: [] };
    const selections: Selection[] = [{ kind: 'Field', name: 'dates', type: 'DateTime', array: true }];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({ dates: [] });
  });

  it('should handle multiple inline fragments', () => {
    const data = {
      __typename: 'Post',
      id: '1',
      createdAt: '2025-01-15T10:00:00Z',
      publishedAt: '2025-01-16T10:00:00Z',
    };
    const selections: Selection[] = [
      { kind: 'Field', name: '__typename', type: 'String' },
      { kind: 'Field', name: 'id', type: 'ID' },
      {
        kind: 'InlineFragment',
        on: 'Post',
        selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
      },
      {
        kind: 'InlineFragment',
        on: 'Post',
        selections: [{ kind: 'Field', name: 'publishedAt', type: 'DateTime' }],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      __typename: 'Post',
      id: '1',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      publishedAt: new Date('2025-01-16T10:00:00Z'),
    });
  });

  it('should handle multiple fragment spreads', () => {
    const data = {
      id: '1',
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-16T10:00:00Z',
    };
    const selections: Selection[] = [
      { kind: 'Field', name: 'id', type: 'ID' },
      {
        kind: 'FragmentSpread',
        name: 'TimestampsFragment',
        selections: [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }],
      },
      {
        kind: 'FragmentSpread',
        name: 'UpdateFragment',
        selections: [{ kind: 'Field', name: 'updatedAt', type: 'DateTime' }],
      },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      id: '1',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      updatedAt: new Date('2025-01-16T10:00:00Z'),
    });
  });

  it('should handle mixed scalar types', () => {
    const data = {
      createdAt: '2025-01-15T10:00:00Z',
      metadata: '{"version":1}',
      id: '123',
    };
    const selections: Selection[] = [
      { kind: 'Field', name: 'createdAt', type: 'DateTime' },
      { kind: 'Field', name: 'metadata', type: 'JSON' },
      { kind: 'Field', name: 'id', type: 'ID' },
    ];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({
      createdAt: new Date('2025-01-15T10:00:00Z'),
      metadata: { version: 1 },
      id: '123',
    });
  });

  it('should handle empty object', () => {
    const data = {};
    const selections: Selection[] = [];

    const result = parse(selections, scalars, data);

    expect(result).toEqual({});
  });

  it('should handle undefined data', () => {
    const data = undefined;
    const selections: Selection[] = [{ kind: 'Field', name: 'createdAt', type: 'DateTime' }];

    const result = parse(selections, scalars, data);

    expect(result).toBeUndefined();
  });

  describe('object/array scalars', () => {
    it('should parse JSON array as single value', () => {
      const data = {
        metadata: '[1,2,3]',
      };
      const selections: Selection[] = [{ kind: 'Field', name: 'metadata', type: 'JSON' }];

      const result = parse(selections, scalars, data);

      expect(result).toEqual({
        metadata: [1, 2, 3],
      });
    });

    it('should parse JSON object as single value', () => {
      const data = {
        config: '{"theme":"dark","notifications":true}',
      };
      const selections: Selection[] = [{ kind: 'Field', name: 'config', type: 'JSON' }];

      const result = parse(selections, scalars, data);

      expect(result).toEqual({
        config: { theme: 'dark', notifications: true },
      });
    });

    it('should parse array of JSON when marked as array', () => {
      const data = {
        items: ['{"id":1}', '{"id":2}'],
      };
      const selections: Selection[] = [{ kind: 'Field', name: 'items', type: 'JSON', array: true }];

      const result = parse(selections, scalars, data);

      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2 }],
      });
    });
  });
});

describe('serializeScalars', () => {
  it('should serialize scalar variables', () => {
    const variables = { createdAt: new Date('2025-01-15T10:00:00Z'), title: 'Test' };
    const variableDefs: VariableDef[] = [
      { name: 'createdAt', type: 'DateTime' },
      { name: 'title', type: 'String' },
    ];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({
      createdAt: '2025-01-15T10:00:00.000Z',
      title: 'Test',
    });
  });

  it('should serialize array of scalars', () => {
    const variables = {
      dates: [new Date('2025-01-15T10:00:00Z'), new Date('2025-01-16T10:00:00Z')],
    };
    const variableDefs: VariableDef[] = [{ name: 'dates', type: 'DateTime', array: true }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({
      dates: ['2025-01-15T10:00:00.000Z', '2025-01-16T10:00:00.000Z'],
    });
  });

  it('should handle null values without transformation', () => {
    const variables = { createdAt: null };
    const variableDefs: VariableDef[] = [{ name: 'createdAt', type: 'DateTime', nullable: true }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({ createdAt: null });
  });

  it('should serialize JSON scalar', () => {
    const variables = { metadata: { foo: 'bar' } };
    const variableDefs: VariableDef[] = [{ name: 'metadata', type: 'JSON' }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({ metadata: '{"foo":"bar"}' });
  });

  it('should serialize empty arrays', () => {
    const variables = { dates: [] };
    const variableDefs: VariableDef[] = [{ name: 'dates', type: 'DateTime', array: true }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({ dates: [] });
  });

  it('should serialize null values in arrays', () => {
    const variables = {
      dates: [new Date('2025-01-15T10:00:00Z'), null, new Date('2025-01-16T10:00:00Z')],
    };
    const variableDefs: VariableDef[] = [{ name: 'dates', type: 'DateTime', array: true, nullable: true }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({
      dates: ['2025-01-15T10:00:00.000Z', null, '2025-01-16T10:00:00.000Z'],
    });
  });

  it('should serialize mixed scalar types', () => {
    const variables = {
      createdAt: new Date('2025-01-15T10:00:00Z'),
      metadata: { version: 1, active: true },
      id: '123',
    };
    const variableDefs: VariableDef[] = [
      { name: 'createdAt', type: 'DateTime' },
      { name: 'metadata', type: 'JSON' },
      { name: 'id', type: 'ID' },
    ];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({
      createdAt: '2025-01-15T10:00:00.000Z',
      metadata: '{"version":1,"active":true}',
      id: '123',
    });
  });

  it('should handle undefined variable values', () => {
    const variables = { createdAt: undefined, title: 'Test' };
    const variableDefs: VariableDef[] = [
      { name: 'createdAt', type: 'DateTime', nullable: true },
      { name: 'title', type: 'String' },
    ];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({ title: 'Test' });
  });

  it('should handle variables as null', () => {
    const variables = null;
    const variableDefs: VariableDef[] = [{ name: 'createdAt', type: 'DateTime' }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toBeNull();
  });

  it('should handle variables as undefined', () => {
    const variables = undefined;
    const variableDefs: VariableDef[] = [{ name: 'createdAt', type: 'DateTime' }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toBeUndefined();
  });

  it('should handle empty object variables', () => {
    const variables = {};
    const variableDefs: VariableDef[] = [{ name: 'createdAt', type: 'DateTime' }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({});
  });

  it('should handle multiple scalars in one operation', () => {
    const variables = {
      createdAt: new Date('2025-01-15T10:00:00Z'),
      updatedAt: new Date('2025-01-16T10:00:00Z'),
      publishedAt: new Date('2025-01-17T10:00:00Z'),
      metadata: { tags: ['test'] },
    };
    const variableDefs: VariableDef[] = [
      { name: 'createdAt', type: 'DateTime' },
      { name: 'updatedAt', type: 'DateTime' },
      { name: 'publishedAt', type: 'DateTime' },
      { name: 'metadata', type: 'JSON' },
    ];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    expect(result).toEqual({
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-16T10:00:00.000Z',
      publishedAt: '2025-01-17T10:00:00.000Z',
      metadata: '{"tags":["test"]}',
    });
  });

  it('should handle large arrays', () => {
    const dates = Array.from({ length: 100 }, (_, i) => {
      const day = ((i % 28) + 1).toString().padStart(2, '0');
      return new Date(`2025-01-${day}T10:00:00Z`);
    });
    const variables = { dates };
    const variableDefs: VariableDef[] = [{ name: 'dates', type: 'DateTime', array: true }];

    const result = serialize(schemaMeta, variableDefs, scalars, variables);

    const typedResult = result as { dates: string[] };
    expect(Array.isArray(typedResult.dates)).toBe(true);
    expect(typedResult.dates).toHaveLength(100);
    expect(typedResult.dates[0]).toBe('2025-01-01T10:00:00.000Z');
  });

  describe('object/array scalars', () => {
    it('should treat JSON scalar array as single value, not map over items', () => {
      const variables = {
        data: [1, 2, 3],
      };
      const variableDefs: VariableDef[] = [{ name: 'data', type: 'JSON' }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        data: '[1,2,3]',
      });
    });

    it('should treat JSON scalar object as single value', () => {
      const variables = {
        data: { nested: { value: 42 }, array: [1, 2] },
      };
      const variableDefs: VariableDef[] = [{ name: 'data', type: 'JSON' }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        data: '{"nested":{"value":42},"array":[1,2]}',
      });
    });

    it('should not transform scalars inside JSON object', () => {
      const variables = {
        metadata: {
          publishedAt: new Date('2025-01-15T10:00:00Z'),
          tags: ['test'],
        },
      };
      const variableDefs: VariableDef[] = [{ name: 'metadata', type: 'JSON' }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        metadata: '{"publishedAt":"2025-01-15T10:00:00.000Z","tags":["test"]}',
      });
    });

    it('should map over array when field is array type', () => {
      const variables = {
        dataList: [
          [1, 2],
          [3, 4],
        ],
      };
      const variableDefs: VariableDef[] = [{ name: 'dataList', type: 'JSON', array: true }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        dataList: ['[1,2]', '[3,4]'],
      });
    });

    it('should handle nested arrays with array type', () => {
      const variables = {
        matrix: [
          [
            [1, 2],
            [3, 4],
          ],
          [
            [5, 6],
            [7, 8],
          ],
        ],
      };
      const variableDefs: VariableDef[] = [{ name: 'matrix', type: 'JSON', array: true }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        matrix: ['[[1,2],[3,4]]', '[[5,6],[7,8]]'],
      });
    });
  });

  describe('nested input types', () => {
    const schemaMeta: SchemaMeta = {
      entities: {},
      inputs: {
        CreatePostInput: {
          fields: [
            { name: 'title', type: 'String' },
            { name: 'publishedAt', type: 'DateTime' },
            { name: 'metadata', type: 'JSON' },
          ],
        },
        UpdatePostInput: {
          fields: [
            { name: 'title', type: 'String' },
            { name: 'updatedAt', type: 'DateTime' },
          ],
        },
        CreateCommentInput: {
          fields: [
            { name: 'text', type: 'String' },
            { name: 'createdAt', type: 'DateTime' },
            { name: 'post', type: 'CreatePostInput' },
          ],
        },
        BatchUpdateInput: {
          fields: [{ name: 'posts', type: 'UpdatePostInput', array: true }],
        },
      },
      scalars: {},
    };

    it('should serialize nested input object with scalars', () => {
      const variables = {
        comment: {
          text: 'Great post!',
          createdAt: new Date('2025-01-15T10:00:00Z'),
          post: {
            title: 'My Post',
            publishedAt: new Date('2025-01-14T10:00:00Z'),
            metadata: { tags: ['tech'] },
          },
        },
      };
      const variableDefs: VariableDef[] = [{ name: 'comment', type: 'CreateCommentInput' }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        comment: {
          text: 'Great post!',
          createdAt: '2025-01-15T10:00:00.000Z',
          post: {
            title: 'My Post',
            publishedAt: '2025-01-14T10:00:00.000Z',
            metadata: '{"tags":["tech"]}',
          },
        },
      });
    });

    it('should serialize array of nested input objects', () => {
      const variables = {
        batch: {
          posts: [
            { title: 'Post 1', updatedAt: new Date('2025-01-15T10:00:00Z') },
            { title: 'Post 2', updatedAt: new Date('2025-01-16T10:00:00Z') },
            { updatedAt: new Date('2025-01-17T10:00:00Z') },
          ],
        },
      };
      const variableDefs: VariableDef[] = [{ name: 'batch', type: 'BatchUpdateInput' }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        batch: {
          posts: [
            { title: 'Post 1', updatedAt: '2025-01-15T10:00:00.000Z' },
            { title: 'Post 2', updatedAt: '2025-01-16T10:00:00.000Z' },
            { updatedAt: '2025-01-17T10:00:00.000Z' },
          ],
        },
      });
    });

    it('should handle nested input with null values', () => {
      const variables = {
        input: {
          title: 'Test Post',
          publishedAt: new Date('2025-01-15T10:00:00Z'),
          metadata: null,
        },
      };
      const variableDefs: VariableDef[] = [{ name: 'input', type: 'CreatePostInput' }];

      const result = serialize(schemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        input: {
          title: 'Test Post',
          publishedAt: '2025-01-15T10:00:00.000Z',
          metadata: null,
        },
      });
    });

    it('should handle deeply nested input objects', () => {
      const deepSchemaMeta: SchemaMeta = {
        entities: {},
        inputs: {
          Level3Input: {
            fields: [
              { name: 'value', type: 'String' },
              { name: 'timestamp', type: 'DateTime' },
            ],
          },
          Level2Input: {
            fields: [
              { name: 'data', type: 'Level3Input' },
              { name: 'createdAt', type: 'DateTime' },
            ],
          },
          Level1Input: {
            fields: [{ name: 'nested', type: 'Level2Input' }],
          },
        },
        scalars: {},
      };

      const variables = {
        input: {
          nested: {
            data: {
              value: 'test',
              timestamp: new Date('2025-01-15T10:00:00Z'),
            },
            createdAt: new Date('2025-01-14T10:00:00Z'),
          },
        },
      };
      const variableDefs: VariableDef[] = [{ name: 'input', type: 'Level1Input' }];

      const result = serialize(deepSchemaMeta, variableDefs, scalars, variables);

      expect(result).toEqual({
        input: {
          nested: {
            data: {
              value: 'test',
              timestamp: '2025-01-15T10:00:00.000Z',
            },
            createdAt: '2025-01-14T10:00:00.000Z',
          },
        },
      });
    });
  });
});
