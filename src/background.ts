import { plan, testKey } from "./brain"
import { getBrain } from "./store"

/** The service worker: Bug's brain (with the visitor's key) and the shortcut. */

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "plan") {
    getBrain()
      .then((b) => plan(b, msg.command, msg.page))
      .then(reply, () => reply({ steps: [], reason: "error" }))
    return true // async reply
  }
  if (msg?.type === "test") {
    getBrain()
      .then(testKey)
      .then(reply, (e) => reply({ ok: false, message: String(e) }))
    return true
  }
  if (msg?.type === "openOptions") chrome.runtime.openOptionsPage()
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "talk-to-bug") return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "talk" }).catch(() => {})
})

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage()
})
