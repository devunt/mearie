# @mearie/native

## 0.1.0-next.4

### Minor Changes

- e15914c: Refactor Selection types to align with GraphQL AST structure, eliminating fragment flattening and enabling proper fragment colocation support
- e31848b: Completely rewrote the entire codebase
- e774b55: Implement fragment colocation type system with new Artifact-based architecture supporting FragmentRefs for type-safe fragment composition

### Patch Changes

- f858e35: Add DocumentNode runtime generation with string-based lookup. The codegen now generates JavaScript DocumentNode objects with a documentMap for O(1) runtime lookup using source strings as keys.

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
