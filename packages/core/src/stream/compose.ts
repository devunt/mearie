import type { Operator } from './types.ts';

/**
 * Composes a single operator.
 * @param op1 - The operator.
 * @returns The operator itself.
 */
export function compose<A, B>(op1: Operator<A, B>): Operator<A, B>;

/**
 * Composes two operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @returns A composed operator.
 */
export function compose<A, B, C>(op1: Operator<A, B>, op2: Operator<B, C>): Operator<A, C>;

/**
 * Composes three operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @returns A composed operator.
 */
export function compose<A, B, C, D>(op1: Operator<A, B>, op2: Operator<B, C>, op3: Operator<C, D>): Operator<A, D>;

/**
 * Composes four operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @returns A composed operator.
 */
export function compose<A, B, C, D, E>(
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
): Operator<A, E>;

/**
 * Composes five operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @returns A composed operator.
 */
export function compose<A, B, C, D, E, F>(
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
): Operator<A, F>;

/**
 * Composes six operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @param op6 - The sixth operator.
 * @returns A composed operator.
 */
export function compose<A, B, C, D, E, F, G>(
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
  op6: Operator<F, G>,
): Operator<A, G>;

/**
 * Composes seven operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @param op6 - The sixth operator.
 * @param op7 - The seventh operator.
 * @returns A composed operator.
 */
export function compose<A, B, C, D, E, F, G, H>(
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
  op6: Operator<F, G>,
  op7: Operator<G, H>,
): Operator<A, H>;

/**
 * Composes eight operators into one.
 * @param op1 - The first operator.
 * @param op2 - The second operator.
 * @param op3 - The third operator.
 * @param op4 - The fourth operator.
 * @param op5 - The fifth operator.
 * @param op6 - The sixth operator.
 * @param op7 - The seventh operator.
 * @param op8 - The eighth operator.
 * @returns A composed operator.
 */
export function compose<A, B, C, D, E, F, G, H, I>(
  op1: Operator<A, B>,
  op2: Operator<B, C>,
  op3: Operator<C, D>,
  op4: Operator<D, E>,
  op5: Operator<E, F>,
  op6: Operator<F, G>,
  op7: Operator<G, H>,
  op8: Operator<H, I>,
): Operator<A, I>;

/**
 * @param operators - The operators to compose.
 * @returns A composed operator.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compose(...operators: Operator<any, any>[]): Operator<any, any> {
  return (source) => {
    // eslint-disable-next-line unicorn/no-array-reduce
    return operators.reduce((src, operator) => operator(src), source);
  };
}
