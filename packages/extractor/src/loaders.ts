import { MissingSvelteCompilerError, MissingTypeScriptError, MissingVueCompilerError } from './errors.ts';

/**
 * Loads the Vue compiler dynamically.
 * @returns The Vue compiler module.
 * @throws {MissingVueCompilerError} If `@vue/compiler-sfc` is not installed.
 */
export const loadVueCompiler = async () => {
  try {
    return await import('@vue/compiler-sfc');
  } catch {
    throw new MissingVueCompilerError();
  }
};

/**
 * Loads TypeScript dynamically.
 * @returns The TypeScript module.
 * @throws {MissingTypeScriptError} If typescript is not installed.
 */
export const loadTypeScript = async () => {
  try {
    return await import('typescript');
  } catch {
    throw new MissingTypeScriptError();
  }
};

/**
 * Loads the Svelte compiler dynamically.
 * @returns The Svelte compiler module.
 * @throws {MissingSvelteCompilerError} If svelte is not installed.
 */
export const loadSvelteCompiler = async () => {
  try {
    return await import('svelte/compiler');
  } catch {
    throw new MissingSvelteCompilerError();
  }
};
