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
    Events    = Matter.Events,
    MouseConstraint = Matter.MouseConstraint,
    Mouse     = Matter.Mouse;

// create engine
var engine = Engine.create(),
    world = engine.world;

// create renderer
var render = Render.create({
  engine: engine,
  element: document.getElementById("debug"),
  options: {
    width: window.innerWidth,
    height: window.innerWidth,
    background: 'transparent',
    wireframeBackground: 'transparent',
    hasBounds: false,
    enabled: true,
    wireframes: true,
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

// Render.run(render);

// create runner
var runner = Runner.create();
Runner.run(runner, engine);

// add walls
var wallopts = {
    isStatic: true,
    restitution: 0.2,
    friction: 1
};
var groundopts = {
    isStatic: true,
    restitution: 0,
    friction: 1
};
World.add(world, [
  // ground
  Bodies.rectangle(window.innerWidth/2, window.innerHeight+50, window.innerWidth, 100, groundopts),
  // walls
  Bodies.rectangle(window.innerWidth/2, -50, window.innerWidth, 100, wallopts), // top
  Bodies.rectangle(window.innerWidth+50, window.innerHeight/2, 100, window.innerHeight, wallopts), // right
  Bodies.rectangle(-50, window.innerHeight/2, 100, window.innerHeight, wallopts) // left
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
      angle:            (Math.random() * 2.000) - 1.000,
    }
  );
  bodiesDom[i].id = body.id;
  bodies.push(body);
}
World.add(engine.world, bodies);

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

// clicking to post
document.body.addEventListener('click', function(e) {
  var clickedBodyId = Matter.Query.point(bodies, { x: e.clientX, y: e.clientY })[0].id;
  window.location.href = document.getElementById(clickedBodyId).getAttribute("data-url");
});

window.requestAnimationFrame(update);

function update() {
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