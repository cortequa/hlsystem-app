/** Vozidlo navázané na pobyt. Platnost má z termínu pobytu, ne vlastní. */
export interface StayVehicle {
  plate: string;
  plateNormalized: string;
  plateCanonical: string;
  source: "manual" | "lpr" | "import";
  addedAt: string;
  note?: string;
}

export type StayStatus = "booked" | "checked_in" | "checked_out" | "cancelled";

/**
 * Pobyt = rezervace hosta na termín, s vozidly, která smí do areálu.
 * Oddělený od účtenky (`Order`) schválně — krácení daní účtenky maže.
 */
export interface Stay {
  _id: string;
  visitorId: string;
  from: string;
  to: string;
  nights: number;
  vehicles: StayVehicle[];
  maxVehicles: number;
  status: StayStatus;
  note?: string;
  gateIds?: string[];
  checkedInAt?: string;
  checkedOutAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Shodné s `CreateVisitorDto` — křestní jméno je volitelné, příjmení stačí. */
export interface CreateStayVisitorDto {
  firstName?: string;
  lastName: string;
  email?: string;
  phone?: string;
}

export interface CreateStayDto {
  /** Buď existující host… */
  visitorId?: string;
  /** …nebo rychlé založení přímo z formuláře rezervace / prodeje u brány. */
  visitor?: CreateStayVisitorDto;
  from: string;
  to: string;
  vehicles?: { plate: string; note?: string }[];
  maxVehicles?: number;
  note?: string;
  gateIds?: string[];
  /** Účtenka zakládaná spolu s pobytem (prodej lístku u brány). */
  products?: { productId: string; quantity: number; duration?: number }[];
}

export interface UpdateStayDto {
  from?: string;
  to?: string;
  note?: string;
  maxVehicles?: number;
  visitorId?: string;
  gateIds?: string[];
}

export interface CreateStayResult {
  stayId: string;
  orderId?: string;
}

export const stayStatusLabel: Record<StayStatus, string> = {
  booked: "Rezervováno",
  checked_in: "Na místě",
  checked_out: "Odjel",
  cancelled: "Zrušeno",
};
