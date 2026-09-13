/**
 * Intrinsic sizes for the images the posts point at, recorded by
 * `npm run images:measure` into src/data/image-sizes.json.
 *
 * Shared by the remark and rehype passes: Astro hands raw HTML straight
 * through to the output as a string rather than parsing it into the tree, so
 * `<img>` written in markdown (or produced by the shortcode bridge) never
 * reaches rehype as an element. Those are rewritten at the remark stage; real
 * markdown `![alt](url)` images are rewritten at the rehype stage.
 */
import sizes from "../data/image-sizes.json" with { type: "json" };

/** http, https and protocol-relative spellings all resolve to one entry. */
export function lookup(src) {
  if (!src) return null;
  if (sizes[src]) return sizes[src];
  const bare = src.replace(/^https?:/, "").replace(/^\/\//, "");
  return sizes["https://" + bare] ?? sizes["http://" + bare] ?? null;
}

const IMG = /<img\b[^>]*>/gi;
const SRC = /\bsrc\s*=\s*"([^"]+)"/i;
const HAS_DIM = /\b(width|height)\s*=/i;

/** Add width/height to every <img> in a chunk of HTML that we have sizes for. */
export function addDimensions(html) {
  return html.replace(IMG, (tag) => {
    if (HAS_DIM.test(tag)) return tag;
    const src = tag.match(SRC)?.[1];
    const dims = lookup(src);
    if (!dims) return tag;
    return tag.replace(/\s*\/?>$/, ` width="${dims[0]}" height="${dims[1]}"$&`)
              .replace(/\s+(\/?>)\s*\1$/, " $1");
  });
}
