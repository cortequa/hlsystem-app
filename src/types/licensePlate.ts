/** SPZ ve whitelistu/blacklistu (Sprint 1 datový model). */
export interface LicensePlate {
  _id: string;
  text: string;
  textNormalized: string;
  order?: string;
  from?: string;
  to?: string;
  blacklisted: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Tělo pro založení/úpravu SPZ (text jde v cestě `POST /license-plates/:text`). */
export interface CreateLicensePlateDto {
  order?: string;
  from?: string;
  to?: string;
  blacklisted?: boolean;
}

/** Výsledek ověření vjezdu (`GET /license-plates/check/:text`). */
export interface AccessCheckResult {
  plate: string;
  normalized: string;
  decision: "allow" | "deny";
  reason:
    | "not_found"
    | "blacklisted"
    | "no_valid_reservation"
    | "expired"
    | "not_yet_valid"
    | "valid";
}
