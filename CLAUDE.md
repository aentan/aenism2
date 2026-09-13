# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev                  # dev server, http://localhost:4321
npm run build                # static build into dist/
npm run preview              # serve the built site
npm run check                # astro check — types across .astro and .ts
npm test                     # the interaction contract — physics, no DOM
npm run test:gestures        # tap/drag/click/hover in a real Chrome (needs preview running)
npm run audit                # Lighthouse across every template; fails under 100
npm run images:measure       # record intrinsic sizes of remote images
./_scripts/deploy.sh         # verify, build, push dist/ to gh-pages
```

Run a single test by name:

```sh
node --test --experimental-strip-types --test-name-pattern="never settle" test/field.test.ts
```

`npm test` runs under Node's type stripping, not Vite. That has two consequences
for anything in the test's import graph (`physics.config.ts`, `world.ts`):

- **Imports need explicit `.ts` extensions.** `tsconfig.json` sets
  `allowImportingTsExtensions` for this reason.
- **matter-js is CommonJS**, so those files use `import Matter from "matter-js"`
  plus a separate `import type { … }`. Named value imports resolve under Vite
  but throw in bare Node. `PhysicsField.ts` is bundler-only and can use named
  imports freely.

**Editing `src/plugins/remark-shortcodes.mjs` requires a cache wipe.** Vite
caches the plugin module, so edits appear to do nothing:

```sh
rm -rf .astro node_modules/.vite && npm run build
```

## Architecture

### The homepage is a physics field, and the DOM is the renderer

matter.js runs headless. Every frame, each body's position and angle is written
onto a real `<a>` via the `translate` and `rotate` properties — so the cards are
live HTML with real text, real links and real focus order. `scale` is left free
for CSS so the hover pull can be transitioned underneath the loop. The canvas
only ever holds the wireframe overlay, and only while the eye is open.

| File | Role |
| --- | --- |
| `src/scripts/physics.config.ts` | Every constant the field runs on |
| `src/scripts/world.ts` | Body construction — deliberately DOM-free so it can be tested |
| `src/scripts/PhysicsField.ts` | Simulation, pointer handling, the eye, resize |
| `src/styles/field.css` | Card geometry — the source of truth for collision shapes |
| `test/field.test.ts` | The behaviours above, pinned |

### Four non-obvious couplings

**1. CSS owns collision geometry.** `PhysicsField.buildBodies()` reads
`offsetWidth`, `offsetHeight` and computed `borderRadius` off each rendered
card. Changing `.card` dimensions in `field.css` changes the physics — that is
how the `@media (width < 640px)` block makes the field playable on a phone with
no JavaScript change at all.

**2. The boot guard is spread across three files and only makes sense together.**

- `FieldHead.astro` — an inline, render-blocking script that adds
  `html.js-field` before first paint (unless reduced motion), plus a 2s
  failsafe that removes it again if `.field.is-live` never appears.
- `field.css` — `html.js-field .field .card { visibility: hidden }`, released
  by `.is-live`.
- `Field.astro` — dynamically imports `PhysicsField` on idle; its `catch`
  removes `js-field` too.

The point: the markup is a plain readable grid of links, and only becomes a
field once the simulation is actually running. A blocked bundle, a JS error or
`prefers-reduced-motion` all degrade to that grid rather than a blank page or a
pile of cards at 0,0. Do not make the cards unconditionally hidden.

**3. `Render.create` must not be given the engine.** It runs its options object
through `Common.extend`, which deep-clones any plain object — and a *running*
engine's pair table holds bodies whose `parent` points at themselves, so the
clone recurses until the stack blows. matter gets away with this because it
expects `Render.create` before the world is populated; this renderer is built
800ms in, on the eye. `Render.create` assigns `render.engine = options.engine`
straight after the extend anyway, so `PhysicsField.setupRender()` passes only
`element` and `options`, then sets `render.engine` itself. Re-adding `engine` to
that call silently breaks the wireframe.

**4. On touch, the click never arrives.** matter's `Mouse` binds
`touchstart`/`touchend` and calls `preventDefault()` on both, which cancels the
click the browser would otherwise synthesise. Anchors therefore never fire from
a tap, and every desktop path keeps working — so this fails in exactly the place
you are least likely to be testing. `PhysicsField.onPointerUp()` navigates by
hand for non-mouse pointers, guarded by a `navigating` flag so a stray click
cannot double-fire. The 2017 code called `window.location.href` from matter's
own `mouseup` for the same reason.

`npm test` is blind to all of this — it has no DOM. `npm run test:gestures`
drives a real Chrome over CDP and covers tap, drag, click, mouse-drag and the
hover pull. Run it after touching anything in the pointer path.

### The constants are the design, not defaults

`physics.config.ts` is transcribed from the 2017 implementation, not re-derived.
Zero gravity (the field is a weightless tank, never a pile), three disturbers
with `frictionAir: 0` taking a unit impulse every frame, walls bouncier than the
bodies, rigid drag at `stiffness: 1`. Drop the impulse or damp the disturbers
and the page goes still. `npm test` fails if you do — treat a failure there as
"the page stopped feeling right", not as a broken assertion.

The eye's timing is part of this: 800ms stepped open → wireframe on → 3000ms
hold → 1200ms close → wireframe off. The wireframe is visible exactly as long as
the eye is open.

One addition the 2017 version lacked: `contain()` in `world.ts`, called at the
top of `PhysicsField.paint()`. Drag is rigid at `stiffness: 1`, so a hard enough
flick carries a card through 100px of wall in one step — and once out, there is
nothing to bring it back. It only fires on an escape (the walls stop a card's
*edge* long before its centre reaches the boundary), and a test asserts it stays
dormant during normal play. Do not drop it while tidying the paint loop.

## Performance is a guard, not a goal

Every template scores 100 on all four Lighthouse categories. `npm run audit`
builds, serves, and audits each template under the mobile preset, and exits
non-zero if any drops below 100. Run it before calling a content or layout
change done — the things that break the score (an unsized image, a
render-blocking stylesheet, a third-party script) are invisible in a diff.

Four pieces hold it there:

- **The stylesheet is inlined.** `build.inlineStylesheets: "always"` in
  `astro.config.mjs`. It is 4.5 KB raw, just over Astro's 4 KB auto-inline
  threshold, so without the override it ships as the site's only
  render-blocking request.
- **Remote images carry explicit dimensions.** Posts point at images on S3, so
  the build cannot know their size. `npm run images:measure` fetches each
  header once and records width/height in `src/data/image-sizes.json`, which is
  committed so builds stay offline. **Run it after adding a post with images**,
  or they ship unsized and the article reflows as they load.

- **Remote images are optimised at build time.**
  `src/integrations/optimize-remote-images.mjs` runs on `astro:build:done`: it
  downloads each remote image once (cached in `.cache/`, gitignored), emits
  right-sized WebP rungs into `dist/_img/`, rewrites the tag with a `srcset`,
  and preloads the first image on each page as the likely LCP element. Posts
  are written exactly as before; the originals stay on S3 and none of the
  derivatives enter the repo. One post went from 2.8 MB and a 16.8s LCP to
  2.0s.
- **Embeds are facades.** `remark-embed-facades.mjs` replaces every YouTube,
  Vimeo and TED iframe with a button; `src/scripts/embeds.ts` swaps in the real
  player on click. An eager YouTube embed pulls ~473 KB of player JS, a Google
  font and a doubleclick script, and costs a Best Practices point on its own.
  The poster is YouTube's own thumbnail, which the image optimiser then
  self-hosts — so a post at rest makes **zero** third-party requests.

The dimension stamping happens in two places because Astro passes raw HTML
through to the output as a string instead of parsing it into the tree — so
`<img>` from the shortcode bridge or written inline never reaches rehype as an
element. `remark-image-dimensions.mjs` handles those; `rehype-image-dimensions.mjs`
handles markdown's own `![alt](url)`. Both share `image-sizes.mjs`. The same
constraint is why the facade pass also works on `html` nodes.

`npm run audit` targets 100 everywhere except image-led posts, which are capped
at 99 with the reason written next to the number: Lighthouse's simulated slow 4G
burns ~1.8s on TTFB alone, and a perfect LCP score wants the hero painted inside
~1.2s. That is a floor, not a defect — and a guard that can never go green gets
ignored.

## URLs are a contract

This site replaced a Hugo build, and every public URL was preserved. Hugo slugged
post URLs from the **title**, not the filename, so three files were renamed to
match what was already live:

| Was | Is |
| --- | --- |
| `child-mind.md` | `a-child-mind.md` |
| `miura-fold-sf-map.md` | `miura-fold-map-of-san-francisco.md` |
| `new-logo-cakedefi-rebrand.md` | `new-logo-for-cake-defi-rebrand.md` |

**The filename is the URL.** Renaming a post file breaks an inbound link.

Also load-bearing: `trailingSlash: "always"`, the `/page/1/` → `/` redirect in
`astro.config.mjs` (Hugo published it as an alias), and the feed at
`/index.xml` rather than Astro's default. Taxonomy pages were dropped
deliberately — the Hugo list template was a zero-byte file, so all 37
`/tags/*` and `/categories/*` URLs already 404'd.

## Content

Markdown in `src/content/post/`, schema in `src/content.config.ts`. `topic` is a
checked enum because it selects the typeface the post is set in, on its card and
on its own page. `client` is optional and flips the attribution from "in work"
to "for MyDoc".

The three Hugo shortcodes still work — `{{%figure%}}`, `{{%embed%}}`,
`{{%youtube%}}`, 90 uses across 15 posts — translated at build time by
`src/plugins/remark-shortcodes.mjs` so the articles never had to be rewritten.
That plugin matches against each paragraph's **raw source** via position
offsets, not against remark's parsed children, so an underscore in a URL cannot
desync the match. If a paragraph mixes markdown with a shortcode it bails and
warns on the build console rather than flattening the markdown — watch for that
warning when adding content.

Posts still contain raw HTML from the Hugo days (`goldmark` ran with
`unsafe: true`); Astro allows it and that is intentional.

## Verifying in a browser

The Claude-in-Chrome extension was not connected during the rebuild, so
verification ran through headless Chrome and the DevTools Protocol. Two traps:

- **`timeout` does not exist on macOS.** Commands wrapping Chrome in it fail
  silently and write no screenshot.
- **The homepage hangs headless Chrome.** `--virtual-time-budget` never expires
  because the rAF loop never stops. The screenshot is still written before the
  hang; launch it detached rather than waiting. Virtual-time compression also
  distorts matter's timestep enough to push cards through walls — that artifact
  is not a real bug.

Post pages have no rAF loop and exit cleanly.

## The Uniqlo demo

`/uniqlo-next-demo/` is a frozen 2014 artifact in `public/`. Libraries are
vendored into `public/demo/vendor/`, trackers are stripped, and its JavaScript
source survives only minified. Edit the built files or nothing — there is no
build step for it and no source to regenerate from.

## Branches

`rewrite/astro` holds this rebuild. `master` is still the Hugo site.
`wip/gulp-rev-migration` preserves abandoned work on the old build system —
which cannot run at all on Node 22, since `gulp-cli` 3 `require()`s an ESM
gulpfile whose dependencies use top-level await.
