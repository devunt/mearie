---
layout: home

title: Mearie - The Pragmatic GraphQL Client
description: A full-featured, framework-agnostic GraphQL client. Delivers end-to-end type safety, normalized caching, and fragment colocation with minimal configuration. Supports React, Vue, Svelte, Solid, and vanilla JavaScript.

titleTemplate: ':title'

hero:
  name: Mearie
  text: The Pragmatic GraphQL Client
  tagline: End-to-end type safety, normalized caching, and fragment colocation across any framework
  image:
    src: /logo.svg
    alt: Mearie Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: Why Mearie?
      link: /why
    - theme: alt
      text: View on GitHub
      link: https://github.com/devunt/mearie

features:
  - icon: 🎯
    title: End-to-End Type Safety
    details: Generated types flow from your GraphQL schema through to UI components, catching errors at compile time rather than in production.

  - icon: 🧩
    title: Fragment Colocation
    details: Data requirements live alongside the components that use them, reducing coupling and preventing over-fetching across your application.

  - icon: 🌏
    title: Framework-Agnostic
    details: Works seamlessly with React, Vue, Svelte, Solid, and vanilla JavaScript through dedicated integrations for each framework.

  - icon: ⚡
    title: Ahead-of-Time Compilation
    details: Operations are parsed and optimized during build, eliminating runtime parsing overhead for faster execution.

  - icon: ⚛️
    title: Fine-Grained Reactivity
    details: Updates propagate precisely to components consuming changed data, eliminating unnecessary re-renders through field-level subscriptions.

  - icon: 💾
    title: Normalized Caching
    details: Data stays consistent across your application as changes propagate automatically through the cache, eliminating manual synchronization.

  - icon: 📈
    title: Incremental Adoption
    details: Start quickly with sensible defaults, scale to complex setups as requirements grow. Add features progressively as your application evolves.

  - icon: ✨
    title: Minimal Configuration
    details: Works out of the box with minimal setup. Sensible defaults let you focus on building features rather than configuring tooling.

  - icon: 🔗
    title: Extensible Architecture
    details: Composable exchange system enables auth, retries, logging, and custom request handling through a flexible stream-based architecture.
---
