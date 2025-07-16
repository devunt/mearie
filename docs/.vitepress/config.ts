import { defineConfig } from 'vitepress';
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs';
import { mearie } from '@mearie/vite';

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
          { text: 'Links', link: '/guides/links' },
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
        text: 'Guides',
        collapsed: true,
        items: [
          { text: 'Queries', link: '/guides/queries' },
          { text: 'Mutations', link: '/guides/mutations' },
          { text: 'Fragments', link: '/guides/fragments' },
          { text: 'Subscriptions', link: '/guides/subscriptions' },
          { text: 'Links', link: '/guides/links' },
          { text: 'Scalars', link: '/guides/scalars' },
          { text: 'Directives', link: '/guides/directives' },
        ],
      },
      {
        text: 'Links',
        collapsed: true,
        items: [
          { text: 'HTTP', link: '/links/http' },
          { text: 'Cache', link: '/links/cache' },
          { text: 'Retry', link: '/links/retry' },
          { text: 'Deduplication', link: '/links/dedup' },
          { text: 'SSE', link: '/links/sse' },
          { text: 'WebSocket', link: '/links/ws' },
          { text: 'Custom Links', link: '/links/custom' },
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
});
