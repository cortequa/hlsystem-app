import { ENV } from "../config/env";
import { Order, OrderItem } from "../types/order";
import { buildQuery, http, Paged, toPaged } from "./http";

const ORDERS = ENV.API.ENDPOINTS.ORDERS;

export interface CreateOrderDto {
    // Products array with productId, quantity and optional duration
    products: Array<{
        productId: string;
        quantity: number; // Must be numeric and <= 99
        duration?: number; // Optional duration field
    }>;
    // Optional visitorId (should be a valid MongoDB ObjectId)
    visitorId?: string;
    /** Účtenka k pobytu — nastavuje ji API při `POST /stays`, ne pokladna. */
    stayId?: string;
    // Required date field (ISO string format)
    date: string; // ISO string format for the date
}

/** Rozsah zvolený v UI — data z `<input type="date">`, tedy YYYY-MM-DD. */
export interface OrderFilterParams {
    startDate: string;
    endDate: string;
}

export interface OrdersPageParams {
    page: number;
    limit: number;
    startDate?: string;
    endDate?: string;
    /** ID účtenky; když je vyplněné, server ignoruje datový rozsah. */
    search?: string;
}

export interface TaxReductionResult {
  success: boolean;
  removedQuantity: number;
  ordersAffected: number;
  error?: string;
}

export interface ProductStat {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface OrderStats {
  periods: {
    key: string;
    revenue: number;
    orderCount: number;
    topProduct: ProductStat | null;
  }[];
  products: ProductStat[];
  totalRevenue: number;
  orderCount: number;
}

/** Kolik zápisů posílat najednou — API má limit 120 požadavků/min na IP. */
const WRITE_CONCURRENCY = 5;

/**
 * Převede den z `<input type="date">` na přesný okamžik v místním čase.
 * `new Date("2026-08-25")` by se vyložil jako půlnoc UTC, takže by rozsah
 * v ČR ujel o hodinu či dvě a účtenky z okraje dne by vypadly.
 */
function localDayStart(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString();
}

function localDayEnd(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).toISOString();
}

export const orderService = {
    /**
     * Jedna stránka historie účtenek. Filtrování, hledání i řazení dělá server —
     * dřív se kvůli každému z toho stahovala celá kolekce do prohlížeče.
     */
    async getOrdersPage(
        params: OrdersPageParams,
        signal?: AbortSignal,
    ): Promise<Paged<Order>> {
        const search = params.search?.trim();
        const query = buildQuery({
            page: params.page,
            limit: params.limit,
            search: search || undefined,
            // Při hledání podle ID rozsah neposíláme — účtenka se má najít
            // napříč celou historií, ne jen ve zvoleném období.
            from: search || !params.startDate ? undefined : localDayStart(params.startDate),
            to: search || !params.endDate ? undefined : localDayEnd(params.endDate),
        });

        const data = await http.get<Order[] | Paged<Order>>(
            `${ORDERS}${query}`,
            signal,
        );
        const paged = toPaged(data);
        return { ...paged, items: paged.items.map(normalizeOrder) };
    },

    /**
     * Kompletní seznam objednávek (nestránkovaný, se serverovým stropem).
     * Používá ho jen krácení daní, které potřebuje projít celou historii.
     * Pro zobrazování seznamů použij `getOrdersPage`.
     */
    async getAllOrders(): Promise<Order[]> {
        const data = await http.get<Order[] | Paged<Order>>(ORDERS);
        return toPaged(data).items.map(normalizeOrder);
    },

    /**
     * Objednávky v zadaném datovém rozsahu (nestránkované, server filtruje).
     * `from`/`to` jsou ISO stringy — server je přijímá na `GET /orders`.
     */
    async getOrdersByDateRange(from: string, to: string): Promise<Order[]> {
        const query = buildQuery({ from, to });
        const data = await http.get<Order[] | Paged<Order>>(`${ORDERS}${query}`);
        return toPaged(data).items.map(normalizeOrder);
    },

    /**
     * Účtenky patřící jednomu pobytu (doúčtování k rezervaci). Nestránkované —
     * účtenek na jeden pobyt je pár, ne tisíce.
     */
    async getOrdersForStay(
        stayId: string,
        signal?: AbortSignal,
    ): Promise<Order[]> {
        const query = buildQuery({ stayId });
        const data = await http.get<Order[] | Paged<Order>>(
            `${ORDERS}${query}`,
            signal,
        );
        return toPaged(data).items.map(normalizeOrder);
    },

    /** Agregované tržby — počítá je databáze, ne prohlížeč. */
    async getStats(
        range: OrderFilterParams,
        granularity: "day" | "month" | "year",
        signal?: AbortSignal,
    ): Promise<OrderStats> {
        const query = buildQuery({
            granularity,
            from: range.startDate ? localDayStart(range.startDate) : undefined,
            to: range.endDate ? localDayEnd(range.endDate) : undefined,
        });
        return http.get<OrderStats>(`${ORDERS}/stats${query}`, signal);
    },

    async getOrderById(id: string): Promise<Order> {
        return normalizeOrder(await http.get<Order>(`${ORDERS}/${id}`));
    },

    async createOrder(orderData: CreateOrderDto): Promise<string> {
        assertValidOrder(orderData);
        const result = await http.post<{ orderId: string }>(ORDERS, orderData);
        return result.orderId;
    },

    async updateOrder(id: string, orderData: Partial<CreateOrderDto>): Promise<Order> {
        assertValidOrder(orderData);
        return normalizeOrder(await http.patch<Order>(`${ORDERS}/${id}`, orderData));
    },

    async deleteOrder(id: string): Promise<void> {
        await http.del<void>(`${ORDERS}/${id}`);
    },

    /** Rozsah pro rychlé předvolby (Dnes / Měsíc / Rok) ve tvaru YYYY-MM-DD. */
    getDateRangeForFilter(dateFilter: 'day' | 'month' | 'year'): OrderFilterParams {
        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        switch (dateFilter) {
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                startDate = new Date(now);
                endDate = new Date(now);
        }

        return { startDate: toDayString(startDate), endDate: toDayString(endDate) };
    },

    async reduceTaxForProduct(
      productId: string,
      targetQuantity: number,
      dateRange?: { from: string; to: string },
    ): Promise<TaxReductionResult> {
    try {
      // Filtrování podle data probíhá na serveru — stahujeme jen relevantní objednávky
      const orders = dateRange
        ? await this.getOrdersByDateRange(dateRange.from, dateRange.to)
        : await this.getAllOrders();

      const ordersWithProduct = orders.filter(order =>
        order.items.some(item => item.productId === productId)
      );

      if (ordersWithProduct.length === 0) {
        return {
          success: false,
          removedQuantity: 0,
          ordersAffected: 0,
          error: 'Žádné objednávky s tímto produktem nebyly nalezeny v zadaném období'
        };
      }

      // Zamícháme objednávky pro náhodný výběr
      const shuffledOrders = [...ordersWithProduct].sort(() => Math.random() - 0.5);

      let remainingQuantity = targetQuantity;
      let totalRemovedQuantity = 0;
      const pending: { order: Order; items: OrderItem[] }[] = [];

      // Nejdřív jen spočítáme, co se má změnit — zápisy jdou až potom v dávkách.
      for (const order of shuffledOrders) {
        if (remainingQuantity <= 0) break;

        let orderModified = false;
        const updatedItems = order.items
          .map(item => {
            if (item.productId !== productId || remainingQuantity <= 0) return item;

            const quantityToRemove = Math.min(item.quantity, remainingQuantity);
            if (quantityToRemove <= 0) return item;

            remainingQuantity -= quantityToRemove;
            totalRemovedQuantity += quantityToRemove;
            orderModified = true;

            const newQuantity = item.quantity - quantityToRemove;
            return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
          })
          .filter((item): item is OrderItem => item !== null);

        if (orderModified) {
          pending.push({ order, items: updatedItems });
        }
      }

      // Sériový cyklus PATCH/DELETE narážel při větším počtu na rate limit
      // (120 req/min na IP) — posíláme je po malých dávkách.
      let ordersAffected = 0;
      for (let i = 0; i < pending.length; i += WRITE_CONCURRENCY) {
        const chunk = pending.slice(i, i + WRITE_CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(({ order, items }) =>
            items.length === 0
              ? this.deleteOrder(order._id)
              : this.updateOrder(order._id, {
                  products: items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    duration: item.duration,
                  })),
                  date: order.date ?? order.createdAt,
                }),
          ),
        );
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            ordersAffected++;
          } else {
            console.error(
              `Chyba při aktualizaci objednávky ${chunk[index]?.order._id}:`,
              result.reason,
            );
          }
        });
      }

      return {
        success: true,
        removedQuantity: totalRemovedQuantity,
        ordersAffected
      };
    } catch (error) {
      console.error('Error reducing tax for product:', error);
      return {
        success: false,
        removedQuantity: 0,
        ordersAffected: 0,
        error: error instanceof Error ? error.message : 'Neznámá chyba při krácení daní'
      };
    }
  },
};

function toDayString(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function assertValidOrder(order: Partial<CreateOrderDto>): void {
    order.products?.forEach(product => {
        if (product.quantity > 99) {
            throw new Error(`Product quantity must be <= 99. Found: ${product.quantity}`);
        }
        if (product.quantity <= 0) {
            throw new Error(`Product quantity must be > 0. Found: ${product.quantity}`);
        }
    });
    if (order.date && isNaN(new Date(order.date).getTime())) {
        throw new Error('Invalid date format');
    }
}

/**
 * Srovná odpověď API na tvar, se kterým pracuje UI.
 *
 * `products` (název pole v databázi) → `items`; cena a název se berou ze
 * snapshotu na objednávce. Fallbacky pokrývají objednávky pořízené před
 * zavedením snapshotu, kterým backfill ještě neproběhl.
 */
function normalizeOrder(order: unknown): Order {
    const raw = (order ?? {}) as Record<string, unknown>;
    const rawItems = Array.isArray(raw.products)
        ? (raw.products as Record<string, unknown>[])
        : Array.isArray(raw.items)
          ? (raw.items as Record<string, unknown>[])
          : [];

    const items: OrderItem[] = rawItems.map(item => ({
        productId: String(item.productId ?? ''),
        name: typeof item.name === 'string' ? item.name : 'Neznámý produkt',
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
        quantity: typeof item.quantity === 'number' ? item.quantity : 0,
        duration: typeof item.duration === 'number' ? item.duration : undefined,
    }));

    const totalPrice =
        typeof raw.totalPrice === 'number'
            ? raw.totalPrice
            : items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return {
        _id: String(raw._id ?? ''),
        items,
        totalPrice,
        visitor: (raw.visitor ?? raw.visitorId) as Order['visitor'],
        stayId: typeof raw.stayId === 'string' ? raw.stayId : undefined,
        note: typeof raw.note === 'string' ? raw.note : undefined,
        createdAt: String(raw.createdAt ?? raw.date ?? new Date().toISOString()),
        date: typeof raw.date === 'string' ? raw.date : undefined,
        completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    };
}
