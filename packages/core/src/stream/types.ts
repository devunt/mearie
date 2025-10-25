/**
 * Subscription allows cancelling a stream and cleaning up resources.
 */
export type Subscription = {
  /**
   * Cancel the stream and clean up resources.
   */
  unsubscribe(): void;
};

/**
 * Sink receives values from a Source.
 */
export type Sink<T> = {
  /**
   * Receive a data value.
   * @param value - The data value.
   */
  next(value: T): void;

  /**
   * Receive completion signal.
   */
  complete(): void;
};

/**
 * Source is a function that accepts a Sink and returns a Subscription.
 * When called, it starts pushing values to the sink.
 * @returns A subscription that can be used to cancel the stream.
 */
export type Source<T> = (sink: Sink<T>) => Subscription;

/**
 * Operator transforms one Source into another.
 */
export type Operator<T, R = T> = (source: Source<T>) => Source<R>;
