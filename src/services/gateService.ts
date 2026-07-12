import { ENV } from "../config/env";
import { http } from "./http";
import { Gate, GateOperation } from "../types/gate";

const GATES = ENV.API.ENDPOINTS.GATES;

/** Seznam všech bran (žádné natvrdo zadané gate ID — Sprint 4 fix). */
export async function getGates(): Promise<Gate[]> {
  const data = await http.get<Gate | Gate[]>(GATES);
  return Array.isArray(data) ? data : data ? [data] : [];
}

/** Jedna brána včetně reálného stavu isOpen (core dotáhne z edge controlleru). */
export async function getGate(gateId: string): Promise<Gate> {
  return http.get<Gate>(`${GATES}/${gateId}`);
}

/** Aktuální stav brány (isOpen) z edge controlleru. */
export async function getGateStatus(gateId: string): Promise<{ isOpen: boolean }> {
  return http.get<{ isOpen: boolean }>(`${GATES}/${gateId}/status`);
}

export interface GateCommandResult {
  gateId: string;
  isOpen: boolean;
  message: string;
}

/** Explicitní ruční otevření (ne slepý toggle) — auditované. */
export async function openGate(gateId: string): Promise<GateCommandResult> {
  return http.post<GateCommandResult>(`${GATES}/${gateId}/open`);
}

/** Explicitní ruční zavření — auditované. */
export async function closeGate(gateId: string): Promise<GateCommandResult> {
  return http.post<GateCommandResult>(`${GATES}/${gateId}/close`);
}

/** Přepnutí stavu (POST, ne GET — Sprint 4 fix; CSRF/prefetch). */
export async function toggleGate(gateId: string): Promise<GateCommandResult> {
  return http.post<GateCommandResult>(`${GATES}/${gateId}/toggle`);
}

/** Auditní historie ovládacích operací brány. */
export async function getGateOperations(gateId: string): Promise<GateOperation[]> {
  const data = await http.get<GateOperation[]>(`${GATES}/${gateId}/operations?limit=50`);
  return Array.isArray(data) ? data : [];
}
