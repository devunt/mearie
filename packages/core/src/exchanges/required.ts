import type { Exchange } from '../exchange.ts';
import { ExchangeError } from '../errors.ts';
import { validateRequired } from '../required.ts';
import { pipe } from '../stream/pipe.ts';
import { map } from '../stream/operators/map.ts';

export const requiredExchange = (): Exchange => {
  return ({ forward }) => ({
    name: 'required',
    io: (ops$) => {
      return pipe(
        ops$,
        forward,
        map((result) => {
          if (result.operation.variant !== 'request' || !result.data) {
            return result;
          }

          try {
            return {
              ...result,
              data: validateRequired(result.operation.artifact.selections, result.data),
            };
          } catch (error) {
            return {
              ...result,
              errors: [
                new ExchangeError(error instanceof Error ? error.message : String(error), {
                  exchangeName: 'required',
                }),
              ],
            };
          }
        }),
      );
    },
  });
};
