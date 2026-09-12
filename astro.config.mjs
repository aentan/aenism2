// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import remarkShortcodes from "./src/plugins/remark-shortcodes.mjs";

export default defineConfig({
  site: "https://aenism.com",

  // Hugo served every page as /slug/ — keep it, or every inbound link dies.
  trailingSlash: "always",
  build: { format: "directory" },

  // Hugo emitted /page/1/ as an alias to the homepage. Keep the URL alive.
  redirects: { "/page/1/": "/" },

  integrations: [sitemap()],

  markdown: {
    // Posts still contain raw HTML from the Hugo days (goldmark ran with
    // unsafe: true). Keep allowing it rather than rewriting fifteen articles.
    remarkPlugins: [remarkShortcodes],
    shikiConfig: { theme: "github-light", wrap: true },
  },
});
