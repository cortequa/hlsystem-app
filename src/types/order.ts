import { Product } from "./product";
import { Visitor } from "./visitor";

/**
 * Položka účtenky. `name` a `unitPrice` jsou snapshot z okamžiku prodeje —
 * API je ukládá do objednávky, takže se ceník ke čtení historie nepotřebuje
 * a změna cen zpětně nepřepíše staré účtenky.
 */
export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  duration?: number;
}

export interface Order {
  _id: string;
  items: OrderItem[];
  totalPrice: number;
  visitor?: Visitor | string;
  /** Pobyt, ke kterému účtenka patří (prodej lístku, doúčtování při odjezdu). */
  stayId?: string;
  note?: string;
  createdAt: string;
  /** Obchodní datum rezervace (odlišné od `createdAt` = pořízení záznamu). */
  date?: string;
  completedAt?: string;
}

export interface OrderProduct {
  _id?: string;
  product: Product;
  quantity: number;
  duration?: number;
}

export interface OrderFilterParams {
  startDate: string;
  endDate: string;
}