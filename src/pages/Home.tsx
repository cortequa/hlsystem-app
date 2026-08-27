import { useCallback, useState } from "react";
import Products from "../components/Products";
import Overview, { TicketContext } from "../components/Overview";
import Gates from "../components/Gates";
import PendingArrivals from "../components/PendingArrivals";
import { Product as ProductType } from "../types/product";
import { PendingArrival } from "../types/pendingArrival";

export default function Home() {
    const [selectedProducts, setSelectedProducts] = useState<ProductType[]>([]);
    // Auto u brány, jehož lístek se právě markuje. Drží SPZ i kartu, která
    // se má po dokončení prodeje zavřít.
    const [ticketContext, setTicketContext] = useState<TicketContext | null>(null);

    // Handle product selection
    const handleSelectProduct = useCallback((product: ProductType) => {
        setSelectedProducts(prev => [...prev, product]);
    }, []);

    // Handle order clearing
    const handleClearOrder = useCallback(() => {
        setSelectedProducts([]);
        setTicketContext(null);
    }, []);

    const handleSellTicket = useCallback((arrival: PendingArrival) => {
        setTicketContext({
            plate: arrival.plateText,
            pendingArrivalId: arrival._id,
        });
    }, []);

    return (
        <div className="flex w-full h-dvh">
            <div className="flex flex-1">
                <div className="w-3/5 h-full ">
                    <Products onSelectProduct={handleSelectProduct} />
                </div>
                <div className="flex flex-col w-1/2 flex-1">
                    <div className="w-full h-2/3 flex flex-col">
                        {/* Čekající auta nad košíkem — obsluha je musí vidět
                            dřív, než začne markovat. */}
                        <div className="px-4 pt-3">
                            <PendingArrivals onSellTicket={handleSellTicket} />
                        </div>
                        <div className="flex-1 min-h-0">
                            <Overview
                                selectedProducts={selectedProducts}
                                onClearOrder={handleClearOrder}
                                ticketContext={ticketContext}
                                onTicketResolved={() => setTicketContext(null)}
                            />
                        </div>
                    </div>
                    <div className="w-full h-1/3">
                        <Gates />
                    </div>
                </div>
            </div>
        </div>
    );
}
