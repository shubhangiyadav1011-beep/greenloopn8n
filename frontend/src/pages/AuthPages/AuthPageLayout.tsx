import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { ambientMedia, type AppMedia } from "@/config/appMedia";

/**
 * Auth layout — one cinematic media half + one focused form half.
 *
 * The media half pairs a static recovery photograph with a charcoal scrim,
 * GreenLoop identity and live operational proof chips from the demo scenario.
 * Any-input demo auth is preserved downstream.
 */

const PROOF_CHIPS = [
  { value: "15 t", label: "slot confirmed" },
  { value: "24.0 t", label: "surveyed" },
  { value: "7.4 t", label: "verified" },
];

function AuthMediaHalf({ image, tagline }: { image: AppMedia; tagline: string }) {
  const reduce = useReducedMotion();

  const children = [
    <motion.p key="p0" variants={item} className="eyebrow-label text-white/60">Construction material recovery network</motion.p>,
    <motion.h1 key="p1" variants={item} className="mt-5 font-archivo text-4xl font-bold leading-tight tracking-tight text-white">
      GREEN<span className="text-loop-400">LOOP</span>
    </motion.h1>,
    <motion.p key="p2" variants={item} className="mt-5 max-w-[430px] font-archivo text-xl font-medium leading-7 text-white/90">{tagline}</motion.p>,
    <motion.p key="p3" variants={item} className="mt-3 max-w-sm text-sm leading-6 text-white/60">
      Survey materials, match receivers, reserve capacity and verify every recovered tonne.
    </motion.p>,
    <motion.div key="p4" variants={item} className="mt-auto flex flex-wrap gap-2 pt-8">
      {PROOF_CHIPS.map((chip) => (
        <span key={chip.label} className="border border-white/20 bg-white/[0.06] px-3 py-1.5 backdrop-blur-sm">
          <span className="ledger-numeral text-sm font-semibold text-white">{chip.value}</span>
          <span className="ms-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60">{chip.label}</span>
        </span>
      ))}
    </motion.div>,
  ];

  return (
    <div className="relative hidden min-h-screen w-full overflow-hidden lg:grid lg:w-1/2">
      <img src={image.src} alt={image.alt} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-ink-950/70" aria-hidden="true" />
      <motion.div
        className="relative z-1 flex min-h-screen w-full flex-col px-7 py-6 sm:px-8 sm:py-8"
        initial={reduce ? false : "hidden"}
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
      >
        <Link to="/" className="mb-8 block w-fit">
          <img width={180} height={40} src="/images/logo/auth-logo.svg" alt="GreenLoop" />
        </Link>
        {children}
      </motion.div>
    </div>
  );
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-1 flex min-h-screen bg-white dark:bg-black">
      <AuthMediaHalf image={ambientMedia.surveyHero} tagline="Plan where recoverable materials go — before the truck leaves." />
      <div className="relative flex w-full flex-col lg:w-1/2">{children}</div>
      <div className="fixed end-6 bottom-6 z-50">
        <ThemeTogglerTwo />
      </div>
    </div>
  );
}
