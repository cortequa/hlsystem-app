// API endpoint je KONFIGUROVATELNÝ přes build-time env (VITE_API), ne natvrdo
// (prod-check C1). Fallback drží dosavadní adresu, ať se nasazení nerozbije.
// ⚠️ PRODUKCE: musí to být HTTPS přes nginx (443), ne plain HTTP na přímý port —
// jinak jdou příkazy brány a osobní údaje po síti nešifrovaně.
// API endpoint je KONFIGUROVATELNÝ přes build-time env (VITE_API), ne natvrdo.
// PRODUKCE: nastav `VITE_API=https://<doména>/api` (přes nginx/443). Fallback drží
// dosavadní adresu, ať se build nerozbije, ale plain-HTTP hlásí varováním.
const API = import.meta.env.VITE_API ?? 'http://109.164.15.139:3000/api';

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

export const ENV = {
  API: {
    API: API,
    WS: WS,
    ENDPOINTS: {
      PRODUCTS: `${API}/products`,
      VISITORS: `${API}/visitors`,
      GATES: `${API}/gates`,
      ORDERS: `${API}/orders`,
      // Sprint 4: reálné endpointy core API (starý neexistující `/entries` odstraněn).
      LICENSE_PLATES: `${API}/license-plates`,
      ACCESS_EVENTS: `${API}/access-events`,
    },
  },
};
