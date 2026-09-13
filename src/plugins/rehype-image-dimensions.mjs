/**
 * Give every remote image its intrinsic width and height.
 *
 * The posts point at images on S3, so the browser learns their size only when
 * the bytes arrive — and reflows the article each time one does. With real
 * dimensions plus the `height: auto` in post.css, the browser reserves the
 * right box up front and nothing moves.
 *
 * Sizes come from src/data/image-sizes.json, recorded by
 * `npm run images:measure`. Anything missing from that map is left untouched,
 * so a new image never breaks the build — it just does not get the benefit
 * until the map is refreshed.
 *
 * This pass covers markdown's own `![alt](url)` syntax, which does reach
 * rehype as an element. Raw <img> is handled earlier, in
 * remark-image-dimensions.mjs — see image-sizes.mjs for why.
 */
import { visit } from "unist-util-visit";

import { lookup } from "./image-sizes.mjs";

export default function rehypeImageDimensions() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "img") return;

      const props = (node.properties ??= {});
      if (props.width || props.height) return;

      const dims = lookup(props.src);
      if (!dims) return;

      props.width = dims[0];
      props.height = dims[1];
    });
  };
}
