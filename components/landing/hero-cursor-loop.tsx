"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;

/** Kept small: a handful of sparks reads as sparkle, a cloud reads as noise. */
const MAX_SPARKS = 64;

const SPARK_COLORS = ["242, 89, 41", "31, 41, 156", "48, 209, 255", "163, 169, 245"] as const;

const PALETTE_FALLBACK = "242, 89, 41";

interface Orbit {
  rx: number;
  ry: number;
  tilt: number;
  /** Radians per millisecond. Negative values orbit counter-clockwise. */
  speed: number;
  phase: number;
  color: string;
  width: number;
  alpha: number;
  dot: number;
  history: number;
  trail: Point[];
}

interface Point {
  x: number;
  y: number;
}

interface Spark extends Point {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  star: boolean;
}

function makeOrbits(): Orbit[] {
  return [
    {
      rx: 66,
      ry: 39,
      tilt: -0.43,
      speed: 0.00062,
      phase: 0,
      color: "242, 89, 41",
      width: 1.9,
      alpha: 0.78,
      dot: 2.9,
      history: 38,
      trail: [],
    },
    {
      rx: 66,
      ry: 39,
      tilt: -0.43,
      speed: 0.00062,
      phase: Math.PI,
      color: "31, 41, 156",
      width: 1.6,
      alpha: 0.58,
      dot: 2.5,
      history: 38,
      trail: [],
    },
    {
      rx: 116,
      ry: 70,
      tilt: -0.43,
      speed: -0.00036,
      phase: 2.35,
      color: "48, 209, 255",
      width: 1.4,
      alpha: 0.42,
      dot: 2.2,
      history: 30,
      trail: [],
    },
    {
      rx: 116,
      ry: 70,
      tilt: -0.43,
      speed: -0.00036,
      phase: 2.35 + Math.PI,
      color: "163, 169, 245",
      width: 1.2,
      alpha: 0.3,
      dot: 1.9,
      history: 30,
      trail: [],
    },
  ];
}

function pointOnEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tilt: number,
  angle: number,
): Point {
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const x = Math.cos(angle) * rx;
  const y = Math.sin(angle) * ry;
  return { x: cx + x * cosTilt - y * sinTilt, y: cy + x * sinTilt + y * cosTilt };
}

/** A pre-rendered warm/cool halo; drawing a gradient every frame allocates. */
function makeGlowSprite(): HTMLCanvasElement {
  const size = 480;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  if (context === null) return sprite;

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.6)");
  gradient.addColorStop(0.3, "rgba(224, 234, 248, 0.34)");
  gradient.addColorStop(0.64, "rgba(163, 169, 245, 0.14)");
  gradient.addColorStop(1, "rgba(163, 169, 245, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return sprite;
}

/**
 * The hero's pointer instrument: a quiet loop of light that follows the cursor.
 *
 * The idea is the brand mark in motion, not a second illustration. Two point
 * trails circle the pointer on the same tilted ellipse (one orange, one indigo),
 * a dashed outer orbit drifts around them, and small sparks peel off when the
 * pointer moves. The whole assembly glides after the cursor with a little lag,
 * so heading changes stretch the trails into the shape of a loop.
 *
 * It is deliberately a canvas behind the hero content: text, cards and the
 * search pill stay fully readable. The effect is skipped for reduced motion,
 * coarse pointers (phones/tablets) and while the hero is off screen; it also
 * pauses when the tab is hidden.
 */
export function HeroCursorLoop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion === true) return;

    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const surface = canvas;
    const ctx = context;
    const host = surface.closest("section") ?? surface.parentElement;
    if (host === null) return;

    const finePointer = window.matchMedia("(pointer: fine)");
    if (!finePointer.matches) return;

    const orbits = makeOrbits();
    const sparks: Spark[] = [];
    const glow = makeGlowSprite();

    const pointer = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      alpha: 0,
      active: false,
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let running = false;
    let visible = true;
    let frameId = 0;
    let lastFrame = 0;
    let elapsed = 0;
    let energy = 0;
    let pulse = 0;
    let hasClient = false;
    let lastClientX = 0;
    let lastClientY = 0;

    function resizeCanvas() {
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));

      if (surface.width !== nextWidth || surface.height !== nextHeight) {
        surface.width = nextWidth;
        surface.height = nextHeight;
      }

      width = rect.width;
      height = rect.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    }

    function start() {
      if (running || !visible || width === 0 || height === 0) return;
      running = true;
      lastFrame = 0;
      frameId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frameId);
    }

    function fadeOut() {
      pointer.active = false;
      energy = 0;
    }

    function emitSparks(intensity: number) {
      const count = Math.min(3, Math.round(1 + intensity * 2));

      for (let index = 0; index < count; index += 1) {
        if (sparks.length >= MAX_SPARKS) break;

        const angle = Math.random() * TAU;
        const radius = 12 + Math.random() * 44;
        const speed = 0.018 + Math.random() * 0.09;
        const life = 620 + Math.random() * 680;
        const color =
          SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)] ?? PALETTE_FALLBACK;

        sparks.push({
          x: pointer.x + Math.cos(angle) * radius,
          y: pointer.y + Math.sin(angle) * radius * 0.72,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.035,
          vy: Math.sin(angle) * speed * 0.72 - 0.008 + (Math.random() - 0.5) * 0.035,
          life,
          maxLife: life,
          size: 0.8 + Math.random() * 1.4,
          color,
          star: Math.random() < 0.28,
        });
      }
    }

    function drawLoopRing(alpha: number) {
      ctx.save();
      ctx.translate(pointer.x, pointer.y);
      ctx.rotate(-0.43);

      // The inner loop is always readable; the bright motes are what move on it.
      ctx.beginPath();
      ctx.ellipse(0, 0, 66, 39, 0, 0, TAU);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(31, 41, 156, ${0.07 * alpha})`;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, 116 + energy * 6, 70 + energy * 3, 0, 0, TAU);
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -elapsed * 0.014;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(31, 41, 156, ${0.24 * alpha})`;
      ctx.stroke();
      ctx.restore();

      if (pulse > 0) {
        const progress = 1 - pulse;
        ctx.beginPath();
        ctx.ellipse(pointer.x, pointer.y, 26 + progress * 86, 16 + progress * 54, -0.43, 0, TAU);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(242, 89, 41, ${pulse * 0.22 * alpha})`;
        ctx.stroke();
      }
    }

    function drawOrbits(alpha: number) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const orbit of orbits) {
        const angle = elapsed * orbit.speed + orbit.phase;
        const stretch = 1 + energy * 0.05;
        const point = pointOnEllipse(
          pointer.x,
          pointer.y,
          orbit.rx * stretch,
          orbit.ry * stretch,
          orbit.tilt,
          angle,
        );

        orbit.trail.push(point);
        if (orbit.trail.length > orbit.history) orbit.trail.shift();

        for (let index = 1; index < orbit.trail.length; index += 1) {
          const previous = orbit.trail[index - 1];
          const current = orbit.trail[index];
          if (previous === undefined || current === undefined) continue;

          const progress = index / orbit.trail.length;
          const fade = progress * progress;
          ctx.strokeStyle = `rgb(${orbit.color})`;
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(current.x, current.y);

          // A wide, almost transparent under-stroke gives the trail a soft
          // glow without the cost of a canvas shadow per segment.
          ctx.globalAlpha = alpha * orbit.alpha * fade * 0.16;
          ctx.lineWidth = orbit.width * (0.4 + progress * 0.6) * 2.8;
          ctx.stroke();

          ctx.globalAlpha = alpha * orbit.alpha * fade;
          ctx.lineWidth = orbit.width * (0.4 + progress * 0.6);
          ctx.stroke();
        }

        ctx.globalAlpha = alpha * orbit.alpha * 0.3;
        ctx.fillStyle = `rgb(${orbit.color})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, orbit.dot + 3.1, 0, TAU);
        ctx.fill();

        ctx.globalAlpha = alpha * Math.min(1, orbit.alpha * 1.55);
        ctx.beginPath();
        ctx.arc(point.x, point.y, orbit.dot, 0, TAU);
        ctx.fill();
      }

      // A tiny origin spark anchors the loop to the cursor without becoming a
      // custom cursor replacement.
      ctx.globalAlpha = alpha * 0.62;
      ctx.fillStyle = "rgb(242, 89, 41)";
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 1.8, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 1;
    }

    function drawSparks(alpha: number, delta: number) {
      for (let index = sparks.length - 1; index >= 0; index -= 1) {
        const spark = sparks[index];
        if (spark === undefined) continue;

        spark.life -= delta;
        if (spark.life <= 0) {
          sparks.splice(index, 1);
          continue;
        }

        const friction = Math.exp(-delta / 480);
        spark.vx *= friction;
        spark.vy = spark.vy * friction + 0.000025 * delta;
        spark.x += spark.vx * delta;
        spark.y += spark.vy * delta;

        const life = spark.life / spark.maxLife;
        ctx.globalAlpha = alpha * life * 0.8;
        ctx.strokeStyle = `rgb(${spark.color})`;
        ctx.fillStyle = `rgb(${spark.color})`;

        if (spark.star) {
          const reach = spark.size * 2.3;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(spark.x - reach, spark.y);
          ctx.lineTo(spark.x + reach, spark.y);
          ctx.moveTo(spark.x, spark.y - reach);
          ctx.lineTo(spark.x, spark.y + reach);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(spark.x, spark.y, spark.size, 0, TAU);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    }

    function frame(now: number) {
      if (!visible) {
        running = false;
        return;
      }

      const delta = lastFrame === 0 ? 16.67 : Math.min(48, now - lastFrame);
      lastFrame = now;
      elapsed += delta;

      pointer.alpha += ((pointer.active ? 1 : 0) - pointer.alpha) * (1 - Math.exp(-delta / 130));

      if (!pointer.active && pointer.alpha < 0.02) {
        pointer.alpha = 0;
        energy = 0;
        ctx.clearRect(0, 0, width, height);
        running = false;
        return;
      }

      const follow = 1 - Math.exp(-delta / 90);
      pointer.x += (pointer.tx - pointer.x) * follow;
      pointer.y += (pointer.ty - pointer.y) * follow;

      if (pointer.active && energy > 0.08) emitSparks(energy);
      energy *= Math.exp(-delta / 120);
      pulse = Math.max(0, pulse - delta / 720);

      // Ease the whole composition out in the last few pixels of the hero so a
      // large halo never ends on a hard canvas edge under the pointer.
      const edgeDistance = Math.min(pointer.x, pointer.y, width - pointer.x, height - pointer.y);
      const edgeFade = Math.min(1, Math.max(0, edgeDistance / 72));
      const alpha = pointer.alpha * edgeFade;
      ctx.clearRect(0, 0, width, height);

      const glowSize = 500 * (1 + energy * 0.03);
      ctx.globalAlpha = alpha * 0.62;
      ctx.drawImage(glow, pointer.x - glowSize / 2, pointer.y - glowSize / 2, glowSize, glowSize);
      ctx.globalAlpha = 1;

      drawLoopRing(alpha);
      drawOrbits(alpha);
      drawSparks(alpha, delta);

      frameId = requestAnimationFrame(frame);
    }

    function targetFromClient(clientX: number, clientY: number) {
      const rect = surface.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const inside =
        x >= 0 &&
        y >= 0 &&
        x <= rect.width &&
        y <= rect.height &&
        rect.width > 0 &&
        rect.height > 0;
      return { x, y, inside };
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;

      const target = targetFromClient(event.clientX, event.clientY);
      if (!target.inside) {
        fadeOut();
        return;
      }

      const dx = hasClient ? event.clientX - lastClientX : 0;
      const dy = hasClient ? event.clientY - lastClientY : 0;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      hasClient = true;

      if (!pointer.active) {
        pointer.x = target.x;
        pointer.y = target.y;
        pointer.alpha = Math.max(pointer.alpha, 0.001);
        pulse = 1;
        for (const orbit of orbits) orbit.trail.length = 0;
      }

      pointer.tx = target.x;
      pointer.ty = target.y;
      pointer.active = true;
      energy = Math.min(1.5, energy + Math.hypot(dx, dy) / 60);
      start();
    }

    function handleScroll() {
      if (!hasClient || width === 0) return;
      const target = targetFromClient(lastClientX, lastClientY);

      if (target.inside) {
        pointer.tx = target.x;
        pointer.ty = target.y;
        if (!pointer.active && pointer.alpha < 0.02) {
          pointer.active = true;
          start();
        }
      } else if (pointer.active) {
        fadeOut();
      }
    }

    function handlePointerLeave() {
      fadeOut();
    }

    function handleVisibility() {
      if (document.hidden) {
        stop();
        ctx.clearRect(0, 0, width, height);
      } else if (pointer.active) {
        start();
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      if (pointer.active) start();
    });

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        visible = entry?.isIntersecting ?? false;
        if (!visible) {
          fadeOut();
          stop();
          ctx.clearRect(0, 0, width, height);
        } else if (pointer.active) {
          start();
        }
      },
      { rootMargin: "120px" },
    );

    resizeCanvas();
    resizeObserver.observe(surface);
    intersectionObserver.observe(surface);

    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", fadeOut);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", fadeOut);
      ctx.clearRect(0, 0, width, height);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-[5] h-full w-full motion-reduce:hidden"
    />
  );
}
