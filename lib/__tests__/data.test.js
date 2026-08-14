import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock Supabase admin client BEFORE importing data module (getStats uses admin
// because v_ordenes_dashboard is locked via RLS).
vi.mock("../supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

// Mock Supabase client for getEmpleados and other anon-access functions
vi.mock("../supabase-client", () => ({
  getSupabaseClient: vi.fn(),
}));

// crearOrden also calls getCentrosReparacion/crearTraslado/getTrasladoActivo
// from ../traslados to auto-create a transfer record; mock that module so
// those calls are inert for the empleado_id validation tests below.
vi.mock("../traslados", () => ({
  getCentrosReparacion: vi.fn().mockResolvedValue([]),
  crearTraslado: vi.fn(),
  getTrasladoActivo: vi.fn(),
}));

import * as dataModule from "../data";
import { getSupabaseAdmin as getSupabaseClient } from "../supabase-admin";
import { getSupabaseClient as getSupabaseClientFn } from "../supabase-client";
import { getSupabaseAdmin } from "../supabase-admin";

describe("getStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStats(umbrales) - with thresholds", () => {
    it("should count conRetraso orders correctly with umbrales", async () => {
      // Test data with different dias_en_estado values
      // Order 1: INGRESADO with 3 dias (>= leve threshold of 2) = "leve"
      // Order 2: EN_TALLER with 15 dias (>= grave threshold of 14) = "grave"
      // Order 3: EN_REPARACION with 1 dia (< leve threshold of 3) = "none"
      // Order 4: LISTO_PARA_RETIRO with 5 dias (>= leve threshold of 3) = "leve"
      const mockData = [
        {
          id: 1,
          estado: "INGRESADO",
          dias_en_estado: 3,
        },
        {
          id: 2,
          estado: "EN_TALLER",
          dias_en_estado: 15,
        },
        {
          id: 3,
          estado: "EN_REPARACION",
          dias_en_estado: 1,
        },
        {
          id: 4,
          estado: "LISTO_PARA_RETIRO",
          dias_en_estado: 5,
        },
      ];

      // Set up the mock chain
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const umbrales = {
        umbral_ingresado: { leve: 2, grave: 5 },
        umbral_en_taller: { leve: 7, grave: 14 },
        umbral_en_reparacion: { leve: 3, grave: 7 },
        umbral_listo_para_retiro: { leve: 3, grave: 7 },
      };

      const stats = await dataModule.getStats(umbrales);

      expect(stats).toBeDefined();
      expect(stats.activas).toBe(4);
      expect(stats.conRetraso).toBe(3); // 3 orders with nivel_retraso !== "none"
      expect(stats.porEstado).toEqual({
        INGRESADO: 1,
        EN_TALLER: 1,
        EN_REPARACION: 1,
        LISTO_PARA_RETIRO: 1,
      });
    });

    it("should count listasRetiro correctly", async () => {
      const mockData = [
        {
          id: 1,
          estado: "LISTO_PARA_RETIRO",
          dias_en_estado: 1,
        },
        {
          id: 2,
          estado: "LISTO_PARA_RETIRO",
          dias_en_estado: 4,
        },
        {
          id: 3,
          estado: "EN_TALLER",
          dias_en_estado: 2,
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const umbrales = {
        umbral_listo_para_retiro: { leve: 3, grave: 7 },
        umbral_en_taller: { leve: 7, grave: 14 },
      };

      const stats = await dataModule.getStats(umbrales);

      expect(stats.listasRetiro).toBe(2);
    });

    it("should count enTaller correctly", async () => {
      const mockData = [
        {
          id: 1,
          estado: "EN_TALLER",
          dias_en_estado: 2,
        },
        {
          id: 2,
          estado: "EN_REPARACION",
          dias_en_estado: 1,
        },
        {
          id: 3,
          estado: "LISTO_EN_TALLER",
          dias_en_estado: 0,
        },
        {
          id: 4,
          estado: "INGRESADO",
          dias_en_estado: 0,
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const umbrales = {};

      const stats = await dataModule.getStats(umbrales);

      // EN_TALLER, EN_REPARACION, LISTO_EN_TALLER = 3
      expect(stats.enTaller).toBe(3);
    });
  });

  describe("getStats() - without umbrales (backward compatibility)", () => {
    it("should work without umbrales parameter", async () => {
      const mockData = [
        {
          id: 1,
          estado: "INGRESADO",
          dias_en_estado: 0,
        },
        {
          id: 2,
          estado: "EN_TALLER",
          dias_en_estado: 1,
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const stats = await dataModule.getStats();

      expect(stats).toBeDefined();
      expect(stats.activas).toBe(2);
      expect(stats.conRetraso).toBe(0); // No umbrales means all return "none"
    });

    it("should handle undefined umbrales gracefully", async () => {
      const mockData = [
        {
          id: 1,
          estado: "INGRESADO",
          dias_en_estado: 5,
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const stats = await dataModule.getStats(undefined);

      expect(stats).toBeDefined();
      expect(stats.activas).toBe(1);
      // Without umbrales, getNivelRetraso returns "none" for all
      expect(stats.conRetraso).toBe(0);
    });
  });

  describe("getStats() - error handling", () => {
    it("should throw error when Supabase query fails", async () => {
      const error = new Error("Database error");
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      await expect(dataModule.getStats()).rejects.toThrow("Database error");
    });
  });

  describe("getStats() - empty results", () => {
    it("should handle empty data correctly", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const stats = await dataModule.getStats({});

      expect(stats.activas).toBe(0);
      expect(stats.conRetraso).toBe(0);
      expect(stats.listasRetiro).toBe(0);
      expect(stats.enTaller).toBe(0);
      expect(stats.porEstado).toEqual({});
    });
  });
});

describe("actualizarCliente", () => {
  const ID = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Builder encadenable donde limit() y single() son los terminales que
  // configuramos por caso. getSupabaseAdmin() se llama varias veces pero
  // devuelve siempre el mismo builder, así que las llamadas terminales
  // (limit para dup-checks, single para el update) se resuelven en orden.
  function makeBuilder() {
    const builder = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      single: vi.fn(),
    };
    return builder;
  }

  it("actualiza el cliente cuando no hay duplicados", async () => {
    const builder = makeBuilder();
    builder.limit
      .mockResolvedValueOnce({ data: [], error: null }) // dup documento
      .mockResolvedValueOnce({ data: [], error: null }); // dup telefono
    const actualizado = { id: ID, nombre: "Juan", telefono: "099111222", documento: "1234" };
    builder.single.mockResolvedValue({ data: actualizado, error: null });
    getSupabaseClient.mockReturnValue(builder);

    const res = await dataModule.actualizarCliente(ID, {
      nombre: "Juan",
      telefono: "099111222",
      email: "j@x.com",
      documento: "1234",
    });

    expect(res).toEqual(actualizado);
    // El update incluye telefono_e164 normalizado.
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ telefono_e164: "+59899111222", documento: "1234" })
    );
  });

  it("lanza ClienteDuplicadoError('documento') si el documento pertenece a otro cliente", async () => {
    const builder = makeBuilder();
    builder.limit.mockResolvedValueOnce({ data: [{ id: "otro" }], error: null });
    getSupabaseClient.mockReturnValue(builder);

    await expect(
      dataModule.actualizarCliente(ID, { nombre: "Juan", telefono: "099111222", documento: "1234" })
    ).rejects.toMatchObject({ name: "ClienteDuplicadoError", campo: "documento" });
    // No debe llegar al update.
    expect(builder.update).not.toHaveBeenCalled();
  });

  it("lanza ClienteDuplicadoError('telefono') si el teléfono pertenece a otro cliente", async () => {
    const builder = makeBuilder();
    builder.limit
      .mockResolvedValueOnce({ data: [], error: null }) // documento libre
      .mockResolvedValueOnce({ data: [{ id: "otro" }], error: null }); // telefono tomado
    getSupabaseClient.mockReturnValue(builder);

    await expect(
      dataModule.actualizarCliente(ID, { nombre: "Juan", telefono: "099111222", documento: "1234" })
    ).rejects.toMatchObject({ name: "ClienteDuplicadoError", campo: "telefono" });
    expect(builder.update).not.toHaveBeenCalled();
  });
});

describe("getEmpleados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empleados ordered by nombre", async () => {
    const mockData = [
      { id: "e1", sucursal_id: "s1", nombre: "Ana", activo: true, created_at: "2026-01-01" },
    ];
    const mockClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    getSupabaseClientFn.mockReturnValue(mockClient);

    const result = await dataModule.getEmpleados();

    expect(mockClient.from).toHaveBeenCalledWith("empleados");
    expect(result).toEqual(mockData);
  });

  it("throws when the query errors", async () => {
    const mockClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
    };
    getSupabaseClientFn.mockReturnValue(mockClient);

    await expect(dataModule.getEmpleados()).rejects.toBeTruthy();
  });
});

describe("crearOrden — empleado_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when empleado_id is missing", async () => {
    await expect(
      dataModule.crearOrden({
        cliente_id: "c1",
        tipo_articulo: "Reloj",
        problema_reportado: "no anda",
        sucursal_id: "s1",
      })
    ).rejects.toThrow("empleado_id es requerido");
  });

  it("throws when empleado belongs to a different sucursal", async () => {
    const mockClient = {
      from: vi.fn((table) => {
        if (table === "empleados") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sucursal_id: "OTRA-SUCURSAL" }, error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    getSupabaseAdmin.mockReturnValue(mockClient);

    await expect(
      dataModule.crearOrden({
        cliente_id: "c1",
        tipo_articulo: "Reloj",
        problema_reportado: "no anda",
        sucursal_id: "s1",
        empleado_id: "e1",
      })
    ).rejects.toThrow("El empleado no pertenece a la sucursal seleccionada");
  });

  it("inserts empleado_id when it belongs to the order's sucursal", async () => {
    const insertedOrden = { id: "o1", sucursal_id: "s1", empleado_id: "e1" };
    const mockClient = {
      from: vi.fn((table) => {
        if (table === "empleados") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sucursal_id: "s1", activo: true }, error: null }),
          };
        }
        if (table === "ordenes") {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: insertedOrden, error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    getSupabaseAdmin.mockReturnValue(mockClient);

    const result = await dataModule.crearOrden({
      cliente_id: "c1",
      tipo_articulo: "Reloj",
      problema_reportado: "no anda",
      sucursal_id: "s1",
      empleado_id: "e1",
    });

    expect(result).toEqual(insertedOrden);
  });

  it("throws when empleado is inactive", async () => {
    const mockClient = {
      from: vi.fn((table) => {
        if (table === "empleados") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sucursal_id: "s1", activo: false }, error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
    getSupabaseAdmin.mockReturnValue(mockClient);

    await expect(
      dataModule.crearOrden({
        cliente_id: "c1",
        tipo_articulo: "Reloj",
        problema_reportado: "no anda",
        sucursal_id: "s1",
        empleado_id: "e1",
      })
    ).rejects.toThrow("El empleado seleccionado está inactivo");
  });
});
