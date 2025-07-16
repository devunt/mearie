/**
 * Error thrown when `@vue/compiler-sfc` is not installed.
 */
export class MissingVueCompilerError extends Error {
  constructor() {
    super(`
GraphQL operations cannot be extracted from Vue files without @vue/compiler-sfc.

Install it with:
  npm install @vue/compiler-sfc
  # or
  pnpm add @vue/compiler-sfc
  # or
  yarn add @vue/compiler-sfc
`);
    this.name = 'MissingVueCompilerError';
  }
}

/**
 * Error thrown when svelte compiler is not installed.
 */
export class MissingSvelteCompilerError extends Error {
  constructor() {
    super(`
GraphQL operations cannot be extracted from Svelte files without svelte.

Install it with:
  npm install svelte
  # or
  pnpm add svelte
  # or
  yarn add svelte
`);
    this.name = 'MissingSvelteCompilerError';
  }
}

/**
 * Error thrown when TypeScript is not installed.
 */
export class MissingTypeScriptError extends Error {
  constructor() {
    super(`
GraphQL operations cannot be extracted from Vue files without typescript.

Install it with:
  npm install typescript
  # or
  pnpm add typescript
  # or
  yarn add typescript
`);
    this.name = 'MissingTypeScriptError';
  }
}

/**
 * Error thrown when template literal interpolation is found in GraphQL.
 */
export class InterpolationNotAllowedError extends Error {
  constructor(filePath: string, line: number) {
    super(`Template literal at line ${line} in ${filePath} contains interpolation which is not allowed in GraphQL`);
    this.name = 'InterpolationNotAllowedError';
  }
}

/**
 * Error thrown when JavaScript/TypeScript file parsing fails.
 */
export class JavaScriptParseError extends Error {
  constructor(filePath: string, message: string) {
    super(`Failed to parse JavaScript/TypeScript file ${filePath}: ${message}`);
    this.name = 'JavaScriptParseError';
  }
}
