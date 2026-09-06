import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route.js";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ getOrdenRetiroPendiente: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }));

const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: (...a) => mockInsert(...a) }) }),
}));

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function req(id) {
  return [null, { params: Promise.resolve({ id }) }];
}

describe("POST /api/whatsapp/conversaciones/[id]/recordatorio-retiro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("devuelve 401 sin sesión", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue(null);

    const res = await POST(...req(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("devuelve 400 con id inválido", async () => {
    const { auth } = await import("@/auth");
    auth.mockResolvedValue({ user: { id: "u1" } });

    const res = await POST(...req("no-es-uuid"));
    expect(res.status).toBe(400);
  });

  it("devuelve 409 cuando no hay orden elegible para recordatorio", async () => {
    const { auth } = await import("@/auth");
    const { getOrdenRetiroPendiente } = await import("@/lib/whatsapp");
    const { sendNotification } = await import("@/lib/notifications");
    auth.mockResolvedValue({ user: { id: "u1" } });
    getOrdenRetiroPendiente.mockResolvedValue(null);

    const res = await POST(...req(VALID_ID));
    expect(res.status).toBe(409);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("envía el recordatorio y registra la notificación cuando la orden es elegible", async () => {
    const { auth } = await import("@/auth");
    const { getOrdenRetiroPendiente } = await import("@/lib/whatsapp");
    const { sendNotification } = await import("@/lib/notifications");
    auth.mockResolvedValue({ user: { id: "u1" } });
    getOrdenRetiroPendiente.mockResolvedValue({
      ordenId: "orden-1",
      clienteId: "cliente-1",
      numeroOrden: 42,
      tipoArticulo: "Reloj",
      clienteNombre: "Ana",
      clienteTelefono: "+59899123456",
    });

    const res = await POST(...req(VALID_ID));
    expect(res.status).toBe(200);

    expect(sendNotification).toHaveBeenCalledWith("RECORDATORIO_RETIRO", {
      clienteTelefono: "+59899123456",
      clienteNombre: "Ana",
      numeroOrden: "0042",
      tipoArticulo: "Reloj",
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg).toMatchObject({
      orden_id: "orden-1",
      cliente_id: "cliente-1",
      tipo_notificacion: "RECORDATORIO_RETIRO",
      canal: "whatsapp",
    });
  });
});
