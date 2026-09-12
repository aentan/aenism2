/**
 * Hugo shortcode bridge.
 *
 * Fifteen years of posts call {{%figure%}}, {{%embed%}} and {{%youtube%}} 90
 * times between them. Rather than rewrite the content, translate the three at
 * build time — so the markdown files stay byte-comparable with the Hugo
 * originals and a bad diff is easy to spot.
 *
 * Paragraphs are matched against their *raw source* via position offsets, not
 * against remark's parsed children, so an underscore in a URL or a stray
 * asterisk in a caption can never desync the match.
 */
import { visit } from "unist-util-visit";

const SHORTCODE = /\{\{%\s*(figure|embed|youtube)([\s\S]*?)%\}\}/g;
const ATTR = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function attrs(raw) {
  const out = {};
  for (const [, k, v] of raw.matchAll(ATTR)) out[k.toLowerCase()] = v;
  return out;
}

/** An embedded player, sized by aspect-ratio in CSS. */
function iframe(src, query, title) {
  if (!src) return "";
  const url = esc(src + (src.includes("?") ? "&" : "?") + query);
  return (
    `<figure class="embed">` +
    `<iframe src="${url}" title="${esc(title)}" loading="lazy" ` +
    `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
    `allowfullscreen></iframe>` +
    `</figure>`
  );
}

function render(name, raw) {
  const a = attrs(raw);

  if (name === "figure") {
    if (!a.src) return "";
    // The caption doubles as alt text — it is the only description that exists.
    const alt = a.alt ?? a.title ?? "";
    const img =
      `<img src="${esc(a.src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
    const cap = a.title ? `<figcaption>${esc(a.title)}</figcaption>` : "";
    return `<figure>${img}${cap}</figure>`;
  }

  if (name === "embed") {
    // Vimeo, tinted with the site blue — as it always was.
    return iframe(a.src, "color=6977fd", a.title || "Embedded video");
  }

  // youtube
  return iframe(
    a.src,
    "color=white&fs=1&iv_load_policy=3&rel=0&showinfo=0&showsearch=0&theme=light",
    a.title || "YouTube video",
  );
}

export default function remarkShortcodes() {
  return (tree, file) => {
    const source = String(file.value ?? "");

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index === null) return;
      const { start, end } = node.position ?? {};
      if (start?.offset == null || end?.offset == null) return;

      const raw = source.slice(start.offset, end.offset);
      SHORTCODE.lastIndex = 0;
      const matches = [...raw.matchAll(SHORTCODE)];
      if (!matches.length) return;

      // Most paragraphs are nothing but shortcodes. A few trail a stray
      // sentence-ending period, which Hugo rendered after the figure — so keep
      // it rather than quietly swallowing the author's text.
      const parts = [];
      let cursor = 0;
      let prose = "";

      for (const match of matches) {
        const between = raw.slice(cursor, match.index);
        if (between.trim()) {
          prose += between;
          parts.push(esc(between));
        }
        parts.push(render(match[1], match[2]));
        cursor = match.index + match[0].length;
      }
      const tail = raw.slice(cursor);
      if (tail.trim()) {
        prose += tail;
        parts.push(esc(tail));
      }

      // Escaping leftover prose would flatten any markdown in it. If there is
      // any, leave the paragraph alone and say so — a silent drop here would
      // be invisible until someone re-read the published article.
      if (/[*_`[\]]/.test(prose)) {
        console.warn(
          `[shortcodes] ${file.path ?? "?"}:${start.line} mixes markdown with a ` +
            `shortcode; left untransformed: ${raw.slice(0, 80)}…`,
        );
        return;
      }

      const html = parts.join("");
      if (!html.trim()) return;

      parent.children[index] = { type: "html", value: html };
    });
  };
}
