"use client"

import { AnimatePresence, motion } from "framer-motion"

export type Claw = { id: number; x: number; y: number; angle: number }

const SIZE = 220
// Four slightly curved, parallel rakes inside a 220×220 box
const RAKES = [0, 1, 2, 3].map((i) => {
  const o = i * 27
  return `M${34 + o} ${28 + i * 4} Q${66 + o} ${108} ${52 + o} ${192 - i * 5}`
})

/**
 * Full-screen overlay of claw marks. Each mark is four gashes that rip in
 * quickly (staggered), linger, then fade. A wide dark stroke with a thin
 * page-coloured core reads as torn paper in both themes.
 */
export default function ClawMarks({ marks }: { marks: Claw[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] overflow-hidden print:hidden">
      <AnimatePresence>
        {marks.map((m) => (
          <motion.div
            key={m.id}
            className="absolute"
            style={{ left: m.x - SIZE / 2, top: m.y - SIZE / 2, width: SIZE, height: SIZE, rotate: m.angle }}
            initial={{ opacity: 1, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8 } }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full overflow-visible">
              {RAKES.map((d, i) => (
                <g key={i}>
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    className="text-foreground"
                    strokeOpacity={0.82}
                    strokeWidth={10 - i * 0.6}
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.16, delay: i * 0.045, ease: [0.3, 0, 0.2, 1] }}
                  />
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="hsl(var(--background))"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 0.92 }}
                    transition={{ duration: 0.16, delay: i * 0.045 + 0.03, ease: [0.3, 0, 0.2, 1] }}
                  />
                </g>
              ))}
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
