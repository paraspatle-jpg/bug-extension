/**
 * Everything the extension remembers lives in chrome.storage.local, never in
 * the website's own localStorage.
 *  - "prefs":  on/off, per-site off, sound            (content script reads)
 *  - "cat":    pets, last position, hint shown         (content script reads)
 *  - "brain":  AI provider, API keys, models           (only the service worker
 *              and options page touch it; websites never see it)
 */

export type Provider = "gemini" | "anthropic" | "openai"
export type Prefs = { enabled: boolean; disabledSites: string[]; sound: boolean }
export type Saved = { pets: number; x?: number; y?: number; hinted?: boolean }
export type Brain = { provider: Provider; keys: Partial<Record<Provider, string>>; models: Partial<Record<Provider, string>> }

export const DEFAULT_PREFS: Prefs = { enabled: true, disabledSites: [], sound: false }
export const DEFAULT_BRAIN: Brain = { provider: "gemini", keys: {}, models: {} }
export const PROVIDERS: Record<Provider, { label: string; model: string; keyUrl: string; hint: string }> = {
  gemini: { label: "Google Gemini", model: "gemini-2.5-flash", keyUrl: "https://aistudio.google.com/apikey", hint: "Free tier available. Starts with AIza…" },
  anthropic: { label: "Anthropic Claude", model: "claude-haiku-5-5", keyUrl: "https://console.anthropic.com/settings/keys", hint: "Starts with sk-ant-…" },
  openai: { label: "OpenAI", model: "gpt-4o-mini", keyUrl: "https://platform.openai.com/api-keys", hint: "Starts with sk-…" },
}

export async function getPrefs(): Promise<Prefs> {
  const { prefs } = await chrome.storage.local.get("prefs")
  return { ...DEFAULT_PREFS, ...(prefs ?? {}) }
}
export async function setPrefs(p: Partial<Prefs>) {
  await chrome.storage.local.set({ prefs: { ...(await getPrefs()), ...p } })
}
export async function getBrain(): Promise<Brain> {
  const { brain } = await chrome.storage.local.get("brain")
  return { ...DEFAULT_BRAIN, ...(brain ?? {}) }
}
export async function setBrain(b: Partial<Brain>) {
  await chrome.storage.local.set({ brain: { ...(await getBrain()), ...b } })
}

// the cat's memory is read synchronously by the component, so it's loaded once
// before mounting and written through in the background
let saved: Saved = { pets: 0 }
export async function initSaved() {
  const { cat } = await chrome.storage.local.get("cat")
  saved = { pets: 0, ...(cat ?? {}) }
}
export const loadSaved = () => saved
export function saveSaved(p: Partial<Saved>) {
  saved = { ...saved, ...p }
  chrome.storage.local.set({ cat: saved }).catch(() => {})
}

/** Sites Bug never visits, whatever the settings: paraspatle.in has its own Bug. */
export const BUILT_IN_EXCLUDES = ["paraspatle.in"]

/** "example.com" also covers www.example.com and any subdomain like docs.example.com. */
export const covers = (rule: string, host: string) => host === rule || host.endsWith("." + rule)
export const isExcluded = (host: string, list: string[]) => [...BUILT_IN_EXCLUDES, ...list].some((r) => covers(r, host))

/** Turn whatever someone pastes ("https://www.Bank.com/login") into a site rule ("bank.com"). */
export function toRule(input: string) {
  const t = input.trim().toLowerCase()
  if (!t) return ""
  const host = siteOf(/^[a-z]+:\/\//.test(t) ? t : `https://${t}`)
  return /^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/.test(host) ? host : ""
}

export const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
