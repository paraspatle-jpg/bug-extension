import { createRoot, type Root } from "react-dom/client"
import css from "../build/bug.css"
import Cat from "./cat/Cat"
import { setSoundOn } from "./cat/sound"
import { getPrefs, initSaved, isExcluded, siteOf } from "./store"

/**
 * Puts Bug on the page: a fixed, click-through host element with a shadow
 * root, so the page's CSS can't touch her and hers can't touch the page.
 * Mounts/unmounts live when you flip her on/off in the popup.
 */

const site = siteOf(location.href)

let host: HTMLElement | null = null
let root: Root | null = null

function mount() {
  if (host) return
  host = document.createElement("bug-the-cat")
  host.setAttribute("data-cat", "")
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;contain:layout style"
  const shadow = host.attachShadow({ mode: "open" })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  shadow.adoptedStyleSheets = [sheet]
  const box = document.createElement("div")
  box.className = "bug-ui"
  shadow.appendChild(box)
  document.documentElement.appendChild(host)
  root = createRoot(box)
  root.render(<Cat />)
}

function unmount() {
  root?.unmount()
  host?.remove()
  root = null
  host = null
}

// words Bug knocks off are hidden with the CSS Custom Highlight API; that one
// rule has to live in the page's own stylesheet list (adopted: CSP-safe)
function pageStyles() {
  try {
    const s = new CSSStyleSheet()
    s.replaceSync("::highlight(bug-knocked){color:transparent;text-decoration-color:transparent}")
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]
  } catch {}
}

async function sync() {
  const p = await getPrefs()
  setSoundOn(p.sound)
  // paraspatle.in (her home, built in) and the visitor's own exclude list
  const on = p.enabled && !isExcluded(site, p.disabledSites)
  if (on) mount()
  else unmount()
}

async function start() {
  if (!document.documentElement || document.contentType !== "text/html") return
  await initSaved()
  pageStyles()
  await sync()
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.prefs) void sync()
  })
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "talk" && host) window.dispatchEvent(new Event("bug:talk"))
  })
}
void start()
