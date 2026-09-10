import { describe, it, expect } from "vitest";
import { recordatorioRetiroDisponible } from "../retiro-recordatorio";

const UMBRALES = { umbral_listo_para_retiro: { leve: 5, grave: 10 } };

// Base: orden lista y demorada (7 días ≥ leve 5).
function base(overrides = {}) {
  return {
    estado: "LISTO_PARA_RETIRO",
    diasEnEstado: 7,
    ...overrides,
  };
}

describe("recordatorioRetiroDisponible", () => {
  it("es true cuando está lista y demorada", () => {
    expect(recordatorioRetiroDisponible(base(), UMBRALES)).toBe(true);
  });

  it("es false si la orden no está en LISTO_PARA_RETIRO", () => {
    expect(recordatorioRetiroDisponible(base({ estado: "EN_REPARACION" }), UMBRALES)).toBe(false);
  });

  it("es false si todavía no está demorada según el umbral leve", () => {
    expect(recordatorioRetiroDisponible(base({ diasEnEstado: 3 }), UMBRALES)).toBe(false);
  });

  it("es true aunque el cliente haya respondido después de que la orden quedó lista", () => {
    expect(recordatorioRetiroDisponible(base(), UMBRALES)).toBe(true);
  });

  it("es false si no hay umbral configurado (no se puede saber si está demorada)", () => {
    expect(recordatorioRetiroDisponible(base(), {})).toBe(false);
  });
});
