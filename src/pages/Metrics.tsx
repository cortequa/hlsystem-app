import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { orderService, OrderStats } from '../services/orderService';
import { printerService } from '../services/printerService';
import { DateFilter } from '../types/metrics';

const EMPTY_STATS: OrderStats = {
  periods: [],
  products: [],
  totalRevenue: 0,
  orderCount: 0,
};

function toDayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function Metrics() {
  // Granularity control
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');

  // Always visible date range controls
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return toDayString(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState<string>(() => toDayString(new Date()));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OrderStats>(EMPTY_STATS);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const { periods, products, totalRevenue } = stats;

  /**
   * Tržby počítá databáze jednou agregací. Dřív se kvůli tomu stahovala celá
   * kolekce objednávek i ceník a všechno se sčítalo v prohlížeči — a kvůli
   * dvěma efektům na mountu rovnou dvakrát.
   */
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    orderService
      .getStats({ startDate, endDate }, dateFilter, controller.signal)
      .then((result) => {
        if (!active) return;
        setStats(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof Error && err.name === 'AbortError')) return;
        console.error('Error fetching metrics data:', err);
        setError('Načtení metrik se nezdařilo. Zkuste to prosím znovu.');
        setStats(EMPTY_STATS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [dateFilter, startDate, endDate, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  // Handle printing metrics summary
  const handlePrintMetrics = async () => {
    try {
      setIsPrinting(true);
      
      // Agregace přichází ze serveru už seřazená podle tržby.
      const productsSorted = products.filter(product => product.quantity > 0);

      // Prepare receipt data for metrics summary - simple format
      const receiptData = {
        orderNumber: `PŘEHLED-${Date.now()}`,
        dateFrom: new Date(startDate).toLocaleDateString('cs-CZ'),
        dateTo: new Date(endDate).toLocaleDateString('cs-CZ'),
        items: productsSorted.map(product => ({
          name: product.name,
          quantity: product.quantity,
          price: product.revenue / product.quantity, // Average price per unit
          total: product.revenue
        })),
        totalAmount: totalRevenue,
        storeName: 'Hradišťský Vrch'
      };

      // Print receipt
      const printResult = await printerService.printReceipt(receiptData);
      
      if (!printResult.success) {
        console.warn('Tisk přehledu selhal:', printResult.error);
      }
    } catch (error) {
      console.error('Failed to print metrics:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: 'CZK'
    }).format(amount);
  };

  // Format period label for display
  const formatPeriodLabel = (label: string) => {
    try {
      if (dateFilter === 'day') {
        // Format YYYY-MM-DD
        const date = new Date(label);
        if (isNaN(date.getTime())) {
          return label; // Fallback if date is invalid
        }
        return new Intl.DateTimeFormat('cs-CZ', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(date);
      } else if (dateFilter === 'month') {
        // Format YYYY-MM as Month YYYY
        const parts = label.split('-');
        if (parts.length !== 2) {
          return label; // Return original label if not in YYYY-MM format
        }
        const [year, month] = parts;
        const yearNum = parseInt(year);
        const monthNum = parseInt(month) - 1;
        
        if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 0 || monthNum > 11) {
          return label; // Return original if parsing fails
        }
        
        return new Intl.DateTimeFormat('cs-CZ', {
          year: 'numeric',
          month: 'long'
        }).format(new Date(yearNum, monthNum, 1));
      } else {
        // Just return year
        return label;
      }
    } catch (err) {
      console.error("Error formatting date label:", label, err);
      return label; // Fallback to original label on error
    }
  };

  // Prepare chart data
  const chartData = periods.map(period => ({
    period: formatPeriodLabel(period.key),
    Celkem: period.revenue,
  }));

  // Agregace je seřazená podle tržby sestupně — stačí useknout.
  const topProducts = products.slice(0, 5);
  const totalQuantity = products.reduce((sum, product) => sum + product.quantity, 0);

  return (
    <div className="flex w-full h-screen">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with title and filters - fixed position */}
        <div className="p-4 bg-primary flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-text-secondary/10 gap-2 z-10">
          <h1 className="text-2xl font-bold text-text-primary">Metriky</h1>

          <div className="flex flex-wrap gap-4 items-center">
            {/* Date range inputs - always visible */}
            <div className="flex items-center space-x-2">
              <span className="text-text-secondary text-sm">Od:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 bg-secondary text-text-primary rounded-md text-sm"
              />
              <span className="text-text-secondary text-sm">Do:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 bg-secondary text-text-primary rounded-md text-sm"
              />
            </div>
            
            {/* Granularity controls */}
            <div className="flex items-center">
              <span className="text-text-secondary text-sm mr-2">po:</span>
              <div className="flex space-x-1">
                <button
                  onClick={() => setDateFilter('day')}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    dateFilter === 'day'
                      ? 'bg-link text-primary'
                      : 'bg-primary text-text-secondary hover:bg-secondary'
                  }`}
                >
                  Dnech
                </button>
                <button
                  onClick={() => setDateFilter('month')}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    dateFilter === 'month'
                      ? 'bg-link text-primary'
                      : 'bg-primary text-text-secondary hover:bg-secondary'
                  }`}
                >
                  Měsících
                </button>
                <button
                  onClick={() => setDateFilter('year')}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    dateFilter === 'year'
                      ? 'bg-link text-primary'
                      : 'bg-primary text-text-secondary hover:bg-secondary'
                  }`}
                >
                  Letech
                </button>
              </div>
            </div>

            <button
              onClick={refresh}
              className="px-3 py-1 bg-link text-primary rounded-md text-sm hover:bg-link/80 transition-colors"
            >
              Obnovit
            </button>

            {/* Print Metrics Button */}
            <button
              onClick={handlePrintMetrics}
              disabled={isPrinting || loading || totalRevenue === 0}
              className={`px-3 py-1 rounded-md text-sm text-primary transition-colors flex items-center ${
                isPrinting || loading || totalRevenue === 0
                  ? 'bg-secondary text-text-secondary cursor-not-allowed'
                  : 'bg-success text-primary hover:bg-success/80'
              }`}
            >
              {isPrinting ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 text-primay border-text-secondary border-t-transparent rounded-full mr-2"></div>
                  Tiskne...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                  </svg>
                  Tisk
                </>
              )}
            </button>
          </div>
        </div>

        {/* Metrics content - scrollable */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-link"></div>
            </div>
          ) : error ? (
            <div className="bg-primary border border-error text-error px-4 py-3 rounded mb-4">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {/* Summary Card */}
              <div className="bg-primary rounded-lg p-2 shadow-sm">
                <h2 className="text-xl font-semibold text-text-primary mb-4">Souhrn</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-secondary/50 rounded-md p-4">
                    <div className="text-text-secondary text-sm">Celková tržba</div>
                    <div className="text-2xl font-bold text-text-primary">{formatCurrency(totalRevenue)}</div>
                  </div>
                  <div className="bg-secondary/50 rounded-md p-4">
                    <div className="text-text-secondary text-sm">Produktů celkem</div>
                    <div className="text-2xl font-bold text-text-primary">{products.length}</div>
                  </div>
                  <div className="bg-secondary/50 rounded-md p-4">
                    <div className="text-text-secondary text-sm">Prodaných kusů</div>
                    <div className="text-2xl font-bold text-text-primary">
                      {totalQuantity}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Products Card */}
              <div className="bg-primary rounded-lg p-2 shadow-sm">
                <h2 className="text-xl font-semibold text-text-primary mb-4">Top 5 produktů</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-secondary/30">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Produkt</th>
                        <th className="px-3 py-2 text-right">Množství</th>
                        <th className="px-3 py-2 text-right">Tržba</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((product, index) => (
                        <tr key={product.productId} className="border-b border-secondary/20">
                          <td className="px-3 py-2 text-text-secondary">{index + 1}</td>
                          <td className="px-3 py-2 text-text-primary">{product.name}</td>
                          <td className="px-3 py-2 text-right text-text-primary">{product.quantity}</td>
                          <td className="px-3 py-2 text-right text-text-primary font-medium">
                            {formatCurrency(product.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Revenue Chart */}
              <div className="bg-primary rounded-lg p-2 shadow-sm lg:col-span-2">
                <h2 className="text-xl font-semibold text-text-primary mb-4">
                  {dateFilter === 'day' 
                    ? 'Vývoj tržeb po dnech' 
                    : dateFilter === 'month' 
                      ? 'Vývoj tržeb po měsících'
                      : 'Vývoj tržeb po letech'
                  }
                </h2>
                <div className="h-80">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#36393e" />
                        <XAxis 
                          dataKey="period" 
                          stroke="#d1d1d1" 
                          fontSize={12}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis 
                          stroke="#d1d1d1" 
                          fontSize={12}
                          tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#36393e', 
                            border: '1px solid #d1d1d1',
                            borderRadius: '6px',
                            color: '#fff'
                          }}
                          formatter={(value: any) => [formatCurrency(value), 'Tržba']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Celkem" 
                          stroke="#2563EB" 
                          strokeWidth={2}
                          dot={{ fill: '#2563EB', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: '#2563EB', strokeWidth: 2, fill: '#fff' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-text-secondary">
                      Žádná data pro graf
                    </div>
                  )}
                </div>
              </div>

              {/* Period Data Table */}
              <div className="bg-primary rounded-lg p-2 shadow-sm lg:col-span-2">
                <h2 className="text-xl font-semibold text-text-primary mb-4">
                  {dateFilter === 'day' 
                    ? 'Detaily po dnech' 
                    : dateFilter === 'month' 
                      ? 'Detaily po měsících'
                      : 'Detaily po letech'
                  }
                </h2>
                {periods.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-text-primary">
                      <thead className="text-xs uppercase bg-secondary/30">
                        <tr>
                          <th className="px-4 py-3 text-left">Období</th>
                          <th className="px-4 py-3 text-left">Nejprodávanější</th>
                          <th className="px-4 py-3 text-right">Celková tržba</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periods.map((period) => (
                          <tr key={period.key} className="border-b border-secondary/20">
                            <td className="px-4 py-3 font-medium">
                              {formatPeriodLabel(period.key)}
                            </td>
                            <td className="px-4 py-3">
                              {period.topProduct
                                ? `${period.topProduct.name} (${period.topProduct.quantity}ks)`
                                : 'Žádné prodeje'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {formatCurrency(period.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-secondary/20 border border-text-secondary/10 text-text-secondary px-4 py-8 rounded text-center">
                    Žádná data za vybrané období
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}