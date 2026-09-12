import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"post">;

/** Hugo's `paginate: 8`. Changing this changes /page/N/ URLs. */
export const PAGE_SIZE = 8;

/** Newest first — Hugo's default ordering, and the one the live site ships. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection("post");
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function pageSlice<T>(items: T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

/** Page 1 lives at `/`; the rest at `/page/N/`. */
export function pageHref(page: number): string {
  return page <= 1 ? "/" : `/page/${page}/`;
}

/** "in design" — or "for MyDoc" when a client is named. */
export function attribution(data: Post["data"]): string {
  return data.client ? `for ${data.client}` : `in ${data.topic}`;
}
