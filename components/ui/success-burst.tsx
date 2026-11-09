"use client";

import { motion, useReducedMotion } from "motion/react";

const SPARKS = [
  { angle: -90, color: "bg-brand" },
  { angle: -45, color: "bg-orange" },
  { angle: 0, color: "bg-lilac" },
  { angle: 45, color: "bg-brand" },
  { angle: 90, color: "bg-orange" },
  { angle: 135, color: "bg-lilac" },
  { angle: 180, color: "bg-brand" },
  { angle: 225, color: "bg-orange" },
] as const;

const SPARK_RADIUS = 30;

/**
 * A one-shot celebration for a completed action: a check that draws itself,
 * one expanding ring, and eight sparks. It is decorative — the surrounding
 * status copy is what screen readers announce — and it collapses to a static
 * check for reduced-motion users.
 */
export function SuccessBurst({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex size-16 shrink-0 items-center justify-center ${className}`}
    >
      {reduce !== true && (
        <>
          {SPARKS.map((spark) => {
            const radians = (spark.angle * Math.PI) / 180;
            return (
              <motion.span
                key={spark.angle}
                className={`absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${spark.color}`}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: Math.cos(radians) * SPARK_RADIUS,
                  y: Math.sin(radians) * SPARK_RADIUS,
                  scale: [0, 1, 0.4],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.8, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
              />
            );
          })}

          <motion.span
            className="absolute inset-0 rounded-full border-2 border-brand/30"
            initial={{ scale: 0.7, opacity: 0.8 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{ duration: 0.85, delay: 0.12, ease: "easeOut" }}
          />
        </>
      )}

      <motion.span
        initial={reduce === true ? false : { scale: 0.55, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={
          reduce === true
            ? { duration: 0 }
            : { type: "spring", stiffness: 260, damping: 18, delay: 0.04 }
        }
        className="relative flex size-16 items-center justify-center rounded-full bg-[linear-gradient(150deg,#2a35b5_0%,#1f299c_55%,#16215b_100%)] text-white shadow-[0_10px_28px_-12px_rgb(31_41_156/0.75)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-8">
          <motion.path
            d="M5 12.6 9.4 17 19 7.2"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce === true ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={
              reduce === true ? { duration: 0 } : { duration: 0.5, delay: 0.2, ease: "easeOut" }
            }
          />
        </svg>
      </motion.span>
    </span>
  );
}
