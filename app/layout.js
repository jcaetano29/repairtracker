import "./globals.css"
import { SessionProvider } from "next-auth/react"

export const metadata = {
  title: "RepairTrack — Gestión de Reparaciones",
  description: "Sistema de gestión para relojerías y joyerías",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
