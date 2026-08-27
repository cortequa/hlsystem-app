import { ENV } from "../config/env";
import { buildQuery, http, Paged, toPaged } from "./http";
import {
  AccessCheckResult,
  CreateLicensePlateDto,
  LicensePlate,
} from "../types/licensePlate";

const LP = ENV.API.ENDPOINTS.LICENSE_PLATES;

async function fetchList(
  path: string,
  page?: number,
  limit?: number,
  signal?: AbortSignal,
): Promise<Paged<LicensePlate>> {
  const data = await http.get<LicensePlate[] | Paged<LicensePlate>>(
    `${LP}/${path}${buildQuery({ page, limit })}`,
    signal,
  );
  return toPaged(data);
}

export const licensePlateService = {
  /** Ruční povolení (zaměstnanci, dodavatelé) — NE vozidla hostů. */
  async getAllowRules(): Promise<LicensePlate[]> {
    return (await fetchList("allow-rules")).items;
  },

  /** Blacklist = zablokované SPZ (celý seznam). */
  async getBlacklist(): Promise<LicensePlate[]> {
    return (await fetchList("blacklist")).items;
  },

  /** Jedna stránka ručních povolení. */
  getAllowRulesPage(
    page: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Paged<LicensePlate>> {
    return fetchList("allow-rules", page, limit, signal);
  },

  /** Jedna stránka blacklistu. */
  getBlacklistPage(
    page: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Paged<LicensePlate>> {
    return fetchList("blacklist", page, limit, signal);
  },

  /**
   * Ověření vjezdu podle SPZ (allow/deny + důvod).
   *
   * Bez `direction` se ptáme na VJEZD — výjezd se pouští vždy, takže na něj
   * se obsluha ptát nepotřebuje.
   */
  async check(
    text: string,
    direction: "entry" | "exit" = "entry",
  ): Promise<AccessCheckResult> {
    return http.get<AccessCheckResult>(
      `${LP}/check/${encodeURIComponent(text)}${buildQuery({ direction })}`,
    );
  },

  /**
   * Ruční pravidlo pro SPZ. Text jde v cestě (kontrakt `POST /:text`), tělo
   * nese druh pravidla (`allow`/`blacklist`), platnost a důvod.
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
