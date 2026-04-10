import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST } from "../route.js"

// Mock next-auth
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

// Mock Supabase admin
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}))

describe("GET /api/configuracion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns all configuration values with correct structure", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    const mockData = [
      { clave: "umbral_ingresado", valor: { leve: 2, grave: 5 } },
      { clave: "umbral_en_taller", valor: { leve: 7, grave: 14 } },
    ]

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    })

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      configuracion: {
        umbral_ingresado: { leve: 2, grave: 5 },
        umbral_en_taller: { leve: 7, grave: 14 },
      },
    })
  })

  it("returns all 8 initial thresholds", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    const mockData = [
      { clave: "umbral_ingresado", valor: { leve: 2, grave: 5 } },
      { clave: "umbral_en_taller", valor: { leve: 7, grave: 14 } },
      { clave: "umbral_esperando_aprobacion", valor: { leve: 1, grave: 3 } },
      { clave: "umbral_rechazado", valor: { leve: 0, grave: 0 } },
      { clave: "umbral_en_reparacion", valor: { leve: 3, grave: 7 } },
      { clave: "umbral_listo_en_taller", valor: { leve: 1, grave: 3 } },
      { clave: "umbral_listo_para_retiro", valor: { leve: 3, grave: 7 } },
      { clave: "umbral_entregado", valor: { leve: 0, grave: 0 } },
    ]

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    })

    const response = await GET()
    const json = await response.json()

    expect(Object.keys(json.configuracion)).toHaveLength(8)
    expect(json.configuracion.umbral_ingresado).toEqual({ leve: 2, grave: 5 })
  })

  it("handles database errors gracefully", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" }
        }),
      }),
    })

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("Database error")
  })
})

describe("POST /api/configuracion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requires admin role and returns 403 for other roles", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "mecanic", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 2, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe("Forbidden")
  })

  it("requires admin role and returns 403 when no session", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue(null)

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 2, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(403)
  })

  it("validates that both clave and valor are present", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({ clave: "umbral_ingresado" }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("valor")
  })

  it("validates that valor has leve and grave properties", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 2 } // missing grave
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("grave")
  })

  it("validates that leve and grave are numeric values", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: "dos", grave: 5 } // leve is string
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("numeric")
  })

  it("validates that leve and grave are non-negative", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: -1, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("non-negative")
  })

  it("validates that leve < grave when grave > 0", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 10, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("less than grave")
  })

  it("allows leve = grave = 0 (no delay thresholds)", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  clave: "umbral_rechazado",
                  valor: { leve: 0, grave: 0 },
                  actualizado_en: "2026-04-10T00:00:00Z",
                  actualizado_por: "user-123",
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_rechazado",
        valor: { leve: 0, grave: 0 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
  })

  it("returns 404 for non-existent clave", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116" }, // No rows returned
              }),
            }),
          }),
        }),
      }),
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "non_existent",
        valor: { leve: 2, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toContain("not found")
  })

  it("saves actualizado_en timestamp on update", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const mockUpdateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              clave: "umbral_ingresado",
              valor: { leve: 2, grave: 5 },
              actualizado_en: "2026-04-10T12:00:00Z",
              actualizado_por: "user-123",
            },
            error: null,
          }),
        }),
      }),
    })

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: mockUpdateFn }),
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 2, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    // Verify the update was called with actualizado_en
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        valor: { leve: 2, grave: 5 },
        actualizado_en: expect.any(String),
      })
    )

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.actualizado_en).toBeDefined()
  })

  it("saves actualizado_por user id on update", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-456" },
    })

    const mockUpdateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              clave: "umbral_ingresado",
              valor: { leve: 3, grave: 6 },
              actualizado_en: "2026-04-10T12:00:00Z",
              actualizado_por: "user-456",
            },
            error: null,
          }),
        }),
      }),
    })

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: mockUpdateFn }),
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 3, grave: 6 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    // Verify the update was called with actualizado_por
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        actualizado_por: "user-456",
      })
    )

    expect(json.data.actualizado_por).toBe("user-456")
  })

  it("returns success response with updated data", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  clave: "umbral_ingresado",
                  valor: { leve: 2, grave: 5 },
                  actualizado_en: "2026-04-10T00:00:00Z",
                  actualizado_por: "user-123",
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 2, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual({
      clave: "umbral_ingresado",
      valor: { leve: 2, grave: 5 },
      actualizado_en: "2026-04-10T00:00:00Z",
      actualizado_por: "user-123",
    })
  })

  it("handles invalid JSON in request body", async () => {
    const { auth } = await import("@/auth")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: "not valid json",
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe("Invalid JSON")
  })

  it("handles database errors during update", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")

    auth.mockResolvedValue({
      user: { role: "admin", id: "user-123" },
    })

    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "Database error" },
              }),
            }),
          }),
        }),
      }),
    })

    const request = new Request("http://localhost/api/configuracion", {
      method: "POST",
      body: JSON.stringify({
        clave: "umbral_ingresado",
        valor: { leve: 2, grave: 5 }
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("Database error")
  })
})
