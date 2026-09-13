import { app, BrowserWindow, dialog } from 'electron'
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
 * Běží jen v zabaleném buildu (v devu není co aktualizovat).
 */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 h — pokladna běží celý den
const FIRST_CHECK_DELAY_MS = 10_000 // nezdržovat start aplikace

export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] nová verze ${info.version} — stahuji`)
  })
  autoUpdater.on('update-not-available', () => {
    console.log(`[updater] aktuální verze ${app.getVersion()}`)
  })
  // Chyba sítě / GitHubu nesmí obsluhu obtěžovat dialogem — zkusí se to
  // při další kontrole.
  autoUpdater.on('error', (err) => {
    console.error('[updater] chyba:', err?.message ?? err)
  })

  let prompted = false
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] verze ${info.version} stažena — nainstaluje se při zavření`)
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

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] kontrola selhala:', err?.message ?? err)
    })
  }
  setTimeout(check, FIRST_CHECK_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)
}
