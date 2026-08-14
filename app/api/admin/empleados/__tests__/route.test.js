import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST, DELETE } from "../route.js"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }))

describe("GET /api/admin/empleados", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when not admin", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "employee" } })

    const response = await GET(new Request("http://localhost/api/admin/empleados"))
    expect(response.status).toBe(403)
  })

  it("lists empleados ordered by nombre", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const mockData = [{ id: "e1", sucursal_id: "s1", nombre: "Ana", created_at: "2026-01-01" }]
    getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    })

    const response = await GET(new Request("http://localhost/api/admin/empleados"))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.empleados).toEqual(mockData)
  })
})

describe("POST /api/admin/empleados", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when not admin", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue(null)

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", nombre: "Ana" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(403)
  })

  it("rejects empty nombre", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", nombre: "   " }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("rejects invalid sucursal_id format", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "not-a-uuid", nombre: "Ana" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it("creates an empleado", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const insertFn = vi.fn().mockResolvedValue({ error: null })
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertFn }) })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "11111111-1111-1111-1111-111111111111", nombre: "Ana" }),
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(insertFn).toHaveBeenCalledWith({ sucursal_id: "11111111-1111-1111-1111-111111111111", nombre: "Ana" })
  })
})

describe("DELETE /api/admin/empleados", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 403 when not admin", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "employee" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "DELETE",
      body: JSON.stringify({ empleadoId: "e1" }),
    })
    const response = await DELETE(request)
    expect(response.status).toBe(403)
  })

  it("requires empleadoId", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "DELETE",
      body: JSON.stringify({}),
    })
    const response = await DELETE(request)
    expect(response.status).toBe(400)
  })

  it("deletes the empleado", async () => {
    const { auth } = await import("@/auth")
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    auth.mockResolvedValue({ user: { role: "admin" } })

    const eqFn = vi.fn().mockResolvedValue({ error: null })
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFn })
    getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteFn }) })

    const request = new Request("http://localhost/api/admin/empleados", {
      method: "DELETE",
      body: JSON.stringify({ empleadoId: "e1" }),
    })
    const response = await DELETE(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(deleteFn).toHaveBeenCalled()
    expect(eqFn).toHaveBeenCalledWith("id", "e1")
  })
})
