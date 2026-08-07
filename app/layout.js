import "./globals.css"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/ThemeProvider"
import { ThemeToggle } from "@/components/ThemeToggle"

export const metadata = {
  title: "Gestión de Reparaciones",
  description: "Sistema de gestión para relojerías y joyerías",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

const ANTI_FLASH_SCRIPT = `
  try {
    var stored = localStorage.getItem('rt-theme');
    if (stored === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
`;

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
      </head>
      <body>
        <SessionProvider>
          <ThemeProvider>
            <ThemeToggle />
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
