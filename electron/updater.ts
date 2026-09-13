import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

// electron-updater je CommonJS — v ESM main procesu jen přes default import.
const { autoUpdater } = electronUpdater

/**
 * Automatické aktualizace z GitHub Releases (cortequa/hlsystem-app).
 *
 * Pokladna nesmí vyžadovat žádný zásah obsluhy: nová verze se stáhne na
 * pozadí a nainstaluje při zavření aplikace. Restart se jen NABÍDNE — vynucený
 * restart by mohl přerušit rozpracovaný prodej.
 *
 * Stav se zároveň posílá do okna (UpdateStatus vpravo dole): obsluha vidí
 * verzi, průběh stahování a může kontrolu i instalaci spustit ručně — ruční
 * stažení AppImage z GitHubu po ní chtít nejde.
 *
 * Kontroly běží jen v zabaleném buildu (v devu není co aktualizovat).
 */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 h — pokladna běží celý den
const FIRST_CHECK_DELAY_MS = 10_000 // nezdržovat start aplikace

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  /** Verze, která se stahuje / je stažená. */
  version?: string
  /** Průběh stahování 0–100. */
  percent?: number
  error?: string
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  let state: UpdateState = {
    status: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
  }
  const setState = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch }
    getWindow()?.webContents.send('updater:state', state)
  }

  ipcMain.handle('updater:get-state', () => state)
  ipcMain.handle('updater:install', () => {
    if (state.status === 'downloaded') autoUpdater.quitAndInstall(true, true)
  })

  const check = () => {
    if (!app.isPackaged) return
    // Během stahování / po stažení by nová kontrola jen přepsala stav.
    if (state.status === 'downloading' || state.status === 'downloaded') return
    setState({ status: 'checking', error: undefined })
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] kontrola selhala:', err?.message ?? err)
      setState({ status: 'error', error: String(err?.message ?? err) })
    })
  }
  ipcMain.handle('updater:check', () => check())

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] nová verze ${info.version} — stahuji`)
    setState({ status: 'downloading', version: info.version, percent: 0 })
  })
  autoUpdater.on('update-not-available', () => {
    console.log(`[updater] aktuální verze ${app.getVersion()}`)
    setState({ status: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    setState({ status: 'downloading', percent: p.percent })
  })
  // Chyba sítě / GitHubu nesmí obsluhu obtěžovat dialogem — ukáže se jen
  // nenápadně v UpdateStatus a zkusí se to při další kontrole.
  autoUpdater.on('error', (err) => {
    console.error('[updater] chyba:', err?.message ?? err)
    setState({ status: 'error', error: String(err?.message ?? err) })
  })

  let prompted = false
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] verze ${info.version} stažena — nainstaluje se při zavření`)
    setState({ status: 'downloaded', version: info.version, percent: 100 })
    const win = getWindow()
    if (prompted || !win) return
    prompted = true
    void dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Aktualizace připravena',
        message: `Nová verze ${info.version} je stažená.`,
        detail: 'Nainstaluje se sama při zavření aplikace. Můžete restartovat hned, nebo pokračovat v práci.',
        buttons: ['Restartovat nyní', 'Později'],
        defaultId: 1,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(true, true)
      })
  })

  setTimeout(check, FIRST_CHECK_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)
}
