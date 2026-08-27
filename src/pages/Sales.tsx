import { useCallback, useState } from 'react';
import Pagination from '../components/Pagination';
import { useDebounced } from '../hooks/useDebounced';
import { usePagedList } from '../hooks/usePagedList';
import { orderService } from '../services/orderService';
import { printerService } from '../services/printerService';
import { Order, OrderItem } from '../types/order';

// Date filter options
type DateFilter = 'day' | 'month' | 'year' | 'custom';

const currencyFormat = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
});

const dateFormat = new Intl.DateTimeFormat('cs-CZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

const formatCurrency = (amount: number) => currencyFormat.format(amount);
const formatDate = (value: string | Date) => dateFormat.format(new Date(value));

export default function Sales() {
    const [dateFilter, setDateFilter] = useState<DateFilter>('month');
    // Lazy init — rozsah se spočítá jednou při mountu, ne při každém renderu.
    const [startDate, setStartDate] = useState(
        () => orderService.getDateRangeForFilter('month').startDate,
    );
    const [endDate, setEndDate] = useState(
        () => orderService.getDateRangeForFilter('month').endDate,
    );
    const [searchId, setSearchId] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isPrinting, setIsPrinting] = useState<string | null>(null);

    const debouncedSearch = useDebounced(searchId);

    // Jediný zdroj načítání pro celou obrazovku: změna stránky, období nebo
    // hledání = právě jeden dotaz. Filtrování i řazení řeší server.
    const {
        items: orders,
        total,
        page,
        limit,
        loading,
        error,
        setPage,
        setLimit,
        reload,
    } = usePagedList<Order>({
        fetchPage: (currentPage, currentLimit, signal) =>
            orderService.getOrdersPage(
                {
                    page: currentPage,
                    limit: currentLimit,
                    startDate,
                    endDate,
                    search: debouncedSearch,
                },
                signal,
            ),
        filterKey: [startDate, endDate, debouncedSearch],
    });

    /** Předvolba období přepíše i datumová pole, ať UI zůstane konzistentní. */
    const applyDateFilter = useCallback((next: DateFilter) => {
        setDateFilter(next);
        if (next === 'custom') return;
        const range = orderService.getDateRangeForFilter(next);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
    }, []);

    const handleDeleteOrder = async (id: string) => {
        try {
            await orderService.deleteOrder(id);
            setIsDeleteModalOpen(false);
            setSelectedOrder(null);
            // Znovunačtení stránky místo mazání z pole — jinak by na stránce
            // chyběl řádek, který se má posunout z té následující.
            reload();
        } catch (err) {
            console.error('Failed to delete order:', err);
        }
    };

    const handlePrintReceipt = async (order: Order) => {
        try {
            setIsPrinting(order._id);
            const printResult = await printerService.printReceipt({
                orderNumber: order._id,
                date: formatDate(order.createdAt),
                items: order.items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.unitPrice,
                    total: item.unitPrice * item.quantity,
                })),
                totalAmount: order.totalPrice,
                storeName: 'Hradišťský Vrch',
                storeAddress: 'Vaše adresa zde',
            });

            if (!printResult.success) {
                console.warn('Tisk účtenky selhal:', printResult.error);
            }
        } catch (err) {
            console.error('Failed to print receipt:', err);
        } finally {
            setIsPrinting(null);
        }
    };

    const handleViewOrder = (order: Order) => {
        setSelectedOrder(order);
        setIsViewModalOpen(true);
    };

    const filterButton = (value: DateFilter, label: string) => (
        <button
            onClick={() => applyDateFilter(value)}
            className={`px-3 py-1 rounded-md text-sm transition-colors ${
                dateFilter === value
                    ? 'bg-link text-primary'
                    : 'bg-secondary text-text-secondary hover:bg-primary'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex w-full h-screen">
            <div className="flex-1 overflow-hidden flex flex-col">
                {/* Header with title and filters */}
                <div className="p-4 bg-primary flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-text-secondary/10 gap-2">
                    <h1 className="text-2xl font-bold text-text-primary">Prodeje</h1>

                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex space-x-1">
                            {filterButton('day', 'Dnes')}
                            {filterButton('month', 'Měsíc')}
                            {filterButton('year', 'Rok')}
                            {filterButton('custom', 'Vlastní')}
                        </div>

                        {dateFilter === 'custom' && (
                            <div className="flex items-center space-x-2">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-2 py-1 bg-secondary text-text-primary rounded-md text-sm"
                                />
                                <span className="text-text-secondary text-sm">-</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-2 py-1 bg-secondary text-text-primary rounded-md text-sm"
                                />
                            </div>
                        )}

                        <div className="flex items-center space-x-2 ml-2">
                            <input
                                type="text"
                                placeholder="Hledat podle ID..."
                                value={searchId}
                                onChange={(e) => setSearchId(e.target.value)}
                                className="px-3 py-1 bg-secondary text-text-primary rounded-md text-sm placeholder-text-secondary"
                            />
                            <button
                                onClick={() => setSearchId('')}
                                className="px-3 py-1 bg-link text-primary rounded-md text-sm hover:bg-link/80"
                            >
                                Vymazat
                            </button>
                        </div>
                    </div>
                </div>

                {searchId.trim() && (
                    <div className="px-4 pt-3 text-xs text-text-secondary">
                        Hledání probíhá napříč celou historií — zvolené období se ignoruje.
                    </div>
                )}

                {/* Orders table */}
                <div className="flex-1 overflow-auto p-4">
                    {loading ? (
                        <div className="flex justify-center items-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-link"></div>
                        </div>
                    ) : error ? (
                        <div className="bg-primary border border-error text-error px-4 py-3 rounded mb-4">
                            {error}
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="bg-primary border border-text-secondary/20 text-text-secondary px-4 py-8 rounded text-center">
                            {searchId.trim()
                                ? 'Žádná účtenka s tímto ID'
                                : 'Žádné objednávky pro vybrané období'}
                        </div>
                    ) : (
                        <div className="bg-primary rounded-md overflow-hidden">
                            <table className="w-full text-sm text-text-primary">
                                <thead className="text-xs uppercase bg-secondary/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left">ID Objednávky</th>
                                        <th className="px-4 py-3 text-left">Datum</th>
                                        <th className="px-4 py-3 text-left">Položky</th>
                                        <th className="px-4 py-3 text-right">Celková cena</th>
                                        <th className="px-4 py-3 text-center">Akce</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((order) => (
                                        <tr key={order._id} className="border-b border-secondary/30 hover:bg-secondary/20">
                                            <td className="px-4 py-3 font-mono text-xs">
                                                ...{order._id.slice(12)}
                                            </td>
                                            <td className="px-4 py-3">
                                                {formatDate(order.createdAt)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="max-w-xs">
                                                    {order.items.slice(0, 2).map((item, index) => (
                                                        <div key={index} className="text-xs">
                                                            {item.quantity}x {item.name}
                                                        </div>
                                                    ))}
                                                    {order.items.length > 2 && (
                                                        <div className="text-xs text-text-secondary">
                                                            +{order.items.length - 2} dalších...
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                {formatCurrency(order.totalPrice)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-center space-x-2">
                                                    <button
                                                        onClick={() => handleViewOrder(order)}
                                                        className="p-1 text-link hover:text-link/80 transition-colors"
                                                        title="Zobrazit detail"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handlePrintReceipt(order)}
                                                        disabled={isPrinting === order._id}
                                                        className={`p-1 transition-colors ${
                                                            isPrinting === order._id
                                                                ? 'text-text-secondary cursor-not-allowed'
                                                                : 'text-success hover:text-success/80'
                                                        }`}
                                                        title="Vytisknout účtenku"
                                                    >
                                                        {isPrinting === order._id ? (
                                                            <div className="animate-spin h-4 w-4 border-2 border-text-secondary border-t-transparent rounded-full"></div>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedOrder(order);
                                                            setIsDeleteModalOpen(true);
                                                        }}
                                                        className="p-1 text-error hover:text-error/80 transition-colors"
                                                        title="Smazat objednávku"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {!error && (
                    <Pagination
                        page={page}
                        limit={limit}
                        total={total}
                        loading={loading}
                        onPageChange={setPage}
                        onLimitChange={setLimit}
                    />
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && selectedOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-primary rounded-lg p-2 w-full max-w-md mx-4">
                        <h3 className="text-lg font-bold mb-4 text-text-primary">Potvrdit smazání</h3>
                        <p className="text-text-secondary mb-6">
                            Opravdu chcete smazat tuto objednávku? Tato akce je nevratná.
                        </p>
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="px-4 py-2 bg-secondary text-text-primary rounded-md hover:bg-secondary/70"
                            >
                                Zrušit
                            </button>
                            <button
                                onClick={() => handleDeleteOrder(selectedOrder._id)}
                                className="px-4 py-2 bg-error text-text-primary rounded-md hover:bg-error/80"
                            >
                                Smazat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Order Details Modal */}
            {isViewModalOpen && selectedOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-primary rounded-lg p-2 w-full max-w-md mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-text-primary">Detail objednávky</h3>
                            <button
                                onClick={() => setIsViewModalOpen(false)}
                                className="p-1 rounded-full hover:bg-secondary"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-text-secondary" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-4">
                            <div className="text-text-secondary text-sm mb-1">Datum a čas</div>
                            <div className="text-text-primary">{formatDate(selectedOrder.createdAt)}</div>
                        </div>

                        <div className="mb-4">
                            <div className="text-text-secondary text-sm mb-1">Položky</div>
                            <div className="bg-secondary rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                    <tbody>
                                        {selectedOrder.items.map((item: OrderItem, index: number) => (
                                            <tr key={index} className="border-b border-primary last:border-0">
                                                <td className="px-3 py-2 text-text-primary">
                                                    {item.name}
                                                </td>
                                                <td className="px-3 py-2 text-text-secondary text-right">
                                                    {item.quantity}x
                                                </td>
                                                <td className="px-3 py-2 text-text-primary text-right">
                                                    {formatCurrency(item.unitPrice * item.quantity)}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-primary/30">
                                            <td className="px-3 py-2 font-bold text-text-primary" colSpan={2}>
                                                Celkem
                                            </td>
                                            <td className="px-3 py-2 font-bold text-text-primary text-right">
                                                {formatCurrency(selectedOrder.totalPrice)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={() => handlePrintReceipt(selectedOrder)}
                                disabled={isPrinting === selectedOrder._id}
                                className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                                    isPrinting === selectedOrder._id
                                        ? 'bg-secondary text-text-secondary cursor-not-allowed'
                                        : 'bg-success text-text-primary hover:bg-success/80'
                                }`}
                            >
                                {isPrinting === selectedOrder._id ? (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-text-secondary border-t-transparent rounded-full mr-2"></div>
                                        Tiskne...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                                        </svg>
                                        Tisknout účtenku
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-4 py-2 bg-link text-text-primary rounded-md hover:bg-link/80"
                            >
                                Zavřít
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
