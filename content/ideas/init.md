---
title: Init
date: 2014-01-25
description: The making of.
tags: ["aenism"]
topic: news
---

It's still January, not too late to add having a new blog to my resolutions. My last decently successful blog *aentan.com* lasted just under three years. I made it to the Hacker News front page [a couple of times](https://www.hnsearch.com/search#request/all&q=aentan.com&sortby=points+desc), reposted an article to [Lifehacker](http://lifehacker.com/5899592/overthinking-and-your-child+like-mind) and landed various job opportunities. Problem was… maintaining a WordPress site in a shared hosting environment is annoying. Dreamhost was a hundred bucks a year. Didn't make sense anymore.

I tried to develop my own blog engine [*Pure*](http://writeonpure.com) and wrote a couple of articles on it. It was an ambitious project in which articles are visually composed like Keynote or Powerpoint slides. It's a Javascript monster. I spent a year developing it with my free time but it didn't stick with me. I had to rely on a browser to write and I couldn't easily write offline. Still feels like a lot of work. Putting Pure on Heroku is also expensive.

So here I am with a new setup. It's much better and it's free.

### Plumbing

I experimented with [*Jekyll*](http://jekyllrb.com) and it wasn't flexible enough for me. Then I discovered [*Middleman*](http://middlemanapp.com). Like Jekyll it's a Ruby gem but much more flexible. It's based on [Sinatra](http://www.sinatrarb.com), like a mini framework. I also get an asset pipeline which means I can serve minified and concatenated assets for better front-end performance. And since it's a static site, there's no server-side processing nor database and thus blazing fast.

I'm putting the entire blog and it's content in a public [repository](https://github.com/aentan/aenism) on Github. It makes sense because the content is public anyway. It also opens up the possibly of contributing articles by pull-request. Most important of all, Github is free. Github pages are served by Github's CDN which wouldn't have been trivial nor free to set up on my own hosting. Using a decentralized source-control system like Git means I'll always have my blog and content backed up locally. Even if Github dies tomorrow (pretty unlikely) I can easily redeploy the site somewhere else like Heroku.

### Frontend

Underneath the hood is [*Bootstrap*](http://getbootstrap.com) which makes the site adaptable to various devices and screen sizes. Blogs should be responsive. Reading Wordpress blogs isn't so nice on mobile devices. Using plugins to make it work was so ugly I didn't even bother to do it with my old blog. Bootstrap is a better way.

Besides jQuery which is pretty much a standard for interactivity on most sites, I'm using [*GSAP*](http://www.greensock.com/gsap-js/) for animating the masthead. It's 20&times; faster than jQuery and even faster than CSS3 animations and transitions. See the [speed comparison](http://www.greensock.com/js/speed.html).

If you've noticed the really fast loading of articles from the homepage, I'm using [*pjax*](http://pjax.heroku.com) – a portmanteau of _pushState_ + _ajax_. Makes the site real snappy. I also added a fade transition between pages for elegance.

### Design

Though I didn't continue using Pure I liked its simple content-centric design. Blogs are not marketing websites. The content should take center stage. Typography and whitespace are the chief elements of a good blog design. [*Medium*](https://medium.com) and [*ALA*](http://alistapart.com) embody this functional aesthetic well.

The typeface is the modern *Proxima Nova* for both headings and body text, implemented as a web font from [*Typekit*](https://typekit.com). Proxima Nova was designed by [Mark Simonson](http://www.marksimonson.com/fonts/view/proxima-nova).

The animated masthead at the top of the homepage represents my consciousness. It's some of the things that have inspired me and defined me – books, films, music, favorite things, brands, possessions. They'd give you a good idea of the person I am. I created a script called *Bokeh* and it uses GSAP for hardware-accelerated animation.

Article pages are inspired by the simplicity of [*Medium*](http://medium.com) and simpler.

### Third-party services

Instead of rolling my own commenting system, I rely on [*Disqus*](http://disqus.com) which has just the right features and looks good. Saves me time.

Cover images are pulled directly from [*Flickr*](http://www.flickr.com). The images articles are also hosted in my personal Flickr photostream. First, Flickr already provides different sizes of each image which saves me the effort of resizing. Secondly it's also a poor man's CDN.

What about you? If you've done cool stuff with your blog or site please share by posting a comment.