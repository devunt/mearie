import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { httpExchange } from './http.ts';
import { makeTestOperation, makeTestForward, testExchange } from './test-utils.ts';
import { isExchangeError } from '../errors.ts';
import type { Operation } from '../exchange.ts';

describe('httpExchange', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request execution', () => {
    it('should execute query operation', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => ({ data: { user: { id: '1' } } }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(mockFetch).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('should execute mutation operation', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { createUser: { id: '1' } } }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'mutation' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(mockFetch).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('should not execute subscription operation', async () => {
      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ kind: 'subscription' });

      await testExchange(exchange, forward, [operation]);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(forwardedOps).toHaveLength(1);
    });

    it('should not execute fragment operation', async () => {
      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ kind: 'fragment' });

      await testExchange(exchange, forward, [operation]);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('fetch behavior', () => {
    it('should send POST request with correct body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query', name: 'GetUser', variables: { id: 1 } });

      await testExchange(exchange, forward, [operation]);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/graphql',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should include query source in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toHaveProperty('query');
    });

    it('should include variables in body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query', variables: { id: 1 } });

      await testExchange(exchange, forward, [operation]);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.variables).toEqual({ id: 1 });
    });

    it('should set Content-Type header to application/json', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should include custom headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({
        url: 'http://test.com/graphql',
        headers: { Authorization: 'Bearer token123' },
      });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers.Authorization).toBe('Bearer token123');
    });
  });

  describe('response handling', () => {
    it('should parse successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { user: { id: '1', name: 'Alice' } } }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].data).toEqual({ user: { id: '1', name: 'Alice' } });
    });

    it('should extract data from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { test: true } }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].data).toEqual({ test: true });
    });

    it('should extract GraphQL errors from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: 'User not found' }],
        }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].errors).toBeDefined();
      expect(results[0].errors).toHaveLength(1);
      expect(results[0].errors![0].message).toBe('User not found');
    });

    it('should extract extensions from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {},
          extensions: { tracing: { duration: 123 } },
        }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].extensions).toEqual({ tracing: { duration: 123 } });
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].errors).toBeDefined();
      expect(results[0].errors![0].message).toBe('Network error');
    });

    it('should handle HTTP error status codes', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].errors).toBeDefined();
      expect(results[0].errors![0].message).toContain('500');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(results[0].errors).toBeDefined();
      expect(results[0].errors![0].message).toBe('Invalid JSON');
    });

    it('should create ExchangeError with correct properties', async () => {
      mockFetch.mockRejectedValue(new Error('Test error'));

      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      const results = await testExchange(exchange, forward, [operation]);

      expect(isExchangeError(results[0].errors![0], 'http')).toBe(true);
    });
  });

  describe('teardown operations', () => {
    it('should forward teardown operations', async () => {
      const exchange = httpExchange({ url: 'http://test.com/graphql' });
      const forwardedOps: Operation[] = [];
      const forward = makeTestForward((op) => {
        forwardedOps.push(op);
        return { operation: op };
      });
      const operation = makeTestOperation({ variant: 'teardown' });

      await testExchange(exchange, forward, [operation]);

      expect(forwardedOps).toHaveLength(1);
      expect(forwardedOps[0].variant).toBe('teardown');
    });
  });

  describe('fetch options', () => {
    it('should use provided URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://custom.com/api' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      expect(mockFetch).toHaveBeenCalledWith('http://custom.com/api', expect.anything());
    });

    it('should use provided mode', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql', mode: 'cors' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].mode).toBe('cors');
    });

    it('should use provided credentials', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const exchange = httpExchange({ url: 'http://test.com/graphql', credentials: 'include' });
      const forward = makeTestForward();
      const operation = makeTestOperation({ kind: 'query' });

      await testExchange(exchange, forward, [operation]);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].credentials).toBe('include');
    });
  });
});
