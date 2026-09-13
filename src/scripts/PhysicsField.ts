/**
 * The field.
 *
 * matter.js runs headless; the DOM is the renderer. Every frame each body's
 * position and angle is written onto a real <a> as a CSS transform, so the
 * cards you fling are live HTML with real text, real links, real focus order.
 *
 * The canvas exists only as a wireframe overlay, and only while the eye is
 * open. It is constructed on reveal and destroyed on dismiss.
 */
import {
  Body,
  Composite,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  Query,
  Render,
  Runner,
  type Body as MatterBody,
  type Engine as MatterEngine,
  type Render as MatterRender,
  type Runner as MatterRunner,
} from "matter-js";

import { FIELD } from "./physics.config.ts";
import {
  contain,
  createCard,
  createDisturbers,
  createWalls,
  kick,
  type Wall,
} from "./world.ts";

export interface PhysicsFieldOptions {
  /** Fullscreen container. Becomes the coordinate origin for the whole world. */
  root: HTMLElement;
  /** Elements to embody. Sized from CSS, so CSS stays the source of truth. */
  cards: HTMLElement[];
  /** The eye. Optional — the field runs fine without it. */
  eye?: HTMLElement | null;
  /** Where the debug wireframe canvas is mounted. */
  debugMount?: HTMLElement | null;
}

export class PhysicsField {
  private readonly root: HTMLElement;
  private readonly eye: HTMLElement | null;
  private readonly debugMount: HTMLElement | null;

  private engine!: MatterEngine;
  private runner!: MatterRunner;
  private mouse!: Mouse;
  private mouseConstraint!: MouseConstraint;

  /** The binding. Explicit, typed, and impossible to break with a `===`. */
  private readonly elementOf = new Map<MatterBody, HTMLElement>();
  private readonly interactive: MatterBody[] = [];
  private readonly disturbers: MatterBody[] = [];
  private readonly walls = new Map<Wall, MatterBody>();

  private width = 0;
  private height = 0;

  private hovered: HTMLElement | null = null;
  private pressedAt: { x: number; y: number; t: number } | null = null;
  private wasDrag = false;
  private navigating = false;

  private render: MatterRender | null = null;
  private eyeTimers: number[] = [];
  private eyeOpen = false;

  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor(private readonly options: PhysicsFieldOptions) {
    this.root = options.root;
    this.eye = options.eye ?? null;
    this.debugMount = options.debugMount ?? null;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  start(): void {
    this.measure();

    this.engine = Engine.create({ gravity: { ...FIELD.gravity } });
    this.runner = Runner.create();

    this.buildWalls();
    this.buildBodies();
    this.buildDisturbers();
    this.buildMouse();

    Events.on(this.engine, "beforeUpdate", this.kickDisturbers);
    Events.on(this.engine, "afterUpdate", this.paint);

    // Paint once before the first step so nothing is ever shown at 0,0.
    this.paint();
    this.root.classList.add("is-live");

    Runner.run(this.runner, this.engine);

    this.bindPointer();
    this.bindEye();
    this.bindResize();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    Runner.stop(this.runner);
    Events.off(this.engine, "beforeUpdate", this.kickDisturbers);
    Events.off(this.engine, "afterUpdate", this.paint);

    this.teardownRender();
    this.clearEyeTimers();
    this.resizeObserver?.disconnect();

    this.root.removeEventListener("pointerdown", this.onPointerDown);
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerup", this.onPointerUp);
    this.root.removeEventListener("pointercancel", this.onPointerUp);
    this.root.removeEventListener("pointerleave", this.onPointerLeave);
    this.root.removeEventListener("click", this.onClick, true);
    this.eye?.removeEventListener("click", this.onEyeClick);
    document.removeEventListener("visibilitychange", this.onVisibility);

    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);

    this.root.classList.remove("is-live");
    for (const el of this.elementOf.values()) {
      el.style.translate = "";
      el.style.rotate = "";
    }
  }

  // ── world construction ─────────────────────────────────────────────────

  private get size() {
    return { width: this.width, height: this.height };
  }

  private measure(): void {
    const rect = this.root.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
  }

  private buildWalls(): void {
    for (const [name, body] of Object.entries(createWalls(this.size)) as [Wall, MatterBody][]) {
      this.walls.set(name, body);
      Composite.add(this.engine.world, body);
    }
  }

  /**
   * Bodies are sized from the rendered element — width, height and corner
   * radius all come from CSS. Restyle a card and the physics follows.
   */
  private buildBodies(): void {
    for (const el of this.options.cards) {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (!width || !height) continue;

      const radius = parseFloat(getComputedStyle(el).borderRadius) || 0;
      const body = createCard(this.size, { width, height, radius });

      this.elementOf.set(body, el);
      this.interactive.push(body);
      Composite.add(this.engine.world, body);
    }
  }

  private buildDisturbers(): void {
    for (const body of createDisturbers(this.size)) {
      this.disturbers.push(body);
      Composite.add(this.engine.world, body);
    }
  }

  private buildMouse(): void {
    this.mouse = Mouse.create(this.root);

    // matter binds a non-passive wheel handler that swallows scroll. The field
    // never scrolls, but other pages might embed it — give the wheel back.
    const wheel = (this.mouse as unknown as { mousewheel: EventListener }).mousewheel;
    if (wheel) {
      this.root.removeEventListener("wheel", wheel);
      this.root.removeEventListener("mousewheel", wheel);
      this.root.removeEventListener("DOMMouseScroll", wheel);
    }

    this.mouseConstraint = MouseConstraint.create(this.engine, {
      mouse: this.mouse,
      constraint: { stiffness: FIELD.drag.stiffness, render: { visible: false } },
    });
    Composite.add(this.engine.world, this.mouseConstraint);
  }

  // ── the loop ───────────────────────────────────────────────────────────

  /**
   * The perpetual-motion source. Every frame, every disturber takes a unit
   * impulse on both axes in one of four diagonal directions. With no air
   * friction they never settle — and so the cards never settle either.
   */
  private readonly kickDisturbers = (): void => {
    kick(this.disturbers);
  };

  private readonly paint = (): void => {
    contain([...this.interactive, ...this.disturbers], this.size);

    for (const [body, el] of this.elementOf) {
      const x = body.position.x - el.offsetWidth / 2;
      const y = body.position.y - el.offsetHeight / 2;
      // Individual transform properties, not `transform`: this loop rewrites
      // position every frame, so anything packed into the same declaration
      // could never be transitioned. Leaving `scale` free lets CSS own the
      // hover pull. They compose as translate -> rotate -> scale, which is the
      // order we want anyway.
      el.style.translate = `${x}px ${y}px`;
      el.style.rotate = `${body.angle}rad`;
    }
  };

  // ── pointer: hover, drag, tap ──────────────────────────────────────────

  private bindPointer(): void {
    this.root.addEventListener("pointerdown", this.onPointerDown);
    this.root.addEventListener("pointermove", this.onPointerMove);
    this.root.addEventListener("pointerup", this.onPointerUp);
    this.root.addEventListener("pointercancel", this.onPointerUp);
    this.root.addEventListener("pointerleave", this.onPointerLeave);
    // Capture phase: decide drag-vs-tap before the anchor's default fires.
    this.root.addEventListener("click", this.onClick, true);
  }

  private elementAt(x: number, y: number): HTMLElement | null {
    const hit = Query.point(this.interactive, { x, y })[0];
    return hit ? this.elementOf.get(hit) ?? null : null;
  }

  private setHover(el: HTMLElement | null): void {
    if (el === this.hovered) return;
    this.hovered?.classList.remove("is-hover");
    el?.classList.add("is-hover");
    this.hovered = el;
    this.root.classList.toggle("is-pointing", el !== null);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressedAt = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    this.wasDrag = false;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") {
      this.setHover(this.elementAt(event.clientX, event.clientY));
    }
    if (!this.pressedAt) return;
    if (this.distanceFrom(event) > FIELD.tap.maxDistancePx) this.wasDrag = true;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    let tapped: HTMLElement | null = null;

    if (this.pressedAt) {
      const moved = this.distanceFrom(event);
      const held = event.timeStamp - this.pressedAt.t;
      // Keep any latch set during the move: a finger that wanders out and
      // comes back has a small net displacement but was still a drag.
      this.wasDrag =
        this.wasDrag || moved > FIELD.tap.maxDistancePx || held > FIELD.tap.maxDurationMs;
      if (!this.wasDrag) tapped = this.elementAt(event.clientX, event.clientY);
    }

    this.pressedAt = null;

    if (event.pointerType !== "mouse") {
      this.setHover(null);
      // matter calls preventDefault() on touchstart and touchend, which
      // cancels the click the browser would otherwise synthesise — so the
      // anchor never fires and a tap goes nowhere. The 2017 code navigated by
      // hand from matter's own mouseup for exactly this reason.
      if (tapped) this.follow(tapped);
    }
  };

  /** Explicit navigation, for the pointers whose click never arrives. */
  private follow(el: HTMLElement): void {
    const href = el.getAttribute("href");
    if (!href) return;
    this.navigating = true;
    window.location.assign(href);
  }

  private readonly onPointerLeave = (): void => {
    this.setHover(null);
  };

  /**
   * Cards are real anchors, so click, Enter and middle-click all work for
   * free. The only thing to suppress is the click that ends a fling.
   */
  private readonly onClick = (event: MouseEvent): void => {
    if (this.wasDrag || this.navigating) {
      event.preventDefault();
      event.stopPropagation();
      this.wasDrag = false;
    }
  };

  private distanceFrom(event: PointerEvent): number {
    if (!this.pressedAt) return 0;
    return Math.hypot(event.clientX - this.pressedAt.x, event.clientY - this.pressedAt.y);
  }

  // ── the eye ────────────────────────────────────────────────────────────

  private bindEye(): void {
    this.eye?.addEventListener("click", this.onEyeClick);
  }

  private clearEyeTimers(): void {
    for (const id of this.eyeTimers) window.clearTimeout(id);
    this.eyeTimers = [];
  }

  private after(ms: number, fn: () => void): void {
    this.eyeTimers.push(window.setTimeout(fn, ms));
  }

  private readonly onEyeClick = (): void => {
    // Clearing *every* timer is the fix: the original left the open timer
    // running, so dismissing mid-blink latched the wireframe on for good.
    this.clearEyeTimers();
    if (!this.eye) return;

    if (this.eyeOpen) {
      this.eyeOpen = false;
      this.eye.className = "eye is-closing";
      this.eye.setAttribute("aria-pressed", "false");
      this.after(FIELD.eye.closeMs, () => this.teardownRender());
      return;
    }

    const { openMs, holdMs, closeMs } = FIELD.eye;
    this.eyeOpen = true;
    this.eye.className = "eye is-opening";
    this.eye.setAttribute("aria-pressed", "true");

    this.after(openMs, () => this.setupRender());
    this.after(openMs + holdMs, () => {
      this.eyeOpen = false;
      if (this.eye) {
        this.eye.className = "eye is-closing";
        this.eye.setAttribute("aria-pressed", "false");
      }
    });
    this.after(openMs + holdMs + closeMs, () => this.teardownRender());
  };

  private setupRender(): void {
    if (this.render || this.destroyed) return;
    const mount = this.debugMount ?? this.root;

    // `engine` is deliberately NOT passed in here. Render.create runs its
    // options through Common.extend, which deep-clones any plain object — and
    // a running engine's pair table holds bodies whose `parent` points at
    // themselves, so the clone recurses until the stack blows. matter gets
    // away with it because it expects Render.create before the world is
    // populated; this one is built 800ms in, on the eye. Render.create assigns
    // `render.engine = options.engine` right after the extend anyway, so
    // setting it afterwards is equivalent and cheap.
    this.render = Render.create({
      element: mount,
      options: {
        width: this.width,
        height: this.height,
        background: "transparent",
        wireframeBackground: "transparent",
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        wireframes: true,
        showSleeping: true,
        showDebug: true,
        showBroadphase: true,
        showBounds: true,
        showVelocity: true,
        showCollisions: true,
        showPositions: true,
        showAngleIndicator: true,
        showIds: true,
        showAxes: false,
        hasBounds: true,
      },
    });
    this.render.engine = this.engine;
    this.render.canvas.classList.add("field-wireframe");
    this.render.mouse = this.mouse;
    Render.run(this.render);
  }

  private teardownRender(): void {
    if (!this.render) return;
    Render.stop(this.render);
    this.render.canvas.remove();
    this.render.textures = {};
    this.render = null;
  }

  // ── resize & visibility ────────────────────────────────────────────────

  private bindResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.reflow());
    this.resizeObserver.observe(this.root);
  }

  /**
   * Move the walls and carry the bodies with the viewport. The original
   * reloaded the page — which on iOS meant the address bar collapsing could
   * reload the site out from under a drag.
   */
  private reflow(): void {
    const previousW = this.width;
    const previousH = this.height;
    this.measure();
    if (!previousW || !previousH) return;
    if (this.width === previousW && this.height === previousH) return;

    const scaleX = this.width / previousW;
    const scaleY = this.height / previousH;

    const { inset } = FIELD.walls;
    const w = this.width;
    const h = this.height;
    const place = (name: Wall, x: number, y: number) => {
      const body = this.walls.get(name);
      if (body) Body.setPosition(body, { x, y });
    };
    place("bottom", w / 2, h + inset);
    place("top", w / 2, -inset);
    place("right", w + inset, h / 2);
    place("left", -inset, h / 2);

    for (const body of [...this.interactive, ...this.disturbers]) {
      Body.setPosition(body, {
        x: Math.min(Math.max(body.position.x * scaleX, 0), w),
        y: Math.min(Math.max(body.position.y * scaleY, 0), h),
      });
    }

    if (this.render) {
      this.render.canvas.width = w * (this.render.options.pixelRatio ?? 1);
      this.render.canvas.height = h * (this.render.options.pixelRatio ?? 1);
      this.render.options.width = w;
      this.render.options.height = h;
    }

    this.paint();
  }

  /** Nothing to simulate for a tab nobody is looking at. */
  private readonly onVisibility = (): void => {
    if (this.destroyed) return;
    if (document.hidden) Runner.stop(this.runner);
    else Runner.run(this.runner, this.engine);
  };
}
