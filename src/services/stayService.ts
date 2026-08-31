import { ENV } from "../config/env";
import { buildQuery, http, Paged, toPaged } from "./http";
import {
  CreateStayDto,
  CreateStayResult,
  Stay,
  StayStatus,
  UpdateStayDto,
} from "../types/stay";

const STAYS = ENV.API.ENDPOINTS.STAYS;

export interface StaysPageParams {
  page?: number;
  limit?: number;
  /** Překryv s rozsahem, ne začátek v něm — běžící pobyt do výsledku patří. */
  from?: string;
  to?: string;
  status?: StayStatus;
  plate?: string;
  visitorId?: string;
}

export const stayService = {
  /**
   * Jedna stránka pobytů. Vozidla přijdou vnořená — dřív se kvůli nim tahal
   * celý whitelist (strop 20 000 záznamů) do prohlížeče a pároval se ručně.
   */
  async getStaysPage(
    params: StaysPageParams,
    signal?: AbortSignal,
  ): Promise<Paged<Stay>> {
    const data = await http.get<Stay[] | Paged<Stay>>(
      `${STAYS}${buildQuery({ ...params })}`,
      signal,
    );
    return toPaged(data);
  },

  async getStay(id: string): Promise<Stay> {
    return http.get<Stay>(`${STAYS}/${id}`);
  },

  async create(dto: CreateStayDto): Promise<CreateStayResult> {
    return http.post<CreateStayResult>(STAYS, dto);
  },

  async update(id: string, dto: UpdateStayDto): Promise<Stay> {
    return http.patch<Stay>(`${STAYS}/${id}`, dto);
  },

  /** Doúčtování k pobytu — vznikne účtenka se `stayId` (dřevo, doplatky). */
  async addOrder(
    id: string,
    payload: {
      products: Array<{ productId: string; quantity: number; duration?: number }>;
      date?: string;
    },
  ): Promise<{ orderId: string }> {
    return http.post<{ orderId: string }>(`${STAYS}/${id}/orders`, payload);
  },

  /** Doplnění SPZ hostovi, který ji při rezervaci neuvedl. */
  async addVehicle(id: string, plate: string, note?: string): Promise<Stay> {
    return http.post<Stay>(`${STAYS}/${id}/vehicles`, { plate, note });
  },

  async removeVehicle(id: string, plateNormalized: string): Promise<Stay> {
    return http.del<Stay>(
      `${STAYS}/${id}/vehicles/${encodeURIComponent(plateNormalized)}`,
    );
  },

  async checkIn(id: string): Promise<Stay> {
    return http.post<Stay>(`${STAYS}/${id}/check-in`);
  },

  async checkOut(id: string): Promise<Stay> {
    return http.post<Stay>(`${STAYS}/${id}/check-out`);
  },

  /**
   * Zrušení pobytu. Jedno volání místo původní klientské kaskády, která
   * mazala SPZ po jedné — když selhala v půlce, SPZ zůstala ve whitelistu
   * a auto projelo i po zrušené rezervaci.
   */
  async cancel(id: string): Promise<Stay> {
    return http.post<Stay>(`${STAYS}/${id}/cancel`);
  },
};
