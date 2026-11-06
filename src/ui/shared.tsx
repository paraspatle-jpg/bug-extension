import css from "../../build/bug.css"

/** Popup/options pages reuse Bug's stylesheet. */
export function injectStyles() {
  const s = new CSSStyleSheet()
  s.replaceSync(css + "\nhtml,body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground))}")
  document.adoptedStyleSheets = [s]
  document.documentElement.classList.add("bug-ui")
}

export function Toggle({ label, sub, on, onChange, disabled }: { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-40"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-border"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  )
}
