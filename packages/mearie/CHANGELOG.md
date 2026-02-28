# mearie

## 0.1.6

### Patch Changes

- Updated dependencies [cacc553]
  - @mearie/shared@0.4.0
  - @mearie/cli@0.1.6
  - @mearie/vite@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [c5af823]
  - @mearie/shared@0.3.0
  - @mearie/cli@0.1.5
  - @mearie/vite@0.1.5

## 0.1.4

### Patch Changes

- 1b248b5: Add snapshot release support
- Updated dependencies [1b248b5]
  - @mearie/cli@0.1.4
  - @mearie/config@0.1.2
  - @mearie/shared@0.2.2
  - @mearie/vite@0.1.4

## 0.1.3

### Patch Changes

- f391689: fix: correct publishConfig exports to match tsdown output extensions

  `tsdown` outputs `.mjs`/`.cjs` files with `.d.mts`/`.d.cts` type declarations,
  but `publishConfig.exports` was referencing `.js`/`.d.ts` files that do not exist.
  TypeScript with `moduleResolution: bundler` follows the `exports` field directly,
  so it failed to resolve types for all published packages.

  Updated all `publishConfig.exports` to use nested `import`/`require` conditions
  with the correct `.mjs`/`.d.mts` and `.cjs`/`.d.cts` extensions respectively.

- Updated dependencies [f391689]
  - @mearie/cli@0.1.3
  - @mearie/config@0.1.1
  - @mearie/shared@0.2.1
  - @mearie/vite@0.1.3

## 0.1.2

### Patch Changes

- @mearie/cli@0.1.2
- @mearie/vite@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [7a7f7d6]
- Updated dependencies [ccfabf9]
  - @mearie/shared@0.2.0
  - @mearie/cli@0.1.1
  - @mearie/vite@0.1.1

## 0.1.0

### Minor Changes

- cf2f4e0: Version packages

### Patch Changes

- Updated dependencies [cf2f4e0]
  - @mearie/cli@0.1.0
  - @mearie/config@0.1.0
  - @mearie/shared@0.1.0
  - @mearie/vite@0.1.0
