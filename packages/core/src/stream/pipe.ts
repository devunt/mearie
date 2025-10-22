import type { Source, Operator } from './types.ts';

/**
 * Pipes a source through a series of operators.
 * @param source - The source stream.
 * @returns The source itself.
 */
export function pipe<A>(source: Source<A>): Source<A>;

/**
 * @param source - The source stream.
 * @param op1 - The operator or sink.
 * @returns The result of the operator/sink.
 */
export function pipe<A, B>(source: Source<A>, op1: (source: Source<A>) => B): B;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C>(source: Source<A>, op1: Operator<A, B>, op2: (source: Source<B>) => C): C;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C, D>(
  source: Source<A>,
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: (source: Source<C>) => D,
): D;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C, D, E>(
  source: Source<A>,
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: (source: Source<D>) => E,
): E;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C, D, E, F>(
  source: Source<A>,
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: (source: Source<E>) => F,
): F;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @param op6 - The sixth operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C, D, E, F, G>(
  source: Source<A>,
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
  op6: (source: Source<F>) => G,
): G;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @param op6 - The sixth operator.
 * @param op7 - The seventh operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C, D, E, F, G, H>(
  source: Source<A>,
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
  op6: Operator<F, G>,
  op7: (source: Source<G>) => H,
): H;

/**
 * @param source - The source stream.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @param op6 - The sixth operator.
 * @param op7 - The seventh operator.
 * @param op8 - The eighth operator or sink.
 * @returns The result of the last operator/sink.
 */
export function pipe<A, B, C, D, E, F, G, H, I>(
  source: Source<A>,
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
  op6: Operator<F, G>,
  op7: Operator<G, H>,
  op8: (source: Source<H>) => I,
): I;

/**
 * @param source - The source stream.
 * @param operators - The operators to apply.
 * @returns The result of the last operator.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pipe(source: any, ...operators: ((input: any) => any)[]): any {
  // eslint-disable-next-line unicorn/no-array-reduce, @typescript-eslint/no-unsafe-return
  return operators.reduce((src, operator) => operator(src), source);
}
