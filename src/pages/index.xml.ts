import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPosts } from "../lib/posts";

/** Hugo published the feed at /index.xml — keep the URL, keep the readers. */
export async function GET(context: APIContext) {
  const posts = await getPosts();

  return rss({
    title: "Aenism",
    description: "Aen Tan — design, ideas and work.",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: "<language>en-us</language>",
  });
}
