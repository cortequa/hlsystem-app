// API endpoint je KONFIGUROVATELNÝ přes build-time env (VITE_API), ne natvrdo
// (prod-check C1). VŽDY HTTPS přes nginx (443) — příkazy brány i osobní údaje
// nesmí po síti nešifrovaně. Fallback míří na veřejnou IP přes HTTPS (ne plain
// HTTP na přímý port), ať i build bez nastaveného VITE_API zůstane bezpečný.
const API = import.meta.env.VITE_API ?? 'https://109.164.15.139/api';

if (API.startsWith('http://') && !API.includes('localhost') && !API.includes('127.0.0.1')) {
  console.warn('[BEZPEČNOST] API běží přes nešifrované HTTP:', API, '— v produkci použij HTTPS.');
}

// Socket.IO se připojuje na ORIGIN (schéma+host), ne na cestu s /api — jinak by
// socket.io interpretoval "/api" jako namespace (server má jen výchozí "/") a
// spojení by selhalo. Odvodíme origin z API; VITE_WS umožní explicitní override.
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
const WS = import.meta.env.VITE_WS ?? originOf(API);

// Sdílený přístupový token instalace. API i WebSocket bez něj odpoví 401 —
// systém běží na veřejné IP a tohle je to, co ho zavírá pro kohokoli jiného
// než tuhle aplikaci. Zapéká se do buildu (VITE_API_TOKEN); musí se shodovat
// s API_ACCESS_TOKEN na straně serveru.
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? '';

if (!API_TOKEN) {
  console.warn(
    '[BEZPEČNOST] VITE_API_TOKEN není nastavený — build se k zabezpečenému API nepřipojí.',
  );
}

export const ENV = {
  API: {
    API: API,
    WS: WS,
    TOKEN: API_TOKEN,
    ENDPOINTS: {
      PRODUCTS: `${API}/products`,
      VISITORS: `${API}/visitors`,
      GATES: `${API}/gates`,
      ORDERS: `${API}/orders`,
      // Pobyty = rezervace s vozidly (dřív se rezervace tvářily jako účtenky).
      STAYS: `${API}/stays`,
      // Evidence SPZ (ruční povolení / blacklist).
      LICENSE_PLATES: `${API}/license-plates`,
    },
  },
};
