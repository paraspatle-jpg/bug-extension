import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import CatArt from "../cat/CatArt"
import { type Brain, type Provider, DEFAULT_BRAIN, PROVIDERS, getBrain, setBrain } from "../store"
import { injectStyles } from "./shared"

function Options() {
  const [brain, setB] = useState<Brain>(DEFAULT_BRAIN)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void getBrain().then(setB)
  }, [])

  const p = brain.provider
  const info = PROVIDERS[p]
  const change = (b: Partial<Brain>) => {
    setB((x) => ({ ...x, ...b }))
    setStatus(null)
    setSaved(false)
  }
  const save = async () => {
    await setBrain(brain)
    setSaved(true)
    return brain
  }
  const test = async () => {
    setBusy(true)
    setStatus(null)
    await save()
    const r = (await chrome.runtime.sendMessage({ type: "test" })) as { ok: boolean; message: string }
    setStatus(r)
    setBusy(false)
  }
  const forget = async () => {
    const keys = { ...brain.keys }
    delete keys[p]
    change({ keys })
    await setBrain({ ...brain, keys })
  }

  return (
    <main className="mx-auto max-w-[620px] px-4 py-10">
      <div className="flex items-center gap-4">
        <div className="w-[96px] shrink-0">
          <CatArt pose="sit" mood={status?.ok ? "happy" : "neutral"} action={null} facing={1} />
        </div>
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Give Bug a brain</h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Bug roams, naps and swats without one. With an API key she takes orders: &ldquo;knock the title off&rdquo;, &ldquo;what&apos;s this page about?&rdquo;, &ldquo;take me to pricing&rdquo;.
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border p-5">
        <div className="text-sm font-medium">Provider</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => change({ provider: k })}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${p === k ? "border-brand bg-brand/10" : "hover:bg-muted"}`}
            >
              <span className="block font-medium">{PROVIDERS[k].label}</span>
              <span className="block text-xs text-muted-foreground">{brain.keys[k] ? "key saved" : "no key"}</span>
            </button>
          ))}
        </div>

        <label className="mt-5 block text-sm font-medium" htmlFor="key">
          {info.label} API key
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="key"
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={brain.keys[p] ?? ""}
            onChange={(e) => change({ keys: { ...brain.keys, [p]: e.target.value.trim() } })}
            placeholder={info.hint}
            className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="rounded-xl border px-3 text-xs hover:bg-muted">
            {show ? "hide" : "show"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Get one at{" "}
          <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-brand">
            {new URL(info.keyUrl).host}
          </a>
          . {info.hint}
        </p>

        <label className="mt-5 block text-sm font-medium" htmlFor="model">
          Model <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="model"
          value={brain.models[p] ?? ""}
          onChange={(e) => change({ models: { ...brain.models, [p]: e.target.value.trim() } })}
          placeholder={info.model}
          className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand"
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background">
            Save
          </button>
          <button type="button" disabled={busy || !brain.keys[p]} onClick={() => void test()} className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40">
            {busy ? "Asking Bug…" : "Test key"}
          </button>
          {brain.keys[p] && (
            <button type="button" onClick={() => void forget()} className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Forget key
            </button>
          )}
          {saved && !status && <span className="text-xs text-muted-foreground">saved ✓</span>}
        </div>
        {status && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${status.ok ? "bg-brand/10 text-foreground" : "bg-muted text-foreground"}`}>
            {status.ok ? "✓ " : "✗ "}
            {status.message}
          </p>
        )}
      </section>

      <section className="mt-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="m-0 text-sm font-medium text-foreground">Where your key goes</h2>
        <p className="m-0 mt-1">
          It stays in this browser (extension storage, which websites can&apos;t read) and is only ever sent to the provider you picked. When you give Bug an
          order, she sends that provider your command plus the page&apos;s title and visible headings, links and short text snippets, so she knows what she can
          walk to. Nothing goes anywhere else: there&apos;s no server, no analytics.
        </p>
        <h2 className="m-0 mt-5 text-sm font-medium text-foreground">Talking to Bug</h2>
        <p className="m-0 mt-1">
          Press <b>Alt+Shift+B</b> on any page, or tap the 💬 tag on her head. Change the shortcut at chrome://extensions/shortcuts.
        </p>
      </section>
    </main>
  )
}

injectStyles()
createRoot(document.getElementById("root")!).render(<Options />)
