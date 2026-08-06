import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ getConversaciones: vi.fn() }));

describe("GET /api/whatsapp/conversaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the conversation list for an authenticated user", async () => {
    const { auth } = await import("@/auth");
    const { getConversaciones } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "employee" } });
    getConversaciones.mockResolvedValue([{ id: "conv-1" }]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ conversaciones: [{ id: "conv-1" }] });
  });

  it("returns 500 when the query layer throws", async () => {
    const { auth } = await import("@/auth");
    const { getConversaciones } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    getConversaciones.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
