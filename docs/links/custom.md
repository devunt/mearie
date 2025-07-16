# Custom Links

Create your own links to add custom behavior to GraphQL operations.

## Link Interface

A link is an object with two properties:

```typescript
interface Link {
  name: string;
  execute(ctx: LinkContext, next: NextFn): Promise<LinkResult>;
}

interface LinkContext {
  operation: Operation;
  signal?: AbortSignal;
  metadata: Map<string, unknown>;
}

interface Operation {
  kind: 'query' | 'mutation' | 'subscription';
  document: DocumentNode;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
}

type NextFn = () => Promise<LinkResult>;

interface LinkResult {
  data?: unknown;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}
```

## Basic Example: Logging

```typescript
const loggingLink = (): Link => ({
  name: 'logging',

  async execute(ctx, next) {
    const start = Date.now();
    console.log(`[GraphQL] ${ctx.operation.kind} started`);

    try {
      const result = await next();
      const duration = Date.now() - start;
      console.log(`[GraphQL] ${ctx.operation.kind} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`[GraphQL] ${ctx.operation.kind} failed after ${duration}ms`, error);
      throw error;
    }
  },
});

// Usage
export const client = createClient({
  links: [loggingLink(), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

## Common Patterns

### Request Headers

```typescript
const headerLink = (headers: Record<string, string>): Link => ({
  name: 'header',

  async execute(ctx, next) {
    ctx.operation.headers = {
      ...ctx.operation.headers,
      ...headers,
    };

    return next();
  },
});

// Usage
export const client = createClient({
  links: [
    headerLink({
      'X-Client-Name': 'my-app',
      'X-Client-Version': '1.0.0',
    }),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

### Performance Monitoring

```typescript
const performanceLink = (): Link => ({
  name: 'performance',

  async execute(ctx, next) {
    const operationName = ctx.operation.document.name;

    performance.mark(`${operationName}-start`);

    try {
      const result = await next();

      performance.mark(`${operationName}-end`);
      performance.measure(operationName, `${operationName}-start`, `${operationName}-end`);

      return result;
    } catch (error) {
      performance.mark(`${operationName}-error`);
      throw error;
    }
  },
});
```

### Rate Limiting

```typescript
const rateLimitLink = (maxRequests: number, windowMs: number): Link => {
  const requests: number[] = [];

  return {
    name: 'rate-limit',

    async execute(ctx, next) {
      const now = Date.now();

      // Remove old requests outside the window
      while (requests.length > 0 && requests[0] < now - windowMs) {
        requests.shift();
      }

      // Check rate limit
      if (requests.length >= maxRequests) {
        throw new Error('Rate limit exceeded');
      }

      // Record this request
      requests.push(now);

      return next();
    },
  };
};

// Usage: Max 100 requests per minute
export const client = createClient({
  links: [rateLimitLink(100, 60000), httpLink({ url: 'https://api.example.com/graphql' })],
});
```

### Conditional Execution

```typescript
const conditionalLink = (condition: (ctx: LinkContext) => boolean, link: Link): Link => ({
  name: 'conditional',

  async execute(ctx, next) {
    if (condition(ctx)) {
      return link.execute(ctx, next);
    }
    return next();
  },
});

// Usage: Skip logging for introspection queries
export const client = createClient({
  links: [
    conditionalLink((ctx) => !ctx.operation.document.name.startsWith('IntrospectionQuery'), loggingLink()),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

## Metadata Sharing

Links can share data using the metadata map:

```typescript
const timingLink = (): Link => ({
  name: 'timing',

  async execute(ctx, next) {
    ctx.metadata.set('startTime', Date.now());
    const result = await next();
    const duration = Date.now() - ctx.metadata.get('startTime');
    ctx.metadata.set('duration', duration);
    return result;
  },
});

const loggingLink = (): Link => ({
  name: 'logging',

  async execute(ctx, next) {
    const result = await next();
    const duration = ctx.metadata.get('duration');
    console.log(`Request took ${duration}ms`);
    return result;
  },
});
```

## Terminating Links

A terminating link doesn't call `next()` - it executes the final operation:

```typescript
const mockLink = (data: unknown): Link => ({
  name: 'mock',

  async execute(ctx, next) {
    // Don't call next() - return mock data immediately
    return { data };
  },
});

// Useful for testing
export const client = createClient({
  links: [mockLink({ user: { id: '1', name: 'Test User' } })],
});
```

## Error Handling

Handle errors from downstream links:

```typescript
const errorLink = (): Link => ({
  name: 'error',

  async execute(ctx, next) {
    try {
      return await next();
    } catch (error) {
      // Transform or log errors
      console.error('GraphQL Error:', error);

      // Add additional context
      error.operation = ctx.operation.kind;
      error.timestamp = new Date().toISOString();

      throw error;
    }
  },
});
```

## Best Practices

- **Name your links** - Helps with debugging
- **Handle errors** - Always consider error cases
- **Call next()** - Unless you're terminating
- **Keep it simple** - Each link should do one thing well
- **Use metadata** - Share data between links when needed

## Link Chain Placement

Place custom links based on their purpose:

```typescript
export const client = createClient({
  links: [
    loggingLink(), // Logging/monitoring - outermost
    performanceLink(), // Performance tracking - early
    headerLink(), // Request transformation - before cache
    retryLink(),
    dedupLink(),
    cacheLink(),
    httpLink({ url: 'https://api.example.com/graphql' }),
  ],
});
```

General guidelines:

- **Non-terminating links** - Place before `httpLink`
- **Request transformation** - Place before `cacheLink`
- **Monitoring/logging** - Place at the outermost layer
- **Terminating links** - Place at the end of the chain

## Next Steps

- [Links](/guides/links) - Understanding the link system
- [HTTP Link](/links/http) - Built-in terminating link
- [Cache Link](/links/cache) - Built-in caching link
