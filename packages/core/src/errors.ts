type NativeLocation = {
  file_path: string;
  line: number;
  column: number;
};

type NativeError = {
  message: string;
  type: string;
  location?: NativeLocation;
  [key: string]: unknown;
};

/**
 * Custom error class for Mearie-specific errors.
 */
export class MearieError extends Error {
  readonly filePath?: string;
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, filePath?: string, line?: number, column?: number) {
    super(message);
    this.name = 'MearieError';
    this.filePath = filePath;
    this.line = line;
    this.column = column;
  }

  static fromNative(data: unknown): MearieError {
    if (!data || typeof data !== 'object') {
      throw new TypeError('Invalid native error data');
    }

    const error = data as NativeError;
    const filePath = error.location?.file_path;
    const line = error.location?.line;
    const column = error.location?.column;

    return new MearieError(error.message, filePath, line, column);
  }
}

/**
 * Aggregate error for multiple Mearie errors.
 */
export class MearieAggregateError extends Error {
  readonly errors: MearieError[];

  constructor(errors: MearieError[], message?: string) {
    super(message ?? `${errors.length} error${errors.length > 1 ? 's' : ''} occurred`);
    this.name = 'MearieAggregateError';
    this.errors = errors;
  }
}
