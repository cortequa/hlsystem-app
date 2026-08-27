import { ENV } from "../config/env";
import { buildQuery, http, Paged, toPaged } from "./http";
import { Product, CreateProductDto } from '../types/product';

const PRODUCTS = ENV.API.ENDPOINTS.PRODUCTS;

// Rozbalování `{ success, data }` řeší http helper na jednom místě — tenhle
// modul si ho dřív implementoval podruhé vlastním `fetch`em.
export const productService = {
  /** Celý ceník. Je malý (desítky položek), takže se nestránkuje. */
  async getProducts(): Promise<Product[]> {
    const data = await http.get<Product[] | Paged<Product>>(PRODUCTS);
    return toPaged(data).items;
  },

  /** Jedna stránka ceníku — pro seznamy s velkým počtem položek. */
  async getProductsPage(
    page: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Paged<Product>> {
    const data = await http.get<Product[] | Paged<Product>>(
      `${PRODUCTS}${buildQuery({ page, limit })}`,
      signal,
    );
    return toPaged(data);
  },

  async getProductById(id: string): Promise<Product | null> {
    return http.get<Product>(`${PRODUCTS}/${id}`);
  },

  async createProduct(product: CreateProductDto): Promise<Product | null> {
    return http.post<Product>(PRODUCTS, product);
  },

  async updateProduct(id: string, product: Partial<CreateProductDto>): Promise<Product | null> {
    return http.patch<Product>(`${PRODUCTS}/${id}`, product);
  },

  async deleteProduct(id: string): Promise<boolean> {
    await http.del<void>(`${PRODUCTS}/${id}`);
    return true;
  },
};
