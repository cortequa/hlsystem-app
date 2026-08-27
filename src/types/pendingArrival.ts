import { AccessReason } from "./licensePlate";

export type ArrivalStatus = "waiting" | "resolved" | "expired" | "dismissed";

/** Auto, které stojí u brány a systém ho nepustil. */
export interface PendingArrival {
  _id: string;
  gateId: string;
  direction: "entry" | "exit";
  cameraId: string;
  plateText: string;
  plateNormalized: string;
  confidence: number;
  /** Vazba na snímek — `accessEventService.imageUrl(accessEventId)`. */
  accessEventId: string;
  reason: AccessReason | string;
  /** Kandidát z fuzzy dohledání — „nemyslel jsi tuhle rezervaci?" */
  suggestedStayId?: string;
  status: ArrivalStatus;
  createdAt?: string;
  expiresAt: string;
}

/** Payload realtime události `pendingArrival`. */
export interface PendingArrivalEvent {
  pendingArrivalId: string;
  gateId: string;
  direction: "entry" | "exit";
  plate: string;
  reason: string;
  confidence: number;
  accessEventId: string;
  suggestedStayId?: string;
  expiresAt: string;
}
