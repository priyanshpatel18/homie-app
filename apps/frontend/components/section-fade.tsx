"use client";

import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

export function SectionFade({
  children,
  className,
  ...props
}: React.ComponentProps<typeof motion.section>) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      className={className}
      initial={reduce ? undefined : { opacity: 0, y: 14 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.52, ease: [0.22, 0.61, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.section>
  );
}
