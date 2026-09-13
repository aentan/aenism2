/**
 * Replace every embedded player with a facade.
 *
 * An eagerly-embedded YouTube iframe pulls ~473 KB of player JavaScript, a
 * Google font and a doubleclick script, and logs a pile of DevTools issues —
 * on pages where most readers never press play. One post carried ten of them.
 *
 * The real iframe is swapped in on click by src/scripts/embeds.ts, so nothing
 * third-party loads until someone asks for it. YouTube's own thumbnail is used
 * as the poster, which the build-time image optimiser then self-hosts, so even
 * that costs no third-party request.
 *
 * This runs over `html` nodes rather than in the shortcode bridge so it catches
 * the raw <iframe> still written into the older posts as well.
 */
import { visit } from "unist-util-visit";

const IFRAME = /<iframe\b([^>]*)><\/iframe>|<iframe\b([^>]*)\/?>/gi;
const ATTR = (name, s) => s.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? "";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
           .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const VIDEO_HOST = /youtube\.com|youtu\.be|player\.vimeo\.com|embed\.ted\.com/i;

function poster(src) {
  const id = src.match(/(?:embed\/|v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/)?.[1];
  if (!id || !/youtube\.com|youtu\.be/.test(src)) return "";
  return (
    `<img class="embed-poster" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" ` +
    `alt="" width="480" height="360" loading="lazy" decoding="async">`
  );
}

function facade(attrs) {
  const src = ATTR("src", attrs);
  if (!src || !VIDEO_HOST.test(src)) return null;
  const title = ATTR("title", attrs) || "video";
  return (
    `<button type="button" class="embed-facade" data-embed="${esc(src)}" ` +
    `aria-label="Play: ${esc(title)}">` +
    poster(src) +
    `<span class="embed-play" aria-hidden="true"></span>` +
    `</button>`
  );
}

export default function remarkEmbedFacades() {
  return (tree) => {
    visit(tree, "html", (node) => {
      if (!node.value || !node.value.includes("<iframe")) return;
      node.value = node.value.replace(IFRAME, (tag, a, b) => facade(a ?? b ?? "") ?? tag);
    });
  };
}
