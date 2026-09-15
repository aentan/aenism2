---
title: "Quietly broken"
description: "This site had stopped building and nobody noticed. Rebuilding it with an AI agent."
date: 2026-09-15
topic: tech
tags: ["astro", "performance", "ai"]
---

This site had been broken for over a year and I hadn't noticed. The published version kept serving — static files don't rot — but the thing that _made_ them had quietly stopped working. Gulp couldn't load its own config on a current Node. A missing manifest meant a clean build shipped a homepage with `<script src="/js/">` and no physics at all.

Nothing alerts you to this. The site looks fine. It only surfaces the next time you try to change something, which for me was years later.

## What was actually wrong

The audit turned up more than a dead build. Google Analytics was still loading on every page — 307 KB of it — for a Universal Analytics property that stopped collecting data in 2023. Two images and two embeds had been silently blocked for years because they were `http://` on an `https://` site. Thirty-seven of the fifty-five URLs in my own sitemap returned 404, because a list template had been an empty file since 2017. Forty-two megabytes of images sat in the repo that nothing referenced any more.

None of that was visible from the outside. All of it had been true for a long time.

## The rebuild

Hugo to [Astro](https://astro.build), TypeScript, no build step of my own. matter.js went from a 2017 CDN script to a bundled 0.20. Images moved to R2 and are resized at Cloudflare's edge — a 711 KB original comes back as 16 KB of AVIF, and nothing image-shaped lives in the repo. Embeds became facades that load the player only when you press play; an idle YouTube iframe was pulling 473 KB of JavaScript on pages nobody watched.

The numbers:

- Homepage payload: **~400 KB → 104 KB**
- Worst post: **2.8 MB and a 16.8s LCP → 1.3 MB and 2.3s**
- Time to first byte: **250–800ms → ~50ms**
- Repo: **46 MB → 3 MB**
- Lighthouse: **100 on accessibility, best practices and SEO.** Performance sits between 94 and 100 depending on how kind the network is being that minute

{{%figure src="https://media.aenism.com/rebuild-filmstrip.png" title="The same post, loading, before and after. The old build is served from localhost here — it gets a free head start on the HTML and still loses."%}}

The homepage still works the way it always has. Every post is still a rigid body you can grab and fling, the cards are still real links with real text, and the eye in the corner still opens to show you the wireframe underneath. That part I didn't want touched.

{{%figure src="https://media.aenism.com/physics-wireframe.png" title="The eye, open. Collision shapes, the three disturbers that keep the field from settling, and matter.js's own debug panel sitting on top of the logo."%}}

## Doing it with an agent

I did almost none of this by hand. [Claude Code](https://claude.com/claude-code) read the old code, wrote the audit, and did the migration, with me steering.

What surprised me was where it was useful. The obvious stuff — porting templates, converting SCSS — was fine but unremarkable. The valuable part was archaeology. It found the mixed-content images, the dead analytics, the 404ing sitemap. It reconstructed how the physics worked from a 349-line file I wrote a decade ago and then wrote tests to pin the behaviour so a later refactor couldn't sand it off.

It also got things wrong, confidently. It told me tapping a card had never worked on mobile, which was false — and the claim was quietly justifying a regression _it_ had introduced. It trusted Cloudflare's documentation over a real request twice, and both times the documentation was wrong. Every useful catch came from something being measured rather than assumed.

That's the part worth keeping, I think. Not that the machine is right, but that it's tireless about checking — which is exactly the work that lets a site rot quietly for a year in the first place.
