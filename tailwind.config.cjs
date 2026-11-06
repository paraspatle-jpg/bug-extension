/** Same theme tokens as paraspatle.in, as CSS variables set on Bug's shadow root. */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: "hsl(var(--brand))",
        border: "hsl(var(--border))",
        foreground: "hsl(var(--foreground))",
        background: "hsl(var(--background))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
      },
    },
  },
  corePlugins: { preflight: false },
}
