/** `shower_credit` = položka prodávající vstupy do sprch na čip. */
export type ProductKind = "generic" | "shower_credit";

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  /** Chybí u položek pořízených před zavedením typů — čti jako `generic`. */
  kind?: ProductKind;
  /** Kolik vstupů dá jedna jednotka. Jen u `shower_credit`. */
  showerCredits?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProductDto {
  name: string;
  description: string;
  price: number;
  kind?: ProductKind;
  showerCredits?: number;
}
