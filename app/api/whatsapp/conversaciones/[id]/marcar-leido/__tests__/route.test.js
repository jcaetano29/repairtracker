import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ marcarConversacionLeida: vi.fn() }));

import { auth } from "@/auth";
import { marcarConversacionLeida } from "@/lib/whatsapp";

describe("POST /api/whatsapp/conversaciones/[id]/marcar-leido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    auth.mockResolvedValue(null);

    const params = Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("No autorizado");
    expect(marcarConversacionLeida).not.toHaveBeenCalled();
  });

  it("returns 400 when id is not a valid UUID", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });

    const params = Promise.resolve({ id: "not-a-uuid" });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("id inválido");
  });

  it("marks the conversation as read for a valid id", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    marcarConversacionLeida.mockResolvedValue(undefined);

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    const params = Promise.resolve({ id: conversacionId });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(marcarConversacionLeida).toHaveBeenCalledWith(conversacionId);
  });

  it("returns 500 when marcarConversacionLeida throws", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    marcarConversacionLeida.mockRejectedValue(new Error("boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const conversacionId = "550e8400-e29b-41d4-a716-446655440000";
    const params = Promise.resolve({ id: conversacionId });
    const response = await POST(new Request("http://localhost/x"), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Error al marcar como leído");

    consoleErrorSpy.mockRestore();
  });
});
