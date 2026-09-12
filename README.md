# aenism.com

A personal site whose homepage is a zero-gravity physics field: every post is a
rigid body you can grab and fling.

matter.js runs headless — the DOM is the renderer. Each frame, every body's
position and angle is written onto a real `<a>` as a CSS transform, so the cards
are live HTML with real text, real links and real focus order. The canvas only
ever holds the wireframe overlay, and only while the eye is open.

Astro + TypeScript, static output, deployed to GitHub Pages.

## Running it

```sh
npm install
npm run dev          # http://localhost:4321
```

| Command          | Does                                              |
| ---------------- | ------------------------------------------------- |
| `npm run dev`    | Dev server with HMR                                |
| `npm run build`  | Static build into `dist/`                          |
| `npm run preview`| Serve the built site                               |
| `npm run check`  | Type-check `.astro` and `.ts`                      |
| `npm test`       | The interaction contract (see below)               |

Deploy with `./_scripts/deploy.sh`, which verifies, builds and pushes `dist/`
to the `gh-pages` branch.

## Writing

Posts are markdown in `src/content/post/`. The filename is the URL.

```yaml
---
title: "Good taste"
description: "On aesthetic empathy."
date: 2014-03-15
topic: idea          # design | idea | inspiration | tech | work
client: "MyDoc"      # optional; renders "for MyDoc" instead of "in work"
tags: ["taste", "aesthetic"]
---
```

`topic` picks the typeface the post is set in, on its card and on its own page,
so it is a checked enum in `src/content.config.ts` rather than a free string.

The three Hugo shortcodes still work — `{{%figure%}}`, `{{%embed%}}` and
`{{%youtube%}}` — translated at build time by `src/plugins/remark-shortcodes.mjs`
so the fifteen existing articles did not have to be rewritten.

## The field

| File                             | Holds                                          |
| -------------------------------- | ---------------------------------------------- |
| `src/scripts/physics.config.ts`  | Every constant the field runs on                |
| `src/scripts/world.ts`           | Body construction, DOM-free so it can be tested |
| `src/scripts/PhysicsField.ts`    | The simulation, the pointer handling, the eye   |
| `src/styles/field.css`           | Card geometry — the source of truth for collisions |
| `test/field.test.ts`             | The interaction contract, executable            |

Two things are worth knowing before changing any of it.

**The numbers are the design.** Zero gravity, three undamped disturbers taking a
unit impulse every frame, walls bouncier than the bodies. Drop the impulse or
add air friction to the disturbers and the page goes still. `npm test` fails if
you do.

**CSS owns the geometry.** Body size and corner radius are read from the
rendered element, so restyling a card moves the physics with it — including the
smaller cards under 640px.

The homepage renders as a plain grid of links and only becomes a field once the
simulation is running, so a blocked bundle or a reduced-motion preference
degrades to something readable rather than a pile of cards in the corner.

## The Uniqlo demo

`/uniqlo-next-demo/` is a 2014 artifact, frozen. Its libraries are vendored into
`public/demo/vendor/` and its trackers are gone; the JavaScript source survives
only minified. It is an archive, not code — edit the built files or nothing.
