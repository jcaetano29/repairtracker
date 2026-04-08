import { describe, it, expect, vi, beforeEach } from "vitest"

// Must be hoisted before imports
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({})),
}))

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => config),
}))

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}))

describe("authorizeUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when username is missing", async () => {
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "", password: "pass" })
    expect(result).toBeNull()
  })

  it("returns null when password is missing", async () => {
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "admin", password: "" })
    expect(result).toBeNull()
  })

  it("returns null when user not found in DB", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    getSupabaseAdmin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }),
    })
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "unknown", password: "pass" })
    expect(result).toBeNull()
  })

  it("returns null when password is wrong", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    const bcrypt = await import("bcryptjs")
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: { id: "uuid-1", username: "admin", password_hash: "$2b$10$hash", role: "dueno" },
            }),
          }),
        }),
      }),
    })
    bcrypt.default.compare.mockResolvedValue(false)
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "admin", password: "wrong" })
    expect(result).toBeNull()
  })

  it("returns user object for valid credentials", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin")
    const bcrypt = await import("bcryptjs")
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: { id: "uuid-1", username: "admin", password_hash: "$2b$10$hash", role: "dueno" },
            }),
          }),
        }),
      }),
    })
    bcrypt.default.compare.mockResolvedValue(true)
    const { authorizeUser } = await import("../auth.js")
    const result = await authorizeUser({ username: "admin", password: "admin123" })
    expect(result).toEqual({ id: "uuid-1", name: "admin", role: "dueno" })
  })
})
