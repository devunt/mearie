/**
 * Vite plugin for Mearie GraphQL code generation.
 *
 * This plugin extracts GraphQL operations from your source files and
 * generates TypeScript types and runtime code using `@mearie/native`.
 */

export { mearie } from './plugin.ts';
export type { MearieOptions } from './types.ts';
