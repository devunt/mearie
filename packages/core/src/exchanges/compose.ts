import type { Exchange, ExchangeIO } from '../exchange.ts';

export type ComposeExchangeOptions = {
  exchanges: Exchange[];
};

export const composeExchange = (options: ComposeExchangeOptions): Exchange => {
  const { exchanges } = options;

  return (forward) => {
    // eslint-disable-next-line unicorn/no-array-reduce
    return exchanges.reduceRight<ExchangeIO>((forward, exchange) => exchange(forward), forward);
  };
};
