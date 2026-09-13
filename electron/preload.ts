import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (data: unknown) => ipcRenderer.invoke('print-receipt', data),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
})

// Extend the Window interface
export interface ElectronAPI {
  printReceipt: (data: unknown) => Promise<{ success: boolean; error?: string }>;
  getPrinters: () => Promise<unknown[]>;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
