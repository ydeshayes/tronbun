import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Tronbun",
  description:
    "Build native desktop applications with TypeScript and Bun. Lightweight, fast, cross-platform.",
  base: "/tronbun/",
  head: [
    ["link", { rel: "icon", type: "image/webp", href: "/tronbun/logo.webp" }],
  ],

  themeConfig: {
    logo: "/logo.webp",
    siteTitle: "Tronbun",

    nav: [
      { text: "Guide", link: "/getting-started" },
      {
        text: "API",
        items: [
          { text: "Window", link: "/api/window" },
          { text: "WindowIPC", link: "/api/window-ipc" },
          { text: "Dialog", link: "/api/dialog" },
          { text: "Menu", link: "/api/menu" },
          { text: "Notification", link: "/api/notification" },
          { text: "Tray", link: "/api/tray" },
          { text: "Automation", link: "/api/automation" },
          { text: "Protocol", link: "/api/protocol" },
          { text: "Child Views", link: "/api/child-views" },
        ],
      },
      { text: "Config", link: "/configuration" },
      { text: "CLI", link: "/cli" },
    ],

    sidebar: {
      "/": [
        {
          text: "Introduction",
          items: [
            { text: "What is Tronbun?", link: "/" },
            { text: "Getting Started", link: "/getting-started" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Configuration", link: "/configuration" },
            { text: "CLI Commands", link: "/cli" },
          ],
        },
        {
          text: "API",
          items: [
            { text: "Window", link: "/api/window" },
            { text: "WindowIPC", link: "/api/window-ipc" },
            { text: "Dialog", link: "/api/dialog" },
            { text: "Menu", link: "/api/menu" },
            { text: "Notification", link: "/api/notification" },
            { text: "Tray", link: "/api/tray" },
            { text: "Automation", link: "/api/automation" },
            { text: "Protocol (CDP)", link: "/api/protocol" },
            { text: "Child Views", link: "/api/child-views" },
          ],
        },
        {
          text: "Guides",
          items: [
            { text: "IPC Communication", link: "/guides/ipc-communication" },
            {
              text: "Building & Compiling",
              link: "/guides/building-and-compiling",
            },
            { text: "Cross-Platform", link: "/guides/cross-platform" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/ydeshayes/tronbun" },
    ],

    editLink: {
      pattern: "https://github.com/ydeshayes/tronbun/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the GPLv3 License.",
      copyright: "Copyright 2024-present Yann Deshayes",
    },

    search: {
      provider: "local",
    },

    outline: {
      level: [2, 3],
    },
  },
});
