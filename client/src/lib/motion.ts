import type { Transition, Variants } from 'motion/react';

/**
 * Shared motion presets for the Cheesequake dashboard.
 * Personality: snappy & tactile (150–250ms) so live research feels responsive.
 */

export const SNAPPY_SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};

export const FAST_EASE_OUT: Transition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
};

export const QUICK_FADE_TRANSITION: Transition = {
  duration: 0.15,
  ease: [0.22, 1, 0.36, 1],
};

export const STAGGER_STEP_SECONDS = 0.035;
export const MAX_STAGGER_ITEMS = 8;
export const MAX_STAGGER_DELAY_SECONDS = STAGGER_STEP_SECONDS * MAX_STAGGER_ITEMS;

/**
 * Caps per-item stagger delay so large alert/narrative tables never lag.
 */
export function boundedStaggerDelay(
  index: number,
  step = STAGGER_STEP_SECONDS,
  maxDelay = MAX_STAGGER_DELAY_SECONDS,
): number {
  if (index <= 0) return 0;
  return Math.min(index * step, maxDelay);
}

export const tabPanelVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: FAST_EASE_OUT,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
};

export const toastVariants: Variants = {
  initial: { opacity: 0, x: 24, scale: 0.96 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: SNAPPY_SPRING,
  },
  exit: {
    opacity: 0,
    x: 24,
    scale: 0.96,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

export const tooltipVariants: Variants = {
  initial: { opacity: 0, y: 4, scale: 0.96 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: QUICK_FADE_TRANSITION,
  },
  exit: {
    opacity: 0,
    y: 2,
    scale: 0.97,
    transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
  },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: STAGGER_STEP_SECONDS,
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: FAST_EASE_OUT,
  },
};

export const fadeInVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: FAST_EASE_OUT,
  },
};

export const expandCollapseVariants: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: {
    opacity: 1,
    height: 'auto',
    transition: {
      height: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
      opacity: { duration: 0.16, delay: 0.03 },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { duration: 0.16, ease: [0.4, 0, 1, 1] },
      opacity: { duration: 0.1 },
    },
  },
};

export const BUTTON_TAP = { scale: 0.97 } as const;
export const CARD_HOVER = { y: -1 } as const;
