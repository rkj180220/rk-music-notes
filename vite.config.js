import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // Single-file output: all JS + CSS inlined into index.html
    target:       'esnext',
    cssCodeSplit: false,
    // Ensure assets small enough are inlined (the plugin handles the rest)
    assetsInlineLimit: 100_000_000,
  },
})
