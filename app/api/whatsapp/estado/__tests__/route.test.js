import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ hayMensajesSinLeer: vi.fn() }));

describe("GET /api/whatsapp/estado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns hayNuevos: true when there are unread messages", async () => {
    const { auth } = await import("@/auth");
    const { hayMensajesSinLeer } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "employee" } });
    hayMensajesSinLeer.mockResolvedValue(true);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ hayNuevos: true });
  });

  it("returns 500 when the query layer throws", async () => {
    const { auth } = await import("@/auth");
    const { hayMensajesSinLeer } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    hayMensajesSinLeer.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
