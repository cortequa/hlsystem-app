import { useEffect, useState } from 'react';
import { productService } from '../services/productService';
import { Product } from '../types/product';
import { orderService } from '../services/orderService';

interface TaxReductionItem {
  productId: string;
  quantity: number;
}

export default function TaxReduction() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [dateMode, setDateMode] = useState<'day' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reductionHistory, setReductionHistory] = useState<Array<{
    _id: string;
    createdAt: string;
    productId: string;
    requestedQuantity: number;
    removedQuantity: number;
    periodFrom: string;
    periodTo: string;
    reason: string;
    createdBy: string;
    affectedOrders: unknown[];
  }>>([]);

  useEffect(() => {
    fetchProducts();
    void loadReductionHistory();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await productService.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReductionHistory = async () => {
    try {
      setReductionHistory(await orderService.getReductionHistory());
    } catch (error) {
      console.error('Nelze načíst serverovou historii redukcí:', error);
    }
  };

  const handleTaxReduction = async () => {
    if (!selectedProduct || quantity <= 0) {
      return;
    }

    const selectedProductData = products.find(p => p._id === selectedProduct);
    if (!selectedProductData) {
      return;
    }

    try {
      setIsProcessing(true);
      setOperationMessage(null);

      // Vypočítáme datový rozsah podle zvoleného režimu
      let dateRange: { from: string; to: string };
      if (dateMode === 'day') {
        const [y, m, d] = selectedDate.split('-').map(Number);
        dateRange = {
          from: new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString(),
          to: new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).toISOString(),
        };
      } else {
        const [y, m] = selectedMonth.split('-').map(Number);
        dateRange = {
          from: new Date(y, (m ?? 1) - 1, 1, 0, 0, 0, 0).toISOString(),
          to: new Date(y, m ?? 1, 0, 23, 59, 59, 999).toISOString(),
        };
      }

      const result = await orderService.reduceTaxForProduct(selectedProduct, quantity, dateRange);
      
      if (result.removedQuantity === result.requestedQuantity) {
        setOperationMessage(`Odebráno přesně ${result.removedQuantity} ks produktu "${selectedProductData.name}". Ovlivněno účtenek: ${result.affectedOrders.length}.`);
        void loadReductionHistory();
        
        // Reset form
        setSelectedProduct('');
        setQuantity(0);
      } else {
        throw new Error('Backend vrátil nekonzistentní výsledek redukce.');
      }
    } catch (error) {
      console.error('Error during cost reduction:', error);
      setOperationMessage(`Operace nebyla provedena. ${error instanceof Error ? error.message : 'Neznámá chyba.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: 'CZK'
    }).format(amount);
  };

  const selectedProductData = products.find(p => p._id === selectedProduct);
  const estimatedValue = selectedProductData ? selectedProductData.price * quantity : 0;

  return (
    <div className="flex w-full h-screen">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-primary flex justify-between items-center border-b border-text-secondary/10">
          <h1 className="text-2xl font-bold text-text-primary">Redukce nákladů</h1>
          <div className="text-sm text-text-secondary">
            Optimalizace provozních výdajů
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost Reduction Form */}
            <div className="bg-primary rounded-lg p-2 shadow-sm">
              <h2 className="text-xl font-bold mb-4 text-text-primary">Nová redukce</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="product" className="block text-sm font-medium text-text-secondary mb-2">
                    Vyberte položku pro optimalizaci
                  </label>
                  <select
                    id="product"
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary border border-text-secondary/20 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-link"
                    disabled={loading || isProcessing}
                  >
                    <option value="">-- Vyberte položku --</option>
                    {products.map(product => (
                      <option key={product._id} value={product._id}>
                        {product.name} ({formatCurrency(product.price)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quantity" className="block text-sm font-medium text-text-secondary mb-2">
                    Množství k optimalizaci
                  </label>
                  <input
                    type="number"
                    id="quantity"
                    min="1"
                    value={quantity || ''}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-secondary border border-text-secondary/20 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-link"
                    disabled={isProcessing}
                    placeholder="Zadejte počet kusů"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Období optimalizace
                  </label>
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setDateMode('day')}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        dateMode === 'day'
                          ? 'bg-link text-white'
                          : 'bg-secondary text-text-secondary hover:bg-secondary/80'
                      }`}
                      disabled={isProcessing}
                    >
                      Konkrétní den
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode('month')}
                      className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                        dateMode === 'month'
                          ? 'bg-link text-white'
                          : 'bg-secondary text-text-secondary hover:bg-secondary/80'
                      }`}
                      disabled={isProcessing}
                    >
                      Celý měsíc
                    </button>
                  </div>

                  {dateMode === 'day' ? (
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 bg-secondary border border-text-secondary/20 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-link"
                      disabled={isProcessing}
                    />
                  ) : (
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-3 py-2 bg-secondary border border-text-secondary/20 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-link"
                      disabled={isProcessing}
                    />
                  )}
                </div>

                {selectedProductData && quantity > 0 && (
                  <div className="bg-secondary/50 p-4 rounded-md">
                    <h3 className="font-medium text-text-primary mb-2">Přehled optimalizace</h3>
                    <div className="space-y-1 text-sm text-text-secondary">
                      <div>Položka: {selectedProductData.name}</div>
                      <div>Jednotková cena: {formatCurrency(selectedProductData.price)}</div>
                      <div>Množství: {quantity} ks</div>
                      <div>Období: {dateMode === 'day'
                        ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('cs-CZ')
                        : new Date(selectedMonth + '-01T00:00:00').toLocaleDateString('cs-CZ', { year: 'numeric', month: 'long' })
                      }</div>
                      <div className="font-medium text-success">
                        Úspora nákladů: {formatCurrency(estimatedValue)}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleTaxReduction}
                  disabled={!selectedProduct || quantity <= 0 || isProcessing}
                  className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                    !selectedProduct || quantity <= 0 || isProcessing
                      ? 'bg-secondary text-text-secondary cursor-not-allowed'
                      : 'bg-success text-text-primary hover:bg-success/80'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-text-primary mr-2"></div>
                      Optimalizuje se...
                    </div>
                  ) : (
                    'Provést redukci nákladů'
                  )}
                </button>
                {operationMessage && (
                  <div className="mt-3 whitespace-pre-line rounded-md bg-secondary/50 p-3 text-sm text-text-primary">
                    {operationMessage}
                  </div>
                )}
              </div>

              {/* Warning */}
              <div className="mt-6 p-4 bg-success/10 border border-success/20 rounded-md">
                <div className="flex items-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-success mt-0.5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-success font-medium">Informace</h4>
                    <p className="text-success text-sm mt-1">
                      Redukce nákladů optimalizuje provozní výdaje odstraněním nadbytečných položek z historických transakcí.
                      Proces je nevratný a slouží k zlepšení ekonomické efektivity provozu.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* History */}
            <div className="bg-primary rounded-lg p-2 shadow-sm">
              <h2 className="text-xl font-bold mb-4 text-text-primary">Historie optimalizací</h2>
              
              {reductionHistory.length === 0 ? (
                <div className="text-center text-text-secondary py-8">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 opacity-30" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 12a1 1 0 102 0V8a1 1 0 10-2 0v4zm1-7a1 1 0 100 2 1 1 0 000-2z" />
                    <path fillRule="evenodd" d="M10 2C5.477 2 2 5.477 2 10s3.477 8 8 8 8-3.477 8-8-3.477-8-8-8zM4 10a6 6 0 1112 0A6 6 0 014 10z" clipRule="evenodd" />
                  </svg>
                  <p>Žádné optimalizace nebyly provedeny</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {reductionHistory.map((entry, index) => (
                    <div key={index} className="bg-secondary/30 p-3 rounded-md border-l-4 border-success">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-text-primary">{products.find(p => p._id === entry.productId)?.name ?? entry.productId}</h4>
                        <span className="text-xs text-text-secondary">{new Date(entry.createdAt).toLocaleString('cs-CZ')}</span>
                      </div>
                      <div className="text-sm text-text-secondary">
                        <div>Odebráno: {entry.removedQuantity} / požadováno {entry.requestedQuantity} ks</div>
                        <div>Ovlivněno účtenek: {entry.affectedOrders.length}</div>
                        <div>Období: {new Date(entry.periodFrom).toLocaleString('cs-CZ')} – {new Date(entry.periodTo).toLocaleString('cs-CZ')}</div>
                        <div>Provedl: {entry.createdBy}</div>
                        <div className="text-success font-medium">✓ Náklady redukovány</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
