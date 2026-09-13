export interface Gate {
  _id: string;
  name: string;
  isOpen: boolean;
}

/** Fáze pohybu brány vysílané přes WebSocket (edge → core → app). */
export type GatePhase = "opening" | "closing" | "opened" | "closed";

/** Zdroj ovládací operace (audit). */
export type OperationSource = "manual" | "system";

/** Auditní záznam ovládací operace brány. */
export interface GateOperation {
  _id: string;
  gateId: string;
  action: "open" | "close" | "toggle";
  source: OperationSource;
  resultIsOpen?: boolean;
  operator?: string;
  createdAt: string;
}
