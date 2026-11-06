"use client"

import { motion } from "framer-motion"
import { useEffect, useRef } from "react"

export type Pose = "walk" | "sit" | "sleep"
export type Mood = "neutral" | "happy" | "alert" | "startled" | "angry"
export type Action = "stretch" | "groom" | "swipe" | null

/**
 * Bug: a chubby, big-headed ginger kitten, drawn as a little rigged puppet
 * (facing right).
 *
 * Every pose is a set of joint angles. A rAF loop eases the current angles
 * toward the target pose, so the cat physically sits down, gets up, lies down,
 * stretches and grooms instead of swapping drawings. Walks use the diagonal
 * gait real cats use. Joints are written straight to SVG `transform`
 * attributes, so React doesn't re-render every frame.
 *
 * Coordinates: viewBox 120×84, floor at y≈80, hip pivot at (44, 58).
 */

const JOINTS = [
  "rootY", "torso", "head", "earN", "earF",
  "fU", "fL", "ffU", "ffL",
  "hT", "hS", "hF", "fhT", "fhS", "fhF",
  "t1", "t2", "t3", "t4", "t5",
  "lid", "eyeScale",
] as const
type Joint = (typeof JOINTS)[number]
type Rig = Record<Joint, number>

// Smooth cyclic keyframe interpolation (cosine ease between evenly spaced keys)
function cyc(keys: number[], phase: number) {
  const n = keys.length
  const x = (((phase % 1) + 1) % 1) * n
  const i = Math.floor(x)
  const f = (1 - Math.cos((x - i) * Math.PI)) / 2
  return keys[i] + (keys[(i + 1) % n] - keys[i]) * f
}

const STAND: Rig = {
  rootY: 0, torso: 0, head: 0, earN: 0, earF: 0,
  fU: -4, fL: 6, ffU: -4, ffL: 6,
  hT: -20, hS: 40, hF: -20, fhT: -20, fhS: 40, fhF: -20,
  t1: 50, t2: 20, t3: 15, t4: -10, t5: -25,
  lid: 1, eyeScale: 1,
}

// Walk keys: contact (leg forward) → passing → push-off → swing (lifted)
const FRONT_U = [-22, 0, 20, 0]
const FRONT_L = [4, 0, 6, 50]
const HIND_T = [-35, -20, -5, -30]
const HIND_S = [45, 40, 30, 75]
const HIND_F = [-10, -20, -25, -45]

function walk(t: number, speed: number): Rig {
  const p = t * Math.min(3.4, Math.max(1.5, speed / 38))
  const w = Math.sin(p * Math.PI * 2)
  return {
    ...STAND,
    rootY: -Math.abs(Math.sin(p * Math.PI * 2)) * 1.6, // bouncy little trot
    torso: Math.sin(p * Math.PI * 4) * 1.2,
    head: -Math.sin(p * Math.PI * 4) * 2.5,
    fU: cyc(FRONT_U, p), fL: cyc(FRONT_L, p),
    ffU: cyc(FRONT_U, p + 0.5), ffL: cyc(FRONT_L, p + 0.5),
    hT: cyc(HIND_T, p + 0.5), hS: cyc(HIND_S, p + 0.5), hF: cyc(HIND_F, p + 0.5),
    fhT: cyc(HIND_T, p), fhS: cyc(HIND_S, p), fhF: cyc(HIND_F, p),
    t1: 55 + w * 5, t2: 18 + w * 4, t3: 12 - w * 5, t4: -10 + w * 9, t5: -25 + w * 12,
  }
}

function sit(t: number, mood: Mood): Rig {
  const angry = mood === "angry"
  const flick = mood === "alert" || mood === "startled" || angry
  const sway = Math.sin(t * Math.PI * 2 * (angry ? 3.4 : flick ? 2.6 : 0.45)) * (angry ? 26 : flick ? 16 : 7)
  return {
    ...STAND,
    rootY: 12, torso: -30,
    head: 26 + (mood === "alert" ? -10 : 0) + Math.sin(t * 0.7) * 3, // gentle head tilt
    fU: 30, fL: 0, ffU: 32, ffL: 0,
    hT: -60, hS: 160, hF: -130, fhT: -57, fhS: 160, fhF: -130,
    t1: -50, t2: -50, t3: -40, t4: -20 + sway * 0.6, t5: -10 + sway,
  }
}

function sleep(t: number): Rig {
  const breath = Math.sin(t * 1.7)
  return {
    ...STAND,
    rootY: 10 + breath * 0.45, torso: breath * 0.8, head: 30,
    fU: -85, fL: 160, ffU: -85, ffL: 160,
    hT: -100, hS: 170, hF: -150, fhT: -100, fhS: 170, fhF: -150,
    t1: -90, t2: -50, t3: -40, t4: -30, t5: -20,
    earN: 12, earF: 12,
  }
}

function stretch(): Rig {
  return {
    ...STAND,
    rootY: -1, torso: 16, head: -22,
    fU: -70, fL: -5, ffU: -66, ffL: -5,
    hT: -15, hS: 20, hF: -5, fhT: -12, fhS: 20, fhF: -5,
    t1: 80, t2: 5, t3: 0, t4: -10, t5: -20,
    earN: 14, earF: 14, lid: 0.2,
  }
}

/** Angry paw swipe: front paw lashes out twice. */
function swipe(t: number, mood: Mood): Rig {
  const p = t * 5
  return {
    ...sit(t, mood),
    torso: -24, head: 20,
    fU: cyc([-40, -125, -60, -125], p), fL: cyc([20, 60, 10, 60], p),
  }
}

function groom(t: number, mood: Mood): Rig {
  return {
    ...sit(t, mood),
    head: 34 + Math.sin(t * 13) * 4,
    fU: -95, fL: 110 + Math.sin(t * 13) * 8,
    lid: 0.25,
  }
}

// ── art ─────────────────────────────────────────────────────────────────────

const C = {
  fur: "#f8a65e",
  furTop: "#f0944a",
  furLight: "#fcbd82",
  far: "#e08a45",
  stripe: "#e57a33",
  belly: "#ffe3c2",
  line: "#b9652b",
  earIn: "#ffb4b4",
  blush: "#ff9b9b",
  nose: "#ff8585",
  eye: "#2a1607",
  beans: "#ffb0b0",
}

const OUTLINE = { stroke: C.line, strokeWidth: 0.9, strokeLinejoin: "round" as const }

function Seg({ len, w, fill, outline = true }: { len: number; w: number; fill: string; outline?: boolean }) {
  return <rect x={-w / 2} y={-2} width={w} height={len + 3} rx={w / 2} fill={fill} {...(outline ? OUTLINE : {})} />
}

function Paw({ y, far = false }: { y: number; far?: boolean }) {
  return <ellipse cx={1.2} cy={y} rx={4.3} ry={2.5} fill={far ? "#efc9a3" : C.belly} {...OUTLINE} />
}

export default function CatArt({
  pose,
  mood,
  action,
  facing,
  speed = 70,
}: {
  pose: Pose
  mood: Mood
  action: Action
  facing: 1 | -1
  speed?: number
}) {
  const props = useRef({ pose, mood, action, speed })
  props.current = { pose, mood, action, speed }
  const els = useRef<Partial<Record<string, SVGGraphicsElement | null>>>({})
  const ref = (k: string) => (el: SVGGraphicsElement | null) => {
    els.current[k] = el
  }

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const cur: Rig = { ...sit(0, "neutral") }
    let raf = 0
    let last = performance.now()
    let nextBlink = 2 + Math.random() * 3
    let nextTwitch = 5 + Math.random() * 5

    const set = (k: string, tf: string) => els.current[k]?.setAttribute("transform", tf)

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = now / 1000
      const { pose, mood, action, speed } = props.current

      const target: Rig = {
        ...(pose === "walk" ? walk(t, speed)
          : pose === "sleep" ? sleep(t)
          : action === "stretch" ? stretch()
          : action === "groom" ? groom(t, mood)
          : action === "swipe" ? swipe(t, mood)
          : sit(t, mood)),
      }

      // Overlays: mood, blinking, ear twitches
      if (pose !== "sleep") {
        if (mood === "alert") { target.eyeScale = 1.12; target.earN = -8; target.earF = -8 }
        if (mood === "startled") { target.eyeScale = 1.25; target.earN = 34; target.earF = 34 }
        if (mood === "angry") { target.eyeScale = 0.95; target.lid = 0.55; target.earN = 42; target.earF = 42 }
        if (t > nextBlink) {
          target.lid = 0.08
          if (t > nextBlink + 0.13) nextBlink = t + 3 + Math.random() * 4
        }
        if (t > nextTwitch) {
          target.earN += 20
          if (t > nextTwitch + 0.16) nextTwitch = t + 5 + Math.random() * 7
        }
      }

      const k = reduced ? 30 : pose === "walk" ? 26 : 9
      for (const j of JOINTS) {
        const kk = j === "lid" || j === "earN" || j === "earF" || j === "eyeScale" ? 32 : k
        cur[j] += (target[j] - cur[j]) * (1 - Math.exp(-dt * kk))
      }

      set("root", `translate(44 ${58 + cur.rootY})`)
      set("torso", `rotate(${cur.torso})`)
      set("head", `translate(24 -8) rotate(${cur.head})`)
      set("earN", `translate(1 -20) rotate(${cur.earN})`)
      set("earF", `translate(15 -23) rotate(${cur.earF})`)
      set("fU", `translate(20 4) rotate(${cur.fU})`)
      set("fL", `translate(0 8) rotate(${cur.fL})`)
      set("ffU", `translate(15 3) rotate(${cur.ffU})`)
      set("ffL", `translate(0 8) rotate(${cur.ffL})`)
      set("hT", `translate(1 2) rotate(${cur.hT})`)
      set("hS", `translate(0 6) rotate(${cur.hS})`)
      set("hF", `translate(0 6) rotate(${cur.hF})`)
      set("fhT", `translate(-3 1) rotate(${cur.fhT})`)
      set("fhS", `translate(0 6) rotate(${cur.fhS})`)
      set("fhF", `translate(0 6) rotate(${cur.fhF})`)
      set("t1", `translate(-9 -3) rotate(${cur.t1})`)
      for (const n of [2, 3, 4, 5] as const) set(`t${n}`, `translate(-6.5 0) rotate(${cur[`t${n}`]})`)
      const s = cur.eyeScale
      set("eyes", `translate(13.5 -9) scale(${s} ${s * Math.max(0.06, cur.lid)}) translate(-13.5 9)`)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const tailSeg = (w: number, color = C.fur) => (
    <>
      {/* invisible, fatter hit area so the tail is easy to grab */}
      <line x1={0} y1={0} x2={-6.5} y2={0} stroke="transparent" strokeWidth={w + 9} strokeLinecap="round" pointerEvents="stroke" />
      <line x1={0} y1={0} x2={-6.5} y2={0} stroke={C.line} strokeWidth={w + 1.6} strokeLinecap="round" />
      <line x1={0} y1={0} x2={-6.5} y2={0} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </>
  )

  const happy = mood === "happy" && pose !== "sleep"
  const asleep = pose === "sleep"

  return (
    <div className="relative">
      {/* Zzz: HTML overlay (outside the flipped SVG), above the sleeping head */}
      {asleep && (
        <div className="pointer-events-none absolute" style={{ left: facing === 1 ? "74%" : "26%", top: "30%" }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute font-bold text-muted-foreground"
              style={{ fontSize: 9 + i * 3 }}
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{ opacity: [0, 1, 0], x: [0, (5 + i * 3) * facing, (10 + i * 5) * facing], y: [0, -10 - i * 5, -20 - i * 9] }}
              transition={{ duration: 3, repeat: Infinity, delay: i, ease: "easeOut" }}
            >
              z
            </motion.span>
          ))}
        </div>
      )}
      <div style={{ transform: `scaleX(${facing})`, transition: "transform 0.25s ease" }}>
        <svg viewBox="0 0 120 84" className="block h-auto w-full overflow-visible">
          <defs>
            <linearGradient id="bug-fur" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.furTop} />
              <stop offset="0.55" stopColor={C.fur} />
              <stop offset="1" stopColor={C.furLight} />
            </linearGradient>
            <radialGradient id="bug-head" cx="0.45" cy="0.4" r="0.65">
              <stop offset="0" stopColor={C.furLight} />
              <stop offset="1" stopColor={C.fur} />
            </radialGradient>
          </defs>

          <ellipse cx={54} cy={81} rx={24} ry={2.2} fill="currentColor" className="text-foreground" opacity={0.13} />

          <g ref={ref("root")} transform="translate(44 58)">
            <g ref={ref("torso")}>
              {/* fluffy tail */}
              <g ref={ref("t1")} data-part="tail">
                {tailSeg(7)}
                <g ref={ref("t2")}>
                  {tailSeg(6.6)}
                  <g ref={ref("t3")}>
                    {tailSeg(6.2, C.stripe)}
                    <g ref={ref("t4")}>
                      {tailSeg(5.8)}
                      <g ref={ref("t5")}>{tailSeg(5.6, C.stripe)}</g>
                    </g>
                  </g>
                </g>
              </g>

              {/* far legs */}
              <g ref={ref("fhT")}>
                <Seg len={6} w={6.5} fill={C.far} />
                <g ref={ref("fhS")}>
                  <Seg len={6} w={6} fill={C.far} />
                  <g ref={ref("fhF")}>
                    <Seg len={6} w={5.6} fill={C.far} />
                    <Paw y={7} far />
                  </g>
                </g>
              </g>
              <g ref={ref("ffU")}>
                <Seg len={8} w={6.6} fill={C.far} />
                <g ref={ref("ffL")}>
                  <Seg len={8} w={6.2} fill={C.far} />
                  <Paw y={8.6} far />
                </g>
              </g>

              {/* chubby bean body */}
              <path
                d="M-10 0 C-11 -9 -2 -13 8 -13 C18 -13 26 -10 28 -2 C30 6 24 12 14 12 C4 12 -9 10 -10 0 Z"
                fill="url(#bug-fur)"
                {...OUTLINE}
              />
              <path d="M6 6 C10 11 20 11 25 5 C24 10 19 12 14 12 C10 12 7 10 6 6 Z" fill={C.belly} />
              <g stroke={C.stripe} strokeWidth={2.2} strokeLinecap="round" fill="none">
                <path d="M4 -12.5 q-1 3 0 5.5" />
                <path d="M10 -13 q-1 3 0 5.5" />
                <path d="M16 -12.6 q-1 3 0 5" />
              </g>

              {/* near hind leg: round haunch → short leg */}
              <g ref={ref("hT")}>
                <ellipse cx={0} cy={2} rx={8} ry={8} fill={C.fur} {...OUTLINE} />
                <Seg len={6} w={7} fill={C.fur} outline={false} />
                <g ref={ref("hS")}>
                  <Seg len={6} w={6.4} fill={C.fur} outline={false} />
                  <g ref={ref("hF")}>
                    <Seg len={6} w={6} fill={C.fur} />
                    <Paw y={7} />
                  </g>
                </g>
              </g>

              {/* near front leg */}
              <g ref={ref("fU")}>
                <Seg len={8} w={7} fill={C.fur} />
                <g ref={ref("fL")}>
                  <Seg len={8} w={6.6} fill={C.fur} />
                  <Paw y={8.6} />
                  <g fill={C.beans}>
                    <circle cx={-0.6} cy={8.4} r={0.7} />
                    <circle cx={1.4} cy={8} r={0.7} />
                    <circle cx={3.2} cy={8.4} r={0.7} />
                  </g>
                </g>
              </g>

              {/* big round head (¾ view) */}
              <g ref={ref("head")}>
                <g ref={ref("earF")}>
                  <path d="M-5 3 Q-4 -9 1 -11 Q6 -6 6 3 Z" fill={C.far} {...OUTLINE} />
                </g>
                <g ref={ref("earN")}>
                  <path d="M-5 3 Q-4 -9 1 -11 Q6 -6 6 3 Z" fill={C.fur} {...OUTLINE} />
                  <path d="M-2.6 1.5 Q-2 -5.6 0.8 -7.2 Q3.6 -4 3.6 1.5 Z" fill={C.earIn} />
                </g>
                <circle cx={8} cy={-10} r={15} fill="url(#bug-head)" {...OUTLINE} />
                <g stroke={C.stripe} strokeWidth={1.6} strokeLinecap="round" fill="none">
                  <path d="M5 -23 q0.6 2.5 0 4.5" />
                  <path d="M9 -24 q0.6 2.5 0 4.5" />
                  <path d="M13 -23.2 q0.6 2.5 0 4.5" />
                </g>
                {/* muzzle + blush */}
                <ellipse cx={17.5} cy={-3.5} rx={6} ry={4} fill={C.belly} />
                <ellipse cx={5.5} cy={-3.5} rx={3.2} ry={1.9} fill={C.blush} opacity={0.6} />
                <ellipse cx={22.2} cy={-4.6} rx={1.6} ry={1.4} fill={C.blush} opacity={0.5} />

                {/* angry brows (outside the eye group so blinking doesn't squash them) */}
                {mood === "angry" && !asleep && (
                  <g stroke={C.eye} strokeWidth={1.3} strokeLinecap="round">
                    <line x1={7} y1={-15.6} x2={12.6} y2={-13} />
                    <line x1={20.4} y1={-15} x2={16} y2={-12.8} />
                  </g>
                )}
                {/* eyes */}
                {asleep ? (
                  <g stroke={C.eye} strokeWidth={1.3} strokeLinecap="round" fill="none">
                    <path d="M7.5 -9 q2.7 2.4 5.4 0" />
                    <path d="M15.6 -9 q2.3 2 4.6 0" />
                  </g>
                ) : happy ? (
                  <g stroke={C.eye} strokeWidth={1.4} strokeLinecap="round" fill="none">
                    <path d="M7.4 -8.4 q2.7 -3.2 5.4 0" />
                    <path d="M15.6 -8.4 q2.3 -2.8 4.6 0" />
                  </g>
                ) : (
                  <g ref={ref("eyes")}>
                    <ellipse className="cat-eye" cx={10.2} cy={-9} rx={3.1} ry={3.9} fill={C.eye} />
                    <ellipse className="cat-eye" cx={17.9} cy={-9} rx={2.7} ry={3.6} fill={C.eye} />
                    <circle cx={11.3} cy={-10.6} r={1.25} fill="#fff" />
                    <circle cx={9.4} cy={-7.6} r={0.6} fill="#fff" />
                    <circle cx={18.8} cy={-10.4} r={1.05} fill="#fff" />
                    <circle cx={17.2} cy={-7.8} r={0.5} fill="#fff" />
                  </g>
                )}

                {/* nose + "w" mouth */}
                <path d="M17.6 -5.4 h2.6 q-0.3 1.4 -1.3 1.7 q-1 -0.3 -1.3 -1.7 z" fill={C.nose} />
                <path d="M16.6 -2.6 q1.15 1.1 2.3 0 q1.15 1.1 2.3 0" stroke={C.line} strokeWidth={0.7} strokeLinecap="round" fill="none" />
                <g stroke={C.line} strokeWidth={0.45} strokeLinecap="round" opacity={0.55}>
                  <line x1={23} y1={-4} x2={29} y2={-5.2} />
                  <line x1={23} y1={-2.8} x2={29} y2={-2.4} />
                </g>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
