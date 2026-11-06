"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"

const CHIPS = ["what's this page about?", "knock the title off", "roast this site", "zoomies"]

/**
 * The "tell Bug what to do" bar. Opens with "/" or the 💬 tag; closes on
 * Esc, on send, or when clicking away. Bug answers with actions, not text.
 */
export default function BugChat({
  open,
  onClose,
  onSend,
}: {
  open: boolean
  onClose: () => void
  onSend: (command: string) => void
}) {
  const [value, setValue] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const chips = CHIPS

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30)
  }, [open])

  const send = (text: string) => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setValue("")
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-cat
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-5 print:hidden"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div className="pointer-events-auto w-full max-w-[520px]">
            <div className="mb-2 flex flex-wrap justify-center gap-1.5">
              {chips.map((c, i) => (
                <motion.button
                  key={c}
                  type="button"
                  onClick={() => send(c)}
                  className="rounded-full border bg-popover/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-brand/60 hover:text-foreground"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i + 0.05 }}
                >
                  {c}
                </motion.button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(value)
              }}
              className="flex items-center gap-2 rounded-2xl border bg-popover/95 py-1.5 pl-4 pr-1.5 shadow-xl backdrop-blur"
            >
              <span aria-hidden className="text-base">🐾</span>
              <input
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && onClose()}
                onBlur={(e) => {
                  // close when focus leaves the bar entirely
                  if (!e.currentTarget.form?.parentElement?.contains(e.relatedTarget as Node)) setTimeout(onClose, 120)
                }}
                maxLength={140}
                placeholder="tell Bug what to do…"
                aria-label="Tell Bug what to do"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">esc</kbd>
              <button
                type="submit"
                disabled={!value.trim()}
                className="rounded-xl bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
              >
                Send
              </button>
            </form>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground/80">sent to your AI provider with your own key. nothing else sees it.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
