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
  status: 'completed';
  productId: string;
  requestedQuantity: number;
  removedQuantity: number;
  periodFrom: string;
  periodTo: string;
  affectedOrders: { orderId: string; removedQuantity: number }[];
  auditId: string;
}

export interface TaxReductionHistoryEntry {
  _id: string;
  productId: string;
  requestedQuantity: number;
  removedQuantity: number;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
  createdBy: string;
  reason: string;
  affectedOrders: { orderId: string; items: { productId: string; quantity: number }[] }[];
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
      dateRange: { from: string; to: string },
      reason = 'Redukce nákladů',
    ): Promise<TaxReductionResult> {
      return http.post<TaxReductionResult>(`${ORDERS}/reductions`, {
        productId,
        quantity: targetQuantity,
        from: dateRange.from,
        to: dateRange.to,
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
  },

    async getReductionHistory(): Promise<TaxReductionHistoryEntry[]> {
      return http.get<TaxReductionHistoryEntry[]>(`${ORDERS}/reductions`);
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
