import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock Supabase client BEFORE importing data module
vi.mock("../supabase-client", () => ({
  getSupabaseClient: vi.fn(),
}));

import * as dataModule from "../data";
import { getSupabaseClient } from "../supabase-client";

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
