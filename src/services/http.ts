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
  async get<T>(url: string): Promise<T> {
    return parse<T>(await fetch(url));
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
