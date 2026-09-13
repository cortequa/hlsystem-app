export interface PrintReceiptData {
  orderNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  date?: string; // Pro zpětnou kompatibilitu
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  totalAmount: number;
  storeName?: string;
  storeAddress?: string;
}

/** Stav auto-updateru z main procesu — zrcadlí `UpdateState` v electron/updater.ts. */
export interface UpdateState {
  status: 'idle' | 'checking' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  currentVersion: string;
  version?: string;
  percent?: number;
  error?: string;
}

declare global {
  interface Window {
    ipcRenderer?: {
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
      send: (channel: string, ...args: unknown[]) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
    electronAPI?: {
      printReceipt: (data: PrintReceiptData) => Promise<{ success: boolean; error?: string }>;
      getPrinters: () => Promise<unknown[]>;
      removeAllListeners: (channel: string) => void;
      updater?: {
        getState: () => Promise<UpdateState>;
        check: () => Promise<void>;
        install: () => Promise<void>;
        onState: (callback: (state: UpdateState) => void) => () => void;
      };
    }
  }
}