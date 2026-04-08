import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Always public
  if (pathname.startsWith("/seguimiento")) return NextResponse.next()

  // Login page: redirect authenticated users to dashboard
  if (pathname.startsWith("/login")) {
    if (session) return NextResponse.redirect(new URL("/", req.url))
    return NextResponse.next()
  }

  // All other routes require auth
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  // Admin routes require dueno role
  if (pathname.startsWith("/admin") && (!session.user || session.user.role !== "dueno")) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)"],
}
