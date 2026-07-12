/** Auditní událost LPR rozhodnutí spárovaná se snímkem (Sprint 2). */
export interface AccessEvent {
  _id: string;
  gateId: string;
  direction: "entry" | "exit";
  cameraId: string;
  plateText: string;
  plateNormalized: string;
  decision: "allow" | "deny";
  reason: string;
  confidence: number;
  imageFilename: string;
  occurredAt: string;
  createdAt?: string;
}
