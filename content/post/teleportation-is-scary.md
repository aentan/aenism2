---
title: Teleportation is scary
description: Calmer pjax with transitions.
date: 2014-01-30
tags: ['pjax', 'ux']
topic: tech
preview_image: "warp.jpg"
---

I first came across _pjax_ (pushState + ajax) when I was working on a Rails 4 project which has [_Turbolinks_](https://github.com/rails/turbolinks). Turbolinks isn't pjax per se. It's similar and based on the same philosophy.

##  How pjax works

Instead of re-rendering a full page on every page request, pjax fetches only a fragment of the target page and uses that to replace its counterpart in the current DOM, thereby preserving the surrounding layout, scripts and style. Because the browser doesn't have to compute the scripts and styles, rendering time is next to nothing. New pages can also be strategically prefetched to make page changes as fast as DOM replacement. The address bar is also updated instantaneously with HTML5 History API.

Imagine a train which upon leaving the current station, instantly vanishes and reappears at the next station, jumping space and time. It would be an unsettling mode of transportation because you wouldn't have a sense of how you got there. _pjax feels like teleportation_. The abrupt change makes one feel disoriented. Transitions are necessary to make the change smoother.

## Transitions

### jquery-pjax

I'm using the [jquery-pjax](https://github.com/defunkt/jquery-pjax) plugin on this site. The plugin provides some handy APIs for we can make use of to add transitions between page loads.

Click around this site to see its cross fade transition.

This is the function for loading content via pjax. I used the `fragment` option to tell jquery-pjax to grab the `#main` element from the target DOM. If you are serving dynamic i.e. PHP or Ruby pages and can output layout-less content then you can don't need to use `fragment`.

```js
function pjaxLoad(url) {
  $.pjax({
    url: url,
    container: '#main',
    fragment: '#main'
  });
}
```

### Handling clicks

I then handle clicks on links I want to be pjaxified. It's also important to ensure the browser supports pjax with `$.support.pjax`. Otherwise the links will not be handled and will not be pjaxified.

```js
if ($.support.pjax) {
  $(document).on('click', '#articles article', function(e) {
    pjaxLoad($(this).find('a').attr('href'));
  });
  $(document).on('click', '#articles article h2 a', function(e) {
    e.preventDefault();
    pjaxLoad($(this).attr('href'));
  });
}
```

### Cross-fade

At this point, pjax works. But it feels like teleportation. We need to add transitions and this is how they will work.

{{%figure src="http://farm8.staticflickr.com/7351/12233353976_be0f0b31b8_o.jpg"%}}

1. Clone the element to be replaced.
2. Stack it on top of the original.
3. Replace the original (handled by plugin)
4. Fade out the clone.
5. Remove the clone.

At `pjax:start`, clone `#main` and then stack `#clone` above and prevent scrolling.

```js
$(document).on('pjax:start', function(e) {
  $main.after($main.clone().attr('id', 'clone'));
  $('#clone').css('z-index', 600);
  $body.css('overflow', 'hidden');
});
```

At `pjax:end`, fade out `#clone` and restore scrolling. If you have elements in the loaded DOM that has to be processed by JavaScript, be sure to reinitialize them here. I'm using [GSAP](http://www.greensock.com/gsap-js/) instead of jQuery for more performant animations but jQuery will work fine.

```js
$(document).on('pjax:end', function(e) {
  // Reinitialize JS here if necessary
  TweenLite.to($('#clone'), 0.8, {
    opacity: 0,
    onComplete: function() {
      $('#clone').remove();
      $('body').css('overflow', 'auto');
    }
  });
});
```

---

By manipulating `#main` and `#clone` at `pjax:start` and `pjax:end` you can easily create other kinds of transitions.

## Further Reading

* [Medium-style page transitions \| Codrops](http://tympanus.net/codrops/2013/10/30/medium-style-page-transition/)
* [Introducing Turbolinks for Rails 4.0 – GeekMonkey](http://geekmonkey.org/articles/28-introducing-turbolinks-for-rails-4-0)
