export interface Visitor {
  _id: string;
  /** Volitelné — recepce má jedno políčko a „Novák" je platné jméno hosta. */
  firstName?: string;
  lastName: string;
  /** Volitelné — prodej u brány kontakt na hosta často nemá. */
  email?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateVisitorDto {
  firstName?: string;
  lastName: string;
  email?: string;
  phone?: string;
}

/** Celé jméno pro výpisy. Host bez příjmení nevznikne, ale data z importu ano. */
export function visitorFullName(visitor?: Visitor | null): string {
  if (!visitor) return "—";
  const full = [visitor.firstName, visitor.lastName].filter(Boolean).join(" ");
  return full || "—";
}

/**
 * Rozdělí jméno z jednoho pole na křestní a příjmení.
 *
 * Formulář na recepci má jedno políčko „Jméno hosta" — obsluha nemá při
 * frontě u závory klikat mezi dvěma. API jméno ukládá rozdělené, takže
 * dělení musí proběhnout tady: poslední slovo je příjmení, zbytek křestní.
 * Jedno slovo je jen příjmení — vyrábět z něj i křestní jméno by znamenalo
 * uložit údaj, který host nikdy neuvedl.
 */
export function splitName(input: string): CreateVisitorDto | null {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const lastName = parts[parts.length - 1];
  if (!lastName) return null;
  const firstName = parts.slice(0, -1).join(" ");
  return firstName ? { firstName, lastName } : { lastName };
}
