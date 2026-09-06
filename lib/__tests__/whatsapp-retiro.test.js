import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase mock: cada tabla devuelve un resultado configurable. El builder es
// "thenable", así que awaitear cualquier cadena (.select().eq().order() /
// .single() / .in()) resuelve al resultado de esa tabla.
let resultsByTable = {};
function builderFor(table) {
  const result = resultsByTable[table];
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    single: () => builder,
    then: (resolve, reject) =>
      Promise.resolve(typeof result === "function" ? result() : result).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: (table) => builderFor(table) }),
}));
vi.mock("@/lib/data/configuracion", () => ({ getConfiguracion: vi.fn() }));

const UMBRALES = { umbral_listo_para_retiro: { leve: 5, grave: 10 } };

async function setConfig(config) {
  const { getConfiguracion } = await import("@/lib/data/configuracion");
  getConfiguracion.mockResolvedValue(config);
}

beforeEach(() => {
  vi.clearAllMocks();
  resultsByTable = {};
});

describe("getOrdenRetiroPendiente", () => {
  const conv = {
    data: { id: "conv1", cliente_id: "c1", last_incoming_message_at: null },
    error: null,
  };
  const ordenLista = {
    id: "o1",
    numero_orden: 42,
    tipo_articulo: "Reloj",
    cliente_id: "c1",
    cliente_telefono: "+59899123456",
    cliente_nombre: "Ana",
    updated_at: "2026-09-01T10:00:00Z",
    dias_en_estado: 7,
  };

  it("devuelve los datos de la orden cuando es elegible", async () => {
    await setConfig(UMBRALES);
    resultsByTable = {
      whatsapp_conversaciones: conv,
      v_ordenes_dashboard: { data: [ordenLista], error: null },
    };
    const { getOrdenRetiroPendiente } = await import("@/lib/whatsapp");

    const res = await getOrdenRetiroPendiente("conv1");
    expect(res).toEqual({
      ordenId: "o1",
      clienteId: "c1",
      numeroOrden: 42,
      tipoArticulo: "Reloj",
      clienteNombre: "Ana",
      clienteTelefono: "+59899123456",
    });
  });

  it("devuelve null cuando el cliente no tiene orden lista para retirar", async () => {
    await setConfig(UMBRALES);
    resultsByTable = {
      whatsapp_conversaciones: conv,
      v_ordenes_dashboard: { data: [], error: null },
    };
    const { getOrdenRetiroPendiente } = await import("@/lib/whatsapp");

    expect(await getOrdenRetiroPendiente("conv1")).toBeNull();
  });

  it("devuelve null cuando el cliente respondió después de que quedó lista", async () => {
    await setConfig(UMBRALES);
    resultsByTable = {
      whatsapp_conversaciones: {
        data: { id: "conv1", cliente_id: "c1", last_incoming_message_at: "2026-09-05T10:00:00Z" },
        error: null,
      },
      v_ordenes_dashboard: { data: [ordenLista], error: null },
    };
    const { getOrdenRetiroPendiente } = await import("@/lib/whatsapp");

    expect(await getOrdenRetiroPendiente("conv1")).toBeNull();
  });
});

describe("getConversaciones (enriquecido con recordatorio de retiro)", () => {
  it("marca recordatorioDisponible y adjunta la orden más antigua", async () => {
    await setConfig(UMBRALES);
    resultsByTable = {
      whatsapp_conversaciones: {
        data: [
          {
            id: "conv1",
            cliente_id: "c1",
            telefono_e164: "+59899123456",
            last_message_at: "2026-09-08T10:00:00Z",
            last_message_preview: "hola",
            last_incoming_message_at: null,
            last_read_at: null,
            clientes: { nombre: "Ana", email: null },
          },
        ],
        error: null,
      },
      v_ordenes_dashboard: {
        data: [
          { numero_orden: 7, tipo_articulo: "Anillo", cliente_id: "c1", updated_at: "2026-09-03T10:00:00Z", dias_en_estado: 5 },
          { numero_orden: 42, tipo_articulo: "Reloj", cliente_id: "c1", updated_at: "2026-09-01T10:00:00Z", dias_en_estado: 7 },
        ],
        error: null,
      },
    };
    const { getConversaciones } = await import("@/lib/whatsapp");

    const [c] = await getConversaciones();
    expect(c.recordatorioDisponible).toBe(true);
    // La más antigua (mayor dias_en_estado) es la #42.
    expect(c.retiroPendiente).toEqual({ numeroOrden: 42, tipoArticulo: "Reloj" });
  });

  it("no marca recordatorioDisponible si el cliente no tiene orden lista", async () => {
    await setConfig(UMBRALES);
    resultsByTable = {
      whatsapp_conversaciones: {
        data: [
          {
            id: "conv1",
            cliente_id: "c1",
            telefono_e164: "+59899123456",
            last_message_at: "2026-09-08T10:00:00Z",
            last_message_preview: "hola",
            last_incoming_message_at: null,
            last_read_at: null,
            clientes: { nombre: "Ana", email: null },
          },
        ],
        error: null,
      },
      v_ordenes_dashboard: { data: [], error: null },
    };
    const { getConversaciones } = await import("@/lib/whatsapp");

    const [c] = await getConversaciones();
    expect(c.recordatorioDisponible).toBe(false);
    expect(c.retiroPendiente).toBeNull();
  });
});
