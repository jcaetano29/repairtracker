import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import * as whatsappModule from "../whatsapp";
import { getSupabaseAdmin } from "../supabase-admin";

describe("whatsapp query layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getConversaciones", () => {
    it("returns conversations ordered by last_message_at desc", async () => {
      const mockData = [{ id: "conv-1", cliente_id: "cliente-1", clientes: { nombre: "Ana" } }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result).toEqual(mockData);
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_conversaciones");
      expect(mockClient.order).toHaveBeenCalledWith("last_message_at", { ascending: false });
    });

    it("returns an empty array when there's no data", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      expect(await whatsappModule.getConversaciones()).toEqual([]);
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.getConversaciones()).rejects.toEqual({ message: "boom" });
    });
  });

  describe("getMensajes", () => {
    it("returns messages for a conversation ordered chronologically", async () => {
      const mockData = [{ id: "msg-1", direccion: "entrante", tipo: "text", body: "Hola" }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getMensajes("conv-1");

      expect(result).toEqual(mockData);
      expect(mockClient.eq).toHaveBeenCalledWith("conversacion_id", "conv-1");
      expect(mockClient.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });
  });
});
