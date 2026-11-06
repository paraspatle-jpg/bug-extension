// Builds the extension into dist/: Tailwind → CSS (rem → px so page font sizes
// can't resize Bug), esbuild bundles for the content script, service worker,
// popup and options page, plus the manifest and icons.
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import * as esbuild from "esbuild"

const watch = process.argv.includes("--watch")
rmSync("dist", { recursive: true, force: true })
mkdirSync("dist", { recursive: true })
mkdirSync("build", { recursive: true })

function css() {
  execFileSync("npx", ["tailwindcss", "-c", "tailwind.config.cjs", "-i", "src/styles.css", "-o", "build/tw.css", "--minify"], { stdio: "inherit" })
  const tw = readFileSync("build/tw.css", "utf8")
  const theme = readFileSync("src/theme.css", "utf8")
  const px = (s) => s.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${+(parseFloat(n) * 16).toFixed(3)}px`)
  writeFileSync("build/bug.css", px(theme + tw))
}
css()

cpSync("public", "dist", { recursive: true })
const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"))
manifest.version = pkg.version
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2))

const opts = {
  entryPoints: { content: "src/content.tsx", background: "src/background.ts", popup: "src/ui/popup.tsx", options: "src/ui/options.tsx" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome114",
  minify: !watch,
  loader: { ".css": "text" },
  alias: { "@": "./src" },
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  legalComments: "none",
  logLevel: "info",
}
if (watch) {
  const ctx = await esbuild.context(opts)
  await ctx.watch()
} else {
  await esbuild.build(opts)
}
