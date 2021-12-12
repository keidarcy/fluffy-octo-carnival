module.exports = {
  lang: 'en-US',
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
  title: 'Hello 🎨',
  description: 'This is blog, ',
  bundler: '@vuepress/bundler-vite',
  themeConfig: {
    darkMode: true,
    sidebar: false,
    navbar: [
      {
        text: 'Github',
        link: 'https://github.com/keidarcy',
      },
    ],
  },
};
