/**
 *
 */
export class GraphQLError extends Error {
  readonly path?: readonly (string | number)[];
  readonly locations?: readonly { line: number; column: number }[];
  readonly extensions?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      path?: readonly (string | number)[];
      locations?: readonly { line: number; column: number }[];
      extensions?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'GraphQLError';
    this.path = options?.path;
    this.locations = options?.locations;
    this.extensions = options?.extensions;

    Object.setPrototypeOf(this, GraphQLError.prototype);
  }

  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      message: this.message,
    };

    if (this.path) {
      json.path = this.path;
    }

    if (this.locations) {
      json.locations = this.locations;
    }

    if (this.extensions) {
      json.extensions = this.extensions;
    }

    return json;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExchangeErrorExtensionsMap {}

export type OperationError = GraphQLError | ExchangeError<string>;

/**
 *
 */
export class ExchangeError<
  const TName extends keyof ExchangeErrorExtensionsMap | (string & {}) = string,
> extends Error {
  readonly exchangeName: TName;
  readonly extensions: TName extends keyof ExchangeErrorExtensionsMap
    ? ExchangeErrorExtensionsMap[TName]
    : Record<string, unknown> | undefined;

  constructor(
    message: string,
    options: {
      exchangeName: TName;
      cause?: unknown;
    } & (TName extends keyof ExchangeErrorExtensionsMap
      ? undefined extends ExchangeErrorExtensionsMap[TName]
        ? { extensions?: Exclude<ExchangeErrorExtensionsMap[TName], undefined> }
        : { extensions: ExchangeErrorExtensionsMap[TName] }
      : { extensions?: Record<string, unknown> }),
  ) {
    super(message, { cause: options.cause });
    this.name = 'ExchangeError';
    this.exchangeName = options.exchangeName;
    this.extensions = options.extensions as TName extends keyof ExchangeErrorExtensionsMap
      ? ExchangeErrorExtensionsMap[TName]
      : Record<string, unknown> | undefined;

    Object.setPrototypeOf(this, ExchangeError.prototype);
  }

  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      message: this.message,
      exchangeName: this.exchangeName,
    };

    if (this.extensions !== undefined) {
      json.extensions = this.extensions;
    }

    return json;
  }
}

/**
 *
 */
export class AggregatedError extends AggregateError {
  declare readonly errors: OperationError[];

  constructor(
    errors: readonly OperationError[],
    message = `${errors.length} error(s) occurred`,
  ) {
    super([...errors], message);
    this.name = 'AggregatedError';

    Object.setPrototypeOf(this, AggregatedError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      message: this.message,
      errors: this.errors.map((error) => error.toJSON()),
    };
  }
}

export const isGraphQLError = (error: unknown): error is GraphQLError => {
  return error instanceof GraphQLError;
};

export function isExchangeError(error: unknown): error is ExchangeError<string>;
export function isExchangeError<const TName extends keyof ExchangeErrorExtensionsMap | (string & {})>(
  error: unknown,
  exchangeName: TName,
): error is ExchangeError<TName>;
export function isExchangeError<const TName extends keyof ExchangeErrorExtensionsMap | (string & {})>(
  error: unknown,
  exchangeName?: TName,
): error is ExchangeError<string> | ExchangeError<TName> {
  if (!(error instanceof ExchangeError)) {
    return false;
  }
  if (exchangeName !== undefined) {
    return error.exchangeName === exchangeName;
  }
  return true;
}

export const isAggregatedError = (error: unknown): error is AggregatedError => {
  return error instanceof AggregatedError;
};
