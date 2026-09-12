/**
 * World construction, with no DOM in sight.
 *
 * Kept separate from PhysicsField so the dynamics can be exercised headlessly —
 * see test/field.test.ts, which is the executable form of the interaction
 * contract rather than a set of unit tests for their own sake.
 */
import Matter from "matter-js";
import type { Body } from "matter-js";

const { Bodies } = Matter;

import { FIELD } from "./physics.config.ts";

export type Wall = "top" | "right" | "bottom" | "left";

export interface Size {
  width: number;
  height: number;
}

/** Uniform in +/- spread. */
export const rand = (spread: number) => Math.random() * spread * 2 - spread;

/** Coin-flip sign, exactly as the original: Math.round(random) * 2 - 1. */
export const sign = () => Math.round(Math.random()) * 2 - 1;

/**
 * A sealed box seated just outside the viewport. The horizontal walls overhang
 * by 2x the inset on each side so the corners can never open up under a
 * resize.
 */
export function createWalls({ width, height }: Size): Record<Wall, Body> {
  const { thickness, inset, restitution, friction } = FIELD.walls;
  const opts = { isStatic: true, restitution, friction };
  const over = inset * 4;

  return {
    bottom: Bodies.rectangle(width / 2, height + inset, width + over, thickness, opts),
    top: Bodies.rectangle(width / 2, -inset, width + over, thickness, opts),
    right: Bodies.rectangle(width + inset, height / 2, thickness, height + over, opts),
    left: Bodies.rectangle(-inset, height / 2, thickness, height + over, opts),
  };
}

/** Chamfer can never exceed half the shortest side, or matter produces NaNs. */
export function clampChamfer(radius: number, width: number, height: number): number {
  return Math.max(0, Math.min(radius, Math.min(width, height) / 2 - 1));
}

/**
 * A card, sized by whatever the CSS rendered. Spawned in the middle half of
 * the field at a random lean.
 */
export function createCard(
  field: Size,
  card: Size & { radius: number },
): Body {
  const chamfer = clampChamfer(card.radius, card.width, card.height);

  return Bodies.rectangle(
    field.width / 2 + rand(field.width / 4),
    field.height / 2 + rand(field.height / 4),
    card.width,
    card.height,
    {
      ...FIELD.body,
      chamfer: chamfer > 0 ? { radius: chamfer } : undefined,
      angle: rand(FIELD.body.spawnAngle),
    },
  );
}

/**
 * The three undamped circles that keep the field alive. Spawned inside the
 * field on *both* axes — the original used the viewport width for the vertical
 * spread, which on a wide screen could seat one below the floor.
 */
export function createDisturbers(field: Size): Body[] {
  const { count, radius, ...rest } = FIELD.disturber;

  return Array.from({ length: count }, () =>
    Bodies.circle(
      field.width / 2 + rand(field.width / 4),
      field.height / 2 + rand(field.height / 4),
      radius,
      { ...rest, angle: 0 },
    ),
  );
}

/** One frame's worth of agitation. Called before every engine step. */
export function kick(disturbers: Body[]): void {
  const force = FIELD.disturber.impulse;
  for (const d of disturbers) {
    d.force.x += sign() * force;
    d.force.y += sign() * force;
  }
}

/**
 * Safety net against tunnelling.
 *
 * The walls stop anything moving at a sane speed, but drag is rigid at
 * stiffness 1 — so a hard enough flick can carry a card through 100px of wall
 * in a single step, and once it is out there is nothing to bring it back. A
 * lost card takes its link with it.
 *
 * In normal play a body's centre never reaches the field edge (the walls stop
 * its *edge* first), so this only ever fires on an escape.
 */
export function contain(bodies: Body[], { width, height }: Size): void {
  for (const body of bodies) {
    const { x, y } = body.position;
    const clampedX = Math.min(Math.max(x, 0), width);
    const clampedY = Math.min(Math.max(y, 0), height);
    if (clampedX === x && clampedY === y) continue;

    Matter.Body.setPosition(body, { x: clampedX, y: clampedY });
    Matter.Body.setVelocity(body, {
      x: clampedX === x ? body.velocity.x : 0,
      y: clampedY === y ? body.velocity.y : 0,
    });
  }
}
