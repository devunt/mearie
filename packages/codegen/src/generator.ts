import { generateCode } from '@mearie/native';
import { MearieError } from './errors.ts';
import type { Source } from './types.ts';

export type GenerateOptions = {
  schemas: Source[];
  documents: Source[];
};

type GenerateResult = {
  sources: Source[];
  errors: MearieError[];
};

/**
 * Generates code from GraphQL documents and schemas.
 * @param options - Generation options.
 * @returns Generated code.
 * @throws {Error} If code generation fails.
 */
export const generate = (options: GenerateOptions): GenerateResult => {
  const { schemas, documents } = options;

  const { sources, errors } = generateCode(schemas, documents);

  return { sources, errors: errors.map((error) => MearieError.fromNative(error)) };
};
