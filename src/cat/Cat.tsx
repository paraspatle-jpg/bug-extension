"use client"

import { AnimatePresence, motion, useAnimationControls, useMotionValue } from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import BugChat from "./BugChat"
import CatArt, { type Action, type Mood, type Pose } from "./CatArt"
import ClawMarks, { type Claw } from "./ClawMarks"
import FallingWords, { captureElement, captureSelection, type Captured, type Drop } from "./FallingWords"
import { isSoundOn, play } from "./sound"
import { type Saved, loadSaved, saveSaved } from "../store"

/**
 * Bug, the site cat. Roams anywhere on the screen (mounted in the root layout,
 * so it stays put across page navigations).
 *
 * - wanders around the whole viewport on its own
 * - when your cursor rests somewhere, strolls over and sits next to it
 * - naps after ~30s without input, wakes with a yawn and a stretch
 * - grooms a paw now and then; flattens its ears when startled
 * - stroke it or click/tap it to pet it: purrs + hearts; pets are remembered
 * - grab its tail and it growls, hisses, swipes, claw marks rip across the
 *   screen (with a little screen shake), and it stomps off
 * - hops when you scroll really fast
 * - press "/" (or the 💬 tag) and tell it what to do: an AI plans a few
 *   actions (walk, knock, sit, point, open a link…) and Bug acts them out
 * - select some text and it runs over, wiggles, and swats the words off the
 *   screen like a cup off a table (they pop back a moment later)
 * - meows / purrs / yawns / growls when sound is switched on (navbar toggle)
 */

const NAME = "Bug"
const SLEEP_AFTER_MS = 30_000
const STORE_KEY = "bug-the-cat"
const RATIO = 84 / 120 // art aspect ratio (h / w)
const TOP_MARGIN = 72 // keep clear of the navbar

const SWAT_LINES = [
  "oops.",
  "it was like that when I got here.",
  "*knocks it off the table*",
  "no thoughts. only gravity.",
  "you weren't using that.",
]
const SWAT_COOLDOWN_MS = 12_000

const CARD_LINES = ["mine now.", "these are warm. I live here now.", "you weren't using these.", "no peeking. 😼", "*flops*"]
const POKE_LINES = ["no.", "*tail flick*", "mrrp. no.", "try bribery.", "I don't move for free.", "*pretends to sleep harder*"]
const CAUGHT_LINES = ["MOUSE. 😸", "*nom*", "mouse > cards.", "fine. look at your cards."]
const BORED_LINES = ["boring.", "*yawns*", "ok I'm done."]
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]
type CardSpot = { frame: HTMLIFrameElement; rect: { x: number; y: number; w: number; h: number } }

/** Hide the original words while their copies fall (CSS Custom Highlight API). */
type HighlightLike = { add: (r: Range) => void; delete: (r: Range) => void }
function hideRanges(ranges: Range[]) {
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => HighlightLike }).Highlight
  const reg = (CSS as unknown as { highlights?: Map<string, HighlightLike> }).highlights
  if (!H || !reg) return () => {}
  let h = reg.get("bug-knocked")
  if (!h) {
    h = new H()
    reg.set("bug-knocked", h)
  }
  ranges.forEach((r) => h!.add(r))
  return () => ranges.forEach((r) => h!.delete(r))
}

type PlanStep = { action: string; target?: string; text?: string }
const BRAIN_DOWN: Record<string, string> = {
  nokey: "no brain yet. give me an API key 🔑",
  badkey: "that API key tastes wrong. check my settings. 😾",
  limited: "your AI provider says slow down. later.",
  error: "brain.exe stopped working. mrrp.",
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** What's on the page, as numbered targets the AI can refer to. */
function snapshotPage() {
  const map = new Map<string, HTMLElement>()
  const targets: { id: string; kind: string; label: string; href?: string }[] = []
  const labels = new Set<string>()
  const root = document.body
  const add = (el: HTMLElement, kind: string) => {
    if (targets.length >= 50 || el.closest("[data-cat]")) return
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const label = (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70)
    // a link may share a heading's text ("Projects"); plain text mustn't repeat either
    const key = kind === "text" ? label : `${kind}:${label}`
    if (!label || labels.has(key) || (kind === "text" && labels.has(`link:${label}`))) return
    let href: string | undefined
    if (el instanceof HTMLAnchorElement) {
      const u = new URL(el.href, location.href)
      if (u.origin === location.origin) href = u.pathname + u.hash
    }
    labels.add(key)
    labels.add(label)
    const id = "t" + targets.length
    targets.push({ id, kind, label, href })
    map.set(id, el)
  }
  root.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((el) => add(el, "heading"))
  root.querySelectorAll<HTMLElement>("a[href]").forEach((el) => add(el, "link"))
  root.querySelectorAll<HTMLElement>("p, li, blockquote").forEach((el) => add(el, "text"))
  return { map, page: { path: location.pathname, title: document.title, targets } }
}

const THOUGHTS = [
  "is that a mouse? oh. it's a cursor.",
  "I'd sit on your keyboard if I could.",
  "this website has zero fish. rude.",
  "pet me. that's the whole UX.",
  "certified bug. not a feature.",
  "I live here now. every tab is my tab.",
  "don't touch the tail.",
  "select some text. I dare you.",
  "I take orders now. alt+shift+B",
  "you have too many tabs open. I counted.",
  "made by paraspatle.in. I'm the best part.",
]

type Bubble = { text: string; alignX: "left" | "center" | "right"; below: boolean; id: number }
const load = (): Saved => loadSaved()
const save = (data: Partial<Saved>) => saveSaved(data)

export default function Cat() {
  const [mounted, setMounted] = useState(false)
  const [pose, setPose] = useState<Pose>("sit")
  const [mood, setMood] = useState<Mood>("neutral")
  const [facing, setFacing] = useState<1 | -1>(-1)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [hearts, setHearts] = useState<number[]>([])
  const [claws, setClaws] = useState<Claw[]>([])
  const [drops, setDrops] = useState<Drop[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [size, setSize] = useState(116)
  const [action, setAction] = useState<Action>(null)
  const [speed, setSpeed] = useState(70)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const hop = useAnimationControls()
  const s = useRef({
    pose: "sit" as Pose,
    facing: -1 as 1 | -1,
    target: null as { x: number; y: number } | null,
    speed: 70,
    lastInput: Date.now(),
    reduced: false,
    size: 116,
    action: null as Action,
    actionTimer: 0 as ReturnType<typeof setTimeout> | 0,
    pets: 0,
    stroke: 0,
    lastPurr: 0,
    nextId: 1,
    moodTimer: 0 as ReturnType<typeof setTimeout> | 0,
    bubbleTimer: 0 as ReturnType<typeof setTimeout> | 0,
    mouse: { x: -1, y: -1, t: 0, visited: true },
    angryUntil: 0,
    ignoreClick: false,
    onArrive: null as (() => void) | null,
    busyUntil: 0,
    lastSwat: 0,
    swatTimer: 0 as ReturnType<typeof setTimeout> | 0,
    plan: 0, // bumps to cancel a running AI plan
    napUntil: 0,
    selfScrollUntil: 0,
    lastCommand: 0,
    onCards: null as CardSpot | null, // lying on your poker cards
  })

  const height = () => s.current.size * RATIO
  const clampX = (v: number) => Math.max(8, Math.min(window.innerWidth - s.current.size - 8, v))
  const clampY = (v: number) => Math.max(TOP_MARGIN, Math.min(window.innerHeight - height() - 4, v))
  const persist = () => save({ pets: s.current.pets, x: x.get(), y: y.get() })

  const setPoseBoth = useCallback((p: Pose) => {
    if (s.current.pose === p) return
    s.current.pose = p
    setPose(p)
  }, [])

  const face = useCallback((dir: 1 | -1) => {
    if (s.current.facing === dir) return
    s.current.facing = dir
    setFacing(dir)
  }, [])

  const say = useCallback((text: string, ms = 3200) => {
    const cx = x.get() + s.current.size / 2
    const alignX = cx < 130 ? "left" : cx > window.innerWidth - 130 ? "right" : "center"
    const below = y.get() < TOP_MARGIN + 60
    clearTimeout(s.current.bubbleTimer)
    setBubble({ text, alignX, below, id: s.current.nextId++ })
    s.current.bubbleTimer = setTimeout(() => setBubble(null), ms)
  }, [x, y])

  const flashMood = useCallback((m: Mood, ms: number) => {
    clearTimeout(s.current.moodTimer)
    setMood(m)
    s.current.moodTimer = setTimeout(() => setMood("neutral"), ms)
  }, [])

  const doAction = useCallback((a: Action, ms: number) => {
    const st = s.current
    clearTimeout(st.actionTimer)
    st.action = a
    setAction(a)
    if (a) st.actionTimer = setTimeout(() => { st.action = null; setAction(null) }, ms)
  }, [])

  const goTo = useCallback((tx: number, ty: number, spd: number, onArrive?: () => void) => {
    const st = s.current
    st.onArrive = onArrive ?? null
    st.target = { x: clampX(tx), y: clampY(ty) }
    st.speed = spd
    setSpeed(spd)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wake = useCallback(() => {
    if (s.current.pose !== "sleep" || Date.now() < s.current.napUntil) return
    setPoseBoth("sit")
    say("*yawn*", 1600)
    play("yawn")
    doAction("stretch", 1500)
  }, [say, setPoseBoth, doAction])

  const pet = useCallback((kind: "click" | "stroke") => {
    const st = s.current
    if (st.onCards) {
      // she's on your cards: petting won't move her
      play("mrrp")
      say(pick(POKE_LINES), 1600)
      hop.start({ rotate: [0, -4, 4, -2, 0], transition: { duration: 0.45 } })
      return
    }
    if (Date.now() < st.angryUntil) return // not in the mood
    if (kind === "click") play(st.pose === "sleep" ? "mrrp" : "meow")
    else if (Date.now() - st.lastPurr > 1100) {
      st.lastPurr = Date.now()
      play("purr")
    }
    st.lastInput = Date.now()
    st.target = null
    st.onArrive = null
    if (st.plan && st.busyUntil > Date.now()) {
      st.plan++
      st.busyUntil = 0
    }
    if (st.action) doAction(null, 0)
    if (st.pose === "walk") setPoseBoth("sit")
    st.pets += 1
    persist()
    const id = st.nextId++
    setHearts((h) => [...h, id])
    setTimeout(() => setHearts((h) => h.filter((i) => i !== id)), 1100)
    if (st.pose !== "sleep") flashMood("happy", 1600)
    if (st.pets === 1) say(`hi, I'm ${NAME} 🐾`)
    else if (st.pets === 2 && !isSoundOn()) say("psst: turn on sound (click my icon in the toolbar) to hear me purr 🔈", 4200)
    else if (st.pets % 10 === 0) say(`you've petted ${NAME} ${st.pets} times`)
    else if (Math.random() < 0.3) say(st.pose === "sleep" ? "prrr… zz" : ["purrr", "prrrt", "mrrp ♥"][Math.floor(Math.random() * 3)], 1400)
  }, [flashMood, say, setPoseBoth, doAction]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Somebody grabbed the tail. */
  const tailGrabbed = useCallback((px: number, py: number) => {
    const st = s.current
    const now = Date.now()
    if (now < st.angryUntil) return
    if (st.onCards) {
      // grumpy, but still not moving
      st.angryUntil = now + 1500
      flashMood("angry", 1400)
      say("HSSS. still not moving. 😾", 1500)
      play("hiss")
      return
    }
    st.angryUntil = now + 2600
    st.lastInput = now
    st.target = null
    st.onArrive = null
    clearTimeout(st.swatTimer)
    st.plan++
    st.busyUntil = 0
    st.napUntil = 0
    if (st.pose !== "sit") setPoseBoth("sit")
    doAction(null, 0)
    // face whoever did it
    const cx = x.get() + st.size / 2
    face(px > cx ? 1 : -1)
    flashMood("angry", 2400)
    say("grrrr…", 900)
    play("growl")

    setTimeout(() => {
      doAction("swipe", 650)
      say("HSSS! 😾", 1300)
      play("hiss")
      clawScreen()
    }, 480)

    // then stomp off, away from the hand that did it
    setTimeout(() => {
      if (st.reduced) return
      const away = x.get() + st.size / 2 > px ? 1 : -1
      goTo(x.get() + away * (220 + Math.random() * 120), y.get() + (Math.random() - 0.5) * 160, 230)
    }, 1500)
  }, [doAction, face, flashMood, goTo, say, setPoseBoth, x, y]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Claw marks rip across the screen in front of the cat, plus a little shake. */
  const clawScreen = useCallback(() => {
    const st = s.current
    {
      play("scratch")
      const dir = s.current.facing
      const mx = Math.max(110, Math.min(window.innerWidth - 110, x.get() + st.size / 2 + dir * 140))
      const my = Math.max(110, Math.min(window.innerHeight - 110, y.get() - 30))
      const id = st.nextId++
      setClaws((c) => [...c, { id, x: mx, y: my, angle: dir * (18 + Math.random() * 14) }])
      setTimeout(() => setClaws((c) => c.filter((m) => m.id !== id)), 2200)
    }
  }, [x, y])

  // Mount: restore position + pet count, size for viewport
  useEffect(() => {
    const st = s.current
    st.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const sizeFor = () => (window.innerWidth < 640 ? 88 : 116)
    const measure = () => {
      st.size = sizeFor()
      setSize(st.size)
      x.set(clampX(x.get()))
      y.set(clampY(y.get()))
    }
    const saved = load()
    st.pets = saved.pets ?? 0
    st.size = sizeFor()
    setSize(st.size)
    x.set(clampX(saved.x ?? window.innerWidth * 0.78))
    y.set(clampY(saved.y ?? window.innerHeight))
    setMounted(true)
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Movement + sleep loop
  useEffect(() => {
    if (!mounted) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const st = s.current
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (st.target && !st.reduced && !st.action) {
        const cx = x.get()
        const cy = y.get()
        const dx = st.target.x - cx
        const dy = st.target.y - cy
        const dist = Math.hypot(dx, dy)
        if (dist < 2) {
          st.target = null
          setPoseBoth("sit")
          persist()
          const cb = st.onArrive
          st.onArrive = null
          cb?.()
        } else {
          setPoseBoth("walk")
          if (Math.abs(dx) > 4) face(dx > 0 ? 1 : -1)
          const step = Math.min(dist, st.speed * dt)
          x.set(cx + (dx / dist) * step)
          y.set(cy + (dy / dist) * step)
        }
      }
      if (!st.target && st.pose === "sit" && !st.action && Date.now() - st.lastInput > SLEEP_AFTER_MS) {
        setPoseBoth("sleep")
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mounted, face, setPoseBoth, x, y]) // eslint-disable-line react-hooks/exhaustive-deps

  // Idle "brain": wander anywhere, think out loud, groom
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      const st = s.current
      if (st.reduced || st.pose !== "sit" || st.target || st.action) return
      if (Date.now() < st.angryUntil || Date.now() < st.busyUntil) return
      // Gets sleepy when nobody's around: stays put so it can doze off.
      if (Date.now() - st.lastInput > SLEEP_AFTER_MS / 2) return
      const r = Math.random()
      if (r < 0.42) {
        goTo(Math.random() * window.innerWidth, TOP_MARGIN + Math.random() * window.innerHeight, 55 + Math.random() * 30)
      } else if (r < 0.57) {
        say(THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)], 3800)
      } else if (r < 0.72) {
        doAction("groom", 2600)
      }
    }, 5000)
    return () => clearInterval(id)
  }, [mounted, say, doAction, goTo])

  // When the cursor rests somewhere, stroll over and sit beside it
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      const st = s.current
      const m = st.mouse
      if (st.reduced || m.visited || m.t === 0 || Date.now() - m.t < 1100) return
      if (st.pose === "sleep" || st.action || Date.now() < st.angryUntil || Date.now() < st.busyUntil) return
      m.visited = true
      const cx = x.get() + st.size / 2
      const cy = y.get() + height() / 2
      if (Math.hypot(m.x - cx, m.y - cy) < st.size * 1.2) return // already close
      // sit just below and beside the pointer, never on top of it
      const side = m.x > window.innerWidth - st.size - 40 ? -1 : 1
      const tx = side === 1 ? m.x + 18 : m.x - st.size - 18
      if (st.target == null) flashMood("alert", 900)
      goTo(tx, m.y + 14, 150)
    }, 250)
    return () => clearInterval(id)
  }, [mounted, flashMood, goTo, x, y]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global input: waking up, tracking the cursor, startle on fast scroll
  useEffect(() => {
    if (!mounted) return
    const st = s.current
    let lastY = window.scrollY
    let lastT = performance.now()
    let startledAt = 0

    const onPointer = (e: PointerEvent) => {
      st.lastInput = Date.now()
      if (st.pose === "sleep") return wake()
      if (e.pointerType !== "mouse") return
      if (Math.hypot(e.clientX - st.mouse.x, e.clientY - st.mouse.y) > 24) {
        st.mouse = { x: e.clientX, y: e.clientY, t: Date.now(), visited: false }
      }
    }
    const onAny = () => {
      st.lastInput = Date.now()
      wake()
    }
    const onScroll = () => {
      const now = performance.now()
      const v = Math.abs(window.scrollY - lastY) / Math.max(1, now - lastT)
      lastY = window.scrollY
      lastT = now
      st.lastInput = Date.now()
      if (v > 4 && now - startledAt > 2500 && !st.reduced && !st.onCards && Date.now() > st.selfScrollUntil) {
        startledAt = now
        wake()
        hop.start({ y: [0, -20, 0], transition: { duration: 0.45, ease: "easeOut" } })
        play("chirp")
        if (st.pose !== "sleep") {
          say("!", 900)
          flashMood("startled", 800)
        }
      }
    }
    window.addEventListener("pointermove", onPointer, { passive: true })
    window.addEventListener("keydown", onAny)
    window.addEventListener("touchstart", onAny, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("keydown", onAny)
      window.removeEventListener("touchstart", onAny)
      window.removeEventListener("scroll", onScroll)
    }
  }, [mounted, wake, flashMood, say, hop])

  /** Where to sit right beside some text, on whichever side has room. */
  const spotBeside = (first: { left: number; bottom: number }, last: { right: number; bottom: number }) => {
    const st = s.current
    const toRight = last.right + st.size + 12 < window.innerWidth
    const tx = toRight ? last.right + 2 : first.left - st.size - 2
    const ty = (toRight ? last.bottom : first.bottom) - height() * 0.82
    return { tx, ty, dir: (toRight ? -1 : 1) as 1 | -1 }
  }

  /** The pounce: butt wiggle, swipe, words fly. getCap re-measures at swipe time. */
  const knockOff = useCallback(
    (getCap: () => Captured | null, dir: 1 | -1, opts: { fromSelection?: boolean; quip?: boolean } = {}) =>
      new Promise<boolean>((resolve) => {
        const st = s.current
        face(dir)
        hop.start({ x: [0, -2.5, 2.5, -2.5, 2.5, -2, 2, 0], transition: { duration: 0.55, ease: "easeInOut" } })
        st.swatTimer = setTimeout(() => {
          st.swatTimer = 0
          const cap = getCap()
          if (!cap) return resolve(false)
          doAction("swipe", 520)
          play("pop")
          if (opts.fromSelection) window.getSelection()?.removeAllRanges()
          if (!st.reduced) {
            const unhide = hideRanges(cap.ranges)
            const id = st.nextId++
            // words nearest the paw get hit hardest
            const words = dir === -1 ? [...cap.words].reverse() : cap.words
            setDrops((d) => [...d, { id, dir, words }])
            setTimeout(() => setDrops((d) => d.filter((w) => w.id !== id)), 2500)
            setTimeout(unhide, 2600)
          }
          if (opts.quip) {
            setTimeout(() => {
              flashMood("happy", 1600)
              say(SWAT_LINES[Math.floor(Math.random() * SWAT_LINES.length)], 2400)
            }, 350)
          }
          resolve(true)
        }, 600)
      }),
    [doAction, face, flashMood, hop, say]
  )

  // Select some text and Bug knocks it off the screen, like a cup off a table
  useEffect(() => {
    if (!mounted) return
    const st = s.current
    // Skip on touch-only devices: there, selecting is almost always for copying.
    if (window.matchMedia("(hover: none)").matches) return
    let debounce: ReturnType<typeof setTimeout> | 0 = 0
    let down = false

    const swat = async (text: string, dir: 1 | -1) => {
      const same = () => {
        const c = captureSelection()
        return c && c.text === text ? c : null
      }
      const ok = same() && (await knockOff(same, dir, { fromSelection: true, quip: true }))
      if (!ok) say("hmph.", 1000)
      st.busyUntil = ok ? Date.now() + 2000 : 0
    }

    const check = () => {
      if (down || st.reduced) return
      const now = Date.now()
      if (now - st.lastSwat < SWAT_COOLDOWN_MS || now < st.angryUntil || now < st.busyUntil) return
      const cap = captureSelection()
      if (!cap || !cap.first || !cap.last) return
      st.lastSwat = now
      st.busyUntil = now + 6000
      st.lastInput = now
      st.mouse.visited = true
      wake()
      doAction(null, 0)
      flashMood("alert", 1400)
      play("chirp")
      const { tx, ty, dir } = spotBeside(cap.first, cap.last)
      const dist = Math.hypot(clampX(tx) - x.get(), clampY(ty) - y.get())
      const text = cap.text
      if (dist < 4) swat(text, dir)
      else goTo(tx, ty, Math.max(260, dist / 1.1), () => swat(text, dir))
    }

    const onSelection = () => {
      clearTimeout(debounce)
      debounce = setTimeout(check, 650)
    }
    const onDown = () => (down = true)
    const onUp = () => {
      down = false
      onSelection()
    }
    // copying is a legit reason to select: let them have it
    const onCopy = () => {
      if (!st.onArrive && !st.swatTimer) return
      st.onArrive = null
      st.target = null
      clearTimeout(st.swatTimer)
      st.swatTimer = 0
      st.busyUntil = 0
      say("fine. take it.", 1500)
    }
    document.addEventListener("selectionchange", onSelection)
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("pointerup", onUp, true)
    document.addEventListener("copy", onCopy)
    return () => {
      clearTimeout(debounce)
      document.removeEventListener("selectionchange", onSelection)
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("pointerup", onUp, true)
      document.removeEventListener("copy", onCopy)
    }
  }, [mounted, doAction, flashMood, goTo, knockOff, say, wake, x, y]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI brain: "/" → command → plan of steps → act them out ────────────────

  /** Walk somewhere; resolves on arrival (or after a safety timeout). */
  const walkTo = (tx: number, ty: number, spd?: number) =>
    new Promise<void>((resolve) => {
      const st = s.current
      const dist = Math.hypot(clampX(tx) - x.get(), clampY(ty) - y.get())
      if (st.reduced || dist < 4) return resolve()
      const timer = setTimeout(resolve, 5000)
      goTo(tx, ty, spd ?? Math.max(220, dist / 1.2), () => {
        clearTimeout(timer)
        resolve()
      })
    })

  /** Scroll an element into a comfortable spot if it's off screen. */
  const ensureVisible = async (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    if (r.top > TOP_MARGIN + 10 && r.top < window.innerHeight - 120) return
    s.current.selfScrollUntil = Date.now() + 1600
    const lenis = (window as unknown as { __lenis?: { scrollTo: (el: HTMLElement, o: object) => void } }).__lenis
    if (lenis) lenis.scrollTo(el, { offset: -window.innerHeight * 0.3, duration: 0.8 })
    else el.scrollIntoView({ behavior: s.current.reduced ? "auto" : "smooth", block: "center" })
    await wait(900)
  }

  const nudge = (el: HTMLElement) =>
    el.animate(
      [
        { outline: "2px solid rgb(255 106 26)", outlineOffset: "6px", borderRadius: "6px" },
        { outline: "2px solid rgb(255 106 26 / 0)", outlineOffset: "10px", borderRadius: "6px" },
      ],
      { duration: 900, easing: "ease-out" }
    )

  const runPlan = async (steps: PlanStep[], map: Map<string, HTMLElement>, tok: number) => {
    const st = s.current
    const alive = () => st.plan === tok
    for (const step of steps) {
      if (!alive()) return
      const el = step.target ? map.get(step.target) : undefined
      if (el && !el.isConnected) continue
      switch (step.action) {
        case "say": {
          const ms = Math.min(4500, Math.max(1600, 1200 + (step.text?.length ?? 0) * 45))
          say(step.text ?? "mrrp", ms)
          await wait(ms * 0.8)
          break
        }
        case "walk":
        case "point":
        case "open": {
          if (!el) break
          await ensureVisible(el)
          const r = el.getBoundingClientRect()
          const first = { left: r.left, bottom: Math.min(r.bottom, r.top + 48) }
          const { tx, ty, dir } = spotBeside(first, { right: Math.min(r.right, r.left + 520), bottom: first.bottom })
          await walkTo(tx, ty)
          if (!alive()) return
          face(dir)
          if (step.action === "walk") break
          flashMood("alert", 900)
          doAction("swipe", 380)
          play("tick")
          nudge(el)
          await wait(700)
          if (step.action === "open" && alive()) {
            el.click()
            return // new page: the rest of the plan points at stale elements
          }
          break
        }
        case "sit": {
          if (!el) break
          await ensureVisible(el)
          const r = el.getBoundingClientRect()
          await walkTo(r.left + Math.min(r.width / 2, 160) - st.size / 2, r.top - height() * 0.78)
          if (!alive()) return
          setPoseBoth("sit")
          flashMood("happy", 1600)
          await wait(1400)
          break
        }
        case "knock": {
          if (!el) break
          await ensureVisible(el)
          const cap = captureElement(el)
          if (!cap) {
            say("can't reach that.", 1400)
            await wait(1000)
            break
          }
          const { tx, ty, dir } = spotBeside(cap.first, cap.last)
          await walkTo(tx, ty)
          if (!alive()) return
          await knockOff(() => captureElement(el), dir)
          await wait(900)
          break
        }
        case "sleep":
          doAction(null, 0)
          st.napUntil = Date.now() + 6000
          setPoseBoth("sleep")
          await wait(1800)
          break
        case "groom":
          doAction("groom", 2200)
          await wait(2200)
          break
        case "stretch":
          doAction("stretch", 1500)
          play("yawn")
          await wait(1500)
          break
        case "purr": {
          play("purr")
          flashMood("happy", 1600)
          const id = st.nextId++
          setHearts((h) => [...h, id])
          setTimeout(() => setHearts((h) => h.filter((i) => i !== id)), 1100)
          await wait(1200)
          break
        }
        case "hiss":
          flashMood("angry", 1300)
          play("hiss")
          await wait(1000)
          break
        case "scratch":
          flashMood("angry", 1400)
          play("growl")
          await wait(450)
          doAction("swipe", 600)
          clawScreen()
          await wait(1100)
          break
        case "zoomies":
          play("chirp")
          for (let i = 0; i < 5 && alive(); i++) {
            await walkTo(Math.random() * window.innerWidth, TOP_MARGIN + Math.random() * window.innerHeight, 720)
          }
          break
      }
    }
  }

  const command = async (text: string) => {
    const st = s.current
    setChatOpen(false)
    const now = Date.now()
    if (now - st.lastCommand < 1200) return
    st.lastCommand = now
    const tok = ++st.plan
    st.busyUntil = now + 60_000
    st.lastInput = now
    st.target = null
    st.onArrive = null
    st.napUntil = 0
    clearTimeout(st.swatTimer)
    st.mouse.visited = true
    wake()
    doAction(null, 0)
    face(x.get() + st.size / 2 > window.innerWidth / 2 ? -1 : 1)
    flashMood("alert", 1500)
    say("…", 12_000)

    const { map, page } = snapshotPage()
    let steps: PlanStep[] = []
    let reason: string | undefined
    try {
      const data = (await Promise.race([
        chrome.runtime.sendMessage({ type: "plan", command: text, page }),
        wait(20_000).then(() => ({ steps: [], reason: "error" })),
      ])) as { steps?: PlanStep[]; reason?: string } | undefined
      steps = data?.steps ?? []
      reason = data?.reason
    } catch {
      reason = "error"
    }
    if (st.plan !== tok) return
    if (!steps.length) {
      say(BRAIN_DOWN[reason ?? "error"] ?? BRAIN_DOWN.error, 2600)
      if (reason === "nokey") {
        await wait(1800)
        if (st.plan === tok) chrome.runtime.sendMessage({ type: "openOptions" }).catch(() => {})
      }
    } else {
      setBubble(null)
      await runPlan(steps, map, tok)
    }
    if (st.plan === tok) st.busyUntil = Date.now() + 1500
  }

  // Alt+Shift+B (the extension's shortcut) opens the chat, plus a one-time hint
  useEffect(() => {
    if (!mounted) return
    const onTalk = () => setChatOpen((o) => !o)
    window.addEventListener("bug:talk", onTalk)
    let hint: ReturnType<typeof setTimeout> | 0 = 0
    if (!loadSaved().hinted) {
      hint = setTimeout(() => {
        if (Date.now() < s.current.busyUntil || s.current.pose === "sleep") return
        say("psst. press alt+shift+B (or tap 💬) and tell me what to do.", 4500)
        saveSaved({ hinted: true })
      }, 6000)
    }
    return () => {
      window.removeEventListener("bug:talk", onTalk)
      clearTimeout(hint)
    }
  }, [mounted, say])

  if (!mounted) return null

  const onTail = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('[data-part="tail"]')

  return (
    <>
      <ClawMarks marks={claws} />
      <FallingWords drops={drops} />
      <BugChat open={chatOpen} onClose={() => setChatOpen(false)} onSend={command} />
      <motion.div data-cat className="pointer-events-none fixed left-0 top-0 z-40 print:hidden" style={{ x, y, width: size }}>
        {/* Speech bubble */}
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={bubble.id}
              className={
                "absolute w-max max-w-[220px] rounded-2xl border bg-popover px-3 py-1.5 text-xs leading-snug text-popover-foreground shadow-lg " +
                (bubble.below ? "top-full mt-1 " : "bottom-full mb-1 ") +
                (bubble.alignX === "left" ? "left-0" : bubble.alignX === "right" ? "right-0" : "left-1/2 -translate-x-1/2")
              }
              initial={{ opacity: 0, y: bubble.below ? -6 : 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
            >
              {bubble.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* "talk" tag */}
        {!chatOpen && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label={`Tell ${NAME} what to do (or press Alt+Shift+B)`}
            title="tell Bug what to do (alt+shift+B)"
            className="pointer-events-auto absolute -top-2 right-0 z-10 grid h-6 w-6 place-items-center rounded-full border bg-popover text-[11px] opacity-60 shadow-sm transition hover:scale-110 hover:opacity-100 [@media(hover:none)]:opacity-90"
          >
            💬
          </button>
        )}

        {/* Hearts */}
        <AnimatePresence>
          {hearts.map((id) => (
            <motion.span
              key={id}
              className="absolute left-1/2 top-0 text-sm text-brand"
              initial={{ opacity: 1, y: 0, x: -6, scale: 0.6 }}
              animate={{ opacity: 0, y: -42, x: -6 + (id % 2 ? 12 : -12), scale: 1.15 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
            >
              ♥
            </motion.span>
          ))}
        </AnimatePresence>

        <motion.button
          animate={hop}
          type="button"
          aria-label={`${NAME} the cat. Click to pet. Don't grab the tail.`}
          title={`${NAME} 🐾`}
          className="pointer-events-auto block w-full cursor-grab rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
          onPointerDown={(e) => {
            s.current.ignoreClick = onTail(e.target)
            if (s.current.ignoreClick) tailGrabbed(e.clientX, e.clientY)
          }}
          onClick={() => {
            if (s.current.ignoreClick) {
              s.current.ignoreClick = false
              return
            }
            pet("click")
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse" || onTail(e.target)) return
            s.current.stroke += Math.abs(e.movementX) + Math.abs(e.movementY)
            if (s.current.stroke > 140) {
              s.current.stroke = 0
              pet("stroke")
            }
          }}
          onPointerLeave={() => (s.current.stroke = 0)}
        >
          <CatArt pose={pose} mood={mood} action={action} facing={facing} speed={speed} />
        </motion.button>
      </motion.div>
    </>
  )
}
