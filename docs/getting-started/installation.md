---
description: Install Mearie and your framework integration for React, Vue, Svelte, or Solid using npm, yarn, pnpm, bun, or deno.
---

# Installation

Install Mearie and your framework integration.

::: warning Early Development
Mearie is in its very early stage and under very active development. Things may not work as expected or described in the documentation. Please expect frequent breaking changes.
:::

## Install Packages

Mearie consists of two packages:

- `mearie` - Build tools and codegen (dev dependency)
- `@mearie/{framework}` - Framework-specific bindings (includes client and runtime)

Install the build tools as dev dependency and your framework integration:

::: code-group

```sh [npm]
# React
npm install -D mearie
npm install @mearie/react

# Vue
npm install -D mearie
npm install @mearie/vue

# Svelte
npm install -D mearie
npm install @mearie/svelte

# Solid
npm install -D mearie
npm install @mearie/solid
```

```sh [yarn]
# React
yarn add -D mearie
yarn add @mearie/react

# Vue
yarn add -D mearie
yarn add @mearie/vue

# Svelte
yarn add -D mearie
yarn add @mearie/svelte

# Solid
yarn add -D mearie
yarn add @mearie/solid
```

```sh [pnpm]
# React
pnpm add -D mearie
pnpm add @mearie/react

# Vue
pnpm add -D mearie
pnpm add @mearie/vue

# Svelte
pnpm add -D mearie
pnpm add @mearie/svelte

# Solid
pnpm add -D mearie
pnpm add @mearie/solid
```

```sh [bun]
# React
bun add -D mearie
bun add @mearie/react

# Vue
bun add -D mearie
bun add @mearie/vue

# Svelte
bun add -D mearie
bun add @mearie/svelte

# Solid
bun add -D mearie
bun add @mearie/solid
```

```sh [deno]
# React
deno add --dev npm:mearie
deno add npm:@mearie/react

# Vue
deno add --dev npm:mearie
deno add npm:@mearie/vue

# Svelte
deno add --dev npm:mearie
deno add npm:@mearie/svelte

# Solid
deno add --dev npm:mearie
deno add npm:@mearie/solid
```

:::

## Next Steps

- [Setup](/getting-started/setup) - Configure Mearie and create a client
- [Your First Query](/getting-started/your-first-query) - Write your first GraphQL query
