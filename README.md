# hlsystem-app

Recepční / pokladní aplikace HLSystemu — Electron + React + TypeScript.

Běží na pokladně (Windows / macOS / Linux) a komunikuje s core API přes
HTTPS + WebSocket.

## Obrazovky

| Cesta | Obrazovka | Co dělá |
|---|---|---|
| `/` | Pokladna | prodej, účtenky, tisk, zakládání pobytů; ovládání brány |
| `/reservations` | Rezervace | pobyty hostů (termín, vozidla, doúčtování) |
| `/plates` | SPZ | evidence ručních povolení a blacklistu |
| `/metrics` | Metriky | tržby a přehledy |
| `/tax-reduction` | Krácení daní | úprava dokladů |

Prodej s vyplněnou SPZ zakládá **pobyt** (rezervaci) i účtenku najednou;
prodej bez SPZ je běžná účtenka.

## Vývoj

```bash
npm install
npm run dev          # vite dev server + electron
```

API adresu čte z `VITE_API` (jediné `.env` v `hlsystem-infra/docker/.env`).
V dev typicky `http://localhost:8080`.

## Build

```bash
npm run build        # produkční instalátor → release/<verze>/
npm run build:dev    # vývojová varianta (jiné appId, jde nainstalovat vedle)
```

Výstupy: `hlsystem-app-win.exe` (NSIS), `hlsystem-app-mac.dmg`,
`hlsystem-app-linux.AppImage`.

**Nová verze se nasazuje instalací nového buildu.** Automatické aktualizace
nejsou součástí dodávky — aplikace nikam nevolá ven kromě vlastního API.

## Struktura

```
electron/          Electron main proces
  main.ts          okno, CSP, IPC
  printer.ts       tisk účtenek (node-thermal-printer)
  preload.ts       most do rendereru (contextBridge)
src/
  pages/           obrazovky
  components/      sdílené komponenty
  services/        HTTP a WebSocket klienti k API
  types/           datové typy sdílené s API
  config/env.ts    adresa API (build-time VITE_API)
```

## Tisk účtenek

Přes `node-thermal-printer` v main procesu (`electron/printer.ts`).
Renderer volá `window.electronAPI.printReceipt(...)`.

## Troubleshooting

**Build chyby**
1. Zkontroluj Node.js verzi (doporučeno 18+).
2. Vyčisti závislosti: `rm -rf node_modules package-lock.json && npm install`.
3. Zkontroluj typy a lint: `npm run lint`.

**Aplikace se nepřipojí k API**
1. Ověř `VITE_API` v `.env` (musí být HTTPS na produkci) — zapéká se při buildu.
2. Ověř, že API běží: `curl -k https://<ip>/api/health/ready`.
3. Zkontroluj `CORS_ORIGINS` na straně API — musí obsahovat origin aplikace.
