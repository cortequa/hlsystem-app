import { useEffect, useState, useCallback, useRef } from "react";
import { Product as ProductType } from "../types/product";
import { OrderProduct } from "../types/order";
import { orderService, CreateOrderDto } from "../services/orderService";
import { pendingArrivalService } from "../services/pendingArrivalService";
import { printerService } from "../services/printerService";
import { stayService } from "../services/stayService";
import { splitName } from "../types/visitor";

/** Prodej vázaný na auto u brány — SPZ i karta, kterou má prodej vyřídit. */
export interface TicketContext {
    plate: string;
    pendingArrivalId?: string;
}

interface OverviewProps {
    selectedProducts?: ProductType[];
    onClearOrder?: () => void;
    /** Předvyplněná SPZ z čekajícího vozu. */
    ticketContext?: TicketContext | null;
    onTicketResolved?: () => void;
}

/** Výchozí délka pobytu prodaného u brány, dokud obsluha neurčí jinak. */
const DEFAULT_NIGHTS = 1;

const todayStart = (): Date => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

export default function Overview({
    selectedProducts = [],
    onClearOrder,
    ticketContext = null,
    onTicketResolved,
}: OverviewProps) {
    // Prodej s SPZ zakládá pobyt, ne holou účtenku — jinak by lístek
    // nevytvořil žádné oprávnění k vjezdu a brána by auto nepustila.
    const [plate, setPlate] = useState("");
    const [guestName, setGuestName] = useState("");
    const [nights, setNights] = useState(DEFAULT_NIGHTS);
    const [saleError, setSaleError] = useState<string | null>(null);

    // Kliknutí na „Prodat lístek" u čekajícího vozu předvyplní SPZ.
    useEffect(() => {
        if (ticketContext?.plate) setPlate(ticketContext.plate);
    }, [ticketContext]);

    const [orderProducts, setOrderProducts] = useState<OrderProduct[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
    const [quantityInput, setQuantityInput] = useState<string>('');
    const [isFirstInput, setIsFirstInput] = useState<boolean>(true);
    const componentRef = useRef<HTMLDivElement>(null);

    // Watch for new products being selected and add them to the order
    useEffect(() => {
        // Check if we have a new product selection
        if (selectedProducts.length > 0) {
            // Get the last selected product (the most recent one)
            const lastSelectedProduct = selectedProducts[selectedProducts.length - 1];

            // Add only the most recently selected product to avoid duplicates
            addToOrder(lastSelectedProduct);
        }
    }, [selectedProducts]);

    // Add a product to the order
    const addToOrder = (product: ProductType) => {
        setOrderProducts(prev => {
            const existing = prev.find(item => item.product._id === product._id);
            let newItemId: string;

            if (existing) {
                // Increment quantity if product already exists in order
                newItemId = existing._id!;
                const updated = prev.map(item =>
                    item.product._id === product._id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
                setLastAddedItemId(newItemId);
                setQuantityInput((existing.quantity + 1).toString());
                setIsFirstInput(true);
                return updated;
            }

            // Add new product to order
            newItemId = `${product._id}-${Date.now()}`;
            setLastAddedItemId(newItemId);
            setQuantityInput('1');
            setIsFirstInput(true);
            return [...prev, {
                product,
                quantity: 1,
                _id: newItemId
            }];
        });
    };

    // Update item quantity
    const updateQuantity = (itemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            setOrderProducts(prev => prev.filter(item => item._id !== itemId));
            if (itemId === lastAddedItemId) {
                setLastAddedItemId(null);
                setQuantityInput('');
            }
            return;
        }

        setOrderProducts(prev =>
            prev.map(item =>
                item._id === itemId ? { ...item, quantity: newQuantity } : item
            )
        );

        if (itemId === lastAddedItemId) {
            setQuantityInput(newQuantity.toString());
            // Neměníme isFirstInput při aktualizaci množství z kódu
        }
    };

    // Calculate total price
    const totalPrice = orderProducts.reduce(
        (sum, item) => sum + (item.product.price * item.quantity), 0
    );

    // Format price with Czech locale
    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('cs-CZ', {
            style: 'currency',
            currency: 'CZK'
        }).format(price);
    };

    // Clear the entire order
    const clearOrder = () => {
        setOrderProducts([]);
        setLastAddedItemId(null);
        setQuantityInput('');
        setIsFirstInput(true);
        setPlate('');
        setGuestName('');
        setNights(DEFAULT_NIGHTS);
        setSaleError(null);
        onClearOrder?.();
    };

    // Handle keyboard input for quantity changes
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!lastAddedItemId) return;

        const key = event.key;

        // Handle numeric input (0-9)
        if (/^[0-9]$/.test(key)) {
            event.preventDefault();
            
            let newInput: string;
            if (isFirstInput) {
                // První vstup přepíše stávající hodnotu
                newInput = key;
                setIsFirstInput(false);
            } else {
                // Další vstupy se připojují
                newInput = quantityInput + key;
            }
            
            const newQuantity = parseInt(newInput);
            
            if (newQuantity > 0 && newQuantity <= 999) { // Limit to reasonable quantity
                setQuantityInput(newInput);
                updateQuantity(lastAddedItemId, newQuantity);
            }
        }
        // Handle backspace
        else if (key === 'Backspace') {
            event.preventDefault();
            setIsFirstInput(false);
            
            if (quantityInput.length > 0) {
                const newInput = quantityInput.slice(0, -1);
                if (newInput === '' || newInput === '0') {
                    // If empty or zero, remove the item
                    setQuantityInput('');
                    updateQuantity(lastAddedItemId, 0);
                } else {
                    const newQuantity = parseInt(newInput);
                    setQuantityInput(newInput);
                    updateQuantity(lastAddedItemId, newQuantity);
                }
            }
        }
        // Handle Enter to confirm and clear selection
        else if (key === 'Enter') {
            event.preventDefault();
            setLastAddedItemId(null);
            setQuantityInput('');
            setIsFirstInput(true);
        }
        // Handle Escape to clear selection without changing quantity
        else if (key === 'Escape') {
            event.preventDefault();
            setLastAddedItemId(null);
            setQuantityInput('');
            setIsFirstInput(true);
        }
    }, [lastAddedItemId, quantityInput, isFirstInput, updateQuantity]);

    // Set up keyboard event listener
    useEffect(() => {
        if (lastAddedItemId) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [lastAddedItemId, handleKeyDown]);

    // Handle clicking outside to deselect active item
    const handleItemClick = (itemId: string) => {
        if (itemId === lastAddedItemId) {
            // Clicking on already active item deselects it
            setLastAddedItemId(null);
            setQuantityInput('');
            setIsFirstInput(true);
        } else {
            // Clicking on different item makes it active
            const item = orderProducts.find(p => p._id === itemId);
            if (item) {
                setLastAddedItemId(itemId);
                setQuantityInput(item.quantity.toString());
                setIsFirstInput(true);
            }
        }
    };

    /**
     * Dokončení prodeje.
     *
     * Bez SPZ je to běžný prodej v bufetu → holá účtenka. S SPZ jde o lístek
     * ke vjezdu, a ten musí založit POBYT — účtenka sama žádné oprávnění
     * k vjezdu nevytváří a brána by auto nepustila. `POST /stays` založí
     * obojí najednou, takže obsluze nemůže zůstat zaplacený lístek bez
     * pobytu (ani naopak).
     */
    const handleCompleteSale = async () => {
        if (orderProducts.length === 0 || isProcessing) return;

        const products = orderProducts.map(item => ({
            productId: item.product._id,
            quantity: item.quantity,
        }));

        try {
            setIsProcessing(true);
            setSaleError(null);

            const trimmedPlate = plate.trim().toUpperCase();
            let receiptNumber: string;

            if (trimmedPlate) {
                const visitor = splitName(guestName) ?? { lastName: 'Host' };
                const from = todayStart();
                const to = new Date(from);
                to.setDate(to.getDate() + Math.max(1, nights));

                const result = await stayService.create({
                    visitor,
                    from: from.toISOString(),
                    to: to.toISOString(),
                    vehicles: [{ plate: trimmedPlate }],
                    products,
                });
                receiptNumber = result.orderId ?? result.stayId;

                // Karta u brány se zavře až po úspěšném založení pobytu.
                // Podle politiky brány se přitom závora otevře (`auto_open`),
                // nebo počká na ruční potvrzení obsluhy (`confirm`).
                if (ticketContext?.pendingArrivalId) {
                    await pendingArrivalService
                        .link(ticketContext.pendingArrivalId, result.stayId)
                        .catch((err: unknown) => {
                            // Pobyt existuje a je zaplacený — SPZ je v něm.
                            // Neúspěšné zavření karty prodej neruší.
                            console.warn('Karta u brány se nezavřela:', err);
                        });
                    onTicketResolved?.();
                }
            } else {
                const orderData: CreateOrderDto = {
                    products,
                    date: new Date().toISOString(),
                };
                receiptNumber = await orderService.createOrder(orderData);
            }

            // Připravení dat pro tisk
            const receiptData = {
                orderNumber: receiptNumber || 'N/A',
                date: new Date().toLocaleString('cs-CZ'),
                items: orderProducts.map(item => ({
                    name: item.product.name,
                    quantity: item.quantity,
                    price: item.product.price,
                    total: item.product.price * item.quantity
                })),
                totalAmount: totalPrice,
                storeName: 'Hradišťský Vrch',
                storeAddress: 'Vaše adresa zde'
            };

            // Tisk účtenky
            const printResult = await printerService.printReceipt(receiptData);

            clearOrder();

            if (!printResult.success) {
                console.warn('Tisk selhal:', printResult.error);
            }
        } catch (error) {
            console.error('Failed to complete sale:', error);
            setSaleError(
                error instanceof Error ? error.message : 'Prodej se nepodařilo dokončit.',
            );
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div ref={componentRef} className="w-full h-full bg-primary flex flex-col p-4" tabIndex={0}>
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-bold text-text-primary">Objednávka</h2>
                <button
                    onClick={clearOrder}
                    disabled={orderProducts.length === 0}
                    className={`px-3 py-1 text-text-primary rounded-md text-sm transition-colors ${orderProducts.length === 0
                            ? 'bg-error/40 cursor-not-allowed'
                            : 'bg-error/80 hover:bg-error'
                        }`}
                >
                    Vymazat
                </button>
            </div>

            {orderProducts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-text-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-30" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                    </svg>
                    <p>Žádné produkty</p>
                    <p className="text-xs mt-1">Vyberte produkty pro objednávku</p>
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-auto">
                        <div className="space-y-1">
                            {orderProducts.map((item) => {
                                const isActiveItem = item._id === lastAddedItemId;
                                return (
                                    <div 
                                        key={item._id} 
                                        onClick={() => handleItemClick(item._id!)}
                                        className={`grid grid-cols-[1fr_auto_auto] gap-4 items-center p-2 rounded-md transition-all cursor-pointer ${
                                            isActiveItem 
                                                ? 'bg-success/20 border-2 border-success/50 ring-2 ring-success/30' 
                                                : 'bg-secondary/30 hover:bg-secondary/50'
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <h4 className="text-text-primary font-medium text-sm truncate">{item.product.name}</h4>
                                            <p className="text-text-secondary text-xs">{formatPrice(item.product.price)}</p>
                                        </div>
                                        <div className="flex items-center space-x-2 w-24 justify-center">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateQuantity(item._id!, item.quantity - 1);
                                                    setIsFirstInput(true); // Po kliknutí na tlačítko můžeme začít znovu
                                                }}
                                                className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center text-text-primary hover:bg-primary text-sm"
                                            >
                                                -
                                            </button>
                                            <span className={`w-8 text-center ${
                                                isActiveItem ? 'text-success font-bold' : 'text-text-primary'
                                            }`}>
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateQuantity(item._id!, item.quantity + 1);
                                                    setIsFirstInput(true); // Po kliknutí na tlačítko můžeme začít znovu
                                                }}
                                                className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center text-text-primary hover:bg-primary text-sm"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div className="text-right w-20">
                                            <p className="text-text-primary font-medium text-sm">
                                                {formatPrice(item.product.price * item.quantity)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mt-4 border-t border-text-secondary/10 pt-4">
                        {/* Vyplněná SPZ dělá z prodeje lístek ke vjezdu: založí
                            pobyt, ne holou účtenku. Prázdná = běžný prodej. */}
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-3">
                            <input
                                value={plate}
                                onChange={(e) => setPlate(e.target.value)}
                                placeholder="SPZ (volitelné)"
                                className="px-2 py-1.5 rounded-md bg-secondary/40 text-text-primary font-mono uppercase text-sm placeholder-text-secondary"
                            />
                            <input
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                placeholder="Jméno hosta"
                                disabled={!plate.trim()}
                                className="px-2 py-1.5 rounded-md bg-secondary/40 text-text-primary text-sm placeholder-text-secondary disabled:opacity-40"
                            />
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={nights}
                                    onChange={(e) => setNights(Number(e.target.value) || 1)}
                                    disabled={!plate.trim()}
                                    className="w-14 px-2 py-1.5 rounded-md bg-secondary/40 text-text-primary text-sm disabled:opacity-40"
                                />
                                <span className="text-text-secondary text-xs">nocí</span>
                            </div>
                        </div>

                        {saleError && (
                            <div className="text-error text-xs mb-2">{saleError}</div>
                        )}

                        <div className="flex justify-between items-center mb-4">
                            <span className="text-text-primary font-medium">Celkem</span>
                            <span className="text-text-primary text-xl font-bold">{formatPrice(totalPrice)}</span>
                        </div>

                        <button
                            onClick={handleCompleteSale}
                            disabled={orderProducts.length === 0 || isProcessing}
                            className={`w-full py-3 text-primary rounded-md transition-colors ${orderProducts.length === 0 || isProcessing
                                    ? 'bg-success/40 cursor-not-allowed'
                                    : 'bg-success hover:bg-success/80'
                                }`}
                        >
                            {isProcessing ? (
                                <div className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-text-primary mr-2"></div>
                                    Zpracování...
                                </div>
                            ) : (
                                plate.trim() ? 'Prodat a pustit' : 'Dokončit prodej'
                            )}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}