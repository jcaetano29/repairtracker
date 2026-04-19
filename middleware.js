import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Always public
  if (pathname.startsWith("/seguimiento")) return NextResponse.next()

  // Login page: redirect authenticated users based on role
  if (pathname.startsWith("/login")) {
    if (session) {
      const dest = session.user?.role === "cadete" ? "/cadete" : "/"
      return NextResponse.redirect(new URL(dest, req.url))
    }
    return NextResponse.next()
  }

  // All other routes require auth
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  const role = session.user?.role

  // Cadete can only access /cadete and /api/cadete/*
  if (role === "cadete") {
    if (pathname === "/cadete" || pathname.startsWith("/api/cadete")) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL("/cadete", req.url))
  }

  // Non-cadete users cannot access /cadete
  if (pathname === "/cadete") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Admin routes require admin role
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)"],
}
