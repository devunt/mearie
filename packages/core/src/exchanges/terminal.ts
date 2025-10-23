import type { Exchange } from '../exchange.ts';
import { ExchangeError } from '../errors.ts';
import { pipe } from '../stream/pipe.ts';
import { mergeMap } from '../stream/operators/merge-map.ts';
import { fromValue } from '../stream/sources/from-value.ts';
import { filter } from '../stream/operators/filter.ts';

export const terminalExchange = (): Exchange => {
  return () => {
    return (ops$) => {
      return pipe(
        ops$,
        filter((op) => op.variant !== 'teardown'),
        mergeMap((op) =>
          fromValue({
            operation: op,
            errors: [
              new ExchangeError(
                'No terminal exchange found in exchange chain. Did you forget to add httpExchange to your exchanges array?',
                {
                  exchangeName: 'terminal',
                },
              ),
            ],
          }),
        ),
      );
    };
  };
};
