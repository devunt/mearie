import type { Exchange, ExchangeIO, ExchangeInput } from './exchange.ts';
import { pipe } from './stream/pipe.ts';
import { share } from './stream/operators/share.ts';

export type ComposeExchangesOptions = {
  exchanges: Exchange[];
};

export type ComposeExchangesResult = {
  io: ExchangeIO;
  extensions: Map<string, unknown>;
};

/** @internal */
export const composeExchanges = (options: ComposeExchangesOptions, input: ExchangeInput): ComposeExchangesResult => {
  const { exchanges } = options;
  const { client } = input;
  const extensions = new Map<string, unknown>();

  // eslint-disable-next-line unicorn/no-array-reduce
  const io = exchanges.reduceRight<ExchangeIO>((forward, exchange) => {
    const result = exchange({ forward, client });

    if ('extension' in result) {
      extensions.set(result.name, (result as { extension: unknown }).extension);
    }

    return (ops$) => {
      return pipe(ops$, share(), result.io, share());
    };
  }, input.forward);

  return { io, extensions };
};
