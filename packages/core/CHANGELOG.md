# @mearie/core

## 0.1.0-next.4

### Minor Changes

- e15914c: Refactor Selection types to align with GraphQL AST structure, eliminating fragment flattening and enabling proper fragment colocation support
- 522e845: Refactor cache implementation with improved normalization and denormalization logic. Split monolithic cache tests into separate test files for normalize, denormalize, and utils modules.
- 8954d0c: Add complete stream system implementation with operators, sinks, and sources
- e774b55: Implement fragment colocation type system with new Artifact-based architecture supporting FragmentRefs for type-safe fragment composition
- 05cdd4a: Implements stream-based exchanges
- 3610f5c: Remove error handling from stream system to simplify implementation
- a739cd0: Consolidate extractor package into shared package and move internal utilities to codegen
- 462d3ae: Add peek sink for synchronous value extraction from streams

### Patch Changes

- f15b16e: Fix share operator to correctly handle synchronous source execution with deferred value delivery
- 7a89989: Fix stream sharing issues in exchanges to prevent duplicate subscriptions and improve cache policy handling
- f95754e: Optimize field key generation by checking for empty args before stringifying
- 2ce6774: Implement a subscriptionExchange that accept `graphql-ws` or `graphql-sse` compatible client.
- Updated dependencies [e15914c]
- Updated dependencies [a739cd0]
  - @mearie/shared@0.1.0-next.4

## 0.0.1-next.3

### Patch Changes

- 45b907b: Fix native package publish pipeline

## 0.0.1-next.2

### Patch Changes

- 80fdb0c: Fix release pipeline

## 0.0.1-next.1

### Patch Changes

- 7dd09dd: chore(release): version packages

## 0.0.1-next.0

### Patch Changes

- 0aa1561: chore(release): version packages
