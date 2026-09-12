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
import type { Body, Engine as MatterEngine } from "matter-js";

const { Body, Composite, Engine } = Matter;

import { FIELD } from "../src/scripts/physics.config.ts";
import {
  clampChamfer,
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
  cards: Body[];
  disturbers: Body[];
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

function run({ engine, disturbers }: Scene, frames: number): void {
  for (let i = 0; i < frames; i++) {
    kick(disturbers);
    Engine.update(engine, STEP_MS);
  }
}

const speed = (b: Body) => Math.hypot(b.velocity.x, b.velocity.y);

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

    // Without gravity the mean vertical drift is jitter, not descent.
    const mean = drift.reduce((a, b) => a + b, 0) / drift.length;
    assert.ok(Math.abs(mean) < 40, `cards drifted ${mean.toFixed(1)}px vertically`);
  });
});

describe("the box is sealed", () => {
  it("keeps every body inside, even when fired at a wall", () => {
    const s = scene();
    for (const [i, card] of s.cards.entries()) {
      const angle = (i / s.cards.length) * Math.PI * 2;
      Body.setVelocity(card, { x: Math.cos(angle) * 60, y: Math.sin(angle) * 60 });
    }
    run(s, 900);

    for (const body of [...s.cards, ...s.disturbers]) {
      const { x, y } = body.position;
      assert.ok(
        x > -200 && x < VIEW.width + 200 && y > -200 && y < VIEW.height + 200,
        `body escaped to ${x.toFixed(0)},${y.toFixed(0)}`,
      );
      assert.ok(Number.isFinite(x) && Number.isFinite(y), "body position went NaN");
    }
  });

  it("bounces the boundary harder than the bodies", () => {
    assert.ok(FIELD.walls.restitution > FIELD.body.restitution);
  });
});

describe("the disturbers never settle", () => {
  it("still carries speed after ten seconds", () => {
    const s = scene();
    run(s, 600);

    for (const d of s.disturbers) {
      assert.ok(speed(d) > 0.5, `a disturber slowed to ${speed(d).toFixed(3)}`);
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
    // The original required pixel-exact equality, so a tap never navigated on
    // touch. Anything at or under this threshold must still read as a tap.
    assert.ok(FIELD.tap.maxDistancePx >= 4, "too tight for a finger");
    assert.ok(FIELD.tap.maxDistancePx <= 12, "too loose — flings would navigate");
    assert.ok(FIELD.tap.maxDurationMs >= 200 && FIELD.tap.maxDurationMs <= 600);
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
