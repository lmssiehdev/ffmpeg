// @ts-check

import { fileURLToPath } from "node:url"

import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, fontProviders } from "astro/config"

export default defineConfig({
  integrations: [react()],

  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Geist",
      cssVariable: "--font-geist",
      fallbacks: ["sans-serif"],
      formats: ["woff2"],
      styles: ["normal"],
      subsets: ["latin"],
      weights: ["100 900"],
    },
  ],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "node:zlib": fileURLToPath(new URL("./src/lib/just-bash-zlib.ts", import.meta.url)),
      },
    },
  },
})
