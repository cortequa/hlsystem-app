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

class PrinterService {
  async printReceipt(data: PrintReceiptData): Promise<{ success: boolean; error?: string }> {
    if (window.electronAPI) {
      return await window.electronAPI.printReceipt(data);
    }
    
    // Fallback pro web verzi - otevře print dialog
    this.printReceiptWeb(data);
    return { success: true };
  }

  async getAvailablePrinters(): Promise<any[]> {
    if (window.electronAPI) {
      return await window.electronAPI.getPrinters();
    }
    return [];
  }

  private printReceiptWeb(data: PrintReceiptData) {
    const receiptHtml = this.generateReceiptHtml(data);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(receiptHtml);
      doc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }

    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }

  private generateReceiptHtml(data: PrintReceiptData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: monospace; font-size: 12px; width: 58mm; margin: 0; padding: 10px; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .line { border-bottom: 1px dashed #000; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; }
        </style>
      </head>
      <body>
        <div class="center bold">${data.storeName || 'Hradišťský Vrch'}</div>
        ${data.storeAddress ? `<div class="center">${data.storeAddress}</div>` : ''}
        <div class="line"></div>
        <div>Objednávka: ${data.orderNumber}</div>
        <div>Datum: ${data.date}</div>
        <div class="line"></div>
        ${data.items.map(item => `
          <div>${item.name}</div>
          <table>
            <tr>
              <td>${item.quantity}x ${this.formatCurrency(item.price)}</td>
              <td class="right">${this.formatCurrency(item.total)}</td>
            </tr>
          </table>
        `).join('')}
        <div class="line"></div>
        <div class="right bold">CELKEM: ${this.formatCurrency(data.totalAmount)}</div>
        <br>
        <div class="center">Děkujeme za návštěvu!</div>
      </body>
      </html>
    `;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: 'CZK'
    }).format(amount);
  }
}

// Export singleton instance
export const printerService = new PrinterService();
