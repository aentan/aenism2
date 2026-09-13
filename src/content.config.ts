import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * `topic` picks the typeface a post is set in — on its card and on its own
 * page. It is the site's signature, so it is a checked enum rather than a
 * free string that silently falls back to the default face.
 */
export const TOPICS = ["design", "idea", "inspiration", "tech", "work"] as const;
export type Topic = (typeof TOPICS)[number];

const post = defineCollection({
  loader: glob({ base: "src/content/post", pattern: "**/*.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    topic: z.enum(TOPICS),
    /** Work posts read "for MyDoc" instead of "in work". */
    client: z.string().optional(),
    /**
     * Visible in `astro dev`, absent from a production build — no page, no
     * card, no feed entry, no sitemap line. Scaffolded posts start as drafts
     * so nothing ships by accident.
     */
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { post };
