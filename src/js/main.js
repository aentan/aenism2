var $body;
var $HeroHeader;
var $IHeader;

var CWHeaderPosOrig;

$(function() {

  $body       = $("body");
  $HeroHeader    = $(".hero-header");

  $CWSection   = $(".client-work");
  $CWHeader   = $(".client-work-header");
  $IHeader    = $(".ideas-header");

  function adjustHeroHeader() {
    // Main Header
    if ($body.scrollTop() < 34) {
      $HeroHeader.height(90 - $body.scrollTop());
    } else {
      $HeroHeader.height('56px');
    }
    if ($body.scrollTop() > 0) {
      $HeroHeader.addClass('opaque');
    } else {
      $HeroHeader.removeClass();
    }
  };

  $('section > header').addClass('locked-bottom');

  function adjustSectionHeaders() {
    $('section').each(function() {
      // Section scrolled into viewport
      if ($(this).offset().top - $body.scrollTop() >= $(window).height() - $(this).find('header').height()) {
        $(this).find('header').addClass('locked-bottom');
      } else {
        $(this).find('header').removeClass('locked-bottom');
      }
      // Section scrolled to top
      // if ($(this).offset().top - $body.scrollTop() < 0) {
      //   $(this).find('header').addClass('locked-top');
      // } else {
      //   $(this).find('header').removeClass('locked-top');
      // }
    });
  };

  $(window).scroll($.throttle(10, adjustHeroHeader));
  $(window).scroll($.throttle(50, adjustSectionHeaders));

  adjustHeroHeader();
  adjustSectionHeaders();

  // Sticky Goto
  $(".goto nav").stick_in_parent({
    offset_top: 167
  });


  //initialize swiper
  var experienceSwiper = new Swiper ('.experience .swiper-container', {
    freeMode: true,
    freeModeSticky: true,
    freeModeMinimumVelocity: .05,
    freeModeMomentumRatio: .25,
    freeModeMomentumVelocityRatio: 1.5,
    slidesPerView: 'auto',
    slidesOffsetBefore: 30,
    slidesOffsetAfter: 30,
    spaceBetween: 15,
    grabCursor: true
  });
  var clientWorkSwiper = new Swiper ('.client-work .swiper-container', {
    freeMode: true,
    freeModeSticky: true,
    freeModeMinimumVelocity: .05,
    freeModeMomentumRatio: .25,
    freeModeMomentumVelocityRatio: 1.5,
    slidesPerView: 'auto',
    slidesOffsetBefore: 30,
    slidesOffsetAfter: 30,
    spaceBetween: 15,
    pagination: '.swiper-pagination',
    grabCursor: true
  });

  // Parallax
  $('.hero').parallaxScroll({
    friction: 0.5
  });
  $(window).trigger('resize');

  // Goto nav builder
  $('.single article').anchorific({
    navigation: '.goto nav'
  });

  // Scroll to
  $('a[href^="#"]').click(function(e) {
    e.preventDefault();
    var duration = Math.abs($(this.hash).offset().top - $body.scrollTop()) * .75;
    duration = (duration > 1000) ? 1000 : duration;
    var offset = this.hash == "#client-work" ? $(this).height() * -2 : $(this).height() * -1;
    $(window).stop(true).scrollTo(this.hash, {
      duration: duration,
      offset: offset,
      interrupt: false
    });
  });

});