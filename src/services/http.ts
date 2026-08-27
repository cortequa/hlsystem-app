/**
 * Tenký HTTP helper. Core API balí úspěšné odpovědi do `{ success: true, data }`
 * (TransformInterceptor) — tady to rozbalíme na jednom místě, ať to služby
 * neřeší copy-pastem. Chyby se normalizují na Error se srozumitelnou zprávou.
 */

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

/**
 * Tvar stránkované odpovědi. API ji vrací jen když dotaz obsahuje
 * `page`/`limit`; bez nich přijde holé pole (starší kontrakt).
 */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Srovná obě varianty na `Paged`. Volající tak nemusí řešit, jestli mu API
 * vrátilo pole nebo obálku — což je snadný zdroj tichých chyb, kdy se
 * `Array.isArray(data) ? data : []` na obálce zvrhne v prázdný seznam.
 */
export function toPaged<T>(data: T[] | Paged<T> | null | undefined): Paged<T> {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, limit: data.length };
  }
  if (data && Array.isArray(data.items)) {
    return data;
  }
  return { items: [], total: 0, page: 1, limit: 0 };
}

/** Query string bez prázdných hodnot (`undefined`, `null`, `""` se vynechají). */
export function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      /* tělo nemuselo být JSON */
    }
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const body = (await res.json()) as ApiEnvelope<T> | T;
  // Rozbal `{ success, data }`, jinak vrať tělo tak jak je (starší kontrakt).
  if (body && typeof body === "object" && "data" in (body as ApiEnvelope<T>)) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const http = {
  /**
   * `signal` umožní zrušit dotaz, který mezitím zestaral (uživatel přepnul
   * stránku/filtr). Bez toho dojezdí odpověď na starý filtr a přepíše novější.
   */
  async get<T>(url: string, signal?: AbortSignal): Promise<T> {
    return parse<T>(await fetch(url, { signal }));
  },
  async post<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return parse<T>(
      await fetch(url, {
        method: "POST",
        headers: { ...jsonHeaders, ...(headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  },
  async patch<T>(url: string, body: unknown): Promise<T> {
    return parse<T>(
      await fetch(url, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) }),
    );
  },
  async del<T>(url: string): Promise<T> {
    return parse<T>(await fetch(url, { method: "DELETE" }));
  },
};
