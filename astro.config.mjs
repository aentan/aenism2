// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import remarkShortcodes from "./src/plugins/remark-shortcodes.mjs";
import remarkImageDimensions from "./src/plugins/remark-image-dimensions.mjs";
import rehypeImageDimensions from "./src/plugins/rehype-image-dimensions.mjs";

export default defineConfig({
  site: "https://aenism.com",

  // Hugo served every page as /slug/ — keep it, or every inbound link dies.
  trailingSlash: "always",

  build: {
    format: "directory",
    // The whole stylesheet is a couple of KB. Inlining it removes the only
    // render-blocking request on the site; Lighthouse costs it at ~150ms.
    inlineStylesheets: "always",
  },

  // Hugo emitted /page/1/ as an alias to the homepage. Keep the URL alive.
  redirects: { "/page/1/": "/" },

  integrations: [sitemap()],

  markdown: {
    // Posts still contain raw HTML from the Hugo days (goldmark ran with
    // unsafe: true). Keep allowing it rather than rewriting fifteen articles.
    remarkPlugins: [remarkShortcodes, remarkImageDimensions],
    rehypePlugins: [rehypeImageDimensions],
    shikiConfig: { theme: "github-light", wrap: true },
  },
});
