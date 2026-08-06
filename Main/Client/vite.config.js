import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// The custom split-container package ships raw .jsx Solid source, so it must
// be transpiled by vite-plugin-solid rather than pre-bundled by esbuild.
const SOLID_JSX_DEPS = ['@curruptnation/split-container']

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [solid()],

  // Don't wipe Rust/Tauri compiler output from the terminal.
  clearScreen: false,

  // Tauri expects a fixed dev-server URL; fail loudly if the port is taken
  // instead of silently hopping to another one. 1420 is Tauri's conventional
  // port and stays clear of Vite's default 5173.
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Never watch the Rust build tree — its artifacts are huge and get
      // locked mid-compile, which crashes the watcher (EBUSY).
      ignored: ['**/src-tauri/**'],
    },
  },

  optimizeDeps: {
    // Keep esbuild from pre-bundling the JSX source; let the Solid plugin
    // handle it so its reactivity compiles correctly.
    exclude: SOLID_JSX_DEPS,
  },
})
