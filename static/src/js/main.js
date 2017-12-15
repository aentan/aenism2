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
      height: window.innerHeight,
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
      friction:     2
  };
  World.add(world, [
    // ground
    ground    = Bodies.rectangle(window.innerWidth/2, window.innerHeight+50, window.innerWidth+200, 100, groundopts),
    // walls
    ceiling   = Bodies.rectangle(window.innerWidth/2, -50, window.innerWidth+200, 100, wallopts), // top
    wallRight = Bodies.rectangle(window.innerWidth+50, window.innerHeight/2, 100, window.innerHeight, wallopts), // right
    wallLeft  = Bodies.rectangle(-50, window.innerHeight/2, 100, window.innerHeight, wallopts) // left
  ]);

  var bodiesDom = document.querySelectorAll('.matter-body');
  var bodies = [];
  for (var i = 0, l = bodiesDom.length; i < l; i++) {
    if (bodiesDom[i].classList.contains('hot')) {
      frA = 0.1;
      oY = -40;
    } else {
      frA = 0;
      oY = 0;
    }
    if (bodiesDom[i].classList.contains('strip')) {
      // Strip
      var body = Bodies.rectangle(
        VIEW.centerX + Math.floor(Math.random() * VIEW.width/2) - VIEW.width/4,
        oY,
        VIEW.width * bodiesDom[i].offsetWidth / window.innerWidth,
        VIEW.height * bodiesDom[i].offsetHeight / window.innerHeight, {
          restitution:      0.05,
          friction:         2,
          frictionAir:      frA,
          frictionStatic:   20,
          density:          100,
          chamfer:          { radius: 4 },
          angle:            (Math.random() * 2.000) - 1.000
        }
      );
    } else if (bodiesDom[i].classList.contains('page-nav')) {
      // Nav
      var body = Bodies.circle(
        VIEW.centerX + Math.floor(Math.random() * VIEW.width/2) - VIEW.width/4,
        0,
        24, {
          restitution:      0.3,
          friction:         2,
          frictionAir:      0,
          frictionStatic:   2,
          density:          100,
          angle:            (Math.random() * 2.000) - 1.000
        }
      );
    }
    bodiesDom[i].id = body.id;
    bodies.push(body);
  }

  World.add(engine.world, bodies);

  // add gyro control
  var updateGravity = function(event) {
      var orientation = typeof window.orientation !== 'undefined' ? window.orientation : 0,
          gravity = engine.world.gravity;

      if (orientation === 0) {
          gravity.x = Common.clamp(event.gamma, -90, 90) / 90;
          gravity.y = Common.clamp(event.beta, -90, 90) / 90;
      } else if (orientation === 180) {
          gravity.x = Common.clamp(event.gamma, -90, 90) / 90;
          gravity.y = Common.clamp(-event.beta, -90, 90) / 90;
      } else if (orientation === 90) {
          gravity.x = Common.clamp(event.beta, -90, 90) / 90;
          gravity.y = Common.clamp(-event.gamma, -90, 90) / 90;
      } else if (orientation === -90) {
          gravity.x = Common.clamp(-event.beta, -90, 90) / 90;
          gravity.y = Common.clamp(event.gamma, -90, 90) / 90;
      }
  };

  window.addEventListener('deviceorientation', updateGravity);

  // Add mouse control

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

  var mouseX,
      mouseY,
      mouseXO,
      mouseYO,
      mouseXN,
      mouseYN;

  // Hover
  Events.on(mouseConstraint, "mousemove", function(e) {
    mouseX = e.mouse.absolute.x;
    mouseY = e.mouse.absolute.y;
    if (Query.point(bodies, { x: mouseX, y: mouseY }).length) {
      // remove exitsing hovers
      removeHovers();
      // apply new hover
      var underMouse = Query.point(bodies, { x: mouseX, y: mouseY })[0].id;
      document.getElementById(underMouse).className += " hover";
      document.body.style.cursor = "pointer";
    } else {
      removeHovers();
    }
  });

  function removeHovers() {
    var hovered = document.getElementsByClassName("hover");
    for (var i = 0; i < hovered.length; i++) {
      hovered[i].classList.remove("hover");
    }
    document.body.style.cursor = "auto";
  }

  // Press (1)
  Events.on(mouseConstraint, "mousedown", function(e) {
    mouseXO = e.mouse.absolute.x;
    mouseYO = e.mouse.absolute.y;
  });
  // Press (2), part 1 and 2 checks is not end of drag
  Events.on(mouseConstraint, "mouseup", function(e) {
    mouseXN = e.mouse.absolute.x;
    mouseYN = e.mouse.absolute.y;
    if ((mouseXO == mouseXN) && (mouseYO == mouseYN)) {
      if (Query.point(bodies, { x: mouseXN, y: mouseYN }).length) {
        var underMouse = Query.point(bodies, { x: mouseXN, y: mouseYN })[0].id;
      }
      if (underMouse) {
        // go to URL
        window.location.href = document.getElementById(underMouse).getAttribute("data-url");
      }
    }
    removeHovers();
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