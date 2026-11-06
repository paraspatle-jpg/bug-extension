import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import CatArt from "../cat/CatArt"
import { type Brain, type Prefs, BUILT_IN_EXCLUDES, DEFAULT_BRAIN, DEFAULT_PREFS, PROVIDERS, covers, getBrain, getPrefs, setPrefs, siteOf } from "../store"
import { Toggle, injectStyles } from "./shared"

function Popup() {
  const [prefs, setP] = useState<Prefs>(DEFAULT_PREFS)
  const [brain, setB] = useState<Brain>(DEFAULT_BRAIN)
  const [site, setSite] = useState("")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      setSite(tab?.url?.startsWith("http") ? siteOf(tab.url) : "")
      setP(await getPrefs())
      setB(await getBrain())
      setReady(true)
    })()
  }, [])

  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setP(next)
    void setPrefs(next)
  }
  // an exclude rule like "google.com" also covers docs.google.com
  const rule = prefs.disabledSites.find((r) => covers(r, site))
  const siteOn = !rule
  const hasKey = !!brain.keys[brain.provider]?.trim()
  const home = BUILT_IN_EXCLUDES.some((r) => covers(r, site))

  if (!ready) return <div className="h-[300px] w-[300px]" />
  return (
    <div className="w-[300px] p-3">
      <div className="flex items-center gap-3 px-1 pb-2">
        <div className="w-[64px] shrink-0">
          <CatArt pose={prefs.enabled ? "sit" : "sleep"} mood={prefs.enabled ? "happy" : "neutral"} action={null} facing={1} />
        </div>
        <div>
          <div className="text-base font-semibold">Bug the cat</div>
          <div className="text-xs text-muted-foreground">{prefs.enabled ? "roaming your tabs" : "napping"}</div>
        </div>
      </div>

      <Toggle label="Bug is on" sub="on every site" on={prefs.enabled} onChange={(v) => update({ enabled: v })} />
      {site && !home && (
        <Toggle
          label={`On ${rule ?? site}`}
          on={siteOn}
          disabled={!prefs.enabled}
          onChange={(v) => update({ disabledSites: v ? prefs.disabledSites.filter((s) => !covers(s, site)) : [...prefs.disabledSites, site] })}
        />
      )}
      {home && <p className="px-3 py-2 text-xs text-muted-foreground">This is Bug&apos;s home. She already lives here.</p>}
      <Toggle label="Sounds" sub="meows, purrs, hisses" on={prefs.sound} onChange={(v) => update({ sound: v })} />

      <div className="mt-2 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">AI brain</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${hasKey ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}>
            {hasKey ? PROVIDERS[brain.provider].label : "no key yet"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {hasKey ? (
            <>
              Press <kbd className="rounded border px-1">Alt</kbd>+<kbd className="rounded border px-1">Shift</kbd>+<kbd className="rounded border px-1">B</kbd> or tap 💬 on Bug and tell her what to do.
            </>
          ) : (
            "Add your own Gemini, Claude or OpenAI key so Bug can take orders."
          )}
        </p>
        <button type="button" onClick={() => chrome.runtime.openOptionsPage()} className="mt-2 w-full rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background">
          {hasKey ? "Brain settings" : "Add an API key"}
        </button>
      </div>

      <button type="button" onClick={() => chrome.runtime.openOptionsPage()} className="mt-2 block w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
        sites where Bug stays away ({prefs.disabledSites.length + BUILT_IN_EXCLUDES.length})
      </button>
      <a href="https://paraspatle.in" target="_blank" rel="noreferrer" className="mt-1 block text-center text-[11px] text-muted-foreground no-underline hover:text-foreground">
        made by paraspatle.in
      </a>
    </div>
  )
}

injectStyles()
createRoot(document.getElementById("root")!).render(<Popup />)
