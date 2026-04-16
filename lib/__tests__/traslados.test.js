import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock Supabase client BEFORE importing traslados module
vi.mock("../supabase-client", () => ({
  getSupabaseClient: vi.fn(),
}));

import * as trasladosModule from "../traslados";
import { getSupabaseClient } from "../supabase-client";

describe("traslados data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===================================================================
  // getTraslados Tests
  // ===================================================================

  describe("getTraslados", () => {
    it("should get all active traslados without filtering", async () => {
      const mockTraslados = [
        {
          id: "traslado-1",
          orden_id: "orden-1",
          sucursal_origen: "sucursal-1",
          sucursal_destino: "sucursal-2",
          tipo: "ida",
          estado: "pendiente",
          ordenes: {
            numero_orden: "#001",
            tipo_articulo: "Laptop",
            marca: "Dell",
            cliente_id: "cliente-1",
            clientes: {
              nombre: "Juan Perez",
              telefono: "099123456",
            },
          },
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockTraslados,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getTraslados();

      expect(result).toEqual(mockTraslados);
      expect(mockClient.from).toHaveBeenCalledWith("traslados");
      expect(mockClient.neq).toHaveBeenCalledWith("estado", "recibido");
    });

    it("should filter traslados by sucursal_id (origin OR destination)", async () => {
      const mockTraslados = [
        {
          id: "traslado-1",
          sucursal_origen: "sucursal-1",
          sucursal_destino: "sucursal-2",
        },
      ];

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockTraslados,
          error: null,
        }),
      };

      const mockClient = {
        from: vi.fn().mockReturnValue(mockChain),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const sucursal_id = "sucursal-1";
      const result = await trasladosModule.getTraslados({ sucursal_id });

      expect(result).toEqual(mockTraslados);
      expect(mockChain.or).toHaveBeenCalledWith(
        `sucursal_origen.eq.${sucursal_id},sucursal_destino.eq.${sucursal_id}`
      );
    });

    it("should return empty array when no traslados found", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getTraslados();

      expect(result).toEqual([]);
    });

    it("should throw error if query fails", async () => {
      const error = new Error("Database error");
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      await expect(trasladosModule.getTraslados()).rejects.toThrow(
        "Database error"
      );
    });
  });

  // ===================================================================
  // getTrasladosByOrden Tests
  // ===================================================================

  describe("getTrasladosByOrden", () => {
    it("should get all traslados for an order", async () => {
      const mockTraslados = [
        {
          id: "traslado-1",
          orden_id: "orden-1",
          tipo: "ida",
          estado: "recibido",
        },
        {
          id: "traslado-2",
          orden_id: "orden-1",
          tipo: "retorno",
          estado: "pendiente",
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockTraslados,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getTrasladosByOrden("orden-1");

      expect(result).toEqual(mockTraslados);
      expect(mockClient.eq).toHaveBeenCalledWith("orden_id", "orden-1");
    });

    it("should return empty array when order has no traslados", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getTrasladosByOrden("orden-1");

      expect(result).toEqual([]);
    });
  });

  // ===================================================================
  // crearTraslado Tests
  // ===================================================================

  describe("crearTraslado", () => {
    it("should create a new traslado with all fields", async () => {
      const mockTraslado = {
        id: "traslado-1",
        orden_id: "orden-1",
        sucursal_origen: "sucursal-1",
        sucursal_destino: "sucursal-2",
        tipo: "ida",
        estado: "pendiente",
        creado_por: "user-1",
        recibido_por: null,
        fecha_salida: null,
        fecha_recepcion: null,
      };

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockTraslado,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.crearTraslado({
        orden_id: "orden-1",
        sucursal_origen: "sucursal-1",
        sucursal_destino: "sucursal-2",
        tipo: "ida",
        creado_por: "user-1",
      });

      expect(result).toEqual(mockTraslado);
      expect(mockClient.insert).toHaveBeenCalledWith({
        orden_id: "orden-1",
        sucursal_origen: "sucursal-1",
        sucursal_destino: "sucursal-2",
        tipo: "ida",
        creado_por: "user-1",
        estado: "pendiente",
      });
    });

    it("should create a traslado without creado_por (auto-created)", async () => {
      const mockTraslado = {
        id: "traslado-1",
        orden_id: "orden-1",
        sucursal_origen: "sucursal-1",
        sucursal_destino: "sucursal-2",
        tipo: "ida",
        estado: "pendiente",
        creado_por: null,
        recibido_por: null,
      };

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockTraslado,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.crearTraslado({
        orden_id: "orden-1",
        sucursal_origen: "sucursal-1",
        sucursal_destino: "sucursal-2",
        tipo: "ida",
      });

      expect(result).toEqual(mockTraslado);
      expect(mockClient.insert).toHaveBeenCalledWith({
        orden_id: "orden-1",
        sucursal_origen: "sucursal-1",
        sucursal_destino: "sucursal-2",
        tipo: "ida",
        creado_por: null,
        estado: "pendiente",
      });
    });
  });

  // ===================================================================
  // despacharTraslado Tests
  // ===================================================================

  describe("despacharTraslado", () => {
    it("should update traslado to en_transito with fecha_salida when in pendiente state", async () => {
      const now = new Date();
      const mockTraslado = {
        id: "traslado-1",
        estado: "en_transito",
        fecha_salida: now.toISOString(),
      };

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockTraslado,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.despacharTraslado("traslado-1");

      expect(result).toEqual(mockTraslado);
      expect(mockClient.from).toHaveBeenCalledWith("traslados");
      expect(mockClient.update).toHaveBeenCalled();
    });

    it("should return current traslado if already dispatched (idempotent)", async () => {
      const mockTraslado = {
        id: "traslado-1",
        estado: "en_transito",
        fecha_salida: "2026-04-13T10:00:00Z",
      };

      let callCount = 0;
      const mockClient = {
        from: vi.fn(() => {
          callCount++;
          if (callCount === 1) {
            // First call: update returns PGRST116 error (no rows matched)
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116" }, // No rows matched the WHERE condition
              }),
            };
          } else if (callCount === 2) {
            // Second call: fetch current state
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: mockTraslado,
                error: null,
              }),
            };
          }
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.despacharTraslado("traslado-1");

      expect(result).toEqual(mockTraslado);
      expect(mockClient.from).toHaveBeenCalledTimes(2);
    });
  });

  // ===================================================================
  // recibirTraslado Tests
  // ===================================================================

  describe("recibirTraslado", () => {
    it("should update traslado to recibido when in en_transito state and update orden sucursal_id", async () => {
      const now = new Date();
      const updatedTraslado = {
        id: "traslado-1",
        orden_id: "orden-1",
        sucursal_destino: "sucursal-2",
        estado: "recibido",
        fecha_recepcion: now.toISOString(),
        recibido_por: "user-2",
      };

      let callCount = 0;
      const mockClient = {
        from: vi.fn((table) => {
          callCount++;
          if (callCount === 1) {
            // First call: get the traslado to check state
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "traslado-1",
                  orden_id: "orden-1",
                  sucursal_destino: "sucursal-2",
                  estado: "en_transito",
                },
                error: null,
              }),
            };
          } else if (callCount === 2) {
            // Second call: update the traslado
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: updatedTraslado,
                error: null,
              }),
            };
          } else if (callCount === 3) {
            // Third call: update the orden
            return {
              update: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            };
          }
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.recibirTraslado(
        "traslado-1",
        "user-2"
      );

      expect(result).toEqual(updatedTraslado);
      expect(mockClient.from).toHaveBeenCalledWith("traslados");
      expect(mockClient.from).toHaveBeenCalledWith("ordenes");
    });

    it("should return current traslado if not in en_transito state (idempotent)", async () => {
      const mockTraslado = {
        id: "traslado-1",
        orden_id: "orden-1",
        sucursal_destino: "sucursal-2",
        estado: "recibido",
        fecha_recepcion: "2026-04-13T10:00:00Z",
        recibido_por: "user-2",
      };

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockTraslado,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.recibirTraslado(
        "traslado-1",
        "user-2"
      );

      expect(result).toEqual(mockTraslado);
      // Should only call once to check state, then return early
      expect(mockClient.from).toHaveBeenCalledTimes(1);
    });

    it("should throw error if traslado fetch fails", async () => {
      const error = new Error("Traslado not found");
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error,
          }),
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      await expect(
        trasladosModule.recibirTraslado("traslado-1", "user-2")
      ).rejects.toThrow("Traslado not found");
    });
  });

  // ===================================================================
  // getCentrosReparacion Tests
  // ===================================================================

  describe("getCentrosReparacion", () => {
    it("should get all repair center sucursales", async () => {
      const mockCentros = [
        {
          id: "centro-1",
          nombre: "Punta Carretas",
          es_centro_reparacion: true,
        },
        {
          id: "centro-2",
          nombre: "Nuevo Centro",
          es_centro_reparacion: true,
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockCentros,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getCentrosReparacion();

      expect(result).toEqual(mockCentros);
      expect(mockClient.eq).toHaveBeenCalledWith("es_centro_reparacion", true);
    });

    it("should return empty array if no repair centers found", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getCentrosReparacion();

      expect(result).toEqual([]);
    });

    it("should throw error if query fails", async () => {
      const error = new Error("Database error");
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      await expect(trasladosModule.getCentrosReparacion()).rejects.toThrow(
        "Database error"
      );
    });
  });

  // ===================================================================
  // getTrasladoActivo Tests
  // ===================================================================

  describe("getTrasladoActivo", () => {
    it("should get the most recent active traslado for an order", async () => {
      const mockTraslado = {
        id: "traslado-1",
        orden_id: "orden-1",
        tipo: "ida",
        estado: "en_transito",
      };

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockTraslado,
          error: null,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getTrasladoActivo("orden-1");

      expect(result).toEqual(mockTraslado);
      expect(mockClient.neq).toHaveBeenCalledWith("estado", "recibido");
    });

    it("should return null if no active traslado found", async () => {
      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" }, // No rows returned
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      const result = await trasladosModule.getTrasladoActivo("orden-1");

      expect(result).toBeNull();
    });

    it("should throw error if query fails (non-PGRST116 error)", async () => {
      const error = new Error("Database connection error");
      error.code = "SOME_OTHER_ERROR";

      const mockClient = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      };

      getSupabaseClient.mockReturnValue(mockClient);

      await expect(
        trasladosModule.getTrasladoActivo("orden-1")
      ).rejects.toThrow("Database connection error");
    });
  });
});
