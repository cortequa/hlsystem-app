import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { UpdateState } from './updater'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (data: unknown) => ipcRenderer.invoke('print-receipt', data),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    // Vrací odhlášení — listener se neodregistruje přes removeAllListeners,
    // ať nesmaže i cizí posluchače téhož kanálu.
    onState: (callback: (state: UpdateState) => void) => {
      const listener = (_event: IpcRendererEvent, state: UpdateState) => callback(state)
      ipcRenderer.on('updater:state', listener)
      return () => ipcRenderer.removeListener('updater:state', listener)
    },
  },
})

// Extend the Window interface
export interface ElectronAPI {
  printReceipt: (data: unknown) => Promise<{ success: boolean; error?: string }>;
  getPrinters: () => Promise<unknown[]>;
  removeAllListeners: (channel: string) => void;
  updater: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<void>;
    install: () => Promise<void>;
    onState: (callback: (state: UpdateState) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
