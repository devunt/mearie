import { describe, it, expect } from 'vitest';
import { requiredExchange } from './required.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { isExchangeError } from '../errors.ts';
import type { Selection } from '@mearie/shared';
import type { Operation } from '../exchange.ts';

describe('requiredExchange', () => {
  describe('passthrough', () => {
    it('should forward operations unchanged', async () => {
      const exchange = requiredExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { data: { name: 'Alice' } };
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
    });

    it('should pass through teardown operations', async () => {
      const exchange = requiredExchange();
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return {};
      });
      const operation = makeTestOperation({ variant: 'teardown' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(results[0]!.data).toBeUndefined();
      expect(results[0]!.errors).toBeUndefined();
    });

    it('should pass through results without data', async () => {
      const exchange = requiredExchange();
      const forward = makeTestForward(() => ({ data: undefined }));
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toBeUndefined();
    });

    it('should pass through when no selections have directives', async () => {
      const exchange = requiredExchange();
      const selections: Selection[] = [{ kind: 'Field', name: 'name', type: 'String' }];
      const forward = makeTestForward(() => ({
        data: { name: null },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ name: null });
    });
  });

  describe('THROW action', () => {
    it('should set errors when @required field is null', async () => {
      const exchange = requiredExchange();
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const forward = makeTestForward(() => ({
        data: { name: null },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toBeDefined();
      expect(results[0]!.errors).toHaveLength(1);
    });

    it('should create ExchangeError with required exchangeName', async () => {
      const exchange = requiredExchange();
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const forward = makeTestForward(() => ({
        data: { name: null },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(isExchangeError(results[0]!.errors![0]!, 'required')).toBe(true);
    });

    it('should include field path in error message', async () => {
      const exchange = requiredExchange();
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
      const forward = makeTestForward(() => ({
        data: { user: { name: null } },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.errors![0]!.message).toBe("Required field 'user.name' is null");
    });

    it('should not set errors when @required field has a value', async () => {
      const exchange = requiredExchange();
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];
      const forward = makeTestForward(() => ({
        data: { name: 'Alice' },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toEqual({ name: 'Alice' });
      expect(results[0]!.errors).toBeUndefined();
    });
  });

  describe('CASCADE action', () => {
    it('should set data to null when cascade field is null', async () => {
      const exchange = requiredExchange();
      const selections: Selection[] = [
        { kind: 'Field', name: 'id', type: 'ID' },
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required', args: { action: 'CASCADE' } }],
        },
      ];
      const forward = makeTestForward(() => ({
        data: { id: '1', name: null },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.data).toBeNull();
      expect(results[0]!.errors).toBeUndefined();
    });
  });

  describe('nested validation', () => {
    it('should validate nested @required fields', async () => {
      const exchange = requiredExchange();
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
              directives: [{ name: 'required' }],
            },
          ],
        },
      ];
      const forward = makeTestForward(() => ({
        data: { user: { id: '1', name: null } },
      }));
      const operation = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toHaveLength(1);
      expect(isExchangeError(results[0]!.errors![0]!, 'required')).toBe(true);
    });
  });

  describe('multiple operations', () => {
    it('should validate each operation independently', async () => {
      const exchange = requiredExchange();
      const selections: Selection[] = [
        {
          kind: 'Field',
          name: 'name',
          type: 'String',
          directives: [{ name: 'required' }],
        },
      ];

      let callCount = 0;
      const forward = makeTestForward(() => {
        callCount++;
        return { data: callCount === 1 ? { name: 'Alice' } : { name: null } };
      });

      const op1 = makeTestOperation({ kind: 'query', selections });
      const op2 = makeTestOperation({ kind: 'query', selections });

      const results = await testExchange(exchange, forward, [op1, op2]);

      expect(results).toHaveLength(2);
      expect(results[0]!.data).toEqual({ name: 'Alice' });
      expect(results[0]!.errors).toBeUndefined();
      expect(results[1]!.errors).toHaveLength(1);
    });
  });
});
