import { useCallback, useEffect, useState } from "react";
import { orderService } from "../services/orderService";
import { printerService } from "../services/printerService";
import { productService } from "../services/productService";
import { stayService } from "../services/stayService";
import { Order } from "../types/order";
import { Product as ProductType } from "../types/product";
import { Stay } from "../types/stay";
import Product from "./Product";

interface Props {
  stay: Stay;
  /** Jméno hosta do hlavičky — modal si ho sám nedohledává. */
  guestName: string;
  onClose: () => void;
}

interface CartItem {
  product: ProductType;
  quantity: number;
}

const currencyFormat = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
});

const dateTimeFormat = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatCurrency = (amount: number) => currencyFormat.format(amount);

export default function StayOrderModal({ stay, guestName, onClose }: Props) {
  const [products, setProducts] = useState<ProductType[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sprchové kredity tu záměrně nejsou — bez UID čipu by se cena naúčtovala,
  // ale host by žádný kredit nedostal. Jejich cesta vede přes pokladnu.
  useEffect(() => {
    let active = true;
    productService
      .getProducts()
      .then((list) => {
        if (active) setProducts(list.filter((p) => p.kind !== "shower_credit"));
      })
      .catch((err: unknown) => {
        console.error("Failed to load products:", err);
        if (active) setError("Načtení produktů se nezdařilo.");
      });
    return () => {
      active = false;
    };
  }, []);

  const loadHistory = useCallback(() => {
    orderService
      .getOrdersForStay(stay._id)
      .then(setHistory)
      .catch((err: unknown) => {
        console.error("Failed to load stay orders:", err);
      });
  }, [stay._id]);

  useEffect(loadHistory, [loadHistory]);

  const addToCart = (product: ProductType) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product._id === product._id);
      if (!existing) return [...prev, { product, quantity: 1 }];
      return prev.map((item) =>
        item.product._id === product._id
          ? { ...item, quantity: Math.min(99, item.quantity + 1) }
          : item,
      );
    });
  };

  const changeQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.product._id !== productId) return [item];
        const quantity = item.quantity + delta;
        if (quantity < 1) return [];
        return [{ ...item, quantity: Math.min(99, quantity) }];
      }),
    );
  };

  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  const submit = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { orderId } = await stayService.addOrder(stay._id, {
        products: cart.map((item) => ({
          productId: item.product._id,
          quantity: item.quantity,
        })),
        date: new Date().toISOString(),
      });

      // Tisk je best-effort — účtenka už v systému je, selhání tiskárny
      // nesmí vypadat, jako by se prodej nezdařil (stejně jako v Overview).
      const printResult = await printerService.printReceipt({
        orderNumber: orderId,
        date: new Date().toLocaleString("cs-CZ"),
        items: cart.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
          total: item.product.price * item.quantity,
        })),
        totalAmount: total,
        storeName: "Hradišťský Vrch",
      });
      if (!printResult.success) {
        console.warn("Tisk účtenky selhal:", printResult.error);
      }

      setCart([]);
      loadHistory();
    } catch (err: unknown) {
      console.error("Failed to add order to stay:", err);
      setError(
        err instanceof Error ? err.message : "Vytvoření účtenky se nezdařilo.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-primary rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-secondary">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Účtovat k rezervaci
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {guestName || "Host"} ·{" "}
              {new Date(stay.from).toLocaleDateString("cs-CZ")} –{" "}
              {new Date(stay.to).toLocaleDateString("cs-CZ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary px-2"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-primary border border-error text-error px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-2">
              Účtenky k tomuto pobytu
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Zatím žádné účtenky.
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((order) => (
                  <li
                    key={order._id}
                    className="flex justify-between text-sm text-text-primary bg-secondary/30 rounded px-3 py-2"
                  >
                    <span>{dateTimeFormat.format(new Date(order.createdAt))}</span>
                    <span className="font-medium">
                      {formatCurrency(order.totalPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-2">
              Přidat položky
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {products.map((product) => (
                <div key={product._id} onClick={() => addToCart(product)}>
                  <Product product={product} />
                </div>
              ))}
            </div>
          </section>

          {cart.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-text-secondary mb-2">
                Nová účtenka
              </h3>
              <ul className="space-y-1">
                {cart.map((item) => (
                  <li
                    key={item.product._id}
                    className="flex items-center justify-between gap-2 text-sm text-text-primary bg-secondary/30 rounded px-3 py-2"
                  >
                    <span className="flex-1">{item.product.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.product._id, -1)}
                        className="w-6 h-6 rounded bg-secondary text-text-primary"
                      >
                        −
                      </button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.product._id, 1)}
                        className="w-6 h-6 rounded bg-secondary text-text-primary"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-24 text-right font-medium">
                      {formatCurrency(item.product.price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-secondary">
          <span className="text-text-primary font-bold">
            Celkem: {formatCurrency(total)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm bg-secondary text-text-primary"
            >
              Zavřít
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={cart.length === 0 || submitting}
              className="px-4 py-2 rounded-lg text-sm bg-success text-white disabled:opacity-50"
            >
              {submitting ? "Účtuji..." : "Vytvořit účtenku"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
