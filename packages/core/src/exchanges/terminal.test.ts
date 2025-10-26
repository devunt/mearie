import { describe, it, expect } from 'vitest';
import { terminalExchange } from './terminal.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { isExchangeError } from '../errors.ts';

describe('terminalExchange', () => {
  describe('error handling', () => {
    it('should return error for request operation', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toBeDefined();
      expect(results[0]!.errors).toHaveLength(1);
    });

    it('should return error for query operation', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toBeDefined();
    });

    it('should return error for mutation operation', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'mutation' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toBeDefined();
    });

    it('should return error for subscription operation', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results).toHaveLength(1);
      expect(results[0]!.errors).toBeDefined();
    });
  });

  describe('error details', () => {
    it('should include correct error message', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      const error = results[0]!.errors![0]!;
      expect(error.message).toBe(
        'No terminal exchange found in exchange chain. Did you forget to add httpExchange to your exchanges array?',
      );
    });

    it('should set exchangeName to terminal', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      const error = results[0]!.errors![0]!;
      expect(isExchangeError(error, 'terminal')).toBe(true);
    });

    it('should preserve operation in result', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query', name: 'TestQuery' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0]!.operation).toEqual(operation);
    });
  });

  describe('multiple operations', () => {
    it('should return error for each request operation', async () => {
      const exchange = terminalExchange();
      const forward = makeTestForward();
      const op1 = makeTestOperation({ kind: 'query' });
      const op2 = makeTestOperation({ kind: 'mutation' });
      const op3 = makeTestOperation({ kind: 'subscription' });

      const results = await testExchange(exchange, forward, [op1, op2, op3]);

      expect(results).toHaveLength(3);
      expect(results[0]!.errors).toBeDefined();
      expect(results[1]!.errors).toBeDefined();
      expect(results[2]!.errors).toBeDefined();
    });
  });

  describe('forward function', () => {
    it('should not call forward function', async () => {
      const exchange = terminalExchange();
      let forwardCalled = false;
      const forward = makeTestForward(() => {
        forwardCalled = true;
        return {};
      });
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardCalled).toBe(false);
    });
  });
});
