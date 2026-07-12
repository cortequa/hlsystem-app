const API = 'http://109.164.15.139:3000/api';

// WebSocket (Socket.IO) běží na stejném originu jako API. VITE_WS umožní override
// (např. když API sedí za jiným portem/hostem než realtime brána).
const WS = import.meta.env.VITE_WS ?? API;

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
