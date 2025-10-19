# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Guidelines

- When adding memories to this file, always use English language.

## Project Overview

Mearie is a type-safe GraphQL client library with zero runtime overhead. The project uses:
- Monorepo structure managed by pnpm workspaces and Turborepo
- TypeScript for all JavaScript/TypeScript packages
- Rust for native performance-critical operations (GraphQL parsing and code generation)
- Build tool: tsdown for TypeScript packages, cargo for Rust crates
- Testing: vitest for TypeScript, cargo test for Rust

## Common Development Commands

### Building
- `pnpm build` - Build all packages except docs and examples
- `pnpm build:docs` - Build documentation only
- `pnpm dev` - Run development mode with watch

### Testing
- `pnpm test` - Run all tests
- `pnpm test:watch` - Run tests in watch mode
- For specific package: `cd packages/<name> && pnpm test`
- For native Rust code: `cd crates/native && cargo test`

### Code Quality
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm format` - Check code formatting with Prettier
- `pnpm format:fix` - Fix formatting issues
- `pnpm typecheck` - Run TypeScript type checking

### Release Management
- `pnpm changeset` - Create a changeset for version bumping
- `pnpm changeset:version` - Update package versions based on changesets
- `pnpm changeset:publish` - Publish packages to npm

## Architecture

### Package Structure

The monorepo is organized as follows:

- **packages/core** - Core GraphQL client implementation including:
  - Link system (composable middleware)
  - Normalized cache implementation
  - Built-in links: httpLink, cacheLink, authLink, retryLink, dedupLink
  - Error handling, logging, and utilities

- **packages/client** - Minimal re-export of the `graphql` template tag from core

- **packages/codegen** - TypeScript code generation from GraphQL operations:
  - Extracts GraphQL queries from source code
  - Generates TypeScript types for operations
  - Uses native Rust parser for performance

- **packages/extractor** - Extracts GraphQL queries from various file formats:
  - TypeScript/JavaScript (using Rust parser via @mearie/native)
  - Vue SFC
  - Svelte components

- **packages/config** - Configuration schema and utilities

- **packages/vite** - Vite plugin for automatic code generation during build

- **packages/mearie** - Main entry point package that re-exports core, client, and config

- **Framework bindings**:
  - **packages/react** - React hooks (useQuery, useMutation, etc.)
  - **packages/vue** - Vue composables
  - **packages/solid** - Solid primitives
  - **packages/svelte** - Svelte stores

- **crates/native** - Rust implementation for:
  - GraphQL query parsing and extraction from TypeScript/JavaScript
  - High-performance operations using N-API bindings
  - Published as @mearie/native npm package (multi-platform binaries)

### Build System

- **Turborepo** orchestrates builds across packages with dependency graph awareness
- **tsdown** builds TypeScript packages with dual CommonJS/ESM output
- Packages use workspace protocol (`workspace:*`) for internal dependencies
- Build outputs go to `dist/` directories, excluded from docs and examples
- Native package uses cargo-based build with NAPI bindings

### Type System

- All GraphQL operations get type-safe TypeScript definitions via codegen
- Uses template literal type `graphql()` for compile-time type safety
- Fragment colocation pattern supported
- Generated types include: `VariablesOf<T>`, `DataOf<T>`, `FragmentRef<T>`

## Code Guidelines

- Write code in a way that is easy to understand and maintain.
- Always use .ts extension when importing TypeScript files.
- If a function is public but intended only for internal library use, always add the `@internal` JSDoc tag.
- Except for JSDoc, do not add comments to the code.
- Use pnpm as the package manager.

## Documentation Guidelines

- All JSDoc comments must be written in clear, readable English.

## Git Guidelines

- Follow the Conventional Commits specification for all commit messages.
- Commit message format: `<type>(<scope>): <description>`
  - Common types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `ci`, `build`, `perf`
  - Scope is optional but recommended (e.g., `release`, `deps`, package name)
  - Example: `chore(release): version packages`
