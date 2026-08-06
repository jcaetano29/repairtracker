import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getConfiguracion } from "@/lib/data/configuracion"
import ConfiguracionClient from "./configuracion-client"

export default async function ConfiguracionPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard")
  }

  let configuracion = {}
  try {
    configuracion = await getConfiguracion()
  } catch (error) {
    console.error("[ConfiguracionPage] Error loading configuration:", error)
  }

  return (
    <div>
      <ConfiguracionClient configuracion={configuracion} />
    </div>
  )
}
