import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function authorizeUser(credentials) {
  if (!credentials?.username || !credentials?.password) return null

  const { data: usuario, error } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, username, password_hash, role, sucursal_id")
    .eq("username", credentials.username)
    .single()

  // PGRST116 = no rows found (expected), other errors should throw
  if (error && error.code !== "PGRST116") throw new Error(error.message)

  // Always run bcrypt to prevent username enumeration via timing
  if (!usuario) {
    await bcrypt.compare(String(credentials.password), "$2b$10$dummyhashfortimingprotect")
    return null
  }

  const valid = await bcrypt.compare(String(credentials.password), usuario.password_hash)
  if (!valid) return null

  return { id: usuario.id, name: usuario.username, role: usuario.role, sucursal_id: usuario.sucursal_id ?? null }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: authorizeUser,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.username = user.name
        token.id = user.id
        token.sucursal_id = user.sucursal_id ?? null
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role
      session.user.username = token.username
      session.user.id = token.id
      session.user.sucursal_id = token.sucursal_id ?? null
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
