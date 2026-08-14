import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route.js"

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/data", () => ({
  getOrdenes: vi.fn(),
  crearOrden: vi.fn(),
}))

describe("POST /api/ordenes", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 without session", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue(null)

    const request = new Request("http://localhost/api/ordenes", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", empleado_id: "e1" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it("returns 400 when empleado_id is missing", async () => {
    const { auth } = await import("@/auth")
    auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })

    const request = new Request("http://localhost/api/ordenes", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1" }),
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("empleado")
  })

  it("creates the orden when empleado_id is present", async () => {
    const { auth } = await import("@/auth")
    const { crearOrden } = await import("@/lib/data")
    auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    crearOrden.mockResolvedValue({ id: "o1" })

    const request = new Request("http://localhost/api/ordenes", {
      method: "POST",
      body: JSON.stringify({ sucursal_id: "s1", empleado_id: "e1" }),
    })
    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.orden).toEqual({ id: "o1" })
  })
})
