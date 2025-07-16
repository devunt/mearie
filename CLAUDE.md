# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Guidelines

- When adding memories to this file, always use English language.

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
