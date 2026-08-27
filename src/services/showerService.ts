import { ENV } from "../config/env";
import { buildQuery, http, Paged, toPaged } from "./http";
import {
  ChipStatus,
  ChipTransaction,
  ShowerChip,
  ShowerDevice,
  ShowerEvent,
  TopUpResult,
} from "../types/shower";
import { DeviceMode } from "../types/shower";

const CHIPS = ENV.API.ENDPOINTS.SHOWER_CHIPS;
const DEVICES = ENV.API.ENDPOINTS.SHOWER_DEVICES;

export interface ChipsPageParams {
  page?: number;
  limit?: number;
  status?: ChipStatus;
  stayId?: string;
  /** Hledá podle UID i podle čísla vyraženého na čipu. */
  search?: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
  duration?: number;
}

export const showerService = {
  async getChipsPage(
    params: ChipsPageParams,
    signal?: AbortSignal,
  ): Promise<Paged<ShowerChip>> {
    const data = await http.get<ShowerChip[] | Paged<ShowerChip>>(
      `${CHIPS}${buildQuery({ ...params })}`,
      signal,
    );
    return toPaged(data);
  },

  async getChip(uid: string): Promise<ShowerChip> {
    return http.get<ShowerChip>(`${CHIPS}/${encodeURIComponent(uid)}`);
  },

  /** Pohyby kreditu jednoho čipu (karta čipu na recepci). */
  async getTransactions(
    chipId: string,
    signal?: AbortSignal,
  ): Promise<ChipTransaction[]> {
    const data = await http.get<ChipTransaction[] | Paged<ChipTransaction>>(
      `${CHIPS}/by-id/${chipId}/transactions${buildQuery({ limit: 50 })}`,
      signal,
    );
    return toPaged(data).items;
  },

  /** Zavedení nového čipu do skladu. */
  async createChip(uid: string, label?: string): Promise<{ chipId: string }> {
    return http.post<{ chipId: string }>(CHIPS, { uid, label });
  },

  /** Výdej hostovi při check-inu. */
  async issue(
    uid: string,
    stayId: string,
    depositAmount?: number,
  ): Promise<ShowerChip> {
    return http.post<ShowerChip>(`${CHIPS}/${encodeURIComponent(uid)}/issue`, {
      stayId,
      depositAmount,
    });
  },

  /** Vrácení při odjezdu — nevyčerpaný kredit propadá a zapíše se do knihy. */
  async returnChip(uid: string): Promise<ShowerChip> {
    return http.post<ShowerChip>(`${CHIPS}/${encodeURIComponent(uid)}/return`);
  },

  async markLost(uid: string): Promise<ShowerChip> {
    return http.post<ShowerChip>(`${CHIPS}/${encodeURIComponent(uid)}/lost`);
  },

  /** Dobití kreditu prodejem — založí účtenku i pohyb v účetní knize. */
  async topUp(uid: string, products: OrderItemInput[]): Promise<TopUpResult> {
    return http.post<TopUpResult>(
      `${CHIPS}/${encodeURIComponent(uid)}/topup`,
      { products },
    );
  },

  /** Ruční oprava zůstatku — vždy s důvodem. */
  async adjust(uid: string, amount: number, note: string): Promise<ShowerChip> {
    return http.post<ShowerChip>(`${CHIPS}/${encodeURIComponent(uid)}/adjust`, {
      amount,
      note,
    });
  },

  async getDevices(signal?: AbortSignal): Promise<ShowerDevice[]> {
    const data = await http.get<ShowerDevice[] | Paged<ShowerDevice>>(
      DEVICES,
      signal,
    );
    return toPaged(data).items;
  },

  async setDeviceMode(
    deviceId: string,
    mode: DeviceMode,
  ): Promise<ShowerDevice> {
    return http.patch<ShowerDevice>(`${DEVICES}/${deviceId}`, { mode });
  },

  /** Historie přiložení čipů (allow i deny). */
  async getEvents(
    params: { deviceId?: string; chipUid?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<ShowerEvent[]> {
    const data = await http.get<ShowerEvent[] | Paged<ShowerEvent>>(
      `${DEVICES}/events${buildQuery({ limit: 50, ...params })}`,
      signal,
    );
    return toPaged(data).items;
  },
};
