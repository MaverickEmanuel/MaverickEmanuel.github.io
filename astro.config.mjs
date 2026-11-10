// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  // Served at the root of https://maverickemanuel.github.io (no `base`).
  site: "https://maverickemanuel.github.io",
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // The lazy-loaded city chunk (three.js + src/city) is ~600 kB
      // minified, ~150 kB gzipped. Classic visitors never download it.
      chunkSizeWarningLimit: 700,
    },
  },
});
