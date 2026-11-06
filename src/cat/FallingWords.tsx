"use client"

import { useEffect, useRef } from "react"

export type FallingWord = {
  text: string
  x: number
  y: number
  w: number
  h: number
  font: React.CSSProperties
}
export type Drop = { id: number; dir: 1 | -1; words: FallingWord[] }

const GRAVITY = 2400 // px/s²
const LIFE_MS = 2300

/**
 * Copies of the knocked-off words, tumbling with simple physics: pushed away
 * from the cat, fall, bounce once or twice on the bottom of the screen, fade.
 * Positions are written straight to the DOM each frame (no re-renders).
 */
function DropLayer({ drop }: { drop: Drop }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const bodies = drop.words.map((w, i) => {
      // words nearer the paw get hit harder
      const kick = 1 - i / Math.max(1, drop.words.length)
      return {
        x: 0,
        y: 0,
        vx: drop.dir * (120 + Math.random() * 260 + kick * 220),
        vy: -(260 + Math.random() * 380 + kick * 200),
        r: 0,
        vr: (Math.random() - 0.5) * 720,
        floor: window.innerHeight - w.y - w.h,
      }
    })
    let raf = 0
    let last = performance.now()
    const start = last
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      const age = now - start
      const fade = age > LIFE_MS - 600 ? Math.max(0, (LIFE_MS - age) / 600) : 1
      bodies.forEach((b, i) => {
        b.vy += GRAVITY * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.r += b.vr * dt
        if (b.y > b.floor) {
          b.y = b.floor
          b.vy = Math.abs(b.vy) > 160 ? -b.vy * 0.38 : 0
          b.vx *= 0.7
          b.vr *= 0.6
        }
        const el = refs.current[i]
        if (el) {
          el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.r}deg)`
          el.style.opacity = String(fade)
        }
      })
      if (age < LIFE_MS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drop])

  return (
    <>
      {drop.words.map((w, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="absolute whitespace-pre will-change-transform"
          style={{ left: w.x, top: w.y, height: w.h, lineHeight: `${w.h}px`, transformOrigin: "50% 50%", ...w.font }}
        >
          {w.text}
        </span>
      ))}
    </>
  )
}

export default function FallingWords({ drops }: { drops: Drop[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[44] overflow-hidden print:hidden">
      {drops.map((d) => (
        <DropLayer key={d.id} drop={d} />
      ))}
    </div>
  )
}

const SKIP = "input, textarea, [contenteditable], pre, code, button, [data-no-swat]"

/** Really visible to a sighted visitor? (skips sr-only text, faded-out words…) */
function visible(el: Element, cache: Map<Element, boolean>): boolean {
  const hit = cache.get(el)
  if (hit !== undefined) return hit
  const cs = getComputedStyle(el)
  let ok =
    cs.display !== "none" &&
    cs.visibility !== "hidden" &&
    parseFloat(cs.opacity) > 0.15 &&
    !(cs.overflow === "hidden" && el.clientWidth <= 1 && el.clientHeight <= 1)
  if (ok && el.parentElement && el.parentElement !== document.body) ok = visible(el.parentElement, cache)
  cache.set(el, ok)
  return ok
}

/**
 * Turn the current selection into per-word copies (with their on-screen rects
 * and font) plus the ranges covering them, so the originals can be hidden.
 * Returns null when the selection isn't something Bug should touch.
 */
export function captureSelection(maxWords = 60) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const text = sel.toString().trim()
  if (text.length < 2) return null
  return captureRange(sel.getRangeAt(0), text, maxWords)
}

/** Same as captureSelection, for a whole element (Bug's "knock" command). */
export function captureElement(el: Element, maxWords = 60) {
  if (el.closest("[data-cat]")) return null
  const range = document.createRange()
  range.selectNodeContents(el)
  return captureRange(range, (el.textContent ?? "").trim(), maxWords)
}

function captureRange(range: Range, text: string, maxWords: number) {
  const root = range.commonAncestorContainer
  const rootEl = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement
  if (!rootEl || rootEl.closest(SKIP) || rootEl.closest("[data-cat]")) return null

  const words: FallingWord[] = []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT)
  const seen = new Map<Element, boolean>()
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (let n = walker.currentNode as Node | null; n && words.length < maxWords; n = walker.nextNode()) {
    if (n.nodeType !== Node.TEXT_NODE || !range.intersectsNode(n)) continue
    const parent = n.parentElement
    if (!parent || parent.closest(SKIP)) continue
    const data = n.textContent ?? ""
    const from = n === range.startContainer ? range.startOffset : 0
    const to = n === range.endContainer ? range.endOffset : data.length
    if (!visible(parent, seen)) continue
    const cs = getComputedStyle(parent)
    const font: React.CSSProperties = {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight as React.CSSProperties["fontWeight"],
      fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
      fontVariationSettings: cs.fontVariationSettings,
    }
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(data)) && words.length < maxWords) {
      const a = Math.max(from, m.index)
      const b = Math.min(to, m.index + m[0].length)
      if (b <= a) continue
      const r = document.createRange()
      r.setStart(n, a)
      r.setEnd(n, b)
      const rect = r.getClientRects()[0]
      if (!rect || rect.width === 0 || rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue
      words.push({ text: data.slice(a, b), x: rect.left, y: rect.top, w: rect.width, h: rect.height, font })
      ranges.push(r)
    }
  }
  if (words.length === 0) return null

  const a = words[0]
  const z = words[words.length - 1]
  return {
    text,
    words,
    ranges,
    first: { left: a.x, right: a.x + a.w, bottom: a.y + a.h },
    last: { left: z.x, right: z.x + z.w, bottom: z.y + z.h },
  }
}

export type Captured = NonNullable<ReturnType<typeof captureRange>>
