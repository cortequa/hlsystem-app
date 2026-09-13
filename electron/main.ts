import { app, BrowserWindow, ipcMain, session } from 'electron'
import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'
import path from 'node:path'
import './printer' // Import printer module
import { initAutoUpdater } from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// V dev buildu se vypínají bezpečnostní varování Electronu; v zabaleném
// buildu zůstává všechno v defaultu.
if (!app.isPackaged) {
  process.env.ELECTRON_IS_DEV = '1';
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    titleBarStyle: 'default',
    icon: path.join(process.env.VITE_PUBLIC, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
  })

  // Show window when ready
  win.once('ready-to-show', () => {
    win?.show()
    win?.focus()
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    // vite-plugin-electron mapuje adresu serveru natvrdo zpátky na "localhost"
    // (resolveHostname), i když Vite posloucháme na 127.0.0.1. Přepisujeme ji,
    // aby dev server nespadl pod HSTS pin, který si Chromium drží pro
    // "localhost" kvůli HTTPS API na témže hostname → ERR_SSL_PROTOCOL_ERROR.
    const devUrl = VITE_DEV_SERVER_URL.replace('//localhost:', '//127.0.0.1:')
    console.log('Loading dev server URL:', devUrl)
    win.loadURL(devUrl)
  } else {
    console.log('Loading production build')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Content-Security-Policy (prod-check H3). Aplikuje se jen v zabaleném buildu,
// ať nekoliduje s Vite HMR v devu. Blokuje pluginy (object-src none), embedování
// (frame-ancestors none) a omezuje zdroje; connect-src povoluje API (http/https)
// a websocket pro realtime. script/style 'unsafe-inline' kvůli inline
// loaderu v index.html.
function applyCsp() {
  if (!app.isPackaged) return
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob:",
    "connect-src 'self' http: https: ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

/**
 * Výjimka z ověřování TLS jen pro API. API se adresuje vždy IP adresou (Pi na
 * veřejné IP, v devu 127.0.0.1 se self-signed certem), takže výjimka platí jen
 * pro IP hosty. Doménová jména (GitHub — stahování aktualizací) se ověřují
 * normálně: bez podpisu buildů je platný TLS jediná ochrana proti podvržené
 * aktualizaci.
 */
function isApiHost(hostname: string): boolean {
  return isIP(hostname.replace(/^\[|\]$/g, '')) !== 0
}

app.whenReady().then(() => {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (isApiHost(new URL(url).hostname)) {
      event.preventDefault()
      callback(true)
    } else {
      callback(false)
    }
  })
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // 0 = přijmout, -3 = použít výsledek standardního ověření Chromia.
    callback(isApiHost(request.hostname) ? 0 : -3)
  })

  applyCsp()
  createWindow()
  initAutoUpdater(() => win)
})
