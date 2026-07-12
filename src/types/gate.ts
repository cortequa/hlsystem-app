export interface Gate {
  _id: string;
  name: string;
  cameras: { entry: string; exit: string };
  isOpen: boolean;
}

/** Fáze pohybu brány vysílané přes WebSocket (Sprint 3 edge → core → app). */
export type GatePhase = "opening" | "closing" | "opened" | "closed";

/** Zdroj ovládací operace (audit). */
export type OperationSource = "manual" | "lpr" | "system";

/** Auditní záznam ovládací operace brány (Sprint 4). */
export interface GateOperation {
  _id: string;
  gateId: string;
  action: "open" | "close" | "toggle";
  source: OperationSource;
  resultIsOpen?: boolean;
  operator?: string;
  createdAt: string;
}
