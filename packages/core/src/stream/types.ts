/**
 * Talkback allows downstream to communicate with upstream.
 */
export type Talkback = {
  /**
   * Request the next value (backpressure control).
   */
  pull(): void;

  /**
   * Cancel the stream and clean up resources.
   */
  cancel(): void;
};

/**
 * Sink receives values from a Source.
 */
export type Sink<T> = {
  /**
   * Receive talkback for pull/cancel communication.
   * @param talkback - The talkback to communicate with upstream.
   */
  start(talkback: Talkback): void;

  /**
   * Receive a data value.
   * @param value - The data value.
   */
  next(value: T): void;

  /**
   * Receive an error and end the stream.
   * @param error - The error that occurred.
   */
  error(error: unknown): void;

  /**
   * Receive completion signal.
   */
  complete(): void;
};

/**
 * Source is a function that accepts a Sink.
 * When called, it starts pushing values to the sink.
 */
export type Source<T> = (sink: Sink<T>) => void;

/**
 * Operator transforms one Source into another.
 */
export type Operator<T, R = T> = (source: Source<T>) => Source<R>;
