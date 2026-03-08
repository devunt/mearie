# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build all publishable packages
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run a single test file
pnpm vitest run packages/core/src/cache/patch.test.ts

# Type checking
pnpm typecheck

# Lint & format
pnpm lint          # ESLint
pnpm lint:fix
pnpm format        # Prettier check
pnpm format:fix
pnpm spellcheck    # cSpell

# Rust (crates/native)
cargo test
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
```

## Architecture

Mearie is a type-safe GraphQL client with ahead-of-time compilation. The monorepo (pnpm workspaces + Turbo) has two layers:

**Build-time** — The `mearie` package bundles CLI, codegen, config, and a Vite plugin. Codegen parses GraphQL operations via a Rust native module (`crates/native` using NAPI) and generates typed `Artifact` objects and `SchemaMeta` for the runtime.

**Runtime** — `@mearie/core` provides the client engine; framework packages (`@mearie/react`, `@mearie/vue`, `@mearie/svelte`, `@mearie/solid`) expose hooks (`useQuery`, `useMutation`, `useSubscription`, `useFragment`).

### Core concepts

- **Stream system** (`packages/core/src/stream/`) — A pull-based reactive stream library (sources, operators, sinks) derived from Wonka. All data flow goes through `pipe()` and stream composition.
- **Exchange pipeline** (`packages/core/src/exchange.ts`) — Middleware chain: `Exchange = (ExchangeInput) => ExchangeResult`. Each exchange receives a `Source<Operation>` and returns a `Source<OperationResult>`. The client auto-wraps user exchanges with `requiredExchange`, `scalarExchange` (before) and `fragmentExchange`, `terminalExchange` (after).
- **Normalized cache** (`packages/core/src/cache/`) — Entity-based storage keyed by `typename:id`. Tracks field-level dependencies via `DependencyKey`. Supports cursors for granular subscription updates, patch-based notifications (`set`, `splice`, `swap`), optimistic mutations with CoW rollback, and `extract`/`hydrate` for SSR.
- **Artifact** (`@mearie/shared`) — The unit of a compiled GraphQL operation. Contains `kind`, `name`, `body`, `selections`, and phantom types `' $data'` / `' $variables'` for type inference.
- **SchemaMeta** — Generated schema metadata with entity key fields, input definitions, and custom scalar mappings. Drives both cache normalization and type-level inference.

### Rust native module (`crates/native`)

GraphQL parsing, validation, AST transformation (directive processing, fragment argument inlining), and TypeScript code generation. Exposed to JS via NAPI FFI (`src/ffi/napi.rs`). Arena-allocated AST for performance.

## Conventions

- **TypeScript**: strict mode, `erasableSyntaxOnly`, `verbatimModuleSyntax`. Use `.ts` extensions in relative imports.
- **Build**: tsdown for all packages. Dual ESM/CJS output. Development uses source `exports` (e.g., `"./src/index.ts"`); `publishConfig` overrides for dist.
- **Tests**: Vitest. Test files are colocated as `*.test.ts` next to source files. Test projects: core, react, vue, solid, svelte.
- **Commits**: `type(scope): description` format. Types: `fix`, `feat`, `refactor`, `test`, `chore`, `ci`, `revert`. Scope is the package or subsystem name — e.g., `cache`, `core`, `react`, `native`, `dedup`, `ci`. Multiple scopes comma-separated: `feat(cache,codegen): ...`. Description is lowercase, imperative, concise.
- **Changesets**: Required for changes to published packages (`@mearie/*`, `mearie`). Internal packages (`@mearie-internal/*`) are ignored. Write changeset summaries that explain _what changed and why_, not just repeat the commit message. Include the affected behavior and the root cause for fixes.
- **PRs**: One feature/fix per PR. Title matches the commit convention. Body is plain text (no markdown headings), written in English — explain the problem, what caused it, and what the fix does. Keep it concise and technical.
