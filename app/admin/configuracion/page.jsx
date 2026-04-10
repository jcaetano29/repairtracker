import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getConfiguracion } from "@/lib/data/configuracion"
import ConfiguracionClient from "./configuracion-client"

/**
 * ConfiguracionPage - Server Component
 *
 * Handles:
 * 1. Auth check - redirect to /login if no session
 * 2. Role check - redirect to /dashboard if role ≠ 'dueño'
 * 3. Load configuration data
 * 4. Render admin configuration UI
 */
export default async function ConfiguracionPage() {
  // Check authentication
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  // Check role authorization
  if (session.user.role !== "admin") {
    redirect("/dashboard")
  }

  // Load configuration
  let configuracion = {}
  try {
    configuracion = await getConfiguracion()
  } catch (error) {
    console.error("[ConfiguracionPage] Error loading configuration:", error)
    // Continue with empty config if fetch fails - client will handle reload
  }

  return (
    <div>
      <ConfiguracionClient configuracion={configuracion} />
    </div>
  )
}
