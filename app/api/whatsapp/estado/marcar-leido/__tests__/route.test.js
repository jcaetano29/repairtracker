import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ marcarInboxLeido: vi.fn() }));

describe("POST /api/whatsapp/estado/marcar-leido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there's no session", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("marks the inbox as read for an authenticated user", async () => {
    const { auth } = await import("@/auth");
    const { marcarInboxLeido } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "employee" } });
    marcarInboxLeido.mockResolvedValue(undefined);

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(marcarInboxLeido).toHaveBeenCalled();
  });

  it("returns 500 when the update throws", async () => {
    const { auth } = await import("@/auth");
    const { marcarInboxLeido } = await import("@/lib/whatsapp");
    auth.mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    marcarInboxLeido.mockRejectedValue(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST();
    expect(response.status).toBe(500);
    err.mockRestore();
  });
});
