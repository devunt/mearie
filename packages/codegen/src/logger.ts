import { configureSync, getAnsiColorFormatter, getConsoleSink, getLogger, type Logger } from '@logtape/logtape';
import pc from 'picocolors';
import { MearieAggregateError, MearieError } from './errors.ts';

configureSync({
  reset: true,
  sinks: {
    console: getConsoleSink({
      formatter: getAnsiColorFormatter({
        level: 'FULL',
        timestamp: 'time',
        category: (category) => `💬 ${category.join('·')}`,
      }),
    }),
  },
  loggers: [
    { category: 'mearie', lowestLevel: 'info', sinks: ['console'] },
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
  ],
});

export const logger = getLogger(['mearie']);

const formatMearieError = (error: MearieError): string => {
  const parts = [error.filePath, error.line, error.column]
    .filter((part) => part !== undefined && part !== null)
    .map(String);

  const location = parts.length > 0 ? parts.join(':') : '';

  if (location) {
    return `${pc.bold(error.message)} ${pc.cyan(pc.underline(location))}`;
  }
  return pc.bold(error.message);
};

/**
 * Reports an error using the provided logger.
 * @param logger - The logger to use.
 * @param error - The error to report.
 */
export const report = (logger: Logger, error: unknown): void => {
  if (error instanceof MearieAggregateError) {
    for (const err of error.errors) {
      logger.error(formatMearieError(err));
    }
  } else if (error instanceof MearieError) {
    logger.error(formatMearieError(error));
  } else {
    logger.error('{error}', { error });
  }
};
