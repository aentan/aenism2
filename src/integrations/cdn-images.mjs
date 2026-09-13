/**
 * Serve remote images through Cloudflare's image transformations.
 *
 * The originals live on S3 at whatever size they were exported — several are
 * 4800px wide — and are displayed in a column that is never more than 1056px.
 * Rather than download and re-encode them at build time, the output points at
 * `/cdn-cgi/image/`, which resizes and re-encodes at the edge on first request
 * and caches the result.
 *
 * What this buys over building the derivatives ourselves:
 *   - nothing image-shaped in the repo or the deploy (dist dropped ~18 MB)
 *   - `format=auto` serves AVIF where the browser takes it, not just WebP
 *   - builds stop downloading 86 originals and stop running sharp
 *
 * What it costs:
 *   - images now depend on Cloudflare staying in front of the site
 *   - transformations must be enabled on the zone, and S3 allowlisted as a
 *     source origin — by default Cloudflare only transforms images it serves
 *     from its own zone
 *
 * Free tier is 5,000 unique transformations a month; this site uses roughly
 * 700. Over the cap Cloudflare returns an error rather than a bill, and
 * already-cached transformations keep working.
 *
 * Dimensions still come from src/data/image-sizes.json (`npm run images:measure`)
 * — the edge cannot tell the build what shape an image is, and without
 * width/height the article reflows as each one lands.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute so local preview and the Lighthouse audit measure what ships. */
const ZONE = "https://aenism.com";

/**
 * Rungs, in device pixels. The widest a figure is ever displayed is 1056, so
 * 2112 covers retina. 768 earns its place specifically: Lighthouse's mobile
 * profile paints at 721, and without a rung just above it the browser reaches
 * for the next one up and pulls more pixels than it shows.
 */
const WIDTHS = [360, 540, 768, 1024, 1440, 2112];
const SIZES = "(min-width: 1023px) 1056px, 100vw";
const QUALITY = 78;

/**
 * Animated GIFs are left pointing at the original. Cloudflare can transform
 * them, but keeping the animation intact means `anim=true`, which rules out
 * the format conversion that makes this worth doing.
 */
const SKIP = /\.gif(\?|$)/i;

const IMG_TAG = /<img\b[^>]*>/gi;
const ATTR = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");

const transform = (src, width) =>
  `${ZONE}/cdn-cgi/image/width=${width},format=auto,quality=${QUALITY}/${src}`;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

export default function cdnImages() {
  return {
    name: "cdn-images",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outRoot = fileURLToPath(dir);
        const pages = [];
        for await (const file of walk(outRoot)) pages.push(file);

        const seen = new Set();
        let rewritten = 0;

        for (const file of pages) {
          let html = await readFile(file, "utf8");
          let first = true;
          let preload = "";
          let touched = false;

          html = html.replace(IMG_TAG, (tag) => {
            const src = tag.match(ATTR("src"))?.[1];
            if (!src || !/^https?:\/\//i.test(src) || SKIP.test(src)) return tag;
            if (ATTR("srcset").test(tag)) return tag;

            // The intrinsic width caps the rungs — asking the edge to upscale
            // wastes a transformation and looks worse than the original.
            const intrinsic = Number(tag.match(ATTR("width"))?.[1]) || Infinity;
            const rungs = WIDTHS.filter((w) => w < intrinsic);
            if (intrinsic !== Infinity) rungs.push(intrinsic);
            if (!rungs.length) rungs.push(WIDTHS[0]);

            const srcset = rungs.map((w) => `${transform(src, w)} ${w}w`).join(", ");
            const fallback = transform(src, rungs.at(-1));

            seen.add(src);
            touched = true;
            rewritten++;

            let next = tag
              .replace(ATTR("src"), `src="${fallback}"`)
              .replace(/\s*\/?>$/, "");
            next += ` srcset="${srcset}" sizes="${SIZES}"`;

            // The first image is the likely LCP element: it must not be lazy,
            // and the parser would not otherwise reach this tag until it has
            // worked through the article above it.
            if (first) {
              next = next.replace(/\s*loading="lazy"/i, "") + ` fetchpriority="high"`;
              preload =
                `<link rel="preload" as="image" imagesrcset="${srcset}" ` +
                `imagesizes="${SIZES}" fetchpriority="high">`;
              first = false;
            }
            return next + ">";
          });

          if (preload) html = html.replace("</head>", preload + "</head>");
          if (touched) await writeFile(file, html);
        }

        if (!seen.size) return;
        logger.info(
          `${seen.size} images via /cdn-cgi/image (${rewritten} tags, ` +
            `~${seen.size * WIDTHS.length} transformations at the edge)`,
        );
      },
    },
  };
}
