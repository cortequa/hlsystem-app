import { ENV } from "../config/env";
import { buildQuery, http, Paged, toPaged } from "./http";
import { AccessEvent } from "../types/accessEvent";

const AE = ENV.API.ENDPOINTS.ACCESS_EVENTS;

export const accessEventService = {
  /** Auditní historie LPR rozhodnutí (volitelně filtr podle brány). */
  async list(gateId?: string, limit = 50): Promise<AccessEvent[]> {
    // S `limit` vrací API stránkovanou obálku, ne pole.
    const data = await http.get<AccessEvent[] | Paged<AccessEvent>>(
      `${AE}${buildQuery({ limit, gateId })}`,
    );
    return toPaged(data).items;
  },

  /** URL snímku k události (pro <img src>). */
  imageUrl(id: string): string {
    return `${AE}/${id}/image`;
  },
};
