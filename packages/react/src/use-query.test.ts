import { describe, it, expect, vi } from 'vitest';
import { Component, Suspense, createElement, act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AggregatedError } from '@mearie/core';
import { useQuery } from './use-query.ts';
import { ClientProvider } from './client-provider.tsx';
import { createMockClient, renderHook, mockQuery, makeResult } from './test-utils.ts';

class TestErrorBoundary extends Component<
  { children?: ReactNode; onError: (error: unknown) => void },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    return this.state.hasError ? createElement('div', null, 'errored') : this.props.children;
  }
}

describe('useQuery', () => {
  it('should transition from loading to data', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });
    expect(result.current.error).toBeUndefined();
    unmount();
  });

  it('should handle errors', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(AggregatedError);
    expect(result.current.error!.errors[0]!.message).toBe('Not found');
    unmount();
  });

  it('should not execute when skip is true', () => {
    const { client } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery, undefined, { skip: true }), client);

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).not.toHaveBeenCalled();
    unmount();
  });

  it('should use initialData immediately', () => {
    const { client } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = renderHook(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('should update data after initialData when fetch completes', () => {
    const { client, subjects } = createMockClient();
    const initialData = { id: '1', name: 'Prefetched' };
    const { result, unmount } = renderHook(() => useQuery(mockQuery, undefined, { initialData }), client);

    expect(result.current.data).toEqual(initialData);
    expect(result.current.loading).toBe(false);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Updated' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Updated' });
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('should re-execute on refetch', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1' }));
    });

    expect(result.current.data).toEqual({ id: '1' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    unmount();
  });

  it('should unsubscribe on unmount', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1' }));
    });

    unmount();

    act(() => {
      subjects.query.next(makeResult({ id: '2' }));
    });

    expect(result.current.data).toEqual({ id: '1' });
  });

  it('should update data on multiple results', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'First' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'First' });

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Second' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Second' });
    unmount();
  });

  it('should apply patch-based updates', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Alice' });

    act(() => {
      subjects.query.next(
        makeResult(undefined, {
          metadata: {
            cache: {
              patches: [{ type: 'set', path: ['name'], value: 'Bob' }],
            },
          },
        }),
      );
    });

    expect(result.current.data).toEqual({ id: '1', name: 'Bob' });
    unmount();
  });

  it('should expose metadata', () => {
    const { client, subjects } = createMockClient();
    const { result, unmount } = renderHook(() => useQuery(mockQuery), client);

    const testMetadata = { cache: { stale: true } };
    act(() => {
      subjects.query.next(makeResult({ id: '1' }, { metadata: testMetadata }));
    });

    expect(result.current.metadata).toEqual(testMetadata);
    unmount();
  });

  it('should suspend until the first query result resolves when suspense is true', async () => {
    const { client, subjects } = createMockClient();
    const container = document.createElement('div');
    const root = createRoot(container);

    const TestComponent = (): ReactNode => {
      const { data } = useQuery(mockQuery, undefined, { suspense: true });
      return createElement('div', null, (data as { name: string }).name);
    };

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent),
          ),
        }),
      );
    });

    expect(container.textContent).toContain('loading');

    await act(async () => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
      await Promise.resolve();
    });

    expect(container.textContent).toBe('Alice');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Bob' }));
    });

    expect(container.textContent).toBe('Bob');
    act(() => root.unmount());
  });

  it('should refresh in the background when suspense and initialData are provided', () => {
    const { client, subjects } = createMockClient();
    const container = document.createElement('div');
    const root = createRoot(container);

    const TestComponent = (): ReactNode => {
      const { data } = useQuery(mockQuery, undefined, {
        suspense: true,
        initialData: { id: '1', name: 'Prefetched' },
      });
      return createElement('div', null, (data as { name: string }).name);
    };

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent),
          ),
        }),
      );
    });

    expect(container.textContent).toBe('Prefetched');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    act(() => {
      subjects.query.next(makeResult({ id: '1', name: 'Updated' }));
    });

    expect(container.textContent).toBe('Updated');
    act(() => root.unmount());
  });

  it('should use each caller initialData when suspense and initialData are provided', () => {
    const { client } = createMockClient();
    const container = document.createElement('div');
    const root = createRoot(container);

    const TestComponent = ({ name }: { name: string }): ReactNode => {
      const { data } = useQuery(mockQuery, undefined, {
        suspense: true,
        initialData: { id: '1', name },
      });
      return createElement('div', null, (data as { name: string }).name);
    };

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent, { key: 'first', name: 'First' }),
          ),
        }),
      );
    });

    expect(container.textContent).toBe('First');

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent, { key: 'second', name: 'Second' }),
          ),
        }),
      );
    });

    expect(container.textContent).toBe('Second');
    act(() => root.unmount());
  });

  it('should not start duplicate suspense queries when variables change', async () => {
    const { client, subjects } = createMockClient();
    const container = document.createElement('div');
    const root = createRoot(container);
    let setUserId: (userId: string) => void = () => {};

    const TestComponent = (): ReactNode => {
      const [userId, setStateUserId] = useState('1');
      setUserId = setStateUserId;
      const { data } = useQuery(mockQuery, { id: userId } as never, { suspense: true });
      return createElement('div', null, (data as { name: string }).name);
    };

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent),
          ),
        }),
      );
    });

    await act(async () => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
      await Promise.resolve();
    });

    expect(container.textContent).toBe('Alice');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(1);

    act(() => setUserId('2'));

    expect(container.textContent).toContain('loading');

    await act(async () => {
      subjects.query.next(makeResult({ id: '2', name: 'Bob' }));
      await Promise.resolve();
    });

    expect(container.textContent).toBe('Bob');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('should throw query errors to an error boundary when suspense is true', async () => {
    const { client, subjects } = createMockClient();
    const container = document.createElement('div');
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let caughtError: unknown;

    const TestComponent = (): ReactNode => {
      useQuery(mockQuery, undefined, { suspense: true });
      return createElement('div', null, 'loaded');
    };

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            TestErrorBoundary,
            { onError: (error) => (caughtError = error) },
            createElement(Suspense, { fallback: createElement('div', null, 'loading') }, createElement(TestComponent)),
          ),
        }),
      );
    });

    await act(async () => {
      subjects.query.next(makeResult(undefined, { errors: [{ message: 'Not found' }] }));
      await Promise.resolve();
    });

    expect(container.textContent).toBe('errored');
    expect(caughtError).toBeInstanceOf(AggregatedError);
    act(() => root.unmount());
    consoleError.mockRestore();
  });

  it('should throw when a suspense query completes without a result', async () => {
    const { client, subjects } = createMockClient();
    const container = document.createElement('div');
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let caughtError: unknown;

    const TestComponent = (): ReactNode => {
      useQuery(mockQuery, undefined, { suspense: true });
      return createElement('div', null, 'loaded');
    };

    act(() => {
      root.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            TestErrorBoundary,
            { onError: (error) => (caughtError = error) },
            createElement(Suspense, { fallback: createElement('div', null, 'loading') }, createElement(TestComponent)),
          ),
        }),
      );
    });

    await act(async () => {
      subjects.query.complete();
      await Promise.resolve();
    });

    expect(container.textContent).toBe('errored');
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('Query completed without emitting a result');
    act(() => root.unmount());
    consoleError.mockRestore();
  });

  it('should keep suspense resource data current after patch updates', async () => {
    const { client, subjects } = createMockClient();
    const firstContainer = document.createElement('div');
    const firstRoot = createRoot(firstContainer);

    const TestComponent = (): ReactNode => {
      const { data } = useQuery(mockQuery, undefined, { suspense: true });
      return createElement('div', null, (data as { name: string }).name);
    };

    act(() => {
      firstRoot.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent),
          ),
        }),
      );
    });

    await act(async () => {
      subjects.query.next(makeResult({ id: '1', name: 'Alice' }));
      await Promise.resolve();
    });

    act(() => {
      subjects.query.next(
        makeResult(undefined, {
          metadata: {
            cache: {
              patches: [{ type: 'set', path: ['name'], value: 'Patched' }],
            },
          },
        }),
      );
    });

    expect(firstContainer.textContent).toBe('Patched');
    act(() => firstRoot.unmount());

    const secondContainer = document.createElement('div');
    const secondRoot = createRoot(secondContainer);

    act(() => {
      secondRoot.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent),
          ),
        }),
      );
    });

    expect(secondContainer.textContent).toBe('Patched');
    act(() => secondRoot.unmount());
  });

  it('should retry suspense queries after an error boundary reset', async () => {
    const { client, subjects } = createMockClient();
    const firstContainer = document.createElement('div');
    const firstRoot = createRoot(firstContainer);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let caughtError: unknown;

    const TestComponent = (): ReactNode => {
      const { data } = useQuery(mockQuery, undefined, { suspense: true });
      return createElement('div', null, (data as { name: string }).name);
    };

    act(() => {
      firstRoot.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            TestErrorBoundary,
            { onError: (error) => (caughtError = error) },
            createElement(Suspense, { fallback: createElement('div', null, 'loading') }, createElement(TestComponent)),
          ),
        }),
      );
    });

    await act(async () => {
      subjects.query.next(makeResult(undefined, { errors: [{ message: 'Temporary failure' }] }));
      await Promise.resolve();
    });

    expect(firstContainer.textContent).toBe('errored');
    expect(caughtError).toBeInstanceOf(AggregatedError);
    act(() => firstRoot.unmount());

    const secondContainer = document.createElement('div');
    const secondRoot = createRoot(secondContainer);

    act(() => {
      secondRoot.render(
        createElement(ClientProvider, {
          client,
          children: createElement(
            Suspense,
            { fallback: createElement('div', null, 'loading') },
            createElement(TestComponent),
          ),
        }),
      );
    });

    expect(secondContainer.textContent).toBe('loading');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(client.executeQuery).toHaveBeenCalledTimes(2);

    await act(async () => {
      subjects.query.next(makeResult({ id: '1', name: 'Recovered' }));
      await Promise.resolve();
    });

    expect(secondContainer.textContent).toBe('Recovered');
    act(() => secondRoot.unmount());
    consoleError.mockRestore();
  });
});
