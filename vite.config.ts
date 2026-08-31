import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Sjednocená konfigurace: app čte build-time proměnné (jen VITE_*) z JEDINÉHO
// .env v hlsystem-infra (stejný soubor jako docker). Ostatní (backend secrets)
// Vite do bundle NEzapéká — expose jen prefix VITE_. Fallback na lokální app .env,
// když infra vedle není (standalone build).
const unifiedEnvDir = path.resolve(__dirname, '../hlsystem-infra/docker')
const envDir = existsSync(unifiedEnvDir) ? unifiedEnvDir : __dirname

export default defineConfig({
  envDir,
  server: {
    // 127.0.0.1, NE "localhost": nginx (dev stack) posílá HSTS a ten platí pro
    // celý hostname napříč porty. Jakmile Chromium jednou uvidí HTTPS na
    // "localhost", vynutí HTTPS i pro tenhle dev server (čisté HTTP) →
    // ERR_SSL_PROTOCOL_ERROR a bílá obrazovka. Viz i přepis URL v electron/main.ts.
    host: '127.0.0.1',
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts'
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              fileName: () => 'preload.js'
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.js',
                exports: 'auto'
              }
            },
            target: 'node14',
            minify: false,
            sourcemap: false
          }
        }
      }
    ]),
    renderer()
  ],
  build: {
    rollupOptions: {
      external: ['electron'],
      output: {
        // Bez tohohle šel celý renderer do jednoho ~1 MB chunku. Rozdělením
        // se knihovny, které se na pokladně nepoužijí, načtou až s příslušnou
        // obrazovkou a při aktualizaci se nepřenášejí znovu.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          realtime: ['socket.io-client']
        }
      }
    }
  }
})
