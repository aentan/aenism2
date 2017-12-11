function makeWorld() {

  // Should reappear
  document.getElementsByTagName("main")[0].style.visibility = "visible";

  /** Set up relative positions and scales **/
  var VIEW = {};
  VIEW.width    = window.innerWidth;
  VIEW.height   = window.innerHeight;
  VIEW.centerX  = VIEW.width / 2;
  VIEW.centerY  = VIEW.height / 2;
  VIEW.offsetX  = VIEW.width / 2;
  VIEW.offsetY  = VIEW.height / 2;

  // Matter.js module aliases
  var Engine    = Matter.Engine,
      Render    = Matter.Render,
      Runner    = Matter.Runner,
      Common    = Matter.Common,
      World     = Matter.World,
      Bodies    = Matter.Bodies,
      Body      = Matter.Body,
      Events    = Matter.Events,
      Query     = Matter.Query,
      MouseConstraint = Matter.MouseConstraint,
      Mouse     = Matter.Mouse;

  // create engine
  var engine    = Engine.create(),
      world     = engine.world;

  // create renderer
  var render = Render.create({
    engine: engine,
    element: document.getElementById("debug"),
    options: {
      width: window.innerWidth,
      height: window.innerWidth,
      background: 'transparent', // transparent to hide
      wireframeBackground: 'transparent', // transparent to hide
      hasBounds: false,
      enabled: true,
      wireframes: false,
      showSleeping: true,
      showDebug: false,
      showBroadphase: false,
      showBounds: false,
      showVelocity: false,
      showCollisions: false,
      showAxes: false,
      showPositions: false,
      showAngleIndicator: false,
      showIds: false,
      showShadows: false
    }
  });

  // Disable to hide debug
  Render.run(render);

  // create runner
  var runner = Runner.create();
  Runner.run(runner, engine);

  var ceiling,
      wallLeft,
      wallRight,
      ground;

  // add walls
  var wallopts = {
      isStatic:     true,
      restitution:  0.2,
      friction:     1
  };
  var groundopts = {
      isStatic:     true,
      restitution:  0,
      friction:     1
  };
  World.add(world, [
    // ground
    ground    = Bodies.rectangle(window.innerWidth/2, window.innerHeight+50, window.innerWidth+200, 100, groundopts),
    // walls
    ceiling   = Bodies.rectangle(window.innerWidth/2, -50, window.innerWidth+200, 100, wallopts), // top
    wallRight = Bodies.rectangle(window.innerWidth+50, window.innerHeight/2, 100, window.innerHeight, wallopts), // right
    wallLeft  = Bodies.rectangle(-50, window.innerHeight/2, 100, window.innerHeight, wallopts) // left
  ]);

  var bodiesDom = document.querySelectorAll('.strip');
  var bodies = [];
  for (var i = 0, l = bodiesDom.length; i < l; i++) {
    var body = Bodies.rectangle(
      VIEW.centerX + Math.floor(Math.random() * VIEW.width/2) - VIEW.width/4,
      0,
      VIEW.width * bodiesDom[i].offsetWidth / window.innerWidth,
      VIEW.height * bodiesDom[i].offsetHeight / window.innerHeight, {
        restitution:      0.2,
        friction:         1,
        frictionStatic:   1,
        density:          1,
        chamfer:          { radius: 4 },
        angle:            (Math.random() * 2.000) - 1.000
      }
    );
    bodiesDom[i].id = body.id;
    bodies.push(body);
  }
  World.add(engine.world, bodies);

  var navsDom = document.querySelectorAll('.page-nav');
  var navs = [];
  for (var i = 0, l = navsDom.length; i < l; i++) {
    var nav = Bodies.circle(
      VIEW.centerX + Math.floor(Math.random() * VIEW.width/2) - VIEW.width/4,
      0,
      24, {
        restitution:      0.2,
        friction:         1,
        frictionStatic:   1,
        density:          1,
        angle:            (Math.random() * 2.000) - 1.000
      }
    );
    navsDom[i].id = nav.id;
    navs.push(nav);
  }
  World.add(engine.world, navs);

  // add mouse control
  var mouse = Mouse.create(render.canvas),
    mouseConstraint = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 1,
        render: {
          visible: false
        }
      }
    });

  World.add(engine.world, mouseConstraint);

  // keep the mouse in sync with rendering
  render.mouse = mouse;

  ////// TODO drag-friendly click event
  // clicking to post
  document.body.addEventListener('mousedown', function(e) {
    mouseXO = e.clientX;
    mouseYO = e.clientY;
  });

  document.body.addEventListener('mouseup', function(e) {
    if ((mouseXO == e.clientX) && (mouseYO == e.clientY)) {
      if (Query.point(bodies, { x: e.clientX, y: e.clientY }).length) {
        var underMouse = Query.point(bodies, { x: e.clientX, y: e.clientY })[0].id;
        window.location.href = document.getElementById(underMouse).getAttribute("data-url");
      }
      if (Query.point(navs, { x: e.clientX, y: e.clientY }).length) {
        var underMouse = Query.point(navs, { x: e.clientX, y: e.clientY })[0].id;
        if (document.getElementById(underMouse).getAttribute("data-url")) {
          window.location.href = document.getElementById(underMouse).getAttribute("data-url");
        } else {
          // show help
        }
      }
    }
  });

  window.requestAnimationFrame(update);

  function update() {

    // strips
    for (var i = 0, l = bodiesDom.length; i < l; i++) {
      var bodyDom = bodiesDom[i];
      var body = null;
      for (var j = 0, k = bodies.length; j < k; j++) {
        if (bodies[j].id == bodyDom.id) {
          body = bodies[j];
          break;
        }
      }

      if (body === null) continue;

      bodyDom.style.transform = "translate( " +
        (body.position.x - bodyDom.offsetWidth / 2) +
        "px, " +
        (body.position.y - bodyDom.offsetHeight / 2) +
        "px )";
      bodyDom.style.transform += "rotate( " + body.angle + "rad )";
    }

    // navs
    for (var i = 0, l = navsDom.length; i < l; i++) {
      var navDom = navsDom[i];
      var nav = null;
      for (var j = 0, k = navs.length; j < k; j++) {
        if (navs[j].id == navDom.id) {
          nav = navs[j];
          break;
        }
      }

      if (nav === null) continue;

      navDom.style.transform = "translate( " +
        (nav.position.x - navDom.offsetWidth / 2) +
        "px, " +
        (nav.position.y - navDom.offsetHeight / 2) +
        "px )";
      navDom.style.transform += "rotate( " + nav.angle + "rad )";
    }
    window.requestAnimationFrame(update);
  }

}

makeWorld();

function debounce(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    }, wait);
    if (immediate && !timeout) func.apply(context, args);
  };
}

var refreshWorld = debounce(function() {
  location.reload();
}, 500);

window.addEventListener('resize', refreshWorld);