import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/whatsapp", () => ({
  getMensajes: vi.fn(),
}));

import { auth } from "@/auth";
import { getMensajes } from "@/lib/whatsapp";

describe("GET /api/whatsapp/conversaciones/[id]/mensajes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    auth.mockResolvedValue(null);

    const request = new Request("http://localhost/api/whatsapp/conversaciones/123/mensajes");
    const params = Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("No autorizado");
  });

  it("returns 400 when id is not a valid UUID", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const request = new Request("http://localhost/api/whatsapp/conversaciones/invalid/mensajes");
    const params = Promise.resolve({ id: "invalid-id" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("id inválido");
  });

  it("returns messages for a valid conversation", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    const mockMensajes = [
      { id: "msg-1", direccion: "entrante", tipo: "text", body: "Hola", created_at: "2026-08-06T10:00:00Z" },
      { id: "msg-2", direccion: "saliente", tipo: "text", body: "Hola, ¿en qué te ayudo?", created_at: "2026-08-06T10:01:00Z" },
    ];

    getMensajes.mockResolvedValue(mockMensajes);

    const request = new Request(`http://localhost/api/whatsapp/conversaciones/${conversacionId}/mensajes`);
    const params = Promise.resolve({ id: conversacionId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mensajes).toEqual(mockMensajes);
    expect(getMensajes).toHaveBeenCalledWith(conversacionId);
  });

  it("returns an empty array when conversation has no messages", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    getMensajes.mockResolvedValue([]);

    const request = new Request(`http://localhost/api/whatsapp/conversaciones/${conversacionId}/mensajes`);
    const params = Promise.resolve({ id: conversacionId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mensajes).toEqual([]);
  });

  it("returns 500 when getMensajes throws an error", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getMensajes.mockRejectedValue(new Error("Database error"));

    const request = new Request(`http://localhost/api/whatsapp/conversaciones/${conversacionId}/mensajes`);
    const params = Promise.resolve({ id: conversacionId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Error al obtener mensajes");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[/api/whatsapp/conversaciones/:id/mensajes]"),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
