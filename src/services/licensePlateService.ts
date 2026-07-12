import { ENV } from "../config/env";
import { http } from "./http";
import {
  AccessCheckResult,
  CreateLicensePlateDto,
  LicensePlate,
} from "../types/licensePlate";

const LP = ENV.API.ENDPOINTS.LICENSE_PLATES;

export const licensePlateService = {
  /** Whitelist = platné/neblokované SPZ. */
  async getWhitelist(): Promise<LicensePlate[]> {
    const data = await http.get<LicensePlate[]>(`${LP}/whitelist`);
    return Array.isArray(data) ? data : [];
  },

  /** Blacklist = zablokované SPZ. */
  async getBlacklist(): Promise<LicensePlate[]> {
    const data = await http.get<LicensePlate[]>(`${LP}/blacklist`);
    return Array.isArray(data) ? data : [];
  },

  /** Ověření vjezdu podle SPZ (allow/deny + důvod). */
  async check(text: string): Promise<AccessCheckResult> {
    return http.get<AccessCheckResult>(`${LP}/check/${encodeURIComponent(text)}`);
  },

  /**
   * Ruční přidání SPZ. Text jde v cestě (kontrakt `POST /:text`), tělo nese
   * platnost (from/to), volitelnou vazbu na rezervaci a blacklist flag.
   */
  async create(
    text: string,
    dto: CreateLicensePlateDto,
  ): Promise<{ licensePlateId: string }> {
    return http.post<{ licensePlateId: string }>(
      `${LP}/${encodeURIComponent(text)}`,
      dto,
    );
  },

  async remove(id: string): Promise<void> {
    await http.del<void>(`${LP}/${id}`);
  },
};
