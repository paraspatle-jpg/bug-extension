# Chrome Web Store listing: copy/paste sheet

Upload: `bug-extension.zip` (run `npm run zip`), version 1.0.1.

## Store listing tab

**Name** (from the manifest): Bug the cat

**Summary** (from the manifest, max 132 chars):
A tiny sassy orange kitten who lives in your browser. Pet her, don't grab the tail, and tell her what to do (bring your own AI key).

**Description:**

Bug is a tiny, sassy orange kitten who lives in your browser. She roams every tab, naps when you go quiet, and has opinions.

What she does
• Roams the page and wanders over to sit by your cursor
• Pet her (click or stroke) for purrs and hearts
• Don't grab the tail. She growls, hisses and claws the screen
• Select some text and she knocks it right off the page, like a cup off a table (it comes back)
• Falls asleep when you're away, yawns and stretches when you're back

Tell her what to do
Add your own Google Gemini, Anthropic Claude or OpenAI API key, then press Alt+Shift+B (or tap the 💬 on her head) and give an order: "knock the title off", "what's this page about?", "take me to pricing", "zoomies". She reads the page's headings and links, plans a few moves and acts them out.

Private by design
• No server, no account, no analytics, no tracking
• Your API key stays in your browser's extension storage; websites can't read it
• A request only goes out when you give Bug a command, straight to the AI provider you picked
• Without a key, nothing ever leaves your browser

Also
• Turn her off everywhere or just on one site from the toolbar popup
• An exclude list for sites she should never visit (your bank, work tools…)
• Optional sounds (all synthesized: meows, purrs, hisses)
• Open source: github.com/paraspatle-jpg/bug-extension

Made by Paras Patle (paraspatle.in), where Bug lives full-time.

**Category:** Fun   (alternative: Productivity → no, Fun fits)
**Language:** English

**Graphic assets** (all in this folder):
- Store icon 128×128: `store-icon-128.png`
- Screenshots 1280×800: `screenshot-1.jpg` … `screenshot-5.jpg` (upload in this order)
- Small promo tile 440×280: `promo-small-440x280.jpg`
- Marquee promo tile 1400×560 (optional): `promo-marquee-1400x560.jpg`

**Official URL:** none (needs a verified domain; skip)
**Homepage URL:** https://github.com/paraspatle-jpg/bug-extension
**Support URL:** https://github.com/paraspatle-jpg/bug-extension/issues

## Privacy tab

**Single purpose description:**
Bug is a playful animated cat companion that lives on the web pages you visit: she roams, reacts to petting and selected text, and can act out short commands you type, planned by an AI provider of your choice using your own API key.

**Permission justifications:**

- **storage**
  Saves the user's settings (on/off, excluded sites, sound), the cat's small state (pet count, last position) and, if the user adds one, their AI API key, locally on the device. Nothing in storage is sent to the developer.

- **activeTab**
  Lets the toolbar popup read the current tab's site name so the user can turn Bug off for just that site.

- **Host permission: content script on all URLs (`<all_urls>`)**
  The extension's single purpose is a cat that appears on whatever page the user is on, so its content script has to run on every site. It draws the cat in an isolated shadow root and only reads page content when the user selects text (to animate that text) or gives Bug a command (to list visible headings and links she can walk to). Users can exclude any site, and switch her off entirely, from the popup and settings page.

- **Host permissions: https://generativelanguage.googleapis.com/*, https://api.anthropic.com/*, https://api.openai.com/***
  When the user gives Bug a command, the extension's background service worker sends it, with the user's own API key, to the AI provider the user chose (Google Gemini, Anthropic or OpenAI) to plan the cat's actions. Requests happen only on an explicit user command.

**Are you using remote code?** No, I am not using remote code. (All JavaScript is bundled in the package; the AI response is only JSON data that is validated against a fixed list of actions.)

**Data usage: what user data do you collect?** Tick:
- ☑ **Website content** (text, headings and links of the current page, sent to the user's chosen AI provider only when they give a command)
- ☑ **Authentication information** (the user's own AI API key, stored locally and sent only to that provider to authorise their requests)
- Leave everything else unticked.

**Certify** all three:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://www.paraspatle.in/bug/privacy

## Distribution tab

- Visibility: Public
- Regions: All regions
- Pricing: Free

## If review asks questions

The broad host permission is the usual sticking point. Point them to: the single purpose (a cat on every page), the per-site exclude list and off switch, no remote code, no data sent to the developer, and the public source on GitHub.
