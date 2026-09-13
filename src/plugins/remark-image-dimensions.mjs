/**
 * Stamp intrinsic dimensions onto every <img> that lives inside raw HTML —
 * both the shortcode bridge's output and the raw markup still embedded in the
 * older posts. Runs after remark-shortcodes so it sees both.
 *
 * See src/plugins/image-sizes.mjs for why this cannot be done in rehype.
 */
import { visit } from "unist-util-visit";
import { addDimensions } from "./image-sizes.mjs";

export default function remarkImageDimensions() {
  return (tree) => {
    visit(tree, "html", (node) => {
      if (node.value && node.value.includes("<img")) {
        node.value = addDimensions(node.value);
      }
    });
  };
}
