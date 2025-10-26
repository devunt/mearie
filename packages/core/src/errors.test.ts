import { describe, expect, it } from 'vitest';
import {
  GraphQLError,
  ExchangeError,
  AggregatedError,
  isGraphQLError,
  isExchangeError,
  isAggregatedError,
} from './errors.ts';

declare module './errors.ts' {
  interface ExchangeErrorExtensionsMap {
    testExchange: {
      testField: string;
      optionalField?: number;
    };
    optionalExchange?: {
      optionalData?: string;
    };
  }
}

describe('GraphQLError', () => {
  it('should create a GraphQLError with message only', () => {
    const error = new GraphQLError('Test error');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.name).toBe('GraphQLError');
    expect(error.message).toBe('Test error');
    expect(error.path).toBeUndefined();
    expect(error.locations).toBeUndefined();
    expect(error.extensions).toBeUndefined();
  });

  it('should create a GraphQLError with all properties', () => {
    const error = new GraphQLError('Field error', {
      path: ['user', 'name'],
      locations: [{ line: 1, column: 5 }],
      extensions: { code: 'VALIDATION_ERROR' },
    });

    expect(error.message).toBe('Field error');
    expect(error.path).toEqual(['user', 'name']);
    expect(error.locations).toEqual([{ line: 1, column: 5 }]);
    expect(error.extensions).toEqual({ code: 'VALIDATION_ERROR' });
  });

  it('should serialize to JSON correctly', () => {
    const error = new GraphQLError('Field error', {
      path: ['user', 'name'],
      locations: [{ line: 1, column: 5 }],
      extensions: { code: 'VALIDATION_ERROR' },
    });

    const json = error.toJSON();

    expect(json).toEqual({
      message: 'Field error',
      path: ['user', 'name'],
      locations: [{ line: 1, column: 5 }],
      extensions: { code: 'VALIDATION_ERROR' },
    });
  });

  it('should serialize to JSON without optional fields', () => {
    const error = new GraphQLError('Simple error');
    const json = error.toJSON();

    expect(json).toEqual({
      message: 'Simple error',
    });
  });

  it('should support cause option', () => {
    const cause = new Error('Original error');
    const error = new GraphQLError('Wrapped error', { cause });

    expect(error.cause).toBe(cause);
  });
});

describe('ExchangeError', () => {
  it('should create an ExchangeError with unregistered exchange', () => {
    const error = new ExchangeError('Network error', {
      exchangeName: 'customExchange',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExchangeError);
    expect(error.name).toBe('ExchangeError');
    expect(error.message).toBe('Network error');
    expect(error.exchangeName).toBe('customExchange');
    expect(error.extensions).toBeUndefined();
  });

  it('should create an ExchangeError with unregistered exchange and extensions', () => {
    const error = new ExchangeError('Custom error', {
      exchangeName: 'customExchange',
      extensions: { customData: 'value' },
    });

    expect(error.message).toBe('Custom error');
    expect(error.exchangeName).toBe('customExchange');
    expect(error.extensions).toEqual({ customData: 'value' });
  });

  it('should create an ExchangeError with registered exchange (testExchange)', () => {
    const error = new ExchangeError('Test exchange error', {
      exchangeName: 'testExchange',
      extensions: { testField: 'required value' },
    });

    expect(error.message).toBe('Test exchange error');
    expect(error.exchangeName).toBe('testExchange');
    expect(error.extensions).toEqual({ testField: 'required value' });
  });

  it('should create an ExchangeError with registered exchange and optional fields', () => {
    const error = new ExchangeError('Test exchange error', {
      exchangeName: 'testExchange',
      extensions: { testField: 'required value', optionalField: 42 },
    });

    expect(error.extensions).toEqual({ testField: 'required value', optionalField: 42 });
  });

  it('should serialize to JSON correctly with extensions', () => {
    const error = new ExchangeError('Custom error', {
      exchangeName: 'customExchange',
      extensions: { customData: 'value' },
    });

    const json = error.toJSON();

    expect(json).toEqual({
      message: 'Custom error',
      exchangeName: 'customExchange',
      extensions: { customData: 'value' },
    });
  });

  it('should serialize to JSON without optional fields', () => {
    const error = new ExchangeError('Network error', {
      exchangeName: 'customExchange',
    });

    const json = error.toJSON();

    expect(json).toEqual({
      message: 'Network error',
      exchangeName: 'customExchange',
    });
  });

  it('should support cause option', () => {
    const cause = new TypeError('Fetch failed');
    const error = new ExchangeError('Network error', {
      exchangeName: 'customExchange',
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it('should create an ExchangeError with optional exchange property (no extensions)', () => {
    const error = new ExchangeError('Optional exchange error', {
      exchangeName: 'optionalExchange',
    });

    expect(error.message).toBe('Optional exchange error');
    expect(error.exchangeName).toBe('optionalExchange');
    expect(error.extensions).toBeUndefined();
  });

  it('should create an ExchangeError with optional exchange property (with extensions)', () => {
    const error = new ExchangeError('Optional exchange error', {
      exchangeName: 'optionalExchange',
      extensions: { optionalData: 'value' },
    });

    expect(error.message).toBe('Optional exchange error');
    expect(error.exchangeName).toBe('optionalExchange');
    expect(error.extensions).toEqual({ optionalData: 'value' });
  });
});

describe('AggregatedError', () => {
  it('should create an AggregatedError with multiple errors', () => {
    const error1 = new GraphQLError('Error 1');
    const error2 = new ExchangeError('Error 2', { exchangeName: 'customExchange' });
    const aggregated = new AggregatedError([error1, error2]);

    expect(aggregated).toBeInstanceOf(Error);
    expect(aggregated).toBeInstanceOf(AggregateError);
    expect(aggregated).toBeInstanceOf(AggregatedError);
    expect(aggregated.name).toBe('AggregatedError');
    expect(aggregated.message).toBe('2 error(s) occurred');
    expect(aggregated.errors).toHaveLength(2);
    expect(aggregated.errors[0]).toBe(error1);
    expect(aggregated.errors[1]).toBe(error2);
  });

  it('should create an AggregatedError with custom message', () => {
    const error1 = new GraphQLError('Error 1');
    const aggregated = new AggregatedError([error1], 'Custom error message');

    expect(aggregated.message).toBe('Custom error message');
    expect(aggregated.errors).toHaveLength(1);
  });

  it('should serialize to JSON correctly', () => {
    const error1 = new GraphQLError('GraphQL error');
    const error2 = new ExchangeError('Exchange error', { exchangeName: 'customExchange' });
    const aggregated = new AggregatedError([error1, error2], 'Multiple errors');

    const json = aggregated.toJSON();

    expect(json).toEqual({
      message: 'Multiple errors',
      errors: [
        { message: 'GraphQL error' },
        { message: 'Exchange error', exchangeName: 'customExchange' },
      ],
    });
  });
});

describe('Type guards', () => {
  describe('isGraphQLError', () => {
    it('should return true for GraphQLError instances', () => {
      const error = new GraphQLError('Test');
      expect(isGraphQLError(error)).toBe(true);
    });

    it('should return false for ExchangeError instances', () => {
      const error = new ExchangeError('Test', { exchangeName: 'customExchange' });
      expect(isGraphQLError(error)).toBe(false);
    });

    it('should return false for AggregatedError instances', () => {
      const error = new AggregatedError([new GraphQLError('Test')]);
      expect(isGraphQLError(error)).toBe(false);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Test');
      expect(isGraphQLError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isGraphQLError(null)).toBe(false);
      expect(isGraphQLError(void 0)).toBe(false);
      expect(isGraphQLError('error')).toBe(false);
      expect(isGraphQLError({})).toBe(false);
    });
  });

  describe('isExchangeError', () => {
    it('should return true for ExchangeError instances', () => {
      const error = new ExchangeError('Test', { exchangeName: 'customExchange' });
      expect(isExchangeError(error)).toBe(true);
    });

    it('should return false for GraphQLError instances', () => {
      const error = new GraphQLError('Test');
      expect(isExchangeError(error)).toBe(false);
    });

    it('should return false for AggregatedError instances', () => {
      const error = new AggregatedError([new ExchangeError('Test', { exchangeName: 'customExchange' })]);
      expect(isExchangeError(error)).toBe(false);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Test');
      expect(isExchangeError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isExchangeError(null)).toBe(false);
      expect(isExchangeError(void 0)).toBe(false);
      expect(isExchangeError('error')).toBe(false);
      expect(isExchangeError({})).toBe(false);
    });

    it('should narrow to specific exchange type with exchangeName parameter', () => {
      const testError = new ExchangeError('Test error', {
        exchangeName: 'testExchange',
        extensions: { testField: 'value' },
      });
      const otherError = new ExchangeError('Other error', {
        exchangeName: 'otherExchange',
      });

      expect(isExchangeError(testError, 'testExchange')).toBe(true);
      expect(isExchangeError(testError, 'otherExchange')).toBe(false);
      expect(isExchangeError(otherError, 'testExchange')).toBe(false);

      if (isExchangeError(testError, 'testExchange')) {
        expect(testError.extensions.testField).toBe('value');
      }
    });

    it('should return false when exchangeName does not match', () => {
      const error = new ExchangeError('Test', { exchangeName: 'customExchange' });
      expect(isExchangeError(error, 'http')).toBe(false);
    });

    it('should return false for non-ExchangeError with exchangeName parameter', () => {
      const error = new GraphQLError('Test');
      expect(isExchangeError(error, 'http')).toBe(false);
    });
  });

  describe('isAggregatedError', () => {
    it('should return true for AggregatedError instances', () => {
      const error = new AggregatedError([new GraphQLError('Test')]);
      expect(isAggregatedError(error)).toBe(true);
    });

    it('should return false for GraphQLError instances', () => {
      const error = new GraphQLError('Test');
      expect(isAggregatedError(error)).toBe(false);
    });

    it('should return false for ExchangeError instances', () => {
      const error = new ExchangeError('Test', { exchangeName: 'customExchange' });
      expect(isAggregatedError(error)).toBe(false);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Test');
      expect(isAggregatedError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isAggregatedError(null)).toBe(false);
      expect(isAggregatedError(void 0)).toBe(false);
      expect(isAggregatedError('error')).toBe(false);
      expect(isAggregatedError({})).toBe(false);
    });
  });

  describe('Custom exchange type guards', () => {
    it('should narrow ExchangeError to specific exchange type', () => {
      const isTestExchangeError = (error: unknown): error is ExchangeError<'testExchange'> => {
        return isExchangeError(error) && error.exchangeName === 'testExchange';
      };

      const testError = new ExchangeError('Test error', {
        exchangeName: 'testExchange',
        extensions: { testField: 'value' },
      });

      const otherError = new ExchangeError('Other error', {
        exchangeName: 'otherExchange',
      });

      expect(isTestExchangeError(testError)).toBe(true);
      expect(isTestExchangeError(otherError)).toBe(false);

      if (isTestExchangeError(testError)) {
        expect(testError.extensions.testField).toBe('value');
      }
    });
  });
});
