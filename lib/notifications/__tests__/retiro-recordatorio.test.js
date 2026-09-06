import { describe, it, expect } from "vitest";
import { recordatorioRetiroDisponible } from "../retiro-recordatorio";

const UMBRALES = { umbral_listo_para_retiro: { leve: 5, grave: 10 } };

// Base: orden lista, demorada (7 días ≥ leve 5), sin respuesta del cliente.
function base(overrides = {}) {
  return {
    estado: "LISTO_PARA_RETIRO",
    diasEnEstado: 7,
    updatedAt: "2026-09-01T10:00:00Z",
    lastIncomingMessageAt: null,
    ...overrides,
  };
}

describe("recordatorioRetiroDisponible", () => {
  it("es true cuando está lista, demorada y el cliente no respondió", () => {
    expect(recordatorioRetiroDisponible(base(), UMBRALES)).toBe(true);
  });

  it("es false si la orden no está en LISTO_PARA_RETIRO", () => {
    expect(recordatorioRetiroDisponible(base({ estado: "EN_REPARACION" }), UMBRALES)).toBe(false);
  });

  it("es false si todavía no está demorada según el umbral leve", () => {
    expect(recordatorioRetiroDisponible(base({ diasEnEstado: 3 }), UMBRALES)).toBe(false);
  });

  it("es false si el cliente respondió después de que la orden quedó lista", () => {
    expect(
      recordatorioRetiroDisponible(
        base({ lastIncomingMessageAt: "2026-09-02T10:00:00Z" }),
        UMBRALES
      )
    ).toBe(false);
  });

  it("es true si el único mensaje entrante es anterior a que la orden quedara lista", () => {
    expect(
      recordatorioRetiroDisponible(
        base({ lastIncomingMessageAt: "2026-08-20T10:00:00Z" }),
        UMBRALES
      )
    ).toBe(true);
  });

  it("es false si no hay umbral configurado (no se puede saber si está demorada)", () => {
    expect(recordatorioRetiroDisponible(base(), {})).toBe(false);
  });
});
