import { AggregatedError } from './errors.ts';
import { stringify } from './utils.ts';
import type { OperationResult } from './exchange.ts';
import type { Patch } from './cache/types.ts';

export type ObserverEmission<D> = {
  key: string;
  data: D | undefined;
  error: AggregatedError | undefined;
  metadata: OperationResult['metadata'];
};

export type ObserverState<D> = {
  emission: ObserverEmission<D> | undefined;
  previous: { key: string; data: D } | undefined;
  fetching: boolean;
  lastInitialData: { ref: unknown; key: string } | undefined;
};

export type ObserverView<D> = {
  data: D | undefined;
  previousData: D | undefined;
  loading: boolean;
  error: AggregatedError | undefined;
  metadata: OperationResult['metadata'];
};

export const computeObserverKey = (artifact: { name: string }, variables: unknown): string => {
  return `${artifact.name}:${stringify(variables)}`;
};

export const initObserverState = <D>(): ObserverState<D> => ({
  emission: undefined,
  previous: undefined,
  fetching: false,
  lastInitialData: undefined,
});

export const beginFetch = <D>(state: ObserverState<D>): ObserverState<D> => ({ ...state, fetching: true });

const succession = <D>(state: ObserverState<D>, key: string): ObserverState<D>['previous'] => {
  const { emission, previous } = state;
  if (emission && emission.key !== key && emission.data !== undefined) {
    return { key: emission.key, data: emission.data };
  }
  return previous;
};

export const acceptResult = <D>(state: ObserverState<D>, emission: ObserverEmission<D>): ObserverState<D> => ({
  emission,
  previous: succession(state, emission.key),
  fetching: false,
  lastInitialData: state.lastInitialData,
});

export const acceptInitialData = <D>(state: ObserverState<D>, key: string, data: D): ObserverState<D> => {
  if (
    typeof process !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    typeof data === 'object' &&
    data !== null &&
    state.lastInitialData?.ref === data &&
    state.lastInitialData.key !== key
  ) {
    console.warn(
      '[mearie] the same initialData object was attributed to two different sets of variables. ' +
        'initialData must always correspond to the current variables; re-derive it when variables change.',
    );
  }

  return {
    ...acceptResult(state, { key, data, error: undefined, metadata: undefined }),
    lastInitialData: { ref: data, key },
  };
};

type ReduceOptions<D> = {
  applyPatches?: (data: D, patches: Patch[]) => D | undefined;
  mapData?: (data: unknown) => D;
};

export const reduceObserverResult = <D>(
  state: ObserverState<D>,
  key: string,
  result: OperationResult,
  opts?: ReduceOptions<D>,
): ObserverState<D> => {
  if (result.errors && result.errors.length > 0) {
    return acceptResult(state, {
      key,
      data: state.emission?.key === key ? state.emission.data : undefined,
      error: new AggregatedError(result.errors),
      metadata: result.metadata,
    });
  }

  const patches = result.metadata?.cache?.patches;
  if (patches && state.emission?.key === key && state.emission.data !== undefined && opts?.applyPatches) {
    const next = opts.applyPatches(state.emission.data, patches);
    return acceptResult(state, {
      key,
      data: next ?? state.emission.data,
      error: undefined,
      metadata: result.metadata,
    });
  }

  const data = opts?.mapData ? opts.mapData(result.data) : (result.data as D);
  return acceptResult(state, { key, data, error: undefined, metadata: result.metadata });
};

export const reduceFragmentResult = <D>(
  state: ObserverState<D>,
  key: string,
  result: OperationResult,
  opts?: ReduceOptions<D>,
): ObserverState<D> => {
  const patches = result.metadata?.cache?.patches;
  if (patches && state.emission?.key === key && state.emission.data !== undefined && opts?.applyPatches) {
    const next = opts.applyPatches(state.emission.data, patches);
    return acceptResult(state, {
      key,
      data: next ?? state.emission.data,
      error: undefined,
      metadata: result.metadata,
    });
  }

  if (result.data === undefined) {
    if (state.emission?.key === key) {
      return { ...state, emission: { ...state.emission, metadata: result.metadata } };
    }
    return state;
  }

  const data = opts?.mapData ? opts.mapData(result.data) : (result.data as D);
  return acceptResult(state, { key, data, error: undefined, metadata: result.metadata });
};

export const deriveObserverView = <D>(state: ObserverState<D>, currentKey: string, skip: boolean): ObserverView<D> => {
  const { emission, previous, fetching } = state;

  if (emission?.key === currentKey) {
    return {
      data: emission.data,
      previousData: previous?.data,
      loading: !skip && fetching,
      error: emission.error,
      metadata: emission.metadata,
    };
  }

  return {
    data: undefined,
    previousData: emission?.data ?? previous?.data,
    loading: !skip,
    error: undefined,
    metadata: undefined,
  };
};
