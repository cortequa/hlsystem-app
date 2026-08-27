export type ChipStatus = "in_stock" | "issued" | "lost" | "retired";

export interface ShowerChip {
  _id: string;
  uid: string;
  label?: string;
  status: ChipStatus;
  /** Zbývající počet vstupů. */
  balance: number;
  stayId?: string;
  visitorId?: string;
  depositAmount?: number;
  issuedAt?: string;
  returnedAt?: string;
  lastSeenAt?: string;
  createdAt?: string;
}

export type TransactionKind =
  | "topup"
  | "entry"
  | "refund"
  | "adjust"
  | "issue"
  | "return";

export interface ChipTransaction {
  _id: string;
  chipId: string;
  chipUid: string;
  kind: TransactionKind;
  amount: number;
  balanceAfter: number;
  orderId?: string;
  operator?: string;
  note?: string;
  occurredAt: string;
}

export type DeviceMode = "credit" | "free" | "closed";

export interface ShowerDevice {
  _id: string;
  deviceKey: string;
  name: string;
  location?: string;
  mode: DeviceMode;
  graceSeconds: number;
  unlockSeconds: number;
  offlineMaxEntries: number;
  lastSeenAt?: string;
}

export type ShowerReason =
  | "credit_used"
  | "grace_reentry"
  | "free_mode"
  | "offline_allowed"
  | "unknown_chip"
  | "no_credit"
  | "chip_lost"
  | "chip_not_issued"
  | "device_closed"
  | "device_unknown"
  | "offline_limit";

export interface ShowerEvent {
  _id: string;
  deviceId: string;
  chipUid: string;
  chipId?: string;
  decision: "allow" | "deny";
  reason: ShowerReason | string;
  balanceAfter?: number;
  stayId?: string;
  offline: boolean;
  occurredAt: string;
}

/** Payload realtime události `showerEvent`. */
export interface ShowerEventMessage {
  showerEventId: string;
  deviceId: string;
  deviceKey: string;
  chipUid: string;
  decision: "allow" | "deny";
  reason: string;
  balanceAfter?: number;
  offline: boolean;
  occurredAt: string;
}

export interface TopUpResult {
  chipUid: string;
  orderId: string;
  credits: number;
  balance: number;
}

export const chipStatusLabel: Record<ChipStatus, string> = {
  in_stock: "Skladem",
  issued: "Vydaný",
  lost: "Ztracený",
  retired: "Vyřazený",
};

export const deviceModeLabel: Record<DeviceMode, string> = {
  credit: "Na kredit",
  free: "Volně otevřeno",
  closed: "Mimo provoz",
};

export const transactionKindLabel: Record<TransactionKind, string> = {
  topup: "Dobití",
  entry: "Vstup",
  refund: "Propadlý kredit",
  adjust: "Ruční oprava",
  issue: "Výdej čipu",
  return: "Vrácení čipu",
};

export const showerReasonLabel: Record<ShowerReason, string> = {
  credit_used: "vstup odečten",
  grace_reentry: "návrat zdarma",
  free_mode: "volný režim",
  offline_allowed: "povoleno offline",
  unknown_chip: "neznámý čip",
  no_credit: "bez kreditu",
  chip_lost: "čip nahlášen jako ztracený",
  chip_not_issued: "čip nikomu nevydaný",
  device_closed: "sprchy mimo provoz",
  device_unknown: "neznámé zařízení",
  offline_limit: "vyčerpán offline limit",
};
