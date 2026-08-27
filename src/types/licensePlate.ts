/**
 * RUČNÍ pravidlo pro SPZ. Vozidla hostů sem už nepatří — ta žijí v pobytu
 * (`Stay.vehicles`), kde mají platnost z termínu pobytu na jednom místě.
 */
export type PlateRuleKind = "allow" | "blacklist";

export interface LicensePlate {
  _id: string;
  text: string;
  textNormalized: string;
  plateCanonical: string;
  kind: PlateRuleKind;
  from?: string;
  to?: string;
  reason?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Tělo pro založení pravidla (text jde v cestě `POST /license-plates/:text`). */
export interface CreateLicensePlateDto {
  kind: PlateRuleKind;
  from?: string;
  to?: string;
  reason?: string;
}

export type AccessReason =
  | "exit_free"
  | "exit_expired"
  | "exit_unknown"
  | "exit_blacklisted"
  | "manual_allow"
  | "stay_valid"
  | "blacklisted"
  | "not_yet_valid"
  | "expired"
  | "stay_cancelled"
  | "stay_checked_out"
  | "vehicle_limit_exceeded"
  | "gate_not_allowed"
  | "fuzzy_candidate"
  | "not_found";

/** Výsledek ověření vjezdu (`GET /license-plates/check/:text`). */
export interface AccessCheckResult {
  plate: string;
  normalized: string;
  decision: "allow" | "deny";
  reason: AccessReason;
  matchType: "exact" | "fuzzy" | "none";
  stayId?: string;
  visitorId?: string;
  licensePlateId?: string;
  suggestedStayId?: string;
  alert?: boolean;
}

export const accessReasonLabel: Record<AccessReason, string> = {
  exit_free: "výjezd v termínu",
  exit_expired: "výjezd po termínu (pouštíme ven vždy)",
  exit_unknown: "výjezd neznámé SPZ (pouštíme ven vždy)",
  exit_blacklisted: "výjezd blokované SPZ — upozorni obsluhu",
  manual_allow: "ruční povolení",
  stay_valid: "platný pobyt",
  blacklisted: "na blacklistu",
  not_yet_valid: "pobyt ještě nezačal",
  expired: "pobyt už skončil",
  stay_cancelled: "pobyt zrušen",
  stay_checked_out: "host už odjel (check-out)",
  vehicle_limit_exceeded: "překročen počet vozidel pobytu",
  gate_not_allowed: "pobyt na tuhle bránu neplatí",
  fuzzy_candidate: "podobná SPZ v pobytu — potvrď ručně",
  not_found: "SPZ není evidována",
};
