/**
 * The interaction contract, executable.
 *
 * These are not unit tests for their own sake. Each one pins a behaviour that
 * the 2017 site had and that a well-meaning refactor would quietly remove —
 * the weightlessness, the sealed box, and above all the fact that the field
 * never comes to rest. If one of these fails, the page stopped feeling right.
 *
 *   node --test --experimental-strip-types test/field.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import Matter from "matter-js";
import type { Body as MatterBody, Engine as MatterEngine } from "matter-js";

const { Body, Composite, Engine } = Matter;

import { FIELD } from "../src/scripts/physics.config.ts";
import {
  clampChamfer,
  contain,
  createCard,
  createDisturbers,
  createWalls,
  kick,
} from "../src/scripts/world.ts";

const VIEW = { width: 1440, height: 900 };
const CARD = { width: 260, height: 80, radius: 24 };
const STEP_MS = 1000 / 60;

interface Scene {
  engine: MatterEngine;
  cards: MatterBody[];
  disturbers: MatterBody[];
}

function scene({ withDisturbers = true, cardCount = 8 } = {}): Scene {
  const engine = Engine.create({ gravity: { ...FIELD.gravity } });

  Composite.add(engine.world, Object.values(createWalls(VIEW)));

  const cards = Array.from({ length: cardCount }, () => createCard(VIEW, CARD));
  Composite.add(engine.world, cards);

  const disturbers = withDisturbers ? createDisturbers(VIEW) : [];
  if (disturbers.length) Composite.add(engine.world, disturbers);

  return { engine, cards, disturbers };
}

/** `net: false` exercises the walls alone, with no containment behind them. */
function run(s: Scene, frames: number, { net = true } = {}): void {
  const { engine, disturbers } = s;
  for (let i = 0; i < frames; i++) {
    kick(disturbers);
    Engine.update(engine, STEP_MS);
    if (net) contain([...s.cards, ...disturbers], VIEW);
  }
}

function fireOutward(s: Scene, speed: number): void {
  for (const [i, card] of s.cards.entries()) {
    const angle = (i / s.cards.length) * Math.PI * 2;
    Body.setVelocity(card, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
  }
}

const inside = (b: MatterBody, slack: number) =>
  b.position.x > -slack && b.position.x < VIEW.width + slack &&
  b.position.y > -slack && b.position.y < VIEW.height + slack;

const speed = (b: MatterBody) => Math.hypot(b.velocity.x, b.velocity.y);

describe("the field is weightless", () => {
  it("has zero gravity on both axes", () => {
    assert.equal(FIELD.gravity.x, 0);
    assert.equal(FIELD.gravity.y, 0);
  });

  it("does not let cards fall", () => {
    const s = scene({ withDisturbers: false });
    const before = s.cards.map((c) => c.position.y);
    run(s, 300);
    const drift = s.cards.map((c, i) => c.position.y - before[i]!);

    // Without gravity the drift is a random walk, not a descent. Gravity
    // would march every card to the floor; bound this well below that but
    // loosely enough that jitter alone can never trip it.
    const mean = drift.reduce((a, b) => a + b, 0) / drift.length;
    assert.ok(
      Math.abs(mean) < VIEW.height / 6,
      `cards drifted ${mean.toFixed(1)}px vertically — is gravity back?`,
    );
  });
});

describe("the box is sealed", () => {
  it("holds on the walls alone at ordinary speeds", () => {
    // No safety net here: this is the walls doing their job.
    const s = scene();
    fireOutward(s, 20);
    run(s, 900, { net: false });

    for (const body of [...s.cards, ...s.disturbers]) {
      assert.ok(inside(body, 200), `body escaped to ${body.position.x.toFixed(0)},${body.position.y.toFixed(0)}`);
      assert.ok(Number.isFinite(body.position.x), "body position went NaN");
    }
  });

  it("catches a card flung hard enough to tunnel", () => {
    // Drag is rigid at stiffness 1, so a hard flick really can carry a card
    // through 100px of wall in one step. Without the net it is gone for good,
    // and its link with it.
    const s = scene();
    fireOutward(s, 220);
    run(s, 600);

    for (const body of [...s.cards, ...s.disturbers]) {
      assert.ok(inside(body, 1), `body ended up at ${body.position.x.toFixed(0)},${body.position.y.toFixed(0)}`);
    }
  });

  it("leaves bodies alone while they are inside", () => {
    // The net must never fire in normal play — the walls stop a card's edge
    // long before its centre reaches the boundary.
    const s = scene();
    run(s, 600);
    const before = s.cards.map((c) => ({ ...c.position }));
    contain(s.cards, VIEW);
    for (const [i, c] of s.cards.entries()) {
      assert.deepEqual({ ...c.position }, before[i]);
    }
  });

  it("bounces the boundary harder than the bodies", () => {
    assert.ok(FIELD.walls.restitution > FIELD.body.restitution);
  });
});

describe("the disturbers never settle", () => {
  it("is still travelling after ten seconds", () => {
    const s = scene();
    run(s, 600);

    // Distance covered over a window, not speed at one instant — a disturber
    // caught mid-collision reads near zero and says nothing about whether the
    // field has settled.
    //
    // Liveness is a property of the set, not of each body at every moment: one
    // disturber can sit briefly pinned between a card and a wall while the
    // others carry the field. Measured over 40 trials the slowest covered 47px
    // in two seconds at worst, but the tail goes lower — asserting per-body
    // here failed roughly one run in fifty.
    const from = s.disturbers.map((d) => ({ ...d.position }));
    run(s, 120);
    const travelled = s.disturbers.map((d, i) =>
      Math.hypot(d.position.x - from[i]!.x, d.position.y - from[i]!.y),
    );

    const total = travelled.reduce((a, b) => a + b, 0);
    assert.ok(total > 60, `the disturbers covered ${total.toFixed(1)}px between them in two seconds`);

    // Pinned is fine; stopped is not. Over a longer window every one of them
    // has to have gone somewhere.
    run(s, 600);
    for (const [i, d] of s.disturbers.entries()) {
      const overall = Math.hypot(d.position.x - from[i]!.x, d.position.y - from[i]!.y);
      assert.ok(overall > 20, `a disturber moved ${overall.toFixed(1)}px in twelve seconds`);
    }
  });

  it("has no air friction, which is what makes that true", () => {
    assert.equal(FIELD.disturber.frictionAir, 0);
    assert.ok(FIELD.disturber.impulse > 0);
  });

  it("keeps shoving the cards around", () => {
    const s = scene();
    const before = s.cards.map((c) => ({ ...c.position }));
    run(s, 600);

    const moved = s.cards.filter((c, i) => {
      const p = before[i]!;
      return Math.hypot(c.position.x - p.x, c.position.y - p.y) > 20;
    });
    assert.ok(
      moved.length >= s.cards.length / 2,
      `only ${moved.length}/${s.cards.length} cards were disturbed`,
    );
  });
});

describe("the field does not run away", () => {
  it("stays in equilibrium over a long session", () => {
    // The disturbers take on energy every frame and never shed it to air
    // friction, so the only thing holding the field together is collision
    // damping. Three simulated minutes is enough to catch a runaway.
    const s = scene();
    run(s, 60 * 60 * 3);

    const fastest = Math.max(...s.disturbers.map(speed));
    assert.ok(fastest < 60, `disturbers accelerated to ${fastest.toFixed(1)}`);

    for (const body of [...s.cards, ...s.disturbers]) {
      const { x, y } = body.position;
      assert.ok(
        x > -50 && x < VIEW.width + 50 && y > -50 && y < VIEW.height + 50,
        `body drifted out to ${x.toFixed(0)},${y.toFixed(0)} after three minutes`,
      );
    }
  });
});

describe("the cards themselves do damp", () => {
  it("comes to rest when nothing is kicking them", () => {
    const s = scene({ withDisturbers: false });
    for (const card of s.cards) {
      Body.setVelocity(card, { x: 12, y: -9 });
    }
    run(s, 2400);

    const fastest = Math.max(...s.cards.map(speed));
    assert.ok(fastest < 6, `cards still moving at ${fastest.toFixed(2)} after 40s`);
    assert.ok(FIELD.body.frictionAir > 0, "card damping is what makes the pause readable");
  });
});

describe("geometry comes from CSS", () => {
  it("matches the rendered card size", () => {
    const body = createCard(VIEW, CARD);
    const width = body.bounds.max.x - body.bounds.min.x;
    const height = body.bounds.max.y - body.bounds.min.y;
    // Cards spawn at a random lean, so compare against the diagonal envelope.
    const diagonal = Math.hypot(CARD.width, CARD.height);
    assert.ok(width <= diagonal + 1 && height <= diagonal + 1);
    assert.ok(width >= Math.min(CARD.width, CARD.height) - 1);
  });

  it("never lets a corner radius exceed half the shortest side", () => {
    assert.equal(clampChamfer(24, 260, 80), 24);
    assert.equal(clampChamfer(24, 64, 64), 24);
    // A radius larger than the box would make matter emit NaN vertices.
    assert.equal(clampChamfer(90, 200, 70), 34);
    assert.equal(clampChamfer(0, 200, 70), 0);
  });
});

describe("tap is distinguishable from drag", () => {
  it("allows a few pixels of tremor", () => {
    // The original compared press and release for exact equality. A crisp
    // tap passed that (matter only updates mouse.absolute on touchmove); one
    // that drifted did not. Anything under this threshold must read as a tap.
    assert.ok(FIELD.tap.maxDistancePx >= 4, "too tight for a finger");
    assert.ok(FIELD.tap.maxDistancePx <= 12, "too loose — flings would navigate");
    assert.ok(FIELD.tap.maxDurationMs >= 400 && FIELD.tap.maxDurationMs <= 900);
  });
});

describe("the eye choreography", () => {
  it("shows the wireframe only while the eye is open", () => {
    const { openMs, holdMs, closeMs } = FIELD.eye;

    // Reveal lands exactly as the lid finishes opening; dismissal exactly as
    // it finishes closing.
    assert.equal(openMs, 800);
    assert.equal(openMs + holdMs, 3800);
    assert.equal(openMs + holdMs + closeMs, 5000);
  });

  it("blinks open faster than it closes", () => {
    assert.ok(FIELD.eye.openMs < FIELD.eye.closeMs);
  });
});
