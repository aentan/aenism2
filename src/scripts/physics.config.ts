/**
 * Every number the field runs on, in one place.
 *
 * These are transcribed from the 2017 implementation, not re-derived. The feel
 * of the homepage is an accident of these exact values, so treat a change here
 * as a design change — not a tidy-up.
 */

export const FIELD = {
  /**
   * Zero on both axes. The field is a weightless tank, not a pile: cards drift
   * and are shoved, they never fall. This is the single most important number
   * in the file.
   */
  gravity: { x: 0, y: 0 },

  /**
   * A sealed box, seated just outside the viewport. Bouncier than anything
   * inside it (0.8 vs 0.5), so the boundary adds energy rather than soaking it.
   */
  walls: {
    thickness: 100,
    inset: 50,
    restitution: 0.8,
    friction: 1,
  },

  /** Shared by post cards and pagination pills. */
  body: {
    restitution: 0.5,
    friction: 0,
    frictionAir: 0.001,
    frictionStatic: 0,
    density: 1,
    /** Initial angle is uniform in +/- this, in radians. */
    spawnAngle: 1,
  },

  /**
   * The engine of the whole page. Three invisible circles with *no* air
   * friction, each taking a unit impulse on both axes every single frame. They
   * never come to rest, so the cards never do either.
   *
   * Drop `impulse` and the page goes still. Raise `frictionAir` above zero and
   * it stills more slowly, but it still stills.
   */
  disturber: {
    count: 3,
    radius: 16,
    impulse: 1,
    restitution: 0.5,
    friction: 0,
    frictionAir: 0,
    frictionStatic: 0,
    density: 1,
  },

  /** Rigid drag. No spring, no lag — you grab the card, not a rubber band. */
  drag: { stiffness: 1 },

  /**
   * Tap vs drag.
   *
   * The original compared press and release coordinates for exact equality,
   * which worked on touch more often than it looks: matter only updates
   * `mouse.absolute` on touchmove, so a crisp tap that never fires one leaves
   * the two readings identical. A tap that drifts enough to fire a touchmove
   * was the one that silently did nothing.
   *
   * A threshold covers both. 700ms rather than something tighter because a
   * deliberate press on a touchscreen is easily 400ms and should still open
   * the card; past this you were holding it, not tapping it.
   */
  tap: { maxDistancePx: 6, maxDurationMs: 700 },

  /**
   * The eye, to the millisecond. Click it and the wireframe is revealed for
   * exactly as long as the eye is open, then it auto-dismisses.
   *
   * The blink is deliberately asymmetric: four steps over 800ms to open
   * (200ms/frame), three over 1200ms to close (400ms/frame).
   */
  eye: {
    openMs: 800,
    holdMs: 3000,
    closeMs: 1200,
  },
} as const;

export type FieldConfig = typeof FIELD;
