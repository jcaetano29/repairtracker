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
    it("returns conversations ordered by last_message_at desc, with unread computed", async () => {
      const mockData = [
        {
          id: "conv-1",
          cliente_id: "cliente-1",
          clientes: { nombre: "Ana", email: "ana@example.com" },
          last_incoming_message_at: "2026-08-07T10:00:00.000Z",
          last_read_at: "2026-08-06T00:00:00.000Z",
        },
      ];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result).toEqual([{ ...mockData[0], unread: true }]);
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_conversaciones");
      expect(mockClient.select).toHaveBeenCalledWith(
        "id, cliente_id, telefono_e164, last_message_at, last_message_preview, last_incoming_message_at, last_read_at, clientes(nombre, email)"
      );
      expect(mockClient.order).toHaveBeenCalledWith("last_message_at", { ascending: false });
    });

    it("marks unread false when last_incoming_message_at is before last_read_at", async () => {
      const mockData = [
        {
          id: "conv-2",
          last_incoming_message_at: "2026-08-01T00:00:00.000Z",
          last_read_at: "2026-08-06T00:00:00.000Z",
        },
      ];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result[0].unread).toBe(false);
    });

    it("marks unread false when last_incoming_message_at is null", async () => {
      const mockData = [{ id: "conv-3", last_incoming_message_at: null, last_read_at: "2026-08-06T00:00:00.000Z" }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result[0].unread).toBe(false);
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

    it("marks unread true when last_read_at is null and there's an incoming message (brand-new conversation)", async () => {
      const mockData = [{ id: "conv-4", last_incoming_message_at: "2026-08-07T10:00:00.000Z", last_read_at: null }];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result[0].unread).toBe(true);
    });

    it("marks unread false when last_incoming_message_at equals last_read_at exactly", async () => {
      const mockData = [
        { id: "conv-5", last_incoming_message_at: "2026-08-07T10:00:00.000Z", last_read_at: "2026-08-07T10:00:00.000Z" },
      ];
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.getConversaciones();

      expect(result[0].unread).toBe(false);
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
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_mensajes");
      expect(mockClient.select).toHaveBeenCalledWith("id, direccion, tipo, body, created_at");
      expect(mockClient.eq).toHaveBeenCalledWith("conversacion_id", "conv-1");
      expect(mockClient.order).toHaveBeenCalledWith("created_at", { ascending: true });
    });

    it("returns an empty array when there's no data", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      expect(await whatsappModule.getMensajes("conv-1")).toEqual([]);
      expect(mockClient.select).toHaveBeenCalledWith("id, direccion, tipo, body, created_at");
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.getMensajes("conv-1")).rejects.toEqual({ message: "boom" });
      expect(mockClient.select).toHaveBeenCalledWith("id, direccion, tipo, body, created_at");
    });
  });

  describe("hayMensajesSinLeer", () => {
    it("returns true when there's an incoming message after last_read_at", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { last_read_at: "2026-08-01T00:00:00.000Z" }, error: null }),
        gt: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [{ id: "msg-1" }], error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      const result = await whatsappModule.hayMensajesSinLeer();

      expect(result).toBe(true);
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_inbox_estado");
      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_mensajes");
      expect(mockClient.eq).toHaveBeenCalledWith("id", 1);
      expect(mockClient.eq).toHaveBeenCalledWith("direccion", "entrante");
      expect(mockClient.gt).toHaveBeenCalledWith("created_at", "2026-08-01T00:00:00.000Z");
      expect(mockClient.limit).toHaveBeenCalledWith(1);
    });

    it("returns false when there are no incoming messages after last_read_at", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { last_read_at: "2026-08-01T00:00:00.000Z" }, error: null }),
        gt: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      expect(await whatsappModule.hayMensajesSinLeer()).toBe(false);
    });

    it("throws when Supabase returns an error reading the status row", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
        gt: vi.fn().mockReturnThis(),
        limit: vi.fn(),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.hayMensajesSinLeer()).rejects.toEqual({ message: "boom" });
    });
  });

  describe("marcarInboxLeido", () => {
    it("updates last_read_at on the singleton row", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await whatsappModule.marcarInboxLeido();

      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_inbox_estado");
      expect(mockClient.update).toHaveBeenCalledWith(expect.objectContaining({ last_read_at: expect.any(String) }));
      expect(mockClient.eq).toHaveBeenCalledWith("id", 1);
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.marcarInboxLeido()).rejects.toEqual({ message: "boom" });
    });
  });

  describe("marcarConversacionLeida", () => {
    it("updates last_read_at for the given conversation id", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await whatsappModule.marcarConversacionLeida("conv-1");

      expect(mockClient.from).toHaveBeenCalledWith("whatsapp_conversaciones");
      expect(mockClient.update).toHaveBeenCalledWith(expect.objectContaining({ last_read_at: expect.any(String) }));
      expect(mockClient.eq).toHaveBeenCalledWith("id", "conv-1");
    });

    it("throws when Supabase returns an error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
      };
      getSupabaseAdmin.mockReturnValue(mockClient);

      await expect(whatsappModule.marcarConversacionLeida("conv-1")).rejects.toEqual({ message: "boom" });
    });
  });
});
