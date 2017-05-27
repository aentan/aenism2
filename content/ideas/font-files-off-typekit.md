---
title: Font files off Typekit
description: How to rip.
date: 2014-03-22
tags: ['typekit', 'fonts', 'desktop']
topic: tech
---

Update: I received a complaint from Adobe stating this article is violating the DMCA and is requiring the entire article be taken down. It's absurd. I'm not even sure if this workaround works anymore. In good faith I have edited some of the text.

I have a Typekit subscription and have full access to all their fonts. Adobe also recently introduced the ability to [sync fonts to the desktop](http://help.typekit.com/customer/portal/articles/1189216-introduction-to-desktop-fonts-from-typekit) via Creative Cloud for use in mockups, print design and word processing. It's really convenient because before this one has to have the actual font file installed to be able to design with it before using it on a web project.

Often people who use Typekit already have desktop licenses for fonts they want to use for a website. In fact Typekit was originally intended for this purpose. There are however those who signed up for Typekit because they want nicer typography for their blogs – solely for the web, and are thus unlikely to own desktop licenses of the the fonts they need. Typekit's desktop sync feature really helps designers to avoid using pirated fonts just so they can design with them before using them legitimately on production sites.

Unfortunately not all fonts on Typekit are available as desktop fonts. Yet or ever I don't know. I chose [_Rooney Sans Web_](https://typekit.com/fonts/rooney-sans) from Jan Fromm for a web project to match its rounded sprightly identity. I realized there is no desktop version I can sync to in Photoshop. I could have just designed the site in code but I didn't want to concede to the sense of defeat.

## Workaround

Typekit's implements `@font-face` with the [Data URI scheme](https://en.wikipedia.org/wiki/Data_URI_scheme) and fonts represented as `base64` with the mime type of `font/opentype`, as revealed by the web inspector in Safari.

{{%figure src="https://farm8.staticflickr.com/7010/13324188373_1bab757dee_b.jpg"%}}

The full base64 string contains all the information required to reconstruct the font file. Just feed the base64 into an online decoder that will output a binary file which you can then convert to your preferred font format.

---

This is great for using fonts unavailable as desktop fonts in the design phase but Typekit fonts are meant for web use and wouldn't be optimal for print use. I wouldn't recommend pirating Typekit fonts for print. Please support foundries and designers by purchasing the proper license for actual print use.