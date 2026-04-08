import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function authorizeUser(credentials) {
  if (!credentials?.username || !credentials?.password) return null

  const { data: usuario } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, username, password_hash, role")
    .eq("username", credentials.username)
    .single()

  if (!usuario) return null

  const valid = await bcrypt.compare(String(credentials.password), usuario.password_hash)
  if (!valid) return null

  return { id: usuario.id, name: usuario.username, role: usuario.role }
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
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role
      session.user.username = token.username
      session.user.id = token.id
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
