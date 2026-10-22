import type { Transition, Variants } from "framer-motion";

// Converted from SwiftUI presets (response / dampingFraction) to stiffness / damping with mass 1:
// stiffness = (2π / response)², damping = 2 · dampingFraction · √stiffness
export const iosSpring = {
  smooth: { type: "spring", stiffness: 322, damping: 34, mass: 1 },   // .smooth   (0.35, 0.95)
  snappy: { type: "spring", stiffness: 438, damping: 36, mass: 1 },   // .snappy   (0.30, 0.85)
  bouncy: { type: "spring", stiffness: 247, damping: 22, mass: 1 },   // .bouncy   (0.40, 0.70)
  press: { type: "spring", stiffness: 600, damping: 32, mass: 0.6 },  // touch-down feedback
} satisfies Record<string, Transition>;

export const iosFade: Transition = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] };

// Spread on any motion element to get the iOS "squish" on press.
export const iosPressable = {
  whileTap: { scale: 0.92 },
  transition: iosSpring.press,
};

// Staggered rise used when a panel opens fresh (direction 0). On tab slides the parent handles motion.
export const iosRiseVariants: Variants = {
  enter: (direction: number) =>
    direction === 0 ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 },
  center: {
    opacity: 1,
    y: 0,
    transition: { y: iosSpring.snappy, opacity: iosFade },
    transitionEnd: { transform: "none" },
  },
  exit: {},
};

// Context menus grow out of their anchor like UIMenu.
export const iosMenuVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { scale: iosSpring.bouncy, opacity: iosFade, filter: iosFade },
    transitionEnd: { filter: "none", transform: "none" },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    filter: "blur(4px)",
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
};
