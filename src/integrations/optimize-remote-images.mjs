/**
 * Optimise the remote images the posts point at.
 *
 * The originals live on S3 at whatever size they were exported — several are
 * 4800px wide — and were being served untouched into a container that is never
 * more than 1120px. One post pulled 2.8 MB and took 16.8s to reach LCP.
 *
 * This runs after the build, so nothing about how posts are written changes.
 * For every remote <img> in the output it downloads the original once, emits
 * WebP derivatives at a few widths, and rewrites the tag with a srcset. The
 * originals stay on S3; only the derivatives are emitted, and only into dist/ —
 * the repo keeps none of it.
 *
 * Downloads are cached in .cache/remote-images/ (gitignored), so the first
 * build is slow and every build after it is not.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CACHE = ".cache/remote-images";
const OUT_DIR = "_img";

/**
 * The article column tops out at 1120px and figures sit 32px inside it, so
 * 1056 is the widest a figure is ever displayed; 2x of that covers retina.
 * The rungs below that are close enough together that a device rarely
 * downloads much more than it paints. 768 earns its place specifically:
 * Lighthouse's mobile profile paints at 721 device px, and without a rung just
 * above it the browser reaches for 900 and pulls ~40% more pixels than it
 * shows.
 */
const WIDTHS = [360, 540, 768, 900, 1056, 1280, 1600, 2112];

/**
 * Figures are full-bleed on small screens (negative margins in post.css) and
 * 1056 wide once the layout opens up. Getting this wrong makes the browser
 * pick a rung that is too large, which is most of what Lighthouse complains
 * about under "improve image delivery".
 */
const SIZES = "(min-width: 1023px) 1056px, 100vw";
const QUALITY = 70;
const CONCURRENCY = 4;

/** Animated GIFs are left alone — re-encoding them costs more than it saves. */
const SKIP = /\.gif(\?|$)/i;

const IMG_TAG = /<img\b[^>]*>/gi;
const ATTR = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");

const key = (url) => createHash("sha1").update(url).digest("hex").slice(0, 16);

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(url, dest) {
  if (await exists(dest)) return readFile(dest);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

export default function optimizeRemoteImages() {
  return {
    name: "optimize-remote-images",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const sharp = (await import("sharp")).default;
        const outRoot = fileURLToPath(dir);
        const pages = [];
        for await (const file of walk(outRoot)) pages.push(file);

        // Collect every remote image referenced anywhere in the output.
        const wanted = new Map(); // url -> Set of pages
        for (const file of pages) {
          const html = await readFile(file, "utf8");
          for (const tag of html.match(IMG_TAG) ?? []) {
            const src = tag.match(ATTR("src"))?.[1];
            if (!src || !/^https?:\/\//i.test(src) || SKIP.test(src)) continue;
            if (!wanted.has(src)) wanted.set(src, new Set());
            wanted.get(src).add(file);
          }
        }

        if (!wanted.size) return;
        logger.info(`optimising ${wanted.size} remote images`);

        await mkdir(path.join(outRoot, OUT_DIR), { recursive: true });

        /** url -> { srcset, fallback, width, height } */
        const built = new Map();
        const unavailable = new Set();
        const queue = [...wanted.keys()];
        let savedFrom = 0;
        let savedTo = 0;

        await Promise.all(
          Array.from({ length: CONCURRENCY }, async () => {
            while (queue.length) {
              const url = queue.shift();
              const id = key(url);
              try {
                const ext = (url.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg").toLowerCase();
                const original = await download(url, path.join(CACHE, `${id}.${ext}`));
                const image = sharp(original, { failOn: "none" });
                const meta = await image.metadata();
                if (!meta.width || !meta.height) continue;

                const widths = WIDTHS.filter((w) => w < meta.width);
                widths.push(meta.width);

                const entries = [];
                for (const w of widths) {
                  const name = `${id}-${w}.webp`;
                  const dest = path.join(outRoot, OUT_DIR, name);
                  if (!(await exists(dest))) {
                    await sharp(original, { failOn: "none" })
                      .resize({ width: w, withoutEnlargement: true })
                      .webp({ quality: QUALITY })
                      .toFile(dest);
                  }
                  const { size } = await stat(dest);
                  entries.push({ w, name, size });
                }

                // Fallback for anything that cannot take WebP: the smallest
                // derivative that still covers the layout.
                const fallback = entries.find((e) => e.w >= 1440) ?? entries.at(-1);
                savedFrom += original.length;
                savedTo += fallback.size;

                built.set(url, {
                  srcset: entries.map((e) => `/${OUT_DIR}/${e.name} ${e.w}w`).join(", "),
                  fallback: `/${OUT_DIR}/${fallback.name}`,
                  width: meta.width,
                  height: meta.height,
                });
              } catch (err) {
                unavailable.add(url);
                logger.warn(`skipped ${url} — ${err.message}`);
              }
            }
          }),
        );

        // Rewrite every page that referenced one.
        for (const file of pages) {
          let html = await readFile(file, "utf8");
          let first = true;
          let touched = false;
          let preload = "";

          html = html.replace(IMG_TAG, (tag) => {
            const src = tag.match(ATTR("src"))?.[1];

            // A poster we could not fetch would otherwise ship as a broken
            // image and a live third-party request. Drop it — the facade
            // still reads fine as a plain play button.
            if (src && unavailable.has(src) && /\bembed-poster\b/.test(tag)) {
              touched = true;
              return "";
            }

            const info = src && built.get(src);
            if (!info) return tag;
            touched = true;

            let next = tag
              .replace(ATTR("src"), `src="${info.fallback}"`)
              .replace(/\s*\/?>$/, "");

            if (!ATTR("srcset").test(next)) {
              next += ` srcset="${info.srcset}" sizes="${SIZES}"`;
            }

            // The first image is the likely LCP element: it must not be lazy,
            // and telling the browser early is worth a lot on a slow link.
            if (first) {
              next = next.replace(/\s*loading="lazy"/i, "") + ` fetchpriority="high"`;
              // Also announce it in <head>: the parser would otherwise not
              // reach this tag until it has worked through the article above.
              preload =
                `<link rel="preload" as="image" imagesrcset="${info.srcset}" ` +
                `imagesizes="${SIZES}" fetchpriority="high">`;
              first = false;
            }
            return next + ">";
          });

          if (preload) html = html.replace("</head>", preload + "</head>");
          if (touched) await writeFile(file, html);
        }

        const mb = (n) => (n / 1048576).toFixed(1);
        logger.info(
          `optimised ${built.size} images — largest-variant total ${mb(savedFrom)} MB → ${mb(savedTo)} MB`,
        );
      },
    },
  };
}
