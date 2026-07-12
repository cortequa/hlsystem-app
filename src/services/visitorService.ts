import { ENV } from "../config/env";
import { http } from "./http";
import { Visitor, CreateVisitorDto } from "../types/visitor";

const VISITORS = ENV.API.ENDPOINTS.VISITORS;

// Rozbalování `{ success, data }` řeší http helper na jednom místě (dřív se tu
// vracel nerozbalený wrapper — latentní bug, Sprint 4 fix).
export const visitorService = {
  async getVisitors(): Promise<Visitor[]> {
    const data = await http.get<Visitor[]>(VISITORS);
    return Array.isArray(data) ? data : [];
  },

  async getVisitorById(id: string): Promise<Visitor | null> {
    return http.get<Visitor>(`${VISITORS}/${id}`);
  },

  async createVisitor(visitor: CreateVisitorDto): Promise<{ visitorId: string }> {
    return http.post<{ visitorId: string }>(VISITORS, visitor);
  },

  async updateVisitor(id: string, visitor: Partial<CreateVisitorDto>): Promise<Visitor | null> {
    return http.patch<Visitor>(`${VISITORS}/${id}`, visitor);
  },

  async deleteVisitor(id: string): Promise<boolean> {
    await http.del<void>(`${VISITORS}/${id}`);
    return true;
  },
};
