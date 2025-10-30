import type { Exchange } from '../exchange.ts';
import { parse, serialize } from '../scalars.ts';
import { pipe } from '../stream/pipe.ts';
import { map } from '../stream/operators/map.ts';

export const scalarExchange = (): Exchange => {
  return ({ forward, client }) => {
    return (ops$) => {
      return pipe(
        ops$,
        map((op) => {
          if (op.variant !== 'request' || !op.artifact.variableDefs || !client.scalars) {
            return op;
          }

          return {
            ...op,
            variables: serialize(client.schema, op.artifact.variableDefs, client.scalars, op.variables),
          };
        }),
        forward,
        map((result) => {
          if (result.operation.variant !== 'request' || !result.data || !client.scalars) {
            return result;
          }

          return {
            ...result,
            data: parse(result.operation.artifact.selections, client.scalars, result.data),
          };
        }),
      );
    };
  };
};
