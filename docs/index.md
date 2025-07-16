---
layout: home

title: Mearie - The GraphQL client that feels like magic
titleTemplate: ':title'

head:
  - [
      'meta',
      {
        property: 'og:description',
        content: 'Zero-boilerplate GraphQL client with complete type safety and zero runtime overhead. Supports React, Vue, Svelte, and Solid with automatic code generation and intelligent caching.',
      },
    ]

hero:
  name: Mearie
  text: The GraphQL client that feels like magic
  tagline: Hassle-free GraphQL client for modern frameworks
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/devunt/mearie

features:
  - icon: ✨
    title: Zero Boilerplate
    details: Write GraphQL queries as template literals and get instant code generation. No manual type definitions, no code generation scripts, no config needed.

  - icon: 🎯
    title: Complete Type Safety
    details: End-to-end type safety from GraphQL schema to UI components. Catch errors at compile time, not in production.

  - icon: 🌏
    title: Universal Framework Support
    details: First-class support for React, Vue, Svelte, and Solid. Use the same GraphQL client across all your projects.

  - icon: ⚡
    title: Zero Runtime Overhead
    details: GraphQL parsing and analysis happen at build time. Zero parsing cost, zero runtime analysis—just pure execution speed.

  - icon: ⚛️
    title: Fine-Grained Reactivity
    details: Only components reading changed fields re-render. Fragment-level subscriptions prevent unnecessary updates across your component tree.

  - icon: 🧩
    title: Fragment Colocation
    details: Define data requirements right next to the components that use them. Natural prop drilling with automatic fragment spreading.

  - icon: 💾
    title: Effortless Caching
    details: Entity-based cache normalization works out of the box. Updates to any entity instantly reflect everywhere it's used.

  - icon: 📈
    title: Progressive Enhancement
    details: Start with simple queries, add caching when you need it. One line of configuration unlocks advanced features without touching your components.

  - icon: 🔗
    title: Composable Links
    details: Customize your GraphQL stack with intuitive middleware pattern. Built-in dedup, retry, auth, and cache links compose seamlessly.
---
