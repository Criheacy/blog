// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const codeBlockTheme = require("./theme");
const darkTheme = require("prism-react-renderer/themes/oceanicNext");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Criheacy's Blog",
  tagline: "Document my knowledge and life",
  url: "https://criheacy.com",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.ico",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "zh-Hans",
    locales: ["zh-Hans"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
        },
        blog: {
          showReadingTime: true,
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        googleAnalytics: {
          trackingID: "G-JP911WYN82",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "Criheacy's Blog",
        logo: {
          alt: "Criheacy",
          src: "img/icon.png",
          width: 32,
          height: 32,
        },
        items: [
          {
            type: "doc",
            docId: "index",
            position: "left",
            label: "Docs",
          },
          { to: "/blog", label: "Blog", position: "left" },
          {
            href: "https://github.com/Criheacy",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "light",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Tutorial",
                to: "/docs/index",
              },
            ],
          },
          {
            title: "Links",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/Criheacy",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Blog",
                to: "/blog",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Criheacy. Built with Docusaurus.`,
      },
      prism: {
        theme: codeBlockTheme.light,
        darkTheme: darkTheme,
      },
    }),
};

module.exports = config;
