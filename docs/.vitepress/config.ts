import { defineConfig } from 'vitepress';
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs';
import mearie from 'mearie/vite';
import { ModuleResolutionKind } from 'typescript';

export default defineConfig({
  title: 'Mearie',
  description: 'The GraphQL client that feels like magic',

  lang: 'en-US',
  titleTemplate: ':title - Mearie',

  cleanUrls: true,
  lastUpdated: true,

  srcExclude: ['**/README.md'],

  sitemap: {
    hostname: 'https://mearie.dev',
  },

  markdown: {
    config(md) {
      md.use(groupIconMdPlugin);
    },
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache(),
        twoslashOptions: {
          compilerOptions: {
            jsx: 5,
            jsxImportSource: 'react',
            moduleResolution: ModuleResolutionKind.Bundler,
            types: ['../.mearie/graphql.d.ts'],
          },
        },
      }),
    ],
  },

  vite: {
    plugins: [groupIconVitePlugin(), mearie()],
  },

  themeConfig: {
    // logo: '/logo.svg',

    nav: [
      { text: 'Why Mearie?', link: '/why-mearie' },
      {
        text: 'Guides',
        items: [
          { text: 'Getting Started', link: '/getting-started/installation' },
          { text: 'Queries', link: '/guides/queries' },
          { text: 'Mutations', link: '/guides/mutations' },
          { text: 'Fragments', link: '/guides/fragments' },
          { text: 'Subscriptions', link: '/guides/subscriptions' },
          { text: 'Exchanges', link: '/guides/exchanges' },
          { text: 'Scalars', link: '/guides/scalars' },
          { text: 'Directives', link: '/guides/directives' },
        ],
      },
      {
        text: 'Frameworks',
        items: [
          { text: 'React', link: '/frameworks/react' },
          { text: 'Vue', link: '/frameworks/vue' },
          { text: 'Svelte', link: '/frameworks/svelte' },
          { text: 'Solid', link: '/frameworks/solid' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        collapsed: true,
        items: [
          { text: 'Why Mearie?', link: '/why-mearie' },
          { text: 'Changelog', link: '/changelog' },
        ],
      },
      {
        text: 'Getting Started',
        collapsed: true,
        items: [
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Setup', link: '/getting-started/setup' },
          { text: 'Your First Query', link: '/getting-started/your-first-query' },
          { text: 'Using Fragments', link: '/getting-started/using-fragments' },
        ],
      },
      {
        text: 'Concepts',
        collapsed: true,
        items: [
          { text: 'Streams', link: '/concepts/streams' },
        ],
      },
      {
        text: 'Guides',
        collapsed: true,
        items: [
          { text: 'Queries', link: '/guides/queries' },
          { text: 'Mutations', link: '/guides/mutations' },
          { text: 'Fragments', link: '/guides/fragments' },
          { text: 'Subscriptions', link: '/guides/subscriptions' },
          { text: 'Exchanges', link: '/guides/exchanges' },
          { text: 'Scalars', link: '/guides/scalars' },
          { text: 'Directives', link: '/guides/directives' },
        ],
      },
      {
        text: 'Exchanges',
        collapsed: true,
        items: [
          { text: 'HTTP', link: '/exchanges/http' },
          { text: 'Cache', link: '/exchanges/cache' },
          { text: 'Retry', link: '/exchanges/retry' },
          { text: 'Deduplication', link: '/exchanges/dedup' },
          { text: 'Subscription', link: '/exchanges/subscription' },
          { text: 'Custom Exchanges', link: '/exchanges/custom' },
        ],
      },
      {
        text: 'Directives',
        collapsed: true,
        items: [{ text: '@required', link: '/directives/required' }],
      },
      {
        text: 'Frameworks',
        collapsed: true,
        items: [
          { text: 'React', link: '/frameworks/react' },
          { text: 'Vue', link: '/frameworks/vue' },
          { text: 'Svelte', link: '/frameworks/svelte' },
          { text: 'Solid', link: '/frameworks/solid' },
        ],
      },
      {
        text: 'Config',
        collapsed: true,
        items: [
          { text: 'Codegen', link: '/config/codegen' },
          { text: 'Client', link: '/config/client' },
        ],
      },
      {
        text: 'References',
        collapsed: true,
        items: [
          { text: 'Streams', link: '/references/streams' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/devunt/mearie' }],

    editLink: {
      pattern: 'https://github.com/devunt/mearie/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'algolia',
      options: {
        appId: 'YRHCT5FEVW',
        apiKey: '65d19a2881e72c1659a79e91b1c448bd',
        indexName: 'mearie',
      },
    },
  },

  transformHead: ({ title, description }) => {
    return [
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
    ];
  },
});
