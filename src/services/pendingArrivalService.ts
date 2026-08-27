import { ENV } from "../config/env";
import { buildQuery, http, Paged, toPaged } from "./http";
import { ArrivalStatus, PendingArrival } from "../types/pendingArrival";

const PA = ENV.API.ENDPOINTS.PENDING_ARRIVALS;

export const pendingArrivalService = {
  /** Bez `status` vrací API jen to, co reálně čeká. */
  async list(
    gateId?: string,
    status?: ArrivalStatus,
    signal?: AbortSignal,
  ): Promise<PendingArrival[]> {
    const data = await http.get<PendingArrival[] | Paged<PendingArrival>>(
      `${PA}${buildQuery({ gateId, status, limit: 20 })}`,
      signal,
    );
    return toPaged(data).items;
  },

  /** Pustit jednorázově — bez zakládání pobytu. */
  async grant(id: string, reason?: string): Promise<PendingArrival> {
    return http.post<PendingArrival>(`${PA}/${id}/grant`, { reason });
  },

  /** Přiřadit SPZ k existující rezervaci (host ji neuvedl). */
  async link(id: string, stayId: string): Promise<PendingArrival> {
    return http.post<PendingArrival>(`${PA}/${id}/link`, { stayId });
  },

  async dismiss(id: string): Promise<PendingArrival> {
    return http.post<PendingArrival>(`${PA}/${id}/dismiss`);
  },
};
