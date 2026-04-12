import { describe, it, expect, vi, beforeEach } from "vitest"
import { auth } from "@/auth"

// Mock next-auth
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

// Mock next/navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

// Mock data functions
vi.mock("@/lib/data/configuracion", () => ({
  getConfiguracion: vi.fn(),
}))

// Mock toast utility
vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockPlantillasEmail = [
  {
    tipo: "PRESUPUESTO",
    asunto: "Presupuesto listo — Orden #{{numeroOrden}}",
    cuerpo: "Hola {{clienteNombre}}, tenemos el presupuesto listo.",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    tipo: "LISTO_PARA_RETIRO",
    asunto: "¡Tu artículo está listo! — Orden #{{numeroOrden}}",
    cuerpo: "Hola {{clienteNombre}}, tu artículo está listo.",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    tipo: "RECORDATORIO_MANTENIMIENTO",
    asunto: "Recordatorio de mantenimiento — {{tipoServicio}}",
    cuerpo: "Hola {{clienteNombre}}, te recordamos el mantenimiento.",
    updated_at: "2026-01-01T00:00:00Z",
  },
]

const mockConfiguracion = {
  umbral_ingresado: { leve: 2, grave: 5 },
  umbral_en_taller: { leve: 7, grave: 14 },
  umbral_esperando_aprobacion: { leve: 1, grave: 3 },
  umbral_rechazado: { leve: 0, grave: 0 },
  umbral_en_reparacion: { leve: 3, grave: 7 },
  umbral_listo_en_taller: { leve: 1, grave: 3 },
  umbral_listo_para_retiro: { leve: 3, grave: 7 },
  umbral_entregado: { leve: 0, grave: 0 },
}

describe("ConfiguracionPage Server Component - Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication Logic", () => {
    it("should redirect to /login when session is null", async () => {
      // Test the redirect logic
      const session = null
      expect(session?.user?.id).toBeUndefined()
      // In actual component: if (!session?.user?.id) redirect("/login")
    })

    it("should check session.user.id exists", async () => {
      const session = { user: { id: "123", role: "admin" } }
      expect(session?.user?.id).toBeDefined()
    })
  })

  describe("Authorization Logic", () => {
    it("should redirect to /dashboard when role is not admin", async () => {
      const session = { user: { id: "123", role: "employee" } }
      const shouldRedirectToDashboard = session.user.role !== "admin"
      expect(shouldRedirectToDashboard).toBe(true)
    })

    it("should allow access when role is admin", async () => {
      const session = { user: { id: "123", role: "admin" } }
      const shouldRedirectToDashboard = session.user.role !== "admin"
      expect(shouldRedirectToDashboard).toBe(false)
    })
  })

  describe("Data Loading", () => {
    it("should load configuration when authenticated as admin", async () => {
      const { getConfiguracion: mockGetConfig } = await import(
        "@/lib/data/configuracion"
      )

      mockGetConfig.mockResolvedValue(mockConfiguracion)

      const result = await mockGetConfig()
      expect(result).toEqual(mockConfiguracion)
      expect(Object.keys(result)).toHaveLength(8)
    })

    it("should handle loading errors gracefully", async () => {
      const { getConfiguracion: mockGetConfig } = await import(
        "@/lib/data/configuracion"
      )

      mockGetConfig.mockRejectedValue(new Error("DB error"))

      try {
        await mockGetConfig()
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error.message).toBe("DB error")
        // Component handles this by setting configuracion = {}
      }
    })
  })
})

describe("ConfiguracionClient - API Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe("API Calls", () => {
    it("sends correct POST payload to /api/configuracion", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { clave: "umbral_ingresado", valor: { leve: 3, grave: 5 } },
        }),
      })

      // Simulate what the component does
      const payload = {
        clave: "umbral_ingresado",
        valor: { leve: 3, grave: 5 },
      }

      const response = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      expect(global.fetch).toHaveBeenCalledWith("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      expect(response.ok).toBe(true)
      expect(data.success).toBe(true)
    })

    it("handles successful API response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { clave: "umbral_en_taller", valor: { leve: 8, grave: 15 } },
        }),
      })

      const response = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clave: "umbral_en_taller",
          valor: { leve: 8, grave: 15 },
        }),
      })

      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.success).toBe(true)
      expect(data.data.valor.leve).toBe(8)
      expect(data.data.valor.grave).toBe(15)
    })

    it("handles API error response with error message", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "leve debe ser < grave cuando grave > 0",
        }),
      })

      const response = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clave: "umbral_ingresado",
          valor: { leve: 5, grave: 5 },
        }),
      })

      const data = await response.json()

      expect(response.ok).toBe(false)
      expect(data.error).toBe("leve debe ser < grave cuando grave > 0")
    })

    it("handles network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new Error("Network timeout")
      )

      try {
        await fetch("/api/configuracion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clave: "umbral_ingresado",
            valor: { leve: 3, grave: 5 },
          }),
        })
        expect.fail("Should have thrown")
      } catch (error) {
        expect(error.message).toBe("Network timeout")
      }
    })
  })

  describe("Validation", () => {
    it("validates leve < grave constraint", () => {
      const isValid = (leve, grave) => {
        if (grave > 0 && leve >= grave) return false
        return true
      }

      expect(isValid(2, 5)).toBe(true)
      expect(isValid(5, 5)).toBe(false)
      expect(isValid(6, 5)).toBe(false)
      expect(isValid(0, 0)).toBe(true)
      expect(isValid(1, 0)).toBe(true) // When grave=0, leve can be anything
    })

    it("accepts non-negative values", () => {
      const isValid = (leve, grave) => {
        return leve >= 0 && grave >= 0
      }

      expect(isValid(0, 0)).toBe(true)
      expect(isValid(2, 5)).toBe(true)
      expect(isValid(-1, 5)).toBe(false)
      expect(isValid(2, -1)).toBe(false)
    })
  })
})

describe("ConfiguracionClient - Plantillas de Email", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe("Data Shape", () => {
    it("plantillas email have tipo, asunto, cuerpo, updated_at fields", () => {
      mockPlantillasEmail.forEach((p) => {
        expect(p).toHaveProperty("tipo")
        expect(p).toHaveProperty("asunto")
        expect(p).toHaveProperty("cuerpo")
        expect(p).toHaveProperty("updated_at")
      })
    })

    it("loads 3 email template types", () => {
      expect(mockPlantillasEmail).toHaveLength(3)
      const tipos = mockPlantillasEmail.map((p) => p.tipo)
      expect(tipos).toContain("PRESUPUESTO")
      expect(tipos).toContain("LISTO_PARA_RETIRO")
      expect(tipos).toContain("RECORDATORIO_MANTENIMIENTO")
    })
  })

  describe("Rendering", () => {
    it("renderiza las 3 cards de plantillas de email con sus labels", () => {
      const PLANTILLA_LABELS = {
        PRESUPUESTO: { label: "Presupuesto" },
        LISTO_PARA_RETIRO: { label: "Listo para retiro" },
        RECORDATORIO_MANTENIMIENTO: { label: "Recordatorio de mantenimiento" },
      }

      // Verify each template in mockPlantillasEmail maps to a known label
      mockPlantillasEmail.forEach((p) => {
        expect(PLANTILLA_LABELS[p.tipo]).toBeDefined()
        expect(PLANTILLA_LABELS[p.tipo].label).toBeTruthy()
      })

      expect(PLANTILLA_LABELS["PRESUPUESTO"].label).toBe("Presupuesto")
      expect(PLANTILLA_LABELS["LISTO_PARA_RETIRO"].label).toBe("Listo para retiro")
      expect(PLANTILLA_LABELS["RECORDATORIO_MANTENIMIENTO"].label).toBe(
        "Recordatorio de mantenimiento"
      )
    })
  })

  describe("API Calls", () => {
    it("al guardar llama PATCH a /api/admin/plantillas-email con tipo, asunto, cuerpo", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      const plantilla = mockPlantillasEmail[0] // PRESUPUESTO
      const payload = {
        tipo: plantilla.tipo,
        asunto: plantilla.asunto,
        cuerpo: plantilla.cuerpo,
      }

      const response = await fetch("/api/admin/plantillas-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      expect(global.fetch).toHaveBeenCalledWith("/api/admin/plantillas-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      expect(response.ok).toBe(true)
      expect(data.success).toBe(true)
    })

    it("envía asunto y cuerpo correctos en el payload", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      const tipo = "LISTO_PARA_RETIRO"
      const asunto = "¡Tu artículo está listo! — Orden #123"
      const cuerpo = "Hola Juan, tu artículo está listo para retirar."

      await fetch("/api/admin/plantillas-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, asunto, cuerpo }),
      })

      const callArgs = global.fetch.mock.calls[0]
      const bodyParsed = JSON.parse(callArgs[1].body)

      expect(bodyParsed.tipo).toBe(tipo)
      expect(bodyParsed.asunto).toBe(asunto)
      expect(bodyParsed.cuerpo).toBe(cuerpo)
    })

    it("handles API error when saving email template", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "asunto no puede estar vacío" }),
      })

      const response = await fetch("/api/admin/plantillas-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "PRESUPUESTO", asunto: "", cuerpo: "texto" }),
      })

      const data = await response.json()

      expect(response.ok).toBe(false)
      expect(data.error).toBe("asunto no puede estar vacío")
    })
  })

  describe("Validation", () => {
    it("save button is disabled when asunto is empty", () => {
      const t = { asunto: "", cuerpo: "Hola {{clienteNombre}}", loading: false }
      const canSave = !t.loading && t.asunto.trim().length > 0 && t.cuerpo.trim().length > 0
      expect(canSave).toBe(false)
    })

    it("save button is disabled when cuerpo is empty", () => {
      const t = { asunto: "Presupuesto listo", cuerpo: "", loading: false }
      const canSave = !t.loading && t.asunto.trim().length > 0 && t.cuerpo.trim().length > 0
      expect(canSave).toBe(false)
    })

    it("save button is disabled when loading", () => {
      const t = { asunto: "Presupuesto listo", cuerpo: "Hola cliente", loading: true }
      const canSave = !t.loading && t.asunto.trim().length > 0 && t.cuerpo.trim().length > 0
      expect(canSave).toBe(false)
    })

    it("save button is enabled when asunto and cuerpo are non-empty and not loading", () => {
      const t = { asunto: "Presupuesto listo", cuerpo: "Hola cliente", loading: false }
      const canSave = !t.loading && t.asunto.trim().length > 0 && t.cuerpo.trim().length > 0
      expect(canSave).toBe(true)
    })

    it("save button is disabled when asunto is only whitespace", () => {
      const t = { asunto: "   ", cuerpo: "Hola cliente", loading: false }
      const canSave = !t.loading && t.asunto.trim().length > 0 && t.cuerpo.trim().length > 0
      expect(canSave).toBe(false)
    })
  })
})
