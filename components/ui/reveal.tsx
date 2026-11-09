"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** Set when the element is above the fold and should animate on mount. */
  immediate?: boolean;
}

/**
 * A short fade-up as sections enter the viewport. One animation, reused
 * everywhere; reduced-motion users get the final state immediately.
 */
export function Reveal({ children, className, delay = 0, y = 22, immediate = false }: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduce === true ? false : { y }}
      whileInView={reduce === true ? undefined : { y: 0 }}
      animate={immediate && reduce !== true ? { y: 0 } : undefined}
      viewport={{ once: true, margin: "-72px" }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
