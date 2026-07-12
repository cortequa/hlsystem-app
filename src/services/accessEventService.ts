import { ENV } from "../config/env";
import { http } from "./http";
import { AccessEvent } from "../types/accessEvent";

const AE = ENV.API.ENDPOINTS.ACCESS_EVENTS;

export const accessEventService = {
  /** Auditní historie LPR rozhodnutí (volitelně filtr podle brány). */
  async list(gateId?: string, limit = 50): Promise<AccessEvent[]> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (gateId) q.set("gateId", gateId);
    const data = await http.get<AccessEvent[]>(`${AE}?${q.toString()}`);
    return Array.isArray(data) ? data : [];
  },

  /** URL snímku k události (pro <img src>). */
  imageUrl(id: string): string {
    return `${AE}/${id}/image`;
  },
};
