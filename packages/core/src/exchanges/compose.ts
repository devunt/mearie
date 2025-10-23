import type { Exchange, ExchangeIO } from '../exchange.ts';
import { pipe } from '../stream/pipe.ts';
import { share } from '../stream/operators/share.ts';

export type ComposeExchangeOptions = {
  exchanges: Exchange[];
};

export const composeExchange = (options: ComposeExchangeOptions): Exchange => {
  const { exchanges } = options;

  return (forward) => {
    // eslint-disable-next-line unicorn/no-array-reduce
    return exchanges.reduceRight<ExchangeIO>((forward, exchange) => {
      return (ops$) => {
        return pipe(ops$, share(), exchange(forward), share());
      };
    }, forward);
  };
};
