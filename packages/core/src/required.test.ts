import { describe, it, expect } from 'vitest';
import { validateRequired, RequiredFieldError } from './required.ts';
import type { Selection } from '@mearie/shared';

describe('validateRequired', () => {
  describe('passthrough', () => {
    it('should return null data as-is', () => {
      const selections: Selection[] = [{ kind: 'Field', name: 'name', type: 'String' }];
      expect(validateRequired(selections, null)).toBeNull();
    });

    it('should return undefined data as-is', () => {
      const selections: Selection[] = [{ kind: 'Field', name: 'name', type: 'String' }];
      expect(validateRequired(selections)).toBeUndefined();
    });

    it('should return primitive data as-is', () => {
      const selections: Selection[] = [];
      expect(validateRequired(selections, 'hello')).toBe('hello');
      expect(validateRequired(selections, 42)).toBe(42);
    });

    it('should pass through fields without @required', () => {
      const selections: Selection[] = [
        { kind: 'Field', name: 'name', type: 'String' },
        { kind: 'Field', name: 'email', type: 'String' },
      ];
      const data = { name: 'Alice', email: null };

      expect(validateRequired(selections, data)).toEqual({ name: 'Alice', email: null });
    });
  });

  describe('THROW action', () => {
    it('should throw RequiredFieldError when @required field is null', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const data = { name: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });

    it('should throw with default THROW action when no action specified', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const data = { name: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });

    it('should throw with explicit THROW action', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required', args: { action: 'THROW' } }],
        },
      ];
      const data = { name: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });

    it('should include field path in error', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required' }],
            },
          ],
        },
      ];
      const data = { user: { name: null } };

      try {
        validateRequired(selections, data);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(RequiredFieldError);
        const error = e as RequiredFieldError;
        expect(error.fieldPath).toEqual(['user']);
        expect(error.fieldName).toBe('name');
        expect(error.message).toBe("Required field 'user.name' is null");
      }
    });

    it('should not throw when @required field has a value', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const data = { name: 'Alice' };

      expect(validateRequired(selections, data)).toEqual({ name: 'Alice' });
    });
  });

  describe('CASCADE action', () => {
    it('should return null when @required(action: CASCADE) field is null', () => {
      const selections: Selection[] = [
        { kind: 'Field', name: 'id', type: 'ID' },
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required', args: { action: 'CASCADE' } }],
        },
      ];
      const data = { id: '1', name: null };

      expect(validateRequired(selections, data)).toBeNull();
    });

    it('should not cascade when field has a value', () => {
      const selections: Selection[] = [
        { kind: 'Field', name: 'id', type: 'ID' },
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required', args: { action: 'CASCADE' } }],
        },
      ];
      const data = { id: '1', name: 'Alice' };

      expect(validateRequired(selections, data)).toEqual({ id: '1', name: 'Alice' });
    });

    it('should cascade null to parent from nested field', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required', args: { action: 'CASCADE' } }],
            },
          ],
        },
      ];
      const data = { user: { id: '1', name: null } };

      const result = validateRequired(selections, data);
      // CASCADE propagates: user's selection returns null, then parent sees null + cascade → whole result is null
      expect(result).toBeNull();
    });

    it('should cascade through multiple levels', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'Field',
              name: 'profile',
              type: 'Profile',
              directives: [{ name: 'required', args: { action: 'CASCADE' } }],
              selections: [
                {
                  kind: 'Field',
                  name: 'avatar',
                  type: 'String',
                  directives: [{ name: 'required', args: { action: 'CASCADE' } }],
                },
              ],
            },
          ],
        },
      ];
      const data = { user: { profile: { avatar: null } } };

      const result = validateRequired(selections, data);
      // avatar CASCADE → profile null → profile CASCADE → user null → parent sees null + cascade → whole null
      expect(result).toBeNull();
    });

    it('should stop cascade at nullable ancestor', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          nullable: true,
          selections: [
            { kind: 'Field', name: 'id', type: 'ID' },
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required', args: { action: 'CASCADE' } }],
            },
          ],
        },
      ];
      const data = { user: { id: '1', name: null } };

      const result = validateRequired(selections, data) as Record<string, unknown>;
      expect(result.user).toBeNull();
    });

    it('should cascade through non-null field to root', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required', args: { action: 'CASCADE' } }],
            },
          ],
        },
      ];
      const data = { user: { name: null } };

      expect(validateRequired(selections, data)).toBeNull();
    });

    it('should stop cascade at nearest nullable in a chain', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          selections: [
            {
              kind: 'Field',
              name: 'profile',
              type: 'Profile',
              nullable: true,
              selections: [
                {
                  kind: 'Field',
                  name: 'avatar',
                  type: 'String',
                  directives: [{ name: 'required', args: { action: 'CASCADE' } }],
                },
              ],
            },
          ],
        },
      ];
      const data = { user: { profile: { avatar: null } } };

      const result = validateRequired(selections, data) as Record<string, unknown>;
      const user = result.user as Record<string, unknown>;
      expect(user.profile).toBeNull();
    });

    it('should cascade through @required field even if nullable in schema', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'user',
          type: 'User',
          nullable: true,
          selections: [
            {
              kind: 'Field',
              name: 'profile',
              type: 'Profile',
              nullable: true,
              directives: [{ name: 'required' }],
              selections: [
                {
                  kind: 'Field',
                  name: 'avatar',
                  type: 'String',
                  directives: [{ name: 'required', args: { action: 'CASCADE' } }],
                },
              ],
            },
          ],
        },
      ];
      const data = { user: { profile: { avatar: null } } };

      const result = validateRequired(selections, data) as Record<string, unknown>;
      // avatar CASCADE → profile becomes null → profile has @required (effectively non-null) → cascade continues → user absorbs (nullable)
      expect(result.user).toBeNull();
    });
  });

  describe('arrays', () => {
    it('should validate each item in an array', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const data = [{ name: 'Alice' }, { name: 'Bob' }];

      expect(validateRequired(selections, data)).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    });

    it('should throw on null @required field inside array item', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const data = [{ name: 'Alice' }, { name: null }];

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });

    it('should cascade null for array items', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required', args: { action: 'CASCADE' } }],
        },
      ];
      const data = [{ name: 'Alice' }, { name: null }];

      const result = validateRequired(selections, data) as unknown[];
      expect(result[0]).toEqual({ name: 'Alice' });
      expect(result[1]).toBeNull();
    });
  });

  describe('aliases', () => {
    it('should use alias for field lookup', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          alias: 'userName',
          directives: [{ name: 'required' }],
        },
      ];
      const data = { userName: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });
  });

  describe('fragment spreads', () => {
    it('should validate fields from fragment spreads', () => {
      const selections: Selection[] = [
        {
          kind: 'FragmentSpread',
          name: 'UserFields',
          selections: [
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required' }],
            },
          ],
        },
      ];
      const data = { name: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });

    it('should cascade null from fragment spread', () => {
      const selections: Selection[] = [
        { kind: 'Field', name: 'id', type: 'ID' },
        {
          kind: 'FragmentSpread',
          name: 'UserFields',
          selections: [
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required', args: { action: 'CASCADE' } }],
            },
          ],
        },
      ];
      const data = { id: '1', name: null };

      expect(validateRequired(selections, data)).toBeNull();
    });
  });

  describe('inline fragments', () => {
    it('should validate fields from inline fragments', () => {
      const selections: Selection[] = [
        {
          kind: 'InlineFragment',
          on: 'User',
          selections: [
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required' }],
            },
          ],
        },
      ];
      const data = { name: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });

    it('should cascade null from inline fragment', () => {
      const selections: Selection[] = [
        {
          kind: 'InlineFragment',
          on: 'User',
          selections: [
            {
              kind: 'Field',
              name: 'name',
              type: 'String',
              directives: [{ name: 'required', args: { action: 'CASCADE' } }],
            },
          ],
        },
      ];
      const data = { name: null };

      expect(validateRequired(selections, data)).toBeNull();
    });
  });

  describe('mixed directives', () => {
    it('should ignore non-required directives', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'include', args: { if: true } }],
        },
      ];
      const data = { name: null };

      expect(validateRequired(selections, data)).toEqual({ name: null });
    });

    it('should detect @required among other directives', () => {
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'include', args: { if: true } }, { name: 'required' }],
        },
      ];
      const data = { name: null };

      expect(() => validateRequired(selections, data)).toThrow(RequiredFieldError);
    });
  });
});
