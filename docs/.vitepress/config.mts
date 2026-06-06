import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Hanumate',
  description: 'TypeScript framework for building autonomous coding agents',
  srcDir: '.',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#646cff' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Hanumate',
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Packages', link: '/packages/' },
      { text: 'CLI', link: '/guide/cli' },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/Saitarun251/hanumate/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@kishkindhalabs/hanumate' }
        ]
      }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quickstart' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Agents', link: '/guide/agents' },
            { text: 'Sessions', link: '/guide/sessions' },
            { text: 'Tools', link: '/guide/tools' },
            { text: 'Skills', link: '/guide/skills' }
          ]
        },
        {
          text: 'CLI',
          items: [
            { text: 'CLI Overview', link: '/guide/cli' },
            { text: 'Hook Commands', link: '/guide/cli-hooks' },
            { text: 'Bead Commands', link: '/guide/cli-beads' },
            { text: 'Convoy Commands', link: '/guide/cli-convoys' }
          ]
        }
      ],
      '/packages/': [
        {
          text: 'Packages',
          items: [
            { text: 'Overview', link: '/packages/' },
            { text: 'Runtime', link: '/packages/runtime' },
            { text: 'CLI', link: '/packages/cli' },
            { text: 'SDK', link: '/packages/sdk' },
            { text: 'OpenTelemetry', link: '/packages/opentelemetry' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Saitarun251/hanumate' },
      { icon: 'twitter', link: 'https://x.com/kishkindhalabs' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Hanumate'
    },
    editLink: {
      pattern: 'https://github.com/Saitarun251/hanumate/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    search: {
      provider: 'local'
    }
  },
  markdown: {
    theme: {
      light: 'vitesse-light',
      dark: 'vitesse-dark'
    }
  }
})